/**
 * Pre-flight Checker
 *
 * Runs mandatory safety and hygiene checks before execution or merge.
 * Consolidates security audit, assembly checks, and duplicate detection.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { AsmdefGate } from './AsmdefGate';
import { SectorRuleChecker } from './SectorRuleChecker';

/**
 * Pre-flight check result
 */
export interface PreflightCheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn' | 'skip';
  message: string;
  details?: any;
  duration: number;
}

/**
 * Security pattern match
 */
export interface SecurityMatch {
  file: string;
  line: number;
  pattern: string;
  category: 'secrets' | 'dangerous-api' | 'insecure-network' | 'path-traversal' | 'injection';
  severity: 'error' | 'warning';
  match: string;
}

/**
 * Duplicate detection result
 */
export interface DuplicateMatch {
  file1: string;
  file2: string;
  startLine1: number;
  startLine2: number;
  lines: number;
  similarity: number;
}

/**
 * Pre-flight configuration
 */
export interface PreflightConfig {
  runSecurityAudit: boolean;
  runAssemblyCheck: boolean;
  runDuplicateFinder: boolean;
  runCustomChecks: boolean;
  minDuplicateLines: number;
  similarityThreshold: number;
  customCheckScripts: string[];
}

const DEFAULT_CONFIG: PreflightConfig = {
  runSecurityAudit: true,
  runAssemblyCheck: true,
  runDuplicateFinder: true,
  runCustomChecks: false,
  minDuplicateLines: 10,
  similarityThreshold: 0.9,
  customCheckScripts: [],
};

/**
 * Security patterns to check
 */
const SECURITY_PATTERNS = {
  secrets: [
    // API keys and tokens
    { pattern: /["'](?:api[_-]?key|apikey)["']\s*[=:]\s*["'][a-zA-Z0-9_-]{20,}["']/gi, severity: 'error' as const },
    { pattern: /["'](?:secret|token|password|passwd|pwd)["']\s*[=:]\s*["'][^"']+["']/gi, severity: 'error' as const },
    { pattern: /(?:PRIVATE[_-]?KEY|private_key)\s*[=:]/gi, severity: 'error' as const },
    { pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, severity: 'error' as const },
    { pattern: /(?:aws_access_key|aws_secret|AWS_ACCESS_KEY)/gi, severity: 'error' as const },
  ],
  'dangerous-api': [
    { pattern: /\beval\s*\(/g, severity: 'warning' as const },
    { pattern: /\bexec\s*\(/g, severity: 'warning' as const },
    { pattern: /Process\.Start\s*\(/g, severity: 'warning' as const },
    { pattern: /Runtime\.getRuntime\s*\(\s*\)\.exec/g, severity: 'warning' as const },
    { pattern: /\bshell_exec\s*\(/g, severity: 'warning' as const },
    { pattern: /\bsystem\s*\(/g, severity: 'warning' as const },
  ],
  'insecure-network': [
    { pattern: /http:\/\/(?!localhost|127\.0\.0\.1)/g, severity: 'warning' as const },
    { pattern: /InsecureSkipVerify\s*[=:]\s*true/g, severity: 'error' as const },
    { pattern: /TrustServerCertificate\s*[=:]\s*true/g, severity: 'warning' as const },
  ],
  'path-traversal': [
    { pattern: /\.\.\/|\.\.\\|%2e%2e%2f/gi, severity: 'warning' as const },
    { pattern: /Path\.Combine\s*\([^)]*\.\.\//g, severity: 'warning' as const },
  ],
  injection: [
    { pattern: /\+\s*["'][^"']*SELECT\s+/gi, severity: 'warning' as const },
    { pattern: /\+\s*["'][^"']*INSERT\s+/gi, severity: 'warning' as const },
    { pattern: /\+\s*["'][^"']*UPDATE\s+/gi, severity: 'warning' as const },
    { pattern: /\+\s*["'][^"']*DELETE\s+/gi, severity: 'warning' as const },
    { pattern: /string\.Format\s*\(\s*["'][^"']*WHERE/gi, severity: 'warning' as const },
  ],
};

/**
 * Pre-flight Checker - runs all checks before execution
 */
export class PreflightChecker {
  private config: PreflightConfig;
  private asmdefGate: AsmdefGate;
  private sectorRuleChecker: SectorRuleChecker;

  constructor(config?: Partial<PreflightConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.asmdefGate = new AsmdefGate();
    this.sectorRuleChecker = new SectorRuleChecker();
  }

  /**
   * Run all pre-flight checks
   */
  async runAllChecks(files: string[]): Promise<{
    passed: boolean;
    checks: PreflightCheckResult[];
    blockers: string[];
  }> {
    const checks: PreflightCheckResult[] = [];
    const blockers: string[] = [];

    // 1. Security Audit
    if (this.config.runSecurityAudit) {
      const securityResult = await this.runSecurityAudit(files);
      checks.push(securityResult);
      if (securityResult.status === 'fail') {
        blockers.push(`Security audit failed: ${securityResult.message}`);
      }
    }

    // 2. Assembly Check
    if (this.config.runAssemblyCheck) {
      const assemblyResult = await this.runAssemblyCheck(files);
      checks.push(assemblyResult);
      if (assemblyResult.status === 'fail') {
        blockers.push(`Assembly check failed: ${assemblyResult.message}`);
      }
    }

    // 3. Duplicate Finder
    if (this.config.runDuplicateFinder) {
      const duplicateResult = await this.runDuplicateFinder(files);
      checks.push(duplicateResult);
      // Duplicates are warnings, not blockers
    }

    // 4. Custom Checks
    if (this.config.runCustomChecks && this.config.customCheckScripts.length > 0) {
      const customResults = await this.runCustomChecks(files);
      checks.push(...customResults);
      for (const result of customResults) {
        if (result.status === 'fail') {
          blockers.push(`Custom check '${result.name}' failed: ${result.message}`);
        }
      }
    }

    return {
      passed: blockers.length === 0,
      checks,
      blockers,
    };
  }

  /**
   * Run security audit
   */
  async runSecurityAudit(files: string[]): Promise<PreflightCheckResult> {
    const startTime = Date.now();
    const matches: SecurityMatch[] = [];

    for (const file of files) {
      try {
        const uri = vscode.Uri.file(file);
        const content = (await vscode.workspace.fs.readFile(uri)).toString();
        const lines = content.split('\n');

        for (const [category, patterns] of Object.entries(SECURITY_PATTERNS)) {
          for (const { pattern, severity } of patterns) {
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              const regex = new RegExp(pattern.source, pattern.flags);
              let match;
              while ((match = regex.exec(line)) !== null) {
                matches.push({
                  file,
                  line: i + 1,
                  pattern: pattern.source,
                  category: category as SecurityMatch['category'],
                  severity,
                  match: match[0].substring(0, 50),
                });
              }
            }
          }
        }
      } catch {
        // File not found or unreadable - skip
      }
    }

    const errors = matches.filter(m => m.severity === 'error');
    const warnings = matches.filter(m => m.severity === 'warning');

    return {
      name: 'Security Audit',
      status: errors.length > 0 ? 'fail' : warnings.length > 0 ? 'warn' : 'pass',
      message: errors.length > 0
        ? `Found ${errors.length} security issues (${warnings.length} warnings)`
        : warnings.length > 0
        ? `Found ${warnings.length} security warnings`
        : 'No security issues found',
      details: { matches },
      duration: Date.now() - startTime,
    };
  }

  /**
   * Run assembly dependency check
   */
  async runAssemblyCheck(files: string[]): Promise<PreflightCheckResult> {
    const startTime = Date.now();

    try {
      // Get all asmdef files affected
      const asmdefFiles = files.filter(f => f.endsWith('.asmdef'));

      if (asmdefFiles.length === 0) {
        return {
          name: 'Assembly Check',
          status: 'skip',
          message: 'No asmdef files to check',
          duration: Date.now() - startTime,
        };
      }

      // Load and validate asmdefs
      const graph = await this.asmdefGate.getGraph();

      // Check for unresolved references
      if (graph.unresolved.length > 0) {
        return {
          name: 'Assembly Check',
          status: 'fail',
          message: `Found ${graph.unresolved.length} unresolved asmdef references`,
          details: { unresolved: graph.unresolved },
          duration: Date.now() - startTime,
        };
      }

      return {
        name: 'Assembly Check',
        status: 'pass',
        message: `Validated ${graph.nodes.length} asmdef dependencies`,
        details: { nodeCount: graph.nodes.length, edgeCount: graph.edges.length },
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        name: 'Assembly Check',
        status: 'fail',
        message: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Run duplicate code finder
   */
  async runDuplicateFinder(files: string[]): Promise<PreflightCheckResult> {
    const startTime = Date.now();
    const duplicates: DuplicateMatch[] = [];

    // Simple hash-based duplicate detection
    const blockHashes = new Map<string, { file: string; line: number; content: string }[]>();

    for (const file of files) {
      try {
        const uri = vscode.Uri.file(file);
        const content = (await vscode.workspace.fs.readFile(uri)).toString();
        const lines = content.split('\n');

        // Build blocks of minDuplicateLines
        for (let i = 0; i <= lines.length - this.config.minDuplicateLines; i++) {
          const block = lines.slice(i, i + this.config.minDuplicateLines).join('\n').trim();
          if (block.length < 50) continue; // Skip short blocks

          const hash = this.simpleHash(block);
          const existing = blockHashes.get(hash) || [];
          existing.push({ file, line: i + 1, content: block });
          blockHashes.set(hash, existing);
        }
      } catch {
        // File not found - skip
      }
    }

    // Find duplicates
    for (const [, blocks] of blockHashes) {
      if (blocks.length > 1) {
        for (let i = 0; i < blocks.length - 1; i++) {
          for (let j = i + 1; j < blocks.length; j++) {
            const similarity = this.calculateSimilarity(blocks[i].content, blocks[j].content);
            if (similarity >= this.config.similarityThreshold) {
              duplicates.push({
                file1: blocks[i].file,
                file2: blocks[j].file,
                startLine1: blocks[i].line,
                startLine2: blocks[j].line,
                lines: this.config.minDuplicateLines,
                similarity,
              });
            }
          }
        }
      }
    }

    return {
      name: 'Duplicate Finder',
      status: duplicates.length > 0 ? 'warn' : 'pass',
      message: duplicates.length > 0
        ? `Found ${duplicates.length} duplicate code blocks`
        : 'No significant duplicates found',
      details: { duplicates },
      duration: Date.now() - startTime,
    };
  }

  /**
   * Run custom checks
   */
  async runCustomChecks(files: string[]): Promise<PreflightCheckResult[]> {
    const results: PreflightCheckResult[] = [];

    for (const scriptPath of this.config.customCheckScripts) {
      const startTime = Date.now();

      try {
        // Custom check would be loaded and executed here
        // For now, just mark as skipped
        results.push({
          name: `Custom: ${path.basename(scriptPath)}`,
          status: 'skip',
          message: 'Custom checks not yet implemented',
          duration: Date.now() - startTime,
        });
      } catch (error) {
        results.push({
          name: `Custom: ${path.basename(scriptPath)}`,
          status: 'fail',
          message: error instanceof Error ? error.message : 'Unknown error',
          duration: Date.now() - startTime,
        });
      }
    }

    return results;
  }

  /**
   * Simple hash function
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  /**
   * Calculate Jaccard similarity
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const tokens1 = new Set(str1.split(/\s+/));
    const tokens2 = new Set(str2.split(/\s+/));

    const intersection = new Set([...tokens1].filter(t => tokens2.has(t)));
    const union = new Set([...tokens1, ...tokens2]);

    return intersection.size / union.size;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PreflightConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get configuration
   */
  getConfig(): PreflightConfig {
    return { ...this.config };
  }
}

/**
 * Singleton instance
 */
let preflightCheckerInstance: PreflightChecker | null = null;

export function getPreflightChecker(): PreflightChecker {
  if (!preflightCheckerInstance) {
    preflightCheckerInstance = new PreflightChecker();
  }
  return preflightCheckerInstance;
}

export function initPreflightChecker(config?: Partial<PreflightConfig>): PreflightChecker {
  preflightCheckerInstance = new PreflightChecker(config);
  return preflightCheckerInstance;
}
