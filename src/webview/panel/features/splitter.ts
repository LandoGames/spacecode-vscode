// @ts-nocheck

export function initChatSplitter() {
  const splitter = document.getElementById('chatSplitter');
  const container = document.querySelector('.main-split');
  const chatPane = document.getElementById('chatPane');
  if (!splitter || !container || !chatPane) return;

  const STORAGE_KEY = 'spacecode.chatPaneWidthPct';
  const MIN_PCT = 20;
  const MAX_PCT = 50;
  const MIN_CHAT_PX = 250;
  const MIN_CONTENT_PX = 300;

  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && !Number.isNaN(parseFloat(saved))) {
    const pct = Math.max(MIN_PCT, Math.min(MAX_PCT, parseFloat(saved)));
    chatPane.style.flex = `0 0 ${pct}%`;
  }

  let dragging = false;

  splitter.addEventListener('mousedown', (e) => {
    dragging = true;
    document.body.classList.add('resizing');
    splitter.classList.add('dragging');
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = (x / rect.width) * 100;

    // Enforce minimum pixel widths
    const chatPx = (pct / 100) * rect.width;
    const contentPx = rect.width - chatPx - 4; // 4px splitter

    if (chatPx < MIN_CHAT_PX || contentPx < MIN_CONTENT_PX) {
      // If dragging too far left, auto-collapse chat
      if (chatPx < MIN_CHAT_PX && typeof window.toggleChatCollapse === 'function') {
        if (!chatPane.classList.contains('collapsed')) {
          window.toggleChatCollapse();
          dragging = false;
          document.body.classList.remove('resizing');
          splitter.classList.remove('dragging');
        }
      }
      return;
    }

    const clamped = Math.max(MIN_PCT, Math.min(MAX_PCT, pct));
    chatPane.style.flex = `0 0 ${clamped}%`;
  });

  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('resizing');
    splitter.classList.remove('dragging');
    const containerWidth = container.getBoundingClientRect().width;
    const chatWidth = chatPane.getBoundingClientRect().width;
    if (containerWidth > 0) {
      const pct = ((chatWidth / containerWidth) * 100).toFixed(1);
      localStorage.setItem(STORAGE_KEY, pct);
    }
  });
}

// Legacy export name for backward compat
export const initMainSplitter = initChatSplitter;
