// @ts-nocheck

import * as vscode from 'vscode';
import * as path from 'path';

export async function handleEngineerMessage(panel: any, message: any): Promise<boolean> {
  switch (message.type) {

    case 'engineerRefresh': {
      // Full rescan: gather context and run all triggers
      const { getEngineerEngine, initEngineerEngine } = await import('../../../engineer');
      const { getSectorManager } = await import('../../../sectors/SectorConfig');

      const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
      if (!workspaceDir) {
        panel._postMessage({ type: 'engineerStatus', health: 'ok', alertCount: 0, topAction: 'No workspace open' });
        return true;
      }

      let engine = getEngineerEngine();
      if (!engine) engine = initEngineerEngine(workspaceDir);

      // Build trigger context from available data
      const ctx = await buildTriggerContext(panel, workspaceDir);

      const result = engine.scan(ctx);

      // Send status + suggestions
      const topAction = result.suggestions[0]
        ? `${result.suggestions[0].title} (score: ${result.suggestions[0].score})`
        : 'No pending actions';

      panel._postMessage({
        type: 'engineerStatus',
        health: result.health,
        alertCount: result.alertCount,
        topAction,
      });

      panel._postMessage({
        type: 'engineerSuggestions',
        suggestions: result.suggestions,
      });

      // Send inline prompt for critical items
      const critical = result.suggestions.filter(s => s.risk === 'high' || s.score >= 20);
      if (critical.length > 0) {
        panel._postMessage({
          type: 'engineerPrompt',
          message: critical[0].why,
          actions: ['Open', 'Dismiss'],
          suggestionId: critical[0].id,
        });
      }

      return true;
    }

    case 'engineerStatus': {
      // Return cached status without rescanning
      const { getEngineerEngine, initEngineerEngine } = await import('../../../engineer');
      const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

      let engine = getEngineerEngine();
      if (!engine && workspaceDir) engine = initEngineerEngine(workspaceDir);
      if (!engine) {
        panel._postMessage({ type: 'engineerStatus', health: 'ok', alertCount: 0, topAction: 'No workspace open' });
        return true;
      }

      const status = engine.getStatus();
      panel._postMessage({
        type: 'engineerStatus',
        health: status.health,
        alertCount: status.alertCount,
        topAction: status.topAction,
      });

      // Also send current suggestions
      panel._postMessage({
        type: 'engineerSuggestions',
        suggestions: status.suggestions,
      });

      return true;
    }

    case 'engineerAction': {
      // User acted on a suggestion: run / open / defer / dismiss
      const { getEngineerEngine } = await import('../../../engineer');
      const engine = getEngineerEngine();
      if (!engine) return true;

      const { suggestionId, action } = message;
      if (!suggestionId || !action) return true;

      // Get the suggestion before processing the action
      const state = engine.getState();
      const suggestion = state.activeSuggestions.find(s => s.id === suggestionId);

      const result = engine.handleAction(suggestionId, action);

      // If "run" — queue for autoexecute approval
      if (result.queuedForAutoexecute && suggestion) {
        const actionKey = mapSuggestionToActionKey(suggestion);
        if (actionKey) {
          panel._enqueueJob({
            id: `engineer-${suggestionId}`,
            actionKey,
            payload: { suggestion },
          });
        }
      }

      // If "open" — navigate to relevant file/location
      if (action === 'open' && suggestion) {
        await handleOpenAction(panel, suggestion);
      }

      // Send updated status + suggestions
      panel._postMessage({
        type: 'engineerStatus',
        health: result.health,
        alertCount: result.alertCount,
        topAction: result.suggestions[0]
          ? `${result.suggestions[0].title} (score: ${result.suggestions[0].score})`
          : 'No pending actions',
      });

      panel._postMessage({
        type: 'engineerSuggestions',
        suggestions: result.suggestions,
      });

      return true;
    }

    case 'engineerDelegate': {
      // Delegate to a specialist role — inject context into chat
      const role = message.role;
      if (!role) return true;

      // Load role-specific prompt from .system.md file (with inline fallback)
      let prompt;
      try {
        const { getDelegatedRolePrompt } = await import('../../../personas/PromptLoader');
        prompt = getDelegatedRolePrompt(role);
      } catch {
        prompt = `Analyze the project from the perspective of the ${role} role.`;
      }

      // Inject delegation context into chat
      panel._postMessage({
        type: 'engineerDelegated',
        role,
        prompt,
      });

      return true;
    }

    case 'engineerHistory': {
      const { getEngineerEngine } = await import('../../../engineer');
      const engine = getEngineerEngine();
      if (!engine) {
        panel._postMessage({ type: 'engineerHistory', history: [] });
        return true;
      }

      const history = engine.getHistory(message.limit || 20);
      panel._postMessage({ type: 'engineerHistory', history });
      return true;
    }

    default:
      return false;
  }
}

/** Build trigger context from panel state and workspace data */
async function buildTriggerContext(panel: any, workspaceDir: string) {
  const { getSectorManager } = await import('../../../sectors/SectorConfig');
  const sectorManager = getSectorManager();
  const allSectors = sectorManager.getAllSectors();

  // Get git diff info
  let changedFiles: string[] = [];
  let gitDiff: string | undefined;
  try {
    if (panel.gitAdapter) {
      const status = await panel.gitAdapter.getStatus();
      changedFiles = (status.files || []).map(f => f.path || f);
      gitDiff = await panel.gitAdapter.exec(['diff', '--name-only']).catch(() => '');
      if (gitDiff) {
        changedFiles = [...new Set([...changedFiles, ...gitDiff.split('\n').filter(Boolean)])];
      }
    }
  } catch { /* git not available */ }

  // Check for sector violations
  let violations = [];
  let orphanFileCount = 0;
  try {
    const checkResult = await panel.asmdefGate.check();
    if (checkResult && Array.isArray(checkResult.violations)) {
      violations = checkResult.violations.map(v => ({
        sectorId: v.sector || 'unknown',
        file: v.file || '',
        message: v.message || '',
      }));
    }
  } catch { /* no asmdef data */ }

  // Check orphan files
  try {
    const csFiles = await vscode.workspace.findFiles('**/*.cs', '{**/Library/**,**/Temp/**,**/obj/**}', 500);
    for (const f of csFiles) {
      const detected = sectorManager.detectSector(f.fsPath);
      if (!detected || detected.id === 'yard') orphanFileCount++;
    }
  } catch { /* ignore */ }

  // Check policy changes
  let policyChanged = false;
  try {
    const policyPath = path.join(workspaceDir, '.spacecode', 'asmdef-policy.json');
    if (changedFiles.some(f => f.includes('asmdef-policy') || f.includes('.asmdef'))) {
      policyChanged = true;
    }
  } catch { /* ignore */ }

  // Check for undocumented files (new files without docs)
  let undocumentedFiles: string[] = [];
  try {
    const newFiles = changedFiles.filter(f =>
      f.endsWith('.cs') || f.endsWith('.ts') || f.endsWith('.js')
    );
    // Simple heuristic: check if corresponding docs exist
    for (const f of newFiles.slice(0, 20)) {
      const base = path.basename(f, path.extname(f));
      const docsExist = changedFiles.some(d => d.includes('/docs/') && d.toLowerCase().includes(base.toLowerCase()));
      if (!docsExist) undocumentedFiles.push(f);
    }
  } catch { /* ignore */ }

  return {
    workspaceDir,
    gitDiff,
    changedFiles,
    sectorIds: allSectors.map(s => s.id),
    sectorsAvailable: allSectors.length > 0,
    orphanFileCount,
    violations,
    undocumentedFiles: undocumentedFiles.length > 0 ? undocumentedFiles : undefined,
    policyChanged,
  };
}

/** Map suggestion action type to autoexecute action key */
function mapSuggestionToActionKey(suggestion: any): string | null {
  switch (suggestion.actionType) {
    case 'validate': return 'shipRunGates';
    case 'document': return 'shipDocsStatus';
    default: return null;
  }
}

/** Handle "open" action — navigate to relevant file/location */
async function handleOpenAction(panel: any, suggestion: any) {
  switch (suggestion.actionType) {
    case 'document':
      // Open docs section
      panel._postMessage({ type: 'switchTab', tab: 'station' });
      panel._postMessage({ type: 'switchControlTab', tab: 'info' });
      break;
    case 'validate':
      // Trigger gates check
      panel._postMessage({ type: 'switchTab', tab: 'station' });
      break;
    case 'inspect':
      // Open the related sector in sector map
      if (suggestion.sectorId) {
        panel._postMessage({ type: 'switchControlTab', tab: 'sectors' });
        panel._postMessage({ type: 'sectorMapClick', sectorId: suggestion.sectorId });
      }
      break;
    case 'refactor':
      // Open sector map to show violations
      panel._postMessage({ type: 'switchControlTab', tab: 'sectors' });
      break;
  }
}
