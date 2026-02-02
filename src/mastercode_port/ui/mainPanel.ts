/**
 * Main Panel - Full editor webview (like Claude Code / Codex)
 *
 * Opens as an editor tab with chat interface and settings
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConversationOrchestrator, ConversationTurn } from '../orchestrator/conversation';
import { CostTracker } from '../services/costTracker';
import { KnowledgeBaseService } from '../services/knowledgeBase';
import { MCPManager } from '../services/mcpManager';
import { getUnityMCPClient, UnityMCPClient } from '../services/mcpClient';
import { getCoplayClient, CoplayMCPClient } from '../services/coplayClient';
import { VoiceService } from '../services/voiceService';
import { AIProvider } from '../providers/base';
import { cliManager, AllCliStatus } from '../services/cliManager';
import { logger, LogChannel } from '../services/logService';
import { WorkflowEngine } from '../agents/workflowEngine';
import { workflowStorage } from '../agents/workflowStorage';
import { AgentWorkflow, DrawflowExport, AgentNodeConfig, WorkflowEvent } from '../agents/types';
import { PricingService } from '../services/pricingService';
import { getContextGatherer, ContextGatherer, GatheredContext } from '../services/contextGatherer';
import { CoordinatorClient } from '../services/coordinatorClient';
import { HotspotToolPanel } from './hotspotToolPanel';
import { PlanGenerator, PlanStorage, PLAN_TEMPLATES, Plan, PlanGenerationResult } from '../../planning';
import { PlanExecutor, PlanExecutionResult, StepExecutionResult, PhaseExecutionResult } from '../../execution';
import { DiffScanner, PlanComparer, SectorRuleChecker, AsmdefGate, DiffScanResult, PlanComparisonResult } from '../../verification';
import { createGitAdapter, GitAdapter, createGitHubAdapter, GitHubAdapter } from '../../integration';
import { getSectorManager, initSectorManager, SectorConfig, SectorManager } from '../../sectors';
import { TicketStorage, Ticket, TicketStatus } from '../../tickets';
import { getMemoryStats } from '../../memory';

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
  actionKey: 'shipRunGates' | 'shipDocsStatus' | 'mcpAction' | 'executeWorkflow' | 'executePlan';
  payload: any;
  sector: string;
  docTarget: string;
  context: string;
  status: 'pending' | 'approved' | 'rejected' | 'failed';
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
    const sectorConfig = this._loadSectorConfig(workspaceDir);
    if (sectorConfig) {
      initSectorManager(sectorConfig);
    }
    this.sectorManager = getSectorManager();
    this.contextGatherer = getContextGatherer();
    this.unityMcpClient = getUnityMCPClient('http://localhost:8080/mcp');
    this.coplayClient = getCoplayClient();
    this.coplayClient.setMCPManager(mcpManager);

    // Initialize workflow storage
    workflowStorage.initialize(context);

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

  private _requireDocTarget(action: string): boolean {
    if (this._shipProfile !== 'yard' && !this._docTarget) {
      this._postMessage({
        type: 'autoexecuteBlocked',
        message: `${action} requires a docs target when not in Yard.`
      });
      this._postMessage({
        type: 'status',
        status: { message: 'Select a docs file before proceeding outside Yard.' }
      });
      return false;
    }
    return true;
  }

  private async _runApprovedJob(jobId: string): Promise<void> {
    const jobs = this._loadJobs();
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;
    try {
      switch (job.actionKey) {
        case 'shipRunGates':
          await this._runGatesCheck();
          break;
        case 'shipDocsStatus':
          await this._checkDocsStatus();
          break;
        case 'mcpAction':
          await this._handleMcpAction(job.payload?.action, job.payload?.serverId);
          break;
        case 'executeWorkflow':
          await this._executeWorkflow(job.payload?.workflowId, job.payload?.input, job.payload?.drawflowData);
          break;
        case 'executePlan':
          await this._executePlanFromJob(job.payload?.planId);
          break;
        default:
          throw new Error('Unknown actionKey ' + String(job.actionKey));
      }
      // Remove job after successful execution
      this._removeJob(jobId);
    } catch (err: any) {
      this._updateJobStatus(jobId, 'failed');
      this._postMessage({
        type: 'autoexecuteBlocked',
        message: `Approved job failed: ${err?.message || err}`
      });
    }
  }

  private _removeJob(jobId: string): void {
    const jobs = this._loadJobs().filter(job => job.id !== jobId);
    this._saveJobs(jobs);
    this._postMessage({ type: 'autoexecuteJobs', jobs });
  }


  /** Run gates check - validates sector rules */
  private async _runGatesCheck(): Promise<void> {
    try {
      let diffResult = await this.diffScanner.scanAll();
      // Filter out noise (node_modules, etc) and limit for performance
      const excludePatterns = [/node_modules/, /\.git\//, /Library\//, /Temp\//, /obj\//, /bin\//, /\.meta$/];
      const MAX_FILES = 500;
      diffResult = {
        ...diffResult,
        files: diffResult.files
          .filter(f => !excludePatterns.some(p => p.test(f.path)))
          .slice(0, MAX_FILES)
      };
      diffResult.totalFiles = diffResult.files.length;
      if (diffResult.files.length === 0) {
        this._postMessage({ type: 'shipGateResult', ok: true, summary: 'No changes detected (or all filtered).' });
        return;
      }
      const ruleResult = await this.sectorRuleChecker.check(diffResult);
      const asmdefResult = await this.asmdefGate.check();
      const violations = ruleResult.violations || [];
      const warnings = ruleResult.warnings || [];
      const errorCount = violations.filter(v => v.severity === 'error').length;
      const warningCount = violations.filter(v => v.severity === 'warning').length + warnings.length;
      let summary = `Checked ${diffResult.files.length} files in ${ruleResult.sectorsChecked.length} sector(s).\n`;
      if (errorCount > 0) {
        summary += `\n❌ ${errorCount} error(s):\n`;
        violations.filter(v => v.severity === 'error').forEach(v => { summary += `  • ${v.file}: ${v.message}\n`; });
      }
      if (warningCount > 0) {
        summary += `\n⚠️ ${warningCount} warning(s):\n`;
        violations.filter(v => v.severity === 'warning').forEach(v => { summary += `  • ${v.file}: ${v.message}\n`; });
        warnings.forEach(w => { summary += `  • ${w.sectorName}: ${w.message}\n`; });
      }
      if (errorCount === 0 && warningCount === 0) summary += '\n✅ All sector rules passed.';

      if (asmdefResult) {
        summary += `\n\n=== Asmdef Gate ===\n${asmdefResult.summary}`;
      }

      const ok = ruleResult.passed && (asmdefResult?.passed ?? true);
      this._postMessage({
        type: 'shipGateResult',
        ok,
        summary,
        violations,
        warnings,
        sectorsChecked: ruleResult.sectorsChecked,
        asmdefResult
      });
    } catch (err: any) {
      this._postMessage({ type: 'shipGateResult', ok: false, summary: `Gates check failed: ${err?.message || err}` });
    }
  }

  /** Check docs status for affected sectors */
  private async _checkDocsStatus(): Promise<void> {
    try {
      let diffResult = await this.diffScanner.scanAll();
      // Filter out noise for performance
      const excludePatterns = [/node_modules/, /\.git\//, /Library\//, /Temp\//, /obj\//, /bin\//, /\.meta$/];
      diffResult = {
        ...diffResult,
        files: diffResult.files.filter(f => !excludePatterns.some(p => p.test(f.path)))
      };
      const affectedSectors = this.sectorRuleChecker.getAffectedSectors(diffResult);
      const docsNeeded: Array<{ sector: string; docTarget: string }> = [];
      const docsOk: string[] = [];
      const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
      for (const sector of affectedSectors) {
        if (sector.docTarget) {
          const docPath = path.join(workspaceDir, 'Docs', sector.docTarget);
          if (fs.existsSync(docPath)) docsOk.push(sector.name);
          else docsNeeded.push({ sector: sector.name, docTarget: sector.docTarget });
        }
      }
      let summary = `Checked docs for ${affectedSectors.length} affected sector(s).\n`;
      if (docsNeeded.length > 0) {
        summary += `\n📝 Docs needed:\n`;
        docsNeeded.forEach(d => { summary += `  • ${d.sector}: ${d.docTarget}\n`; });
      }
      if (docsOk.length > 0) summary += `\n✅ Docs exist for: ${docsOk.join(', ')}`;
      if (affectedSectors.length === 0) summary = 'No sectors affected by current changes.';
      this._postMessage({ type: 'shipDocsStatus', summary, docsNeeded, docsOk, affectedSectors: affectedSectors.map(s => s.name) });
    } catch (err: any) {
      this._postMessage({ type: 'shipDocsStatus', summary: `Docs check failed: ${err?.message || err}` });
    }
  }
  private _requireAutoexecute(
    action: string,
    actionKey: AutoexecuteJob['actionKey'],
    payload: any,
    options: { skipDocGate?: boolean } = {}
  ): boolean {
    if (!options.skipDocGate && !this._requireDocTarget(action)) return false;
    if (this._autoexecuteEnabled) return true;
    const context = this._contextPreviewText.replace(/\\n{2,}/g, '\\n\\n');
    this._enqueueJob({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      action,
      actionKey,
      payload,
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

  private async _openDocFile(docTarget: string): Promise<void> {
    const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceDir) return;
    const fullPath = path.join(workspaceDir, docTarget);
    if (!fs.existsSync(fullPath)) {
      vscode.window.showWarningMessage(`Doc file not found: ${docTarget}`);
      return;
    }
    const doc = await vscode.workspace.openTextDocument(fullPath);
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
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
    const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceDir) {
      this._postMessage({ type: 'docInfo', info: null });
      return;
    }
    const fullPath = path.join(workspaceDir, docTarget);
    if (!fs.existsSync(fullPath)) {
      this._postMessage({ type: 'docInfo', info: null });
      return;
    }
    try {
      const stat = fs.statSync(fullPath);
      this._postMessage({
        type: 'docInfo',
        info: {
          path: docTarget,
          lastModified: stat.mtime.getTime(),
          size: stat.size
        }
      });
    } catch {
      this._postMessage({ type: 'docInfo', info: null });
    }
  }

  // --- Unity MCP Integration ---
  private _unityIsPlaying: boolean = false;
  private _unityIsPaused: boolean = false;

  /**
   * Refresh Unity tab status (editor state + console).
   * NOTE: This does NOT update the header connection dot - that's only set by _checkUnityMCPAvailable()
   */
  private async _refreshUnityStatus(): Promise<void> {
    try {
      // Get Unity editor state via MCP
      const editorState = await this._getUnityEditorState();
      if (editorState) {
        this._unityIsPlaying = editorState.isPlaying || false;
        this._unityIsPaused = editorState.isPaused || false;
        this._postMessage({
          type: 'unityStatus',
          status: {
            connected: true,
            isPlaying: this._unityIsPlaying,
            isPaused: this._unityIsPaused,
            sceneName: editorState.sceneName || 'Unknown Scene',
            isCompiling: editorState.isCompiling || false
          }
        });
        // Fetch console messages
        const consoleMessages = await this._getUnityConsole();
        this._postMessage({
          type: 'unityConsole',
          messages: consoleMessages
        });
      } else {
        // Couldn't get editor state - update Unity tab but NOT header dot
        this._postMessage({
          type: 'unityStatus',
          status: { connected: false }
        });
      }
    } catch (err) {
      console.error('[Unity Cockpit] Refresh error:', err);
      // Error getting data - update Unity tab but NOT header dot
      this._postMessage({
        type: 'unityStatus',
        status: { connected: false }
      });
    }
  }

  private async _getUnityEditorState(): Promise<any> {
    try {
      // Use Coplay MCP (stdio) instead of legacy Unity MCP (HTTP)
      const result = await this.coplayClient.getEditorState();
      if (result.success && result.data) {
        return result.data;
      }
      return null;
    } catch (err) {
      console.error('[Unity Cockpit] Failed to get editor state:', err);
      return null;
    }
  }

  private async _getUnityConsole(): Promise<any[]> {
    try {
      // Use Coplay MCP (stdio) instead of legacy Unity MCP (HTTP)
      const result = await this.coplayClient.getLogs({ limit: 30 });
      if (result.success && result.data) {
        const data = result.data;
        if (Array.isArray(data)) {
          return data.map((entry: any) => ({
            type: entry.type || 'Log',
            message: entry.message || entry.condition || String(entry)
          }));
        } else if (typeof data === 'string') {
          // If it's a string, wrap in array
          return [{ type: 'Log', message: data }];
        }
      }
      return [];
    } catch (err) {
      console.error('[Unity Cockpit] Failed to get console:', err);
      return [];
    }
  }

  private async _unityTogglePlay(): Promise<void> {
    try {
      // Use Coplay MCP (stdio) instead of legacy Unity MCP (HTTP)
      const result = this._unityIsPlaying
        ? await this.coplayClient.stop()
        : await this.coplayClient.play();
      if (result.success) {
        await this._refreshUnityStatus();
      } else {
        const action = this._unityIsPlaying ? 'stop' : 'play';
        vscode.window.showErrorMessage(`Failed to ${action} Unity: ${result.error}`);
      }
    } catch (err) {
      vscode.window.showErrorMessage('Failed to toggle Unity play mode');
    }
  }

  private async _unityTogglePause(): Promise<void> {
    try {
      // Coplay MCP doesn't have a pause command - show message
      vscode.window.showWarningMessage('Pause is not supported via Coplay MCP. Use Play/Stop instead.');
    } catch (err) {
      vscode.window.showErrorMessage('Failed to toggle Unity pause');
    }
  }

  /**
   * Reload Unity - sends refresh_unity command to Unity to apply code changes
   * This is different from _refreshUnityStatus which just pulls data
   */
  private async _reloadUnity(): Promise<void> {
    try {
      console.log('[Unity Cockpit] _reloadUnity called');
      this._postMessage({ type: 'info', message: 'Refreshing Unity assets...' });

      // Use Coplay MCP (stdio) instead of legacy Unity MCP (HTTP)
      const result = await this.coplayClient.refreshAssets();
      console.log('[Unity Cockpit] refreshAssets result:', JSON.stringify(result));

      if (result.success) {
        console.log('[Unity Cockpit] Reload succeeded, updating status...');
        this._postMessage({ type: 'info', message: 'Unity assets refreshed successfully' });
        // Reload succeeded = connection works. Update ALL status indicators
        console.log('[Unity Cockpit] Sending unityMCPAvailable: true');
        this._postMessage({ type: 'unityMCPAvailable', available: true });
        await this._sendMcpServers();
        // Also refresh the Unity tab data
        await this._refreshUnityStatus();
        console.log('[Unity Cockpit] Status update complete');
      } else {
        // Check if it was a timeout - the refresh likely still worked
        if (result.error?.includes('timed out')) {
          console.log('[Unity Cockpit] Reload timed out but may have worked');
          this._postMessage({ type: 'info', message: 'Unity refresh sent (response timed out - check Unity console)' });
        } else {
          console.log('[Unity Cockpit] Reload failed:', result.error);
          this._postMessage({ type: 'error', message: `Failed to reload Unity: ${result.error}` });
        }
        // Command failed but connection might still work, try to update status
        await this._refreshUnityStatus();
      }
    } catch (err) {
      console.error('[Unity Cockpit] Reload error:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      // Check if it's a timeout or cancelled task - refresh may still have worked
      if (errMsg.includes('timed out') || errMsg.includes('canceled')) {
        this._postMessage({ type: 'info', message: 'Unity refresh sent (response interrupted - check Unity console)' });
        // Try to reconnect and refresh status after a short delay
        setTimeout(async () => {
          await this._refreshUnityStatus();
        }, 2000);
      } else {
        this._postMessage({ type: 'error', message: 'Failed to send reload command to Unity' });
        // Connection failed - update status to disconnected
        this._postMessage({ type: 'unityMCPAvailable', available: false });
        this._postMessage({ type: 'unityStatus', status: { connected: false } });
      }
    }
  }

  /**
   * Internal handler for Unity cockpit commands
   * Called by the public handleUnityCommand wrapper
   */
  private async _handleUnityCommandInternal(cmd: string): Promise<void> {
    try {
      this._postMessage({ type: 'info', message: `Executing Unity command: ${cmd}...` });

      switch (cmd) {
        case 'status': {
          const stateResult = await this.coplayClient.getEditorState();
          if (stateResult.success) {
            const state = stateResult.data;
            this._postMessage({
              type: 'unityStatus',
              connected: true,
              playMode: state?.playMode,
              scene: state?.activeAssetPath
            });
            this._postMessage({ type: 'info', message: `Unity connected. Scene: ${state?.activeAssetPath}` });
          } else {
            this._postMessage({ type: 'unityStatus', connected: false });
            this._postMessage({ type: 'error', message: `Unity not connected: ${stateResult.error}` });
          }
          break;
        }
        case 'reload': {
          console.log('[SpaceCode] Reload button clicked - calling refreshAssets...');
          try {
            const result = await this.coplayClient.refreshAssets();
            console.log('[SpaceCode] refreshAssets result:', JSON.stringify(result));
            if (result.success) {
              this._postMessage({ type: 'info', message: 'Unity reload requested! MCP will reconnect after domain reload...' });
              setTimeout(() => {
                this._checkUnityMCPAvailable();
              }, 3000);
            } else {
              this._postMessage({ type: 'error', message: `Reload failed: ${result.error}` });
            }
          } catch (err) {
            console.error('[SpaceCode] Reload error:', err);
            const errMsg = err instanceof Error ? err.message : String(err);
            if (errMsg.includes('canceled') || errMsg.includes('timed out')) {
              this._postMessage({ type: 'info', message: 'Unity reload in progress - reconnecting...' });
              setTimeout(() => {
                this._checkUnityMCPAvailable();
              }, 3000);
            } else {
              this._postMessage({ type: 'error', message: `Reload error: ${errMsg}` });
            }
          }
          break;
        }
        case 'play': {
          const result = await this.coplayClient.play();
          if (result.success) {
            this._postMessage({ type: 'info', message: 'Unity play mode started' });
          } else {
            this._postMessage({ type: 'error', message: `Play failed: ${result.error}` });
          }
          break;
        }
        case 'stop': {
          const result = await this.coplayClient.stop();
          if (result.success) {
            this._postMessage({ type: 'info', message: 'Unity play mode stopped' });
          } else {
            this._postMessage({ type: 'error', message: `Stop failed: ${result.error}` });
          }
          break;
        }
        case 'logs': {
          const logsResult = await this.coplayClient.getLogs({ limit: 20 });
          if (logsResult.success && logsResult.data) {
            this._postMessage({ type: 'unityLogs', logs: logsResult.data });
            this._postMessage({ type: 'info', message: 'Unity logs retrieved' });
          } else {
            this._postMessage({ type: 'error', message: `Failed to get logs: ${logsResult.error}` });
          }
          break;
        }
        case 'errors': {
          const errorsResult = await this.coplayClient.checkCompileErrors();
          if (errorsResult.success) {
            const hasErrors = errorsResult.data && errorsResult.data !== 'No compile errors';
            this._postMessage({
              type: 'unityErrors',
              hasErrors,
              errors: errorsResult.data
            });
            this._postMessage({
              type: 'info',
              message: hasErrors ? 'Compile errors found' : 'No compile errors'
            });
          } else {
            this._postMessage({ type: 'error', message: `Failed to check errors: ${errorsResult.error}` });
          }
          break;
        }
        default:
          this._postMessage({ type: 'error', message: `Unknown Unity command: ${cmd}` });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this._postMessage({ type: 'error', message: `Unity command failed: ${errorMsg}` });
    }
  }

  // --- VER-1: Diff Scanner ---
  private async _scanGitDiff(): Promise<void> {
    const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceDir) {
      this._postMessage({ type: 'diffResult', diff: null });
      return;
    }

    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // Get git status for file changes
      const { stdout: statusOut } = await execAsync('git status --porcelain', { cwd: workspaceDir });
      const files: { path: string; status: 'added' | 'modified' | 'deleted' }[] = [];

      for (const line of statusOut.split('\n')) {
        if (!line.trim()) continue;
        const status = line.substring(0, 2).trim();
        const filePath = line.substring(3).trim();

        if (status === '??' || status === 'A') {
          files.push({ path: filePath, status: 'added' });
        } else if (status === 'D') {
          files.push({ path: filePath, status: 'deleted' });
        } else if (status === 'M' || status === 'MM' || status === 'AM') {
          files.push({ path: filePath, status: 'modified' });
        } else if (status) {
          files.push({ path: filePath, status: 'modified' });
        }
      }

      // Get the actual diff content for AI review
      let diffContent = '';
      try {
        const { stdout: diffOut } = await execAsync('git diff HEAD', { cwd: workspaceDir, maxBuffer: 1024 * 1024 * 5 });
        diffContent = diffOut;

        // Also get staged changes
        const { stdout: stagedOut } = await execAsync('git diff --cached', { cwd: workspaceDir, maxBuffer: 1024 * 1024 * 5 });
        if (stagedOut) {
          diffContent = diffContent + '\n' + stagedOut;
        }
      } catch (e) {
        // Diff might fail if no commits yet, continue with file list
      }

      this._postMessage({
        type: 'diffResult',
        diff: {
          files,
          diff: diffContent,
          timestamp: Date.now()
        }
      });
    } catch (err) {
      console.error('Diff scan error:', err);
      this._postMessage({ type: 'diffResult', diff: null });
    }
  }

  // --- VER-4: Regression Tests ---
  private async _runRegressionTests(): Promise<void> {
    const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceDir) {
      this._postMessage({ type: 'testResult', success: false, output: 'No workspace folder open.' });
      return;
    }

    // Get test command from config (default: npm test)
    const config = vscode.workspace.getConfiguration('spacecode');
    const testCommand = config.get<string>('testCommand', 'npm test');

    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      const { stdout, stderr } = await execAsync(testCommand, {
        cwd: workspaceDir,
        maxBuffer: 1024 * 1024 * 5, // 5MB buffer
        timeout: 300000 // 5 minute timeout
      });

      const output = stdout + (stderr ? '\\nSTDERR:\\n' + stderr : '');
      this._postMessage({
        type: 'testResult',
        success: true,
        output: output || 'Tests passed (no output)'
      });
    } catch (err: any) {
      // Test command failed (non-zero exit code)
      const output = (err.stdout || '') + (err.stderr ? '\\nSTDERR:\\n' + err.stderr : '');
      this._postMessage({
        type: 'testResult',
        success: false,
        output: output || err.message || 'Test command failed'
      });
    }
  }

  // --- VER-2: Plan Comparison ---
  private _currentPlan: { expectedFiles: string[] } | null = null;

  public setCurrentPlan(plan: { expectedFiles: string[] }) {
    this._currentPlan = plan;
  }

  private async _comparePlanToFiles(diffFiles: string[]): Promise<void> {
    // If no plan is set, try to infer expected files from recent chat messages
    const expectedFiles = this._currentPlan?.expectedFiles || [];

    if (expectedFiles.length === 0) {
      // No plan to compare against - just report all files as untracked
      this._postMessage({
        type: 'planComparisonResult',
        result: {
          matched: [],
          unexpected: diffFiles,
          missing: [],
          noPlan: true
        }
      });
      return;
    }

    const matched: string[] = [];
    const unexpected: string[] = [];
    const missing: string[] = [];

    // Check which diff files match expected files
    for (const file of diffFiles) {
      const normalizedFile = file.replace(/\\/g, '/');
      const isExpected = expectedFiles.some(exp => {
        const normalizedExp = exp.replace(/\\/g, '/');
        return normalizedFile === normalizedExp ||
               normalizedFile.endsWith(normalizedExp) ||
               normalizedExp.endsWith(normalizedFile);
      });

      if (isExpected) {
        matched.push(file);
      } else {
        unexpected.push(file);
      }
    }

    // Check which expected files are missing from diff
    for (const expected of expectedFiles) {
      const normalizedExp = expected.replace(/\\/g, '/');
      const found = diffFiles.some(file => {
        const normalizedFile = file.replace(/\\/g, '/');
        return normalizedFile === normalizedExp ||
               normalizedFile.endsWith(normalizedExp) ||
               normalizedExp.endsWith(normalizedFile);
      });

      if (!found) {
        missing.push(expected);
      }
    }

    this._postMessage({
      type: 'planComparisonResult',
      result: { matched, unexpected, missing }
    });
  }

  // --- VER-2b: Plan Generation + Storage ---
  private _getWorkspaceRelativePath(filePath: string): string {
    const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceDir) return filePath;
    return path.relative(workspaceDir, filePath).replace(/\\/g, '/');
  }

  private _getPlanProvider(providerId: 'claude' | 'gpt'): AIProvider | null {
    const preferred = providerId === 'gpt'
      ? this.orchestrator.getGptProvider()
      : this.orchestrator.getClaudeProvider();
    if (preferred?.isConfigured) return preferred;
    const fallback = providerId === 'gpt'
      ? this.orchestrator.getClaudeProvider()
      : this.orchestrator.getGptProvider();
    if (fallback?.isConfigured) return fallback;
    return null;
  }

  private _extractExpectedFiles(plan: Plan): string[] {
    const files = new Set<string>();
    for (const phase of plan.phases) {
      for (const step of phase.steps) {
        for (const file of step.files || []) {
          files.add(file.replace(/\\/g, '/'));
        }
      }
    }
    return Array.from(files);
  }

  private async _sendPlanTemplates(): Promise<void> {
    this._postMessage({ type: 'planTemplates', templates: PLAN_TEMPLATES });
  }

  private async _sendPlanList(): Promise<void> {
    const plans = this.planStorage.getRecentPlans(20);
    this._postMessage({ type: 'planList', plans });
  }

  private async _sendPlanById(planId: string): Promise<void> {
    const plan = this.planStorage.loadPlan(planId);
    this._postMessage({ type: 'planLoaded', plan: plan || null });
  }

  private async _deletePlan(planId: string): Promise<void> {
    await this.planStorage.deletePlan(planId);
    await this._sendPlanList();
  }

  private async _savePlan(plan: Plan, action: 'created' | 'approved' | 'executed' | 'verified' | 'failed' | 'cancelled' = 'created'): Promise<void> {
    await this.planStorage.savePlan(plan);
    await this.planStorage.addHistoryEntry({
      planId: plan.id,
      action,
      timestamp: Date.now(),
    });
    await this._sendPlanList();
  }

  private async _usePlanForComparison(planId: string): Promise<void> {
    const plan = this.planStorage.loadPlan(planId);
    if (!plan) {
      this._postMessage({ type: 'planError', error: 'Plan not found' });
      return;
    }
    const expectedFiles = this._extractExpectedFiles(plan);
    this.setCurrentPlan({ expectedFiles });
    this._postMessage({
      type: 'status',
      status: { message: `Plan set for comparison (${expectedFiles.length} files)` }
    });
  }

  // --- Ticket Methods ---
  private async _sendTicketList(): Promise<void> {
    const tickets = this.ticketStorage.getAllTickets();
    this._postMessage({ type: 'ticketList', tickets });
  }

  private async _createTicket(title: string, description: string, sectorId: string, linkedPlanId?: string): Promise<void> {
    const ticket = await this.ticketStorage.createTicket({
      title,
      description,
      sectorId,
      linkedPlanId
    });
    this._postMessage({ type: 'ticketCreated', ticket });
    await this._sendTicketList();
  }

  private async _updateTicketStatus(ticketId: string, status: TicketStatus): Promise<void> {
    const success = await this.ticketStorage.updateStatus(ticketId, status);
    if (success) {
      const ticket = this.ticketStorage.loadTicket(ticketId);
      this._postMessage({ type: 'ticketUpdated', ticket });
      await this._sendTicketList();
    } else {
      this._postMessage({ type: 'ticketError', error: 'Ticket not found' });
    }
  }

  private async _linkTicketToPlan(ticketId: string, planId: string): Promise<void> {
    const success = await this.ticketStorage.linkToPlan(ticketId, planId);
    if (success) {
      const ticket = this.ticketStorage.loadTicket(ticketId);
      this._postMessage({ type: 'ticketUpdated', ticket });
      await this._sendTicketList();
    } else {
      this._postMessage({ type: 'ticketError', error: 'Ticket not found' });
    }
  }

  private async _deleteTicket(ticketId: string): Promise<void> {
    await this.ticketStorage.deleteTicket(ticketId);
    await this._sendTicketList();
  }

  private async _generatePlanFromIntent(
    intent: string,
    providerId: 'claude' | 'gpt',
    templateId?: string,
    templateVariables?: Record<string, string>
  ): Promise<void> {
    const provider = this._getPlanProvider(providerId);
    if (!provider) {
      this._postMessage({ type: 'planError', error: 'No configured AI provider available for plan generation.' });
      return;
    }

    const generator = new PlanGenerator(provider);
    const editor = vscode.window.activeTextEditor;
    const currentFile = editor ? this._getWorkspaceRelativePath(editor.document.fileName) : undefined;

    const request = {
      intent,
      currentSector: this._shipSectorId,
      currentFile,
      contextPack: this._contextPreviewText || undefined
    };

    let result: PlanGenerationResult;
    if (templateId) {
      result = await generator.generateFromTemplate(templateId, templateVariables || {}, { provider: providerId });
    } else {
      result = await generator.generatePlan(request, { provider: providerId, includeDocumentation: this._shipProfile !== 'yard' });
    }

    if (!result.success || !result.plan) {
      this._postMessage({ type: 'planError', error: result.error || 'Plan generation failed' });
      return;
    }

    await this._savePlan(result.plan, 'created');
    this._postMessage({ type: 'planGenerated', plan: result.plan });
  }

  // --- VER-5: AI Review ---
  private async _runAIReview(diff: string): Promise<void> {
    if (!diff || diff.length === 0) {
      this._postMessage({
        type: 'aiReviewResult',
        result: { error: 'No diff content to review' }
      });
      return;
    }

    try {
      // Truncate diff if too large
      const maxDiffSize = 15000;
      const truncatedDiff = diff.length > maxDiffSize
        ? diff.substring(0, maxDiffSize) + '\n\n... (diff truncated for review) ...'
        : diff;

      // Use the orchestrator to send to Claude for review
      const reviewPrompt = `You are a code reviewer. Analyze this git diff and identify any issues.

Return your analysis as JSON with this structure:
{
  "issues": [
    {
      "severity": "error" | "warning" | "info",
      "title": "Short title",
      "description": "Detailed description",
      "file": "filename (optional)",
      "line": 123 (optional)
    }
  ],
  "summary": "One sentence summary of the overall quality"
}

Focus on:
- Bugs and logic errors
- Security vulnerabilities
- Style inconsistencies
- Missing error handling
- Performance issues

Git Diff:
\`\`\`diff
${truncatedDiff}
\`\`\`

Return ONLY the JSON, no markdown or explanation.`;

      // Try to use the orchestrator's Claude connection
      const aiResponse = await this.orchestrator.askSingle(
        'claude',
        reviewPrompt,
        'You are a code review assistant. Respond only with valid JSON.'
      );
      const response = aiResponse.content;

      // Parse the response
      let result;
      try {
        // Try to extract JSON from the response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
        } else {
          result = { issues: [], summary: response.substring(0, 200) };
        }
      } catch (parseErr) {
        result = {
          issues: [],
          summary: 'AI review completed but response could not be parsed.',
          rawResponse: response.substring(0, 500)
        };
      }

      this._postMessage({
        type: 'aiReviewResult',
        result
      });
    } catch (err) {
      console.error('AI review error:', err);
      this._postMessage({
        type: 'aiReviewResult',
        result: {
          error: err instanceof Error ? err.message : 'Failed to run AI review'
        }
      });
    }
  }

  private _scheduleContextPreviewSend(): void {
    if (this._contextPreviewTimer) clearTimeout(this._contextPreviewTimer);
    this._contextPreviewTimer = setTimeout(() => {
      void this._sendContextPreview();
    }, 150);
  }

  private _buildContextPreviewText(): string {
    // If we have recently gathered context (< 60 seconds), use it
    if (this._gatheredContext && Date.now() - this._gatheredContext.timestamp < 60000) {
      // Append current diagnostics and selection to the gathered context
      const editor = vscode.window.activeTextEditor;
      let additionalContext = '';

      if (editor) {
        const doc = editor.document;
        const uri = doc.uri;
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
        const relPath = workspaceFolder ? vscode.workspace.asRelativePath(uri) : uri.fsPath;

        // Add diagnostics
        const diags = vscode.languages.getDiagnostics(uri) || [];
        if (diags.length > 0) {
          const diagLines = diags.slice(0, 20).map(d => {
            const sev = d.severity === vscode.DiagnosticSeverity.Error ? 'error'
              : d.severity === vscode.DiagnosticSeverity.Warning ? 'warn'
              : d.severity === vscode.DiagnosticSeverity.Information ? 'info'
              : 'hint';
            const line = d.range.start.line + 1;
            const col = d.range.start.character + 1;
            return `- ${sev} ${relPath}:${line}:${col} ${d.message}`;
          });
          additionalContext += `\n=== DIAGNOSTICS ===\n${diagLines.join('\n')}\n`;
        }

        // Add selection if any
        if (!editor.selection.isEmpty) {
          let selectionText = doc.getText(editor.selection);
          if (selectionText.length > 2000) selectionText = selectionText.slice(0, 2000) + '\n...(truncated)';
          additionalContext += `\n=== SELECTION ===\n\`\`\`${doc.languageId}\n${selectionText}\n\`\`\`\n`;
        }
      }

      const fullContext = this._gatheredContext.injectionText + additionalContext;
      this._lastEditorContextPreviewText = fullContext;
      return fullContext;
    }

    // Fall back to basic context if no gathered context available
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      // Keep last known editor context when the SpaceCode webview is focused.
      return this._lastEditorContextPreviewText || '[SpaceCode Context]\n(No active editor yet - click a code file)\n';
    }

    const doc = editor.document;
    const uri = doc.uri;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    const relPath = workspaceFolder ? vscode.workspace.asRelativePath(uri) : uri.fsPath;

    let selectionText = '';
    if (!editor.selection.isEmpty) {
      selectionText = doc.getText(editor.selection);
      if (selectionText.length > 2000) selectionText = selectionText.slice(0, 2000) + '\n...(truncated)';
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

    const docLine = this._docTarget ? `Doc Target: ${this._docTarget}\n` : `Doc Target: (none)\n`;
    const header =
      `[SpaceCode Context]\n` +
      `Station Sector: ${this._shipSectorId}\n` +
      `Profile: ${this._shipProfile}\n` +
      docLine +
      `File: ${relPath}\n` +
      `Language: ${doc.languageId}\n`;

    const diagBlock = diagLines.length
      ? `\n[Diagnostics]\n${diagLines.join('\n')}\n`
      : `\n[Diagnostics]\n(none)\n`;

    const selBlock = selectionText
      ? `\n[Selection]\n\`\`\`${doc.languageId}\n${selectionText}\n\`\`\`\n`
      : `\n[Selection]\n(none)\n`;

    const text = header + diagBlock + selBlock;
    this._lastEditorContextPreviewText = text;
    return text;
  }

  private _loadSectorConfig(workspaceDir: string): SectorConfig | null {
    if (!workspaceDir) return null;

    const configPath = path.join(workspaceDir, '.spacecode', 'sector-config.json');
    if (!fs.existsSync(configPath)) return null;

    try {
      const raw = fs.readFileSync(configPath, 'utf8');
      const parsed = JSON.parse(raw) as SectorConfig;
      if (!parsed || !Array.isArray(parsed.sectors)) {
        console.warn('[SpaceCode] Invalid sector config format:', configPath);
        return null;
      }
      return parsed;
    } catch (err) {
      console.warn('[SpaceCode] Failed to load sector config:', configPath, err);
      return null;
    }
  }

  private async _sendContextPreview(): Promise<void> {
    const text = this._buildContextPreviewText();
    this._contextPreviewText = text;
    this._postMessage({ type: 'contextPreview', text });

    // AUTO-DETECT sector from active file and broadcast to UI
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && activeEditor.document.uri.scheme === 'file') {
      const filePath = activeEditor.document.uri.fsPath;
      const detectedSector = this.sectorManager.detectSector(filePath);
      const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
      const relPath = workspaceDir ? path.relative(workspaceDir, filePath) : filePath;
      const parentDir = path.dirname(relPath);
      const parentLabel = parentDir && parentDir !== '.' ? path.basename(parentDir) : '';
      const fileName = path.basename(relPath);
      const lineNumber = activeEditor.selection.active.line + 1;
      const sectorName = detectedSector?.name || this._shipSectorId.toUpperCase();
      const breadcrumb = `${sectorName} > ${parentLabel ? parentLabel + ' > ' : ''}${fileName}:${lineNumber}`;
      this._postMessage({
        type: 'activeBreadcrumb',
        breadcrumb,
        filePath: relPath,
        sectorId: detectedSector?.id || this._shipSectorId,
        sectorName
      });
      if (detectedSector && detectedSector.id !== this._shipSectorId) {
        this._shipSectorId = detectedSector.id;
        this._postMessage({
          type: 'shipSectorDetected',
          sectorId: detectedSector.id,
          sectorName: detectedSector.name,
          filePath: filePath
        });
      }
    } else {
      this._postMessage({
        type: 'activeBreadcrumb',
        breadcrumb: 'No active file',
        filePath: '',
        sectorId: this._shipSectorId,
        sectorName: this._shipSectorId.toUpperCase()
      });
    }
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

      case 'openDocTarget':
        if (typeof message.docTarget === 'string' && message.docTarget) {
          this._openDocFile(message.docTarget);
        }
        break;

      case 'getDocInfo':
        if (typeof message.docTarget === 'string' && message.docTarget) {
          this._sendDocInfo(message.docTarget);
        }
        break;

      case 'autoexecuteList':
        this._postJobList();
        break;

      case 'autoexecuteApprove':
        if (typeof message.jobId === 'string') {
          this._updateJobStatus(message.jobId, 'approved');
          await this._runApprovedJob(message.jobId);
        }
        break;

      case 'autoexecuteReject':
        if (typeof message.jobId === 'string') {
          this._updateJobStatus(message.jobId, 'rejected');
        }
        break;

      case 'autoexecuteClearAll':
        this._saveJobs([]);
        this._postMessage({ type: 'autoexecuteJobs', jobs: [] });
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

      case 'asmdefInventory': {
        const inventory = await this.asmdefGate.getInventory();
        const graph = await this.asmdefGate.getGraph();
        const invRes = await this.coordinatorClient.setAsmdefInventoryWithStatus(inventory);
        this._coordinatorSyncStatus.inventory = invRes.ok ? 'ok' : (invRes.error || `http-${invRes.status}`);
        if (invRes.ok) this._coordinatorSync.inventory = Date.now();

        if (inventory.policy) {
          const polRes = await this.coordinatorClient.setAsmdefPolicyWithStatus(inventory.policy);
          this._coordinatorSyncStatus.policy = polRes.ok ? 'ok' : (polRes.error || `http-${polRes.status}`);
          if (polRes.ok) this._coordinatorSync.policy = Date.now();
        }

        const graphRes = await this.coordinatorClient.setAsmdefGraphWithStatus(graph);
        this._coordinatorSyncStatus.graph = graphRes.ok ? 'ok' : (graphRes.error || `http-${graphRes.status}`);
        if (graphRes.ok) this._coordinatorSync.graph = Date.now();
        this._postCoordinatorSync();
        this._postMessage({ type: 'asmdefInventory', inventory });
        this._postMessage({ type: 'asmdefGraph', graph });
        break;
      }

      case 'asmdefGeneratePolicy': {
        const result = await this.asmdefGate.generatePolicyDraft(false);
        const polRes = await this.coordinatorClient.setAsmdefPolicyWithStatus(result.policy);
        this._coordinatorSyncStatus.policy = polRes.ok ? 'ok' : (polRes.error || `http-${polRes.status}`);
        if (polRes.ok) this._coordinatorSync.policy = Date.now();
        this._postCoordinatorSync();
        this._postMessage({ type: 'asmdefPolicyGenerated', policyPath: result.policyPath, policy: result.policy });
        break;
      }

      case 'asmdefOpenPolicy': {
        const inv = await this.asmdefGate.getInventory();
        if (inv.policyPath) {
          await this._openFile(inv.policyPath);
        } else {
          const draft = await this.asmdefGate.generatePolicyDraft(false);
          await this._openFile(draft.policyPath);
        }
        break;
      }

      case 'asmdefGetPolicy': {
        let inv = await this.asmdefGate.getInventory();
        let policy = inv.policy || null;
        let policyPath = inv.policyPath;
        if (!policy) {
          const draft = await this.asmdefGate.generatePolicyDraft(false);
          policy = draft.policy;
          policyPath = draft.policyPath;
          inv = await this.asmdefGate.getInventory();
        }
        if (policy) {
          const policyText = JSON.stringify(policy, null, 2);
          this._postMessage({ type: 'asmdefPolicy', policyText, policyPath });
        } else {
          this._postMessage({ type: 'error', message: 'Asmdef policy not found.' });
        }
        break;
      }

      case 'asmdefSavePolicy': {
        if (typeof message.text !== 'string') {
          this._postMessage({ type: 'error', message: 'Policy text is missing.' });
          break;
        }
        let policy: any = null;
        try {
          policy = JSON.parse(message.text);
        } catch (err: any) {
          this._postMessage({ type: 'error', message: 'Policy JSON is invalid: ' + (err?.message || err) });
          break;
        }
        if (!policy || typeof policy !== 'object' || typeof policy.entries !== 'object') {
          this._postMessage({ type: 'error', message: 'Policy JSON must include an "entries" object.' });
          break;
        }
        let inv = await this.asmdefGate.getInventory();
        let policyPath = inv.policyPath;
        if (!policyPath) {
          const draft = await this.asmdefGate.generatePolicyDraft(false);
          policyPath = draft.policyPath;
        }
        await vscode.workspace.fs.writeFile(vscode.Uri.file(policyPath), Buffer.from(JSON.stringify(policy, null, 2), 'utf8'));
        const polRes = await this.coordinatorClient.setAsmdefPolicyWithStatus(policy);
        this._coordinatorSyncStatus.policy = polRes.ok ? 'ok' : (polRes.error || `http-${polRes.status}`);
        if (polRes.ok) this._coordinatorSync.policy = Date.now();
        this._postCoordinatorSync();
        this._postMessage({ type: 'asmdefPolicySaved', policyPath, policy });
        // Refresh inventory so the UI badge/summary stays in sync
        inv = await this.asmdefGate.getInventory();
        this._postMessage({ type: 'asmdefInventory', inventory: inv });
        break;
      }

      case 'asmdefSetStrict': {
        const result = await this.asmdefGate.setPolicyMode('strict');
        if (result?.policy) {
          const polRes = await this.coordinatorClient.setAsmdefPolicyWithStatus(result.policy);
          this._coordinatorSyncStatus.policy = polRes.ok ? 'ok' : (polRes.error || `http-${polRes.status}`);
          if (polRes.ok) this._coordinatorSync.policy = Date.now();
          this._postCoordinatorSync();
        }
        this._postMessage({ type: 'asmdefPolicyMode', mode: 'strict', policyPath: result?.policyPath });
        break;
      }

      case 'asmdefSetAdvisory': {
        const result = await this.asmdefGate.setPolicyMode('advisory');
        if (result?.policy) {
          const polRes = await this.coordinatorClient.setAsmdefPolicyWithStatus(result.policy);
          this._coordinatorSyncStatus.policy = polRes.ok ? 'ok' : (polRes.error || `http-${polRes.status}`);
          if (polRes.ok) this._coordinatorSync.policy = Date.now();
          this._postCoordinatorSync();
        }
        this._postMessage({ type: 'asmdefPolicyMode', mode: 'advisory', policyPath: result?.policyPath });
        break;
      }

      case 'asmdefNormalizeGuids': {
        const result = await this.asmdefGate.normalizePolicyGuids();
        const inventory = await this.asmdefGate.getInventory();
        const graph = await this.asmdefGate.getGraph();
        const invRes = await this.coordinatorClient.setAsmdefInventoryWithStatus(inventory);
        this._coordinatorSyncStatus.inventory = invRes.ok ? 'ok' : (invRes.error || `http-${invRes.status}`);
        if (invRes.ok) this._coordinatorSync.inventory = Date.now();

        if (inventory.policy) {
          const polRes = await this.coordinatorClient.setAsmdefPolicyWithStatus(inventory.policy);
          this._coordinatorSyncStatus.policy = polRes.ok ? 'ok' : (polRes.error || `http-${polRes.status}`);
          if (polRes.ok) this._coordinatorSync.policy = Date.now();
        }

        const graphRes = await this.coordinatorClient.setAsmdefGraphWithStatus(graph);
        this._coordinatorSyncStatus.graph = graphRes.ok ? 'ok' : (graphRes.error || `http-${graphRes.status}`);
        if (graphRes.ok) this._coordinatorSync.graph = Date.now();
        this._postCoordinatorSync();
        this._postMessage({ type: 'asmdefGuidsNormalized', result });
        this._postMessage({ type: 'asmdefGraph', graph });
        break;
      }

      case 'asmdefGraph': {
        const graph = await this.asmdefGate.getGraph();
        const graphRes = await this.coordinatorClient.setAsmdefGraphWithStatus(graph);
        this._coordinatorSyncStatus.graph = graphRes.ok ? 'ok' : (graphRes.error || `http-${graphRes.status}`);
        if (graphRes.ok) this._coordinatorSync.graph = Date.now();
        this._postCoordinatorSync();
        this._postMessage({ type: 'asmdefGraph', graph });
        break;
      }

      case 'asmdefOpen': {
        if (typeof message.path === 'string') {
          await this._openFile(message.path);
        }
        break;
      }

      case 'asmdefValidate': {
        const result = await this.asmdefGate.check();
        this._postMessage({ type: 'asmdefCheckResult', result });
        break;
      }

      case 'coordinatorHealth': {
        const health = await this.coordinatorClient.health();
        const url =
          vscode.workspace.getConfiguration('spacecode').get<string>('coordinatorUrl', 'http://127.0.0.1:5510');
        this._postMessage({ type: 'coordinatorHealth', ...health, url });
        break;
      }

      // Unity Cockpit handlers - Direct Coplay MCP calls
      case 'unityCommand': {
        const cmd = message.command as string;
        try {
          this._postMessage({ type: 'info', message: `Executing Unity command: ${cmd}...` });

          switch (cmd) {
            case 'status': {
              const stateResult = await this.coplayClient.getEditorState();
              if (stateResult.success) {
                const state = stateResult.data;
                this._postMessage({
                  type: 'unityStatus',
                  connected: true,
                  playMode: state?.playMode,
                  scene: state?.activeAssetPath
                });
                this._postMessage({ type: 'info', message: `Unity connected. Scene: ${state?.activeAssetPath}` });
              } else {
                this._postMessage({ type: 'unityStatus', connected: false });
                this._postMessage({ type: 'error', message: `Unity not connected: ${stateResult.error}` });
              }
              break;
            }
            case 'reload': {
              console.log('[SpaceCode] Reload button clicked - calling refreshAssets...');
              try {
                const result = await this.coplayClient.refreshAssets();
                console.log('[SpaceCode] refreshAssets result:', JSON.stringify(result));
                if (result.success) {
                  // Domain reload was requested - MCP will temporarily disconnect
                  this._postMessage({ type: 'info', message: 'Unity reload requested! MCP will reconnect after domain reload...' });
                  // Don't update connection status yet - let the reconnect happen naturally
                  // After domain reload, the next status check will update it
                  setTimeout(() => {
                    this._checkUnityMCPAvailable();
                  }, 3000); // Check again after 3 seconds
                } else {
                  this._postMessage({ type: 'error', message: `Reload failed: ${result.error}` });
                }
              } catch (err) {
                console.error('[SpaceCode] Reload error:', err);
                const errMsg = err instanceof Error ? err.message : String(err);
                // Domain reload causes disconnection - this is expected
                if (errMsg.includes('canceled') || errMsg.includes('timed out')) {
                  this._postMessage({ type: 'info', message: 'Unity reload in progress - reconnecting...' });
                  setTimeout(() => {
                    this._checkUnityMCPAvailable();
                  }, 3000);
                } else {
                  this._postMessage({ type: 'error', message: `Reload error: ${errMsg}` });
                }
              }
              break;
            }
            case 'play': {
              const result = await this.coplayClient.play();
              if (result.success) {
                this._postMessage({ type: 'info', message: 'Unity play mode started' });
              } else {
                this._postMessage({ type: 'error', message: `Play failed: ${result.error}` });
              }
              break;
            }
            case 'stop': {
              const result = await this.coplayClient.stop();
              if (result.success) {
                this._postMessage({ type: 'info', message: 'Unity play mode stopped' });
              } else {
                this._postMessage({ type: 'error', message: `Stop failed: ${result.error}` });
              }
              break;
            }
            case 'logs': {
              const logsResult = await this.coplayClient.getLogs({ limit: 20 });
              if (logsResult.success && logsResult.data) {
                this._postMessage({ type: 'unityLogs', logs: logsResult.data });
                this._postMessage({ type: 'info', message: 'Unity logs retrieved' });
              } else {
                this._postMessage({ type: 'error', message: `Failed to get logs: ${logsResult.error}` });
              }
              break;
            }
            case 'errors': {
              const errorsResult = await this.coplayClient.checkCompileErrors();
              if (errorsResult.success) {
                const hasErrors = errorsResult.data && errorsResult.data !== 'No compile errors';
                this._postMessage({
                  type: 'unityErrors',
                  hasErrors,
                  errors: errorsResult.data
                });
                this._postMessage({
                  type: 'info',
                  message: hasErrors ? 'Compile errors found' : 'No compile errors'
                });
              } else {
                this._postMessage({ type: 'error', message: `Failed to check errors: ${errorsResult.error}` });
              }
              break;
            }
            default:
              this._postMessage({ type: 'error', message: `Unknown Unity command: ${cmd}` });
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          this._postMessage({ type: 'error', message: `Unity command failed: ${errorMsg}` });
        }
        break;
      }

      // Legacy Unity MCP handlers (kept for backwards compatibility)
      case 'unityCheckConnection':
        // Just check connection status, don't reload Unity
        await this._checkUnityMCPAvailable(0, message.token);
        break;

      case 'unityRefresh':
        // Send reload command to Unity to apply code changes
        await this._reloadUnity();
        break;

      case 'unityTogglePlay':
        await this._unityTogglePlay();
        break;

      case 'unityTogglePause':
        await this._unityTogglePause();
        break;

      // Verification handlers
      case 'scanDiff':
        await this._scanGitDiff();
        break;

      case 'comparePlan':
        if (Array.isArray(message.diffFiles)) {
          await this._comparePlanToFiles(message.diffFiles);
        }
        break;

      case 'runTests':
        await this._runRegressionTests();
        break;

      case 'getPlanTemplates':
        await this._sendPlanTemplates();
        break;

      case 'generatePlan': {
        const intent = typeof message.intent === 'string' ? message.intent.trim() : '';
        if (!intent) {
          this._postMessage({ type: 'planError', error: 'Plan intent is required.' });
          break;
        }
        const providerId = message.provider === 'gpt' ? 'gpt' : 'claude';
        const templateId = typeof message.templateId === 'string' && message.templateId ? message.templateId : undefined;
        const vars = typeof message.templateVariables === 'object' && message.templateVariables ? message.templateVariables : undefined;
        await this._generatePlanFromIntent(intent, providerId, templateId, vars);
        break;
      }

      case 'listPlans':
        await this._sendPlanList();
        break;

      case 'loadPlan':
        if (typeof message.planId === 'string') {
          await this._sendPlanById(message.planId);
        }
        break;

      case 'savePlan':
        if (message.plan) {
          await this._savePlan(message.plan, 'created');
          this._postMessage({ type: 'planSaved', plan: message.plan });
        }
        break;

      case 'deletePlan':
        if (typeof message.planId === 'string') {
          await this._deletePlan(message.planId);
        }
        break;

      case 'usePlanForComparison':
        if (typeof message.planId === 'string') {
          await this._usePlanForComparison(message.planId);
        }
        break;

      case 'executePlan':
        if (typeof message.planId === 'string') {
          // Gate through autoexecute approval
          if (this._requireAutoexecute(
            `Execute Plan`,
            'executePlan',
            { planId: message.planId },
            { skipDocGate: true }
          )) {
            await this._executePlanFromJob(message.planId);
          }
        }
        break;

      case 'executePlanStepByStep':
        if (typeof message.planId === 'string') {
          await this._executePlanStepByStep(message.planId);
        }
        break;

      case 'planStepApprove':
        if (this._pendingStepApproval) {
          this._pendingStepApproval.resolve(true);
          this._pendingStepApproval = null;
        }
        break;

      case 'planStepAbort':
        if (this._pendingStepApproval) {
          this._pendingStepApproval.resolve(false);
          this._pendingStepApproval = null;
        }
        break;

      case 'runAIReview':
        if (typeof message.diff === 'string') {
          await this._runAIReview(message.diff);
        }
        break;

      // Ticket handlers
      case 'getTickets':
        await this._sendTicketList();
        break;

      case 'createTicket':
        if (typeof message.title === 'string' && message.title.trim()) {
          await this._createTicket(message.title, message.description || '', message.sectorId || 'general', message.linkedPlanId);
        }
        break;

      case 'updateTicketStatus':
        if (typeof message.ticketId === 'string' && typeof message.status === 'string') {
          await this._updateTicketStatus(message.ticketId, message.status as TicketStatus);
        }
        break;

      case 'linkTicketToPlan':
        if (typeof message.ticketId === 'string' && typeof message.planId === 'string') {
          await this._linkTicketToPlan(message.ticketId, message.planId);
        }
        break;

      case 'deleteTicket':
        if (typeof message.ticketId === 'string') {
          await this._deleteTicket(message.ticketId);
        }
        break;

      // GitHub Integration handlers
      case 'createGitHubIssue':
        if (typeof message.title === 'string' && typeof message.body === 'string') {
          await this._createGitHubIssue(message.title, message.body, message.labels, message.planId);
        }
        break;

      case 'createGitHubPR':
        if (typeof message.title === 'string' && typeof message.body === 'string' && typeof message.head === 'string') {
          await this._createGitHubPR(message.title, message.body, message.head, message.base, message.planId);
        }
        break;

      case 'listGitHubIssues':
        await this._listGitHubIssues(message.state, message.labels, message.limit);
        break;

      case 'listGitHubPRs':
        await this._listGitHubPRs(message.state);
        break;

      case 'checkGitHubAvailable':
        await this._checkGitHubAvailable();
        break;

      // CodeSensei MCP Integration (INT-2)
      case 'senseiExplain':
        if (typeof message.filePath === 'string') {
          await this._senseiExplain(message.filePath, message.selection);
        }
        break;

      case 'senseiContextBrief':
        if (typeof message.filePath === 'string') {
          await this._senseiContextBrief(message.filePath);
        }
        break;

      case 'senseiAssemblyGraph':
        await this._senseiAssemblyGraph(message.assemblyName);
        break;

      case 'senseiSyncDocs':
        await this._senseiSyncDocs(message.filePath, message.sectorId);
        break;

      case 'senseiAIReview':
        await this._senseiAIReview(message.filePath, message.diff);
        break;

      case 'checkUnityMCPAvailable':
        await this._checkUnityMCPAvailable();
        break;

      // Plan Comparison (VER-2)
      case 'comparePlanToDiff':
        if (typeof message.planId === 'string') {
          await this._comparePlanToDiff(message.planId, message.diffResult);
        }
        break;

      // --- Git Operations ---
      case 'getGitStatus':
        await this._getGitStatus();
        break;

      case 'gitStageFiles':
        await this._gitStageFiles(message.files);
        break;

      case 'gitCommit':
        await this._gitCommit(message.message, message.files);
        break;

      case 'gitCreateBranch':
        await this._gitCreateBranch(message.name, message.checkout);
        break;

      case 'gitCheckout':
        await this._gitCheckout(message.ref);
        break;

      case 'gitPush':
        await this._gitPush(message.remote, message.branch, message.setUpstream);
        break;

      case 'gitPull':
        await this._gitPull(message.remote, message.branch);
        break;

      case 'getRecentCommits':
        await this._getRecentCommits(message.count);
        break;

      case 'shipGetContextPack': {
        const profile = (message.profile === 'yard' || message.profile === 'scout' || message.profile === 'battleship')
          ? message.profile
          : this._shipProfile;

        // AUTO-DETECT sector from active file path
        let detectedSector = null;
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && activeEditor.document.uri.scheme === 'file') {
          const filePath = activeEditor.document.uri.fsPath;
          detectedSector = this.sectorManager.detectSector(filePath);
        }

        // Fall back to manually selected sector if no file open or detection fails
        const sector = detectedSector || this.sectorManager.getSector(this._shipSectorId);
        const sectorId = sector?.id || this._shipSectorId;
        const sectorName = sector?.name || sectorId.toUpperCase();
        const sectorRules = sector?.rules || 'No specific rules - experimental zone.';
        const dependencies = sector?.dependencies || [];
        const docTarget = sector?.docTarget || 'None';

        // Build sector context for the gatherer
        const sectorContext = {
          sectorId,
          sectorName,
          rules: sectorRules,
          dependencies,
          docTarget
        };

        // Gather context automatically from workspace
        try {
          this._gatheredContext = await this.contextGatherer.gather({
            sectorContext,
            maxSize: 50 * 1024, // 50KB
            maxRecentFiles: 5,
            maxAssemblyFiles: 10,
            maxDependencies: 5,
            includeActiveContent: true
          });

          // Store the injection text for later use in AI prompts
          this._contextPreviewText = this._gatheredContext.injectionText;

          // Send preview to UI
          this._postMessage({
            type: 'shipContextPack',
            sectorId,
            profile,
            injectionText: this._gatheredContext.previewText,
            // Include detailed context info for UI
            contextDetails: {
              totalSize: this._gatheredContext.totalSize,
              activeFile: this._gatheredContext.activeFile ? {
                fileName: this._gatheredContext.activeFile.fileName,
                relativePath: this._gatheredContext.activeFile.relativePath,
                lineCount: this._gatheredContext.activeFile.lineCount,
                className: this._gatheredContext.activeFile.className,
                namespace: this._gatheredContext.activeFile.namespace
              } : null,
              recentFilesCount: this._gatheredContext.recentFiles.length,
              assemblyFilesCount: this._gatheredContext.assemblyFiles.length,
              dependenciesCount: this._gatheredContext.dependencies.length,
              assemblyName: this._gatheredContext.assemblyInfo?.name
            }
          });
        } catch (error) {
          // Fallback to basic context if gathering fails
          console.error('Failed to gather context:', error);
          let injectionText = `[SpaceCode Context Pack]\n`;
          injectionText += `Profile: ${profile}\n`;
          injectionText += `Sector: ${sectorName}\n\n`;
          injectionText += `=== SECTOR RULES ===\n${sectorRules}\n\n`;
          if (dependencies.length > 0) {
            injectionText += `=== DEPENDENCIES ===\nThis sector depends on: ${dependencies.join(', ')}\n\n`;
          }
          injectionText += `=== DOC TARGET ===\n${docTarget}\n`;
          if (sector?.approvalRequired) {
            injectionText += `\n⚠️ Changes to this sector require approval before merge.\n`;
          }
          this._postMessage({ type: 'shipContextPack', sectorId, profile, injectionText });
        }
        break;
      }

      case 'shipRunGates':
        if (!this._requireAutoexecute('Run Gates', 'shipRunGates', {})) break;
        await this._runGatesCheck();
        break;

      case 'shipDocsStatus':
        if (!this._requireAutoexecute('Docs Check', 'shipDocsStatus', {}, { skipDocGate: true })) break;
        await this._checkDocsStatus();
        break;

      case 'openHotspotTool': {
        const sceneId = typeof message.sceneId === 'string' ? message.sceneId : 'station';
        HotspotToolPanel.createOrShow(this._extensionUri, sceneId);
        break;
      }

      case 'saveApiKeys':
        await this._saveApiKeys(message.claude, message.openai);
        break;

      case 'saveGitSettings':
        await this._saveGitSettings(message.settings);
        break;

      case 'gitAction':
        await this._handleGitAction(message.settings);
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
        // Ping is read-only, doesn't need autoexecute approval
        if (message.action !== 'ping') {
          if (!this._requireAutoexecute('MCP Action', 'mcpAction', { action: message.action, serverId: message.serverId })) break;
        }
        await this._handleMcpAction(message.action, message.serverId);
        break;

      case 'addMcpServer':
        await this._addMcpServer();
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

      // Dashboard Panel Handlers
      case 'getDocsStats':
        await this._sendDocsStats();
        break;

      case 'getDbStats':
        await this._sendDbStats();
        break;

      case 'getLogs':
        await this._sendLogs(message.channel, message.limit);
        break;

      case 'removeMcpServer':
        if (typeof message.serverId === 'string') {
          await this.mcpManager.removeServer(message.serverId);
          await this._sendMcpServers();
        }
        break;

      case 'saveSettings':
        await this._saveDashboardSettings(message.settings);
        break;

      case 'openTerminal':
        this._openTerminal();
        break;

      case 'openDevTools':
        vscode.commands.executeCommand('workbench.action.toggleDevTools');
        break;

      case 'reloadPanel':
        this.reload();
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
        if (!this._requireAutoexecute('Workflow Run', 'executeWorkflow', { workflowId: message.workflowId, input: message.input, drawflowData: message.drawflowData })) break;
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

      // Model toolbar handlers
      case 'setChatMode':
        this._setChatMode(message.mode);
        break;

      case 'getGptOpinion':
        await this._handleGetGptOpinion(message);
        break;

      case 'setModel':
        this._setModel(message.model);
        break;

      case 'setReasoning':
        // UI sends level ('medium'|'high'), convert to enabled state
        this._setReasoning(message.level || message.enabled);
        break;

      case 'setConsultantModel':
        // Set the model used for "Get GPT Opinion" feature
        this._consultantModel = message.model;
        logger.log('ui', `Consultant model set to: ${message.model}`);
        break;

      // Station map actions
      case 'stationAction':
        await this._handleStationAction(message.action, message.sceneId);
        break;

      // Whisper binary download
      case 'downloadWhisperBinary':
        await this._downloadWhisperBinary();
        break;

      // Show error notification
      case 'showError':
        vscode.window.showErrorMessage(message.message);
        break;

      // Side chat message (unrelated questions)
      case 'sideChatMessage':
        await this._handleSideChatMessage(message.chatIndex, message.message);
        break;
    }
  }

  /**
   * Handle side chat messages - simple independent conversations
   */
  private async _handleSideChatMessage(chatIndex: number, userMessage: string): Promise<void> {
    try {
      // Use the orchestrator to send a simple message via Claude
      const result = await this.orchestrator.askSingle('claude', userMessage, undefined, [], undefined);

      await this.costTracker.recordUsage(
        'claude',
        result.model,
        result.tokens,
        result.cost,
        'sidechat'
      );

      this._postMessage({
        type: 'sideChatResponse',
        chatIndex,
        response: result.content || 'No response received.',
      });
    } catch (error) {
      this._postMessage({
        type: 'sideChatResponse',
        chatIndex,
        response: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
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

  private async _setModel(model: string): Promise<void> {
    this._currentModel = model;
    logger.log('ui', `Model set to: ${model}`);

    // Update VS Code config so providers pick up the change
    const config = vscode.workspace.getConfiguration('spacecode');
    if (model.startsWith('claude-')) {
      await config.update('claudeModel', model, vscode.ConfigurationTarget.Global);
    } else if (model.startsWith('gpt-') || model.startsWith('o1') || model.startsWith('o3')) {
      await config.update('gptModel', model, vscode.ConfigurationTarget.Global);
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
    logger.log('ui', `Station action: ${action}, scene: ${sceneId}`);

    switch (action) {
      case 'run-gates':
        // Trigger verification gates - call internal method directly
        await this._runGatesCheck();
        break;
      case 'docs-status':
        // Check documentation status
        await this._checkDocsStatus();
        break;
      case 'build-status':
        // Scan git diff to show build/change status
        await this._scanGitDiff();
        break;
      case 'test-status':
        // Run regression tests
        await this._runRegressionTests();
        break;
      case 'open-terminal':
        this._openTerminal();
        break;
      default:
        // Generic action - log it
        logger.log('ui', `Unhandled station action: ${action}`);
        break;
    }
  }

  // Whisper binary download
  private async _downloadWhisperBinary(): Promise<void> {
    try {
      this._postMessage({ type: 'whisperDownloadStarted' });
      // TODO: Implement actual whisper binary download logic
      // For now, show a message that it's not yet implemented
      vscode.window.showInformationMessage('Whisper binary download is not yet implemented. Please install whisper manually.');
      this._postMessage({ type: 'whisperDownloadComplete', success: false, error: 'Not implemented' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Failed to download Whisper: ${msg}`);
      this._postMessage({ type: 'whisperDownloadComplete', success: false, error: msg });
    }
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

      // Store workflow for flow visualization
      this._currentWorkflow = workflow;

      // Emit flow start for workflow
      this._postMessage({ type: 'aiFlowStart' });
      this._postMessage({
        type: 'aiFlowChunk',
        chunk: {
          id: 'workflow-start',
          source: 'agent',
          label: `🔄 ${workflow.name}`,
          tokens: 0,
          similarity: 1.0,
          content: `Starting workflow: ${workflow.name}`
        }
      });

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
    } finally {
      // Clear workflow reference
      this._currentWorkflow = null;
    }
  }

  /**
   * Handle workflow events for AI Flow visualization
   */
  private _handleWorkflowFlowVisualization(event: WorkflowEvent): void {
    if (!this._currentWorkflow) return;

    const workflow = this._currentWorkflow;

    switch (event.type) {
      case 'nodeStart': {
        if (!event.nodeId) break;
        const node = workflow.nodes.find(n => n.id === event.nodeId);
        if (!node || node.type === 'input') break; // Skip input nodes

        if (node.type === 'agent') {
          const config = node.config as AgentNodeConfig;
          const provider = config.provider || 'claude';
          const providerLabel = provider === 'claude' ? 'Claude' : 'GPT';

          // Show agent node processing
          this._postMessage({
            type: 'aiFlowChunk',
            chunk: {
              id: `agent-${event.nodeId}`,
              source: 'agent',
              label: `🤖 ${node.name || providerLabel}`,
              tokens: 0,
              similarity: 0.9,
              content: `Processing with ${providerLabel}...`
            }
          });

          // Show thinking indicator
          this._postMessage({
            type: 'aiFlowThinking',
            stage: `${node.name || providerLabel} processing...`,
            provider: provider
          });
        }
        break;
      }

      case 'nodeComplete': {
        if (!event.nodeId) break;
        const node = workflow.nodes.find(n => n.id === event.nodeId);
        if (!node || node.type === 'input') break;

        if (node.type === 'agent' && event.result) {
          // Update chunk with result preview
          this._postMessage({
            type: 'aiFlowChunk',
            chunk: {
              id: `agent-${event.nodeId}-result`,
              source: 'response',
              label: `✓ ${node.name || 'Agent'}`,
              tokens: Math.ceil((event.result?.length || 0) / 4),
              similarity: 1.0,
              content: event.result.substring(0, 200) + (event.result.length > 200 ? '...' : '')
            }
          });
        }
        break;
      }

      case 'workflowComplete': {
        this._postMessage({
          type: 'aiFlowComplete',
          tokens: { input: 0, output: Math.ceil((event.result?.length || 0) / 4) }
        });
        break;
      }

      case 'workflowError': {
        this._postMessage({
          type: 'aiFlowComplete',
          error: true
        });
        break;
      }
    }
  }

  /**
   * Execute a plan from an approved job
   */
  private async _executePlanFromJob(planId: string): Promise<void> {
    if (!planId) {
      throw new Error('No plan ID provided');
    }

    // Load the plan from storage
    const plan = this.planStorage.loadPlan(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    // Create executor instance
    const executor = new PlanExecutor();

    // Notify webview that execution is starting
    this._postMessage({
      type: 'planExecutionStarted',
      planId,
      planTitle: plan.intent,
      totalSteps: plan.totalSteps
    });

    try {
      // Execute with progress callbacks
      const result = await executor.execute(plan, {
        onOutput: (chunk: string) => {
          this._postMessage({
            type: 'executionOutput',
            planId,
            chunk
          });
        },
        onStepStart: (step) => {
          this._postMessage({
            type: 'planStepStarted',
            planId,
            stepId: step.id,
            stepDescription: step.description
          });
        },
        onStepComplete: (stepResult: StepExecutionResult) => {
          this._postMessage({
            type: 'planStepCompleted',
            planId,
            stepId: stepResult.stepId,
            success: stepResult.success,
            error: stepResult.error
          });
        },
        onPhaseComplete: (phaseResult: PhaseExecutionResult) => {
          this._postMessage({
            type: 'planPhaseCompleted',
            planId,
            phaseId: phaseResult.phaseId,
            success: phaseResult.success,
            summary: phaseResult.summary
          });
        }
      });

      // Send final result
      this._postMessage({
        type: 'planExecutionCompleted',
        planId,
        success: result.success,
        summary: result.summary,
        completedSteps: result.completedSteps,
        failedSteps: result.failedSteps,
        totalTokens: result.totalTokens,
        totalCost: result.totalCost
      });

      // Add to plan history
      await this.planStorage.addHistoryEntry({
        planId,
        action: 'executed',
        timestamp: Date.now(),
        details: {
          success: result.success,
          completedSteps: result.completedSteps,
          failedSteps: result.failedSteps
        }
      });

    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this._postMessage({
        type: 'planExecutionError',
        planId,
        error: msg
      });
      throw error;
    }
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
    if (!planId) {
      throw new Error('No plan ID provided');
    }

    const plan = this.planStorage.loadPlan(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    const executor = new PlanExecutor();
    let completedSteps = 0;
    let failedSteps = 0;

    this._postMessage({
      type: 'planExecutionStarted',
      planId,
      planTitle: plan.intent,
      totalSteps: plan.totalSteps
    });

    try {
      for (let phaseIndex = 0; phaseIndex < plan.phases.length; phaseIndex++) {
        const phase = plan.phases[phaseIndex];
        for (let stepIndex = 0; stepIndex < phase.steps.length; stepIndex++) {
          const step = phase.steps[stepIndex];

          this._postMessage({
            type: 'planStepPending',
            planId,
            stepId: step.id,
            stepDescription: step.description,
            phaseTitle: phase.title,
            phaseIndex,
            stepIndex
          });

          const approved = await this._awaitPlanStepApproval();
          this._pendingStepApproval = null;

          if (!approved) {
            this._postMessage({
              type: 'planExecutionCompleted',
              planId,
              success: false,
              summary: 'Execution stopped by user.',
              completedSteps,
              failedSteps
            });
            await this.planStorage.addHistoryEntry({
              planId,
              action: 'cancelled',
              timestamp: Date.now(),
              details: {
                mode: 'step-by-step',
                completedSteps,
                failedSteps
              }
            });
            return;
          }

          this._postMessage({
            type: 'planStepStarted',
            planId,
            stepId: step.id,
            stepDescription: step.description
          });

          const stepResult = await executor.executeSingleStep(plan, phase, step, {
            onOutput: (chunk: string) => {
              this._postMessage({
                type: 'executionOutput',
                planId,
                chunk
              });
            }
          });

          this._postMessage({
            type: 'planStepCompleted',
            planId,
            stepId: stepResult.stepId,
            success: stepResult.success,
            error: stepResult.error
          });

          if (stepResult.success) {
            completedSteps += 1;
          } else {
            failedSteps += 1;
            this._postMessage({
              type: 'planExecutionCompleted',
              planId,
              success: false,
              summary: 'Execution halted after a failed step.',
              completedSteps,
              failedSteps
            });
            await this.planStorage.addHistoryEntry({
              planId,
              action: 'failed',
              timestamp: Date.now(),
              details: {
                mode: 'step-by-step',
                completedSteps,
                failedSteps,
                stepId: stepResult.stepId,
                error: stepResult.error
              }
            });
            return;
          }
        }

        this._postMessage({
          type: 'planPhaseCompleted',
          planId,
          phaseId: phase.id,
          success: true,
          summary: `Phase ${phaseIndex + 1}: ${phase.steps.length}/${phase.steps.length} steps completed`
        });
      }

      this._postMessage({
        type: 'planExecutionCompleted',
        planId,
        success: true,
        summary: `Execution complete: ${completedSteps}/${plan.totalSteps} steps succeeded.`,
        completedSteps,
        failedSteps
      });

      await this.planStorage.addHistoryEntry({
        planId,
        action: 'executed',
        timestamp: Date.now(),
        details: {
          mode: 'step-by-step',
          completedSteps,
          failedSteps
        }
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this._postMessage({
        type: 'planExecutionError',
        planId,
        error: msg
      });
      throw error;
    }
  }

  // CodeSensei MCP Integration methods (INT-2)
  /**
   * Check Unity MCP connection and sync ALL status indicators:
   * - Header dot (unityMCPAvailable)
   * - MCP settings (server status)
   * - Unity tab (unityStatus)
   */
  private async _checkUnityMCPAvailable(retryCount: number = 0, token?: number): Promise<void> {
    try {
      console.log(`[SpaceCode] Checking Unity MCP availability... (attempt ${retryCount + 1}, token: ${token})`);

      // Try to get editor state - this is more reliable than ping
      // because it tests the actual tool call mechanism
      const editorState = await this._getUnityEditorState();
      let available = editorState !== null;
      console.log('[SpaceCode] Unity MCP check via editor state:', available);

      // Retry once if first check fails (MCP server might be warming up)
      if (!available && retryCount < 1) {
        console.log('[SpaceCode] First check failed, retrying in 1 second...');
        this._postMessage({ type: 'info', message: 'Connecting to Unity...' });
        await new Promise(resolve => setTimeout(resolve, 1000));
        return this._checkUnityMCPAvailable(retryCount + 1, token);
      }

      // Update header dot
      console.log('[SpaceCode] Sending unityMCPAvailable message:', available);
      this._postMessage({ type: 'unityMCPAvailable', available });

      if (available) {
        // Mark server as running in MCP manager
        await this.mcpManager.startServer('unitymcp');
        // Update Unity tab with the editor state we just got
        this._postMessage({
          type: 'unityStatus',
          token: token,
          status: {
            connected: true,
            isPlaying: editorState.isPlaying || false,
            isPaused: editorState.isPaused || false,
            sceneName: editorState.sceneName || 'Unknown Scene',
            isCompiling: editorState.isCompiling || false
          }
        });
        this._postMessage({ type: 'info', message: `Unity connected. Scene: ${editorState.sceneName || 'Unknown'}` });
        // Also get console messages
        const consoleMessages = await this._getUnityConsole();
        this._postMessage({ type: 'unityConsole', messages: consoleMessages });
      } else {
        // Mark server as stopped
        await this.mcpManager.stopServer('unitymcp');
        // Update Unity tab to show disconnected - include token for race condition handling
        this._postMessage({ type: 'unityStatus', token: token, status: { connected: false } });
        this._postMessage({ type: 'info', message: 'Unity not connected. Start Unity and Coplay MCP server.' });
      }

      // Refresh MCP settings display
      await this._sendMcpServers();
    } catch (error) {
      console.error('[SpaceCode] Unity MCP check error:', error);

      // Retry once on error too
      if (retryCount < 1) {
        console.log('[SpaceCode] Check errored, retrying in 1 second...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        return this._checkUnityMCPAvailable(retryCount + 1, token);
      }

      // Update all status indicators to disconnected - include token
      this._postMessage({ type: 'unityMCPAvailable', available: false });
      this._postMessage({ type: 'unityStatus', token: token, status: { connected: false } });
      this._postMessage({ type: 'info', message: 'Unity connection check failed' });
      await this.mcpManager.stopServer('unitymcp');
      await this._sendMcpServers();
    }
  }

  private async _senseiExplain(filePath: string, selection?: string): Promise<void> {
    try {
      this._postMessage({ type: 'senseiLoading', action: 'explain' });

      const result = await this.unityMcpClient.runExplainer(filePath, selection);

      if (result.success) {
        this._postMessage({
          type: 'senseiExplainResult',
          filePath,
          explanation: result.content
        });
      } else {
        this._postMessage({
          type: 'senseiError',
          action: 'explain',
          error: result.error || 'Failed to explain code'
        });
      }
    } catch (error) {
      this._postMessage({
        type: 'senseiError',
        action: 'explain',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async _senseiContextBrief(filePath: string): Promise<void> {
    try {
      const result = await this.unityMcpClient.getContextBrief(filePath);

      if (result.success) {
        this._postMessage({
          type: 'senseiContextBriefResult',
          filePath,
          context: result.content
        });
      } else {
        this._postMessage({
          type: 'senseiError',
          action: 'contextBrief',
          error: result.error || 'Failed to get context brief'
        });
      }
    } catch (error) {
      this._postMessage({
        type: 'senseiError',
        action: 'contextBrief',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async _senseiAssemblyGraph(assemblyName?: string): Promise<void> {
    try {
      const result = await this.unityMcpClient.getAssemblyGraph(assemblyName);

      if (result.success) {
        this._postMessage({
          type: 'senseiAssemblyGraphResult',
          assemblyName,
          graph: result.content
        });
      } else {
        this._postMessage({
          type: 'senseiError',
          action: 'assemblyGraph',
          error: result.error || 'Failed to get assembly graph'
        });
      }
    } catch (error) {
      this._postMessage({
        type: 'senseiError',
        action: 'assemblyGraph',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async _senseiSyncDocs(filePath?: string, sectorId?: string): Promise<void> {
    try {
      this._postMessage({ type: 'senseiLoading', action: 'syncDocs' });

      const result = await this.unityMcpClient.syncDocs(filePath, sectorId);

      if (result.success) {
        this._postMessage({
          type: 'senseiSyncDocsResult',
          filePath,
          sectorId,
          result: result.content
        });
      } else {
        this._postMessage({
          type: 'senseiError',
          action: 'syncDocs',
          error: result.error || 'Failed to sync docs'
        });
      }
    } catch (error) {
      this._postMessage({
        type: 'senseiError',
        action: 'syncDocs',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async _senseiAIReview(filePath?: string, diff?: string): Promise<void> {
    try {
      this._postMessage({ type: 'senseiLoading', action: 'aiReview' });

      const result = await this.unityMcpClient.runAIReview(filePath, diff);

      if (result.success) {
        this._postMessage({
          type: 'senseiAIReviewResult',
          filePath,
          review: result.content
        });
      } else {
        this._postMessage({
          type: 'senseiError',
          action: 'aiReview',
          error: result.error || 'Failed to run AI review'
        });
      }
    } catch (error) {
      this._postMessage({
        type: 'senseiError',
        action: 'aiReview',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // GitHub Integration methods
  private async _checkGitHubAvailable(): Promise<void> {
    try {
      const available = await this.githubAdapter.isAvailable();
      this._postMessage({
        type: 'githubAvailable',
        available
      });
    } catch (error) {
      this._postMessage({
        type: 'githubAvailable',
        available: false
      });
    }
  }

  private async _createGitHubIssue(
    title: string,
    body: string,
    labels?: string[],
    planId?: string
  ): Promise<void> {
    try {
      const issue = await this.githubAdapter.createIssue({
        title,
        body,
        labels
      });

      this._postMessage({
        type: 'githubIssueCreated',
        issue,
        planId
      });

      // Add to plan history if associated with a plan
      if (planId) {
        await this.planStorage.addHistoryEntry({
          planId,
          action: 'issue_created',
          timestamp: Date.now(),
          details: {
            issueNumber: issue.number,
            issueUrl: issue.url
          }
        });
      }

      vscode.window.showInformationMessage(`GitHub issue #${issue.number} created`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this._postMessage({
        type: 'githubError',
        operation: 'createIssue',
        error: msg
      });
      vscode.window.showErrorMessage(`Failed to create GitHub issue: ${msg}`);
    }
  }

  private async _createGitHubPR(
    title: string,
    body: string,
    head: string,
    base?: string,
    planId?: string
  ): Promise<void> {
    try {
      const pr = await this.githubAdapter.createPR({
        title,
        body,
        head,
        base
      });

      this._postMessage({
        type: 'githubPRCreated',
        pr,
        planId
      });

      // Add to plan history if associated with a plan
      if (planId) {
        await this.planStorage.addHistoryEntry({
          planId,
          action: 'pr_created',
          timestamp: Date.now(),
          details: {
            prNumber: pr.number,
            prUrl: pr.url
          }
        });
      }

      vscode.window.showInformationMessage(`GitHub PR #${pr.number} created: ${pr.url}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this._postMessage({
        type: 'githubError',
        operation: 'createPR',
        error: msg
      });
      vscode.window.showErrorMessage(`Failed to create GitHub PR: ${msg}`);
    }
  }

  private async _listGitHubIssues(
    state?: 'open' | 'closed' | 'all',
    labels?: string[],
    limit?: number
  ): Promise<void> {
    try {
      const issues = await this.githubAdapter.getIssues({
        state,
        labels,
        limit
      });

      this._postMessage({
        type: 'githubIssuesList',
        issues
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this._postMessage({
        type: 'githubError',
        operation: 'listIssues',
        error: msg
      });
    }
  }

  private async _listGitHubPRs(
    state?: 'open' | 'closed' | 'merged' | 'all'
  ): Promise<void> {
    try {
      const prs = await this.githubAdapter.getPRs(state);

      this._postMessage({
        type: 'githubPRsList',
        prs
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this._postMessage({
        type: 'githubError',
        operation: 'listPRs',
        error: msg
      });
    }
  }

  // Plan Comparison (VER-2)
  private async _comparePlanToDiff(planId: string, diffResult?: DiffScanResult): Promise<void> {
    try {
      // Load the plan
      const plan = this.planStorage.loadPlan(planId);
      if (!plan) {
        this._postMessage({
          type: 'planComparisonError',
          planId,
          error: `Plan not found: ${planId}`
        });
        return;
      }

      // Get diff result - either from provided data or scan fresh
      let diff: DiffScanResult;
      if (diffResult) {
        diff = diffResult;
      } else {
        diff = await this.diffScanner.scanAll();
      }

      // Compare plan to diff
      const result = this.planComparer.compare(plan, diff);

      // Post detailed results
      this._postMessage({
        type: 'planComparisonResult',
        planId,
        result: {
          score: result.score,
          verdict: result.verdict,
          summary: result.summary,
          plannedFiles: result.plannedFiles,
          actualFiles: result.actualFiles,
          matchedFiles: result.matchedFiles.map(m => ({
            plannedFile: m.plannedFile,
            actualFile: m.actualFile,
            plannedChangeType: m.plannedChangeType,
            actualStatus: m.actualStatus,
            match: m.match
          })),
          unexpectedChanges: result.unexpectedChanges.map(u => ({
            file: u.file,
            status: u.status,
            additions: u.additions,
            deletions: u.deletions,
            severity: u.severity,
            reason: u.reason
          })),
          missingChanges: result.missingChanges.map(m => ({
            file: m.file,
            plannedChangeType: m.plannedChangeType,
            severity: m.severity,
            stepDescription: m.step?.description
          }))
        }
      });

      // Add to plan history
      await this.planStorage.addHistoryEntry({
        planId,
        action: 'compared',
        timestamp: Date.now(),
        details: {
          score: result.score,
          verdict: result.verdict,
          matchedCount: result.matchedFiles.length,
          unexpectedCount: result.unexpectedChanges.length,
          missingCount: result.missingChanges.length
        }
      });

    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this._postMessage({
        type: 'planComparisonError',
        planId,
        error: msg
      });
    }
  }

  // --- Git Operations Implementation ---
  private async _getGitStatus(): Promise<void> {
    try {
      const status = await this.gitAdapter.getStatus();
      this._postMessage({ type: 'gitStatus', status });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this._postMessage({ type: 'gitError', operation: 'status', error: msg });
    }
  }

  private async _gitStageFiles(files?: string[]): Promise<void> {
    try {
      let success: boolean;
      if (files && files.length > 0) {
        success = await this.gitAdapter.stageFiles(files);
      } else {
        success = await this.gitAdapter.stageAll();
      }
      if (success) {
        await this._getGitStatus();
        vscode.window.showInformationMessage('Files staged successfully');
      } else {
        this._postMessage({ type: 'gitError', operation: 'stage', error: 'Failed to stage files' });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this._postMessage({ type: 'gitError', operation: 'stage', error: msg });
    }
  }

  private async _gitCommit(message: string, files?: string[]): Promise<void> {
    try {
      if (!message || message.trim() === '') {
        this._postMessage({ type: 'gitError', operation: 'commit', error: 'Commit message is required' });
        return;
      }
      const result = await this.gitAdapter.commit(message, files);
      if (result.success) {
        await this._getGitStatus();
        vscode.window.showInformationMessage('Committed: ' + (result.hash?.substring(0, 7) || 'success'));
        this._postMessage({ type: 'gitCommitResult', success: true, hash: result.hash });
      } else {
        this._postMessage({ type: 'gitError', operation: 'commit', error: result.error || 'Commit failed' });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this._postMessage({ type: 'gitError', operation: 'commit', error: msg });
    }
  }

  private async _gitCreateBranch(name: string, checkout: boolean = true): Promise<void> {
    try {
      if (!name || name.trim() === '') {
        this._postMessage({ type: 'gitError', operation: 'createBranch', error: 'Branch name is required' });
        return;
      }
      const success = await this.gitAdapter.createBranch(name, checkout);
      if (success) {
        await this._getGitStatus();
        vscode.window.showInformationMessage('Branch created: ' + name);
        this._postMessage({ type: 'gitBranchCreated', name });
      } else {
        this._postMessage({ type: 'gitError', operation: 'createBranch', error: 'Failed to create branch' });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this._postMessage({ type: 'gitError', operation: 'createBranch', error: msg });
    }
  }

  private async _gitCheckout(ref: string): Promise<void> {
    try {
      if (!ref || ref.trim() === '') {
        this._postMessage({ type: 'gitError', operation: 'checkout', error: 'Branch/ref is required' });
        return;
      }
      const success = await this.gitAdapter.checkout(ref);
      if (success) {
        await this._getGitStatus();
        vscode.window.showInformationMessage('Checked out: ' + ref);
      } else {
        this._postMessage({ type: 'gitError', operation: 'checkout', error: 'Checkout failed' });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this._postMessage({ type: 'gitError', operation: 'checkout', error: msg });
    }
  }

  private async _gitPush(remote: string = 'origin', branch?: string, setUpstream: boolean = false): Promise<void> {
    try {
      const result = await this.gitAdapter.push(remote, branch, setUpstream);
      if (result.success) {
        await this._getGitStatus();
        vscode.window.showInformationMessage('Pushed successfully');
        this._postMessage({ type: 'gitPushResult', success: true });
      } else {
        this._postMessage({ type: 'gitError', operation: 'push', error: result.error || 'Push failed' });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this._postMessage({ type: 'gitError', operation: 'push', error: msg });
    }
  }

  private async _gitPull(remote: string = 'origin', branch?: string): Promise<void> {
    try {
      const result = await this.gitAdapter.pull(remote, branch);
      if (result.success) {
        await this._getGitStatus();
        vscode.window.showInformationMessage('Pulled successfully');
        this._postMessage({ type: 'gitPullResult', success: true });
      } else {
        this._postMessage({ type: 'gitError', operation: 'pull', error: result.error || 'Pull failed' });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this._postMessage({ type: 'gitError', operation: 'pull', error: msg });
    }
  }

  private async _getRecentCommits(count: number = 10): Promise<void> {
    try {
      const commits = await this.gitAdapter.getRecentCommits(count);
      this._postMessage({ type: 'recentCommits', commits });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this._postMessage({ type: 'gitError', operation: 'log', error: msg });
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
    const { text, mode, chatMode, includeSelection, injectContext, docTarget, images, history, claudeSessionId, chatId, profile, sectorId } = message;

    // Normalize provider: ensure we use 'claude' or 'gpt', not tab names
    const provider = (mode === 'claude' || mode === 'gpt') ? mode : 'claude';

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
    if (typeof profile === 'string' && (profile === 'yard' || profile === 'scout' || profile === 'battleship')) {
      this._shipProfile = profile;
    }
    if (typeof sectorId === 'string') {
      this._shipSectorId = sectorId;
    }
    if (typeof docTarget === 'string') {
      this._docTarget = docTarget;
    }
    if (!this._requireDocTarget('Send message')) {
      this._postMessage({
        type: 'error',
        message: 'Select a docs file before sending when not in Yard.',
        chatId,
      });
      return;
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
      // === AI Flow Visualization: Event-driven approach ===
      // Step 1: Start retrieval - show query node
      this._postMessage({
        type: 'aiFlowStart',
        query: text,
        queryTokens: Math.ceil(text.length / 4)
      });

      // Small delay for animation effect
      await new Promise(r => setTimeout(r, 100));

      // Step 2: Add sector rules chunk (only if we have actual rules)
      const sectorConfig = this._sectorRules?.get(this._shipSectorId);
      const hasActualRules = sectorConfig?.rules && sectorConfig.rules.length > 0;
      // Show sector rules in ALL modes (not just swarm) - they're part of the context!
      if (this._shipSectorId && hasActualRules) {
        // Get sector rules content
        const sectorRulesText = sectorConfig.rules.join('\n• ');
        this._postMessage({
          type: 'aiFlowChunk',
          chunk: {
            id: 'sector',
            source: 'sector',
            label: this._shipSectorId.toUpperCase() + ' Rules',
            tokens: Math.ceil(sectorRulesText.length / 4),
            similarity: 1.0,
            content: '• ' + sectorRulesText
          }
        });
        await new Promise(r => setTimeout(r, 150));
      }

      // Step 3: Add chat history chunks one by one (with content preview)
      let recentHistory = history || [];
      if (chatMode === 'solo') {
        const lastUser = [...recentHistory].reverse().find((h: any) => (h.role || '').toLowerCase().trim() === 'user');
        recentHistory = lastUser ? [lastUser] : [];
      } else {
        recentHistory = recentHistory.slice(-3);
      }
      console.log('[SpaceCode DEBUG] Chat history for visualization:', recentHistory.map((h: any) => ({ role: h.role, contentLen: h.content?.length })));
      for (let i = 0; i < recentHistory.length; i++) {
        const h = recentHistory[i] as { role: string; content: string };
        // Normalize role comparison (handle case differences)
        const normalizedRole = (h.role || '').toLowerCase().trim();
        const isUserMsg = normalizedRole === 'user';
        console.log(`[SpaceCode DEBUG] History[${i}]: role="${h.role}" normalized="${normalizedRole}" isUser=${isUserMsg}`);
        this._postMessage({
          type: 'aiFlowChunk',
          chunk: {
            id: `chat-${i}`,
            source: 'chat',
            label: isUserMsg ? 'You' : 'Assistant',
            tokens: Math.ceil(h.content.length / 4),
            similarity: 0.8 - (i * 0.1),
            content: h.content.substring(0, 200) + (h.content.length > 200 ? '...' : '')  // Content preview!
          }
        });
        await new Promise(r => setTimeout(r, 100));
      }

      // Step 4: Search and add KB chunks one by one (with content)
      let kbContext = '';
      if (this.knowledgeBase.isEmbeddingModelReady()) {
        const kbResults = await this.knowledgeBase.semanticSearch(text, 5);
        for (let i = 0; i < kbResults.length; i++) {
          const result = kbResults[i];
          const entry = this.knowledgeBase.getEntry(result.chunk.sourceId);
          if (entry && result.similarity > 0.3) {
            // Emit chunk for visualization with actual content
            this._postMessage({
              type: 'aiFlowChunk',
              chunk: {
                id: `kb-${i}`,
                source: 'kb',
                label: entry.title || 'Knowledge Base',
                tokens: Math.ceil(result.chunk.text.length / 4),
                similarity: result.similarity,
                content: result.chunk.text.substring(0, 300) + (result.chunk.text.length > 300 ? '...' : '')  // Content preview!
              }
            });
            await new Promise(r => setTimeout(r, 120));

            // Build context string
            if (!kbContext) {
              kbContext = '\n\n=== Relevant Knowledge Base Context ===\n';
            }
            kbContext += `\n[Source: ${entry.title}]\n${result.chunk.text}\n`;
          }
        }
        if (kbContext) {
          kbContext += '\n=== End of Knowledge Base Context ===\n\n';
          console.log(`[SpaceCode] KB context added: ${kbResults.length} chunks, ${kbContext.length} chars`);
        }
      }

      // Prepend KB context to the user's message if found
      const contextWithKb = kbContext ? kbContext + context : context;

      // Step 5: Signal thinking phase with provider info
      const providerLabel = provider === 'claude' ? 'Claude' : 'GPT';
      this._postMessage({
        type: 'aiFlowThinking',
        stage: `${providerLabel} generating...`,
        provider: provider  // Pass provider for visual distinction
      });

      // Handle chat modes: solo, swarm
      if (chatMode === 'swarm') {
        // Swarm mode: For now, fall back to single AI
        const sessionId = provider === 'claude' ? claudeSessionId : undefined;
        const response = await this.orchestrator.askSingle(provider, contextWithKb, undefined, history || [], sessionId, chatId);
        await this.costTracker.recordUsage(
          provider,
          response.model,
          response.tokens,
          response.cost,
          'chat'
        );
        // Signal flow complete
        this._postMessage({ type: 'aiFlowComplete', tokens: response.tokens.output });
        this._postMessage({
          type: 'complete',
          stats: {},
          chatId,
          tokens: response.tokens
        });

      } else {
        // Solo mode (default): Single AI based on selected provider
        const sessionId = provider === 'claude' ? claudeSessionId : undefined;
        const response = await this.orchestrator.askSingle(provider, contextWithKb, undefined, history || [], sessionId, chatId);
        await this.costTracker.recordUsage(
          provider,
          response.model,
          response.tokens,
          response.cost,
          'chat'
        );
        // Signal flow complete
        this._postMessage({ type: 'aiFlowComplete', tokens: response.tokens.output });
        this._postMessage({
          type: 'complete',
          stats: {},
          chatId,
          tokens: response.tokens
        });
      }
    } catch (error) {
      // Signal flow error
      this._postMessage({ type: 'aiFlowComplete', error: true });
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

    // Also send git settings with auto-detection
    const detected = await this._detectGitInfo();
    const overrideRepoUrl = config.get<string>('gitRepoUrl', '');
    const overrideBranch = config.get<string>('gitBranch', '');

    this._postMessage({
      type: 'gitSettings',
      settings: {
        // Use override if set, otherwise use detected
        repoUrl: overrideRepoUrl || detected.repoUrl,
        branch: overrideBranch || detected.branch,
        commitMessage: config.get('gitCommitMessage', ''),
        autoPush: config.get('gitAutoPush', true),
        // Also send detected values so UI can show them
        detectedRepoUrl: detected.repoUrl,
        detectedBranch: detected.branch,
        // Flags to know if user has overridden
        hasRepoUrlOverride: !!overrideRepoUrl,
        hasBranchOverride: !!overrideBranch,
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

  /**
   * Auto-detect git repository info from current workspace
   */
  private async _detectGitInfo(): Promise<{ repoUrl: string; branch: string }> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) {
      return { repoUrl: '', branch: 'main' };
    }

    let repoUrl = '';
    let branch = 'main';

    try {
      // Get remote URL
      const { execSync } = require('child_process');
      repoUrl = execSync('git remote get-url origin', {
        cwd: workspaceFolder,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();
    } catch {
      // Not a git repo or no origin remote
    }

    try {
      // Get current branch
      const { execSync } = require('child_process');
      branch = execSync('git branch --show-current', {
        cwd: workspaceFolder,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim() || 'main';
    } catch {
      // Not a git repo
    }

    return { repoUrl, branch };
  }

  private async _saveGitSettings(settings: { repoUrl?: string; branch?: string; commitMessage?: string; autoPush?: boolean }): Promise<void> {
    const config = vscode.workspace.getConfiguration('spacecode');

    // Save to WORKSPACE settings (per-project), not Global
    if (settings.repoUrl !== undefined) {
      await config.update('gitRepoUrl', settings.repoUrl, vscode.ConfigurationTarget.Workspace);
    }
    if (settings.branch !== undefined) {
      await config.update('gitBranch', settings.branch, vscode.ConfigurationTarget.Workspace);
    }
    if (settings.commitMessage !== undefined) {
      await config.update('gitCommitMessage', settings.commitMessage, vscode.ConfigurationTarget.Workspace);
    }
    if (settings.autoPush !== undefined) {
      await config.update('gitAutoPush', settings.autoPush, vscode.ConfigurationTarget.Workspace);
    }

    this._postMessage({ type: 'gitSettingsSaved' });
    vscode.window.showInformationMessage('Git settings saved to workspace!');
  }

  private async _handleGitAction(settings: { repoUrl: string; branch: string; commitMessage?: string; autoPush: boolean }): Promise<void> {
    if (!settings?.repoUrl) {
      vscode.window.showErrorMessage('Git repository URL not configured. Go to Settings → Git Settings.');
      return;
    }

    // Build the AI prompt with git settings
    const prompt = `Upload the current changes to GitHub with the following settings:
- Repository: ${settings.repoUrl}
- Branch: ${settings.branch || 'main'}
- Commit message: ${settings.commitMessage || 'Update from SpaceCode'}
- Auto-push: ${settings.autoPush ? 'Yes' : 'No (commit only)'}

Please:
1. Stage all changes (git add)
2. Create a commit with an appropriate message${settings.commitMessage ? ` based on: "${settings.commitMessage}"` : ''}
3. ${settings.autoPush ? 'Push to the remote repository' : 'Do not push yet, just commit'}

Show me what changes will be committed first.`;

    // Send directly - insert and auto-send
    this._postMessage({
      type: 'sendGitPrompt',
      prompt: prompt
    });
  }

  private async _sendMcpServers(): Promise<void> {
    const servers = this.mcpManager.getAllServers();
    this._postMessage({ type: 'mcpServers', servers });
  }

  private async _addMcpServer(): Promise<void> {
    try {
      // Prompt for server name
      const name = await vscode.window.showInputBox({
        prompt: 'Enter MCP server name',
        placeHolder: 'e.g., My MCP Server',
      });
      if (!name) return;

      // Prompt for server URL
      const url = await vscode.window.showInputBox({
        prompt: 'Enter MCP server URL',
        placeHolder: 'e.g., http://localhost:3000',
        validateInput: (value) => {
          if (!value) return 'URL is required';
          try {
            new URL(value);
            return null;
          } catch {
            return 'Please enter a valid URL';
          }
        },
      });
      if (!url) return;

      // Add the server
      await this.mcpManager.addCustomServer(name, 'http', { url });

      vscode.window.showInformationMessage(`MCP server "${name}" added`);
      await this._sendMcpServers();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Failed to add MCP server: ${msg}`);
    }
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
        case 'ping':
          // Ping HTTP MCP server to check connection
          await this._pingMcpServer(serverId);
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

  private async _pingMcpServer(serverId: string): Promise<void> {
    const server = this.mcpManager.getServer(serverId);
    if (!server || !server.url) {
      this._postMessage({ type: 'error', message: 'Server has no URL configured' });
      return;
    }

    // Use the mcpClient to ping
    const { MCPClient } = await import('../services/mcpClient');
    const client = new MCPClient(server.url);

    // Check if this is a Unity MCP server (case-insensitive)
    const isUnityMcp = serverId.toLowerCase().includes('unity') || server.name.toLowerCase().includes('unity');
    console.log('[SpaceCode] Pinging server:', serverId, 'isUnityMcp:', isUnityMcp);

    try {
      const available = await client.ping();
      console.log('[SpaceCode] Ping result for', serverId, ':', available);
      if (available) {
        await this.mcpManager.startServer(serverId); // Mark as running
        this._postMessage({ type: 'info', message: `${server.name} connected successfully` });
        // Also update the header status dot and Unity tab if this is Unity MCP
        if (isUnityMcp) {
          console.log('[SpaceCode] Sending unityMCPAvailable: true');
          this._postMessage({ type: 'unityMCPAvailable', available: true });
          // Sync Unity tab status - also update the Unity panel connection state
          this._refreshUnityStatus();
        }
      } else {
        await this.mcpManager.stopServer(serverId); // Mark as stopped
        this._postMessage({ type: 'error', message: `${server.name} is not responding` });
        if (isUnityMcp) {
          this._postMessage({ type: 'unityMCPAvailable', available: false });
          // Update Unity tab to show disconnected
          this._postMessage({ type: 'unityStatus', status: { connected: false } });
        }
      }
    } catch (error) {
      console.error('[SpaceCode] Ping error for', serverId, ':', error);
      await this.mcpManager.stopServer(serverId);
      this._postMessage({ type: 'error', message: `Failed to connect to ${server.name}: ${error}` });
      if (isUnityMcp) {
        this._postMessage({ type: 'unityMCPAvailable', available: false });
        // Update Unity tab to show disconnected
        this._postMessage({ type: 'unityStatus', status: { connected: false } });
      }
    }
  }

  private async _sendKbEntries(): Promise<void> {
    const entries = this.knowledgeBase.getAllEntries();
    const tags = this.knowledgeBase.getAllTags();
    const stats = this.knowledgeBase.getEmbeddingStats();
    this._postMessage({ type: 'kbEntries', entries, tags });
    this._postMessage({ type: 'embedderStatus', status: this.knowledgeBase.getEmbedderStatus(), stats });
  }

  // Dashboard Panel Handlers
  private async _sendDocsStats(): Promise<void> {
    try {
      const entries = this.knowledgeBase.getAllEntries();
      const tags = this.knowledgeBase.getAllTags();
      const stats = this.knowledgeBase.getEmbeddingStats();

      this._postMessage({
        type: 'docsStats',
        stats: {
          totalDocs: entries.length,
          embeddedDocs: stats.embeddedEntries,
          totalChunks: stats.totalChunks,
          tags: tags,
          sources: entries.map(e => ({
            id: e.id,
            title: e.title,
            type: e.type,
            embedded: e.embedded,
            chunkCount: e.embedded ? 1 : 0,
          })),
        },
      });
    } catch (error) {
      this._postMessage({
        type: 'docsStats',
        stats: { totalDocs: 0, embeddedDocs: 0, totalChunks: 0, tags: [], sources: [] },
        error: error instanceof Error ? error.message : 'Failed to load docs stats',
      });
    }
  }

  private async _sendDbStats(): Promise<void> {
    try {
      const memStats = getMemoryStats();

      this._postMessage({
        type: 'dbStats',
        stats: {
          messages: memStats.messages,
          vectors: memStats.vectors,
          embedding: memStats.embedding,
        },
      });
    } catch (error) {
      this._postMessage({
        type: 'dbStats',
        stats: {
          messages: { count: 0, sessions: 0 },
          vectors: { count: 0, dimensions: 0 },
          embedding: { ready: false, model: null },
        },
        error: error instanceof Error ? error.message : 'Failed to load DB stats',
      });
    }
  }

  private async _sendLogs(channel?: LogChannel, limit: number = 100): Promise<void> {
    try {
      const history = logger.getHistory(channel, limit);

      this._postMessage({
        type: 'logs',
        logs: history.map(entry => ({
          timestamp: entry.timestamp.toISOString(),
          channel: entry.channel,
          level: entry.level,
          message: entry.message,
          data: entry.data,
        })),
        channel,
      });
    } catch (error) {
      this._postMessage({
        type: 'logs',
        logs: [],
        error: error instanceof Error ? error.message : 'Failed to load logs',
      });
    }
  }

  private async _saveDashboardSettings(settings: {
    claudeKey?: string;
    gptKey?: string;
    maxTokens?: number;
    defaultModel?: string;
  }): Promise<void> {
    try {
      const config = vscode.workspace.getConfiguration('spacecode');

      if (settings.claudeKey !== undefined) {
        await config.update('claudeApiKey', settings.claudeKey, vscode.ConfigurationTarget.Global);
      }
      if (settings.gptKey !== undefined) {
        await config.update('openaiApiKey', settings.gptKey, vscode.ConfigurationTarget.Global);
      }
      if (settings.maxTokens !== undefined) {
        await config.update('maxTokens', settings.maxTokens, vscode.ConfigurationTarget.Global);
      }
      if (settings.defaultModel !== undefined) {
        await config.update('defaultModel', settings.defaultModel, vscode.ConfigurationTarget.Global);
      }

      this._postMessage({ type: 'settingsSaved', success: true });
      await this._sendSettings();
    } catch (error) {
      this._postMessage({
        type: 'settingsSaved',
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save settings',
      });
    }
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

  /**
   * Hard reload the webview panel (regenerates HTML with new buildId for cache-busting)
   */
  public reload(): void {
    this._panel.webview.html = this._getHtmlContent();
    vscode.window.showInformationMessage('SpaceCode panel reloaded');
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
    // Cache-bust: generate unique buildId for this render
    const buildId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);

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
    const panelCssUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'panel.css')
    );
    const d3JsUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'd3.v7.min.js')
    );
    const panelJsUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'panel.js')
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

    const stationMapJson = JSON.stringify(stationMap);
    const stationMapBase64 = Buffer.from(stationMapJson, 'utf8').toString('base64');
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${cspSource}; script-src 'unsafe-inline' 'unsafe-eval' ${cspSource}; img-src ${cspSource} https: data:; font-src ${cspSource} data:;">
  <title>SpaceCode</title>
  <link rel="stylesheet" href="${panelCssUri}">
</head>
<body>
  <div id="sc-toast-container" class="sc-toast-container"></div>
  <div class="header">
    <div class="header-left">
      <div class="logo">
        <img src="${iconUri}" alt="SpaceCode" style="width: 24px; height: 24px; vertical-align: middle; margin-right: 8px;"> SpaceCode
        <span style="font-size: 9px; color: var(--text-secondary); margin-left: 8px; opacity: 0.6;" title="Build ID: ${buildId}">v${buildId}</span>
        <span id="unity-status" class="unity-status" title="Unity: Click to check status or reload" onclick="unityHeaderClick()">
          <span class="status-dot checking"></span>
          <span class="status-label">Unity</span>
        </span>
      </div>
      <div class="mode-selector">
        <button class="mode-btn chat active" data-tab="chat" onclick="switchTab('chat')">
          <svg viewBox="0 0 24 24" width="14" height="14" style="margin-right: 4px;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
          Chat
        </button>
        <button class="mode-btn station" data-tab="station" onclick="switchTab('station')">
          <svg viewBox="0 0 24 24" width="14" height="14" style="margin-right: 4px;"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>
          Station
        </button>
        <button class="mode-btn agents" data-tab="agents" onclick="switchTab('agents')">
          <svg viewBox="0 0 24 24" width="14" height="14" style="margin-right: 4px;"><circle cx="12" cy="8" r="5"></circle><path d="M3 21v-2a7 7 0 0 1 7-7h4a7 7 0 0 1 7 7v2"></path></svg>
          Agents
        </button>
        <button class="mode-btn skills" data-tab="skills" onclick="switchTab('skills')">
          <svg viewBox="0 0 24 24" width="14" height="14" style="margin-right: 4px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
          Skills
        </button>
        <button class="mode-btn dashboard" data-tab="dashboard" onclick="switchTab('dashboard')">
          <svg viewBox="0 0 24 24" width="14" height="14" style="margin-right: 4px;"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
          Dashboard
        </button>
      </div>
    </div>
    <div class="header-right">
      <button class="header-btn icon-only" onclick="reloadPanel()" title="Reload Panel">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-2.64-6.36"></path>
          <polyline points="22 4 21 8 17 7"></polyline>
        </svg>
      </button>
    </div>
  </div>

  <div class="content">
    <div class="main-split">
      <div class="left-pane">
        <!-- Chat Section -->
        <div class="chat-section" id="chatSection">
      <!-- Chat Header (tabs + new chat) -->
      <div class="chat-header-bar" id="chatModeSwitcher">
        <button class="chat-new-btn" onclick="newChat()" title="New chat">
          <span class="chat-new-icon">＋</span>
          New
        </button>
        <div class="chat-mode-toggles" id="chatModeToggles" style="display: none;">
          <button class="toggle-icon-btn" onclick="toggleContextFlowPanel()" title="Toggle Context Flow">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"></circle>
              <circle cx="12" cy="4" r="1"></circle>
              <circle cx="4" cy="12" r="1"></circle>
              <circle cx="20" cy="12" r="1"></circle>
              <circle cx="12" cy="20" r="1"></circle>
              <line x1="12" y1="7" x2="12" y2="9"></line>
              <line x1="7" y1="12" x2="9" y2="12"></line>
              <line x1="15" y1="12" x2="17" y2="12"></line>
              <line x1="12" y1="15" x2="12" y2="17"></line>
            </svg>
          </button>
          <button class="toggle-icon-btn" onclick="toggleSwarmSidebar()" title="Toggle Swarm Workers">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="7" height="7" rx="1"></rect>
              <rect x="14" y="3" width="7" height="7" rx="1"></rect>
              <rect x="3" y="14" width="7" height="7" rx="1"></rect>
              <rect x="14" y="14" width="7" height="7" rx="1"></rect>
            </svg>
          </button>
        </div>
      </div>

      <div class="chat-tabs" id="chatTabs"></div>

      <!-- Chat Container (horizontal split: chat left, flow right) -->
      <div class="chat-container" id="chatContainer">
        <!-- Left Column: Chat + Input/Status -->
        <div class="chat-column" id="chatColumn">
          <!-- Primary Chat Panel (left side) -->
          <div class="chat-panel primary" id="chatPanelPrimary">
            <div class="chat-messages" id="chatMessages">
              <div class="empty-state" id="emptyState">
                <h2>Welcome to SpaceCode</h2>
                <p>Your AI coding companion for large codebases</p>
                <div class="quick-actions">
                  <button class="quick-action" onclick="insertPrompt('Review my code')">Review Code</button>
                  <button class="quick-action" onclick="insertPrompt('Explain this function')">Explain Code</button>
                  <button class="quick-action" onclick="insertPrompt('Where should I add this feature?')">Where To Add</button>
                  <button class="quick-action" onclick="insertPrompt('Help me debug')">Debug</button>
                </div>
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
                <span class="toolbar-icon" id="modeIcon">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 5h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"></path>
                  </svg>
                </span>
                <span id="selectedModeLabel">Chat</span>
                <span class="toolbar-arrow">▾</span>
              </button>
              <div class="toolbar-dropdown" id="modeDropdown">
                <div class="dropdown-header">Switch mode</div>
                <button class="dropdown-option" onclick="selectChatMode('chat')">
                  <span class="option-icon">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 5h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"></path>
                    </svg>
                  </span> Chat
                  <span class="option-check" id="modeCheck-chat">✓</span>
                </button>
                <button class="dropdown-option" onclick="selectChatMode('agent')">
                  <span class="option-icon">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="3" y="8" width="18" height="10" rx="2"></rect>
                      <circle cx="9" cy="13" r="1.5"></circle>
                      <circle cx="15" cy="13" r="1.5"></circle>
                      <path d="M12 8V5"></path>
                      <circle cx="12" cy="4" r="1"></circle>
                    </svg>
                  </span> Agent
                  <span class="option-check" id="modeCheck-agent"></span>
                </button>
                <button class="dropdown-option" onclick="selectChatMode('agent-full')">
                  <span class="option-icon">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M13 2L3 14h7l-1 8 10-12h-7z"></path>
                    </svg>
                  </span> Agent (full access)
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
                <span class="toolbar-icon" id="reasoningIcon">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9 6a3 3 0 0 0-3 3v1a2 2 0 0 0 0 4v1a3 3 0 0 0 3 3"></path>
                    <path d="M15 6a3 3 0 0 1 3 3v1a2 2 0 0 1 0 4v1a3 3 0 0 1-3 3"></path>
                    <path d="M9 6h6"></path>
                    <path d="M9 18h6"></path>
                    <path d="M12 6v12"></path>
                  </svg>
                </span>
                <span id="selectedReasoningLabel">Medium</span>
                <span class="toolbar-arrow">▾</span>
              </button>
              <div class="toolbar-dropdown" id="reasoningDropdown">
                <div class="dropdown-header">Select reasoning</div>
                <button class="dropdown-option" onclick="selectReasoning('medium')">
                  <span class="option-icon">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M9 6a3 3 0 0 0-3 3v1a2 2 0 0 0 0 4v1a3 3 0 0 0 3 3"></path>
                      <path d="M15 6a3 3 0 0 1 3 3v1a2 2 0 0 1 0 4v1a3 3 0 0 1-3 3"></path>
                      <path d="M9 6h6"></path>
                      <path d="M9 18h6"></path>
                      <path d="M12 6v12"></path>
                    </svg>
                  </span> Medium
                  <span class="option-check" id="reasoningCheck-medium">✓</span>
                </button>
                <button class="dropdown-option" onclick="selectReasoning('high')">
                  <span class="option-icon">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M9 6a3 3 0 0 0-3 3v1a2 2 0 0 0 0 4v1a3 3 0 0 0 3 3"></path>
                      <path d="M15 6a3 3 0 0 1 3 3v1a2 2 0 0 1 0 4v1a3 3 0 0 1-3 3"></path>
                      <path d="M9 6h6"></path>
                      <path d="M9 18h6"></path>
                      <path d="M12 6v12"></path>
                    </svg>
                  </span> High
                  <span class="option-check" id="reasoningCheck-high"></span>
                </button>
              </div>
            </div>

            <!-- Separator between Claude settings and GPT Consultant -->
            <div class="toolbar-divider">|</div>

            <!-- Consultant Model Selector (for GPT Opinion) -->
            <div class="toolbar-item" id="consultantSelectorContainer" title="Model used for 'Get GPT Opinion'">
              <button class="toolbar-dropdown-btn consultant-btn" onclick="toggleToolbarDropdown('consultantDropdown')">
                <span class="toolbar-icon consultant-icon">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="9" cy="7" r="4"></circle>
                    <circle cx="17" cy="7" r="4"></circle>
                    <path d="M3 21v-2a4 4 0 0 1 4-4h4"></path>
                    <path d="M14 21v-2a4 4 0 0 1 4-4h3"></path>
                  </svg>
                </span>
                <span id="selectedConsultantLabel">GPT-4o</span>
                <span class="toolbar-arrow">▾</span>
              </button>
              <div class="toolbar-dropdown" id="consultantDropdown">
                <div class="dropdown-header">Consultant Model</div>
                <div class="dropdown-hint">Used for "Get GPT Opinion"</div>
                <button class="dropdown-option" onclick="selectConsultant('gpt-4o')">
                  GPT-4o
                  <span class="option-check" id="consultantCheck-gpt-4o">✓</span>
                </button>
                <button class="dropdown-option" onclick="selectConsultant('gpt-4o-mini')">
                  GPT-4o Mini
                  <span class="option-check" id="consultantCheck-gpt-4o-mini"></span>
                </button>
                <button class="dropdown-option" onclick="selectConsultant('gpt-5.2-codex')">
                  GPT-5.2-Codex
                  <span class="option-check" id="consultantCheck-gpt-5.2-codex"></span>
                </button>
                <button class="dropdown-option" onclick="selectConsultant('o1')">
                  o1 (Reasoning)
                  <span class="option-check" id="consultantCheck-o1"></span>
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
                  <div class="drop-zone-icon">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="3" y="6" width="18" height="14" rx="2"></rect>
                      <circle cx="12" cy="13" r="4"></circle>
                      <path d="M9 6l1.5-2h3L15 6"></path>
                    </svg>
                  </div>
                  Drop images here
                </div>
                <div class="attached-images" id="attachedImages"></div>
                <!-- Input Toolbar - icon row above textarea -->
                <div class="input-toolbar" id="inputToolbar">
                  <button class="toolbar-icon-btn" onclick="toggleDropZone()" title="Attach image">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"></path>
                    </svg>
                  </button>
                  <button class="toolbar-icon-btn has-fill" onclick="handleGitAction()" title="Git operations">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M21.62 11.11l-8.73-8.73a1.29 1.29 0 00-1.83 0l-1.82 1.82 2.32 2.32A1.53 1.53 0 0113 8.55v6a1.52 1.52 0 01-.53 1.16 1.53 1.53 0 01-1 2.62 1.52 1.52 0 01-1.52-1.52 1.5 1.5 0 01.45-1.08l-.02-5.91a1.52 1.52 0 01-.83-2 1.5 1.5 0 01.33-.46l-2.3-2.3-6.07 6.09a1.29 1.29 0 000 1.83l8.73 8.73a1.29 1.29 0 001.83 0l8.55-8.55a1.29 1.29 0 000-1.83z"/>
                    </svg>
                  </button>
                  <!-- Solo/Swarm mode switcher -->
                  <div class="input-mode-switcher" id="inputModeSwitcher">
                    <button class="input-mode-btn active" data-chat-mode="solo" onclick="switchChatMode('solo')" title="Single AI conversation">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"></circle><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"></path></svg>
                    </button>
                    <button class="input-mode-btn" data-chat-mode="swarm" onclick="switchChatMode('swarm')" title="Multi-worker parallel execution">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="3"></circle><circle cx="5" cy="19" r="3"></circle><circle cx="19" cy="19" r="3"></circle><line x1="12" y1="8" x2="5" y2="16"></line><line x1="12" y1="8" x2="19" y2="16"></line></svg>
                    </button>
                  </div>
                </div>
                <textarea
                  id="messageInput"
                  placeholder="Ask anything... (Paste images with Cmd+V)"
                  rows="1"
                  onkeydown="handleKeyDown(event)"
                  oninput="autoResize(this)"
                  onpaste="handlePaste(event)"
                ></textarea>
              </div>
              <button class="send-btn" onclick="sendMessage()" id="sendBtn">Send</button>
              <button class="stop-btn" onclick="stopConversation()" id="stopBtn" style="display: none;">Stop</button>
              <button class="send-btn secondary-btn" onclick="getGptOpinion()" id="gptOpinionBtn" title="Get GPT's second opinion on Claude's last response">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="7" r="4"></circle><circle cx="17" cy="7" r="4"></circle><path d="M3 21v-2a4 4 0 0 1 4-4h4"></path><path d="M14 21v-2a4 4 0 0 1 4-4h3"></path></svg>
                2nd Opinion
              </button>
            </div>
          </div>
        </div><!-- End chat-column -->

        <!-- Fate Web Panel (old - hidden, now using right pane) -->
        <div class="context-flow-panel" id="contextFlowPanel" style="display: none;">
          <div class="flow-panel-header">
            <span class="flow-panel-title">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"></path>
              </svg>
              <span id="flowPanelPhase">Synthesis</span>
            </span>
            <div class="flow-panel-stats">
              <span class="flow-stat" id="flowPanelTokens">0 tokens</span>
              <span class="flow-stat" id="flowPanelChunks">0 threads</span>
            </div>
          </div>
          <div class="flow-panel-canvas" id="contextFlowCanvasOld">
            <!-- Old - D3 now renders in right pane -->
          </div>
          <div class="flow-panel-legend">
            <div class="legend-item"><span class="legend-dot query"></span>Query</div>
            <div class="legend-item"><span class="legend-dot chat"></span>Chat</div>
            <div class="legend-item"><span class="legend-dot kb"></span>KB</div>
            <div class="legend-item"><span class="legend-dot memory"></span>Memory</div>
            <div class="legend-item"><span class="legend-dot sector"></span>Rules</div>
            <div class="legend-item"><span class="legend-dot response"></span>Answer</div>
          </div>
        </div>

        <!-- Swarm Sidebar (Swarm mode: worker status) -->
        <div class="swarm-sidebar" id="swarmSidebar" style="display: none;">
          <div class="swarm-header">
            <span class="swarm-title">Swarm Workers</span>
            <span class="swarm-status" id="swarmStatus">Idle</span>
          </div>
          <div class="swarm-workers" id="swarmWorkers">
            <div class="empty-swarm">
              <p>No active workers</p>
              <p class="hint">Start a swarm task to see workers here</p>
            </div>
          </div>
        </div>
      </div><!-- End chat-container -->

      <!-- GPT Second Opinion Panel (shown when user clicks "Get GPT Opinion") -->
      <div class="gpt-opinion-panel" id="gptOpinionPanel" style="display: none;">
        <div class="gpt-opinion-header">
          <span class="gpt-opinion-title">GPT Second Opinion</span>
          <button class="gpt-opinion-close" onclick="closeGptOpinion()" title="Close">×</button>
        </div>
        <div class="gpt-opinion-content" id="gptOpinionContent">
          <div class="gpt-opinion-loading" id="gptOpinionLoading" style="display: none;">
            <span class="spinner"></span> Getting GPT's opinion...
          </div>
          <div class="gpt-opinion-response" id="gptOpinionResponse"></div>
        </div>
      </div>

    </div><!-- End chat-section -->

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
	    </div><!-- End agents-section -->

    <!-- Tickets Section -->
    <div class="tickets-section" id="ticketsSection" style="display: none;">
      <div class="tickets-container">
        <div class="tickets-header">
          <h2>Tickets</h2>
          <div class="tickets-actions">
            <button class="btn-primary" onclick="toggleTicketFormMain()">+ New Ticket</button>
            <button class="btn-secondary" onclick="refreshTickets()">Refresh</button>
          </div>
        </div>

        <!-- Create Ticket Form -->
        <div id="ticketFormPanel" class="ticket-form-panel" style="display:none;">
          <h3>Create Ticket</h3>
          <div class="ticket-form">
            <input id="ticketTitleMain" type="text" placeholder="Ticket title..." class="ticket-input" />
            <textarea id="ticketDescriptionMain" placeholder="Description (optional)..." class="ticket-textarea"></textarea>
            <div class="ticket-form-row">
              <select id="ticketSectorMain" class="ticket-select">
                <option value="general">General</option>
                <option value="gameplay">Gameplay</option>
                <option value="ui">UI</option>
                <option value="audio">Audio</option>
                <option value="networking">Networking</option>
              </select>
              <select id="ticketPlanLinkMain" class="ticket-select">
                <option value="">(no plan)</option>
              </select>
            </div>
            <div class="ticket-form-actions">
              <button class="btn-primary" onclick="createTicketMain()">Create</button>
              <button class="btn-secondary" onclick="toggleTicketFormMain()">Cancel</button>
            </div>
          </div>
        </div>

        <!-- Ticket Filters -->
        <div class="ticket-filters">
          <button class="filter-btn active" data-filter="all" onclick="filterTickets('all')">All</button>
          <button class="filter-btn" data-filter="open" onclick="filterTickets('open')">Open</button>
          <button class="filter-btn" data-filter="in-progress" onclick="filterTickets('in-progress')">In Progress</button>
          <button class="filter-btn" data-filter="done" onclick="filterTickets('done')">Done</button>
        </div>

        <!-- Tickets List -->
        <div class="tickets-list" id="ticketsListMain">
          <div class="empty-tickets">
            <div class="empty-icon">🎫</div>
            <p>No tickets yet</p>
            <p class="empty-hint">Click "+ New Ticket" to create your first ticket</p>
          </div>
        </div>
      </div>
    </div><!-- End tickets-section -->

    <!-- Skills Section -->
    <div class="skills-section" id="skillsSection" style="display: none;">
      <div class="skills-container">
        <div class="skills-header">
          <h2>Skills</h2>
          <div class="skills-actions">
            <button class="btn-primary" onclick="createSkill()">+ New Skill</button>
            <button class="btn-secondary" onclick="refreshSkills()">Refresh</button>
          </div>
        </div>

        <div class="skills-description">
          <p>Skills are reusable AI capabilities that can be triggered from chat or agents.</p>
        </div>

        <!-- Skills Categories -->
        <div class="skills-categories">
          <button class="category-btn active" data-category="all" onclick="filterSkills('all')">All</button>
          <button class="category-btn" data-category="code" onclick="filterSkills('code')">Code</button>
          <button class="category-btn" data-category="docs" onclick="filterSkills('docs')">Docs</button>
          <button class="category-btn" data-category="unity" onclick="filterSkills('unity')">Unity</button>
          <button class="category-btn" data-category="custom" onclick="filterSkills('custom')">Custom</button>
        </div>

        <!-- Skills List -->
        <div class="skills-list" id="skillsList">
          <div class="empty-skills">
            <div class="empty-icon">⚡</div>
            <p>No skills yet</p>
            <p class="empty-hint">Skills let you save and reuse common AI tasks</p>
          </div>
        </div>
      </div>
    </div><!-- End skills-section -->

    <!-- Dashboard Section -->
    <div class="dashboard-section" id="dashboardSection" style="display: none;">
      <div class="dashboard-container">
        <!-- Dashboard Sub-Tab Navigation -->
        <div class="dashboard-subtabs">
          <button class="dashboard-subtab active" data-subtab="docs" onclick="switchDashboardSubtab('docs')">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
            Docs
          </button>
          <button class="dashboard-subtab" data-subtab="tickets" onclick="switchDashboardSubtab('tickets')">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
            Tickets
          </button>
          <button class="dashboard-subtab" data-subtab="db" onclick="switchDashboardSubtab('db')">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>
            DB
          </button>
          <button class="dashboard-subtab" data-subtab="mcp" onclick="switchDashboardSubtab('mcp')">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
            MCP
          </button>
          <button class="dashboard-subtab" data-subtab="logs" onclick="switchDashboardSubtab('logs')">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"></rect><line x1="7" y1="8" x2="17" y2="8"></line><line x1="7" y1="12" x2="17" y2="12"></line><line x1="7" y1="16" x2="13" y2="16"></line></svg>
            Logs
          </button>
          <button class="dashboard-subtab" data-subtab="settings" onclick="switchDashboardSubtab('settings')">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
            Settings
          </button>
        </div>

        <!-- Docs Panel -->
        <div class="dashboard-panel" id="dashboardDocsPanel">
          <div class="panel-header">
            <h3>Documentation & Knowledge Base</h3>
            <div class="panel-actions">
              <button class="btn-secondary btn-sm" onclick="refreshDocs()">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                Refresh
              </button>
            </div>
          </div>

          <!-- KB Stats -->
          <div class="docs-stats">
            <div class="stat-card">
              <div class="stat-value" id="docsKbChunks">0</div>
              <div class="stat-label">KB Chunks</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" id="docsProjectDocs">0</div>
              <div class="stat-label">Project Docs</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" id="docsExternalKb">0</div>
              <div class="stat-label">External KB</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" id="docsFreshness">-</div>
              <div class="stat-label">Last Updated</div>
            </div>
          </div>

          <!-- Librarian Section -->
          <div class="docs-section">
            <div class="section-header">
              <h4>Librarian (External KB Ingestion)</h4>
              <span class="agent-status" id="librarianStatus">idle</span>
            </div>
            <div class="docs-ingest-form">
              <div class="form-row">
                <input type="text" id="kbIngestUrl" placeholder="URL or file path to ingest..." class="input-field" />
                <button class="btn-primary btn-sm" onclick="ingestKbSource()">Ingest</button>
              </div>
              <div class="form-hint">Supports: URLs, PDFs, Markdown, Unity docs</div>
            </div>
            <div class="kb-sources-list" id="kbSourcesList">
              <div class="empty-state">No external sources ingested yet</div>
            </div>
          </div>

          <!-- Knowledge Base Embeddings -->
          <div class="docs-section">
            <div class="section-header">
              <h4>Knowledge Base Embeddings</h4>
              <span class="agent-status" id="embedderStatus">idle</span>
            </div>
            <div class="docs-ingest-form">
              <div class="form-row">
                <label for="modelSelect" style="min-width: 140px;">Embedding Model</label>
                <select id="modelSelect" class="input-field select" onchange="onModelSelect()"></select>
              </div>
              <div class="form-hint" id="modelInfo"></div>
              <div id="downloadProgressContainer" style="display: none; margin-top: 8px;"></div>
              <div class="form-hint" id="kbStats"></div>
            </div>
          </div>

          <!-- Knowledge Base Entries -->
          <div class="docs-section">
            <div class="section-header">
              <h4>Knowledge Base Entries</h4>
            </div>
            <div class="docs-list" id="kbList">
              <div class="empty-state">No entries in knowledge base</div>
            </div>
          </div>

          <!-- Documentor Section -->
          <div class="docs-section">
            <div class="section-header">
              <h4>Documentor (Project Docs)</h4>
              <span class="agent-status" id="documentorStatus">idle</span>
            </div>
            <div class="docs-list" id="projectDocsList">
              <div class="empty-state">No project docs tracked</div>
            </div>
            <button class="btn-secondary btn-sm" onclick="scanProjectDocs()">Scan Project Docs</button>
          </div>
        </div>

        <!-- Tickets Panel -->
        <div class="dashboard-panel" id="dashboardTicketsPanel" style="display: none;">
          <div class="panel-header">
            <h3>Tickets</h3>
            <div class="panel-actions">
              <button class="btn-primary btn-sm" onclick="toggleTicketFormDashboard()">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                New Ticket
              </button>
              <button class="btn-secondary btn-sm" onclick="refreshTickets()">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                Refresh
              </button>
            </div>
          </div>

          <!-- Ticket Stats -->
          <div class="ticket-stats">
            <div class="stat-card">
              <div class="stat-value" id="ticketsOpen">0</div>
              <div class="stat-label">Open</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" id="ticketsInProgress">0</div>
              <div class="stat-label">In Progress</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" id="ticketsDone">0</div>
              <div class="stat-label">Done</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" id="ticketsTotal">0</div>
              <div class="stat-label">Total</div>
            </div>
          </div>

          <!-- New Ticket Form -->
          <div class="ticket-form-container" id="dashboardTicketForm" style="display: none;">
            <div class="ticket-form">
              <input type="text" id="dashboardTicketTitle" placeholder="Ticket title..." class="input-field" />
              <textarea id="dashboardTicketDescription" placeholder="Description..." class="input-field textarea" rows="3"></textarea>
              <div class="form-row">
                <select id="dashboardTicketPriority" class="input-field select">
                  <option value="low">Low Priority</option>
                  <option value="medium" selected>Medium Priority</option>
                  <option value="high">High Priority</option>
                  <option value="critical">Critical</option>
                </select>
                <select id="dashboardTicketSector" class="input-field select">
                  <option value="">Auto-detect Sector</option>
                </select>
              </div>
              <div class="form-actions">
                <button class="btn-secondary btn-sm" onclick="toggleTicketFormDashboard()">Cancel</button>
                <button class="btn-primary btn-sm" onclick="createTicketFromDashboard()">Create Ticket</button>
              </div>
            </div>
          </div>

          <!-- Tickets List -->
          <div class="tickets-list" id="dashboardTicketsList">
            <div class="empty-state">No tickets yet. Create one to get started.</div>
          </div>
        </div>

        <!-- DB Panel -->
        <div class="dashboard-panel" id="dashboardDbPanel" style="display: none;">
          <div class="panel-header">
            <h3>Database & Vector Store</h3>
            <div class="panel-actions">
              <button class="btn-secondary btn-sm" onclick="refreshDbStats()">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                Refresh
              </button>
            </div>
          </div>

          <!-- DB Stats -->
          <div class="db-stats">
            <div class="stat-card">
              <div class="stat-value" id="dbVectorCount">0</div>
              <div class="stat-label">Vectors</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" id="dbChunkCount">0</div>
              <div class="stat-label">Chunks</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" id="dbCacheHitRate">0%</div>
              <div class="stat-label">Cache Hit Rate</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" id="dbStorageSize">0 MB</div>
              <div class="stat-label">Storage Size</div>
            </div>
          </div>

          <!-- RAG Health -->
          <div class="db-section">
            <div class="section-header">
              <h4>RAG Health</h4>
            </div>
            <div class="rag-health">
              <div class="health-row">
                <span class="health-label">Retrieval Latency</span>
                <span class="health-value" id="ragLatency">- ms</span>
              </div>
              <div class="health-row">
                <span class="health-label">Embedding Status</span>
                <span class="health-value health-good" id="ragEmbeddingStatus">Ready</span>
              </div>
              <div class="health-row">
                <span class="health-label">Ingestion Success Rate</span>
                <span class="health-value" id="ragIngestionRate">- %</span>
              </div>
              <div class="health-row">
                <span class="health-label">Last Indexing</span>
                <span class="health-value" id="ragLastIndexing">Never</span>
              </div>
            </div>
          </div>

          <!-- Storage Breakdown -->
          <div class="db-section">
            <div class="section-header">
              <h4>Storage Breakdown</h4>
            </div>
            <div class="storage-breakdown">
              <div class="storage-row">
                <span class="storage-label">Chat Embeddings</span>
                <span class="storage-value" id="storageChatEmbeddings">0 MB</span>
              </div>
              <div class="storage-row">
                <span class="storage-label">Global KB</span>
                <span class="storage-value" id="storageGlobalKb">0 MB</span>
              </div>
              <div class="storage-row">
                <span class="storage-label">Project KB</span>
                <span class="storage-value" id="storageProjectKb">0 MB</span>
              </div>
              <div class="storage-row">
                <span class="storage-label">Code Index</span>
                <span class="storage-value" id="storageCodeIndex">0 MB</span>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="db-actions">
            <button class="btn-secondary" onclick="rebuildIndex()">Rebuild Index</button>
            <button class="btn-secondary" onclick="clearCache()">Clear Cache</button>
            <button class="btn-danger" onclick="confirmResetDb()">Reset Database</button>
          </div>
        </div>

        <!-- MCP Panel -->
        <div class="dashboard-panel" id="dashboardMcpPanel" style="display: none;">
          <div class="panel-header">
            <h3>MCP Servers</h3>
            <div class="panel-actions">
              <button class="btn-primary btn-sm" onclick="addMcpServer()">+ Add Server</button>
            </div>
          </div>

          <!-- MCP Server List -->
          <div class="mcp-section">
            <div class="mcp-server-list" id="mcpServerList">
              <div class="empty-state">No MCP servers configured</div>
            </div>
          </div>

          <!-- MCP Server Details -->
          <div class="mcp-section" id="mcpDetailsSection" style="display: none;">
            <div class="section-header">
              <h4>Server Details</h4>
            </div>
            <div class="mcp-details" id="mcpDetails">
              <!-- Populated by JS when server selected -->
            </div>
          </div>
        </div>

        <!-- Logs Panel -->
        <div class="dashboard-panel" id="dashboardLogsPanel" style="display: none;">
          <div class="panel-header">
            <h3>Logs</h3>
            <div class="panel-actions">
              <button class="btn-secondary btn-sm" onclick="clearAllLogs()">Clear All</button>
            </div>
          </div>

          <!-- Log Channels -->
          <div class="logs-section">
            <div class="section-header">
              <h4>Output Channels</h4>
            </div>
            <div class="logs-channels">
              <button class="log-channel-btn" onclick="showLogChannel('general')">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                General Logs
              </button>
              <button class="log-channel-btn" onclick="showLogChannel('mcp')">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
                MCP Logs
              </button>
              <button class="log-channel-btn" onclick="showLogChannel('api')">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>
                API Logs
              </button>
              <button class="log-channel-btn" onclick="showLogChannel('tools')">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>
                Tools Logs
              </button>
            </div>
          </div>

          <!-- Dev Tools -->
          <div class="logs-section">
            <div class="section-header">
              <h4>Developer Tools</h4>
            </div>
            <div class="logs-dev-tools">
              <button class="btn-secondary" onclick="openDevTools()">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
                Developer Console
              </button>
              <button class="btn-secondary" onclick="openTerminal()">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>
                Open Terminal
              </button>
            </div>
          </div>
        </div>

        <!-- Settings Panel -->
        <div class="dashboard-panel" id="dashboardSettingsPanel" style="display: none;">
          <div class="panel-header">
            <h3>Settings</h3>
            <div class="panel-actions">
              <button class="btn-primary btn-sm" onclick="saveSettings()">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                Save
              </button>
            </div>
          </div>

          <!-- API Keys Section -->
          <div class="settings-section">
            <div class="section-header">
              <h4>API Keys</h4>
            </div>
            <div class="settings-form">
              <div class="form-group">
                <label for="settingsClaudeKey">Claude API Key</label>
                <div class="input-with-status">
                  <input type="password" id="settingsClaudeKey" placeholder="sk-ant-..." class="input-field" />
                  <span class="key-status" id="claudeKeyStatus">Not set</span>
                </div>
              </div>
              <div class="form-group">
                <label for="settingsGptKey">OpenAI API Key</label>
                <div class="input-with-status">
                  <input type="password" id="settingsGptKey" placeholder="sk-..." class="input-field" />
                  <span class="key-status" id="gptKeyStatus">Not set</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Git Settings Section -->
          <div class="settings-section">
            <div class="section-header">
              <h4>Git Settings</h4>
            </div>
            <div class="settings-form">
              <div class="form-group">
                <label for="gitRepoUrl">Repository URL <span id="gitRepoUrlSource" style="margin-left: 6px; font-size: 11px; color: var(--text-secondary);"></span></label>
                <input type="text" id="gitRepoUrl" placeholder="https://github.com/org/repo.git" class="input-field" />
                <div class="form-hint" id="gitRepoUrlDetected"></div>
              </div>
              <div class="form-group">
                <label for="gitBranch">Default Branch <span id="gitBranchSource" style="margin-left: 6px; font-size: 11px; color: var(--text-secondary);"></span></label>
                <input type="text" id="gitBranch" placeholder="main" class="input-field" />
                <div class="form-hint" id="gitBranchDetected"></div>
              </div>
              <div class="form-group">
                <label for="gitCommitMessage">Default Commit Message</label>
                <input type="text" id="gitCommitMessage" placeholder="chore: update" class="input-field" />
              </div>
              <div class="form-group checkbox-group">
                <label>
                  <input type="checkbox" id="gitAutoPush" checked />
                  Auto-push after commit
                </label>
              </div>
              <div class="form-actions">
                <button class="btn-secondary btn-sm" onclick="clearGitOverrides()">Clear Overrides</button>
                <button class="btn-primary btn-sm" onclick="saveGitSettings()">Save Git Settings</button>
              </div>
            </div>
          </div>

          <!-- Token Budget Section -->
          <div class="settings-section">
            <div class="section-header">
              <h4>Token Budget</h4>
            </div>
            <div class="settings-form">
              <div class="form-group">
                <label for="settingsMaxTokens">Max Total Tokens</label>
                <input type="number" id="settingsMaxTokens" value="8000" min="1000" max="32000" class="input-field" />
                <div class="form-hint">Default: 8000. Maximum context window size.</div>
              </div>
              <div class="budget-sliders">
                <div class="budget-row">
                  <label>Recent Messages</label>
                  <input type="range" id="budgetMessages" min="10" max="50" value="30" class="slider" />
                  <span class="budget-value" id="budgetMessagesValue">30%</span>
                </div>
                <div class="budget-row">
                  <label>Retrieved Chunks</label>
                  <input type="range" id="budgetChunks" min="20" max="70" value="50" class="slider" />
                  <span class="budget-value" id="budgetChunksValue">50%</span>
                </div>
                <div class="budget-row">
                  <label>Specialist KB</label>
                  <input type="range" id="budgetKb" min="5" max="30" value="15" class="slider" />
                  <span class="budget-value" id="budgetKbValue">15%</span>
                </div>
                <div class="budget-row">
                  <label>System Prompt</label>
                  <input type="range" id="budgetSystem" min="2" max="15" value="5" class="slider" />
                  <span class="budget-value" id="budgetSystemValue">5%</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Priority Order Section -->
          <div class="settings-section">
            <div class="section-header">
              <h4>Context Priority Order</h4>
              <div class="form-hint">Drag to reorder. Higher = more important.</div>
            </div>
            <div class="priority-list" id="priorityList">
              <div class="priority-item" data-priority="policy" draggable="true">
                <span class="drag-handle">⋮⋮</span>
                <span class="priority-name">Project/Policy</span>
              </div>
              <div class="priority-item" data-priority="domain-kb" draggable="true">
                <span class="drag-handle">⋮⋮</span>
                <span class="priority-name">Domain KB</span>
              </div>
              <div class="priority-item" data-priority="code" draggable="true">
                <span class="drag-handle">⋮⋮</span>
                <span class="priority-name">Code</span>
              </div>
              <div class="priority-item" data-priority="tickets" draggable="true">
                <span class="drag-handle">⋮⋮</span>
                <span class="priority-name">Tickets</span>
              </div>
              <div class="priority-item" data-priority="chat" draggable="true">
                <span class="drag-handle">⋮⋮</span>
                <span class="priority-name">Chat History</span>
              </div>
            </div>
          </div>

          <!-- General Settings -->
          <div class="settings-section">
            <div class="section-header">
              <h4>General</h4>
            </div>
            <div class="settings-form">
              <div class="form-group checkbox-group">
                <label>
                  <input type="checkbox" id="settingsAutoExecute" />
                  Auto-execute approved plans
                </label>
              </div>
              <div class="form-group checkbox-group">
                <label>
                  <input type="checkbox" id="settingsAutoClose" checked />
                  Auto-close tickets on completion
                </label>
              </div>
              <div class="form-group checkbox-group">
                <label>
                  <input type="checkbox" id="settingsInjectRules" checked />
                  Auto-inject sector rules
                </label>
              </div>
              <div class="form-group">
                <label for="settingsDefaultModel">Default AI Model</label>
                <select id="settingsDefaultModel" class="input-field select">
                  <option value="claude" selected>Claude (Anthropic)</option>
                  <option value="gpt">GPT (OpenAI)</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Danger Zone -->
          <div class="settings-section danger-zone">
            <div class="section-header">
              <h4>Danger Zone</h4>
            </div>
            <div class="danger-actions">
              <button class="btn-danger" onclick="confirmResetSettings()">Reset All Settings</button>
              <button class="btn-danger" onclick="confirmClearAllData()">Clear All Data</button>
            </div>
          </div>
        </div>

      </div>
    </div><!-- End dashboard-section -->

	  </div><!-- End left-pane -->

	  <div class="splitter" id="mainSplitter" title="Drag to resize"></div>

	  <div class="right-pane" id="rightPane" data-panel-mode="flow">
	    <div class="ship-panel">
	      <div class="ship-title">
	        <span>Station View</span>
	        <div class="view-mode-toggle" style="display:flex; gap:4px; margin-left:12px;">
	          <button id="stationViewSchematic" class="active" onclick="stationToggleViewMode('schematic')" title="Schematic View (SVG)">Schematic</button>
	          <button id="stationViewPhoto" onclick="stationToggleViewMode('photo')" title="Photo View (Legacy)">Photo</button>
	        </div>
	        <div class="panel-toggle">
	          <button id="panelModeStation" class="active" onclick="setRightPanelMode('station')" title="Station View">Station</button>
	          <button id="panelModeControl" onclick="setRightPanelMode('control')" title="Controls">Control</button>
	          <button id="panelModeFlow" onclick="setRightPanelMode('flow')" title="Context Flow">Flow</button>
	          <button id="panelModeOpinion" onclick="setRightPanelMode('opinion')" title="GPT Second Opinion">Opinion</button>
	          <button id="panelModeChat" onclick="setRightPanelMode('chat')" title="Extra Chat">+Chat</button>
	        </div>
	      </div>
	      <div class="ship-canvas" id="shipCanvas">
	        <img class="ship-image" id="shipImage" src="${stationUri}" alt="Station"
	          onerror="if(!this.dataset.fallback){this.dataset.fallback='1'; this.src='${shipUri}';} else {this.onerror=null; this.src='${shipFallbackUri}';}" />
	        <!-- Hotspots injected by JS -->
	      </div>

        <div class="station-info">
          <div class="station-subtitle" id="stationSceneName">Station Exterior</div>
          <div class="station-info-row">
            <button class="btn-secondary" onclick="stationGoBack()" id="stationBackBtn" style="padding: 6px 10px;">Back</button>
            <div class="breadcrumbs" id="stationBreadcrumbs" title="Station navigation"></div>
          </div>
          <div class="station-info-row">
            <span class="control-chip" id="shipSelectedSectorChip">Sector: (none)</span>
            <span class="control-chip">Profile:</span>
            <select id="shipProfileSelect" style="padding: 6px 10px; border-radius: 999px;">
              <option value="yard">Yard</option>
              <option value="scout">Scout</option>
              <option value="battleship">Battleship</option>
            </select>
          </div>
          <div class="code-breadcrumb" id="codeBreadcrumb" title="Active file breadcrumb">No active file</div>
        </div>

        <div class="control-panel">
          <div class="control-tabs">
            <button class="control-tab-btn active" id="controlTabBtnInfo" onclick="switchControlTab('info')">Info</button>
            <button class="control-tab-btn" id="controlTabBtnOps" onclick="switchControlTab('ops')">Control</button>
            <button class="control-tab-btn" id="controlTabBtnUnity" onclick="switchControlTab('unity')">Unity</button>
          </div>

          <div class="control-tab-body">
            <div class="control-tab-panel" id="controlTabInfo">
              <div class="status-card">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                  <strong style="font-size:12px;">Station Info</strong>
                </div>
                <div class="status-text" id="shipStatusText">Select a sector to focus context and gates.</div>
                <div class="info-row">
                  <span class="info-label">Sector</span><span id="stationSectorLabel" class="info-value">Command Bridge</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Profile</span><span id="stationProfileLabel" class="info-value">Yard</span>
                </div>
              </div>

              <div class="status-card">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                  <strong style="font-size:12px;">Coordinator</strong>
                  <button class="btn-secondary" onclick="coordinatorHealthCheck()" style="padding:4px 10px;">Check</button>
                </div>
                <div class="coord-meta">
                  <div class="coord-meta-row">
                    <span class="label">Status</span>
                    <span id="coordinatorStatusBadge" class="coord-status muted">Unknown</span>
                  </div>
                  <div class="coord-meta-row">
                    <span class="label">URL</span>
                    <span id="coordinatorUrlLabel" class="info-value">http://127.0.0.1:5510</span>
                  </div>
                  <div class="coord-meta-row">
                    <span class="label">Last Issue</span>
                    <span id="coordinatorLastIssue" class="info-value">none</span>
                  </div>
                </div>
                <div class="coord-grid">
                  <span class="label">Policy</span>
                  <span id="coordinatorPolicySync" class="info-value">never</span>
                  <span id="coordinatorPolicyStatus" class="coord-pill muted">unknown</span>
                  <span class="label">Inventory</span>
                  <span id="coordinatorInventorySync" class="info-value">never</span>
                  <span id="coordinatorInventoryStatus" class="coord-pill muted">unknown</span>
                  <span class="label">Graph</span>
                  <span id="coordinatorGraphSync" class="info-value">never</span>
                  <span id="coordinatorGraphStatus" class="coord-pill muted">unknown</span>
                </div>
                <div class="coord-summary" id="coordinatorSummary">Sync status will appear after first check.</div>
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
                <div id="docInfo" style="font-size:10px; color:var(--text-secondary); margin:4px 0;"></div>
                <div style="display:flex; justify-content:flex-end; gap:6px;">
                  <button class="btn-secondary" id="openDocBtn" onclick="openDocTarget()" style="padding:4px 10px;" disabled>Open</button>
                  <button class="btn-secondary" onclick="refreshDocTargets()" style="padding:4px 10px;">Refresh</button>
                </div>
                <div id="docSuggestion" style="font-size:10px; color:#fbbf24; margin-top:6px; display:none;"></div>
              </div>
            </div>

            <div class="control-tab-panel" id="controlTabOps" style="display:none;">
              <div class="control-actions condensed">
                <button class="btn-secondary" onclick="shipRequestContextPack()">Context Pack</button>
                <button class="btn-secondary" onclick="shipRunGates()">Run Gates</button>
                <button class="btn-secondary" onclick="shipDocsStatus()">Docs</button>
                <button class="btn-secondary" onclick="shipToggleAutoexecute()" id="shipAutoBtn">Autoexecute: Off</button>
              </div>

              <div id="controlGatesResult" style="display:none; margin:8px 0; padding:8px; background:var(--bg-secondary); border-radius:6px; border-left:3px solid #4caf50;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                  <strong style="font-size:11px;">Gates Result</strong>
                  <span id="controlGatesStatus" style="font-size:10px; font-weight:600;"></span>
                </div>
                <div id="controlGatesContent" style="font-size:10px; white-space:pre-wrap; max-height:150px; overflow-y:auto;"></div>
              </div>

              <div class="asmdef-panel">
                <div class="asmdef-header">
                  <div style="display:flex; align-items:center; gap:8px;">
                    <strong style="font-size:12px;">Asmdef Manager</strong>
                    <span id="asmdefPolicyModeBadge" class="coord-status muted">Policy: (none)</span>
                  </div>
                  <div class="asmdef-actions">
                    <button class="btn-secondary" onclick="asmdefRefresh()" style="padding:4px 10px;">Refresh</button>
                    <button class="btn-secondary" onclick="asmdefGeneratePolicy()" style="padding:4px 10px;">Generate Policy</button>
                    <button class="btn-secondary" onclick="asmdefEditPolicy()" style="padding:4px 10px;">Edit Policy</button>
                    <button class="btn-secondary" onclick="asmdefOpenPolicy()" style="padding:4px 10px;">Open Policy</button>
                    <button class="btn-secondary" onclick="asmdefSetStrict()" style="padding:4px 10px;">Set Strict</button>
                    <button class="btn-secondary" onclick="asmdefSetAdvisory()" style="padding:4px 10px;">Set Advisory</button>
                    <button class="btn-secondary" onclick="asmdefNormalizeGuids()" style="padding:4px 10px;">Normalize GUIDs</button>
                    <button class="btn-secondary" onclick="asmdefGraph()" style="padding:4px 10px;">Graph</button>
                    <button class="btn-secondary" onclick="asmdefValidate()" style="padding:4px 10px;">Validate</button>
                  </div>
                </div>
                <div id="asmdefSummary" class="asmdef-summary">No asmdef scan yet.</div>
                <div id="asmdefPolicyEditor" class="asmdef-policy-editor" style="display:none;">
                  <div class="asmdef-policy-header">
                    <div style="display:flex; align-items:center; gap:6px;">
                      <strong style="font-size:11px;">Policy Editor</strong>
                      <span id="asmdefPolicyPath" class="asmdef-policy-path">(no policy)</span>
                    </div>
                    <div style="display:flex; gap:6px;">
                      <button class="btn-secondary" onclick="asmdefReloadPolicy()" style="padding:4px 10px;">Reload</button>
                      <button class="btn-secondary" onclick="asmdefSavePolicy()" style="padding:4px 10px;">Save</button>
                    </div>
                  </div>
                  <textarea id="asmdefPolicyText" class="asmdef-policy-text" spellcheck="false" placeholder="Policy JSON will appear here..."></textarea>
                  <div id="asmdefPolicyHint" class="asmdef-policy-hint">Edit JSON and click Save to update policy.</div>
                </div>
                <div id="asmdefList" class="asmdef-list"></div>
                <div id="asmdefGraphSummary" class="asmdef-summary" style="margin-top:6px; display:none;"></div>
                <div id="asmdefGraphCanvas" class="asmdef-graph-canvas" style="display:none;"></div>
                <div id="asmdefGraphList" class="asmdef-list" style="display:none;"></div>
                <div id="asmdefViolations" class="asmdef-list" style="display:none;"></div>
              </div>

              <div class="job-queue">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <strong style="font-size:12px;">Approval Queue</strong>
                  <button class="btn-secondary" onclick="clearAllJobs()" style="padding:4px 10px;">Clear</button>
                  <button class="btn-secondary" onclick="requestJobList()" style="padding:4px 10px;">Refresh</button>
                </div>
                <div id="jobList" class="job-list"></div>
              </div>
            </div>

            <div class="control-tab-panel" id="controlTabUnity" style="display:none;">
              <!-- Coplay MCP Integration - commands sent via chat to Claude -->
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <div style="display:flex; align-items:center; gap:8px;">
                  <strong style="font-size:12px;">🎮 Unity (Coplay)</strong>
                  <span id="unityStatus" class="unity-status disconnected">● Unknown</span>
                </div>
              </div>

              <!-- Quick Actions - send commands to Claude -->
              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px; margin-bottom:8px;">
                <button class="btn-secondary unity-cmd-btn" onclick="unitySendCommand('status')" style="padding:6px 8px; font-size:11px;" title="Check Unity connection">
                  🔍 Check Status
                </button>
                <button class="btn-secondary unity-cmd-btn" onclick="unitySendCommand('reload')" style="padding:6px 8px; font-size:11px;" title="Reload Unity assets">
                  ↻ Reload Assets
                </button>
                <button class="btn-secondary unity-cmd-btn" onclick="unitySendCommand('play')" style="padding:6px 8px; font-size:11px;" title="Play game in editor">
                  ▶ Play
                </button>
                <button class="btn-secondary unity-cmd-btn" onclick="unitySendCommand('stop')" style="padding:6px 8px; font-size:11px;" title="Stop game in editor">
                  ⏹ Stop
                </button>
                <button class="btn-secondary unity-cmd-btn" onclick="unitySendCommand('logs')" style="padding:6px 8px; font-size:11px;" title="Get Unity console logs">
                  📋 Get Logs
                </button>
                <button class="btn-secondary unity-cmd-btn" onclick="unitySendCommand('errors')" style="padding:6px 8px; font-size:11px;" title="Check compile errors">
                  ⚠️ Check Errors
                </button>
              </div>

              <!-- Last Status Info -->
              <div id="unityLastStatus" style="font-size:11px; color:var(--text-secondary); padding:6px 8px; background:var(--bg-primary); border-radius:4px; margin-bottom:8px;">
                <div style="margin-bottom:4px;"><strong>Project:</strong> <span id="unityProjectName">-</span></div>
                <div style="margin-bottom:4px;"><strong>Scene:</strong> <span id="unitySceneName">-</span></div>
                <div><strong>Last check:</strong> <span id="unityLastCheck">Never</span></div>
              </div>

              <!-- Console Output -->
              <div class="unity-console" style="background:var(--bg-primary); border-radius:6px; padding:6px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                  <span style="font-size:10px; color:var(--text-secondary);">Console Output</span>
                  <div style="display:flex; gap:4px; align-items:center;">
                    <button class="console-filter active" data-filter="error" onclick="toggleConsoleFilter('error')" style="font-size:10px; padding:2px 6px; border-radius:4px;" title="Errors">🔴</button>
                    <button class="console-filter active" data-filter="warn" onclick="toggleConsoleFilter('warn')" style="font-size:10px; padding:2px 6px; border-radius:4px;" title="Warnings">🟡</button>
                    <button class="console-filter active" data-filter="log" onclick="toggleConsoleFilter('log')" style="font-size:10px; padding:2px 6px; border-radius:4px;" title="Logs">⚪</button>
                    <button onclick="clearUnityConsole()" style="font-size:9px; padding:2px 6px; border-radius:4px; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-secondary); cursor:pointer;" title="Clear console display">Clear</button>
                  </div>
                </div>
                <div id="unityConsoleLog" style="font-size:10px; font-family:monospace; white-space:pre-wrap; max-height:150px; overflow-y:auto;">
                  Click "Get Logs" to fetch Unity console output
                </div>
              </div>

              <div style="font-size:9px; color:var(--text-secondary); margin-top:6px; opacity:0.7;">
                Commands are sent to Claude who executes them via Coplay MCP
              </div>
            </div>
          </div>

        <details class="advanced-drawer">
          <summary>Advanced Panels</summary>

        <div class="verification-panel" id="planningPanel">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <strong style="font-size:12px;">🧭 Planning</strong>
            <div style="display:flex; gap:4px;">
              <button class="btn-secondary" onclick="refreshPlanTemplates()" style="padding:4px 10px; font-size:10px;">Templates</button>
              <button class="btn-secondary" onclick="refreshPlans()" style="padding:4px 10px; font-size:10px;">Plans</button>
            </div>
          </div>

          <textarea id="planIntent" placeholder="Describe the task to plan..." style="width:100%; min-height:60px; resize:vertical; margin-bottom:6px;"></textarea>
          <div style="display:flex; gap:6px; margin-bottom:6px;">
            <select id="planTemplateSelect" style="flex:1; padding:6px 10px;">
              <option value="">(no template)</option>
            </select>
            <input id="planTemplateVars" placeholder="Template vars JSON (optional)" style="flex:1; padding:6px 10px;" />
          </div>

          <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px;">
            <button class="btn-secondary" onclick="generatePlan()">Generate Plan</button>
            <button class="btn-secondary" onclick="saveCurrentPlan()" id="savePlanBtn" disabled>Save</button>
            <button class="btn-secondary" onclick="usePlanForComparison()" id="usePlanBtn" disabled>Use for Comparison</button>
            <button class="btn-secondary" onclick="executeCurrentPlan()" id="executePlanBtn" disabled>Execute</button>
            <button class="btn-secondary" onclick="executePlanStepByStep()" id="executePlanStepBtn" disabled>Step-by-Step</button>
          </div>

          <div id="planSummary" style="display:none; font-size:10px; background:var(--bg-primary); border-radius:4px; padding:6px; margin-bottom:8px;"></div>
          <div id="planList" style="font-size:10px; max-height:140px; overflow-y:auto; background:var(--bg-primary); border-radius:4px; padding:6px;"></div>
        </div>

        <div class="verification-panel" id="ticketPanel">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <strong style="font-size:12px;">🎫 Tickets</strong>
            <div style="display:flex; gap:4px;">
              <button class="btn-secondary" onclick="toggleTicketForm()" style="padding:4px 10px; font-size:10px;">+ New</button>
              <button class="btn-secondary" onclick="refreshTickets()" style="padding:4px 10px; font-size:10px;">Refresh</button>
            </div>
          </div>

          <div id="ticketForm" style="display:none; margin-bottom:8px; padding:8px; background:var(--bg-primary); border-radius:4px;">
            <input id="ticketTitle" placeholder="Ticket title..." style="width:100%; margin-bottom:6px; padding:6px 10px;" />
            <textarea id="ticketDescription" placeholder="Description (optional)..." style="width:100%; min-height:40px; resize:vertical; margin-bottom:6px;"></textarea>
            <div style="display:flex; gap:6px; margin-bottom:6px;">
              <select id="ticketSector" style="flex:1; padding:6px 10px;">
                <option value="general">General</option>
                <option value="gameplay">Gameplay</option>
                <option value="ui">UI</option>
                <option value="audio">Audio</option>
                <option value="networking">Networking</option>
              </select>
              <select id="ticketPlanLink" style="flex:1; padding:6px 10px;">
                <option value="">(no plan)</option>
              </select>
            </div>
            <div style="display:flex; gap:6px;">
              <button class="btn-secondary" onclick="createTicket()" style="flex:1;">Create Ticket</button>
              <button class="btn-secondary" onclick="toggleTicketForm()" style="flex:1;">Cancel</button>
            </div>
          </div>

          <div id="ticketList" style="font-size:10px; max-height:180px; overflow-y:auto; background:var(--bg-primary); border-radius:4px; padding:6px;">
            <span style="color:var(--text-secondary);">No tickets yet. Click "+ New" to create one.</span>
          </div>
        </div>

        <div class="verification-panel">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <strong style="font-size:12px;">🔍 Verification</strong>
            <div style="display:flex; gap:4px;">
              <button class="btn-secondary" onclick="scanDiff()" style="padding:4px 10px; font-size:10px;">Scan Diff</button>
              <button class="btn-secondary" onclick="runTests()" style="padding:4px 10px; font-size:10px;" id="runTestsBtn">Run Tests</button>
              <button class="btn-secondary" onclick="runAIReview()" style="padding:4px 10px; font-size:10px;" id="aiReviewBtn" disabled>AI Review</button>
            </div>
          </div>

          <div class="plan-execution" id="planExecutionPanel" style="display:none;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <span style="font-size:11px; font-weight:600;">Execution</span>
              <span id="planExecutionStatus" style="font-size:10px; color:var(--text-secondary);"></span>
            </div>
            <div id="planExecutionProgress" style="font-size:10px; margin-bottom:6px; color:var(--text-secondary);"></div>
            <div id="planExecutionLog" class="plan-execution-log"></div>
            <div class="plan-step-gate" id="planStepGate" style="display:none;">
              <div class="plan-step-gate-title">Step approval</div>
              <div class="plan-step-gate-details" id="planStepGateDetails"></div>
              <div class="plan-step-gate-actions">
                <button class="btn-secondary" onclick="abortPlanStep()">Stop</button>
                <button class="btn-secondary" onclick="approvePlanStep()">Run Step</button>
              </div>
            </div>
          </div>

          <div class="diff-summary" id="diffSummary" style="display:none;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <span style="font-size:11px; font-weight:600;">Diff Summary</span>
              <span id="diffStats" style="font-size:10px; color:var(--text-secondary);"></span>
            </div>
            <div id="diffFileList" style="max-height:100px; overflow-y:auto; font-size:10px; font-family:monospace; background:var(--bg-primary); border-radius:4px; padding:6px;"></div>
          </div>

          <div class="plan-comparison" id="planComparison" style="display:none; margin-top:8px;">
            <div style="font-size:11px; font-weight:600; margin-bottom:4px;">Plan Comparison</div>
            <div id="planComparisonResult" style="font-size:10px; background:var(--bg-primary); border-radius:4px; padding:6px;"></div>
          </div>

          <div class="ai-review-result" id="aiReviewResult" style="display:none; margin-top:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <span style="font-size:11px; font-weight:600;">AI Review</span>
              <span id="aiReviewStatus" style="font-size:10px;"></span>
            </div>
            <div id="aiReviewContent" style="font-size:10px; background:var(--bg-primary); border-radius:4px; padding:6px; max-height:150px; overflow-y:auto;"></div>
          </div>

          <div id="verificationEmpty" style="font-size:10px; color:var(--text-secondary); text-align:center; padding:12px;">
            Click "Scan Diff" to analyze changes since last commit.
          </div>

          <div class="gates-result" id="gatesResult" style="display:none; margin-top:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <span style="font-size:11px; font-weight:600;">Gates Check Result</span>
              <span id="gatesResultStatus" style="font-size:10px;"></span>
            </div>
            <div id="gatesResultContent" style="font-size:10px; background:var(--bg-primary); border-radius:4px; padding:6px; max-height:200px; overflow-y:auto; white-space:pre-wrap;"></div>
          </div>

          <div class="test-result" id="testResult" style="display:none; margin-top:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <span style="font-size:11px; font-weight:600;">Regression Tests</span>
              <span id="testResultStatus" style="font-size:10px;"></span>
            </div>
            <div id="testResultContent" style="font-size:10px; background:var(--bg-primary); border-radius:4px; padding:6px; max-height:200px; overflow-y:auto; white-space:pre-wrap; font-family:monospace;"></div>
          </div>
        </div>

        <div class="sector-list" id="shipSectorList"></div>
        </details>
	      </div>
	    </div>

        <!-- Flow Panel (Context Flow Visualization) -->
        <div class="right-panel-content" id="flowPanelContent">
          <div class="panel-header">
            <span>Context Flow</span>
          </div>
          <div class="flow-visualization" id="contextFlowViz">
            <div class="flow-stats" id="contextFlowStats">
              <span class="stat-item">Chunks: <span id="contextFlowChunks">0</span></span>
              <span class="stat-item">Tokens: <span id="contextFlowTokens">0</span></span>
            </div>
            <div class="flow-canvas" id="contextFlowCanvas">
              <!-- D3 visualization renders here -->
            </div>
          </div>
        </div>

        <!-- Swarm Panel (Multi-worker parallel execution) -->
        <div class="right-panel-content" id="swarmPanelContent">
          <div class="panel-header">
            <span>Swarm Workers</span>
            <span class="swarm-status-badge" id="swarmStatusBadge">Idle</span>
          </div>
          <div class="swarm-workers-list" id="swarmWorkersList">
            <div class="empty-swarm-state">
              <p>No active workers</p>
              <p class="hint">Start a swarm task to see workers here</p>
            </div>
          </div>
        </div>

        <!-- Opinion Panel (GPT Second Opinion) -->
        <div class="right-panel-content" id="opinionPanelContent" style="display:none;">
          <div class="panel-header">
            <span>GPT Second Opinion</span>
            <button class="btn-icon" onclick="refreshGptOpinion()" title="Get fresh opinion">↻</button>
          </div>
          <div class="opinion-container">
            <div class="opinion-context" id="opinionContext">
              <div class="opinion-section">
                <label>Your Question:</label>
                <div class="opinion-text" id="opinionUserQuestion">-</div>
              </div>
              <div class="opinion-section">
                <label>Claude's Response:</label>
                <div class="opinion-text opinion-claude" id="opinionClaudeResponse">-</div>
              </div>
            </div>
            <div class="opinion-divider"></div>
            <div class="opinion-response">
              <label>GPT's Take:</label>
              <div class="opinion-loading" id="opinionLoading" style="display:none;">
                <div class="spinner"></div>
                <span>Getting GPT's opinion...</span>
              </div>
              <div class="opinion-text opinion-gpt" id="opinionGptResponse">
                Click "GPT Opinion" button after Claude responds to get a second opinion.
              </div>
            </div>
          </div>
        </div>

        <!-- Extra Chat Panel -->
        <div class="right-panel-content" id="chatPanelContent" style="display:none;">
          <div class="panel-header">
            <span>Side Chat</span>
            <div class="chat-tabs-mini">
              <button class="chat-tab-mini active" data-chat="1" onclick="switchSideChat(1)">Chat 1</button>
              <button class="chat-tab-mini" data-chat="2" onclick="switchSideChat(2)">Chat 2</button>
            </div>
          </div>
          <div class="side-chat-container">
            <div class="side-chat-messages" id="sideChatMessages1">
              <div class="empty-state">Start a side conversation. Ask anything unrelated to main chat.</div>
            </div>
            <div class="side-chat-messages" id="sideChatMessages2" style="display:none;">
              <div class="empty-state">Start a side conversation. Ask anything unrelated to main chat.</div>
            </div>
            <div class="side-chat-input">
              <textarea id="sideChatInput" placeholder="Ask something..." rows="2"></textarea>
              <button class="send-btn-mini" onclick="sendSideChat()">Send</button>
            </div>
          </div>
        </div>

	  </div><!-- End right-pane -->
	</div><!-- End main-split -->

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

  <!-- Initialize globals for panel.js -->
  <script>
    window.__SC_STATION_MAP__ = JSON.parse(atob('${stationMapBase64}'));
    window.__SC_BUILD_ID__ = '${buildId}';
    window.__SC_VSCODE__ = acquireVsCodeApi();
  </script>
  <!-- D3.js for AI Flow visualization -->
  <script src="${d3JsUri}"></script>
  <script src="${panelJsUri}"></script>
</body>
</html>`;
    // Note: Base64 wrapping removed - main JS now loaded from external panel.js
    // Debug: dump HTML to temp file for inspection
    try {
      fs.writeFileSync(path.join(os.tmpdir(), 'spacecode-webview.html'), html, 'utf8');
    } catch {
      // Ignore dump failures.
    }
    return html;
  }
}
