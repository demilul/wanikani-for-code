// Runs inside the dashboard webview (bundled to media/dashboard.js as an IIFE).
// Pure presentation of the view-model built host-side by dashboard/aggregate.ts.
// All bar/progress dimensions are set via the CSSOM (element.style) because the
// CSP forbids inline style attributes in HTML strings.

interface VsCodeApi {
  postMessage(msg: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;
const vscode = acquireVsCodeApi();

type SubjectType = "radical" | "kanji" | "vocabulary" | "kana_vocabulary";

interface ForecastBucket { at: number; hourLabel: string; count: number; cumulative: number; }
interface SpreadRow { stage: string; radical: number; kanji: number; vocabulary: number; total: number; }
interface RecentEntry { subjectId: number; characters: string; type: SubjectType; at: number; }
interface CriticalItem { subjectId: number; characters: string; type: SubjectType; percentageCorrect: number; }

interface DashboardViewModel {
  username: string;
  reviewsNow: { count: number };
  forecast: { maxCount: number; buckets: ForecastBucket[] };
  lessonsToday: { count: number };
  itemSpread: {
    rows: SpreadRow[];
    columnTotals: { radical: number; kanji: number; vocabulary: number; total: number };
    grandTotal: number;
  };
  levelProgress: {
    level: number;
    kanji: { total: number; passed: number };
    radicals: { total: number; passed: number };
    kanjiToLevelUp: number;
    percent: number;
  };
  recent: { unlocked: RecentEntry[]; burned: RecentEntry[] };
  critical: { items: CriticalItem[] };
}

interface DashboardMsg { type: "dashboard"; vm: DashboardViewModel; }
interface ErrorMsg { type: "error"; message: string; }
type InboundMsg = DashboardMsg | ErrorMsg;

const dash = document.getElementById("dash") as HTMLDivElement;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function typeLabel(t: SubjectType): string {
  return t === "kana_vocabulary" ? "vocabulary" : t;
}

/** A card shell with a title and optional header action button. */
function card(title: string): { root: HTMLDivElement; body: HTMLDivElement; header: HTMLDivElement } {
  const root = el("div", "card");
  const header = el("div", "card-header");
  header.appendChild(el("h2", "card-title", title));
  root.appendChild(header);
  const body = el("div", "card-body");
  root.appendChild(body);
  return { root, body, header };
}

function actionButton(label: string, msgType: string): HTMLButtonElement {
  const btn = el("button", "action-btn", label);
  btn.addEventListener("click", () => vscode.postMessage({ type: msgType }));
  return btn;
}

function renderReviews(vm: DashboardViewModel): HTMLElement {
  const c = card("Reviews");
  c.body.appendChild(el("div", "big-number", String(vm.reviewsNow.count)));
  c.body.appendChild(el("div", "muted", vm.reviewsNow.count === 1 ? "review available now" : "reviews available now"));
  if (vm.reviewsNow.count > 0) c.body.appendChild(actionButton("Start Reviews", "startReviews"));
  return c.root;
}

function renderLessons(vm: DashboardViewModel): HTMLElement {
  const c = card("Lessons");
  c.body.appendChild(el("div", "big-number", String(vm.lessonsToday.count)));
  c.body.appendChild(el("div", "muted", vm.lessonsToday.count === 1 ? "lesson available now" : "lessons available now"));
  if (vm.lessonsToday.count > 0) c.body.appendChild(actionButton("Start Lessons", "startLessons"));
  return c.root;
}

function renderForecast(vm: DashboardViewModel): HTMLElement {
  const c = card("Next 24 hours");
  const f = vm.forecast;
  if (f.buckets.length === 0) {
    c.body.appendChild(el("div", "muted", "No upcoming reviews in the next 24 hours."));
    return c.root;
  }
  const bars = el("div", "bars");
  const max = Math.max(1, f.maxCount);
  for (const b of f.buckets) {
    const col = el("div", "bar-col");
    col.title = `${b.count} review${b.count === 1 ? "" : "s"} · ${b.cumulative} total`;
    const track = el("div", "bar-track");
    const fill = el("div", "bar-fill");
    fill.style.height = `${Math.round((b.count / max) * 100)}%`;
    track.appendChild(fill);
    col.appendChild(track);
    col.appendChild(el("div", "bar-count", b.count > 0 ? String(b.count) : ""));
    col.appendChild(el("div", "bar-label", b.hourLabel));
    bars.appendChild(col);
  }
  c.body.appendChild(bars);
  return c.root;
}

function renderSpread(vm: DashboardViewModel): HTMLElement {
  const c = card("Item spread");
  const s = vm.itemSpread;
  const table = el("table", "spread");
  const thead = el("thead");
  const hr = el("tr");
  ["Stage", "Radical", "Kanji", "Vocabulary", "Total"].forEach((h, i) => {
    hr.appendChild(el("th", i === 0 ? "col-stage" : "col-num", h));
  });
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = el("tbody");
  for (const row of s.rows) {
    const tr = el("tr");
    tr.appendChild(el("td", "col-stage", row.stage));
    tr.appendChild(el("td", "col-num", String(row.radical)));
    tr.appendChild(el("td", "col-num", String(row.kanji)));
    tr.appendChild(el("td", "col-num", String(row.vocabulary)));
    tr.appendChild(el("td", "col-num total", String(row.total)));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  const tfoot = el("tfoot");
  const ft = el("tr");
  ft.appendChild(el("td", "col-stage", "Total"));
  ft.appendChild(el("td", "col-num", String(s.columnTotals.radical)));
  ft.appendChild(el("td", "col-num", String(s.columnTotals.kanji)));
  ft.appendChild(el("td", "col-num", String(s.columnTotals.vocabulary)));
  ft.appendChild(el("td", "col-num total", String(s.grandTotal)));
  tfoot.appendChild(ft);
  table.appendChild(tfoot);

  const wrap = el("div", "spread-wrap");
  wrap.appendChild(table);
  c.body.appendChild(wrap);
  return c.root;
}

function renderLevel(vm: DashboardViewModel): HTMLElement {
  const c = card(`Level ${vm.levelProgress.level}`);
  const lp = vm.levelProgress;

  const bar = el("div", "progress-bar");
  const fill = el("div", "progress-fill");
  fill.style.width = `${lp.percent}%`;
  bar.appendChild(fill);
  c.body.appendChild(bar);
  c.body.appendChild(el("div", "muted", `${lp.percent}% of kanji passed toward level up`));

  const stats = el("div", "stat-row");
  const addStat = (label: string, value: string) => {
    const s = el("div", "stat");
    s.appendChild(el("div", "stat-value", value));
    s.appendChild(el("div", "stat-label", label));
    stats.appendChild(s);
  };
  addStat("Radicals", `${lp.radicals.passed}/${lp.radicals.total}`);
  addStat("Kanji", `${lp.kanji.passed}/${lp.kanji.total}`);
  addStat("Kanji to level up", String(lp.kanjiToLevelUp));
  c.body.appendChild(stats);
  return c.root;
}

function entryList(entries: RecentEntry[], emptyText: string): HTMLElement {
  if (entries.length === 0) return el("div", "muted", emptyText);
  const ul = el("ul", "item-list");
  for (const e of entries.slice(0, 12)) {
    const li = el("li", `item ${e.type}`);
    li.appendChild(el("span", "item-chars", e.characters));
    li.appendChild(el("span", "item-type", typeLabel(e.type)));
    ul.appendChild(li);
  }
  return ul;
}

function renderRecent(vm: DashboardViewModel): HTMLElement {
  const c = card("Recent activity");
  c.body.appendChild(el("h3", "sub-title", "Unlocked (30d)"));
  c.body.appendChild(entryList(vm.recent.unlocked, "Nothing unlocked in the last 30 days."));
  c.body.appendChild(el("h3", "sub-title", "Burned (30d)"));
  c.body.appendChild(entryList(vm.recent.burned, "Nothing burned in the last 30 days."));
  return c.root;
}

function renderCritical(vm: DashboardViewModel): HTMLElement {
  const c = card("Critical items");
  const items = vm.critical.items;
  if (items.length === 0) {
    c.body.appendChild(el("div", "muted", "No items below 75% correct. Nice."));
    return c.root;
  }
  const ul = el("ul", "item-list");
  for (const it of items.slice(0, 20)) {
    const li = el("li", `item ${it.type}`);
    li.appendChild(el("span", "item-chars", it.characters));
    li.appendChild(el("span", "item-type", typeLabel(it.type)));
    li.appendChild(el("span", "item-pct", `${it.percentageCorrect}%`));
    ul.appendChild(li);
  }
  c.body.appendChild(ul);
  return c.root;
}

function renderDashboard(vm: DashboardViewModel): void {
  dash.innerHTML = "";

  const head = el("div", "dash-head");
  const title = el("div", "dash-title");
  title.appendChild(el("span", "dash-user", vm.username || "WaniKani"));
  title.appendChild(el("span", "dash-sub", `Level ${vm.levelProgress.level}`));
  head.appendChild(title);
  head.appendChild(actionButton("Refresh", "refresh"));
  dash.appendChild(head);

  const grid = el("div", "grid");
  grid.appendChild(renderReviews(vm));
  grid.appendChild(renderLessons(vm));
  grid.appendChild(renderLevel(vm));
  grid.appendChild(renderForecast(vm));
  grid.appendChild(renderSpread(vm));
  grid.appendChild(renderRecent(vm));
  grid.appendChild(renderCritical(vm));
  dash.appendChild(grid);
}

function renderError(message: string): void {
  dash.innerHTML = "";
  const box = el("div", "error-box");
  box.appendChild(el("div", "error-title", "Couldn't load the dashboard"));
  box.appendChild(el("div", "muted", message));
  box.appendChild(actionButton("Retry", "refresh"));
  dash.appendChild(box);
}

function renderLoading(): void {
  dash.innerHTML = "";
  dash.appendChild(el("div", "muted loading", "Loading dashboard…"));
}

window.addEventListener("message", (event: MessageEvent<InboundMsg>) => {
  const msg = event.data;
  switch (msg.type) {
    case "dashboard":
      renderDashboard(msg.vm);
      break;
    case "error":
      renderError(msg.message);
      break;
  }
});

renderLoading();
vscode.postMessage({ type: "ready" });
