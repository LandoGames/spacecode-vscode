// @ts-nocheck

export function createStationPanelHandlers(deps) {
  const {
    vscode,
    uiState,
    stationMap,
    escapeHtml,
    shipSetStatus,
  } = deps;

  let updateDocSuggestion = () => {};
  function setUpdateDocSuggestion(fn) {
    if (typeof fn === 'function') updateDocSuggestion = fn;
  }

  const STATION_MAP = stationMap;

  // --- Ship UI (metaphor layer; always visible) ---
  // Sector IDs match SectorConfig.ts DEFAULT_RPG_SECTORS for proper context/rules injection.
  const SHIP_GROUPS = [
    {
      id: 'core',
      name: 'CORE',
      items: [
        { id: 'types', name: 'Shared Types & Interfaces' },
        { id: 'utilities', name: 'Utilities' },
      ],
    },
    {
      id: 'character',
      name: 'HANGAR',
      items: [
        { id: 'appearance', name: 'Character Appearance' },
        { id: 'stats', name: 'Stats & Equipment' },
      ],
    },
    {
      id: 'combat',
      name: 'ARMORY',
      items: [
        { id: 'damage', name: 'Damage & Abilities' },
        { id: 'effects', name: 'Status Effects' },
      ],
    },
    {
      id: 'inventory',
      name: 'CARGO',
      items: [
        { id: 'items', name: 'Items & Loot' },
        { id: 'equipment', name: 'Equipment Slots' },
      ],
    },
    {
      id: 'dialogue',
      name: 'COMMS',
      items: [
        { id: 'npc', name: 'NPC Dialogue' },
        { id: 'branching', name: 'Branching Choices' },
      ],
    },
    {
      id: 'quest',
      name: 'MISSIONS',
      items: [
        { id: 'objectives', name: 'Quest Objectives' },
        { id: 'rewards', name: 'Rewards' },
      ],
    },
    {
      id: 'world',
      name: 'NAVIGATION',
      items: [
        { id: 'zones', name: 'Zones & Maps' },
        { id: 'spawning', name: 'Spawning' },
      ],
    },
    {
      id: 'ai',
      name: 'SENSORS',
      items: [
        { id: 'behavior', name: 'AI Behavior Trees' },
        { id: 'pathfinding', name: 'Pathfinding' },
      ],
    },
    {
      id: 'persistence',
      name: 'QUARTERS',
      items: [
        { id: 'saves', name: 'Save/Load' },
        { id: 'settings', name: 'Player Settings' },
      ],
    },
    {
      id: 'ui',
      name: 'BRIDGE-UI',
      items: [
        { id: 'hud', name: 'HUD & Menus' },
        { id: 'uitk', name: 'UI Toolkit' },
      ],
    },
    {
      id: 'editor',
      name: 'ENGINEERING',
      items: [
        { id: 'tools', name: 'Editor Tools' },
        { id: 'debug', name: 'Debug Utilities' },
      ],
    },
    {
      id: 'yard',
      name: 'YARD',
      items: [
        { id: 'prototype', name: 'Prototypes' },
        { id: 'experiments', name: 'Experiments' },
      ],
    },
  ];

  // Mapping from station-map.json scene IDs to SectorConfig sector IDs.
  // This bridges the visual station metaphor with actual code architecture sectors.
  const SCENE_TO_SECTOR_MAP = {
    'bridge': 'ui',           // Command Bridge → BRIDGE-UI (user interface)
    'core': 'core',           // Reactor Core → CORE (shared types/utilities)
    'vault': 'inventory',     // Cargo Vault → CARGO (items/equipment)
    'docking': 'world',       // Docking Ring → NAVIGATION (zones/maps)
    'guard': 'combat',        // Armory → ARMORY (combat mechanics)
    'scanner': 'ai',          // Scanner Bay → SENSORS (AI/pathfinding)
    'comms': 'dialogue',      // Comms Array → COMMS (dialogue/NPC)
    'station': 'core',        // Default for exterior view
  };

  // --- Schematic View Module Definitions ---
  // Each module is drawn using SVG primitives (no raster images)
  const SCHEMATIC_MODULES = {
    core: {
      id: 'core', name: 'CORE', desc: 'Central processing hub', color: '#6cf',
      x: 400, y: 250,
      draw: (g) => {
        // Octagonal core
        g.innerHTML += `
            <polygon points="0,-45 32,-32 45,0 32,32 0,45 -32,32 -45,0 -32,-32"
              fill="#1a3a4a" stroke="${SCHEMATIC_MODULES.core.color}" stroke-width="2"/>
            <circle r="20" fill="#0a2030" stroke="#4af" stroke-width="1"/>
            <circle r="8" fill="#6cf" filter="url(#schematicGlow)"/>
          `;
      }
    },
    bridge: {
      id: 'bridge', name: 'BRIDGE', desc: 'Command & UI systems', color: '#6cf',
      x: 400, y: 80,
      draw: (g) => {
        g.innerHTML += `
            <rect x="-50" y="-25" width="100" height="50" rx="5"
              fill="#1a3a4a" stroke="${SCHEMATIC_MODULES.bridge.color}" stroke-width="2"/>
            <rect x="-35" y="-15" width="70" height="20" rx="3"
              fill="#0a2030" stroke="#4af" stroke-width="1"/>
            <circle cx="-20" cy="15" r="5" fill="#4af"/>
            <circle cx="0" cy="15" r="5" fill="#4af"/>
            <circle cx="20" cy="15" r="5" fill="#4af"/>
          `;
      }
    },
    scanner: {
      id: 'scanner', name: 'SCANNER', desc: 'AI & pathfinding sensors', color: '#c6f',
      x: 150, y: 200,
      draw: (g) => {
        g.innerHTML += `
            <rect x="-25" y="10" width="50" height="20" fill="#2a3a4a" stroke="${SCHEMATIC_MODULES.scanner.color}"/>
            <ellipse cx="0" cy="-5" rx="40" ry="15" fill="none" stroke="${SCHEMATIC_MODULES.scanner.color}" stroke-width="2"/>
            <path d="M0,-5 L-20,-40 L20,-40 Z" fill="rgba(200,100,255,0.3)" stroke="${SCHEMATIC_MODULES.scanner.color}"/>
            <circle cy="-5" r="8" fill="${SCHEMATIC_MODULES.scanner.color}" filter="url(#schematicGlow)"/>
          `;
      }
    },
    guard: {
      id: 'guard', name: 'ARMORY', desc: 'Combat mechanics', color: '#f66',
      x: 650, y: 200,
      draw: (g) => {
        g.innerHTML += `
            <rect x="-35" y="-25" width="70" height="50" rx="3"
              fill="#3a2a2a" stroke="${SCHEMATIC_MODULES.guard.color}" stroke-width="2"/>
            <rect x="-25" y="-15" width="50" height="30" fill="#2a1a1a" stroke="#f44"/>
            <line x1="-15" y1="0" x2="15" y2="0" stroke="${SCHEMATIC_MODULES.guard.color}" stroke-width="3"/>
            <line x1="0" y1="-10" x2="0" y2="10" stroke="${SCHEMATIC_MODULES.guard.color}" stroke-width="3"/>
          `;
      }
    },
    vault: {
      id: 'vault', name: 'VAULT', desc: 'Inventory & items', color: '#cc6',
      x: 150, y: 350,
      draw: (g) => {
        g.innerHTML += `
            <rect x="-35" y="-30" width="70" height="60" rx="3"
              fill="#3a3a2a" stroke="${SCHEMATIC_MODULES.vault.color}" stroke-width="3"/>
            <circle r="15" fill="#2a2a1a" stroke="${SCHEMATIC_MODULES.vault.color}" stroke-width="2"/>
            <line x1="0" y1="-12" x2="0" y2="12" stroke="${SCHEMATIC_MODULES.vault.color}" stroke-width="2"/>
            <line x1="-12" y1="0" x2="12" y2="0" stroke="${SCHEMATIC_MODULES.vault.color}" stroke-width="2"/>
          `;
      }
    },
    docking: {
      id: 'docking', name: 'DOCKING', desc: 'World & navigation', color: '#f96',
      x: 650, y: 350,
      draw: (g) => {
        g.innerHTML += `
            <circle r="35" fill="#1a2a3a" stroke="${SCHEMATIC_MODULES.docking.color}" stroke-width="3"/>
            <circle r="22" fill="#0a1a2a" stroke="${SCHEMATIC_MODULES.docking.color}" stroke-width="2"/>
            <rect x="-4" y="-38" width="8" height="12" fill="${SCHEMATIC_MODULES.docking.color}"/>
            <rect x="-4" y="26" width="8" height="12" fill="${SCHEMATIC_MODULES.docking.color}" />
            <rect x="-38" y="-4" width="12" height="8" fill="${SCHEMATIC_MODULES.docking.color}"/>
            <rect x="26" y="-4" width="12" height="8" fill="${SCHEMATIC_MODULES.docking.color}"/>
            <circle r="6" fill="${SCHEMATIC_MODULES.docking.color}" filter="url(#schematicGlow)"/>
          `;
      }
    },
    comms: {
      id: 'comms', name: 'COMMS', desc: 'Dialogue & NPCs', color: '#6f6',
      x: 400, y: 420,
      draw: (g) => {
        g.innerHTML += `
            <rect x="-8" y="10" width="16" height="30" fill="#2a4a3a" stroke="${SCHEMATIC_MODULES.comms.color}"/>
            <path d="M-35,0 Q0,-40 35,0 Q0,10 -35,0" fill="#1a3a2a" stroke="${SCHEMATIC_MODULES.comms.color}" stroke-width="2"/>
            <line x1="0" y1="-5" x2="0" y2="-25" stroke="#4f4" stroke-width="2"/>
            <path d="M-15,-30 Q0,-45 15,-30" fill="none" stroke="${SCHEMATIC_MODULES.comms.color}" stroke-width="1" opacity="0.6"/>
            <path d="M-10,-35 Q0,-45 10,-35" fill="none" stroke="${SCHEMATIC_MODULES.comms.color}" stroke-width="1" opacity="0.4"/>
          `;
      }
    }
  };

  // Connections between modules (for drawing lines)
  const SCHEMATIC_CONNECTIONS = [
    ['core', 'bridge'],
    ['core', 'scanner'],
    ['core', 'guard'],
    ['core', 'vault'],
    ['core', 'docking'],
    ['core', 'comms'],
  ];

  // Room detail views for each module (schematic mode)
  const SCHEMATIC_ROOMS = {
    bridge: {
      title: 'COMMAND BRIDGE',
      desc: 'UI & Interface Systems',
      color: '#6cf',
      drawRoom: (svg) => {
        // Control panels
        for (let i = 0; i < 3; i++) {
          const x = 150 + i * 200;
          svg.innerHTML += `
              <rect x="${x}" y="120" width="100" height="60" rx="4" fill="#1a3a4a" stroke="#6cf" stroke-width="2"/>
              <rect x="${x+10}" y="130" width="80" height="30" fill="#0a2030" stroke="#4af"/>
              <circle cx="${x+25}" cy="170" r="5" fill="#4af"/>
              <circle cx="${x+50}" cy="170" r="5" fill="#4af"/>
              <circle cx="${x+75}" cy="170" r="5" fill="#4af"/>
            `;
        }
        // Main screen
        svg.innerHTML += `
            <rect x="200" y="220" width="300" height="150" rx="6" fill="#0a2030" stroke="#6cf" stroke-width="3"/>
            <text x="350" y="300" fill="#6cf" font-size="24" text-anchor="middle" font-family="monospace">SECTOR UI</text>
            <text x="350" y="330" fill="#4af" font-size="12" text-anchor="middle" font-family="monospace" opacity="0.6">React components, views, layouts</text>
          `;
      }
    },
    scanner: {
      title: 'SCANNER BAY',
      desc: 'AI & Pathfinding Systems',
      color: '#c6f',
      drawRoom: (svg) => {
        // Radar dish
        svg.innerHTML += `
            <ellipse cx="350" cy="200" rx="120" ry="40" fill="none" stroke="#c6f" stroke-width="2"/>
            <ellipse cx="350" cy="200" rx="80" ry="25" fill="none" stroke="#c6f" stroke-width="1" opacity="0.5"/>
            <line x1="350" y1="200" x2="350" y2="100" stroke="#c6f" stroke-width="3"/>
            <circle cx="350" cy="90" r="15" fill="#c6f" filter="url(#schematicGlow)"/>
          `;
        // Scan waves
        for (let i = 0; i < 3; i++) {
          svg.innerHTML += `
              <path d="M${200+i*30},280 Q350,${220-i*20} ${500-i*30},280" fill="none" stroke="#c6f" stroke-width="1" opacity="${0.3+i*0.2}"/>
            `;
        }
        svg.innerHTML += `
            <text x="350" y="350" fill="#c6f" font-size="18" text-anchor="middle" font-family="monospace">NEURAL PATHFINDING</text>
            <text x="350" y="375" fill="#a4f" font-size="11" text-anchor="middle" font-family="monospace" opacity="0.6">NavMesh, AI behaviors, state machines</text>
          `;
      }
    },
    guard: {
      title: 'ARMORY',
      desc: 'Combat Mechanics',
      color: '#f66',
      drawRoom: (svg) => {
        // Weapon racks
        for (let i = 0; i < 4; i++) {
          const x = 120 + i * 150;
          svg.innerHTML += `
              <rect x="${x}" y="130" width="80" height="120" rx="3" fill="#2a1a1a" stroke="#f66" stroke-width="2"/>
              <line x1="${x+20}" y1="150" x2="${x+20}" y2="230" stroke="#f44" stroke-width="4"/>
              <line x1="${x+40}" y1="160" x2="${x+40}" y2="220" stroke="#f44" stroke-width="4"/>
              <line x1="${x+60}" y1="155" x2="${x+60}" y2="225" stroke="#f44" stroke-width="4"/>
            `;
        }
        // Target
        svg.innerHTML += `
            <circle cx="350" cy="350" r="50" fill="none" stroke="#f66" stroke-width="2"/>
            <circle cx="350" cy="350" r="30" fill="none" stroke="#f66" stroke-width="2"/>
            <circle cx="350" cy="350" r="10" fill="#f66"/>
            <text x="350" y="430" fill="#f66" font-size="18" text-anchor="middle" font-family="monospace">DAMAGE SYSTEMS</text>
            <text x="350" y="455" fill="#f44" font-size="11" text-anchor="middle" font-family="monospace" opacity="0.6">Combat, abilities, buffs, targeting</text>
          `;
      }
    },
    vault: {
      title: 'CARGO VAULT',
      desc: 'Inventory & Items',
      color: '#cc6',
      drawRoom: (svg) => {
        // Storage containers
        for (let row = 0; row < 2; row++) {
          for (let col = 0; col < 4; col++) {
            const x = 120 + col * 140;
            const y = 130 + row * 100;
            svg.innerHTML += `
                <rect x="${x}" y="${y}" width="100" height="70" rx="3" fill="#2a2a1a" stroke="#cc6" stroke-width="2"/>
                <circle cx="${x+50}" cy="${y+35}" r="12" fill="#2a2a1a" stroke="#cc6" stroke-width="2"/>
                <line x1="${x+50}" y1="${y+28}" x2="${x+50}" y2="${y+42}" stroke="#cc6" stroke-width="2"/>
                <line x1="${x+43}" y1="${y+35}" x2="${x+57}" y2="${y+35}" stroke="#cc6" stroke-width="2"/>
              `;
          }
        }
        svg.innerHTML += `
            <text x="350" y="380" fill="#cc6" font-size="18" text-anchor="middle" font-family="monospace">INVENTORY SYSTEM</text>
            <text x="350" y="405" fill="#aa4" font-size="11" text-anchor="middle" font-family="monospace" opacity="0.6">Items, equipment, crafting, loot</text>
          `;
      }
    },
    docking: {
      title: 'DOCKING RING',
      desc: 'World & Navigation',
      color: '#f96',
      drawRoom: (svg) => {
        // Docking ports
        for (let i = 0; i < 3; i++) {
          const x = 150 + i * 180;
          svg.innerHTML += `
              <circle cx="${x}" cy="200" r="50" fill="#1a2a3a" stroke="#f96" stroke-width="3"/>
              <circle cx="${x}" cy="200" r="30" fill="#0a1a2a" stroke="#f96" stroke-width="2"/>
              <circle cx="${x}" cy="200" r="10" fill="#f96" filter="url(#schematicGlow)"/>
            `;
        }
        // Connection lines
        svg.innerHTML += `
            <line x1="200" y1="200" x2="330" y2="200" stroke="#f96" stroke-width="2" stroke-dasharray="5,5"/>
            <line x1="380" y1="200" x2="510" y2="200" stroke="#f96" stroke-width="2" stroke-dasharray="5,5"/>
            <text x="350" y="320" fill="#f96" font-size="18" text-anchor="middle" font-family="monospace">WORLD PORTALS</text>
            <text x="350" y="345" fill="#f74" font-size="11" text-anchor="middle" font-family="monospace" opacity="0.6">Scenes, zones, level transitions</text>
          `;
      }
    },
    comms: {
      title: 'COMMS ARRAY',
      desc: 'Dialogue & NPCs',
      color: '#6f6',
      drawRoom: (svg) => {
        // Antenna array
        svg.innerHTML += `
            <rect x="320" y="280" width="60" height="80" fill="#2a4a3a" stroke="#6f6" stroke-width="2"/>
            <path d="M250,200 Q350,80 450,200" fill="none" stroke="#6f6" stroke-width="3"/>
            <line x1="350" y1="140" x2="350" y2="280" stroke="#6f6" stroke-width="4"/>
          `;
        // Signal waves
        for (let i = 0; i < 4; i++) {
          svg.innerHTML += `
              <path d="M${280-i*20},${180-i*15} Q350,${120-i*20} ${420+i*20},${180-i*15}" fill="none" stroke="#6f6" stroke-width="1" opacity="${0.2+i*0.2}"/>
            `;
        }
        svg.innerHTML += `
            <text x="350" y="400" fill="#6f6" font-size="18" text-anchor="middle" font-family="monospace">DIALOGUE SYSTEM</text>
            <text x="350" y="425" fill="#4f4" font-size="11" text-anchor="middle" font-family="monospace" opacity="0.6">NPCs, conversations, localization</text>
          `;
      }
    },
    core: {
      title: 'REACTOR CORE',
      desc: 'Core Systems & Utilities',
      color: '#6cf',
      drawRoom: (svg) => {
        // Central reactor
        svg.innerHTML += `
            <polygon points="350,100 420,180 420,280 350,360 280,280 280,180" fill="#1a3a4a" stroke="#6cf" stroke-width="3"/>
            <polygon points="350,140 390,190 390,250 350,300 310,250 310,190" fill="#0a2030" stroke="#4af" stroke-width="2"/>
            <circle cx="350" cy="220" r="30" fill="#6cf" filter="url(#schematicGlow)"/>
          `;
        // Energy conduits
        for (let i = 0; i < 4; i++) {
          const angle = (i * 90 + 45) * Math.PI / 180;
          const x1 = 350 + Math.cos(angle) * 80;
          const y1 = 220 + Math.sin(angle) * 80;
          const x2 = 350 + Math.cos(angle) * 140;
          const y2 = 220 + Math.sin(angle) * 140;
          svg.innerHTML += `
              <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#4af" stroke-width="3"/>
              <circle cx="${x2}" cy="${y2}" r="8" fill="#4af"/>
            `;
        }
        svg.innerHTML += `
            <text x="350" y="420" fill="#6cf" font-size="18" text-anchor="middle" font-family="monospace">CORE SYSTEMS</text>
            <text x="350" y="445" fill="#4af" font-size="11" text-anchor="middle" font-family="monospace" opacity="0.6">Shared types, utilities, services</text>
          `;
      }
    }
  };

  // Track current schematic view (null = main station, or module id for room view)
  let schematicCurrentRoom = null;

  let shipSelectedSectorId = 'core';
  let shipSelectedSubId = null;
  let shipAutoexecute = false;
  let shipProfile = uiState?.shipProfile || 'yard';

  function getShipSelectedSectorId() { return shipSelectedSectorId; }
  function getShipSelectedSubId() { return shipSelectedSubId; }
  function getShipAutoexecute() { return shipAutoexecute; }
  function getShipProfile() { return shipProfile; }
  function setShipSelectedSectorId(value) { shipSelectedSectorId = value; }
  function setShipSelectedSubId(value) { shipSelectedSubId = value; }
  function setShipAutoexecute(value) { shipAutoexecute = value; }
  function setShipProfile(value) { shipProfile = value; if (uiState) uiState.shipProfile = value; }

  function updateStationLabels() {
    const sectorLabel = document.getElementById('stationSectorLabel');
    const profileLabel = document.getElementById('stationProfileLabel');
    if (sectorLabel) sectorLabel.textContent = shipSelectedSectorId || 'Unknown';
    if (profileLabel) profileLabel.textContent = shipProfile || 'yard';
  }

  // --- Station navigation (scene graph) ---
  let stationSceneId = (STATION_MAP && STATION_MAP.startScene) ? STATION_MAP.startScene : 'station';
  let stationNavStack = [stationSceneId];

  function stationGetScene(sceneId) {
    const scenes = (STATION_MAP && STATION_MAP.scenes) ? STATION_MAP.scenes : {};
    return scenes && scenes[sceneId] ? scenes[sceneId] : null;
  }

  function stationUpdateBreadcrumbs() {
    const el = document.getElementById('stationBreadcrumbs');
    if (!el) return;
    el.innerHTML = '';

    stationNavStack.forEach((id, idx) => {
      const scene = stationGetScene(id);
      const name = scene && scene.title ? scene.title : id;

      const crumb = document.createElement('span');
      crumb.className = 'crumb';
      crumb.textContent = name;
      crumb.onclick = () => {
        // Jump back to a previous scene in the stack.
        stationNavStack = stationNavStack.slice(0, idx + 1);
        stationSceneId = id;
        stationRenderScene();
        updateStationLabels();
        shipRender();
      };
      el.appendChild(crumb);

      if (idx < stationNavStack.length - 1) {
        const sep = document.createElement('span');
        sep.className = 'crumb-sep';
        sep.textContent = ' › ';
        el.appendChild(sep);
      }
    });

    const backBtn = document.getElementById('stationBackBtn');
    if (backBtn) backBtn.style.visibility = stationNavStack.length > 1 ? 'visible' : 'hidden';
  }

  function stationSetScene(sceneId, pushToStack) {
    const scene = stationGetScene(sceneId);
    if (!scene) {
      shipSetStatus('Unknown scene: ' + sceneId);
      return;
    }

    stationSceneId = sceneId;
    if (pushToStack) {
      const last = stationNavStack[stationNavStack.length - 1];
      if (last !== sceneId) stationNavStack.push(sceneId);
    }

    // Map station scene ID to SectorConfig sector ID for context/rules injection.
    const mappedSectorId = SCENE_TO_SECTOR_MAP[sceneId] || sceneId;
    const group = SHIP_GROUPS.find(g => g.id === mappedSectorId);
    if (group) {
      if (shipSelectedSectorId !== mappedSectorId) {
        shipSelectedSectorId = mappedSectorId;
        shipSelectedSubId = null;
      }
    }

    stationRenderScene();
    shipRender();
  }

  function stationGoBack() {
    // Handle schematic mode back navigation
    if (uiState.stationViewMode === 'schematic') {
      if (schematicCurrentRoom) {
        schematicCurrentRoom = null;
        stationRenderSchematic();
        return;
      }
    }
    // Handle photo mode back navigation
    if (stationNavStack.length <= 1) return;
    stationNavStack.pop();
    stationSceneId = stationNavStack[stationNavStack.length - 1];
    stationRenderScene();
    shipRender();
  }

  function stationEnsureViewport() {
    const canvas = document.getElementById('shipCanvas');
    if (!canvas) return null;
    let vp = document.getElementById('stationViewport');
    if (!vp) {
      vp = document.createElement('div');
      vp.id = 'stationViewport';
      vp.className = 'ship-viewport';
      canvas.appendChild(vp);
    }
    return vp;
  }

  function stationUpdateViewport() {
    const canvas = document.getElementById('shipCanvas');
    const img = document.getElementById('shipImage');
    const vp = stationEnsureViewport();
    if (!canvas || !img || !vp) return;

    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    const iw = img.naturalWidth || cw;
    const ih = img.naturalHeight || ch;

    const scale = Math.min(cw / iw, ch / ih);
    const dispW = iw * scale;
    const dispH = ih * scale;
    const offsetX = (cw - dispW) / 2;
    const offsetY = (ch - dispH) / 2;

    vp.style.left = offsetX + 'px';
    vp.style.top = offsetY + 'px';
    vp.style.width = dispW + 'px';
    vp.style.height = dispH + 'px';
  }

  function stationRenderSchematic() {
    const canvas = document.getElementById('shipCanvas');
    if (!canvas) return;

    // Hide the raster image in schematic mode
    const img = document.getElementById('shipImage');
    if (img) img.style.display = 'none';

    // Remove old schematic SVG if exists
    const oldSvg = canvas.querySelector('.schematic-svg');
    if (oldSvg) oldSvg.remove();

    // Create schematic SVG
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'schematic-svg');
    svg.setAttribute('viewBox', '0 0 800 500');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:auto;';

    // Create defs for glow effect
    svg.innerHTML = `
      <defs>
        <filter id="schematicGlow">
          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        <pattern id="schematicGrid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(100,200,255,0.1)" stroke-width="1"/>
        </pattern>
      </defs>
    `;

    // Add background grid
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', '800');
    bg.setAttribute('height', '500');
    bg.setAttribute('fill', 'url(#schematicGrid)');
    svg.appendChild(bg);

    // Check if we're viewing a room or the main station
    if (schematicCurrentRoom && SCHEMATIC_ROOMS[schematicCurrentRoom]) {
      // Render room detail view
      const room = SCHEMATIC_ROOMS[schematicCurrentRoom];

      // Add room title
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      title.setAttribute('x', '400');
      title.setAttribute('y', '40');
      title.setAttribute('text-anchor', 'middle');
      title.setAttribute('fill', room.color);
      title.setAttribute('font-size', '24');
      title.setAttribute('font-family', 'Orbitron, Exo, monospace');
      title.setAttribute('letter-spacing', '3');
      title.textContent = room.title;
      svg.appendChild(title);

      // Add room description
      const desc = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      desc.setAttribute('x', '400');
      desc.setAttribute('y', '65');
      desc.setAttribute('text-anchor', 'middle');
      desc.setAttribute('fill', room.color);
      desc.setAttribute('font-size', '12');
      desc.setAttribute('font-family', 'Inter, sans-serif');
      desc.setAttribute('opacity', '0.7');
      desc.textContent = room.desc;
      svg.appendChild(desc);

      // Draw room content
      room.drawRoom(svg);

      // Add back button
      const back = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      back.setAttribute('x', '20');
      back.setAttribute('y', '20');
      back.setAttribute('width', '80');
      back.setAttribute('height', '30');
      back.setAttribute('rx', '5');
      back.setAttribute('fill', 'rgba(0,40,60,0.8)');
      back.setAttribute('stroke', room.color);
      back.setAttribute('stroke-width', '1');
      back.style.cursor = 'pointer';
      back.onclick = () => {
        schematicCurrentRoom = null;
        stationRenderSchematic();
      };
      svg.appendChild(back);

      const backText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      backText.setAttribute('x', '60');
      backText.setAttribute('y', '40');
      backText.setAttribute('text-anchor', 'middle');
      backText.setAttribute('fill', room.color);
      backText.setAttribute('font-size', '12');
      backText.setAttribute('font-family', 'Inter, sans-serif');
      backText.textContent = '← BACK';
      backText.style.pointerEvents = 'none';
      svg.appendChild(backText);
    } else {
      // Render main station view
      // Draw connections first (behind modules)
      SCHEMATIC_CONNECTIONS.forEach(([from, to]) => {
        const fromMod = SCHEMATIC_MODULES[from];
        const toMod = SCHEMATIC_MODULES[to];
        if (!fromMod || !toMod) return;

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', fromMod.x);
        line.setAttribute('y1', fromMod.y);
        line.setAttribute('x2', toMod.x);
        line.setAttribute('y2', toMod.y);
        line.setAttribute('stroke', 'rgba(100,200,255,0.3)');
        line.setAttribute('stroke-width', '2');
        line.setAttribute('stroke-dasharray', '5,5');
        svg.appendChild(line);
      });

      // Draw modules
      Object.values(SCHEMATIC_MODULES).forEach((mod) => {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('transform', `translate(${mod.x}, ${mod.y})`);
        g.setAttribute('class', 'schematic-module');
        g.style.cursor = 'pointer';

        // Highlight selected sector
        const mappedSectorId = SCENE_TO_SECTOR_MAP[mod.id] || mod.id;
        const selected = shipSelectedSectorId === mappedSectorId;
        if (selected) {
          g.setAttribute('data-selected', 'true');
        }

        // Draw module shape
        mod.draw(g);

        // Add label
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', '0');
        text.setAttribute('y', '65');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('fill', mod.color);
        text.setAttribute('font-size', '10');
        text.setAttribute('font-family', 'Orbitron, Exo, monospace');
        text.textContent = mod.name;
        g.appendChild(text);

        // Add hover tooltip
        g.addEventListener('mouseenter', () => {
          g.setAttribute('data-hover', 'true');
        });
        g.addEventListener('mouseleave', () => {
          g.removeAttribute('data-hover');
        });

        // Click to select sector and enter room view
        g.addEventListener('click', () => {
          // Select the sector
          if (mappedSectorId && shipSelectedSectorId !== mappedSectorId) {
            shipSelectedSectorId = mappedSectorId;
            shipSelectedSubId = null;
            shipRender();
            updateStationLabels();
            vscode.postMessage({ type: 'sectorSelected', sectorId: mappedSectorId });
          }
          // Enter room view for this module
          schematicCurrentRoom = mod.id;
          stationRenderSchematic();
        });

        svg.appendChild(g);
      });
    }

    canvas.appendChild(svg);

    // Update station scene name
    const sceneNameEl = document.getElementById('stationSceneName');
    if (sceneNameEl) {
      if (schematicCurrentRoom && SCHEMATIC_ROOMS[schematicCurrentRoom]) {
        sceneNameEl.textContent = SCHEMATIC_ROOMS[schematicCurrentRoom].title;
      } else {
        sceneNameEl.textContent = 'Station Schematic';
      }
    }

    // Update back button visibility
    const backBtn = document.getElementById('stationBackBtn');
    if (backBtn) {
      backBtn.style.visibility = schematicCurrentRoom ? 'visible' : 'hidden';
    }
  }

  // --- Photo View Rendering (Legacy) ---
  function stationRenderPhoto() {
    const canvas = document.getElementById('shipCanvas');
    const img = document.getElementById('shipImage');
    const vp = stationEnsureViewport();
    if (!canvas || !img || !vp) return;

    // Remove old hotspots (both div-based and SVG) from viewport
    vp.querySelectorAll('.ship-hotspot, .ship-hotspot-svg').forEach(n => n.remove());

    const scene = stationGetScene(stationSceneId);
    if (scene && scene.imageUrl) {
      // Reset fallback chain for this new image.
      img.dataset.fallback = '';
      img.src = scene.imageUrl;
    }

    // Align the viewport to the visible (letterboxed) image area.
    stationUpdateViewport();

    const hotspots = (scene && Array.isArray(scene.hotspots)) ? scene.hotspots : [];
    const hasPolygons = hotspots.some(h => Array.isArray(h.points) && h.points.length >= 3);

    if (hasPolygons) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'ship-hotspot-svg');
      svg.setAttribute('viewBox', '0 0 2752 1536');
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';

      hotspots.forEach((h) => {
        if (Array.isArray(h.points) && h.points.length >= 3) {
          const pointsStr = h.points.map(p => p.x + ',' + p.y).join(' ');
          const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
          poly.setAttribute('points', pointsStr);
          poly.setAttribute('fill', h.id === shipSelectedSectorId ? 'rgba(0,200,255,0.25)' : 'rgba(0,150,255,0.08)');
          poly.setAttribute('stroke', 'rgba(0,200,255,0.6)');
          poly.setAttribute('stroke-width', '2');
          poly.style.cssText = 'pointer-events:auto;cursor:pointer;transition:fill 0.2s,stroke 0.2s;';
          poly.setAttribute('data-id', h.id || '');

          // Calculate centroid for label positioning
          const cx = h.points.reduce((sum, p) => sum + p.x, 0) / h.points.length;
          const cy = h.points.reduce((sum, p) => sum + p.y, 0) / h.points.length;

          // Create floating label group
          const labelGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          labelGroup.setAttribute('class', 'hotspot-label');
          labelGroup.setAttribute('data-for', h.id || '');
          labelGroup.style.cssText = 'pointer-events:none;opacity:0;transition:opacity 0.2s;';

          // Label background
          const labelBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          labelBg.setAttribute('rx', '8');
          labelBg.setAttribute('ry', '8');
          labelBg.setAttribute('fill', 'rgba(0,20,40,0.85)');
          labelBg.setAttribute('stroke', 'rgba(0,200,255,0.8)');
          labelBg.setAttribute('stroke-width', '1.5');

          // Label text
          const labelText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          labelText.setAttribute('x', String(cx));
          labelText.setAttribute('y', String(cy));
          labelText.setAttribute('text-anchor', 'middle');
          labelText.setAttribute('dominant-baseline', 'middle');
          labelText.setAttribute('fill', '#00d4ff');
          labelText.setAttribute('font-family', 'Orbitron, Exo, Rajdhani, sans-serif');
          labelText.setAttribute('font-size', '42');
          labelText.setAttribute('font-weight', '600');
          labelText.setAttribute('letter-spacing', '2');
          labelText.textContent = (h.label || h.id || '').toUpperCase();

          // Indicator line from centroid pointing down
          const indicator = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          indicator.setAttribute('x1', String(cx));
          indicator.setAttribute('y1', String(cy + 30));
          indicator.setAttribute('x2', String(cx));
          indicator.setAttribute('y2', String(cy + 60));
          indicator.setAttribute('stroke', 'rgba(0,200,255,0.8)');
          indicator.setAttribute('stroke-width', '2');

          // Indicator dot
          const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          dot.setAttribute('cx', String(cx));
          dot.setAttribute('cy', String(cy + 65));
          dot.setAttribute('r', '6');
          dot.setAttribute('fill', '#00d4ff');

          labelGroup.appendChild(labelBg);
          labelGroup.appendChild(indicator);
          labelGroup.appendChild(dot);
          labelGroup.appendChild(labelText);

          // Size the background based on text (approximate)
          const textLen = (h.label || h.id || '').length * 26 + 40;
          labelBg.setAttribute('x', String(cx - textLen/2));
          labelBg.setAttribute('y', String(cy - 28));
          labelBg.setAttribute('width', String(textLen));
          labelBg.setAttribute('height', '56');

          poly.addEventListener('mouseenter', () => {
            poly.setAttribute('fill', 'rgba(0,220,255,0.35)');
            poly.setAttribute('stroke', 'rgba(0,255,255,0.95)');
            poly.setAttribute('stroke-width', '3');
            labelGroup.style.opacity = '1';
          });
          poly.addEventListener('mouseleave', () => {
            const selected = h.id === shipSelectedSectorId;
            poly.setAttribute('fill', selected ? 'rgba(0,200,255,0.25)' : 'rgba(0,150,255,0.08)');
            poly.setAttribute('stroke', 'rgba(0,200,255,0.6)');
            poly.setAttribute('stroke-width', '2');
            labelGroup.style.opacity = '0';
          });

          poly.addEventListener('click', () => {
            if (h.targetScene) {
              stationSetScene(h.targetScene, true);
            } else if (h.action) {
              vscode.postMessage({ type: 'stationAction', action: h.action, sceneId: stationSceneId });
            }
          });

          svg.appendChild(poly);
          svg.appendChild(labelGroup);
        }
      });

      vp.appendChild(svg);
    } else {
      hotspots.forEach((h) => {
        const hs = document.createElement('div');
        hs.className = 'ship-hotspot' + (h.id === shipSelectedSectorId ? ' selected' : '');
        hs.style.left = String(h.x) + '%';
        hs.style.top = String(h.y) + '%';
        hs.style.width = String(h.w) + '%';
        hs.style.height = String(h.h) + '%';
        hs.title = h.title || h.id;

        if (h.targetScene) {
          hs.onclick = () => stationSetScene(h.targetScene, true);
        } else if (h.action) {
          hs.onclick = () => vscode.postMessage({ type: 'stationAction', action: h.action, sceneId: stationSceneId });
        } else {
          hs.onclick = () => {};
        }

        vp.appendChild(hs);
      });
    }

    stationUpdateBreadcrumbs();
  }

  // --- Main Render Dispatcher ---
  function stationRenderScene() {
    const canvas = document.getElementById('shipCanvas');
    const img = document.getElementById('shipImage');

    // Remove old content
    const oldSchematic = canvas?.querySelector('.schematic-svg');
    if (oldSchematic) oldSchematic.remove();

    if (uiState.stationViewMode === 'schematic') {
      stationRenderSchematic();
    } else {
      // Show the image for photo mode
      if (img) img.style.display = '';
      stationRenderPhoto();
    }
  }

  // Toggle between schematic and photo view
  function stationToggleViewMode(mode) {
    if (mode) {
      uiState.stationViewMode = mode;
    } else {
      uiState.stationViewMode = uiState.stationViewMode === 'schematic' ? 'photo' : 'schematic';
    }
    // Update toggle buttons
    const btnSchematic = document.getElementById('stationViewSchematic');
    const btnPhoto = document.getElementById('stationViewPhoto');
    if (btnSchematic) btnSchematic.classList.toggle('active', uiState.stationViewMode === 'schematic');
    if (btnPhoto) btnPhoto.classList.toggle('active', uiState.stationViewMode === 'photo');
    // Re-render
    stationRenderScene();
  }

  function shipGetProfile() {
    const sel = document.getElementById('shipProfileSelect');
    return sel ? sel.value : 'yard';
  }

  function shipRender() {
    const list = document.getElementById('shipSectorList');
    if (!list) return;

    // Clear existing
    list.innerHTML = '';

    // Render grouped list (7 sectors, with detail items underneath)
    SHIP_GROUPS.forEach((g) => {
      const header = document.createElement('div');
      header.className = 'sector-item' + (g.id === shipSelectedSectorId && !shipSelectedSubId ? ' selected' : '');
      header.textContent = g.name;
      header.onclick = () => shipSelectSector(g.id, null);
      list.appendChild(header);

      g.items.forEach((it) => {
        const row = document.createElement('div');
        const selected = (g.id === shipSelectedSectorId) && (shipSelectedSubId === it.id);
        row.className = 'sector-item sub' + (selected ? ' selected' : '');
        row.textContent = '  - ' + it.name;
        row.onclick = () => shipSelectSector(g.id, it.id);
        list.appendChild(row);
      });
    });

    shipUpdateChips();
  }

  function shipUpdateChips() {
    const chip = document.getElementById('shipSelectedSectorChip');
    const group = SHIP_GROUPS.find(g => g.id === shipSelectedSectorId);
    let text = group ? group.name : shipSelectedSectorId;
    if (group && shipSelectedSubId) {
      const it = group.items.find(i => i.id === shipSelectedSubId);
      if (it) text = text + ' / ' + it.name;
    }
    if (chip) chip.textContent = 'Sector: ' + text;

    const autoBtn = document.getElementById('shipAutoBtn');
    if (autoBtn) autoBtn.textContent = 'Autoexecute: ' + (shipAutoexecute ? 'On' : 'Off');
  }

  function shipSelectSector(sectorId, subId) {
    shipSelectedSectorId = sectorId;
    shipSelectedSubId = subId || null;
    const group = SHIP_GROUPS.find(g => g.id === shipSelectedSectorId);
    const name = group ? group.name : shipSelectedSectorId;
    shipSetStatus('Selected: ' + name + '. Context Packs and Gates will be sector-aware.');
    vscode.postMessage({ type: 'shipSelectSector', sectorId, subId: shipSelectedSubId, profile: shipGetProfile() });
    // Clicking a sector navigates the station view. Sub-items don't push to the stack.
    stationSetScene(sectorId, shipSelectedSubId ? false : true);
    // Update doc suggestion based on sector
    updateDocSuggestion(sectorId);
  }

  function shipRequestContextPack() {
    vscode.postMessage({ type: 'shipGetContextPack', sectorId: shipSelectedSectorId, subId: shipSelectedSubId, profile: shipGetProfile() });
    shipSetStatus('Requesting Context Pack...');
  }

  function openHotspotTool() {
    vscode.postMessage({ type: 'openHotspotTool', sceneId: stationSceneId });
  }

  function shipRunGates() {
    vscode.postMessage({ type: 'shipRunGates', sectorId: shipSelectedSectorId, subId: shipSelectedSubId, profile: shipGetProfile() });
    shipSetStatus('Running gates...');
  }

  function shipDocsStatus() {
    vscode.postMessage({ type: 'shipDocsStatus', sectorId: shipSelectedSectorId, subId: shipSelectedSubId, profile: shipGetProfile() });
    shipSetStatus('Checking docs status...');
  }

  function asmdefRefresh() {
    vscode.postMessage({ type: 'asmdefInventory' });
    shipSetStatus('Loading asmdef inventory...');
  }

  function asmdefGeneratePolicy() {
    vscode.postMessage({ type: 'asmdefGeneratePolicy' });
    shipSetStatus('Generating asmdef policy draft...');
  }

  function asmdefOpenPolicy() {
    vscode.postMessage({ type: 'asmdefOpenPolicy' });
    shipSetStatus('Opening asmdef policy...');
  }

  function asmdefEditPolicy() {
    vscode.postMessage({ type: 'asmdefGetPolicy' });
    shipSetStatus('Loading asmdef policy...');
  }

  function asmdefReloadPolicy() {
    asmdefEditPolicy();
  }

  function asmdefSavePolicy() {
    const textEl = document.getElementById('asmdefPolicyText');
    if (!textEl) return;
    const text = textEl.value || '';
    if (!text.trim()) {
      shipSetStatus('Policy is empty.');
      return;
    }
    vscode.postMessage({ type: 'asmdefSavePolicy', text });
    shipSetStatus('Saving asmdef policy...');
  }

  function asmdefSetStrict() {
    vscode.postMessage({ type: 'asmdefSetStrict' });
    shipSetStatus('Setting asmdef policy to strict...');
  }

  function asmdefSetAdvisory() {
    vscode.postMessage({ type: 'asmdefSetAdvisory' });
    shipSetStatus('Setting asmdef policy to advisory...');
  }

  function asmdefNormalizeGuids() {
    vscode.postMessage({ type: 'asmdefNormalizeGuids' });
    shipSetStatus('Normalizing GUID references...');
  }

  function asmdefGraph() {
    vscode.postMessage({ type: 'asmdefGraph' });
    shipSetStatus('Loading asmdef graph...');
  }

  function asmdefValidate() {
    vscode.postMessage({ type: 'asmdefValidate' });
    shipSetStatus('Validating asmdef policy...');
  }

  function copyAsmdefFixes() {
    const listEl = document.getElementById('asmdefViolations');
    if (!listEl) return;
    const suggestions = Array.from(listEl.querySelectorAll('.asmdef-item-refs'))
      .map(el => el.textContent || '')
      .filter(t => t.startsWith('Suggest: '))
      .map(t => t.replace(/^Suggest:\\s*/, '').trim());
    if (!suggestions.length) {
      shipSetStatus('No fixes to copy.');
      return;
    }
    const text = suggestions.join('\\n');
    navigator.clipboard.writeText(text).then(() => {
      shipSetStatus('Fixes copied to clipboard.');
    }, () => {
      shipSetStatus('Failed to copy fixes.');
    });
  }

  function setCoordinatorPill(el, status) {
    if (!el) return;
    const value = status || 'unknown';
    el.textContent = value;
    el.classList.remove('ok', 'warn', 'bad', 'muted');
    if (value === 'ok') {
      el.classList.add('ok');
    } else if (value === 'unknown') {
      el.classList.add('muted');
    } else if (value.includes('warn') || value.includes('delay')) {
      el.classList.add('warn');
    } else {
      el.classList.add('bad');
    }
  }

  function updateCoordinatorSummary(targetId, status) {
    const el = document.getElementById(targetId);
    if (!el) return;
    const issues = ['policy', 'inventory', 'graph'].filter(k => status[k] && status[k] !== 'ok' && status[k] !== 'unknown');
    if (!issues.length) {
      el.textContent = 'All sync channels healthy.';
      return;
    }
    el.textContent = 'Issues: ' + issues.map(k => k + ':' + status[k]).join(', ');
  }

  function updateCoordinatorLastIssue(targetId, issue) {
    const el = document.getElementById(targetId);
    if (el) el.textContent = issue || 'none';
  }

  function coordinatorHealthCheck() {
    vscode.postMessage({ type: 'coordinatorHealth' });
    shipSetStatus('Checking Coordinator status...');
  }

  function shipToggleAutoexecute() {
    shipAutoexecute = !shipAutoexecute;
    shipUpdateChips();
    vscode.postMessage({ type: 'shipToggleAutoexecute' });
  }

  function initStationUI() {
    // Context injection toggle (persisted in localStorage)
    const injectToggle = document.getElementById('injectContextToggle');
    if (injectToggle) {
      const key = 'spacecode.injectContext';
      const saved = localStorage.getItem(key);
      if (saved === '0') injectToggle.checked = false;
      injectToggle.addEventListener('change', () => {
        localStorage.setItem(key, injectToggle.checked ? '1' : '0');
      });
    }
    // Request initial context preview from extension
    vscode.postMessage({ type: 'getContextPreview' });
    // Request initial coordinator status
    vscode.postMessage({ type: 'coordinatorHealth' });

    const sel = document.getElementById('shipProfileSelect');
    if (sel) {
      sel.addEventListener('change', () => {
        setShipProfile(shipGetProfile());
        vscode.postMessage({ type: 'shipSetProfile', profile: shipGetProfile() });
        // NOTE: This file is a big TS template literal; avoid nested JS template strings (backticks).
        shipSetStatus('Profile set to ' + shipGetProfile() + '.');
      });
    }
    stationRenderScene();
    shipRender();

    // Update viewport when image loads (natural dimensions needed for letterbox calc)
    const shipImg = document.getElementById('shipImage');
    if (shipImg) {
      shipImg.addEventListener('load', () => {
        stationUpdateViewport();
      });
    }

    // Update viewport on container resize (splitter drag, window resize)
    const shipCanvas = document.getElementById('shipCanvas');
    if (shipCanvas && typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => {
        stationUpdateViewport();
      });
      ro.observe(shipCanvas);
    }
  }

  return {
    setUpdateDocSuggestion,
    initStationUI,
    updateStationLabels,
    stationRenderScene,
    stationRenderSchematic,
    stationRenderPhoto,
    stationToggleViewMode,
    stationGoBack,
    stationSetScene,
    stationUpdateViewport,
    shipRender,
    shipUpdateChips,
    shipSelectSector,
    shipRequestContextPack,
    shipRunGates,
    shipDocsStatus,
    openHotspotTool,
    shipToggleAutoexecute,
    asmdefRefresh,
    asmdefGeneratePolicy,
    asmdefOpenPolicy,
    asmdefEditPolicy,
    asmdefReloadPolicy,
    asmdefSavePolicy,
    asmdefSetStrict,
    asmdefSetAdvisory,
    asmdefNormalizeGuids,
    asmdefGraph,
    asmdefValidate,
    copyAsmdefFixes,
    setCoordinatorPill,
    updateCoordinatorSummary,
    updateCoordinatorLastIssue,
    coordinatorHealthCheck,
    getShipSelectedSectorId,
    getShipSelectedSubId,
    getShipAutoexecute,
    getShipProfile,
    setShipSelectedSectorId,
    setShipSelectedSubId,
    setShipAutoexecute,
    setShipProfile,
  };
}
