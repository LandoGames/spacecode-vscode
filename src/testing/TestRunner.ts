/**
 * Test Runner
 *
 * Runs tests using detected framework (Jest, Mocha, Vitest, etc.)
 * and parses results into a unified format.
 */

import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  TestRunResult,
  TestRunOptions,
  TestFramework,
  TestSuite,
  TestCase,
  TestDiscoveryResult
} from './types';

let _instance: TestRunner | undefined;

export function getTestRunner(): TestRunner {
  if (!_instance) {
    _instance = new TestRunner();
  }
  return _instance;
}

export class TestRunner {
  /**
   * Detect test framework in workspace
   */
  async detectFramework(): Promise<TestFramework> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return 'unknown';

    const root = workspaceFolders[0].uri.fsPath;

    try {
      const packageJson = require(path.join(root, 'package.json'));
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

      if (deps['vitest']) return 'vitest';
      if (deps['jest']) return 'jest';
      if (deps['mocha']) return 'mocha';
    } catch {
      // No package.json
    }

    // Check for Unity project
    const unityFiles = await vscode.workspace.findFiles('**/Assembly*.asmdef', null, 1);
    if (unityFiles.length > 0) {
      return 'unity-editmode';
    }

    return 'unknown';
  }

  /**
   * Discover tests without running them
   */
  async discover(): Promise<TestDiscoveryResult> {
    const framework = await this.detectFramework();
    const suites: TestDiscoveryResult['suites'] = [];

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return { framework, suites, totalTests: 0 };
    }

    // Find test files
    const testPatterns = [
      '**/*.test.ts',
      '**/*.spec.ts',
      '**/*.test.js',
      '**/*.spec.js',
      '**/__tests__/**/*.ts',
      '**/__tests__/**/*.js'
    ];

    for (const pattern of testPatterns) {
      const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 100);

      for (const file of files) {
        try {
          const doc = await vscode.workspace.openTextDocument(file);
          const content = doc.getText();

          // Count test cases (rough estimate)
          const testMatches = content.match(/\bit\s*\(|test\s*\(/g) || [];
          const describeMatch = content.match(/describe\s*\(\s*['"`]([^'"`]+)/);

          suites.push({
            file: file.fsPath,
            name: describeMatch ? describeMatch[1] : path.basename(file.fsPath),
            testCount: testMatches.length
          });
        } catch {
          // Skip files that can't be read
        }
      }
    }

    const totalTests = suites.reduce((sum, s) => sum + s.testCount, 0);
    return { framework, suites, totalTests };
  }

  /**
   * Run tests
   */
  async run(options?: TestRunOptions): Promise<TestRunResult> {
    const startTime = Date.now();
    const framework = options?.framework || await this.detectFramework();

    switch (framework) {
      case 'jest':
        return this.runJest(options, startTime);
      case 'vitest':
        return this.runVitest(options, startTime);
      case 'mocha':
        return this.runMocha(options, startTime);
      default:
        return this.createEmptyResult(framework, startTime, 'No test framework detected');
    }
  }

  /**
   * Run Jest tests
   */
  private async runJest(options: TestRunOptions | undefined, startTime: number): Promise<TestRunResult> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return this.createEmptyResult('jest', startTime, 'No workspace');
    }

    const root = workspaceFolders[0].uri.fsPath;

    return new Promise((resolve) => {
      const args = ['--json'];
      if (options?.coverage) args.push('--coverage');
      if (options?.files?.length) {
        args.push(...options.files);
      }

      const proc = cp.exec(`npx jest ${args.join(' ')}`, {
        cwd: root,
        timeout: 120000,
        maxBuffer: 5 * 1024 * 1024
      }, (error, stdout, stderr) => {
        try {
          // Jest outputs JSON to stdout when --json flag is used
          const result = JSON.parse(stdout);
          resolve(this.parseJestResult(result, startTime));
        } catch {
          // Parse error output
          const suites = this.parseErrorOutput(stderr || stdout, root);
          resolve(this.createResult('jest', startTime, suites, false));
        }
      });
    });
  }

  /**
   * Run Vitest tests
   */
  private async runVitest(options: TestRunOptions | undefined, startTime: number): Promise<TestRunResult> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return this.createEmptyResult('vitest', startTime, 'No workspace');
    }

    const root = workspaceFolders[0].uri.fsPath;

    return new Promise((resolve) => {
      const args = ['run', '--reporter=json'];
      if (options?.coverage) args.push('--coverage');

      const proc = cp.exec(`npx vitest ${args.join(' ')}`, {
        cwd: root,
        timeout: 120000,
        maxBuffer: 5 * 1024 * 1024
      }, (error, stdout, stderr) => {
        try {
          const result = JSON.parse(stdout);
          resolve(this.parseVitestResult(result, startTime));
        } catch {
          const suites = this.parseErrorOutput(stderr || stdout, root);
          resolve(this.createResult('vitest', startTime, suites, false));
        }
      });
    });
  }

  /**
   * Run Mocha tests
   */
  private async runMocha(options: TestRunOptions | undefined, startTime: number): Promise<TestRunResult> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return this.createEmptyResult('mocha', startTime, 'No workspace');
    }

    const root = workspaceFolders[0].uri.fsPath;

    return new Promise((resolve) => {
      const args = ['--reporter=json'];

      const proc = cp.exec(`npx mocha ${args.join(' ')}`, {
        cwd: root,
        timeout: 120000,
        maxBuffer: 5 * 1024 * 1024
      }, (error, stdout, stderr) => {
        try {
          const result = JSON.parse(stdout);
          resolve(this.parseMochaResult(result, startTime));
        } catch {
          const suites = this.parseErrorOutput(stderr || stdout, root);
          resolve(this.createResult('mocha', startTime, suites, false));
        }
      });
    });
  }

  /**
   * Parse Jest JSON result
   */
  private parseJestResult(result: any, startTime: number): TestRunResult {
    const suites: TestSuite[] = (result.testResults || []).map((tr: any) => {
      const tests: TestCase[] = (tr.assertionResults || []).map((ar: any) => ({
        id: crypto.createHash('md5').update(`${tr.name}:${ar.fullName}`).digest('hex').slice(0, 8),
        name: ar.title,
        suite: ar.ancestorTitles?.join(' > ') || '',
        file: tr.name,
        status: ar.status === 'passed' ? 'passed' : ar.status === 'failed' ? 'failed' : 'skipped',
        duration: ar.duration,
        error: ar.failureMessages?.length ? {
          message: ar.failureMessages.join('\n')
        } : undefined
      }));

      return {
        id: crypto.createHash('md5').update(tr.name).digest('hex').slice(0, 8),
        name: path.basename(tr.name),
        file: tr.name,
        tests,
        status: tr.status === 'passed' ? 'passed' : 'failed',
        duration: tr.endTime - tr.startTime,
        passed: tests.filter(t => t.status === 'passed').length,
        failed: tests.filter(t => t.status === 'failed').length,
        skipped: tests.filter(t => t.status === 'skipped').length
      };
    });

    return this.createResult('jest', startTime, suites, result.success);
  }

  /**
   * Parse Vitest JSON result
   */
  private parseVitestResult(result: any, startTime: number): TestRunResult {
    const suites: TestSuite[] = (result.testResults || []).map((tr: any) => {
      const tests: TestCase[] = (tr.assertionResults || []).map((ar: any) => ({
        id: crypto.createHash('md5').update(`${tr.name}:${ar.fullName}`).digest('hex').slice(0, 8),
        name: ar.title || ar.name,
        suite: ar.ancestorTitles?.join(' > ') || '',
        file: tr.name,
        status: ar.status,
        duration: ar.duration,
        error: ar.failureMessages?.length ? {
          message: ar.failureMessages.join('\n')
        } : undefined
      }));

      return {
        id: crypto.createHash('md5').update(tr.name).digest('hex').slice(0, 8),
        name: path.basename(tr.name),
        file: tr.name,
        tests,
        status: tr.status === 'passed' ? 'passed' : 'failed',
        duration: tr.duration || 0,
        passed: tests.filter(t => t.status === 'passed').length,
        failed: tests.filter(t => t.status === 'failed').length,
        skipped: tests.filter(t => t.status === 'skipped').length
      };
    });

    return this.createResult('vitest', startTime, suites, result.success);
  }

  /**
   * Parse Mocha JSON result
   */
  private parseMochaResult(result: any, startTime: number): TestRunResult {
    const suites: TestSuite[] = [];
    const suitesMap = new Map<string, TestSuite>();

    for (const test of result.tests || []) {
      const suiteName = test.fullTitle?.split(' ')[0] || 'default';
      let suite = suitesMap.get(suiteName);

      if (!suite) {
        suite = {
          id: crypto.createHash('md5').update(suiteName).digest('hex').slice(0, 8),
          name: suiteName,
          file: test.file || '',
          tests: [],
          status: 'passed',
          duration: 0,
          passed: 0,
          failed: 0,
          skipped: 0
        };
        suitesMap.set(suiteName, suite);
        suites.push(suite);
      }

      const testCase: TestCase = {
        id: crypto.createHash('md5').update(test.fullTitle || test.title).digest('hex').slice(0, 8),
        name: test.title,
        suite: suiteName,
        file: test.file || '',
        status: test.state === 'passed' ? 'passed' : test.state === 'failed' ? 'failed' : 'skipped',
        duration: test.duration,
        error: test.err ? { message: test.err.message, stack: test.err.stack } : undefined
      };

      suite.tests.push(testCase);
      suite.duration += test.duration || 0;
      if (testCase.status === 'passed') suite.passed++;
      else if (testCase.status === 'failed') {
        suite.failed++;
        suite.status = 'failed';
      }
      else suite.skipped++;
    }

    return this.createResult('mocha', startTime, suites, result.stats?.failures === 0);
  }

  /**
   * Parse generic error output
   */
  private parseErrorOutput(output: string, root: string): TestSuite[] {
    // Create a single "error" suite
    return [{
      id: 'error',
      name: 'Test Execution Error',
      file: root,
      tests: [{
        id: 'error-0',
        name: 'Test execution failed',
        suite: 'Error',
        file: root,
        status: 'failed',
        error: {
          message: output.slice(0, 1000)
        }
      }],
      status: 'failed',
      duration: 0,
      passed: 0,
      failed: 1,
      skipped: 0
    }];
  }

  /**
   * Create test result from suites
   */
  private createResult(
    framework: TestFramework,
    startTime: number,
    suites: TestSuite[],
    passed: boolean
  ): TestRunResult {
    const summary = {
      total: suites.reduce((sum, s) => sum + s.tests.length, 0),
      passed: suites.reduce((sum, s) => sum + s.passed, 0),
      failed: suites.reduce((sum, s) => sum + s.failed, 0),
      skipped: suites.reduce((sum, s) => sum + s.skipped, 0),
      pending: 0
    };

    return {
      completedAt: Date.now(),
      duration: Date.now() - startTime,
      framework,
      suites,
      passed,
      summary
    };
  }

  /**
   * Create empty result
   */
  private createEmptyResult(framework: TestFramework, startTime: number, reason: string): TestRunResult {
    return {
      completedAt: Date.now(),
      duration: Date.now() - startTime,
      framework,
      suites: [],
      passed: true,
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        pending: 0
      }
    };
  }
}
