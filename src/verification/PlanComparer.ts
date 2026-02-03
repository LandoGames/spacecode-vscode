/**
 * Plan Comparer
 *
 * Compares actual git diff against planned changes.
 */

import { Plan, PlanPhase, PlanStep } from '../planning/types';
import {
  DiffScanResult,
  ScannedFile,
  PlanComparisonResult,
  FileMatch,
  UnexpectedChange,
  MissingChange
} from './types';

/**
 * Plan Comparer class
 */
export class PlanComparer {
  /**
   * Compare diff against plan
   */
  compare(plan: Plan, diff: DiffScanResult): PlanComparisonResult {
    // Extract all planned files from the plan
    const plannedFiles = this.extractPlannedFiles(plan);
    const actualFiles = diff.files.map(f => f.path);

    // Match files
    const matchedFiles = this.matchFiles(plan, diff);

    // Find unexpected changes
    const unexpectedChanges = this.findUnexpectedChanges(plannedFiles, diff);

    // Find missing changes
    const missingChanges = this.findMissingChanges(plan, actualFiles);

    // Calculate score
    const score = this.calculateScore(plannedFiles, actualFiles, matchedFiles, unexpectedChanges, missingChanges);

    // Determine verdict
    const verdict = this.determineVerdict(score, unexpectedChanges, missingChanges);

    // Build summary
    const summary = this.buildSummary(matchedFiles, unexpectedChanges, missingChanges, score);

    return {
      planId: plan.id,
      plannedFiles,
      actualFiles,
      matchedFiles,
      unexpectedChanges,
      missingChanges,
      score,
      verdict,
      summary
    };
  }

  /**
   * Extract all files from plan steps
   */
  private extractPlannedFiles(plan: Plan): string[] {
    const files = new Set<string>();

    for (const phase of plan.phases) {
      for (const step of phase.steps) {
        for (const file of step.files) {
          files.add(this.normalizePath(file));
        }
      }
    }

    return Array.from(files);
  }

  /**
   * Match planned files to actual changed files
   */
  private matchFiles(plan: Plan, diff: DiffScanResult): FileMatch[] {
    const matches: FileMatch[] = [];
    const actualFileMap = new Map(diff.files.map(f => [this.normalizePath(f.path), f]));

    for (const phase of plan.phases) {
      for (const step of phase.steps) {
        for (const plannedFile of step.files) {
          const normalizedPlanned = this.normalizePath(plannedFile);

          // Try exact match first
          let actualFile = actualFileMap.get(normalizedPlanned);

          // Try fuzzy match if no exact match
          if (!actualFile) {
            actualFile = this.findFuzzyMatch(normalizedPlanned, diff.files);
          }

          if (actualFile) {
            const matchType = this.determineMatchType(step, actualFile);
            matches.push({
              plannedFile: normalizedPlanned,
              actualFile: actualFile.path,
              plannedChangeType: step.changeType,
              actualStatus: actualFile.status,
              match: matchType
            });
          }
        }
      }
    }

    return matches;
  }

  /**
   * Find unexpected changes (in diff but not in plan)
   */
  private findUnexpectedChanges(plannedFiles: string[], diff: DiffScanResult): UnexpectedChange[] {
    const unexpected: UnexpectedChange[] = [];
    const plannedSet = new Set(plannedFiles.map(f => this.normalizePath(f)));

    for (const file of diff.files) {
      const normalizedPath = this.normalizePath(file.path);

      if (!plannedSet.has(normalizedPath) && !this.isPartialMatch(normalizedPath, plannedFiles)) {
        const severity = this.assessUnexpectedSeverity(file);
        const reason = this.getUnexpectedReason(file, plannedFiles);

        unexpected.push({
          file: file.path,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
          severity,
          reason
        });
      }
    }

    return unexpected;
  }

  /**
   * Find missing changes (in plan but not in diff)
   */
  private findMissingChanges(plan: Plan, actualFiles: string[]): MissingChange[] {
    const missing: MissingChange[] = [];
    const actualSet = new Set(actualFiles.map(f => this.normalizePath(f)));

    for (const phase of plan.phases) {
      for (const step of phase.steps) {
        for (const plannedFile of step.files) {
          const normalizedPlanned = this.normalizePath(plannedFile);

          if (!actualSet.has(normalizedPlanned) && !this.hasPartialMatch(normalizedPlanned, actualFiles)) {
            const severity = this.assessMissingSeverity(step);

            missing.push({
              file: plannedFile,
              plannedChangeType: step.changeType,
              step,
              severity
            });
          }
        }
      }
    }

    return missing;
  }

  /**
   * Calculate match score (0-100)
   */
  private calculateScore(
    plannedFiles: string[],
    actualFiles: string[],
    matches: FileMatch[],
    unexpected: UnexpectedChange[],
    missing: MissingChange[]
  ): number {
    if (plannedFiles.length === 0 && actualFiles.length === 0) {
      return 100; // No changes planned, no changes made
    }

    // Base score from matches
    const exactMatches = matches.filter(m => m.match === 'exact').length;
    const partialMatches = matches.filter(m => m.match === 'partial').length;
    const totalPlanned = plannedFiles.length;

    let score = 0;

    if (totalPlanned > 0) {
      // Weighted: exact matches worth more than partial
      const matchScore = ((exactMatches * 1.0) + (partialMatches * 0.7)) / totalPlanned;
      score = matchScore * 70; // Max 70 points from matches
    }

    // Penalty for unexpected changes
    const unexpectedPenalty = Math.min(unexpected.length * 5, 20); // Max 20 point penalty
    score -= unexpectedPenalty;

    // Penalty for missing changes
    const criticalMissing = missing.filter(m => m.severity === 'error').length;
    const missingPenalty = criticalMissing * 10 + (missing.length - criticalMissing) * 5;
    score -= Math.min(missingPenalty, 30); // Max 30 point penalty

    // Bonus for no unexpected or missing
    if (unexpected.length === 0 && missing.length === 0) {
      score += 10;
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Determine overall verdict
   */
  private determineVerdict(score: number, unexpected: UnexpectedChange[], missing: MissingChange[]): 'pass' | 'partial' | 'fail' {
    // Critical failures
    const criticalUnexpected = unexpected.filter(u => u.severity === 'error').length;
    const criticalMissing = missing.filter(m => m.severity === 'error').length;

    if (criticalUnexpected > 0 || criticalMissing > 0) {
      return 'fail';
    }

    if (score >= 80) {
      return 'pass';
    } else if (score >= 50) {
      return 'partial';
    } else {
      return 'fail';
    }
  }

  /**
   * Build summary message
   */
  private buildSummary(
    matches: FileMatch[],
    unexpected: UnexpectedChange[],
    missing: MissingChange[],
    score: number
  ): string {
    const parts: string[] = [];

    const exactMatches = matches.filter(m => m.match === 'exact').length;
    const partialMatches = matches.filter(m => m.match === 'partial').length;

    if (exactMatches > 0 || partialMatches > 0) {
      parts.push(`${exactMatches} exact match(es), ${partialMatches} partial match(es)`);
    }

    if (unexpected.length > 0) {
      parts.push(`${unexpected.length} unexpected change(s)`);
    }

    if (missing.length > 0) {
      parts.push(`${missing.length} missing change(s)`);
    }

    return `Plan comparison score: ${score}/100. ${parts.join(', ')}.`;
  }

  /**
   * Normalize file path for comparison
   */
  private normalizePath(path: string): string {
    return path
      .replace(/\\/g, '/')
      .replace(/^\//, '')
      .toLowerCase();
  }

  /**
   * Find fuzzy match for a file
   */
  private findFuzzyMatch(plannedPath: string, actualFiles: ScannedFile[]): ScannedFile | undefined {
    const plannedName = plannedPath.split('/').pop() || '';

    // Try matching by filename
    for (const file of actualFiles) {
      const actualName = file.path.split('/').pop() || '';
      if (actualName.toLowerCase() === plannedName.toLowerCase()) {
        return file;
      }
    }

    return undefined;
  }

  /**
   * Check if there's a partial match
   */
  private isPartialMatch(path: string, plannedFiles: string[]): boolean {
    const pathParts = path.split('/');
    const fileName = pathParts.pop() || '';

    return plannedFiles.some(planned => {
      const plannedName = planned.split('/').pop() || '';
      return plannedName.toLowerCase() === fileName.toLowerCase();
    });
  }

  /**
   * Check if planned file has partial match in actual files
   */
  private hasPartialMatch(plannedPath: string, actualFiles: string[]): boolean {
    const plannedName = plannedPath.split('/').pop() || '';

    return actualFiles.some(actual => {
      const actualName = actual.split('/').pop() || '';
      return actualName.toLowerCase() === plannedName.toLowerCase();
    });
  }

  /**
   * Determine match type between planned and actual
   */
  private determineMatchType(step: PlanStep, actualFile: ScannedFile): 'exact' | 'partial' | 'type_mismatch' {
    // Check if change type matches
    const typeMatches =
      (step.changeType === 'create' && actualFile.status === 'added') ||
      (step.changeType === 'modify' && actualFile.status === 'modified') ||
      (step.changeType === 'delete' && actualFile.status === 'deleted') ||
      (step.changeType === 'refactor' && actualFile.status === 'modified');

    if (!typeMatches) {
      return 'type_mismatch';
    }

    // Check if paths match exactly
    const plannedPath = this.normalizePath(step.files[0] || '');
    const actualPath = this.normalizePath(actualFile.path);

    if (plannedPath === actualPath) {
      return 'exact';
    }

    return 'partial';
  }

  /**
   * Assess severity of unexpected change
   */
  private assessUnexpectedSeverity(file: ScannedFile): 'info' | 'warning' | 'error' {
    // Large changes are more concerning
    if (file.additions + file.deletions > 100) {
      return 'warning';
    }

    // Deletions are more concerning than additions
    if (file.status === 'deleted') {
      return 'warning';
    }

    // Config files are concerning
    if (file.path.includes('config') || file.path.endsWith('.json') || file.path.endsWith('.yaml')) {
      return 'warning';
    }

    return 'info';
  }

  /**
   * Get reason for unexpected change
   */
  private getUnexpectedReason(file: ScannedFile, plannedFiles: string[]): string {
    if (this.isPartialMatch(file.path, plannedFiles)) {
      return 'File path differs from plan but filename matches';
    }

    if (file.additions + file.deletions < 10) {
      return 'Minor change, possibly auto-generated or formatting';
    }

    return 'File not mentioned in plan';
  }

  /**
   * Assess severity of missing change
   */
  private assessMissingSeverity(step: PlanStep): 'warning' | 'error' {
    if (step.priority === 'critical' || step.priority === 'high') {
      return 'error';
    }

    if (step.changeType === 'create' || step.changeType === 'delete') {
      return 'error'; // Missing creates/deletes are significant
    }

    return 'warning';
  }
}
