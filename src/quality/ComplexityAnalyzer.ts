/**
 * Complexity Analyzer
 *
 * Analyzes code complexity including cyclomatic complexity,
 * cognitive complexity, coupling metrics, and architecture issues.
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import {
  QualityFinding,
  QualitySeverity,
  ComplexityMetrics,
  CouplingAnalysis,
  QualityScanOptions
} from './types';

/**
 * Thresholds for complexity warnings
 */
const COMPLEXITY_THRESHOLDS = {
  cyclomaticComplexity: { warning: 10, error: 20 },
  cognitiveComplexity: { warning: 15, error: 30 },
  maxNestingDepth: { warning: 4, error: 6 },
  methodLength: { warning: 50, error: 100 },
  parameterCount: { warning: 4, error: 6 },
  classLength: { warning: 300, error: 500 },
  fileLength: { warning: 500, error: 1000 }
};

let _instance: ComplexityAnalyzer | undefined;

export function getComplexityAnalyzer(): ComplexityAnalyzer {
  if (!_instance) {
    _instance = new ComplexityAnalyzer();
  }
  return _instance;
}

export class ComplexityAnalyzer {
  private dependencies = new Map<string, Set<string>>();

  /**
   * Scan workspace for complexity issues
   */
  async scanWorkspace(options?: QualityScanOptions): Promise<QualityFinding[]> {
    const findings: QualityFinding[] = [];
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders) {
      return findings;
    }

    // Clear dependency tracking
    this.dependencies.clear();

    // Build file pattern
    const pattern = '**/*.{ts,js,tsx,jsx,cs}';
    const excludePattern = this.buildExcludePattern(options);
    const files = await vscode.workspace.findFiles(pattern, excludePattern, 1000);

    // Analyze each file
    for (const file of files) {
      try {
        const doc = await vscode.workspace.openTextDocument(file);
        const content = doc.getText();

        // Collect dependencies for coupling analysis
        this.collectDependencies(file.fsPath, content);

        // Analyze complexity
        const metrics = this.analyzeFile(file.fsPath, content);
        findings.push(...this.metricsToFindings(metrics));

        // Check for god classes and long methods
        findings.push(...this.detectStructuralIssues(file.fsPath, content));

        // Detect Unity-specific issues
        if (file.fsPath.endsWith('.cs')) {
          findings.push(...this.detectUnityIssues(file.fsPath, content));
        }
      } catch {
        // Skip files that can't be read
      }
    }

    // Analyze coupling
    const couplingFindings = this.analyzeCoupling();
    findings.push(...couplingFindings);

    return findings;
  }

  /**
   * Analyze a single file's complexity
   */
  async analyzeFileComplexity(filePath: string): Promise<ComplexityMetrics[]> {
    const metrics: ComplexityMetrics[] = [];

    try {
      const uri = vscode.Uri.file(filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      const content = doc.getText();

      metrics.push(...this.analyzeFile(filePath, content));
    } catch {
      // Skip files that can't be read
    }

    return metrics;
  }

  /**
   * Analyze file content for complexity
   */
  private analyzeFile(file: string, content: string): ComplexityMetrics[] {
    const metrics: ComplexityMetrics[] = [];
    const lines = content.split('\n');

    // File-level metrics
    metrics.push({
      file,
      type: 'file',
      lineCount: lines.length,
      cyclomaticComplexity: this.calculateCyclomaticComplexity(content),
      cognitiveComplexity: this.calculateCognitiveComplexity(content),
      maxNestingDepth: this.calculateMaxNesting(content),
      dependencyCount: this.countImports(content),
      maintainabilityIndex: this.calculateMaintainabilityIndex(content)
    });

    // Extract and analyze functions/methods
    const functions = this.extractFunctions(content);
    for (const func of functions) {
      metrics.push({
        file,
        symbol: func.name,
        type: 'function',
        lineCount: func.lineCount,
        cyclomaticComplexity: this.calculateCyclomaticComplexity(func.body),
        cognitiveComplexity: this.calculateCognitiveComplexity(func.body),
        maxNestingDepth: this.calculateMaxNesting(func.body),
        parameterCount: func.paramCount,
        dependencyCount: 0,
        maintainabilityIndex: this.calculateMaintainabilityIndex(func.body)
      });
    }

    // Extract and analyze classes
    const classes = this.extractClasses(content);
    for (const cls of classes) {
      metrics.push({
        file,
        symbol: cls.name,
        type: 'class',
        lineCount: cls.lineCount,
        cyclomaticComplexity: this.calculateCyclomaticComplexity(cls.body),
        cognitiveComplexity: this.calculateCognitiveComplexity(cls.body),
        maxNestingDepth: this.calculateMaxNesting(cls.body),
        dependencyCount: this.countClassDependencies(cls.body),
        maintainabilityIndex: this.calculateMaintainabilityIndex(cls.body)
      });
    }

    return metrics;
  }

  /**
   * Calculate cyclomatic complexity (McCabe)
   */
  private calculateCyclomaticComplexity(code: string): number {
    let complexity = 1; // Base complexity

    // Decision points
    const decisionPatterns = [
      /\bif\b/g,
      /\belse\s+if\b/g,
      /\bfor\b/g,
      /\bwhile\b/g,
      /\bcase\b/g,
      /\bcatch\b/g,
      /\b\?\s*[^:]/g, // Ternary operator
      /&&/g,
      /\|\|/g,
      /\?\?/g // Nullish coalescing
    ];

    for (const pattern of decisionPatterns) {
      const matches = code.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    }

    return complexity;
  }

  /**
   * Calculate cognitive complexity
   */
  private calculateCognitiveComplexity(code: string): number {
    let complexity = 0;
    let nestingLevel = 0;
    const lines = code.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip comments
      if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
        continue;
      }

      // Control flow that adds nesting
      if (/^(if|for|while|switch|try)\b/.test(trimmed)) {
        complexity += 1 + nestingLevel;
        if (trimmed.includes('{')) {
          nestingLevel++;
        }
      }
      // else/else if/catch/finally add complexity but continue nesting
      else if (/^(else|catch|finally)\b/.test(trimmed)) {
        complexity += 1;
      }
      // Lambda/arrow functions
      else if (/=>\s*{/.test(trimmed)) {
        complexity += nestingLevel;
        nestingLevel++;
      }
      // Track nesting
      else {
        const opens = (trimmed.match(/{/g) || []).length;
        const closes = (trimmed.match(/}/g) || []).length;
        nestingLevel = Math.max(0, nestingLevel + opens - closes);
      }

      // Recursion adds complexity
      if (/\bthis\.\w+\(/.test(trimmed)) {
        // Could be recursion - add small penalty
        complexity += 0.5;
      }
    }

    return Math.round(complexity);
  }

  /**
   * Calculate maximum nesting depth
   */
  private calculateMaxNesting(code: string): number {
    let maxDepth = 0;
    let currentDepth = 0;

    for (const char of code) {
      if (char === '{') {
        currentDepth++;
        maxDepth = Math.max(maxDepth, currentDepth);
      } else if (char === '}') {
        currentDepth = Math.max(0, currentDepth - 1);
      }
    }

    return maxDepth;
  }

  /**
   * Calculate maintainability index (0-100)
   */
  private calculateMaintainabilityIndex(code: string): number {
    const lines = code.split('\n').filter(l => l.trim().length > 0);
    const loc = lines.length;
    const cyclomatic = this.calculateCyclomaticComplexity(code);

    // Halstead volume approximation (simplified)
    const operators = (code.match(/[+\-*/%=<>!&|^~?:.,;()[\]{}]/g) || []).length;
    const operands = (code.match(/\b\w+\b/g) || []).length;
    const vocabulary = new Set([...(code.match(/[+\-*/%=<>!&|^~?:.,;()[\]{}]/g) || []), ...(code.match(/\b\w+\b/g) || [])]).size;
    const volume = (operators + operands) * Math.log2(Math.max(vocabulary, 1));

    // MI = 171 - 5.2 * ln(V) - 0.23 * G - 16.2 * ln(LOC)
    // Normalized to 0-100
    const mi = Math.max(0, Math.min(100,
      171 - 5.2 * Math.log(Math.max(volume, 1)) - 0.23 * cyclomatic - 16.2 * Math.log(Math.max(loc, 1))
    ));

    return Math.round((mi / 171) * 100);
  }

  /**
   * Count import statements
   */
  private countImports(code: string): number {
    const importPatterns = [
      /import\s+.*from/g,
      /require\s*\(/g,
      /using\s+\w+/g
    ];

    let count = 0;
    for (const pattern of importPatterns) {
      const matches = code.match(pattern);
      if (matches) {
        count += matches.length;
      }
    }

    return count;
  }

  /**
   * Count class dependencies (injected/imported types used)
   */
  private countClassDependencies(code: string): number {
    // Count type references in parameters and properties
    const typeRefs = code.match(/:\s*[A-Z]\w+/g) || [];
    const uniqueTypes = new Set(typeRefs.map(t => t.replace(/:\s*/, '')));
    return uniqueTypes.size;
  }

  /**
   * Extract function information
   */
  private extractFunctions(code: string): Array<{ name: string; body: string; lineCount: number; paramCount: number }> {
    const functions: Array<{ name: string; body: string; lineCount: number; paramCount: number }> = [];

    // Simple extraction - match function declarations and count braces
    const funcPattern = /(?:async\s+)?(?:function\s+(\w+)|(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>|(\w+)\s*\([^)]*\)\s*[:{])/g;

    let match;
    while ((match = funcPattern.exec(code)) !== null) {
      const name = match[1] || match[2] || match[3];
      if (!name || this.isKeyword(name)) continue;

      // Extract parameter count from the match context
      const paramMatch = code.slice(match.index, match.index + 200).match(/\(([^)]*)\)/);
      const params = paramMatch ? paramMatch[1].split(',').filter(p => p.trim()).length : 0;

      // Find function body (simplified)
      const startIdx = code.indexOf('{', match.index);
      if (startIdx === -1) continue;

      let braceCount = 1;
      let endIdx = startIdx + 1;
      while (braceCount > 0 && endIdx < code.length) {
        if (code[endIdx] === '{') braceCount++;
        else if (code[endIdx] === '}') braceCount--;
        endIdx++;
      }

      const body = code.slice(startIdx, endIdx);
      const lineCount = body.split('\n').length;

      functions.push({ name, body, lineCount, paramCount: params });
    }

    return functions;
  }

  /**
   * Extract class information
   */
  private extractClasses(code: string): Array<{ name: string; body: string; lineCount: number }> {
    const classes: Array<{ name: string; body: string; lineCount: number }> = [];

    const classPattern = /class\s+(\w+)/g;

    let match;
    while ((match = classPattern.exec(code)) !== null) {
      const name = match[1];

      // Find class body
      const startIdx = code.indexOf('{', match.index);
      if (startIdx === -1) continue;

      let braceCount = 1;
      let endIdx = startIdx + 1;
      while (braceCount > 0 && endIdx < code.length) {
        if (code[endIdx] === '{') braceCount++;
        else if (code[endIdx] === '}') braceCount--;
        endIdx++;
      }

      const body = code.slice(startIdx, endIdx);
      const lineCount = body.split('\n').length;

      classes.push({ name, body, lineCount });
    }

    return classes;
  }

  /**
   * Detect structural issues (god classes, long methods)
   */
  private detectStructuralIssues(file: string, content: string): QualityFinding[] {
    const findings: QualityFinding[] = [];
    const lines = content.split('\n');

    // Check file length
    if (lines.length > COMPLEXITY_THRESHOLDS.fileLength.error) {
      findings.push(this.createComplexityFinding(
        file, 1, 'long-method',
        `File has ${lines.length} lines (>${COMPLEXITY_THRESHOLDS.fileLength.error})`,
        'Consider splitting this file into smaller modules',
        'error'
      ));
    } else if (lines.length > COMPLEXITY_THRESHOLDS.fileLength.warning) {
      findings.push(this.createComplexityFinding(
        file, 1, 'long-method',
        `File has ${lines.length} lines (>${COMPLEXITY_THRESHOLDS.fileLength.warning})`,
        'Consider splitting this file into smaller modules',
        'warning'
      ));
    }

    // Check classes
    const classes = this.extractClasses(content);
    for (const cls of classes) {
      if (cls.lineCount > COMPLEXITY_THRESHOLDS.classLength.error) {
        const line = this.findLineNumber(content, `class ${cls.name}`);
        findings.push(this.createComplexityFinding(
          file, line, 'god-class',
          `Class '${cls.name}' has ${cls.lineCount} lines (>${COMPLEXITY_THRESHOLDS.classLength.error})`,
          'Consider breaking this class into smaller, focused classes',
          'error'
        ));
      }
    }

    // Check functions
    const functions = this.extractFunctions(content);
    for (const func of functions) {
      if (func.lineCount > COMPLEXITY_THRESHOLDS.methodLength.error) {
        const line = this.findLineNumber(content, func.name);
        findings.push(this.createComplexityFinding(
          file, line, 'long-method',
          `Function '${func.name}' has ${func.lineCount} lines (>${COMPLEXITY_THRESHOLDS.methodLength.error})`,
          'Consider extracting smaller helper functions',
          'error'
        ));
      }

      if (func.paramCount > COMPLEXITY_THRESHOLDS.parameterCount.error) {
        const line = this.findLineNumber(content, func.name);
        findings.push(this.createComplexityFinding(
          file, line, 'too-many-parameters',
          `Function '${func.name}' has ${func.paramCount} parameters (>${COMPLEXITY_THRESHOLDS.parameterCount.error})`,
          'Consider using an options object or builder pattern',
          'warning'
        ));
      }
    }

    return findings;
  }

  /**
   * Detect Unity-specific performance issues
   */
  private detectUnityIssues(file: string, content: string): QualityFinding[] {
    const findings: QualityFinding[] = [];
    const lines = content.split('\n');

    let inUpdateMethod = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Track if we're inside Update/FixedUpdate/LateUpdate
      if (/void\s+(Update|FixedUpdate|LateUpdate)\s*\(/.test(line)) {
        inUpdateMethod = true;
      }

      if (inUpdateMethod) {
        // Check for closing brace that might end the method
        if (/^\s*\}\s*$/.test(line) && !line.includes('{')) {
          // Simplified check - real implementation would track braces
          inUpdateMethod = false;
        }

        // Find in Update
        if (/\bFind\s*\(|FindObjectOfType|FindGameObjectWithTag/.test(line)) {
          findings.push(this.createUnityFinding(
            file, lineNum, 'find-in-update',
            'Find methods called in Update loop - cache references instead',
            'critical'
          ));
        }

        // GetComponent in Update
        if (/GetComponent\s*[<(]/.test(line)) {
          findings.push(this.createUnityFinding(
            file, lineNum, 'getcomponent-in-update',
            'GetComponent called in Update loop - cache in Start/Awake',
            'warning'
          ));
        }

        // Instantiate without pooling
        if (/Instantiate\s*\(/.test(line)) {
          findings.push(this.createUnityFinding(
            file, lineNum, 'instantiate-without-pool',
            'Instantiate in Update loop - consider object pooling',
            'warning'
          ));
        }
      }

      // String comparison with tag (anywhere)
      if (/\.tag\s*==\s*["']/.test(line)) {
        findings.push(this.createUnityFinding(
          file, lineNum, 'string-comparison-tag',
          'String comparison with tag - use CompareTag() instead',
          'info'
        ));
      }

      // Update calling Update (recursion)
      if (inUpdateMethod && /\bUpdate\s*\(/.test(line) && !line.includes('void')) {
        findings.push(this.createUnityFinding(
          file, lineNum, 'update-in-update',
          'Calling Update from Update - potential infinite recursion',
          'error'
        ));
      }
    }

    return findings;
  }

  /**
   * Collect file dependencies for coupling analysis
   */
  private collectDependencies(file: string, content: string): void {
    const deps = new Set<string>();

    // TypeScript/JavaScript imports
    const importMatches = content.matchAll(/import\s+.*from\s+['"]([^'"]+)['"]/g);
    for (const match of importMatches) {
      deps.add(match[1]);
    }

    // require statements
    const requireMatches = content.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
    for (const match of requireMatches) {
      deps.add(match[1]);
    }

    // C# using statements
    const usingMatches = content.matchAll(/using\s+([\w.]+)\s*;/g);
    for (const match of usingMatches) {
      deps.add(match[1]);
    }

    this.dependencies.set(file, deps);
  }

  /**
   * Analyze coupling across files
   */
  private analyzeCoupling(): QualityFinding[] {
    const findings: QualityFinding[] = [];

    // Build reverse dependency map
    const dependents = new Map<string, Set<string>>();
    for (const [file, deps] of this.dependencies) {
      for (const dep of deps) {
        if (!dependents.has(dep)) {
          dependents.set(dep, new Set());
        }
        dependents.get(dep)!.add(file);
      }
    }

    // Detect circular dependencies (simple 2-node cycles)
    for (const [file, deps] of this.dependencies) {
      for (const dep of deps) {
        const depDeps = this.dependencies.get(dep);
        if (depDeps?.has(file)) {
          findings.push({
            id: `coupling-${crypto.createHash('md5').update(`${file}:${dep}`).digest('hex').slice(0, 8)}`,
            category: 'coupling',
            type: 'circular-dependency',
            severity: 'warning',
            message: `Circular dependency detected`,
            description: `${this.getBasename(file)} ↔ ${dep}`,
            file,
            line: 1,
            suggestion: 'Consider introducing an interface or moving shared code to a separate module',
            autoFixable: false
          });
        }
      }
    }

    // Detect high coupling (many dependencies)
    for (const [file, deps] of this.dependencies) {
      if (deps.size > 15) {
        findings.push({
          id: `coupling-high-${crypto.createHash('md5').update(file).digest('hex').slice(0, 8)}`,
          category: 'coupling',
          type: 'tight-coupling',
          severity: deps.size > 25 ? 'error' : 'warning',
          message: `High dependency count: ${deps.size} imports`,
          description: 'This file depends on many other modules',
          file,
          line: 1,
          suggestion: 'Consider splitting this file or using dependency injection',
          autoFixable: false
        });
      }
    }

    return findings;
  }

  /**
   * Convert metrics to findings
   */
  private metricsToFindings(metrics: ComplexityMetrics[]): QualityFinding[] {
    const findings: QualityFinding[] = [];

    for (const m of metrics) {
      // Cyclomatic complexity
      if (m.cyclomaticComplexity > COMPLEXITY_THRESHOLDS.cyclomaticComplexity.error) {
        findings.push(this.createComplexityFinding(
          m.file, 1, 'high-cyclomatic-complexity',
          `${m.type} '${m.symbol || 'file'}' has cyclomatic complexity ${m.cyclomaticComplexity} (>${COMPLEXITY_THRESHOLDS.cyclomaticComplexity.error})`,
          'Simplify by extracting functions or reducing conditionals',
          'error',
          { complexity: m.cyclomaticComplexity }
        ));
      } else if (m.cyclomaticComplexity > COMPLEXITY_THRESHOLDS.cyclomaticComplexity.warning) {
        findings.push(this.createComplexityFinding(
          m.file, 1, 'high-cyclomatic-complexity',
          `${m.type} '${m.symbol || 'file'}' has cyclomatic complexity ${m.cyclomaticComplexity} (>${COMPLEXITY_THRESHOLDS.cyclomaticComplexity.warning})`,
          'Consider simplifying this code',
          'warning',
          { complexity: m.cyclomaticComplexity }
        ));
      }

      // Max nesting depth
      if (m.maxNestingDepth > COMPLEXITY_THRESHOLDS.maxNestingDepth.error) {
        findings.push(this.createComplexityFinding(
          m.file, 1, 'deep-nesting',
          `${m.type} '${m.symbol || 'file'}' has nesting depth ${m.maxNestingDepth} (>${COMPLEXITY_THRESHOLDS.maxNestingDepth.error})`,
          'Flatten nested conditionals using early returns or guard clauses',
          'error',
          { nestingDepth: m.maxNestingDepth }
        ));
      }
    }

    return findings;
  }

  /**
   * Create complexity finding
   */
  private createComplexityFinding(
    file: string,
    line: number,
    type: 'high-cyclomatic-complexity' | 'deep-nesting' | 'god-class' | 'long-method' | 'too-many-parameters',
    message: string,
    suggestion: string,
    severity: QualitySeverity,
    metrics?: { complexity?: number; nestingDepth?: number }
  ): QualityFinding {
    return {
      id: `complexity-${crypto.createHash('md5').update(`${file}:${line}:${type}`).digest('hex').slice(0, 8)}`,
      category: 'complexity',
      type,
      severity,
      message,
      description: message,
      file,
      line,
      suggestion,
      autoFixable: false,
      metrics
    };
  }

  /**
   * Create Unity-specific finding
   */
  private createUnityFinding(
    file: string,
    line: number,
    type: 'update-in-update' | 'find-in-update' | 'getcomponent-in-update' | 'instantiate-without-pool' | 'string-comparison-tag',
    message: string,
    severity: QualitySeverity
  ): QualityFinding {
    return {
      id: `unity-${crypto.createHash('md5').update(`${file}:${line}:${type}`).digest('hex').slice(0, 8)}`,
      category: 'unity-specific',
      type,
      severity,
      message,
      description: message,
      file,
      line,
      suggestion: message,
      autoFixable: false
    };
  }

  /**
   * Find line number of a pattern
   */
  private findLineNumber(content: string, pattern: string): number {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(pattern)) {
        return i + 1;
      }
    }
    return 1;
  }

  /**
   * Check if identifier is a keyword
   */
  private isKeyword(name: string): boolean {
    const keywords = new Set([
      'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
      'return', 'throw', 'try', 'catch', 'finally', 'new', 'delete', 'typeof',
      'void', 'class', 'extends', 'implements', 'interface', 'enum', 'const',
      'let', 'var', 'function', 'async', 'await', 'import', 'export', 'default',
      'public', 'private', 'protected', 'static', 'readonly', 'abstract'
    ]);
    return keywords.has(name);
  }

  /**
   * Get basename from path
   */
  private getBasename(path: string): string {
    return path.split('/').pop() || path;
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
      '**/*.d.ts'
    ];

    if (options?.exclude) {
      excludes.push(...options.exclude);
    }

    return `{${excludes.join(',')}}`;
  }
}
