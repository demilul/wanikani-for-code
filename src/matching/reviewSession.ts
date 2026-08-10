import type { Subject } from "../types";
import { questionKindsFor } from "../types";
import { checkMeaning, checkReading, type Grade } from "./answerChecker";

export type QuestionKind = "meaning" | "reading";

export interface Card {
  subjectId: number;
  kind: QuestionKind;
}

export interface SubjectProgress {
  assignmentId: number;
  subject: Subject;
  pending: Set<QuestionKind>;
  incorrectMeaning: number;
  incorrectReading: number;
}

export interface SubmitResult {
  grade: Grade;
  /** The subject that was just graded (for reinforcement / item info). */
  subject: Subject;
  /** Accepted answers to show the user when they got it wrong. */
  acceptedAnswers: string[];
  /** True once every question for this subject has been answered correctly. */
  subjectComplete: boolean;
}

export interface SessionSummary {
  total: number;
  correctFirstTry: number;
  submitted: number; // reviews POSTed (0 in practice mode)
  practiceMode: boolean;
  items: { characters: string; incorrectMeaning: number; incorrectReading: number }[];
}

/**
 * Drives one review batch. Cards (subject × question-kind) are dequeued from the
 * front; a wrong answer requeues the card to the back and tallies an incorrect,
 * mirroring WaniKani's "you keep seeing it until you get it" behaviour.
 */
export class ReviewSession {
  private queue: Card[] = [];
  private readonly progress = new Map<number, SubjectProgress>();

  constructor(items: { assignmentId: number; subject: Subject }[]) {
    for (const { assignmentId, subject } of items) {
      const kinds = questionKindsFor(subject.type);
      this.progress.set(subject.id, {
        assignmentId,
        subject,
        pending: new Set(kinds),
        incorrectMeaning: 0,
        incorrectReading: 0,
      });
      for (const kind of kinds) this.queue.push({ subjectId: subject.id, kind });
    }
    this.shuffle();
  }

  private shuffle(): void {
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
  }

  get remaining(): number {
    return this.queue.length;
  }

  get totalSubjects(): number {
    return this.progress.size;
  }

  peek(): Card | undefined {
    return this.queue[0];
  }

  getSubject(subjectId: number): Subject {
    const p = this.progress.get(subjectId);
    if (!p) throw new Error(`Unknown subject ${subjectId}`);
    return p.subject;
  }

  /** Grade the current card. `readingCandidate` supports the reading-vs-meaning nudge. */
  submit(input: string, readingCandidate?: string): SubmitResult {
    const card = this.queue[0];
    if (!card) throw new Error("No active card.");
    const p = this.progress.get(card.subjectId)!;

    const grade =
      card.kind === "meaning"
        ? checkMeaning(p.subject, input, readingCandidate)
        : checkReading(p.subject, input);

    if (grade.verdict === "nudge") {
      return { grade, subject: p.subject, acceptedAnswers: this.acceptedFor(p, card.kind), subjectComplete: false };
    }

    // Consume the card.
    this.queue.shift();
    if (grade.verdict === "correct") {
      p.pending.delete(card.kind);
    } else {
      if (card.kind === "meaning") p.incorrectMeaning++;
      else p.incorrectReading++;
      this.queue.push(card); // see it again later
    }

    return {
      grade,
      subject: p.subject,
      acceptedAnswers: this.acceptedFor(p, card.kind),
      subjectComplete: p.pending.size === 0,
    };
  }

  private acceptedFor(p: SubjectProgress, kind: QuestionKind): string[] {
    if (kind === "meaning") {
      return p.subject.meanings.filter((m) => m.accepted_answer).map((m) => m.meaning);
    }
    return p.subject.readings.filter((r) => r.accepted_answer).map((r) => r.reading);
  }

  /** Subjects finished (all questions answered correctly), for submission. */
  completedSubjects(): SubjectProgress[] {
    return [...this.progress.values()].filter((p) => p.pending.size === 0);
  }

  buildSummary(practiceMode: boolean, submitted: number): SessionSummary {
    const all = [...this.progress.values()];
    return {
      total: all.length,
      correctFirstTry: all.filter((p) => p.incorrectMeaning === 0 && p.incorrectReading === 0).length,
      submitted,
      practiceMode,
      items: all.map((p) => ({
        characters: p.subject.characters ?? p.subject.slug,
        incorrectMeaning: p.incorrectMeaning,
        incorrectReading: p.incorrectReading,
      })),
    };
  }
}
