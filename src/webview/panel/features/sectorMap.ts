// @ts-nocheck

/**
 * Sector Map — Orbital Canvas 2D Visualization
 *
 * Data-driven sector architecture map with orbital layout,
 * particle flow along dependency edges, and health rings.
 *
 * Reusable: the core OrbitalGraph engine can render any node/edge
 * graph (sectors, AI flow nodes, etc.) with the same visual style.
 */

export function createSectorMapHandlers(deps) {
  const { vscode, escapeHtml } = deps;

  // ========================================
  // ORBITAL GRAPH ENGINE (reusable core)
  // ========================================

  /**
   * OrbitalGraph — renders nodes in orbital rings around a center node.
   * Supports: glow, health rings, particles, tooltips, click events.
   *
   * Usage:
   *   const graph = createOrbitalGraph(canvasEl, tooltipEl, options);
   *   graph.setData(nodes, edges);   // nodes: [{id,name,tech,color,health,deps,...}]
   *   graph.start();                 // begin animation loop
   *   graph.stop();                  // pause animation
   *   graph.onClick(callback);       // node click handler
   *   graph.destroy();               // cleanup
   */
  function createOrbitalGraph(canvasEl, tooltipEl, options = {}) {
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return null;

    // Config
    const opts = {
      bgColor: options.bgColor || '#0a0e17',
      bgGradient: options.bgGradient !== false,
      showStars: options.showStars !== false,
      showTitle: options.showTitle !== false,
      showLegend: options.showLegend !== false,
      showSummary: options.showSummary !== false,
      title: options.title || 'SECTOR MAP',
      particleCount: options.particleCount || 120,
      orbitSpeedBase: options.orbitSpeedBase || 0.00015,
      ellipseRatio: options.ellipseRatio || 0.65,
      ring1Ratio: options.ring1Ratio || 0.22,
      ring2Ratio: options.ring2Ratio || 0.38,
      coreRadius: options.coreRadius || 38,
      ring1Radius: options.ring1Radius || 28,
      ring2Radius: options.ring2Radius || 24,
      ...options,
    };

    // State
    let W = 0, H = 0, cx = 0, cy = 0;
    let time = 0;
    let running = false;
    let animId = null;
    let hoveredNode = null;
    let mouse = { x: -1000, y: -1000 };
    let clickCb = null;

    // Data
    let allNodes = [];      // original sector data
    let graphNodes = [];    // computed layout nodes
    let particles = [];
    let stars = [];

    // --- Sizing ---
    function resize() {
      const rect = canvasEl.parentElement
        ? canvasEl.parentElement.getBoundingClientRect()
        : { width: canvasEl.clientWidth || 400, height: canvasEl.clientHeight || 300 };
      W = canvasEl.width = Math.max(200, rect.width);
      H = canvasEl.height = Math.max(150, rect.height);
      cx = W / 2;
      cy = H / 2;
      if (allNodes.length > 0) layoutNodes();
    }

    // --- Stars ---
    function initStars() {
      stars = [];
      for (let i = 0; i < 200; i++) {
        stars.push({
          x: Math.random() * 3000 - 1500,
          y: Math.random() * 3000 - 1500,
          r: Math.random() * 1.2,
          a: Math.random() * 0.5 + 0.1,
          twinkle: Math.random() * 0.02,
        });
      }
    }

    // --- Layout (static positions) ---

    // Position templates: map sector ID → (x, y) as fraction of canvas [-1..1]
    // This ensures sectors never overlap and the layout is predictable.
    const POSITION_TEMPLATES = {
      // Default RPG layout: CORE center, ring 1 close deps, ring 2 outer deps
      rpg: {
        'core':        { x:  0.00, y:  0.00, ring: 0 },
        'character':   { x: -0.20, y: -0.28, ring: 1 },
        'inventory':   { x:  0.20, y: -0.28, ring: 1 },
        'world':       { x:  0.32, y:  0.00, ring: 1 },
        'persistence': { x: -0.32, y:  0.00, ring: 1 },
        'ui':          { x: -0.20, y:  0.28, ring: 1 },
        'quest':       { x:  0.20, y:  0.28, ring: 1 },
        'combat':      { x: -0.42, y: -0.30, ring: 2 },
        'dialogue':    { x:  0.42, y:  0.30, ring: 2 },
        'ai':          { x:  0.42, y: -0.30, ring: 2 },
        'editor':      { x: -0.42, y:  0.30, ring: 2 },
        'yard':        { x:  0.00, y:  0.42, ring: 2 },
      },
    };

    function getDepth(s) {
      if (s.deps.length === 0 && s.id !== (opts.centerId || 'core')) return 2;
      const centerId = opts.centerId || 'core';
      if (s.deps.length === 1 && s.deps[0] === centerId) return 1;
      if (s.deps.every(d => d === centerId)) return 1;
      return 2;
    }

    function layoutNodes() {
      graphNodes = [];
      const centerId = opts.centerId || 'core';
      const template = POSITION_TEMPLATES[opts.layoutTemplate || 'rpg'] || {};
      // Scale nodes to use the full canvas area — use separate X/Y scales
      const scaleX = W * 0.5;
      const scaleY = H * 0.5;
      const scale = Math.min(W, H) * 0.5; // for auto-layout ring sizing

      // Try template positions first, fall back to auto-ring layout
      allNodes.forEach(s => {
        const tpl = template[s.id];
        const isCenter = s.id === centerId;

        if (tpl) {
          // Template position — scale X and Y independently to fill canvas
          graphNodes.push({
            ...s,
            x: tpl.x * scaleX * 0.92,
            y: tpl.y * scaleY * 0.85,
            radius: isCenter ? opts.coreRadius : (tpl.ring === 1 ? opts.ring1Radius : opts.ring2Radius),
            ring: tpl.ring,
          });
        } else {
          // Auto-layout: unknown sectors go in a ring
          const depth = isCenter ? 0 : getDepth(s);
          const existingInRing = graphNodes.filter(n => n.ring === depth).length;
          const ringR = depth === 0 ? 0 : (depth === 1 ? opts.ring1Ratio : opts.ring2Ratio);
          const angle = (existingInRing / Math.max(6, existingInRing + 1)) * Math.PI * 2 - Math.PI / 2;

          graphNodes.push({
            ...s,
            x: isCenter ? 0 : Math.cos(angle) * ringR * scale,
            y: isCenter ? 0 : Math.sin(angle) * ringR * scale * opts.ellipseRatio,
            radius: isCenter ? opts.coreRadius : (depth === 1 ? opts.ring1Radius : opts.ring2Radius),
            ring: depth,
          });
        }
      });

      spawnParticles();
    }

    // --- Particles ---
    function spawnParticles() {
      particles = [];
      for (let i = 0; i < opts.particleCount; i++) {
        const srcNode = graphNodes[Math.floor(Math.random() * graphNodes.length)];
        if (!srcNode || (srcNode.deps.length === 0 && srcNode.ring !== 0)) continue;
        const depId = srcNode.deps.length > 0
          ? srcNode.deps[Math.floor(Math.random() * srcNode.deps.length)]
          : null;
        if (!depId) continue;
        const tgtNode = graphNodes.find(n => n.id === depId);
        if (!tgtNode) continue;
        particles.push({
          from: srcNode,
          to: tgtNode,
          t: Math.random(),
          speed: 0.002 + Math.random() * 0.003,
          color: srcNode.color,
          size: 1.5 + Math.random() * 1.5,
          alpha: 0.4 + Math.random() * 0.4,
        });
      }
    }

    // --- Color helpers ---
    function hexToRgb(hex) {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return [r, g, b];
    }

    function healthColor(h) {
      if (h >= 0.9) return [34, 197, 94];
      if (h >= 0.7) return [245, 158, 11];
      return [239, 68, 68];
    }

    // --- Mouse ---
    function onMouseMove(e) {
      const rect = canvasEl.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;

      hoveredNode = null;
      for (const n of graphNodes) {
        const dx = (cx + n.x) - mouse.x;
        const dy = (cy + n.y) - mouse.y;
        if (Math.sqrt(dx * dx + dy * dy) < n.radius + 8) {
          hoveredNode = n;
          break;
        }
      }

      if (hoveredNode && tooltipEl) {
        canvasEl.style.cursor = 'pointer';
        const healthPct = Math.round(hoveredNode.health * 100);
        const hc = hoveredNode.health >= 0.9 ? '#22c55e' : hoveredNode.health >= 0.7 ? '#f59e0b' : '#ef4444';
        const hl = hoveredNode.health >= 0.9 ? 'Healthy' : hoveredNode.health >= 0.7 ? 'Warning' : 'Critical';
        const nameEl = tooltipEl.querySelector('.sm-tip-name');
        const techEl = tooltipEl.querySelector('.sm-tip-tech');
        const healthEl = tooltipEl.querySelector('.sm-tip-health');
        const depsEl = tooltipEl.querySelector('.sm-tip-deps');
        if (nameEl) nameEl.textContent = hoveredNode.name;
        if (techEl) techEl.textContent = (hoveredNode.tech || '') + (hoveredNode.scripts ? ' \u00B7 ' + hoveredNode.scripts + ' scripts' : '');
        if (healthEl) healthEl.innerHTML = '<span style="color:' + hc + '">\u25CF ' + hl + ' (' + healthPct + '%)</span>';
        if (depsEl) depsEl.textContent = hoveredNode.deps.length > 0 ? 'Deps: ' + hoveredNode.deps.join(', ') : 'No dependencies';
        tooltipEl.style.display = 'block';
        // Position relative to canvas
        const canvasRect = canvasEl.getBoundingClientRect();
        tooltipEl.style.left = (e.clientX - canvasRect.left + 16) + 'px';
        tooltipEl.style.top = (e.clientY - canvasRect.top - 10) + 'px';
      } else {
        canvasEl.style.cursor = 'default';
        if (tooltipEl) tooltipEl.style.display = 'none';
      }
    }

    function onMouseClick() {
      if (hoveredNode && clickCb) {
        clickCb(hoveredNode);
      }
    }

    function onMouseLeave() {
      hoveredNode = null;
      if (tooltipEl) tooltipEl.style.display = 'none';
      canvasEl.style.cursor = 'default';
    }

    // --- Draw frame ---
    function draw() {
      if (!running) return;
      time++;

      ctx.clearRect(0, 0, W, H);

      // Background
      if (opts.bgGradient) {
        const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.7);
        bg.addColorStop(0, '#0f1628');
        bg.addColorStop(0.5, '#0a0e17');
        bg.addColorStop(1, '#060810');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);
      } else {
        ctx.fillStyle = opts.bgColor;
        ctx.fillRect(0, 0, W, H);
      }

      // Stars
      if (opts.showStars) {
        stars.forEach(s => {
          const a = s.a + Math.sin(time * s.twinkle) * 0.15;
          ctx.beginPath();
          ctx.arc(cx + s.x, cy + s.y, s.r, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(180, 200, 255,' + a + ')';
          ctx.fill();
        });
      }

      // Nodes are static — no position update needed.

      // Orbit ring guides (subtle background)
      const baseR1 = Math.min(W, H) * opts.ring1Ratio * 0.5;
      const baseR2 = Math.min(W, H) * opts.ring2Ratio * 0.5;
      [baseR1, baseR2].forEach(r => {
        ctx.beginPath();
        ctx.ellipse(cx, cy, r, r * opts.ellipseRatio, 0, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(50, 70, 100, 0.1)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 8]);
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // Dependency edges — solid for asmdef-enforced, dashed for config-only
      graphNodes.forEach(n => {
        (n.deps || []).forEach(depId => {
          const dep = graphNodes.find(d => d.id === depId);
          if (!dep) return;
          const x1 = cx + n.x, y1 = cy + n.y;
          const x2 = cx + dep.x, y2 = cy + dep.y;
          const [r, g, b] = hexToRgb(n.color);
          const grad = ctx.createLinearGradient(x1, y1, x2, y2);
          grad.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ', 0.25)');
          grad.addColorStop(0.5, 'rgba(' + r + ',' + g + ',' + b + ', 0.08)');
          grad.addColorStop(1, 'rgba(100, 150, 200, 0.05)');
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - 20;
          ctx.quadraticCurveTo(mx, my, x2, y2);
          ctx.strokeStyle = grad;
          ctx.lineWidth = hoveredNode && (hoveredNode.id === n.id || hoveredNode.id === depId) ? 2 : 1;
          // CF-2: Solid edges for asmdef-enforced deps, dashed for config-only
          const bothHaveAsmdef = (n.scripts > 0) && (dep.scripts > 0);
          ctx.setLineDash(bothHaveAsmdef ? [] : [6, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        });
      });

      // Particles
      particles.forEach(p => {
        p.t += p.speed;
        if (p.t > 1) p.t = 0;
        const x1 = cx + p.from.x, y1 = cy + p.from.y;
        const x2 = cx + p.to.x, y2 = cy + p.to.y;
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - 20;
        const t = p.t, it = 1 - t;
        const px = it * it * x1 + 2 * it * t * mx + t * t * x2;
        const py = it * it * y1 + 2 * it * t * my + t * t * y2;
        const [r, g, b] = hexToRgb(p.color);
        const fadeAlpha = p.alpha * (t < 0.1 ? t / 0.1 : t > 0.9 ? (1 - t) / 0.1 : 1);
        // Glow
        ctx.beginPath();
        ctx.arc(px, py, p.size * 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + (fadeAlpha * 0.15) + ')';
        ctx.fill();
        // Core
        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + fadeAlpha + ')';
        ctx.fill();
      });

      // Nodes
      graphNodes.forEach(n => {
        const nx = cx + n.x, ny = cy + n.y;
        const [r, g, b] = hexToRgb(n.color);
        const isHovered = hoveredNode && hoveredNode.id === n.id;
        const isCore = n.ring === 0;
        const pulse = Math.sin(time * 0.03) * 0.15 + 0.85;

        // Outer glow
        const glowSize = isCore ? 60 : isHovered ? 45 : 30;
        const glowAlpha = isCore ? 0.15 * pulse : isHovered ? 0.2 : 0.08;
        const glow = ctx.createRadialGradient(nx, ny, 0, nx, ny, glowSize);
        glow.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',' + glowAlpha + ')');
        glow.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ', 0)');
        ctx.beginPath();
        ctx.arc(nx, ny, glowSize, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        // Node circle
        const nodeRadius = isHovered ? n.radius + 4 : n.radius;
        ctx.beginPath();
        ctx.arc(nx, ny, nodeRadius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ', 0.12)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + (isHovered ? 0.9 : 0.5) + ')';
        ctx.lineWidth = isCore ? 2 : 1.5;
        ctx.stroke();

        // Icon placeholder — draw a small icon symbol in the center
        // (will be replaced with actual icons when available)
        if (n.icon) {
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = (isCore ? '16px' : '13px') + ' "Segoe UI", system-ui, sans-serif';
          ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + (isHovered ? 0.8 : 0.4) + ')';
          // Use a simple character as icon placeholder
          const iconMap = {
            'cpu': '\u2699',      // ⚙ gear
            'person': '\u263A',   // ☺ face
            'flame': '\u2604',    // ☄ comet
            'archive': '\u2692',  // ⚒ hammers
            'chat': '\u2709',     // ✉ envelope
            'map': '\u2690',      // ⚐ flag
            'globe': '\u2641',    // ♁ earth
            'robot': '\u2318',    // ⌘ command
            'database': '\u25A6', // ▦ grid
            'layout': '\u25A3',   // ▣ square
            'wrench': '\u2692',   // ⚒ hammers
            'beaker': '\u2697',   // ⚗ alembic
          };
          const sym = iconMap[n.icon] || '\u25C6'; // ◆ diamond default
          ctx.fillText(sym, nx, ny - (isCore ? 14 : 10));
        }

        // Health ring
        if (typeof n.health === 'number') {
          const [hr, hg, hb] = healthColor(n.health);
          const healthAngle = n.health * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(nx, ny, nodeRadius + 4, -Math.PI / 2, -Math.PI / 2 + healthAngle);
          ctx.strokeStyle = 'rgba(' + hr + ',' + hg + ',' + hb + ',' + (isHovered ? 0.9 : 0.5) + ')';
          ctx.lineWidth = 2.5;
          ctx.lineCap = 'round';
          ctx.stroke();
          ctx.lineCap = 'butt';

          // Health dot
          const dotAngle = -Math.PI / 2 + healthAngle;
          const dotX = nx + Math.cos(dotAngle) * (nodeRadius + 4);
          const dotY = ny + Math.sin(dotAngle) * (nodeRadius + 4);
          ctx.beginPath();
          ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(' + hr + ',' + hg + ',' + hb + ', 0.9)';
          ctx.fill();
        }

        // Label: name (large)
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = (isCore ? 'bold 13px' : 'bold 11px') + ' "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255,' + (isHovered ? 1 : 0.85) + ')';
        const labelY = n.icon ? ny + 4 : ny - (isCore ? 4 : 3);
        ctx.fillText(n.name, nx, labelY);

        // Label: tech name (small, grey)
        ctx.font = '9px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = 'rgba(150, 170, 200, ' + (isHovered ? 0.8 : 0.4) + ')';
        const techLabel = (n.tech || '').replace('asmdef: ', '');
        const techY = n.icon ? ny + 16 : ny + (isCore ? 12 : 10);
        ctx.fillText(techLabel, nx, techY);
      });

      // Title
      if (opts.showTitle) {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.font = 'bold 14px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = 'rgba(200, 215, 235, 0.7)';
        ctx.fillText(opts.title, 12, 10);
      }

      // Summary bar
      if (opts.showSummary && allNodes.length > 0) {
        const totalBoundaries = allNodes.reduce((a, s) => a + (s.deps || []).length, 0);
        const violations = allNodes.reduce((a, s) => a + (s.violations || 0), 0);
        ctx.font = '10px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = 'rgba(100, 130, 170, 0.5)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('Sectors: ' + allNodes.length + '  \u00B7  Boundaries: ' + totalBoundaries + '  \u00B7  Violations: ' + violations, 12, 28);
      }

      // Legend
      if (opts.showLegend) {
        const ly = H - 20;
        ctx.font = '10px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        ctx.beginPath(); ctx.arc(14, ly, 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(34, 197, 94, 0.7)'; ctx.fill();
        ctx.fillStyle = 'rgba(100, 130, 170, 0.4)';
        ctx.fillText('Healthy', 24, ly);

        ctx.beginPath(); ctx.arc(82, ly, 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(245, 158, 11, 0.7)'; ctx.fill();
        ctx.fillStyle = 'rgba(100, 130, 170, 0.4)';
        ctx.fillText('Warning', 92, ly);

        ctx.beginPath(); ctx.arc(155, ly, 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.7)'; ctx.fill();
        ctx.fillStyle = 'rgba(100, 130, 170, 0.4)';
        ctx.fillText('Critical', 165, ly);
      }

      animId = requestAnimationFrame(draw);
    }

    // --- Public API ---
    function setData(sectorNodes) {
      allNodes = sectorNodes || [];
      if (W === 0) resize();
      layoutNodes();
    }

    function start() {
      if (running) return;
      running = true;
      canvasEl.addEventListener('mousemove', onMouseMove);
      canvasEl.addEventListener('click', onMouseClick);
      canvasEl.addEventListener('mouseleave', onMouseLeave);
      draw();
    }

    function stop() {
      running = false;
      if (animId) { cancelAnimationFrame(animId); animId = null; }
      canvasEl.removeEventListener('mousemove', onMouseMove);
      canvasEl.removeEventListener('click', onMouseClick);
      canvasEl.removeEventListener('mouseleave', onMouseLeave);
    }

    function destroy() {
      stop();
      graphNodes = [];
      particles = [];
      stars = [];
      allNodes = [];
    }

    function onClick(cb) { clickCb = cb; }

    // Init
    initStars();
    resize();

    // Auto-resize on container resize
    const resizeObserver = new ResizeObserver(() => { resize(); });
    resizeObserver.observe(canvasEl.parentElement || canvasEl);

    return {
      setData,
      start,
      stop,
      destroy,
      onClick,
      resize,
      getNodes: () => graphNodes,
      getHovered: () => hoveredNode,
    };
  }

  // ========================================
  // SECTOR MAP (Station integration)
  // ========================================

  let sectorMapInstance = null;

  /**
   * Initialize the Sector Map inside the Station control panel.
   * Called once when the Sectors tab is first shown.
   */
  function initSectorMap() {
    const canvas = document.getElementById('sectorMapCanvas');
    const tooltip = document.getElementById('sectorMapTooltip');
    if (!canvas) return;
    if (sectorMapInstance) return; // already initialized

    sectorMapInstance = createOrbitalGraph(canvas, tooltip, {
      title: 'SECTOR MAP',
      centerId: 'core',
    });

    // Click handler: post message to extension for drill-down
    sectorMapInstance.onClick((node) => {
      vscode.postMessage({ type: 'sectorMapClick', sectorId: node.id });
    });

    sectorMapInstance.start();
  }

  /**
   * Render sector map with data from the extension backend.
   * Called when 'sectorMapData' message arrives.
   */
  function renderSectorMap(data) {
    if (!sectorMapInstance) initSectorMap();
    if (!sectorMapInstance) return;

    // data.sectors: array of { id, name, tech, color, health, deps, icon, scripts, violations, desc }
    const nodes = (data.sectors || []).map(s => ({
      id: s.id,
      name: s.name,
      tech: s.tech || ('asmdef: ' + (s.asmdefName || s.id)),
      color: s.color || '#6366f1',
      health: typeof s.health === 'number' ? s.health : 1.0,
      deps: s.deps || s.dependencies || [],
      icon: s.icon || null,
      scripts: s.scripts || 0,
      violations: s.violations || 0,
      desc: s.desc || s.description || '',
    }));

    sectorMapInstance.setData(nodes);
  }

  /**
   * Destroy sector map (cleanup on tab switch etc.)
   */
  function destroySectorMap() {
    if (sectorMapInstance) {
      sectorMapInstance.destroy();
      sectorMapInstance = null;
    }
  }

  /**
   * Force resize after the Sectors tab becomes visible.
   * Needed because canvas dimensions can't be computed while hidden.
   */
  function resizeSectorMap() {
    if (sectorMapInstance) {
      // Delay to ensure browser has laid out the visible tab
      requestAnimationFrame(() => {
        sectorMapInstance.resize();
      });
    }
  }

  /**
   * Request sector map data from the extension backend.
   */
  function requestSectorMapData() {
    vscode.postMessage({ type: 'sectorMapData' });
  }

  /**
   * Build default sector data from the known DEFAULT_RPG_SECTORS config.
   * Used as fallback when no backend data is available.
   */
  function getDefaultSectorData() {
    return [
      { id: 'core',        name: 'CORE',       tech: 'asmdef: Core',        color: '#6366f1', health: 1.0,  deps: [],                              icon: 'cpu',      scripts: 0, violations: 0 },
      { id: 'character',   name: 'HANGAR',      tech: 'asmdef: Character',   color: '#22c55e', health: 1.0,  deps: ['core'],                        icon: 'person',   scripts: 0, violations: 0 },
      { id: 'combat',      name: 'ARMORY',      tech: 'asmdef: Combat',      color: '#ef4444', health: 1.0,  deps: ['core','character','inventory'], icon: 'flame',    scripts: 0, violations: 0 },
      { id: 'inventory',   name: 'CARGO',       tech: 'asmdef: Inventory',   color: '#f59e0b', health: 1.0,  deps: ['core'],                        icon: 'archive',  scripts: 0, violations: 0 },
      { id: 'dialogue',    name: 'COMMS',       tech: 'asmdef: Dialogue',    color: '#8b5cf6', health: 1.0,  deps: ['core','quest'],                icon: 'chat',     scripts: 0, violations: 0 },
      { id: 'quest',       name: 'MISSIONS',    tech: 'asmdef: Quest',       color: '#06b6d4', health: 1.0,  deps: ['core','inventory'],            icon: 'map',      scripts: 0, violations: 0 },
      { id: 'world',       name: 'NAVIGATION',  tech: 'asmdef: World',       color: '#14b8a6', health: 1.0,  deps: ['core'],                        icon: 'globe',    scripts: 0, violations: 0 },
      { id: 'ai',          name: 'SENSORS',     tech: 'asmdef: AI',          color: '#ec4899', health: 1.0,  deps: ['core','combat','world'],       icon: 'robot',    scripts: 0, violations: 0 },
      { id: 'persistence', name: 'QUARTERS',    tech: 'asmdef: Persistence', color: '#64748b', health: 1.0,  deps: ['core'],                        icon: 'database', scripts: 0, violations: 0 },
      { id: 'ui',          name: 'BRIDGE-UI',   tech: 'asmdef: UI',          color: '#a855f7', health: 1.0,  deps: ['core'],                        icon: 'layout',   scripts: 0, violations: 0 },
      { id: 'editor',      name: 'ENGINEERING', tech: 'asmdef: Editor',      color: '#78716c', health: 1.0,  deps: [],                              icon: 'wrench',   scripts: 0, violations: 0 },
      { id: 'yard',        name: 'YARD',        tech: 'asmdef: Sandbox',     color: '#fbbf24', health: 1.0,  deps: [],                              icon: 'beaker',   scripts: 0, violations: 0 },
    ];
  }

  // ========================================
  // AI FLOW ORBITAL MODE (reuse of engine)
  // ========================================

  let aiOrbitalInstance = null;

  /**
   * Render an orbital graph for AI context flow.
   * Uses the same engine but with different data and labels.
   */
  function initAiOrbitalFlow(canvasEl, tooltipEl) {
    if (aiOrbitalInstance) aiOrbitalInstance.destroy();

    aiOrbitalInstance = createOrbitalGraph(canvasEl, tooltipEl, {
      title: 'CONTEXT FLOW',
      centerId: 'query',
      showLegend: false,
      showSummary: false,
      particleCount: 80,
      coreRadius: 32,
      ring1Radius: 22,
      ring2Radius: 18,
      ring1Ratio: 0.25,
      ring2Ratio: 0.40,
      ellipseRatio: 0.7,
    });

    return aiOrbitalInstance;
  }

  return {
    // Orbital graph engine (reusable)
    createOrbitalGraph,

    // Sector Map (Station panel)
    initSectorMap,
    renderSectorMap,
    destroySectorMap,
    resizeSectorMap,
    requestSectorMapData,
    getDefaultSectorData,

    // AI Flow orbital mode
    initAiOrbitalFlow,
  };
}
