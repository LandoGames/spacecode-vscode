// @ts-nocheck

/**
 * Game UI Pipeline Handler
 *
 * Handles webview messages for Game UI component generation,
 * theme management, and pipeline orchestration.
 */

import {
  getGameUIPipeline,
  initGameUIPipeline,
  PIPELINE_PHASES,
  PHASE_CATEGORIES,
  getAllCatalogComponents,
  DEFAULT_THEME,
} from '../../../gameui';

export async function handleGameUIMessage(panel: any, message: any): Promise<boolean> {
  switch (message.type) {

    // ─── Pipeline State ────────────────────────────────────

    case 'gameuiGetState': {
      const pipeline = getGameUIPipeline();
      const state = pipeline.getState();
      const summary = pipeline.getSummary();
      panel._postMessage({
        type: 'gameuiState',
        state,
        summary,
        phases: PIPELINE_PHASES,
        phaseCategories: PHASE_CATEGORIES,
      });
      return true;
    }

    case 'gameuiGetCatalog': {
      const components = getAllCatalogComponents();
      const category = message.category;
      const filtered = category
        ? components.filter(c => c.category === category)
        : components;
      panel._postMessage({
        type: 'gameuiCatalog',
        components: filtered,
        total: components.length,
      });
      return true;
    }

    // ─── Theme Management ──────────────────────────────────

    case 'gameuiGetThemes': {
      const pipeline = getGameUIPipeline();
      const state = pipeline.getState();
      panel._postMessage({
        type: 'gameuiThemes',
        themes: state.themes,
        activeThemeId: state.activeThemeId,
      });
      return true;
    }

    case 'gameuiSetTheme': {
      const pipeline = getGameUIPipeline();
      if (message.theme) {
        pipeline.setTheme(message.theme);
      }
      if (message.activeThemeId) {
        pipeline.setActiveTheme(message.activeThemeId);
      }
      panel._postMessage({ type: 'gameuiThemeUpdated', success: true });
      return true;
    }

    case 'gameuiGenerateThemeUSS': {
      const pipeline = getGameUIPipeline();
      try {
        const uss = await pipeline.generateThemeUSS(message.themeId);
        panel._postMessage({
          type: 'gameuiThemeGenerated',
          success: true,
          uss,
          themeId: message.themeId || pipeline.getState().activeThemeId,
        });
      } catch (err: any) {
        panel._postMessage({
          type: 'gameuiThemeGenerated',
          success: false,
          error: err?.message || 'Failed to generate USS',
        });
      }
      return true;
    }

    // ─── Component Generation ──────────────────────────────

    case 'gameuiGenerateComponent': {
      const pipeline = getGameUIPipeline();

      // Wire Coplay client if available
      if (panel.coplayClient) {
        pipeline.setCoplayClient(panel.coplayClient);
      }

      const componentId = message.componentId;
      if (!componentId) {
        panel._postMessage({ type: 'gameuiComponentResult', success: false, error: 'No component ID' });
        return true;
      }

      panel._postMessage({ type: 'gameuiComponentProgress', componentId, status: 'generating' });

      const ok = await pipeline.generatePlaceholder(componentId);
      const comp = pipeline.getComponent(componentId);

      panel._postMessage({
        type: 'gameuiComponentResult',
        success: ok,
        componentId,
        component: comp,
        error: comp?.lastError,
      });
      return true;
    }

    // ─── Phase Execution ───────────────────────────────────

    case 'gameuiRunPhase': {
      const pipeline = getGameUIPipeline();

      if (panel.coplayClient) {
        pipeline.setCoplayClient(panel.coplayClient);
      }

      const phase = message.phase;
      if (!phase || !PIPELINE_PHASES.includes(phase)) {
        panel._postMessage({ type: 'gameuiPhaseResult', success: false, error: 'Invalid phase' });
        return true;
      }

      // Listen for events
      const eventHandler = (evt) => {
        panel._postMessage({ type: 'gameuiPipelineEvent', event: evt });
      };
      pipeline.on('event', eventHandler);

      panel._postMessage({ type: 'gameuiPhaseProgress', phase, status: 'running' });

      const result = await pipeline.runPhase(phase);
      pipeline.off('event', eventHandler);

      // Save state
      const workspaceDir = panel._workspaceDir || panel._context?.extensionPath;
      if (workspaceDir) {
        await pipeline.saveState(workspaceDir);
      }

      panel._postMessage({
        type: 'gameuiPhaseResult',
        success: true,
        phase,
        ...result,
        summary: pipeline.getSummary(),
      });
      return true;
    }

    case 'gameuiRunAll': {
      const pipeline = getGameUIPipeline();

      if (panel.coplayClient) {
        pipeline.setCoplayClient(panel.coplayClient);
      }

      const eventHandler = (evt) => {
        panel._postMessage({ type: 'gameuiPipelineEvent', event: evt });
      };
      pipeline.on('event', eventHandler);

      panel._postMessage({ type: 'gameuiPipelineProgress', status: 'running' });

      await pipeline.runAll();
      pipeline.off('event', eventHandler);

      const workspaceDir = panel._workspaceDir || panel._context?.extensionPath;
      if (workspaceDir) {
        await pipeline.saveState(workspaceDir);
      }

      panel._postMessage({
        type: 'gameuiPipelineComplete',
        summary: pipeline.getSummary(),
      });
      return true;
    }

    case 'gameuiStop': {
      const pipeline = getGameUIPipeline();
      pipeline.stop();
      panel._postMessage({ type: 'gameuiStopped' });
      return true;
    }

    // ─── Config ────────────────────────────────────────────

    case 'gameuiGetConfig': {
      const pipeline = getGameUIPipeline();
      panel._postMessage({
        type: 'gameuiConfig',
        config: pipeline.getConfig(),
      });
      return true;
    }

    case 'gameuiUpdateConfig': {
      const pipeline = getGameUIPipeline();
      pipeline.updateConfig(message.config || {});
      panel._postMessage({ type: 'gameuiConfigUpdated', success: true });
      return true;
    }

    // ─── State Persistence ─────────────────────────────────

    case 'gameuiSaveState': {
      const pipeline = getGameUIPipeline();
      const workspaceDir = panel._workspaceDir || panel._context?.extensionPath;
      if (workspaceDir) {
        await pipeline.saveState(workspaceDir);
        panel._postMessage({ type: 'gameuiStateSaved', success: true });
      } else {
        panel._postMessage({ type: 'gameuiStateSaved', success: false, error: 'No workspace' });
      }
      return true;
    }

    case 'gameuiLoadState': {
      const pipeline = getGameUIPipeline();
      const workspaceDir = panel._workspaceDir || panel._context?.extensionPath;
      if (workspaceDir) {
        const loaded = await pipeline.loadState(workspaceDir);
        panel._postMessage({
          type: 'gameuiStateLoaded',
          success: loaded,
          state: loaded ? pipeline.getState() : undefined,
          summary: loaded ? pipeline.getSummary() : undefined,
        });
      } else {
        panel._postMessage({ type: 'gameuiStateLoaded', success: false });
      }
      return true;
    }

    // ─── Component Status Update ───────────────────────────

    case 'gameuiUpdateComponentStatus': {
      const pipeline = getGameUIPipeline();
      const { componentId, status, extra } = message;
      if (componentId && status) {
        pipeline.updateComponentStatus(componentId, status, extra);
        panel._postMessage({
          type: 'gameuiComponentUpdated',
          componentId,
          component: pipeline.getComponent(componentId),
        });
      }
      return true;
    }

    default:
      return false;
  }
}
