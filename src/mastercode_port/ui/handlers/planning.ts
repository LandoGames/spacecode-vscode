// @ts-nocheck

export async function handlePlanningMessage(panel: any, message: any): Promise<boolean> {
  switch (message.type) {
    case 'startPlanningSession': {
      const feature = typeof message.feature === 'string' ? message.feature.trim() : '';
      const description = typeof message.description === 'string' ? message.description.trim() : '';
      if (!feature) {
        panel._postMessage({ type: 'planningError', error: 'Feature name is required.' });
        return true;
      }
      panel._startPlanningSession(feature, description);
      return true;
    }

    case 'advancePlanPhase':
      panel._advancePlanPhase();
      return true;

    case 'skipToPlanPhase':
      if (typeof message.targetPhase === 'string') {
        panel._skipToPlanPhase(message.targetPhase);
      }
      return true;

    case 'cancelPlanningSession':
      panel._cancelPlanningSession();
      return true;

    case 'completePlanningSession':
      panel._completePlanningSession();
      return true;

    case 'updatePlanningChecklist':
      if (typeof message.index === 'number' && typeof message.completed === 'boolean') {
        panel._updatePlanningChecklist(message.index, message.completed);
      }
      return true;

    case 'passPlanningGate':
      if (typeof message.gateId === 'string') {
        panel._passPlanningGate(message.gateId);
      }
      return true;

    case 'generatePlanFromSession':
      panel._generatePlanFromSession();
      return true;

    default:
      return false;
  }
}
