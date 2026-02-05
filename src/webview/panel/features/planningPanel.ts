// @ts-nocheck

/**
 * Planning Panel — 4-phase structured planning UI
 * Renders into #planningPanelContent in the right pane.
 * Backend state comes from PlanningSessionController via 'planningStateUpdate' messages.
 */

// Phase configs mirrored from src/planning/PlanningSessionController.ts
// (webview can't import Node modules)
const PHASE_CONFIGS = {
  study: {
    name: 'Study',
    lead: 'Nova',
    description: 'Understand the feature, gather requirements, check GDD',
    checklist: [
      'Feature requirements identified',
      'User stories defined',
      'GDD/documentation reviewed',
      'Scope boundaries clear',
      'Success criteria defined',
    ],
  },
  connect: {
    name: 'Connect',
    lead: 'Gears',
    description: 'Map to existing code, identify touch points, check SA',
    checklist: [
      'Existing code analyzed',
      'Touch points identified',
      'SA alignment verified',
      'Dependencies mapped',
      'Reuse candidates found',
    ],
  },
  plan: {
    name: 'Plan',
    lead: 'Nova',
    description: 'Break into phases, define tasks, estimate risk',
    checklist: [
      'Phases defined',
      'Tasks broken down',
      'File changes listed',
      'Risk assessment complete',
      'Dependencies noted',
    ],
  },
  review: {
    name: 'Review',
    lead: 'Index',
    description: 'Validate plan, update docs, approve',
    checklist: [
      'Plan structure valid',
      'Docs updates identified',
      'SA changes noted',
      'Approval obtained',
    ],
  },
};

const PHASE_ORDER = ['study', 'connect', 'plan', 'review'];

export function createPlanningPanelHandlers(deps) {
  const { vscode, escapeHtml, shipSetStatus } = deps;

  let currentState = null;

  function renderPlanningPanel(state) {
    currentState = state;
    const container = document.getElementById('planningPanelContent');
    if (!container) return;

    const body = container.querySelector('.planning-panel-body') || container;

    if (!state || !state.isActive || !state.session) {
      body.innerHTML = buildEmptyState();
      return;
    }

    body.innerHTML = buildActiveState(state);
    attachEventListeners();
  }

  function buildEmptyState() {
    return `<div class="planning-empty">
      <div class="planning-empty-icon">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"></path>
          <rect x="9" y="3" width="6" height="4" rx="1"></rect>
          <path d="M9 12h6"></path><path d="M9 16h6"></path>
        </svg>
      </div>
      <div class="planning-empty-title">Planning Mode</div>
      <div class="planning-empty-desc">Structured analysis before implementation.<br/>Study → Connect → Plan → Review</div>
      <div class="planning-start-form">
        <input type="text" id="planningFeatureName" class="input-field" placeholder="Feature name..." />
        <textarea id="planningFeatureDesc" class="input-field textarea" placeholder="Describe what you want to build..." rows="3"></textarea>
        <button class="btn-primary" onclick="startPlanningSession()">Start Planning Session</button>
      </div>
    </div>`;
  }

  function buildActiveState(state) {
    const session = state.session;
    let html = '';

    // --- Stepper ---
    html += '<div class="planning-stepper">';
    PHASE_ORDER.forEach((phase, idx) => {
      const phaseState = session.phases[phase];
      const isCurrent = session.currentPhase === phase;
      const statusClass = phaseState.status === 'completed' ? 'completed'
        : phaseState.status === 'skipped' ? 'skipped'
        : isCurrent ? 'active' : 'pending';

      html += `<div class="planning-step ${statusClass}">`;
      html += `<div class="step-number">${phaseState.status === 'completed' ? '✓' : idx + 1}</div>`;
      html += `<div class="step-label">${PHASE_CONFIGS[phase].name}</div>`;
      html += '</div>';
      if (idx < 3) html += '<div class="step-connector"></div>';
    });
    html += '</div>';

    // --- Feature title ---
    html += `<div class="planning-feature-title">${escapeHtml(session.feature)}</div>`;

    // --- Current Phase Detail ---
    const cp = session.currentPhase;
    const cpState = session.phases[cp];
    const config = PHASE_CONFIGS[cp];

    html += '<div class="planning-phase-detail">';
    html += `<div class="phase-header">`;
    html += `<span class="phase-name">${config.name}</span>`;
    html += `<span class="phase-lead">Lead: ${config.lead}</span>`;
    html += '</div>';
    html += `<div class="phase-description">${escapeHtml(config.description)}</div>`;

    // Checklist
    html += '<div class="planning-checklist">';
    config.checklist.forEach((item, idx) => {
      const checked = cpState.checklistCompleted && cpState.checklistCompleted[idx];
      html += `<label class="checklist-item">`;
      html += `<input type="checkbox" ${checked ? 'checked' : ''} data-checklist-idx="${idx}" />`;
      html += `<span>${escapeHtml(item)}</span>`;
      html += '</label>';
    });
    html += '</div>';

    // Gate
    const gate = (state.gates || []).find(g => g.phase === cp);
    if (gate) {
      const gateClass = gate.status === 'passed' ? 'passed'
        : gate.status === 'failed' ? 'failed' : 'pending';
      html += `<div class="planning-gate ${gateClass}">`;
      html += `<span class="gate-label">${escapeHtml(gate.name)}</span>`;
      html += `<span class="gate-status">${gate.status}</span>`;
      if (gate.status === 'pending') {
        html += `<button class="btn-secondary btn-sm" onclick="passCurrentGate()">Pass</button>`;
      }
      html += '</div>';
    }

    html += '</div>'; // phase-detail

    // --- Affected Files ---
    const files = session.affectedFiles || [];
    if (files.length > 0) {
      html += '<div class="planning-section">';
      html += '<div class="section-header">Affected Files <span class="section-count">' + files.length + '</span></div>';
      html += '<div class="affected-files-list">';
      files.forEach(f => {
        const badge = f.action === 'create' ? '+' : f.action === 'delete' ? '-' : 'M';
        const cls = f.action || 'modify';
        html += `<div class="affected-file"><span class="file-action ${cls}">${badge}</span>${escapeHtml(f.path)}</div>`;
      });
      html += '</div></div>';
    }

    // --- Risk Assessment ---
    const risk = session.riskAssessment;
    if (risk && risk.items && risk.items.length > 0) {
      html += '<div class="planning-section">';
      html += `<div class="section-header">Risk <span class="risk-badge risk-${risk.overall}">${risk.overall}</span></div>`;
      risk.items.forEach(item => {
        html += `<div class="risk-item risk-${item.level}"><span class="risk-level">${item.level}</span> ${escapeHtml(item.description)}</div>`;
      });
      html += '</div>';
    }

    // --- Actions ---
    html += '<div class="planning-actions">';
    if (state.canSkipToPhase) {
      html += `<button class="btn-secondary btn-sm" onclick="skipToPlanPhase()">Skip to Plan</button>`;
    }
    if (cp === 'plan') {
      html += `<button class="btn-secondary btn-sm" onclick="generatePlanFromSession()">Generate Plan</button>`;
    }
    if (cp !== 'review') {
      html += `<button class="btn-secondary btn-sm" onclick="advancePlanPhase()">Next Phase</button>`;
    } else {
      html += `<button class="btn-primary btn-sm" onclick="completePlanSession()">Complete</button>`;
    }
    html += `<button class="btn-secondary btn-sm" onclick="cancelPlanSession()">Cancel</button>`;
    html += '</div>';

    return html;
  }

  function attachEventListeners() {
    document.querySelectorAll('.planning-checklist input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.checklistIdx, 10);
        vscode.postMessage({ type: 'updatePlanningChecklist', index: idx, completed: e.target.checked });
      });
    });
  }

  function startPlanningSession() {
    const nameEl = document.getElementById('planningFeatureName');
    const descEl = document.getElementById('planningFeatureDesc');
    const feature = nameEl ? nameEl.value.trim() : '';
    const description = descEl ? descEl.value.trim() : '';
    if (!feature) {
      if (shipSetStatus) shipSetStatus('Feature name is required.');
      return;
    }
    vscode.postMessage({ type: 'startPlanningSession', feature, description });
  }

  function advancePlanPhase() {
    vscode.postMessage({ type: 'advancePlanPhase' });
  }

  function skipToPlanPhase() {
    vscode.postMessage({ type: 'skipToPlanPhase', targetPhase: 'plan' });
  }

  function cancelPlanSession() {
    vscode.postMessage({ type: 'cancelPlanningSession' });
  }

  function completePlanSession() {
    vscode.postMessage({ type: 'completePlanningSession' });
  }

  function passCurrentGate() {
    if (!currentState || !currentState.session) return;
    const gate = (currentState.gates || []).find(g => g.phase === currentState.session.currentPhase);
    if (gate) {
      vscode.postMessage({ type: 'passPlanningGate', gateId: gate.id });
    }
  }

  function generatePlanFromSession() {
    vscode.postMessage({ type: 'generatePlanFromSession' });
  }

  return {
    renderPlanningPanel,
    startPlanningSession,
    advancePlanPhase,
    skipToPlanPhase,
    cancelPlanSession,
    completePlanSession,
    passCurrentGate,
    generatePlanFromSession,
  };
}
