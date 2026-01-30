/**
 * Status Tree View Provider
 *
 * Shows connection status for AI providers and external tools
 */

import * as vscode from 'vscode';

interface StatusItem {
  id: string;
  label: string;
  status: 'connected' | 'disconnected' | 'error' | 'busy';
  detail?: string;
}

export class StatusViewProvider implements vscode.TreeDataProvider<StatusTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<StatusTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private statuses: StatusItem[] = [
    { id: 'claude', label: 'Claude', status: 'disconnected', detail: 'Not configured' },
    { id: 'gpt', label: 'GPT', status: 'disconnected', detail: 'Not configured' },
    { id: 'unity', label: 'Unity MCP', status: 'disconnected', detail: 'Not connected' },
    { id: 'blender', label: 'Blender MCP', status: 'disconnected', detail: 'Not connected' },
  ];

  updateStatus(id: string, status: StatusItem['status'], detail?: string): void {
    const item = this.statuses.find(s => s.id === id);
    if (item) {
      item.status = status;
      if (detail !== undefined) {
        item.detail = detail;
      }
      this.refresh();
    }
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: StatusTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): StatusTreeItem[] {
    return this.statuses.map(s => new StatusTreeItem(s));
  }
}

class StatusTreeItem extends vscode.TreeItem {
  constructor(private readonly status: StatusItem) {
    super(status.label, vscode.TreeItemCollapsibleState.None);

    this.description = status.detail;
    this.tooltip = `${status.label}: ${status.status}`;

    // Set icon based on status
    const iconColor = this.getIconColor();
    this.iconPath = new vscode.ThemeIcon('circle-filled', iconColor);

    // Context for commands
    this.contextValue = `status-${status.id}`;
  }

  private getIconColor(): vscode.ThemeColor {
    switch (this.status.status) {
      case 'connected':
        return new vscode.ThemeColor('testing.iconPassed');
      case 'busy':
        return new vscode.ThemeColor('charts.yellow');
      case 'error':
        return new vscode.ThemeColor('testing.iconFailed');
      default:
        return new vscode.ThemeColor('disabledForeground');
    }
  }
}
