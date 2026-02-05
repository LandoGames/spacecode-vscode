// @ts-nocheck

import * as vscode from 'vscode';

export function createMcpImpl(panel: any) {
  async function sendMcpServers(): Promise<void> {
    const servers = panel.mcpManager.getAllServers();
    panel._postMessage({ type: 'mcpServers', servers });
  }

  async function addMcpServer(): Promise<void> {
    try {
      const name = await vscode.window.showInputBox({
        prompt: 'Enter MCP server name',
        placeHolder: 'e.g., My MCP Server',
      });
      if (!name) return;

      const url = await vscode.window.showInputBox({
        prompt: 'Enter MCP server URL',
        placeHolder: 'e.g., http://localhost:3000',
        validateInput: (value) => {
          if (!value) return 'URL is required';
          try {
            new URL(value);
            return null;
          } catch {
            return 'Please enter a valid URL';
          }
        },
      });
      if (!url) return;

      await panel.mcpManager.addCustomServer(name, 'http', { url });

      vscode.window.showInformationMessage(`MCP server "${name}" added`);
      await sendMcpServers();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Failed to add MCP server: ${msg}`);
    }
  }

  async function handleMcpAction(action: string, serverId: string): Promise<void> {
    try {
      switch (action) {
        case 'start':
          await panel.mcpManager.startServer(serverId);
          break;
        case 'stop':
          await panel.mcpManager.stopServer(serverId);
          break;
        case 'remove':
          await panel.mcpManager.removeServer(serverId);
          break;
        case 'launch':
          panel.mcpManager.launchInTerminal(serverId);
          break;
        case 'ping':
          await pingMcpServer(serverId);
          break;
      }
      await sendMcpServers();
    } catch (error) {
      panel._postMessage({
        type: 'error',
        message: `MCP action failed: ${error}`,
      });
    }
  }

  async function pingMcpServer(serverId: string): Promise<void> {
    const server = panel.mcpManager.getServer(serverId);
    if (!server || !server.url) {
      panel._postMessage({ type: 'error', message: 'Server has no URL configured' });
      return;
    }

    const { MCPClient } = await import('../../services/mcpClient');
    const client = new MCPClient(server.url);

    const isUnityMcp = serverId.toLowerCase().includes('unity') || server.name.toLowerCase().includes('unity');
    console.log('[SpaceCode] Pinging server:', serverId, 'isUnityMcp:', isUnityMcp);

    try {
      const available = await client.ping();
      console.log('[SpaceCode] Ping result for', serverId, ':', available);

      if (available) {
        panel._postMessage({ type: 'mcpPingResult', serverId, available: true });
        if (isUnityMcp) {
          panel._postMessage({ type: 'unityMCPAvailable', available: true });
          panel._postMessage({ type: 'unityStatus', status: { connected: true } });
        }
      } else {
        await panel.mcpManager.stopServer(serverId);
        panel._postMessage({ type: 'error', message: `${server.name} is not responding` });
        if (isUnityMcp) {
          panel._postMessage({ type: 'unityMCPAvailable', available: false });
          panel._postMessage({ type: 'unityStatus', status: { connected: false } });
        }
      }
    } catch (error) {
      console.error('[SpaceCode] Ping error for', serverId, ':', error);
      await panel.mcpManager.stopServer(serverId);
      panel._postMessage({ type: 'error', message: `Failed to connect to ${server.name}: ${error}` });
      if (isUnityMcp) {
        panel._postMessage({ type: 'unityMCPAvailable', available: false });
        panel._postMessage({ type: 'unityStatus', status: { connected: false } });
      }
    }
  }

  return {
    sendMcpServers,
    addMcpServer,
    handleMcpAction,
  };
}
