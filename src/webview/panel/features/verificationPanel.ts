// @ts-nocheck

export function createVerificationPanelHandlers(deps) {
  const { vscode, shipSetStatus, escapeHtml } = deps;

  let lastDiffResult = null;
  let lastPlanComparison = null;
  let lastAIReview = null;
  let planExecutionState = {
    planId: null,
    totalSteps: 0,
    completedSteps: 0,
    failedSteps: 0,
  };
  let planExecutionLogLines = [];
  let pendingPlanStep = null;
  let testRunning = false;

  function scanDiff() {
    vscode.postMessage({ type: 'scanDiff' });
    shipSetStatus('Scanning git diff...');
    document.getElementById('verificationEmpty').style.display = 'none';
  }

  function runTests() {
    if (testRunning) {
      shipSetStatus('Tests already running...');
      return;
    }
    testRunning = true;
    const btn = document.getElementById('runTestsBtn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Running...';
    }

    const resultPanel = document.getElementById('testResult');
    const statusEl = document.getElementById('testResultStatus');
    const contentEl = document.getElementById('testResultContent');

    if (resultPanel) resultPanel.style.display = 'block';
    if (statusEl) {
      statusEl.textContent = 'running';
      statusEl.style.color = '#f59e0b';
    }
    if (contentEl) contentEl.textContent = 'Running tests...';

    document.getElementById('verificationEmpty').style.display = 'none';
    vscode.postMessage({ type: 'runTests' });
    shipSetStatus('Running regression tests...');
  }

  function updateTestResult(result) {
    testRunning = false;
    const btn = document.getElementById('runTestsBtn');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Run Tests';
    }

    const resultPanel = document.getElementById('testResult');
    const statusEl = document.getElementById('testResultStatus');
    const contentEl = document.getElementById('testResultContent');

    if (resultPanel) resultPanel.style.display = 'block';

    if (result.success) {
      if (statusEl) {
        statusEl.textContent = 'pass';
        statusEl.style.color = '#22c55e';
      }
      shipSetStatus('Tests passed.');
    } else {
      if (statusEl) {
        statusEl.textContent = 'fail';
        statusEl.style.color = '#ef4444';
      }
      shipSetStatus('Tests failed.');
    }

    if (contentEl) {
      const output = result.output || '(no output)';
      contentEl.textContent = output.length > 2000 ? output.substring(0, 2000) + '\n...truncated' : output;
    }
  }

  function updateDiffSummary(diff) {
    lastDiffResult = diff;
    const summary = document.getElementById('diffSummary');
    const stats = document.getElementById('diffStats');
    const fileList = document.getElementById('diffFileList');
    const aiBtn = document.getElementById('aiReviewBtn');
    const empty = document.getElementById('verificationEmpty');

    if (!diff || !diff.files || diff.files.length === 0) {
      summary.style.display = 'none';
      empty.style.display = 'block';
      empty.textContent = 'No changes detected. Working directory is clean.';
      if (aiBtn) aiBtn.disabled = true;
      return;
    }

    summary.style.display = 'block';
    empty.style.display = 'none';
    if (aiBtn) aiBtn.disabled = false;

    const added = diff.files.filter(f => f.status === 'added').length;
    const modified = diff.files.filter(f => f.status === 'modified').length;
    const deleted = diff.files.filter(f => f.status === 'deleted').length;
    stats.textContent = '+' + added + ' ~' + modified + ' -' + deleted + ' files';

    fileList.innerHTML = diff.files.map(f => {
      const statusClass = f.status === 'added' ? 'added' : f.status === 'deleted' ? 'deleted' : 'modified';
      const statusText = f.status === 'added' ? 'A' : f.status === 'deleted' ? 'D' : 'M';
      return '<div class="diff-file"><span class="status ' + statusClass + '">' + statusText + '</span><span>' + escapeHtml(f.path) + '</span></div>';
    }).join('');

    if (diff.files.length > 0) {
      vscode.postMessage({ type: 'comparePlan', diffFiles: diff.files.map(f => f.path) });
    }
  }

  function updatePlanComparison(result) {
    lastPlanComparison = result;
    const panel = document.getElementById('planComparison');
    const content = document.getElementById('planComparisonResult');

    if (!result || (!result.unexpected.length && !result.missing.length && !result.matched.length)) {
      panel.style.display = 'none';
      return;
    }

    panel.style.display = 'block';
    let html = '';

    if (result.matched.length > 0) {
      html += '<div style="color:#22c55e; margin-bottom:4px;">✓ Matched (' + result.matched.length + ')</div>';
      result.matched.slice(0, 3).forEach(f => {
        html += '<div class="plan-match"><span class="icon">✓</span><span style="color:#22c55e;">' + escapeHtml(f) + '</span></div>';
      });
      if (result.matched.length > 3) {
        html += '<div style="color:var(--text-secondary); font-size:9px;">...and ' + (result.matched.length - 3) + ' more</div>';
      }
    }

    if (result.unexpected.length > 0) {
      html += '<div style="color:#fbbf24; margin-top:6px; margin-bottom:4px;">⚠ Unexpected (' + result.unexpected.length + ')</div>';
      result.unexpected.forEach(f => {
        html += '<div class="plan-match"><span class="icon">⚠</span><span style="color:#fbbf24;">' + escapeHtml(f) + '</span></div>';
      });
    }

    if (result.missing.length > 0) {
      html += '<div style="color:#ef4444; margin-top:6px; margin-bottom:4px;">✗ Missing (' + result.missing.length + ')</div>';
      result.missing.forEach(f => {
        html += '<div class="plan-match"><span class="icon">✗</span><span style="color:#ef4444;">' + escapeHtml(f) + '</span></div>';
      });
    }

    content.innerHTML = html;
  }

  function showPlanExecutionPanel(show) {
    const panel = document.getElementById('planExecutionPanel');
    if (panel) {
      panel.style.display = show ? 'block' : 'none';
    }
  }

  function setPlanExecutionStatus(text, isError) {
    const status = document.getElementById('planExecutionStatus');
    if (status) {
      status.textContent = text || '';
      status.style.color = isError ? 'var(--error-text)' : 'var(--text-secondary)';
    }
  }

  function setPlanExecutionProgress(text) {
    const progress = document.getElementById('planExecutionProgress');
    if (progress) {
      progress.textContent = text || '';
    }
  }

  function clearPlanExecutionLog() {
    planExecutionLogLines = [];
    const log = document.getElementById('planExecutionLog');
    if (log) {
      log.textContent = '';
    }
  }

  function appendPlanExecutionLog(line) {
    if (!line) return;
    const safeLine = String(line).trim();
    if (!safeLine) return;
    planExecutionLogLines.push(safeLine);
    if (planExecutionLogLines.length > 200) {
      planExecutionLogLines = planExecutionLogLines.slice(-200);
    }
    const log = document.getElementById('planExecutionLog');
    if (log) {
      log.textContent = planExecutionLogLines.join('\n');
    }
  }

  function showPlanStepGate(payload) {
    pendingPlanStep = payload || null;
    const gate = document.getElementById('planStepGate');
    const details = document.getElementById('planStepGateDetails');
    if (details && payload) {
      const phaseLabel = payload.phaseTitle ? payload.phaseTitle : 'Phase ' + ((payload.phaseIndex || 0) + 1);
      const stepLabel = payload.stepDescription || payload.stepId || 'Step';
      details.textContent = phaseLabel + ' • ' + stepLabel;
    }
    if (gate) gate.style.display = payload ? 'block' : 'none';
  }

  function hidePlanStepGate() {
    pendingPlanStep = null;
    const gate = document.getElementById('planStepGate');
    if (gate) gate.style.display = 'none';
  }

  function approvePlanStep() {
    if (!pendingPlanStep) return;
    vscode.postMessage({ type: 'planStepApprove', planId: pendingPlanStep.planId, stepId: pendingPlanStep.stepId });
    hidePlanStepGate();
  }

  function abortPlanStep() {
    if (!pendingPlanStep) return;
    vscode.postMessage({ type: 'planStepAbort', planId: pendingPlanStep.planId, stepId: pendingPlanStep.stepId });
    hidePlanStepGate();
  }

  function runAIReview() {
    if (!lastDiffResult || !lastDiffResult.diff) {
      shipSetStatus('No diff available for AI review.');
      return;
    }
    vscode.postMessage({ type: 'runAIReview', diff: lastDiffResult.diff });
    shipSetStatus('Running AI review...');

    const status = document.getElementById('aiReviewStatus');
    if (status) {
      status.innerHTML = '<span class="ai-review-status-badge running">Analyzing...</span>';
    }
    document.getElementById('aiReviewResult').style.display = 'block';
    document.getElementById('aiReviewContent').innerHTML = '<div style="color:var(--text-secondary); text-align:center; padding:12px;">AI is reviewing your changes...</div>';
  }

  function updateAIReview(result) {
    lastAIReview = result;
    const panel = document.getElementById('aiReviewResult');
    const content = document.getElementById('aiReviewContent');
    const status = document.getElementById('aiReviewStatus');

    panel.style.display = 'block';

    if (!result || result.error) {
      status.innerHTML = '<span class="ai-review-status-badge issues">Error</span>';
      content.innerHTML = '<div style="color:#ef4444; padding:8px;">' + escapeHtml(result?.error || 'Unknown error') + '</div>';
      shipSetStatus('AI review failed.');
      return;
    }

    const issues = result.issues || [];
    const errors = issues.filter(i => i.severity === 'error').length;
    const warnings = issues.filter(i => i.severity === 'warning').length;
    const infos = issues.filter(i => i.severity === 'info').length;
    const total = issues.length;

    if (total === 0) {
      status.innerHTML = '<span class="ai-review-status-badge clean">Clean</span>';
      shipSetStatus('AI review complete - no issues found.');
    } else if (errors > 0) {
      status.innerHTML = '<span class="ai-review-status-badge issues">' + total + ' issue' + (total !== 1 ? 's' : '') + '</span>';
      shipSetStatus('AI review found ' + errors + ' error' + (errors !== 1 ? 's' : '') + '.');
    } else {
      status.innerHTML = '<span class="ai-review-status-badge warning-only">' + total + ' issue' + (total !== 1 ? 's' : '') + '</span>';
      shipSetStatus('AI review found ' + warnings + ' warning' + (warnings !== 1 ? 's' : '') + '.');
    }

    let html = '';

    if (total > 0) {
      html += '<div class="ai-review-summary">';
      if (errors > 0) {
        html += '<span class="ai-review-count errors">X ' + errors + ' error' + (errors !== 1 ? 's' : '') + '</span>';
      }
      if (warnings > 0) {
        html += '<span class="ai-review-count warnings">! ' + warnings + ' warning' + (warnings !== 1 ? 's' : '') + '</span>';
      }
      if (infos > 0) {
        html += '<span class="ai-review-count infos">i ' + infos + ' info</span>';
      }
      html += '</div>';
    } else {
      html += '<div class="ai-review-summary"><span class="ai-review-count clean">No issues found - code looks good!</span></div>';
    }

    issues.forEach(issue => {
      const sev = issue.severity || 'info';
      const severityClass = sev === 'error' ? 'error' : sev === 'warning' ? 'warning' : 'info';
      const icon = sev === 'error' ? 'X' : sev === 'warning' ? '!' : 'i';

      html += '<div class="ai-issue ' + severityClass + '">';
      html += '<div class="ai-issue-title"><span class="ai-issue-icon">' + icon + '</span>' + escapeHtml(issue.title || 'Issue') + '</div>';
      if (issue.file) {
        html += '<div class="ai-issue-location">' + escapeHtml(issue.file) + (issue.line ? ':' + issue.line : '') + '</div>';
      }
      if (issue.description) {
        html += '<div class="ai-issue-desc">' + escapeHtml(issue.description) + '</div>';
      }
      html += '</div>';
    });

    if (result.summary) {
      html += '<div style="margin-top:8px; padding-top:8px; border-top:1px solid var(--border-color); color:var(--text-secondary); font-size:10px;">' + escapeHtml(result.summary) + '</div>';
    }

    content.innerHTML = html;
  }

  function setPlanExecutionButtonsEnabled(enabled) {
    const executeBtn = document.getElementById('executePlanBtn');
    const stepBtn = document.getElementById('executePlanStepBtn');
    if (executeBtn) executeBtn.disabled = !enabled;
    if (stepBtn) stepBtn.disabled = !enabled;
  }

  return {
    scanDiff,
    runTests,
    updateTestResult,
    updateDiffSummary,
    updatePlanComparison,
    showPlanExecutionPanel,
    setPlanExecutionStatus,
    setPlanExecutionProgress,
    clearPlanExecutionLog,
    appendPlanExecutionLog,
    showPlanStepGate,
    hidePlanStepGate,
    approvePlanStep,
    abortPlanStep,
    runAIReview,
    updateAIReview,
    setPlanExecutionButtonsEnabled,
    getPlanExecutionState: () => planExecutionState,
    setPlanExecutionState: (value) => { planExecutionState = value; },
  };
}
