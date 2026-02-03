/**
 * Duplication Scanner
 *
 * Detects duplicate and similar code blocks across the codebase.
 * Uses token-based comparison and hashing for efficient detection.
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import {
  QualityFinding,
  QualitySeverity,
  DuplicateMatch,
  QualityScanOptions
} from './types';

/**
 * Configuration for duplication detection
 */
interface DuplicationConfig {
  /** Minimum lines for a block to be considered */
  minLines: number;
  /** Minimum tokens for a block to be considered */
  minTokens: number;
  /** Similarity threshold (0-1) for fuzzy matching */
  similarityThreshold: number;
  /** File extensions to scan */
  extensions: string[];
}

const DEFAULT_CONFIG: DuplicationConfig = {
  minLines: 6,
  minTokens: 50,
  similarityThreshold: 0.85,
  extensions: ['.ts', '.js', '.cs', '.tsx', '.jsx']
};

/**
 * Represents a code block for comparison
 */
interface CodeBlock {
  file: string;
  startLine: number;
  endLine: number;
  content: string;
  tokens: string[];
  hash: string;
}

let _instance: DuplicationScanner | undefined;

export function getDuplicationScanner(): DuplicationScanner {
  if (!_instance) {
    _instance = new DuplicationScanner();
  }
  return _instance;
}

export class DuplicationScanner {
  private config: DuplicationConfig;

  constructor(config: Partial<DuplicationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Scan workspace for duplicate code
   */
  async scanWorkspace(options?: QualityScanOptions): Promise<QualityFinding[]> {
    const findings: QualityFinding[] = [];
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders) {
      return findings;
    }

    // Build file pattern
    const extensions = this.config.extensions.map(ext => `**/*${ext}`).join(',');
    const pattern = `{${extensions}}`;

    // Find all matching files
    const excludePattern = this.buildExcludePattern(options);
    const files = await vscode.workspace.findFiles(pattern, excludePattern, 1000);

    // Extract code blocks from all files
    const allBlocks: CodeBlock[] = [];

    for (const file of files) {
      try {
        const doc = await vscode.workspace.openTextDocument(file);
        const blocks = this.extractBlocks(file.fsPath, doc.getText());
        allBlocks.push(...blocks);
      } catch {
        // Skip files that can't be read
      }
    }

    // Find duplicates
    const duplicates = this.findDuplicates(allBlocks);

    // Convert to findings
    for (const dup of duplicates) {
      findings.push(this.createFinding(dup));
    }

    return findings;
  }

  /**
   * Scan specific files for duplicates
   */
  async scanFiles(filePaths: string[]): Promise<QualityFinding[]> {
    const findings: QualityFinding[] = [];
    const allBlocks: CodeBlock[] = [];

    for (const filePath of filePaths) {
      try {
        const uri = vscode.Uri.file(filePath);
        const doc = await vscode.workspace.openTextDocument(uri);
        const blocks = this.extractBlocks(filePath, doc.getText());
        allBlocks.push(...blocks);
      } catch {
        // Skip files that can't be read
      }
    }

    const duplicates = this.findDuplicates(allBlocks);

    for (const dup of duplicates) {
      findings.push(this.createFinding(dup));
    }

    return findings;
  }

  /**
   * Check if two code snippets are duplicates
   */
  areDuplicates(code1: string, code2: string): { isDuplicate: boolean; similarity: number } {
    const tokens1 = this.tokenize(code1);
    const tokens2 = this.tokenize(code2);
    const similarity = this.calculateSimilarity(tokens1, tokens2);

    return {
      isDuplicate: similarity >= this.config.similarityThreshold,
      similarity
    };
  }

  /**
   * Extract code blocks from file content
   */
  private extractBlocks(file: string, content: string): CodeBlock[] {
    const blocks: CodeBlock[] = [];
    const lines = content.split('\n');

    // Use sliding window to extract overlapping blocks
    for (let i = 0; i <= lines.length - this.config.minLines; i++) {
      const blockLines = lines.slice(i, i + this.config.minLines);
      const blockContent = blockLines.join('\n');

      // Skip empty or whitespace-only blocks
      if (blockContent.trim().length < 20) {
        continue;
      }

      // Skip comment-only blocks
      if (this.isCommentOnly(blockContent)) {
        continue;
      }

      const tokens = this.tokenize(blockContent);

      // Skip blocks with too few tokens
      if (tokens.length < this.config.minTokens) {
        continue;
      }

      const hash = this.hashTokens(tokens);

      blocks.push({
        file,
        startLine: i + 1,
        endLine: i + this.config.minLines,
        content: blockContent,
        tokens,
        hash
      });
    }

    return blocks;
  }

  /**
   * Tokenize code for comparison
   */
  private tokenize(code: string): string[] {
    // Remove comments
    let cleaned = code
      .replace(/\/\/.*$/gm, '') // Single-line comments
      .replace(/\/\*[\s\S]*?\*\//g, '') // Multi-line comments
      .replace(/#.*$/gm, ''); // Hash comments

    // Normalize whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    // Extract tokens (identifiers, operators, literals)
    const tokenPattern = /[a-zA-Z_$][a-zA-Z0-9_$]*|[0-9]+(?:\.[0-9]+)?|[+\-*/%=<>!&|^~?:;,.()[\]{}]|"[^"]*"|'[^']*'/g;
    const tokens = cleaned.match(tokenPattern) || [];

    // Normalize variable names to reduce false negatives
    // Replace specific identifiers with generic placeholders
    return tokens.map(token => {
      // Keep keywords and operators as-is
      if (this.isKeyword(token) || this.isOperator(token)) {
        return token;
      }
      // Normalize string literals
      if (token.startsWith('"') || token.startsWith("'")) {
        return 'STRING';
      }
      // Normalize numbers
      if (/^[0-9]/.test(token)) {
        return 'NUMBER';
      }
      // Keep identifiers as-is for exact matching
      return token;
    });
  }

  /**
   * Hash tokens for quick comparison
   */
  private hashTokens(tokens: string[]): string {
    const content = tokens.join('|');
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * Find duplicate blocks
   */
  private findDuplicates(blocks: CodeBlock[]): DuplicateMatch[] {
    const duplicates: DuplicateMatch[] = [];
    const seen = new Map<string, CodeBlock[]>();

    // Group by hash for exact duplicates
    for (const block of blocks) {
      const existing = seen.get(block.hash) || [];
      existing.push(block);
      seen.set(block.hash, existing);
    }

    // Report exact duplicates
    for (const [hash, group] of seen) {
      if (group.length > 1) {
        // Create pairs
        for (let i = 0; i < group.length; i++) {
          for (let j = i + 1; j < group.length; j++) {
            // Skip if same file and overlapping lines
            if (group[i].file === group[j].file) {
              const overlap =
                (group[i].startLine <= group[j].endLine && group[i].endLine >= group[j].startLine);
              if (overlap) continue;
            }

            duplicates.push({
              file1: group[i].file,
              line1: group[i].startLine,
              file2: group[j].file,
              line2: group[j].startLine,
              lineCount: this.config.minLines,
              similarity: 1.0,
              codeHash: hash,
              snippet: group[i].content.slice(0, 200)
            });
          }
        }
      }
    }

    // TODO: Add fuzzy matching for similar (not exact) duplicates
    // This would compare blocks with different hashes using similarity calculation

    return duplicates;
  }

  /**
   * Calculate similarity between two token arrays (Jaccard similarity)
   */
  private calculateSimilarity(tokens1: string[], tokens2: string[]): number {
    const set1 = new Set(tokens1);
    const set2 = new Set(tokens2);

    let intersection = 0;
    for (const token of set1) {
      if (set2.has(token)) {
        intersection++;
      }
    }

    const union = set1.size + set2.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  /**
   * Check if content is comment-only
   */
  private isCommentOnly(content: string): boolean {
    const withoutComments = content
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/#.*$/gm, '')
      .trim();
    return withoutComments.length === 0;
  }

  /**
   * Check if token is a keyword
   */
  private isKeyword(token: string): boolean {
    const keywords = new Set([
      // TypeScript/JavaScript
      'abstract', 'any', 'as', 'async', 'await', 'boolean', 'break', 'case',
      'catch', 'class', 'const', 'constructor', 'continue', 'debugger', 'declare',
      'default', 'delete', 'do', 'else', 'enum', 'export', 'extends', 'false',
      'finally', 'for', 'from', 'function', 'get', 'if', 'implements', 'import',
      'in', 'instanceof', 'interface', 'let', 'module', 'namespace', 'new', 'null',
      'number', 'object', 'of', 'package', 'private', 'protected', 'public',
      'readonly', 'require', 'return', 'set', 'static', 'string', 'super',
      'switch', 'symbol', 'this', 'throw', 'true', 'try', 'type', 'typeof',
      'undefined', 'var', 'void', 'while', 'with', 'yield',
      // C#
      'using', 'partial', 'virtual', 'override', 'sealed', 'internal', 'struct',
      'ref', 'out', 'params', 'event', 'delegate', 'lock', 'checked', 'unchecked',
      'fixed', 'unsafe', 'stackalloc', 'sizeof', 'base', 'is', 'where', 'select',
      'orderby', 'group', 'join', 'into', 'ascending', 'descending', 'equals',
      'add', 'remove', 'value', 'global', 'dynamic', 'nameof', 'when'
    ]);
    return keywords.has(token);
  }

  /**
   * Check if token is an operator
   */
  private isOperator(token: string): boolean {
    return /^[+\-*/%=<>!&|^~?:;,.()[\]{}]$/.test(token);
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
      '**/*.bundle.js'
    ];

    if (options?.exclude) {
      excludes.push(...options.exclude);
    }

    return `{${excludes.join(',')}}`;
  }

  /**
   * Create finding from duplicate match
   */
  private createFinding(dup: DuplicateMatch): QualityFinding {
    const severity: QualitySeverity =
      dup.similarity === 1.0 ? 'warning' :
      dup.similarity >= 0.95 ? 'warning' : 'info';

    const id = `dup-${crypto.createHash('md5').update(
      `${dup.file1}:${dup.line1}:${dup.file2}:${dup.line2}`
    ).digest('hex').slice(0, 8)}`;

    return {
      id,
      category: 'duplication',
      type: dup.similarity === 1.0 ? 'duplicate-function' : 'similar-code-block',
      severity,
      message: dup.similarity === 1.0
        ? `Exact duplicate code found`
        : `Similar code block found (${Math.round(dup.similarity * 100)}% similar)`,
      description: `Duplicate code in ${this.getRelativePath(dup.file2)} at line ${dup.line2}`,
      file: dup.file1,
      line: dup.line1,
      endLine: dup.line1 + dup.lineCount - 1,
      codeSnippet: dup.snippet,
      suggestion: 'Consider extracting this code into a shared function or module',
      autoFixable: false,
      relatedFindings: [],
      metrics: {
        similarity: dup.similarity,
        lineCount: dup.lineCount
      }
    };
  }

  /**
   * Get relative path from workspace
   */
  private getRelativePath(absolutePath: string): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
      for (const folder of workspaceFolders) {
        if (absolutePath.startsWith(folder.uri.fsPath)) {
          return absolutePath.slice(folder.uri.fsPath.length + 1);
        }
      }
    }
    return absolutePath;
  }
}
