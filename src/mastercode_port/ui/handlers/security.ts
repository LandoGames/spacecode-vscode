// @ts-nocheck

import { getSecurityScanner } from '../../../security';

export async function handleSecurityMessage(panel: any, message: any): Promise<boolean> {
  switch (message.type) {
    case 'securityScan': {
      const scanner = getSecurityScanner();
      panel._postMessage({ type: 'securityScanStarted' });
      try {
        const result = await scanner.scan(message.options || {});
        const semgrepMode = await scanner.getSemgrepMode();
        panel._postMessage({ type: 'securityScanResult', result, semgrepMode });
      } catch (err: any) {
        panel._postMessage({ type: 'securityScanError', error: err?.message || 'Scan failed' });
      }
      return true;
    }

    case 'securityScanWithProfile': {
      const scanner = getSecurityScanner();
      const profileId = message.profileId || 'security-full';
      panel._postMessage({ type: 'securityScanStarted' });
      try {
        const result = await scanner.scanWithProfile(profileId);
        const semgrepMode = await scanner.getSemgrepMode();
        panel._postMessage({ type: 'securityScanResult', result, semgrepMode, profileId });
      } catch (err: any) {
        panel._postMessage({ type: 'securityScanError', error: err?.message || 'Profile scan failed' });
      }
      return true;
    }

    case 'securitySemgrepStatus': {
      const scanner = getSecurityScanner();
      try {
        const semgrepStatus = await scanner.getSemgrepStatus();
        const semgrepMode = await scanner.getSemgrepMode();
        const rulesManager = scanner.getRulesManager();
        const profiles = rulesManager?.getAllProfiles() || [];
        const customRules = rulesManager?.listCustomRules() || [];
        const relevantProfiles = rulesManager?.detectRelevantProfiles() || [];

        panel._postMessage({
          type: 'securitySemgrepStatus',
          installed: semgrepStatus.installed,
          version: semgrepStatus.version,
          mode: semgrepMode,
          profiles: profiles.map(p => ({ id: p.id, name: p.name, description: p.description })),
          customRules,
          relevantProfiles,
        });
      } catch (err: any) {
        panel._postMessage({
          type: 'securitySemgrepStatus',
          installed: false,
          mode: 'unavailable',
          error: err?.message || 'Status check failed',
        });
      }
      return true;
    }

    case 'securitySupplyChainScan': {
      const scanner = getSecurityScanner();
      panel._postMessage({ type: 'securityScanStarted' });
      try {
        const result = await scanner.scanWithProfile('supply-chain');
        const semgrepMode = await scanner.getSemgrepMode();
        panel._postMessage({ type: 'securityScanResult', result, semgrepMode, profileId: 'supply-chain' });
      } catch (err: any) {
        panel._postMessage({ type: 'securityScanError', error: err?.message || 'Supply chain scan failed' });
      }
      return true;
    }

    case 'securityExport': {
      const scanner = getSecurityScanner();
      try {
        const result = await scanner.scan(message.options || {});
        const report = scanner.generateReport(result, 'markdown');
        const markdown = scanner.exportAsMarkdown(report);
        panel._postMessage({ type: 'securityExportResult', markdown, report });
      } catch (err: any) {
        panel._postMessage({ type: 'securityScanError', error: err?.message || 'Export failed' });
      }
      return true;
    }

    case 'securityFixHandoff': {
      const scanner = getSecurityScanner();
      if (message.finding) {
        const handoff = scanner.createFixHandoff(message.finding);
        panel._postMessage({ type: 'securityFixHandoff', handoff });
      }
      return true;
    }

    default:
      return false;
  }
}
