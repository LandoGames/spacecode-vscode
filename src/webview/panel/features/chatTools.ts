// @ts-nocheck

export function createChatToolsHandlers(deps) {
  const {
    vscode,
    setRightPanelMode,
    getCurrentChatMode,
    chatModes,
  } = deps;

  let chatSplitActive = false;

  function appendSystemMessage(text) {
    const container = document.getElementById('chatMessages');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'message system';
    div.innerHTML = '<div class="message-content">' + text + '</div>';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function getGptOpinion() {
    const messages = document.querySelectorAll('#chatMessages .message.claude, #chatMessages .message.assistant');
    const lastClaudeMessage = messages[messages.length - 1];

    if (!lastClaudeMessage) {
      appendSystemMessage('No Claude response to review. Send a message first.');
      return;
    }

    const claudeResponse = lastClaudeMessage.querySelector('.message-content')?.textContent || '';

    const userMessages = document.querySelectorAll('#chatMessages .message.user');
    const lastUserMessage = userMessages[userMessages.length - 1];
    const userQuestion = lastUserMessage?.querySelector('.message-content')?.textContent || '';

    const allMessages = Array.from(document.querySelectorAll('#chatMessages .message'));
    const lastClaudeIndex = allMessages.indexOf(lastClaudeMessage);
    const historySlice = lastClaudeIndex >= 0 ? allMessages.slice(0, lastClaudeIndex + 1) : allMessages;
    const rawHistory = historySlice.map((el) => {
      const content = el.querySelector('.message-content')?.textContent || '';
      let role = 'assistant';
      if (el.classList.contains('user')) role = 'user';
      else if (el.classList.contains('claude')) role = 'claude';
      else if (el.classList.contains('gpt')) role = 'gpt';
      else if (el.classList.contains('summary')) role = 'summary';
      else if (el.classList.contains('system')) role = 'system';
      return { role, content };
    }).filter((m) => m.content && m.content.trim().length);

    const maxTotalChars = 8000;
    const maxEntryChars = 1200;
    let total = 0;
    const prunedHistory = [];
    for (let i = rawHistory.length - 1; i >= 0; i -= 1) {
      const entry = rawHistory[i];
      let content = entry.content.trim();
      if (content.length > maxEntryChars) {
        content = content.slice(0, maxEntryChars) + '...';
      }
      if (total + content.length > maxTotalChars && total > 0) break;
      total += content.length;
      prunedHistory.push({ role: entry.role, content });
    }
    prunedHistory.reverse();

    appendSystemMessage('Requesting GPT second opinion...');

    vscode.postMessage({
      type: 'getGptOpinion',
      userQuestion,
      claudeResponse,
      chatHistory: prunedHistory,
    });
  }

  function toggleChatSplit() {
    chatSplitActive = !chatSplitActive;
    if (chatSplitActive) {
      setRightPanelMode('chat');
      syncChatSplitMirror();
    } else {
      setRightPanelMode('flow');
    }
  }

  function syncChatSplitMirror() {
    const source = document.getElementById('chatMessages');
    const mirror = document.getElementById('chatSplitMirror');
    if (!source || !mirror) return;
    mirror.innerHTML = source.innerHTML;
    mirror.scrollTop = mirror.scrollHeight;
  }

  function showGptOpinionButton() {
    const btn = document.getElementById('gptOpinionBtn');
    if (btn && getCurrentChatMode() === chatModes.SOLO) {
      btn.style.display = 'inline-flex';
    }
  }

  function hideGptOpinionButton() {
    const btn = document.getElementById('gptOpinionBtn');
    if (btn) {
      btn.style.display = 'none';
    }
  }

  return {
    getGptOpinion,
    toggleChatSplit,
    syncChatSplitMirror,
    showGptOpinionButton,
    hideGptOpinionButton,
    getChatSplitActive: () => chatSplitActive,
  };
}
