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
    const switcher = document.getElementById('chatModeSwitcher');
    if (switcher) {
      switcher.style.display = (getCurrentTab() === TABS.CHAT) ? 'block' : 'none';
    }
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
    const primaryPanel = document.getElementById('chatPanelPrimary');
    const rightPane = document.getElementById('rightPane');
    const splitter = document.getElementById('mainSplitter');
    const contextFlowPanel = document.getElementById('contextFlowPanel');
    const chatModeToggles = document.getElementById('chatModeToggles');

    if (chatContainer) chatContainer.classList.remove('planning-mode');

    switch (modeName) {
      case CHAT_MODES.SOLO:
        if (primaryPanel) primaryPanel.style.flex = '1';
        if (rightPane) {
          rightPane.style.display = 'flex';
          rightPane.style.flex = '1 1 50%';
        }
        restoreRightPanelModeForTab(TABS.CHAT);
        if (splitter) splitter.style.display = 'none';
        if (contextFlowPanel) contextFlowPanel.style.display = 'none';
        if (chatModeToggles) chatModeToggles.style.display = 'none';
        break;

      case CHAT_MODES.PLANNING:
        if (chatContainer) chatContainer.classList.add('planning-mode');
        if (primaryPanel) primaryPanel.style.flex = '1';
        if (rightPane) {
          rightPane.style.display = 'flex';
          rightPane.style.flex = '1 1 50%';
        }
        setRightPanelMode('planning');
        if (splitter) splitter.style.display = 'none';
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
