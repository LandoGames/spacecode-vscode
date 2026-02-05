/**
 * Main Panel - Full editor webview (like Claude Code / Codex)
 *
 * Opens as an editor tab with chat interface and settings
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import { ConversationOrchestrator, ConversationTurn } from '../orchestrator/conversation';
import { CostTracker } from '../services/costTracker';
import { KnowledgeBaseService } from '../services/knowledgeBase';
import { MCPManager } from '../services/mcpManager';
import { getUnityMCPClient, UnityMCPClient } from '../services/mcpClient';
import { getCoplayClient, CoplayMCPClient } from '../services/coplayClient';
import { VoiceService } from '../services/voiceService';
import { SoundService } from '../services/soundService';
import { SettingsFileService } from '../services/settingsFile';
import { LogChannel, logger } from '../services/logService';
import { WorkflowEngine } from '../agents/workflowEngine';
import { AgentWorkflow, DrawflowExport, WorkflowEvent } from '../agents/types';
import { PricingService } from '../services/pricingService';
import { getContextGatherer, ContextGatherer, GatheredContext } from '../services/contextGatherer';
import { CoordinatorClient } from '../services/coordinatorClient';
import { buildMainPanelHtml } from './mainPanelHtml';
import { AutoexecuteJob, ChatState } from './mainPanelTypes';
import { createSettingsImpl } from './impl/settingsImpl';
import { createGitImpl } from './impl/gitImpl';
import { createVoiceImpl } from './impl/voiceImpl';
import { createMcpImpl } from './impl/mcpImpl';
import { createKbImpl } from './impl/kbImpl';
import { createPlansImpl } from './impl/plansImpl';
import { createTicketsImpl } from './impl/ticketsImpl';
import { createUnityImpl } from './impl/unityImpl';
import { createWorkflowsImpl } from './impl/workflowsImpl';
import { createAutoexecuteImpl } from './impl/autoexecuteImpl';
import { createShipImpl } from './impl/shipImpl';
import { createVerificationImpl } from './impl/verificationImpl';
import { createCliImpl } from './impl/cliImpl';
import { createMiscImpl } from './impl/miscImpl';
import { createSenseiImpl } from './impl/senseiImpl';
import { createGitHubImpl } from './impl/githubImpl';
import { createPlanningImpl } from './impl/planningImpl';
import { handleMainPanelMessage } from './mainPanelRouter';
import { setupExplorerIntegration } from './handlers/explorer';
import { createDocsImpl } from './impl/docsImpl';
import { createChatImpl } from './impl/chatImpl';
import { PlanStorage, Plan } from '../../planning';
import { DiffScanner, PlanComparer, SectorRuleChecker, AsmdefGate, DiffScanResult, PlanComparisonResult } from '../../verification';
import { createGitAdapter, GitAdapter, createGitHubAdapter, GitHubAdapter } from '../../integration';
import { getSectorManager, initSectorManager, SectorConfig, SectorManager } from '../../sectors';
import { TicketStorage, TicketStatus } from '../../tickets';

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
  private planStorage: PlanStorage;
  private ticketStorage: TicketStorage;
  private _currentChatId: string | undefined; // Track which chat is currently processing
  private _shipSectorId: string = 'yard';
  private _shipProfile: 'yard' | 'scout' | 'battleship' = 'yard';
  private _shipAutoexecute: boolean = false;
  private _contextPreviewText: string = '';
  private _contextPreviewTimer: NodeJS.Timeout | undefined;
  private _lastEditorContextPreviewText: string = '';
  private _autoexecuteEnabled: boolean = false;
  private _docTarget: string = '';
  private _pendingStepApproval: { resolve: (ok: boolean) => void } | null = null;
  private _docsImpl: ReturnType<typeof createDocsImpl>;
  private _chatImpl: ReturnType<typeof createChatImpl>;
  private _settingsImpl: ReturnType<typeof createSettingsImpl>;
  private _gitImpl: ReturnType<typeof createGitImpl>;
  private _voiceImpl: ReturnType<typeof createVoiceImpl>;
  private _mcpImpl: ReturnType<typeof createMcpImpl>;
  private _kbImpl: ReturnType<typeof createKbImpl>;
  private _plansImpl: ReturnType<typeof createPlansImpl>;
  private _ticketsImpl: ReturnType<typeof createTicketsImpl>;
  private _unityImpl: ReturnType<typeof createUnityImpl>;
  private _workflowsImpl: ReturnType<typeof createWorkflowsImpl>;
  private _autoexecuteImpl: ReturnType<typeof createAutoexecuteImpl>;
  private _shipImpl: ReturnType<typeof createShipImpl>;
  private _verificationImpl: ReturnType<typeof createVerificationImpl>;
  private _verificationCurrentPlan: { expectedFiles: string[] } | null = null;
  private _cliImpl: ReturnType<typeof createCliImpl>;
  private _miscImpl: ReturnType<typeof createMiscImpl>;
  private _senseiImpl: ReturnType<typeof createSenseiImpl>;
  private _githubImpl: ReturnType<typeof createGitHubImpl>;
  private _planningImpl: ReturnType<typeof createPlanningImpl>;
  private gitAdapter: GitAdapter;
  private githubAdapter: GitHubAdapter;
  private diffScanner: DiffScanner;
  private planComparer: PlanComparer;
  private sectorRuleChecker: SectorRuleChecker;
  private asmdefGate: AsmdefGate;
  private coordinatorClient: CoordinatorClient;
  private _coordinatorSync: { policy: number; inventory: number; graph: number } = { policy: 0, inventory: 0, graph: 0 };
  private _coordinatorSyncStatus: { policy: string; inventory: string; graph: string } = {
    policy: 'unknown',
    inventory: 'unknown',
    graph: 'unknown'
  };
  private sectorManager: SectorManager;
  private contextGatherer: ContextGatherer;
  private _gatheredContext: GatheredContext | null = null;
  private unityMcpClient: UnityMCPClient;
  private coplayClient: CoplayMCPClient;

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
    this.planStorage = new PlanStorage(context);
    this.ticketStorage = new TicketStorage(context);
    this._docsImpl = createDocsImpl(this);
    this._chatImpl = createChatImpl(this);
    this._settingsImpl = createSettingsImpl(this);
    this._gitImpl = createGitImpl(this);
    this._voiceImpl = createVoiceImpl(this);
    this._mcpImpl = createMcpImpl(this);
    this._kbImpl = createKbImpl(this);
    this._plansImpl = createPlansImpl(this);
    this._ticketsImpl = createTicketsImpl(this);
    this._unityImpl = createUnityImpl(this);
    this._workflowsImpl = createWorkflowsImpl(this);
    this._autoexecuteImpl = createAutoexecuteImpl(this);
    this._shipImpl = createShipImpl(this);
    this._verificationImpl = createVerificationImpl(this);
    this._cliImpl = createCliImpl(this);
    this._miscImpl = createMiscImpl(this);
    this._senseiImpl = createSenseiImpl(this);
    this._githubImpl = createGitHubImpl(this);
    this._planningImpl = createPlanningImpl(this);

    // Initialize verification and sector modules
    const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    this.gitAdapter = createGitAdapter(workspaceDir);
    this.githubAdapter = createGitHubAdapter(workspaceDir);
    this.diffScanner = new DiffScanner(this.gitAdapter);
    this.planComparer = new PlanComparer();
    this.sectorRuleChecker = new SectorRuleChecker({
      getFileContent: async (filePath: string) => {
        try {
          const uri = vscode.Uri.file(filePath);
          const content = await vscode.workspace.fs.readFile(uri);
          return Buffer.from(content).toString('utf8');
        } catch {
          return null;
        }
      }
    });
    this.asmdefGate = new AsmdefGate();
    this.coordinatorClient = new CoordinatorClient();
    const sectorConfig = this._shipImpl.loadSectorConfig(workspaceDir);
    if (sectorConfig) {
      initSectorManager(sectorConfig);
    }
    this.sectorManager = getSectorManager();
    this.contextGatherer = getContextGatherer();
    this.unityMcpClient = getUnityMCPClient('http://localhost:8080/mcp');
    this.coplayClient = getCoplayClient();
    this.coplayClient.setMCPManager(mcpManager);

    // Initialize workflow storage
    this._workflowsImpl.initializeStorage(context);

    // Initialize unified settings file
    SettingsFileService.getInstance().initialize(context);

    // Set up workflow engine event handlers
    this.workflowEngine.on('workflowEvent', (event) => {
      // Forward to webview for workflow UI
      this._panel.webview.postMessage({
        type: 'workflowEvent',
        event
      });

      // Also emit AI Flow visualization events for workflows
      this._handleWorkflowFlowVisualization(event);
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

    // Explorer context integration (Phase 11) — pushes active file/selection/symbols to webview
    this._disposables.push(...setupExplorerIntegration(this));

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
      // Sound is played from chatImpl.ts where single-chat completion actually happens.
      // This orchestrator event only fires for mastermind modes (debate/collaborate/code-review).
      SoundService.getInstance().play('aiComplete');
    });

    this.orchestrator.on('summary', (data: any) => {
      this._postMessage({ type: 'summary', content: data.content, chatId: this._currentChatId });
    });

    this.orchestrator.on('compacted', (data: any) => {
      this._postMessage({ type: 'compacted', ...data, chatId: this._currentChatId });
    });

    this.orchestrator.on('error', (error: any) => {
      this._postMessage({ type: 'error', error, chatId: this._currentChatId });
      SoundService.getInstance().play('aiError');
    });

    // Set context for keybindings
    vscode.commands.executeCommand('setContext', 'spacecode.panelFocused', true);
  }

  /**
   * Save chat state to globalState
   */
  private _saveChatState(state: ChatState): void {
    console.log('[SpaceCode] Saving chat state, activeTabId:', state.activeTabId, 'tabs:', state.tabs?.map(t => t.id));
    this._context.globalState.update(MainPanel.CHAT_STATE_KEY, state);
  }

  /**
   * Load and send saved chat state to webview
   */
  private _sendSavedChatState(): void {
    const savedState = this._context.globalState.get<ChatState>(MainPanel.CHAT_STATE_KEY);
    console.log('[SpaceCode] Restoring chat state, activeTabId:', savedState?.activeTabId, 'tabs:', savedState?.tabs?.map(t => t.id));
    if (savedState && savedState.tabs && savedState.tabs.length > 0) {
      this._postMessage({ type: 'restoreChatState', state: savedState });
    }
  }

  private _postMessage(message: any): void {
    this._panel.webview.postMessage(message);
  }

  // ============================================
  // Public API for handler modules
  // ============================================

  /** Post a message to the webview */
  public postMessage(message: any): void {
    this._postMessage(message);
  }

  /** Handle Unity cockpit commands */
  public async handleUnityCommand(command: string): Promise<void> {
    // Delegate to the private implementation in the switch statement
    // This is the public wrapper that handlers call
    const message = { type: 'unityCommand', command };
    // Call the inner switch case logic directly
    return this._handleUnityCommandInternal(command);
  }

  /** Check Unity MCP availability */
  public async checkUnityMCPAvailable(retryCount: number = 0, token?: number): Promise<void> {
    return this._checkUnityMCPAvailable(retryCount, token);
  }

  /** Reload Unity */
  public async reloadUnity(): Promise<void> {
    return this._reloadUnity();
  }

  /** Toggle Unity play mode */
  public async unityTogglePlay(): Promise<void> {
    return this._unityTogglePlay();
  }

  /** Toggle Unity pause */
  public async unityTogglePause(): Promise<void> {
    return this._unityTogglePause();
  }

  /** CodeSensei: Explain file */
  public async senseiExplain(filePath: string, selection?: string): Promise<void> {
    return this._senseiExplain(filePath, selection);
  }

  /** CodeSensei: Context brief */
  public async senseiContextBrief(filePath: string): Promise<void> {
    return this._senseiContextBrief(filePath);
  }

  /** CodeSensei: Assembly graph */
  public async senseiAssemblyGraph(assemblyName?: string): Promise<void> {
    return this._senseiAssemblyGraph(assemblyName);
  }

  /** CodeSensei: Sync docs */
  public async senseiSyncDocs(filePath?: string, sectorId?: string): Promise<void> {
    return this._senseiSyncDocs(filePath, sectorId);
  }

  /** CodeSensei: AI review */
  public async senseiAIReview(filePath?: string, diff?: string): Promise<void> {
    return this._senseiAIReview(filePath, diff);
  }

  // ============================================
  // End of Public API
  // ============================================

  private _loadJobs(): AutoexecuteJob[] {
    return this._autoexecuteImpl.loadJobs();
  }

  private _saveJobs(jobs: AutoexecuteJob[]): void {
    this._autoexecuteImpl.saveJobs(jobs);
  }

  private _enqueueJob(job: Omit<AutoexecuteJob, 'created' | 'status'>, status: AutoexecuteJob['status'] = 'pending'): AutoexecuteJob {
    return this._autoexecuteImpl.enqueueJob(job, status);
  }

  private _updateJobStatus(jobId: string, status: AutoexecuteJob['status']): void {
    this._autoexecuteImpl.updateJobStatus(jobId, status);
  }

  private _postJobList(): void {
    this._autoexecuteImpl.postJobList();
  }

  private _requireDocTarget(action: string): boolean {
    return this._shipImpl.requireDocTarget(action);
  }

  private async _runApprovedJob(jobId: string): Promise<void> {
    return this._autoexecuteImpl.runApprovedJob(jobId);
  }

  private _removeJob(jobId: string): void {
    this._autoexecuteImpl.removeJob(jobId);
  }


  /** Run gates check - validates sector rules */
  private async _runGatesCheck(): Promise<void> {
    return this._autoexecuteImpl.runGatesCheck();
  }

  /** Check docs status for affected sectors */
  private async _checkDocsStatus(): Promise<void> {
    return this._autoexecuteImpl.checkDocsStatus();
  }
  private _requireAutoexecute(
    action: string,
    actionKey: AutoexecuteJob['actionKey'],
    payload: any,
    options: { skipDocGate?: boolean } = {}
  ): boolean {
    return this._shipImpl.requireAutoexecute(action, actionKey, payload, options);
  }

  private _sendDocTargets(): void {
    this._docsImpl.sendDocTargets();
  }

  private async _openDocFile(docTarget: string): Promise<void> {
    await this._docsImpl.openDocFile(docTarget);
  }

  private async _openFile(absolutePath: string): Promise<void> {
    if (!absolutePath || !fs.existsSync(absolutePath)) {
      vscode.window.showWarningMessage(`File not found: ${absolutePath}`);
      return;
    }
    const doc = await vscode.workspace.openTextDocument(absolutePath);
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
  }

  private _postCoordinatorSync(): void {
    this._postMessage({
      type: 'coordinatorSync',
      sync: {
        policy: this._coordinatorSync.policy,
        inventory: this._coordinatorSync.inventory,
        graph: this._coordinatorSync.graph
      },
      status: {
        policy: this._coordinatorSyncStatus.policy,
        inventory: this._coordinatorSyncStatus.inventory,
        graph: this._coordinatorSyncStatus.graph
      }
    });
  }

  private _sendDocInfo(docTarget: string): void {
    this._docsImpl.sendDocInfo(docTarget);
  }

  // --- Unity MCP Integration ---
  private _unityIsPlaying: boolean = false;
  private _unityIsPaused: boolean = false;

  /**
   * Refresh Unity tab status (editor state + console).
   * NOTE: This does NOT update the header connection dot - that's only set by _checkUnityMCPAvailable()
   */
  private async _refreshUnityStatus(): Promise<void> {
    return this._unityImpl.refreshUnityStatus();
  }

  private async _getUnityEditorState(): Promise<any> {
    return this._unityImpl.getUnityEditorState();
  }

  private async _getUnityConsole(): Promise<any[]> {
    return this._unityImpl.getUnityConsole();
  }

  private async _unityTogglePlay(): Promise<void> {
    return this._unityImpl.unityTogglePlay();
  }

  private async _unityTogglePause(): Promise<void> {
    return this._unityImpl.unityTogglePause();
  }

  /**
   * Reload Unity - sends refresh_unity command to Unity to apply code changes
   * This is different from _refreshUnityStatus which just pulls data
   */
  private async _reloadUnity(): Promise<void> {
    return this._unityImpl.reloadUnity();
  }

  /**
   * Internal handler for Unity cockpit commands
   * Called by the public handleUnityCommand wrapper
   */
  private async _handleUnityCommandInternal(cmd: string): Promise<void> {
    return this._unityImpl.handleUnityCommandInternal(cmd);
  }

  // --- VER-1: Diff Scanner ---
  private async _scanGitDiff(): Promise<void> {
    return this._verificationImpl.scanGitDiff();
  }

  // --- VER-4: Regression Tests ---
  private async _runRegressionTests(): Promise<void> {
    return this._verificationImpl.runRegressionTests();
  }

  // --- VER-2: Plan Comparison ---

  public setCurrentPlan(plan: { expectedFiles: string[] }) {
    this._verificationImpl.setCurrentPlan(plan);
  }

  private async _comparePlanToFiles(diffFiles: string[]): Promise<void> {
    return this._verificationImpl.comparePlanToFiles(diffFiles);
  }

  // --- VER-2b: Plan Generation + Storage ---
  private async _sendPlanTemplates(): Promise<void> {
    return this._plansImpl.sendPlanTemplates();
  }

  private async _sendPlanList(): Promise<void> {
    return this._plansImpl.sendPlanList();
  }

  private async _sendPlanById(planId: string): Promise<void> {
    return this._plansImpl.sendPlanById(planId);
  }

  private async _deletePlan(planId: string): Promise<void> {
    return this._plansImpl.deletePlan(planId);
  }

  private async _savePlan(plan: Plan, action: 'created' | 'approved' | 'executed' | 'verified' | 'failed' | 'cancelled' = 'created'): Promise<void> {
    return this._plansImpl.savePlan(plan, action);
  }

  private async _usePlanForComparison(planId: string): Promise<void> {
    return this._plansImpl.usePlanForComparison(planId);
  }

  // --- Ticket Methods ---
  private async _sendTicketList(): Promise<void> {
    return this._ticketsImpl.sendTicketList();
  }

  private async _createTicket(title: string, description: string, sectorId: string, linkedPlanId?: string): Promise<void> {
    return this._ticketsImpl.createTicket(title, description, sectorId, linkedPlanId);
  }

  private async _updateTicketStatus(ticketId: string, status: TicketStatus): Promise<void> {
    return this._ticketsImpl.updateTicketStatus(ticketId, status);
  }

  private async _linkTicketToPlan(ticketId: string, planId: string): Promise<void> {
    return this._ticketsImpl.linkTicketToPlan(ticketId, planId);
  }

  private async _deleteTicket(ticketId: string): Promise<void> {
    return this._ticketsImpl.deleteTicket(ticketId);
  }

  private async _generatePlanFromIntent(
    intent: string,
    providerId: 'claude' | 'gpt',
    templateId?: string,
    templateVariables?: Record<string, string>
  ): Promise<void> {
    return this._plansImpl.generatePlanFromIntent(intent, providerId, templateId, templateVariables);
  }

  // --- VER-5: AI Review ---
  private async _runAIReview(diff: string): Promise<void> {
    return this._plansImpl.runAIReview(diff);
  }

  private _scheduleContextPreviewSend(): void {
    this._shipImpl.scheduleContextPreviewSend();
  }

  private _buildContextPreviewText(): string {
    return this._shipImpl.buildContextPreviewText();
  }

  private _loadSectorConfig(workspaceDir: string): SectorConfig | null {
    return this._shipImpl.loadSectorConfig(workspaceDir);
  }

  private async _sendContextPreview(): Promise<void> {
    return this._shipImpl.sendContextPreview();
  }

  private async _handleMessage(message: any): Promise<void> {
    return handleMainPanelMessage(this, message);
  }

  /**
   * Handle side chat messages - simple independent conversations
   */
  private async _sendCliStatus(): Promise<void> {
    return this._cliImpl.sendCliStatus();
  }

  private async _installCli(cli: 'claude' | 'codex'): Promise<void> {
    return this._cliImpl.installCli(cli);
  }

  private async _openTerminalForLogin(cli: 'claude' | 'codex'): Promise<void> {
    return this._cliImpl.openTerminalForLogin(cli);
  }

  private async _handleSideChatMessage(chatIndex: number, userMessage: string): Promise<void> {
    await this._chatImpl.handleSideChatMessage(chatIndex, userMessage);
  }

  private async _handleSendMessage(message: any): Promise<void> {
    await this._chatImpl.handleSendMessage(message);
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
    await this._chatImpl.startMastermindConversation(config);
  }

  // Model toolbar handlers
  private _chatMode: string = 'mastermind';
  private _currentModel: string = 'claude-sonnet-4-20250514';
  private _reasoningLevel: string | null = null; // 'medium' | 'high' | null
  private _consultantModel: string = 'gpt-4o'; // Model for "Get GPT Opinion"
  private _currentWorkflow: AgentWorkflow | null = null; // Track executing workflow for visualization

  private _setChatMode(mode: string): void {
    this._chatMode = mode;
    logger.log('ui', `Chat mode set to: ${mode}`);
  }

  /**
   * Handle request for GPT's second opinion on Claude's response
   */
  private async _handleGetGptOpinion(message: { userQuestion: string; claudeResponse: string; chatHistory?: Array<{ role: string; content: string }> }): Promise<void> {
    const { userQuestion, claudeResponse, chatHistory } = message;

    if (!claudeResponse) {
      this._postMessage({
        type: 'gptOpinionResponse',
        response: 'No Claude response to review.',
      });
      return;
    }

    try {
      // === Flow Visualization: Show GPT consultation ===
      // Add Claude's response as context being sent to GPT
      this._postMessage({
        type: 'aiFlowChunk',
        chunk: {
          id: 'claude-response',
          source: 'memory',  // Pink - represents Claude's prior response
          label: 'Claude Response',
          tokens: Math.ceil(claudeResponse.length / 4),
          similarity: 1.0,
          content: claudeResponse.substring(0, 200) + '...'
        }
      });

      // Show GPT is being consulted
      const consultantModelLabel = this._consultantModel.replace('gpt-', 'GPT-').replace('o1-', 'o1-');
      this._postMessage({
        type: 'aiFlowChunk',
        chunk: {
          id: 'gpt-consult',
          source: 'rules',  // Orange - represents external AI consultation
          label: `🤖 ${consultantModelLabel}`,
          tokens: 0,
          similarity: 0.9,
          content: `Requesting second opinion from ${consultantModelLabel}...`
        }
      });

      this._postMessage({ type: 'aiFlowThinking', stage: `${consultantModelLabel} analyzing...`, provider: 'gpt' });

      const historyText = Array.isArray(chatHistory) && chatHistory.length
        ? `Conversation so far (most recent last):\n${chatHistory.map((m) => {
            const label = m.role === 'user' ? 'User' : m.role === 'claude' ? 'Claude' : m.role === 'gpt' ? 'GPT' : m.role === 'summary' ? 'Summary' : 'System';
            return `${label}: ${m.content}`;
          }).join('\n')}\n\n`
        : '';

      const prompt = `${historyText}The user asked: "${userQuestion}"\n\nClaude's response:\n${claudeResponse}\n\nPlease provide your second opinion or additional insights on Claude's response. Be concise. If you agree, say so briefly. If you have different perspectives or important additions, share them. Base your response on the provided conversation context; if something is missing, say so explicitly.`;

      // Use the selected consultant model
      const gptProvider = this.orchestrator.getGptProvider();
      let originalModel: string | undefined;
      if (gptProvider && 'setModel' in gptProvider && 'getModel' in gptProvider) {
        originalModel = (gptProvider as any).getModel();
        (gptProvider as any).setModel(this._consultantModel);
      }

      const gptResponse = await this.orchestrator.askSingle('gpt', prompt, undefined, [], undefined);

      // Restore original model if we changed it
      if (gptProvider && originalModel && 'setModel' in gptProvider) {
        (gptProvider as any).setModel(originalModel);
      }

      await this.costTracker.recordUsage(
        'gpt',
        gptResponse.model,
        gptResponse.tokens,
        gptResponse.cost,
        'consult'
      );

      // Show GPT response in flow
      this._postMessage({
        type: 'aiFlowComplete',
        tokens: gptResponse.tokens
      });

      this._postMessage({
        type: 'gptOpinionResponse',
        response: gptResponse.content,
      });
    } catch (error) {
      this._postMessage({
        type: 'aiFlowComplete',
        error: true
      });
      this._postMessage({
        type: 'gptOpinionResponse',
        response: `Error getting GPT opinion: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }

  /**
   * Auto-consult GPT after Claude responds (when gptConsult toggle is on).
   * Uses sendMessage (non-streaming) to avoid polluting the chat with GPT tokens.
   * GPT decides whether to contribute — if the topic is trivial, it stays silent.
   */
  private async _autoConsultGpt(userQuestion: string, claudeResponse: string, history: Array<{ role: string; content: string }>, chatId?: string, interventionLevel: string = 'balanced'): Promise<void> {
    try {
      const gptProvider = this.orchestrator.getGptProvider();
      if (!gptProvider || !gptProvider.isConfigured) {
        console.warn('[SpaceCode] GPT provider not configured, skipping auto-consultation');
        return;
      }

      // Build condensed history (last few exchanges)
      const recentHistory = history.slice(-6);
      const historyText = recentHistory.length
        ? `Recent conversation:\n${recentHistory.map((m) => {
            const label = m.role === 'user' ? 'User' : m.role === 'claude' ? 'Claude' : m.role === 'gpt' ? 'GPT' : 'System';
            const truncated = m.content.length > 600 ? m.content.slice(0, 600) + '...' : m.content;
            return `${label}: ${truncated}`;
          }).join('\n')}\n\n`
        : '';

      // Intervention level prompts
      const interventionPrompts: Record<string, string> = {
        silent: `You are a peer reviewer for another AI (Claude). Claude has already responded to the user. You ONLY flag clear factual errors or dangerous/incorrect code.

RULES:
- If Claude's answer has no clear errors, respond with EXACTLY: "[NO_INPUT]"
- Only flag genuine mistakes, bugs, or security issues
- Be concise: state what's wrong and what the correct answer is
- Do NOT add "nice to know" extras`,

        balanced: `You are a peer reviewer for another AI (Claude). Claude has already responded to the user. Your job is to catch errors, add missing context, or flag important nuances that Claude missed.

RULES:
- If the question is trivial (greetings, simple lookups) respond with EXACTLY: "[NO_INPUT]"
- For technical/coding/architecture topics — flag errors, add gotchas, mention alternatives Claude missed, or note important caveats
- Be concise: 2-4 sentences of actionable feedback
- Do NOT repeat what Claude said — only add what's missing or wrong`,

        active: `You are a peer reviewer for another AI (Claude). Claude has already responded to the user. You ALWAYS provide feedback — corrections, additions, alternative perspectives, or nuances.

RULES:
- Always provide your review — point out errors, add context, suggest alternatives, note trade-offs
- If Claude was correct, still add nuance, caveats, or a different angle
- Be concise: 2-5 sentences of actionable feedback
- Do NOT just say "Claude is right" — add substance
- Only respond with "[NO_INPUT]" for pure greetings like "hi" or "hello"`
      };

      const systemPrompt = interventionPrompts[interventionLevel] || interventionPrompts.balanced;

      const userPrompt = `${historyText}User's question: "${userQuestion}"

Claude's response:
${claudeResponse}

Your review?`;

      console.log('[SpaceCode] Auto GPT consultation starting...');
      console.log(`[SpaceCode] User question: "${userQuestion.substring(0, 100)}"`);
      console.log(`[SpaceCode] Claude response length: ${claudeResponse.length} chars`);

      // Add GPT consultation as an AI processor node (same style as Claude Processing)
      const consultantModelLabel = this._consultantModel.replace('gpt-', 'GPT-').replace('o1-', 'o1-');
      this._postMessage({
        type: 'aiFlowThinking',
        stage: `${consultantModelLabel} reviewing...`,
        provider: 'gpt',
        nodeId: 'gpt-consult'
      });

      // Switch to consultant model
      let originalModel: string | undefined;
      if ('setModel' in gptProvider && 'getModel' in gptProvider) {
        originalModel = (gptProvider as any).getModel();
        (gptProvider as any).setModel(this._consultantModel);
      }

      console.log(`[SpaceCode] Calling GPT (${this._consultantModel}) via sendMessage (non-streaming)...`);

      // Step 1: GPT reviews Claude's response (non-streaming)
      const gptResponse = await gptProvider.sendMessage(
        [{ role: 'user', content: userPrompt }],
        systemPrompt
      );

      // Restore original model
      if (originalModel && 'setModel' in gptProvider) {
        (gptProvider as any).setModel(originalModel);
      }

      console.log(`[SpaceCode] GPT response: "${(gptResponse.content || '').substring(0, 200)}"`);

      await this.costTracker.recordUsage(
        'gpt',
        gptResponse.model,
        gptResponse.tokens,
        gptResponse.cost,
        'consult'
      );

      const gptFeedback = (gptResponse.content || '').trim();

      // Step 2: If GPT has feedback, feed it back to Claude for a refined answer
      if (gptFeedback && !gptFeedback.includes('[NO_INPUT]')) {
        console.log('[SpaceCode] GPT has feedback — sending back to Claude for refinement');

        // Add Claude Refining as an AI processor node (same style as Claude Processing)
        this._postMessage({
          type: 'aiFlowThinking',
          stage: 'Claude refining with feedback...',
          provider: 'claude',
          nodeId: 'claude-refine'
        });

        // Get Claude provider for the refinement pass
        const claudeProvider = this.orchestrator.getClaudeProvider();
        if (claudeProvider && claudeProvider.isConfigured) {
          const refineSystemPrompt = `You are Claude. You previously answered a user's question. A peer AI (GPT) has reviewed your answer and provided feedback. Incorporate the feedback into a refined, improved answer.

RULES:
- If the feedback points out an error, correct it
- If the feedback adds useful context, incorporate it naturally
- If the feedback is wrong or unhelpful, ignore it and say so briefly
- Write a complete refined answer (not just the delta) — the user will see this as your updated response
- Be concise and direct. Do not mention "GPT" or "peer review" — just give the improved answer
- If your original answer was fine and the feedback adds nothing, respond with EXACTLY: "[NO_CHANGE]"`;

          const refinePrompt = `User's question: "${userQuestion}"

Your previous answer:
${claudeResponse}

Peer feedback:
${gptFeedback}

Write your refined answer:`;

          console.log('[SpaceCode] Calling Claude for refinement pass...');

          // Use Claude's sendMessage (non-streaming) for the refinement
          const refinedResponse = await claudeProvider.sendMessage(
            [{ role: 'user', content: refinePrompt }],
            refineSystemPrompt
          );

          await this.costTracker.recordUsage(
            'claude',
            refinedResponse.model,
            refinedResponse.tokens,
            refinedResponse.cost,
            'consult-refine'
          );

          const refined = (refinedResponse.content || '').trim();
          console.log(`[SpaceCode] Claude refined response: "${refined.substring(0, 200)}"`);

          if (refined && !refined.includes('[NO_CHANGE]')) {
            // Show the refined answer in chat
            this._postMessage({
              type: 'gptConsultRefined',
              response: refined,
              gptFeedback: gptFeedback,
              chatId,
            });
          } else {
            // Claude's original answer stands — GPT feedback was not useful
            console.log('[SpaceCode] Claude says no change needed');
            this._postMessage({
              type: 'gptConsultComplete',
              hadInput: true,
              chatId,
            });
          }
        } else {
          // Claude provider unavailable for refinement — show GPT feedback directly as fallback
          console.warn('[SpaceCode] Claude provider unavailable for refinement, showing GPT feedback directly');
          this._postMessage({
            type: 'gptConsultRefined',
            response: gptFeedback,
            gptFeedback: gptFeedback,
            chatId,
          });
        }
      } else {
        console.log('[SpaceCode] GPT has no additional input — staying silent');
        this._postMessage({
          type: 'gptConsultComplete',
          hadInput: false,
          chatId,
        });
      }

      this._postMessage({ type: 'aiFlowComplete' });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.warn('[SpaceCode] Auto GPT consultation failed:', errMsg);
      this._postMessage({
        type: 'gptConsultComplete',
        hadInput: false,
        error: errMsg,
        chatId,
      });
      this._postMessage({ type: 'aiFlowComplete', error: true });
    }
  }

  private async _setModel(model: string): Promise<void> {
    this._currentModel = model;
    logger.log('ui', `Model set to: ${model}`);

    // Update VS Code config so providers pick up the change
    const config = vscode.workspace.getConfiguration('spacecode');
    if (model.startsWith('claude-')) {
      await config.update('claudeModel', model, vscode.ConfigurationTarget.Global);
      // Also update the provider directly
      const claudeProvider = this.orchestrator.getClaudeProvider();
      if (claudeProvider && 'setModel' in claudeProvider) {
        (claudeProvider as any).setModel(model);
        logger.log('ui', `Claude provider model set to: ${model}`);
      }
    } else if (model.startsWith('gpt-') || model.startsWith('o1') || model.startsWith('o3')) {
      await config.update('gptModel', model, vscode.ConfigurationTarget.Global);
      // Also update the provider directly
      const gptProvider = this.orchestrator.getGptProvider();
      if (gptProvider && 'setModel' in gptProvider) {
        (gptProvider as any).setModel(model);
        logger.log('ui', `GPT provider model set to: ${model}`);
      }
    }
  }

  private async _setReasoning(levelOrEnabled: string | boolean): Promise<void> {
    // Handle both legacy boolean and new level format
    if (typeof levelOrEnabled === 'boolean') {
      this._reasoningLevel = levelOrEnabled ? 'medium' : null;
    } else {
      this._reasoningLevel = levelOrEnabled; // 'medium' | 'high'
    }
    logger.log('ui', `Reasoning level set to: ${this._reasoningLevel || 'off'}`);

    // Update VS Code config for extended thinking
    const config = vscode.workspace.getConfiguration('spacecode');
    await config.update('extendedThinking', this._reasoningLevel !== null, vscode.ConfigurationTarget.Global);
    if (this._reasoningLevel) {
      await config.update('thinkingBudget', this._reasoningLevel === 'high' ? 'high' : 'medium', vscode.ConfigurationTarget.Global);
    }
  }

  // Station map action handler
  private async _handleStationAction(action: string, sceneId?: string): Promise<void> {
    return this._shipImpl.handleStationAction(action, sceneId);
  }

  // Whisper binary download
  private async _downloadWhisperBinary(): Promise<void> {
    return this._miscImpl.downloadWhisperBinary();
  }

  // Log-related methods
  private _showLogChannel(channel: LogChannel): void {
    this._miscImpl.showLogChannel(channel);
  }

  private _clearAllLogs(): void {
    this._miscImpl.clearAllLogs();
  }

  private _openTerminal(): void {
    this._miscImpl.openTerminal();
  }

  private _openPricingUrl(provider?: string): void {
    this._miscImpl.openPricingUrl(provider);
  }

  // Workflow-related methods
  private _sendWorkflows(): void {
    this._workflowsImpl.sendWorkflows();
  }

  private async _saveWorkflow(workflowData: Partial<AgentWorkflow>, drawflowData?: DrawflowExport): Promise<void> {
    return this._workflowsImpl.saveWorkflow(workflowData, drawflowData);
  }

  private async _deleteWorkflow(workflowId: string): Promise<void> {
    return this._workflowsImpl.deleteWorkflow(workflowId);
  }

  private async _executeWorkflow(workflowId: string, input: string, drawflowData?: DrawflowExport): Promise<void> {
    return this._workflowsImpl.executeWorkflow(workflowId, input, drawflowData);
  }

  /**
   * Handle workflow events for AI Flow visualization
   */
  private _handleWorkflowFlowVisualization(event: WorkflowEvent): void {
    this._workflowsImpl.handleWorkflowFlowVisualization(event);
  }

  /**
   * Execute a plan from an approved job
   */
  private async _executePlanFromJob(planId: string): Promise<void> {
    return this._verificationImpl.executePlanFromJob(planId);
  }

  private _awaitPlanStepApproval(): Promise<boolean> {
    return new Promise((resolve) => {
      this._pendingStepApproval = { resolve };
    });
  }

  /**
   * Execute a plan step-by-step (manual approvals per step)
   */
  private async _executePlanStepByStep(planId: string): Promise<void> {
    return this._verificationImpl.executePlanStepByStep(planId);
  }

  // CodeSensei MCP Integration methods (INT-2)
  /**
   * Check Unity MCP connection and sync ALL status indicators:
   * - Header dot (unityMCPAvailable)
   * - MCP settings (server status)
   * - Unity tab (unityStatus)
   */
  private async _checkUnityMCPAvailable(retryCount: number = 0, token?: number): Promise<void> {
    return this._unityImpl.checkUnityMCPAvailable(retryCount, token);
  }

  private async _senseiExplain(filePath: string, selection?: string): Promise<void> {
    return this._senseiImpl.senseiExplain(filePath, selection);
  }

  private async _senseiContextBrief(filePath: string): Promise<void> {
    return this._senseiImpl.senseiContextBrief(filePath);
  }

  private async _senseiAssemblyGraph(assemblyName?: string): Promise<void> {
    return this._senseiImpl.senseiAssemblyGraph(assemblyName);
  }

  private async _senseiSyncDocs(filePath?: string, sectorId?: string): Promise<void> {
    return this._senseiImpl.senseiSyncDocs(filePath, sectorId);
  }

  private async _senseiAIReview(filePath?: string, diff?: string): Promise<void> {
    return this._senseiImpl.senseiAIReview(filePath, diff);
  }

  // GitHub Integration methods
  private async _checkGitHubAvailable(): Promise<void> {
    return this._githubImpl.checkGitHubAvailable();
  }

  private async _createGitHubIssue(
    title: string,
    body: string,
    labels?: string[],
    planId?: string
  ): Promise<void> {
    return this._githubImpl.createGitHubIssue(title, body, labels, planId);
  }

  private async _createGitHubPR(
    title: string,
    body: string,
    head: string,
    base?: string,
    planId?: string
  ): Promise<void> {
    return this._githubImpl.createGitHubPR(title, body, head, base, planId);
  }

  private async _listGitHubIssues(
    state?: 'open' | 'closed' | 'all',
    labels?: string[],
    limit?: number
  ): Promise<void> {
    return this._githubImpl.listGitHubIssues(state, labels, limit);
  }

  private async _listGitHubPRs(
    state?: 'open' | 'closed' | 'merged' | 'all'
  ): Promise<void> {
    return this._githubImpl.listGitHubPRs(state);
  }

  // --- Planning Session Methods ---
  private _startPlanningSession(feature: string, description: string): void {
    this._planningImpl.startPlanningSession(feature, description);
  }

  private _advancePlanPhase(): void {
    this._planningImpl.advancePlanPhase();
  }

  private _skipToPlanPhase(targetPhase: string): void {
    this._planningImpl.skipToPlanPhase(targetPhase);
  }

  private _cancelPlanningSession(): void {
    this._planningImpl.cancelPlanningSession();
  }

  private _completePlanningSession(): void {
    this._planningImpl.completePlanningSession();
  }

  private _updatePlanningChecklist(index: number, completed: boolean): void {
    this._planningImpl.updatePlanningChecklist(index, completed);
  }

  private _passPlanningGate(gateId: string): void {
    this._planningImpl.passPlanningGate(gateId);
  }

  private async _generatePlanFromSession(): Promise<void> {
    return this._planningImpl.generatePlanFromSession();
  }

  // Plan Comparison (VER-2)
  private async _comparePlanToDiff(planId: string, diffResult?: DiffScanResult): Promise<void> {
    return this._verificationImpl.comparePlanToDiff(planId, diffResult);
  }

  // --- Git Operations Implementation ---
  private async _getGitStatus(): Promise<void> {
    return this._gitImpl.getGitStatus();
  }

  private async _gitStageFiles(files?: string[]): Promise<void> {
    return this._gitImpl.stageFiles(files);
  }

  private async _gitCommit(message: string, files?: string[]): Promise<void> {
    return this._gitImpl.commit(message, files);
  }

  private async _gitCreateBranch(name: string, checkout: boolean = true): Promise<void> {
    return this._gitImpl.createBranch(name, checkout);
  }

  private async _gitCheckout(ref: string): Promise<void> {
    return this._gitImpl.checkout(ref);
  }

  private async _gitPush(remote: string = 'origin', branch?: string, setUpstream: boolean = false): Promise<void> {
    return this._gitImpl.push(remote, branch, setUpstream);
  }

  private async _gitPull(remote: string = 'origin', branch?: string): Promise<void> {
    return this._gitImpl.pull(remote, branch);
  }

  private async _getRecentCommits(count: number = 10): Promise<void> {
    return this._gitImpl.getRecentCommits(count);
  }
  private async _importWorkflow(): Promise<void> {
    return this._workflowsImpl.importWorkflow();
  }

  private async _exportWorkflow(workflowId: string): Promise<void> {
    return this._workflowsImpl.exportWorkflow(workflowId);
  }

  // Voice-related methods
  private _sendVoiceSettings(): void {
    this._voiceImpl.sendVoiceSettings();
  }

  private async _saveVoiceSettings(settings: any): Promise<void> {
    return this._voiceImpl.saveVoiceSettings(settings);
  }

  private async _downloadVoiceModel(engine: 'whisper' | 'vosk' | 'piper', model?: string): Promise<void> {
    return this._voiceImpl.downloadVoiceModel(engine, model);
  }

  private _startMicTest(): void {
    this._voiceImpl.startMicTest();
  }

  private _stopMicTest(): void {
    this._voiceImpl.stopMicTest();
  }

  private _testSpeaker(): void {
    this._voiceImpl.testSpeaker();
  }

  private async _sendSettings(): Promise<void> {
    return this._settingsImpl.sendSettings();
  }

  private _sendPricing(): void {
    this._settingsImpl.sendPricing();
  }

  private async _saveConnectionMethods(claudeMethod?: string, gptMethod?: string): Promise<void> {
    return this._settingsImpl.saveConnectionMethods(claudeMethod, gptMethod);
  }

  private async _saveMastermindSettings(maxTurns?: number, responseStyle?: string, autoSummarize?: boolean): Promise<void> {
    return this._settingsImpl.saveMastermindSettings(maxTurns, responseStyle, autoSummarize);
  }

  private async _saveApiKeys(claudeKey?: string, openaiKey?: string): Promise<void> {
    return this._settingsImpl.saveApiKeys(claudeKey, openaiKey);
  }

  private async _saveGitSettings(settings: { repoUrl?: string; branch?: string; commitMessage?: string; autoPush?: boolean }): Promise<void> {
    return this._settingsImpl.saveGitSettings(settings);
  }

  private async _handleGitAction(settings: { repoUrl: string; branch: string; commitMessage?: string; autoPush: boolean }): Promise<void> {
    return this._settingsImpl.handleGitAction(settings);
  }

  private async _sendMcpServers(): Promise<void> {
    return this._mcpImpl.sendMcpServers();
  }

  private async _addMcpServer(): Promise<void> {
    return this._mcpImpl.addMcpServer();
  }

  private async _handleMcpAction(action: string, serverId: string): Promise<void> {
    return this._mcpImpl.handleMcpAction(action, serverId);
  }

  private async _pingMcpServer(serverId: string): Promise<void> {
    return this._mcpImpl.pingMcpServer(serverId);
  }

  private async _sendKbEntries(): Promise<void> {
    return this._kbImpl.sendKbEntries();
  }

  // Dashboard Panel Handlers
  private async _sendDocsStats(): Promise<void> {
    return this._kbImpl.sendDocsStats();
  }

  private async _sendDbStats(): Promise<void> {
    return this._kbImpl.sendDbStats();
  }

  private async _sendLogs(channel?: LogChannel, limit: number = 100): Promise<void> {
    return this._kbImpl.sendLogs(channel, limit);
  }

  private async _saveDashboardSettings(settings: {
    claudeKey?: string;
    gptKey?: string;
    maxTokens?: number;
    defaultModel?: string;
  }): Promise<void> {
    return this._settingsImpl.saveDashboardSettings(settings);
  }

  private async _addKbUrl(url: string, tags: string[]): Promise<void> {
    return this._kbImpl.addKbUrl(url, tags);
  }

  private async _crawlWebsite(url: string, tags: string[], options: { maxPages?: number; maxDepth?: number }): Promise<void> {
    return this._kbImpl.crawlWebsite(url, tags, options);
  }

  private async _addKbPdf(base64Data: string, fileName: string, tags: string[]): Promise<void> {
    return this._kbImpl.addKbPdf(base64Data, fileName, tags);
  }

  private async _sendEmbedderStatus(): Promise<void> {
    return this._kbImpl.sendEmbedderStatus();
  }

  private async _downloadEmbeddingModel(modelId?: string): Promise<void> {
    return this._kbImpl.downloadEmbeddingModel(modelId);
  }

  private async _setEmbeddingModel(modelId: string): Promise<void> {
    return this._kbImpl.setEmbeddingModel(modelId);
  }

  private async _embedEntry(id: string): Promise<void> {
    return this._kbImpl.embedEntry(id);
  }

  private async _embedAllEntries(): Promise<void> {
    return this._kbImpl.embedAllEntries();
  }

  private async _sendCosts(): Promise<void> {
    return this._settingsImpl.sendCosts();
  }

  /**
   * Reload the entire VS Code window.
   * This is the most reliable way to refresh everything.
   */
  public reload(): void {
    vscode.commands.executeCommand('workbench.action.reloadWindow');
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
    return buildMainPanelHtml(this._panel.webview, this._extensionUri);
  }

}
