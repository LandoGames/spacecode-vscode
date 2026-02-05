// @ts-nocheck

/**
 * Semgrep Runner
 *
 * Spawns semgrep CLI, parses JSON output, and maps findings to SecurityFinding format.
 * Falls back gracefully when semgrep is not installed.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import {
  SemgrepRawOutput,
  SemgrepRawFinding,
  SemgrepScanConfig,
  SemgrepInstallStatus,
  SemgrepMode,
  DEFAULT_SEMGREP_CONFIG,
} from './SemgrepTypes';
import {
  SecurityFinding,
  SecuritySeverity,
  SecurityCategory,
  ScanError,
} from './types';

const execFileAsync = promisify(execFile);

/** Result of a semgrep scan */
export interface SemgrepScanResult {
  findings: SecurityFinding[];
  errors: ScanError[];
  filesScanned: string[];
  rulesRun: string[];
  rawOutput?: SemgrepRawOutput;
  mode: SemgrepMode;
  duration: number;
}

/** Map Semgrep severity to SecuritySeverity */
function mapSeverity(semgrepSeverity: string): SecuritySeverity {
  switch (semgrepSeverity) {
    case 'ERROR': return 'high';
    case 'WARNING': return 'medium';
    case 'INFO': return 'low';
    default: return 'info';
  }
}

/** Infer SecurityCategory from Semgrep metadata */
function inferCategory(finding: SemgrepRawFinding): SecurityCategory {
  const meta = finding.extra?.metadata || {};
  const checkId = finding.check_id.toLowerCase();
  const cat = (meta.category || '').toLowerCase();
  const subcats = (meta.subcategory || []).map(s => s.toLowerCase());

  // Check for secrets
  if (cat === 'security' && (checkId.includes('secret') || checkId.includes('key') || checkId.includes('token') || checkId.includes('password'))) {
    return 'secrets';
  }
  if (subcats.includes('secrets') || checkId.includes('generic.secrets')) {
    return 'secrets';
  }

  // Check for crypto
  if (checkId.includes('crypto') || checkId.includes('hash') || checkId.includes('cipher') || checkId.includes('md5') || checkId.includes('sha1')) {
    return 'crypto';
  }

  // Check for injection
  if (checkId.includes('injection') || checkId.includes('sqli') || checkId.includes('command-injection') || checkId.includes('path-traversal')) {
    return 'injection';
  }

  // Check for XSS
  if (checkId.includes('xss') || checkId.includes('cross-site')) {
    return 'xss';
  }

  // Check for deserialization
  if (checkId.includes('deserialization') || checkId.includes('deserialize')) {
    return 'deserialization';
  }

  // Check for auth
  if (checkId.includes('auth') || checkId.includes('permission') || checkId.includes('privilege')) {
    return 'auth';
  }

  // Check for network
  if (checkId.includes('http') || checkId.includes('ssl') || checkId.includes('tls') || checkId.includes('certificate')) {
    return 'network';
  }

  // Check for input validation
  if (checkId.includes('input') || checkId.includes('validation') || checkId.includes('sanitiz')) {
    return 'input_validation';
  }

  // Check for dependency/supply chain
  if (cat === 'supply-chain' || checkId.includes('dependency') || checkId.includes('supply-chain')) {
    return 'dependency';
  }

  // Default based on OWASP mapping
  const owasp = Array.isArray(meta.owasp) ? meta.owasp[0] : meta.owasp;
  if (owasp) {
    if (owasp.includes('A01')) return 'auth';
    if (owasp.includes('A02')) return 'crypto';
    if (owasp.includes('A03')) return 'injection';
    if (owasp.includes('A07')) return 'xss';
    if (owasp.includes('A08')) return 'deserialization';
  }

  return 'injection'; // Conservative default for security findings
}

/** Map fix difficulty from Semgrep confidence/impact */
function inferFixDifficulty(finding: SemgrepRawFinding): SecurityFinding['fixDifficulty'] {
  const meta = finding.extra?.metadata || {};
  const impact = (meta.impact || '').toUpperCase();
  if (impact === 'LOW') return 'trivial';
  if (impact === 'MEDIUM') return 'easy';
  if (impact === 'HIGH') return 'moderate';
  return 'easy';
}

/** Estimate false positive risk from confidence */
function inferFalsePositiveRisk(finding: SemgrepRawFinding): SecurityFinding['falsePositiveRisk'] {
  const meta = finding.extra?.metadata || {};
  const confidence = (meta.confidence || '').toUpperCase();
  if (confidence === 'HIGH') return 'low';
  if (confidence === 'MEDIUM') return 'medium';
  if (confidence === 'LOW') return 'high';
  return 'medium';
}

/** Convert a SemgrepRawFinding to SecurityFinding */
function mapToSecurityFinding(raw: SemgrepRawFinding, workspaceDir: string): SecurityFinding {
  const meta = raw.extra?.metadata || {};
  const cweRaw = meta.cwe;
  const cwe = Array.isArray(cweRaw) ? cweRaw[0] : cweRaw;
  const owaspRaw = meta.owasp;
  const owasp = Array.isArray(owaspRaw) ? owaspRaw[0] : owaspRaw;

  // Make path relative to workspace
  const relPath = raw.path.startsWith(workspaceDir)
    ? raw.path.slice(workspaceDir.length + 1)
    : raw.path;

  return {
    id: `semgrep-${raw.check_id}-${relPath}-${raw.start.line}`,
    category: inferCategory(raw),
    severity: mapSeverity(raw.extra.severity),
    scanType: 'mechanical',
    file: relPath,
    line: raw.start.line,
    endLine: raw.end.line,
    column: raw.start.col,
    endColumn: raw.end.col,
    title: raw.check_id.split('.').pop() || raw.check_id,
    description: raw.extra.message,
    evidence: raw.extra.lines || '',
    cweId: cwe,
    owaspCategory: owasp,
    suggestedFix: raw.extra.fix,
    fixDifficulty: inferFixDifficulty(raw),
    falsePositiveRisk: inferFalsePositiveRisk(raw),
    ruleId: raw.check_id,
    ruleName: raw.check_id,
    detectedAt: Date.now(),
  };
}

/**
 * SemgrepRunner — CLI wrapper for Semgrep SAST
 */
export class SemgrepRunner {
  private _workspaceDir: string;
  private _installStatus: SemgrepInstallStatus | null = null;

  constructor(workspaceDir: string) {
    this._workspaceDir = workspaceDir;
  }

  /** Check if semgrep is installed and get version */
  async checkInstalled(): Promise<SemgrepInstallStatus> {
    if (this._installStatus) return this._installStatus;

    try {
      const { stdout } = await execFileAsync('semgrep', ['--version'], {
        timeout: 10000,
        env: { ...process.env, PATH: this._getExpandedPath() },
      });

      const version = stdout.trim();
      this._installStatus = {
        installed: true,
        version,
        path: 'semgrep',
      };
    } catch (err: any) {
      // Try common install locations
      const commonPaths = [
        '/usr/local/bin/semgrep',
        '/opt/homebrew/bin/semgrep',
        path.join(process.env.HOME || '', '.local', 'bin', 'semgrep'),
        path.join(process.env.HOME || '', 'Library', 'Python', '3.11', 'bin', 'semgrep'),
        path.join(process.env.HOME || '', 'Library', 'Python', '3.12', 'bin', 'semgrep'),
      ];

      for (const semgrepPath of commonPaths) {
        try {
          const { stdout } = await execFileAsync(semgrepPath, ['--version'], { timeout: 10000 });
          this._installStatus = {
            installed: true,
            version: stdout.trim(),
            path: semgrepPath,
          };
          return this._installStatus;
        } catch { /* try next */ }
      }

      this._installStatus = {
        installed: false,
        error: err?.message || 'semgrep not found',
      };
    }

    return this._installStatus;
  }

  /** Get current semgrep mode */
  async getMode(): Promise<SemgrepMode> {
    const status = await this.checkInstalled();
    if (!status.installed) return 'unavailable';
    return 'full';
  }

  /** Reset cached install status (e.g., after user installs semgrep) */
  resetInstallCache(): void {
    this._installStatus = null;
  }

  /**
   * Run semgrep scan with given config
   */
  async scan(config: Partial<SemgrepScanConfig> = {}): Promise<SemgrepScanResult> {
    const startTime = Date.now();
    const cfg = { ...DEFAULT_SEMGREP_CONFIG, ...config };

    const status = await this.checkInstalled();
    if (!status.installed) {
      return {
        findings: [],
        errors: [{ ruleId: 'semgrep', message: 'Semgrep not installed', recoverable: true }],
        filesScanned: [],
        rulesRun: [],
        mode: 'unavailable',
        duration: Date.now() - startTime,
      };
    }

    const semgrepBin = status.path || 'semgrep';
    const args = this._buildArgs(cfg);

    try {
      const { stdout, stderr } = await execFileAsync(semgrepBin, args, {
        cwd: this._workspaceDir,
        timeout: cfg.timeoutSecs * 1000,
        maxBuffer: 10 * 1024 * 1024, // 10MB
        env: { ...process.env, PATH: this._getExpandedPath() },
      });

      const rawOutput: SemgrepRawOutput = JSON.parse(stdout);

      const findings = rawOutput.results.map(r => mapToSecurityFinding(r, this._workspaceDir));
      const filesScanned = rawOutput.paths?.scanned || [];
      const rulesRun = [...new Set(rawOutput.results.map(r => r.check_id))];

      const errors: ScanError[] = rawOutput.errors.map(e => ({
        ruleId: e.type,
        file: e.path,
        message: e.message,
        recoverable: true,
      }));

      return {
        findings,
        errors,
        filesScanned,
        rulesRun,
        rawOutput,
        mode: 'full',
        duration: Date.now() - startTime,
      };
    } catch (err: any) {
      // Semgrep exits with code 1 when findings exist, still produces valid JSON
      if (err.stdout) {
        try {
          const rawOutput: SemgrepRawOutput = JSON.parse(err.stdout);
          const findings = rawOutput.results.map(r => mapToSecurityFinding(r, this._workspaceDir));
          const filesScanned = rawOutput.paths?.scanned || [];
          const rulesRun = [...new Set(rawOutput.results.map(r => r.check_id))];
          const errors: ScanError[] = rawOutput.errors.map(e => ({
            ruleId: e.type,
            file: e.path,
            message: e.message,
            recoverable: true,
          }));

          return {
            findings,
            errors,
            filesScanned,
            rulesRun,
            rawOutput,
            mode: 'full',
            duration: Date.now() - startTime,
          };
        } catch { /* fallthrough */ }
      }

      return {
        findings: [],
        errors: [{ ruleId: 'semgrep', message: err?.message || 'Scan failed', recoverable: true }],
        filesScanned: [],
        rulesRun: [],
        mode: 'limited',
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Scan specific files only
   */
  async scanFiles(files: string[], config: Partial<SemgrepScanConfig> = {}): Promise<SemgrepScanResult> {
    return this.scan({
      ...config,
      targetPaths: files,
    });
  }

  /**
   * Run supply chain scan for dependency vulnerabilities
   */
  async scanSupplyChain(): Promise<SemgrepScanResult> {
    return this.scan({
      rulesets: ['p/supply-chain'],
      supplyChain: true,
      targetPaths: ['.'],
    });
  }

  /** Build semgrep CLI arguments */
  private _buildArgs(cfg: SemgrepScanConfig): string[] {
    const args: string[] = ['scan', '--json', '--quiet'];

    // Add rulesets
    for (const ruleset of cfg.rulesets) {
      args.push('--config', ruleset);
    }

    // Add custom rule paths
    for (const rulePath of cfg.customRulePaths) {
      args.push('--config', rulePath);
    }

    // Add exclude patterns
    for (const pattern of cfg.excludePatterns) {
      args.push('--exclude', pattern);
    }

    // Max file size
    if (cfg.maxFileSizeKb) {
      args.push('--max-target-bytes', String(cfg.maxFileSizeKb * 1024));
    }

    // Timeout per rule
    args.push('--timeout', String(Math.max(30, cfg.timeoutSecs)));

    // Supply chain flag
    if (cfg.supplyChain) {
      args.push('--supply-chain');
    }

    // Extra flags (user-defined)
    args.push(...cfg.extraFlags);

    // Target paths
    args.push(...cfg.targetPaths);

    return args;
  }

  /** Get PATH with common install locations appended */
  private _getExpandedPath(): string {
    const existing = process.env.PATH || '';
    const extras = [
      '/usr/local/bin',
      '/opt/homebrew/bin',
      path.join(process.env.HOME || '', '.local', 'bin'),
      path.join(process.env.HOME || '', 'Library', 'Python', '3.11', 'bin'),
      path.join(process.env.HOME || '', 'Library', 'Python', '3.12', 'bin'),
    ];
    return [existing, ...extras].join(path.delimiter);
  }
}

/** Singleton */
let _runner: SemgrepRunner | null = null;

export function getSemgrepRunner(workspaceDir?: string): SemgrepRunner {
  if (!_runner && workspaceDir) {
    _runner = new SemgrepRunner(workspaceDir);
  }
  return _runner!;
}

export function initSemgrepRunner(workspaceDir: string): SemgrepRunner {
  _runner = new SemgrepRunner(workspaceDir);
  return _runner;
}
