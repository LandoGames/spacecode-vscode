/**
 * Lint Checker
 *
 * Collects lint diagnostics from VSCode's ESLint extension.
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import {
  DiagnosticItem,
  DiagnosticCheckResult,
  DiagnosticSeverity
} from './types';

let _instance: LintChecker | undefined;

export function getLintChecker(): LintChecker {
  if (!_instance) {
    _instance = new LintChecker();
  }
  return _instance;
}

export class LintChecker {
  /**
   * Collect lint diagnostics from VSCode
   */
  async check(): Promise<DiagnosticCheckResult> {
    const startTime = Date.now();
    const items: DiagnosticItem[] = [];

    // Get all diagnostics from VSCode
    const diagnostics = vscode.languages.getDiagnostics();

    for (const [uri, fileDiagnostics] of diagnostics) {
      // Only check relevant files
      if (!this.isLintableFile(uri.fsPath)) {
        continue;
      }

      for (const diag of fileDiagnostics) {
        // Include ESLint, Prettier, and other lint sources
        if (diag.source === 'eslint' ||
            diag.source === 'prettier' ||
            diag.source === 'stylelint' ||
            diag.source === 'biome') {
          items.push(this.convertDiagnostic(uri.fsPath, diag));
        }
      }
    }

    const duration = Date.now() - startTime;
    const errorCount = items.filter(i => i.severity === 'error').length;
    const warningCount = items.filter(i => i.severity === 'warning').length;

    return {
      name: 'Lint Check',
      description: 'Code style and lint errors from ESLint/Prettier',
      status: errorCount > 0 ? 'fail' : warningCount > 0 ? 'warn' : 'pass',
      duration,
      items,
      summary: items.length > 0
        ? `${errorCount} error(s), ${warningCount} warning(s)`
        : 'No lint issues found'
    };
  }

  /**
   * Check if file should be linted
   */
  private isLintableFile(path: string): boolean {
    return /\.(ts|tsx|js|jsx|css|scss|json)$/.test(path);
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

    const code = typeof diag.code === 'object' ? String(diag.code.value) : String(diag.code || '');

    return {
      id: `lint-${id}`,
      category: 'lint',
      severity: severityMap[diag.severity],
      code,
      message: diag.message,
      file,
      line: diag.range.start.line + 1,
      column: diag.range.start.character + 1,
      endLine: diag.range.end.line + 1,
      endColumn: diag.range.end.character + 1,
      source: diag.source || 'lint',
      suggestion: this.getSuggestion(code, diag.message, diag.source)
    };
  }

  /**
   * Get suggestion for common lint rules
   */
  private getSuggestion(code: string, message: string, source?: string): string | undefined {
    // ESLint rules
    const eslintSuggestions: Record<string, string> = {
      'no-unused-vars': 'Remove the unused variable or prefix with underscore',
      'no-console': 'Remove console statement or use a logger',
      'eqeqeq': 'Use === instead of ==',
      'no-var': 'Use let or const instead of var',
      'prefer-const': 'Use const if variable is not reassigned',
      '@typescript-eslint/no-explicit-any': 'Use a specific type instead of any',
      '@typescript-eslint/no-unused-vars': 'Remove or use the variable',
      'import/no-unresolved': 'Check import path or install the package'
    };

    if (source === 'eslint' && eslintSuggestions[code]) {
      return eslintSuggestions[code];
    }

    // Prettier
    if (source === 'prettier') {
      return 'Run Prettier to auto-format this file';
    }

    return undefined;
  }
}
