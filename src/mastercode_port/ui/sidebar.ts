/**
 * Sidebar Webview Provider
 *
 * Main chat interface for SpaceCode
 */

import * as vscode from 'vscode';
import { ConversationOrchestrator, ConversationTurn } from '../orchestrator/conversation';
import { CostTracker } from '../services/costTracker';

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'spacecode.chatView';
  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly orchestrator: ConversationOrchestrator,
    private readonly costTracker: CostTracker
  ) {
    // Listen for conversation events
    this.orchestrator.on('turn', (turn: ConversationTurn) => {
      this.addMessage(turn);
    });

    this.orchestrator.on('status', (status: { provider: string; status: string; message: string }) => {
      this.updateStatus(status);
    });

    this.orchestrator.on('complete', () => {
      this.updateStatus({ provider: '', status: 'idle', message: 'Conversation complete' });
    });
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this.getHtmlContent(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'sendMessage':
          await this.handleUserMessage(data.message, data.provider);
          break;
        case 'startCodeReview':
          vscode.commands.executeCommand('spacecode.reviewCode');
          break;
        case 'startDebate':
          vscode.commands.executeCommand('spacecode.aiDebate');
          break;
        case 'clearChat':
          this.orchestrator.clear();
          this.clearMessages();
          break;
        case 'stopConversation':
          this.orchestrator.stop();
          break;
      }
    });
  }

  private async handleUserMessage(message: string, provider?: 'claude' | 'gpt'): Promise<void> {
    if (!message.trim()) { return; }

    // Add user message to chat
    this.addUserMessage(message);

    try {
      if (provider) {
        // Single AI response
        const response = await this.orchestrator.askSingle(provider, message);
        await this.costTracker.recordUsage(
          provider,
          response.model,
          response.tokens,
          response.cost,
          'chat'
        );
      } else {
        // Default to Claude
        const response = await this.orchestrator.askSingle('claude', message);
        await this.costTracker.recordUsage(
          'claude',
          response.model,
          response.tokens,
          response.cost,
          'chat'
        );
      }
    } catch (error) {
      this.showError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private addUserMessage(message: string): void {
    this._view?.webview.postMessage({
      type: 'addMessage',
      message: {
        role: 'user',
        content: message,
        timestamp: Date.now(),
      },
    });
  }

  private addMessage(turn: ConversationTurn): void {
    this._view?.webview.postMessage({
      type: 'addMessage',
      message: {
        role: turn.provider,
        content: turn.message,
        timestamp: turn.timestamp,
        cost: turn.response?.cost,
        tokens: turn.response?.tokens,
        model: turn.response?.model,
      },
    });
  }

  private updateStatus(status: { provider: string; status: string; message: string }): void {
    this._view?.webview.postMessage({
      type: 'status',
      status,
    });
  }

  private clearMessages(): void {
    this._view?.webview.postMessage({ type: 'clear' });
  }

  private showError(message: string): void {
    this._view?.webview.postMessage({
      type: 'error',
      message,
    });
  }

  private getHtmlContent(webview: vscode.Webview): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SpaceCode Chat</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    .header {
      padding: 10px;
      border-bottom: 1px solid var(--vscode-panel-border);
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .header button {
      padding: 4px 8px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
    }

    .header button:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    .header button.primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .chat-container {
      flex: 1;
      overflow-y: auto;
      padding: 10px;
    }

    .message {
      margin-bottom: 12px;
      padding: 8px 12px;
      border-radius: 8px;
      max-width: 95%;
      animation: fadeIn 0.2s ease-in;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(5px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .message.user {
      background: var(--vscode-input-background);
      margin-left: auto;
      border-bottom-right-radius: 2px;
    }

    .message.claude {
      background: linear-gradient(135deg, #3b2667 0%, #2a1b4a 100%);
      border-bottom-left-radius: 2px;
    }

    .message.gpt {
      background: linear-gradient(135deg, #1a5c37 0%, #0d3320 100%);
      border-bottom-left-radius: 2px;
    }

    .message-header {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
      font-size: 11px;
      opacity: 0.8;
    }

    .message-header .provider {
      font-weight: bold;
      text-transform: uppercase;
    }

    .message-header .provider.claude { color: #06b6d4; }
    .message-header .provider.gpt { color: #06b6d4; }

    .message-content {
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.5;
    }

    .message-content code {
      background: var(--vscode-textCodeBlock-background);
      padding: 2px 4px;
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family);
    }

    .message-content pre {
      background: var(--vscode-textCodeBlock-background);
      padding: 10px;
      border-radius: 5px;
      overflow-x: auto;
      margin: 8px 0;
    }

    .message-meta {
      font-size: 10px;
      opacity: 0.6;
      margin-top: 6px;
      display: flex;
      gap: 10px;
    }

    .status-bar {
      padding: 8px 10px;
      border-top: 1px solid var(--vscode-panel-border);
      font-size: 11px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .status-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--vscode-charts-green);
    }

    .status-indicator.thinking {
      animation: pulse 1s infinite;
    }

    .status-indicator.claude { background: #06b6d4; }
    .status-indicator.gpt { background: #06b6d4; }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    .input-container {
      padding: 10px;
      border-top: 1px solid var(--vscode-panel-border);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .input-row {
      display: flex;
      gap: 8px;
    }

    .input-container textarea {
      flex: 1;
      padding: 8px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      resize: none;
      font-family: inherit;
      font-size: inherit;
      min-height: 60px;
    }

    .input-container textarea:focus {
      outline: none;
      border-color: var(--vscode-focusBorder);
    }

    .send-buttons {
      display: flex;
      gap: 4px;
    }

    .send-buttons button {
      padding: 6px 12px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
    }

    .send-buttons button.claude {
      background: #7c3aed;
      color: white;
    }

    .send-buttons button.gpt {
      background: #16a34a;
      color: white;
    }

    .send-buttons button:hover {
      filter: brightness(1.1);
    }

    .error {
      background: var(--vscode-inputValidation-errorBackground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
      color: var(--vscode-errorForeground);
      padding: 8px;
      border-radius: 4px;
      margin: 10px;
    }

    .empty-state {
      text-align: center;
      padding: 40px 20px;
      opacity: 0.7;
    }

    .empty-state h3 {
      margin-bottom: 10px;
    }
  </style>
</head>
<body>
  <div class="header">
    <button class="primary" onclick="startCodeReview()">Review Code</button>
    <button onclick="startDebate()">AI Debate</button>
    <button onclick="clearChat()">Clear</button>
  </div>

  <div class="chat-container" id="chatContainer">
    <div class="empty-state" id="emptyState">
      <h3>SpaceCode</h3>
      <p>Ask Claude or GPT, or start a code review.</p>
      <p style="margin-top: 10px; font-size: 11px;">
        Select code and click "Review Code" for AI-powered code review.
      </p>
    </div>
  </div>

  <div class="status-bar" id="statusBar">
    <div class="status-indicator" id="statusIndicator"></div>
    <span id="statusText">Ready</span>
  </div>

  <div class="input-container">
    <textarea
      id="messageInput"
      placeholder="Ask a question..."
      onkeydown="handleKeyDown(event)"
    ></textarea>
    <div class="send-buttons">
      <button class="claude" onclick="sendMessage('claude')">Ask Claude</button>
      <button class="gpt" onclick="sendMessage('gpt')">Ask GPT</button>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const chatContainer = document.getElementById('chatContainer');
    const emptyState = document.getElementById('emptyState');
    const messageInput = document.getElementById('messageInput');
    const statusIndicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');

    function sendMessage(provider) {
      const message = messageInput.value.trim();
      if (!message) return;

      vscode.postMessage({ type: 'sendMessage', message, provider });
      messageInput.value = '';
    }

    function handleKeyDown(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage('claude'); // Default to Claude on Enter
      }
    }

    function startCodeReview() {
      vscode.postMessage({ type: 'startCodeReview' });
    }

    function startDebate() {
      vscode.postMessage({ type: 'startDebate' });
    }

    function clearChat() {
      vscode.postMessage({ type: 'clearChat' });
    }

    function addMessageToChat(msg) {
      emptyState.style.display = 'none';

      const div = document.createElement('div');
      div.className = 'message ' + msg.role;

      let header = '';
      if (msg.role !== 'user') {
        header = \`
          <div class="message-header">
            <span class="provider \${msg.role}">\${msg.role}</span>
            \${msg.model ? '<span>' + msg.model + '</span>' : ''}
          </div>
        \`;
      }

      let meta = '';
      if (msg.tokens || msg.cost) {
        meta = \`
          <div class="message-meta">
            \${msg.tokens ? '<span>' + (msg.tokens.input + msg.tokens.output) + ' tokens</span>' : ''}
            \${msg.cost ? '<span>$' + msg.cost.toFixed(4) + '</span>' : ''}
          </div>
        \`;
      }

      div.innerHTML = \`
        \${header}
        <div class="message-content">\${escapeHtml(msg.content)}</div>
        \${meta}
      \`;

      chatContainer.appendChild(div);
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    function updateStatus(status) {
      statusText.textContent = status.message;
      statusIndicator.className = 'status-indicator';

      if (status.status === 'thinking') {
        statusIndicator.classList.add('thinking');
        if (status.provider) {
          statusIndicator.classList.add(status.provider);
        }
      }
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Handle messages from extension
    window.addEventListener('message', event => {
      const data = event.data;

      switch (data.type) {
        case 'addMessage':
          addMessageToChat(data.message);
          break;
        case 'status':
          updateStatus(data.status);
          break;
        case 'clear':
          chatContainer.innerHTML = '';
          emptyState.style.display = 'block';
          chatContainer.appendChild(emptyState);
          break;
        case 'error':
          const errorDiv = document.createElement('div');
          errorDiv.className = 'error';
          errorDiv.textContent = data.message;
          chatContainer.appendChild(errorDiv);
          break;
      }
    });
  </script>
</body>
</html>`;
  }
}
