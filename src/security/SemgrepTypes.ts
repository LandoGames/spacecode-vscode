/**
 * Semgrep Types
 *
 * Types for Semgrep SAST integration.
 * Maps Semgrep JSON output to SpaceCode's SecurityFinding format.
 */

/** Semgrep CLI JSON output structure (per finding) */
export interface SemgrepRawFinding {
  check_id: string;
  path: string;
  start: { line: number; col: number; offset: number };
  end: { line: number; col: number; offset: number };
  extra: {
    message: string;
    severity: 'ERROR' | 'WARNING' | 'INFO';
    metadata?: {
      cwe?: string | string[];
      owasp?: string | string[];
      category?: string;
      technology?: string[];
      confidence?: string;
      likelihood?: string;
      impact?: string;
      subcategory?: string[];
      source?: string;
      fix_regex?: { regex: string; replacement: string; count?: number };
    };
    fix?: string;
    lines?: string;
    fingerprint?: string;
  };
}

/** Semgrep CLI JSON output (top-level) */
export interface SemgrepRawOutput {
  results: SemgrepRawFinding[];
  errors: SemgrepRawError[];
  version?: string;
  paths?: { scanned: string[]; skipped?: { path: string; reason: string }[] };
}

/** Semgrep CLI error */
export interface SemgrepRawError {
  type: string;
  message: string;
  level: string;
  path?: string;
  spans?: Array<{ start: { line: number; col: number }; end: { line: number; col: number } }>;
}

/** Semgrep scan configuration */
export interface SemgrepScanConfig {
  /** Built-in rulesets to use (e.g., 'p/security-audit', 'p/secrets') */
  rulesets: string[];
  /** Custom rule file/directory paths */
  customRulePaths: string[];
  /** File/directory paths to scan */
  targetPaths: string[];
  /** Patterns to exclude */
  excludePatterns: string[];
  /** Maximum file size in KB */
  maxFileSizeKb: number;
  /** Timeout in seconds */
  timeoutSecs: number;
  /** Whether to run supply chain scan */
  supplyChain: boolean;
  /** Additional CLI flags */
  extraFlags: string[];
}

/** Default Semgrep scan configuration */
export const DEFAULT_SEMGREP_CONFIG: SemgrepScanConfig = {
  rulesets: ['p/security-audit', 'p/secrets', 'p/owasp-top-ten'],
  customRulePaths: [],
  targetPaths: ['.'],
  excludePatterns: ['node_modules', 'dist', 'build', 'Library', 'Temp', 'obj', '.git'],
  maxFileSizeKb: 1024,
  timeoutSecs: 120,
  supplyChain: false,
  extraFlags: [],
};

/** Quality-focused scan configuration */
export const QUALITY_SEMGREP_CONFIG: SemgrepScanConfig = {
  ...DEFAULT_SEMGREP_CONFIG,
  rulesets: ['p/typescript', 'p/csharp'],
  supplyChain: false,
};

/** Semgrep installation status */
export interface SemgrepInstallStatus {
  installed: boolean;
  version?: string;
  path?: string;
  error?: string;
}

/** Semgrep scan mode */
export type SemgrepMode = 'full' | 'limited' | 'unavailable';
