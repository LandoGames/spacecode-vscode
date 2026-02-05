// @ts-nocheck

/**
 * Comms Array Handler (Phase 7)
 *
 * Handles webview messages for comms tier management, MCP service checking,
 * scan execution, and finding investigation/fix prompt generation.
 */

import * as vscode from 'vscode';
import { getCommsManager, setCommsWorkspaceDir } from '../../../comms';
import { SCAN_PROFILES } from '../../../comms/CommsTypes';

let _commsInitialized = false;
function ensureCommsInit() {
  if (!_commsInitialized) {
    const wsDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (wsDir) setCommsWorkspaceDir(wsDir);
    _commsInitialized = true;
  }
}

export async function handleCommsMessage(panel: any, message: any): Promise<boolean> {
  switch (message.type) {

    case 'commsGetState': {
      ensureCommsInit();
      const manager = getCommsManager();
      const state = manager.getState();
      panel._postMessage({
        type: 'commsState',
        ...state,
        profiles: SCAN_PROFILES,
      });
      return true;
    }

    case 'commsSetTier': {
      const manager = getCommsManager();
      const tier = message.tier;
      if (tier >= 1 && tier <= 3) {
        manager.setTier(tier);
      }
      panel._postMessage({
        type: 'commsState',
        ...manager.getState(),
        profiles: SCAN_PROFILES,
      });
      return true;
    }

    case 'commsCheckServices': {
      const manager = getCommsManager();
      try {
        const mcpClient = panel._mcpClient || null;
        const services = await manager.checkServices(mcpClient);
        panel._postMessage({
          type: 'commsServicesChecked',
          services,
        });
      } catch (err: any) {
        panel._postMessage({
          type: 'commsServicesChecked',
          services: manager.getState().services,
          error: err?.message || String(err),
        });
      }
      return true;
    }

    case 'commsStartScan': {
      const manager = getCommsManager();
      const profile = message.profile || 'apiTest';
      const target = message.target || '';

      if (!target) {
        panel._postMessage({ type: 'commsError', error: 'No target URL specified.' });
        return true;
      }

      // Check tier requirement
      const profileDef = SCAN_PROFILES[profile];
      if (profileDef && manager.getTier() < profileDef.tier) {
        panel._postMessage({
          type: 'commsError',
          error: `Scan "${profileDef.name}" requires Comms Tier ${profileDef.tier}. Current tier: ${manager.getTier()}.`,
        });
        return true;
      }

      const scan = await manager.startScan(profile, target);
      panel._postMessage({
        type: 'commsScanStarted',
        scan,
      });

      // Simulate scan execution via MCP tools if available
      try {
        const mcpClient = panel._mcpClient || null;
        let findings = [];

        if (mcpClient && typeof mcpClient.callTool === 'function') {
          // Route to appropriate MCP tool based on profile
          if (profile === 'apiTest' && manager.getState().services.postman.available) {
            const result = await mcpClient.callTool('postman_run_collection', { url: target });
            findings = parsePostmanFindings(result);
          } else if (['owaspTop10', 'gameBackend'].includes(profile) && manager.getState().services.zap.available) {
            const result = await mcpClient.callTool('zap_spider_and_scan', { target_url: target });
            findings = parseZapFindings(result);
          } else if (profile === 'fullPentest' && manager.getState().services.pentest.available) {
            const result = await mcpClient.callTool('nmap_scan', { target });
            findings = parsePentestFindings(result);
          }
        }

        const completed = manager.completeScan(scan.id, findings);
        panel._postMessage({
          type: 'commsScanCompleted',
          scan: completed,
        });
      } catch (err: any) {
        const failed = manager.completeScan(scan.id, [], err?.message || String(err));
        panel._postMessage({
          type: 'commsScanCompleted',
          scan: failed,
        });
      }
      return true;
    }

    case 'commsGetScan': {
      const manager = getCommsManager();
      const scan = manager.getScan(message.scanId);
      if (scan) {
        panel._postMessage({ type: 'commsScanDetail', scan });
      } else {
        panel._postMessage({ type: 'commsError', error: 'Scan not found.' });
      }
      return true;
    }

    case 'commsGetRecentScans': {
      const manager = getCommsManager();
      const scans = manager.getRecentScans(message.limit || 10);
      panel._postMessage({ type: 'commsRecentScans', scans });
      return true;
    }

    case 'commsInvestigate': {
      const manager = getCommsManager();
      const finding = message.finding;
      if (finding) {
        const prompt = manager.getInvestigationPrompt(finding);
        panel._postMessage({ type: 'commsPrompt', prompt, action: 'investigate' });
      }
      return true;
    }

    case 'commsGenerateFix': {
      const manager = getCommsManager();
      const finding = message.finding;
      if (finding) {
        const prompt = manager.getFixPrompt(finding);
        panel._postMessage({ type: 'commsPrompt', prompt, action: 'fix' });
      }
      return true;
    }

    default:
      return false;
  }
}

/** Parse Postman MCP results into CommsFinding[] */
function parsePostmanFindings(result: any): any[] {
  if (!result) return [];
  const findings = [];
  const tests = result?.tests || result?.results || [];
  for (const test of (Array.isArray(tests) ? tests : [])) {
    if (test.status === 'fail' || test.passed === false) {
      findings.push({
        id: `postman-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        severity: 'MEDIUM',
        name: test.name || 'API Test Failure',
        description: test.message || test.error || 'Test failed',
        url: test.url || '',
        confidence: 'MEDIUM',
      });
    }
  }
  return findings;
}

/** Parse ZAP MCP results into CommsFinding[] */
function parseZapFindings(result: any): any[] {
  if (!result) return [];
  const findings = [];
  const alerts = result?.alerts || result?.findings || [];
  for (const alert of (Array.isArray(alerts) ? alerts : [])) {
    findings.push({
      id: `zap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      severity: mapZapRisk(alert.risk || alert.severity || 'Low'),
      name: alert.name || alert.alert || 'ZAP Finding',
      description: alert.description || alert.desc || '',
      url: alert.url || '',
      parameter: alert.param || undefined,
      evidence: alert.evidence || undefined,
      solution: alert.solution || undefined,
      cwe: alert.cweid ? [String(alert.cweid)] : undefined,
      confidence: mapZapConfidence(alert.confidence || 'Medium'),
    });
  }
  return findings;
}

/** Parse Nmap/Pentest MCP results into CommsFinding[] */
function parsePentestFindings(result: any): any[] {
  if (!result) return [];
  const findings = [];
  const ports = result?.ports || result?.open_ports || [];
  for (const port of (Array.isArray(ports) ? ports : [])) {
    findings.push({
      id: `pentest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      severity: 'INFO',
      name: `Open port: ${port.port || port}/${port.protocol || 'tcp'}`,
      description: port.service ? `Service: ${port.service} ${port.version || ''}` : 'Open port detected',
      url: '',
      confidence: 'HIGH',
    });
  }
  const vulns = result?.vulnerabilities || result?.vulns || [];
  for (const vuln of (Array.isArray(vulns) ? vulns : [])) {
    findings.push({
      id: `pentest-vuln-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      severity: mapZapRisk(vuln.severity || 'Medium'),
      name: vuln.name || vuln.title || 'Vulnerability',
      description: vuln.description || '',
      url: vuln.url || '',
      cwe: vuln.cwe ? [String(vuln.cwe)] : undefined,
      confidence: 'MEDIUM',
    });
  }
  return findings;
}

function mapZapRisk(risk: string): string {
  const r = (risk || '').toLowerCase();
  if (r === 'high' || r === '3') return 'HIGH';
  if (r === 'medium' || r === '2') return 'MEDIUM';
  if (r === 'low' || r === '1') return 'LOW';
  return 'INFO';
}

function mapZapConfidence(conf: string): string {
  const c = (conf || '').toLowerCase();
  if (c === 'high' || c === '3') return 'HIGH';
  if (c === 'medium' || c === '2') return 'MEDIUM';
  return 'LOW';
}
