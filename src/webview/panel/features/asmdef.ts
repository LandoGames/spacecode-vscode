// @ts-nocheck

export function createAsmdefHandlers(deps) {
  const { vscode, escapeHtml } = deps;

  function renderAsmdefInventory(inventory) {
    const summaryEl = document.getElementById('asmdefSummary');
    const listEl = document.getElementById('asmdefList');
    const badgeEl = document.getElementById('asmdefPolicyModeBadge');
    if (!summaryEl || !listEl) return;

    if (!inventory || !Array.isArray(inventory.asmdefs)) {
      summaryEl.textContent = 'Asmdef inventory unavailable.';
      listEl.innerHTML = '';
      return;
    }

    const count = inventory.asmdefs.length;
    const policyMode = inventory.policy?.mode || 'none';
    const policyEntries = inventory.policy?.entries ? Object.keys(inventory.policy.entries).length : 0;
    const policyPath = inventory.policyPath ? ('\nPolicy: ' + inventory.policyPath) : '';
    const warnCount = Array.isArray(inventory.warnings) ? inventory.warnings.length : 0;

    summaryEl.textContent =
      'Asmdefs: ' + count +
      '\nPolicy: ' + policyMode + (policyEntries ? ' (' + policyEntries + ' entries)' : '') +
      policyPath +
      (warnCount ? ('\nWarnings: ' + warnCount) : '');
    if (badgeEl) {
      badgeEl.textContent = 'Policy: ' + policyMode;
      badgeEl.classList.toggle('ok', policyMode === 'strict');
      badgeEl.classList.toggle('muted', policyMode === 'none');
    }

    listEl.innerHTML = '';
    inventory.asmdefs.forEach((a) => {
      const item = document.createElement('div');
      item.className = 'asmdef-item';
      const refs = Array.isArray(a.references) && a.references.length
        ? a.references.join(', ')
        : '(none)';
      item.innerHTML = `
          <div class="asmdef-item-header">
            <span>${escapeHtml(a.name || '(unnamed)')}</span>
            <span style="color: var(--text-secondary);">${escapeHtml(a.sector?.id || 'unknown')}</span>
          </div>
          <div class="asmdef-item-refs">Refs: ${escapeHtml(refs)}</div>
          <div style="font-size:10px; color: var(--text-secondary);">${escapeHtml(a.path || '')}</div>
        `;
      listEl.appendChild(item);
    });
  }

  function renderAsmdefPolicyEditor(payload) {
    const editor = document.getElementById('asmdefPolicyEditor');
    const textEl = document.getElementById('asmdefPolicyText');
    const pathEl = document.getElementById('asmdefPolicyPath');
    if (!editor || !textEl) return;
    editor.style.display = 'block';
    textEl.value = payload?.policyText || '';
    if (pathEl) pathEl.textContent = payload?.policyPath ? payload.policyPath : '(no policy)';
  }

  function renderAsmdefGraph(graph) {
    const summaryEl = document.getElementById('asmdefGraphSummary');
    const listEl = document.getElementById('asmdefGraphList');
    const canvasEl = document.getElementById('asmdefGraphCanvas');
    if (!summaryEl || !listEl || !canvasEl) return;
    if (!graph || !Array.isArray(graph.nodes)) {
      summaryEl.style.display = 'none';
      listEl.style.display = 'none';
      canvasEl.style.display = 'none';
      canvasEl.innerHTML = '';
      return;
    }
    const nodes = graph.nodes.length;
    const edges = Array.isArray(graph.edges) ? graph.edges.length : 0;
    const unresolved = Array.isArray(graph.unresolved) ? graph.unresolved.length : 0;
    summaryEl.textContent =
      'Graph: ' +
      nodes +
      ' nodes, ' +
      edges +
      ' edges' +
      (unresolved ? ', ' + unresolved + ' unresolved' : '') +
      '.';
    summaryEl.style.display = 'block';
    listEl.style.display = 'block';
    canvasEl.style.display = 'block';
    listEl.innerHTML = '';
    const maxEdges = 200;
    (graph.edges || []).slice(0, maxEdges).forEach((e) => {
      const item = document.createElement('div');
      item.className = 'asmdef-item';
      item.innerHTML =
        '<div class="asmdef-item-header">' +
        '<span>' +
        escapeHtml(e.from) +
        '</span>' +
        '<span style="opacity:0.6;">→</span>' +
        '<span>' +
        escapeHtml(e.to) +
        '</span>' +
        '</div>';
      listEl.appendChild(item);
    });
    if (unresolved) {
      const warn = document.createElement('div');
      warn.className = 'asmdef-item';
      warn.innerHTML =
        '<div class="asmdef-item-refs">Unresolved refs:\n' +
        escapeHtml((graph.unresolved || []).join('\n')) +
        '</div>';
      listEl.appendChild(warn);
    }

    renderAsmdefGraphCanvas(graph, canvasEl);
  }

  function renderAsmdefCheckResult(result) {
    const listEl = document.getElementById('asmdefViolations');
    if (!listEl) return;
    if (!result) {
      listEl.style.display = 'none';
      listEl.innerHTML = '';
      return;
    }
    listEl.style.display = 'block';
    listEl.innerHTML = '';

    const suggestions = [];
    if (Array.isArray(result.violations)) {
      result.violations.forEach(v => {
        if (v && v.suggestion) suggestions.push(v.suggestion);
      });
    }

    const summary = document.createElement('div');
    summary.className = 'asmdef-item';
    summary.innerHTML = '<div class="asmdef-item-header">' +
      '<span>Validation</span>' +
      '<span class="asmdef-badge ' + (result.passed ? 'ok' : 'fail') + '">' + (result.passed ? 'PASS' : 'FAIL') + '</span>' +
      '</div>' +
      '<div class="asmdef-item-refs">' + escapeHtml(result.summary || '') + '</div>' +
      (suggestions.length
        ? '<div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap;">' +
            '<button class="btn-secondary" onclick="copyAsmdefFixes()" style="padding:4px 10px;">Copy Fixes</button>' +
          '</div>'
        : '');
    listEl.appendChild(summary);

    if (Array.isArray(result.violations)) {
      result.violations.forEach(v => {
        const item = document.createElement('div');
        item.className = 'asmdef-item';
        item.innerHTML = '<div class="asmdef-item-header"><span>' +
          escapeHtml(v.asmdefName || '(unknown)') + '</span><span style="color:#f87171;">' +
          escapeHtml(v.reference || '') + '</span></div>' +
          '<div class="asmdef-item-refs">' + escapeHtml(v.message || '') + '</div>' +
          (v.suggestion ? '<div class="asmdef-item-refs" style="color:#a7f3d0;">Suggest: ' + escapeHtml(v.suggestion) + '</div>' : '') +
          '<div style="font-size:10px; color:var(--text-secondary);">' + escapeHtml(v.asmdefPath || '') + '</div>';
        listEl.appendChild(item);
      });
    }

    if (Array.isArray(result.warnings) && result.warnings.length) {
      const warn = document.createElement('details');
      warn.className = 'asmdef-item asmdef-warnings';
      warn.innerHTML = '<summary>Warnings (' + result.warnings.length + ')</summary>' +
        '<div class="asmdef-item-refs">' + escapeHtml(result.warnings.join('\n')) + '</div>';
      listEl.appendChild(warn);
    }
  }

  function renderAsmdefGraphCanvas(graph, canvasEl) {
    const nodeItems = Array.isArray(graph.nodes) ? graph.nodes : [];
    const nodes = nodeItems.map(n => n.id);
    const edges = Array.isArray(graph.edges) ? graph.edges : [];
    if (nodes.length === 0) {
      canvasEl.innerHTML = '';
      return;
    }

    const layout = computeAsmdefLayout(nodeItems, edges);
    const width = layout.width;
    const height = layout.height;

    canvasEl.innerHTML = '';
    canvasEl.style.minHeight = height + 'px';

    const inner = document.createElement('div');
    inner.className = 'asmdef-graph-inner';
    inner.style.width = width + 'px';
    inner.style.height = height + 'px';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.classList.add('asmdef-graph-svg');

    edges.forEach(e => {
      const from = layout.pos[e.from];
      const to = layout.pos[e.to];
      if (!from || !to) return;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const startX = from.x + from.w;
      const startY = from.y + from.h / 2;
      const endX = to.x;
      const endY = to.y + to.h / 2;
      const midX = (startX + endX) / 2;
      const d = 'M ' + startX + ' ' + startY + ' C ' + midX + ' ' + startY + ', ' + midX + ' ' + endY + ', ' + endX + ' ' + endY;
      line.setAttribute('d', d);
      line.setAttribute('stroke', 'rgba(59,130,246,0.6)');
      line.setAttribute('stroke-width', '1.5');
      line.setAttribute('fill', 'none');
      line.classList.add('asmdef-edge');
      line.setAttribute('data-from', e.from);
      line.setAttribute('data-to', e.to);
      svg.appendChild(line);
    });

    inner.appendChild(svg);

    const sectorById = new Map();
    const pathById = new Map();
    nodeItems.forEach(n => {
      if (n && n.id) sectorById.set(n.id, n.sector || 'unknown');
      if (n && n.id) pathById.set(n.id, n.path || '');
    });

    nodes.forEach(id => {
      const pos = layout.pos[id];
      if (!pos) return;
      const nodeEl = document.createElement('div');
      nodeEl.className = 'asmdef-node';
      nodeEl.style.left = pos.x + 'px';
      nodeEl.style.top = pos.y + 'px';
      nodeEl.style.width = pos.w + 'px';
      const sectorLabel = sectorById.get(id) || 'unknown';
      nodeEl.innerHTML = escapeHtml(id) + '<small>' + escapeHtml(sectorLabel) + '</small>';
      nodeEl.dataset.id = id;
      const p = pathById.get(id);
      if (p) nodeEl.dataset.path = p;
      nodeEl.addEventListener('click', (ev) => {
        selectAsmdefNode(canvasEl, id);
        if (ev.detail >= 2 && nodeEl.dataset.path) {
          vscode.postMessage({ type: 'asmdefOpen', path: nodeEl.dataset.path });
        }
      });
      inner.appendChild(nodeEl);
    });

    canvasEl.appendChild(inner);
    initAsmdefGraphInteractions(canvasEl);
  }

  function selectAsmdefNode(canvasEl, id) {
    const nodes = canvasEl.querySelectorAll('.asmdef-node');
    nodes.forEach(n => {
      const match = n.dataset.id === id;
      n.classList.toggle('selected', match);
    });
    const edges = canvasEl.querySelectorAll('.asmdef-edge');
    edges.forEach(e => {
      const from = e.getAttribute('data-from');
      const to = e.getAttribute('data-to');
      const highlight = id && (from === id || to === id);
      e.classList.toggle('highlight', !!highlight);
    });
  }

  function initAsmdefGraphInteractions(canvasEl) {
    if (canvasEl.dataset.inited === '1') return;
    canvasEl.dataset.inited = '1';
    const state = {
      scale: 1,
      x: 0,
      y: 0,
      dragging: false,
      dragStartX: 0,
      dragStartY: 0
    };
    canvasEl._graphState = state;

    const getInner = () => canvasEl.querySelector('.asmdef-graph-inner');
    const applyTransform = () => {
      const inner = getInner();
      if (!inner) return;
      inner.style.transform = 'translate(' + state.x + 'px, ' + state.y + 'px) scale(' + state.scale + ')';
    };

    canvasEl.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = Math.sign(e.deltaY) * -0.1;
      const next = Math.min(2.0, Math.max(0.4, state.scale + delta));
      if (next === state.scale) return;
      state.scale = next;
      applyTransform();
    }, { passive: false });

    canvasEl.addEventListener('mousedown', (e) => {
      const target = e.target;
      if (target && target.closest && target.closest('.asmdef-node')) return;
      state.dragging = true;
      state.dragStartX = e.clientX - state.x;
      state.dragStartY = e.clientY - state.y;
      canvasEl.classList.add('dragging');
    });

    window.addEventListener('mousemove', (e) => {
      if (!state.dragging) return;
      state.x = e.clientX - state.dragStartX;
      state.y = e.clientY - state.dragStartY;
      applyTransform();
    });

    window.addEventListener('mouseup', () => {
      if (!state.dragging) return;
      state.dragging = false;
      canvasEl.classList.remove('dragging');
    });

    applyTransform();
  }

  function computeAsmdefLayout(nodeItems, edges) {
    const nodes = nodeItems.map(n => n.id);
    const sectorById = new Map();
    nodeItems.forEach(n => {
      if (!n || !n.id) return;
      sectorById.set(n.id, n.sector || 'unknown');
    });

    const sectorOrder = Array.from(new Set(nodeItems.map(n => n.sector || 'unknown')))
      .sort((a, b) => String(a).localeCompare(String(b)));

    const groups = new Map();
    sectorOrder.forEach(s => groups.set(s, []));
    nodes
      .slice()
      .sort((a, b) => a.localeCompare(b))
      .forEach(id => {
        const s = sectorById.get(id) || 'unknown';
        if (!groups.has(s)) groups.set(s, []);
        groups.get(s).push(id);
      });

    const colGap = 220;
    const rowGap = 70;
    const margin = 20;
    const nodeW = 160;
    const nodeH = 36;
    const maxRows = Math.max(1, ...Array.from(groups.values()).map(arr => arr.length));

    const width = margin * 2 + nodeW + ((groups.size - 1) * colGap);
    const height = margin * 2 + nodeH + ((maxRows - 1) * rowGap);

    const pos = {};
    let col = 0;
    groups.forEach((arr) => {
      arr.forEach((id, idx) => {
        pos[id] = {
          x: margin + col * colGap,
          y: margin + idx * rowGap,
          w: nodeW,
          h: nodeH
        };
      });
      col += 1;
    });

    return { pos, width, height };
  }

  return {
    renderAsmdefInventory,
    renderAsmdefPolicyEditor,
    renderAsmdefGraph,
    renderAsmdefCheckResult,
  };
}
