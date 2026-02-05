// @ts-nocheck

import { getQualityScanner } from '../../../quality';
import { getSecurityScanner } from '../../../security';

export async function handleQualityMessage(panel: any, message: any): Promise<boolean> {
  switch (message.type) {
    case 'qualityScan': {
      const scanner = getQualityScanner();
      panel._postMessage({ type: 'qualityScanStarted' });
      try {
        const result = await scanner.scan(message.options || undefined);

        // Augment with Semgrep quality findings if available
        const secScanner = getSecurityScanner();
        const semgrepMode = await secScanner.getSemgrepMode();
        let semgrepQualityCount = 0;

        if (semgrepMode === 'full') {
          try {
            const semgrepResult = await secScanner.scanWithProfile('quality');
            semgrepQualityCount = semgrepResult.findings.length;
            if (semgrepResult.findings.length > 0) {
              result.semgrepFindings = semgrepResult.findings;
            }
          } catch { /* Semgrep quality scan is best-effort */ }
        }

        panel._postMessage({ type: 'qualityScanResult', result, semgrepMode, semgrepQualityCount });
      } catch (err: any) {
        panel._postMessage({ type: 'qualityScanError', error: err?.message || 'Scan failed' });
      }
      return true;
    }

    case 'qualityExport': {
      const scanner = getQualityScanner();
      try {
        const result = await scanner.scan(message.options || undefined);
        const report = await scanner.generateReport(result);
        const markdown = scanner.exportAsMarkdown(report);
        panel._postMessage({ type: 'qualityExportResult', markdown, report });
      } catch (err: any) {
        panel._postMessage({ type: 'qualityScanError', error: err?.message || 'Export failed' });
      }
      return true;
    }

    default:
      return false;
  }
}
