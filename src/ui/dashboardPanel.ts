import * as vscode from "vscode";
import type { WaniKaniClient } from "../api/wanikaniClient";
import type { SubjectStore } from "../cache/subjectStore";
import { buildDashboard, type DashboardViewModel } from "../dashboard/aggregate";

interface HostMessage {
  type: "ready" | "refresh" | "startReviews" | "startLessons";
}

/**
 * Hosts the WaniKani-style dashboard webview: a read-only overview of reviews
 * now, the 24h forecast, item spread by SRS stage, level progress, recent
 * activity and critical (leech) items. Singleton, mirroring StudyPanel.
 */
export class DashboardPanel {
  static current: DashboardPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private loading = false;

  static show(context: vscode.ExtensionContext, client: WaniKaniClient, subjects: SubjectStore): void {
    if (DashboardPanel.current) {
      DashboardPanel.current.panel.reveal();
      void DashboardPanel.current.reload();
      return;
    }
    DashboardPanel.current = new DashboardPanel(context, client, subjects);
  }

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly client: WaniKaniClient,
    private readonly subjects: SubjectStore,
  ) {
    this.panel = vscode.window.createWebviewPanel(
      "wanikani.dashboardPanel",
      "WaniCode Dashboard",
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
      },
    );
    this.panel.webview.html = this.html();
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage((m: HostMessage) => this.onMessage(m), null, this.disposables);
  }

  /** Re-fetch and re-render. Called on external refresh and the in-panel button. */
  async reload(): Promise<void> {
    await this.load();
  }

  private async onMessage(msg: HostMessage): Promise<void> {
    switch (msg.type) {
      case "ready":
      case "refresh":
        await this.load();
        break;
      case "startReviews":
        await vscode.commands.executeCommand("wanikani.startReviews");
        break;
      case "startLessons":
        await vscode.commands.executeCommand("wanikani.startLessons");
        break;
    }
  }

  private async load(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    try {
      // Warm the subject cache first so getSubject resolves characters.
      await this.subjects.sync().catch(() => undefined);
      const [summary, assignments, reviewStats, user] = await Promise.all([
        this.client.getSummary(),
        this.client.getAllAssignments(),
        this.client.getReviewStatistics(),
        this.client.getUser(),
      ]);
      const vm: DashboardViewModel = buildDashboard({
        summary,
        assignments,
        reviewStats,
        user,
        getSubject: (id) => this.subjects.get(id),
      });
      this.post({ type: "dashboard", vm });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.post({ type: "error", message });
    } finally {
      this.loading = false;
    }
  }

  private post(message: unknown): void {
    void this.panel.webview.postMessage(message);
  }

  private html(): string {
    const webview = this.panel.webview;
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "dashboard.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "dashboard.css"));
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="${styleUri}" rel="stylesheet" />
  <title>WaniCode Dashboard</title>
</head>
<body>
  <div id="app"><div id="dash"></div></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private dispose(): void {
    DashboardPanel.current = undefined;
    while (this.disposables.length) this.disposables.pop()?.dispose();
  }
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}
