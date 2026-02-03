/**
 * Reuse Before Create Checker
 *
 * Implements the AI behavior rule: Before creating ANY new function/class,
 * search existing codebase for similar functionality.
 */

import * as vscode from 'vscode';
import { ReuseCandidate, ReuseCheckResult } from './types';

/**
 * Patterns to search for similar code
 */
interface SearchPattern {
  type: 'function' | 'class' | 'interface' | 'constant';
  pattern: RegExp;
  extractName: (match: RegExpMatchArray) => string;
}

const SEARCH_PATTERNS: SearchPattern[] = [
  {
    type: 'function',
    pattern: /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g,
    extractName: (match) => match[1]
  },
  {
    type: 'function',
    pattern: /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/g,
    extractName: (match) => match[1]
  },
  {
    type: 'class',
    pattern: /(?:export\s+)?class\s+(\w+)/g,
    extractName: (match) => match[1]
  },
  {
    type: 'interface',
    pattern: /(?:export\s+)?interface\s+(\w+)/g,
    extractName: (match) => match[1]
  },
  {
    type: 'constant',
    pattern: /(?:export\s+)?const\s+([A-Z][A-Z0-9_]+)\s*=/g,
    extractName: (match) => match[1]
  }
];

/**
 * Keywords that indicate similar functionality
 */
const FUNCTIONALITY_KEYWORDS: Record<string, string[]> = {
  fetch: ['get', 'load', 'retrieve', 'request', 'api', 'http'],
  create: ['make', 'build', 'generate', 'new', 'construct', 'initialize'],
  update: ['modify', 'change', 'edit', 'set', 'patch'],
  delete: ['remove', 'destroy', 'clear', 'reset'],
  validate: ['check', 'verify', 'test', 'assert', 'ensure'],
  format: ['transform', 'convert', 'parse', 'serialize', 'stringify'],
  filter: ['search', 'find', 'query', 'select', 'match'],
  sort: ['order', 'arrange', 'rank'],
  handle: ['process', 'manage', 'control', 'execute'],
  render: ['display', 'show', 'draw', 'paint', 'present'],
  save: ['store', 'persist', 'write', 'cache'],
  auth: ['login', 'authenticate', 'authorize', 'session', 'token']
};

/**
 * Reuse Checker class
 */
export class ReuseChecker {
  /**
   * Check for reuse candidates before creating new code
   */
  async checkForReuse(
    intentDescription: string,
    options: {
      workspaceFolder?: vscode.Uri;
      includeGlob?: string;
      excludeGlob?: string;
    } = {}
  ): Promise<ReuseCheckResult> {
    const candidates: ReuseCandidate[] = [];

    // Extract keywords from intent
    const keywords = this._extractKeywords(intentDescription);

    // Build search query
    const searchQueries = this._buildSearchQueries(keywords);

    // Search workspace
    const workspaceFolder = options.workspaceFolder || vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!workspaceFolder) {
      return {
        query: intentDescription,
        candidates: [],
        recommendation: 'create',
        reasoning: 'No workspace folder found to search for existing code.'
      };
    }

    // Search for each query
    for (const query of searchQueries) {
      try {
        const results = await this._searchWorkspace(
          query,
          workspaceFolder,
          options.includeGlob || '**/*.{ts,js,cs}',
          options.excludeGlob || '**/node_modules/**'
        );

        for (const result of results) {
          // Calculate similarity
          const similarity = this._calculateSimilarity(intentDescription, result.context);

          candidates.push({
            file: result.file,
            symbol: result.symbol,
            type: result.type,
            description: result.context,
            similarity,
            canExtend: this._canExtend(result.context, intentDescription),
            canParameterize: this._canParameterize(result.context, intentDescription)
          });
        }
      } catch (error) {
        console.warn(`Search failed for query "${query}":`, error);
      }
    }

    // Deduplicate and sort
    const uniqueCandidates = this._deduplicateCandidates(candidates);
    const sortedCandidates = uniqueCandidates.sort((a, b) => b.similarity - a.similarity);

    // Determine recommendation
    return this._makeRecommendation(intentDescription, sortedCandidates);
  }

  /**
   * Quick check for specific symbol name
   */
  async checkSymbolExists(symbolName: string): Promise<ReuseCandidate | null> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!workspaceFolder) return null;

    try {
      const results = await this._searchWorkspace(
        symbolName,
        workspaceFolder,
        '**/*.{ts,js,cs}',
        '**/node_modules/**'
      );

      if (results.length > 0) {
        return {
          file: results[0].file,
          symbol: results[0].symbol,
          type: results[0].type,
          description: results[0].context,
          similarity: 1.0,
          canExtend: true,
          canParameterize: false
        };
      }
    } catch {
      // Search failed
    }

    return null;
  }

  /**
   * Extract keywords from intent description
   */
  private _extractKeywords(intent: string): string[] {
    const words = intent.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2);

    const keywords = new Set<string>();

    for (const word of words) {
      keywords.add(word);

      // Add related keywords
      for (const [key, synonyms] of Object.entries(FUNCTIONALITY_KEYWORDS)) {
        if (word === key || synonyms.includes(word)) {
          keywords.add(key);
          synonyms.forEach(s => keywords.add(s));
        }
      }
    }

    return Array.from(keywords);
  }

  /**
   * Build search queries from keywords
   */
  private _buildSearchQueries(keywords: string[]): string[] {
    const queries: string[] = [];

    // Direct keywords
    for (const keyword of keywords.slice(0, 5)) {
      queries.push(keyword);
    }

    // Camelcase combinations
    if (keywords.length >= 2) {
      const camelCase = keywords[0] + keywords.slice(1).map(
        w => w.charAt(0).toUpperCase() + w.slice(1)
      ).join('');
      queries.push(camelCase);
    }

    return queries;
  }

  /**
   * Search workspace for pattern
   */
  private async _searchWorkspace(
    query: string,
    workspaceFolder: vscode.Uri,
    includeGlob: string,
    excludeGlob: string
  ): Promise<Array<{
    file: string;
    symbol: string;
    type: 'function' | 'class' | 'interface' | 'constant';
    context: string;
  }>> {
    const results: Array<{
      file: string;
      symbol: string;
      type: 'function' | 'class' | 'interface' | 'constant';
      context: string;
    }> = [];

    // Use VSCode's findFiles and search
    const files = await vscode.workspace.findFiles(
      new vscode.RelativePattern(workspaceFolder, includeGlob),
      new vscode.RelativePattern(workspaceFolder, excludeGlob),
      100
    );

    const queryLower = query.toLowerCase();

    for (const file of files) {
      try {
        const document = await vscode.workspace.openTextDocument(file);
        const text = document.getText();

        // Check each pattern
        for (const searchPattern of SEARCH_PATTERNS) {
          const regex = new RegExp(searchPattern.pattern.source, 'g');
          let match;

          while ((match = regex.exec(text)) !== null) {
            const symbolName = searchPattern.extractName(match);

            if (symbolName.toLowerCase().includes(queryLower)) {
              // Get context (surrounding lines)
              const startPos = document.positionAt(match.index);
              const endLine = Math.min(startPos.line + 10, document.lineCount - 1);
              const context = document.getText(
                new vscode.Range(startPos.line, 0, endLine, 0)
              ).substring(0, 500);

              results.push({
                file: vscode.workspace.asRelativePath(file),
                symbol: symbolName,
                type: searchPattern.type,
                context
              });
            }
          }
        }
      } catch {
        // Skip files that can't be read
      }
    }

    return results;
  }

  /**
   * Calculate similarity between intent and found code
   */
  private _calculateSimilarity(intent: string, codeContext: string): number {
    const intentWords = new Set(intent.toLowerCase().split(/\W+/).filter(w => w.length > 2));
    const codeWords = new Set(codeContext.toLowerCase().split(/\W+/).filter(w => w.length > 2));

    let matches = 0;
    for (const word of intentWords) {
      if (codeWords.has(word)) {
        matches++;
      }
    }

    // Jaccard similarity
    const union = new Set([...intentWords, ...codeWords]);
    return union.size > 0 ? matches / union.size : 0;
  }

  /**
   * Determine if existing code can be extended
   */
  private _canExtend(codeContext: string, intent: string): boolean {
    // Check if it's a class that could have methods added
    if (codeContext.includes('class ')) return true;

    // Check if it's a module/object that could have properties added
    if (codeContext.includes('export {')) return true;

    return false;
  }

  /**
   * Determine if existing code can be parameterized
   */
  private _canParameterize(codeContext: string, intent: string): boolean {
    // Check if it's a function with hardcoded values
    if (codeContext.includes('function') || codeContext.includes('=>')) {
      // Simple heuristic: does it have string/number literals that could be params?
      const hasLiterals = /['"][^'"]+['"]|\d+/.test(codeContext);
      return hasLiterals;
    }

    return false;
  }

  /**
   * Deduplicate candidates by symbol name
   */
  private _deduplicateCandidates(candidates: ReuseCandidate[]): ReuseCandidate[] {
    const seen = new Map<string, ReuseCandidate>();

    for (const candidate of candidates) {
      const key = `${candidate.file}:${candidate.symbol}`;
      const existing = seen.get(key);

      if (!existing || candidate.similarity > existing.similarity) {
        seen.set(key, candidate);
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Make recommendation based on candidates
   */
  private _makeRecommendation(
    intent: string,
    candidates: ReuseCandidate[]
  ): ReuseCheckResult {
    if (candidates.length === 0) {
      return {
        query: intent,
        candidates: [],
        recommendation: 'create',
        reasoning: 'No similar existing code found. Creating new implementation is appropriate.'
      };
    }

    const best = candidates[0];

    // High similarity + can extend = definitely extend
    if (best.similarity >= 0.7 && best.canExtend) {
      return {
        query: intent,
        candidates,
        recommendation: 'extend',
        reasoning: `Found highly similar code in ${best.file}. Strongly recommend extending ${best.symbol} rather than creating new code.`
      };
    }

    // High similarity = reuse
    if (best.similarity >= 0.5) {
      return {
        query: intent,
        candidates,
        recommendation: 'reuse',
        reasoning: `Found similar code in ${best.file}. Consider reusing or adapting ${best.symbol}. Review before creating new.`
      };
    }

    // Medium similarity = review first
    if (best.similarity >= 0.3) {
      return {
        query: intent,
        candidates,
        recommendation: 'create',
        reasoning: `Found potentially related code in ${best.file}:${best.symbol}. Review it first, but creating new may be appropriate if use case differs.`
      };
    }

    // Low similarity = create
    return {
      query: intent,
      candidates,
      recommendation: 'create',
      reasoning: 'Similar code exists but is not a close match. Creating new implementation is appropriate.'
    };
  }
}

/**
 * Singleton instance
 */
let _reuseChecker: ReuseChecker | null = null;

export function getReuseChecker(): ReuseChecker {
  if (!_reuseChecker) {
    _reuseChecker = new ReuseChecker();
  }
  return _reuseChecker;
}
