/**
 * Diagnostics Scanner
 *
 * Main orchestrator for all diagnostic checks.
 * Runs build, type, syntax, and lint checks.
 */

import {
  DiagnosticScanResult,
  DiagnosticScanOptions,
  DiagnosticCheckResult
} from './types';
import { TypeScriptChecker, getTypeScriptChecker } from './TypeScriptChecker';
import { BuildChecker, getBuildChecker } from './BuildChecker';
import { LintChecker, getLintChecker } from './LintChecker';

let _instance: DiagnosticsScanner | undefined;

export function getDiagnosticsScanner(): DiagnosticsScanner {
  if (!_instance) {
    _instance = new DiagnosticsScanner();
  }
  return _instance;
}

export class DiagnosticsScanner {
  private typeChecker: TypeScriptChecker;
  private buildChecker: BuildChecker;
  private lintChecker: LintChecker;

  constructor() {
    this.typeChecker = getTypeScriptChecker();
    this.buildChecker = getBuildChecker();
    this.lintChecker = getLintChecker();
  }

  /**
   * Run all diagnostic checks
   */
  async scan(options?: DiagnosticScanOptions): Promise<DiagnosticScanResult> {
    const startTime = Date.now();
    const checks: DiagnosticCheckResult[] = [];

    // Determine which checks to run
    const runChecks = options?.checks || ['typescript', 'lint'];
    const skipChecks = new Set(options?.skip || []);

    // Run TypeScript check
    if (runChecks.includes('typescript') && !skipChecks.has('typescript')) {
      const tsResult = await this.typeChecker.check();
      checks.push(tsResult);

      // Fail fast if requested and check failed
      if (options?.failFast && tsResult.status === 'fail') {
        return this.createResult(checks, startTime);
      }
    }

    // Run lint check
    if (runChecks.includes('lint') && !skipChecks.has('lint')) {
      const lintResult = await this.lintChecker.check();
      checks.push(lintResult);

      if (options?.failFast && lintResult.status === 'fail') {
        return this.createResult(checks, startTime);
      }
    }

    // Build check is optional and can be slow
    if (runChecks.includes('build') && !skipChecks.has('build')) {
      const buildResult = await this.buildChecker.check();
      checks.push(buildResult);
    }

    return this.createResult(checks, startTime);
  }

  /**
   * Run only quick checks (TypeScript diagnostics from VSCode)
   */
  async quickScan(): Promise<DiagnosticScanResult> {
    return this.scan({
      checks: ['typescript', 'lint'],
      skip: ['build']
    });
  }

  /**
   * Run full scan including build
   */
  async fullScan(): Promise<DiagnosticScanResult> {
    return this.scan({
      checks: ['typescript', 'lint', 'build']
    });
  }

  /**
   * Create scan result from check results
   */
  private createResult(checks: DiagnosticCheckResult[], startTime: number): DiagnosticScanResult {
    const duration = Date.now() - startTime;

    // Calculate summary
    const summary = {
      total: checks.length,
      passed: checks.filter(c => c.status === 'pass').length,
      warned: checks.filter(c => c.status === 'warn').length,
      failed: checks.filter(c => c.status === 'fail').length,
      skipped: checks.filter(c => c.status === 'skipped').length,
      errors: checks.reduce((sum, c) => sum + c.items.filter(i => i.severity === 'error').length, 0),
      warnings: checks.reduce((sum, c) => sum + c.items.filter(i => i.severity === 'warning').length, 0)
    };

    // Passed if no failures
    const passed = summary.failed === 0;

    return {
      completedAt: Date.now(),
      duration,
      checks,
      passed,
      summary
    };
  }
}
