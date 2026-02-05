// @ts-nocheck

/**
 * Database Panel Handler
 *
 * Handles webview messages for database connection management,
 * schema viewing, query execution, and migration generation.
 */

import { getDatabaseManager, initDatabaseManager } from '../../../database';

export async function handleDbMessage(panel: any, message: any): Promise<boolean> {
  switch (message.type) {

    case 'dbGetState': {
      const workspaceDir = panel._workspaceDir || '';
      const manager = getDatabaseManager(workspaceDir) || initDatabaseManager(workspaceDir);
      panel._postMessage({
        type: 'dbState',
        ...manager.getState(),
      });
      return true;
    }

    case 'dbAddConnection': {
      const workspaceDir = panel._workspaceDir || '';
      const manager = getDatabaseManager(workspaceDir) || initDatabaseManager(workspaceDir);
      const conn = manager.addConnection(message.connection);
      panel._postMessage({
        type: 'dbConnectionAdded',
        connection: conn,
        connections: manager.getConnections(),
      });
      return true;
    }

    case 'dbRemoveConnection': {
      const workspaceDir = panel._workspaceDir || '';
      const manager = getDatabaseManager(workspaceDir) || initDatabaseManager(workspaceDir);
      const removed = manager.removeConnection(message.connectionId);
      panel._postMessage({
        type: 'dbConnectionRemoved',
        success: removed,
        connections: manager.getConnections(),
      });
      return true;
    }

    case 'dbTestConnection': {
      const workspaceDir = panel._workspaceDir || '';
      const manager = getDatabaseManager(workspaceDir) || initDatabaseManager(workspaceDir);
      const result = await manager.testConnection(message.connectionId);
      panel._postMessage({
        type: 'dbConnectionTested',
        connectionId: message.connectionId,
        ...result,
        connections: manager.getConnections(),
      });
      return true;
    }

    case 'dbSetActive': {
      const workspaceDir = panel._workspaceDir || '';
      const manager = getDatabaseManager(workspaceDir) || initDatabaseManager(workspaceDir);
      manager.setActiveConnection(message.connectionId);
      panel._postMessage({
        type: 'dbActiveChanged',
        ...manager.getState(),
      });
      return true;
    }

    case 'dbGetSchema': {
      const workspaceDir = panel._workspaceDir || '';
      const manager = getDatabaseManager(workspaceDir) || initDatabaseManager(workspaceDir);
      const schema = await manager.getSchema();
      panel._postMessage({
        type: 'dbSchema',
        schema,
      });
      return true;
    }

    case 'dbExecuteQuery': {
      const workspaceDir = panel._workspaceDir || '';
      const manager = getDatabaseManager(workspaceDir) || initDatabaseManager(workspaceDir);
      const result = await manager.executeQuery(message.query || '');
      panel._postMessage({
        type: 'dbQueryResult',
        result,
      });
      return true;
    }

    default:
      return false;
  }
}
