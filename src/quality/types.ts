/**
 * Code Quality Module Types
 *
 * Defines data structures for code quality analysis including
 * duplication detection, magic values, dead code, and complexity metrics.
 */

/**
 * Severity level for code quality issues
 */
export type QualitySeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * Category of code quality issue
 */
export type QualityCategory =
  | 'duplication'
  | 'magic-value'
  | 'dead-code'
  | 'complexity'
  | 'coupling'
  | 'naming'
  | 'unity-specific';

/**
 * Type of code smell detected
 */
export type CodeSmellType =
  // Duplication
  | 'duplicate-function'
  | 'similar-code-block'
  | 'copy-paste-code'
  // Magic Values
  | 'magic-number'
  | 'magic-string'
  | 'hardcoded-path'
  | 'hardcoded-url'
  | 'hardcoded-color'
  // Dead Code
  | 'unused-variable'
  | 'unused-function'
  | 'unused-import'
  | 'unreachable-code'
  | 'commented-code'
  // Complexity
  | 'god-class'
  | 'long-method'
  | 'too-many-parameters'
  | 'deep-nesting'
  | 'high-cyclomatic-complexity'
  // Coupling
  | 'circular-dependency'
  | 'tight-coupling'
  | 'feature-envy'
  // Unity-specific
  | 'update-in-update'
  | 'find-in-update'
  | 'getcomponent-in-update'
  | 'instantiate-without-pool'
  | 'string-comparison-tag';

/**
 * A code quality finding
 */
export interface QualityFinding {
  id: string;
  category: QualityCategory;
  type: CodeSmellType;
  severity: QualitySeverity;
  message: string;
  description: string;
  file: string;
  line: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  codeSnippet?: string;
  suggestion?: string;
  autoFixable: boolean;
  relatedFindings?: string[]; // IDs of related findings (e.g., duplicate pairs)
  metrics?: {
    complexity?: number;
    similarity?: number;
    lineCount?: number;
    parameterCount?: number;
    nestingDepth?: number;
  };
}

/**
 * Duplicate code match
 */
export interface DuplicateMatch {
  file1: string;
  line1: number;
  file2: string;
  line2: number;
  lineCount: number;
  similarity: number; // 0-1
  codeHash: string;
  snippet: string;
}

/**
 * Magic value detection result
 */
export interface MagicValue {
  value: string | number;
  type: 'number' | 'string' | 'path' | 'url' | 'color';
  file: string;
  line: number;
  column: number;
  context: string; // Surrounding code
  suggestedName?: string;
  occurrences: number; // How many times this value appears
}

/**
 * Dead code detection result
 */
export interface DeadCode {
  symbol: string;
  type: 'variable' | 'function' | 'class' | 'import' | 'parameter';
  file: string;
  line: number;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Complexity metrics for a file or function
 */
export interface ComplexityMetrics {
  file: string;
  symbol?: string;
  type: 'file' | 'class' | 'function';
  lineCount: number;
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  maxNestingDepth: number;
  parameterCount?: number;
  dependencyCount: number;
  maintainabilityIndex: number; // 0-100
}

/**
 * Coupling analysis result
 */
export interface CouplingAnalysis {
  file: string;
  dependencies: string[];
  dependents: string[];
  afferentCoupling: number; // Ca - incoming dependencies
  efferentCoupling: number; // Ce - outgoing dependencies
  instability: number; // Ce / (Ca + Ce), 0-1
  abstractness?: number; // Ratio of abstract types
  distance?: number; // Distance from main sequence
  circularDependencies: string[][]; // Cycles this file is part of
}

/**
 * Code quality scan result
 */
export interface QualityScanResult {
  completedAt: number;
  duration: number;
  filesScanned: number;
  findings: QualityFinding[];
  score: number; // 0-100
  passed: boolean; // score >= threshold
  summary: {
    total: number;
    byCategory: Record<QualityCategory, number>;
    bySeverity: Record<QualitySeverity, number>;
  };
  metrics: {
    averageComplexity: number;
    averageMaintainability: number;
    duplicateLinePercentage: number;
    deadCodePercentage: number;
  };
}

/**
 * Quality scan options
 */
export interface QualityScanOptions {
  /** Files/patterns to include */
  include?: string[];
  /** Files/patterns to exclude */
  exclude?: string[];
  /** Minimum severity to report */
  minSeverity?: QualitySeverity;
  /** Categories to scan for */
  categories?: QualityCategory[];
  /** Thresholds for pass/fail */
  thresholds?: {
    minScore?: number;
    maxComplexity?: number;
    maxDuplication?: number;
    maxDeadCode?: number;
  };
  /** Unity-specific checks */
  unityChecks?: boolean;
}

/**
 * Quality rule definition
 */
export interface QualityRule {
  id: string;
  name: string;
  category: QualityCategory;
  type: CodeSmellType;
  severity: QualitySeverity;
  description: string;
  enabled: boolean;
  options?: Record<string, unknown>;
}

/**
 * Quality fix suggestion
 */
export interface QualityFix {
  findingId: string;
  description: string;
  diff: string;
  confidence: 'high' | 'medium' | 'low';
  breaking: boolean;
}

/**
 * Quality report for export
 */
export interface QualityReport {
  generatedAt: number;
  projectName: string;
  scanResult: QualityScanResult;
  topIssues: QualityFinding[];
  trends?: {
    previousScore?: number;
    scoreDelta?: number;
    newIssues?: number;
    resolvedIssues?: number;
  };
  recommendations: string[];
}
