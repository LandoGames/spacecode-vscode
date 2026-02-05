/**
 * Database Integration Types
 *
 * Types for external database connections, schema viewing,
 * query building, and migration generation.
 */

/** Supported database providers */
export type DatabaseProvider =
  | 'supabase'
  | 'firebase'
  | 'postgresql'
  | 'mysql'
  | 'sqlite'
  | 'mongodb';

/** Connection status */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/** Database connection configuration */
export interface DatabaseConnection {
  id: string;
  name: string;
  provider: DatabaseProvider;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  /** Never stored in plain text — use VS Code SecretStorage */
  hasPassword?: boolean;
  /** Supabase/Firebase URL */
  projectUrl?: string;
  /** API key reference (stored in SecretStorage) */
  hasApiKey?: boolean;
  /** SQLite file path */
  filePath?: string;
  /** MongoDB connection string (stored in SecretStorage) */
  hasConnectionString?: boolean;
  /** SSL/TLS enabled */
  ssl?: boolean;
  status: ConnectionStatus;
  lastConnected?: number;
  error?: string;
}

/** Database table/collection schema */
export interface SchemaTable {
  name: string;
  columns: SchemaColumn[];
  rowCount?: number;
  indexes?: SchemaIndex[];
  foreignKeys?: SchemaForeignKey[];
}

/** Column definition */
export interface SchemaColumn {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  defaultValue?: string;
  comment?: string;
}

/** Index definition */
export interface SchemaIndex {
  name: string;
  columns: string[];
  unique: boolean;
}

/** Foreign key definition */
export interface SchemaForeignKey {
  column: string;
  referencedTable: string;
  referencedColumn: string;
}

/** Database schema (full) */
export interface DatabaseSchema {
  tables: SchemaTable[];
  views?: string[];
  functions?: string[];
  enums?: { name: string; values: string[] }[];
  fetchedAt: number;
}

/** Query result */
export interface QueryResult {
  columns: string[];
  rows: Record<string, any>[];
  rowCount: number;
  executionTime: number;
  error?: string;
}

/** Migration definition */
export interface MigrationDef {
  id: string;
  name: string;
  upSql: string;
  downSql: string;
  generatedAt: number;
}

/** Database panel state */
export interface DatabasePanelState {
  connections: DatabaseConnection[];
  activeConnectionId?: string;
  schema?: DatabaseSchema;
  lastQuery?: string;
  lastResult?: QueryResult;
}

/** Provider display info */
export const PROVIDER_INFO: Record<DatabaseProvider, { name: string; icon: string; defaultPort?: number }> = {
  supabase: { name: 'Supabase', icon: 'S' },
  firebase: { name: 'Firebase', icon: 'F' },
  postgresql: { name: 'PostgreSQL', icon: 'P', defaultPort: 5432 },
  mysql: { name: 'MySQL', icon: 'M', defaultPort: 3306 },
  sqlite: { name: 'SQLite', icon: 'L' },
  mongodb: { name: 'MongoDB', icon: 'D', defaultPort: 27017 },
};
