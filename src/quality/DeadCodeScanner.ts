/**
 * Dead Code Scanner
 *
 * Detects unused variables, functions, imports, and unreachable code.
 * Uses static analysis to identify potentially dead code.
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import {
  QualityFinding,
  QualitySeverity,
  DeadCode,
  QualityScanOptions
} from './types';

/**
 * Symbol definition with usage tracking
 */
interface SymbolInfo {
  name: string;
  type: 'variable' | 'function' | 'class' | 'import' | 'parameter';
  file: string;
  line: number;
  exported: boolean;
  usageCount: number;
  usageFiles: Set<string>;
}

let _instance: DeadCodeScanner | undefined;

export function getDeadCodeScanner(): DeadCodeScanner {
  if (!_instance) {
    _instance = new DeadCodeScanner();
  }
  return _instance;
}

export class DeadCodeScanner {
  private symbols = new Map<string, SymbolInfo>();

  /**
   * Scan workspace for dead code
   */
  async scanWorkspace(options?: QualityScanOptions): Promise<QualityFinding[]> {
    const findings: QualityFinding[] = [];
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders) {
      return findings;
    }

    // Clear symbol tracking
    this.symbols.clear();

    // Build file pattern
    const pattern = '**/*.{ts,js,tsx,jsx,cs}';
    const excludePattern = this.buildExcludePattern(options);
    const files = await vscode.workspace.findFiles(pattern, excludePattern, 1000);

    // First pass: collect all symbol definitions
    for (const file of files) {
      try {
        const doc = await vscode.workspace.openTextDocument(file);
        this.collectSymbols(file.fsPath, doc.getText());
      } catch {
        // Skip files that can't be read
      }
    }

    // Second pass: find usages
    for (const file of files) {
      try {
        const doc = await vscode.workspace.openTextDocument(file);
        this.findUsages(file.fsPath, doc.getText());
      } catch {
        // Skip files that can't be read
      }
    }

    // Third pass: detect dead code patterns
    for (const file of files) {
      try {
        const doc = await vscode.workspace.openTextDocument(file);
        const deadCode = this.detectDeadCode(file.fsPath, doc.getText());

        for (const dc of deadCode) {
          findings.push(this.createFinding(dc));
        }
      } catch {
        // Skip files that can't be read
      }
    }

    // Report unused symbols
    for (const [key, symbol] of this.symbols) {
      if (symbol.usageCount === 0 && !symbol.exported) {
        findings.push(this.createFinding({
          symbol: symbol.name,
          type: symbol.type,
          file: symbol.file,
          line: symbol.line,
          reason: `${symbol.type} '${symbol.name}' is never used`,
          confidence: 'medium'
        }));
      }
    }

    return findings;
  }

  /**
   * Scan a single file for dead code
   */
  async scanFile(filePath: string): Promise<QualityFinding[]> {
    const findings: QualityFinding[] = [];

    try {
      const uri = vscode.Uri.file(filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      const content = doc.getText();

      // Collect and analyze within single file
      this.symbols.clear();
      this.collectSymbols(filePath, content);
      this.findUsages(filePath, content);

      const deadCode = this.detectDeadCode(filePath, content);
      for (const dc of deadCode) {
        findings.push(this.createFinding(dc));
      }

      // Check for unused locals
      for (const [key, symbol] of this.symbols) {
        if (symbol.file === filePath && symbol.usageCount === 0 && !symbol.exported) {
          findings.push(this.createFinding({
            symbol: symbol.name,
            type: symbol.type,
            file: symbol.file,
            line: symbol.line,
            reason: `${symbol.type} '${symbol.name}' is never used`,
            confidence: 'medium'
          }));
        }
      }
    } catch {
      // Skip files that can't be read
    }

    return findings;
  }

  /**
   * Collect symbol definitions from content
   */
  private collectSymbols(file: string, content: string): void {
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Skip comments
      if (this.isComment(line)) {
        continue;
      }

      // Detect functions
      this.collectFunctions(file, line, lineNum);

      // Detect variables
      this.collectVariables(file, line, lineNum);

      // Detect classes
      this.collectClasses(file, line, lineNum);

      // Detect imports
      this.collectImports(file, line, lineNum);
    }
  }

  /**
   * Collect function definitions
   */
  private collectFunctions(file: string, line: string, lineNum: number): void {
    // TypeScript/JavaScript functions
    const funcPatterns = [
      /(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
      /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/,
      /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\w+\s*=>/,
      /(?:public|private|protected)?\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*[:{]/
    ];

    for (const pattern of funcPatterns) {
      const match = line.match(pattern);
      if (match) {
        const name = match[1];
        if (name && !this.isBuiltIn(name)) {
          const key = `${file}:${name}`;
          this.symbols.set(key, {
            name,
            type: 'function',
            file,
            line: lineNum,
            exported: line.includes('export'),
            usageCount: 0,
            usageFiles: new Set()
          });
        }
      }
    }
  }

  /**
   * Collect variable definitions
   */
  private collectVariables(file: string, line: string, lineNum: number): void {
    // TypeScript/JavaScript variables
    const varPatterns = [
      /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*[=:]/,
      /(?:public|private|protected)\s+(?:readonly\s+)?(\w+)\s*[=:;]/
    ];

    for (const pattern of varPatterns) {
      const match = line.match(pattern);
      if (match) {
        const name = match[1];
        // Skip if it looks like a function
        if (name && !this.isBuiltIn(name) && !line.includes('=>') && !line.includes('function')) {
          const key = `${file}:${name}`;
          if (!this.symbols.has(key)) {
            this.symbols.set(key, {
              name,
              type: 'variable',
              file,
              line: lineNum,
              exported: line.includes('export'),
              usageCount: 0,
              usageFiles: new Set()
            });
          }
        }
      }
    }
  }

  /**
   * Collect class definitions
   */
  private collectClasses(file: string, line: string, lineNum: number): void {
    const classPattern = /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/;
    const match = line.match(classPattern);

    if (match) {
      const name = match[1];
      const key = `${file}:${name}`;
      this.symbols.set(key, {
        name,
        type: 'class',
        file,
        line: lineNum,
        exported: line.includes('export'),
        usageCount: 0,
        usageFiles: new Set()
      });
    }
  }

  /**
   * Collect import statements
   */
  private collectImports(file: string, line: string, lineNum: number): void {
    // Named imports: import { a, b } from 'x'
    const namedImportPattern = /import\s*\{([^}]+)\}\s*from/;
    const namedMatch = line.match(namedImportPattern);

    if (namedMatch) {
      const imports = namedMatch[1].split(',').map(s => s.trim().split(/\s+as\s+/).pop()?.trim());
      for (const name of imports) {
        if (name) {
          const key = `${file}:import:${name}`;
          this.symbols.set(key, {
            name,
            type: 'import',
            file,
            line: lineNum,
            exported: false,
            usageCount: 0,
            usageFiles: new Set()
          });
        }
      }
    }

    // Default imports: import x from 'y'
    const defaultImportPattern = /import\s+(\w+)\s+from/;
    const defaultMatch = line.match(defaultImportPattern);

    if (defaultMatch && !line.includes('{')) {
      const name = defaultMatch[1];
      const key = `${file}:import:${name}`;
      this.symbols.set(key, {
        name,
        type: 'import',
        file,
        line: lineNum,
        exported: false,
        usageCount: 0,
        usageFiles: new Set()
      });
    }
  }

  /**
   * Find usages of symbols
   */
  private findUsages(file: string, content: string): void {
    // Remove string literals and comments to avoid false positives
    const cleaned = content
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(["'`])(?:(?!\1)[^\\]|\\.)*\1/g, '""');

    for (const [key, symbol] of this.symbols) {
      // Create word boundary pattern
      const pattern = new RegExp(`\\b${this.escapeRegex(symbol.name)}\\b`, 'g');
      const matches = cleaned.match(pattern);

      if (matches) {
        // Subtract 1 for the definition itself if same file
        const usageCount = symbol.file === file ? matches.length - 1 : matches.length;
        if (usageCount > 0) {
          symbol.usageCount += usageCount;
          symbol.usageFiles.add(file);
        }
      }
    }
  }

  /**
   * Detect dead code patterns
   */
  private detectDeadCode(file: string, content: string): DeadCode[] {
    const deadCode: DeadCode[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Check for unreachable code after return/throw/break/continue
      if (i > 0) {
        const prevLine = lines[i - 1].trim();
        if (/^(return|throw|break|continue)\b/.test(prevLine) && !this.isComment(line) && line.trim().length > 0) {
          // Check if it's a closing brace or label
          if (!/^[}\])]|^\w+:/.test(line.trim())) {
            deadCode.push({
              symbol: line.trim().slice(0, 30),
              type: 'variable',
              file,
              line: lineNum,
              reason: 'Code after return/throw/break/continue is unreachable',
              confidence: 'high'
            });
          }
        }
      }

      // Check for commented-out code
      if (this.isCommentedCode(line)) {
        deadCode.push({
          symbol: line.trim().slice(0, 30),
          type: 'variable',
          file,
          line: lineNum,
          reason: 'Commented-out code should be removed',
          confidence: 'low'
        });
      }

      // Check for unused parameters (prefixed with _)
      const unusedParamMatch = line.match(/\(\s*_(\w+)/);
      if (unusedParamMatch) {
        deadCode.push({
          symbol: `_${unusedParamMatch[1]}`,
          type: 'parameter',
          file,
          line: lineNum,
          reason: `Parameter '_${unusedParamMatch[1]}' is marked as unused`,
          confidence: 'high'
        });
      }

      // Check for TODO/FIXME dead code markers
      if (/\/\/\s*(TODO|FIXME):\s*(remove|delete|dead|unused)/i.test(line)) {
        deadCode.push({
          symbol: line.trim().slice(0, 50),
          type: 'variable',
          file,
          line: lineNum,
          reason: 'Code marked for removal',
          confidence: 'high'
        });
      }
    }

    return deadCode;
  }

  /**
   * Check if line is a comment
   */
  private isComment(line: string): boolean {
    const trimmed = line.trim();
    return trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*');
  }

  /**
   * Check if line contains commented-out code
   */
  private isCommentedCode(line: string): boolean {
    const trimmed = line.trim();

    // Must be a comment
    if (!trimmed.startsWith('//')) {
      return false;
    }

    const commentContent = trimmed.slice(2).trim();

    // Skip empty comments
    if (commentContent.length < 5) {
      return false;
    }

    // Skip text comments (contain spaces and common words)
    if (/\b(the|is|are|was|were|be|been|this|that|TODO|FIXME|NOTE|HACK)\b/i.test(commentContent)) {
      return false;
    }

    // Check for code patterns
    const codePatterns = [
      /^(const|let|var|function|class|if|for|while|return|import|export)\s/,
      /[{};]\s*$/,
      /\.\w+\(/,
      /=>\s*{/,
      /\(\s*\)\s*{/
    ];

    return codePatterns.some(p => p.test(commentContent));
  }

  /**
   * Check if identifier is a built-in
   */
  private isBuiltIn(name: string): boolean {
    const builtIns = new Set([
      'constructor', 'prototype', 'toString', 'valueOf',
      'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable',
      'toLocaleString', 'length', 'name', 'arguments', 'caller',
      'apply', 'bind', 'call', 'then', 'catch', 'finally'
    ]);
    return builtIns.has(name);
  }

  /**
   * Escape regex special characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Build exclude pattern for file search
   */
  private buildExcludePattern(options?: QualityScanOptions): string {
    const excludes = [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/out/**',
      '**/.git/**',
      '**/Library/**',
      '**/Temp/**',
      '**/*.min.js',
      '**/*.d.ts',
      '**/*.test.ts',
      '**/*.spec.ts'
    ];

    if (options?.exclude) {
      excludes.push(...options.exclude);
    }

    return `{${excludes.join(',')}}`;
  }

  /**
   * Create finding from dead code
   */
  private createFinding(dc: DeadCode): QualityFinding {
    const severityMap: Record<string, QualitySeverity> = {
      high: 'warning',
      medium: 'info',
      low: 'info'
    };

    const typeMap: Record<string, 'unused-variable' | 'unused-function' | 'unused-import' | 'unreachable-code' | 'commented-code'> = {
      variable: 'unused-variable',
      function: 'unused-function',
      class: 'unused-function',
      import: 'unused-import',
      parameter: 'unused-variable'
    };

    const id = `dead-${crypto.createHash('md5').update(
      `${dc.file}:${dc.line}:${dc.symbol}`
    ).digest('hex').slice(0, 8)}`;

    // Determine specific type based on reason
    let type = typeMap[dc.type] || 'unused-variable';
    if (dc.reason.includes('unreachable')) {
      type = 'unreachable-code';
    } else if (dc.reason.includes('Commented')) {
      type = 'commented-code';
    }

    return {
      id,
      category: 'dead-code',
      type,
      severity: severityMap[dc.confidence] || 'info',
      message: dc.reason,
      description: `Consider removing ${dc.type} '${dc.symbol}'`,
      file: dc.file,
      line: dc.line,
      codeSnippet: dc.symbol,
      suggestion: dc.type === 'import'
        ? 'Remove unused import'
        : `Remove unused ${dc.type} or prefix with underscore if intentionally unused`,
      autoFixable: dc.type === 'import'
    };
  }
}
