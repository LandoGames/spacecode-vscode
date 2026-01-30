/**
 * Planning Module Types
 *
 * Defines data structures for the plan-first development workflow.
 * Plans are generated from user intent and broken into executable steps.
 */

import { ProviderId } from '../shared/types';

/**
 * Priority level for a step
 */
export type StepPriority = 'critical' | 'high' | 'medium' | 'low';

/**
 * Status of a plan, phase, or step
 */
export type PlanStatus = 'draft' | 'approved' | 'executing' | 'verifying' | 'done' | 'failed' | 'blocked';

/**
 * Type of change a step makes
 */
export type ChangeType = 'create' | 'modify' | 'delete' | 'refactor' | 'test' | 'config';

/**
 * A single step within a phase
 */
export interface PlanStep {
  id: string;
  description: string;
  rationale: string;
  files: string[];
  changeType: ChangeType;
  priority: StepPriority;
  agent: ProviderId | 'mastermind';
  status: PlanStatus;
  estimatedComplexity: 'trivial' | 'simple' | 'moderate' | 'complex';

  // Execution results (populated after execution)
  diff?: string;
  error?: string;
  executedAt?: number;
}

/**
 * A phase groups related steps together
 */
export interface PlanPhase {
  id: string;
  title: string;
  description: string;
  steps: PlanStep[];
  status: PlanStatus;

  // Dependencies
  dependsOn?: string[]; // Phase IDs that must complete first
}

/**
 * Sector information for the plan
 */
export interface PlanSector {
  id: string;
  name: string;
  rules: string;
  docTarget?: string;
}

/**
 * Impact analysis for a plan
 */
export interface PlanImpact {
  sectorsAffected: string[];
  filesAffected: string[];
  dependenciesAffected: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  warnings: string[];
}

/**
 * A complete plan generated from user intent
 */
export interface Plan {
  id: string;
  intent: string;
  summary: string;

  // Sector context
  primarySector: PlanSector;
  secondarySectors: PlanSector[];

  // Structure
  phases: PlanPhase[];

  // Impact
  impact: PlanImpact;

  // Metadata
  status: PlanStatus;
  createdAt: number;
  updatedAt: number;
  approvedAt?: number;
  executedAt?: number;
  verifiedAt?: number;

  // Tracking
  totalSteps: number;
  completedSteps: number;
}

/**
 * Request to generate a plan
 */
export interface PlanGenerationRequest {
  intent: string;
  currentSector?: string;
  currentFile?: string;
  contextPack?: string;
  constraints?: string[];
}

/**
 * Options for plan generation
 */
export interface PlanGenerationOptions {
  provider: ProviderId;
  model?: string;
  maxPhases?: number;
  maxStepsPerPhase?: number;
  includeTests?: boolean;
  includeDocumentation?: boolean;
}

/**
 * Result of plan generation
 */
export interface PlanGenerationResult {
  success: boolean;
  plan?: Plan;
  error?: string;
  tokensUsed?: {
    input: number;
    output: number;
  };
  cost?: number;
}

/**
 * Template for common plan types
 */
export interface PlanTemplate {
  id: string;
  name: string;
  description: string;
  category: 'feature' | 'bugfix' | 'refactor' | 'test' | 'docs' | 'config';
  promptTemplate: string;
  defaultPhases: Omit<PlanPhase, 'id' | 'status'>[];
}

/**
 * Plan storage format for persistence
 */
export interface StoredPlan {
  plan: Plan;
  version: number;
  checksum: string;
}

/**
 * Plan history entry
 */
export interface PlanHistoryEntry {
  planId: string;
  action: 'created' | 'approved' | 'executed' | 'verified' | 'failed' | 'cancelled';
  timestamp: number;
  details?: string;
}
