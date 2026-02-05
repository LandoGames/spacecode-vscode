/**
 * Database Module
 *
 * External database connection management,
 * schema viewing, and query execution.
 */

export {
  DatabaseProvider,
  ConnectionStatus,
  DatabaseConnection,
  SchemaTable,
  SchemaColumn,
  SchemaIndex,
  SchemaForeignKey,
  DatabaseSchema,
  QueryResult,
  MigrationDef,
  DatabasePanelState,
  PROVIDER_INFO,
} from './DatabaseTypes';

export {
  DatabaseManager,
  getDatabaseManager,
  initDatabaseManager,
} from './DatabaseManager';
