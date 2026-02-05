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
  [TABS.STATION]: ['station', 'control'],
};

export const TAB_DEFAULT_MODE = {
  [TABS.CHAT]: 'flow',
  [TABS.STATION]: 'station',
};

export const MODES = TABS;

// Persona routing: maps tab (+dashboard subtab) → persona id
export const PERSONA_MAP = {
  chat: 'nova',
  station: 'gears',
  agents: 'nova',
  skills: 'nova',
  // Dashboard subtabs
  'dashboard:docs': 'index',
  'dashboard:tickets': 'triage',
  'dashboard:db': 'vault',
  'dashboard:settings': 'palette',
  'dashboard:art': 'palette',
};

export const uiState = {
  currentTab: 'chat',
  currentPersona: 'nova',
  dashboardSubtab: 'docs',
  chatMode: 'solo',
  mode: 'chat',
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
