/**
 * Planning Session Controller
 *
 * Orchestrates the 4-phase planning flow (Study → Connect → Plan → Review)
 * with multi-persona collaboration and approval gates.
 */

import { EventEmitter } from 'events';
import {
  PlanningPhase,
  PlanningPhaseConfig,
  PlanningPhaseState,
  PlanningSession,
  PlanningGate,
  PlanningModeState,
  ReuseCandidate,
  ReuseCheckResult,
  Plan
} from './types';

/**
 * Phase configurations with checklist items
 */
export const PLANNING_PHASES: Record<PlanningPhase, PlanningPhaseConfig> = {
  study: {
    id: 'study',
    name: 'Study',
    leadPersona: 'nova',
    supportPersona: 'index',
    description: 'Understand the feature, gather requirements, check GDD',
    checklist: [
      'Feature requirements identified',
      'User stories defined',
      'GDD/documentation reviewed',
      'Scope boundaries clear',
      'Success criteria defined'
    ],
    tools: ['search', 'read', 'ask']
  },
  connect: {
    id: 'connect',
    name: 'Connect',
    leadPersona: 'gears',
    supportPersona: 'index',
    description: 'Map to existing code, identify touch points, check SA',
    checklist: [
      'Existing code analyzed',
      'Touch points identified',
      'SA alignment verified',
      'Dependencies mapped',
      'Reuse candidates found'
    ],
    tools: ['search', 'read', 'analyze', 'reuse-check']
  },
  plan: {
    id: 'plan',
    name: 'Plan',
    leadPersona: 'nova',
    supportPersona: 'gears',
    description: 'Break into phases, define tasks, estimate risk',
    checklist: [
      'Phases defined',
      'Tasks broken down',
      'File changes listed',
      'Risk assessment complete',
      'Dependencies noted'
    ],
    tools: ['plan-generate', 'edit']
  },
  review: {
    id: 'review',
    name: 'Review',
    leadPersona: 'index',
    description: 'Validate plan, update docs, approve',
    checklist: [
      'Plan structure valid',
      'Docs updates identified',
      'SA changes noted',
      'Approval obtained'
    ],
    tools: ['validate', 'doc-update']
  }
};

/**
 * Default gates for each phase
 */
const DEFAULT_GATES: Omit<PlanningGate, 'status' | 'checkedAt' | 'checkedBy'>[] = [
  {
    id: 'study-complete',
    phase: 'study',
    name: 'Study Complete',
    criteria: 'Feature understood, requirements listed',
    owner: 'nova',
    required: true
  },
  {
    id: 'connection-mapped',
    phase: 'connect',
    name: 'Connection Mapped',
    criteria: 'Existing code analyzed, touch points identified',
    owner: 'gears',
    required: true
  },
  {
    id: 'plan-approved',
    phase: 'plan',
    name: 'Plan Approved',
    criteria: 'Phases reviewed, scope accepted',
    owner: 'user',
    required: true
  },
  {
    id: 'docs-updated',
    phase: 'review',
    name: 'Docs Updated',
    criteria: 'SA/GDD reflect planned changes',
    owner: 'index',
    required: false
  }
];

/**
 * Planning Session Controller
 */
export class PlanningSessionController extends EventEmitter {
  private _session: PlanningSession | null = null;
  private _gates: PlanningGate[] = [];
  private _modeState: PlanningModeState;

  constructor() {
    super();
    this._modeState = {
      isActive: false,
      gates: [],
      canSkipToPhase: null,
      showPanel: false
    };
  }

  /**
   * Get current mode state
   */
  getModeState(): PlanningModeState {
    return { ...this._modeState };
  }

  /**
   * Get current session
   */
  getSession(): PlanningSession | null {
    return this._session;
  }

  /**
   * Start a new planning session
   */
  startSession(feature: string, description: string): PlanningSession {
    const now = Date.now();
    const sessionId = `planning-${now}-${Math.random().toString(36).slice(2, 8)}`;

    // Create initial phase states
    const createPhaseState = (phase: PlanningPhase, isFirst: boolean): PlanningPhaseState => ({
      phase,
      status: isFirst ? 'in_progress' : 'pending',
      startedAt: isFirst ? now : undefined,
      checklistCompleted: new Array(PLANNING_PHASES[phase].checklist.length).fill(false),
      notes: [],
      outputs: {}
    });

    this._session = {
      id: sessionId,
      feature,
      description,
      createdAt: now,
      updatedAt: now,
      status: 'active',
      currentPhase: 'study',
      phases: {
        study: createPhaseState('study', true),
        connect: createPhaseState('connect', false),
        plan: createPhaseState('plan', false),
        review: createPhaseState('review', false)
      },
      affectedFiles: [],
      riskAssessment: {
        overall: 'low',
        items: []
      }
    };

    // Initialize gates
    this._gates = DEFAULT_GATES.map(g => ({
      ...g,
      status: 'pending' as const
    }));

    // Update mode state
    this._modeState = {
      isActive: true,
      session: this._session,
      gates: this._gates,
      canSkipToPhase: 'plan', // Can skip to Plan phase
      showPanel: true
    };

    this._emitStateChange();
    return this._session;
  }

  /**
   * Advance to next phase
   */
  advancePhase(): PlanningPhase | null {
    if (!this._session) return null;

    const phaseOrder: PlanningPhase[] = ['study', 'connect', 'plan', 'review'];
    const currentIndex = phaseOrder.indexOf(this._session.currentPhase);

    if (currentIndex >= phaseOrder.length - 1) {
      // Already at last phase
      return null;
    }

    const now = Date.now();

    // Complete current phase
    this._session.phases[this._session.currentPhase].status = 'completed';
    this._session.phases[this._session.currentPhase].completedAt = now;

    // Start next phase
    const nextPhase = phaseOrder[currentIndex + 1];
    this._session.currentPhase = nextPhase;
    this._session.phases[nextPhase].status = 'in_progress';
    this._session.phases[nextPhase].startedAt = now;
    this._session.updatedAt = now;

    this._updateModeState();
    this._emitStateChange();

    return nextPhase;
  }

  /**
   * Skip to a specific phase
   */
  skipToPhase(targetPhase: PlanningPhase): boolean {
    if (!this._session) return false;

    const phaseOrder: PlanningPhase[] = ['study', 'connect', 'plan', 'review'];
    const currentIndex = phaseOrder.indexOf(this._session.currentPhase);
    const targetIndex = phaseOrder.indexOf(targetPhase);

    if (targetIndex <= currentIndex) {
      return false; // Can't skip backwards
    }

    const now = Date.now();

    // Mark skipped phases
    for (let i = currentIndex; i < targetIndex; i++) {
      const phase = phaseOrder[i];
      if (this._session.phases[phase].status !== 'completed') {
        this._session.phases[phase].status = 'skipped';
        this._session.phases[phase].completedAt = now;
      }
    }

    // Start target phase
    this._session.currentPhase = targetPhase;
    this._session.phases[targetPhase].status = 'in_progress';
    this._session.phases[targetPhase].startedAt = now;
    this._session.updatedAt = now;

    this._updateModeState();
    this._emitStateChange();

    return true;
  }

  /**
   * Update checklist item for current phase
   */
  updateChecklist(index: number, completed: boolean): void {
    if (!this._session) return;

    const currentPhase = this._session.phases[this._session.currentPhase];
    if (index >= 0 && index < currentPhase.checklistCompleted.length) {
      currentPhase.checklistCompleted[index] = completed;
      this._session.updatedAt = Date.now();
      this._emitStateChange();
    }
  }

  /**
   * Add a note to current phase
   */
  addNote(note: string): void {
    if (!this._session) return;

    this._session.phases[this._session.currentPhase].notes.push(note);
    this._session.updatedAt = Date.now();
    this._emitStateChange();
  }

  /**
   * Add an affected file
   */
  addAffectedFile(path: string, action: 'create' | 'modify' | 'delete'): void {
    if (!this._session) return;

    // Check if already exists
    const existing = this._session.affectedFiles.find(f => f.path === path);
    if (!existing) {
      this._session.affectedFiles.push({
        path,
        action,
        discoveredInPhase: this._session.currentPhase
      });
      this._session.updatedAt = Date.now();
      this._emitStateChange();
    }
  }

  /**
   * Add risk to assessment
   */
  addRisk(level: 'low' | 'medium' | 'high' | 'critical', description: string, mitigation?: string): void {
    if (!this._session) return;

    this._session.riskAssessment.items.push({ level, description, mitigation });

    // Update overall risk level
    const riskLevels = ['low', 'medium', 'high', 'critical'] as const;
    const maxRisk = this._session.riskAssessment.items.reduce((max, item) => {
      return riskLevels.indexOf(item.level) > riskLevels.indexOf(max) ? item.level : max;
    }, 'low' as typeof level);
    this._session.riskAssessment.overall = maxRisk;

    this._session.updatedAt = Date.now();
    this._emitStateChange();
  }

  /**
   * Pass a gate
   */
  passGate(gateId: string, notes?: string): boolean {
    const gate = this._gates.find(g => g.id === gateId);
    if (!gate) return false;

    gate.status = 'passed';
    gate.checkedAt = Date.now();
    gate.notes = notes;

    this._updateModeState();
    this._emitStateChange();

    return true;
  }

  /**
   * Fail a gate
   */
  failGate(gateId: string, notes?: string): boolean {
    const gate = this._gates.find(g => g.id === gateId);
    if (!gate) return false;

    gate.status = 'failed';
    gate.checkedAt = Date.now();
    gate.notes = notes;

    this._updateModeState();
    this._emitStateChange();

    return true;
  }

  /**
   * Waive a gate (for non-required gates)
   */
  waiveGate(gateId: string, reason: string): boolean {
    const gate = this._gates.find(g => g.id === gateId);
    if (!gate || gate.required) return false;

    gate.status = 'waived';
    gate.checkedAt = Date.now();
    gate.notes = reason;

    this._updateModeState();
    this._emitStateChange();

    return true;
  }

  /**
   * Set the generated implementation plan
   */
  setImplementationPlan(plan: Plan): void {
    if (!this._session) return;

    this._session.implementationPlan = plan;
    this._session.updatedAt = Date.now();
    this._emitStateChange();
  }

  /**
   * Set GDD context
   */
  setGddContext(context: string): void {
    if (!this._session) return;

    this._session.gddContext = context;
    this._session.updatedAt = Date.now();
  }

  /**
   * Set SA context
   */
  setSaContext(context: string): void {
    if (!this._session) return;

    this._session.saContext = context;
    this._session.updatedAt = Date.now();
  }

  /**
   * Complete the planning session
   */
  completeSession(): void {
    if (!this._session) return;

    // Mark review phase as completed
    this._session.phases.review.status = 'completed';
    this._session.phases.review.completedAt = Date.now();

    this._session.status = 'completed';
    this._session.updatedAt = Date.now();

    this._modeState.isActive = false;
    this._emitStateChange();
  }

  /**
   * Cancel the planning session
   */
  cancelSession(): void {
    if (!this._session) return;

    this._session.status = 'cancelled';
    this._session.updatedAt = Date.now();

    this._modeState = {
      isActive: false,
      gates: [],
      canSkipToPhase: null,
      showPanel: false
    };

    this._emitStateChange();
  }

  /**
   * Check if all required gates are passed for current phase
   */
  areGatesPassedForPhase(phase: PlanningPhase): boolean {
    return this._gates
      .filter(g => g.phase === phase && g.required)
      .every(g => g.status === 'passed');
  }

  /**
   * Get phase progress percentage
   */
  getPhaseProgress(phase: PlanningPhase): number {
    if (!this._session) return 0;

    const phaseState = this._session.phases[phase];
    const completed = phaseState.checklistCompleted.filter(Boolean).length;
    return Math.round((completed / phaseState.checklistCompleted.length) * 100);
  }

  /**
   * Get overall session progress percentage
   */
  getOverallProgress(): number {
    if (!this._session) return 0;

    const phaseOrder: PlanningPhase[] = ['study', 'connect', 'plan', 'review'];
    let totalWeight = 0;
    let completedWeight = 0;

    for (const phase of phaseOrder) {
      const phaseState = this._session.phases[phase];
      const weight = PLANNING_PHASES[phase].checklist.length;
      totalWeight += weight;

      if (phaseState.status === 'completed' || phaseState.status === 'skipped') {
        completedWeight += weight;
      } else if (phaseState.status === 'in_progress') {
        const completed = phaseState.checklistCompleted.filter(Boolean).length;
        completedWeight += completed;
      }
    }

    return totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0;
  }

  /**
   * Toggle panel visibility
   */
  togglePanel(): void {
    this._modeState.showPanel = !this._modeState.showPanel;
    this._emitStateChange();
  }

  /**
   * Update mode state from session
   */
  private _updateModeState(): void {
    if (!this._session) {
      this._modeState = {
        isActive: false,
        gates: [],
        canSkipToPhase: null,
        showPanel: false
      };
      return;
    }

    // Determine if we can skip to Plan
    const canSkipToPhase: PlanningPhase | null =
      this._session.currentPhase === 'study' || this._session.currentPhase === 'connect'
        ? 'plan'
        : null;

    this._modeState = {
      isActive: this._session.status === 'active',
      session: this._session,
      gates: this._gates,
      canSkipToPhase,
      showPanel: this._modeState.showPanel
    };
  }

  /**
   * Emit state change event
   */
  private _emitStateChange(): void {
    this._updateModeState();
    this.emit('stateChange', this._modeState);
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this._session = null;
    this._gates = [];
    this.removeAllListeners();
  }
}

/**
 * Create reuse check result
 */
export function performReuseCheck(
  query: string,
  candidates: ReuseCandidate[]
): ReuseCheckResult {
  if (candidates.length === 0) {
    return {
      query,
      candidates: [],
      recommendation: 'create',
      reasoning: 'No similar existing code found. Creating new implementation is appropriate.'
    };
  }

  // Sort by similarity
  const sorted = [...candidates].sort((a, b) => b.similarity - a.similarity);
  const best = sorted[0];

  if (best.similarity >= 0.8 && best.canExtend) {
    return {
      query,
      candidates: sorted,
      recommendation: 'extend',
      reasoning: `Found highly similar code in ${best.file}. Recommend extending ${best.symbol} instead of creating new.`
    };
  }

  if (best.similarity >= 0.6) {
    return {
      query,
      candidates: sorted,
      recommendation: 'reuse',
      reasoning: `Found similar code in ${best.file}. Consider reusing or adapting ${best.symbol}.`
    };
  }

  return {
    query,
    candidates: sorted,
    recommendation: 'create',
    reasoning: `Similar code exists but is not a close match. Creating new implementation may be appropriate, but review ${best.file}:${best.symbol} first.`
  };
}
