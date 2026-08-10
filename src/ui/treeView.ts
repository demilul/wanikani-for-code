import * as vscode from "vscode";
import type { Summary } from "../types";

type Node = {
  label: string;
  description?: string;
  icon?: string;
  command?: vscode.Command;
  children?: Node[];
};

const SRS_STAGES: [string, number[]][] = [
  ["Apprentice", [1, 2, 3, 4]],
  ["Guru", [5, 6]],
  ["Master", [7]],
  ["Enlightened", [8]],
  ["Burned", [9]],
];

/** The WaniKani dashboard tree in the activity bar. */
export class DashboardTree implements vscode.TreeDataProvider<Node> {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  private summary: Summary | null = null;
  private srsDistribution: Map<number, number> | null = null;

  update(summary: Summary | null, srsDistribution?: Map<number, number>): void {
    this.summary = summary;
    if (srsDistribution) this.srsDistribution = srsDistribution;
    this._onDidChange.fire();
  }

  getTreeItem(node: Node): vscode.TreeItem {
    const item = new vscode.TreeItem(
      node.label,
      node.children ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None,
    );
    item.description = node.description;
    item.command = node.command;
    if (node.icon) item.iconPath = new vscode.ThemeIcon(node.icon);
    return item;
  }

  getChildren(node?: Node): Node[] {
    if (node) return node.children ?? [];
    if (!this.summary) return [];

    const now = Date.now();
    const reviews = this.summary.reviews
      .filter((s) => (s.available_at ? Date.parse(s.available_at) : 0) <= now)
      .reduce((n, s) => n + s.subject_ids.length, 0);
    const lessons = this.summary.lessons
      .filter((s) => (s.available_at ? Date.parse(s.available_at) : 0) <= now)
      .reduce((n, s) => n + s.subject_ids.length, 0);

    const nodes: Node[] = [
      {
        label: "Reviews",
        description: `${reviews} available`,
        icon: "checklist",
        command: reviews > 0 ? { command: "wanikani.startReviews", title: "Start Reviews" } : undefined,
      },
      {
        label: "Lessons",
        description: `${lessons} available`,
        icon: "mortar-board",
        command: lessons > 0 ? { command: "wanikani.startLessons", title: "Start Lessons" } : undefined,
      },
      {
        label: "Next review",
        description: this.nextReviewLabel(),
        icon: "clock",
      },
    ];

    if (this.srsDistribution) {
      nodes.push({
        label: "SRS distribution",
        icon: "graph",
        children: SRS_STAGES.map(([name, stages]) => ({
          label: name,
          description: String(stages.reduce((n, s) => n + (this.srsDistribution!.get(s) ?? 0), 0)),
          icon: "circle-small-filled",
        })),
      });
    }
    return nodes;
  }

  private nextReviewLabel(): string {
    const next = this.summary?.next_reviews_at;
    if (!next) return "—";
    const at = new Date(next);
    if (at.getTime() <= Date.now()) return "now";
    return at.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
  }
}
