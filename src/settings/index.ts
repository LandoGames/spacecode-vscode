/**
 * Settings Module
 *
 * Manages SpaceCode extension settings, keyboard shortcuts, and first-run state.
 */

import * as vscode from 'vscode';

export interface SpaceCodeSettings {
  // General
  defaultPersona: string;
  theme: 'dark' | 'light' | 'system';
  language: string;

  // AI Provider
  aiProvider: 'claude' | 'gemini' | 'local';
  apiKey?: string;
  maxTokens: number;
  temperature: number;

  // Behavior
  autoSave: boolean;
  autoScan: boolean;
  showTokenUsage: boolean;
  confirmDestructive: boolean;

  // Notifications
  showToasts: boolean;
  toastDuration: number;
  desktopNotifications: boolean;

  // Developer
  debugMode: boolean;
  showPanelBorders: boolean;
  verboseLogging: boolean;

  // Project
  projectComplexity: 'simple' | 'complex' | '';

  // First run
  hasCompletedFirstRun: boolean;
  firstRunStep: number;
}

export interface KeyboardShortcut {
  id: string;
  name: string;
  description: string;
  defaultKey: string;
  currentKey: string;
  command: string;
}

const DEFAULT_SETTINGS: SpaceCodeSettings = {
  defaultPersona: 'nova',
  theme: 'dark',
  language: 'en',
  aiProvider: 'claude',
  maxTokens: 4096,
  temperature: 0.7,
  autoSave: true,
  autoScan: true,
  showTokenUsage: true,
  confirmDestructive: true,
  showToasts: true,
  toastDuration: 5,
  desktopNotifications: false,
  debugMode: false,
  showPanelBorders: false,
  verboseLogging: false,
  projectComplexity: '',
  hasCompletedFirstRun: false,
  firstRunStep: 0
};

const DEFAULT_SHORTCUTS: KeyboardShortcut[] = [
  {
    id: 'togglePanel',
    name: 'Toggle Panel',
    description: 'Show/hide the SpaceCode panel',
    defaultKey: 'Ctrl+Shift+P',
    currentKey: 'Ctrl+Shift+P',
    command: 'spacecode.toggle'
  },
  {
    id: 'newChat',
    name: 'New Chat',
    description: 'Start a new chat conversation',
    defaultKey: 'Ctrl+N',
    currentKey: 'Ctrl+N',
    command: 'spacecode.newChat'
  },
  {
    id: 'focusInput',
    name: 'Focus Input',
    description: 'Focus the chat input field',
    defaultKey: 'Ctrl+/',
    currentKey: 'Ctrl+/',
    command: 'spacecode.focusInput'
  },
  {
    id: 'stopGeneration',
    name: 'Stop Generation',
    description: 'Stop the current AI generation',
    defaultKey: 'Escape',
    currentKey: 'Escape',
    command: 'spacecode.stop'
  },
  {
    id: 'switchPersona',
    name: 'Switch Persona',
    description: 'Open persona switcher',
    defaultKey: 'Ctrl+Shift+1',
    currentKey: 'Ctrl+Shift+1',
    command: 'spacecode.switchPersona'
  },
  {
    id: 'runScan',
    name: 'Run Scan',
    description: 'Run quality/security scan',
    defaultKey: 'Ctrl+Shift+S',
    currentKey: 'Ctrl+Shift+S',
    command: 'spacecode.runScan'
  },
  {
    id: 'openDocs',
    name: 'Open Docs',
    description: 'Open documentation panel',
    defaultKey: 'Ctrl+Shift+D',
    currentKey: 'Ctrl+Shift+D',
    command: 'spacecode.openDocs'
  },
  {
    id: 'openDashboard',
    name: 'Open Dashboard',
    description: 'Open dashboard panel',
    defaultKey: 'Ctrl+Shift+B',
    currentKey: 'Ctrl+Shift+B',
    command: 'spacecode.openDashboard'
  }
];

let _settings: SpaceCodeSettings = { ...DEFAULT_SETTINGS };
let _shortcuts: KeyboardShortcut[] = DEFAULT_SHORTCUTS.map(s => ({ ...s }));
let _storageKey = 'spacecode.settings';
let _shortcutsKey = 'spacecode.shortcuts';

export function getSettings(): SpaceCodeSettings {
  return _settings;
}

export function getSetting<K extends keyof SpaceCodeSettings>(key: K): SpaceCodeSettings[K] {
  return _settings[key];
}

export function updateSettings(updates: Partial<SpaceCodeSettings>): SpaceCodeSettings {
  _settings = { ..._settings, ...updates };
  return _settings;
}

export function getShortcuts(): KeyboardShortcut[] {
  return _shortcuts;
}

export function updateShortcut(id: string, newKey: string): KeyboardShortcut | undefined {
  const shortcut = _shortcuts.find(s => s.id === id);
  if (shortcut) {
    shortcut.currentKey = newKey;
  }
  return shortcut;
}

export function resetShortcut(id: string): KeyboardShortcut | undefined {
  const shortcut = _shortcuts.find(s => s.id === id);
  if (shortcut) {
    shortcut.currentKey = shortcut.defaultKey;
  }
  return shortcut;
}

export function resetAllShortcuts(): void {
  _shortcuts = DEFAULT_SHORTCUTS.map(s => ({ ...s }));
}

export async function loadSettings(context: vscode.ExtensionContext): Promise<void> {
  const saved = context.globalState.get<string>(_storageKey);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      _settings = { ...DEFAULT_SETTINGS, ...parsed };
    } catch {
      // Invalid saved state
    }
  }

  const savedShortcuts = context.globalState.get<string>(_shortcutsKey);
  if (savedShortcuts) {
    try {
      const parsed = JSON.parse(savedShortcuts);
      _shortcuts = parsed;
    } catch {
      // Invalid saved state
    }
  }
}

export async function saveSettings(context: vscode.ExtensionContext): Promise<void> {
  await context.globalState.update(_storageKey, JSON.stringify(_settings));
  await context.globalState.update(_shortcutsKey, JSON.stringify(_shortcuts));
}

export function isFirstRun(): boolean {
  return !_settings.hasCompletedFirstRun;
}

export function completeFirstRun(): void {
  _settings.hasCompletedFirstRun = true;
  _settings.firstRunStep = 0;
}

export function getFirstRunStep(): number {
  return _settings.firstRunStep;
}

export function setFirstRunStep(step: number): void {
  _settings.firstRunStep = step;
}

// Token budget display helpers
export interface TokenBudget {
  used: number;
  limit: number;
  percentage: number;
  remaining: number;
}

let _tokenBudget: TokenBudget = {
  used: 0,
  limit: 100000,
  percentage: 0,
  remaining: 100000
};

export function getTokenBudget(): TokenBudget {
  return _tokenBudget;
}

export function updateTokenBudget(used: number, limit?: number): TokenBudget {
  if (limit !== undefined) {
    _tokenBudget.limit = limit;
  }
  _tokenBudget.used = used;
  _tokenBudget.remaining = _tokenBudget.limit - used;
  _tokenBudget.percentage = Math.round((used / _tokenBudget.limit) * 100);
  return _tokenBudget;
}

// First-run wizard state
export interface FirstRunWizardState {
  currentStep: number;
  totalSteps: number;
  steps: FirstRunStep[];
  isComplete: boolean;
}

export interface FirstRunStep {
  id: string;
  title: string;
  description: string;
  isComplete: boolean;
}

export function getFirstRunWizardState(): FirstRunWizardState {
  return {
    currentStep: _settings.firstRunStep,
    totalSteps: 5,
    steps: [
      { id: 'welcome', title: 'Welcome', description: 'Welcome to SpaceCode', isComplete: _settings.firstRunStep > 0 },
      { id: 'project', title: 'Project Setup', description: 'Configure your project', isComplete: _settings.firstRunStep > 1 },
      { id: 'persona', title: 'Choose Persona', description: 'Select your default AI persona', isComplete: _settings.firstRunStep > 2 },
      { id: 'docs', title: 'Documentation', description: 'Set up project documentation', isComplete: _settings.firstRunStep > 3 },
      { id: 'finish', title: 'Get Started', description: 'Start using SpaceCode', isComplete: _settings.firstRunStep > 4 }
    ],
    isComplete: _settings.hasCompletedFirstRun
  };
}
