// @ts-nocheck

export function createChatInputHandlers(deps) {
  const {
    vscode,
    addMessage,
    getMessageHistory,
    addToMessageHistory,
    getClaudeSessionId,
    getShipSelectedSectorId,
    shipSetStatus,
    getCurrentChatId,
    getChatSessions,
    getCurrentChatMode,
    getSelectedModel,
    getGptConsultEnabled,
    getGptInterventionLevel,
    getAttachedImages,
    setAttachedImages,
    setGenerating,
    updateSendStopButton,
    stopConversation,
    getCurrentPersona,
  } = deps;

  function getImages() {
    return getAttachedImages() || [];
  }

  function setImages(next) {
    setAttachedImages(next);
  }

  function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    const chatId = getCurrentChatId();
    const chatSessions = getChatSessions();
    if (!text) return;

    // Phase 0.9: Intercept built-in navigation slash commands
    if (text.startsWith('/') && typeof window.tryNavigationCommand === 'function') {
      if (window.tryNavigationCommand(text)) {
        input.value = '';
        autoResize(input);
        return;
      }
    }

    // If AI is currently generating, this is an interrupt-and-send:
    // stop current generation first, then send the new message
    if (chatSessions[chatId]?.isGenerating) {
      stopConversation();
      // Small delay to let the stop propagate before sending new message
      setTimeout(() => { sendMessageInternal(input, text, chatId); }, 100);
      return;
    }

    sendMessageInternal(input, text, chatId);
  }

  function sendMessageInternal(input, text, chatId) {

    const includeSelection = document.getElementById('includeSelection')?.checked || false;
    const injectContext = document.getElementById('injectContextToggle')?.checked ?? true;
    const docSelect = document.getElementById('docTargetSelect');
    const docTargetValue = docSelect ? docSelect.value : '';
    const profileSelect = document.getElementById('shipProfileSelect');
    const profileValue = profileSelect ? profileSelect.value : 'yard';
    if (profileValue !== 'yard' && !docTargetValue) {
      shipSetStatus('Select a docs file before sending when not in Yard mode.');
      return;
    }

    const images = getImages();
    const displayText = images.length > 0
      ? text + ' [' + images.length + ' image(s) attached]'
      : text;
    addMessage('user', displayText);
    const emptyState = document.getElementById('emptyState');
    if (emptyState) emptyState.style.display = 'none';

    const historyToSend = getMessageHistory();

    console.log('[MC DEBUG] Sending message, history length:', historyToSend.length);
    console.log('[MC DEBUG] History:', JSON.stringify(historyToSend, null, 2));

    addToMessageHistory('user', text);

    const provider = getSelectedModel()?.provider || 'claude';

    vscode.postMessage({
      type: 'sendMessage',
      text,
      mode: provider,
      chatMode: getCurrentChatMode(),
      includeSelection,
      injectContext,
      docTarget: docTargetValue,
      profile: profileValue,
      sectorId: getShipSelectedSectorId(),
      images: images.slice(),
      history: historyToSend,
      claudeSessionId: getClaudeSessionId(),
      chatId,
      gptConsult: getGptConsultEnabled(),
      gptInterventionLevel: getGptInterventionLevel(),
      persona: getCurrentPersona(),
    });

    input.value = '';
    autoResize(input);
    clearAttachedImages();
    setGenerating(true);
  }

  function toggleDropZone() {
    const dropZone = document.getElementById('dropZone');
    dropZone.classList.toggle('visible');
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('dropZone').classList.add('drag-over');
  }

  function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('dropZone').classList.remove('drag-over');
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('dropZone').classList.remove('drag-over');

    const files = e.dataTransfer.files;
    handleImageFiles(files);
  }

  function handlePaste(e) {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = items[i].getAsFile();
        handleImageFiles([file]);
        break;
      }
    }
  }

  function handleImageFiles(files) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = function(e) {
          const base64 = e.target.result;
          const images = getImages();
          images.push(base64);
          setImages(images);
          renderAttachedImages();
        };
        reader.readAsDataURL(file);
      }
    }
  }

  function renderAttachedImages() {
    const container = document.getElementById('attachedImages');
    const images = getImages();
    container.innerHTML = images.map((img, index) => `
        <div class="attached-image">
          <img src="${img}" alt="Attached">
          <button class="remove-image" onclick="removeImage(${index})">×</button>
        </div>
      `).join('');

    if (images.length > 0) {
      document.getElementById('dropZone').classList.remove('visible');
    }
  }

  function removeImage(index) {
    const images = getImages();
    images.splice(index, 1);
    setImages(images);
    renderAttachedImages();
  }

  function clearAttachedImages() {
    setImages([]);
    renderAttachedImages();
  }

  function showCompactionNotice(summary, originalCount, keptCount) {
    const chatMessages = document.getElementById('chatMessages');
    const notice = document.createElement('div');
    notice.className = 'compaction-notice';
    notice.innerHTML = `
        <div class="compaction-header">
          <span class="compaction-icon">📋</span>
          <strong>Conversation Compacted</strong>
        </div>
        <div class="compaction-details">
          <p>This session is being continued from a previous conversation that ran out of context.
          The summary below covers the earlier portion of the conversation.</p>
          <details>
            <summary>View Summary (${originalCount} messages summarized)</summary>
            <div class="compaction-summary">${summary}</div>
          </details>
        </div>
      `;
    chatMessages.insertBefore(notice, chatMessages.firstChild);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
    // Re-evaluate send/stop button when input content changes
    updateSendStopButton();
  }

  return {
    sendMessage,
    toggleDropZone,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handlePaste,
    handleImageFiles,
    renderAttachedImages,
    removeImage,
    clearAttachedImages,
    showCompactionNotice,
    handleKeyDown,
    autoResize,
  };
}
