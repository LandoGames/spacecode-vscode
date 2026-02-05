// @ts-nocheck

export async function handleUnityMessage(panel: any, message: any): Promise<boolean> {
  switch (message.type) {
    // Unity Cockpit handlers - Direct Coplay MCP calls
    case 'unityCommand': {
      const cmd = message.command as string;
      try {
        panel._postMessage({ type: 'info', message: `Executing Unity command: ${cmd}...` });

        switch (cmd) {
          case 'status': {
            const stateResult = await panel.coplayClient.getEditorState();
            panel._postMessage({ type: 'unityStatus', status: stateResult });
            break;
          }
          case 'reload': {
            await panel._reloadUnity();
            break;
          }
          case 'play': {
            await panel.coplayClient.playGame();
            break;
          }
          case 'stop': {
            await panel.coplayClient.stopGame();
            break;
          }
          case 'logs': {
            const logs = await panel.coplayClient.getUnityLogs({
              limit: message.limit || 100,
              search_term: message.searchTerm || '',
              show_errors: message.showErrors ?? true,
              show_warnings: message.showWarnings ?? true,
              show_logs: message.showLogs ?? true,
              show_stack_traces: message.showStackTraces ?? false,
              skip_newest_n_logs: message.skipNewestNLogs || 0,
            });
            panel._postMessage({ type: 'unityLogs', logs });
            break;
          }
          case 'errors': {
            const logs = await panel.coplayClient.getUnityLogs({
              limit: message.limit || 100,
              show_errors: true,
              show_warnings: false,
              show_logs: false,
              show_stack_traces: true,
              skip_newest_n_logs: message.skipNewestNLogs || 0,
            });
            panel._postMessage({ type: 'unityErrors', logs });
            break;
          }
        }
      } catch (err: any) {
        panel._postMessage({ type: 'unityError', error: err?.message || String(err) });
      }
      return true;
    }

    // Build Pipeline Integration (Phase 6.3)
    case 'unityBuildCheck': {
      if (!panel.coplayClient) {
        panel._postMessage({ type: 'buildResult', success: false, error: 'Coplay MCP not connected' });
        return true;
      }

      try {
        panel._postMessage({ type: 'info', message: 'Checking Unity compile status...' });
        const result = await panel.coplayClient.checkCompileErrors();

        const hasErrors = !!(result?.hasErrors || result?.errors?.length);
        const errors = result?.errors || [];

        // Emit build result
        panel._postMessage({
          type: 'buildResult',
          success: !hasErrors,
          errorCount: errors.length,
          errors: hasErrors ? errors : [],
        });

        // Play sound event
        try {
          const { SoundService } = await import('../../services/soundService');
          const sound = SoundService.getInstance();
          if (hasErrors) {
            sound.play('buildFail');
          } else {
            sound.play('buildSuccess');
          }
        } catch { /* sound not available */ }

        // Trigger engineer auto-suggest on build failure
        if (hasErrors) {
          try {
            const { getEngineerEngine } = await import('../../../engineer');
            const engine = getEngineerEngine();
            if (engine) {
              // Inject a build-failure context for the engineer
              engine.injectEvent('buildFail', {
                errorCount: errors.length,
                errors: errors.slice(0, 5).map(e => typeof e === 'string' ? e : e.message || String(e)),
              });

              const status = engine.getStatus();
              panel._postMessage({
                type: 'engineerStatus',
                health: status.health,
                alertCount: status.alertCount,
                topAction: status.topAction,
              });
              panel._postMessage({
                type: 'engineerSuggestions',
                suggestions: status.suggestions,
              });
            }
          } catch { /* engineer not available */ }
        }
      } catch (err: any) {
        panel._postMessage({ type: 'buildResult', success: false, error: err?.message || String(err) });
      }
      return true;
    }

    // Legacy Unity MCP handlers (kept for backwards compatibility)
    case 'unityCheckConnection':
      await panel._checkUnityMCPAvailable(0, message.token);
      return true;

    case 'unityRefresh':
      await panel._reloadUnity();
      return true;

    case 'unityTogglePlay':
      await panel._unityTogglePlay();
      return true;

    case 'unityTogglePause':
      await panel._unityTogglePause();
      return true;

    default:
      return false;
  }
}
