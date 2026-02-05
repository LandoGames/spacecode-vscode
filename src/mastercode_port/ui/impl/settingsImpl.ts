// @ts-nocheck

import * as vscode from 'vscode';

export function createSettingsImpl(panel: any) {
  async function detectGitInfo(): Promise<{ repoUrl: string; branch: string }> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) {
      return { repoUrl: '', branch: 'main' };
    }

    let repoUrl = '';
    let branch = 'main';

    try {
      const { execSync } = require('child_process');
      repoUrl = execSync('git remote get-url origin', {
        cwd: workspaceFolder,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();
    } catch {
      // ignore
    }

    try {
      const { execSync } = require('child_process');
      branch = execSync('git branch --show-current', {
        cwd: workspaceFolder,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim() || 'main';
    } catch {
      // ignore
    }

    return { repoUrl, branch };
  }

  async function sendSettings(): Promise<void> {
    const config = vscode.workspace.getConfiguration('spacecode');

    // Single source of truth: Check SecretStorage ONLY for API keys
    let hasClaudeKey = false;
    let hasOpenaiKey = false;

    if (panel._context?.secrets) {
      const claudeKey = await panel._context.secrets.get('spacecode.claudeApiKey');
      const openaiKey = await panel._context.secrets.get('spacecode.openaiApiKey');
      hasClaudeKey = !!claudeKey;
      hasOpenaiKey = !!openaiKey;
    }

    panel._postMessage({
      type: 'settings',
      settings: {
        claudeModel: config.get('claudeModel'),
        gptModel: config.get('gptModel'),
        defaultMode: config.get('defaultMode'),
        maxTurns: config.get('maxConversationTurns', 4),
        mastermindResponseStyle: config.get('mastermindResponseStyle', 'concise'),
        mastermindAutoSummarize: config.get('mastermindAutoSummarize', true),
        hasClaudeKey,
        hasOpenaiKey,
        claudeConnectionMethod: config.get('claudeConnectionMethod', 'cli'),
        gptConnectionMethod: config.get('gptConnectionMethod', 'cli'),
        isDev: panel._context?.extensionMode === vscode.ExtensionMode.Development,
      },
    });

    const detected = await detectGitInfo();
    const overrideRepoUrl = config.get<string>('gitRepoUrl', '');
    const overrideBranch = config.get<string>('gitBranch', '');

    panel._postMessage({
      type: 'gitSettings',
      settings: {
        repoUrl: overrideRepoUrl || detected.repoUrl,
        branch: overrideBranch || detected.branch,
        commitMessage: config.get('gitCommitMessage', ''),
        autoPush: config.get('gitAutoPush', true),
        detectedRepoUrl: detected.repoUrl,
        detectedBranch: detected.branch,
        hasRepoUrlOverride: !!overrideRepoUrl,
        hasBranchOverride: !!overrideBranch,
      },
    });
  }

  function sendPricing(): void {
    if (!panel.pricingService) return;
    panel._postMessage({
      type: 'pricing',
      pricing: panel.pricingService.getPricing(),
    });
  }

  async function saveConnectionMethods(claudeMethod?: string, gptMethod?: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('spacecode');

    if (claudeMethod !== undefined) {
      await config.update('claudeConnectionMethod', claudeMethod, vscode.ConfigurationTarget.Global);
    }
    if (gptMethod !== undefined) {
      await config.update('gptConnectionMethod', gptMethod, vscode.ConfigurationTarget.Global);
    }

    panel._postMessage({ type: 'connectionMethodsSaved' });
    vscode.window.showInformationMessage('Connection methods saved! Restart the extension to apply changes.');
  }

  async function saveMastermindSettings(maxTurns?: number, responseStyle?: string, autoSummarize?: boolean): Promise<void> {
    const config = vscode.workspace.getConfiguration('spacecode');

    if (maxTurns !== undefined) {
      await config.update('maxConversationTurns', maxTurns, vscode.ConfigurationTarget.Global);
    }
    if (responseStyle !== undefined) {
      await config.update('mastermindResponseStyle', responseStyle, vscode.ConfigurationTarget.Global);
    }
    if (autoSummarize !== undefined) {
      await config.update('mastermindAutoSummarize', autoSummarize, vscode.ConfigurationTarget.Global);
    }

    vscode.window.showInformationMessage('MasterMind settings saved!');
  }

  async function saveApiKeys(claudeKey?: string, openaiKey?: string): Promise<void> {
    // Single source of truth: SecretStorage only (more secure than config)
    if (!panel._context?.secrets) {
      vscode.window.showErrorMessage('Cannot save API keys: extension context not available');
      return;
    }

    // Only save non-empty keys to avoid overwriting existing keys
    if (claudeKey && claudeKey.trim()) {
      await panel._context.secrets.store('spacecode.claudeApiKey', claudeKey.trim());
    }
    if (openaiKey && openaiKey.trim()) {
      await panel._context.secrets.store('spacecode.openaiApiKey', openaiKey.trim());
    }

    panel._postMessage({ type: 'keysSaved' });
    vscode.window.showInformationMessage('API keys saved!');
  }

  async function saveGitSettings(settings: { repoUrl?: string; branch?: string; commitMessage?: string; autoPush?: boolean }): Promise<void> {
    const config = vscode.workspace.getConfiguration('spacecode');

    if (settings.repoUrl !== undefined) {
      await config.update('gitRepoUrl', settings.repoUrl, vscode.ConfigurationTarget.Workspace);
    }
    if (settings.branch !== undefined) {
      await config.update('gitBranch', settings.branch, vscode.ConfigurationTarget.Workspace);
    }
    if (settings.commitMessage !== undefined) {
      await config.update('gitCommitMessage', settings.commitMessage, vscode.ConfigurationTarget.Workspace);
    }
    if (settings.autoPush !== undefined) {
      await config.update('gitAutoPush', settings.autoPush, vscode.ConfigurationTarget.Workspace);
    }

    panel._postMessage({ type: 'gitSettingsSaved' });
    vscode.window.showInformationMessage('Git settings saved to workspace!');
  }

  async function handleGitAction(settings: { repoUrl: string; branch: string; commitMessage?: string; autoPush: boolean }): Promise<void> {
    if (!settings?.repoUrl) {
      vscode.window.showErrorMessage('Git repository URL not configured. Go to Settings → Git Settings.');
      return;
    }

    const prompt = `Upload the current changes to GitHub with the following settings:\n- Repository: ${settings.repoUrl}\n- Branch: ${settings.branch || 'main'}\n- Commit message: ${settings.commitMessage || 'Update from SpaceCode'}\n- Auto-push: ${settings.autoPush ? 'Yes' : 'No (commit only)'}\n\nPlease:\n1. Stage all changes (git add)\n2. Create a commit with an appropriate message${settings.commitMessage ? ` based on: "${settings.commitMessage}"` : ''}\n3. ${settings.autoPush ? 'Push to the remote repository' : 'Do not push yet, just commit'}\n\nShow me what changes will be committed first.`;

    panel._postMessage({
      type: 'sendGitPrompt',
      prompt,
    });
  }

  async function saveDashboardSettings(settings: { claudeKey?: string; gptKey?: string; maxTokens?: number; defaultModel?: string; }): Promise<void> {
    try {
      const config = vscode.workspace.getConfiguration('spacecode');

      // API keys: Single source of truth = SecretStorage (more secure)
      if (settings.claudeKey !== undefined && settings.claudeKey.trim() && panel._context?.secrets) {
        await panel._context.secrets.store('spacecode.claudeApiKey', settings.claudeKey.trim());
      }
      if (settings.gptKey !== undefined && settings.gptKey.trim() && panel._context?.secrets) {
        await panel._context.secrets.store('spacecode.openaiApiKey', settings.gptKey.trim());
      }

      // Other settings go to VS Code config
      if (settings.maxTokens !== undefined) {
        await config.update('maxTokens', settings.maxTokens, vscode.ConfigurationTarget.Global);
      }
      if (settings.defaultModel !== undefined) {
        await config.update('defaultModel', settings.defaultModel, vscode.ConfigurationTarget.Global);
      }

      panel._postMessage({ type: 'settingsSaved', success: true });
      await sendSettings();
    } catch (error) {
      panel._postMessage({
        type: 'settingsSaved',
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save settings',
      });
    }
  }

  async function sendCosts(): Promise<void> {
    const today = panel.costTracker.getTodaySummary();
    const month = panel.costTracker.getThisMonthSummary();
    const all = panel.costTracker.getSummary();
    const recent = panel.costTracker.getRecentRecords(20);

    panel._postMessage({
      type: 'costs',
      today,
      month,
      all,
      recent,
    });
  }

  return {
    detectGitInfo,
    sendSettings,
    sendPricing,
    saveConnectionMethods,
    saveMastermindSettings,
    saveApiKeys,
    saveGitSettings,
    handleGitAction,
    saveDashboardSettings,
    sendCosts,
  };
}
