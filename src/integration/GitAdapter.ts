/**
 * Git Adapter
 *
 * Provides git operations for SpaceCode.
 * Used by verification pipeline for diff scanning and by coordination for commits/PRs.
 */

import { spawn } from 'child_process';
import * as path from 'path';

/**
 * File change status
 */
export type GitFileStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'untracked';

/**
 * A changed file in git
 */
export interface GitFile {
  path: string;
  status: GitFileStatus;
  oldPath?: string; // For renames
  additions: number;
  deletions: number;
}

/**
 * A diff hunk
 */
export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  content: string;
}

/**
 * Detailed diff for a single file
 */
export interface FileDiff {
  path: string;
  status: GitFileStatus;
  oldPath?: string;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
  isBinary: boolean;
}

/**
 * Complete diff result
 */
export interface DiffResult {
  files: FileDiff[];
  totalAdditions: number;
  totalDeletions: number;
  totalFiles: number;
  raw: string;
}

/**
 * Git status result
 */
export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: GitFile[];
  unstaged: GitFile[];
  untracked: string[];
  hasChanges: boolean;
}

/**
 * Commit info
 */
export interface CommitInfo {
  hash: string;
  shortHash: string;
  author: string;
  email: string;
  date: Date;
  message: string;
}

/**
 * Git Adapter class
 */
export class GitAdapter {
  private workingDir: string;

  constructor(workingDir: string) {
    this.workingDir = workingDir;
  }

  /**
   * Execute a git command
   */
  private async exec(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise((resolve) => {
      const proc = spawn('git', args, {
        cwd: this.workingDir,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code: number | null) => {
        resolve({ stdout, stderr, code: code || 0 });
      });

      proc.on('error', (err: Error) => {
        resolve({ stdout: '', stderr: err.message, code: 1 });
      });
    });
  }

  /**
   * Check if directory is a git repo
   */
  async isGitRepo(): Promise<boolean> {
    const result = await this.exec(['rev-parse', '--is-inside-work-tree']);
    return result.code === 0 && result.stdout.trim() === 'true';
  }

  /**
   * Get current branch name
   */
  async getCurrentBranch(): Promise<string> {
    const result = await this.exec(['rev-parse', '--abbrev-ref', 'HEAD']);
    return result.stdout.trim();
  }

  /**
   * Get git status
   */
  async getStatus(): Promise<GitStatus> {
    const [branchResult, statusResult] = await Promise.all([
      this.exec(['rev-parse', '--abbrev-ref', 'HEAD']),
      this.exec(['status', '--porcelain=v2', '--branch'])
    ]);

    const branch = branchResult.stdout.trim();
    const lines = statusResult.stdout.split('\n').filter(l => l);

    let ahead = 0;
    let behind = 0;
    const staged: GitFile[] = [];
    const unstaged: GitFile[] = [];
    const untracked: string[] = [];

    for (const line of lines) {
      if (line.startsWith('# branch.ab')) {
        const match = line.match(/\+(\d+) -(\d+)/);
        if (match) {
          ahead = parseInt(match[1], 10);
          behind = parseInt(match[2], 10);
        }
      } else if (line.startsWith('1 ') || line.startsWith('2 ')) {
        // Changed entry
        const parts = line.split('\t');
        const info = parts[0].split(' ');
        const xy = info[1];
        const filePath = parts[parts.length - 1];

        const stagedStatus = this.parseStatusCode(xy[0]);
        const unstagedStatus = this.parseStatusCode(xy[1]);

        if (stagedStatus) {
          staged.push({ path: filePath, status: stagedStatus, additions: 0, deletions: 0 });
        }
        if (unstagedStatus) {
          unstaged.push({ path: filePath, status: unstagedStatus, additions: 0, deletions: 0 });
        }
      } else if (line.startsWith('? ')) {
        // Untracked
        untracked.push(line.slice(2));
      }
    }

    return {
      branch,
      ahead,
      behind,
      staged,
      unstaged,
      untracked,
      hasChanges: staged.length > 0 || unstaged.length > 0 || untracked.length > 0
    };
  }

  /**
   * Parse status code to GitFileStatus
   */
  private parseStatusCode(code: string): GitFileStatus | null {
    switch (code) {
      case 'A': return 'added';
      case 'M': return 'modified';
      case 'D': return 'deleted';
      case 'R': return 'renamed';
      case 'C': return 'copied';
      case '?': return 'untracked';
      case '.': return null;
      default: return null;
    }
  }

  /**
   * Get diff of working directory vs HEAD
   */
  async getDiff(staged: boolean = false): Promise<DiffResult> {
    const args = staged
      ? ['diff', '--cached', '--numstat']
      : ['diff', '--numstat'];

    const [numstatResult, diffResult] = await Promise.all([
      this.exec(args),
      this.exec(staged ? ['diff', '--cached'] : ['diff'])
    ]);

    const files: FileDiff[] = [];
    let totalAdditions = 0;
    let totalDeletions = 0;

    // Parse numstat for additions/deletions per file
    const numstatLines = numstatResult.stdout.split('\n').filter(l => l);
    const fileStats = new Map<string, { additions: number; deletions: number }>();

    for (const line of numstatLines) {
      const [add, del, filePath] = line.split('\t');
      const additions = add === '-' ? 0 : parseInt(add, 10);
      const deletions = del === '-' ? 0 : parseInt(del, 10);
      fileStats.set(filePath, { additions, deletions });
      totalAdditions += additions;
      totalDeletions += deletions;
    }

    // Parse full diff for hunks
    const diffContent = diffResult.stdout;
    const fileDiffs = this.parseDiff(diffContent);

    for (const fd of fileDiffs) {
      const stats = fileStats.get(fd.path) || { additions: 0, deletions: 0 };
      fd.additions = stats.additions;
      fd.deletions = stats.deletions;
      files.push(fd);
    }

    return {
      files,
      totalAdditions,
      totalDeletions,
      totalFiles: files.length,
      raw: diffContent
    };
  }

  /**
   * Get diff between two refs
   */
  async getDiffBetween(fromRef: string, toRef: string = 'HEAD'): Promise<DiffResult> {
    const [numstatResult, diffResult] = await Promise.all([
      this.exec(['diff', '--numstat', `${fromRef}...${toRef}`]),
      this.exec(['diff', `${fromRef}...${toRef}`])
    ]);

    const files: FileDiff[] = [];
    let totalAdditions = 0;
    let totalDeletions = 0;

    // Parse numstat
    const numstatLines = numstatResult.stdout.split('\n').filter(l => l);
    const fileStats = new Map<string, { additions: number; deletions: number }>();

    for (const line of numstatLines) {
      const [add, del, filePath] = line.split('\t');
      const additions = add === '-' ? 0 : parseInt(add, 10);
      const deletions = del === '-' ? 0 : parseInt(del, 10);
      fileStats.set(filePath, { additions, deletions });
      totalAdditions += additions;
      totalDeletions += deletions;
    }

    // Parse full diff
    const fileDiffs = this.parseDiff(diffResult.stdout);
    for (const fd of fileDiffs) {
      const stats = fileStats.get(fd.path) || { additions: 0, deletions: 0 };
      fd.additions = stats.additions;
      fd.deletions = stats.deletions;
      files.push(fd);
    }

    return {
      files,
      totalAdditions,
      totalDeletions,
      totalFiles: files.length,
      raw: diffResult.stdout
    };
  }

  /**
   * Parse unified diff format
   */
  private parseDiff(diffContent: string): FileDiff[] {
    const files: FileDiff[] = [];
    const fileRegex = /^diff --git a\/(.+) b\/(.+)$/gm;
    const hunkRegex = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/gm;

    let match: RegExpExecArray | null;
    const fileMatches: Array<{ path: string; oldPath: string; start: number }> = [];

    // Find all file headers
    while ((match = fileRegex.exec(diffContent)) !== null) {
      fileMatches.push({
        oldPath: match[1],
        path: match[2],
        start: match.index
      });
    }

    // Process each file
    for (let i = 0; i < fileMatches.length; i++) {
      const fileMatch = fileMatches[i];
      const nextStart = i + 1 < fileMatches.length ? fileMatches[i + 1].start : diffContent.length;
      const fileContent = diffContent.slice(fileMatch.start, nextStart);

      const hunks: DiffHunk[] = [];
      const isBinary = fileContent.includes('Binary files');

      // Determine status
      let status: GitFileStatus = 'modified';
      if (fileContent.includes('new file mode')) {
        status = 'added';
      } else if (fileContent.includes('deleted file mode')) {
        status = 'deleted';
      } else if (fileMatch.oldPath !== fileMatch.path) {
        status = 'renamed';
      }

      if (!isBinary) {
        // Parse hunks
        let hunkMatch: RegExpExecArray | null;
        const localHunkRegex = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/gm;

        while ((hunkMatch = localHunkRegex.exec(fileContent)) !== null) {
          const hunkStart = hunkMatch.index + hunkMatch[0].length;
          const nextHunkMatch = localHunkRegex.exec(fileContent);
          const hunkEnd = nextHunkMatch ? nextHunkMatch.index : fileContent.length;

          // Reset regex position if we found next hunk
          if (nextHunkMatch) {
            localHunkRegex.lastIndex = hunkMatch.index + hunkMatch[0].length;
          }

          hunks.push({
            oldStart: parseInt(hunkMatch[1], 10),
            oldLines: parseInt(hunkMatch[2] || '1', 10),
            newStart: parseInt(hunkMatch[3], 10),
            newLines: parseInt(hunkMatch[4] || '1', 10),
            header: hunkMatch[5].trim(),
            content: fileContent.slice(hunkStart, hunkEnd).trim()
          });
        }
      }

      files.push({
        path: fileMatch.path,
        status,
        oldPath: status === 'renamed' ? fileMatch.oldPath : undefined,
        hunks,
        additions: 0,
        deletions: 0,
        isBinary
      });
    }

    return files;
  }

  /**
   * Get recent commits
   */
  async getRecentCommits(count: number = 10): Promise<CommitInfo[]> {
    const format = '%H|%h|%an|%ae|%aI|%s';
    const result = await this.exec(['log', `-${count}`, `--format=${format}`]);

    if (result.code !== 0) {
      return [];
    }

    const commits: CommitInfo[] = [];
    const lines = result.stdout.split('\n').filter(l => l);

    for (const line of lines) {
      const [hash, shortHash, author, email, date, message] = line.split('|');
      commits.push({
        hash,
        shortHash,
        author,
        email,
        date: new Date(date),
        message
      });
    }

    return commits;
  }

  /**
   * Stage files
   */
  async stageFiles(files: string[]): Promise<boolean> {
    if (files.length === 0) return true;
    const result = await this.exec(['add', ...files]);
    return result.code === 0;
  }

  /**
   * Stage all changes
   */
  async stageAll(): Promise<boolean> {
    const result = await this.exec(['add', '-A']);
    return result.code === 0;
  }

  /**
   * Unstage files
   */
  async unstageFiles(files: string[]): Promise<boolean> {
    if (files.length === 0) return true;
    const result = await this.exec(['reset', 'HEAD', '--', ...files]);
    return result.code === 0;
  }

  /**
   * Create a commit
   */
  async commit(message: string, files?: string[]): Promise<{ success: boolean; hash?: string; error?: string }> {
    // Stage specific files if provided
    if (files && files.length > 0) {
      const stageResult = await this.stageFiles(files);
      if (!stageResult) {
        return { success: false, error: 'Failed to stage files' };
      }
    }

    const result = await this.exec(['commit', '-m', message]);

    if (result.code !== 0) {
      return { success: false, error: result.stderr || 'Commit failed' };
    }

    // Get the commit hash
    const hashResult = await this.exec(['rev-parse', 'HEAD']);
    const hash = hashResult.stdout.trim();

    return { success: true, hash };
  }

  /**
   * Create a new branch
   */
  async createBranch(name: string, checkout: boolean = true): Promise<boolean> {
    const args = checkout ? ['checkout', '-b', name] : ['branch', name];
    const result = await this.exec(args);
    return result.code === 0;
  }

  /**
   * Checkout a branch
   */
  async checkout(ref: string): Promise<boolean> {
    const result = await this.exec(['checkout', ref]);
    return result.code === 0;
  }

  /**
   * Push to remote
   */
  async push(remote: string = 'origin', branch?: string, setUpstream: boolean = false): Promise<{ success: boolean; error?: string }> {
    const args = ['push'];
    if (setUpstream) {
      args.push('-u');
    }
    args.push(remote);
    if (branch) {
      args.push(branch);
    }

    const result = await this.exec(args);

    if (result.code !== 0) {
      return { success: false, error: result.stderr };
    }

    return { success: true };
  }

  /**
   * Pull from remote
   */
  async pull(remote: string = 'origin', branch?: string): Promise<{ success: boolean; error?: string }> {
    const args = ['pull', remote];
    if (branch) {
      args.push(branch);
    }

    const result = await this.exec(args);

    if (result.code !== 0) {
      return { success: false, error: result.stderr };
    }

    return { success: true };
  }

  /**
   * Get list of remotes
   */
  async getRemotes(): Promise<string[]> {
    const result = await this.exec(['remote']);
    return result.stdout.split('\n').filter(l => l);
  }

  /**
   * Get the root directory of the git repo
   */
  async getRepoRoot(): Promise<string> {
    const result = await this.exec(['rev-parse', '--show-toplevel']);
    return result.stdout.trim();
  }

  /**
   * Check if there are uncommitted changes
   */
  async hasUncommittedChanges(): Promise<boolean> {
    const result = await this.exec(['status', '--porcelain']);
    return result.stdout.trim().length > 0;
  }

  /**
   * Get file content at a specific ref
   */
  async getFileAtRef(filePath: string, ref: string = 'HEAD'): Promise<string | null> {
    const result = await this.exec(['show', `${ref}:${filePath}`]);
    if (result.code !== 0) {
      return null;
    }
    return result.stdout;
  }

  /**
   * Discard changes to a file
   */
  async discardChanges(filePath: string): Promise<boolean> {
    const result = await this.exec(['checkout', '--', filePath]);
    return result.code === 0;
  }

  /**
   * Stash changes
   */
  async stash(message?: string): Promise<boolean> {
    const args = ['stash', 'push'];
    if (message) {
      args.push('-m', message);
    }
    const result = await this.exec(args);
    return result.code === 0;
  }

  /**
   * Pop stash
   */
  async stashPop(): Promise<boolean> {
    const result = await this.exec(['stash', 'pop']);
    return result.code === 0;
  }
}

/**
 * Create a GitAdapter for a workspace folder
 */
export function createGitAdapter(workspaceFolder: string): GitAdapter {
  return new GitAdapter(workspaceFolder);
}
