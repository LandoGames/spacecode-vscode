// @ts-nocheck

/**
 * Ops Array Handler (Phase 8)
 *
 * Handles webview messages for server management, SSH operations,
 * hardening, deployment, and monitoring.
 */

import * as vscode from 'vscode';
import { getOpsManager, setOpsWorkspaceDir } from '../../../ops';

let _opsInitialized = false;
function ensureOpsInit() {
  if (!_opsInitialized) {
    const wsDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (wsDir) setOpsWorkspaceDir(wsDir);
    _opsInitialized = true;
  }
}

export async function handleOpsMessage(panel: any, message: any): Promise<boolean> {
  switch (message.type) {

    case 'opsGetState': {
      ensureOpsInit();
      const manager = getOpsManager();
      panel._postMessage({
        type: 'opsState',
        ...manager.getState(),
      });
      return true;
    }

    case 'opsAddServer': {
      const manager = getOpsManager();
      const server = manager.addServer({
        name: message.name || message.host,
        host: message.host,
        user: message.user || 'root',
        keyPath: message.keyPath || '',
        port: message.port || 22,
      });
      panel._postMessage({
        type: 'opsServerAdded',
        server,
        servers: manager.getServers(),
      });
      return true;
    }

    case 'opsRemoveServer': {
      const manager = getOpsManager();
      const removed = manager.removeServer(message.serverId);
      panel._postMessage({
        type: 'opsServerRemoved',
        success: removed,
        servers: manager.getServers(),
      });
      return true;
    }

    case 'opsSetActiveServer': {
      const manager = getOpsManager();
      manager.setActiveServer(message.serverId);
      panel._postMessage({
        type: 'opsState',
        ...manager.getState(),
      });
      return true;
    }

    case 'opsTestConnection': {
      const manager = getOpsManager();
      const server = manager.getServer(message.serverId);
      if (!server) {
        panel._postMessage({ type: 'opsError', error: 'Server not found.' });
        return true;
      }

      const op = manager.logOp({
        serverId: server.id,
        serverName: server.name,
        action: 'Test connection',
        status: 'running',
      });

      try {
        const mcpClient = panel._mcpClient || null;
        if (mcpClient && typeof mcpClient.callTool === 'function') {
          const result = await mcpClient.callTool('test_ssh_connection', {
            host: server.host,
            username: server.user,
            port: server.port || 22,
          });
          const success = result?.connected || result?.success;
          manager.updateServerStatus(server.id, success ? 'online' : 'offline');
          manager.updateOp(op.id, {
            status: success ? 'success' : 'failed',
            output: success ? 'Connection successful' : (result?.error || 'Connection failed'),
          });
        } else {
          manager.updateServerStatus(server.id, 'unknown');
          manager.updateOp(op.id, { status: 'failed', output: 'SSH MCP not available' });
        }
      } catch (err: any) {
        manager.updateServerStatus(server.id, 'offline');
        manager.updateOp(op.id, { status: 'failed', output: err?.message || String(err) });
      }

      panel._postMessage({ type: 'opsState', ...manager.getState() });
      return true;
    }

    case 'opsExecuteCommand': {
      const manager = getOpsManager();
      const server = manager.getServer(message.serverId);
      if (!server) {
        panel._postMessage({ type: 'opsError', error: 'Server not found.' });
        return true;
      }

      const op = manager.logOp({
        serverId: server.id,
        serverName: server.name,
        action: `Execute: ${(message.command || '').slice(0, 60)}`,
        status: 'running',
      });

      try {
        const mcpClient = panel._mcpClient || null;
        if (mcpClient && typeof mcpClient.callTool === 'function') {
          const toolName = message.sudo ? 'execute_sudo_command' : 'execute_ssh_command';
          const result = await mcpClient.callTool(toolName, {
            host: server.host,
            username: server.user,
            command: message.command,
          });
          const output = result?.output || result?.stdout || String(result || '');
          manager.updateOp(op.id, { status: 'success', output });
          panel._postMessage({ type: 'opsCommandOutput', serverId: server.id, output, opId: op.id });
        } else {
          manager.updateOp(op.id, { status: 'failed', output: 'SSH MCP not available' });
          panel._postMessage({ type: 'opsCommandOutput', serverId: server.id, output: 'SSH MCP not available', opId: op.id });
        }
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        manager.updateOp(op.id, { status: 'failed', output: errMsg });
        panel._postMessage({ type: 'opsCommandOutput', serverId: server.id, output: errMsg, opId: op.id });
      }

      panel._postMessage({ type: 'opsRecentOps', ops: manager.getRecentOps() });
      return true;
    }

    case 'opsHealthCheck': {
      const manager = getOpsManager();
      const server = manager.getServer(message.serverId);
      if (!server) {
        panel._postMessage({ type: 'opsError', error: 'Server not found.' });
        return true;
      }

      const op = manager.logOp({
        serverId: server.id,
        serverName: server.name,
        action: 'Health check',
        status: 'running',
      });

      try {
        const mcpClient = panel._mcpClient || null;
        if (mcpClient && typeof mcpClient.callTool === 'function') {
          const result = await mcpClient.callTool('get_system_info', {
            host: server.host,
            username: server.user,
          });
          const metrics = {
            cpu: result?.cpu_usage || result?.cpu || 0,
            ram: result?.memory_usage || result?.ram || 0,
            disk: result?.disk_usage || result?.disk || 0,
            uptime: result?.uptime || 0,
            services: result?.services || [],
          };
          manager.updateServerStatus(server.id, 'online', metrics);
          manager.updateOp(op.id, { status: 'success', output: `CPU: ${metrics.cpu}% RAM: ${metrics.ram}% Disk: ${metrics.disk}%` });
        } else {
          manager.updateOp(op.id, { status: 'failed', output: 'SSH MCP not available' });
        }
      } catch (err: any) {
        manager.updateOp(op.id, { status: 'failed', output: err?.message || String(err) });
      }

      panel._postMessage({ type: 'opsState', ...manager.getState() });
      return true;
    }

    case 'opsHardenServer': {
      const manager = getOpsManager();
      const server = manager.getServer(message.serverId);
      if (!server) {
        panel._postMessage({ type: 'opsError', error: 'Server not found.' });
        return true;
      }

      const action = message.action || 'full';
      const commands = manager.getHardeningCommands(action);

      const op = manager.logOp({
        serverId: server.id,
        serverName: server.name,
        action: `Harden: ${action}`,
        status: 'running',
      });

      try {
        const mcpClient = panel._mcpClient || null;
        if (mcpClient && typeof mcpClient.callTool === 'function') {
          const outputs = [];
          for (const cmd of commands) {
            const result = await mcpClient.callTool('execute_sudo_command', {
              host: server.host,
              username: server.user,
              command: cmd,
            });
            outputs.push(result?.output || result?.stdout || '');
          }
          manager.updateOp(op.id, { status: 'success', output: outputs.join('\n---\n') });
        } else {
          manager.updateOp(op.id, { status: 'failed', output: 'SSH MCP not available' });
        }
      } catch (err: any) {
        manager.updateOp(op.id, { status: 'failed', output: err?.message || String(err) });
      }

      panel._postMessage({ type: 'opsState', ...manager.getState() });
      return true;
    }

    case 'opsDeployService': {
      const manager = getOpsManager();
      const server = manager.getServer(message.serverId);
      if (!server) {
        panel._postMessage({ type: 'opsError', error: 'Server not found.' });
        return true;
      }

      const service = message.service || 'custom';
      const commands = manager.getDeployCommands(service);

      const op = manager.logOp({
        serverId: server.id,
        serverName: server.name,
        action: `Deploy: ${service}`,
        status: 'running',
      });

      try {
        const mcpClient = panel._mcpClient || null;
        if (mcpClient && typeof mcpClient.callTool === 'function') {
          const outputs = [];
          for (const cmd of commands) {
            const result = await mcpClient.callTool('execute_sudo_command', {
              host: server.host,
              username: server.user,
              command: cmd,
            });
            outputs.push(result?.output || result?.stdout || '');
          }
          manager.updateOp(op.id, { status: 'success', output: outputs.join('\n---\n') });
        } else {
          manager.updateOp(op.id, { status: 'failed', output: 'SSH MCP not available' });
        }
      } catch (err: any) {
        manager.updateOp(op.id, { status: 'failed', output: err?.message || String(err) });
      }

      panel._postMessage({ type: 'opsState', ...manager.getState() });
      return true;
    }

    case 'opsGetRecentOps': {
      const manager = getOpsManager();
      panel._postMessage({
        type: 'opsRecentOps',
        ops: manager.getRecentOps(message.limit || 20),
      });
      return true;
    }

    default:
      return false;
  }
}
