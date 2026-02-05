// @ts-nocheck

import * as vscode from 'vscode';

export async function handleAutopilotMessage(panel: any, message: any): Promise<boolean> {
  switch (message.type) {

    case 'autopilotStart': {
      const { getAutopilotEngine, initAutopilotEngine } = await import('../../../autopilot');
      const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
      if (!workspaceDir) {
        panel._postMessage({ type: 'autopilotError', error: 'No workspace open' });
        return true;
      }

      let engine = getAutopilotEngine();
      if (!engine) engine = initAutopilotEngine(workspaceDir);

      const plan = message.plan;
      const config = message.config || {};

      if (!plan) {
        panel._postMessage({ type: 'autopilotError', error: 'No plan provided' });
        return true;
      }

      // Listen for status changes
      engine.on('status-changed', (state) => {
        panel._postMessage({
          type: 'autopilotStatus',
          status: state.status,
          planId: state.planId,
          currentPhase: state.currentPhaseIndex,
          currentStep: state.currentStepIndex,
          totalPhases: state.totalPhases,
          totalSteps: state.totalSteps,
          completedSteps: state.completedSteps,
          failedSteps: state.failedSteps,
          skippedSteps: state.skippedSteps,
          activeAgent: state.activeAgent,
          usingFallback: state.usingFallback,
          error: state.error,
        });
      });

      engine.on('autopilot:step-complete', (event) => {
        panel._postMessage({
          type: 'autopilotStepResult',
          result: event.data?.result,
        });
      });

      // Start execution (async — returns immediately, runs in background)
      engine.start(plan, config).catch((err) => {
        panel._postMessage({ type: 'autopilotError', error: err?.message || 'Start failed' });
      });

      return true;
    }

    case 'autopilotPause': {
      const { getAutopilotEngine } = await import('../../../autopilot');
      const engine = getAutopilotEngine();
      if (engine) engine.pause();
      return true;
    }

    case 'autopilotResume': {
      const { getAutopilotEngine } = await import('../../../autopilot');
      const engine = getAutopilotEngine();
      if (engine) engine.unpause();
      return true;
    }

    case 'autopilotAbort': {
      const { getAutopilotEngine } = await import('../../../autopilot');
      const engine = getAutopilotEngine();
      if (engine) engine.abort();
      return true;
    }

    case 'autopilotStatus': {
      const { getAutopilotEngine, initAutopilotEngine } = await import('../../../autopilot');
      const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

      let engine = getAutopilotEngine();
      if (!engine && workspaceDir) engine = initAutopilotEngine(workspaceDir);

      if (engine) {
        const state = engine.getState();
        panel._postMessage({
          type: 'autopilotStatus',
          status: state.status,
          planId: state.planId,
          currentPhase: state.currentPhaseIndex,
          currentStep: state.currentStepIndex,
          totalPhases: state.totalPhases,
          totalSteps: state.totalSteps,
          completedSteps: state.completedSteps,
          failedSteps: state.failedSteps,
          skippedSteps: state.skippedSteps,
          activeAgent: state.activeAgent,
          usingFallback: state.usingFallback,
          error: state.error,
        });
      } else {
        panel._postMessage({
          type: 'autopilotStatus',
          status: 'idle',
          planId: null,
          currentPhase: 0,
          currentStep: 0,
          totalPhases: 0,
          totalSteps: 0,
          completedSteps: 0,
          failedSteps: 0,
          skippedSteps: 0,
          activeAgent: 'claude-cli',
          usingFallback: false,
          error: null,
        });
      }
      return true;
    }

    case 'autopilotConfig': {
      const { getAutopilotEngine } = await import('../../../autopilot');
      const engine = getAutopilotEngine();
      if (engine && message.config) {
        engine.updateConfig(message.config);
      }
      // Return current config
      if (engine) {
        const state = engine.getState();
        panel._postMessage({ type: 'autopilotConfig', config: state.config });
      }
      return true;
    }

    case 'autopilotCheckSession': {
      const { getAutopilotEngine, initAutopilotEngine } = await import('../../../autopilot');
      const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

      let engine = getAutopilotEngine();
      if (!engine && workspaceDir) engine = initAutopilotEngine(workspaceDir);

      if (engine) {
        const info = engine.getInterruptedSessionInfo();
        panel._postMessage({
          type: 'autopilotInterruptedSession',
          hasSession: !!info,
          sessionInfo: info,
        });
      } else {
        panel._postMessage({
          type: 'autopilotInterruptedSession',
          hasSession: false,
          sessionInfo: null,
        });
      }
      return true;
    }

    case 'autopilotResumeSession': {
      const { getAutopilotEngine } = await import('../../../autopilot');
      const engine = getAutopilotEngine();
      if (!engine || !message.plan) {
        panel._postMessage({ type: 'autopilotError', error: 'No engine or plan' });
        return true;
      }

      // Listen for updates
      engine.on('status-changed', (state) => {
        panel._postMessage({
          type: 'autopilotStatus',
          status: state.status,
          planId: state.planId,
          currentPhase: state.currentPhaseIndex,
          currentStep: state.currentStepIndex,
          totalPhases: state.totalPhases,
          totalSteps: state.totalSteps,
          completedSteps: state.completedSteps,
          failedSteps: state.failedSteps,
          skippedSteps: state.skippedSteps,
          activeAgent: state.activeAgent,
          usingFallback: state.usingFallback,
          error: state.error,
        });
      });

      engine.resume(message.plan).catch((err) => {
        panel._postMessage({ type: 'autopilotError', error: err?.message || 'Resume failed' });
      });

      return true;
    }

    case 'autopilotClearSession': {
      const { getAutopilotEngine } = await import('../../../autopilot');
      const engine = getAutopilotEngine();
      if (engine) engine.reset();
      panel._postMessage({
        type: 'autopilotStatus',
        status: 'idle',
        planId: null,
        currentPhase: 0,
        currentStep: 0,
        totalPhases: 0,
        totalSteps: 0,
        completedSteps: 0,
        failedSteps: 0,
        skippedSteps: 0,
        activeAgent: 'claude-cli',
        usingFallback: false,
        error: null,
      });
      return true;
    }

    default:
      return false;
  }
}
