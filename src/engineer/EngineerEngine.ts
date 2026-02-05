/**
 * Engineer Engine
 *
 * Orchestrates rule triggers, scoring, filtering, and persistence.
 * Central entry point for the Station Engineer system.
 */

import {
  Suggestion,
  TriggerContext,
  HealthStatus,
  UserAction,
  DelegateRole,
  MAX_AI_SUGGESTIONS,
  LOW_SCORE_THRESHOLD,
  EngineerState,
} from './EngineerTypes';
import { computeScore, rankSuggestions, deriveHealth, countAlerts } from './EngineerScorer';
import { EngineerPersistence } from './EngineerPersistence';
import { runAllTriggers } from './RuleTriggers';

let _instance: EngineerEngine | null = null;

export class EngineerEngine {
  private persistence: EngineerPersistence;
  private workspaceDir: string;

  constructor(workspaceDir: string) {
    this.workspaceDir = workspaceDir;
    this.persistence = new EngineerPersistence(workspaceDir);
  }

  /** Run a full scan: execute rule triggers, score, filter, persist */
  scan(ctx: TriggerContext): { suggestions: Suggestion[]; health: HealthStatus; alertCount: number } {
    this.persistence.cleanExpiredDismissals();

    // Run rule triggers
    const triggerResults = runAllTriggers(ctx);

    // Convert trigger results to suggestions
    const suggestions: Suggestion[] = triggerResults.map(tr => ({
      id: `rule-${tr.triggerId}-${Date.now()}`,
      title: tr.title,
      why: tr.why,
      source: 'rule' as const,
      risk: tr.risk,
      confidence: tr.confidence,
      score: computeScore(tr.factors),
      sectorId: tr.sectorId,
      actionType: tr.actionType,
      delegateTo: tr.delegateTo,
      createdAt: new Date().toISOString(),
      triggerId: tr.triggerId,
    }));

    // Filter: reject duplicates (same triggerId as existing active)
    const state = this.persistence.getState();
    const existingTriggerIds = new Set(state.activeSuggestions.map(s => s.triggerId).filter(Boolean));
    const filtered = suggestions.filter(s => {
      // Skip dismissed suggestions (24h cooldown)
      if (s.triggerId && this.persistence.isDismissed(`rule-${s.triggerId}`)) return false;
      // Skip duplicates of still-active suggestions
      if (s.triggerId && existingTriggerIds.has(s.triggerId)) return false;
      return true;
    });

    // Merge: keep existing un-decided suggestions that are still valid
    const merged = [...filtered];

    // Rank
    const ranked = rankSuggestions(merged);

    // Derive health
    const health = deriveHealth(ranked);
    const alertCount = countAlerts(ranked);

    // Persist
    this.persistence.updateSuggestions(ranked, health);

    return { suggestions: ranked, health, alertCount };
  }

  /**
   * Add AI-generated suggestions (capped at MAX_AI_SUGGESTIONS).
   * Called separately from rule scan since AI analysis is async and optional.
   */
  addAiSuggestions(aiSuggestions: Suggestion[]): Suggestion[] {
    const state = this.persistence.getState();
    const existing = state.activeSuggestions;

    // Cap AI suggestions
    const capped = aiSuggestions.slice(0, MAX_AI_SUGGESTIONS);

    // Only add if rule-based don't fill the display
    const ruleCount = existing.filter(s => s.source === 'rule').length;
    const displayLimit = 10; // practical display limit
    const aiSlots = Math.max(0, displayLimit - ruleCount);
    const toAdd = capped.slice(0, aiSlots);

    if (toAdd.length === 0) return existing;

    const merged = rankSuggestions([...existing, ...toAdd]);
    const health = deriveHealth(merged);
    this.persistence.updateSuggestions(merged, health);

    return merged;
  }

  /** Handle user action on a suggestion */
  handleAction(suggestionId: string, action: UserAction): {
    suggestions: Suggestion[];
    health: HealthStatus;
    alertCount: number;
    queuedForAutoexecute?: boolean;
  } {
    let queuedForAutoexecute = false;

    switch (action) {
      case 'dismiss':
        this.persistence.recordDecision(suggestionId, 'dismissed');
        // Also dismiss by triggerId to prevent re-trigger
        const state = this.persistence.getState();
        const dismissed = state.history.find(h => h.suggestionId === suggestionId);
        if (dismissed) {
          // The triggerId-based dismissal key
          const originalSuggestion = [...state.activeSuggestions].find(s => s.id === suggestionId);
          if (originalSuggestion?.triggerId) {
            // Already handled in recordDecision via suggestionId
          }
        }
        break;

      case 'defer':
        this.persistence.recordDecision(suggestionId, 'deferred');
        break;

      case 'run':
        this.persistence.recordDecision(suggestionId, 'accepted');
        queuedForAutoexecute = true;
        break;

      case 'open':
        this.persistence.recordDecision(suggestionId, 'accepted');
        break;
    }

    const newState = this.persistence.getState();
    return {
      suggestions: newState.activeSuggestions,
      health: newState.healthStatus,
      alertCount: countAlerts(newState.activeSuggestions),
      queuedForAutoexecute,
    };
  }

  /** Get current state without scanning */
  getStatus(): { health: HealthStatus; alertCount: number; topAction: string; suggestions: Suggestion[] } {
    const state = this.persistence.getState();
    const topSuggestion = state.activeSuggestions[0];
    return {
      health: state.healthStatus,
      alertCount: countAlerts(state.activeSuggestions),
      topAction: topSuggestion ? `${topSuggestion.title} (score: ${topSuggestion.score})` : 'No pending actions',
      suggestions: state.activeSuggestions,
    };
  }

  /** Get suggestion history */
  getHistory(limit = 20) {
    return this.persistence.getHistory(limit);
  }

  /** Get suggestions above/below threshold for "show all" toggle */
  getVisibleSuggestions(showAll = false): Suggestion[] {
    const state = this.persistence.getState();
    if (showAll) return state.activeSuggestions;
    return state.activeSuggestions.filter(s => s.score >= LOW_SCORE_THRESHOLD);
  }

  /** Get the full persisted state */
  getState(): EngineerState {
    return this.persistence.getState();
  }

  /**
   * Inject an external event (e.g., build failure) as a suggestion.
   * Used by build pipeline integration and other event sources.
   */
  injectEvent(eventType: string, data: any): void {
    const state = this.persistence.getState();

    // Don't inject duplicates of same event type
    if (state.activeSuggestions.some(s => s.triggerId === `event-${eventType}`)) return;

    let suggestion: Suggestion | null = null;

    switch (eventType) {
      case 'buildFail': {
        const errorCount = data?.errorCount || 0;
        const firstErrors = (data?.errors || []).slice(0, 3).join('; ');
        suggestion = {
          id: `event-buildFail-${Date.now()}`,
          title: `Build failed (${errorCount} error${errorCount !== 1 ? 's' : ''})`,
          why: firstErrors ? `Compile errors: ${firstErrors}` : 'Unity build has compile errors that need fixing.',
          source: 'rule',
          risk: 'high',
          confidence: 1.0,
          score: 25,
          actionType: 'validate',
          delegateTo: 'lead-engineer' as DelegateRole,
          createdAt: new Date().toISOString(),
          triggerId: `event-${eventType}`,
        };
        break;
      }
    }

    if (suggestion) {
      const merged = rankSuggestions([suggestion, ...state.activeSuggestions]);
      const health = deriveHealth(merged);
      this.persistence.updateSuggestions(merged, health);
    }
  }

  /** Get workspace directory */
  getWorkspaceDir(): string {
    return this.workspaceDir;
  }
}

/** Initialize the singleton engine */
export function initEngineerEngine(workspaceDir: string): EngineerEngine {
  _instance = new EngineerEngine(workspaceDir);
  return _instance;
}

/** Get the singleton engine (must call init first) */
export function getEngineerEngine(): EngineerEngine | null {
  return _instance;
}
