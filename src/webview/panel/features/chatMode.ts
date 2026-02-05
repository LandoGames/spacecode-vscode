// @ts-nocheck

export function createChatModeHandlers(deps) {
  const {
    vscode,
    uiState,
    TABS,
    CHAT_MODES,
    getCurrentTab,
    getCurrentChatMode,
    setCurrentChatMode,
    restoreRightPanelModeForTab,
    setRightPanelMode,
  } = deps;

  function updateChatModeSwitcherVisibility() {
    // Quick-access icon bar removed in V3 redesign — no-op
  }

  function updateMastermindConfigVisibility() {
    updateChatModeSwitcherVisibility();
  }

  function switchChatMode(modeName) {
    console.log('[SpaceCode UI] switchChatMode called with:', modeName);

    document.querySelectorAll('.chat-mode-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`.chat-mode-btn[data-chat-mode="${modeName}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    document.querySelectorAll('.input-mode-btn').forEach(b => b.classList.remove('active'));
    const activeInputBtn = document.querySelector(`.input-mode-btn[data-chat-mode="${modeName}"]`);
    if (activeInputBtn) activeInputBtn.classList.add('active');

    setCurrentChatMode(modeName);
    uiState.chatMode = modeName;

    const chatContainer = document.getElementById('chatContainer');
    const contextFlowPanel = document.getElementById('contextFlowPanel');
    const chatModeToggles = document.getElementById('chatModeToggles');

    if (chatContainer) chatContainer.classList.remove('planning-mode');

    switch (modeName) {
      case CHAT_MODES.SOLO:
        // In V3, solo mode: restore station panel to its default mode
        if (getCurrentTab() === TABS.STATION) {
          restoreRightPanelModeForTab(TABS.STATION);
        }
        if (contextFlowPanel) contextFlowPanel.style.display = 'none';
        if (chatModeToggles) chatModeToggles.style.display = 'none';
        break;

      case CHAT_MODES.PLANNING:
        if (chatContainer) chatContainer.classList.add('planning-mode');
        // In V3, planning mode: show planning panel in station section
        if (getCurrentTab() === TABS.STATION) {
          setRightPanelMode('planning');
        }
        if (contextFlowPanel) contextFlowPanel.style.display = 'none';
        if (chatModeToggles) chatModeToggles.style.display = 'none';
        break;
    }

    vscode.postMessage({ type: 'setChatMode', chatMode: modeName });
  }

  return {
    updateChatModeSwitcherVisibility,
    updateMastermindConfigVisibility,
    switchChatMode,
  };
}
