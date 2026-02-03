/**
 * Maintenance Module Types
 *
 * Defines data structures for refactoring suggestions and cleanup actions.
 */

/**
 * Priority level for maintenance tasks
 */
export type MaintenancePriority = 'high' | 'medium' | 'low';

/**
 * Category of maintenance action
 */
export type MaintenanceCategory =
  | 'refactor'
  | 'cleanup'
  | 'modernize'
  | 'performance'
  | 'dependency'
  | 'documentation';

/**
 * Type of maintenance action
 */
export type MaintenanceActionType =
  // Refactoring
  | 'extract-function'
  | 'extract-component'
  | 'rename-symbol'
  | 'move-file'
  | 'split-file'
  // Cleanup
  | 'remove-unused-import'
  | 'remove-unused-file'
  | 'remove-console-log'
  | 'remove-commented-code'
  | 'fix-formatting'
  // Modernize
  | 'update-syntax'
  | 'convert-to-async'
  | 'use-optional-chaining'
  | 'use-nullish-coalescing'
  // Performance
  | 'memoize-function'
  | 'lazy-load-module'
  | 'optimize-import'
  // Dependencies
  | 'update-dependency'
  | 'remove-unused-dependency'
  | 'audit-dependency'
  // Documentation
  | 'add-jsdoc'
  | 'update-readme';

/**
 * A maintenance suggestion
 */
export interface MaintenanceSuggestion {
  id: string;
  category: MaintenanceCategory;
  type: MaintenanceActionType;
  priority: MaintenancePriority;
  title: string;
  description: string;
  file?: string;
  line?: number;
  effort: 'trivial' | 'small' | 'medium' | 'large';
  impact: 'low' | 'medium' | 'high';
  autoFixable: boolean;
  fix?: {
    description: string;
    changes: Array<{
      file: string;
      action: 'create' | 'modify' | 'delete' | 'rename';
      details?: string;
    }>;
  };
}

/**
 * Dependency info
 */
export interface DependencyInfo {
  name: string;
  currentVersion: string;
  latestVersion?: string;
  type: 'dependency' | 'devDependency' | 'peerDependency';
  hasUpdate: boolean;
  isDeprecated: boolean;
  usageCount: number;
}

/**
 * Maintenance scan result
 */
export interface MaintenanceScanResult {
  completedAt: number;
  duration: number;
  suggestions: MaintenanceSuggestion[];
  dependencies: DependencyInfo[];
  summary: {
    total: number;
    byCategory: Record<MaintenanceCategory, number>;
    byPriority: Record<MaintenancePriority, number>;
    autoFixable: number;
  };
  health: {
    score: number; // 0-100
    status: 'healthy' | 'needs-attention' | 'critical';
  };
}

/**
 * Maintenance scan options
 */
export interface MaintenanceScanOptions {
  /** Categories to include */
  categories?: MaintenanceCategory[];
  /** Minimum priority to report */
  minPriority?: MaintenancePriority;
  /** Check dependencies */
  checkDependencies?: boolean;
  /** Include auto-fix suggestions */
  includeAutoFix?: boolean;
}
