// Pure dashboard aggregation. NO `vscode` import — this module is bundled and
// unit-tested in plain Node (see tests/aggregate.test.ts). It folds the raw
// WaniKani API shapes (summary, assignments, review statistics, user) into the
// serialisable view-model the dashboard webview renders.
import type { Assignment, ReviewStatistic, Subject, SubjectType, Summary, User } from "../types";

/** SRS-stage buckets, mirroring the grouping used by the activity-bar tree. */
const SRS_BUCKETS: [string, number[]][] = [
  ["Apprentice", [1, 2, 3, 4]],
  ["Guru", [5, 6]],
  ["Master", [7]],
  ["Enlightened", [8]],
  ["Burned", [9]],
];

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_WINDOW_MS = 30 * DAY_MS;
const CRITICAL_THRESHOLD = 75;
const LEVEL_UP_RATIO = 0.9;

export interface ReviewsNowVM {
  count: number;
}

export interface ForecastBucket {
  at: number;
  hourLabel: string;
  count: number;
  cumulative: number;
}
export interface ForecastVM {
  maxCount: number;
  buckets: ForecastBucket[];
}

export interface LessonsTodayVM {
  count: number;
}

export interface SpreadRow {
  stage: string;
  radical: number;
  kanji: number;
  vocabulary: number;
  total: number;
}
export interface ItemSpreadVM {
  rows: SpreadRow[];
  columnTotals: { radical: number; kanji: number; vocabulary: number; total: number };
  grandTotal: number;
}

export interface LevelProgressVM {
  level: number;
  kanji: { total: number; passed: number };
  radicals: { total: number; passed: number };
  kanjiToLevelUp: number;
  percent: number;
}

export interface RecentEntry {
  subjectId: number;
  characters: string;
  type: SubjectType;
  at: number;
}
export interface RecentVM {
  unlocked: RecentEntry[];
  burned: RecentEntry[];
}

export interface CriticalItem {
  subjectId: number;
  characters: string;
  type: SubjectType;
  percentageCorrect: number;
}
export interface CriticalVM {
  items: CriticalItem[];
}

export interface DashboardViewModel {
  username: string;
  reviewsNow: ReviewsNowVM;
  forecast: ForecastVM;
  lessonsToday: LessonsTodayVM;
  itemSpread: ItemSpreadVM;
  levelProgress: LevelProgressVM;
  recent: RecentVM;
  critical: CriticalVM;
}

export interface DashboardInput {
  summary: Summary;
  assignments: Assignment[];
  reviewStats: ReviewStatistic[];
  user: User;
  getSubject: (id: number) => Subject | undefined;
  now?: number;
}

/** The SRS bucket a stage belongs to, or undefined for stage 0 (unstarted). */
function bucketForStage(stage: number): string | undefined {
  for (const [name, stages] of SRS_BUCKETS) {
    if (stages.includes(stage)) return name;
  }
  return undefined;
}

/** Fold kana_vocabulary into vocabulary; radical/kanji stay as-is. */
function spreadColumn(type: SubjectType): "radical" | "kanji" | "vocabulary" {
  if (type === "radical") return "radical";
  if (type === "kanji") return "kanji";
  return "vocabulary";
}

/** Best display string for a subject: its characters, else slug, else #id. */
function displayCharacters(getSubject: (id: number) => Subject | undefined, id: number): string {
  const s = getSubject(id);
  if (s) return s.characters ?? s.slug;
  return `#${id}`;
}

function parseTs(value: string | null): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

function hourLabel(at: number): string {
  const d = new Date(at);
  const h = d.getHours();
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${suffix}`;
}

function buildReviewsNow(summary: Summary, now: number): ReviewsNowVM {
  const count = summary.reviews
    .filter((r) => {
      const at = parseTs(r.available_at);
      return at !== null && at <= now;
    })
    .reduce((n, r) => n + r.subject_ids.length, 0);
  return { count };
}

function buildForecast(summary: Summary, now: number, startCount: number): ForecastVM {
  const horizon = now + DAY_MS;
  const future = summary.reviews
    .map((r) => ({ at: parseTs(r.available_at), count: r.subject_ids.length }))
    .filter((r): r is { at: number; count: number } => r.at !== null && r.at > now && r.at <= horizon)
    .sort((a, b) => a.at - b.at);

  let cumulative = startCount;
  let maxCount = 0;
  const buckets: ForecastBucket[] = future.map((r) => {
    cumulative += r.count;
    if (r.count > maxCount) maxCount = r.count;
    return { at: r.at, hourLabel: hourLabel(r.at), count: r.count, cumulative };
  });
  return { maxCount, buckets };
}

function buildLessonsToday(summary: Summary, now: number): LessonsTodayVM {
  const count = summary.lessons
    .filter((l) => {
      const at = parseTs(l.available_at);
      return at !== null && at <= now;
    })
    .reduce((n, l) => n + l.subject_ids.length, 0);
  return { count };
}

function buildItemSpread(assignments: Assignment[]): ItemSpreadVM {
  const rowMap = new Map<string, SpreadRow>();
  for (const [name] of SRS_BUCKETS) {
    rowMap.set(name, { stage: name, radical: 0, kanji: 0, vocabulary: 0, total: 0 });
  }
  const columnTotals = { radical: 0, kanji: 0, vocabulary: 0, total: 0 };

  for (const a of assignments) {
    if (!a.started_at) continue; // only started items belong in the spread
    const bucket = bucketForStage(a.srs_stage);
    if (!bucket) continue;
    const row = rowMap.get(bucket)!;
    const col = spreadColumn(a.subject_type);
    row[col]++;
    row.total++;
    columnTotals[col]++;
    columnTotals.total++;
  }

  const rows = SRS_BUCKETS.map(([name]) => rowMap.get(name)!);
  return { rows, columnTotals, grandTotal: columnTotals.total };
}

function buildLevelProgress(
  assignments: Assignment[],
  user: User,
  getSubject: (id: number) => Subject | undefined,
): LevelProgressVM {
  const kanji = { total: 0, passed: 0 };
  const radicals = { total: 0, passed: 0 };

  for (const a of assignments) {
    if (a.subject_type !== "kanji" && a.subject_type !== "radical") continue;
    const subject = getSubject(a.subject_id);
    if (!subject || subject.level !== user.level) continue;
    const bucket = a.subject_type === "kanji" ? kanji : radicals;
    bucket.total++;
    if (a.srs_stage >= 5) bucket.passed++;
  }

  const required = Math.ceil(LEVEL_UP_RATIO * kanji.total);
  const kanjiToLevelUp = Math.max(0, required - kanji.passed);
  const percent = required > 0 ? Math.min(100, Math.round((kanji.passed / required) * 100)) : 0;

  return { level: user.level, kanji, radicals, kanjiToLevelUp, percent };
}

function buildRecent(
  assignments: Assignment[],
  now: number,
  getSubject: (id: number) => Subject | undefined,
): RecentVM {
  const cutoff = now - RECENT_WINDOW_MS;
  const unlocked: RecentEntry[] = [];
  const burned: RecentEntry[] = [];

  for (const a of assignments) {
    const entry = (at: number): RecentEntry => ({
      subjectId: a.subject_id,
      characters: displayCharacters(getSubject, a.subject_id),
      type: a.subject_type,
      at,
    });
    const u = parseTs(a.unlocked_at);
    if (u !== null && u >= cutoff && u <= now) unlocked.push(entry(u));
    const b = parseTs(a.burned_at);
    if (b !== null && b >= cutoff && b <= now) burned.push(entry(b));
  }

  unlocked.sort((x, y) => y.at - x.at);
  burned.sort((x, y) => y.at - x.at);
  return { unlocked, burned };
}

function buildCritical(
  reviewStats: ReviewStatistic[],
  getSubject: (id: number) => Subject | undefined,
): CriticalVM {
  const items = reviewStats
    .filter((s) => s.percentage_correct < CRITICAL_THRESHOLD)
    .map((s) => ({
      subjectId: s.subject_id,
      characters: displayCharacters(getSubject, s.subject_id),
      type: s.subject_type,
      percentageCorrect: s.percentage_correct,
    }))
    .sort((a, b) => a.percentageCorrect - b.percentageCorrect);
  return { items };
}

/** Fold the raw API payloads into the dashboard view-model. Pure + deterministic
 * given `now` (defaults to Date.now()). */
export function buildDashboard(input: DashboardInput): DashboardViewModel {
  const now = input.now ?? Date.now();
  const reviewsNow = buildReviewsNow(input.summary, now);
  return {
    username: input.user.username,
    reviewsNow,
    forecast: buildForecast(input.summary, now, reviewsNow.count),
    lessonsToday: buildLessonsToday(input.summary, now),
    itemSpread: buildItemSpread(input.assignments),
    levelProgress: buildLevelProgress(input.assignments, input.user, input.getSubject),
    recent: buildRecent(input.assignments, now, input.getSubject),
    critical: buildCritical(input.reviewStats, input.getSubject),
  };
}
