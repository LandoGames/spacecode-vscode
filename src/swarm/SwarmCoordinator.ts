/**
 * Swarm Coordinator
 *
 * Orchestrates parallel execution of plan steps across multiple workers.
 * Handles task decomposition, dependency ordering, file locking, and result merging.
 */

import * as vscode from 'vscode';
import {
  ApprovedPlan,
  PlanStep,
  SwarmConfig,
  SwarmState,
  SwarmStatus,
  SwarmWorker,
  WorkerStatus,
  WorkBlock,
  WorkBlockContext,
  WorkerResult,
  WorkerLog,
  MergeConflict,
  DependencyNode,
  FileLock,
  VerificationResult,
} from './types';

const DEFAULT_CONFIG: SwarmConfig = {
  maxWorkers: 4,
  progressUpdateInterval: 2000, // 2 seconds per spec
  verifyBeforeMerge: true,
  allowConcurrentFileEdits: false,
  retryFailedBlocks: true,
  maxRetries: 2,
};

/**
 * Swarm Coordinator - orchestrates parallel work execution
 */
export class SwarmCoordinator {
  private config: SwarmConfig;
  private state: SwarmState;
  private fileLocks: Map<string, FileLock> = new Map();
  private progressInterval: NodeJS.Timeout | null = null;

  // Event emitters
  private _onStatusChange = new vscode.EventEmitter<SwarmStatus>();
  private _onWorkerUpdate = new vscode.EventEmitter<SwarmWorker>();
  private _onProgress = new vscode.EventEmitter<number>();
  private _onBlockCompleted = new vscode.EventEmitter<WorkBlock>();
  private _onConflict = new vscode.EventEmitter<MergeConflict>();
  private _onComplete = new vscode.EventEmitter<SwarmState>();
  private _onError = new vscode.EventEmitter<Error>();

  // Public events
  readonly onStatusChange = this._onStatusChange.event;
  readonly onWorkerUpdate = this._onWorkerUpdate.event;
  readonly onProgress = this._onProgress.event;
  readonly onBlockCompleted = this._onBlockCompleted.event;
  readonly onConflict = this._onConflict.event;
  readonly onComplete = this._onComplete.event;
  readonly onError = this._onError.event;

  constructor(config?: Partial<SwarmConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = this.createInitialState();
  }

  private createInitialState(): SwarmState {
    return {
      status: 'idle',
      workBlocks: [],
      workers: [],
      completedBlocks: [],
      failedBlocks: [],
      progress: 0,
      conflicts: [],
    };
  }

  /**
   * Get current swarm state
   */
  getState(): SwarmState {
    return { ...this.state };
  }

  /**
   * Get all workers
   */
  getWorkers(): SwarmWorker[] {
    return [...this.state.workers];
  }

  /**
   * Get work blocks
   */
  getWorkBlocks(): WorkBlock[] {
    return [...this.state.workBlocks];
  }

  /**
   * Initialize workers in the pool
   */
  initializeWorkers(count?: number): SwarmWorker[] {
    const workerCount = count || this.config.maxWorkers;
    this.state.workers = [];

    for (let i = 0; i < workerCount; i++) {
      this.state.workers.push({
        id: `worker-${i + 1}`,
        name: `Worker ${i + 1}`,
        status: 'idle',
        targetFiles: [],
        progress: 0,
        logs: [],
      });
    }

    return this.state.workers;
  }

  /**
   * Start executing an approved plan
   */
  async execute(plan: ApprovedPlan): Promise<SwarmState> {
    if (this.state.status !== 'idle') {
      throw new Error(`Cannot start execution: swarm is ${this.state.status}`);
    }

    try {
      // Initialize
      this.state.plan = plan;
      this.state.startedAt = new Date();
      this.setStatus('planning');

      // Decompose plan into work blocks
      const workBlocks = this.decomposePlan(plan);
      this.state.workBlocks = workBlocks;

      // Ensure workers are initialized
      if (this.state.workers.length === 0) {
        this.initializeWorkers();
      }

      // Start execution
      this.setStatus('executing');
      this.startProgressUpdates();

      // Execute work blocks respecting dependencies
      await this.executeWorkBlocks();

      // All blocks done - merge results
      if (this.state.failedBlocks.length === 0) {
        this.setStatus('merging');
        await this.mergeResults();

        // Final verification
        this.setStatus('verifying');
        const verified = await this.verifyFinalResult();

        if (verified) {
          this.setStatus('completed');
        } else {
          this.setStatus('failed');
        }
      } else {
        this.setStatus('failed');
      }

      this.state.completedAt = new Date();
      this.stopProgressUpdates();
      this._onComplete.fire(this.state);

      return this.state;
    } catch (error) {
      this.setStatus('failed');
      this.stopProgressUpdates();
      this._onError.fire(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Decompose plan into work blocks with dependency tracking
   */
  private decomposePlan(plan: ApprovedPlan): WorkBlock[] {
    const workBlocks: WorkBlock[] = [];
    const stepToBlocks = new Map<string, string[]>();

    for (const step of plan.steps) {
      // Create work block(s) for this step
      // If step has multiple files in different sectors, split into blocks
      const filesGroupedBySector = this.groupFilesBySector(step.targetFiles, step.sector);

      for (const [sector, files] of filesGroupedBySector) {
        const blockId = `block-${step.id}-${sector || 'default'}`;

        // Collect dependencies from step dependencies
        const blockDeps: string[] = [];
        if (step.dependencies) {
          for (const depStepId of step.dependencies) {
            const depBlocks = stepToBlocks.get(depStepId) || [];
            blockDeps.push(...depBlocks);
          }
        }

        const block: WorkBlock = {
          id: blockId,
          stepId: step.id,
          files,
          sector,
          context: this.buildBlockContext(step, files, sector),
          status: 'pending',
          dependencies: blockDeps,
        };

        workBlocks.push(block);

        // Track which blocks belong to this step
        const existing = stepToBlocks.get(step.id) || [];
        existing.push(blockId);
        stepToBlocks.set(step.id, existing);
      }
    }

    return workBlocks;
  }

  /**
   * Group files by sector for splitting work blocks
   */
  private groupFilesBySector(
    files: string[],
    defaultSector?: string
  ): Map<string | undefined, string[]> {
    const groups = new Map<string | undefined, string[]>();

    // For now, keep all files in same block (can be enhanced with sector detection)
    groups.set(defaultSector, files);

    return groups;
  }

  /**
   * Build context payload for a work block
   */
  private buildBlockContext(
    step: PlanStep,
    files: string[],
    sector?: string
  ): WorkBlockContext {
    // This would integrate with ContextAssembler for full implementation
    return {
      prompt: step.description,
      policySlice: '', // Would be loaded from policy based on sector
      relevantCode: files,
      kbContext: undefined,
    };
  }

  /**
   * Execute work blocks with dependency ordering
   */
  private async executeWorkBlocks(): Promise<void> {
    const dependencyGraph = this.buildDependencyGraph(this.state.workBlocks);
    const executionOrder = this.topologicalSort(dependencyGraph);

    // Track which blocks are in progress
    const inProgress = new Set<string>();
    const completed = new Set<string>(this.state.completedBlocks);
    const failed = new Set<string>(this.state.failedBlocks);

    // Process blocks in waves based on dependency depth
    if (executionOrder.length === 0) {
      return;
    }

    let currentDepth = 0;
    const depths = Array.from(dependencyGraph.values()).map(n => n.depth);
    const maxDepth = depths.length > 0 ? Math.max(...depths) : 0;

    while (currentDepth <= maxDepth && (this.state.status === 'executing' || this.state.status === 'paused')) {
      // Wait if paused (may throw if cancelled)
      await this.waitIfPaused();
      // Re-check status after potential pause (status may have changed)
      if (this.state.status !== 'executing') break;

      // Get all blocks at current depth that are ready
      const readyBlocks = executionOrder.filter(blockId => {
        const node = dependencyGraph.get(blockId);
        if (!node || node.depth !== currentDepth) return false;

        // Check if all dependencies completed
        return node.dependencies.every(dep => completed.has(dep) || failed.has(dep));
      });

      // Execute ready blocks in parallel (up to available workers)
      const blockPromises = readyBlocks.map(async (blockId) => {
        const block = this.state.workBlocks.find(b => b.id === blockId);
        if (!block || block.status !== 'pending') return;

        // Wait for available worker
        const worker = await this.waitForAvailableWorker();
        if (!worker || this.state.status !== 'executing') return;

        inProgress.add(blockId);

        try {
          await this.executeBlock(block, worker);
          completed.add(blockId);
          this.state.completedBlocks.push(blockId);
        } catch (error) {
          // Retry logic
          const currentRetries = block.retries || 0;
          if (this.config.retryFailedBlocks && currentRetries < this.config.maxRetries) {
            block.retries = currentRetries + 1;
            this.logWorker(worker, 'warn', `Retrying block ${blockId} (attempt ${block.retries})`);
            block.status = 'pending';
            block.assignedWorkerId = undefined;
          } else {
            block.status = 'failed';
            failed.add(blockId);
            this.state.failedBlocks.push(blockId);
          }
        } finally {
          inProgress.delete(blockId);
        }
      });

      await Promise.all(blockPromises);

      const hasPendingAtDepth = executionOrder.some(blockId => {
        const node = dependencyGraph.get(blockId);
        if (!node || node.depth !== currentDepth) return false;
        const block = this.state.workBlocks.find(b => b.id === blockId);
        return block?.status === 'pending';
      });

      if (!hasPendingAtDepth) {
        currentDepth++;
      }
    }
  }

  /**
   * Build dependency graph from work blocks
   */
  private buildDependencyGraph(blocks: WorkBlock[]): Map<string, DependencyNode> {
    const graph = new Map<string, DependencyNode>();

    // Create nodes
    for (const block of blocks) {
      graph.set(block.id, {
        id: block.id,
        dependencies: [...block.dependencies],
        dependents: [],
        depth: 0,
      });
    }

    // Build reverse dependencies and compute depths
    for (const block of blocks) {
      for (const depId of block.dependencies) {
        const depNode = graph.get(depId);
        if (depNode) {
          depNode.dependents.push(block.id);
        }
      }
    }

    // Compute topological depth for each node
    const computeDepth = (nodeId: string, visited: Set<string>): number => {
      if (visited.has(nodeId)) return 0; // Cycle detected
      visited.add(nodeId);

      const node = graph.get(nodeId);
      if (!node || node.dependencies.length === 0) return 0;

      const maxDepDepth = Math.max(
        ...node.dependencies.map(depId => computeDepth(depId, visited))
      );
      return maxDepDepth + 1;
    };

    for (const block of blocks) {
      const node = graph.get(block.id);
      if (node) {
        node.depth = computeDepth(block.id, new Set());
      }
    }

    return graph;
  }

  /**
   * Topological sort of work blocks
   */
  private topologicalSort(graph: Map<string, DependencyNode>): string[] {
    const result: string[] = [];
    const visited = new Set<string>();

    const visit = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      const node = graph.get(nodeId);
      if (!node) return;

      for (const depId of node.dependencies) {
        visit(depId);
      }

      result.push(nodeId);
    };

    for (const nodeId of graph.keys()) {
      visit(nodeId);
    }

    return result;
  }

  /**
   * Wait for an available worker
   */
  private async waitForAvailableWorker(): Promise<SwarmWorker | null> {
    const maxWait = 60000; // 60 seconds max wait
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      if (this.state.status !== 'executing') return null;

      const available = this.state.workers.find(w => w.status === 'idle');
      if (available) return available;

      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return null;
  }

  /**
   * Execute a single work block with a worker
   */
  private async executeBlock(block: WorkBlock, worker: SwarmWorker): Promise<void> {
    await this.waitIfPaused();

    // Acquire file locks
    for (const file of block.files) {
      if (!this.config.allowConcurrentFileEdits) {
        await this.acquireFileLock(file, worker.id);
      }
    }

    try {
      // Update worker status
      worker.status = 'assigned';
      worker.assignedStep = this.state.plan?.steps.find(s => s.id === block.stepId);
      worker.targetFiles = block.files;
      worker.startedAt = new Date();
      worker.progress = 0;
      this._onWorkerUpdate.fire(worker);

      // Mark block as assigned
      block.status = 'assigned';
      block.assignedWorkerId = worker.id;

      // Execute the work (this would call actual agent/LLM)
      worker.status = 'working';
      this._onWorkerUpdate.fire(worker);

      this.logWorker(worker, 'info', `Starting work on: ${block.files.join(', ')}`);

      // Simulated execution - in real implementation this calls the agent
      const result = await this.simulateWorkerExecution(block, worker);

      // Verification
      if (this.config.verifyBeforeMerge) {
        worker.status = 'verifying';
        this._onWorkerUpdate.fire(worker);

        this.logWorker(worker, 'info', 'Verifying changes...');
        result.verification = await this.verifyBlockResult(block, result);
      }

      // Complete
      worker.status = 'completed';
      worker.completedAt = new Date();
      worker.result = result;
      worker.progress = 100;
      this._onWorkerUpdate.fire(worker);

      block.status = 'completed';
      this._onBlockCompleted.fire(block);

      this.logWorker(worker, 'info', `Completed: ${result.filesModified.length} files modified`);

    } finally {
      // Release file locks
      for (const file of block.files) {
        this.releaseFileLock(file, worker.id);
      }

      // Reset worker
      worker.status = 'idle';
      worker.assignedStep = undefined;
      worker.targetFiles = [];
      this._onWorkerUpdate.fire(worker);
    }
  }

  /**
   * Simulate worker execution (placeholder for actual agent call)
   */
  private async simulateWorkerExecution(
    block: WorkBlock,
    worker: SwarmWorker
  ): Promise<WorkerResult> {
    // Simulate work with progress updates
    for (let i = 1; i <= 10; i++) {
      await this.waitIfPaused();
      await new Promise(resolve => setTimeout(resolve, 100));
      worker.progress = i * 10;
      this._onWorkerUpdate.fire(worker);
    }

    return {
      success: true,
      filesModified: block.files,
      tokensUsed: 1000,
      duration: Date.now() - (worker.startedAt?.getTime() || Date.now()),
    };
  }

  /**
   * Verify a block's result
   */
  private async verifyBlockResult(
    block: WorkBlock,
    result: WorkerResult
  ): Promise<VerificationResult> {
    // Would integrate with pre-flight checks
    return {
      passed: true,
      checks: [
        { name: 'syntax', passed: true },
        { name: 'lint', passed: true },
        { name: 'security', passed: true },
      ],
    };
  }

  /**
   * Acquire a file lock
   */
  private async acquireFileLock(file: string, workerId: string): Promise<void> {
    const maxWait = 30000; // 30 seconds max wait
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      const existingLock = this.fileLocks.get(file);

      if (!existingLock || existingLock.workerId === workerId) {
        this.fileLocks.set(file, {
          file,
          workerId,
          acquiredAt: new Date(),
        });
        return;
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error(`Timeout acquiring lock for file: ${file}`);
  }

  /**
   * Release a file lock
   */
  private releaseFileLock(file: string, workerId: string): void {
    const lock = this.fileLocks.get(file);
    if (lock && lock.workerId === workerId) {
      this.fileLocks.delete(file);
    }
  }

  /**
   * Wait while paused, and stop if cancelled.
   */
  private async waitIfPaused(): Promise<void> {
    while (this.state.status === 'paused') {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (this.state.status === 'cancelled') {
      throw new Error('Swarm execution cancelled');
    }
  }

  /**
   * Merge results from all completed blocks
   */
  private async mergeResults(): Promise<void> {
    // Check for conflicts
    const fileOwners = new Map<string, string[]>();

    for (const blockId of this.state.completedBlocks) {
      const block = this.state.workBlocks.find(b => b.id === blockId);
      if (!block) continue;

      for (const file of block.files) {
        const owners = fileOwners.get(file) || [];
        owners.push(blockId);
        fileOwners.set(file, owners);
      }
    }

    // Detect conflicts (multiple workers edited same file)
    for (const [file, owners] of fileOwners) {
      if (owners.length > 1) {
        const conflict: MergeConflict = {
          file,
          workerA: owners[0],
          workerB: owners[1],
          conflictType: 'overlapping-edit',
          resolved: false,
        };
        this.state.conflicts.push(conflict);
        this._onConflict.fire(conflict);
      }
    }

    // If no conflicts, merging is trivial
    // Real implementation would actually merge file changes
  }

  /**
   * Verify final merged result
   */
  private async verifyFinalResult(): Promise<boolean> {
    // Would run full pre-flight checks
    return this.state.conflicts.filter(c => !c.resolved).length === 0;
  }

  /**
   * Set swarm status
   */
  private setStatus(status: SwarmStatus): void {
    this.state.status = status;
    this._onStatusChange.fire(status);
  }

  /**
   * Log a message for a worker
   */
  private logWorker(
    worker: SwarmWorker,
    level: WorkerLog['level'],
    message: string,
    data?: any
  ): void {
    const log: WorkerLog = {
      timestamp: new Date(),
      level,
      message,
      data,
    };
    worker.logs.push(log);

    // Keep log size manageable
    if (worker.logs.length > 100) {
      worker.logs = worker.logs.slice(-100);
    }
  }

  /**
   * Start progress update interval
   */
  private startProgressUpdates(): void {
    this.progressInterval = setInterval(() => {
      this.updateProgress();
    }, this.config.progressUpdateInterval);
  }

  /**
   * Stop progress update interval
   */
  private stopProgressUpdates(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  /**
   * Update overall progress
   */
  private updateProgress(): void {
    const total = this.state.workBlocks.length;
    if (total === 0) return;

    const completed = this.state.completedBlocks.length;
    const inProgress = this.state.workers.filter(w => w.status === 'working').length;

    // Weight in-progress work
    const inProgressContribution = inProgress * 0.5;
    const progress = Math.round(((completed + inProgressContribution) / total) * 100);

    if (progress !== this.state.progress) {
      this.state.progress = progress;
      this._onProgress.fire(progress);
    }
  }

  /**
   * Pause execution
   */
  pause(): void {
    if (this.state.status === 'executing') {
      this.setStatus('paused');

      // Pause all working workers
      for (const worker of this.state.workers) {
        if (worker.status === 'working') {
          worker.status = 'paused';
          this._onWorkerUpdate.fire(worker);
        }
      }
    }
  }

  /**
   * Resume execution
   */
  resume(): void {
    if (this.state.status === 'paused') {
      this.setStatus('executing');

      // Resume paused workers
      for (const worker of this.state.workers) {
        if (worker.status === 'paused') {
          worker.status = 'working';
          this._onWorkerUpdate.fire(worker);
        }
      }
    }
  }

  /**
   * Cancel execution
   */
  cancel(): void {
    this.setStatus('cancelled');
    this.stopProgressUpdates();

    // Cancel all workers
    for (const worker of this.state.workers) {
      if (worker.status !== 'idle' && worker.status !== 'completed') {
        worker.status = 'cancelled';
        this._onWorkerUpdate.fire(worker);
      }
    }

    // Release all file locks
    this.fileLocks.clear();

    this.state.completedAt = new Date();
    this._onComplete.fire(this.state);
  }

  /**
   * Retry a failed worker
   */
  async retryWorker(workerId: string): Promise<void> {
    const worker = this.state.workers.find(w => w.id === workerId);
    if (!worker || worker.status !== 'failed') {
      throw new Error(`Worker ${workerId} cannot be retried`);
    }

    // Find the block this worker was working on
    const block = this.state.workBlocks.find(b => b.assignedWorkerId === workerId);
    if (!block) {
      throw new Error(`No block found for worker ${workerId}`);
    }

    // Reset block and worker
    block.status = 'pending';
    block.assignedWorkerId = undefined;
    worker.status = 'idle';
    worker.error = undefined;
    worker.logs = [];
    this._onWorkerUpdate.fire(worker);

    // Remove from failed blocks
    const failedIndex = this.state.failedBlocks.indexOf(block.id);
    if (failedIndex !== -1) {
      this.state.failedBlocks.splice(failedIndex, 1);
    }
  }

  /**
   * Resolve a merge conflict
   */
  resolveConflict(
    conflictIndex: number,
    resolution: MergeConflict['resolution']
  ): void {
    const conflict = this.state.conflicts[conflictIndex];
    if (!conflict) {
      throw new Error(`Conflict ${conflictIndex} not found`);
    }

    conflict.resolution = resolution;
    conflict.resolved = true;
  }

  /**
   * Reset the coordinator to idle state
   */
  reset(): void {
    this.stopProgressUpdates();
    this.fileLocks.clear();
    this.state = this.createInitialState();

    // Keep workers but reset them
    for (const worker of this.state.workers) {
      worker.status = 'idle';
      worker.assignedStep = undefined;
      worker.targetFiles = [];
      worker.progress = 0;
      worker.logs = [];
      worker.result = undefined;
      worker.error = undefined;
    }
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.stopProgressUpdates();
    this._onStatusChange.dispose();
    this._onWorkerUpdate.dispose();
    this._onProgress.dispose();
    this._onBlockCompleted.dispose();
    this._onConflict.dispose();
    this._onComplete.dispose();
    this._onError.dispose();
  }
}
