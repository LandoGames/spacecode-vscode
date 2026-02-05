// @ts-nocheck

export function initMainSplitter() {
  const splitter = document.getElementById('mainSplitter');
  const mainSplit = document.querySelector('.main-split');
  const rightPane = document.querySelector('.right-pane');
  if (!splitter || !mainSplit || !rightPane) return;

  const STORAGE_KEY = 'spacecode.stationPaneWidthPx';
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && !Number.isNaN(parseInt(saved, 10))) {
    rightPane.style.flex = '0 0 ' + parseInt(saved, 10) + 'px';
  }

  let dragging = false;

  splitter.addEventListener('mousedown', (e) => {
    dragging = true;
    document.body.classList.add('resizing');
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const rect = mainSplit.getBoundingClientRect();
    const width = rect.right - e.clientX;
    const clamped = Math.max(320, Math.min(900, width));
    rightPane.style.flex = '0 0 ' + clamped + 'px';
  });

  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('resizing');
    const current = parseInt(getComputedStyle(rightPane).width || '420', 10);
    if (!Number.isNaN(current)) localStorage.setItem(STORAGE_KEY, String(current));
  });
}
