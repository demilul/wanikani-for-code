import type { Subject } from "../types";

export type Grade =
  | { verdict: "correct" }
  | { verdict: "incorrect" }
  // The answer isn't wrong per se, but WaniKani would nudge instead of grading.
  | { verdict: "nudge"; message: string };

/** Levenshtein edit distance (iterative, O(n*m) space-optimised). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * Typo tolerance that scales with answer length, approximating WaniKani's
 * "your answer was a bit off" behaviour. Short answers demand exactness.
 */
export function meaningTolerance(len: number): number {
  if (len <= 3) return 0;
  if (len <= 5) return 1;
  if (len <= 7) return 2;
  return Math.min(2 + Math.floor((len - 7) / 7), 4);
}

function normalizeMeaning(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[.,!?;:'"`~()[\]{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function acceptedMeanings(subject: Subject): string[] {
  const primary = subject.meanings.filter((m) => m.accepted_answer).map((m) => m.meaning);
  const aux = subject.auxiliary_meanings
    .filter((m) => m.type === "whitelist")
    .map((m) => m.meaning);
  return [...primary, ...aux];
}

function blacklistedMeanings(subject: Subject): string[] {
  return subject.auxiliary_meanings.filter((m) => m.type === "blacklist").map((m) => m.meaning);
}

/** All accepted readings (already kana in the WaniKani data). */
function acceptedReadings(subject: Subject): string[] {
  return subject.readings.filter((r) => r.accepted_answer).map((r) => r.reading);
}

/**
 * Grade a meaning answer. `input` is the raw user string; `readingCandidate`
 * is the input transliterated to kana by the webview (used for the "you typed
 * the reading" nudge — the meaning field isn't kana-bound).
 */
export function checkMeaning(subject: Subject, input: string, readingCandidate?: string): Grade {
  const answer = normalizeMeaning(input);
  if (!answer) return { verdict: "incorrect" };

  if (blacklistedMeanings(subject).some((m) => normalizeMeaning(m) === answer)) {
    return { verdict: "incorrect" };
  }

  const accepted = acceptedMeanings(subject).map(normalizeMeaning);
  if (accepted.includes(answer)) return { verdict: "correct" };

  // Typo tolerance against the closest accepted meaning.
  if (accepted.length > 0) {
    const closest = accepted.reduce((a, b) => (levenshtein(answer, a) <= levenshtein(answer, b) ? a : b));
    if (levenshtein(answer, closest) <= meaningTolerance(closest.length)) {
      return { verdict: "correct" };
    }
  }

  // Nudge: user typed the reading where a meaning was expected.
  if (readingCandidate && subject.type !== "radical") {
    if (acceptedReadings(subject).includes(readingCandidate.trim().normalize("NFKC"))) {
      return { verdict: "nudge", message: "That's the reading — we need the meaning." };
    }
  }
  return { verdict: "incorrect" };
}

/** Grade a reading answer. Readings must match a valid kana reading exactly. */
export function checkReading(subject: Subject, kanaInput: string): Grade {
  const answer = kanaInput.trim().normalize("NFKC");
  if (!answer) return { verdict: "incorrect" };
  if (acceptedReadings(subject).includes(answer)) return { verdict: "correct" };

  // Nudge: user typed a non-accepted but existing reading (e.g. wrong on/kun).
  const allReadings = subject.readings.map((r) => r.reading);
  if (allReadings.includes(answer)) {
    return { verdict: "nudge", message: "WaniKani wants a different reading here." };
  }
  return { verdict: "incorrect" };
}
