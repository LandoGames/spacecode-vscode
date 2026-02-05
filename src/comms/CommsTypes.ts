/**
 * Comms Array Types (Phase 7)
 *
 * Types for API operations, security scanning, and penetration testing.
 */

/** Comms tier levels */
export type CommsTier = 1 | 2 | 3;

/** Scan profile identifiers */
export type ScanProfile = 'gameBackend' | 'owaspTop10' | 'antiCheat' | 'fullPentest' | 'apiTest';

/** Security finding from ZAP/Pentest scans */
export interface CommsFinding {
  id: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  name: string;
  description: string;
  url: string;
  parameter?: string;
  evidence?: string;
  solution?: string;
  cwe?: string[];
  owasp?: string[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

/** Scan result */
export interface CommsScanResult {
  id: string;
  target: string;
  profile: ScanProfile | string;
  startTime: number;
  endTime?: number;
  status: 'running' | 'completed' | 'failed';
  findings: CommsFinding[];
  summary: { high: number; medium: number; low: number; info: number };
  error?: string;
}

/** Anti-cheat test result */
export interface AntiCheatResult {
  cheatType: string;
  testName: string;
  status: 'VULNERABLE' | 'SECURE' | 'UNTESTED';
  evidence?: string;
  fixRecommendation?: string;
}

/** Comms service connection status */
export interface CommsServiceStatus {
  postman: { available: boolean; error?: string };
  zap: { available: boolean; error?: string };
  pentest: { available: boolean; error?: string };
}

/** Comms Array state */
export interface CommsState {
  tier: CommsTier;
  services: CommsServiceStatus;
  recentScans: CommsScanResult[];
  activeScanId?: string;
}

/** ANTI-CHEAT TEST SUITE */
export const ANTI_CHEAT_TESTS = [
  { id: 'price-manipulation', name: 'Price Manipulation', description: 'Intercept purchase → change price to 0' },
  { id: 'item-duplication', name: 'Item Duplication', description: 'Replay "use item" request 100x' },
  { id: 'idor', name: 'IDOR', description: 'Change player ID in requests' },
  { id: 'score-injection', name: 'Score Injection', description: 'Submit impossible high score' },
  { id: 'currency-injection', name: 'Currency Injection', description: 'Modify currency values' },
  { id: 'speed-hacks', name: 'Speed Hacks', description: 'Modify timestamps' },
  { id: 'stat-hacking', name: 'Stat Hacking', description: 'Modify character attributes' },
  { id: 'paywall-bypass', name: 'Paywall Bypass', description: 'Remove premium flags' },
] as const;

/** Scan profiles */
export const SCAN_PROFILES: Record<ScanProfile, { name: string; description: string; tier: CommsTier }> = {
  apiTest: { name: 'API Test', description: 'Run API test collection', tier: 1 },
  gameBackend: { name: 'Game Backend Scan', description: 'Port scan + endpoint discovery + vulnerability scan', tier: 2 },
  owaspTop10: { name: 'OWASP Top 10 Audit', description: 'Check for OWASP Top 10 vulnerabilities', tier: 2 },
  antiCheat: { name: 'Anti-Cheat Audit', description: 'Test for common game cheating vulnerabilities', tier: 2 },
  fullPentest: { name: 'Full Pentest', description: 'Comprehensive penetration test (Nmap + ZAP + SQLMap)', tier: 3 },
};
