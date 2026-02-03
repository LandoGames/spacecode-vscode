/**
 * Execution Module Types
 *
 * Types for executing plans via Claude Code CLI or other agents.
 */

import { PlanStep } from '../planning/types';

/**
 * Agent that can execute steps
 */
export type ExecutionAgent = 'claude-cli' | 'claude-api' | 'gpt-api';

/**
 * Status of execution
 */
export type ExecutionStatus =
  | 'preparing'
  | 'executing'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Options for plan execution
 */
export interface ExecutionOptions {
  /** Which agent to use */
  agent: ExecutionAgent;

  /** Stop execution on first error */
  stopOnError: boolean;

  /** Dry run - don't actually execute, just simulate */
  dryRun: boolean;

  /** Timeout per step in milliseconds */
  timeoutPerStep: number;

  /** Callback when a step starts */
  onStepStart?: (step: PlanStep) => void;

  /** Callback when a step completes */
  onStepComplete?: (result: StepExecutionResult) => void;

  /** Callback when a phase completes */
  onPhaseComplete?: (result: PhaseExecutionResult) => void;

  /** Callback for live output from the agent */
  onOutput?: (chunk: string) => void;
}

/**
 * Default execution options
 */
export const DEFAULT_EXECUTION_OPTIONS: ExecutionOptions = {
  agent: 'claude-cli',
  stopOnError: true,
  dryRun: false,
  timeoutPerStep: 300000, // 5 minutes
};

/**
 * Current state of execution
 */
export interface ExecutionState {
  planId: string;
  status: ExecutionStatus;
  currentPhaseIndex: number;
  currentStepIndex: number;
  startTime?: number;
  pausedAt?: number;
  error?: string;
  results: PlanExecutionResult | null;
}

/**
 * Result of executing a single step
 */
export interface StepExecutionResult {
  stepId: string;
  success: boolean;
  output: string;
  error?: string;
  filesChanged: string[];
  startTime: number;
  endTime: number;
  tokensUsed?: {
    input: number;
    output: number;
  };
  cost?: number;
}

/**
 * Result of executing a phase
 */
export interface PhaseExecutionResult {
  phaseId: string;
  success: boolean;
  stepResults: StepExecutionResult[];
  startTime: number;
  endTime: number;
  summary: string;
}

/**
 * Result of executing a full plan
 */
export interface PlanExecutionResult {
  planId: string;
  success: boolean;
  phaseResults: PhaseExecutionResult[];
  startTime: number;
  endTime: number;
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  totalTokens: {
    input: number;
    output: number;
  };
  totalCost: number;
  summary: string;
}

/**
 * Prompt structure for agent execution
 */
export interface ExecutionPrompt {
  systemPrompt: string;
  userPrompt: string;
  contextFiles: string[];
}
