// @ts-nocheck

export function createDocTargetHandlers(deps) {
  const {
    vscode,
    getDocTarget,
    setDocTarget,
    shipSetStatus,
    getShipSelectedSectorId,
  } = deps;

  function refreshDocTargets() {
    vscode.postMessage({ type: 'getDocTargets' });
  }

  function updateDocInfo(info) {
    const docInfoEl = document.getElementById('docInfo');
    if (!docInfoEl) return;
    if (!info) {
      docInfoEl.textContent = '';
      return;
    }
    const now = Date.now();
    const diff = now - info.lastModified;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    let freshness = '';
    let color = 'var(--text-secondary)';
    if (days === 0) {
      freshness = 'Updated today';
      color = '#22c55e';
    } else if (days <= 7) {
      freshness = 'Updated ' + days + ' day' + (days === 1 ? '' : 's') + ' ago';
      color = '#22c55e';
    } else if (days <= 30) {
      freshness = 'Updated ' + days + ' days ago';
      color = '#fbbf24';
    } else {
      freshness = 'Updated ' + days + ' days ago (stale)';
      color = '#ef4444';
    }
    docInfoEl.innerHTML = '<span style="color:' + color + ';">● ' + freshness + '</span>';
  }

  function updateDocSuggestion(sector) {
    const suggEl = document.getElementById('docSuggestion');
    if (!suggEl) return;
    const suggestions = {
      'yard': 'YARD sector: Experimental zone - no documentation required',
      'core': 'CORE sector: Update architecture.md before making core changes',
      'persistence': 'QUARTERS sector: Document save format changes carefully',
      'combat': 'ARMORY sector: Update combat docs for balance changes',
      'ui': 'BRIDGE-UI sector: Keep UI component docs current',
      'character': 'HANGAR sector: Document character customization options',
    };
    const hint = suggestions[sector];
    const current = getDocTarget();
    if (hint && !current) {
      suggEl.textContent = '💡 ' + hint;
      suggEl.style.display = 'block';
    } else {
      suggEl.style.display = 'none';
    }
  }

  function docTargetChanged(value) {
    const newTarget = value || '';
    setDocTarget(newTarget);
    localStorage.setItem('spacecode.docTarget', newTarget);
    if (newTarget) {
      shipSetStatus('Doc target: ' + newTarget);
    } else {
      shipSetStatus('Doc target cleared.');
    }
    const openBtn = document.getElementById('openDocBtn');
    if (openBtn) openBtn.disabled = !newTarget;
    if (newTarget) {
      vscode.postMessage({ type: 'getDocInfo', docTarget: newTarget });
    } else {
      updateDocInfo(null);
    }
    updateDocSuggestion(getShipSelectedSectorId());
    vscode.postMessage({ type: 'docTargetChanged', docTarget: newTarget });
  }

  function openDocTarget() {
    const current = getDocTarget();
    if (!current) return;
    vscode.postMessage({ type: 'openDocTarget', docTarget: current });
  }

  function populateDocTargets(list) {
    const select = document.getElementById('docTargetSelect');
    if (!select) return;
    const previous = select.value;
    select.innerHTML = '<option value="">Select a docs file...</option>';
    list.forEach((target) => {
      const opt = document.createElement('option');
      opt.value = target;
      opt.textContent = target;
      select.appendChild(opt);
    });

    if (previous && list.includes(previous)) {
      select.value = previous;
      setDocTarget(previous);
    } else {
      const current = getDocTarget();
      select.value = current || '';
      if (current && !list.includes(current)) {
        setDocTarget('');
      }
    }
  }

  return {
    refreshDocTargets,
    docTargetChanged,
    openDocTarget,
    updateDocInfo,
    updateDocSuggestion,
    populateDocTargets,
  };
}
