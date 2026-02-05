/**
 * SpaceCode Extension
 *
 * Ported from MasterCode: full chat UI + settings + session restore.
 * Ship UI integration comes next.
 */

import * as vscode from 'vscode';
import {
  ClaudeProvider,
  GPTProvider,
  ClaudeCliProvider,
  GptCliProvider
} from './mastercode_port/providers';
import { AIProvider } from './mastercode_port/providers/base';
import { ConversationOrchestrator } from './mastercode_port/orchestrator/conversation';
import { AuthService } from './mastercode_port/services/auth';
import { CostTracker } from './mastercode_port/services/costTracker';
import { TemplateService } from './mastercode_port/services/templates';
import { KnowledgeBaseService } from './mastercode_port/services/knowledgeBase';
import { MCPManager } from './mastercode_port/services/mcpManager';
import { VoiceService } from './mastercode_port/services/voiceService';
import { SoundService } from './mastercode_port/services/soundService';
import { PricingService } from './mastercode_port/services/pricingService';
import { MainPanel } from './mastercode_port/ui/mainPanel';
import { SidebarProvider } from './mastercode_port/ui/sidebarProvider';
import { logger } from './mastercode_port/services/logService';
import { initPromptLoader } from './personas/PromptLoader';
import { loadSettings } from './settings';
import { initializeMemory } from './memory';

let claudeProvider: AIProvider;
let gptProvider: AIProvider;
let orchestrator: ConversationOrchestrator;
let authService: AuthService;
let costTracker: CostTracker;
let templateService: TemplateService;
let knowledgeBase: KnowledgeBaseService;
let mcpManager: MCPManager;
let voiceService: VoiceService;
let soundService: SoundService;
let pricingService: PricingService;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  logger.info('general', 'SpaceCode extension activating...');

  // Load persisted settings from globalState
  await loadSettings(context);

  // Services
  authService = new AuthService();
  await authService.initialize(context);

  costTracker = new CostTracker();
  await costTracker.initialize(context);

  templateService = new TemplateService();
  await templateService.initialize(context);

  knowledgeBase = new KnowledgeBaseService();
  await knowledgeBase.initialize(context);

  mcpManager = new MCPManager();
  await mcpManager.initialize(context);

  voiceService = new VoiceService();
  await voiceService.initialize(context);

  soundService = SoundService.getInstance();
  await soundService.initialize(context);

  // Initialize memory system (MessageStore + VectorStore + EmbeddingService)
  try {
    await initializeMemory(context);
    logger.info('general', 'Memory system initialized');
  } catch (memErr: any) {
    logger.warn('general', 'Memory system init failed (non-fatal): ' + (memErr?.message || memErr));
  }

  // Initialize persona prompt loader with extension root
  initPromptLoader(context.extensionUri.fsPath);

  pricingService = new PricingService();
  pricingService.initialize(context);

  await initializeProviders();

  orchestrator = new ConversationOrchestrator();
  orchestrator.setProviders(claudeProvider, gptProvider);

  const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || vscode.workspace.rootPath || '';
  if (workspaceDir) orchestrator.setWorkspaceDir(workspaceDir);

  vscode.workspace.onDidChangeWorkspaceFolders(() => {
    const newDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    if (newDir) orchestrator.setWorkspaceDir(newDir);
  });

  // Sidebar view
  const sidebarProvider = new SidebarProvider(
    context.extensionUri,
    orchestrator,
    costTracker,
    knowledgeBase,
    mcpManager
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('spacecode.sidebarView', sidebarProvider)
  );

  registerCommands(context);

  // Restore main panel on restart
  context.subscriptions.push(
    vscode.window.registerWebviewPanelSerializer('spacecode.mainPanel', {
      async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel) {
        MainPanel.revive(
          webviewPanel,
          context.extensionUri,
          orchestrator,
          costTracker,
          knowledgeBase,
          mcpManager,
          voiceService,
          pricingService,
          context
        );
      }
    })
  );

  // Auto-open main panel on startup (for branded app experience)
  const isSpaceCodeApp = vscode.env.appName === 'SpaceCode';
  if (isSpaceCodeApp) {
    vscode.commands.executeCommand('spacecode.openPanel');
  }

  // Close secondary sidebar (auxiliary bar) — SpaceCode owns the right panel via webview
  // KEEP IN SYNC with .dev-tools/layout-enforcer/extension.js (dev editing window mirror)
  vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');

  logger.info('general', 'SpaceCode extension activated!');
}

async function initializeProviders(): Promise<void> {
  const config = vscode.workspace.getConfiguration('spacecode');
  const claudeMethod = config.get<string>('claudeConnectionMethod', 'cli');
  const gptMethod = config.get<string>('gptConnectionMethod', 'cli');

  logger.info('general', `Initializing Claude with ${claudeMethod} method`);
  logger.info('general', `Initializing GPT with ${gptMethod} method`);

  if (claudeMethod === 'cli') {
    claudeProvider = new ClaudeCliProvider();
    try {
      await claudeProvider.configure({});
      // Set the model from saved config
      const savedClaudeModel = config.get<string>('claudeModel', 'claude-sonnet-4-5');
      if ('setModel' in claudeProvider) {
        (claudeProvider as any).setModel(savedClaudeModel);
        logger.info('general', `Claude CLI model set to: ${savedClaudeModel}`);
      }
    } catch (error) {
      logger.error('general', `Failed to configure Claude CLI: ${String(error)}`);
    }
  } else {
    claudeProvider = new ClaudeProvider();
    const keys = await authService.getApiKeys();
    if (keys.claude) {
      try {
        claudeProvider.configure({
          apiKey: keys.claude,
          model: config.get('claudeModel', 'claude-sonnet-4-20250514')
        });
      } catch (error) {
        logger.error('general', `Failed to configure Claude API: ${String(error)}`);
      }
    }
  }

  if (gptMethod === 'cli') {
    gptProvider = new GptCliProvider();
    try {
      await gptProvider.configure({});
      // Set the model from saved config
      const savedGptModel = config.get<string>('gptModel', 'gpt-4o');
      if ('setModel' in gptProvider) {
        (gptProvider as any).setModel(savedGptModel);
        logger.info('general', `GPT CLI model set to: ${savedGptModel}`);
      }
    } catch (error) {
      logger.error('general', `Failed to configure GPT CLI: ${String(error)}`);
    }
  } else {
    gptProvider = new GPTProvider();
    const keys = await authService.getApiKeys();
    if (keys.openai) {
      try {
        gptProvider.configure({
          apiKey: keys.openai,
          model: config.get('gptModel', 'gpt-4o')
        });
      } catch (error) {
        logger.error('general', `Failed to configure GPT API: ${String(error)}`);
      }
    }
  }
}

function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('spacecode.openPanel', () => {
      MainPanel.createOrShow(
        context.extensionUri,
        orchestrator,
        costTracker,
        knowledgeBase,
        mcpManager,
        voiceService,
        pricingService,
        context
      );
    })
  );

  // Alias for convenience
  context.subscriptions.push(
    vscode.commands.registerCommand('spacecode.open', () => vscode.commands.executeCommand('spacecode.openPanel'))
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('spacecode.newChat', () => {
      vscode.commands.executeCommand('spacecode.openPanel');
      orchestrator.clear();
    })
  );

  // Basic message helpers: open panel then prompt
  context.subscriptions.push(
    vscode.commands.registerCommand('spacecode.askClaude', async () => {
      vscode.commands.executeCommand('spacecode.openPanel');
      // UI handles sending; keep command as entry point.
      vscode.commands.executeCommand('setContext', 'spacecode.defaultMode', 'claude');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('spacecode.askGPT', async () => {
      vscode.commands.executeCommand('spacecode.openPanel');
      vscode.commands.executeCommand('setContext', 'spacecode.defaultMode', 'gpt');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('spacecode.masterMind', async () => {
      vscode.commands.executeCommand('spacecode.openPanel');
      vscode.commands.executeCommand('setContext', 'spacecode.defaultMode', 'mastermind');
    })
  );

  // Settings/logs are handled inside the panel; these commands are kept for parity.
  context.subscriptions.push(vscode.commands.registerCommand('spacecode.showSettings', () => vscode.commands.executeCommand('spacecode.openPanel')));
  context.subscriptions.push(vscode.commands.registerCommand('spacecode.configureKeys', () => vscode.commands.executeCommand('spacecode.openPanel')));
  context.subscriptions.push(vscode.commands.registerCommand('spacecode.showLogs', () => logger.show('general')));
  context.subscriptions.push(vscode.commands.registerCommand('spacecode.showMcpLogs', () => logger.show('mcp')));
  context.subscriptions.push(vscode.commands.registerCommand('spacecode.showApiLogs', () => logger.show('api')));
  context.subscriptions.push(vscode.commands.registerCommand('spacecode.showToolsLogs', () => logger.show('tools')));
  context.subscriptions.push(vscode.commands.registerCommand('spacecode.clearLogs', () => logger.clearAll()));

  // TODO: wire these to workflow UI.
  context.subscriptions.push(vscode.commands.registerCommand('spacecode.showAgents', () => vscode.commands.executeCommand('spacecode.openPanel')));
  context.subscriptions.push(vscode.commands.registerCommand('spacecode.importWorkflow', () => vscode.commands.executeCommand('spacecode.openPanel')));
  context.subscriptions.push(vscode.commands.registerCommand('spacecode.exportWorkflow', () => vscode.commands.executeCommand('spacecode.openPanel')));

  // Placeholder for review command; panel has review UI.
  context.subscriptions.push(
    vscode.commands.registerCommand('spacecode.reviewCode', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.selection.isEmpty) {
        vscode.window.showErrorMessage('Please select some code first');
        return;
      }
      vscode.commands.executeCommand('spacecode.openPanel');
    })
  );
}

export function deactivate() {}
