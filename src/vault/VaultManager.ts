/**
 * Vault Manager
 *
 * Manages project database connections, schema inspection, and the Vault persona.
 */

import * as vscode from 'vscode';
import {
  DatabaseConfig,
  DatabaseConnection,
  DatabaseProvider,
  SchemaInfo,
  TableSchema,
  QueryResult,
  Migration,
  RLSPolicy,
  VaultState,
  TypeGenerationOptions,
  GeneratedTypes,
  TableColumn
} from './types';

let _instance: VaultManager | undefined;

export function getVaultManager(): VaultManager {
  if (!_instance) {
    _instance = new VaultManager();
  }
  return _instance;
}

export class VaultManager {
  private _state: VaultState = {
    connection: null,
    schema: null,
    selectedTable: null,
    queryHistory: [],
    migrations: [],
    rlsPolicies: [],
    isLoading: false
  };
  private _storageKey = 'spacecode.vault';

  /**
   * Initialize with extension context
   */
  async initialize(context: vscode.ExtensionContext): Promise<void> {
    const saved = context.globalState.get<string>(this._storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Restore connection config but mark as disconnected
        if (parsed.connection?.config) {
          this._state.connection = {
            ...parsed.connection,
            status: 'disconnected'
          };
        }
        this._state.queryHistory = parsed.queryHistory || [];
        this._state.migrations = parsed.migrations || [];
      } catch {
        // Invalid saved state
      }
    }
  }

  /**
   * Save state to storage
   */
  async save(context: vscode.ExtensionContext): Promise<void> {
    const saveData = {
      connection: this._state.connection ? {
        id: this._state.connection.id,
        config: this._state.connection.config,
        status: 'disconnected'
      } : null,
      queryHistory: this._state.queryHistory.slice(-50),
      migrations: this._state.migrations
    };
    await context.globalState.update(this._storageKey, JSON.stringify(saveData));
  }

  /**
   * Get current state
   */
  getState(): VaultState {
    return this._state;
  }

  /**
   * Get connection status
   */
  getConnection(): DatabaseConnection | null {
    return this._state.connection;
  }

  /**
   * Get schema info
   */
  getSchema(): SchemaInfo | null {
    return this._state.schema;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Connection Methods
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Create a new database connection config
   */
  createConnection(config: Omit<DatabaseConfig, 'id'>): DatabaseConnection {
    const connection: DatabaseConnection = {
      id: `db-${Date.now()}`,
      config: {
        ...config,
        id: `db-${Date.now()}`
      },
      status: 'disconnected'
    };
    this._state.connection = connection;
    return connection;
  }

  /**
   * Connect to database
   * Note: Actual DB connection would require appropriate drivers
   */
  async connect(): Promise<DatabaseConnection> {
    if (!this._state.connection) {
      throw new Error('No database configured');
    }

    this._state.connection.status = 'connecting';
    this._state.isLoading = true;

    try {
      // Simulate connection attempt
      // In real implementation, this would use appropriate DB drivers
      await new Promise(resolve => setTimeout(resolve, 1000));

      this._state.connection.status = 'connected';
      this._state.connection.lastConnected = Date.now();
      this._state.connection.error = undefined;

      // Load schema on successful connection
      await this._loadSchema();

      return this._state.connection;
    } catch (error) {
      this._state.connection.status = 'error';
      this._state.connection.error = error instanceof Error ? error.message : 'Connection failed';
      throw error;
    } finally {
      this._state.isLoading = false;
    }
  }

  /**
   * Disconnect from database
   */
  disconnect(): void {
    if (this._state.connection) {
      this._state.connection.status = 'disconnected';
    }
    this._state.schema = null;
    this._state.selectedTable = null;
  }

  /**
   * Remove connection config
   */
  removeConnection(): void {
    this._state.connection = null;
    this._state.schema = null;
    this._state.selectedTable = null;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Schema Methods
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Load schema from connected database
   */
  private async _loadSchema(): Promise<void> {
    // Simulate schema loading with mock data
    // Real implementation would query information_schema
    this._state.schema = {
      tables: [
        {
          name: 'players',
          columns: [
            { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
            { name: 'username', type: 'varchar(255)', nullable: false, primaryKey: false },
            { name: 'email', type: 'varchar(255)', nullable: false, primaryKey: false },
            { name: 'created_at', type: 'timestamp', nullable: false, primaryKey: false, defaultValue: 'now()' }
          ],
          rowCount: 1250
        },
        {
          name: 'inventory',
          columns: [
            { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
            { name: 'player_id', type: 'uuid', nullable: false, primaryKey: false, foreignKey: { table: 'players', column: 'id' } },
            { name: 'item_id', type: 'varchar(50)', nullable: false, primaryKey: false },
            { name: 'quantity', type: 'integer', nullable: false, primaryKey: false, defaultValue: '1' }
          ],
          rowCount: 5420
        },
        {
          name: 'leaderboards',
          columns: [
            { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
            { name: 'player_id', type: 'uuid', nullable: false, primaryKey: false, foreignKey: { table: 'players', column: 'id' } },
            { name: 'score', type: 'bigint', nullable: false, primaryKey: false },
            { name: 'level', type: 'varchar(50)', nullable: false, primaryKey: false },
            { name: 'achieved_at', type: 'timestamp', nullable: false, primaryKey: false, defaultValue: 'now()' }
          ],
          rowCount: 8930
        }
      ],
      views: ['player_stats_view', 'top_scores_view'],
      functions: ['calculate_rank', 'update_leaderboard'],
      lastScanned: Date.now()
    };
  }

  /**
   * Refresh schema
   */
  async refreshSchema(): Promise<SchemaInfo> {
    if (this._state.connection?.status !== 'connected') {
      throw new Error('Not connected to database');
    }
    await this._loadSchema();
    return this._state.schema!;
  }

  /**
   * Get table details
   */
  getTable(tableName: string): TableSchema | undefined {
    return this._state.schema?.tables.find(t => t.name === tableName);
  }

  /**
   * Select a table
   */
  selectTable(tableName: string): TableSchema | undefined {
    const table = this.getTable(tableName);
    if (table) {
      this._state.selectedTable = tableName;
    }
    return table;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Query Methods
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Execute a query
   */
  async executeQuery(sql: string): Promise<QueryResult> {
    if (this._state.connection?.status !== 'connected') {
      throw new Error('Not connected to database');
    }

    const startTime = Date.now();

    // Add to history
    this._state.queryHistory.unshift(sql);
    if (this._state.queryHistory.length > 50) {
      this._state.queryHistory.pop();
    }

    // Simulate query execution
    await new Promise(resolve => setTimeout(resolve, 200));

    // Return mock result
    return {
      columns: ['id', 'username', 'email', 'created_at'],
      rows: [
        { id: '1', username: 'player1', email: 'p1@example.com', created_at: '2024-01-15T10:30:00Z' },
        { id: '2', username: 'player2', email: 'p2@example.com', created_at: '2024-01-16T14:20:00Z' },
        { id: '3', username: 'player3', email: 'p3@example.com', created_at: '2024-01-17T09:15:00Z' }
      ],
      rowCount: 3,
      executionTime: Date.now() - startTime
    };
  }

  /**
   * Get query history
   */
  getQueryHistory(): string[] {
    return this._state.queryHistory;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Migration Methods
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Generate migration SQL
   */
  generateMigration(name: string, changes: { type: 'create' | 'alter' | 'drop'; table: string; sql: string }[]): Migration {
    const sql = changes.map(c => c.sql).join('\n\n');
    const migration: Migration = {
      id: `mig-${Date.now()}`,
      name,
      sql,
      createdAt: Date.now(),
      status: 'pending'
    };
    this._state.migrations.unshift(migration);
    return migration;
  }

  /**
   * Get pending migrations
   */
  getPendingMigrations(): Migration[] {
    return this._state.migrations.filter(m => m.status === 'pending');
  }

  /**
   * Apply a migration
   */
  async applyMigration(migrationId: string): Promise<Migration> {
    const migration = this._state.migrations.find(m => m.id === migrationId);
    if (!migration) {
      throw new Error('Migration not found');
    }

    // Simulate migration
    await new Promise(resolve => setTimeout(resolve, 500));

    migration.status = 'applied';
    migration.appliedAt = Date.now();
    return migration;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Type Generation Methods
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Generate TypeScript/C# types from schema
   */
  generateTypes(options: TypeGenerationOptions): GeneratedTypes {
    if (!this._state.schema) {
      throw new Error('No schema loaded');
    }

    const tables = this._state.schema.tables.map(t => t.name);
    let content = '';

    if (options.language === 'typescript') {
      content = this._generateTypeScript(options);
    } else {
      content = this._generateCSharp(options);
    }

    return {
      content,
      tables,
      generatedAt: Date.now()
    };
  }

  private _generateTypeScript(options: TypeGenerationOptions): string {
    const lines: string[] = [
      '// Auto-generated types from database schema',
      `// Generated at: ${new Date().toISOString()}`,
      ''
    ];

    for (const table of this._state.schema!.tables) {
      const typeName = this._toPascalCase(table.name);
      const keyword = options.useInterfaces ? 'interface' : 'type';

      lines.push(`export ${keyword} ${typeName} ${options.useInterfaces ? '' : '= '}{`);

      for (const col of table.columns) {
        const tsType = this._sqlToTypeScript(col.type, col.nullable, options.nullableStrings);
        lines.push(`  ${col.name}: ${tsType};`);
      }

      lines.push('}');
      lines.push('');
    }

    return lines.join('\n');
  }

  private _generateCSharp(options: TypeGenerationOptions): string {
    const lines: string[] = [
      '// Auto-generated types from database schema',
      `// Generated at: ${new Date().toISOString()}`,
      '',
      'namespace Database.Models',
      '{'
    ];

    for (const table of this._state.schema!.tables) {
      const typeName = this._toPascalCase(table.name);

      lines.push(`    public class ${typeName}`);
      lines.push('    {');

      for (const col of table.columns) {
        const csType = this._sqlToCSharp(col.type, col.nullable);
        const propName = this._toPascalCase(col.name);
        lines.push(`        public ${csType} ${propName} { get; set; }`);
      }

      lines.push('    }');
      lines.push('');
    }

    lines.push('}');
    return lines.join('\n');
  }

  private _toPascalCase(str: string): string {
    return str
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }

  private _sqlToTypeScript(sqlType: string, nullable: boolean, nullableStrings: boolean): string {
    const base = sqlType.toLowerCase();
    let tsType = 'unknown';

    if (base.includes('int') || base.includes('numeric') || base.includes('decimal')) {
      tsType = 'number';
    } else if (base.includes('bool')) {
      tsType = 'boolean';
    } else if (base.includes('uuid') || base.includes('char') || base.includes('text')) {
      tsType = 'string';
    } else if (base.includes('timestamp') || base.includes('date')) {
      tsType = 'string'; // or Date
    } else if (base.includes('json')) {
      tsType = 'Record<string, unknown>';
    }

    if (nullable || (nullableStrings && tsType === 'string')) {
      tsType += ' | null';
    }

    return tsType;
  }

  private _sqlToCSharp(sqlType: string, nullable: boolean): string {
    const base = sqlType.toLowerCase();
    let csType = 'object';

    if (base.includes('bigint')) {
      csType = 'long';
    } else if (base.includes('int')) {
      csType = 'int';
    } else if (base.includes('numeric') || base.includes('decimal')) {
      csType = 'decimal';
    } else if (base.includes('bool')) {
      csType = 'bool';
    } else if (base.includes('uuid')) {
      csType = 'Guid';
    } else if (base.includes('char') || base.includes('text')) {
      csType = 'string';
    } else if (base.includes('timestamp') || base.includes('date')) {
      csType = 'DateTime';
    }

    if (nullable && csType !== 'string') {
      csType += '?';
    }

    return csType;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RLS Policy Methods
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get RLS policies
   */
  getRLSPolicies(): RLSPolicy[] {
    return this._state.rlsPolicies;
  }

  /**
   * Load RLS policies (simulated)
   */
  async loadRLSPolicies(): Promise<RLSPolicy[]> {
    // Simulate loading RLS policies
    this._state.rlsPolicies = [
      {
        table: 'players',
        name: 'players_select_own',
        operation: 'SELECT',
        using: 'auth.uid() = id',
        enabled: true
      },
      {
        table: 'inventory',
        name: 'inventory_access_own',
        operation: 'ALL',
        using: 'auth.uid() = player_id',
        withCheck: 'auth.uid() = player_id',
        enabled: true
      }
    ];
    return this._state.rlsPolicies;
  }
}
