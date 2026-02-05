// @ts-nocheck

export function createControlTabsHandlers(deps) {
  const { unityCheckConnection, onSectorsTabOpen, onEngineerTabOpen, onCommsTabOpen, onInfraTabOpen, onDiagnosticsTabOpen } = deps;

  const TAB_IDS = ['info', 'sectors', 'ops', 'security', 'quality', 'diagnostics', 'unity', 'gameui', 'engineer', 'comms', 'infra'];

  function switchControlTab(tab) {
    // Hide all tabs and deactivate all buttons
    for (const id of TAB_IDS) {
      const capitalized = id.charAt(0).toUpperCase() + id.slice(1);
      const btn = document.getElementById('controlTabBtn' + capitalized);
      const panel = document.getElementById('controlTab' + capitalized);
      if (btn) btn.classList.remove('active');
      if (panel) panel.style.display = 'none';
    }

    // Legacy tab name mapping
    if (tab === 'coordinator') tab = 'info';

    // Activate selected tab
    const selectedId = tab.charAt(0).toUpperCase() + tab.slice(1);
    const selectedBtn = document.getElementById('controlTabBtn' + selectedId);
    const selectedPanel = document.getElementById('controlTab' + selectedId);
    if (selectedBtn) selectedBtn.classList.add('active');
    if (selectedPanel) selectedPanel.style.display = 'flex';

    // Tab-specific hooks
    if (tab === 'sectors' && typeof onSectorsTabOpen === 'function') {
      onSectorsTabOpen();
    } else if (tab === 'unity') {
      unityCheckConnection();
    } else if (tab === 'engineer' && typeof onEngineerTabOpen === 'function') {
      onEngineerTabOpen();
    } else if (tab === 'comms' && typeof onCommsTabOpen === 'function') {
      onCommsTabOpen();
    } else if (tab === 'infra' && typeof onInfraTabOpen === 'function') {
      onInfraTabOpen();
    } else if (tab === 'diagnostics' && typeof onDiagnosticsTabOpen === 'function') {
      onDiagnosticsTabOpen();
    }

    localStorage.setItem('spacecode.controlTab', tab);
  }

  return { switchControlTab };
}
