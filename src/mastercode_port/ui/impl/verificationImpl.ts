// @ts-nocheck

import * as vscode from 'vscode';

export function createVerificationImpl(panel: any) {
  async function scanGitDiff(): Promise<void> {
    const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceDir) {
      panel._postMessage({ type: 'diffResult', diff: null });
      return;
    }

    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      const { stdout: statusOut } = await execAsync('git status --porcelain', { cwd: workspaceDir });
      const files: { path: string; status: 'added' | 'modified' | 'deleted' }[] = [];

      for (const line of statusOut.split('\n')) {
        if (!line.trim()) continue;
        const status = line.substring(0, 2).trim();
        const filePath = line.substring(3).trim();

        if (status === '??' || status === 'A') {
          files.push({ path: filePath, status: 'added' });
        } else if (status === 'D') {
          files.push({ path: filePath, status: 'deleted' });
        } else if (status === 'M' || status === 'MM' || status === 'AM') {
          files.push({ path: filePath, status: 'modified' });
        } else if (status) {
          files.push({ path: filePath, status: 'modified' });
        }
      }

      let diffContent = '';
      try {
        const { stdout: diffOut } = await execAsync('git diff HEAD', { cwd: workspaceDir, maxBuffer: 1024 * 1024 * 5 });
        diffContent = diffOut;

        const { stdout: stagedOut } = await execAsync('git diff --cached', { cwd: workspaceDir, maxBuffer: 1024 * 1024 * 5 });
        if (stagedOut) {
          diffContent = diffContent + '\n' + stagedOut;
        }
      } catch (e) {
        // ignore
      }

      panel._postMessage({
        type: 'diffResult',
        diff: {
          files,
          diff: diffContent,
          timestamp: Date.now()
        }
      });
    } catch (err) {
      console.error('Diff scan error:', err);
      panel._postMessage({ type: 'diffResult', diff: null });
    }
  }

  async function runRegressionTests(): Promise<void> {
    const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceDir) {
      panel._postMessage({ type: 'testResult', success: false, output: 'No workspace folder open.' });
      return;
    }

    const config = vscode.workspace.getConfiguration('spacecode');
    const testCommand = config.get<string>('testCommand', 'npm test');

    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      const { stdout, stderr } = await execAsync(testCommand, {
        cwd: workspaceDir,
        maxBuffer: 1024 * 1024 * 5,
        timeout: 300000
      });

      const output = stdout + (stderr ? '\nSTDERR:\n' + stderr : '');
      panel._postMessage({
        type: 'testResult',
        success: true,
        output: output || 'Tests passed (no output)'
      });
    } catch (err: any) {
      const output = (err.stdout || '') + (err.stderr ? '\nSTDERR:\n' + err.stderr : '');
      panel._postMessage({
        type: 'testResult',
        success: false,
        output: output || err.message || 'Test command failed'
      });
    }
  }

  async function executePlanFromJob(planId: string): Promise<void> {
    if (!planId) {
      throw new Error('No plan ID provided');
    }

    const plan = panel.planStorage.loadPlan(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    const { PlanExecutor } = await import('../../../execution');
    const executor = new PlanExecutor();

    panel._postMessage({
      type: 'planExecutionStarted',
      planId,
      planTitle: plan.intent,
      totalSteps: plan.totalSteps
    });

    try {
      const result = await executor.execute(plan, {
        onOutput: (chunk: string) => {
          panel._postMessage({
            type: 'executionOutput',
            planId,
            chunk
          });
        },
        onStepStart: (step: any) => {
          panel._postMessage({
            type: 'planStepStarted',
            planId,
            stepId: step.id,
            stepDescription: step.description
          });
        },
        onStepComplete: (stepResult: any) => {
          panel._postMessage({
            type: 'planStepCompleted',
            planId,
            stepId: stepResult.stepId,
            success: stepResult.success,
            error: stepResult.error
          });
        },
        onPhaseComplete: (phaseResult: any) => {
          panel._postMessage({
            type: 'planPhaseCompleted',
            planId,
            phaseId: phaseResult.phaseId,
            success: phaseResult.success,
            summary: phaseResult.summary
          });
        }
      });

      panel._postMessage({
        type: 'planExecutionCompleted',
        planId,
        success: result.success,
        summary: result.summary,
        completedSteps: result.completedSteps,
        failedSteps: result.failedSteps,
        totalTokens: result.totalTokens,
        totalCost: result.totalCost
      });

      await panel.planStorage.addHistoryEntry({
        planId,
        action: 'executed',
        timestamp: Date.now(),
        details: {
          success: result.success,
          completedSteps: result.completedSteps,
          failedSteps: result.failedSteps
        }
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      panel._postMessage({
        type: 'planExecutionError',
        planId,
        error: msg
      });
      throw error;
    }
  }

  async function executePlanStepByStep(planId: string): Promise<void> {
    if (!planId) {
      throw new Error('No plan ID provided');
    }

    const plan = panel.planStorage.loadPlan(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    const { PlanExecutor } = await import('../../../execution');
    const executor = new PlanExecutor();
    let completedSteps = 0;
    let failedSteps = 0;

    panel._postMessage({
      type: 'planExecutionStarted',
      planId,
      planTitle: plan.intent,
      totalSteps: plan.totalSteps
    });

    try {
      for (let phaseIndex = 0; phaseIndex < plan.phases.length; phaseIndex++) {
        const phase = plan.phases[phaseIndex];
        for (let stepIndex = 0; stepIndex < phase.steps.length; stepIndex++) {
          const step = phase.steps[stepIndex];

          panel._postMessage({
            type: 'planStepPending',
            planId,
            stepId: step.id,
            stepDescription: step.description,
            phaseTitle: phase.title,
            phaseIndex,
            stepIndex
          });

          const approved = await panel._awaitPlanStepApproval();
          panel._pendingStepApproval = null;

          if (!approved) {
            panel._postMessage({
              type: 'planExecutionCompleted',
              planId,
              success: false,
              summary: 'Execution stopped by user.',
              completedSteps,
              failedSteps
            });
            await panel.planStorage.addHistoryEntry({
              planId,
              action: 'cancelled',
              timestamp: Date.now(),
              details: {
                mode: 'step-by-step',
                completedSteps,
                failedSteps
              }
            });
            return;
          }

          panel._postMessage({
            type: 'planStepStarted',
            planId,
            stepId: step.id,
            stepDescription: step.description
          });

          const stepResult = await executor.executeSingleStep(plan, phase, step, {
            onOutput: (chunk: string) => {
              panel._postMessage({
                type: 'executionOutput',
                planId,
                chunk
              });
            }
          });

          panel._postMessage({
            type: 'planStepCompleted',
            planId,
            stepId: stepResult.stepId,
            success: stepResult.success,
            error: stepResult.error
          });

          if (stepResult.success) {
            completedSteps += 1;
          } else {
            failedSteps += 1;
            panel._postMessage({
              type: 'planExecutionCompleted',
              planId,
              success: false,
              summary: 'Execution halted after a failed step.',
              completedSteps,
              failedSteps
            });
            await panel.planStorage.addHistoryEntry({
              planId,
              action: 'failed',
              timestamp: Date.now(),
              details: {
                mode: 'step-by-step',
                completedSteps,
                failedSteps,
                stepId: stepResult.stepId,
                error: stepResult.error
              }
            });
            return;
          }
        }

        panel._postMessage({
          type: 'planPhaseCompleted',
          planId,
          phaseId: phase.id,
          success: true,
          summary: `Phase ${phaseIndex + 1}: ${phase.steps.length}/${phase.steps.length} steps completed`
        });
      }

      panel._postMessage({
        type: 'planExecutionCompleted',
        planId,
        success: true,
        summary: `Execution complete: ${completedSteps}/${plan.totalSteps} steps succeeded.`,
        completedSteps,
        failedSteps
      });

      await panel.planStorage.addHistoryEntry({
        planId,
        action: 'executed',
        timestamp: Date.now(),
        details: {
          mode: 'step-by-step',
          completedSteps,
          failedSteps
        }
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      panel._postMessage({
        type: 'planExecutionError',
        planId,
        error: msg
      });
      throw error;
    }
  }

  function setCurrentPlan(plan: { expectedFiles: string[] }) {
    panel._verificationCurrentPlan = plan;
  }

  async function comparePlanToFiles(diffFiles: string[]): Promise<void> {
    const expectedFiles = panel._verificationCurrentPlan?.expectedFiles || [];

    if (expectedFiles.length === 0) {
      panel._postMessage({
        type: 'planComparisonResult',
        result: {
          matched: [],
          unexpected: diffFiles,
          missing: [],
          noPlan: true
        }
      });
      return;
    }

    const matched: string[] = [];
    const unexpected: string[] = [];
    const missing: string[] = [];

    for (const file of diffFiles) {
      const normalizedFile = file.replace(/\\/g, '/');
      const isExpected = expectedFiles.some(exp => {
        const normalizedExp = exp.replace(/\\/g, '/');
        return normalizedFile === normalizedExp ||
               normalizedFile.endsWith(normalizedExp) ||
               normalizedExp.endsWith(normalizedFile);
      });

      if (isExpected) {
        matched.push(file);
      } else {
        unexpected.push(file);
      }
    }

    for (const expected of expectedFiles) {
      const normalizedExp = expected.replace(/\\/g, '/');
      const found = diffFiles.some(file => {
        const normalizedFile = file.replace(/\\/g, '/');
        return normalizedFile === normalizedExp ||
               normalizedFile.endsWith(normalizedExp) ||
               normalizedExp.endsWith(normalizedFile);
      });

      if (!found) {
        missing.push(expected);
      }
    }

    panel._postMessage({
      type: 'planComparisonResult',
      result: { matched, unexpected, missing }
    });
  }

  async function comparePlanToDiff(planId: string, diffResult?: any): Promise<void> {
    try {
      const plan = panel.planStorage.loadPlan(planId);
      if (!plan) {
        panel._postMessage({
          type: 'planComparisonError',
          planId,
          error: `Plan not found: ${planId}`
        });
        return;
      }

      let diff: any;
      if (diffResult) {
        diff = diffResult;
      } else {
        diff = await panel.diffScanner.scanAll();
      }

      const result = panel.planComparer.compare(plan, diff);

      panel._postMessage({
        type: 'planComparisonResult',
        planId,
        result: {
          score: result.score,
          verdict: result.verdict,
          summary: result.summary,
          plannedFiles: result.plannedFiles,
          actualFiles: result.actualFiles,
          matchedFiles: result.matchedFiles.map(m => ({
            plannedFile: m.plannedFile,
            actualFile: m.actualFile,
            plannedChangeType: m.plannedChangeType,
            actualStatus: m.actualStatus,
            match: m.match
          })),
          unexpectedChanges: result.unexpectedChanges.map(u => ({
            file: u.file,
            status: u.status,
            additions: u.additions,
            deletions: u.deletions,
            severity: u.severity,
            reason: u.reason
          })),
          missingChanges: result.missingChanges.map(m => ({
            file: m.file,
            plannedChangeType: m.plannedChangeType,
            severity: m.severity,
            stepDescription: m.step?.description
          }))
        }
      });

      await panel.planStorage.addHistoryEntry({
        planId,
        action: 'compared',
        timestamp: Date.now(),
        details: {
          score: result.score,
          verdict: result.verdict,
          matchedCount: result.matchedFiles.length,
          unexpectedCount: result.unexpectedChanges.length,
          missingCount: result.missingChanges.length
        }
      });

    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      panel._postMessage({
        type: 'planComparisonError',
        planId,
        error: msg
      });
    }
  }

  return {
    scanGitDiff,
    runRegressionTests,
    executePlanFromJob,
    executePlanStepByStep,
    setCurrentPlan,
    comparePlanToFiles,
    comparePlanToDiff,
  };
}
