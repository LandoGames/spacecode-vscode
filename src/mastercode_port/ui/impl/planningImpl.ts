// @ts-nocheck

import { PlanningSessionController } from '../../../planning/PlanningSessionController';

export function createPlanningImpl(panel: any) {
  let controller: PlanningSessionController | null = null;

  function getController(): PlanningSessionController {
    if (!controller) {
      controller = new PlanningSessionController();
      controller.on('stateChange', (state) => {
        panel._postMessage({ type: 'planningStateUpdate', state });
      });
    }
    return controller;
  }

  function startPlanningSession(feature: string, description: string): void {
    const ctrl = getController();
    ctrl.startSession(feature, description);
  }

  function advancePlanPhase(): void {
    const ctrl = getController();
    const session = ctrl.getSession();
    if (!session) return;

    if (!ctrl.areGatesPassedForPhase(session.currentPhase)) {
      panel._postMessage({
        type: 'planningError',
        error: `Gate for "${session.currentPhase}" phase has not been passed yet.`,
      });
      return;
    }

    const next = ctrl.advancePhase();
    if (!next) {
      panel._postMessage({
        type: 'planningError',
        error: 'Already at the last phase. Complete the session instead.',
      });
    }
  }

  function skipToPlanPhase(targetPhase: string): void {
    const ctrl = getController();
    const ok = ctrl.skipToPhase(targetPhase as any);
    if (!ok) {
      panel._postMessage({
        type: 'planningError',
        error: `Cannot skip to "${targetPhase}" phase.`,
      });
    }
  }

  function cancelPlanningSession(): void {
    const ctrl = getController();
    ctrl.cancelSession();
  }

  function completePlanningSession(): void {
    const ctrl = getController();
    ctrl.completeSession();
  }

  function updatePlanningChecklist(index: number, completed: boolean): void {
    const ctrl = getController();
    ctrl.updateChecklist(index, completed);
  }

  function passPlanningGate(gateId: string): void {
    const ctrl = getController();
    const ok = ctrl.passGate(gateId);
    if (!ok) {
      panel._postMessage({
        type: 'planningError',
        error: `Gate "${gateId}" not found.`,
      });
    }
  }

  async function generatePlanFromSession(): Promise<void> {
    const ctrl = getController();
    const session = ctrl.getSession();
    if (!session) {
      panel._postMessage({ type: 'planningError', error: 'No active planning session.' });
      return;
    }

    // Reuse existing plan generation via plansImpl
    const intent = session.feature + (session.description ? ': ' + session.description : '');
    try {
      // Delegate to existing plan generation — this calls PlanGenerator internally
      await panel._generatePlanFromIntent(intent, undefined, undefined, undefined);
    } catch (err) {
      panel._postMessage({
        type: 'planningError',
        error: 'Plan generation failed: ' + (err?.message || String(err)),
      });
    }
  }

  function dispose(): void {
    if (controller) {
      controller.dispose();
      controller = null;
    }
  }

  return {
    startPlanningSession,
    advancePlanPhase,
    skipToPlanPhase,
    cancelPlanningSession,
    completePlanningSession,
    updatePlanningChecklist,
    passPlanningGate,
    generatePlanFromSession,
    dispose,
  };
}
