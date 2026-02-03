/**
 * TypeScript Checker
 *
 * Runs TypeScript compiler checks to detect type errors and syntax issues.
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import {
  DiagnosticItem,
  DiagnosticCheckResult,
  DiagnosticSeverity
} from './types';

let _instance: TypeScriptChecker | undefined;

export function getTypeScriptChecker(): TypeScriptChecker {
  if (!_instance) {
    _instance = new TypeScriptChecker();
  }
  return _instance;
}

export class TypeScriptChecker {
  /**
   * Run TypeScript diagnostics using VSCode's built-in TypeScript language features
   */
  async check(): Promise<DiagnosticCheckResult> {
    const startTime = Date.now();
    const items: DiagnosticItem[] = [];

    // Get all TypeScript/JavaScript diagnostics from VSCode
    const diagnostics = vscode.languages.getDiagnostics();

    for (const [uri, fileDiagnostics] of diagnostics) {
      // Only check TypeScript/JavaScript files
      if (!this.isTypeScriptFile(uri.fsPath)) {
        continue;
      }

      for (const diag of fileDiagnostics) {
        // Only include TypeScript diagnostics
        if (diag.source !== 'ts' && diag.source !== 'typescript') {
          continue;
        }

        items.push(this.convertDiagnostic(uri.fsPath, diag));
      }
    }

    const duration = Date.now() - startTime;
    const errorCount = items.filter(i => i.severity === 'error').length;
    const warningCount = items.filter(i => i.severity === 'warning').length;

    return {
      name: 'TypeScript Check',
      description: 'Type errors and syntax issues from TypeScript compiler',
      status: errorCount > 0 ? 'fail' : warningCount > 0 ? 'warn' : 'pass',
      duration,
      items,
      summary: errorCount > 0
        ? `${errorCount} error(s), ${warningCount} warning(s)`
        : warningCount > 0
          ? `${warningCount} warning(s)`
          : 'No issues found'
    };
  }

  /**
   * Check if file is a TypeScript/JavaScript file
   */
  private isTypeScriptFile(path: string): boolean {
    return /\.(ts|tsx|js|jsx)$/.test(path);
  }

  /**
   * Convert VSCode diagnostic to our format
   */
  private convertDiagnostic(file: string, diag: vscode.Diagnostic): DiagnosticItem {
    const severityMap: Record<vscode.DiagnosticSeverity, DiagnosticSeverity> = {
      [vscode.DiagnosticSeverity.Error]: 'error',
      [vscode.DiagnosticSeverity.Warning]: 'warning',
      [vscode.DiagnosticSeverity.Information]: 'info',
      [vscode.DiagnosticSeverity.Hint]: 'info'
    };

    const id = crypto.createHash('md5').update(
      `${file}:${diag.range.start.line}:${diag.message}`
    ).digest('hex').slice(0, 8);

    return {
      id: `ts-${id}`,
      category: diag.code ? 'type' : 'syntax',
      severity: severityMap[diag.severity],
      code: typeof diag.code === 'object' ? String(diag.code.value) : String(diag.code || ''),
      message: diag.message,
      file,
      line: diag.range.start.line + 1,
      column: diag.range.start.character + 1,
      endLine: diag.range.end.line + 1,
      endColumn: diag.range.end.character + 1,
      source: 'tsc',
      suggestion: this.getSuggestion(diag.code, diag.message)
    };
  }

  /**
   * Get suggestion for common TypeScript errors
   */
  private getSuggestion(code: string | number | { value: string | number; target: vscode.Uri } | undefined, message: string): string | undefined {
    const codeStr = typeof code === 'object' ? String(code.value) : String(code || '');

    // Common TypeScript error suggestions
    const suggestions: Record<string, string> = {
      '2304': 'Check import statements or add the missing declaration',
      '2322': 'Verify type assignments match the expected type',
      '2339': 'Check property spelling or add it to the type definition',
      '2345': 'Ensure argument types match parameter types',
      '2554': 'Check the number of arguments passed to the function',
      '2741': 'Add the missing required property to the object',
      '7006': 'Add explicit type annotation to the parameter',
      '7016': 'Install type definitions with npm install @types/...',
      '7031': 'Ensure binding element has a type annotation'
    };

    if (suggestions[codeStr]) {
      return suggestions[codeStr];
    }

    // Generic suggestions based on message patterns
    if (message.includes('cannot find')) {
      return 'Check import statements and ensure the module is installed';
    }
    if (message.includes('not assignable')) {
      return 'Verify type compatibility or use type assertion';
    }
    if (message.includes('implicitly has')) {
      return 'Add explicit type annotation';
    }

    return undefined;
  }
}
