/**
 * Security Module
 *
 * Exports all security scanning tools and types.
 */

export * from './types';
export { SecretScanner, getSecretScanner, SECRET_PATTERNS } from './SecretScanner';
export { CryptoScanner, getCryptoScanner } from './CryptoScanner';
export { InjectionScanner, getInjectionScanner } from './InjectionScanner';
export { SecurityScanner, getSecurityScanner } from './SecurityScanner';

// Semgrep SAST integration
export * from './SemgrepTypes';
export { SemgrepRunner, getSemgrepRunner, initSemgrepRunner } from './SemgrepRunner';
export type { SemgrepScanResult } from './SemgrepRunner';
export { SemgrepRulesManager, getSemgrepRulesManager, initSemgrepRulesManager, SCAN_PROFILES } from './SemgrepRules';
export type { ScanProfile, CustomRuleInfo } from './SemgrepRules';
