// @ts-nocheck

export function createPlanHandlers(deps) {
  const {
    vscode,
    shipSetStatus,
    escapeHtml,
    getCurrentMode,
    getCurrentPlanData,
    setCurrentPlanData,
    getPlanList,
    getPlanTemplates,
    setPlanTemplates,
    setPlanList,
    showPlanExecutionPanel,
    setPlanExecutionButtonsEnabled,
  } = deps;

  function refreshPlanTemplates() {
    vscode.postMessage({ type: 'getPlanTemplates' });
  }

  function refreshPlans() {
    vscode.postMessage({ type: 'listPlans' });
  }

  function generatePlan() {
    const intentEl = document.getElementById('planIntent');
    const templateEl = document.getElementById('planTemplateSelect');
    const varsEl = document.getElementById('planTemplateVars');
    const intent = intentEl ? intentEl.value.trim() : '';
    if (!intent) {
      shipSetStatus('Plan intent is required.');
      return;
    }
    const templateId = templateEl && templateEl.value ? templateEl.value : '';
    let templateVariables = undefined;
    if (varsEl && varsEl.value.trim()) {
      try {
        templateVariables = JSON.parse(varsEl.value);
      } catch {
        shipSetStatus('Template vars must be valid JSON.');
        return;
      }
    }
    const profileSelect = document.getElementById('shipProfileSelect');
    const profileValue = profileSelect ? profileSelect.value : 'yard';
    const provider = getCurrentMode() === 'gpt' ? 'gpt' : 'claude';
    vscode.postMessage({
      type: 'generatePlan',
      intent,
      templateId: templateId || undefined,
      templateVariables,
      provider,
      profile: profileValue
    });
  }

  function saveCurrentPlan() {
    const plan = getCurrentPlanData();
    if (!plan) return;
    vscode.postMessage({ type: 'savePlan', plan });
    shipSetStatus('Plan saved.');
  }

  function usePlanForComparison() {
    const plan = getCurrentPlanData();
    if (!plan || !plan.id) return;
    vscode.postMessage({ type: 'usePlanForComparison', planId: plan.id });
  }

  function executeCurrentPlan() {
    const plan = getCurrentPlanData();
    if (!plan || !plan.id) return;
    vscode.postMessage({ type: 'executePlan', planId: plan.id });
    showPlanExecutionPanel(true);
    setPlanExecutionButtonsEnabled(false);
    shipSetStatus('Executing plan...');
  }

  function executePlanStepByStep() {
    const plan = getCurrentPlanData();
    if (!plan || !plan.id) return;
    vscode.postMessage({ type: 'executePlanStepByStep', planId: plan.id });
    showPlanExecutionPanel(true);
    setPlanExecutionButtonsEnabled(false);
    shipSetStatus('Step-by-step execution started.');
  }

  function renderPlanSummary(plan) {
    const box = document.getElementById('planSummary');
    if (!box) return;
    if (!plan) {
      box.style.display = 'none';
      box.textContent = '';
      return;
    }
    const phaseItems = Array.isArray(plan.phases) ? plan.phases : [];
    const phases = phaseItems.length;
    const steps = plan.totalSteps || 0;
    const sector = plan.primarySector ? plan.primarySector.name : 'Unknown';
    const risk = plan.impact ? plan.impact.riskLevel : 'unknown';
    const header = 'Plan: ' + escapeHtml(plan.summary || plan.intent || '') +
      ' | Sector: ' + escapeHtml(sector) +
      ' | Phases: ' + phases +
      ' | Steps: ' + steps +
      ' | Risk: ' + escapeHtml(risk);

    let html = '<div>' + header + '</div>';

    if (phases > 0) {
      html += '<div class="plan-phase-list">';
      phaseItems.forEach((phase, idx) => {
        const title = phase && phase.title ? phase.title : 'Phase ' + (idx + 1);
        const desc = phase && phase.description ? phase.description : '';
        const stepItems = phase && Array.isArray(phase.steps) ? phase.steps : [];
        const stepCount = stepItems.length;
        html += '<div class="plan-phase">';
        html += '<div class="plan-phase-title">Phase ' + (idx + 1) + ': ' + escapeHtml(title) +
          ' <span class="plan-phase-count">(' + stepCount + ' step' + (stepCount === 1 ? '' : 's') + ')</span></div>';
        if (desc) {
          html += '<div class="plan-phase-desc">' + escapeHtml(desc) + '</div>';
        }
        if (stepItems.length > 0) {
          html += '<ul class="plan-steps">';
          stepItems.forEach((step) => {
            const descText = step && (step.description || step.task || step.title || step.action) ? (step.description || step.task || step.title || step.action) : '';
            const fileText = step && step.file ? step.file : '';
            html += '<li class="plan-step">' + escapeHtml(descText);
            if (fileText) {
              html += ' <span class="plan-step-file">[' + escapeHtml(fileText) + ']</span>';
            }
            html += '</li>';
          });
          html += '</ul>';
        }
        html += '</div>';
      });
      html += '</div>';
    }
    box.style.display = 'block';
    box.innerHTML = html;
  }

  function renderPlanList(plans) {
    const listEl = document.getElementById('planList');
    if (!listEl) return;
    if (!Array.isArray(plans) || plans.length === 0) {
      listEl.textContent = 'No saved plans yet.';
      return;
    }
    listEl.innerHTML = plans.map(p => `
        <div style="display:flex; justify-content:space-between; gap:6px; padding:4px 0; border-bottom:1px solid var(--border-color);">
          <span style="color:var(--text-primary);">${escapeHtml(p.summary || p.intent || p.id)}</span>
          <span style="color:var(--text-secondary); cursor:pointer;" onclick="loadPlan('${p.id}')">Open</span>
        </div>
      `).join('');
  }

  function loadPlan(planId) {
    vscode.postMessage({ type: 'loadPlan', planId });
  }

  return {
    refreshPlanTemplates,
    refreshPlans,
    generatePlan,
    saveCurrentPlan,
    usePlanForComparison,
    executeCurrentPlan,
    executePlanStepByStep,
    renderPlanSummary,
    renderPlanList,
    loadPlan,
  };
}
