// @ts-nocheck

import * as vscode from 'vscode';

export function createUnityImpl(panel: any) {
  async function refreshUnityStatus(): Promise<void> {
    try {
      const editorState = await getUnityEditorState();
      if (editorState) {
        panel._unityIsPlaying = editorState.isPlaying || false;
        panel._unityIsPaused = editorState.isPaused || false;
        panel._postMessage({
          type: 'unityStatus',
          status: {
            connected: true,
            isPlaying: panel._unityIsPlaying,
            isPaused: panel._unityIsPaused,
            sceneName: editorState.sceneName || 'Unknown Scene',
            isCompiling: editorState.isCompiling || false
          }
        });
        const consoleMessages = await getUnityConsole();
        panel._postMessage({
          type: 'unityConsole',
          messages: consoleMessages
        });
      } else {
        panel._postMessage({
          type: 'unityStatus',
          status: { connected: false }
        });
      }
    } catch (err) {
      console.error('[Unity Cockpit] Refresh error:', err);
      panel._postMessage({
        type: 'unityStatus',
        status: { connected: false }
      });
    }
  }

  async function getUnityEditorState(): Promise<any> {
    // Try Coplay MCP first (has richer state info)
    try {
      const result = await panel.coplayClient.getEditorState();
      if (result.success && result.data) {
        return result.data;
      }
    } catch (err) {
      console.log('[Unity Cockpit] Coplay MCP editor state failed, trying Unity MCP...');
    }

    // Fallback: try Unity MCP HTTP client
    try {
      if (panel.unityMcpClient) {
        const result = await panel.unityMcpClient.getEditorState();
        if (result.success && result.contents?.length > 0) {
          const text = result.contents[0]?.text;
          if (text) {
            try {
              return JSON.parse(text);
            } catch {
              return { connected: true };
            }
          }
        }
      }
    } catch (err) {
      console.log('[Unity Cockpit] Unity MCP editor state also failed');
    }

    return null;
  }

  async function getUnityConsole(): Promise<any[]> {
    try {
      const result = await panel.coplayClient.getLogs({ limit: 30 });
      if (result.success && result.data) {
        const data = result.data;
        if (Array.isArray(data)) {
          return data.map((entry: any) => ({
            type: entry.type || 'Log',
            message: entry.message || entry.condition || String(entry)
          }));
        } else if (typeof data === 'string') {
          return [{ type: 'Log', message: data }];
        }
      }
      return [];
    } catch (err) {
      console.error('[Unity Cockpit] Failed to get console:', err);
      return [];
    }
  }

  async function unityTogglePlay(): Promise<void> {
    try {
      const result = panel._unityIsPlaying
        ? await panel.coplayClient.stop()
        : await panel.coplayClient.play();
      if (result.success) {
        await refreshUnityStatus();
      } else {
        const action = panel._unityIsPlaying ? 'stop' : 'play';
        vscode.window.showErrorMessage(`Failed to ${action} Unity: ${result.error}`);
      }
    } catch (err) {
      vscode.window.showErrorMessage('Failed to toggle Unity play mode');
    }
  }

  async function unityTogglePause(): Promise<void> {
    try {
      vscode.window.showWarningMessage('Pause is not supported via Coplay MCP. Use Play/Stop instead.');
    } catch (err) {
      vscode.window.showErrorMessage('Failed to toggle Unity pause');
    }
  }

  async function reloadUnity(): Promise<void> {
    try {
      console.log('[Unity Cockpit] _reloadUnity called');
      panel._postMessage({ type: 'info', message: 'Refreshing Unity assets...' });

      const result = await panel.coplayClient.refreshAssets();
      console.log('[Unity Cockpit] refreshAssets result:', JSON.stringify(result));

      if (result.success) {
        console.log('[Unity Cockpit] Reload succeeded, updating status...');
        panel._postMessage({ type: 'info', message: 'Unity assets refreshed successfully' });
        console.log('[Unity Cockpit] Sending unityMCPAvailable: true');
        panel._postMessage({ type: 'unityMCPAvailable', available: true });
        await panel._sendMcpServers();
        await refreshUnityStatus();
        console.log('[Unity Cockpit] Status update complete');
      } else {
        if (result.error?.includes('timed out')) {
          console.log('[Unity Cockpit] Reload timed out but may have worked');
          panel._postMessage({ type: 'info', message: 'Unity refresh sent (response timed out - check Unity console)' });
        } else {
          console.log('[Unity Cockpit] Reload failed:', result.error);
          panel._postMessage({ type: 'error', message: `Failed to reload Unity: ${result.error}` });
        }
        await refreshUnityStatus();
      }
    } catch (err) {
      console.error('[Unity Cockpit] Reload error:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes('timed out') || errMsg.includes('canceled')) {
        panel._postMessage({ type: 'info', message: 'Unity refresh sent (response interrupted - check Unity console)' });
        setTimeout(async () => {
          await refreshUnityStatus();
        }, 2000);
      } else {
        panel._postMessage({ type: 'error', message: 'Failed to send reload command to Unity' });
        panel._postMessage({ type: 'unityMCPAvailable', available: false });
        panel._postMessage({ type: 'unityStatus', status: { connected: false } });
      }
    }
  }

  async function handleUnityCommandInternal(cmd: string): Promise<void> {
    try {
      panel._postMessage({ type: 'info', message: `Executing Unity command: ${cmd}...` });

      switch (cmd) {
        case 'status': {
          const stateResult = await panel.coplayClient.getEditorState();
          if (stateResult.success) {
            const state = stateResult.data;
            panel._postMessage({
              type: 'unityStatus',
              connected: true,
              playMode: state?.playMode,
              scene: state?.activeAssetPath
            });
            panel._postMessage({ type: 'info', message: `Unity connected. Scene: ${state?.activeAssetPath}` });
          } else {
            panel._postMessage({ type: 'unityStatus', connected: false });
            panel._postMessage({ type: 'error', message: `Unity not connected: ${stateResult.error}` });
          }
          break;
        }
        case 'reload': {
          console.log('[SpaceCode] Reload button clicked - calling refreshAssets...');
          try {
            const result = await panel.coplayClient.refreshAssets();
            console.log('[SpaceCode] refreshAssets result:', JSON.stringify(result));
            if (result.success) {
              panel._postMessage({ type: 'info', message: 'Unity reload requested! MCP will reconnect after domain reload...' });
              setTimeout(() => {
                panel._checkUnityMCPAvailable();
              }, 3000);
            } else {
              panel._postMessage({ type: 'error', message: `Reload failed: ${result.error}` });
            }
          } catch (err) {
            console.error('[SpaceCode] Reload error:', err);
            const errMsg = err instanceof Error ? err.message : String(err);
            if (errMsg.includes('canceled') || errMsg.includes('timed out')) {
              panel._postMessage({ type: 'info', message: 'Unity reload in progress - reconnecting...' });
              setTimeout(() => {
                panel._checkUnityMCPAvailable();
              }, 3000);
            } else {
              panel._postMessage({ type: 'error', message: `Reload error: ${errMsg}` });
            }
          }
          break;
        }
        case 'play': {
          const result = await panel.coplayClient.play();
          if (result.success) {
            panel._postMessage({ type: 'info', message: 'Unity play mode started' });
          } else {
            panel._postMessage({ type: 'error', message: `Play failed: ${result.error}` });
          }
          break;
        }
        case 'stop': {
          const result = await panel.coplayClient.stop();
          if (result.success) {
            panel._postMessage({ type: 'info', message: 'Unity play mode stopped' });
          } else {
            panel._postMessage({ type: 'error', message: `Stop failed: ${result.error}` });
          }
          break;
        }
        case 'logs': {
          const logsResult = await panel.coplayClient.getLogs({ limit: 20 });
          if (logsResult.success && logsResult.data) {
            panel._postMessage({ type: 'unityLogs', logs: logsResult.data });
            panel._postMessage({ type: 'info', message: 'Unity logs retrieved' });
          } else {
            panel._postMessage({ type: 'error', message: `Failed to get logs: ${logsResult.error}` });
          }
          break;
        }
        case 'errors': {
          const errorsResult = await panel.coplayClient.checkCompileErrors();
          if (errorsResult.success) {
            const hasErrors = errorsResult.data && errorsResult.data !== 'No compile errors';
            panel._postMessage({
              type: 'unityErrors',
              hasErrors,
              errors: errorsResult.data
            });
            panel._postMessage({
              type: 'info',
              message: hasErrors ? 'Compile errors found' : 'No compile errors'
            });
          } else {
            panel._postMessage({ type: 'error', message: `Failed to check errors: ${errorsResult.error}` });
          }
          break;
        }
        default:
          panel._postMessage({ type: 'error', message: `Unknown Unity command: ${cmd}` });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      panel._postMessage({ type: 'error', message: `Unity command failed: ${errorMsg}` });
    }
  }

  async function checkUnityMCPAvailable(retryCount: number = 0, token?: number): Promise<void> {
    try {
      console.log(`[SpaceCode] Checking Unity MCP availability... (attempt ${retryCount + 1}, token: ${token})`);

      const editorState = await getUnityEditorState();
      let available = editorState !== null;
      console.log('[SpaceCode] Unity MCP check via editor state:', available);

      if (!available && retryCount < 1) {
        console.log('[SpaceCode] First check failed, retrying in 1 second...');
        panel._postMessage({ type: 'info', message: 'Connecting to Unity...' });
        await new Promise(resolve => setTimeout(resolve, 1000));
        return checkUnityMCPAvailable(retryCount + 1, token);
      }

      console.log('[SpaceCode] Sending unityMCPAvailable message:', available);
      panel._postMessage({ type: 'unityMCPAvailable', available });

      if (available) {
        // Mark whichever server is connected
        if (panel.coplayClient?.isConnected()) {
          await panel.mcpManager.startServer('coplay-mcp').catch(() => {});
        }
        // Also check Unity MCP HTTP if available
        try {
          if (panel.unityMcpClient) {
            const httpPing = await panel.unityMcpClient.ping();
            if (httpPing) {
              await panel.mcpManager.startServer('unitymcp').catch(() => {});
            }
          }
        } catch { /* ignore */ }

        panel._postMessage({
          type: 'unityStatus',
          token: token,
          status: {
            connected: true,
            isPlaying: editorState.isPlaying || false,
            isPaused: editorState.isPaused || false,
            sceneName: editorState.sceneName || 'Unknown Scene',
            isCompiling: editorState.isCompiling || false
          }
        });
        panel._postMessage({ type: 'info', message: `Unity connected. Scene: ${editorState.sceneName || 'Unknown'}` });
        const consoleMessages = await getUnityConsole();
        panel._postMessage({ type: 'unityConsole', messages: consoleMessages });
      } else {
        await panel.mcpManager.stopServer('unitymcp').catch(() => {});
        await panel.mcpManager.stopServer('coplay-mcp').catch(() => {});
        panel._postMessage({ type: 'unityStatus', token: token, status: { connected: false } });
        panel._postMessage({ type: 'info', message: 'Unity not connected. Start Unity and ensure an MCP server is running.' });
      }

      await panel._sendMcpServers();
    } catch (error) {
      console.error('[SpaceCode] Unity MCP check error:', error);

      if (retryCount < 1) {
        console.log('[SpaceCode] Check errored, retrying in 1 second...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        return checkUnityMCPAvailable(retryCount + 1, token);
      }

      panel._postMessage({ type: 'unityMCPAvailable', available: false });
      panel._postMessage({ type: 'unityStatus', token: token, status: { connected: false } });
      panel._postMessage({ type: 'info', message: 'Unity connection check failed' });
      await panel.mcpManager.stopServer('unitymcp').catch(() => {});
      await panel.mcpManager.stopServer('coplay-mcp').catch(() => {});
      await panel._sendMcpServers();
    }
  }

  return {
    refreshUnityStatus,
    getUnityEditorState,
    getUnityConsole,
    unityTogglePlay,
    unityTogglePause,
    reloadUnity,
    handleUnityCommandInternal,
    checkUnityMCPAvailable,
  };
}
