/**
 * Engineer Module
 *
 * Station Engineer — proactive project-aware assistant.
 */

export {
  Suggestion,
  HistoryEntry,
  EngineerState,
  HealthStatus,
  RiskLevel,
  ConfidenceLevel,
  SuggestionSource,
  ActionType,
  Decision,
  UserAction,
  DelegateRole,
  TriggerContext,
  TriggerResult,
  ScoringFactors,
  EngineerStatusMessage,
  EngineerSuggestionsMessage,
  EngineerHistoryMessage,
  EngineerPromptMessage,
  DEFAULT_ENGINEER_STATE,
  DISMISSAL_COOLDOWN_MS,
  MAX_HISTORY_ENTRIES,
  MAX_AI_SUGGESTIONS,
  LOW_SCORE_THRESHOLD,
} from './EngineerTypes';

export {
  computeScore,
  rankSuggestions,
  deriveHealth,
  countAlerts,
  riskToNumber,
  confidenceToNumber,
} from './EngineerScorer';

export { EngineerPersistence } from './EngineerPersistence';

export { runAllTriggers, RULE_TRIGGERS } from './RuleTriggers';

export {
  EngineerEngine,
  initEngineerEngine,
  getEngineerEngine,
} from './EngineerEngine';
