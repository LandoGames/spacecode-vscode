// @ts-nocheck

export function createDiagnosticsHandlers(deps) {
  const { vscode, escapeHtml, showToast } = deps;

  function onDiagnosticsTabOpen() {
    vscode.postMessage({ type: 'diagnosticsGetLast' });
  }

  function runDiagnosticsScan(mode) {
    const btn = document.getElementById('diagScanBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Scanning...'; }
    vscode.postMessage({ type: 'diagnosticsScan', mode: mode || 'quick' });
  }

  function renderDiagnosticsResult(result, error) {
    const btn = document.getElementById('diagScanBtn');
    if (btn) { btn.disabled = false; btn.textContent = 'Scan'; }

    const container = document.getElementById('diagResultsContainer');
    if (!container) return;

    if (error) {
      container.innerHTML = `<div style="color:var(--error-color);padding:8px;font-size:11px;">${escapeHtml(error)}</div>`;
      return;
    }

    if (!result) {
      container.innerHTML = '<div style="color:var(--text-secondary);padding:8px;font-size:11px;">No scan results yet. Click "Scan" to run diagnostics.</div>';
      return;
    }

    const { summary, checks, duration } = result;

    // Summary bar
    let html = `
      <div style="display:flex;gap:8px;align-items:center;padding:6px 0;margin-bottom:6px;border-bottom:1px solid var(--border-color);">
        <span style="font-size:12px;font-weight:600;color:${summary.failed > 0 ? 'var(--error-color)' : summary.warned > 0 ? '#f59e0b' : 'var(--success-color)'};">
          ${summary.failed > 0 ? 'FAIL' : summary.warned > 0 ? 'WARN' : 'PASS'}
        </span>
        <span style="font-size:10px;color:var(--text-secondary);">
          ${summary.errors} errors, ${summary.warnings} warnings
        </span>
        <span style="font-size:10px;color:var(--text-secondary);margin-left:auto;">
          ${duration}ms
        </span>
      </div>
    `;

    // Checks
    for (const check of checks) {
      const statusColor = check.status === 'pass' ? 'var(--success-color)' : check.status === 'fail' ? 'var(--error-color)' : check.status === 'warn' ? '#f59e0b' : 'var(--text-secondary)';
      const statusIcon = check.status === 'pass' ? '&#10003;' : check.status === 'fail' ? '&#10007;' : check.status === 'warn' ? '&#9888;' : '&#8212;';

      html += `
        <div style="margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
            <span style="color:${statusColor};font-size:12px;">${statusIcon}</span>
            <span style="font-size:11px;font-weight:600;">${escapeHtml(check.name)}</span>
            <span style="font-size:10px;color:var(--text-secondary);">${check.items.length} items, ${check.duration}ms</span>
          </div>
      `;

      // Items (show first 20)
      const items = check.items.slice(0, 20);
      for (const item of items) {
        const sevColor = item.severity === 'error' ? 'var(--error-color)' : item.severity === 'warning' ? '#f59e0b' : 'var(--text-secondary)';
        const sevLabel = item.severity === 'error' ? 'ERR' : item.severity === 'warning' ? 'WRN' : 'INF';
        html += `
          <div style="display:flex;align-items:flex-start;gap:6px;padding:3px 0 3px 18px;font-size:10px;cursor:pointer;border-radius:3px;" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background=''" onclick="diagnosticsOpenFile('${escapeHtml(item.file)}', ${item.line})">
            <span style="color:${sevColor};font-weight:600;min-width:24px;">${sevLabel}</span>
            <span style="color:var(--text-secondary);min-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(item.file.split('/').pop() || item.file)}:${item.line}</span>
            <span style="flex:1;color:var(--text-primary);">${escapeHtml(item.message)}</span>
          </div>
        `;
      }

      if (check.items.length > 20) {
        html += `<div style="padding:3px 0 3px 18px;font-size:10px;color:var(--text-secondary);">... and ${check.items.length - 20} more</div>`;
      }

      html += '</div>';
    }

    container.innerHTML = html;
  }

  function renderDiagnosticsProgress(stage, progress) {
    const container = document.getElementById('diagResultsContainer');
    if (!container) return;
    container.innerHTML = `<div style="padding:8px;font-size:11px;color:var(--text-secondary);">${escapeHtml(stage)}</div>`;
  }

  function diagnosticsOpenFile(file, line) {
    vscode.postMessage({ type: 'diagnosticsOpenFile', file, line });
  }

  return {
    onDiagnosticsTabOpen,
    runDiagnosticsScan,
    renderDiagnosticsResult,
    renderDiagnosticsProgress,
    diagnosticsOpenFile,
  };
}
