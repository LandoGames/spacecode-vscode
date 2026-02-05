// @ts-nocheck

export function createChatRendererHandlers(deps) {
  const {
    vscode,
    escapeHtml,
    marked,
    renderChatTabs,
    getChatSessions,
    getCurrentChatId,
  } = deps;

  // Streaming message state per chat
  const streamingMessages = {};

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
          ${meta.tokens && (meta.tokens.input + meta.tokens.output) > 0 ? `
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
      if (marked) {
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

  // Grace period: after sending, keep Stop visible for this duration
  // even if the user starts typing (so they can still cancel)
  const SEND_GRACE_MS = 10000;
  let graceTimer = null;
  let inGracePeriod = false;

  function setGenerating(generating, chatId = getCurrentChatId()) {
    const chatSessions = getChatSessions();
    // Update per-chat generating state
    if (chatSessions[chatId]) {
      chatSessions[chatId].isGenerating = generating;
    }

    if (generating && chatId === getCurrentChatId()) {
      // Start grace period — user just sent, keep Stop visible
      inGracePeriod = true;
      if (graceTimer) clearTimeout(graceTimer);
      graceTimer = setTimeout(() => {
        inGracePeriod = false;
        graceTimer = null;
        // Re-evaluate button state now that grace is over
        updateSendStopButton();
      }, SEND_GRACE_MS);
    }

    if (!generating) {
      // Generation done — clear grace period
      inGracePeriod = false;
      if (graceTimer) { clearTimeout(graceTimer); graceTimer = null; }
    }

    // Only update UI if this is the currently visible chat
    if (chatId === getCurrentChatId()) {
      document.getElementById('statusDot').classList.toggle('thinking', generating);
      document.getElementById('statusText').textContent = generating ? 'Generating...' : 'Ready';
      updateSendStopButton();
    }

    // Update tab to show generating indicator
    renderChatTabs();
  }

  /**
   * Dynamic Send/Stop button:
   * - Not generating → show Send (enabled if input has text)
   * - Generating + input empty OR in grace period → show Stop
   * - Generating + input has text + grace over → show Send (acts as interrupt-and-send)
   */
  function updateSendStopButton() {
    const sendBtn = document.getElementById('sendBtn');
    const stopBtn = document.getElementById('stopBtn');
    if (!sendBtn || !stopBtn) return;

    const chatId = getCurrentChatId();
    const chatSessions = getChatSessions();
    const isGenerating = chatSessions[chatId]?.isGenerating || false;
    const input = document.getElementById('messageInput');
    const hasText = input && input.value.trim().length > 0;

    if (!isGenerating) {
      // Idle — show Send, hide Stop
      sendBtn.style.display = 'block';
      sendBtn.disabled = !hasText;
      sendBtn.textContent = 'Send';
      stopBtn.style.display = 'none';
    } else if (inGracePeriod || !hasText) {
      // Generating + (grace period OR no text) — show Stop
      sendBtn.style.display = 'none';
      stopBtn.style.display = 'block';
    } else {
      // Generating + has text + grace over — show Send (interrupt mode)
      sendBtn.style.display = 'block';
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send ⏎';
      stopBtn.style.display = 'none';
    }
  }

  function stopConversation() {
    const currentChatId = getCurrentChatId();
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
    const input = document.getElementById('messageInput');
    if (!input) return;
    input.value = text + ' ';
    input.focus();
  }

  return {
    createMessageHtml,
    addMessage,
    appendToStreamingMessage,
    finalizeStreamingMessage,
    setGenerating,
    updateSendStopButton,
    stopConversation,
    clearChat,
    insertPrompt,
  };
}
