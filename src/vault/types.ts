/**
 * Vault/Project DB Types
 *
 * Types for the Vault persona and Project Database management.
 */

export type DatabaseProvider = 'supabase' | 'firebase' | 'postgresql' | 'mysql' | 'sqlite' | 'mongodb';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface DatabaseConfig {
  id: string;
  name: string;
  provider: DatabaseProvider;
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  // Password stored securely in SecretStorage
}

export interface DatabaseConnection {
  id: string;
  config: DatabaseConfig;
  status: ConnectionStatus;
  lastConnected?: number;
  error?: string;
}

export interface TableColumn {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  foreignKey?: {
    table: string;
    column: string;
  };
  defaultValue?: string;
  comment?: string;
}

export interface TableSchema {
  name: string;
  columns: TableColumn[];
  rowCount?: number;
  indexes?: string[];
  constraints?: string[];
}

export interface SchemaInfo {
  tables: TableSchema[];
  views?: string[];
  functions?: string[];
  triggers?: string[];
  lastScanned: number;
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTime: number;
  error?: string;
}

export interface Migration {
  id: string;
  name: string;
  sql: string;
  createdAt: number;
  appliedAt?: number;
  status: 'pending' | 'applied' | 'failed';
}

export interface RLSPolicy {
  table: string;
  name: string;
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';
  using?: string;
  withCheck?: string;
  enabled: boolean;
}

export interface VaultState {
  connection: DatabaseConnection | null;
  schema: SchemaInfo | null;
  selectedTable: string | null;
  queryHistory: string[];
  migrations: Migration[];
  rlsPolicies: RLSPolicy[];
  isLoading: boolean;
}

export interface ProjectDBPanelState {
  isConnected: boolean;
  provider: DatabaseProvider | null;
  tables: TableSchema[];
  selectedTable: TableSchema | null;
  queryInput: string;
  queryResult: QueryResult | null;
  showConnectionWizard: boolean;
  showQueryBuilder: boolean;
  showMigrations: boolean;
}

export interface TypeGenerationOptions {
  language: 'typescript' | 'csharp';
  includeRelations: boolean;
  nullableStrings: boolean;
  useInterfaces: boolean;
}

export interface GeneratedTypes {
  content: string;
  tables: string[];
  generatedAt: number;
}
