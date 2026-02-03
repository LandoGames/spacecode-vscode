/**
 * Maintenance Scanner
 *
 * Scans codebase for refactoring opportunities, cleanup tasks,
 * modernization suggestions, and dependency health.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  MaintenanceSuggestion,
  MaintenanceScanResult,
  MaintenanceScanOptions,
  MaintenanceCategory,
  MaintenancePriority,
  DependencyInfo
} from './types';

let _instance: MaintenanceScanner | undefined;

export function getMaintenanceScanner(): MaintenanceScanner {
  if (!_instance) {
    _instance = new MaintenanceScanner();
  }
  return _instance;
}

export class MaintenanceScanner {
  /**
   * Run full maintenance scan
   */
  async scan(options?: MaintenanceScanOptions): Promise<MaintenanceScanResult> {
    const startTime = Date.now();
    const suggestions: MaintenanceSuggestion[] = [];
    const dependencies: DependencyInfo[] = [];

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return this.createEmptyResult(startTime);
    }

    const root = workspaceFolders[0].uri.fsPath;

    // Find source files
    const files = await vscode.workspace.findFiles(
      '**/*.{ts,tsx,js,jsx}',
      '{**/node_modules/**,**/dist/**,**/build/**,**/.git/**}',
      500
    );

    // Scan each file for maintenance opportunities
    for (const file of files) {
      try {
        const doc = await vscode.workspace.openTextDocument(file);
        const content = doc.getText();
        const filePath = file.fsPath;

        // Check for cleanup opportunities
        suggestions.push(...this.findCleanupOpportunities(filePath, content));

        // Check for modernization opportunities
        suggestions.push(...this.findModernizationOpportunities(filePath, content));

        // Check for refactoring opportunities
        suggestions.push(...this.findRefactoringOpportunities(filePath, content));

        // Check for performance opportunities
        suggestions.push(...this.findPerformanceOpportunities(filePath, content));
      } catch {
        // Skip files that can't be read
      }
    }

    // Check dependencies if requested
    if (options?.checkDependencies !== false) {
      dependencies.push(...await this.analyzeDependencies(root));
      suggestions.push(...this.createDependencySuggestions(dependencies));
    }

    // Filter by options
    let filteredSuggestions = suggestions;
    if (options?.categories) {
      filteredSuggestions = filteredSuggestions.filter(s =>
        options.categories!.includes(s.category)
      );
    }
    if (options?.minPriority) {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      const minLevel = priorityOrder[options.minPriority];
      filteredSuggestions = filteredSuggestions.filter(s =>
        priorityOrder[s.priority] <= minLevel
      );
    }

    return this.createResult(filteredSuggestions, dependencies, startTime);
  }

  /**
   * Find cleanup opportunities
   */
  private findCleanupOpportunities(file: string, content: string): MaintenanceSuggestion[] {
    const suggestions: MaintenanceSuggestion[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Console.log statements
      if (/console\.(log|debug|info|warn|error)\s*\(/.test(line) && !file.includes('.test.') && !file.includes('.spec.')) {
        suggestions.push({
          id: this.createId(file, lineNum, 'console'),
          category: 'cleanup',
          type: 'remove-console-log',
          priority: 'low',
          title: 'Remove console statement',
          description: `Console statement found at line ${lineNum}`,
          file,
          line: lineNum,
          effort: 'trivial',
          impact: 'low',
          autoFixable: true,
          fix: {
            description: 'Remove the console statement',
            changes: [{ file, action: 'modify', details: 'Delete the console line' }]
          }
        });
      }

      // Commented-out code (more than just comments)
      if (this.isCommentedCode(line)) {
        suggestions.push({
          id: this.createId(file, lineNum, 'commented'),
          category: 'cleanup',
          type: 'remove-commented-code',
          priority: 'low',
          title: 'Remove commented-out code',
          description: `Commented code found at line ${lineNum}`,
          file,
          line: lineNum,
          effort: 'trivial',
          impact: 'low',
          autoFixable: true
        });
      }

      // TODO/FIXME comments that have been there
      if (/\/\/\s*(TODO|FIXME|HACK|XXX):/i.test(line)) {
        suggestions.push({
          id: this.createId(file, lineNum, 'todo'),
          category: 'cleanup',
          type: 'remove-commented-code',
          priority: 'medium',
          title: 'Address TODO/FIXME comment',
          description: line.trim().slice(0, 80),
          file,
          line: lineNum,
          effort: 'small',
          impact: 'medium',
          autoFixable: false
        });
      }
    }

    // Unused imports (simple detection)
    const unusedImports = this.findUnusedImports(content);
    for (const imp of unusedImports) {
      suggestions.push({
        id: this.createId(file, imp.line, 'import'),
        category: 'cleanup',
        type: 'remove-unused-import',
        priority: 'low',
        title: `Remove unused import: ${imp.name}`,
        description: `Import '${imp.name}' appears to be unused`,
        file,
        line: imp.line,
        effort: 'trivial',
        impact: 'low',
        autoFixable: true
      });
    }

    return suggestions;
  }

  /**
   * Find modernization opportunities
   */
  private findModernizationOpportunities(file: string, content: string): MaintenanceSuggestion[] {
    const suggestions: MaintenanceSuggestion[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // var usage
      if (/\bvar\s+\w+\s*=/.test(line)) {
        suggestions.push({
          id: this.createId(file, lineNum, 'var'),
          category: 'modernize',
          type: 'update-syntax',
          priority: 'low',
          title: 'Replace var with const/let',
          description: `Use const or let instead of var at line ${lineNum}`,
          file,
          line: lineNum,
          effort: 'trivial',
          impact: 'low',
          autoFixable: true
        });
      }

      // && for null checks that could use optional chaining
      if (/\w+\s*&&\s*\w+\.\w+/.test(line) && !line.includes('?.')) {
        suggestions.push({
          id: this.createId(file, lineNum, 'optional'),
          category: 'modernize',
          type: 'use-optional-chaining',
          priority: 'low',
          title: 'Use optional chaining',
          description: `Consider using ?. at line ${lineNum}`,
          file,
          line: lineNum,
          effort: 'trivial',
          impact: 'low',
          autoFixable: true
        });
      }

      // || for default values that could use nullish coalescing
      if (/\w+\s*\|\|\s*['"`\d]/.test(line) && !line.includes('??')) {
        suggestions.push({
          id: this.createId(file, lineNum, 'nullish'),
          category: 'modernize',
          type: 'use-nullish-coalescing',
          priority: 'low',
          title: 'Consider nullish coalescing',
          description: `Consider using ?? instead of || at line ${lineNum}`,
          file,
          line: lineNum,
          effort: 'trivial',
          impact: 'low',
          autoFixable: true
        });
      }

      // .then/.catch chains that could be async/await
      if (/\.then\s*\(/.test(line) && !content.slice(0, 500).includes('async')) {
        suggestions.push({
          id: this.createId(file, lineNum, 'async'),
          category: 'modernize',
          type: 'convert-to-async',
          priority: 'medium',
          title: 'Convert to async/await',
          description: `Consider using async/await at line ${lineNum}`,
          file,
          line: lineNum,
          effort: 'small',
          impact: 'medium',
          autoFixable: false
        });
      }
    }

    return suggestions;
  }

  /**
   * Find refactoring opportunities
   */
  private findRefactoringOpportunities(file: string, content: string): MaintenanceSuggestion[] {
    const suggestions: MaintenanceSuggestion[] = [];
    const lines = content.split('\n');

    // Large file detection
    if (lines.length > 500) {
      suggestions.push({
        id: this.createId(file, 1, 'large-file'),
        category: 'refactor',
        type: 'split-file',
        priority: lines.length > 1000 ? 'high' : 'medium',
        title: 'Consider splitting large file',
        description: `File has ${lines.length} lines - consider breaking into smaller modules`,
        file,
        effort: 'large',
        impact: 'high',
        autoFixable: false
      });
    }

    // Long function detection (simplified)
    const funcPattern = /(?:function\s+(\w+)|(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>|(\w+)\s*\([^)]*\)\s*[:{])/g;
    let match;
    let funcStart = -1;
    let funcName = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if ((match = line.match(funcPattern))) {
        if (funcStart !== -1 && i - funcStart > 50) {
          suggestions.push({
            id: this.createId(file, funcStart + 1, 'long-func'),
            category: 'refactor',
            type: 'extract-function',
            priority: i - funcStart > 100 ? 'high' : 'medium',
            title: `Refactor long function: ${funcName || 'anonymous'}`,
            description: `Function is ${i - funcStart} lines - consider extracting smaller functions`,
            file,
            line: funcStart + 1,
            effort: 'medium',
            impact: 'medium',
            autoFixable: false
          });
        }
        funcStart = i;
        funcName = match[1] || match[2] || match[3] || '';
      }
    }

    return suggestions;
  }

  /**
   * Find performance opportunities
   */
  private findPerformanceOpportunities(file: string, content: string): MaintenanceSuggestion[] {
    const suggestions: MaintenanceSuggestion[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Large inline arrays/objects
      if (line.length > 200 && (line.includes('[') || line.includes('{'))) {
        suggestions.push({
          id: this.createId(file, lineNum, 'inline-data'),
          category: 'performance',
          type: 'lazy-load-module',
          priority: 'low',
          title: 'Extract large inline data',
          description: `Large inline data structure at line ${lineNum}`,
          file,
          line: lineNum,
          effort: 'small',
          impact: 'low',
          autoFixable: false
        });
      }

      // Import * (star imports)
      if (/import\s*\*\s*as/.test(line)) {
        suggestions.push({
          id: this.createId(file, lineNum, 'star-import'),
          category: 'performance',
          type: 'optimize-import',
          priority: 'low',
          title: 'Consider named imports',
          description: `Star import may include unused code at line ${lineNum}`,
          file,
          line: lineNum,
          effort: 'trivial',
          impact: 'low',
          autoFixable: false
        });
      }
    }

    return suggestions;
  }

  /**
   * Analyze dependencies
   */
  private async analyzeDependencies(root: string): Promise<DependencyInfo[]> {
    const dependencies: DependencyInfo[] = [];

    try {
      const packageJsonPath = path.join(root, 'package.json');
      const packageJsonUri = vscode.Uri.file(packageJsonPath);
      const doc = await vscode.workspace.openTextDocument(packageJsonUri);
      const pkg = JSON.parse(doc.getText());

      // Check regular dependencies
      for (const [name, version] of Object.entries(pkg.dependencies || {})) {
        dependencies.push({
          name,
          currentVersion: String(version),
          type: 'dependency',
          hasUpdate: false, // Would need npm API to check
          isDeprecated: false,
          usageCount: 0 // Would need to scan imports
        });
      }

      // Check dev dependencies
      for (const [name, version] of Object.entries(pkg.devDependencies || {})) {
        dependencies.push({
          name,
          currentVersion: String(version),
          type: 'devDependency',
          hasUpdate: false,
          isDeprecated: false,
          usageCount: 0
        });
      }
    } catch {
      // No package.json or can't read
    }

    return dependencies;
  }

  /**
   * Create suggestions from dependency analysis
   */
  private createDependencySuggestions(dependencies: DependencyInfo[]): MaintenanceSuggestion[] {
    const suggestions: MaintenanceSuggestion[] = [];

    for (const dep of dependencies) {
      if (dep.isDeprecated) {
        suggestions.push({
          id: this.createId('package.json', 0, `dep-${dep.name}`),
          category: 'dependency',
          type: 'update-dependency',
          priority: 'high',
          title: `Replace deprecated: ${dep.name}`,
          description: `${dep.name} is deprecated - find alternative`,
          effort: 'medium',
          impact: 'high',
          autoFixable: false
        });
      }

      if (dep.hasUpdate) {
        suggestions.push({
          id: this.createId('package.json', 0, `update-${dep.name}`),
          category: 'dependency',
          type: 'update-dependency',
          priority: 'low',
          title: `Update available: ${dep.name}`,
          description: `${dep.currentVersion} → ${dep.latestVersion}`,
          effort: 'small',
          impact: 'low',
          autoFixable: true
        });
      }
    }

    return suggestions;
  }

  /**
   * Find unused imports (simple heuristic)
   */
  private findUnusedImports(content: string): Array<{ name: string; line: number }> {
    const unused: Array<{ name: string; line: number }> = [];
    const lines = content.split('\n');

    // Extract named imports
    const importPattern = /import\s*\{([^}]+)\}\s*from/g;
    let match;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if ((match = line.match(importPattern))) {
        const imports = match[1].split(',').map(s => s.trim().split(/\s+as\s+/).pop()?.trim());

        for (const imp of imports) {
          if (imp) {
            // Check if import is used (simple word boundary search)
            const rest = content.slice(line.length);
            const regex = new RegExp(`\\b${imp}\\b`);
            if (!regex.test(rest)) {
              unused.push({ name: imp, line: i + 1 });
            }
          }
        }
      }
    }

    return unused;
  }

  /**
   * Check if line is commented-out code
   */
  private isCommentedCode(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed.startsWith('//')) return false;

    const comment = trimmed.slice(2).trim();
    if (comment.length < 5) return false;

    // Skip text comments
    if (/\b(the|is|are|TODO|FIXME|NOTE|HACK)\b/i.test(comment)) return false;

    // Check for code patterns
    return /^(const|let|var|function|class|if|for|while|return|import|export)\s/.test(comment) ||
           /[{};]\s*$/.test(comment) ||
           /\.\w+\(/.test(comment);
  }

  /**
   * Create unique ID for suggestion
   */
  private createId(file: string, line: number, type: string): string {
    return `maint-${crypto.createHash('md5').update(`${file}:${line}:${type}`).digest('hex').slice(0, 8)}`;
  }

  /**
   * Create scan result
   */
  private createResult(
    suggestions: MaintenanceSuggestion[],
    dependencies: DependencyInfo[],
    startTime: number
  ): MaintenanceScanResult {
    const byCategory: Record<MaintenanceCategory, number> = {
      refactor: 0,
      cleanup: 0,
      modernize: 0,
      performance: 0,
      dependency: 0,
      documentation: 0
    };

    const byPriority: Record<MaintenancePriority, number> = {
      high: 0,
      medium: 0,
      low: 0
    };

    let autoFixable = 0;

    for (const s of suggestions) {
      byCategory[s.category]++;
      byPriority[s.priority]++;
      if (s.autoFixable) autoFixable++;
    }

    // Calculate health score
    const highPenalty = byPriority.high * 10;
    const mediumPenalty = byPriority.medium * 3;
    const lowPenalty = byPriority.low * 1;
    const totalPenalty = highPenalty + mediumPenalty + lowPenalty;
    const score = Math.max(0, Math.min(100, 100 - totalPenalty));

    return {
      completedAt: Date.now(),
      duration: Date.now() - startTime,
      suggestions,
      dependencies,
      summary: {
        total: suggestions.length,
        byCategory,
        byPriority,
        autoFixable
      },
      health: {
        score,
        status: score >= 80 ? 'healthy' : score >= 50 ? 'needs-attention' : 'critical'
      }
    };
  }

  /**
   * Create empty result
   */
  private createEmptyResult(startTime: number): MaintenanceScanResult {
    return this.createResult([], [], startTime);
  }
}
