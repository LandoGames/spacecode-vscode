/**
 * Build Checker
 *
 * Runs build commands and captures compile errors.
 */

import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  DiagnosticItem,
  DiagnosticCheckResult
} from './types';

let _instance: BuildChecker | undefined;

export function getBuildChecker(): BuildChecker {
  if (!_instance) {
    _instance = new BuildChecker();
  }
  return _instance;
}

export class BuildChecker {
  /**
   * Run build check by executing npm run build or tsc
   */
  async check(): Promise<DiagnosticCheckResult> {
    const startTime = Date.now();
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders) {
      return {
        name: 'Build Check',
        description: 'Compile and build verification',
        status: 'skipped',
        duration: Date.now() - startTime,
        items: [],
        summary: 'No workspace folder found'
      };
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const items: DiagnosticItem[] = [];

    // Detect project type and run appropriate build
    const buildResult = await this.runBuild(workspaceRoot);

    if (buildResult.error) {
      // Parse build errors
      const parsedErrors = this.parseErrors(buildResult.output, workspaceRoot);
      items.push(...parsedErrors);
    }

    const duration = Date.now() - startTime;
    const errorCount = items.filter(i => i.severity === 'error').length;

    return {
      name: 'Build Check',
      description: 'Compile and build verification',
      status: buildResult.error ? 'fail' : 'pass',
      duration,
      items,
      summary: buildResult.error
        ? `Build failed with ${errorCount} error(s)`
        : 'Build successful'
    };
  }

  /**
   * Run build command
   */
  private async runBuild(workspaceRoot: string): Promise<{ error: boolean; output: string }> {
    return new Promise((resolve) => {
      // Check for package.json to determine build command
      const packageJsonPath = path.join(workspaceRoot, 'package.json');
      let command = 'npm run build';

      // Could extend to support other build systems
      // For now, use npm run build with --no-emit for type checking only
      try {
        const pkg = require(packageJsonPath);
        if (pkg.scripts?.['type-check']) {
          command = 'npm run type-check';
        } else if (pkg.scripts?.build) {
          command = 'npm run build';
        } else {
          // Fallback to tsc
          command = 'npx tsc --noEmit';
        }
      } catch {
        command = 'npx tsc --noEmit';
      }

      const proc = cp.exec(command, {
        cwd: workspaceRoot,
        timeout: 60000,
        maxBuffer: 1024 * 1024
      }, (error, stdout, stderr) => {
        const output = stdout + stderr;
        resolve({
          error: error !== null,
          output
        });
      });
    });
  }

  /**
   * Parse build output for errors
   */
  private parseErrors(output: string, workspaceRoot: string): DiagnosticItem[] {
    const items: DiagnosticItem[] = [];
    const lines = output.split('\n');

    // TypeScript error pattern: file(line,col): error TSxxxx: message
    const tsPattern = /^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s+(TS\d+):\s*(.+)$/;

    // ESBuild error pattern: ✘ [ERROR] message
    const esbuildPattern = /^✘\s*\[(ERROR|WARNING)\]\s*(.+)$/;

    // Simple file:line:col pattern
    const simplePattern = /^(.+?):(\d+):(\d+):\s*(error|warning):\s*(.+)$/;

    for (const line of lines) {
      // Try TypeScript pattern
      let match = line.match(tsPattern);
      if (match) {
        const [, file, lineNum, col, severity, code, message] = match;
        items.push(this.createItem(
          file.startsWith('/') ? file : path.join(workspaceRoot, file),
          parseInt(lineNum),
          parseInt(col),
          severity as 'error' | 'warning',
          message,
          code,
          'tsc'
        ));
        continue;
      }

      // Try simple pattern
      match = line.match(simplePattern);
      if (match) {
        const [, file, lineNum, col, severity, message] = match;
        items.push(this.createItem(
          file.startsWith('/') ? file : path.join(workspaceRoot, file),
          parseInt(lineNum),
          parseInt(col),
          severity as 'error' | 'warning',
          message,
          undefined,
          'build'
        ));
        continue;
      }

      // Try ESBuild pattern
      match = line.match(esbuildPattern);
      if (match) {
        const [, severity, message] = match;
        items.push(this.createItem(
          workspaceRoot,
          1,
          1,
          severity.toLowerCase() as 'error' | 'warning',
          message,
          undefined,
          'esbuild'
        ));
      }
    }

    return items;
  }

  /**
   * Create a diagnostic item
   */
  private createItem(
    file: string,
    line: number,
    column: number,
    severity: 'error' | 'warning',
    message: string,
    code: string | undefined,
    source: string
  ): DiagnosticItem {
    const id = crypto.createHash('md5').update(
      `${file}:${line}:${message}`
    ).digest('hex').slice(0, 8);

    return {
      id: `build-${id}`,
      category: 'build',
      severity,
      code,
      message,
      file,
      line,
      column,
      source
    };
  }
}
