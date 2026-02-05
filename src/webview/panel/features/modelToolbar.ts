// @ts-nocheck

/**
 * Model Toolbar Handlers
 *
 * IMPORTANT: Model labels are received from the backend via handleToolbarSettings().
 * DO NOT hardcode model names here - they come from src/mastercode_port/config/models.ts
 */

export function createModelToolbarHandlers(deps) {
  const { vscode, getCurrentMode, setCurrentChatProvider } = deps;

  // Default settings (will be overwritten when backend responds)
  let selectedChatMode = 'chat';
  let selectedModel = { provider: 'claude', model: 'claude-sonnet-4-5' };
  let selectedReasoning = 'medium';
  let selectedConsultant = 'gpt-4o';
  let gptConsultEnabled = false;
  let gptInterventionLevel = 'balanced';

  // Model labels - populated from backend (src/mastercode_port/config/models.ts)
  // DO NOT hardcode labels here - they come from the centralized config
  let modelLabels: Record<string, string> = {};
  let consultantLabels: Record<string, string> = {};
  let claudeModels: string[] = [];
  let gptModels: string[] = [];
  let consultantModels: string[] = [];

  function persistSettings() {
    // Save to backend unified settings file
    vscode.postMessage({
      type: 'saveToolbarSettings',
      settings: {
        chatMode: selectedChatMode,
        model: selectedModel,
        reasoning: selectedReasoning,
        consultant: selectedConsultant,
        gptConsultEnabled,
        interventionLevel: gptInterventionLevel,
      },
    });
  }

  function closeAllDropdowns() {
    document.querySelectorAll('.toolbar-dropdown').forEach(d => d.classList.remove('visible'));
  }

  function toggleToolbarDropdown(dropdownId) {
    const dropdown = document.getElementById(dropdownId);
    const allDropdowns = document.querySelectorAll('.toolbar-dropdown');
    allDropdowns.forEach(d => {
      if (d.id !== dropdownId) d.classList.remove('visible');
    });
    dropdown.classList.toggle('visible');
  }

  function selectChatMode(mode) {
    selectedChatMode = mode;
    const labels = { 'chat': 'Chat', 'agent': 'Agent', 'agent-full': 'Agent (full)' };
    const icons = {
      'chat': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"></path></svg>',
      'agent': '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="8" width="18" height="10" rx="2"></rect><circle cx="9" cy="13" r="1.5"></circle><circle cx="15" cy="13" r="1.5"></circle><path d="M12 8V5"></path><circle cx="12" cy="4" r="1"></circle></svg>',
      'agent-full': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L3 14h7l-1 8 10-12h-7z"></path></svg>'
    };

    document.getElementById('selectedModeLabel').textContent = labels[mode];
    document.getElementById('modeIcon').innerHTML = icons[mode];

    ['chat', 'agent', 'agent-full'].forEach(m => {
      document.getElementById('modeCheck-' + m).textContent = m === mode ? '✓' : '';
    });

    document.getElementById('modeDropdown').classList.remove('visible');
    vscode.postMessage({ type: 'setChatMode', mode: selectedChatMode });
    persistSettings();
  }

  function selectModel(provider, model) {
    selectedModel = { provider, model };
    // Update chat tab color when provider changes
    if (setCurrentChatProvider) {
      setCurrentChatProvider(provider);
    }

    // Use labels from backend config
    const label = modelLabels[model] || model;
    document.getElementById('selectedModelLabel').textContent = label;

    document.querySelectorAll('[id^="modelCheck-"]').forEach(el => el.textContent = '');
    const checkEl = document.getElementById('modelCheck-' + model);
    if (checkEl) checkEl.textContent = '✓';

    document.getElementById('modelDropdown').classList.remove('visible');
    vscode.postMessage({ type: 'setModel', provider, model });
    persistSettings();
  }

  function selectReasoning(level) {
    selectedReasoning = level;
    document.getElementById('selectedReasoningLabel').textContent = level.charAt(0).toUpperCase() + level.slice(1);

    ['medium', 'high'].forEach(l => {
      document.getElementById('reasoningCheck-' + l).textContent = l === level ? '✓' : '';
    });

    document.getElementById('reasoningDropdown').classList.remove('visible');
    vscode.postMessage({ type: 'setReasoning', level: selectedReasoning });
    persistSettings();
  }

  function selectConsultant(model) {
    selectedConsultant = model;

    // Use labels from backend config
    const label = consultantLabels[model] || model;
    document.getElementById('selectedConsultantLabel').textContent = label;

    consultantModels.forEach(m => {
      const checkEl = document.getElementById('consultantCheck-' + m);
      if (checkEl) checkEl.textContent = m === model ? '✓' : '';
    });

    document.getElementById('consultantDropdown').classList.remove('visible');
    vscode.postMessage({ type: 'setConsultantModel', model: selectedConsultant });
    persistSettings();
  }

  function toggleGptConsult() {
    gptConsultEnabled = !gptConsultEnabled;
    const btn = document.getElementById('gptConsultToggle');
    if (btn) {
      btn.classList.toggle('active', gptConsultEnabled);
      btn.title = gptConsultEnabled ? 'Auto GPT consultation (on)' : 'Auto GPT consultation (off)';
    }
    const selector = document.getElementById('consultantSelectorContainer');
    const divider = document.getElementById('consultantDivider');
    const intervention = document.getElementById('interventionLevelContainer');
    if (selector) selector.style.display = gptConsultEnabled ? '' : 'none';
    if (divider) divider.style.display = gptConsultEnabled ? '' : 'none';
    if (intervention) intervention.style.display = gptConsultEnabled ? '' : 'none';
    persistSettings();
  }

  function selectInterventionLevel(level) {
    gptInterventionLevel = level;
    const labels = { silent: 'Silent', balanced: 'Balanced', active: 'Active' };
    const labelEl = document.getElementById('selectedInterventionLabel');
    if (labelEl) labelEl.textContent = labels[level] || level;
    ['silent', 'balanced', 'active'].forEach(l => {
      const check = document.getElementById('interventionCheck-' + l);
      if (check) check.textContent = l === level ? '✓' : '';
    });
    closeAllDropdowns();
    persistSettings();
  }

  // Restore UI to match current settings
  function restoreToolbarUI() {
    // Restore model selection UI - use labels from backend
    const modelLabelEl = document.getElementById('selectedModelLabel');
    if (modelLabelEl) modelLabelEl.textContent = modelLabels[selectedModel.model] || selectedModel.model;
    document.querySelectorAll('[id^="modelCheck-"]').forEach(el => el.textContent = '');
    const modelCheckEl = document.getElementById('modelCheck-' + selectedModel.model);
    if (modelCheckEl) modelCheckEl.textContent = '✓';

    // Restore reasoning
    const reasoningLabelEl = document.getElementById('selectedReasoningLabel');
    if (reasoningLabelEl) reasoningLabelEl.textContent = selectedReasoning.charAt(0).toUpperCase() + selectedReasoning.slice(1);
    ['medium', 'high'].forEach(l => {
      const el = document.getElementById('reasoningCheck-' + l);
      if (el) el.textContent = l === selectedReasoning ? '✓' : '';
    });

    // Restore GPT consult toggle
    const btn = document.getElementById('gptConsultToggle');
    if (btn) {
      btn.classList.toggle('active', gptConsultEnabled);
      btn.title = gptConsultEnabled ? 'Auto GPT consultation (on)' : 'Auto GPT consultation (off)';
    }
    const selector = document.getElementById('consultantSelectorContainer');
    const divider = document.getElementById('consultantDivider');
    const intervention = document.getElementById('interventionLevelContainer');
    if (selector) selector.style.display = gptConsultEnabled ? '' : 'none';
    if (divider) divider.style.display = gptConsultEnabled ? '' : 'none';
    if (intervention) intervention.style.display = gptConsultEnabled ? '' : 'none';

    // Restore consultant model - use labels from backend
    const consultLabelEl = document.getElementById('selectedConsultantLabel');
    if (consultLabelEl) consultLabelEl.textContent = consultantLabels[selectedConsultant] || selectedConsultant;
    consultantModels.forEach(m => {
      const el = document.getElementById('consultantCheck-' + m);
      if (el) el.textContent = m === selectedConsultant ? '✓' : '';
    });

    // Restore intervention level
    const interventionLabels = { silent: 'Silent', balanced: 'Balanced', active: 'Active' };
    const interventionLabelEl = document.getElementById('selectedInterventionLabel');
    if (interventionLabelEl) interventionLabelEl.textContent = interventionLabels[gptInterventionLevel] || gptInterventionLevel;
    ['silent', 'balanced', 'active'].forEach(l => {
      const el = document.getElementById('interventionCheck-' + l);
      if (el) el.textContent = l === gptInterventionLevel ? '✓' : '';
    });

    // Update chat tab provider color
    if (setCurrentChatProvider) {
      setCurrentChatProvider(selectedModel.provider);
    }
  }

  // Handle incoming settings from backend
  function handleToolbarSettings(settings) {
    if (!settings) return;

    // Store labels from backend config
    if (settings.modelLabels) modelLabels = settings.modelLabels;
    if (settings.consultantLabels) consultantLabels = settings.consultantLabels;
    if (settings.claudeModels) claudeModels = settings.claudeModels;
    if (settings.gptModels) gptModels = settings.gptModels;
    if (settings.consultantModels) consultantModels = settings.consultantModels;

    selectedChatMode = settings.chatMode || 'chat';
    selectedModel = settings.model || { provider: 'claude', model: 'claude-sonnet-4-5' };
    selectedReasoning = settings.reasoning || 'medium';
    selectedConsultant = settings.consultant || 'gpt-4o';
    gptConsultEnabled = settings.gptConsultEnabled || false;
    gptInterventionLevel = settings.interventionLevel || 'balanced';

    restoreToolbarUI();
  }

  function updateModelToolbarForMode() {
    // Grouped dropdown: always show both provider sections
    // User can select any model regardless of current mode
    const claudeSection = document.getElementById('claudeModelsSection');
    const gptSection = document.getElementById('gptModelsSection');

    // Always show both sections for grouped dropdown
    if (claudeSection) claudeSection.style.display = 'block';
    if (gptSection) gptSection.style.display = 'block';

    // Auto-select appropriate model when mode changes (optional behavior)
    const currentMode = getCurrentMode();
    const defaultClaude = claudeModels[0] || 'claude-opus-4-5';
    const defaultGpt = gptModels[0] || 'gpt-4o';

    if (currentMode === 'claude' && selectedModel.provider !== 'claude') {
      selectModel('claude', defaultClaude);
    } else if (currentMode === 'gpt' && selectedModel.provider !== 'gpt') {
      selectModel('gpt', defaultGpt);
    }
  }

  // Request settings from backend on init
  setTimeout(() => {
    vscode.postMessage({ type: 'getToolbarSettings' });
  }, 50);

  return {
    toggleToolbarDropdown,
    selectChatMode,
    selectModel,
    selectReasoning,
    selectConsultant,
    toggleGptConsult,
    selectInterventionLevel,
    updateModelToolbarForMode,
    restoreToolbarUI,
    handleToolbarSettings,
    getSelectedModel: () => selectedModel,
    getGptConsultEnabled: () => gptConsultEnabled,
    getGptInterventionLevel: () => gptInterventionLevel,
  };
}
