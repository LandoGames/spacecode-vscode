/**
 * Plan Executor
 *
 * Executes plans step-by-step via Claude Code CLI or API.
 */

import { spawn, ChildProcess } from 'child_process';
import { Plan, PlanPhase, PlanStep } from '../planning/types';
import { getSectorManager } from '../sectors';
import {
  ExecutionOptions,
  ExecutionState,
  ExecutionStatus,
  StepExecutionResult,
  PhaseExecutionResult,
  PlanExecutionResult,
  ExecutionPrompt,
  DEFAULT_EXECUTION_OPTIONS
} from './types';

export class PlanExecutor {
  private state: ExecutionState | null = null;
  private currentProcess: ChildProcess | null = null;
  private options: ExecutionOptions = DEFAULT_EXECUTION_OPTIONS;

  /**
   * Execute a full plan
   */
  async execute(plan: Plan, options?: Partial<ExecutionOptions>): Promise<PlanExecutionResult> {
    this.options = { ...DEFAULT_EXECUTION_OPTIONS, ...options };

    // Initialize state
    this.state = {
      planId: plan.id,
      status: 'preparing',
      currentPhaseIndex: 0,
      currentStepIndex: 0,
      results: null,
      startTime: Date.now()
    };

    const phaseResults: PhaseExecutionResult[] = [];
    let totalTokens = { input: 0, output: 0 };
    let totalCost = 0;
    let completedSteps = 0;
    let failedSteps = 0;

    try {
      this.state.status = 'executing';

      for (let i = 0; i < plan.phases.length; i++) {
        this.state.currentPhaseIndex = i;
        const phase = plan.phases[i];

        const phaseResult = await this.executePhase(plan, phase, i);
        phaseResults.push(phaseResult);

        // Aggregate stats
        for (const stepResult of phaseResult.stepResults) {
          if (stepResult.success) completedSteps++;
          else failedSteps++;

          if (stepResult.tokensUsed) {
            totalTokens.input += stepResult.tokensUsed.input;
            totalTokens.output += stepResult.tokensUsed.output;
          }
          if (stepResult.cost) totalCost += stepResult.cost;
        }

        // Stop on error if configured
        if (!phaseResult.success && this.options.stopOnError) {
          break;
        }

        this.options.onPhaseComplete?.(phaseResult);
      }

      this.state.status = failedSteps === 0 ? 'completed' : 'failed';

    } catch (error) {
      this.state.status = 'failed';
      this.state.error = error instanceof Error ? error.message : 'Unknown error';
    }

    const result: PlanExecutionResult = {
      planId: plan.id,
      success: failedSteps === 0,
      phaseResults,
      startTime: this.state.startTime!,
      endTime: Date.now(),
      totalSteps: plan.totalSteps,
      completedSteps,
      failedSteps,
      totalTokens,
      totalCost,
      summary: this.buildSummary(completedSteps, failedSteps, plan.totalSteps)
    };

    this.state.results = result;
    return result;
  }

  /**
   * Execute a single step (for step-by-step mode)
   */
  async executeSingleStep(
    plan: Plan,
    phase: PlanPhase,
    step: PlanStep,
    options?: Partial<ExecutionOptions>
  ): Promise<StepExecutionResult> {
    this.options = { ...DEFAULT_EXECUTION_OPTIONS, ...options };
    if (!this.state) {
      this.state = {
        planId: plan.id,
        status: 'executing',
        currentPhaseIndex: 0,
        currentStepIndex: 0,
        results: null,
        startTime: Date.now()
      };
    }
    return this.executeStep(plan, phase, step);
  }

  /**
   * Execute a single phase
   */
  private async executePhase(plan: Plan, phase: PlanPhase, phaseIndex: number): Promise<PhaseExecutionResult> {
    const stepResults: StepExecutionResult[] = [];
    const startTime = Date.now();

    for (let i = 0; i < phase.steps.length; i++) {
      this.state!.currentStepIndex = i;
      const step = phase.steps[i];

      this.options.onStepStart?.(step);

      const stepResult = await this.executeStep(plan, phase, step);
      stepResults.push(stepResult);

      this.options.onStepComplete?.(stepResult);

      if (!stepResult.success && this.options.stopOnError) {
        break;
      }
    }

    const success = stepResults.every(r => r.success);

    return {
      phaseId: phase.id,
      success,
      stepResults,
      startTime,
      endTime: Date.now(),
      summary: `Phase ${phaseIndex + 1}: ${stepResults.filter(r => r.success).length}/${stepResults.length} steps completed`
    };
  }

  /**
   * Execute a single step
   */
  private async executeStep(plan: Plan, phase: PlanPhase, step: PlanStep): Promise<StepExecutionResult> {
    const startTime = Date.now();

    if (this.options.dryRun) {
      return {
        stepId: step.id,
        success: true,
        output: '[DRY RUN] Step would execute: ' + step.description,
        filesChanged: step.files,
        startTime,
        endTime: Date.now()
      };
    }

    try {
      // Build the prompt
      const prompt = this.buildStepPrompt(plan, phase, step);

      // Execute via configured agent
      const output = await this.runAgent(prompt);

      return {
        stepId: step.id,
        success: true,
        output,
        filesChanged: step.files,
        startTime,
        endTime: Date.now()
      };

    } catch (error) {
      return {
        stepId: step.id,
        success: false,
        output: '',
        error: error instanceof Error ? error.message : 'Unknown error',
        filesChanged: [],
        startTime,
        endTime: Date.now()
      };
    }
  }

  /**
   * Build prompt for a step
   */
  private buildStepPrompt(plan: Plan, phase: PlanPhase, step: PlanStep): ExecutionPrompt {
    const sectorRules = plan.primarySector.rules;

    const systemPrompt = `You are executing a planned code change.

SECTOR: ${plan.primarySector.name}
RULES:
${sectorRules}

Execute the step exactly as described. Make only the changes specified.
Do not add extra features or refactoring beyond the scope.`;

    const userPrompt = `PHASE: ${phase.title}
STEP: ${step.description}

RATIONALE: ${step.rationale}

FILES TO MODIFY:
${step.files.map(f => `- ${f}`).join('\n')}

CHANGE TYPE: ${step.changeType}

Execute this step now.`;

    return {
      systemPrompt,
      userPrompt,
      contextFiles: step.files
    };
  }

  /**
   * Run the configured agent
   */
  private async runAgent(prompt: ExecutionPrompt): Promise<string> {
    switch (this.options.agent) {
      case 'claude-cli':
        return this.runClaudeCli(prompt);
      default:
        throw new Error(`Agent ${this.options.agent} not implemented`);
    }
  }

  /**
   * Run Claude CLI
   */
  private runClaudeCli(prompt: ExecutionPrompt): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = [
        '--print',
        '--dangerously-skip-permissions',
        prompt.userPrompt
      ];

      const proc = spawn('claude', args, {
        cwd: process.cwd(),
        env: process.env
      });

      let output = '';
      let error = '';

      proc.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString();
        output += chunk;
        this.options.onOutput?.(chunk);
      });

      proc.stderr.on('data', (data: Buffer) => {
        error += data.toString();
      });

      proc.on('close', (code: number | null) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(error || `Claude CLI exited with code ${code}`));
        }
      });

      proc.on('error', (err: Error) => {
        reject(err);
      });

      this.currentProcess = proc;

      // Timeout
      setTimeout(() => {
        if (this.currentProcess === proc) {
          proc.kill();
          reject(new Error('Step execution timed out'));
        }
      }, this.options.timeoutPerStep);
    });
  }

  /**
   * Pause execution
   */
  pause(): void {
    if (this.state && this.state.status === 'executing') {
      this.state.status = 'paused';
      this.state.pausedAt = Date.now();
    }
  }

  /**
   * Cancel execution
   */
  cancel(): void {
    if (this.currentProcess) {
      this.currentProcess.kill();
      this.currentProcess = null;
    }
    if (this.state) {
      this.state.status = 'cancelled';
    }
  }

  /**
   * Get current state
   */
  getState(): ExecutionState | null {
    return this.state;
  }

  /**
   * Build summary message
   */
  private buildSummary(completed: number, failed: number, total: number): string {
    if (failed === 0) {
      return `Execution complete: ${completed}/${total} steps succeeded.`;
    }
    return `Execution finished with errors: ${completed} succeeded, ${failed} failed out of ${total} steps.`;
  }
}
