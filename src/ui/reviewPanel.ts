import * as vscode from "vscode";
import type { WaniKaniClient } from "../api/wanikaniClient";
import { ReviewSession } from "../matching/reviewSession";
import type { Subject } from "../types";

interface HostMessage {
  type: "answer" | "advance" | "ready" | "close";
  value?: string;
  readingCandidate?: string;
}

/**
 * Hosts the review webview. Grading happens here (host side) via ReviewSession;
 * the webview only handles kana input, presentation, and message passing.
 */
export class ReviewPanel {
  private static current: ReviewPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];

  static show(
    context: vscode.ExtensionContext,
    client: WaniKaniClient,
    items: { assignmentId: number; subject: Subject }[],
    practiceMode: boolean,
    onFinished: () => void,
  ): void {
    if (ReviewPanel.current) {
      ReviewPanel.current.panel.reveal();
      return;
    }
    ReviewPanel.current = new ReviewPanel(context, client, items, practiceMode, onFinished);
  }

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly client: WaniKaniClient,
    items: { assignmentId: number; subject: Subject }[],
    private readonly practiceMode: boolean,
    private readonly onFinished: () => void,
  ) {
    this.session = new ReviewSession(items);
    this.panel = vscode.window.createWebviewPanel("wanikani.reviews", "WaniKani Reviews", vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
    });
    this.panel.webview.html = this.html();
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage((m: HostMessage) => this.onMessage(m), null, this.disposables);
  }

  private readonly session: ReviewSession;
  private finished = false;

  private async onMessage(msg: HostMessage): Promise<void> {
    switch (msg.type) {
      case "ready":
        this.post({ type: "config", practiceMode: this.practiceMode, total: this.session.totalSubjects });
        this.sendQuestion();
        break;
      case "answer": {
        const result = this.session.submit(msg.value ?? "", msg.readingCandidate);
        this.post({
          type: "result",
          verdict: result.grade.verdict,
          message: result.grade.verdict === "nudge" ? result.grade.message : undefined,
          acceptedAnswers: result.acceptedAnswers,
        });
        break;
      }
      case "advance":
        if (this.session.remaining === 0) await this.finish();
        else this.sendQuestion();
        break;
      case "close":
        this.panel.dispose();
        break;
    }
  }

  private sendQuestion(): void {
    const card = this.session.peek();
    if (!card) {
      void this.finish();
      return;
    }
    const subject = this.session.getSubject(card.subjectId);
    this.post({
      type: "question",
      kind: card.kind,
      characters: subject.characters ?? subject.slug,
      subjectType: subject.type,
      remaining: this.session.remaining,
      total: this.session.totalSubjects,
    });
  }

  private async finish(): Promise<void> {
    if (this.finished) return;
    this.finished = true;

    let submitted = 0;
    if (!this.practiceMode) {
      const completed = this.session.completedSubjects();
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Submitting reviews to WaniKani…" },
        async () => {
          for (const p of completed) {
            await this.client.createReview(p.assignmentId, p.incorrectMeaning, p.incorrectReading);
            submitted++;
          }
        },
      );
    }

    const summary = this.session.buildSummary(this.practiceMode, submitted);
    this.post({ type: "done", summary });
    this.onFinished();
  }

  private post(message: unknown): void {
    void this.panel.webview.postMessage(message);
  }

  private html(): string {
    const webview = this.panel.webview;
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "review.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "review.css"));
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="${styleUri}" rel="stylesheet" />
  <title>WaniKani Reviews</title>
</head>
<body>
  <div id="app"><div id="banner"></div><div id="stage"></div></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private dispose(): void {
    ReviewPanel.current = undefined;
    if (!this.finished) this.onFinished();
    while (this.disposables.length) this.disposables.pop()?.dispose();
  }
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}
