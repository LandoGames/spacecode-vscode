// @ts-nocheck

export async function handlePlanMessage(panel: any, message: any): Promise<boolean> {
  switch (message.type) {
    case 'scanDiff':
      await panel._scanGitDiff();
      return true;

    case 'comparePlan':
      if (Array.isArray(message.diffFiles)) {
        await panel._comparePlanToFiles(message.diffFiles);
      }
      return true;

    case 'runTests':
      await panel._runRegressionTests();
      return true;

    case 'getPlanTemplates':
      await panel._sendPlanTemplates();
      return true;

    case 'generatePlan': {
      const intent = typeof message.intent === 'string' ? message.intent.trim() : '';
      if (!intent) {
        panel._postMessage({ type: 'planError', error: 'Plan intent is required.' });
        return true;
      }
      const providerId = message.provider === 'gpt' ? 'gpt' : 'claude';
      const templateId = typeof message.templateId === 'string' && message.templateId ? message.templateId : undefined;
      const vars = typeof message.templateVariables === 'object' && message.templateVariables ? message.templateVariables : undefined;
      await panel._generatePlanFromIntent(intent, providerId, templateId, vars);
      return true;
    }

    case 'listPlans':
      await panel._sendPlanList();
      return true;

    case 'loadPlan':
      if (typeof message.planId === 'string') {
        await panel._sendPlanById(message.planId);
      }
      return true;

    case 'savePlan':
      if (message.plan) {
        await panel._savePlan(message.plan, 'created');
        panel._postMessage({ type: 'planSaved', plan: message.plan });
      }
      return true;

    case 'deletePlan':
      if (typeof message.planId === 'string') {
        await panel._deletePlan(message.planId);
      }
      return true;

    case 'usePlanForComparison':
      if (typeof message.planId === 'string') {
        await panel._usePlanForComparison(message.planId);
      }
      return true;

    case 'executePlan':
      if (typeof message.planId === 'string') {
        if (panel._requireAutoexecute(
          `Execute Plan`,
          'executePlan',
          { planId: message.planId },
          { skipDocGate: true }
        )) {
          await panel._executePlanFromJob(message.planId);
        }
      }
      return true;

    case 'executePlanStepByStep':
      if (typeof message.planId === 'string') {
        await panel._executePlanStepByStep(message.planId);
      }
      return true;

    case 'planStepApprove':
      if (panel._pendingStepApproval) {
        panel._pendingStepApproval.resolve(true);
        panel._pendingStepApproval = null;
      }
      return true;

    case 'planStepAbort':
      if (panel._pendingStepApproval) {
        panel._pendingStepApproval.resolve(false);
        panel._pendingStepApproval = null;
      }
      return true;

    case 'runAIReview':
      if (typeof message.diff === 'string') {
        await panel._runAIReview(message.diff);
      }
      return true;

    case 'comparePlanToDiff':
      if (typeof message.planId === 'string') {
        await panel._comparePlanToDiff(message.planId, message.diffResult);
      }
      return true;

    default:
      return false;
  }
}
