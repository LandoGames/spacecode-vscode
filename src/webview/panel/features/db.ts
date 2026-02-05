// @ts-nocheck

/**
 * Database Panel Frontend Handlers (Phase 6.1)
 *
 * Renders database connection list, schema viewer, query results,
 * and provides action functions for connection management.
 */

const PROVIDER_ICONS = {
  supabase: 'S',
  firebase: 'F',
  postgresql: 'P',
  mysql: 'M',
  sqlite: 'L',
  mongodb: 'D',
};

const STATUS_COLORS = {
  connected: '#10b981',
  connecting: '#f59e0b',
  disconnected: '#666',
  error: '#ef4444',
};

export function createDbHandlers(deps: { vscode: any }) {
  const { vscode } = deps;

  // ─── Render Functions ──────────────────────────────────

  function dbRenderConnectionList(msg: any) {
    const listEl = document.getElementById('dbConnectionList');
    if (!listEl) return;

    const connections = msg.connections || [];
    const activeId = msg.activeConnectionId;

    if (connections.length === 0) {
      listEl.innerHTML = '<div style="color:var(--text-secondary); font-size:11px; padding:4px;">No external databases connected.</div>';
      return;
    }

    listEl.innerHTML = connections.map((c: any) => {
      const icon = PROVIDER_ICONS[c.provider] || '?';
      const statusColor = STATUS_COLORS[c.status] || '#666';
      const isActive = c.id === activeId;
      const border = isActive ? 'border:1px solid var(--accent-color);' : 'border:1px solid var(--border-color);';

      return `<div style="padding:6px 8px; background:var(--bg-primary); border-radius:4px; margin-bottom:4px; ${border}">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-weight:700; font-size:12px; color:var(--accent-color); width:16px; text-align:center;">${icon}</span>
            <span style="font-size:11px; font-weight:500;">${c.name || c.id}</span>
            <span style="font-size:9px; color:${statusColor};">● ${c.status}</span>
          </div>
          <div style="display:flex; gap:4px;">
            ${!isActive ? `<button class="btn-secondary" onclick="dbSetActive('${c.id}')" style="padding:1px 6px; font-size:9px;">Use</button>` : '<span style="font-size:9px; color:var(--accent-color);">Active</span>'}
            <button class="btn-secondary" onclick="dbTestConnection('${c.id}')" style="padding:1px 6px; font-size:9px;">Test</button>
            <button class="btn-secondary" onclick="dbRemoveConnection('${c.id}')" style="padding:1px 6px; font-size:9px;">✕</button>
          </div>
        </div>
        <div style="font-size:9px; color:var(--text-secondary); margin-top:2px;">
          ${c.host ? c.host + (c.port ? ':' + c.port : '') : ''} ${c.database ? '/ ' + c.database : ''} ${c.filePath || ''}
        </div>
        ${c.error ? `<div style="font-size:9px; color:#ef4444; margin-top:2px;">${c.error}</div>` : ''}
      </div>`;
    }).join('');
  }

  function dbRenderSchema(msg: any) {
    const schema = msg.schema;
    if (!schema || !schema.tables) return;

    const listEl = document.getElementById('dbConnectionList');
    if (!listEl) return;

    // Append schema view below connection list
    let schemaEl = document.getElementById('dbSchemaView');
    if (!schemaEl) {
      schemaEl = document.createElement('div');
      schemaEl.id = 'dbSchemaView';
      schemaEl.style.cssText = 'margin-top:8px; border-top:1px solid var(--border-color); padding-top:8px;';
      listEl.parentElement?.appendChild(schemaEl);
    }

    if (schema.tables.length === 0) {
      schemaEl.innerHTML = '<div style="color:var(--text-secondary); font-size:11px;">No tables found.</div>';
      return;
    }

    schemaEl.innerHTML = `
      <div style="font-size:10px; font-weight:600; color:var(--text-secondary); margin-bottom:4px;">Schema (${schema.tables.length} tables)</div>
      ${schema.tables.map((t: any) => `
        <details style="margin-bottom:3px;">
          <summary style="cursor:pointer; font-size:11px; padding:2px 4px; background:var(--bg-primary); border-radius:3px;">
            <strong>${t.name}</strong>
            <span style="color:var(--text-secondary); font-size:9px;">${t.columns?.length || 0} cols${t.rowCount != null ? ', ~' + t.rowCount + ' rows' : ''}</span>
          </summary>
          <div style="padding:4px 8px; font-size:10px;">
            ${(t.columns || []).map((col: any) => `
              <div style="display:flex; gap:6px; padding:1px 0; color:var(--text-primary);">
                <span style="width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${col.primaryKey ? '🔑 ' : ''}${col.name}</span>
                <span style="color:var(--text-secondary); width:80px;">${col.type}</span>
                <span style="color:var(--text-secondary);">${col.nullable ? 'NULL' : 'NOT NULL'}</span>
              </div>
            `).join('')}
          </div>
        </details>
      `).join('')}
    `;
  }

  function dbRenderQueryResult(msg: any) {
    const result = msg.result;
    if (!result) return;

    let resultEl = document.getElementById('dbQueryResultView');
    if (!resultEl) {
      const listEl = document.getElementById('dbConnectionList');
      if (!listEl) return;
      resultEl = document.createElement('div');
      resultEl.id = 'dbQueryResultView';
      resultEl.style.cssText = 'margin-top:8px; border-top:1px solid var(--border-color); padding-top:8px;';
      listEl.parentElement?.appendChild(resultEl);
    }

    if (result.error) {
      resultEl.innerHTML = `<div style="color:#ef4444; font-size:11px; padding:4px;">Error: ${result.error}</div>`;
      return;
    }

    const cols = result.columns || [];
    const rows = result.rows || [];

    resultEl.innerHTML = `
      <div style="font-size:10px; color:var(--text-secondary); margin-bottom:4px;">${rows.length} row(s) in ${result.executionTime || 0}ms</div>
      <div style="overflow-x:auto; max-height:200px; overflow-y:auto;">
        <table style="width:100%; font-size:10px; border-collapse:collapse;">
          <thead>
            <tr>${cols.map(c => `<th style="text-align:left; padding:2px 6px; border-bottom:1px solid var(--border-color); color:var(--text-secondary);">${c}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${rows.slice(0, 100).map(row => `
              <tr>${cols.map(c => `<td style="padding:2px 6px; border-bottom:1px solid var(--bg-tertiary); max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${row[c] ?? ''}</td>`).join('')}</tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function dbRenderTestResult(msg: any) {
    const connId = msg.connectionId;
    if (!connId) return;
    // Re-render full connection list with updated status
    if (msg.connections) {
      dbRenderConnectionList({ connections: msg.connections, activeConnectionId: msg.activeConnectionId });
    }
  }

  // ─── Action Functions ──────────────────────────────────

  function dbShowConnectionWizard() {
    const wizard = document.getElementById('dbConnectionWizard');
    if (wizard) wizard.style.display = 'block';
  }

  function dbAddConnection() {
    const provider = (document.getElementById('dbProviderSelect') as HTMLSelectElement)?.value || 'postgresql';
    const name = (document.getElementById('dbConnNameInput') as HTMLInputElement)?.value?.trim();
    const host = (document.getElementById('dbHostInput') as HTMLInputElement)?.value?.trim();
    const database = (document.getElementById('dbNameInput') as HTMLInputElement)?.value?.trim();

    if (!name) return;

    vscode.postMessage({
      type: 'dbAddConnection',
      connection: {
        name,
        provider,
        host: host || 'localhost',
        database: database || '',
      },
    });

    // Hide wizard and clear inputs
    const wizard = document.getElementById('dbConnectionWizard');
    if (wizard) wizard.style.display = 'none';
    const nameInput = document.getElementById('dbConnNameInput') as HTMLInputElement;
    if (nameInput) nameInput.value = '';
    const hostInput = document.getElementById('dbHostInput') as HTMLInputElement;
    if (hostInput) hostInput.value = '';
    const dbInput = document.getElementById('dbNameInput') as HTMLInputElement;
    if (dbInput) dbInput.value = '';
  }

  function dbRemoveConnection(connectionId: string) {
    vscode.postMessage({ type: 'dbRemoveConnection', connectionId });
  }

  function dbTestConnection(connectionId: string) {
    vscode.postMessage({ type: 'dbTestConnection', connectionId });
  }

  function dbSetActive(connectionId: string) {
    vscode.postMessage({ type: 'dbSetActive', connectionId });
  }

  function dbGetSchema() {
    vscode.postMessage({ type: 'dbGetSchema' });
  }

  function dbRequestState() {
    vscode.postMessage({ type: 'dbGetState' });
  }

  return {
    // Render functions (called from messageRouter)
    dbRenderConnectionList,
    dbRenderSchema,
    dbRenderQueryResult,
    dbRenderTestResult,
    // Action functions (exposed as globals)
    dbShowConnectionWizard,
    dbAddConnection,
    dbRemoveConnection,
    dbTestConnection,
    dbSetActive,
    dbGetSchema,
    dbRequestState,
  };
}
