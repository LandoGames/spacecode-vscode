"use strict";
(() => {
  // src/webview/panel/state.ts
  var TABS = {
    CHAT: "chat",
    STATION: "station",
    AGENTS: "agents",
    SKILLS: "skills",
    DASHBOARD: "dashboard"
  };
  var CHAT_MODES = {
    SOLO: "solo",
    PLANNING: "planning"
  };
  var TAB_PANEL_MODES = {
    [TABS.CHAT]: ["flow", "chat", "planning"],
    [TABS.STATION]: ["station", "control", "flow", "planning"]
  };
  var TAB_DEFAULT_MODE = {
    [TABS.CHAT]: "flow",
    [TABS.STATION]: "station"
  };
  var TAB_SKILL_MAP = {
    [TABS.STATION]: ["sector-analysis", "asmdef-check", "build-tools"],
    [TABS.DASHBOARD]: ["project-health", "settings-access"],
    [TABS.AGENTS]: ["agent-management", "task-delegation"],
    [TABS.SKILLS]: ["skill-lookup", "doc-templates"]
  };
  var BUILTIN_NAV_COMMANDS = {
    "/docs": { tab: "dashboard", subtab: "docs", label: "Open Docs panel" },
    "/tickets": { tab: "dashboard", subtab: "tickets", label: "Open Tickets panel" },
    "/station": { tab: "station", label: "Switch to Station" },
    "/skills": { tab: "skills", label: "Switch to Skills" },
    "/agents": { tab: "agents", label: "Switch to Agents" },
    "/dashboard": { tab: "dashboard", label: "Switch to Dashboard" },
    "/help": { tab: "", label: "List available commands", special: "help" }
  };
  var PERSONA_MAP = {
    chat: "lead-engineer",
    station: "qa-engineer",
    agents: "lead-engineer",
    skills: "lead-engineer",
    // Dashboard subtabs
    "dashboard:docs": "technical-writer",
    "dashboard:tickets": "issue-triager",
    "dashboard:db": "database-engineer",
    "dashboard:settings": "art-director",
    "dashboard:art": "art-director"
  };
  var uiState = {
    currentTab: "station",
    currentPersona: "lead-engineer",
    personaManualOverride: false,
    autoSkills: [],
    manualSkills: [],
    activeSkins: [],
    chatCollapsed: false,
    dashboardSubtab: "docs",
    chatMode: "solo",
    mode: "station",
    attachedImages: [],
    contextPreview: "",
    docTargets: [],
    docTarget: "",
    shipProfile: "yard",
    sector: null,
    scene: "exterior",
    stationViewMode: "schematic",
    planTemplates: [],
    planList: [],
    currentPlan: null,
    lastDiff: null,
    lastPlanComparison: null,
    lastAIReview: null,
    coordinator: {
      status: "unknown",
      lastSync: null
    }
  };

  // src/webview/panel/features/docTargets.ts
  function createDocTargetHandlers(deps) {
    const {
      vscode: vscode2,
      getDocTarget,
      setDocTarget,
      shipSetStatus: shipSetStatus2,
      getShipSelectedSectorId: getShipSelectedSectorId2
    } = deps;
    function refreshDocTargets2() {
      vscode2.postMessage({ type: "getDocTargets" });
    }
    function updateDocInfo2(info) {
      const docInfoEl = document.getElementById("docInfo");
      if (!docInfoEl)
        return;
      if (!info) {
        docInfoEl.textContent = "";
        return;
      }
      const now = Date.now();
      const diff = now - info.lastModified;
      const days = Math.floor(diff / (1e3 * 60 * 60 * 24));
      let freshness = "";
      let color = "var(--text-secondary)";
      if (days === 0) {
        freshness = "Updated today";
        color = "#22c55e";
      } else if (days <= 7) {
        freshness = "Updated " + days + " day" + (days === 1 ? "" : "s") + " ago";
        color = "#22c55e";
      } else if (days <= 30) {
        freshness = "Updated " + days + " days ago";
        color = "#fbbf24";
      } else {
        freshness = "Updated " + days + " days ago (stale)";
        color = "#ef4444";
      }
      docInfoEl.innerHTML = '<span style="color:' + color + ';">\u25CF ' + freshness + "</span>";
    }
    function updateDocSuggestion2(sector) {
      const suggEl = document.getElementById("docSuggestion");
      if (!suggEl)
        return;
      const suggestions = {
        "yard": "YARD sector: Experimental zone - no documentation required",
        "core": "CORE sector: Update architecture.md before making core changes",
        "persistence": "QUARTERS sector: Document save format changes carefully",
        "combat": "ARMORY sector: Update combat docs for balance changes",
        "ui": "BRIDGE-UI sector: Keep UI component docs current",
        "character": "HANGAR sector: Document character customization options"
      };
      const hint = suggestions[sector];
      const current = getDocTarget();
      if (hint && !current) {
        suggEl.textContent = "\u{1F4A1} " + hint;
        suggEl.style.display = "block";
      } else {
        suggEl.style.display = "none";
      }
    }
    function docTargetChanged2(value) {
      const newTarget = value || "";
      setDocTarget(newTarget);
      localStorage.setItem("spacecode.docTarget", newTarget);
      if (newTarget) {
        shipSetStatus2("Doc target: " + newTarget);
      } else {
        shipSetStatus2("Doc target cleared.");
      }
      const openBtn = document.getElementById("openDocBtn");
      if (openBtn)
        openBtn.disabled = !newTarget;
      if (newTarget) {
        vscode2.postMessage({ type: "getDocInfo", docTarget: newTarget });
      } else {
        updateDocInfo2(null);
      }
      updateDocSuggestion2(getShipSelectedSectorId2());
      vscode2.postMessage({ type: "docTargetChanged", docTarget: newTarget });
    }
    function openDocTarget2() {
      const current = getDocTarget();
      if (!current)
        return;
      vscode2.postMessage({ type: "openDocTarget", docTarget: current });
    }
    function populateDocTargets2(list) {
      const select = document.getElementById("docTargetSelect");
      if (!select)
        return;
      const previous = select.value;
      select.innerHTML = '<option value="">Select a docs file...</option>';
      list.forEach((target) => {
        const opt = document.createElement("option");
        opt.value = target;
        opt.textContent = target;
        select.appendChild(opt);
      });
      if (previous && list.includes(previous)) {
        select.value = previous;
        setDocTarget(previous);
      } else {
        const current = getDocTarget();
        select.value = current || "";
        if (current && !list.includes(current)) {
          setDocTarget("");
        }
      }
    }
    return {
      refreshDocTargets: refreshDocTargets2,
      docTargetChanged: docTargetChanged2,
      openDocTarget: openDocTarget2,
      updateDocInfo: updateDocInfo2,
      updateDocSuggestion: updateDocSuggestion2,
      populateDocTargets: populateDocTargets2
    };
  }

  // src/webview/panel/utils/ids.ts
  function generateUUID() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === "x" ? r : r & 3 | 8;
      return v.toString(16);
    });
  }
  function generateChatId() {
    return "chat-" + generateUUID().slice(0, 8);
  }

  // src/webview/panel/features/chatSessions.ts
  var MAX_CHAT_TABS = 5;
  function createChatSessionManager(deps) {
    const {
      vscode: vscode2,
      getCurrentMode,
      setCurrentMode,
      getChatSessions,
      setChatSessions,
      getCurrentChatId,
      setCurrentChatId,
      getChatCounter,
      setChatCounter,
      clearAiFlow: clearAiFlow2,
      clearContextSources: clearContextSources2,
      hideLiveResponse: hideLiveResponse2,
      updateTokenBar: updateTokenBar2,
      getSelectedModel: getSelectedModel2
    } = deps;
    const initialChatId = generateChatId();
    let chatSessions2 = {
      [initialChatId]: {
        id: initialChatId,
        mode: "chat",
        name: "Chat",
        provider: "claude",
        // 'claude' | 'gpt'
        messagesHtml: "",
        messageHistory: [],
        claudeSessionId: generateUUID(),
        isGenerating: false,
        tokensUsed: 0
      }
    };
    let currentChatId2 = initialChatId;
    let chatCounter2 = 1;
    function syncState() {
      setChatSessions(chatSessions2);
      setCurrentChatId(currentChatId2);
      setChatCounter(chatCounter2);
    }
    function getClaudeSessionId2() {
      return chatSessions2[currentChatId2]?.claudeSessionId || "";
    }
    function newChat2() {
      if (Object.keys(chatSessions2).length >= MAX_CHAT_TABS) {
        showMaxTabsModal();
        return;
      }
      const id = generateChatId();
      const mode = getCurrentMode();
      const modeName = mode.charAt(0).toUpperCase() + mode.slice(1);
      const selectedProvider = getSelectedModel2?.()?.provider || "claude";
      chatSessions2[id] = {
        id,
        mode,
        name: modeName,
        provider: selectedProvider,
        messagesHtml: "",
        messageHistory: [],
        claudeSessionId: generateUUID(),
        isGenerating: false,
        tokensUsed: 0
      };
      renderChatTabs2();
      switchChat2(id);
      clearAiFlow2();
      clearContextSources2();
      hideLiveResponse2();
      const phaseEl = document.getElementById("flowPanelPhase");
      if (phaseEl)
        phaseEl.textContent = "Synthesis";
      saveChatState2();
    }
    function switchChat2(chatId) {
      console.log("SWITCH chat:", { from: currentChatId2, to: chatId });
      const currentMessagesHtml = document.getElementById("chatMessages").innerHTML;
      if (chatSessions2[currentChatId2]) {
        chatSessions2[currentChatId2].messagesHtml = currentMessagesHtml;
      }
      currentChatId2 = chatId;
      const session = chatSessions2[chatId];
      if (session) {
        setCurrentMode(session.mode);
        document.querySelectorAll(".mode-btn").forEach((b) => {
          b.classList.toggle("active", b.dataset.mode === session.mode);
        });
        const container = document.getElementById("chatMessages");
        container.innerHTML = session.messagesHtml || getEmptyStateHtml2();
        container.scrollTop = container.scrollHeight;
        const generating = session.isGenerating || false;
        document.getElementById("sendBtn").disabled = generating;
        document.getElementById("sendBtn").style.display = generating ? "none" : "block";
        document.getElementById("stopBtn").style.display = generating ? "block" : "none";
        document.getElementById("statusDot").classList.toggle("thinking", generating);
        document.getElementById("statusText").textContent = generating ? "Generating..." : "Ready";
        updateTokenBar2(currentChatId2);
      }
      renderChatTabs2();
      updateTokenBar2(currentChatId2);
      syncState();
      saveChatState2();
    }
    function addToMessageHistory2(role, content, chatId = currentChatId2) {
      console.log("[MC DEBUG] addToMessageHistory:", role, "chatId:", chatId, "content:", (content || "").substring(0, 50));
      if (chatSessions2[chatId]) {
        chatSessions2[chatId].messageHistory.push({ role, content });
        console.log("[MC DEBUG] History now has", chatSessions2[chatId].messageHistory.length, "messages");
        updateTokenBar2(chatId);
        saveChatState2();
      } else {
        console.log("[MC DEBUG] WARNING: chatSessions[chatId] is undefined!", chatId);
      }
    }
    function getMessageHistory2() {
      return chatSessions2[currentChatId2]?.messageHistory || [];
    }
    function closeChat2(chatId) {
      if (Object.keys(chatSessions2).length <= 1) {
        return;
      }
      delete chatSessions2[chatId];
      if (chatId === currentChatId2) {
        const remainingIds = Object.keys(chatSessions2);
        switchChat2(remainingIds[0]);
      }
      renderChatTabs2();
      saveChatState2();
    }
    function renderChatTabs2() {
      const container = document.getElementById("chatTabs");
      if (!container) {
        return;
      }
      const tabs = Object.values(chatSessions2).map((session) => {
        const provider = session.provider || "claude";
        return `
        <div class="chat-tab ${session.id === currentChatId2 ? "active" : ""} provider-${provider} ${session.isGenerating ? "generating" : ""}"
             data-chat-id="${session.id}"
             onclick="switchChat('${session.id}')">
          <div class="chat-tab-dot provider-${provider}">${session.isGenerating ? '<span class="tab-spinner"></span>' : ""}</div>
          <span>${session.id.slice(-4)}</span>
          <span class="chat-tab-close" onclick="event.stopPropagation(); closeChat('${session.id}')">\xD7</span>
        </div>
      `;
      }).join("");
      container.innerHTML = tabs + '<button class="chat-tab-new" onclick="newChat()">+</button>';
    }
    function saveChatState2() {
      const currentMessagesHtml = document.getElementById("chatMessages").innerHTML;
      if (chatSessions2[currentChatId2]) {
        chatSessions2[currentChatId2].messagesHtml = currentMessagesHtml;
      }
      const state = {
        tabs: Object.values(chatSessions2).map((session) => ({
          id: session.id,
          name: session.name,
          mode: session.mode,
          provider: session.provider || "claude",
          claudeSessionId: session.claudeSessionId,
          messagesHtml: session.messagesHtml,
          messageHistory: session.messageHistory
        })),
        activeTabId: currentChatId2,
        chatCounter: chatCounter2
      };
      console.log("[ChatSessions] Saving state, activeTabId:", currentChatId2);
      vscode2.postMessage({ type: "saveChatState", state });
    }
    function restoreChatState2(state) {
      if (!state || !state.tabs || state.tabs.length === 0)
        return;
      console.log("[ChatSessions] Restoring state, activeTabId:", state.activeTabId);
      chatSessions2 = {};
      state.tabs.forEach((tab) => {
        const chatId = tab.id && tab.id.startsWith("chat-") ? tab.id : generateChatId();
        console.log("[ChatSessions] Restoring tab:", chatId, "original:", tab.id);
        chatSessions2[chatId] = {
          id: chatId,
          name: tab.name,
          mode: tab.mode,
          provider: tab.provider || "claude",
          claudeSessionId: generateUUID(),
          messagesHtml: tab.messagesHtml || "",
          messageHistory: tab.messageHistory || [],
          isGenerating: false
        };
      });
      if (state.chatCounter) {
        chatCounter2 = state.chatCounter;
      } else {
        chatCounter2 = Object.keys(chatSessions2).length;
      }
      const tabIds = Object.keys(chatSessions2);
      console.log("[ChatSessions] Tab IDs:", tabIds, "looking for:", state.activeTabId);
      currentChatId2 = tabIds.find((id) => id === state.activeTabId) || tabIds[0];
      console.log("[ChatSessions] Selected:", currentChatId2);
      const session = chatSessions2[currentChatId2];
      if (session) {
        setCurrentMode(session.mode);
        document.querySelectorAll(".mode-btn").forEach((b) => {
          b.classList.toggle("active", b.dataset.mode === session.mode);
        });
        const container = document.getElementById("chatMessages");
        container.innerHTML = session.messagesHtml || getEmptyStateHtml2();
        container.scrollTop = container.scrollHeight;
      }
      renderChatTabs2();
      syncState();
    }
    function getEmptyStateHtml2() {
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
    function showMaxTabsModal() {
      document.getElementById("maxTabsModal").classList.add("visible");
    }
    function closeMaxTabsModal2() {
      document.getElementById("maxTabsModal").classList.remove("visible");
    }
    function syncFromIndexState() {
      chatSessions2 = getChatSessions();
      currentChatId2 = getCurrentChatId();
      chatCounter2 = getChatCounter();
    }
    syncState();
    function setCurrentChatProvider2(provider) {
      if (chatSessions2[currentChatId2]) {
        chatSessions2[currentChatId2].provider = provider;
        renderChatTabs2();
      }
    }
    function getCurrentChatProvider2() {
      return chatSessions2[currentChatId2]?.provider || "claude";
    }
    return {
      newChat: newChat2,
      getClaudeSessionId: getClaudeSessionId2,
      switchChat: switchChat2,
      addToMessageHistory: addToMessageHistory2,
      getMessageHistory: getMessageHistory2,
      closeChat: closeChat2,
      renderChatTabs: renderChatTabs2,
      saveChatState: saveChatState2,
      restoreChatState: restoreChatState2,
      getEmptyStateHtml: getEmptyStateHtml2,
      closeMaxTabsModal: closeMaxTabsModal2,
      syncFromIndexState,
      setCurrentChatProvider: setCurrentChatProvider2,
      getCurrentChatProvider: getCurrentChatProvider2
    };
  }

  // src/webview/panel/features/tickets.ts
  function createTicketPanelHandlers(deps) {
    const {
      vscode: vscode2,
      getPlanList,
      shipSetStatus: shipSetStatus2,
      escapeHtml: escapeHtml2,
      updateTicketStatus: updateTicketStatus2,
      deleteTicket: deleteTicket2
    } = deps;
    let mainTicketList = [];
    let mainTicketFilter = "all";
    const TICKET_KEYWORDS = {
      bug: ["bug", "fix", "broken", "crash", "error", "issue", "defect", "regression", "null", "exception", "fail"],
      feature: ["feature", "add", "new", "implement", "create", "enhance", "ability", "support", "request"],
      doc_update: ["doc", "document", "readme", "wiki", "comment", "explain", "guide", "tutorial"],
      refactor: ["refactor", "clean", "rename", "restructure", "optimize", "simplify", "extract", "move", "split"],
      question: ["question", "how", "why", "what", "help", "unclear", "understand"]
    };
    const PERSONA_LABELS3 = {
      gears: { name: "Gears", color: "#f59e0b" },
      nova: { name: "Nova", color: "#a855f7" },
      index: { name: "Index", color: "#3b82f6" },
      triage: { name: "Triage", color: "#10b981" },
      vault: { name: "Vault", color: "#22c55e" },
      palette: { name: "Palette", color: "#ec4899" }
    };
    function detectTicketType(title, description) {
      const text = (title + " " + description).toLowerCase();
      let bestType = "question";
      let bestScore = 0;
      for (const [type, keywords] of Object.entries(TICKET_KEYWORDS)) {
        let score = 0;
        for (const kw of keywords) {
          if (text.includes(kw))
            score++;
        }
        if (score > bestScore) {
          bestScore = score;
          bestType = type;
        }
      }
      return bestType;
    }
    function getRoutedPersona(ticketType) {
      const routing = { bug: "qa-engineer", feature: "lead-engineer", doc_update: "technical-writer", refactor: "qa-engineer", question: "lead-engineer" };
      return routing[ticketType] || "lead-engineer";
    }
    function updateTicketTypePreview2() {
      const titleEl = document.getElementById("ticketTitleMain");
      const descEl = document.getElementById("ticketDescriptionMain");
      const previewEl = document.getElementById("ticketRoutePreview");
      if (!titleEl || !previewEl)
        return;
      const title = titleEl.value || "";
      const desc = descEl ? descEl.value || "" : "";
      if (!title.trim()) {
        previewEl.style.display = "none";
        return;
      }
      const type = detectTicketType(title, desc);
      const persona = getRoutedPersona(type);
      const info = PERSONA_LABELS3[persona] || { name: persona, color: "#888" };
      previewEl.style.display = "flex";
      previewEl.innerHTML = '<span style="font-size:10px;color:var(--text-secondary);">Auto-route:</span> <span style="font-size:10px;font-weight:600;color:' + info.color + ';">' + type.replace("_", " ").toUpperCase() + " \u2192 " + info.name + "</span>";
    }
    function showTicketsPanel2() {
      document.getElementById("agentsSection").style.display = "none";
      const stationSection = document.getElementById("stationSection");
      if (stationSection)
        stationSection.classList.remove("active");
      document.getElementById("ticketsSection").style.display = "flex";
      document.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("active"));
      const ticketsBtn = document.querySelector(".mode-btn.tickets");
      if (ticketsBtn)
        ticketsBtn.classList.add("active");
      vscode2.postMessage({ type: "getTickets" });
    }
    function hideTicketsPanel2() {
      document.getElementById("ticketsSection").style.display = "none";
    }
    function toggleTicketFormMain2() {
      const formPanel = document.getElementById("ticketFormPanel");
      if (!formPanel)
        return;
      const isVisible = formPanel.style.display !== "none";
      formPanel.style.display = isVisible ? "none" : "block";
      if (!isVisible) {
        const planSelect = document.getElementById("ticketPlanLinkMain");
        const plans = getPlanList();
        if (planSelect && Array.isArray(plans)) {
          planSelect.innerHTML = '<option value="">(no plan)</option>' + plans.map((p) => '<option value="' + p.id + '">' + escapeHtml2(p.summary || p.intent || p.id) + "</option>").join("");
        }
      }
    }
    function createTicketMain2() {
      const titleEl = document.getElementById("ticketTitleMain");
      const descEl = document.getElementById("ticketDescriptionMain");
      const sectorEl = document.getElementById("ticketSectorMain");
      const planEl = document.getElementById("ticketPlanLinkMain");
      const title = titleEl ? titleEl.value.trim() : "";
      if (!title) {
        shipSetStatus2("Ticket title is required.");
        return;
      }
      const description = descEl ? descEl.value.trim() : "";
      const ticketType = detectTicketType(title, description);
      vscode2.postMessage({
        type: "createTicket",
        title,
        description,
        sectorId: sectorEl ? sectorEl.value : "general",
        linkedPlanId: planEl && planEl.value ? planEl.value : void 0
      });
      vscode2.postMessage({
        type: "routeTicket",
        ticketType,
        ticketId: "latest"
      });
      if (titleEl)
        titleEl.value = "";
      if (descEl)
        descEl.value = "";
      const previewEl = document.getElementById("ticketRoutePreview");
      if (previewEl)
        previewEl.style.display = "none";
      toggleTicketFormMain2();
      const persona = getRoutedPersona(ticketType);
      const info = PERSONA_LABELS3[persona] || { name: persona };
      shipSetStatus2("Ticket created \u2192 routed to " + info.name);
    }
    function filterTickets2(filter) {
      mainTicketFilter = filter;
      document.querySelectorAll(".ticket-filters .filter-btn").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.filter === filter);
      });
      renderTicketsListMain2(mainTicketList);
    }
    function renderTicketsListMain2(tickets) {
      mainTicketList = tickets || [];
      const listEl = document.getElementById("ticketsListMain");
      if (!listEl)
        return;
      let filtered = mainTicketList;
      if (mainTicketFilter !== "all") {
        filtered = mainTicketList.filter((t) => t.status === mainTicketFilter);
      }
      if (!Array.isArray(filtered) || filtered.length === 0) {
        listEl.innerHTML = '<div class="empty-tickets"><div class="empty-icon">T</div><p>No tickets ' + (mainTicketFilter !== "all" ? 'with status "' + mainTicketFilter + '"' : "yet") + '</p><p class="empty-hint">Click "+ New Ticket" to create one</p></div>';
        return;
      }
      const statusColors = { "open": "#3b82f6", "in-progress": "#f59e0b", "done": "#22c55e" };
      const statusLabels = { "open": "Open", "in-progress": "In Progress", "done": "Done" };
      listEl.innerHTML = filtered.map((t) => {
        const statusColor = statusColors[t.status] || "#6b7280";
        const statusLabel = statusLabels[t.status] || t.status;
        const nextStatus = t.status === "open" ? "in-progress" : t.status === "in-progress" ? "done" : null;
        const nextLabel = nextStatus ? statusLabels[nextStatus] : "";
        const planInfo = t.linkedPlanId ? '<span class="ticket-plan-badge">Plan linked</span>' : "";
        const descSnippet = t.description ? escapeHtml2(t.description).substring(0, 120) + (t.description.length > 120 ? "..." : "") : "";
        const sectorLabel = t.sectorId || "general";
        let html = '<div class="ticket-card" data-status="' + t.status + '">';
        html += '<div class="ticket-card-header">';
        html += '<span class="ticket-title">' + escapeHtml2(t.title) + "</span>";
        html += '<span class="ticket-status" style="background:' + statusColor + "22; color:" + statusColor + "; border-color:" + statusColor + '44;">' + statusLabel + "</span>";
        html += "</div>";
        if (descSnippet) {
          html += '<div class="ticket-description">' + descSnippet + "</div>";
        }
        html += '<div class="ticket-meta">';
        html += '<span class="ticket-sector">' + escapeHtml2(sectorLabel) + "</span>";
        html += planInfo;
        html += "</div>";
        html += '<div class="ticket-actions">';
        if (nextStatus) {
          html += '<button data-ticket-id="' + t.id + '" data-next-status="' + nextStatus + '" class="ticket-action-btn primary">Move to ' + nextLabel + "</button>";
        }
        html += '<button data-ticket-delete="' + t.id + '" class="ticket-action-btn danger">Delete</button>';
        html += "</div></div>";
        return html;
      }).join("");
      listEl.querySelectorAll(".ticket-action-btn.primary").forEach((btn) => {
        btn.onclick = function() {
          updateTicketStatus2(this.dataset.ticketId, this.dataset.nextStatus);
        };
      });
      listEl.querySelectorAll(".ticket-action-btn.danger").forEach((btn) => {
        btn.onclick = function() {
          deleteTicket2(this.dataset.ticketDelete);
        };
      });
    }
    return {
      showTicketsPanel: showTicketsPanel2,
      hideTicketsPanel: hideTicketsPanel2,
      toggleTicketFormMain: toggleTicketFormMain2,
      createTicketMain: createTicketMain2,
      filterTickets: filterTickets2,
      renderTicketsListMain: renderTicketsListMain2,
      updateTicketTypePreview: updateTicketTypePreview2
    };
  }

  // src/webview/panel/features/ticketsSidebar.ts
  function createTicketsSidebarHandlers(deps) {
    const {
      vscode: vscode2,
      escapeHtml: escapeHtml2,
      shipSetStatus: shipSetStatus2,
      getPlanList
    } = deps;
    let ticketFormVisible = false;
    function toggleTicketForm2() {
      ticketFormVisible = !ticketFormVisible;
      const form = document.getElementById("ticketForm");
      if (form) {
        form.style.display = ticketFormVisible ? "block" : "none";
        if (ticketFormVisible) {
          const planSelect = document.getElementById("ticketPlanLink");
          const planList2 = getPlanList();
          if (planSelect && Array.isArray(planList2)) {
            planSelect.innerHTML = '<option value="">(no plan)</option>' + planList2.map((p) => '<option value="' + p.id + '">' + escapeHtml2(p.summary || p.intent || p.id) + "</option>").join("");
          }
        }
      }
    }
    function createTicket2() {
      const titleEl = document.getElementById("ticketTitle");
      const descEl = document.getElementById("ticketDescription");
      const sectorEl = document.getElementById("ticketSector");
      const planEl = document.getElementById("ticketPlanLink");
      const title = titleEl ? titleEl.value.trim() : "";
      if (!title) {
        shipSetStatus2("Ticket title is required.");
        return;
      }
      vscode2.postMessage({
        type: "createTicket",
        title,
        description: descEl ? descEl.value.trim() : "",
        sectorId: sectorEl ? sectorEl.value : "general",
        linkedPlanId: planEl && planEl.value ? planEl.value : void 0
      });
      if (titleEl)
        titleEl.value = "";
      if (descEl)
        descEl.value = "";
      toggleTicketForm2();
      shipSetStatus2("Ticket created.");
    }
    function refreshTickets2() {
      vscode2.postMessage({ type: "getTickets" });
    }
    function updateTicketStatus2(ticketId, newStatus) {
      vscode2.postMessage({ type: "updateTicketStatus", ticketId, status: newStatus });
    }
    function deleteTicket2(ticketId) {
      if (confirm("Delete this ticket?")) {
        vscode2.postMessage({ type: "deleteTicket", ticketId });
      }
    }
    function renderTicketList2(tickets) {
      const listEl = document.getElementById("ticketList");
      if (!listEl)
        return;
      if (!Array.isArray(tickets) || tickets.length === 0) {
        listEl.innerHTML = '<span style="color:var(--text-secondary);">No tickets yet. Click "+ New" to create one.</span>';
        return;
      }
      const statusColors = { "open": "#3b82f6", "in-progress": "#f59e0b", "done": "#22c55e" };
      const statusLabels = { "open": "Open", "in-progress": "In Progress", "done": "Done" };
      listEl.innerHTML = tickets.map((t) => {
        const statusColor = statusColors[t.status] || "#6b7280";
        const statusLabel = statusLabels[t.status] || t.status;
        const nextStatus = t.status === "open" ? "in-progress" : t.status === "in-progress" ? "done" : null;
        const planInfo = t.linkedPlanId ? " [plan]" : "";
        const descSnippet = t.description ? escapeHtml2(t.description).substring(0, 80) + (t.description.length > 80 ? "..." : "") : "";
        const nextLabel = nextStatus ? statusLabels[nextStatus] : "";
        let html = '<div style="display:flex; flex-direction:column; gap:4px; padding:6px; margin-bottom:4px; border:1px solid var(--border-color); border-radius:4px; background:var(--bg-secondary);">';
        html += '<div style="display:flex; justify-content:space-between; align-items:center;">';
        html += '<span style="font-weight:500;">' + escapeHtml2(t.title) + planInfo + "</span>";
        html += '<span style="padding:2px 6px; border-radius:4px; font-size:9px; background:' + statusColor + "22; color:" + statusColor + "; border:1px solid " + statusColor + '44;">' + statusLabel + "</span>";
        html += "</div>";
        if (descSnippet) {
          html += '<div style="font-size:9px; color:var(--text-secondary);">' + descSnippet + "</div>";
        }
        html += '<div style="display:flex; gap:4px; justify-content:flex-end;">';
        if (nextStatus) {
          html += '<button data-ticket-id="' + t.id + '" data-next-status="' + nextStatus + '" class="ticket-status-btn" style="font-size:9px; padding:2px 6px; border-radius:4px; background:var(--bg-tertiary); border:1px solid var(--border-color); color:var(--text-secondary); cursor:pointer;">&gt; ' + nextLabel + "</button>";
        }
        html += '<button data-ticket-delete="' + t.id + '" class="ticket-delete-btn" style="font-size:9px; padding:2px 6px; border-radius:4px; background:var(--bg-tertiary); border:1px solid var(--border-color); color:var(--error-text); cursor:pointer;">x</button>';
        html += "</div></div>";
        return html;
      }).join("");
      listEl.querySelectorAll(".ticket-status-btn").forEach((btn) => {
        btn.onclick = function() {
          updateTicketStatus2(this.dataset.ticketId, this.dataset.nextStatus);
        };
      });
      listEl.querySelectorAll(".ticket-delete-btn").forEach((btn) => {
        btn.onclick = function() {
          deleteTicket2(this.dataset.ticketDelete);
        };
      });
    }
    return {
      toggleTicketForm: toggleTicketForm2,
      createTicket: createTicket2,
      refreshTickets: refreshTickets2,
      updateTicketStatus: updateTicketStatus2,
      deleteTicket: deleteTicket2,
      renderTicketList: renderTicketList2
    };
  }

  // src/webview/panel/features/skills.ts
  function createSkillsPanelHandlers(deps) {
    const {
      vscode: vscode2,
      escapeHtml: escapeHtml2
    } = deps;
    let skillsList = [];
    let skillsFilter = "all";
    function refreshSkills2() {
      vscode2.postMessage({ type: "getSkills" });
    }
    function createSkill2() {
      vscode2.postMessage({ type: "openSkillCreator" });
    }
    function filterSkills2(category) {
      skillsFilter = category;
      document.querySelectorAll(".skills-categories .category-btn").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.category === category);
      });
      renderSkillsList2(skillsList);
    }
    function renderSkillsList2(skills) {
      skillsList = skills || [];
      const listEl = document.getElementById("skillsList");
      if (!listEl)
        return;
      let filtered = skillsList;
      if (skillsFilter !== "all") {
        filtered = skillsList.filter((s) => s.category === skillsFilter);
      }
      if (!Array.isArray(filtered) || filtered.length === 0) {
        listEl.innerHTML = '<div class="empty-skills"><div class="empty-icon">\u26A1</div><p>No skills ' + (skillsFilter !== "all" ? 'in "' + skillsFilter + '" category' : "yet") + '</p><p class="empty-hint">Skills let you save and reuse common AI tasks</p></div>';
        return;
      }
      listEl.innerHTML = filtered.map((s) => {
        return '<div class="skill-card" data-skill-id="' + s.id + '"><div class="skill-header"><span class="skill-name">' + escapeHtml2(s.name) + '</span><span class="skill-category">' + escapeHtml2(s.category || "custom") + '</span></div><div class="skill-description">' + escapeHtml2(s.description || "") + `</div><div class="skill-actions"><button class="btn-primary btn-sm" onclick="runSkill('` + s.id + `')">Run</button><button class="btn-secondary btn-sm" onclick="editSkill('` + s.id + `')">Edit</button></div></div>`;
      }).join("");
    }
    function runSkill2(skillId) {
      vscode2.postMessage({ type: "runSkill", skillId });
    }
    function editSkill2(skillId) {
      vscode2.postMessage({ type: "editSkill", skillId });
    }
    return {
      refreshSkills: refreshSkills2,
      createSkill: createSkill2,
      filterSkills: filterSkills2,
      renderSkillsList: renderSkillsList2,
      runSkill: runSkill2,
      editSkill: editSkill2
    };
  }

  // src/webview/panel/features/dashboard.ts
  function createDashboardHandlers(deps) {
    const {
      vscode: vscode2,
      escapeHtml: escapeHtml2,
      shipSetStatus: shipSetStatus2,
      setDashboardSubtab,
      setCurrentPersona,
      getPersonaManualOverride,
      PERSONA_MAP: PERSONA_MAP2
    } = deps;
    let dashboardMetrics = {};
    let activityList = [];
    let dashboardTicketFormVisible = false;
    function toggleTicketFormDashboard2() {
      dashboardTicketFormVisible = !dashboardTicketFormVisible;
      const form = document.getElementById("dashboardTicketForm");
      if (form)
        form.style.display = dashboardTicketFormVisible ? "block" : "none";
    }
    function createTicketFromDashboard2() {
      const titleEl = document.getElementById("dashboardTicketTitle");
      const descEl = document.getElementById("dashboardTicketDescription");
      const priorityEl = document.getElementById("dashboardTicketPriority");
      const sectorEl = document.getElementById("dashboardTicketSector");
      const title = titleEl ? titleEl.value.trim() : "";
      if (!title) {
        if (shipSetStatus2)
          shipSetStatus2("Ticket title is required.");
        return;
      }
      vscode2.postMessage({
        type: "createTicket",
        title,
        description: descEl ? descEl.value.trim() : "",
        priority: priorityEl ? priorityEl.value : "medium",
        sectorId: sectorEl ? sectorEl.value : ""
      });
      if (titleEl)
        titleEl.value = "";
      if (descEl)
        descEl.value = "";
      toggleTicketFormDashboard2();
      if (shipSetStatus2)
        shipSetStatus2("Ticket created.");
    }
    function refreshDbStats2() {
      vscode2.postMessage({ type: "getDbStats" });
    }
    function scanProjectDocs2() {
      vscode2.postMessage({ type: "scanProjectDocs" });
    }
    function refreshDocs2() {
      vscode2.postMessage({ type: "getDocs" });
    }
    function ingestKbSource2() {
      const urlEl = document.getElementById("kbSourceUrl");
      const url = urlEl ? urlEl.value.trim() : "";
      if (!url) {
        if (shipSetStatus2)
          shipSetStatus2("Enter a URL or path to ingest.");
        return;
      }
      vscode2.postMessage({ type: "ingestKbSource", url });
      if (urlEl)
        urlEl.value = "";
      if (shipSetStatus2)
        shipSetStatus2("Ingesting source...");
    }
    function refreshDashboard2() {
      vscode2.postMessage({ type: "getDashboardMetrics" });
      vscode2.postMessage({ type: "getTickets" });
      vscode2.postMessage({ type: "getRecentActivity" });
    }
    function updateDashboardMetrics2(metrics) {
      dashboardMetrics = metrics || {};
      const ticketsEl = document.getElementById("metricTicketsOpen");
      const plansEl = document.getElementById("metricPlansActive");
      const agentsEl = document.getElementById("metricAgentsRunning");
      const tokensEl = document.getElementById("metricTokensToday");
      if (ticketsEl)
        ticketsEl.textContent = metrics.openTickets || 0;
      if (plansEl)
        plansEl.textContent = metrics.activePlans || 0;
      if (agentsEl)
        agentsEl.textContent = metrics.runningAgents || 0;
      if (tokensEl)
        tokensEl.textContent = formatNumber(metrics.tokensToday || 0);
    }
    function renderActivityList2(activities) {
      activityList = activities || [];
      const listEl = document.getElementById("activityList");
      if (!listEl)
        return;
      if (!Array.isArray(activityList) || activityList.length === 0) {
        listEl.innerHTML = '<div class="empty-activity"><p>No recent activity</p></div>';
        return;
      }
      listEl.innerHTML = activityList.slice(0, 10).map((a) => {
        const timeAgo = formatTimeAgo(a.timestamp);
        return '<div class="activity-item"><span class="activity-icon">' + getActivityIcon(a.type) + '</span><span class="activity-text">' + escapeHtml2(a.message) + '</span><span class="activity-time">' + timeAgo + "</span></div>";
      }).join("");
    }
    function renderTicketsSummary2(tickets) {
      const summaryEl = document.getElementById("ticketsSummary");
      if (!summaryEl)
        return;
      const openCount = (tickets || []).filter((t) => t.status === "open").length;
      const inProgressCount = (tickets || []).filter((t) => t.status === "in-progress").length;
      const doneCount = (tickets || []).filter((t) => t.status === "done").length;
      summaryEl.innerHTML = '<div class="tickets-summary-row"><span class="summary-item"><span class="summary-dot open"></span>Open: ' + openCount + '</span><span class="summary-item"><span class="summary-dot in-progress"></span>In Progress: ' + inProgressCount + '</span><span class="summary-item"><span class="summary-dot done"></span>Done: ' + doneCount + "</span></div>";
    }
    function formatNumber(num) {
      if (num >= 1e6)
        return (num / 1e6).toFixed(1) + "M";
      if (num >= 1e3)
        return (num / 1e3).toFixed(1) + "K";
      return num.toString();
    }
    function getActivityIcon(type) {
      const icons = {
        "chat": "\u{1F4AC}",
        "plan": "\u{1F4CB}",
        "ticket": "\u{1F3AB}",
        "agent": "\u{1F916}",
        "build": "\u{1F528}",
        "error": "\u274C",
        "success": "\u2705"
      };
      return icons[type] || "\u{1F4CC}";
    }
    function formatTimeAgo(timestamp) {
      const now = Date.now();
      const diff = now - timestamp;
      const minutes = Math.floor(diff / 6e4);
      const hours = Math.floor(diff / 36e5);
      const days = Math.floor(diff / 864e5);
      if (minutes < 1)
        return "just now";
      if (minutes < 60)
        return minutes + "m ago";
      if (hours < 24)
        return hours + "h ago";
      return days + "d ago";
    }
    const panelIds = {
      docs: "dashboardDocsPanel",
      tickets: "dashboardTicketsPanel",
      db: "dashboardDbPanel",
      mcp: "dashboardMcpPanel",
      logs: "dashboardLogsPanel",
      settings: "dashboardSettingsPanel",
      mission: "dashboardMissionPanel",
      storage: "dashboardStoragePanel",
      art: "dashboardArtPanel",
      info: "dashboardInfoPanel"
    };
    function switchDashboardSubtab2(subtab) {
      Object.values(panelIds).forEach((id) => {
        const el = document.getElementById(id);
        if (el)
          el.style.display = "none";
      });
      const targetId = panelIds[subtab];
      if (targetId) {
        const targetEl = document.getElementById(targetId);
        if (targetEl) {
          targetEl.style.display = "block";
          console.log("[Dashboard] Showing panel:", targetId, "found:", !!targetEl, "height:", targetEl.offsetHeight);
        } else {
          console.warn("[Dashboard] Panel element NOT FOUND:", targetId);
        }
      }
      document.querySelectorAll(".dashboard-subtab").forEach((btn) => {
        btn.classList.toggle("active", btn.getAttribute("data-subtab") === subtab);
      });
      if (setDashboardSubtab)
        setDashboardSubtab(subtab);
      if (!getPersonaManualOverride || !getPersonaManualOverride()) {
        const persona = PERSONA_MAP2 && PERSONA_MAP2["dashboard:" + subtab];
        if (persona && setCurrentPersona)
          setCurrentPersona(persona);
      }
      if (subtab === "settings") {
        vscode2.postMessage({ type: "getSettings" });
        vscode2.postMessage({ type: "getCliStatus" });
        vscode2.postMessage({ type: "getToolbarSettings" });
      } else if (subtab === "mcp") {
        vscode2.postMessage({ type: "getMcpServers" });
        vscode2.postMessage({ type: "unityCheckConnection" });
      } else if (subtab === "logs") {
        vscode2.postMessage({ type: "getLogs" });
      } else if (subtab === "db") {
        vscode2.postMessage({ type: "getDbStats" });
      } else if (subtab === "mission") {
        vscode2.postMessage({ type: "getMissionData" });
      } else if (subtab === "storage") {
        vscode2.postMessage({ type: "getStorageStats" });
      } else if (subtab === "art") {
        vscode2.postMessage({ type: "getArtStudioData" });
      } else if (subtab === "info") {
        vscode2.postMessage({ type: "getSettingsFilePath" });
      }
    }
    function openSettingsFile2() {
      vscode2.postMessage({ type: "openSettingsFile" });
    }
    return {
      refreshDashboard: refreshDashboard2,
      updateDashboardMetrics: updateDashboardMetrics2,
      renderActivityList: renderActivityList2,
      renderTicketsSummary: renderTicketsSummary2,
      switchDashboardSubtab: switchDashboardSubtab2,
      toggleTicketFormDashboard: toggleTicketFormDashboard2,
      createTicketFromDashboard: createTicketFromDashboard2,
      refreshDbStats: refreshDbStats2,
      scanProjectDocs: scanProjectDocs2,
      refreshDocs: refreshDocs2,
      ingestKbSource: ingestKbSource2,
      openSettingsFile: openSettingsFile2
    };
  }

  // src/webview/panel/features/dashboardStats.ts
  function createDashboardStatsHandlers(deps) {
    const { vscode: vscode2, escapeHtml: escapeHtml2 } = deps;
    function updateDocsStats(stats) {
      if (stats.kbChunks !== void 0)
        document.getElementById("docsKbChunks")?.textContent && (document.getElementById("docsKbChunks").textContent = stats.kbChunks.toLocaleString());
      if (stats.projectDocs !== void 0)
        document.getElementById("docsProjectDocs")?.textContent && (document.getElementById("docsProjectDocs").textContent = stats.projectDocs.toLocaleString());
      if (stats.externalKb !== void 0)
        document.getElementById("docsExternalKb")?.textContent && (document.getElementById("docsExternalKb").textContent = stats.externalKb.toLocaleString());
    }
    function updateTicketStats(stats) {
      const ids = { ticketsOpen: stats.open, ticketsInProgress: stats.inProgress, ticketsDone: stats.done, ticketsTotal: stats.total };
      Object.entries(ids).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el)
          el.textContent = (val || 0).toLocaleString();
      });
    }
    function updateTicketsList(tickets) {
      const list = document.getElementById("dashboardTicketsList");
      if (!list)
        return;
      if (!tickets || tickets.length === 0) {
        list.innerHTML = '<div class="empty-state">No tickets yet. Create one to get started.</div>';
        return;
      }
      list.innerHTML = tickets.map((t) => `
        <div class="ticket-item" onclick="viewTicket('${t.id}')">
          <span class="ticket-status-badge ${t.status}"></span>
          <div class="ticket-info">
            <div class="ticket-title">${escapeHtml2(t.title)}</div>
            <div class="ticket-meta">${t.sector || "No sector"} \xB7 ${t.priority}</div>
          </div>
          <div class="ticket-actions">
            <button class="btn-sm btn-primary" onclick="event.stopPropagation(); executeTicket('${t.id}')" title="Execute">\u25B6</button>
          </div>
        </div>
      `).join("");
    }
    function updateDbStats(stats) {
      const ids = { dbVectorCount: stats.vectors, dbChunkCount: stats.chunks };
      Object.entries(ids).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el)
          el.textContent = (val || 0).toLocaleString();
      });
      const cacheEl = document.getElementById("dbCacheHitRate");
      if (cacheEl)
        cacheEl.textContent = (stats.cacheHitRate || 0) + "%";
      const storageEl = document.getElementById("dbStorageSize");
      if (storageEl)
        storageEl.textContent = formatBytes(stats.storageSize || 0);
    }
    function updateRagHealth(health) {
      const latencyEl = document.getElementById("ragLatency");
      if (latencyEl)
        latencyEl.textContent = (health.latency || "-") + " ms";
      const embeddingEl = document.getElementById("ragEmbeddingStatus");
      if (embeddingEl) {
        embeddingEl.textContent = health.embeddingStatus || "Unknown";
        embeddingEl.className = "health-value " + (health.embeddingStatus === "Ready" ? "health-good" : "health-warn");
      }
    }
    function updateDocsPanel2(stats) {
      if (!stats)
        return;
      const totalEl = document.getElementById("docsKbChunks");
      if (totalEl)
        totalEl.textContent = (stats.totalChunks || 0).toLocaleString();
      const projectEl = document.getElementById("docsProjectDocs");
      if (projectEl)
        projectEl.textContent = (stats.totalDocs || 0).toLocaleString();
      const embeddedEl = document.getElementById("docsExternalKb");
      if (embeddedEl)
        embeddedEl.textContent = (stats.embeddedDocs || 0).toLocaleString();
      const sourcesList = document.getElementById("kbSourcesList");
      if (sourcesList && stats.sources) {
        if (stats.sources.length === 0) {
          sourcesList.innerHTML = '<div class="empty-state">No KB sources yet. Ingest a URL or scan project docs.</div>';
        } else {
          sourcesList.innerHTML = stats.sources.map((s) => `
            <div class="kb-source-item">
              <span class="kb-source-icon">${s.type === "url" ? "\u{1F517}" : "\u{1F4C4}"}</span>
              <span class="kb-source-title">${escapeHtml2(s.title || s.id)}</span>
              <span class="kb-source-meta">${s.chunkCount} chunks${s.embedded ? " \u2713" : ""}</span>
            </div>
          `).join("");
        }
      }
    }
    function updateDbPanel2(stats) {
      if (!stats)
        return;
      const vectorEl = document.getElementById("dbVectorCount");
      if (vectorEl)
        vectorEl.textContent = (stats.vectors?.count || 0).toLocaleString();
      const chunkEl = document.getElementById("dbChunkCount");
      if (chunkEl)
        chunkEl.textContent = (stats.vectors?.count || 0).toLocaleString();
      const msgCountEl = document.getElementById("dbMessageCount");
      if (msgCountEl)
        msgCountEl.textContent = (stats.messages?.count || 0).toLocaleString();
      const sessionsEl = document.getElementById("dbSessionCount");
      if (sessionsEl)
        sessionsEl.textContent = (stats.messages?.sessions || 0).toLocaleString();
      const embeddingEl = document.getElementById("ragEmbeddingStatus");
      if (embeddingEl) {
        const ready = stats.embedding?.ready;
        embeddingEl.textContent = ready ? "Ready" : "Not Ready";
        embeddingEl.className = "health-value " + (ready ? "health-good" : "health-warn");
      }
      const modelEl = document.getElementById("ragModelName");
      if (modelEl)
        modelEl.textContent = stats.embedding?.model || "Not loaded";
    }
    function updateLogsPanel2(logs, channel) {
      const logsList = document.getElementById("dashboardLogsList");
      if (!logsList)
        return;
      if (!logs || logs.length === 0) {
        logsList.innerHTML = '<div class="empty-state">No logs available</div>';
        return;
      }
      logsList.innerHTML = logs.map((log) => {
        const levelClass = log.level === "error" ? "log-error" : log.level === "warn" ? "log-warn" : "log-info";
        const time = new Date(log.timestamp).toLocaleTimeString();
        return `
          <div class="log-entry ${levelClass}">
            <span class="log-time">${time}</span>
            <span class="log-channel">[${log.channel}]</span>
            <span class="log-message">${escapeHtml2(log.message)}</span>
          </div>
        `;
      }).join("");
      logsList.scrollTop = logsList.scrollHeight;
    }
    function refreshLogs(channel) {
      vscode2.postMessage({ type: "getLogs", channel, limit: 100 });
    }
    function formatBytes(bytes) {
      if (bytes === 0)
        return "0 B";
      const k = 1024;
      const sizes = ["B", "KB", "MB", "GB"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    }
    return {
      updateDocsStats,
      updateTicketStats,
      updateTicketsList,
      updateDbStats,
      updateRagHealth,
      updateDocsPanel: updateDocsPanel2,
      updateDbPanel: updateDbPanel2,
      updateLogsPanel: updateLogsPanel2,
      refreshLogs
    };
  }

  // src/webview/panel/features/agents.ts
  function createAgentsPanelHandlers(deps) {
    const {
      vscode: vscode2,
      escapeHtml: escapeHtml2
    } = deps;
    let editor = null;
    let currentWorkflowId = null;
    let selectedNodeId = null;
    let workflows = [];
    let canvasNodes = [];
    let nodeIdCounter = 1;
    function ensureInitialized() {
      if (!editor) {
        initDrawflow();
        editor = { initialized: true };
      }
    }
    function requestWorkflows2() {
      vscode2.postMessage({ type: "getWorkflows" });
    }
    function setWorkflows2(next) {
      workflows = next || [];
      updateWorkflowList2();
    }
    function handleWorkflowEvent2(event) {
      const outputEl = document.getElementById("workflowOutputContent");
      if (!outputEl)
        return;
      switch (event.type) {
        case "nodeStart":
          outputEl.innerHTML += '<p style="color: var(--text-secondary);">\u25B6 Running node: ' + event.nodeId + "</p>";
          const runningNode = document.getElementById(event.nodeId);
          if (runningNode) {
            runningNode.style.boxShadow = "0 0 0 3px #10b981";
          }
          break;
        case "nodeComplete":
          outputEl.innerHTML += '<p style="color: #10b981;">\u2713 Node complete: ' + event.nodeId + "</p>";
          const completedNode = document.getElementById(event.nodeId);
          if (completedNode) {
            completedNode.style.boxShadow = "none";
          }
          break;
        case "nodeError":
          outputEl.innerHTML += '<p style="color: var(--error-text);">\u2717 Node error: ' + event.error + "</p>";
          break;
        case "workflowComplete":
          outputEl.innerHTML += '<hr style="border-color: var(--border-color); margin: 12px 0;"><h4>Result:</h4><pre style="white-space: pre-wrap;">' + escapeHtml2(event.result || "") + "</pre>";
          break;
        case "workflowError":
          outputEl.innerHTML += '<p style="color: var(--error-text);">Workflow error: ' + event.error + "</p>";
          break;
      }
    }
    function initDrawflow() {
      const container = document.getElementById("drawflowCanvas");
      if (!container)
        return;
      container.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; height: 100%; flex-direction: column; color: var(--text-secondary);">
        <div style="font-size: 48px; margin-bottom: 16px;">\u{1F527}</div>
        <p>Drag nodes from the left panel to create your workflow</p>
        <p style="font-size: 12px; margin-top: 8px;">Connect nodes by dragging from outputs to inputs</p>
      </div>
    `;
      setupNodePalette();
    }
    function setupNodePalette() {
      const paletteNodes = document.querySelectorAll(".palette-node");
      const canvas = document.getElementById("drawflowCanvas");
      paletteNodes.forEach((node) => {
        node.addEventListener("dragstart", (e) => {
          e.dataTransfer.setData("nodeType", node.dataset.node);
        });
      });
      canvas.addEventListener("dragover", (e) => {
        e.preventDefault();
      });
      canvas.addEventListener("drop", (e) => {
        e.preventDefault();
        const nodeType = e.dataTransfer.getData("nodeType");
        if (nodeType) {
          addNodeToCanvas(nodeType, e.offsetX, e.offsetY);
        }
      });
    }
    function addNodeToCanvas(type, x, y) {
      const canvas = document.getElementById("drawflowCanvas");
      if (canvasNodes.length === 0) {
        canvas.innerHTML = "";
        canvas.style.position = "relative";
      }
      const nodeId = "node-" + nodeIdCounter++;
      const colors = {
        input: "#10b981",
        agent: "#8b5cf6",
        output: "#f59e0b"
      };
      const icons = {
        input: "\u{1F4E5}",
        agent: "\u{1F916}",
        output: "\u{1F4E4}"
      };
      const labels = {
        input: "Input",
        agent: "Agent",
        output: "Output"
      };
      const nodeEl = document.createElement("div");
      nodeEl.id = nodeId;
      nodeEl.className = "canvas-node " + type + "-node";
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
      ${type !== "input" ? '<div class="node-input" style="position: absolute; left: -8px; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; background: var(--accent-color); border-radius: 50%; cursor: crosshair;"></div>' : ""}
      ${type !== "output" ? '<div class="node-output" style="position: absolute; right: -8px; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; background: var(--accent-color); border-radius: 50%; cursor: crosshair;"></div>' : ""}
    `;
      makeNodeDraggable(nodeEl);
      nodeEl.addEventListener("click", (e) => {
        e.stopPropagation();
        selectNode(nodeId, type);
      });
      canvas.appendChild(nodeEl);
      const nodeData = {
        id: nodeId,
        type,
        x: x - 80,
        y: y - 30,
        config: type === "agent" ? { provider: "claude", systemPrompt: "You are a helpful assistant." } : { label: labels[type] }
      };
      canvasNodes.push(nodeData);
      selectNode(nodeId, type);
    }
    function makeNodeDraggable(nodeEl) {
      let isDragging = false;
      let startX, startY, startLeft, startTop;
      nodeEl.addEventListener("mousedown", (e) => {
        if (e.target.classList.contains("node-input") || e.target.classList.contains("node-output"))
          return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startLeft = parseInt(nodeEl.style.left) || 0;
        startTop = parseInt(nodeEl.style.top) || 0;
        nodeEl.style.zIndex = 100;
      });
      document.addEventListener("mousemove", (e) => {
        if (!isDragging)
          return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        nodeEl.style.left = startLeft + dx + "px";
        nodeEl.style.top = startTop + dy + "px";
        const nodeData = canvasNodes.find((n) => n.id === nodeEl.id);
        if (nodeData) {
          nodeData.x = startLeft + dx;
          nodeData.y = startTop + dy;
        }
      });
      document.addEventListener("mouseup", () => {
        isDragging = false;
        nodeEl.style.zIndex = 1;
      });
    }
    function selectNode(nodeId, type) {
      document.querySelectorAll(".canvas-node").forEach((n) => n.style.boxShadow = "none");
      const nodeEl = document.getElementById(nodeId);
      if (nodeEl) {
        nodeEl.style.boxShadow = "0 0 0 2px var(--accent-color)";
      }
      selectedNodeId = nodeId;
      showNodeConfig(nodeId, type);
    }
    function showNodeConfig(nodeId, type) {
      const nodeData = canvasNodes.find((n) => n.id === nodeId);
      if (!nodeData)
        return;
      document.querySelector(".config-empty").style.display = "none";
      const configPanel = document.getElementById("nodeConfigPanel");
      configPanel.style.display = "block";
      document.getElementById("configNodeType").textContent = type.charAt(0).toUpperCase() + type.slice(1) + " Node";
      let configHtml = "";
      if (type === "agent") {
        const config = nodeData.config || {};
        configHtml = `
        <div class="config-field">
          <label>Provider</label>
          <select id="nodeProvider" onchange="updateNodeConfig()">
            <option value="claude" ${config.provider === "claude" ? "selected" : ""}>Claude</option>
            <option value="gpt" ${config.provider === "gpt" ? "selected" : ""}>GPT</option>
          </select>
        </div>
        <div class="config-field">
          <label>System Prompt</label>
          <textarea id="nodeSystemPrompt" onchange="updateNodeConfig()" placeholder="Enter system prompt...">${config.systemPrompt || ""}</textarea>
        </div>
      `;
      } else {
        const config = nodeData.config || {};
        configHtml = `
        <div class="config-field">
          <label>Label</label>
          <input type="text" id="nodeLabel" value="${config.label || ""}" onchange="updateNodeConfig()">
        </div>
      `;
      }
      configHtml += `
      <div style="margin-top: 20px;">
        <button class="btn-secondary" onclick="deleteSelectedNode()" style="width: 100%; color: var(--error-text);">Delete Node</button>
      </div>
    `;
      document.getElementById("configContent").innerHTML = configHtml;
    }
    function updateNodeConfig2() {
      if (!selectedNodeId)
        return;
      const nodeData = canvasNodes.find((n) => n.id === selectedNodeId);
      if (!nodeData)
        return;
      if (nodeData.type === "agent") {
        nodeData.config = {
          provider: document.getElementById("nodeProvider")?.value || "claude",
          systemPrompt: document.getElementById("nodeSystemPrompt")?.value || ""
        };
      } else {
        nodeData.config = {
          label: document.getElementById("nodeLabel")?.value || ""
        };
      }
    }
    function deleteSelectedNode2() {
      if (!selectedNodeId)
        return;
      const nodeEl = document.getElementById(selectedNodeId);
      if (nodeEl) {
        nodeEl.remove();
      }
      canvasNodes = canvasNodes.filter((n) => n.id !== selectedNodeId);
      selectedNodeId = null;
      document.querySelector(".config-empty").style.display = "block";
      document.getElementById("nodeConfigPanel").style.display = "none";
    }
    function newWorkflow2() {
      currentWorkflowId = "workflow-" + Date.now();
      document.getElementById("workflowName").value = "New Workflow";
      clearCanvas2();
    }
    function clearCanvas2() {
      const canvas = document.getElementById("drawflowCanvas");
      canvas.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; height: 100%; flex-direction: column; color: var(--text-secondary);">
        <div style="font-size: 48px; margin-bottom: 16px;">\u{1F527}</div>
        <p>Drag nodes from the left panel to create your workflow</p>
        <p style="font-size: 12px; margin-top: 8px;">Connect nodes by dragging from outputs to inputs</p>
      </div>
    `;
      canvasNodes = [];
      nodeIdCounter = 1;
      selectedNodeId = null;
      document.querySelector(".config-empty").style.display = "block";
      document.getElementById("nodeConfigPanel").style.display = "none";
    }
    function saveCurrentWorkflow2() {
      const name = document.getElementById("workflowName").value || "Untitled Workflow";
      if (!currentWorkflowId) {
        currentWorkflowId = "workflow-" + Date.now();
      }
      const workflowData = {
        id: currentWorkflowId,
        name,
        nodes: canvasNodes,
        connections: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      vscode2.postMessage({
        type: "saveWorkflow",
        workflow: workflowData
      });
    }
    function loadWorkflow2(workflowId) {
      const workflow = workflows.find((w) => w.id === workflowId);
      if (!workflow)
        return;
      currentWorkflowId = workflow.id;
      document.getElementById("workflowName").value = workflow.name;
      const canvas = document.getElementById("drawflowCanvas");
      canvas.innerHTML = "";
      canvas.style.position = "relative";
      canvasNodes = [];
      nodeIdCounter = 1;
      if (workflow.nodes) {
        workflow.nodes.forEach((node) => {
          const colors = { input: "#10b981", agent: "#8b5cf6", output: "#f59e0b" };
          const icons = { input: "\u{1F4E5}", agent: "\u{1F916}", output: "\u{1F4E4}" };
          const labels = { input: "Input", agent: "Agent", output: "Output" };
          const nodeEl = document.createElement("div");
          nodeEl.id = node.id;
          nodeEl.className = "canvas-node " + node.type + "-node";
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
          ${node.type !== "input" ? '<div class="node-input" style="position: absolute; left: -8px; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; background: var(--accent-color); border-radius: 50%;"></div>' : ""}
          ${node.type !== "output" ? '<div class="node-output" style="position: absolute; right: -8px; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; background: var(--accent-color); border-radius: 50%;"></div>' : ""}
        `;
          makeNodeDraggable(nodeEl);
          nodeEl.addEventListener("click", (e) => {
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
        const maxId = Math.max(...canvasNodes.map((n) => parseInt(n.id.replace("node-", "")) || 0));
        nodeIdCounter = maxId + 1;
      }
      document.querySelectorAll(".workflow-item").forEach((item) => {
        item.classList.toggle("active", item.dataset.id === workflowId);
      });
    }
    function deleteWorkflow2(workflowId) {
      if (confirm("Delete this workflow?")) {
        vscode2.postMessage({ type: "deleteWorkflow", workflowId });
      }
    }
    function importWorkflow2() {
      vscode2.postMessage({ type: "importWorkflow" });
    }
    function exportCurrentWorkflow2() {
      if (currentWorkflowId) {
        vscode2.postMessage({ type: "exportWorkflow", workflowId: currentWorkflowId });
      } else {
        alert("Please save the workflow first");
      }
    }
    function runWorkflow2() {
      const input = document.getElementById("workflowInput").value.trim();
      if (!input) {
        alert("Please enter a message to run through the workflow");
        return;
      }
      if (canvasNodes.length === 0) {
        alert("Please create a workflow first");
        return;
      }
      const workflowData = {
        id: currentWorkflowId || "temp-" + Date.now(),
        name: document.getElementById("workflowName").value || "Temp Workflow",
        nodes: canvasNodes.map((n) => ({
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
      vscode2.postMessage({
        type: "executeWorkflow",
        workflowId: currentWorkflowId,
        input,
        drawflowData: {
          drawflow: {
            Home: {
              data: canvasNodes.reduce((acc, node) => {
                acc[node.id] = {
                  id: parseInt(node.id.replace("node-", "")) || 1,
                  name: node.type,
                  data: node.config,
                  class: node.type + "-node",
                  html: "",
                  typenode: false,
                  inputs: node.type !== "input" ? { input_1: { connections: [] } } : {},
                  outputs: node.type !== "output" ? { output_1: { connections: [] } } : {},
                  pos_x: node.x,
                  pos_y: node.y
                };
                return acc;
              }, {})
            }
          }
        }
      });
      document.getElementById("workflowOutput").style.display = "flex";
      document.getElementById("workflowOutputContent").innerHTML = '<p style="color: var(--text-secondary);">Running workflow...</p>';
    }
    function buildConnections() {
      const sorted = [...canvasNodes].sort((a, b) => a.x - b.x);
      const connections = [];
      for (let i = 0; i < sorted.length - 1; i++) {
        connections.push({
          id: `conn-${i}`,
          fromNodeId: sorted[i].id,
          fromOutput: "output_1",
          toNodeId: sorted[i + 1].id,
          toInput: "input_1"
        });
      }
      return connections;
    }
    function closeWorkflowOutput2() {
      document.getElementById("workflowOutput").style.display = "none";
    }
    function updateWorkflowList2() {
      const listEl = document.getElementById("workflowList");
      if (workflows.length === 0) {
        listEl.innerHTML = '<p class="empty-text">No workflows yet</p>';
        return;
      }
      listEl.innerHTML = workflows.map((w) => `
      <div class="workflow-item ${w.id === currentWorkflowId ? "active" : ""}" data-id="${w.id}" onclick="loadWorkflow('${w.id}')">
        <span class="workflow-item-name">${escapeHtml2(w.name)}</span>
        <span class="workflow-item-delete" onclick="event.stopPropagation(); deleteWorkflow('${w.id}')">\u{1F5D1}\uFE0F</span>
      </div>
    `).join("");
    }
    return {
      ensureInitialized,
      requestWorkflows: requestWorkflows2,
      setWorkflows: setWorkflows2,
      updateWorkflowList: updateWorkflowList2,
      newWorkflow: newWorkflow2,
      clearCanvas: clearCanvas2,
      saveCurrentWorkflow: saveCurrentWorkflow2,
      loadWorkflow: loadWorkflow2,
      deleteWorkflow: deleteWorkflow2,
      importWorkflow: importWorkflow2,
      exportCurrentWorkflow: exportCurrentWorkflow2,
      runWorkflow: runWorkflow2,
      closeWorkflowOutput: closeWorkflowOutput2,
      updateNodeConfig: updateNodeConfig2,
      deleteSelectedNode: deleteSelectedNode2,
      handleWorkflowEvent: handleWorkflowEvent2
    };
  }

  // src/webview/panel/features/chatInput.ts
  function createChatInputHandlers(deps) {
    const {
      vscode: vscode2,
      addMessage: addMessage2,
      getMessageHistory: getMessageHistory2,
      addToMessageHistory: addToMessageHistory2,
      getClaudeSessionId: getClaudeSessionId2,
      getShipSelectedSectorId: getShipSelectedSectorId2,
      shipSetStatus: shipSetStatus2,
      getCurrentChatId,
      getChatSessions,
      getCurrentChatMode,
      getSelectedModel: getSelectedModel2,
      getGptConsultEnabled: getGptConsultEnabled2,
      getGptInterventionLevel: getGptInterventionLevel2,
      getAttachedImages,
      setAttachedImages,
      setGenerating: setGenerating2,
      updateSendStopButton: updateSendStopButton2,
      stopConversation: stopConversation2,
      getCurrentPersona
    } = deps;
    function getImages() {
      return getAttachedImages() || [];
    }
    function setImages(next) {
      setAttachedImages(next);
    }
    function sendMessage2() {
      const input = document.getElementById("messageInput");
      const text = input.value.trim();
      const chatId = getCurrentChatId();
      const chatSessions2 = getChatSessions();
      if (!text)
        return;
      if (text.startsWith("/") && typeof window.tryNavigationCommand === "function") {
        if (window.tryNavigationCommand(text)) {
          input.value = "";
          autoResize2(input);
          return;
        }
      }
      if (chatSessions2[chatId]?.isGenerating) {
        stopConversation2();
        setTimeout(() => {
          sendMessageInternal(input, text, chatId);
        }, 100);
        return;
      }
      sendMessageInternal(input, text, chatId);
    }
    function sendMessageInternal(input, text, chatId) {
      const includeSelection = document.getElementById("includeSelection")?.checked || false;
      const injectContext = document.getElementById("injectContextToggle")?.checked ?? true;
      const docSelect = document.getElementById("docTargetSelect");
      const docTargetValue = docSelect ? docSelect.value : "";
      const profileSelect = document.getElementById("shipProfileSelect");
      const profileValue = profileSelect ? profileSelect.value : "yard";
      if (profileValue !== "yard" && !docTargetValue) {
        shipSetStatus2("Select a docs file before sending when not in Yard mode.");
        return;
      }
      const images = getImages();
      const displayText = images.length > 0 ? text + " [" + images.length + " image(s) attached]" : text;
      addMessage2("user", displayText);
      const emptyState = document.getElementById("emptyState");
      if (emptyState)
        emptyState.style.display = "none";
      const historyToSend = getMessageHistory2();
      console.log("[MC DEBUG] Sending message, history length:", historyToSend.length);
      console.log("[MC DEBUG] History:", JSON.stringify(historyToSend, null, 2));
      addToMessageHistory2("user", text);
      const provider = getSelectedModel2()?.provider || "claude";
      vscode2.postMessage({
        type: "sendMessage",
        text,
        mode: provider,
        chatMode: getCurrentChatMode(),
        includeSelection,
        injectContext,
        docTarget: docTargetValue,
        profile: profileValue,
        sectorId: getShipSelectedSectorId2(),
        images: images.slice(),
        history: historyToSend,
        claudeSessionId: getClaudeSessionId2(),
        chatId,
        gptConsult: getGptConsultEnabled2(),
        gptInterventionLevel: getGptInterventionLevel2(),
        persona: getCurrentPersona()
      });
      input.value = "";
      autoResize2(input);
      clearAttachedImages();
      setGenerating2(true);
    }
    function toggleDropZone2() {
      const dropZone = document.getElementById("dropZone");
      dropZone.classList.toggle("visible");
    }
    function handleDragOver2(e) {
      e.preventDefault();
      e.stopPropagation();
      document.getElementById("dropZone").classList.add("drag-over");
    }
    function handleDragLeave2(e) {
      e.preventDefault();
      e.stopPropagation();
      document.getElementById("dropZone").classList.remove("drag-over");
    }
    function handleDrop2(e) {
      e.preventDefault();
      e.stopPropagation();
      document.getElementById("dropZone").classList.remove("drag-over");
      const files = e.dataTransfer.files;
      handleImageFiles(files);
    }
    function handlePaste2(e) {
      const items = e.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
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
        if (file.type.startsWith("image/")) {
          const reader = new FileReader();
          reader.onload = function(e) {
            const base64 = e.target.result;
            const images = getImages();
            images.push(base64);
            setImages(images);
            renderAttachedImages();
          };
          reader.readAsDataURL(file);
        }
      }
    }
    function renderAttachedImages() {
      const container = document.getElementById("attachedImages");
      const images = getImages();
      container.innerHTML = images.map((img, index) => `
        <div class="attached-image">
          <img src="${img}" alt="Attached">
          <button class="remove-image" onclick="removeImage(${index})">\xD7</button>
        </div>
      `).join("");
      if (images.length > 0) {
        document.getElementById("dropZone").classList.remove("visible");
      }
    }
    function removeImage2(index) {
      const images = getImages();
      images.splice(index, 1);
      setImages(images);
      renderAttachedImages();
    }
    function clearAttachedImages() {
      setImages([]);
      renderAttachedImages();
    }
    function showCompactionNotice2(summary, originalCount, keptCount) {
      const chatMessages = document.getElementById("chatMessages");
      const notice = document.createElement("div");
      notice.className = "compaction-notice";
      notice.innerHTML = `
        <div class="compaction-header">
          <span class="compaction-icon">\u{1F4CB}</span>
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
    function handleKeyDown2(e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage2();
      }
    }
    function autoResize2(el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
      updateSendStopButton2();
    }
    return {
      sendMessage: sendMessage2,
      toggleDropZone: toggleDropZone2,
      handleDragOver: handleDragOver2,
      handleDragLeave: handleDragLeave2,
      handleDrop: handleDrop2,
      handlePaste: handlePaste2,
      handleImageFiles,
      renderAttachedImages,
      removeImage: removeImage2,
      clearAttachedImages,
      showCompactionNotice: showCompactionNotice2,
      handleKeyDown: handleKeyDown2,
      autoResize: autoResize2
    };
  }

  // src/webview/panel/features/chatRenderer.ts
  function createChatRendererHandlers(deps) {
    const {
      vscode: vscode2,
      escapeHtml: escapeHtml2,
      marked: marked2,
      renderChatTabs: renderChatTabs2,
      getChatSessions,
      getCurrentChatId
    } = deps;
    const streamingMessages = {};
    function createMessageHtml2(role, content, meta = {}) {
      let avatar, sender;
      switch (role) {
        case "user":
          avatar = "\u{1F464}";
          sender = "You";
          break;
        case "claude":
          avatar = "C";
          sender = "Claude";
          break;
        case "gpt":
          avatar = "G";
          sender = "GPT";
          break;
        case "summary":
          avatar = "\u{1F4CB}";
          sender = "Summary";
          break;
        case "system":
          avatar = "\u26A0\uFE0F";
          sender = "System";
          break;
        default:
          avatar = "?";
          sender = role;
      }
      return `
        <div class="message ${role}">
          <div class="message-header">
            <div class="message-avatar ${role}">${avatar}</div>
            <span class="message-sender">${sender}</span>
            <span class="message-time">${(/* @__PURE__ */ new Date()).toLocaleTimeString()}</span>
          </div>
          <div class="message-content">${escapeHtml2(content)}</div>
          ${meta.tokens && meta.tokens.input + meta.tokens.output > 0 ? `
            <div class="message-meta">
              <span>${meta.tokens.input + meta.tokens.output} tokens</span>
              <span>$${meta.cost?.toFixed(4) || "0.0000"}</span>
            </div>
          ` : ""}
        </div>
      `;
    }
    function addMessage2(role, content, meta = {}) {
      const container = document.getElementById("chatMessages");
      const empty = document.getElementById("emptyState");
      if (empty)
        empty.style.display = "none";
      const html = createMessageHtml2(role, content, meta);
      container.insertAdjacentHTML("beforeend", html);
      container.scrollTop = container.scrollHeight;
    }
    function appendToStreamingMessage2(provider, chunk, chatId) {
      const container = document.getElementById("chatMessages");
      const empty = document.getElementById("emptyState");
      if (empty)
        empty.style.display = "none";
      let streamingEl = document.getElementById("streaming-msg-" + chatId);
      if (!streamingEl) {
        const providerLabel = provider === "claude" ? "Claude" : provider === "gpt" ? "GPT" : provider;
        const providerClass = provider === "claude" ? "claude" : provider === "gpt" ? "gpt" : "";
        const html = `
          <div class="message assistant ${providerClass}" id="streaming-msg-${chatId}">
            <div class="message-header">
              <span class="provider-badge ${providerClass}">${providerLabel}</span>
              <span class="streaming-indicator">\u25CF Streaming...</span>
            </div>
            <div class="message-content" id="streaming-content-${chatId}"></div>
          </div>
        `;
        container.insertAdjacentHTML("beforeend", html);
        streamingEl = document.getElementById("streaming-msg-" + chatId);
        streamingMessages[chatId] = "";
      }
      streamingMessages[chatId] = (streamingMessages[chatId] || "") + chunk;
      const contentEl = document.getElementById("streaming-content-" + chatId);
      if (contentEl) {
        if (marked2) {
          contentEl.innerHTML = marked2.parse(streamingMessages[chatId]);
        } else {
          contentEl.textContent = streamingMessages[chatId];
        }
      }
      container.scrollTop = container.scrollHeight;
    }
    function finalizeStreamingMessage2(chatId) {
      const streamingEl = document.getElementById("streaming-msg-" + chatId);
      if (streamingEl) {
        streamingEl.remove();
        delete streamingMessages[chatId];
      }
    }
    const SEND_GRACE_MS = 1e4;
    let graceTimer = null;
    let inGracePeriod = false;
    function setGenerating2(generating, chatId = getCurrentChatId()) {
      const chatSessions2 = getChatSessions();
      if (chatSessions2[chatId]) {
        chatSessions2[chatId].isGenerating = generating;
      }
      if (generating && chatId === getCurrentChatId()) {
        inGracePeriod = true;
        if (graceTimer)
          clearTimeout(graceTimer);
        graceTimer = setTimeout(() => {
          inGracePeriod = false;
          graceTimer = null;
          updateSendStopButton2();
        }, SEND_GRACE_MS);
      }
      if (!generating) {
        inGracePeriod = false;
        if (graceTimer) {
          clearTimeout(graceTimer);
          graceTimer = null;
        }
      }
      if (chatId === getCurrentChatId()) {
        document.getElementById("statusDot").classList.toggle("thinking", generating);
        document.getElementById("statusText").textContent = generating ? "Generating..." : "Ready";
        updateSendStopButton2();
      }
      renderChatTabs2();
    }
    function updateSendStopButton2() {
      const sendBtn = document.getElementById("sendBtn");
      const stopBtn = document.getElementById("stopBtn");
      if (!sendBtn || !stopBtn)
        return;
      const chatId = getCurrentChatId();
      const chatSessions2 = getChatSessions();
      const isGenerating = chatSessions2[chatId]?.isGenerating || false;
      const input = document.getElementById("messageInput");
      const hasText = input && input.value.trim().length > 0;
      if (!isGenerating) {
        sendBtn.style.display = "block";
        sendBtn.disabled = !hasText;
        sendBtn.textContent = "Send";
        stopBtn.style.display = "none";
      } else if (inGracePeriod || !hasText) {
        sendBtn.style.display = "none";
        stopBtn.style.display = "block";
      } else {
        sendBtn.style.display = "block";
        sendBtn.disabled = false;
        sendBtn.textContent = "Send \u23CE";
        stopBtn.style.display = "none";
      }
    }
    function stopConversation2() {
      const currentChatId2 = getCurrentChatId();
      vscode2.postMessage({ type: "stop", chatId: currentChatId2 });
      setGenerating2(false, currentChatId2);
      addMessage2("system", "Conversation stopped by user.", {});
    }
    function clearChat2() {
      document.getElementById("chatMessages").innerHTML = `
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
      vscode2.postMessage({ type: "clearChat" });
    }
    function insertPrompt2(text) {
      const input = document.getElementById("messageInput");
      if (!input)
        return;
      input.value = text + " ";
      input.focus();
    }
    return {
      createMessageHtml: createMessageHtml2,
      addMessage: addMessage2,
      appendToStreamingMessage: appendToStreamingMessage2,
      finalizeStreamingMessage: finalizeStreamingMessage2,
      setGenerating: setGenerating2,
      updateSendStopButton: updateSendStopButton2,
      stopConversation: stopConversation2,
      clearChat: clearChat2,
      insertPrompt: insertPrompt2
    };
  }

  // src/webview/panel/features/chatTools.ts
  function createChatToolsHandlers(deps) {
    const {
      vscode: vscode2,
      setRightPanelMode: setRightPanelMode2,
      getCurrentChatMode,
      chatModes
    } = deps;
    let chatSplitActive = false;
    function appendSystemMessage(text) {
      const container = document.getElementById("chatMessages");
      if (!container)
        return;
      const div = document.createElement("div");
      div.className = "message system";
      div.innerHTML = '<div class="message-content">' + text + "</div>";
      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
    }
    function getGptOpinion2() {
      const messages = document.querySelectorAll("#chatMessages .message.claude, #chatMessages .message.assistant");
      const lastClaudeMessage = messages[messages.length - 1];
      if (!lastClaudeMessage) {
        appendSystemMessage("No Claude response to review. Send a message first.");
        return;
      }
      const claudeResponse = lastClaudeMessage.querySelector(".message-content")?.textContent || "";
      const userMessages = document.querySelectorAll("#chatMessages .message.user");
      const lastUserMessage = userMessages[userMessages.length - 1];
      const userQuestion = lastUserMessage?.querySelector(".message-content")?.textContent || "";
      const allMessages = Array.from(document.querySelectorAll("#chatMessages .message"));
      const lastClaudeIndex = allMessages.indexOf(lastClaudeMessage);
      const historySlice = lastClaudeIndex >= 0 ? allMessages.slice(0, lastClaudeIndex + 1) : allMessages;
      const rawHistory = historySlice.map((el) => {
        const content = el.querySelector(".message-content")?.textContent || "";
        let role = "assistant";
        if (el.classList.contains("user"))
          role = "user";
        else if (el.classList.contains("claude"))
          role = "claude";
        else if (el.classList.contains("gpt"))
          role = "gpt";
        else if (el.classList.contains("summary"))
          role = "summary";
        else if (el.classList.contains("system"))
          role = "system";
        return { role, content };
      }).filter((m) => m.content && m.content.trim().length);
      const maxTotalChars = 8e3;
      const maxEntryChars = 1200;
      let total = 0;
      const prunedHistory = [];
      for (let i = rawHistory.length - 1; i >= 0; i -= 1) {
        const entry = rawHistory[i];
        let content = entry.content.trim();
        if (content.length > maxEntryChars) {
          content = content.slice(0, maxEntryChars) + "...";
        }
        if (total + content.length > maxTotalChars && total > 0)
          break;
        total += content.length;
        prunedHistory.push({ role: entry.role, content });
      }
      prunedHistory.reverse();
      appendSystemMessage("Requesting GPT second opinion...");
      vscode2.postMessage({
        type: "getGptOpinion",
        userQuestion,
        claudeResponse,
        chatHistory: prunedHistory
      });
    }
    function toggleChatSplit2() {
      chatSplitActive = !chatSplitActive;
      if (chatSplitActive) {
        setRightPanelMode2("chat");
        syncChatSplitMirror2();
      } else {
        setRightPanelMode2("flow");
      }
    }
    function syncChatSplitMirror2() {
      const source = document.getElementById("chatMessages");
      const mirror = document.getElementById("chatSplitMirror");
      if (!source || !mirror)
        return;
      mirror.innerHTML = source.innerHTML;
      mirror.scrollTop = mirror.scrollHeight;
    }
    function showGptOpinionButton() {
      const btn = document.getElementById("gptOpinionBtn");
      if (btn && getCurrentChatMode() === chatModes.SOLO) {
        btn.style.display = "inline-flex";
      }
    }
    function hideGptOpinionButton() {
      const btn = document.getElementById("gptOpinionBtn");
      if (btn) {
        btn.style.display = "none";
      }
    }
    return {
      getGptOpinion: getGptOpinion2,
      toggleChatSplit: toggleChatSplit2,
      syncChatSplitMirror: syncChatSplitMirror2,
      showGptOpinionButton,
      hideGptOpinionButton,
      getChatSplitActive: () => chatSplitActive
    };
  }

  // src/webview/panel/features/chatMode.ts
  function createChatModeHandlers(deps) {
    const {
      vscode: vscode2,
      uiState: uiState2,
      TABS: TABS2,
      CHAT_MODES: CHAT_MODES2,
      getCurrentTab,
      getCurrentChatMode,
      setCurrentChatMode,
      restoreRightPanelModeForTab: restoreRightPanelModeForTab2,
      setRightPanelMode: setRightPanelMode2
    } = deps;
    function updateChatModeSwitcherVisibility2() {
    }
    function updateMastermindConfigVisibility2() {
      updateChatModeSwitcherVisibility2();
    }
    function switchChatMode2(modeName) {
      console.log("[SpaceCode UI] switchChatMode called with:", modeName);
      document.querySelectorAll(".chat-mode-btn").forEach((b) => b.classList.remove("active"));
      const activeBtn = document.querySelector(`.chat-mode-btn[data-chat-mode="${modeName}"]`);
      if (activeBtn)
        activeBtn.classList.add("active");
      document.querySelectorAll(".input-mode-btn").forEach((b) => b.classList.remove("active"));
      const activeInputBtn = document.querySelector(`.input-mode-btn[data-chat-mode="${modeName}"]`);
      if (activeInputBtn)
        activeInputBtn.classList.add("active");
      setCurrentChatMode(modeName);
      uiState2.chatMode = modeName;
      const chatContainer = document.getElementById("chatContainer");
      const contextFlowPanel = document.getElementById("contextFlowPanel");
      const chatModeToggles = document.getElementById("chatModeToggles");
      if (chatContainer)
        chatContainer.classList.remove("planning-mode");
      switch (modeName) {
        case CHAT_MODES2.SOLO:
          if (getCurrentTab() === TABS2.STATION) {
            restoreRightPanelModeForTab2(TABS2.STATION);
          }
          if (contextFlowPanel)
            contextFlowPanel.style.display = "none";
          if (chatModeToggles)
            chatModeToggles.style.display = "none";
          break;
        case CHAT_MODES2.PLANNING:
          if (chatContainer)
            chatContainer.classList.add("planning-mode");
          if (getCurrentTab() === TABS2.STATION) {
            setRightPanelMode2("planning");
          }
          if (contextFlowPanel)
            contextFlowPanel.style.display = "none";
          if (chatModeToggles)
            chatModeToggles.style.display = "none";
          break;
      }
      vscode2.postMessage({ type: "setChatMode", chatMode: modeName });
    }
    return {
      updateChatModeSwitcherVisibility: updateChatModeSwitcherVisibility2,
      updateMastermindConfigVisibility: updateMastermindConfigVisibility2,
      switchChatMode: switchChatMode2
    };
  }

  // src/webview/panel/features/contextPreview.ts
  function createContextPreviewHandlers(deps) {
    const { shipSetStatus: shipSetStatus2 } = deps;
    let currentContextPreview = "";
    function setContextPreview2(text) {
      currentContextPreview = text || "";
      const box = document.getElementById("contextPreviewBox");
      if (box)
        box.textContent = currentContextPreview || "(no context)";
    }
    function copyContextPreview2() {
      const text = currentContextPreview || "";
      if (!text)
        return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
        shipSetStatus2("Context copied.");
      } else {
        shipSetStatus2("Clipboard not available.");
      }
    }
    return {
      setContextPreview: setContextPreview2,
      copyContextPreview: copyContextPreview2
    };
  }

  // src/webview/panel/features/kb.ts
  function createKbPanelHandlers(deps) {
    const { vscode: vscode2 } = deps;
    let currentEmbedderStatus = null;
    function renderKbEntries2(entries) {
      const container = document.getElementById("kbList");
      if (!container) {
        return;
      }
      if (entries.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary)">No entries in knowledge base</p>';
        return;
      }
      container.innerHTML = entries.slice(0, 30).map((e) => {
        const typeIcon = e.type === "pdf" ? "\u{1F4C4}" : e.type === "url" ? "\u{1F517}" : "\u{1F4DD}";
        const embeddedBadge = e.embedded ? `<span class="embedding-badge embedded">\u2713 ${e.chunkCount || 0}</span>` : `<span class="embedding-badge not-embedded">\u2212</span>`;
        const tagsDisplay = e.tags.length > 0 ? `<span style="color: var(--text-secondary); font-size: 11px; margin-left: 8px;">${e.tags.join(", ")}</span>` : "";
        return `
          <div class="list-item" id="kb-entry-${e.id}" style="padding: 8px 12px;">
            <div class="list-item-info" style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;">
              ${embeddedBadge}
              <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"><strong>${typeIcon} ${e.title}</strong>${tagsDisplay}</span>
            </div>
            <div class="list-item-actions" style="flex-direction: row; gap: 6px; flex-shrink: 0;">
              ${!e.embedded ? `<button class="btn-connect" onclick="embedEntry('${e.id}')" id="embed-btn-${e.id}">Embed</button>` : ""}
              <button class="btn-remove" onclick="vscode.postMessage({type:'kbRemove',id:'${e.id}'})">Remove</button>
            </div>
          </div>
        `;
      }).join("");
    }
    function renderEmbedderStatus2(status, stats) {
      currentEmbedderStatus = status;
      const container = document.getElementById("embedderStatus");
      if (!container) {
        return;
      }
      const modelSelect = document.getElementById("modelSelect");
      const modelInfo = document.getElementById("modelInfo");
      if (modelSelect && status.availableModels) {
        modelSelect.innerHTML = status.availableModels.map((m) => `
          <option value="${m.id}" ${m.id === status.modelId ? "selected" : ""}>
            ${m.name} (${m.size})
          </option>
        `).join("");
      }
      if (modelInfo && status.availableModels) {
        const selectedModel = status.availableModels.find((m) => m.id === status.modelId);
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
            <span>${status.downloadProgress?.message || "Loading model..."}</span>
          </div>
        `;
        const progressContainer2 = document.getElementById("downloadProgressContainer");
        if (progressContainer2) {
          progressContainer2.style.display = "block";
        }
        return;
      }
      const progressContainer = document.getElementById("downloadProgressContainer");
      if (progressContainer) {
        progressContainer.style.display = "none";
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
        const selectedModel = status.availableModels?.find((m) => m.id === status.modelId);
        const modelSize = selectedModel?.size || "~30MB";
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
      const statsContainer = document.getElementById("kbStats");
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
    function onModelSelect2() {
      const modelSelect = document.getElementById("modelSelect");
      if (modelSelect && modelSelect.value) {
        vscode2.postMessage({ type: "kbSetModel", modelId: modelSelect.value });
      }
    }
    function downloadModel2() {
      const btn = document.getElementById("downloadModelBtn");
      const modelSelect = document.getElementById("modelSelect");
      if (btn)
        btn.disabled = true;
      const modelId = modelSelect?.value || null;
      vscode2.postMessage({ type: "kbDownloadModel", modelId });
      const progressContainer = document.getElementById("downloadProgressContainer");
      if (progressContainer) {
        progressContainer.style.display = "block";
      }
    }
    function setModelDownloading2(isDownloading) {
      const btn = document.getElementById("downloadModelBtn");
      const progressContainer = document.getElementById("downloadProgressContainer");
      if (btn) {
        btn.disabled = isDownloading;
        if (!isDownloading) {
          const selectedModel = currentEmbedderStatus?.availableModels?.find((m) => m.id === currentEmbedderStatus?.modelId);
          btn.textContent = `Download Model (${selectedModel?.size || "~30MB"})`;
        }
      }
      if (progressContainer) {
        progressContainer.style.display = isDownloading ? "block" : "none";
      }
    }
    function updateModelDownloadProgress2(progress) {
      const fill = document.getElementById("downloadProgressFill");
      const text = document.getElementById("downloadProgressText");
      const bytes = document.getElementById("downloadProgressBytes");
      if (fill)
        fill.style.width = progress.progress + "%";
      if (text)
        text.textContent = progress.message;
      if (bytes && progress.bytesLoaded && progress.bytesTotal) {
        const loaded = (progress.bytesLoaded / 1024 / 1024).toFixed(1);
        const total = (progress.bytesTotal / 1024 / 1024).toFixed(1);
        bytes.textContent = `${loaded} MB / ${total} MB${progress.currentFile ? " - " + progress.currentFile : ""}`;
      } else if (bytes) {
        bytes.textContent = progress.currentFile || "";
      }
    }
    function embedEntry2(id) {
      const btn = document.getElementById("embed-btn-" + id);
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Embedding...";
      }
      vscode2.postMessage({ type: "kbEmbedEntry", id });
    }
    function embedAllEntries2() {
      const btn = document.getElementById("embedAllBtn");
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Embedding...";
      }
      vscode2.postMessage({ type: "kbEmbedAll" });
    }
    function setEmbeddingAll2(isEmbedding) {
      const btn = document.getElementById("embedAllBtn");
      if (btn) {
        btn.disabled = isEmbedding;
        btn.textContent = isEmbedding ? "Embedding..." : "Embed All Entries";
      }
    }
    function updateEmbeddingProgress2(id, current, total) {
      const btn = document.getElementById("embed-btn-" + id);
      if (btn) {
        btn.textContent = `${current}/${total}`;
      }
    }
    function updateEmbedAllProgress2(entryIndex, totalEntries, chunkIndex, totalChunks) {
      const btn = document.getElementById("embedAllBtn");
      if (btn) {
        btn.textContent = `Entry ${entryIndex}/${totalEntries} (chunk ${chunkIndex}/${totalChunks})`;
      }
    }
    function handlePdfDragOver2(event) {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.classList.add("drag-over");
    }
    function handlePdfDragLeave2(event) {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.classList.remove("drag-over");
    }
    function handlePdfDrop2(event) {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.classList.remove("drag-over");
      const files = event.dataTransfer.files;
      processPdfFiles(files);
    }
    function handlePdfSelect2(event) {
      const files = event.target.files;
      processPdfFiles(files);
      event.target.value = "";
    }
    function processPdfFiles(files) {
      for (const file of files) {
        if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
          const reader = new FileReader();
          reader.onload = function(e) {
            const base64 = btoa(
              new Uint8Array(e.target.result).reduce((data, byte) => data + String.fromCharCode(byte), "")
            );
            vscode2.postMessage({
              type: "kbAddPdf",
              data: base64,
              fileName: file.name,
              tags: []
            });
          };
          reader.readAsArrayBuffer(file);
        } else {
          alert("Please select PDF files only");
        }
      }
    }
    function initKbDropZone2() {
      const dropZone = document.getElementById("pdfDropZone");
      const fileInput = document.getElementById("pdfFileInput");
      if (dropZone && fileInput) {
        dropZone.addEventListener("click", () => fileInput.click());
      }
    }
    function toggleCrawlOptions2() {
      const crawlCheckbox = document.getElementById("kbCrawlWebsite");
      const crawlOptions = document.getElementById("crawlOptions");
      const addBtn = document.getElementById("addUrlBtn");
      if (crawlCheckbox.checked) {
        crawlOptions.style.display = "block";
        addBtn.textContent = "Crawl Website";
      } else {
        crawlOptions.style.display = "none";
        addBtn.textContent = "Add URL";
      }
    }
    function addKbUrl2() {
      const url = document.getElementById("kbUrlInput").value.trim();
      if (!url)
        return;
      const crawlWebsite = document.getElementById("kbCrawlWebsite").checked;
      if (crawlWebsite) {
        const maxPages = parseInt(document.getElementById("kbMaxPages").value) || 1e4;
        const maxDepth = parseInt(document.getElementById("kbMaxDepth").value) || 10;
        document.getElementById("crawlProgress").style.display = "block";
        document.getElementById("addUrlBtn").disabled = true;
        document.getElementById("kbUrlInput").disabled = true;
        document.getElementById("crawlStatus").textContent = "Starting crawl...";
        document.getElementById("crawlCount").textContent = "0/0 pages";
        document.getElementById("crawlProgressBar").style.width = "0%";
        vscode2.postMessage({
          type: "kbCrawlWebsite",
          url,
          tags: [],
          options: { maxPages, maxDepth }
        });
      } else {
        vscode2.postMessage({ type: "kbAddUrl", url, tags: [] });
        document.getElementById("kbUrlInput").value = "";
      }
    }
    function handleCrawlProgress2(progress) {
      const progressBar = document.getElementById("crawlProgressBar");
      const statusEl = document.getElementById("crawlStatus");
      const countEl = document.getElementById("crawlCount");
      const urlEl = document.getElementById("crawlCurrentUrl");
      if (progress.status === "crawling") {
        const percent = progress.total > 0 ? progress.crawled / progress.total * 100 : 0;
        progressBar.style.width = percent + "%";
        statusEl.textContent = "Crawling...";
        countEl.textContent = progress.crawled + "/" + progress.total + " pages";
        urlEl.textContent = progress.currentUrl;
      } else if (progress.status === "done") {
        progressBar.style.width = "100%";
        statusEl.textContent = "Done!";
        countEl.textContent = progress.crawled + " pages crawled";
        urlEl.textContent = "";
        setTimeout(() => {
          document.getElementById("crawlProgress").style.display = "none";
          document.getElementById("addUrlBtn").disabled = false;
          document.getElementById("kbUrlInput").disabled = false;
          document.getElementById("kbUrlInput").value = "";
          document.getElementById("kbCrawlWebsite").checked = false;
          toggleCrawlOptions2();
        }, 2e3);
      } else if (progress.status === "error") {
        statusEl.textContent = "Error: " + (progress.error || "Unknown");
        setTimeout(() => {
          document.getElementById("crawlProgress").style.display = "none";
          document.getElementById("addUrlBtn").disabled = false;
          document.getElementById("kbUrlInput").disabled = false;
        }, 3e3);
      }
    }
    return {
      renderKbEntries: renderKbEntries2,
      renderEmbedderStatus: renderEmbedderStatus2,
      onModelSelect: onModelSelect2,
      downloadModel: downloadModel2,
      setModelDownloading: setModelDownloading2,
      updateModelDownloadProgress: updateModelDownloadProgress2,
      embedEntry: embedEntry2,
      embedAllEntries: embedAllEntries2,
      setEmbeddingAll: setEmbeddingAll2,
      updateEmbeddingProgress: updateEmbeddingProgress2,
      updateEmbedAllProgress: updateEmbedAllProgress2,
      handlePdfDragOver: handlePdfDragOver2,
      handlePdfDragLeave: handlePdfDragLeave2,
      handlePdfDrop: handlePdfDrop2,
      handlePdfSelect: handlePdfSelect2,
      initKbDropZone: initKbDropZone2,
      toggleCrawlOptions: toggleCrawlOptions2,
      addKbUrl: addKbUrl2,
      handleCrawlProgress: handleCrawlProgress2
    };
  }

  // src/webview/panel/features/mcp.ts
  function createMcpPanelHandlers(deps) {
    const { vscode: vscode2 } = deps;
    let mcpServersData = [];
    let selectedMcpServer = null;
    function renderMcpServers2(servers) {
      mcpServersData = Array.isArray(servers) ? servers : [];
      const container = document.getElementById("mcpServerList");
      if (!container) {
        return;
      }
      if (mcpServersData.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary)">No MCP servers configured</p>';
        showMcpDetails(null);
        return;
      }
      container.innerHTML = [...mcpServersData].sort((a, b) => a.name.localeCompare(b.name)).map((s) => `
        <div class="mcp-server-item ${selectedMcpServer === s.id ? "selected" : ""}"
             onclick="selectMcpServer('${s.id}')" data-server-id="${s.id}">
          <div class="status-dot ${s.status || "stopped"}"></div>
          <div class="mcp-server-info">
            <div class="name">${s.name}</div>
            <div class="transport">${s.transport}</div>
          </div>
        </div>
      `).join("");
      if (selectedMcpServer) {
        const server = mcpServersData.find((s) => s.id === selectedMcpServer);
        if (server) {
          showMcpDetails(server);
        }
      }
    }
    function selectMcpServer2(serverId) {
      selectedMcpServer = serverId;
      const server = mcpServersData.find((s) => s.id === serverId);
      document.querySelectorAll(".mcp-server-item").forEach((el) => {
        el.classList.toggle("selected", el.dataset.serverId === serverId);
      });
      showMcpDetails(server);
    }
    function showMcpDetails(server) {
      const panel = document.getElementById("mcpDetails");
      const emptyState = document.getElementById("mcpDetailsEmpty");
      if (!panel) {
        return;
      }
      if (!server) {
        panel.style.display = "none";
        panel.innerHTML = "";
        if (emptyState)
          emptyState.style.display = "";
        return;
      }
      if (emptyState)
        emptyState.style.display = "none";
      panel.style.display = "";
      const isConnected = server.status === "running";
      const statusColor = isConnected ? "var(--vscode-charts-green)" : "var(--vscode-charts-red)";
      const statusText = isConnected ? "Connected" : "Disconnected";
      panel.innerHTML = `
        <div class="mcp-details-header">
          <h4>${server.name}</h4>
          <div class="mcp-details-actions">
            ${server.transport === "http" && server.url ? `<button class="btn-connect" onclick="mcpAction('ping', '${server.id}')">${isConnected ? "Refresh" : "Connect"}</button>` : server.command ? `<button class="btn-connect" onclick="mcpAction('launch', '${server.id}')">Launch</button>` : ""}
            <button class="btn-remove" onclick="mcpAction('remove', '${server.id}')">Remove</button>
          </div>
        </div>

        <div class="mcp-info-row">
          <span class="label">Status:</span>
          <span class="value" style="color: ${statusColor}">\u25CF ${statusText}</span>
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
        ` : ""}
        ${server.args && server.args.length > 0 ? `
          <div class="mcp-info-row">
            <span class="label">Args:</span>
            <span class="value" style="font-family: monospace; font-size: 11px;">${server.args.join(" ")}</span>
          </div>
        ` : ""}
        ${server.url ? `
          <div class="mcp-info-row">
            <span class="label">URL:</span>
            <span class="value">${server.url}</span>
          </div>
        ` : ""}
        ${server.description ? `
          <div class="mcp-info-row">
            <span class="label">Info:</span>
            <span class="value">${server.description}</span>
          </div>
        ` : ""}

        <div class="mcp-tools-section">
          <h5>Available Tools</h5>
          <p style="font-size: 12px; color: var(--text-secondary);">
            ${server.status === "running" ? "Tools are available when connected via Claude Code CLI." : "Connect the server to discover available tools."}
          </p>
        </div>
      `;
    }
    function mcpAction2(action, serverId) {
      vscode2.postMessage({ type: "mcpAction", action, serverId });
    }
    function addMcpServer2() {
      vscode2.postMessage({ type: "addMcpServer" });
    }
    return {
      renderMcpServers: renderMcpServers2,
      selectMcpServer: selectMcpServer2,
      mcpAction: mcpAction2,
      addMcpServer: addMcpServer2
    };
  }

  // src/webview/panel/features/modelToolbar.ts
  function createModelToolbarHandlers(deps) {
    const { vscode: vscode2, getCurrentMode, setCurrentChatProvider: setCurrentChatProvider2 } = deps;
    let selectedChatMode = "chat";
    let selectedModel = { provider: "claude", model: "claude-sonnet-4-5" };
    let selectedReasoning = "medium";
    let selectedConsultant = "gpt-4o";
    let gptConsultEnabled = false;
    let gptInterventionLevel = "balanced";
    let modelLabels = {};
    let consultantLabels = {};
    let claudeModels = [];
    let gptModels = [];
    let consultantModels = [];
    function persistSettings() {
      vscode2.postMessage({
        type: "saveToolbarSettings",
        settings: {
          chatMode: selectedChatMode,
          model: selectedModel,
          reasoning: selectedReasoning,
          consultant: selectedConsultant,
          gptConsultEnabled,
          interventionLevel: gptInterventionLevel
        }
      });
    }
    function closeAllDropdowns() {
      document.querySelectorAll(".toolbar-dropdown").forEach((d) => d.classList.remove("visible"));
    }
    function toggleToolbarDropdown2(dropdownId) {
      const dropdown = document.getElementById(dropdownId);
      const allDropdowns = document.querySelectorAll(".toolbar-dropdown");
      allDropdowns.forEach((d) => {
        if (d.id !== dropdownId)
          d.classList.remove("visible");
      });
      dropdown.classList.toggle("visible");
    }
    function selectChatMode2(mode) {
      selectedChatMode = mode;
      const labels = { "chat": "Chat", "agent": "Agent", "agent-full": "Agent (full)" };
      const icons = {
        "chat": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"></path></svg>',
        "agent": '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="8" width="18" height="10" rx="2"></rect><circle cx="9" cy="13" r="1.5"></circle><circle cx="15" cy="13" r="1.5"></circle><path d="M12 8V5"></path><circle cx="12" cy="4" r="1"></circle></svg>',
        "agent-full": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L3 14h7l-1 8 10-12h-7z"></path></svg>'
      };
      document.getElementById("selectedModeLabel").textContent = labels[mode];
      document.getElementById("modeIcon").innerHTML = icons[mode];
      ["chat", "agent", "agent-full"].forEach((m) => {
        document.getElementById("modeCheck-" + m).textContent = m === mode ? "\u2713" : "";
      });
      document.getElementById("modeDropdown").classList.remove("visible");
      vscode2.postMessage({ type: "setChatMode", mode: selectedChatMode });
      persistSettings();
    }
    function selectModel2(provider, model) {
      selectedModel = { provider, model };
      if (setCurrentChatProvider2) {
        setCurrentChatProvider2(provider);
      }
      const label = modelLabels[model] || model;
      document.getElementById("selectedModelLabel").textContent = label;
      document.querySelectorAll('[id^="modelCheck-"]').forEach((el) => el.textContent = "");
      const checkEl = document.getElementById("modelCheck-" + model);
      if (checkEl)
        checkEl.textContent = "\u2713";
      document.getElementById("modelDropdown").classList.remove("visible");
      vscode2.postMessage({ type: "setModel", provider, model });
      persistSettings();
    }
    function selectReasoning2(level) {
      selectedReasoning = level;
      document.getElementById("selectedReasoningLabel").textContent = level.charAt(0).toUpperCase() + level.slice(1);
      ["medium", "high"].forEach((l) => {
        document.getElementById("reasoningCheck-" + l).textContent = l === level ? "\u2713" : "";
      });
      document.getElementById("reasoningDropdown").classList.remove("visible");
      vscode2.postMessage({ type: "setReasoning", level: selectedReasoning });
      persistSettings();
    }
    function selectConsultant2(model) {
      selectedConsultant = model;
      const label = consultantLabels[model] || model;
      document.getElementById("selectedConsultantLabel").textContent = label;
      consultantModels.forEach((m) => {
        const checkEl = document.getElementById("consultantCheck-" + m);
        if (checkEl)
          checkEl.textContent = m === model ? "\u2713" : "";
      });
      document.getElementById("consultantDropdown").classList.remove("visible");
      vscode2.postMessage({ type: "setConsultantModel", model: selectedConsultant });
      persistSettings();
    }
    function toggleGptConsult2() {
      gptConsultEnabled = !gptConsultEnabled;
      const btn = document.getElementById("gptConsultToggle");
      if (btn) {
        btn.classList.toggle("active", gptConsultEnabled);
        btn.title = gptConsultEnabled ? "Auto GPT consultation (on)" : "Auto GPT consultation (off)";
      }
      const selector = document.getElementById("consultantSelectorContainer");
      const divider = document.getElementById("consultantDivider");
      const intervention = document.getElementById("interventionLevelContainer");
      if (selector)
        selector.style.display = gptConsultEnabled ? "" : "none";
      if (divider)
        divider.style.display = gptConsultEnabled ? "" : "none";
      if (intervention)
        intervention.style.display = gptConsultEnabled ? "" : "none";
      persistSettings();
    }
    function selectInterventionLevel2(level) {
      gptInterventionLevel = level;
      const labels = { silent: "Silent", balanced: "Balanced", active: "Active" };
      const labelEl = document.getElementById("selectedInterventionLabel");
      if (labelEl)
        labelEl.textContent = labels[level] || level;
      ["silent", "balanced", "active"].forEach((l) => {
        const check = document.getElementById("interventionCheck-" + l);
        if (check)
          check.textContent = l === level ? "\u2713" : "";
      });
      closeAllDropdowns();
      persistSettings();
    }
    function restoreToolbarUI() {
      const modelLabelEl = document.getElementById("selectedModelLabel");
      if (modelLabelEl)
        modelLabelEl.textContent = modelLabels[selectedModel.model] || selectedModel.model;
      document.querySelectorAll('[id^="modelCheck-"]').forEach((el) => el.textContent = "");
      const modelCheckEl = document.getElementById("modelCheck-" + selectedModel.model);
      if (modelCheckEl)
        modelCheckEl.textContent = "\u2713";
      const reasoningLabelEl = document.getElementById("selectedReasoningLabel");
      if (reasoningLabelEl)
        reasoningLabelEl.textContent = selectedReasoning.charAt(0).toUpperCase() + selectedReasoning.slice(1);
      ["medium", "high"].forEach((l) => {
        const el = document.getElementById("reasoningCheck-" + l);
        if (el)
          el.textContent = l === selectedReasoning ? "\u2713" : "";
      });
      const btn = document.getElementById("gptConsultToggle");
      if (btn) {
        btn.classList.toggle("active", gptConsultEnabled);
        btn.title = gptConsultEnabled ? "Auto GPT consultation (on)" : "Auto GPT consultation (off)";
      }
      const selector = document.getElementById("consultantSelectorContainer");
      const divider = document.getElementById("consultantDivider");
      const intervention = document.getElementById("interventionLevelContainer");
      if (selector)
        selector.style.display = gptConsultEnabled ? "" : "none";
      if (divider)
        divider.style.display = gptConsultEnabled ? "" : "none";
      if (intervention)
        intervention.style.display = gptConsultEnabled ? "" : "none";
      const consultLabelEl = document.getElementById("selectedConsultantLabel");
      if (consultLabelEl)
        consultLabelEl.textContent = consultantLabels[selectedConsultant] || selectedConsultant;
      consultantModels.forEach((m) => {
        const el = document.getElementById("consultantCheck-" + m);
        if (el)
          el.textContent = m === selectedConsultant ? "\u2713" : "";
      });
      const interventionLabels = { silent: "Silent", balanced: "Balanced", active: "Active" };
      const interventionLabelEl = document.getElementById("selectedInterventionLabel");
      if (interventionLabelEl)
        interventionLabelEl.textContent = interventionLabels[gptInterventionLevel] || gptInterventionLevel;
      ["silent", "balanced", "active"].forEach((l) => {
        const el = document.getElementById("interventionCheck-" + l);
        if (el)
          el.textContent = l === gptInterventionLevel ? "\u2713" : "";
      });
      if (setCurrentChatProvider2) {
        setCurrentChatProvider2(selectedModel.provider);
      }
    }
    function handleToolbarSettings2(settings) {
      if (!settings)
        return;
      if (settings.modelLabels)
        modelLabels = settings.modelLabels;
      if (settings.consultantLabels)
        consultantLabels = settings.consultantLabels;
      if (settings.claudeModels)
        claudeModels = settings.claudeModels;
      if (settings.gptModels)
        gptModels = settings.gptModels;
      if (settings.consultantModels)
        consultantModels = settings.consultantModels;
      selectedChatMode = settings.chatMode || "chat";
      selectedModel = settings.model || { provider: "claude", model: "claude-sonnet-4-5" };
      selectedReasoning = settings.reasoning || "medium";
      selectedConsultant = settings.consultant || "gpt-4o";
      gptConsultEnabled = settings.gptConsultEnabled || false;
      gptInterventionLevel = settings.interventionLevel || "balanced";
      restoreToolbarUI();
    }
    function updateModelToolbarForMode2() {
      const claudeSection = document.getElementById("claudeModelsSection");
      const gptSection = document.getElementById("gptModelsSection");
      if (claudeSection)
        claudeSection.style.display = "block";
      if (gptSection)
        gptSection.style.display = "block";
      const currentMode2 = getCurrentMode();
      const defaultClaude = claudeModels[0] || "claude-opus-4-5";
      const defaultGpt = gptModels[0] || "gpt-4o";
      if (currentMode2 === "claude" && selectedModel.provider !== "claude") {
        selectModel2("claude", defaultClaude);
      } else if (currentMode2 === "gpt" && selectedModel.provider !== "gpt") {
        selectModel2("gpt", defaultGpt);
      }
    }
    setTimeout(() => {
      vscode2.postMessage({ type: "getToolbarSettings" });
    }, 50);
    return {
      toggleToolbarDropdown: toggleToolbarDropdown2,
      selectChatMode: selectChatMode2,
      selectModel: selectModel2,
      selectReasoning: selectReasoning2,
      selectConsultant: selectConsultant2,
      toggleGptConsult: toggleGptConsult2,
      selectInterventionLevel: selectInterventionLevel2,
      updateModelToolbarForMode: updateModelToolbarForMode2,
      restoreToolbarUI,
      handleToolbarSettings: handleToolbarSettings2,
      getSelectedModel: () => selectedModel,
      getGptConsultEnabled: () => gptConsultEnabled,
      getGptInterventionLevel: () => gptInterventionLevel
    };
  }

  // src/webview/panel/features/plans.ts
  function createPlanHandlers(deps) {
    const {
      vscode: vscode2,
      shipSetStatus: shipSetStatus2,
      escapeHtml: escapeHtml2,
      getCurrentMode,
      getCurrentPlanData,
      setCurrentPlanData,
      getPlanList,
      getPlanTemplates,
      setPlanTemplates,
      setPlanList,
      showPlanExecutionPanel: showPlanExecutionPanel2,
      setPlanExecutionButtonsEnabled: setPlanExecutionButtonsEnabled2
    } = deps;
    function refreshPlanTemplates2() {
      vscode2.postMessage({ type: "getPlanTemplates" });
    }
    function refreshPlans2() {
      vscode2.postMessage({ type: "listPlans" });
    }
    function generatePlan2() {
      const intentEl = document.getElementById("planIntent");
      const templateEl = document.getElementById("planTemplateSelect");
      const varsEl = document.getElementById("planTemplateVars");
      const intent = intentEl ? intentEl.value.trim() : "";
      if (!intent) {
        shipSetStatus2("Plan intent is required.");
        return;
      }
      const templateId = templateEl && templateEl.value ? templateEl.value : "";
      let templateVariables = void 0;
      if (varsEl && varsEl.value.trim()) {
        try {
          templateVariables = JSON.parse(varsEl.value);
        } catch {
          shipSetStatus2("Template vars must be valid JSON.");
          return;
        }
      }
      const profileSelect = document.getElementById("shipProfileSelect");
      const profileValue = profileSelect ? profileSelect.value : "yard";
      const provider = getCurrentMode() === "gpt" ? "gpt" : "claude";
      vscode2.postMessage({
        type: "generatePlan",
        intent,
        templateId: templateId || void 0,
        templateVariables,
        provider,
        profile: profileValue
      });
    }
    function saveCurrentPlan2() {
      const plan = getCurrentPlanData();
      if (!plan)
        return;
      vscode2.postMessage({ type: "savePlan", plan });
      shipSetStatus2("Plan saved.");
    }
    function usePlanForComparison2() {
      const plan = getCurrentPlanData();
      if (!plan || !plan.id)
        return;
      vscode2.postMessage({ type: "usePlanForComparison", planId: plan.id });
    }
    function executeCurrentPlan2() {
      const plan = getCurrentPlanData();
      if (!plan || !plan.id)
        return;
      vscode2.postMessage({ type: "executePlan", planId: plan.id });
      showPlanExecutionPanel2(true);
      setPlanExecutionButtonsEnabled2(false);
      shipSetStatus2("Executing plan...");
    }
    function executePlanStepByStep2() {
      const plan = getCurrentPlanData();
      if (!plan || !plan.id)
        return;
      vscode2.postMessage({ type: "executePlanStepByStep", planId: plan.id });
      showPlanExecutionPanel2(true);
      setPlanExecutionButtonsEnabled2(false);
      shipSetStatus2("Step-by-step execution started.");
    }
    function renderPlanSummary2(plan) {
      const box = document.getElementById("planSummary");
      if (!box)
        return;
      if (!plan) {
        box.style.display = "none";
        box.textContent = "";
        return;
      }
      const phaseItems = Array.isArray(plan.phases) ? plan.phases : [];
      const phases = phaseItems.length;
      const steps = plan.totalSteps || 0;
      const sector = plan.primarySector ? plan.primarySector.name : "Unknown";
      const risk = plan.impact ? plan.impact.riskLevel : "unknown";
      const header = "Plan: " + escapeHtml2(plan.summary || plan.intent || "") + " | Sector: " + escapeHtml2(sector) + " | Phases: " + phases + " | Steps: " + steps + " | Risk: " + escapeHtml2(risk);
      let html = "<div>" + header + "</div>";
      if (phases > 0) {
        html += '<div class="plan-phase-list">';
        phaseItems.forEach((phase, idx) => {
          const title = phase && phase.title ? phase.title : "Phase " + (idx + 1);
          const desc = phase && phase.description ? phase.description : "";
          const stepItems = phase && Array.isArray(phase.steps) ? phase.steps : [];
          const stepCount = stepItems.length;
          html += '<div class="plan-phase">';
          html += '<div class="plan-phase-title">Phase ' + (idx + 1) + ": " + escapeHtml2(title) + ' <span class="plan-phase-count">(' + stepCount + " step" + (stepCount === 1 ? "" : "s") + ")</span></div>";
          if (desc) {
            html += '<div class="plan-phase-desc">' + escapeHtml2(desc) + "</div>";
          }
          if (stepItems.length > 0) {
            html += '<ul class="plan-steps">';
            stepItems.forEach((step) => {
              const descText = step && (step.description || step.task || step.title || step.action) ? step.description || step.task || step.title || step.action : "";
              const fileText = step && step.file ? step.file : "";
              html += '<li class="plan-step">' + escapeHtml2(descText);
              if (fileText) {
                html += ' <span class="plan-step-file">[' + escapeHtml2(fileText) + "]</span>";
              }
              html += "</li>";
            });
            html += "</ul>";
          }
          html += "</div>";
        });
        html += "</div>";
      }
      box.style.display = "block";
      box.innerHTML = html;
    }
    function renderPlanList2(plans) {
      const listEl = document.getElementById("planList");
      if (!listEl)
        return;
      if (!Array.isArray(plans) || plans.length === 0) {
        listEl.textContent = "No saved plans yet.";
        return;
      }
      listEl.innerHTML = plans.map((p) => `
        <div style="display:flex; justify-content:space-between; gap:6px; padding:4px 0; border-bottom:1px solid var(--border-color);">
          <span style="color:var(--text-primary);">${escapeHtml2(p.summary || p.intent || p.id)}</span>
          <span style="color:var(--text-secondary); cursor:pointer;" onclick="loadPlan('${p.id}')">Open</span>
        </div>
      `).join("");
    }
    function loadPlan2(planId) {
      vscode2.postMessage({ type: "loadPlan", planId });
    }
    return {
      refreshPlanTemplates: refreshPlanTemplates2,
      refreshPlans: refreshPlans2,
      generatePlan: generatePlan2,
      saveCurrentPlan: saveCurrentPlan2,
      usePlanForComparison: usePlanForComparison2,
      executeCurrentPlan: executeCurrentPlan2,
      executePlanStepByStep: executePlanStepByStep2,
      renderPlanSummary: renderPlanSummary2,
      renderPlanList: renderPlanList2,
      loadPlan: loadPlan2
    };
  }

  // src/webview/panel/features/settingsPanel.ts
  function createSettingsPanelHandlers(deps) {
    const {
      vscode: vscode2,
      currentSettings: currentSettings2,
      updateTokenBar: updateTokenBar2,
      getCurrentChatId,
      showToast: showToast2
    } = deps;
    const panelTitles = {
      "mcp": "MCP Servers",
      "kb": "Knowledge Base",
      "costs": "Costs",
      "voice": "Voice",
      "logs": "Logs",
      "settings": "Settings"
    };
    function installOutsideClickHandler2() {
      document.addEventListener("click", (e) => {
        const logsDropdown = document.getElementById("logsDropdown");
        const containers = document.querySelectorAll(".settings-dropdown-container");
        let clickedInside = false;
        containers.forEach((c) => {
          if (c.contains(e.target))
            clickedInside = true;
        });
        if (!clickedInside) {
          logsDropdown?.classList.remove("visible");
        }
        const toolbarItems = document.querySelectorAll(".toolbar-item");
        let clickedInToolbar = false;
        toolbarItems.forEach((item) => {
          if (item.contains(e.target))
            clickedInToolbar = true;
        });
        if (!clickedInToolbar) {
          document.querySelectorAll(".toolbar-dropdown").forEach((d) => d.classList.remove("visible"));
        }
      });
    }
    function showSettingsPanel2(panelName) {
      const overlay = document.getElementById("settingsPanelOverlay");
      overlay.classList.add("visible");
      switchSettingsTab2(panelName);
    }
    function switchSettingsTab2(panelName) {
      document.querySelectorAll(".settings-tab").forEach((tab) => {
        tab.classList.remove("active");
        if (tab.dataset.panel === panelName) {
          tab.classList.add("active");
        }
      });
      document.querySelectorAll(".settings-panel-content").forEach((p) => p.style.display = "none");
      const panel = document.getElementById(`panel-${panelName}`);
      if (panel)
        panel.style.display = "block";
      if (panelName === "mcp")
        vscode2.postMessage({ type: "getMcpServers" });
      if (panelName === "kb")
        vscode2.postMessage({ type: "getKbEntries" });
      if (panelName === "costs")
        vscode2.postMessage({ type: "getCosts" });
      if (panelName === "voice")
        vscode2.postMessage({ type: "getVoiceSettings" });
      if (panelName === "settings") {
        vscode2.postMessage({ type: "getSettings" });
        vscode2.postMessage({ type: "getCliStatus" });
        vscode2.postMessage({ type: "getSoundSettings" });
      }
    }
    function closeSettingsPanel2() {
      document.getElementById("settingsPanelOverlay").classList.remove("visible");
    }
    function showTab2(tabName) {
      showSettingsPanel2(tabName);
    }
    function handleGitAction2() {
      const repoUrl = document.getElementById("gitRepoUrl")?.value || "";
      const branch = document.getElementById("gitBranch")?.value || "main";
      const commitMessage = document.getElementById("gitCommitMessage")?.value || "";
      const autoPush = document.getElementById("gitAutoPush")?.checked !== false;
      if (!repoUrl) {
        vscode2.postMessage({
          type: "showError",
          message: "Please configure Git settings first (Settings \u2192 Git Settings)"
        });
        return;
      }
      vscode2.postMessage({
        type: "gitAction",
        settings: { repoUrl, branch, commitMessage, autoPush }
      });
    }
    function saveConnectionMethods2() {
      const claudeSelect = document.getElementById("settingsClaudeConnection");
      const gptSelect = document.getElementById("settingsGptConnection");
      const claudeMethod = claudeSelect?.value || "api";
      const gptMethod = gptSelect?.value || "api";
      vscode2.postMessage({ type: "saveConnectionMethods", claudeMethod, gptMethod });
    }
    function onConnectionMethodChange2(provider, method) {
      currentSettings2[provider === "claude" ? "claudeConnectionMethod" : "gptConnectionMethod"] = method;
      updateConnectionHint(provider, method);
      saveConnectionMethods2();
      showToast2(`${provider === "claude" ? "Claude" : "OpenAI"} connection method updated`, "success");
    }
    function updateConnectionHint(provider, method) {
      const hintEl = document.getElementById(`${provider}ConnectionHint`);
      if (hintEl) {
        if (method === "cli") {
          hintEl.textContent = provider === "claude" ? "\u2713 Uses Claude CLI" : "\u2713 Uses OpenAI CLI for API access";
        } else {
          hintEl.textContent = "\u26A1 Direct API calls \u2014 required for image uploads";
        }
      }
    }
    function handleCliAction2(cli) {
      const statusEl = document.getElementById(`${cli}CliStatus`);
      const isInstalled = statusEl?.classList.contains("installed");
      if (isInstalled) {
        vscode2.postMessage({ type: "openTerminalForLogin", cli });
      } else {
        vscode2.postMessage({ type: "installCli", cli });
      }
    }
    function loadConnectionMethods2(settings) {
      if (!settings)
        return;
      const devSection = document.getElementById("devPricingSection");
      if (devSection) {
        devSection.style.display = settings.isDev ? "block" : "none";
      }
      const devExportSection = document.getElementById("devExportSection");
      if (devExportSection) {
        devExportSection.style.display = settings.isDev ? "block" : "none";
      }
      currentSettings2.claudeConnectionMethod = settings.claudeConnectionMethod || currentSettings2.claudeConnectionMethod;
      currentSettings2.gptConnectionMethod = settings.gptConnectionMethod || currentSettings2.gptConnectionMethod;
      if (settings.claudeModel)
        currentSettings2.claudeModel = settings.claudeModel;
      if (settings.gptModel)
        currentSettings2.gptModel = settings.gptModel;
      const claudeMethod = settings.claudeConnectionMethod || "cli";
      const gptMethod = settings.gptConnectionMethod || "cli";
      const claudeSelect = document.getElementById("settingsClaudeConnection");
      const gptSelect = document.getElementById("settingsGptConnection");
      if (claudeSelect)
        claudeSelect.value = claudeMethod;
      if (gptSelect)
        gptSelect.value = gptMethod;
      updateConnectionHint("claude", claudeMethod);
      updateConnectionHint("gpt", gptMethod);
      const maxTurnsSelect = document.getElementById("maxTurnsSelect");
      const responseStyleSelect = document.getElementById("responseStyleSelect");
      const autoSummarizeCheck = document.getElementById("autoSummarizeCheck");
      if (maxTurnsSelect)
        maxTurnsSelect.value = String(settings.maxTurns || 4);
      if (responseStyleSelect)
        responseStyleSelect.value = settings.mastermindResponseStyle || "concise";
      if (autoSummarizeCheck)
        autoSummarizeCheck.checked = settings.mastermindAutoSummarize !== false;
      updateTokenBar2(getCurrentChatId());
    }
    function saveMastermindSettings2() {
      const maxTurns = parseInt(document.getElementById("maxTurnsSelect").value, 10);
      const responseStyle = document.getElementById("responseStyleSelect").value;
      const autoSummarize = document.getElementById("autoSummarizeCheck").checked;
      vscode2.postMessage({ type: "saveMastermindSettings", maxTurns, responseStyle, autoSummarize });
    }
    function refreshCliStatus2() {
      vscode2.postMessage({ type: "getCliStatus" });
    }
    function refreshOpenaiModels2() {
      vscode2.postMessage({ type: "getOpenaiModels" });
    }
    function applyPricingOverride2() {
      const text = document.getElementById("devPricingText")?.value || "";
      const statusEl = document.getElementById("devPricingStatus");
      if (!text.trim()) {
        if (statusEl)
          statusEl.textContent = "Text is required.";
        return;
      }
      vscode2.postMessage({ type: "updateModelOverride", text });
    }
    function refreshPricingOverrides2() {
      vscode2.postMessage({ type: "getModelOverrides" });
    }
    function renderCliStatus2(status) {
      const claudeCliStatusEl = document.getElementById("claudeCliStatus");
      const gptCliStatusEl = document.getElementById("gptCliStatus");
      const claudeCliActionEl = document.getElementById("claudeCliAction");
      const gptCliActionEl = document.getElementById("gptCliAction");
      if (!status) {
        console.warn("[Settings] renderCliStatus called with no status");
        if (claudeCliStatusEl) {
          claudeCliStatusEl.className = "cli-status error";
          claudeCliStatusEl.textContent = "Error checking status";
        }
        if (gptCliStatusEl) {
          gptCliStatusEl.className = "cli-status error";
          gptCliStatusEl.textContent = "Error checking status";
        }
        return;
      }
      const claudeStatus = status.claude || {};
      if (claudeCliStatusEl) {
        claudeCliStatusEl.className = "cli-status " + (claudeStatus.installed ? "installed" : "not-installed");
        claudeCliStatusEl.textContent = claudeStatus.installed ? claudeStatus.loggedIn ? `\u2713 Ready ${claudeStatus.version || ""}` : `Installed - Login required` : "Not installed";
      }
      if (claudeCliActionEl) {
        claudeCliActionEl.style.display = "inline-block";
        claudeCliActionEl.textContent = claudeStatus.installed ? "Login" : "Install";
      }
      const codexStatus = status.codex || {};
      if (gptCliStatusEl) {
        gptCliStatusEl.className = "cli-status " + (codexStatus.installed ? "installed" : "not-installed");
        gptCliStatusEl.textContent = codexStatus.installed ? codexStatus.loggedIn ? `\u2713 Ready ${codexStatus.version || ""}` : `Installed - Auth required` : "Not installed";
      }
      if (gptCliActionEl) {
        gptCliActionEl.style.display = "inline-block";
        gptCliActionEl.textContent = codexStatus.installed ? "Auth" : "Install";
      }
      const container = document.getElementById("cliStatusContainer");
      if (!container)
        return;
      container.innerHTML = `
        <div class="cli-status-card">
          <div class="cli-status-info">
            <div class="cli-status-icon claude">C</div>
            <div class="cli-status-details">
              <h4>Claude CLI</h4>
              <div class="cli-status-badges">
                ${claudeStatus.installed ? `<span class="cli-badge installed">Installed ${claudeStatus.version || ""}</span>` : '<span class="cli-badge not-installed">Not Installed</span>'}
                ${claudeStatus.installed && claudeStatus.loggedIn ? '<span class="cli-badge logged-in">Logged In</span>' : claudeStatus.installed ? '<span class="cli-badge not-logged-in">Not Logged In</span>' : ""}
              </div>
            </div>
          </div>
          <div class="cli-status-actions">
            ${!claudeStatus.installed ? `<button class="btn-primary" onclick="installCli('claude')">Install</button>` : !claudeStatus.loggedIn ? `<button class="btn-primary" onclick="loginCli('claude')">Login</button>` : `<button class="btn-secondary" onclick="loginCli('claude')">Re-login</button>`}
          </div>
        </div>

        <div class="cli-status-card">
          <div class="cli-status-info">
            <div class="cli-status-icon codex">G</div>
            <div class="cli-status-details">
              <h4>Codex CLI (GPT)</h4>
              <div class="cli-status-badges">
                ${codexStatus.installed ? `<span class="cli-badge installed">Installed ${codexStatus.version || ""}</span>` : '<span class="cli-badge not-installed">Not Installed</span>'}
                ${codexStatus.installed && codexStatus.loggedIn ? '<span class="cli-badge logged-in">Ready</span>' : codexStatus.installed ? '<span class="cli-badge not-logged-in">Auth Required</span>' : ""}
              </div>
            </div>
          </div>
          <div class="cli-status-actions">
            ${!codexStatus.installed ? `<button class="btn-primary" onclick="installCli('codex')">Install</button>` : `<button class="btn-secondary" onclick="loginCli('codex')">Auth</button>`}
          </div>
        </div>

        <p class="method-description" style="margin-top: 8px;">
          <strong>Install commands:</strong><br>
          Claude: <code>npm install -g @anthropic-ai/claude-code</code><br>
          Codex: <code>npm install -g @openai/codex</code>
        </p>
      `;
    }
    function installCli2(cli) {
      vscode2.postMessage({ type: "installCli", cli });
    }
    function loginCli2(cli) {
      vscode2.postMessage({ type: "openTerminalForLogin", cli });
    }
    function saveApiKeys2() {
      const claudeEl = document.getElementById("settingsClaudeKey");
      const openaiEl = document.getElementById("settingsGptKey");
      const claude = claudeEl?.value || "";
      const openai = openaiEl?.value || "";
      vscode2.postMessage({ type: "saveApiKeys", claude, openai });
      showToast2("API keys saved", "success");
    }
    const revealedKeys = { claude: false, openai: false };
    function toggleApiKeyVisibility2(provider) {
      const inputId = provider === "claude" ? "settingsClaudeKey" : "settingsGptKey";
      const buttonId = provider === "claude" ? "claudeKeyReveal" : "gptKeyReveal";
      const input = document.getElementById(inputId);
      const button = document.getElementById(buttonId);
      if (!input || !button)
        return;
      if (input.type === "password") {
        revealedKeys[provider] = true;
        vscode2.postMessage({ type: "getApiKeyValue", provider });
        input.type = "text";
        button.textContent = "Hide";
      } else {
        revealedKeys[provider] = false;
        input.value = "";
        input.type = "password";
        button.textContent = "Show";
      }
    }
    function handleApiKeyValue2(provider, value) {
      if (!revealedKeys[provider])
        return;
      const inputId = provider === "claude" ? "settingsClaudeKey" : "settingsGptKey";
      const input = document.getElementById(inputId);
      if (input && input.type === "text") {
        input.value = value || "";
        if (!value) {
          showToast2(`No ${provider === "claude" ? "Claude" : "OpenAI"} API key stored`, "info");
        }
      }
    }
    function saveGitSettings2() {
      const repoUrl = document.getElementById("gitRepoUrl").value;
      const branch = document.getElementById("gitBranch").value || "main";
      const commitMessage = document.getElementById("gitCommitMessage").value;
      const autoPush = document.getElementById("gitAutoPush").checked;
      vscode2.postMessage({
        type: "saveGitSettings",
        settings: { repoUrl, branch, commitMessage, autoPush }
      });
    }
    function loadGitSettings2(settings) {
      const repoUrlInput = document.getElementById("gitRepoUrl");
      const branchInput = document.getElementById("gitBranch");
      const commitInput = document.getElementById("gitCommitMessage");
      const autoPushInput = document.getElementById("gitAutoPush");
      if (!repoUrlInput || !branchInput || !commitInput || !autoPushInput) {
        return;
      }
      if (settings) {
        repoUrlInput.value = settings.repoUrl || "";
        branchInput.value = settings.branch || "";
        commitInput.value = settings.commitMessage || "";
        autoPushInput.checked = settings.autoPush !== false;
        const repoUrlSource = document.getElementById("gitRepoUrlSource");
        const branchSource = document.getElementById("gitBranchSource");
        const repoUrlDetected = document.getElementById("gitRepoUrlDetected");
        const branchDetected = document.getElementById("gitBranchDetected");
        if (settings.hasRepoUrlOverride) {
          repoUrlSource.textContent = "(overridden)";
          repoUrlSource.style.color = "#f59e0b";
          repoUrlDetected.textContent = settings.detectedRepoUrl ? "Detected: " + settings.detectedRepoUrl : "";
        } else if (settings.detectedRepoUrl) {
          repoUrlSource.textContent = "(auto-detected)";
          repoUrlSource.style.color = "#22c55e";
          repoUrlDetected.textContent = "";
        } else {
          repoUrlSource.textContent = "(not detected)";
          repoUrlSource.style.color = "var(--text-secondary)";
          repoUrlDetected.textContent = "";
        }
        if (settings.hasBranchOverride) {
          branchSource.textContent = "(overridden)";
          branchSource.style.color = "#f59e0b";
          branchDetected.textContent = settings.detectedBranch ? "Detected: " + settings.detectedBranch : "";
        } else if (settings.detectedBranch) {
          branchSource.textContent = "(auto-detected)";
          branchSource.style.color = "#22c55e";
          branchDetected.textContent = "";
        } else {
          branchSource.textContent = "";
          branchDetected.textContent = "";
        }
      }
    }
    function clearGitOverrides2() {
      vscode2.postMessage({
        type: "saveGitSettings",
        settings: { repoUrl: "", branch: "", commitMessage: "", autoPush: true }
      });
      setTimeout(() => {
        vscode2.postMessage({ type: "getSettings" });
      }, 100);
    }
    function showLogChannel2(channel) {
      document.getElementById("logsDropdown")?.classList.remove("visible");
      vscode2.postMessage({ type: "showLogChannel", channel });
    }
    function clearAllLogs2() {
      document.getElementById("logsDropdown")?.classList.remove("visible");
      vscode2.postMessage({ type: "clearAllLogs" });
    }
    function openTerminal2() {
      document.getElementById("logsDropdown")?.classList.remove("visible");
      vscode2.postMessage({ type: "openTerminal" });
    }
    function openDevTools2() {
      document.getElementById("logsDropdown")?.classList.remove("visible");
      vscode2.postMessage({ type: "openDevTools" });
    }
    function reloadPanel2() {
      vscode2.postMessage({ type: "reloadPanel" });
    }
    function selectMcpServer2(serverName) {
      vscode2.postMessage({ type: "getMcpServerDetails", name: serverName });
    }
    function rebuildIndex2() {
      if (confirm("Rebuild the entire index? This may take some time.")) {
        vscode2.postMessage({ type: "rebuildIndex" });
        showToast2("Rebuilding index...", "info");
      }
    }
    function clearCache2() {
      if (confirm("Clear all cached data?")) {
        vscode2.postMessage({ type: "clearCache" });
        showToast2("Cache cleared", "success");
      }
    }
    function confirmResetDb2() {
      if (confirm("This will DELETE all vectors. Are you sure?")) {
        const response = prompt("Type RESET to confirm:");
        if (response === "RESET") {
          vscode2.postMessage({ type: "resetDatabase" });
          showToast2("Database reset", "warning");
        }
      }
    }
    function loadSettings2() {
      vscode2.postMessage({ type: "getSettings" });
      initSettingsListeners();
    }
    function saveSettings2() {
      const settings = {
        claudeApiKey: document.getElementById("settingsClaudeKey")?.value || "",
        gptApiKey: document.getElementById("settingsGptKey")?.value || "",
        maxTokens: parseInt(document.getElementById("settingsMaxTokens")?.value) || 8e3,
        budgetMessages: parseInt(document.getElementById("budgetMessages")?.value) || 30,
        budgetChunks: parseInt(document.getElementById("budgetChunks")?.value) || 50,
        budgetKb: parseInt(document.getElementById("budgetKb")?.value) || 15,
        budgetSystem: parseInt(document.getElementById("budgetSystem")?.value) || 5,
        autoExecute: document.getElementById("settingsAutoExecute")?.checked || false,
        autoClose: document.getElementById("settingsAutoClose")?.checked !== false,
        injectRules: document.getElementById("settingsInjectRules")?.checked !== false,
        defaultModel: document.getElementById("settingsDefaultModel")?.value || "claude",
        priorityOrder: Array.from(document.querySelectorAll(".priority-item")).map((i) => i.dataset.priority)
      };
      vscode2.postMessage({ type: "saveSettings", settings });
      showToast2("Settings saved", "success");
    }
    function initSettingsListeners() {
      ["budgetMessages", "budgetChunks", "budgetKb", "budgetSystem"].forEach((id) => {
        const slider = document.getElementById(id);
        const display = document.getElementById(id + "Value");
        if (slider && display) {
          slider.addEventListener("input", () => {
            display.textContent = slider.value + "%";
          });
        }
      });
      initPriorityDragDrop();
    }
    function initPriorityDragDrop() {
      const list = document.getElementById("priorityList");
      if (!list)
        return;
      let draggedItem = null;
      list.querySelectorAll(".priority-item").forEach((item) => {
        item.addEventListener("dragstart", () => {
          draggedItem = item;
          item.classList.add("dragging");
        });
        item.addEventListener("dragend", () => {
          item.classList.remove("dragging");
          draggedItem = null;
        });
        item.addEventListener("dragover", (e) => {
          e.preventDefault();
          if (draggedItem && draggedItem !== item) {
            const rect = item.getBoundingClientRect();
            if (e.clientY < rect.top + rect.height / 2)
              list.insertBefore(draggedItem, item);
            else
              list.insertBefore(draggedItem, item.nextSibling);
          }
        });
      });
    }
    function confirmResetSettings2() {
      if (confirm("Reset all settings to defaults?")) {
        vscode2.postMessage({ type: "resetSettings" });
        loadSettings2();
        showToast2("Settings reset to defaults", "info");
      }
    }
    function confirmClearAllData2() {
      if (confirm("This will DELETE all data. Are you sure?")) {
        const response = prompt("Type DELETE to confirm:");
        if (response === "DELETE") {
          vscode2.postMessage({ type: "clearAllData" });
          showToast2("All data cleared", "warning");
        }
      }
    }
    function updateSettings2(settings) {
      const claudeStatus = document.getElementById("claudeKeyStatus");
      const gptStatus = document.getElementById("gptKeyStatus");
      const claudeInput = document.getElementById("settingsClaudeKey");
      const gptInput = document.getElementById("settingsGptKey");
      if (claudeStatus) {
        claudeStatus.textContent = settings.hasClaudeKey ? "\u2713 Configured" : "Not set";
        claudeStatus.className = "key-status " + (settings.hasClaudeKey ? "valid" : "");
      }
      if (gptStatus) {
        const hasKey = settings.hasOpenaiKey || settings.hasGptKey;
        gptStatus.textContent = hasKey ? "\u2713 Configured" : "Not set";
        gptStatus.className = "key-status " + (hasKey ? "valid" : "");
      }
      if (claudeInput) {
        claudeInput.placeholder = settings.hasClaudeKey ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : "sk-ant-...";
      }
      if (gptInput) {
        const hasKey = settings.hasOpenaiKey || settings.hasGptKey;
        gptInput.placeholder = hasKey ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : "sk-...";
      }
      const maxTokensEl = document.getElementById("settingsMaxTokens");
      if (maxTokensEl)
        maxTokensEl.value = settings.maxTokens || 8e3;
      [{ id: "budgetMessages", val: settings.budgetMessages || 30 }, { id: "budgetChunks", val: settings.budgetChunks || 50 }, { id: "budgetKb", val: settings.budgetKb || 15 }, { id: "budgetSystem", val: settings.budgetSystem || 5 }].forEach(({ id, val }) => {
        const slider = document.getElementById(id);
        const display = document.getElementById(id + "Value");
        if (slider)
          slider.value = val;
        if (display)
          display.textContent = val + "%";
      });
      const autoExecEl = document.getElementById("settingsAutoExecute");
      const autoCloseEl = document.getElementById("settingsAutoClose");
      const injectEl = document.getElementById("settingsInjectRules");
      if (autoExecEl)
        autoExecEl.checked = settings.autoExecute || false;
      if (autoCloseEl)
        autoCloseEl.checked = settings.autoClose !== false;
      if (injectEl)
        injectEl.checked = settings.injectRules !== false;
      const modelEl = document.getElementById("settingsDefaultModel");
      if (modelEl)
        modelEl.value = settings.defaultModel || "claude";
      if (settings.claudeModel) {
        const claudeModelEl = document.getElementById("settingsClaudeModel");
        if (claudeModelEl)
          claudeModelEl.value = settings.claudeModel;
      }
      if (settings.gptModel) {
        const gptModelEl = document.getElementById("settingsGptModel");
        if (gptModelEl)
          gptModelEl.value = settings.gptModel;
      }
      if (settings.consultantModel) {
        const consultantEl = document.getElementById("settingsConsultantModel");
        if (consultantEl)
          consultantEl.value = settings.consultantModel;
      }
    }
    function onSettingsModelChange2(provider, modelId) {
      vscode2.postMessage({
        type: "setModel",
        provider,
        model: modelId
      });
      showToast2(`${provider === "claude" ? "Claude" : "GPT"} model updated`, "success");
    }
    function onSettingsConsultantChange2(modelId) {
      vscode2.postMessage({
        type: "setConsultantModel",
        model: modelId
      });
      showToast2("Consultant model updated", "success");
    }
    function renderCosts2(data) {
      const container = document.getElementById("costsContent");
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
    function devExportSettings2() {
      const includeKeys = document.getElementById("devExportIncludeKeys")?.checked ?? true;
      vscode2.postMessage({ type: "devExportSettings", includeKeys });
      const statusEl = document.getElementById("devExportStatus");
      if (statusEl)
        statusEl.textContent = "Exporting...";
    }
    function devImportSettings2() {
      const includeKeys = document.getElementById("devExportIncludeKeys")?.checked ?? true;
      vscode2.postMessage({ type: "devImportSettings", includeKeys });
      const statusEl = document.getElementById("devExportStatus");
      if (statusEl)
        statusEl.textContent = "Importing...";
    }
    function handleDevExportSuccess2(path) {
      const statusEl = document.getElementById("devExportStatus");
      if (statusEl) {
        statusEl.textContent = `Exported to: ${path}`;
        statusEl.style.color = "var(--success-color)";
      }
      showToast2("Settings exported successfully", "success");
    }
    function handleDevImportSuccess2() {
      const statusEl = document.getElementById("devExportStatus");
      if (statusEl) {
        statusEl.textContent = "Import complete. Reload window to apply.";
        statusEl.style.color = "var(--success-color)";
      }
      showToast2("Settings imported. Reload window to apply.", "success");
    }
    function handleDevExportError2(error) {
      const statusEl = document.getElementById("devExportStatus");
      if (statusEl) {
        statusEl.textContent = `Error: ${error}`;
        statusEl.style.color = "var(--error-color)";
      }
      showToast2(`Export failed: ${error}`, "error");
    }
    function handleDevImportError2(error) {
      const statusEl = document.getElementById("devExportStatus");
      if (statusEl) {
        statusEl.textContent = `Error: ${error}`;
        statusEl.style.color = "var(--error-color)";
      }
      showToast2(`Import failed: ${error}`, "error");
    }
    function refreshUsageStats2() {
      vscode2.postMessage({ type: "getUsageStats" });
    }
    function renderUsageStats2(data) {
      if (!data)
        return;
      const { today, month, all, connectionMethods } = data;
      const claudeToday = document.getElementById("claudeUsageToday");
      const claudeMonth = document.getElementById("claudeUsageMonth");
      const claudeCalls = document.getElementById("claudeCallsTotal");
      if (claudeToday)
        claudeToday.textContent = `$${(today?.byProvider?.claude?.cost || 0).toFixed(2)}`;
      if (claudeMonth)
        claudeMonth.textContent = `$${(month?.byProvider?.claude?.cost || 0).toFixed(2)}`;
      if (claudeCalls)
        claudeCalls.textContent = String(all?.byProvider?.claude?.calls || 0);
      const gptToday = document.getElementById("gptUsageToday");
      const gptMonth = document.getElementById("gptUsageMonth");
      const gptCalls = document.getElementById("gptCallsTotal");
      if (gptToday)
        gptToday.textContent = `$${(today?.byProvider?.gpt?.cost || 0).toFixed(2)}`;
      if (gptMonth)
        gptMonth.textContent = `$${(month?.byProvider?.gpt?.cost || 0).toFixed(2)}`;
      if (gptCalls)
        gptCalls.textContent = String(all?.byProvider?.gpt?.calls || 0);
      const totalToday = document.getElementById("totalUsageToday");
      const totalMonth = document.getElementById("totalUsageMonth");
      const totalAllTime = document.getElementById("totalUsageAllTime");
      if (totalToday)
        totalToday.textContent = `$${(today?.totalCost || 0).toFixed(2)}`;
      if (totalMonth)
        totalMonth.textContent = `$${(month?.totalCost || 0).toFixed(2)}`;
      if (totalAllTime)
        totalAllTime.textContent = `$${(all?.totalCost || 0).toFixed(2)}`;
      const claudePlanType = document.getElementById("claudePlanType");
      const gptPlanType = document.getElementById("gptPlanType");
      if (claudePlanType && connectionMethods) {
        const claudeMethod = connectionMethods.claude || "cli";
        const claudeBadge = claudeMethod === "cli" ? "cli" : "api";
        const claudeDesc = claudeMethod === "cli" ? "Subscription included" : "Pay-as-you-go";
        claudePlanType.innerHTML = `
        <span class="plan-badge ${claudeBadge}">${claudeMethod.toUpperCase()}</span>
        <span class="plan-desc">${claudeDesc}</span>
      `;
      }
      if (gptPlanType && connectionMethods) {
        const gptMethod = connectionMethods.gpt || "api";
        const gptBadge = gptMethod === "cli" ? "cli" : "api";
        const gptDesc = gptMethod === "cli" ? "Subscription included" : "Pay-as-you-go";
        gptPlanType.innerHTML = `
        <span class="plan-badge ${gptBadge}">${gptMethod.toUpperCase()}</span>
        <span class="plan-desc">${gptDesc}</span>
      `;
      }
    }
    return {
      panelTitles,
      installOutsideClickHandler: installOutsideClickHandler2,
      showSettingsPanel: showSettingsPanel2,
      switchSettingsTab: switchSettingsTab2,
      closeSettingsPanel: closeSettingsPanel2,
      showTab: showTab2,
      handleGitAction: handleGitAction2,
      saveConnectionMethods: saveConnectionMethods2,
      loadConnectionMethods: loadConnectionMethods2,
      onConnectionMethodChange: onConnectionMethodChange2,
      handleCliAction: handleCliAction2,
      saveMastermindSettings: saveMastermindSettings2,
      refreshCliStatus: refreshCliStatus2,
      renderCliStatus: renderCliStatus2,
      refreshOpenaiModels: refreshOpenaiModels2,
      applyPricingOverride: applyPricingOverride2,
      refreshPricingOverrides: refreshPricingOverrides2,
      installCli: installCli2,
      loginCli: loginCli2,
      saveApiKeys: saveApiKeys2,
      saveGitSettings: saveGitSettings2,
      loadGitSettings: loadGitSettings2,
      clearGitOverrides: clearGitOverrides2,
      showLogChannel: showLogChannel2,
      clearAllLogs: clearAllLogs2,
      openTerminal: openTerminal2,
      openDevTools: openDevTools2,
      reloadPanel: reloadPanel2,
      selectMcpServer: selectMcpServer2,
      rebuildIndex: rebuildIndex2,
      clearCache: clearCache2,
      confirmResetDb: confirmResetDb2,
      loadSettings: loadSettings2,
      saveSettings: saveSettings2,
      confirmResetSettings: confirmResetSettings2,
      confirmClearAllData: confirmClearAllData2,
      updateSettings: updateSettings2,
      renderCosts: renderCosts2,
      onSettingsModelChange: onSettingsModelChange2,
      onSettingsConsultantChange: onSettingsConsultantChange2,
      toggleApiKeyVisibility: toggleApiKeyVisibility2,
      handleApiKeyValue: handleApiKeyValue2,
      devExportSettings: devExportSettings2,
      devImportSettings: devImportSettings2,
      handleDevExportSuccess: handleDevExportSuccess2,
      handleDevImportSuccess: handleDevImportSuccess2,
      handleDevExportError: handleDevExportError2,
      handleDevImportError: handleDevImportError2,
      refreshUsageStats: refreshUsageStats2,
      renderUsageStats: renderUsageStats2
    };
  }

  // src/webview/panel/features/station.ts
  function createStationPanelHandlers(deps) {
    const {
      vscode: vscode2,
      uiState: uiState2,
      stationMap,
      escapeHtml: escapeHtml2,
      shipSetStatus: shipSetStatus2
    } = deps;
    let updateDocSuggestion2 = () => {
    };
    function setUpdateDocSuggestion2(fn) {
      if (typeof fn === "function")
        updateDocSuggestion2 = fn;
    }
    const STATION_MAP2 = stationMap;
    const SHIP_GROUPS = [
      {
        id: "core",
        name: "CORE",
        items: [
          { id: "types", name: "Shared Types & Interfaces" },
          { id: "utilities", name: "Utilities" }
        ]
      },
      {
        id: "character",
        name: "HANGAR",
        items: [
          { id: "appearance", name: "Character Appearance" },
          { id: "stats", name: "Stats & Equipment" }
        ]
      },
      {
        id: "combat",
        name: "ARMORY",
        items: [
          { id: "damage", name: "Damage & Abilities" },
          { id: "effects", name: "Status Effects" }
        ]
      },
      {
        id: "inventory",
        name: "CARGO",
        items: [
          { id: "items", name: "Items & Loot" },
          { id: "equipment", name: "Equipment Slots" }
        ]
      },
      {
        id: "dialogue",
        name: "COMMS",
        items: [
          { id: "npc", name: "NPC Dialogue" },
          { id: "branching", name: "Branching Choices" }
        ]
      },
      {
        id: "quest",
        name: "MISSIONS",
        items: [
          { id: "objectives", name: "Quest Objectives" },
          { id: "rewards", name: "Rewards" }
        ]
      },
      {
        id: "world",
        name: "NAVIGATION",
        items: [
          { id: "zones", name: "Zones & Maps" },
          { id: "spawning", name: "Spawning" }
        ]
      },
      {
        id: "ai",
        name: "SENSORS",
        items: [
          { id: "behavior", name: "AI Behavior Trees" },
          { id: "pathfinding", name: "Pathfinding" }
        ]
      },
      {
        id: "persistence",
        name: "QUARTERS",
        items: [
          { id: "saves", name: "Save/Load" },
          { id: "settings", name: "Player Settings" }
        ]
      },
      {
        id: "ui",
        name: "BRIDGE-UI",
        items: [
          { id: "hud", name: "HUD & Menus" },
          { id: "uitk", name: "UI Toolkit" }
        ]
      },
      {
        id: "editor",
        name: "ENGINEERING",
        items: [
          { id: "tools", name: "Editor Tools" },
          { id: "debug", name: "Debug Utilities" }
        ]
      },
      {
        id: "yard",
        name: "YARD",
        items: [
          { id: "prototype", name: "Prototypes" },
          { id: "experiments", name: "Experiments" }
        ]
      }
    ];
    const SCENE_TO_SECTOR_MAP = {
      "bridge": "ui",
      // Command Bridge → BRIDGE-UI (user interface)
      "core": "core",
      // Reactor Core → CORE (shared types/utilities)
      "vault": "inventory",
      // Cargo Vault → CARGO (items/equipment)
      "docking": "world",
      // Docking Ring → NAVIGATION (zones/maps)
      "guard": "combat",
      // Armory → ARMORY (combat mechanics)
      "scanner": "ai",
      // Scanner Bay → SENSORS (AI/pathfinding)
      "comms": "dialogue",
      // Comms Array → COMMS (dialogue/NPC)
      "station": "core"
      // Default for exterior view
    };
    const SCHEMATIC_MODULES = {
      core: {
        id: "core",
        name: "CORE",
        desc: "Central processing hub",
        color: "#6cf",
        x: 400,
        y: 250,
        draw: (g) => {
          g.innerHTML += `
            <polygon points="0,-45 32,-32 45,0 32,32 0,45 -32,32 -45,0 -32,-32"
              fill="#1a3a4a" stroke="${SCHEMATIC_MODULES.core.color}" stroke-width="2"/>
            <circle r="20" fill="#0a2030" stroke="#4af" stroke-width="1"/>
            <circle r="8" fill="#6cf" filter="url(#schematicGlow)"/>
          `;
        }
      },
      bridge: {
        id: "bridge",
        name: "BRIDGE",
        desc: "Command & UI systems",
        color: "#6cf",
        x: 400,
        y: 80,
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
        id: "scanner",
        name: "SCANNER",
        desc: "AI & pathfinding sensors",
        color: "#c6f",
        x: 150,
        y: 200,
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
        id: "guard",
        name: "ARMORY",
        desc: "Combat mechanics",
        color: "#f66",
        x: 650,
        y: 200,
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
        id: "vault",
        name: "VAULT",
        desc: "Inventory & items",
        color: "#cc6",
        x: 150,
        y: 350,
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
        id: "docking",
        name: "DOCKING",
        desc: "World & navigation",
        color: "#f96",
        x: 650,
        y: 350,
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
        id: "comms",
        name: "COMMS",
        desc: "Dialogue & NPCs",
        color: "#6f6",
        x: 400,
        y: 420,
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
    const SCHEMATIC_CONNECTIONS = [
      ["core", "bridge"],
      ["core", "scanner"],
      ["core", "guard"],
      ["core", "vault"],
      ["core", "docking"],
      ["core", "comms"]
    ];
    const SCHEMATIC_ROOMS = {
      bridge: {
        title: "COMMAND BRIDGE",
        desc: "UI & Interface Systems",
        color: "#6cf",
        drawRoom: (svg) => {
          for (let i = 0; i < 3; i++) {
            const x = 150 + i * 200;
            svg.innerHTML += `
              <rect x="${x}" y="120" width="100" height="60" rx="4" fill="#1a3a4a" stroke="#6cf" stroke-width="2"/>
              <rect x="${x + 10}" y="130" width="80" height="30" fill="#0a2030" stroke="#4af"/>
              <circle cx="${x + 25}" cy="170" r="5" fill="#4af"/>
              <circle cx="${x + 50}" cy="170" r="5" fill="#4af"/>
              <circle cx="${x + 75}" cy="170" r="5" fill="#4af"/>
            `;
          }
          svg.innerHTML += `
            <rect x="200" y="220" width="300" height="150" rx="6" fill="#0a2030" stroke="#6cf" stroke-width="3"/>
            <text x="350" y="300" fill="#6cf" font-size="24" text-anchor="middle" font-family="monospace">SECTOR UI</text>
            <text x="350" y="330" fill="#4af" font-size="12" text-anchor="middle" font-family="monospace" opacity="0.6">React components, views, layouts</text>
          `;
        }
      },
      scanner: {
        title: "SCANNER BAY",
        desc: "AI & Pathfinding Systems",
        color: "#c6f",
        drawRoom: (svg) => {
          svg.innerHTML += `
            <ellipse cx="350" cy="200" rx="120" ry="40" fill="none" stroke="#c6f" stroke-width="2"/>
            <ellipse cx="350" cy="200" rx="80" ry="25" fill="none" stroke="#c6f" stroke-width="1" opacity="0.5"/>
            <line x1="350" y1="200" x2="350" y2="100" stroke="#c6f" stroke-width="3"/>
            <circle cx="350" cy="90" r="15" fill="#c6f" filter="url(#schematicGlow)"/>
          `;
          for (let i = 0; i < 3; i++) {
            svg.innerHTML += `
              <path d="M${200 + i * 30},280 Q350,${220 - i * 20} ${500 - i * 30},280" fill="none" stroke="#c6f" stroke-width="1" opacity="${0.3 + i * 0.2}"/>
            `;
          }
          svg.innerHTML += `
            <text x="350" y="350" fill="#c6f" font-size="18" text-anchor="middle" font-family="monospace">NEURAL PATHFINDING</text>
            <text x="350" y="375" fill="#a4f" font-size="11" text-anchor="middle" font-family="monospace" opacity="0.6">NavMesh, AI behaviors, state machines</text>
          `;
        }
      },
      guard: {
        title: "ARMORY",
        desc: "Combat Mechanics",
        color: "#f66",
        drawRoom: (svg) => {
          for (let i = 0; i < 4; i++) {
            const x = 120 + i * 150;
            svg.innerHTML += `
              <rect x="${x}" y="130" width="80" height="120" rx="3" fill="#2a1a1a" stroke="#f66" stroke-width="2"/>
              <line x1="${x + 20}" y1="150" x2="${x + 20}" y2="230" stroke="#f44" stroke-width="4"/>
              <line x1="${x + 40}" y1="160" x2="${x + 40}" y2="220" stroke="#f44" stroke-width="4"/>
              <line x1="${x + 60}" y1="155" x2="${x + 60}" y2="225" stroke="#f44" stroke-width="4"/>
            `;
          }
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
        title: "CARGO VAULT",
        desc: "Inventory & Items",
        color: "#cc6",
        drawRoom: (svg) => {
          for (let row = 0; row < 2; row++) {
            for (let col = 0; col < 4; col++) {
              const x = 120 + col * 140;
              const y = 130 + row * 100;
              svg.innerHTML += `
                <rect x="${x}" y="${y}" width="100" height="70" rx="3" fill="#2a2a1a" stroke="#cc6" stroke-width="2"/>
                <circle cx="${x + 50}" cy="${y + 35}" r="12" fill="#2a2a1a" stroke="#cc6" stroke-width="2"/>
                <line x1="${x + 50}" y1="${y + 28}" x2="${x + 50}" y2="${y + 42}" stroke="#cc6" stroke-width="2"/>
                <line x1="${x + 43}" y1="${y + 35}" x2="${x + 57}" y2="${y + 35}" stroke="#cc6" stroke-width="2"/>
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
        title: "DOCKING RING",
        desc: "World & Navigation",
        color: "#f96",
        drawRoom: (svg) => {
          for (let i = 0; i < 3; i++) {
            const x = 150 + i * 180;
            svg.innerHTML += `
              <circle cx="${x}" cy="200" r="50" fill="#1a2a3a" stroke="#f96" stroke-width="3"/>
              <circle cx="${x}" cy="200" r="30" fill="#0a1a2a" stroke="#f96" stroke-width="2"/>
              <circle cx="${x}" cy="200" r="10" fill="#f96" filter="url(#schematicGlow)"/>
            `;
          }
          svg.innerHTML += `
            <line x1="200" y1="200" x2="330" y2="200" stroke="#f96" stroke-width="2" stroke-dasharray="5,5"/>
            <line x1="380" y1="200" x2="510" y2="200" stroke="#f96" stroke-width="2" stroke-dasharray="5,5"/>
            <text x="350" y="320" fill="#f96" font-size="18" text-anchor="middle" font-family="monospace">WORLD PORTALS</text>
            <text x="350" y="345" fill="#f74" font-size="11" text-anchor="middle" font-family="monospace" opacity="0.6">Scenes, zones, level transitions</text>
          `;
        }
      },
      comms: {
        title: "COMMS ARRAY",
        desc: "Dialogue & NPCs",
        color: "#6f6",
        drawRoom: (svg) => {
          svg.innerHTML += `
            <rect x="320" y="280" width="60" height="80" fill="#2a4a3a" stroke="#6f6" stroke-width="2"/>
            <path d="M250,200 Q350,80 450,200" fill="none" stroke="#6f6" stroke-width="3"/>
            <line x1="350" y1="140" x2="350" y2="280" stroke="#6f6" stroke-width="4"/>
          `;
          for (let i = 0; i < 4; i++) {
            svg.innerHTML += `
              <path d="M${280 - i * 20},${180 - i * 15} Q350,${120 - i * 20} ${420 + i * 20},${180 - i * 15}" fill="none" stroke="#6f6" stroke-width="1" opacity="${0.2 + i * 0.2}"/>
            `;
          }
          svg.innerHTML += `
            <text x="350" y="400" fill="#6f6" font-size="18" text-anchor="middle" font-family="monospace">DIALOGUE SYSTEM</text>
            <text x="350" y="425" fill="#4f4" font-size="11" text-anchor="middle" font-family="monospace" opacity="0.6">NPCs, conversations, localization</text>
          `;
        }
      },
      core: {
        title: "REACTOR CORE",
        desc: "Core Systems & Utilities",
        color: "#6cf",
        drawRoom: (svg) => {
          svg.innerHTML += `
            <polygon points="350,100 420,180 420,280 350,360 280,280 280,180" fill="#1a3a4a" stroke="#6cf" stroke-width="3"/>
            <polygon points="350,140 390,190 390,250 350,300 310,250 310,190" fill="#0a2030" stroke="#4af" stroke-width="2"/>
            <circle cx="350" cy="220" r="30" fill="#6cf" filter="url(#schematicGlow)"/>
          `;
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
    let schematicCurrentRoom = null;
    let shipSelectedSectorId = "core";
    let shipSelectedSubId = null;
    let shipAutoexecute = false;
    let shipProfile = uiState2?.shipProfile || "yard";
    function getShipSelectedSectorId2() {
      return shipSelectedSectorId;
    }
    function getShipSelectedSubId2() {
      return shipSelectedSubId;
    }
    function getShipAutoexecute2() {
      return shipAutoexecute;
    }
    function getShipProfile2() {
      return shipProfile;
    }
    function setShipSelectedSectorId2(value) {
      shipSelectedSectorId = value;
    }
    function setShipSelectedSubId2(value) {
      shipSelectedSubId = value;
    }
    function setShipAutoexecute2(value) {
      shipAutoexecute = value;
    }
    function setShipProfile2(value) {
      shipProfile = value;
      if (uiState2)
        uiState2.shipProfile = value;
    }
    function updateStationLabels2() {
      const sectorLabel = document.getElementById("stationSectorLabel");
      const profileLabel = document.getElementById("stationProfileLabel");
      if (sectorLabel)
        sectorLabel.textContent = shipSelectedSectorId || "Unknown";
      if (profileLabel)
        profileLabel.textContent = shipProfile || "yard";
    }
    let stationSceneId = STATION_MAP2 && STATION_MAP2.startScene ? STATION_MAP2.startScene : "station";
    let stationNavStack = [stationSceneId];
    function stationGetScene(sceneId) {
      const scenes = STATION_MAP2 && STATION_MAP2.scenes ? STATION_MAP2.scenes : {};
      return scenes && scenes[sceneId] ? scenes[sceneId] : null;
    }
    function stationUpdateBreadcrumbs() {
      const el = document.getElementById("stationBreadcrumbs");
      if (!el)
        return;
      el.innerHTML = "";
      stationNavStack.forEach((id, idx) => {
        const scene = stationGetScene(id);
        const name = scene && scene.title ? scene.title : id;
        const crumb = document.createElement("span");
        crumb.className = "crumb";
        crumb.textContent = name;
        crumb.onclick = () => {
          stationNavStack = stationNavStack.slice(0, idx + 1);
          stationSceneId = id;
          stationRenderScene2();
          updateStationLabels2();
          shipRender2();
        };
        el.appendChild(crumb);
        if (idx < stationNavStack.length - 1) {
          const sep = document.createElement("span");
          sep.className = "crumb-sep";
          sep.textContent = " \u203A ";
          el.appendChild(sep);
        }
      });
      const backBtn = document.getElementById("stationBackBtn");
      if (backBtn)
        backBtn.style.visibility = stationNavStack.length > 1 ? "visible" : "hidden";
    }
    function stationSetScene2(sceneId, pushToStack) {
      const scene = stationGetScene(sceneId);
      if (!scene) {
        shipSetStatus2("Unknown scene: " + sceneId);
        return;
      }
      stationSceneId = sceneId;
      if (pushToStack) {
        const last = stationNavStack[stationNavStack.length - 1];
        if (last !== sceneId)
          stationNavStack.push(sceneId);
      }
      const mappedSectorId = SCENE_TO_SECTOR_MAP[sceneId] || sceneId;
      const group = SHIP_GROUPS.find((g) => g.id === mappedSectorId);
      if (group) {
        if (shipSelectedSectorId !== mappedSectorId) {
          shipSelectedSectorId = mappedSectorId;
          shipSelectedSubId = null;
        }
      }
      stationRenderScene2();
      shipRender2();
    }
    function stationGoBack2() {
      if (uiState2.stationViewMode === "schematic") {
        if (schematicCurrentRoom) {
          schematicCurrentRoom = null;
          stationRenderSchematic2();
          return;
        }
      }
      if (stationNavStack.length <= 1)
        return;
      stationNavStack.pop();
      stationSceneId = stationNavStack[stationNavStack.length - 1];
      stationRenderScene2();
      shipRender2();
    }
    function stationEnsureViewport() {
      const canvas = document.getElementById("shipCanvas");
      if (!canvas)
        return null;
      let vp = document.getElementById("stationViewport");
      if (!vp) {
        vp = document.createElement("div");
        vp.id = "stationViewport";
        vp.className = "ship-viewport";
        canvas.appendChild(vp);
      }
      return vp;
    }
    function stationUpdateViewport2() {
      const canvas = document.getElementById("shipCanvas");
      const img = document.getElementById("shipImage");
      const vp = stationEnsureViewport();
      if (!canvas || !img || !vp)
        return;
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      const iw = img.naturalWidth || cw;
      const ih = img.naturalHeight || ch;
      const scale = Math.min(cw / iw, ch / ih);
      const dispW = iw * scale;
      const dispH = ih * scale;
      const offsetX = (cw - dispW) / 2;
      const offsetY = (ch - dispH) / 2;
      vp.style.left = offsetX + "px";
      vp.style.top = offsetY + "px";
      vp.style.width = dispW + "px";
      vp.style.height = dispH + "px";
    }
    function stationRenderSchematic2() {
      const canvas = document.getElementById("shipCanvas");
      if (!canvas)
        return;
      const img = document.getElementById("shipImage");
      if (img)
        img.style.display = "none";
      const oldSvg = canvas.querySelector(".schematic-svg");
      if (oldSvg)
        oldSvg.remove();
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "schematic-svg");
      svg.setAttribute("viewBox", "0 0 800 500");
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      svg.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:auto;";
      svg.innerHTML = `
      <defs>
        <filter id="schematicGlow">
          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        <pattern id="schematicGrid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(100,200,255,0.1)" stroke-width="1"/>
        </pattern>
      </defs>
    `;
      const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      bg.setAttribute("width", "800");
      bg.setAttribute("height", "500");
      bg.setAttribute("fill", "url(#schematicGrid)");
      svg.appendChild(bg);
      if (schematicCurrentRoom && SCHEMATIC_ROOMS[schematicCurrentRoom]) {
        const room = SCHEMATIC_ROOMS[schematicCurrentRoom];
        const title = document.createElementNS("http://www.w3.org/2000/svg", "text");
        title.setAttribute("x", "400");
        title.setAttribute("y", "40");
        title.setAttribute("text-anchor", "middle");
        title.setAttribute("fill", room.color);
        title.setAttribute("font-size", "24");
        title.setAttribute("font-family", "Orbitron, Exo, monospace");
        title.setAttribute("letter-spacing", "3");
        title.textContent = room.title;
        svg.appendChild(title);
        const desc = document.createElementNS("http://www.w3.org/2000/svg", "text");
        desc.setAttribute("x", "400");
        desc.setAttribute("y", "65");
        desc.setAttribute("text-anchor", "middle");
        desc.setAttribute("fill", room.color);
        desc.setAttribute("font-size", "12");
        desc.setAttribute("font-family", "Inter, sans-serif");
        desc.setAttribute("opacity", "0.7");
        desc.textContent = room.desc;
        svg.appendChild(desc);
        room.drawRoom(svg);
        const back = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        back.setAttribute("x", "20");
        back.setAttribute("y", "20");
        back.setAttribute("width", "80");
        back.setAttribute("height", "30");
        back.setAttribute("rx", "5");
        back.setAttribute("fill", "rgba(0,40,60,0.8)");
        back.setAttribute("stroke", room.color);
        back.setAttribute("stroke-width", "1");
        back.style.cursor = "pointer";
        back.onclick = () => {
          schematicCurrentRoom = null;
          stationRenderSchematic2();
        };
        svg.appendChild(back);
        const backText = document.createElementNS("http://www.w3.org/2000/svg", "text");
        backText.setAttribute("x", "60");
        backText.setAttribute("y", "40");
        backText.setAttribute("text-anchor", "middle");
        backText.setAttribute("fill", room.color);
        backText.setAttribute("font-size", "12");
        backText.setAttribute("font-family", "Inter, sans-serif");
        backText.textContent = "\u2190 BACK";
        backText.style.pointerEvents = "none";
        svg.appendChild(backText);
      } else {
        SCHEMATIC_CONNECTIONS.forEach(([from, to]) => {
          const fromMod = SCHEMATIC_MODULES[from];
          const toMod = SCHEMATIC_MODULES[to];
          if (!fromMod || !toMod)
            return;
          const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
          line.setAttribute("x1", fromMod.x);
          line.setAttribute("y1", fromMod.y);
          line.setAttribute("x2", toMod.x);
          line.setAttribute("y2", toMod.y);
          line.setAttribute("stroke", "rgba(100,200,255,0.3)");
          line.setAttribute("stroke-width", "2");
          line.setAttribute("stroke-dasharray", "5,5");
          svg.appendChild(line);
        });
        Object.values(SCHEMATIC_MODULES).forEach((mod) => {
          const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
          g.setAttribute("transform", `translate(${mod.x}, ${mod.y})`);
          g.setAttribute("class", "schematic-module");
          g.style.cursor = "pointer";
          const mappedSectorId = SCENE_TO_SECTOR_MAP[mod.id] || mod.id;
          const selected = shipSelectedSectorId === mappedSectorId;
          if (selected) {
            g.setAttribute("data-selected", "true");
          }
          mod.draw(g);
          const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
          text.setAttribute("x", "0");
          text.setAttribute("y", "65");
          text.setAttribute("text-anchor", "middle");
          text.setAttribute("fill", mod.color);
          text.setAttribute("font-size", "10");
          text.setAttribute("font-family", "Orbitron, Exo, monospace");
          text.textContent = mod.name;
          g.appendChild(text);
          g.addEventListener("mouseenter", () => {
            g.setAttribute("data-hover", "true");
          });
          g.addEventListener("mouseleave", () => {
            g.removeAttribute("data-hover");
          });
          g.addEventListener("click", () => {
            if (mappedSectorId && shipSelectedSectorId !== mappedSectorId) {
              shipSelectedSectorId = mappedSectorId;
              shipSelectedSubId = null;
              shipRender2();
              updateStationLabels2();
              vscode2.postMessage({ type: "sectorSelected", sectorId: mappedSectorId });
            }
            schematicCurrentRoom = mod.id;
            stationRenderSchematic2();
          });
          svg.appendChild(g);
        });
      }
      canvas.appendChild(svg);
      const sceneNameEl = document.getElementById("stationSceneName");
      if (sceneNameEl) {
        if (schematicCurrentRoom && SCHEMATIC_ROOMS[schematicCurrentRoom]) {
          sceneNameEl.textContent = SCHEMATIC_ROOMS[schematicCurrentRoom].title;
        } else {
          sceneNameEl.textContent = "Station Schematic";
        }
      }
      const backBtn = document.getElementById("stationBackBtn");
      if (backBtn) {
        backBtn.style.visibility = schematicCurrentRoom ? "visible" : "hidden";
      }
    }
    function stationRenderPhoto2() {
      const canvas = document.getElementById("shipCanvas");
      const img = document.getElementById("shipImage");
      const vp = stationEnsureViewport();
      if (!canvas || !img || !vp)
        return;
      vp.querySelectorAll(".ship-hotspot, .ship-hotspot-svg").forEach((n) => n.remove());
      const scene = stationGetScene(stationSceneId);
      if (scene && scene.imageUrl) {
        img.dataset.fallback = "";
        img.src = scene.imageUrl;
      }
      stationUpdateViewport2();
      const hotspots = scene && Array.isArray(scene.hotspots) ? scene.hotspots : [];
      const hasPolygons = hotspots.some((h) => Array.isArray(h.points) && h.points.length >= 3);
      if (hasPolygons) {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", "ship-hotspot-svg");
        svg.setAttribute("viewBox", "0 0 2752 1536");
        svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
        svg.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;";
        hotspots.forEach((h) => {
          if (Array.isArray(h.points) && h.points.length >= 3) {
            const pointsStr = h.points.map((p) => p.x + "," + p.y).join(" ");
            const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
            poly.setAttribute("points", pointsStr);
            poly.setAttribute("fill", h.id === shipSelectedSectorId ? "rgba(0,200,255,0.25)" : "rgba(0,150,255,0.08)");
            poly.setAttribute("stroke", "rgba(0,200,255,0.6)");
            poly.setAttribute("stroke-width", "2");
            poly.style.cssText = "pointer-events:auto;cursor:pointer;transition:fill 0.2s,stroke 0.2s;";
            poly.setAttribute("data-id", h.id || "");
            const cx = h.points.reduce((sum, p) => sum + p.x, 0) / h.points.length;
            const cy = h.points.reduce((sum, p) => sum + p.y, 0) / h.points.length;
            const labelGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
            labelGroup.setAttribute("class", "hotspot-label");
            labelGroup.setAttribute("data-for", h.id || "");
            labelGroup.style.cssText = "pointer-events:none;opacity:0;transition:opacity 0.2s;";
            const labelBg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            labelBg.setAttribute("rx", "8");
            labelBg.setAttribute("ry", "8");
            labelBg.setAttribute("fill", "rgba(0,20,40,0.85)");
            labelBg.setAttribute("stroke", "rgba(0,200,255,0.8)");
            labelBg.setAttribute("stroke-width", "1.5");
            const labelText = document.createElementNS("http://www.w3.org/2000/svg", "text");
            labelText.setAttribute("x", String(cx));
            labelText.setAttribute("y", String(cy));
            labelText.setAttribute("text-anchor", "middle");
            labelText.setAttribute("dominant-baseline", "middle");
            labelText.setAttribute("fill", "#00d4ff");
            labelText.setAttribute("font-family", "Orbitron, Exo, Rajdhani, sans-serif");
            labelText.setAttribute("font-size", "42");
            labelText.setAttribute("font-weight", "600");
            labelText.setAttribute("letter-spacing", "2");
            labelText.textContent = (h.label || h.id || "").toUpperCase();
            const indicator = document.createElementNS("http://www.w3.org/2000/svg", "line");
            indicator.setAttribute("x1", String(cx));
            indicator.setAttribute("y1", String(cy + 30));
            indicator.setAttribute("x2", String(cx));
            indicator.setAttribute("y2", String(cy + 60));
            indicator.setAttribute("stroke", "rgba(0,200,255,0.8)");
            indicator.setAttribute("stroke-width", "2");
            const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            dot.setAttribute("cx", String(cx));
            dot.setAttribute("cy", String(cy + 65));
            dot.setAttribute("r", "6");
            dot.setAttribute("fill", "#00d4ff");
            labelGroup.appendChild(labelBg);
            labelGroup.appendChild(indicator);
            labelGroup.appendChild(dot);
            labelGroup.appendChild(labelText);
            const textLen = (h.label || h.id || "").length * 26 + 40;
            labelBg.setAttribute("x", String(cx - textLen / 2));
            labelBg.setAttribute("y", String(cy - 28));
            labelBg.setAttribute("width", String(textLen));
            labelBg.setAttribute("height", "56");
            poly.addEventListener("mouseenter", () => {
              poly.setAttribute("fill", "rgba(0,220,255,0.35)");
              poly.setAttribute("stroke", "rgba(0,255,255,0.95)");
              poly.setAttribute("stroke-width", "3");
              labelGroup.style.opacity = "1";
            });
            poly.addEventListener("mouseleave", () => {
              const selected = h.id === shipSelectedSectorId;
              poly.setAttribute("fill", selected ? "rgba(0,200,255,0.25)" : "rgba(0,150,255,0.08)");
              poly.setAttribute("stroke", "rgba(0,200,255,0.6)");
              poly.setAttribute("stroke-width", "2");
              labelGroup.style.opacity = "0";
            });
            poly.addEventListener("click", () => {
              if (h.targetScene) {
                stationSetScene2(h.targetScene, true);
              } else if (h.action) {
                vscode2.postMessage({ type: "stationAction", action: h.action, sceneId: stationSceneId });
              }
            });
            svg.appendChild(poly);
            svg.appendChild(labelGroup);
          }
        });
        vp.appendChild(svg);
      } else {
        hotspots.forEach((h) => {
          const hs = document.createElement("div");
          hs.className = "ship-hotspot" + (h.id === shipSelectedSectorId ? " selected" : "");
          hs.style.left = String(h.x) + "%";
          hs.style.top = String(h.y) + "%";
          hs.style.width = String(h.w) + "%";
          hs.style.height = String(h.h) + "%";
          hs.title = h.title || h.id;
          if (h.targetScene) {
            hs.onclick = () => stationSetScene2(h.targetScene, true);
          } else if (h.action) {
            hs.onclick = () => vscode2.postMessage({ type: "stationAction", action: h.action, sceneId: stationSceneId });
          } else {
            hs.onclick = () => {
            };
          }
          vp.appendChild(hs);
        });
      }
      stationUpdateBreadcrumbs();
    }
    function stationRenderScene2() {
      const canvas = document.getElementById("shipCanvas");
      const img = document.getElementById("shipImage");
      const oldSchematic = canvas?.querySelector(".schematic-svg");
      if (oldSchematic)
        oldSchematic.remove();
      if (uiState2.stationViewMode === "schematic") {
        stationRenderSchematic2();
      } else {
        if (img)
          img.style.display = "";
        stationRenderPhoto2();
      }
    }
    function stationToggleViewMode2(mode) {
      if (mode) {
        uiState2.stationViewMode = mode;
      } else {
        uiState2.stationViewMode = uiState2.stationViewMode === "schematic" ? "photo" : "schematic";
      }
      const btnSchematic = document.getElementById("stationViewSchematic");
      const btnPhoto = document.getElementById("stationViewPhoto");
      if (btnSchematic)
        btnSchematic.classList.toggle("active", uiState2.stationViewMode === "schematic");
      if (btnPhoto)
        btnPhoto.classList.toggle("active", uiState2.stationViewMode === "photo");
      stationRenderScene2();
    }
    function shipGetProfile() {
      const sel = document.getElementById("shipProfileSelect");
      return sel ? sel.value : "yard";
    }
    function shipRender2() {
      const list = document.getElementById("shipSectorList");
      if (!list)
        return;
      list.innerHTML = "";
      SHIP_GROUPS.forEach((g) => {
        const header = document.createElement("div");
        header.className = "sector-item" + (g.id === shipSelectedSectorId && !shipSelectedSubId ? " selected" : "");
        header.textContent = g.name;
        header.onclick = () => shipSelectSector2(g.id, null);
        list.appendChild(header);
        g.items.forEach((it) => {
          const row = document.createElement("div");
          const selected = g.id === shipSelectedSectorId && shipSelectedSubId === it.id;
          row.className = "sector-item sub" + (selected ? " selected" : "");
          row.textContent = "  - " + it.name;
          row.onclick = () => shipSelectSector2(g.id, it.id);
          list.appendChild(row);
        });
      });
      shipUpdateChips2();
    }
    function shipUpdateChips2() {
      const chip = document.getElementById("shipSelectedSectorChip");
      const group = SHIP_GROUPS.find((g) => g.id === shipSelectedSectorId);
      let text = group ? group.name : shipSelectedSectorId;
      if (group && shipSelectedSubId) {
        const it = group.items.find((i) => i.id === shipSelectedSubId);
        if (it)
          text = text + " / " + it.name;
      }
      if (chip)
        chip.textContent = "Sector: " + text;
      const autoBtn = document.getElementById("shipAutoBtn");
      if (autoBtn)
        autoBtn.textContent = "Autoexecute: " + (shipAutoexecute ? "On" : "Off");
    }
    function shipSelectSector2(sectorId, subId) {
      shipSelectedSectorId = sectorId;
      shipSelectedSubId = subId || null;
      const group = SHIP_GROUPS.find((g) => g.id === shipSelectedSectorId);
      const name = group ? group.name : shipSelectedSectorId;
      shipSetStatus2("Selected: " + name + ". Context Packs and Gates will be sector-aware.");
      vscode2.postMessage({ type: "shipSelectSector", sectorId, subId: shipSelectedSubId, profile: shipGetProfile() });
      stationSetScene2(sectorId, shipSelectedSubId ? false : true);
      updateDocSuggestion2(sectorId);
    }
    function shipRequestContextPack2() {
      vscode2.postMessage({ type: "shipGetContextPack", sectorId: shipSelectedSectorId, subId: shipSelectedSubId, profile: shipGetProfile() });
      shipSetStatus2("Requesting Context Pack...");
    }
    function openHotspotTool2() {
      vscode2.postMessage({ type: "openHotspotTool", sceneId: stationSceneId });
    }
    function shipRunGates2() {
      vscode2.postMessage({ type: "shipRunGates", sectorId: shipSelectedSectorId, subId: shipSelectedSubId, profile: shipGetProfile() });
      shipSetStatus2("Running gates...");
    }
    function shipDocsStatus2() {
      vscode2.postMessage({ type: "shipDocsStatus", sectorId: shipSelectedSectorId, subId: shipSelectedSubId, profile: shipGetProfile() });
      shipSetStatus2("Checking docs status...");
    }
    function asmdefRefresh2() {
      vscode2.postMessage({ type: "asmdefInventory" });
      shipSetStatus2("Loading asmdef inventory...");
    }
    function asmdefGeneratePolicy2() {
      vscode2.postMessage({ type: "asmdefGeneratePolicy" });
      shipSetStatus2("Generating asmdef policy draft...");
    }
    function asmdefOpenPolicy2() {
      vscode2.postMessage({ type: "asmdefOpenPolicy" });
      shipSetStatus2("Opening asmdef policy...");
    }
    function asmdefEditPolicy2() {
      vscode2.postMessage({ type: "asmdefGetPolicy" });
      shipSetStatus2("Loading asmdef policy...");
    }
    function asmdefReloadPolicy2() {
      asmdefEditPolicy2();
    }
    function asmdefSavePolicy2() {
      const textEl = document.getElementById("asmdefPolicyText");
      if (!textEl)
        return;
      const text = textEl.value || "";
      if (!text.trim()) {
        shipSetStatus2("Policy is empty.");
        return;
      }
      vscode2.postMessage({ type: "asmdefSavePolicy", text });
      shipSetStatus2("Saving asmdef policy...");
    }
    function asmdefSetStrict2() {
      vscode2.postMessage({ type: "asmdefSetStrict" });
      shipSetStatus2("Setting asmdef policy to strict...");
    }
    function asmdefSetAdvisory2() {
      vscode2.postMessage({ type: "asmdefSetAdvisory" });
      shipSetStatus2("Setting asmdef policy to advisory...");
    }
    function asmdefNormalizeGuids2() {
      vscode2.postMessage({ type: "asmdefNormalizeGuids" });
      shipSetStatus2("Normalizing GUID references...");
    }
    function asmdefGraph2() {
      vscode2.postMessage({ type: "asmdefGraph" });
      shipSetStatus2("Loading asmdef graph...");
    }
    function asmdefValidate2() {
      vscode2.postMessage({ type: "asmdefValidate" });
      shipSetStatus2("Validating asmdef policy...");
    }
    function copyAsmdefFixes2() {
      const listEl = document.getElementById("asmdefViolations");
      if (!listEl)
        return;
      const suggestions = Array.from(listEl.querySelectorAll(".asmdef-item-refs")).map((el) => el.textContent || "").filter((t) => t.startsWith("Suggest: ")).map((t) => t.replace(/^Suggest:\\s*/, "").trim());
      if (!suggestions.length) {
        shipSetStatus2("No fixes to copy.");
        return;
      }
      const text = suggestions.join("\\n");
      navigator.clipboard.writeText(text).then(() => {
        shipSetStatus2("Fixes copied to clipboard.");
      }, () => {
        shipSetStatus2("Failed to copy fixes.");
      });
    }
    function setCoordinatorPill2(el, status) {
      if (!el)
        return;
      const value = status || "unknown";
      el.textContent = value;
      el.classList.remove("ok", "warn", "bad", "muted");
      if (value === "ok") {
        el.classList.add("ok");
      } else if (value === "unknown") {
        el.classList.add("muted");
      } else if (value.includes("warn") || value.includes("delay")) {
        el.classList.add("warn");
      } else {
        el.classList.add("bad");
      }
    }
    function updateCoordinatorSummary2(targetId, status) {
      const el = document.getElementById(targetId);
      if (!el)
        return;
      const issues = ["policy", "inventory", "graph"].filter((k) => status[k] && status[k] !== "ok" && status[k] !== "unknown");
      if (!issues.length) {
        el.textContent = "All sync channels healthy.";
        return;
      }
      el.textContent = "Issues: " + issues.map((k) => k + ":" + status[k]).join(", ");
    }
    function updateCoordinatorLastIssue2(targetId, issue) {
      const el = document.getElementById(targetId);
      if (el)
        el.textContent = issue || "none";
    }
    function coordinatorHealthCheck2() {
      vscode2.postMessage({ type: "coordinatorHealth" });
      shipSetStatus2("Checking Coordinator status...");
    }
    function shipToggleAutoexecute2() {
      shipAutoexecute = !shipAutoexecute;
      shipUpdateChips2();
      vscode2.postMessage({ type: "shipToggleAutoexecute" });
    }
    function initStationUI2() {
      const injectToggle = document.getElementById("injectContextToggle");
      if (injectToggle) {
        const key = "spacecode.injectContext";
        const saved = localStorage.getItem(key);
        if (saved === "0")
          injectToggle.checked = false;
        injectToggle.addEventListener("change", () => {
          localStorage.setItem(key, injectToggle.checked ? "1" : "0");
        });
      }
      vscode2.postMessage({ type: "getContextPreview" });
      vscode2.postMessage({ type: "coordinatorHealth" });
      const sel = document.getElementById("shipProfileSelect");
      if (sel) {
        sel.addEventListener("change", () => {
          setShipProfile2(shipGetProfile());
          vscode2.postMessage({ type: "shipSetProfile", profile: shipGetProfile() });
          shipSetStatus2("Profile set to " + shipGetProfile() + ".");
        });
      }
      stationRenderScene2();
      shipRender2();
      const shipImg = document.getElementById("shipImage");
      if (shipImg) {
        shipImg.addEventListener("load", () => {
          stationUpdateViewport2();
        });
      }
      const shipCanvas = document.getElementById("shipCanvas");
      if (shipCanvas && typeof ResizeObserver !== "undefined") {
        const ro = new ResizeObserver(() => {
          stationUpdateViewport2();
        });
        ro.observe(shipCanvas);
      }
    }
    return {
      setUpdateDocSuggestion: setUpdateDocSuggestion2,
      initStationUI: initStationUI2,
      updateStationLabels: updateStationLabels2,
      stationRenderScene: stationRenderScene2,
      stationRenderSchematic: stationRenderSchematic2,
      stationRenderPhoto: stationRenderPhoto2,
      stationToggleViewMode: stationToggleViewMode2,
      stationGoBack: stationGoBack2,
      stationSetScene: stationSetScene2,
      stationUpdateViewport: stationUpdateViewport2,
      shipRender: shipRender2,
      shipUpdateChips: shipUpdateChips2,
      shipSelectSector: shipSelectSector2,
      shipRequestContextPack: shipRequestContextPack2,
      shipRunGates: shipRunGates2,
      shipDocsStatus: shipDocsStatus2,
      openHotspotTool: openHotspotTool2,
      shipToggleAutoexecute: shipToggleAutoexecute2,
      asmdefRefresh: asmdefRefresh2,
      asmdefGeneratePolicy: asmdefGeneratePolicy2,
      asmdefOpenPolicy: asmdefOpenPolicy2,
      asmdefEditPolicy: asmdefEditPolicy2,
      asmdefReloadPolicy: asmdefReloadPolicy2,
      asmdefSavePolicy: asmdefSavePolicy2,
      asmdefSetStrict: asmdefSetStrict2,
      asmdefSetAdvisory: asmdefSetAdvisory2,
      asmdefNormalizeGuids: asmdefNormalizeGuids2,
      asmdefGraph: asmdefGraph2,
      asmdefValidate: asmdefValidate2,
      copyAsmdefFixes: copyAsmdefFixes2,
      setCoordinatorPill: setCoordinatorPill2,
      updateCoordinatorSummary: updateCoordinatorSummary2,
      updateCoordinatorLastIssue: updateCoordinatorLastIssue2,
      coordinatorHealthCheck: coordinatorHealthCheck2,
      getShipSelectedSectorId: getShipSelectedSectorId2,
      getShipSelectedSubId: getShipSelectedSubId2,
      getShipAutoexecute: getShipAutoexecute2,
      getShipProfile: getShipProfile2,
      setShipSelectedSectorId: setShipSelectedSectorId2,
      setShipSelectedSubId: setShipSelectedSubId2,
      setShipAutoexecute: setShipAutoexecute2,
      setShipProfile: setShipProfile2
    };
  }

  // src/webview/panel/features/asmdef.ts
  function createAsmdefHandlers(deps) {
    const { vscode: vscode2, escapeHtml: escapeHtml2 } = deps;
    function renderAsmdefInventory2(inventory) {
      const summaryEl = document.getElementById("asmdefSummary");
      const listEl = document.getElementById("asmdefList");
      const badgeEl = document.getElementById("asmdefPolicyModeBadge");
      if (!summaryEl || !listEl)
        return;
      if (!inventory || !Array.isArray(inventory.asmdefs)) {
        summaryEl.textContent = "Asmdef inventory unavailable.";
        listEl.innerHTML = "";
        return;
      }
      const count = inventory.asmdefs.length;
      const policyMode = inventory.policy?.mode || "none";
      const policyEntries = inventory.policy?.entries ? Object.keys(inventory.policy.entries).length : 0;
      const policyPath = inventory.policyPath ? "\nPolicy: " + inventory.policyPath : "";
      const warnCount = Array.isArray(inventory.warnings) ? inventory.warnings.length : 0;
      summaryEl.textContent = "Asmdefs: " + count + "\nPolicy: " + policyMode + (policyEntries ? " (" + policyEntries + " entries)" : "") + policyPath + (warnCount ? "\nWarnings: " + warnCount : "");
      if (badgeEl) {
        badgeEl.textContent = "Policy: " + policyMode;
        badgeEl.classList.toggle("ok", policyMode === "strict");
        badgeEl.classList.toggle("muted", policyMode === "none");
      }
      listEl.innerHTML = "";
      inventory.asmdefs.forEach((a) => {
        const item = document.createElement("div");
        item.className = "asmdef-item";
        const refs = Array.isArray(a.references) && a.references.length ? a.references.join(", ") : "(none)";
        item.innerHTML = `
          <div class="asmdef-item-header">
            <span>${escapeHtml2(a.name || "(unnamed)")}</span>
            <span style="color: var(--text-secondary);">${escapeHtml2(a.sector?.id || "unknown")}</span>
          </div>
          <div class="asmdef-item-refs">Refs: ${escapeHtml2(refs)}</div>
          <div style="font-size:10px; color: var(--text-secondary);">${escapeHtml2(a.path || "")}</div>
        `;
        listEl.appendChild(item);
      });
    }
    function renderAsmdefPolicyEditor2(payload) {
      const editor = document.getElementById("asmdefPolicyEditor");
      const textEl = document.getElementById("asmdefPolicyText");
      const pathEl = document.getElementById("asmdefPolicyPath");
      if (!editor || !textEl)
        return;
      editor.style.display = "block";
      textEl.value = payload?.policyText || "";
      if (pathEl)
        pathEl.textContent = payload?.policyPath ? payload.policyPath : "(no policy)";
    }
    function renderAsmdefGraph2(graph) {
      const summaryEl = document.getElementById("asmdefGraphSummary");
      const listEl = document.getElementById("asmdefGraphList");
      const canvasEl = document.getElementById("asmdefGraphCanvas");
      if (!summaryEl || !listEl || !canvasEl)
        return;
      if (!graph || !Array.isArray(graph.nodes)) {
        summaryEl.style.display = "none";
        listEl.style.display = "none";
        canvasEl.style.display = "none";
        canvasEl.innerHTML = "";
        return;
      }
      const nodes = graph.nodes.length;
      const edges = Array.isArray(graph.edges) ? graph.edges.length : 0;
      const unresolved = Array.isArray(graph.unresolved) ? graph.unresolved.length : 0;
      summaryEl.textContent = "Graph: " + nodes + " nodes, " + edges + " edges" + (unresolved ? ", " + unresolved + " unresolved" : "") + ".";
      summaryEl.style.display = "block";
      listEl.style.display = "block";
      canvasEl.style.display = "block";
      listEl.innerHTML = "";
      const maxEdges = 200;
      (graph.edges || []).slice(0, maxEdges).forEach((e) => {
        const item = document.createElement("div");
        item.className = "asmdef-item";
        item.innerHTML = '<div class="asmdef-item-header"><span>' + escapeHtml2(e.from) + '</span><span style="opacity:0.6;">\u2192</span><span>' + escapeHtml2(e.to) + "</span></div>";
        listEl.appendChild(item);
      });
      if (unresolved) {
        const warn = document.createElement("div");
        warn.className = "asmdef-item";
        warn.innerHTML = '<div class="asmdef-item-refs">Unresolved refs:\n' + escapeHtml2((graph.unresolved || []).join("\n")) + "</div>";
        listEl.appendChild(warn);
      }
      renderAsmdefGraphCanvas(graph, canvasEl);
    }
    function renderAsmdefCheckResult2(result) {
      const listEl = document.getElementById("asmdefViolations");
      if (!listEl)
        return;
      if (!result) {
        listEl.style.display = "none";
        listEl.innerHTML = "";
        return;
      }
      listEl.style.display = "block";
      listEl.innerHTML = "";
      const suggestions = [];
      if (Array.isArray(result.violations)) {
        result.violations.forEach((v) => {
          if (v && v.suggestion)
            suggestions.push(v.suggestion);
        });
      }
      const summary = document.createElement("div");
      summary.className = "asmdef-item";
      summary.innerHTML = '<div class="asmdef-item-header"><span>Validation</span><span class="asmdef-badge ' + (result.passed ? "ok" : "fail") + '">' + (result.passed ? "PASS" : "FAIL") + '</span></div><div class="asmdef-item-refs">' + escapeHtml2(result.summary || "") + "</div>" + (suggestions.length ? '<div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap;"><button class="btn-secondary" onclick="copyAsmdefFixes()" style="padding:4px 10px;">Copy Fixes</button></div>' : "");
      listEl.appendChild(summary);
      if (Array.isArray(result.violations)) {
        result.violations.forEach((v) => {
          const item = document.createElement("div");
          item.className = "asmdef-item";
          item.innerHTML = '<div class="asmdef-item-header"><span>' + escapeHtml2(v.asmdefName || "(unknown)") + '</span><span style="color:#f87171;">' + escapeHtml2(v.reference || "") + '</span></div><div class="asmdef-item-refs">' + escapeHtml2(v.message || "") + "</div>" + (v.suggestion ? '<div class="asmdef-item-refs" style="color:#a7f3d0;">Suggest: ' + escapeHtml2(v.suggestion) + "</div>" : "") + '<div style="font-size:10px; color:var(--text-secondary);">' + escapeHtml2(v.asmdefPath || "") + "</div>";
          listEl.appendChild(item);
        });
      }
      if (Array.isArray(result.warnings) && result.warnings.length) {
        const warn = document.createElement("details");
        warn.className = "asmdef-item asmdef-warnings";
        warn.innerHTML = "<summary>Warnings (" + result.warnings.length + ')</summary><div class="asmdef-item-refs">' + escapeHtml2(result.warnings.join("\n")) + "</div>";
        listEl.appendChild(warn);
      }
    }
    function renderAsmdefGraphCanvas(graph, canvasEl) {
      const nodeItems = Array.isArray(graph.nodes) ? graph.nodes : [];
      const nodes = nodeItems.map((n) => n.id);
      const edges = Array.isArray(graph.edges) ? graph.edges : [];
      if (nodes.length === 0) {
        canvasEl.innerHTML = "";
        return;
      }
      const layout = computeAsmdefLayout(nodeItems, edges);
      const width = layout.width;
      const height = layout.height;
      canvasEl.innerHTML = "";
      canvasEl.style.minHeight = height + "px";
      const inner = document.createElement("div");
      inner.className = "asmdef-graph-inner";
      inner.style.width = width + "px";
      inner.style.height = height + "px";
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("width", String(width));
      svg.setAttribute("height", String(height));
      svg.classList.add("asmdef-graph-svg");
      edges.forEach((e) => {
        const from = layout.pos[e.from];
        const to = layout.pos[e.to];
        if (!from || !to)
          return;
        const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
        const startX = from.x + from.w;
        const startY = from.y + from.h / 2;
        const endX = to.x;
        const endY = to.y + to.h / 2;
        const midX = (startX + endX) / 2;
        const d = "M " + startX + " " + startY + " C " + midX + " " + startY + ", " + midX + " " + endY + ", " + endX + " " + endY;
        line.setAttribute("d", d);
        line.setAttribute("stroke", "rgba(59,130,246,0.6)");
        line.setAttribute("stroke-width", "1.5");
        line.setAttribute("fill", "none");
        line.classList.add("asmdef-edge");
        line.setAttribute("data-from", e.from);
        line.setAttribute("data-to", e.to);
        svg.appendChild(line);
      });
      inner.appendChild(svg);
      const sectorById = /* @__PURE__ */ new Map();
      const pathById = /* @__PURE__ */ new Map();
      nodeItems.forEach((n) => {
        if (n && n.id)
          sectorById.set(n.id, n.sector || "unknown");
        if (n && n.id)
          pathById.set(n.id, n.path || "");
      });
      nodes.forEach((id) => {
        const pos = layout.pos[id];
        if (!pos)
          return;
        const nodeEl = document.createElement("div");
        nodeEl.className = "asmdef-node";
        nodeEl.style.left = pos.x + "px";
        nodeEl.style.top = pos.y + "px";
        nodeEl.style.width = pos.w + "px";
        const sectorLabel = sectorById.get(id) || "unknown";
        nodeEl.innerHTML = escapeHtml2(id) + "<small>" + escapeHtml2(sectorLabel) + "</small>";
        nodeEl.dataset.id = id;
        const p = pathById.get(id);
        if (p)
          nodeEl.dataset.path = p;
        nodeEl.addEventListener("click", (ev) => {
          selectAsmdefNode(canvasEl, id);
          if (ev.detail >= 2 && nodeEl.dataset.path) {
            vscode2.postMessage({ type: "asmdefOpen", path: nodeEl.dataset.path });
          }
        });
        inner.appendChild(nodeEl);
      });
      canvasEl.appendChild(inner);
      initAsmdefGraphInteractions(canvasEl);
    }
    function selectAsmdefNode(canvasEl, id) {
      const nodes = canvasEl.querySelectorAll(".asmdef-node");
      nodes.forEach((n) => {
        const match = n.dataset.id === id;
        n.classList.toggle("selected", match);
      });
      const edges = canvasEl.querySelectorAll(".asmdef-edge");
      edges.forEach((e) => {
        const from = e.getAttribute("data-from");
        const to = e.getAttribute("data-to");
        const highlight = id && (from === id || to === id);
        e.classList.toggle("highlight", !!highlight);
      });
    }
    function initAsmdefGraphInteractions(canvasEl) {
      if (canvasEl.dataset.inited === "1")
        return;
      canvasEl.dataset.inited = "1";
      const state = {
        scale: 1,
        x: 0,
        y: 0,
        dragging: false,
        dragStartX: 0,
        dragStartY: 0
      };
      canvasEl._graphState = state;
      const getInner = () => canvasEl.querySelector(".asmdef-graph-inner");
      const applyTransform = () => {
        const inner = getInner();
        if (!inner)
          return;
        inner.style.transform = "translate(" + state.x + "px, " + state.y + "px) scale(" + state.scale + ")";
      };
      canvasEl.addEventListener("wheel", (e) => {
        e.preventDefault();
        const delta = Math.sign(e.deltaY) * -0.1;
        const next = Math.min(2, Math.max(0.4, state.scale + delta));
        if (next === state.scale)
          return;
        state.scale = next;
        applyTransform();
      }, { passive: false });
      canvasEl.addEventListener("mousedown", (e) => {
        const target = e.target;
        if (target && target.closest && target.closest(".asmdef-node"))
          return;
        state.dragging = true;
        state.dragStartX = e.clientX - state.x;
        state.dragStartY = e.clientY - state.y;
        canvasEl.classList.add("dragging");
      });
      window.addEventListener("mousemove", (e) => {
        if (!state.dragging)
          return;
        state.x = e.clientX - state.dragStartX;
        state.y = e.clientY - state.dragStartY;
        applyTransform();
      });
      window.addEventListener("mouseup", () => {
        if (!state.dragging)
          return;
        state.dragging = false;
        canvasEl.classList.remove("dragging");
      });
      applyTransform();
    }
    function computeAsmdefLayout(nodeItems, edges) {
      const nodes = nodeItems.map((n) => n.id);
      const sectorById = /* @__PURE__ */ new Map();
      nodeItems.forEach((n) => {
        if (!n || !n.id)
          return;
        sectorById.set(n.id, n.sector || "unknown");
      });
      const sectorOrder = Array.from(new Set(nodeItems.map((n) => n.sector || "unknown"))).sort((a, b) => String(a).localeCompare(String(b)));
      const groups = /* @__PURE__ */ new Map();
      sectorOrder.forEach((s) => groups.set(s, []));
      nodes.slice().sort((a, b) => a.localeCompare(b)).forEach((id) => {
        const s = sectorById.get(id) || "unknown";
        if (!groups.has(s))
          groups.set(s, []);
        groups.get(s).push(id);
      });
      const colGap = 220;
      const rowGap = 70;
      const margin = 20;
      const nodeW = 160;
      const nodeH = 36;
      const maxRows = Math.max(1, ...Array.from(groups.values()).map((arr) => arr.length));
      const width = margin * 2 + nodeW + (groups.size - 1) * colGap;
      const height = margin * 2 + nodeH + (maxRows - 1) * rowGap;
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
    return {
      renderAsmdefInventory: renderAsmdefInventory2,
      renderAsmdefPolicyEditor: renderAsmdefPolicyEditor2,
      renderAsmdefGraph: renderAsmdefGraph2,
      renderAsmdefCheckResult: renderAsmdefCheckResult2
    };
  }

  // src/webview/panel/features/autoexecute.ts
  function createAutoexecuteHandlers(deps) {
    const { vscode: vscode2 } = deps;
    function renderJobList2(jobs) {
      const list = document.getElementById("jobList");
      if (!list)
        return;
      list.innerHTML = "";
      if (!Array.isArray(jobs) || jobs.length === 0) {
        list.innerHTML = '<div style="color: var(--text-secondary); font-size:11px;">No pending approvals.</div>';
        return;
      }
      jobs.forEach((job) => {
        const entry = document.createElement("div");
        entry.className = "job-entry";
        entry.innerHTML = `<strong>${job.action}</strong>
          <div>Sector: ${job.sector}</div>
          <div>Doc: ${job.docTarget || "(none)"}</div>
          <div style="font-size:10px; color:var(--text-secondary);">status: ${job.status}</div>`;
        const actions = document.createElement("div");
        actions.className = "job-actions";
        if (job.status === "pending") {
          const approve = document.createElement("button");
          approve.textContent = "Approve";
          approve.className = "btn-secondary";
          approve.onclick = () => vscode2.postMessage({ type: "autoexecuteApprove", jobId: job.id });
          const reject = document.createElement("button");
          reject.textContent = "Reject";
          reject.className = "btn-secondary";
          reject.onclick = () => vscode2.postMessage({ type: "autoexecuteReject", jobId: job.id });
          actions.appendChild(approve);
          actions.appendChild(reject);
        } else {
          const span = document.createElement("span");
          span.style.opacity = "0.7";
          span.textContent = job.status.toUpperCase();
          actions.appendChild(span);
        }
        entry.appendChild(actions);
        list.appendChild(entry);
      });
    }
    function requestJobList2() {
      vscode2.postMessage({ type: "autoexecuteList" });
    }
    function clearAllJobs2() {
      vscode2.postMessage({ type: "autoexecuteClearAll" });
    }
    return {
      renderJobList: renderJobList2,
      requestJobList: requestJobList2,
      clearAllJobs: clearAllJobs2
    };
  }

  // src/webview/panel/features/rightPanel.ts
  function createRightPanelHandlers(deps) {
    const {
      currentTab: currentTab2,
      TABS: TABS2,
      TAB_PANEL_MODES: TAB_PANEL_MODES2,
      TAB_DEFAULT_MODE: TAB_DEFAULT_MODE2
    } = deps;
    function setRightPanelMode2(mode) {
      const pane = document.getElementById("stationSection");
      if (!pane)
        return;
      pane.dataset.panelMode = mode;
      const buttons = {
        station: document.getElementById("panelModeStation"),
        control: document.getElementById("panelModeControl"),
        flow: document.getElementById("panelModeFlow"),
        chat: document.getElementById("panelModeChat"),
        planning: document.getElementById("panelModePlanning")
      };
      for (const [btnMode, btn] of Object.entries(buttons)) {
        if (btn)
          btn.classList.toggle("active", mode === btnMode);
      }
      if (currentTab2) {
        localStorage.setItem(`spacecode.panelMode.${currentTab2()}`, mode);
      }
      localStorage.setItem("spacecode.panelMode", mode);
      updatePanelToggleButtons2();
    }
    function updatePanelToggleButtons2() {
      document.querySelectorAll(".panel-toggle button[data-tab-scope]").forEach((btn) => {
        const scope = btn.getAttribute("data-tab-scope");
        if (scope === "station") {
          btn.style.display = currentTab2() === TABS2.STATION ? "" : "none";
        } else if (scope === "chat") {
          btn.style.display = currentTab2() === TABS2.STATION ? "" : "none";
        }
      });
    }
    function restoreRightPanelModeForTab2(tab) {
      const saved = localStorage.getItem(`spacecode.panelMode.${tab}`);
      const allowed = TAB_PANEL_MODES2[tab];
      if (saved && allowed && allowed.includes(saved)) {
        setRightPanelMode2(saved);
      } else {
        setRightPanelMode2(TAB_DEFAULT_MODE2[tab] || "station");
      }
    }
    function toggleContextFlowPanel2() {
      const stationSection = document.getElementById("stationSection");
      if (!stationSection)
        return;
      const isHidden = !stationSection.classList.contains("active");
      if (isHidden) {
        stationSection.classList.add("active");
        stationSection.dataset.panelMode = "flow";
      } else {
        stationSection.classList.remove("active");
      }
    }
    function toggleSwarmSidebar2() {
    }
    function toggleContextFlowDrawer2() {
      toggleContextFlowPanel2();
    }
    return {
      setRightPanelMode: setRightPanelMode2,
      updatePanelToggleButtons: updatePanelToggleButtons2,
      restoreRightPanelModeForTab: restoreRightPanelModeForTab2,
      toggleContextFlowPanel: toggleContextFlowPanel2,
      toggleSwarmSidebar: toggleSwarmSidebar2,
      toggleContextFlowDrawer: toggleContextFlowDrawer2
    };
  }

  // src/webview/panel/features/planningPanel.ts
  var PHASE_CONFIGS = {
    study: {
      name: "Study",
      lead: "Nova",
      description: "Understand the feature, gather requirements, check GDD",
      checklist: [
        "Feature requirements identified",
        "User stories defined",
        "GDD/documentation reviewed",
        "Scope boundaries clear",
        "Success criteria defined"
      ]
    },
    connect: {
      name: "Connect",
      lead: "Gears",
      description: "Map to existing code, identify touch points, check SA",
      checklist: [
        "Existing code analyzed",
        "Touch points identified",
        "SA alignment verified",
        "Dependencies mapped",
        "Reuse candidates found"
      ]
    },
    plan: {
      name: "Plan",
      lead: "Nova",
      description: "Break into phases, define tasks, estimate risk",
      checklist: [
        "Phases defined",
        "Tasks broken down",
        "File changes listed",
        "Risk assessment complete",
        "Dependencies noted"
      ]
    },
    review: {
      name: "Review",
      lead: "Index",
      description: "Validate plan, update docs, approve",
      checklist: [
        "Plan structure valid",
        "Docs updates identified",
        "SA changes noted",
        "Approval obtained"
      ]
    }
  };
  var PHASE_ORDER = ["study", "connect", "plan", "review"];
  function createPlanningPanelHandlers(deps) {
    const { vscode: vscode2, escapeHtml: escapeHtml2, shipSetStatus: shipSetStatus2 } = deps;
    let currentState = null;
    function renderPlanningPanel2(state) {
      currentState = state;
      const container = document.getElementById("planningPanelContent");
      if (!container)
        return;
      const body = container.querySelector(".planning-panel-body") || container;
      if (!state || !state.isActive || !state.session) {
        body.innerHTML = buildEmptyState();
        return;
      }
      body.innerHTML = buildActiveState(state);
      attachEventListeners();
    }
    function buildEmptyState() {
      return `<div class="planning-empty">
      <div class="planning-empty-icon">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"></path>
          <rect x="9" y="3" width="6" height="4" rx="1"></rect>
          <path d="M9 12h6"></path><path d="M9 16h6"></path>
        </svg>
      </div>
      <div class="planning-empty-title">Planning Mode</div>
      <div class="planning-empty-desc">Structured analysis before implementation.<br/>Study \u2192 Connect \u2192 Plan \u2192 Review</div>
      <div class="planning-start-form">
        <input type="text" id="planningFeatureName" class="input-field" placeholder="Feature name..." />
        <textarea id="planningFeatureDesc" class="input-field textarea" placeholder="Describe what you want to build..." rows="3"></textarea>
        <button class="btn-primary" onclick="startPlanningSession()">Start Planning Session</button>
      </div>
    </div>`;
    }
    function buildActiveState(state) {
      const session = state.session;
      let html = "";
      html += '<div class="planning-stepper">';
      PHASE_ORDER.forEach((phase, idx) => {
        const phaseState = session.phases[phase];
        const isCurrent = session.currentPhase === phase;
        const statusClass = phaseState.status === "completed" ? "completed" : phaseState.status === "skipped" ? "skipped" : isCurrent ? "active" : "pending";
        html += `<div class="planning-step ${statusClass}">`;
        html += `<div class="step-number">${phaseState.status === "completed" ? "\u2713" : idx + 1}</div>`;
        html += `<div class="step-label">${PHASE_CONFIGS[phase].name}</div>`;
        html += "</div>";
        if (idx < 3)
          html += '<div class="step-connector"></div>';
      });
      html += "</div>";
      html += `<div class="planning-feature-title">${escapeHtml2(session.feature)}</div>`;
      const cp = session.currentPhase;
      const cpState = session.phases[cp];
      const config = PHASE_CONFIGS[cp];
      html += '<div class="planning-phase-detail">';
      html += `<div class="phase-header">`;
      html += `<span class="phase-name">${config.name}</span>`;
      html += `<span class="phase-lead">Lead: ${config.lead}</span>`;
      html += "</div>";
      html += `<div class="phase-description">${escapeHtml2(config.description)}</div>`;
      html += '<div class="planning-checklist">';
      config.checklist.forEach((item, idx) => {
        const checked = cpState.checklistCompleted && cpState.checklistCompleted[idx];
        html += `<label class="checklist-item">`;
        html += `<input type="checkbox" ${checked ? "checked" : ""} data-checklist-idx="${idx}" />`;
        html += `<span>${escapeHtml2(item)}</span>`;
        html += "</label>";
      });
      html += "</div>";
      const gate = (state.gates || []).find((g) => g.phase === cp);
      if (gate) {
        const gateClass = gate.status === "passed" ? "passed" : gate.status === "failed" ? "failed" : "pending";
        html += `<div class="planning-gate ${gateClass}">`;
        html += `<span class="gate-label">${escapeHtml2(gate.name)}</span>`;
        html += `<span class="gate-status">${gate.status}</span>`;
        if (gate.status === "pending") {
          html += `<button class="btn-secondary btn-sm" onclick="passCurrentGate()">Pass</button>`;
        }
        html += "</div>";
      }
      html += "</div>";
      const files = session.affectedFiles || [];
      if (files.length > 0) {
        html += '<div class="planning-section">';
        html += '<div class="section-header">Affected Files <span class="section-count">' + files.length + "</span></div>";
        html += '<div class="affected-files-list">';
        files.forEach((f) => {
          const badge = f.action === "create" ? "+" : f.action === "delete" ? "-" : "M";
          const cls = f.action || "modify";
          html += `<div class="affected-file"><span class="file-action ${cls}">${badge}</span>${escapeHtml2(f.path)}</div>`;
        });
        html += "</div></div>";
      }
      const risk = session.riskAssessment;
      if (risk && risk.items && risk.items.length > 0) {
        html += '<div class="planning-section">';
        html += `<div class="section-header">Risk <span class="risk-badge risk-${risk.overall}">${risk.overall}</span></div>`;
        risk.items.forEach((item) => {
          html += `<div class="risk-item risk-${item.level}"><span class="risk-level">${item.level}</span> ${escapeHtml2(item.description)}</div>`;
        });
        html += "</div>";
      }
      html += '<div class="planning-actions">';
      if (state.canSkipToPhase) {
        html += `<button class="btn-secondary btn-sm" onclick="skipToPlanPhase()">Skip to Plan</button>`;
      }
      if (cp === "plan") {
        html += `<button class="btn-secondary btn-sm" onclick="generatePlanFromSession()">Generate Plan</button>`;
      }
      if (cp !== "review") {
        html += `<button class="btn-secondary btn-sm" onclick="advancePlanPhase()">Next Phase</button>`;
      } else {
        html += `<button class="btn-primary btn-sm" onclick="completePlanSession()">Complete</button>`;
      }
      html += `<button class="btn-secondary btn-sm" onclick="cancelPlanSession()">Cancel</button>`;
      html += "</div>";
      return html;
    }
    function attachEventListeners() {
      document.querySelectorAll('.planning-checklist input[type="checkbox"]').forEach((cb) => {
        cb.addEventListener("change", (e) => {
          const idx = parseInt(e.target.dataset.checklistIdx, 10);
          vscode2.postMessage({ type: "updatePlanningChecklist", index: idx, completed: e.target.checked });
        });
      });
    }
    function startPlanningSession2() {
      const nameEl = document.getElementById("planningFeatureName");
      const descEl = document.getElementById("planningFeatureDesc");
      const feature = nameEl ? nameEl.value.trim() : "";
      const description = descEl ? descEl.value.trim() : "";
      if (!feature) {
        if (shipSetStatus2)
          shipSetStatus2("Feature name is required.");
        return;
      }
      vscode2.postMessage({ type: "startPlanningSession", feature, description });
    }
    function advancePlanPhase2() {
      vscode2.postMessage({ type: "advancePlanPhase" });
    }
    function skipToPlanPhase2() {
      vscode2.postMessage({ type: "skipToPlanPhase", targetPhase: "plan" });
    }
    function cancelPlanSession2() {
      vscode2.postMessage({ type: "cancelPlanningSession" });
    }
    function completePlanSession2() {
      vscode2.postMessage({ type: "completePlanningSession" });
    }
    function passCurrentGate2() {
      if (!currentState || !currentState.session)
        return;
      const gate = (currentState.gates || []).find((g) => g.phase === currentState.session.currentPhase);
      if (gate) {
        vscode2.postMessage({ type: "passPlanningGate", gateId: gate.id });
      }
    }
    function generatePlanFromSession2() {
      vscode2.postMessage({ type: "generatePlanFromSession" });
    }
    return {
      renderPlanningPanel: renderPlanningPanel2,
      startPlanningSession: startPlanningSession2,
      advancePlanPhase: advancePlanPhase2,
      skipToPlanPhase: skipToPlanPhase2,
      cancelPlanSession: cancelPlanSession2,
      completePlanSession: completePlanSession2,
      passCurrentGate: passCurrentGate2,
      generatePlanFromSession: generatePlanFromSession2
    };
  }

  // src/webview/panel/features/controlTabs.ts
  function createControlTabsHandlers(deps) {
    const { unityCheckConnection: unityCheckConnection2, onSectorsTabOpen, onEngineerTabOpen, onCommsTabOpen, onInfraTabOpen, onDiagnosticsTabOpen: onDiagnosticsTabOpen2 } = deps;
    const TAB_IDS = ["info", "sectors", "ops", "security", "quality", "diagnostics", "unity", "gameui", "engineer", "comms", "infra"];
    function switchControlTab2(tab) {
      for (const id of TAB_IDS) {
        const capitalized = id.charAt(0).toUpperCase() + id.slice(1);
        const btn = document.getElementById("controlTabBtn" + capitalized);
        const panel = document.getElementById("controlTab" + capitalized);
        if (btn)
          btn.classList.remove("active");
        if (panel)
          panel.style.display = "none";
      }
      if (tab === "coordinator")
        tab = "info";
      const selectedId = tab.charAt(0).toUpperCase() + tab.slice(1);
      const selectedBtn = document.getElementById("controlTabBtn" + selectedId);
      const selectedPanel = document.getElementById("controlTab" + selectedId);
      if (selectedBtn)
        selectedBtn.classList.add("active");
      if (selectedPanel)
        selectedPanel.style.display = "flex";
      if (tab === "sectors" && typeof onSectorsTabOpen === "function") {
        onSectorsTabOpen();
      } else if (tab === "unity") {
        unityCheckConnection2();
      } else if (tab === "engineer" && typeof onEngineerTabOpen === "function") {
        onEngineerTabOpen();
      } else if (tab === "comms" && typeof onCommsTabOpen === "function") {
        onCommsTabOpen();
      } else if (tab === "infra" && typeof onInfraTabOpen === "function") {
        onInfraTabOpen();
      } else if (tab === "diagnostics" && typeof onDiagnosticsTabOpen2 === "function") {
        onDiagnosticsTabOpen2();
      }
      localStorage.setItem("spacecode.controlTab", tab);
    }
    return { switchControlTab: switchControlTab2 };
  }

  // src/webview/panel/features/splitter.ts
  function initChatSplitter() {
    const splitter = document.getElementById("chatSplitter");
    const container = document.querySelector(".main-split");
    const chatPane = document.getElementById("chatPane");
    if (!splitter || !container || !chatPane)
      return;
    const STORAGE_KEY = "spacecode.chatPaneWidthPct";
    const MIN_PCT = 20;
    const MAX_PCT = 50;
    const MIN_CHAT_PX = 250;
    const MIN_CONTENT_PX = 300;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && !Number.isNaN(parseFloat(saved))) {
      const pct = Math.max(MIN_PCT, Math.min(MAX_PCT, parseFloat(saved)));
      chatPane.style.flex = `0 0 ${pct}%`;
    }
    let dragging = false;
    splitter.addEventListener("mousedown", (e) => {
      dragging = true;
      document.body.classList.add("resizing");
      splitter.classList.add("dragging");
      e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragging)
        return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = x / rect.width * 100;
      const chatPx = pct / 100 * rect.width;
      const contentPx = rect.width - chatPx - 4;
      if (chatPx < MIN_CHAT_PX || contentPx < MIN_CONTENT_PX) {
        if (chatPx < MIN_CHAT_PX && typeof window.toggleChatCollapse === "function") {
          if (!chatPane.classList.contains("collapsed")) {
            window.toggleChatCollapse();
            dragging = false;
            document.body.classList.remove("resizing");
            splitter.classList.remove("dragging");
          }
        }
        return;
      }
      const clamped = Math.max(MIN_PCT, Math.min(MAX_PCT, pct));
      chatPane.style.flex = `0 0 ${clamped}%`;
    });
    window.addEventListener("mouseup", () => {
      if (!dragging)
        return;
      dragging = false;
      document.body.classList.remove("resizing");
      splitter.classList.remove("dragging");
      const containerWidth = container.getBoundingClientRect().width;
      const chatWidth = chatPane.getBoundingClientRect().width;
      if (containerWidth > 0) {
        const pct = (chatWidth / containerWidth * 100).toFixed(1);
        localStorage.setItem(STORAGE_KEY, pct);
      }
    });
  }
  var initMainSplitter = initChatSplitter;

  // src/webview/panel/features/tabs.ts
  function createTabHandlers(deps) {
    const {
      TABS: TABS2,
      PERSONA_MAP: PERSONA_MAP2,
      setCurrentTab,
      setCurrentMode,
      setCurrentPersona,
      getPersonaManualOverride,
      getDashboardSubtab,
      restoreRightPanelModeForTab: restoreRightPanelModeForTab2,
      updateChatModeSwitcherVisibility: updateChatModeSwitcherVisibility2,
      ensureAgentsInitialized: ensureAgentsInitialized2,
      requestWorkflows: requestWorkflows2,
      vscode: vscode2
    } = deps;
    function initTabButtons2() {
      document.querySelectorAll(".mode-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const clickedTab = btn.dataset.tab || btn.dataset.mode;
          if (!btn.onclick) {
            switchTab2(clickedTab);
          }
        });
      });
    }
    function switchTab2(tabName) {
      console.log("[SpaceCode UI] switchTab called with:", tabName);
      const agentsSection = document.getElementById("agentsSection");
      const ticketsSection = document.getElementById("ticketsSection");
      const skillsSection = document.getElementById("skillsSection");
      const dashboardSection = document.getElementById("dashboardSection");
      const stationSection = document.getElementById("stationSection");
      if (agentsSection)
        agentsSection.style.display = "none";
      if (ticketsSection)
        ticketsSection.style.display = "none";
      if (skillsSection)
        skillsSection.style.display = "none";
      if (dashboardSection)
        dashboardSection.style.display = "none";
      if (stationSection)
        stationSection.classList.remove("active");
      document.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("active"));
      const activeBtn = document.querySelector(`.mode-btn[data-tab="${tabName}"]`);
      if (activeBtn)
        activeBtn.classList.add("active");
      setCurrentTab(tabName);
      setCurrentMode(tabName);
      if (!getPersonaManualOverride()) {
        const personaKey = tabName === "dashboard" ? `dashboard:${getDashboardSubtab()}` : tabName;
        const persona = PERSONA_MAP2 && PERSONA_MAP2[personaKey] || PERSONA_MAP2[tabName] || "lead-engineer";
        setCurrentPersona(persona);
      }
      switch (tabName) {
        case TABS2.STATION:
          if (stationSection)
            stationSection.classList.add("active");
          restoreRightPanelModeForTab2(TABS2.STATION);
          break;
        case TABS2.AGENTS:
          if (agentsSection)
            agentsSection.style.display = "flex";
          ensureAgentsInitialized2();
          requestWorkflows2();
          break;
        case TABS2.SKILLS:
          if (skillsSection) {
            skillsSection.style.display = "flex";
          }
          vscode2.postMessage({ type: "getSkills" });
          break;
        case TABS2.DASHBOARD:
          if (dashboardSection)
            dashboardSection.style.display = "flex";
          vscode2.postMessage({ type: "getDashboardMetrics" });
          vscode2.postMessage({ type: "getTickets" });
          vscode2.postMessage({ type: "getRecentActivity" });
          break;
      }
    }
    return {
      initTabButtons: initTabButtons2,
      switchTab: switchTab2
    };
  }

  // src/webview/panel/features/tokenBar.ts
  function createTokenBarHandlers(deps) {
    const {
      vscode: vscode2,
      currentSettings: currentSettings2,
      getContextLimit: getContextLimit2,
      getChatSessions,
      getCurrentChatId
    } = deps;
    const CHARS_PER_TOKEN = 4;
    let pricingMap = {};
    function estimateTokens(text) {
      return Math.ceil((text || "").length / CHARS_PER_TOKEN);
    }
    function estimateHistoryTokens(history) {
      let total = 0;
      for (const msg2 of history || []) {
        total += estimateTokens(msg2.content || "");
      }
      return total;
    }
    function estimateHistoryTokenBreakdown(history) {
      let input = 0;
      let output = 0;
      for (const msg2 of history || []) {
        const tokens = estimateTokens(msg2.content || "");
        if (msg2.role === "assistant") {
          output += tokens;
        } else {
          input += tokens;
        }
      }
      return { input, output };
    }
    function mergePricing2(newPricing) {
      if (!newPricing)
        return;
      pricingMap = { ...pricingMap, ...newPricing };
    }
    function getCostDisplay(session) {
      const provider = session.mode === "gpt" ? "gpt" : "claude";
      const model = provider === "gpt" ? currentSettings2.gptModel : currentSettings2.claudeModel;
      const method = provider === "gpt" ? currentSettings2.gptConnectionMethod : currentSettings2.claudeConnectionMethod;
      const tokens = estimateHistoryTokenBreakdown(session.messageHistory);
      const pricing = pricingMap[model];
      if (!pricing) {
        return { text: "cost N/A", className: "token-bar-cost", provider };
      }
      const inputCost = tokens.input / 1e6 * pricing.input;
      const outputCost = tokens.output / 1e6 * pricing.output;
      const cost = inputCost + outputCost;
      const formatted = "$" + cost.toFixed(4);
      if (method === "cli") {
        return { text: "saved " + formatted, className: "token-bar-cost saved", provider };
      }
      return { text: formatted, className: "token-bar-cost", provider };
    }
    function openPricing2(provider) {
      vscode2.postMessage({ type: "openPricing", provider });
    }
    function updateTokenBar2(chatId = getCurrentChatId()) {
      const chatSessions2 = getChatSessions();
      const session = chatSessions2[chatId];
      if (!session)
        return;
      const tokensUsed = estimateHistoryTokens(session.messageHistory);
      session.tokensUsed = tokensUsed;
      const contextLimit = getContextLimit2(session.mode);
      const percentage = Math.min(tokensUsed / contextLimit * 100, 100);
      const container = document.getElementById("tokenBarContainer");
      const fill = document.getElementById("tokenBarFill");
      const label = document.getElementById("tokenBarLabel");
      if (chatId !== getCurrentChatId()) {
        return;
      }
      if (fill) {
        fill.style.width = Math.max(percentage, 2) + "%";
      }
      if (container) {
        container.title = "Context usage: " + Math.round(percentage) + "% (" + tokensUsed.toLocaleString() + " / " + contextLimit.toLocaleString() + ")";
        container.dataset.warning = percentage >= 70 ? "true" : "false";
        container.dataset.critical = percentage >= 90 ? "true" : "false";
      }
      if (label) {
        const limitK = Math.round(contextLimit / 1e3);
        const usedK = tokensUsed >= 1e3 ? Math.round(tokensUsed / 1e3) + "K" : tokensUsed;
        const costDisplay = getCostDisplay(session);
        const pricingLink = costDisplay && costDisplay.provider ? ` <a href="#" class="token-bar-link" onclick="openPricing('` + costDisplay.provider + `')">pricing</a>` : "";
        label.innerHTML = usedK + " / " + limitK + "K tokens" + (costDisplay ? ' <span class="' + costDisplay.className + '">' + costDisplay.text + "</span>" : "") + pricingLink;
      }
    }
    return {
      mergePricing: mergePricing2,
      openPricing: openPricing2,
      updateTokenBar: updateTokenBar2
    };
  }

  // src/webview/panel/features/unityPanel.ts
  function createUnityPanelHandlers(deps) {
    const { vscode: vscode2, shipSetStatus: shipSetStatus2, escapeHtml: escapeHtml2 } = deps;
    let unityConnected = false;
    let unityConsoleFilters = { error: true, warn: true, log: true };
    let unityConsoleMessages = [];
    let unityCommandLoading = false;
    let unityStatusToken = 0;
    let unityStatusDebounceTimer = null;
    let unityLastStatusUpdate = 0;
    let unityStatusCheckInFlight = false;
    const unityCommands = {
      status: "Check Unity MCP connection status and tell me the project name and current scene.",
      reload: "Reload Unity assets and apply any code changes. Use the execute_script tool to call AssetDatabase.Refresh().",
      play: "Start playing the game in Unity Editor.",
      stop: "Stop playing the game in Unity Editor.",
      logs: "Get the last 20 Unity console logs (errors and warnings).",
      errors: "Check if there are any compile errors in the Unity project."
    };
    const unityCommandLabels = {
      status: "Checking connection",
      reload: "Reloading assets",
      play: "Starting play mode",
      stop: "Stopping play mode",
      logs: "Fetching logs",
      errors: "Checking errors"
    };
    function unityCheckConnection2(fromButton = false) {
      if (unityStatusCheckInFlight) {
        console.log("[SpaceCode UI] Status check already in flight, skipping");
        if (fromButton) {
          shipSetStatus2("Status check already in progress...");
        }
        return;
      }
      if (unityStatusDebounceTimer) {
        clearTimeout(unityStatusDebounceTimer);
      }
      const debounceMs = fromButton ? 0 : 300;
      unityStatusDebounceTimer = setTimeout(() => {
        if (unityStatusCheckInFlight) {
          console.log("[SpaceCode UI] Status check already in flight after debounce, skipping");
          return;
        }
        unityStatusCheckInFlight = true;
        unityStatusToken++;
        const token = unityStatusToken;
        console.log("[SpaceCode UI] Starting status check, token:", token);
        const statusEl = document.getElementById("unityStatus");
        if (statusEl) {
          statusEl.className = "unity-status checking";
          statusEl.textContent = "\u25CF Checking...";
        }
        setUnityButtonsLoading2(true);
        shipSetStatus2("\u23F3 Checking Unity connection... (request sent)");
        vscode2.postMessage({ type: "unityCheckConnection", token });
        setTimeout(() => {
          if (unityStatusCheckInFlight && unityStatusToken === token) {
            console.log("[SpaceCode UI] Status check timed out, clearing in-flight flag");
            unityStatusCheckInFlight = false;
            setUnityButtonsLoading2(false);
          }
        }, 15e3);
      }, debounceMs);
    }
    function setUnityButtonsLoading2(loading) {
      unityCommandLoading = loading;
      const buttons = document.querySelectorAll(".unity-cmd-btn");
      buttons.forEach((btn) => {
        btn.disabled = loading;
        btn.style.opacity = loading ? "0.5" : "1";
        btn.style.cursor = loading ? "wait" : "pointer";
      });
    }
    function unitySendCommand2(cmd) {
      const message = unityCommands[cmd];
      if (!message)
        return;
      if (cmd === "status") {
        unityCheckConnection2(true);
        return;
      }
      if (unityCommandLoading) {
        shipSetStatus2("Please wait, command in progress...");
        return;
      }
      setUnityButtonsLoading2(true);
      const label = unityCommandLabels[cmd] || cmd;
      const statusEl = document.getElementById("unityStatus");
      if (statusEl) {
        statusEl.className = "unity-status checking";
        statusEl.textContent = "\u25CF " + label + "...";
      }
      shipSetStatus2("\u23F3 " + label + "... (request sent)");
      vscode2.postMessage({
        type: "unityCommand",
        command: cmd,
        message
      });
      setTimeout(() => {
        if (unityCommandLoading) {
          setUnityButtonsLoading2(false);
          const statusEl2 = document.getElementById("unityStatus");
          if (statusEl2 && statusEl2.textContent === "\u25CF Loading...") {
            statusEl2.className = "unity-status disconnected";
            statusEl2.textContent = "\u25CF Timeout";
          }
          shipSetStatus2("Command timed out");
        }
      }, 3e4);
    }
    function unityRefresh2() {
      unitySendCommand2("reload");
    }
    function unityHeaderClick2() {
      if (unityConnected) {
        unitySendCommand2("reload");
      } else {
        unitySendCommand2("status");
      }
    }
    function updateUnityMCPStatus2(connected) {
      console.log("[SpaceCode UI] updateUnityMCPStatus called with:", connected);
      unityConnected = connected;
      const statusEl = document.getElementById("unity-status");
      if (!statusEl) {
        console.error("[SpaceCode UI] unity-status element not found");
        return;
      }
      const dotEl = statusEl.querySelector(".status-dot");
      if (!dotEl) {
        console.error("[SpaceCode UI] status-dot element not found");
        return;
      }
      if (connected) {
        dotEl.className = "status-dot connected";
        statusEl.title = "Unity: Connected - Click to reload assets";
      } else if (connected === false) {
        dotEl.className = "status-dot disconnected";
        statusEl.title = "Unity: Disconnected - Click to check status";
      } else {
        dotEl.className = "status-dot checking";
        statusEl.title = "Unity: Click to check status";
      }
      console.log("[SpaceCode UI] Updated unity-status dot to:", dotEl.className);
    }
    function updateUnityPanelInfo2(info) {
      if (info.project) {
        const el = document.getElementById("unityProjectName");
        if (el)
          el.textContent = info.project;
      }
      if (info.scene) {
        const el = document.getElementById("unitySceneName");
        if (el)
          el.textContent = info.scene;
      }
      const lastCheck = document.getElementById("unityLastCheck");
      if (lastCheck) {
        lastCheck.textContent = (/* @__PURE__ */ new Date()).toLocaleTimeString();
      }
      if (info.connected !== void 0) {
        unityConnected = info.connected;
        const statusEl = document.getElementById("unityStatus");
        if (statusEl) {
          if (info.connected) {
            statusEl.className = "unity-status connected";
            statusEl.textContent = "\u25CF Connected";
          } else {
            statusEl.className = "unity-status disconnected";
            statusEl.textContent = "\u25CF Disconnected";
          }
        }
        updateUnityMCPStatus2(info.connected);
      }
    }
    function toggleConsoleFilter2(filter) {
      unityConsoleFilters[filter] = !unityConsoleFilters[filter];
      const btn = document.querySelector('.console-filter[data-filter="' + filter + '"]');
      if (btn)
        btn.classList.toggle("active", unityConsoleFilters[filter]);
      renderUnityConsole();
    }
    function renderUnityConsole() {
      const log = document.getElementById("unityConsoleLog");
      if (!log)
        return;
      const filtered = unityConsoleMessages.filter((m) => {
        if (m.type === "Error" && unityConsoleFilters.error)
          return true;
        if (m.type === "Warning" && unityConsoleFilters.warn)
          return true;
        if (m.type === "Log" && unityConsoleFilters.log)
          return true;
        return false;
      });
      if (filtered.length === 0) {
        log.textContent = "(no messages matching filters)";
        return;
      }
      log.innerHTML = filtered.slice(-30).map((m) => {
        const icon = m.type === "Error" ? "\u{1F534}" : m.type === "Warning" ? "\u{1F7E1}" : "\u26AA";
        return '<div style="margin-bottom:2px;">' + icon + " " + escapeHtml2(m.message.substring(0, 200)) + "</div>";
      }).join("");
      log.scrollTop = log.scrollHeight;
    }
    function updateUnityStatus2(status, token) {
      const now = Date.now();
      const statusEl = document.getElementById("unityStatus");
      const sceneInfo = document.getElementById("unitySceneInfo");
      unityStatusCheckInFlight = false;
      console.log("[SpaceCode UI] Status update received, token:", token, "connected:", status.connected);
      if (token !== void 0 && token < unityStatusToken) {
        console.log("[SpaceCode UI] Ignoring stale status update, token:", token, "current:", unityStatusToken);
        return;
      }
      if (!status.connected && unityConnected && now - unityLastStatusUpdate < 2e3) {
        console.log("[SpaceCode UI] Ignoring disconnected status within 2s of connected");
        return;
      }
      unityLastStatusUpdate = now;
      unityConnected = status.connected;
      if (!status.connected) {
        if (statusEl) {
          statusEl.className = "unity-status disconnected";
          statusEl.textContent = "\u25CF Disconnected";
        }
        if (sceneInfo)
          sceneInfo.textContent = "Scene: (not connected)";
        return;
      }
      if (statusEl) {
        if (status.isPlaying) {
          statusEl.className = "unity-status playing";
          statusEl.textContent = "\u25CF Playing";
        } else if (status.isCompiling) {
          statusEl.className = "unity-status connected";
          statusEl.textContent = "\u25CF Compiling...";
        } else {
          statusEl.className = "unity-status connected";
          statusEl.textContent = "\u25CF Connected";
        }
      }
      if (sceneInfo) {
        sceneInfo.textContent = "Scene: " + (status.sceneName || "(unknown)");
      }
    }
    function updateUnityConsole2(messages) {
      unityConsoleMessages = messages || [];
      renderUnityConsole();
    }
    function clearUnityConsole2() {
      unityConsoleMessages = [];
      const log = document.getElementById("unityConsoleLog");
      if (log) {
        log.textContent = "(console cleared)";
      }
      shipSetStatus2("Console cleared");
    }
    return {
      unityCheckConnection: unityCheckConnection2,
      unitySendCommand: unitySendCommand2,
      unityRefresh: unityRefresh2,
      unityHeaderClick: unityHeaderClick2,
      updateUnityMCPStatus: updateUnityMCPStatus2,
      updateUnityPanelInfo: updateUnityPanelInfo2,
      toggleConsoleFilter: toggleConsoleFilter2,
      updateUnityStatus: updateUnityStatus2,
      updateUnityConsole: updateUnityConsole2,
      clearUnityConsole: clearUnityConsole2,
      setUnityButtonsLoading: setUnityButtonsLoading2,
      getUnityConnected: () => unityConnected,
      setUnityConnected: (value) => {
        unityConnected = value;
      }
    };
  }

  // src/webview/panel/features/verificationPanel.ts
  function createVerificationPanelHandlers(deps) {
    const { vscode: vscode2, shipSetStatus: shipSetStatus2, escapeHtml: escapeHtml2 } = deps;
    let lastDiffResult = null;
    let lastPlanComparison = null;
    let lastAIReview = null;
    let planExecutionState = {
      planId: null,
      totalSteps: 0,
      completedSteps: 0,
      failedSteps: 0
    };
    let planExecutionLogLines = [];
    let pendingPlanStep = null;
    let testRunning = false;
    function scanDiff2() {
      vscode2.postMessage({ type: "scanDiff" });
      shipSetStatus2("Scanning git diff...");
      document.getElementById("verificationEmpty").style.display = "none";
    }
    function runTests2() {
      if (testRunning) {
        shipSetStatus2("Tests already running...");
        return;
      }
      testRunning = true;
      const btn = document.getElementById("runTestsBtn");
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Running...";
      }
      const resultPanel = document.getElementById("testResult");
      const statusEl = document.getElementById("testResultStatus");
      const contentEl = document.getElementById("testResultContent");
      if (resultPanel)
        resultPanel.style.display = "block";
      if (statusEl) {
        statusEl.textContent = "running";
        statusEl.style.color = "#f59e0b";
      }
      if (contentEl)
        contentEl.textContent = "Running tests...";
      document.getElementById("verificationEmpty").style.display = "none";
      vscode2.postMessage({ type: "runTests" });
      shipSetStatus2("Running regression tests...");
    }
    function updateTestResult2(result) {
      testRunning = false;
      const btn = document.getElementById("runTestsBtn");
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Run Tests";
      }
      const resultPanel = document.getElementById("testResult");
      const statusEl = document.getElementById("testResultStatus");
      const contentEl = document.getElementById("testResultContent");
      if (resultPanel)
        resultPanel.style.display = "block";
      if (result.success) {
        if (statusEl) {
          statusEl.textContent = "pass";
          statusEl.style.color = "#22c55e";
        }
        shipSetStatus2("Tests passed.");
      } else {
        if (statusEl) {
          statusEl.textContent = "fail";
          statusEl.style.color = "#ef4444";
        }
        shipSetStatus2("Tests failed.");
      }
      if (contentEl) {
        const output = result.output || "(no output)";
        contentEl.textContent = output.length > 2e3 ? output.substring(0, 2e3) + "\n...truncated" : output;
      }
    }
    function updateDiffSummary2(diff) {
      lastDiffResult = diff;
      const summary = document.getElementById("diffSummary");
      const stats = document.getElementById("diffStats");
      const fileList = document.getElementById("diffFileList");
      const aiBtn = document.getElementById("aiReviewBtn");
      const empty = document.getElementById("verificationEmpty");
      if (!diff || !diff.files || diff.files.length === 0) {
        summary.style.display = "none";
        empty.style.display = "block";
        empty.textContent = "No changes detected. Working directory is clean.";
        if (aiBtn)
          aiBtn.disabled = true;
        return;
      }
      summary.style.display = "block";
      empty.style.display = "none";
      if (aiBtn)
        aiBtn.disabled = false;
      const added = diff.files.filter((f) => f.status === "added").length;
      const modified = diff.files.filter((f) => f.status === "modified").length;
      const deleted = diff.files.filter((f) => f.status === "deleted").length;
      stats.textContent = "+" + added + " ~" + modified + " -" + deleted + " files";
      fileList.innerHTML = diff.files.map((f) => {
        const statusClass = f.status === "added" ? "added" : f.status === "deleted" ? "deleted" : "modified";
        const statusText = f.status === "added" ? "A" : f.status === "deleted" ? "D" : "M";
        return '<div class="diff-file"><span class="status ' + statusClass + '">' + statusText + "</span><span>" + escapeHtml2(f.path) + "</span></div>";
      }).join("");
      if (diff.files.length > 0) {
        vscode2.postMessage({ type: "comparePlan", diffFiles: diff.files.map((f) => f.path) });
      }
    }
    function updatePlanComparison2(result) {
      lastPlanComparison = result;
      const panel = document.getElementById("planComparison");
      const content = document.getElementById("planComparisonResult");
      if (!result || !result.unexpected.length && !result.missing.length && !result.matched.length) {
        panel.style.display = "none";
        return;
      }
      panel.style.display = "block";
      let html = "";
      if (result.matched.length > 0) {
        html += '<div style="color:#22c55e; margin-bottom:4px;">\u2713 Matched (' + result.matched.length + ")</div>";
        result.matched.slice(0, 3).forEach((f) => {
          html += '<div class="plan-match"><span class="icon">\u2713</span><span style="color:#22c55e;">' + escapeHtml2(f) + "</span></div>";
        });
        if (result.matched.length > 3) {
          html += '<div style="color:var(--text-secondary); font-size:9px;">...and ' + (result.matched.length - 3) + " more</div>";
        }
      }
      if (result.unexpected.length > 0) {
        html += '<div style="color:#fbbf24; margin-top:6px; margin-bottom:4px;">\u26A0 Unexpected (' + result.unexpected.length + ")</div>";
        result.unexpected.forEach((f) => {
          html += '<div class="plan-match"><span class="icon">\u26A0</span><span style="color:#fbbf24;">' + escapeHtml2(f) + "</span></div>";
        });
      }
      if (result.missing.length > 0) {
        html += '<div style="color:#ef4444; margin-top:6px; margin-bottom:4px;">\u2717 Missing (' + result.missing.length + ")</div>";
        result.missing.forEach((f) => {
          html += '<div class="plan-match"><span class="icon">\u2717</span><span style="color:#ef4444;">' + escapeHtml2(f) + "</span></div>";
        });
      }
      content.innerHTML = html;
    }
    function showPlanExecutionPanel2(show) {
      const panel = document.getElementById("planExecutionPanel");
      if (panel) {
        panel.style.display = show ? "block" : "none";
      }
    }
    function setPlanExecutionStatus2(text, isError) {
      const status = document.getElementById("planExecutionStatus");
      if (status) {
        status.textContent = text || "";
        status.style.color = isError ? "var(--error-text)" : "var(--text-secondary)";
      }
    }
    function setPlanExecutionProgress2(text) {
      const progress = document.getElementById("planExecutionProgress");
      if (progress) {
        progress.textContent = text || "";
      }
    }
    function clearPlanExecutionLog2() {
      planExecutionLogLines = [];
      const log = document.getElementById("planExecutionLog");
      if (log) {
        log.textContent = "";
      }
    }
    function appendPlanExecutionLog2(line) {
      if (!line)
        return;
      const safeLine = String(line).trim();
      if (!safeLine)
        return;
      planExecutionLogLines.push(safeLine);
      if (planExecutionLogLines.length > 200) {
        planExecutionLogLines = planExecutionLogLines.slice(-200);
      }
      const log = document.getElementById("planExecutionLog");
      if (log) {
        log.textContent = planExecutionLogLines.join("\n");
      }
    }
    function showPlanStepGate3(payload) {
      pendingPlanStep = payload || null;
      const gate = document.getElementById("planStepGate");
      const details = document.getElementById("planStepGateDetails");
      if (details && payload) {
        const phaseLabel = payload.phaseTitle ? payload.phaseTitle : "Phase " + ((payload.phaseIndex || 0) + 1);
        const stepLabel = payload.stepDescription || payload.stepId || "Step";
        details.textContent = phaseLabel + " \u2022 " + stepLabel;
      }
      if (gate)
        gate.style.display = payload ? "block" : "none";
    }
    function hidePlanStepGate2() {
      pendingPlanStep = null;
      const gate = document.getElementById("planStepGate");
      if (gate)
        gate.style.display = "none";
    }
    function approvePlanStep2() {
      if (!pendingPlanStep)
        return;
      vscode2.postMessage({ type: "planStepApprove", planId: pendingPlanStep.planId, stepId: pendingPlanStep.stepId });
      hidePlanStepGate2();
    }
    function abortPlanStep2() {
      if (!pendingPlanStep)
        return;
      vscode2.postMessage({ type: "planStepAbort", planId: pendingPlanStep.planId, stepId: pendingPlanStep.stepId });
      hidePlanStepGate2();
    }
    function runAIReview2() {
      if (!lastDiffResult || !lastDiffResult.diff) {
        shipSetStatus2("No diff available for AI review.");
        return;
      }
      vscode2.postMessage({ type: "runAIReview", diff: lastDiffResult.diff });
      shipSetStatus2("Running AI review...");
      const status = document.getElementById("aiReviewStatus");
      if (status) {
        status.innerHTML = '<span class="ai-review-status-badge running">Analyzing...</span>';
      }
      document.getElementById("aiReviewResult").style.display = "block";
      document.getElementById("aiReviewContent").innerHTML = '<div style="color:var(--text-secondary); text-align:center; padding:12px;">AI is reviewing your changes...</div>';
    }
    function updateAIReview2(result) {
      lastAIReview = result;
      const panel = document.getElementById("aiReviewResult");
      const content = document.getElementById("aiReviewContent");
      const status = document.getElementById("aiReviewStatus");
      panel.style.display = "block";
      if (!result || result.error) {
        status.innerHTML = '<span class="ai-review-status-badge issues">Error</span>';
        content.innerHTML = '<div style="color:#ef4444; padding:8px;">' + escapeHtml2(result?.error || "Unknown error") + "</div>";
        shipSetStatus2("AI review failed.");
        return;
      }
      const issues = result.issues || [];
      const errors = issues.filter((i) => i.severity === "error").length;
      const warnings = issues.filter((i) => i.severity === "warning").length;
      const infos = issues.filter((i) => i.severity === "info").length;
      const total = issues.length;
      if (total === 0) {
        status.innerHTML = '<span class="ai-review-status-badge clean">Clean</span>';
        shipSetStatus2("AI review complete - no issues found.");
      } else if (errors > 0) {
        status.innerHTML = '<span class="ai-review-status-badge issues">' + total + " issue" + (total !== 1 ? "s" : "") + "</span>";
        shipSetStatus2("AI review found " + errors + " error" + (errors !== 1 ? "s" : "") + ".");
      } else {
        status.innerHTML = '<span class="ai-review-status-badge warning-only">' + total + " issue" + (total !== 1 ? "s" : "") + "</span>";
        shipSetStatus2("AI review found " + warnings + " warning" + (warnings !== 1 ? "s" : "") + ".");
      }
      let html = "";
      if (total > 0) {
        html += '<div class="ai-review-summary">';
        if (errors > 0) {
          html += '<span class="ai-review-count errors">X ' + errors + " error" + (errors !== 1 ? "s" : "") + "</span>";
        }
        if (warnings > 0) {
          html += '<span class="ai-review-count warnings">! ' + warnings + " warning" + (warnings !== 1 ? "s" : "") + "</span>";
        }
        if (infos > 0) {
          html += '<span class="ai-review-count infos">i ' + infos + " info</span>";
        }
        html += "</div>";
      } else {
        html += '<div class="ai-review-summary"><span class="ai-review-count clean">No issues found - code looks good!</span></div>';
      }
      issues.forEach((issue) => {
        const sev = issue.severity || "info";
        const severityClass = sev === "error" ? "error" : sev === "warning" ? "warning" : "info";
        const icon = sev === "error" ? "X" : sev === "warning" ? "!" : "i";
        html += '<div class="ai-issue ' + severityClass + '">';
        html += '<div class="ai-issue-title"><span class="ai-issue-icon">' + icon + "</span>" + escapeHtml2(issue.title || "Issue") + "</div>";
        if (issue.file) {
          html += '<div class="ai-issue-location">' + escapeHtml2(issue.file) + (issue.line ? ":" + issue.line : "") + "</div>";
        }
        if (issue.description) {
          html += '<div class="ai-issue-desc">' + escapeHtml2(issue.description) + "</div>";
        }
        html += "</div>";
      });
      if (result.summary) {
        html += '<div style="margin-top:8px; padding-top:8px; border-top:1px solid var(--border-color); color:var(--text-secondary); font-size:10px;">' + escapeHtml2(result.summary) + "</div>";
      }
      content.innerHTML = html;
    }
    function setPlanExecutionButtonsEnabled2(enabled) {
      const executeBtn = document.getElementById("executePlanBtn");
      const stepBtn = document.getElementById("executePlanStepBtn");
      if (executeBtn)
        executeBtn.disabled = !enabled;
      if (stepBtn)
        stepBtn.disabled = !enabled;
    }
    return {
      scanDiff: scanDiff2,
      runTests: runTests2,
      updateTestResult: updateTestResult2,
      updateDiffSummary: updateDiffSummary2,
      updatePlanComparison: updatePlanComparison2,
      showPlanExecutionPanel: showPlanExecutionPanel2,
      setPlanExecutionStatus: setPlanExecutionStatus2,
      setPlanExecutionProgress: setPlanExecutionProgress2,
      clearPlanExecutionLog: clearPlanExecutionLog2,
      appendPlanExecutionLog: appendPlanExecutionLog2,
      showPlanStepGate: showPlanStepGate3,
      hidePlanStepGate: hidePlanStepGate2,
      approvePlanStep: approvePlanStep2,
      abortPlanStep: abortPlanStep2,
      runAIReview: runAIReview2,
      updateAIReview: updateAIReview2,
      setPlanExecutionButtonsEnabled: setPlanExecutionButtonsEnabled2,
      getPlanExecutionState: () => planExecutionState,
      setPlanExecutionState: (value) => {
        planExecutionState = value;
      }
    };
  }

  // src/webview/panel/features/voice.ts
  function createVoicePanelHandlers(deps) {
    const { vscode: vscode2 } = deps;
    function loadVoiceSettings2(settings) {
      if (!settings)
        return;
      const modelSelect = document.getElementById("whisperModelSelect");
      if (modelSelect && settings.whisperModel)
        modelSelect.value = settings.whisperModel;
      if (settings.whisperInstalled) {
        const el = document.getElementById("whisperStatus");
        const ind = document.getElementById("whisperStatusIndicator");
        const btn = document.getElementById("whisperDownloadBtn");
        if (el)
          el.textContent = "Installed";
        if (ind)
          ind.style.background = "#4ade80";
        if (btn) {
          btn.textContent = "\u2713 Installed";
          btn.disabled = true;
        }
      }
      if (settings.whisperBinaryInstalled) {
        const el = document.getElementById("whisperBinaryStatus");
        const ind = document.getElementById("whisperBinaryStatusIndicator");
        const btn = document.getElementById("whisperBinaryDownloadBtn");
        if (el)
          el.textContent = "Installed";
        if (ind)
          ind.style.background = "#4ade80";
        if (btn) {
          btn.textContent = "\u2713 Installed";
          btn.disabled = true;
        }
      }
    }
    function downloadWhisperModel2() {
      const modelSelect = document.getElementById("whisperModelSelect");
      vscode2.postMessage({ type: "downloadVoiceModel", engine: "whisper", model: modelSelect ? modelSelect.value : "small" });
      const btn = document.getElementById("whisperDownloadBtn");
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Downloading...";
      }
    }
    function downloadWhisperBinary2() {
      vscode2.postMessage({ type: "downloadWhisperBinary" });
      const btn = document.getElementById("whisperBinaryDownloadBtn");
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Downloading...";
      }
    }
    function saveVoiceSettings2() {
      const modelSelect = document.getElementById("whisperModelSelect");
      vscode2.postMessage({ type: "saveVoiceSettings", settings: { whisperModel: modelSelect ? modelSelect.value : "small" } });
    }
    function testMicrophone2() {
      vscode2.postMessage({ type: "startMicTest" });
      const result = document.getElementById("voiceTestResult");
      if (result) {
        result.style.display = "block";
        result.textContent = "Testing microphone...";
      }
    }
    function testSpeaker2() {
      vscode2.postMessage({ type: "testSpeaker" });
      const result = document.getElementById("voiceTestResult");
      if (result) {
        result.style.display = "block";
        result.textContent = "Playing test sound...";
      }
    }
    function updateVoiceDownloadProgress2(engine, progress, status) {
      const statusEl = document.querySelector("#" + engine + "Option .voice-status-text");
      const indicator = document.querySelector("#" + engine + "Option .voice-status-indicator");
      const btn = document.querySelector("#" + engine + "DownloadBtn");
      if (statusEl)
        statusEl.textContent = status;
      if (indicator) {
        if (progress > 0 && progress < 100) {
          indicator.className = "voice-status-indicator downloading";
        } else if (status === "Installed" || progress === 100) {
          indicator.className = "voice-status-indicator installed";
        } else {
          indicator.className = "voice-status-indicator";
        }
      }
      if (btn) {
        if (progress > 0 && progress < 100) {
          btn.disabled = true;
          btn.textContent = progress + "%";
        } else if (status === "Installed") {
          btn.disabled = true;
          btn.textContent = "\u2713 Installed";
        } else if (status.startsWith("Error")) {
          btn.disabled = false;
          btn.textContent = "Retry Download";
        } else {
          btn.disabled = false;
          btn.textContent = "Download " + engine.charAt(0).toUpperCase() + engine.slice(1);
        }
      }
    }
    function handleMicTestStatus2(status, message) {
      const btn = document.getElementById("micTestBtn");
      const resultEl = document.getElementById("voiceTestResult");
      if (btn) {
        if (status === "recording") {
          btn.classList.add("recording");
          btn.innerHTML = "\u{1F534} Recording...";
        } else {
          btn.classList.remove("recording");
          btn.innerHTML = "\u{1F3A4} Test Microphone";
        }
      }
      if (resultEl && message) {
        resultEl.textContent = message;
        resultEl.style.display = "block";
      }
    }
    function handleSpeakerTestStatus2(status, message) {
      const resultEl = document.getElementById("voiceTestResult");
      if (resultEl && message) {
        resultEl.textContent = message;
        resultEl.style.display = "block";
      }
    }
    return {
      loadVoiceSettings: loadVoiceSettings2,
      downloadWhisperModel: downloadWhisperModel2,
      downloadWhisperBinary: downloadWhisperBinary2,
      saveVoiceSettings: saveVoiceSettings2,
      testMicrophone: testMicrophone2,
      testSpeaker: testSpeaker2,
      updateVoiceDownloadProgress: updateVoiceDownloadProgress2,
      handleMicTestStatus: handleMicTestStatus2,
      handleSpeakerTestStatus: handleSpeakerTestStatus2
    };
  }

  // src/webview/panel/utils/dom.ts
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text || "";
    return div.innerHTML;
  }

  // src/webview/panel/utils/status.ts
  function shipSetStatus(text) {
    const el = document.getElementById("shipStatusText");
    if (el)
      el.textContent = text;
  }

  // src/webview/panel/utils/context.ts
  var CONTEXT_LIMITS = {
    claude: 2e5,
    gpt: 272e3,
    mastermind: 2e5
  };
  function getContextLimit(mode) {
    return CONTEXT_LIMITS[mode] || 2e5;
  }

  // src/webview/panel/utils/toast.ts
  function showToast(message, kind) {
    const container = document.getElementById("sc-toast-container");
    if (!container || !message)
      return;
    const toast = document.createElement("div");
    toast.className = "sc-toast " + (kind || "");
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  // src/webview/panel/features/flow.ts
  function createFlowPanelHandlers(deps) {
    const { d3: d32, escapeHtml: escapeHtml2 } = deps;
    let aiFlowState = {
      nodes: [],
      links: [],
      simulation: null,
      svg: null,
      g: null,
      // Main group for zoom/pan
      width: 0,
      height: 0,
      zoom: null
    };
    const THREAD_COLORS = {
      query: "#6cf",
      // Cyan - the question
      memory: "#ff6ccf",
      // Pink - past conversations
      kb: "#9c6cff",
      // Purple - knowledge base
      chat: "#6cff9c",
      // Green - recent chat
      sector: "#ffb34d",
      // Orange - rules/policy
      rules: "#ffb34d",
      // Alias for sector
      response: "#6cff9c",
      // Green - the answer crystal
      gpt: "#10b981",
      // Emerald - GPT consultation
      claude: "#6366f1",
      // Indigo - Claude responses
      skill: "#f59e0b",
      // Amber - loaded skills
      agent: "#ec4899"
      // Magenta - agent operations
    };
    const AI_FLOW_COLORS = THREAD_COLORS;
    const fateWebState = {
      phase: "idle",
      // idle | gathering | weaving | answering | complete
      query: { text: "", tokens: 0 },
      influences: /* @__PURE__ */ new Map(),
      // id -> influence node data
      threads: [],
      // thread connections
      answerTokens: 0,
      initialized: false
    };
    function initAiFlowVisualization() {
      initContextFlowVisualization2();
    }
    let _flowInitRetries = 0;
    function initContextFlowVisualization2(skipWaiting = false) {
      const canvas = document.getElementById("contextFlowCanvas");
      if (!canvas || typeof d32 === "undefined") {
        console.warn("Fate Web: canvas not found or D3 not loaded");
        return;
      }
      d32.select(canvas).selectAll("*").remove();
      let w = canvas.clientWidth;
      let h = canvas.clientHeight;
      if ((w === 0 || h === 0) && _flowInitRetries < 10) {
        _flowInitRetries++;
        console.log("[Fate Web] Canvas has 0 dimensions, retrying...", _flowInitRetries);
        setTimeout(() => initContextFlowVisualization2(skipWaiting), 200);
        return;
      }
      _flowInitRetries = 0;
      aiFlowState.width = w || 300;
      aiFlowState.height = h || 200;
      const svg = d32.select(canvas).append("svg").attr("width", "100%").attr("height", "100%").attr("viewBox", `0 0 ${aiFlowState.width} ${aiFlowState.height}`).attr("class", "fate-web-svg");
      aiFlowState.svg = svg;
      const defs = svg.append("defs");
      const knotGlow = defs.append("filter").attr("id", "knotGlow").attr("x", "-100%").attr("y", "-100%").attr("width", "300%").attr("height", "300%");
      knotGlow.append("feGaussianBlur").attr("stdDeviation", "4").attr("result", "blur");
      const knotMerge = knotGlow.append("feMerge");
      knotMerge.append("feMergeNode").attr("in", "blur");
      knotMerge.append("feMergeNode").attr("in", "SourceGraphic");
      const threadGlow = defs.append("filter").attr("id", "threadGlow").attr("x", "-100%").attr("y", "-100%").attr("width", "300%").attr("height", "300%");
      threadGlow.append("feGaussianBlur").attr("stdDeviation", "4").attr("result", "blur");
      threadGlow.append("feGaussianBlur").attr("in", "SourceGraphic").attr("stdDeviation", "1").attr("result", "blur2");
      const threadMerge = threadGlow.append("feMerge");
      threadMerge.append("feMergeNode").attr("in", "blur");
      threadMerge.append("feMergeNode").attr("in", "blur2");
      threadMerge.append("feMergeNode").attr("in", "SourceGraphic");
      aiFlowState.zoom = d32.zoom().scaleExtent([0.5, 2.5]).on("zoom", (event) => {
        aiFlowState.g.attr("transform", event.transform);
      });
      svg.call(aiFlowState.zoom);
      aiFlowState.g = svg.append("g");
      aiFlowState.g.append("g").attr("class", "threads-layer");
      aiFlowState.g.append("g").attr("class", "particles-layer");
      aiFlowState.g.append("g").attr("class", "influences-layer");
      aiFlowState.g.append("g").attr("class", "knot-layer");
      const cx = aiFlowState.width / 2;
      const cy = aiFlowState.height / 2;
      const knotGroup = aiFlowState.g.select(".knot-layer").append("g").attr("class", "fate-knot").attr("transform", `translate(${cx}, ${cy})`);
      knotGroup.append("circle").attr("class", "knot-glow-ring").attr("r", 35).attr("fill", "none").attr("stroke", THREAD_COLORS.query).attr("stroke-width", 2).attr("opacity", 0.3);
      knotGroup.append("circle").attr("class", "knot-core").attr("r", 20).attr("fill", "#0a1520").attr("stroke", THREAD_COLORS.query).attr("stroke-width", 2.5).attr("filter", "url(#knotGlow)");
      knotGroup.append("circle").attr("class", "knot-pulse").attr("r", 8).attr("fill", THREAD_COLORS.query).attr("opacity", 0.6);
      knotGroup.append("text").attr("class", "knot-label").attr("y", 45).attr("text-anchor", "middle").attr("fill", "#9fd").attr("font-size", "10").attr("font-family", "monospace").text(skipWaiting ? "" : "Waiting...");
      const answerGroup = aiFlowState.g.select(".knot-layer").append("g").attr("class", "answer-crystal").attr("transform", `translate(${cx}, ${cy + 70})`).style("opacity", 0);
      answerGroup.append("polygon").attr("class", "crystal-shape").attr("points", "0,-12 10,0 0,12 -10,0").attr("fill", "#0f1a25").attr("stroke", THREAD_COLORS.response).attr("stroke-width", 2);
      answerGroup.append("text").attr("class", "crystal-label").attr("y", 28).attr("text-anchor", "middle").attr("fill", THREAD_COLORS.response).attr("font-size", "9").attr("font-family", "monospace").text("");
      fateWebState.initialized = true;
      fateWebState.phase = skipWaiting ? "idle" : "idle";
      console.log("[Fate Web] Initialized");
    }
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
    function getSpawnPosition() {
      const w = aiFlowState.width || 300;
      const h = aiFlowState.height || 200;
      const side = Math.floor(Math.random() * 4);
      switch (side) {
        case 0:
          return { x: -50, y: Math.random() * h };
        case 1:
          return { x: w + 50, y: Math.random() * h };
        case 2:
          return { x: Math.random() * w, y: -50 };
        default:
          return { x: Math.random() * w, y: h + 50 };
      }
    }
    function getInfluencePosition(index, total) {
      const cx = aiFlowState.width / 2;
      const cy = aiFlowState.height / 2;
      const radius = Math.min(aiFlowState.width, aiFlowState.height) * 0.35;
      const angle = index / Math.max(6, total) * Math.PI * 2 - Math.PI / 2;
      return {
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius
      };
    }
    function setFateWebPhase(phase) {
      fateWebState.phase = phase;
      console.log("[Fate Web] Phase:", phase);
      if (!aiFlowState.g)
        return;
      const knot = aiFlowState.g.select(".fate-knot");
      knot.select(".knot-pulse").classed("pulsing", phase === "gathering" || phase === "weaving").classed("fast-pulse", phase === "answering");
      knot.select(".knot-core").classed("active", phase !== "idle");
      updateThreadAnimation(phase);
    }
    function startAiFlow2(query, queryTokens) {
      if (!aiFlowState.svg || !aiFlowState.g) {
        initContextFlowVisualization2(true);
        if (!aiFlowState.svg)
          return;
      }
      fateWebState.influences.clear();
      fateWebState.threads = [];
      fateWebState.answerTokens = 0;
      fateWebState.query = { text: query || "", tokens: queryTokens || 0 };
      flowAnimState.nodes = [];
      flowAnimState.links = [];
      flowAnimState.responseTokens = 0;
      flowAnimState.responseNodeAdded = false;
      aiFlowState.g.select(".threads-layer").selectAll("*").remove();
      aiFlowState.g.select(".particles-layer").selectAll("*").remove();
      aiFlowState.g.select(".influences-layer").selectAll("*").remove();
      aiFlowState.g.select(".answer-crystal").style("opacity", 0);
      const knotLabel = query ? query.length > 25 ? query.substring(0, 22) + "..." : query : "Query";
      aiFlowState.g.select(".knot-label").text(knotLabel);
      aiFlowState.g.select(".knot-core").transition().duration(200).attr("r", 25).transition().duration(300).attr("r", 20);
      setFateWebPhase("gathering");
      startThreadAnimation();
      startParticleSpawning();
      updateFlowStatsAnimated(queryTokens || 0, 0);
      console.log("[Fate Web] Started with query:", knotLabel);
    }
    function createThreadPath(source, target, strength) {
      const sx = source.x, sy = source.y;
      const tx = target.x, ty = target.y;
      const mx = (sx + tx) / 2, my = (sy + ty) / 2;
      const bend = (1 - strength) * 60 + 20;
      const nx = sy - ty, ny = tx - sx;
      const nlen = Math.max(1, Math.hypot(nx, ny));
      return `M${sx},${sy} Q${mx + nx / nlen * bend},${my + ny / nlen * bend} ${tx},${ty}`;
    }
    let threadAnimTimer = null;
    function startThreadAnimation() {
      if (threadAnimTimer)
        return;
      let offset = 0;
      threadAnimTimer = d32.interval(() => {
        offset = (offset + 5) % 200;
        if (aiFlowState.g) {
          aiFlowState.g.selectAll(".fate-thread").attr("stroke-dashoffset", -offset);
        }
      }, 16);
    }
    function stopThreadAnimation2() {
      if (threadAnimTimer) {
        threadAnimTimer.stop();
        threadAnimTimer = null;
      }
      if (typeof stopParticleSpawning2 === "function") {
        stopParticleSpawning2();
      }
    }
    function updateThreadAnimation(phase) {
    }
    function spawnThreadParticle(threadId, color) {
      if (!aiFlowState.g)
        return;
      const thread = aiFlowState.g.select(`[data-thread-id="${threadId}"]`);
      if (thread.empty())
        return;
      const pathNode = thread.node();
      if (!pathNode || !pathNode.getTotalLength)
        return;
      const length = pathNode.getTotalLength();
      const particle = aiFlowState.g.select(".particles-layer").append("circle").attr("class", "fate-particle").attr("r", 7).attr("fill", color).attr("opacity", 1).attr("filter", "url(#threadGlow)");
      particle.transition().duration(500 + Math.random() * 200).ease(d32.easeLinear).attrTween("transform", () => (t) => {
        const p = pathNode.getPointAtLength(t * length);
        return `translate(${p.x}, ${p.y})`;
      }).attr("r", 3).attr("opacity", 0).remove();
      setTimeout(() => {
        if (!aiFlowState.g)
          return;
        const trail = aiFlowState.g.select(".particles-layer").append("circle").attr("class", "fate-particle trail").attr("r", 5).attr("fill", color).attr("opacity", 0.5);
        trail.transition().duration(600).ease(d32.easeLinear).attrTween("transform", () => (t) => {
          const p = pathNode.getPointAtLength(t * length);
          return `translate(${p.x}, ${p.y})`;
        }).attr("opacity", 0).remove();
      }, 60);
    }
    function spawnFlowChunk2(chunk) {
      if (!aiFlowState.svg || !aiFlowState.g) {
        console.warn("[Fate Web] spawnFlowChunk: not initialized");
        return;
      }
      const chunkId = chunk.id || `${chunk.source || "chunk"}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      if (fateWebState.influences.has(chunkId))
        return;
      const cx = aiFlowState.width / 2;
      const cy = aiFlowState.height / 2;
      const index = fateWebState.influences.size;
      const targetPos = getInfluencePosition(index, index + 1);
      const spawnPos = getSpawnPosition();
      const influence = {
        id: chunkId,
        source: chunk.source,
        label: chunk.label || chunk.source,
        tokens: chunk.tokens || 0,
        strength: chunk.similarity || 0.7,
        x: spawnPos.x,
        y: spawnPos.y,
        tx: targetPos.x,
        ty: targetPos.y
      };
      fateWebState.influences.set(chunkId, influence);
      const color = THREAD_COLORS[chunk.source] || THREAD_COLORS.memory;
      const threadLayer = aiFlowState.g.select(".threads-layer");
      const thread = threadLayer.append("path").attr("class", `fate-thread thread-${chunk.source}`).attr("data-thread-id", chunkId).attr("d", createThreadPath(spawnPos, { x: cx, y: cy }, influence.strength)).attr("fill", "none").attr("stroke", color).attr("stroke-width", 1.5 + influence.strength).attr("stroke-dasharray", "8 10").attr("opacity", 0).attr("filter", "url(#threadGlow)");
      thread.transition().duration(300).attr("opacity", 0.7);
      const influenceLayer = aiFlowState.g.select(".influences-layer");
      const nodeRadius = 8 + Math.min(chunk.tokens || 50, 300) / 30;
      const influenceG = influenceLayer.append("g").attr("class", "fate-influence").attr("data-influence-id", chunkId).attr("transform", `translate(${spawnPos.x}, ${spawnPos.y})`).style("opacity", 0);
      influenceG.append("circle").attr("r", nodeRadius).attr("fill", color).attr("opacity", 0.85).attr("filter", "url(#threadGlow)");
      influenceG.append("text").attr("y", nodeRadius + 14).attr("text-anchor", "middle").attr("fill", "#9fd").attr("font-size", "9").attr("font-family", "monospace").text(chunk.label || chunk.source);
      influenceG.append("text").attr("y", nodeRadius + 24).attr("text-anchor", "middle").attr("fill", "#666").attr("font-size", "8").text(`${chunk.tokens || 0}t`);
      influenceG.transition().duration(200).style("opacity", 1).transition().duration(600).ease(d32.easeCubicOut).attr("transform", `translate(${targetPos.x}, ${targetPos.y})`).on("end", () => {
        influence.x = targetPos.x;
        influence.y = targetPos.y;
        thread.transition().duration(300).attr("d", createThreadPath(targetPos, { x: cx, y: cy }, influence.strength));
      });
      setTimeout(() => spawnThreadParticle(chunkId, color), 250);
      const totalTokens = Array.from(fateWebState.influences.values()).reduce((sum, inf) => sum + (inf.tokens || 0), 0) + (fateWebState.query.tokens || 0);
      updateFlowStatsAnimated(totalTokens, fateWebState.influences.size);
      console.log("[Fate Web] Added influence:", chunk.label);
    }
    function tickFlowAnimation() {
      if (!aiFlowState.g)
        return;
      aiFlowState.g.selectAll(".flow-node").attr("transform", function() {
        const id = d32.select(this).attr("data-node-id");
        const node = flowAnimState.nodes.find((n) => n.id === id);
        if (node) {
          return `translate(${node.x}, ${node.y})`;
        }
        return d32.select(this).attr("transform");
      });
      aiFlowState.g.selectAll(".flow-link").attr("x1", function() {
        const linkId = d32.select(this).attr("data-link-id");
        if (!linkId)
          return 0;
        const [sourceId] = linkId.split("-");
        const source = flowAnimState.nodes.find((n) => n.id === sourceId);
        return source ? source.x : 0;
      }).attr("y1", function() {
        const linkId = d32.select(this).attr("data-link-id");
        if (!linkId)
          return 0;
        const [sourceId] = linkId.split("-");
        const source = flowAnimState.nodes.find((n) => n.id === sourceId);
        return source ? source.y : 0;
      }).attr("x2", function() {
        const linkId = d32.select(this).attr("data-link-id");
        if (!linkId)
          return 0;
        const targetId = linkId.split("-").slice(1).join("-");
        const target = flowAnimState.nodes.find((n) => n.id === targetId);
        return target ? target.x : 0;
      }).attr("y2", function() {
        const linkId = d32.select(this).attr("data-link-id");
        if (!linkId)
          return 0;
        const targetId = linkId.split("-").slice(1).join("-");
        const target = flowAnimState.nodes.find((n) => n.id === targetId);
        return target ? target.y : 0;
      });
    }
    let particleSpawnTimer = null;
    let aiBurstTimer = null;
    function createAINode(provider = "claude", nodeId = "main", modelLabel) {
      if (!aiFlowState.g)
        return;
      aiFlowState.g.select(`.ai-processor-node[data-node-id="${nodeId}"]`).remove();
      const cx = aiFlowState.width / 2;
      const cy = aiFlowState.height / 2;
      const nodePositions = {
        "main": { x: 0, y: -120 },
        "gpt-consult": { x: 130, y: -80 },
        "claude-refine": { x: 130, y: 30 }
      };
      const pos = nodePositions[nodeId] || nodePositions["main"];
      const aiX = cx + pos.x;
      const aiY = cy + pos.y;
      const isGPT = provider === "gpt";
      const providerColor = isGPT ? "#10b981" : "#6366f1";
      const providerIcon = isGPT ? "\u{1F916}" : "\u2728";
      const providerLabel = modelLabel || (isGPT ? "GPT" : "Claude");
      const aiNode = aiFlowState.g.select(".influences-layer").append("g").attr("class", "ai-processor-node").attr("data-node-id", nodeId).attr("data-provider", provider).attr("data-ai-x", aiX).attr("data-ai-y", aiY).attr("transform", `translate(${aiX}, ${aiY})`).style("opacity", 0);
      aiNode.append("circle").attr("class", "ai-glow-ring").attr("r", 35).attr("fill", "none").attr("stroke", providerColor).attr("stroke-width", 2).attr("opacity", 0.4);
      aiNode.append("circle").attr("class", "ai-core").attr("r", 25).attr("fill", "#1a1a2e").attr("stroke", providerColor).attr("stroke-width", 3).attr("filter", "url(#threadGlow)");
      aiNode.append("text").attr("class", "ai-icon").attr("text-anchor", "middle").attr("dy", "0.35em").attr("fill", providerColor).attr("font-size", "16").text(providerIcon);
      aiNode.append("text").attr("class", "ai-label").attr("y", 40).attr("text-anchor", "middle").attr("fill", providerColor).attr("font-size", "10").attr("font-family", "monospace").text(providerLabel);
      aiNode.transition().duration(400).style("opacity", 1);
    }
    function burstToAI(count = 8) {
      if (!aiFlowState.g)
        return;
      const cx = aiFlowState.width / 2;
      const cy = aiFlowState.height / 2;
      const aiNodes = aiFlowState.g.selectAll(".ai-processor-node");
      if (aiNodes.empty())
        return;
      aiNodes.each(function() {
        const node = d32.select(this);
        const provider = node.attr("data-provider") || "claude";
        const aiX = parseFloat(node.attr("data-ai-x")) || cx;
        const aiY = parseFloat(node.attr("data-ai-y")) || cy - 120;
        const particleColor = provider === "gpt" ? "#10b981" : "#6366f1";
        for (let i = 0; i < count; i++) {
          setTimeout(() => {
            const particle = aiFlowState.g.select(".particles-layer").append("circle").attr("class", "fate-particle request-particle").attr("cx", cx + (Math.random() - 0.5) * 30).attr("cy", cy - 20).attr("r", 6).attr("fill", particleColor).attr("opacity", 1).attr("filter", "url(#threadGlow)");
            particle.transition().duration(400 + Math.random() * 200).ease(d32.easeCubicOut).attr("cx", aiX + (Math.random() - 0.5) * 20).attr("cy", aiY + 30).attr("r", 3).attr("opacity", 0).remove();
          }, i * 40);
        }
      });
    }
    function burstFromAI(count = 4) {
      if (!aiFlowState.g)
        return;
      const cx = aiFlowState.width / 2;
      const cy = aiFlowState.height / 2;
      const aiNodes = aiFlowState.g.selectAll(".ai-processor-node");
      if (aiNodes.empty())
        return;
      const firstNode = d32.select(aiNodes.node());
      const aiX = parseFloat(firstNode.attr("data-ai-x")) || cx;
      const aiY = parseFloat(firstNode.attr("data-ai-y")) || cy - 120;
      for (let i = 0; i < count; i++) {
        setTimeout(() => {
          const particle = aiFlowState.g.select(".particles-layer").append("circle").attr("class", "fate-particle response-particle").attr("cx", cx + (Math.random() - 0.5) * 20).attr("cy", aiY + 35).attr("r", 5).attr("fill", "#6cff9c").attr("opacity", 1).attr("filter", "url(#threadGlow)");
          particle.transition().duration(300 + Math.random() * 150).ease(d32.easeCubicIn).attr("cx", cx + (Math.random() - 0.5) * 15).attr("cy", cy - 15).attr("r", 2).attr("opacity", 0).remove();
        }, i * 30);
      }
    }
    function pulseAINode() {
      if (!flowAnimState.isThinking || !aiFlowState.g)
        return;
      const aiCores = aiFlowState.g.selectAll(".ai-core");
      if (aiCores.empty())
        return;
      aiCores.each(function() {
        d32.select(this).transition().duration(500).attr("r", 30).attr("stroke-width", 4).transition().duration(500).attr("r", 25).attr("stroke-width", 3).on("end", () => {
          if (flowAnimState.isThinking)
            pulseAINode();
        });
      });
    }
    function setFlowThinking2(on, stage, provider = "claude", nodeId = "main", modelLabel) {
      if (!aiFlowState.g)
        return;
      const knot = aiFlowState.g.select(".fate-knot");
      const knotCore = knot.select(".knot-core");
      if (on) {
        flowAnimState.isThinking = true;
        setFateWebPhase("weaving");
        createAINode(provider, nodeId, modelLabel);
        setTimeout(() => {
          burstToAI(10);
          pulseAINode();
        }, 200);
        animateKnotPulse();
        knot.select(".knot-label").text(stage || "Weaving...");
        aiFlowState.g.selectAll(".fate-thread").transition().duration(300).attr("opacity", 0.9);
        startParticleSpawning();
        if (!aiBurstTimer) {
          aiBurstTimer = setInterval(() => {
            if (flowAnimState.isThinking) {
              burstToAI(2);
            }
          }, 350);
        }
      } else {
        flowAnimState.isThinking = false;
        setFateWebPhase("complete");
        if (aiBurstTimer) {
          clearInterval(aiBurstTimer);
          aiBurstTimer = null;
        }
        knotCore.interrupt().transition().duration(300).attr("r", 20).attr("stroke", "#6cff9c");
        knot.select(".knot-label").text("Complete");
        aiFlowState.g.selectAll(".ai-processor-node").transition().duration(500).style("opacity", 0.3);
        aiFlowState.g.selectAll(".ai-core").interrupt();
        aiFlowState.g.selectAll(".fate-thread").transition().duration(500).attr("opacity", 0.4);
        stopParticleSpawning2();
        stopThreadAnimation2();
      }
    }
    function startParticleSpawning() {
      if (particleSpawnTimer)
        return;
      particleSpawnTimer = setInterval(() => {
        if (fateWebState.phase === "idle" || fateWebState.phase === "complete")
          return;
        if (!fateWebState.influences.size)
          return;
        const influences = Array.from(fateWebState.influences.values());
        const numToSpawn = Math.min(3, influences.length);
        const shuffled = influences.sort(() => Math.random() - 0.5);
        for (let i = 0; i < numToSpawn; i++) {
          const inf = shuffled[i];
          if (inf) {
            const color = THREAD_COLORS[inf.source] || THREAD_COLORS.memory;
            setTimeout(() => spawnThreadParticle(inf.id, color), i * 20);
          }
        }
      }, 80);
    }
    function stopParticleSpawning2() {
      if (particleSpawnTimer) {
        clearInterval(particleSpawnTimer);
        particleSpawnTimer = null;
      }
    }
    function animateKnotPulse() {
      if (!flowAnimState.isThinking || !aiFlowState.g)
        return;
      const knotCore = aiFlowState.g.select(".knot-core");
      knotCore.transition().duration(400).attr("r", 24).transition().duration(400).attr("r", 18).on("end", animateKnotPulse);
    }
    function animateThinkingPulse(circle) {
      if (!flowAnimState.isThinking)
        return;
      circle.transition().duration(600).attr("r", 28).transition().duration(600).attr("r", 22).on("end", () => animateThinkingPulse(circle));
    }
    function updateFlowStatsAnimated(tokens, chunks) {
      const tokensEl = document.getElementById("flowPanelTokens");
      const chunksEl = document.getElementById("flowPanelChunks");
      if (tokensEl) {
        tokensEl.classList.add("updating");
        tokensEl.textContent = `${tokens} tokens`;
        setTimeout(() => tokensEl.classList.remove("updating"), 300);
      }
      if (chunksEl) {
        chunksEl.classList.add("updating");
        chunksEl.textContent = `${chunks} chunks`;
        setTimeout(() => chunksEl.classList.remove("updating"), 300);
      }
    }
    let particleAnimationId = null;
    function startParticleFlow() {
      if (particleAnimationId)
        return;
      const particleGroup = aiFlowState.g.select(".flow-particles");
      if (particleGroup.empty()) {
        aiFlowState.g.insert("g", ".flow-nodes").attr("class", "flow-particles");
      }
      function spawnParticle() {
        if (!aiFlowState.g || flowAnimState.links.length === 0)
          return;
        const pGroup = aiFlowState.g.select(".flow-particles");
        const link = flowAnimState.links[Math.floor(Math.random() * flowAnimState.links.length)];
        const sourceNode = flowAnimState.nodes.find((n) => n.id === (link.source.id || link.source));
        const targetNode = flowAnimState.nodes.find((n) => n.id === (link.target.id || link.target));
        if (!sourceNode || !targetNode)
          return;
        const startX = targetNode.x;
        const startY = targetNode.y;
        const endX = sourceNode.x;
        const endY = sourceNode.y;
        const chunkNode = flowAnimState.nodes.find((n) => n.id === link.target);
        const color = chunkNode ? AI_FLOW_COLORS[chunkNode.source] || "#00d4ff" : "#00d4ff";
        const particle = pGroup.append("circle").attr("class", "flow-particle").attr("cx", startX).attr("cy", startY).attr("r", 3).attr("fill", color).attr("opacity", 0.8);
        particle.transition().duration(800 + Math.random() * 400).ease(d32.easeQuadIn).attr("cx", endX).attr("cy", endY).attr("r", 1).attr("opacity", 0).remove();
      }
      function particleLoop() {
        spawnParticle();
        if (flowAnimState.links.length > 0) {
          const interval = flowAnimState.isThinking ? 80 : 200;
          particleAnimationId = setTimeout(particleLoop, interval);
        }
      }
      particleLoop();
    }
    function stopParticleFlow2() {
      if (particleAnimationId) {
        clearTimeout(particleAnimationId);
        particleAnimationId = null;
      }
    }
    function addThinkingRipples() {
      if (!aiFlowState.g || !flowAnimState.isThinking)
        return;
      const cx = aiFlowState.width / 2;
      const cy = aiFlowState.height / 2;
      const ripple = aiFlowState.g.select(".flow-nodes").insert("circle", ":first-child").attr("class", "thinking-ripple").attr("cx", cx).attr("cy", cy).attr("r", 25).attr("fill", "none").attr("stroke", AI_FLOW_COLORS.query).attr("stroke-width", 2).attr("opacity", 0.5);
      ripple.transition().duration(1500).attr("r", 100).attr("opacity", 0).attr("stroke-width", 0.5).remove().on("end", () => {
        if (flowAnimState.isThinking) {
          addThinkingRipples();
        }
      });
    }
    const originalSetFlowThinking = setFlowThinking2;
    setFlowThinking2 = function(on, stage, provider, nodeId, modelLabel) {
      originalSetFlowThinking(on, stage, provider, nodeId, modelLabel);
      if (aiFlowState.g) {
        aiFlowState.g.classed("thinking-active", on);
      }
      if (on) {
        addThinkingRipples();
        startParticleFlow();
        if (aiFlowState.g) {
          const queryG = aiFlowState.g.select('[data-node-id="query"]');
          queryG.select(".thinking-label").remove();
          queryG.append("text").attr("class", "thinking-label").attr("y", 40).attr("text-anchor", "middle").attr("fill", AI_FLOW_COLORS.query).attr("font-size", "11").attr("font-weight", "500").text(stage || "Generating...");
        }
      } else {
        if (aiFlowState.g) {
          aiFlowState.g.selectAll(".thinking-label").remove();
          aiFlowState.g.selectAll(".thinking-ripple").remove();
        }
      }
    };
    const originalSpawnFlowChunk = spawnFlowChunk2;
    spawnFlowChunk2 = function(chunk) {
      originalSpawnFlowChunk(chunk);
      if (flowAnimState.links.length === 1) {
        startParticleFlow();
      }
    };
    function burstParticlesToCenter(intensity = 3) {
      if (!aiFlowState.g || !fateWebState.influences.size)
        return;
      const influences = Array.from(fateWebState.influences.values());
      const cx = aiFlowState.width / 2;
      const cy = aiFlowState.height / 2;
      for (let i = 0; i < Math.min(intensity, influences.length * 2); i++) {
        setTimeout(() => {
          const inf = influences[Math.floor(Math.random() * influences.length)];
          if (!inf)
            return;
          const color = THREAD_COLORS[inf.source] || THREAD_COLORS.memory;
          const particle = aiFlowState.g.select(".particles-layer").append("circle").attr("class", "fate-particle burst-particle").attr("cx", inf.x || inf.tx).attr("cy", inf.y || inf.ty).attr("r", 7).attr("fill", color).attr("opacity", 1).attr("filter", "url(#threadGlow)");
          particle.transition().duration(350 + Math.random() * 150).ease(d32.easeCubicIn).attr("cx", cx).attr("cy", cy).attr("r", 2).attr("opacity", 0).remove();
        }, i * 25);
      }
    }
    function pulseKnotOnChunk() {
      if (!aiFlowState.g)
        return;
      const knotCore = aiFlowState.g.select(".knot-core");
      if (knotCore.empty())
        return;
      knotCore.interrupt().attr("r", 30).attr("stroke", "#fff").attr("stroke-width", 5).transition().duration(120).attr("r", 22).attr("stroke", "#6cf").attr("stroke-width", 3).on("end", () => {
        if (flowAnimState.isThinking)
          animateKnotPulse();
      });
    }
    function updateResponseNode(tokensDelta) {
      if (!aiFlowState.g)
        return;
      flowAnimState.responseTokens += tokensDelta;
      const tokens = flowAnimState.responseTokens;
      if (tokensDelta > 0) {
        if (typeof burstFromAI === "function") {
          burstFromAI(Math.min(5, Math.ceil(tokensDelta / 10)));
        }
        if (fateWebState.influences.size > 0) {
          burstParticlesToCenter(Math.min(4, Math.ceil(tokensDelta / 12)));
        }
        pulseKnotOnChunk();
      }
      const nodeGroup = aiFlowState.g.select(".flow-nodes");
      const linkGroup = aiFlowState.g.select(".flow-links");
      const cx = aiFlowState.width / 2;
      const cy = aiFlowState.height / 2;
      const baseSize = 12;
      const maxSize = 30;
      const size = Math.min(maxSize, baseSize + Math.log(tokens + 1) * 3);
      if (!flowAnimState.responseNodeAdded) {
        flowAnimState.responseNodeAdded = true;
        const respX = cx;
        const respY = cy + 80;
        flowAnimState.nodes.push({
          id: "response",
          source: "response",
          label: "Response",
          tokens,
          x: respX,
          y: respY
        });
        flowAnimState.links.push({
          source: "query",
          target: "response"
        });
        linkGroup.append("line").attr("class", "flow-link response-link").attr("data-link-target", "response").attr("x1", cx).attr("y1", cy + 20).attr("x2", respX).attr("y2", respY - size).attr("stroke", AI_FLOW_COLORS.response).attr("stroke-width", 2).attr("stroke-dasharray", "4,4").style("opacity", 0).transition().duration(300).style("opacity", 0.6);
        const nodeG = nodeGroup.append("g").attr("class", "flow-node response-node").attr("data-node-id", "response").attr("transform", `translate(${respX}, ${respY})`).style("opacity", 0);
        nodeG.append("circle").attr("class", "response-glow").attr("r", size + 8).attr("fill", "none").attr("stroke", AI_FLOW_COLORS.response).attr("stroke-width", 2).attr("opacity", 0.3);
        nodeG.append("circle").attr("class", "response-circle").attr("r", size).attr("fill", AI_FLOW_COLORS.response).attr("opacity", 0.9).attr("filter", "url(#flowGlow)");
        nodeG.append("text").attr("class", "response-tokens").attr("y", size + 16).attr("text-anchor", "middle").attr("fill", AI_FLOW_COLORS.response).attr("font-size", "10").text(`${tokens} tokens`);
        nodeG.transition().duration(300).style("opacity", 1);
      } else {
        const nodeG = aiFlowState.g.select('[data-node-id="response"]');
        nodeG.select(".response-circle").transition().duration(100).attr("r", size);
        nodeG.select(".response-glow").transition().duration(100).attr("r", size + 8);
        nodeG.select(".response-tokens").text(`${tokens} tokens`).attr("y", size + 16);
        linkGroup.select('[data-link-target="response"]').attr("y2", cy + 80 - size);
      }
    }
    function showResponseComplete(finalTokens) {
      if (!aiFlowState.g)
        return;
      const nodeG = aiFlowState.g.select('[data-node-id="response"]');
      if (nodeG.empty())
        return;
      flowAnimState.responseTokens = finalTokens || flowAnimState.responseTokens;
      nodeG.select(".response-tokens").text(`${flowAnimState.responseTokens} tokens`);
      nodeG.select(".response-glow").transition().duration(500).attr("stroke", "#00ff88").attr("opacity", 0.5);
      nodeG.select(".response-circle").transition().duration(200).attr("r", parseFloat(nodeG.select(".response-circle").attr("r")) + 5).transition().duration(200).attr("r", parseFloat(nodeG.select(".response-circle").attr("r")));
      nodeG.append("text").attr("class", "response-check").attr("y", 5).attr("text-anchor", "middle").attr("fill", "#00ff88").attr("font-size", "16").attr("font-weight", "bold").style("opacity", 0).text("\u2713").transition().duration(300).style("opacity", 1);
    }
    function resetResponseTracking() {
      flowAnimState.responseTokens = 0;
      flowAnimState.responseNodeAdded = false;
    }
    let contextSourceCount = 0;
    let contextTokenCount = 0;
    function setAiStage2(stage, text) {
      const indicator = document.getElementById("aiStageIndicator");
      if (!indicator)
        return;
      indicator.classList.remove("retrieving", "thinking", "generating", "complete", "error");
      if (stage) {
        indicator.classList.add(stage);
      }
      const textEl = indicator.querySelector(".stage-text");
      if (textEl) {
        textEl.textContent = text || "Waiting for input...";
      }
    }
    function clearContextSources2() {
      const list = document.getElementById("contextSourcesList");
      if (list) {
        list.innerHTML = '<div class="empty-sources">Retrieving context...</div>';
      }
      contextSourceCount = 0;
      contextTokenCount = 0;
      updateFlowStats();
    }
    function addContextSourceCard2(chunk) {
      const list = document.getElementById("contextSourcesList");
      if (!list)
        return;
      const empty = list.querySelector(".empty-sources");
      if (empty)
        empty.remove();
      contextSourceCount++;
      contextTokenCount += chunk.tokens || 0;
      updateFlowStats();
      const card = document.createElement("div");
      card.className = "context-source-card";
      card.dataset.chunkId = chunk.id;
      const simPercent = chunk.similarity ? Math.round(chunk.similarity * 100) : null;
      card.innerHTML = `
      <div class="source-card-header">
        <span class="source-type-badge ${chunk.source}"></span>
        <span class="source-title">${escapeHtml2(chunk.label)}</span>
        <span class="source-tokens">${chunk.tokens} tok</span>
        ${simPercent ? `<span class="source-score">${simPercent}%</span>` : ""}
      </div>
      <div class="source-content-preview">
        ${chunk.content ? escapeHtml2(chunk.content) : "<em>No preview available</em>"}
      </div>
    `;
      card.addEventListener("click", () => {
        card.classList.toggle("expanded");
      });
      list.appendChild(card);
      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    function updateFlowStats() {
      const tokensEl = document.getElementById("flowPanelTokens");
      const chunksEl = document.getElementById("flowPanelChunks");
      if (tokensEl)
        tokensEl.textContent = `${contextTokenCount} tokens`;
      if (chunksEl)
        chunksEl.textContent = `${contextSourceCount} sources`;
    }
    function showLiveResponse2() {
      const section = document.getElementById("liveResponseSection");
      if (section) {
        section.style.display = "block";
      }
      const text = document.getElementById("liveResponseText");
      if (text) {
        text.textContent = "";
      }
      const counter = document.getElementById("responseTokenCounter");
      if (counter)
        counter.textContent = "0 tokens";
    }
    function hideLiveResponse2() {
      const section = document.getElementById("liveResponseSection");
      if (section) {
        section.style.display = "none";
      }
    }
    function updateLiveResponseText2(chunkText, totalTokens) {
      const textEl = document.getElementById("liveResponseText");
      if (textEl) {
        textEl.textContent += chunkText;
        if (textEl.textContent.length > 500) {
          textEl.textContent = "..." + textEl.textContent.slice(-497);
        }
        textEl.scrollTop = textEl.scrollHeight;
      }
      const counter = document.getElementById("responseTokenCounter");
      if (counter) {
        counter.textContent = `${totalTokens} tokens`;
      }
    }
    function toggleMiniGraph2() {
      const canvas = document.querySelector(".flow-panel-canvas.mini");
      const toggle = document.getElementById("miniGraphToggle");
      if (canvas && toggle) {
        canvas.classList.toggle("collapsed");
        toggle.classList.toggle("collapsed");
      }
    }
    function renderAiFlow2(contextData) {
      console.log("[SpaceCode] renderAiFlow called with:", contextData);
      console.log("[SpaceCode] aiFlowState.svg:", aiFlowState.svg ? "exists" : "NULL");
      console.log("[SpaceCode] aiFlowState.g:", aiFlowState.g ? "exists" : "NULL");
      if (!aiFlowState.svg || !aiFlowState.g) {
        console.warn("[SpaceCode] renderAiFlow: SVG not initialized, trying to init...");
        initContextFlowVisualization2();
        if (!aiFlowState.svg || !aiFlowState.g) {
          console.error("[SpaceCode] renderAiFlow: Failed to initialize SVG");
          return;
        }
      }
      const linkGroup = aiFlowState.g.select(".flow-links");
      const nodeGroup = aiFlowState.g.select(".flow-nodes");
      const nodes = [];
      const links = [];
      const cx = aiFlowState.width / 2;
      const cy = aiFlowState.height / 2;
      nodes.push({
        id: "query",
        type: "query",
        label: contextData.query ? contextData.query.substring(0, 20) + "..." : "Query",
        size: 20,
        tokens: contextData.queryTokens || 0,
        fx: cx,
        // Fixed x
        fy: cy
        // Fixed y
      });
      (contextData.memoryChunks || []).forEach((chunk, i) => {
        const nodeId = `memory-${i}`;
        nodes.push({
          id: nodeId,
          type: "memory",
          label: chunk.label || `Memory ${i + 1}`,
          size: 8 + Math.min(chunk.tokens || 100, 500) / 50,
          tokens: chunk.tokens || 0,
          similarity: chunk.similarity || 0.5
        });
        links.push({
          source: "query",
          target: nodeId,
          distance: 60 + (1 - (chunk.similarity || 0.5)) * 80
        });
      });
      (contextData.kbChunks || []).forEach((chunk, i) => {
        const nodeId = `kb-${i}`;
        nodes.push({
          id: nodeId,
          type: "kb",
          label: chunk.label || `KB ${i + 1}`,
          size: 8 + Math.min(chunk.tokens || 100, 500) / 50,
          tokens: chunk.tokens || 0,
          similarity: chunk.similarity || 0.5
        });
        links.push({
          source: "query",
          target: nodeId,
          distance: 60 + (1 - (chunk.similarity || 0.5)) * 80
        });
      });
      (contextData.chatHistory || []).forEach((msg2, i) => {
        const nodeId = `chat-${i}`;
        nodes.push({
          id: nodeId,
          type: "chat",
          label: msg2.role === "user" ? "User" : "AI",
          size: 6 + Math.min(msg2.tokens || 50, 300) / 40,
          tokens: msg2.tokens || 0
        });
        links.push({
          source: "query",
          target: nodeId,
          distance: 100
        });
      });
      if (contextData.sectorRules) {
        nodes.push({
          id: "sector",
          type: "sector",
          label: contextData.sectorRules.name || "Sector",
          size: 12,
          tokens: contextData.sectorRules.tokens || 0
        });
        links.push({
          source: "query",
          target: "sector",
          distance: 90
        });
      }
      if (aiFlowState.simulation) {
        aiFlowState.simulation.stop();
      }
      aiFlowState.simulation = d32.forceSimulation(nodes).force(
        "link",
        d32.forceLink(links).id((d) => d.id).distance((d) => d.distance || 100)
      ).force("charge", d32.forceManyBody().strength(-200)).force("collision", d32.forceCollide().radius((d) => d.size + 15)).force("center", d32.forceCenter(cx, cy).strength(0.05));
      const link = linkGroup.selectAll("line").data(links).join(
        (enter) => enter.append("line").attr("stroke", "#333").attr("stroke-width", 1).attr("stroke-dasharray", "3,3").attr("marker-end", "url(#flowArrow)").attr("opacity", 0).call((enter2) => enter2.transition().duration(500).attr("opacity", 1)),
        (update) => update,
        (exit) => exit.transition().duration(300).attr("opacity", 0).remove()
      );
      function dragstarted(event, d) {
        if (!event.active)
          aiFlowState.simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      }
      function dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
      }
      function dragended(event, d) {
        if (!event.active)
          aiFlowState.simulation.alphaTarget(0);
        if (d.type !== "query") {
          d.fx = null;
          d.fy = null;
        }
      }
      const node = nodeGroup.selectAll("g.flow-node").data(nodes, (d) => d.id).join(
        (enter) => {
          const g = enter.append("g").attr("class", "flow-node").style("cursor", "pointer").attr("opacity", 0).call((enter2) => enter2.transition().duration(500).attr("opacity", 1));
          g.append("circle").attr("r", (d) => d.size).attr("fill", (d) => AI_FLOW_COLORS[d.type] || "#666").attr("filter", "url(#flowGlow)").attr("opacity", 0.9);
          g.append("text").attr("y", (d) => d.size + 12).attr("text-anchor", "middle").attr("fill", "#888").attr("font-size", "9").text((d) => d.label);
          g.append("text").attr("class", "token-label").attr("y", (d) => d.size + 22).attr("text-anchor", "middle").attr("fill", "#555").attr("font-size", "8").text((d) => d.tokens ? `${d.tokens}t` : "");
          g.on("click", (event, d) => showFlowNodeDetails(d));
          g.call(
            d32.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended)
          );
          return g;
        },
        (update) => update,
        (exit) => exit.transition().duration(300).attr("opacity", 0).remove()
      );
      aiFlowState.simulation.on("tick", () => {
        link.attr("x1", (d) => d.source.x).attr("y1", (d) => d.source.y).attr("x2", (d) => d.target.x).attr("y2", (d) => d.target.y);
        node.attr("transform", (d) => `translate(${d.x},${d.y})`);
      });
      aiFlowState.nodes = nodes;
      aiFlowState.links = links;
      updateFlowStatsFromContext(contextData);
    }
    function showFlowNodeDetails(node) {
      const details = document.getElementById("flowContextDetails");
      if (!details)
        return;
      details.innerHTML = `
      <div style="margin-bottom:8px;"><strong>${node.label}</strong></div>
      <div style="font-size:11px; color:#888;">Type: ${node.type}</div>
      <div style="font-size:11px; color:#888;">Tokens: ${node.tokens || "N/A"}</div>
      ${node.similarity !== void 0 ? `<div style="font-size:11px; color:#888;">Similarity: ${(node.similarity * 100).toFixed(1)}%</div>` : ""}
    `;
    }
    function updateFlowStatsFromContext(contextData) {
      const tokensEl = document.getElementById("flowPanelTokens");
      const chunksEl = document.getElementById("flowPanelChunks");
      const totalTokens = (contextData.queryTokens || 0) + (contextData.memoryChunks || []).reduce((sum, c) => sum + (c.tokens || 0), 0) + (contextData.kbChunks || []).reduce((sum, c) => sum + (c.tokens || 0), 0) + (contextData.chatHistory || []).reduce((sum, c) => sum + (c.tokens || 0), 0) + (contextData.sectorRules?.tokens || 0);
      const totalChunks = (contextData.memoryChunks || []).length + (contextData.kbChunks || []).length + (contextData.chatHistory || []).length + (contextData.sectorRules ? 1 : 0);
      if (tokensEl)
        tokensEl.textContent = `${totalTokens} tokens`;
      if (chunksEl)
        chunksEl.textContent = `${totalChunks} chunks`;
    }
    function clearAiFlow2() {
      if (!aiFlowState.svg)
        return;
      if (aiFlowState.simulation) {
        aiFlowState.simulation.stop();
      }
      aiFlowState.svg.selectAll(".flow-link").remove();
      aiFlowState.svg.selectAll(".flow-node").remove();
      aiFlowState.svg.selectAll(".flow-thinking").remove();
      const tokensEl = document.getElementById("flowPanelTokens");
      const chunksEl = document.getElementById("flowPanelChunks");
      if (tokensEl)
        tokensEl.textContent = "0 tokens";
      if (chunksEl)
        chunksEl.textContent = "0 chunks";
    }
    function showFlowThinking(stage) {
      if (!aiFlowState.svg)
        return;
      aiFlowState.svg.select(".flow-thinking").remove();
      const cx = aiFlowState.width / 2;
      const cy = 30;
      const thinking = aiFlowState.svg.append("g").attr("class", "flow-thinking");
      thinking.append("rect").attr("x", cx - 60).attr("y", cy - 12).attr("width", 120).attr("height", 24).attr("rx", 12).attr("fill", "rgba(0,212,255,0.1)").attr("stroke", AI_FLOW_COLORS.query).attr("stroke-width", 1);
      thinking.append("text").attr("x", cx).attr("y", cy + 4).attr("text-anchor", "middle").attr("fill", AI_FLOW_COLORS.query).attr("font-size", "10").text(stage || "Processing...");
      [-45, -35, -25].forEach((offset, i) => {
        const dot = thinking.append("circle").attr("cx", cx + offset).attr("cy", cy).attr("r", 3).attr("fill", AI_FLOW_COLORS.query);
        function animateDot() {
          dot.transition().delay(i * 200).duration(400).attr("opacity", 0.3).transition().duration(400).attr("opacity", 1).on("end", animateDot);
        }
        animateDot();
      });
    }
    function hideFlowThinking() {
      if (!aiFlowState.svg)
        return;
      aiFlowState.svg.select(".flow-thinking").remove();
    }
    function resetFlowZoom() {
      if (!aiFlowState.svg || !aiFlowState.zoom)
        return;
      aiFlowState.svg.transition().duration(500).call(
        aiFlowState.zoom.transform,
        d32.zoomIdentity
      );
    }
    function demoAiFlow() {
      renderAiFlow2({
        query: "How do I implement player movement?",
        queryTokens: 15,
        memoryChunks: [
          { label: "CharacterController", tokens: 450, similarity: 0.92 },
          { label: "PlayerInput.cs", tokens: 320, similarity: 0.85 },
          { label: "MovementConfig", tokens: 180, similarity: 0.78 }
        ],
        kbChunks: [
          { label: "Unity Docs: Movement", tokens: 600, similarity: 0.88 },
          { label: "Best Practices", tokens: 400, similarity: 0.72 }
        ],
        chatHistory: [
          { role: "user", tokens: 50 },
          { role: "assistant", tokens: 200 }
        ],
        sectorRules: { name: "Scripts", tokens: 150 }
      });
    }
    function getFlowResponseTokens2() {
      return flowAnimState && typeof flowAnimState.responseTokens === "number" ? flowAnimState.responseTokens : 0;
    }
    return {
      initContextFlowVisualization: initContextFlowVisualization2,
      startAiFlow: startAiFlow2,
      spawnFlowChunk: spawnFlowChunk2,
      setFlowThinking: setFlowThinking2,
      stopThreadAnimation: stopThreadAnimation2,
      stopParticleSpawning: stopParticleSpawning2,
      stopParticleFlow: stopParticleFlow2,
      renderAiFlow: renderAiFlow2,
      clearAiFlow: clearAiFlow2,
      setAiStage: setAiStage2,
      clearContextSources: clearContextSources2,
      addContextSourceCard: addContextSourceCard2,
      showLiveResponse: showLiveResponse2,
      hideLiveResponse: hideLiveResponse2,
      updateLiveResponseText: updateLiveResponseText2,
      toggleMiniGraph: toggleMiniGraph2,
      getFlowResponseTokens: getFlowResponseTokens2
    };
  }

  // src/webview/panel/features/chatStore.ts
  var PERSONA_COLORS = {
    "lead-engineer": "#a855f7",
    "qa-engineer": "#f59e0b",
    "technical-writer": "#3b82f6",
    "issue-triager": "#10b981",
    "database-engineer": "#22c55e",
    "art-director": "#ec4899"
  };
  var PERSONA_LABELS = {
    "lead-engineer": "Lead Engineer",
    "qa-engineer": "QA Engineer",
    "technical-writer": "Technical Writer",
    "issue-triager": "Issue Triager",
    "database-engineer": "Database Engineer",
    "art-director": "Art Director"
  };
  function createChatStore(deps) {
    const { uiState: uiState2, PERSONA_MAP: PERSONA_MAP2, vscode: vscode2 } = deps;
    function getActivePersona() {
      return uiState2.currentPersona || "lead-engineer";
    }
    function isManualOverride() {
      return !!uiState2.personaManualOverride;
    }
    function getAutoSkills() {
      return uiState2.autoSkills || [];
    }
    function getManualSkills() {
      return uiState2.manualSkills || [];
    }
    function getCombinedSkills() {
      return [.../* @__PURE__ */ new Set([...getAutoSkills(), ...getManualSkills()])];
    }
    function getPersonaColor(personaId) {
      return PERSONA_COLORS[personaId || getActivePersona()] || "#a855f7";
    }
    function getPersonaLabel(personaId) {
      return PERSONA_LABELS[personaId || getActivePersona()] || (personaId || "Lead Engineer");
    }
    function setPersona(personaId, manual = false) {
      uiState2.currentPersona = personaId;
      uiState2.personaManualOverride = manual;
      if (manual) {
        vscode2.postMessage({ type: "setPersona", personaId });
      }
      notifyListeners();
    }
    function clearOverride(currentTab2) {
      uiState2.personaManualOverride = false;
      const personaKey = currentTab2 === "dashboard" ? `dashboard:${uiState2.dashboardSubtab || "docs"}` : currentTab2;
      const persona = PERSONA_MAP2 && PERSONA_MAP2[personaKey] || PERSONA_MAP2[currentTab2] || "lead-engineer";
      uiState2.currentPersona = persona;
      notifyListeners();
    }
    function setAutoSkills(skills) {
      uiState2.autoSkills = skills;
      notifyListeners();
    }
    function addManualSkill(skillId) {
      const current = uiState2.manualSkills || [];
      if (!current.includes(skillId)) {
        uiState2.manualSkills = [...current, skillId];
        notifyListeners();
      }
    }
    function removeManualSkill(skillId) {
      uiState2.manualSkills = (uiState2.manualSkills || []).filter((s) => s !== skillId);
      notifyListeners();
    }
    const listeners = [];
    function subscribe(fn) {
      listeners.push(fn);
      return () => {
        const idx = listeners.indexOf(fn);
        if (idx >= 0)
          listeners.splice(idx, 1);
      };
    }
    function notifyListeners() {
      const state = getSnapshot();
      listeners.forEach((fn) => fn(state));
    }
    function getSnapshot() {
      return {
        activePersona: getActivePersona(),
        manualOverride: isManualOverride(),
        autoSkills: getAutoSkills(),
        manualSkills: getManualSkills(),
        combinedSkills: getCombinedSkills(),
        personaColor: getPersonaColor(),
        personaLabel: getPersonaLabel()
      };
    }
    return {
      getActivePersona,
      isManualOverride,
      getAutoSkills,
      getManualSkills,
      getCombinedSkills,
      getPersonaColor,
      getPersonaLabel,
      setPersona,
      clearOverride,
      setAutoSkills,
      addManualSkill,
      removeManualSkill,
      subscribe,
      getSnapshot,
      PERSONA_COLORS,
      PERSONA_LABELS
    };
  }

  // src/webview/panel/features/sectorMap.ts
  function createSectorMapHandlers(deps) {
    const { vscode: vscode2, escapeHtml: escapeHtml2 } = deps;
    function createOrbitalGraph2(canvasEl, tooltipEl, options = {}) {
      const ctx = canvasEl.getContext("2d");
      if (!ctx)
        return null;
      const opts = {
        bgColor: options.bgColor || "#0a0e17",
        bgGradient: options.bgGradient !== false,
        showStars: options.showStars !== false,
        showTitle: options.showTitle !== false,
        showLegend: options.showLegend !== false,
        showSummary: options.showSummary !== false,
        title: options.title || "SECTOR MAP",
        particleCount: options.particleCount || 120,
        orbitSpeedBase: options.orbitSpeedBase || 15e-5,
        ellipseRatio: options.ellipseRatio || 0.65,
        ring1Ratio: options.ring1Ratio || 0.22,
        ring2Ratio: options.ring2Ratio || 0.38,
        coreRadius: options.coreRadius || 38,
        ring1Radius: options.ring1Radius || 28,
        ring2Radius: options.ring2Radius || 24,
        ...options
      };
      let W = 0, H = 0, cx = 0, cy = 0;
      let time = 0;
      let running = false;
      let animId = null;
      let hoveredNode = null;
      let mouse = { x: -1e3, y: -1e3 };
      let clickCb = null;
      let allNodes = [];
      let graphNodes = [];
      let particles = [];
      let stars = [];
      function resize() {
        const rect = canvasEl.parentElement ? canvasEl.parentElement.getBoundingClientRect() : { width: canvasEl.clientWidth || 400, height: canvasEl.clientHeight || 300 };
        W = canvasEl.width = Math.max(200, rect.width);
        H = canvasEl.height = Math.max(150, rect.height);
        cx = W / 2;
        cy = H / 2;
        if (allNodes.length > 0)
          layoutNodes();
      }
      function initStars() {
        stars = [];
        for (let i = 0; i < 200; i++) {
          stars.push({
            x: Math.random() * 3e3 - 1500,
            y: Math.random() * 3e3 - 1500,
            r: Math.random() * 1.2,
            a: Math.random() * 0.5 + 0.1,
            twinkle: Math.random() * 0.02
          });
        }
      }
      const POSITION_TEMPLATES = {
        // Default RPG layout: CORE center, ring 1 close deps, ring 2 outer deps
        rpg: {
          "core": { x: 0, y: 0, ring: 0 },
          "character": { x: -0.2, y: -0.28, ring: 1 },
          "inventory": { x: 0.2, y: -0.28, ring: 1 },
          "world": { x: 0.32, y: 0, ring: 1 },
          "persistence": { x: -0.32, y: 0, ring: 1 },
          "ui": { x: -0.2, y: 0.28, ring: 1 },
          "quest": { x: 0.2, y: 0.28, ring: 1 },
          "combat": { x: -0.42, y: -0.3, ring: 2 },
          "dialogue": { x: 0.42, y: 0.3, ring: 2 },
          "ai": { x: 0.42, y: -0.3, ring: 2 },
          "editor": { x: -0.42, y: 0.3, ring: 2 },
          "yard": { x: 0, y: 0.42, ring: 2 }
        }
      };
      function getDepth(s) {
        if (s.deps.length === 0 && s.id !== (opts.centerId || "core"))
          return 2;
        const centerId = opts.centerId || "core";
        if (s.deps.length === 1 && s.deps[0] === centerId)
          return 1;
        if (s.deps.every((d) => d === centerId))
          return 1;
        return 2;
      }
      function layoutNodes() {
        graphNodes = [];
        const centerId = opts.centerId || "core";
        const template = POSITION_TEMPLATES[opts.layoutTemplate || "rpg"] || {};
        const scaleX = W * 0.5;
        const scaleY = H * 0.5;
        const scale = Math.min(W, H) * 0.5;
        allNodes.forEach((s) => {
          const tpl = template[s.id];
          const isCenter = s.id === centerId;
          if (tpl) {
            graphNodes.push({
              ...s,
              x: tpl.x * scaleX * 0.92,
              y: tpl.y * scaleY * 0.85,
              radius: isCenter ? opts.coreRadius : tpl.ring === 1 ? opts.ring1Radius : opts.ring2Radius,
              ring: tpl.ring
            });
          } else {
            const depth = isCenter ? 0 : getDepth(s);
            const existingInRing = graphNodes.filter((n) => n.ring === depth).length;
            const ringR = depth === 0 ? 0 : depth === 1 ? opts.ring1Ratio : opts.ring2Ratio;
            const angle = existingInRing / Math.max(6, existingInRing + 1) * Math.PI * 2 - Math.PI / 2;
            graphNodes.push({
              ...s,
              x: isCenter ? 0 : Math.cos(angle) * ringR * scale,
              y: isCenter ? 0 : Math.sin(angle) * ringR * scale * opts.ellipseRatio,
              radius: isCenter ? opts.coreRadius : depth === 1 ? opts.ring1Radius : opts.ring2Radius,
              ring: depth
            });
          }
        });
        spawnParticles();
      }
      function spawnParticles() {
        particles = [];
        for (let i = 0; i < opts.particleCount; i++) {
          const srcNode = graphNodes[Math.floor(Math.random() * graphNodes.length)];
          if (!srcNode || srcNode.deps.length === 0 && srcNode.ring !== 0)
            continue;
          const depId = srcNode.deps.length > 0 ? srcNode.deps[Math.floor(Math.random() * srcNode.deps.length)] : null;
          if (!depId)
            continue;
          const tgtNode = graphNodes.find((n) => n.id === depId);
          if (!tgtNode)
            continue;
          particles.push({
            from: srcNode,
            to: tgtNode,
            t: Math.random(),
            speed: 2e-3 + Math.random() * 3e-3,
            color: srcNode.color,
            size: 1.5 + Math.random() * 1.5,
            alpha: 0.4 + Math.random() * 0.4
          });
        }
      }
      function hexToRgb(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return [r, g, b];
      }
      function healthColor(h) {
        if (h >= 0.9)
          return [34, 197, 94];
        if (h >= 0.7)
          return [245, 158, 11];
        return [239, 68, 68];
      }
      function onMouseMove(e) {
        const rect = canvasEl.getBoundingClientRect();
        mouse.x = e.clientX - rect.left;
        mouse.y = e.clientY - rect.top;
        hoveredNode = null;
        for (const n of graphNodes) {
          const dx = cx + n.x - mouse.x;
          const dy = cy + n.y - mouse.y;
          if (Math.sqrt(dx * dx + dy * dy) < n.radius + 8) {
            hoveredNode = n;
            break;
          }
        }
        if (hoveredNode && tooltipEl) {
          canvasEl.style.cursor = "pointer";
          const healthPct = Math.round(hoveredNode.health * 100);
          const hc = hoveredNode.health >= 0.9 ? "#22c55e" : hoveredNode.health >= 0.7 ? "#f59e0b" : "#ef4444";
          const hl = hoveredNode.health >= 0.9 ? "Healthy" : hoveredNode.health >= 0.7 ? "Warning" : "Critical";
          const nameEl = tooltipEl.querySelector(".sm-tip-name");
          const techEl = tooltipEl.querySelector(".sm-tip-tech");
          const healthEl = tooltipEl.querySelector(".sm-tip-health");
          const depsEl = tooltipEl.querySelector(".sm-tip-deps");
          if (nameEl)
            nameEl.textContent = hoveredNode.name;
          if (techEl)
            techEl.textContent = (hoveredNode.tech || "") + (hoveredNode.scripts ? " \xB7 " + hoveredNode.scripts + " scripts" : "");
          if (healthEl)
            healthEl.innerHTML = '<span style="color:' + hc + '">\u25CF ' + hl + " (" + healthPct + "%)</span>";
          if (depsEl)
            depsEl.textContent = hoveredNode.deps.length > 0 ? "Deps: " + hoveredNode.deps.join(", ") : "No dependencies";
          tooltipEl.style.display = "block";
          const canvasRect = canvasEl.getBoundingClientRect();
          tooltipEl.style.left = e.clientX - canvasRect.left + 16 + "px";
          tooltipEl.style.top = e.clientY - canvasRect.top - 10 + "px";
        } else {
          canvasEl.style.cursor = "default";
          if (tooltipEl)
            tooltipEl.style.display = "none";
        }
      }
      function onMouseClick() {
        if (hoveredNode && clickCb) {
          clickCb(hoveredNode);
        }
      }
      function onMouseLeave() {
        hoveredNode = null;
        if (tooltipEl)
          tooltipEl.style.display = "none";
        canvasEl.style.cursor = "default";
      }
      function draw() {
        if (!running)
          return;
        time++;
        ctx.clearRect(0, 0, W, H);
        if (opts.bgGradient) {
          const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.7);
          bg.addColorStop(0, "#0f1628");
          bg.addColorStop(0.5, "#0a0e17");
          bg.addColorStop(1, "#060810");
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, W, H);
        } else {
          ctx.fillStyle = opts.bgColor;
          ctx.fillRect(0, 0, W, H);
        }
        if (opts.showStars) {
          stars.forEach((s) => {
            const a = s.a + Math.sin(time * s.twinkle) * 0.15;
            ctx.beginPath();
            ctx.arc(cx + s.x, cy + s.y, s.r, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(180, 200, 255," + a + ")";
            ctx.fill();
          });
        }
        const baseR1 = Math.min(W, H) * opts.ring1Ratio * 0.5;
        const baseR2 = Math.min(W, H) * opts.ring2Ratio * 0.5;
        [baseR1, baseR2].forEach((r) => {
          ctx.beginPath();
          ctx.ellipse(cx, cy, r, r * opts.ellipseRatio, 0, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(50, 70, 100, 0.1)";
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 8]);
          ctx.stroke();
          ctx.setLineDash([]);
        });
        graphNodes.forEach((n) => {
          (n.deps || []).forEach((depId) => {
            const dep = graphNodes.find((d) => d.id === depId);
            if (!dep)
              return;
            const x1 = cx + n.x, y1 = cy + n.y;
            const x2 = cx + dep.x, y2 = cy + dep.y;
            const [r, g, b] = hexToRgb(n.color);
            const grad = ctx.createLinearGradient(x1, y1, x2, y2);
            grad.addColorStop(0, "rgba(" + r + "," + g + "," + b + ", 0.25)");
            grad.addColorStop(0.5, "rgba(" + r + "," + g + "," + b + ", 0.08)");
            grad.addColorStop(1, "rgba(100, 150, 200, 0.05)");
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - 20;
            ctx.quadraticCurveTo(mx, my, x2, y2);
            ctx.strokeStyle = grad;
            ctx.lineWidth = hoveredNode && (hoveredNode.id === n.id || hoveredNode.id === depId) ? 2 : 1;
            const bothHaveAsmdef = n.scripts > 0 && dep.scripts > 0;
            ctx.setLineDash(bothHaveAsmdef ? [] : [6, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
          });
        });
        particles.forEach((p) => {
          p.t += p.speed;
          if (p.t > 1)
            p.t = 0;
          const x1 = cx + p.from.x, y1 = cy + p.from.y;
          const x2 = cx + p.to.x, y2 = cy + p.to.y;
          const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - 20;
          const t = p.t, it = 1 - t;
          const px = it * it * x1 + 2 * it * t * mx + t * t * x2;
          const py = it * it * y1 + 2 * it * t * my + t * t * y2;
          const [r, g, b] = hexToRgb(p.color);
          const fadeAlpha = p.alpha * (t < 0.1 ? t / 0.1 : t > 0.9 ? (1 - t) / 0.1 : 1);
          ctx.beginPath();
          ctx.arc(px, py, p.size * 3, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(" + r + "," + g + "," + b + "," + fadeAlpha * 0.15 + ")";
          ctx.fill();
          ctx.beginPath();
          ctx.arc(px, py, p.size, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(" + r + "," + g + "," + b + "," + fadeAlpha + ")";
          ctx.fill();
        });
        graphNodes.forEach((n) => {
          const nx = cx + n.x, ny = cy + n.y;
          const [r, g, b] = hexToRgb(n.color);
          const isHovered = hoveredNode && hoveredNode.id === n.id;
          const isCore = n.ring === 0;
          const pulse = Math.sin(time * 0.03) * 0.15 + 0.85;
          const glowSize = isCore ? 60 : isHovered ? 45 : 30;
          const glowAlpha = isCore ? 0.15 * pulse : isHovered ? 0.2 : 0.08;
          const glow = ctx.createRadialGradient(nx, ny, 0, nx, ny, glowSize);
          glow.addColorStop(0, "rgba(" + r + "," + g + "," + b + "," + glowAlpha + ")");
          glow.addColorStop(1, "rgba(" + r + "," + g + "," + b + ", 0)");
          ctx.beginPath();
          ctx.arc(nx, ny, glowSize, 0, Math.PI * 2);
          ctx.fillStyle = glow;
          ctx.fill();
          const nodeRadius = isHovered ? n.radius + 4 : n.radius;
          ctx.beginPath();
          ctx.arc(nx, ny, nodeRadius, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(" + r + "," + g + "," + b + ", 0.12)";
          ctx.fill();
          ctx.strokeStyle = "rgba(" + r + "," + g + "," + b + "," + (isHovered ? 0.9 : 0.5) + ")";
          ctx.lineWidth = isCore ? 2 : 1.5;
          ctx.stroke();
          if (n.icon) {
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = (isCore ? "16px" : "13px") + ' "Segoe UI", system-ui, sans-serif';
            ctx.fillStyle = "rgba(" + r + "," + g + "," + b + "," + (isHovered ? 0.8 : 0.4) + ")";
            const iconMap = {
              "cpu": "\u2699",
              // ⚙ gear
              "person": "\u263A",
              // ☺ face
              "flame": "\u2604",
              // ☄ comet
              "archive": "\u2692",
              // ⚒ hammers
              "chat": "\u2709",
              // ✉ envelope
              "map": "\u2690",
              // ⚐ flag
              "globe": "\u2641",
              // ♁ earth
              "robot": "\u2318",
              // ⌘ command
              "database": "\u25A6",
              // ▦ grid
              "layout": "\u25A3",
              // ▣ square
              "wrench": "\u2692",
              // ⚒ hammers
              "beaker": "\u2697"
              // ⚗ alembic
            };
            const sym = iconMap[n.icon] || "\u25C6";
            ctx.fillText(sym, nx, ny - (isCore ? 14 : 10));
          }
          if (typeof n.health === "number") {
            const [hr, hg, hb] = healthColor(n.health);
            const healthAngle = n.health * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(nx, ny, nodeRadius + 4, -Math.PI / 2, -Math.PI / 2 + healthAngle);
            ctx.strokeStyle = "rgba(" + hr + "," + hg + "," + hb + "," + (isHovered ? 0.9 : 0.5) + ")";
            ctx.lineWidth = 2.5;
            ctx.lineCap = "round";
            ctx.stroke();
            ctx.lineCap = "butt";
            const dotAngle = -Math.PI / 2 + healthAngle;
            const dotX = nx + Math.cos(dotAngle) * (nodeRadius + 4);
            const dotY = ny + Math.sin(dotAngle) * (nodeRadius + 4);
            ctx.beginPath();
            ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(" + hr + "," + hg + "," + hb + ", 0.9)";
            ctx.fill();
          }
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.font = (isCore ? "bold 13px" : "bold 11px") + ' "Segoe UI", system-ui, sans-serif';
          ctx.fillStyle = "rgba(255, 255, 255," + (isHovered ? 1 : 0.85) + ")";
          const labelY = n.icon ? ny + 4 : ny - (isCore ? 4 : 3);
          ctx.fillText(n.name, nx, labelY);
          ctx.font = '9px "Segoe UI", system-ui, sans-serif';
          ctx.fillStyle = "rgba(150, 170, 200, " + (isHovered ? 0.8 : 0.4) + ")";
          const techLabel = (n.tech || "").replace("asmdef: ", "");
          const techY = n.icon ? ny + 16 : ny + (isCore ? 12 : 10);
          ctx.fillText(techLabel, nx, techY);
        });
        if (opts.showTitle) {
          ctx.textAlign = "left";
          ctx.textBaseline = "top";
          ctx.font = 'bold 14px "Segoe UI", system-ui, sans-serif';
          ctx.fillStyle = "rgba(200, 215, 235, 0.7)";
          ctx.fillText(opts.title, 12, 10);
        }
        if (opts.showSummary && allNodes.length > 0) {
          const totalBoundaries = allNodes.reduce((a, s) => a + (s.deps || []).length, 0);
          const violations = allNodes.reduce((a, s) => a + (s.violations || 0), 0);
          ctx.font = '10px "Segoe UI", system-ui, sans-serif';
          ctx.fillStyle = "rgba(100, 130, 170, 0.5)";
          ctx.textAlign = "left";
          ctx.textBaseline = "top";
          ctx.fillText("Sectors: " + allNodes.length + "  \xB7  Boundaries: " + totalBoundaries + "  \xB7  Violations: " + violations, 12, 28);
        }
        if (opts.showLegend) {
          const ly = H - 20;
          ctx.font = '10px "Segoe UI", system-ui, sans-serif';
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.beginPath();
          ctx.arc(14, ly, 4, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(34, 197, 94, 0.7)";
          ctx.fill();
          ctx.fillStyle = "rgba(100, 130, 170, 0.4)";
          ctx.fillText("Healthy", 24, ly);
          ctx.beginPath();
          ctx.arc(82, ly, 4, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(245, 158, 11, 0.7)";
          ctx.fill();
          ctx.fillStyle = "rgba(100, 130, 170, 0.4)";
          ctx.fillText("Warning", 92, ly);
          ctx.beginPath();
          ctx.arc(155, ly, 4, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(239, 68, 68, 0.7)";
          ctx.fill();
          ctx.fillStyle = "rgba(100, 130, 170, 0.4)";
          ctx.fillText("Critical", 165, ly);
        }
        animId = requestAnimationFrame(draw);
      }
      function setData(sectorNodes) {
        allNodes = sectorNodes || [];
        if (W === 0)
          resize();
        layoutNodes();
      }
      function start() {
        if (running)
          return;
        running = true;
        canvasEl.addEventListener("mousemove", onMouseMove);
        canvasEl.addEventListener("click", onMouseClick);
        canvasEl.addEventListener("mouseleave", onMouseLeave);
        draw();
      }
      function stop() {
        running = false;
        if (animId) {
          cancelAnimationFrame(animId);
          animId = null;
        }
        canvasEl.removeEventListener("mousemove", onMouseMove);
        canvasEl.removeEventListener("click", onMouseClick);
        canvasEl.removeEventListener("mouseleave", onMouseLeave);
      }
      function destroy() {
        stop();
        graphNodes = [];
        particles = [];
        stars = [];
        allNodes = [];
      }
      function onClick(cb) {
        clickCb = cb;
      }
      initStars();
      resize();
      const resizeObserver2 = new ResizeObserver(() => {
        resize();
      });
      resizeObserver2.observe(canvasEl.parentElement || canvasEl);
      return {
        setData,
        start,
        stop,
        destroy,
        onClick,
        resize,
        getNodes: () => graphNodes,
        getHovered: () => hoveredNode
      };
    }
    let sectorMapInstance = null;
    function initSectorMap2() {
      const canvas = document.getElementById("sectorMapCanvas");
      const tooltip = document.getElementById("sectorMapTooltip");
      if (!canvas)
        return;
      if (sectorMapInstance)
        return;
      sectorMapInstance = createOrbitalGraph2(canvas, tooltip, {
        title: "SECTOR MAP",
        centerId: "core"
      });
      sectorMapInstance.onClick((node) => {
        vscode2.postMessage({ type: "sectorMapClick", sectorId: node.id });
      });
      sectorMapInstance.start();
    }
    function renderSectorMap2(data) {
      if (!sectorMapInstance)
        initSectorMap2();
      if (!sectorMapInstance)
        return;
      const nodes = (data.sectors || []).map((s) => ({
        id: s.id,
        name: s.name,
        tech: s.tech || "asmdef: " + (s.asmdefName || s.id),
        color: s.color || "#6366f1",
        health: typeof s.health === "number" ? s.health : 1,
        deps: s.deps || s.dependencies || [],
        icon: s.icon || null,
        scripts: s.scripts || 0,
        violations: s.violations || 0,
        desc: s.desc || s.description || ""
      }));
      sectorMapInstance.setData(nodes);
    }
    function destroySectorMap2() {
      if (sectorMapInstance) {
        sectorMapInstance.destroy();
        sectorMapInstance = null;
      }
    }
    function resizeSectorMap2() {
      if (sectorMapInstance) {
        requestAnimationFrame(() => {
          sectorMapInstance.resize();
        });
      }
    }
    function requestSectorMapData2() {
      vscode2.postMessage({ type: "sectorMapData" });
    }
    function getDefaultSectorData2() {
      return [
        { id: "core", name: "CORE", tech: "asmdef: Core", color: "#6366f1", health: 1, deps: [], icon: "cpu", scripts: 0, violations: 0 },
        { id: "character", name: "HANGAR", tech: "asmdef: Character", color: "#22c55e", health: 1, deps: ["core"], icon: "person", scripts: 0, violations: 0 },
        { id: "combat", name: "ARMORY", tech: "asmdef: Combat", color: "#ef4444", health: 1, deps: ["core", "character", "inventory"], icon: "flame", scripts: 0, violations: 0 },
        { id: "inventory", name: "CARGO", tech: "asmdef: Inventory", color: "#f59e0b", health: 1, deps: ["core"], icon: "archive", scripts: 0, violations: 0 },
        { id: "dialogue", name: "COMMS", tech: "asmdef: Dialogue", color: "#8b5cf6", health: 1, deps: ["core", "quest"], icon: "chat", scripts: 0, violations: 0 },
        { id: "quest", name: "MISSIONS", tech: "asmdef: Quest", color: "#06b6d4", health: 1, deps: ["core", "inventory"], icon: "map", scripts: 0, violations: 0 },
        { id: "world", name: "NAVIGATION", tech: "asmdef: World", color: "#14b8a6", health: 1, deps: ["core"], icon: "globe", scripts: 0, violations: 0 },
        { id: "ai", name: "SENSORS", tech: "asmdef: AI", color: "#ec4899", health: 1, deps: ["core", "combat", "world"], icon: "robot", scripts: 0, violations: 0 },
        { id: "persistence", name: "QUARTERS", tech: "asmdef: Persistence", color: "#64748b", health: 1, deps: ["core"], icon: "database", scripts: 0, violations: 0 },
        { id: "ui", name: "BRIDGE-UI", tech: "asmdef: UI", color: "#a855f7", health: 1, deps: ["core"], icon: "layout", scripts: 0, violations: 0 },
        { id: "editor", name: "ENGINEERING", tech: "asmdef: Editor", color: "#78716c", health: 1, deps: [], icon: "wrench", scripts: 0, violations: 0 },
        { id: "yard", name: "YARD", tech: "asmdef: Sandbox", color: "#fbbf24", health: 1, deps: [], icon: "beaker", scripts: 0, violations: 0 }
      ];
    }
    let aiOrbitalInstance = null;
    function initAiOrbitalFlow2(canvasEl, tooltipEl) {
      if (aiOrbitalInstance)
        aiOrbitalInstance.destroy();
      aiOrbitalInstance = createOrbitalGraph2(canvasEl, tooltipEl, {
        title: "CONTEXT FLOW",
        centerId: "query",
        showLegend: false,
        showSummary: false,
        particleCount: 80,
        coreRadius: 32,
        ring1Radius: 22,
        ring2Radius: 18,
        ring1Ratio: 0.25,
        ring2Ratio: 0.4,
        ellipseRatio: 0.7
      });
      return aiOrbitalInstance;
    }
    return {
      // Orbital graph engine (reusable)
      createOrbitalGraph: createOrbitalGraph2,
      // Sector Map (Station panel)
      initSectorMap: initSectorMap2,
      renderSectorMap: renderSectorMap2,
      destroySectorMap: destroySectorMap2,
      resizeSectorMap: resizeSectorMap2,
      requestSectorMapData: requestSectorMapData2,
      getDefaultSectorData: getDefaultSectorData2,
      // AI Flow orbital mode
      initAiOrbitalFlow: initAiOrbitalFlow2
    };
  }

  // src/webview/panel/features/engineer.ts
  function createEngineerHandlers(deps) {
    const { vscode: vscode2, escapeHtml: escapeHtml2 } = deps;
    let _showAll = false;
    let _currentSuggestions = [];
    function engineerRenderStatus2(data) {
      const indicator = document.getElementById("engineerHealthIndicator");
      const statusText = document.getElementById("engineerStatusText");
      const topAction = document.getElementById("engineerTopAction");
      const alertBadge = document.getElementById("engineerAlertBadge");
      const healthBig = document.getElementById("engineerHealthBig");
      const warningCount = document.getElementById("engineerWarningCount");
      if (indicator) {
        indicator.className = "engineer-health-indicator " + (data.health || "ok");
      }
      const healthLabels = { ok: "Healthy", warn: "Warning", critical: "Critical" };
      if (statusText)
        statusText.textContent = healthLabels[data.health] || "Unknown";
      if (topAction)
        topAction.textContent = data.topAction || "No pending actions";
      if (alertBadge) {
        if (data.alertCount > 0) {
          alertBadge.style.display = "inline-block";
          alertBadge.textContent = String(data.alertCount);
        } else {
          alertBadge.style.display = "none";
        }
      }
      if (healthBig) {
        healthBig.className = "engineer-health-big " + (data.health || "ok");
        healthBig.textContent = healthLabels[data.health] || "Unknown";
      }
      if (warningCount) {
        warningCount.textContent = data.alertCount > 0 ? `${data.alertCount} alert${data.alertCount > 1 ? "s" : ""}` : "No alerts";
      }
    }
    function engineerRenderSuggestions2(suggestions) {
      _currentSuggestions = suggestions || [];
      const list = document.getElementById("engineerSuggestionsList");
      const empty = document.getElementById("engineerSuggestionsEmpty");
      const warningList = document.getElementById("engineerWarningList");
      const visible = _showAll ? _currentSuggestions : _currentSuggestions.filter((s) => s.score >= 5);
      if (!list)
        return;
      if (visible.length === 0) {
        list.innerHTML = "";
        if (empty)
          empty.style.display = "block";
        if (warningList)
          warningList.innerHTML = "";
        return;
      }
      if (empty)
        empty.style.display = "none";
      if (warningList) {
        const warnings = visible.filter((s) => s.risk !== "low");
        if (warnings.length > 0) {
          warningList.innerHTML = warnings.slice(0, 3).map(
            (s) => `<div style="margin-bottom:2px;">- ${escapeHtml2(s.title)}</div>`
          ).join("");
        } else {
          warningList.innerHTML = '<div style="color:var(--text-secondary);">No warnings.</div>';
        }
      }
      list.innerHTML = visible.map((s, i) => {
        const riskColors = { low: "#22c55e", med: "#f59e0b", high: "#ef4444" };
        const riskColor = riskColors[s.risk] || "#6b7280";
        const sourceLabel = s.source === "ai" ? '<span style="color:#8b5cf6; font-size:9px; margin-left:4px;">[AI]</span>' : "";
        const sectorLabel = s.sectorId ? `<span style="color:var(--text-secondary); font-size:9px; margin-left:4px;">${escapeHtml2(s.sectorId)}</span>` : "";
        return `
        <div class="engineer-suggestion-card" data-suggestion-id="${escapeHtml2(s.id)}">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div style="flex:1;">
              <div style="font-size:11px; font-weight:600; color:var(--text-primary);">
                ${i + 1}) ${escapeHtml2(s.title)}${sourceLabel}${sectorLabel}
              </div>
              <div style="font-size:10px; color:var(--text-secondary); margin-top:2px;">
                ${escapeHtml2(s.why)}
              </div>
              <div style="display:flex; gap:8px; font-size:9px; margin-top:4px; color:var(--text-secondary);">
                <span style="color:${riskColor};">Risk: ${s.risk}</span>
                <span>Confidence: ${s.confidence}</span>
                <span>Source: ${s.source}</span>
              </div>
            </div>
            <div style="font-size:11px; font-weight:700; color:var(--text-primary); min-width:36px; text-align:right;">
              ${s.score}
            </div>
          </div>
          <div style="display:flex; gap:4px; margin-top:6px;">
            ${s.actionType === "validate" ? `<button class="btn-primary engineer-action-btn" onclick="engineerAction('${escapeHtml2(s.id)}', 'run')" style="padding:3px 8px; font-size:10px;">Run</button>` : ""}
            <button class="btn-secondary engineer-action-btn" onclick="engineerAction('${escapeHtml2(s.id)}', 'open')" style="padding:3px 8px; font-size:10px;">Open</button>
            <button class="btn-secondary engineer-action-btn" onclick="engineerAction('${escapeHtml2(s.id)}', 'defer')" style="padding:3px 8px; font-size:10px;">Defer</button>
            <button class="btn-secondary engineer-action-btn" onclick="engineerAction('${escapeHtml2(s.id)}', 'dismiss')" style="padding:3px 8px; font-size:10px;">Dismiss</button>
          </div>
        </div>
      `;
      }).join("");
    }
    function engineerRenderHistory2(history) {
      const list = document.getElementById("engineerHistoryList");
      if (!list)
        return;
      if (!history || history.length === 0) {
        list.innerHTML = '<div style="font-size:10px; color:var(--text-secondary); text-align:center; padding:8px;">No history yet.</div>';
        return;
      }
      const decisionIcons = { accepted: "\u2705", deferred: "\u23F8", dismissed: "\u274C" };
      const decisionColors = { accepted: "#22c55e", deferred: "#f59e0b", dismissed: "#6b7280" };
      list.innerHTML = history.slice(0, 20).map((h) => {
        const time = new Date(h.decidedAt);
        const timeStr = time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const icon = decisionIcons[h.decision] || "\u2022";
        const color = decisionColors[h.decision] || "var(--text-secondary)";
        return `<div class="engineer-history-row">
        <span style="color:${color};">${icon}</span>
        <span style="font-size:10px; color:var(--text-primary); flex:1;">${escapeHtml2(h.title)}</span>
        <span style="font-size:9px; color:var(--text-secondary);">${timeStr}</span>
      </div>`;
      }).join("");
    }
    function engineerRenderPrompt2(data) {
      const bar = document.getElementById("engineerPromptBar");
      const text = document.getElementById("engineerPromptText");
      const actions = document.getElementById("engineerPromptActions");
      if (!bar || !text || !actions)
        return;
      text.textContent = data.message;
      actions.innerHTML = (data.actions || []).map((a) => {
        const action = a.toLowerCase() === "dismiss" ? "dismiss" : "open";
        const sid = data.suggestionId || "";
        return `<button class="btn-secondary" onclick="engineerPromptAction('${escapeHtml2(sid)}', '${action}')" style="padding:2px 8px; font-size:10px;">${escapeHtml2(a)}</button>`;
      }).join("");
      bar.style.display = "flex";
    }
    function engineerDismissPrompt2() {
      const bar = document.getElementById("engineerPromptBar");
      if (bar)
        bar.style.display = "none";
    }
    function engineerToggleShowAll2(showAll) {
      _showAll = showAll;
      engineerRenderSuggestions2(_currentSuggestions);
    }
    function engineerAction2(suggestionId, action) {
      vscode2.postMessage({ type: "engineerAction", suggestionId, action });
    }
    function engineerRefresh2() {
      vscode2.postMessage({ type: "engineerRefresh" });
    }
    function engineerDelegate2(role) {
      vscode2.postMessage({ type: "engineerDelegate", role });
    }
    function engineerRequestHistory2() {
      vscode2.postMessage({ type: "engineerHistory" });
    }
    function engineerPromptAction2(suggestionId, action) {
      if (action === "dismiss") {
        engineerDismissPrompt2();
        if (suggestionId) {
          vscode2.postMessage({ type: "engineerAction", suggestionId, action: "dismiss" });
        }
      } else {
        engineerDismissPrompt2();
        if (suggestionId) {
          vscode2.postMessage({ type: "engineerAction", suggestionId, action: "open" });
        }
      }
    }
    function engineerHandleDelegated2(data) {
      const roleNames = {
        "architect": "Architect",
        "modularity-lead": "Modularity Lead",
        "verifier": "Verifier",
        "doc-officer": "Doc Officer",
        "planner": "Planner",
        "release-captain": "Release Captain"
      };
      const roleName = roleNames[data.role] || data.role;
      let indicator = document.getElementById("delegatedRoleIndicator");
      if (!indicator) {
        indicator = document.createElement("div");
        indicator.id = "delegatedRoleIndicator";
        indicator.style.cssText = "padding:4px 8px; font-size:10px; background:rgba(168,85,247,0.12); border:1px solid rgba(168,85,247,0.3); border-radius:4px; display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;";
        const inputArea = document.getElementById("chatInputContainer") || document.getElementById("chatInput")?.parentElement;
        if (inputArea)
          inputArea.prepend(indicator);
      }
      indicator.innerHTML = `<span>Delegated to: <strong>${roleName}</strong></span><button onclick="this.parentElement.remove();" style="background:none; border:none; color:var(--text-secondary); cursor:pointer; font-size:12px;">x</button>`;
      const chatTab = document.querySelector('[data-tab="chat"]');
      if (chatTab)
        chatTab.click();
      const chatInput = document.getElementById("chatInput");
      if (chatInput) {
        chatInput.value = data.prompt;
        chatInput.dispatchEvent(new Event("input"));
        chatInput.focus();
      }
    }
    function engineerCheckSectors2(suggestions) {
      const hint = document.getElementById("engineerNoSectors");
      if (!hint)
        return;
      const hasSectorSuggestions = suggestions.some((s) => s.sectorId);
      const sectorsEmpty = !hasSectorSuggestions && suggestions.length <= 1;
      hint.style.display = sectorsEmpty ? "block" : "none";
    }
    return {
      engineerRenderStatus: engineerRenderStatus2,
      engineerRenderSuggestions: engineerRenderSuggestions2,
      engineerRenderHistory: engineerRenderHistory2,
      engineerRenderPrompt: engineerRenderPrompt2,
      engineerDismissPrompt: engineerDismissPrompt2,
      engineerToggleShowAll: engineerToggleShowAll2,
      engineerAction: engineerAction2,
      engineerRefresh: engineerRefresh2,
      engineerDelegate: engineerDelegate2,
      engineerRequestHistory: engineerRequestHistory2,
      engineerPromptAction: engineerPromptAction2,
      engineerHandleDelegated: engineerHandleDelegated2,
      engineerCheckSectors: engineerCheckSectors2
    };
  }

  // src/webview/panel/features/autopilot.ts
  function createAutopilotHandlers(deps) {
    const { vscode: vscode2 } = deps;
    let _currentStatus = null;
    function autopilotRenderStatus2(data) {
      _currentStatus = data;
      const bar = document.getElementById("autopilotControlBar");
      const statusText = document.getElementById("autopilotStatusText");
      const stepCounter = document.getElementById("autopilotStepCounter");
      const agentLabel = document.getElementById("autopilotAgentLabel");
      const pauseBtn = document.getElementById("autopilotPauseBtn");
      const resumeBtn = document.getElementById("autopilotResumeBtn");
      const abortBtn = document.getElementById("autopilotAbortBtn");
      const progressBar = document.getElementById("autopilotProgressFill");
      const errorText = document.getElementById("autopilotErrorText");
      if (!bar)
        return;
      const isActive = data.status !== "idle";
      bar.style.display = isActive ? "flex" : "none";
      const statusLabels = {
        idle: "Idle",
        running: "Running",
        pausing: "Pausing...",
        paused: "Paused",
        stopping: "Stopping...",
        completed: "Completed",
        failed: "Failed"
      };
      if (statusText) {
        statusText.textContent = statusLabels[data.status] || data.status;
        statusText.className = "autopilot-status-label " + (data.status || "idle");
      }
      if (stepCounter) {
        const total = data.totalSteps || 0;
        const done = (data.completedSteps || 0) + (data.failedSteps || 0) + (data.skippedSteps || 0);
        stepCounter.textContent = `${done}/${total} steps`;
      }
      if (agentLabel) {
        const agentNames = {
          "claude-cli": "Claude CLI",
          "claude-api": "Claude API",
          "gpt-api": "GPT"
        };
        const name = agentNames[data.activeAgent] || data.activeAgent;
        agentLabel.textContent = data.usingFallback ? `${name} (fallback)` : name;
        agentLabel.style.color = data.usingFallback ? "#f59e0b" : "var(--text-secondary)";
      }
      if (pauseBtn)
        pauseBtn.style.display = data.status === "running" ? "inline-block" : "none";
      if (resumeBtn)
        resumeBtn.style.display = data.status === "paused" ? "inline-block" : "none";
      if (abortBtn)
        abortBtn.style.display = data.status === "running" || data.status === "paused" ? "inline-block" : "none";
      if (progressBar && data.totalSteps > 0) {
        const pct = (data.completedSteps + data.failedSteps + data.skippedSteps) / data.totalSteps * 100;
        progressBar.style.width = `${pct}%`;
        progressBar.className = "autopilot-progress-fill " + (data.failedSteps > 0 ? "has-errors" : "");
      }
      if (errorText) {
        if (data.error) {
          errorText.textContent = data.error;
          errorText.style.display = "block";
        } else {
          errorText.style.display = "none";
        }
      }
    }
    function autopilotRenderStepResult2(result) {
      const list = document.getElementById("autopilotStepList");
      if (!list || !result)
        return;
      const statusIcon = result.skipped ? "\u23ED" : result.success ? "\u2705" : "\u274C";
      const agentBadge = result.wasFallback ? ' <span style="color:#f59e0b;">[fallback]</span>' : "";
      const retryBadge = result.retries > 0 ? ` <span style="color:var(--text-secondary);">(${result.retries} retries)</span>` : "";
      const row = document.createElement("div");
      row.className = "autopilot-step-row";
      row.innerHTML = `
      <span>${statusIcon}</span>
      <span style="flex:1; font-size:10px;">${result.stepId}${agentBadge}${retryBadge}</span>
      <span style="font-size:9px; color:var(--text-secondary);">${((result.endTime - result.startTime) / 1e3).toFixed(1)}s</span>
    `;
      list.prepend(row);
    }
    function autopilotRenderSessionPrompt2(data) {
      const prompt2 = document.getElementById("autopilotSessionPrompt");
      if (!prompt2)
        return;
      if (data.hasSession && data.sessionInfo) {
        const info = data.sessionInfo;
        const timeAgo = getTimeAgo(info.savedAt);
        prompt2.innerHTML = `
        <div style="font-size:10px; color:var(--text-secondary); margin-bottom:4px;">
          Interrupted session found: ${info.completedSteps}/${info.totalSteps} steps completed (${timeAgo})
        </div>
        <div style="display:flex; gap:4px;">
          <button class="btn-primary" onclick="autopilotResumeSession()" style="padding:3px 8px; font-size:10px;">Resume</button>
          <button class="btn-secondary" onclick="autopilotClearSession()" style="padding:3px 8px; font-size:10px;">Discard</button>
        </div>
      `;
        prompt2.style.display = "block";
      } else {
        prompt2.style.display = "none";
      }
    }
    function autopilotRenderConfig2(config) {
      const strategySelect = document.getElementById("autopilotStrategySelect");
      const retryInput = document.getElementById("autopilotRetryInput");
      const delayInput = document.getElementById("autopilotDelayInput");
      if (strategySelect)
        strategySelect.value = config.errorStrategy || "retry";
      if (retryInput)
        retryInput.value = String(config.maxRetries || 3);
      if (delayInput)
        delayInput.value = String(config.stepDelayMs || 500);
    }
    function autopilotPause2() {
      vscode2.postMessage({ type: "autopilotPause" });
    }
    function autopilotResume2() {
      vscode2.postMessage({ type: "autopilotResume" });
    }
    function autopilotAbort2() {
      vscode2.postMessage({ type: "autopilotAbort" });
    }
    function autopilotRequestStatus2() {
      vscode2.postMessage({ type: "autopilotStatus" });
    }
    function autopilotCheckSession2() {
      vscode2.postMessage({ type: "autopilotCheckSession" });
    }
    function autopilotResumeSession2() {
      vscode2.postMessage({ type: "autopilotResumeSession" });
    }
    function autopilotClearSession2() {
      vscode2.postMessage({ type: "autopilotClearSession" });
      const prompt2 = document.getElementById("autopilotSessionPrompt");
      if (prompt2)
        prompt2.style.display = "none";
    }
    function autopilotUpdateConfig2() {
      const strategySelect = document.getElementById("autopilotStrategySelect");
      const retryInput = document.getElementById("autopilotRetryInput");
      const delayInput = document.getElementById("autopilotDelayInput");
      const config = {};
      if (strategySelect)
        config.errorStrategy = strategySelect.value;
      if (retryInput)
        config.maxRetries = parseInt(retryInput.value) || 3;
      if (delayInput)
        config.stepDelayMs = parseInt(delayInput.value) || 500;
      vscode2.postMessage({ type: "autopilotConfig", config });
    }
    function getTimeAgo(timestamp) {
      const diff = Date.now() - timestamp;
      const mins = Math.floor(diff / 6e4);
      if (mins < 1)
        return "just now";
      if (mins < 60)
        return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24)
        return `${hrs}h ago`;
      return `${Math.floor(hrs / 24)}d ago`;
    }
    return {
      autopilotRenderStatus: autopilotRenderStatus2,
      autopilotRenderStepResult: autopilotRenderStepResult2,
      autopilotRenderSessionPrompt: autopilotRenderSessionPrompt2,
      autopilotRenderConfig: autopilotRenderConfig2,
      autopilotPause: autopilotPause2,
      autopilotResume: autopilotResume2,
      autopilotAbort: autopilotAbort2,
      autopilotRequestStatus: autopilotRequestStatus2,
      autopilotCheckSession: autopilotCheckSession2,
      autopilotResumeSession: autopilotResumeSession2,
      autopilotClearSession: autopilotClearSession2,
      autopilotUpdateConfig: autopilotUpdateConfig2
    };
  }

  // src/webview/panel/features/gameui.ts
  function createGameUIHandlers(deps) {
    const { vscode: vscode2 } = deps;
    let _currentState = null;
    let _catalog = [];
    function gameuiRenderState2(data) {
      _currentState = data.state;
      const summary = data.summary;
      if (!summary)
        return;
      const statusEl = document.getElementById("gameuiStatus");
      const progressEl = document.getElementById("gameuiProgressFill");
      const statsEl = document.getElementById("gameuiStats");
      const phaseEl = document.getElementById("gameuiCurrentPhase");
      if (statusEl) {
        statusEl.textContent = _currentState?.isRunning ? "Running" : "Idle";
        statusEl.className = "gameui-status " + (_currentState?.isRunning ? "running" : "idle");
      }
      if (progressEl) {
        const pct = summary.total > 0 ? (summary.total - summary.planned) / summary.total * 100 : 0;
        progressEl.style.width = `${pct}%`;
      }
      if (statsEl) {
        statsEl.innerHTML = `
        <span title="Planned">${summary.planned} planned</span>
        <span title="Placeholder">${summary.placeholder} placed</span>
        <span title="Verified">${summary.verified} verified</span>
        <span title="Complete">${summary.complete} done</span>
        ${summary.errors > 0 ? `<span style="color:var(--error-text);">${summary.errors} errors</span>` : ""}
      `;
      }
      if (phaseEl && _currentState) {
        const phaseLabels = {
          "theme": "Theme Setup",
          "primitives": "Primitives",
          "system-screens": "System Screens",
          "menu": "Main Menu",
          "hud": "HUD Elements",
          "panels": "Panels",
          "dialogs-map": "Dialogs & Map",
          "art-replacement": "Art Replacement"
        };
        phaseEl.textContent = phaseLabels[_currentState.phase] || _currentState.phase;
      }
      gameuiRenderCategoryBreakdown(summary.byCategory);
    }
    function gameuiRenderCategoryBreakdown(byCategory) {
      const container = document.getElementById("gameuiCategoryBreakdown");
      if (!container || !byCategory)
        return;
      const categoryColors = {
        primitive: "#64748B",
        system: "#3B82F6",
        menu: "#8B5CF6",
        hud: "#22C55E",
        inventory: "#F59E0B",
        character: "#F59E0B",
        social: "#F59E0B",
        shop: "#F59E0B",
        dialog: "#EF4444",
        map: "#6B7280"
      };
      container.innerHTML = "";
      for (const [cat, info] of Object.entries(byCategory)) {
        const chip = document.createElement("div");
        chip.className = "gameui-category-chip";
        const color = categoryColors[cat] || "#64748B";
        chip.innerHTML = `
        <span style="width:8px; height:8px; border-radius:50%; background:${color}; display:inline-block;"></span>
        <span style="font-size:9px; text-transform:capitalize;">${cat}</span>
        <span style="font-size:9px; color:var(--text-secondary);">${info.done}/${info.total}</span>
      `;
        chip.onclick = () => gameuiFilterCategory2(cat);
        container.appendChild(chip);
      }
    }
    function gameuiRenderCatalog2(data) {
      _catalog = data.components || [];
      const list = document.getElementById("gameuiComponentList");
      if (!list)
        return;
      list.innerHTML = "";
      const statusIcons = {
        planned: "\u23F3",
        placeholder: "\u{1F7E6}",
        verified: "\u2705",
        "art-generated": "\u{1F3A8}",
        "art-swapped": "\u{1F504}",
        complete: "\u2B50"
      };
      for (const comp of _catalog) {
        const row = document.createElement("div");
        row.className = "gameui-component-row";
        row.innerHTML = `
        <span style="font-size:10px;">${statusIcons[comp.status] || "\u23F3"}</span>
        <span style="font-size:10px; font-weight:600; width:60px;">${comp.id}</span>
        <span style="font-size:10px; flex:1;">${comp.name}</span>
        <span style="font-size:9px; color:var(--text-secondary); text-transform:capitalize;">${comp.status}</span>
        ${comp.status === "planned" ? `<button class="btn-secondary" onclick="gameuiGenerateComponent('${comp.id}')" style="padding:2px 6px; font-size:9px;">Generate</button>` : ""}
      `;
        list.appendChild(row);
      }
    }
    function gameuiRenderEvent2(event) {
      const feed = document.getElementById("gameuiEventFeed");
      if (!feed || !event)
        return;
      const typeColors = {
        "started": "var(--accent-color)",
        "phase-start": "#8B5CF6",
        "phase-complete": "#22C55E",
        "component-start": "var(--text-secondary)",
        "component-complete": "#22C55E",
        "component-error": "var(--error-text)",
        "complete": "#22C55E",
        "error": "var(--error-text)",
        "stopped": "#F59E0B"
      };
      const row = document.createElement("div");
      row.style.cssText = "font-size:9px; padding:2px 0; border-bottom:1px solid rgba(255,255,255,0.05);";
      const color = typeColors[event.type] || "var(--text-secondary)";
      const time = new Date(event.timestamp).toLocaleTimeString();
      row.innerHTML = `<span style="color:${color};">[${event.type}]</span> ${event.componentId || ""} ${event.message || ""} <span style="color:var(--text-secondary);">${time}</span>`;
      feed.prepend(row);
      while (feed.children.length > 50) {
        feed.removeChild(feed.lastChild);
      }
    }
    function gameuiRenderThemes2(data) {
      const list = document.getElementById("gameuiThemeList");
      if (!list)
        return;
      list.innerHTML = "";
      for (const theme of data.themes || []) {
        const row = document.createElement("div");
        row.className = "gameui-theme-row" + (theme.isActive ? " active" : "");
        row.innerHTML = `
        <span style="font-size:10px; font-weight:600;">${theme.name}</span>
        <span style="font-size:9px; color:var(--text-secondary);">${theme.variables?.length || 0} vars</span>
        ${theme.isActive ? '<span style="font-size:9px; color:var(--accent-color);">Active</span>' : `<button class="btn-secondary" onclick="gameuiSetActiveTheme('${theme.id}')" style="padding:2px 6px; font-size:9px;">Use</button>`}
      `;
        list.appendChild(row);
      }
    }
    function gameuiRequestState2() {
      vscode2.postMessage({ type: "gameuiGetState" });
    }
    function gameuiRequestCatalog2(category) {
      vscode2.postMessage({ type: "gameuiGetCatalog", category: category || null });
    }
    function gameuiFilterCategory2(category) {
      gameuiRequestCatalog2(category);
    }
    function gameuiGenerateComponent2(componentId) {
      vscode2.postMessage({ type: "gameuiGenerateComponent", componentId });
    }
    function gameuiRunPhase2(phase) {
      vscode2.postMessage({ type: "gameuiRunPhase", phase });
    }
    function gameuiRunAll2() {
      vscode2.postMessage({ type: "gameuiRunAll" });
    }
    function gameuiStop2() {
      vscode2.postMessage({ type: "gameuiStop" });
    }
    function gameuiRequestThemes2() {
      vscode2.postMessage({ type: "gameuiGetThemes" });
    }
    function gameuiSetActiveTheme2(themeId) {
      vscode2.postMessage({ type: "gameuiSetTheme", activeThemeId: themeId });
    }
    function gameuiGenerateThemeUSS2() {
      vscode2.postMessage({ type: "gameuiGenerateThemeUSS" });
    }
    function gameuiSaveState2() {
      vscode2.postMessage({ type: "gameuiSaveState" });
    }
    function gameuiLoadState2() {
      vscode2.postMessage({ type: "gameuiLoadState" });
    }
    return {
      gameuiRenderState: gameuiRenderState2,
      gameuiRenderCatalog: gameuiRenderCatalog2,
      gameuiRenderEvent: gameuiRenderEvent2,
      gameuiRenderThemes: gameuiRenderThemes2,
      gameuiRequestState: gameuiRequestState2,
      gameuiRequestCatalog: gameuiRequestCatalog2,
      gameuiFilterCategory: gameuiFilterCategory2,
      gameuiGenerateComponent: gameuiGenerateComponent2,
      gameuiRunPhase: gameuiRunPhase2,
      gameuiRunAll: gameuiRunAll2,
      gameuiStop: gameuiStop2,
      gameuiRequestThemes: gameuiRequestThemes2,
      gameuiSetActiveTheme: gameuiSetActiveTheme2,
      gameuiGenerateThemeUSS: gameuiGenerateThemeUSS2,
      gameuiSaveState: gameuiSaveState2,
      gameuiLoadState: gameuiLoadState2
    };
  }

  // src/webview/panel/features/db.ts
  var PROVIDER_ICONS = {
    supabase: "S",
    firebase: "F",
    postgresql: "P",
    mysql: "M",
    sqlite: "L",
    mongodb: "D"
  };
  var STATUS_COLORS = {
    connected: "#10b981",
    connecting: "#f59e0b",
    disconnected: "#666",
    error: "#ef4444"
  };
  function createDbHandlers(deps) {
    const { vscode: vscode2 } = deps;
    function dbRenderConnectionList2(msg2) {
      const listEl = document.getElementById("dbConnectionList");
      if (!listEl)
        return;
      const connections = msg2.connections || [];
      const activeId = msg2.activeConnectionId;
      if (connections.length === 0) {
        listEl.innerHTML = '<div style="color:var(--text-secondary); font-size:11px; padding:4px;">No external databases connected.</div>';
        return;
      }
      listEl.innerHTML = connections.map((c) => {
        const icon = PROVIDER_ICONS[c.provider] || "?";
        const statusColor = STATUS_COLORS[c.status] || "#666";
        const isActive = c.id === activeId;
        const border = isActive ? "border:1px solid var(--accent-color);" : "border:1px solid var(--border-color);";
        return `<div style="padding:6px 8px; background:var(--bg-primary); border-radius:4px; margin-bottom:4px; ${border}">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-weight:700; font-size:12px; color:var(--accent-color); width:16px; text-align:center;">${icon}</span>
            <span style="font-size:11px; font-weight:500;">${c.name || c.id}</span>
            <span style="font-size:9px; color:${statusColor};">\u25CF ${c.status}</span>
          </div>
          <div style="display:flex; gap:4px;">
            ${!isActive ? `<button class="btn-secondary" onclick="dbSetActive('${c.id}')" style="padding:1px 6px; font-size:9px;">Use</button>` : '<span style="font-size:9px; color:var(--accent-color);">Active</span>'}
            <button class="btn-secondary" onclick="dbTestConnection('${c.id}')" style="padding:1px 6px; font-size:9px;">Test</button>
            <button class="btn-secondary" onclick="dbRemoveConnection('${c.id}')" style="padding:1px 6px; font-size:9px;">\u2715</button>
          </div>
        </div>
        <div style="font-size:9px; color:var(--text-secondary); margin-top:2px;">
          ${c.host ? c.host + (c.port ? ":" + c.port : "") : ""} ${c.database ? "/ " + c.database : ""} ${c.filePath || ""}
        </div>
        ${c.error ? `<div style="font-size:9px; color:#ef4444; margin-top:2px;">${c.error}</div>` : ""}
      </div>`;
      }).join("");
    }
    function dbRenderSchema2(msg2) {
      const schema = msg2.schema;
      if (!schema || !schema.tables)
        return;
      const listEl = document.getElementById("dbConnectionList");
      if (!listEl)
        return;
      let schemaEl = document.getElementById("dbSchemaView");
      if (!schemaEl) {
        schemaEl = document.createElement("div");
        schemaEl.id = "dbSchemaView";
        schemaEl.style.cssText = "margin-top:8px; border-top:1px solid var(--border-color); padding-top:8px;";
        listEl.parentElement?.appendChild(schemaEl);
      }
      if (schema.tables.length === 0) {
        schemaEl.innerHTML = '<div style="color:var(--text-secondary); font-size:11px;">No tables found.</div>';
        return;
      }
      schemaEl.innerHTML = `
      <div style="font-size:10px; font-weight:600; color:var(--text-secondary); margin-bottom:4px;">Schema (${schema.tables.length} tables)</div>
      ${schema.tables.map((t) => `
        <details style="margin-bottom:3px;">
          <summary style="cursor:pointer; font-size:11px; padding:2px 4px; background:var(--bg-primary); border-radius:3px;">
            <strong>${t.name}</strong>
            <span style="color:var(--text-secondary); font-size:9px;">${t.columns?.length || 0} cols${t.rowCount != null ? ", ~" + t.rowCount + " rows" : ""}</span>
          </summary>
          <div style="padding:4px 8px; font-size:10px;">
            ${(t.columns || []).map((col) => `
              <div style="display:flex; gap:6px; padding:1px 0; color:var(--text-primary);">
                <span style="width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${col.primaryKey ? "\u{1F511} " : ""}${col.name}</span>
                <span style="color:var(--text-secondary); width:80px;">${col.type}</span>
                <span style="color:var(--text-secondary);">${col.nullable ? "NULL" : "NOT NULL"}</span>
              </div>
            `).join("")}
          </div>
        </details>
      `).join("")}
    `;
    }
    function dbRenderQueryResult2(msg2) {
      const result = msg2.result;
      if (!result)
        return;
      let resultEl = document.getElementById("dbQueryResultView");
      if (!resultEl) {
        const listEl = document.getElementById("dbConnectionList");
        if (!listEl)
          return;
        resultEl = document.createElement("div");
        resultEl.id = "dbQueryResultView";
        resultEl.style.cssText = "margin-top:8px; border-top:1px solid var(--border-color); padding-top:8px;";
        listEl.parentElement?.appendChild(resultEl);
      }
      if (result.error) {
        resultEl.innerHTML = `<div style="color:#ef4444; font-size:11px; padding:4px;">Error: ${result.error}</div>`;
        return;
      }
      const cols = result.columns || [];
      const rows = result.rows || [];
      resultEl.innerHTML = `
      <div style="font-size:10px; color:var(--text-secondary); margin-bottom:4px;">${rows.length} row(s) in ${result.executionTime || 0}ms</div>
      <div style="overflow-x:auto; max-height:200px; overflow-y:auto;">
        <table style="width:100%; font-size:10px; border-collapse:collapse;">
          <thead>
            <tr>${cols.map((c) => `<th style="text-align:left; padding:2px 6px; border-bottom:1px solid var(--border-color); color:var(--text-secondary);">${c}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${rows.slice(0, 100).map((row) => `
              <tr>${cols.map((c) => `<td style="padding:2px 6px; border-bottom:1px solid var(--bg-tertiary); max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${row[c] ?? ""}</td>`).join("")}</tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
    }
    function dbRenderTestResult2(msg2) {
      const connId = msg2.connectionId;
      if (!connId)
        return;
      if (msg2.connections) {
        dbRenderConnectionList2({ connections: msg2.connections, activeConnectionId: msg2.activeConnectionId });
      }
    }
    function dbShowConnectionWizard2() {
      const wizard = document.getElementById("dbConnectionWizard");
      if (wizard)
        wizard.style.display = "block";
    }
    function dbAddConnection2() {
      const provider = document.getElementById("dbProviderSelect")?.value || "postgresql";
      const name = document.getElementById("dbConnNameInput")?.value?.trim();
      const host = document.getElementById("dbHostInput")?.value?.trim();
      const database = document.getElementById("dbNameInput")?.value?.trim();
      if (!name)
        return;
      vscode2.postMessage({
        type: "dbAddConnection",
        connection: {
          name,
          provider,
          host: host || "localhost",
          database: database || ""
        }
      });
      const wizard = document.getElementById("dbConnectionWizard");
      if (wizard)
        wizard.style.display = "none";
      const nameInput = document.getElementById("dbConnNameInput");
      if (nameInput)
        nameInput.value = "";
      const hostInput = document.getElementById("dbHostInput");
      if (hostInput)
        hostInput.value = "";
      const dbInput = document.getElementById("dbNameInput");
      if (dbInput)
        dbInput.value = "";
    }
    function dbRemoveConnection2(connectionId) {
      vscode2.postMessage({ type: "dbRemoveConnection", connectionId });
    }
    function dbTestConnection2(connectionId) {
      vscode2.postMessage({ type: "dbTestConnection", connectionId });
    }
    function dbSetActive2(connectionId) {
      vscode2.postMessage({ type: "dbSetActive", connectionId });
    }
    function dbGetSchema2() {
      vscode2.postMessage({ type: "dbGetSchema" });
    }
    function dbRequestState2() {
      vscode2.postMessage({ type: "dbGetState" });
    }
    return {
      // Render functions (called from messageRouter)
      dbRenderConnectionList: dbRenderConnectionList2,
      dbRenderSchema: dbRenderSchema2,
      dbRenderQueryResult: dbRenderQueryResult2,
      dbRenderTestResult: dbRenderTestResult2,
      // Action functions (exposed as globals)
      dbShowConnectionWizard: dbShowConnectionWizard2,
      dbAddConnection: dbAddConnection2,
      dbRemoveConnection: dbRemoveConnection2,
      dbTestConnection: dbTestConnection2,
      dbSetActive: dbSetActive2,
      dbGetSchema: dbGetSchema2,
      dbRequestState: dbRequestState2
    };
  }

  // src/webview/panel/features/chatSearch.ts
  function createChatSearchHandlers(deps) {
    const { vscode: vscode2, escapeHtml: escapeHtml2 } = deps;
    let searchTimeout = null;
    let lastQuery = "";
    function chatSearchToggle2() {
      const bar = document.getElementById("chatSearchBar");
      const input = document.getElementById("chatSearchInput");
      if (!bar)
        return;
      const visible = bar.style.display !== "none";
      bar.style.display = visible ? "none" : "block";
      if (!visible && input) {
        input.focus();
        input.value = "";
      } else {
        const results = document.getElementById("chatSearchResults");
        if (results)
          results.style.display = "none";
      }
    }
    function chatSearchInput2(value) {
      if (searchTimeout)
        clearTimeout(searchTimeout);
      const query = (value || "").trim();
      if (query.length < 2) {
        const results = document.getElementById("chatSearchResults");
        if (results)
          results.style.display = "none";
        return;
      }
      searchTimeout = setTimeout(() => {
        lastQuery = query;
        vscode2.postMessage({ type: "memorySearch", query, limit: 20 });
      }, 300);
    }
    function chatSearchRenderResults2(msg2) {
      const resultsEl = document.getElementById("chatSearchResults");
      if (!resultsEl)
        return;
      const results = msg2.results || [];
      const query = msg2.query || lastQuery;
      if (results.length === 0) {
        resultsEl.style.display = "block";
        resultsEl.innerHTML = '<div style="padding:8px; color:var(--text-secondary); font-size:11px; text-align:center;">No results for "' + escapeHtml2(query) + '"</div>';
        return;
      }
      resultsEl.style.display = "block";
      resultsEl.innerHTML = `
      <div style="padding:4px 8px; font-size:10px; color:var(--text-secondary); border-bottom:1px solid var(--border-color);">
        ${results.length} result${results.length !== 1 ? "s" : ""} for "${escapeHtml2(query)}"
      </div>
      ${results.map((r, i) => {
        const isUser = r.role === "user";
        const roleColor = isUser ? "var(--accent-color)" : "#10b981";
        const roleLabel = isUser ? "You" : "AI";
        const snippet = (r.content || "").slice(0, 150);
        const time = r.timestamp ? new Date(r.timestamp).toLocaleString() : "";
        const sessionId = r.session_id || r.sessionId || "";
        const highlighted = highlightTerms(escapeHtml2(snippet), query);
        return `<div class="chat-search-result" onclick="chatSearchLoadResult('${escapeHtml2(sessionId)}', ${r.id || 0})" style="padding:6px 8px; cursor:pointer; border-bottom:1px solid var(--bg-tertiary);">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:10px; font-weight:600; color:${roleColor};">${roleLabel}</span>
            <span style="font-size:9px; color:var(--text-secondary);">${time}</span>
          </div>
          <div style="font-size:11px; color:var(--text-primary); margin-top:2px; line-height:1.3;">
            ${highlighted}${(r.content || "").length > 150 ? "..." : ""}
          </div>
          ${r.tags && r.tags.length ? `<div style="margin-top:2px;">${r.tags.map((t) => '<span style="font-size:9px; padding:1px 4px; background:var(--bg-tertiary); border-radius:4px; margin-right:2px;">' + escapeHtml2(t) + "</span>").join("")}</div>` : ""}
        </div>`;
      }).join("")}
    `;
    }
    function highlightTerms(text, query) {
      const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
      let result = text;
      for (const term of terms) {
        const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
        result = result.replace(regex, '<mark style="background:rgba(99,102,241,0.3);border-radius:2px;padding:0 1px;">$1</mark>');
      }
      return result;
    }
    function chatSearchLoadResult2(sessionId, messageId) {
      if (sessionId) {
        vscode2.postMessage({ type: "memoryGetSession", sessionId, limit: 50 });
      }
      const bar = document.getElementById("chatSearchBar");
      const results = document.getElementById("chatSearchResults");
      if (bar)
        bar.style.display = "none";
      if (results)
        results.style.display = "none";
    }
    function chatSearchClose2() {
      const bar = document.getElementById("chatSearchBar");
      const results = document.getElementById("chatSearchResults");
      if (bar)
        bar.style.display = "none";
      if (results)
        results.style.display = "none";
    }
    return {
      chatSearchToggle: chatSearchToggle2,
      chatSearchInput: chatSearchInput2,
      chatSearchRenderResults: chatSearchRenderResults2,
      chatSearchLoadResult: chatSearchLoadResult2,
      chatSearchClose: chatSearchClose2
    };
  }

  // src/webview/panel/features/comms.ts
  var SEVERITY_COLORS = {
    HIGH: "#ef4444",
    MEDIUM: "#f59e0b",
    LOW: "#3b82f6",
    INFO: "#6b7280"
  };
  var TIER_LABELS = {
    1: "Tier 1 \u2014 API Testing",
    2: "Tier 2 \u2014 Vulnerability Scanning",
    3: "Tier 3 \u2014 Full Pentest"
  };
  var TIER_COLORS = {
    1: "#3b82f6",
    2: "#f59e0b",
    3: "#ef4444"
  };
  function createCommsHandlers(deps) {
    const { vscode: vscode2, escapeHtml: escapeHtml2 } = deps;
    function commsRenderState2(msg2) {
      const tierEl = document.getElementById("commsTierLabel");
      const tierBar = document.getElementById("commsTierBar");
      if (tierEl) {
        tierEl.textContent = TIER_LABELS[msg2.tier] || `Tier ${msg2.tier}`;
        tierEl.style.color = TIER_COLORS[msg2.tier] || "#6b7280";
      }
      if (tierBar) {
        tierBar.style.width = `${msg2.tier / 3 * 100}%`;
        tierBar.style.background = TIER_COLORS[msg2.tier] || "#3b82f6";
      }
      const tierSelect = document.getElementById("commsTierSelect");
      if (tierSelect)
        tierSelect.value = String(msg2.tier);
      commsRenderServices2(msg2.services || {});
      commsRenderRecentScans(msg2.recentScans || []);
      commsRenderProfiles(msg2.profiles || {}, msg2.tier);
    }
    function commsRenderServices2(services) {
      const el = document.getElementById("commsServicesList");
      if (!el)
        return;
      const items = [
        { key: "postman", name: "Postman", icon: "\u{1F4EC}" },
        { key: "zap", name: "ZAP", icon: "\u26A1" },
        { key: "pentest", name: "Pentest", icon: "\u{1F513}" }
      ];
      el.innerHTML = items.map((item) => {
        const svc = services[item.key] || {};
        const available = svc.available;
        const dot = available ? "\u{1F7E2}" : "\u{1F534}";
        const label = available ? "Connected" : "Not available";
        return `<div class="comms-service-row">
        <span>${item.icon} ${item.name}</span>
        <span style="font-size:10px; color:${available ? "#22c55e" : "#6b7280"}">${dot} ${label}</span>
      </div>`;
      }).join("");
    }
    function commsRenderProfiles(profiles, tier) {
      const el = document.getElementById("commsScanProfileSelect");
      if (!el)
        return;
      const select = el;
      select.innerHTML = "";
      for (const [key, profile] of Object.entries(profiles)) {
        const p = profile;
        const disabled = tier < p.tier;
        const option = document.createElement("option");
        option.value = key;
        option.textContent = `${p.name}${disabled ? ` (Tier ${p.tier}+)` : ""}`;
        option.disabled = disabled;
        select.appendChild(option);
      }
    }
    function commsRenderRecentScans(scans) {
      const el = document.getElementById("commsRecentScansList");
      if (!el)
        return;
      if (!scans || scans.length === 0) {
        el.innerHTML = '<div style="font-size:10px; color:var(--text-secondary); text-align:center; padding:12px;">No scans yet. Enter a target URL and run a scan.</div>';
        return;
      }
      el.innerHTML = scans.map((scan) => {
        const statusIcon = scan.status === "running" ? "\u{1F504}" : scan.status === "completed" ? "\u2705" : "\u274C";
        const time = new Date(scan.startTime).toLocaleTimeString();
        const summaryParts = [];
        if (scan.summary.high)
          summaryParts.push(`<span style="color:${SEVERITY_COLORS.HIGH}">${scan.summary.high}H</span>`);
        if (scan.summary.medium)
          summaryParts.push(`<span style="color:${SEVERITY_COLORS.MEDIUM}">${scan.summary.medium}M</span>`);
        if (scan.summary.low)
          summaryParts.push(`<span style="color:${SEVERITY_COLORS.LOW}">${scan.summary.low}L</span>`);
        if (scan.summary.info)
          summaryParts.push(`<span style="color:${SEVERITY_COLORS.INFO}">${scan.summary.info}I</span>`);
        const summaryStr = summaryParts.length ? summaryParts.join(" ") : scan.status === "running" ? "Scanning..." : "Clean";
        return `<div class="comms-scan-row" onclick="commsViewScan('${scan.id}')" style="cursor:pointer;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:11px; font-weight:600;">${statusIcon} ${escapeHtml2(scan.profile)}</span>
          <span style="font-size:9px; color:var(--text-secondary);">${time}</span>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:2px;">
          <span style="font-size:10px; color:var(--text-secondary);">${escapeHtml2(scan.target)}</span>
          <span style="font-size:10px;">${summaryStr}</span>
        </div>
        ${scan.error ? `<div style="font-size:9px; color:${SEVERITY_COLORS.HIGH}; margin-top:2px;">${escapeHtml2(scan.error)}</div>` : ""}
      </div>`;
      }).join("");
    }
    function commsRenderScanDetail2(msg2) {
      const scan = msg2.scan;
      if (!scan)
        return;
      const el = document.getElementById("commsScanDetail");
      const listEl = document.getElementById("commsRecentScansList");
      if (!el)
        return;
      if (listEl)
        listEl.style.display = "none";
      el.style.display = "block";
      const statusIcon = scan.status === "running" ? "\u{1F504}" : scan.status === "completed" ? "\u2705" : "\u274C";
      const duration = scan.endTime ? `${((scan.endTime - scan.startTime) / 1e3).toFixed(1)}s` : "In progress";
      let findingsHtml = "";
      if (scan.findings && scan.findings.length > 0) {
        findingsHtml = scan.findings.map((f, i) => `
        <div class="comms-finding-row" style="border-left:3px solid ${SEVERITY_COLORS[f.severity] || "#6b7280"};">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:11px; font-weight:600;">${escapeHtml2(f.name)}</span>
            <span class="comms-severity-badge" style="background:${SEVERITY_COLORS[f.severity] || "#6b7280"};">${f.severity}</span>
          </div>
          <div style="font-size:10px; color:var(--text-secondary); margin-top:2px;">${escapeHtml2(f.description || "").slice(0, 200)}</div>
          ${f.url ? `<div style="font-size:9px; color:var(--text-secondary); margin-top:2px;">${escapeHtml2(f.url)}</div>` : ""}
          <div style="display:flex; gap:4px; margin-top:4px;">
            <button class="btn-secondary" onclick="commsInvestigateFinding(${i})" style="padding:2px 6px; font-size:9px;">Investigate</button>
            <button class="btn-secondary" onclick="commsGenerateFixForFinding(${i})" style="padding:2px 6px; font-size:9px;">Generate Fix</button>
          </div>
        </div>
      `).join("");
      } else if (scan.status === "completed") {
        findingsHtml = '<div style="font-size:10px; color:#22c55e; text-align:center; padding:12px;">No vulnerabilities found.</div>';
      }
      el.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <button class="btn-secondary" onclick="commsCloseScanDetail()" style="padding:2px 8px; font-size:10px;">&larr; Back</button>
        <span style="font-size:10px; color:var(--text-secondary);">${duration}</span>
      </div>
      <div style="margin-bottom:6px;">
        <strong style="font-size:12px;">${statusIcon} ${escapeHtml2(scan.profile)}</strong>
        <span style="font-size:10px; color:var(--text-secondary); margin-left:8px;">${escapeHtml2(scan.target)}</span>
      </div>
      <div style="display:flex; gap:8px; margin-bottom:8px;">
        <span class="comms-severity-badge" style="background:${SEVERITY_COLORS.HIGH};">${scan.summary.high} High</span>
        <span class="comms-severity-badge" style="background:${SEVERITY_COLORS.MEDIUM};">${scan.summary.medium} Med</span>
        <span class="comms-severity-badge" style="background:${SEVERITY_COLORS.LOW};">${scan.summary.low} Low</span>
        <span class="comms-severity-badge" style="background:${SEVERITY_COLORS.INFO};">${scan.summary.info} Info</span>
      </div>
      ${scan.error ? `<div style="font-size:10px; color:${SEVERITY_COLORS.HIGH}; margin-bottom:6px;">${escapeHtml2(scan.error)}</div>` : ""}
      <div id="commsFindingsList">${findingsHtml}</div>
    `;
      window._commsCurrentFindings = scan.findings || [];
    }
    function commsRenderScanStarted2(msg2) {
      const scan = msg2.scan;
      if (!scan)
        return;
      const el = document.getElementById("commsRecentScansList");
      if (el) {
        const row = document.createElement("div");
        row.className = "comms-scan-row";
        row.id = `commsScan-${scan.id}`;
        row.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:11px; font-weight:600;">\u{1F504} ${escapeHtml2(scan.profile)}</span>
          <span style="font-size:9px; color:var(--text-secondary);">Running...</span>
        </div>
        <div style="font-size:10px; color:var(--text-secondary); margin-top:2px;">${escapeHtml2(scan.target)}</div>
      `;
        el.prepend(row);
      }
      const indicator = document.getElementById("commsScanIndicator");
      if (indicator) {
        indicator.textContent = "Scanning...";
        indicator.style.display = "inline";
      }
    }
    function commsRenderScanCompleted2(msg2) {
      const indicator = document.getElementById("commsScanIndicator");
      if (indicator)
        indicator.style.display = "none";
      const detailEl = document.getElementById("commsScanDetail");
      if (detailEl && detailEl.style.display !== "none") {
        commsRenderScanDetail2(msg2);
      }
      vscode2.postMessage({ type: "commsGetState" });
    }
    function commsRenderPrompt2(msg2) {
      if (!msg2.prompt)
        return;
      const chatInput = document.getElementById("chatInput");
      if (chatInput) {
        chatInput.value = msg2.prompt;
        chatInput.dispatchEvent(new Event("input"));
        chatInput.focus();
      }
    }
    function commsRequestState2() {
      vscode2.postMessage({ type: "commsGetState" });
    }
    function commsSetTier2(tier) {
      vscode2.postMessage({ type: "commsSetTier", tier: Number(tier) });
    }
    function commsCheckServices2() {
      vscode2.postMessage({ type: "commsCheckServices" });
    }
    function commsStartScan2() {
      const profileEl = document.getElementById("commsScanProfileSelect");
      const targetEl = document.getElementById("commsScanTarget");
      const profile = profileEl?.value || "apiTest";
      const target = targetEl?.value?.trim() || "";
      if (!target) {
        const statusEl = document.getElementById("commsScanStatus");
        if (statusEl) {
          statusEl.textContent = "Enter a target URL.";
          statusEl.style.color = SEVERITY_COLORS.MEDIUM;
        }
        return;
      }
      vscode2.postMessage({ type: "commsStartScan", profile, target });
    }
    function commsViewScan2(scanId) {
      vscode2.postMessage({ type: "commsGetScan", scanId });
    }
    function commsCloseScanDetail2() {
      const detailEl = document.getElementById("commsScanDetail");
      const listEl = document.getElementById("commsRecentScansList");
      if (detailEl)
        detailEl.style.display = "none";
      if (listEl)
        listEl.style.display = "";
    }
    function commsInvestigateFinding2(index) {
      const findings = window._commsCurrentFindings || [];
      const finding = findings[index];
      if (finding) {
        vscode2.postMessage({ type: "commsInvestigate", finding });
      }
    }
    function commsGenerateFixForFinding2(index) {
      const findings = window._commsCurrentFindings || [];
      const finding = findings[index];
      if (finding) {
        vscode2.postMessage({ type: "commsGenerateFix", finding });
      }
    }
    return {
      // Render functions (called by messageRouter)
      commsRenderState: commsRenderState2,
      commsRenderServices: commsRenderServices2,
      commsRenderScanDetail: commsRenderScanDetail2,
      commsRenderScanStarted: commsRenderScanStarted2,
      commsRenderScanCompleted: commsRenderScanCompleted2,
      commsRenderPrompt: commsRenderPrompt2,
      // Action functions (called by HTML onclick)
      commsRequestState: commsRequestState2,
      commsSetTier: commsSetTier2,
      commsCheckServices: commsCheckServices2,
      commsStartScan: commsStartScan2,
      commsViewScan: commsViewScan2,
      commsCloseScanDetail: commsCloseScanDetail2,
      commsInvestigateFinding: commsInvestigateFinding2,
      commsGenerateFixForFinding: commsGenerateFixForFinding2
    };
  }

  // src/webview/panel/features/ops.ts
  var STATUS_COLORS2 = {
    online: "#22c55e",
    offline: "#ef4444",
    degraded: "#f59e0b",
    unknown: "#6b7280"
  };
  var STATUS_ICONS = {
    online: "\u{1F7E2}",
    offline: "\u{1F534}",
    degraded: "\u{1F7E1}",
    unknown: "\u26AA"
  };
  function createOpsHandlers(deps) {
    const { vscode: vscode2, escapeHtml: escapeHtml2 } = deps;
    function opsRenderState2(msg2) {
      opsRenderServerList2(msg2.servers || []);
      opsRenderRecentOps2(msg2.recentOps || []);
      const activeId = msg2.activeServerId;
      if (activeId) {
        const server = (msg2.servers || []).find((s) => s.id === activeId);
        if (server)
          opsRenderServerDetail2(server);
      }
    }
    function opsRenderServerList2(servers) {
      const el = document.getElementById("opsServerList");
      if (!el)
        return;
      if (!servers || servers.length === 0) {
        el.innerHTML = '<div style="font-size:10px; color:var(--text-secondary); text-align:center; padding:12px;">No servers configured. Click "+ Add Server" to get started.</div>';
        return;
      }
      el.innerHTML = servers.map((server) => {
        const icon = STATUS_ICONS[server.status] || "\u26AA";
        const color = STATUS_COLORS2[server.status] || "#6b7280";
        const lastSeen = server.lastSeen ? formatRelativeTime(server.lastSeen) : "never";
        const metrics = server.metrics;
        let metricsHtml = "";
        if (metrics) {
          metricsHtml = `<div style="display:flex; gap:8px; font-size:9px; color:var(--text-secondary); margin-top:2px;">
          <span style="color:${metrics.cpu > 80 ? "#ef4444" : "inherit"}">CPU: ${metrics.cpu}%</span>
          <span style="color:${metrics.ram > 90 ? "#ef4444" : "inherit"}">RAM: ${metrics.ram}%</span>
          <span style="color:${metrics.disk > 85 ? "#ef4444" : "inherit"}">Disk: ${metrics.disk}%</span>
        </div>`;
        }
        return `<div class="ops-server-row" onclick="opsSelectServer('${server.id}')" style="cursor:pointer; ${msg?.activeServerId === server.id ? "border-color:var(--accent-color);" : ""}">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:11px; font-weight:600;">${icon} ${escapeHtml2(server.name)}</span>
          <span style="font-size:9px; color:${color};">${server.status}</span>
        </div>
        <div style="font-size:10px; color:var(--text-secondary); margin-top:2px;">${escapeHtml2(server.user)}@${escapeHtml2(server.host)}:${server.port || 22}</div>
        ${metricsHtml}
        <div style="font-size:9px; color:var(--text-secondary); margin-top:2px;">Last seen: ${lastSeen}</div>
      </div>`;
      }).join("");
    }
    function opsRenderServerDetail2(server) {
      const el = document.getElementById("opsServerDetail");
      if (!el || !server)
        return;
      const icon = STATUS_ICONS[server.status] || "\u26AA";
      const metrics = server.metrics;
      const hardening = server.hardening;
      let metricsHtml = '<div style="font-size:10px; color:var(--text-secondary);">No metrics yet. Run a health check.</div>';
      if (metrics) {
        metricsHtml = `
        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:6px; margin-top:4px;">
          <div class="ops-metric-card">
            <div style="font-size:9px; color:var(--text-secondary);">CPU</div>
            <div style="font-size:16px; font-weight:700; color:${metrics.cpu > 80 ? "#ef4444" : "#22c55e"};">${metrics.cpu}%</div>
          </div>
          <div class="ops-metric-card">
            <div style="font-size:9px; color:var(--text-secondary);">RAM</div>
            <div style="font-size:16px; font-weight:700; color:${metrics.ram > 90 ? "#ef4444" : "#22c55e"};">${metrics.ram}%</div>
          </div>
          <div class="ops-metric-card">
            <div style="font-size:9px; color:var(--text-secondary);">Disk</div>
            <div style="font-size:16px; font-weight:700; color:${metrics.disk > 85 ? "#ef4444" : "#22c55e"};">${metrics.disk}%</div>
          </div>
        </div>
      `;
      }
      let hardeningHtml = "";
      if (hardening) {
        const checks = [
          { label: "Root login disabled", ok: hardening.rootLoginDisabled },
          { label: "Password auth disabled", ok: hardening.passwordAuthDisabled },
          { label: "Firewall active", ok: hardening.firewallActive },
          { label: "Fail2ban running", ok: hardening.fail2banRunning },
          { label: "Auto-updates enabled", ok: hardening.autoUpdatesEnabled }
        ];
        hardeningHtml = `<div style="margin-top:6px;">
        <div style="font-size:10px; font-weight:600; margin-bottom:4px;">Hardening</div>
        ${checks.map((c) => `<div style="font-size:9px;">${c.ok ? "\u2705" : "\u274C"} ${c.label}</div>`).join("")}
        ${hardening.pendingUpdates > 0 ? `<div style="font-size:9px; color:#f59e0b; margin-top:2px;">\u26A0 ${hardening.pendingUpdates} pending update(s)</div>` : ""}
      </div>`;
      }
      el.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <strong style="font-size:12px;">${icon} ${escapeHtml2(server.name)}</strong>
        <div style="display:flex; gap:4px;">
          <button class="btn-secondary" onclick="opsTestConnection('${server.id}')" style="padding:2px 6px; font-size:9px;">Test</button>
          <button class="btn-secondary" onclick="opsHealthCheck('${server.id}')" style="padding:2px 6px; font-size:9px;">Health</button>
          <button class="btn-secondary" onclick="opsRemoveServer('${server.id}')" style="padding:2px 6px; font-size:9px; color:#ef4444;">Remove</button>
        </div>
      </div>
      <div style="font-size:10px; color:var(--text-secondary);">${escapeHtml2(server.user)}@${escapeHtml2(server.host)}:${server.port || 22}</div>
      ${metricsHtml}
      ${hardeningHtml}
      <div style="display:flex; gap:4px; margin-top:8px; flex-wrap:wrap;">
        <button class="btn-secondary" onclick="opsHardenServer('${server.id}', 'full')" style="padding:3px 8px; font-size:9px;">\u{1F512} Harden</button>
        <button class="btn-secondary" onclick="opsHardenServer('${server.id}', 'updateOS')" style="padding:3px 8px; font-size:9px;">\u{1F504} Update OS</button>
        <button class="btn-secondary" onclick="opsHardenServer('${server.id}', 'firewall')" style="padding:3px 8px; font-size:9px;">\u{1F6E1}\uFE0F Firewall</button>
        <button class="btn-secondary" onclick="opsDeployService('${server.id}', 'coturn')" style="padding:3px 8px; font-size:9px;">\u{1F680} Deploy TURN</button>
        <button class="btn-secondary" onclick="opsDeployService('${server.id}', 'unity')" style="padding:3px 8px; font-size:9px;">\u{1F3AE} Deploy Unity</button>
      </div>
    `;
    }
    function opsRenderRecentOps2(ops) {
      const el = document.getElementById("opsRecentOpsList");
      if (!el)
        return;
      if (!ops || ops.length === 0) {
        el.innerHTML = '<div style="font-size:10px; color:var(--text-secondary); text-align:center; padding:8px;">No operations yet.</div>';
        return;
      }
      el.innerHTML = ops.slice(0, 15).map((op) => {
        const statusIcon = op.status === "success" ? "\u2705" : op.status === "failed" ? "\u274C" : "\u{1F504}";
        const time = new Date(op.timestamp).toLocaleTimeString();
        return `<div class="ops-log-row" ${op.output ? `onclick="opsShowOpOutput('${op.id}')" style="cursor:pointer;"` : ""}>
        <span style="font-size:9px; color:var(--text-secondary); min-width:50px;">${time}</span>
        <span style="font-size:10px;">${statusIcon} ${escapeHtml2(op.action)}</span>
        <span style="font-size:9px; color:var(--text-secondary);">${escapeHtml2(op.serverName)}</span>
      </div>`;
      }).join("");
    }
    function opsRenderCommandOutput2(msg2) {
      const el = document.getElementById("opsCommandOutput");
      if (!el)
        return;
      el.style.display = "block";
      el.innerHTML = `<pre style="font-size:9px; white-space:pre-wrap; max-height:200px; overflow-y:auto; margin:0; padding:6px; background:var(--bg-primary); border-radius:4px; border:1px solid var(--border-color);">${escapeHtml2(msg2.output || "")}</pre>`;
    }
    function opsRequestState2() {
      vscode2.postMessage({ type: "opsGetState" });
    }
    function opsAddServer2() {
      const hostEl = document.getElementById("opsServerHost");
      const userEl = document.getElementById("opsServerUser");
      const nameEl = document.getElementById("opsServerName");
      const host = hostEl?.value?.trim() || "";
      const user = userEl?.value?.trim() || "root";
      const name = nameEl?.value?.trim() || host;
      if (!host) {
        const statusEl = document.getElementById("opsAddStatus");
        if (statusEl) {
          statusEl.textContent = "Enter a hostname or IP.";
          statusEl.style.color = "#ef4444";
        }
        return;
      }
      vscode2.postMessage({ type: "opsAddServer", host, user, name });
      if (hostEl)
        hostEl.value = "";
      if (userEl)
        userEl.value = "";
      if (nameEl)
        nameEl.value = "";
    }
    function opsRemoveServer2(serverId) {
      vscode2.postMessage({ type: "opsRemoveServer", serverId });
    }
    function opsSelectServer2(serverId) {
      vscode2.postMessage({ type: "opsSetActiveServer", serverId });
    }
    function opsTestConnection2(serverId) {
      vscode2.postMessage({ type: "opsTestConnection", serverId });
    }
    function opsHealthCheck2(serverId) {
      vscode2.postMessage({ type: "opsHealthCheck", serverId });
    }
    function opsHardenServer2(serverId, action) {
      vscode2.postMessage({ type: "opsHardenServer", serverId, action: action || "full" });
    }
    function opsDeployService2(serverId, service) {
      vscode2.postMessage({ type: "opsDeployService", serverId, service });
    }
    function opsExecuteCommand2(serverId) {
      const cmdEl = document.getElementById("opsCommandInput");
      const cmd = cmdEl?.value?.trim() || "";
      if (!cmd)
        return;
      const sudoEl = document.getElementById("opsCommandSudo");
      const sudo = sudoEl?.checked || false;
      vscode2.postMessage({ type: "opsExecuteCommand", serverId, command: cmd, sudo });
      if (cmdEl)
        cmdEl.value = "";
    }
    function opsShowOpOutput2(opId) {
      vscode2.postMessage({ type: "opsGetState" });
    }
    function formatRelativeTime(ts) {
      if (!ts)
        return "never";
      const delta = Math.max(0, Date.now() - ts);
      const sec = Math.floor(delta / 1e3);
      if (sec < 60)
        return sec + "s ago";
      const min = Math.floor(sec / 60);
      if (min < 60)
        return min + "m ago";
      const hr = Math.floor(min / 60);
      if (hr < 24)
        return hr + "h ago";
      return Math.floor(hr / 24) + "d ago";
    }
    return {
      // Render functions (called by messageRouter)
      opsRenderState: opsRenderState2,
      opsRenderServerList: opsRenderServerList2,
      opsRenderServerDetail: opsRenderServerDetail2,
      opsRenderRecentOps: opsRenderRecentOps2,
      opsRenderCommandOutput: opsRenderCommandOutput2,
      // Action functions (called by HTML onclick)
      opsRequestState: opsRequestState2,
      opsAddServer: opsAddServer2,
      opsRemoveServer: opsRemoveServer2,
      opsSelectServer: opsSelectServer2,
      opsTestConnection: opsTestConnection2,
      opsHealthCheck: opsHealthCheck2,
      opsHardenServer: opsHardenServer2,
      opsDeployService: opsDeployService2,
      opsExecuteCommand: opsExecuteCommand2,
      opsShowOpOutput: opsShowOpOutput2
    };
  }

  // src/webview/panel/features/diagnostics.ts
  function createDiagnosticsHandlers(deps) {
    const { vscode: vscode2, escapeHtml: escapeHtml2, showToast: showToast2 } = deps;
    function onDiagnosticsTabOpen2() {
      vscode2.postMessage({ type: "diagnosticsGetLast" });
    }
    function runDiagnosticsScan2(mode) {
      const btn = document.getElementById("diagScanBtn");
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Scanning...";
      }
      vscode2.postMessage({ type: "diagnosticsScan", mode: mode || "quick" });
    }
    function renderDiagnosticsResult2(result, error) {
      const btn = document.getElementById("diagScanBtn");
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Scan";
      }
      const container = document.getElementById("diagResultsContainer");
      if (!container)
        return;
      if (error) {
        container.innerHTML = `<div style="color:var(--error-color);padding:8px;font-size:11px;">${escapeHtml2(error)}</div>`;
        return;
      }
      if (!result) {
        container.innerHTML = '<div style="color:var(--text-secondary);padding:8px;font-size:11px;">No scan results yet. Click "Scan" to run diagnostics.</div>';
        return;
      }
      const { summary, checks, duration } = result;
      let html = `
      <div style="display:flex;gap:8px;align-items:center;padding:6px 0;margin-bottom:6px;border-bottom:1px solid var(--border-color);">
        <span style="font-size:12px;font-weight:600;color:${summary.failed > 0 ? "var(--error-color)" : summary.warned > 0 ? "#f59e0b" : "var(--success-color)"};">
          ${summary.failed > 0 ? "FAIL" : summary.warned > 0 ? "WARN" : "PASS"}
        </span>
        <span style="font-size:10px;color:var(--text-secondary);">
          ${summary.errors} errors, ${summary.warnings} warnings
        </span>
        <span style="font-size:10px;color:var(--text-secondary);margin-left:auto;">
          ${duration}ms
        </span>
      </div>
    `;
      for (const check of checks) {
        const statusColor = check.status === "pass" ? "var(--success-color)" : check.status === "fail" ? "var(--error-color)" : check.status === "warn" ? "#f59e0b" : "var(--text-secondary)";
        const statusIcon = check.status === "pass" ? "&#10003;" : check.status === "fail" ? "&#10007;" : check.status === "warn" ? "&#9888;" : "&#8212;";
        html += `
        <div style="margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
            <span style="color:${statusColor};font-size:12px;">${statusIcon}</span>
            <span style="font-size:11px;font-weight:600;">${escapeHtml2(check.name)}</span>
            <span style="font-size:10px;color:var(--text-secondary);">${check.items.length} items, ${check.duration}ms</span>
          </div>
      `;
        const items = check.items.slice(0, 20);
        for (const item of items) {
          const sevColor = item.severity === "error" ? "var(--error-color)" : item.severity === "warning" ? "#f59e0b" : "var(--text-secondary)";
          const sevLabel = item.severity === "error" ? "ERR" : item.severity === "warning" ? "WRN" : "INF";
          html += `
          <div style="display:flex;align-items:flex-start;gap:6px;padding:3px 0 3px 18px;font-size:10px;cursor:pointer;border-radius:3px;" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background=''" onclick="diagnosticsOpenFile('${escapeHtml2(item.file)}', ${item.line})">
            <span style="color:${sevColor};font-weight:600;min-width:24px;">${sevLabel}</span>
            <span style="color:var(--text-secondary);min-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml2(item.file.split("/").pop() || item.file)}:${item.line}</span>
            <span style="flex:1;color:var(--text-primary);">${escapeHtml2(item.message)}</span>
          </div>
        `;
        }
        if (check.items.length > 20) {
          html += `<div style="padding:3px 0 3px 18px;font-size:10px;color:var(--text-secondary);">... and ${check.items.length - 20} more</div>`;
        }
        html += "</div>";
      }
      container.innerHTML = html;
    }
    function renderDiagnosticsProgress2(stage, progress) {
      const container = document.getElementById("diagResultsContainer");
      if (!container)
        return;
      container.innerHTML = `<div style="padding:8px;font-size:11px;color:var(--text-secondary);">${escapeHtml2(stage)}</div>`;
    }
    function diagnosticsOpenFile2(file, line) {
      vscode2.postMessage({ type: "diagnosticsOpenFile", file, line });
    }
    return {
      onDiagnosticsTabOpen: onDiagnosticsTabOpen2,
      runDiagnosticsScan: runDiagnosticsScan2,
      renderDiagnosticsResult: renderDiagnosticsResult2,
      renderDiagnosticsProgress: renderDiagnosticsProgress2,
      diagnosticsOpenFile: diagnosticsOpenFile2
    };
  }

  // src/webview/panel/ipc/messageRouter.ts
  function createMessageRouter(deps) {
    const {
      escapeHtml: escapeHtml2,
      shipSetStatus: shipSetStatus2,
      setUnityButtonsLoading: setUnityButtonsLoading2,
      updateUnityMCPStatus: updateUnityMCPStatus2,
      updateUnityStatus: updateUnityStatus2,
      updateUnityConsole: updateUnityConsole2,
      updateUnityPanelInfo: updateUnityPanelInfo2,
      renderCliStatus: renderCliStatus2,
      renderMcpServers: renderMcpServers2,
      renderKbEntries: renderKbEntries2,
      handleCrawlProgress: handleCrawlProgress2,
      renderEmbedderStatus: renderEmbedderStatus2,
      updateModelDownloadProgress: updateModelDownloadProgress2,
      setModelDownloading: setModelDownloading2,
      updateEmbeddingProgress: updateEmbeddingProgress2,
      updateEmbedAllProgress: updateEmbedAllProgress2,
      setEmbeddingAll: setEmbeddingAll2,
      renderCosts: renderCosts2,
      loadVoiceSettings: loadVoiceSettings2,
      updateVoiceDownloadProgress: updateVoiceDownloadProgress2,
      handleMicTestStatus: handleMicTestStatus2,
      handleSpeakerTestStatus: handleSpeakerTestStatus2,
      finalizeStreamingMessage: finalizeStreamingMessage2,
      addMessage: addMessage2,
      createMessageHtml: createMessageHtml2,
      addToMessageHistory: addToMessageHistory2,
      appendToStreamingMessage: appendToStreamingMessage2,
      updateResponseNode,
      updateLiveResponseText: updateLiveResponseText2,
      getFlowResponseTokens: getFlowResponseTokens2,
      setGenerating: setGenerating2,
      updateTokenBar: updateTokenBar2,
      stopThreadAnimation: stopThreadAnimation2,
      stopParticleSpawning: stopParticleSpawning2,
      stopParticleFlow: stopParticleFlow2,
      getChatSplitActive: getChatSplitActive2,
      syncChatSplitMirror: syncChatSplitMirror2,
      setFlowThinking: setFlowThinking2,
      setAiStage: setAiStage2,
      clearContextSources: clearContextSources2,
      hideLiveResponse: hideLiveResponse2,
      showLiveResponse: showLiveResponse2,
      startAiFlow: startAiFlow2,
      spawnFlowChunk: spawnFlowChunk2,
      addContextSourceCard: addContextSourceCard2,
      renderAiFlow: renderAiFlow2,
      clearAiFlow: clearAiFlow2,
      populateDocTargets: populateDocTargets2,
      updateDocInfo: updateDocInfo2,
      setShipSelectedSectorId: setShipSelectedSectorId2,
      setShipSelectedSubId: setShipSelectedSubId2,
      setShipProfile: setShipProfile2,
      getShipSelectedSectorId: getShipSelectedSectorId2,
      setShipAutoexecute: setShipAutoexecute2,
      shipRender: shipRender2,
      shipUpdateChips: shipUpdateChips2,
      updateStationLabels: updateStationLabels2,
      renderAsmdefInventory: renderAsmdefInventory2,
      renderAsmdefPolicyEditor: renderAsmdefPolicyEditor2,
      renderAsmdefGraph: renderAsmdefGraph2,
      renderAsmdefCheckResult: renderAsmdefCheckResult2,
      renderSectorMap: renderSectorMap2,
      asmdefRefresh: asmdefRefresh2,
      setCoordinatorPill: setCoordinatorPill2,
      updateCoordinatorSummary: updateCoordinatorSummary2,
      updateCoordinatorLastIssue: updateCoordinatorLastIssue2,
      getLastCoordinatorToast,
      setLastCoordinatorToast,
      showToast: showToast2,
      renderJobList: renderJobList2,
      renderPlanningPanel: renderPlanningPanel2,
      setContextPreview: setContextPreview2,
      renderPlanList: renderPlanList2,
      renderPlanSummary: renderPlanSummary2,
      setPlanExecutionButtonsEnabled: setPlanExecutionButtonsEnabled2,
      updateDiffSummary: updateDiffSummary2,
      updatePlanComparison: updatePlanComparison2,
      updateTestResult: updateTestResult2,
      renderTicketList: renderTicketList2,
      renderTicketsListMain: renderTicketsListMain2,
      renderSkillsList: renderSkillsList2,
      updateDashboardMetrics: updateDashboardMetrics2,
      renderActivityList: renderActivityList2,
      updateDocsPanel: updateDocsPanel2,
      updateDbPanel: updateDbPanel2,
      updateLogsPanel: updateLogsPanel2,
      updateAIReview: updateAIReview2,
      setWorkflows: setWorkflows2,
      handleWorkflowEvent: handleWorkflowEvent2,
      autoResize: autoResize2,
      sendMessage: sendMessage2,
      loadGitSettings: loadGitSettings2,
      loadConnectionMethods: loadConnectionMethods2,
      showCompactionNotice: showCompactionNotice2,
      showPlanExecutionPanel: showPlanExecutionPanel2,
      hidePlanStepGate: hidePlanStepGate2,
      clearPlanExecutionLog: clearPlanExecutionLog2,
      setPlanExecutionStatus: setPlanExecutionStatus2,
      setPlanExecutionProgress: setPlanExecutionProgress2,
      appendPlanExecutionLog: appendPlanExecutionLog2,
      getChatSessions,
      getCurrentChatId,
      getUnityConnected: getUnityConnected2,
      setUnityConnected: setUnityConnected2,
      getGptFlowPending,
      setGptFlowPending,
      getPlanTemplates,
      setPlanTemplates,
      getPlanList,
      setPlanList,
      getCurrentPlanData,
      setCurrentPlanData,
      getTicketList,
      setTicketList,
      getPlanExecutionState: getPlanExecutionState2,
      setPlanExecutionState: setPlanExecutionState2,
      restoreChatState: restoreChatState2,
      handleToolbarSettings: handleToolbarSettings2,
      mergePricing: mergePricing2,
      updateSettings: updateSettings2,
      handleApiKeyValue: handleApiKeyValue2,
      handleDevExportSuccess: handleDevExportSuccess2,
      handleDevImportSuccess: handleDevImportSuccess2,
      handleDevExportError: handleDevExportError2,
      handleDevImportError: handleDevImportError2,
      renderUsageStats: renderUsageStats2,
      engineerRenderStatus: engineerRenderStatus2,
      engineerRenderSuggestions: engineerRenderSuggestions2,
      engineerRenderHistory: engineerRenderHistory2,
      engineerRenderPrompt: engineerRenderPrompt2,
      engineerHandleDelegated: engineerHandleDelegated2,
      engineerCheckSectors: engineerCheckSectors2,
      autopilotRenderStatus: autopilotRenderStatus2,
      autopilotRenderStepResult: autopilotRenderStepResult2,
      autopilotRenderSessionPrompt: autopilotRenderSessionPrompt2,
      autopilotRenderConfig: autopilotRenderConfig2,
      gameuiRenderState: gameuiRenderState2,
      gameuiRenderCatalog: gameuiRenderCatalog2,
      gameuiRenderEvent: gameuiRenderEvent2,
      gameuiRenderThemes: gameuiRenderThemes2,
      dbRenderConnectionList: dbRenderConnectionList2,
      dbRenderSchema: dbRenderSchema2,
      dbRenderQueryResult: dbRenderQueryResult2,
      dbRenderTestResult: dbRenderTestResult2,
      chatSearchRenderResults: chatSearchRenderResults2,
      commsRenderState: commsRenderState2,
      commsRenderScanDetail: commsRenderScanDetail2,
      commsRenderScanStarted: commsRenderScanStarted2,
      commsRenderScanCompleted: commsRenderScanCompleted2,
      commsRenderPrompt: commsRenderPrompt2,
      opsRenderState: opsRenderState2,
      opsRenderCommandOutput: opsRenderCommandOutput2,
      opsRenderRecentOps: opsRenderRecentOps2,
      renderDiagnosticsResult: renderDiagnosticsResult2,
      renderDiagnosticsProgress: renderDiagnosticsProgress2,
      vscode: vscode2
    } = deps;
    function formatRelativeTime(ts) {
      if (!ts)
        return "never";
      const delta = Math.max(0, Date.now() - ts);
      const sec = Math.floor(delta / 1e3);
      if (sec < 60)
        return sec + "s ago";
      const min = Math.floor(sec / 60);
      if (min < 60)
        return min + "m ago";
      const hr = Math.floor(min / 60);
      if (hr < 24)
        return hr + "h ago";
      const days = Math.floor(hr / 24);
      return days + "d ago";
    }
    function handleMessage(msg2) {
      const chatSessions2 = getChatSessions();
      const currentChatId2 = getCurrentChatId();
      let unityConnected = getUnityConnected2();
      let _gptFlowPending2 = getGptFlowPending();
      let planTemplates2 = getPlanTemplates();
      let planList2 = getPlanList();
      let currentPlanData2 = getCurrentPlanData();
      let ticketList2 = getTicketList();
      let planExecutionState = getPlanExecutionState2();
      let lastCoordinatorToast2 = getLastCoordinatorToast();
      const chatSplitActive = getChatSplitActive2();
      switch (msg2.type) {
        case "info":
          if (msg2.message) {
            shipSetStatus2(msg2.message);
            console.log("[SpaceCode UI] Info:", msg2.message);
            if (msg2.message.toLowerCase().includes("unity")) {
              setUnityButtonsLoading2(false);
              const statusEl = document.getElementById("unityStatus");
              if (statusEl && (statusEl.textContent === "\u25CF Loading..." || statusEl.textContent === "\u25CF Running...")) {
                statusEl.className = "unity-status connected";
                statusEl.textContent = "\u25CF Connected";
                unityConnected = true;
                setUnityConnected2(unityConnected);
                updateUnityMCPStatus2(true);
              }
            }
          }
          break;
        case "error":
          setGenerating2(false, msg2.chatId);
          if (msg2.message) {
            shipSetStatus2("Error: " + msg2.message);
            console.error("[SpaceCode UI] Error:", msg2.message);
            if (!msg2.chatId || msg2.chatId === currentChatId2) {
              addMessage2("system", "Error: " + msg2.message);
            }
            const msgLower = msg2.message.toLowerCase();
            if (msgLower.includes("unity") || msgLower.includes("coplay") || msgLower.includes("mcp") || msgLower.includes("reload")) {
              setUnityButtonsLoading2(false);
              const isConnectionError = msgLower.includes("not connected") || msgLower.includes("connection failed") || msgLower.includes("failed to connect") || msgLower.includes("timed out") && !msgLower.includes("script");
              if (isConnectionError) {
                const statusEl = document.getElementById("unityStatus");
                if (statusEl) {
                  statusEl.className = "unity-status disconnected";
                  statusEl.textContent = "\u25CF Disconnected";
                  unityConnected = false;
                  setUnityConnected2(unityConnected);
                  updateUnityMCPStatus2(false);
                }
              }
            }
          }
          break;
        case "turn":
          if (!msg2.chatId || msg2.chatId === currentChatId2) {
            finalizeStreamingMessage2(msg2.chatId || currentChatId2);
            addMessage2(msg2.turn.provider, msg2.turn.message, msg2.turn.response);
          } else {
            const session = chatSessions2[msg2.chatId];
            if (session) {
              const msgHtml = createMessageHtml2(msg2.turn.provider, msg2.turn.message, msg2.turn.response);
              session.messagesHtml = (session.messagesHtml || "") + msgHtml;
            }
          }
          if (msg2.turn.provider === "claude" || msg2.turn.provider === "gpt") {
            addToMessageHistory2("assistant", msg2.turn.message, msg2.chatId || currentChatId2);
          }
          break;
        case "chunk":
          if (!msg2.chatId || msg2.chatId === currentChatId2) {
            appendToStreamingMessage2(msg2.provider, msg2.chunk, msg2.chatId || currentChatId2);
            if (typeof updateResponseNode === "function" && msg2.chunk) {
              const estimatedTokens = Math.ceil(msg2.chunk.length / 4);
              updateResponseNode(estimatedTokens);
              if (typeof updateLiveResponseText2 === "function") {
                const responseTokens = getFlowResponseTokens2();
                updateLiveResponseText2(msg2.chunk, responseTokens || estimatedTokens);
              }
            }
          }
          break;
        case "status":
          document.getElementById("statusText").textContent = msg2.status.message;
          break;
        case "complete":
          setGenerating2(false, msg2.chatId);
          updateTokenBar2(msg2.chatId || currentChatId2);
          if (msg2.gptConsultPending) {
            _gptFlowPending2 = true;
            setGptFlowPending(_gptFlowPending2);
          } else {
            stopThreadAnimation2();
            stopParticleSpawning2();
            stopParticleFlow2();
          }
          if (chatSplitActive)
            syncChatSplitMirror2();
          break;
        case "gptConsultStarted":
          {
            const chatContainer = document.getElementById("chatMessages");
            if (chatContainer) {
              const prev = chatContainer.querySelector(".gpt-consult-pending");
              if (prev)
                prev.remove();
              const div = document.createElement("div");
              div.className = "message gpt-consult-pending";
              div.innerHTML = '<span class="consult-check" style="opacity:0.7;">\u27F3 Consulting GPT...</span>';
              chatContainer.appendChild(div);
              chatContainer.scrollTop = chatContainer.scrollHeight;
            }
          }
          break;
        case "gptOpinionResponse":
          {
            const chatContainer = document.getElementById("chatMessages");
            if (chatContainer) {
              const pending = chatContainer.querySelector(".gpt-consult-pending");
              if (pending)
                pending.remove();
              const div = document.createElement("div");
              div.className = "message gpt";
              div.innerHTML = '<div class="message-avatar">GPT</div><div class="message-content">' + (typeof marked !== "undefined" ? marked.parse(msg2.response) : escapeHtml2(msg2.response)) + "</div>";
              chatContainer.appendChild(div);
              chatContainer.scrollTop = chatContainer.scrollHeight;
              if (chatSplitActive)
                syncChatSplitMirror2();
            }
          }
          break;
        case "gptConsultRefined":
          {
            _gptFlowPending2 = false;
            setGptFlowPending(_gptFlowPending2);
            setFlowThinking2(false);
            stopThreadAnimation2();
            stopParticleSpawning2();
            stopParticleFlow2();
            const refinedPhaseEl = document.getElementById("flowPanelPhase");
            if (refinedPhaseEl)
              refinedPhaseEl.textContent = "Complete";
            const chatContainer = document.getElementById("chatMessages");
            if (chatContainer) {
              const pending = chatContainer.querySelector(".gpt-consult-pending");
              if (pending)
                pending.remove();
              const div = document.createElement("div");
              div.className = "message claude refined-message";
              const renderedContent = typeof marked !== "undefined" ? marked.parse(msg2.response) : escapeHtml2(msg2.response);
              const gptFeedbackHtml = msg2.gptFeedback ? typeof marked !== "undefined" ? marked.parse(msg2.gptFeedback) : escapeHtml2(msg2.gptFeedback) : "";
              div.innerHTML = '<div class="message-avatar refined-avatar">C</div><div class="message-content"><div class="refined-badge">Refined with 2nd opinion</div>' + renderedContent + `<div class="refined-intro">The original answer was refined based on GPT's analysis.</div>` + (gptFeedbackHtml ? '<details class="gpt-feedback-details"><summary class="gpt-feedback-summary">GPT feedback</summary><div class="gpt-feedback-content">' + gptFeedbackHtml + "</div></details>" : "") + "</div>";
              chatContainer.appendChild(div);
              chatContainer.scrollTop = chatContainer.scrollHeight;
              if (chatSplitActive)
                syncChatSplitMirror2();
            }
          }
          break;
        case "gptConsultComplete":
          {
            _gptFlowPending2 = false;
            setGptFlowPending(_gptFlowPending2);
            setFlowThinking2(false);
            stopThreadAnimation2();
            stopParticleSpawning2();
            stopParticleFlow2();
            const completePhaseEl = document.getElementById("flowPanelPhase");
            if (completePhaseEl)
              completePhaseEl.textContent = "Complete";
            const chatContainer = document.getElementById("chatMessages");
            if (chatContainer) {
              const pending = chatContainer.querySelector(".gpt-consult-pending");
              if (pending)
                pending.remove();
              const div = document.createElement("div");
              div.className = "message gpt-consult-silent";
              if (msg2.error) {
                div.innerHTML = '<span class="consult-check consult-error">GPT consult: ' + msg2.error + "</span>";
              } else if (msg2.hadInput) {
                div.innerHTML = '<span class="consult-check">GPT reviewed \u2014 original answer stands</span>';
              } else {
                div.innerHTML = '<span class="consult-check">GPT reviewed \u2014 no additional input</span>';
              }
              chatContainer.appendChild(div);
              chatContainer.scrollTop = chatContainer.scrollHeight;
            }
          }
          break;
        case "sideChatResponse":
          break;
        case "summary":
          addMessage2("summary", msg2.content);
          break;
        case "compacted":
          showCompactionNotice2(msg2.summary, msg2.originalMessageCount, msg2.keptMessageCount);
          break;
        case "restoreChatState":
          if (msg2.state) {
            restoreChatState2(msg2.state);
          }
          break;
        case "settings":
          loadConnectionMethods2(msg2.settings);
          if (updateSettings2) {
            updateSettings2(msg2.settings);
          }
          break;
        case "keysSaved":
          if (vscode2) {
            vscode2.postMessage({ type: "getSettings" });
          }
          break;
        case "apiKeyValue":
          if (handleApiKeyValue2) {
            handleApiKeyValue2(msg2.provider, msg2.value);
          }
          break;
        case "devExportSuccess":
          if (handleDevExportSuccess2)
            handleDevExportSuccess2(msg2.path);
          break;
        case "devImportSuccess":
          if (handleDevImportSuccess2)
            handleDevImportSuccess2();
          break;
        case "devExportError":
          if (handleDevExportError2)
            handleDevExportError2(msg2.error);
          break;
        case "devImportError":
          if (handleDevImportError2)
            handleDevImportError2(msg2.error);
          break;
        case "connectionMethodsSaved":
          break;
        case "soundSettings":
          if (typeof window.loadSoundSettingsUI === "function") {
            window.loadSoundSettingsUI(msg2);
          }
          break;
        case "cliStatus":
          renderCliStatus2(msg2.status);
          break;
        case "mcpServers":
          renderMcpServers2(msg2.servers);
          break;
        case "unityMCPAvailable":
          updateUnityMCPStatus2(msg2.available);
          break;
        case "insertChatMessage":
          const chatInputEl = document.getElementById("messageInput");
          if (chatInputEl) {
            chatInputEl.value = msg2.message;
            if (msg2.autoSend) {
              sendMessage2();
            }
          } else {
            console.error("[SpaceCode] messageInput element not found");
          }
          break;
        case "unityPanelUpdate":
          if (typeof updateUnityPanelInfo2 === "function") {
            updateUnityPanelInfo2(msg2.info);
          }
          break;
        case "kbEntries":
          renderKbEntries2(msg2.entries);
          break;
        case "crawlProgress":
          handleCrawlProgress2(msg2.progress);
          break;
        case "embedderStatus":
          renderEmbedderStatus2(msg2.status, msg2.stats);
          break;
        case "modelDownloadProgress":
          updateModelDownloadProgress2(msg2.progress);
          break;
        case "modelDownloadStarted":
          setModelDownloading2(true);
          break;
        case "embeddingProgress":
          updateEmbeddingProgress2(msg2.id, msg2.current, msg2.total);
          break;
        case "embedAllProgress":
          updateEmbedAllProgress2(msg2.entryIndex, msg2.totalEntries, msg2.chunkIndex, msg2.totalChunks);
          break;
        case "embedAllStarted":
          setEmbeddingAll2(true);
          break;
        case "costs":
          renderCosts2(msg2);
          break;
        case "usageStats":
          if (renderUsageStats2) {
            renderUsageStats2(msg2);
          }
          break;
        case "voiceSettings":
          loadVoiceSettings2(msg2.settings);
          break;
        case "voiceDownloadProgress":
          updateVoiceDownloadProgress2(msg2.engine, msg2.progress, msg2.status);
          break;
        case "micTestStatus":
          handleMicTestStatus2(msg2.status, msg2.message);
          break;
        case "speakerTestStatus":
          handleSpeakerTestStatus2(msg2.status, msg2.message);
          break;
        case "whisperDownloadStarted": {
          const btn = document.getElementById("whisperBinaryDownloadBtn");
          if (btn) {
            btn.disabled = true;
            btn.textContent = "Downloading...";
          }
          break;
        }
        case "whisperDownloadComplete": {
          const btn = document.getElementById("whisperBinaryDownloadBtn");
          if (btn) {
            btn.disabled = false;
            if (msg2.success) {
              btn.textContent = "\u2713 Installed";
              btn.classList.add("success");
            } else {
              btn.textContent = "Download Binary";
              const statusEl = document.getElementById("whisperStatus");
              if (statusEl && msg2.error) {
                statusEl.textContent = "Error: " + msg2.error;
                statusEl.style.color = "var(--error-color)";
              }
            }
          }
          break;
        }
        case "activeBreadcrumb": {
          const el = document.getElementById("codeBreadcrumb");
          if (el) {
            el.textContent = msg2.breadcrumb || "No active file";
            if (msg2.filePath)
              el.title = msg2.filePath;
          }
          break;
        }
        case "shipSelected":
          if (msg2.sectorId) {
            setShipSelectedSectorId2(msg2.sectorId);
            shipRender2();
            updateStationLabels2();
          }
          if (msg2.profile) {
            setShipProfile2(msg2.profile);
            const sel = document.getElementById("shipProfileSelect");
            if (sel)
              sel.value = msg2.profile;
            updateStationLabels2();
          }
          break;
        case "shipSectorDetected":
          if (msg2.sectorId && msg2.sectorId !== getShipSelectedSectorId2()) {
            setShipSelectedSectorId2(msg2.sectorId);
            setShipSelectedSubId2(null);
            shipRender2();
            updateStationLabels2();
            const fileName = msg2.filePath ? msg2.filePath.split("/").pop() : "";
            shipSetStatus2("Auto-detected: " + (msg2.sectorName || msg2.sectorId) + (fileName ? " (from " + fileName + ")" : ""));
          }
          break;
        case "shipAutoexecute":
          setShipAutoexecute2(!!msg2.enabled);
          shipUpdateChips2();
          break;
        case "shipContextPack":
          if (msg2.injectionText) {
            shipSetStatus2("Context Pack ready for " + (msg2.sectorId || getShipSelectedSectorId2()) + ".");
            addMessage2("system", "Context Pack (preview):\\n" + msg2.injectionText);
          }
          break;
        case "shipGateResult":
          shipSetStatus2(msg2.ok ? "Gates passed" : "Gates failed");
          const gatesBox = document.getElementById("gatesResult");
          const gatesStatus = document.getElementById("gatesResultStatus");
          const gatesContent = document.getElementById("gatesResultContent");
          if (gatesBox && gatesStatus && gatesContent) {
            gatesBox.style.display = "block";
            gatesStatus.textContent = msg2.ok ? "\u2705 PASSED" : "\u274C FAILED";
            gatesStatus.style.color = msg2.ok ? "#4caf50" : "#f44336";
            gatesContent.textContent = msg2.summary || "No details";
          }
          const ctrlBox = document.getElementById("controlGatesResult");
          const ctrlStatus = document.getElementById("controlGatesStatus");
          const ctrlContent = document.getElementById("controlGatesContent");
          if (ctrlBox && ctrlStatus && ctrlContent) {
            ctrlBox.style.display = "block";
            ctrlBox.style.borderLeftColor = msg2.ok ? "#4caf50" : "#f44336";
            ctrlStatus.textContent = msg2.ok ? "\u2705 PASSED" : "\u274C FAILED";
            ctrlStatus.style.color = msg2.ok ? "#4caf50" : "#f44336";
            ctrlContent.textContent = msg2.summary || "No details";
          }
          break;
        case "shipDocsStatus":
          shipSetStatus2(msg2.summary || "Docs status updated.");
          break;
        case "asmdefInventory":
          renderAsmdefInventory2(msg2.inventory || null);
          shipSetStatus2("Asmdef inventory loaded.");
          break;
        case "asmdefPolicyGenerated":
          shipSetStatus2("Asmdef policy generated.");
          if (msg2.policyPath) {
            addMessage2("system", "Asmdef policy generated at:\\n" + msg2.policyPath);
          }
          asmdefRefresh2();
          break;
        case "asmdefPolicyMode":
          shipSetStatus2("Asmdef policy set to " + (msg2.mode || "strict") + ".");
          if (msg2.policyPath) {
            addMessage2("system", "Asmdef policy updated:\\n" + msg2.policyPath);
          }
          asmdefRefresh2();
          break;
        case "asmdefPolicy":
          renderAsmdefPolicyEditor2(msg2);
          shipSetStatus2("Asmdef policy loaded.");
          break;
        case "asmdefPolicySaved":
          shipSetStatus2("Asmdef policy saved.");
          if (msg2.policyPath) {
            addMessage2("system", "Asmdef policy saved to:\\n" + msg2.policyPath);
          }
          asmdefRefresh2();
          break;
        case "asmdefGuidsNormalized":
          if (msg2.result) {
            const count = msg2.result.replacements || 0;
            shipSetStatus2(count ? "Normalized " + count + " GUID refs." : "No GUID refs to normalize.");
            if (Array.isArray(msg2.result.warnings) && msg2.result.warnings.length) {
              addMessage2("system", "GUID normalize warnings:\\n" + msg2.result.warnings.join("\\n"));
            }
          }
          asmdefRefresh2();
          break;
        case "asmdefGraph":
          renderAsmdefGraph2(msg2.graph || null);
          shipSetStatus2("Asmdef graph loaded.");
          break;
        case "asmdefCheckResult":
          renderAsmdefCheckResult2(msg2.result || null);
          shipSetStatus2("Asmdef validation complete.");
          break;
        case "sectorMapData":
          if (typeof renderSectorMap2 === "function") {
            renderSectorMap2(msg2);
            const smSummary = document.getElementById("sectorMapSummaryText");
            const smBadge = document.getElementById("sectorMapBadge");
            const smHealthBadge = document.getElementById("sectorMapHealthBadge");
            if (smSummary) {
              const sCount = (msg2.sectors || []).length;
              const vCount = msg2.totalViolations || 0;
              smSummary.textContent = sCount + " sectors" + (vCount ? " \xB7 " + vCount + " violations" : " \xB7 All clear");
            }
            if (smBadge) {
              smBadge.textContent = (msg2.sectors || []).length + " sectors";
            }
            if (smHealthBadge && typeof msg2.avgHealth === "number") {
              const pct = Math.round(msg2.avgHealth * 100);
              const hColor = pct >= 90 ? "#22c55e" : pct >= 70 ? "#f59e0b" : "#ef4444";
              const hLabel = pct >= 90 ? "Healthy" : pct >= 70 ? "Warning" : "Critical";
              let trendArrow = "";
              try {
                const TREND_KEY = "spacecode.healthTrend";
                const raw = localStorage.getItem(TREND_KEY);
                const history = raw ? JSON.parse(raw) : [];
                history.push({ t: Date.now(), h: msg2.avgHealth });
                while (history.length > 10)
                  history.shift();
                localStorage.setItem(TREND_KEY, JSON.stringify(history));
                if (history.length >= 2) {
                  const prev = history[history.length - 2].h;
                  const diff = msg2.avgHealth - prev;
                  if (diff > 0.02)
                    trendArrow = " \u2191";
                  else if (diff < -0.02)
                    trendArrow = " \u2193";
                  else
                    trendArrow = " \u2192";
                }
              } catch (_e) {
              }
              smHealthBadge.textContent = "\u25CF " + hLabel + " (" + pct + "%)" + trendArrow;
              smHealthBadge.style.color = hColor;
            } else if (smHealthBadge) {
              if (msg2.passed === true) {
                smHealthBadge.textContent = "\u25CF Healthy";
                smHealthBadge.style.color = "#22c55e";
              } else if (msg2.passed === false) {
                smHealthBadge.textContent = "\u25CF Violations";
                smHealthBadge.style.color = "#ef4444";
              } else {
                smHealthBadge.textContent = "";
              }
            }
            if (smSummary) {
              if (msg2.cycles && msg2.cycles.length > 0) {
                smSummary.textContent += " \xB7 " + msg2.cycles.length + " cycle(s)";
              }
              if (msg2.orphanFileCount > 0) {
                smSummary.textContent += " \xB7 " + msg2.orphanFileCount + " unmapped files";
              }
            }
            const tierBanner = document.getElementById("sectorMapTierBanner");
            if (tierBanner) {
              if (msg2.tier === "mapped") {
                tierBanner.style.display = "block";
                tierBanner.textContent = "\u2139 Sector config found but no .asmdef files detected. Dependency validation is limited to sector rules only.";
                tierBanner.style.borderColor = "rgba(245,158,11,0.3)";
                tierBanner.style.color = "#f59e0b";
              } else if (msg2.tier === "empty") {
                tierBanner.style.display = "block";
                tierBanner.textContent = "\u2139 No sector config or .asmdef files found. Add a .spacecode/sectors.json to define project sectors.";
                tierBanner.style.borderColor = "rgba(100,130,170,0.3)";
                tierBanner.style.color = "var(--text-secondary)";
              } else {
                tierBanner.style.display = "none";
              }
            }
            shipSetStatus2("Sector map loaded.");
          }
          break;
        case "sectorMapDetail": {
          const card = document.getElementById("sectorDetailCard");
          const nameEl = document.getElementById("sectorDetailName");
          const techEl = document.getElementById("sectorDetailTech");
          const healthEl = document.getElementById("sectorDetailHealth");
          const depsEl = document.getElementById("sectorDetailDeps");
          const descEl = document.getElementById("sectorDetailDesc");
          const boundariesEl = document.getElementById("sectorDetailBoundaries");
          const boundariesListEl = document.getElementById("sectorDetailBoundariesList");
          const violationsEl = document.getElementById("sectorDetailViolations");
          const violationsListEl = document.getElementById("sectorDetailViolationsList");
          const scriptsEl = document.getElementById("sectorDetailScripts");
          if (card && msg2.sector) {
            card.style.display = "block";
            card.style.borderLeftColor = msg2.sector.color || "#6366f1";
            if (nameEl) {
              nameEl.textContent = msg2.sector.name;
              nameEl.dataset.sectorId = msg2.sector.id;
            }
            if (techEl)
              techEl.textContent = msg2.sector.id + " \xB7 " + (msg2.sector.paths || []).join(", ");
            if (healthEl)
              healthEl.textContent = msg2.sector.approvalRequired ? "\u26A0 Approval required for changes" : "";
            if (depsEl)
              depsEl.textContent = (msg2.sector.dependencies || []).length > 0 ? "Dependencies: " + msg2.sector.dependencies.join(", ") : "No dependencies";
            if (descEl)
              descEl.textContent = msg2.sector.description || "";
            if (boundariesEl && boundariesListEl) {
              const paths = msg2.sector.paths || [];
              if (paths.length > 0) {
                boundariesEl.style.display = "block";
                boundariesListEl.innerHTML = paths.map(function(p) {
                  return '<div style="padding:1px 0;">\u2713 ' + escapeHtml2(p) + "</div>";
                }).join("");
              } else {
                boundariesEl.style.display = "none";
              }
            }
            if (violationsEl && violationsListEl) {
              const violations = msg2.sector.violations || [];
              if (violations.length > 0) {
                violationsEl.style.display = "block";
                violationsListEl.innerHTML = violations.map(function(v) {
                  return '<div style="padding:1px 0; color:#f87171;">\u2717 ' + escapeHtml2((v.asmdefName || v.asmdef || "?") + " \u2192 " + (v.reference || v.ref || "?")) + (v.suggestion ? '<div style="color:var(--text-secondary); margin-left:14px;">' + escapeHtml2(v.suggestion) + "</div>" : "") + "</div>";
                }).join("");
              } else {
                violationsEl.style.display = "none";
              }
            }
            if (scriptsEl) {
              const scripts = msg2.sector.scripts || 0;
              if (scripts > 0) {
                scriptsEl.style.display = "block";
                scriptsEl.textContent = "Assemblies: " + scripts;
              } else {
                scriptsEl.style.display = "none";
              }
            }
          }
          break;
        }
        case "sectorConfigData": {
          const list = document.getElementById("sectorConfigList");
          const templateSelect2 = document.getElementById("sectorTemplateSelect");
          const statusEl = document.getElementById("sectorConfigStatus");
          if (list) {
            list.innerHTML = "";
            const sectors = msg2.sectors || [];
            sectors.forEach(function(s, idx) {
              const row = document.createElement("div");
              row.className = "sector-config-row";
              row.dataset.index = String(idx);
              row.dataset.description = s.description || "";
              row.dataset.rules = s.rules || "";
              row.dataset.icon = s.icon || "cpu";
              row.innerHTML = '<div style="display:flex; gap:4px; align-items:center;"><input type="color" value="' + (s.color || "#6366f1") + '" class="sector-color-input" /><input type="text" value="' + escapeHtml2(s.id || "") + '" class="sector-id-input" style="width:80px;" /><input type="text" value="' + escapeHtml2(s.name || "") + '" class="sector-name-input" style="flex:1;" /><button class="btn-secondary" onclick="sectorConfigRemoveRow(this)" style="padding:2px 6px; font-size:10px;">&#x2715;</button></div><div style="display:flex; gap:4px; margin-top:3px;"><input type="text" value="' + escapeHtml2((s.paths || []).join(", ")) + '" class="sector-paths-input" style="flex:1;" placeholder="Paths: **/Folder/**" /></div><div style="display:flex; gap:4px; margin-top:3px;"><input type="text" value="' + escapeHtml2((s.dependencies || []).join(", ")) + '" class="sector-deps-input" style="flex:1;" placeholder="Dependencies: core, inventory" /><label style="font-size:9px; display:flex; align-items:center; gap:2px; white-space:nowrap;"><input type="checkbox" class="sector-approval-input" ' + (s.approvalRequired ? "checked" : "") + " /> Approval</label></div>";
              list.appendChild(row);
            });
          }
          if (templateSelect2 && msg2.templates) {
            templateSelect2.innerHTML = '<option value="">(custom)</option>';
            msg2.templates.forEach(function(t) {
              const opt = document.createElement("option");
              opt.value = t.id;
              opt.textContent = t.label + " (" + t.sectorCount + " sectors)";
              templateSelect2.appendChild(opt);
            });
            if (msg2.appliedTemplate) {
              templateSelect2.value = msg2.appliedTemplate;
            }
          }
          if (statusEl) {
            if (msg2.imported) {
              statusEl.textContent = "Imported " + (msg2.sectors || []).length + " sectors. Click Save to apply.";
            } else if (msg2.appliedTemplate) {
              statusEl.textContent = "Template applied. Click Save to persist.";
            } else {
              statusEl.textContent = (msg2.sectors || []).length + " sectors loaded.";
            }
          }
          break;
        }
        case "sectorConfigSaved": {
          const statusEl2 = document.getElementById("sectorConfigStatus");
          if (statusEl2)
            statusEl2.textContent = "Configuration saved to " + (msg2.configPath || "disk") + ".";
          shipSetStatus2("Sector configuration saved. Map refreshed.");
          break;
        }
        case "sectorConfigSuggested": {
          const list2 = document.getElementById("sectorConfigList");
          const statusEl3 = document.getElementById("sectorConfigStatus");
          const detected = msg2.sectors || [];
          if (detected.length === 0) {
            if (statusEl3)
              statusEl3.textContent = "No sectors detected. Add manually or choose a template.";
            break;
          }
          if (list2) {
            list2.innerHTML = "";
            detected.forEach(function(s, idx) {
              const row = document.createElement("div");
              row.className = "sector-config-row";
              row.dataset.index = String(idx);
              row.dataset.description = s.description || "";
              row.dataset.rules = s.rules || "";
              row.dataset.icon = s.icon || "cpu";
              row.innerHTML = '<div style="display:flex; gap:4px; align-items:center;"><input type="color" value="' + (s.color || "#6366f1") + '" class="sector-color-input" /><input type="text" value="' + escapeHtml2(s.id || "") + '" class="sector-id-input" style="width:80px;" /><input type="text" value="' + escapeHtml2(s.name || "") + '" class="sector-name-input" style="flex:1;" /><span style="font-size:9px; color:var(--text-secondary); padding:0 4px;">' + escapeHtml2(s.source || "") + '</span><button class="btn-secondary" onclick="sectorConfigRemoveRow(this)" style="padding:2px 6px; font-size:10px;">&#x2715;</button></div><div style="display:flex; gap:4px; margin-top:3px;"><input type="text" value="' + escapeHtml2((s.paths || []).join(", ")) + '" class="sector-paths-input" style="flex:1;" /></div><div style="display:flex; gap:4px; margin-top:3px;"><input type="text" value="' + escapeHtml2((s.dependencies || []).join(", ")) + '" class="sector-deps-input" style="flex:1;" /><label style="font-size:9px; display:flex; align-items:center; gap:2px; white-space:nowrap;"><input type="checkbox" class="sector-approval-input" /> Approval</label></div>';
              list2.appendChild(row);
            });
          }
          if (statusEl3)
            statusEl3.textContent = "Detected " + detected.length + " sectors. Review and Save.";
          break;
        }
        case "sectorConfigExported": {
          const statusEl4 = document.getElementById("sectorConfigStatus");
          if (statusEl4)
            statusEl4.textContent = "Exported to " + (msg2.path || "file") + ".";
          shipSetStatus2("Sector config exported.");
          break;
        }
        case "engineerStatus": {
          if (typeof engineerRenderStatus2 === "function") {
            engineerRenderStatus2(msg2);
          }
          break;
        }
        case "engineerSuggestions": {
          if (typeof engineerRenderSuggestions2 === "function") {
            engineerRenderSuggestions2(msg2.suggestions || []);
            engineerCheckSectors2(msg2.suggestions || []);
          }
          break;
        }
        case "engineerHistory": {
          if (typeof engineerRenderHistory2 === "function") {
            engineerRenderHistory2(msg2.history || []);
          }
          break;
        }
        case "engineerPrompt": {
          if (typeof engineerRenderPrompt2 === "function") {
            engineerRenderPrompt2(msg2);
          }
          break;
        }
        case "engineerDelegated": {
          if (typeof engineerHandleDelegated2 === "function") {
            engineerHandleDelegated2(msg2);
          }
          break;
        }
        case "coordinatorHealth": {
          if (msg2.url) {
            const urlEl = document.getElementById("coordinatorUrlLabel");
            if (urlEl)
              urlEl.textContent = msg2.url;
            const urlPanelEl = document.getElementById("coordinatorUrlLabelPanel");
            if (urlPanelEl)
              urlPanelEl.textContent = msg2.url;
          }
          let healthIssue = "none";
          if (!msg2.ok) {
            healthIssue = msg2.status === "disabled" ? "disabled" : "disconnected";
          }
          const badge = document.getElementById("coordinatorStatusBadge");
          const badgePanel = document.getElementById("coordinatorStatusBadgePanel");
          if (badge) {
            badge.classList.remove("ok", "bad", "muted");
            if (msg2.ok) {
              badge.textContent = "Connected";
              badge.classList.add("ok");
              shipSetStatus2("Coordinator connected.");
            } else if (msg2.status === "disabled") {
              badge.textContent = "Disabled";
              badge.classList.add("muted");
              shipSetStatus2("Coordinator disabled.");
            } else {
              badge.textContent = "Disconnected";
              badge.classList.add("bad");
              shipSetStatus2("Coordinator disconnected.");
              const key = "coordinator-health:disconnected";
              if (lastCoordinatorToast2 !== key) {
                showToast2("Coordinator disconnected.", "error");
                lastCoordinatorToast2 = key;
                setLastCoordinatorToast(lastCoordinatorToast2);
              }
            }
          }
          if (badgePanel) {
            badgePanel.classList.remove("ok", "bad", "muted");
            if (msg2.ok) {
              badgePanel.textContent = "Connected";
              badgePanel.classList.add("ok");
            } else if (msg2.status === "disabled") {
              badgePanel.textContent = "Disabled";
              badgePanel.classList.add("muted");
            } else {
              badgePanel.textContent = "Disconnected";
              badgePanel.classList.add("bad");
            }
          }
          updateCoordinatorLastIssue2("coordinatorLastIssue", healthIssue);
          updateCoordinatorLastIssue2("coordinatorLastIssuePanel", healthIssue);
          break;
        }
        case "coordinatorSync": {
          const sync = msg2.sync || {};
          const status = msg2.status || {};
          const policyEl = document.getElementById("coordinatorPolicySync");
          const invEl = document.getElementById("coordinatorInventorySync");
          const graphEl = document.getElementById("coordinatorGraphSync");
          if (policyEl)
            policyEl.textContent = formatRelativeTime(sync.policy);
          if (invEl)
            invEl.textContent = formatRelativeTime(sync.inventory);
          if (graphEl)
            graphEl.textContent = formatRelativeTime(sync.graph);
          const policyStatusEl = document.getElementById("coordinatorPolicyStatus");
          const invStatusEl = document.getElementById("coordinatorInventoryStatus");
          const graphStatusEl = document.getElementById("coordinatorGraphStatus");
          setCoordinatorPill2(policyStatusEl, status.policy || "unknown");
          setCoordinatorPill2(invStatusEl, status.inventory || "unknown");
          setCoordinatorPill2(graphStatusEl, status.graph || "unknown");
          const policyPanelEl = document.getElementById("coordinatorPolicySyncPanel");
          const invPanelEl = document.getElementById("coordinatorInventorySyncPanel");
          const graphPanelEl = document.getElementById("coordinatorGraphSyncPanel");
          if (policyPanelEl)
            policyPanelEl.textContent = formatRelativeTime(sync.policy);
          if (invPanelEl)
            invPanelEl.textContent = formatRelativeTime(sync.inventory);
          if (graphPanelEl)
            graphPanelEl.textContent = formatRelativeTime(sync.graph);
          const policyStatusPanelEl = document.getElementById("coordinatorPolicyStatusPanel");
          const invStatusPanelEl = document.getElementById("coordinatorInventoryStatusPanel");
          const graphStatusPanelEl = document.getElementById("coordinatorGraphStatusPanel");
          setCoordinatorPill2(policyStatusPanelEl, status.policy || "unknown");
          setCoordinatorPill2(invStatusPanelEl, status.inventory || "unknown");
          setCoordinatorPill2(graphStatusPanelEl, status.graph || "unknown");
          updateCoordinatorSummary2("coordinatorSummary", status);
          updateCoordinatorSummary2("coordinatorSummaryPanel", status);
          const issues = ["policy", "inventory", "graph"].filter((k) => status[k] && status[k] !== "ok" && status[k] !== "unknown");
          updateCoordinatorLastIssue2("coordinatorLastIssue", issues.length ? issues.map((k) => k + ":" + status[k]).join(", ") : "none");
          updateCoordinatorLastIssue2("coordinatorLastIssuePanel", issues.length ? issues.map((k) => k + ":" + status[k]).join(", ") : "none");
          if (issues.length) {
            const key = "coordinator-sync:" + issues.map((k) => k + "=" + status[k]).join(",");
            if (lastCoordinatorToast2 !== key) {
              showToast2("Coordinator sync issues: " + issues.map((k) => k + ":" + status[k]).join(", "), "warn");
              lastCoordinatorToast2 = key;
              setLastCoordinatorToast(lastCoordinatorToast2);
            }
          }
          break;
        }
        case "autoexecuteJobs":
          renderJobList2(msg2.jobs || []);
          break;
        case "autoexecuteBlocked":
          shipSetStatus2(msg2.message || "Action blocked; enable Autoexecute.");
          break;
        case "planningStateUpdate":
          if (typeof renderPlanningPanel2 === "function") {
            renderPlanningPanel2(msg2.state);
          }
          break;
        case "planningError":
          shipSetStatus2(msg2.error || "Planning error.");
          break;
        case "contextPreview":
          if (typeof msg2.text === "string") {
            setContextPreview2(msg2.text);
          }
          break;
        case "aiFlowStart":
          console.log("[SpaceCode] aiFlowStart:", msg2.query);
          startAiFlow2(msg2.query, msg2.queryTokens);
          setAiStage2("retrieving", "Retrieving context...");
          clearContextSources2();
          hideLiveResponse2();
          break;
        case "aiFlowChunk":
          console.log("[SpaceCode] aiFlowChunk:", msg2.chunk);
          if (msg2.chunk) {
            spawnFlowChunk2(msg2.chunk);
            addContextSourceCard2(msg2.chunk);
          }
          break;
        case "aiFlowThinking":
          console.log("[SpaceCode] aiFlowThinking:", msg2.stage, "provider:", msg2.provider, "nodeId:", msg2.nodeId, "modelLabel:", msg2.modelLabel);
          setFlowThinking2(true, msg2.stage, msg2.provider, msg2.nodeId || "main", msg2.modelLabel);
          setAiStage2("generating", msg2.stage || "Generating response...");
          showLiveResponse2();
          break;
        case "aiFlowComplete":
          console.log("[SpaceCode] aiFlowComplete, tokens:", msg2.tokens, "gptFlowPending:", _gptFlowPending2);
          if (_gptFlowPending2) {
            console.log("[SpaceCode] aiFlowComplete ignored \u2014 GPT consultation still pending");
            break;
          }
          setFlowThinking2(false);
          stopThreadAnimation2();
          stopParticleSpawning2();
          stopParticleFlow2();
          const phaseEl = document.getElementById("flowPanelPhase");
          if (phaseEl)
            phaseEl.textContent = msg2.error ? "Error" : "Complete";
          break;
        case "aiFlowUpdate":
          console.log("[SpaceCode] aiFlowUpdate (legacy):", msg2.data);
          if (msg2.data) {
            renderAiFlow2(msg2.data);
          }
          break;
        case "aiFlowClear":
          clearAiFlow2();
          break;
        case "docTargets":
          populateDocTargets2(Array.isArray(msg2.targets) ? msg2.targets : []);
          break;
        case "docInfo":
          updateDocInfo2(msg2.info || null);
          break;
        case "unityStatus":
          setUnityButtonsLoading2(false);
          updateUnityStatus2(msg2.status || { connected: false }, msg2.token);
          break;
        case "unityConsole":
          updateUnityConsole2(msg2.messages || []);
          break;
        case "unityLogs":
          console.log("[SpaceCode UI] Received unityLogs:", msg2.logs);
          setUnityButtonsLoading2(false);
          {
            const statusEl = document.getElementById("unityStatus");
            if (statusEl && (statusEl.textContent === "\u25CF Loading..." || statusEl.textContent === "\u25CF Running...")) {
              statusEl.className = "unity-status connected";
              statusEl.textContent = "\u25CF Connected";
              unityConnected = true;
              setUnityConnected2(unityConnected);
              updateUnityMCPStatus2(true);
            }
          }
          if (msg2.logs) {
            let logs = [];
            if (typeof msg2.logs === "string") {
              logs = msg2.logs.split("\\n").filter((l) => l.trim()).map((l) => {
                const isError = l.includes("Error") || l.includes("Exception");
                const isWarning = l.includes("Warning");
                return { type: isError ? "Error" : isWarning ? "Warning" : "Log", message: l };
              });
            } else if (Array.isArray(msg2.logs)) {
              logs = msg2.logs.map((l) => {
                if (typeof l === "string") {
                  const isError = l.includes("Error") || l.includes("Exception");
                  const isWarning = l.includes("Warning");
                  return { type: isError ? "Error" : isWarning ? "Warning" : "Log", message: l };
                }
                return {
                  type: l.type === "error" ? "Error" : l.type === "warning" ? "Warning" : l.type === "log" ? "Log" : l.type || "Log",
                  message: l.message || l.text || String(l)
                };
              });
            } else if (msg2.logs.logs) {
              logs = msg2.logs.logs.map((l) => ({
                type: l.logType === "Error" ? "Error" : l.logType === "Warning" ? "Warning" : "Log",
                message: l.message || l.text || String(l)
              }));
            }
            console.log("[SpaceCode UI] Normalized logs:", logs);
            if (logs.length > 0) {
              updateUnityConsole2(logs);
              shipSetStatus2("Showing " + logs.length + " log entries");
            } else {
              shipSetStatus2("No logs to display");
            }
          }
          break;
        case "unityErrors":
          console.log("[SpaceCode UI] Received unityErrors:", msg2);
          setUnityButtonsLoading2(false);
          {
            const statusEl = document.getElementById("unityStatus");
            if (statusEl && (statusEl.textContent === "\u25CF Loading..." || statusEl.textContent === "\u25CF Running...")) {
              statusEl.className = "unity-status connected";
              statusEl.textContent = "\u25CF Connected";
              unityConnected = true;
              setUnityConnected2(unityConnected);
              updateUnityMCPStatus2(true);
            }
          }
          if (msg2.hasErrors && msg2.errors) {
            let errorMsgs = [];
            if (typeof msg2.errors === "string") {
              errorMsgs = [{ type: "Error", message: msg2.errors }];
            } else if (Array.isArray(msg2.errors)) {
              errorMsgs = msg2.errors.map((e) => ({ type: "Error", message: typeof e === "string" ? e : e.message || String(e) }));
            }
            console.log("[SpaceCode UI] Showing", errorMsgs.length, "compile errors");
            updateUnityConsole2(errorMsgs);
            shipSetStatus2("Found " + errorMsgs.length + " compile error(s)");
          } else {
            updateUnityConsole2([{ type: "Log", message: "No compile errors - all clear!" }]);
            shipSetStatus2("No compile errors in Unity");
          }
          break;
        case "diffResult":
          updateDiffSummary2(msg2.diff || null);
          break;
        case "planComparisonResult":
          updatePlanComparison2(msg2.result || null);
          break;
        case "testResult":
          updateTestResult2(msg2);
          break;
        case "planTemplates":
          planTemplates2 = Array.isArray(msg2.templates) ? msg2.templates : [];
          setPlanTemplates(planTemplates2);
          const templateSelect = document.getElementById("planTemplateSelect");
          if (templateSelect) {
            templateSelect.innerHTML = '<option value="">(no template)</option>';
            planTemplates2.forEach((t) => {
              const opt = document.createElement("option");
              opt.value = t.id;
              opt.textContent = t.name + " (" + t.category + ")";
              templateSelect.appendChild(opt);
            });
          }
          shipSetStatus2("Plan templates loaded.");
          break;
        case "planList":
          planList2 = Array.isArray(msg2.plans) ? msg2.plans : [];
          setPlanList(planList2);
          renderPlanList2(planList2);
          break;
        case "planGenerated":
          currentPlanData2 = msg2.plan || null;
          setCurrentPlanData(currentPlanData2);
          renderPlanSummary2(currentPlanData2);
          const saveBtn = document.getElementById("savePlanBtn");
          const useBtn = document.getElementById("usePlanBtn");
          if (saveBtn)
            saveBtn.disabled = !currentPlanData2;
          if (useBtn)
            useBtn.disabled = !currentPlanData2;
          setPlanExecutionButtonsEnabled2(!!currentPlanData2);
          shipSetStatus2("Plan generated.");
          break;
        case "planLoaded":
          currentPlanData2 = msg2.plan || null;
          setCurrentPlanData(currentPlanData2);
          renderPlanSummary2(currentPlanData2);
          const saveBtn2 = document.getElementById("savePlanBtn");
          const useBtn2 = document.getElementById("usePlanBtn");
          if (saveBtn2)
            saveBtn2.disabled = !currentPlanData2;
          if (useBtn2)
            useBtn2.disabled = !currentPlanData2;
          setPlanExecutionButtonsEnabled2(!!currentPlanData2);
          shipSetStatus2(currentPlanData2 ? "Plan loaded." : "Plan not found.");
          break;
        case "planSaved":
          currentPlanData2 = msg2.plan || currentPlanData2;
          setCurrentPlanData(currentPlanData2);
          renderPlanSummary2(currentPlanData2);
          shipSetStatus2("Plan saved.");
          break;
        case "planError":
          shipSetStatus2(msg2.error || "Plan error.");
          break;
        case "ticketList":
          ticketList2 = Array.isArray(msg2.tickets) ? msg2.tickets : [];
          setTicketList(ticketList2);
          renderTicketList2(ticketList2);
          renderTicketsListMain2(ticketList2);
          break;
        case "ticketCreated":
        case "ticketUpdated":
          break;
        case "ticketError":
          shipSetStatus2(msg2.error || "Ticket error.");
          break;
        case "ticketRouted": {
          const agentNames = { nova: "Nova", gears: "Gears", index: "Index", triage: "Triage", vault: "Vault", palette: "Palette" };
          const name = agentNames[msg2.assignedTo] || msg2.assignedTo;
          showToast2("Ticket routed to " + name + " (" + msg2.ticketType + ")", "success");
          shipSetStatus2("Ticket assigned to " + name);
          break;
        }
        case "ticketRouting": {
          console.log("[SpaceCode] Ticket routing policy:", msg2.routing);
          break;
        }
        case "handoffCreated": {
          if (msg2.handoff) {
            showToast2("Handoff sent to " + (msg2.handoff.toPersona || "?"), "success");
            shipSetStatus2("Context sent to " + (msg2.handoff.toPersona || "?"));
          }
          break;
        }
        case "handoffNotification": {
          if (msg2.handoff && msg2.personaName) {
            showToast2("Incoming context from " + (msg2.handoff.fromPersona || "?") + " for " + msg2.personaName, "info");
          }
          break;
        }
        case "handoffList": {
          console.log("[SpaceCode] Handoffs:", msg2.handoffs);
          break;
        }
        case "handoffReceived": {
          if (msg2.handoff) {
            addMessage2("system", "Context received from " + (msg2.handoff.fromPersona || "?") + ": " + (msg2.handoff.summary || ""));
          }
          break;
        }
        case "handoffDismissed": {
          shipSetStatus2("Handoff dismissed.");
          break;
        }
        case "autosolveNotification": {
          if (msg2.result) {
            showToast2("Autosolve completed: " + (msg2.result.title || "task"), "success");
            shipSetStatus2("Autosolve: " + (msg2.result.title || "task completed"));
            const badge = document.getElementById("autosolveBadge");
            if (badge) {
              badge.textContent = String(msg2.pendingCount || 0);
              badge.style.display = msg2.pendingCount > 0 ? "inline-flex" : "none";
            }
          }
          break;
        }
        case "autosolveCreated": {
          if (msg2.result) {
            showToast2("Autosolve result queued: " + (msg2.result.title || ""), "info");
          }
          break;
        }
        case "autosolveList": {
          const listEl = document.getElementById("autosolveList");
          if (listEl && Array.isArray(msg2.results)) {
            listEl.innerHTML = "";
            if (msg2.results.length === 0) {
              listEl.innerHTML = '<div style="color:var(--text-secondary);font-size:11px;">No autosolve results.</div>';
            } else {
              msg2.results.forEach((r) => {
                const item = document.createElement("div");
                item.className = "autosolve-item" + (r.status === "pending" ? " pending" : "");
                const statusColor = r.status === "pending" ? "#f59e0b" : r.status === "accepted" ? "#10b981" : "#9aa3b2";
                item.innerHTML = '<div class="autosolve-item-header"><strong>' + (r.title || "Task") + '</strong><span style="color:' + statusColor + ';font-size:10px;">' + (r.status || "").toUpperCase() + '</span></div><div style="font-size:11px;color:var(--text-secondary);">' + (r.summary || "").slice(0, 120) + "</div>" + (r.changes && r.changes.length > 0 ? '<div style="font-size:10px;color:var(--text-secondary);">' + r.changes.length + " file(s) changed</div>" : "");
                if (r.status === "pending") {
                  const actions = document.createElement("div");
                  actions.className = "autosolve-actions";
                  actions.innerHTML = `<button class="btn-secondary" onclick="autosolveAccept('` + r.id + `')">Accept</button><button class="btn-secondary" onclick="autosolveSendToIndex('` + r.id + `')">Send to Index</button><button class="btn-secondary" onclick="autosolveDismiss('` + r.id + `')">Dismiss</button>`;
                  item.appendChild(actions);
                }
                listEl.appendChild(item);
              });
            }
          }
          const asolveBadge = document.getElementById("autosolveBadge");
          if (asolveBadge) {
            asolveBadge.textContent = String(msg2.pendingCount || 0);
            asolveBadge.style.display = msg2.pendingCount > 0 ? "inline-flex" : "none";
          }
          break;
        }
        case "autosolveViewed":
        case "autosolveAccepted":
        case "autosolveDismissed":
        case "autosolveSentToIndex": {
          vscode2.postMessage({ type: "autosolveList" });
          if (msg2.type === "autosolveSentToIndex") {
            showToast2("Changes sent to Index for documentation", "success");
          }
          break;
        }
        case "skillsList":
          renderSkillsList2(Array.isArray(msg2.skills) ? msg2.skills : []);
          break;
        case "skillCreated":
        case "skillUpdated":
          break;
        case "skillError":
          shipSetStatus2(msg2.error || "Skill error.");
          break;
        case "agentList": {
          const agentListEl = document.getElementById("agentStatusList");
          if (agentListEl && Array.isArray(msg2.agents)) {
            agentListEl.innerHTML = msg2.agents.map((a) => {
              const statusColors = { active: "#10b981", working: "#f59e0b", idle: "#666" };
              const sc = statusColors[a.status] || "#666";
              return `<div class="agent-status-card" onclick="viewAgentDetails('` + a.id + `')" style="cursor:pointer;"><div style="display:flex;align-items:center;gap:8px;"><span class="persona-dot" style="background:` + (a.color || "#888") + ';width:10px;height:10px;"></span><strong style="font-size:12px;">' + (a.name || a.id) + '</strong><span style="font-size:10px;color:var(--text-secondary);">' + (a.title || "") + '</span></div><div style="display:flex;align-items:center;gap:6px;"><span style="font-size:10px;color:' + sc + ';">' + (a.status || "idle").toUpperCase() + "</span></div></div>";
            }).join("");
          }
          break;
        }
        case "agentDetails": {
          const detailEl = document.getElementById("agentDetailsPanel");
          if (detailEl && msg2.agent) {
            const a = msg2.agent;
            const skillsHtml = Array.isArray(msg2.skills) ? msg2.skills.map(
              (s) => '<span style="display:inline-block;padding:2px 8px;background:var(--bg-hover);border-radius:12px;font-size:10px;margin:2px;">' + (s.command ? s.command + " " : "") + s.name + "</span>"
            ).join("") : "";
            detailEl.innerHTML = '<div style="padding:10px;"><h4 style="color:' + (a.color || "#888") + ';margin-bottom:4px;">' + a.name + " \u2014 " + a.title + '</h4><p style="font-size:11px;color:var(--text-secondary);margin-bottom:8px;">' + (a.description || "") + '</p><div style="margin-bottom:6px;"><strong style="font-size:11px;">Specialties:</strong></div>' + (Array.isArray(a.specialties) ? '<div style="margin-bottom:8px;">' + a.specialties.map(
              (s) => '<span style="display:inline-block;padding:2px 8px;background:var(--bg-tertiary);border-radius:12px;font-size:10px;margin:2px;">' + s + "</span>"
            ).join("") + "</div>" : "") + '<div style="margin-bottom:4px;"><strong style="font-size:11px;">Skills:</strong></div><div>' + skillsHtml + "</div></div>";
            detailEl.style.display = "block";
          }
          break;
        }
        case "skillList": {
          renderSkillsList2(Array.isArray(msg2.skills) ? msg2.skills : []);
          const skillCatalogEl = document.getElementById("skillCatalog");
          if (skillCatalogEl && Array.isArray(msg2.skills)) {
            const categories = {};
            msg2.skills.forEach((s) => {
              const cat = s.category || "other";
              if (!categories[cat])
                categories[cat] = [];
              categories[cat].push(s);
            });
            let html = "";
            for (const [cat, skills] of Object.entries(categories)) {
              html += '<div style="margin-bottom:8px;"><strong style="font-size:11px;text-transform:capitalize;">' + cat + "</strong></div>";
              html += skills.map(
                (s) => '<div style="padding:4px 8px;background:var(--bg-tertiary);border-radius:4px;margin-bottom:3px;font-size:11px;display:flex;justify-content:space-between;"><span>' + (s.command ? '<code style="color:var(--accent-color);">' + s.command + "</code> " : "") + s.name + '</span><span style="color:var(--text-secondary);font-size:10px;">' + (s.agents || []).join(", ") + "</span></div>"
              ).join("");
            }
            skillCatalogEl.innerHTML = html || '<div style="color:var(--text-secondary);font-size:11px;">No skills available.</div>';
          }
          break;
        }
        case "skillTriggered": {
          if (msg2.skill) {
            showToast2("Skill triggered: " + msg2.skill.name, "info");
          }
          break;
        }
        case "dashboardMetrics":
          updateDashboardMetrics2(msg2.metrics || {});
          break;
        case "recentActivity":
          renderActivityList2(Array.isArray(msg2.activities) ? msg2.activities : []);
          break;
        case "docsStats":
          updateDocsPanel2(msg2.stats);
          break;
        case "securityScanStarted": {
          const scanBtn = document.getElementById("securityScanBtn");
          if (scanBtn) {
            scanBtn.disabled = true;
            scanBtn.textContent = "Scanning...";
          }
          const emptyEl = document.getElementById("securityEmpty");
          if (emptyEl)
            emptyEl.style.display = "none";
          shipSetStatus2("Security scan started...");
          break;
        }
        case "securityScanResult": {
          const scanBtn = document.getElementById("securityScanBtn");
          if (scanBtn) {
            scanBtn.disabled = false;
            scanBtn.textContent = "Scan";
          }
          const exportBtn = document.getElementById("securityExportBtn");
          if (exportBtn)
            exportBtn.disabled = false;
          const r = msg2.result;
          if (!r)
            break;
          const scoreCard = document.getElementById("securityScoreCard");
          if (scoreCard)
            scoreCard.style.display = "block";
          const scoreEl = document.getElementById("securityScore");
          if (scoreEl)
            scoreEl.textContent = String(r.score);
          const passBadge = document.getElementById("securityPassBadge");
          if (passBadge) {
            passBadge.textContent = r.passed ? "PASSED" : "FAILED";
            passBadge.style.background = r.passed ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)";
            passBadge.style.color = r.passed ? "#22c55e" : "#ef4444";
          }
          const summaryEl = document.getElementById("securitySummaryText");
          if (summaryEl)
            summaryEl.textContent = r.summary || "";
          const sev = r.findingsBySeverity || {};
          const critEl = document.getElementById("securityCritical");
          if (critEl)
            critEl.textContent = sev.critical ? sev.critical + " critical" : "";
          const highEl = document.getElementById("securityHigh");
          if (highEl)
            highEl.textContent = sev.high ? sev.high + " high" : "";
          const medEl = document.getElementById("securityMedium");
          if (medEl)
            medEl.textContent = sev.medium ? sev.medium + " medium" : "";
          const lowEl = document.getElementById("securityLow");
          if (lowEl)
            lowEl.textContent = sev.low ? sev.low + " low" : "";
          const listEl = document.getElementById("securityFindingsList");
          if (listEl && Array.isArray(r.findings)) {
            if (r.findings.length === 0) {
              listEl.innerHTML = '<div style="color:var(--text-secondary); text-align:center; padding:8px;">No issues found</div>';
            } else {
              listEl.innerHTML = r.findings.slice(0, 50).map(function(f) {
                const sevColor = f.severity === "critical" ? "#ef4444" : f.severity === "high" ? "#f97316" : f.severity === "medium" ? "#eab308" : "#6b7280";
                const relPath = f.file ? f.file.split("/").slice(-2).join("/") : "?";
                return '<div style="padding:4px 6px; border-left:2px solid ' + sevColor + '; margin-bottom:3px; background:var(--bg-primary); border-radius:0 4px 4px 0;"><div style="display:flex; justify-content:space-between;"><span style="color:' + sevColor + '; font-weight:600;">' + escapeHtml2(f.severity.toUpperCase()) + '</span><span style="color:var(--text-secondary); font-size:9px;">' + escapeHtml2(f.category || "") + "</span></div><div>" + escapeHtml2(f.title || f.message || "") + '</div><div style="color:var(--text-secondary); font-size:9px;">' + escapeHtml2(relPath) + ":" + (f.line || "?") + "</div></div>";
              }).join("");
            }
          }
          const emptyEl = document.getElementById("securityEmpty");
          if (emptyEl)
            emptyEl.style.display = "none";
          shipSetStatus2("Security scan: " + (r.passed ? "Passed" : "Issues found") + " (" + r.score + "/100)");
          break;
        }
        case "securityScanError": {
          const scanBtn = document.getElementById("securityScanBtn");
          if (scanBtn) {
            scanBtn.disabled = false;
            scanBtn.textContent = "Scan";
          }
          shipSetStatus2("Security scan error: " + (msg2.error || "Unknown"));
          break;
        }
        case "securityExportResult": {
          if (msg2.markdown) {
            addMessage2("system", "Security Report:\\n" + msg2.markdown);
          }
          shipSetStatus2("Security report exported.");
          break;
        }
        case "securityFixHandoff": {
          if (msg2.handoff) {
            addMessage2("system", "Fix handoff created for: " + (msg2.handoff.finding?.title || "security issue"));
          }
          break;
        }
        case "qualityScanStarted": {
          const scanBtn = document.getElementById("qualityScanBtn");
          if (scanBtn) {
            scanBtn.disabled = true;
            scanBtn.textContent = "Scanning...";
          }
          const emptyEl = document.getElementById("qualityEmpty");
          if (emptyEl)
            emptyEl.style.display = "none";
          shipSetStatus2("Quality scan started...");
          break;
        }
        case "qualityScanResult": {
          const scanBtn = document.getElementById("qualityScanBtn");
          if (scanBtn) {
            scanBtn.disabled = false;
            scanBtn.textContent = "Scan";
          }
          const exportBtn = document.getElementById("qualityExportBtn");
          if (exportBtn)
            exportBtn.disabled = false;
          const q = msg2.result;
          if (!q)
            break;
          const scoreCard = document.getElementById("qualityScoreCard");
          if (scoreCard)
            scoreCard.style.display = "block";
          const scoreEl = document.getElementById("qualityScore");
          if (scoreEl)
            scoreEl.textContent = String(q.score);
          const passBadge = document.getElementById("qualityPassBadge");
          if (passBadge) {
            passBadge.textContent = q.passed ? "PASSED" : "NEEDS WORK";
            passBadge.style.background = q.passed ? "rgba(34,197,94,0.15)" : "rgba(245,158,11,0.15)";
            passBadge.style.color = q.passed ? "#22c55e" : "#f59e0b";
          }
          const summaryEl = document.getElementById("qualitySummaryText");
          if (summaryEl)
            summaryEl.textContent = q.filesScanned + " files scanned in " + q.duration + "ms";
          const m = q.metrics || {};
          const cxEl = document.getElementById("qualityMetricComplexity");
          if (cxEl)
            cxEl.textContent = "Complexity: " + (m.averageComplexity != null ? m.averageComplexity.toFixed(1) : "\u2014");
          const dupEl = document.getElementById("qualityMetricDuplication");
          if (dupEl)
            dupEl.textContent = "Duplication: " + (m.duplicateLinePercentage != null ? m.duplicateLinePercentage.toFixed(1) + "%" : "\u2014");
          const dcEl = document.getElementById("qualityMetricDeadCode");
          if (dcEl)
            dcEl.textContent = "Dead code: " + (m.deadCodePercentage != null ? m.deadCodePercentage.toFixed(1) + "%" : "\u2014");
          const breakdownEl = document.getElementById("qualityBreakdown");
          const catListEl = document.getElementById("qualityCategoryList");
          if (breakdownEl && catListEl && q.summary && q.summary.byCategory) {
            const cats = q.summary.byCategory;
            const catEntries = Object.entries(cats).filter(function(e) {
              return e[1] > 0;
            });
            if (catEntries.length > 0) {
              breakdownEl.style.display = "block";
              catListEl.innerHTML = catEntries.map(function(e) {
                return '<span style="padding:2px 6px; background:var(--bg-primary); border-radius:4px; border:1px solid var(--border-color);">' + escapeHtml2(e[0]) + ": " + e[1] + "</span>";
              }).join("");
            } else {
              breakdownEl.style.display = "none";
            }
          }
          const listEl = document.getElementById("qualityFindingsList");
          if (listEl && Array.isArray(q.findings)) {
            if (q.findings.length === 0) {
              listEl.innerHTML = '<div style="color:var(--text-secondary); text-align:center; padding:8px;">No issues found</div>';
            } else {
              listEl.innerHTML = q.findings.slice(0, 50).map(function(f) {
                const sevColor = f.severity === "critical" ? "#ef4444" : f.severity === "error" ? "#f97316" : f.severity === "warning" ? "#eab308" : "#6b7280";
                const relPath = f.file ? f.file.split("/").slice(-2).join("/") : "?";
                return '<div style="padding:4px 6px; border-left:2px solid ' + sevColor + '; margin-bottom:3px; background:var(--bg-primary); border-radius:0 4px 4px 0;"><div style="display:flex; justify-content:space-between;"><span style="color:' + sevColor + '; font-weight:600;">' + escapeHtml2(f.severity.toUpperCase()) + '</span><span style="color:var(--text-secondary); font-size:9px;">' + escapeHtml2(f.category || "") + "</span></div><div>" + escapeHtml2(f.message || "") + '</div><div style="color:var(--text-secondary); font-size:9px;">' + escapeHtml2(relPath) + ":" + (f.line || "?") + (f.suggestion ? " \u2014 " + escapeHtml2(f.suggestion) : "") + "</div></div>";
              }).join("");
            }
          }
          const emptyEl = document.getElementById("qualityEmpty");
          if (emptyEl)
            emptyEl.style.display = "none";
          shipSetStatus2("Quality scan: " + (q.passed ? "Passed" : "Needs work") + " (" + q.score + "/100)");
          break;
        }
        case "qualityScanError": {
          const scanBtn = document.getElementById("qualityScanBtn");
          if (scanBtn) {
            scanBtn.disabled = false;
            scanBtn.textContent = "Scan";
          }
          shipSetStatus2("Quality scan error: " + (msg2.error || "Unknown"));
          break;
        }
        case "qualityExportResult": {
          if (msg2.markdown) {
            addMessage2("system", "Code Quality Report:\\n" + msg2.markdown);
          }
          shipSetStatus2("Quality report exported.");
          break;
        }
        case "docsComplexity": {
          const btnSimple = document.getElementById("complexityBtnSimple");
          const btnComplex = document.getElementById("complexityBtnComplex");
          const hint = document.getElementById("complexityHint");
          if (btnSimple)
            btnSimple.classList.toggle("active", msg2.complexity === "simple");
          if (btnComplex)
            btnComplex.classList.toggle("active", msg2.complexity === "complex");
          if (hint) {
            if (msg2.complexity === "simple") {
              hint.textContent = "No required docs";
            } else if (msg2.complexity === "complex") {
              hint.textContent = "Requires GDD + SA";
            } else {
              hint.textContent = "Choose project type";
            }
          }
          break;
        }
        case "docsBlockState": {
          if (msg2.isBlocked) {
            shipSetStatus2("Docs required: " + (msg2.missingDocs || []).join(", "));
          }
          break;
        }
        case "docsWizardState": {
          const wizSec = document.getElementById("docsWizardSection");
          if (!msg2.state) {
            if (wizSec)
              wizSec.style.display = "none";
            break;
          }
          if (wizSec)
            wizSec.style.display = "block";
          const s = msg2.state;
          const step = s.steps[s.currentStep];
          const titleEl = document.getElementById("docsWizardTitle");
          const descEl = document.getElementById("docsWizardDesc");
          const stepEl = document.getElementById("docsWizardStep");
          const contentEl = document.getElementById("docsWizardContent");
          const prevBtn = document.getElementById("docsWizardPrevBtn");
          const skipBtn = document.getElementById("docsWizardSkipBtn");
          const nextBtn = document.getElementById("docsWizardNextBtn");
          const completeBtn = document.getElementById("docsWizardCompleteBtn");
          if (titleEl)
            titleEl.textContent = step.title;
          if (descEl)
            descEl.textContent = step.description;
          if (stepEl)
            stepEl.textContent = `Step ${s.currentStep + 1}/${s.totalSteps}`;
          if (prevBtn)
            prevBtn.style.display = s.currentStep > 0 ? "" : "none";
          if (skipBtn)
            skipBtn.style.display = step.isOptional ? "" : "none";
          const isLast = s.currentStep === s.totalSteps - 1;
          if (nextBtn)
            nextBtn.style.display = isLast ? "none" : "";
          if (completeBtn)
            completeBtn.style.display = isLast ? "" : "none";
          if (contentEl) {
            if (step.id === "intro") {
              contentEl.innerHTML = `
                <div class="wizard-question">
                  <label>Project Name <span class="required">*</span></label>
                  <input type="text" id="wizProjectName" value="${escapeHtml2(s.projectName || "")}" placeholder="My Game" onchange="window._wizSetProjectInfo()" />
                </div>
                <div class="wizard-question">
                  <label>Project Type</label>
                  <input type="text" id="wizProjectType" value="${escapeHtml2(s.projectType || "unity")}" placeholder="unity" onchange="window._wizSetProjectInfo()" />
                </div>`;
            } else if (step.id === "optional") {
              const docTypes = ["art_bible", "narrative", "uiux", "economy", "audio", "test_plan", "level_brief"];
              const docNames = { art_bible: "Art Bible", narrative: "Narrative Bible", uiux: "UI/UX Spec", economy: "Economy Design", audio: "Audio Design", test_plan: "Test Plan", level_brief: "Level Brief" };
              contentEl.innerHTML = docTypes.map((dt) => {
                const checked = s.selectedDocs.includes(dt) ? "checked" : "";
                return `<div class="wizard-doc-toggle" onclick="window._wizToggleDoc('${dt}')">
                  <input type="checkbox" ${checked} tabindex="-1" />
                  <span>${docNames[dt] || dt}</span>
                  <span class="doc-priority optional">optional</span>
                </div>`;
              }).join("");
            } else if (step.id === "review") {
              contentEl.innerHTML = `
                <p style="font-size:12px; color:var(--text-secondary);">The following documents will be generated:</p>
                <ul style="font-size:12px; margin:6px 0; padding-left:20px;">
                  ${s.selectedDocs.map((d) => `<li>${d}</li>`).join("")}
                </ul>`;
            } else if (step.docType) {
              contentEl.innerHTML = '<div style="color:var(--text-secondary); font-size:12px;">Loading questionnaire...</div>';
              deps.vscode.postMessage({ type: "docsWizardGetQuestionnaire", docType: step.docType });
            }
          }
          break;
        }
        case "docsQuestionnaire": {
          const contentEl = document.getElementById("docsWizardContent");
          if (!contentEl || !Array.isArray(msg2.questions))
            break;
          contentEl.innerHTML = msg2.questions.map((q) => {
            const tag = q.multiline ? "textarea" : "input";
            const reqMark = q.required ? '<span class="required">*</span>' : "";
            return `<div class="wizard-question">
              <label>${escapeHtml2(q.question)} ${reqMark}</label>
              <${tag} data-qid="${q.id}" placeholder="${escapeHtml2(q.placeholder || "")}" class="wiz-answer" ${tag === "input" ? 'type="text"' : ""}></${tag}>
            </div>`;
          }).join("");
          contentEl.dataset.docType = msg2.docType;
          break;
        }
        case "docsWizardComplete": {
          const wizSec = document.getElementById("docsWizardSection");
          if (wizSec)
            wizSec.style.display = "none";
          if (Array.isArray(msg2.results)) {
            const created = msg2.results.filter((r) => r.status === "created").length;
            const updated = msg2.results.filter((r) => r.status === "updated").length;
            const errors = msg2.results.filter((r) => r.status === "error").length;
            showToast2(`Docs generated: ${created} created, ${updated} updated${errors ? ", " + errors + " errors" : ""}`, errors ? "warning" : "success");
          }
          deps.vscode.postMessage({ type: "docsGetSummary" });
          break;
        }
        case "docsSummary": {
          const bar = document.getElementById("docsSummaryBar");
          if (bar)
            bar.style.display = "block";
          const ids = { docsSummaryTotal: msg2.total, docsSummaryCurrent: msg2.current, docsSummaryDraft: msg2.draft, docsSummaryMissing: msg2.missing };
          Object.entries(ids).forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el)
              el.textContent = String(val || 0);
          });
          const healthEl = document.getElementById("docsSummaryHealth");
          if (healthEl) {
            healthEl.textContent = (msg2.healthScore || 0) + "%";
            healthEl.style.color = msg2.healthScore >= 80 ? "var(--success-color)" : msg2.healthScore >= 50 ? "var(--warning-color)" : "var(--error-color)";
          }
          break;
        }
        case "docsScanResult": {
          showToast2(`Scan complete: ${(msg2.documents || []).length} docs, health ${msg2.healthScore || 0}%`, "success");
          deps.vscode.postMessage({ type: "docsGetSummary" });
          break;
        }
        case "docsDrift": {
          const banner = document.getElementById("docsDriftBanner");
          const list = document.getElementById("docsDriftList");
          if (!banner || !list)
            break;
          if (!msg2.driftDocs || msg2.driftDocs.length === 0) {
            banner.style.display = "none";
            break;
          }
          banner.style.display = "block";
          list.innerHTML = msg2.driftDocs.map(
            (d) => `<div onclick="window._openDriftDoc('${d.type}')">
              \u26A0 ${escapeHtml2(d.name)} \u2014 ${d.daysSinceUpdate} days since update (${escapeHtml2(d.path)})
            </div>`
          ).join("");
          break;
        }
        case "dbStats":
          updateDbPanel2(msg2.stats);
          break;
        case "missionData": {
          if (msg2.mission) {
            const m = msg2.mission;
            const gEl = (id) => document.getElementById(id);
            if (gEl("missionOpenTickets"))
              gEl("missionOpenTickets").textContent = String(m.openTickets || 0);
            if (gEl("missionActivePlans"))
              gEl("missionActivePlans").textContent = String(m.activePlans || 0);
            if (gEl("missionPendingJobs"))
              gEl("missionPendingJobs").textContent = String(m.pendingJobs || 0);
            if (gEl("missionCompletedToday"))
              gEl("missionCompletedToday").textContent = String(m.completedToday || 0);
            const aq = gEl("missionApprovalQueue");
            if (aq && Array.isArray(m.approvalQueue)) {
              if (m.approvalQueue.length === 0) {
                aq.innerHTML = '<div style="color:var(--text-secondary);font-size:11px;">No pending approvals.</div>';
              } else {
                aq.innerHTML = m.approvalQueue.map(
                  (j) => '<div style="padding:4px 8px;background:var(--bg-tertiary);border-radius:4px;margin-bottom:4px;font-size:11px;"><strong>' + (j.action || j.actionKey || "Job") + '</strong><span style="float:right;color:#f59e0b;font-size:10px;">PENDING</span></div>'
                ).join("");
              }
            }
            const ml = gEl("missionMilestones");
            if (ml && Array.isArray(m.milestones)) {
              if (m.milestones.length === 0) {
                ml.innerHTML = '<div style="color:var(--text-secondary);font-size:11px;">No milestones defined.</div>';
              } else {
                ml.innerHTML = m.milestones.map(
                  (ms) => '<div style="padding:6px 8px;background:var(--bg-tertiary);border-radius:4px;margin-bottom:4px;border-left:3px solid ' + (ms.status === "completed" ? "#10b981" : "#3b82f6") + ';"><strong style="font-size:12px;">' + (ms.title || "Milestone") + "</strong>" + (ms.targetDate ? '<span style="float:right;font-size:10px;color:var(--text-secondary);">' + new Date(ms.targetDate).toLocaleDateString() + "</span>" : "") + (ms.description ? '<div style="font-size:10px;color:var(--text-secondary);">' + ms.description + "</div>" : "") + "</div>"
                ).join("");
              }
            }
          }
          break;
        }
        case "milestoneCreated": {
          showToast2("Milestone created: " + (msg2.milestone?.title || ""), "success");
          vscode2.postMessage({ type: "getMissionData" });
          break;
        }
        case "milestoneUpdated": {
          vscode2.postMessage({ type: "getMissionData" });
          break;
        }
        case "storageStats": {
          if (msg2.storage) {
            const s = msg2.storage;
            const sEl = (id) => document.getElementById(id);
            if (sEl("storageType"))
              sEl("storageType").textContent = s.type || "globalState";
            if (sEl("storageLocation"))
              sEl("storageLocation").textContent = s.location || ".spacecode/";
            if (sEl("storageDbPath")) {
              const dbPath = s.dbPath || "";
              sEl("storageDbPath").textContent = dbPath || "\u2014";
              sEl("storageDbPath").title = dbPath;
            }
            if (sEl("storageChatCount"))
              sEl("storageChatCount").textContent = (s.chatCount || 0) + " / " + (s.chatMax || 1e4);
            if (sEl("storageEmbeddingCount"))
              sEl("storageEmbeddingCount").textContent = (s.embeddingCount || 0) + " / " + (s.embeddingMax || 5e4);
            if (sEl("storagePlanCount"))
              sEl("storagePlanCount").textContent = (s.planCount || 0) + " plans";
            if (sEl("storageTicketCount"))
              sEl("storageTicketCount").textContent = (s.ticketCount || 0) + " tickets";
            if (sEl("storageHandoffCount"))
              sEl("storageHandoffCount").textContent = (s.handoffCount || 0) + " handoffs";
            const setBar = (id, count, max) => {
              const bar = sEl(id);
              if (bar)
                bar.style.width = Math.min(100, count / max * 100) + "%";
            };
            setBar("storageChatBar", s.chatCount || 0, s.chatMax || 1e4);
            setBar("storageEmbeddingBar", s.embeddingCount || 0, s.embeddingMax || 5e4);
            setBar("storagePlanBar", s.planCount || 0, s.planMax || 1e3);
            setBar("storageTicketBar", s.ticketCount || 0, s.ticketMax || 5e3);
            setBar("storageHandoffBar", s.handoffCount || 0, s.handoffMax || 100);
          }
          break;
        }
        case "recentDbMessages": {
          const browser = document.getElementById("storageDbBrowser");
          if (!browser)
            break;
          const messages = msg2.messages || [];
          if (messages.length === 0) {
            browser.innerHTML = '<div style="color:var(--text-secondary); font-size:11px; padding:8px;">No messages in database. Send a chat message first.</div>';
            break;
          }
          const sessions = {};
          for (const m of messages) {
            const sid = m.sessionId || m.session_id || "default";
            if (!sessions[sid])
              sessions[sid] = [];
            sessions[sid].push(m);
          }
          let dbHtml = "";
          for (const [sid, msgs] of Object.entries(sessions)) {
            const userMsgs = msgs.filter((m) => m.role === "user");
            const title = userMsgs.length > 0 ? userMsgs[userMsgs.length - 1].content.slice(0, 60) : sid;
            const lastMsg = msgs[0];
            const time = lastMsg.timestamp ? new Date(lastMsg.timestamp).toLocaleString() : "";
            const tags = (lastMsg.tags || []).join(", ");
            dbHtml += `<div style="background:var(--bg-tertiary); border-radius:6px; padding:8px 10px; margin-bottom:6px; cursor:pointer;" onclick="this.querySelector('.db-session-detail').style.display = this.querySelector('.db-session-detail').style.display === 'none' ? 'block' : 'none'">`;
            dbHtml += '<div style="display:flex; justify-content:space-between; align-items:center;">';
            dbHtml += '<span style="font-size:12px; font-weight:500; color:var(--text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:200px;">' + escapeHtml2(title) + "</span>";
            dbHtml += '<span style="font-size:10px; color:var(--text-secondary);">' + msgs.length + " msgs</span>";
            dbHtml += "</div>";
            dbHtml += '<div style="font-size:10px; color:var(--text-secondary); margin-top:2px;">' + escapeHtml2(time) + (tags ? " &middot; " + escapeHtml2(tags) : "") + "</div>";
            dbHtml += '<div class="db-session-detail" style="display:none; margin-top:6px; border-top:1px solid var(--border-color); padding-top:6px;">';
            for (const m of msgs.slice(0, 20)) {
              const roleColor = m.role === "user" ? "var(--accent-color)" : "#10b981";
              const roleLabel = m.role === "user" ? "You" : "AI";
              const snippet = (m.content || "").slice(0, 120);
              dbHtml += '<div style="margin-bottom:4px;">';
              dbHtml += '<span style="font-size:10px; font-weight:600; color:' + roleColor + ';">' + roleLabel + ":</span> ";
              dbHtml += '<span style="font-size:10px; color:var(--text-primary);">' + escapeHtml2(snippet) + (m.content.length > 120 ? "..." : "") + "</span>";
              dbHtml += "</div>";
            }
            if (msgs.length > 20) {
              dbHtml += '<div style="font-size:10px; color:var(--text-secondary);">... and ' + (msgs.length - 20) + " more</div>";
            }
            dbHtml += "</div></div>";
          }
          browser.innerHTML = dbHtml;
          break;
        }
        case "storageClearResult": {
          if (msg2.success) {
            showToast2("Cleared: " + (msg2.target || "storage"), "success");
            vscode2.postMessage({ type: "getStorageStats" });
          } else {
            showToast2("Clear failed: " + (msg2.error || "unknown"), "error");
          }
          break;
        }
        case "storageExportResult": {
          if (msg2.data) {
            showToast2("Storage data exported to console", "success");
            console.log("[SpaceCode] Export:", msg2.data);
          }
          break;
        }
        case "artStudioData": {
          if (msg2.artData) {
            const ad = msg2.artData;
            const palette = document.getElementById("artColorPalette");
            if (palette && Array.isArray(ad.colors) && ad.colors.length > 0) {
              palette.innerHTML = ad.colors.map(
                (c) => '<div style="width:32px;height:32px;border-radius:6px;background:' + c + ';border:1px solid var(--border-color);cursor:pointer;" title="' + c + '"></div>'
              ).join("");
            }
            const assets = document.getElementById("artRecentAssets");
            if (assets && Array.isArray(ad.recentAssets) && ad.recentAssets.length > 0) {
              assets.innerHTML = ad.recentAssets.map(
                (a) => '<div style="padding:4px 8px;background:var(--bg-tertiary);border-radius:4px;margin-bottom:4px;font-size:11px;">' + (a.name || a.path || "Asset") + "</div>"
              ).join("");
            }
          }
          break;
        }
        case "artGenerationStarted": {
          showToast2("Generating image...", "info");
          break;
        }
        case "artGenerationResult": {
          if (msg2.status === "not_configured") {
            showToast2(msg2.message || "API not configured", "info");
          } else {
            showToast2("Image generated", "success");
          }
          break;
        }
        case "artGenerationError": {
          showToast2("Generation failed: " + (msg2.error || ""), "error");
          break;
        }
        case "explorerContext": {
          const ctxEl = document.getElementById("explorerContextBar");
          if (ctxEl && msg2.context) {
            const c = msg2.context;
            ctxEl.style.display = "flex";
            ctxEl.innerHTML = '<span style="font-size:10px;color:var(--text-secondary);">File:</span> <strong style="font-size:11px;">' + (c.fileName || "") + '</strong><span style="font-size:10px;color:var(--text-secondary);margin-left:6px;">' + (c.language || "") + '</span><span style="font-size:10px;color:var(--text-secondary);margin-left:6px;">L' + (c.lineNumber || 0) + "</span>" + (c.sector !== "general" ? '<span style="font-size:9px;background:var(--accent-bg);color:var(--accent-color);padding:1px 6px;border-radius:8px;margin-left:6px;">' + c.sector + "</span>" : "") + (c.selection ? '<span style="font-size:10px;color:var(--accent-color);margin-left:6px;">[selection]</span>' : "");
          } else if (ctxEl) {
            ctxEl.style.display = "none";
          }
          break;
        }
        case "explorerContextPinned": {
          showToast2("Context pinned", "success");
          break;
        }
        case "logs":
          updateLogsPanel2(msg2.logs, msg2.channel);
          break;
        case "settingsSaved":
          if (msg2.success) {
            showToast2("Settings saved successfully", "success");
          } else {
            showToast2("Failed to save settings: " + (msg2.error || "Unknown error"), "error");
          }
          break;
        case "settingsFilePath": {
          const pathEl = document.getElementById("settingsFilePath");
          if (pathEl && msg2.relativePath) {
            pathEl.textContent = msg2.relativePath;
            pathEl.title = msg2.path || "Click to open in editor";
          }
          break;
        }
        case "toolbarSettings":
          if (handleToolbarSettings2) {
            handleToolbarSettings2(msg2.settings);
          }
          if (mergePricing2 && msg2.settings?.pricing) {
            mergePricing2(msg2.settings.pricing);
          }
          break;
        case "modelVerificationStarted":
          break;
        case "modelVerificationResults":
          if (window.handleModelVerificationResults) {
            window.handleModelVerificationResults(msg2.results);
          }
          break;
        case "modelVerificationError": {
          const btn = document.getElementById("verifyModelsBtn");
          const status = document.getElementById("modelVerificationStatus");
          if (btn)
            btn.innerHTML = '<span class="btn-icon">\u{1F50D}</span> Verify All';
          if (status) {
            status.className = "verification-status error";
            status.innerHTML = `<span class="status-text">Verification failed: ${msg2.error}</span>`;
          }
          break;
        }
        case "singleModelVerificationResult": {
          const el = document.getElementById(`verify-${msg2.result?.modelId}`);
          if (el && msg2.result) {
            if (msg2.result.status === "valid") {
              el.textContent = "\u2713";
              el.className = "verify-status valid";
            } else if (msg2.result.status === "invalid") {
              el.textContent = "\u2717";
              el.className = "verify-status invalid";
            } else {
              el.textContent = "?";
              el.className = "verify-status";
            }
            el.title = msg2.result.message;
          }
          break;
        }
        case "lastModelVerification":
          if (msg2.results && window.handleModelVerificationResults) {
            window.handleModelVerificationResults(msg2.results);
          }
          break;
        case "openaiModelsList": {
          const list = document.getElementById("openaiModelsList");
          const text = document.getElementById("openaiModelsText");
          if (list && text) {
            list.style.display = "block";
            const models = Array.isArray(msg2.models) ? msg2.models : [];
            text.textContent = models.length ? models.join("\n") : "No models returned.";
          }
          break;
        }
        case "openaiModelsError": {
          const list = document.getElementById("openaiModelsList");
          const text = document.getElementById("openaiModelsText");
          if (list && text) {
            list.style.display = "block";
            text.textContent = `Error fetching models: ${msg2.error || "Unknown error"}`;
          }
          break;
        }
        case "modelOverrides": {
          const out = document.getElementById("devPricingOverrides");
          if (out) {
            out.textContent = JSON.stringify(msg2.overrides || {}, null, 2);
          }
          break;
        }
        case "modelOverrideApplied": {
          const status = document.getElementById("devPricingStatus");
          if (status) {
            status.textContent = `Applied override for ${msg2.modelId}`;
          }
          break;
        }
        case "modelOverrideError": {
          const status = document.getElementById("devPricingStatus");
          if (status) {
            status.textContent = `Override error: ${msg2.error || "Unknown error"}`;
          }
          break;
        }
        case "planExecutionStarted":
          planExecutionState = {
            planId: msg2.planId || null,
            totalSteps: msg2.totalSteps || 0,
            completedSteps: 0,
            failedSteps: 0
          };
          setPlanExecutionState2(planExecutionState);
          showPlanExecutionPanel2(true);
          hidePlanStepGate2();
          clearPlanExecutionLog2();
          setPlanExecutionStatus2("Executing: " + (msg2.planTitle || "Plan"));
          setPlanExecutionProgress2("0 / " + planExecutionState.totalSteps + " steps");
          appendPlanExecutionLog2("Started plan: " + (msg2.planTitle || msg2.planId || "unknown"));
          setPlanExecutionButtonsEnabled2(false);
          break;
        case "planStepStarted":
          if (msg2.stepDescription) {
            setPlanExecutionStatus2("Running: " + msg2.stepDescription);
            appendPlanExecutionLog2("\u25B6 " + msg2.stepDescription);
          }
          break;
        case "planStepPending":
          showPlanExecutionPanel2(true);
          showPlanStepGate(msg2);
          setPlanExecutionStatus2("Awaiting approval");
          setPlanExecutionProgress2(
            planExecutionState.completedSteps + " / " + planExecutionState.totalSteps + " steps (failed: " + planExecutionState.failedSteps + ")"
          );
          if (msg2.stepDescription) {
            appendPlanExecutionLog2("\u23F8 Waiting: " + msg2.stepDescription);
          }
          break;
        case "planStepCompleted":
          if (msg2.success) {
            planExecutionState.completedSteps += 1;
            appendPlanExecutionLog2("\u2705 Step completed");
          } else {
            planExecutionState.failedSteps += 1;
            appendPlanExecutionLog2("\u274C Step failed: " + (msg2.error || "Unknown error"));
          }
          setPlanExecutionState2(planExecutionState);
          setPlanExecutionProgress2(
            planExecutionState.completedSteps + " / " + planExecutionState.totalSteps + " steps (failed: " + planExecutionState.failedSteps + ")"
          );
          break;
        case "planPhaseCompleted":
          if (msg2.summary) {
            appendPlanExecutionLog2("\u2022 Phase summary: " + msg2.summary);
          } else if (msg2.phaseId) {
            appendPlanExecutionLog2("\u2022 Phase completed: " + msg2.phaseId);
          }
          break;
        case "executionOutput":
          if (msg2.chunk) {
            appendPlanExecutionLog2(msg2.chunk);
          }
          break;
        case "planExecutionCompleted":
          setPlanExecutionStatus2(msg2.success ? "Execution complete" : "Execution completed with errors", !msg2.success);
          if (msg2.summary) {
            appendPlanExecutionLog2("Summary: " + msg2.summary);
          }
          setPlanExecutionProgress2(
            (msg2.completedSteps ?? planExecutionState.completedSteps) + " / " + (planExecutionState.totalSteps || msg2.completedSteps || 0) + " steps (failed: " + (msg2.failedSteps ?? planExecutionState.failedSteps) + ")"
          );
          hidePlanStepGate2();
          setPlanExecutionButtonsEnabled2(!!currentPlanData2);
          break;
        case "planExecutionError":
          setPlanExecutionStatus2("Execution error", true);
          appendPlanExecutionLog2("Error: " + (msg2.error || "Unknown error"));
          hidePlanStepGate2();
          setPlanExecutionButtonsEnabled2(!!currentPlanData2);
          break;
        case "aiReviewResult":
          updateAIReview2(msg2.result || null);
          break;
        case "workflows":
          setWorkflows2(msg2.workflows || []);
          break;
        case "workflowResult":
          document.getElementById("workflowOutputContent").innerHTML = '<pre style="white-space: pre-wrap;">' + escapeHtml2(msg2.result) + "</pre>";
          break;
        case "workflowError":
          document.getElementById("workflowOutputContent").innerHTML = '<p style="color: var(--error-text);">Error: ' + escapeHtml2(msg2.error) + "</p>";
          break;
        case "workflowEvent":
          handleWorkflowEvent2(msg2.event);
          break;
        case "insertPrompt":
          if (msg2.prompt) {
            const input = document.getElementById("messageInput");
            if (input) {
              input.value = msg2.prompt;
              input.focus();
              autoResize2(input);
            }
          }
          break;
        case "sendGitPrompt":
          if (msg2.prompt) {
            const input = document.getElementById("messageInput");
            if (input) {
              input.value = msg2.prompt;
              autoResize2(input);
              setTimeout(() => sendMessage2(), 50);
            }
          }
          break;
        case "gitSettingsSaved":
          break;
        case "gitSettings":
          loadGitSettings2(msg2.settings);
          break;
        case "autopilotStatus": {
          if (typeof autopilotRenderStatus2 === "function") {
            autopilotRenderStatus2(msg2);
          }
          break;
        }
        case "autopilotStepResult": {
          if (typeof autopilotRenderStepResult2 === "function") {
            autopilotRenderStepResult2(msg2.result || msg2);
          }
          break;
        }
        case "autopilotInterruptedSession": {
          if (typeof autopilotRenderSessionPrompt2 === "function") {
            autopilotRenderSessionPrompt2(msg2);
          }
          break;
        }
        case "autopilotConfig": {
          if (typeof autopilotRenderConfig2 === "function") {
            autopilotRenderConfig2(msg2.config || msg2);
          }
          break;
        }
        case "autopilotError": {
          if (typeof autopilotRenderStatus2 === "function") {
            autopilotRenderStatus2({ status: "failed", error: msg2.error || msg2.message });
          }
          break;
        }
        case "gameuiState":
        case "gameuiStateLoaded": {
          if (typeof gameuiRenderState2 === "function") {
            gameuiRenderState2(msg2);
          }
          break;
        }
        case "gameuiCatalog": {
          if (typeof gameuiRenderCatalog2 === "function") {
            gameuiRenderCatalog2(msg2);
          }
          break;
        }
        case "gameuiPipelineEvent": {
          if (typeof gameuiRenderEvent2 === "function") {
            gameuiRenderEvent2(msg2.event || msg2);
          }
          break;
        }
        case "gameuiThemes": {
          if (typeof gameuiRenderThemes2 === "function") {
            gameuiRenderThemes2(msg2);
          }
          break;
        }
        case "gameuiComponentResult":
        case "gameuiComponentUpdated": {
          if (typeof gameuiRenderState2 === "function" && msg2.summary) {
            gameuiRenderState2(msg2);
          }
          break;
        }
        case "gameuiPhaseResult":
        case "gameuiPipelineComplete": {
          if (typeof gameuiRenderState2 === "function" && msg2.summary) {
            gameuiRenderState2({ state: null, summary: msg2.summary });
          }
          break;
        }
        case "dbState":
        case "dbActiveChanged": {
          if (typeof dbRenderConnectionList2 === "function") {
            dbRenderConnectionList2(msg2);
          }
          break;
        }
        case "dbConnectionAdded":
        case "dbConnectionRemoved": {
          if (typeof dbRenderConnectionList2 === "function") {
            dbRenderConnectionList2(msg2);
          }
          break;
        }
        case "dbConnectionTested": {
          if (typeof dbRenderTestResult2 === "function") {
            dbRenderTestResult2(msg2);
          }
          break;
        }
        case "dbSchema": {
          if (typeof dbRenderSchema2 === "function") {
            dbRenderSchema2(msg2);
          }
          break;
        }
        case "dbQueryResult": {
          if (typeof dbRenderQueryResult2 === "function") {
            dbRenderQueryResult2(msg2);
          }
          break;
        }
        case "memorySearchResults": {
          if (typeof chatSearchRenderResults2 === "function") {
            chatSearchRenderResults2(msg2);
          }
          break;
        }
        case "buildResult": {
          const buildEl = document.getElementById("buildStatusIndicator");
          if (buildEl) {
            if (msg2.success) {
              buildEl.textContent = "\u2713 Build OK";
              buildEl.style.color = "#10b981";
            } else {
              buildEl.textContent = "\u2717 " + (msg2.errorCount || 0) + " error(s)";
              buildEl.style.color = "#ef4444";
            }
          }
          if (msg2.success) {
            shipSetStatus2("Unity build: No compile errors");
          } else {
            shipSetStatus2("Unity build failed: " + (msg2.errorCount || 0) + " compile error(s)");
            showToast2("Build failed: " + (msg2.errorCount || 0) + " error(s)", "error");
          }
          break;
        }
        case "commsState":
          if (typeof commsRenderState2 === "function")
            commsRenderState2(msg2);
          break;
        case "commsServicesChecked":
          if (typeof commsRenderState2 === "function") {
            vscode2.postMessage({ type: "commsGetState" });
          }
          break;
        case "commsScanStarted":
          if (typeof commsRenderScanStarted2 === "function")
            commsRenderScanStarted2(msg2);
          break;
        case "commsScanCompleted":
          if (typeof commsRenderScanCompleted2 === "function")
            commsRenderScanCompleted2(msg2);
          break;
        case "commsScanDetail":
          if (typeof commsRenderScanDetail2 === "function")
            commsRenderScanDetail2(msg2);
          break;
        case "commsRecentScans":
          break;
        case "commsPrompt":
          if (typeof commsRenderPrompt2 === "function")
            commsRenderPrompt2(msg2);
          break;
        case "commsError":
          if (msg2.error) {
            const commsStatusEl = document.getElementById("commsScanStatus");
            if (commsStatusEl) {
              commsStatusEl.textContent = msg2.error;
              commsStatusEl.style.color = "#ef4444";
            }
            showToast2(msg2.error, "error");
          }
          break;
        case "opsState":
          if (typeof opsRenderState2 === "function") {
            opsRenderState2(msg2);
            if (msg2.activeServerId)
              window._opsActiveServerId = msg2.activeServerId;
          }
          break;
        case "opsServerAdded":
        case "opsServerRemoved":
          if (typeof opsRenderState2 === "function") {
            vscode2.postMessage({ type: "opsGetState" });
          }
          break;
        case "opsCommandOutput":
          if (typeof opsRenderCommandOutput2 === "function")
            opsRenderCommandOutput2(msg2);
          break;
        case "opsRecentOps":
          if (typeof opsRenderRecentOps2 === "function")
            opsRenderRecentOps2(msg2.ops || []);
          break;
        case "opsError":
          if (msg2.error)
            showToast2(msg2.error, "error");
          break;
        case "diagnosticsResult":
          if (typeof renderDiagnosticsResult2 === "function") {
            renderDiagnosticsResult2(msg2.result, msg2.error);
          }
          break;
        case "diagnosticsProgress":
          if (typeof renderDiagnosticsProgress2 === "function") {
            renderDiagnosticsProgress2(msg2.stage, msg2.progress);
          }
          break;
        case "showError":
          if (msg2.message) {
            addMessage2("system", "Error: " + msg2.message);
          }
          break;
      }
    }
    return { handleMessage };
  }

  // src/webview/panel/index.ts
  var STATION_MAP = window.__SC_STATION_MAP__;
  var BUILD_ID = window.__SC_BUILD_ID__;
  var vscode = window.__SC_VSCODE__;
  var chatStore = createChatStore({ uiState, PERSONA_MAP, vscode });
  var currentTab = uiState.currentTab;
  var currentChatMode = uiState.chatMode;
  var currentMode = uiState.mode;
  var attachedImages = uiState.attachedImages;
  var docTargets = uiState.docTargets;
  var docTarget = uiState.docTarget;
  var planTemplates = uiState.planTemplates;
  var planList = uiState.planList;
  var currentPlanData = uiState.currentPlan;
  var ticketList = [];
  var lastCoordinatorToast = "";
  var chatSessions = {};
  var currentChatId = "";
  var chatCounter = 0;
  var currentSettings = {};
  var _gptFlowPending = false;
  window.chatStore = chatStore;
  var flowManager = createFlowPanelHandlers({
    d3: typeof d3 !== "undefined" ? d3 : null,
    escapeHtml
  });
  var {
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
    getFlowResponseTokens
  } = flowManager;
  window.toggleMiniGraph = toggleMiniGraph;
  var sectorMapManager = createSectorMapHandlers({
    vscode,
    escapeHtml
  });
  var {
    initSectorMap,
    renderSectorMap,
    destroySectorMap,
    resizeSectorMap,
    requestSectorMapData,
    getDefaultSectorData,
    createOrbitalGraph,
    initAiOrbitalFlow
  } = sectorMapManager;
  var engineerHandlers = createEngineerHandlers({
    vscode,
    escapeHtml
  });
  var {
    engineerRenderStatus,
    engineerRenderSuggestions,
    engineerRenderHistory,
    engineerRenderPrompt,
    engineerDismissPrompt,
    engineerToggleShowAll,
    engineerAction,
    engineerRefresh,
    engineerDelegate,
    engineerRequestHistory,
    engineerPromptAction,
    engineerHandleDelegated,
    engineerCheckSectors
  } = engineerHandlers;
  var autopilotHandlers = createAutopilotHandlers({
    vscode
  });
  var {
    autopilotRenderStatus,
    autopilotRenderStepResult,
    autopilotRenderSessionPrompt,
    autopilotRenderConfig,
    autopilotPause,
    autopilotResume,
    autopilotAbort,
    autopilotRequestStatus,
    autopilotCheckSession,
    autopilotResumeSession,
    autopilotClearSession,
    autopilotUpdateConfig
  } = autopilotHandlers;
  var gameuiHandlers = createGameUIHandlers({
    vscode
  });
  var {
    gameuiRenderState,
    gameuiRenderCatalog,
    gameuiRenderEvent,
    gameuiRenderThemes,
    gameuiRequestState,
    gameuiRequestCatalog,
    gameuiFilterCategory,
    gameuiGenerateComponent,
    gameuiRunPhase,
    gameuiRunAll,
    gameuiStop,
    gameuiRequestThemes,
    gameuiSetActiveTheme,
    gameuiGenerateThemeUSS,
    gameuiSaveState,
    gameuiLoadState
  } = gameuiHandlers;
  var dbHandlers = createDbHandlers({
    vscode
  });
  var {
    dbRenderConnectionList,
    dbRenderSchema,
    dbRenderQueryResult,
    dbRenderTestResult,
    dbShowConnectionWizard,
    dbAddConnection,
    dbRemoveConnection,
    dbTestConnection,
    dbSetActive,
    dbGetSchema,
    dbRequestState
  } = dbHandlers;
  var chatSearchHandlers = createChatSearchHandlers({
    vscode,
    escapeHtml
  });
  var {
    chatSearchToggle,
    chatSearchInput,
    chatSearchRenderResults,
    chatSearchLoadResult,
    chatSearchClose
  } = chatSearchHandlers;
  var commsHandlers = createCommsHandlers({
    vscode,
    escapeHtml
  });
  var {
    commsRenderState,
    commsRenderServices,
    commsRenderScanDetail,
    commsRenderScanStarted,
    commsRenderScanCompleted,
    commsRenderPrompt,
    commsRequestState,
    commsSetTier,
    commsCheckServices,
    commsStartScan,
    commsViewScan,
    commsCloseScanDetail,
    commsInvestigateFinding,
    commsGenerateFixForFinding
  } = commsHandlers;
  var opsHandlers = createOpsHandlers({
    vscode,
    escapeHtml
  });
  var {
    opsRenderState,
    opsRenderServerList,
    opsRenderServerDetail,
    opsRenderRecentOps,
    opsRenderCommandOutput,
    opsRequestState,
    opsAddServer,
    opsRemoveServer,
    opsSelectServer,
    opsTestConnection,
    opsHealthCheck,
    opsHardenServer,
    opsDeployService,
    opsExecuteCommand,
    opsShowOpOutput
  } = opsHandlers;
  var diagHandlers = createDiagnosticsHandlers({
    vscode,
    escapeHtml,
    showToast
  });
  var {
    onDiagnosticsTabOpen,
    runDiagnosticsScan,
    renderDiagnosticsResult,
    renderDiagnosticsProgress,
    diagnosticsOpenFile
  } = diagHandlers;
  var chatSessionManager = createChatSessionManager({
    vscode,
    getCurrentMode: () => currentMode,
    setCurrentMode: (val) => {
      currentMode = val;
    },
    getChatSessions: () => chatSessions,
    setChatSessions: (val) => {
      chatSessions = val;
    },
    getCurrentChatId: () => currentChatId,
    setCurrentChatId: (val) => {
      currentChatId = val;
    },
    getChatCounter: () => chatCounter,
    setChatCounter: (val) => {
      chatCounter = val;
    },
    clearAiFlow,
    clearContextSources,
    hideLiveResponse,
    updateTokenBar: (...args) => updateTokenBar(...args),
    getSelectedModel: () => getSelectedModel?.()
  });
  var {
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
    getCurrentChatProvider
  } = chatSessionManager;
  Object.assign(window, {
    newChat,
    switchChat,
    closeChat,
    closeMaxTabsModal
  });
  var chatRenderer = createChatRendererHandlers({
    vscode,
    escapeHtml,
    marked: typeof marked !== "undefined" ? marked : null,
    renderChatTabs,
    getChatSessions: () => chatSessions,
    getCurrentChatId: () => currentChatId
  });
  var {
    createMessageHtml,
    addMessage,
    appendToStreamingMessage,
    finalizeStreamingMessage,
    setGenerating,
    updateSendStopButton,
    stopConversation,
    clearChat,
    insertPrompt
  } = chatRenderer;
  Object.assign(window, {
    stopConversation,
    clearChat,
    insertPrompt
  });
  var ticketsSidebarHandlers = createTicketsSidebarHandlers({
    vscode,
    escapeHtml,
    shipSetStatus,
    getPlanList: () => planList
  });
  var {
    toggleTicketForm,
    createTicket,
    refreshTickets,
    updateTicketStatus,
    deleteTicket,
    renderTicketList
  } = ticketsSidebarHandlers;
  Object.assign(window, {
    toggleTicketForm,
    createTicket,
    refreshTickets
  });
  var dashboardStatsHandlers = createDashboardStatsHandlers({
    vscode,
    escapeHtml
  });
  var {
    updateDocsPanel,
    updateDbPanel,
    updateLogsPanel
  } = dashboardStatsHandlers;
  var unityPanelHandlers = createUnityPanelHandlers({
    vscode,
    shipSetStatus,
    escapeHtml
  });
  var {
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
    setUnityConnected
  } = unityPanelHandlers;
  Object.assign(window, {
    unityCheckConnection,
    unitySendCommand,
    unityRefresh,
    unityHeaderClick,
    toggleConsoleFilter,
    clearUnityConsole
  });
  var { switchControlTab } = createControlTabsHandlers({
    unityCheckConnection,
    onSectorsTabOpen: () => {
      initSectorMap();
      resizeSectorMap();
      requestSectorMapData();
    },
    onEngineerTabOpen: () => {
      vscode.postMessage({ type: "engineerStatus" });
    },
    onCommsTabOpen: () => {
      vscode.postMessage({ type: "commsGetState" });
    },
    onInfraTabOpen: () => {
      vscode.postMessage({ type: "opsGetState" });
    },
    onDiagnosticsTabOpen: () => {
      vscode.postMessage({ type: "diagnosticsGetLast" });
    }
  });
  Object.assign(window, {
    switchControlTab
  });
  Object.assign(window, {
    sectorMapScan: () => {
      requestSectorMapData();
    },
    sectorMapValidate: () => {
      vscode.postMessage({ type: "asmdefValidate" });
    },
    closeSectorDetail: () => {
      const card = document.getElementById("sectorDetailCard");
      if (card)
        card.style.display = "none";
    },
    sectorOpenFolder: () => {
      const nameEl = document.getElementById("sectorDetailName");
      if (nameEl && nameEl.dataset.sectorId) {
        vscode.postMessage({ type: "sectorOpenFolder", sectorId: nameEl.dataset.sectorId });
      }
    },
    sectorOpenAsmdef: () => {
      const nameEl = document.getElementById("sectorDetailName");
      if (nameEl && nameEl.dataset.sectorId) {
        vscode.postMessage({ type: "sectorOpenAsmdef", sectorId: nameEl.dataset.sectorId });
      }
    },
    // --- Sector Configuration UI (CF-8) ---
    sectorConfigOpen: () => {
      const panel = document.getElementById("sectorConfigPanel");
      const mapContainer = document.querySelector(".sector-map-container");
      const detailCard = document.getElementById("sectorDetailCard");
      const summary = document.querySelector(".sector-map-summary");
      if (panel) {
        const isVisible = panel.style.display !== "none";
        panel.style.display = isVisible ? "none" : "block";
        if (mapContainer)
          mapContainer.style.display = isVisible ? "" : "none";
        if (detailCard)
          detailCard.style.display = "none";
        if (summary)
          summary.style.display = isVisible ? "" : "none";
        if (!isVisible) {
          vscode.postMessage({ type: "sectorConfigGet" });
        }
      }
    },
    sectorConfigClose: () => {
      const panel = document.getElementById("sectorConfigPanel");
      const mapContainer = document.querySelector(".sector-map-container");
      const summary = document.querySelector(".sector-map-summary");
      if (panel)
        panel.style.display = "none";
      if (mapContainer)
        mapContainer.style.display = "";
      if (summary)
        summary.style.display = "";
    },
    sectorConfigApplyTemplate: (templateId) => {
      if (!templateId)
        return;
      vscode.postMessage({ type: "sectorConfigApplyTemplate", templateId });
    },
    sectorConfigAutoDetect: () => {
      const statusEl = document.getElementById("sectorConfigStatus");
      if (statusEl)
        statusEl.textContent = "Scanning workspace...";
      vscode.postMessage({ type: "sectorConfigAutoDetect" });
    },
    sectorConfigAdd: () => {
      const list = document.getElementById("sectorConfigList");
      if (!list)
        return;
      const idx = list.querySelectorAll(".sector-config-row").length;
      const row = document.createElement("div");
      row.className = "sector-config-row";
      row.dataset.index = String(idx);
      row.innerHTML = `
          <div style="display:flex; gap:4px; align-items:center;">
            <input type="color" value="#6366f1" class="sector-color-input" />
            <input type="text" placeholder="sector-id" class="sector-id-input" style="width:80px;" />
            <input type="text" placeholder="DISPLAY NAME" class="sector-name-input" style="flex:1;" />
            <button class="btn-secondary" onclick="sectorConfigRemoveRow(this)" style="padding:2px 6px; font-size:10px;">&#x2715;</button>
          </div>
          <div style="display:flex; gap:4px; margin-top:3px;">
            <input type="text" placeholder="Paths: **/Folder1/**, **/Folder2/**" class="sector-paths-input" style="flex:1;" />
          </div>
          <div style="display:flex; gap:4px; margin-top:3px;">
            <input type="text" placeholder="Dependencies: core, inventory" class="sector-deps-input" style="flex:1;" />
            <label style="font-size:9px; display:flex; align-items:center; gap:2px; white-space:nowrap;"><input type="checkbox" class="sector-approval-input" /> Approval</label>
          </div>
        `;
      list.appendChild(row);
    },
    sectorConfigRemoveRow: (btn) => {
      const row = btn.closest(".sector-config-row");
      if (row)
        row.remove();
    },
    sectorConfigSave: () => {
      const list = document.getElementById("sectorConfigList");
      if (!list)
        return;
      const rows = list.querySelectorAll(".sector-config-row");
      const sectors = [];
      rows.forEach((row) => {
        const id = row.querySelector(".sector-id-input")?.value?.trim();
        const name = row.querySelector(".sector-name-input")?.value?.trim();
        const color = row.querySelector(".sector-color-input")?.value || "#6366f1";
        const pathsRaw = row.querySelector(".sector-paths-input")?.value || "";
        const depsRaw = row.querySelector(".sector-deps-input")?.value || "";
        const approval = row.querySelector(".sector-approval-input")?.checked || false;
        const description = row.dataset.description || "";
        const rules = row.dataset.rules || "";
        const icon = row.dataset.icon || "cpu";
        if (id) {
          sectors.push({
            id,
            name: name || id.toUpperCase(),
            icon,
            description,
            paths: pathsRaw.split(",").map((p) => p.trim()).filter((p) => p),
            rules,
            dependencies: depsRaw.split(",").map((d) => d.trim()).filter((d) => d),
            approvalRequired: approval,
            color
          });
        }
      });
      if (sectors.length === 0) {
        const statusEl2 = document.getElementById("sectorConfigStatus");
        if (statusEl2)
          statusEl2.textContent = "No sectors to save.";
        return;
      }
      vscode.postMessage({ type: "sectorConfigSave", sectors });
      const statusEl = document.getElementById("sectorConfigStatus");
      if (statusEl)
        statusEl.textContent = "Saving...";
    },
    sectorConfigExport: () => {
      vscode.postMessage({ type: "sectorConfigExport" });
    },
    sectorConfigImport: () => {
      vscode.postMessage({ type: "sectorConfigImport" });
    },
    // Security & Quality scan functions
    runSecurityScan: () => {
      vscode.postMessage({ type: "securityScan" });
    },
    exportSecurityReport: () => {
      vscode.postMessage({ type: "securityExport" });
    },
    runQualityScan: () => {
      vscode.postMessage({ type: "qualityScan" });
    },
    exportQualityReport: () => {
      vscode.postMessage({ type: "qualityExport" });
    },
    // --- Station Engineer (Phase 1) ---
    engineerRefresh,
    engineerAction,
    engineerDelegate,
    engineerRequestHistory,
    engineerToggleShowAll,
    engineerPromptAction,
    // --- Autopilot (Phase 3) ---
    autopilotPause,
    autopilotResume,
    autopilotAbort,
    autopilotRequestStatus,
    autopilotCheckSession,
    autopilotResumeSession,
    autopilotClearSession,
    autopilotUpdateConfig,
    // --- Game UI Pipeline (Phase 4) ---
    gameuiRequestState,
    gameuiRequestCatalog,
    gameuiFilterCategory,
    gameuiGenerateComponent,
    gameuiRunPhase,
    gameuiRunAll,
    gameuiStop,
    gameuiRequestThemes,
    gameuiSetActiveTheme,
    gameuiGenerateThemeUSS,
    gameuiSaveState,
    gameuiLoadState,
    // --- Build Pipeline (Phase 6.3) ---
    unityBuildCheck: () => {
      const indicator = document.getElementById("buildStatusIndicator");
      if (indicator) {
        indicator.textContent = "Checking...";
        indicator.style.color = "var(--text-secondary)";
      }
      vscode.postMessage({ type: "unityBuildCheck" });
    },
    // --- Chat Search (Phase 6.2) ---
    chatSearchToggle,
    chatSearchInput,
    chatSearchLoadResult,
    chatSearchClose,
    // --- Database Panel (Phase 6.1) ---
    dbShowConnectionWizard,
    dbAddConnection,
    dbRemoveConnection,
    dbTestConnection,
    dbSetActive,
    dbGetSchema,
    dbRequestState,
    // --- Comms Array (Phase 7) ---
    commsRequestState,
    commsSetTier,
    commsCheckServices,
    commsStartScan,
    commsViewScan,
    commsCloseScanDetail,
    commsInvestigateFinding,
    commsGenerateFixForFinding,
    // --- Ops Array (Phase 8) ---
    opsRequestState,
    opsAddServer,
    opsRemoveServer,
    opsSelectServer,
    opsTestConnection,
    opsHealthCheck,
    opsHardenServer,
    opsDeployService,
    opsShowOpOutput,
    opsExecuteActiveCommand: () => {
      const state = window._opsActiveServerId;
      if (state) {
        opsExecuteCommand(state);
      }
    },
    // --- Diagnostics (CF-3) ---
    runDiagnosticsScan,
    diagnosticsOpenFile,
    // Context Handoff functions
    handoffToPersona: (toPersona, action) => {
      const fromPersona = uiState.currentPersona || "lead-engineer";
      const chatEl = document.getElementById("chatMessages");
      const lastMessages = chatEl ? chatEl.innerText.slice(-500) : "";
      vscode.postMessage({
        type: "handoffCreate",
        fromPersona,
        toPersona,
        summary: "Context handoff from " + fromPersona,
        context: { chatHistory: [lastMessages], sectorId: uiState.shipSelectedSectorId || "" },
        action: action || "send_and_stay"
      });
    },
    toggleHandoffMenu: () => {
      const menu = document.getElementById("handoffMenu");
      if (!menu)
        return;
      const isVisible = menu.style.display !== "none";
      if (isVisible) {
        menu.style.display = "none";
        return;
      }
      const btn = menu.parentElement?.querySelector(".toolbar-icon-btn");
      if (btn) {
        const rect = btn.getBoundingClientRect();
        menu.style.left = rect.left + "px";
        menu.style.bottom = window.innerHeight - rect.top + 6 + "px";
      }
      menu.style.display = "block";
      const dismiss = (e) => {
        const target = e.target;
        if (!menu.contains(target) && !target.closest("#handoffDropdown")) {
          menu.style.display = "none";
          document.removeEventListener("click", dismiss);
        }
      };
      setTimeout(() => document.addEventListener("click", dismiss), 10);
    },
    handoffToQaEngineer: () => {
      window.handoffToPersona("qa-engineer", "send_and_stay");
    },
    handoffToLeadEngineer: () => {
      window.handoffToPersona("lead-engineer", "send_and_stay");
    },
    handoffToTechnicalWriter: () => {
      window.handoffToPersona("technical-writer", "send_and_stay");
    },
    handoffGoToQaEngineer: () => {
      window.handoffToPersona("qa-engineer", "go_to_tab");
      window.switchTab("station");
    },
    handoffGoToLeadEngineer: () => {
      window.handoffToPersona("lead-engineer", "go_to_tab");
    },
    // Autosolve functions
    autosolveAccept: (id) => {
      vscode.postMessage({ type: "autosolveAccept", resultId: id });
    },
    autosolveDismiss: (id) => {
      vscode.postMessage({ type: "autosolveDismiss", resultId: id });
    },
    autosolveSendToIndex: (id) => {
      vscode.postMessage({ type: "autosolveSendToIndex", resultId: id });
    },
    autosolveRefresh: () => {
      vscode.postMessage({ type: "autosolveList" });
    }
  });
  var savedTab = localStorage.getItem("spacecode.controlTab") || "info";
  var allowedTabs = /* @__PURE__ */ new Set(["info", "coordinator", "ops", "unity", "sectors", "security", "quality", "comms", "infra"]);
  setTimeout(() => switchControlTab(allowedTabs.has(savedTab) ? savedTab : "info"), 0);
  setTimeout(() => {
    localStorage.removeItem("spacecode.panelMode.chat");
    localStorage.removeItem("spacecode.panelMode.station");
    const defaultMode = TAB_DEFAULT_MODE[currentTab] || "station";
    setRightPanelMode(defaultMode);
    updatePanelToggleButtons();
  }, 0);
  var verificationPanelHandlers = createVerificationPanelHandlers({
    vscode,
    shipSetStatus,
    escapeHtml
  });
  var {
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
    showPlanStepGate: showPlanStepGate2,
    hidePlanStepGate,
    approvePlanStep,
    abortPlanStep,
    runAIReview,
    updateAIReview,
    setPlanExecutionButtonsEnabled,
    getPlanExecutionState,
    setPlanExecutionState
  } = verificationPanelHandlers;
  Object.assign(window, {
    scanDiff,
    runTests,
    approvePlanStep,
    abortPlanStep,
    runAIReview
  });
  var planHandlers = createPlanHandlers({
    vscode,
    shipSetStatus,
    escapeHtml,
    getCurrentMode: () => currentMode,
    getCurrentPlanData: () => currentPlanData,
    setCurrentPlanData: (value) => {
      currentPlanData = value;
      uiState.currentPlan = value;
    },
    getPlanList: () => planList,
    getPlanTemplates: () => planTemplates,
    setPlanTemplates: (value) => {
      planTemplates = value;
      uiState.planTemplates = value;
    },
    setPlanList: (value) => {
      planList = value;
      uiState.planList = value;
    },
    showPlanExecutionPanel,
    setPlanExecutionButtonsEnabled
  });
  var {
    refreshPlanTemplates,
    refreshPlans,
    generatePlan,
    saveCurrentPlan,
    usePlanForComparison,
    executeCurrentPlan,
    executePlanStepByStep,
    renderPlanSummary,
    renderPlanList,
    loadPlan
  } = planHandlers;
  Object.assign(window, {
    refreshPlanTemplates,
    refreshPlans,
    generatePlan,
    saveCurrentPlan,
    usePlanForComparison,
    executeCurrentPlan,
    executePlanStepByStep,
    loadPlan
  });
  var stationManager = createStationPanelHandlers({
    vscode,
    uiState,
    stationMap: STATION_MAP,
    escapeHtml,
    shipSetStatus
  });
  var {
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
    setShipProfile
  } = stationManager;
  var {
    renderAsmdefInventory,
    renderAsmdefPolicyEditor,
    renderAsmdefGraph,
    renderAsmdefCheckResult
  } = createAsmdefHandlers({
    vscode,
    escapeHtml
  });
  var {
    refreshDocTargets,
    docTargetChanged,
    openDocTarget,
    updateDocInfo,
    updateDocSuggestion,
    populateDocTargets
  } = createDocTargetHandlers({
    vscode,
    getDocTarget: () => docTarget,
    setDocTarget: (value) => {
      docTarget = value;
      uiState.docTarget = value;
    },
    shipSetStatus,
    getShipSelectedSectorId
  });
  setUpdateDocSuggestion(updateDocSuggestion);
  var {
    renderJobList,
    requestJobList,
    clearAllJobs
  } = createAutoexecuteHandlers({
    vscode
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
    clearAllJobs
  });
  var {
    setContextPreview,
    copyContextPreview
  } = createContextPreviewHandlers({
    shipSetStatus
  });
  Object.assign(window, {
    copyContextPreview
  });
  var rightPanelHandlers = createRightPanelHandlers({
    currentTab: () => currentTab,
    TABS,
    TAB_PANEL_MODES,
    TAB_DEFAULT_MODE
  });
  var {
    setRightPanelMode,
    updatePanelToggleButtons,
    restoreRightPanelModeForTab,
    toggleContextFlowPanel,
    toggleSwarmSidebar,
    toggleContextFlowDrawer
  } = rightPanelHandlers;
  var _setRightPanelMode = (mode) => {
    setRightPanelMode(mode);
    if (mode === "flow") {
      setTimeout(() => initContextFlowVisualization(), 50);
    }
  };
  Object.assign(window, {
    setRightPanelMode: _setRightPanelMode,
    toggleContextFlowPanel,
    toggleSwarmSidebar,
    toggleContextFlowDrawer
  });
  var planningPanelHandlers = createPlanningPanelHandlers({
    vscode
  });
  var {
    renderPlanningPanel,
    startPlanningSession,
    advancePlanPhase,
    skipToPlanPhase,
    cancelPlanSession,
    completePlanSession,
    passCurrentGate,
    generatePlanFromSession
  } = planningPanelHandlers;
  Object.assign(window, {
    startPlanningSession,
    advancePlanPhase,
    skipToPlanPhase,
    cancelPlanSession,
    completePlanSession,
    passCurrentGate,
    generatePlanFromSession
  });
  var chatModeHandlers = createChatModeHandlers({
    vscode,
    uiState,
    TABS,
    CHAT_MODES,
    getCurrentTab: () => currentTab,
    getCurrentChatMode: () => currentChatMode,
    setCurrentChatMode: (value) => {
      currentChatMode = value;
    },
    restoreRightPanelModeForTab,
    setRightPanelMode
  });
  var {
    updateChatModeSwitcherVisibility,
    updateMastermindConfigVisibility,
    switchChatMode
  } = chatModeHandlers;
  Object.assign(window, {
    switchChatMode,
    updateMastermindConfigVisibility
  });
  var agentsManager = createAgentsPanelHandlers({
    vscode,
    escapeHtml
  });
  var {
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
    handleWorkflowEvent
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
    refreshAgentList: () => {
      vscode.postMessage({ type: "getAgentList" });
    },
    refreshSkillCatalog: () => {
      vscode.postMessage({ type: "getSkillList" });
    },
    viewAgentDetails: (agentId) => {
      vscode.postMessage({ type: "getAgentDetails", agentId });
    }
  });
  var tabHandlers = createTabHandlers({
    TABS,
    PERSONA_MAP,
    setCurrentTab: (value) => {
      currentTab = value;
      reconcileContext(value);
    },
    setCurrentMode: (value) => {
      currentMode = value;
    },
    setCurrentPersona: (value) => {
      uiState.currentPersona = value;
      updateContextBar();
    },
    getPersonaManualOverride: () => uiState.personaManualOverride,
    getDashboardSubtab: () => uiState.dashboardSubtab || "docs",
    restoreRightPanelModeForTab,
    updateChatModeSwitcherVisibility,
    ensureAgentsInitialized,
    requestWorkflows,
    vscode
  });
  var { initTabButtons, switchTab } = tabHandlers;
  var settingsOverlayOpen = false;
  var settingsContentMoved = false;
  var toggleSettingsOverlay = () => {
    const overlay = document.getElementById("settingsOverlay");
    const settingsBtn = document.getElementById("settingsHeaderBtn");
    const overlayContent = document.getElementById("settingsOverlayContent");
    const dashboardSettingsPanel = document.getElementById("dashboardSettingsPanel");
    if (!overlay)
      return;
    settingsOverlayOpen = !settingsOverlayOpen;
    if (settingsOverlayOpen) {
      if (!settingsContentMoved && dashboardSettingsPanel && overlayContent) {
        overlayContent.innerHTML = dashboardSettingsPanel.innerHTML;
        settingsContentMoved = true;
      }
      overlay.style.display = "flex";
      settingsBtn?.classList.add("active");
      vscode.postMessage({ type: "getSettings" });
      vscode.postMessage({ type: "getCliStatus" });
      vscode.postMessage({ type: "getUsageStats" });
    } else {
      overlay.style.display = "none";
      settingsBtn?.classList.remove("active");
    }
  };
  var PERSONA_COLORS2 = {
    "lead-engineer": "#a855f7",
    "qa-engineer": "#f59e0b",
    "technical-writer": "#3b82f6",
    "issue-triager": "#10b981",
    "database-engineer": "#22c55e",
    "art-director": "#ec4899"
  };
  var PERSONA_LABELS2 = {
    "lead-engineer": "Lead Engineer",
    "qa-engineer": "QA Engineer",
    "technical-writer": "Technical Writer",
    "issue-triager": "Issue Triager",
    "database-engineer": "Database Engineer",
    "art-director": "Art Director"
  };
  function updateContextBar() {
    const personaId = uiState.currentPersona || "lead-engineer";
    const color = PERSONA_COLORS2[personaId] || "#a855f7";
    const label = PERSONA_LABELS2[personaId] || personaId;
    const isPinned = !!uiState.personaManualOverride;
    const tagPersona = document.getElementById("tagPersona");
    const tagDot = document.getElementById("tagPersonaDot");
    const tagLabel = document.getElementById("tagPersonaLabel");
    if (tagDot)
      tagDot.style.background = color;
    if (tagLabel)
      tagLabel.textContent = label;
    if (tagPersona) {
      tagPersona.classList.toggle("pinned", isPinned);
      tagPersona.style.borderColor = `${color}66`;
      tagPersona.style.background = `${color}14`;
    }
    const SKILL_LABELS = {
      "sector-analysis": "Sectors",
      "asmdef-check": "Asmdef",
      "build-tools": "Build",
      "project-health": "Health",
      "settings-access": "Settings",
      "agent-management": "Agents",
      "task-delegation": "Tasks",
      "skill-lookup": "Skills",
      "doc-templates": "Docs"
    };
    const skillsEl = document.getElementById("tagSkills");
    if (skillsEl) {
      const combined = [.../* @__PURE__ */ new Set([...uiState.autoSkills || [], ...uiState.manualSkills || []])];
      skillsEl.innerHTML = combined.map((s) => {
        const display = SKILL_LABELS[s] || s.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
        return `<span class="tag tag-skill" title="${s}">${display}</span>`;
      }).join("");
    }
    const skinsEl = document.getElementById("tagSkins");
    if (skinsEl) {
      const skins = uiState.activeSkins || [];
      skinsEl.innerHTML = skins.map(
        (s) => `<span class="tag tag-skin" title="${s}">${s}</span>`
      ).join("");
    }
  }
  function setPersonaManual(personaId) {
    uiState.currentPersona = personaId;
    uiState.personaManualOverride = true;
    updateContextBar();
    closePersonaMenu();
    vscode.postMessage({ type: "setPersona", personaId });
  }
  function clearPersonaOverride() {
    uiState.personaManualOverride = false;
    const personaKey = currentTab === "dashboard" ? `dashboard:${uiState.dashboardSubtab || "docs"}` : currentTab;
    const persona = PERSONA_MAP && PERSONA_MAP[personaKey] || PERSONA_MAP[currentTab] || "lead-engineer";
    uiState.currentPersona = persona;
    updateContextBar();
  }
  function togglePersonaMenu() {
    const menu = document.getElementById("personaMenu");
    const tag = document.getElementById("tagPersona");
    if (!menu)
      return;
    const isOpen = menu.style.display !== "none";
    menu.style.display = isOpen ? "none" : "block";
    if (!isOpen && tag) {
      const rect = tag.getBoundingClientRect();
      const chatPane = document.getElementById("chatPane");
      const paneRect = chatPane ? chatPane.getBoundingClientRect() : { left: 0, top: 0 };
      menu.style.position = "fixed";
      menu.style.left = rect.left + "px";
      menu.style.bottom = window.innerHeight - rect.top + 4 + "px";
      menu.style.top = "auto";
    }
    if (!isOpen) {
      const dismiss = (e) => {
        if (!menu.contains(e.target) && !e.target.closest("#tagPersona")) {
          menu.style.display = "none";
          document.removeEventListener("click", dismiss);
        }
      };
      setTimeout(() => document.addEventListener("click", dismiss), 10);
    }
  }
  function closePersonaMenu() {
    const menu = document.getElementById("personaMenu");
    if (menu)
      menu.style.display = "none";
  }
  function reconcileContext(newTab) {
    const newAutoSkills = TAB_SKILL_MAP[newTab] || [];
    uiState.autoSkills = newAutoSkills;
    chatStore.setAutoSkills(newAutoSkills);
    if (!uiState.personaManualOverride) {
      const personaKey = newTab === "dashboard" ? `dashboard:${uiState.dashboardSubtab || "docs"}` : newTab;
      const persona = PERSONA_MAP && PERSONA_MAP[personaKey] || PERSONA_MAP[newTab] || "lead-engineer";
      uiState.currentPersona = persona;
    }
    updateContextBar();
  }
  function toggleChatCollapse() {
    const chatPane = document.getElementById("chatPane");
    const expandBtn = document.getElementById("chatExpandBtn");
    if (!chatPane)
      return;
    const isCollapsed = chatPane.classList.toggle("collapsed");
    uiState.chatCollapsed = isCollapsed;
    localStorage.setItem("spacecode.chatCollapsed", isCollapsed ? "1" : "0");
    if (expandBtn)
      expandBtn.style.display = isCollapsed ? "block" : "none";
  }
  if (localStorage.getItem("spacecode.chatCollapsed") === "1") {
    const chatPane = document.getElementById("chatPane");
    const expandBtn = document.getElementById("chatExpandBtn");
    if (chatPane)
      chatPane.classList.add("collapsed");
    if (expandBtn)
      expandBtn.style.display = "block";
    uiState.chatCollapsed = true;
  }
  function checkResponsiveLayout() {
    const container = document.querySelector(".main-split");
    if (!container)
      return;
    const width = container.getBoundingClientRect().width;
    const isSinglePanel = width < 550;
    document.body.classList.toggle("single-panel-mode", isSinglePanel);
    if (!isSinglePanel) {
      document.body.classList.remove("show-content");
    }
  }
  function toggleSinglePanelView() {
    document.body.classList.toggle("show-content");
  }
  var resizeObserver = new ResizeObserver(() => checkResponsiveLayout());
  var mainSplitEl = document.querySelector(".main-split");
  if (mainSplitEl)
    resizeObserver.observe(mainSplitEl);
  function tryNavigationCommand(text) {
    const cmd = text.trim().toLowerCase();
    const nav = BUILTIN_NAV_COMMANDS[cmd];
    if (!nav)
      return false;
    if (nav.special === "help") {
      const lines = Object.entries(BUILTIN_NAV_COMMANDS).filter(([, v]) => v.special !== "help").map(([k, v]) => `  **${k}** \u2014 ${v.label}`).join("\n");
      const helpText = `**Available Commands:**
${lines}
  **/help** \u2014 Show this help`;
      const chatMessages = document.getElementById("chatMessages");
      if (chatMessages) {
        const div = document.createElement("div");
        div.className = "chat-message system";
        div.innerHTML = `<div class="message-content" style="font-size:11px; white-space:pre-line; color:var(--text-secondary);">${helpText.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</div>`;
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
      return true;
    }
    switchTab(nav.tab);
    if (nav.subtab) {
      const switchDashboardSubtab2 = window.switchDashboardSubtab;
      if (typeof switchDashboardSubtab2 === "function") {
        switchDashboardSubtab2(nav.subtab);
      }
    }
    return true;
  }
  Object.assign(window, {
    switchTab,
    setPersonaManual,
    clearPersonaOverride,
    togglePersonaMenu,
    updateContextBar,
    toggleChatCollapse,
    toggleSinglePanelView,
    tryNavigationCommand,
    reconcileContext,
    toggleSettingsOverlay,
    // Legacy alias
    openSettings: toggleSettingsOverlay
  });
  initTabButtons();
  updateChatModeSwitcherVisibility();
  var chatToolsHandlers = createChatToolsHandlers({
    vscode,
    setRightPanelMode,
    getCurrentChatMode: () => currentChatMode,
    chatModes: CHAT_MODES
  });
  var {
    getGptOpinion,
    toggleChatSplit,
    syncChatSplitMirror,
    getChatSplitActive
  } = chatToolsHandlers;
  Object.assign(window, {
    getGptOpinion,
    toggleChatSplit
  });
  var modelToolbarHandlers = createModelToolbarHandlers({
    vscode,
    getCurrentMode: () => currentMode,
    setCurrentChatProvider
  });
  var {
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
    getGptInterventionLevel
  } = modelToolbarHandlers;
  Object.assign(window, {
    toggleToolbarDropdown,
    selectChatMode,
    selectModel,
    selectReasoning,
    selectConsultant,
    toggleGptConsult,
    selectInterventionLevel
  });
  var chatInputHandlers = createChatInputHandlers({
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
    setAttachedImages: (value) => {
      attachedImages = value;
      uiState.attachedImages = value;
    },
    setGenerating,
    updateSendStopButton,
    stopConversation,
    getCurrentPersona: () => uiState.currentPersona || "lead-engineer"
  });
  var {
    sendMessage,
    toggleDropZone,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handlePaste,
    removeImage,
    showCompactionNotice,
    handleKeyDown,
    autoResize
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
    autoResize
  });
  var tokenBarHandlers = createTokenBarHandlers({
    vscode,
    currentSettings,
    getContextLimit,
    getChatSessions: () => chatSessions,
    getCurrentChatId: () => currentChatId
  });
  var {
    mergePricing,
    openPricing,
    updateTokenBar
  } = tokenBarHandlers;
  Object.assign(window, {
    openPricing,
    openExternalUrl: (url) => {
      vscode.postMessage({ type: "openExternal", url });
    },
    // Model panel handlers
    switchModelTab: (provider) => {
      const claudePanel = document.getElementById("claudeModelsPanel");
      const gptPanel = document.getElementById("gptModelsPanel");
      const tabs = document.querySelectorAll(".model-tab");
      tabs.forEach((tab) => {
        tab.classList.toggle("active", tab.getAttribute("data-provider") === provider);
      });
      if (claudePanel && gptPanel) {
        claudePanel.classList.toggle("hidden", provider !== "claude");
        gptPanel.classList.toggle("hidden", provider !== "gpt");
      }
    },
    verifyAllModels: () => {
      const btn = document.getElementById("verifyModelsBtn");
      const status = document.getElementById("modelVerificationStatus");
      if (btn)
        btn.innerHTML = '<span class="btn-icon">\u23F3</span> Verifying...';
      if (status) {
        status.className = "verification-status";
        status.innerHTML = '<span class="status-text">Verifying models...</span>';
      }
      document.querySelectorAll(".verify-status").forEach((el) => {
        el.textContent = "\u23F3";
        el.className = "verify-status checking";
      });
      vscode.postMessage({ type: "verifyModels" });
    },
    selectDefaultModel: (provider, modelId) => {
      vscode.postMessage({ type: "setModel", provider, model: modelId });
      showToast(`${provider === "claude" ? "Claude" : "GPT"} default model set to ${modelId}`, "success");
      const cards = document.querySelectorAll(`#${provider}ModelsPanel .model-card`);
      cards.forEach((card) => {
        const isSelected = card.getAttribute("data-model-id") === modelId;
        card.classList.toggle("default", isSelected);
        const badge = card.querySelector(".default-badge");
        const btn = card.querySelector(".btn-tiny");
        if (badge)
          badge.remove();
        if (btn) {
          btn.classList.toggle("active", isSelected);
          btn.textContent = isSelected ? "\u2713" : "\u25CB";
        }
        if (isSelected && !card.querySelector(".default-badge")) {
          const nameEl = card.querySelector(".model-name");
          if (nameEl) {
            const newBadge = document.createElement("span");
            newBadge.className = "default-badge";
            newBadge.textContent = "Default";
            nameEl.appendChild(newBadge);
          }
        }
      });
    },
    handleModelVerificationResults: (results) => {
      const btn = document.getElementById("verifyModelsBtn");
      const status = document.getElementById("modelVerificationStatus");
      if (btn)
        btn.innerHTML = '<span class="btn-icon">\u{1F50D}</span> Verify All';
      let validCount = 0;
      let invalidCount = 0;
      for (const result of results.results || []) {
        const el = document.getElementById(`verify-${result.modelId}`);
        if (el) {
          if (result.status === "valid") {
            el.textContent = "\u2713";
            el.className = "verify-status valid";
            el.title = result.message;
            validCount++;
          } else if (result.status === "invalid") {
            el.textContent = "\u2717";
            el.className = "verify-status invalid";
            el.title = result.message;
            invalidCount++;
          } else if (result.status === "no-key") {
            el.textContent = "\u{1F511}";
            el.className = "verify-status";
            el.title = "No API key";
          } else {
            el.textContent = "?";
            el.className = "verify-status";
            el.title = result.message;
          }
        }
      }
      if (status) {
        const total = results.claudeModelsTotal + results.gptModelsTotal;
        const valid = results.claudeModelsValid + results.gptModelsValid;
        if (invalidCount > 0) {
          status.className = "verification-status warning";
          status.innerHTML = `<span class="status-text">${valid}/${total} models verified \xB7 ${invalidCount} invalid</span>`;
        } else if (valid === total) {
          status.className = "verification-status success";
          status.innerHTML = `<span class="status-text">All ${total} models verified \u2713</span>`;
        } else {
          status.className = "verification-status";
          status.innerHTML = `<span class="status-text">${valid}/${total} models verified</span>`;
        }
      }
    }
  });
  var settingsPanelHandlers = createSettingsPanelHandlers({
    vscode,
    currentSettings,
    updateTokenBar,
    getCurrentChatId: () => currentChatId,
    showToast
  });
  var {
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
    renderUsageStats
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
      document.body.classList.toggle("show-panel-borders", enabled);
      localStorage.setItem("spacecode.showBorders", enabled ? "1" : "0");
    },
    toggleSoundEnabled: (enabled) => {
      vscode.postMessage({ type: "saveSoundSettings", enabled });
    },
    saveSoundSetting: (key, value) => {
      if (key === "enabled") {
        vscode.postMessage({ type: "saveSoundSettings", enabled: value });
      } else if (key === "volume") {
        vscode.postMessage({ type: "saveSoundSettings", volume: parseFloat(value) });
      }
    },
    saveSoundEventSetting: (event, enabled) => {
      const evts = {};
      evts[event] = enabled;
      vscode.postMessage({ type: "saveSoundSettings", events: evts });
    },
    soundVolumePreview: /* @__PURE__ */ (() => {
      let previewTimer = null;
      return (val) => {
        const label = document.getElementById("soundVolumeLabel");
        if (label)
          label.textContent = `(${val}%)`;
        if (previewTimer)
          clearTimeout(previewTimer);
        previewTimer = setTimeout(() => {
          vscode.postMessage({ type: "previewSound", volume: parseFloat(val) / 100 });
        }, 300);
      };
    })(),
    loadSoundSettingsUI: (settings) => {
      if (!settings)
        return;
      const enabledEl = document.getElementById("settingsSoundEnabled");
      if (enabledEl)
        enabledEl.checked = settings.enabled !== false;
      const volEl = document.getElementById("settingsSoundVolume");
      if (volEl)
        volEl.value = String(Math.round((settings.volume || 0.5) * 100));
      const volLabel = document.getElementById("soundVolumeLabel");
      if (volLabel)
        volLabel.textContent = `(${Math.round((settings.volume || 0.5) * 100)}%)`;
      const events = settings.events || {};
      const allEvents = ["aiComplete", "aiError", "buildSuccess", "buildFail", "planReady", "workflowDone", "jobQueued", "jobApproved", "sectorViolation", "notification"];
      for (const evt of allEvents) {
        const el = document.getElementById("soundEvt_" + evt);
        if (el)
          el.checked = events[evt] !== false;
      }
    }
  });
  if (localStorage.getItem("spacecode.showBorders") === "1") {
    document.body.classList.add("show-panel-borders");
    const checkbox = document.getElementById("settingsShowBorders");
    if (checkbox)
      checkbox.checked = true;
  }
  var {
    showTicketsPanel,
    hideTicketsPanel,
    toggleTicketFormMain,
    createTicketMain,
    filterTickets,
    renderTicketsListMain,
    updateTicketTypePreview
  } = createTicketPanelHandlers({
    vscode,
    getPlanList: () => planList,
    shipSetStatus,
    escapeHtml,
    updateTicketStatus,
    deleteTicket
  });
  Object.assign(window, {
    toggleTicketFormMain,
    createTicketMain,
    filterTickets,
    updateTicketTypePreview
  });
  var {
    refreshSkills,
    createSkill,
    filterSkills,
    renderSkillsList,
    runSkill,
    editSkill
  } = createSkillsPanelHandlers({
    vscode,
    escapeHtml
  });
  Object.assign(window, {
    refreshSkills,
    createSkill,
    filterSkills,
    runSkill,
    editSkill
  });
  var {
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
    openSettingsFile
  } = createDashboardHandlers({
    vscode,
    escapeHtml,
    shipSetStatus,
    setDashboardSubtab: (value) => {
      uiState.dashboardSubtab = value;
    },
    setCurrentPersona: (value) => {
      uiState.currentPersona = value;
      updateContextBar();
    },
    getPersonaManualOverride: () => uiState.personaManualOverride,
    PERSONA_MAP
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
    refreshMission: () => {
      vscode.postMessage({ type: "getMissionData" });
    },
    createMilestone: () => {
      const title = prompt("Milestone title:");
      if (title)
        vscode.postMessage({ type: "createMilestone", title });
    },
    // Storage Panel
    refreshStorage: () => {
      vscode.postMessage({ type: "getStorageStats" });
    },
    browseDbMessages: () => {
      vscode.postMessage({ type: "getRecentDbMessages", limit: 100 });
    },
    exportStorageData: () => {
      vscode.postMessage({ type: "exportStorageData" });
    },
    clearChatHistory: () => {
      if (confirm("Clear all chat history?"))
        vscode.postMessage({ type: "clearChatHistory" });
    },
    clearEmbeddings: () => {
      if (confirm("Clear all embeddings?"))
        vscode.postMessage({ type: "clearEmbeddings" });
    },
    clearAllStorage: () => {
      if (confirm("Clear ALL storage data? This cannot be undone."))
        vscode.postMessage({ type: "clearAllStorage" });
    },
    // Dashboard ticket auto-route preview
    updateDashboardTicketPreview: () => {
      const titleEl = document.getElementById("dashboardTicketTitle");
      const descEl = document.getElementById("dashboardTicketDescription");
      const previewEl = document.getElementById("dashboardTicketRoutePreview");
      if (!titleEl || !previewEl)
        return;
      const title = titleEl.value || "";
      const desc = descEl ? descEl.value || "" : "";
      if (!title.trim()) {
        previewEl.style.display = "none";
        return;
      }
      const text = (title + " " + desc).toLowerCase();
      const types = {
        bug: ["bug", "fix", "broken", "crash", "error", "issue", "defect", "regression", "null", "exception", "fail"],
        feature: ["feature", "add", "new", "implement", "create", "enhance", "ability", "support", "request"],
        doc_update: ["doc", "document", "readme", "wiki", "comment", "explain", "guide", "tutorial"],
        refactor: ["refactor", "clean", "rename", "restructure", "optimize", "simplify", "extract", "move", "split"],
        question: ["question", "how", "why", "what", "help", "unclear", "understand"]
      };
      let bestType = "question", bestScore = 0;
      for (const [t, kws] of Object.entries(types)) {
        let s = 0;
        for (const k of kws) {
          if (text.includes(k))
            s++;
        }
        if (s > bestScore) {
          bestScore = s;
          bestType = t;
        }
      }
      const routing = { bug: "qa-engineer", feature: "lead-engineer", doc_update: "technical-writer", refactor: "qa-engineer", question: "lead-engineer" };
      const colors = { "qa-engineer": "#f59e0b", "lead-engineer": "#a855f7", "technical-writer": "#3b82f6" };
      const names = { "qa-engineer": "QA Engineer", "lead-engineer": "Lead Engineer", "technical-writer": "Technical Writer" };
      const persona = routing[bestType] || "lead-engineer";
      previewEl.style.display = "flex";
      previewEl.innerHTML = '<span style="font-size:10px;color:var(--text-secondary);">Auto-route:</span> <span style="font-size:10px;font-weight:600;color:' + (colors[persona] || "#888") + ';">' + bestType.replace("_", " ").toUpperCase() + " \u2192 " + (names[persona] || persona) + "</span>";
    },
    // Art Studio Panel
    refreshArtStudio: () => {
      vscode.postMessage({ type: "getArtStudioData" });
    },
    setupStyleGuide: () => {
      vscode.postMessage({ type: "getArtStudioData" });
      showToast("Style guide setup coming soon", "info");
    },
    generateArtImage: () => {
      const promptEl = document.getElementById("artGenPrompt");
      const presetEl = document.getElementById("artGenPreset");
      vscode.postMessage({
        type: "generateArtImage",
        prompt: promptEl?.value || "",
        preset: presetEl?.value || "concept"
      });
    }
  });
  function setProjectComplexity(complexity) {
    vscode.postMessage({ type: "docsSetComplexity", complexity });
  }
  function startDocsWizard() {
    vscode.postMessage({ type: "docsWizardStart" });
  }
  function docsWizardNext() {
    const contentEl = document.getElementById("docsWizardContent");
    if (contentEl) {
      const docType = contentEl.dataset.docType;
      if (docType) {
        const answers = {};
        contentEl.querySelectorAll(".wiz-answer").forEach((el) => {
          const qid = el.dataset.qid;
          if (qid && el.value)
            answers[qid] = el.value;
        });
        if (Object.keys(answers).length > 0) {
          vscode.postMessage({ type: "docsWizardSetAnswers", docType, answers });
        }
      }
    }
    vscode.postMessage({ type: "docsWizardNext" });
  }
  function docsWizardPrev() {
    vscode.postMessage({ type: "docsWizardPrev" });
  }
  function docsWizardSkip() {
    vscode.postMessage({ type: "docsWizardSkip" });
  }
  function docsWizardComplete() {
    vscode.postMessage({ type: "docsWizardComplete" });
  }
  function docsWizardCancel() {
    vscode.postMessage({ type: "docsWizardCancel" });
  }
  function detectDocDrift() {
    vscode.postMessage({ type: "docsDetectDrift" });
  }
  window._wizSetProjectInfo = function() {
    const name = document.getElementById("wizProjectName")?.value || "";
    const projectType = document.getElementById("wizProjectType")?.value || "unity";
    vscode.postMessage({ type: "docsWizardSetProjectInfo", name, projectType });
  };
  window._wizToggleDoc = function(docType) {
    vscode.postMessage({ type: "docsWizardToggleDoc", docType });
  };
  window._openDriftDoc = function(docType) {
    vscode.postMessage({ type: "docsOpenDocument", docType });
  };
  Object.assign(window, {
    setProjectComplexity,
    startDocsWizard,
    docsWizardNext,
    docsWizardPrev,
    docsWizardSkip,
    docsWizardComplete,
    docsWizardCancel,
    detectDocDrift
  });
  vscode.postMessage({ type: "docsGetComplexity" });
  vscode.postMessage({ type: "docsGetSummary" });
  var {
    renderMcpServers,
    selectMcpServer,
    mcpAction,
    addMcpServer
  } = createMcpPanelHandlers({
    vscode
  });
  Object.assign(window, {
    selectMcpServer,
    mcpAction,
    addMcpServer,
    pingUnityMcp: () => {
      vscode.postMessage({ type: "unityCheckConnection" });
    },
    pingCoplayMcp: () => {
      vscode.postMessage({ type: "unityCheckConnection" });
    }
  });
  var {
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
    handleCrawlProgress
  } = createKbPanelHandlers({
    vscode
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
    addKbUrl
  });
  var {
    loadVoiceSettings,
    downloadWhisperModel,
    downloadWhisperBinary,
    saveVoiceSettings,
    testMicrophone,
    testSpeaker,
    updateVoiceDownloadProgress,
    handleMicTestStatus,
    handleSpeakerTestStatus
  } = createVoicePanelHandlers({
    vscode
  });
  Object.assign(window, {
    downloadWhisperModel,
    downloadWhisperBinary,
    saveVoiceSettings,
    testMicrophone,
    testSpeaker
  });
  var messageRouter = createMessageRouter({
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
    setLastCoordinatorToast: (value) => {
      lastCoordinatorToast = value;
    },
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
    setGptFlowPending: (value) => {
      _gptFlowPending = value;
    },
    getTicketList: () => ticketList,
    setTicketList: (value) => {
      ticketList = value;
    },
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
    engineerRenderStatus,
    engineerRenderSuggestions,
    engineerRenderHistory,
    engineerRenderPrompt,
    engineerHandleDelegated,
    engineerCheckSectors,
    autopilotRenderStatus,
    autopilotRenderStepResult,
    autopilotRenderSessionPrompt,
    autopilotRenderConfig,
    gameuiRenderState,
    gameuiRenderCatalog,
    gameuiRenderEvent,
    gameuiRenderThemes,
    dbRenderConnectionList,
    dbRenderSchema,
    dbRenderQueryResult,
    dbRenderTestResult,
    chatSearchRenderResults,
    commsRenderState,
    commsRenderScanDetail,
    commsRenderScanStarted,
    commsRenderScanCompleted,
    commsRenderPrompt,
    opsRenderState,
    opsRenderCommandOutput,
    opsRenderRecentOps,
    renderDiagnosticsResult,
    renderDiagnosticsProgress,
    vscode,
    getPlanTemplates: () => planTemplates,
    setPlanTemplates: (value) => {
      planTemplates = value;
      uiState.planTemplates = value;
    },
    getPlanList: () => planList,
    setPlanList: (value) => {
      planList = value;
      uiState.planList = value;
    },
    getCurrentPlanData: () => currentPlanData,
    setCurrentPlanData: (value) => {
      currentPlanData = value;
      uiState.currentPlan = value;
    }
  });
  window.addEventListener("message", (event) => {
    messageRouter.handleMessage(event.data);
  });
  document.addEventListener("DOMContentLoaded", function() {
    initKbDropZone();
    initMainSplitter();
    window.switchTab(TABS.STATION);
    setTimeout(() => {
      initContextFlowVisualization();
    }, 100);
  });
  vscode.postMessage({ type: "getSettings" });
  vscode.postMessage({ type: "getPricing" });
  vscode.postMessage({ type: "kbGetEmbedderStatus" });
  vscode.postMessage({ type: "getKbEntries" });
  vscode.postMessage({ type: "getPlanTemplates" });
  vscode.postMessage({ type: "listPlans" });
  vscode.postMessage({ type: "getTickets" });
})();
//# sourceMappingURL=panel.js.map
