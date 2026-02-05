/**
 * SettingsFile — Unified Settings Manager for SpaceCode
 *
 * Stores all user preferences in a single JSON file at:
 *   .spacecode/settings.json (in workspace root)
 *
 * This replaces scattered localStorage/globalState usage with a
 * single, visible, editable file that users can inspect and backup.
 *
 * ─── STORED SETTINGS ───
 *
 *   - toolbar: model, chatMode, reasoning, consultant, gptConsultEnabled, interventionLevel
 *   - chat: currentProvider, sessions metadata
 *   - ui: lastTab, dashboard subtab, split positions
 *   - coordinator: connection settings
 *   - sounds: enabled, volume, per-event toggles
 *
 * ─── USAGE ───
 *
 *   const svc = SettingsFileService.getInstance();
 *   await svc.initialize(context);
 *
 *   // Read
 *   const model = svc.get('toolbar.model');
 *
 *   // Write (auto-saves)
 *   await svc.set('toolbar.model', { provider: 'claude', model: 'claude-sonnet-4' });
 *
 *   // Get file path
 *   const filePath = svc.getFilePath();  // e.g. /Users/.../project/.spacecode/settings.json
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
  getDefaultClaudeModel,
  getDefaultConsultantModel,
  buildModelLabels,
  buildConsultantLabels,
  CLAUDE_MODELS,
  GPT_MODELS,
  CONSULTANT_MODELS,
  PRICING_DEFAULTS,
} from '../config/models';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface ToolbarSettings {
  chatMode: string;
  model: { provider: string; model: string };
  reasoning: string;
  consultant: string;
  gptConsultEnabled: boolean;
  interventionLevel: string;
}

export interface ChatSettings {
  currentProvider: string;
}

export interface UISettings {
  lastTab: string;
  dashboardSubtab: string;
  rightPanelMode: string;
}

export interface SpaceCodeSettings {
  version: number;
  toolbar: ToolbarSettings;
  chat: ChatSettings;
  ui: UISettings;
  [key: string]: any;  // Allow arbitrary keys for future expansion
}

// Build defaults from centralized config
const defaultModel = getDefaultClaudeModel();
const defaultConsultant = getDefaultConsultantModel();

const DEFAULT_SETTINGS: SpaceCodeSettings = {
  version: 1,
  toolbar: {
    chatMode: 'chat',
    model: { provider: defaultModel.provider, model: defaultModel.id },
    reasoning: 'medium',
    consultant: defaultConsultant.id,
    gptConsultEnabled: false,
    interventionLevel: 'balanced',
  },
  chat: {
    currentProvider: 'claude',
  },
  ui: {
    lastTab: 'chat',
    dashboardSubtab: 'docs',
    rightPanelMode: 'flow',
  },
};

// ──────────────────────────────────────────────
// Service
// ──────────────────────────────────────────────

export class SettingsFileService {
  private static instance: SettingsFileService;

  private workspaceRoot: string = '';
  private filePath: string = '';
  private settings: SpaceCodeSettings = { ...DEFAULT_SETTINGS };
  private saveDebounceTimer: NodeJS.Timeout | null = null;

  private constructor() {}

  static getInstance(): SettingsFileService {
    if (!SettingsFileService.instance) {
      SettingsFileService.instance = new SettingsFileService();
    }
    return SettingsFileService.instance;
  }

  /**
   * Initialize the service. Call once from extension activation.
   */
  async initialize(context: vscode.ExtensionContext): Promise<void> {
    // Get workspace root
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
      this.workspaceRoot = folders[0].uri.fsPath;
    } else {
      // Fallback to home directory if no workspace
      this.workspaceRoot = process.env.HOME || process.env.USERPROFILE || '';
    }

    this.filePath = path.join(this.workspaceRoot, '.spacecode', 'settings.json');

    // Ensure .spacecode directory exists
    const dirPath = path.dirname(this.filePath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    // Load existing settings or create default
    await this.load();
  }

  /**
   * Get the full path to the settings file.
   */
  getFilePath(): string {
    return this.filePath;
  }

  /**
   * Get the relative path (for display).
   */
  getRelativePath(): string {
    return '.spacecode/settings.json';
  }

  /**
   * Load settings from file.
   */
  private async load(): Promise<void> {
    try {
      if (fs.existsSync(this.filePath)) {
        const content = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(content);
        // Merge with defaults to ensure all fields exist
        this.settings = this.mergeDeep(DEFAULT_SETTINGS, parsed);
      } else {
        // Create file with defaults
        this.settings = { ...DEFAULT_SETTINGS };
        await this.save();
      }
    } catch (err) {
      console.error('[SettingsFile] Error loading settings:', err);
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }

  /**
   * Save settings to file.
   */
  private async save(): Promise<void> {
    try {
      const content = JSON.stringify(this.settings, null, 2);
      fs.writeFileSync(this.filePath, content, 'utf-8');
    } catch (err) {
      console.error('[SettingsFile] Error saving settings:', err);
    }
  }

  /**
   * Debounced save - coalesces rapid updates.
   */
  private debouncedSave(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }
    this.saveDebounceTimer = setTimeout(() => {
      this.save();
      this.saveDebounceTimer = null;
    }, 500);
  }

  /**
   * Get a value using dot notation path.
   * Example: get('toolbar.model')
   */
  get<T = any>(keyPath: string): T | undefined {
    const keys = keyPath.split('.');
    let value: any = this.settings;
    for (const key of keys) {
      if (value === undefined || value === null) return undefined;
      value = value[key];
    }
    return value as T;
  }

  /**
   * Set a value using dot notation path.
   * Example: set('toolbar.model', { provider: 'claude', model: 'claude-sonnet-4' })
   */
  async set(keyPath: string, value: any): Promise<void> {
    const keys = keyPath.split('.');
    let obj: any = this.settings;
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (obj[key] === undefined) {
        obj[key] = {};
      }
      obj = obj[key];
    }
    obj[keys[keys.length - 1]] = value;
    this.debouncedSave();
  }

  /**
   * Get all settings.
   */
  getAll(): SpaceCodeSettings {
    return { ...this.settings };
  }

  /**
   * Update multiple settings at once.
   */
  async update(patch: Partial<SpaceCodeSettings>): Promise<void> {
    this.settings = this.mergeDeep(this.settings, patch);
    this.debouncedSave();
  }

  /**
   * Get toolbar settings specifically (for webview restore).
   * Includes model labels and pricing so frontend doesn't need to hardcode them.
   */
  getToolbarSettings(): ToolbarSettings & {
    modelLabels: Record<string, string>;
    consultantLabels: Record<string, string>;
    claudeModels: string[];
    gptModels: string[];
    consultantModels: string[];
    pricing: Record<string, { input: number; output: number }>;
  } {
    return {
      ...this.settings.toolbar,
      modelLabels: buildModelLabels(),
      consultantLabels: buildConsultantLabels(),
      claudeModels: CLAUDE_MODELS.map(m => m.id),
      gptModels: GPT_MODELS.map(m => m.id),
      consultantModels: CONSULTANT_MODELS.map(m => m.id),
      pricing: PRICING_DEFAULTS,
    };
  }

  /**
   * Update toolbar settings.
   */
  async setToolbarSettings(toolbar: Partial<ToolbarSettings>): Promise<void> {
    this.settings.toolbar = { ...this.settings.toolbar, ...toolbar };
    this.debouncedSave();
  }

  /**
   * Open the settings file in the editor.
   */
  async openInEditor(): Promise<void> {
    if (this.filePath && fs.existsSync(this.filePath)) {
      const doc = await vscode.workspace.openTextDocument(this.filePath);
      await vscode.window.showTextDocument(doc);
    }
  }

  /**
   * Deep merge utility.
   */
  private mergeDeep(target: any, source: any): any {
    const output = { ...target };
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this.mergeDeep(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    return output;
  }

  private isObject(item: any): boolean {
    return (item && typeof item === 'object' && !Array.isArray(item));
  }
}
