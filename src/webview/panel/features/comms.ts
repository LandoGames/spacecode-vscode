// @ts-nocheck

/**
 * Comms Array Frontend Handlers (Phase 7)
 *
 * Renders comms tier, service status, scan controls, findings, and prompts.
 */

const SEVERITY_COLORS = {
  HIGH: '#ef4444',
  MEDIUM: '#f59e0b',
  LOW: '#3b82f6',
  INFO: '#6b7280',
};

const TIER_LABELS = {
  1: 'Tier 1 — API Testing',
  2: 'Tier 2 — Vulnerability Scanning',
  3: 'Tier 3 — Full Pentest',
};

const TIER_COLORS = {
  1: '#3b82f6',
  2: '#f59e0b',
  3: '#ef4444',
};

export function createCommsHandlers(deps) {
  const { vscode, escapeHtml } = deps;

  /** Render the full comms state (tier, services, recent scans) */
  function commsRenderState(msg) {
    // Update tier display
    const tierEl = document.getElementById('commsTierLabel');
    const tierBar = document.getElementById('commsTierBar');
    if (tierEl) {
      tierEl.textContent = TIER_LABELS[msg.tier] || `Tier ${msg.tier}`;
      tierEl.style.color = TIER_COLORS[msg.tier] || '#6b7280';
    }
    if (tierBar) {
      tierBar.style.width = `${(msg.tier / 3) * 100}%`;
      tierBar.style.background = TIER_COLORS[msg.tier] || '#3b82f6';
    }

    // Tier selector
    const tierSelect = document.getElementById('commsTierSelect');
    if (tierSelect) (tierSelect as HTMLSelectElement).value = String(msg.tier);

    // Services status
    commsRenderServices(msg.services || {});

    // Recent scans
    commsRenderRecentScans(msg.recentScans || []);

    // Profiles — update available profiles based on tier
    commsRenderProfiles(msg.profiles || {}, msg.tier);
  }

  /** Render service connection status */
  function commsRenderServices(services) {
    const el = document.getElementById('commsServicesList');
    if (!el) return;

    const items = [
      { key: 'postman', name: 'Postman', icon: '📬' },
      { key: 'zap', name: 'ZAP', icon: '⚡' },
      { key: 'pentest', name: 'Pentest', icon: '🔓' },
    ];

    el.innerHTML = items.map(item => {
      const svc = services[item.key] || {};
      const available = svc.available;
      const dot = available ? '🟢' : '🔴';
      const label = available ? 'Connected' : 'Not available';
      return `<div class="comms-service-row">
        <span>${item.icon} ${item.name}</span>
        <span style="font-size:10px; color:${available ? '#22c55e' : '#6b7280'}">${dot} ${label}</span>
      </div>`;
    }).join('');
  }

  /** Render available scan profiles based on tier */
  function commsRenderProfiles(profiles, tier) {
    const el = document.getElementById('commsScanProfileSelect');
    if (!el) return;
    const select = el as HTMLSelectElement;
    select.innerHTML = '';
    for (const [key, profile] of Object.entries(profiles)) {
      const p = profile as any;
      const disabled = tier < p.tier;
      const option = document.createElement('option');
      option.value = key;
      option.textContent = `${p.name}${disabled ? ` (Tier ${p.tier}+)` : ''}`;
      option.disabled = disabled;
      select.appendChild(option);
    }
  }

  /** Render recent scans list */
  function commsRenderRecentScans(scans) {
    const el = document.getElementById('commsRecentScansList');
    if (!el) return;

    if (!scans || scans.length === 0) {
      el.innerHTML = '<div style="font-size:10px; color:var(--text-secondary); text-align:center; padding:12px;">No scans yet. Enter a target URL and run a scan.</div>';
      return;
    }

    el.innerHTML = scans.map(scan => {
      const statusIcon = scan.status === 'running' ? '🔄' : scan.status === 'completed' ? '✅' : '❌';
      const time = new Date(scan.startTime).toLocaleTimeString();
      const summaryParts = [];
      if (scan.summary.high) summaryParts.push(`<span style="color:${SEVERITY_COLORS.HIGH}">${scan.summary.high}H</span>`);
      if (scan.summary.medium) summaryParts.push(`<span style="color:${SEVERITY_COLORS.MEDIUM}">${scan.summary.medium}M</span>`);
      if (scan.summary.low) summaryParts.push(`<span style="color:${SEVERITY_COLORS.LOW}">${scan.summary.low}L</span>`);
      if (scan.summary.info) summaryParts.push(`<span style="color:${SEVERITY_COLORS.INFO}">${scan.summary.info}I</span>`);
      const summaryStr = summaryParts.length ? summaryParts.join(' ') : (scan.status === 'running' ? 'Scanning...' : 'Clean');

      return `<div class="comms-scan-row" onclick="commsViewScan('${scan.id}')" style="cursor:pointer;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:11px; font-weight:600;">${statusIcon} ${escapeHtml(scan.profile)}</span>
          <span style="font-size:9px; color:var(--text-secondary);">${time}</span>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:2px;">
          <span style="font-size:10px; color:var(--text-secondary);">${escapeHtml(scan.target)}</span>
          <span style="font-size:10px;">${summaryStr}</span>
        </div>
        ${scan.error ? `<div style="font-size:9px; color:${SEVERITY_COLORS.HIGH}; margin-top:2px;">${escapeHtml(scan.error)}</div>` : ''}
      </div>`;
    }).join('');
  }

  /** Render scan detail view with findings */
  function commsRenderScanDetail(msg) {
    const scan = msg.scan;
    if (!scan) return;

    const el = document.getElementById('commsScanDetail');
    const listEl = document.getElementById('commsRecentScansList');
    if (!el) return;

    // Hide scan list, show detail
    if (listEl) listEl.style.display = 'none';
    el.style.display = 'block';

    const statusIcon = scan.status === 'running' ? '🔄' : scan.status === 'completed' ? '✅' : '❌';
    const duration = scan.endTime ? `${((scan.endTime - scan.startTime) / 1000).toFixed(1)}s` : 'In progress';

    let findingsHtml = '';
    if (scan.findings && scan.findings.length > 0) {
      findingsHtml = scan.findings.map((f, i) => `
        <div class="comms-finding-row" style="border-left:3px solid ${SEVERITY_COLORS[f.severity] || '#6b7280'};">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:11px; font-weight:600;">${escapeHtml(f.name)}</span>
            <span class="comms-severity-badge" style="background:${SEVERITY_COLORS[f.severity] || '#6b7280'};">${f.severity}</span>
          </div>
          <div style="font-size:10px; color:var(--text-secondary); margin-top:2px;">${escapeHtml(f.description || '').slice(0, 200)}</div>
          ${f.url ? `<div style="font-size:9px; color:var(--text-secondary); margin-top:2px;">${escapeHtml(f.url)}</div>` : ''}
          <div style="display:flex; gap:4px; margin-top:4px;">
            <button class="btn-secondary" onclick="commsInvestigateFinding(${i})" style="padding:2px 6px; font-size:9px;">Investigate</button>
            <button class="btn-secondary" onclick="commsGenerateFixForFinding(${i})" style="padding:2px 6px; font-size:9px;">Generate Fix</button>
          </div>
        </div>
      `).join('');
    } else if (scan.status === 'completed') {
      findingsHtml = '<div style="font-size:10px; color:#22c55e; text-align:center; padding:12px;">No vulnerabilities found.</div>';
    }

    el.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <button class="btn-secondary" onclick="commsCloseScanDetail()" style="padding:2px 8px; font-size:10px;">&larr; Back</button>
        <span style="font-size:10px; color:var(--text-secondary);">${duration}</span>
      </div>
      <div style="margin-bottom:6px;">
        <strong style="font-size:12px;">${statusIcon} ${escapeHtml(scan.profile)}</strong>
        <span style="font-size:10px; color:var(--text-secondary); margin-left:8px;">${escapeHtml(scan.target)}</span>
      </div>
      <div style="display:flex; gap:8px; margin-bottom:8px;">
        <span class="comms-severity-badge" style="background:${SEVERITY_COLORS.HIGH};">${scan.summary.high} High</span>
        <span class="comms-severity-badge" style="background:${SEVERITY_COLORS.MEDIUM};">${scan.summary.medium} Med</span>
        <span class="comms-severity-badge" style="background:${SEVERITY_COLORS.LOW};">${scan.summary.low} Low</span>
        <span class="comms-severity-badge" style="background:${SEVERITY_COLORS.INFO};">${scan.summary.info} Info</span>
      </div>
      ${scan.error ? `<div style="font-size:10px; color:${SEVERITY_COLORS.HIGH}; margin-bottom:6px;">${escapeHtml(scan.error)}</div>` : ''}
      <div id="commsFindingsList">${findingsHtml}</div>
    `;

    // Store findings for investigate/fix buttons
    window._commsCurrentFindings = scan.findings || [];
  }

  /** Render scan started event */
  function commsRenderScanStarted(msg) {
    const scan = msg.scan;
    if (!scan) return;

    // Update recent scans to show running scan
    const el = document.getElementById('commsRecentScansList');
    if (el) {
      const row = document.createElement('div');
      row.className = 'comms-scan-row';
      row.id = `commsScan-${scan.id}`;
      row.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:11px; font-weight:600;">🔄 ${escapeHtml(scan.profile)}</span>
          <span style="font-size:9px; color:var(--text-secondary);">Running...</span>
        </div>
        <div style="font-size:10px; color:var(--text-secondary); margin-top:2px;">${escapeHtml(scan.target)}</div>
      `;
      el.prepend(row);
    }

    // Show scanning indicator
    const indicator = document.getElementById('commsScanIndicator');
    if (indicator) {
      indicator.textContent = 'Scanning...';
      indicator.style.display = 'inline';
    }
  }

  /** Render scan completed event — refresh state */
  function commsRenderScanCompleted(msg) {
    // Hide scanning indicator
    const indicator = document.getElementById('commsScanIndicator');
    if (indicator) indicator.style.display = 'none';

    // If detail view is open for this scan, update it
    const detailEl = document.getElementById('commsScanDetail');
    if (detailEl && detailEl.style.display !== 'none') {
      commsRenderScanDetail(msg);
    }

    // Refresh full state
    vscode.postMessage({ type: 'commsGetState' });
  }

  /** Handle prompt from investigate/fix — send to chat */
  function commsRenderPrompt(msg) {
    if (!msg.prompt) return;
    // Insert prompt into chat input
    const chatInput = document.getElementById('chatInput') as HTMLTextAreaElement;
    if (chatInput) {
      chatInput.value = msg.prompt;
      chatInput.dispatchEvent(new Event('input'));
      chatInput.focus();
    }
  }

  // --- Action functions ---

  function commsRequestState() {
    vscode.postMessage({ type: 'commsGetState' });
  }

  function commsSetTier(tier) {
    vscode.postMessage({ type: 'commsSetTier', tier: Number(tier) });
  }

  function commsCheckServices() {
    vscode.postMessage({ type: 'commsCheckServices' });
  }

  function commsStartScan() {
    const profileEl = document.getElementById('commsScanProfileSelect') as HTMLSelectElement;
    const targetEl = document.getElementById('commsScanTarget') as HTMLInputElement;
    const profile = profileEl?.value || 'apiTest';
    const target = targetEl?.value?.trim() || '';
    if (!target) {
      const statusEl = document.getElementById('commsScanStatus');
      if (statusEl) { statusEl.textContent = 'Enter a target URL.'; statusEl.style.color = SEVERITY_COLORS.MEDIUM; }
      return;
    }
    vscode.postMessage({ type: 'commsStartScan', profile, target });
  }

  function commsViewScan(scanId) {
    vscode.postMessage({ type: 'commsGetScan', scanId });
  }

  function commsCloseScanDetail() {
    const detailEl = document.getElementById('commsScanDetail');
    const listEl = document.getElementById('commsRecentScansList');
    if (detailEl) detailEl.style.display = 'none';
    if (listEl) listEl.style.display = '';
  }

  function commsInvestigateFinding(index) {
    const findings = window._commsCurrentFindings || [];
    const finding = findings[index];
    if (finding) {
      vscode.postMessage({ type: 'commsInvestigate', finding });
    }
  }

  function commsGenerateFixForFinding(index) {
    const findings = window._commsCurrentFindings || [];
    const finding = findings[index];
    if (finding) {
      vscode.postMessage({ type: 'commsGenerateFix', finding });
    }
  }

  return {
    // Render functions (called by messageRouter)
    commsRenderState,
    commsRenderServices,
    commsRenderScanDetail,
    commsRenderScanStarted,
    commsRenderScanCompleted,
    commsRenderPrompt,
    // Action functions (called by HTML onclick)
    commsRequestState,
    commsSetTier,
    commsCheckServices,
    commsStartScan,
    commsViewScan,
    commsCloseScanDetail,
    commsInvestigateFinding,
    commsGenerateFixForFinding,
  };
}
