// @ts-nocheck

/**
 * Database Manager
 *
 * Manages database connections, schema retrieval, and query execution.
 * Connections are stored in .spacecode/db-connections.json (without secrets).
 * Secrets are stored in VS Code SecretStorage.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  DatabaseConnection,
  DatabaseProvider,
  DatabaseSchema,
  QueryResult,
  DatabasePanelState,
  ConnectionStatus,
  PROVIDER_INFO,
} from './DatabaseTypes';

export class DatabaseManager {
  private _workspaceDir: string;
  private _connections: DatabaseConnection[] = [];
  private _activeConnectionId: string | null = null;
  private _schema: DatabaseSchema | null = null;

  constructor(workspaceDir: string) {
    this._workspaceDir = workspaceDir;
    this._loadConnections();
  }

  /** Get all connections */
  getConnections(): DatabaseConnection[] {
    return [...this._connections];
  }

  /** Get active connection */
  getActiveConnection(): DatabaseConnection | null {
    if (!this._activeConnectionId) return null;
    return this._connections.find(c => c.id === this._activeConnectionId) || null;
  }

  /** Add a new connection */
  addConnection(conn: Omit<DatabaseConnection, 'id' | 'status'>): DatabaseConnection {
    const id = `db-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newConn: DatabaseConnection = {
      ...conn,
      id,
      status: 'disconnected',
    };
    this._connections.push(newConn);
    this._saveConnections();
    return newConn;
  }

  /** Remove a connection */
  removeConnection(id: string): boolean {
    const idx = this._connections.findIndex(c => c.id === id);
    if (idx < 0) return false;
    this._connections.splice(idx, 1);
    if (this._activeConnectionId === id) {
      this._activeConnectionId = null;
      this._schema = null;
    }
    this._saveConnections();
    return true;
  }

  /** Set active connection */
  setActiveConnection(id: string): void {
    this._activeConnectionId = id;
    this._schema = null;
  }

  /** Test connection (placeholder — actual connection logic depends on provider) */
  async testConnection(id: string): Promise<{ success: boolean; error?: string }> {
    const conn = this._connections.find(c => c.id === id);
    if (!conn) return { success: false, error: 'Connection not found' };

    conn.status = 'connecting';

    // Actual connection testing would use provider-specific libraries
    // For now, validate that required fields are present
    const valid = this._validateConnection(conn);

    if (valid) {
      conn.status = 'connected';
      conn.lastConnected = Date.now();
      conn.error = undefined;
      this._saveConnections();
      return { success: true };
    } else {
      conn.status = 'error';
      conn.error = 'Missing required connection fields';
      return { success: false, error: conn.error };
    }
  }

  /** Get schema for active connection (placeholder) */
  async getSchema(): Promise<DatabaseSchema | null> {
    if (this._schema) return this._schema;

    const conn = this.getActiveConnection();
    if (!conn) return null;

    // In production, this would execute provider-specific schema queries
    // For now, return a placeholder that can be populated by AI-assisted queries
    this._schema = {
      tables: [],
      views: [],
      functions: [],
      enums: [],
      fetchedAt: Date.now(),
    };

    return this._schema;
  }

  /** Execute query (placeholder — would use provider-specific client) */
  async executeQuery(sql: string): Promise<QueryResult> {
    const startTime = Date.now();

    // Actual query execution would require provider-specific libraries
    // This is infrastructure — the chat AI can execute queries via MCP tools
    return {
      columns: [],
      rows: [],
      rowCount: 0,
      executionTime: Date.now() - startTime,
      error: 'Direct query execution not yet implemented. Use the chat to query via AI.',
    };
  }

  /** Get panel state */
  getState(): DatabasePanelState {
    return {
      connections: this._connections,
      activeConnectionId: this._activeConnectionId || undefined,
      schema: this._schema || undefined,
    };
  }

  /** Get provider info */
  getProviderInfo(provider: DatabaseProvider) {
    return PROVIDER_INFO[provider];
  }

  // ─── Private ───────────────────────────────────────────

  private _validateConnection(conn: DatabaseConnection): boolean {
    switch (conn.provider) {
      case 'supabase':
      case 'firebase':
        return !!conn.projectUrl;
      case 'sqlite':
        return !!conn.filePath;
      case 'mongodb':
        return !!conn.hasConnectionString || !!conn.host;
      default:
        return !!conn.host && !!conn.database;
    }
  }

  private _loadConnections(): void {
    const filePath = path.join(this._workspaceDir, '.spacecode', 'db-connections.json');
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(raw);
        this._connections = data.connections || [];
        // Reset all connection statuses to disconnected on load
        for (const conn of this._connections) {
          conn.status = 'disconnected';
        }
      }
    } catch { /* ignore */ }
  }

  private _saveConnections(): void {
    const dir = path.join(this._workspaceDir, '.spacecode');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const filePath = path.join(dir, 'db-connections.json');
    // Strip sensitive fields before saving
    const safeConns = this._connections.map(c => ({
      ...c,
      status: 'disconnected',
    }));
    fs.writeFileSync(filePath, JSON.stringify({ version: 1, connections: safeConns }, null, 2));
  }
}

/** Singleton */
let _manager: DatabaseManager | null = null;

export function getDatabaseManager(workspaceDir?: string): DatabaseManager {
  if (!_manager && workspaceDir) {
    _manager = new DatabaseManager(workspaceDir);
  }
  return _manager!;
}

export function initDatabaseManager(workspaceDir: string): DatabaseManager {
  _manager = new DatabaseManager(workspaceDir);
  return _manager;
}
