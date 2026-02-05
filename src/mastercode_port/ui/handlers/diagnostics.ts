// @ts-nocheck

import * as vscode from 'vscode';
import { getDiagnosticsScanner } from '../../../diagnostics';
import { DiagnosticScanResult } from '../../../diagnostics/types';

let _lastScanResult: DiagnosticScanResult | null = null;

export async function handleDiagnosticsMessage(panel: any, message: any): Promise<boolean> {
  switch (message.type) {
    case 'diagnosticsScan': {
      try {
        panel._postMessage({ type: 'diagnosticsProgress', stage: 'Running diagnostics...', progress: 0 });

        const scanner = getDiagnosticsScanner();
        const mode = message.mode || 'quick'; // 'quick' | 'full'

        let result: DiagnosticScanResult;
        if (mode === 'full') {
          result = await scanner.scan({ checks: ['typescript', 'lint', 'build'] });
        } else {
          result = await scanner.scan({ checks: ['typescript', 'lint'] });
        }

        _lastScanResult = result;

        panel._postMessage({
          type: 'diagnosticsResult',
          result,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Diagnostics scan failed';
        panel._postMessage({ type: 'diagnosticsResult', result: null, error: msg });
      }
      return true;
    }

    case 'diagnosticsGetLast': {
      panel._postMessage({
        type: 'diagnosticsResult',
        result: _lastScanResult,
      });
      return true;
    }

    case 'diagnosticsOpenFile': {
      if (message.file) {
        const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const fullPath = wsFolder ? `${wsFolder}/${message.file}` : message.file;
        try {
          const doc = await vscode.workspace.openTextDocument(fullPath);
          const line = Math.max(0, (message.line || 1) - 1);
          await vscode.window.showTextDocument(doc, {
            selection: new vscode.Range(line, 0, line, 0),
          });
        } catch {
          vscode.window.showErrorMessage(`Could not open: ${message.file}`);
        }
      }
      return true;
    }

    default:
      return false;
  }
}
