// @ts-nocheck

export function createTabHandlers(deps) {
  const {
    TABS,
    PERSONA_MAP,
    setCurrentTab,
    setCurrentMode,
    setCurrentPersona,
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

    const chatSection = document.getElementById('chatSection');
    const agentsSection = document.getElementById('agentsSection');
    const ticketsSection = document.getElementById('ticketsSection');
    const skillsSection = document.getElementById('skillsSection');
    const dashboardSection = document.getElementById('dashboardSection');
    const rightPane = document.getElementById('rightPane');
    const mainSplitter = document.getElementById('mainSplitter');
    const leftPane = document.querySelector('.left-pane');

    if (chatSection) chatSection.style.display = 'none';
    if (agentsSection) agentsSection.style.display = 'none';
    if (ticketsSection) ticketsSection.style.display = 'none';
    if (skillsSection) skillsSection.style.display = 'none';
    if (dashboardSection) dashboardSection.style.display = 'none';

    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`.mode-btn[data-tab="${tabName}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    setCurrentTab(tabName);
    setCurrentMode(tabName);

    // Update active persona based on tab (+ dashboard subtab)
    const personaKey = tabName === 'dashboard'
      ? `dashboard:${getDashboardSubtab()}`
      : tabName;
    const persona = (PERSONA_MAP && PERSONA_MAP[personaKey]) || PERSONA_MAP[tabName] || 'nova';
    setCurrentPersona(persona);

    if (rightPane) rightPane.style.display = 'none';
    if (mainSplitter) mainSplitter.style.display = 'none';
    if (leftPane) leftPane.style.flex = '1';

    const contextFlowPanel = document.getElementById('contextFlowPanel');

    switch (tabName) {
      case TABS.CHAT:
        if (chatSection) chatSection.style.display = 'flex';
        if (leftPane) leftPane.style.flex = '1 1 50%';
        if (rightPane) {
          rightPane.style.display = 'flex';
          rightPane.style.flex = '1 1 50%';
        }
        restoreRightPanelModeForTab(TABS.CHAT);
        if (mainSplitter) mainSplitter.style.display = 'none';
        if (contextFlowPanel) contextFlowPanel.style.display = 'none';
        updateChatModeSwitcherVisibility();
        break;

      case TABS.STATION:
        if (rightPane) rightPane.style.display = 'flex';
        if (mainSplitter) mainSplitter.style.display = 'block';
        if (leftPane) leftPane.style.flex = '0 0 350px';
        if (chatSection) chatSection.style.display = 'flex';
        if (contextFlowPanel) contextFlowPanel.style.display = 'none';
        restoreRightPanelModeForTab(TABS.STATION);
        const switcher = document.getElementById('chatModeSwitcher');
        if (switcher) switcher.style.display = 'none';
        break;

      case TABS.AGENTS:
        if (agentsSection) agentsSection.style.display = 'flex';
        ensureAgentsInitialized();
        requestWorkflows();
        break;

      case TABS.SKILLS:
        if (skillsSection) {
          skillsSection.style.display = 'flex';
        } else if (chatSection) {
          chatSection.style.display = 'flex';
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
