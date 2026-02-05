// @ts-nocheck

export function createDashboardStatsHandlers(deps) {
  const { vscode, escapeHtml } = deps;

  function updateDocsStats(stats) {
    if (stats.kbChunks !== undefined) document.getElementById('docsKbChunks')?.textContent && (document.getElementById('docsKbChunks').textContent = stats.kbChunks.toLocaleString());
    if (stats.projectDocs !== undefined) document.getElementById('docsProjectDocs')?.textContent && (document.getElementById('docsProjectDocs').textContent = stats.projectDocs.toLocaleString());
    if (stats.externalKb !== undefined) document.getElementById('docsExternalKb')?.textContent && (document.getElementById('docsExternalKb').textContent = stats.externalKb.toLocaleString());
  }

  function updateTicketStats(stats) {
    const ids = { ticketsOpen: stats.open, ticketsInProgress: stats.inProgress, ticketsDone: stats.done, ticketsTotal: stats.total };
    Object.entries(ids).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = (val || 0).toLocaleString();
    });
  }

  function updateTicketsList(tickets) {
    const list = document.getElementById('dashboardTicketsList');
    if (!list) return;
    if (!tickets || tickets.length === 0) {
      list.innerHTML = '<div class="empty-state">No tickets yet. Create one to get started.</div>';
      return;
    }
    list.innerHTML = tickets.map(t => `
        <div class="ticket-item" onclick="viewTicket('${t.id}')">
          <span class="ticket-status-badge ${t.status}"></span>
          <div class="ticket-info">
            <div class="ticket-title">${escapeHtml(t.title)}</div>
            <div class="ticket-meta">${t.sector || 'No sector'} · ${t.priority}</div>
          </div>
          <div class="ticket-actions">
            <button class="btn-sm btn-primary" onclick="event.stopPropagation(); executeTicket('${t.id}')" title="Execute">▶</button>
          </div>
        </div>
      `).join('');
  }

  function updateDbStats(stats) {
    const ids = { dbVectorCount: stats.vectors, dbChunkCount: stats.chunks };
    Object.entries(ids).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = (val || 0).toLocaleString();
    });
    const cacheEl = document.getElementById('dbCacheHitRate');
    if (cacheEl) cacheEl.textContent = (stats.cacheHitRate || 0) + '%';
    const storageEl = document.getElementById('dbStorageSize');
    if (storageEl) storageEl.textContent = formatBytes(stats.storageSize || 0);
  }

  function updateRagHealth(health) {
    const latencyEl = document.getElementById('ragLatency');
    if (latencyEl) latencyEl.textContent = (health.latency || '-') + ' ms';
    const embeddingEl = document.getElementById('ragEmbeddingStatus');
    if (embeddingEl) {
      embeddingEl.textContent = health.embeddingStatus || 'Unknown';
      embeddingEl.className = 'health-value ' + (health.embeddingStatus === 'Ready' ? 'health-good' : 'health-warn');
    }
  }

  function updateDocsPanel(stats) {
    if (!stats) return;
    const totalEl = document.getElementById('docsKbChunks');
    if (totalEl) totalEl.textContent = (stats.totalChunks || 0).toLocaleString();

    const projectEl = document.getElementById('docsProjectDocs');
    if (projectEl) projectEl.textContent = (stats.totalDocs || 0).toLocaleString();

    const embeddedEl = document.getElementById('docsExternalKb');
    if (embeddedEl) embeddedEl.textContent = (stats.embeddedDocs || 0).toLocaleString();

    const sourcesList = document.getElementById('kbSourcesList');
    if (sourcesList && stats.sources) {
      if (stats.sources.length === 0) {
        sourcesList.innerHTML = '<div class="empty-state">No KB sources yet. Ingest a URL or scan project docs.</div>';
      } else {
        sourcesList.innerHTML = stats.sources.map(s => `
            <div class="kb-source-item">
              <span class="kb-source-icon">${s.type === 'url' ? '🔗' : '📄'}</span>
              <span class="kb-source-title">${escapeHtml(s.title || s.id)}</span>
              <span class="kb-source-meta">${s.chunkCount} chunks${s.embedded ? ' ✓' : ''}</span>
            </div>
          `).join('');
      }
    }
  }

  function updateDbPanel(stats) {
    if (!stats) return;

    const vectorEl = document.getElementById('dbVectorCount');
    if (vectorEl) vectorEl.textContent = (stats.vectors?.count || 0).toLocaleString();

    const chunkEl = document.getElementById('dbChunkCount');
    if (chunkEl) chunkEl.textContent = (stats.vectors?.count || 0).toLocaleString();

    const msgCountEl = document.getElementById('dbMessageCount');
    if (msgCountEl) msgCountEl.textContent = (stats.messages?.count || 0).toLocaleString();

    const sessionsEl = document.getElementById('dbSessionCount');
    if (sessionsEl) sessionsEl.textContent = (stats.messages?.sessions || 0).toLocaleString();

    const embeddingEl = document.getElementById('ragEmbeddingStatus');
    if (embeddingEl) {
      const ready = stats.embedding?.ready;
      embeddingEl.textContent = ready ? 'Ready' : 'Not Ready';
      embeddingEl.className = 'health-value ' + (ready ? 'health-good' : 'health-warn');
    }

    const modelEl = document.getElementById('ragModelName');
    if (modelEl) modelEl.textContent = stats.embedding?.model || 'Not loaded';
  }

  function updateLogsPanel(logs, channel) {
    const logsList = document.getElementById('dashboardLogsList');
    if (!logsList) return;

    if (!logs || logs.length === 0) {
      logsList.innerHTML = '<div class="empty-state">No logs available</div>';
      return;
    }

    logsList.innerHTML = logs.map(log => {
      const levelClass = log.level === 'error' ? 'log-error' : log.level === 'warn' ? 'log-warn' : 'log-info';
      const time = new Date(log.timestamp).toLocaleTimeString();
      return `
          <div class="log-entry ${levelClass}">
            <span class="log-time">${time}</span>
            <span class="log-channel">[${log.channel}]</span>
            <span class="log-message">${escapeHtml(log.message)}</span>
          </div>
        `;
    }).join('');

    logsList.scrollTop = logsList.scrollHeight;
  }

  function refreshLogs(channel) {
    vscode.postMessage({ type: 'getLogs', channel, limit: 100 });
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  return {
    updateDocsStats,
    updateTicketStats,
    updateTicketsList,
    updateDbStats,
    updateRagHealth,
    updateDocsPanel,
    updateDbPanel,
    updateLogsPanel,
    refreshLogs,
  };
}
