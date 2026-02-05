/**
 * Error Strategy
 *
 * Handles step failures with configurable strategies:
 * - retry: Retry with exponential backoff, optionally switch agent
 * - skip: Mark step as skipped and continue
 * - abort: Stop autopilot execution
 */

import { ErrorStrategyType, AutopilotConfig } from './AutopilotTypes';
import { ExecutionAgent } from '../execution/types';
import { detectRateLimit, shouldFallback, getWaitTime } from './RateLimitDetector';

/** Decision from error strategy */
export interface ErrorDecision {
  action: 'retry' | 'retry-fallback' | 'skip' | 'abort';
  /** Wait time before retry in ms */
  waitMs: number;
  /** Agent to use for retry (may differ from current if fallback) */
  agent: ExecutionAgent;
  /** Human-readable reason */
  reason: string;
}

/**
 * Evaluate error and decide what to do
 */
export function evaluateError(
  error: string,
  currentAgent: ExecutionAgent,
  retryAttempt: number,
  config: AutopilotConfig
): ErrorDecision {
  // Check for rate limiting
  const rateLimitInfo = detectRateLimit(error);

  if (rateLimitInfo.detected) {
    return handleRateLimit(rateLimitInfo, currentAgent, retryAttempt, config);
  }

  // Non-rate-limit error — use configured strategy
  return handleGenericError(error, currentAgent, retryAttempt, config);
}

/** Handle rate limit errors */
function handleRateLimit(
  rateLimitInfo: ReturnType<typeof detectRateLimit>,
  currentAgent: ExecutionAgent,
  retryAttempt: number,
  config: AutopilotConfig
): ErrorDecision {
  // Try fallback agent if available
  if (shouldFallback(rateLimitInfo, currentAgent) && config.fallbackAgent && config.fallbackAgent !== currentAgent) {
    return {
      action: 'retry-fallback',
      waitMs: 1000, // Brief pause before switching
      agent: config.fallbackAgent,
      reason: `Rate limited by ${rateLimitInfo.provider}. Switching to fallback agent.`,
    };
  }

  // No fallback — retry with backoff if under limit
  if (retryAttempt < config.maxRetries) {
    const waitMs = getWaitTime(rateLimitInfo, retryAttempt, config.retryBaseDelayMs);
    return {
      action: 'retry',
      waitMs,
      agent: currentAgent,
      reason: `Rate limited. Waiting ${(waitMs / 1000).toFixed(1)}s before retry (attempt ${retryAttempt + 1}/${config.maxRetries}).`,
    };
  }

  // Exhausted retries
  if (config.errorStrategy === 'skip') {
    return {
      action: 'skip',
      waitMs: 0,
      agent: currentAgent,
      reason: `Rate limited. All retries exhausted. Skipping step.`,
    };
  }

  return {
    action: 'abort',
    waitMs: 0,
    agent: currentAgent,
    reason: `Rate limited. All retries exhausted. Aborting autopilot.`,
  };
}

/** Handle generic (non-rate-limit) errors */
function handleGenericError(
  error: string,
  currentAgent: ExecutionAgent,
  retryAttempt: number,
  config: AutopilotConfig
): ErrorDecision {
  switch (config.errorStrategy) {
    case 'retry':
      if (retryAttempt < config.maxRetries) {
        const waitMs = config.retryBaseDelayMs * Math.pow(2, retryAttempt);
        return {
          action: 'retry',
          waitMs,
          agent: currentAgent,
          reason: `Step failed. Retrying in ${(waitMs / 1000).toFixed(1)}s (attempt ${retryAttempt + 1}/${config.maxRetries}).`,
        };
      }
      // Fall through to abort after retries exhausted
      return {
        action: 'abort',
        waitMs: 0,
        agent: currentAgent,
        reason: `Step failed after ${config.maxRetries} retries. Aborting.`,
      };

    case 'skip':
      return {
        action: 'skip',
        waitMs: 0,
        agent: currentAgent,
        reason: `Step failed. Skipping and continuing.`,
      };

    case 'abort':
    default:
      return {
        action: 'abort',
        waitMs: 0,
        agent: currentAgent,
        reason: `Step failed. Aborting autopilot.`,
      };
  }
}

/** Sleep utility */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
