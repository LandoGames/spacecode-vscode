// @ts-nocheck

import * as vscode from 'vscode';
import { logger, LogChannel } from '../../services/logService';

export function createMiscImpl(panel: any) {
  async function downloadWhisperBinary(): Promise<void> {
    try {
      panel._postMessage({ type: 'whisperDownloadStarted' });
      vscode.window.showInformationMessage('Whisper binary download is not yet implemented. Please install whisper manually.');
      panel._postMessage({ type: 'whisperDownloadComplete', success: false, error: 'Not implemented' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Failed to download Whisper: ${msg}`);
      panel._postMessage({ type: 'whisperDownloadComplete', success: false, error: msg });
    }
  }

  function showLogChannel(channel: LogChannel): void {
    logger.focus(channel);
  }

  function clearAllLogs(): void {
    logger.clearAll();
    vscode.window.showInformationMessage('SpaceCode logs cleared');
  }

  function openTerminal(): void {
    const terminal = vscode.window.createTerminal('SpaceCode Terminal');
    terminal.show();
  }

  function openPricingUrl(provider?: string): void {
    const url = provider === 'gpt'
      ? 'https://platform.openai.com/pricing'
      : 'https://www.anthropic.com/pricing';
    vscode.env.openExternal(vscode.Uri.parse(url));
  }

  return {
    downloadWhisperBinary,
    showLogChannel,
    clearAllLogs,
    openTerminal,
    openPricingUrl,
  };
}
