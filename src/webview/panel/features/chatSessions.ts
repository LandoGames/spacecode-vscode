// @ts-nocheck

import { generateChatId, generateUUID } from '../utils/ids';

const MAX_CHAT_TABS = 5;

export function createChatSessionManager(deps) {
  const {
    vscode,
    getCurrentMode,
    setCurrentMode,
    getChatSessions,
    setChatSessions,
    getCurrentChatId,
    setCurrentChatId,
    getChatCounter,
    setChatCounter,
    clearAiFlow,
    clearContextSources,
    hideLiveResponse,
    updateTokenBar,
    getSelectedModel,
  } = deps;

  const initialChatId = generateChatId();
  let chatSessions = {
    [initialChatId]: {
      id: initialChatId,
      mode: 'chat',
      name: 'Chat',
      provider: 'claude', // 'claude' | 'gpt'
      messagesHtml: '',
      messageHistory: [],
      claudeSessionId: generateUUID(),
      isGenerating: false,
      tokensUsed: 0,
    },
  };
  let currentChatId = initialChatId;
  let chatCounter = 1;

  function syncState() {
    setChatSessions(chatSessions);
    setCurrentChatId(currentChatId);
    setChatCounter(chatCounter);
  }

  function getClaudeSessionId() {
    return chatSessions[currentChatId]?.claudeSessionId || '';
  }

  function newChat() {
    if (Object.keys(chatSessions).length >= MAX_CHAT_TABS) {
      showMaxTabsModal();
      return;
    }

    const id = generateChatId();
    const mode = getCurrentMode();
    const modeName = mode.charAt(0).toUpperCase() + mode.slice(1);
    // Use the currently selected model's provider for the new chat tab
    const selectedProvider = getSelectedModel?.()?.provider || 'claude';

    chatSessions[id] = {
      id,
      mode,
      name: modeName,
      provider: selectedProvider,
      messagesHtml: '',
      messageHistory: [],
      claudeSessionId: generateUUID(),
      isGenerating: false,
      tokensUsed: 0,
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

  function switchChat(chatId) {
    console.log('SWITCH chat:', { from: currentChatId, to: chatId });

    const currentMessagesHtml = document.getElementById('chatMessages').innerHTML;
    if (chatSessions[currentChatId]) {
      chatSessions[currentChatId].messagesHtml = currentMessagesHtml;
    }

    currentChatId = chatId;
    const session = chatSessions[chatId];
    if (session) {
      setCurrentMode(session.mode);
      document.querySelectorAll('.mode-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === session.mode);
      });
      const container = document.getElementById('chatMessages');
      container.innerHTML = session.messagesHtml || getEmptyStateHtml();
      container.scrollTop = container.scrollHeight;

      const generating = session.isGenerating || false;
      document.getElementById('sendBtn').disabled = generating;
      document.getElementById('sendBtn').style.display = generating ? 'none' : 'block';
      document.getElementById('stopBtn').style.display = generating ? 'block' : 'none';
      document.getElementById('statusDot').classList.toggle('thinking', generating);
      document.getElementById('statusText').textContent = generating ? 'Generating...' : 'Ready';

      updateTokenBar(currentChatId);
    }
    renderChatTabs();
    updateTokenBar(currentChatId);
    syncState();
    saveChatState();  // Persist active tab selection
  }

  function addToMessageHistory(role, content, chatId = currentChatId) {
    console.log('[MC DEBUG] addToMessageHistory:', role, 'chatId:', chatId, 'content:', (content || '').substring(0, 50));
    if (chatSessions[chatId]) {
      chatSessions[chatId].messageHistory.push({ role, content });
      console.log('[MC DEBUG] History now has', chatSessions[chatId].messageHistory.length, 'messages');
      updateTokenBar(chatId);
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
      return;
    }
    delete chatSessions[chatId];
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
    const tabs = Object.values(chatSessions).map(session => {
      const provider = session.provider || 'claude';
      return `
        <div class="chat-tab ${session.id === currentChatId ? 'active' : ''} provider-${provider} ${session.isGenerating ? 'generating' : ''}"
             data-chat-id="${session.id}"
             onclick="switchChat('${session.id}')">
          <div class="chat-tab-dot provider-${provider}">${session.isGenerating ? '<span class="tab-spinner"></span>' : ''}</div>
          <span>${session.id.slice(-4)}</span>
          <span class="chat-tab-close" onclick="event.stopPropagation(); closeChat('${session.id}')">×</span>
        </div>
      `;
    }).join('');
    container.innerHTML = tabs + '<button class="chat-tab-new" onclick="newChat()">+</button>';
  }

  function saveChatState() {
    const currentMessagesHtml = document.getElementById('chatMessages').innerHTML;
    if (chatSessions[currentChatId]) {
      chatSessions[currentChatId].messagesHtml = currentMessagesHtml;
    }

    const state = {
      tabs: Object.values(chatSessions).map(session => ({
        id: session.id,
        name: session.name,
        mode: session.mode,
        provider: session.provider || 'claude',
        claudeSessionId: session.claudeSessionId,
        messagesHtml: session.messagesHtml,
        messageHistory: session.messageHistory,
      })),
      activeTabId: currentChatId,
      chatCounter: chatCounter,
    };
    console.log('[ChatSessions] Saving state, activeTabId:', currentChatId);
    vscode.postMessage({ type: 'saveChatState', state });
  }

  function restoreChatState(state) {
    if (!state || !state.tabs || state.tabs.length === 0) return;

    console.log('[ChatSessions] Restoring state, activeTabId:', state.activeTabId);
    chatSessions = {};

    state.tabs.forEach(tab => {
      const chatId = (tab.id && tab.id.startsWith('chat-')) ? tab.id : generateChatId();
      console.log('[ChatSessions] Restoring tab:', chatId, 'original:', tab.id);

      chatSessions[chatId] = {
        id: chatId,
        name: tab.name,
        mode: tab.mode,
        provider: tab.provider || 'claude',
        claudeSessionId: generateUUID(),
        messagesHtml: tab.messagesHtml || '',
        messageHistory: tab.messageHistory || [],
        isGenerating: false,
      };
    });

    if (state.chatCounter) {
      chatCounter = state.chatCounter;
    } else {
      chatCounter = Object.keys(chatSessions).length;
    }

    const tabIds = Object.keys(chatSessions);
    console.log('[ChatSessions] Tab IDs:', tabIds, 'looking for:', state.activeTabId);
    currentChatId = tabIds.find(id => id === state.activeTabId) || tabIds[0];
    console.log('[ChatSessions] Selected:', currentChatId);

    const session = chatSessions[currentChatId];
    if (session) {
      setCurrentMode(session.mode);
      document.querySelectorAll('.mode-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === session.mode);
      });
      const container = document.getElementById('chatMessages');
      container.innerHTML = session.messagesHtml || getEmptyStateHtml();
      // Scroll to bottom to show latest messages
      container.scrollTop = container.scrollHeight;
    }

    renderChatTabs();
    syncState();
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

  function showMaxTabsModal() {
    document.getElementById('maxTabsModal').classList.add('visible');
  }

  function closeMaxTabsModal() {
    document.getElementById('maxTabsModal').classList.remove('visible');
  }

  function syncFromIndexState() {
    chatSessions = getChatSessions();
    currentChatId = getCurrentChatId();
    chatCounter = getChatCounter();
  }

  syncState();

  function setCurrentChatProvider(provider) {
    if (chatSessions[currentChatId]) {
      chatSessions[currentChatId].provider = provider;
      renderChatTabs();
    }
  }

  function getCurrentChatProvider() {
    return chatSessions[currentChatId]?.provider || 'claude';
  }

  return {
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
    syncFromIndexState,
    setCurrentChatProvider,
    getCurrentChatProvider,
  };
}
