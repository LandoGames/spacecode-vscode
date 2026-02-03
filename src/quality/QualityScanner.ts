/**
 * Quality Scanner
 *
 * Main orchestrator for code quality analysis.
 * Combines duplication, magic values, dead code, and complexity scanners.
 */

import * as vscode from 'vscode';
import {
  QualityFinding,
  QualitySeverity,
  QualityCategory,
  QualityScanResult,
  QualityScanOptions,
  QualityReport
} from './types';
import { DuplicationScanner, getDuplicationScanner } from './DuplicationScanner';
import { MagicValueScanner, getMagicValueScanner } from './MagicValueScanner';
import { DeadCodeScanner, getDeadCodeScanner } from './DeadCodeScanner';
import { ComplexityAnalyzer, getComplexityAnalyzer } from './ComplexityAnalyzer';

/**
 * Default options for quality scanning
 */
const DEFAULT_OPTIONS: QualityScanOptions = {
  exclude: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/out/**',
    '**/.git/**',
    '**/Library/**',
    '**/Temp/**'
  ],
  minSeverity: 'info',
  categories: ['duplication', 'magic-value', 'dead-code', 'complexity', 'coupling', 'unity-specific'],
  thresholds: {
    minScore: 70,
    maxComplexity: 20,
    maxDuplication: 10,
    maxDeadCode: 5
  },
  unityChecks: true
};

let _instance: QualityScanner | undefined;

export function getQualityScanner(): QualityScanner {
  if (!_instance) {
    _instance = new QualityScanner();
  }
  return _instance;
}

export class QualityScanner {
  private duplicationScanner: DuplicationScanner;
  private magicValueScanner: MagicValueScanner;
  private deadCodeScanner: DeadCodeScanner;
  private complexityAnalyzer: ComplexityAnalyzer;

  constructor() {
    this.duplicationScanner = getDuplicationScanner();
    this.magicValueScanner = getMagicValueScanner();
    this.deadCodeScanner = getDeadCodeScanner();
    this.complexityAnalyzer = getComplexityAnalyzer();
  }

  /**
   * Run full quality scan on workspace
   */
  async scan(options?: QualityScanOptions): Promise<QualityScanResult> {
    const startTime = Date.now();
    const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
    const allFindings: QualityFinding[] = [];

    // Count files to scan
    const workspaceFolders = vscode.workspace.workspaceFolders;
    let filesScanned = 0;

    if (workspaceFolders) {
      const pattern = '**/*.{ts,js,tsx,jsx,cs}';
      const excludePattern = `{${mergedOptions.exclude?.join(',') || ''}}`;
      const files = await vscode.workspace.findFiles(pattern, excludePattern, 1000);
      filesScanned = files.length;
    }

    // Run all scanners in parallel
    const [
      duplicationFindings,
      magicValueFindings,
      deadCodeFindings,
      complexityFindings
    ] = await Promise.all([
      mergedOptions.categories?.includes('duplication')
        ? this.duplicationScanner.scanWorkspace(mergedOptions)
        : Promise.resolve([]),
      mergedOptions.categories?.includes('magic-value')
        ? this.magicValueScanner.scanWorkspace(mergedOptions)
        : Promise.resolve([]),
      mergedOptions.categories?.includes('dead-code')
        ? this.deadCodeScanner.scanWorkspace(mergedOptions)
        : Promise.resolve([]),
      mergedOptions.categories?.includes('complexity') ||
      mergedOptions.categories?.includes('coupling') ||
      mergedOptions.categories?.includes('unity-specific')
        ? this.complexityAnalyzer.scanWorkspace(mergedOptions)
        : Promise.resolve([])
    ]);

    allFindings.push(...duplicationFindings);
    allFindings.push(...magicValueFindings);
    allFindings.push(...deadCodeFindings);
    allFindings.push(...complexityFindings);

    // Filter by minimum severity
    const filteredFindings = this.filterBySeverity(allFindings, mergedOptions.minSeverity || 'info');

    // Calculate metrics
    const summary = this.calculateSummary(filteredFindings);
    const score = this.calculateScore(filteredFindings, filesScanned);
    const metrics = this.calculateMetrics(filteredFindings, filesScanned);

    const duration = Date.now() - startTime;

    return {
      completedAt: Date.now(),
      duration,
      filesScanned,
      findings: filteredFindings,
      score,
      passed: score >= (mergedOptions.thresholds?.minScore || 70),
      summary,
      metrics
    };
  }

  /**
   * Scan a single file
   */
  async scanFile(filePath: string, options?: QualityScanOptions): Promise<QualityFinding[]> {
    const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
    const allFindings: QualityFinding[] = [];

    const [
      duplicationFindings,
      magicValueFindings,
      deadCodeFindings,
      complexityFindings
    ] = await Promise.all([
      this.duplicationScanner.scanFiles([filePath]),
      this.magicValueScanner.scanFile(filePath),
      this.deadCodeScanner.scanFile(filePath),
      this.complexityAnalyzer.analyzeFileComplexity(filePath).then(() =>
        this.complexityAnalyzer.scanWorkspace({ ...mergedOptions, include: [filePath] })
      )
    ]);

    allFindings.push(...duplicationFindings);
    allFindings.push(...magicValueFindings);
    allFindings.push(...deadCodeFindings);
    allFindings.push(...complexityFindings);

    return this.filterBySeverity(allFindings, mergedOptions.minSeverity || 'info');
  }

  /**
   * Generate quality report
   */
  async generateReport(result: QualityScanResult): Promise<QualityReport> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const projectName = workspaceFolders?.[0]?.name || 'Unknown Project';

    // Get top issues (highest severity, then by count)
    const topIssues = [...result.findings]
      .sort((a, b) => {
        const severityOrder = { critical: 0, error: 1, warning: 2, info: 3 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      })
      .slice(0, 10);

    // Generate recommendations
    const recommendations = this.generateRecommendations(result);

    return {
      generatedAt: Date.now(),
      projectName,
      scanResult: result,
      topIssues,
      recommendations
    };
  }

  /**
   * Export report as markdown
   */
  exportAsMarkdown(report: QualityReport): string {
    const lines: string[] = [
      `# Code Quality Report: ${report.projectName}`,
      '',
      `**Generated:** ${new Date(report.generatedAt).toISOString()}`,
      `**Score:** ${report.scanResult.score}/100 ${report.scanResult.passed ? '✅' : '❌'}`,
      `**Files Scanned:** ${report.scanResult.filesScanned}`,
      `**Duration:** ${report.scanResult.duration}ms`,
      '',
      '## Summary',
      '',
      '| Category | Count |',
      '|----------|-------|',
    ];

    for (const [category, count] of Object.entries(report.scanResult.summary.byCategory)) {
      if (count > 0) {
        lines.push(`| ${category} | ${count} |`);
      }
    }

    lines.push('');
    lines.push('| Severity | Count |');
    lines.push('|----------|-------|');

    for (const [severity, count] of Object.entries(report.scanResult.summary.bySeverity)) {
      if (count > 0) {
        lines.push(`| ${severity} | ${count} |`);
      }
    }

    lines.push('');
    lines.push('## Metrics');
    lines.push('');
    lines.push(`- **Average Complexity:** ${report.scanResult.metrics.averageComplexity.toFixed(1)}`);
    lines.push(`- **Maintainability Index:** ${report.scanResult.metrics.averageMaintainability.toFixed(1)}`);
    lines.push(`- **Duplicate Code:** ${report.scanResult.metrics.duplicateLinePercentage.toFixed(1)}%`);
    lines.push(`- **Dead Code:** ${report.scanResult.metrics.deadCodePercentage.toFixed(1)}%`);

    if (report.topIssues.length > 0) {
      lines.push('');
      lines.push('## Top Issues');
      lines.push('');

      for (const issue of report.topIssues) {
        const relativePath = this.getRelativePath(issue.file);
        lines.push(`### ${issue.severity.toUpperCase()}: ${issue.message}`);
        lines.push(`- **File:** ${relativePath}:${issue.line}`);
        lines.push(`- **Category:** ${issue.category}`);
        if (issue.suggestion) {
          lines.push(`- **Suggestion:** ${issue.suggestion}`);
        }
        lines.push('');
      }
    }

    if (report.recommendations.length > 0) {
      lines.push('## Recommendations');
      lines.push('');
      for (const rec of report.recommendations) {
        lines.push(`- ${rec}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Filter findings by minimum severity
   */
  private filterBySeverity(findings: QualityFinding[], minSeverity: QualitySeverity): QualityFinding[] {
    const severityOrder = { info: 0, warning: 1, error: 2, critical: 3 };
    const minLevel = severityOrder[minSeverity];

    return findings.filter(f => severityOrder[f.severity] >= minLevel);
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(findings: QualityFinding[]): QualityScanResult['summary'] {
    const byCategory: Record<QualityCategory, number> = {
      'duplication': 0,
      'magic-value': 0,
      'dead-code': 0,
      'complexity': 0,
      'coupling': 0,
      'naming': 0,
      'unity-specific': 0
    };

    const bySeverity: Record<QualitySeverity, number> = {
      info: 0,
      warning: 0,
      error: 0,
      critical: 0
    };

    for (const finding of findings) {
      byCategory[finding.category]++;
      bySeverity[finding.severity]++;
    }

    return {
      total: findings.length,
      byCategory,
      bySeverity
    };
  }

  /**
   * Calculate quality score (0-100)
   */
  private calculateScore(findings: QualityFinding[], filesScanned: number): number {
    if (filesScanned === 0) return 100;

    // Weight by severity
    const weights = { info: 1, warning: 3, error: 5, critical: 10 };
    let totalPenalty = 0;

    for (const finding of findings) {
      totalPenalty += weights[finding.severity];
    }

    // Normalize by file count
    const normalizedPenalty = totalPenalty / filesScanned;

    // Convert to score (higher penalty = lower score)
    // 0 penalty = 100, 10+ penalty per file = 0
    const score = Math.max(0, Math.min(100, 100 - normalizedPenalty * 10));

    return Math.round(score);
  }

  /**
   * Calculate quality metrics
   */
  private calculateMetrics(
    findings: QualityFinding[],
    filesScanned: number
  ): QualityScanResult['metrics'] {
    // Calculate average complexity from complexity findings
    const complexityFindings = findings.filter(f => f.metrics?.complexity);
    const avgComplexity = complexityFindings.length > 0
      ? complexityFindings.reduce((sum, f) => sum + (f.metrics?.complexity || 0), 0) / complexityFindings.length
      : 5; // Default low complexity

    // Estimate maintainability
    const avgMaintainability = Math.max(0, 100 - avgComplexity * 3);

    // Estimate duplication percentage
    const duplicationFindings = findings.filter(f => f.category === 'duplication');
    const duplicateLinePercentage = filesScanned > 0
      ? (duplicationFindings.length * 6 / (filesScanned * 100)) * 100 // Rough estimate
      : 0;

    // Estimate dead code percentage
    const deadCodeFindings = findings.filter(f => f.category === 'dead-code');
    const deadCodePercentage = filesScanned > 0
      ? (deadCodeFindings.length / (filesScanned * 10)) * 100 // Rough estimate
      : 0;

    return {
      averageComplexity: avgComplexity,
      averageMaintainability: avgMaintainability,
      duplicateLinePercentage: Math.min(100, duplicateLinePercentage),
      deadCodePercentage: Math.min(100, deadCodePercentage)
    };
  }

  /**
   * Generate improvement recommendations
   */
  private generateRecommendations(result: QualityScanResult): string[] {
    const recommendations: string[] = [];

    // Based on category counts
    if (result.summary.byCategory.duplication > 5) {
      recommendations.push('Consider extracting duplicated code into shared utilities or base classes');
    }

    if (result.summary.byCategory['magic-value'] > 10) {
      recommendations.push('Create a constants file to centralize magic numbers and strings');
    }

    if (result.summary.byCategory['dead-code'] > 5) {
      recommendations.push('Run a dead code elimination pass to remove unused code');
    }

    if (result.summary.byCategory.complexity > 3) {
      recommendations.push('Refactor complex functions using extract-method pattern');
    }

    if (result.summary.byCategory.coupling > 2) {
      recommendations.push('Reduce coupling by introducing interfaces and dependency injection');
    }

    if (result.summary.byCategory['unity-specific'] > 0) {
      recommendations.push('Review Unity performance best practices for Update loop optimizations');
    }

    // Based on severity
    if (result.summary.bySeverity.critical > 0) {
      recommendations.push('Address critical issues immediately as they may cause runtime errors');
    }

    if (result.summary.bySeverity.error > 5) {
      recommendations.push('Schedule time to address error-level issues in the next sprint');
    }

    // Based on score
    if (result.score < 50) {
      recommendations.push('Consider a dedicated refactoring sprint to improve code health');
    } else if (result.score < 70) {
      recommendations.push('Allocate 20% of sprint time to technical debt reduction');
    }

    return recommendations;
  }

  /**
   * Get relative path from workspace
   */
  private getRelativePath(absolutePath: string): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
      for (const folder of workspaceFolders) {
        if (absolutePath.startsWith(folder.uri.fsPath)) {
          return absolutePath.slice(folder.uri.fsPath.length + 1);
        }
      }
    }
    return absolutePath;
  }
}
