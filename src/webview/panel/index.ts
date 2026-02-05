// @ts-nocheck
/* SpaceCode Panel JavaScript - Extracted from mainPanel.ts */
/* Phase 2 of Refactoring Plan */

import {
  TABS,
  CHAT_MODES,
  TAB_PANEL_MODES,
  TAB_DEFAULT_MODE,
  MODES,
  PERSONA_MAP,
  uiState,
} from './state';
import { createDocTargetHandlers } from './features/docTargets';
import { createChatSessionManager } from './features/chatSessions';
import { createTicketPanelHandlers } from './features/tickets';
import { createTicketsSidebarHandlers } from './features/ticketsSidebar';
import { createSkillsPanelHandlers } from './features/skills';
import { createDashboardHandlers } from './features/dashboard';
import { createDashboardStatsHandlers } from './features/dashboardStats';
import { createAgentsPanelHandlers } from './features/agents';
import { createChatInputHandlers } from './features/chatInput';
import { createChatRendererHandlers } from './features/chatRenderer';
import { createChatToolsHandlers } from './features/chatTools';
import { createChatModeHandlers } from './features/chatMode';
import { createContextPreviewHandlers } from './features/contextPreview';
import { createKbPanelHandlers } from './features/kb';
import { createMcpPanelHandlers } from './features/mcp';
import { createModelToolbarHandlers } from './features/modelToolbar';
import { createPlanHandlers } from './features/plans';
import { createSettingsPanelHandlers } from './features/settingsPanel';
import { createStationPanelHandlers } from './features/station';
import { createAsmdefHandlers } from './features/asmdef';
import { createAutoexecuteHandlers } from './features/autoexecute';
import { createRightPanelHandlers } from './features/rightPanel';
import { createPlanningPanelHandlers } from './features/planningPanel';
import { createSideChatHandlers } from './features/sideChat';
import { createControlTabsHandlers } from './features/controlTabs';
import { initMainSplitter } from './features/splitter';
import { createTabHandlers } from './features/tabs';
import { createTokenBarHandlers } from './features/tokenBar';
import { createUnityPanelHandlers } from './features/unityPanel';
import { createVerificationPanelHandlers } from './features/verificationPanel';
import { createVoicePanelHandlers } from './features/voice';
import { escapeHtml } from './utils/dom';
import { shipSetStatus } from './utils/status';
import { getContextLimit } from './utils/context';
import { showToast } from './utils/toast';
import { createFlowPanelHandlers } from './features/flow';
import { createSectorMapHandlers } from './features/sectorMap';
import { createMessageRouter } from './ipc/messageRouter';

// These globals are injected by the webview host before this script loads
const STATION_MAP = window.__SC_STATION_MAP__;
const BUILD_ID = window.__SC_BUILD_ID__;
const vscode = window.__SC_VSCODE__;


// Legacy global variables - to be migrated to uiState
let currentTab = uiState.currentTab;
let currentChatMode = uiState.chatMode;
let currentMode = uiState.mode; // Legacy alias for currentTab
// isGenerating is now per-chat in chatSessions[chatId].isGenerating
let attachedImages = uiState.attachedImages;
let docTargets = uiState.docTargets;
let docTarget = uiState.docTarget;
let planTemplates = uiState.planTemplates;
let planList = uiState.planList;
let currentPlanData = uiState.currentPlan;
let ticketList = [];

let lastCoordinatorToast = '';
let chatSessions = {};
let currentChatId = '';
let chatCounter = 0;
let currentSettings = {};
let _gptFlowPending = false;

// Flow visualization manager
const flowManager = createFlowPanelHandlers({
      d3: typeof d3 !== 'undefined' ? d3 : null,
      escapeHtml,
    });

    const {
      initContextFlowVisualization,
      startAiFlow,
      spawnFlowChunk,
      setFlowThinking,
      stopThreadAnimation,
      stopParticleSpawning,
      stopParticleFlow,
      renderAiFlow,
      clearAiFlow,
      setAiStage,
      clearContextSources,
      addContextSourceCard,
      showLiveResponse,
      hideLiveResponse,
      updateLiveResponseText,
      toggleMiniGraph,
      getFlowResponseTokens,
    } = flowManager;

    window.toggleMiniGraph = toggleMiniGraph;

    // Sector Map visualization
    const sectorMapManager = createSectorMapHandlers({
      vscode,
      escapeHtml,
    });

    const {
      initSectorMap,
      renderSectorMap,
      destroySectorMap,
      requestSectorMapData,
      getDefaultSectorData,
      createOrbitalGraph,
      initAiOrbitalFlow,
    } = sectorMapManager;

    // Chat session manager (updateTokenBar and getSelectedModel use lazy refs — defined later)
    const chatSessionManager = createChatSessionManager({
      vscode,
      getCurrentMode: () => currentMode,
      setCurrentMode: (val) => { currentMode = val; },
      getChatSessions: () => chatSessions,
      setChatSessions: (val) => { chatSessions = val; },
      getCurrentChatId: () => currentChatId,
      setCurrentChatId: (val) => { currentChatId = val; },
      getChatCounter: () => chatCounter,
      setChatCounter: (val) => { chatCounter = val; },
      clearAiFlow,
      clearContextSources,
      hideLiveResponse,
      updateTokenBar: (...args) => updateTokenBar(...args),
      getSelectedModel: () => getSelectedModel?.(),
    });

    const {
      newChat,
      getClaudeSessionId,
      switchChat,
      addToMessageHistory,
      getMessageHistory,
      closeChat,
      renderChatTabs,
      saveChatState,
      restoreChatState,
      getEmptyStateHtml,
      closeMaxTabsModal,
      setCurrentChatProvider,
      getCurrentChatProvider,
    } = chatSessionManager;

    Object.assign(window, {
      newChat,
      switchChat,
      closeChat,
      closeMaxTabsModal,
    });

    // Chat renderer
    const chatRenderer = createChatRendererHandlers({
      vscode,
      escapeHtml,
      marked: typeof marked !== 'undefined' ? marked : null,
      renderChatTabs,
      getChatSessions: () => chatSessions,
      getCurrentChatId: () => currentChatId,
    });

    const {
      createMessageHtml,
      addMessage,
      appendToStreamingMessage,
      finalizeStreamingMessage,
      setGenerating,
      updateSendStopButton,
      stopConversation,
      clearChat,
      insertPrompt,
    } = chatRenderer;

    Object.assign(window, {
      stopConversation,
      clearChat,
      insertPrompt,
    });

    // Ticket sidebar (provides updateTicketStatus/deleteTicket used by tickets panel)
    const ticketsSidebarHandlers = createTicketsSidebarHandlers({
      vscode,
      escapeHtml,
      shipSetStatus,
      getPlanList: () => planList,
    });

    const {
      toggleTicketForm,
      createTicket,
      refreshTickets,
      updateTicketStatus,
      deleteTicket,
      renderTicketList,
    } = ticketsSidebarHandlers;

    Object.assign(window, {
      toggleTicketForm,
      createTicket,
      refreshTickets,
    });

    // Dashboard stats
    const dashboardStatsHandlers = createDashboardStatsHandlers({
      vscode,
      escapeHtml,
    });

    const {
      updateDocsPanel,
      updateDbPanel,
      updateLogsPanel,
    } = dashboardStatsHandlers;

    const unityPanelHandlers = createUnityPanelHandlers({
      vscode,
      shipSetStatus,
      escapeHtml,
    });

    const {
      unityCheckConnection,
      unitySendCommand,
      unityRefresh,
      unityHeaderClick,
      updateUnityMCPStatus,
      updateUnityPanelInfo,
      toggleConsoleFilter,
      updateUnityStatus,
      updateUnityConsole,
      clearUnityConsole,
      setUnityButtonsLoading,
      getUnityConnected,
      setUnityConnected,
    } = unityPanelHandlers;

    Object.assign(window, {
      unityCheckConnection,
      unitySendCommand,
      unityRefresh,
      unityHeaderClick,
      toggleConsoleFilter,
      clearUnityConsole,
    });

    const { switchControlTab } = createControlTabsHandlers({
      unityCheckConnection,
      onSectorsTabOpen: () => {
        // Initialize sector map canvas when Sectors tab is first opened
        initSectorMap();
        // Load sector data from backend (or show defaults)
        requestSectorMapData();
      },
    });

    Object.assign(window, {
      switchControlTab,
    });

    // Sector map global functions for HTML onclick handlers
    Object.assign(window, {
      sectorMapScan: () => {
        requestSectorMapData();
      },
      sectorMapValidate: () => {
        vscode.postMessage({ type: 'asmdefValidate' });
      },
      closeSectorDetail: () => {
        const card = document.getElementById('sectorDetailCard');
        if (card) card.style.display = 'none';
      },
      sectorOpenFolder: () => {
        const nameEl = document.getElementById('sectorDetailName');
        if (nameEl && nameEl.dataset.sectorId) {
          vscode.postMessage({ type: 'sectorOpenFolder', sectorId: nameEl.dataset.sectorId });
        }
      },
      sectorOpenAsmdef: () => {
        const nameEl = document.getElementById('sectorDetailName');
        if (nameEl && nameEl.dataset.sectorId) {
          vscode.postMessage({ type: 'sectorOpenAsmdef', sectorId: nameEl.dataset.sectorId });
        }
      },
      // Security & Quality scan functions
      runSecurityScan: () => {
        vscode.postMessage({ type: 'securityScan' });
      },
      exportSecurityReport: () => {
        vscode.postMessage({ type: 'securityExport' });
      },
      runQualityScan: () => {
        vscode.postMessage({ type: 'qualityScan' });
      },
      exportQualityReport: () => {
        vscode.postMessage({ type: 'qualityExport' });
      },
      // Context Handoff functions
      handoffToPersona: (toPersona, action) => {
        const fromPersona = uiState.currentPersona || 'nova';
        const chatEl = document.getElementById('chatMessages');
        const lastMessages = chatEl ? chatEl.innerText.slice(-500) : '';
        vscode.postMessage({
          type: 'handoffCreate',
          fromPersona,
          toPersona,
          summary: 'Context handoff from ' + fromPersona,
          context: { chatHistory: [lastMessages], sectorId: uiState.shipSelectedSectorId || '' },
          action: action || 'send_and_stay',
        });
      },
      toggleHandoffMenu: () => {
        const menu = document.getElementById('handoffMenu');
        if (!menu) return;
        const isVisible = menu.style.display !== 'none';
        if (isVisible) {
          menu.style.display = 'none';
          return;
        }
        // Position using fixed layout to escape overflow:hidden parents
        const btn = menu.parentElement?.querySelector('.toolbar-icon-btn');
        if (btn) {
          const rect = btn.getBoundingClientRect();
          menu.style.left = rect.left + 'px';
          menu.style.bottom = (window.innerHeight - rect.top + 6) + 'px';
        }
        menu.style.display = 'block';
        const dismiss = (e: MouseEvent) => {
          const target = e.target as HTMLElement;
          if (!menu.contains(target) && !target.closest('#handoffDropdown')) {
            menu.style.display = 'none';
            document.removeEventListener('click', dismiss);
          }
        };
        setTimeout(() => document.addEventListener('click', dismiss), 10);
      },
      handoffToGears: () => { window.handoffToPersona('gears', 'send_and_stay'); },
      handoffToNova: () => { window.handoffToPersona('nova', 'send_and_stay'); },
      handoffToIndex: () => { window.handoffToPersona('index', 'send_and_stay'); },
      handoffGoToGears: () => { window.handoffToPersona('gears', 'go_to_tab'); window.switchTab('station'); },
      handoffGoToNova: () => { window.handoffToPersona('nova', 'go_to_tab'); window.switchTab('chat'); },
      // Autosolve functions
      autosolveAccept: (id) => { vscode.postMessage({ type: 'autosolveAccept', resultId: id }); },
      autosolveDismiss: (id) => { vscode.postMessage({ type: 'autosolveDismiss', resultId: id }); },
      autosolveSendToIndex: (id) => { vscode.postMessage({ type: 'autosolveSendToIndex', resultId: id }); },
      autosolveRefresh: () => { vscode.postMessage({ type: 'autosolveList' }); },
    });

    const savedTab = localStorage.getItem('spacecode.controlTab') || 'info';
    const allowedTabs = new Set(['info', 'coordinator', 'ops', 'unity', 'sectors', 'security', 'quality']);
    setTimeout(() => switchControlTab(allowedTabs.has(savedTab) ? savedTab : 'info'), 0);

    setTimeout(() => {
      localStorage.removeItem('spacecode.panelMode.chat');
      localStorage.removeItem('spacecode.panelMode.station');

      const defaultMode = TAB_DEFAULT_MODE[currentTab] || 'station';
      setRightPanelMode(defaultMode);
      updatePanelToggleButtons();
    }, 0);

    const verificationPanelHandlers = createVerificationPanelHandlers({
      vscode,
      shipSetStatus,
      escapeHtml,
    });

    const {
      scanDiff,
      runTests,
      updateTestResult,
      updateDiffSummary,
      updatePlanComparison,
      showPlanExecutionPanel,
      setPlanExecutionStatus,
      setPlanExecutionProgress,
      clearPlanExecutionLog,
      appendPlanExecutionLog,
      showPlanStepGate,
      hidePlanStepGate,
      approvePlanStep,
      abortPlanStep,
      runAIReview,
      updateAIReview,
      setPlanExecutionButtonsEnabled,
      getPlanExecutionState,
      setPlanExecutionState,
    } = verificationPanelHandlers;

    Object.assign(window, {
      scanDiff,
      runTests,
      approvePlanStep,
      abortPlanStep,
      runAIReview,
    });

    const planHandlers = createPlanHandlers({
      vscode,
      shipSetStatus,
      escapeHtml,
      getCurrentMode: () => currentMode,
      getCurrentPlanData: () => currentPlanData,
      setCurrentPlanData: (value) => { currentPlanData = value; uiState.currentPlan = value; },
      getPlanList: () => planList,
      getPlanTemplates: () => planTemplates,
      setPlanTemplates: (value) => { planTemplates = value; uiState.planTemplates = value; },
      setPlanList: (value) => { planList = value; uiState.planList = value; },
      showPlanExecutionPanel,
      setPlanExecutionButtonsEnabled,
    });

    const {
      refreshPlanTemplates,
      refreshPlans,
      generatePlan,
      saveCurrentPlan,
      usePlanForComparison,
      executeCurrentPlan,
      executePlanStepByStep,
      renderPlanSummary,
      renderPlanList,
      loadPlan,
    } = planHandlers;

    Object.assign(window, {
      refreshPlanTemplates,
      refreshPlans,
      generatePlan,
      saveCurrentPlan,
      usePlanForComparison,
      executeCurrentPlan,
      executePlanStepByStep,
      loadPlan,
    });

    // Station + doc target wiring
    const stationManager = createStationPanelHandlers({
      vscode,
      uiState,
      stationMap: STATION_MAP,
      escapeHtml,
      shipSetStatus,
    });

    const {
      setUpdateDocSuggestion,
      initStationUI,
      updateStationLabels,
      stationRenderScene,
      stationRenderSchematic,
      stationRenderPhoto,
      stationToggleViewMode,
      stationGoBack,
      stationSetScene,
      stationUpdateViewport,
      shipRender,
      shipUpdateChips,
      shipSelectSector,
      shipRequestContextPack,
      shipRunGates,
      shipDocsStatus,
      openHotspotTool,
      shipToggleAutoexecute,
      asmdefRefresh,
      asmdefGeneratePolicy,
      asmdefOpenPolicy,
      asmdefEditPolicy,
      asmdefReloadPolicy,
      asmdefSavePolicy,
      asmdefSetStrict,
      asmdefSetAdvisory,
      asmdefNormalizeGuids,
      asmdefGraph,
      asmdefValidate,
      copyAsmdefFixes,
      setCoordinatorPill,
      updateCoordinatorSummary,
      updateCoordinatorLastIssue,
      coordinatorHealthCheck,
      getShipSelectedSectorId,
      getShipSelectedSubId,
      getShipAutoexecute,
      getShipProfile,
      setShipSelectedSectorId,
      setShipSelectedSubId,
      setShipAutoexecute,
      setShipProfile,
    } = stationManager;

    const {
      renderAsmdefInventory,
      renderAsmdefPolicyEditor,
      renderAsmdefGraph,
      renderAsmdefCheckResult,
    } = createAsmdefHandlers({
      vscode,
      escapeHtml,
    });

    const {
      refreshDocTargets,
      docTargetChanged,
      openDocTarget,
      updateDocInfo,
      updateDocSuggestion,
      populateDocTargets,
    } = createDocTargetHandlers({
      vscode,
      getDocTarget: () => docTarget,
      setDocTarget: (value) => {
        docTarget = value;
        uiState.docTarget = value;
      },
      shipSetStatus,
      getShipSelectedSectorId,
    });

    setUpdateDocSuggestion(updateDocSuggestion);

    const {
      renderJobList,
      requestJobList,
      clearAllJobs,
    } = createAutoexecuteHandlers({
      vscode,
    });

    Object.assign(window, {
      refreshDocTargets,
      docTargetChanged,
      openDocTarget,
      stationGoBack,
      stationToggleViewMode,
      shipSelectSector,
      shipRequestContextPack,
      shipRunGates,
      shipDocsStatus,
      shipToggleAutoexecute,
      openHotspotTool,
      asmdefRefresh,
      asmdefGeneratePolicy,
      asmdefOpenPolicy,
      asmdefEditPolicy,
      asmdefReloadPolicy,
      asmdefSavePolicy,
      asmdefSetStrict,
      asmdefSetAdvisory,
      asmdefNormalizeGuids,
      asmdefGraph,
      asmdefValidate,
      copyAsmdefFixes,
      clearAllJobs,
    });

    const {
      setContextPreview,
      copyContextPreview,
    } = createContextPreviewHandlers({
      shipSetStatus,
    });

    Object.assign(window, {
      copyContextPreview,
    });

    const rightPanelHandlers = createRightPanelHandlers({
      currentTab: () => currentTab,
      TABS,
      TAB_PANEL_MODES,
      TAB_DEFAULT_MODE,
    });

    const {
      setRightPanelMode,
      updatePanelToggleButtons,
      restoreRightPanelModeForTab,
      toggleContextFlowPanel,
      toggleSwarmSidebar,
      toggleContextFlowDrawer,
    } = rightPanelHandlers;

    Object.assign(window, {
      setRightPanelMode,
      toggleContextFlowPanel,
      toggleSwarmSidebar,
      toggleContextFlowDrawer,
    });

    const planningPanelHandlers = createPlanningPanelHandlers({
      vscode,
    });

    const {
      renderPlanningPanel,
      startPlanningSession,
      advancePlanPhase,
      skipToPlanPhase,
      cancelPlanSession,
      completePlanSession,
      passCurrentGate,
      generatePlanFromSession,
    } = planningPanelHandlers;

    Object.assign(window, {
      startPlanningSession,
      advancePlanPhase,
      skipToPlanPhase,
      cancelPlanSession,
      completePlanSession,
      passCurrentGate,
      generatePlanFromSession,
    });

    const chatModeHandlers = createChatModeHandlers({
      vscode,
      uiState,
      TABS,
      CHAT_MODES,
      getCurrentTab: () => currentTab,
      getCurrentChatMode: () => currentChatMode,
      setCurrentChatMode: (value) => { currentChatMode = value; },
      restoreRightPanelModeForTab,
      setRightPanelMode,
    });

    const {
      updateChatModeSwitcherVisibility,
      updateMastermindConfigVisibility,
      switchChatMode,
    } = chatModeHandlers;

    Object.assign(window, {
      switchChatMode,
      updateMastermindConfigVisibility,
    });

    const agentsManager = createAgentsPanelHandlers({
      vscode,
      escapeHtml,
    });

    const {
      ensureInitialized: ensureAgentsInitialized,
      requestWorkflows,
      setWorkflows,
      updateWorkflowList,
      newWorkflow,
      clearCanvas,
      saveCurrentWorkflow,
      loadWorkflow,
      deleteWorkflow,
      importWorkflow,
      exportCurrentWorkflow,
      runWorkflow,
      closeWorkflowOutput,
      updateNodeConfig,
      deleteSelectedNode,
      handleWorkflowEvent,
    } = agentsManager;

    Object.assign(window, {
      newWorkflow,
      clearCanvas,
      saveCurrentWorkflow,
      loadWorkflow,
      deleteWorkflow,
      importWorkflow,
      exportCurrentWorkflow,
      runWorkflow,
      closeWorkflowOutput,
      updateNodeConfig,
      deleteSelectedNode,
      refreshAgentList: () => { vscode.postMessage({ type: 'getAgentList' }); },
      refreshSkillCatalog: () => { vscode.postMessage({ type: 'getSkillList' }); },
      viewAgentDetails: (agentId) => { vscode.postMessage({ type: 'getAgentDetails', agentId }); },
    });

    const tabHandlers = createTabHandlers({
      TABS,
      PERSONA_MAP,
      setCurrentTab: (value) => { currentTab = value; },
      setCurrentMode: (value) => { currentMode = value; },
      setCurrentPersona: (value) => { uiState.currentPersona = value; },
      getDashboardSubtab: () => uiState.dashboardSubtab || 'docs',
      restoreRightPanelModeForTab,
      updateChatModeSwitcherVisibility,
      ensureAgentsInitialized,
      requestWorkflows,
      vscode,
    });

    const { initTabButtons, switchTab } = tabHandlers;

    // Settings overlay state
    let settingsOverlayOpen = false;
    let settingsContentMoved = false;

    const toggleSettingsOverlay = () => {
      const overlay = document.getElementById('settingsOverlay');
      const settingsBtn = document.getElementById('settingsHeaderBtn');
      const overlayContent = document.getElementById('settingsOverlayContent');
      const dashboardSettingsPanel = document.getElementById('dashboardSettingsPanel');

      if (!overlay) return;

      settingsOverlayOpen = !settingsOverlayOpen;

      if (settingsOverlayOpen) {
        // Move Settings content from Dashboard to overlay (first time only)
        if (!settingsContentMoved && dashboardSettingsPanel && overlayContent) {
          // Clone the inner content (not the panel wrapper)
          overlayContent.innerHTML = dashboardSettingsPanel.innerHTML;
          settingsContentMoved = true;
        }

        overlay.style.display = 'flex';
        settingsBtn?.classList.add('active');

        // Request fresh data
        vscode.postMessage({ type: 'getSettings' });
        vscode.postMessage({ type: 'getCliStatus' });
        vscode.postMessage({ type: 'getUsageStats' });
      } else {
        overlay.style.display = 'none';
        settingsBtn?.classList.remove('active');
      }
    };

    Object.assign(window, {
      switchTab,
      toggleSettingsOverlay,
      // Legacy alias
      openSettings: toggleSettingsOverlay,
    });

    initTabButtons();
    updateChatModeSwitcherVisibility();

    const chatToolsHandlers = createChatToolsHandlers({
      vscode,
      setRightPanelMode,
      getCurrentChatMode: () => currentChatMode,
      chatModes: CHAT_MODES,
    });

    const {
      getGptOpinion,
      toggleChatSplit,
      syncChatSplitMirror,
      getChatSplitActive,
    } = chatToolsHandlers;

    Object.assign(window, {
      getGptOpinion,
      toggleChatSplit,
    });

    const modelToolbarHandlers = createModelToolbarHandlers({
      vscode,
      getCurrentMode: () => currentMode,
      setCurrentChatProvider,
    });

    const {
      toggleToolbarDropdown,
      selectChatMode,
      selectModel,
      selectReasoning,
      selectConsultant,
      toggleGptConsult,
      selectInterventionLevel,
      updateModelToolbarForMode,
      handleToolbarSettings,
      getSelectedModel,
      getGptConsultEnabled,
      getGptInterventionLevel,
    } = modelToolbarHandlers;

    Object.assign(window, {
      toggleToolbarDropdown,
      selectChatMode,
      selectModel,
      selectReasoning,
      selectConsultant,
      toggleGptConsult,
      selectInterventionLevel,
    });

    const chatInputHandlers = createChatInputHandlers({
      vscode,
      addMessage,
      getMessageHistory,
      addToMessageHistory,
      getClaudeSessionId,
      getShipSelectedSectorId,
      shipSetStatus,
      getCurrentChatId: () => currentChatId,
      getChatSessions: () => chatSessions,
      getCurrentChatMode: () => currentChatMode,
      getSelectedModel,
      getGptConsultEnabled,
      getGptInterventionLevel,
      getAttachedImages: () => attachedImages,
      setAttachedImages: (value) => { attachedImages = value; uiState.attachedImages = value; },
      setGenerating,
      updateSendStopButton,
      stopConversation,
      getCurrentPersona: () => uiState.currentPersona || 'nova',
    });

    const {
      sendMessage,
      toggleDropZone,
      handleDragOver,
      handleDragLeave,
      handleDrop,
      handlePaste,
      removeImage,
      showCompactionNotice,
      handleKeyDown,
      autoResize,
    } = chatInputHandlers;

    Object.assign(window, {
      sendMessage,
      toggleDropZone,
      handleDragOver,
      handleDragLeave,
      handleDrop,
      handlePaste,
      removeImage,
      handleKeyDown,
      autoResize,
    });


    const tokenBarHandlers = createTokenBarHandlers({
      vscode,
      currentSettings,
      getContextLimit,
      getChatSessions: () => chatSessions,
      getCurrentChatId: () => currentChatId,
    });

    const {
      mergePricing,
      openPricing,
      updateTokenBar,
    } = tokenBarHandlers;

    Object.assign(window, {
      openPricing,
      openExternalUrl: (url: string) => {
        vscode.postMessage({ type: 'openExternal', url });
      },
      // Model panel handlers
      switchModelTab: (provider: string) => {
        const claudePanel = document.getElementById('claudeModelsPanel');
        const gptPanel = document.getElementById('gptModelsPanel');
        const tabs = document.querySelectorAll('.model-tab');

        tabs.forEach(tab => {
          tab.classList.toggle('active', tab.getAttribute('data-provider') === provider);
        });

        if (claudePanel && gptPanel) {
          claudePanel.classList.toggle('hidden', provider !== 'claude');
          gptPanel.classList.toggle('hidden', provider !== 'gpt');
        }
      },
      verifyAllModels: () => {
        const btn = document.getElementById('verifyModelsBtn');
        const status = document.getElementById('modelVerificationStatus');
        if (btn) btn.innerHTML = '<span class="btn-icon">⏳</span> Verifying...';
        if (status) {
          status.className = 'verification-status';
          status.innerHTML = '<span class="status-text">Verifying models...</span>';
        }
        // Mark all as checking
        document.querySelectorAll('.verify-status').forEach(el => {
          el.textContent = '⏳';
          el.className = 'verify-status checking';
        });
        vscode.postMessage({ type: 'verifyModels' });
      },
      selectDefaultModel: (provider: string, modelId: string) => {
        vscode.postMessage({ type: 'setModel', provider, model: modelId });
        showToast(`${provider === 'claude' ? 'Claude' : 'GPT'} default model set to ${modelId}`, 'success');
        // Update UI
        const cards = document.querySelectorAll(`#${provider}ModelsPanel .model-card`);
        cards.forEach(card => {
          const isSelected = card.getAttribute('data-model-id') === modelId;
          card.classList.toggle('default', isSelected);
          const badge = card.querySelector('.default-badge');
          const btn = card.querySelector('.btn-tiny');
          if (badge) badge.remove();
          if (btn) {
            btn.classList.toggle('active', isSelected);
            btn.textContent = isSelected ? '✓' : '○';
          }
          if (isSelected && !card.querySelector('.default-badge')) {
            const nameEl = card.querySelector('.model-name');
            if (nameEl) {
              const newBadge = document.createElement('span');
              newBadge.className = 'default-badge';
              newBadge.textContent = 'Default';
              nameEl.appendChild(newBadge);
            }
          }
        });
      },
      handleModelVerificationResults: (results: any) => {
        const btn = document.getElementById('verifyModelsBtn');
        const status = document.getElementById('modelVerificationStatus');

        if (btn) btn.innerHTML = '<span class="btn-icon">🔍</span> Verify All';

        let validCount = 0;
        let invalidCount = 0;

        for (const result of results.results || []) {
          const el = document.getElementById(`verify-${result.modelId}`);
          if (el) {
            if (result.status === 'valid') {
              el.textContent = '✓';
              el.className = 'verify-status valid';
              el.title = result.message;
              validCount++;
            } else if (result.status === 'invalid') {
              el.textContent = '✗';
              el.className = 'verify-status invalid';
              el.title = result.message;
              invalidCount++;
            } else if (result.status === 'no-key') {
              el.textContent = '🔑';
              el.className = 'verify-status';
              el.title = 'No API key';
            } else {
              el.textContent = '?';
              el.className = 'verify-status';
              el.title = result.message;
            }
          }
        }

        if (status) {
          const total = results.claudeModelsTotal + results.gptModelsTotal;
          const valid = results.claudeModelsValid + results.gptModelsValid;
          if (invalidCount > 0) {
            status.className = 'verification-status warning';
            status.innerHTML = `<span class="status-text">${valid}/${total} models verified · ${invalidCount} invalid</span>`;
          } else if (valid === total) {
            status.className = 'verification-status success';
            status.innerHTML = `<span class="status-text">All ${total} models verified ✓</span>`;
          } else {
            status.className = 'verification-status';
            status.innerHTML = `<span class="status-text">${valid}/${total} models verified</span>`;
          }
        }
      },
    });

    const settingsPanelHandlers = createSettingsPanelHandlers({
      vscode,
      currentSettings,
      updateTokenBar,
      getCurrentChatId: () => currentChatId,
      showToast,
    });

    const {
      installOutsideClickHandler,
      showSettingsPanel,
      switchSettingsTab,
      closeSettingsPanel,
      showTab,
      handleGitAction,
      saveConnectionMethods,
      loadConnectionMethods,
      onConnectionMethodChange,
      handleCliAction,
      saveMastermindSettings,
      refreshCliStatus,
      renderCliStatus,
      refreshOpenaiModels,
      applyPricingOverride,
      refreshPricingOverrides,
      installCli,
      loginCli,
      saveApiKeys,
      saveGitSettings,
      loadGitSettings,
      clearGitOverrides,
      showLogChannel,
      clearAllLogs,
      openTerminal,
      openDevTools,
      reloadPanel,
      rebuildIndex,
      clearCache,
      confirmResetDb,
      loadSettings,
      saveSettings,
      confirmResetSettings,
      confirmClearAllData,
      updateSettings,
      renderCosts,
      onSettingsModelChange,
      onSettingsConsultantChange,
      toggleApiKeyVisibility,
      handleApiKeyValue,
      devExportSettings,
      devImportSettings,
      handleDevExportSuccess,
      handleDevImportSuccess,
      handleDevExportError,
      handleDevImportError,
      refreshUsageStats,
      renderUsageStats,
    } = settingsPanelHandlers;

    installOutsideClickHandler();

    Object.assign(window, {
      showSettingsPanel,
      switchSettingsTab,
      closeSettingsPanel,
      showTab,
      handleGitAction,
      saveConnectionMethods,
      onConnectionMethodChange,
      handleCliAction,
      saveMastermindSettings,
      refreshCliStatus,
      refreshOpenaiModels,
      applyPricingOverride,
      refreshPricingOverrides,
      installCli,
      loginCli,
      saveApiKeys,
      saveGitSettings,
      clearGitOverrides,
      showLogChannel,
      clearAllLogs,
      openTerminal,
      openDevTools,
      reloadPanel,
      rebuildIndex,
      clearCache,
      confirmResetDb,
      loadSettings,
      saveSettings,
      confirmResetSettings,
      confirmClearAllData,
      updateSettings,
      onSettingsModelChange,
      onSettingsConsultantChange,
      toggleApiKeyVisibility,
      devExportSettings,
      devImportSettings,
      refreshUsageStats,
      togglePanelBorders: (enabled) => {
        document.body.classList.toggle('show-panel-borders', enabled);
        localStorage.setItem('spacecode.showBorders', enabled ? '1' : '0');
      },
      toggleSoundEnabled: (enabled) => {
        vscode.postMessage({ type: 'saveSoundSettings', enabled });
      },
    });

    // Restore panel borders on load
    if (localStorage.getItem('spacecode.showBorders') === '1') {
      document.body.classList.add('show-panel-borders');
      const checkbox = document.getElementById('settingsShowBorders') as any;
      if (checkbox) checkbox.checked = true;
    }

    const {
      showTicketsPanel,
      hideTicketsPanel,
      toggleTicketFormMain,
      createTicketMain,
      filterTickets,
      renderTicketsListMain,
      updateTicketTypePreview,
    } = createTicketPanelHandlers({
      vscode,
      getPlanList: () => planList,
      shipSetStatus,
      escapeHtml,
      updateTicketStatus,
      deleteTicket,
    });

    Object.assign(window, {
      toggleTicketFormMain,
      createTicketMain,
      filterTickets,
      updateTicketTypePreview,
    });

    const {
      refreshSkills,
      createSkill,
      filterSkills,
      renderSkillsList,
      runSkill,
      editSkill,
    } = createSkillsPanelHandlers({
      vscode,
      escapeHtml,
    });

    Object.assign(window, {
      refreshSkills,
      createSkill,
      filterSkills,
      runSkill,
      editSkill,
    });

    const {
      refreshDashboard,
      updateDashboardMetrics,
      renderActivityList,
      renderTicketsSummary,
      switchDashboardSubtab,
      toggleTicketFormDashboard,
      createTicketFromDashboard,
      refreshDbStats,
      scanProjectDocs,
      refreshDocs,
      ingestKbSource,
      openSettingsFile,
    } = createDashboardHandlers({
      vscode,
      escapeHtml,
      shipSetStatus,
      setDashboardSubtab: (value) => { uiState.dashboardSubtab = value; },
      setCurrentPersona: (value) => { uiState.currentPersona = value; },
      PERSONA_MAP,
    });

    Object.assign(window, {
      refreshDashboard,
      switchDashboardSubtab,
      toggleTicketFormDashboard,
      createTicketFromDashboard,
      refreshDbStats,
      scanProjectDocs,
      refreshDocs,
      ingestKbSource,
      openSettingsFile,
      // Mission Panel
      refreshMission: () => { vscode.postMessage({ type: 'getMissionData' }); },
      createMilestone: () => {
        const title = prompt('Milestone title:');
        if (title) vscode.postMessage({ type: 'createMilestone', title });
      },
      // Storage Panel
      refreshStorage: () => { vscode.postMessage({ type: 'getStorageStats' }); },
      browseDbMessages: () => { vscode.postMessage({ type: 'getRecentDbMessages', limit: 100 }); },
      exportStorageData: () => { vscode.postMessage({ type: 'exportStorageData' }); },
      clearChatHistory: () => {
        if (confirm('Clear all chat history?')) vscode.postMessage({ type: 'clearChatHistory' });
      },
      clearEmbeddings: () => {
        if (confirm('Clear all embeddings?')) vscode.postMessage({ type: 'clearEmbeddings' });
      },
      clearAllStorage: () => {
        if (confirm('Clear ALL storage data? This cannot be undone.')) vscode.postMessage({ type: 'clearAllStorage' });
      },
      // Dashboard ticket auto-route preview
      updateDashboardTicketPreview: () => {
        const titleEl = document.getElementById('dashboardTicketTitle') as HTMLInputElement;
        const descEl = document.getElementById('dashboardTicketDescription') as HTMLTextAreaElement;
        const previewEl = document.getElementById('dashboardTicketRoutePreview');
        if (!titleEl || !previewEl) return;
        const title = titleEl.value || '';
        const desc = descEl ? descEl.value || '' : '';
        if (!title.trim()) { previewEl.style.display = 'none'; return; }
        const text = (title + ' ' + desc).toLowerCase();
        const types = {
          bug: ['bug','fix','broken','crash','error','issue','defect','regression','null','exception','fail'],
          feature: ['feature','add','new','implement','create','enhance','ability','support','request'],
          doc_update: ['doc','document','readme','wiki','comment','explain','guide','tutorial'],
          refactor: ['refactor','clean','rename','restructure','optimize','simplify','extract','move','split'],
          question: ['question','how','why','what','help','unclear','understand'],
        };
        let bestType = 'question', bestScore = 0;
        for (const [t, kws] of Object.entries(types)) {
          let s = 0;
          for (const k of kws) { if (text.includes(k)) s++; }
          if (s > bestScore) { bestScore = s; bestType = t; }
        }
        const routing = { bug: 'gears', feature: 'nova', doc_update: 'index', refactor: 'gears', question: 'nova' };
        const colors = { gears: '#f59e0b', nova: '#a855f7', index: '#3b82f6' };
        const names = { gears: 'Gears', nova: 'Nova', index: 'Index' };
        const persona = routing[bestType] || 'nova';
        previewEl.style.display = 'flex';
        previewEl.innerHTML =
          '<span style="font-size:10px;color:var(--text-secondary);">Auto-route:</span> ' +
          '<span style="font-size:10px;font-weight:600;color:' + (colors[persona] || '#888') + ';">' +
          bestType.replace('_', ' ').toUpperCase() + ' → ' + (names[persona] || persona) + '</span>';
      },
      // Art Studio Panel
      refreshArtStudio: () => { vscode.postMessage({ type: 'getArtStudioData' }); },
      setupStyleGuide: () => { vscode.postMessage({ type: 'getArtStudioData' }); showToast('Style guide setup coming soon', 'info'); },
      generateArtImage: () => {
        const promptEl = document.getElementById('artGenPrompt') as any;
        const presetEl = document.getElementById('artGenPreset') as any;
        vscode.postMessage({
          type: 'generateArtImage',
          prompt: promptEl?.value || '',
          preset: presetEl?.value || 'concept',
        });
      },
    });

    // ========== DOCS SYSTEM (Phase 5) ==========

    function setProjectComplexity(complexity: string) {
      vscode.postMessage({ type: 'docsSetComplexity', complexity });
    }

    function startDocsWizard() {
      vscode.postMessage({ type: 'docsWizardStart' });
    }

    function docsWizardNext() {
      // Collect questionnaire answers before advancing
      const contentEl = document.getElementById('docsWizardContent');
      if (contentEl) {
        const docType = contentEl.dataset.docType;
        if (docType) {
          const answers: Record<string, string> = {};
          contentEl.querySelectorAll('.wiz-answer').forEach((el: any) => {
            const qid = el.dataset.qid;
            if (qid && el.value) answers[qid] = el.value;
          });
          if (Object.keys(answers).length > 0) {
            vscode.postMessage({ type: 'docsWizardSetAnswers', docType, answers });
          }
        }
      }
      vscode.postMessage({ type: 'docsWizardNext' });
    }

    function docsWizardPrev() {
      vscode.postMessage({ type: 'docsWizardPrev' });
    }

    function docsWizardSkip() {
      vscode.postMessage({ type: 'docsWizardSkip' });
    }

    function docsWizardComplete() {
      vscode.postMessage({ type: 'docsWizardComplete' });
    }

    function docsWizardCancel() {
      vscode.postMessage({ type: 'docsWizardCancel' });
    }

    function detectDocDrift() {
      vscode.postMessage({ type: 'docsDetectDrift' });
    }

    // Wizard helper functions exposed on window
    (window as any)._wizSetProjectInfo = function() {
      const name = (document.getElementById('wizProjectName') as HTMLInputElement)?.value || '';
      const projectType = (document.getElementById('wizProjectType') as HTMLInputElement)?.value || 'unity';
      vscode.postMessage({ type: 'docsWizardSetProjectInfo', name, projectType });
    };

    (window as any)._wizToggleDoc = function(docType: string) {
      vscode.postMessage({ type: 'docsWizardToggleDoc', docType });
    };

    (window as any)._openDriftDoc = function(docType: string) {
      vscode.postMessage({ type: 'docsOpenDocument', docType });
    };

    Object.assign(window, {
      setProjectComplexity,
      startDocsWizard,
      docsWizardNext,
      docsWizardPrev,
      docsWizardSkip,
      docsWizardComplete,
      docsWizardCancel,
      detectDocDrift,
    });

    // Request initial docs state
    vscode.postMessage({ type: 'docsGetComplexity' });
    vscode.postMessage({ type: 'docsGetSummary' });

    // ========== AGENTS / WORKFLOW FUNCTIONS ==========

    const {
      renderMcpServers,
      selectMcpServer,
      mcpAction,
      addMcpServer,
    } = createMcpPanelHandlers({
      vscode,
    });

    Object.assign(window, {
      selectMcpServer,
      mcpAction,
      addMcpServer,
      pingUnityMcp: () => { vscode.postMessage({ type: 'unityCheckConnection' }); },
      pingCoplayMcp: () => { vscode.postMessage({ type: 'unityCheckConnection' }); },
    });

    const {
      renderKbEntries,
      renderEmbedderStatus,
      onModelSelect,
      downloadModel,
      setModelDownloading,
      updateModelDownloadProgress,
      embedEntry,
      embedAllEntries,
      setEmbeddingAll,
      updateEmbeddingProgress,
      updateEmbedAllProgress,
      handlePdfDragOver,
      handlePdfDragLeave,
      handlePdfDrop,
      handlePdfSelect,
      initKbDropZone,
      toggleCrawlOptions,
      addKbUrl,
      handleCrawlProgress,
    } = createKbPanelHandlers({
      vscode,
    });

    Object.assign(window, {
      onModelSelect,
      downloadModel,
      embedEntry,
      embedAllEntries,
      handlePdfDragOver,
      handlePdfDragLeave,
      handlePdfDrop,
      handlePdfSelect,
      toggleCrawlOptions,
      addKbUrl,
    });

    const {
      loadVoiceSettings,
      downloadWhisperModel,
      downloadWhisperBinary,
      saveVoiceSettings,
      testMicrophone,
      testSpeaker,
      updateVoiceDownloadProgress,
      handleMicTestStatus,
      handleSpeakerTestStatus,
    } = createVoicePanelHandlers({
      vscode,
    });

    Object.assign(window, {
      downloadWhisperModel,
      downloadWhisperBinary,
      saveVoiceSettings,
      testMicrophone,
      testSpeaker,
    });

    // Handle messages from extension
    const messageRouter = createMessageRouter({
      escapeHtml,
      shipSetStatus,
      setUnityButtonsLoading,
      updateUnityMCPStatus,
      updateUnityStatus,
      updateUnityConsole,
      updateUnityPanelInfo,
      renderCliStatus,
      renderMcpServers,
      renderKbEntries,
      handleCrawlProgress,
      renderEmbedderStatus,
      updateModelDownloadProgress,
      setModelDownloading,
      updateEmbeddingProgress,
      updateEmbedAllProgress,
      setEmbeddingAll,
      renderCosts,
      loadVoiceSettings,
      updateVoiceDownloadProgress,
      handleMicTestStatus,
      handleSpeakerTestStatus,
      finalizeStreamingMessage,
      addMessage,
      createMessageHtml,
      addToMessageHistory,
      appendToStreamingMessage,
      updateResponseNode: window.updateResponseNode,
      updateLiveResponseText,
      getFlowResponseTokens,
      setGenerating,
      updateTokenBar,
      stopThreadAnimation,
      stopParticleSpawning,
      stopParticleFlow,
      getChatSplitActive,
      syncChatSplitMirror,
      setFlowThinking,
      setAiStage,
      clearContextSources,
      hideLiveResponse,
      showLiveResponse,
      startAiFlow,
      spawnFlowChunk,
      addContextSourceCard,
      renderAiFlow,
      clearAiFlow,
      populateDocTargets,
      updateDocInfo,
      setShipSelectedSectorId,
      setShipSelectedSubId,
      setShipProfile,
      getShipSelectedSectorId,
      setShipAutoexecute,
      shipRender,
      shipUpdateChips,
      updateStationLabels,
      renderAsmdefInventory,
      renderAsmdefPolicyEditor,
      renderAsmdefGraph,
      renderAsmdefCheckResult,
      renderSectorMap,
      asmdefRefresh,
      setCoordinatorPill,
      updateCoordinatorSummary,
      updateCoordinatorLastIssue,
      getLastCoordinatorToast: () => lastCoordinatorToast,
      setLastCoordinatorToast: (value) => { lastCoordinatorToast = value; },
      showToast,
      renderJobList,
      renderPlanningPanel,
      setContextPreview,
      renderPlanList,
      renderPlanSummary,
      setPlanExecutionButtonsEnabled,
      updateDiffSummary,
      updatePlanComparison,
      updateTestResult,
      renderTicketList,
      renderTicketsListMain,
      renderSkillsList,
      updateDashboardMetrics,
      renderActivityList,
      updateDocsPanel,
      updateDbPanel,
      updateLogsPanel,
      updateAIReview,
      setWorkflows,
      handleWorkflowEvent,
      autoResize,
      sendMessage,
      loadGitSettings,
      loadConnectionMethods,
      showCompactionNotice,
      showPlanExecutionPanel,
      hidePlanStepGate,
      clearPlanExecutionLog,
      setPlanExecutionStatus,
      setPlanExecutionProgress,
      appendPlanExecutionLog,
      getChatSessions: () => chatSessions,
      getCurrentChatId: () => currentChatId,
      getUnityConnected,
      setUnityConnected,
      getGptFlowPending: () => _gptFlowPending,
      setGptFlowPending: (value) => { _gptFlowPending = value; },
      getTicketList: () => ticketList,
      setTicketList: (value) => { ticketList = value; },
      getPlanExecutionState,
      setPlanExecutionState,
      restoreChatState,
      handleToolbarSettings,
      mergePricing,
      updateSettings,
      handleApiKeyValue,
      handleDevExportSuccess,
      handleDevImportSuccess,
      handleDevExportError,
      handleDevImportError,
      renderUsageStats,
      vscode,
      getPlanTemplates: () => planTemplates,
      setPlanTemplates: (value) => { planTemplates = value; uiState.planTemplates = value; },
      getPlanList: () => planList,
      setPlanList: (value) => { planList = value; uiState.planList = value; },
      getCurrentPlanData: () => currentPlanData,
      setCurrentPlanData: (value) => { currentPlanData = value; uiState.currentPlan = value; },
    });

    window.addEventListener('message', event => {
      messageRouter.handleMessage(event.data);
    });
    // Voice panel functions
    document.addEventListener('DOMContentLoaded', function() {
      initKbDropZone();
      initMainSplitter();

      // Initialize to Chat tab with 50/50 split (chat + synthesis)
      window.switchTab(TABS.CHAT);

      // Initialize Context Flow visualization (side-by-side panel)
      // Small delay to ensure D3 is loaded
      setTimeout(() => {
        initContextFlowVisualization();
      }, 100);
    });

    // Request initial settings, pricing, and embedder status
    vscode.postMessage({ type: 'getSettings' });
    vscode.postMessage({ type: 'getPricing' });
    vscode.postMessage({ type: 'kbGetEmbedderStatus' });
    vscode.postMessage({ type: 'getKbEntries' });
    vscode.postMessage({ type: 'getPlanTemplates' });
    vscode.postMessage({ type: 'listPlans' });
    vscode.postMessage({ type: 'getTickets' });
