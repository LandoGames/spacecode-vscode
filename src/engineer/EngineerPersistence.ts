/**
 * Engineer Persistence
 *
 * Read/write `.spacecode/engineer-state.json` for suggestion state,
 * history, and dismissal tracking.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  EngineerState,
  HistoryEntry,
  Suggestion,
  DEFAULT_ENGINEER_STATE,
  MAX_HISTORY_ENTRIES,
  DISMISSAL_COOLDOWN_MS,
  Decision,
} from './EngineerTypes';

const STATE_FILE = 'engineer-state.json';

export class EngineerPersistence {
  private state: EngineerState;
  private filePath: string;

  constructor(workspaceDir: string) {
    this.filePath = path.join(workspaceDir, '.spacecode', STATE_FILE);
    this.state = this.load();
  }

  /** Load state from disk, returning defaults if missing/corrupt */
  private load(): EngineerState {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw);
        return {
          lastScanAt: parsed.lastScanAt || '',
          healthStatus: parsed.healthStatus || 'ok',
          activeSuggestions: Array.isArray(parsed.activeSuggestions) ? parsed.activeSuggestions : [],
          history: Array.isArray(parsed.history) ? parsed.history : [],
          dismissed: parsed.dismissed && typeof parsed.dismissed === 'object' ? parsed.dismissed : {},
        };
      }
    } catch {
      // Corrupt file — start fresh
    }
    return { ...DEFAULT_ENGINEER_STATE };
  }

  /** Write current state to disk */
  save(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf8');
    } catch {
      // Silent fail — state is non-critical
    }
  }

  /** Get current state (read-only snapshot) */
  getState(): EngineerState {
    return this.state;
  }

  /** Replace active suggestions and update scan timestamp + health */
  updateSuggestions(suggestions: Suggestion[], healthStatus: EngineerState['healthStatus']): void {
    this.state.activeSuggestions = suggestions;
    this.state.healthStatus = healthStatus;
    this.state.lastScanAt = new Date().toISOString();
    this.save();
  }

  /** Record a user decision on a suggestion */
  recordDecision(suggestionId: string, decision: Decision): void {
    const suggestion = this.state.activeSuggestions.find(s => s.id === suggestionId);
    const title = suggestion?.title || suggestionId;

    // Add to history
    const entry: HistoryEntry = {
      suggestionId,
      title,
      decision,
      decidedAt: new Date().toISOString(),
    };
    this.state.history.unshift(entry);

    // Evict old entries
    if (this.state.history.length > MAX_HISTORY_ENTRIES) {
      this.state.history = this.state.history.slice(0, MAX_HISTORY_ENTRIES);
    }

    // Track dismissals for cooldown
    if (decision === 'dismissed') {
      this.state.dismissed[suggestionId] = new Date().toISOString();
    }

    // Remove from active suggestions
    this.state.activeSuggestions = this.state.activeSuggestions.filter(s => s.id !== suggestionId);

    this.save();
  }

  /** Check if a suggestion is within its 24h dismissal cooldown */
  isDismissed(suggestionId: string): boolean {
    const dismissedAt = this.state.dismissed[suggestionId];
    if (!dismissedAt) return false;
    const elapsed = Date.now() - new Date(dismissedAt).getTime();
    return elapsed < DISMISSAL_COOLDOWN_MS;
  }

  /** Clean up expired dismissals */
  cleanExpiredDismissals(): void {
    const now = Date.now();
    let changed = false;
    for (const [id, timestamp] of Object.entries(this.state.dismissed)) {
      if (now - new Date(timestamp).getTime() >= DISMISSAL_COOLDOWN_MS) {
        delete this.state.dismissed[id];
        changed = true;
      }
    }
    if (changed) this.save();
  }

  /** Get recent history entries */
  getHistory(limit = 20): HistoryEntry[] {
    return this.state.history.slice(0, limit);
  }
}
