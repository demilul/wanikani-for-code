// Runs inside the study webview (bundled to media/review.js as an IIFE with
// wanakana). Handles presentation + kana input; all grading happens host-side.
import { bind, toKana } from "wanakana";

interface VsCodeApi {
  postMessage(msg: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;
const vscode = acquireVsCodeApi();

type Verdict = "correct" | "incorrect" | "nudge";
type SubjectType = "radical" | "kanji" | "vocabulary" | "kana_vocabulary";

interface ItemInfo {
  characters: string;
  subjectType: SubjectType;
  meanings: string[];
  readings: { reading: string; type?: string; primary: boolean }[];
  meaningMnemonic?: string;
  readingMnemonic?: string;
  documentUrl: string;
}
interface ConfigMsg { type: "config"; mode: "review" | "lesson"; practiceMode: boolean; total: number; }
interface TeachMsg { type: "teach"; index: number; total: number; info: ItemInfo; }
interface QuestionMsg {
  type: "question";
  kind: "meaning" | "reading";
  characters: string;
  subjectType: SubjectType;
  remaining: number;
  total: number;
}
interface ResultMsg { type: "result"; verdict: Verdict; message?: string; acceptedAnswers: string[]; info?: ItemInfo; }
interface DoneMsg {
  type: "done";
  kind: "review" | "lesson";
  summary: {
    total: number;
    correctFirstTry: number;
    submitted: number;
    practiceMode: boolean;
    items: { characters: string; incorrectMeaning: number; incorrectReading: number }[];
  };
}
type InboundMsg = ConfigMsg | TeachMsg | QuestionMsg | ResultMsg | DoneMsg;

const stage = document.getElementById("stage") as HTMLDivElement;
const banner = document.getElementById("banner") as HTMLDivElement;

let mode: "review" | "lesson" = "review";
let practiceMode = false;
let awaitingAdvance = false;
let infoOpen = false;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

// WaniKani mnemonics embed <radical>/<kanji>/<vocabulary>/<reading>/<meaning>/<ja>
// tags. Escape everything, then re-expose those specific tags as styled spans.
const MNEMONIC_TAGS = ["radical", "kanji", "vocabulary", "reading", "meaning", "ja"];
function renderMnemonic(text: string): string {
  let html = escapeHtml(text);
  for (const tag of MNEMONIC_TAGS) {
    html = html
      .replace(new RegExp(`&lt;${tag}&gt;`, "g"), `<span class="mnem mnem-${tag}">`)
      .replace(new RegExp(`&lt;/${tag}&gt;`, "g"), "</span>");
  }
  return html;
}

function typeLabel(t: SubjectType): string {
  return t === "kana_vocabulary" ? "vocabulary" : t;
}

/** Builds the shared item-info block (readings, meanings, mnemonics). */
function infoBlock(info: ItemInfo): HTMLElement {
  const box = el("div", "info");

  const meanings = el("div", "info-row");
  meanings.appendChild(el("span", "info-label", "Meaning"));
  meanings.appendChild(el("span", "info-value", info.meanings.join(", ")));
  box.appendChild(meanings);

  if (info.readings.length) {
    const readings = el("div", "info-row");
    readings.appendChild(el("span", "info-label", "Reading"));
    const val = el("span", "info-value");
    val.textContent = info.readings
      .map((r) => (r.type ? `${r.reading} (${r.type})` : r.reading))
      .join(", ");
    readings.appendChild(val);
    box.appendChild(readings);
  }

  if (info.meaningMnemonic) {
    box.appendChild(el("div", "mnem-label", "Meaning mnemonic"));
    const m = el("div", "mnem-body");
    m.innerHTML = renderMnemonic(info.meaningMnemonic);
    box.appendChild(m);
  }
  if (info.readingMnemonic) {
    box.appendChild(el("div", "mnem-label", "Reading mnemonic"));
    const m = el("div", "mnem-body");
    m.innerHTML = renderMnemonic(info.readingMnemonic);
    box.appendChild(m);
  }
  return box;
}

function renderTeach(msg: TeachMsg): void {
  awaitingAdvance = false;
  stage.innerHTML = "";
  stage.appendChild(el("div", "progress", `New item ${msg.index + 1} / ${msg.total}`));

  const card = el("div", `card teach ${msg.info.subjectType}`);
  card.appendChild(el("div", "characters", msg.info.characters));
  card.appendChild(el("div", "prompt", typeLabel(msg.info.subjectType)));
  card.appendChild(infoBlock(msg.info));

  const last = msg.index + 1 === msg.total;
  card.appendChild(el("div", "feedback", last ? "Press Enter to start the quiz →" : "Press Enter for the next item →"));
  stage.appendChild(card);
  setTimeout(() => stage.focus(), 0);
}

function renderQuestion(q: QuestionMsg): void {
  awaitingAdvance = false;
  infoOpen = false;
  stage.innerHTML = "";
  stage.appendChild(el("div", "progress", `${q.total} subjects · ${q.remaining} cards left`));

  const card = el("div", `card ${q.subjectType} ${q.kind}`);
  card.appendChild(el("div", "characters", q.characters));
  card.appendChild(el("div", "prompt", q.kind === "meaning" ? "Meaning" : "Reading"));

  const input = el("input", "answer");
  input.type = "text";
  input.autocapitalize = "off";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = q.kind === "reading" ? "答え (reading)" : "answer (meaning)";
  card.appendChild(input);
  card.appendChild(el("div", "feedback"));
  stage.appendChild(card);

  if (q.kind === "reading") bind(input, { IMEMode: "toHiragana" });

  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      if (awaitingAdvance) {
        vscode.postMessage({ type: "advance" });
        return;
      }
      const value = input.value.trim();
      if (!value) return;
      const readingCandidate = q.kind === "meaning" ? toKana(value) : value;
      vscode.postMessage({ type: "answer", value, readingCandidate });
    } else if (awaitingAdvance && (ev.key === "i" || ev.key === "I")) {
      ev.preventDefault();
      toggleInfo();
    }
  });
  setTimeout(() => input.focus(), 0);
}

function toggleInfo(): void {
  const existing = stage.querySelector(".info");
  if (existing) {
    existing.remove();
    infoOpen = false;
  } else if (pendingInfo) {
    stage.querySelector(".card")?.appendChild(infoBlock(pendingInfo));
    infoOpen = true;
  }
}

let pendingInfo: ItemInfo | undefined;

function renderResult(r: ResultMsg): void {
  const card = stage.querySelector(".card");
  const feedback = stage.querySelector(".feedback") as HTMLDivElement | null;
  const input = stage.querySelector(".answer") as HTMLInputElement | null;
  if (!card || !feedback || !input) return;

  card.classList.remove("correct", "incorrect", "nudge");
  card.classList.add(r.verdict);

  if (r.verdict === "nudge") {
    feedback.textContent = r.message ?? "Try again.";
    input.select();
    return;
  }

  awaitingAdvance = true;
  pendingInfo = r.info;
  input.readOnly = true;

  if (r.verdict === "correct") {
    feedback.innerHTML = "Correct — <kbd>Enter</kbd> to continue · <kbd>I</kbd> for info";
  } else {
    feedback.innerHTML = `Answer: <strong>${escapeHtml(r.acceptedAnswers.join(", "))}</strong> — <kbd>Enter</kbd> to continue`;
  }

  // Reinforce: auto-open item info when the answer was wrong.
  if (r.verdict === "incorrect" && r.info && !infoOpen) {
    card.appendChild(infoBlock(r.info));
    infoOpen = true;
  }
}

function renderDone(kind: "review" | "lesson", d: DoneMsg["summary"]): void {
  stage.innerHTML = "";
  banner.textContent = "";
  const box = el("div", "summary");
  box.appendChild(el("h1", undefined, kind === "lesson" ? "Lessons complete" : "Session complete"));
  box.appendChild(el("p", undefined, `${d.correctFirstTry} / ${d.total} correct on the first try.`));

  let note: string;
  if (d.practiceMode) note = "Practice mode — nothing was submitted to WaniKani.";
  else if (kind === "lesson") note = `${d.submitted} lesson${d.submitted === 1 ? "" : "s"} started on WaniKani.`;
  else note = `${d.submitted} review${d.submitted === 1 ? "" : "s"} submitted to WaniKani.`;
  box.appendChild(el("p", "submit-note", note));

  const missed = d.items.filter((i) => i.incorrectMeaning + i.incorrectReading > 0);
  if (missed.length) {
    box.appendChild(el("h2", undefined, "Needed another look"));
    const list = el("ul", "missed");
    for (const m of missed) {
      list.appendChild(
        el("li", undefined, `${m.characters}  (meaning ×${m.incorrectMeaning}, reading ×${m.incorrectReading})`),
      );
    }
    box.appendChild(list);
  }

  const close = el("button", "close-btn", "Close");
  close.addEventListener("click", () => vscode.postMessage({ type: "close" }));
  box.appendChild(close);
  stage.appendChild(box);
}

function renderBanner(): void {
  if (practiceMode) {
    banner.textContent = "PRACTICE MODE — nothing is submitted";
    banner.className = "practice";
  } else {
    banner.textContent = mode === "lesson" ? "LIVE — lessons will start on your account" : "LIVE — reviews count toward your SRS";
    banner.className = "live";
  }
}

// A teach card advances on Enter even though it has no input to focus.
document.addEventListener("keydown", (ev) => {
  if (ev.key !== "Enter") return;
  const teaching = stage.querySelector(".card.teach");
  if (teaching) {
    ev.preventDefault();
    vscode.postMessage({ type: "teachNext" });
  }
});

window.addEventListener("message", (event: MessageEvent<InboundMsg>) => {
  const msg = event.data;
  switch (msg.type) {
    case "config":
      mode = msg.mode;
      practiceMode = msg.practiceMode;
      renderBanner();
      break;
    case "teach":
      renderTeach(msg);
      break;
    case "question":
      renderQuestion(msg);
      break;
    case "result":
      renderResult(msg);
      break;
    case "done":
      renderDone(msg.kind, msg.summary);
      break;
  }
});

vscode.postMessage({ type: "ready" });
