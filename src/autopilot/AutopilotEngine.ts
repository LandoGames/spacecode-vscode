// @ts-nocheck

/**
 * Autopilot Engine
 *
 * Autonomous plan execution with state machine, pause/resume,
 * retry with exponential backoff, and agent fallback.
 *
 * State machine: idle → running → pausing → paused → running → stopping → idle
 */

import { EventEmitter } from 'events';
import { Plan, PlanPhase, PlanStep } from '../planning/types';
import { PlanExecutor } from '../execution/PlanExecutor';
import { ExecutionAgent, StepExecutionResult } from '../execution/types';
import {
  AutopilotStatus,
  AutopilotState,
  AutopilotConfig,
  AutopilotStepResult,
  AutopilotEvent,
  AutopilotEventType,
  DEFAULT_AUTOPILOT_CONFIG,
  DEFAULT_AUTOPILOT_STATE,
} from './AutopilotTypes';
import { AutopilotSession } from './AutopilotSession';
import { evaluateError, sleep } from './ErrorStrategy';

const PAUSE_POLL_INTERVAL = 200; // ms

export class AutopilotEngine extends EventEmitter {
  private _session: AutopilotSession;
  private _executor: PlanExecutor;
  private _plan: Plan | null = null;
  private _abortController: AbortController | null = null;

  constructor(workspaceDir: string) {
    super();
    this._session = new AutopilotSession(workspaceDir);
    this._executor = new PlanExecutor();
  }

  /** Get current state */
  getState(): AutopilotState {
    return this._session.getState();
  }

  /** Get step results */
  getStepResults(): AutopilotStepResult[] {
    return this._session.getStepResults();
  }

  /** Get session */
  getSession(): AutopilotSession {
    return this._session;
  }

  /** Check for interrupted session */
  hasInterruptedSession(): boolean {
    return this._session.hasInterruptedSession();
  }

  /** Get interrupted session info */
  getInterruptedSessionInfo() {
    return this._session.getInterruptedSessionInfo();
  }

  /**
   * Start autopilot execution
   */
  async start(plan: Plan, config?: Partial<AutopilotConfig>): Promise<void> {
    const state = this._session.getState();
    if (state.status === 'running') {
      throw new Error('Autopilot is already running');
    }

    this._plan = plan;
    const cfg: AutopilotConfig = { ...DEFAULT_AUTOPILOT_CONFIG, ...config };
    this._abortController = new AbortController();

    // Calculate totals
    const totalPhases = plan.phases.length;
    const totalSteps = plan.phases.reduce((sum, p) => sum + p.steps.length, 0);

    // Reset session
    this._session.reset(plan.id, totalPhases, totalSteps, cfg);
    const newState = this._session.getState();
    newState.status = 'running';
    newState.startedAt = Date.now();
    this._session.setState(newState);
    this._session.save();

    this._emitEvent('autopilot:started', { planId: plan.id, totalPhases, totalSteps });

    // Run the main loop
    try {
      await this._runLoop();
    } catch (err: any) {
      const s = this._session.getState();
      if (s.status !== 'completed' && s.status !== 'idle') {
        s.status = 'failed';
        s.error = err?.message || 'Unknown error';
        this._session.setState(s);
        this._session.save();
        this._emitEvent('autopilot:failed', { error: s.error });
      }
    }
  }

  /**
   * Resume from interrupted session
   */
  async resume(plan: Plan): Promise<void> {
    const loaded = this._session.load();
    if (!loaded) {
      throw new Error('No session to resume');
    }

    this._plan = plan;
    this._abortController = new AbortController();

    const state = this._session.getState();
    state.status = 'running';
    this._session.setState(state);
    this._session.save();

    this._emitEvent('autopilot:resumed', { planId: plan.id });

    try {
      await this._runLoop();
    } catch (err: any) {
      const s = this._session.getState();
      if (s.status !== 'completed' && s.status !== 'idle') {
        s.status = 'failed';
        s.error = err?.message || 'Unknown error';
        this._session.setState(s);
        this._session.save();
        this._emitEvent('autopilot:failed', { error: s.error });
      }
    }
  }

  /**
   * Request pause (finishes current step first)
   */
  pause(): void {
    const state = this._session.getState();
    if (state.status === 'running') {
      state.status = 'pausing';
      this._session.setState(state);
    }
  }

  /**
   * Resume from paused state
   */
  unpause(): void {
    const state = this._session.getState();
    if (state.status === 'paused') {
      state.status = 'running';
      this._session.setState(state);
      this._emitEvent('autopilot:resumed');
    }
  }

  /**
   * Abort execution (finishes current step first)
   */
  abort(): void {
    const state = this._session.getState();
    if (state.status === 'running' || state.status === 'paused' || state.status === 'pausing') {
      state.status = 'stopping';
      this._session.setState(state);
      this._abortController?.abort();
    }
  }

  /**
   * Update configuration mid-run
   */
  updateConfig(config: Partial<AutopilotConfig>): void {
    const state = this._session.getState();
    state.config = { ...state.config, ...config };
    this._session.setState(state);
  }

  /**
   * Clear session and reset to idle
   */
  reset(): void {
    this._session.clear();
    this._plan = null;
    this._abortController = null;
  }

  // ─── Main Loop ─────────────────────────────────────────────────

  private async _runLoop(): Promise<void> {
    const plan = this._plan!;
    const state = this._session.getState();

    for (let pi = state.currentPhaseIndex; pi < plan.phases.length; pi++) {
      state.currentPhaseIndex = pi;
      this._session.setState(state);

      const phase = plan.phases[pi];
      const startStep = pi === state.currentPhaseIndex ? state.currentStepIndex : 0;

      for (let si = startStep; si < phase.steps.length; si++) {
        // Check for pause/abort
        await this._checkPauseAbort();

        const s = this._session.getState();
        if (s.status === 'stopping' || s.status === 'idle') {
          this._emitEvent('autopilot:aborted');
          s.status = 'idle';
          this._session.setState(s);
          this._session.save();
          return;
        }

        s.currentStepIndex = si;
        this._session.setState(s);

        const step = phase.steps[si];
        this._emitEvent('autopilot:step-start', {
          phase: pi,
          step: si,
          description: step.description,
        });

        // Execute step with retry logic
        const result = await this._executeStepWithRetry(plan, phase, step);

        // Record result
        this._session.addStepResult(result);
        const stateAfter = this._session.getState();
        stateAfter.lastStepAt = Date.now();

        if (result.skipped) {
          stateAfter.skippedSteps++;
          this._emitEvent('autopilot:step-skipped', { stepId: step.id });
        } else if (result.success) {
          stateAfter.completedSteps++;
          this._emitEvent('autopilot:step-complete', { stepId: step.id, result });
        } else {
          stateAfter.failedSteps++;
          this._emitEvent('autopilot:step-failed', { stepId: step.id, error: result.error });

          // If strategy resulted in abort
          if (stateAfter.status === 'stopping' || stateAfter.status === 'failed') {
            this._session.setState(stateAfter);
            this._session.save();
            return;
          }
        }

        this._session.setState(stateAfter);
        this._session.save();

        // Step delay (breathing room)
        if (stateAfter.config.stepDelayMs > 0) {
          await sleep(stateAfter.config.stepDelayMs);
        }
      }

      // Phase complete
      this._emitEvent('autopilot:phase-complete', { phase: pi });

      // Compact context between phases if configured
      // (Emitted as event; actual compaction done by handler)
      const statePhase = this._session.getState();
      if (statePhase.config.compactBetweenPhases && pi < plan.phases.length - 1) {
        this.emit('compact-requested', { phase: pi });
      }
    }

    // All done
    const finalState = this._session.getState();
    finalState.status = 'completed';
    this._session.setState(finalState);
    this._session.save();
    this._emitEvent('autopilot:complete', {
      completed: finalState.completedSteps,
      failed: finalState.failedSteps,
      skipped: finalState.skippedSteps,
    });
  }

  // ─── Step Execution with Retry ─────────────────────────────────

  private async _executeStepWithRetry(
    plan: Plan,
    phase: PlanPhase,
    step: PlanStep
  ): Promise<AutopilotStepResult> {
    const state = this._session.getState();
    let retries = 0;
    let agent = state.activeAgent;
    let wasFallback = state.usingFallback;

    while (true) {
      try {
        const rawResult = await this._executor.executeSingleStep(plan, phase, step, {
          agent,
          timeoutPerStep: state.config.stepTimeoutMs,
        });

        // Success — restore primary agent if we were on fallback
        if (wasFallback) {
          state.activeAgent = state.config.primaryAgent;
          state.usingFallback = false;
          this._session.setState(state);
        }

        return {
          ...rawResult,
          agent,
          retries,
          wasFallback,
          skipped: false,
        };
      } catch (err: any) {
        const errorMsg = err?.message || 'Unknown error';
        const decision = evaluateError(errorMsg, agent, retries, state.config);

        switch (decision.action) {
          case 'retry':
            retries++;
            state.currentRetry = retries;
            this._session.setState(state);
            await sleep(decision.waitMs);
            continue;

          case 'retry-fallback':
            agent = decision.agent;
            wasFallback = true;
            state.activeAgent = agent;
            state.usingFallback = true;
            this._session.setState(state);
            this._emitEvent('autopilot:agent-switched', { from: state.config.primaryAgent, to: agent });
            await sleep(decision.waitMs);
            retries++;
            continue;

          case 'skip':
            return {
              stepId: step.id,
              success: false,
              output: '',
              error: `Skipped: ${decision.reason}`,
              filesChanged: [],
              startTime: Date.now(),
              endTime: Date.now(),
              agent,
              retries,
              wasFallback,
              skipped: true,
            };

          case 'abort':
          default:
            state.status = 'failed';
            state.error = decision.reason;
            this._session.setState(state);
            return {
              stepId: step.id,
              success: false,
              output: '',
              error: decision.reason,
              filesChanged: [],
              startTime: Date.now(),
              endTime: Date.now(),
              agent,
              retries,
              wasFallback,
              skipped: false,
            };
        }
      }
    }
  }

  // ─── Pause/Abort Check ─────────────────────────────────────────

  private async _checkPauseAbort(): Promise<void> {
    const state = this._session.getState();

    if (state.status === 'pausing') {
      state.status = 'paused';
      this._session.setState(state);
      this._session.save();
      this._emitEvent('autopilot:paused');

      // Poll until unpaused or aborted
      while (true) {
        await sleep(PAUSE_POLL_INTERVAL);
        const current = this._session.getState();
        if (current.status !== 'paused') break;
      }
    }
  }

  // ─── Event Helpers ─────────────────────────────────────────────

  private _emitEvent(type: AutopilotEventType, data?: any): void {
    const event: AutopilotEvent = { type, timestamp: Date.now(), data };
    this._session.addEvent(event);
    this.emit(type, event);
    // Also emit generic event for UI updates
    this.emit('status-changed', this._session.getState());
  }
}

// ─── Singleton ─────────────────────────────────────────────────

let _engine: AutopilotEngine | null = null;

export function getAutopilotEngine(): AutopilotEngine | null {
  return _engine;
}

export function initAutopilotEngine(workspaceDir: string): AutopilotEngine {
  _engine = new AutopilotEngine(workspaceDir);
  return _engine;
}
