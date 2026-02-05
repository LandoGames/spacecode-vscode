export interface ChatTab {
  id: string;
  name: string;
  mode: 'claude' | 'gpt' | 'mastermind';
  claudeSessionId?: string;
  messagesHtml?: string;
  messageHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}

export interface ChatState {
  tabs: ChatTab[];
  activeTabId: string;
  chatCounter?: number;
}

export interface AutoexecuteJob {
  id: string;
  action: string;
  actionKey: 'shipRunGates' | 'shipDocsStatus' | 'mcpAction' | 'executeWorkflow' | 'executePlan';
  payload: any;
  sector: string;
  docTarget: string;
  context: string;
  status: 'pending' | 'approved' | 'rejected' | 'failed';
  created: number;
}
