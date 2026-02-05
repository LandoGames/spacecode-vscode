// @ts-nocheck

export function createSideChatHandlers(deps) {
  const { vscode, escapeHtml } = deps;

  function formatMessageContent(content) {
    return escapeHtml(String(content || '')).replace(/\n/g, '<br>');
  }

  let activeSideChatIndex = 0;
  const sideChats = [
    { messages: [], id: 'sideChat1' },
    { messages: [], id: 'sideChat2' }
  ];

  function switchSideChat(index) {
    activeSideChatIndex = index;
    const tabs = document.querySelectorAll('.side-chat-tab');
    tabs.forEach((tab, i) => {
      tab.classList.toggle('active', i === index);
    });
    renderSideChatMessages();
  }

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

  function sendSideChat() {
    const input = document.getElementById('sideChatInput');
    if (!input || !input.value.trim()) return;

    const message = input.value.trim();
    input.value = '';

    sideChats[activeSideChatIndex].messages.push({
      role: 'user',
      content: message
    });
    renderSideChatMessages();

    vscode.postMessage({
      type: 'sideChatMessage',
      chatIndex: activeSideChatIndex,
      message: message
    });
  }

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

  return {
    switchSideChat,
    renderSideChatMessages,
    sendSideChat,
    handleSideChatResponse,
  };
}
