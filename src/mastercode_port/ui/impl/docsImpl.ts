// @ts-nocheck

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function createDocsImpl(panel: any) {
  function collectDocFiles(dir: string, base: string, results: string[]): void {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return;
    for (const entry of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        collectDocFiles(fullPath, base, results);
        continue;
      }
      if (!stat.isFile()) continue;
      const ext = path.extname(entry).toLowerCase();
      if (['.md', '.mdx', '.markdown', '.txt'].includes(ext)) {
        const rel = path.relative(base, fullPath).replace(/\\/g, '/');
        results.push(rel);
      }
    }
  }

  function sendDocTargets(): void {
    const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const targets: string[] = [];
    if (workspaceDir) {
      for (const folderName of ['Docs', 'docs']) {
        const folder = path.join(workspaceDir, folderName);
        if (fs.existsSync(folder) && fs.statSync(folder).isDirectory()) {
          collectDocFiles(folder, workspaceDir, targets);
        }
      }
    }
    panel._postMessage({ type: 'docTargets', targets: Array.from(new Set(targets)).sort() });
  }

  async function openDocFile(docTarget: string): Promise<void> {
    const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceDir) return;
    const fullPath = path.join(workspaceDir, docTarget);
    if (!fs.existsSync(fullPath)) {
      vscode.window.showWarningMessage(`Doc file not found: ${docTarget}`);
      return;
    }
    const doc = await vscode.workspace.openTextDocument(fullPath);
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
  }

  function sendDocInfo(docTarget: string): void {
    const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceDir) {
      panel._postMessage({ type: 'docInfo', info: null });
      return;
    }
    const fullPath = path.join(workspaceDir, docTarget);
    if (!fs.existsSync(fullPath)) {
      panel._postMessage({ type: 'docInfo', info: null });
      return;
    }
    try {
      const stat = fs.statSync(fullPath);
      panel._postMessage({
        type: 'docInfo',
        info: {
          path: docTarget,
          lastModified: stat.mtime.getTime(),
          size: stat.size
        }
      });
    } catch {
      panel._postMessage({ type: 'docInfo', info: null });
    }
  }

  return {
    sendDocTargets,
    openDocFile,
    sendDocInfo,
  };
}
