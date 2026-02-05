/**
 * Game UI Pipeline Types
 *
 * Types for orchestrating Unity UI component generation
 * via Coplay MCP with placeholder-first workflow.
 */

/** Component categories from the catalog */
export type ComponentCategory =
  | 'primitive'
  | 'system'
  | 'menu'
  | 'hud'
  | 'inventory'
  | 'character'
  | 'social'
  | 'shop'
  | 'dialog'
  | 'map';

/** Component generation status */
export type ComponentStatus =
  | 'planned'
  | 'placeholder'
  | 'verified'
  | 'art-generated'
  | 'art-swapped'
  | 'complete';

/** Pipeline phase */
export type PipelinePhase =
  | 'theme'
  | 'primitives'
  | 'system-screens'
  | 'menu'
  | 'hud'
  | 'panels'
  | 'dialogs-map'
  | 'art-replacement';

/** Placeholder color per category */
export const PLACEHOLDER_COLORS: Record<ComponentCategory, string> = {
  primitive: '#64748B',
  system: '#3B82F6',
  menu: '#8B5CF6',
  hud: '#22C55E',
  inventory: '#F59E0B',
  character: '#F59E0B',
  social: '#F59E0B',
  shop: '#F59E0B',
  dialog: '#EF4444',
  map: '#6B7280',
};

/** A single UI component definition */
export interface GameUIComponent {
  id: string;
  name: string;
  category: ComponentCategory;
  description: string;
  status: ComponentStatus;
  /** USS class name */
  ussClass?: string;
  /** Relative path in Unity project */
  prefabPath?: string;
  /** Dimensions (width x height) */
  width?: number;
  height?: number;
  /** Parent component ID (for nested components) */
  parentId?: string;
  /** Dependencies on other component IDs */
  dependencies?: string[];
  /** Placeholder color override */
  placeholderColor?: string;
  /** Whether this component has art generated */
  hasArt?: boolean;
  /** Spritesheet path if art exists */
  spritePath?: string;
  /** Error from last generation attempt */
  lastError?: string;
  /** Timestamp of last status change */
  updatedAt?: number;
}

/** Theme variable definition */
export interface ThemeVariable {
  name: string;
  value: string;
  category: 'brand' | 'surface' | 'text' | 'feedback' | 'rarity' | 'bars' | 'typography' | 'spacing' | 'borders' | 'components';
}

/** Theme definition */
export interface GameUITheme {
  id: string;
  name: string;
  variables: ThemeVariable[];
  ussPath?: string;
  isActive?: boolean;
}

/** Pipeline state */
export interface GameUIPipelineState {
  /** Current phase */
  phase: PipelinePhase;
  /** All registered components */
  components: GameUIComponent[];
  /** Active theme */
  activeThemeId: string;
  /** Available themes */
  themes: GameUITheme[];
  /** Components generated in current session */
  generatedCount: number;
  /** Total components planned */
  totalCount: number;
  /** Whether pipeline is running */
  isRunning: boolean;
  /** Current operation description */
  currentOperation?: string;
  /** Errors from last run */
  errors: PipelineError[];
}

/** Pipeline error */
export interface PipelineError {
  componentId: string;
  phase: PipelinePhase;
  message: string;
  timestamp: number;
}

/** Pipeline configuration */
export interface GameUIPipelineConfig {
  /** Unity project root (for asset paths) */
  unityProjectRoot: string;
  /** Base path for UI assets */
  uiBasePath: string;
  /** Base path for themes */
  themeBasePath: string;
  /** Base path for sprites */
  spriteBasePath: string;
  /** Target resolution */
  targetWidth: number;
  targetHeight: number;
  /** Whether to auto-verify after generation */
  autoVerify: boolean;
  /** Whether to capture screenshots after generation */
  captureScreenshots: boolean;
}

/** Default pipeline config */
export const DEFAULT_PIPELINE_CONFIG: GameUIPipelineConfig = {
  unityProjectRoot: '',
  uiBasePath: 'Assets/UI',
  themeBasePath: 'Assets/UI/Themes',
  spriteBasePath: 'Assets/UI/Sprites',
  targetWidth: 1920,
  targetHeight: 1080,
  autoVerify: true,
  captureScreenshots: true,
};

/** Default theme (from catalog) */
export const DEFAULT_THEME: GameUITheme = {
  id: 'default-dark',
  name: 'Dark Fantasy',
  isActive: true,
  variables: [
    { name: '--color-primary', value: '#7C3AED', category: 'brand' },
    { name: '--color-primary-hover', value: '#6D28D9', category: 'brand' },
    { name: '--color-primary-pressed', value: '#5B21B6', category: 'brand' },
    { name: '--color-secondary', value: '#1E293B', category: 'brand' },
    { name: '--color-accent', value: '#F59E0B', category: 'brand' },
    { name: '--color-bg', value: '#0F172A', category: 'surface' },
    { name: '--color-surface', value: '#1E293B', category: 'surface' },
    { name: '--color-surface-raised', value: '#334155', category: 'surface' },
    { name: '--color-overlay', value: 'rgba(0, 0, 0, 0.6)', category: 'surface' },
    { name: '--color-text', value: '#F8FAFC', category: 'text' },
    { name: '--color-text-secondary', value: '#94A3B8', category: 'text' },
    { name: '--color-text-disabled', value: '#475569', category: 'text' },
    { name: '--color-success', value: '#22C55E', category: 'feedback' },
    { name: '--color-danger', value: '#EF4444', category: 'feedback' },
    { name: '--color-warning', value: '#F59E0B', category: 'feedback' },
    { name: '--color-info', value: '#3B82F6', category: 'feedback' },
    { name: '--rarity-common', value: '#9CA3AF', category: 'rarity' },
    { name: '--rarity-uncommon', value: '#22C55E', category: 'rarity' },
    { name: '--rarity-rare', value: '#3B82F6', category: 'rarity' },
    { name: '--rarity-epic', value: '#A855F7', category: 'rarity' },
    { name: '--rarity-legendary', value: '#F59E0B', category: 'rarity' },
    { name: '--rarity-mythic', value: '#EF4444', category: 'rarity' },
    { name: '--bar-hp', value: '#EF4444', category: 'bars' },
    { name: '--bar-mp', value: '#3B82F6', category: 'bars' },
    { name: '--bar-xp', value: '#F59E0B', category: 'bars' },
    { name: '--bar-stamina', value: '#22C55E', category: 'bars' },
  ],
};

/** Primitive component catalog (PRM-001 through PRM-017) */
export const PRIMITIVE_COMPONENTS: GameUIComponent[] = [
  { id: 'PRM-001', name: 'Button', category: 'primitive', description: 'Primary, secondary, ghost, icon, danger variants', status: 'planned' },
  { id: 'PRM-002', name: 'Toggle', category: 'primitive', description: 'On/off toggle switch', status: 'planned' },
  { id: 'PRM-003', name: 'Slider', category: 'primitive', description: 'Horizontal slider with track and thumb', status: 'planned' },
  { id: 'PRM-004', name: 'Dropdown', category: 'primitive', description: 'Select from list of options', status: 'planned' },
  { id: 'PRM-005', name: 'Text Input', category: 'primitive', description: 'Single-line text entry', status: 'planned' },
  { id: 'PRM-006', name: 'Checkbox', category: 'primitive', description: 'Binary selection with label', status: 'planned' },
  { id: 'PRM-007', name: 'Radio Group', category: 'primitive', description: 'Single selection from group', status: 'planned' },
  { id: 'PRM-008', name: 'Tab Bar', category: 'primitive', description: 'Horizontal tab navigation', status: 'planned' },
  { id: 'PRM-009', name: 'Scroll View', category: 'primitive', description: 'Scrollable content area', status: 'planned' },
  { id: 'PRM-010', name: 'Progress Bar', category: 'primitive', description: 'Horizontal fill bar with label', status: 'planned' },
  { id: 'PRM-011', name: 'Badge / Pill', category: 'primitive', description: 'Small label chip', status: 'planned' },
  { id: 'PRM-012', name: 'Divider', category: 'primitive', description: 'Horizontal separator line', status: 'planned' },
  { id: 'PRM-013', name: 'Avatar Frame', category: 'primitive', description: 'Character portrait with rarity border', status: 'planned' },
  { id: 'PRM-014', name: 'Tooltip', category: 'primitive', description: 'Hover information popup', status: 'planned' },
  { id: 'PRM-015', name: 'Modal Backdrop', category: 'primitive', description: 'Full-screen semi-transparent overlay', status: 'planned' },
  { id: 'PRM-016', name: 'Spinner / Loader', category: 'primitive', description: 'Loading animation', status: 'planned' },
  { id: 'PRM-017', name: 'Star Rating', category: 'primitive', description: '1-5 star rating display', status: 'planned' },
];

/** System screen catalog (SYS-001 through SYS-009) */
export const SYSTEM_COMPONENTS: GameUIComponent[] = [
  { id: 'SYS-001', name: 'Splash Screen', category: 'system', description: 'Logo + loading animation', status: 'planned' },
  { id: 'SYS-002', name: 'Title Screen', category: 'system', description: 'Game title + press start + menu', status: 'planned' },
  { id: 'SYS-003', name: 'Loading Screen', category: 'system', description: 'Progress bar + tips', status: 'planned' },
  { id: 'SYS-004', name: 'Login Panel', category: 'system', description: 'Username, password, OAuth buttons', status: 'planned' },
  { id: 'SYS-005', name: 'Server Select', category: 'system', description: 'Server list with ping/status', status: 'planned' },
  { id: 'SYS-006', name: 'Settings Panel', category: 'system', description: 'Graphics, audio, input, gameplay tabs', status: 'planned' },
  { id: 'SYS-007', name: 'Credits Scroll', category: 'system', description: 'Auto-scrolling team credits', status: 'planned' },
  { id: 'SYS-008', name: 'Pause Menu', category: 'system', description: 'Resume, settings, quit buttons', status: 'planned' },
  { id: 'SYS-009', name: 'Game Over Screen', category: 'system', description: 'Score summary + retry/menu', status: 'planned' },
];

/** HUD component catalog (HUD-001 through HUD-018) */
export const HUD_COMPONENTS: GameUIComponent[] = [
  { id: 'HUD-001', name: 'Health Bar', category: 'hud', description: 'HP fill bar with numeric value', status: 'planned' },
  { id: 'HUD-002', name: 'Mana Bar', category: 'hud', description: 'MP fill bar with numeric value', status: 'planned' },
  { id: 'HUD-003', name: 'XP Bar', category: 'hud', description: 'Experience with level indicator', status: 'planned' },
  { id: 'HUD-004', name: 'Stamina Bar', category: 'hud', description: 'Stamina fill bar', status: 'planned' },
  { id: 'HUD-005', name: 'Mini Map', category: 'hud', description: 'Circular or square corner map', status: 'planned' },
  { id: 'HUD-006', name: 'Quest Tracker', category: 'hud', description: 'Active quest objectives list', status: 'planned' },
  { id: 'HUD-007', name: 'Hotbar / Action Bar', category: 'hud', description: 'Skill/item slot row with cooldowns', status: 'planned' },
  { id: 'HUD-008', name: 'Chat Box', category: 'hud', description: 'In-game text chat with channels', status: 'planned' },
  { id: 'HUD-009', name: 'Target Frame', category: 'hud', description: 'Selected enemy/NPC info', status: 'planned' },
  { id: 'HUD-010', name: 'Party Frames', category: 'hud', description: 'Group member HP/status list', status: 'planned' },
  { id: 'HUD-011', name: 'Buff/Debuff Bar', category: 'hud', description: 'Status effect icons with timers', status: 'planned' },
  { id: 'HUD-012', name: 'Damage Numbers', category: 'hud', description: 'Floating combat text', status: 'planned' },
  { id: 'HUD-013', name: 'Notification Toast', category: 'hud', description: 'Achievement/loot popup', status: 'planned' },
  { id: 'HUD-014', name: 'Currency Display', category: 'hud', description: 'Gold/gem counters', status: 'planned' },
  { id: 'HUD-015', name: 'Compass / Direction', category: 'hud', description: 'Top-bar compass strip', status: 'planned' },
  { id: 'HUD-016', name: 'Boss Health Bar', category: 'hud', description: 'Wide bar with boss name', status: 'planned' },
  { id: 'HUD-017', name: 'Interaction Prompt', category: 'hud', description: '"Press E to interact" prompt', status: 'planned' },
  { id: 'HUD-018', name: 'Crosshair / Reticle', category: 'hud', description: 'Aim indicator', status: 'planned' },
];

/** Menu components (MENU-001 through MENU-009) */
export const MENU_COMPONENTS: GameUIComponent[] = [
  { id: 'MENU-001', name: 'Main Menu', category: 'menu', description: 'Play, options, credits, quit', status: 'planned' },
  { id: 'MENU-002', name: 'Character Select', category: 'menu', description: 'Character slots with preview', status: 'planned' },
  { id: 'MENU-003', name: 'Character Create', category: 'menu', description: 'Customization sliders and preview', status: 'planned' },
  { id: 'MENU-004', name: 'Lobby', category: 'menu', description: 'Multiplayer lobby with player list', status: 'planned' },
  { id: 'MENU-005', name: 'Mode Select', category: 'menu', description: 'Game mode selection grid', status: 'planned' },
  { id: 'MENU-006', name: 'Difficulty Select', category: 'menu', description: 'Easy/Normal/Hard with descriptions', status: 'planned' },
  { id: 'MENU-007', name: 'Save/Load', category: 'menu', description: 'Save slot list with screenshots', status: 'planned' },
  { id: 'MENU-008', name: 'World Select', category: 'menu', description: 'World/region selection map', status: 'planned' },
  { id: 'MENU-009', name: 'Daily Rewards', category: 'menu', description: 'Daily login reward calendar', status: 'planned' },
];

/** Panel components (INV, CHAR, SOC, SHOP) */
export const PANEL_COMPONENTS: GameUIComponent[] = [
  { id: 'INV-001', name: 'Inventory Grid', category: 'inventory', description: 'Grid of item slots with drag-drop', status: 'planned' },
  { id: 'INV-002', name: 'Item Tooltip', category: 'inventory', description: 'Detailed item info on hover', status: 'planned' },
  { id: 'INV-003', name: 'Equipment Panel', category: 'inventory', description: 'Paper doll with gear slots', status: 'planned' },
  { id: 'INV-004', name: 'Item Compare', category: 'inventory', description: 'Side-by-side stat comparison', status: 'planned' },
  { id: 'INV-005', name: 'Sort/Filter Bar', category: 'inventory', description: 'Category tabs and sort options', status: 'planned' },
  { id: 'INV-006', name: 'Crafting Panel', category: 'inventory', description: 'Recipe list and material slots', status: 'planned' },
  { id: 'INV-007', name: 'Enhancement Panel', category: 'inventory', description: 'Upgrade/enchant interface', status: 'planned' },
  { id: 'INV-008', name: 'Loot Window', category: 'inventory', description: 'Dropped items pickup dialog', status: 'planned' },
  { id: 'INV-009', name: 'Bag Tabs', category: 'inventory', description: 'Multiple bag slot switching', status: 'planned' },
  { id: 'CHAR-001', name: 'Character Sheet', category: 'character', description: 'Full stats and attributes', status: 'planned' },
  { id: 'CHAR-002', name: 'Skill Tree', category: 'character', description: 'Branching skill progression', status: 'planned' },
  { id: 'CHAR-003', name: 'Talent Panel', category: 'character', description: 'Passive talent grid', status: 'planned' },
  { id: 'CHAR-004', name: 'Achievement Panel', category: 'character', description: 'Achievement list with progress', status: 'planned' },
  { id: 'CHAR-005', name: 'Title/Badge Select', category: 'character', description: 'Earned titles and badges', status: 'planned' },
  { id: 'CHAR-006', name: 'Collection Log', category: 'character', description: 'Collectible tracking grid', status: 'planned' },
  { id: 'SOC-001', name: 'Friends List', category: 'social', description: 'Online/offline friends', status: 'planned' },
  { id: 'SOC-002', name: 'Guild Panel', category: 'social', description: 'Guild info and member list', status: 'planned' },
  { id: 'SOC-003', name: 'Party Panel', category: 'social', description: 'Party management', status: 'planned' },
  { id: 'SOC-004', name: 'Mail Inbox', category: 'social', description: 'In-game mail system', status: 'planned' },
  { id: 'SOC-005', name: 'Leaderboard', category: 'social', description: 'Ranking tables', status: 'planned' },
  { id: 'SOC-006', name: 'Player Profile', category: 'social', description: 'Public player card', status: 'planned' },
  { id: 'SOC-007', name: 'Trade Window', category: 'social', description: 'Player-to-player trade', status: 'planned' },
  { id: 'SOC-008', name: 'Emote Picker', category: 'social', description: 'Emote/reaction wheel', status: 'planned' },
  { id: 'SHOP-001', name: 'Shop Grid', category: 'shop', description: 'Item listing with prices', status: 'planned' },
  { id: 'SHOP-002', name: 'Shop Item Detail', category: 'shop', description: 'Item preview and purchase', status: 'planned' },
  { id: 'SHOP-003', name: 'Bundle/Pack', category: 'shop', description: 'Multi-item bundle display', status: 'planned' },
  { id: 'SHOP-004', name: 'Cart / Checkout', category: 'shop', description: 'Purchase confirmation', status: 'planned' },
  { id: 'SHOP-005', name: 'Auction House', category: 'shop', description: 'Player marketplace', status: 'planned' },
  { id: 'SHOP-006', name: 'Purchase History', category: 'shop', description: 'Transaction log', status: 'planned' },
  { id: 'SHOP-007', name: 'Premium Currency', category: 'shop', description: 'Gem/crystal purchase packs', status: 'planned' },
];

/** Dialog and map components */
export const DIALOG_MAP_COMPONENTS: GameUIComponent[] = [
  { id: 'DLG-001', name: 'Dialog Box', category: 'dialog', description: 'NPC text with portrait', status: 'planned' },
  { id: 'DLG-002', name: 'Choice Menu', category: 'dialog', description: 'Branching dialog options', status: 'planned' },
  { id: 'DLG-003', name: 'Confirm Dialog', category: 'dialog', description: 'Yes/No confirmation', status: 'planned' },
  { id: 'DLG-004', name: 'Alert Banner', category: 'dialog', description: 'Top/bottom screen alert', status: 'planned' },
  { id: 'DLG-005', name: 'Number Input', category: 'dialog', description: 'Quantity selector (+/-)', status: 'planned' },
  { id: 'DLG-006', name: 'Color Picker', category: 'dialog', description: 'Color selection wheel/grid', status: 'planned' },
  { id: 'DLG-007', name: 'Tutorial Overlay', category: 'dialog', description: 'Step-by-step highlight tutorial', status: 'planned' },
  { id: 'DLG-008', name: 'Cutscene Bars', category: 'dialog', description: 'Cinematic letterbox bars', status: 'planned' },
  { id: 'MAP-001', name: 'World Map', category: 'map', description: 'Full-screen region map', status: 'planned' },
  { id: 'MAP-002', name: 'Zone Map', category: 'map', description: 'Area detail map', status: 'planned' },
  { id: 'MAP-003', name: 'Waypoint Marker', category: 'map', description: 'Map pin with label', status: 'planned' },
  { id: 'MAP-004', name: 'Map Legend', category: 'map', description: 'Icon legend panel', status: 'planned' },
  { id: 'MAP-005', name: 'Fast Travel', category: 'map', description: 'Teleport confirmation with cost', status: 'planned' },
];

/** Get all components from all catalogs */
export function getAllCatalogComponents(): GameUIComponent[] {
  return [
    ...PRIMITIVE_COMPONENTS,
    ...SYSTEM_COMPONENTS,
    ...HUD_COMPONENTS,
    ...MENU_COMPONENTS,
    ...PANEL_COMPONENTS,
    ...DIALOG_MAP_COMPONENTS,
  ];
}

/** Phase order for pipeline execution */
export const PIPELINE_PHASES: PipelinePhase[] = [
  'theme',
  'primitives',
  'system-screens',
  'menu',
  'hud',
  'panels',
  'dialogs-map',
  'art-replacement',
];

/** Map phase to component categories */
export const PHASE_CATEGORIES: Record<PipelinePhase, ComponentCategory[]> = {
  'theme': [],
  'primitives': ['primitive'],
  'system-screens': ['system'],
  'menu': ['menu'],
  'hud': ['hud'],
  'panels': ['inventory', 'character', 'social', 'shop'],
  'dialogs-map': ['dialog', 'map'],
  'art-replacement': [],
};
