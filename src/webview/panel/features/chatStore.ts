// @ts-nocheck

/**
 * ChatStore — single source of truth for persistent chat state in V3 layout.
 *
 * Consolidates persona, override, and skill context that the chat-pane
 * needs across all tab switches. Message history stays in chatSessions.ts.
 */

const PERSONA_COLORS = {
  'lead-engineer': '#a855f7',
  'qa-engineer': '#f59e0b',
  'technical-writer': '#3b82f6',
  'issue-triager': '#10b981',
  'database-engineer': '#22c55e',
  'art-director': '#ec4899',
};

const PERSONA_LABELS = {
  'lead-engineer': 'Lead Engineer',
  'qa-engineer': 'QA Engineer',
  'technical-writer': 'Technical Writer',
  'issue-triager': 'Issue Triager',
  'database-engineer': 'Database Engineer',
  'art-director': 'Art Director',
};

export function createChatStore(deps) {
  const { uiState, PERSONA_MAP, vscode } = deps;

  // --- Getters ---
  function getActivePersona() {
    return uiState.currentPersona || 'lead-engineer';
  }

  function isManualOverride() {
    return !!uiState.personaManualOverride;
  }

  function getAutoSkills() {
    return uiState.autoSkills || [];
  }

  function getManualSkills() {
    return uiState.manualSkills || [];
  }

  function getCombinedSkills() {
    return [...new Set([...getAutoSkills(), ...getManualSkills()])];
  }

  function getPersonaColor(personaId) {
    return PERSONA_COLORS[personaId || getActivePersona()] || '#a855f7';
  }

  function getPersonaLabel(personaId) {
    return PERSONA_LABELS[personaId || getActivePersona()] || (personaId || 'Lead Engineer');
  }

  // --- Setters ---
  function setPersona(personaId, manual = false) {
    uiState.currentPersona = personaId;
    uiState.personaManualOverride = manual;
    if (manual) {
      vscode.postMessage({ type: 'setPersona', personaId });
    }
    notifyListeners();
  }

  function clearOverride(currentTab) {
    uiState.personaManualOverride = false;
    const personaKey = currentTab === 'dashboard'
      ? `dashboard:${uiState.dashboardSubtab || 'docs'}`
      : currentTab;
    const persona = (PERSONA_MAP && PERSONA_MAP[personaKey]) || PERSONA_MAP[currentTab] || 'lead-engineer';
    uiState.currentPersona = persona;
    notifyListeners();
  }

  function setAutoSkills(skills) {
    uiState.autoSkills = skills;
    notifyListeners();
  }

  function addManualSkill(skillId) {
    const current = uiState.manualSkills || [];
    if (!current.includes(skillId)) {
      uiState.manualSkills = [...current, skillId];
      notifyListeners();
    }
  }

  function removeManualSkill(skillId) {
    uiState.manualSkills = (uiState.manualSkills || []).filter(s => s !== skillId);
    notifyListeners();
  }

  // --- Listener pattern for UI updates ---
  const listeners = [];
  function subscribe(fn) {
    listeners.push(fn);
    return () => {
      const idx = listeners.indexOf(fn);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  }
  function notifyListeners() {
    const state = getSnapshot();
    listeners.forEach(fn => fn(state));
  }

  function getSnapshot() {
    return {
      activePersona: getActivePersona(),
      manualOverride: isManualOverride(),
      autoSkills: getAutoSkills(),
      manualSkills: getManualSkills(),
      combinedSkills: getCombinedSkills(),
      personaColor: getPersonaColor(),
      personaLabel: getPersonaLabel(),
    };
  }

  return {
    getActivePersona,
    isManualOverride,
    getAutoSkills,
    getManualSkills,
    getCombinedSkills,
    getPersonaColor,
    getPersonaLabel,
    setPersona,
    clearOverride,
    setAutoSkills,
    addManualSkill,
    removeManualSkill,
    subscribe,
    getSnapshot,
    PERSONA_COLORS,
    PERSONA_LABELS,
  };
}
