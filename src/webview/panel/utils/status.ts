// @ts-nocheck

export function shipSetStatus(text) {
  const el = document.getElementById('shipStatusText');
  if (el) el.textContent = text;
}
