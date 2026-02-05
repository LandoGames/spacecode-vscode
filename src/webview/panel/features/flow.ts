// @ts-nocheck

export function createFlowPanelHandlers(deps) {
  const { d3, escapeHtml } = deps;

  // ========================
  // AI FLOW VISUALIZATION (D3.js)
  // ========================

  // State for AI Flow visualization
  let aiFlowState = {
    nodes: [],
    links: [],
    simulation: null,
    svg: null,
    g: null,  // Main group for zoom/pan
    width: 0,
    height: 0,
    zoom: null
  };

  // ========================================
  // FATE WEB VISUALIZATION
  // "Threads of context weaving into an answer"
  // ========================================

  // Thread colors by source type
  const THREAD_COLORS = {
    query: '#6cf',         // Cyan - the question
    memory: '#ff6ccf',     // Pink - past conversations
    kb: '#9c6cff',         // Purple - knowledge base
    chat: '#6cff9c',       // Green - recent chat
    sector: '#ffb34d',     // Orange - rules/policy
    rules: '#ffb34d',      // Alias for sector
    response: '#6cff9c',   // Green - the answer crystal
    gpt: '#10b981',        // Emerald - GPT consultation
    claude: '#6366f1',     // Indigo - Claude responses
    skill: '#f59e0b',      // Amber - loaded skills
    agent: '#ec4899'       // Magenta - agent operations
  };

  // Alias for backwards compatibility
  const AI_FLOW_COLORS = THREAD_COLORS;

  // Fate Web state
  const fateWebState = {
    phase: 'idle',           // idle | gathering | weaving | answering | complete
    query: { text: '', tokens: 0 },
    influences: new Map(),   // id -> influence node data
    threads: [],             // thread connections
    answerTokens: 0,
    initialized: false
  };

  // Alias for backwards compatibility
  function initAiFlowVisualization() {
    initContextFlowVisualization();
  }

  let _flowInitRetries = 0;
  function initContextFlowVisualization(skipWaiting = false) {
    const canvas = document.getElementById('contextFlowCanvas');
    if (!canvas || typeof d3 === 'undefined') {
      console.warn('Fate Web: canvas not found or D3 not loaded');
      return;
    }

    // Clear existing
    d3.select(canvas).selectAll('*').remove();

    // Get dimensions - retry if layout not ready yet
    let w = canvas.clientWidth;
    let h = canvas.clientHeight;
    if ((w === 0 || h === 0) && _flowInitRetries < 10) {
      _flowInitRetries++;
      console.log('[Fate Web] Canvas has 0 dimensions, retrying...', _flowInitRetries);
      setTimeout(() => initContextFlowVisualization(skipWaiting), 200);
      return;
    }
    _flowInitRetries = 0;

    aiFlowState.width = w || 300;
    aiFlowState.height = h || 200;

    // Create SVG with D3
    const svg = d3.select(canvas)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${aiFlowState.width} ${aiFlowState.height}`)
      .attr('class', 'fate-web-svg');

    aiFlowState.svg = svg;

    // Add defs for glow filters
    const defs = svg.append('defs');

    // Glow filter for knot
    const knotGlow = defs.append('filter')
      .attr('id', 'knotGlow')
      .attr('x', '-100%').attr('y', '-100%')
      .attr('width', '300%').attr('height', '300%');
    knotGlow.append('feGaussianBlur')
      .attr('stdDeviation', '4')
      .attr('result', 'blur');
    const knotMerge = knotGlow.append('feMerge');
    knotMerge.append('feMergeNode').attr('in', 'blur');
    knotMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Glow filter for threads and particles - STRONGER glow
    const threadGlow = defs.append('filter')
      .attr('id', 'threadGlow')
      .attr('x', '-100%').attr('y', '-100%')
      .attr('width', '300%').attr('height', '300%');
    threadGlow.append('feGaussianBlur')
      .attr('stdDeviation', '4')  // Stronger blur = more glow
      .attr('result', 'blur');
    threadGlow.append('feGaussianBlur')
      .attr('in', 'SourceGraphic')
      .attr('stdDeviation', '1')
      .attr('result', 'blur2');
    const threadMerge = threadGlow.append('feMerge');
    threadMerge.append('feMergeNode').attr('in', 'blur');
    threadMerge.append('feMergeNode').attr('in', 'blur2');
    threadMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Zoom/pan behavior
    aiFlowState.zoom = d3.zoom()
      .scaleExtent([0.5, 2.5])
      .on('zoom', (event) => {
        aiFlowState.g.attr('transform', event.transform);
      });

    svg.call(aiFlowState.zoom);

    // Main group for zoom/pan
    aiFlowState.g = svg.append('g');

    // Create layer groups (back to front)
    aiFlowState.g.append('g').attr('class', 'threads-layer');
    aiFlowState.g.append('g').attr('class', 'particles-layer');
    aiFlowState.g.append('g').attr('class', 'influences-layer');
    aiFlowState.g.append('g').attr('class', 'knot-layer');

    const cx = aiFlowState.width / 2;
    const cy = aiFlowState.height / 2;

    // Create central "knot" (the synthesis point)
    const knotGroup = aiFlowState.g.select('.knot-layer').append('g')
      .attr('class', 'fate-knot')
      .attr('transform', `translate(${cx}, ${cy})`);

    // Outer glow ring
    knotGroup.append('circle')
      .attr('class', 'knot-glow-ring')
      .attr('r', 35)
      .attr('fill', 'none')
      .attr('stroke', THREAD_COLORS.query)
      .attr('stroke-width', 2)
      .attr('opacity', 0.3);

    // Main knot circle
    knotGroup.append('circle')
      .attr('class', 'knot-core')
      .attr('r', 20)
      .attr('fill', '#0a1520')
      .attr('stroke', THREAD_COLORS.query)
      .attr('stroke-width', 2.5)
      .attr('filter', 'url(#knotGlow)');

    // Inner pulse circle
    knotGroup.append('circle')
      .attr('class', 'knot-pulse')
      .attr('r', 8)
      .attr('fill', THREAD_COLORS.query)
      .attr('opacity', 0.6);

    // Query label (below knot)
    knotGroup.append('text')
      .attr('class', 'knot-label')
      .attr('y', 45)
      .attr('text-anchor', 'middle')
      .attr('fill', '#9fd')
      .attr('font-size', '10')
      .attr('font-family', 'monospace')
      .text(skipWaiting ? '' : 'Waiting...');

    // Create "answer crystal" (grows as response streams)
    const answerGroup = aiFlowState.g.select('.knot-layer').append('g')
      .attr('class', 'answer-crystal')
      .attr('transform', `translate(${cx}, ${cy + 70})`)
      .style('opacity', 0);

    answerGroup.append('polygon')
      .attr('class', 'crystal-shape')
      .attr('points', '0,-12 10,0 0,12 -10,0')
      .attr('fill', '#0f1a25')
      .attr('stroke', THREAD_COLORS.response)
      .attr('stroke-width', 2);

    answerGroup.append('text')
      .attr('class', 'crystal-label')
      .attr('y', 28)
      .attr('text-anchor', 'middle')
      .attr('fill', THREAD_COLORS.response)
      .attr('font-size', '9')
      .attr('font-family', 'monospace')
      .text('');

    fateWebState.initialized = true;
    fateWebState.phase = skipWaiting ? 'idle' : 'idle';

    console.log('[Fate Web] Initialized');
  }

  // ========================================
  // FATE WEB: EVENT-DRIVEN FUNCTIONS
  // ========================================

  // State for animation
  const flowAnimState = {
    nodes: [],
    links: [],
    simulation: null,
    isThinking: false,
    responseTokens: 0,
    responseNodeAdded: false,
    particleTimer: null,
    threadAnimTimer: null
  };

  // Get spawn position at edge (for fly-in animation)
  function getSpawnPosition() {
    const w = aiFlowState.width || 300;
    const h = aiFlowState.height || 200;
    const side = Math.floor(Math.random() * 4);
    switch (side) {
      case 0: return { x: -50, y: Math.random() * h };
      case 1: return { x: w + 50, y: Math.random() * h };
      case 2: return { x: Math.random() * w, y: -50 };
      default: return { x: Math.random() * w, y: h + 50 };
    }
  }

  // Calculate ring position for influence nodes
  function getInfluencePosition(index, total) {
    const cx = aiFlowState.width / 2;
    const cy = aiFlowState.height / 2;
    const radius = Math.min(aiFlowState.width, aiFlowState.height) * 0.35;
    const angle = (index / Math.max(6, total)) * Math.PI * 2 - Math.PI / 2;
    return {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius
    };
  }

  // Set Fate Web phase
  function setFateWebPhase(phase) {
    fateWebState.phase = phase;
    console.log('[Fate Web] Phase:', phase);

    if (!aiFlowState.g) return;

    const knot = aiFlowState.g.select('.fate-knot');

    // Update knot appearance based on phase
    knot.select('.knot-pulse')
      .classed('pulsing', phase === 'gathering' || phase === 'weaving')
      .classed('fast-pulse', phase === 'answering');

    knot.select('.knot-core')
      .classed('active', phase !== 'idle');

    // Update thread animation speed
    updateThreadAnimation(phase);
  }

  // Start new Fate Web flow
  function startAiFlow(query, queryTokens) {
    // Initialize if needed
    if (!aiFlowState.svg || !aiFlowState.g) {
      initContextFlowVisualization(true);
      if (!aiFlowState.svg) return;
    }

    // Clear previous influences
    fateWebState.influences.clear();
    fateWebState.threads = [];
    fateWebState.answerTokens = 0;
    fateWebState.query = { text: query || '', tokens: queryTokens || 0 };

    // Reset animation state
    flowAnimState.nodes = [];
    flowAnimState.links = [];
    flowAnimState.responseTokens = 0;
    flowAnimState.responseNodeAdded = false;

    // Clear visual elements
    aiFlowState.g.select('.threads-layer').selectAll('*').remove();
    aiFlowState.g.select('.particles-layer').selectAll('*').remove();
    aiFlowState.g.select('.influences-layer').selectAll('*').remove();

    // Reset answer crystal
    aiFlowState.g.select('.answer-crystal')
      .style('opacity', 0);

    // Update knot with query
    const knotLabel = query ? (query.length > 25 ? query.substring(0, 22) + '...' : query) : 'Query';
    aiFlowState.g.select('.knot-label')
      .text(knotLabel);

    // Pulse the knot to show activity
    aiFlowState.g.select('.knot-core')
      .transition()
      .duration(200)
      .attr('r', 25)
      .transition()
      .duration(300)
      .attr('r', 20);

    setFateWebPhase('gathering');
    startThreadAnimation();
    startParticleSpawning();

    // Update stats
    updateFlowStatsAnimated(queryTokens || 0, 0);

    console.log('[Fate Web] Started with query:', knotLabel);
  }

  // Create curved thread path
  function createThreadPath(source, target, strength) {
    const sx = source.x, sy = source.y;
    const tx = target.x, ty = target.y;
    const mx = (sx + tx) / 2, my = (sy + ty) / 2;
    const bend = (1 - strength) * 60 + 20;
    const nx = (sy - ty), ny = (tx - sx);
    const nlen = Math.max(1, Math.hypot(nx, ny));
    return `M${sx},${sy} Q${mx + (nx/nlen)*bend},${my + (ny/nlen)*bend} ${tx},${ty}`;
  }

  // Thread dash animation - FAST visible flow toward center
  let threadAnimTimer = null;
  function startThreadAnimation() {
    if (threadAnimTimer) return;
    let offset = 0;
    threadAnimTimer = d3.interval(() => {
      offset = (offset + 5) % 200;  // FASTER movement
      if (aiFlowState.g) {
        aiFlowState.g.selectAll('.fate-thread').attr('stroke-dashoffset', -offset);
      }
    }, 16);  // 60fps for smooth animation
  }

  function stopThreadAnimation() {
    if (threadAnimTimer) { threadAnimTimer.stop(); threadAnimTimer = null; }
    // Also stop particle spawning
    if (typeof stopParticleSpawning === 'function') {
      stopParticleSpawning();
    }
  }

  function updateThreadAnimation(phase) {
    // Could adjust speed based on phase
  }

  // Spawn particle along a thread - LARGE, BRIGHT, with comet trail
  function spawnThreadParticle(threadId, color) {
    if (!aiFlowState.g) return;
    const thread = aiFlowState.g.select(`[data-thread-id="${threadId}"]`);
    if (thread.empty()) return;
    const pathNode = thread.node();
    if (!pathNode || !pathNode.getTotalLength) return;
    const length = pathNode.getTotalLength();

    // Main particle - LARGER and BRIGHTER
    const particle = aiFlowState.g.select('.particles-layer').append('circle')
      .attr('class', 'fate-particle')
      .attr('r', 7)  // Bigger!
      .attr('fill', color)
      .attr('opacity', 1)
      .attr('filter', 'url(#threadGlow)');

    // FASTER travel to center
    particle.transition()
      .duration(500 + Math.random() * 200)
      .ease(d3.easeLinear)
      .attrTween('transform', () => (t) => {
        const p = pathNode.getPointAtLength(t * length);
        return `translate(${p.x}, ${p.y})`;
      })
      .attr('r', 3)
      .attr('opacity', 0)
      .remove();

    // Add trailing "comet tail" particle
    setTimeout(() => {
      if (!aiFlowState.g) return;
      const trail = aiFlowState.g.select('.particles-layer').append('circle')
        .attr('class', 'fate-particle trail')
        .attr('r', 5)
        .attr('fill', color)
        .attr('opacity', 0.5);
      trail.transition()
        .duration(600)
        .ease(d3.easeLinear)
        .attrTween('transform', () => (t) => {
          const p = pathNode.getPointAtLength(t * length);
          return `translate(${p.x}, ${p.y})`;
        })
        .attr('opacity', 0)
        .remove();
    }, 60);
  }

  // Spawn influence with thread (Fate Web style)
  function spawnFlowChunk(chunk) {
    if (!aiFlowState.svg || !aiFlowState.g) {
      console.warn('[Fate Web] spawnFlowChunk: not initialized');
      return;
    }

    const chunkId = chunk.id || `${chunk.source || 'chunk'}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    if (fateWebState.influences.has(chunkId)) return;

    const cx = aiFlowState.width / 2;
    const cy = aiFlowState.height / 2;

    // Calculate orbit position
    const index = fateWebState.influences.size;
    const targetPos = getInfluencePosition(index, index + 1);
    const spawnPos = getSpawnPosition();

    // Store influence data
    const influence = {
      id: chunkId,
      source: chunk.source,
      label: chunk.label || chunk.source,
      tokens: chunk.tokens || 0,
      strength: chunk.similarity || 0.7,
      x: spawnPos.x, y: spawnPos.y,
      tx: targetPos.x, ty: targetPos.y
    };
    fateWebState.influences.set(chunkId, influence);

    // Get thread color
    const color = THREAD_COLORS[chunk.source] || THREAD_COLORS.memory;

    // Create curved thread
    const threadLayer = aiFlowState.g.select('.threads-layer');
    const thread = threadLayer.append('path')
      .attr('class', `fate-thread thread-${chunk.source}`)
      .attr('data-thread-id', chunkId)
      .attr('d', createThreadPath(spawnPos, { x: cx, y: cy }, influence.strength))
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', 1.5 + influence.strength)
      .attr('stroke-dasharray', '8 10')
      .attr('opacity', 0)
      .attr('filter', 'url(#threadGlow)');

    // Thread fade in
    thread.transition().duration(300).attr('opacity', 0.7);

    // Create influence node
    const influenceLayer = aiFlowState.g.select('.influences-layer');
    const nodeRadius = 8 + Math.min(chunk.tokens || 50, 300) / 30;
    const influenceG = influenceLayer.append('g')
      .attr('class', 'fate-influence')
      .attr('data-influence-id', chunkId)
      .attr('transform', `translate(${spawnPos.x}, ${spawnPos.y})`)
      .style('opacity', 0);

    // Node circle
    influenceG.append('circle')
      .attr('r', nodeRadius)
      .attr('fill', color)
      .attr('opacity', 0.85)
      .attr('filter', 'url(#threadGlow)');

    // Label
    influenceG.append('text')
      .attr('y', nodeRadius + 14)
      .attr('text-anchor', 'middle')
      .attr('fill', '#9fd')
      .attr('font-size', '9')
      .attr('font-family', 'monospace')
      .text(chunk.label || chunk.source);

    // Token count
    influenceG.append('text')
      .attr('y', nodeRadius + 24)
      .attr('text-anchor', 'middle')
      .attr('fill', '#666')
      .attr('font-size', '8')
      .text(`${chunk.tokens || 0}t`);

    // Fly-in animation
    influenceG.transition()
      .duration(200)
      .style('opacity', 1)
      .transition()
      .duration(600)
      .ease(d3.easeCubicOut)
      .attr('transform', `translate(${targetPos.x}, ${targetPos.y})`)
      .on('end', () => {
        influence.x = targetPos.x;
        influence.y = targetPos.y;
        // Update thread to final position
        thread.transition().duration(300)
          .attr('d', createThreadPath(targetPos, { x: cx, y: cy }, influence.strength));
      });

    // Spawn particle flowing along thread
    setTimeout(() => spawnThreadParticle(chunkId, color), 250);

    // Update stats
    const totalTokens = Array.from(fateWebState.influences.values())
      .reduce((sum, inf) => sum + (inf.tokens || 0), 0) + (fateWebState.query.tokens || 0);
    updateFlowStatsAnimated(totalTokens, fateWebState.influences.size);

    console.log('[Fate Web] Added influence:', chunk.label);
  }

  // Tick function for simulation
  function tickFlowAnimation() {
    if (!aiFlowState.g) return;

    // Update node positions
    aiFlowState.g.selectAll('.flow-node')
      .attr('transform', function() {
        const id = d3.select(this).attr('data-node-id');
        const node = flowAnimState.nodes.find(n => n.id === id);
        if (node) {
          return `translate(${node.x}, ${node.y})`;
        }
        return d3.select(this).attr('transform');
      });

    // Update link positions
    aiFlowState.g.selectAll('.flow-link')
      .attr('x1', function() {
        const linkId = d3.select(this).attr('data-link-id');
        if (!linkId) return 0;
        const [sourceId] = linkId.split('-');
        const source = flowAnimState.nodes.find(n => n.id === sourceId);
        return source ? source.x : 0;
      })
      .attr('y1', function() {
        const linkId = d3.select(this).attr('data-link-id');
        if (!linkId) return 0;
        const [sourceId] = linkId.split('-');
        const source = flowAnimState.nodes.find(n => n.id === sourceId);
        return source ? source.y : 0;
      })
      .attr('x2', function() {
        const linkId = d3.select(this).attr('data-link-id');
        if (!linkId) return 0;
        const targetId = linkId.split('-').slice(1).join('-');
        const target = flowAnimState.nodes.find(n => n.id === targetId);
        return target ? target.x : 0;
      })
      .attr('y2', function() {
        const linkId = d3.select(this).attr('data-link-id');
        if (!linkId) return 0;
        const targetId = linkId.split('-').slice(1).join('-');
        const target = flowAnimState.nodes.find(n => n.id === targetId);
        return target ? target.y : 0;
      });
  }

  // Particle spawning interval
  let particleSpawnTimer = null;
  // Continuous AI burst timer (knot → AI particles while thinking)
  let aiBurstTimer = null;

  // Set thinking state - Fate Web version
  // Create the AI destination node (shows request being processed)
  // Provider-specific colors: Claude = Indigo, GPT = Emerald
  // Supports multiple concurrent AI nodes via nodeId
  // modelLabel: optional specific model name (e.g., "Claude Haiku 4.5")
  function createAINode(provider = 'claude', nodeId = 'main', modelLabel?: string) {
    if (!aiFlowState.g) return;

    // Remove only THIS specific node if it exists (for replacement)
    aiFlowState.g.select(`.ai-processor-node[data-node-id="${nodeId}"]`).remove();

    const cx = aiFlowState.width / 2;
    const cy = aiFlowState.height / 2;

    // Position based on nodeId — spread multiple AI nodes around the knot
    const nodePositions: Record<string, { x: number; y: number }> = {
      'main':           { x: 0, y: -120 },
      'gpt-consult':    { x: 130, y: -80 },
      'claude-refine':  { x: 130, y: 30 },
    };
    const pos = nodePositions[nodeId] || nodePositions['main'];
    const aiX = cx + pos.x;
    const aiY = cy + pos.y;

    // Provider-specific styling
    const isGPT = provider === 'gpt';
    const providerColor = isGPT ? '#10b981' : '#6366f1';  // Emerald for GPT, Indigo for Claude
    const providerIcon = isGPT ? '🤖' : '✨';
    // Use specific model label if provided, otherwise generic provider name
    const providerLabel = modelLabel || (isGPT ? 'GPT' : 'Claude');

    const aiNode = aiFlowState.g.select('.influences-layer').append('g')
      .attr('class', 'ai-processor-node')
      .attr('data-node-id', nodeId)
      .attr('data-provider', provider)
      .attr('data-ai-x', aiX)
      .attr('data-ai-y', aiY)
      .attr('transform', `translate(${aiX}, ${aiY})`)
      .style('opacity', 0);

    // Outer glow ring
    aiNode.append('circle')
      .attr('class', 'ai-glow-ring')
      .attr('r', 35)
      .attr('fill', 'none')
      .attr('stroke', providerColor)
      .attr('stroke-width', 2)
      .attr('opacity', 0.4);

    // Main circle
    aiNode.append('circle')
      .attr('class', 'ai-core')
      .attr('r', 25)
      .attr('fill', '#1a1a2e')
      .attr('stroke', providerColor)
      .attr('stroke-width', 3)
      .attr('filter', 'url(#threadGlow)');

    // Provider icon
    aiNode.append('text')
      .attr('class', 'ai-icon')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('fill', providerColor)
      .attr('font-size', '16')
      .text(providerIcon);

    // Label
    aiNode.append('text')
      .attr('class', 'ai-label')
      .attr('y', 40)
      .attr('text-anchor', 'middle')
      .attr('fill', providerColor)
      .attr('font-size', '10')
      .attr('font-family', 'monospace')
      .text(providerLabel);

    // No thread lines — particle flow between knot and AI nodes is enough

    // Fade in
    aiNode.transition().duration(400).style('opacity', 1);
  }

  // Burst particles FROM center TO ALL active AI nodes
  function burstToAI(count = 8) {
    if (!aiFlowState.g) return;
    const cx = aiFlowState.width / 2;
    const cy = aiFlowState.height / 2;

    // Gather all active AI processor nodes
    const aiNodes = aiFlowState.g.selectAll('.ai-processor-node');
    if (aiNodes.empty()) return;

    aiNodes.each(function() {
      const node = d3.select(this);
      const provider = node.attr('data-provider') || 'claude';
      const aiX = parseFloat(node.attr('data-ai-x')) || cx;
      const aiY = parseFloat(node.attr('data-ai-y')) || (cy - 120);
      const particleColor = provider === 'gpt' ? '#10b981' : '#6366f1';

      for (let i = 0; i < count; i++) {
        setTimeout(() => {
          const particle = aiFlowState.g.select('.particles-layer').append('circle')
            .attr('class', 'fate-particle request-particle')
            .attr('cx', cx + (Math.random() - 0.5) * 30)
            .attr('cy', cy - 20)
            .attr('r', 6)
            .attr('fill', particleColor)
            .attr('opacity', 1)
          .attr('filter', 'url(#threadGlow)');

        particle.transition()
          .duration(400 + Math.random() * 200)
          .ease(d3.easeCubicOut)
          .attr('cx', aiX + (Math.random() - 0.5) * 20)
          .attr('cy', aiY + 30)
          .attr('r', 3)
          .attr('opacity', 0)
          .remove();
      }, i * 40);
    }
    }); // end aiNodes.each
  }

  // Burst particles FROM AI back TO center (response arriving)
  function burstFromAI(count = 4) {
    if (!aiFlowState.g) return;
    const cx = aiFlowState.width / 2;
    const cy = aiFlowState.height / 2;

    // Burst from all active AI nodes
    const aiNodes = aiFlowState.g.selectAll('.ai-processor-node');
    if (aiNodes.empty()) return;
    const firstNode = d3.select(aiNodes.node());
    const aiX = parseFloat(firstNode.attr('data-ai-x')) || cx;
    const aiY = parseFloat(firstNode.attr('data-ai-y')) || (cy - 120);

    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        const particle = aiFlowState.g.select('.particles-layer').append('circle')
          .attr('class', 'fate-particle response-particle')
          .attr('cx', cx + (Math.random() - 0.5) * 20)
          .attr('cy', aiY + 35)
          .attr('r', 5)
          .attr('fill', '#6cff9c')
          .attr('opacity', 1)
          .attr('filter', 'url(#threadGlow)');

        particle.transition()
          .duration(300 + Math.random() * 150)
          .ease(d3.easeCubicIn)
          .attr('cx', cx + (Math.random() - 0.5) * 15)
          .attr('cy', cy - 15)
          .attr('r', 2)
          .attr('opacity', 0)
          .remove();
      }, i * 30);
    }
  }

  // Pulse ALL AI nodes
  function pulseAINode() {
    if (!flowAnimState.isThinking || !aiFlowState.g) return;
    const aiCores = aiFlowState.g.selectAll('.ai-core');
    if (aiCores.empty()) return;

    aiCores.each(function() {
      d3.select(this)
        .transition().duration(500).attr('r', 30).attr('stroke-width', 4)
        .transition().duration(500).attr('r', 25).attr('stroke-width', 3)
        .on('end', () => {
          if (flowAnimState.isThinking) pulseAINode();
        });
    });
  }

  function setFlowThinking(on, stage, provider = 'claude', nodeId = 'main', modelLabel?: string) {
    if (!aiFlowState.g) return;

    const knot = aiFlowState.g.select('.fate-knot');
    const knotCore = knot.select('.knot-core');

    if (on) {
      flowAnimState.isThinking = true;
      setFateWebPhase('weaving');

      // Create AI processor node (supports multiple concurrent nodes)
      createAINode(provider, nodeId, modelLabel);
      setTimeout(() => {
        burstToAI(10);
        pulseAINode();
      }, 200);

      // Start knot pulsing (only on first call)
      animateKnotPulse();

      // Update label
      knot.select('.knot-label').text(stage || 'Weaving...');

      // Brighten threads
      aiFlowState.g.selectAll('.fate-thread')
        .transition().duration(300).attr('opacity', 0.9);

      // Start continuous particle spawning (context → center)
      startParticleSpawning();

      // Start continuous AI burst (knot → AI particles) for visible flow
      if (!aiBurstTimer) {
        aiBurstTimer = setInterval(() => {
          if (flowAnimState.isThinking) {
            burstToAI(2);
          }
        }, 350);
      }
    } else {
      flowAnimState.isThinking = false;
      setFateWebPhase('complete');

      // Stop continuous AI burst
      if (aiBurstTimer) { clearInterval(aiBurstTimer); aiBurstTimer = null; }

      // Stop pulsing, turn green for complete
      knotCore.interrupt()
        .transition().duration(300)
        .attr('r', 20)
        .attr('stroke', '#6cff9c');

      knot.select('.knot-label').text('Complete');

      // Fade ALL AI nodes
      aiFlowState.g.selectAll('.ai-processor-node')
        .transition().duration(500).style('opacity', 0.3);

      // Stop ALL AI pulsing
      aiFlowState.g.selectAll('.ai-core').interrupt();

      // Fade threads and stop particles
      aiFlowState.g.selectAll('.fate-thread')
        .transition().duration(500).attr('opacity', 0.4);
      stopParticleSpawning();
      stopThreadAnimation();
    }
  }

  // Start spawning particles continuously
  function startParticleSpawning() {
    if (particleSpawnTimer) return;
    particleSpawnTimer = setInterval(() => {
      if (fateWebState.phase === 'idle' || fateWebState.phase === 'complete') return;
      if (!fateWebState.influences.size) return;

      const influences = Array.from(fateWebState.influences.values());

      // Spawn 2-3 particles on different threads for dense, visible flow
      const numToSpawn = Math.min(3, influences.length);
      const shuffled = influences.sort(() => Math.random() - 0.5);

      for (let i = 0; i < numToSpawn; i++) {
        const inf = shuffled[i];
        if (inf) {
          const color = THREAD_COLORS[inf.source] || THREAD_COLORS.memory;
          setTimeout(() => spawnThreadParticle(inf.id, color), i * 20);
        }
      }
    }, 80);  // Every 80ms, spawn 2-3 particles = constant visible stream
  }

  // Stop particle spawning
  function stopParticleSpawning() {
    if (particleSpawnTimer) {
      clearInterval(particleSpawnTimer);
      particleSpawnTimer = null;
    }
  }

  // Animate knot pulsing
  function animateKnotPulse() {
    if (!flowAnimState.isThinking || !aiFlowState.g) return;
    const knotCore = aiFlowState.g.select('.knot-core');
    knotCore
      .transition().duration(400).attr('r', 24)
      .transition().duration(400).attr('r', 18)
      .on('end', animateKnotPulse);
  }

  // Old function kept for compatibility (unused)
  function animateThinkingPulse(circle) {
    if (!flowAnimState.isThinking) return;
    circle
      .transition()
      .duration(600)
      .attr('r', 28)
      .transition()
      .duration(600)
      .attr('r', 22)
      .on('end', () => animateThinkingPulse(circle));
  }

  // Update stats with animation
  function updateFlowStatsAnimated(tokens, chunks) {
    const tokensEl = document.getElementById('flowPanelTokens');
    const chunksEl = document.getElementById('flowPanelChunks');

    if (tokensEl) {
      tokensEl.classList.add('updating');
      tokensEl.textContent = `${tokens} tokens`;
      setTimeout(() => tokensEl.classList.remove('updating'), 300);
    }
    if (chunksEl) {
      chunksEl.classList.add('updating');
      chunksEl.textContent = `${chunks} chunks`;
      setTimeout(() => chunksEl.classList.remove('updating'), 300);
    }
  }

  // ========================================
  // PARTICLE FLOW SYSTEM - Animated data flow
  // ========================================

  let particleAnimationId = null;

  // Start continuous particle flow along all links
  function startParticleFlow() {
    if (particleAnimationId) return; // Already running

    const particleGroup = aiFlowState.g.select('.flow-particles');
    if (particleGroup.empty()) {
      aiFlowState.g.insert('g', '.flow-nodes')
        .attr('class', 'flow-particles');
    }

    function spawnParticle() {
      if (!aiFlowState.g || flowAnimState.links.length === 0) return;

      const pGroup = aiFlowState.g.select('.flow-particles');

      // Pick a random link
      const link = flowAnimState.links[Math.floor(Math.random() * flowAnimState.links.length)];
      const sourceNode = flowAnimState.nodes.find(n => n.id === (link.source.id || link.source));
      const targetNode = flowAnimState.nodes.find(n => n.id === (link.target.id || link.target));

      if (!sourceNode || !targetNode) return;

      // Start from the chunk (target), flow toward query (source)
      const startX = targetNode.x;
      const startY = targetNode.y;
      const endX = sourceNode.x;
      const endY = sourceNode.y;

      // Get color from source type
      const chunkNode = flowAnimState.nodes.find(n => n.id === link.target);
      const color = chunkNode ? (AI_FLOW_COLORS[chunkNode.source] || '#00d4ff') : '#00d4ff';

      // Create particle
      const particle = pGroup.append('circle')
        .attr('class', 'flow-particle')
        .attr('cx', startX)
        .attr('cy', startY)
        .attr('r', 3)
        .attr('fill', color)
        .attr('opacity', 0.8);

      // Animate toward center
      particle
        .transition()
        .duration(800 + Math.random() * 400)
        .ease(d3.easeQuadIn)
        .attr('cx', endX)
        .attr('cy', endY)
        .attr('r', 1)
        .attr('opacity', 0)
        .remove();
    }

    // Spawn particles at interval
    function particleLoop() {
      spawnParticle();
      if (flowAnimState.links.length > 0) {
        // More particles when thinking
        const interval = flowAnimState.isThinking ? 80 : 200;
        particleAnimationId = setTimeout(particleLoop, interval);
      }
    }

    particleLoop();
  }

  // Stop particle flow
  function stopParticleFlow() {
    if (particleAnimationId) {
      clearTimeout(particleAnimationId);
      particleAnimationId = null;
    }
  }

  // Add ripple effect during thinking
  function addThinkingRipples() {
    if (!aiFlowState.g || !flowAnimState.isThinking) return;

    const cx = aiFlowState.width / 2;
    const cy = aiFlowState.height / 2;

    const ripple = aiFlowState.g.select('.flow-nodes').insert('circle', ':first-child')
      .attr('class', 'thinking-ripple')
      .attr('cx', cx)
      .attr('cy', cy)
      .attr('r', 25)
      .attr('fill', 'none')
      .attr('stroke', AI_FLOW_COLORS.query)
      .attr('stroke-width', 2)
      .attr('opacity', 0.5);

    ripple
      .transition()
      .duration(1500)
      .attr('r', 100)
      .attr('opacity', 0)
      .attr('stroke-width', 0.5)
      .remove()
      .on('end', () => {
        if (flowAnimState.isThinking) {
          addThinkingRipples();
        }
      });
  }

  // Enhanced setFlowThinking with ripples and particles
  const originalSetFlowThinking = setFlowThinking;
  setFlowThinking = function(on, stage, provider, nodeId, modelLabel?) {
    // Call original to create AI node, set phase, pulse, brighten threads, etc.
    originalSetFlowThinking(on, stage, provider, nodeId, modelLabel);

    // Add thinking-active class to container for CSS animations
    if (aiFlowState.g) {
      aiFlowState.g.classed('thinking-active', on);
    }

    if (on) {
      // Start ripples
      addThinkingRipples();
      // Boost particle rate (handled in particle loop)
      startParticleFlow();

      // Show stage label
      if (aiFlowState.g) {
        const queryG = aiFlowState.g.select('[data-node-id="query"]');
        queryG.select('.thinking-label').remove();
        queryG.append('text')
          .attr('class', 'thinking-label')
          .attr('y', 40)
          .attr('text-anchor', 'middle')
          .attr('fill', AI_FLOW_COLORS.query)
          .attr('font-size', '11')
          .attr('font-weight', '500')
          .text(stage || 'Generating...');
      }
    } else {
      // Remove thinking label
      if (aiFlowState.g) {
        aiFlowState.g.selectAll('.thinking-label').remove();
        aiFlowState.g.selectAll('.thinking-ripple').remove();
      }
    }
  };

  // Auto-start particles when chunks exist
  const originalSpawnFlowChunk = spawnFlowChunk;
  spawnFlowChunk = function(chunk) {
    originalSpawnFlowChunk(chunk);
    // Start particle flow after first chunk
    if (flowAnimState.links.length === 1) {
      startParticleFlow();
    }
  };

  // ========================================
  // RESPONSE STREAMING VISUALIZATION
  // ========================================

  // Burst particles from all threads toward center (dramatic effect on chunk receive)
  function burstParticlesToCenter(intensity = 3) {
    if (!aiFlowState.g || !fateWebState.influences.size) return;
    const influences = Array.from(fateWebState.influences.values());
    const cx = aiFlowState.width / 2;
    const cy = aiFlowState.height / 2;

    // Spawn multiple particles from random threads
    for (let i = 0; i < Math.min(intensity, influences.length * 2); i++) {
      setTimeout(() => {
        const inf = influences[Math.floor(Math.random() * influences.length)];
        if (!inf) return;
        const color = THREAD_COLORS[inf.source] || THREAD_COLORS.memory;

        // Create larger, brighter particle with glow
        const particle = aiFlowState.g.select('.particles-layer').append('circle')
          .attr('class', 'fate-particle burst-particle')
          .attr('cx', inf.x || inf.tx)
          .attr('cy', inf.y || inf.ty)
          .attr('r', 7)
          .attr('fill', color)
          .attr('opacity', 1)
          .attr('filter', 'url(#threadGlow)');

        // Animate to center
        particle.transition()
          .duration(350 + Math.random() * 150)
          .ease(d3.easeCubicIn)
          .attr('cx', cx)
          .attr('cy', cy)
          .attr('r', 2)
          .attr('opacity', 0)
          .remove();
      }, i * 25);
    }
  }

  // Pulse the central knot brightly (called on chunk receive)
  function pulseKnotOnChunk() {
    if (!aiFlowState.g) return;
    const knotCore = aiFlowState.g.select('.knot-core');
    if (knotCore.empty()) return;

    // Quick bright flash
    knotCore.interrupt()
      .attr('r', 30)
      .attr('stroke', '#fff')
      .attr('stroke-width', 5)
      .transition().duration(120)
      .attr('r', 22)
      .attr('stroke', '#6cf')
      .attr('stroke-width', 3)
      .on('end', () => {
        if (flowAnimState.isThinking) animateKnotPulse();
      });
  }

  // Add or update response node showing tokens as they stream
  function updateResponseNode(tokensDelta) {
    if (!aiFlowState.g) return;

    flowAnimState.responseTokens += tokensDelta;
    const tokens = flowAnimState.responseTokens;

    // *** DRAMATIC VISUAL: Show response flowing FROM AI back to center! ***
    if (tokensDelta > 0) {
      // Green particles burst from AI node → center (response arriving!)
      if (typeof burstFromAI === 'function') {
        burstFromAI(Math.min(5, Math.ceil(tokensDelta / 10)));
      }
      // Also burst context particles to center
      if (fateWebState.influences.size > 0) {
        burstParticlesToCenter(Math.min(4, Math.ceil(tokensDelta / 12)));
      }
      pulseKnotOnChunk();
    }

    const nodeGroup = aiFlowState.g.select('.flow-nodes');
    const linkGroup = aiFlowState.g.select('.flow-links');
    const cx = aiFlowState.width / 2;
    const cy = aiFlowState.height / 2;

    // Calculate node size based on tokens (grows as response gets longer)
    const baseSize = 12;
    const maxSize = 30;
    const size = Math.min(maxSize, baseSize + Math.log(tokens + 1) * 3);

    if (!flowAnimState.responseNodeAdded) {
      // Create response node for the first time
      flowAnimState.responseNodeAdded = true;

      // Add response node below query
      const respX = cx;
      const respY = cy + 80;

      // Add to state
      flowAnimState.nodes.push({
        id: 'response',
        source: 'response',
        label: 'Response',
        tokens: tokens,
        x: respX,
        y: respY
      });

      // Add link from query to response (data flowing out)
      flowAnimState.links.push({
        source: 'query',
        target: 'response'
      });

      // Create the link
      linkGroup.append('line')
        .attr('class', 'flow-link response-link')
        .attr('data-link-target', 'response')
        .attr('x1', cx)
        .attr('y1', cy + 20)
        .attr('x2', respX)
        .attr('y2', respY - size)
        .attr('stroke', AI_FLOW_COLORS.response)
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '4,4')
        .style('opacity', 0)
        .transition()
        .duration(300)
        .style('opacity', 0.6);

      // Create the node
      const nodeG = nodeGroup.append('g')
        .attr('class', 'flow-node response-node')
        .attr('data-node-id', 'response')
        .attr('transform', `translate(${respX}, ${respY})`)
        .style('opacity', 0);

      // Pulsing glow circle
      nodeG.append('circle')
        .attr('class', 'response-glow')
        .attr('r', size + 8)
        .attr('fill', 'none')
        .attr('stroke', AI_FLOW_COLORS.response)
        .attr('stroke-width', 2)
        .attr('opacity', 0.3);

      // Main circle
      nodeG.append('circle')
        .attr('class', 'response-circle')
        .attr('r', size)
        .attr('fill', AI_FLOW_COLORS.response)
        .attr('opacity', 0.9)
        .attr('filter', 'url(#flowGlow)');

      // Token count label
      nodeG.append('text')
        .attr('class', 'response-tokens')
        .attr('y', size + 16)
        .attr('text-anchor', 'middle')
        .attr('fill', AI_FLOW_COLORS.response)
        .attr('font-size', '10')
        .text(`${tokens} tokens`);

      // Fade in
      nodeG.transition()
        .duration(300)
        .style('opacity', 1);

    } else {
      // Update existing response node
      const nodeG = aiFlowState.g.select('[data-node-id="response"]');

      // Update circles with smooth transition
      nodeG.select('.response-circle')
        .transition()
        .duration(100)
        .attr('r', size);

      nodeG.select('.response-glow')
        .transition()
        .duration(100)
        .attr('r', size + 8);

      // Update token count
      nodeG.select('.response-tokens')
        .text(`${tokens} tokens`)
        .attr('y', size + 16);

      // Update link endpoint
      linkGroup.select('[data-link-target="response"]')
        .attr('y2', cy + 80 - size);
    }
  }

  // Show completion state on response node
  function showResponseComplete(finalTokens) {
    if (!aiFlowState.g) return;

    const nodeG = aiFlowState.g.select('[data-node-id="response"]');
    if (nodeG.empty()) return;

    // Update final token count
    flowAnimState.responseTokens = finalTokens || flowAnimState.responseTokens;
    nodeG.select('.response-tokens')
      .text(`${flowAnimState.responseTokens} tokens`);

    // Add completion indicator
    nodeG.select('.response-glow')
      .transition()
      .duration(500)
      .attr('stroke', '#00ff88') // Green for complete
      .attr('opacity', 0.5);

    // Pulse effect
    nodeG.select('.response-circle')
      .transition()
      .duration(200)
      .attr('r', parseFloat(nodeG.select('.response-circle').attr('r')) + 5)
      .transition()
      .duration(200)
      .attr('r', parseFloat(nodeG.select('.response-circle').attr('r')));

    // Add checkmark
    nodeG.append('text')
      .attr('class', 'response-check')
      .attr('y', 5)
      .attr('text-anchor', 'middle')
      .attr('fill', '#00ff88')
      .attr('font-size', '16')
      .attr('font-weight', 'bold')
      .style('opacity', 0)
      .text('✓')
      .transition()
      .duration(300)
      .style('opacity', 1);
  }

  // Reset response tracking for new query
  function resetResponseTracking() {
    flowAnimState.responseTokens = 0;
    flowAnimState.responseNodeAdded = false;
  }

  // ========================================
  // END RESPONSE STREAMING
  // ========================================

  // ========================================
  // END PARTICLE FLOW SYSTEM
  // ========================================

  // ========================================
  // NEW AI ACTIVITY PANEL UI FUNCTIONS
  // ========================================

  // Track sources for stats
  let contextSourceCount = 0;
  let contextTokenCount = 0;

  // Set AI stage indicator
  function setAiStage(stage, text) {
    const indicator = document.getElementById('aiStageIndicator');
    if (!indicator) return;

    // Remove all stage classes
    indicator.classList.remove('retrieving', 'thinking', 'generating', 'complete', 'error');
    // Add new stage class
    if (stage) {
      indicator.classList.add(stage);
    }
    // Update text
    const textEl = indicator.querySelector('.stage-text');
    if (textEl) {
      textEl.textContent = text || 'Waiting for input...';
    }
  }

  // Clear context sources list
  function clearContextSources() {
    const list = document.getElementById('contextSourcesList');
    if (list) {
      list.innerHTML = '<div class="empty-sources">Retrieving context...</div>';
    }
    contextSourceCount = 0;
    contextTokenCount = 0;
    updateFlowStats();
  }

  // Add a context source card (with actual content!)
  function addContextSourceCard(chunk) {
    const list = document.getElementById('contextSourcesList');
    if (!list) return;

    // Remove empty state
    const empty = list.querySelector('.empty-sources');
    if (empty) empty.remove();

    // Update counts
    contextSourceCount++;
    contextTokenCount += chunk.tokens || 0;
    updateFlowStats();

    // Create card
    const card = document.createElement('div');
    card.className = 'context-source-card';
    card.dataset.chunkId = chunk.id;

    // Determine similarity display
    const simPercent = chunk.similarity ? Math.round(chunk.similarity * 100) : null;

    card.innerHTML = `
      <div class="source-card-header">
        <span class="source-type-badge ${chunk.source}"></span>
        <span class="source-title">${escapeHtml(chunk.label)}</span>
        <span class="source-tokens">${chunk.tokens} tok</span>
        ${simPercent ? `<span class="source-score">${simPercent}%</span>` : ''}
      </div>
      <div class="source-content-preview">
        ${chunk.content ? escapeHtml(chunk.content) : '<em>No preview available</em>'}
      </div>
    `;

    // Toggle expand on click
    card.addEventListener('click', () => {
      card.classList.toggle('expanded');
    });

    list.appendChild(card);

    // Scroll to show new card
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Update stats display
  function updateFlowStats() {
    const tokensEl = document.getElementById('flowPanelTokens');
    const chunksEl = document.getElementById('flowPanelChunks');
    if (tokensEl) tokensEl.textContent = `${contextTokenCount} tokens`;
    if (chunksEl) chunksEl.textContent = `${contextSourceCount} sources`;
  }

  // Show live response section
  function showLiveResponse() {
    const section = document.getElementById('liveResponseSection');
    if (section) {
      section.style.display = 'block';
    }
    const text = document.getElementById('liveResponseText');
    if (text) {
      text.textContent = '';
    }
    // Reset token counter
    const counter = document.getElementById('responseTokenCounter');
    if (counter) counter.textContent = '0 tokens';
  }

  // Hide live response section
  function hideLiveResponse() {
    const section = document.getElementById('liveResponseSection');
    if (section) {
      section.style.display = 'none';
    }
  }

  // Update live response text (called on each chunk)
  function updateLiveResponseText(chunkText, totalTokens) {
    const textEl = document.getElementById('liveResponseText');
    if (textEl) {
      // Append new text
      textEl.textContent += chunkText;
      // Keep only last 500 chars to prevent overflow
      if (textEl.textContent.length > 500) {
        textEl.textContent = '...' + textEl.textContent.slice(-497);
      }
      // Auto-scroll
      textEl.scrollTop = textEl.scrollHeight;
    }
    // Update token counter
    const counter = document.getElementById('responseTokenCounter');
    if (counter) {
      counter.textContent = `${totalTokens} tokens`;
    }
  }

  // Toggle mini graph visibility
  function toggleMiniGraph() {
    const canvas = document.querySelector('.flow-panel-canvas.mini');
    const toggle = document.getElementById('miniGraphToggle');
    if (canvas && toggle) {
      canvas.classList.toggle('collapsed');
      toggle.classList.toggle('collapsed');
    }
  }
  // Make globally accessible

  // ========================================
  // END AI ACTIVITY PANEL UI
  // ========================================

  // ========================================
  // END EVENT-DRIVEN FLOW FUNCTIONS
  // ========================================

  // D3.js Force Simulation for AI Flow
  function renderAiFlow(contextData) {
    console.log('[SpaceCode] renderAiFlow called with:', contextData);
    console.log('[SpaceCode] aiFlowState.svg:', aiFlowState.svg ? 'exists' : 'NULL');
    console.log('[SpaceCode] aiFlowState.g:', aiFlowState.g ? 'exists' : 'NULL');

    if (!aiFlowState.svg || !aiFlowState.g) {
      console.warn('[SpaceCode] renderAiFlow: SVG not initialized, trying to init...');
      initContextFlowVisualization();
      if (!aiFlowState.svg || !aiFlowState.g) {
        console.error('[SpaceCode] renderAiFlow: Failed to initialize SVG');
        return;
      }
    }

    const linkGroup = aiFlowState.g.select('.flow-links');
    const nodeGroup = aiFlowState.g.select('.flow-nodes');

    // Build nodes from context data
    const nodes = [];
    const links = [];

    const cx = aiFlowState.width / 2;
    const cy = aiFlowState.height / 2;

    // Central query node (fixed position)
    nodes.push({
      id: 'query',
      type: 'query',
      label: contextData.query ? contextData.query.substring(0, 20) + '...' : 'Query',
      size: 20,
      tokens: contextData.queryTokens || 0,
      fx: cx,  // Fixed x
      fy: cy   // Fixed y
    });

    // Memory chunks
    (contextData.memoryChunks || []).forEach((chunk, i) => {
      const nodeId = `memory-${i}`;
      nodes.push({
        id: nodeId,
        type: 'memory',
        label: chunk.label || `Memory ${i + 1}`,
        size: 8 + Math.min(chunk.tokens || 100, 500) / 50,
        tokens: chunk.tokens || 0,
        similarity: chunk.similarity || 0.5
      });
      links.push({
        source: 'query',
        target: nodeId,
        distance: 60 + (1 - (chunk.similarity || 0.5)) * 80
      });
    });

    // Knowledge base chunks
    (contextData.kbChunks || []).forEach((chunk, i) => {
      const nodeId = `kb-${i}`;
      nodes.push({
        id: nodeId,
        type: 'kb',
        label: chunk.label || `KB ${i + 1}`,
        size: 8 + Math.min(chunk.tokens || 100, 500) / 50,
        tokens: chunk.tokens || 0,
        similarity: chunk.similarity || 0.5
      });
      links.push({
        source: 'query',
        target: nodeId,
        distance: 60 + (1 - (chunk.similarity || 0.5)) * 80
      });
    });

    // Chat history
    (contextData.chatHistory || []).forEach((msg, i) => {
      const nodeId = `chat-${i}`;
      nodes.push({
        id: nodeId,
        type: 'chat',
        label: msg.role === 'user' ? 'User' : 'AI',
        size: 6 + Math.min(msg.tokens || 50, 300) / 40,
        tokens: msg.tokens || 0
      });
      links.push({
        source: 'query',
        target: nodeId,
        distance: 100
      });
    });

    // Sector rules
    if (contextData.sectorRules) {
      nodes.push({
        id: 'sector',
        type: 'sector',
        label: contextData.sectorRules.name || 'Sector',
        size: 12,
        tokens: contextData.sectorRules.tokens || 0
      });
      links.push({
        source: 'query',
        target: 'sector',
        distance: 90
      });
    }

    // Stop existing simulation
    if (aiFlowState.simulation) {
      aiFlowState.simulation.stop();
    }

    // Create D3 force simulation
    aiFlowState.simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links)
        .id(d => d.id)
        .distance(d => d.distance || 100)
      )
      .force('charge', d3.forceManyBody().strength(-200))
      .force('collision', d3.forceCollide().radius(d => d.size + 15))
      .force('center', d3.forceCenter(cx, cy).strength(0.05));

    // Create links with D3 data join
    const link = linkGroup.selectAll('line')
      .data(links)
      .join(
        enter => enter.append('line')
          .attr('stroke', '#333')
          .attr('stroke-width', 1)
          .attr('stroke-dasharray', '3,3')
          .attr('marker-end', 'url(#flowArrow)')
          .attr('opacity', 0)
          .call(enter => enter.transition().duration(500).attr('opacity', 1)),
        update => update,
        exit => exit.transition().duration(300).attr('opacity', 0).remove()
      );

    // Drag functions
    function dragstarted(event, d) {
      if (!event.active) aiFlowState.simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event, d) {
      if (!event.active) aiFlowState.simulation.alphaTarget(0);
      // Keep query node fixed, release others
      if (d.type !== 'query') {
        d.fx = null;
        d.fy = null;
      }
    }

    // Create node groups with D3 data join
    const node = nodeGroup.selectAll('g.flow-node')
      .data(nodes, d => d.id)
      .join(
        enter => {
          const g = enter.append('g')
            .attr('class', 'flow-node')
            .style('cursor', 'pointer')
            .attr('opacity', 0)
            .call(enter => enter.transition().duration(500).attr('opacity', 1));

          // Circle
          g.append('circle')
            .attr('r', d => d.size)
            .attr('fill', d => AI_FLOW_COLORS[d.type] || '#666')
            .attr('filter', 'url(#flowGlow)')
            .attr('opacity', 0.9);

          // Label
          g.append('text')
            .attr('y', d => d.size + 12)
            .attr('text-anchor', 'middle')
            .attr('fill', '#888')
            .attr('font-size', '9')
            .text(d => d.label);

          // Token count
          g.append('text')
            .attr('class', 'token-label')
            .attr('y', d => d.size + 22)
            .attr('text-anchor', 'middle')
            .attr('fill', '#555')
            .attr('font-size', '8')
            .text(d => d.tokens ? `${d.tokens}t` : '');

          // Click handler
          g.on('click', (event, d) => showFlowNodeDetails(d));

          // Drag behavior
          g.call(d3.drag()
            .on('start', dragstarted)
            .on('drag', dragged)
            .on('end', dragended)
          );

          return g;
        },
        update => update,
        exit => exit.transition().duration(300).attr('opacity', 0).remove()
      );

    // Tick function for animation
    aiFlowState.simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // Store for later use
    aiFlowState.nodes = nodes;
    aiFlowState.links = links;

    // Update stats
    updateFlowStatsFromContext(contextData);
  }

  function showFlowNodeDetails(node) {
    const details = document.getElementById('flowContextDetails');
    if (!details) return;

    details.innerHTML = `
      <div style="margin-bottom:8px;"><strong>${node.label}</strong></div>
      <div style="font-size:11px; color:#888;">Type: ${node.type}</div>
      <div style="font-size:11px; color:#888;">Tokens: ${node.tokens || 'N/A'}</div>
      ${node.similarity !== undefined ? `<div style="font-size:11px; color:#888;">Similarity: ${(node.similarity * 100).toFixed(1)}%</div>` : ''}
    `;
  }

  function updateFlowStatsFromContext(contextData) {
    // Update flow panel stats elements
    const tokensEl = document.getElementById('flowPanelTokens');
    const chunksEl = document.getElementById('flowPanelChunks');

    const totalTokens = (contextData.queryTokens || 0) +
      (contextData.memoryChunks || []).reduce((sum, c) => sum + (c.tokens || 0), 0) +
      (contextData.kbChunks || []).reduce((sum, c) => sum + (c.tokens || 0), 0) +
      (contextData.chatHistory || []).reduce((sum, c) => sum + (c.tokens || 0), 0) +
      (contextData.sectorRules?.tokens || 0);

    const totalChunks = (contextData.memoryChunks || []).length +
      (contextData.kbChunks || []).length +
      (contextData.chatHistory || []).length +
      (contextData.sectorRules ? 1 : 0);

    if (tokensEl) tokensEl.textContent = `${totalTokens} tokens`;
    if (chunksEl) chunksEl.textContent = `${totalChunks} chunks`;
  }

  // Clear the flow visualization (for new conversations)
  function clearAiFlow() {
    if (!aiFlowState.svg) return;

    // Stop any existing simulation
    if (aiFlowState.simulation) {
      aiFlowState.simulation.stop();
    }

    // Clear all nodes and links
    aiFlowState.svg.selectAll('.flow-link').remove();
    aiFlowState.svg.selectAll('.flow-node').remove();
    aiFlowState.svg.selectAll('.flow-thinking').remove();

    // Reset stats
    const tokensEl = document.getElementById('flowPanelTokens');
    const chunksEl = document.getElementById('flowPanelChunks');
    if (tokensEl) tokensEl.textContent = '0 tokens';
    if (chunksEl) chunksEl.textContent = '0 chunks';
  }

  // Show thinking/processing animation (D3 version)
  function showFlowThinking(stage) {
    if (!aiFlowState.svg) return;

    // Remove existing thinking indicator
    aiFlowState.svg.select('.flow-thinking').remove();

    const cx = aiFlowState.width / 2;
    const cy = 30;

    const thinking = aiFlowState.svg.append('g')
      .attr('class', 'flow-thinking');

    thinking.append('rect')
      .attr('x', cx - 60)
      .attr('y', cy - 12)
      .attr('width', 120)
      .attr('height', 24)
      .attr('rx', 12)
      .attr('fill', 'rgba(0,212,255,0.1)')
      .attr('stroke', AI_FLOW_COLORS.query)
      .attr('stroke-width', 1);

    thinking.append('text')
      .attr('x', cx)
      .attr('y', cy + 4)
      .attr('text-anchor', 'middle')
      .attr('fill', AI_FLOW_COLORS.query)
      .attr('font-size', '10')
      .text(stage || 'Processing...');

    // Animated dots with D3 transitions
    [-45, -35, -25].forEach((offset, i) => {
      const dot = thinking.append('circle')
        .attr('cx', cx + offset)
        .attr('cy', cy)
        .attr('r', 3)
        .attr('fill', AI_FLOW_COLORS.query);

      function animateDot() {
        dot
          .transition()
          .delay(i * 200)
          .duration(400)
          .attr('opacity', 0.3)
          .transition()
          .duration(400)
          .attr('opacity', 1)
          .on('end', animateDot);
      }
      animateDot();
    });
  }

  function hideFlowThinking() {
    if (!aiFlowState.svg) return;
    aiFlowState.svg.select('.flow-thinking').remove();
  }

  // Reset zoom to fit content
  function resetFlowZoom() {
    if (!aiFlowState.svg || !aiFlowState.zoom) return;
    aiFlowState.svg.transition().duration(500).call(
      aiFlowState.zoom.transform,
      d3.zoomIdentity
    );
  }

  // Demo/test function to visualize sample data
  function demoAiFlow() {
    renderAiFlow({
      query: 'How do I implement player movement?',
      queryTokens: 15,
      memoryChunks: [
        { label: 'CharacterController', tokens: 450, similarity: 0.92 },
        { label: 'PlayerInput.cs', tokens: 320, similarity: 0.85 },
        { label: 'MovementConfig', tokens: 180, similarity: 0.78 }
      ],
      kbChunks: [
        { label: 'Unity Docs: Movement', tokens: 600, similarity: 0.88 },
        { label: 'Best Practices', tokens: 400, similarity: 0.72 }
      ],
      chatHistory: [
        { role: 'user', tokens: 50 },
        { role: 'assistant', tokens: 200 }
      ],
      sectorRules: { name: 'Scripts', tokens: 150 }
    });
  }


  function getFlowResponseTokens() {
    return flowAnimState && typeof flowAnimState.responseTokens === "number"
      ? flowAnimState.responseTokens
      : 0;
  }

  return {
    initContextFlowVisualization,
    startAiFlow,
    spawnFlowChunk,
    setFlowThinking,
    stopThreadAnimation,
    stopParticleSpawning,
    stopParticleFlow,
    renderAiFlow,
    clearAiFlow,
    setAiStage,
    clearContextSources,
    addContextSourceCard,
    showLiveResponse,
    hideLiveResponse,
    updateLiveResponseText,
    toggleMiniGraph,
    getFlowResponseTokens,
  };
}
