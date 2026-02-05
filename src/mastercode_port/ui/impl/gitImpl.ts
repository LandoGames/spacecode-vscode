// @ts-nocheck

import * as vscode from 'vscode';

export function createGitImpl(panel: any) {
  async function getGitStatus(): Promise<void> {
    try {
      const status = await panel.gitAdapter.getStatus();
      panel._postMessage({ type: 'gitStatus', status });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      panel._postMessage({ type: 'gitError', operation: 'status', error: msg });
    }
  }

  async function stageFiles(files?: string[]): Promise<void> {
    try {
      let success: boolean;
      if (files && files.length > 0) {
        success = await panel.gitAdapter.stageFiles(files);
      } else {
        success = await panel.gitAdapter.stageAll();
      }
      if (success) {
        await getGitStatus();
        vscode.window.showInformationMessage('Files staged successfully');
      } else {
        panel._postMessage({ type: 'gitError', operation: 'stage', error: 'Failed to stage files' });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      panel._postMessage({ type: 'gitError', operation: 'stage', error: msg });
    }
  }

  async function commit(message: string, files?: string[]): Promise<void> {
    try {
      if (!message || message.trim() === '') {
        panel._postMessage({ type: 'gitError', operation: 'commit', error: 'Commit message is required' });
        return;
      }
      const result = await panel.gitAdapter.commit(message, files);
      if (result.success) {
        await getGitStatus();
        vscode.window.showInformationMessage('Committed: ' + (result.hash?.substring(0, 7) || 'success'));
        panel._postMessage({ type: 'gitCommitResult', success: true, hash: result.hash });
      } else {
        panel._postMessage({ type: 'gitError', operation: 'commit', error: result.error || 'Commit failed' });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      panel._postMessage({ type: 'gitError', operation: 'commit', error: msg });
    }
  }

  async function createBranch(name: string, checkout: boolean = true): Promise<void> {
    try {
      if (!name || name.trim() === '') {
        panel._postMessage({ type: 'gitError', operation: 'createBranch', error: 'Branch name is required' });
        return;
      }
      const success = await panel.gitAdapter.createBranch(name, checkout);
      if (success) {
        await getGitStatus();
        vscode.window.showInformationMessage('Branch created: ' + name);
        panel._postMessage({ type: 'gitBranchCreated', name });
      } else {
        panel._postMessage({ type: 'gitError', operation: 'createBranch', error: 'Failed to create branch' });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      panel._postMessage({ type: 'gitError', operation: 'createBranch', error: msg });
    }
  }

  async function checkout(ref: string): Promise<void> {
    try {
      if (!ref || ref.trim() === '') {
        panel._postMessage({ type: 'gitError', operation: 'checkout', error: 'Branch/ref is required' });
        return;
      }
      const success = await panel.gitAdapter.checkout(ref);
      if (success) {
        await getGitStatus();
        vscode.window.showInformationMessage('Checked out: ' + ref);
      } else {
        panel._postMessage({ type: 'gitError', operation: 'checkout', error: 'Checkout failed' });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      panel._postMessage({ type: 'gitError', operation: 'checkout', error: msg });
    }
  }

  async function push(remote: string = 'origin', branch?: string, setUpstream: boolean = false): Promise<void> {
    try {
      const result = await panel.gitAdapter.push(remote, branch, setUpstream);
      if (result.success) {
        await getGitStatus();
        vscode.window.showInformationMessage('Pushed successfully');
        panel._postMessage({ type: 'gitPushResult', success: true });
      } else {
        panel._postMessage({ type: 'gitError', operation: 'push', error: result.error || 'Push failed' });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      panel._postMessage({ type: 'gitError', operation: 'push', error: msg });
    }
  }

  async function pull(remote: string = 'origin', branch?: string): Promise<void> {
    try {
      const result = await panel.gitAdapter.pull(remote, branch);
      if (result.success) {
        await getGitStatus();
        vscode.window.showInformationMessage('Pulled successfully');
        panel._postMessage({ type: 'gitPullResult', success: true });
      } else {
        panel._postMessage({ type: 'gitError', operation: 'pull', error: result.error || 'Pull failed' });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      panel._postMessage({ type: 'gitError', operation: 'pull', error: msg });
    }
  }

  async function getRecentCommits(count: number = 10): Promise<void> {
    try {
      const commits = await panel.gitAdapter.getRecentCommits(count);
      panel._postMessage({ type: 'recentCommits', commits });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      panel._postMessage({ type: 'gitError', operation: 'log', error: msg });
    }
  }

  return {
    getGitStatus,
    stageFiles,
    commit,
    createBranch,
    checkout,
    push,
    pull,
    getRecentCommits,
  };
}
