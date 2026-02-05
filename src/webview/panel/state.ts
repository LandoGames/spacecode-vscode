export const TABS = {
  CHAT: 'chat',
  STATION: 'station',
  AGENTS: 'agents',
  SKILLS: 'skills',
  DASHBOARD: 'dashboard',
};

export const CHAT_MODES = {
  SOLO: 'solo',
  PLANNING: 'planning',
};

export const TAB_PANEL_MODES = {
  [TABS.CHAT]: ['flow', 'chat', 'planning'],
  [TABS.STATION]: ['station', 'control', 'flow', 'planning'],
};

export const TAB_DEFAULT_MODE = {
  [TABS.CHAT]: 'flow',
  [TABS.STATION]: 'station',
};

export const MODES = TABS;

// Tab → Auto-Skills Mapping (Phase 0.8)
export const TAB_SKILL_MAP: Record<string, string[]> = {
  [TABS.STATION]: ['sector-analysis', 'asmdef-check', 'build-tools'],
  [TABS.DASHBOARD]: ['project-health', 'settings-access'],
  [TABS.AGENTS]: ['agent-management', 'task-delegation'],
  [TABS.SKILLS]: ['skill-lookup', 'doc-templates'],
};

// Built-in navigation skills (Phase 0.9)
export const BUILTIN_NAV_COMMANDS: Record<string, { tab: string; subtab?: string; label: string; special?: string }> = {
  '/docs': { tab: 'dashboard', subtab: 'docs', label: 'Open Docs panel' },
  '/tickets': { tab: 'dashboard', subtab: 'tickets', label: 'Open Tickets panel' },
  '/station': { tab: 'station', label: 'Switch to Station' },
  '/skills': { tab: 'skills', label: 'Switch to Skills' },
  '/agents': { tab: 'agents', label: 'Switch to Agents' },
  '/dashboard': { tab: 'dashboard', label: 'Switch to Dashboard' },
  '/help': { tab: '', label: 'List available commands', special: 'help' },
};

// Persona routing: maps tab (+dashboard subtab) → persona id
export const PERSONA_MAP = {
  chat: 'lead-engineer',
  station: 'qa-engineer',
  agents: 'lead-engineer',
  skills: 'lead-engineer',
  // Dashboard subtabs
  'dashboard:docs': 'technical-writer',
  'dashboard:tickets': 'issue-triager',
  'dashboard:db': 'database-engineer',
  'dashboard:settings': 'art-director',
  'dashboard:art': 'art-director',
};

export const uiState = {
  currentTab: 'station',
  currentPersona: 'lead-engineer',
  personaManualOverride: false,
  autoSkills: [],
  manualSkills: [],
  activeSkins: [],
  chatCollapsed: false,
  dashboardSubtab: 'docs',
  chatMode: 'solo',
  mode: 'station',
  attachedImages: [],
  contextPreview: '',
  docTargets: [],
  docTarget: '',
  shipProfile: 'yard',
  sector: null,
  scene: 'exterior',
  stationViewMode: 'schematic',
  planTemplates: [],
  planList: [],
  currentPlan: null,
  lastDiff: null,
  lastPlanComparison: null,
  lastAIReview: null,
  coordinator: {
    status: 'unknown',
    lastSync: null,
  },
};
