/**
 * Engineer Scorer
 *
 * Implements the scoring formula for ranking suggestions:
 *   score = (Risk × 3) + (Impact × 2) + (Urgency × 2) - Effort
 *
 * Score range: 1–35 (theoretical), practical high: 25–30
 */

import { ScoringFactors, RiskLevel, ConfidenceLevel, HealthStatus, Suggestion } from './EngineerTypes';

/** Weight constants */
const RISK_WEIGHT = 3;
const IMPACT_WEIGHT = 2;
const URGENCY_WEIGHT = 2;
const EFFORT_WEIGHT = 1;

/**
 * Compute score from individual factors.
 * Each factor is 1–5.
 */
export function computeScore(factors: ScoringFactors): number {
  return (
    factors.risk * RISK_WEIGHT +
    factors.impact * IMPACT_WEIGHT +
    factors.urgency * URGENCY_WEIGHT -
    factors.effort * EFFORT_WEIGHT
  );
}

/** Map risk level string to numeric factor */
export function riskToNumber(risk: RiskLevel): number {
  switch (risk) {
    case 'low': return 1;
    case 'med': return 3;
    case 'high': return 5;
  }
}

/** Map confidence level string to numeric factor */
export function confidenceToNumber(confidence: ConfidenceLevel): number {
  switch (confidence) {
    case 'low': return 1;
    case 'med': return 3;
    case 'high': return 5;
  }
}

/**
 * Sort suggestions: rule-based first (by score desc), then AI (by score desc).
 */
export function rankSuggestions(suggestions: Suggestion[]): Suggestion[] {
  const rules = suggestions.filter(s => s.source === 'rule');
  const ai = suggestions.filter(s => s.source === 'ai');
  rules.sort((a, b) => b.score - a.score);
  ai.sort((a, b) => b.score - a.score);
  return [...rules, ...ai];
}

/**
 * Derive overall health status from active suggestions.
 */
export function deriveHealth(suggestions: Suggestion[]): HealthStatus {
  if (suggestions.some(s => s.risk === 'high' && s.score >= 20)) return 'critical';
  if (suggestions.some(s => s.risk === 'med' || s.score >= 12)) return 'warn';
  return 'ok';
}

/**
 * Count alerts (suggestions with score >= threshold).
 */
export function countAlerts(suggestions: Suggestion[], threshold = 8): number {
  return suggestions.filter(s => s.score >= threshold).length;
}
