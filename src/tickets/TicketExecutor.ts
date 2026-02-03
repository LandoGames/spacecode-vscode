/**
 * Ticket Executor
 *
 * Executes ticket plans, tracks progress, and records outcomes.
 * Integrates with Swarm Coordinator for multi-sector work.
 */

import * as vscode from 'vscode';
import { TicketStorage } from './ticketStorage';
import { TicketStatus } from './types';
import {
  TicketContext,
  TicketPlan,
  TicketExecutionRecord,
  ExecutionStatus,
  VerificationSummary,
  AutoCloseDecision,
  AutoCloseReason,
  TicketFlowConfig,
  DEFAULT_TICKET_FLOW_CONFIG,
} from './flowTypes';
import { SwarmCoordinator, ApprovedPlan, PlanStep } from '../swarm';

/**
 * Ticket Executor - runs plans and tracks results
 */
export class TicketExecutor {
  private context: vscode.ExtensionContext | null = null;
  private ticketStorage: TicketStorage | null = null;
  private swarmCoordinator: SwarmCoordinator;
  private config: TicketFlowConfig;
  private activeExecution: TicketExecutionRecord | null = null;

  // Events
  private _onExecutionStart = new vscode.EventEmitter<TicketExecutionRecord>();
  private _onExecutionProgress = new vscode.EventEmitter<{ record: TicketExecutionRecord; progress: number }>();
  private _onExecutionComplete = new vscode.EventEmitter<TicketExecutionRecord>();
  private _onAutoCloseDecision = new vscode.EventEmitter<AutoCloseDecision>();

  readonly onExecutionStart = this._onExecutionStart.event;
  readonly onExecutionProgress = this._onExecutionProgress.event;
  readonly onExecutionComplete = this._onExecutionComplete.event;
  readonly onAutoCloseDecision = this._onAutoCloseDecision.event;

  constructor(config?: Partial<TicketFlowConfig>) {
    this.config = { ...DEFAULT_TICKET_FLOW_CONFIG, ...config };
    this.swarmCoordinator = new SwarmCoordinator();

    // Forward swarm events
    this.swarmCoordinator.onProgress(progress => {
      if (this.activeExecution) {
        this._onExecutionProgress.fire({ record: this.activeExecution, progress });
      }
    });
  }

  /**
   * Initialize the executor
   */
  initialize(extensionContext: vscode.ExtensionContext): void {
    this.context = extensionContext;
    this.ticketStorage = new TicketStorage(extensionContext);
    this.swarmCoordinator.initializeWorkers();
  }

  /**
   * Execute a plan for a ticket
   */
  async execute(ticketContext: TicketContext, plan: TicketPlan): Promise<TicketExecutionRecord> {
    if (this.activeExecution) {
      throw new Error('An execution is already in progress');
    }

    // Create execution record
    const record: TicketExecutionRecord = {
      id: this.generateExecutionId(),
      ticketId: ticketContext.ticket.id,
      planId: plan.id,
      status: 'pending',
      startedAt: new Date(),
      stepsCompleted: [],
      stepsFailed: [],
      filesModified: [],
      tokensUsed: 0,
      duration: 0,
    };

    this.activeExecution = record;
    this._onExecutionStart.fire(record);

    try {
      // Update ticket status
      await this.updateTicketStatus(ticketContext.ticket.id, 'in-progress');

      // Mark plan as approved
      plan.approvedAt = new Date();

      // Execute based on whether swarm is needed
      if (plan.requiresSwarm) {
        await this.executeWithSwarm(record, plan);
      } else {
        await this.executeSingleAgent(record, plan, ticketContext);
      }

      // Verification
      if (this.config.requireVerification) {
        record.status = 'verifying';
        record.verification = await this.runVerification(record);
      }

      // Determine final status
      if (record.stepsFailed.length > 0) {
        record.status = 'failed';
      } else if (record.verification && !record.verification.passed) {
        record.status = 'failed';
      } else {
        record.status = 'completed';
      }

      // Calculate duration
      record.completedAt = new Date();
      record.duration = record.completedAt.getTime() - record.startedAt.getTime();

      // Generate diff summary
      record.diffSummary = this.generateDiffSummary(record);

      // Handle auto-close
      const autoCloseDecision = this.evaluateAutoClose(record);
      this._onAutoCloseDecision.fire(autoCloseDecision);

      if (autoCloseDecision.shouldClose) {
        await this.updateTicketStatus(ticketContext.ticket.id, 'done');
      } else if (record.status === 'completed') {
        await this.updateTicketStatus(ticketContext.ticket.id, 'done');
      } else {
        // Revert to open on failure
        await this.updateTicketStatus(ticketContext.ticket.id, 'open');
      }

      this._onExecutionComplete.fire(record);
      return record;

    } catch (error) {
      record.status = 'failed';
      record.completedAt = new Date();
      record.duration = record.completedAt.getTime() - record.startedAt.getTime();

      await this.updateTicketStatus(ticketContext.ticket.id, 'open');
      this._onExecutionComplete.fire(record);

      throw error;
    } finally {
      this.activeExecution = null;
    }
  }

  /**
   * Execute plan using swarm coordinator
   */
  private async executeWithSwarm(record: TicketExecutionRecord, plan: TicketPlan): Promise<void> {
    record.status = 'running';

    // Convert to swarm plan format
    const swarmPlan: ApprovedPlan = {
      id: plan.id,
      ticketId: plan.ticketId,
      title: plan.title,
      steps: plan.steps.map(step => ({
        id: step.id,
        title: step.title,
        description: step.description,
        targetFiles: step.targetFiles,
        sector: step.sector,
        dependencies: step.dependencies,
        estimatedTokens: step.estimatedTokens,
        priority: step.priority,
      })),
      totalEstimatedTokens: plan.totalEstimatedTokens,
      createdAt: plan.createdAt,
      approvedAt: plan.approvedAt || new Date(),
    };

    // Execute via swarm
    const swarmState = await this.swarmCoordinator.execute(swarmPlan);

    // Map results back to record
    record.stepsCompleted = swarmState.completedBlocks;
    record.stepsFailed = swarmState.failedBlocks;
    record.tokensUsed = plan.totalEstimatedTokens; // Would be actual from swarm

    // Collect modified files from workers
    for (const worker of swarmState.workers) {
      if (worker.result?.filesModified) {
        record.filesModified.push(...worker.result.filesModified);
      }
    }

    // Deduplicate files
    record.filesModified = [...new Set(record.filesModified)];
  }

  /**
   * Execute plan with single agent
   */
  private async executeSingleAgent(
    record: TicketExecutionRecord,
    plan: TicketPlan,
    context: TicketContext
  ): Promise<void> {
    record.status = 'running';

    // Execute steps sequentially
    for (const step of plan.steps) {
      // Check dependencies
      const depsComplete = step.dependencies.every(dep =>
        record.stepsCompleted.includes(dep)
      );

      if (!depsComplete) {
        // Skip if dependencies failed
        record.stepsFailed.push(step.id);
        continue;
      }

      try {
        // Execute step (would call actual agent/LLM here)
        await this.executeStep(step, context);

        record.stepsCompleted.push(step.id);
        record.filesModified.push(...step.targetFiles);
        record.tokensUsed += step.estimatedTokens;

      } catch (error) {
        record.stepsFailed.push(step.id);
        console.error(`Step ${step.id} failed:`, error);
      }
    }

    // Deduplicate files
    record.filesModified = [...new Set(record.filesModified)];
  }

  /**
   * Execute a single step
   */
  private async executeStep(step: PlanStep, context: TicketContext): Promise<void> {
    // Placeholder - would call actual agent/LLM
    // For now, simulate execution time
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  /**
   * Run verification checks
   */
  private async runVerification(record: TicketExecutionRecord): Promise<VerificationSummary> {
    // Would integrate with pre-flight checks
    // For now, return basic verification

    const checks = [
      { name: 'Syntax Check', passed: true },
      { name: 'Type Check', passed: true },
      { name: 'Security Audit', passed: true },
      { name: 'Linting', passed: true },
    ];

    const passed = checks.every(c => c.passed);

    return {
      passed,
      checks,
      blockers: passed ? undefined : ['Some checks failed'],
    };
  }

  /**
   * Generate diff summary
   */
  private generateDiffSummary(record: TicketExecutionRecord): string {
    const lines = [
      `## Execution Summary`,
      ``,
      `**Steps Completed:** ${record.stepsCompleted.length}`,
      `**Steps Failed:** ${record.stepsFailed.length}`,
      `**Files Modified:** ${record.filesModified.length}`,
      `**Tokens Used:** ${record.tokensUsed}`,
      `**Duration:** ${(record.duration / 1000).toFixed(1)}s`,
      ``,
    ];

    if (record.filesModified.length > 0) {
      lines.push(`### Modified Files`);
      for (const file of record.filesModified.slice(0, 10)) {
        lines.push(`- ${file}`);
      }
      if (record.filesModified.length > 10) {
        lines.push(`... and ${record.filesModified.length - 10} more`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Evaluate auto-close decision
   */
  private evaluateAutoClose(record: TicketExecutionRecord): AutoCloseDecision {
    // Check if auto-close is enabled
    if (!this.config.autoCloseEnabled) {
      return {
        shouldClose: false,
        reason: 'manual-override',
        blocked: 'Auto-close is disabled',
      };
    }

    // Check execution status
    if (record.status !== 'completed') {
      return {
        shouldClose: false,
        reason: 'execution-failed',
        blocked: `Execution status: ${record.status}`,
      };
    }

    // Check verification
    if (record.verification && !record.verification.passed) {
      return {
        shouldClose: false,
        reason: 'verification-failed',
        blocked: record.verification.blockers?.join(', '),
      };
    }

    // All good - can auto-close
    return {
      shouldClose: true,
      reason: 'plan-completed-verified',
    };
  }

  /**
   * Update ticket status
   */
  private async updateTicketStatus(ticketId: string, status: TicketStatus): Promise<void> {
    if (this.ticketStorage) {
      await this.ticketStorage.updateStatus(ticketId, status);
    }
  }

  /**
   * Handle PR merge event for auto-close
   */
  async handlePRMerge(prNumber: number, commitMessage: string): Promise<void> {
    // Check for "Fixes #ID" pattern
    const fixesPattern = /(?:fixes?|closes?|resolves?)\s+#(\d+)/gi;
    let match;

    while ((match = fixesPattern.exec(commitMessage)) !== null) {
      const ticketRef = match[1];
      // Would look up ticket by external ID

      // Auto-close the ticket
      const decision: AutoCloseDecision = {
        shouldClose: true,
        reason: 'pr-merged-fixes',
      };
      this._onAutoCloseDecision.fire(decision);
    }
  }

  /**
   * Cancel current execution
   */
  cancel(): void {
    if (this.activeExecution) {
      this.swarmCoordinator.cancel();
      this.activeExecution.status = 'cancelled';
      this.activeExecution.completedAt = new Date();
    }
  }

  /**
   * Pause current execution
   */
  pause(): void {
    this.swarmCoordinator.pause();
  }

  /**
   * Resume paused execution
   */
  resume(): void {
    this.swarmCoordinator.resume();
  }

  /**
   * Get current execution
   */
  getActiveExecution(): TicketExecutionRecord | null {
    return this.activeExecution;
  }

  /**
   * Generate execution ID
   */
  private generateExecutionId(): string {
    return `exec-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<TicketFlowConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.swarmCoordinator.dispose();
    this._onExecutionStart.dispose();
    this._onExecutionProgress.dispose();
    this._onExecutionComplete.dispose();
    this._onAutoCloseDecision.dispose();
  }
}

/**
 * Singleton instance
 */
let ticketExecutorInstance: TicketExecutor | null = null;

export function getTicketExecutor(): TicketExecutor {
  if (!ticketExecutorInstance) {
    ticketExecutorInstance = new TicketExecutor();
  }
  return ticketExecutorInstance;
}

export function initTicketExecutor(
  context: vscode.ExtensionContext,
  config?: Partial<TicketFlowConfig>
): TicketExecutor {
  ticketExecutorInstance = new TicketExecutor(config);
  ticketExecutorInstance.initialize(context);
  return ticketExecutorInstance;
}
