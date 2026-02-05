// @ts-nocheck

export function createRightPanelHandlers(deps) {
  const {
    currentTab,
    TABS,
    TAB_PANEL_MODES,
    TAB_DEFAULT_MODE,
  } = deps;

  function setRightPanelMode(mode) {
    const pane = document.getElementById('stationSection');
    if (!pane) return;
    pane.dataset.panelMode = mode;

    const buttons = {
      station: document.getElementById('panelModeStation'),
      control: document.getElementById('panelModeControl'),
      flow: document.getElementById('panelModeFlow'),
      chat: document.getElementById('panelModeChat'),
      planning: document.getElementById('panelModePlanning'),
    };

    for (const [btnMode, btn] of Object.entries(buttons)) {
      if (btn) btn.classList.toggle('active', mode === btnMode);
    }

    if (currentTab) {
      localStorage.setItem(`spacecode.panelMode.${currentTab()}`, mode);
    }
    localStorage.setItem('spacecode.panelMode', mode);
    updatePanelToggleButtons();
  }

  function updatePanelToggleButtons() {
    // In V3 layout, station-scoped buttons show when Station tab is active,
    // chat-scoped buttons are always hidden (chat is persistent left pane)
    document.querySelectorAll('.panel-toggle button[data-tab-scope]').forEach(btn => {
      const scope = btn.getAttribute('data-tab-scope');
      if (scope === 'station') {
        btn.style.display = (currentTab() === TABS.STATION) ? '' : 'none';
      } else if (scope === 'chat') {
        // Chat panel modes (flow/planning/+chat) only show when station is active
        btn.style.display = (currentTab() === TABS.STATION) ? '' : 'none';
      }
    });
  }

  function restoreRightPanelModeForTab(tab) {
    const saved = localStorage.getItem(`spacecode.panelMode.${tab}`);
    const allowed = TAB_PANEL_MODES[tab];
    if (saved && allowed && allowed.includes(saved)) {
      setRightPanelMode(saved);
    } else {
      setRightPanelMode(TAB_DEFAULT_MODE[tab] || 'station');
    }
  }

  function toggleContextFlowPanel() {
    const stationSection = document.getElementById('stationSection');
    if (!stationSection) return;

    const isHidden = !stationSection.classList.contains('active');
    if (isHidden) {
      stationSection.classList.add('active');
      stationSection.dataset.panelMode = 'flow';
    } else {
      stationSection.classList.remove('active');
    }
  }

  function toggleSwarmSidebar() {
    // No-op: Swarm sidebar replaced by Planning panel in Phase 3
  }

  function toggleContextFlowDrawer() {
    toggleContextFlowPanel();
  }

  return {
    setRightPanelMode,
    updatePanelToggleButtons,
    restoreRightPanelModeForTab,
    toggleContextFlowPanel,
    toggleSwarmSidebar,
    toggleContextFlowDrawer,
  };
}
