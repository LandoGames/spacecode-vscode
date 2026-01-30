/**
 * Main Panel - Full editor webview (like Claude Code / Codex)
 *
 * Opens as an editor tab with chat interface and settings
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ConversationOrchestrator, ConversationTurn } from '../orchestrator/conversation';
import { CostTracker } from '../services/costTracker';
import { KnowledgeBaseService } from '../services/knowledgeBase';
import { MCPManager } from '../services/mcpManager';
import { VoiceService } from '../services/voiceService';
import { cliManager, AllCliStatus } from '../services/cliManager';
import { logger, LogChannel } from '../services/logService';
import { WorkflowEngine } from '../agents/workflowEngine';
import { workflowStorage } from '../agents/workflowStorage';
import { AgentWorkflow, DrawflowExport, AgentNodeConfig } from '../agents/types';
import { PricingService } from '../services/pricingService';
import { HotspotToolPanel } from './hotspotToolPanel';

// Chat state interface for persistence
interface ChatTab {
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

interface ChatState {
  tabs: ChatTab[];
  activeTabId: string;
  chatCounter?: number;
}

interface AutoexecuteJob {
  id: string;
  action: string;
  sector: string;
  docTarget: string;
  context: string;
  status: 'pending' | 'approved' | 'rejected';
  created: number;
}

export class MainPanel {
  public static currentPanel: MainPanel | undefined;
  private static readonly viewType = 'spacecode.mainPanel';
  private static readonly CHAT_STATE_KEY = 'spacecode.chatState';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _context: vscode.ExtensionContext;
  private _disposables: vscode.Disposable[] = [];

  private orchestrator: ConversationOrchestrator;
  private costTracker: CostTracker;
  private knowledgeBase: KnowledgeBaseService;
  private mcpManager: MCPManager;
  private voiceService: VoiceService;
  private workflowEngine: WorkflowEngine;
  private pricingService: PricingService;
  private _currentChatId: string | undefined; // Track which chat is currently processing
  private _shipSectorId: string = 'yard';
  private _shipProfile: 'yard' | 'scout' | 'battleship' = 'yard';
  private _shipAutoexecute: boolean = false;
  private _contextPreviewText: string = '';
  private _contextPreviewTimer: NodeJS.Timeout | undefined;
  private _lastEditorContextPreviewText: string = '';
  private _autoexecuteEnabled: boolean = false;
  private _docTarget: string = '';

  public static createOrShow(
    extensionUri: vscode.Uri,
    orchestrator: ConversationOrchestrator,
    costTracker: CostTracker,
    knowledgeBase: KnowledgeBaseService,
    mcpManager: MCPManager,
    voiceService: VoiceService,
    pricingService: PricingService,
    context: vscode.ExtensionContext
  ): MainPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If panel exists, show it
    if (MainPanel.currentPanel) {
      MainPanel.currentPanel._panel.reveal(column);
      return MainPanel.currentPanel;
    }

    // Create new panel
    const panel = vscode.window.createWebviewPanel(
      MainPanel.viewType,
      'SpaceCode',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
      }
    );

    MainPanel.currentPanel = new MainPanel(
      panel,
      extensionUri,
      orchestrator,
      costTracker,
      knowledgeBase,
      mcpManager,
      voiceService,
      pricingService,
      context
    );

    return MainPanel.currentPanel;
  }

  /**
   * Revive the panel from a serialized state (called by VS Code on restart)
   */
  public static revive(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    orchestrator: ConversationOrchestrator,
    costTracker: CostTracker,
    knowledgeBase: KnowledgeBaseService,
    mcpManager: MCPManager,
    voiceService: VoiceService,
    pricingService: PricingService,
    context: vscode.ExtensionContext
  ): MainPanel {
    // If panel already exists, dispose the old one
    if (MainPanel.currentPanel) {
      MainPanel.currentPanel.dispose();
    }

    // Configure webview options for the revived panel
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
    };

    MainPanel.currentPanel = new MainPanel(
      panel,
      extensionUri,
      orchestrator,
      costTracker,
      knowledgeBase,
      mcpManager,
      voiceService,
      pricingService,
      context
    );

    return MainPanel.currentPanel;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    orchestrator: ConversationOrchestrator,
    costTracker: CostTracker,
    knowledgeBase: KnowledgeBaseService,
    mcpManager: MCPManager,
    voiceService: VoiceService,
    pricingService: PricingService,
    context: vscode.ExtensionContext
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._context = context;
    this.orchestrator = orchestrator;
    this.costTracker = costTracker;
    this.knowledgeBase = knowledgeBase;
    this.mcpManager = mcpManager;
    this.voiceService = voiceService;
    this.pricingService = pricingService;
    this.workflowEngine = new WorkflowEngine();

    // Initialize workflow storage
    workflowStorage.initialize(context);

    // Set up workflow engine event handlers
    this.workflowEngine.on('workflowEvent', (event) => {
      this._panel.webview.postMessage({
        type: 'workflowEvent',
        event
      });
    });

    // Set up voice progress callback
    this.voiceService.setProgressCallback((engine, progress, status) => {
      this._panel.webview.postMessage({
        type: 'voiceDownloadProgress',
        engine,
        progress,
        status
      });
    });

    this._disposables.push(
      this.pricingService.onDidUpdatePricing((pricing) => {
        this._postMessage({ type: 'pricing', pricing });
      })
    );

    // Set icon
    this._panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'icon.svg');

    // Set initial HTML
    this._panel.webview.html = this._getHtmlContent();

    // Handle messages from webview
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        await this._handleMessage(message);
      },
      null,
      this._disposables
    );

    // Handle disposal
    this._panel.onDidDispose(
      () => this.dispose(),
      null,
      this._disposables
    );

    // Send saved chat state to webview after a short delay
    setTimeout(() => {
      this._sendSavedChatState();
      this._scheduleContextPreviewSend();
    }, 100);

    // Context preview updates (active file/selection/diagnostics)
    this._disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => this._scheduleContextPreviewSend())
    );
    this._disposables.push(
      vscode.window.onDidChangeTextEditorSelection((e) => {
        if (e.textEditor === vscode.window.activeTextEditor) this._scheduleContextPreviewSend();
      })
    );
    this._disposables.push(
      vscode.languages.onDidChangeDiagnostics((e) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const uri = editor.document.uri;
        if (e.uris.some(u => u.toString() === uri.toString())) this._scheduleContextPreviewSend();
      })
    );

    // Listen for orchestrator events (include chatId for per-chat state management)
    // Use turn.chatId if available (from askSingle), fallback to _currentChatId (for mastermind)
    this.orchestrator.on('turn', (turn: ConversationTurn) => {
      const chatId = turn.chatId || this._currentChatId;
      console.log(`[SpaceCode] TURN event: turn.chatId=${turn.chatId}, _currentChatId=${this._currentChatId}, using=${chatId}`);
      this._postMessage({ type: 'turn', turn, chatId });
    });

    // Stream chunks for real-time display
    this.orchestrator.on('chunk', (data: { provider: string; chunk: string; chatId?: string }) => {
      const chatId = data.chatId || this._currentChatId;
      this._postMessage({ type: 'chunk', provider: data.provider, chunk: data.chunk, chatId });
    });

    this.orchestrator.on('status', (status: any) => {
      this._postMessage({ type: 'status', status, chatId: this._currentChatId });
    });

    this.orchestrator.on('complete', (stats: any) => {
      this._postMessage({ type: 'complete', stats, chatId: this._currentChatId });
    });

    this.orchestrator.on('summary', (data: any) => {
      this._postMessage({ type: 'summary', content: data.content, chatId: this._currentChatId });
    });

    this.orchestrator.on('compacted', (data: any) => {
      this._postMessage({ type: 'compacted', ...data, chatId: this._currentChatId });
    });

    // Set context for keybindings
    vscode.commands.executeCommand('setContext', 'spacecode.panelFocused', true);
  }

  /**
   * Save chat state to globalState
   */
  private _saveChatState(state: ChatState): void {
    this._context.globalState.update(MainPanel.CHAT_STATE_KEY, state);
  }

  /**
   * Load and send saved chat state to webview
   */
  private _sendSavedChatState(): void {
    const savedState = this._context.globalState.get<ChatState>(MainPanel.CHAT_STATE_KEY);
    if (savedState && savedState.tabs && savedState.tabs.length > 0) {
      this._postMessage({ type: 'restoreChatState', state: savedState });
    }
  }

  private _postMessage(message: any): void {
    this._panel.webview.postMessage(message);
  }

  private _loadJobs(): AutoexecuteJob[] {
    return this._context.globalState.get<AutoexecuteJob[]>('spacecode.autoexecuteJobs', []);
  }

  private _saveJobs(jobs: AutoexecuteJob[]): void {
    this._context.globalState.update('spacecode.autoexecuteJobs', jobs);
  }

  private _enqueueJob(job: Omit<AutoexecuteJob, 'created' | 'status'>, status: AutoexecuteJob['status'] = 'pending'): AutoexecuteJob {
    const jobs = this._loadJobs();
    const newJob: AutoexecuteJob = {
      ...job,
      status,
      created: Date.now()
    };
    jobs.unshift(newJob);
    this._saveJobs(jobs.slice(0, 50));
    this._postMessage({ type: 'autoexecuteJobs', jobs });
    return newJob;
  }

  private _updateJobStatus(jobId: string, status: AutoexecuteJob['status']): void {
    const jobs = this._loadJobs().map(job => job.id === jobId ? { ...job, status } : job);
    this._saveJobs(jobs);
    this._postMessage({ type: 'autoexecuteJobs', jobs });
  }

  private _postJobList(): void {
    this._postMessage({ type: 'autoexecuteJobs', jobs: this._loadJobs() });
  }

  private _requireAutoexecute(action: string): boolean {
    if (this._autoexecuteEnabled) return true;
    const context = this._contextPreviewText.replace(/\\n{2,}/g, '\\n\\n');
    this._enqueueJob({
      id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
      action,
      sector: this._shipSectorId,
      docTarget: this._docTarget,
      context
    });
    this._postMessage({
      type: 'autoexecuteBlocked',
      action,
      message: `${action} is gated when Autoexecute is off; added to Approval Queue.`
    });
    return false;
  }

  private _collectDocFiles(dir: string, base: string, results: string[]): void {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return;
    for (const entry of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        this._collectDocFiles(fullPath, base, results);
        continue;
      }
      if (!stat.isFile()) continue;
      const ext = path.extname(entry).toLowerCase();
      if (['.md', '.mdx', '.markdown', '.txt'].includes(ext)) {
        const rel = path.relative(base, fullPath).replace(/\\\\/g, '/');
        results.push(rel);
      }
    }
  }

  private _sendDocTargets(): void {
    const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const targets: string[] = [];
    if (workspaceDir) {
      for (const folderName of ['Docs', 'docs']) {
        const folder = path.join(workspaceDir, folderName);
        if (fs.existsSync(folder) && fs.statSync(folder).isDirectory()) {
          this._collectDocFiles(folder, workspaceDir, targets);
        }
      }
    }
    this._postMessage({ type: 'docTargets', targets: Array.from(new Set(targets)).sort() });
  }

  private _scheduleContextPreviewSend(): void {
    if (this._contextPreviewTimer) clearTimeout(this._contextPreviewTimer);
    this._contextPreviewTimer = setTimeout(() => {
      void this._sendContextPreview();
    }, 150);
  }

  private _buildContextPreviewText(): string {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      // Keep last known editor context when the SpaceCode webview is focused.
      return this._lastEditorContextPreviewText || '[SpaceCode Context]\\n(No active editor yet - click a code file)\\n';
    }

    const doc = editor.document;
    const uri = doc.uri;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    const relPath = workspaceFolder ? vscode.workspace.asRelativePath(uri) : uri.fsPath;

    let selectionText = '';
    if (!editor.selection.isEmpty) {
      selectionText = doc.getText(editor.selection);
      if (selectionText.length > 2000) selectionText = selectionText.slice(0, 2000) + '\\n...(truncated)';
    }

    const diags = vscode.languages.getDiagnostics(uri) || [];
    const diagLines = diags.slice(0, 20).map(d => {
      const sev = d.severity === vscode.DiagnosticSeverity.Error ? 'error'
        : d.severity === vscode.DiagnosticSeverity.Warning ? 'warn'
        : d.severity === vscode.DiagnosticSeverity.Information ? 'info'
        : 'hint';
      const line = d.range.start.line + 1;
      const col = d.range.start.character + 1;
      return `- ${sev} ${relPath}:${line}:${col} ${d.message}`;
    });

    const docLine = this._docTarget ? `Doc Target: ${this._docTarget}\\n` : `Doc Target: (none)\\n`;
    const header =
      `[SpaceCode Context]\\n` +
      `Station Sector: ${this._shipSectorId}\\n` +
      `Profile: ${this._shipProfile}\\n` +
      docLine +
      `File: ${relPath}\\n` +
      `Language: ${doc.languageId}\\n`;

    const diagBlock = diagLines.length
      ? `\\n[Diagnostics]\\n${diagLines.join('\\n')}\\n`
      : `\\n[Diagnostics]\\n(none)\\n`;

    const selBlock = selectionText
      ? `\\n[Selection]\\n\\\`\\\`\\\`${doc.languageId}\\n${selectionText}\\n\\\`\\\`\\\`\\n`
      : `\\n[Selection]\\n(none)\\n`;

    const text = header + diagBlock + selBlock;
    this._lastEditorContextPreviewText = text;
    return text;
  }

  private async _sendContextPreview(): Promise<void> {
    const text = this._buildContextPreviewText();
    this._contextPreviewText = text;
    this._postMessage({ type: 'contextPreview', text });
  }

  private async _handleMessage(message: any): Promise<void> {
    switch (message.type) {
      case 'sendMessage':
        await this._handleSendMessage(message);
        break;

      case 'getContextPreview':
        await this._sendContextPreview();
        break;

      case 'getDocTargets':
        this._sendDocTargets();
        break;

      case 'docTargetChanged':
        this._docTarget = typeof message.docTarget === 'string' ? message.docTarget : '';
        this._scheduleContextPreviewSend();
        break;

      case 'autoexecuteList':
        this._postJobList();
        break;

      case 'autoexecuteApprove':
        if (typeof message.jobId === 'string') {
          this._updateJobStatus(message.jobId, 'approved');
        }
        break;

      case 'autoexecuteReject':
        if (typeof message.jobId === 'string') {
          this._updateJobStatus(message.jobId, 'rejected');
        }
        break;

      case 'stop':
        this.orchestrator.stop();
        break;

      case 'setMode':
        // Mode change handled in frontend
        break;

      case 'startMastermind':
        // Start MasterMind conversation with config from panel
        await this._startMastermindConversation(message.config);
        break;

      case 'saveChatState':
        // Save chat tabs and messages for persistence across restarts
        if (message.state) {
          this._saveChatState(message.state);
        }
        break;

      case 'getSettings':
        await this._sendSettings();
        break;

      case 'getPricing':
        this._sendPricing();
        break;

      // Ship UI (right panel)
      case 'shipSelectSector':
        if (typeof message.sectorId === 'string') {
          this._shipSectorId = message.sectorId;
        }
        if (message.profile === 'yard' || message.profile === 'scout' || message.profile === 'battleship') {
          this._shipProfile = message.profile;
        }
        this._postMessage({ type: 'shipSelected', sectorId: this._shipSectorId, profile: this._shipProfile });
        this._scheduleContextPreviewSend();
        break;

      case 'shipSetProfile':
        if (message.profile === 'yard' || message.profile === 'scout' || message.profile === 'battleship') {
          this._shipProfile = message.profile;
          this._postMessage({ type: 'shipSelected', sectorId: this._shipSectorId, profile: this._shipProfile });
          this._scheduleContextPreviewSend();
        }
        break;

      case 'shipToggleAutoexecute':
        this._shipAutoexecute = !this._shipAutoexecute;
        this._autoexecuteEnabled = this._shipAutoexecute;
        this._postMessage({ type: 'shipAutoexecute', enabled: this._shipAutoexecute });
        break;

      case 'shipGetContextPack': {
        const sectorId = typeof message.sectorId === 'string' ? message.sectorId : this._shipSectorId;
        const profile = (message.profile === 'yard' || message.profile === 'scout' || message.profile === 'battleship')
          ? message.profile
          : this._shipProfile;

        // Stub until Coordinator is wired. Keep it explicit and bounded.
        const injectionText =
          `[SpaceCode Context Pack]\\n` +
          `Profile: ${profile}\\n` +
          `Sector: ${sectorId}\\n` +
          `Rules: (stub) sector-aware rules will be loaded from AI_RULES.md + project-map.json\\n` +
          `Pinned facts: (stub) Unity version/URP/InputSystem will come from settings + Unity Bridge\\n`;

        this._postMessage({ type: 'shipContextPack', sectorId, profile, injectionText });
        break;
      }

      case 'shipRunGates':
        if (!this._requireAutoexecute('Run Gates')) break;
        this._postMessage({
          type: 'shipGateResult',
          ok: true,
          summary: '(stub) Gates will run compile/tests/deps/duplication here.',
        });
        break;

      case 'shipDocsStatus':
        if (!this._requireAutoexecute('Docs Check')) break;
        this._postMessage({
          type: 'shipDocsStatus',
          summary: '(stub) Docs status will show required doc updates for this sector.',
        });
        break;

      case 'openHotspotTool': {
        const sceneId = typeof message.sceneId === 'string' ? message.sceneId : 'station';
        HotspotToolPanel.createOrShow(this._extensionUri, sceneId);
        break;
      }

      case 'saveApiKeys':
        await this._saveApiKeys(message.claude, message.openai);
        break;

      case 'saveConnectionMethods':
        await this._saveConnectionMethods(message.claudeMethod, message.gptMethod);
        break;

      case 'saveMastermindSettings':
        await this._saveMastermindSettings(message.maxTurns, message.responseStyle, message.autoSummarize);
        break;

      case 'getMcpServers':
        await this._sendMcpServers();
        break;

      case 'mcpAction':
        if (!this._requireAutoexecute('MCP Action')) break;
        await this._handleMcpAction(message.action, message.serverId);
        break;

      case 'getKbEntries':
        await this._sendKbEntries();
        break;

      case 'kbAddUrl':
        await this._addKbUrl(message.url, message.tags);
        break;

      case 'kbCrawlWebsite':
        await this._crawlWebsite(message.url, message.tags, message.options);
        break;

      case 'kbRemove':
        await this.knowledgeBase.removeEntry(message.id);
        await this._sendKbEntries();
        break;

      case 'kbAddPdf':
        await this._addKbPdf(message.data, message.fileName, message.tags);
        break;

      case 'kbGetEmbedderStatus':
        await this._sendEmbedderStatus();
        break;

      case 'kbDownloadModel':
        await this._downloadEmbeddingModel(message.modelId);
        break;

      case 'kbSetModel':
        await this._setEmbeddingModel(message.modelId);
        break;

      case 'kbEmbedEntry':
        await this._embedEntry(message.id);
        break;

      case 'kbEmbedAll':
        await this._embedAllEntries();
        break;

      case 'pricing':
        // Pricing updates are handled in the webview
        this._postMessage({ type: 'pricing', pricing: message.pricing });
        break;

      case 'getCosts':
        await this._sendCosts();
        break;

      case 'showLogChannel':
        this._showLogChannel(message.channel);
        break;

      case 'clearAllLogs':
        this._clearAllLogs();
        break;

      case 'openTerminal':
        this._openTerminal();
        break;

      case 'openDevTools':
        vscode.commands.executeCommand('workbench.action.toggleDevTools');
        break;

      case 'openPricing':
        this._openPricingUrl(message.provider);
        break;

      // Workflow/Agents messages
      case 'getWorkflows':
        this._sendWorkflows();
        break;

      case 'saveWorkflow':
        await this._saveWorkflow(message.workflow, message.drawflowData);
        break;

      case 'deleteWorkflow':
        await this._deleteWorkflow(message.workflowId);
        break;

      case 'executeWorkflow':
        if (!this._requireAutoexecute('Workflow Run')) break;
        await this._executeWorkflow(message.workflowId, message.input, message.drawflowData);
        break;

      case 'importWorkflow':
        await this._importWorkflow();
        break;

      case 'exportWorkflow':
        await this._exportWorkflow(message.workflowId);
        break;

      case 'clearChat':
        this.orchestrator.clear();
        break;

      case 'stopGeneration':
        this.orchestrator.stop();
        break;

      case 'openExternal':
        vscode.env.openExternal(vscode.Uri.parse(message.url));
        break;

      case 'getCliStatus':
        await this._sendCliStatus();
        break;

      case 'installCli':
        await this._installCli(message.cli);
        break;

      case 'openTerminalForLogin':
        await this._openTerminalForLogin(message.cli);
        break;

      // Voice-related messages
      case 'getVoiceSettings':
        this._sendVoiceSettings();
        break;

      case 'saveVoiceSettings':
        await this._saveVoiceSettings(message.settings);
        break;

      case 'downloadVoiceModel':
        await this._downloadVoiceModel(message.engine, message.model);
        break;

      case 'startMicTest':
        this._startMicTest();
        break;

      case 'stopMicTest':
        this._stopMicTest();
        break;

      case 'testSpeaker':
        this._testSpeaker();
        break;
    }
  }

  private async _sendCliStatus(): Promise<void> {
    try {
      const status = await cliManager.checkAllStatus();
      this._postMessage({ type: 'cliStatus', status });
    } catch (error) {
      this._postMessage({
        type: 'error',
        message: `Failed to check CLI status: ${error}`,
      });
    }
  }

  private async _installCli(cli: 'claude' | 'codex'): Promise<void> {
    const result = await cliManager.installCli(cli);
    if (result.success) {
      vscode.window.showInformationMessage(result.message);
      await this._sendCliStatus(); // Refresh status
    } else {
      vscode.window.showErrorMessage(result.message);
    }
  }

  private async _openTerminalForLogin(cli: 'claude' | 'codex'): Promise<void> {
    const command = cliManager.getLoginCommand(cli);
    const terminal = vscode.window.createTerminal(`${cli} Login`);
    terminal.show();
    terminal.sendText(command);
    vscode.window.showInformationMessage(`Complete the login in the terminal, then refresh the CLI status.`);
  }

  // Log-related methods
  private _showLogChannel(channel: LogChannel): void {
    logger.focus(channel);
  }

  private _clearAllLogs(): void {
    logger.clearAll();
    vscode.window.showInformationMessage('SpaceCode logs cleared');
  }

  private _openTerminal(): void {
    const terminal = vscode.window.createTerminal('SpaceCode Terminal');
    terminal.show();
  }

  private _openPricingUrl(provider?: string): void {
    const url = provider === 'gpt'
      ? 'https://platform.openai.com/pricing'
      : 'https://www.anthropic.com/pricing';
    vscode.env.openExternal(vscode.Uri.parse(url));
  }

  // Workflow-related methods
  private _sendWorkflows(): void {
    const workflows = workflowStorage.getWorkflows();
    this._postMessage({ type: 'workflows', workflows });
  }

  private async _saveWorkflow(workflowData: Partial<AgentWorkflow>, drawflowData?: DrawflowExport): Promise<void> {
    try {
      let workflow: AgentWorkflow;

      if (drawflowData && workflowData.id && workflowData.name) {
        workflow = await workflowStorage.saveFromDrawflow(drawflowData, workflowData.id, workflowData.name);
      } else if (workflowData.id) {
        const existing = workflowStorage.getWorkflow(workflowData.id);
        if (existing) {
          workflow = { ...existing, ...workflowData, updatedAt: Date.now() };
          await workflowStorage.saveWorkflow(workflow);
        } else {
          throw new Error('Workflow not found');
        }
      } else {
        throw new Error('Invalid workflow data');
      }

      this._sendWorkflows();
      vscode.window.showInformationMessage(`Workflow "${workflow.name}" saved`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Failed to save workflow: ${msg}`);
    }
  }

  private async _deleteWorkflow(workflowId: string): Promise<void> {
    try {
      await workflowStorage.deleteWorkflow(workflowId);
      this._sendWorkflows();
      vscode.window.showInformationMessage('Workflow deleted');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Failed to delete workflow: ${msg}`);
    }
  }

  private async _executeWorkflow(workflowId: string, input: string, drawflowData?: DrawflowExport): Promise<void> {
    try {
      let workflow: AgentWorkflow | undefined;

      if (drawflowData) {
        // Parse directly from Drawflow data for unsaved workflows
        workflow = this.workflowEngine.parseDrawflowExport(drawflowData, workflowId || 'temp', 'Temporary Workflow');
      } else {
        workflow = workflowStorage.getWorkflow(workflowId);
      }

      if (!workflow) {
        throw new Error('Workflow not found');
      }

      // Set providers from orchestrator
      const claudeProvider = this.orchestrator.getClaudeProvider();
      const gptProvider = this.orchestrator.getGptProvider();
      this.workflowEngine.setProviders(claudeProvider, gptProvider);

      // Execute workflow
      const result = await this.workflowEngine.execute(workflow, input);

      this._postMessage({
        type: 'workflowResult',
        workflowId,
        result
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this._postMessage({
        type: 'workflowError',
        workflowId,
        error: msg
      });
      vscode.window.showErrorMessage(`Workflow execution failed: ${msg}`);
    }
  }

  private async _importWorkflow(): Promise<void> {
    const workflow = await workflowStorage.importWorkflowFromFile();
    if (workflow) {
      this._sendWorkflows();
    }
  }

  private async _exportWorkflow(workflowId: string): Promise<void> {
    const workflow = workflowStorage.getWorkflow(workflowId);
    if (workflow) {
      await workflowStorage.exportWorkflowToFile(workflow);
    } else {
      vscode.window.showErrorMessage('Workflow not found');
    }
  }

  // Voice-related methods
  private _sendVoiceSettings(): void {
    const settings = this.voiceService.getSettings();
    this._postMessage({ type: 'voiceSettings', settings });
  }

  private async _saveVoiceSettings(settings: any): Promise<void> {
    try {
      const updatedSettings = await this.voiceService.updateSettings(settings);
      this._postMessage({ type: 'voiceSettings', settings: updatedSettings });
    } catch (error) {
      this._postMessage({
        type: 'error',
        message: `Failed to save voice settings: ${error}`
      });
    }
  }

  private async _downloadVoiceModel(engine: 'whisper' | 'vosk' | 'piper', model?: string): Promise<void> {
    try {
      this._postMessage({
        type: 'voiceDownloadProgress',
        engine,
        progress: 0,
        status: 'Starting download...'
      });

      const success = await this.voiceService.downloadModel(engine, model);

      if (success) {
        // Send updated settings with installation status
        this._sendVoiceSettings();
      }
    } catch (error) {
      this._postMessage({
        type: 'voiceDownloadProgress',
        engine,
        progress: 0,
        status: `Error: ${error}`
      });
    }
  }

  private _startMicTest(): void {
    // For now, just send a message that mic test started
    // Full implementation will require WebRTC audio handling
    this._postMessage({
      type: 'micTestStatus',
      status: 'recording',
      message: 'Microphone test started. Audio capture will be implemented in Phase 3.'
    });
  }

  private _stopMicTest(): void {
    this._postMessage({
      type: 'micTestStatus',
      status: 'stopped',
      message: 'Microphone test stopped.'
    });
  }

  private _testSpeaker(): void {
    // For now, just send a message
    // Full TTS implementation in Phase 4
    this._postMessage({
      type: 'speakerTestStatus',
      status: 'playing',
      message: 'Speaker test. TTS will be implemented in Phase 4.'
    });
    vscode.window.showInformationMessage('Speaker test: TTS functionality will play audio here once implemented.');
  }

  private async _handleSendMessage(message: any): Promise<void> {
    const { text, mode, includeSelection, injectContext, docTarget, images, history, claudeSessionId, chatId } = message;

    // DEBUG: Log all received data from webview
    console.log(`[SpaceCode DEBUG] ========== MESSAGE RECEIVED ==========`);
    console.log(`[SpaceCode DEBUG] chatId: ${chatId}`);
    console.log(`[SpaceCode DEBUG] mode: ${mode}`);
    console.log(`[SpaceCode DEBUG] claudeSessionId: ${claudeSessionId}`);
    console.log(`[SpaceCode DEBUG] history length: ${history?.length || 0}`);
    if (history && history.length > 0) {
      console.log(`[SpaceCode DEBUG] history contents:`);
      history.forEach((h: { role: string; content: string }, i: number) => {
        console.log(`[SpaceCode DEBUG]   [${i}] ${h.role}: ${h.content.substring(0, 100)}...`);
      });
    } else {
      console.log(`[SpaceCode DEBUG] history is EMPTY or undefined`);
    }
    console.log(`[SpaceCode DEBUG] =====================================`);

    // Store chatId for orchestrator events (used by ALL modes)
    this._currentChatId = chatId;

    let context = text;
    if (typeof docTarget === 'string') {
      this._docTarget = docTarget;
    }

    // Inject a bounded context pack (active file + diagnostics + selection) if enabled.
    if (injectContext) {
      const injected = this._buildContextPreviewText();
      context = `${injected}\n\n---\n\n${context}`;
    }

    // Include selected code if requested
    if (includeSelection && !injectContext) {
      const editor = vscode.window.activeTextEditor;
      if (editor && !editor.selection.isEmpty) {
        const selectedText = editor.document.getText(editor.selection);
        const language = editor.document.languageId;
        context = `${text}\n\n\`\`\`${language}\n${selectedText}\n\`\`\``;
      }
    }

    try {
      // Search Knowledge Base for relevant context
      let kbContext = '';
      if (this.knowledgeBase.isEmbeddingModelReady()) {
        const kbResults = await this.knowledgeBase.semanticSearch(text, 5);
        if (kbResults.length > 0) {
          kbContext = '\n\n=== Relevant Knowledge Base Context ===\n';
          for (const result of kbResults) {
            const entry = this.knowledgeBase.getEntry(result.chunk.sourceId);
            if (entry && result.similarity > 0.3) { // Only include if similarity > 30%
              kbContext += `\n[Source: ${entry.title}]\n${result.chunk.text}\n`;
            }
          }
          if (kbContext.length > 50) {
            kbContext += '\n=== End of Knowledge Base Context ===\n\n';
            console.log(`[SpaceCode] KB context added: ${kbResults.length} chunks, ${kbContext.length} chars`);
          } else {
            kbContext = ''; // Not enough relevant context
          }
        }
      }

      // Prepend KB context to the user's message if found
      const contextWithKb = kbContext ? kbContext + context : context;

      if (mode === 'mastermind') {
        // MasterMind mode - both AIs collaborate

        const config = vscode.workspace.getConfiguration('spacecode');
        const maxTurns = config.get<number>('maxConversationTurns', 4);
        const responseStyle = config.get<string>('mastermindResponseStyle', 'concise') as 'concise' | 'detailed';
        const autoSummarize = config.get<boolean>('mastermindAutoSummarize', true);

        await this.orchestrator.startConversation({
          mode: 'collaborate',
          maxTurns,
          initialContext: contextWithKb,
          responseStyle,
          autoSummarize,
        });
      } else {
        // Single AI mode - pass conversation history, session ID for Claude, and chatId
        const sessionId = mode === 'claude' ? claudeSessionId : undefined;
        const response = await this.orchestrator.askSingle(mode, contextWithKb, undefined, history || [], sessionId, chatId);
        await this.costTracker.recordUsage(
          mode,
          response.model,
          response.tokens,
          response.cost,
          'chat'
        );
        // Signal completion to reset UI state - include chatId and token info
        this._postMessage({
          type: 'complete',
          stats: {},
          chatId,
          tokens: response.tokens
        });
      }
    } catch (error) {
      this._postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
        chatId,
      });
    }
  }

  private async _startMastermindConversation(config: {
    mode: 'collaborate' | 'code-review' | 'debate';
    topic: string;
    maxTurns: number;
    responseStyle: 'concise' | 'detailed';
    autoSummarize: boolean;
    includeSelection?: boolean;
    initialContext?: string;
  }): Promise<void> {
    try {
      let initialContext = config.topic || '';

      // Get selected code if requested
      if (config.includeSelection) {
        const editor = vscode.window.activeTextEditor;
        if (editor && !editor.selection.isEmpty) {
          const selectedText = editor.document.getText(editor.selection);
          initialContext = selectedText + (config.topic ? '\n\n' + config.topic : '');
        }
      }

      // Map mode to orchestrator mode
      const orchestratorMode = config.mode === 'code-review' ? 'code-review' :
                               config.mode === 'debate' ? 'debate' : 'collaborate';

      await this.orchestrator.startConversation({
        mode: orchestratorMode,
        maxTurns: config.maxTurns,
        initialContext,
        topic: config.topic,
        responseStyle: config.responseStyle,
        autoSummarize: config.autoSummarize,
      });
    } catch (error) {
      this._postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to start MasterMind conversation',
      });
    }
  }

  private async _sendSettings(): Promise<void> {
    const config = vscode.workspace.getConfiguration('spacecode');

    this._postMessage({
      type: 'settings',
      settings: {
        claudeModel: config.get('claudeModel'),
        gptModel: config.get('gptModel'),
        defaultMode: config.get('defaultMode'),
        maxTurns: config.get('maxConversationTurns', 4),
        mastermindResponseStyle: config.get('mastermindResponseStyle', 'concise'),
        mastermindAutoSummarize: config.get('mastermindAutoSummarize', true),
        hasClaudeKey: !!config.get('claudeApiKey'),
        hasOpenaiKey: !!config.get('openaiApiKey'),
        claudeConnectionMethod: config.get('claudeConnectionMethod', 'api'),
        gptConnectionMethod: config.get('gptConnectionMethod', 'api'),
      },
    });
  }

  private _sendPricing(): void {
    if (!this.pricingService) return;
    this._postMessage({
      type: 'pricing',
      pricing: this.pricingService.getPricing(),
    });
  }

  private async _saveConnectionMethods(claudeMethod?: string, gptMethod?: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('spacecode');

    if (claudeMethod !== undefined) {
      await config.update('claudeConnectionMethod', claudeMethod, vscode.ConfigurationTarget.Global);
    }
    if (gptMethod !== undefined) {
      await config.update('gptConnectionMethod', gptMethod, vscode.ConfigurationTarget.Global);
    }

    this._postMessage({ type: 'connectionMethodsSaved' });
    vscode.window.showInformationMessage('Connection methods saved! Restart the extension to apply changes.');
  }

  private async _saveMastermindSettings(maxTurns?: number, responseStyle?: string, autoSummarize?: boolean): Promise<void> {
    const config = vscode.workspace.getConfiguration('spacecode');

    if (maxTurns !== undefined) {
      await config.update('maxConversationTurns', maxTurns, vscode.ConfigurationTarget.Global);
    }
    if (responseStyle !== undefined) {
      await config.update('mastermindResponseStyle', responseStyle, vscode.ConfigurationTarget.Global);
    }
    if (autoSummarize !== undefined) {
      await config.update('mastermindAutoSummarize', autoSummarize, vscode.ConfigurationTarget.Global);
    }

    vscode.window.showInformationMessage('MasterMind settings saved!');
  }

  private async _saveApiKeys(claudeKey?: string, openaiKey?: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('spacecode');

    if (claudeKey !== undefined) {
      await config.update('claudeApiKey', claudeKey, vscode.ConfigurationTarget.Global);
    }
    if (openaiKey !== undefined) {
      await config.update('openaiApiKey', openaiKey, vscode.ConfigurationTarget.Global);
    }

    this._postMessage({ type: 'keysSaved' });
    vscode.window.showInformationMessage('API keys saved!');
  }

  private async _sendMcpServers(): Promise<void> {
    const servers = this.mcpManager.getAllServers();
    this._postMessage({ type: 'mcpServers', servers });
  }

  private async _handleMcpAction(action: string, serverId: string): Promise<void> {
    try {
      switch (action) {
        case 'start':
          await this.mcpManager.startServer(serverId);
          break;
        case 'stop':
          await this.mcpManager.stopServer(serverId);
          break;
        case 'remove':
          await this.mcpManager.removeServer(serverId);
          break;
        case 'launch':
          // Launch the MCP server in a terminal
          this.mcpManager.launchInTerminal(serverId);
          break;
      }
      await this._sendMcpServers();
    } catch (error) {
      this._postMessage({
        type: 'error',
        message: `MCP action failed: ${error}`,
      });
    }
  }

  private async _sendKbEntries(): Promise<void> {
    const entries = this.knowledgeBase.getAllEntries();
    const tags = this.knowledgeBase.getAllTags();
    const stats = this.knowledgeBase.getEmbeddingStats();
    this._postMessage({ type: 'kbEntries', entries, tags });
    this._postMessage({ type: 'embedderStatus', status: this.knowledgeBase.getEmbedderStatus(), stats });
  }

  private async _addKbUrl(url: string, tags: string[]): Promise<void> {
    try {
      await this.knowledgeBase.addUrl(url, tags);
      await this._sendKbEntries();
      this._postMessage({ type: 'kbAdded' });
    } catch (error) {
      this._postMessage({
        type: 'error',
        message: `Failed to add URL: ${error}`,
      });
    }
  }

  private async _crawlWebsite(url: string, tags: string[], options: { maxPages?: number; maxDepth?: number }): Promise<void> {
    try {
      const result = await this.knowledgeBase.crawlWebsite(
        url,
        tags,
        options,
        (progress) => {
          // Send progress updates to webview
          this._postMessage({
            type: 'crawlProgress',
            progress,
          });
        }
      );

      await this._sendKbEntries();

      if (result.errors.length > 0) {
        vscode.window.showWarningMessage(
          `Crawled ${result.added} pages with ${result.errors.length} errors`
        );
      } else {
        vscode.window.showInformationMessage(
          `Successfully crawled ${result.added} pages from ${url}`
        );
      }
    } catch (error) {
      this._postMessage({
        type: 'crawlProgress',
        progress: { status: 'error', error: error instanceof Error ? error.message : 'Unknown error', crawled: 0, total: 0, currentUrl: '' },
      });
      this._postMessage({
        type: 'error',
        message: `Failed to crawl website: ${error}`,
      });
    }
  }

  private async _addKbPdf(base64Data: string, fileName: string, tags: string[]): Promise<void> {
    try {
      // Convert base64 to Buffer
      const buffer = Buffer.from(base64Data, 'base64');
      await this.knowledgeBase.addPdf(buffer, fileName, tags);
      await this._sendKbEntries();
      this._postMessage({ type: 'kbAdded' });
      vscode.window.showInformationMessage(`PDF "${fileName}" added to Knowledge Base`);
    } catch (error) {
      this._postMessage({
        type: 'error',
        message: `Failed to add PDF: ${error}`,
      });
    }
  }

  private async _sendEmbedderStatus(): Promise<void> {
    const status = this.knowledgeBase.getEmbedderStatus();
    const stats = this.knowledgeBase.getEmbeddingStats();
    this._postMessage({ type: 'embedderStatus', status, stats });
  }

  private async _downloadEmbeddingModel(modelId?: string): Promise<void> {
    this._postMessage({ type: 'modelDownloadStarted' });

    const result = await this.knowledgeBase.downloadEmbeddingModel(modelId, (progress) => {
      this._postMessage({ type: 'modelDownloadProgress', progress });
    });

    if (result.success) {
      vscode.window.showInformationMessage('Embedding model downloaded successfully!');
      await this._sendEmbedderStatus();
    } else {
      this._postMessage({
        type: 'error',
        message: `Failed to download model: ${result.error}`,
      });
    }
  }

  private async _setEmbeddingModel(modelId: string): Promise<void> {
    try {
      await this.knowledgeBase.setEmbeddingModel(modelId);
      await this._sendEmbedderStatus();
    } catch (error) {
      this._postMessage({
        type: 'error',
        message: `Failed to set model: ${error}`,
      });
    }
  }

  private async _embedEntry(id: string): Promise<void> {
    this._postMessage({ type: 'embeddingStarted', id });

    const result = await this.knowledgeBase.embedEntry(id, (current, total) => {
      this._postMessage({ type: 'embeddingProgress', id, current, total });
    });

    if (result.success) {
      await this._sendKbEntries();
      await this._sendEmbedderStatus();
    } else {
      this._postMessage({
        type: 'error',
        message: `Failed to embed entry: ${result.error}`,
      });
    }
  }

  private async _embedAllEntries(): Promise<void> {
    this._postMessage({ type: 'embedAllStarted' });

    const result = await this.knowledgeBase.embedAllEntries(
      (entryIndex, totalEntries, chunkIndex, totalChunks) => {
        this._postMessage({
          type: 'embedAllProgress',
          entryIndex,
          totalEntries,
          chunkIndex,
          totalChunks,
        });
      }
    );

    if (result.embedded > 0 || result.failed === 0) {
      vscode.window.showInformationMessage(
        `Embedded ${result.embedded} entries${result.failed > 0 ? `, ${result.failed} failed` : ''}`
      );
    } else {
      vscode.window.showErrorMessage(`Embedding failed: ${result.errors.join(', ')}`);
    }

    await this._sendKbEntries();
    await this._sendEmbedderStatus();
  }

  private async _sendCosts(): Promise<void> {
    const today = this.costTracker.getTodaySummary();
    const month = this.costTracker.getThisMonthSummary();
    const all = this.costTracker.getSummary();
    const recent = this.costTracker.getRecentRecords(20);

    this._postMessage({
      type: 'costs',
      today,
      month,
      all,
      recent,
    });
  }

  public dispose(): void {
    MainPanel.currentPanel = undefined;
    vscode.commands.executeCommand('setContext', 'spacecode.panelFocused', false);

    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _getHtmlContent(): string {
    const iconUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'icon.svg')
    );
    const stationUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'imgs', 'Space Station.jpeg')
    );
    const shipUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'ship.png')
    );
    const shipFallbackUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'ship-placeholder.svg')
    );

    const cspSource = this._panel.webview.cspSource;
    const mediaRootUri = vscode.Uri.joinPath(this._extensionUri, 'media');

    // Load station-map.json (if present) and pre-resolve image URLs for the webview.
    // This keeps the webview logic simple (no fetch/csp headaches) and makes it easy
    // for you to drop new images into media/ and just update the JSON.
    let stationMap: any = null;
    try {
      const mapPath = vscode.Uri.joinPath(mediaRootUri, 'station-map.json').fsPath;
      const raw = fs.readFileSync(mapPath, 'utf8');
      stationMap = JSON.parse(raw);
    } catch (e) {
      // Keep UI usable even without a map file.
      stationMap = { version: 1, startScene: 'station', scenes: { station: { title: 'Station', image: 'imgs/Space Station.jpeg', hotspots: [] } } };
    }

    try {
      const scenes = stationMap?.scenes || {};
      for (const sceneId of Object.keys(scenes)) {
        const scene = scenes[sceneId];
        const rel = String(scene?.image || '');
        if (!rel) continue;
        const parts = rel.split('/').filter(Boolean);
        const uri = this._panel.webview.asWebviewUri(vscode.Uri.joinPath(mediaRootUri, ...parts)).toString();
        scene.imageUrl = uri;
      }
      stationMap._resolvedAt = Date.now();
    } catch {
      // Ignore resolution failures; webview will fall back to placeholders.
    }

    const stationMapLiteral = JSON.stringify(stationMap).replace(/</g, '\\u003c');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${cspSource}; script-src 'unsafe-inline' ${cspSource}; img-src ${cspSource} https: data:; font-src ${cspSource};">
  <title>SpaceCode</title>
  <style>
    :root {
      --bg-primary: var(--vscode-editor-background);
      --bg-secondary: var(--vscode-sideBar-background);
      --bg-tertiary: var(--vscode-input-background);
      --text-primary: var(--vscode-editor-foreground);
      --text-secondary: var(--vscode-descriptionForeground);
      --border-color: var(--vscode-panel-border);
      --accent-claude: #f97316;
      --accent-gpt: #06b6d4;
      --accent-mastermind: #a855f7;
      --accent-agents: #ef4444;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--text-primary);
      background: var(--bg-primary);
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* Header */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color);
      background: var(--bg-secondary);
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .logo {
      font-size: 18px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .mode-selector {
      display: flex;
      gap: 4px;
      background: var(--bg-tertiary);
      padding: 4px;
      border-radius: 8px;
    }

    .mode-btn {
      padding: 6px 12px;
      border: none;
      background: transparent;
      color: var(--text-secondary);
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.2s;
    }

    .mode-btn:hover {
      background: var(--bg-secondary);
    }

    .mode-btn.active {
      background: var(--bg-primary);
      color: var(--text-primary);
      font-weight: 500;
    }

    .mode-btn.active.claude { border-bottom: 2px solid var(--accent-claude); }
    .mode-btn.active.gpt { border-bottom: 2px solid var(--accent-gpt); }
    .mode-btn.active.mastermind { border-bottom: 2px solid var(--accent-mastermind); }
    .mode-btn.agents { background: transparent !important; }
    .mode-btn.active.agents { border-bottom: 2px solid var(--accent-agents); background: var(--bg-primary) !important; }

    .header-right {
      display: flex;
      gap: 8px;
    }

    .header-btn {
      padding: 6px 10px;
      border: 1px solid var(--border-color);
      background: transparent;
      color: var(--text-primary);
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
    }

    .header-btn:hover {
      background: var(--bg-tertiary);
    }

    /* Settings Dropdown */
    .settings-dropdown-container {
      position: relative;
      display: inline-block;
    }

    .settings-dropdown {
      display: none;
      position: absolute;
      right: 0;
      top: 100%;
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 1000;
      min-width: 160px;
      padding: 4px;
      margin-top: 4px;
    }

    .settings-dropdown.visible {
      display: block;
    }

    .dropdown-item {
      display: block;
      width: 100%;
      padding: 10px 14px;
      border: none;
      background: transparent;
      color: var(--text-primary);
      cursor: pointer;
      text-align: left;
      font-size: 13px;
      border-radius: 6px;
    }

    .dropdown-item:hover {
      background: var(--bg-tertiary);
    }

    /* Settings Panel Overlay */
    .settings-panel-overlay {
      display: none;
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: var(--bg-primary);
      z-index: 100;
      overflow-y: auto;
    }

    .settings-panel-overlay.visible {
      display: block;
    }

    .settings-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px;
      border-bottom: 1px solid var(--border-color);
      position: sticky;
      top: 0;
      background: var(--bg-primary);
      z-index: 10;
    }

    .settings-panel-header h2 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }

    .settings-panel-close {
      padding: 6px 12px;
      background: var(--bg-tertiary);
      border: none;
      border-radius: 6px;
      color: var(--text-primary);
      cursor: pointer;
      font-size: 13px;
    }

    .settings-panel-close:hover {
      background: var(--border-color);
    }

    /* Horizontal tabs bar for settings */
    .settings-tabs-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 16px;
      border-bottom: 1px solid var(--border-color);
      position: sticky;
      top: 0;
      background: var(--bg-primary);
      z-index: 10;
      gap: 8px;
    }

    .settings-tabs-left {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }

    .settings-tab {
      padding: 8px 16px;
      background: transparent;
      border: none;
      border-radius: 6px;
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.15s ease;
    }

    .settings-tab:hover {
      background: var(--bg-tertiary);
      color: var(--text-primary);
    }

    .settings-tab.active {
      background: var(--accent);
      color: white;
    }

    .settings-close-btn {
      padding: 6px 10px;
      background: var(--bg-tertiary);
      border: none;
      border-radius: 6px;
      color: var(--text-primary);
      cursor: pointer;
      font-size: 16px;
    }

    .settings-close-btn:hover {
      background: var(--border-color);
    }

    /* Content */
    .content {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      position: relative;
    }

    .chat-section {
      display: flex;
      flex-direction: column;
      flex: 1;
      overflow: hidden;
    }

    /* Main split: chat (left) + ship (right) */
    .main-split {
      flex: 1;
      overflow: hidden;
      display: flex;
      padding: 12px;
    }

    .left-pane {
      flex: 1 1 0;
      min-width: 520px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      padding-right: 12px;
    }

    .splitter {
      flex: 0 0 8px;
      width: 8px;
      cursor: col-resize;
      border-radius: 999px;
      background: color-mix(in srgb, var(--border-color) 65%, transparent);
      margin: 6px 0;
    }

    body.resizing, body.resizing * {
      cursor: col-resize !important;
      user-select: none !important;
    }

    .right-pane {
      flex: 0 0 420px;
      min-width: 360px;
      max-width: 900px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      padding-left: 12px;
    }

    .ship-panel {
      display: flex;
      flex-direction: column;
      gap: 8px;
      height: 100%;
      overflow: hidden;
    }

    .ship-title {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      color: var(--text-secondary);
    }

    .ship-canvas {
      position: relative;
      flex: 0 0 auto;
      width: 100%;
      aspect-ratio: 16 / 9;
      border: 1px dashed var(--border-color);
      border-radius: 10px;
      overflow: hidden;
      background: var(--bg-tertiary);
    }

    .ship-image {
      width: 100%;
      height: 100%;
      object-fit: contain;
      object-position: center;
      display: block;
    }

    .ship-viewport {
      position: absolute;
      pointer-events: none;
    }

    .ship-viewport .ship-hotspot-svg {
      pointer-events: auto;
    }

    .ship-hotspot {
      position: absolute;
      border: 1px solid transparent;
      border-radius: 8px;
      cursor: pointer;
    }

    .ship-hotspot:hover {
      border-color: var(--accent-mastermind);
      background: rgba(168, 85, 247, 0.12);
    }

    .ship-hotspot.selected {
      border-color: var(--accent-mastermind);
      background: rgba(168, 85, 247, 0.18);
    }

    .ship-hotspot-svg {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }

    .ship-hotspot-svg polygon {
      pointer-events: auto;
      cursor: pointer;
      transition: fill 0.2s, stroke 0.2s;
    }

    .control-panel {
      flex: 1 1 0;
      overflow: auto;
      border: 1px solid var(--border-color);
      border-radius: 10px;
      background: var(--bg-secondary);
      padding: 10px;
    }

    .control-row {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
      margin-bottom: 10px;
    }

    .breadcrumbs {
      flex: 1 1 auto;
      min-width: 120px;
      font-size: 11px;
      color: var(--text-secondary);
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      user-select: none;
    }

    .breadcrumbs .crumb {
      cursor: pointer;
      color: var(--text-primary);
      opacity: 0.9;
    }

    .breadcrumbs .sep {
      margin: 0 6px;
      opacity: 0.6;
    }

    .control-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border: 1px solid var(--border-color);
      border-radius: 999px;
      background: var(--bg-tertiary);
      font-size: 12px;
      color: var(--text-primary);
    }

    .control-subtitle {
      font-size: 12px;
      color: var(--text-secondary);
      margin: 6px 0 10px 0;
    }

    .control-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-bottom: 10px;
    }

    .control-actions button {
      width: 100%;
    }

    .sector-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-height: 320px;
      overflow: auto;
      padding-right: 6px;
    }

    .sector-item {
      padding: 8px 10px;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      background: var(--bg-tertiary);
      cursor: pointer;
      font-size: 12px;
      color: var(--text-primary);
      user-select: none;
    }

    .sector-item:hover {
      background: var(--bg-primary);
    }

    .sector-item.selected {
      border-color: var(--accent-mastermind);
      box-shadow: 0 0 0 1px rgba(168, 85, 247, 0.35) inset;
    }

    .sector-item.sub {
      margin-left: 12px;
      font-size: 11px;
      opacity: 0.9;
    }

    .context-preview {
      margin-top: 10px;
      border-top: 1px solid var(--border-color);
      padding-top: 10px;
    }

    .context-preview-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 8px;
    }

    .context-preview-header label {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: var(--text-primary);
      user-select: none;
    }

    .context-preview-box {
      width: 100%;
      max-height: 140px;
      overflow: auto;
      white-space: pre-wrap;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace;
      font-size: 11px;
      line-height: 1.35;
      color: var(--text-secondary);
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      padding: 10px;
    }

    .doc-gate {
      margin-top: 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      padding-top: 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .doc-gate label {
      font-size: 11px;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .doc-gate select {
      width: 100%;
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid var(--border-color);
      background: var(--bg-tertiary);
      color: var(--text-primary);
      font-size: 12px;
    }

    .doc-gate button {
      align-self: flex-end;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 11px;
    }

    .job-queue {
      margin-top: 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      padding-top: 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .job-entry {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 11px;
      color: var(--text-secondary);
    }

    .job-entry strong {
      color: var(--text-primary);
    }

    .job-actions {
      display: flex;
      gap: 6px;
      justify-content: flex-end;
    }

    .tab-content {
      display: none;
      flex: 1;
      overflow: auto;
    }

    .tab-content.active {
      display: flex;
      flex-direction: column;
    }

    /* Chat */
    .chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
    }

    .message {
      margin-bottom: 16px;
      animation: fadeIn 0.3s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .message-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    .streaming-indicator {
      font-size: 11px;
      color: var(--accent-claude);
      animation: pulse 1.5s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    .message-avatar {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 600;
    }

    .message-avatar.user { background: var(--bg-tertiary); }
    .message-avatar.claude { background: var(--accent-claude); color: white; }
    .message-avatar.gpt { background: var(--accent-gpt); color: white; }
    .message-avatar.summary { background: var(--accent-mastermind); color: white; }
    .message-avatar.system { background: #ef4444; color: white; }

    .message.summary .message-content {
      background: linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(245, 158, 11, 0.05));
      border-left: 3px solid var(--accent-mastermind);
    }

    .message.system .message-content {
      background: rgba(239, 68, 68, 0.1);
      border-left: 3px solid #ef4444;
    }

    /* Context Compaction Notice */
    .compaction-notice {
      background: linear-gradient(135deg, rgba(168, 85, 247, 0.15), rgba(168, 85, 247, 0.05));
      border: 1px solid rgba(168, 85, 247, 0.4);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 20px;
      animation: fadeIn 0.3s ease-out;
    }

    .compaction-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
      color: var(--text-primary);
    }

    .compaction-icon {
      font-size: 18px;
    }

    .compaction-header strong {
      font-size: 14px;
      color: #a855f7;
    }

    .compaction-details {
      font-size: 12px;
      color: var(--text-secondary);
      line-height: 1.5;
    }

    .compaction-details p {
      margin: 0 0 10px 0;
    }

    .compaction-details details {
      background: rgba(0, 0, 0, 0.2);
      border-radius: 8px;
      padding: 8px 12px;
    }

    .compaction-details summary {
      cursor: pointer;
      color: #a855f7;
      font-weight: 500;
      user-select: none;
    }

    .compaction-details summary:hover {
      text-decoration: underline;
    }

    .compaction-summary {
      margin-top: 10px;
      padding: 12px;
      background: rgba(0, 0, 0, 0.15);
      border-radius: 6px;
      white-space: pre-wrap;
      font-size: 11px;
      color: var(--text-secondary);
      max-height: 200px;
      overflow-y: auto;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .message-sender {
      font-weight: 500;
      font-size: 13px;
    }

    .message-time {
      font-size: 11px;
      color: var(--text-secondary);
    }

    .message-content {
      padding: 12px 16px;
      background: var(--bg-secondary);
      border-radius: 12px;
      border-top-left-radius: 4px;
      line-height: 1.6;
      white-space: pre-wrap;
    }

    .message.user .message-content {
      background: var(--bg-tertiary);
      border-top-left-radius: 12px;
      border-top-right-radius: 4px;
      margin-left: 36px;
    }

    .message-content code {
      background: var(--vscode-textCodeBlock-background);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: var(--vscode-editor-font-family);
    }

    .message-content pre {
      background: var(--vscode-textCodeBlock-background);
      padding: 12px;
      border-radius: 8px;
      overflow-x: auto;
      margin: 8px 0;
    }

    .message-meta {
      display: flex;
      gap: 12px;
      margin-top: 8px;
      font-size: 11px;
      color: var(--text-secondary);
      padding-left: 36px;
    }

    /* Input */
    .chat-input {
      padding: 16px;
      border-top: 1px solid var(--border-color);
      background: var(--bg-secondary);
    }

    .input-container {
      display: flex;
      gap: 8px;
      align-items: flex-end;
    }

    .input-wrapper {
      flex: 1;
      position: relative;
    }

    .input-wrapper textarea {
      width: 100%;
      padding: 12px;
      border: 1px solid var(--border-color);
      background: var(--bg-tertiary);
      color: var(--text-primary);
      border-radius: 8px;
      font-family: inherit;
      font-size: inherit;
      resize: none;
      min-height: 44px;
      max-height: 200px;
    }

    .input-wrapper textarea:focus {
      outline: none;
      border-color: var(--vscode-focusBorder);
    }

    /* Image Drop Zone */
    .drop-zone {
      border: 2px dashed var(--border-color);
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 8px;
      text-align: center;
      color: var(--text-secondary);
      font-size: 12px;
      transition: all 0.2s;
      cursor: pointer;
      display: none;
    }

    .drop-zone.visible {
      display: block;
    }

    .drop-zone.drag-over {
      border-color: var(--vscode-focusBorder);
      background: var(--bg-tertiary);
      color: var(--text-primary);
    }

    .drop-zone-icon {
      font-size: 24px;
      margin-bottom: 4px;
    }

    /* Attached Images */
    .attached-images {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 8px;
    }

    .attached-image {
      position: relative;
      width: 60px;
      height: 60px;
      border-radius: 6px;
      overflow: hidden;
      border: 1px solid var(--border-color);
    }

    .attached-image img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .attached-image .remove-image {
      position: absolute;
      top: 2px;
      right: 2px;
      width: 18px;
      height: 18px;
      background: rgba(0,0,0,0.7);
      color: white;
      border: none;
      border-radius: 50%;
      cursor: pointer;
      font-size: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .attached-image .remove-image:hover {
      background: rgba(255,0,0,0.8);
    }

    .input-options {
      display: flex;
      gap: 8px;
      margin-top: 8px;
      align-items: center;
    }

    .input-option {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      color: var(--text-secondary);
    }

    .attach-btn {
      padding: 4px 8px;
      background: transparent;
      border: 1px solid var(--border-color);
      color: var(--text-secondary);
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }

    .attach-btn:hover {
      background: var(--bg-tertiary);
      color: var(--text-primary);
    }

    .send-btn {
      padding: 12px 24px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 500;
      align-self: stretch;
      min-height: 70px;
      font-size: 14px;
    }

    .send-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .send-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .stop-btn {
      padding: 12px 24px;
      background: linear-gradient(135deg, #ef4444, #dc2626);
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 500;
      transition: all 0.2s ease;
      align-self: stretch;
      min-height: 70px;
      font-size: 14px;
    }

    .stop-btn:hover {
      filter: brightness(1.1);
      transform: scale(1.02);
    }

    /* Token consumption bar */
    .token-bar-wrapper {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 8px 12px 4px;
      padding: 8px 10px;
      background: rgba(0, 0, 0, 0.28);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 10px;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25) inset;
    }

    .token-bar-container {
      flex: 1;
      height: 14px;
      background: #2a3a4a;
      border: 1px solid #4a6a8a;
      border-radius: 7px;
      position: relative;
      overflow: hidden;
    }

    .token-bar-fill {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #8b0000, #b91c1c, #dc2626);
      transition: width 0.3s ease;
      min-width: 10px;
      border-radius: 6px;
    }

    .token-bar-label {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      color: #888;
      white-space: nowrap;
    }

    .token-bar-cost {
      color: #9aa0a6;
    }

    .token-bar-cost.saved {
      color: #7a7a7a;
      font-style: italic;
    }

    .token-bar-link {
      color: #8ab4f8;
      text-decoration: none;
      border-bottom: 1px dotted rgba(138, 180, 248, 0.6);
    }

    .token-bar-link:hover {
      color: #b5ccff;
      border-bottom-color: rgba(181, 204, 255, 0.9);
    }

    .token-bar-container[data-warning="true"] .token-bar-fill {
      background: #b91c1c;
    }

    .token-bar-container[data-critical="true"] .token-bar-fill {
      background: #dc2626;
      animation: pulse-red 1s ease-in-out infinite;
    }

    @keyframes pulse-red {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }

    /* Connection Method Radio */
    .connection-method {
      display: flex;
      gap: 16px;
      margin-top: 8px;
    }

    .connection-method label {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      font-size: 13px;
    }

    .connection-method input[type="radio"] {
      width: auto;
    }

    .method-description {
      font-size: 11px;
      color: var(--text-secondary);
      margin-top: 4px;
    }

    /* CLI Status Cards */
    .cli-status-card {
      background: var(--bg-tertiary);
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .cli-status-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .cli-status-icon {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      font-weight: bold;
    }

    .cli-status-icon.claude {
      background: var(--accent-claude);
      color: white;
    }

    .cli-status-icon.codex {
      background: var(--accent-gpt);
      color: white;
    }

    .cli-status-details h4 {
      margin: 0 0 4px 0;
      font-size: 14px;
    }

    .cli-status-badges {
      display: flex;
      gap: 6px;
    }

    .cli-badge {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 500;
    }

    .cli-badge.installed {
      background: rgba(74, 222, 128, 0.2);
      color: #06b6d4;
    }

    .cli-badge.not-installed {
      background: rgba(239, 68, 68, 0.2);
      color: #ef4444;
    }

    .cli-badge.logged-in {
      background: rgba(96, 165, 250, 0.2);
      color: #60a5fa;
    }

    .cli-badge.not-logged-in {
      background: rgba(251, 191, 36, 0.2);
      color: #fbbf24;
    }

    .cli-status-actions {
      display: flex;
      gap: 8px;
    }

    .cli-status-actions button {
      padding: 6px 12px;
      font-size: 12px;
    }

    /* Status */
    .status-bar {
      padding: 8px 16px;
      font-size: 12px;
      color: var(--text-secondary);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--vscode-charts-green);
    }

    .status-dot.thinking {
      animation: pulse 1s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    /* Settings Tab */
    .settings-content {
      padding: 24px;
      max-width: 600px;
    }

    .settings-section {
      margin-bottom: 32px;
    }

    .settings-section h3 {
      margin-bottom: 16px;
      font-size: 14px;
      font-weight: 600;
    }

    /* MCP Panel needs full width for split layout */
    #panel-mcp {
      display: flex;
      flex-direction: column;
      width: 100%;
      flex: 1;
      padding: 0 24px 24px 24px;
      box-sizing: border-box;
    }
    #panel-mcp .settings-content {
      display: flex;
      flex-direction: column;
      flex: 1;
      max-width: 100%;
      width: 100%;
      padding: 0;
      box-sizing: border-box;
    }
    #panel-mcp .settings-section {
      display: flex;
      flex-direction: column;
      flex: 1;
      width: 100%;
    }
    #panel-mcp .settings-section h3 {
      flex-shrink: 0;
    }

    .setting-item {
      margin-bottom: 16px;
    }

    .setting-item label {
      display: block;
      margin-bottom: 6px;
      font-size: 13px;
    }

    .setting-item input,
    .setting-item select {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid var(--border-color);
      background: var(--bg-tertiary);
      color: var(--text-primary);
      border-radius: 6px;
      font-size: 13px;
    }

    .setting-item input:focus,
    .setting-item select:focus {
      outline: none;
      border-color: var(--vscode-focusBorder);
    }

    .btn-primary {
      padding: 8px 16px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
    }

    .btn-secondary {
      padding: 8px 16px;
      background: transparent;
      color: var(--text-primary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
    }

    .btn-connect {
      padding: 6px 14px;
      background: linear-gradient(135deg, var(--accent-mastermind), #7c3aed);
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      transition: all 0.2s ease;
    }

    .btn-connect:hover {
      filter: brightness(1.1);
      transform: translateY(-1px);
    }

    .btn-remove {
      padding: 6px 12px;
      background: transparent;
      color: var(--text-secondary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
    }

    /* MasterMind Config Panel */
    .mastermind-config {
      display: none;
      background: linear-gradient(135deg, rgba(168, 85, 247, 0.1), rgba(124, 58, 237, 0.1));
      border: 1px solid rgba(168, 85, 247, 0.3);
      border-radius: 8px;
      margin: 8px 12px;
      overflow: hidden;
    }

    .mastermind-config.visible {
      display: block;
    }

    .mastermind-header {
      display: flex;
      align-items: center;
      padding: 10px 14px;
      cursor: pointer;
      background: rgba(168, 85, 247, 0.15);
    }

    .mastermind-header:hover {
      background: rgba(168, 85, 247, 0.2);
    }

    .mastermind-title {
      font-weight: 600;
      color: #a855f7;
      font-size: 14px;
    }

    .mastermind-subtitle {
      color: var(--text-secondary);
      font-size: 12px;
      margin-left: 8px;
    }

    .mastermind-toggle {
      margin-left: auto;
      color: var(--text-secondary);
      font-size: 12px;
      transition: transform 0.2s;
    }

    .mastermind-toggle.collapsed {
      transform: rotate(-90deg);
    }

    .mastermind-body {
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .mastermind-body.collapsed {
      display: none;
    }

    .mastermind-row {
      display: flex;
      gap: 12px;
    }

    .mastermind-field {
      flex: 1;
    }

    .mastermind-field.half {
      flex: 0 0 calc(50% - 6px);
    }

    .mastermind-field label {
      display: block;
      font-size: 12px;
      color: var(--text-secondary);
      margin-bottom: 4px;
    }

    .mastermind-field select,
    .mastermind-field input,
    .mastermind-field textarea {
      width: 100%;
      padding: 8px 10px;
      background: var(--input-bg);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      color: var(--text-primary);
      font-size: 13px;
      font-family: inherit;
    }

    .mastermind-field textarea {
      resize: vertical;
      min-height: 50px;
    }

    .mastermind-mode-desc {
      font-size: 12px;
      color: var(--text-secondary);
      margin: -8px 0 4px 0;
      padding-left: 2px;
    }

    .mastermind-checkbox {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: var(--text-primary);
      cursor: pointer;
    }

    .mastermind-checkbox input {
      width: 16px;
      height: 16px;
      cursor: pointer;
    }

    .mastermind-start-btn {
      padding: 10px 20px;
      background: linear-gradient(90deg, #f97316, #a855f7);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      margin-top: 4px;
    }

    .mastermind-start-btn:hover {
      filter: brightness(1.1);
      transform: translateY(-1px);
    }

    /* Model/Mode Toolbar */
    .model-toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: var(--bg-secondary);
      border-top: 1px solid var(--border-color);
    }

    .toolbar-item {
      position: relative;
    }

    .toolbar-dropdown-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      color: var(--text-primary);
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .toolbar-dropdown-btn:hover {
      background: var(--bg-hover);
      border-color: var(--text-secondary);
    }

    .toolbar-icon {
      font-size: 14px;
    }

    .toolbar-arrow {
      font-size: 10px;
      color: var(--text-secondary);
    }

    .toolbar-dropdown {
      display: none;
      position: absolute;
      bottom: 100%;
      left: 0;
      margin-bottom: 4px;
      min-width: 180px;
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 100;
      overflow: hidden;
    }

    .toolbar-dropdown.visible {
      display: block;
    }

    .dropdown-header {
      padding: 8px 12px;
      font-size: 11px;
      color: var(--text-secondary);
      border-bottom: 1px solid var(--border-color);
    }

    .dropdown-section {
      padding: 4px 0;
    }

    .dropdown-option {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 8px 12px;
      background: none;
      border: none;
      color: var(--text-primary);
      font-size: 13px;
      cursor: pointer;
      text-align: left;
    }

    .dropdown-option:hover {
      background: var(--bg-hover);
    }

    .option-icon {
      font-size: 14px;
      width: 20px;
      text-align: center;
    }

    .option-check {
      margin-left: auto;
      color: var(--accent-color);
      font-size: 14px;
    }

    .drop-zone {
      border: 2px dashed var(--border-color);
      border-radius: 8px;
      padding: 24px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s ease;
      background: var(--input-bg);
    }

    .drop-zone:hover, .drop-zone.drag-over {
      border-color: var(--accent-mastermind);
      background: rgba(168, 85, 247, 0.1);
    }

    .drop-zone p {
      margin: 4px 0;
      color: var(--text-secondary);
    }

    .embedding-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 10px;
      font-weight: 500;
    }

    .embedding-badge.embedded {
      background: rgba(34, 197, 94, 0.2);
      color: #22c55e;
    }

    .embedding-badge.not-embedded {
      background: rgba(234, 179, 8, 0.2);
      color: #eab308;
    }

    .progress-bar {
      width: 100%;
      height: 4px;
      background: var(--border-color);
      border-radius: 2px;
      overflow: hidden;
      margin-top: 8px;
    }

    .progress-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--accent-claude), var(--accent-mastermind));
      transition: width 0.3s ease;
    }

    .btn-remove:hover {
      background: rgba(239, 68, 68, 0.1);
      border-color: #ef4444;
      color: #ef4444;
    }

    /* Empty state */
    .empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px;
      text-align: center;
    }

    .empty-state h2 {
      margin-bottom: 8px;
      font-size: 20px;
    }

    .empty-state p {
      color: var(--text-secondary);
      margin-bottom: 24px;
    }

    .quick-actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      justify-content: center;
    }

    .quick-action {
      padding: 12px 20px;
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .quick-action:hover {
      border-color: var(--vscode-focusBorder);
      transform: translateY(-2px);
    }

    /* Chat session tabs */
    .chat-tabs {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 8px 16px;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
      overflow-x: auto;
    }

    .chat-tab {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      color: var(--text-secondary);
      white-space: nowrap;
      transition: all 0.2s;
    }

    .chat-tab:hover {
      background: var(--bg-primary);
      color: var(--text-primary);
    }

    .chat-tab.active {
      background: var(--bg-primary);
      color: var(--text-primary);
    }

    .chat-tab.active.claude { border-color: var(--accent-claude); }
    .chat-tab.active.gpt { border-color: var(--accent-gpt); }
    .chat-tab.active.mastermind { border-color: var(--accent-mastermind); }

    .chat-tab-icon {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .chat-tab-icon.claude { background: var(--accent-claude); }
    .chat-tab-icon.gpt { background: var(--accent-gpt); }
    .chat-tab-icon.mastermind { background: var(--accent-mastermind); }

    .chat-tab.generating .chat-tab-icon {
      position: relative;
      background: transparent;
    }

    .tab-spinner {
      display: inline-block;
      width: 8px;
      height: 8px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: var(--accent-mastermind);
      border-radius: 50%;
      animation: tab-spin 0.8s linear infinite;
    }

    .chat-tab.claude .tab-spinner { border-top-color: var(--accent-claude); }
    .chat-tab.gpt .tab-spinner { border-top-color: var(--accent-gpt); }

    @keyframes tab-spin {
      to { transform: rotate(360deg); }
    }

    .chat-tab-close {
      width: 14px;
      height: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 3px;
      opacity: 0.5;
      font-size: 10px;
    }

    .chat-tab-close:hover {
      opacity: 1;
      background: rgba(255,255,255,0.1);
    }

    .chat-tab-new {
      padding: 6px 10px;
      background: transparent;
      border: 1px dashed var(--border-color);
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      color: var(--text-secondary);
      transition: all 0.2s;
    }

    .chat-tab-new:hover {
      border-color: var(--accent-mastermind);
      color: var(--accent-mastermind);
    }

    /* MCP & KB lists */
    .list-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px;
      background: var(--bg-tertiary);
      border-radius: 8px;
      margin-bottom: 8px;
    }

    .list-item-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .list-item-status {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }

    .list-item-status.running { background: var(--vscode-charts-green); }
    .list-item-status.stopped { background: var(--text-secondary); }
    .list-item-status.error { background: var(--vscode-charts-red); }

    .list-item-actions {
      display: flex;
      gap: 8px;
    }

    .list-item-actions button {
      padding: 4px 8px;
      font-size: 11px;
    }

    /* Modal styles */
    .modal-overlay {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.6);
      z-index: 1000;
      justify-content: center;
      align-items: center;
    }
    .modal-overlay.visible {
      display: flex;
    }
    .modal-box {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 20px;
      max-width: 320px;
      text-align: center;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    }
    .modal-icon {
      font-size: 32px;
      margin-bottom: 12px;
    }
    .modal-title {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 8px;
      color: var(--text-primary);
    }
    .modal-message {
      font-size: 13px;
      color: var(--text-secondary);
      margin-bottom: 16px;
      line-height: 1.4;
    }
    .modal-btn {
      background: var(--accent-mastermind);
      color: white;
      border: none;
      padding: 8px 20px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
    }
    .modal-btn:hover {
      opacity: 0.9;
    }

    /* MCP Split Layout */
    .mcp-split-container {
      display: flex;
      gap: 16px;
      flex: 1;
      min-height: 400px;
      width: 100%;
    }
    .mcp-server-list {
      flex: 0 0 280px;
      max-width: 280px;
      min-width: 280px;
      overflow-y: auto;
    }
    .mcp-server-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      margin-bottom: 8px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .mcp-server-item:hover {
      background: var(--bg-hover);
    }
    .mcp-server-item.selected {
      border-color: var(--accent-mastermind);
      background: rgba(138, 43, 226, 0.1);
    }
    .mcp-server-item .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
      background: var(--vscode-charts-red); /* Default to red/disconnected */
    }
    .mcp-server-item .status-dot.running { background: var(--vscode-charts-green); }
    .mcp-server-item .status-dot.stopped { background: var(--vscode-charts-red); }
    .mcp-server-item .status-dot.unknown { background: var(--vscode-charts-red); }
    .mcp-server-item .status-dot.error { background: var(--vscode-charts-red); }
    .mcp-server-info {
      flex: 1;
      min-width: 0;
    }
    .mcp-server-info .name {
      font-weight: 600;
      font-size: 13px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .mcp-server-info .transport {
      font-size: 11px;
      color: var(--text-secondary);
    }
    .mcp-details-panel {
      flex: 1 1 auto;
      min-width: 0;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 20px;
      overflow-y: auto;
    }
    .mcp-details-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--text-secondary);
      text-align: center;
    }
    .mcp-details-empty .icon {
      font-size: 48px;
      margin-bottom: 12px;
      opacity: 0.5;
    }
    .mcp-details-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border-color);
    }
    .mcp-details-header h4 {
      margin: 0;
      font-size: 16px;
    }
    .mcp-details-actions {
      display: flex;
      gap: 8px;
    }
    .mcp-tools-section h5 {
      margin: 16px 0 8px 0;
      font-size: 12px;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .mcp-tool-item {
      display: inline-block;
      padding: 6px 10px;
      margin: 4px;
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      font-size: 12px;
      font-family: monospace;
    }
    .mcp-info-row {
      display: flex;
      margin-bottom: 8px;
      font-size: 13px;
    }
    .mcp-info-row .label {
      color: var(--text-secondary);
      width: 80px;
      flex-shrink: 0;
    }
    .mcp-info-row .value {
      color: var(--text-primary);
      word-break: break-all;
    }

    /* Agents Section Styles */
    .agents-section {
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    .agents-container {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    .agents-sidebar {
      width: 200px;
      background: var(--bg-secondary);
      border-right: 1px solid var(--border-color);
      padding: 12px;
      overflow-y: auto;
    }

    .sidebar-section {
      margin-bottom: 20px;
    }

    .sidebar-section h3 {
      font-size: 12px;
      text-transform: uppercase;
      color: var(--text-secondary);
      margin-bottom: 8px;
    }

    .node-palette {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .palette-node {
      padding: 10px 12px;
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      cursor: grab;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .palette-node:hover {
      border-color: var(--vscode-focusBorder);
      transform: translateX(4px);
    }

    .palette-node:active {
      cursor: grabbing;
    }

    .node-icon {
      font-size: 16px;
    }

    .workflow-list {
      max-height: 200px;
      overflow-y: auto;
    }

    .workflow-item {
      padding: 8px 10px;
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      margin-bottom: 6px;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .workflow-item:hover {
      border-color: var(--vscode-focusBorder);
    }

    .workflow-item.active {
      border-color: var(--accent-color);
      background: var(--accent-bg);
    }

    .workflow-item-name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .workflow-item-delete {
      opacity: 0;
      padding: 2px 6px;
      cursor: pointer;
      color: var(--error-text);
    }

    .workflow-item:hover .workflow-item-delete {
      opacity: 1;
    }

    .empty-text {
      color: var(--text-secondary);
      font-size: 12px;
      text-align: center;
      padding: 12px;
    }

    .agents-canvas-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .canvas-toolbar {
      display: flex;
      gap: 8px;
      padding: 8px 12px;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
      align-items: center;
    }

    .canvas-toolbar input {
      flex: 1;
      max-width: 200px;
      padding: 6px 10px;
      background: var(--input-bg);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      color: var(--text-primary);
    }

    .toolbar-btn {
      padding: 6px 12px;
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.2s;
    }

    .toolbar-btn:hover {
      border-color: var(--vscode-focusBorder);
    }

    .toolbar-btn.danger:hover {
      border-color: var(--error-text);
      color: var(--error-text);
    }

    .drawflow-canvas {
      flex: 1;
      background: var(--bg-primary);
      position: relative;
      overflow: hidden;
    }

    .canvas-footer {
      padding: 12px;
      background: var(--bg-secondary);
      border-top: 1px solid var(--border-color);
    }

    .workflow-input-container {
      display: flex;
      gap: 8px;
    }

    .workflow-input-container input {
      flex: 1;
      padding: 10px 14px;
      background: var(--input-bg);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      color: var(--text-primary);
    }

    .run-btn {
      padding: 10px 20px;
      background: var(--accent-color);
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 500;
      transition: all 0.2s;
    }

    .run-btn:hover {
      opacity: 0.9;
    }

    .agents-config {
      width: 280px;
      background: var(--bg-secondary);
      border-left: 1px solid var(--border-color);
      padding: 12px;
      overflow-y: auto;
    }

    .config-empty {
      color: var(--text-secondary);
      text-align: center;
      padding: 40px 20px;
    }

    .config-panel h3 {
      font-size: 14px;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border-color);
    }

    .config-field {
      margin-bottom: 16px;
    }

    .config-field label {
      display: block;
      font-size: 12px;
      color: var(--text-secondary);
      margin-bottom: 6px;
    }

    .config-field input,
    .config-field select,
    .config-field textarea {
      width: 100%;
      padding: 8px 10px;
      background: var(--input-bg);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      color: var(--text-primary);
    }

    .config-field textarea {
      min-height: 120px;
      resize: vertical;
      font-family: inherit;
    }

    .workflow-output {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      max-height: 40%;
      background: var(--bg-secondary);
      border-top: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
    }

    .output-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      border-bottom: 1px solid var(--border-color);
    }

    .output-header h3 {
      margin: 0;
      font-size: 14px;
    }

    .close-btn {
      background: none;
      border: none;
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 18px;
      padding: 4px 8px;
    }

    .close-btn:hover {
      color: var(--text-primary);
    }

    .output-content {
      flex: 1;
      padding: 12px;
      overflow-y: auto;
      white-space: pre-wrap;
      font-family: var(--vscode-editor-font-family);
      font-size: 13px;
    }

    /* Drawflow custom styles */
    .drawflow .drawflow-node {
      background: var(--bg-secondary);
      border: 2px solid var(--border-color);
      border-radius: 8px;
      min-width: 160px;
    }

    .drawflow .drawflow-node.selected {
      border-color: var(--accent-color);
    }

    .drawflow .drawflow-node .title-box {
      padding: 10px 14px;
      font-weight: 500;
    }

    .drawflow .drawflow-node.input-node {
      border-color: #10b981;
    }

    .drawflow .drawflow-node.agent-node {
      border-color: #8b5cf6;
    }

    .drawflow .drawflow-node.output-node {
      border-color: #f59e0b;
    }

    .drawflow .connection .main-path {
      stroke: var(--text-secondary);
      stroke-width: 2px;
    }

    .drawflow .connection .main-path:hover {
      stroke: var(--accent-color);
    }

    .drawflow .drawflow-node .input,
    .drawflow .drawflow-node .output {
      background: var(--accent-color);
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <div class="logo">
        <img src="${iconUri}" alt="SpaceCode" style="width: 24px; height: 24px; vertical-align: middle; margin-right: 8px;"> SpaceCode
      </div>
      <div class="mode-selector">
        <button class="mode-btn claude" data-mode="claude">Claude</button>
        <button class="mode-btn gpt" data-mode="gpt">GPT</button>
        <button class="mode-btn mastermind active" data-mode="mastermind">MasterMind</button>
        <button class="mode-btn agents" data-mode="agents" onclick="showAgentsPanel()">Agents</button>
      </div>
    </div>
    <div class="header-right">
      <button class="header-btn" onclick="clearChat()">Clear</button>
      <div class="settings-dropdown-container">
        <button class="header-btn" onclick="toggleLogsDropdown()">📋</button>
        <div class="settings-dropdown" id="logsDropdown">
          <button class="dropdown-item" onclick="showLogChannel('general')">General Logs</button>
          <button class="dropdown-item" onclick="showLogChannel('mcp')">MCP Logs</button>
          <button class="dropdown-item" onclick="showLogChannel('api')">API Logs</button>
          <button class="dropdown-item" onclick="showLogChannel('tools')">Tools Logs</button>
          <div style="border-top: 1px solid var(--border); margin: 4px 0;"></div>
          <button class="dropdown-item" onclick="openDevTools()">Developer Console</button>
          <button class="dropdown-item" onclick="openTerminal()">Open Terminal</button>
          <div style="border-top: 1px solid var(--border); margin: 4px 0;"></div>
          <button class="dropdown-item" onclick="clearAllLogs()">Clear All Logs</button>
        </div>
      </div>
      <button class="header-btn" onclick="showSettingsPanel('voice')">⚙️</button>
    </div>
  </div>

  <div class="content">
    <div class="main-split">
      <div class="left-pane">
        <!-- Chat Section (always visible) -->
        <div class="chat-section" id="chatSection">
      <!-- Chat session tabs -->
      <div class="chat-tabs" id="chatTabs">
        <div class="chat-tab active mastermind" data-chat-id="1" onclick="switchChat('1')">
          <div class="chat-tab-icon mastermind"></div>
          <span>Chat 1</span>
          <span class="chat-tab-close" onclick="event.stopPropagation(); closeChat('1')">×</span>
        </div>
        <button class="chat-tab-new" onclick="newChat()">+</button>
      </div>

      <!-- MasterMind Config Panel -->
      <div class="mastermind-config" id="mastermindConfig">
        <div class="mastermind-header" onclick="toggleMastermindConfig()">
          <span class="mastermind-title">🧠 MasterMind Mode</span>
          <span class="mastermind-subtitle">AI-to-AI Collaboration</span>
          <span class="mastermind-toggle" id="mastermindToggle">▼</span>
        </div>
        <div class="mastermind-body" id="mastermindBody">
          <div class="mastermind-row">
            <div class="mastermind-field">
              <label>Mode</label>
              <select id="mastermindModeSelect" onchange="updateMastermindModeDescription()">
                <option value="collaborate">Collaborate</option>
                <option value="code-review">Code Review</option>
                <option value="debate">Debate</option>
              </select>
            </div>
          </div>
          <p class="mastermind-mode-desc" id="mastermindModeDesc">Claude and GPT work together to solve a problem, building on each other's ideas.</p>

          <div class="mastermind-field">
            <label>Topic / Question</label>
            <textarea id="mastermindTopic" placeholder="Enter the topic or question for the AIs to discuss..." rows="2"></textarea>
          </div>

          <div class="mastermind-row">
            <div class="mastermind-field half">
              <label>Max Turns</label>
              <input type="number" id="mastermindMaxTurns" value="5" min="2" max="30">
            </div>
            <div class="mastermind-field half">
              <label>Response Style</label>
              <select id="mastermindStyle">
                <option value="concise">Concise</option>
                <option value="detailed">Detailed</option>
              </select>
            </div>
          </div>

          <label class="mastermind-checkbox">
            <input type="checkbox" id="mastermindAutoSummarize" checked>
            Auto-summarize at end
          </label>

          <button class="mastermind-start-btn" onclick="startMastermindConversation()">Start Conversation</button>
        </div>
      </div>

      <div class="chat-messages" id="chatMessages">
        <div class="empty-state" id="emptyState">
          <h2>Welcome to SpaceCode</h2>
          <p>Your AI coding companion with MasterMind mode</p>
          <div class="quick-actions">
            <button class="quick-action" onclick="insertPrompt('Review my code')">Review Code</button>
            <button class="quick-action" onclick="insertPrompt('Explain this function')">Explain Code</button>
            <button class="quick-action" onclick="insertPrompt('Help me debug')">Debug</button>
            <button class="quick-action" onclick="insertPrompt('Write tests for')">Write Tests</button>
          </div>
        </div>
      </div>

      <div class="status-bar" id="statusBar">
        <div class="status-dot" id="statusDot"></div>
        <span id="statusText">Ready</span>
      </div>

      <div class="token-bar-wrapper">
        <div class="token-bar-container" id="tokenBarContainer" title="Token usage: 0%">
          <div class="token-bar-fill" id="tokenBarFill" style="width: 2%;"></div>
        </div>
        <span class="token-bar-label" id="tokenBarLabel">0 / 200K tokens</span>
      </div>

      <!-- Model/Mode Selector Toolbar -->
      <div class="model-toolbar" id="modelToolbar">
        <div class="toolbar-item">
          <button class="toolbar-dropdown-btn" onclick="toggleToolbarDropdown('modeDropdown')">
            <span class="toolbar-icon">💬</span>
            <span id="selectedModeLabel">Chat</span>
            <span class="toolbar-arrow">▾</span>
          </button>
          <div class="toolbar-dropdown" id="modeDropdown">
            <div class="dropdown-header">Switch mode</div>
            <button class="dropdown-option" onclick="selectChatMode('chat')">
              <span class="option-icon">💬</span> Chat
              <span class="option-check" id="modeCheck-chat">✓</span>
            </button>
            <button class="dropdown-option" onclick="selectChatMode('agent')">
              <span class="option-icon">🤖</span> Agent
              <span class="option-check" id="modeCheck-agent"></span>
            </button>
            <button class="dropdown-option" onclick="selectChatMode('agent-full')">
              <span class="option-icon">⚡</span> Agent (full access)
              <span class="option-check" id="modeCheck-agent-full"></span>
            </button>
          </div>
        </div>

        <div class="toolbar-item" id="modelSelectorContainer">
          <button class="toolbar-dropdown-btn" onclick="toggleToolbarDropdown('modelDropdown')">
            <span id="selectedModelLabel">Claude Sonnet</span>
            <span class="toolbar-arrow">▾</span>
          </button>
          <div class="toolbar-dropdown" id="modelDropdown">
            <div class="dropdown-header">Select model</div>
            <div class="dropdown-section" id="claudeModelsSection">
              <button class="dropdown-option" onclick="selectModel('claude', 'claude-sonnet-4')">
                Claude Sonnet 4
                <span class="option-check" id="modelCheck-claude-sonnet-4">✓</span>
              </button>
              <button class="dropdown-option" onclick="selectModel('claude', 'claude-opus-4')">
                Claude Opus 4
                <span class="option-check" id="modelCheck-claude-opus-4"></span>
              </button>
              <button class="dropdown-option" onclick="selectModel('claude', 'claude-haiku')">
                Claude Haiku
                <span class="option-check" id="modelCheck-claude-haiku"></span>
              </button>
            </div>
            <div class="dropdown-section" id="gptModelsSection" style="display: none;">
              <button class="dropdown-option" onclick="selectModel('gpt', 'gpt-5.2-codex')">
                GPT-5.2-Codex
                <span class="option-check" id="modelCheck-gpt-5.2-codex"></span>
              </button>
              <button class="dropdown-option" onclick="selectModel('gpt', 'gpt-5.2')">
                GPT-5.2
                <span class="option-check" id="modelCheck-gpt-5.2"></span>
              </button>
              <button class="dropdown-option" onclick="selectModel('gpt', 'gpt-5.1-codex-max')">
                GPT-5.1-Codex-Max
                <span class="option-check" id="modelCheck-gpt-5.1-codex-max"></span>
              </button>
              <button class="dropdown-option" onclick="selectModel('gpt', 'gpt-5.1-codex-mini')">
                GPT-5.1-Codex-Mini
                <span class="option-check" id="modelCheck-gpt-5.1-codex-mini">✓</span>
              </button>
            </div>
          </div>
        </div>

        <div class="toolbar-item" id="reasoningContainer">
          <button class="toolbar-dropdown-btn" onclick="toggleToolbarDropdown('reasoningDropdown')">
            <span class="toolbar-icon">🧠</span>
            <span id="selectedReasoningLabel">Medium</span>
            <span class="toolbar-arrow">▾</span>
          </button>
          <div class="toolbar-dropdown" id="reasoningDropdown">
            <div class="dropdown-header">Select reasoning</div>
            <button class="dropdown-option" onclick="selectReasoning('medium')">
              <span class="option-icon">🧠</span> Medium
              <span class="option-check" id="reasoningCheck-medium">✓</span>
            </button>
            <button class="dropdown-option" onclick="selectReasoning('high')">
              <span class="option-icon">🧠</span> High
              <span class="option-check" id="reasoningCheck-high"></span>
            </button>
          </div>
        </div>
      </div>

      <div class="chat-input">
        <div class="input-container">
          <div class="input-wrapper">
            <div class="drop-zone" id="dropZone"
                 ondrop="handleDrop(event)"
                 ondragover="handleDragOver(event)"
                 ondragleave="handleDragLeave(event)">
              <div class="drop-zone-icon">📷</div>
              Drop images here
            </div>
            <div class="attached-images" id="attachedImages"></div>
            <textarea
              id="messageInput"
              placeholder="Ask anything... (Paste images with Cmd+V)"
              rows="1"
              onkeydown="handleKeyDown(event)"
              oninput="autoResize(this)"
              onpaste="handlePaste(event)"
            ></textarea>
            <div class="input-options">
              <button class="attach-btn" onclick="toggleDropZone()">📎</button>
            </div>
          </div>
          <button class="send-btn" onclick="sendMessage()" id="sendBtn">Send</button>
          <button class="stop-btn" onclick="stopConversation()" id="stopBtn" style="display: none;">Stop</button>
        </div>
      </div>
    </div>

    <!-- Agents Section -->
    <div class="agents-section" id="agentsSection" style="display: none;">
      <div class="agents-container">
        <!-- Left Sidebar: Node Palette & Workflows -->
        <div class="agents-sidebar">
          <div class="sidebar-section">
            <h3>Nodes</h3>
            <div class="node-palette">
              <div class="palette-node" draggable="true" data-node="input">
                <span class="node-icon">📥</span> Input
              </div>
              <div class="palette-node" draggable="true" data-node="agent">
                <span class="node-icon">🤖</span> Agent
              </div>
              <div class="palette-node" draggable="true" data-node="output">
                <span class="node-icon">📤</span> Output
              </div>
            </div>
          </div>
          <div class="sidebar-section">
            <h3>Workflows</h3>
            <div class="workflow-list" id="workflowList">
              <p class="empty-text">No workflows yet</p>
            </div>
            <button class="btn-secondary" onclick="newWorkflow()" style="width: 100%; margin-top: 8px;">+ New Workflow</button>
          </div>
        </div>

        <!-- Center: Drawflow Canvas -->
        <div class="agents-canvas-container">
          <div class="canvas-toolbar">
            <input type="text" id="workflowName" placeholder="Workflow Name" value="New Workflow">
            <button class="toolbar-btn" onclick="saveCurrentWorkflow()">💾 Save</button>
            <button class="toolbar-btn" onclick="importWorkflow()">📥 Import</button>
            <button class="toolbar-btn" onclick="exportCurrentWorkflow()">📤 Export</button>
            <button class="toolbar-btn danger" onclick="clearCanvas()">🗑️ Clear</button>
          </div>
          <div id="drawflowCanvas" class="drawflow-canvas"></div>
          <div class="canvas-footer">
            <div class="workflow-input-container">
              <input type="text" id="workflowInput" placeholder="Enter message to run through workflow...">
              <button class="run-btn" onclick="runWorkflow()">▶ Run Workflow</button>
            </div>
          </div>
        </div>

        <!-- Right Sidebar: Node Configuration -->
        <div class="agents-config" id="agentsConfig">
          <div class="config-empty">
            <p>Select a node to configure</p>
          </div>
          <div class="config-panel" id="nodeConfigPanel" style="display: none;">
            <h3 id="configNodeType">Node Configuration</h3>
            <div id="configContent"></div>
          </div>
        </div>
      </div>

      <!-- Workflow Output -->
      <div class="workflow-output" id="workflowOutput" style="display: none;">
        <div class="output-header">
          <h3>Workflow Output</h3>
          <button class="close-btn" onclick="closeWorkflowOutput()">×</button>
        </div>
        <div class="output-content" id="workflowOutputContent"></div>
	      </div>
	    </div><!-- End chat-section -->
	  </div><!-- End left-pane -->

	  <div class="splitter" id="mainSplitter" title="Drag to resize"></div>

	  <div class="right-pane">
	    <div class="ship-panel">
	      <div class="ship-title" style="display: flex; justify-content: space-between; align-items: center;">
	        Station View
	        <button class="btn-secondary" onclick="openHotspotTool()" style="padding: 4px 8px; font-size: 10px;">Edit Hotspots</button>
	      </div>
	      <div class="ship-canvas" id="shipCanvas">
	        <img class="ship-image" id="shipImage" src="${stationUri}" alt="Station"
	          onerror="if(!this.dataset.fallback){this.dataset.fallback='1'; this.src='${shipUri}';} else {this.onerror=null; this.src='${shipFallbackUri}';}" />
	        <!-- Hotspots injected by JS -->
	      </div>

	      <div class="control-panel">
	        <div class="ship-title" style="margin-bottom: 6px;">Control Panel</div>
	        <div class="control-row" style="justify-content: space-between; gap: 10px;">
	          <button class="btn-secondary" onclick="stationGoBack()" id="stationBackBtn" style="padding: 6px 10px;">Back</button>
	          <div class="breadcrumbs" id="stationBreadcrumbs" title="Station navigation"></div>
	        </div>
	        <div class="control-row">
	          <span class="control-chip" id="shipSelectedSectorChip">Sector: (none)</span>
	          <span class="control-chip">Profile:</span>
	          <select id="shipProfileSelect" style="padding: 6px 10px; border-radius: 999px;">
	            <option value="yard">Yard</option>
	            <option value="scout">Scout</option>
	            <option value="battleship">Battleship</option>
	          </select>
	        </div>

	        <div class="control-actions">
	          <button class="btn-secondary" onclick="shipRequestContextPack()">Context Pack</button>
	          <button class="btn-secondary" onclick="shipRunGates()">Run Gates</button>
	          <button class="btn-secondary" onclick="shipDocsStatus()">Docs</button>
	          <button class="btn-secondary" onclick="shipToggleAutoexecute()" id="shipAutoBtn">Autoexecute: Off</button>
	        </div>

	        <div class="context-preview">
	          <div class="context-preview-header">
	            <div style="display:flex; align-items:center; gap:10px;">
	              <strong style="font-size:12px;">Context Preview</strong>
	              <label style="margin:0;">
	                <input type="checkbox" id="injectContextToggle" checked />
	                Inject
	              </label>
	            </div>
	            <button class="btn-secondary" onclick="copyContextPreview()" style="padding: 6px 10px;">Copy</button>
	          </div>
	          <div class="context-preview-box" id="contextPreviewBox">(context will appear here)</div>
	        </div>

        <div class="doc-gate">
          <label for="docTargetSelect">Documentation Target (required outside Yard)</label>
          <select id="docTargetSelect">
            <option value="">Select a docs file...</option>
          </select>
          <div style="display:flex; justify-content:flex-end; gap:6px;">
            <button class="btn-secondary" onclick="refreshDocTargets()" style="padding:4px 10px;">Refresh</button>
          </div>
        </div>

        <div class="job-queue">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong style="font-size:12px;">Approval Queue</strong>
            <button class="btn-secondary" onclick="requestJobList()" style="padding:4px 10px;">Refresh</button>
          </div>
          <div id="jobList" class="job-list"></div>
        </div>

        <div class="control-subtitle" id="shipStatusText">Select a sector to focus context and gates.</div>
        <div class="sector-list" id="shipSectorList"></div>
	      </div>
	    </div>
	  </div><!-- End right-pane -->
	</div><!-- End main-split -->

	<!-- Settings Panel Overlay -->
    <div class="settings-panel-overlay" id="settingsPanelOverlay">
      <div class="settings-tabs-bar">
        <div class="settings-tabs-left">
          <button class="settings-tab" data-panel="mcp" onclick="switchSettingsTab('mcp')">MCP</button>
          <button class="settings-tab" data-panel="kb" onclick="switchSettingsTab('kb')">Knowledge</button>
          <button class="settings-tab" data-panel="costs" onclick="switchSettingsTab('costs')">Costs</button>
          <button class="settings-tab active" data-panel="voice" onclick="switchSettingsTab('voice')">Voice</button>
          <button class="settings-tab" data-panel="settings" onclick="switchSettingsTab('settings')">Settings</button>
        </div>
        <button class="settings-close-btn" onclick="closeSettingsPanel()">✕</button>
      </div>

      <!-- MCP Panel -->
      <div class="settings-panel-content" id="panel-mcp" style="display: none;">
        <div class="settings-content">
          <div class="settings-section">
            <h3>MCP Servers</h3>
            <div class="mcp-split-container">
              <div class="mcp-server-list">
                <div id="mcpList"></div>
                <button class="btn-secondary" onclick="addMcpServer()" style="width: 100%; margin-top: 8px;">+ Add Server</button>
              </div>
              <div class="mcp-details-panel" id="mcpDetailsPanel">
                <div class="mcp-details-empty">
                  <div class="icon">🔌</div>
                  <p>Select a server to view details</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- KB Panel -->
      <div class="settings-panel-content" id="panel-kb" style="display: none;">
        <div class="settings-content">
          <div class="settings-section">
            <h3>Embedding Model (ONNX)</h3>
            <div class="setting-item">
              <label style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px; display: block;">Select Model</label>
              <select id="modelSelect" onchange="onModelSelect()" style="width: 100%; padding: 8px; background: var(--input-bg); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px;">
                <option value="">Loading models...</option>
              </select>
            </div>
            <div id="modelInfo" style="margin-top: 8px; font-size: 12px; color: var(--text-secondary);"></div>
            <div id="embedderStatus" style="margin-top: 12px;">
              <p style="color: var(--text-secondary)">Checking model status...</p>
            </div>
            <div id="downloadProgressContainer" style="display: none; margin-top: 12px;">
              <div class="progress-bar">
                <div class="progress-bar-fill" id="downloadProgressFill" style="width: 0%"></div>
              </div>
              <p id="downloadProgressText" style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;"></p>
              <p id="downloadProgressBytes" style="font-size: 10px; color: var(--text-secondary);"></p>
            </div>
          </div>

          <div class="settings-section">
            <h3>Add Content</h3>
            <div class="setting-item">
              <input type="text" id="kbUrlInput" placeholder="Enter URL to add...">
              <div style="display: flex; gap: 8px; align-items: center; margin-top: 12px; padding: 8px; background: var(--input-bg); border-radius: 6px;">
                <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                  <input type="checkbox" id="kbCrawlWebsite" onchange="toggleCrawlOptions()" checked style="width: 16px; height: 16px;">
                  <span style="font-size: 13px; font-weight: 500;">Crawl entire website</span>
                </label>
              </div>
              <div id="crawlOptions" style="display: block; margin-top: 8px; padding: 8px; background: var(--input-bg); border-radius: 6px;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                  <label style="font-size: 11px;">
                    Max pages:
                    <input type="number" id="kbMaxPages" value="10000" min="1" max="50000" style="width: 90px; margin-left: 4px;">
                  </label>
                  <label style="font-size: 11px;">
                    Max depth:
                    <input type="number" id="kbMaxDepth" value="10" min="1" max="20" style="width: 70px; margin-left: 4px;">
                  </label>
                </div>
              </div>
              <button class="btn-primary" onclick="addKbUrl()" id="addUrlBtn" style="margin-top: 8px;">Crawl Website</button>
              <div id="crawlProgress" style="display: none; margin-top: 8px;">
                <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px;">
                  <span id="crawlStatus">Crawling...</span>
                  <span id="crawlCount">0/0 pages</span>
                </div>
                <div class="progress-bar-container" style="height: 4px; background: var(--input-bg); border-radius: 2px;">
                  <div id="crawlProgressBar" class="progress-bar" style="width: 0%; height: 100%; background: var(--accent); border-radius: 2px; transition: width 0.3s;"></div>
                </div>
                <p id="crawlCurrentUrl" style="font-size: 10px; color: var(--text-secondary); margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"></p>
              </div>
            </div>

            <div class="setting-item" style="margin-top: 16px;">
              <div id="pdfDropZone" class="drop-zone" ondrop="handlePdfDrop(event)" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)">
                <span style="font-size: 24px;">📄</span>
                <p>Drop PDF files here</p>
                <p style="font-size: 11px; color: var(--text-secondary)">or click to select</p>
                <input type="file" id="pdfFileInput" accept=".pdf" style="display: none;" onchange="handlePdfSelect(event)" multiple>
              </div>
            </div>
          </div>

          <div class="settings-section">
            <h3>Knowledge Base Entries</h3>
            <div id="kbStats" style="margin-bottom: 12px; padding: 8px; background: var(--input-bg); border-radius: 6px;">
              <p style="color: var(--text-secondary); font-size: 12px;">Loading stats...</p>
            </div>
            <button class="btn-secondary" onclick="embedAllEntries()" id="embedAllBtn" style="margin-bottom: 12px;">Embed All Entries</button>
            <div id="kbList"></div>
          </div>
        </div>
      </div>

      <!-- Costs Panel -->
      <div class="settings-panel-content" id="panel-costs" style="display: none;">
        <div class="settings-content">
          <div class="settings-section">
            <h3>Usage & Costs</h3>
            <div id="costsContent"></div>
          </div>
        </div>
      </div>

      <!-- Logs Panel -->
      <div class="settings-panel-content" id="panel-logs" style="display: none;">
        <div class="settings-content">
          <div class="settings-section">
            <h3>Output Channels</h3>
            <p class="method-description" style="margin-bottom: 16px;">View logs in VSCode's Output panel (bottom).</p>
            <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px;">
              <button class="btn-secondary" onclick="showLogChannel('general')">General Logs</button>
              <button class="btn-secondary" onclick="showLogChannel('mcp')">MCP Logs</button>
              <button class="btn-secondary" onclick="showLogChannel('api')">API Logs</button>
              <button class="btn-secondary" onclick="showLogChannel('tools')">Tools Logs</button>
            </div>
            <button class="btn-secondary" onclick="clearAllLogs()" style="background: var(--error-bg); border-color: var(--error-text);">Clear All Logs</button>
          </div>
          <div class="settings-section">
            <h3>Terminal</h3>
            <p class="method-description" style="margin-bottom: 16px;">Open a new terminal in VSCode's integrated terminal.</p>
            <button class="btn-secondary" onclick="openTerminal()">Open Terminal</button>
          </div>
        </div>
      </div>

      <!-- Voice Panel -->
      <div class="settings-panel-content" id="panel-voice" style="display: none;">
        <div class="settings-content">
          <div class="settings-section">
            <h3>Speech-to-Text (STT)</h3>
            <p style="color: var(--text-secondary); margin-bottom: 16px;">Convert your voice to text using local Whisper AI.</p>
            <div style="margin-bottom: 16px;">
              <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;">
                <div>
                  <strong>Whisper Model</strong>
                  <span style="margin-left: 12px; font-size: 12px;">
                    <span id="whisperStatusIndicator" style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #888; margin-right: 6px;"></span>
                    <span id="whisperStatus">Not installed</span>
                  </span>
                </div>
                <button class="btn-secondary" id="whisperDownloadBtn" onclick="downloadWhisperModel()">Download Model</button>
              </div>
              <div style="margin-top: 12px;">
                <label style="font-size: 12px; color: var(--text-secondary);">Model Size</label>
                <select id="whisperModelSelect" onchange="saveVoiceSettings()" style="width: 100%; padding: 8px; margin-top: 4px; background: var(--input-bg); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px;">
                  <option value="tiny">Tiny (75MB)</option>
                  <option value="base">Base (150MB)</option>
                  <option value="small" selected>Small (500MB)</option>
                  <option value="medium">Medium (1.5GB)</option>
                </select>
              </div>
              <div style="margin-top: 12px; padding: 12px; background: var(--bg-tertiary); border-radius: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <strong>Whisper Binary</strong>
                    <span style="margin-left: 8px; font-size: 12px;">
                      <span id="whisperBinaryStatusIndicator" style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #888; margin-right: 6px;"></span>
                      <span id="whisperBinaryStatus">Not installed</span>
                    </span>
                  </div>
                  <button class="btn-secondary" id="whisperBinaryDownloadBtn" onclick="downloadWhisperBinary()">Download Binary</button>
                </div>
              </div>
            </div>
          </div>
          <div class="settings-section">
            <h3>Requirements</h3>
            <p style="color: var(--text-secondary);">FFmpeg is required for audio conversion:</p>
            <code style="display: block; background: var(--bg-tertiary); padding: 8px 12px; border-radius: 6px; margin-top: 8px;">brew install ffmpeg</code>
          </div>
          <div class="settings-section">
            <h3>Test</h3>
            <div style="display: flex; gap: 12px;">
              <button class="btn-secondary" onclick="testMicrophone()">🎤 Test Mic</button>
              <button class="btn-secondary" onclick="testSpeaker()">🔊 Test Speaker</button>
            </div>
            <div id="voiceTestResult" style="margin-top: 12px; padding: 8px; background: var(--bg-tertiary); border-radius: 4px; display: none;"></div>
          </div>
        </div>
      </div>

      <!-- Settings Panel -->
      <div class="settings-panel-content" id="panel-settings" style="display: none;">
        <div class="settings-content">
          <div class="settings-section" style="background: linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1)); border: 1px solid rgba(139, 92, 246, 0.3); border-radius: 8px; padding: 16px;">
            <h3 style="margin-top: 0;">📦 Extension Info</h3>
            <div style="font-family: monospace; font-size: 12px; line-height: 1.8;">
              <div style="display: grid; grid-template-columns: 140px 1fr; gap: 4px;">
                <span style="color: var(--text-secondary);">Name:</span>
                <span>SpaceCode v0.2.0</span>
                <span style="color: var(--text-secondary);">Extension Dir:</span>
                <span style="word-break: break-all;">~/.vscode/extensions/spacecode.mastercode-0.2.0/</span>
                <span style="color: var(--text-secondary);">Source Code:</span>
                <span style="word-break: break-all;">~/Projects/mastercode-extension/mastercode-extension/</span>
                <span style="color: var(--text-secondary);">Source Files:</span>
                <span>./out/ (compiled JS)</span>
                <span style="color: var(--text-secondary);">Patches Dir:</span>
                <span>~/.vscode/mastercode-patches/</span>
                <span style="color: var(--text-secondary);">Backup Dir:</span>
                <span>./out.backup/ (original files)</span>
              </div>
            </div>
          </div>

          <div class="settings-section">
            <h3>CLI Status</h3>
            <p class="method-description" style="margin-bottom: 16px;">Required for Web Account connection method. Install and login to use your Claude Pro or ChatGPT Plus subscription.</p>
            <div id="cliStatusContainer">
              <p style="color: var(--text-secondary)">Checking CLI status...</p>
            </div>
            <button class="btn-secondary" onclick="refreshCliStatus()" style="margin-top: 12px;">Refresh Status</button>
          </div>

          <div class="settings-section">
            <h3>Connection Methods</h3>
            <p class="method-description" style="margin-bottom: 16px;">Choose how to connect to each AI. Web accounts use your subscription (Claude Pro/ChatGPT Plus), API uses pay-per-token.</p>

            <div class="setting-item">
              <label><strong>Claude Connection</strong></label>
              <div class="connection-method">
                <label>
                  <input type="radio" name="claudeMethod" value="api" id="claudeMethodApi"> API Key
                </label>
                <label>
                  <input type="radio" name="claudeMethod" value="cli" id="claudeMethodCli"> Web Account (CLI)
                </label>
              </div>
              <p class="method-description">Web uses 'claude' CLI with your logged-in account</p>
            </div>

            <div class="setting-item">
              <label><strong>GPT Connection</strong></label>
              <div class="connection-method">
                <label>
                  <input type="radio" name="gptMethod" value="api" id="gptMethodApi"> API Key
                </label>
                <label>
                  <input type="radio" name="gptMethod" value="cli" id="gptMethodCli"> Web Account (CLI)
                </label>
              </div>
              <p class="method-description">Web uses 'codex' CLI with your logged-in account</p>
            </div>

            <button class="btn-primary" onclick="saveConnectionMethods()">Save Connection Methods</button>
          </div>

          <div class="settings-section" id="apiKeysSection">
            <h3>API Keys</h3>
            <p class="method-description" style="margin-bottom: 16px;">Only needed if using API connection method above.</p>
            <div class="setting-item">
              <label>Claude API Key (Anthropic)</label>
              <input type="password" id="claudeKeyInput" placeholder="sk-ant-...">
            </div>
            <div class="setting-item">
              <label>OpenAI API Key</label>
              <input type="password" id="openaiKeyInput" placeholder="sk-...">
            </div>
            <button class="btn-primary" onclick="saveApiKeys()">Save API Keys</button>
          </div>

          <div class="settings-section">
            <h3>Model Selection</h3>
            <p class="method-description" style="margin-bottom: 16px;">Used when connecting via API. Web accounts use your subscription's default model.</p>
            <div class="setting-item">
              <label>Claude Model</label>
              <select id="claudeModelSelect">
                <option value="claude-sonnet-4-5-20250514">Claude 4.5 Sonnet</option>
                <option value="claude-opus-4-5-20250514">Claude 4.5 Opus</option>
                <option value="claude-haiku-4-5-20250514">Claude 4.5 Haiku</option>
              </select>
            </div>
            <div class="setting-item">
              <label>GPT Model</label>
              <select id="gptModelSelect">
                <option value="codex-5.2">Codex 5.2</option>
                <option value="gpt-5.2">GPT 5.2</option>
                <option value="codex-5.1-high">Codex 5.1 High</option>
                <option value="codex-5.1-mini">Codex 5.1 Mini</option>
              </select>
            </div>
          </div>

        </div>
      </div>
    </div><!-- End settings-panel-overlay -->
  </div><!-- End content -->

  <!-- Max tabs modal -->
  <div class="modal-overlay" id="maxTabsModal">
    <div class="modal-box">
      <div class="modal-icon">📑</div>
      <div class="modal-title">Tab Limit Reached</div>
      <div class="modal-message">You have 5 chat tabs open. Please close one to create a new chat.</div>
      <button class="modal-btn" onclick="closeMaxTabsModal()">Got it</button>
    </div>
  </div>

	  <script>
	    // Resolved at extension-side from media/station-map.json (drop images + edit JSON).
	    const STATION_MAP = ${stationMapLiteral};
	    const vscode = acquireVsCodeApi();
	    let currentMode = 'mastermind';
	    // isGenerating is now per-chat in chatSessions[chatId].isGenerating
    let attachedImages = []; // Array of base64 image strings
    let currentContextPreview = '';
    let docTargets = [];
    let docTarget = '';

    function refreshDocTargets() {
      vscode.postMessage({ type: 'getDocTargets' });
    }

    function docTargetChanged(value) {
      docTarget = value || '';
      localStorage.setItem('spacecode.docTarget', docTarget);
      if (docTarget) {
        shipSetStatus('Doc target: ' + docTarget);
      } else {
        shipSetStatus('Doc target cleared.');
      }
      vscode.postMessage({ type: 'docTargetChanged', docTarget });
    }

    function populateDocTargets(list) {
      const select = document.getElementById('docTargetSelect');
      if (!select) return;
      const previous = select.value;
      select.innerHTML = '<option value="">Select a docs file...</option>';
      list.forEach((target) => {
        const opt = document.createElement('option');
        opt.value = target;
        opt.textContent = target;
        select.appendChild(opt);
      });
      if (previous && list.includes(previous)) {
        select.value = previous;
        docTarget = previous;
      } else {
        select.value = docTarget || '';
        docTarget = docTarget && list.includes(docTarget) ? docTarget : '';
        if (!docTarget) docTarget = '';
      }
    }

	    function setContextPreview(text) {
	      currentContextPreview = text || '';
	      const box = document.getElementById('contextPreviewBox');
	      if (box) box.textContent = currentContextPreview || '(no context)';
	    }

    function copyContextPreview() {
      const text = currentContextPreview || '';
      if (!text) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
        shipSetStatus('Context copied.');
      } else {
        shipSetStatus('Clipboard not available.');
      }
    }

    function renderJobList(jobs) {
      const list = document.getElementById('jobList');
      if (!list) return;
      list.innerHTML = '';
      if (!Array.isArray(jobs) || jobs.length === 0) {
        list.innerHTML = '<div style="color: var(--text-secondary); font-size:11px;">No pending approvals.</div>';
        return;
      }
      jobs.forEach(job => {
        const entry = document.createElement('div');
        entry.className = 'job-entry';
        entry.innerHTML = \`<strong>\${job.action}</strong>
          <div>Sector: \${job.sector}</div>
          <div>Doc: \${job.docTarget || '(none)'}</div>
          <div style="font-size:10px; color:var(--text-secondary);">status: \${job.status}</div>\`;
        const actions = document.createElement('div');
        actions.className = 'job-actions';
        if (job.status === 'pending') {
          const approve = document.createElement('button');
          approve.textContent = 'Approve';
          approve.className = 'btn-secondary';
          approve.onclick = () => vscode.postMessage({ type: 'autoexecuteApprove', jobId: job.id });
          const reject = document.createElement('button');
          reject.textContent = 'Reject';
          reject.className = 'btn-secondary';
          reject.onclick = () => vscode.postMessage({ type: 'autoexecuteReject', jobId: job.id });
          actions.appendChild(approve);
          actions.appendChild(reject);
        } else {
          const span = document.createElement('span');
          span.style.opacity = '0.7';
          span.textContent = job.status.toUpperCase();
          actions.appendChild(span);
        }
        entry.appendChild(actions);
        list.appendChild(entry);
      });
    }

    function requestJobList() {
      vscode.postMessage({ type: 'autoexecuteList' });
    }

	    // --- Ship UI (metaphor layer; always visible) ---
	    // Keep the exterior view clickable (7 big hotspots), and distribute detail items inside each.
	    // Yard/Lab is a workflow mode (prototype), not an exterior sector.
	    const SHIP_GROUPS = [
	      {
	        id: 'bridge',
	        name: 'Command Bridge',
	        items: [
	          { id: 'cockpit', name: 'Cockpit (SpaceCode UX)' },
	          { id: 'computer', name: 'Ship Computer (Coordinator)' },
	        ],
	      },
	      {
	        id: 'core',
	        name: 'Reactor Core',
	        items: [
	          { id: 'core_code', name: 'Core' },
	          { id: 'gameplay', name: 'Gameplay' },
	          { id: 'ai', name: 'AI' },
	        ],
	      },
	      {
	        id: 'vault',
	        name: 'Schema Vault',
	        items: [
	          { id: 'data', name: 'Data / Contracts' },
	        ],
	      },
	      {
	        id: 'docking',
	        name: 'Docking Ring',
	        items: [
	          { id: 'ui', name: 'UI' },
	          { id: 'input', name: 'Input' },
	          { id: 'network', name: 'Networking' },
	        ],
	      },
	      {
	        id: 'guard',
	        name: 'Guard Tower',
	        items: [
	          { id: 'tests', name: 'Tests' },
	          { id: 'build', name: 'Build / CI' },
	          { id: 'tools', name: 'Tools' },
	          { id: 'perf', name: 'Performance / Stability' },
	        ],
	      },
	      {
	        id: 'scanner',
	        name: 'Scanner Bay',
	        items: [
	          { id: 'sensors', name: 'Sensors (Unity Bridge)' },
	          { id: 'assets', name: 'Assets (Prefabs/Scenes)' },
	          { id: 'render', name: 'Rendering (URP/Shaders)' },
	          { id: 'audio', name: 'Audio / VFX' },
	        ],
	      },
	      {
	        id: 'comms',
	        name: 'Comm Array',
	        items: [
	          { id: 'docs', name: 'Docs' },
	        ],
	      },
	    ];

	    let shipSelectedSectorId = 'bridge';
	    let shipSelectedSubId = null;
	    let shipAutoexecute = false;

	    // --- Station navigation (scene graph) ---
	    let stationSceneId = (STATION_MAP && STATION_MAP.startScene) ? STATION_MAP.startScene : 'station';
	    let stationNavStack = [stationSceneId];

	    function stationGetScene(sceneId) {
	      const scenes = (STATION_MAP && STATION_MAP.scenes) ? STATION_MAP.scenes : {};
	      return scenes && scenes[sceneId] ? scenes[sceneId] : null;
	    }

	    function stationUpdateBreadcrumbs() {
	      const el = document.getElementById('stationBreadcrumbs');
	      if (!el) return;
	      el.innerHTML = '';

	      stationNavStack.forEach((id, idx) => {
	        const scene = stationGetScene(id);
	        const name = scene && scene.title ? scene.title : id;

	        const crumb = document.createElement('span');
	        crumb.className = 'crumb';
	        crumb.textContent = name;
	        crumb.onclick = () => {
	          // Jump back to a previous scene in the stack.
	          stationNavStack = stationNavStack.slice(0, idx + 1);
	          stationSceneId = id;
	          stationRenderScene();
	          shipRender();
	        };
	        el.appendChild(crumb);

	        if (idx < stationNavStack.length - 1) {
	          const sep = document.createElement('span');
	          sep.className = 'sep';
	          sep.textContent = '›';
	          el.appendChild(sep);
	        }
	      });

	      const backBtn = document.getElementById('stationBackBtn');
	      if (backBtn) backBtn.style.visibility = stationNavStack.length > 1 ? 'visible' : 'hidden';
	    }

	    function stationSetScene(sceneId, pushToStack) {
	      const scene = stationGetScene(sceneId);
	      if (!scene) {
	        shipSetStatus('Unknown scene: ' + sceneId);
	        return;
	      }

	      stationSceneId = sceneId;
	      if (pushToStack) {
	        const last = stationNavStack[stationNavStack.length - 1];
	        if (last !== sceneId) stationNavStack.push(sceneId);
	      }

	      // If this scene matches a top-level station sector, keep selection in sync.
	      const group = SHIP_GROUPS.find(g => g.id === sceneId);
	      if (group) {
	        if (shipSelectedSectorId !== sceneId) {
	          shipSelectedSectorId = sceneId;
	          shipSelectedSubId = null;
	        }
	      }

	      stationRenderScene();
	      shipRender();
	    }

	    function stationGoBack() {
	      if (stationNavStack.length <= 1) return;
	      stationNavStack.pop();
	      stationSceneId = stationNavStack[stationNavStack.length - 1];
	      stationRenderScene();
	      shipRender();
	    }

	    function stationEnsureViewport() {
  const canvas = document.getElementById('shipCanvas');
  if (!canvas) return null;
  let vp = document.getElementById('stationViewport');
  if (!vp) {
    vp = document.createElement('div');
    vp.id = 'stationViewport';
    vp.className = 'ship-viewport';
    canvas.appendChild(vp);
  }
  return vp;
}

function stationUpdateViewport() {
  const canvas = document.getElementById('shipCanvas');
  const img = document.getElementById('shipImage');
  const vp = stationEnsureViewport();
  if (!canvas || !img || !vp) return;
  const cw = canvas.clientWidth || 1;
  const ch = canvas.clientHeight || 1;
  const nw = img.naturalWidth || cw;
  const nh = img.naturalHeight || ch;
  const scale = Math.min(cw / nw, ch / nh);
  const vw = Math.max(1, Math.round(nw * scale));
  const vh = Math.max(1, Math.round(nh * scale));
  const ox = Math.round((cw - vw) / 2);
  const oy = Math.round((ch - vh) / 2);
  vp.style.left = ox + 'px';
  vp.style.top = oy + 'px';
  vp.style.width = vw + 'px';
  vp.style.height = vh + 'px';
}

function stationRenderScene() {
      const canvas = document.getElementById('shipCanvas');
      const img = document.getElementById('shipImage');
      const vp = stationEnsureViewport();
      if (!canvas || !img || !vp) return;

      // Remove old hotspots (both div-based and SVG) from viewport
      vp.querySelectorAll('.ship-hotspot, .ship-hotspot-svg').forEach(n => n.remove());

      const scene = stationGetScene(stationSceneId);
      if (scene && scene.imageUrl) {
        // Reset fallback chain for this new image.
        img.dataset.fallback = '';
        img.src = scene.imageUrl;
      }

      // Align the viewport to the visible (letterboxed) image area.
      stationUpdateViewport();

      const hotspots = (scene && Array.isArray(scene.hotspots)) ? scene.hotspots : [];
      const hasPolygons = hotspots.some(h => Array.isArray(h.points) && h.points.length >= 3);

      if (hasPolygons) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'ship-hotspot-svg');
        svg.setAttribute('viewBox', '0 0 2752 1536');
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';

        hotspots.forEach((h) => {
          if (Array.isArray(h.points) && h.points.length >= 3) {
            const pointsStr = h.points.map(p => p.x + ',' + p.y).join(' ');
            const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            poly.setAttribute('points', pointsStr);
            poly.setAttribute('fill', h.id === shipSelectedSectorId ? 'rgba(0,200,255,0.25)' : 'rgba(0,150,255,0.08)');
            poly.setAttribute('stroke', 'rgba(0,200,255,0.6)');
            poly.setAttribute('stroke-width', '2');
            poly.style.cssText = 'pointer-events:auto;cursor:pointer;transition:fill 0.2s,stroke 0.2s;';
            poly.setAttribute('data-id', h.id || '');

            // Calculate centroid for label positioning
            const cx = h.points.reduce((sum, p) => sum + p.x, 0) / h.points.length;
            const cy = h.points.reduce((sum, p) => sum + p.y, 0) / h.points.length;

            // Create floating label group
            const labelGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            labelGroup.setAttribute('class', 'hotspot-label');
            labelGroup.setAttribute('data-for', h.id || '');
            labelGroup.style.cssText = 'pointer-events:none;opacity:0;transition:opacity 0.2s;';

            // Label background
            const labelBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            labelBg.setAttribute('rx', '8');
            labelBg.setAttribute('ry', '8');
            labelBg.setAttribute('fill', 'rgba(0,20,40,0.85)');
            labelBg.setAttribute('stroke', 'rgba(0,200,255,0.8)');
            labelBg.setAttribute('stroke-width', '1.5');

            // Label text
            const labelText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            labelText.setAttribute('x', String(cx));
            labelText.setAttribute('y', String(cy));
            labelText.setAttribute('text-anchor', 'middle');
            labelText.setAttribute('dominant-baseline', 'middle');
            labelText.setAttribute('fill', '#00d4ff');
            labelText.setAttribute('font-family', 'Orbitron, Exo, Rajdhani, sans-serif');
            labelText.setAttribute('font-size', '42');
            labelText.setAttribute('font-weight', '600');
            labelText.setAttribute('letter-spacing', '2');
            labelText.textContent = (h.label || h.id || '').toUpperCase();

            // Indicator line from centroid pointing down
            const indicator = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            indicator.setAttribute('x1', String(cx));
            indicator.setAttribute('y1', String(cy + 30));
            indicator.setAttribute('x2', String(cx));
            indicator.setAttribute('y2', String(cy + 60));
            indicator.setAttribute('stroke', 'rgba(0,200,255,0.8)');
            indicator.setAttribute('stroke-width', '2');

            // Indicator dot
            const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            dot.setAttribute('cx', String(cx));
            dot.setAttribute('cy', String(cy + 65));
            dot.setAttribute('r', '6');
            dot.setAttribute('fill', '#00d4ff');

            labelGroup.appendChild(labelBg);
            labelGroup.appendChild(indicator);
            labelGroup.appendChild(dot);
            labelGroup.appendChild(labelText);

            // Size the background based on text (approximate)
            const textLen = (h.label || h.id || '').length * 26 + 40;
            labelBg.setAttribute('x', String(cx - textLen/2));
            labelBg.setAttribute('y', String(cy - 28));
            labelBg.setAttribute('width', String(textLen));
            labelBg.setAttribute('height', '56');

            poly.addEventListener('mouseenter', () => {
              poly.setAttribute('fill', 'rgba(0,220,255,0.35)');
              poly.setAttribute('stroke', 'rgba(0,255,255,0.95)');
              poly.setAttribute('stroke-width', '3');
              labelGroup.style.opacity = '1';
            });
            poly.addEventListener('mouseleave', () => {
              const selected = h.id === shipSelectedSectorId;
              poly.setAttribute('fill', selected ? 'rgba(0,200,255,0.25)' : 'rgba(0,150,255,0.08)');
              poly.setAttribute('stroke', 'rgba(0,200,255,0.6)');
              poly.setAttribute('stroke-width', '2');
              labelGroup.style.opacity = '0';
            });

            poly.addEventListener('click', () => {
              if (h.targetScene) {
                stationSetScene(h.targetScene, true);
              } else if (h.action) {
                vscode.postMessage({ type: 'stationAction', action: h.action, sceneId: stationSceneId });
              }
            });

            svg.appendChild(poly);
            svg.appendChild(labelGroup);
          }
        });

        vp.appendChild(svg);
      } else {
        hotspots.forEach((h) => {
          const hs = document.createElement('div');
          hs.className = 'ship-hotspot' + (h.id === shipSelectedSectorId ? ' selected' : '');
          hs.style.left = String(h.x) + '%';
          hs.style.top = String(h.y) + '%';
          hs.style.width = String(h.w) + '%';
          hs.style.height = String(h.h) + '%';
          hs.title = h.title || h.id;

          if (h.targetScene) {
            hs.onclick = () => stationSetScene(h.targetScene, true);
          } else if (h.action) {
            hs.onclick = () => vscode.postMessage({ type: 'stationAction', action: h.action, sceneId: stationSceneId });
          } else {
            hs.onclick = () => {};
          }

          vp.appendChild(hs);
        });
      }

      stationUpdateBreadcrumbs();
    }

	    function shipGetProfile() {
	      const sel = document.getElementById('shipProfileSelect');
	      return sel ? sel.value : 'yard';
	    }

	    function shipSetStatus(text) {
	      const el = document.getElementById('shipStatusText');
	      if (el) el.textContent = text;
	    }

	    function shipRender() {
	      const list = document.getElementById('shipSectorList');
	      if (!list) return;

	      // Clear existing
	      list.innerHTML = '';

	      // Render grouped list (7 sectors, with detail items underneath)
	      SHIP_GROUPS.forEach((g) => {
	        const header = document.createElement('div');
	        header.className = 'sector-item' + (g.id === shipSelectedSectorId && !shipSelectedSubId ? ' selected' : '');
	        header.textContent = g.name;
	        header.onclick = () => shipSelectSector(g.id, null);
	        list.appendChild(header);

	        g.items.forEach((it) => {
	          const row = document.createElement('div');
	          const selected = (g.id === shipSelectedSectorId) && (shipSelectedSubId === it.id);
	          row.className = 'sector-item sub' + (selected ? ' selected' : '');
	          row.textContent = '  - ' + it.name;
	          row.onclick = () => shipSelectSector(g.id, it.id);
	          list.appendChild(row);
	        });
	      });

	      shipUpdateChips();
	    }

	    function shipUpdateChips() {
	      const chip = document.getElementById('shipSelectedSectorChip');
	      const group = SHIP_GROUPS.find(g => g.id === shipSelectedSectorId);
	      let text = group ? group.name : shipSelectedSectorId;
	      if (group && shipSelectedSubId) {
	        const it = group.items.find(i => i.id === shipSelectedSubId);
	        if (it) text = text + ' / ' + it.name;
	      }
	      if (chip) chip.textContent = 'Sector: ' + text;

	      const autoBtn = document.getElementById('shipAutoBtn');
	      if (autoBtn) autoBtn.textContent = 'Autoexecute: ' + (shipAutoexecute ? 'On' : 'Off');
	    }

		    function shipSelectSector(sectorId, subId) {
		      shipSelectedSectorId = sectorId;
		      shipSelectedSubId = subId || null;
		      const group = SHIP_GROUPS.find(g => g.id === shipSelectedSectorId);
		      const name = group ? group.name : shipSelectedSectorId;
		      shipSetStatus('Selected: ' + name + '. Context Packs and Gates will be sector-aware.');
		      vscode.postMessage({ type: 'shipSelectSector', sectorId, subId: shipSelectedSubId, profile: shipGetProfile() });
		      // Clicking a sector navigates the station view. Sub-items don't push to the stack.
		      stationSetScene(sectorId, shipSelectedSubId ? false : true);
		    }

	    function shipRequestContextPack() {
	      vscode.postMessage({ type: 'shipGetContextPack', sectorId: shipSelectedSectorId, subId: shipSelectedSubId, profile: shipGetProfile() });
	      shipSetStatus('Requesting Context Pack...');
	    }

	    function openHotspotTool() {
	      vscode.postMessage({ type: 'openHotspotTool', sceneId: stationSceneId });
	    }

	    function shipRunGates() {
	      vscode.postMessage({ type: 'shipRunGates', sectorId: shipSelectedSectorId, subId: shipSelectedSubId, profile: shipGetProfile() });
	      shipSetStatus('Running gates...');
	    }

	    function shipDocsStatus() {
	      vscode.postMessage({ type: 'shipDocsStatus', sectorId: shipSelectedSectorId, subId: shipSelectedSubId, profile: shipGetProfile() });
	      shipSetStatus('Checking docs status...');
	    }

	    function shipToggleAutoexecute() {
	      shipAutoexecute = !shipAutoexecute;
	      shipUpdateChips();
	      vscode.postMessage({ type: 'shipToggleAutoexecute' });
	    }

	    // Profile dropdown should update backend state.
	    setTimeout(() => {
	      // Context injection toggle (persisted in localStorage)
	      const injectToggle = document.getElementById('injectContextToggle');
	      if (injectToggle) {
	        const key = 'spacecode.injectContext';
	        const saved = localStorage.getItem(key);
	        if (saved === '0') injectToggle.checked = false;
	        injectToggle.addEventListener('change', () => {
	          localStorage.setItem(key, injectToggle.checked ? '1' : '0');
	        });
	      }
	      // Request initial context preview from extension
	      vscode.postMessage({ type: 'getContextPreview' });

	      const sel = document.getElementById('shipProfileSelect');
	      if (sel) {
	        sel.addEventListener('change', () => {
	          vscode.postMessage({ type: 'shipSetProfile', profile: shipGetProfile() });
	          // NOTE: This file is a big TS template literal; avoid nested JS template strings (backticks).
	          shipSetStatus('Profile set to ' + shipGetProfile() + '.');
	        });
	      }
	      stationRenderScene();
	      shipRender();

	      // Update viewport when image loads (natural dimensions needed for letterbox calc)
	      const shipImg = document.getElementById('shipImage');
	      if (shipImg) {
	        shipImg.addEventListener('load', () => {
	          stationUpdateViewport();
	        });
	      }

      // Update viewport on container resize (splitter drag, window resize)
      const shipCanvas = document.getElementById('shipCanvas');
      if (shipCanvas && typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => {
          stationUpdateViewport();
        });
        ro.observe(shipCanvas);
      }

      const docSelect = document.getElementById('docTargetSelect');
      const savedDoc = localStorage.getItem('spacecode.docTarget') || '';
      if (docSelect) {
        if (savedDoc) {
          docTarget = savedDoc;
          docSelect.value = savedDoc;
        }
        docSelect.addEventListener('change', () => {
          docTargetChanged(docSelect.value);
        });
      } else if (savedDoc) {
        docTarget = savedDoc;
      }

      refreshDocTargets();
    }, 0);

	    // Draggable splitter between chat and station panes.
	    (function initMainSplitter() {
	      const splitter = document.getElementById('mainSplitter');
	      const mainSplit = document.querySelector('.main-split');
	      const rightPane = document.querySelector('.right-pane');
	      if (!splitter || !mainSplit || !rightPane) return;

	      const STORAGE_KEY = 'spacecode.stationPaneWidthPx';
	      const saved = localStorage.getItem(STORAGE_KEY);
	      if (saved && !Number.isNaN(parseInt(saved, 10))) {
	        rightPane.style.flex = '0 0 ' + parseInt(saved, 10) + 'px';
	      }

	      let dragging = false;

	      splitter.addEventListener('mousedown', (e) => {
	        dragging = true;
	        document.body.classList.add('resizing');
	        e.preventDefault();
	      });

	      window.addEventListener('mousemove', (e) => {
	        if (!dragging) return;
	        const rect = mainSplit.getBoundingClientRect();
	        const width = rect.right - e.clientX; // station pane width
	        const clamped = Math.max(320, Math.min(900, width));
	        rightPane.style.flex = '0 0 ' + clamped + 'px';
	      });

	      window.addEventListener('mouseup', () => {
	        if (!dragging) return;
	        dragging = false;
	        document.body.classList.remove('resizing');
	        const current = parseInt(getComputedStyle(rightPane).width || '420', 10);
	        if (!Number.isNaN(current)) localStorage.setItem(STORAGE_KEY, String(current));
	      });
	    })();

	    // Generate UUID for session persistence
	    function generateUUID() {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
      }
      // Fallback UUID generator
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }

    // Modal functions
    function showMaxTabsModal() {
      document.getElementById('maxTabsModal').classList.add('visible');
    }
    function closeMaxTabsModal() {
      document.getElementById('maxTabsModal').classList.remove('visible');
    }

    // Multi-chat session management with Claude session IDs
    const MAX_CHAT_TABS = 5;
    let chatCounter = 1; // For naming only

    // Generate unique chat ID using UUID to avoid conflicts
    function generateChatId() {
      return 'chat-' + generateUUID().slice(0, 8);
    }

    const initialChatId = generateChatId();
    // Model-specific context windows
    const CONTEXT_LIMITS = {
      claude: 200000,    // Claude 4.5: 200K
      gpt: 272000,       // GPT-5: 272K input context
      mastermind: 200000 // MasterMind uses Claude, so 200K
    };

    function getContextLimit(mode) {
      return CONTEXT_LIMITS[mode] || 200000;
    }

    let chatSessions = {
      [initialChatId]: {
        id: initialChatId,
        mode: 'mastermind',
        name: 'MasterMind',
        messagesHtml: '',
        messageHistory: [],
        claudeSessionId: generateUUID(), // UUID for Claude CLI session persistence
        isGenerating: false, // Per-chat generating state
        tokensUsed: 0 // Track token consumption for this chat
      }
    };
    let currentChatId = initialChatId;

    function newChat() {
      // Check if max tabs reached
      if (Object.keys(chatSessions).length >= MAX_CHAT_TABS) {
        showMaxTabsModal();
        return;
      }

      const id = generateChatId();
      const modeName = currentMode.charAt(0).toUpperCase() + currentMode.slice(1);

      chatSessions[id] = {
        id: id,
        mode: currentMode,
        name: modeName,
        messagesHtml: '',
        messageHistory: [],
        claudeSessionId: generateUUID(), // New unique session ID for Claude
        isGenerating: false, // Per-chat generating state
        tokensUsed: 0 // Track token consumption for this chat
      };
      renderChatTabs();
      switchChat(id);
      saveChatState();
    }

    function getClaudeSessionId() {
      return chatSessions[currentChatId]?.claudeSessionId || '';
    }

    function switchChat(chatId) {
      // DEBUG: Log tab switch
      console.log('SWITCH chat:', { from: currentChatId, to: chatId });

      // Save current chat messages (HTML and history)
      const currentMessagesHtml = document.getElementById('chatMessages').innerHTML;
      if (chatSessions[currentChatId]) {
        chatSessions[currentChatId].messagesHtml = currentMessagesHtml;
      }

      // Switch to new chat
      currentChatId = chatId;
      const session = chatSessions[chatId];
      if (session) {
        currentMode = session.mode;
        // Update mode selector
        document.querySelectorAll('.mode-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.mode === currentMode);
        });
        // Restore messages HTML
        const container = document.getElementById('chatMessages');
        container.innerHTML = session.messagesHtml || getEmptyStateHtml();
        // Scroll to bottom to show latest messages
        container.scrollTop = container.scrollHeight;

        // Sync generating state UI with this chat's state
        const generating = session.isGenerating || false;
        document.getElementById('sendBtn').disabled = generating;
        document.getElementById('sendBtn').style.display = generating ? 'none' : 'block';
        document.getElementById('stopBtn').style.display = generating ? 'block' : 'none';
        document.getElementById('statusDot').classList.toggle('thinking', generating);
        document.getElementById('statusText').textContent = generating ? 'Generating...' : 'Ready';

        // Update token bar for this chat
        updateTokenBar(currentChatId);
      }
      renderChatTabs();
      updateTokenBar(currentChatId);
    }

    function addToMessageHistory(role, content, chatId = currentChatId) {
      console.log('[MC DEBUG] addToMessageHistory:', role, 'chatId:', chatId, 'content:', content.substring(0, 50));
      if (chatSessions[chatId]) {
        chatSessions[chatId].messageHistory.push({ role, content });
        console.log('[MC DEBUG] History now has', chatSessions[chatId].messageHistory.length, 'messages');
        updateTokenBar(chatId);
        // Save state after each message for persistence
        saveChatState();
      } else {
        console.log('[MC DEBUG] WARNING: chatSessions[chatId] is undefined!', chatId);
      }
    }

    function getMessageHistory() {
      return chatSessions[currentChatId]?.messageHistory || [];
    }

    function closeChat(chatId) {
      if (Object.keys(chatSessions).length <= 1) {
        return; // Don't close the last chat
      }
      delete chatSessions[chatId];
      // If closing current chat, switch to another
      if (chatId === currentChatId) {
        const remainingIds = Object.keys(chatSessions);
        switchChat(remainingIds[0]);
      }
      renderChatTabs();
      saveChatState();
    }

    function renderChatTabs() {
      const container = document.getElementById('chatTabs');
      // DEBUG: Show short chatId in tab name to verify unique IDs
      const tabs = Object.values(chatSessions).map(session => \`
        <div class="chat-tab \${session.id === currentChatId ? 'active' : ''} \${session.mode} \${session.isGenerating ? 'generating' : ''}"
             data-chat-id="\${session.id}"
             onclick="switchChat('\${session.id}')">
          <div class="chat-tab-icon \${session.mode}">\${session.isGenerating ? '<span class="tab-spinner"></span>' : ''}</div>
          <span>\${session.name} [\${session.id.slice(-4)}]</span>
          <span class="chat-tab-close" onclick="event.stopPropagation(); closeChat('\${session.id}')">×</span>
        </div>
      \`).join('');
      container.innerHTML = tabs + '<button class="chat-tab-new" onclick="newChat()">+</button>';
    }

    // Save chat state to extension for persistence across restarts
    function saveChatState() {
      // Save current chat's HTML before serializing
      const currentMessagesHtml = document.getElementById('chatMessages').innerHTML;
      if (chatSessions[currentChatId]) {
        chatSessions[currentChatId].messagesHtml = currentMessagesHtml;
      }

      const state = {
        tabs: Object.values(chatSessions).map(session => ({
          id: session.id,
          name: session.name,
          mode: session.mode,
          claudeSessionId: session.claudeSessionId,
          messagesHtml: session.messagesHtml,
          messageHistory: session.messageHistory
        })),
        activeTabId: currentChatId,
        chatCounter: chatCounter
      };
      vscode.postMessage({ type: 'saveChatState', state });
    }

    // Restore chat state from extension
    function restoreChatState(state) {
      if (!state || !state.tabs || state.tabs.length === 0) return;

      // Clear existing sessions
      chatSessions = {};

      // Restore tabs - generate NEW claudeSessionIds to avoid "already in use" errors
      state.tabs.forEach(tab => {
        // Generate new unique ID if the old one looks like a simple number
        const chatId = (tab.id && tab.id.startsWith('chat-')) ? tab.id : generateChatId();

        chatSessions[chatId] = {
          id: chatId,
          name: tab.name,
          mode: tab.mode,
          // ALWAYS generate new Claude session ID on restore to avoid conflicts
          claudeSessionId: generateUUID(),
          messagesHtml: tab.messagesHtml || '',
          messageHistory: tab.messageHistory || [],
          isGenerating: false // Reset generating state on restore
        };
      });

      // Restore chat counter
      if (state.chatCounter) {
        chatCounter = state.chatCounter;
      } else {
        chatCounter = Object.keys(chatSessions).length;
      }

      // Switch to active tab (find by original ID or use first)
      const tabIds = Object.keys(chatSessions);
      currentChatId = tabIds.find(id => id === state.activeTabId) || tabIds[0];

      const session = chatSessions[currentChatId];
      if (session) {
        currentMode = session.mode;
        document.querySelectorAll('.mode-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.mode === currentMode);
        });
        document.getElementById('chatMessages').innerHTML = session.messagesHtml || getEmptyStateHtml();
      }

      renderChatTabs();
    }

    function getEmptyStateHtml() {
      return \`
        <div class="empty-state" id="emptyState">
          <h2>Welcome to SpaceCode</h2>
          <p>Your AI coding companion with MasterMind mode</p>
          <div class="quick-actions">
            <button class="quick-action" onclick="insertPrompt('Review my code')">Review Code</button>
            <button class="quick-action" onclick="insertPrompt('Explain this function')">Explain Code</button>
            <button class="quick-action" onclick="insertPrompt('Help me debug')">Debug</button>
            <button class="quick-action" onclick="insertPrompt('Write tests for')">Write Tests</button>
          </div>
        </div>
      \`;
    }

    // Mode selector - switch to existing chat of that mode or create new one
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const clickedMode = btn.dataset.mode;

        // Handle Agents mode separately
        if (clickedMode === 'agents') {
          showAgentsPanel();
          return;
        }

        // If we're in agents mode, go back to chat
        if (document.getElementById('agentsSection').style.display !== 'none') {
          hideAgentsPanel();
        }

        // If clicking the already-selected mode, create a new chat in that mode
        if (currentMode === clickedMode) {
          newChat();
          return;
        }

        // Switch mode
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentMode = clickedMode;

        // Find an existing chat in this mode
        const existingChat = Object.values(chatSessions).find(s => s.mode === clickedMode);

        if (existingChat) {
          // Switch to existing chat of this mode
          switchChat(existingChat.id);
        } else {
          // No chat exists for this mode - create one (respecting max limit)
          if (Object.keys(chatSessions).length >= MAX_CHAT_TABS) {
            showMaxTabsModal();
            // Revert mode selection
            currentMode = chatSessions[currentChatId].mode;
            document.querySelectorAll('.mode-btn').forEach(b => {
              b.classList.toggle('active', b.dataset.mode === currentMode);
            });
            return;
          }
          // Create new chat in this mode
          const id = generateChatId();
          const modeName = currentMode.charAt(0).toUpperCase() + currentMode.slice(1);
          chatSessions[id] = {
            id: id,
            mode: currentMode,
            name: modeName,
            messagesHtml: '',
            messageHistory: [],
            claudeSessionId: generateUUID(),
            isGenerating: false
          };
          renderChatTabs();
          switchChat(id);
          saveChatState();
        }

        vscode.postMessage({ type: 'setMode', mode: currentMode });
        updateMastermindConfigVisibility();
      });
    });

    // Initialize MasterMind config visibility
    updateMastermindConfigVisibility();

    // Logs dropdown function
    function toggleLogsDropdown() {
      const dropdown = document.getElementById('logsDropdown');
      dropdown.classList.toggle('visible');
    }

    // MasterMind config panel functions
    function toggleMastermindConfig() {
      const body = document.getElementById('mastermindBody');
      const toggle = document.getElementById('mastermindToggle');
      body.classList.toggle('collapsed');
      toggle.classList.toggle('collapsed');
    }

    function updateMastermindModeDescription() {
      const mode = document.getElementById('mastermindModeSelect').value;
      const desc = document.getElementById('mastermindModeDesc');
      const topicInput = document.getElementById('mastermindTopic');

      const descriptions = {
        'collaborate': 'Claude and GPT work together to solve a problem, building on each other\\'s ideas.',
        'code-review': 'Claude and GPT will independently review code, then discuss each other\\'s feedback.',
        'debate': 'Claude argues FOR, GPT argues AGAINST the topic. They\\'ll exchange rebuttals.'
      };

      const placeholders = {
        'collaborate': 'Enter the problem or task for the AIs to collaborate on...',
        'code-review': 'Paste the code you want reviewed, or describe what to analyze...',
        'debate': 'Enter the statement to debate (e.g., "React is better than Vue")'
      };

      desc.textContent = descriptions[mode] || descriptions['collaborate'];
      topicInput.placeholder = placeholders[mode] || placeholders['collaborate'];
    }

    function updateMastermindConfigVisibility() {
      const config = document.getElementById('mastermindConfig');
      if (currentMode === 'mastermind') {
        config.classList.add('visible');
      } else {
        config.classList.remove('visible');
      }
    }

    function startMastermindConversation() {
      const mode = document.getElementById('mastermindModeSelect').value;
      const topic = document.getElementById('mastermindTopic').value.trim();
      const maxTurns = parseInt(document.getElementById('mastermindMaxTurns').value) || 5;
      const responseStyle = document.getElementById('mastermindStyle').value;
      const autoSummarize = document.getElementById('mastermindAutoSummarize').checked;

      if (!topic) {
        // If no topic, prompt user
        document.getElementById('mastermindTopic').focus();
        document.getElementById('mastermindTopic').style.borderColor = '#f97316';
        setTimeout(() => {
          document.getElementById('mastermindTopic').style.borderColor = '';
        }, 2000);
        return;
      }

      // Get selected code if checkbox is checked
      let initialContext = topic;
      const includeSelection = document.getElementById('includeSelection')?.checked;
      if (includeSelection) {
        vscode.postMessage({
          type: 'startMastermind',
          config: { mode, topic, maxTurns, responseStyle, autoSummarize, includeSelection: true }
        });
      } else {
        vscode.postMessage({
          type: 'startMastermind',
          config: { mode, topic, maxTurns, responseStyle, autoSummarize, initialContext }
        });
      }

      // Clear the topic input after starting
      document.getElementById('mastermindTopic').value = '';

      // Collapse the config panel
      document.getElementById('mastermindBody').classList.add('collapsed');
      document.getElementById('mastermindToggle').classList.add('collapsed');
    }

    // Model toolbar functions - explicitly assign to window for onclick access
    let selectedChatMode = 'chat';
    let selectedModel = { provider: 'claude', model: 'claude-sonnet-4' };
    let selectedReasoning = 'medium';

    window.toggleToolbarDropdown = function(dropdownId) {
      const dropdown = document.getElementById(dropdownId);
      const allDropdowns = document.querySelectorAll('.toolbar-dropdown');
      allDropdowns.forEach(d => {
        if (d.id !== dropdownId) d.classList.remove('visible');
      });
      dropdown.classList.toggle('visible');
    };

    window.selectChatMode = function(mode) {
      selectedChatMode = mode;
      const labels = { 'chat': 'Chat', 'agent': 'Agent', 'agent-full': 'Agent (full)' };
      const icons = { 'chat': '💬', 'agent': '🤖', 'agent-full': '⚡' };

      document.getElementById('selectedModeLabel').textContent = labels[mode];
      document.querySelector('.toolbar-item:first-child .toolbar-icon').textContent = icons[mode];

      ['chat', 'agent', 'agent-full'].forEach(m => {
        document.getElementById('modeCheck-' + m).textContent = m === mode ? '✓' : '';
      });

      document.getElementById('modeDropdown').classList.remove('visible');
      vscode.postMessage({ type: 'setChatMode', mode: selectedChatMode });
    };

    window.selectModel = function(provider, model) {
      selectedModel = { provider, model };

      const modelLabels = {
        'claude-sonnet-4': 'Claude Sonnet 4',
        'claude-opus-4': 'Claude Opus 4',
        'claude-haiku': 'Claude Haiku',
        'gpt-5.2-codex': 'GPT-5.2-Codex',
        'gpt-5.2': 'GPT-5.2',
        'gpt-5.1-codex-max': 'GPT-5.1-Codex-Max',
        'gpt-5.1-codex-mini': 'GPT-5.1-Codex-Mini'
      };

      document.getElementById('selectedModelLabel').textContent = modelLabels[model] || model;

      document.querySelectorAll('[id^="modelCheck-"]').forEach(el => el.textContent = '');
      const checkEl = document.getElementById('modelCheck-' + model);
      if (checkEl) checkEl.textContent = '✓';

      document.getElementById('modelDropdown').classList.remove('visible');
      vscode.postMessage({ type: 'setModel', provider, model });
    };

    window.selectReasoning = function(level) {
      selectedReasoning = level;
      document.getElementById('selectedReasoningLabel').textContent = level.charAt(0).toUpperCase() + level.slice(1);

      ['medium', 'high'].forEach(l => {
        document.getElementById('reasoningCheck-' + l).textContent = l === level ? '✓' : '';
      });

      document.getElementById('reasoningDropdown').classList.remove('visible');
      vscode.postMessage({ type: 'setReasoning', level: selectedReasoning });
    };

    function updateModelToolbarForMode() {
      const claudeSection = document.getElementById('claudeModelsSection');
      const gptSection = document.getElementById('gptModelsSection');

      if (currentMode === 'claude') {
        claudeSection.style.display = 'block';
        gptSection.style.display = 'none';
        if (selectedModel.provider !== 'claude') {
          window.selectModel('claude', 'claude-sonnet-4');
        }
      } else if (currentMode === 'gpt') {
        claudeSection.style.display = 'none';
        gptSection.style.display = 'block';
        if (selectedModel.provider !== 'gpt') {
          window.selectModel('gpt', 'gpt-5.1-codex-mini');
        }
      } else {
        claudeSection.style.display = 'block';
        gptSection.style.display = 'block';
      }
    }

    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
      const logsDropdown = document.getElementById('logsDropdown');
      const containers = document.querySelectorAll('.settings-dropdown-container');
      let clickedInside = false;
      containers.forEach(c => { if (c.contains(e.target)) clickedInside = true; });
      if (!clickedInside) {
        logsDropdown?.classList.remove('visible');
      }

      // Close toolbar dropdowns
      const toolbarItems = document.querySelectorAll('.toolbar-item');
      let clickedInToolbar = false;
      toolbarItems.forEach(item => { if (item.contains(e.target)) clickedInToolbar = true; });
      if (!clickedInToolbar) {
        document.querySelectorAll('.toolbar-dropdown').forEach(d => d.classList.remove('visible'));
      }
    });

    const panelTitles = {
      'mcp': 'MCP Servers',
      'kb': 'Knowledge Base',
      'costs': 'Costs',
      'voice': 'Voice',
      'logs': 'Logs',
      'settings': 'Settings'
    };

    function showSettingsPanel(panelName) {
      // Show overlay
      const overlay = document.getElementById('settingsPanelOverlay');
      overlay.classList.add('visible');

      // Switch to the requested tab
      switchSettingsTab(panelName);
    }

    function switchSettingsTab(panelName) {
      // Update active tab
      document.querySelectorAll('.settings-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.panel === panelName) {
          tab.classList.add('active');
        }
      });

      // Hide all panels, show selected
      document.querySelectorAll('.settings-panel-content').forEach(p => p.style.display = 'none');
      const panel = document.getElementById(\`panel-\${panelName}\`);
      if (panel) panel.style.display = 'block';

      // Load panel data
      if (panelName === 'mcp') vscode.postMessage({ type: 'getMcpServers' });
      if (panelName === 'kb') vscode.postMessage({ type: 'getKbEntries' });
      if (panelName === 'costs') vscode.postMessage({ type: 'getCosts' });
      if (panelName === 'voice') vscode.postMessage({ type: 'getVoiceSettings' });
      if (panelName === 'settings') {
        vscode.postMessage({ type: 'getSettings' });
        vscode.postMessage({ type: 'getCliStatus' });
      }
    }

    function closeSettingsPanel() {
      document.getElementById('settingsPanelOverlay').classList.remove('visible');
    }

    // Voice panel functions
    function loadVoiceSettings(settings) {
      if (!settings) return;
      const modelSelect = document.getElementById('whisperModelSelect');
      if (modelSelect && settings.whisperModel) modelSelect.value = settings.whisperModel;

      if (settings.whisperInstalled) {
        const el = document.getElementById('whisperStatus');
        const ind = document.getElementById('whisperStatusIndicator');
        const btn = document.getElementById('whisperDownloadBtn');
        if (el) el.textContent = 'Installed';
        if (ind) ind.style.background = '#4ade80';
        if (btn) { btn.textContent = '✓ Installed'; btn.disabled = true; }
      }
      if (settings.whisperBinaryInstalled) {
        const el = document.getElementById('whisperBinaryStatus');
        const ind = document.getElementById('whisperBinaryStatusIndicator');
        const btn = document.getElementById('whisperBinaryDownloadBtn');
        if (el) el.textContent = 'Installed';
        if (ind) ind.style.background = '#4ade80';
        if (btn) { btn.textContent = '✓ Installed'; btn.disabled = true; }
      }
    }

    function downloadWhisperModel() {
      const modelSelect = document.getElementById('whisperModelSelect');
      vscode.postMessage({ type: 'downloadVoiceModel', engine: 'whisper', model: modelSelect ? modelSelect.value : 'small' });
      const btn = document.getElementById('whisperDownloadBtn');
      if (btn) { btn.disabled = true; btn.textContent = 'Downloading...'; }
    }

    function downloadWhisperBinary() {
      vscode.postMessage({ type: 'downloadWhisperBinary' });
      const btn = document.getElementById('whisperBinaryDownloadBtn');
      if (btn) { btn.disabled = true; btn.textContent = 'Downloading...'; }
    }

    function saveVoiceSettings() {
      const modelSelect = document.getElementById('whisperModelSelect');
      vscode.postMessage({ type: 'saveVoiceSettings', settings: { whisperModel: modelSelect ? modelSelect.value : 'small' } });
    }

    function testMicrophone() {
      vscode.postMessage({ type: 'startMicTest' });
      const result = document.getElementById('voiceTestResult');
      if (result) { result.style.display = 'block'; result.textContent = 'Testing microphone...'; }
    }

    function testSpeaker() {
      vscode.postMessage({ type: 'testSpeaker' });
      const result = document.getElementById('voiceTestResult');
      if (result) { result.style.display = 'block'; result.textContent = 'Playing test sound...'; }
    }

    // Legacy showTab function for backwards compatibility
    function showTab(tabName) {
      showSettingsPanel(tabName);
    }

    function sendMessage() {
      const input = document.getElementById('messageInput');
      const text = input.value.trim();
      // Check per-chat generating state
      if (!text || chatSessions[currentChatId]?.isGenerating) return;

      const includeSelection = document.getElementById('includeSelection')?.checked || false;
      const injectContext = document.getElementById('injectContextToggle')?.checked ?? true;
      const docSelect = document.getElementById('docTargetSelect');
      const docTargetValue = docSelect ? docSelect.value : '';
      const profileSelect = document.getElementById('shipProfileSelect');
      const profileValue = profileSelect ? profileSelect.value : 'yard';
      if (profileValue !== 'yard' && !docTargetValue) {
        shipSetStatus('Select a docs file before sending when not in Yard mode.');
        return;
      }

      // Show user message with image count if any
      const displayText = attachedImages.length > 0
        ? text + ' [' + attachedImages.length + ' image(s) attached]'
        : text;
      addMessage('user', displayText);
      document.getElementById('emptyState').style.display = 'none';

      // Get history BEFORE adding current message (askSingle will add it)
      const historyToSend = getMessageHistory();

      // DEBUG: Log history being sent
      console.log('[MC DEBUG] Sending message, history length:', historyToSend.length);
      console.log('[MC DEBUG] History:', JSON.stringify(historyToSend, null, 2));

      // Now add to message history for future context
      addToMessageHistory('user', text);

      // Store chatId at send time so responses route to correct chat
      const sendChatId = currentChatId;

      vscode.postMessage({
        type: 'sendMessage',
        text,
        mode: currentMode,
        includeSelection,
        injectContext,
        docTarget: docTargetValue,
        images: attachedImages.slice(), // Copy of attached images
        history: historyToSend, // History WITHOUT current message (askSingle adds it)
        claudeSessionId: getClaudeSessionId(), // Session ID for Claude persistence
        chatId: sendChatId // Track which chat this message belongs to
      });

      input.value = '';
      autoResize(input);
      clearAttachedImages();
      setGenerating(true);
    }

    // Image handling functions
    function toggleDropZone() {
      const dropZone = document.getElementById('dropZone');
      dropZone.classList.toggle('visible');
    }

    function handleDragOver(e) {
      e.preventDefault();
      e.stopPropagation();
      document.getElementById('dropZone').classList.add('drag-over');
    }

    function handleDragLeave(e) {
      e.preventDefault();
      e.stopPropagation();
      document.getElementById('dropZone').classList.remove('drag-over');
    }

    function handleDrop(e) {
      e.preventDefault();
      e.stopPropagation();
      document.getElementById('dropZone').classList.remove('drag-over');

      const files = e.dataTransfer.files;
      handleImageFiles(files);
    }

    function handlePaste(e) {
      const items = e.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          e.preventDefault();
          const file = items[i].getAsFile();
          handleImageFiles([file]);
          break;
        }
      }
    }

    function handleImageFiles(files) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = function(e) {
            const base64 = e.target.result;
            attachedImages.push(base64);
            renderAttachedImages();
          };
          reader.readAsDataURL(file);
        }
      }
    }

    function renderAttachedImages() {
      const container = document.getElementById('attachedImages');
      container.innerHTML = attachedImages.map((img, index) => \`
        <div class="attached-image">
          <img src="\${img}" alt="Attached">
          <button class="remove-image" onclick="removeImage(\${index})">×</button>
        </div>
      \`).join('');

      // Hide drop zone after images added
      if (attachedImages.length > 0) {
        document.getElementById('dropZone').classList.remove('visible');
      }
    }

    function removeImage(index) {
      attachedImages.splice(index, 1);
      renderAttachedImages();
    }

    function clearAttachedImages() {
      attachedImages = [];
      renderAttachedImages();
    }

    // Context compaction notice
    function showCompactionNotice(summary, originalCount, keptCount) {
      const chatMessages = document.getElementById('chatMessages');
      const notice = document.createElement('div');
      notice.className = 'compaction-notice';
      notice.innerHTML = \`
        <div class="compaction-header">
          <span class="compaction-icon">📋</span>
          <strong>Conversation Compacted</strong>
        </div>
        <div class="compaction-details">
          <p>This session is being continued from a previous conversation that ran out of context.
          The summary below covers the earlier portion of the conversation.</p>
          <details>
            <summary>View Summary (\${originalCount} messages summarized)</summary>
            <div class="compaction-summary">\${summary}</div>
          </details>
        </div>
      \`;
      chatMessages.insertBefore(notice, chatMessages.firstChild);
    }

    // Connection method functions
    const currentSettings = {
      claudeModel: 'claude-sonnet-4-20250514',
      gptModel: 'gpt-4o',
      claudeConnectionMethod: 'api',
      gptConnectionMethod: 'api'
    };

    function saveConnectionMethods() {
      const claudeMethod = document.querySelector('input[name="claudeMethod"]:checked')?.value || 'api';
      const gptMethod = document.querySelector('input[name="gptMethod"]:checked')?.value || 'api';
      vscode.postMessage({ type: 'saveConnectionMethods', claudeMethod, gptMethod });
    }

    function loadConnectionMethods(settings) {
      if (!settings) return;
      currentSettings.claudeConnectionMethod = settings.claudeConnectionMethod || currentSettings.claudeConnectionMethod;
      currentSettings.gptConnectionMethod = settings.gptConnectionMethod || currentSettings.gptConnectionMethod;
      if (settings.claudeModel) currentSettings.claudeModel = settings.claudeModel;
      if (settings.gptModel) currentSettings.gptModel = settings.gptModel;

      const claudeMethod = settings.claudeConnectionMethod || 'api';
      const gptMethod = settings.gptConnectionMethod || 'api';

      const claudeApiRadio = document.getElementById('claudeMethodApi');
      const claudeCliRadio = document.getElementById('claudeMethodCli');
      const gptApiRadio = document.getElementById('gptMethodApi');
      const gptCliRadio = document.getElementById('gptMethodCli');

      if (claudeApiRadio) claudeApiRadio.checked = (claudeMethod === 'api');
      if (claudeCliRadio) claudeCliRadio.checked = (claudeMethod === 'cli');
      if (gptApiRadio) gptApiRadio.checked = (gptMethod === 'api');
      if (gptCliRadio) gptCliRadio.checked = (gptMethod === 'cli');

      // Load MasterMind settings
      const maxTurnsSelect = document.getElementById('maxTurnsSelect');
      const responseStyleSelect = document.getElementById('responseStyleSelect');
      const autoSummarizeCheck = document.getElementById('autoSummarizeCheck');

      if (maxTurnsSelect) maxTurnsSelect.value = String(settings.maxTurns || 4);
      if (responseStyleSelect) responseStyleSelect.value = settings.mastermindResponseStyle || 'concise';
      if (autoSummarizeCheck) autoSummarizeCheck.checked = settings.mastermindAutoSummarize !== false;

      updateTokenBar(currentChatId);
    }

    function saveMastermindSettings() {
      const maxTurns = parseInt(document.getElementById('maxTurnsSelect').value, 10);
      const responseStyle = document.getElementById('responseStyleSelect').value;
      const autoSummarize = document.getElementById('autoSummarizeCheck').checked;
      vscode.postMessage({ type: 'saveMastermindSettings', maxTurns, responseStyle, autoSummarize });
    }

    // CLI Status functions
    function refreshCliStatus() {
      vscode.postMessage({ type: 'getCliStatus' });
    }

    function renderCliStatus(status) {
      const container = document.getElementById('cliStatusContainer');
      if (!container) return;

      container.innerHTML = \`
        <div class="cli-status-card">
          <div class="cli-status-info">
            <div class="cli-status-icon claude">C</div>
            <div class="cli-status-details">
              <h4>Claude CLI</h4>
              <div class="cli-status-badges">
                \${status.claude.installed
                  ? \`<span class="cli-badge installed">Installed \${status.claude.version || ''}</span>\`
                  : '<span class="cli-badge not-installed">Not Installed</span>'
                }
                \${status.claude.installed && status.claude.loggedIn
                  ? '<span class="cli-badge logged-in">Logged In</span>'
                  : status.claude.installed
                    ? '<span class="cli-badge not-logged-in">Not Logged In</span>'
                    : ''
                }
              </div>
            </div>
          </div>
          <div class="cli-status-actions">
            \${!status.claude.installed
              ? '<button class="btn-primary" onclick="installCli(\\'claude\\')">Install</button>'
              : !status.claude.loggedIn
                ? '<button class="btn-primary" onclick="loginCli(\\'claude\\')">Login</button>'
                : '<button class="btn-secondary" onclick="loginCli(\\'claude\\')">Re-login</button>'
            }
          </div>
        </div>

        <div class="cli-status-card">
          <div class="cli-status-info">
            <div class="cli-status-icon codex">G</div>
            <div class="cli-status-details">
              <h4>Codex CLI (GPT)</h4>
              <div class="cli-status-badges">
                \${status.codex.installed
                  ? \`<span class="cli-badge installed">Installed \${status.codex.version || ''}</span>\`
                  : '<span class="cli-badge not-installed">Not Installed</span>'
                }
                \${status.codex.installed && status.codex.loggedIn
                  ? '<span class="cli-badge logged-in">Ready</span>'
                  : status.codex.installed
                    ? '<span class="cli-badge not-logged-in">Auth Required</span>'
                    : ''
                }
              </div>
            </div>
          </div>
          <div class="cli-status-actions">
            \${!status.codex.installed
              ? '<button class="btn-primary" onclick="installCli(\\'codex\\')">Install</button>'
              : '<button class="btn-secondary" onclick="loginCli(\\'codex\\')">Auth</button>'
            }
          </div>
        </div>

        <p class="method-description" style="margin-top: 8px;">
          <strong>Install commands:</strong><br>
          Claude: <code>npm install -g @anthropic-ai/claude-code</code><br>
          Codex: <code>npm install -g @openai/codex</code>
        </p>
      \`;
    }

    function installCli(cli) {
      vscode.postMessage({ type: 'installCli', cli });
    }

    function loginCli(cli) {
      vscode.postMessage({ type: 'openTerminalForLogin', cli });
    }

    function handleKeyDown(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    }

    function autoResize(el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 200) + 'px';
    }

    // Create message HTML without adding to DOM (for background chats)
    function createMessageHtml(role, content, meta = {}) {
      let avatar, sender;
      switch (role) {
        case 'user': avatar = '👤'; sender = 'You'; break;
        case 'claude': avatar = 'C'; sender = 'Claude'; break;
        case 'gpt': avatar = 'G'; sender = 'GPT'; break;
        case 'summary': avatar = '📋'; sender = 'Summary'; break;
        case 'system': avatar = '⚠️'; sender = 'System'; break;
        default: avatar = '?'; sender = role;
      }

      return \`
        <div class="message \${role}">
          <div class="message-header">
            <div class="message-avatar \${role}">\${avatar}</div>
            <span class="message-sender">\${sender}</span>
            <span class="message-time">\${new Date().toLocaleTimeString()}</span>
          </div>
          <div class="message-content">\${escapeHtml(content)}</div>
          \${meta.tokens ? \`
            <div class="message-meta">
              <span>\${meta.tokens.input + meta.tokens.output} tokens</span>
              <span>$\${meta.cost?.toFixed(4) || '0.0000'}</span>
            </div>
          \` : ''}
        </div>
      \`;
    }

    function addMessage(role, content, meta = {}) {
      const container = document.getElementById('chatMessages');
      const empty = document.getElementById('emptyState');
      if (empty) empty.style.display = 'none';

      const html = createMessageHtml(role, content, meta);
      container.insertAdjacentHTML('beforeend', html);
      container.scrollTop = container.scrollHeight;
    }

    // Streaming message state per chat
    const streamingMessages = {};

    function appendToStreamingMessage(provider, chunk, chatId) {
      const container = document.getElementById('chatMessages');
      const empty = document.getElementById('emptyState');
      if (empty) empty.style.display = 'none';

      // Get or create streaming message element
      let streamingEl = document.getElementById('streaming-msg-' + chatId);

      if (!streamingEl) {
        // Create new streaming message element
        const providerLabel = provider === 'claude' ? 'Claude' : provider === 'gpt' ? 'GPT' : provider;
        const providerClass = provider === 'claude' ? 'claude' : provider === 'gpt' ? 'gpt' : '';
        const html = \`
          <div class="message assistant \${providerClass}" id="streaming-msg-\${chatId}">
            <div class="message-header">
              <span class="provider-badge \${providerClass}">\${providerLabel}</span>
              <span class="streaming-indicator">● Streaming...</span>
            </div>
            <div class="message-content" id="streaming-content-\${chatId}"></div>
          </div>
        \`;
        container.insertAdjacentHTML('beforeend', html);
        streamingEl = document.getElementById('streaming-msg-' + chatId);
        streamingMessages[chatId] = '';
      }

      // Append chunk to content
      streamingMessages[chatId] = (streamingMessages[chatId] || '') + chunk;
      const contentEl = document.getElementById('streaming-content-' + chatId);
      if (contentEl) {
        // Render markdown if available, otherwise plain text
        if (typeof marked !== 'undefined') {
          contentEl.innerHTML = marked.parse(streamingMessages[chatId]);
        } else {
          contentEl.textContent = streamingMessages[chatId];
        }
      }

      // Auto-scroll
      container.scrollTop = container.scrollHeight;
    }

    function finalizeStreamingMessage(chatId) {
      const streamingEl = document.getElementById('streaming-msg-' + chatId);
      if (streamingEl) {
        streamingEl.remove();
        delete streamingMessages[chatId];
      }
    }

    function setGenerating(generating, chatId = currentChatId) {
      // Update per-chat generating state
      if (chatSessions[chatId]) {
        chatSessions[chatId].isGenerating = generating;
      }

      // Only update UI if this is the currently visible chat
      if (chatId === currentChatId) {
        document.getElementById('sendBtn').disabled = generating;
        document.getElementById('sendBtn').style.display = generating ? 'none' : 'block';
        document.getElementById('stopBtn').style.display = generating ? 'block' : 'none';
        document.getElementById('statusDot').classList.toggle('thinking', generating);
        document.getElementById('statusText').textContent = generating ? 'Generating...' : 'Ready';
      }

      // Update tab to show generating indicator
      renderChatTabs();
    }

    function stopConversation() {
      vscode.postMessage({ type: 'stop', chatId: currentChatId });
      setGenerating(false, currentChatId);
      addMessage('system', 'Conversation stopped by user.', {});
    }

    function clearChat() {
      document.getElementById('chatMessages').innerHTML = \`
        <div class="empty-state" id="emptyState">
          <h2>Welcome to SpaceCode</h2>
          <p>Your AI coding companion with MasterMind mode</p>
          <div class="quick-actions">
            <button class="quick-action" onclick="insertPrompt('Review my code')">Review Code</button>
            <button class="quick-action" onclick="insertPrompt('Explain this function')">Explain Code</button>
            <button class="quick-action" onclick="insertPrompt('Help me debug')">Debug</button>
            <button class="quick-action" onclick="insertPrompt('Write tests for')">Write Tests</button>
          </div>
        </div>
      \`;
      vscode.postMessage({ type: 'clearChat' });
    }

    function insertPrompt(text) {
      document.getElementById('messageInput').value = text + ' ';
      document.getElementById('messageInput').focus();
    }

    function saveApiKeys() {
      const claude = document.getElementById('claudeKeyInput').value;
      const openai = document.getElementById('openaiKeyInput').value;
      vscode.postMessage({ type: 'saveApiKeys', claude, openai });
    }

    function showLogChannel(channel) {
      document.getElementById('logsDropdown')?.classList.remove('visible');
      vscode.postMessage({ type: 'showLogChannel', channel });
    }

    function clearAllLogs() {
      document.getElementById('logsDropdown')?.classList.remove('visible');
      vscode.postMessage({ type: 'clearAllLogs' });
    }

    function openTerminal() {
      document.getElementById('logsDropdown')?.classList.remove('visible');
      vscode.postMessage({ type: 'openTerminal' });
    }

    function openDevTools() {
      document.getElementById('logsDropdown')?.classList.remove('visible');
      vscode.postMessage({ type: 'openDevTools' });
    }

    function toggleCrawlOptions() {
      const crawlCheckbox = document.getElementById('kbCrawlWebsite');
      const crawlOptions = document.getElementById('crawlOptions');
      const addBtn = document.getElementById('addUrlBtn');

      if (crawlCheckbox.checked) {
        crawlOptions.style.display = 'block';
        addBtn.textContent = 'Crawl Website';
      } else {
        crawlOptions.style.display = 'none';
        addBtn.textContent = 'Add URL';
      }
    }

    function addKbUrl() {
      const url = document.getElementById('kbUrlInput').value.trim();
      if (!url) return;

      const crawlWebsite = document.getElementById('kbCrawlWebsite').checked;

      if (crawlWebsite) {
        const maxPages = parseInt(document.getElementById('kbMaxPages').value) || 10000;
        const maxDepth = parseInt(document.getElementById('kbMaxDepth').value) || 10;

        // Show progress UI
        document.getElementById('crawlProgress').style.display = 'block';
        document.getElementById('addUrlBtn').disabled = true;
        document.getElementById('kbUrlInput').disabled = true;
        document.getElementById('crawlStatus').textContent = 'Starting crawl...';
        document.getElementById('crawlCount').textContent = '0/0 pages';
        document.getElementById('crawlProgressBar').style.width = '0%';

        vscode.postMessage({
          type: 'kbCrawlWebsite',
          url,
          tags: [],
          options: { maxPages, maxDepth }
        });
      } else {
        vscode.postMessage({ type: 'kbAddUrl', url, tags: [] });
        document.getElementById('kbUrlInput').value = '';
      }
    }

    function handleCrawlProgress(progress) {
      const progressBar = document.getElementById('crawlProgressBar');
      const statusEl = document.getElementById('crawlStatus');
      const countEl = document.getElementById('crawlCount');
      const urlEl = document.getElementById('crawlCurrentUrl');

      if (progress.status === 'crawling') {
        const percent = progress.total > 0 ? (progress.crawled / progress.total * 100) : 0;
        progressBar.style.width = percent + '%';
        statusEl.textContent = 'Crawling...';
        countEl.textContent = progress.crawled + '/' + progress.total + ' pages';
        urlEl.textContent = progress.currentUrl;
      } else if (progress.status === 'done') {
        progressBar.style.width = '100%';
        statusEl.textContent = 'Done!';
        countEl.textContent = progress.crawled + ' pages crawled';
        urlEl.textContent = '';

        // Reset UI after delay
        setTimeout(() => {
          document.getElementById('crawlProgress').style.display = 'none';
          document.getElementById('addUrlBtn').disabled = false;
          document.getElementById('kbUrlInput').disabled = false;
          document.getElementById('kbUrlInput').value = '';
          document.getElementById('kbCrawlWebsite').checked = false;
          toggleCrawlOptions();
        }, 2000);
      } else if (progress.status === 'error') {
        statusEl.textContent = 'Error: ' + (progress.error || 'Unknown');
        setTimeout(() => {
          document.getElementById('crawlProgress').style.display = 'none';
          document.getElementById('addUrlBtn').disabled = false;
          document.getElementById('kbUrlInput').disabled = false;
        }, 3000);
      }
    }

    const CHARS_PER_TOKEN = 4; // Rough estimate for context sizing
    const DEFAULT_PRICING = {
      'gpt-4o': { input: 2.5, output: 10 },
      'gpt-4-turbo': { input: 10, output: 30 },
      'gpt-4': { input: 30, output: 60 },
      'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
      'o1-preview': { input: 15, output: 60 },
      'o1-mini': { input: 3, output: 12 },
      'gpt-5.2': { input: 1, output: 5 },
      'gpt-5.2-codex': { input: 1.5, output: 6 }
    };
    let pricingMap = { ...DEFAULT_PRICING };

    function estimateTokens(text) {
      return Math.ceil((text || '').length / CHARS_PER_TOKEN);
    }

    function estimateHistoryTokens(history) {
      let total = 0;
      for (const msg of history || []) {
        total += estimateTokens(msg.content || '');
      }
      return total;
    }

    function estimateHistoryTokenBreakdown(history) {
      let input = 0;
      let output = 0;
      for (const msg of history || []) {
        const tokens = estimateTokens(msg.content || '');
        if (msg.role === 'assistant') {
          output += tokens;
        } else {
          input += tokens;
        }
      }
      return { input, output };
    }

    function mergePricing(newPricing) {
      if (!newPricing) return;
      pricingMap = { ...pricingMap, ...newPricing };
    }

    function getCostDisplay(session) {
      const provider = session.mode === 'gpt' ? 'gpt' : 'claude';
      const model = provider === 'gpt' ? currentSettings.gptModel : currentSettings.claudeModel;
      const method = provider === 'gpt' ? currentSettings.gptConnectionMethod : currentSettings.claudeConnectionMethod;
      const tokens = estimateHistoryTokenBreakdown(session.messageHistory);
      const pricing = pricingMap[model];
      if (!pricing) {
        return { text: 'cost N/A', className: 'token-bar-cost', provider };
      }
      const inputCost = (tokens.input / 1_000_000) * pricing.input;
      const outputCost = (tokens.output / 1_000_000) * pricing.output;
      const cost = inputCost + outputCost;
      const formatted = '$' + cost.toFixed(4);
      if (method === 'cli') {
        return { text: 'saved ' + formatted, className: 'token-bar-cost saved', provider };
      }
      return { text: formatted, className: 'token-bar-cost', provider };
    }

    function openPricing(provider) {
      vscode.postMessage({ type: 'openPricing', provider });
    }

    // Update the token bar to reflect current chat context size (not spend)
    function updateTokenBar(chatId = currentChatId) {
      const session = chatSessions[chatId];
      if (!session) return;

      const tokensUsed = estimateHistoryTokens(session.messageHistory);
      session.tokensUsed = tokensUsed;
      const contextLimit = getContextLimit(session.mode);
      const percentage = Math.min((tokensUsed / contextLimit) * 100, 100);

      const container = document.getElementById('tokenBarContainer');
      const fill = document.getElementById('tokenBarFill');
      const label = document.getElementById('tokenBarLabel');

      if (chatId !== currentChatId) {
        return;
      }

      if (fill) {
        fill.style.width = Math.max(percentage, 2) + '%';
      }

      if (container) {
        container.title = 'Context usage: ' + Math.round(percentage) + '% (' + tokensUsed.toLocaleString() + ' / ' + contextLimit.toLocaleString() + ')';
        container.dataset.warning = percentage >= 70 ? 'true' : 'false';
        container.dataset.critical = percentage >= 90 ? 'true' : 'false';
      }

      if (label) {
        const limitK = Math.round(contextLimit / 1000);
        const usedK = tokensUsed >= 1000 ? Math.round(tokensUsed / 1000) + 'K' : tokensUsed;
        const costDisplay = getCostDisplay(session);
        const pricingLink = costDisplay && costDisplay.provider
          ? ' <a href="#" class="token-bar-link" onclick="openPricing(\\'' + costDisplay.provider + '\\')">pricing</a>'
          : '';
        label.innerHTML = usedK + ' / ' + limitK + 'K tokens' +
          (costDisplay ? ' <span class="' + costDisplay.className + '">' + costDisplay.text + '</span>' : '') +
          pricingLink;
      }
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // ========== AGENTS / WORKFLOW FUNCTIONS ==========
    let editor = null; // Drawflow instance
    let currentWorkflowId = null;
    let selectedNodeId = null;
    let workflows = [];

    function showAgentsPanel() {
      // Hide chat section, show agents section
      document.getElementById('chatSection').style.display = 'none';
      document.getElementById('agentsSection').style.display = 'flex';

      // Remove active from mode buttons, add to agents
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('.mode-btn.agents').classList.add('active');

      // Initialize Drawflow if not already
      if (!editor) {
        initDrawflow();
      }

      // Request workflows from extension
      vscode.postMessage({ type: 'getWorkflows' });
    }

    function hideAgentsPanel() {
      document.getElementById('agentsSection').style.display = 'none';
      document.getElementById('chatSection').style.display = 'flex';
    }

    function initDrawflow() {
      const container = document.getElementById('drawflowCanvas');
      if (!container) return;

      // We'll use a simple custom implementation since Drawflow requires DOM manipulation
      // that's complex in a webview. For now, create a placeholder canvas.
      container.innerHTML = \`
        <div style="display: flex; align-items: center; justify-content: center; height: 100%; flex-direction: column; color: var(--text-secondary);">
          <div style="font-size: 48px; margin-bottom: 16px;">🔧</div>
          <p>Drag nodes from the left panel to create your workflow</p>
          <p style="font-size: 12px; margin-top: 8px;">Connect nodes by dragging from outputs to inputs</p>
        </div>
      \`;

      // Set up drag and drop for palette nodes
      setupNodePalette();
    }

    function setupNodePalette() {
      const paletteNodes = document.querySelectorAll('.palette-node');
      const canvas = document.getElementById('drawflowCanvas');

      paletteNodes.forEach(node => {
        node.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('nodeType', node.dataset.node);
        });
      });

      canvas.addEventListener('dragover', (e) => {
        e.preventDefault();
      });

      canvas.addEventListener('drop', (e) => {
        e.preventDefault();
        const nodeType = e.dataTransfer.getData('nodeType');
        if (nodeType) {
          addNodeToCanvas(nodeType, e.offsetX, e.offsetY);
        }
      });
    }

    let canvasNodes = [];
    let nodeIdCounter = 1;

    function addNodeToCanvas(type, x, y) {
      const canvas = document.getElementById('drawflowCanvas');

      // Clear placeholder if first node
      if (canvasNodes.length === 0) {
        canvas.innerHTML = '';
        canvas.style.position = 'relative';
      }

      const nodeId = 'node-' + nodeIdCounter++;
      const colors = {
        input: '#10b981',
        agent: '#8b5cf6',
        output: '#f59e0b'
      };
      const icons = {
        input: '📥',
        agent: '🤖',
        output: '📤'
      };
      const labels = {
        input: 'Input',
        agent: 'Agent',
        output: 'Output'
      };

      const nodeEl = document.createElement('div');
      nodeEl.id = nodeId;
      nodeEl.className = 'canvas-node ' + type + '-node';
      nodeEl.style.cssText = \`
        position: absolute;
        left: \${x - 80}px;
        top: \${y - 30}px;
        min-width: 160px;
        background: var(--bg-secondary);
        border: 2px solid \${colors[type]};
        border-radius: 8px;
        cursor: move;
        user-select: none;
      \`;
      nodeEl.innerHTML = \`
        <div style="padding: 12px 16px; display: flex; align-items: center; gap: 8px;">
          <span>\${icons[type]}</span>
          <span>\${labels[type]}</span>
        </div>
        \${type !== 'input' ? '<div class="node-input" style="position: absolute; left: -8px; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; background: var(--accent-color); border-radius: 50%; cursor: crosshair;"></div>' : ''}
        \${type !== 'output' ? '<div class="node-output" style="position: absolute; right: -8px; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; background: var(--accent-color); border-radius: 50%; cursor: crosshair;"></div>' : ''}
      \`;

      // Make node draggable
      makeNodeDraggable(nodeEl);

      // Click to select
      nodeEl.addEventListener('click', (e) => {
        e.stopPropagation();
        selectNode(nodeId, type);
      });

      canvas.appendChild(nodeEl);

      const nodeData = {
        id: nodeId,
        type: type,
        x: x - 80,
        y: y - 30,
        config: type === 'agent' ? { provider: 'claude', systemPrompt: 'You are a helpful assistant.' } : { label: labels[type] }
      };
      canvasNodes.push(nodeData);

      // Auto-select new node
      selectNode(nodeId, type);
    }

    function makeNodeDraggable(nodeEl) {
      let isDragging = false;
      let startX, startY, startLeft, startTop;

      nodeEl.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('node-input') || e.target.classList.contains('node-output')) return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startLeft = parseInt(nodeEl.style.left) || 0;
        startTop = parseInt(nodeEl.style.top) || 0;
        nodeEl.style.zIndex = 100;
      });

      document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        nodeEl.style.left = (startLeft + dx) + 'px';
        nodeEl.style.top = (startTop + dy) + 'px';

        // Update node data
        const nodeData = canvasNodes.find(n => n.id === nodeEl.id);
        if (nodeData) {
          nodeData.x = startLeft + dx;
          nodeData.y = startTop + dy;
        }
      });

      document.addEventListener('mouseup', () => {
        isDragging = false;
        nodeEl.style.zIndex = 1;
      });
    }

    function selectNode(nodeId, type) {
      // Deselect previous
      document.querySelectorAll('.canvas-node').forEach(n => n.style.boxShadow = 'none');

      // Select new
      const nodeEl = document.getElementById(nodeId);
      if (nodeEl) {
        nodeEl.style.boxShadow = '0 0 0 2px var(--accent-color)';
      }

      selectedNodeId = nodeId;
      showNodeConfig(nodeId, type);
    }

    function showNodeConfig(nodeId, type) {
      const nodeData = canvasNodes.find(n => n.id === nodeId);
      if (!nodeData) return;

      document.querySelector('.config-empty').style.display = 'none';
      const configPanel = document.getElementById('nodeConfigPanel');
      configPanel.style.display = 'block';
      document.getElementById('configNodeType').textContent = type.charAt(0).toUpperCase() + type.slice(1) + ' Node';

      let configHtml = '';
      if (type === 'agent') {
        const config = nodeData.config || {};
        configHtml = \`
          <div class="config-field">
            <label>Provider</label>
            <select id="nodeProvider" onchange="updateNodeConfig()">
              <option value="claude" \${config.provider === 'claude' ? 'selected' : ''}>Claude</option>
              <option value="gpt" \${config.provider === 'gpt' ? 'selected' : ''}>GPT</option>
            </select>
          </div>
          <div class="config-field">
            <label>System Prompt</label>
            <textarea id="nodeSystemPrompt" onchange="updateNodeConfig()" placeholder="Enter system prompt...">\${config.systemPrompt || ''}</textarea>
          </div>
        \`;
      } else {
        const config = nodeData.config || {};
        configHtml = \`
          <div class="config-field">
            <label>Label</label>
            <input type="text" id="nodeLabel" value="\${config.label || ''}" onchange="updateNodeConfig()">
          </div>
        \`;
      }

      configHtml += \`
        <div style="margin-top: 20px;">
          <button class="btn-secondary" onclick="deleteSelectedNode()" style="width: 100%; color: var(--error-text);">Delete Node</button>
        </div>
      \`;

      document.getElementById('configContent').innerHTML = configHtml;
    }

    function updateNodeConfig() {
      if (!selectedNodeId) return;
      const nodeData = canvasNodes.find(n => n.id === selectedNodeId);
      if (!nodeData) return;

      if (nodeData.type === 'agent') {
        nodeData.config = {
          provider: document.getElementById('nodeProvider')?.value || 'claude',
          systemPrompt: document.getElementById('nodeSystemPrompt')?.value || ''
        };
      } else {
        nodeData.config = {
          label: document.getElementById('nodeLabel')?.value || ''
        };
      }
    }

    function deleteSelectedNode() {
      if (!selectedNodeId) return;
      const nodeEl = document.getElementById(selectedNodeId);
      if (nodeEl) {
        nodeEl.remove();
      }
      canvasNodes = canvasNodes.filter(n => n.id !== selectedNodeId);
      selectedNodeId = null;
      document.querySelector('.config-empty').style.display = 'block';
      document.getElementById('nodeConfigPanel').style.display = 'none';
    }

    function newWorkflow() {
      currentWorkflowId = 'workflow-' + Date.now();
      document.getElementById('workflowName').value = 'New Workflow';
      clearCanvas();
    }

    function clearCanvas() {
      const canvas = document.getElementById('drawflowCanvas');
      canvas.innerHTML = \`
        <div style="display: flex; align-items: center; justify-content: center; height: 100%; flex-direction: column; color: var(--text-secondary);">
          <div style="font-size: 48px; margin-bottom: 16px;">🔧</div>
          <p>Drag nodes from the left panel to create your workflow</p>
          <p style="font-size: 12px; margin-top: 8px;">Connect nodes by dragging from outputs to inputs</p>
        </div>
      \`;
      canvasNodes = [];
      nodeIdCounter = 1;
      selectedNodeId = null;
      document.querySelector('.config-empty').style.display = 'block';
      document.getElementById('nodeConfigPanel').style.display = 'none';
    }

    function saveCurrentWorkflow() {
      const name = document.getElementById('workflowName').value || 'Untitled Workflow';
      if (!currentWorkflowId) {
        currentWorkflowId = 'workflow-' + Date.now();
      }

      // Build workflow data
      const workflowData = {
        id: currentWorkflowId,
        name: name,
        nodes: canvasNodes,
        connections: [], // TODO: implement connections
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      vscode.postMessage({
        type: 'saveWorkflow',
        workflow: workflowData
      });
    }

    function loadWorkflow(workflowId) {
      const workflow = workflows.find(w => w.id === workflowId);
      if (!workflow) return;

      currentWorkflowId = workflow.id;
      document.getElementById('workflowName').value = workflow.name;

      // Clear and rebuild canvas
      const canvas = document.getElementById('drawflowCanvas');
      canvas.innerHTML = '';
      canvas.style.position = 'relative';
      canvasNodes = [];
      nodeIdCounter = 1;

      // Add nodes from workflow
      if (workflow.nodes) {
        workflow.nodes.forEach(node => {
          const colors = { input: '#10b981', agent: '#8b5cf6', output: '#f59e0b' };
          const icons = { input: '📥', agent: '🤖', output: '📤' };
          const labels = { input: 'Input', agent: 'Agent', output: 'Output' };

          const nodeEl = document.createElement('div');
          nodeEl.id = node.id;
          nodeEl.className = 'canvas-node ' + node.type + '-node';
          nodeEl.style.cssText = \`
            position: absolute;
            left: \${node.x || node.posX || 100}px;
            top: \${node.y || node.posY || 100}px;
            min-width: 160px;
            background: var(--bg-secondary);
            border: 2px solid \${colors[node.type]};
            border-radius: 8px;
            cursor: move;
            user-select: none;
          \`;
          nodeEl.innerHTML = \`
            <div style="padding: 12px 16px; display: flex; align-items: center; gap: 8px;">
              <span>\${icons[node.type]}</span>
              <span>\${labels[node.type]}</span>
            </div>
            \${node.type !== 'input' ? '<div class="node-input" style="position: absolute; left: -8px; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; background: var(--accent-color); border-radius: 50%;"></div>' : ''}
            \${node.type !== 'output' ? '<div class="node-output" style="position: absolute; right: -8px; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; background: var(--accent-color); border-radius: 50%;"></div>' : ''}
          \`;

          makeNodeDraggable(nodeEl);
          nodeEl.addEventListener('click', (e) => {
            e.stopPropagation();
            selectNode(node.id, node.type);
          });

          canvas.appendChild(nodeEl);
          canvasNodes.push({
            id: node.id,
            type: node.type,
            x: node.x || node.posX || 100,
            y: node.y || node.posY || 100,
            config: node.config || {}
          });
        });

        // Update nodeIdCounter
        const maxId = Math.max(...canvasNodes.map(n => parseInt(n.id.replace('node-', '')) || 0));
        nodeIdCounter = maxId + 1;
      }

      // Highlight in workflow list
      document.querySelectorAll('.workflow-item').forEach(item => {
        item.classList.toggle('active', item.dataset.id === workflowId);
      });
    }

    function deleteWorkflow(workflowId) {
      if (confirm('Delete this workflow?')) {
        vscode.postMessage({ type: 'deleteWorkflow', workflowId });
      }
    }

    function importWorkflow() {
      vscode.postMessage({ type: 'importWorkflow' });
    }

    function exportCurrentWorkflow() {
      if (currentWorkflowId) {
        vscode.postMessage({ type: 'exportWorkflow', workflowId: currentWorkflowId });
      } else {
        alert('Please save the workflow first');
      }
    }

    function runWorkflow() {
      const input = document.getElementById('workflowInput').value.trim();
      if (!input) {
        alert('Please enter a message to run through the workflow');
        return;
      }

      if (canvasNodes.length === 0) {
        alert('Please create a workflow first');
        return;
      }

      // Build workflow data from canvas
      const workflowData = {
        id: currentWorkflowId || 'temp-' + Date.now(),
        name: document.getElementById('workflowName').value || 'Temp Workflow',
        nodes: canvasNodes.map(n => ({
          id: n.id,
          type: n.type,
          name: n.type,
          posX: n.x,
          posY: n.y,
          config: n.config
        })),
        connections: buildConnections(),
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      vscode.postMessage({
        type: 'executeWorkflow',
        workflowId: currentWorkflowId,
        input: input,
        drawflowData: {
          drawflow: {
            Home: {
              data: canvasNodes.reduce((acc, node) => {
                acc[node.id] = {
                  id: parseInt(node.id.replace('node-', '')) || 1,
                  name: node.type,
                  data: node.config,
                  class: node.type + '-node',
                  html: '',
                  typenode: false,
                  inputs: node.type !== 'input' ? { input_1: { connections: [] } } : {},
                  outputs: node.type !== 'output' ? { output_1: { connections: [] } } : {},
                  pos_x: node.x,
                  pos_y: node.y
                };
                return acc;
              }, {})
            }
          }
        }
      });

      // Show output panel
      document.getElementById('workflowOutput').style.display = 'flex';
      document.getElementById('workflowOutputContent').innerHTML = '<p style="color: var(--text-secondary);">Running workflow...</p>';
    }

    function buildConnections() {
      // Simple auto-connect: input -> agent -> output based on position
      const sorted = [...canvasNodes].sort((a, b) => a.x - b.x);
      const connections = [];
      for (let i = 0; i < sorted.length - 1; i++) {
        connections.push({
          id: \`conn-\${i}\`,
          fromNodeId: sorted[i].id,
          fromOutput: 'output_1',
          toNodeId: sorted[i + 1].id,
          toInput: 'input_1'
        });
      }
      return connections;
    }

    function closeWorkflowOutput() {
      document.getElementById('workflowOutput').style.display = 'none';
    }

    function updateWorkflowList() {
      const listEl = document.getElementById('workflowList');
      if (workflows.length === 0) {
        listEl.innerHTML = '<p class="empty-text">No workflows yet</p>';
        return;
      }

      listEl.innerHTML = workflows.map(w => \`
        <div class="workflow-item \${w.id === currentWorkflowId ? 'active' : ''}" data-id="\${w.id}" onclick="loadWorkflow('\${w.id}')">
          <span class="workflow-item-name">\${escapeHtml(w.name)}</span>
          <span class="workflow-item-delete" onclick="event.stopPropagation(); deleteWorkflow('\${w.id}')">🗑️</span>
        </div>
      \`).join('');
    }

    // Handle messages from extension
    window.addEventListener('message', event => {
      const msg = event.data;

      switch (msg.type) {
        case 'turn':
          // Only add to visible UI if this is the current chat
          if (!msg.chatId || msg.chatId === currentChatId) {
            // Finalize any streaming message before adding the complete turn
            finalizeStreamingMessage(msg.chatId || currentChatId);
            addMessage(msg.turn.provider, msg.turn.message, msg.turn.response);
          } else {
            // Store message HTML in the background chat's session
            const session = chatSessions[msg.chatId];
            if (session) {
              // Append message HTML to session's stored messages
              const msgHtml = createMessageHtml(msg.turn.provider, msg.turn.message, msg.turn.response);
              session.messagesHtml = (session.messagesHtml || '') + msgHtml;
            }
          }
          // Add AI response to the correct chat's message history
          if (msg.turn.provider === 'claude' || msg.turn.provider === 'gpt') {
            addToMessageHistory('assistant', msg.turn.message, msg.chatId || currentChatId);
          }
          break;

        case 'chunk':
          // Stream chunk for real-time display
          if (!msg.chatId || msg.chatId === currentChatId) {
            appendToStreamingMessage(msg.provider, msg.chunk, msg.chatId || currentChatId);
          }
          break;

        case 'status':
          document.getElementById('statusText').textContent = msg.status.message;
          break;

        case 'complete':
          setGenerating(false, msg.chatId);
          // Update token bar for the chat that completed
          updateTokenBar(msg.chatId || currentChatId);
          break;

        case 'summary':
          // Show summary in a special styled message
          addMessage('summary', msg.content);
          break;

        case 'compacted':
          // Show context compaction notice
          showCompactionNotice(msg.summary, msg.originalMessageCount, msg.keptMessageCount);
          break;

        case 'error':
          setGenerating(false, msg.chatId);
          // Only show error message in current chat if it matches
          if (!msg.chatId || msg.chatId === currentChatId) {
            addMessage('system', 'Error: ' + msg.message);
          }
          break;

        case 'restoreChatState':
          // Restore chat tabs and messages from saved state
          if (msg.state) {
            restoreChatState(msg.state);
          }
          break;

        case 'settings':
          // Update settings UI with connection methods
          loadConnectionMethods(msg.settings);
          break;

        case 'connectionMethodsSaved':
          // Confirmation handled by VS Code notification
          break;

        case 'cliStatus':
          renderCliStatus(msg.status);
          break;

        case 'mcpServers':
          renderMcpServers(msg.servers);
          break;

        case 'kbEntries':
          renderKbEntries(msg.entries);
          break;

        case 'crawlProgress':
          handleCrawlProgress(msg.progress);
          break;

        case 'embedderStatus':
          renderEmbedderStatus(msg.status, msg.stats);
          break;

        case 'modelDownloadProgress':
          updateModelDownloadProgress(msg.progress);
          break;

        case 'modelDownloadStarted':
          setModelDownloading(true);
          break;

        case 'embeddingProgress':
          updateEmbeddingProgress(msg.id, msg.current, msg.total);
          break;

        case 'embedAllProgress':
          updateEmbedAllProgress(msg.entryIndex, msg.totalEntries, msg.chunkIndex, msg.totalChunks);
          break;

        case 'embedAllStarted':
          setEmbeddingAll(true);
          break;

        case 'costs':
          renderCosts(msg);
          break;

        // Voice-related messages
        case 'voiceSettings':
          loadVoiceSettings(msg.settings);
          break;

        case 'voiceDownloadProgress':
          updateVoiceDownloadProgress(msg.engine, msg.progress, msg.status);
          break;

        case 'micTestStatus':
          handleMicTestStatus(msg.status, msg.message);
          break;

	        case 'speakerTestStatus':
	          handleSpeakerTestStatus(msg.status, msg.message);
	          break;

	        // Ship UI messages
	        case 'shipSelected':
	          if (msg.sectorId) {
	            shipSelectedSectorId = msg.sectorId;
	            shipRender();
	          }
	          if (msg.profile) {
	            const sel = document.getElementById('shipProfileSelect');
	            if (sel) sel.value = msg.profile;
	          }
	          break;

	        case 'shipAutoexecute':
	          shipAutoexecute = !!msg.enabled;
	          shipUpdateChips();
	          break;

	        case 'shipContextPack':
	          if (msg.injectionText) {
	            // Keep it lightweight: show a short notice and allow user to inspect via the Settings/Context Pack UI later.
	            shipSetStatus('Context Pack ready for ' + (msg.sectorId || shipSelectedSectorId) + '.');
	            addMessage('system', 'Context Pack (preview):\\n' + msg.injectionText);
	          }
	          break;

	        case 'shipGateResult':
	          shipSetStatus((msg.ok ? 'Gates passed: ' : 'Gates failed: ') + (msg.summary || ''));
	          break;

        case 'shipDocsStatus':
          shipSetStatus(msg.summary || 'Docs status updated.');
          break;

        case 'autoexecuteJobs':
          renderJobList(msg.jobs || []);
          break;

        case 'autoexecuteBlocked':
          shipSetStatus(msg.message || 'Action blocked; enable Autoexecute.');
          break;

        case 'contextPreview':
          if (typeof msg.text === 'string') {
            setContextPreview(msg.text);
          }
          break;

        case 'docTargets':
          populateDocTargets(Array.isArray(msg.targets) ? msg.targets : []);
          break;

	        // Workflow/Agents messages
	        case 'workflows':
	          workflows = msg.workflows || [];
	          updateWorkflowList();
	          break;

        case 'workflowResult':
          document.getElementById('workflowOutputContent').innerHTML =
            '<pre style="white-space: pre-wrap;">' + escapeHtml(msg.result) + '</pre>';
          break;

        case 'workflowError':
          document.getElementById('workflowOutputContent').innerHTML =
            '<p style="color: var(--error-text);">Error: ' + escapeHtml(msg.error) + '</p>';
          break;

        case 'workflowEvent':
          handleWorkflowEvent(msg.event);
          break;
      }
    });

    function handleWorkflowEvent(event) {
      const outputEl = document.getElementById('workflowOutputContent');
      if (!outputEl) return;

      switch (event.type) {
        case 'nodeStart':
          outputEl.innerHTML += '<p style="color: var(--text-secondary);">▶ Running node: ' + event.nodeId + '</p>';
          // Highlight the running node
          const runningNode = document.getElementById(event.nodeId);
          if (runningNode) {
            runningNode.style.boxShadow = '0 0 0 3px #10b981';
          }
          break;
        case 'nodeComplete':
          outputEl.innerHTML += '<p style="color: #10b981;">✓ Node complete: ' + event.nodeId + '</p>';
          // Remove highlight
          const completedNode = document.getElementById(event.nodeId);
          if (completedNode) {
            completedNode.style.boxShadow = 'none';
          }
          break;
        case 'nodeError':
          outputEl.innerHTML += '<p style="color: var(--error-text);">✗ Node error: ' + event.error + '</p>';
          break;
        case 'workflowComplete':
          outputEl.innerHTML += '<hr style="border-color: var(--border-color); margin: 12px 0;"><h4>Result:</h4><pre style="white-space: pre-wrap;">' + escapeHtml(event.result || '') + '</pre>';
          break;
        case 'workflowError':
          outputEl.innerHTML += '<p style="color: var(--error-text);">Workflow error: ' + event.error + '</p>';
          break;
      }
    }

    // Voice panel functions
    function updateVoiceDownloadProgress(engine, progress, status) {
      const statusEl = document.querySelector('#' + engine + 'Option .voice-status-text');
      const indicator = document.querySelector('#' + engine + 'Option .voice-status-indicator');
      const btn = document.querySelector('#' + engine + 'DownloadBtn');

      if (statusEl) statusEl.textContent = status;

      if (indicator) {
        if (progress > 0 && progress < 100) {
          indicator.className = 'voice-status-indicator downloading';
        } else if (status === 'Installed' || progress === 100) {
          indicator.className = 'voice-status-indicator installed';
        } else {
          indicator.className = 'voice-status-indicator';
        }
      }

      if (btn) {
        if (progress > 0 && progress < 100) {
          btn.disabled = true;
          btn.textContent = progress + '%';
        } else if (status === 'Installed') {
          btn.disabled = true;
          btn.textContent = '✓ Installed';
        } else if (status.startsWith('Error')) {
          btn.disabled = false;
          btn.textContent = 'Retry Download';
        } else {
          btn.disabled = false;
          btn.textContent = 'Download ' + engine.charAt(0).toUpperCase() + engine.slice(1);
        }
      }
    }

    function handleMicTestStatus(status, message) {
      const btn = document.getElementById('micTestBtn');
      const resultEl = document.getElementById('voiceTestResult');

      if (btn) {
        if (status === 'recording') {
          btn.classList.add('recording');
          btn.innerHTML = '🔴 Recording...';
        } else {
          btn.classList.remove('recording');
          btn.innerHTML = '🎤 Test Microphone';
        }
      }

      if (resultEl && message) {
        resultEl.textContent = message;
        resultEl.style.display = 'block';
      }
    }

    function handleSpeakerTestStatus(status, message) {
      const resultEl = document.getElementById('voiceTestResult');
      if (resultEl && message) {
        resultEl.textContent = message;
        resultEl.style.display = 'block';
      }
    }

    let mcpServersData = [];
    let selectedMcpServer = null;

    function renderMcpServers(servers) {
      mcpServersData = servers;
      const container = document.getElementById('mcpList');

      if (servers.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary)">No MCP servers configured</p>';
        showMcpDetails(null);
        return;
      }

      container.innerHTML = servers.map(s => \`
        <div class="mcp-server-item \${selectedMcpServer === s.id ? 'selected' : ''}"
             onclick="selectMcpServer('\${s.id}')" data-server-id="\${s.id}">
          <div class="status-dot \${s.status || 'stopped'}"></div>
          <div class="mcp-server-info">
            <div class="name">\${s.name}</div>
            <div class="transport">\${s.transport}</div>
          </div>
        </div>
      \`).join('');

      // If we had a selection, refresh the details
      if (selectedMcpServer) {
        const server = servers.find(s => s.id === selectedMcpServer);
        if (server) {
          showMcpDetails(server);
        }
      }
    }

    function selectMcpServer(serverId) {
      selectedMcpServer = serverId;
      const server = mcpServersData.find(s => s.id === serverId);

      // Update selection styling
      document.querySelectorAll('.mcp-server-item').forEach(el => {
        el.classList.toggle('selected', el.dataset.serverId === serverId);
      });

      showMcpDetails(server);
    }

    function showMcpDetails(server) {
      const panel = document.getElementById('mcpDetailsPanel');

      if (!server) {
        panel.innerHTML = \`
          <div class="mcp-details-empty">
            <div class="icon">🔌</div>
            <p>Select a server to view details</p>
          </div>
        \`;
        return;
      }

      const isConnected = server.status === 'running';
      const statusColor = isConnected ? 'var(--vscode-charts-green)' : 'var(--vscode-charts-red)';
      const statusText = isConnected ? 'Connected' : 'Disconnected';

      panel.innerHTML = \`
        <div class="mcp-details-header">
          <h4>\${server.name}</h4>
          <div class="mcp-details-actions">
            \${server.command
              ? \`<button class="btn-connect" onclick="mcpAction('launch', '\${server.id}')">Connect</button>\`
              : ''
            }
            <button class="btn-remove" onclick="mcpAction('remove', '\${server.id}')">Remove</button>
          </div>
        </div>

        <div class="mcp-info-row">
          <span class="label">Status:</span>
          <span class="value" style="color: \${statusColor}">● \${statusText}</span>
        </div>
        <div class="mcp-info-row">
          <span class="label">Transport:</span>
          <span class="value">\${server.transport}</span>
        </div>
        \${server.command ? \`
          <div class="mcp-info-row">
            <span class="label">Command:</span>
            <span class="value" style="font-family: monospace; font-size: 11px;">\${server.command}</span>
          </div>
        \` : ''}
        \${server.args && server.args.length > 0 ? \`
          <div class="mcp-info-row">
            <span class="label">Args:</span>
            <span class="value" style="font-family: monospace; font-size: 11px;">\${server.args.join(' ')}</span>
          </div>
        \` : ''}
        \${server.url ? \`
          <div class="mcp-info-row">
            <span class="label">URL:</span>
            <span class="value">\${server.url}</span>
          </div>
        \` : ''}
        \${server.description ? \`
          <div class="mcp-info-row">
            <span class="label">Info:</span>
            <span class="value">\${server.description}</span>
          </div>
        \` : ''}

        <div class="mcp-tools-section">
          <h5>Available Tools</h5>
          <p style="font-size: 12px; color: var(--text-secondary);">
            \${server.status === 'running'
              ? 'Tools are available when connected via Claude Code CLI.'
              : 'Connect the server to discover available tools.'}
          </p>
        </div>
      \`;
    }

    function mcpAction(action, serverId) {
      vscode.postMessage({ type: 'mcpAction', action, serverId });
    }

    function renderKbEntries(entries) {
      const container = document.getElementById('kbList');
      if (entries.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary)">No entries in knowledge base</p>';
        return;
      }

      container.innerHTML = entries.slice(0, 30).map(e => {
        const typeIcon = e.type === 'pdf' ? '📄' : (e.type === 'url' ? '🔗' : '📝');
        const embeddedBadge = e.embedded
          ? \`<span class="embedding-badge embedded">✓ \${e.chunkCount || 0}</span>\`
          : \`<span class="embedding-badge not-embedded">−</span>\`;
        const tagsDisplay = e.tags.length > 0
          ? \`<span style="color: var(--text-secondary); font-size: 11px; margin-left: 8px;">\${e.tags.join(', ')}</span>\`
          : '';

        return \`
          <div class="list-item" id="kb-entry-\${e.id}" style="padding: 8px 12px;">
            <div class="list-item-info" style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;">
              \${embeddedBadge}
              <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"><strong>\${typeIcon} \${e.title}</strong>\${tagsDisplay}</span>
            </div>
            <div class="list-item-actions" style="flex-direction: row; gap: 6px; flex-shrink: 0;">
              \${!e.embedded ? \`<button class="btn-connect" onclick="embedEntry('\${e.id}')" id="embed-btn-\${e.id}">Embed</button>\` : ''}
              <button class="btn-remove" onclick="vscode.postMessage({type:'kbRemove',id:'\${e.id}'})">Remove</button>
            </div>
          </div>
        \`;
      }).join('');
    }

    let currentEmbedderStatus = null;

    function renderEmbedderStatus(status, stats) {
      currentEmbedderStatus = status;
      const container = document.getElementById('embedderStatus');
      const modelSelect = document.getElementById('modelSelect');
      const modelInfo = document.getElementById('modelInfo');

      // Populate model selector
      if (modelSelect && status.availableModels) {
        modelSelect.innerHTML = status.availableModels.map(m => \`
          <option value="\${m.id}" \${m.id === status.modelId ? 'selected' : ''}>
            \${m.name} (\${m.size})
          </option>
        \`).join('');
      }

      // Show selected model info
      if (modelInfo && status.availableModels) {
        const selectedModel = status.availableModels.find(m => m.id === status.modelId);
        if (selectedModel) {
          modelInfo.innerHTML = \`
            <p>\${selectedModel.description}</p>
            <p style="margin-top: 4px;">
              <a href="\${selectedModel.url}" style="color: var(--accent-mastermind);" onclick="event.preventDefault(); vscode.postMessage({type:'openExternal', url:'\${selectedModel.url}'});">
                View on HuggingFace
              </a>
            </p>
          \`;
        }
      }

      if (status.isLoading) {
        container.innerHTML = \`
          <div style="display: flex; align-items: center; gap: 8px;">
            <div class="status-dot thinking"></div>
            <span>\${status.downloadProgress?.message || 'Loading model...'}</span>
          </div>
        \`;
        // Show progress container
        const progressContainer = document.getElementById('downloadProgressContainer');
        if (progressContainer) {
          progressContainer.style.display = 'block';
        }
        return;
      }

      // Hide progress container when not loading
      const progressContainer = document.getElementById('downloadProgressContainer');
      if (progressContainer) {
        progressContainer.style.display = 'none';
      }

      if (status.modelDownloaded) {
        container.innerHTML = \`
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <div style="width: 10px; height: 10px; background: #22c55e; border-radius: 50%;"></div>
            <span style="color: #22c55e; font-weight: 500;">Model Ready</span>
          </div>
          <p style="font-size: 12px; color: var(--text-secondary);">
            Embedded: \${stats.embeddedEntries}/\${stats.totalEntries} entries (\${stats.totalChunks} chunks)
          </p>
        \`;
      } else {
        const selectedModel = status.availableModels?.find(m => m.id === status.modelId);
        const modelSize = selectedModel?.size || '~30MB';
        container.innerHTML = \`
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <div style="width: 10px; height: 10px; background: #eab308; border-radius: 50%;"></div>
            <span style="color: #eab308;">Model Not Downloaded</span>
          </div>
          <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 12px;">
            Download the embedding model to enable semantic search and chunking.
          </p>
          <button class="btn-primary" onclick="downloadModel()" id="downloadModelBtn">
            Download Model (\${modelSize})
          </button>
        \`;
      }

      // Update stats
      const statsContainer = document.getElementById('kbStats');
      if (statsContainer) {
        statsContainer.innerHTML = \`
          <p style="color: var(--text-secondary); font-size: 12px;">
            <strong>\${stats.totalEntries}</strong> entries |
            <strong>\${stats.embeddedEntries}</strong> embedded |
            <strong>\${stats.totalChunks}</strong> total chunks
          </p>
        \`;
      }
    }

    function onModelSelect() {
      const modelSelect = document.getElementById('modelSelect');
      if (modelSelect && modelSelect.value) {
        vscode.postMessage({ type: 'kbSetModel', modelId: modelSelect.value });
      }
    }

    function downloadModel() {
      const btn = document.getElementById('downloadModelBtn');
      const modelSelect = document.getElementById('modelSelect');
      if (btn) btn.disabled = true;

      const modelId = modelSelect?.value || null;
      vscode.postMessage({ type: 'kbDownloadModel', modelId });

      // Show progress container
      const progressContainer = document.getElementById('downloadProgressContainer');
      if (progressContainer) {
        progressContainer.style.display = 'block';
      }
    }

    function setModelDownloading(isDownloading) {
      const btn = document.getElementById('downloadModelBtn');
      const progressContainer = document.getElementById('downloadProgressContainer');

      if (btn) {
        btn.disabled = isDownloading;
        if (!isDownloading) {
          const selectedModel = currentEmbedderStatus?.availableModels?.find(m => m.id === currentEmbedderStatus?.modelId);
          btn.textContent = \`Download Model (\${selectedModel?.size || '~30MB'})\`;
        }
      }

      if (progressContainer) {
        progressContainer.style.display = isDownloading ? 'block' : 'none';
      }
    }

    function updateModelDownloadProgress(progress) {
      const fill = document.getElementById('downloadProgressFill');
      const text = document.getElementById('downloadProgressText');
      const bytes = document.getElementById('downloadProgressBytes');

      if (fill) fill.style.width = progress.progress + '%';
      if (text) text.textContent = progress.message;

      if (bytes && progress.bytesLoaded && progress.bytesTotal) {
        const loaded = (progress.bytesLoaded / 1024 / 1024).toFixed(1);
        const total = (progress.bytesTotal / 1024 / 1024).toFixed(1);
        bytes.textContent = \`\${loaded} MB / \${total} MB\${progress.currentFile ? ' - ' + progress.currentFile : ''}\`;
      } else if (bytes) {
        bytes.textContent = progress.currentFile || '';
      }
    }

    function embedEntry(id) {
      const btn = document.getElementById('embed-btn-' + id);
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Embedding...';
      }
      vscode.postMessage({ type: 'kbEmbedEntry', id });
    }

    function embedAllEntries() {
      const btn = document.getElementById('embedAllBtn');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Embedding...';
      }
      vscode.postMessage({ type: 'kbEmbedAll' });
    }

    function setEmbeddingAll(isEmbedding) {
      const btn = document.getElementById('embedAllBtn');
      if (btn) {
        btn.disabled = isEmbedding;
        btn.textContent = isEmbedding ? 'Embedding...' : 'Embed All Entries';
      }
    }

    function updateEmbeddingProgress(id, current, total) {
      const btn = document.getElementById('embed-btn-' + id);
      if (btn) {
        btn.textContent = \`\${current}/\${total}\`;
      }
    }

    function updateEmbedAllProgress(entryIndex, totalEntries, chunkIndex, totalChunks) {
      const btn = document.getElementById('embedAllBtn');
      if (btn) {
        btn.textContent = \`Entry \${entryIndex}/\${totalEntries} (chunk \${chunkIndex}/\${totalChunks})\`;
      }
    }

    // PDF Drop Zone handlers
    function handleDragOver(event) {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.classList.add('drag-over');
    }

    function handleDragLeave(event) {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.classList.remove('drag-over');
    }

    function handlePdfDrop(event) {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.classList.remove('drag-over');

      const files = event.dataTransfer.files;
      processPdfFiles(files);
    }

    function handlePdfSelect(event) {
      const files = event.target.files;
      processPdfFiles(files);
      event.target.value = ''; // Reset input
    }

    function processPdfFiles(files) {
      for (const file of files) {
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          const reader = new FileReader();
          reader.onload = function(e) {
            // Convert ArrayBuffer to base64
            const base64 = btoa(
              new Uint8Array(e.target.result)
                .reduce((data, byte) => data + String.fromCharCode(byte), '')
            );
            vscode.postMessage({
              type: 'kbAddPdf',
              data: base64,
              fileName: file.name,
              tags: []
            });
          };
          reader.readAsArrayBuffer(file);
        } else {
          alert('Please select PDF files only');
        }
      }
    }

    // Make drop zone clickable
    document.addEventListener('DOMContentLoaded', function() {
      const dropZone = document.getElementById('pdfDropZone');
      const fileInput = document.getElementById('pdfFileInput');
      if (dropZone && fileInput) {
        dropZone.addEventListener('click', () => fileInput.click());
      }
    });

    function renderCosts(data) {
      const container = document.getElementById('costsContent');
      container.innerHTML = \`
        <div class="list-item">
          <div><strong>Today</strong></div>
          <div>$\${data.today.totalCost.toFixed(4)} (\${data.today.recordCount} calls)</div>
        </div>
        <div class="list-item">
          <div><strong>This Month</strong></div>
          <div>$\${data.month.totalCost.toFixed(4)} (\${data.month.recordCount} calls)</div>
        </div>
        <div class="list-item">
          <div><strong>All Time</strong></div>
          <div>$\${data.all.totalCost.toFixed(4)} (\${data.all.recordCount} calls)</div>
        </div>
        <h4 style="margin: 20px 0 10px;">By Provider</h4>
        <div class="list-item">
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="width:12px;height:12px;background:var(--accent-claude);border-radius:50%"></div>
            <strong>Claude</strong>
          </div>
          <div>$\${data.all.byProvider.claude.cost.toFixed(4)} (\${data.all.byProvider.claude.calls} calls)</div>
        </div>
        <div class="list-item">
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="width:12px;height:12px;background:var(--accent-gpt);border-radius:50%"></div>
            <strong>GPT</strong>
          </div>
          <div>$\${data.all.byProvider.gpt.cost.toFixed(4)} (\${data.all.byProvider.gpt.calls} calls)</div>
        </div>
      \`;
    }

    // Request initial settings, pricing, and embedder status
    vscode.postMessage({ type: 'getSettings' });
    vscode.postMessage({ type: 'getPricing' });
    vscode.postMessage({ type: 'kbGetEmbedderStatus' });
    vscode.postMessage({ type: 'getKbEntries' });
  </script>
</body>
</html>`;
  }
}
