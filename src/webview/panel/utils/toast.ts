// @ts-nocheck

export function showToast(message, kind) {
  const container = document.getElementById('sc-toast-container');
  if (!container || !message) return;
  const toast = document.createElement('div');
  toast.className = 'sc-toast ' + (kind || '');
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}
