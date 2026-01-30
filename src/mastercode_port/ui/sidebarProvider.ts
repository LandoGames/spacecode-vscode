/**
 * Sidebar Webview Provider for SpaceCode
 *
 * Provides a sidebar view in the activity bar
 */

import * as vscode from 'vscode';
import { ConversationOrchestrator, ConversationTurn } from '../orchestrator/conversation';
import { CostTracker } from '../services/costTracker';
import { KnowledgeBaseService } from '../services/knowledgeBase';
import { MCPManager } from '../services/mcpManager';
import { cliManager } from '../services/cliManager';

export class SidebarProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly orchestrator: ConversationOrchestrator,
    private readonly costTracker: CostTracker,
    private readonly knowledgeBase: KnowledgeBaseService,
    private readonly mcpManager: MCPManager
  ) {
    // Listen for orchestrator events
    this.orchestrator.on('turn', (turn: ConversationTurn) => {
      this._postMessage({ type: 'turn', turn });
    });

    this.orchestrator.on('status', (status: any) => {
      this._postMessage({ type: 'status', status });
    });

    this.orchestrator.on('complete', (stats: any) => {
      this._postMessage({ type: 'complete', stats });
    });

    this.orchestrator.on('summary', (data: any) => {
      this._postMessage({ type: 'summary', content: data.content });
    });
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlContent(webviewView.webview);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'sendMessage':
          await this._handleSendMessage(message.text, message.mode, message.images || []);
          break;

        case 'getSettings':
          await this._sendSettings();
          break;

        case 'getCliStatus':
          const status = await cliManager.checkAllStatus();
          this._postMessage({ type: 'cliStatus', status });
          break;

        case 'openFullPanel':
          vscode.commands.executeCommand('spacecode.openPanel');
          break;
      }
    });

    // Send initial settings
    this._sendSettings();
  }

  private _postMessage(message: any): void {
    this._view?.webview.postMessage(message);
  }

  private async _handleSendMessage(text: string, mode: 'claude' | 'gpt' | 'mastermind', images: string[]): Promise<void> {
    // Add user message
    this._postMessage({
      type: 'turn',
      turn: { provider: 'user', message: text }
    });

    try {
      if (mode === 'mastermind') {
        const config = vscode.workspace.getConfiguration('spacecode');
        const maxTurns = config.get<number>('maxConversationTurns', 4);
        const responseStyle = config.get<string>('mastermindResponseStyle', 'concise') as 'concise' | 'detailed';
        const autoSummarize = config.get<boolean>('mastermindAutoSummarize', true);

        await this.orchestrator.startConversation({
          mode: 'collaborate',
          maxTurns,
          initialContext: text,
          responseStyle,
          autoSummarize,
        });
      } else {
        const response = await this.orchestrator.askSingle(mode, text);
        this._postMessage({ type: 'complete', stats: {} });
      }
    } catch (error) {
      this._postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async _sendSettings(): Promise<void> {
    const config = vscode.workspace.getConfiguration('spacecode');

    this._postMessage({
      type: 'settings',
      settings: {
        defaultMode: config.get('defaultMode', 'mastermind'),
        maxTurns: config.get('maxConversationTurns', 4),
        claudeConnectionMethod: config.get('claudeConnectionMethod', 'cli'),
        gptConnectionMethod: config.get('gptConnectionMethod', 'cli'),
      },
    });
  }

  private _getHtmlContent(webview: vscode.Webview): string {
    const iconUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'icon.svg'));

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SpaceCode</title>
  <style>
    :root {
      --bg-primary: var(--vscode-editor-background);
      --bg-secondary: var(--vscode-sideBar-background);
      --text-primary: var(--vscode-editor-foreground);
      --text-secondary: var(--vscode-descriptionForeground);
      --accent-claude: #f97316;
      --accent-gpt: #06b6d4;
      --accent-mastermind: #a855f7;
      --border-color: var(--vscode-panel-border);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--vscode-font-family);
      font-size: 13px;
      color: var(--text-primary);
      background: var(--bg-primary);
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    .header {
      padding: 12px;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .header h3 {
      font-size: 14px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .mc-icon {
      width: 18px;
      height: 18px;
    }

    .mc-icon-btn {
      width: 14px;
      height: 14px;
      filter: brightness(0) invert(1);
    }

    .mode-selector {
      display: flex;
      gap: 4px;
      padding: 8px 12px;
      border-bottom: 1px solid var(--border-color);
    }

    .mode-btn {
      flex: 1;
      padding: 6px 8px;
      border: none;
      background: transparent;
      color: var(--text-secondary);
      cursor: pointer;
      border-radius: 4px;
      font-size: 11px;
      transition: all 0.2s;
    }

    .mode-btn:hover {
      background: var(--vscode-toolbar-hoverBackground);
    }

    .mode-btn.active {
      color: var(--text-primary);
      background: var(--vscode-toolbar-activeBackground);
    }

    .mode-btn.active.claude { border-bottom: 2px solid var(--accent-claude); }
    .mode-btn.active.gpt { border-bottom: 2px solid var(--accent-gpt); }
    .mode-btn.active.mastermind { border-bottom: 2px solid var(--accent-mastermind); }

    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
    }

    .message {
      margin-bottom: 12px;
      animation: fadeIn 0.3s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(5px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .message-header {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 4px;
      font-size: 11px;
    }

    .message-avatar {
      width: 20px;
      height: 20px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 600;
    }

    .message-avatar.user { background: var(--bg-secondary); }
    .message-avatar.claude { background: var(--accent-claude); color: white; }
    .message-avatar.gpt { background: var(--accent-gpt); color: white; }
    .message-avatar.summary { background: var(--accent-mastermind); color: white; }

    .message-content {
      padding: 8px 10px;
      background: var(--bg-secondary);
      border-radius: 8px;
      font-size: 12px;
      line-height: 1.4;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .input-area {
      padding: 12px;
      border-top: 1px solid var(--border-color);
    }

    .input-wrapper {
      display: flex;
      gap: 8px;
    }

    textarea {
      flex: 1;
      padding: 8px;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      background: var(--bg-secondary);
      color: var(--text-primary);
      font-family: inherit;
      font-size: 12px;
      resize: none;
      min-height: 36px;
      max-height: 100px;
    }

    textarea:focus {
      outline: none;
      border-color: var(--vscode-focusBorder);
    }

    .send-btn {
      padding: 8px 12px;
      border: none;
      border-radius: 6px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      cursor: pointer;
      font-size: 12px;
    }

    .send-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .send-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .status {
      padding: 8px 12px;
      font-size: 11px;
      color: var(--text-secondary);
      text-align: center;
    }

    .expand-btn {
      width: calc(100% - 24px);
      padding: 8px 12px;
      margin: 8px 12px;
      border: none;
      background: linear-gradient(135deg, var(--accent-mastermind), #7c3aed);
      color: white;
      cursor: pointer;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 500;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all 0.2s ease;
      box-shadow: 0 2px 8px rgba(168, 85, 247, 0.3);
      flex-shrink: 0;
    }

    .expand-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(168, 85, 247, 0.4);
    }

    .empty-state {
      text-align: center;
      padding: 20px;
      color: var(--text-secondary);
    }

    .empty-state h4 {
      margin-bottom: 8px;
      color: var(--text-primary);
    }
  </style>
</head>
<body>
  <div class="header">
    <h3><img src="${iconUri}" alt="MC" class="mc-icon" /> SpaceCode</h3>
  </div>

  <button class="expand-btn" onclick="openFullPanel()">
    <img src="${iconUri}" alt="MC" class="mc-icon-btn" /> Open Full Panel
  </button>

  <div class="mode-selector">
    <button class="mode-btn claude" data-mode="claude">Claude</button>
    <button class="mode-btn gpt" data-mode="gpt">GPT</button>
    <button class="mode-btn mastermind active" data-mode="mastermind">MasterMind</button>
  </div>

  <div class="messages" id="messages">
    <div class="empty-state" id="emptyState">
      <h4>Ask anything</h4>
      <p>Type below to chat with AI</p>
    </div>
  </div>

  <div id="statusArea" class="status" style="display: none;"></div>

  <div class="input-area">
    <div class="input-wrapper">
      <textarea id="input" placeholder="Ask something..." rows="1" onkeydown="handleKeyDown(event)" oninput="autoResize(this)"></textarea>
      <button class="send-btn" id="sendBtn" onclick="sendMessage()">Send</button>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let currentMode = 'mastermind';
    let isGenerating = false;

    // Mode selector
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentMode = btn.dataset.mode;
      });
    });

    function sendMessage() {
      const input = document.getElementById('input');
      const text = input.value.trim();
      if (!text || isGenerating) return;

      setGenerating(true);
      vscode.postMessage({ type: 'sendMessage', text, mode: currentMode, images: [] });
      input.value = '';
      autoResize(input);
    }

    function setGenerating(generating) {
      isGenerating = generating;
      document.getElementById('sendBtn').disabled = generating;
      document.getElementById('statusArea').style.display = generating ? 'block' : 'none';
    }

    function handleKeyDown(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    }

    function autoResize(el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 100) + 'px';
    }

    function openFullPanel() {
      vscode.postMessage({ type: 'openFullPanel' });
    }

    function addMessage(role, content) {
      const container = document.getElementById('messages');
      const empty = document.getElementById('emptyState');
      if (empty) empty.style.display = 'none';

      const div = document.createElement('div');
      div.className = 'message ' + role;

      let avatar, sender;
      switch (role) {
        case 'user': avatar = '&#128100;'; sender = 'You'; break;
        case 'claude': avatar = 'C'; sender = 'Claude'; break;
        case 'gpt': avatar = 'G'; sender = 'GPT'; break;
        case 'summary': avatar = '&#128203;'; sender = 'Summary'; break;
        default: avatar = '?'; sender = role;
      }

      div.innerHTML = \`
        <div class="message-header">
          <div class="message-avatar \${role}">\${avatar}</div>
          <span>\${sender}</span>
        </div>
        <div class="message-content">\${escapeHtml(content)}</div>
      \`;

      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    window.addEventListener('message', event => {
      const msg = event.data;

      switch (msg.type) {
        case 'turn':
          addMessage(msg.turn.provider, msg.turn.message);
          break;

        case 'status':
          document.getElementById('statusArea').textContent = msg.status.message;
          break;

        case 'complete':
          setGenerating(false);
          break;

        case 'summary':
          addMessage('summary', msg.content);
          break;

        case 'error':
          setGenerating(false);
          addMessage('system', 'Error: ' + msg.message);
          break;
      }
    });

    // Request initial settings
    vscode.postMessage({ type: 'getSettings' });
  </script>
</body>
</html>`;
  }
}
