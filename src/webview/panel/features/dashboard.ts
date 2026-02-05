// @ts-nocheck

export function createDashboardHandlers(deps) {
  const {
    vscode,
    escapeHtml,
    shipSetStatus,
    setDashboardSubtab,
    setCurrentPersona,
    getPersonaManualOverride,
    PERSONA_MAP,
  } = deps;

  let dashboardMetrics = {};
  let activityList = [];
  let dashboardTicketFormVisible = false;

  function toggleTicketFormDashboard() {
    dashboardTicketFormVisible = !dashboardTicketFormVisible;
    const form = document.getElementById('dashboardTicketForm');
    if (form) form.style.display = dashboardTicketFormVisible ? 'block' : 'none';
  }

  function createTicketFromDashboard() {
    const titleEl = document.getElementById('dashboardTicketTitle') as HTMLInputElement;
    const descEl = document.getElementById('dashboardTicketDescription') as HTMLTextAreaElement;
    const priorityEl = document.getElementById('dashboardTicketPriority') as HTMLSelectElement;
    const sectorEl = document.getElementById('dashboardTicketSector') as HTMLSelectElement;

    const title = titleEl ? titleEl.value.trim() : '';
    if (!title) {
      if (shipSetStatus) shipSetStatus('Ticket title is required.');
      return;
    }

    vscode.postMessage({
      type: 'createTicket',
      title,
      description: descEl ? descEl.value.trim() : '',
      priority: priorityEl ? priorityEl.value : 'medium',
      sectorId: sectorEl ? sectorEl.value : '',
    });

    if (titleEl) titleEl.value = '';
    if (descEl) descEl.value = '';
    toggleTicketFormDashboard();
    if (shipSetStatus) shipSetStatus('Ticket created.');
  }

  function refreshDbStats() {
    vscode.postMessage({ type: 'getDbStats' });
  }

  function scanProjectDocs() {
    vscode.postMessage({ type: 'scanProjectDocs' });
  }

  function refreshDocs() {
    vscode.postMessage({ type: 'getDocs' });
  }

  function ingestKbSource() {
    const urlEl = document.getElementById('kbSourceUrl') as HTMLInputElement;
    const url = urlEl ? urlEl.value.trim() : '';
    if (!url) {
      if (shipSetStatus) shipSetStatus('Enter a URL or path to ingest.');
      return;
    }
    vscode.postMessage({ type: 'ingestKbSource', url });
    if (urlEl) urlEl.value = '';
    if (shipSetStatus) shipSetStatus('Ingesting source...');
  }

  function refreshDashboard() {
    vscode.postMessage({ type: 'getDashboardMetrics' });
    vscode.postMessage({ type: 'getTickets' });
    vscode.postMessage({ type: 'getRecentActivity' });
  }

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

  function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
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

  const panelIds = {
    docs: 'dashboardDocsPanel',
    tickets: 'dashboardTicketsPanel',
    db: 'dashboardDbPanel',
    mcp: 'dashboardMcpPanel',
    logs: 'dashboardLogsPanel',
    settings: 'dashboardSettingsPanel',
    mission: 'dashboardMissionPanel',
    storage: 'dashboardStoragePanel',
    art: 'dashboardArtPanel',
    info: 'dashboardInfoPanel',
  };

  function switchDashboardSubtab(subtab) {
    // Hide all dashboard panels
    Object.values(panelIds).forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    // Show selected panel
    const targetId = panelIds[subtab];
    if (targetId) {
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        targetEl.style.display = 'block';
        console.log('[Dashboard] Showing panel:', targetId, 'found:', !!targetEl, 'height:', targetEl.offsetHeight);
      } else {
        console.warn('[Dashboard] Panel element NOT FOUND:', targetId);
      }
    }

    // Update active class on subtab buttons
    document.querySelectorAll('.dashboard-subtab').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-subtab') === subtab);
    });

    // Track subtab for persona routing and update persona (unless manual override)
    if (setDashboardSubtab) setDashboardSubtab(subtab);
    if (!getPersonaManualOverride || !getPersonaManualOverride()) {
      const persona = PERSONA_MAP && PERSONA_MAP['dashboard:' + subtab];
      if (persona && setCurrentPersona) setCurrentPersona(persona);
    }

    // Request data refresh for specific subtabs
    if (subtab === 'settings') {
      vscode.postMessage({ type: 'getSettings' });
      vscode.postMessage({ type: 'getCliStatus' });
      vscode.postMessage({ type: 'getToolbarSettings' });
    } else if (subtab === 'mcp') {
      vscode.postMessage({ type: 'getMcpServers' });
      // Also trigger a live Unity status check so MCP statuses are fresh
      vscode.postMessage({ type: 'unityCheckConnection' });
    } else if (subtab === 'logs') {
      vscode.postMessage({ type: 'getLogs' });
    } else if (subtab === 'db') {
      vscode.postMessage({ type: 'getDbStats' });
    } else if (subtab === 'mission') {
      vscode.postMessage({ type: 'getMissionData' });
    } else if (subtab === 'storage') {
      vscode.postMessage({ type: 'getStorageStats' });
    } else if (subtab === 'art') {
      vscode.postMessage({ type: 'getArtStudioData' });
    } else if (subtab === 'info') {
      vscode.postMessage({ type: 'getSettingsFilePath' });
    }
  }

  function openSettingsFile() {
    vscode.postMessage({ type: 'openSettingsFile' });
  }

  return {
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
  };
}
