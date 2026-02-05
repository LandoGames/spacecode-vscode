/**
 * Security Scanner
 *
 * Main orchestrator for security scanning. Combines all scanners
 * and produces a unified security scan result.
 */

import * as vscode from 'vscode';
import {
  SecurityFinding,
  SecurityScanResult,
  SecurityScanOptions,
  SecurityCategory,
  SecuritySeverity,
  SecurityReport,
  SecurityFixHandoff,
  DEFAULT_SECURITY_SCAN_OPTIONS,
  ScanError
} from './types';
import { SecretScanner, getSecretScanner } from './SecretScanner';
import { CryptoScanner, getCryptoScanner } from './CryptoScanner';
import { InjectionScanner, getInjectionScanner } from './InjectionScanner';
import { SemgrepRunner, getSemgrepRunner, initSemgrepRunner } from './SemgrepRunner';
import { SemgrepRulesManager, getSemgrepRulesManager, initSemgrepRulesManager } from './SemgrepRules';
import { SemgrepMode } from './SemgrepTypes';

/**
 * Security Scanner class
 *
 * Uses Semgrep as primary scan engine when available, falls back to
 * built-in regex scanners when Semgrep is not installed.
 */
export class SecurityScanner {
  private _secretScanner: SecretScanner;
  private _cryptoScanner: CryptoScanner;
  private _injectionScanner: InjectionScanner;
  private _semgrepRunner: SemgrepRunner | null = null;
  private _rulesManager: SemgrepRulesManager | null = null;
  private _semgrepMode: SemgrepMode = 'unavailable';

  constructor() {
    this._secretScanner = getSecretScanner();
    this._cryptoScanner = getCryptoScanner();
    this._injectionScanner = getInjectionScanner();

    // Initialize semgrep if workspace is available
    const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceDir) {
      this._semgrepRunner = initSemgrepRunner(workspaceDir);
      this._rulesManager = initSemgrepRulesManager(workspaceDir);
    }
  }

  /** Get current Semgrep mode */
  async getSemgrepMode(): Promise<SemgrepMode> {
    if (this._semgrepRunner) {
      this._semgrepMode = await this._semgrepRunner.getMode();
    }
    return this._semgrepMode;
  }

  /** Get Semgrep install status */
  async getSemgrepStatus() {
    if (!this._semgrepRunner) return { installed: false, error: 'No workspace' };
    return this._semgrepRunner.checkInstalled();
  }

  /** Get rules manager */
  getRulesManager(): SemgrepRulesManager | null {
    return this._rulesManager;
  }

  /**
   * Run a full security scan
   *
   * Strategy: Try Semgrep first (if installed), then augment with built-in
   * regex scanners for areas Semgrep doesn't cover. If Semgrep is unavailable,
   * fall back entirely to regex scanners.
   */
  async scan(
    options: Partial<SecurityScanOptions> = {}
  ): Promise<SecurityScanResult> {
    const opts = { ...DEFAULT_SECURITY_SCAN_OPTIONS, ...options };
    const startTime = Date.now();
    const scanId = `scan-${startTime}-${Math.random().toString(36).slice(2, 8)}`;

    const findings: SecurityFinding[] = [];
    const errors: ScanError[] = [];
    const rulesRun: string[] = [];
    const skippedRules: string[] = [];

    // Get workspace folder
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!workspaceFolder) {
      return this._createEmptyResult(scanId, startTime, 'No workspace folder found');
    }

    // Count files and lines
    let filesScanned = 0;
    let linesScanned = 0;
    const scannedPaths: string[] = [];

    try {
      // === Phase 1: Semgrep scan (primary engine) ===
      const semgrepMode = await this.getSemgrepMode();
      let semgrepRan = false;

      if (semgrepMode === 'full' && this._semgrepRunner && this._rulesManager) {
        rulesRun.push('semgrep-sast');
        try {
          const profileId = (options as any).semgrepProfile || 'security-full';
          const config = this._rulesManager.buildConfig(profileId);
          const semgrepResult = await this._semgrepRunner.scan(config);

          findings.push(...semgrepResult.findings);
          scannedPaths.push(...semgrepResult.filesScanned);
          rulesRun.push(...semgrepResult.rulesRun);
          errors.push(...semgrepResult.errors);
          semgrepRan = true;
        } catch (error) {
          errors.push({
            ruleId: 'semgrep-sast',
            message: error instanceof Error ? error.message : 'Semgrep scan failed',
            recoverable: true
          });
        }
      }

      // === Phase 2: Built-in regex scanners (fallback or augmentation) ===
      // When Semgrep ran, only use regex scanners for areas Semgrep doesn't cover well.
      // When Semgrep didn't run, use all regex scanners as full fallback.

      // Secret scanner — always run (catches project-specific patterns Semgrep may miss)
      if (opts.runSecretScan) {
        rulesRun.push('secret-scanner');
        try {
          const secretFindings = await this._secretScanner.scanWorkspace(workspaceFolder, {
            maxFiles: opts.maxFilesToScan
          });
          // Deduplicate: skip regex findings that overlap with Semgrep findings
          const deduped = semgrepRan
            ? this._deduplicateFindings(secretFindings, findings)
            : secretFindings;
          findings.push(...deduped);
        } catch (error) {
          errors.push({
            ruleId: 'secret-scanner',
            message: error instanceof Error ? error.message : 'Unknown error',
            recoverable: true
          });
        }
      } else {
        skippedRules.push('secret-scanner');
      }

      // Crypto scanner — run as fallback only when Semgrep didn't run
      if (opts.runCryptoScan && !semgrepRan) {
        rulesRun.push('crypto-scanner');
        try {
          const cryptoFindings = await this._cryptoScanner.scanWorkspace(workspaceFolder, {
            maxFiles: opts.maxFilesToScan
          });
          findings.push(...cryptoFindings);
        } catch (error) {
          errors.push({
            ruleId: 'crypto-scanner',
            message: error instanceof Error ? error.message : 'Unknown error',
            recoverable: true
          });
        }
      } else if (!semgrepRan) {
        skippedRules.push('crypto-scanner');
      }

      // Injection scanner — run as fallback only when Semgrep didn't run
      if (opts.runInjectionScan && !semgrepRan) {
        rulesRun.push('injection-scanner');
        try {
          const injectionFindings = await this._injectionScanner.scanWorkspace(workspaceFolder, {
            maxFiles: opts.maxFilesToScan
          });
          findings.push(...injectionFindings);
        } catch (error) {
          errors.push({
            ruleId: 'injection-scanner',
            message: error instanceof Error ? error.message : 'Unknown error',
            recoverable: true
          });
        }
      } else if (!semgrepRan) {
        skippedRules.push('injection-scanner');
      }

      // Count unique files scanned
      const uniqueFiles = new Set(findings.map(f => f.file));
      filesScanned = Math.max(uniqueFiles.size, scannedPaths.length);
      if (scannedPaths.length === 0) scannedPaths.push(...uniqueFiles);

    } catch (error) {
      errors.push({
        ruleId: 'security-scanner',
        message: error instanceof Error ? error.message : 'Unknown error',
        recoverable: false
      });
    }

    const completedAt = Date.now();

    // Filter by severity if specified
    let filteredFindings = findings;
    if (opts.minSeverity) {
      const severityOrder: SecuritySeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
      const minIndex = severityOrder.indexOf(opts.minSeverity);
      filteredFindings = findings.filter(f =>
        severityOrder.indexOf(f.severity) <= minIndex
      );
    }

    // Filter by categories if specified
    if (opts.categories && opts.categories.length > 0) {
      filteredFindings = filteredFindings.filter(f =>
        opts.categories!.includes(f.category)
      );
    }

    // Calculate stats
    const findingsBySeverity = this._countBySeverity(filteredFindings);
    const findingsByCategory = this._countByCategory(filteredFindings);

    // Calculate score (100 = no issues, decreases with findings)
    const score = this._calculateScore(findingsBySeverity);

    // Check if passed (no critical or high findings)
    const passed = findingsBySeverity.critical === 0 && findingsBySeverity.high === 0;

    // Generate summary
    const summary = this._generateSummary(filteredFindings, findingsBySeverity, passed);

    return {
      scanId,
      startedAt: startTime,
      completedAt,
      duration: completedAt - startTime,
      filesScanned,
      linesScanned,
      scannedPaths,
      findings: filteredFindings,
      findingsBySeverity,
      findingsByCategory,
      passed,
      score,
      summary,
      rulesRun,
      skippedRules,
      errors
    };
  }

  /**
   * Scan a single file
   */
  async scanFile(
    filePath: string,
    content: string,
    options: Partial<SecurityScanOptions> = {}
  ): Promise<SecurityFinding[]> {
    const opts = { ...DEFAULT_SECURITY_SCAN_OPTIONS, ...options };
    const findings: SecurityFinding[] = [];

    if (opts.runSecretScan) {
      const secretFindings = await this._secretScanner.scanFile(filePath, content);
      findings.push(...secretFindings);
    }

    if (opts.runCryptoScan) {
      const cryptoFindings = await this._cryptoScanner.scanFile(filePath, content);
      findings.push(...cryptoFindings);
    }

    if (opts.runInjectionScan) {
      const injectionFindings = await this._injectionScanner.scanFile(filePath, content);
      findings.push(...injectionFindings);
    }

    return findings;
  }

  /**
   * Generate a security report
   */
  generateReport(
    result: SecurityScanResult,
    format: 'markdown' | 'json' | 'sarif' = 'markdown'
  ): SecurityReport {
    const report: SecurityReport = {
      title: 'SpaceCode Security Scan Report',
      generatedAt: Date.now(),
      scan: result,
      summary: {
        totalFindings: result.findings.length,
        criticalCount: result.findingsBySeverity.critical,
        highCount: result.findingsBySeverity.high,
        mediumCount: result.findingsBySeverity.medium,
        lowCount: result.findingsBySeverity.low,
        passedChecks: result.rulesRun.filter(r => !result.errors.some(e => e.ruleId === r)),
        failedChecks: result.errors.map(e => e.ruleId)
      },
      recommendations: this._generateRecommendations(result),
      exportFormat: format
    };

    return report;
  }

  /**
   * Export report as markdown
   */
  exportAsMarkdown(report: SecurityReport): string {
    const { scan, summary } = report;

    let md = `# ${report.title}\n\n`;
    md += `**Generated**: ${new Date(report.generatedAt).toISOString()}\n`;
    md += `**Duration**: ${scan.duration}ms\n`;
    md += `**Files Scanned**: ${scan.filesScanned}\n\n`;

    md += `## Summary\n\n`;
    md += `| Severity | Count |\n`;
    md += `|----------|-------|\n`;
    md += `| 🔴 Critical | ${summary.criticalCount} |\n`;
    md += `| 🟠 High | ${summary.highCount} |\n`;
    md += `| 🟡 Medium | ${summary.mediumCount} |\n`;
    md += `| 🟢 Low | ${summary.lowCount} |\n\n`;

    md += `**Status**: ${scan.passed ? '✅ PASSED' : '❌ FAILED'}\n`;
    md += `**Score**: ${scan.score}/100\n\n`;

    if (scan.findings.length > 0) {
      md += `## Findings\n\n`;

      // Group by severity
      const severities: SecuritySeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
      for (const severity of severities) {
        const sevFindings = scan.findings.filter(f => f.severity === severity);
        if (sevFindings.length === 0) continue;

        md += `### ${severity.toUpperCase()} (${sevFindings.length})\n\n`;

        for (const finding of sevFindings) {
          md += `#### ${finding.title}\n\n`;
          md += `- **File**: \`${finding.file}:${finding.line}\`\n`;
          md += `- **Category**: ${finding.category}\n`;
          md += `- **Description**: ${finding.description}\n`;
          if (finding.evidence) {
            md += `- **Evidence**: \`${finding.evidence}\`\n`;
          }
          if (finding.suggestedFix) {
            md += `- **Fix**: ${finding.suggestedFix}\n`;
          }
          if (finding.cweId) {
            md += `- **CWE**: ${finding.cweId}\n`;
          }
          md += '\n';
        }
      }
    }

    if (report.recommendations.length > 0) {
      md += `## Recommendations\n\n`;
      for (const rec of report.recommendations) {
        md += `- ${rec}\n`;
      }
    }

    md += `\n---\n*Generated by SpaceCode Security Scanner*\n`;

    return md;
  }

  /**
   * Create a handoff request to QA Engineer for fixing
   */
  createFixHandoff(finding: SecurityFinding): SecurityFixHandoff {
    return {
      finding,
      targetPersona: 'qa-engineer',
      context: `Security vulnerability found:\n\n` +
        `**${finding.title}** (${finding.severity.toUpperCase()})\n` +
        `File: ${finding.file}:${finding.line}\n` +
        `Evidence: ${finding.evidence}\n\n` +
        `${finding.description}`,
      suggestedApproach: finding.suggestedFix || 'Review and fix the security issue',
      priority: finding.severity === 'critical' ? 'immediate' :
        finding.severity === 'high' ? 'soon' : 'backlog'
    };
  }

  /**
   * Deduplicate regex findings against Semgrep findings.
   * If a regex finding matches the same file+line as a Semgrep finding, skip it.
   */
  private _deduplicateFindings(
    newFindings: SecurityFinding[],
    existing: SecurityFinding[]
  ): SecurityFinding[] {
    const existingKeys = new Set(
      existing.map(f => `${f.file}:${f.line}:${f.category}`)
    );
    return newFindings.filter(f => !existingKeys.has(`${f.file}:${f.line}:${f.category}`));
  }

  /**
   * Run a Semgrep-only scan with a specific profile
   */
  async scanWithProfile(profileId: string): Promise<SecurityScanResult> {
    const startTime = Date.now();
    const scanId = `scan-${startTime}-${Math.random().toString(36).slice(2, 8)}`;

    if (!this._semgrepRunner || !this._rulesManager) {
      return this._createEmptyResult(scanId, startTime, 'Semgrep not available');
    }

    const config = this._rulesManager.buildConfig(profileId);
    const result = await this._semgrepRunner.scan(config);

    const findingsBySeverity = this._countBySeverity(result.findings);
    const findingsByCategory = this._countByCategory(result.findings);
    const score = this._calculateScore(findingsBySeverity);
    const passed = findingsBySeverity.critical === 0 && findingsBySeverity.high === 0;

    return {
      scanId,
      startedAt: startTime,
      completedAt: Date.now(),
      duration: result.duration,
      filesScanned: result.filesScanned.length,
      linesScanned: 0,
      scannedPaths: result.filesScanned,
      findings: result.findings,
      findingsBySeverity,
      findingsByCategory,
      passed,
      score,
      summary: this._generateSummary(result.findings, findingsBySeverity, passed),
      rulesRun: result.rulesRun,
      skippedRules: [],
      errors: result.errors,
    };
  }

  /**
   * Create empty result
   */
  private _createEmptyResult(
    scanId: string,
    startTime: number,
    message: string
  ): SecurityScanResult {
    return {
      scanId,
      startedAt: startTime,
      completedAt: Date.now(),
      duration: Date.now() - startTime,
      filesScanned: 0,
      linesScanned: 0,
      scannedPaths: [],
      findings: [],
      findingsBySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      findingsByCategory: {} as Record<SecurityCategory, number>,
      passed: true,
      score: 100,
      summary: message,
      rulesRun: [],
      skippedRules: [],
      errors: []
    };
  }

  /**
   * Count findings by severity
   */
  private _countBySeverity(findings: SecurityFinding[]): SecurityScanResult['findingsBySeverity'] {
    return {
      critical: findings.filter(f => f.severity === 'critical').length,
      high: findings.filter(f => f.severity === 'high').length,
      medium: findings.filter(f => f.severity === 'medium').length,
      low: findings.filter(f => f.severity === 'low').length,
      info: findings.filter(f => f.severity === 'info').length
    };
  }

  /**
   * Count findings by category
   */
  private _countByCategory(findings: SecurityFinding[]): Record<SecurityCategory, number> {
    const counts: Partial<Record<SecurityCategory, number>> = {};
    for (const finding of findings) {
      counts[finding.category] = (counts[finding.category] || 0) + 1;
    }
    return counts as Record<SecurityCategory, number>;
  }

  /**
   * Calculate security score
   */
  private _calculateScore(bySeverity: SecurityScanResult['findingsBySeverity']): number {
    // Start at 100, deduct points for findings
    let score = 100;
    score -= bySeverity.critical * 25;  // Critical = -25 each
    score -= bySeverity.high * 10;      // High = -10 each
    score -= bySeverity.medium * 3;     // Medium = -3 each
    score -= bySeverity.low * 1;        // Low = -1 each
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate summary text
   */
  private _generateSummary(
    findings: SecurityFinding[],
    bySeverity: SecurityScanResult['findingsBySeverity'],
    passed: boolean
  ): string {
    if (findings.length === 0) {
      return 'No security issues found. Great job!';
    }

    const parts: string[] = [];

    if (bySeverity.critical > 0) {
      parts.push(`${bySeverity.critical} critical`);
    }
    if (bySeverity.high > 0) {
      parts.push(`${bySeverity.high} high`);
    }
    if (bySeverity.medium > 0) {
      parts.push(`${bySeverity.medium} medium`);
    }
    if (bySeverity.low > 0) {
      parts.push(`${bySeverity.low} low`);
    }

    const status = passed ? 'Review recommended' : 'Action required';
    return `Found ${findings.length} issue(s): ${parts.join(', ')}. ${status}.`;
  }

  /**
   * Generate recommendations based on findings
   */
  private _generateRecommendations(result: SecurityScanResult): string[] {
    const recommendations: string[] = [];
    const categories = new Set(result.findings.map(f => f.category));

    if (categories.has('secrets')) {
      recommendations.push('Move secrets to environment variables or a secrets manager');
      recommendations.push('Add .env files to .gitignore');
    }

    if (categories.has('crypto')) {
      recommendations.push('Update cryptographic algorithms to use current standards (SHA-256, AES-256)');
    }

    if (categories.has('injection')) {
      recommendations.push('Use parameterized queries and prepared statements');
      recommendations.push('Validate and sanitize all user input');
    }

    if (result.findingsBySeverity.critical > 0) {
      recommendations.push('Address critical findings immediately before deployment');
    }

    return recommendations;
  }
}

/**
 * Singleton instance
 */
let _securityScanner: SecurityScanner | null = null;

export function getSecurityScanner(): SecurityScanner {
  if (!_securityScanner) {
    _securityScanner = new SecurityScanner();
  }
  return _securityScanner;
}
