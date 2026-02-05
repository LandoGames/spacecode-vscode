/**
 * Rate Limit Detector
 *
 * Detects rate limiting from AI provider error messages and outputs.
 * Supports Claude, OpenAI, and generic HTTP 429 patterns.
 */

/** Rate limit detection result */
export interface RateLimitInfo {
  detected: boolean;
  provider: 'claude' | 'openai' | 'generic' | null;
  retryAfterMs: number | null;
  message: string | null;
}

/** Patterns for detecting rate limits */
const RATE_LIMIT_PATTERNS: Array<{
  pattern: RegExp;
  provider: RateLimitInfo['provider'];
  extractRetryMs?: (match: RegExpMatchArray) => number | null;
}> = [
  // HTTP 429
  {
    pattern: /429|too many requests/i,
    provider: 'generic',
  },
  // Claude / Anthropic
  {
    pattern: /rate[_\s-]?limit(?:ed)?/i,
    provider: 'claude',
  },
  {
    pattern: /overloaded|capacity|anthropic.*limit/i,
    provider: 'claude',
  },
  {
    pattern: /please retry after (\d+)/i,
    provider: 'claude',
    extractRetryMs: (m) => parseInt(m[1]) * 1000,
  },
  // OpenAI / GPT
  {
    pattern: /openai.*rate|rate.*openai/i,
    provider: 'openai',
  },
  {
    pattern: /quota.*exceeded|exceeded.*quota/i,
    provider: 'openai',
  },
  {
    pattern: /tokens per min|TPM|RPM/i,
    provider: 'openai',
  },
  // Retry-After header value
  {
    pattern: /retry[_\s-]?after[:\s]+(\d+)/i,
    provider: 'generic',
    extractRetryMs: (m) => parseInt(m[1]) * 1000,
  },
  // Generic
  {
    pattern: /resource.*exhausted|service.*unavailable/i,
    provider: 'generic',
  },
  {
    pattern: /too many concurrent|concurrent.*limit/i,
    provider: 'generic',
  },
];

/**
 * Detect rate limiting from an error message or output
 */
export function detectRateLimit(text: string): RateLimitInfo {
  if (!text) return { detected: false, provider: null, retryAfterMs: null, message: null };

  for (const { pattern, provider, extractRetryMs } of RATE_LIMIT_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const retryAfterMs = extractRetryMs ? extractRetryMs(match) : null;
      return {
        detected: true,
        provider,
        retryAfterMs,
        message: match[0],
      };
    }
  }

  return { detected: false, provider: null, retryAfterMs: null, message: null };
}

/**
 * Check if error should trigger agent fallback
 */
export function shouldFallback(info: RateLimitInfo, currentAgent: string): boolean {
  if (!info.detected) return false;

  // If the rate-limited provider matches current agent, try fallback
  if (info.provider === 'claude' && currentAgent.includes('claude')) return true;
  if (info.provider === 'openai' && currentAgent.includes('gpt')) return true;

  // Generic rate limits always suggest fallback
  if (info.provider === 'generic') return true;

  return false;
}

/**
 * Calculate recommended wait time
 */
export function getWaitTime(info: RateLimitInfo, retryAttempt: number, baseDelayMs: number): number {
  // Use provider-specified retry-after if available
  if (info.retryAfterMs) return info.retryAfterMs;

  // Exponential backoff: base * 2^attempt
  return baseDelayMs * Math.pow(2, retryAttempt);
}
