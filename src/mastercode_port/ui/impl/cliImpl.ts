// @ts-nocheck

import * as vscode from 'vscode';
import { cliManager } from '../../services/cliManager';

export function createCliImpl(panel: any) {
  async function sendCliStatus(): Promise<void> {
    try {
      const status = await cliManager.checkAllStatus();
      panel._postMessage({ type: 'cliStatus', status });
    } catch (error) {
      panel._postMessage({
        type: 'error',
        message: `Failed to check CLI status: ${error}`,
      });
    }
  }

  async function installCli(cli: 'claude' | 'codex'): Promise<void> {
    const result = await cliManager.installCli(cli);
    if (result.success) {
      vscode.window.showInformationMessage(result.message);
      await sendCliStatus();
    } else {
      vscode.window.showErrorMessage(result.message);
    }
  }

  async function openTerminalForLogin(cli: 'claude' | 'codex'): Promise<void> {
    const command = cliManager.getLoginCommand(cli);
    const terminal = vscode.window.createTerminal(`${cli} Login`);
    terminal.show();
    terminal.sendText(command);
    vscode.window.showInformationMessage(`Complete the login in the terminal, then refresh the CLI status.`);
  }

  return {
    sendCliStatus,
    installCli,
    openTerminalForLogin,
  };
}
