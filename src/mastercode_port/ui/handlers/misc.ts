// @ts-nocheck

import * as vscode from 'vscode';

export async function handleMiscMessage(panel: any, message: any): Promise<boolean> {
  switch (message.type) {
    case 'showError':
      vscode.window.showErrorMessage(message.message);
      return true;

    case 'openExternal':
      if (message.url) {
        vscode.env.openExternal(vscode.Uri.parse(message.url));
      }
      return true;

    default:
      return false;
  }
}
