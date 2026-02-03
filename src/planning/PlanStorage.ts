/**
 * Plan Storage
 *
 * Handles persistence of plans using VSCode's ExtensionContext.
 */

import * as vscode from 'vscode';
import { Plan, StoredPlan, PlanHistoryEntry } from './types';

const PLANS_KEY = 'spacecode.plans';
const HISTORY_KEY = 'spacecode.planHistory';
const MAX_PLANS = 50;
const MAX_HISTORY = 200;

/**
 * Plan Storage Manager
 */
export class PlanStorage {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * Save a plan
   */
  async savePlan(plan: Plan): Promise<void> {
    const plans = this.loadAllPlans();

    // Update or add
    const existingIndex = plans.findIndex(p => p.plan.id === plan.id);
    const storedPlan: StoredPlan = {
      plan,
      version: 1,
      checksum: this.generateChecksum(plan)
    };

    if (existingIndex >= 0) {
      plans[existingIndex] = storedPlan;
    } else {
      plans.unshift(storedPlan);
    }

    // Limit stored plans
    const trimmedPlans = plans.slice(0, MAX_PLANS);

    await this.context.globalState.update(PLANS_KEY, trimmedPlans);
  }

  /**
   * Load a plan by ID
   */
  loadPlan(planId: string): Plan | undefined {
    const plans = this.loadAllPlans();
    const stored = plans.find(p => p.plan.id === planId);
    return stored?.plan;
  }

  /**
   * Load all plans
   */
  loadAllPlans(): StoredPlan[] {
    return this.context.globalState.get<StoredPlan[]>(PLANS_KEY, []);
  }

  /**
   * Delete a plan
   */
  async deletePlan(planId: string): Promise<boolean> {
    const plans = this.loadAllPlans();
    const filtered = plans.filter(p => p.plan.id !== planId);

    if (filtered.length === plans.length) {
      return false;
    }

    await this.context.globalState.update(PLANS_KEY, filtered);
    return true;
  }

  /**
   * Get recent plans
   */
  getRecentPlans(limit: number = 10): Plan[] {
    const plans = this.loadAllPlans();
    return plans
      .slice(0, limit)
      .map(p => p.plan);
  }

  /**
   * Search plans by intent
   */
  searchPlans(query: string): Plan[] {
    const plans = this.loadAllPlans();
    const lowerQuery = query.toLowerCase();

    return plans
      .filter(p =>
        p.plan.intent.toLowerCase().includes(lowerQuery) ||
        p.plan.summary.toLowerCase().includes(lowerQuery)
      )
      .map(p => p.plan);
  }

  /**
   * Add history entry
   */
  async addHistoryEntry(entry: PlanHistoryEntry): Promise<void> {
    const history = this.loadHistory();
    history.unshift(entry);

    const trimmedHistory = history.slice(0, MAX_HISTORY);
    await this.context.globalState.update(HISTORY_KEY, trimmedHistory);
  }

  /**
   * Load history
   */
  loadHistory(): PlanHistoryEntry[] {
    return this.context.globalState.get<PlanHistoryEntry[]>(HISTORY_KEY, []);
  }

  /**
   * Get history for a specific plan
   */
  getPlanHistory(planId: string): PlanHistoryEntry[] {
    return this.loadHistory().filter(e => e.planId === planId);
  }

  /**
   * Clear all history
   */
  async clearHistory(): Promise<void> {
    await this.context.globalState.update(HISTORY_KEY, []);
  }

  /**
   * Generate a simple checksum for integrity
   */
  private generateChecksum(plan: Plan): string {
    const str = JSON.stringify(plan);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  /**
   * Export all plans to JSON
   */
  exportPlans(): string {
    const plans = this.loadAllPlans();
    return JSON.stringify(plans, null, 2);
  }

  /**
   * Import plans from JSON
   */
  async importPlans(json: string): Promise<number> {
    try {
      const imported = JSON.parse(json) as StoredPlan[];
      const existing = this.loadAllPlans();

      // Merge, avoiding duplicates
      const existingIds = new Set(existing.map(p => p.plan.id));
      const newPlans = imported.filter(p => !existingIds.has(p.plan.id));

      const merged = [...newPlans, ...existing].slice(0, MAX_PLANS);
      await this.context.globalState.update(PLANS_KEY, merged);

      return newPlans.length;
    } catch {
      return 0;
    }
  }
}
