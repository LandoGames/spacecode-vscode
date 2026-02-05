// @ts-nocheck

import * as vscode from 'vscode';

export function createGitHubImpl(panel: any) {
  async function checkGitHubAvailable(): Promise<void> {
    try {
      const available = await panel.githubAdapter.isAvailable();
      panel._postMessage({
        type: 'githubAvailable',
        available
      });
    } catch (error) {
      panel._postMessage({
        type: 'githubAvailable',
        available: false
      });
    }
  }

  async function createGitHubIssue(title: string, body: string, labels?: string[], planId?: string): Promise<void> {
    try {
      const issue = await panel.githubAdapter.createIssue({
        title,
        body,
        labels
      });

      panel._postMessage({
        type: 'githubIssueCreated',
        issue,
        planId
      });

      if (planId) {
        await panel.planStorage.addHistoryEntry({
          planId,
          action: 'issue_created',
          timestamp: Date.now(),
          details: {
            issueNumber: issue.number,
            issueUrl: issue.url
          }
        });
      }

      vscode.window.showInformationMessage(`GitHub issue #${issue.number} created`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      panel._postMessage({
        type: 'githubError',
        operation: 'createIssue',
        error: msg
      });
    }
  }

  async function createGitHubPR(title: string, body: string, base: string, head: string, planId?: string): Promise<void> {
    try {
      const pr = await panel.githubAdapter.createPullRequest({
        title,
        body,
        base,
        head
      });

      panel._postMessage({
        type: 'githubPRCreated',
        pr,
        planId
      });

      if (planId) {
        await panel.planStorage.addHistoryEntry({
          planId,
          action: 'pr_created',
          timestamp: Date.now(),
          details: {
            prNumber: pr.number,
            prUrl: pr.url
          }
        });
      }

      vscode.window.showInformationMessage(`GitHub PR #${pr.number} created`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      panel._postMessage({
        type: 'githubError',
        operation: 'createPR',
        error: msg
      });
    }
  }

  async function listGitHubIssues(state?: 'open' | 'closed' | 'all'): Promise<void> {
    try {
      const issues = await panel.githubAdapter.getIssues(state);
      panel._postMessage({
        type: 'githubIssuesList',
        issues
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      panel._postMessage({
        type: 'githubError',
        operation: 'listIssues',
        error: msg
      });
    }
  }

  async function listGitHubPRs(state?: 'open' | 'closed' | 'merged' | 'all'): Promise<void> {
    try {
      const prs = await panel.githubAdapter.getPRs(state);
      panel._postMessage({
        type: 'githubPRsList',
        prs
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      panel._postMessage({
        type: 'githubError',
        operation: 'listPRs',
        error: msg
      });
    }
  }

  return {
    checkGitHubAvailable,
    createGitHubIssue,
    createGitHubPR,
    listGitHubIssues,
    listGitHubPRs,
  };
}
