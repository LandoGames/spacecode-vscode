// @ts-nocheck

import * as vscode from 'vscode';
import { SoundService } from '../../services/soundService';
import { SettingsFileService } from '../../services/settingsFile';
import { ModelVerificationService } from '../../services/modelVerificationService';
import { ALL_MODELS, CLAUDE_MODELS, GPT_MODELS, buildModelInfo, MODEL_DOCS } from '../../config/models';
import { loadModelOverrides, parsePricingFromText, updateModelOverride } from '../../services/modelOverrides';

function inferModelIdFromText(text: string): string | null {
  const hay = text.toLowerCase();
  const matches = [];
  for (const model of ALL_MODELS) {
    const id = model.id.toLowerCase();
    const label = model.label.toLowerCase();
    const shortLabel = (model.shortLabel || '').toLowerCase();
    if (id && hay.includes(id)) matches.push(model.id);
    else if (label && hay.includes(label)) matches.push(model.id);
    else if (shortLabel && hay.includes(shortLabel)) matches.push(model.id);
    else if (model.docsUrl && hay.includes(model.docsUrl.toLowerCase())) matches.push(model.id);
  }
  const unique = Array.from(new Set(matches));
  return unique.length === 1 ? unique[0] : null;
}

export async function handleSettingsMessage(panel: any, message: any): Promise<boolean> {
  switch (message.type) {
    case 'getSettings':
      await panel._sendSettings();
      return true;

    case 'getSettingsFilePath': {
      const svc = SettingsFileService.getInstance();
      panel._postMessage({
        type: 'settingsFilePath',
        path: svc.getFilePath(),
        relativePath: svc.getRelativePath(),
      });
      return true;
    }

    case 'openSettingsFile': {
      await SettingsFileService.getInstance().openInEditor();
      return true;
    }

    case 'openDocsUrl': {
      const url = String(message.url || '').trim();
      if (!url || !(url.startsWith('https://') || url.startsWith('http://'))) {
        panel._postMessage({ type: 'modelOverrideError', error: 'Invalid docs URL.' });
        return true;
      }
      try {
        await vscode.env.openExternal(vscode.Uri.parse(url));
      } catch (err) {
        panel._postMessage({ type: 'modelOverrideError', error: err instanceof Error ? err.message : 'Failed to open URL.' });
      }
      return true;
    }

    case 'getToolbarSettings': {
      const svc = SettingsFileService.getInstance();
      panel._postMessage({
        type: 'toolbarSettings',
        settings: svc.getToolbarSettings(),
      });
      return true;
    }

    case 'saveToolbarSettings': {
      const svc = SettingsFileService.getInstance();
      await svc.setToolbarSettings(message.settings);
      return true;
    }

    case 'saveSettings':
      await panel._saveDashboardSettings(message.settings);
      return true;

    case 'saveApiKeys':
      await panel._saveApiKeys(message.claude, message.openai);
      return true;

    case 'getApiKeyValue': {
      // Retrieve actual API key value for reveal feature
      // Single source of truth: SecretStorage ONLY
      const provider = message.provider as 'claude' | 'openai';
      const secretKey = provider === 'claude' ? 'spacecode.claudeApiKey' : 'spacecode.openaiApiKey';

      let value = '';
      if (panel._context?.secrets) {
        value = await panel._context.secrets.get(secretKey) || '';
      }

      panel._postMessage({
        type: 'apiKeyValue',
        provider,
        value,
      });
      return true;
    }

    case 'saveGitSettings':
      await panel._saveGitSettings(message.settings);
      return true;

    case 'gitAction':
      await panel._handleGitAction(message.settings);
      return true;

    case 'saveConnectionMethods':
      await panel._saveConnectionMethods(message.claudeMethod, message.gptMethod);
      return true;

    case 'saveMastermindSettings':
      await panel._saveMastermindSettings(message.maxTurns, message.responseStyle, message.autoSummarize);
      return true;

    case 'getCliStatus':
      await panel._sendCliStatus();
      return true;

    case 'installCli':
      await panel._installCli(message.cli);
      return true;

    case 'openTerminalForLogin':
      await panel._openTerminalForLogin(message.cli);
      return true;

    case 'openTerminal':
      panel._openTerminal();
      return true;

    case 'openDevTools':
      vscode.commands.executeCommand('workbench.action.toggleDevTools');
      return true;

    case 'reloadPanel':
      panel.reload();
      return true;

    case 'openPricing':
      panel._openPricingUrl(message.provider);
      return true;

    case 'getPricing':
      panel._sendPricing();
      return true;

    case 'getCosts':
      await panel._sendCosts();
      return true;

    case 'getUsageStats': {
      // Get usage stats for Usage & Plan section
      const config = vscode.workspace.getConfiguration('spacecode');
      const today = panel.costTracker.getTodaySummary();
      const month = panel.costTracker.getThisMonthSummary();
      const all = panel.costTracker.getSummary();

      panel._postMessage({
        type: 'usageStats',
        today,
        month,
        all,
        connectionMethods: {
          claude: config.get('claudeConnectionMethod', 'cli'),
          gpt: config.get('gptConnectionMethod', 'cli'),
        },
      });
      return true;
    }

    case 'showLogChannel':
      await panel._showLogChannel(message.channel);
      return true;

    case 'clearAllLogs':
      await panel._clearAllLogs();
      return true;

    case 'getLogs':
      await panel._sendLogs(message.channel, message.limit);
      return true;

    case 'getDocsStats':
      await panel._sendDocsStats();
      return true;

    case 'getDbStats':
      await panel._sendDbStats();
      return true;

    case 'saveSoundSettings': {
      try {
        await SoundService.getInstance().setEnabled(panel._context, !!message.enabled);
      } catch (e) {
        console.error('[SpaceCode] saveSoundSettings error:', e);
      }
      return true;
    }

    // ─────────────────────────────────────────────────────────────
    // Model Verification & Info
    // ─────────────────────────────────────────────────────────────

    case 'getModelInfo': {
      // Send full model info to frontend (descriptions, tiers, etc.)
      panel._postMessage({
        type: 'modelInfo',
        models: {
          claude: CLAUDE_MODELS,
          gpt: GPT_MODELS,
          all: ALL_MODELS,
        },
        info: buildModelInfo(),
        docs: MODEL_DOCS,
      });
      return true;
    }

    case 'getModelOverrides': {
      const overrides = loadModelOverrides();
      panel._postMessage({ type: 'modelOverrides', overrides });
      return true;
    }

    case 'updateModelOverride': {
      let modelId = String(message.modelId || '');
      const text = String(message.text || '');
      if (!text) {
        panel._postMessage({ type: 'modelOverrideError', error: 'Text is required.' });
        return true;
      }
      if (!modelId) {
        modelId = inferModelIdFromText(text);
      }
      if (!modelId) {
        panel._postMessage({ type: 'modelOverrideError', error: 'Could not detect model from pasted text. Include the model name or URL.' });
        return true;
      }
      try {
        const parsed = parsePricingFromText(text);
        if (!parsed.input || !parsed.output) {
          panel._postMessage({ type: 'modelOverrideError', error: 'Could not parse input/output prices.' });
          return true;
        }
        const updated = updateModelOverride(modelId, {
          input: parsed.input,
          output: parsed.output,
          contextWindow: parsed.contextWindow,
          maxOutput: parsed.maxOutput,
          sourceUrl: message.sourceUrl,
        });
        if (panel.pricingService) {
          panel.pricingService.initialize(panel._context);
          panel._postMessage({ type: 'pricing', pricing: panel.pricingService.getPricing() });
        }
        panel._postMessage({ type: 'modelOverrides', overrides: updated });
        panel._postMessage({ type: 'modelOverrideApplied', modelId, parsed });
      } catch (err) {
        panel._postMessage({ type: 'modelOverrideError', error: err instanceof Error ? err.message : 'Unknown error' });
      }
      return true;
    }

    case 'verifyModels': {
      // Verify all configured models against APIs
      const verificationService = ModelVerificationService.getInstance();
      await verificationService.initialize(panel._context);

      panel._postMessage({
        type: 'modelVerificationStarted',
      });

      try {
        const results = await verificationService.verifyAllModels();
        panel._postMessage({
          type: 'modelVerificationResults',
          results,
        });
      } catch (err) {
        panel._postMessage({
          type: 'modelVerificationError',
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
      return true;
    }

    case 'getOpenaiModels': {
      const verificationService = ModelVerificationService.getInstance();
      await verificationService.initialize(panel._context);
      try {
        const models = await verificationService.listOpenAIModels();
        panel._postMessage({
          type: 'openaiModelsList',
          models: models || [],
        });
      } catch (err) {
        panel._postMessage({
          type: 'openaiModelsError',
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
      return true;
    }

    case 'verifySingleModel': {
      const verificationService = ModelVerificationService.getInstance();
      await verificationService.initialize(panel._context);

      try {
        const result = await verificationService.verifySingleModel(message.modelId);
        panel._postMessage({
          type: 'singleModelVerificationResult',
          result,
        });
      } catch (err) {
        panel._postMessage({
          type: 'singleModelVerificationResult',
          result: {
            modelId: message.modelId,
            provider: 'unknown',
            status: 'error',
            message: err instanceof Error ? err.message : 'Unknown error',
          },
        });
      }
      return true;
    }

    case 'getLastModelVerification': {
      const verificationService = ModelVerificationService.getInstance();
      await verificationService.initialize(panel._context);
      const lastVerification = verificationService.getLastVerification();
      panel._postMessage({
        type: 'lastModelVerification',
        results: lastVerification,
      });
      return true;
    }

    // ─────────────────────────────────────────────────────────────
    // Developer Settings Export/Import (includes API keys)
    // ─────────────────────────────────────────────────────────────

    case 'devExportSettings': {
      try {
        const svc = SettingsFileService.getInstance();
        const config = vscode.workspace.getConfiguration('spacecode');
        const fs = await import('fs');
        const path = await import('path');

        // Fixed backup folder: .spacecode/backups/
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
          throw new Error('No workspace folder open');
        }

        const backupDir = path.join(workspaceRoot, '.spacecode', 'backups');
        if (!fs.existsSync(backupDir)) {
          fs.mkdirSync(backupDir, { recursive: true });
          // Create .gitignore to prevent accidental commits of API keys
          fs.writeFileSync(path.join(backupDir, '.gitignore'), '# Backups contain API keys - do not commit\n*\n!.gitignore\n', 'utf-8');
        }

        // Filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const backupPath = path.join(backupDir, `settings-backup-${timestamp}.json`);

        // Gather all settings
        const exportData: Record<string, any> = {
          _exportVersion: 1,
          _exportDate: new Date().toISOString(),
          _warning: 'Contains sensitive API keys - do not share publicly',

          // Settings file content
          settingsFile: svc.getAll(),

          // VS Code config (spacecode.* namespace)
          vscodeConfig: {
            claudeModel: config.get('claudeModel'),
            gptModel: config.get('gptModel'),
            claudeConnectionMethod: config.get('claudeConnectionMethod'),
            gptConnectionMethod: config.get('gptConnectionMethod'),
            maxTurns: config.get('maxTurns'),
            mastermindResponseStyle: config.get('mastermindResponseStyle'),
            mastermindAutoSummarize: config.get('mastermindAutoSummarize'),
          },
        };

        // Include API keys if requested (developer mode)
        if (message.includeKeys) {
          exportData.apiKeys = {
            claude: await panel._context.secrets.get('spacecode.claudeApiKey') || '',
            openai: await panel._context.secrets.get('spacecode.openaiApiKey') || '',
          };
        }

        // Save directly to fixed location
        fs.writeFileSync(backupPath, JSON.stringify(exportData, null, 2), 'utf-8');
        const relativePath = `.spacecode/backups/settings-backup-${timestamp}.json`;
        vscode.window.showInformationMessage(`Settings exported to ${relativePath}`);
        panel._postMessage({ type: 'devExportSuccess', path: relativePath });
      } catch (err) {
        console.error('[SpaceCode] Export settings error:', err);
        panel._postMessage({
          type: 'devExportError',
          error: err instanceof Error ? err.message : 'Export failed',
        });
      }
      return true;
    }

    case 'devImportSettings': {
      try {
        const fs = await import('fs');
        const path = await import('path');

        // Default to .spacecode/backups/ folder
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const backupDir = workspaceRoot ? path.join(workspaceRoot, '.spacecode', 'backups') : undefined;

        // Let user pick file (starting in backups folder if it exists)
        const uris = await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters: { 'JSON': ['json'] },
          openLabel: 'Import Settings',
          defaultUri: backupDir && fs.existsSync(backupDir) ? vscode.Uri.file(backupDir) : undefined,
        });

        if (!uris || uris.length === 0) return true;

        const content = fs.readFileSync(uris[0].fsPath, 'utf-8');
        const importData = JSON.parse(content);

        if (!importData._exportVersion) {
          throw new Error('Invalid settings file - missing version marker');
        }

        const svc = SettingsFileService.getInstance();
        const config = vscode.workspace.getConfiguration('spacecode');

        // Restore settings file content
        if (importData.settingsFile) {
          await svc.update(importData.settingsFile);
        }

        // Restore VS Code config
        if (importData.vscodeConfig) {
          const vc = importData.vscodeConfig;
          if (vc.claudeModel) await config.update('claudeModel', vc.claudeModel, true);
          if (vc.gptModel) await config.update('gptModel', vc.gptModel, true);
          if (vc.claudeConnectionMethod) await config.update('claudeConnectionMethod', vc.claudeConnectionMethod, true);
          if (vc.gptConnectionMethod) await config.update('gptConnectionMethod', vc.gptConnectionMethod, true);
          if (vc.maxTurns !== undefined) await config.update('maxTurns', vc.maxTurns, true);
          if (vc.mastermindResponseStyle) await config.update('mastermindResponseStyle', vc.mastermindResponseStyle, true);
          if (vc.mastermindAutoSummarize !== undefined) await config.update('mastermindAutoSummarize', vc.mastermindAutoSummarize, true);
        }

        // Restore API keys if present and user confirmed
        if (importData.apiKeys && message.includeKeys) {
          if (importData.apiKeys.claude) {
            await panel._context.secrets.store('spacecode.claudeApiKey', importData.apiKeys.claude);
          }
          if (importData.apiKeys.openai) {
            await panel._context.secrets.store('spacecode.openaiApiKey', importData.apiKeys.openai);
          }
        }

        vscode.window.showInformationMessage('Settings imported successfully. Reload window to apply all changes.');
        panel._postMessage({ type: 'devImportSuccess' });

        // Send updated settings to webview
        await panel._sendSettings();
      } catch (err) {
        console.error('[SpaceCode] Import settings error:', err);
        vscode.window.showErrorMessage(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        panel._postMessage({
          type: 'devImportError',
          error: err instanceof Error ? err.message : 'Import failed',
        });
      }
      return true;
    }

    default:
      return false;
  }
}
