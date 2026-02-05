/**
 * Centralized Model Configuration
 *
 * SINGLE SOURCE OF TRUTH for all available models in SpaceCode.
 *
 * Model IDs verified from official documentation:
 * - Claude: https://platform.claude.com/docs/en/about-claude/models/overview
 * - OpenAI: https://platform.openai.com/docs/models
 *
 * Each model includes:
 * - Specialization tags for auto-selection
 * - Best-for use cases (chat, agent, skill, review, 2nd-opinion)
 * - Tier classification (premium, standard, fast, economy)
 *
 * DO NOT define models anywhere else in the codebase.
 */

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

export type ModelTier = 'premium' | 'standard' | 'fast' | 'economy';
export type ModelUseCase = 'chat' | 'agent' | 'skill' | 'review' | '2nd-opinion' | 'long-task';
export type ModelSpecialization = 'coding' | 'reasoning' | 'agents' | 'fast' | 'long-context' | 'general';

export interface ModelDefinition {
  id: string;                        // API model ID
  provider: 'claude' | 'gpt';
  label: string;                     // Display name
  shortLabel: string;                // Compact UI name
  description: string;               // What this model does
  specializations: ModelSpecialization[];  // Capability tags
  bestFor: ModelUseCase[];           // Recommended use cases
  tier: ModelTier;
  isDefault?: boolean;               // Default for this provider
  pricing?: { input: number; output: number };  // $ per 1M tokens (optional - only include verified prices)
  docsUrl: string;                   // Link to official documentation
  contextWindow: number;             // Max input tokens
  maxOutput: number;                 // Max output tokens
}

// Documentation links for model verification
export const MODEL_DOCS = {
  claude: 'https://platform.claude.com/docs/en/about-claude/models/overview',
  openai: 'https://platform.openai.com/docs/models',
};

// ═══════════════════════════════════════════════════════════════════════
// CLAUDE MODELS — 4.5 Series (verified 2026-02)
// ═══════════════════════════════════════════════════════════════════════

export const CLAUDE_MODELS: ModelDefinition[] = [
  {
    id: 'claude-opus-4-5',
    provider: 'claude',
    label: 'Claude Opus 4.5',
    shortLabel: 'Opus 4.5',
    description: 'Premium model combining maximum intelligence with practical performance. Best for complex reasoning and high-stakes tasks.',
    specializations: ['reasoning', 'coding', 'agents', 'general'],
    bestFor: ['chat', 'agent', 'review'],
    tier: 'premium',
    isDefault: true,
    pricing: { input: 5, output: 25 },
    docsUrl: 'https://platform.claude.com/docs/en/about-claude/models/overview',
    contextWindow: 200000,
    maxOutput: 64000,
  },
  {
    id: 'claude-sonnet-4-5',
    provider: 'claude',
    label: 'Claude Sonnet 4.5',
    shortLabel: 'Sonnet 4.5',
    description: 'Smart model for complex agents and coding. Fast with excellent performance on technical tasks.',
    specializations: ['coding', 'agents', 'fast'],
    bestFor: ['agent', 'skill', 'chat'],
    tier: 'standard',
    pricing: { input: 3, output: 15 },
    docsUrl: 'https://platform.claude.com/docs/en/about-claude/models/overview',
    contextWindow: 200000,
    maxOutput: 64000,
  },
  {
    id: 'claude-haiku-4-5',
    provider: 'claude',
    label: 'Claude Haiku 4.5',
    shortLabel: 'Haiku 4.5',
    description: 'Fastest model with near-frontier intelligence. Ideal for quick responses and high-volume tasks.',
    specializations: ['fast', 'general'],
    bestFor: ['2nd-opinion', 'skill'],
    tier: 'fast',
    pricing: { input: 1, output: 5 },
    docsUrl: 'https://platform.claude.com/docs/en/about-claude/models/overview',
    contextWindow: 200000,
    maxOutput: 64000,
  },
];

// ═══════════════════════════════════════════════════════════════════════
// GPT MODELS — Real OpenAI API Models
// https://platform.openai.com/docs/models
// ═══════════════════════════════════════════════════════════════════════

// Guardrails: keep GPT list pinned to the agreed 5 models.
// Update intentionally after verifying at:
// https://platform.openai.com/docs/models
const EXPECTED_GPT_MODEL_COUNT = 5;
const ALLOWED_GPT_MODEL_IDS = new Set([
  'gpt-5.2',
  'gpt-5.2-pro',
  'gpt-5.2-codex',
  'gpt-5-mini',
  'gpt-5-codex-mini',
]);

export const GPT_MODELS: ModelDefinition[] = [
  {
    id: 'gpt-5.2',
    provider: 'gpt',
    label: 'GPT-5.2',
    shortLabel: '5.2',
    description: 'Best model for complex reasoning, code-heavy tasks, and agentic workflows.',
    specializations: ['coding', 'reasoning', 'agents'],
    bestFor: ['chat', 'agent', 'review'],
    tier: 'premium',
    isDefault: true,
    pricing: { input: 1.75, output: 14 },
    docsUrl: 'https://platform.openai.com/docs/models/gpt-5.2',
    contextWindow: 400000,
    maxOutput: 128000,
  },
  {
    id: 'gpt-5.2-pro',
    provider: 'gpt',
    label: 'GPT-5.2 Pro',
    shortLabel: '5.2-pro',
    description: 'Higher compute variant for the toughest problems; slower but more precise.',
    specializations: ['reasoning', 'coding'],
    bestFor: ['review', 'long-task', 'agent'],
    tier: 'premium',
    pricing: { input: 21, output: 168 },
    docsUrl: 'https://platform.openai.com/docs/models/gpt-5.2-pro',
    contextWindow: 400000,
    maxOutput: 128000,
  },
  {
    id: 'gpt-5.2-codex',
    provider: 'gpt',
    label: 'GPT-5.2 Codex',
    shortLabel: '5.2-codex',
    description: 'Coding-optimized variant for interactive development tasks.',
    specializations: ['coding', 'agents'],
    bestFor: ['chat', 'agent', 'review'],
    tier: 'standard',
    pricing: { input: 1.75, output: 14 },
    docsUrl: 'https://platform.openai.com/docs/models/gpt-5.2',
    contextWindow: 400000,
    maxOutput: 128000,
  },
  {
    id: 'gpt-5-mini',
    provider: 'gpt',
    label: 'GPT-5 Mini',
    shortLabel: '5-mini',
    description: 'Cost-optimized reasoning and chat; balances speed and capability.',
    specializations: ['fast', 'general'],
    bestFor: ['skill', '2nd-opinion'],
    tier: 'economy',
    pricing: { input: 0.25, output: 2 },
    docsUrl: 'https://platform.openai.com/docs/models',
    contextWindow: 128000,
    maxOutput: 16384,
  },
  {
    id: 'gpt-5-codex-mini',
    provider: 'gpt',
    label: 'GPT-5 Codex Mini',
    shortLabel: '5-codex-mini',
    description: 'Cost-effective Codex model optimized for coding workflows in the CLI and IDE.',
    specializations: ['coding', 'fast'],
    bestFor: ['agent', 'skill', 'review'],
    tier: 'economy',
    pricing: { input: 0.05, output: 0.4 },
    docsUrl: 'https://developers.openai.com/codex/changelog',
    contextWindow: 128000,
    maxOutput: 8192,
  },
];

// Enforce guardrails at module load so accidental edits fail fast.
if (GPT_MODELS.length !== EXPECTED_GPT_MODEL_COUNT) {
  throw new Error(
    `[models] GPT_MODELS must have exactly ${EXPECTED_GPT_MODEL_COUNT} entries. ` +
    `Update intentionally after checking https://platform.openai.com/docs/models`
  );
}
for (const model of GPT_MODELS) {
  if (!ALLOWED_GPT_MODEL_IDS.has(model.id)) {
    throw new Error(
      `[models] Disallowed GPT model detected: ${model.id}. ` +
      `Use the agreed 5-model list from https://platform.openai.com/docs/models`
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
// COMBINED & HELPERS
// ═══════════════════════════════════════════════════════════════════════

export const ALL_MODELS = [...CLAUDE_MODELS, ...GPT_MODELS];

export function getModelById(id: string): ModelDefinition | undefined {
  return ALL_MODELS.find(m => m.id === id);
}

export function getModelLabel(id: string): string {
  return getModelById(id)?.label || id;
}

export function getDefaultClaudeModel(): ModelDefinition {
  return CLAUDE_MODELS.find(m => m.isDefault) || CLAUDE_MODELS[0];
}

export function getDefaultGptModel(): ModelDefinition {
  return GPT_MODELS.find(m => m.isDefault) || GPT_MODELS[0];
}

/**
 * Get the best model for a specific use case.
 */
export function getModelForUseCase(
  useCase: ModelUseCase,
  provider?: 'claude' | 'gpt'
): ModelDefinition {
  const models = provider
    ? ALL_MODELS.filter(m => m.provider === provider)
    : ALL_MODELS;

  // Find model where this is the primary use case (first in bestFor)
  const primary = models.find(m => m.bestFor[0] === useCase);
  if (primary) return primary;

  // Find model that supports this use case
  const supported = models.find(m => m.bestFor.includes(useCase));
  if (supported) return supported;

  // Fallback to default
  return provider === 'gpt' ? getDefaultGptModel() : getDefaultClaudeModel();
}

/**
 * Get models filtered by specialization.
 */
export function getModelsBySpecialization(
  spec: ModelSpecialization,
  provider?: 'claude' | 'gpt'
): ModelDefinition[] {
  return ALL_MODELS.filter(m =>
    m.specializations.includes(spec) &&
    (!provider || m.provider === provider)
  );
}

/**
 * Get the fastest model for a provider (for 2nd opinion, quick tasks).
 */
export function getFastestModel(provider?: 'claude' | 'gpt'): ModelDefinition {
  const models = provider
    ? ALL_MODELS.filter(m => m.provider === provider)
    : ALL_MODELS;

  return models.find(m => m.tier === 'economy') ||
         models.find(m => m.tier === 'fast') ||
         models[0];
}

/**
 * Build a label lookup object for frontend use.
 */
export function buildModelLabels(): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const model of ALL_MODELS) {
    labels[model.id] = model.label;
  }
  return labels;
}

/**
 * Build full model info for frontend (includes descriptions, tiers, etc.)
 */
export function buildModelInfo(): Record<string, Omit<ModelDefinition, 'id'>> {
  const info: Record<string, Omit<ModelDefinition, 'id'>> = {};
  for (const model of ALL_MODELS) {
    const { id, ...rest } = model;
    info[id] = rest;
  }
  return info;
}

// ═══════════════════════════════════════════════════════════════════════
// LEGACY EXPORTS (for backward compatibility)
// ═══════════════════════════════════════════════════════════════════════

export interface ConsultantModel {
  id: string;
  label: string;
  isDefault?: boolean;
}

// 2nd opinion uses the fastest/cheapest GPT model
export const CONSULTANT_MODELS: ConsultantModel[] = [
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini', isDefault: true },
];

export function getDefaultConsultantModel(): ConsultantModel {
  return CONSULTANT_MODELS[0];
}

export function buildConsultantLabels(): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const model of CONSULTANT_MODELS) {
    labels[model.id] = model.label;
  }
  return labels;
}

// Pricing lookup (legacy - now embedded in ModelDefinition)
export interface PricingEntry {
  input: number;
  output: number;
}

// Only include models with verified pricing
export const PRICING_DEFAULTS: Record<string, PricingEntry> = Object.fromEntries(
  ALL_MODELS.filter(m => m.pricing).map(m => [m.id, m.pricing!])
);
