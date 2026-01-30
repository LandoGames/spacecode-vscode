import { ProviderId } from '../shared/types';
import { Provider } from '../providers/types';
import { AIMessage } from '../mastercode_port/providers/base';
import { createClaudeCliProvider, createGptCliProvider } from '../providers/mastercodeCliProviders';
import * as vscode from 'vscode';

export interface ChatControllerCallbacks {
  onAssistantStart: (provider: ProviderId, messageId: string) => void;
  onAssistantChunk: (provider: ProviderId, messageId: string, delta: string) => void;
  onAssistantEnd: (provider: ProviderId, messageId: string) => void;
  onError: (message: string) => void;
}

export class ChatController {
  private readonly _providers: Record<ProviderId, any>;
  private _abort?: AbortController;
  private _messages: AIMessage[] = [];
  private _systemPrompt: string | undefined;

  constructor() {
    this._providers = {
      claude: createClaudeCliProvider(),
      gpt: createGptCliProvider()
    };

    // Ensure providers run relative to current workspace.
    const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || vscode.workspace.rootPath || '';
    if (workspaceDir) {
      if ('setWorkspaceDir' in this._providers.claude) this._providers.claude.setWorkspaceDir(workspaceDir);
      if ('setWorkspaceDir' in this._providers.gpt) this._providers.gpt.setWorkspaceDir(workspaceDir);
    }

    // Start a persistent Claude session (we'll later move this to Coordinator DB).
    if ('getSessionId' in this._providers.claude) {
      this._providers.claude.getSessionId();
    }
  }

  setSystemPrompt(systemPrompt: string | undefined) {
    this._systemPrompt = systemPrompt;
  }

  resetConversation() {
    this.stop();
    this._messages = [];
  }

  stop() {
    this._abort?.abort();
    this._abort = undefined;
    // MasterCode providers don't expose a stop() right now; abort will stop future work.
  }

  async send(provider: ProviderId, userText: string, cb: ChatControllerCallbacks) {
    this.stop();
    this._abort = new AbortController();

    const messageId = `${provider}-${Date.now()}`;
    cb.onAssistantStart(provider, messageId);

    try {
      this._messages.push({ role: 'user', content: userText, timestamp: Date.now() });
      const p = this._providers[provider];

      // Prefer streaming for responsiveness.
      const response = await p.streamMessage(
        this._messages,
        this._systemPrompt,
        (chunk: string) => cb.onAssistantChunk(provider, messageId, chunk)
      );

      const text = response?.content || '';
      if (!text) cb.onAssistantChunk(provider, messageId, '(empty response)');

      this._messages.push({ role: 'assistant', content: text, provider, timestamp: Date.now() });
      cb.onAssistantEnd(provider, messageId);
    } catch (e: any) {
      cb.onError(e?.message || String(e));
      cb.onAssistantEnd(provider, messageId);
    }
  }

  // Minimal Mastermind: Claude draft -> GPT critique -> Claude final.
  async mastermind(userPrompt: string, cb: ChatControllerCallbacks) {
    const sys = [
      'You are SpaceCode. Follow the project rules in the injected context.',
      'Return a clear conclusion at the end prefixed with: CONCLUSION:'
    ].join('\n');

    this.setSystemPrompt(sys);
    await this.send('claude', `Task:\n${userPrompt}\n\nStep 1: Propose an approach and plan.`, cb);

    await this.send('gpt', `Task:\n${userPrompt}\n\nStep 2: Critique the proposed plan. Identify missing tests, boundary risks, and simpler alternatives. Do not run commands.`, cb);

    await this.send('claude', `Task:\n${userPrompt}\n\nStep 3: Produce the final decision and next steps. Include CONCLUSION:.`, cb);
  }
}
