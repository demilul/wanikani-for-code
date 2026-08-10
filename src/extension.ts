import * as vscode from "vscode";
import { WaniKaniClient, WaniKaniError } from "./api/wanikaniClient";
import { SubjectStore } from "./cache/subjectStore";
import { getConfig, promptForToken, TokenStore } from "./config";
import { StudyPanel, type StudyItem } from "./ui/studyPanel";
import { StatusBar } from "./ui/statusBar";
import { DashboardTree } from "./ui/treeView";
import type { Assignment, Subject, Summary, SubjectType } from "./types";

export function activate(context: vscode.ExtensionContext): void {
  const tokens = new TokenStore(context.secrets);
  const client = new WaniKaniClient(() => tokens.get());
  const subjects = new SubjectStore(context, client);
  const statusBar = new StatusBar();
  const tree = new DashboardTree();

  context.subscriptions.push(
    statusBar,
    vscode.window.registerTreeDataProvider("wanikani.dashboard", tree),
  );

  let lastAvailableReviews = 0;
  let refreshTimer: NodeJS.Timeout | undefined;

  const countAvailableReviews = (summary: Summary): number => {
    const now = Date.now();
    return summary.reviews
      .filter((s) => (s.available_at ? Date.parse(s.available_at) : 0) <= now)
      .reduce((n, s) => n + s.subject_ids.length, 0);
  };

  async function refresh(showErrors = true): Promise<void> {
    if (!(await tokens.has())) {
      statusBar.showNeedsToken();
      tree.update(null);
      return;
    }
    statusBar.showLoading();
    try {
      const summary = await client.getSummary();
      statusBar.render(summary);
      tree.update(summary);

      // Best-effort background enrichment (subjects cache + SRS distribution).
      void subjects.sync().catch(() => undefined);
      void client
        .getSrsDistribution()
        .then((dist) => tree.update(summary, dist))
        .catch(() => undefined);

      const available = countAvailableReviews(summary);
      if (getConfig().notifyOnDue && available > lastAvailableReviews && lastAvailableReviews > 0) {
        const pick = await vscode.window.showInformationMessage(
          `WaniKani: ${available} reviews available.`,
          "Start Reviews",
        );
        if (pick === "Start Reviews") void vscode.commands.executeCommand("wanikani.startReviews");
      }
      lastAvailableReviews = available;
    } catch (err) {
      const message = err instanceof WaniKaniError ? err.message : String(err);
      statusBar.showError(message);
      if (showErrors) vscode.window.showErrorMessage(`WaniKani: ${message}`);
    }
  }

  function scheduleRefresh(): void {
    if (refreshTimer) clearInterval(refreshTimer);
    const minutes = Math.max(1, getConfig().refreshIntervalMinutes);
    refreshTimer = setInterval(() => void refresh(false), minutes * 60_000);
    context.subscriptions.push({ dispose: () => refreshTimer && clearInterval(refreshTimer) });
  }

  async function ensureReady(): Promise<boolean> {
    if (await tokens.has()) return true;
    const ok = await promptForToken(tokens);
    if (ok) await refresh();
    return ok;
  }

  // ---- Commands -----------------------------------------------------------

  context.subscriptions.push(
    vscode.commands.registerCommand("wanikani.setToken", async () => {
      if (await promptForToken(tokens)) {
        vscode.window.showInformationMessage("WaniKani token saved.");
        lastAvailableReviews = 0;
        await refresh();
      }
    }),

    vscode.commands.registerCommand("wanikani.clearToken", async () => {
      await tokens.clear();
      statusBar.showNeedsToken();
      tree.update(null);
      vscode.window.showInformationMessage("WaniKani token cleared.");
    }),

    vscode.commands.registerCommand("wanikani.refresh", () => refresh()),

    vscode.commands.registerCommand("wanikani.showDashboard", async () => {
      await vscode.commands.executeCommand("workbench.view.extension.wanikani");
    }),

    vscode.commands.registerCommand("wanikani.startReviews", async () => {
      if (!(await ensureReady())) return;
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "WaniKani" },
        async (progress) => {
          progress.report({ message: "Loading review queue…" });
          await subjects.sync(progress);
          const items = buildItems(await client.getReviewAssignments(), subjects);
          if (items.length === 0) {
            vscode.window.showInformationMessage("WaniKani: no reviews available right now. 🎉");
            return;
          }
          StudyPanel.show(context, client, "review", items, getConfig().practiceMode, () => void refresh(false));
        },
      );
    }),

    vscode.commands.registerCommand("wanikani.startLessons", async () => {
      if (!(await ensureReady())) return;
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "WaniKani" },
        async (progress) => {
          progress.report({ message: "Loading lessons…" });
          await subjects.sync(progress);
          const all = buildItems(await client.getLessonAssignments(), subjects);
          if (all.length === 0) {
            vscode.window.showInformationMessage("WaniKani: no lessons available right now.");
            return;
          }
          const batch = sortLessons(all).slice(0, Math.max(1, getConfig().lessonBatchSize));
          StudyPanel.show(context, client, "lesson", batch, getConfig().practiceMode, () => void refresh(false));
        },
      );
    }),
  );

  // ---- Startup ------------------------------------------------------------

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("wanikani.refreshInterval")) scheduleRefresh();
    }),
  );

  scheduleRefresh();
  void refresh(false);
}

export function deactivate(): void {
  // Disposables handle teardown.
}

/** Map assignments to study items, dropping any whose subject isn't cached yet. */
function buildItems(assignments: Assignment[], store: SubjectStore): StudyItem[] {
  const items: StudyItem[] = [];
  for (const a of assignments) {
    const subject = store.get(a.subject_id);
    if (subject) items.push({ assignmentId: a.id, subject });
  }
  return items;
}

const TYPE_ORDER: Record<SubjectType, number> = { radical: 0, kanji: 1, vocabulary: 2, kana_vocabulary: 3 };

/** Teach lessons in WaniKani's natural order: by level, then radical → kanji → vocab. */
function sortLessons(items: StudyItem[]): StudyItem[] {
  return [...items].sort((a, b) => {
    const s = a.subject as Subject;
    const t = b.subject as Subject;
    return s.level - t.level || TYPE_ORDER[s.type] - TYPE_ORDER[t.type];
  });
}
