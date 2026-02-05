// @ts-nocheck

export function createUnityPanelHandlers(deps) {
  const { vscode, shipSetStatus, escapeHtml } = deps;

  let unityConnected = false;
  let unityConsoleFilters = { error: true, warn: true, log: true };
  let unityConsoleMessages = [];
  let unityCommandLoading = false;
  let unityStatusToken = 0;
  let unityStatusDebounceTimer = null;
  let unityLastStatusUpdate = 0;
  let unityStatusCheckInFlight = false;

  const unityCommands = {
    status: 'Check Unity MCP connection status and tell me the project name and current scene.',
    reload: 'Reload Unity assets and apply any code changes. Use the execute_script tool to call AssetDatabase.Refresh().',
    play: 'Start playing the game in Unity Editor.',
    stop: 'Stop playing the game in Unity Editor.',
    logs: 'Get the last 20 Unity console logs (errors and warnings).',
    errors: 'Check if there are any compile errors in the Unity project.'
  };

  const unityCommandLabels = {
    status: 'Checking connection',
    reload: 'Reloading assets',
    play: 'Starting play mode',
    stop: 'Stopping play mode',
    logs: 'Fetching logs',
    errors: 'Checking errors'
  };

  function unityCheckConnection(fromButton = false) {
    if (unityStatusCheckInFlight) {
      console.log('[SpaceCode UI] Status check already in flight, skipping');
      if (fromButton) {
        shipSetStatus('Status check already in progress...');
      }
      return;
    }

    if (unityStatusDebounceTimer) {
      clearTimeout(unityStatusDebounceTimer);
    }

    const debounceMs = fromButton ? 0 : 300;
    unityStatusDebounceTimer = setTimeout(() => {
      if (unityStatusCheckInFlight) {
        console.log('[SpaceCode UI] Status check already in flight after debounce, skipping');
        return;
      }

      unityStatusCheckInFlight = true;
      unityStatusToken++;
      const token = unityStatusToken;
      console.log('[SpaceCode UI] Starting status check, token:', token);

      const statusEl = document.getElementById('unityStatus');
      if (statusEl) {
        statusEl.className = 'unity-status checking';
        statusEl.textContent = '● Checking...';
      }
      setUnityButtonsLoading(true);

      shipSetStatus('⏳ Checking Unity connection... (request sent)');

      vscode.postMessage({ type: 'unityCheckConnection', token: token });

      setTimeout(() => {
        if (unityStatusCheckInFlight && unityStatusToken === token) {
          console.log('[SpaceCode UI] Status check timed out, clearing in-flight flag');
          unityStatusCheckInFlight = false;
          setUnityButtonsLoading(false);
        }
      }, 15000);
    }, debounceMs);
  }

  function setUnityButtonsLoading(loading) {
    unityCommandLoading = loading;
    const buttons = document.querySelectorAll('.unity-cmd-btn');
    buttons.forEach(btn => {
      btn.disabled = loading;
      btn.style.opacity = loading ? '0.5' : '1';
      btn.style.cursor = loading ? 'wait' : 'pointer';
    });
  }

  function unitySendCommand(cmd) {
    const message = unityCommands[cmd];
    if (!message) return;

    if (cmd === 'status') {
      unityCheckConnection(true);
      return;
    }

    if (unityCommandLoading) {
      shipSetStatus('Please wait, command in progress...');
      return;
    }

    setUnityButtonsLoading(true);

    const label = unityCommandLabels[cmd] || cmd;

    const statusEl = document.getElementById('unityStatus');
    if (statusEl) {
      statusEl.className = 'unity-status checking';
      statusEl.textContent = '● ' + label + '...';
    }

    shipSetStatus('⏳ ' + label + '... (request sent)');

    vscode.postMessage({
      type: 'unityCommand',
      command: cmd,
      message: message
    });

    setTimeout(() => {
      if (unityCommandLoading) {
        setUnityButtonsLoading(false);
        const statusEl = document.getElementById('unityStatus');
        if (statusEl && statusEl.textContent === '● Loading...') {
          statusEl.className = 'unity-status disconnected';
          statusEl.textContent = '● Timeout';
        }
        shipSetStatus('Command timed out');
      }
    }, 30000);
  }

  function unityRefresh() {
    unitySendCommand('reload');
  }

  function unityHeaderClick() {
    if (unityConnected) {
      unitySendCommand('reload');
    } else {
      unitySendCommand('status');
    }
  }

  function updateUnityMCPStatus(connected) {
    console.log('[SpaceCode UI] updateUnityMCPStatus called with:', connected);
    unityConnected = connected;

    const statusEl = document.getElementById('unity-status');
    if (!statusEl) {
      console.error('[SpaceCode UI] unity-status element not found');
      return;
    }
    const dotEl = statusEl.querySelector('.status-dot');
    if (!dotEl) {
      console.error('[SpaceCode UI] status-dot element not found');
      return;
    }
    if (connected) {
      dotEl.className = 'status-dot connected';
      statusEl.title = 'Unity: Connected - Click to reload assets';
    } else if (connected === false) {
      dotEl.className = 'status-dot disconnected';
      statusEl.title = 'Unity: Disconnected - Click to check status';
    } else {
      dotEl.className = 'status-dot checking';
      statusEl.title = 'Unity: Click to check status';
    }
    console.log('[SpaceCode UI] Updated unity-status dot to:', dotEl.className);
  }

  function updateUnityPanelInfo(info) {
    if (info.project) {
      const el = document.getElementById('unityProjectName');
      if (el) el.textContent = info.project;
    }
    if (info.scene) {
      const el = document.getElementById('unitySceneName');
      if (el) el.textContent = info.scene;
    }
    const lastCheck = document.getElementById('unityLastCheck');
    if (lastCheck) {
      lastCheck.textContent = new Date().toLocaleTimeString();
    }
    if (info.connected !== undefined) {
      unityConnected = info.connected;
      const statusEl = document.getElementById('unityStatus');
      if (statusEl) {
        if (info.connected) {
          statusEl.className = 'unity-status connected';
          statusEl.textContent = '● Connected';
        } else {
          statusEl.className = 'unity-status disconnected';
          statusEl.textContent = '● Disconnected';
        }
      }
      updateUnityMCPStatus(info.connected);
    }
  }

  function toggleConsoleFilter(filter) {
    unityConsoleFilters[filter] = !unityConsoleFilters[filter];
    const btn = document.querySelector('.console-filter[data-filter="' + filter + '"]');
    if (btn) btn.classList.toggle('active', unityConsoleFilters[filter]);
    renderUnityConsole();
  }

  function renderUnityConsole() {
    const log = document.getElementById('unityConsoleLog');
    if (!log) return;
    const filtered = unityConsoleMessages.filter(m => {
      if (m.type === 'Error' && unityConsoleFilters.error) return true;
      if (m.type === 'Warning' && unityConsoleFilters.warn) return true;
      if (m.type === 'Log' && unityConsoleFilters.log) return true;
      return false;
    });
    if (filtered.length === 0) {
      log.textContent = '(no messages matching filters)';
      return;
    }
    log.innerHTML = filtered.slice(-30).map(m => {
      const icon = m.type === 'Error' ? '🔴' : m.type === 'Warning' ? '🟡' : '⚪';
      return '<div style="margin-bottom:2px;">' + icon + ' ' + escapeHtml(m.message.substring(0, 200)) + '</div>';
    }).join('');
    log.scrollTop = log.scrollHeight;
  }

  function updateUnityStatus(status, token) {
    const now = Date.now();
    const statusEl = document.getElementById('unityStatus');
    const sceneInfo = document.getElementById('unitySceneInfo');

    unityStatusCheckInFlight = false;
    console.log('[SpaceCode UI] Status update received, token:', token, 'connected:', status.connected);

    if (token !== undefined && token < unityStatusToken) {
      console.log('[SpaceCode UI] Ignoring stale status update, token:', token, 'current:', unityStatusToken);
      return;
    }

    if (!status.connected && unityConnected && (now - unityLastStatusUpdate) < 2000) {
      console.log('[SpaceCode UI] Ignoring disconnected status within 2s of connected');
      return;
    }

    unityLastStatusUpdate = now;
    unityConnected = status.connected;

    if (!status.connected) {
      if (statusEl) {
        statusEl.className = 'unity-status disconnected';
        statusEl.textContent = '● Disconnected';
      }
      if (sceneInfo) sceneInfo.textContent = 'Scene: (not connected)';
      return;
    }

    if (statusEl) {
      if (status.isPlaying) {
        statusEl.className = 'unity-status playing';
        statusEl.textContent = '● Playing';
      } else if (status.isCompiling) {
        statusEl.className = 'unity-status connected';
        statusEl.textContent = '● Compiling...';
      } else {
        statusEl.className = 'unity-status connected';
        statusEl.textContent = '● Connected';
      }
    }

    if (sceneInfo) {
      sceneInfo.textContent = 'Scene: ' + (status.sceneName || '(unknown)');
    }
  }

  function updateUnityConsole(messages) {
    unityConsoleMessages = messages || [];
    renderUnityConsole();
  }

  function clearUnityConsole() {
    unityConsoleMessages = [];
    const log = document.getElementById('unityConsoleLog');
    if (log) {
      log.textContent = '(console cleared)';
    }
    shipSetStatus('Console cleared');
  }

  return {
    unityCheckConnection,
    unitySendCommand,
    unityRefresh,
    unityHeaderClick,
    updateUnityMCPStatus,
    updateUnityPanelInfo,
    toggleConsoleFilter,
    updateUnityStatus,
    updateUnityConsole,
    clearUnityConsole,
    setUnityButtonsLoading,
    getUnityConnected: () => unityConnected,
    setUnityConnected: (value) => { unityConnected = value; },
  };
}
