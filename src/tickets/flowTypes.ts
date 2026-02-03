/**
 * Ticket Flow Types
 *
 * Extended types for the Ticket → Code Flow system.
 */

import { Ticket, TicketStatus } from './types';
import { Sector } from '../sectors/SectorConfig';

/**
 * Source of the ticket
 */
export type TicketSource = 'local' | 'github' | 'jira' | 'linear';

/**
 * Label from external system
 */
export interface TicketLabel {
  name: string;
  color?: string;
}

/**
 * Extended ticket payload with full metadata
 */
export interface TicketPayload extends Ticket {
  // Source info
  source: TicketSource;
  externalId?: string;
  externalUrl?: string;

  // Content
  body: string;
  labels: TicketLabel[];

  // References
  linkedFiles: string[];
  mentionedPaths: string[];
  referencedIssues: string[];

  // GitHub-specific
  pullRequestNumber?: number;
  assignee?: string;
  milestone?: string;

  // Parsed metadata
  domainKeywords: string[];
  intent?: TicketIntent;
}

/**
 * Detected intent from ticket
 */
export type TicketIntent =
  | 'bugfix'
  | 'feature'
  | 'refactor'
  | 'docs'
  | 'test'
  | 'chore'
  | 'unknown';

/**
 * Sector detection result
 */
export interface SectorDetection {
  sector: Sector;
  confidence: number; // 0-1
  signals: SectorSignal[];
}

/**
 * Signal that contributed to sector detection
 */
export interface SectorSignal {
  type: 'path' | 'asmdef' | 'label' | 'keyword';
  value: string;
  sectorId: string;
}

/**
 * Context assembled for a ticket
 */
export interface TicketContext {
  ticket: TicketPayload;
  detectedSectors: SectorDetection[];
  primarySector: Sector;
  kbScope?: string[];
  relevantFiles: RelevantFile[];
  priorHistory?: PriorTicketHistory[];
  tokenBudget: number;
}

/**
 * Relevant file for context
 */
export interface RelevantFile {
  path: string;
  reason: 'explicit-mention' | 'similarity' | 'recency' | 'dependency';
  score: number;
}

/**
 * Prior ticket history for the same area
 */
export interface PriorTicketHistory {
  ticketId: string;
  title: string;
  outcome: 'success' | 'failed' | 'partial';
  summary?: string;
}

/**
 * Plan step for ticket execution
 */
export interface TicketPlanStep {
  id: string;
  title: string;
  description: string;
  targetFiles: string[];
  sector?: string;
  estimatedTokens: number;
  dependencies: string[];
  priority: number;
}

/**
 * Execution plan for a ticket
 */
export interface TicketPlan {
  id: string;
  ticketId: string;
  title: string;
  steps: TicketPlanStep[];
  totalEstimatedTokens: number;
  requiresSwarm: boolean;
  createdAt: Date;
  approvedAt?: Date;
}

/**
 * Execution record for a ticket
 */
export interface TicketExecutionRecord {
  id: string;
  ticketId: string;
  planId: string;
  status: ExecutionStatus;
  startedAt: Date;
  completedAt?: Date;
  stepsCompleted: string[];
  stepsFailed: string[];
  filesModified: string[];
  verification?: VerificationSummary;
  diffSummary?: string;
  tokensUsed: number;
  duration: number;
}

/**
 * Execution status
 */
export type ExecutionStatus =
  | 'pending'
  | 'running'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Verification summary
 */
export interface VerificationSummary {
  passed: boolean;
  checks: {
    name: string;
    passed: boolean;
    message?: string;
  }[];
  blockers?: string[];
}

/**
 * Auto-close decision
 */
export interface AutoCloseDecision {
  shouldClose: boolean;
  reason: AutoCloseReason;
  blocked?: string;
}

/**
 * Reason for auto-close decision
 */
export type AutoCloseReason =
  | 'plan-completed-verified'
  | 'pr-merged-fixes'
  | 'manual-override'
  | 'verification-failed'
  | 'execution-failed'
  | 'pending';

/**
 * Label → Sector mapping configuration
 */
export interface LabelSectorMapping {
  label: string; // Can be exact or pattern (e.g., "bug", "ui/*")
  sectorId: string;
  priority: number; // Higher = more specific
}

/**
 * Domain keyword → KB scope mapping
 */
export interface DomainKeywordMapping {
  keywords: string[];
  kbScope: string;
  agentType?: string;
}

/**
 * Ticket flow configuration
 */
export interface TicketFlowConfig {
  labelMappings: LabelSectorMapping[];
  domainMappings: DomainKeywordMapping[];
  fallbackSector: string;
  autoCloseEnabled: boolean;
  requireVerification: boolean;
  swarmThreshold: number; // Number of sectors to trigger swarm mode
}

/**
 * Default ticket flow configuration
 */
export const DEFAULT_TICKET_FLOW_CONFIG: TicketFlowConfig = {
  labelMappings: [
    { label: 'bug', sectorId: 'yard', priority: 1 },
    { label: 'ui', sectorId: 'ui', priority: 2 },
    { label: 'editor', sectorId: 'editor', priority: 2 },
    { label: 'combat', sectorId: 'combat', priority: 2 },
    { label: 'inventory', sectorId: 'inventory', priority: 2 },
    { label: 'quest', sectorId: 'quest', priority: 2 },
    { label: 'ai', sectorId: 'ai', priority: 2 },
    { label: 'persistence', sectorId: 'persistence', priority: 2 },
    { label: 'core', sectorId: 'core', priority: 3 },
  ],
  domainMappings: [
    { keywords: ['spine', 'skeleton', 'animation'], kbScope: 'spine', agentType: 'spine-specialist' },
    { keywords: ['shader', 'material', 'render'], kbScope: 'shaders', agentType: 'shader-specialist' },
    { keywords: ['database', 'sql', 'persistence'], kbScope: 'database' },
    { keywords: ['ui toolkit', 'uitk', 'visual element'], kbScope: 'ui-toolkit' },
  ],
  fallbackSector: 'yard',
  autoCloseEnabled: true,
  requireVerification: true,
  swarmThreshold: 2,
};
