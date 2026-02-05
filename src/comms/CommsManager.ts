// @ts-nocheck

/**
 * Comms Array Manager (Phase 7)
 *
 * Manages comms tier, service connections, and scan execution.
 * Orchestrates MCP-based tools (Postman, ZAP, Kali Pentest).
 */

import * as fs from 'fs';
import * as pathMod from 'path';

import {
  CommsTier,
  CommsState,
  CommsScanResult,
  CommsFinding,
  CommsServiceStatus,
  ScanProfile,
  AntiCheatResult,
  ANTI_CHEAT_TESTS,
} from './CommsTypes';

let _instance: CommsManager | null = null;
let _commsWorkspaceDir: string | null = null;

export class CommsManager {
  private state: CommsState;

  constructor() {
    this.state = {
      tier: 1,
      services: {
        postman: { available: false },
        zap: { available: false },
        pentest: { available: false },
      },
      recentScans: [],
    };
    this._loadFromDisk();
  }

  private _loadFromDisk(): void {
    if (!_commsWorkspaceDir) return;
    try {
      const filePath = pathMod.join(_commsWorkspaceDir, '.spacecode', 'comms-scans.json');
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (Array.isArray(data.recentScans)) this.state.recentScans = data.recentScans;
        if (data.tier) this.state.tier = data.tier;
      }
    } catch { /* ignore */ }
  }

  private _saveToDisk(): void {
    if (!_commsWorkspaceDir) return;
    try {
      const dir = pathMod.join(_commsWorkspaceDir, '.spacecode');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        pathMod.join(dir, 'comms-scans.json'),
        JSON.stringify({ tier: this.state.tier, recentScans: this.state.recentScans }, null, 2),
        'utf8'
      );
    } catch { /* ignore */ }
  }

  getState(): CommsState {
    return { ...this.state };
  }

  setTier(tier: CommsTier): void {
    this.state.tier = tier;
    this._saveToDisk();
  }

  getTier(): CommsTier {
    return this.state.tier;
  }

  /** Check which MCP services are available */
  async checkServices(mcpClient: any): Promise<CommsServiceStatus> {
    // Postman — check if postman MCP tools are available
    try {
      if (mcpClient && typeof mcpClient.listTools === 'function') {
        const tools = await mcpClient.listTools();
        const toolNames = (tools || []).map(t => t.name || '');
        this.state.services.postman.available = toolNames.some(n => n.includes('postman'));
        this.state.services.zap.available = toolNames.some(n => n.includes('zap'));
        this.state.services.pentest.available = toolNames.some(n => n.includes('nmap') || n.includes('pentest'));
      }
    } catch {
      // MCP not available
    }

    return { ...this.state.services };
  }

  /** Start a scan — returns immediately with scan ID, results come via events */
  async startScan(profile: ScanProfile, target: string): Promise<CommsScanResult> {
    const scan: CommsScanResult = {
      id: `scan-${Date.now()}`,
      target,
      profile,
      startTime: Date.now(),
      status: 'running',
      findings: [],
      summary: { high: 0, medium: 0, low: 0, info: 0 },
    };

    this.state.activeScanId = scan.id;
    this.state.recentScans.unshift(scan);

    // Keep only last 20 scans
    if (this.state.recentScans.length > 20) {
      this.state.recentScans = this.state.recentScans.slice(0, 20);
    }

    return scan;
  }

  /** Complete a scan with results */
  completeScan(scanId: string, findings: CommsFinding[], error?: string): CommsScanResult | null {
    const scan = this.state.recentScans.find(s => s.id === scanId);
    if (!scan) return null;

    scan.endTime = Date.now();
    scan.status = error ? 'failed' : 'completed';
    scan.error = error;
    scan.findings = findings;
    scan.summary = {
      high: findings.filter(f => f.severity === 'HIGH').length,
      medium: findings.filter(f => f.severity === 'MEDIUM').length,
      low: findings.filter(f => f.severity === 'LOW').length,
      info: findings.filter(f => f.severity === 'INFO').length,
    };

    if (this.state.activeScanId === scanId) {
      this.state.activeScanId = undefined;
    }

    this._saveToDisk();
    return { ...scan };
  }

  /** Get scan by ID */
  getScan(scanId: string): CommsScanResult | undefined {
    return this.state.recentScans.find(s => s.id === scanId);
  }

  /** Get recent scans */
  getRecentScans(limit = 10): CommsScanResult[] {
    return this.state.recentScans.slice(0, limit);
  }

  /** Generate investigation prompt for a finding */
  getInvestigationPrompt(finding: CommsFinding): string {
    return `Analyze this vulnerability and explain how to exploit and fix it:

**${finding.name}** (${finding.severity})
- URL: ${finding.url}
${finding.parameter ? `- Parameter: ${finding.parameter}` : ''}
${finding.evidence ? `- Evidence: ${finding.evidence}` : ''}
${finding.cwe?.length ? `- CWE: ${finding.cwe.join(', ')}` : ''}

Provide:
1. How this vulnerability works
2. Proof-of-concept exploitation steps
3. Code fix with parameterized queries / proper validation
4. Additional hardening recommendations`;
  }

  /** Generate fix prompt for a finding */
  getFixPrompt(finding: CommsFinding): string {
    return `Generate a code fix for this security vulnerability:

**${finding.name}** (${finding.severity})
- URL: ${finding.url}
${finding.parameter ? `- Parameter: ${finding.parameter}` : ''}
${finding.solution ? `- Suggested solution: ${finding.solution}` : ''}

Generate production-ready code that fixes this issue. Include input validation, parameterized queries, and any other necessary hardening.`;
  }
}

/** Set workspace directory for persistence */
export function setCommsWorkspaceDir(dir: string): void {
  _commsWorkspaceDir = dir;
}

/** Get the singleton CommsManager */
export function getCommsManager(): CommsManager {
  if (!_instance) {
    _instance = new CommsManager();
  }
  return _instance;
}
