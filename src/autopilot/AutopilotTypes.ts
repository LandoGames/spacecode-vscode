/**
 * Autopilot Types
 *
 * Types for the autonomous plan execution engine.
 * State machine: idle → running → pausing → paused → running → stopping → idle
 */

import { ExecutionAgent, StepExecutionResult } from '../execution/types';

/** Autopilot state machine states */
export type AutopilotStatus =
  | 'idle'
  | 'running'
  | 'pausing'    // Pause requested, finishing current step
  | 'paused'     // Paused between steps
  | 'stopping'   // Abort requested, finishing current step
  | 'completed'
  | 'failed';

/** Error handling strategy */
export type ErrorStrategyType = 'retry' | 'skip' | 'abort';

/** Autopilot configuration */
export interface AutopilotConfig {
  /** Primary AI agent */
  primaryAgent: ExecutionAgent;
  /** Fallback agent when primary is rate-limited */
  fallbackAgent: ExecutionAgent | null;
  /** Error handling strategy */
  errorStrategy: ErrorStrategyType;
  /** Maximum retries per step */
  maxRetries: number;
  /** Base delay between retries in ms */
  retryBaseDelayMs: number;
  /** Delay between steps in ms (breathing room) */
  stepDelayMs: number;
  /** Timeout per step in ms */
  stepTimeoutMs: number;
  /** Auto-commit after each phase */
  autoCommitPerPhase: boolean;
  /** Compact context between phases */
  compactBetweenPhases: boolean;
}

/** Default autopilot configuration */
export const DEFAULT_AUTOPILOT_CONFIG: AutopilotConfig = {
  primaryAgent: 'claude-cli',
  fallbackAgent: 'gpt-api',
  errorStrategy: 'retry',
  maxRetries: 3,
  retryBaseDelayMs: 2000,
  stepDelayMs: 500,
  stepTimeoutMs: 300000, // 5 minutes
  autoCommitPerPhase: false,
  compactBetweenPhases: true,
};

/** Current autopilot state */
export interface AutopilotState {
  status: AutopilotStatus;
  planId: string | null;
  /** Current phase index (0-based) */
  currentPhaseIndex: number;
  /** Current step index within phase (0-based) */
  currentStepIndex: number;
  /** Total phases in plan */
  totalPhases: number;
  /** Total steps in plan */
  totalSteps: number;
  /** Steps completed successfully */
  completedSteps: number;
  /** Steps failed */
  failedSteps: number;
  /** Steps skipped */
  skippedSteps: number;
  /** Current retry attempt (0 = first try) */
  currentRetry: number;
  /** Active agent being used */
  activeAgent: ExecutionAgent;
  /** Whether using fallback agent */
  usingFallback: boolean;
  /** Start time */
  startedAt: number | null;
  /** Last step completion time */
  lastStepAt: number | null;
  /** Error message if failed */
  error: string | null;
  /** Configuration used */
  config: AutopilotConfig;
}

/** Default autopilot state */
export const DEFAULT_AUTOPILOT_STATE: AutopilotState = {
  status: 'idle',
  planId: null,
  currentPhaseIndex: 0,
  currentStepIndex: 0,
  totalPhases: 0,
  totalSteps: 0,
  completedSteps: 0,
  failedSteps: 0,
  skippedSteps: 0,
  currentRetry: 0,
  activeAgent: 'claude-cli',
  usingFallback: false,
  startedAt: null,
  lastStepAt: null,
  error: null,
  config: DEFAULT_AUTOPILOT_CONFIG,
};

/** Step result with autopilot metadata */
export interface AutopilotStepResult extends StepExecutionResult {
  /** Which agent executed this step */
  agent: ExecutionAgent;
  /** How many retries were needed */
  retries: number;
  /** Whether this was a fallback execution */
  wasFallback: boolean;
  /** Whether this step was skipped */
  skipped: boolean;
}

/** Autopilot event types */
export type AutopilotEventType =
  | 'autopilot:started'
  | 'autopilot:step-start'
  | 'autopilot:step-complete'
  | 'autopilot:step-failed'
  | 'autopilot:step-skipped'
  | 'autopilot:phase-complete'
  | 'autopilot:paused'
  | 'autopilot:resumed'
  | 'autopilot:agent-switched'
  | 'autopilot:complete'
  | 'autopilot:failed'
  | 'autopilot:aborted';

/** Autopilot event payload */
export interface AutopilotEvent {
  type: AutopilotEventType;
  timestamp: number;
  data?: any;
}

/** Session data for persistence */
export interface AutopilotSessionData {
  version: 1;
  planId: string;
  state: AutopilotState;
  stepResults: AutopilotStepResult[];
  events: AutopilotEvent[];
  savedAt: number;
}

/** Messages sent to webview */
export interface AutopilotStatusMessage {
  type: 'autopilotStatus';
  status: AutopilotStatus;
  planId: string | null;
  currentPhase: number;
  currentStep: number;
  totalPhases: number;
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  skippedSteps: number;
  activeAgent: string;
  usingFallback: boolean;
  error: string | null;
}

export interface AutopilotStepMessage {
  type: 'autopilotStepResult';
  result: AutopilotStepResult;
}

export interface AutopilotConfigMessage {
  type: 'autopilotConfig';
  config: AutopilotConfig;
}
