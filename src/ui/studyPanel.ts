import * as vscode from "vscode";
import type { WaniKaniClient } from "../api/wanikaniClient";
import { ReviewSession } from "../matching/reviewSession";
import type { Subject } from "../types";

export interface StudyItem {
  assignmentId: number;
  subject: Subject;
}
export type StudyKind = "review" | "lesson";

interface HostMessage {
  type: "ready" | "teachNext" | "answer" | "advance" | "close";
  value?: string;
  readingCandidate?: string;
}

/** Serialisable item info for the teaching card and post-answer reinforcement. */
interface ItemInfo {
  characters: string;
  subjectType: Subject["type"];
  meanings: string[];
  readings: { reading: string; type?: string; primary: boolean }[];
  meaningMnemonic?: string;
  readingMnemonic?: string;
  documentUrl: string;
}

/**
 * Hosts a study session webview. Runs either a review (straight to quiz) or a
 * lesson (teach every subject, then quiz, then start the assignments). Grading
 * lives host-side in ReviewSession; the webview handles presentation + kana.
 */
export class StudyPanel {
  private static current: StudyPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly session: ReviewSession;
  private teachIndex = 0;
  private finished = false;

  static show(
    context: vscode.ExtensionContext,
    client: WaniKaniClient,
    kind: StudyKind,
    items: StudyItem[],
    practiceMode: boolean,
    onFinished: () => void,
  ): void {
    if (StudyPanel.current) {
      StudyPanel.current.panel.reveal();
      return;
    }
    StudyPanel.current = new StudyPanel(context, client, kind, items, practiceMode, onFinished);
  }

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly client: WaniKaniClient,
    private readonly kind: StudyKind,
    private readonly items: StudyItem[],
    private readonly practiceMode: boolean,
    private readonly onFinished: () => void,
  ) {
    this.session = new ReviewSession(items);
    const title = kind === "lesson" ? "WaniKani Lessons" : "WaniKani Reviews";
    this.panel = vscode.window.createWebviewPanel("wanikani.study", title, vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
    });
    this.panel.webview.html = this.html();
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage((m: HostMessage) => this.onMessage(m), null, this.disposables);
  }

  private async onMessage(msg: HostMessage): Promise<void> {
    switch (msg.type) {
      case "ready":
        this.post({
          type: "config",
          mode: this.kind,
          practiceMode: this.practiceMode,
          total: this.session.totalSubjects,
        });
        if (this.kind === "lesson" && this.items.length > 0) this.sendTeach(0);
        else this.sendQuestion();
        break;

      case "teachNext":
        this.teachIndex++;
        if (this.teachIndex < this.items.length) this.sendTeach(this.teachIndex);
        else this.sendQuestion(); // teaching done -> start the quiz
        break;

      case "answer": {
        const result = this.session.submit(msg.value ?? "", msg.readingCandidate);
        this.post({
          type: "result",
          verdict: result.grade.verdict,
          message: result.grade.verdict === "nudge" ? result.grade.message : undefined,
          acceptedAnswers: result.acceptedAnswers,
          info: result.grade.verdict === "nudge" ? undefined : this.buildInfo(result.subject),
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

  private sendTeach(index: number): void {
    const item = this.items[index];
    this.post({
      type: "teach",
      index,
      total: this.items.length,
      info: this.buildInfo(item.subject),
    });
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

  private buildInfo(subject: Subject): ItemInfo {
    return {
      characters: subject.characters ?? subject.slug,
      subjectType: subject.type,
      meanings: subject.meanings.filter((m) => m.accepted_answer).map((m) => m.meaning),
      readings: subject.readings
        .filter((r) => r.accepted_answer)
        .map((r) => ({ reading: r.reading, type: r.type, primary: r.primary })),
      meaningMnemonic: subject.meaning_mnemonic,
      readingMnemonic: subject.reading_mnemonic,
      documentUrl: subject.document_url,
    };
  }

  private async finish(): Promise<void> {
    if (this.finished) return;
    this.finished = true;

    let submitted = 0;
    if (!this.practiceMode) {
      const label = this.kind === "lesson" ? "Starting lessons on WaniKani…" : "Submitting reviews to WaniKani…";
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: label },
        async () => {
          if (this.kind === "review") {
            for (const p of this.session.completedSubjects()) {
              await this.client.createReview(p.assignmentId, p.incorrectMeaning, p.incorrectReading);
              submitted++;
            }
          } else {
            // A lesson is "learned" once its quiz is passed; start every item.
            for (const item of this.items) {
              await this.client.startAssignment(item.assignmentId);
              submitted++;
            }
          }
        },
      );
    }

    this.post({ type: "done", kind: this.kind, summary: this.session.buildSummary(this.practiceMode, submitted) });
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
  <title>WaniKani</title>
</head>
<body>
  <div id="app"><div id="banner"></div><div id="stage"></div></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private dispose(): void {
    StudyPanel.current = undefined;
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
