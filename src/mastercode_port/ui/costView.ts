/**
 * Cost View Provider
 *
 * Shows usage statistics and costs in the sidebar
 */

import * as vscode from 'vscode';
import { CostTracker, UsageSummary } from '../services/costTracker';

export class CostViewProvider implements vscode.TreeDataProvider<CostTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<CostTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly costTracker: CostTracker) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: CostTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: CostTreeItem): CostTreeItem[] {
    if (!element) {
      // Root level - show summary sections
      return [
        new CostTreeItem('Today', 'today', vscode.TreeItemCollapsibleState.Expanded),
        new CostTreeItem('This Month', 'month', vscode.TreeItemCollapsibleState.Collapsed),
        new CostTreeItem('All Time', 'all', vscode.TreeItemCollapsibleState.Collapsed),
      ];
    }

    // Get appropriate summary based on section
    let summary: UsageSummary;
    switch (element.sectionId) {
      case 'today':
        summary = this.costTracker.getTodaySummary();
        break;
      case 'month':
        summary = this.costTracker.getThisMonthSummary();
        break;
      default:
        summary = this.costTracker.getSummary();
    }

    return this.buildSummaryItems(summary);
  }

  private buildSummaryItems(summary: UsageSummary): CostTreeItem[] {
    const items: CostTreeItem[] = [];

    // Total cost
    items.push(new CostTreeItem(
      `Total Cost: $${summary.totalCost.toFixed(4)}`,
      'total-cost',
      vscode.TreeItemCollapsibleState.None,
      'dollar'
    ));

    // Total calls
    items.push(new CostTreeItem(
      `API Calls: ${summary.recordCount}`,
      'total-calls',
      vscode.TreeItemCollapsibleState.None,
      'symbol-event'
    ));

    // Tokens
    const totalTokens = summary.totalTokens.input + summary.totalTokens.output;
    items.push(new CostTreeItem(
      `Tokens: ${totalTokens.toLocaleString()}`,
      'total-tokens',
      vscode.TreeItemCollapsibleState.None,
      'symbol-numeric'
    ));

    // Claude breakdown
    if (summary.byProvider.claude.calls > 0) {
      items.push(new CostTreeItem(
        `Claude: $${summary.byProvider.claude.cost.toFixed(4)} (${summary.byProvider.claude.calls} calls)`,
        'claude-cost',
        vscode.TreeItemCollapsibleState.None,
        'hubot'
      ));
    }

    // GPT breakdown
    if (summary.byProvider.gpt.calls > 0) {
      items.push(new CostTreeItem(
        `GPT: $${summary.byProvider.gpt.cost.toFixed(4)} (${summary.byProvider.gpt.calls} calls)`,
        'gpt-cost',
        vscode.TreeItemCollapsibleState.None,
        'hubot'
      ));
    }

    return items;
  }
}

class CostTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly sectionId: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    icon?: string
  ) {
    super(label, collapsibleState);

    if (icon) {
      this.iconPath = new vscode.ThemeIcon(icon);
    }

    this.contextValue = `cost-${sectionId}`;
  }
}
