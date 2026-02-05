// @ts-nocheck

/**
 * Game UI Pipeline Engine
 *
 * Orchestrates Unity UI component generation via Coplay MCP.
 * Follows placeholder-first workflow: colored boxes → verified layout → art swap.
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import {
  GameUIComponent,
  GameUITheme,
  GameUIPipelineState,
  GameUIPipelineConfig,
  PipelinePhase,
  PipelineError,
  ComponentCategory,
  ComponentStatus,
  DEFAULT_PIPELINE_CONFIG,
  DEFAULT_THEME,
  PLACEHOLDER_COLORS,
  PIPELINE_PHASES,
  PHASE_CATEGORIES,
  getAllCatalogComponents,
} from './GameUITypes';

/** Pipeline event types */
export type PipelineEventType =
  | 'started'
  | 'phase-start'
  | 'phase-complete'
  | 'component-start'
  | 'component-complete'
  | 'component-error'
  | 'complete'
  | 'error'
  | 'stopped';

export interface PipelineEvent {
  type: PipelineEventType;
  phase?: PipelinePhase;
  componentId?: string;
  message?: string;
  timestamp: number;
}

/**
 * GameUIPipeline — Orchestrates UI component generation
 */
export class GameUIPipeline extends EventEmitter {
  private _config: GameUIPipelineConfig;
  private _state: GameUIPipelineState;
  private _coplayClient: any;
  private _running = false;
  private _aborted = false;

  constructor(config: Partial<GameUIPipelineConfig> = {}) {
    super();
    this._config = { ...DEFAULT_PIPELINE_CONFIG, ...config };
    this._state = {
      phase: 'theme',
      components: getAllCatalogComponents(),
      activeThemeId: DEFAULT_THEME.id,
      themes: [DEFAULT_THEME],
      generatedCount: 0,
      totalCount: getAllCatalogComponents().length,
      isRunning: false,
      errors: [],
    };
  }

  /** Get current pipeline state */
  getState(): GameUIPipelineState {
    return { ...this._state };
  }

  /** Get pipeline config */
  getConfig(): GameUIPipelineConfig {
    return { ...this._config };
  }

  /** Update config */
  updateConfig(config: Partial<GameUIPipelineConfig>): void {
    this._config = { ...this._config, ...config };
  }

  /** Set Coplay MCP client reference */
  setCoplayClient(client: any): void {
    this._coplayClient = client;
  }

  /** Get components by category */
  getComponentsByCategory(category: ComponentCategory): GameUIComponent[] {
    return this._state.components.filter(c => c.category === category);
  }

  /** Get components by status */
  getComponentsByStatus(status: ComponentStatus): GameUIComponent[] {
    return this._state.components.filter(c => c.status === status);
  }

  /** Get component by ID */
  getComponent(id: string): GameUIComponent | undefined {
    return this._state.components.find(c => c.id === id);
  }

  /** Update component status */
  updateComponentStatus(id: string, status: ComponentStatus, extra?: Partial<GameUIComponent>): void {
    const comp = this._state.components.find(c => c.id === id);
    if (comp) {
      comp.status = status;
      comp.updatedAt = Date.now();
      if (extra) Object.assign(comp, extra);
      if (status === 'placeholder' || status === 'complete') {
        this._state.generatedCount++;
      }
    }
  }

  /** Get theme by ID */
  getTheme(id: string): GameUITheme | undefined {
    return this._state.themes.find(t => t.id === id);
  }

  /** Add or update theme */
  setTheme(theme: GameUITheme): void {
    const idx = this._state.themes.findIndex(t => t.id === theme.id);
    if (idx >= 0) {
      this._state.themes[idx] = theme;
    } else {
      this._state.themes.push(theme);
    }
  }

  /** Set active theme */
  setActiveTheme(themeId: string): void {
    this._state.themes.forEach(t => { t.isActive = t.id === themeId; });
    this._state.activeThemeId = themeId;
  }

  /**
   * Generate a single component as placeholder via Coplay MCP
   */
  async generatePlaceholder(componentId: string): Promise<boolean> {
    const comp = this.getComponent(componentId);
    if (!comp) return false;

    const color = comp.placeholderColor || PLACEHOLDER_COLORS[comp.category] || '#64748B';
    const label = `${comp.id}: ${comp.name}`;

    this._emitEvent('component-start', comp.id);

    try {
      if (!this._coplayClient) {
        throw new Error('Coplay MCP client not connected');
      }

      // Create a Panel Settings Asset if needed (UI Toolkit requires this)
      // The actual MCP calls depend on the Coplay MCP server's available tools

      // Step 1: Create parent GameObject for this component
      const parentPath = this._getComponentScenePath(comp);
      await this._coplayClient.callTool('create_game_object', {
        name: comp.id,
        parent: parentPath,
      });

      // Step 2: Add UI Document component (UI Toolkit)
      // For placeholders, we create a simple colored box with label text

      // Step 3: Create the UXML document
      const uxmlContent = this._generatePlaceholderUXML(comp, color, label);
      const uxmlPath = path.join(this._config.uiBasePath, 'Documents', `${comp.id}.uxml`);

      // Write the UXML file via Coplay MCP or direct file write
      await this._writeAsset(uxmlPath, uxmlContent);

      this.updateComponentStatus(componentId, 'placeholder', { prefabPath: uxmlPath });
      this._emitEvent('component-complete', comp.id);
      return true;
    } catch (err: any) {
      const error: PipelineError = {
        componentId,
        phase: this._state.phase,
        message: err?.message || 'Failed to generate placeholder',
        timestamp: Date.now(),
      };
      this._state.errors.push(error);
      this.updateComponentStatus(componentId, 'planned', { lastError: error.message });
      this._emitEvent('component-error', comp.id, error.message);
      return false;
    }
  }

  /**
   * Generate USS theme file
   */
  async generateThemeUSS(themeId?: string): Promise<string> {
    const theme = this.getTheme(themeId || this._state.activeThemeId);
    if (!theme) throw new Error('Theme not found');

    let uss = `/* Generated by SpaceCode Game UI Pipeline */\n`;
    uss += `/* Theme: ${theme.name} */\n\n`;
    uss += `:root {\n`;

    for (const v of theme.variables) {
      uss += `  ${v.name}: ${v.value};\n`;
    }

    uss += `}\n`;

    const ussPath = path.join(this._config.themeBasePath, `${theme.id}.uss`);
    theme.ussPath = ussPath;

    // Write the USS file
    await this._writeAsset(ussPath, uss);
    return uss;
  }

  /**
   * Run pipeline for a specific phase
   */
  async runPhase(phase: PipelinePhase): Promise<{ success: number; failed: number }> {
    this._state.phase = phase;
    this._state.isRunning = true;
    this._aborted = false;
    let success = 0;
    let failed = 0;

    this._emitEvent('phase-start', undefined, phase);

    if (phase === 'theme') {
      try {
        await this.generateThemeUSS();
        success = 1;
      } catch {
        failed = 1;
      }
    } else if (phase === 'art-replacement') {
      // Art replacement is manual — just mark as ready
      this._emitEvent('phase-complete', undefined, phase);
      this._state.isRunning = false;
      return { success: 0, failed: 0 };
    } else {
      const categories = PHASE_CATEGORIES[phase] || [];
      const components = this._state.components.filter(c =>
        categories.includes(c.category) && c.status === 'planned'
      );

      for (const comp of components) {
        if (this._aborted) break;

        this._state.currentOperation = `Generating ${comp.id}: ${comp.name}`;
        const ok = await this.generatePlaceholder(comp.id);
        if (ok) success++;
        else failed++;
      }
    }

    this._state.isRunning = false;
    this._state.currentOperation = undefined;
    this._emitEvent('phase-complete', undefined, phase);

    return { success, failed };
  }

  /**
   * Run full pipeline (all phases)
   */
  async runAll(): Promise<void> {
    this._running = true;
    this._aborted = false;
    this._emitEvent('started');

    for (const phase of PIPELINE_PHASES) {
      if (this._aborted) break;
      await this.runPhase(phase);
    }

    this._running = false;
    this._emitEvent(this._aborted ? 'stopped' : 'complete');
  }

  /** Stop the pipeline */
  stop(): void {
    this._aborted = true;
    this._state.isRunning = false;
  }

  /**
   * Save pipeline state to file
   */
  async saveState(workspaceDir: string): Promise<void> {
    const dir = path.join(workspaceDir, '.spacecode');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const filePath = path.join(dir, 'gameui-pipeline.json');
    const data = {
      version: 1,
      state: this._state,
      config: this._config,
      savedAt: Date.now(),
    };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }

  /**
   * Load pipeline state from file
   */
  async loadState(workspaceDir: string): Promise<boolean> {
    const filePath = path.join(workspaceDir, '.spacecode', 'gameui-pipeline.json');
    if (!fs.existsSync(filePath)) return false;

    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(raw);
      if (data.state) this._state = data.state;
      if (data.config) this._config = { ...this._config, ...data.config };
      return true;
    } catch {
      return false;
    }
  }

  /** Get pipeline summary stats */
  getSummary(): {
    total: number;
    planned: number;
    placeholder: number;
    verified: number;
    artGenerated: number;
    complete: number;
    errors: number;
    byCategory: Record<string, { total: number; done: number }>;
  } {
    const comps = this._state.components;
    const byCategory: Record<string, { total: number; done: number }> = {};

    for (const c of comps) {
      if (!byCategory[c.category]) byCategory[c.category] = { total: 0, done: 0 };
      byCategory[c.category].total++;
      if (c.status !== 'planned') byCategory[c.category].done++;
    }

    return {
      total: comps.length,
      planned: comps.filter(c => c.status === 'planned').length,
      placeholder: comps.filter(c => c.status === 'placeholder').length,
      verified: comps.filter(c => c.status === 'verified').length,
      artGenerated: comps.filter(c => c.status === 'art-generated').length,
      complete: comps.filter(c => c.status === 'complete').length,
      errors: this._state.errors.length,
      byCategory,
    };
  }

  // ─── Private ───────────────────────────────────────────

  private _getComponentScenePath(comp: GameUIComponent): string {
    const categoryMap: Record<string, string> = {
      primitive: 'Primitives',
      system: 'SystemScreens',
      menu: 'MainMenu',
      hud: 'HUD',
      inventory: 'Panels/Inventory',
      character: 'Panels/Character',
      social: 'Panels/Social',
      shop: 'Panels/Shop',
      dialog: 'Dialogs',
      map: 'Map',
    };
    return `Canvas/UI/${categoryMap[comp.category] || 'Other'}`;
  }

  private _generatePlaceholderUXML(comp: GameUIComponent, color: string, label: string): string {
    const w = comp.width || 200;
    const h = comp.height || 100;
    return `<ui:UXML xmlns:ui="UnityEngine.UIElements">
  <ui:VisualElement name="${comp.id}" style="
    width: ${w}px;
    height: ${h}px;
    background-color: ${color};
    border-radius: 4px;
    justify-content: center;
    align-items: center;
  ">
    <ui:Label text="${label}" style="
      color: white;
      font-size: 12px;
      -unity-text-align: middle-center;
    " />
  </ui:VisualElement>
</ui:UXML>`;
  }

  private async _writeAsset(assetPath: string, content: string): Promise<void> {
    if (this._coplayClient) {
      // Try writing via Coplay MCP execute_script
      try {
        const fullPath = path.join(this._config.unityProjectRoot, assetPath);
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(fullPath, content, 'utf8');
        return;
      } catch { /* fallthrough */ }
    }

    // Direct file write fallback
    if (this._config.unityProjectRoot) {
      const fullPath = path.join(this._config.unityProjectRoot, assetPath);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(fullPath, content, 'utf8');
    }
  }

  private _emitEvent(type: PipelineEventType, componentId?: string, phaseOrMsg?: string): void {
    const evt: PipelineEvent = {
      type,
      componentId,
      phase: PIPELINE_PHASES.includes(phaseOrMsg as PipelinePhase) ? phaseOrMsg as PipelinePhase : this._state.phase,
      message: !PIPELINE_PHASES.includes(phaseOrMsg as PipelinePhase) ? phaseOrMsg : undefined,
      timestamp: Date.now(),
    };
    this.emit(type, evt);
    this.emit('event', evt);
  }
}

/** Singleton */
let _pipeline: GameUIPipeline | null = null;

export function getGameUIPipeline(): GameUIPipeline {
  if (!_pipeline) {
    _pipeline = new GameUIPipeline();
  }
  return _pipeline;
}

export function initGameUIPipeline(config?: Partial<GameUIPipelineConfig>): GameUIPipeline {
  _pipeline = new GameUIPipeline(config);
  return _pipeline;
}
