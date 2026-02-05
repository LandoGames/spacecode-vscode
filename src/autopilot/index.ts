/**
 * Autopilot Module
 *
 * Autonomous plan execution engine with pause/resume,
 * retry with backoff, agent fallback, and session persistence.
 */

export {
  AutopilotStatus,
  AutopilotState,
  AutopilotConfig,
  AutopilotStepResult,
  AutopilotEvent,
  AutopilotEventType,
  AutopilotSessionData,
  AutopilotStatusMessage,
  AutopilotStepMessage,
  AutopilotConfigMessage,
  ErrorStrategyType,
  DEFAULT_AUTOPILOT_CONFIG,
  DEFAULT_AUTOPILOT_STATE,
} from './AutopilotTypes';

export {
  AutopilotEngine,
  getAutopilotEngine,
  initAutopilotEngine,
} from './AutopilotEngine';

export { AutopilotSession } from './AutopilotSession';

export {
  detectRateLimit,
  shouldFallback,
  getWaitTime,
} from './RateLimitDetector';
export type { RateLimitInfo } from './RateLimitDetector';

export {
  evaluateError,
  sleep,
} from './ErrorStrategy';
export type { ErrorDecision } from './ErrorStrategy';
