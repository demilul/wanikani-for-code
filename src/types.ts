// Shared types mirroring the shapes we consume from the WaniKani API v2.
// https://docs.api.wanikani.com/

export type SubjectType = "radical" | "kanji" | "vocabulary" | "kana_vocabulary";

export interface WkMeaning {
  meaning: string;
  primary: boolean;
  accepted_answer: boolean;
}

export interface WkReading {
  reading: string;
  primary: boolean;
  accepted_answer: boolean;
  type?: "onyomi" | "kunyomi" | "nanori";
}

/** The subset of a subject's `data` we cache and need to grade reviews. */
export interface Subject {
  id: number;
  type: SubjectType;
  characters: string | null;
  slug: string;
  level: number;
  meanings: WkMeaning[];
  auxiliary_meanings: { meaning: string; type: "whitelist" | "blacklist" }[];
  readings: WkReading[];
  meaning_mnemonic?: string;
  reading_mnemonic?: string;
  document_url: string;
}

export interface SummaryLessonOrReview {
  available_at: string | null;
  subject_ids: number[];
}

export interface Summary {
  lessons: SummaryLessonOrReview[];
  reviews: SummaryLessonOrReview[];
  next_reviews_at: string | null;
}

export interface Assignment {
  id: number;
  subject_id: number;
  subject_type: SubjectType;
  srs_stage: number;
}

/** Which parts of a review question a subject requires. Radicals: meaning only. */
export function questionKindsFor(type: SubjectType): ("meaning" | "reading")[] {
  return type === "radical" ? ["meaning"] : ["meaning", "reading"];
}
