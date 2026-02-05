// @ts-nocheck

export function createTabHandlers(deps) {
  const {
    TABS,
    PERSONA_MAP,
    setCurrentTab,
    setCurrentMode,
    setCurrentPersona,
    getPersonaManualOverride,
    getDashboardSubtab,
    restoreRightPanelModeForTab,
    updateChatModeSwitcherVisibility,
    ensureAgentsInitialized,
    requestWorkflows,
    vscode,
  } = deps;

  function initTabButtons() {
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const clickedTab = btn.dataset.tab || btn.dataset.mode;
        if (!btn.onclick) {
          switchTab(clickedTab);
        }
      });
    });
  }

  function switchTab(tabName) {
    console.log('[SpaceCode UI] switchTab called with:', tabName);

    // V3 layout: chat-pane is always visible (persistent left panel).
    // Content-pane sections switch visibility based on active tab.
    const agentsSection = document.getElementById('agentsSection');
    const ticketsSection = document.getElementById('ticketsSection');
    const skillsSection = document.getElementById('skillsSection');
    const dashboardSection = document.getElementById('dashboardSection');
    const stationSection = document.getElementById('stationSection');

    // Hide all content-pane sections
    if (agentsSection) agentsSection.style.display = 'none';
    if (ticketsSection) ticketsSection.style.display = 'none';
    if (skillsSection) skillsSection.style.display = 'none';
    if (dashboardSection) dashboardSection.style.display = 'none';
    if (stationSection) stationSection.classList.remove('active');

    // Update header tab button active state
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`.mode-btn[data-tab="${tabName}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    setCurrentTab(tabName);
    setCurrentMode(tabName);

    // Auto-switch persona based on tab (+ dashboard subtab), unless manual override is active
    if (!getPersonaManualOverride()) {
      const personaKey = tabName === 'dashboard'
        ? `dashboard:${getDashboardSubtab()}`
        : tabName;
      const persona = (PERSONA_MAP && PERSONA_MAP[personaKey]) || PERSONA_MAP[tabName] || 'lead-engineer';
      setCurrentPersona(persona);
    }

    switch (tabName) {
      case TABS.STATION:
        if (stationSection) stationSection.classList.add('active');
        restoreRightPanelModeForTab(TABS.STATION);
        break;

      case TABS.AGENTS:
        if (agentsSection) agentsSection.style.display = 'flex';
        ensureAgentsInitialized();
        requestWorkflows();
        break;

      case TABS.SKILLS:
        if (skillsSection) {
          skillsSection.style.display = 'flex';
        }
        vscode.postMessage({ type: 'getSkills' });
        break;

      case TABS.DASHBOARD:
        if (dashboardSection) dashboardSection.style.display = 'flex';
        vscode.postMessage({ type: 'getDashboardMetrics' });
        vscode.postMessage({ type: 'getTickets' });
        vscode.postMessage({ type: 'getRecentActivity' });
        break;
    }
  }

  return {
    initTabButtons,
    switchTab,
  };
}
