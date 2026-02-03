/**
 * Diff Scanner
 *
 * Scans git diff and produces structured results for verification.
 */

import { GitAdapter, DiffResult, FileDiff } from '../integration/GitAdapter';
import { DiffScanResult, ScannedFile, DiffHunk } from './types';

/**
 * Diff Scanner class
 */
export class DiffScanner {
  private gitAdapter: GitAdapter;

  constructor(gitAdapter: GitAdapter) {
    this.gitAdapter = gitAdapter;
  }

  /**
   * Scan current working directory changes (unstaged)
   */
  async scanUnstaged(): Promise<DiffScanResult> {
    const startTime = Date.now();
    const diff = await this.gitAdapter.getDiff(false);
    return this.buildResult(diff, startTime);
  }

  /**
   * Scan staged changes
   */
  async scanStaged(): Promise<DiffScanResult> {
    const startTime = Date.now();
    const diff = await this.gitAdapter.getDiff(true);
    return this.buildResult(diff, startTime);
  }

  /**
   * Scan all changes (staged + unstaged)
   */
  async scanAll(): Promise<DiffScanResult> {
    const startTime = Date.now();

    // Get both staged and unstaged
    const [staged, unstaged] = await Promise.all([
      this.gitAdapter.getDiff(true),
      this.gitAdapter.getDiff(false)
    ]);

    // Merge the results
    const fileMap = new Map<string, FileDiff>();

    for (const file of staged.files) {
      fileMap.set(file.path, file);
    }

    for (const file of unstaged.files) {
      const existing = fileMap.get(file.path);
      if (existing) {
        // Merge hunks and stats
        existing.hunks.push(...file.hunks);
        existing.additions += file.additions;
        existing.deletions += file.deletions;
      } else {
        fileMap.set(file.path, file);
      }
    }

    const merged: DiffResult = {
      files: Array.from(fileMap.values()),
      totalAdditions: staged.totalAdditions + unstaged.totalAdditions,
      totalDeletions: staged.totalDeletions + unstaged.totalDeletions,
      totalFiles: fileMap.size,
      raw: staged.raw + '\n' + unstaged.raw
    };

    return this.buildResult(merged, startTime);
  }

  /**
   * Scan diff between two refs
   */
  async scanBetweenRefs(fromRef: string, toRef: string = 'HEAD'): Promise<DiffScanResult> {
    const startTime = Date.now();
    const diff = await this.gitAdapter.getDiffBetween(fromRef, toRef);
    return this.buildResult(diff, startTime);
  }

  /**
   * Scan changes since a specific commit
   */
  async scanSinceCommit(commitHash: string): Promise<DiffScanResult> {
    return this.scanBetweenRefs(commitHash, 'HEAD');
  }

  /**
   * Build the scan result from git diff
   */
  private buildResult(diff: DiffResult, startTime: number): DiffScanResult {
    const files: ScannedFile[] = diff.files.map(file => ({
      path: file.path,
      status: this.mapStatus(file.status),
      additions: file.additions,
      deletions: file.deletions,
      hunks: file.hunks.map(h => ({
        oldStart: h.oldStart,
        oldLines: h.oldLines,
        newStart: h.newStart,
        newLines: h.newLines,
        content: h.content
      })),
      isBinary: file.isBinary
    }));

    return {
      files,
      totalAdditions: diff.totalAdditions,
      totalDeletions: diff.totalDeletions,
      totalFiles: diff.totalFiles,
      scanTime: Date.now() - startTime
    };
  }

  /**
   * Map git status to our status type
   */
  private mapStatus(status: string): 'added' | 'modified' | 'deleted' | 'renamed' {
    switch (status) {
      case 'added': return 'added';
      case 'deleted': return 'deleted';
      case 'renamed': return 'renamed';
      default: return 'modified';
    }
  }

  /**
   * Get summary statistics
   */
  static getSummary(result: DiffScanResult): string {
    const { totalFiles, totalAdditions, totalDeletions } = result;
    const added = result.files.filter(f => f.status === 'added').length;
    const modified = result.files.filter(f => f.status === 'modified').length;
    const deleted = result.files.filter(f => f.status === 'deleted').length;

    return `${totalFiles} files changed: ${added} added, ${modified} modified, ${deleted} deleted (+${totalAdditions}/-${totalDeletions} lines)`;
  }

  /**
   * Filter results by file pattern
   */
  static filterByPattern(result: DiffScanResult, pattern: RegExp): DiffScanResult {
    const filteredFiles = result.files.filter(f => pattern.test(f.path));

    return {
      files: filteredFiles,
      totalAdditions: filteredFiles.reduce((sum, f) => sum + f.additions, 0),
      totalDeletions: filteredFiles.reduce((sum, f) => sum + f.deletions, 0),
      totalFiles: filteredFiles.length,
      scanTime: result.scanTime
    };
  }

  /**
   * Filter to only include certain file extensions
   */
  static filterByExtensions(result: DiffScanResult, extensions: string[]): DiffScanResult {
    const extSet = new Set(extensions.map(e => e.startsWith('.') ? e : `.${e}`));
    const filteredFiles = result.files.filter(f => {
      const ext = f.path.substring(f.path.lastIndexOf('.'));
      return extSet.has(ext);
    });

    return {
      files: filteredFiles,
      totalAdditions: filteredFiles.reduce((sum, f) => sum + f.additions, 0),
      totalDeletions: filteredFiles.reduce((sum, f) => sum + f.deletions, 0),
      totalFiles: filteredFiles.length,
      scanTime: result.scanTime
    };
  }

  /**
   * Exclude certain paths from results
   */
  static excludePaths(result: DiffScanResult, patterns: string[]): DiffScanResult {
    const regexes = patterns.map(p => new RegExp(p.replace(/\*/g, '.*')));
    const filteredFiles = result.files.filter(f =>
      !regexes.some(r => r.test(f.path))
    );

    return {
      files: filteredFiles,
      totalAdditions: filteredFiles.reduce((sum, f) => sum + f.additions, 0),
      totalDeletions: filteredFiles.reduce((sum, f) => sum + f.deletions, 0),
      totalFiles: filteredFiles.length,
      scanTime: result.scanTime
    };
  }
}
