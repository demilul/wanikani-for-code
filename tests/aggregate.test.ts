import { buildDashboard } from "../src/dashboard/aggregate";
import type { Assignment, ReviewStatistic, Subject, Summary, User } from "../src/types";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) { pass++; } else { fail++; console.log("  FAIL:", name); }
}

const NOW = Date.parse("2026-08-11T12:00:00.000Z");
const HOUR = 3600_000;
const DAY = 24 * HOUR;

// --- Fixtures -------------------------------------------------------------

function subject(id: number, type: Subject["type"], level: number, characters: string | null): Subject {
  return {
    id, type, characters, slug: `slug-${id}`, level,
    meanings: [], auxiliary_meanings: [], readings: [], document_url: "",
  };
}

const subjects = new Map<number, Subject>([
  [1, subject(1, "radical", 5, "一")],
  [2, subject(2, "kanji", 5, "水")],
  [3, subject(3, "kanji", 5, "火")],
  [4, subject(4, "kanji", 5, null)],          // no characters -> falls back to slug
  [5, subject(5, "vocabulary", 5, "食べる")],
  [6, subject(6, "kana_vocabulary", 5, "ラーメン")],
  [7, subject(7, "kanji", 4, "木")],           // different level, excluded from level progress
]);
const getSubject = (id: number) => subjects.get(id);

function assignment(partial: Partial<Assignment> & { id: number; subject_id: number; subject_type: Assignment["subject_type"]; srs_stage: number }): Assignment {
  return {
    unlocked_at: null, started_at: null, passed_at: null,
    burned_at: null, available_at: null, resurrected_at: null,
    ...partial,
  };
}

const iso = (t: number) => new Date(t).toISOString();

const user: User = { level: 5, username: "dennis" };

// --- SRS bucketing (item spread) ------------------------------------------

const spreadAssignments: Assignment[] = [
  assignment({ id: 10, subject_id: 1, subject_type: "radical", srs_stage: 2, started_at: iso(NOW - DAY) }),      // Apprentice/radical
  assignment({ id: 11, subject_id: 2, subject_type: "kanji", srs_stage: 5, started_at: iso(NOW - DAY) }),        // Guru/kanji
  assignment({ id: 12, subject_id: 3, subject_type: "kanji", srs_stage: 9, started_at: iso(NOW - DAY) }),        // Burned/kanji
  assignment({ id: 13, subject_id: 5, subject_type: "vocabulary", srs_stage: 7, started_at: iso(NOW - DAY) }),   // Master/vocabulary
  assignment({ id: 14, subject_id: 6, subject_type: "kana_vocabulary", srs_stage: 2, started_at: iso(NOW - DAY) }), // Apprentice/vocab (folded)
  assignment({ id: 15, subject_id: 4, subject_type: "kanji", srs_stage: 0 }),                                    // not started -> excluded
];

const spreadVm = buildDashboard({
  summary: { lessons: [], reviews: [], next_reviews_at: null },
  assignments: spreadAssignments, reviewStats: [], user, getSubject, now: NOW,
}).itemSpread;

const app = spreadVm.rows.find((r) => r.stage === "Apprentice")!;
ok("Apprentice radical=1", app.radical === 1);
ok("Apprentice vocabulary folds kana_vocabulary (=1)", app.vocabulary === 1);
ok("Apprentice row total=2", app.total === 2);
ok("Guru kanji=1", spreadVm.rows.find((r) => r.stage === "Guru")!.kanji === 1);
ok("Master vocabulary=1", spreadVm.rows.find((r) => r.stage === "Master")!.vocabulary === 1);
ok("Burned kanji=1", spreadVm.rows.find((r) => r.stage === "Burned")!.kanji === 1);
ok("grandTotal excludes unstarted (=5)", spreadVm.grandTotal === 5);
ok("column total kanji=2", spreadVm.columnTotals.kanji === 2);
ok("column total vocabulary=2", spreadVm.columnTotals.vocabulary === 2);
ok("five stage rows always present", spreadVm.rows.length === 5);

// --- Level-up math (ceil(0.9 * totalKanji)) -------------------------------

// Level 5: 3 kanji at level 5 (ids 2,3,4), 2 passed (stage>=5). radical id1 at lvl5.
const levelAssignments: Assignment[] = [
  assignment({ id: 20, subject_id: 2, subject_type: "kanji", srs_stage: 5, started_at: iso(NOW) }),  // passed
  assignment({ id: 21, subject_id: 3, subject_type: "kanji", srs_stage: 6, started_at: iso(NOW) }),  // passed
  assignment({ id: 22, subject_id: 4, subject_type: "kanji", srs_stage: 3, started_at: iso(NOW) }),  // not passed
  assignment({ id: 23, subject_id: 7, subject_type: "kanji", srs_stage: 8, started_at: iso(NOW) }),  // level 4 -> excluded
  assignment({ id: 24, subject_id: 1, subject_type: "radical", srs_stage: 5, started_at: iso(NOW) }), // radical passed
];
const lvl = buildDashboard({
  summary: { lessons: [], reviews: [], next_reviews_at: null },
  assignments: levelAssignments, reviewStats: [], user, getSubject, now: NOW,
}).levelProgress;
ok("level = user.level (5)", lvl.level === 5);
ok("kanji total at level = 3", lvl.kanji.total === 3);
ok("kanji passed = 2", lvl.kanji.passed === 2);
ok("radicals total = 1", lvl.radicals.total === 1);
ok("radicals passed = 1", lvl.radicals.passed === 1);
// required = ceil(0.9 * 3) = ceil(2.7) = 3; passed 2 -> need 1 more.
ok("kanjiToLevelUp = ceil(0.9*3) - 2 = 1", lvl.kanjiToLevelUp === 1);
ok("percent = round(2/3*100) = 67", lvl.percent === 67);

// zero-kanji guard
const lvlZero = buildDashboard({
  summary: { lessons: [], reviews: [], next_reviews_at: null },
  assignments: [], reviewStats: [], user, getSubject, now: NOW,
}).levelProgress;
ok("no kanji -> kanjiToLevelUp 0, percent 0", lvlZero.kanjiToLevelUp === 0 && lvlZero.percent === 0);

// --- 30-day window filtering (recent) -------------------------------------

const recentAssignments: Assignment[] = [
  assignment({ id: 30, subject_id: 1, subject_type: "radical", srs_stage: 2, unlocked_at: iso(NOW - 5 * DAY) }),   // in window
  assignment({ id: 31, subject_id: 2, subject_type: "kanji", srs_stage: 2, unlocked_at: iso(NOW - 40 * DAY) }),    // too old
  assignment({ id: 32, subject_id: 3, subject_type: "kanji", srs_stage: 2, unlocked_at: iso(NOW - 1 * DAY) }),     // in window (newer)
  assignment({ id: 33, subject_id: 5, subject_type: "vocabulary", srs_stage: 9, burned_at: iso(NOW - 2 * DAY) }),  // burned in window
  assignment({ id: 34, subject_id: 4, subject_type: "kanji", srs_stage: 9, burned_at: iso(NOW - 60 * DAY) }),      // burned too old
];
const recent = buildDashboard({
  summary: { lessons: [], reviews: [], next_reviews_at: null },
  assignments: recentAssignments, reviewStats: [], user, getSubject, now: NOW,
}).recent;
ok("recent unlocked keeps only 30d (=2)", recent.unlocked.length === 2);
ok("recent unlocked sorted desc (newest first)", recent.unlocked[0].subjectId === 3);
ok("recent burned keeps only 30d (=1)", recent.burned.length === 1);
ok("recent uses subject characters", recent.unlocked[0].characters === "火");

// --- Critical items (<75%) -------------------------------------------------

const stats: ReviewStatistic[] = [
  { id: 1, subject_id: 2, subject_type: "kanji", meaning_correct: 3, meaning_incorrect: 5, reading_correct: 0, reading_incorrect: 0, percentage_correct: 60 },
  { id: 2, subject_id: 3, subject_type: "kanji", meaning_correct: 9, meaning_incorrect: 1, reading_correct: 0, reading_incorrect: 0, percentage_correct: 90 }, // excluded
  { id: 3, subject_id: 4, subject_type: "kanji", meaning_correct: 2, meaning_incorrect: 8, reading_correct: 0, reading_incorrect: 0, percentage_correct: 40 },
  { id: 4, subject_id: 99, subject_type: "vocabulary", meaning_correct: 7, meaning_incorrect: 3, reading_correct: 0, reading_incorrect: 0, percentage_correct: 74 }, // uncached subject
];
const critical = buildDashboard({
  summary: { lessons: [], reviews: [], next_reviews_at: null },
  assignments: [], reviewStats: stats, user, getSubject, now: NOW,
}).critical;
ok("critical cut at <75 keeps 3", critical.items.length === 3);
ok("critical sorted ascending (worst first)", critical.items[0].percentageCorrect === 40);
ok("critical excludes >=75", !critical.items.some((i) => i.percentageCorrect >= 75));
ok("critical falls back to #id for uncached subject", critical.items.some((i) => i.characters === "#99"));

// --- Reviews-now / forecast / lessons-today -------------------------------

const summary: Summary = {
  reviews: [
    { available_at: iso(NOW - HOUR), subject_ids: [1, 2, 3] },   // due now (3)
    { available_at: iso(NOW + HOUR), subject_ids: [4, 5] },      // +1h (2)
    { available_at: iso(NOW + 2 * HOUR), subject_ids: [6] },     // +2h (1)
    { available_at: iso(NOW + 30 * HOUR), subject_ids: [7, 8] }, // beyond 24h -> excluded
    { available_at: null, subject_ids: [9] },                    // null -> ignored
  ],
  lessons: [
    { available_at: iso(NOW - HOUR), subject_ids: [10, 11] },    // available now (2)
    { available_at: iso(NOW + HOUR), subject_ids: [12] },        // future -> excluded
  ],
  next_reviews_at: iso(NOW + HOUR),
};
const vm = buildDashboard({ summary, assignments: [], reviewStats: [], user, getSubject, now: NOW });
ok("reviewsNow counts due (=3)", vm.reviewsNow.count === 3);
ok("forecast keeps only next-24h future buckets (=2)", vm.forecast.buckets.length === 2);
ok("forecast maxCount = 2", vm.forecast.maxCount === 2);
ok("forecast cumulative seeds from reviewsNow (3+2=5)", vm.forecast.buckets[0].cumulative === 5);
ok("forecast cumulative second bucket (5+1=6)", vm.forecast.buckets[1].cumulative === 6);
ok("lessonsToday counts available now (=2)", vm.lessonsToday.count === 2);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
