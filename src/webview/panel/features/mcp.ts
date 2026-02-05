// @ts-nocheck

export function createMcpPanelHandlers(deps) {
  const { vscode } = deps;

  let mcpServersData = [];
  let selectedMcpServer = null;

  function renderMcpServers(servers) {
    mcpServersData = Array.isArray(servers) ? servers : [];
    const container = document.getElementById('mcpServerList');
    if (!container) {
      return;
    }

    if (mcpServersData.length === 0) {
      container.innerHTML = '<p style="color: var(--text-secondary)">No MCP servers configured</p>';
      showMcpDetails(null);
      return;
    }

    container.innerHTML = [...mcpServersData].sort((a, b) => a.name.localeCompare(b.name)).map(s => `
        <div class="mcp-server-item ${selectedMcpServer === s.id ? 'selected' : ''}"
             onclick="selectMcpServer('${s.id}')" data-server-id="${s.id}">
          <div class="status-dot ${s.status || 'stopped'}"></div>
          <div class="mcp-server-info">
            <div class="name">${s.name}</div>
            <div class="transport">${s.transport}</div>
          </div>
        </div>
      `).join('');

    // If we had a selection, refresh the details
    if (selectedMcpServer) {
      const server = mcpServersData.find(s => s.id === selectedMcpServer);
      if (server) {
        showMcpDetails(server);
      }
    }
  }

  function selectMcpServer(serverId) {
    selectedMcpServer = serverId;
    const server = mcpServersData.find(s => s.id === serverId);

    // Update selection styling
    document.querySelectorAll('.mcp-server-item').forEach(el => {
      el.classList.toggle('selected', el.dataset.serverId === serverId);
    });

    showMcpDetails(server);
  }

  function showMcpDetails(server) {
    const panel = document.getElementById('mcpDetails');
    const emptyState = document.getElementById('mcpDetailsEmpty');
    if (!panel) {
      return;
    }

    if (!server) {
      panel.style.display = 'none';
      panel.innerHTML = '';
      if (emptyState) emptyState.style.display = '';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    panel.style.display = '';
    const isConnected = server.status === 'running';
    const statusColor = isConnected ? 'var(--vscode-charts-green)' : 'var(--vscode-charts-red)';
    const statusText = isConnected ? 'Connected' : 'Disconnected';

    panel.innerHTML = `
        <div class="mcp-details-header">
          <h4>${server.name}</h4>
          <div class="mcp-details-actions">
            ${server.transport === 'http' && server.url
              ? `<button class="btn-connect" onclick="mcpAction('ping', '${server.id}')">${isConnected ? 'Refresh' : 'Connect'}</button>`
              : server.command
                ? `<button class="btn-connect" onclick="mcpAction('launch', '${server.id}')">Launch</button>`
                : ''
            }
            <button class="btn-remove" onclick="mcpAction('remove', '${server.id}')">Remove</button>
          </div>
        </div>

        <div class="mcp-info-row">
          <span class="label">Status:</span>
          <span class="value" style="color: ${statusColor}">● ${statusText}</span>
        </div>
        <div class="mcp-info-row">
          <span class="label">Transport:</span>
          <span class="value">${server.transport}</span>
        </div>
        ${server.command ? `
          <div class="mcp-info-row">
            <span class="label">Command:</span>
            <span class="value" style="font-family: monospace; font-size: 11px;">${server.command}</span>
          </div>
        ` : ''}
        ${server.args && server.args.length > 0 ? `
          <div class="mcp-info-row">
            <span class="label">Args:</span>
            <span class="value" style="font-family: monospace; font-size: 11px;">${server.args.join(' ')}</span>
          </div>
        ` : ''}
        ${server.url ? `
          <div class="mcp-info-row">
            <span class="label">URL:</span>
            <span class="value">${server.url}</span>
          </div>
        ` : ''}
        ${server.description ? `
          <div class="mcp-info-row">
            <span class="label">Info:</span>
            <span class="value">${server.description}</span>
          </div>
        ` : ''}

        <div class="mcp-tools-section">
          <h5>Available Tools</h5>
          <p style="font-size: 12px; color: var(--text-secondary);">
            ${server.status === 'running'
              ? 'Tools are available when connected via Claude Code CLI.'
              : 'Connect the server to discover available tools.'}
          </p>
        </div>
      `;
  }

  function mcpAction(action, serverId) {
    vscode.postMessage({ type: 'mcpAction', action, serverId });
  }

  function addMcpServer() {
    // Send message to backend to initiate MCP server addition workflow
    vscode.postMessage({ type: 'addMcpServer' });
  }

  return {
    renderMcpServers,
    selectMcpServer,
    mcpAction,
    addMcpServer,
  };
}
