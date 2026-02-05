// @ts-nocheck

import { getQualityScanner } from '../../../quality';

export async function handleQualityMessage(panel: any, message: any): Promise<boolean> {
  switch (message.type) {
    case 'qualityScan': {
      const scanner = getQualityScanner();
      panel._postMessage({ type: 'qualityScanStarted' });
      try {
        const result = await scanner.scan(message.options || undefined);
        panel._postMessage({ type: 'qualityScanResult', result });
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
