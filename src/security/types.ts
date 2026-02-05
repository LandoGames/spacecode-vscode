/**
 * Security Module Types
 *
 * Types for security scanning and vulnerability detection.
 */

/**
 * Severity levels for security findings
 */
export type SecuritySeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/**
 * Categories of security issues
 */
export type SecurityCategory =
  | 'secrets'              // API keys, tokens, passwords
  | 'credentials'          // Hardcoded credentials
  | 'injection'            // SQL, command, path injection
  | 'crypto'               // Weak cryptography
  | 'xss'                  // Cross-site scripting
  | 'deserialization'      // Unsafe deserialization
  | 'auth'                 // Authentication issues
  | 'network'              // Insecure network calls
  | 'dependency'           // Vulnerable dependencies
  | 'input_validation';    // Unvalidated input

/**
 * Type of scan
 */
export type ScanType = 'mechanical' | 'ai_assisted';

/**
 * A single security finding
 */
export interface SecurityFinding {
  id: string;
  category: SecurityCategory;
  severity: SecuritySeverity;
  scanType: ScanType;

  // Location
  file: string;
  line: number;
  endLine?: number;
  column?: number;
  endColumn?: number;

  // Details
  title: string;
  description: string;
  evidence: string;         // The actual code snippet that triggered the finding
  cweId?: string;           // Common Weakness Enumeration ID
  owaspCategory?: string;   // OWASP Top 10 category

  // Remediation
  suggestedFix?: string;
  fixDifficulty?: 'trivial' | 'easy' | 'moderate' | 'hard';
  falsePositiveRisk?: 'low' | 'medium' | 'high';

  // Metadata
  ruleId: string;
  ruleName: string;
  detectedAt: number;
}

/**
 * Result of a security scan
 */
export interface SecurityScanResult {
  scanId: string;
  startedAt: number;
  completedAt: number;
  duration: number;

  // Scope
  filesScanned: number;
  linesScanned: number;
  scannedPaths: string[];

  // Findings
  findings: SecurityFinding[];
  findingsBySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  findingsByCategory: Record<SecurityCategory, number>;

  // Summary
  passed: boolean;         // No critical/high findings
  score: number;           // 0-100 security score
  summary: string;

  // Metadata
  rulesRun: string[];
  skippedRules: string[];
  errors: ScanError[];
}

/**
 * Error during scanning
 */
export interface ScanError {
  ruleId: string;
  file?: string;
  message: string;
  recoverable: boolean;
}

/**
 * Security rule definition
 */
export interface SecurityRule {
  id: string;
  name: string;
  description: string;
  category: SecurityCategory;
  severity: SecuritySeverity;
  scanType: ScanType;
  enabled: boolean;
  priority: 'P0' | 'P1' | 'P2' | 'P3';

  // For regex-based rules
  patterns?: RegExp[];
  filePatterns?: string[];  // Glob patterns for files to scan
  excludePatterns?: string[]; // Glob patterns for files to exclude

  // CWE/OWASP mapping
  cweId?: string;
  owaspCategory?: string;
}

/**
 * Secret pattern for detection
 */
export interface SecretPattern {
  name: string;
  pattern: RegExp;
  severity: SecuritySeverity;
  description: string;
  falsePositiveHints?: string[];
}

/**
 * Dependency vulnerability
 */
export interface DependencyVulnerability {
  package: string;
  version: string;
  vulnerableVersions: string;
  fixedVersion?: string;
  cveId: string;
  severity: SecuritySeverity;
  title: string;
  description: string;
  url?: string;
}

/**
 * Dependency scan result
 */
export interface DependencyScanResult {
  scannedAt: number;
  packageManager: 'npm' | 'nuget' | 'unity';
  totalDependencies: number;
  vulnerabilities: DependencyVulnerability[];
  vulnerabilitiesBySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

/**
 * Options for security scanning
 */
export interface SecurityScanOptions {
  // Scope
  paths?: string[];
  excludePaths?: string[];
  fileTypes?: string[];

  // What to scan
  runSecretScan: boolean;
  runCredentialScan: boolean;
  runInjectionScan: boolean;
  runCryptoScan: boolean;
  runDependencyScan: boolean;

  // Filtering
  minSeverity?: SecuritySeverity;
  categories?: SecurityCategory[];

  // Performance
  maxFileSizeKb?: number;
  maxFilesToScan?: number;
  timeoutMs?: number;

  // Reporting
  includeSuppressed?: boolean;
  groupByFile?: boolean;
}

/**
 * Default scan options
 */
export const DEFAULT_SECURITY_SCAN_OPTIONS: SecurityScanOptions = {
  runSecretScan: true,
  runCredentialScan: true,
  runInjectionScan: true,
  runCryptoScan: true,
  runDependencyScan: true,
  minSeverity: 'low',
  maxFileSizeKb: 1024,  // 1MB
  maxFilesToScan: 1000,
  timeoutMs: 60000,     // 1 minute
  includeSuppressed: false,
  groupByFile: true
};

/**
 * Security suppression comment patterns
 */
export const SUPPRESSION_PATTERNS = [
  /\/\/\s*spacecode-ignore-security/i,
  /\/\/\s*security-ignore/i,
  /\/\*\s*spacecode-ignore-security\s*\*\//i,
  /#\s*spacecode-ignore-security/i
];

/**
 * Handoff request to QA Engineer for fixing
 */
export interface SecurityFixHandoff {
  finding: SecurityFinding;
  targetPersona: 'qa-engineer';
  context: string;
  suggestedApproach: string;
  priority: 'immediate' | 'soon' | 'backlog';
}

/**
 * Security report format
 */
export interface SecurityReport {
  title: string;
  generatedAt: number;
  scan: SecurityScanResult;
  dependencyScan?: DependencyScanResult;
  summary: {
    totalFindings: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    passedChecks: string[];
    failedChecks: string[];
  };
  recommendations: string[];
  exportFormat: 'markdown' | 'json' | 'sarif';
}
