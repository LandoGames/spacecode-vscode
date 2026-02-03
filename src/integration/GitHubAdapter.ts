/**
 * GitHub Adapter
 *
 * Uses the GitHub CLI (gh) for GitHub operations.
 */

import { spawn } from 'child_process';

/**
 * GitHub Issue
 */
export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: string[];
  assignees: string[];
  url: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * GitHub Pull Request
 */
export interface GitHubPR {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed' | 'merged';
  head: string;
  base: string;
  url: string;
  draft: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Options for creating an issue
 */
export interface CreateIssueOptions {
  title: string;
  body: string;
  labels?: string[];
  assignees?: string[];
}

/**
 * Options for creating a PR
 */
export interface CreatePROptions {
  title: string;
  body: string;
  head: string;
  base?: string; // defaults to main/master
  draft?: boolean;
  labels?: string[];
  assignees?: string[];
}

/**
 * Options for listing issues
 */
export interface ListIssuesOptions {
  state?: 'open' | 'closed' | 'all';
  labels?: string[];
  assignee?: string;
  limit?: number;
}

/**
 * GitHub Adapter using gh CLI
 */
export class GitHubAdapter {
  private workingDirectory: string;

  constructor(workingDirectory: string) {
    this.workingDirectory = workingDirectory;
  }

  /**
   * Check if gh CLI is available and authenticated
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.runGh(['auth', 'status']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get list of issues
   */
  async getIssues(options: ListIssuesOptions = {}): Promise<GitHubIssue[]> {
    const args = ['issue', 'list', '--json', 'number,title,body,state,labels,assignees,url,createdAt,updatedAt'];

    if (options.state) {
      args.push('--state', options.state);
    }
    if (options.labels && options.labels.length > 0) {
      args.push('--label', options.labels.join(','));
    }
    if (options.assignee) {
      args.push('--assignee', options.assignee);
    }
    if (options.limit) {
      args.push('--limit', String(options.limit));
    }

    const output = await this.runGh(args);
    const data = JSON.parse(output);

    return data.map((issue: any) => ({
      number: issue.number,
      title: issue.title,
      body: issue.body || '',
      state: issue.state.toLowerCase(),
      labels: (issue.labels || []).map((l: any) => l.name),
      assignees: (issue.assignees || []).map((a: any) => a.login),
      url: issue.url,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt
    }));
  }

  /**
   * Get a single issue by number
   */
  async getIssue(number: number): Promise<GitHubIssue | null> {
    try {
      const output = await this.runGh([
        'issue', 'view', String(number),
        '--json', 'number,title,body,state,labels,assignees,url,createdAt,updatedAt'
      ]);
      const issue = JSON.parse(output);

      return {
        number: issue.number,
        title: issue.title,
        body: issue.body || '',
        state: issue.state.toLowerCase(),
        labels: (issue.labels || []).map((l: any) => l.name),
        assignees: (issue.assignees || []).map((a: any) => a.login),
        url: issue.url,
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt
      };
    } catch {
      return null;
    }
  }

  /**
   * Create a new issue
   */
  async createIssue(options: CreateIssueOptions): Promise<GitHubIssue> {
    const args = ['issue', 'create', '--title', options.title, '--body', options.body];

    if (options.labels && options.labels.length > 0) {
      for (const label of options.labels) {
        args.push('--label', label);
      }
    }
    if (options.assignees && options.assignees.length > 0) {
      for (const assignee of options.assignees) {
        args.push('--assignee', assignee);
      }
    }

    // Get the URL from the output
    const output = await this.runGh(args);
    const urlMatch = output.match(/https:\/\/github\.com\/[^\s]+/);
    const url = urlMatch ? urlMatch[0] : '';

    // Extract issue number from URL
    const numberMatch = url.match(/\/issues\/(\d+)/);
    const number = numberMatch ? parseInt(numberMatch[1], 10) : 0;

    return {
      number,
      title: options.title,
      body: options.body,
      state: 'open',
      labels: options.labels || [],
      assignees: options.assignees || [],
      url,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Close an issue
   */
  async closeIssue(number: number, comment?: string): Promise<void> {
    if (comment) {
      await this.runGh(['issue', 'close', String(number), '--comment', comment]);
    } else {
      await this.runGh(['issue', 'close', String(number)]);
    }
  }

  /**
   * Add a comment to an issue
   */
  async commentOnIssue(number: number, body: string): Promise<void> {
    await this.runGh(['issue', 'comment', String(number), '--body', body]);
  }

  /**
   * Get list of pull requests
   */
  async getPRs(state: 'open' | 'closed' | 'merged' | 'all' = 'open'): Promise<GitHubPR[]> {
    const args = ['pr', 'list', '--json', 'number,title,body,state,headRefName,baseRefName,url,isDraft,createdAt,updatedAt'];

    if (state !== 'all') {
      args.push('--state', state);
    }

    const output = await this.runGh(args);
    const data = JSON.parse(output);

    return data.map((pr: any) => ({
      number: pr.number,
      title: pr.title,
      body: pr.body || '',
      state: pr.state.toLowerCase(),
      head: pr.headRefName,
      base: pr.baseRefName,
      url: pr.url,
      draft: pr.isDraft,
      createdAt: pr.createdAt,
      updatedAt: pr.updatedAt
    }));
  }

  /**
   * Get a single PR by number
   */
  async getPR(number: number): Promise<GitHubPR | null> {
    try {
      const output = await this.runGh([
        'pr', 'view', String(number),
        '--json', 'number,title,body,state,headRefName,baseRefName,url,isDraft,createdAt,updatedAt'
      ]);
      const pr = JSON.parse(output);

      return {
        number: pr.number,
        title: pr.title,
        body: pr.body || '',
        state: pr.state.toLowerCase(),
        head: pr.headRefName,
        base: pr.baseRefName,
        url: pr.url,
        draft: pr.isDraft,
        createdAt: pr.createdAt,
        updatedAt: pr.updatedAt
      };
    } catch {
      return null;
    }
  }

  /**
   * Create a pull request
   */
  async createPR(options: CreatePROptions): Promise<GitHubPR> {
    const args = ['pr', 'create', '--title', options.title, '--body', options.body, '--head', options.head];

    if (options.base) {
      args.push('--base', options.base);
    }
    if (options.draft) {
      args.push('--draft');
    }
    if (options.labels && options.labels.length > 0) {
      for (const label of options.labels) {
        args.push('--label', label);
      }
    }
    if (options.assignees && options.assignees.length > 0) {
      for (const assignee of options.assignees) {
        args.push('--assignee', assignee);
      }
    }

    const output = await this.runGh(args);
    const urlMatch = output.match(/https:\/\/github\.com\/[^\s]+/);
    const url = urlMatch ? urlMatch[0] : '';

    // Extract PR number from URL
    const numberMatch = url.match(/\/pull\/(\d+)/);
    const number = numberMatch ? parseInt(numberMatch[1], 10) : 0;

    return {
      number,
      title: options.title,
      body: options.body,
      state: 'open',
      head: options.head,
      base: options.base || 'main',
      url,
      draft: options.draft || false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Merge a pull request
   */
  async mergePR(number: number, method: 'merge' | 'squash' | 'rebase' = 'squash'): Promise<void> {
    await this.runGh(['pr', 'merge', String(number), `--${method}`]);
  }

  /**
   * Get the current repository info
   */
  async getRepoInfo(): Promise<{ owner: string; name: string; url: string } | null> {
    try {
      const output = await this.runGh(['repo', 'view', '--json', 'owner,name,url']);
      const data = JSON.parse(output);
      return {
        owner: data.owner.login,
        name: data.name,
        url: data.url
      };
    } catch {
      return null;
    }
  }

  /**
   * Run a gh CLI command
   */
  private runGh(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn('gh', args, {
        cwd: this.workingDirectory,
        env: process.env
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
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(stderr || `gh exited with code ${code}`));
        }
      });

      proc.on('error', (err: Error) => {
        reject(err);
      });
    });
  }
}

/**
 * Create a GitHub adapter for a workspace
 */
export function createGitHubAdapter(workingDirectory: string): GitHubAdapter {
  return new GitHubAdapter(workingDirectory);
}
