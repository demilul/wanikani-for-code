import * as vscode from "vscode";
import type { Summary } from "../types";

/** The `蟹 24 Reviews · 3 Lessons · Next 23:00` status bar item. */
export class StatusBar implements vscode.Disposable {
  private item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = "wanikani.showDashboard";
    this.item.name = "WaniKani";
  }

  showNeedsToken(): void {
    this.item.text = "$(crab) WaniKani: set token";
    this.item.tooltip = "Click to configure your WaniKani API token";
    this.item.command = "wanikani.setToken";
    this.item.show();
  }

  showLoading(): void {
    this.item.text = "$(sync~spin) WaniKani";
    this.item.tooltip = "Refreshing WaniKani…";
    this.item.show();
  }

  showError(message: string): void {
    this.item.text = "$(warning) WaniKani";
    this.item.tooltip = message;
    this.item.command = "wanikani.refresh";
    this.item.show();
  }

  render(summary: Summary): void {
    const reviews = countAvailable(summary.reviews);
    const lessons = countAvailable(summary.lessons);
    const parts = [`蟹 ${reviews} Reviews`, `${lessons} Lessons`];
    const next = nextReviewLabel(summary);
    if (next) parts.push(`Next ${next}`);

    this.item.text = parts.join(" · ");
    this.item.tooltip = new vscode.MarkdownString(
      `**WaniKani**\n\n- ${reviews} reviews available\n- ${lessons} lessons available\n\nClick to open the dashboard.`,
    );
    this.item.command = "wanikani.showDashboard";
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }
}

/** Number of subjects whose review/lesson slot is available now (available_at in the past or null). */
function countAvailable(slots: Summary["reviews"]): number {
  const now = Date.now();
  let total = 0;
  for (const slot of slots) {
    const at = slot.available_at ? Date.parse(slot.available_at) : 0;
    if (at <= now) total += slot.subject_ids.length;
  }
  return total;
}

function nextReviewLabel(summary: Summary): string | null {
  if (!summary.next_reviews_at) return null;
  const at = new Date(summary.next_reviews_at);
  const now = new Date();
  if (at.getTime() <= now.getTime()) return null;
  const sameDay = at.toDateString() === now.toDateString();
  const time = at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return sameDay ? time : `${at.toLocaleDateString([], { weekday: "short" })} ${time}`;
}
