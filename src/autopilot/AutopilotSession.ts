/**
 * Autopilot Session Persistence
 *
 * Saves and restores autopilot state to `.spacecode/autopilot-session.json`.
 * Enables recovery from extension restarts and crashes.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  AutopilotSessionData,
  AutopilotState,
  AutopilotStepResult,
  AutopilotEvent,
  DEFAULT_AUTOPILOT_STATE,
} from './AutopilotTypes';

export class AutopilotSession {
  private _workspaceDir: string;
  private _sessionPath: string;
  private _state: AutopilotState;
  private _stepResults: AutopilotStepResult[] = [];
  private _events: AutopilotEvent[] = [];

  constructor(workspaceDir: string) {
    this._workspaceDir = workspaceDir;
    this._sessionPath = path.join(workspaceDir, '.spacecode', 'autopilot-session.json');
    this._state = { ...DEFAULT_AUTOPILOT_STATE };
  }

  /** Get current state */
  getState(): AutopilotState {
    return this._state;
  }

  /** Set state (used by engine) */
  setState(state: AutopilotState): void {
    this._state = state;
  }

  /** Get step results */
  getStepResults(): AutopilotStepResult[] {
    return this._stepResults;
  }

  /** Add a step result */
  addStepResult(result: AutopilotStepResult): void {
    this._stepResults.push(result);
  }

  /** Add an event */
  addEvent(event: AutopilotEvent): void {
    this._events.push(event);
    // Keep last 200 events
    if (this._events.length > 200) {
      this._events = this._events.slice(-200);
    }
  }

  /** Get events */
  getEvents(): AutopilotEvent[] {
    return this._events;
  }

  /** Save session to disk */
  save(): void {
    if (!this._state.planId) return;

    try {
      const dir = path.dirname(this._sessionPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const data: AutopilotSessionData = {
        version: 1,
        planId: this._state.planId,
        state: this._state,
        stepResults: this._stepResults,
        events: this._events,
        savedAt: Date.now(),
      };

      fs.writeFileSync(this._sessionPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch { /* ignore write errors */ }
  }

  /** Load session from disk (returns true if session found) */
  load(): boolean {
    try {
      if (!fs.existsSync(this._sessionPath)) return false;

      const raw = fs.readFileSync(this._sessionPath, 'utf-8');
      const data: AutopilotSessionData = JSON.parse(raw);

      if (data.version !== 1) return false;

      this._state = data.state;
      this._stepResults = data.stepResults || [];
      this._events = data.events || [];

      return true;
    } catch {
      return false;
    }
  }

  /** Check if there's an interrupted session */
  hasInterruptedSession(): boolean {
    try {
      if (!fs.existsSync(this._sessionPath)) return false;

      const raw = fs.readFileSync(this._sessionPath, 'utf-8');
      const data: AutopilotSessionData = JSON.parse(raw);

      // Session is "interrupted" if it was running or paused
      return data.state.status === 'running' || data.state.status === 'paused' || data.state.status === 'pausing';
    } catch {
      return false;
    }
  }

  /** Get interrupted session info without fully loading */
  getInterruptedSessionInfo(): { planId: string; completedSteps: number; totalSteps: number; savedAt: number } | null {
    try {
      if (!fs.existsSync(this._sessionPath)) return null;

      const raw = fs.readFileSync(this._sessionPath, 'utf-8');
      const data: AutopilotSessionData = JSON.parse(raw);

      if (data.state.status !== 'running' && data.state.status !== 'paused' && data.state.status !== 'pausing') {
        return null;
      }

      return {
        planId: data.planId,
        completedSteps: data.state.completedSteps,
        totalSteps: data.state.totalSteps,
        savedAt: data.savedAt,
      };
    } catch {
      return null;
    }
  }

  /** Clear session file */
  clear(): void {
    try {
      if (fs.existsSync(this._sessionPath)) {
        fs.unlinkSync(this._sessionPath);
      }
    } catch { /* ignore */ }

    this._state = { ...DEFAULT_AUTOPILOT_STATE };
    this._stepResults = [];
    this._events = [];
  }

  /** Reset for new run */
  reset(planId: string, totalPhases: number, totalSteps: number, config: AutopilotState['config']): void {
    this._state = {
      ...DEFAULT_AUTOPILOT_STATE,
      planId,
      totalPhases,
      totalSteps,
      config,
      activeAgent: config.primaryAgent,
    };
    this._stepResults = [];
    this._events = [];
  }
}
