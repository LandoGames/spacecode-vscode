// @ts-nocheck

/**
 * Ops Array Frontend Handlers (Phase 8)
 *
 * Renders server list, metrics, hardening status, deployment controls,
 * quick actions, and operations log.
 */

const STATUS_COLORS = {
  online: '#22c55e',
  offline: '#ef4444',
  degraded: '#f59e0b',
  unknown: '#6b7280',
};

const STATUS_ICONS = {
  online: '🟢',
  offline: '🔴',
  degraded: '🟡',
  unknown: '⚪',
};

export function createOpsHandlers(deps) {
  const { vscode, escapeHtml } = deps;

  /** Render the full ops state */
  function opsRenderState(msg) {
    opsRenderServerList(msg.servers || []);
    opsRenderRecentOps(msg.recentOps || []);

    // Update active server indicator
    const activeId = msg.activeServerId;
    if (activeId) {
      const server = (msg.servers || []).find(s => s.id === activeId);
      if (server) opsRenderServerDetail(server);
    }
  }

  /** Render server list */
  function opsRenderServerList(servers) {
    const el = document.getElementById('opsServerList');
    if (!el) return;

    if (!servers || servers.length === 0) {
      el.innerHTML = '<div style="font-size:10px; color:var(--text-secondary); text-align:center; padding:12px;">No servers configured. Click "+ Add Server" to get started.</div>';
      return;
    }

    el.innerHTML = servers.map(server => {
      const icon = STATUS_ICONS[server.status] || '⚪';
      const color = STATUS_COLORS[server.status] || '#6b7280';
      const lastSeen = server.lastSeen ? formatRelativeTime(server.lastSeen) : 'never';
      const metrics = server.metrics;

      let metricsHtml = '';
      if (metrics) {
        metricsHtml = `<div style="display:flex; gap:8px; font-size:9px; color:var(--text-secondary); margin-top:2px;">
          <span style="color:${metrics.cpu > 80 ? '#ef4444' : 'inherit'}">CPU: ${metrics.cpu}%</span>
          <span style="color:${metrics.ram > 90 ? '#ef4444' : 'inherit'}">RAM: ${metrics.ram}%</span>
          <span style="color:${metrics.disk > 85 ? '#ef4444' : 'inherit'}">Disk: ${metrics.disk}%</span>
        </div>`;
      }

      return `<div class="ops-server-row" onclick="opsSelectServer('${server.id}')" style="cursor:pointer; ${msg?.activeServerId === server.id ? 'border-color:var(--accent-color);' : ''}">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:11px; font-weight:600;">${icon} ${escapeHtml(server.name)}</span>
          <span style="font-size:9px; color:${color};">${server.status}</span>
        </div>
        <div style="font-size:10px; color:var(--text-secondary); margin-top:2px;">${escapeHtml(server.user)}@${escapeHtml(server.host)}:${server.port || 22}</div>
        ${metricsHtml}
        <div style="font-size:9px; color:var(--text-secondary); margin-top:2px;">Last seen: ${lastSeen}</div>
      </div>`;
    }).join('');
  }

  /** Render server detail panel */
  function opsRenderServerDetail(server) {
    const el = document.getElementById('opsServerDetail');
    if (!el || !server) return;

    const icon = STATUS_ICONS[server.status] || '⚪';
    const metrics = server.metrics;
    const hardening = server.hardening;

    let metricsHtml = '<div style="font-size:10px; color:var(--text-secondary);">No metrics yet. Run a health check.</div>';
    if (metrics) {
      metricsHtml = `
        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:6px; margin-top:4px;">
          <div class="ops-metric-card">
            <div style="font-size:9px; color:var(--text-secondary);">CPU</div>
            <div style="font-size:16px; font-weight:700; color:${metrics.cpu > 80 ? '#ef4444' : '#22c55e'};">${metrics.cpu}%</div>
          </div>
          <div class="ops-metric-card">
            <div style="font-size:9px; color:var(--text-secondary);">RAM</div>
            <div style="font-size:16px; font-weight:700; color:${metrics.ram > 90 ? '#ef4444' : '#22c55e'};">${metrics.ram}%</div>
          </div>
          <div class="ops-metric-card">
            <div style="font-size:9px; color:var(--text-secondary);">Disk</div>
            <div style="font-size:16px; font-weight:700; color:${metrics.disk > 85 ? '#ef4444' : '#22c55e'};">${metrics.disk}%</div>
          </div>
        </div>
      `;
    }

    let hardeningHtml = '';
    if (hardening) {
      const checks = [
        { label: 'Root login disabled', ok: hardening.rootLoginDisabled },
        { label: 'Password auth disabled', ok: hardening.passwordAuthDisabled },
        { label: 'Firewall active', ok: hardening.firewallActive },
        { label: 'Fail2ban running', ok: hardening.fail2banRunning },
        { label: 'Auto-updates enabled', ok: hardening.autoUpdatesEnabled },
      ];
      hardeningHtml = `<div style="margin-top:6px;">
        <div style="font-size:10px; font-weight:600; margin-bottom:4px;">Hardening</div>
        ${checks.map(c => `<div style="font-size:9px;">${c.ok ? '✅' : '❌'} ${c.label}</div>`).join('')}
        ${hardening.pendingUpdates > 0 ? `<div style="font-size:9px; color:#f59e0b; margin-top:2px;">⚠ ${hardening.pendingUpdates} pending update(s)</div>` : ''}
      </div>`;
    }

    el.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <strong style="font-size:12px;">${icon} ${escapeHtml(server.name)}</strong>
        <div style="display:flex; gap:4px;">
          <button class="btn-secondary" onclick="opsTestConnection('${server.id}')" style="padding:2px 6px; font-size:9px;">Test</button>
          <button class="btn-secondary" onclick="opsHealthCheck('${server.id}')" style="padding:2px 6px; font-size:9px;">Health</button>
          <button class="btn-secondary" onclick="opsRemoveServer('${server.id}')" style="padding:2px 6px; font-size:9px; color:#ef4444;">Remove</button>
        </div>
      </div>
      <div style="font-size:10px; color:var(--text-secondary);">${escapeHtml(server.user)}@${escapeHtml(server.host)}:${server.port || 22}</div>
      ${metricsHtml}
      ${hardeningHtml}
      <div style="display:flex; gap:4px; margin-top:8px; flex-wrap:wrap;">
        <button class="btn-secondary" onclick="opsHardenServer('${server.id}', 'full')" style="padding:3px 8px; font-size:9px;">🔒 Harden</button>
        <button class="btn-secondary" onclick="opsHardenServer('${server.id}', 'updateOS')" style="padding:3px 8px; font-size:9px;">🔄 Update OS</button>
        <button class="btn-secondary" onclick="opsHardenServer('${server.id}', 'firewall')" style="padding:3px 8px; font-size:9px;">🛡️ Firewall</button>
        <button class="btn-secondary" onclick="opsDeployService('${server.id}', 'coturn')" style="padding:3px 8px; font-size:9px;">🚀 Deploy TURN</button>
        <button class="btn-secondary" onclick="opsDeployService('${server.id}', 'unity')" style="padding:3px 8px; font-size:9px;">🎮 Deploy Unity</button>
      </div>
    `;
  }

  /** Render recent operations */
  function opsRenderRecentOps(ops) {
    const el = document.getElementById('opsRecentOpsList');
    if (!el) return;

    if (!ops || ops.length === 0) {
      el.innerHTML = '<div style="font-size:10px; color:var(--text-secondary); text-align:center; padding:8px;">No operations yet.</div>';
      return;
    }

    el.innerHTML = ops.slice(0, 15).map(op => {
      const statusIcon = op.status === 'success' ? '✅' : op.status === 'failed' ? '❌' : '🔄';
      const time = new Date(op.timestamp).toLocaleTimeString();
      return `<div class="ops-log-row" ${op.output ? `onclick="opsShowOpOutput('${op.id}')" style="cursor:pointer;"` : ''}>
        <span style="font-size:9px; color:var(--text-secondary); min-width:50px;">${time}</span>
        <span style="font-size:10px;">${statusIcon} ${escapeHtml(op.action)}</span>
        <span style="font-size:9px; color:var(--text-secondary);">${escapeHtml(op.serverName)}</span>
      </div>`;
    }).join('');
  }

  /** Render command output */
  function opsRenderCommandOutput(msg) {
    const el = document.getElementById('opsCommandOutput');
    if (!el) return;
    el.style.display = 'block';
    el.innerHTML = `<pre style="font-size:9px; white-space:pre-wrap; max-height:200px; overflow-y:auto; margin:0; padding:6px; background:var(--bg-primary); border-radius:4px; border:1px solid var(--border-color);">${escapeHtml(msg.output || '')}</pre>`;
  }

  // --- Action functions ---

  function opsRequestState() {
    vscode.postMessage({ type: 'opsGetState' });
  }

  function opsAddServer() {
    const hostEl = document.getElementById('opsServerHost') as HTMLInputElement;
    const userEl = document.getElementById('opsServerUser') as HTMLInputElement;
    const nameEl = document.getElementById('opsServerName') as HTMLInputElement;
    const host = hostEl?.value?.trim() || '';
    const user = userEl?.value?.trim() || 'root';
    const name = nameEl?.value?.trim() || host;

    if (!host) {
      const statusEl = document.getElementById('opsAddStatus');
      if (statusEl) { statusEl.textContent = 'Enter a hostname or IP.'; statusEl.style.color = '#ef4444'; }
      return;
    }

    vscode.postMessage({ type: 'opsAddServer', host, user, name });
    if (hostEl) hostEl.value = '';
    if (userEl) userEl.value = '';
    if (nameEl) nameEl.value = '';
  }

  function opsRemoveServer(serverId) {
    vscode.postMessage({ type: 'opsRemoveServer', serverId });
  }

  function opsSelectServer(serverId) {
    vscode.postMessage({ type: 'opsSetActiveServer', serverId });
  }

  function opsTestConnection(serverId) {
    vscode.postMessage({ type: 'opsTestConnection', serverId });
  }

  function opsHealthCheck(serverId) {
    vscode.postMessage({ type: 'opsHealthCheck', serverId });
  }

  function opsHardenServer(serverId, action) {
    vscode.postMessage({ type: 'opsHardenServer', serverId, action: action || 'full' });
  }

  function opsDeployService(serverId, service) {
    vscode.postMessage({ type: 'opsDeployService', serverId, service });
  }

  function opsExecuteCommand(serverId) {
    const cmdEl = document.getElementById('opsCommandInput') as HTMLInputElement;
    const cmd = cmdEl?.value?.trim() || '';
    if (!cmd) return;
    const sudoEl = document.getElementById('opsCommandSudo') as HTMLInputElement;
    const sudo = sudoEl?.checked || false;
    vscode.postMessage({ type: 'opsExecuteCommand', serverId, command: cmd, sudo });
    if (cmdEl) cmdEl.value = '';
  }

  function opsShowOpOutput(opId) {
    // Could expand to show full output — for now just request state
    vscode.postMessage({ type: 'opsGetState' });
  }

  function formatRelativeTime(ts) {
    if (!ts) return 'never';
    const delta = Math.max(0, Date.now() - ts);
    const sec = Math.floor(delta / 1000);
    if (sec < 60) return sec + 's ago';
    const min = Math.floor(sec / 60);
    if (min < 60) return min + 'm ago';
    const hr = Math.floor(min / 60);
    if (hr < 24) return hr + 'h ago';
    return Math.floor(hr / 24) + 'd ago';
  }

  return {
    // Render functions (called by messageRouter)
    opsRenderState,
    opsRenderServerList,
    opsRenderServerDetail,
    opsRenderRecentOps,
    opsRenderCommandOutput,
    // Action functions (called by HTML onclick)
    opsRequestState,
    opsAddServer,
    opsRemoveServer,
    opsSelectServer,
    opsTestConnection,
    opsHealthCheck,
    opsHardenServer,
    opsDeployService,
    opsExecuteCommand,
    opsShowOpOutput,
  };
}
