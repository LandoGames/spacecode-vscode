// @ts-nocheck

import { getDocsManager } from '../../../docs/DocsManager';
import { saveSettings } from '../../../settings';

export async function handleDocsMessage(panel: any, message: any): Promise<boolean> {
  switch (message.type) {
    case 'getContextPreview':
      await panel._sendContextPreview();
      return true;

    case 'getDocTargets':
      panel._sendDocTargets();
      return true;

    case 'docTargetChanged':
      panel._docTarget = typeof message.docTarget === 'string' ? message.docTarget : '';
      panel._scheduleContextPreviewSend();
      return true;

    case 'openDocTarget':
      if (typeof message.docTarget === 'string' && message.docTarget) {
        panel._openDocFile(message.docTarget);
      }
      return true;

    case 'getDocInfo':
      if (typeof message.docTarget === 'string' && message.docTarget) {
        panel._sendDocInfo(message.docTarget);
      }
      return true;

    // ── 5.1: Project Complexity ──────────────────────────────────────────────

    case 'docsGetComplexity': {
      const mgr = getDocsManager();
      const complexity = mgr.getComplexity();
      panel._postMessage({ type: 'docsComplexity', complexity: complexity || null });
      return true;
    }

    case 'docsSetComplexity': {
      const mgr = getDocsManager();
      if (message.complexity === 'simple' || message.complexity === 'complex') {
        await mgr.setComplexity(message.complexity);
        // Persist to globalState
        if (panel._context) {
          await saveSettings(panel._context);
        }
        panel._postMessage({ type: 'docsComplexity', complexity: message.complexity });
        // If complex, also send block state
        if (message.complexity === 'complex') {
          const blockState = mgr.getBlockState();
          panel._postMessage({ type: 'docsBlockState', ...blockState });
        }
      }
      return true;
    }

    // ── 5.2: Docs Wizard ─────────────────────────────────────────────────────

    case 'docsWizardStart': {
      const mgr = getDocsManager();
      const state = mgr.startWizard();
      panel._postMessage({ type: 'docsWizardState', state });
      return true;
    }

    case 'docsWizardNext': {
      const mgr = getDocsManager();
      const state = mgr.nextStep();
      panel._postMessage({ type: 'docsWizardState', state });
      return true;
    }

    case 'docsWizardPrev': {
      const mgr = getDocsManager();
      const state = mgr.previousStep();
      panel._postMessage({ type: 'docsWizardState', state });
      return true;
    }

    case 'docsWizardSkip': {
      const mgr = getDocsManager();
      const state = mgr.skipStep();
      panel._postMessage({ type: 'docsWizardState', state });
      return true;
    }

    case 'docsWizardToggleDoc': {
      const mgr = getDocsManager();
      const state = mgr.toggleDoc(message.docType);
      panel._postMessage({ type: 'docsWizardState', state });
      return true;
    }

    case 'docsWizardSetProjectInfo': {
      const mgr = getDocsManager();
      const state = mgr.setProjectInfo(message.name || '', message.projectType || 'unity');
      panel._postMessage({ type: 'docsWizardState', state });
      return true;
    }

    case 'docsWizardGetQuestionnaire': {
      const mgr = getDocsManager();
      const questions = mgr.getQuestionnaire(message.docType);
      panel._postMessage({ type: 'docsQuestionnaire', docType: message.docType, questions });
      return true;
    }

    case 'docsWizardSetAnswers': {
      const mgr = getDocsManager();
      mgr.setQuestionnaireAnswers(message.docType, message.answers || {});
      const state = mgr.getWizardState();
      panel._postMessage({ type: 'docsWizardState', state });
      return true;
    }

    case 'docsWizardComplete': {
      const mgr = getDocsManager();
      const results = await mgr.completeWizard();
      panel._postMessage({ type: 'docsWizardComplete', results });
      // Refresh doc targets after generation
      panel._sendDocTargets();
      return true;
    }

    case 'docsWizardCancel': {
      const mgr = getDocsManager();
      mgr.cancelWizard();
      panel._postMessage({ type: 'docsWizardState', state: null });
      return true;
    }

    // ── 5.2: Doc Scan & Summary ──────────────────────────────────────────────

    case 'docsScan': {
      const mgr = getDocsManager();
      const scanResult = await mgr.scan();
      panel._postMessage({ type: 'docsScanResult', ...scanResult });
      return true;
    }

    case 'docsGetSummary': {
      const mgr = getDocsManager();
      const summary = mgr.getSummary();
      const complexity = mgr.getComplexity();
      panel._postMessage({ type: 'docsSummary', ...summary, complexity: complexity || null });
      return true;
    }

    // ── 5.4: Doc Drift Detection ─────────────────────────────────────────────

    case 'docsDetectDrift': {
      const mgr = getDocsManager();
      const drift = await mgr.detectDrift();
      panel._postMessage({ type: 'docsDrift', ...drift });
      return true;
    }

    case 'docsOpenDocument': {
      const mgr = getDocsManager();
      await mgr.openDocument(message.docType);
      return true;
    }

    default:
      return false;
  }
}
