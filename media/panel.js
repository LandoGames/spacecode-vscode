/* SpaceCode Panel JavaScript - Extracted from mainPanel.ts */
/* Phase 2 of Refactoring Plan */

// These globals are injected by the webview host before this script loads
const STATION_MAP = window.__SC_STATION_MAP__;
const BUILD_ID = window.__SC_BUILD_ID__;
const vscode = window.__SC_VSCODE__;

/**
 * Tab Constants - SpaceCode Main Tabs
 * Use these instead of magic strings for tab comparisons.
 */
const TABS = {
  CHAT: 'chat',
  STATION: 'station',
  AGENTS: 'agents',
  SKILLS: 'skills',
  DASHBOARD: 'dashboard',
};

/**
 * Chat Mode Constants - Solo/Swarm modes within Chat tab
 * Note: "Get GPT Opinion" is a button in Solo mode, not a separate mode
 */
const CHAT_MODES = {
  SOLO: 'solo',        // Single AI (Claude or GPT based on model selection)
  SWARM: 'swarm',      // Multi-worker parallel execution
};

// Legacy alias for backward compatibility
const MODES = TABS;

/**
 * Centralized UI State - Phase 4 of Refactoring Plan
 * All panel state should be accessed through this object.
 * TODO: Migrate all global variables into uiState and use dispatch() for updates.
 */
const uiState = {
  // Tab state
  currentTab: 'chat',           // chat | station | agents | skills | dashboard
  chatMode: 'solo',             // solo | consult | swarm (within Chat tab)

  // Legacy mode state (for backward compatibility)
  mode: 'chat',                 // Alias for currentTab

  // Chat state (main state is in chatSessions)
  attachedImages: [],           // Array of base64 image strings

  // Context state
  contextPreview: '',
  docTargets: [],
  docTarget: '',

  // Station/Ship state
  shipProfile: 'yard',
  sector: null,
  scene: 'exterior',
  stationViewMode: 'schematic',  // 'schematic' (default) or 'photo' (legacy)

  // Plan state
  planTemplates: [],
  planList: [],
  currentPlan: null,

  // Verification state
  lastDiff: null,
  lastPlanComparison: null,
  lastAIReview: null,

  // Coordinator state
  coordinator: {
    status: 'unknown',
    lastSync: null,
  },
};

// Legacy global variables - to be migrated to uiState
let currentTab = uiState.currentTab;
let currentChatMode = uiState.chatMode;
let currentMode = uiState.mode; // Legacy alias for currentTab
// isGenerating is now per-chat in chatSessions[chatId].isGenerating
let attachedImages = uiState.attachedImages;
let currentContextPreview = uiState.contextPreview;
let docTargets = uiState.docTargets;
let docTarget = uiState.docTarget;
let shipProfile = uiState.shipProfile;
let planTemplates = uiState.planTemplates;
let planList = uiState.planList;
let currentPlanData = uiState.currentPlan;

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
      // Enable/disable Open button
      const openBtn = document.getElementById('openDocBtn');
      if (openBtn) openBtn.disabled = !docTarget;
      // Request doc info for freshness indicator
      if (docTarget) {
        vscode.postMessage({ type: 'getDocInfo', docTarget });
      } else {
        updateDocInfo(null);
      }
      // Update suggestion visibility (hide when doc selected)
      updateDocSuggestion(shipSelectedSectorId);
      vscode.postMessage({ type: 'docTargetChanged', docTarget });
    }

    function openDocTarget() {
      if (!docTarget) return;
      vscode.postMessage({ type: 'openDocTarget', docTarget });
    }

    function updateDocInfo(info) {
      const docInfoEl = document.getElementById('docInfo');
      if (!docInfoEl) return;
      if (!info) {
        docInfoEl.textContent = '';
        return;
      }
      const now = Date.now();
      const diff = now - info.lastModified;
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      let freshness = '';
      let color = 'var(--text-secondary)';
      if (days === 0) {
        freshness = 'Updated today';
        color = '#22c55e'; // green
      } else if (days <= 7) {
        freshness = 'Updated ' + days + ' day' + (days === 1 ? '' : 's') + ' ago';
        color = '#22c55e'; // green
      } else if (days <= 30) {
        freshness = 'Updated ' + days + ' days ago';
        color = '#fbbf24'; // yellow
      } else {
        freshness = 'Updated ' + days + ' days ago (stale)';
        color = '#ef4444'; // red
      }
      docInfoEl.innerHTML = '<span style="color:' + color + ';">● ' + freshness + '</span>';
    }

    function updateDocSuggestion(sector) {
      const suggEl = document.getElementById('docSuggestion');
      if (!suggEl) return;
      // Sector-specific documentation hints (sector IDs from SectorConfig.ts)
      const suggestions = {
        'yard': 'YARD sector: Experimental zone - no documentation required',
        'core': 'CORE sector: Update architecture.md before making core changes',
        'persistence': 'QUARTERS sector: Document save format changes carefully',
        'combat': 'ARMORY sector: Update combat docs for balance changes',
        'ui': 'BRIDGE-UI sector: Keep UI component docs current',
        'character': 'HANGAR sector: Document character customization options',
      };
      const hint = suggestions[sector];
      if (hint && !docTarget) {
        suggEl.textContent = '💡 ' + hint;
        suggEl.style.display = 'block';
      } else {
        suggEl.style.display = 'none';
      }
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

    function refreshPlanTemplates() {
      vscode.postMessage({ type: 'getPlanTemplates' });
    }

    function refreshPlans() {
      vscode.postMessage({ type: 'listPlans' });
    }

    function generatePlan() {
      const intentEl = document.getElementById('planIntent');
      const templateEl = document.getElementById('planTemplateSelect');
      const varsEl = document.getElementById('planTemplateVars');
      const intent = intentEl ? intentEl.value.trim() : '';
      if (!intent) {
        shipSetStatus('Plan intent is required.');
        return;
      }
      const templateId = templateEl && templateEl.value ? templateEl.value : '';
      let templateVariables = undefined;
      if (varsEl && varsEl.value.trim()) {
        try {
          templateVariables = JSON.parse(varsEl.value);
        } catch {
          shipSetStatus('Template vars must be valid JSON.');
          return;
        }
      }
      const profileSelect = document.getElementById('shipProfileSelect');
      const profileValue = profileSelect ? profileSelect.value : 'yard';
      const provider = currentMode === 'gpt' ? 'gpt' : 'claude';
      vscode.postMessage({
        type: 'generatePlan',
        intent,
        templateId: templateId || undefined,
        templateVariables,
        provider,
        profile: profileValue
      });
    }

    function saveCurrentPlan() {
      if (!currentPlanData) return;
      vscode.postMessage({ type: 'savePlan', plan: currentPlanData });
      shipSetStatus('Plan saved.');
    }

    function usePlanForComparison() {
      if (!currentPlanData || !currentPlanData.id) return;
      vscode.postMessage({ type: 'usePlanForComparison', planId: currentPlanData.id });
    }

    function executeCurrentPlan() {
      if (!currentPlanData || !currentPlanData.id) return;
      vscode.postMessage({ type: 'executePlan', planId: currentPlanData.id });
      showPlanExecutionPanel(true);
      setPlanExecutionButtonsEnabled(false);
      shipSetStatus('Executing plan...');
    }

    function executePlanStepByStep() {
      if (!currentPlanData || !currentPlanData.id) return;
      vscode.postMessage({ type: 'executePlanStepByStep', planId: currentPlanData.id });
      showPlanExecutionPanel(true);
      setPlanExecutionButtonsEnabled(false);
      shipSetStatus('Step-by-step execution started.');
    }

    function setPlanExecutionButtonsEnabled(enabled) {
      const executeBtn = document.getElementById('executePlanBtn');
      const stepBtn = document.getElementById('executePlanStepBtn');
      if (executeBtn) executeBtn.disabled = !enabled;
      if (stepBtn) stepBtn.disabled = !enabled;
    }

    function renderPlanSummary(plan) {
      const box = document.getElementById('planSummary');
      if (!box) return;
      if (!plan) {
        box.style.display = 'none';
        box.textContent = '';
        return;
      }
      const phaseItems = Array.isArray(plan.phases) ? plan.phases : [];
      const phases = phaseItems.length;
      const steps = plan.totalSteps || 0;
      const sector = plan.primarySector ? plan.primarySector.name : 'Unknown';
      const risk = plan.impact ? plan.impact.riskLevel : 'unknown';
      const header = 'Plan: ' + escapeHtml(plan.summary || plan.intent || '') +
        ' | Sector: ' + escapeHtml(sector) +
        ' | Phases: ' + phases +
        ' | Steps: ' + steps +
        ' | Risk: ' + escapeHtml(risk);

      let html = '<div>' + header + '</div>';

      if (phases > 0) {
        html += '<div class="plan-phase-list">';
        phaseItems.forEach((phase, idx) => {
          const title = phase && phase.title ? phase.title : 'Phase ' + (idx + 1);
          const desc = phase && phase.description ? phase.description : '';
          const stepItems = phase && Array.isArray(phase.steps) ? phase.steps : [];
          const stepCount = stepItems.length;
          html += '<div class="plan-phase">';
          html += '<div class="plan-phase-title">Phase ' + (idx + 1) + ': ' + escapeHtml(title) +
            ' <span class="plan-phase-count">(' + stepCount + ' step' + (stepCount === 1 ? '' : 's') + ')</span></div>';
          if (desc) {
            html += '<div class="plan-phase-desc">' + escapeHtml(desc) + '</div>';
          }
          if (stepItems.length > 0) {
            html += '<ul class="plan-steps">';
            stepItems.forEach((step) => {
              const descText = step && (step.description || step.task || step.title || step.action) ? (step.description || step.task || step.title || step.action) : '';
              const fileText = step && step.file ? step.file : '';
              html += '<li class="plan-step">' + escapeHtml(descText);
              if (fileText) {
                html += ' <span class="plan-step-file">[' + escapeHtml(fileText) + ']</span>';
              }
              html += '</li>';
            });
            html += '</ul>';
          }
          html += '</div>';
        });
        html += '</div>';
      }
      box.style.display = 'block';
      box.innerHTML = html;
    }

    function renderPlanList(plans) {
      const listEl = document.getElementById('planList');
      if (!listEl) return;
      if (!Array.isArray(plans) || plans.length === 0) {
        listEl.textContent = 'No saved plans yet.';
        return;
      }
      listEl.innerHTML = plans.map(p => `
        <div style="display:flex; justify-content:space-between; gap:6px; padding:4px 0; border-bottom:1px solid var(--border-color);">
          <span style="color:var(--text-primary);">${escapeHtml(p.summary || p.intent || p.id)}</span>
          <span style="color:var(--text-secondary); cursor:pointer;" onclick="loadPlan('${p.id}')">Open</span>
        </div>
      `).join('');
    }

    function loadPlan(planId) {
      vscode.postMessage({ type: 'loadPlan', planId });
    }

    // --- Ticket Functions ---
    let ticketList = [];
    let ticketFormVisible = false;

    function toggleTicketForm() {
      ticketFormVisible = !ticketFormVisible;
      const form = document.getElementById('ticketForm');
      if (form) {
        form.style.display = ticketFormVisible ? 'block' : 'none';
        if (ticketFormVisible) {
          // Populate plan dropdown with existing plans
          const planSelect = document.getElementById('ticketPlanLink');
          if (planSelect && Array.isArray(planList)) {
            planSelect.innerHTML = '<option value="">(no plan)</option>' +
              planList.map(p => '<option value="' + p.id + '">' + escapeHtml(p.summary || p.intent || p.id) + '</option>').join('');
          }
        }
      }
    }

    function createTicket() {
      const titleEl = document.getElementById('ticketTitle');
      const descEl = document.getElementById('ticketDescription');
      const sectorEl = document.getElementById('ticketSector');
      const planEl = document.getElementById('ticketPlanLink');

      const title = titleEl ? titleEl.value.trim() : '';
      if (!title) {
        shipSetStatus('Ticket title is required.');
        return;
      }

      vscode.postMessage({
        type: 'createTicket',
        title: title,
        description: descEl ? descEl.value.trim() : '',
        sectorId: sectorEl ? sectorEl.value : 'general',
        linkedPlanId: planEl && planEl.value ? planEl.value : undefined
      });

      // Clear form
      if (titleEl) titleEl.value = '';
      if (descEl) descEl.value = '';
      toggleTicketForm();
      shipSetStatus('Ticket created.');
    }

    function refreshTickets() {
      vscode.postMessage({ type: 'getTickets' });
    }

    function updateTicketStatus(ticketId, newStatus) {
      vscode.postMessage({ type: 'updateTicketStatus', ticketId, status: newStatus });
    }

    function deleteTicket(ticketId) {
      if (confirm('Delete this ticket?')) {
        vscode.postMessage({ type: 'deleteTicket', ticketId });
      }
    }

    function renderTicketList(tickets) {
      const listEl = document.getElementById('ticketList');
      if (!listEl) return;
      if (!Array.isArray(tickets) || tickets.length === 0) {
        listEl.innerHTML = '<span style="color:var(--text-secondary);">No tickets yet. Click "+ New" to create one.</span>';
        return;
      }

      const statusColors = { 'open': '#3b82f6', 'in-progress': '#f59e0b', 'done': '#22c55e' };
      const statusLabels = { 'open': 'Open', 'in-progress': 'In Progress', 'done': 'Done' };

      listEl.innerHTML = tickets.map(t => {
        const statusColor = statusColors[t.status] || '#6b7280';
        const statusLabel = statusLabels[t.status] || t.status;
        const nextStatus = t.status === 'open' ? 'in-progress' : (t.status === 'in-progress' ? 'done' : null);
        const planInfo = t.linkedPlanId ? ' [plan]' : '';
        const descSnippet = t.description ? escapeHtml(t.description).substring(0, 80) + (t.description.length > 80 ? '...' : '') : '';
        const nextLabel = nextStatus ? statusLabels[nextStatus] : '';

        let html = '<div style="display:flex; flex-direction:column; gap:4px; padding:6px; margin-bottom:4px; border:1px solid var(--border-color); border-radius:4px; background:var(--bg-secondary);">';
        html += '<div style="display:flex; justify-content:space-between; align-items:center;">';
        html += '<span style="font-weight:500;">' + escapeHtml(t.title) + planInfo + '</span>';
        html += '<span style="padding:2px 6px; border-radius:4px; font-size:9px; background:' + statusColor + '22; color:' + statusColor + '; border:1px solid ' + statusColor + '44;">' + statusLabel + '</span>';
        html += '</div>';
        if (descSnippet) {
          html += '<div style="font-size:9px; color:var(--text-secondary);">' + descSnippet + '</div>';
        }
        html += '<div style="display:flex; gap:4px; justify-content:flex-end;">';
        if (nextStatus) {
          html += '<button data-ticket-id="' + t.id + '" data-next-status="' + nextStatus + '" class="ticket-status-btn" style="font-size:9px; padding:2px 6px; border-radius:4px; background:var(--bg-tertiary); border:1px solid var(--border-color); color:var(--text-secondary); cursor:pointer;">&gt; ' + nextLabel + '</button>';
        }
        html += '<button data-ticket-delete="' + t.id + '" class="ticket-delete-btn" style="font-size:9px; padding:2px 6px; border-radius:4px; background:var(--bg-tertiary); border:1px solid var(--border-color); color:var(--error-text); cursor:pointer;">x</button>';
        html += '</div></div>';
        return html;
      }).join('');

      // Attach event listeners using delegation
      listEl.querySelectorAll('.ticket-status-btn').forEach(btn => {
        btn.onclick = function() {
          updateTicketStatus(this.dataset.ticketId, this.dataset.nextStatus);
        };
      });
      listEl.querySelectorAll('.ticket-delete-btn').forEach(btn => {
        btn.onclick = function() {
          deleteTicket(this.dataset.ticketDelete);
        };
      });
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

    function switchControlTab(tab) {
      const infoBtn = document.getElementById('controlTabBtnInfo');
      const opsBtn = document.getElementById('controlTabBtnOps');
      const unityBtn = document.getElementById('controlTabBtnUnity');
      const infoPanel = document.getElementById('controlTabInfo');
      const opsPanel = document.getElementById('controlTabOps');
      const unityPanel = document.getElementById('controlTabUnity');
      if (!infoBtn || !opsBtn || !unityBtn || !infoPanel || !opsPanel || !unityPanel) return;

      // Reset all
      infoBtn.classList.remove('active');
      opsBtn.classList.remove('active');
      unityBtn.classList.remove('active');
      infoPanel.style.display = 'none';
      opsPanel.style.display = 'none';
      unityPanel.style.display = 'none';

      // Activate selected
      if (tab === 'info' || tab === 'coordinator') {
        // 'coordinator' tab removed - redirect to info
        infoBtn.classList.add('active');
        infoPanel.style.display = 'block';
      } else if (tab === 'ops') {
        opsBtn.classList.add('active');
        opsPanel.style.display = 'block';
      } else if (tab === 'unity') {
        unityBtn.classList.add('active');
        unityPanel.style.display = 'block';
        // Auto-check Unity connection status when switching to tab (NOT reload)
        unityCheckConnection();
      }
      localStorage.setItem('spacecode.controlTab', tab);
    }

    function setRightPanelMode(mode) {
      const pane = document.getElementById('rightPane');
      if (!pane) return;
      pane.dataset.panelMode = mode;

      // Update all toggle buttons
      const buttons = {
        station: document.getElementById('panelModeStation'),
        control: document.getElementById('panelModeControl'),
        flow: document.getElementById('panelModeFlow'),
        opinion: document.getElementById('panelModeOpinion'),
        chat: document.getElementById('panelModeChat')
      };

      for (const [btnMode, btn] of Object.entries(buttons)) {
        if (btn) btn.classList.toggle('active', mode === btnMode);
      }

      localStorage.setItem('spacecode.panelMode', mode);
    }
    window.setRightPanelMode = setRightPanelMode;

    // Side chat state
    let activeSideChatIndex = 0;
    const sideChats = [
      { messages: [], id: 'sideChat1' },
      { messages: [], id: 'sideChat2' }
    ];

    // Switch between side chat instances
    function switchSideChat(index) {
      activeSideChatIndex = index;

      // Update tab buttons
      const tabs = document.querySelectorAll('.side-chat-tab');
      tabs.forEach((tab, i) => {
        tab.classList.toggle('active', i === index);
      });

      // Render the selected chat's messages
      renderSideChatMessages();
    }
    window.switchSideChat = switchSideChat;

    // Render side chat messages
    function renderSideChatMessages() {
      const container = document.getElementById('sideChatMessages');
      if (!container) return;

      const chat = sideChats[activeSideChatIndex];
      if (!chat || chat.messages.length === 0) {
        container.innerHTML = '<div class="side-chat-empty">Start a new conversation for unrelated questions.</div>';
        return;
      }

      container.innerHTML = chat.messages.map(msg => `
        <div class="side-chat-message ${msg.role}">
          <div class="side-chat-avatar">${msg.role === 'user' ? 'U' : 'A'}</div>
          <div class="side-chat-content">${formatMessageContent(msg.content)}</div>
        </div>
      `).join('');

      container.scrollTop = container.scrollHeight;
    }

    // Send a message in the side chat
    function sendSideChat() {
      const input = document.getElementById('sideChatInput');
      if (!input || !input.value.trim()) return;

      const message = input.value.trim();
      input.value = '';

      // Add user message
      sideChats[activeSideChatIndex].messages.push({
        role: 'user',
        content: message
      });
      renderSideChatMessages();

      // Send to backend
      vscode.postMessage({
        type: 'sideChatMessage',
        chatIndex: activeSideChatIndex,
        message: message
      });
    }
    window.sendSideChat = sendSideChat;

    // Handle side chat response from backend
    function handleSideChatResponse(chatIndex, response) {
      if (chatIndex >= 0 && chatIndex < sideChats.length) {
        sideChats[chatIndex].messages.push({
          role: 'assistant',
          content: response
        });
        if (chatIndex === activeSideChatIndex) {
          renderSideChatMessages();
        }
      }
    }

    // Toggle the Context Flow panel (right pane) visibility (closes Swarm sidebar)
    function toggleContextFlowPanel() {
      const rightPane = document.getElementById('rightPane');
      const splitter = document.getElementById('mainSplitter');
      const contextFlowPanel = document.getElementById('contextFlowPanel');
      const sidebar = document.getElementById('swarmSidebar');
      if (!rightPane) return;

      const isHidden = rightPane.style.display === 'none';
      rightPane.style.display = isHidden ? 'flex' : 'none';
      if (splitter) splitter.style.display = isHidden ? 'flex' : 'none';

      // Set to flow mode when showing
      if (isHidden) {
        rightPane.dataset.panelMode = 'flow';
      }

      // Close swarm sidebar when opening context flow
      if (isHidden && sidebar) {
        sidebar.style.display = 'none';
      }
    }
    window.toggleContextFlowPanel = toggleContextFlowPanel;

    // Toggle the Swarm Workers sidebar visibility (closes Context Flow)
    function toggleSwarmSidebar() {
      const sidebar = document.getElementById('swarmSidebar');
      const rightPane = document.getElementById('rightPane');
      const splitter = document.getElementById('mainSplitter');
      if (!sidebar) return;

      const isHidden = sidebar.style.display === 'none';
      sidebar.style.display = isHidden ? 'flex' : 'none';

      // Close context flow (right pane) when opening swarm sidebar
      if (isHidden && rightPane) {
        rightPane.style.display = 'none';
        if (splitter) splitter.style.display = 'none';
      }
    }
    window.toggleSwarmSidebar = toggleSwarmSidebar;

    // Legacy alias for backwards compatibility
    function toggleContextFlowDrawer() {
      toggleContextFlowPanel();
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
        entry.innerHTML = `<strong>${job.action}</strong>
          <div>Sector: ${job.sector}</div>
          <div>Doc: ${job.docTarget || '(none)'}</div>
          <div style="font-size:10px; color:var(--text-secondary);">status: ${job.status}</div>`;
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

    function renderAsmdefInventory(inventory) {
      const summaryEl = document.getElementById('asmdefSummary');
      const listEl = document.getElementById('asmdefList');
      const badgeEl = document.getElementById('asmdefPolicyModeBadge');
      if (!summaryEl || !listEl) return;

      if (!inventory || !Array.isArray(inventory.asmdefs)) {
        summaryEl.textContent = 'Asmdef inventory unavailable.';
        listEl.innerHTML = '';
        return;
      }

      const count = inventory.asmdefs.length;
      const policyMode = inventory.policy?.mode || 'none';
      const policyEntries = inventory.policy?.entries ? Object.keys(inventory.policy.entries).length : 0;
      const policyPath = inventory.policyPath ? ('\\nPolicy: ' + inventory.policyPath) : '';
      const warnCount = Array.isArray(inventory.warnings) ? inventory.warnings.length : 0;

      summaryEl.textContent =
        'Asmdefs: ' + count +
        '\\nPolicy: ' + policyMode + (policyEntries ? ' (' + policyEntries + ' entries)' : '') +
        policyPath +
        (warnCount ? ('\\nWarnings: ' + warnCount) : '');
      if (badgeEl) {
        badgeEl.textContent = 'Policy: ' + policyMode;
        badgeEl.classList.toggle('ok', policyMode === 'strict');
        badgeEl.classList.toggle('muted', policyMode === 'none');
      }

      listEl.innerHTML = '';
      inventory.asmdefs.forEach((a) => {
        const item = document.createElement('div');
        item.className = 'asmdef-item';
        const refs = Array.isArray(a.references) && a.references.length
          ? a.references.join(', ')
          : '(none)';
        item.innerHTML = `
          <div class="asmdef-item-header">
            <span>${escapeHtml(a.name || '(unnamed)')}</span>
            <span style="color: var(--text-secondary);">${escapeHtml(a.sector?.id || 'unknown')}</span>
          </div>
          <div class="asmdef-item-refs">Refs: ${escapeHtml(refs)}</div>
          <div style="font-size:10px; color: var(--text-secondary);">${escapeHtml(a.path || '')}</div>
        `;
        listEl.appendChild(item);
      });
    }

    function renderAsmdefPolicyEditor(payload) {
      const editor = document.getElementById('asmdefPolicyEditor');
      const textEl = document.getElementById('asmdefPolicyText');
      const pathEl = document.getElementById('asmdefPolicyPath');
      if (!editor || !textEl) return;
      editor.style.display = 'block';
      textEl.value = payload?.policyText || '';
      if (pathEl) pathEl.textContent = payload?.policyPath ? payload.policyPath : '(no policy)';
    }

    function renderAsmdefGraph(graph) {
      const summaryEl = document.getElementById('asmdefGraphSummary');
      const listEl = document.getElementById('asmdefGraphList');
      const canvasEl = document.getElementById('asmdefGraphCanvas');
      if (!summaryEl || !listEl || !canvasEl) return;
      if (!graph || !Array.isArray(graph.nodes)) {
        summaryEl.style.display = 'none';
        listEl.style.display = 'none';
        canvasEl.style.display = 'none';
        canvasEl.innerHTML = '';
        return;
      }
      const nodes = graph.nodes.length;
      const edges = Array.isArray(graph.edges) ? graph.edges.length : 0;
      const unresolved = Array.isArray(graph.unresolved) ? graph.unresolved.length : 0;
      summaryEl.textContent =
        'Graph: ' +
        nodes +
        ' nodes, ' +
        edges +
        ' edges' +
        (unresolved ? ', ' + unresolved + ' unresolved' : '') +
        '.';
      summaryEl.style.display = 'block';
      listEl.style.display = 'block';
      canvasEl.style.display = 'block';
      listEl.innerHTML = '';
      const maxEdges = 200;
      (graph.edges || []).slice(0, maxEdges).forEach((e) => {
        const item = document.createElement('div');
        item.className = 'asmdef-item';
        item.innerHTML =
          '<div class="asmdef-item-header">' +
          '<span>' +
          escapeHtml(e.from) +
          '</span>' +
          '<span style="opacity:0.6;">→</span>' +
          '<span>' +
          escapeHtml(e.to) +
          '</span>' +
          '</div>';
        listEl.appendChild(item);
      });
      if (unresolved) {
        const warn = document.createElement('div');
        warn.className = 'asmdef-item';
        warn.innerHTML =
          '<div class="asmdef-item-refs">Unresolved refs:\\n' +
          escapeHtml((graph.unresolved || []).join('\\n')) +
          '</div>';
        listEl.appendChild(warn);
      }

      renderAsmdefGraphCanvas(graph, canvasEl);
    }

    function renderAsmdefCheckResult(result) {
      const listEl = document.getElementById('asmdefViolations');
      if (!listEl) return;
      if (!result) {
        listEl.style.display = 'none';
        listEl.innerHTML = '';
        return;
      }
      listEl.style.display = 'block';
      listEl.innerHTML = '';

      const suggestions = [];
      if (Array.isArray(result.violations)) {
        result.violations.forEach(v => {
          if (v && v.suggestion) suggestions.push(v.suggestion);
        });
      }

      const summary = document.createElement('div');
      summary.className = 'asmdef-item';
      summary.innerHTML = '<div class="asmdef-item-header">' +
        '<span>Validation</span>' +
        '<span class="asmdef-badge ' + (result.passed ? 'ok' : 'fail') + '">' + (result.passed ? 'PASS' : 'FAIL') + '</span>' +
        '</div>' +
        '<div class="asmdef-item-refs">' + escapeHtml(result.summary || '') + '</div>' +
        (suggestions.length
          ? '<div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap;">' +
              '<button class="btn-secondary" onclick="copyAsmdefFixes()" style="padding:4px 10px;">Copy Fixes</button>' +
            '</div>'
          : '');
      listEl.appendChild(summary);

      if (Array.isArray(result.violations)) {
        result.violations.forEach(v => {
          const item = document.createElement('div');
          item.className = 'asmdef-item';
          item.innerHTML = '<div class="asmdef-item-header"><span>' +
            escapeHtml(v.asmdefName || '(unknown)') + '</span><span style="color:#f87171;">' +
            escapeHtml(v.reference || '') + '</span></div>' +
            '<div class="asmdef-item-refs">' + escapeHtml(v.message || '') + '</div>' +
            (v.suggestion ? '<div class="asmdef-item-refs" style="color:#a7f3d0;">Suggest: ' + escapeHtml(v.suggestion) + '</div>' : '') +
            '<div style="font-size:10px; color:var(--text-secondary);">' + escapeHtml(v.asmdefPath || '') + '</div>';
          listEl.appendChild(item);
        });
      }

      if (Array.isArray(result.warnings) && result.warnings.length) {
        const warn = document.createElement('details');
        warn.className = 'asmdef-item asmdef-warnings';
        warn.innerHTML = '<summary>Warnings (' + result.warnings.length + ')</summary>' +
          '<div class="asmdef-item-refs">' + escapeHtml(result.warnings.join('\\n')) + '</div>';
        listEl.appendChild(warn);
      }
    }

    function formatRelativeTime(ts) {
      if (!ts) return 'never';
      const delta = Math.max(0, Date.now() - ts);
      const sec = Math.floor(delta / 1000);
      if (sec < 60) return sec + 's ago';
      const min = Math.floor(sec / 60);
      if (min < 60) return min + 'm ago';
      const hr = Math.floor(min / 60);
      if (hr < 24) return hr + 'h ago';
      const days = Math.floor(hr / 24);
      return days + 'd ago';
    }

    function renderAsmdefGraphCanvas(graph, canvasEl) {
      const nodeItems = Array.isArray(graph.nodes) ? graph.nodes : [];
      const nodes = nodeItems.map(n => n.id);
      const edges = Array.isArray(graph.edges) ? graph.edges : [];
      if (nodes.length === 0) {
        canvasEl.innerHTML = '';
        return;
      }

      const layout = computeAsmdefLayout(nodeItems, edges);
      const width = layout.width;
      const height = layout.height;

      canvasEl.innerHTML = '';
      canvasEl.style.minHeight = height + 'px';

      const inner = document.createElement('div');
      inner.className = 'asmdef-graph-inner';
      inner.style.width = width + 'px';
      inner.style.height = height + 'px';

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', String(width));
      svg.setAttribute('height', String(height));
      svg.classList.add('asmdef-graph-svg');

      edges.forEach(e => {
        const from = layout.pos[e.from];
        const to = layout.pos[e.to];
        if (!from || !to) return;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const startX = from.x + from.w;
        const startY = from.y + from.h / 2;
        const endX = to.x;
        const endY = to.y + to.h / 2;
        const midX = (startX + endX) / 2;
        const d = 'M ' + startX + ' ' + startY + ' C ' + midX + ' ' + startY + ', ' + midX + ' ' + endY + ', ' + endX + ' ' + endY;
        line.setAttribute('d', d);
        line.setAttribute('stroke', 'rgba(59,130,246,0.6)');
        line.setAttribute('stroke-width', '1.5');
        line.setAttribute('fill', 'none');
        line.classList.add('asmdef-edge');
        line.setAttribute('data-from', e.from);
        line.setAttribute('data-to', e.to);
        svg.appendChild(line);
      });

      inner.appendChild(svg);

      const sectorById = new Map();
      const pathById = new Map();
      nodeItems.forEach(n => {
        if (n && n.id) sectorById.set(n.id, n.sector || 'unknown');
        if (n && n.id) pathById.set(n.id, n.path || '');
      });

      nodes.forEach(id => {
        const pos = layout.pos[id];
        if (!pos) return;
        const nodeEl = document.createElement('div');
        nodeEl.className = 'asmdef-node';
        nodeEl.style.left = pos.x + 'px';
        nodeEl.style.top = pos.y + 'px';
        nodeEl.style.width = pos.w + 'px';
        const sectorLabel = sectorById.get(id) || 'unknown';
        nodeEl.innerHTML = escapeHtml(id) + '<small>' + escapeHtml(sectorLabel) + '</small>';
        nodeEl.dataset.id = id;
        const p = pathById.get(id);
        if (p) nodeEl.dataset.path = p;
        nodeEl.addEventListener('click', (ev) => {
          selectAsmdefNode(canvasEl, id);
          if (ev.detail >= 2 && nodeEl.dataset.path) {
            vscode.postMessage({ type: 'asmdefOpen', path: nodeEl.dataset.path });
          }
        });
        inner.appendChild(nodeEl);
      });

      canvasEl.appendChild(inner);
      initAsmdefGraphInteractions(canvasEl);
    }

    function selectAsmdefNode(canvasEl, id) {
      const nodes = canvasEl.querySelectorAll('.asmdef-node');
      nodes.forEach(n => {
        const match = n.dataset.id === id;
        n.classList.toggle('selected', match);
      });
      const edges = canvasEl.querySelectorAll('.asmdef-edge');
      edges.forEach(e => {
        const from = e.getAttribute('data-from');
        const to = e.getAttribute('data-to');
        const highlight = id && (from === id || to === id);
        e.classList.toggle('highlight', !!highlight);
      });
    }

    function initAsmdefGraphInteractions(canvasEl) {
      if (canvasEl.dataset.inited === '1') return;
      canvasEl.dataset.inited = '1';
      const state = {
        scale: 1,
        x: 0,
        y: 0,
        dragging: false,
        dragStartX: 0,
        dragStartY: 0
      };
      canvasEl._graphState = state;

      const getInner = () => canvasEl.querySelector('.asmdef-graph-inner');
      const applyTransform = () => {
        const inner = getInner();
        if (!inner) return;
        inner.style.transform = 'translate(' + state.x + 'px, ' + state.y + 'px) scale(' + state.scale + ')';
      };

      canvasEl.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = Math.sign(e.deltaY) * -0.1;
        const next = Math.min(2.0, Math.max(0.4, state.scale + delta));
        if (next === state.scale) return;
        state.scale = next;
        applyTransform();
      }, { passive: false });

      canvasEl.addEventListener('mousedown', (e) => {
        const target = e.target;
        if (target && target.closest && target.closest('.asmdef-node')) return;
        state.dragging = true;
        state.dragStartX = e.clientX - state.x;
        state.dragStartY = e.clientY - state.y;
        canvasEl.classList.add('dragging');
      });

      window.addEventListener('mousemove', (e) => {
        if (!state.dragging) return;
        state.x = e.clientX - state.dragStartX;
        state.y = e.clientY - state.dragStartY;
        applyTransform();
      });

      window.addEventListener('mouseup', () => {
        if (!state.dragging) return;
        state.dragging = false;
        canvasEl.classList.remove('dragging');
      });

      applyTransform();
    }

    function computeAsmdefLayout(nodeItems, edges) {
      const nodes = nodeItems.map(n => n.id);
      const sectorById = new Map();
      nodeItems.forEach(n => {
        if (!n || !n.id) return;
        sectorById.set(n.id, n.sector || 'unknown');
      });

      const sectorOrder = Array.from(new Set(nodeItems.map(n => n.sector || 'unknown')))
        .sort((a, b) => String(a).localeCompare(String(b)));

      const groups = new Map();
      sectorOrder.forEach(s => groups.set(s, []));
      nodes
        .slice()
        .sort((a, b) => a.localeCompare(b))
        .forEach(id => {
          const s = sectorById.get(id) || 'unknown';
          if (!groups.has(s)) groups.set(s, []);
          groups.get(s).push(id);
        });

      const colGap = 220;
      const rowGap = 70;
      const margin = 20;
      const nodeW = 160;
      const nodeH = 36;
      const maxRows = Math.max(1, ...Array.from(groups.values()).map(arr => arr.length));

      const width = margin * 2 + nodeW + ((groups.size - 1) * colGap);
      const height = margin * 2 + nodeH + ((maxRows - 1) * rowGap);

      const pos = {};
      let col = 0;
      groups.forEach((arr) => {
        arr.forEach((id, idx) => {
          pos[id] = {
            x: margin + col * colGap,
            y: margin + idx * rowGap,
            w: nodeW,
            h: nodeH
          };
        });
        col += 1;
      });

      return { pos, width, height };
    }

    function updateStationLabels() {
      document.getElementById('stationSectorLabel').textContent = shipSelectedSectorId || 'Unknown';
      document.getElementById('stationProfileLabel').textContent = shipProfile || 'yard';
    }

    function requestJobList() {
      vscode.postMessage({ type: 'autoexecuteList' });
    }

    function clearAllJobs() {
      vscode.postMessage({ type: 'autoexecuteClearAll' });
    }

    // --- Unity MCP Monitor ---
    let unityConnected = false;
    let unityConsoleFilters = { error: true, warn: true, log: true };
    let unityConsoleMessages = [];
    let unityCommandLoading = false;
    let unityStatusToken = 0;  // Request token to prevent race conditions
    let unityStatusDebounceTimer = null;  // Debounce timer for status checks
    let unityLastStatusUpdate = 0;  // Timestamp of last status update
    let unityStatusCheckInFlight = false;  // Mutex: is a status check currently running?

    // UNIFIED status check - ALL status checks go through here
    // This prevents multiple overlapping MCP calls
    function unityCheckConnection(fromButton = false) {
      // If a check is already in flight, skip
      if (unityStatusCheckInFlight) {
        console.log('[SpaceCode UI] Status check already in flight, skipping');
        if (fromButton) {
          shipSetStatus('Status check already in progress...');
        }
        return;
      }

      // Clear any pending debounce
      if (unityStatusDebounceTimer) {
        clearTimeout(unityStatusDebounceTimer);
      }

      // Debounce: wait 300ms to coalesce rapid calls (startup, tab switch, etc.)
      const debounceMs = fromButton ? 0 : 300;  // No debounce for explicit button clicks
      unityStatusDebounceTimer = setTimeout(() => {
        // Double-check we're not already in flight
        if (unityStatusCheckInFlight) {
          console.log('[SpaceCode UI] Status check already in flight after debounce, skipping');
          return;
        }

        unityStatusCheckInFlight = true;
        unityStatusToken++;
        const token = unityStatusToken;
        console.log('[SpaceCode UI] Starting status check, token:', token);

        // Update UI to show checking
        const statusEl = document.getElementById('unityStatus');
        if (statusEl) {
          statusEl.className = 'unity-status checking';
          statusEl.textContent = '● Checking...';
        }
        setUnityButtonsLoading(true);

        // Show immediate feedback
        shipSetStatus('⏳ Checking Unity connection... (request sent)');

        vscode.postMessage({ type: 'unityCheckConnection', token: token });

        // Auto-timeout after 15s to clear in-flight flag
        setTimeout(() => {
          if (unityStatusCheckInFlight && unityStatusToken === token) {
            console.log('[SpaceCode UI] Status check timed out, clearing in-flight flag');
            unityStatusCheckInFlight = false;
            setUnityButtonsLoading(false);
          }
        }, 15000);
      }, debounceMs);
    }

    // Unity command messages - sent to chat for Claude to execute via Coplay MCP
    const unityCommands = {
      status: 'Check Unity MCP connection status and tell me the project name and current scene.',
      reload: 'Reload Unity assets and apply any code changes. Use the execute_script tool to call AssetDatabase.Refresh().',
      play: 'Start playing the game in Unity Editor.',
      stop: 'Stop playing the game in Unity Editor.',
      logs: 'Get the last 20 Unity console logs (errors and warnings).',
      errors: 'Check if there are any compile errors in the Unity project.'
    };

    // Friendly labels for immediate feedback
    const unityCommandLabels = {
      status: 'Checking connection',
      reload: 'Reloading assets',
      play: 'Starting play mode',
      stop: 'Stopping play mode',
      logs: 'Fetching logs',
      errors: 'Checking errors'
    };

    // Enable/disable Unity command buttons
    function setUnityButtonsLoading(loading) {
      unityCommandLoading = loading;
      const buttons = document.querySelectorAll('.unity-cmd-btn');
      buttons.forEach(btn => {
        btn.disabled = loading;
        btn.style.opacity = loading ? '0.5' : '1';
        btn.style.cursor = loading ? 'wait' : 'pointer';
      });
    }

    // Send a Unity command via chat message to Claude
    function unitySendCommand(cmd) {
      const message = unityCommands[cmd];
      if (!message) return;

      // SPECIAL CASE: 'status' command uses the unified status check
      // This prevents duplicate MCP calls when status is triggered from multiple sources
      if (cmd === 'status') {
        unityCheckConnection(true);  // true = from button click
        return;
      }

      // Prevent double-clicks while loading
      if (unityCommandLoading) {
        shipSetStatus('Please wait, command in progress...');
        return;
      }

      // Set loading state
      setUnityButtonsLoading(true);

      // Get friendly label for this command
      const label = unityCommandLabels[cmd] || cmd;

      // Update UI to show pending with specific action
      const statusEl = document.getElementById('unityStatus');
      if (statusEl) {
        statusEl.className = 'unity-status checking';
        statusEl.textContent = '● ' + label + '...';
      }

      // Show immediate feedback in status bar
      shipSetStatus('⏳ ' + label + '... (request sent)');

      // Send as a chat message
      vscode.postMessage({
        type: 'unityCommand',
        command: cmd,
        message: message
      });

      // Auto-timeout after 30s to prevent stuck state
      setTimeout(() => {
        if (unityCommandLoading) {
          setUnityButtonsLoading(false);
          const statusEl = document.getElementById('unityStatus');
          if (statusEl && statusEl.textContent === '● Loading...') {
            statusEl.className = 'unity-status disconnected';
            statusEl.textContent = '● Timeout';
          }
          shipSetStatus('Command timed out');
        }
      }, 30000);
    }

    // Legacy: Send reload command to Unity (for backwards compatibility)
    function unityRefresh() {
      unitySendCommand('reload');
    }

    // Header button click: Check status if unknown, Reload if connected
    function unityHeaderClick() {
      if (unityConnected) {
        // Already connected - reload Unity
        unitySendCommand('reload');
      } else {
        // Not connected or unknown - check status
        unitySendCommand('status');
      }
    }

    // Update Unity panel with status info from Claude's response
    function updateUnityPanelInfo(info) {
      if (info.project) {
        const el = document.getElementById('unityProjectName');
        if (el) el.textContent = info.project;
      }
      if (info.scene) {
        const el = document.getElementById('unitySceneName');
        if (el) el.textContent = info.scene;
      }
      const lastCheck = document.getElementById('unityLastCheck');
      if (lastCheck) {
        lastCheck.textContent = new Date().toLocaleTimeString();
      }
      // Update connection status
      if (info.connected !== undefined) {
        unityConnected = info.connected;
        const statusEl = document.getElementById('unityStatus');
        if (statusEl) {
          if (info.connected) {
            statusEl.className = 'unity-status connected';
            statusEl.textContent = '● Connected';
          } else {
            statusEl.className = 'unity-status disconnected';
            statusEl.textContent = '● Disconnected';
          }
        }
        // Also update header
        updateUnityMCPStatus(info.connected);
      }
    }

    function toggleConsoleFilter(filter) {
      unityConsoleFilters[filter] = !unityConsoleFilters[filter];
      const btn = document.querySelector('.console-filter[data-filter="' + filter + '"]');
      if (btn) btn.classList.toggle('active', unityConsoleFilters[filter]);
      renderUnityConsole();
    }

    function renderUnityConsole() {
      const log = document.getElementById('unityConsoleLog');
      if (!log) return;
      const filtered = unityConsoleMessages.filter(m => {
        if (m.type === 'Error' && unityConsoleFilters.error) return true;
        if (m.type === 'Warning' && unityConsoleFilters.warn) return true;
        if (m.type === 'Log' && unityConsoleFilters.log) return true;
        return false;
      });
      if (filtered.length === 0) {
        log.textContent = '(no messages matching filters)';
        return;
      }
      log.innerHTML = filtered.slice(-30).map(m => {
        const icon = m.type === 'Error' ? '🔴' : m.type === 'Warning' ? '🟡' : '⚪';
        return '<div style="margin-bottom:2px;">' + icon + ' ' + escapeHtml(m.message.substring(0, 200)) + '</div>';
      }).join('');
      log.scrollTop = log.scrollHeight;
    }

    function updateUnityStatus(status, token) {
      const now = Date.now();
      const statusEl = document.getElementById('unityStatus');
      const sceneInfo = document.getElementById('unitySceneInfo');

      // Clear the in-flight flag - we got a response
      unityStatusCheckInFlight = false;
      console.log('[SpaceCode UI] Status update received, token:', token, 'connected:', status.connected);

      // Token-based race condition prevention:
      // Only accept updates from the most recent request (or if no token provided)
      if (token !== undefined && token < unityStatusToken) {
        console.log('[SpaceCode UI] Ignoring stale status update, token:', token, 'current:', unityStatusToken);
        return;
      }

      // Prevent "disconnected" from overriding "connected" within 2 seconds
      // This handles race conditions where a stale disconnected arrives after connected
      if (!status.connected && unityConnected && (now - unityLastStatusUpdate) < 2000) {
        console.log('[SpaceCode UI] Ignoring disconnected status within 2s of connected');
        return;
      }

      unityLastStatusUpdate = now;
      unityConnected = status.connected;

      if (!status.connected) {
        if (statusEl) {
          statusEl.className = 'unity-status disconnected';
          statusEl.textContent = '● Disconnected';
        }
        if (sceneInfo) sceneInfo.textContent = 'Scene: (not connected)';
        return;
      }

      if (statusEl) {
        if (status.isPlaying) {
          statusEl.className = 'unity-status playing';
          statusEl.textContent = '● Playing';
        } else if (status.isCompiling) {
          statusEl.className = 'unity-status connected';
          statusEl.textContent = '● Compiling...';
        } else {
          statusEl.className = 'unity-status connected';
          statusEl.textContent = '● Connected';
        }
      }

      if (sceneInfo) {
        sceneInfo.textContent = 'Scene: ' + (status.sceneName || '(unknown)');
      }
    }

    function updateUnityConsole(messages) {
      unityConsoleMessages = messages || [];
      renderUnityConsole();
    }

    function clearUnityConsole() {
      unityConsoleMessages = [];
      const log = document.getElementById('unityConsoleLog');
      if (log) {
        log.textContent = '(console cleared)';
      }
      shipSetStatus('Console cleared');
    }

    // --- Verification Panel ---
    let lastDiffResult = null;
    let lastPlanComparison = null;
    let lastAIReview = null;
    let planExecutionState = {
      planId: null,
      totalSteps: 0,
      completedSteps: 0,
      failedSteps: 0,
    };
    let planExecutionLogLines = [];
    let pendingPlanStep = null;

    function scanDiff() {
      vscode.postMessage({ type: 'scanDiff' });
      shipSetStatus('Scanning git diff...');
      document.getElementById('verificationEmpty').style.display = 'none';
    }

    // --- Test Runner ---
    let testRunning = false;

    function runTests() {
      if (testRunning) {
        shipSetStatus('Tests already running...');
        return;
      }
      testRunning = true;
      const btn = document.getElementById('runTestsBtn');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Running...';
      }

      const resultPanel = document.getElementById('testResult');
      const statusEl = document.getElementById('testResultStatus');
      const contentEl = document.getElementById('testResultContent');

      if (resultPanel) resultPanel.style.display = 'block';
      if (statusEl) {
        statusEl.textContent = 'running';
        statusEl.style.color = '#f59e0b';
      }
      if (contentEl) contentEl.textContent = 'Running tests...';

      document.getElementById('verificationEmpty').style.display = 'none';
      vscode.postMessage({ type: 'runTests' });
      shipSetStatus('Running regression tests...');
    }

    function updateTestResult(result) {
      testRunning = false;
      const btn = document.getElementById('runTestsBtn');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Run Tests';
      }

      const resultPanel = document.getElementById('testResult');
      const statusEl = document.getElementById('testResultStatus');
      const contentEl = document.getElementById('testResultContent');

      if (resultPanel) resultPanel.style.display = 'block';

      if (result.success) {
        if (statusEl) {
          statusEl.textContent = 'pass';
          statusEl.style.color = '#22c55e';
        }
        shipSetStatus('Tests passed.');
      } else {
        if (statusEl) {
          statusEl.textContent = 'fail';
          statusEl.style.color = '#ef4444';
        }
        shipSetStatus('Tests failed.');
      }

      if (contentEl) {
        const output = result.output || '(no output)';
        contentEl.textContent = output.length > 2000 ? output.substring(0, 2000) + '\\n...truncated' : output;
      }
    }

    function updateDiffSummary(diff) {
      lastDiffResult = diff;
      const summary = document.getElementById('diffSummary');
      const stats = document.getElementById('diffStats');
      const fileList = document.getElementById('diffFileList');
      const aiBtn = document.getElementById('aiReviewBtn');
      const empty = document.getElementById('verificationEmpty');

      if (!diff || !diff.files || diff.files.length === 0) {
        summary.style.display = 'none';
        empty.style.display = 'block';
        empty.textContent = 'No changes detected. Working directory is clean.';
        if (aiBtn) aiBtn.disabled = true;
        return;
      }

      summary.style.display = 'block';
      empty.style.display = 'none';
      if (aiBtn) aiBtn.disabled = false;

      const added = diff.files.filter(f => f.status === 'added').length;
      const modified = diff.files.filter(f => f.status === 'modified').length;
      const deleted = diff.files.filter(f => f.status === 'deleted').length;
      stats.textContent = '+' + added + ' ~' + modified + ' -' + deleted + ' files';

      fileList.innerHTML = diff.files.map(f => {
        const statusClass = f.status === 'added' ? 'added' : f.status === 'deleted' ? 'deleted' : 'modified';
        const statusText = f.status === 'added' ? 'A' : f.status === 'deleted' ? 'D' : 'M';
        return '<div class="diff-file"><span class="status ' + statusClass + '">' + statusText + '</span><span>' + escapeHtml(f.path) + '</span></div>';
      }).join('');

      // Auto-trigger plan comparison if we have a current plan
      if (diff.files.length > 0) {
        vscode.postMessage({ type: 'comparePlan', diffFiles: diff.files.map(f => f.path) });
      }
    }

    function updatePlanComparison(result) {
      lastPlanComparison = result;
      const panel = document.getElementById('planComparison');
      const content = document.getElementById('planComparisonResult');

      if (!result || (!result.unexpected.length && !result.missing.length && !result.matched.length)) {
        panel.style.display = 'none';
        return;
      }

      panel.style.display = 'block';
      let html = '';

      if (result.matched.length > 0) {
        html += '<div style="color:#22c55e; margin-bottom:4px;">✓ Matched (' + result.matched.length + ')</div>';
        result.matched.slice(0, 3).forEach(f => {
          html += '<div class="plan-match"><span class="icon">✓</span><span style="color:#22c55e;">' + escapeHtml(f) + '</span></div>';
        });
        if (result.matched.length > 3) {
          html += '<div style="color:var(--text-secondary); font-size:9px;">...and ' + (result.matched.length - 3) + ' more</div>';
        }
      }

      if (result.unexpected.length > 0) {
        html += '<div style="color:#fbbf24; margin-top:6px; margin-bottom:4px;">⚠ Unexpected (' + result.unexpected.length + ')</div>';
        result.unexpected.forEach(f => {
          html += '<div class="plan-match"><span class="icon">⚠</span><span style="color:#fbbf24;">' + escapeHtml(f) + '</span></div>';
        });
      }

      if (result.missing.length > 0) {
        html += '<div style="color:#ef4444; margin-top:6px; margin-bottom:4px;">✗ Missing (' + result.missing.length + ')</div>';
        result.missing.forEach(f => {
          html += '<div class="plan-match"><span class="icon">✗</span><span style="color:#ef4444;">' + escapeHtml(f) + '</span></div>';
        });
      }

      content.innerHTML = html;
    }

    function showPlanExecutionPanel(show) {
      const panel = document.getElementById('planExecutionPanel');
      if (panel) {
        panel.style.display = show ? 'block' : 'none';
      }
    }

    function setPlanExecutionStatus(text, isError) {
      const status = document.getElementById('planExecutionStatus');
      if (status) {
        status.textContent = text || '';
        status.style.color = isError ? 'var(--error-text)' : 'var(--text-secondary)';
      }
    }

    function setPlanExecutionProgress(text) {
      const progress = document.getElementById('planExecutionProgress');
      if (progress) {
        progress.textContent = text || '';
      }
    }

    function clearPlanExecutionLog() {
      planExecutionLogLines = [];
      const log = document.getElementById('planExecutionLog');
      if (log) {
        log.textContent = '';
      }
    }

    function appendPlanExecutionLog(line) {
      if (!line) return;
      const safeLine = String(line).trim();
      if (!safeLine) return;
      planExecutionLogLines.push(safeLine);
      if (planExecutionLogLines.length > 200) {
        planExecutionLogLines = planExecutionLogLines.slice(-200);
      }
      const log = document.getElementById('planExecutionLog');
      if (log) {
        log.textContent = planExecutionLogLines.join('\\n');
      }
    }

    function showPlanStepGate(payload) {
      pendingPlanStep = payload || null;
      const gate = document.getElementById('planStepGate');
      const details = document.getElementById('planStepGateDetails');
      if (details && payload) {
        const phaseLabel = payload.phaseTitle ? payload.phaseTitle : 'Phase ' + ((payload.phaseIndex || 0) + 1);
        const stepLabel = payload.stepDescription || payload.stepId || 'Step';
        details.textContent = phaseLabel + ' • ' + stepLabel;
      }
      if (gate) gate.style.display = payload ? 'block' : 'none';
    }

    function hidePlanStepGate() {
      pendingPlanStep = null;
      const gate = document.getElementById('planStepGate');
      if (gate) gate.style.display = 'none';
    }

    function approvePlanStep() {
      if (!pendingPlanStep) return;
      vscode.postMessage({ type: 'planStepApprove', planId: pendingPlanStep.planId, stepId: pendingPlanStep.stepId });
      hidePlanStepGate();
    }

    function abortPlanStep() {
      if (!pendingPlanStep) return;
      vscode.postMessage({ type: 'planStepAbort', planId: pendingPlanStep.planId, stepId: pendingPlanStep.stepId });
      hidePlanStepGate();
    }

    function runAIReview() {
      if (!lastDiffResult || !lastDiffResult.diff) {
        shipSetStatus('No diff available for AI review.');
        return;
      }
      vscode.postMessage({ type: 'runAIReview', diff: lastDiffResult.diff });
      shipSetStatus('Running AI review...');

      const status = document.getElementById('aiReviewStatus');
      if (status) {
        status.innerHTML = '<span class="ai-review-status-badge running">Analyzing...</span>';
      }
      document.getElementById('aiReviewResult').style.display = 'block';
      document.getElementById('aiReviewContent').innerHTML = '<div style="color:var(--text-secondary); text-align:center; padding:12px;">AI is reviewing your changes...</div>';
    }

    function updateAIReview(result) {
      lastAIReview = result;
      const panel = document.getElementById('aiReviewResult');
      const content = document.getElementById('aiReviewContent');
      const status = document.getElementById('aiReviewStatus');

      panel.style.display = 'block';

      if (!result || result.error) {
        status.innerHTML = '<span class="ai-review-status-badge issues">Error</span>';
        content.innerHTML = '<div style="color:#ef4444; padding:8px;">' + escapeHtml(result?.error || 'Unknown error') + '</div>';
        shipSetStatus('AI review failed.');
        return;
      }

      const issues = result.issues || [];
      const errors = issues.filter(i => i.severity === 'error').length;
      const warnings = issues.filter(i => i.severity === 'warning').length;
      const infos = issues.filter(i => i.severity === 'info').length;
      const total = issues.length;

      // Update status badge
      if (total === 0) {
        status.innerHTML = '<span class="ai-review-status-badge clean">Clean</span>';
        shipSetStatus('AI review complete - no issues found.');
      } else if (errors > 0) {
        status.innerHTML = '<span class="ai-review-status-badge issues">' + total + ' issue' + (total !== 1 ? 's' : '') + '</span>';
        shipSetStatus('AI review found ' + errors + ' error' + (errors !== 1 ? 's' : '') + '.');
      } else {
        status.innerHTML = '<span class="ai-review-status-badge warning-only">' + total + ' issue' + (total !== 1 ? 's' : '') + '</span>';
        shipSetStatus('AI review found ' + warnings + ' warning' + (warnings !== 1 ? 's' : '') + '.');
      }

      // Build content
      let html = '';

      // Summary counts bar (if issues exist)
      if (total > 0) {
        html += '<div class="ai-review-summary">';
        if (errors > 0) {
          html += '<span class="ai-review-count errors">X ' + errors + ' error' + (errors !== 1 ? 's' : '') + '</span>';
        }
        if (warnings > 0) {
          html += '<span class="ai-review-count warnings">! ' + warnings + ' warning' + (warnings !== 1 ? 's' : '') + '</span>';
        }
        if (infos > 0) {
          html += '<span class="ai-review-count infos">i ' + infos + ' info</span>';
        }
        html += '</div>';
      } else {
        html += '<div class="ai-review-summary"><span class="ai-review-count clean">No issues found - code looks good!</span></div>';
      }

      // Issue cards
      issues.forEach(issue => {
        const sev = issue.severity || 'info';
        const severityClass = sev === 'error' ? 'error' : sev === 'warning' ? 'warning' : 'info';
        const icon = sev === 'error' ? 'X' : sev === 'warning' ? '!' : 'i';

        html += '<div class="ai-issue ' + severityClass + '">';
        html += '<div class="ai-issue-title"><span class="ai-issue-icon">' + icon + '</span>' + escapeHtml(issue.title || 'Issue') + '</div>';
        if (issue.file) {
          html += '<div class="ai-issue-location">' + escapeHtml(issue.file) + (issue.line ? ':' + issue.line : '') + '</div>';
        }
        if (issue.description) {
          html += '<div class="ai-issue-desc">' + escapeHtml(issue.description) + '</div>';
        }
        html += '</div>';
      });

      // Summary text
      if (result.summary) {
        html += '<div style="margin-top:8px; padding-top:8px; border-top:1px solid var(--border-color); color:var(--text-secondary); font-size:10px;">' + escapeHtml(result.summary) + '</div>';
      }

      content.innerHTML = html;
    }

	    // --- Ship UI (metaphor layer; always visible) ---
	    // Sector IDs match SectorConfig.ts DEFAULT_RPG_SECTORS for proper context/rules injection.
	    const SHIP_GROUPS = [
	      {
	        id: 'core',
	        name: 'CORE',
	        items: [
	          { id: 'types', name: 'Shared Types & Interfaces' },
	          { id: 'utilities', name: 'Utilities' },
	        ],
	      },
	      {
	        id: 'character',
	        name: 'HANGAR',
	        items: [
	          { id: 'appearance', name: 'Character Appearance' },
	          { id: 'stats', name: 'Stats & Equipment' },
	        ],
	      },
	      {
	        id: 'combat',
	        name: 'ARMORY',
	        items: [
	          { id: 'damage', name: 'Damage & Abilities' },
	          { id: 'effects', name: 'Status Effects' },
	        ],
	      },
	      {
	        id: 'inventory',
	        name: 'CARGO',
	        items: [
	          { id: 'items', name: 'Items & Loot' },
	          { id: 'equipment', name: 'Equipment Slots' },
	        ],
	      },
	      {
	        id: 'dialogue',
	        name: 'COMMS',
	        items: [
	          { id: 'npc', name: 'NPC Dialogue' },
	          { id: 'branching', name: 'Branching Choices' },
	        ],
	      },
	      {
	        id: 'quest',
	        name: 'MISSIONS',
	        items: [
	          { id: 'objectives', name: 'Quest Objectives' },
	          { id: 'rewards', name: 'Rewards' },
	        ],
	      },
	      {
	        id: 'world',
	        name: 'NAVIGATION',
	        items: [
	          { id: 'zones', name: 'Zones & Maps' },
	          { id: 'spawning', name: 'Spawning' },
	        ],
	      },
	      {
	        id: 'ai',
	        name: 'SENSORS',
	        items: [
	          { id: 'behavior', name: 'AI Behavior Trees' },
	          { id: 'pathfinding', name: 'Pathfinding' },
	        ],
	      },
	      {
	        id: 'persistence',
	        name: 'QUARTERS',
	        items: [
	          { id: 'saves', name: 'Save/Load' },
	          { id: 'settings', name: 'Player Settings' },
	        ],
	      },
	      {
	        id: 'ui',
	        name: 'BRIDGE-UI',
	        items: [
	          { id: 'hud', name: 'HUD & Menus' },
	          { id: 'uitk', name: 'UI Toolkit' },
	        ],
	      },
	      {
	        id: 'editor',
	        name: 'ENGINEERING',
	        items: [
	          { id: 'tools', name: 'Editor Tools' },
	          { id: 'debug', name: 'Debug Utilities' },
	        ],
	      },
	      {
	        id: 'yard',
	        name: 'YARD',
	        items: [
	          { id: 'prototype', name: 'Prototypes' },
	          { id: 'experiments', name: 'Experiments' },
	        ],
	      },
	    ];

	    // Mapping from station-map.json scene IDs to SectorConfig sector IDs.
	    // This bridges the visual station metaphor with actual code architecture sectors.
	    const SCENE_TO_SECTOR_MAP = {
	      'bridge': 'ui',           // Command Bridge → BRIDGE-UI (user interface)
	      'core': 'core',           // Reactor Core → CORE (shared types/utilities)
	      'vault': 'inventory',     // Cargo Vault → CARGO (items/equipment)
	      'docking': 'world',       // Docking Ring → NAVIGATION (zones/maps)
	      'guard': 'combat',        // Armory → ARMORY (combat mechanics)
	      'scanner': 'ai',          // Scanner Bay → SENSORS (AI/pathfinding)
	      'comms': 'dialogue',      // Comms Array → COMMS (dialogue/NPC)
	      'station': 'core',        // Default for exterior view
	    };

	    // --- Schematic View Module Definitions ---
	    // Each module is drawn using SVG primitives (no raster images)
	    const SCHEMATIC_MODULES = {
	      core: {
	        id: 'core', name: 'CORE', desc: 'Central processing hub', color: '#6cf',
	        x: 400, y: 250,
	        draw: (g) => {
	          // Octagonal core
	          g.innerHTML += `
	            <polygon points="0,-45 32,-32 45,0 32,32 0,45 -32,32 -45,0 -32,-32"
	              fill="#1a3a4a" stroke="${SCHEMATIC_MODULES.core.color}" stroke-width="2"/>
	            <circle r="20" fill="#0a2030" stroke="#4af" stroke-width="1"/>
	            <circle r="8" fill="#6cf" filter="url(#schematicGlow)"/>
	          `;
	        }
	      },
	      bridge: {
	        id: 'bridge', name: 'BRIDGE', desc: 'Command & UI systems', color: '#6cf',
	        x: 400, y: 80,
	        draw: (g) => {
	          g.innerHTML += `
	            <rect x="-50" y="-25" width="100" height="50" rx="5"
	              fill="#1a3a4a" stroke="${SCHEMATIC_MODULES.bridge.color}" stroke-width="2"/>
	            <rect x="-35" y="-15" width="70" height="20" rx="3"
	              fill="#0a2030" stroke="#4af" stroke-width="1"/>
	            <circle cx="-20" cy="15" r="5" fill="#4af"/>
	            <circle cx="0" cy="15" r="5" fill="#4af"/>
	            <circle cx="20" cy="15" r="5" fill="#4af"/>
	          `;
	        }
	      },
	      scanner: {
	        id: 'scanner', name: 'SCANNER', desc: 'AI & pathfinding sensors', color: '#c6f',
	        x: 150, y: 200,
	        draw: (g) => {
	          g.innerHTML += `
	            <rect x="-25" y="10" width="50" height="20" fill="#2a3a4a" stroke="${SCHEMATIC_MODULES.scanner.color}"/>
	            <ellipse cx="0" cy="-5" rx="40" ry="15" fill="none" stroke="${SCHEMATIC_MODULES.scanner.color}" stroke-width="2"/>
	            <path d="M0,-5 L-20,-40 L20,-40 Z" fill="rgba(200,100,255,0.3)" stroke="${SCHEMATIC_MODULES.scanner.color}"/>
	            <circle cy="-5" r="8" fill="${SCHEMATIC_MODULES.scanner.color}" filter="url(#schematicGlow)"/>
	          `;
	        }
	      },
	      guard: {
	        id: 'guard', name: 'ARMORY', desc: 'Combat mechanics', color: '#f66',
	        x: 650, y: 200,
	        draw: (g) => {
	          g.innerHTML += `
	            <rect x="-35" y="-25" width="70" height="50" rx="3"
	              fill="#3a2a2a" stroke="${SCHEMATIC_MODULES.guard.color}" stroke-width="2"/>
	            <rect x="-25" y="-15" width="50" height="30" fill="#2a1a1a" stroke="#f44"/>
	            <line x1="-15" y1="0" x2="15" y2="0" stroke="${SCHEMATIC_MODULES.guard.color}" stroke-width="3"/>
	            <line x1="0" y1="-10" x2="0" y2="10" stroke="${SCHEMATIC_MODULES.guard.color}" stroke-width="3"/>
	          `;
	        }
	      },
	      vault: {
	        id: 'vault', name: 'VAULT', desc: 'Inventory & items', color: '#cc6',
	        x: 150, y: 350,
	        draw: (g) => {
	          g.innerHTML += `
	            <rect x="-35" y="-30" width="70" height="60" rx="3"
	              fill="#3a3a2a" stroke="${SCHEMATIC_MODULES.vault.color}" stroke-width="3"/>
	            <circle r="15" fill="#2a2a1a" stroke="${SCHEMATIC_MODULES.vault.color}" stroke-width="2"/>
	            <line x1="0" y1="-12" x2="0" y2="12" stroke="${SCHEMATIC_MODULES.vault.color}" stroke-width="2"/>
	            <line x1="-12" y1="0" x2="12" y2="0" stroke="${SCHEMATIC_MODULES.vault.color}" stroke-width="2"/>
	          `;
	        }
	      },
	      docking: {
	        id: 'docking', name: 'DOCKING', desc: 'World & navigation', color: '#f96',
	        x: 650, y: 350,
	        draw: (g) => {
	          g.innerHTML += `
	            <circle r="35" fill="#1a2a3a" stroke="${SCHEMATIC_MODULES.docking.color}" stroke-width="3"/>
	            <circle r="22" fill="#0a1a2a" stroke="${SCHEMATIC_MODULES.docking.color}" stroke-width="2"/>
	            <rect x="-4" y="-38" width="8" height="12" fill="${SCHEMATIC_MODULES.docking.color}"/>
	            <rect x="-4" y="26" width="8" height="12" fill="${SCHEMATIC_MODULES.docking.color}" />
	            <rect x="-38" y="-4" width="12" height="8" fill="${SCHEMATIC_MODULES.docking.color}"/>
	            <rect x="26" y="-4" width="12" height="8" fill="${SCHEMATIC_MODULES.docking.color}"/>
	            <circle r="6" fill="${SCHEMATIC_MODULES.docking.color}" filter="url(#schematicGlow)"/>
	          `;
	        }
	      },
	      comms: {
	        id: 'comms', name: 'COMMS', desc: 'Dialogue & NPCs', color: '#6f6',
	        x: 400, y: 420,
	        draw: (g) => {
	          g.innerHTML += `
	            <rect x="-8" y="10" width="16" height="30" fill="#2a4a3a" stroke="${SCHEMATIC_MODULES.comms.color}"/>
	            <path d="M-35,0 Q0,-40 35,0 Q0,10 -35,0" fill="#1a3a2a" stroke="${SCHEMATIC_MODULES.comms.color}" stroke-width="2"/>
	            <line x1="0" y1="-5" x2="0" y2="-25" stroke="#4f4" stroke-width="2"/>
	            <path d="M-15,-30 Q0,-45 15,-30" fill="none" stroke="${SCHEMATIC_MODULES.comms.color}" stroke-width="1" opacity="0.6"/>
	            <path d="M-10,-35 Q0,-45 10,-35" fill="none" stroke="${SCHEMATIC_MODULES.comms.color}" stroke-width="1" opacity="0.4"/>
	          `;
	        }
	      }
	    };

	    // Connections between modules (for drawing lines)
	    const SCHEMATIC_CONNECTIONS = [
	      ['core', 'bridge'],
	      ['core', 'scanner'],
	      ['core', 'guard'],
	      ['core', 'vault'],
	      ['core', 'docking'],
	      ['core', 'comms'],
	    ];

	    // Room detail views for each module (schematic mode)
	    const SCHEMATIC_ROOMS = {
	      bridge: {
	        title: 'COMMAND BRIDGE',
	        desc: 'UI & Interface Systems',
	        color: '#6cf',
	        drawRoom: (svg) => {
	          // Control panels
	          for (let i = 0; i < 3; i++) {
	            const x = 150 + i * 200;
	            svg.innerHTML += `
	              <rect x="${x}" y="120" width="100" height="60" rx="4" fill="#1a3a4a" stroke="#6cf" stroke-width="2"/>
	              <rect x="${x+10}" y="130" width="80" height="30" fill="#0a2030" stroke="#4af"/>
	              <circle cx="${x+25}" cy="170" r="5" fill="#4af"/>
	              <circle cx="${x+50}" cy="170" r="5" fill="#4af"/>
	              <circle cx="${x+75}" cy="170" r="5" fill="#4af"/>
	            `;
	          }
	          // Main screen
	          svg.innerHTML += `
	            <rect x="200" y="220" width="300" height="150" rx="6" fill="#0a2030" stroke="#6cf" stroke-width="3"/>
	            <text x="350" y="300" fill="#6cf" font-size="24" text-anchor="middle" font-family="monospace">SECTOR UI</text>
	            <text x="350" y="330" fill="#4af" font-size="12" text-anchor="middle" font-family="monospace" opacity="0.6">React components, views, layouts</text>
	          `;
	        }
	      },
	      scanner: {
	        title: 'SCANNER BAY',
	        desc: 'AI & Pathfinding Systems',
	        color: '#c6f',
	        drawRoom: (svg) => {
	          // Radar dish
	          svg.innerHTML += `
	            <ellipse cx="350" cy="200" rx="120" ry="40" fill="none" stroke="#c6f" stroke-width="2"/>
	            <ellipse cx="350" cy="200" rx="80" ry="25" fill="none" stroke="#c6f" stroke-width="1" opacity="0.5"/>
	            <line x1="350" y1="200" x2="350" y2="100" stroke="#c6f" stroke-width="3"/>
	            <circle cx="350" cy="90" r="15" fill="#c6f" filter="url(#schematicGlow)"/>
	          `;
	          // Scan waves
	          for (let i = 0; i < 3; i++) {
	            svg.innerHTML += `
	              <path d="M${200+i*30},280 Q350,${220-i*20} ${500-i*30},280" fill="none" stroke="#c6f" stroke-width="1" opacity="${0.3+i*0.2}"/>
	            `;
	          }
	          svg.innerHTML += `
	            <text x="350" y="350" fill="#c6f" font-size="18" text-anchor="middle" font-family="monospace">NEURAL PATHFINDING</text>
	            <text x="350" y="375" fill="#a4f" font-size="11" text-anchor="middle" font-family="monospace" opacity="0.6">NavMesh, AI behaviors, state machines</text>
	          `;
	        }
	      },
	      guard: {
	        title: 'ARMORY',
	        desc: 'Combat Mechanics',
	        color: '#f66',
	        drawRoom: (svg) => {
	          // Weapon racks
	          for (let i = 0; i < 4; i++) {
	            const x = 120 + i * 150;
	            svg.innerHTML += `
	              <rect x="${x}" y="130" width="80" height="120" rx="3" fill="#2a1a1a" stroke="#f66" stroke-width="2"/>
	              <line x1="${x+20}" y1="150" x2="${x+20}" y2="230" stroke="#f44" stroke-width="4"/>
	              <line x1="${x+40}" y1="160" x2="${x+40}" y2="220" stroke="#f44" stroke-width="4"/>
	              <line x1="${x+60}" y1="155" x2="${x+60}" y2="225" stroke="#f44" stroke-width="4"/>
	            `;
	          }
	          // Target
	          svg.innerHTML += `
	            <circle cx="350" cy="350" r="50" fill="none" stroke="#f66" stroke-width="2"/>
	            <circle cx="350" cy="350" r="30" fill="none" stroke="#f66" stroke-width="2"/>
	            <circle cx="350" cy="350" r="10" fill="#f66"/>
	            <text x="350" y="430" fill="#f66" font-size="18" text-anchor="middle" font-family="monospace">DAMAGE SYSTEMS</text>
	            <text x="350" y="455" fill="#f44" font-size="11" text-anchor="middle" font-family="monospace" opacity="0.6">Combat, abilities, buffs, targeting</text>
	          `;
	        }
	      },
	      vault: {
	        title: 'CARGO VAULT',
	        desc: 'Inventory & Items',
	        color: '#cc6',
	        drawRoom: (svg) => {
	          // Storage containers
	          for (let row = 0; row < 2; row++) {
	            for (let col = 0; col < 4; col++) {
	              const x = 120 + col * 140;
	              const y = 130 + row * 100;
	              svg.innerHTML += `
	                <rect x="${x}" y="${y}" width="100" height="70" rx="3" fill="#2a2a1a" stroke="#cc6" stroke-width="2"/>
	                <circle cx="${x+50}" cy="${y+35}" r="12" fill="#2a2a1a" stroke="#cc6" stroke-width="2"/>
	                <line x1="${x+50}" y1="${y+28}" x2="${x+50}" y2="${y+42}" stroke="#cc6" stroke-width="2"/>
	                <line x1="${x+43}" y1="${y+35}" x2="${x+57}" y2="${y+35}" stroke="#cc6" stroke-width="2"/>
	              `;
	            }
	          }
	          svg.innerHTML += `
	            <text x="350" y="380" fill="#cc6" font-size="18" text-anchor="middle" font-family="monospace">INVENTORY SYSTEM</text>
	            <text x="350" y="405" fill="#aa4" font-size="11" text-anchor="middle" font-family="monospace" opacity="0.6">Items, equipment, crafting, loot</text>
	          `;
	        }
	      },
	      docking: {
	        title: 'DOCKING RING',
	        desc: 'World & Navigation',
	        color: '#f96',
	        drawRoom: (svg) => {
	          // Docking ports
	          for (let i = 0; i < 3; i++) {
	            const x = 150 + i * 180;
	            svg.innerHTML += `
	              <circle cx="${x}" cy="200" r="50" fill="#1a2a3a" stroke="#f96" stroke-width="3"/>
	              <circle cx="${x}" cy="200" r="30" fill="#0a1a2a" stroke="#f96" stroke-width="2"/>
	              <circle cx="${x}" cy="200" r="10" fill="#f96" filter="url(#schematicGlow)"/>
	            `;
	          }
	          // Connection lines
	          svg.innerHTML += `
	            <line x1="200" y1="200" x2="330" y2="200" stroke="#f96" stroke-width="2" stroke-dasharray="5,5"/>
	            <line x1="380" y1="200" x2="510" y2="200" stroke="#f96" stroke-width="2" stroke-dasharray="5,5"/>
	            <text x="350" y="320" fill="#f96" font-size="18" text-anchor="middle" font-family="monospace">WORLD PORTALS</text>
	            <text x="350" y="345" fill="#f74" font-size="11" text-anchor="middle" font-family="monospace" opacity="0.6">Scenes, zones, level transitions</text>
	          `;
	        }
	      },
	      comms: {
	        title: 'COMMS ARRAY',
	        desc: 'Dialogue & NPCs',
	        color: '#6f6',
	        drawRoom: (svg) => {
	          // Antenna array
	          svg.innerHTML += `
	            <rect x="320" y="280" width="60" height="80" fill="#2a4a3a" stroke="#6f6" stroke-width="2"/>
	            <path d="M250,200 Q350,80 450,200" fill="none" stroke="#6f6" stroke-width="3"/>
	            <line x1="350" y1="140" x2="350" y2="280" stroke="#6f6" stroke-width="4"/>
	          `;
	          // Signal waves
	          for (let i = 0; i < 4; i++) {
	            svg.innerHTML += `
	              <path d="M${280-i*20},${180-i*15} Q350,${120-i*20} ${420+i*20},${180-i*15}" fill="none" stroke="#6f6" stroke-width="1" opacity="${0.2+i*0.2}"/>
	            `;
	          }
	          svg.innerHTML += `
	            <text x="350" y="400" fill="#6f6" font-size="18" text-anchor="middle" font-family="monospace">DIALOGUE SYSTEM</text>
	            <text x="350" y="425" fill="#4f4" font-size="11" text-anchor="middle" font-family="monospace" opacity="0.6">NPCs, conversations, localization</text>
	          `;
	        }
	      },
	      core: {
	        title: 'REACTOR CORE',
	        desc: 'Core Systems & Utilities',
	        color: '#6cf',
	        drawRoom: (svg) => {
	          // Central reactor
	          svg.innerHTML += `
	            <polygon points="350,100 420,180 420,280 350,360 280,280 280,180" fill="#1a3a4a" stroke="#6cf" stroke-width="3"/>
	            <polygon points="350,140 390,190 390,250 350,300 310,250 310,190" fill="#0a2030" stroke="#4af" stroke-width="2"/>
	            <circle cx="350" cy="220" r="30" fill="#6cf" filter="url(#schematicGlow)"/>
	          `;
	          // Energy conduits
	          for (let i = 0; i < 4; i++) {
	            const angle = (i * 90 + 45) * Math.PI / 180;
	            const x1 = 350 + Math.cos(angle) * 80;
	            const y1 = 220 + Math.sin(angle) * 80;
	            const x2 = 350 + Math.cos(angle) * 140;
	            const y2 = 220 + Math.sin(angle) * 140;
	            svg.innerHTML += `
	              <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#4af" stroke-width="3"/>
	              <circle cx="${x2}" cy="${y2}" r="8" fill="#4af"/>
	            `;
	          }
	          svg.innerHTML += `
	            <text x="350" y="420" fill="#6cf" font-size="18" text-anchor="middle" font-family="monospace">CORE SYSTEMS</text>
	            <text x="350" y="445" fill="#4af" font-size="11" text-anchor="middle" font-family="monospace" opacity="0.6">Shared types, utilities, services</text>
	          `;
	        }
	      }
	    };

	    // Track current schematic view (null = main station, or module id for room view)
	    let schematicCurrentRoom = null;

	    let shipSelectedSectorId = 'core';
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
      updateStationLabels();
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

	      // Map station scene ID to SectorConfig sector ID for context/rules injection.
	      const mappedSectorId = SCENE_TO_SECTOR_MAP[sceneId] || sceneId;
	      const group = SHIP_GROUPS.find(g => g.id === mappedSectorId);
	      if (group) {
	        if (shipSelectedSectorId !== mappedSectorId) {
	          shipSelectedSectorId = mappedSectorId;
	          shipSelectedSubId = null;
	        }
	      }

	      stationRenderScene();
	      shipRender();
	    }

	    function stationGoBack() {
	      // Handle schematic mode back navigation
	      if (uiState.stationViewMode === 'schematic') {
	        if (schematicCurrentRoom) {
	          schematicCurrentRoom = null;
	          stationRenderSchematic();
	          return;
	        }
	      }
	      // Handle photo mode back navigation
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

// --- Schematic View Rendering ---
function stationRenderSchematic() {
  const canvas = document.getElementById('shipCanvas');
  const img = document.getElementById('shipImage');
  if (!canvas) return;

  // Hide the raster image in schematic mode
  if (img) img.style.display = 'none';

  // Remove old schematic SVG if exists
  const oldSvg = canvas.querySelector('.schematic-svg');
  if (oldSvg) oldSvg.remove();

  // Create schematic SVG
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'schematic-svg');
  svg.setAttribute('viewBox', '0 0 700 500');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:#0a0a12;';

  // Add defs (glow filter, grid pattern)
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <filter id="schematicGlow">
      <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <pattern id="schematicGrid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1a2a3a" stroke-width="0.5"/>
    </pattern>
  `;
  svg.appendChild(defs);

  // Background grid
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('width', '100%');
  bg.setAttribute('height', '100%');
  bg.setAttribute('fill', 'url(#schematicGrid)');
  svg.appendChild(bg);

  // Check if we're viewing a room or the main station
  if (schematicCurrentRoom && SCHEMATIC_ROOMS[schematicCurrentRoom]) {
    // Render room detail view
    const room = SCHEMATIC_ROOMS[schematicCurrentRoom];

    // Room title
    const titleGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    titleGroup.innerHTML = `
      <text x="350" y="40" fill="${room.color}" font-size="20" text-anchor="middle" font-family="monospace" font-weight="bold">${room.title}</text>
      <text x="350" y="60" fill="${room.color}" font-size="11" text-anchor="middle" font-family="monospace" opacity="0.6">${room.desc}</text>
    `;
    svg.appendChild(titleGroup);

    // Draw room content
    const contentGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    room.drawRoom(contentGroup);
    svg.appendChild(contentGroup);

    // Back button
    const backBtn = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    backBtn.style.cssText = 'cursor:pointer;';
    backBtn.innerHTML = `
      <rect x="20" y="20" width="80" height="30" rx="4" fill="#1a2a3a" stroke="#6cf" stroke-width="1"/>
      <text x="60" y="40" fill="#6cf" font-size="12" text-anchor="middle" font-family="monospace">← BACK</text>
    `;
    backBtn.addEventListener('mouseenter', () => {
      backBtn.querySelector('rect').setAttribute('fill', '#2a4a5a');
    });
    backBtn.addEventListener('mouseleave', () => {
      backBtn.querySelector('rect').setAttribute('fill', '#1a2a3a');
    });
    backBtn.addEventListener('click', () => {
      schematicCurrentRoom = null;
      stationRenderSchematic();
    });
    svg.appendChild(backBtn);

  } else {
    // Render main station view

    // Draw connection lines first
    SCHEMATIC_CONNECTIONS.forEach(([fromId, toId]) => {
      const fromMod = SCHEMATIC_MODULES[fromId];
      const toMod = SCHEMATIC_MODULES[toId];
      if (!fromMod || !toMod) return;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', fromMod.x);
      line.setAttribute('y1', fromMod.y);
      line.setAttribute('x2', toMod.x);
      line.setAttribute('y2', toMod.y);
      line.setAttribute('stroke', '#2a4a5a');
      line.setAttribute('stroke-width', '2');
      line.setAttribute('stroke-dasharray', '5,5');
      svg.appendChild(line);
    });

    // Draw modules
    Object.values(SCHEMATIC_MODULES).forEach(mod => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'schematic-module');
      g.setAttribute('data-id', mod.id);
      g.setAttribute('transform', `translate(${mod.x}, ${mod.y})`);
      g.style.cssText = 'cursor:pointer;transition:filter 0.2s;';

      // Draw the module shape
      mod.draw(g);

      // Add label below
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('y', '55');
      label.setAttribute('fill', '#9fd');
      label.setAttribute('font-size', '11');
      label.setAttribute('font-family', 'monospace');
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('pointer-events', 'none');
      label.setAttribute('opacity', '0.8');
      label.textContent = mod.name;
      g.appendChild(label);

      // Hover effects
      g.addEventListener('mouseenter', () => {
        g.style.filter = 'brightness(1.5) drop-shadow(0 0 10px ' + mod.color + ')';
      });
      g.addEventListener('mouseleave', () => {
        g.style.filter = '';
      });

      // Click handler - navigate to room view
      g.addEventListener('click', () => {
        // Select the sector
        const mappedSectorId = SCENE_TO_SECTOR_MAP[mod.id] || mod.id;
        shipSelectedSectorId = mappedSectorId;
        shipSelectedSubId = null;
        shipRender();
        vscode.postMessage({ type: 'sectorSelected', sectorId: mappedSectorId });

        // Navigate to room view
        schematicCurrentRoom = mod.id;
        stationRenderSchematic();
      });

      svg.appendChild(g);
    });

    // Title
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    title.setAttribute('x', '350');
    title.setAttribute('y', '30');
    title.setAttribute('fill', '#6cf');
    title.setAttribute('font-size', '14');
    title.setAttribute('font-family', 'monospace');
    title.setAttribute('text-anchor', 'middle');
    title.setAttribute('opacity', '0.6');
    title.textContent = 'STATION SCHEMATIC';
    svg.appendChild(title);
  }

  canvas.appendChild(svg);

  // Update scene name display
  const sceneNameEl = document.getElementById('stationSceneName');
  if (sceneNameEl) {
    if (schematicCurrentRoom && SCHEMATIC_ROOMS[schematicCurrentRoom]) {
      sceneNameEl.textContent = SCHEMATIC_ROOMS[schematicCurrentRoom].title;
    } else {
      sceneNameEl.textContent = 'Station Schematic';
    }
  }

  // Update back button visibility
  const backBtn = document.getElementById('stationBackBtn');
  if (backBtn) {
    backBtn.style.visibility = schematicCurrentRoom ? 'visible' : 'hidden';
  }
}

// --- Photo View Rendering (Legacy) ---
function stationRenderPhoto() {
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

// --- Main Render Dispatcher ---
function stationRenderScene() {
  const canvas = document.getElementById('shipCanvas');
  const img = document.getElementById('shipImage');

  // Remove old content
  const oldSchematic = canvas?.querySelector('.schematic-svg');
  if (oldSchematic) oldSchematic.remove();

  if (uiState.stationViewMode === 'schematic') {
    stationRenderSchematic();
  } else {
    // Show the image for photo mode
    if (img) img.style.display = '';
    stationRenderPhoto();
  }
}

// Toggle between schematic and photo view
function stationToggleViewMode(mode) {
  if (mode) {
    uiState.stationViewMode = mode;
  } else {
    uiState.stationViewMode = uiState.stationViewMode === 'schematic' ? 'photo' : 'schematic';
  }
  // Update toggle buttons
  const btnSchematic = document.getElementById('stationViewSchematic');
  const btnPhoto = document.getElementById('stationViewPhoto');
  if (btnSchematic) btnSchematic.classList.toggle('active', uiState.stationViewMode === 'schematic');
  if (btnPhoto) btnPhoto.classList.toggle('active', uiState.stationViewMode === 'photo');
  // Re-render
  stationRenderScene();
}

	    function shipGetProfile() {
	      const sel = document.getElementById('shipProfileSelect');
	      return sel ? sel.value : 'yard';
	    }

	    function shipSetStatus(text) {
	      const el = document.getElementById('shipStatusText');
	      if (el) el.textContent = text;
	    }

      let lastCoordinatorToast = '';
      function showToast(message, kind) {
        const container = document.getElementById('sc-toast-container');
        if (!container || !message) return;
        const toast = document.createElement('div');
        toast.className = 'sc-toast ' + (kind || '');
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3500);
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
		      // Update doc suggestion based on sector
		      updateDocSuggestion(sectorId);
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

	    function asmdefRefresh() {
	      vscode.postMessage({ type: 'asmdefInventory' });
	      shipSetStatus('Loading asmdef inventory...');
	    }

	    function asmdefGeneratePolicy() {
	      vscode.postMessage({ type: 'asmdefGeneratePolicy' });
	      shipSetStatus('Generating asmdef policy draft...');
	    }

	    function asmdefOpenPolicy() {
	      vscode.postMessage({ type: 'asmdefOpenPolicy' });
	      shipSetStatus('Opening asmdef policy...');
	    }

    function asmdefEditPolicy() {
      vscode.postMessage({ type: 'asmdefGetPolicy' });
      shipSetStatus('Loading asmdef policy...');
    }

    function asmdefReloadPolicy() {
      asmdefEditPolicy();
    }

    function asmdefSavePolicy() {
      const textEl = document.getElementById('asmdefPolicyText');
      if (!textEl) return;
      const text = textEl.value || '';
      if (!text.trim()) {
        shipSetStatus('Policy is empty.');
        return;
      }
      vscode.postMessage({ type: 'asmdefSavePolicy', text });
      shipSetStatus('Saving asmdef policy...');
    }

    function asmdefSetStrict() {
      vscode.postMessage({ type: 'asmdefSetStrict' });
      shipSetStatus('Setting asmdef policy to strict...');
    }

    function asmdefSetAdvisory() {
      vscode.postMessage({ type: 'asmdefSetAdvisory' });
      shipSetStatus('Setting asmdef policy to advisory...');
    }

    function asmdefNormalizeGuids() {
      vscode.postMessage({ type: 'asmdefNormalizeGuids' });
      shipSetStatus('Normalizing GUID references...');
    }

    function asmdefGraph() {
      vscode.postMessage({ type: 'asmdefGraph' });
      shipSetStatus('Loading asmdef graph...');
    }

    function asmdefValidate() {
      vscode.postMessage({ type: 'asmdefValidate' });
      shipSetStatus('Validating asmdef policy...');
    }

    function copyAsmdefFixes() {
      const listEl = document.getElementById('asmdefViolations');
      if (!listEl) return;
      const suggestions = Array.from(listEl.querySelectorAll('.asmdef-item-refs'))
        .map(el => el.textContent || '')
        .filter(t => t.startsWith('Suggest: '))
        .map(t => t.replace(/^Suggest:\s*/, '').trim());
      if (!suggestions.length) {
        shipSetStatus('No fixes to copy.');
        return;
      }
      const text = suggestions.join('\\n');
      navigator.clipboard.writeText(text).then(() => {
        shipSetStatus('Fixes copied to clipboard.');
      }, () => {
        shipSetStatus('Failed to copy fixes.');
      });
    }

    function setCoordinatorPill(el, status) {
      if (!el) return;
      const value = status || 'unknown';
      el.textContent = value;
      el.classList.remove('ok', 'warn', 'bad', 'muted');
      if (value === 'ok') {
        el.classList.add('ok');
      } else if (value === 'unknown') {
        el.classList.add('muted');
      } else if (value.includes('warn') || value.includes('delay')) {
        el.classList.add('warn');
      } else {
        el.classList.add('bad');
      }
    }

    function updateCoordinatorSummary(targetId, status) {
      const el = document.getElementById(targetId);
      if (!el) return;
      const issues = ['policy', 'inventory', 'graph'].filter(k => status[k] && status[k] !== 'ok' && status[k] !== 'unknown');
      if (!issues.length) {
        el.textContent = 'All sync channels healthy.';
        return;
      }
      el.textContent = 'Issues: ' + issues.map(k => k + ':' + status[k]).join(', ');
    }

    function updateCoordinatorLastIssue(targetId, issue) {
      const el = document.getElementById(targetId);
      if (el) el.textContent = issue || 'none';
    }

	    function coordinatorHealthCheck() {
	      vscode.postMessage({ type: 'coordinatorHealth' });
	      shipSetStatus('Checking Coordinator status...');
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
	      // Request initial coordinator status
	      vscode.postMessage({ type: 'coordinatorHealth' });

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
      requestJobList();
      unityCheckConnection(); // Auto-connect to Unity MCP on startup
    }, 0);

    // Restore control panel tab
    const savedTab = localStorage.getItem('spacecode.controlTab') || 'info';
    const allowedTabs = new Set(['info', 'coordinator', 'ops', 'unity']);
    setTimeout(() => switchControlTab(allowedTabs.has(savedTab) ? savedTab : 'info'), 0);

    // Restore right-panel mode (tab-aware)
    const savedPanelMode = localStorage.getItem('spacecode.panelMode') || 'station';
    setTimeout(() => {
      if (currentTab === TABS.CHAT) {
        setRightPanelMode('flow');
      } else if (currentTab === TABS.STATION) {
        setRightPanelMode('station');
      } else {
        setRightPanelMode(savedPanelMode);
      }
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
      clearAiFlow();
      clearContextSources();
      hideLiveResponse();
      const phaseEl = document.getElementById('flowPanelPhase');
      if (phaseEl) phaseEl.textContent = 'Synthesis';
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
      if (!container) {
        return;
      }
      // DEBUG: Show short chatId in tab name to verify unique IDs
      const tabs = Object.values(chatSessions).map(session => `
        <div class="chat-tab ${session.id === currentChatId ? 'active' : ''} ${session.mode} ${session.isGenerating ? 'generating' : ''}"
             data-chat-id="${session.id}"
             onclick="switchChat('${session.id}')">
          <div class="chat-tab-icon ${session.mode}">${session.isGenerating ? '<span class="tab-spinner"></span>' : ''}</div>
          <span>${session.name} [${session.id.slice(-4)}]</span>
          <span class="chat-tab-close" onclick="event.stopPropagation(); closeChat('${session.id}')">×</span>
        </div>
      `).join('');
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
      return `
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
      `;
    }

    // Tab selector - handles both new data-tab and legacy data-mode attributes
    // Note: HTML onclick handlers call switchTab() directly, but this adds
    // fallback behavior for any buttons without onclick handlers
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        // Support both data-tab (new) and data-mode (legacy) attributes
        const clickedTab = btn.dataset.tab || btn.dataset.mode;

        // If onclick handler already exists, it will call switchTab()
        // This listener handles legacy buttons without onclick
        if (!btn.onclick) {
          window.switchTab(clickedTab);
        }
      });
    });

    // Initialize chat mode switcher visibility
    updateChatModeSwitcherVisibility();

    /**
     * Switch between main tabs (Chat, Station, Agents, Skills, Dashboard)
     * Called from HTML onclick handlers
     */
    window.switchTab = function(tabName) {
      console.log('[SpaceCode UI] switchTab called with:', tabName);

      // Get all sections
      const chatSection = document.getElementById('chatSection');
      const agentsSection = document.getElementById('agentsSection');
      const ticketsSection = document.getElementById('ticketsSection');
      const skillsSection = document.getElementById('skillsSection');
      const dashboardSection = document.getElementById('dashboardSection');
      const rightPane = document.getElementById('rightPane');
      const mainSplitter = document.getElementById('mainSplitter');
      const leftPane = document.querySelector('.left-pane');

      // Hide all left-pane sections first
      if (chatSection) chatSection.style.display = 'none';
      if (agentsSection) agentsSection.style.display = 'none';
      if (ticketsSection) ticketsSection.style.display = 'none';
      if (skillsSection) skillsSection.style.display = 'none';
      if (dashboardSection) dashboardSection.style.display = 'none';

      // Update tab buttons
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      const activeBtn = document.querySelector(`.mode-btn[data-tab="${tabName}"]`);
      if (activeBtn) activeBtn.classList.add('active');

      // Show the appropriate section
      currentTab = tabName;
      currentMode = tabName; // Legacy alias

      // Default: hide right panel (Station View)
      if (rightPane) rightPane.style.display = 'none';
      if (mainSplitter) mainSplitter.style.display = 'none';
      if (leftPane) leftPane.style.flex = '1'; // Full width

      // Get Context Flow panel
      const contextFlowPanel = document.getElementById('contextFlowPanel');

      switch (tabName) {
        case TABS.CHAT:
          // Chat: 50/50 split - left pane (chat) + right pane (flow)
          if (chatSection) chatSection.style.display = 'flex';
          if (leftPane) leftPane.style.flex = '1 1 50%'; // 50% width
          if (rightPane) {
            rightPane.style.display = 'flex'; // Show right pane
            rightPane.style.flex = '1 1 50%'; // 50% width
            setRightPanelMode('flow'); // Show flow panel in chat tab
          }
          if (mainSplitter) mainSplitter.style.display = 'none';
          if (contextFlowPanel) contextFlowPanel.style.display = 'none';
          updateChatModeSwitcherVisibility();
          break;

        case TABS.STATION:
          // Station: Show station schematic on right, chat on left (no context flow)
          if (rightPane) rightPane.style.display = 'flex';
          if (mainSplitter) mainSplitter.style.display = 'block';
          if (leftPane) leftPane.style.flex = '0 0 350px'; // Narrower left pane
          if (chatSection) chatSection.style.display = 'flex';
          if (contextFlowPanel) contextFlowPanel.style.display = 'none'; // Hide Context Flow
          setRightPanelMode('station'); // Ensure Station view is visible
          // Hide chat mode switcher on Station tab (not needed)
          const switcher = document.getElementById('chatModeSwitcher');
          if (switcher) switcher.style.display = 'none';
          break;

        case TABS.AGENTS:
          // Agents: workflow builder, full width
          if (agentsSection) agentsSection.style.display = 'flex';
          if (!editor) {
            initDrawflow();
          }
          vscode.postMessage({ type: 'getWorkflows' });
          break;

        case TABS.SKILLS:
          // Skills: skills management, full width
          if (skillsSection) {
            skillsSection.style.display = 'flex';
          } else if (chatSection) {
            chatSection.style.display = 'flex';
          }
          vscode.postMessage({ type: 'getSkills' });
          break;

        case TABS.DASHBOARD:
          // Dashboard: metrics and tickets, full width
          if (dashboardSection) {
            dashboardSection.style.display = 'flex';
          } else if (ticketsSection) {
            ticketsSection.style.display = 'flex';
          }
          vscode.postMessage({ type: 'getTickets' });
          vscode.postMessage({ type: 'getDashboardMetrics' });
          break;

        default:
          if (chatSection) chatSection.style.display = 'flex';
      }

      vscode.postMessage({ type: 'setTab', tab: tabName });
    };

    // ============================================
    // Dashboard Sub-tab Functions
    // ============================================

    let currentDashboardSubtab = 'docs';

    window.switchDashboardSubtab = function(subtabName) {
      console.log('[SpaceCode UI] switchDashboardSubtab:', subtabName);
      currentDashboardSubtab = subtabName;

      document.querySelectorAll('.dashboard-subtab').forEach(b => b.classList.remove('active'));
      const activeBtn = document.querySelector(`.dashboard-subtab[data-subtab="${subtabName}"]`);
      if (activeBtn) activeBtn.classList.add('active');

      const panels = ['dashboardDocsPanel', 'dashboardTicketsPanel', 'dashboardDbPanel', 'dashboardMcpPanel', 'dashboardLogsPanel', 'dashboardSettingsPanel'];
      panels.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });

      switch (subtabName) {
        case 'docs':
          document.getElementById('dashboardDocsPanel')?.style && (document.getElementById('dashboardDocsPanel').style.display = 'block');
          refreshDocs();
          break;
        case 'tickets':
          document.getElementById('dashboardTicketsPanel')?.style && (document.getElementById('dashboardTicketsPanel').style.display = 'block');
          refreshTickets();
          break;
        case 'db':
          document.getElementById('dashboardDbPanel')?.style && (document.getElementById('dashboardDbPanel').style.display = 'block');
          refreshDbStats();
          break;
        case 'mcp':
          document.getElementById('dashboardMcpPanel')?.style && (document.getElementById('dashboardMcpPanel').style.display = 'block');
          refreshMcpServers();
          break;
        case 'logs':
          document.getElementById('dashboardLogsPanel')?.style && (document.getElementById('dashboardLogsPanel').style.display = 'block');
          refreshLogs();
          break;
        case 'settings':
          document.getElementById('dashboardSettingsPanel')?.style && (document.getElementById('dashboardSettingsPanel').style.display = 'block');
          loadSettings();
          break;
      }
    };

    window.refreshDocs = function() {
      vscode.postMessage({ type: 'getDocsStats' });
      vscode.postMessage({ type: 'getKbSources' });
    };

    window.ingestKbSource = function() {
      const input = document.getElementById('kbIngestUrl');
      const url = input?.value?.trim();
      if (!url) { showToast('Please enter a URL or file path', 'warning'); return; }
      vscode.postMessage({ type: 'ingestKbSource', url });
      input.value = '';
      showToast('Ingestion started...', 'info');
    };

    window.scanProjectDocs = function() {
      vscode.postMessage({ type: 'scanProjectDocs' });
      showToast('Scanning project docs...', 'info');
    };

    window.refreshTickets = function() {
      vscode.postMessage({ type: 'getTickets' });
      vscode.postMessage({ type: 'getTicketStats' });
    };

    window.toggleTicketFormDashboard = function() {
      const form = document.getElementById('dashboardTicketForm');
      if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
    };

    window.createTicketFromDashboard = function() {
      const title = document.getElementById('dashboardTicketTitle')?.value?.trim();
      const description = document.getElementById('dashboardTicketDescription')?.value?.trim();
      const priority = document.getElementById('dashboardTicketPriority')?.value || 'medium';
      const sector = document.getElementById('dashboardTicketSector')?.value || '';
      if (!title) { showToast('Please enter a ticket title', 'warning'); return; }
      vscode.postMessage({ type: 'createTicket', ticket: { title, description, priority, sector } });
      document.getElementById('dashboardTicketTitle').value = '';
      document.getElementById('dashboardTicketDescription').value = '';
      toggleTicketFormDashboard();
      showToast('Ticket created', 'success');
    };

    window.executeTicket = function(ticketId) {
      vscode.postMessage({ type: 'executeTicket', ticketId });
      showToast('Executing ticket...', 'info');
    };

    window.viewTicket = function(ticketId) {
      vscode.postMessage({ type: 'viewTicket', ticketId });
    };

    window.refreshDbStats = function() {
      vscode.postMessage({ type: 'getDbStats' });
      vscode.postMessage({ type: 'getRagHealth' });
    };

    window.refreshMcpServers = function() {
      vscode.postMessage({ type: 'getMcpServers' });
    };

    window.addMcpServer = function() {
      const name = prompt('Enter server name:');
      if (!name) return;
      const command = prompt('Enter server command (e.g., npx -y @modelcontextprotocol/server-filesystem):');
      if (!command) return;
      vscode.postMessage({ type: 'addMcpServer', name, command });
      showToast('MCP server added', 'success');
      refreshMcpServers();
    };

    window.updateMcpServerList = function(servers) {
      const list = document.getElementById('mcpServerList');
      if (!list) return;
      if (!servers || servers.length === 0) {
        list.innerHTML = '<div class="empty-state">No MCP servers configured</div>';
        return;
      }
      list.innerHTML = servers.map(s => `
        <div class="mcp-server-item" onclick="selectMcpServer('${s.name}')">
          <span class="mcp-server-status ${s.status || 'disconnected'}"></span>
          <span class="mcp-server-name">${escapeHtml(s.name)}</span>
          <span class="mcp-server-tools">${s.tools || 0} tools</span>
        </div>
      `).join('');
    };

    window.selectMcpServer = function(serverName) {
      vscode.postMessage({ type: 'getMcpServerDetails', name: serverName });
    };

    window.rebuildIndex = function() {
      if (confirm('Rebuild the entire index? This may take some time.')) {
        vscode.postMessage({ type: 'rebuildIndex' });
        showToast('Rebuilding index...', 'info');
      }
    };

    window.clearCache = function() {
      if (confirm('Clear all cached data?')) {
        vscode.postMessage({ type: 'clearCache' });
        showToast('Cache cleared', 'success');
      }
    };

    window.confirmResetDb = function() {
      if (confirm('This will DELETE all vectors. Are you sure?')) {
        const response = prompt('Type RESET to confirm:');
        if (response === 'RESET') {
          vscode.postMessage({ type: 'resetDatabase' });
          showToast('Database reset', 'warning');
        }
      }
    };

    window.loadSettings = function() {
      vscode.postMessage({ type: 'getSettings' });
      initSettingsListeners();
    };

    window.saveSettings = function() {
      const settings = {
        claudeApiKey: document.getElementById('settingsClaudeKey')?.value || '',
        gptApiKey: document.getElementById('settingsGptKey')?.value || '',
        maxTokens: parseInt(document.getElementById('settingsMaxTokens')?.value) || 8000,
        budgetMessages: parseInt(document.getElementById('budgetMessages')?.value) || 30,
        budgetChunks: parseInt(document.getElementById('budgetChunks')?.value) || 50,
        budgetKb: parseInt(document.getElementById('budgetKb')?.value) || 15,
        budgetSystem: parseInt(document.getElementById('budgetSystem')?.value) || 5,
        autoExecute: document.getElementById('settingsAutoExecute')?.checked || false,
        autoClose: document.getElementById('settingsAutoClose')?.checked !== false,
        injectRules: document.getElementById('settingsInjectRules')?.checked !== false,
        defaultModel: document.getElementById('settingsDefaultModel')?.value || 'claude',
        priorityOrder: Array.from(document.querySelectorAll('.priority-item')).map(i => i.dataset.priority),
      };
      vscode.postMessage({ type: 'saveSettings', settings });
      showToast('Settings saved', 'success');
    };

    function initSettingsListeners() {
      ['budgetMessages', 'budgetChunks', 'budgetKb', 'budgetSystem'].forEach(id => {
        const slider = document.getElementById(id);
        const display = document.getElementById(id + 'Value');
        if (slider && display) {
          slider.addEventListener('input', () => { display.textContent = slider.value + '%'; });
        }
      });
      initPriorityDragDrop();
    }

    function initPriorityDragDrop() {
      const list = document.getElementById('priorityList');
      if (!list) return;
      let draggedItem = null;
      list.querySelectorAll('.priority-item').forEach(item => {
        item.addEventListener('dragstart', () => { draggedItem = item; item.classList.add('dragging'); });
        item.addEventListener('dragend', () => { item.classList.remove('dragging'); draggedItem = null; });
        item.addEventListener('dragover', (e) => {
          e.preventDefault();
          if (draggedItem && draggedItem !== item) {
            const rect = item.getBoundingClientRect();
            if (e.clientY < rect.top + rect.height / 2) list.insertBefore(draggedItem, item);
            else list.insertBefore(draggedItem, item.nextSibling);
          }
        });
      });
    }

    window.confirmResetSettings = function() {
      if (confirm('Reset all settings to defaults?')) {
        vscode.postMessage({ type: 'resetSettings' });
        loadSettings();
        showToast('Settings reset to defaults', 'info');
      }
    };

    window.confirmClearAllData = function() {
      if (confirm('This will DELETE all data. Are you sure?')) {
        const response = prompt('Type DELETE to confirm:');
        if (response === 'DELETE') {
          vscode.postMessage({ type: 'clearAllData' });
          showToast('All data cleared', 'warning');
        }
      }
    };

    window.updateDocsStats = function(stats) {
      if (stats.kbChunks !== undefined) document.getElementById('docsKbChunks')?.textContent && (document.getElementById('docsKbChunks').textContent = stats.kbChunks.toLocaleString());
      if (stats.projectDocs !== undefined) document.getElementById('docsProjectDocs')?.textContent && (document.getElementById('docsProjectDocs').textContent = stats.projectDocs.toLocaleString());
      if (stats.externalKb !== undefined) document.getElementById('docsExternalKb')?.textContent && (document.getElementById('docsExternalKb').textContent = stats.externalKb.toLocaleString());
    };

    window.updateTicketStats = function(stats) {
      const ids = { ticketsOpen: stats.open, ticketsInProgress: stats.inProgress, ticketsDone: stats.done, ticketsTotal: stats.total };
      Object.entries(ids).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = (val || 0).toLocaleString();
      });
    };

    window.updateTicketsList = function(tickets) {
      const list = document.getElementById('dashboardTicketsList');
      if (!list) return;
      if (!tickets || tickets.length === 0) {
        list.innerHTML = '<div class="empty-state">No tickets yet. Create one to get started.</div>';
        return;
      }
      list.innerHTML = tickets.map(t => `
        <div class="ticket-item" onclick="viewTicket('${t.id}')">
          <span class="ticket-status-badge ${t.status}"></span>
          <div class="ticket-info">
            <div class="ticket-title">${escapeHtml(t.title)}</div>
            <div class="ticket-meta">${t.sector || 'No sector'} · ${t.priority}</div>
          </div>
          <div class="ticket-actions">
            <button class="btn-sm btn-primary" onclick="event.stopPropagation(); executeTicket('${t.id}')" title="Execute">▶</button>
          </div>
        </div>
      `).join('');
    };

    window.updateDbStats = function(stats) {
      const ids = { dbVectorCount: stats.vectors, dbChunkCount: stats.chunks };
      Object.entries(ids).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = (val || 0).toLocaleString();
      });
      const cacheEl = document.getElementById('dbCacheHitRate');
      if (cacheEl) cacheEl.textContent = (stats.cacheHitRate || 0) + '%';
      const storageEl = document.getElementById('dbStorageSize');
      if (storageEl) storageEl.textContent = formatBytes(stats.storageSize || 0);
    };

    window.updateRagHealth = function(health) {
      const latencyEl = document.getElementById('ragLatency');
      if (latencyEl) latencyEl.textContent = (health.latency || '-') + ' ms';
      const embeddingEl = document.getElementById('ragEmbeddingStatus');
      if (embeddingEl) {
        embeddingEl.textContent = health.embeddingStatus || 'Unknown';
        embeddingEl.className = 'health-value ' + (health.embeddingStatus === 'Ready' ? 'health-good' : 'health-warn');
      }
    };

    window.updateSettings = function(settings) {
      const claudeStatus = document.getElementById('claudeKeyStatus');
      const gptStatus = document.getElementById('gptKeyStatus');
      if (claudeStatus) { claudeStatus.textContent = settings.hasClaudeKey ? 'Configured' : 'Not set'; claudeStatus.className = 'key-status ' + (settings.hasClaudeKey ? 'valid' : ''); }
      if (gptStatus) { gptStatus.textContent = settings.hasGptKey ? 'Configured' : 'Not set'; gptStatus.className = 'key-status ' + (settings.hasGptKey ? 'valid' : ''); }
      const maxTokensEl = document.getElementById('settingsMaxTokens');
      if (maxTokensEl) maxTokensEl.value = settings.maxTokens || 8000;
      [{ id: 'budgetMessages', val: settings.budgetMessages || 30 }, { id: 'budgetChunks', val: settings.budgetChunks || 50 }, { id: 'budgetKb', val: settings.budgetKb || 15 }, { id: 'budgetSystem', val: settings.budgetSystem || 5 }].forEach(({ id, val }) => {
        const slider = document.getElementById(id);
        const display = document.getElementById(id + 'Value');
        if (slider) slider.value = val;
        if (display) display.textContent = val + '%';
      });
      const autoExecEl = document.getElementById('settingsAutoExecute');
      const autoCloseEl = document.getElementById('settingsAutoClose');
      const injectEl = document.getElementById('settingsInjectRules');
      if (autoExecEl) autoExecEl.checked = settings.autoExecute || false;
      if (autoCloseEl) autoCloseEl.checked = settings.autoClose !== false;
      if (injectEl) injectEl.checked = settings.injectRules !== false;
      const modelEl = document.getElementById('settingsDefaultModel');
      if (modelEl) modelEl.value = settings.defaultModel || 'claude';
    };

    function formatBytes(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    // Dashboard Panel Update Functions
    window.updateDocsPanel = function(stats) {
      if (!stats) return;

      // Update stats display
      const totalEl = document.getElementById('docsKbChunks');
      if (totalEl) totalEl.textContent = (stats.totalChunks || 0).toLocaleString();

      const projectEl = document.getElementById('docsProjectDocs');
      if (projectEl) projectEl.textContent = (stats.totalDocs || 0).toLocaleString();

      const embeddedEl = document.getElementById('docsExternalKb');
      if (embeddedEl) embeddedEl.textContent = (stats.embeddedDocs || 0).toLocaleString();

      // Update sources list
      const sourcesList = document.getElementById('kbSourcesList');
      if (sourcesList && stats.sources) {
        if (stats.sources.length === 0) {
          sourcesList.innerHTML = '<div class="empty-state">No KB sources yet. Ingest a URL or scan project docs.</div>';
        } else {
          sourcesList.innerHTML = stats.sources.map(s => `
            <div class="kb-source-item">
              <span class="kb-source-icon">${s.type === 'url' ? '🔗' : '📄'}</span>
              <span class="kb-source-title">${escapeHtml(s.title || s.id)}</span>
              <span class="kb-source-meta">${s.chunkCount} chunks${s.embedded ? ' ✓' : ''}</span>
            </div>
          `).join('');
        }
      }
    };

    window.updateDbPanel = function(stats) {
      if (!stats) return;

      // Update vector stats
      const vectorEl = document.getElementById('dbVectorCount');
      if (vectorEl) vectorEl.textContent = (stats.vectors?.count || 0).toLocaleString();

      const chunkEl = document.getElementById('dbChunkCount');
      if (chunkEl) chunkEl.textContent = (stats.vectors?.count || 0).toLocaleString();

      // Update message stats
      const msgCountEl = document.getElementById('dbMessageCount');
      if (msgCountEl) msgCountEl.textContent = (stats.messages?.count || 0).toLocaleString();

      const sessionsEl = document.getElementById('dbSessionCount');
      if (sessionsEl) sessionsEl.textContent = (stats.messages?.sessions || 0).toLocaleString();

      // Update embedding status
      const embeddingEl = document.getElementById('ragEmbeddingStatus');
      if (embeddingEl) {
        const ready = stats.embedding?.ready;
        embeddingEl.textContent = ready ? 'Ready' : 'Not Ready';
        embeddingEl.className = 'health-value ' + (ready ? 'health-good' : 'health-warn');
      }

      const modelEl = document.getElementById('ragModelName');
      if (modelEl) modelEl.textContent = stats.embedding?.model || 'Not loaded';
    };

    window.updateLogsPanel = function(logs, channel) {
      const logsList = document.getElementById('dashboardLogsList');
      if (!logsList) return;

      if (!logs || logs.length === 0) {
        logsList.innerHTML = '<div class="empty-state">No logs available</div>';
        return;
      }

      logsList.innerHTML = logs.map(log => {
        const levelClass = log.level === 'error' ? 'log-error' : log.level === 'warn' ? 'log-warn' : 'log-info';
        const time = new Date(log.timestamp).toLocaleTimeString();
        return `
          <div class="log-entry ${levelClass}">
            <span class="log-time">${time}</span>
            <span class="log-channel">[${log.channel}]</span>
            <span class="log-message">${escapeHtml(log.message)}</span>
          </div>
        `;
      }).join('');

      // Scroll to bottom
      logsList.scrollTop = logsList.scrollHeight;
    };

    window.refreshLogs = function(channel) {
      vscode.postMessage({ type: 'getLogs', channel, limit: 100 });
    };

    // ============================================
    // End Dashboard Functions
    // ============================================

    /**
     * Switch between chat modes (Solo, Swarm)
     * Called from HTML onclick handlers within the Chat tab
     */
    window.switchChatMode = function(modeName) {
      console.log('[SpaceCode UI] switchChatMode called with:', modeName);

      // Update chat mode buttons (old location - keep for backwards compatibility)
      document.querySelectorAll('.chat-mode-btn').forEach(b => b.classList.remove('active'));
      const activeBtn = document.querySelector(`.chat-mode-btn[data-chat-mode="${modeName}"]`);
      if (activeBtn) activeBtn.classList.add('active');

      // Update input mode buttons (new location in bottom bar)
      document.querySelectorAll('.input-mode-btn').forEach(b => b.classList.remove('active'));
      const activeInputBtn = document.querySelector(`.input-mode-btn[data-chat-mode="${modeName}"]`);
      if (activeInputBtn) activeInputBtn.classList.add('active');

      currentChatMode = modeName;
      uiState.chatMode = modeName;

      // Get panel elements
      const chatContainer = document.getElementById('chatContainer');
      const primaryPanel = document.getElementById('chatPanelPrimary');
      const swarmSidebar = document.getElementById('swarmSidebar');
      const gptOpinionPanel = document.getElementById('gptOpinionPanel');
      const rightPane = document.getElementById('rightPane');
      const splitter = document.getElementById('mainSplitter');

      // Reset all panels
      if (swarmSidebar) swarmSidebar.style.display = 'none';
      if (gptOpinionPanel) gptOpinionPanel.style.display = 'none';
      if (chatContainer) chatContainer.classList.remove('swarm-mode');

      // Get toggle icons container
      const chatModeToggles = document.getElementById('chatModeToggles');

      // Configure layout based on mode
      switch (modeName) {
        case CHAT_MODES.SOLO:
          // Solo: 50/50 split - chat left, flow right
          if (primaryPanel) primaryPanel.style.flex = '1';
          if (rightPane) {
            rightPane.style.display = 'flex';
            rightPane.style.flex = '1 1 50%';
            setRightPanelMode('flow');
          }
          if (splitter) splitter.style.display = 'none';
          if (contextFlowPanel) contextFlowPanel.style.display = 'none';
          if (chatModeToggles) chatModeToggles.style.display = 'none';
          break;

        case CHAT_MODES.SWARM:
          // Swarm: 50/50 split - chat left, swarm workers right
          if (chatContainer) chatContainer.classList.add('swarm-mode');
          if (primaryPanel) primaryPanel.style.flex = '1';
          if (swarmSidebar) swarmSidebar.style.display = 'none'; // Hide old sidebar
          if (rightPane) {
            rightPane.style.display = 'flex';
            rightPane.style.flex = '1 1 50%';
            rightPane.setAttribute('data-panel-mode', 'swarm'); // Show swarm panel
          }
          if (splitter) splitter.style.display = 'none';
          if (contextFlowPanel) contextFlowPanel.style.display = 'none';
          if (chatModeToggles) chatModeToggles.style.display = 'none';
          break;
      }

      // Notify extension of mode change
      vscode.postMessage({ type: 'setChatMode', chatMode: modeName });
    };

    /**
     * Update chat mode switcher visibility (visible only in Chat tab)
     */
    function updateChatModeSwitcherVisibility() {
      const switcher = document.getElementById('chatModeSwitcher');
      if (switcher) {
        // Only show chat mode switcher on Chat tab (not Station)
        switcher.style.display = (currentTab === TABS.CHAT) ? 'block' : 'none';
      }
    }

    // Legacy alias for backward compatibility
    function updateMastermindConfigVisibility() {
      updateChatModeSwitcherVisibility();
    }

    /**
     * Get GPT's second opinion on Claude's last response
     * Switches to Opinion panel mode and requests GPT to review
     */
    window.getGptOpinion = function() {
      // Switch right panel to opinion mode
      setRightPanelMode('opinion');

      const loading = document.getElementById('opinionLoading');
      const gptResponse = document.getElementById('opinionGptResponse');
      const userQuestionEl = document.getElementById('opinionUserQuestion');
      const claudeResponseEl = document.getElementById('opinionClaudeResponse');

      // Show loading state
      if (loading) loading.style.display = 'flex';
      if (gptResponse) gptResponse.innerHTML = '';

      // Get the last Claude response from chat
      const messages = document.querySelectorAll('#chatMessages .message.claude, #chatMessages .message.assistant');
      const lastClaudeMessage = messages[messages.length - 1];

      if (!lastClaudeMessage) {
        if (loading) loading.style.display = 'none';
        if (gptResponse) gptResponse.innerHTML = '<p class="no-response">No Claude response to review. Send a message first.</p>';
        return;
      }

      const claudeResponse = lastClaudeMessage.querySelector('.message-content')?.textContent || '';

      // Get the user's original question
      const userMessages = document.querySelectorAll('#chatMessages .message.user');
      const lastUserMessage = userMessages[userMessages.length - 1];
      const userQuestion = lastUserMessage?.querySelector('.message-content')?.textContent || '';

      // Build recent chat history for GPT context (up to last Claude response)
      const allMessages = Array.from(document.querySelectorAll('#chatMessages .message'));
      const lastClaudeIndex = allMessages.indexOf(lastClaudeMessage);
      const historySlice = lastClaudeIndex >= 0 ? allMessages.slice(0, lastClaudeIndex + 1) : allMessages;
      const rawHistory = historySlice.map((el) => {
        const content = el.querySelector('.message-content')?.textContent || '';
        let role = 'assistant';
        if (el.classList.contains('user')) role = 'user';
        else if (el.classList.contains('claude')) role = 'claude';
        else if (el.classList.contains('gpt')) role = 'gpt';
        else if (el.classList.contains('summary')) role = 'summary';
        else if (el.classList.contains('system')) role = 'system';
        return { role, content };
      }).filter((m) => m.content && m.content.trim().length);

      // Prune history to a safe size
      const maxTotalChars = 8000;
      const maxEntryChars = 1200;
      let total = 0;
      const prunedHistory = [];
      for (let i = rawHistory.length - 1; i >= 0; i -= 1) {
        const entry = rawHistory[i];
        let content = entry.content.trim();
        if (content.length > maxEntryChars) {
          content = content.slice(0, maxEntryChars) + '...';
        }
        if (total + content.length > maxTotalChars && total > 0) break;
        total += content.length;
        prunedHistory.push({ role: entry.role, content });
      }
      prunedHistory.reverse();

      // Update context display
      if (userQuestionEl) userQuestionEl.textContent = userQuestion || '-';
      if (claudeResponseEl) claudeResponseEl.textContent = claudeResponse.substring(0, 200) + (claudeResponse.length > 200 ? '...' : '');

      // Request GPT opinion
      vscode.postMessage({
        type: 'getGptOpinion',
        userQuestion,
        claudeResponse,
        chatHistory: prunedHistory,
      });
    };

    /**
     * Refresh GPT opinion (request a new opinion on the same content)
     */
    window.refreshGptOpinion = function() {
      window.getGptOpinion();
    };

    /**
     * Close the GPT opinion panel (switch back based on active tab)
     */
    window.closeGptOpinion = function() {
      setRightPanelMode(currentTab === TABS.CHAT ? 'flow' : 'station');
    };

    /**
     * Show the GPT Opinion button after Claude responds
     */
    function showGptOpinionButton() {
      const btn = document.getElementById('gptOpinionBtn');
      if (btn && currentChatMode === CHAT_MODES.SOLO) {
        btn.style.display = 'inline-flex';
      }
    }

    /**
     * Hide the GPT Opinion button
     */
    function hideGptOpinionButton() {
      const btn = document.getElementById('gptOpinionBtn');
      if (btn) {
        btn.style.display = 'none';
      }
    }

    // Logs dropdown function
    function toggleLogsDropdown() {
      const dropdown = document.getElementById('logsDropdown');
      dropdown.classList.toggle('visible');
    }

    // Unity MCP connection check - syncs header, MCP settings, and Unity tab
    function checkUnityConnection() {
      const statusEl = document.getElementById('unity-status');
      if (statusEl) {
        const dotEl = statusEl.querySelector('.status-dot');
        if (dotEl) {
          dotEl.className = 'status-dot checking';
          statusEl.title = 'Unity MCP: Checking...';
        }
      }
      // Use unified connection check that syncs all status indicators
      vscode.postMessage({ type: 'unityCheckConnection' });
    }

    function updateUnityMCPStatus(connected) {
      console.log('[SpaceCode UI] updateUnityMCPStatus called with:', connected);
      // Update the shared connection state
      unityConnected = connected;

      const statusEl = document.getElementById('unity-status');
      if (!statusEl) {
        console.error('[SpaceCode UI] unity-status element not found');
        return;
      }
      const dotEl = statusEl.querySelector('.status-dot');
      if (!dotEl) {
        console.error('[SpaceCode UI] status-dot element not found');
        return;
      }
      if (connected) {
        dotEl.className = 'status-dot connected';
        statusEl.title = 'Unity: Connected - Click to reload assets';
      } else if (connected === false) {
        dotEl.className = 'status-dot disconnected';
        statusEl.title = 'Unity: Disconnected - Click to check status';
      } else {
        // Unknown state
        dotEl.className = 'status-dot checking';
        statusEl.title = 'Unity: Click to check status';
      }
      console.log('[SpaceCode UI] Updated unity-status dot to:', dotEl.className);
    }

    // Unity connection: User clicks header button to connect (no auto-connect on load)

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
        'collaborate': 'Claude and GPT work together to solve a problem, building on each other\'s ideas.',
        'code-review': 'Claude and GPT will independently review code, then discuss each other\'s feedback.',
        'debate': 'Claude argues FOR, GPT argues AGAINST the topic. They\'ll exchange rebuttals.'
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
      const icons = {
        'chat': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"></path></svg>',
        'agent': '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="8" width="18" height="10" rx="2"></rect><circle cx="9" cy="13" r="1.5"></circle><circle cx="15" cy="13" r="1.5"></circle><path d="M12 8V5"></path><circle cx="12" cy="4" r="1"></circle></svg>',
        'agent-full': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L3 14h7l-1 8 10-12h-7z"></path></svg>'
      };

      document.getElementById('selectedModeLabel').textContent = labels[mode];
      document.getElementById('modeIcon').innerHTML = icons[mode];

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

    // Consultant model (for GPT Opinion feature)
    let selectedConsultant = 'gpt-4o';

    window.selectConsultant = function(model) {
      selectedConsultant = model;

      const modelLabels = {
        'gpt-4o': 'GPT-4o',
        'gpt-4o-mini': 'GPT-4o Mini',
        'gpt-5.2-codex': 'GPT-5.2-Codex',
        'o1': 'o1 (Reasoning)'
      };

      document.getElementById('selectedConsultantLabel').textContent = modelLabels[model] || model;

      ['gpt-4o', 'gpt-4o-mini', 'gpt-5.2-codex', 'o1'].forEach(m => {
        const checkEl = document.getElementById('consultantCheck-' + m);
        if (checkEl) checkEl.textContent = m === model ? '✓' : '';
      });

      document.getElementById('consultantDropdown').classList.remove('visible');
      vscode.postMessage({ type: 'setConsultantModel', model: selectedConsultant });
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
      const panel = document.getElementById(`panel-${panelName}`);
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

      // Determine provider based on chat mode and model selection
      // Solo: use selected model (claude or gpt)
      // Consult: claude primary, gpt secondary
      // Swarm: uses swarm coordinator
      const provider = selectedModel?.provider || 'claude';

      vscode.postMessage({
        type: 'sendMessage',
        text,
        mode: provider, // Provider for API call (claude/gpt)
        chatMode: currentChatMode, // Chat mode (solo/consult/swarm)
        includeSelection,
        injectContext,
        docTarget: docTargetValue,
        profile: profileValue,
        sectorId: shipSelectedSectorId,
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

    // Toolbar action handlers
    function handleGitAction() {
      const repoUrl = document.getElementById('gitRepoUrl')?.value || '';
      const branch = document.getElementById('gitBranch')?.value || 'main';
      const commitMessage = document.getElementById('gitCommitMessage')?.value || '';
      const autoPush = document.getElementById('gitAutoPush')?.checked !== false;

      if (!repoUrl) {
        vscode.postMessage({
          type: 'showError',
          message: 'Please configure Git settings first (Settings → Git Settings)'
        });
        return;
      }

      vscode.postMessage({
        type: 'gitAction',
        settings: { repoUrl, branch, commitMessage, autoPush }
      });
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
      container.innerHTML = attachedImages.map((img, index) => `
        <div class="attached-image">
          <img src="${img}" alt="Attached">
          <button class="remove-image" onclick="removeImage(${index})">×</button>
        </div>
      `).join('');

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
      notice.innerHTML = `
        <div class="compaction-header">
          <span class="compaction-icon">📋</span>
          <strong>Conversation Compacted</strong>
        </div>
        <div class="compaction-details">
          <p>This session is being continued from a previous conversation that ran out of context.
          The summary below covers the earlier portion of the conversation.</p>
          <details>
            <summary>View Summary (${originalCount} messages summarized)</summary>
            <div class="compaction-summary">${summary}</div>
          </details>
        </div>
      `;
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

      container.innerHTML = `
        <div class="cli-status-card">
          <div class="cli-status-info">
            <div class="cli-status-icon claude">C</div>
            <div class="cli-status-details">
              <h4>Claude CLI</h4>
              <div class="cli-status-badges">
                ${status.claude.installed
                  ? `<span class="cli-badge installed">Installed ${status.claude.version || ''}</span>`
                  : '<span class="cli-badge not-installed">Not Installed</span>'
                }
                ${status.claude.installed && status.claude.loggedIn
                  ? '<span class="cli-badge logged-in">Logged In</span>'
                  : status.claude.installed
                    ? '<span class="cli-badge not-logged-in">Not Logged In</span>'
                    : ''
                }
              </div>
            </div>
          </div>
          <div class="cli-status-actions">
            ${!status.claude.installed
              ? '<button class="btn-primary" onclick="installCli(\'claude\')">Install</button>'
              : !status.claude.loggedIn
                ? '<button class="btn-primary" onclick="loginCli(\'claude\')">Login</button>'
                : '<button class="btn-secondary" onclick="loginCli(\'claude\')">Re-login</button>'
            }
          </div>
        </div>

        <div class="cli-status-card">
          <div class="cli-status-info">
            <div class="cli-status-icon codex">G</div>
            <div class="cli-status-details">
              <h4>Codex CLI (GPT)</h4>
              <div class="cli-status-badges">
                ${status.codex.installed
                  ? `<span class="cli-badge installed">Installed ${status.codex.version || ''}</span>`
                  : '<span class="cli-badge not-installed">Not Installed</span>'
                }
                ${status.codex.installed && status.codex.loggedIn
                  ? '<span class="cli-badge logged-in">Ready</span>'
                  : status.codex.installed
                    ? '<span class="cli-badge not-logged-in">Auth Required</span>'
                    : ''
                }
              </div>
            </div>
          </div>
          <div class="cli-status-actions">
            ${!status.codex.installed
              ? '<button class="btn-primary" onclick="installCli(\'codex\')">Install</button>'
              : '<button class="btn-secondary" onclick="loginCli(\'codex\')">Auth</button>'
            }
          </div>
        </div>

        <p class="method-description" style="margin-top: 8px;">
          <strong>Install commands:</strong><br>
          Claude: <code>npm install -g @anthropic-ai/claude-code</code><br>
          Codex: <code>npm install -g @openai/codex</code>
        </p>
      `;
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

      return `
        <div class="message ${role}">
          <div class="message-header">
            <div class="message-avatar ${role}">${avatar}</div>
            <span class="message-sender">${sender}</span>
            <span class="message-time">${new Date().toLocaleTimeString()}</span>
          </div>
          <div class="message-content">${escapeHtml(content)}</div>
          ${meta.tokens ? `
            <div class="message-meta">
              <span>${meta.tokens.input + meta.tokens.output} tokens</span>
              <span>$${meta.cost?.toFixed(4) || '0.0000'}</span>
            </div>
          ` : ''}
        </div>
      `;
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
        const html = `
          <div class="message assistant ${providerClass}" id="streaming-msg-${chatId}">
            <div class="message-header">
              <span class="provider-badge ${providerClass}">${providerLabel}</span>
              <span class="streaming-indicator">● Streaming...</span>
            </div>
            <div class="message-content" id="streaming-content-${chatId}"></div>
          </div>
        `;
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
      document.getElementById('chatMessages').innerHTML = `
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
      `;
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

    function saveGitSettings() {
      const repoUrl = document.getElementById('gitRepoUrl').value;
      const branch = document.getElementById('gitBranch').value || 'main';
      const commitMessage = document.getElementById('gitCommitMessage').value;
      const autoPush = document.getElementById('gitAutoPush').checked;
      vscode.postMessage({
        type: 'saveGitSettings',
        settings: { repoUrl, branch, commitMessage, autoPush }
      });
    }

    function loadGitSettings(settings) {
      const repoUrlInput = document.getElementById('gitRepoUrl');
      const branchInput = document.getElementById('gitBranch');
      const commitInput = document.getElementById('gitCommitMessage');
      const autoPushInput = document.getElementById('gitAutoPush');
      if (!repoUrlInput || !branchInput || !commitInput || !autoPushInput) {
        return;
      }

      if (settings) {
        // Set input values
        repoUrlInput.value = settings.repoUrl || '';
        branchInput.value = settings.branch || '';
        commitInput.value = settings.commitMessage || '';
        autoPushInput.checked = settings.autoPush !== false;

        // Show source indicators and detected values
        const repoUrlSource = document.getElementById('gitRepoUrlSource');
        const branchSource = document.getElementById('gitBranchSource');
        const repoUrlDetected = document.getElementById('gitRepoUrlDetected');
        const branchDetected = document.getElementById('gitBranchDetected');

        if (settings.hasRepoUrlOverride) {
          repoUrlSource.textContent = '(overridden)';
          repoUrlSource.style.color = '#f59e0b';
          repoUrlDetected.textContent = settings.detectedRepoUrl ? 'Detected: ' + settings.detectedRepoUrl : '';
        } else if (settings.detectedRepoUrl) {
          repoUrlSource.textContent = '(auto-detected)';
          repoUrlSource.style.color = '#22c55e';
          repoUrlDetected.textContent = '';
        } else {
          repoUrlSource.textContent = '(not detected)';
          repoUrlSource.style.color = 'var(--text-secondary)';
          repoUrlDetected.textContent = '';
        }

        if (settings.hasBranchOverride) {
          branchSource.textContent = '(overridden)';
          branchSource.style.color = '#f59e0b';
          branchDetected.textContent = settings.detectedBranch ? 'Detected: ' + settings.detectedBranch : '';
        } else if (settings.detectedBranch) {
          branchSource.textContent = '(auto-detected)';
          branchSource.style.color = '#22c55e';
          branchDetected.textContent = '';
        } else {
          branchSource.textContent = '';
          branchDetected.textContent = '';
        }
      }
    }

    function clearGitOverrides() {
      // Clear the override values and request refresh
      vscode.postMessage({
        type: 'saveGitSettings',
        settings: { repoUrl: '', branch: '', commitMessage: '', autoPush: true }
      });
      // Request fresh settings to show detected values
      setTimeout(() => {
        vscode.postMessage({ type: 'getSettings' });
      }, 100);
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

    function reloadPanel() {
      vscode.postMessage({ type: 'reloadPanel' });
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
          ? ' <a href="#" class="token-bar-link" onclick="openPricing(\'' + costDisplay.provider + '\')">pricing</a>'
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

    // --- Tickets Panel Functions (Main Panel) ---
    let mainTicketList = [];
    let mainTicketFilter = 'all';

    function showTicketsPanel() {
      // Hide chat section and agents section, show tickets section
      document.getElementById('chatSection').style.display = 'none';
      document.getElementById('agentsSection').style.display = 'none';
      document.getElementById('ticketsSection').style.display = 'flex';

      // Remove active from mode buttons, add to tickets
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      const ticketsBtn = document.querySelector('.mode-btn.tickets');
      if (ticketsBtn) ticketsBtn.classList.add('active');

      // Request tickets from extension
      vscode.postMessage({ type: 'getTickets' });
    }

    function hideTicketsPanel() {
      document.getElementById('ticketsSection').style.display = 'none';
      document.getElementById('chatSection').style.display = 'flex';
    }

    function toggleTicketFormMain() {
      const formPanel = document.getElementById('ticketFormPanel');
      if (formPanel) {
        const isVisible = formPanel.style.display !== 'none';
        formPanel.style.display = isVisible ? 'none' : 'block';
        if (!isVisible) {
          // Populate plan dropdown with existing plans
          const planSelect = document.getElementById('ticketPlanLinkMain');
          if (planSelect && Array.isArray(planList)) {
            planSelect.innerHTML = '<option value="">(no plan)</option>' +
              planList.map(p => '<option value="' + p.id + '">' + escapeHtml(p.summary || p.intent || p.id) + '</option>').join('');
          }
        }
      }
    }

    function createTicketMain() {
      const titleEl = document.getElementById('ticketTitleMain');
      const descEl = document.getElementById('ticketDescriptionMain');
      const sectorEl = document.getElementById('ticketSectorMain');
      const planEl = document.getElementById('ticketPlanLinkMain');

      const title = titleEl ? titleEl.value.trim() : '';
      if (!title) {
        shipSetStatus('Ticket title is required.');
        return;
      }

      vscode.postMessage({
        type: 'createTicket',
        title: title,
        description: descEl ? descEl.value.trim() : '',
        sectorId: sectorEl ? sectorEl.value : 'general',
        linkedPlanId: planEl && planEl.value ? planEl.value : undefined
      });

      // Clear form
      if (titleEl) titleEl.value = '';
      if (descEl) descEl.value = '';
      toggleTicketFormMain();
      shipSetStatus('Ticket created.');
    }

    function filterTickets(filter) {
      mainTicketFilter = filter;
      // Update filter button states
      document.querySelectorAll('.ticket-filters .filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
      });
      // Re-render with filtered list
      renderTicketsListMain(mainTicketList);
    }

    function renderTicketsListMain(tickets) {
      mainTicketList = tickets || [];
      const listEl = document.getElementById('ticketsListMain');
      if (!listEl) return;

      // Apply filter
      let filtered = mainTicketList;
      if (mainTicketFilter !== 'all') {
        filtered = mainTicketList.filter(t => t.status === mainTicketFilter);
      }

      if (!Array.isArray(filtered) || filtered.length === 0) {
        listEl.innerHTML = '<div class="empty-tickets"><div class="empty-icon">T</div><p>No tickets ' + (mainTicketFilter !== 'all' ? 'with status "' + mainTicketFilter + '"' : 'yet') + '</p><p class="empty-hint">Click "+ New Ticket" to create one</p></div>';
        return;
      }

      const statusColors = { 'open': '#3b82f6', 'in-progress': '#f59e0b', 'done': '#22c55e' };
      const statusLabels = { 'open': 'Open', 'in-progress': 'In Progress', 'done': 'Done' };

      listEl.innerHTML = filtered.map(t => {
        const statusColor = statusColors[t.status] || '#6b7280';
        const statusLabel = statusLabels[t.status] || t.status;
        const nextStatus = t.status === 'open' ? 'in-progress' : (t.status === 'in-progress' ? 'done' : null);
        const nextLabel = nextStatus ? statusLabels[nextStatus] : '';
        const planInfo = t.linkedPlanId ? '<span class="ticket-plan-badge">Plan linked</span>' : '';
        const descSnippet = t.description ? escapeHtml(t.description).substring(0, 120) + (t.description.length > 120 ? '...' : '') : '';
        const sectorLabel = t.sectorId || 'general';

        let html = '<div class="ticket-card" data-status="' + t.status + '">';
        html += '<div class="ticket-card-header">';
        html += '<span class="ticket-title">' + escapeHtml(t.title) + '</span>';
        html += '<span class="ticket-status" style="background:' + statusColor + '22; color:' + statusColor + '; border-color:' + statusColor + '44;">' + statusLabel + '</span>';
        html += '</div>';
        if (descSnippet) {
          html += '<div class="ticket-description">' + descSnippet + '</div>';
        }
        html += '<div class="ticket-meta">';
        html += '<span class="ticket-sector">' + escapeHtml(sectorLabel) + '</span>';
        html += planInfo;
        html += '</div>';
        html += '<div class="ticket-actions">';
        if (nextStatus) {
          html += '<button data-ticket-id="' + t.id + '" data-next-status="' + nextStatus + '" class="ticket-action-btn primary">Move to ' + nextLabel + '</button>';
        }
        html += '<button data-ticket-delete="' + t.id + '" class="ticket-action-btn danger">Delete</button>';
        html += '</div></div>';
        return html;
      }).join('');

      // Attach event listeners using delegation
      listEl.querySelectorAll('.ticket-action-btn.primary').forEach(btn => {
        btn.onclick = function() {
          updateTicketStatus(this.dataset.ticketId, this.dataset.nextStatus);
        };
      });
      listEl.querySelectorAll('.ticket-action-btn.danger').forEach(btn => {
        btn.onclick = function() {
          deleteTicket(this.dataset.ticketDelete);
        };
      });
    }

    // --- Skills Panel Functions ---
    let skillsList = [];
    let skillsFilter = 'all';

    window.refreshSkills = function() {
      vscode.postMessage({ type: 'getSkills' });
    };

    window.createSkill = function() {
      vscode.postMessage({ type: 'openSkillCreator' });
    };

    window.filterSkills = function(category) {
      skillsFilter = category;
      document.querySelectorAll('.skills-categories .category-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === category);
      });
      renderSkillsList(skillsList);
    };

    function renderSkillsList(skills) {
      skillsList = skills || [];
      const listEl = document.getElementById('skillsList');
      if (!listEl) return;

      let filtered = skillsList;
      if (skillsFilter !== 'all') {
        filtered = skillsList.filter(s => s.category === skillsFilter);
      }

      if (!Array.isArray(filtered) || filtered.length === 0) {
        listEl.innerHTML = '<div class="empty-skills"><div class="empty-icon">⚡</div><p>No skills ' + (skillsFilter !== 'all' ? 'in "' + skillsFilter + '" category' : 'yet') + '</p><p class="empty-hint">Skills let you save and reuse common AI tasks</p></div>';
        return;
      }

      listEl.innerHTML = filtered.map(s => {
        return '<div class="skill-card" data-skill-id="' + s.id + '">' +
          '<div class="skill-header">' +
          '<span class="skill-name">' + escapeHtml(s.name) + '</span>' +
          '<span class="skill-category">' + escapeHtml(s.category || 'custom') + '</span>' +
          '</div>' +
          '<div class="skill-description">' + escapeHtml(s.description || '') + '</div>' +
          '<div class="skill-actions">' +
          '<button class="btn-primary btn-sm" onclick="runSkill(\'' + s.id + '\')">Run</button>' +
          '<button class="btn-secondary btn-sm" onclick="editSkill(\'' + s.id + '\')">Edit</button>' +
          '</div>' +
          '</div>';
      }).join('');
    }

    window.runSkill = function(skillId) {
      vscode.postMessage({ type: 'runSkill', skillId });
    };

    window.editSkill = function(skillId) {
      vscode.postMessage({ type: 'editSkill', skillId });
    };

    // --- Dashboard Panel Functions ---
    let dashboardMetrics = {};
    let activityList = [];

    window.refreshDashboard = function() {
      vscode.postMessage({ type: 'getDashboardMetrics' });
      vscode.postMessage({ type: 'getTickets' });
      vscode.postMessage({ type: 'getRecentActivity' });
    };

    function updateDashboardMetrics(metrics) {
      dashboardMetrics = metrics || {};
      const ticketsEl = document.getElementById('metricTicketsOpen');
      const plansEl = document.getElementById('metricPlansActive');
      const agentsEl = document.getElementById('metricAgentsRunning');
      const tokensEl = document.getElementById('metricTokensToday');

      if (ticketsEl) ticketsEl.textContent = metrics.openTickets || 0;
      if (plansEl) plansEl.textContent = metrics.activePlans || 0;
      if (agentsEl) agentsEl.textContent = metrics.runningAgents || 0;
      if (tokensEl) tokensEl.textContent = formatNumber(metrics.tokensToday || 0);
    }

    function formatNumber(num) {
      if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
      if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
      return num.toString();
    }

    function renderActivityList(activities) {
      activityList = activities || [];
      const listEl = document.getElementById('activityList');
      if (!listEl) return;

      if (!Array.isArray(activityList) || activityList.length === 0) {
        listEl.innerHTML = '<div class="empty-activity"><p>No recent activity</p></div>';
        return;
      }

      listEl.innerHTML = activityList.slice(0, 10).map(a => {
        const timeAgo = formatTimeAgo(a.timestamp);
        return '<div class="activity-item">' +
          '<span class="activity-icon">' + getActivityIcon(a.type) + '</span>' +
          '<span class="activity-text">' + escapeHtml(a.message) + '</span>' +
          '<span class="activity-time">' + timeAgo + '</span>' +
          '</div>';
      }).join('');
    }

    function getActivityIcon(type) {
      const icons = {
        'chat': '💬',
        'plan': '📋',
        'ticket': '🎫',
        'agent': '🤖',
        'build': '🔨',
        'error': '❌',
        'success': '✅',
      };
      return icons[type] || '📌';
    }

    function formatTimeAgo(timestamp) {
      const now = Date.now();
      const diff = now - timestamp;
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);

      if (minutes < 1) return 'just now';
      if (minutes < 60) return minutes + 'm ago';
      if (hours < 24) return hours + 'h ago';
      return days + 'd ago';
    }

    function renderTicketsSummary(tickets) {
      const summaryEl = document.getElementById('ticketsSummary');
      if (!summaryEl) return;

      const openCount = (tickets || []).filter(t => t.status === 'open').length;
      const inProgressCount = (tickets || []).filter(t => t.status === 'in-progress').length;
      const doneCount = (tickets || []).filter(t => t.status === 'done').length;

      summaryEl.innerHTML = '<div class="tickets-summary-row">' +
        '<span class="summary-item"><span class="summary-dot open"></span>Open: ' + openCount + '</span>' +
        '<span class="summary-item"><span class="summary-dot in-progress"></span>In Progress: ' + inProgressCount + '</span>' +
        '<span class="summary-item"><span class="summary-dot done"></span>Done: ' + doneCount + '</span>' +
        '</div>';
    }

    function initDrawflow() {
      const container = document.getElementById('drawflowCanvas');
      if (!container) return;

      // We'll use a simple custom implementation since Drawflow requires DOM manipulation
      // that's complex in a webview. For now, create a placeholder canvas.
      container.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; height: 100%; flex-direction: column; color: var(--text-secondary);">
          <div style="font-size: 48px; margin-bottom: 16px;">🔧</div>
          <p>Drag nodes from the left panel to create your workflow</p>
          <p style="font-size: 12px; margin-top: 8px;">Connect nodes by dragging from outputs to inputs</p>
        </div>
      `;

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
      nodeEl.style.cssText = `
        position: absolute;
        left: ${x - 80}px;
        top: ${y - 30}px;
        min-width: 160px;
        background: var(--bg-secondary);
        border: 2px solid ${colors[type]};
        border-radius: 8px;
        cursor: move;
        user-select: none;
      `;
      nodeEl.innerHTML = `
        <div style="padding: 12px 16px; display: flex; align-items: center; gap: 8px;">
          <span>${icons[type]}</span>
          <span>${labels[type]}</span>
        </div>
        ${type !== 'input' ? '<div class="node-input" style="position: absolute; left: -8px; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; background: var(--accent-color); border-radius: 50%; cursor: crosshair;"></div>' : ''}
        ${type !== 'output' ? '<div class="node-output" style="position: absolute; right: -8px; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; background: var(--accent-color); border-radius: 50%; cursor: crosshair;"></div>' : ''}
      `;

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
        configHtml = `
          <div class="config-field">
            <label>Provider</label>
            <select id="nodeProvider" onchange="updateNodeConfig()">
              <option value="claude" ${config.provider === 'claude' ? 'selected' : ''}>Claude</option>
              <option value="gpt" ${config.provider === 'gpt' ? 'selected' : ''}>GPT</option>
            </select>
          </div>
          <div class="config-field">
            <label>System Prompt</label>
            <textarea id="nodeSystemPrompt" onchange="updateNodeConfig()" placeholder="Enter system prompt...">${config.systemPrompt || ''}</textarea>
          </div>
        `;
      } else {
        const config = nodeData.config || {};
        configHtml = `
          <div class="config-field">
            <label>Label</label>
            <input type="text" id="nodeLabel" value="${config.label || ''}" onchange="updateNodeConfig()">
          </div>
        `;
      }

      configHtml += `
        <div style="margin-top: 20px;">
          <button class="btn-secondary" onclick="deleteSelectedNode()" style="width: 100%; color: var(--error-text);">Delete Node</button>
        </div>
      `;

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
      canvas.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; height: 100%; flex-direction: column; color: var(--text-secondary);">
          <div style="font-size: 48px; margin-bottom: 16px;">🔧</div>
          <p>Drag nodes from the left panel to create your workflow</p>
          <p style="font-size: 12px; margin-top: 8px;">Connect nodes by dragging from outputs to inputs</p>
        </div>
      `;
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
          nodeEl.style.cssText = `
            position: absolute;
            left: ${node.x || node.posX || 100}px;
            top: ${node.y || node.posY || 100}px;
            min-width: 160px;
            background: var(--bg-secondary);
            border: 2px solid ${colors[node.type]};
            border-radius: 8px;
            cursor: move;
            user-select: none;
          `;
          nodeEl.innerHTML = `
            <div style="padding: 12px 16px; display: flex; align-items: center; gap: 8px;">
              <span>${icons[node.type]}</span>
              <span>${labels[node.type]}</span>
            </div>
            ${node.type !== 'input' ? '<div class="node-input" style="position: absolute; left: -8px; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; background: var(--accent-color); border-radius: 50%;"></div>' : ''}
            ${node.type !== 'output' ? '<div class="node-output" style="position: absolute; right: -8px; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; background: var(--accent-color); border-radius: 50%;"></div>' : ''}
          `;

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
          id: `conn-${i}`,
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

      listEl.innerHTML = workflows.map(w => `
        <div class="workflow-item ${w.id === currentWorkflowId ? 'active' : ''}" data-id="${w.id}" onclick="loadWorkflow('${w.id}')">
          <span class="workflow-item-name">${escapeHtml(w.name)}</span>
          <span class="workflow-item-delete" onclick="event.stopPropagation(); deleteWorkflow('${w.id}')">🗑️</span>
        </div>
      `).join('');
    }

    // Handle messages from extension
    window.addEventListener('message', event => {
      const msg = event.data;

      switch (msg.type) {
        case 'info':
          // Display info messages in status bar
          if (msg.message) {
            shipSetStatus(msg.message);
            console.log('[SpaceCode UI] Info:', msg.message);
            // Re-enable buttons and reset Unity status if this is a Unity-related message
            if (msg.message.toLowerCase().includes('unity')) {
              setUnityButtonsLoading(false);
              const statusEl = document.getElementById('unityStatus');
              if (statusEl && (statusEl.textContent === '● Loading...' || statusEl.textContent === '● Running...')) {
                statusEl.className = 'unity-status connected';
                statusEl.textContent = '● Connected';
                unityConnected = true;
                updateUnityMCPStatus(true);
              }
            }
          }
          break;

        case 'error':
          // Display error messages in status bar with error styling
          if (msg.message) {
            shipSetStatus('Error: ' + msg.message);
            console.error('[SpaceCode UI] Error:', msg.message);
            // Re-enable buttons on Unity-related errors
            const msgLower = msg.message.toLowerCase();
            if (msgLower.includes('unity') || msgLower.includes('coplay') || msgLower.includes('mcp') || msgLower.includes('reload')) {
              setUnityButtonsLoading(false);
              // Only mark as Disconnected for actual connection failures, not command errors
              // Connection errors typically contain: "not connected", "connection", "failed to connect", "timed out"
              const isConnectionError = msgLower.includes('not connected') ||
                                        msgLower.includes('connection failed') ||
                                        msgLower.includes('failed to connect') ||
                                        (msgLower.includes('timed out') && !msgLower.includes('script'));
              if (isConnectionError) {
                const statusEl = document.getElementById('unityStatus');
                if (statusEl) {
                  statusEl.className = 'unity-status disconnected';
                  statusEl.textContent = '● Disconnected';
                  unityConnected = false;
                  updateUnityMCPStatus(false);
                }
              }
            }
          }
          break;

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
            // Update AI Flow response node (estimate ~4 chars per token)
            if (typeof updateResponseNode === 'function' && msg.chunk) {
              const estimatedTokens = Math.ceil(msg.chunk.length / 4);
              updateResponseNode(estimatedTokens);
              // Also update live response text in the new UI
              if (typeof updateLiveResponseText === 'function') {
                updateLiveResponseText(msg.chunk, flowAnimState?.responseTokens || estimatedTokens);
              }
            }
          }
          break;

        case 'status':
          document.getElementById('statusText').textContent = msg.status.message;
          break;

        case 'complete':
          setGenerating(false, msg.chatId);
          // Update token bar for the chat that completed
          updateTokenBar(msg.chatId || currentChatId);
          // Safety: stop flow animations if aiFlowComplete didn't fire
          stopThreadAnimation();
          stopParticleSpawning();
          stopParticleFlow();
          // Show GPT Opinion button after Claude responds (Solo mode only)
          if (currentChatMode === CHAT_MODES.SOLO) {
            showGptOpinionButton();
          }
          break;

        case 'gptOpinionResponse':
          // Display GPT's second opinion in the Opinion panel (right pane)
          const opinionLoadingEl = document.getElementById('opinionLoading');
          const opinionGptEl = document.getElementById('opinionGptResponse');
          if (opinionLoadingEl) opinionLoadingEl.style.display = 'none';
          if (opinionGptEl) {
            opinionGptEl.innerHTML = formatMessageContent(msg.response);
          }
          break;

        case 'sideChatResponse':
          // Display response in the side chat panel
          handleSideChatResponse(msg.chatIndex, msg.response);
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

        case 'unityMCPAvailable':
          updateUnityMCPStatus(msg.available);
          break;

        case 'insertChatMessage':
          // Insert a message into the chat input and optionally send it
          const chatInputEl = document.getElementById('messageInput');
          if (chatInputEl) {
            chatInputEl.value = msg.message;
            if (msg.autoSend) {
              sendMessage();
            }
          } else {
            console.error('[SpaceCode] messageInput element not found');
          }
          break;

        case 'unityPanelUpdate':
          // Update Unity panel with info from Claude's response
          if (typeof updateUnityPanelInfo === 'function') {
            updateUnityPanelInfo(msg.info);
          }
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

        case 'whisperDownloadStarted': {
          const btn = document.getElementById('whisperBinaryDownloadBtn');
          if (btn) { btn.disabled = true; btn.textContent = 'Downloading...'; }
          break;
        }

        case 'whisperDownloadComplete': {
          const btn = document.getElementById('whisperBinaryDownloadBtn');
          if (btn) {
            btn.disabled = false;
            if (msg.success) {
              btn.textContent = '✓ Installed';
              btn.classList.add('success');
            } else {
              btn.textContent = 'Download Binary';
              // Show error in status area if exists
              const statusEl = document.getElementById('whisperStatus');
              if (statusEl && msg.error) {
                statusEl.textContent = 'Error: ' + msg.error;
                statusEl.style.color = 'var(--error-color)';
              }
            }
          }
          break;
        }

        case 'activeBreadcrumb': {
          const el = document.getElementById('codeBreadcrumb');
          if (el) {
            el.textContent = msg.breadcrumb || 'No active file';
            if (msg.filePath) el.title = msg.filePath;
          }
          break;
        }

	        // Ship UI messages
        case 'shipSelected':
          if (msg.sectorId) {
            shipSelectedSectorId = msg.sectorId;
            shipRender();
            updateStationLabels();
          }
          if (msg.profile) {
            shipProfile = msg.profile;
            const sel = document.getElementById('shipProfileSelect');
            if (sel) sel.value = msg.profile;
            updateStationLabels();
          }
          break;

        case 'shipSectorDetected':
          // Auto-detected sector from active file path
          if (msg.sectorId && msg.sectorId !== shipSelectedSectorId) {
            shipSelectedSectorId = msg.sectorId;
            shipSelectedSubId = null;
            shipRender();
            updateStationLabels();
            // Show detection status
            const fileName = msg.filePath ? msg.filePath.split('/').pop() : '';
            shipSetStatus('Auto-detected: ' + (msg.sectorName || msg.sectorId) + (fileName ? ' (from ' + fileName + ')' : ''));
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
          shipSetStatus((msg.ok ? 'Gates passed' : 'Gates failed'));
          // Update Verification section box
          const gatesBox = document.getElementById('gatesResult');
          const gatesStatus = document.getElementById('gatesResultStatus');
          const gatesContent = document.getElementById('gatesResultContent');
	          if (gatesBox && gatesStatus && gatesContent) {
	            gatesBox.style.display = 'block';
	            gatesStatus.textContent = msg.ok ? '✅ PASSED' : '❌ FAILED';
	            gatesStatus.style.color = msg.ok ? '#4caf50' : '#f44336';
	            gatesContent.textContent = msg.summary || 'No details';
	          }
	          // Update Control tab box (more visible!)
	          const ctrlBox = document.getElementById('controlGatesResult');
	          const ctrlStatus = document.getElementById('controlGatesStatus');
	          const ctrlContent = document.getElementById('controlGatesContent');
	          if (ctrlBox && ctrlStatus && ctrlContent) {
	            ctrlBox.style.display = 'block';
	            ctrlBox.style.borderLeftColor = msg.ok ? '#4caf50' : '#f44336';
	            ctrlStatus.textContent = msg.ok ? '✅ PASSED' : '❌ FAILED';
	            ctrlStatus.style.color = msg.ok ? '#4caf50' : '#f44336';
	            ctrlContent.textContent = msg.summary || 'No details';
          }
          break;

        case 'shipDocsStatus':
          shipSetStatus(msg.summary || 'Docs status updated.');
          break;

        case 'asmdefInventory':
          renderAsmdefInventory(msg.inventory || null);
          shipSetStatus('Asmdef inventory loaded.');
          break;

        case 'asmdefPolicyGenerated':
          shipSetStatus('Asmdef policy generated.');
          if (msg.policyPath) {
            addMessage('system', 'Asmdef policy generated at:\\n' + msg.policyPath);
          }
          // Refresh inventory to show policy info
          asmdefRefresh();
          break;

        case 'asmdefPolicyMode':
          shipSetStatus('Asmdef policy set to ' + (msg.mode || 'strict') + '.');
          if (msg.policyPath) {
            addMessage('system', 'Asmdef policy updated:\\n' + msg.policyPath);
          }
          asmdefRefresh();
          break;

        case 'asmdefPolicy':
          renderAsmdefPolicyEditor(msg);
          shipSetStatus('Asmdef policy loaded.');
          break;

        case 'asmdefPolicySaved':
          shipSetStatus('Asmdef policy saved.');
          if (msg.policyPath) {
            addMessage('system', 'Asmdef policy saved to:\\n' + msg.policyPath);
          }
          asmdefRefresh();
          break;

        case 'asmdefGuidsNormalized':
          if (msg.result) {
            const count = msg.result.replacements || 0;
            shipSetStatus(count ? ('Normalized ' + count + ' GUID refs.') : 'No GUID refs to normalize.');
            if (Array.isArray(msg.result.warnings) && msg.result.warnings.length) {
              addMessage('system', 'GUID normalize warnings:\\n' + msg.result.warnings.join('\\n'));
            }
          }
          asmdefRefresh();
          break;

        case 'asmdefGraph':
          renderAsmdefGraph(msg.graph || null);
          shipSetStatus('Asmdef graph loaded.');
          break;

        case 'asmdefCheckResult':
          renderAsmdefCheckResult(msg.result || null);
          shipSetStatus('Asmdef validation complete.');
          break;

        case 'coordinatorHealth': {
          if (msg.url) {
            const urlEl = document.getElementById('coordinatorUrlLabel');
            if (urlEl) urlEl.textContent = msg.url;
            const urlPanelEl = document.getElementById('coordinatorUrlLabelPanel');
            if (urlPanelEl) urlPanelEl.textContent = msg.url;
          }
          let healthIssue = 'none';
          if (!msg.ok) {
            healthIssue = msg.status === 'disabled' ? 'disabled' : 'disconnected';
          }
          const badge = document.getElementById('coordinatorStatusBadge');
          const badgePanel = document.getElementById('coordinatorStatusBadgePanel');
          if (badge) {
            badge.classList.remove('ok', 'bad', 'muted');
            if (msg.ok) {
              badge.textContent = 'Connected';
              badge.classList.add('ok');
              shipSetStatus('Coordinator connected.');
            } else if (msg.status === 'disabled') {
              badge.textContent = 'Disabled';
              badge.classList.add('muted');
              shipSetStatus('Coordinator disabled.');
            } else {
              badge.textContent = 'Disconnected';
              badge.classList.add('bad');
              shipSetStatus('Coordinator disconnected.');
              const key = 'coordinator-health:disconnected';
              if (lastCoordinatorToast !== key) {
                showToast('Coordinator disconnected.', 'error');
                lastCoordinatorToast = key;
              }
            }
          }
          if (badgePanel) {
            badgePanel.classList.remove('ok', 'bad', 'muted');
            if (msg.ok) {
              badgePanel.textContent = 'Connected';
              badgePanel.classList.add('ok');
            } else if (msg.status === 'disabled') {
              badgePanel.textContent = 'Disabled';
              badgePanel.classList.add('muted');
            } else {
              badgePanel.textContent = 'Disconnected';
              badgePanel.classList.add('bad');
            }
          }
          updateCoordinatorLastIssue('coordinatorLastIssue', healthIssue);
          updateCoordinatorLastIssue('coordinatorLastIssuePanel', healthIssue);
          break;
        }

        case 'coordinatorSync': {
          const sync = msg.sync || {};
          const status = msg.status || {};
          const policyEl = document.getElementById('coordinatorPolicySync');
          const invEl = document.getElementById('coordinatorInventorySync');
          const graphEl = document.getElementById('coordinatorGraphSync');
          if (policyEl) policyEl.textContent = formatRelativeTime(sync.policy);
          if (invEl) invEl.textContent = formatRelativeTime(sync.inventory);
          if (graphEl) graphEl.textContent = formatRelativeTime(sync.graph);
          const policyStatusEl = document.getElementById('coordinatorPolicyStatus');
          const invStatusEl = document.getElementById('coordinatorInventoryStatus');
          const graphStatusEl = document.getElementById('coordinatorGraphStatus');
          setCoordinatorPill(policyStatusEl, status.policy || 'unknown');
          setCoordinatorPill(invStatusEl, status.inventory || 'unknown');
          setCoordinatorPill(graphStatusEl, status.graph || 'unknown');
          const policyPanelEl = document.getElementById('coordinatorPolicySyncPanel');
          const invPanelEl = document.getElementById('coordinatorInventorySyncPanel');
          const graphPanelEl = document.getElementById('coordinatorGraphSyncPanel');
          if (policyPanelEl) policyPanelEl.textContent = formatRelativeTime(sync.policy);
          if (invPanelEl) invPanelEl.textContent = formatRelativeTime(sync.inventory);
          if (graphPanelEl) graphPanelEl.textContent = formatRelativeTime(sync.graph);
          const policyStatusPanelEl = document.getElementById('coordinatorPolicyStatusPanel');
          const invStatusPanelEl = document.getElementById('coordinatorInventoryStatusPanel');
          const graphStatusPanelEl = document.getElementById('coordinatorGraphStatusPanel');
          setCoordinatorPill(policyStatusPanelEl, status.policy || 'unknown');
          setCoordinatorPill(invStatusPanelEl, status.inventory || 'unknown');
          setCoordinatorPill(graphStatusPanelEl, status.graph || 'unknown');
          updateCoordinatorSummary('coordinatorSummary', status);
          updateCoordinatorSummary('coordinatorSummaryPanel', status);
          const issues = ['policy', 'inventory', 'graph']
            .filter(k => status[k] && status[k] !== 'ok' && status[k] !== 'unknown');
          updateCoordinatorLastIssue('coordinatorLastIssue', issues.length ? issues.map(k => k + ':' + status[k]).join(', ') : 'none');
          updateCoordinatorLastIssue('coordinatorLastIssuePanel', issues.length ? issues.map(k => k + ':' + status[k]).join(', ') : 'none');
          if (issues.length) {
            const key = 'coordinator-sync:' + issues.map(k => k + '=' + status[k]).join(',');
            if (lastCoordinatorToast !== key) {
              showToast('Coordinator sync issues: ' + issues.map(k => k + ':' + status[k]).join(', '), 'warn');
              lastCoordinatorToast = key;
            }
          }
          break;
        }

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

        // AI Flow visualization messages (event-driven)
        case 'aiFlowStart':
          // New query - clear and show query node
          console.log('[SpaceCode] aiFlowStart:', msg.query);
          startAiFlow(msg.query, msg.queryTokens);
          // Update new UI: Set stage to "retrieving"
          setAiStage('retrieving', 'Retrieving context...');
          clearContextSources();
          hideLiveResponse();
          break;

        case 'aiFlowChunk':
          // Chunk found - animate fly-in
          console.log('[SpaceCode] aiFlowChunk:', msg.chunk);
          if (msg.chunk) {
            spawnFlowChunk(msg.chunk);
            // Add to context sources list with actual content
            addContextSourceCard(msg.chunk);
          }
          break;

        case 'aiFlowThinking':
          // AI is processing - show thinking pulse
          console.log('[SpaceCode] aiFlowThinking:', msg.stage, 'provider:', msg.provider);
          setFlowThinking(true, msg.stage, msg.provider);  // Pass provider for coloring
          // Update new UI: Set stage to "generating"
          setAiStage('generating', msg.stage || 'Generating response...');
          showLiveResponse();
          break;

        case 'aiFlowComplete':
          // AI done - stop all Fate Web animations
          console.log('[SpaceCode] aiFlowComplete, tokens:', msg.tokens);
          setFlowThinking(false);
          stopThreadAnimation();  // Stop thread dash animation
          stopParticleSpawning();
          stopParticleFlow();
          // Update header
          const phaseEl = document.getElementById('flowPanelPhase');
          if (phaseEl) phaseEl.textContent = msg.error ? 'Error' : 'Complete';
          break;

        case 'aiFlowUpdate':
          // Legacy: Full context snapshot (fallback)
          console.log('[SpaceCode] aiFlowUpdate (legacy):', msg.data);
          if (msg.data) {
            renderAiFlow(msg.data);
          }
          break;

        case 'aiFlowClear':
          // Clear the flow visualization (new conversation)
          clearAiFlow();
          break;

        case 'docTargets':
          populateDocTargets(Array.isArray(msg.targets) ? msg.targets : []);
          break;

        case 'docInfo':
          updateDocInfo(msg.info || null);
          break;

        case 'unityStatus':
          setUnityButtonsLoading(false);
          updateUnityStatus(msg.status || { connected: false }, msg.token);
          break;

        case 'unityConsole':
          updateUnityConsole(msg.messages || []);
          break;

        case 'unityLogs':
          // Display Unity logs in the console area
          console.log('[SpaceCode UI] Received unityLogs:', msg.logs);
          // Re-enable buttons and reset status indicator - we got a response
          setUnityButtonsLoading(false);
          {
            const statusEl = document.getElementById('unityStatus');
            if (statusEl && (statusEl.textContent === '● Loading...' || statusEl.textContent === '● Running...')) {
              statusEl.className = 'unity-status connected';
              statusEl.textContent = '● Connected';
              unityConnected = true;
              updateUnityMCPStatus(true);
            }
          }
          if (msg.logs) {
            let logs = [];
            // Handle different formats from Coplay MCP
            if (typeof msg.logs === 'string') {
              // String format - split by newlines
              logs = msg.logs.split('\\n').filter(l => l.trim()).map(l => {
                const isError = l.includes('Error') || l.includes('Exception');
                const isWarning = l.includes('Warning');
                return { type: isError ? 'Error' : isWarning ? 'Warning' : 'Log', message: l };
              });
            } else if (Array.isArray(msg.logs)) {
              // Array format - normalize each entry
              logs = msg.logs.map(l => {
                if (typeof l === 'string') {
                  const isError = l.includes('Error') || l.includes('Exception');
                  const isWarning = l.includes('Warning');
                  return { type: isError ? 'Error' : isWarning ? 'Warning' : 'Log', message: l };
                }
                return {
                  type: l.type === 'error' ? 'Error' : l.type === 'warning' ? 'Warning' : l.type === 'log' ? 'Log' : (l.type || 'Log'),
                  message: l.message || l.text || String(l)
                };
              });
            } else if (msg.logs.logs) {
              // Nested logs object
              logs = msg.logs.logs.map(l => ({
                type: l.logType === 'Error' ? 'Error' : l.logType === 'Warning' ? 'Warning' : 'Log',
                message: l.message || l.text || String(l)
              }));
            }
            console.log('[SpaceCode UI] Normalized logs:', logs);
            if (logs.length > 0) {
              updateUnityConsole(logs);
              shipSetStatus('Showing ' + logs.length + ' log entries');
            } else {
              shipSetStatus('No logs to display');
            }
          }
          break;

        case 'unityErrors':
          // Display Unity compile errors
          console.log('[SpaceCode UI] Received unityErrors:', msg);
          // Re-enable buttons and reset status indicator - we got a response
          setUnityButtonsLoading(false);
          {
            const statusEl = document.getElementById('unityStatus');
            if (statusEl && (statusEl.textContent === '● Loading...' || statusEl.textContent === '● Running...')) {
              statusEl.className = 'unity-status connected';
              statusEl.textContent = '● Connected';
              unityConnected = true;
              updateUnityMCPStatus(true);
            }
          }
          if (msg.hasErrors && msg.errors) {
            let errorMsgs = [];
            if (typeof msg.errors === 'string') {
              errorMsgs = [{ type: 'Error', message: msg.errors }];
            } else if (Array.isArray(msg.errors)) {
              errorMsgs = msg.errors.map(e => ({ type: 'Error', message: typeof e === 'string' ? e : (e.message || String(e)) }));
            }
            console.log('[SpaceCode UI] Showing', errorMsgs.length, 'compile errors');
            updateUnityConsole(errorMsgs);
            shipSetStatus('Found ' + errorMsgs.length + ' compile error(s)');
          } else {
            // Show success message in console too
            updateUnityConsole([{ type: 'Log', message: 'No compile errors - all clear!' }]);
            shipSetStatus('No compile errors in Unity');
          }
          break;

        // Verification messages
        case 'diffResult':
          updateDiffSummary(msg.diff || null);
          break;

        case 'planComparisonResult':
          updatePlanComparison(msg.result || null);
          break;

        case 'testResult':
          updateTestResult(msg);
          break;

        case 'planTemplates':
          planTemplates = Array.isArray(msg.templates) ? msg.templates : [];
          const templateSelect = document.getElementById('planTemplateSelect');
          if (templateSelect) {
            templateSelect.innerHTML = '<option value="">(no template)</option>';
            planTemplates.forEach(t => {
              const opt = document.createElement('option');
              opt.value = t.id;
              opt.textContent = t.name + ' (' + t.category + ')';
              templateSelect.appendChild(opt);
            });
          }
          shipSetStatus('Plan templates loaded.');
          break;

        case 'planList':
          planList = Array.isArray(msg.plans) ? msg.plans : [];
          renderPlanList(planList);
          break;

        case 'planGenerated':
          currentPlanData = msg.plan || null;
          renderPlanSummary(currentPlanData);
          const saveBtn = document.getElementById('savePlanBtn');
          const useBtn = document.getElementById('usePlanBtn');
          if (saveBtn) saveBtn.disabled = !currentPlanData;
          if (useBtn) useBtn.disabled = !currentPlanData;
          setPlanExecutionButtonsEnabled(!!currentPlanData);
          shipSetStatus('Plan generated.');
          break;

        case 'planLoaded':
          currentPlanData = msg.plan || null;
          renderPlanSummary(currentPlanData);
          const saveBtn2 = document.getElementById('savePlanBtn');
          const useBtn2 = document.getElementById('usePlanBtn');
          if (saveBtn2) saveBtn2.disabled = !currentPlanData;
          if (useBtn2) useBtn2.disabled = !currentPlanData;
          setPlanExecutionButtonsEnabled(!!currentPlanData);
          shipSetStatus(currentPlanData ? 'Plan loaded.' : 'Plan not found.');
          break;

        case 'planSaved':
          currentPlanData = msg.plan || currentPlanData;
          renderPlanSummary(currentPlanData);
          shipSetStatus('Plan saved.');
          break;

        case 'planError':
          shipSetStatus(msg.error || 'Plan error.');
          break;

        // Ticket messages
        case 'ticketList':
          ticketList = Array.isArray(msg.tickets) ? msg.tickets : [];
          renderTicketList(ticketList);
          renderTicketsListMain(ticketList);
          break;

        case 'ticketCreated':
        case 'ticketUpdated':
          // Refresh list is already sent from backend
          break;

        case 'ticketError':
          shipSetStatus(msg.error || 'Ticket error.');
          break;

        // Skills messages
        case 'skillsList':
          renderSkillsList(Array.isArray(msg.skills) ? msg.skills : []);
          break;

        case 'skillCreated':
        case 'skillUpdated':
          // Refresh list is sent from backend
          break;

        case 'skillError':
          shipSetStatus(msg.error || 'Skill error.');
          break;

        // Dashboard messages
        case 'dashboardMetrics':
          updateDashboardMetrics(msg.metrics || {});
          break;

        case 'recentActivity':
          renderActivityList(Array.isArray(msg.activities) ? msg.activities : []);
          break;

        case 'docsStats':
          updateDocsPanel(msg.stats);
          break;

        case 'dbStats':
          updateDbPanel(msg.stats);
          break;

        case 'logs':
          updateLogsPanel(msg.logs, msg.channel);
          break;

        case 'settingsSaved':
          if (msg.success) {
            showToast('Settings saved successfully', 'success');
          } else {
            showToast('Failed to save settings: ' + (msg.error || 'Unknown error'), 'error');
          }
          break;

        case 'planExecutionStarted':
          planExecutionState = {
            planId: msg.planId || null,
            totalSteps: msg.totalSteps || 0,
            completedSteps: 0,
            failedSteps: 0,
          };
          showPlanExecutionPanel(true);
          hidePlanStepGate();
          clearPlanExecutionLog();
          setPlanExecutionStatus('Executing: ' + (msg.planTitle || 'Plan'));
          setPlanExecutionProgress('0 / ' + planExecutionState.totalSteps + ' steps');
          appendPlanExecutionLog('Started plan: ' + (msg.planTitle || msg.planId || 'unknown'));
          setPlanExecutionButtonsEnabled(false);
          break;

        case 'planStepStarted':
          if (msg.stepDescription) {
            setPlanExecutionStatus('Running: ' + msg.stepDescription);
            appendPlanExecutionLog('▶ ' + msg.stepDescription);
          }
          break;

        case 'planStepPending':
          showPlanExecutionPanel(true);
          showPlanStepGate(msg);
          setPlanExecutionStatus('Awaiting approval');
          setPlanExecutionProgress(
            planExecutionState.completedSteps + ' / ' + planExecutionState.totalSteps +
            ' steps (failed: ' + planExecutionState.failedSteps + ')'
          );
          if (msg.stepDescription) {
            appendPlanExecutionLog('⏸ Waiting: ' + msg.stepDescription);
          }
          break;

        case 'planStepCompleted':
          if (msg.success) {
            planExecutionState.completedSteps += 1;
            appendPlanExecutionLog('✅ Step completed');
          } else {
            planExecutionState.failedSteps += 1;
            appendPlanExecutionLog('❌ Step failed: ' + (msg.error || 'Unknown error'));
          }
          setPlanExecutionProgress(
            planExecutionState.completedSteps + ' / ' + planExecutionState.totalSteps +
            ' steps (failed: ' + planExecutionState.failedSteps + ')'
          );
          break;

        case 'planPhaseCompleted':
          if (msg.summary) {
            appendPlanExecutionLog('• Phase summary: ' + msg.summary);
          } else if (msg.phaseId) {
            appendPlanExecutionLog('• Phase completed: ' + msg.phaseId);
          }
          break;

        case 'executionOutput':
          if (msg.chunk) {
            appendPlanExecutionLog(msg.chunk);
          }
          break;

        case 'planExecutionCompleted':
          setPlanExecutionStatus(msg.success ? 'Execution complete' : 'Execution completed with errors', !msg.success);
          if (msg.summary) {
            appendPlanExecutionLog('Summary: ' + msg.summary);
          }
          setPlanExecutionProgress(
            (msg.completedSteps ?? planExecutionState.completedSteps) + ' / ' +
            (planExecutionState.totalSteps || msg.completedSteps || 0) +
            ' steps (failed: ' + (msg.failedSteps ?? planExecutionState.failedSteps) + ')'
          );
          hidePlanStepGate();
          setPlanExecutionButtonsEnabled(!!currentPlanData);
          break;

        case 'planExecutionError':
          setPlanExecutionStatus('Execution error', true);
          appendPlanExecutionLog('Error: ' + (msg.error || 'Unknown error'));
          hidePlanStepGate();
          setPlanExecutionButtonsEnabled(!!currentPlanData);
          break;

        case 'aiReviewResult':
          updateAIReview(msg.result || null);
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

        case 'insertPrompt':
          // Insert a prompt into the chat input
          if (msg.prompt) {
            const input = document.getElementById('messageInput');
            if (input) {
              input.value = msg.prompt;
              input.focus();
              autoResize(input);
            }
          }
          break;

        case 'sendGitPrompt':
          // Insert prompt AND send it immediately
          if (msg.prompt) {
            const input = document.getElementById('messageInput');
            if (input) {
              input.value = msg.prompt;
              autoResize(input);
              // Trigger send after a small delay to ensure UI updates
              setTimeout(() => sendMessage(), 50);
            }
          }
          break;

        case 'gitSettingsSaved':
          // Git settings saved confirmation (optional visual feedback)
          break;

        case 'gitSettings':
          // Load saved git settings into form
          loadGitSettings(msg.settings);
          break;

        case 'showError':
          // Show error message from extension
          if (msg.message) {
            addMessage('system', 'Error: ' + msg.message);
          }
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
      mcpServersData = Array.isArray(servers) ? servers : [];
      const container = document.getElementById('mcpServerList');
      if (!container) {
        return;
      }

      if (mcpServersData.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary)">No MCP servers configured</p>';
        showMcpDetails(null);
        return;
      }

      container.innerHTML = mcpServersData.map(s => `
        <div class="mcp-server-item ${selectedMcpServer === s.id ? 'selected' : ''}"
             onclick="selectMcpServer('${s.id}')" data-server-id="${s.id}">
          <div class="status-dot ${s.status || 'stopped'}"></div>
          <div class="mcp-server-info">
            <div class="name">${s.name}</div>
            <div class="transport">${s.transport}</div>
          </div>
        </div>
      `).join('');

      // If we had a selection, refresh the details
      if (selectedMcpServer) {
        const server = mcpServersData.find(s => s.id === selectedMcpServer);
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
      const panel = document.getElementById('mcpDetails');
      const detailsSection = document.getElementById('mcpDetailsSection');
      if (!panel) {
        return;
      }

      if (!server) {
        if (detailsSection) detailsSection.style.display = 'none';
        panel.innerHTML = `
          <div class="mcp-details-empty">
            <div class="icon">🔌</div>
            <p>Select a server to view details</p>
          </div>
        `;
        return;
      }

      if (detailsSection) detailsSection.style.display = 'block';
      const isConnected = server.status === 'running';
      const statusColor = isConnected ? 'var(--vscode-charts-green)' : 'var(--vscode-charts-red)';
      const statusText = isConnected ? 'Connected' : 'Disconnected';

      panel.innerHTML = `
        <div class="mcp-details-header">
          <h4>${server.name}</h4>
          <div class="mcp-details-actions">
            ${server.transport === 'http' && server.url
              ? `<button class="btn-connect" onclick="mcpAction('ping', '${server.id}')">${isConnected ? 'Refresh' : 'Connect'}</button>`
              : server.command
                ? `<button class="btn-connect" onclick="mcpAction('launch', '${server.id}')">Launch</button>`
                : ''
            }
            <button class="btn-remove" onclick="mcpAction('remove', '${server.id}')">Remove</button>
          </div>
        </div>

        <div class="mcp-info-row">
          <span class="label">Status:</span>
          <span class="value" style="color: ${statusColor}">● ${statusText}</span>
        </div>
        <div class="mcp-info-row">
          <span class="label">Transport:</span>
          <span class="value">${server.transport}</span>
        </div>
        ${server.command ? `
          <div class="mcp-info-row">
            <span class="label">Command:</span>
            <span class="value" style="font-family: monospace; font-size: 11px;">${server.command}</span>
          </div>
        ` : ''}
        ${server.args && server.args.length > 0 ? `
          <div class="mcp-info-row">
            <span class="label">Args:</span>
            <span class="value" style="font-family: monospace; font-size: 11px;">${server.args.join(' ')}</span>
          </div>
        ` : ''}
        ${server.url ? `
          <div class="mcp-info-row">
            <span class="label">URL:</span>
            <span class="value">${server.url}</span>
          </div>
        ` : ''}
        ${server.description ? `
          <div class="mcp-info-row">
            <span class="label">Info:</span>
            <span class="value">${server.description}</span>
          </div>
        ` : ''}

        <div class="mcp-tools-section">
          <h5>Available Tools</h5>
          <p style="font-size: 12px; color: var(--text-secondary);">
            ${server.status === 'running'
              ? 'Tools are available when connected via Claude Code CLI.'
              : 'Connect the server to discover available tools.'}
          </p>
        </div>
      `;
    }

    function mcpAction(action, serverId) {
      vscode.postMessage({ type: 'mcpAction', action, serverId });
    }

    function addMcpServer() {
      // Send message to backend to initiate MCP server addition workflow
      vscode.postMessage({ type: 'addMcpServer' });
    }

    function renderKbEntries(entries) {
      const container = document.getElementById('kbList');
      if (!container) {
        return;
      }
      if (entries.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary)">No entries in knowledge base</p>';
        return;
      }

      container.innerHTML = entries.slice(0, 30).map(e => {
        const typeIcon = e.type === 'pdf' ? '📄' : (e.type === 'url' ? '🔗' : '📝');
        const embeddedBadge = e.embedded
          ? `<span class="embedding-badge embedded">✓ ${e.chunkCount || 0}</span>`
          : `<span class="embedding-badge not-embedded">−</span>`;
        const tagsDisplay = e.tags.length > 0
          ? `<span style="color: var(--text-secondary); font-size: 11px; margin-left: 8px;">${e.tags.join(', ')}</span>`
          : '';

        return `
          <div class="list-item" id="kb-entry-${e.id}" style="padding: 8px 12px;">
            <div class="list-item-info" style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;">
              ${embeddedBadge}
              <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"><strong>${typeIcon} ${e.title}</strong>${tagsDisplay}</span>
            </div>
            <div class="list-item-actions" style="flex-direction: row; gap: 6px; flex-shrink: 0;">
              ${!e.embedded ? `<button class="btn-connect" onclick="embedEntry('${e.id}')" id="embed-btn-${e.id}">Embed</button>` : ''}
              <button class="btn-remove" onclick="vscode.postMessage({type:'kbRemove',id:'${e.id}'})">Remove</button>
            </div>
          </div>
        `;
      }).join('');
    }

    let currentEmbedderStatus = null;

    function renderEmbedderStatus(status, stats) {
      currentEmbedderStatus = status;
      const container = document.getElementById('embedderStatus');
      if (!container) {
        return;
      }
      const modelSelect = document.getElementById('modelSelect');
      const modelInfo = document.getElementById('modelInfo');

      // Populate model selector
      if (modelSelect && status.availableModels) {
        modelSelect.innerHTML = status.availableModels.map(m => `
          <option value="${m.id}" ${m.id === status.modelId ? 'selected' : ''}>
            ${m.name} (${m.size})
          </option>
        `).join('');
      }

      // Show selected model info
      if (modelInfo && status.availableModels) {
        const selectedModel = status.availableModels.find(m => m.id === status.modelId);
        if (selectedModel) {
          modelInfo.innerHTML = `
            <p>${selectedModel.description}</p>
            <p style="margin-top: 4px;">
              <a href="${selectedModel.url}" style="color: var(--accent-mastermind);" onclick="event.preventDefault(); vscode.postMessage({type:'openExternal', url:'${selectedModel.url}'});">
                View on HuggingFace
              </a>
            </p>
          `;
        }
      }

      if (status.isLoading) {
        container.innerHTML = `
          <div style="display: flex; align-items: center; gap: 8px;">
            <div class="status-dot thinking"></div>
            <span>${status.downloadProgress?.message || 'Loading model...'}</span>
          </div>
        `;
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
        container.innerHTML = `
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <div style="width: 10px; height: 10px; background: #22c55e; border-radius: 50%;"></div>
            <span style="color: #22c55e; font-weight: 500;">Model Ready</span>
          </div>
          <p style="font-size: 12px; color: var(--text-secondary);">
            Embedded: ${stats.embeddedEntries}/${stats.totalEntries} entries (${stats.totalChunks} chunks)
          </p>
        `;
      } else {
        const selectedModel = status.availableModels?.find(m => m.id === status.modelId);
        const modelSize = selectedModel?.size || '~30MB';
        container.innerHTML = `
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <div style="width: 10px; height: 10px; background: #eab308; border-radius: 50%;"></div>
            <span style="color: #eab308;">Model Not Downloaded</span>
          </div>
          <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 12px;">
            Download the embedding model to enable semantic search and chunking.
          </p>
          <button class="btn-primary" onclick="downloadModel()" id="downloadModelBtn">
            Download Model (${modelSize})
          </button>
        `;
      }

      // Update stats
      const statsContainer = document.getElementById('kbStats');
      if (statsContainer) {
        statsContainer.innerHTML = `
          <p style="color: var(--text-secondary); font-size: 12px;">
            <strong>${stats.totalEntries}</strong> entries |
            <strong>${stats.embeddedEntries}</strong> embedded |
            <strong>${stats.totalChunks}</strong> total chunks
          </p>
        `;
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
          btn.textContent = `Download Model (${selectedModel?.size || '~30MB'})`;
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
        bytes.textContent = `${loaded} MB / ${total} MB${progress.currentFile ? ' - ' + progress.currentFile : ''}`;
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
        btn.textContent = `${current}/${total}`;
      }
    }

    function updateEmbedAllProgress(entryIndex, totalEntries, chunkIndex, totalChunks) {
      const btn = document.getElementById('embedAllBtn');
      if (btn) {
        btn.textContent = `Entry ${entryIndex}/${totalEntries} (chunk ${chunkIndex}/${totalChunks})`;
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

      // Initialize to Chat tab with 50/50 split (chat + synthesis)
      window.switchTab(TABS.CHAT);

      // Initialize Context Flow visualization (side-by-side panel)
      // Small delay to ensure D3 is loaded
      setTimeout(() => {
        initContextFlowVisualization();
      }, 100);
    });

    function renderCosts(data) {
      const container = document.getElementById('costsContent');
      container.innerHTML = `
        <div class="list-item">
          <div><strong>Today</strong></div>
          <div>$${data.today.totalCost.toFixed(4)} (${data.today.recordCount} calls)</div>
        </div>
        <div class="list-item">
          <div><strong>This Month</strong></div>
          <div>$${data.month.totalCost.toFixed(4)} (${data.month.recordCount} calls)</div>
        </div>
        <div class="list-item">
          <div><strong>All Time</strong></div>
          <div>$${data.all.totalCost.toFixed(4)} (${data.all.recordCount} calls)</div>
        </div>
        <h4 style="margin: 20px 0 10px;">By Provider</h4>
        <div class="list-item">
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="width:12px;height:12px;background:var(--accent-claude);border-radius:50%"></div>
            <strong>Claude</strong>
          </div>
          <div>$${data.all.byProvider.claude.cost.toFixed(4)} (${data.all.byProvider.claude.calls} calls)</div>
        </div>
        <div class="list-item">
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="width:12px;height:12px;background:var(--accent-gpt);border-radius:50%"></div>
            <strong>GPT</strong>
          </div>
          <div>$${data.all.byProvider.gpt.cost.toFixed(4)} (${data.all.byProvider.gpt.calls} calls)</div>
        </div>
      `;
    }

    // ========================
    // AI FLOW VISUALIZATION (D3.js)
    // ========================

    // State for AI Flow visualization
    let aiFlowState = {
      nodes: [],
      links: [],
      simulation: null,
      svg: null,
      g: null,  // Main group for zoom/pan
      width: 0,
      height: 0,
      zoom: null
    };

    // ========================================
    // FATE WEB VISUALIZATION
    // "Threads of context weaving into an answer"
    // ========================================

    // Thread colors by source type
    const THREAD_COLORS = {
      query: '#6cf',         // Cyan - the question
      memory: '#ff6ccf',     // Pink - past conversations
      kb: '#9c6cff',         // Purple - knowledge base
      chat: '#6cff9c',       // Green - recent chat
      sector: '#ffb34d',     // Orange - rules/policy
      rules: '#ffb34d',      // Alias for sector
      response: '#6cff9c',   // Green - the answer crystal
      gpt: '#10b981',        // Emerald - GPT consultation
      claude: '#6366f1',     // Indigo - Claude responses
      skill: '#f59e0b',      // Amber - loaded skills
      agent: '#ec4899'       // Magenta - agent operations
    };

    // Alias for backwards compatibility
    const AI_FLOW_COLORS = THREAD_COLORS;

    // Fate Web state
    const fateWebState = {
      phase: 'idle',           // idle | gathering | weaving | answering | complete
      query: { text: '', tokens: 0 },
      influences: new Map(),   // id -> influence node data
      threads: [],             // thread connections
      answerTokens: 0,
      initialized: false
    };

    // Alias for backwards compatibility
    function initAiFlowVisualization() {
      initContextFlowVisualization();
    }

    function initContextFlowVisualization(skipWaiting = false) {
      const canvas = document.getElementById('contextFlowCanvas');
      if (!canvas || typeof d3 === 'undefined') {
        console.warn('Fate Web: canvas not found or D3 not loaded');
        return;
      }

      // Clear existing
      d3.select(canvas).selectAll('*').remove();

      // Get dimensions
      aiFlowState.width = canvas.clientWidth || 300;
      aiFlowState.height = canvas.clientHeight || 200;

      // Create SVG with D3
      const svg = d3.select(canvas)
        .append('svg')
        .attr('width', '100%')
        .attr('height', '100%')
        .attr('viewBox', `0 0 ${aiFlowState.width} ${aiFlowState.height}`)
        .attr('class', 'fate-web-svg');

      aiFlowState.svg = svg;

      // Add defs for glow filters
      const defs = svg.append('defs');

      // Glow filter for knot
      const knotGlow = defs.append('filter')
        .attr('id', 'knotGlow')
        .attr('x', '-100%').attr('y', '-100%')
        .attr('width', '300%').attr('height', '300%');
      knotGlow.append('feGaussianBlur')
        .attr('stdDeviation', '4')
        .attr('result', 'blur');
      const knotMerge = knotGlow.append('feMerge');
      knotMerge.append('feMergeNode').attr('in', 'blur');
      knotMerge.append('feMergeNode').attr('in', 'SourceGraphic');

      // Glow filter for threads and particles - STRONGER glow
      const threadGlow = defs.append('filter')
        .attr('id', 'threadGlow')
        .attr('x', '-100%').attr('y', '-100%')
        .attr('width', '300%').attr('height', '300%');
      threadGlow.append('feGaussianBlur')
        .attr('stdDeviation', '4')  // Stronger blur = more glow
        .attr('result', 'blur');
      threadGlow.append('feGaussianBlur')
        .attr('in', 'SourceGraphic')
        .attr('stdDeviation', '1')
        .attr('result', 'blur2');
      const threadMerge = threadGlow.append('feMerge');
      threadMerge.append('feMergeNode').attr('in', 'blur');
      threadMerge.append('feMergeNode').attr('in', 'blur2');
      threadMerge.append('feMergeNode').attr('in', 'SourceGraphic');

      // Zoom/pan behavior
      aiFlowState.zoom = d3.zoom()
        .scaleExtent([0.5, 2.5])
        .on('zoom', (event) => {
          aiFlowState.g.attr('transform', event.transform);
        });

      svg.call(aiFlowState.zoom);

      // Main group for zoom/pan
      aiFlowState.g = svg.append('g');

      // Create layer groups (back to front)
      aiFlowState.g.append('g').attr('class', 'threads-layer');
      aiFlowState.g.append('g').attr('class', 'particles-layer');
      aiFlowState.g.append('g').attr('class', 'influences-layer');
      aiFlowState.g.append('g').attr('class', 'knot-layer');

      const cx = aiFlowState.width / 2;
      const cy = aiFlowState.height / 2;

      // Create central "knot" (the synthesis point)
      const knotGroup = aiFlowState.g.select('.knot-layer').append('g')
        .attr('class', 'fate-knot')
        .attr('transform', `translate(${cx}, ${cy})`);

      // Outer glow ring
      knotGroup.append('circle')
        .attr('class', 'knot-glow-ring')
        .attr('r', 35)
        .attr('fill', 'none')
        .attr('stroke', THREAD_COLORS.query)
        .attr('stroke-width', 2)
        .attr('opacity', 0.3);

      // Main knot circle
      knotGroup.append('circle')
        .attr('class', 'knot-core')
        .attr('r', 20)
        .attr('fill', '#0a1520')
        .attr('stroke', THREAD_COLORS.query)
        .attr('stroke-width', 2.5)
        .attr('filter', 'url(#knotGlow)');

      // Inner pulse circle
      knotGroup.append('circle')
        .attr('class', 'knot-pulse')
        .attr('r', 8)
        .attr('fill', THREAD_COLORS.query)
        .attr('opacity', 0.6);

      // Query label (below knot)
      knotGroup.append('text')
        .attr('class', 'knot-label')
        .attr('y', 45)
        .attr('text-anchor', 'middle')
        .attr('fill', '#9fd')
        .attr('font-size', '10')
        .attr('font-family', 'monospace')
        .text(skipWaiting ? '' : 'Waiting...');

      // Create "answer crystal" (grows as response streams)
      const answerGroup = aiFlowState.g.select('.knot-layer').append('g')
        .attr('class', 'answer-crystal')
        .attr('transform', `translate(${cx}, ${cy + 70})`)
        .style('opacity', 0);

      answerGroup.append('polygon')
        .attr('class', 'crystal-shape')
        .attr('points', '0,-12 10,0 0,12 -10,0')
        .attr('fill', '#0f1a25')
        .attr('stroke', THREAD_COLORS.response)
        .attr('stroke-width', 2);

      answerGroup.append('text')
        .attr('class', 'crystal-label')
        .attr('y', 28)
        .attr('text-anchor', 'middle')
        .attr('fill', THREAD_COLORS.response)
        .attr('font-size', '9')
        .attr('font-family', 'monospace')
        .text('');

      fateWebState.initialized = true;
      fateWebState.phase = skipWaiting ? 'idle' : 'idle';

      console.log('[Fate Web] Initialized');
    }

    // ========================================
    // FATE WEB: EVENT-DRIVEN FUNCTIONS
    // ========================================

    // State for animation
    const flowAnimState = {
      nodes: [],
      links: [],
      simulation: null,
      isThinking: false,
      responseTokens: 0,
      responseNodeAdded: false,
      particleTimer: null,
      threadAnimTimer: null
    };

    // Get spawn position at edge (for fly-in animation)
    function getSpawnPosition() {
      const w = aiFlowState.width || 300;
      const h = aiFlowState.height || 200;
      const side = Math.floor(Math.random() * 4);
      switch (side) {
        case 0: return { x: -50, y: Math.random() * h };
        case 1: return { x: w + 50, y: Math.random() * h };
        case 2: return { x: Math.random() * w, y: -50 };
        default: return { x: Math.random() * w, y: h + 50 };
      }
    }

    // Calculate ring position for influence nodes
    function getInfluencePosition(index, total) {
      const cx = aiFlowState.width / 2;
      const cy = aiFlowState.height / 2;
      const radius = Math.min(aiFlowState.width, aiFlowState.height) * 0.35;
      const angle = (index / Math.max(6, total)) * Math.PI * 2 - Math.PI / 2;
      return {
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius
      };
    }

    // Set Fate Web phase
    function setFateWebPhase(phase) {
      fateWebState.phase = phase;
      console.log('[Fate Web] Phase:', phase);

      if (!aiFlowState.g) return;

      const knot = aiFlowState.g.select('.fate-knot');

      // Update knot appearance based on phase
      knot.select('.knot-pulse')
        .classed('pulsing', phase === 'gathering' || phase === 'weaving')
        .classed('fast-pulse', phase === 'answering');

      knot.select('.knot-core')
        .classed('active', phase !== 'idle');

      // Update thread animation speed
      updateThreadAnimation(phase);
    }

    // Start new Fate Web flow
    function startAiFlow(query, queryTokens) {
      // Initialize if needed
      if (!aiFlowState.svg || !aiFlowState.g) {
        initContextFlowVisualization(true);
        if (!aiFlowState.svg) return;
      }

      // Clear previous influences
      fateWebState.influences.clear();
      fateWebState.threads = [];
      fateWebState.answerTokens = 0;
      fateWebState.query = { text: query || '', tokens: queryTokens || 0 };

      // Reset animation state
      flowAnimState.nodes = [];
      flowAnimState.links = [];
      flowAnimState.responseTokens = 0;
      flowAnimState.responseNodeAdded = false;

      // Clear visual elements
      aiFlowState.g.select('.threads-layer').selectAll('*').remove();
      aiFlowState.g.select('.particles-layer').selectAll('*').remove();
      aiFlowState.g.select('.influences-layer').selectAll('*').remove();

      // Reset answer crystal
      aiFlowState.g.select('.answer-crystal')
        .style('opacity', 0);

      // Update knot with query
      const knotLabel = query ? (query.length > 25 ? query.substring(0, 22) + '...' : query) : 'Query';
      aiFlowState.g.select('.knot-label')
        .text(knotLabel);

      // Pulse the knot to show activity
      aiFlowState.g.select('.knot-core')
        .transition()
        .duration(200)
        .attr('r', 25)
        .transition()
        .duration(300)
        .attr('r', 20);

      setFateWebPhase('gathering');
      startThreadAnimation();
      startParticleSpawning();

      // Update stats
      updateFlowStatsAnimated(queryTokens || 0, 0);

      console.log('[Fate Web] Started with query:', knotLabel);
    }

    // Create curved thread path
    function createThreadPath(source, target, strength) {
      const sx = source.x, sy = source.y;
      const tx = target.x, ty = target.y;
      const mx = (sx + tx) / 2, my = (sy + ty) / 2;
      const bend = (1 - strength) * 60 + 20;
      const nx = (sy - ty), ny = (tx - sx);
      const nlen = Math.max(1, Math.hypot(nx, ny));
      return `M${sx},${sy} Q${mx + (nx/nlen)*bend},${my + (ny/nlen)*bend} ${tx},${ty}`;
    }

    // Thread dash animation - FAST visible flow toward center
    let threadAnimTimer = null;
    function startThreadAnimation() {
      if (threadAnimTimer) return;
      let offset = 0;
      threadAnimTimer = d3.interval(() => {
        offset = (offset + 5) % 200;  // FASTER movement
        if (aiFlowState.g) {
          aiFlowState.g.selectAll('.fate-thread').attr('stroke-dashoffset', -offset);
        }
      }, 16);  // 60fps for smooth animation
    }

    function stopThreadAnimation() {
      if (threadAnimTimer) { threadAnimTimer.stop(); threadAnimTimer = null; }
      // Also stop particle spawning
      if (typeof stopParticleSpawning === 'function') {
        stopParticleSpawning();
      }
    }

    function updateThreadAnimation(phase) {
      // Could adjust speed based on phase
    }

    // Spawn particle along a thread - LARGE, BRIGHT, with comet trail
    function spawnThreadParticle(threadId, color) {
      if (!aiFlowState.g) return;
      const thread = aiFlowState.g.select(`[data-thread-id="${threadId}"]`);
      if (thread.empty()) return;
      const pathNode = thread.node();
      if (!pathNode || !pathNode.getTotalLength) return;
      const length = pathNode.getTotalLength();

      // Main particle - LARGER and BRIGHTER
      const particle = aiFlowState.g.select('.particles-layer').append('circle')
        .attr('class', 'fate-particle')
        .attr('r', 7)  // Bigger!
        .attr('fill', color)
        .attr('opacity', 1)
        .attr('filter', 'url(#threadGlow)');

      // FASTER travel to center
      particle.transition()
        .duration(500 + Math.random() * 200)
        .ease(d3.easeLinear)
        .attrTween('transform', () => (t) => {
          const p = pathNode.getPointAtLength(t * length);
          return `translate(${p.x}, ${p.y})`;
        })
        .attr('r', 3)
        .attr('opacity', 0)
        .remove();

      // Add trailing "comet tail" particle
      setTimeout(() => {
        if (!aiFlowState.g) return;
        const trail = aiFlowState.g.select('.particles-layer').append('circle')
          .attr('class', 'fate-particle trail')
          .attr('r', 5)
          .attr('fill', color)
          .attr('opacity', 0.5);
        trail.transition()
          .duration(600)
          .ease(d3.easeLinear)
          .attrTween('transform', () => (t) => {
            const p = pathNode.getPointAtLength(t * length);
            return `translate(${p.x}, ${p.y})`;
          })
          .attr('opacity', 0)
          .remove();
      }, 60);
    }

    // Spawn influence with thread (Fate Web style)
    function spawnFlowChunk(chunk) {
      if (!aiFlowState.svg || !aiFlowState.g) {
        console.warn('[Fate Web] spawnFlowChunk: not initialized');
        return;
      }

      const chunkId = chunk.id || `${chunk.source || 'chunk'}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      if (fateWebState.influences.has(chunkId)) return;

      const cx = aiFlowState.width / 2;
      const cy = aiFlowState.height / 2;

      // Calculate orbit position
      const index = fateWebState.influences.size;
      const targetPos = getInfluencePosition(index, index + 1);
      const spawnPos = getSpawnPosition();

      // Store influence data
      const influence = {
        id: chunkId,
        source: chunk.source,
        label: chunk.label || chunk.source,
        tokens: chunk.tokens || 0,
        strength: chunk.similarity || 0.7,
        x: spawnPos.x, y: spawnPos.y,
        tx: targetPos.x, ty: targetPos.y
      };
      fateWebState.influences.set(chunkId, influence);

      // Get thread color
      const color = THREAD_COLORS[chunk.source] || THREAD_COLORS.memory;

      // Create curved thread
      const threadLayer = aiFlowState.g.select('.threads-layer');
      const thread = threadLayer.append('path')
        .attr('class', `fate-thread thread-${chunk.source}`)
        .attr('data-thread-id', chunkId)
        .attr('d', createThreadPath(spawnPos, { x: cx, y: cy }, influence.strength))
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 1.5 + influence.strength)
        .attr('stroke-dasharray', '8 10')
        .attr('opacity', 0)
        .attr('filter', 'url(#threadGlow)');

      // Thread fade in
      thread.transition().duration(300).attr('opacity', 0.7);

      // Create influence node
      const influenceLayer = aiFlowState.g.select('.influences-layer');
      const nodeRadius = 8 + Math.min(chunk.tokens || 50, 300) / 30;
      const influenceG = influenceLayer.append('g')
        .attr('class', 'fate-influence')
        .attr('data-influence-id', chunkId)
        .attr('transform', `translate(${spawnPos.x}, ${spawnPos.y})`)
        .style('opacity', 0);

      // Node circle
      influenceG.append('circle')
        .attr('r', nodeRadius)
        .attr('fill', color)
        .attr('opacity', 0.85)
        .attr('filter', 'url(#threadGlow)');

      // Label
      influenceG.append('text')
        .attr('y', nodeRadius + 14)
        .attr('text-anchor', 'middle')
        .attr('fill', '#9fd')
        .attr('font-size', '9')
        .attr('font-family', 'monospace')
        .text(chunk.label || chunk.source);

      // Token count
      influenceG.append('text')
        .attr('y', nodeRadius + 24)
        .attr('text-anchor', 'middle')
        .attr('fill', '#666')
        .attr('font-size', '8')
        .text(`${chunk.tokens || 0}t`);

      // Fly-in animation
      influenceG.transition()
        .duration(200)
        .style('opacity', 1)
        .transition()
        .duration(600)
        .ease(d3.easeCubicOut)
        .attr('transform', `translate(${targetPos.x}, ${targetPos.y})`)
        .on('end', () => {
          influence.x = targetPos.x;
          influence.y = targetPos.y;
          // Update thread to final position
          thread.transition().duration(300)
            .attr('d', createThreadPath(targetPos, { x: cx, y: cy }, influence.strength));
        });

      // Spawn particle flowing along thread
      setTimeout(() => spawnThreadParticle(chunkId, color), 250);

      // Update stats
      const totalTokens = Array.from(fateWebState.influences.values())
        .reduce((sum, inf) => sum + (inf.tokens || 0), 0) + (fateWebState.query.tokens || 0);
      updateFlowStatsAnimated(totalTokens, fateWebState.influences.size);

      console.log('[Fate Web] Added influence:', chunk.label);
    }

    // Tick function for simulation
    function tickFlowAnimation() {
      if (!aiFlowState.g) return;

      // Update node positions
      aiFlowState.g.selectAll('.flow-node')
        .attr('transform', function() {
          const id = d3.select(this).attr('data-node-id');
          const node = flowAnimState.nodes.find(n => n.id === id);
          if (node) {
            return `translate(${node.x}, ${node.y})`;
          }
          return d3.select(this).attr('transform');
        });

      // Update link positions
      aiFlowState.g.selectAll('.flow-link')
        .attr('x1', function() {
          const linkId = d3.select(this).attr('data-link-id');
          if (!linkId) return 0;
          const [sourceId] = linkId.split('-');
          const source = flowAnimState.nodes.find(n => n.id === sourceId);
          return source ? source.x : 0;
        })
        .attr('y1', function() {
          const linkId = d3.select(this).attr('data-link-id');
          if (!linkId) return 0;
          const [sourceId] = linkId.split('-');
          const source = flowAnimState.nodes.find(n => n.id === sourceId);
          return source ? source.y : 0;
        })
        .attr('x2', function() {
          const linkId = d3.select(this).attr('data-link-id');
          if (!linkId) return 0;
          const targetId = linkId.split('-').slice(1).join('-');
          const target = flowAnimState.nodes.find(n => n.id === targetId);
          return target ? target.x : 0;
        })
        .attr('y2', function() {
          const linkId = d3.select(this).attr('data-link-id');
          if (!linkId) return 0;
          const targetId = linkId.split('-').slice(1).join('-');
          const target = flowAnimState.nodes.find(n => n.id === targetId);
          return target ? target.y : 0;
        });
    }

    // Particle spawning interval
    let particleSpawnTimer = null;

    // Set thinking state - Fate Web version
    // Create the AI destination node (shows request being processed)
    // Provider-specific colors: Claude = Indigo, GPT = Emerald
    function createAINode(provider = 'claude') {
      if (!aiFlowState.g) return;

      // Remove existing AI node if present (to update provider color)
      aiFlowState.g.select('.ai-processor-node').remove();
      aiFlowState.g.select('.ai-thread').remove();

      const cx = aiFlowState.width / 2;
      const cy = aiFlowState.height / 2;
      const aiX = cx;
      const aiY = cy - 120; // Above center

      // Provider-specific styling
      const isGPT = provider === 'gpt';
      const providerColor = isGPT ? '#10b981' : '#6366f1';  // Emerald for GPT, Indigo for Claude
      const providerIcon = isGPT ? '🤖' : '✨';
      const providerLabel = isGPT ? 'GPT Processing' : 'Claude Processing';

      const aiNode = aiFlowState.g.select('.influences-layer').append('g')
        .attr('class', 'ai-processor-node')
        .attr('data-provider', provider)
        .attr('transform', `translate(${aiX}, ${aiY})`)
        .style('opacity', 0);

      // Outer glow ring
      aiNode.append('circle')
        .attr('class', 'ai-glow-ring')
        .attr('r', 35)
        .attr('fill', 'none')
        .attr('stroke', providerColor)
        .attr('stroke-width', 2)
        .attr('opacity', 0.4);

      // Main circle
      aiNode.append('circle')
        .attr('class', 'ai-core')
        .attr('r', 25)
        .attr('fill', '#1a1a2e')
        .attr('stroke', providerColor)
        .attr('stroke-width', 3)
        .attr('filter', 'url(#threadGlow)');

      // Provider icon
      aiNode.append('text')
        .attr('class', 'ai-icon')
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('fill', providerColor)
        .attr('font-size', '16')
        .text(providerIcon);

      // Label
      aiNode.append('text')
        .attr('class', 'ai-label')
        .attr('y', 40)
        .attr('text-anchor', 'middle')
        .attr('fill', providerColor)
        .attr('font-size', '10')
        .attr('font-family', 'monospace')
        .text(providerLabel);

      // Thread from center to AI
      const threadLayer = aiFlowState.g.select('.threads-layer');
      threadLayer.append('path')
        .attr('class', 'fate-thread ai-thread')
        .attr('data-thread-id', 'ai-processor')
        .attr('d', `M${cx},${cy - 25} L${aiX},${aiY + 30}`)
        .attr('fill', 'none')
        .attr('stroke', '#ff6b9d')
        .attr('stroke-width', 2.5)
        .attr('stroke-dasharray', '6 8')
        .attr('opacity', 0)
        .attr('filter', 'url(#threadGlow)')
        .transition().duration(300).attr('opacity', 0.8);

      // Fade in
      aiNode.transition().duration(400).style('opacity', 1);
    }

    // Burst particles FROM center TO AI (request being sent)
    function burstToAI(count = 8) {
      if (!aiFlowState.g) return;
      const cx = aiFlowState.width / 2;
      const cy = aiFlowState.height / 2;
      const aiY = cy - 120;

      // Get provider color from AI node
      const aiNode = aiFlowState.g.select('.ai-processor-node');
      const provider = aiNode.attr('data-provider') || 'claude';
      const particleColor = provider === 'gpt' ? '#10b981' : '#6366f1';

      for (let i = 0; i < count; i++) {
        setTimeout(() => {
          const particle = aiFlowState.g.select('.particles-layer').append('circle')
            .attr('class', 'fate-particle request-particle')
            .attr('cx', cx + (Math.random() - 0.5) * 30)
            .attr('cy', cy - 20)
            .attr('r', 6)
            .attr('fill', particleColor)
            .attr('opacity', 1)
            .attr('filter', 'url(#threadGlow)');

          particle.transition()
            .duration(400 + Math.random() * 200)
            .ease(d3.easeCubicOut)
            .attr('cx', cx + (Math.random() - 0.5) * 20)
            .attr('cy', aiY + 30)
            .attr('r', 3)
            .attr('opacity', 0)
            .remove();
        }, i * 40);
      }
    }

    // Burst particles FROM AI back TO center (response arriving)
    function burstFromAI(count = 4) {
      if (!aiFlowState.g) return;
      const cx = aiFlowState.width / 2;
      const cy = aiFlowState.height / 2;
      const aiY = cy - 120;

      for (let i = 0; i < count; i++) {
        setTimeout(() => {
          const particle = aiFlowState.g.select('.particles-layer').append('circle')
            .attr('class', 'fate-particle response-particle')
            .attr('cx', cx + (Math.random() - 0.5) * 20)
            .attr('cy', aiY + 35)
            .attr('r', 5)
            .attr('fill', '#6cff9c')
            .attr('opacity', 1)
            .attr('filter', 'url(#threadGlow)');

          particle.transition()
            .duration(300 + Math.random() * 150)
            .ease(d3.easeCubicIn)
            .attr('cx', cx + (Math.random() - 0.5) * 15)
            .attr('cy', cy - 15)
            .attr('r', 2)
            .attr('opacity', 0)
            .remove();
        }, i * 30);
      }
    }

    // Pulse the AI node
    function pulseAINode() {
      if (!flowAnimState.isThinking || !aiFlowState.g) return;
      const aiCore = aiFlowState.g.select('.ai-core');
      if (aiCore.empty()) return;

      aiCore
        .transition().duration(500).attr('r', 30).attr('stroke-width', 4)
        .transition().duration(500).attr('r', 25).attr('stroke-width', 3)
        .on('end', pulseAINode);
    }

    function setFlowThinking(on, stage, provider = 'claude') {
      if (!aiFlowState.g) return;

      flowAnimState.isThinking = on;
      const knot = aiFlowState.g.select('.fate-knot');
      const knotCore = knot.select('.knot-core');

      if (on) {
        setFateWebPhase('weaving');

        // Create AI processor node with provider-specific color
        createAINode(provider);  // Pass provider for Claude/GPT distinction
        setTimeout(() => {
          burstToAI(10);  // Send request to AI!
          pulseAINode();
        }, 200);

        // Start knot pulsing
        animateKnotPulse();

        // Update label
        knot.select('.knot-label').text(stage || 'Weaving...');

        // Brighten threads
        aiFlowState.g.selectAll('.fate-thread')
          .transition().duration(300).attr('opacity', 0.9);

        // Start continuous particle spawning (context → center)
        startParticleSpawning();
      } else {
        setFateWebPhase('complete');

        // Stop pulsing, turn green for complete
        knotCore.interrupt()
          .transition().duration(300)
          .attr('r', 20)
          .attr('stroke', '#6cff9c');

        knot.select('.knot-label').text('Complete');

        // Fade AI node
        aiFlowState.g.select('.ai-processor-node')
          .transition().duration(500).style('opacity', 0.3);
        aiFlowState.g.select('.ai-thread')
          .transition().duration(500).attr('opacity', 0.2);

        // Stop AI pulsing
        aiFlowState.g.select('.ai-core').interrupt();

        // Fade threads and stop particles
        aiFlowState.g.selectAll('.fate-thread')
          .transition().duration(500).attr('opacity', 0.4);
        stopParticleSpawning();
        stopThreadAnimation();
      }
    }

    // Start spawning particles continuously
    function startParticleSpawning() {
      if (particleSpawnTimer) return;
      particleSpawnTimer = setInterval(() => {
        if (fateWebState.phase === 'idle' || fateWebState.phase === 'complete') return;
        if (!fateWebState.influences.size) return;

        const influences = Array.from(fateWebState.influences.values());

        // Spawn 2-3 particles on different threads for dense, visible flow
        const numToSpawn = Math.min(3, influences.length);
        const shuffled = influences.sort(() => Math.random() - 0.5);

        for (let i = 0; i < numToSpawn; i++) {
          const inf = shuffled[i];
          if (inf) {
            const color = THREAD_COLORS[inf.source] || THREAD_COLORS.memory;
            setTimeout(() => spawnThreadParticle(inf.id, color), i * 20);
          }
        }
      }, 80);  // Every 80ms, spawn 2-3 particles = constant visible stream
    }

    // Stop particle spawning
    function stopParticleSpawning() {
      if (particleSpawnTimer) {
        clearInterval(particleSpawnTimer);
        particleSpawnTimer = null;
      }
    }

    // Animate knot pulsing
    function animateKnotPulse() {
      if (!flowAnimState.isThinking || !aiFlowState.g) return;
      const knotCore = aiFlowState.g.select('.knot-core');
      knotCore
        .transition().duration(400).attr('r', 24)
        .transition().duration(400).attr('r', 18)
        .on('end', animateKnotPulse);
    }

    // Old function kept for compatibility (unused)
    function animateThinkingPulse(circle) {
      if (!flowAnimState.isThinking) return;
      circle
        .transition()
        .duration(600)
        .attr('r', 28)
        .transition()
        .duration(600)
        .attr('r', 22)
        .on('end', () => animateThinkingPulse(circle));
    }

    // Update stats with animation
    function updateFlowStatsAnimated(tokens, chunks) {
      const tokensEl = document.getElementById('flowPanelTokens');
      const chunksEl = document.getElementById('flowPanelChunks');

      if (tokensEl) {
        tokensEl.classList.add('updating');
        tokensEl.textContent = `${tokens} tokens`;
        setTimeout(() => tokensEl.classList.remove('updating'), 300);
      }
      if (chunksEl) {
        chunksEl.classList.add('updating');
        chunksEl.textContent = `${chunks} chunks`;
        setTimeout(() => chunksEl.classList.remove('updating'), 300);
      }
    }

    // ========================================
    // PARTICLE FLOW SYSTEM - Animated data flow
    // ========================================

    let particleAnimationId = null;

    // Start continuous particle flow along all links
    function startParticleFlow() {
      if (particleAnimationId) return; // Already running

      const particleGroup = aiFlowState.g.select('.flow-particles');
      if (particleGroup.empty()) {
        aiFlowState.g.insert('g', '.flow-nodes')
          .attr('class', 'flow-particles');
      }

      function spawnParticle() {
        if (!aiFlowState.g || flowAnimState.links.length === 0) return;

        const pGroup = aiFlowState.g.select('.flow-particles');

        // Pick a random link
        const link = flowAnimState.links[Math.floor(Math.random() * flowAnimState.links.length)];
        const sourceNode = flowAnimState.nodes.find(n => n.id === (link.source.id || link.source));
        const targetNode = flowAnimState.nodes.find(n => n.id === (link.target.id || link.target));

        if (!sourceNode || !targetNode) return;

        // Start from the chunk (target), flow toward query (source)
        const startX = targetNode.x;
        const startY = targetNode.y;
        const endX = sourceNode.x;
        const endY = sourceNode.y;

        // Get color from source type
        const chunkNode = flowAnimState.nodes.find(n => n.id === link.target);
        const color = chunkNode ? (AI_FLOW_COLORS[chunkNode.source] || '#00d4ff') : '#00d4ff';

        // Create particle
        const particle = pGroup.append('circle')
          .attr('class', 'flow-particle')
          .attr('cx', startX)
          .attr('cy', startY)
          .attr('r', 3)
          .attr('fill', color)
          .attr('opacity', 0.8);

        // Animate toward center
        particle
          .transition()
          .duration(800 + Math.random() * 400)
          .ease(d3.easeQuadIn)
          .attr('cx', endX)
          .attr('cy', endY)
          .attr('r', 1)
          .attr('opacity', 0)
          .remove();
      }

      // Spawn particles at interval
      function particleLoop() {
        spawnParticle();
        if (flowAnimState.links.length > 0) {
          // More particles when thinking
          const interval = flowAnimState.isThinking ? 80 : 200;
          particleAnimationId = setTimeout(particleLoop, interval);
        }
      }

      particleLoop();
    }

    // Stop particle flow
    function stopParticleFlow() {
      if (particleAnimationId) {
        clearTimeout(particleAnimationId);
        particleAnimationId = null;
      }
    }

    // Add ripple effect during thinking
    function addThinkingRipples() {
      if (!aiFlowState.g || !flowAnimState.isThinking) return;

      const cx = aiFlowState.width / 2;
      const cy = aiFlowState.height / 2;

      const ripple = aiFlowState.g.select('.flow-nodes').insert('circle', ':first-child')
        .attr('class', 'thinking-ripple')
        .attr('cx', cx)
        .attr('cy', cy)
        .attr('r', 25)
        .attr('fill', 'none')
        .attr('stroke', AI_FLOW_COLORS.query)
        .attr('stroke-width', 2)
        .attr('opacity', 0.5);

      ripple
        .transition()
        .duration(1500)
        .attr('r', 100)
        .attr('opacity', 0)
        .attr('stroke-width', 0.5)
        .remove()
        .on('end', () => {
          if (flowAnimState.isThinking) {
            addThinkingRipples();
          }
        });
    }

    // Enhanced setFlowThinking with ripples and particles
    const originalSetFlowThinking = setFlowThinking;
    setFlowThinking = function(on, stage) {
      flowAnimState.isThinking = on;

      // Add thinking-active class to container for CSS animations
      if (aiFlowState.g) {
        aiFlowState.g.classed('thinking-active', on);
      }

      if (on) {
        // Start ripples
        addThinkingRipples();
        // Boost particle rate (handled in particle loop)
        startParticleFlow();

        // Show stage label
        if (aiFlowState.g) {
          const queryG = aiFlowState.g.select('[data-node-id="query"]');
          queryG.select('.thinking-label').remove();
          queryG.append('text')
            .attr('class', 'thinking-label')
            .attr('y', 40)
            .attr('text-anchor', 'middle')
            .attr('fill', AI_FLOW_COLORS.query)
            .attr('font-size', '11')
            .attr('font-weight', '500')
            .text(stage || 'Generating...');
        }
      } else {
        // Remove thinking label
        if (aiFlowState.g) {
          aiFlowState.g.selectAll('.thinking-label').remove();
          aiFlowState.g.selectAll('.thinking-ripple').remove();
        }
      }
    };

    // Auto-start particles when chunks exist
    const originalSpawnFlowChunk = spawnFlowChunk;
    spawnFlowChunk = function(chunk) {
      originalSpawnFlowChunk(chunk);
      // Start particle flow after first chunk
      if (flowAnimState.links.length === 1) {
        startParticleFlow();
      }
    };

    // ========================================
    // RESPONSE STREAMING VISUALIZATION
    // ========================================

    // Burst particles from all threads toward center (dramatic effect on chunk receive)
    function burstParticlesToCenter(intensity = 3) {
      if (!aiFlowState.g || !fateWebState.influences.size) return;
      const influences = Array.from(fateWebState.influences.values());
      const cx = aiFlowState.width / 2;
      const cy = aiFlowState.height / 2;

      // Spawn multiple particles from random threads
      for (let i = 0; i < Math.min(intensity, influences.length * 2); i++) {
        setTimeout(() => {
          const inf = influences[Math.floor(Math.random() * influences.length)];
          if (!inf) return;
          const color = THREAD_COLORS[inf.source] || THREAD_COLORS.memory;

          // Create larger, brighter particle with glow
          const particle = aiFlowState.g.select('.particles-layer').append('circle')
            .attr('class', 'fate-particle burst-particle')
            .attr('cx', inf.x || inf.tx)
            .attr('cy', inf.y || inf.ty)
            .attr('r', 7)
            .attr('fill', color)
            .attr('opacity', 1)
            .attr('filter', 'url(#threadGlow)');

          // Animate to center
          particle.transition()
            .duration(350 + Math.random() * 150)
            .ease(d3.easeCubicIn)
            .attr('cx', cx)
            .attr('cy', cy)
            .attr('r', 2)
            .attr('opacity', 0)
            .remove();
        }, i * 25);
      }
    }

    // Pulse the central knot brightly (called on chunk receive)
    function pulseKnotOnChunk() {
      if (!aiFlowState.g) return;
      const knotCore = aiFlowState.g.select('.knot-core');
      if (knotCore.empty()) return;

      // Quick bright flash
      knotCore.interrupt()
        .attr('r', 30)
        .attr('stroke', '#fff')
        .attr('stroke-width', 5)
        .transition().duration(120)
        .attr('r', 22)
        .attr('stroke', '#6cf')
        .attr('stroke-width', 3)
        .on('end', () => {
          if (flowAnimState.isThinking) animateKnotPulse();
        });
    }

    // Add or update response node showing tokens as they stream
    function updateResponseNode(tokensDelta) {
      if (!aiFlowState.g) return;

      flowAnimState.responseTokens += tokensDelta;
      const tokens = flowAnimState.responseTokens;

      // *** DRAMATIC VISUAL: Show response flowing FROM AI back to center! ***
      if (tokensDelta > 0) {
        // Green particles burst from AI node → center (response arriving!)
        if (typeof burstFromAI === 'function') {
          burstFromAI(Math.min(5, Math.ceil(tokensDelta / 10)));
        }
        // Also burst context particles to center
        if (fateWebState.influences.size > 0) {
          burstParticlesToCenter(Math.min(4, Math.ceil(tokensDelta / 12)));
        }
        pulseKnotOnChunk();
      }

      const nodeGroup = aiFlowState.g.select('.flow-nodes');
      const linkGroup = aiFlowState.g.select('.flow-links');
      const cx = aiFlowState.width / 2;
      const cy = aiFlowState.height / 2;

      // Calculate node size based on tokens (grows as response gets longer)
      const baseSize = 12;
      const maxSize = 30;
      const size = Math.min(maxSize, baseSize + Math.log(tokens + 1) * 3);

      if (!flowAnimState.responseNodeAdded) {
        // Create response node for the first time
        flowAnimState.responseNodeAdded = true;

        // Add response node below query
        const respX = cx;
        const respY = cy + 80;

        // Add to state
        flowAnimState.nodes.push({
          id: 'response',
          source: 'response',
          label: 'Response',
          tokens: tokens,
          x: respX,
          y: respY
        });

        // Add link from query to response (data flowing out)
        flowAnimState.links.push({
          source: 'query',
          target: 'response'
        });

        // Create the link
        linkGroup.append('line')
          .attr('class', 'flow-link response-link')
          .attr('data-link-target', 'response')
          .attr('x1', cx)
          .attr('y1', cy + 20)
          .attr('x2', respX)
          .attr('y2', respY - size)
          .attr('stroke', AI_FLOW_COLORS.response)
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '4,4')
          .style('opacity', 0)
          .transition()
          .duration(300)
          .style('opacity', 0.6);

        // Create the node
        const nodeG = nodeGroup.append('g')
          .attr('class', 'flow-node response-node')
          .attr('data-node-id', 'response')
          .attr('transform', `translate(${respX}, ${respY})`)
          .style('opacity', 0);

        // Pulsing glow circle
        nodeG.append('circle')
          .attr('class', 'response-glow')
          .attr('r', size + 8)
          .attr('fill', 'none')
          .attr('stroke', AI_FLOW_COLORS.response)
          .attr('stroke-width', 2)
          .attr('opacity', 0.3);

        // Main circle
        nodeG.append('circle')
          .attr('class', 'response-circle')
          .attr('r', size)
          .attr('fill', AI_FLOW_COLORS.response)
          .attr('opacity', 0.9)
          .attr('filter', 'url(#flowGlow)');

        // Token count label
        nodeG.append('text')
          .attr('class', 'response-tokens')
          .attr('y', size + 16)
          .attr('text-anchor', 'middle')
          .attr('fill', AI_FLOW_COLORS.response)
          .attr('font-size', '10')
          .text(`${tokens} tokens`);

        // Fade in
        nodeG.transition()
          .duration(300)
          .style('opacity', 1);

      } else {
        // Update existing response node
        const nodeG = aiFlowState.g.select('[data-node-id="response"]');

        // Update circles with smooth transition
        nodeG.select('.response-circle')
          .transition()
          .duration(100)
          .attr('r', size);

        nodeG.select('.response-glow')
          .transition()
          .duration(100)
          .attr('r', size + 8);

        // Update token count
        nodeG.select('.response-tokens')
          .text(`${tokens} tokens`)
          .attr('y', size + 16);

        // Update link endpoint
        linkGroup.select('[data-link-target="response"]')
          .attr('y2', cy + 80 - size);
      }
    }

    // Show completion state on response node
    function showResponseComplete(finalTokens) {
      if (!aiFlowState.g) return;

      const nodeG = aiFlowState.g.select('[data-node-id="response"]');
      if (nodeG.empty()) return;

      // Update final token count
      flowAnimState.responseTokens = finalTokens || flowAnimState.responseTokens;
      nodeG.select('.response-tokens')
        .text(`${flowAnimState.responseTokens} tokens`);

      // Add completion indicator
      nodeG.select('.response-glow')
        .transition()
        .duration(500)
        .attr('stroke', '#00ff88') // Green for complete
        .attr('opacity', 0.5);

      // Pulse effect
      nodeG.select('.response-circle')
        .transition()
        .duration(200)
        .attr('r', parseFloat(nodeG.select('.response-circle').attr('r')) + 5)
        .transition()
        .duration(200)
        .attr('r', parseFloat(nodeG.select('.response-circle').attr('r')));

      // Add checkmark
      nodeG.append('text')
        .attr('class', 'response-check')
        .attr('y', 5)
        .attr('text-anchor', 'middle')
        .attr('fill', '#00ff88')
        .attr('font-size', '16')
        .attr('font-weight', 'bold')
        .style('opacity', 0)
        .text('✓')
        .transition()
        .duration(300)
        .style('opacity', 1);
    }

    // Reset response tracking for new query
    function resetResponseTracking() {
      flowAnimState.responseTokens = 0;
      flowAnimState.responseNodeAdded = false;
    }

    // ========================================
    // END RESPONSE STREAMING
    // ========================================

    // ========================================
    // END PARTICLE FLOW SYSTEM
    // ========================================

    // ========================================
    // NEW AI ACTIVITY PANEL UI FUNCTIONS
    // ========================================

    // Track sources for stats
    let contextSourceCount = 0;
    let contextTokenCount = 0;

    // Set AI stage indicator
    function setAiStage(stage, text) {
      const indicator = document.getElementById('aiStageIndicator');
      if (!indicator) return;

      // Remove all stage classes
      indicator.classList.remove('retrieving', 'thinking', 'generating', 'complete', 'error');
      // Add new stage class
      if (stage) {
        indicator.classList.add(stage);
      }
      // Update text
      const textEl = indicator.querySelector('.stage-text');
      if (textEl) {
        textEl.textContent = text || 'Waiting for input...';
      }
    }

    // Clear context sources list
    function clearContextSources() {
      const list = document.getElementById('contextSourcesList');
      if (list) {
        list.innerHTML = '<div class="empty-sources">Retrieving context...</div>';
      }
      contextSourceCount = 0;
      contextTokenCount = 0;
      updateFlowStats();
    }

    // Add a context source card (with actual content!)
    function addContextSourceCard(chunk) {
      const list = document.getElementById('contextSourcesList');
      if (!list) return;

      // Remove empty state
      const empty = list.querySelector('.empty-sources');
      if (empty) empty.remove();

      // Update counts
      contextSourceCount++;
      contextTokenCount += chunk.tokens || 0;
      updateFlowStats();

      // Create card
      const card = document.createElement('div');
      card.className = 'context-source-card';
      card.dataset.chunkId = chunk.id;

      // Determine similarity display
      const simPercent = chunk.similarity ? Math.round(chunk.similarity * 100) : null;

      card.innerHTML = `
        <div class="source-card-header">
          <span class="source-type-badge ${chunk.source}"></span>
          <span class="source-title">${escapeHtml(chunk.label)}</span>
          <span class="source-tokens">${chunk.tokens} tok</span>
          ${simPercent ? `<span class="source-score">${simPercent}%</span>` : ''}
        </div>
        <div class="source-content-preview">
          ${chunk.content ? escapeHtml(chunk.content) : '<em>No preview available</em>'}
        </div>
      `;

      // Toggle expand on click
      card.addEventListener('click', () => {
        card.classList.toggle('expanded');
      });

      list.appendChild(card);

      // Scroll to show new card
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Update stats display
    function updateFlowStats() {
      const tokensEl = document.getElementById('flowPanelTokens');
      const chunksEl = document.getElementById('flowPanelChunks');
      if (tokensEl) tokensEl.textContent = `${contextTokenCount} tokens`;
      if (chunksEl) chunksEl.textContent = `${contextSourceCount} sources`;
    }

    // Show live response section
    function showLiveResponse() {
      const section = document.getElementById('liveResponseSection');
      if (section) {
        section.style.display = 'block';
      }
      const text = document.getElementById('liveResponseText');
      if (text) {
        text.textContent = '';
      }
      // Reset token counter
      const counter = document.getElementById('responseTokenCounter');
      if (counter) counter.textContent = '0 tokens';
    }

    // Hide live response section
    function hideLiveResponse() {
      const section = document.getElementById('liveResponseSection');
      if (section) {
        section.style.display = 'none';
      }
    }

    // Update live response text (called on each chunk)
    function updateLiveResponseText(chunkText, totalTokens) {
      const textEl = document.getElementById('liveResponseText');
      if (textEl) {
        // Append new text
        textEl.textContent += chunkText;
        // Keep only last 500 chars to prevent overflow
        if (textEl.textContent.length > 500) {
          textEl.textContent = '...' + textEl.textContent.slice(-497);
        }
        // Auto-scroll
        textEl.scrollTop = textEl.scrollHeight;
      }
      // Update token counter
      const counter = document.getElementById('responseTokenCounter');
      if (counter) {
        counter.textContent = `${totalTokens} tokens`;
      }
    }

    // Toggle mini graph visibility
    function toggleMiniGraph() {
      const canvas = document.querySelector('.flow-panel-canvas.mini');
      const toggle = document.getElementById('miniGraphToggle');
      if (canvas && toggle) {
        canvas.classList.toggle('collapsed');
        toggle.classList.toggle('collapsed');
      }
    }
    // Make globally accessible
    window.toggleMiniGraph = toggleMiniGraph;

    // Helper: escape HTML
    function escapeHtml(text) {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // ========================================
    // END AI ACTIVITY PANEL UI
    // ========================================

    // ========================================
    // END EVENT-DRIVEN FLOW FUNCTIONS
    // ========================================

    // D3.js Force Simulation for AI Flow
    function renderAiFlow(contextData) {
      console.log('[SpaceCode] renderAiFlow called with:', contextData);
      console.log('[SpaceCode] aiFlowState.svg:', aiFlowState.svg ? 'exists' : 'NULL');
      console.log('[SpaceCode] aiFlowState.g:', aiFlowState.g ? 'exists' : 'NULL');

      if (!aiFlowState.svg || !aiFlowState.g) {
        console.warn('[SpaceCode] renderAiFlow: SVG not initialized, trying to init...');
        initContextFlowVisualization();
        if (!aiFlowState.svg || !aiFlowState.g) {
          console.error('[SpaceCode] renderAiFlow: Failed to initialize SVG');
          return;
        }
      }

      const linkGroup = aiFlowState.g.select('.flow-links');
      const nodeGroup = aiFlowState.g.select('.flow-nodes');

      // Build nodes from context data
      const nodes = [];
      const links = [];

      const cx = aiFlowState.width / 2;
      const cy = aiFlowState.height / 2;

      // Central query node (fixed position)
      nodes.push({
        id: 'query',
        type: 'query',
        label: contextData.query ? contextData.query.substring(0, 20) + '...' : 'Query',
        size: 20,
        tokens: contextData.queryTokens || 0,
        fx: cx,  // Fixed x
        fy: cy   // Fixed y
      });

      // Memory chunks
      (contextData.memoryChunks || []).forEach((chunk, i) => {
        const nodeId = `memory-${i}`;
        nodes.push({
          id: nodeId,
          type: 'memory',
          label: chunk.label || `Memory ${i + 1}`,
          size: 8 + Math.min(chunk.tokens || 100, 500) / 50,
          tokens: chunk.tokens || 0,
          similarity: chunk.similarity || 0.5
        });
        links.push({
          source: 'query',
          target: nodeId,
          distance: 60 + (1 - (chunk.similarity || 0.5)) * 80
        });
      });

      // Knowledge base chunks
      (contextData.kbChunks || []).forEach((chunk, i) => {
        const nodeId = `kb-${i}`;
        nodes.push({
          id: nodeId,
          type: 'kb',
          label: chunk.label || `KB ${i + 1}`,
          size: 8 + Math.min(chunk.tokens || 100, 500) / 50,
          tokens: chunk.tokens || 0,
          similarity: chunk.similarity || 0.5
        });
        links.push({
          source: 'query',
          target: nodeId,
          distance: 60 + (1 - (chunk.similarity || 0.5)) * 80
        });
      });

      // Chat history
      (contextData.chatHistory || []).forEach((msg, i) => {
        const nodeId = `chat-${i}`;
        nodes.push({
          id: nodeId,
          type: 'chat',
          label: msg.role === 'user' ? 'User' : 'AI',
          size: 6 + Math.min(msg.tokens || 50, 300) / 40,
          tokens: msg.tokens || 0
        });
        links.push({
          source: 'query',
          target: nodeId,
          distance: 100
        });
      });

      // Sector rules
      if (contextData.sectorRules) {
        nodes.push({
          id: 'sector',
          type: 'sector',
          label: contextData.sectorRules.name || 'Sector',
          size: 12,
          tokens: contextData.sectorRules.tokens || 0
        });
        links.push({
          source: 'query',
          target: 'sector',
          distance: 90
        });
      }

      // Stop existing simulation
      if (aiFlowState.simulation) {
        aiFlowState.simulation.stop();
      }

      // Create D3 force simulation
      aiFlowState.simulation = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(links)
          .id(d => d.id)
          .distance(d => d.distance || 100)
        )
        .force('charge', d3.forceManyBody().strength(-200))
        .force('collision', d3.forceCollide().radius(d => d.size + 15))
        .force('center', d3.forceCenter(cx, cy).strength(0.05));

      // Create links with D3 data join
      const link = linkGroup.selectAll('line')
        .data(links)
        .join(
          enter => enter.append('line')
            .attr('stroke', '#333')
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '3,3')
            .attr('marker-end', 'url(#flowArrow)')
            .attr('opacity', 0)
            .call(enter => enter.transition().duration(500).attr('opacity', 1)),
          update => update,
          exit => exit.transition().duration(300).attr('opacity', 0).remove()
        );

      // Drag functions
      function dragstarted(event, d) {
        if (!event.active) aiFlowState.simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      }

      function dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
      }

      function dragended(event, d) {
        if (!event.active) aiFlowState.simulation.alphaTarget(0);
        // Keep query node fixed, release others
        if (d.type !== 'query') {
          d.fx = null;
          d.fy = null;
        }
      }

      // Create node groups with D3 data join
      const node = nodeGroup.selectAll('g.flow-node')
        .data(nodes, d => d.id)
        .join(
          enter => {
            const g = enter.append('g')
              .attr('class', 'flow-node')
              .style('cursor', 'pointer')
              .attr('opacity', 0)
              .call(enter => enter.transition().duration(500).attr('opacity', 1));

            // Circle
            g.append('circle')
              .attr('r', d => d.size)
              .attr('fill', d => AI_FLOW_COLORS[d.type] || '#666')
              .attr('filter', 'url(#flowGlow)')
              .attr('opacity', 0.9);

            // Label
            g.append('text')
              .attr('y', d => d.size + 12)
              .attr('text-anchor', 'middle')
              .attr('fill', '#888')
              .attr('font-size', '9')
              .text(d => d.label);

            // Token count
            g.append('text')
              .attr('class', 'token-label')
              .attr('y', d => d.size + 22)
              .attr('text-anchor', 'middle')
              .attr('fill', '#555')
              .attr('font-size', '8')
              .text(d => d.tokens ? `${d.tokens}t` : '');

            // Click handler
            g.on('click', (event, d) => showFlowNodeDetails(d));

            // Drag behavior
            g.call(d3.drag()
              .on('start', dragstarted)
              .on('drag', dragged)
              .on('end', dragended)
            );

            return g;
          },
          update => update,
          exit => exit.transition().duration(300).attr('opacity', 0).remove()
        );

      // Tick function for animation
      aiFlowState.simulation.on('tick', () => {
        link
          .attr('x1', d => d.source.x)
          .attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x)
          .attr('y2', d => d.target.y);

        node.attr('transform', d => `translate(${d.x},${d.y})`);
      });

      // Store for later use
      aiFlowState.nodes = nodes;
      aiFlowState.links = links;

      // Update stats
      updateFlowStats(contextData);
    }

    function showFlowNodeDetails(node) {
      const details = document.getElementById('flowContextDetails');
      if (!details) return;

      details.innerHTML = `
        <div style="margin-bottom:8px;"><strong>${node.label}</strong></div>
        <div style="font-size:11px; color:#888;">Type: ${node.type}</div>
        <div style="font-size:11px; color:#888;">Tokens: ${node.tokens || 'N/A'}</div>
        ${node.similarity !== undefined ? `<div style="font-size:11px; color:#888;">Similarity: ${(node.similarity * 100).toFixed(1)}%</div>` : ''}
      `;
    }

    function updateFlowStats(contextData) {
      // Update flow panel stats elements
      const tokensEl = document.getElementById('flowPanelTokens');
      const chunksEl = document.getElementById('flowPanelChunks');

      const totalTokens = (contextData.queryTokens || 0) +
        (contextData.memoryChunks || []).reduce((sum, c) => sum + (c.tokens || 0), 0) +
        (contextData.kbChunks || []).reduce((sum, c) => sum + (c.tokens || 0), 0) +
        (contextData.chatHistory || []).reduce((sum, c) => sum + (c.tokens || 0), 0) +
        (contextData.sectorRules?.tokens || 0);

      const totalChunks = (contextData.memoryChunks || []).length +
        (contextData.kbChunks || []).length +
        (contextData.chatHistory || []).length +
        (contextData.sectorRules ? 1 : 0);

      if (tokensEl) tokensEl.textContent = `${totalTokens} tokens`;
      if (chunksEl) chunksEl.textContent = `${totalChunks} chunks`;
    }

    // Clear the flow visualization (for new conversations)
    function clearAiFlow() {
      if (!aiFlowState.svg) return;

      // Stop any existing simulation
      if (aiFlowState.simulation) {
        aiFlowState.simulation.stop();
      }

      // Clear all nodes and links
      aiFlowState.svg.selectAll('.flow-link').remove();
      aiFlowState.svg.selectAll('.flow-node').remove();
      aiFlowState.svg.selectAll('.flow-thinking').remove();

      // Reset stats
      const tokensEl = document.getElementById('flowPanelTokens');
      const chunksEl = document.getElementById('flowPanelChunks');
      if (tokensEl) tokensEl.textContent = '0 tokens';
      if (chunksEl) chunksEl.textContent = '0 chunks';
    }

    // Show thinking/processing animation (D3 version)
    function showFlowThinking(stage) {
      if (!aiFlowState.svg) return;

      // Remove existing thinking indicator
      aiFlowState.svg.select('.flow-thinking').remove();

      const cx = aiFlowState.width / 2;
      const cy = 30;

      const thinking = aiFlowState.svg.append('g')
        .attr('class', 'flow-thinking');

      thinking.append('rect')
        .attr('x', cx - 60)
        .attr('y', cy - 12)
        .attr('width', 120)
        .attr('height', 24)
        .attr('rx', 12)
        .attr('fill', 'rgba(0,212,255,0.1)')
        .attr('stroke', AI_FLOW_COLORS.query)
        .attr('stroke-width', 1);

      thinking.append('text')
        .attr('x', cx)
        .attr('y', cy + 4)
        .attr('text-anchor', 'middle')
        .attr('fill', AI_FLOW_COLORS.query)
        .attr('font-size', '10')
        .text(stage || 'Processing...');

      // Animated dots with D3 transitions
      [-45, -35, -25].forEach((offset, i) => {
        const dot = thinking.append('circle')
          .attr('cx', cx + offset)
          .attr('cy', cy)
          .attr('r', 3)
          .attr('fill', AI_FLOW_COLORS.query);

        function animateDot() {
          dot
            .transition()
            .delay(i * 200)
            .duration(400)
            .attr('opacity', 0.3)
            .transition()
            .duration(400)
            .attr('opacity', 1)
            .on('end', animateDot);
        }
        animateDot();
      });
    }

    function hideFlowThinking() {
      if (!aiFlowState.svg) return;
      aiFlowState.svg.select('.flow-thinking').remove();
    }

    // Reset zoom to fit content
    function resetFlowZoom() {
      if (!aiFlowState.svg || !aiFlowState.zoom) return;
      aiFlowState.svg.transition().duration(500).call(
        aiFlowState.zoom.transform,
        d3.zoomIdentity
      );
    }

    // Demo/test function to visualize sample data
    function demoAiFlow() {
      renderAiFlow({
        query: 'How do I implement player movement?',
        queryTokens: 15,
        memoryChunks: [
          { label: 'CharacterController', tokens: 450, similarity: 0.92 },
          { label: 'PlayerInput.cs', tokens: 320, similarity: 0.85 },
          { label: 'MovementConfig', tokens: 180, similarity: 0.78 }
        ],
        kbChunks: [
          { label: 'Unity Docs: Movement', tokens: 600, similarity: 0.88 },
          { label: 'Best Practices', tokens: 400, similarity: 0.72 }
        ],
        chatHistory: [
          { role: 'user', tokens: 50 },
          { role: 'assistant', tokens: 200 }
        ],
        sectorRules: { name: 'Scripts', tokens: 150 }
      });
    }

    // Request initial settings, pricing, and embedder status
    vscode.postMessage({ type: 'getSettings' });
    vscode.postMessage({ type: 'getPricing' });
    vscode.postMessage({ type: 'kbGetEmbedderStatus' });
    vscode.postMessage({ type: 'getKbEntries' });
    vscode.postMessage({ type: 'getPlanTemplates' });
    vscode.postMessage({ type: 'listPlans' });
    vscode.postMessage({ type: 'getTickets' });
