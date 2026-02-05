// @ts-nocheck

import {
  createHandoff,
  getHandoffs,
  getPendingHandoffs,
  receiveHandoff,
  dismissHandoff,
  getPersonaTab,
  getPersonaName,
} from '../../../handoff';

export async function handleHandoffMessage(panel: any, message: any): Promise<boolean> {
  switch (message.type) {
    case 'handoffCreate': {
      const handoff = createHandoff(
        message.fromPersona || 'nova',
        message.toPersona,
        message.summary || '',
        message.context || {},
        message.action || 'send_and_stay'
      );
      panel._postMessage({ type: 'handoffCreated', handoff });
      // Notify the target persona's tab
      panel._postMessage({
        type: 'handoffNotification',
        handoff,
        targetTab: getPersonaTab(message.toPersona),
        personaName: getPersonaName(message.toPersona),
      });
      return true;
    }

    case 'handoffList': {
      const handoffs = message.persona
        ? getPendingHandoffs(message.persona)
        : getHandoffs();
      panel._postMessage({ type: 'handoffList', handoffs });
      return true;
    }

    case 'handoffReceive': {
      const handoff = receiveHandoff(message.handoffId);
      if (handoff) {
        panel._postMessage({ type: 'handoffReceived', handoff });
      }
      return true;
    }

    case 'handoffDismiss': {
      dismissHandoff(message.handoffId);
      panel._postMessage({ type: 'handoffDismissed', handoffId: message.handoffId });
      return true;
    }

    default:
      return false;
  }
}
