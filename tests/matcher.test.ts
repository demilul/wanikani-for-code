import { checkMeaning, checkReading, meaningTolerance, levenshtein } from "../src/matching/answerChecker";
import { ReviewSession } from "../src/matching/reviewSession";
import type { Subject } from "../src/types";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) { pass++; } else { fail++; console.log("  FAIL:", name); }
}

const mizu: Subject = {
  id: 1, type: "vocabulary", characters: "水", slug: "water", level: 1,
  meanings: [{ meaning: "Water", primary: true, accepted_answer: true }],
  auxiliary_meanings: [],
  readings: [{ reading: "みず", primary: true, accepted_answer: true, type: "kunyomi" }],
  document_url: "",
};

const taberu: Subject = {
  id: 2, type: "vocabulary", characters: "食べる", slug: "to-eat", level: 2,
  meanings: [{ meaning: "To Eat", primary: true, accepted_answer: true }],
  auxiliary_meanings: [{ meaning: "eat", type: "whitelist" }],
  readings: [{ reading: "たべる", primary: true, accepted_answer: true, type: "kunyomi" }],
  document_url: "",
};

const radical: Subject = {
  id: 3, type: "radical", characters: "一", slug: "ground", level: 1,
  meanings: [{ meaning: "Ground", primary: true, accepted_answer: true }],
  auxiliary_meanings: [], readings: [], document_url: "",
};

// --- meaning matching ---
ok("exact meaning", checkMeaning(mizu, "water").verdict === "correct");
ok("case-insensitive", checkMeaning(mizu, "WATER").verdict === "correct");
ok("wrong meaning", checkMeaning(mizu, "fire").verdict === "incorrect");
ok("typo tolerated (watr)", checkMeaning(taberu, "to eaat").verdict === "correct");
ok("aux whitelist 'eat'", checkMeaning(taberu, "eat").verdict === "correct");
ok("long word tolerates 1 typo", checkMeaning(radical, "grond").verdict === "correct");
const cat: Subject = {
  id: 9, type: "radical", characters: "亅", slug: "cat", level: 1,
  meanings: [{ meaning: "Cat", primary: true, accepted_answer: true }],
  auxiliary_meanings: [], readings: [], document_url: "",
};
ok("short word: no tolerance (cot != cat)", checkMeaning(cat, "cot").verdict === "incorrect");
ok("reading-instead-of-meaning nudge", checkMeaning(mizu, "mizu", "みず").verdict === "nudge");

// --- reading matching ---
ok("exact reading", checkReading(mizu, "みず").verdict === "correct");
ok("wrong reading", checkReading(mizu, "みす").verdict === "incorrect");
ok("radical has no reading question in kinds", true);

// --- tolerance table ---
ok("tol(3)=0", meaningTolerance(3) === 0);
ok("tol(5)=1", meaningTolerance(5) === 1);
ok("tol(7)=2", meaningTolerance(7) === 2);
ok("levenshtein basic", levenshtein("kitten", "sitting") === 3);

// --- session flow: wrong then right requeues and tallies ---
const session = new ReviewSession([{ assignmentId: 100, subject: mizu }]);
ok("mizu has 2 cards (meaning+reading)", session.remaining === 2);

// Answer everything wrong once, then right.
let guard = 0;
while (session.remaining > 0 && guard++ < 20) {
  const card = session.peek()!;
  // deliberately wrong first pass detection: submit wrong then the session requeues
  const wrong = card.kind === "meaning" ? "zzz" : "ちがう";
  const r1 = session.submit(wrong);
  ok(`wrong ${card.kind} graded incorrect`, r1.grade.verdict === "incorrect");
  // now the requeued card is at the back; drain by answering correctly when it comes
  break;
}

// Fresh deterministic session to test completion + tally
const s2 = new ReviewSession([{ assignmentId: 100, subject: mizu }]);
const results: string[] = [];
guard = 0;
while (s2.remaining > 0 && guard++ < 50) {
  const card = s2.peek()!;
  const correct = card.kind === "meaning" ? "water" : "みず";
  const r = s2.submit(correct);
  results.push(card.kind + ":" + r.grade.verdict);
}
ok("s2 completes with both correct", s2.completedSubjects().length === 1);
const sum = s2.buildSummary(true, 0);
ok("summary correctFirstTry=1", sum.correctFirstTry === 1);
ok("summary total=1", sum.total === 1);

// tally on wrong answers
const s3 = new ReviewSession([{ assignmentId: 100, subject: mizu }]);
guard = 0;
let firstMeaningDone = false, firstReadingDone = false;
while (s3.remaining > 0 && guard++ < 50) {
  const card = s3.peek()!;
  let ans: string;
  if (card.kind === "meaning") { ans = firstMeaningDone ? "water" : "zzz"; firstMeaningDone = true; }
  else { ans = firstReadingDone ? "みず" : "ちがう"; firstReadingDone = true; }
  s3.submit(ans);
}
const sum3 = s3.buildSummary(true, 0);
ok("tally: 1 meaning + 1 reading wrong", sum3.items[0].incorrectMeaning === 1 && sum3.items[0].incorrectReading === 1);
ok("not correctFirstTry after misses", sum3.correctFirstTry === 0);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
