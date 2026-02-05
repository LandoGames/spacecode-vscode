// @ts-nocheck

export function createEngineerHandlers(deps) {
  const { vscode, escapeHtml } = deps;

  let _showAll = false;
  let _currentSuggestions = [];

  /** Render status strip */
  function engineerRenderStatus(data) {
    const indicator = document.getElementById('engineerHealthIndicator');
    const statusText = document.getElementById('engineerStatusText');
    const topAction = document.getElementById('engineerTopAction');
    const alertBadge = document.getElementById('engineerAlertBadge');
    const healthBig = document.getElementById('engineerHealthBig');
    const warningCount = document.getElementById('engineerWarningCount');

    if (indicator) {
      indicator.className = 'engineer-health-indicator ' + (data.health || 'ok');
    }

    const healthLabels = { ok: 'Healthy', warn: 'Warning', critical: 'Critical' };
    if (statusText) statusText.textContent = healthLabels[data.health] || 'Unknown';
    if (topAction) topAction.textContent = data.topAction || 'No pending actions';

    if (alertBadge) {
      if (data.alertCount > 0) {
        alertBadge.style.display = 'inline-block';
        alertBadge.textContent = String(data.alertCount);
      } else {
        alertBadge.style.display = 'none';
      }
    }

    // Big health in Engineer panel
    if (healthBig) {
      healthBig.className = 'engineer-health-big ' + (data.health || 'ok');
      healthBig.textContent = healthLabels[data.health] || 'Unknown';
    }
    if (warningCount) {
      warningCount.textContent = data.alertCount > 0 ? `${data.alertCount} alert${data.alertCount > 1 ? 's' : ''}` : 'No alerts';
    }
  }

  /** Render suggestion cards */
  function engineerRenderSuggestions(suggestions) {
    _currentSuggestions = suggestions || [];
    const list = document.getElementById('engineerSuggestionsList');
    const empty = document.getElementById('engineerSuggestionsEmpty');
    const warningList = document.getElementById('engineerWarningList');

    const visible = _showAll ? _currentSuggestions : _currentSuggestions.filter(s => s.score >= 5);

    if (!list) return;

    if (visible.length === 0) {
      list.innerHTML = '';
      if (empty) empty.style.display = 'block';
      if (warningList) warningList.innerHTML = '';
      return;
    }

    if (empty) empty.style.display = 'none';

    // Warning list (top-level summary)
    if (warningList) {
      const warnings = visible.filter(s => s.risk !== 'low');
      if (warnings.length > 0) {
        warningList.innerHTML = warnings.slice(0, 3).map(s =>
          `<div style="margin-bottom:2px;">- ${escapeHtml(s.title)}</div>`
        ).join('');
      } else {
        warningList.innerHTML = '<div style="color:var(--text-secondary);">No warnings.</div>';
      }
    }

    // Suggestion cards
    list.innerHTML = visible.map((s, i) => {
      const riskColors = { low: '#22c55e', med: '#f59e0b', high: '#ef4444' };
      const riskColor = riskColors[s.risk] || '#6b7280';
      const sourceLabel = s.source === 'ai' ? '<span style="color:#8b5cf6; font-size:9px; margin-left:4px;">[AI]</span>' : '';
      const sectorLabel = s.sectorId ? `<span style="color:var(--text-secondary); font-size:9px; margin-left:4px;">${escapeHtml(s.sectorId)}</span>` : '';

      return `
        <div class="engineer-suggestion-card" data-suggestion-id="${escapeHtml(s.id)}">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div style="flex:1;">
              <div style="font-size:11px; font-weight:600; color:var(--text-primary);">
                ${i + 1}) ${escapeHtml(s.title)}${sourceLabel}${sectorLabel}
              </div>
              <div style="font-size:10px; color:var(--text-secondary); margin-top:2px;">
                ${escapeHtml(s.why)}
              </div>
              <div style="display:flex; gap:8px; font-size:9px; margin-top:4px; color:var(--text-secondary);">
                <span style="color:${riskColor};">Risk: ${s.risk}</span>
                <span>Confidence: ${s.confidence}</span>
                <span>Source: ${s.source}</span>
              </div>
            </div>
            <div style="font-size:11px; font-weight:700; color:var(--text-primary); min-width:36px; text-align:right;">
              ${s.score}
            </div>
          </div>
          <div style="display:flex; gap:4px; margin-top:6px;">
            ${s.actionType === 'validate' ? `<button class="btn-primary engineer-action-btn" onclick="engineerAction('${escapeHtml(s.id)}', 'run')" style="padding:3px 8px; font-size:10px;">Run</button>` : ''}
            <button class="btn-secondary engineer-action-btn" onclick="engineerAction('${escapeHtml(s.id)}', 'open')" style="padding:3px 8px; font-size:10px;">Open</button>
            <button class="btn-secondary engineer-action-btn" onclick="engineerAction('${escapeHtml(s.id)}', 'defer')" style="padding:3px 8px; font-size:10px;">Defer</button>
            <button class="btn-secondary engineer-action-btn" onclick="engineerAction('${escapeHtml(s.id)}', 'dismiss')" style="padding:3px 8px; font-size:10px;">Dismiss</button>
          </div>
        </div>
      `;
    }).join('');
  }

  /** Render history entries */
  function engineerRenderHistory(history) {
    const list = document.getElementById('engineerHistoryList');
    if (!list) return;

    if (!history || history.length === 0) {
      list.innerHTML = '<div style="font-size:10px; color:var(--text-secondary); text-align:center; padding:8px;">No history yet.</div>';
      return;
    }

    const decisionIcons = { accepted: '\u2705', deferred: '\u23F8', dismissed: '\u274C' };
    const decisionColors = { accepted: '#22c55e', deferred: '#f59e0b', dismissed: '#6b7280' };

    list.innerHTML = history.slice(0, 20).map(h => {
      const time = new Date(h.decidedAt);
      const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const icon = decisionIcons[h.decision] || '\u2022';
      const color = decisionColors[h.decision] || 'var(--text-secondary)';

      return `<div class="engineer-history-row">
        <span style="color:${color};">${icon}</span>
        <span style="font-size:10px; color:var(--text-primary); flex:1;">${escapeHtml(h.title)}</span>
        <span style="font-size:9px; color:var(--text-secondary);">${timeStr}</span>
      </div>`;
    }).join('');
  }

  /** Render inline prompt bar */
  function engineerRenderPrompt(data) {
    const bar = document.getElementById('engineerPromptBar');
    const text = document.getElementById('engineerPromptText');
    const actions = document.getElementById('engineerPromptActions');

    if (!bar || !text || !actions) return;

    text.textContent = data.message;

    actions.innerHTML = (data.actions || []).map(a => {
      const action = a.toLowerCase() === 'dismiss' ? 'dismiss' : 'open';
      const sid = data.suggestionId || '';
      return `<button class="btn-secondary" onclick="engineerPromptAction('${escapeHtml(sid)}', '${action}')" style="padding:2px 8px; font-size:10px;">${escapeHtml(a)}</button>`;
    }).join('');

    bar.style.display = 'flex';
  }

  /** Dismiss inline prompt bar */
  function engineerDismissPrompt() {
    const bar = document.getElementById('engineerPromptBar');
    if (bar) bar.style.display = 'none';
  }

  /** Handle "show all" toggle */
  function engineerToggleShowAll(showAll) {
    _showAll = showAll;
    engineerRenderSuggestions(_currentSuggestions);
  }

  /** Send action on a suggestion */
  function engineerAction(suggestionId, action) {
    vscode.postMessage({ type: 'engineerAction', suggestionId, action });
  }

  /** Request manual rescan */
  function engineerRefresh() {
    vscode.postMessage({ type: 'engineerRefresh' });
  }

  /** Delegate to a role */
  function engineerDelegate(role) {
    vscode.postMessage({ type: 'engineerDelegate', role });
  }

  /** Request history */
  function engineerRequestHistory() {
    vscode.postMessage({ type: 'engineerHistory' });
  }

  /** Handle inline prompt action */
  function engineerPromptAction(suggestionId, action) {
    if (action === 'dismiss') {
      engineerDismissPrompt();
      if (suggestionId) {
        vscode.postMessage({ type: 'engineerAction', suggestionId, action: 'dismiss' });
      }
    } else {
      engineerDismissPrompt();
      if (suggestionId) {
        vscode.postMessage({ type: 'engineerAction', suggestionId, action: 'open' });
      }
    }
  }

  /** Handle delegated response — inject into chat and show role label */
  function engineerHandleDelegated(data) {
    // Show delegated role indicator
    const roleNames = {
      'architect': 'Architect',
      'modularity-lead': 'Modularity Lead',
      'verifier': 'Verifier',
      'doc-officer': 'Doc Officer',
      'planner': 'Planner',
      'release-captain': 'Release Captain',
    };
    const roleName = roleNames[data.role] || data.role;

    // Add or update role indicator in chat
    let indicator = document.getElementById('delegatedRoleIndicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'delegatedRoleIndicator';
      indicator.style.cssText = 'padding:4px 8px; font-size:10px; background:rgba(168,85,247,0.12); border:1px solid rgba(168,85,247,0.3); border-radius:4px; display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;';
      const inputArea = document.getElementById('chatInputContainer') || document.getElementById('chatInput')?.parentElement;
      if (inputArea) inputArea.prepend(indicator);
    }
    indicator.innerHTML = `<span>Delegated to: <strong>${roleName}</strong></span><button onclick="this.parentElement.remove();" style="background:none; border:none; color:var(--text-secondary); cursor:pointer; font-size:12px;">x</button>`;

    // Switch to chat tab if not already there
    const chatTab = document.querySelector('[data-tab="chat"]');
    if (chatTab) chatTab.click();

    // Inject the delegation prompt into chat
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
      chatInput.value = data.prompt;
      chatInput.dispatchEvent(new Event('input'));
      chatInput.focus();
    }
  }

  /** Check if sectors are available and show hint */
  function engineerCheckSectors(suggestions) {
    const hint = document.getElementById('engineerNoSectors');
    if (!hint) return;
    // Show hint if no sector-related suggestions and no sectors configured
    const hasSectorSuggestions = suggestions.some(s => s.sectorId);
    const sectorsEmpty = !hasSectorSuggestions && suggestions.length <= 1;
    hint.style.display = sectorsEmpty ? 'block' : 'none';
  }

  return {
    engineerRenderStatus,
    engineerRenderSuggestions,
    engineerRenderHistory,
    engineerRenderPrompt,
    engineerDismissPrompt,
    engineerToggleShowAll,
    engineerAction,
    engineerRefresh,
    engineerDelegate,
    engineerRequestHistory,
    engineerPromptAction,
    engineerHandleDelegated,
    engineerCheckSectors,
  };
}
