// @ts-nocheck

export async function handleWorkflowMessage(panel: any, message: any): Promise<boolean> {
  switch (message.type) {
    case 'getWorkflows':
      panel._sendWorkflows();
      return true;

    case 'saveWorkflow':
      await panel._saveWorkflow(message.workflow, message.drawflowData);
      return true;

    case 'deleteWorkflow':
      await panel._deleteWorkflow(message.workflowId);
      return true;

    case 'executeWorkflow':
      if (!panel._requireAutoexecute('Workflow Run', 'executeWorkflow', { workflowId: message.workflowId, input: message.input, drawflowData: message.drawflowData })) return true;
      await panel._executeWorkflow(message.workflowId, message.input, message.drawflowData);
      return true;

    case 'importWorkflow':
      await panel._importWorkflow();
      return true;

    case 'exportWorkflow':
      await panel._exportWorkflow(message.workflowId);
      return true;

    default:
      return false;
  }
}
