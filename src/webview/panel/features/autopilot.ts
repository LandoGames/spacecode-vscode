// @ts-nocheck

export function createAutopilotHandlers(deps) {
  const { vscode } = deps;

  let _currentStatus = null;

  /** Render autopilot control bar */
  function autopilotRenderStatus(data) {
    _currentStatus = data;

    const bar = document.getElementById('autopilotControlBar');
    const statusText = document.getElementById('autopilotStatusText');
    const stepCounter = document.getElementById('autopilotStepCounter');
    const agentLabel = document.getElementById('autopilotAgentLabel');
    const pauseBtn = document.getElementById('autopilotPauseBtn');
    const resumeBtn = document.getElementById('autopilotResumeBtn');
    const abortBtn = document.getElementById('autopilotAbortBtn');
    const progressBar = document.getElementById('autopilotProgressFill');
    const errorText = document.getElementById('autopilotErrorText');

    if (!bar) return;

    // Show/hide bar based on status
    const isActive = data.status !== 'idle';
    bar.style.display = isActive ? 'flex' : 'none';

    // Status text
    const statusLabels = {
      idle: 'Idle',
      running: 'Running',
      pausing: 'Pausing...',
      paused: 'Paused',
      stopping: 'Stopping...',
      completed: 'Completed',
      failed: 'Failed',
    };
    if (statusText) {
      statusText.textContent = statusLabels[data.status] || data.status;
      statusText.className = 'autopilot-status-label ' + (data.status || 'idle');
    }

    // Step counter
    if (stepCounter) {
      const total = data.totalSteps || 0;
      const done = (data.completedSteps || 0) + (data.failedSteps || 0) + (data.skippedSteps || 0);
      stepCounter.textContent = `${done}/${total} steps`;
    }

    // Agent label
    if (agentLabel) {
      const agentNames = {
        'claude-cli': 'Claude CLI',
        'claude-api': 'Claude API',
        'gpt-api': 'GPT',
      };
      const name = agentNames[data.activeAgent] || data.activeAgent;
      agentLabel.textContent = data.usingFallback ? `${name} (fallback)` : name;
      agentLabel.style.color = data.usingFallback ? '#f59e0b' : 'var(--text-secondary)';
    }

    // Buttons
    if (pauseBtn) pauseBtn.style.display = data.status === 'running' ? 'inline-block' : 'none';
    if (resumeBtn) resumeBtn.style.display = data.status === 'paused' ? 'inline-block' : 'none';
    if (abortBtn) abortBtn.style.display = (data.status === 'running' || data.status === 'paused') ? 'inline-block' : 'none';

    // Progress bar
    if (progressBar && data.totalSteps > 0) {
      const pct = ((data.completedSteps + data.failedSteps + data.skippedSteps) / data.totalSteps) * 100;
      progressBar.style.width = `${pct}%`;
      progressBar.className = 'autopilot-progress-fill ' + (data.failedSteps > 0 ? 'has-errors' : '');
    }

    // Error text
    if (errorText) {
      if (data.error) {
        errorText.textContent = data.error;
        errorText.style.display = 'block';
      } else {
        errorText.style.display = 'none';
      }
    }
  }

  /** Render step result */
  function autopilotRenderStepResult(result) {
    const list = document.getElementById('autopilotStepList');
    if (!list || !result) return;

    const statusIcon = result.skipped ? '\u23ED' : result.success ? '\u2705' : '\u274C';
    const agentBadge = result.wasFallback ? ' <span style="color:#f59e0b;">[fallback]</span>' : '';
    const retryBadge = result.retries > 0 ? ` <span style="color:var(--text-secondary);">(${result.retries} retries)</span>` : '';

    const row = document.createElement('div');
    row.className = 'autopilot-step-row';
    row.innerHTML = `
      <span>${statusIcon}</span>
      <span style="flex:1; font-size:10px;">${result.stepId}${agentBadge}${retryBadge}</span>
      <span style="font-size:9px; color:var(--text-secondary);">${((result.endTime - result.startTime) / 1000).toFixed(1)}s</span>
    `;
    list.prepend(row);
  }

  /** Handle interrupted session prompt */
  function autopilotRenderSessionPrompt(data) {
    const prompt = document.getElementById('autopilotSessionPrompt');
    if (!prompt) return;

    if (data.hasSession && data.sessionInfo) {
      const info = data.sessionInfo;
      const timeAgo = getTimeAgo(info.savedAt);
      prompt.innerHTML = `
        <div style="font-size:10px; color:var(--text-secondary); margin-bottom:4px;">
          Interrupted session found: ${info.completedSteps}/${info.totalSteps} steps completed (${timeAgo})
        </div>
        <div style="display:flex; gap:4px;">
          <button class="btn-primary" onclick="autopilotResumeSession()" style="padding:3px 8px; font-size:10px;">Resume</button>
          <button class="btn-secondary" onclick="autopilotClearSession()" style="padding:3px 8px; font-size:10px;">Discard</button>
        </div>
      `;
      prompt.style.display = 'block';
    } else {
      prompt.style.display = 'none';
    }
  }

  /** Render config form */
  function autopilotRenderConfig(config) {
    const strategySelect = document.getElementById('autopilotStrategySelect');
    const retryInput = document.getElementById('autopilotRetryInput');
    const delayInput = document.getElementById('autopilotDelayInput');

    if (strategySelect) strategySelect.value = config.errorStrategy || 'retry';
    if (retryInput) retryInput.value = String(config.maxRetries || 3);
    if (delayInput) delayInput.value = String(config.stepDelayMs || 500);
  }

  // ─── Actions ───────────────────────────────────────────────

  function autopilotPause() {
    vscode.postMessage({ type: 'autopilotPause' });
  }

  function autopilotResume() {
    vscode.postMessage({ type: 'autopilotResume' });
  }

  function autopilotAbort() {
    vscode.postMessage({ type: 'autopilotAbort' });
  }

  function autopilotRequestStatus() {
    vscode.postMessage({ type: 'autopilotStatus' });
  }

  function autopilotCheckSession() {
    vscode.postMessage({ type: 'autopilotCheckSession' });
  }

  function autopilotResumeSession() {
    vscode.postMessage({ type: 'autopilotResumeSession' });
  }

  function autopilotClearSession() {
    vscode.postMessage({ type: 'autopilotClearSession' });
    const prompt = document.getElementById('autopilotSessionPrompt');
    if (prompt) prompt.style.display = 'none';
  }

  function autopilotUpdateConfig() {
    const strategySelect = document.getElementById('autopilotStrategySelect');
    const retryInput = document.getElementById('autopilotRetryInput');
    const delayInput = document.getElementById('autopilotDelayInput');

    const config = {};
    if (strategySelect) config.errorStrategy = strategySelect.value;
    if (retryInput) config.maxRetries = parseInt(retryInput.value) || 3;
    if (delayInput) config.stepDelayMs = parseInt(delayInput.value) || 500;

    vscode.postMessage({ type: 'autopilotConfig', config });
  }

  // ─── Helpers ───────────────────────────────────────────────

  function getTimeAgo(timestamp) {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  return {
    autopilotRenderStatus,
    autopilotRenderStepResult,
    autopilotRenderSessionPrompt,
    autopilotRenderConfig,
    autopilotPause,
    autopilotResume,
    autopilotAbort,
    autopilotRequestStatus,
    autopilotCheckSession,
    autopilotResumeSession,
    autopilotClearSession,
    autopilotUpdateConfig,
  };
}
