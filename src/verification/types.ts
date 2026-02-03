/**
 * Verification Module Types
 *
 * Types for post-execution verification pipeline.
 */

import { Plan, PlanStep } from '../planning/types';

/**
 * Result of scanning git diff
 */
export interface DiffScanResult {
  files: ScannedFile[];
  totalAdditions: number;
  totalDeletions: number;
  totalFiles: number;
  scanTime: number;
}

/**
 * A scanned file from diff
 */
export interface ScannedFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
  isBinary: boolean;
}

/**
 * A diff hunk
 */
export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  content: string;
}

/**
 * Result of comparing diff to plan
 */
export interface PlanComparisonResult {
  planId: string;

  // Match analysis
  plannedFiles: string[];
  actualFiles: string[];
  matchedFiles: FileMatch[];

  // Discrepancies
  unexpectedChanges: UnexpectedChange[];
  missingChanges: MissingChange[];

  // Score
  score: number; // 0-100
  verdict: 'pass' | 'partial' | 'fail';

  // Details
  summary: string;
}

/**
 * A file that matches between plan and diff
 */
export interface FileMatch {
  plannedFile: string;
  actualFile: string;
  plannedChangeType: string;
  actualStatus: string;
  match: 'exact' | 'partial' | 'type_mismatch';
}

/**
 * A change that wasn't in the plan
 */
export interface UnexpectedChange {
  file: string;
  status: string;
  additions: number;
  deletions: number;
  severity: 'info' | 'warning' | 'error';
  reason: string;
}

/**
 * A planned change that didn't happen
 */
export interface MissingChange {
  file: string;
  plannedChangeType: string;
  step: PlanStep;
  severity: 'warning' | 'error';
}

/**
 * Result of AI code review
 */
export interface AIReviewResult {
  passed: boolean;
  issues: ReviewIssue[];
  summary: string;
  confidence: number; // 0-100
  tokensUsed: {
    input: number;
    output: number;
  };
  cost: number;
  reviewTime: number;
}

/**
 * An issue found during review
 */
export interface ReviewIssue {
  id: string;
  file: string;
  line?: number;
  endLine?: number;
  column?: number;
  severity: 'error' | 'warning' | 'suggestion' | 'info';
  category: ReviewCategory;
  message: string;
  suggestion?: string;
  codeSnippet?: string;
}

/**
 * Categories of review issues
 */
export type ReviewCategory =
  | 'bug'           // Logic errors, potential crashes
  | 'security'      // Security vulnerabilities
  | 'performance'   // Performance issues
  | 'style'         // Code style violations
  | 'logic'         // Logic problems
  | 'naming'        // Naming conventions
  | 'documentation' // Missing/wrong docs
  | 'testing'       // Test coverage issues
  | 'architecture'  // Architectural concerns
  | 'other';

/**
 * Result of sector rule check
 */
export interface SectorRuleCheckResult {
  passed: boolean;
  sectorsChecked: string[];
  violations: RuleViolation[];
  warnings: RuleWarning[];
  summary: string;
}

/**
 * A rule violation
 */
export interface RuleViolation {
  sectorId: string;
  sectorName: string;
  rule: string;
  file: string;
  line?: number;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * A rule warning (not a hard violation)
 */
export interface RuleWarning {
  sectorId: string;
  sectorName: string;
  message: string;
  suggestion: string;
}

/**
 * Combined verification result
 */
export interface VerificationResult {
  planId: string;
  timestamp: number;

  // Individual results
  diffScan: DiffScanResult;
  planComparison: PlanComparisonResult;
  sectorRuleCheck: SectorRuleCheckResult;
  aiReview?: AIReviewResult; // Optional, can be expensive

  // Overall verdict
  passed: boolean;
  score: number; // 0-100
  summary: string;

  // Blocking issues
  blockers: string[];

  // Recommendations
  recommendations: string[];
}

/**
 * Options for verification
 */
export interface VerificationOptions {
  // What to check
  checkDiff: boolean;
  checkPlanMatch: boolean;
  checkSectorRules: boolean;
  runAIReview: boolean;

  // Thresholds
  minPlanMatchScore: number; // 0-100, default 70
  maxUnexpectedFiles: number; // default 3

  // AI Review options
  aiReviewProvider?: 'claude' | 'gpt';
  aiReviewDepth?: 'quick' | 'standard' | 'thorough';
}

/**
 * Default verification options
 */
export const DEFAULT_VERIFICATION_OPTIONS: VerificationOptions = {
  checkDiff: true,
  checkPlanMatch: true,
  checkSectorRules: true,
  runAIReview: false, // Off by default (costs tokens)
  minPlanMatchScore: 70,
  maxUnexpectedFiles: 3,
  aiReviewProvider: 'claude',
  aiReviewDepth: 'standard'
};
