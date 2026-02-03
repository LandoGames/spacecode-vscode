/**
 * Magic Value Scanner
 *
 * Detects hardcoded magic numbers, strings, paths, URLs, and colors
 * that should be extracted into named constants.
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import {
  QualityFinding,
  QualitySeverity,
  MagicValue,
  QualityScanOptions
} from './types';

/**
 * Allowed magic values that are commonly used and acceptable
 */
const ALLOWED_NUMBERS = new Set([
  0, 1, 2, -1, 10, 100, 1000, // Common indices and multipliers
  0.0, 1.0, 0.5, 2.0, -1.0,   // Common floats
  60, 24, 365, 360, 180, 90,  // Time and angles
  255, 256, 1024, 2048,       // Binary values
]);

const ALLOWED_STRINGS = new Set([
  '', ' ', '\n', '\t', '\r\n',
  'true', 'false', 'null', 'undefined',
  'id', 'name', 'type', 'value', 'key',
  'error', 'message', 'data', 'result',
  'GET', 'POST', 'PUT', 'DELETE', 'PATCH',
  'utf-8', 'utf8', 'ascii', 'base64',
  'application/json', 'text/plain', 'text/html',
]);

/**
 * Patterns that indicate a value is likely a magic value
 */
const MAGIC_NUMBER_PATTERN = /\b(?<![\w.])(-?\d+\.?\d*)\b(?![\w.])/g;
const MAGIC_STRING_PATTERN = /(["'`])(?:(?!\1)[^\\]|\\.)*\1/g;
const HARDCODED_PATH_PATTERN = /(["'`])(?:\/[\w\-.]+)+\/?(?:\.[\w]+)?\1/g;
const HARDCODED_URL_PATTERN = /(["'`])https?:\/\/[^\s"'`]+\1/g;
const HARDCODED_COLOR_PATTERN = /(["'`])#[0-9A-Fa-f]{3,8}\1|rgba?\s*\(\s*\d+/g;

let _instance: MagicValueScanner | undefined;

export function getMagicValueScanner(): MagicValueScanner {
  if (!_instance) {
    _instance = new MagicValueScanner();
  }
  return _instance;
}

export class MagicValueScanner {
  private valueOccurrences = new Map<string, MagicValue[]>();

  /**
   * Scan workspace for magic values
   */
  async scanWorkspace(options?: QualityScanOptions): Promise<QualityFinding[]> {
    const findings: QualityFinding[] = [];
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders) {
      return findings;
    }

    // Clear occurrence tracking
    this.valueOccurrences.clear();

    // Build file pattern
    const pattern = '**/*.{ts,js,tsx,jsx,cs}';
    const excludePattern = this.buildExcludePattern(options);
    const files = await vscode.workspace.findFiles(pattern, excludePattern, 1000);

    // Scan all files
    for (const file of files) {
      try {
        const doc = await vscode.workspace.openTextDocument(file);
        const magicValues = this.findMagicValues(file.fsPath, doc.getText());

        // Track occurrences
        for (const mv of magicValues) {
          const key = `${mv.type}:${mv.value}`;
          const existing = this.valueOccurrences.get(key) || [];
          existing.push(mv);
          this.valueOccurrences.set(key, existing);
        }
      } catch {
        // Skip files that can't be read
      }
    }

    // Create findings for values that appear multiple times
    for (const [key, occurrences] of this.valueOccurrences) {
      if (occurrences.length >= 2 || this.isSignificantValue(occurrences[0])) {
        for (const occ of occurrences) {
          findings.push(this.createFinding(occ, occurrences.length));
        }
      }
    }

    return findings;
  }

  /**
   * Scan a single file for magic values
   */
  async scanFile(filePath: string): Promise<QualityFinding[]> {
    const findings: QualityFinding[] = [];

    try {
      const uri = vscode.Uri.file(filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      const magicValues = this.findMagicValues(filePath, doc.getText());

      for (const mv of magicValues) {
        findings.push(this.createFinding(mv, mv.occurrences));
      }
    } catch {
      // Skip files that can't be read
    }

    return findings;
  }

  /**
   * Find magic values in file content
   */
  private findMagicValues(file: string, content: string): MagicValue[] {
    const values: MagicValue[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Skip comments and imports
      if (this.isCommentOrImport(line)) {
        continue;
      }

      // Find magic numbers
      values.push(...this.findMagicNumbers(file, line, lineNum));

      // Find magic strings
      values.push(...this.findMagicStrings(file, line, lineNum));

      // Find hardcoded paths
      values.push(...this.findHardcodedPaths(file, line, lineNum));

      // Find hardcoded URLs
      values.push(...this.findHardcodedUrls(file, line, lineNum));

      // Find hardcoded colors
      values.push(...this.findHardcodedColors(file, line, lineNum));
    }

    return values;
  }

  /**
   * Find magic numbers in a line
   */
  private findMagicNumbers(file: string, line: string, lineNum: number): MagicValue[] {
    const values: MagicValue[] = [];

    // Skip lines that are likely constant definitions
    if (this.isConstantDefinition(line)) {
      return values;
    }

    // Skip array indices and loop bounds
    if (this.isArrayAccessOrLoop(line)) {
      return values;
    }

    let match;
    const pattern = new RegExp(MAGIC_NUMBER_PATTERN.source, 'g');

    while ((match = pattern.exec(line)) !== null) {
      const numStr = match[1];
      const num = parseFloat(numStr);

      // Skip allowed numbers
      if (ALLOWED_NUMBERS.has(num)) {
        continue;
      }

      // Skip version numbers
      if (this.isVersionNumber(line, match.index)) {
        continue;
      }

      // Skip enum values
      if (this.isEnumValue(line)) {
        continue;
      }

      values.push({
        value: num,
        type: 'number',
        file,
        line: lineNum,
        column: match.index,
        context: line.trim(),
        suggestedName: this.suggestName(num, 'number', line),
        occurrences: 1
      });
    }

    return values;
  }

  /**
   * Find magic strings in a line
   */
  private findMagicStrings(file: string, line: string, lineNum: number): MagicValue[] {
    const values: MagicValue[] = [];

    // Skip constant definitions
    if (this.isConstantDefinition(line)) {
      return values;
    }

    let match;
    const pattern = new RegExp(MAGIC_STRING_PATTERN.source, 'g');

    while ((match = pattern.exec(line)) !== null) {
      const str = match[0].slice(1, -1); // Remove quotes

      // Skip allowed strings
      if (ALLOWED_STRINGS.has(str) || str.length < 3) {
        continue;
      }

      // Skip template literals with expressions
      if (match[0].startsWith('`') && str.includes('${')) {
        continue;
      }

      // Skip paths (handled separately)
      if (str.startsWith('/') || str.includes('://')) {
        continue;
      }

      // Skip colors (handled separately)
      if (str.startsWith('#') && /^#[0-9A-Fa-f]{3,8}$/.test(str)) {
        continue;
      }

      // Skip likely property names
      if (/^[a-z][a-zA-Z0-9]*$/.test(str) && str.length < 20) {
        continue;
      }

      values.push({
        value: str,
        type: 'string',
        file,
        line: lineNum,
        column: match.index,
        context: line.trim(),
        suggestedName: this.suggestName(str, 'string', line),
        occurrences: 1
      });
    }

    return values;
  }

  /**
   * Find hardcoded paths in a line
   */
  private findHardcodedPaths(file: string, line: string, lineNum: number): MagicValue[] {
    const values: MagicValue[] = [];

    let match;
    const pattern = new RegExp(HARDCODED_PATH_PATTERN.source, 'g');

    while ((match = pattern.exec(line)) !== null) {
      const path = match[0].slice(1, -1);

      // Skip relative paths that are likely configuration
      if (path.startsWith('./') || path.startsWith('../')) {
        continue;
      }

      values.push({
        value: path,
        type: 'path',
        file,
        line: lineNum,
        column: match.index,
        context: line.trim(),
        suggestedName: this.suggestName(path, 'path', line),
        occurrences: 1
      });
    }

    return values;
  }

  /**
   * Find hardcoded URLs in a line
   */
  private findHardcodedUrls(file: string, line: string, lineNum: number): MagicValue[] {
    const values: MagicValue[] = [];

    let match;
    const pattern = new RegExp(HARDCODED_URL_PATTERN.source, 'g');

    while ((match = pattern.exec(line)) !== null) {
      const url = match[0].slice(1, -1);

      // Skip localhost (often used for development)
      if (url.includes('localhost') || url.includes('127.0.0.1')) {
        continue;
      }

      values.push({
        value: url,
        type: 'url',
        file,
        line: lineNum,
        column: match.index,
        context: line.trim(),
        suggestedName: this.suggestName(url, 'url', line),
        occurrences: 1
      });
    }

    return values;
  }

  /**
   * Find hardcoded colors in a line
   */
  private findHardcodedColors(file: string, line: string, lineNum: number): MagicValue[] {
    const values: MagicValue[] = [];

    // Skip CSS files and style definitions
    if (file.endsWith('.css') || file.endsWith('.scss') || file.endsWith('.less')) {
      return values;
    }

    let match;
    const pattern = new RegExp(HARDCODED_COLOR_PATTERN.source, 'g');

    while ((match = pattern.exec(line)) !== null) {
      const color = match[0].replace(/^["'`]|["'`]$/g, '');

      values.push({
        value: color,
        type: 'color',
        file,
        line: lineNum,
        column: match.index,
        context: line.trim(),
        suggestedName: this.suggestName(color, 'color', line),
        occurrences: 1
      });
    }

    return values;
  }

  /**
   * Check if line is a comment or import
   */
  private isCommentOrImport(line: string): boolean {
    const trimmed = line.trim();
    return (
      trimmed.startsWith('//') ||
      trimmed.startsWith('/*') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('import ') ||
      trimmed.startsWith('using ') ||
      trimmed.startsWith('require(')
    );
  }

  /**
   * Check if line is a constant definition
   */
  private isConstantDefinition(line: string): boolean {
    const trimmed = line.trim();
    return (
      /^\s*(const|readonly|static\s+readonly|final|#define)\s+[A-Z_][A-Z0-9_]*\s*[:=]/.test(line) ||
      /^\s*[A-Z_][A-Z0-9_]*\s*[:=]/.test(trimmed) ||
      trimmed.includes('= Object.freeze(')
    );
  }

  /**
   * Check if line is array access or loop
   */
  private isArrayAccessOrLoop(line: string): boolean {
    return (
      /\[\s*\d+\s*\]/.test(line) ||
      /for\s*\([^)]*\d+/.test(line) ||
      /\.slice\(|\.substring\(|\.substr\(/.test(line)
    );
  }

  /**
   * Check if value is part of a version number
   */
  private isVersionNumber(line: string, index: number): boolean {
    // Check for patterns like "1.2.3" or "version: 1"
    const surrounding = line.slice(Math.max(0, index - 10), index + 10);
    return /version|v\d|\d+\.\d+\.\d+/.test(surrounding);
  }

  /**
   * Check if line is an enum value
   */
  private isEnumValue(line: string): boolean {
    return /^\s*[A-Z_][A-Z0-9_]*\s*=\s*\d+/.test(line);
  }

  /**
   * Check if a magic value is significant enough to report alone
   */
  private isSignificantValue(mv: MagicValue): boolean {
    // URLs and paths are always significant
    if (mv.type === 'url' || mv.type === 'path') {
      return true;
    }

    // Large numbers are significant
    if (mv.type === 'number' && typeof mv.value === 'number') {
      return Math.abs(mv.value) > 1000 || (mv.value % 1 !== 0 && mv.value !== 0.5);
    }

    // Long strings are significant
    if (mv.type === 'string' && typeof mv.value === 'string') {
      return mv.value.length > 20;
    }

    return false;
  }

  /**
   * Suggest a constant name for a value
   */
  private suggestName(value: string | number, type: string, context: string): string {
    const contextWords = context
      .replace(/[^a-zA-Z0-9]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2)
      .slice(0, 3);

    switch (type) {
      case 'number':
        return contextWords.length > 0
          ? contextWords.map(w => w.toUpperCase()).join('_')
          : 'MAGIC_NUMBER';
      case 'string':
        return contextWords.length > 0
          ? contextWords.map(w => w.toUpperCase()).join('_') + '_TEXT'
          : 'MAGIC_STRING';
      case 'path':
        return 'FILE_PATH';
      case 'url':
        return 'API_URL';
      case 'color':
        return 'COLOR_VALUE';
      default:
        return 'CONSTANT_VALUE';
    }
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
      '**/*.test.ts',
      '**/*.spec.ts',
      '**/*.d.ts',
      '**/constants.ts',
      '**/config.ts'
    ];

    if (options?.exclude) {
      excludes.push(...options.exclude);
    }

    return `{${excludes.join(',')}}`;
  }

  /**
   * Create finding from magic value
   */
  private createFinding(mv: MagicValue, occurrences: number): QualityFinding {
    const severity: QualitySeverity =
      occurrences >= 5 ? 'warning' :
      occurrences >= 3 ? 'info' :
      mv.type === 'url' || mv.type === 'path' ? 'warning' : 'info';

    const typeMap: Record<string, 'magic-number' | 'magic-string' | 'hardcoded-path' | 'hardcoded-url' | 'hardcoded-color'> = {
      number: 'magic-number',
      string: 'magic-string',
      path: 'hardcoded-path',
      url: 'hardcoded-url',
      color: 'hardcoded-color'
    };

    const id = `magic-${crypto.createHash('md5').update(
      `${mv.file}:${mv.line}:${mv.value}`
    ).digest('hex').slice(0, 8)}`;

    return {
      id,
      category: 'magic-value',
      type: typeMap[mv.type] || 'magic-string',
      severity,
      message: `Magic ${mv.type} detected: ${String(mv.value).slice(0, 50)}${String(mv.value).length > 50 ? '...' : ''}`,
      description: occurrences > 1
        ? `This value appears ${occurrences} times in the codebase`
        : `Consider extracting this value into a named constant`,
      file: mv.file,
      line: mv.line,
      column: mv.column,
      codeSnippet: mv.context,
      suggestion: mv.suggestedName
        ? `Extract to constant: ${mv.suggestedName}`
        : 'Extract to a named constant',
      autoFixable: true,
      metrics: {
        lineCount: 1
      }
    };
  }
}
