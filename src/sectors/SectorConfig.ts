/**
 * Sector Configuration
 *
 * Defines sectors for spatial navigation and context injection.
 * Sectors map to architectural boundaries in the codebase.
 */

/**
 * Sector definition
 */
export interface Sector {
  id: string;
  name: string;
  icon: string;
  description: string;

  // Path patterns that belong to this sector (glob patterns)
  paths: string[];

  // Rules injected into AI prompts when working in this sector
  rules: string;

  // Path to design documentation
  docTarget?: string;

  // Dependencies on other sectors
  dependencies: string[];

  // Whether changes require approval
  approvalRequired: boolean;

  // Color for UI (hex)
  color: string;
}

/**
 * Sector configuration for a project
 */
export interface SectorConfig {
  version: number;
  projectName: string;
  sectors: Sector[];
}

/**
 * Default sectors for an RPG project
 */
export const DEFAULT_RPG_SECTORS: Sector[] = [
  {
    id: 'core',
    name: 'CORE',
    icon: 'cpu',
    description: 'Shared types, interfaces, and utilities',
    paths: ['**/Shared/**', '**/Core/**', '**/Common/**'],
    rules: `You are in CORE sector - the foundation layer.
- NEVER add Unity-specific dependencies here (keep pure C#)
- All types must be serializable or interfaces
- Changes here propagate to ALL sectors - be careful
- Use readonly structs for ViewModels
- No MonoBehaviour allowed in core types`,
    docTarget: 'Docs/Architecture/CORE.md',
    dependencies: [],
    approvalRequired: true,
    color: '#6366f1'
  },
  {
    id: 'character',
    name: 'HANGAR',
    icon: 'person',
    description: 'Character customization, appearance, stats',
    paths: ['**/Character/**', '**/Player/**', '**/Avatar/**', '**/ControllerLite/**'],
    rules: `You are in HANGAR sector - character systems.
- Equipment slots follow standard pattern: helmet, armor, legs, cape, mainHand, offHand
- Color properties use tint channels (skin, hair, eye, etc.)
- All appearance changes must serialize to save data
- Use ScriptableObjects for equipment definitions
- New equipment slots need SlotCategoryConfig entry`,
    docTarget: 'Docs/Systems/CHARACTER.md',
    dependencies: ['core'],
    approvalRequired: false,
    color: '#22c55e'
  },
  {
    id: 'combat',
    name: 'ARMORY',
    icon: 'flame',
    description: 'Combat mechanics, damage, abilities',
    paths: ['**/Combat/**', '**/Battle/**', '**/Abilities/**', '**/Skills/**'],
    rules: `You are in ARMORY sector - combat systems.
- Stats: Health, Mana, Stamina, Attack, Defense, Speed
- Damage types: Physical, Fire, Ice, Lightning, Poison, Holy, Dark
- Never hardcode damage formulas - use DamageCalculator
- All abilities must have cooldown and resource cost
- Status effects as ScriptableObjects with duration + tick
- Use object pooling for damage numbers and particles`,
    docTarget: 'Docs/Systems/COMBAT.md',
    dependencies: ['core', 'character', 'inventory'],
    approvalRequired: false,
    color: '#ef4444'
  },
  {
    id: 'inventory',
    name: 'CARGO',
    icon: 'archive',
    description: 'Items, equipment, loot',
    paths: ['**/Inventory/**', '**/Items/**', '**/Loot/**', '**/Equipment/**'],
    rules: `You are in CARGO sector - inventory systems.
- Items are immutable ScriptableObjects
- InventorySlot is the mutable runtime wrapper
- All item IDs must be unique (GUID or string)
- Loot tables use weighted random from ScriptableObject
- Drag-drop uses Unity's EventSystem interfaces
- Equipment slots mirror Character system`,
    docTarget: 'Docs/Systems/INVENTORY.md',
    dependencies: ['core'],
    approvalRequired: false,
    color: '#f59e0b'
  },
  {
    id: 'dialogue',
    name: 'COMMS',
    icon: 'chat',
    description: 'NPC conversations, branching dialogue',
    paths: ['**/Dialogue/**', '**/Conversation/**', '**/NPC/**'],
    rules: `You are in COMMS sector - dialogue systems.
- DialogueTree as ScriptableObject graph of DialogueNodes
- Node types: Text, Choice, Condition, Action, Random
- Never hardcode dialogue strings - use localization keys
- All choices must have valid next nodes
- Condition nodes must have true AND false branches
- Support voice-over audio clips per node`,
    docTarget: 'Docs/Systems/DIALOGUE.md',
    dependencies: ['core', 'quest'],
    approvalRequired: false,
    color: '#8b5cf6'
  },
  {
    id: 'quest',
    name: 'MISSIONS',
    icon: 'map',
    description: 'Quest system, objectives, rewards',
    paths: ['**/Quest/**', '**/Mission/**', '**/Objectives/**'],
    rules: `You are in MISSIONS sector - quest systems.
- Quest as ScriptableObject with objectives list
- Objective types: Kill, Collect, Talk, Explore, Escort
- Quest states: Available, Active, Completed, Failed
- Track progress per-objective, aggregate to quest level
- Rewards defined in quest, granted on completion
- Prerequisites can reference other quests or conditions`,
    docTarget: 'Docs/Systems/QUESTS.md',
    dependencies: ['core', 'inventory'],
    approvalRequired: false,
    color: '#06b6d4'
  },
  {
    id: 'world',
    name: 'NAVIGATION',
    icon: 'globe',
    description: 'Maps, zones, spawning, environments',
    paths: ['**/World/**', '**/Levels/**', '**/Zones/**', '**/Environment/**'],
    rules: `You are in NAVIGATION sector - world systems.
- Zone as ScriptableObject with scene reference + connections
- Additive scene loading for seamless transitions
- Each zone must have at least one SpawnPoint
- Zone connections must be bidirectional
- Spawned enemies use object pooling
- Day/night cycle affects lighting and spawns`,
    docTarget: 'Docs/Systems/WORLD.md',
    dependencies: ['core'],
    approvalRequired: false,
    color: '#14b8a6'
  },
  {
    id: 'ai',
    name: 'SENSORS',
    icon: 'robot',
    description: 'Enemy AI, NPC behavior, pathfinding',
    paths: ['**/AI/**', '**/Behavior/**', '**/Pathfinding/**'],
    rules: `You are in SENSORS sector - AI systems.
- BehaviorTree as ScriptableObject defines decision logic
- Node types: Selector, Sequence, Parallel, Decorator, Action, Condition
- Perception via Physics2D.OverlapCircle / raycast
- AI updates on fixed timestep (not every frame)
- Use LOD for distant AI (simplified behavior)
- Cache component references, avoid GetComponent in Update`,
    docTarget: 'Docs/Systems/AI.md',
    dependencies: ['core', 'combat', 'world'],
    approvalRequired: false,
    color: '#ec4899'
  },
  {
    id: 'persistence',
    name: 'QUARTERS',
    icon: 'database',
    description: 'Save/load, player data, settings',
    paths: ['**/Save/**', '**/Persistence/**', '**/Settings/**', '**/PlayerData/**'],
    rules: `You are in QUARTERS sector - persistence systems.
- NEVER change existing save field names (breaks old saves)
- New fields must have default values
- Version bump + migration code for structural changes
- Use JSON for save format (portable)
- ISaveable interface for components with save/load needs
- Auto-save on scene transitions and timed intervals`,
    docTarget: 'Docs/Systems/PERSISTENCE.md',
    dependencies: ['core'],
    approvalRequired: true,
    color: '#64748b'
  },
  {
    id: 'ui',
    name: 'BRIDGE-UI',
    icon: 'layout',
    description: 'User interface, HUD, menus',
    paths: ['**/UI/**', '**/HUD/**', '**/Menus/**', '**/UITK/**', '**/UGUI/**'],
    rules: `You are in BRIDGE-UI sector - interface systems.
- MVP pattern: Controller (logic) + ViewAdapter (UI binding)
- ViewModels are readonly structs
- Events for user actions, methods for state updates
- Prefer UI Toolkit for new UI (UITK)
- Legacy uGUI supported but not for new features
- Use ThemeManager for light/dark mode support`,
    docTarget: 'Docs/Systems/UI.md',
    dependencies: ['core'],
    approvalRequired: false,
    color: '#a855f7'
  },
  {
    id: 'editor',
    name: 'ENGINEERING',
    icon: 'wrench',
    description: 'Editor tools, debugging, development',
    paths: ['**/Editor/**'],
    rules: `You are in ENGINEERING sector - editor tools.
- All editor code must be in Editor/ folders or Editor assemblies
- Use SerializedProperty for undo support
- Cache SerializedObject, call Update/ApplyModifiedProperties
- Large operations need progress bars
- Never include editor code in runtime builds
- UITK preferred for modern editor UI`,
    docTarget: 'Docs/Editor/TOOLS.md',
    dependencies: [],
    approvalRequired: false,
    color: '#78716c'
  },
  {
    id: 'yard',
    name: 'YARD',
    icon: 'beaker',
    description: 'Experimental, prototyping, sandbox',
    paths: ['**/Sandbox/**', '**/Prototype/**', '**/Test/**', '**/Experiments/**'],
    rules: `You are in YARD sector - experimental zone.
- No rules enforced - this is for prototyping
- Code here should NOT be production quality
- Move to proper sector when feature is ready
- Tests and experiments welcome
- Documentation not required`,
    dependencies: [],
    approvalRequired: false,
    color: '#fbbf24'
  }
];

/**
 * Platformer project template
 */
export const PLATFORMER_SECTORS: Sector[] = [
  {
    id: 'core', name: 'CORE', icon: 'cpu',
    description: 'Shared types, interfaces, and utilities',
    paths: ['**/Shared/**', '**/Core/**', '**/Common/**'],
    rules: 'CORE sector — foundation layer. Keep pure C#, no Unity-specific deps.',
    dependencies: [], approvalRequired: true, color: '#6366f1'
  },
  {
    id: 'player', name: 'PLAYER', icon: 'person',
    description: 'Player controller, movement, physics',
    paths: ['**/Player/**', '**/Controller/**', '**/Character/**'],
    rules: 'PLAYER sector — character controller and movement. Use FixedUpdate for physics.',
    dependencies: ['core'], approvalRequired: false, color: '#22c55e'
  },
  {
    id: 'levels', name: 'LEVELS', icon: 'map',
    description: 'Level design, scenes, tile maps',
    paths: ['**/Levels/**', '**/Scenes/**', '**/TileMap/**', '**/World/**'],
    rules: 'LEVELS sector — level design and scene management. Use additive loading.',
    dependencies: ['core'], approvalRequired: false, color: '#06b6d4'
  },
  {
    id: 'enemies', name: 'ENEMIES', icon: 'flame',
    description: 'Enemy AI, spawning, boss patterns',
    paths: ['**/Enemies/**', '**/AI/**', '**/Boss/**'],
    rules: 'ENEMIES sector — enemy behavior and spawning. Use object pooling.',
    dependencies: ['core', 'player'], approvalRequired: false, color: '#ef4444'
  },
  {
    id: 'items', name: 'ITEMS', icon: 'archive',
    description: 'Collectibles, power-ups, pickups',
    paths: ['**/Items/**', '**/Pickups/**', '**/PowerUps/**'],
    rules: 'ITEMS sector — collectibles and power-ups. ScriptableObjects for definitions.',
    dependencies: ['core'], approvalRequired: false, color: '#f59e0b'
  },
  {
    id: 'ui', name: 'UI', icon: 'layout',
    description: 'HUD, menus, dialogs',
    paths: ['**/UI/**', '**/HUD/**', '**/Menus/**'],
    rules: 'UI sector — user interface. MVP pattern, prefer UI Toolkit.',
    dependencies: ['core'], approvalRequired: false, color: '#a855f7'
  },
  {
    id: 'audio', name: 'AUDIO', icon: 'chat',
    description: 'Sound effects, music, audio management',
    paths: ['**/Audio/**', '**/Sound/**', '**/Music/**'],
    rules: 'AUDIO sector — audio management. Use AudioMixer groups.',
    dependencies: ['core'], approvalRequired: false, color: '#8b5cf6'
  },
  {
    id: 'editor', name: 'TOOLS', icon: 'wrench',
    description: 'Editor tools, level editors, debug',
    paths: ['**/Editor/**'],
    rules: 'TOOLS sector — editor only. Never include in runtime builds.',
    dependencies: [], approvalRequired: false, color: '#78716c'
  },
  {
    id: 'yard', name: 'YARD', icon: 'beaker',
    description: 'Prototyping and experiments',
    paths: ['**/Sandbox/**', '**/Prototype/**', '**/Test/**'],
    rules: 'YARD sector — no rules enforced. Move to proper sector when ready.',
    dependencies: [], approvalRequired: false, color: '#fbbf24'
  },
];

/**
 * Multiplayer project template
 */
export const MULTIPLAYER_SECTORS: Sector[] = [
  {
    id: 'core', name: 'CORE', icon: 'cpu',
    description: 'Shared types, interfaces, serialization',
    paths: ['**/Shared/**', '**/Core/**', '**/Common/**'],
    rules: 'CORE sector — shared between client and server. All types must be serializable.',
    dependencies: [], approvalRequired: true, color: '#6366f1'
  },
  {
    id: 'network', name: 'NETWORK', icon: 'globe',
    description: 'Networking, sync, RPC, transport',
    paths: ['**/Network/**', '**/Netcode/**', '**/Transport/**', '**/Sync/**'],
    rules: 'NETWORK sector — networking layer. Minimize bandwidth, use delta compression.',
    dependencies: ['core'], approvalRequired: true, color: '#14b8a6'
  },
  {
    id: 'lobby', name: 'LOBBY', icon: 'chat',
    description: 'Matchmaking, lobby, session management',
    paths: ['**/Lobby/**', '**/Matchmaking/**', '**/Session/**'],
    rules: 'LOBBY sector — session management. Handle disconnections gracefully.',
    dependencies: ['core', 'network'], approvalRequired: false, color: '#8b5cf6'
  },
  {
    id: 'gameplay', name: 'GAMEPLAY', icon: 'flame',
    description: 'Game mechanics, rules, scoring',
    paths: ['**/Gameplay/**', '**/Game/**', '**/Rules/**', '**/Combat/**'],
    rules: 'GAMEPLAY sector — game logic. Server-authoritative for competitive modes.',
    dependencies: ['core', 'network'], approvalRequired: false, color: '#ef4444'
  },
  {
    id: 'player', name: 'PLAYER', icon: 'person',
    description: 'Player controller, input, state',
    paths: ['**/Player/**', '**/Input/**', '**/Controller/**'],
    rules: 'PLAYER sector — player state. Use client-side prediction with server reconciliation.',
    dependencies: ['core', 'network'], approvalRequired: false, color: '#22c55e'
  },
  {
    id: 'ui', name: 'UI', icon: 'layout',
    description: 'HUD, scoreboard, chat, menus',
    paths: ['**/UI/**', '**/HUD/**', '**/Menus/**'],
    rules: 'UI sector — interface. Show connection quality indicators.',
    dependencies: ['core'], approvalRequired: false, color: '#a855f7'
  },
  {
    id: 'server', name: 'SERVER', icon: 'database',
    description: 'Dedicated server, headless, admin',
    paths: ['**/Server/**', '**/Headless/**', '**/Admin/**'],
    rules: 'SERVER sector — server-side only. Never ship to client builds.',
    dependencies: ['core', 'network'], approvalRequired: true, color: '#64748b'
  },
  {
    id: 'editor', name: 'TOOLS', icon: 'wrench',
    description: 'Editor tools, network debug',
    paths: ['**/Editor/**'],
    rules: 'TOOLS sector — editor only. Include network simulation tools.',
    dependencies: [], approvalRequired: false, color: '#78716c'
  },
  {
    id: 'yard', name: 'YARD', icon: 'beaker',
    description: 'Prototyping and experiments',
    paths: ['**/Sandbox/**', '**/Prototype/**', '**/Test/**'],
    rules: 'YARD sector — no rules enforced.',
    dependencies: [], approvalRequired: false, color: '#fbbf24'
  },
];

/**
 * Mobile project template
 */
export const MOBILE_SECTORS: Sector[] = [
  {
    id: 'core', name: 'CORE', icon: 'cpu',
    description: 'Shared types, interfaces, utilities',
    paths: ['**/Shared/**', '**/Core/**', '**/Common/**'],
    rules: 'CORE sector — foundation. Minimize allocations, pool everything.',
    dependencies: [], approvalRequired: true, color: '#6366f1'
  },
  {
    id: 'gameplay', name: 'GAMEPLAY', icon: 'flame',
    description: 'Game mechanics, levels, progression',
    paths: ['**/Gameplay/**', '**/Game/**', '**/Levels/**'],
    rules: 'GAMEPLAY sector — game logic. Target 60fps, avoid GC in update loops.',
    dependencies: ['core'], approvalRequired: false, color: '#ef4444'
  },
  {
    id: 'input', name: 'INPUT', icon: 'person',
    description: 'Touch input, gestures, haptics',
    paths: ['**/Input/**', '**/Touch/**', '**/Gestures/**'],
    rules: 'INPUT sector — touch handling. Support both portrait and landscape.',
    dependencies: ['core'], approvalRequired: false, color: '#22c55e'
  },
  {
    id: 'monetization', name: 'SHOP', icon: 'archive',
    description: 'IAP, ads, virtual currency',
    paths: ['**/IAP/**', '**/Store/**', '**/Ads/**', '**/Monetization/**'],
    rules: 'SHOP sector — monetization. Follow platform guidelines. Validate server-side.',
    dependencies: ['core'], approvalRequired: true, color: '#f59e0b'
  },
  {
    id: 'ui', name: 'UI', icon: 'layout',
    description: 'Touch-friendly UI, safe areas, adaptive',
    paths: ['**/UI/**', '**/HUD/**', '**/Menus/**'],
    rules: 'UI sector — mobile UI. Respect safe areas, min 44px touch targets.',
    dependencies: ['core'], approvalRequired: false, color: '#a855f7'
  },
  {
    id: 'persistence', name: 'SAVE', icon: 'database',
    description: 'Save system, cloud saves, analytics',
    paths: ['**/Save/**', '**/Persistence/**', '**/Analytics/**', '**/Cloud/**'],
    rules: 'SAVE sector — data persistence. Encrypt saves, support cloud backup.',
    dependencies: ['core'], approvalRequired: false, color: '#64748b'
  },
  {
    id: 'performance', name: 'PERF', icon: 'robot',
    description: 'LOD, pooling, asset bundles, optimization',
    paths: ['**/Performance/**', '**/Optimization/**', '**/AssetBundle/**'],
    rules: 'PERF sector — optimization. Profile on low-end devices. Use Addressables.',
    dependencies: ['core'], approvalRequired: false, color: '#ec4899'
  },
  {
    id: 'editor', name: 'TOOLS', icon: 'wrench',
    description: 'Editor tools, build scripts',
    paths: ['**/Editor/**'],
    rules: 'TOOLS sector — editor only.',
    dependencies: [], approvalRequired: false, color: '#78716c'
  },
  {
    id: 'yard', name: 'YARD', icon: 'beaker',
    description: 'Prototyping and experiments',
    paths: ['**/Sandbox/**', '**/Prototype/**', '**/Test/**'],
    rules: 'YARD sector — no rules enforced.',
    dependencies: [], approvalRequired: false, color: '#fbbf24'
  },
];

/**
 * Sector template registry
 */
export const SECTOR_TEMPLATES: Record<string, { label: string; sectors: Sector[] }> = {
  rpg: { label: 'RPG / Adventure', sectors: DEFAULT_RPG_SECTORS },
  platformer: { label: 'Platformer', sectors: PLATFORMER_SECTORS },
  multiplayer: { label: 'Multiplayer', sectors: MULTIPLAYER_SECTORS },
  mobile: { label: 'Mobile', sectors: MOBILE_SECTORS },
  blank: { label: 'Blank', sectors: [] },
};

/**
 * Sector Manager - handles sector detection and context
 */
export class SectorManager {
  private sectors: Map<string, Sector> = new Map();
  private pathCache: Map<string, string> = new Map();

  constructor(config?: SectorConfig) {
    const sectors = config?.sectors || DEFAULT_RPG_SECTORS;
    for (const sector of sectors) {
      this.sectors.set(sector.id, sector);
    }
  }

  /**
   * Get all sectors
   */
  getAllSectors(): Sector[] {
    return Array.from(this.sectors.values());
  }

  /**
   * Get a sector by ID
   */
  getSector(id: string): Sector | undefined {
    return this.sectors.get(id);
  }

  /**
   * Detect sector from file path
   */
  detectSector(filePath: string): Sector | undefined {
    // Check cache first
    const cached = this.pathCache.get(filePath);
    if (cached) {
      return this.sectors.get(cached);
    }

    // Normalize path
    const normalizedPath = filePath.replace(/\\/g, '/');

    for (const sector of this.sectors.values()) {
      for (const pattern of sector.paths) {
        if (this.matchGlobPattern(normalizedPath, pattern)) {
          this.pathCache.set(filePath, sector.id);
          return sector;
        }
      }
    }

    // Default to yard for unknown paths, or first available sector
    return this.sectors.get('yard') || this.sectors.values().next().value;
  }

  /**
   * Get sectors affected by a set of files
   */
  getAffectedSectors(files: string[]): Sector[] {
    const sectorIds = new Set<string>();

    for (const file of files) {
      const sector = this.detectSector(file);
      if (sector) {
        sectorIds.add(sector.id);
      }
    }

    return Array.from(sectorIds)
      .map(id => this.sectors.get(id))
      .filter((s): s is Sector => s !== undefined);
  }

  /**
   * Get all sectors that depend on a given sector
   */
  getDependentSectors(sectorId: string): Sector[] {
    return Array.from(this.sectors.values())
      .filter(s => s.dependencies.includes(sectorId));
  }

  /**
   * Check if any affected sectors require approval
   */
  requiresApproval(files: string[]): boolean {
    const sectors = this.getAffectedSectors(files);
    return sectors.some(s => s.approvalRequired);
  }

  /**
   * Build context rules for affected sectors
   */
  buildContextRules(files: string[]): string {
    const sectors = this.getAffectedSectors(files);
    if (sectors.length === 0) {
      return '';
    }

    const rules = sectors.map(s => `## ${s.name} Sector Rules\n${s.rules}`);
    return rules.join('\n\n');
  }

  /**
   * Simple glob pattern matching
   */
  private matchGlobPattern(path: string, pattern: string): boolean {
    // Convert glob to regex
    const regexPattern = pattern
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '.');

    const regex = new RegExp(regexPattern, 'i');
    return regex.test(path);
  }

  /**
   * Clear path cache (call when config changes)
   */
  clearCache(): void {
    this.pathCache.clear();
  }

  /**
   * Add or update a sector
   */
  setSector(sector: Sector): void {
    this.sectors.set(sector.id, sector);
    this.clearCache();
  }

  /**
   * Remove a sector
   */
  removeSector(id: string): boolean {
    const result = this.sectors.delete(id);
    if (result) {
      this.clearCache();
    }
    return result;
  }

  /**
   * Export config for persistence
   */
  exportConfig(projectName: string): SectorConfig {
    return {
      version: 1,
      projectName,
      sectors: Array.from(this.sectors.values())
    };
  }

  /**
   * Import config
   */
  importConfig(config: SectorConfig): void {
    this.sectors.clear();
    for (const sector of config.sectors) {
      this.sectors.set(sector.id, sector);
    }
    this.clearCache();
  }
}

/**
 * Singleton instance
 */
let sectorManagerInstance: SectorManager | null = null;

export function getSectorManager(): SectorManager {
  if (!sectorManagerInstance) {
    sectorManagerInstance = new SectorManager();
  }
  return sectorManagerInstance;
}

export function initSectorManager(config?: SectorConfig): SectorManager {
  sectorManagerInstance = new SectorManager(config);
  return sectorManagerInstance;
}
