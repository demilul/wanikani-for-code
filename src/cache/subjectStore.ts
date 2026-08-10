import * as vscode from "vscode";
import type { WaniKaniClient } from "../api/wanikaniClient";
import type { Subject } from "../types";

interface CacheFile {
  version: 1;
  lastUpdated: string | null; // ISO timestamp of the newest sync
  subjects: Subject[];
}

const CACHE_NAME = "subjects.json";

/**
 * A full local cache of every WaniKani subject, persisted as a JSON file in the
 * extension's global storage. The first sync downloads everything; later syncs
 * use `updated_after` to fetch only what changed. Reviews grade against this
 * cache, so grading works offline once the cache is warm.
 */
export class SubjectStore {
  private map = new Map<number, Subject>();
  private lastUpdated: string | null = null;
  private loaded = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly client: WaniKaniClient,
  ) {}

  private get cacheUri(): vscode.Uri {
    return vscode.Uri.joinPath(this.context.globalStorageUri, CACHE_NAME);
  }

  get size(): number {
    return this.map.size;
  }

  get(id: number): Subject | undefined {
    return this.map.get(id);
  }

  getMany(ids: number[]): Subject[] {
    return ids.map((id) => this.map.get(id)).filter((s): s is Subject => !!s);
  }

  /** Load the cache from disk into memory. Safe to call repeatedly. */
  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const bytes = await vscode.workspace.fs.readFile(this.cacheUri);
      const parsed = JSON.parse(Buffer.from(bytes).toString("utf8")) as CacheFile;
      if (parsed.version === 1) {
        this.map = new Map(parsed.subjects.map((s) => [s.id, s]));
        this.lastUpdated = parsed.lastUpdated;
      }
    } catch {
      // No cache yet — first run.
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
    const file: CacheFile = {
      version: 1,
      lastUpdated: this.lastUpdated,
      subjects: [...this.map.values()],
    };
    await vscode.workspace.fs.writeFile(this.cacheUri, Buffer.from(JSON.stringify(file), "utf8"));
  }

  /**
   * Ensure the cache is populated and reasonably fresh. Shows progress on the
   * first (full) download. Returns the number of subjects added or updated.
   */
  async sync(progress?: vscode.Progress<{ message?: string }>): Promise<number> {
    await this.load();
    const incremental = this.map.size > 0 && this.lastUpdated;
    progress?.report({
      message: incremental ? "Checking for subject updates…" : "Downloading WaniKani subjects (one-time)…",
    });

    const fetched = await this.client.getSubjects(incremental ? this.lastUpdated! : undefined);
    for (const subject of fetched) {
      this.map.set(subject.id, subject);
    }
    this.lastUpdated = new Date().toISOString();
    await this.persist();
    return fetched.length;
  }
}
