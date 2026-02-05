/**
 * Engineer Types
 *
 * Core interfaces for the Station Engineer system.
 * Proactive project-aware assistant with suggest-only model.
 */

export type HealthStatus = 'ok' | 'warn' | 'critical';
export type RiskLevel = 'low' | 'med' | 'high';
export type ConfidenceLevel = 'low' | 'med' | 'high';
export type SuggestionSource = 'rule' | 'ai';
export type ActionType = 'inspect' | 'plan' | 'validate' | 'document' | 'refactor';
export type Decision = 'accepted' | 'deferred' | 'dismissed';
export type UserAction = 'run' | 'open' | 'defer' | 'dismiss';

export type DelegateRole =
  | 'architect'
  | 'modularity-lead'
  | 'verifier'
  | 'doc-officer'
  | 'planner'
  | 'release-captain';

export interface Suggestion {
  id: string;
  title: string;
  why: string;
  source: SuggestionSource;
  risk: RiskLevel;
  confidence: ConfidenceLevel;
  score: number;
  sectorId?: string;
  actionType: ActionType;
  delegateTo?: DelegateRole;
  createdAt: string;
  /** Trigger rule ID that generated this suggestion */
  triggerId?: string;
}

export interface HistoryEntry {
  suggestionId: string;
  title: string;
  decision: Decision;
  decidedAt: string;
}

export interface EngineerState {
  lastScanAt: string;
  healthStatus: HealthStatus;
  activeSuggestions: Suggestion[];
  history: HistoryEntry[];
  /** suggestionId → dismissedAt ISO timestamp (24h cooldown) */
  dismissed: Record<string, string>;
}

/** Scoring factor weights */
export interface ScoringFactors {
  risk: number;    // 1-5
  impact: number;  // 1-5
  urgency: number; // 1-5
  effort: number;  // 1-5
}

/** Rule trigger result */
export interface TriggerResult {
  triggerId: string;
  title: string;
  why: string;
  risk: RiskLevel;
  confidence: ConfidenceLevel;
  factors: ScoringFactors;
  sectorId?: string;
  actionType: ActionType;
  delegateTo?: DelegateRole;
}

/** Context passed to rule triggers for evaluation */
export interface TriggerContext {
  /** Workspace root path */
  workspaceDir: string;
  /** Recent git diff output (staged + unstaged) */
  gitDiff?: string;
  /** Recent git changed files */
  changedFiles?: string[];
  /** Sector IDs that have been configured */
  sectorIds?: string[];
  /** Whether sectors are available */
  sectorsAvailable: boolean;
  /** Recent test/build output */
  testOutput?: string;
  /** Whether tests are currently failing */
  testsFailing?: boolean;
  /** Orphan file count from sector scan */
  orphanFileCount?: number;
  /** Sector violations from scan */
  violations?: Array<{ sectorId: string; file: string; message: string }>;
  /** Files that lack documentation */
  undocumentedFiles?: string[];
  /** Whether asmdef policy was recently modified */
  policyChanged?: boolean;
}

/** Webview message types (Extension → Webview) */
export interface EngineerStatusMessage {
  type: 'engineerStatus';
  health: HealthStatus;
  alertCount: number;
  topAction: string;
}

export interface EngineerSuggestionsMessage {
  type: 'engineerSuggestions';
  suggestions: Suggestion[];
}

export interface EngineerHistoryMessage {
  type: 'engineerHistory';
  history: HistoryEntry[];
}

export interface EngineerPromptMessage {
  type: 'engineerPrompt';
  message: string;
  actions: string[];
  suggestionId?: string;
}

/** Default empty state */
export const DEFAULT_ENGINEER_STATE: EngineerState = {
  lastScanAt: '',
  healthStatus: 'ok',
  activeSuggestions: [],
  history: [],
  dismissed: {},
};

/** 24 hours in milliseconds */
export const DISMISSAL_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** Maximum history entries (FIFO eviction) */
export const MAX_HISTORY_ENTRIES = 100;

/** Maximum AI suggestions per scan */
export const MAX_AI_SUGGESTIONS = 3;

/** Score threshold below which suggestions are hidden by default */
export const LOW_SCORE_THRESHOLD = 5;
