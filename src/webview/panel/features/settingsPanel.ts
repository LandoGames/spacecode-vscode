// @ts-nocheck

export function createSettingsPanelHandlers(deps) {
  const {
    vscode,
    currentSettings,
    updateTokenBar,
    getCurrentChatId,
    showToast,
  } = deps;

  const panelTitles = {
    'mcp': 'MCP Servers',
    'kb': 'Knowledge Base',
    'costs': 'Costs',
    'voice': 'Voice',
    'logs': 'Logs',
    'settings': 'Settings'
  };

  function installOutsideClickHandler() {
    document.addEventListener('click', (e) => {
      const logsDropdown = document.getElementById('logsDropdown');
      const containers = document.querySelectorAll('.settings-dropdown-container');
      let clickedInside = false;
      containers.forEach(c => { if (c.contains(e.target)) clickedInside = true; });
      if (!clickedInside) {
        logsDropdown?.classList.remove('visible');
      }

      const toolbarItems = document.querySelectorAll('.toolbar-item');
      let clickedInToolbar = false;
      toolbarItems.forEach(item => { if (item.contains(e.target)) clickedInToolbar = true; });
      if (!clickedInToolbar) {
        document.querySelectorAll('.toolbar-dropdown').forEach(d => d.classList.remove('visible'));
      }
    });
  }

  function showSettingsPanel(panelName) {
    const overlay = document.getElementById('settingsPanelOverlay');
    overlay.classList.add('visible');
    switchSettingsTab(panelName);
  }

  function switchSettingsTab(panelName) {
    document.querySelectorAll('.settings-tab').forEach(tab => {
      tab.classList.remove('active');
      if (tab.dataset.panel === panelName) {
        tab.classList.add('active');
      }
    });

    document.querySelectorAll('.settings-panel-content').forEach(p => p.style.display = 'none');
    const panel = document.getElementById(`panel-${panelName}`);
    if (panel) panel.style.display = 'block';

    if (panelName === 'mcp') vscode.postMessage({ type: 'getMcpServers' });
    if (panelName === 'kb') vscode.postMessage({ type: 'getKbEntries' });
    if (panelName === 'costs') vscode.postMessage({ type: 'getCosts' });
    if (panelName === 'voice') vscode.postMessage({ type: 'getVoiceSettings' });
    if (panelName === 'settings') {
      vscode.postMessage({ type: 'getSettings' });
      vscode.postMessage({ type: 'getCliStatus' });
      vscode.postMessage({ type: 'getSoundSettings' });
    }
  }

  function closeSettingsPanel() {
    document.getElementById('settingsPanelOverlay').classList.remove('visible');
  }

  function showTab(tabName) {
    showSettingsPanel(tabName);
  }

  function handleGitAction() {
    const repoUrl = document.getElementById('gitRepoUrl')?.value || '';
    const branch = document.getElementById('gitBranch')?.value || 'main';
    const commitMessage = document.getElementById('gitCommitMessage')?.value || '';
    const autoPush = document.getElementById('gitAutoPush')?.checked !== false;

    if (!repoUrl) {
      vscode.postMessage({
        type: 'showError',
        message: 'Please configure Git settings first (Settings → Git Settings)'
      });
      return;
    }

    vscode.postMessage({
      type: 'gitAction',
      settings: { repoUrl, branch, commitMessage, autoPush }
    });
  }

  function saveConnectionMethods() {
    const claudeSelect = document.getElementById('settingsClaudeConnection') as HTMLSelectElement | null;
    const gptSelect = document.getElementById('settingsGptConnection') as HTMLSelectElement | null;
    const claudeMethod = claudeSelect?.value || 'api';
    const gptMethod = gptSelect?.value || 'api';
    vscode.postMessage({ type: 'saveConnectionMethods', claudeMethod, gptMethod });
  }

  // Called when user changes connection method via select dropdown
  function onConnectionMethodChange(provider: string, method: string) {
    currentSettings[provider === 'claude' ? 'claudeConnectionMethod' : 'gptConnectionMethod'] = method;
    updateConnectionHint(provider, method);

    // Save the change
    saveConnectionMethods();
    showToast(`${provider === 'claude' ? 'Claude' : 'OpenAI'} connection method updated`, 'success');
  }

  // Update hint text for connection method
  function updateConnectionHint(provider: string, method: string) {
    const hintEl = document.getElementById(`${provider}ConnectionHint`);
    if (hintEl) {
      if (method === 'cli') {
        hintEl.textContent = provider === 'claude'
          ? '✓ Uses Claude CLI'
          : '✓ Uses OpenAI CLI for API access';
      } else {
        hintEl.textContent = '⚡ Direct API calls — required for image uploads';
      }
    }
  }

  // Called when user clicks CLI install/login button
  function handleCliAction(cli: string) {
    const statusEl = document.getElementById(`${cli}CliStatus`);
    const isInstalled = statusEl?.classList.contains('installed');

    if (isInstalled) {
      vscode.postMessage({ type: 'openTerminalForLogin', cli });
    } else {
      vscode.postMessage({ type: 'installCli', cli });
    }
  }

  function loadConnectionMethods(settings) {
    if (!settings) return;
    const devSection = document.getElementById('devPricingSection');
    if (devSection) {
      devSection.style.display = settings.isDev ? 'block' : 'none';
    }
    const devExportSection = document.getElementById('devExportSection');
    if (devExportSection) {
      devExportSection.style.display = settings.isDev ? 'block' : 'none';
    }
    currentSettings.claudeConnectionMethod = settings.claudeConnectionMethod || currentSettings.claudeConnectionMethod;
    currentSettings.gptConnectionMethod = settings.gptConnectionMethod || currentSettings.gptConnectionMethod;
    if (settings.claudeModel) currentSettings.claudeModel = settings.claudeModel;
    if (settings.gptModel) currentSettings.gptModel = settings.gptModel;

    // Default to 'cli' when available (preferred method)
    const claudeMethod = settings.claudeConnectionMethod || 'cli';
    const gptMethod = settings.gptConnectionMethod || 'cli';

    // Update select dropdowns
    const claudeSelect = document.getElementById('settingsClaudeConnection') as HTMLSelectElement | null;
    const gptSelect = document.getElementById('settingsGptConnection') as HTMLSelectElement | null;

    if (claudeSelect) claudeSelect.value = claudeMethod;
    if (gptSelect) gptSelect.value = gptMethod;

    // Update hints using shared function
    updateConnectionHint('claude', claudeMethod);
    updateConnectionHint('gpt', gptMethod);

    const maxTurnsSelect = document.getElementById('maxTurnsSelect');
    const responseStyleSelect = document.getElementById('responseStyleSelect');
    const autoSummarizeCheck = document.getElementById('autoSummarizeCheck');

    if (maxTurnsSelect) maxTurnsSelect.value = String(settings.maxTurns || 4);
    if (responseStyleSelect) responseStyleSelect.value = settings.mastermindResponseStyle || 'concise';
    if (autoSummarizeCheck) autoSummarizeCheck.checked = settings.mastermindAutoSummarize !== false;

    updateTokenBar(getCurrentChatId());
  }

  function saveMastermindSettings() {
    const maxTurns = parseInt(document.getElementById('maxTurnsSelect').value, 10);
    const responseStyle = document.getElementById('responseStyleSelect').value;
    const autoSummarize = document.getElementById('autoSummarizeCheck').checked;
    vscode.postMessage({ type: 'saveMastermindSettings', maxTurns, responseStyle, autoSummarize });
  }

  function refreshCliStatus() {
    vscode.postMessage({ type: 'getCliStatus' });
  }

  function refreshOpenaiModels() {
    vscode.postMessage({ type: 'getOpenaiModels' });
  }

  function applyPricingOverride() {
    const text = (document.getElementById('devPricingText') as HTMLTextAreaElement | null)?.value || '';
    const statusEl = document.getElementById('devPricingStatus');
    if (!text.trim()) {
      if (statusEl) statusEl.textContent = 'Text is required.';
      return;
    }
    vscode.postMessage({ type: 'updateModelOverride', text });
  }

  function refreshPricingOverrides() {
    vscode.postMessage({ type: 'getModelOverrides' });
  }

  function renderCliStatus(status) {
    // Update the compact CLI status panel in Connection Methods section
    const claudeCliStatusEl = document.getElementById('claudeCliStatus');
    const gptCliStatusEl = document.getElementById('gptCliStatus');
    const claudeCliActionEl = document.getElementById('claudeCliAction');
    const gptCliActionEl = document.getElementById('gptCliAction');

    // Handle missing or malformed status
    if (!status) {
      console.warn('[Settings] renderCliStatus called with no status');
      if (claudeCliStatusEl) {
        claudeCliStatusEl.className = 'cli-status error';
        claudeCliStatusEl.textContent = 'Error checking status';
      }
      if (gptCliStatusEl) {
        gptCliStatusEl.className = 'cli-status error';
        gptCliStatusEl.textContent = 'Error checking status';
      }
      return;
    }

    // Claude CLI status
    const claudeStatus = status.claude || {};
    if (claudeCliStatusEl) {
      claudeCliStatusEl.className = 'cli-status ' + (claudeStatus.installed ? 'installed' : 'not-installed');
      claudeCliStatusEl.textContent = claudeStatus.installed
        ? (claudeStatus.loggedIn ? `✓ Ready ${claudeStatus.version || ''}` : `Installed - Login required`)
        : 'Not installed';
    }
    if (claudeCliActionEl) {
      claudeCliActionEl.style.display = 'inline-block';
      claudeCliActionEl.textContent = claudeStatus.installed ? 'Login' : 'Install';
    }

    // GPT/Codex CLI status
    const codexStatus = status.codex || {};
    if (gptCliStatusEl) {
      gptCliStatusEl.className = 'cli-status ' + (codexStatus.installed ? 'installed' : 'not-installed');
      gptCliStatusEl.textContent = codexStatus.installed
        ? (codexStatus.loggedIn ? `✓ Ready ${codexStatus.version || ''}` : `Installed - Auth required`)
        : 'Not installed';
    }
    if (gptCliActionEl) {
      gptCliActionEl.style.display = 'inline-block';
      gptCliActionEl.textContent = codexStatus.installed ? 'Auth' : 'Install';
    }

    // Also update the legacy container if it exists
    const container = document.getElementById('cliStatusContainer');
    if (!container) return;

    container.innerHTML = `
        <div class="cli-status-card">
          <div class="cli-status-info">
            <div class="cli-status-icon claude">C</div>
            <div class="cli-status-details">
              <h4>Claude CLI</h4>
              <div class="cli-status-badges">
                ${claudeStatus.installed
                  ? `<span class="cli-badge installed">Installed ${claudeStatus.version || ''}</span>`
                  : '<span class="cli-badge not-installed">Not Installed</span>'
                }
                ${claudeStatus.installed && claudeStatus.loggedIn
                  ? '<span class="cli-badge logged-in">Logged In</span>'
                  : claudeStatus.installed
                    ? '<span class="cli-badge not-logged-in">Not Logged In</span>'
                    : ''
                }
              </div>
            </div>
          </div>
          <div class="cli-status-actions">
            ${!claudeStatus.installed
              ? '<button class="btn-primary" onclick="installCli(\'claude\')">Install</button>'
              : !claudeStatus.loggedIn
                ? '<button class="btn-primary" onclick="loginCli(\'claude\')">Login</button>'
                : '<button class="btn-secondary" onclick="loginCli(\'claude\')">Re-login</button>'
            }
          </div>
        </div>

        <div class="cli-status-card">
          <div class="cli-status-info">
            <div class="cli-status-icon codex">G</div>
            <div class="cli-status-details">
              <h4>Codex CLI (GPT)</h4>
              <div class="cli-status-badges">
                ${codexStatus.installed
                  ? `<span class="cli-badge installed">Installed ${codexStatus.version || ''}</span>`
                  : '<span class="cli-badge not-installed">Not Installed</span>'
                }
                ${codexStatus.installed && codexStatus.loggedIn
                  ? '<span class="cli-badge logged-in">Ready</span>'
                  : codexStatus.installed
                    ? '<span class="cli-badge not-logged-in">Auth Required</span>'
                    : ''
                }
              </div>
            </div>
          </div>
          <div class="cli-status-actions">
            ${!codexStatus.installed
              ? '<button class="btn-primary" onclick="installCli(\'codex\')">Install</button>'
              : '<button class="btn-secondary" onclick="loginCli(\'codex\')">Auth</button>'
            }
          </div>
        </div>

        <p class="method-description" style="margin-top: 8px;">
          <strong>Install commands:</strong><br>
          Claude: <code>npm install -g @anthropic-ai/claude-code</code><br>
          Codex: <code>npm install -g @openai/codex</code>
        </p>
      `;
  }

  function installCli(cli) {
    vscode.postMessage({ type: 'installCli', cli });
  }

  function loginCli(cli) {
    vscode.postMessage({ type: 'openTerminalForLogin', cli });
  }

  function saveApiKeys() {
    const claudeEl = document.getElementById('settingsClaudeKey') as HTMLInputElement | null;
    const openaiEl = document.getElementById('settingsGptKey') as HTMLInputElement | null;
    const claude = claudeEl?.value || '';
    const openai = openaiEl?.value || '';
    vscode.postMessage({ type: 'saveApiKeys', claude, openai });
    showToast('API keys saved', 'success');
  }

  // Track which keys are currently revealed (to handle backend response)
  const revealedKeys: { claude: boolean; openai: boolean } = { claude: false, openai: false };

  function toggleApiKeyVisibility(provider: 'claude' | 'openai') {
    const inputId = provider === 'claude' ? 'settingsClaudeKey' : 'settingsGptKey';
    const buttonId = provider === 'claude' ? 'claudeKeyReveal' : 'gptKeyReveal';
    const input = document.getElementById(inputId) as HTMLInputElement | null;
    const button = document.getElementById(buttonId) as HTMLButtonElement | null;

    if (!input || !button) return;

    if (input.type === 'password') {
      // Request the actual key from backend
      revealedKeys[provider] = true;
      vscode.postMessage({ type: 'getApiKeyValue', provider });
      input.type = 'text';
      button.textContent = 'Hide';
    } else {
      // Hide the key - clear the value and reset to password
      revealedKeys[provider] = false;
      input.value = '';
      input.type = 'password';
      button.textContent = 'Show';
    }
  }

  function handleApiKeyValue(provider: 'claude' | 'openai', value: string) {
    if (!revealedKeys[provider]) return; // User toggled hide before response arrived

    const inputId = provider === 'claude' ? 'settingsClaudeKey' : 'settingsGptKey';
    const input = document.getElementById(inputId) as HTMLInputElement | null;

    if (input && input.type === 'text') {
      input.value = value || '';
      if (!value) {
        showToast(`No ${provider === 'claude' ? 'Claude' : 'OpenAI'} API key stored`, 'info');
      }
    }
  }

  function saveGitSettings() {
    const repoUrl = document.getElementById('gitRepoUrl').value;
    const branch = document.getElementById('gitBranch').value || 'main';
    const commitMessage = document.getElementById('gitCommitMessage').value;
    const autoPush = document.getElementById('gitAutoPush').checked;
    vscode.postMessage({
      type: 'saveGitSettings',
      settings: { repoUrl, branch, commitMessage, autoPush }
    });
  }

  function loadGitSettings(settings) {
    const repoUrlInput = document.getElementById('gitRepoUrl');
    const branchInput = document.getElementById('gitBranch');
    const commitInput = document.getElementById('gitCommitMessage');
    const autoPushInput = document.getElementById('gitAutoPush');
    if (!repoUrlInput || !branchInput || !commitInput || !autoPushInput) {
      return;
    }

    if (settings) {
      repoUrlInput.value = settings.repoUrl || '';
      branchInput.value = settings.branch || '';
      commitInput.value = settings.commitMessage || '';
      autoPushInput.checked = settings.autoPush !== false;

      const repoUrlSource = document.getElementById('gitRepoUrlSource');
      const branchSource = document.getElementById('gitBranchSource');
      const repoUrlDetected = document.getElementById('gitRepoUrlDetected');
      const branchDetected = document.getElementById('gitBranchDetected');

      if (settings.hasRepoUrlOverride) {
        repoUrlSource.textContent = '(overridden)';
        repoUrlSource.style.color = '#f59e0b';
        repoUrlDetected.textContent = settings.detectedRepoUrl ? 'Detected: ' + settings.detectedRepoUrl : '';
      } else if (settings.detectedRepoUrl) {
        repoUrlSource.textContent = '(auto-detected)';
        repoUrlSource.style.color = '#22c55e';
        repoUrlDetected.textContent = '';
      } else {
        repoUrlSource.textContent = '(not detected)';
        repoUrlSource.style.color = 'var(--text-secondary)';
        repoUrlDetected.textContent = '';
      }

      if (settings.hasBranchOverride) {
        branchSource.textContent = '(overridden)';
        branchSource.style.color = '#f59e0b';
        branchDetected.textContent = settings.detectedBranch ? 'Detected: ' + settings.detectedBranch : '';
      } else if (settings.detectedBranch) {
        branchSource.textContent = '(auto-detected)';
        branchSource.style.color = '#22c55e';
        branchDetected.textContent = '';
      } else {
        branchSource.textContent = '';
        branchDetected.textContent = '';
      }
    }
  }

  function clearGitOverrides() {
    vscode.postMessage({
      type: 'saveGitSettings',
      settings: { repoUrl: '', branch: '', commitMessage: '', autoPush: true }
    });
    setTimeout(() => {
      vscode.postMessage({ type: 'getSettings' });
    }, 100);
  }

  function showLogChannel(channel) {
    document.getElementById('logsDropdown')?.classList.remove('visible');
    vscode.postMessage({ type: 'showLogChannel', channel });
  }

  function clearAllLogs() {
    document.getElementById('logsDropdown')?.classList.remove('visible');
    vscode.postMessage({ type: 'clearAllLogs' });
  }

  function openTerminal() {
    document.getElementById('logsDropdown')?.classList.remove('visible');
    vscode.postMessage({ type: 'openTerminal' });
  }

  function openDevTools() {
    document.getElementById('logsDropdown')?.classList.remove('visible');
    vscode.postMessage({ type: 'openDevTools' });
  }

  function reloadPanel() {
    vscode.postMessage({ type: 'reloadPanel' });
  }

  function selectMcpServer(serverName) {
    vscode.postMessage({ type: 'getMcpServerDetails', name: serverName });
  }

  function rebuildIndex() {
    if (confirm('Rebuild the entire index? This may take some time.')) {
      vscode.postMessage({ type: 'rebuildIndex' });
      showToast('Rebuilding index...', 'info');
    }
  }

  function clearCache() {
    if (confirm('Clear all cached data?')) {
      vscode.postMessage({ type: 'clearCache' });
      showToast('Cache cleared', 'success');
    }
  }

  function confirmResetDb() {
    if (confirm('This will DELETE all vectors. Are you sure?')) {
      const response = prompt('Type RESET to confirm:');
      if (response === 'RESET') {
        vscode.postMessage({ type: 'resetDatabase' });
        showToast('Database reset', 'warning');
      }
    }
  }

  function loadSettings() {
    vscode.postMessage({ type: 'getSettings' });
    initSettingsListeners();
  }

  function saveSettings() {
    const settings = {
      claudeApiKey: document.getElementById('settingsClaudeKey')?.value || '',
      gptApiKey: document.getElementById('settingsGptKey')?.value || '',
      maxTokens: parseInt(document.getElementById('settingsMaxTokens')?.value) || 8000,
      budgetMessages: parseInt(document.getElementById('budgetMessages')?.value) || 30,
      budgetChunks: parseInt(document.getElementById('budgetChunks')?.value) || 50,
      budgetKb: parseInt(document.getElementById('budgetKb')?.value) || 15,
      budgetSystem: parseInt(document.getElementById('budgetSystem')?.value) || 5,
      autoExecute: document.getElementById('settingsAutoExecute')?.checked || false,
      autoClose: document.getElementById('settingsAutoClose')?.checked !== false,
      injectRules: document.getElementById('settingsInjectRules')?.checked !== false,
      defaultModel: document.getElementById('settingsDefaultModel')?.value || 'claude',
      priorityOrder: Array.from(document.querySelectorAll('.priority-item')).map(i => i.dataset.priority),
    };
    vscode.postMessage({ type: 'saveSettings', settings });
    showToast('Settings saved', 'success');
  }

  function initSettingsListeners() {
    ['budgetMessages', 'budgetChunks', 'budgetKb', 'budgetSystem'].forEach(id => {
      const slider = document.getElementById(id);
      const display = document.getElementById(id + 'Value');
      if (slider && display) {
        slider.addEventListener('input', () => { display.textContent = slider.value + '%'; });
      }
    });
    initPriorityDragDrop();
  }

  function initPriorityDragDrop() {
    const list = document.getElementById('priorityList');
    if (!list) return;
    let draggedItem = null;
    list.querySelectorAll('.priority-item').forEach(item => {
      item.addEventListener('dragstart', () => { draggedItem = item; item.classList.add('dragging'); });
      item.addEventListener('dragend', () => { item.classList.remove('dragging'); draggedItem = null; });
      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (draggedItem && draggedItem !== item) {
          const rect = item.getBoundingClientRect();
          if (e.clientY < rect.top + rect.height / 2) list.insertBefore(draggedItem, item);
          else list.insertBefore(draggedItem, item.nextSibling);
        }
      });
    });
  }

  function confirmResetSettings() {
    if (confirm('Reset all settings to defaults?')) {
      vscode.postMessage({ type: 'resetSettings' });
      loadSettings();
      showToast('Settings reset to defaults', 'info');
    }
  }

  function confirmClearAllData() {
    if (confirm('This will DELETE all data. Are you sure?')) {
      const response = prompt('Type DELETE to confirm:');
      if (response === 'DELETE') {
        vscode.postMessage({ type: 'clearAllData' });
        showToast('All data cleared', 'warning');
      }
    }
  }

  function updateSettings(settings) {
    // Update API key status indicators
    const claudeStatus = document.getElementById('claudeKeyStatus');
    const gptStatus = document.getElementById('gptKeyStatus');
    const claudeInput = document.getElementById('settingsClaudeKey') as HTMLInputElement | null;
    const gptInput = document.getElementById('settingsGptKey') as HTMLInputElement | null;

    if (claudeStatus) {
      claudeStatus.textContent = settings.hasClaudeKey ? '✓ Configured' : 'Not set';
      claudeStatus.className = 'key-status ' + (settings.hasClaudeKey ? 'valid' : '');
    }
    if (gptStatus) {
      // Backend sends hasOpenaiKey, not hasGptKey
      const hasKey = settings.hasOpenaiKey || settings.hasGptKey;
      gptStatus.textContent = hasKey ? '✓ Configured' : 'Not set';
      gptStatus.className = 'key-status ' + (hasKey ? 'valid' : '');
    }

    // Update placeholder text based on whether key exists
    if (claudeInput) {
      claudeInput.placeholder = settings.hasClaudeKey ? '••••••••••••' : 'sk-ant-...';
    }
    if (gptInput) {
      const hasKey = settings.hasOpenaiKey || settings.hasGptKey;
      gptInput.placeholder = hasKey ? '••••••••••••' : 'sk-...';
    }
    const maxTokensEl = document.getElementById('settingsMaxTokens');
    if (maxTokensEl) maxTokensEl.value = settings.maxTokens || 8000;
    [{ id: 'budgetMessages', val: settings.budgetMessages || 30 }, { id: 'budgetChunks', val: settings.budgetChunks || 50 }, { id: 'budgetKb', val: settings.budgetKb || 15 }, { id: 'budgetSystem', val: settings.budgetSystem || 5 }].forEach(({ id, val }) => {
      const slider = document.getElementById(id);
      const display = document.getElementById(id + 'Value');
      if (slider) slider.value = val;
      if (display) display.textContent = val + '%';
    });
    const autoExecEl = document.getElementById('settingsAutoExecute');
    const autoCloseEl = document.getElementById('settingsAutoClose');
    const injectEl = document.getElementById('settingsInjectRules');
    if (autoExecEl) autoExecEl.checked = settings.autoExecute || false;
    if (autoCloseEl) autoCloseEl.checked = settings.autoClose !== false;
    if (injectEl) injectEl.checked = settings.injectRules !== false;
    const modelEl = document.getElementById('settingsDefaultModel');
    if (modelEl) modelEl.value = settings.defaultModel || 'claude';

    // Update model dropdowns from toolbar settings
    if (settings.claudeModel) {
      const claudeModelEl = document.getElementById('settingsClaudeModel');
      if (claudeModelEl) claudeModelEl.value = settings.claudeModel;
    }
    if (settings.gptModel) {
      const gptModelEl = document.getElementById('settingsGptModel');
      if (gptModelEl) gptModelEl.value = settings.gptModel;
    }
    if (settings.consultantModel) {
      const consultantEl = document.getElementById('settingsConsultantModel');
      if (consultantEl) consultantEl.value = settings.consultantModel;
    }
  }

  // Called when user changes model in Dashboard Settings
  function onSettingsModelChange(provider, modelId) {
    // Post to backend to save and sync with toolbar
    vscode.postMessage({
      type: 'setModel',
      provider,
      model: modelId,
    });
    showToast(`${provider === 'claude' ? 'Claude' : 'GPT'} model updated`, 'success');
  }

  // Called when user changes consultant model in Dashboard Settings
  function onSettingsConsultantChange(modelId) {
    vscode.postMessage({
      type: 'setConsultantModel',
      model: modelId,
    });
    showToast('Consultant model updated', 'success');
  }

  function renderCosts(data) {
    const container = document.getElementById('costsContent');
    container.innerHTML = `
        <div class="list-item">
          <div><strong>Today</strong></div>
          <div>$${data.today.totalCost.toFixed(4)} (${data.today.recordCount} calls)</div>
        </div>
        <div class="list-item">
          <div><strong>This Month</strong></div>
          <div>$${data.month.totalCost.toFixed(4)} (${data.month.recordCount} calls)</div>
        </div>
        <div class="list-item">
          <div><strong>All Time</strong></div>
          <div>$${data.all.totalCost.toFixed(4)} (${data.all.recordCount} calls)</div>
        </div>
        <h4 style="margin: 20px 0 10px;">By Provider</h4>
        <div class="list-item">
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="width:12px;height:12px;background:var(--accent-claude);border-radius:50%"></div>
            <strong>Claude</strong>
          </div>
          <div>$${data.all.byProvider.claude.cost.toFixed(4)} (${data.all.byProvider.claude.calls} calls)</div>
        </div>
        <div class="list-item">
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="width:12px;height:12px;background:var(--accent-gpt);border-radius:50%"></div>
            <strong>GPT</strong>
          </div>
          <div>$${data.all.byProvider.gpt.cost.toFixed(4)} (${data.all.byProvider.gpt.calls} calls)</div>
        </div>
      `;
  }

  // Developer settings export/import
  function devExportSettings() {
    const includeKeys = (document.getElementById('devExportIncludeKeys') as HTMLInputElement)?.checked ?? true;
    vscode.postMessage({ type: 'devExportSettings', includeKeys });
    const statusEl = document.getElementById('devExportStatus');
    if (statusEl) statusEl.textContent = 'Exporting...';
  }

  function devImportSettings() {
    const includeKeys = (document.getElementById('devExportIncludeKeys') as HTMLInputElement)?.checked ?? true;
    vscode.postMessage({ type: 'devImportSettings', includeKeys });
    const statusEl = document.getElementById('devExportStatus');
    if (statusEl) statusEl.textContent = 'Importing...';
  }

  function handleDevExportSuccess(path: string) {
    const statusEl = document.getElementById('devExportStatus');
    if (statusEl) {
      statusEl.textContent = `Exported to: ${path}`;
      statusEl.style.color = 'var(--success-color)';
    }
    showToast('Settings exported successfully', 'success');
  }

  function handleDevImportSuccess() {
    const statusEl = document.getElementById('devExportStatus');
    if (statusEl) {
      statusEl.textContent = 'Import complete. Reload window to apply.';
      statusEl.style.color = 'var(--success-color)';
    }
    showToast('Settings imported. Reload window to apply.', 'success');
  }

  function handleDevExportError(error: string) {
    const statusEl = document.getElementById('devExportStatus');
    if (statusEl) {
      statusEl.textContent = `Error: ${error}`;
      statusEl.style.color = 'var(--error-color)';
    }
    showToast(`Export failed: ${error}`, 'error');
  }

  function handleDevImportError(error: string) {
    const statusEl = document.getElementById('devExportStatus');
    if (statusEl) {
      statusEl.textContent = `Error: ${error}`;
      statusEl.style.color = 'var(--error-color)';
    }
    showToast(`Import failed: ${error}`, 'error');
  }

  // Usage & Plan stats
  function refreshUsageStats() {
    vscode.postMessage({ type: 'getUsageStats' });
  }

  function renderUsageStats(data: any) {
    if (!data) return;

    const { today, month, all, connectionMethods } = data;

    // Update Claude stats
    const claudeToday = document.getElementById('claudeUsageToday');
    const claudeMonth = document.getElementById('claudeUsageMonth');
    const claudeCalls = document.getElementById('claudeCallsTotal');
    if (claudeToday) claudeToday.textContent = `$${(today?.byProvider?.claude?.cost || 0).toFixed(2)}`;
    if (claudeMonth) claudeMonth.textContent = `$${(month?.byProvider?.claude?.cost || 0).toFixed(2)}`;
    if (claudeCalls) claudeCalls.textContent = String(all?.byProvider?.claude?.calls || 0);

    // Update GPT stats
    const gptToday = document.getElementById('gptUsageToday');
    const gptMonth = document.getElementById('gptUsageMonth');
    const gptCalls = document.getElementById('gptCallsTotal');
    if (gptToday) gptToday.textContent = `$${(today?.byProvider?.gpt?.cost || 0).toFixed(2)}`;
    if (gptMonth) gptMonth.textContent = `$${(month?.byProvider?.gpt?.cost || 0).toFixed(2)}`;
    if (gptCalls) gptCalls.textContent = String(all?.byProvider?.gpt?.calls || 0);

    // Update totals
    const totalToday = document.getElementById('totalUsageToday');
    const totalMonth = document.getElementById('totalUsageMonth');
    const totalAllTime = document.getElementById('totalUsageAllTime');
    if (totalToday) totalToday.textContent = `$${(today?.totalCost || 0).toFixed(2)}`;
    if (totalMonth) totalMonth.textContent = `$${(month?.totalCost || 0).toFixed(2)}`;
    if (totalAllTime) totalAllTime.textContent = `$${(all?.totalCost || 0).toFixed(2)}`;

    // Update plan badges based on connection method
    const claudePlanType = document.getElementById('claudePlanType');
    const gptPlanType = document.getElementById('gptPlanType');

    if (claudePlanType && connectionMethods) {
      const claudeMethod = connectionMethods.claude || 'cli';
      const claudeBadge = claudeMethod === 'cli' ? 'cli' : 'api';
      const claudeDesc = claudeMethod === 'cli' ? 'Subscription included' : 'Pay-as-you-go';
      claudePlanType.innerHTML = `
        <span class="plan-badge ${claudeBadge}">${claudeMethod.toUpperCase()}</span>
        <span class="plan-desc">${claudeDesc}</span>
      `;
    }

    if (gptPlanType && connectionMethods) {
      const gptMethod = connectionMethods.gpt || 'api';
      const gptBadge = gptMethod === 'cli' ? 'cli' : 'api';
      const gptDesc = gptMethod === 'cli' ? 'Subscription included' : 'Pay-as-you-go';
      gptPlanType.innerHTML = `
        <span class="plan-badge ${gptBadge}">${gptMethod.toUpperCase()}</span>
        <span class="plan-desc">${gptDesc}</span>
      `;
    }
  }

  return {
    panelTitles,
    installOutsideClickHandler,
    showSettingsPanel,
    switchSettingsTab,
    closeSettingsPanel,
    showTab,
    handleGitAction,
    saveConnectionMethods,
    loadConnectionMethods,
    onConnectionMethodChange,
    handleCliAction,
    saveMastermindSettings,
    refreshCliStatus,
    renderCliStatus,
    refreshOpenaiModels,
    applyPricingOverride,
    refreshPricingOverrides,
    installCli,
    loginCli,
    saveApiKeys,
    saveGitSettings,
    loadGitSettings,
    clearGitOverrides,
    showLogChannel,
    clearAllLogs,
    openTerminal,
    openDevTools,
    reloadPanel,
    selectMcpServer,
    rebuildIndex,
    clearCache,
    confirmResetDb,
    loadSettings,
    saveSettings,
    confirmResetSettings,
    confirmClearAllData,
    updateSettings,
    renderCosts,
    onSettingsModelChange,
    onSettingsConsultantChange,
    toggleApiKeyVisibility,
    handleApiKeyValue,
    devExportSettings,
    devImportSettings,
    handleDevExportSuccess,
    handleDevImportSuccess,
    handleDevExportError,
    handleDevImportError,
    refreshUsageStats,
    renderUsageStats,
  };
}
