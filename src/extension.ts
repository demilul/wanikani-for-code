import * as vscode from "vscode";
import { WaniKaniClient, WaniKaniError } from "./api/wanikaniClient";
import { SubjectStore } from "./cache/subjectStore";
import { getConfig, promptForToken, TokenStore } from "./config";
import { ReviewPanel } from "./ui/reviewPanel";
import { StatusBar } from "./ui/statusBar";
import { DashboardTree } from "./ui/treeView";
import type { Summary } from "./types";

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
          const assignments = await client.getReviewAssignments();
          const items = assignments
            .map((a) => ({ assignmentId: a.id, subject: subjects.get(a.subject_id) }))
            .filter((x): x is { assignmentId: number; subject: NonNullable<typeof x.subject> } => !!x.subject);

          if (items.length === 0) {
            vscode.window.showInformationMessage("WaniKani: no reviews available right now. 🎉");
            return;
          }
          const { practiceMode } = getConfig();
          ReviewPanel.show(context, client, items, practiceMode, () => void refresh(false));
        },
      );
    }),

    vscode.commands.registerCommand("wanikani.startLessons", async () => {
      if (!(await ensureReady())) return;
      // v1: native lesson UI is deferred — hand off to WaniKani's lesson session.
      const pick = await vscode.window.showInformationMessage(
        "Native lessons are coming in a later release. Open your lessons on WaniKani for now?",
        "Open WaniKani Lessons",
      );
      if (pick) {
        await vscode.env.openExternal(vscode.Uri.parse("https://www.wanikani.com/subjects/lesson"));
      }
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
