// Runs inside the review webview (bundled to media/review.js as an IIFE with
// wanakana). Handles presentation + kana input; all grading happens host-side.
import { bind, toKana } from "wanakana";

interface VsCodeApi {
  postMessage(msg: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;
const vscode = acquireVsCodeApi();

type Verdict = "correct" | "incorrect" | "nudge";

interface QuestionMsg {
  type: "question";
  kind: "meaning" | "reading";
  characters: string;
  subjectType: "radical" | "kanji" | "vocabulary" | "kana_vocabulary";
  remaining: number;
  total: number;
}
interface ResultMsg {
  type: "result";
  verdict: Verdict;
  message?: string;
  acceptedAnswers: string[];
}
interface ConfigMsg {
  type: "config";
  practiceMode: boolean;
  total: number;
}
interface DoneMsg {
  type: "done";
  summary: {
    total: number;
    correctFirstTry: number;
    submitted: number;
    practiceMode: boolean;
    items: { characters: string; incorrectMeaning: number; incorrectReading: number }[];
  };
}
type InboundMsg = QuestionMsg | ResultMsg | ConfigMsg | DoneMsg;

const stage = document.getElementById("stage") as HTMLDivElement;
const banner = document.getElementById("banner") as HTMLDivElement;

let current: QuestionMsg | null = null;
let awaitingAdvance = false;
let practiceMode = true;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderQuestion(q: QuestionMsg): void {
  current = q;
  awaitingAdvance = false;
  stage.innerHTML = "";

  stage.appendChild(el("div", "progress", `${q.total} subjects · ${q.remaining} cards left`));

  const card = el("div", `card ${q.subjectType} ${q.kind}`);
  card.appendChild(el("div", "characters", q.characters));
  const promptText = q.kind === "meaning" ? "Meaning" : "Reading";
  card.appendChild(el("div", "prompt", promptText));

  const input = el("input", "answer");
  input.type = "text";
  input.autocapitalize = "off";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = q.kind === "reading" ? "答え (reading)" : "answer (meaning)";
  card.appendChild(input);

  const feedback = el("div", "feedback");
  card.appendChild(feedback);
  stage.appendChild(card);

  // Kana IME on reading fields; meaning fields stay latin.
  if (q.kind === "reading") {
    bind(input, { IMEMode: "toHiragana" });
  }

  input.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter") return;
    ev.preventDefault();
    if (awaitingAdvance) {
      vscode.postMessage({ type: "advance" });
      return;
    }
    const value = input.value.trim();
    if (!value) return;
    const readingCandidate = q.kind === "meaning" ? toKana(value) : value;
    vscode.postMessage({ type: "answer", value, readingCandidate });
  });

  setTimeout(() => input.focus(), 0);
}

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
  input.readOnly = true;
  if (r.verdict === "correct") {
    feedback.textContent = "Correct — press Enter to continue.";
  } else {
    const accepted = r.acceptedAnswers.join(", ");
    feedback.innerHTML = `Answer: <strong>${escapeHtml(accepted)}</strong> — press Enter to continue.`;
  }
}

function renderDone(d: DoneMsg["summary"]): void {
  current = null;
  stage.innerHTML = "";
  banner.textContent = "";
  const box = el("div", "summary");
  box.appendChild(el("h1", undefined, "Session complete"));
  box.appendChild(
    el("p", undefined, `${d.correctFirstTry} / ${d.total} correct on the first try.`),
  );
  box.appendChild(
    el(
      "p",
      "submit-note",
      d.practiceMode
        ? "Practice mode — nothing was submitted to WaniKani."
        : `${d.submitted} review${d.submitted === 1 ? "" : "s"} submitted to WaniKani.`,
    ),
  );

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
  banner.textContent = practiceMode ? "PRACTICE MODE — reviews are not submitted" : "LIVE — reviews count toward your SRS";
  banner.className = practiceMode ? "practice" : "live";
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

window.addEventListener("message", (event: MessageEvent<InboundMsg>) => {
  const msg = event.data;
  switch (msg.type) {
    case "config":
      practiceMode = msg.practiceMode;
      renderBanner();
      break;
    case "question":
      renderQuestion(msg);
      break;
    case "result":
      renderResult(msg);
      break;
    case "done":
      renderDone(msg.summary);
      break;
  }
});

vscode.postMessage({ type: "ready" });
