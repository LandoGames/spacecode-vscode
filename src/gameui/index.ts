/**
 * Game UI Pipeline Module
 *
 * Orchestrates Unity UI component generation via Coplay MCP.
 * Placeholder-first workflow: colored boxes → verified layout → art swap.
 */

export {
  ComponentCategory,
  ComponentStatus,
  PipelinePhase,
  GameUIComponent,
  GameUITheme,
  ThemeVariable,
  GameUIPipelineState,
  GameUIPipelineConfig,
  PipelineError,
  DEFAULT_PIPELINE_CONFIG,
  DEFAULT_THEME,
  PLACEHOLDER_COLORS,
  PIPELINE_PHASES,
  PHASE_CATEGORIES,
  PRIMITIVE_COMPONENTS,
  SYSTEM_COMPONENTS,
  HUD_COMPONENTS,
  MENU_COMPONENTS,
  PANEL_COMPONENTS,
  DIALOG_MAP_COMPONENTS,
  getAllCatalogComponents,
} from './GameUITypes';

export {
  GameUIPipeline,
  getGameUIPipeline,
  initGameUIPipeline,
} from './GameUIPipeline';
export type { PipelineEvent, PipelineEventType } from './GameUIPipeline';
