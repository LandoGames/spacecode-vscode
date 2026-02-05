// @ts-nocheck

export function createContextPreviewHandlers(deps) {
  const { shipSetStatus } = deps;
  let currentContextPreview = '';

  function setContextPreview(text) {
    currentContextPreview = text || '';
    const box = document.getElementById('contextPreviewBox');
    if (box) box.textContent = currentContextPreview || '(no context)';
  }

  function copyContextPreview() {
    const text = currentContextPreview || '';
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
      shipSetStatus('Context copied.');
    } else {
      shipSetStatus('Clipboard not available.');
    }
  }

  return {
    setContextPreview,
    copyContextPreview,
  };
}
