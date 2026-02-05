// @ts-nocheck

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { logger } from '../../services/logService';
import { SectorConfig } from '../../sectors';

export function createShipImpl(panel: any) {
  function requireDocTarget(action: string): boolean {
    if (panel._shipProfile !== 'yard' && !panel._docTarget) {
      panel._postMessage({
        type: 'autoexecuteBlocked',
        message: `${action} requires a docs target when not in Yard.`
      });
      panel._postMessage({
        type: 'status',
        status: { message: 'Select a docs file before proceeding outside Yard.' }
      });
      return false;
    }
    return true;
  }

  function requireAutoexecute(action: string, actionKey: string, payload: any, options: { skipDocGate?: boolean } = {}): boolean {
    if (!options.skipDocGate && !requireDocTarget(action)) return false;
    if (panel._autoexecuteEnabled) return true;
    const context = panel._contextPreviewText.replace(/\n{2,}/g, '\n\n');
    panel._enqueueJob({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      action,
      actionKey,
      payload,
      sector: panel._shipSectorId,
      docTarget: panel._docTarget,
      context
    });
    panel._postMessage({
      type: 'autoexecuteBlocked',
      action,
      message: `${action} is gated when Autoexecute is off; added to Approval Queue.`
    });
    return false;
  }

  function scheduleContextPreviewSend(): void {
    if (panel._contextPreviewTimer) clearTimeout(panel._contextPreviewTimer);
    panel._contextPreviewTimer = setTimeout(() => {
      void sendContextPreview();
    }, 150);
  }

  function buildContextPreviewText(): string {
    if (panel._gatheredContext && Date.now() - panel._gatheredContext.timestamp < 60000) {
      const editor = vscode.window.activeTextEditor;
      let additionalContext = '';

      if (editor) {
        const doc = editor.document;
        const uri = doc.uri;
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
        const relPath = workspaceFolder ? vscode.workspace.asRelativePath(uri) : uri.fsPath;

        const diags = vscode.languages.getDiagnostics(uri) || [];
        if (diags.length > 0) {
          const diagLines = diags.slice(0, 20).map(d => {
            const sev = d.severity === vscode.DiagnosticSeverity.Error ? 'error'
              : d.severity === vscode.DiagnosticSeverity.Warning ? 'warn'
              : d.severity === vscode.DiagnosticSeverity.Information ? 'info'
              : 'hint';
            const line = d.range.start.line + 1;
            const col = d.range.start.character + 1;
            return `- ${sev} ${relPath}:${line}:${col} ${d.message}`;
          });
          additionalContext += `\n=== DIAGNOSTICS ===\n${diagLines.join('\n')}\n`;
        }

        if (!editor.selection.isEmpty) {
          let selectionText = doc.getText(editor.selection);
          if (selectionText.length > 2000) selectionText = selectionText.slice(0, 2000) + '\n...(truncated)';
          additionalContext += `\n=== SELECTION ===\n\`\`\`${doc.languageId}\n${selectionText}\n\`\`\`\n`;
        }
      }

      const fullContext = panel._gatheredContext.injectionText + additionalContext;
      panel._lastEditorContextPreviewText = fullContext;
      return fullContext;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return panel._lastEditorContextPreviewText || '[SpaceCode Context]\n(No active editor yet - click a code file)\n';
    }

    const doc = editor.document;
    const uri = doc.uri;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    const relPath = workspaceFolder ? vscode.workspace.asRelativePath(uri) : uri.fsPath;

    let selectionText = '';
    if (!editor.selection.isEmpty) {
      selectionText = doc.getText(editor.selection);
      if (selectionText.length > 2000) selectionText = selectionText.slice(0, 2000) + '\n...(truncated)';
    }

    const diags = vscode.languages.getDiagnostics(uri) || [];
    const diagLines = diags.slice(0, 20).map(d => {
      const sev = d.severity === vscode.DiagnosticSeverity.Error ? 'error'
        : d.severity === vscode.DiagnosticSeverity.Warning ? 'warn'
        : d.severity === vscode.DiagnosticSeverity.Information ? 'info'
        : 'hint';
      const line = d.range.start.line + 1;
      const col = d.range.start.character + 1;
      return `- ${sev} ${relPath}:${line}:${col} ${d.message}`;
    });

    const docLine = panel._docTarget ? `Doc Target: ${panel._docTarget}\n` : `Doc Target: (none)\n`;
    const header =
      `[SpaceCode Context]\n` +
      `Station Sector: ${panel._shipSectorId}\n` +
      `Profile: ${panel._shipProfile}\n` +
      docLine +
      `File: ${relPath}\n` +
      `Language: ${doc.languageId}\n`;

    const diagBlock = diagLines.length
      ? `\n[Diagnostics]\n${diagLines.join('\n')}\n`
      : `\n[Diagnostics]\n(none)\n`;

    const selBlock = selectionText
      ? `\n[Selection]\n\`\`\`${doc.languageId}\n${selectionText}\n\`\`\`\n`
      : `\n[Selection]\n(none)\n`;

    const text = header + diagBlock + selBlock;
    panel._lastEditorContextPreviewText = text;
    return text;
  }

  async function sendContextPreview(): Promise<void> {
    const text = buildContextPreviewText();
    panel._contextPreviewText = text;
    panel._postMessage({ type: 'contextPreview', text });

    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && activeEditor.document.uri.scheme === 'file') {
      const filePath = activeEditor.document.uri.fsPath;
      const detectedSector = panel.sectorManager.detectSector(filePath);
      const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
      const relPath = workspaceDir ? path.relative(workspaceDir, filePath) : filePath;
      const parentDir = path.dirname(relPath);
      const parentLabel = parentDir && parentDir !== '.' ? path.basename(parentDir) : '';
      const fileName = path.basename(relPath);
      const lineNumber = activeEditor.selection.active.line + 1;
      const sectorName = detectedSector?.name || panel._shipSectorId.toUpperCase();
      const breadcrumb = `${sectorName} > ${parentLabel ? parentLabel + ' > ' : ''}${fileName}:${lineNumber}`;
      panel._postMessage({
        type: 'activeBreadcrumb',
        breadcrumb,
        filePath: relPath,
        sectorId: detectedSector?.id || panel._shipSectorId,
        sectorName
      });
      if (detectedSector && detectedSector.id !== panel._shipSectorId) {
        panel._shipSectorId = detectedSector.id;
        panel._postMessage({
          type: 'shipSectorDetected',
          sectorId: detectedSector.id,
          sectorName: detectedSector.name,
          filePath: filePath
        });
      }
    } else {
      panel._postMessage({
        type: 'activeBreadcrumb',
        breadcrumb: 'No active file',
        filePath: '',
        sectorId: panel._shipSectorId,
        sectorName: panel._shipSectorId.toUpperCase()
      });
    }
  }

  function loadSectorConfig(workspaceDir: string): SectorConfig | null {
    if (!workspaceDir) return null;

    const configPath = path.join(workspaceDir, '.spacecode', 'sector-config.json');
    if (!fs.existsSync(configPath)) return null;

    try {
      const raw = fs.readFileSync(configPath, 'utf8');
      const parsed = JSON.parse(raw) as SectorConfig;
      if (!parsed || !Array.isArray(parsed.sectors)) {
        console.warn('[SpaceCode] Invalid sector config format:', configPath);
        return null;
      }
      return parsed;
    } catch (err) {
      console.warn('[SpaceCode] Failed to load sector config:', configPath, err);
      return null;
    }
  }

  async function handleStationAction(action: string, sceneId?: string): Promise<void> {
    logger.log('ui', `Station action: ${action}, scene: ${sceneId}`);

    switch (action) {
      case 'run-gates':
        await panel._runGatesCheck();
        break;
      case 'docs-status':
        await panel._checkDocsStatus();
        break;
      case 'build-status':
        await panel._scanGitDiff();
        break;
      case 'test-status':
        await panel._runRegressionTests();
        break;
      case 'open-terminal':
        panel._openTerminal();
        break;
      default:
        logger.log('ui', `Unhandled station action: ${action}`);
        break;
    }
  }

  return {
    requireDocTarget,
    requireAutoexecute,
    scheduleContextPreviewSend,
    buildContextPreviewText,
    sendContextPreview,
    loadSectorConfig,
    handleStationAction,
  };
}
