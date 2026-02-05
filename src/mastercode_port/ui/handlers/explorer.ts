// @ts-nocheck

import * as vscode from 'vscode';

// Debounce timer for selection changes
let explorerDebounceTimer: any = null;
const DEBOUNCE_MS = 500;

export interface ExplorerContext {
  file: string;
  fileName: string;
  language: string;
  snippet: string;
  symbols: string[];
  sector: string;
  lineNumber: number;
  selection: string;
}

export function setupExplorerIntegration(panel: any): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];

  // Listen for active editor changes with debounce
  disposables.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!editor) return;
      debounceExplorerContext(panel, editor);
    })
  );

  // Listen for selection changes with debounce
  disposables.push(
    vscode.window.onDidChangeTextEditorSelection((e) => {
      if (e.textEditor === vscode.window.activeTextEditor) {
        debounceExplorerContext(panel, e.textEditor);
      }
    })
  );

  return disposables;
}

function debounceExplorerContext(panel: any, editor: vscode.TextEditor): void {
  if (explorerDebounceTimer) {
    clearTimeout(explorerDebounceTimer);
  }
  explorerDebounceTimer = setTimeout(() => {
    buildAndSendContext(panel, editor);
  }, DEBOUNCE_MS);
}

async function buildAndSendContext(panel: any, editor: vscode.TextEditor): Promise<void> {
  try {
    const doc = editor.document;
    const selection = editor.selection;
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const workspaceRoot = workspaceFolders?.[0]?.uri.fsPath || '';

    // Build file path relative to workspace
    let filePath = doc.uri.fsPath;
    if (workspaceRoot && filePath.startsWith(workspaceRoot)) {
      filePath = filePath.substring(workspaceRoot.length + 1);
    }

    // Get selection text (or current line)
    let selectedText = '';
    if (!selection.isEmpty) {
      selectedText = doc.getText(selection);
    }

    // Get snippet around cursor (5 lines before/after)
    const cursorLine = selection.active.line;
    const startLine = Math.max(0, cursorLine - 5);
    const endLine = Math.min(doc.lineCount - 1, cursorLine + 5);
    const range = new vscode.Range(startLine, 0, endLine, doc.lineAt(endLine).text.length);
    const snippet = doc.getText(range);

    // Get document symbols
    const symbols: string[] = [];
    try {
      const docSymbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        doc.uri
      );
      if (docSymbols) {
        for (const sym of docSymbols.slice(0, 20)) {
          symbols.push(`${vscode.SymbolKind[sym.kind]}: ${sym.name}`);
        }
      }
    } catch {
      // Symbol provider may not be available
    }

    // Detect sector from file path
    let sector = 'general';
    if (panel._sectorRules) {
      for (const [sectorId, config] of panel._sectorRules.entries()) {
        if (config.paths?.some((p: string) => filePath.includes(p))) {
          sector = sectorId;
          break;
        }
      }
    }

    const context: ExplorerContext = {
      file: filePath,
      fileName: doc.fileName.split('/').pop() || doc.fileName,
      language: doc.languageId,
      snippet,
      symbols,
      sector,
      lineNumber: cursorLine + 1,
      selection: selectedText,
    };

    panel._postMessage({ type: 'explorerContext', context });
  } catch (err) {
    console.error('[SpaceCode] Explorer context error:', err);
  }
}

export async function handleExplorerMessage(panel: any, message: any): Promise<boolean> {
  switch (message.type) {
    case 'explorerGetContext': {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        await buildAndSendContext(panel, editor);
      } else {
        panel._postMessage({ type: 'explorerContext', context: null });
      }
      return true;
    }

    case 'explorerPinContext': {
      // Store pinned context in globalState
      const pinned = panel._context?.globalState?.get('spacecode.pinnedContext', []) || [];
      if (message.context) {
        pinned.push({ ...message.context, pinnedAt: Date.now() });
        await panel._context?.globalState?.update('spacecode.pinnedContext', pinned.slice(-20));
      }
      panel._postMessage({ type: 'explorerContextPinned', pinned });
      return true;
    }

    case 'explorerClearContext': {
      panel._postMessage({ type: 'explorerContext', context: null });
      return true;
    }

    default:
      return false;
  }
}
