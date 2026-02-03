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
 * Plan history action types
 */
export type PlanHistoryAction =
  | 'created'
  | 'approved'
  | 'executed'
  | 'verified'
  | 'failed'
  | 'cancelled'
  | 'issue_created'
  | 'pr_created'
  | 'compared';

/**
 * Plan history entry
 */
export interface PlanHistoryEntry {
  planId: string;
  action: PlanHistoryAction;
  timestamp: number;
  details?: string | Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Planning Mode Types (Workstream A.1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Planning phases (4-phase flow: Study → Connect → Plan → Review)
 */
export type PlanningPhase = 'study' | 'connect' | 'plan' | 'review';

/**
 * Planning phase configuration
 */
export interface PlanningPhaseConfig {
  id: PlanningPhase;
  name: string;
  leadPersona: 'nova' | 'gears' | 'index';
  supportPersona?: 'nova' | 'gears' | 'index';
  description: string;
  checklist: string[];
  tools: string[];
}

/**
 * Planning phase state during a session
 */
export interface PlanningPhaseState {
  phase: PlanningPhase;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  startedAt?: number;
  completedAt?: number;
  checklistCompleted: boolean[];
  notes: string[];
  outputs: {
    requirements?: string[];
    touchPoints?: string[];
    affectedFiles?: string[];
    risks?: Array<{ level: 'low' | 'medium' | 'high'; description: string }>;
  };
}

/**
 * Planning session - tracks a complete planning workflow
 */
export interface PlanningSession {
  id: string;
  feature: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  status: 'active' | 'completed' | 'cancelled';

  /** Current phase */
  currentPhase: PlanningPhase;

  /** State for each phase */
  phases: {
    study: PlanningPhaseState;
    connect: PlanningPhaseState;
    plan: PlanningPhaseState;
    review: PlanningPhaseState;
  };

  /** Growing list of affected files discovered during analysis */
  affectedFiles: Array<{
    path: string;
    action: 'create' | 'modify' | 'delete';
    discoveredInPhase: PlanningPhase;
  }>;

  /** Risk assessment summary */
  riskAssessment: {
    overall: 'low' | 'medium' | 'high' | 'critical';
    items: Array<{
      level: 'low' | 'medium' | 'high' | 'critical';
      description: string;
      mitigation?: string;
    }>;
  };

  /** Generated implementation plan (after Plan phase) */
  implementationPlan?: Plan;

  /** Context from GDD check */
  gddContext?: string;

  /** Context from SA check */
  saContext?: string;
}

/**
 * Planning gate - approval checkpoint
 */
export interface PlanningGate {
  id: string;
  phase: PlanningPhase;
  name: string;
  criteria: string;
  owner: 'nova' | 'gears' | 'index' | 'user';
  required: boolean;
  status: 'pending' | 'passed' | 'failed' | 'waived';
  checkedAt?: number;
  checkedBy?: string;
  notes?: string;
}

/**
 * Planning mode state for the UI
 */
export interface PlanningModeState {
  isActive: boolean;
  session?: PlanningSession;
  gates: PlanningGate[];
  canSkipToPhase: PlanningPhase | null;
  showPanel: boolean;
}

/**
 * Reuse candidate - found during "Reuse Before Create" check
 */
export interface ReuseCandidate {
  file: string;
  symbol: string;
  type: 'function' | 'class' | 'interface' | 'constant';
  description: string;
  similarity: number;
  canExtend: boolean;
  canParameterize: boolean;
  reason?: string;
}

/**
 * Reuse check result
 */
export interface ReuseCheckResult {
  query: string;
  candidates: ReuseCandidate[];
  recommendation: 'reuse' | 'extend' | 'create';
  reasoning: string;
}
