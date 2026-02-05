// @ts-nocheck

import { getSecurityScanner } from '../../../security';

export async function handleSecurityMessage(panel: any, message: any): Promise<boolean> {
  switch (message.type) {
    case 'securityScan': {
      const scanner = getSecurityScanner();
      panel._postMessage({ type: 'securityScanStarted' });
      try {
        const result = await scanner.scan(message.options || {});
        panel._postMessage({ type: 'securityScanResult', result });
      } catch (err: any) {
        panel._postMessage({ type: 'securityScanError', error: err?.message || 'Scan failed' });
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
