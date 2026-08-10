import type { Assignment, Subject, Summary } from "../types";

const BASE = "https://api.wanikani.com/v2";
const REVISION = "20170710";

export class WaniKaniError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "WaniKaniError";
  }
}

interface Collection<T> {
  data: T[];
  pages: { next_url: string | null };
  total_count: number;
}

interface Resource<T> {
  id: number;
  object: string;
  data: T;
}

/**
 * Thin wrapper over the WaniKani v2 REST API. The token is resolved lazily on
 * every call so the client stays valid across token changes without rebuilding.
 * Honours the 60 requests/minute limit by backing off on HTTP 429.
 */
export class WaniKaniClient {
  constructor(private readonly tokenProvider: () => Promise<string | undefined>) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await this.tokenProvider();
    if (!token) {
      throw new WaniKaniError("No WaniKani API token configured.");
    }

    const url = path.startsWith("http") ? path : `${BASE}${path}`;
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          "Wanikani-Revision": REVISION,
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
        },
      });

      if (res.status === 429) {
        const reset = Number(res.headers.get("RateLimit-Reset"));
        const waitMs = reset ? Math.max(0, reset * 1000 - Date.now()) : 2000 * (attempt + 1);
        await new Promise((r) => setTimeout(r, Math.min(waitMs, 60_000) + 250));
        continue;
      }
      if (res.status === 401) {
        throw new WaniKaniError("WaniKani rejected the API token (401).", 401);
      }
      if (!res.ok) {
        throw new WaniKaniError(`WaniKani request failed: ${res.status} ${res.statusText}`, res.status);
      }
      // 204 No Content is possible on some writes.
      if (res.status === 204) {
        return undefined as T;
      }
      return (await res.json()) as T;
    }
    throw new WaniKaniError("WaniKani rate limit: gave up after repeated 429s.", 429);
  }

  /** Walk every page of a collection, yielding the flattened resource list. */
  private async collectAll<T>(firstPath: string): Promise<Resource<T>[]> {
    const all: Resource<T>[] = [];
    let next: string | null = firstPath;
    while (next) {
      const page: Collection<Resource<T>> = await this.request(next);
      all.push(...page.data);
      next = page.pages.next_url;
    }
    return all;
  }

  async getSummary(): Promise<Summary> {
    const res = await this.request<Resource<Summary>>("/summary");
    return res.data;
  }

  /** Assignments immediately available for review right now. */
  async getReviewAssignments(): Promise<Assignment[]> {
    const res = await this.collectAll<Assignment>("/assignments?immediately_available_for_review");
    return res.map((r) => ({ ...r.data, id: r.id }));
  }

  /** Assignments immediately available as lessons right now. */
  async getLessonAssignments(): Promise<Assignment[]> {
    const res = await this.collectAll<Assignment>("/assignments?immediately_available_for_lessons");
    return res.map((r) => ({ ...r.data, id: r.id }));
  }

  /**
   * Fetch subjects, optionally only those changed since `updatedAfter` (ISO
   * string) for cheap incremental syncs. Returns flattened Subject records.
   */
  async getSubjects(updatedAfter?: string): Promise<Subject[]> {
    const path = updatedAfter
      ? `/subjects?updated_after=${encodeURIComponent(updatedAfter)}`
      : "/subjects";
    const res = await this.collectAll<Omit<Subject, "id" | "type">>(path);
    return res.map((r) => ({
      ...(r.data as Omit<Subject, "id" | "type">),
      id: r.id,
      type: (r.object as Subject["type"]),
    }));
  }

  /** Count started, non-hidden assignments by SRS stage, for the distribution view. */
  async getSrsDistribution(): Promise<Map<number, number>> {
    const res = await this.collectAll<Assignment>("/assignments?started=true&hidden=false");
    const dist = new Map<number, number>();
    for (const r of res) {
      const stage = r.data.srs_stage;
      dist.set(stage, (dist.get(stage) ?? 0) + 1);
    }
    return dist;
  }

  /** Submit a completed review. Advances the real SRS server-side. */
  async createReview(assignmentId: number, incorrectMeaning: number, incorrectReading: number): Promise<void> {
    await this.request("/reviews", {
      method: "POST",
      body: JSON.stringify({
        review: {
          assignment_id: assignmentId,
          incorrect_meaning_answers: incorrectMeaning,
          incorrect_reading_answers: incorrectReading,
        },
      }),
    });
  }

  /** Start a lesson: moves an assignment from the lesson queue to the review queue. */
  async startAssignment(assignmentId: number): Promise<void> {
    await this.request(`/assignments/${assignmentId}/start`, { method: "PUT", body: "{}" });
  }
}
