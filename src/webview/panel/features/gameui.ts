// @ts-nocheck

/**
 * Game UI Pipeline Frontend Handlers
 *
 * Renders pipeline state, catalog browser, component status,
 * and theme editor in the webview.
 */

export function createGameUIHandlers(deps) {
  const { vscode } = deps;

  let _currentState = null;
  let _catalog = [];

  // ─── Render Functions ────────────────────────────────────

  /** Render pipeline state overview */
  function gameuiRenderState(data) {
    _currentState = data.state;
    const summary = data.summary;
    if (!summary) return;

    const statusEl = document.getElementById('gameuiStatus');
    const progressEl = document.getElementById('gameuiProgressFill');
    const statsEl = document.getElementById('gameuiStats');
    const phaseEl = document.getElementById('gameuiCurrentPhase');

    if (statusEl) {
      statusEl.textContent = _currentState?.isRunning ? 'Running' : 'Idle';
      statusEl.className = 'gameui-status ' + (_currentState?.isRunning ? 'running' : 'idle');
    }

    if (progressEl) {
      const pct = summary.total > 0
        ? ((summary.total - summary.planned) / summary.total) * 100
        : 0;
      progressEl.style.width = `${pct}%`;
    }

    if (statsEl) {
      statsEl.innerHTML = `
        <span title="Planned">${summary.planned} planned</span>
        <span title="Placeholder">${summary.placeholder} placed</span>
        <span title="Verified">${summary.verified} verified</span>
        <span title="Complete">${summary.complete} done</span>
        ${summary.errors > 0 ? `<span style="color:var(--error-text);">${summary.errors} errors</span>` : ''}
      `;
    }

    if (phaseEl && _currentState) {
      const phaseLabels = {
        'theme': 'Theme Setup',
        'primitives': 'Primitives',
        'system-screens': 'System Screens',
        'menu': 'Main Menu',
        'hud': 'HUD Elements',
        'panels': 'Panels',
        'dialogs-map': 'Dialogs & Map',
        'art-replacement': 'Art Replacement',
      };
      phaseEl.textContent = phaseLabels[_currentState.phase] || _currentState.phase;
    }

    // Render category breakdown
    gameuiRenderCategoryBreakdown(summary.byCategory);
  }

  /** Render category breakdown chips */
  function gameuiRenderCategoryBreakdown(byCategory) {
    const container = document.getElementById('gameuiCategoryBreakdown');
    if (!container || !byCategory) return;

    const categoryColors = {
      primitive: '#64748B',
      system: '#3B82F6',
      menu: '#8B5CF6',
      hud: '#22C55E',
      inventory: '#F59E0B',
      character: '#F59E0B',
      social: '#F59E0B',
      shop: '#F59E0B',
      dialog: '#EF4444',
      map: '#6B7280',
    };

    container.innerHTML = '';
    for (const [cat, info] of Object.entries(byCategory)) {
      const chip = document.createElement('div');
      chip.className = 'gameui-category-chip';
      const color = categoryColors[cat] || '#64748B';
      chip.innerHTML = `
        <span style="width:8px; height:8px; border-radius:50%; background:${color}; display:inline-block;"></span>
        <span style="font-size:9px; text-transform:capitalize;">${cat}</span>
        <span style="font-size:9px; color:var(--text-secondary);">${info.done}/${info.total}</span>
      `;
      chip.onclick = () => gameuiFilterCategory(cat);
      container.appendChild(chip);
    }
  }

  /** Render component catalog list */
  function gameuiRenderCatalog(data) {
    _catalog = data.components || [];
    const list = document.getElementById('gameuiComponentList');
    if (!list) return;

    list.innerHTML = '';
    const statusIcons = {
      planned: '\u23F3',
      placeholder: '\uD83D\uDFE6',
      verified: '\u2705',
      'art-generated': '\uD83C\uDFA8',
      'art-swapped': '\uD83D\uDD04',
      complete: '\u2B50',
    };

    for (const comp of _catalog) {
      const row = document.createElement('div');
      row.className = 'gameui-component-row';
      row.innerHTML = `
        <span style="font-size:10px;">${statusIcons[comp.status] || '\u23F3'}</span>
        <span style="font-size:10px; font-weight:600; width:60px;">${comp.id}</span>
        <span style="font-size:10px; flex:1;">${comp.name}</span>
        <span style="font-size:9px; color:var(--text-secondary); text-transform:capitalize;">${comp.status}</span>
        ${comp.status === 'planned' ? `<button class="btn-secondary" onclick="gameuiGenerateComponent('${comp.id}')" style="padding:2px 6px; font-size:9px;">Generate</button>` : ''}
      `;
      list.appendChild(row);
    }
  }

  /** Render pipeline event (live feed) */
  function gameuiRenderEvent(event) {
    const feed = document.getElementById('gameuiEventFeed');
    if (!feed || !event) return;

    const typeColors = {
      'started': 'var(--accent-color)',
      'phase-start': '#8B5CF6',
      'phase-complete': '#22C55E',
      'component-start': 'var(--text-secondary)',
      'component-complete': '#22C55E',
      'component-error': 'var(--error-text)',
      'complete': '#22C55E',
      'error': 'var(--error-text)',
      'stopped': '#F59E0B',
    };

    const row = document.createElement('div');
    row.style.cssText = 'font-size:9px; padding:2px 0; border-bottom:1px solid rgba(255,255,255,0.05);';
    const color = typeColors[event.type] || 'var(--text-secondary)';
    const time = new Date(event.timestamp).toLocaleTimeString();
    row.innerHTML = `<span style="color:${color};">[${event.type}]</span> ${event.componentId || ''} ${event.message || ''} <span style="color:var(--text-secondary);">${time}</span>`;
    feed.prepend(row);

    // Keep only last 50 events
    while (feed.children.length > 50) {
      feed.removeChild(feed.lastChild);
    }
  }

  /** Render theme list */
  function gameuiRenderThemes(data) {
    const list = document.getElementById('gameuiThemeList');
    if (!list) return;

    list.innerHTML = '';
    for (const theme of (data.themes || [])) {
      const row = document.createElement('div');
      row.className = 'gameui-theme-row' + (theme.isActive ? ' active' : '');
      row.innerHTML = `
        <span style="font-size:10px; font-weight:600;">${theme.name}</span>
        <span style="font-size:9px; color:var(--text-secondary);">${theme.variables?.length || 0} vars</span>
        ${theme.isActive ? '<span style="font-size:9px; color:var(--accent-color);">Active</span>' : `<button class="btn-secondary" onclick="gameuiSetActiveTheme('${theme.id}')" style="padding:2px 6px; font-size:9px;">Use</button>`}
      `;
      list.appendChild(row);
    }
  }

  // ─── Actions ─────────────────────────────────────────────

  function gameuiRequestState() {
    vscode.postMessage({ type: 'gameuiGetState' });
  }

  function gameuiRequestCatalog(category) {
    vscode.postMessage({ type: 'gameuiGetCatalog', category: category || null });
  }

  function gameuiFilterCategory(category) {
    gameuiRequestCatalog(category);
  }

  function gameuiGenerateComponent(componentId) {
    vscode.postMessage({ type: 'gameuiGenerateComponent', componentId });
  }

  function gameuiRunPhase(phase) {
    vscode.postMessage({ type: 'gameuiRunPhase', phase });
  }

  function gameuiRunAll() {
    vscode.postMessage({ type: 'gameuiRunAll' });
  }

  function gameuiStop() {
    vscode.postMessage({ type: 'gameuiStop' });
  }

  function gameuiRequestThemes() {
    vscode.postMessage({ type: 'gameuiGetThemes' });
  }

  function gameuiSetActiveTheme(themeId) {
    vscode.postMessage({ type: 'gameuiSetTheme', activeThemeId: themeId });
  }

  function gameuiGenerateThemeUSS() {
    vscode.postMessage({ type: 'gameuiGenerateThemeUSS' });
  }

  function gameuiSaveState() {
    vscode.postMessage({ type: 'gameuiSaveState' });
  }

  function gameuiLoadState() {
    vscode.postMessage({ type: 'gameuiLoadState' });
  }

  return {
    gameuiRenderState,
    gameuiRenderCatalog,
    gameuiRenderEvent,
    gameuiRenderThemes,
    gameuiRequestState,
    gameuiRequestCatalog,
    gameuiFilterCategory,
    gameuiGenerateComponent,
    gameuiRunPhase,
    gameuiRunAll,
    gameuiStop,
    gameuiRequestThemes,
    gameuiSetActiveTheme,
    gameuiGenerateThemeUSS,
    gameuiSaveState,
    gameuiLoadState,
  };
}
