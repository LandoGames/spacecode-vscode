// @ts-nocheck

import {
  createAutosolveResult,
  getAutosolveResults,
  getPendingAutosolve,
  updateAutosolveStatus,
  getAutosolveById,
  clearAutosolveResults,
} from '../../../autosolve';
import { createHandoff } from '../../../handoff';

export async function handleAutosolveMessage(panel: any, message: any): Promise<boolean> {
  switch (message.type) {
    case 'autosolveCreate': {
      const result = createAutosolveResult({
        ticketId: message.ticketId,
        planId: message.planId,
        persona: message.persona || 'qa-engineer',
        title: message.title || 'Background task completed',
        summary: message.summary || '',
        changes: message.changes || [],
      });
      panel._postMessage({ type: 'autosolveCreated', result });
      // Also send notification to frontend
      panel._postMessage({
        type: 'autosolveNotification',
        result,
        pendingCount: getPendingAutosolve().length,
      });
      return true;
    }

    case 'autosolveList': {
      const results = getAutosolveResults();
      const pending = getPendingAutosolve();
      panel._postMessage({
        type: 'autosolveList',
        results,
        pendingCount: pending.length,
      });
      return true;
    }

    case 'autosolveView': {
      const result = updateAutosolveStatus(message.resultId, 'viewed');
      if (result) {
        panel._postMessage({ type: 'autosolveViewed', result });
      }
      return true;
    }

    case 'autosolveAccept': {
      const result = updateAutosolveStatus(message.resultId, 'accepted');
      if (result) {
        panel._postMessage({ type: 'autosolveAccepted', result });
      }
      return true;
    }

    case 'autosolveDismiss': {
      const result = updateAutosolveStatus(message.resultId, 'dismissed');
      if (result) {
        panel._postMessage({ type: 'autosolveDismissed', result });
      }
      return true;
    }

    case 'autosolveSendToIndex': {
      const result = getAutosolveById(message.resultId);
      if (result) {
        updateAutosolveStatus(message.resultId, 'sent_to_index');
        // Create a handoff to Index persona for documentation
        createHandoff({
          fromPersona: result.persona as any,
          toPersona: 'technical-writer',
          summary: `Document changes from autosolve: ${result.title}`,
          context: {
            chatHistory: [result.summary],
            files: result.changes.map(c => c.file),
            metadata: { autosolveId: result.id, ticketId: result.ticketId },
          },
          action: 'send_and_stay',
        });
        panel._postMessage({ type: 'autosolveSentToIndex', result });
      }
      return true;
    }

    case 'autosolveClear': {
      clearAutosolveResults();
      panel._postMessage({ type: 'autosolveList', results: [], pendingCount: 0 });
      return true;
    }

    default:
      return false;
  }
}
