// @ts-nocheck

export async function handleAssistantMessage(panel: any, message: any): Promise<boolean> {
  switch (message.type) {
    case 'sendMessage':
      await panel._handleSendMessage(message);
      return true;

    case 'stop':
      panel.orchestrator.stop();
      return true;

    case 'startMastermind':
      await panel._startMastermindConversation(message.config);
      return true;

    case 'saveChatState':
      if (message.state) {
        panel._saveChatState(message.state);
      }
      return true;

    case 'clearChat':
      panel.orchestrator.clear();
      return true;

    case 'stopGeneration':
      panel.orchestrator.stop();
      return true;

    case 'setChatMode':
      panel._setChatMode(message.mode);
      return true;

    case 'getGptOpinion':
      await panel._handleGetGptOpinion(message);
      return true;

    case 'setModel':
      panel._setModel(message.model);
      return true;

    case 'setReasoning':
      panel._setReasoning(message.reasoning);
      return true;

    case 'setConsultantModel':
      panel._consultantModel = message.model;
      return true;

    case 'sideChatMessage':
      if (typeof message.message === 'string') {
        await panel._handleSideChatMessage(message.chatIndex, message.message);
      }
      return true;

    default:
      return false;
  }
}
