/**
 * Swarm Coordinator Types
 *
 * Type definitions for the Swarm Mode parallel execution system.
 */

import * as vscode from 'vscode';

/**
 * Plan step from PlanGenerator
 */
export interface PlanStep {
  id: string;
  title: string;
  description: string;
  targetFiles: string[];
  sector?: string;
  module?: string;
  dependencies?: string[]; // IDs of steps this depends on
  estimatedTokens?: number;
  priority?: number;
}

/**
 * Approved execution plan
 */
export interface ApprovedPlan {
  id: string;
  ticketId?: string;
  title: string;
  steps: PlanStep[];
  totalEstimatedTokens: number;
  createdAt: Date;
  approvedAt: Date;
}

/**
 * Worker status in the swarm
 */
export type WorkerStatus =
  | 'idle'
  | 'assigned'
  | 'working'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'cancelled';

/**
 * Worker instance in the swarm
 */
export interface SwarmWorker {
  id: string;
  name: string;
  status: WorkerStatus;
  assignedStep?: PlanStep;
  targetFiles: string[];
  startedAt?: Date;
  completedAt?: Date;
  progress: number; // 0-100
  logs: WorkerLog[];
  result?: WorkerResult;
  error?: string;
}

/**
 * Worker log entry
 */
export interface WorkerLog {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  data?: any;
}

/**
 * Worker execution result
 */
export interface WorkerResult {
  success: boolean;
  filesModified: string[];
  diff?: string;
  verification?: VerificationResult;
  tokensUsed: number;
  duration: number; // ms
}

/**
 * Verification result for a work block
 */
export interface VerificationResult {
  passed: boolean;
  checks: {
    name: string;
    passed: boolean;
    message?: string;
  }[];
}

/**
 * Work block - a unit of work assigned to a worker
 */
export interface WorkBlock {
  id: string;
  stepId: string;
  files: string[];
  sector?: string;
  context: WorkBlockContext;
  status: 'pending' | 'assigned' | 'completed' | 'failed';
  assignedWorkerId?: string;
  dependencies: string[]; // IDs of work blocks this depends on
  retries?: number; // Number of retry attempts
}

/**
 * Context payload for a work block
 */
export interface WorkBlockContext {
  prompt: string;
  policySlice: string;
  relevantCode: string[];
  kbContext?: string;
  sharedState?: Record<string, any>;
}

/**
 * Swarm coordinator status
 */
export type SwarmStatus =
  | 'idle'
  | 'planning'
  | 'executing'
  | 'paused'
  | 'merging'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Swarm execution state
 */
export interface SwarmState {
  status: SwarmStatus;
  plan?: ApprovedPlan;
  workBlocks: WorkBlock[];
  workers: SwarmWorker[];
  completedBlocks: string[];
  failedBlocks: string[];
  startedAt?: Date;
  completedAt?: Date;
  progress: number; // 0-100
  conflicts: MergeConflict[];
}

/**
 * Merge conflict when combining worker outputs
 */
export interface MergeConflict {
  file: string;
  workerA: string;
  workerB: string;
  conflictType: 'overlapping-edit' | 'dependency-mismatch' | 'semantic-conflict';
  resolution?: 'use-a' | 'use-b' | 'merge' | 'manual';
  resolved: boolean;
}

/**
 * Swarm coordinator configuration
 */
export interface SwarmConfig {
  maxWorkers: number;
  progressUpdateInterval: number; // ms
  verifyBeforeMerge: boolean;
  allowConcurrentFileEdits: boolean; // Usually false
  retryFailedBlocks: boolean;
  maxRetries: number;
}

/**
 * Events emitted by the swarm coordinator
 */
export interface SwarmEvents {
  onStatusChange: vscode.Event<SwarmStatus>;
  onWorkerUpdate: vscode.Event<SwarmWorker>;
  onProgress: vscode.Event<number>;
  onBlockCompleted: vscode.Event<WorkBlock>;
  onConflict: vscode.Event<MergeConflict>;
  onComplete: vscode.Event<SwarmState>;
  onError: vscode.Event<Error>;
}

/**
 * Dependency graph node
 */
export interface DependencyNode {
  id: string;
  dependencies: string[];
  dependents: string[];
  depth: number; // Topological depth for ordering
}

/**
 * File lock for preventing concurrent edits
 */
export interface FileLock {
  file: string;
  workerId: string;
  acquiredAt: Date;
}
