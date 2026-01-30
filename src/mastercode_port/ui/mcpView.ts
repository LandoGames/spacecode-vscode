/**
 * MCP Servers Tree View Provider
 *
 * Shows configured MCP servers with status and actions
 */

import * as vscode from 'vscode';
import { MCPManager, MCPServerConfig, MCPServerStatus } from '../services/mcpManager';

export class MCPViewProvider implements vscode.TreeDataProvider<MCPTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<MCPTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly mcpManager: MCPManager) {
    // Listen for status changes
    mcpManager.onStatusChange(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: MCPTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: MCPTreeItem): MCPTreeItem[] {
    if (!element) {
      // Root level - show all servers + add button
      const servers = this.mcpManager.getAllServers();
      const items = servers.map(s => new MCPTreeItem(s, 'server'));

      // Add "Add Server" item
      items.push(new MCPTreeItem(
        {
          id: 'add',
          name: 'Add MCP Server...',
          transport: 'stdio',
          enabled: true,
        },
        'action'
      ));

      return items;
    }

    // Server children - show tools/resources when expanded
    if (element.itemType === 'server' && element.server) {
      return [
        new MCPTreeItem({ ...element.server, name: 'Tools' }, 'tools-header'),
        new MCPTreeItem({ ...element.server, name: 'Resources' }, 'resources-header'),
      ];
    }

    return [];
  }
}

type MCPTreeItemType = 'server' | 'action' | 'tools-header' | 'resources-header' | 'tool' | 'resource';

class MCPTreeItem extends vscode.TreeItem {
  constructor(
    public readonly server: MCPServerConfig,
    public readonly itemType: MCPTreeItemType
  ) {
    super(
      server.name,
      itemType === 'server'
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );

    this.setupItem();
  }

  private setupItem(): void {
    switch (this.itemType) {
      case 'server':
        this.setupServerItem();
        break;
      case 'action':
        this.iconPath = new vscode.ThemeIcon('add');
        this.command = {
          command: 'spacecode.mcpAdd',
          title: 'Add MCP Server',
        };
        break;
      case 'tools-header':
        this.iconPath = new vscode.ThemeIcon('tools');
        this.description = 'Available tools';
        break;
      case 'resources-header':
        this.iconPath = new vscode.ThemeIcon('database');
        this.description = 'Available resources';
        break;
    }
  }

  private setupServerItem(): void {
    const status = this.server.status || 'stopped';

    // Icon based on status
    switch (status) {
      case 'running':
        this.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('testing.iconPassed'));
        break;
      case 'starting':
        this.iconPath = new vscode.ThemeIcon('loading~spin');
        break;
      case 'error':
        this.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('testing.iconFailed'));
        break;
      default:
        this.iconPath = new vscode.ThemeIcon('circle-outline');
    }

    this.description = status;
    this.tooltip = this.buildTooltip();
    this.contextValue = `mcp-server-${status}`;

    // Click to show management options
    this.command = {
      command: 'spacecode.mcpManage',
      title: 'Manage Server',
      arguments: [this.server.id],
    };
  }

  private buildTooltip(): string {
    const lines = [
      this.server.name,
      `Transport: ${this.server.transport}`,
      `Status: ${this.server.status || 'stopped'}`,
    ];

    if (this.server.description) {
      lines.push('', this.server.description);
    }

    if (this.server.lastError) {
      lines.push('', `Error: ${this.server.lastError}`);
    }

    return lines.join('\n');
  }
}
