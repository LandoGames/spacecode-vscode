/**
 * Diagnostics Module Types
 *
 * Defines data structures for build, compile, and syntax diagnostics.
 */

/**
 * Severity level for diagnostics
 */
export type DiagnosticSeverity = 'error' | 'warning' | 'info';

/**
 * Category of diagnostic
 */
export type DiagnosticCategory =
  | 'build'
  | 'compile'
  | 'syntax'
  | 'reference'
  | 'type'
  | 'lint';

/**
 * A single diagnostic finding
 */
export interface DiagnosticItem {
  id: string;
  category: DiagnosticCategory;
  severity: DiagnosticSeverity;
  code?: string;
  message: string;
  file: string;
  line: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  source: string; // e.g., 'tsc', 'eslint', 'msbuild'
  suggestion?: string;
  relatedItems?: string[];
}

/**
 * Result of a diagnostic check
 */
export interface DiagnosticCheckResult {
  name: string;
  description: string;
  status: 'pass' | 'warn' | 'fail' | 'skipped';
  duration: number;
  items: DiagnosticItem[];
  summary: string;
}

/**
 * Result of a full diagnostic scan
 */
export interface DiagnosticScanResult {
  completedAt: number;
  duration: number;
  checks: DiagnosticCheckResult[];
  passed: boolean;
  summary: {
    total: number;
    passed: number;
    warned: number;
    failed: number;
    skipped: number;
    errors: number;
    warnings: number;
  };
}

/**
 * Diagnostic check configuration
 */
export interface DiagnosticCheckConfig {
  id: string;
  name: string;
  description: string;
  category: DiagnosticCategory;
  enabled: boolean;
  blocking: boolean; // If true, failure blocks other checks
  timeout: number;
}

/**
 * Diagnostic scan options
 */
export interface DiagnosticScanOptions {
  /** Only run specific checks */
  checks?: string[];
  /** Skip specific checks */
  skip?: string[];
  /** Stop on first failure */
  failFast?: boolean;
  /** Timeout for entire scan */
  timeout?: number;
}
