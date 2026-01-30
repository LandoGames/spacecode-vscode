/**
 * Base interfaces for AI providers
 */

export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  provider?: 'claude' | 'gpt';
  timestamp?: number;
  tokens?: {
    input: number;
    output: number;
  };
  cost?: number;
}

export interface AIResponse {
  content: string;
  provider: 'claude' | 'gpt';
  model: string;
  tokens: {
    input: number;
    output: number;
  };
  cost: number;
  latencyMs: number;
}

export interface AIProviderConfig {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AIProvider {
  readonly name: 'claude' | 'gpt';
  readonly isConfigured: boolean;

  configure(config: AIProviderConfig): void | Promise<void>;

  sendMessage(
    messages: AIMessage[],
    systemPrompt?: string
  ): Promise<AIResponse>;

  streamMessage(
    messages: AIMessage[],
    systemPrompt: string | undefined,
    onChunk: (chunk: string) => void
  ): Promise<AIResponse>;

  estimateCost(inputTokens: number, outputTokens: number): number;
}

// Pricing per 1M tokens (as of early 2025)
export const PRICING = {
  claude: {
    'claude-opus-4-20250514': { input: 15.0, output: 75.0 },
    'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
    'claude-3-5-haiku-20241022': { input: 0.80, output: 4.0 },
  },
  gpt: {
    'gpt-4o': { input: 2.50, output: 10.0 },
    'gpt-4-turbo': { input: 10.0, output: 30.0 },
    'gpt-4': { input: 30.0, output: 60.0 },
    'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
    'o1-preview': { input: 15.0, output: 60.0 },
    'o1-mini': { input: 3.0, output: 12.0 },
  }
} as const;

type ClaudeModels = keyof typeof PRICING.claude;
type GPTModels = keyof typeof PRICING.gpt;

export function calculateCost(
  provider: 'claude' | 'gpt',
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  let pricing: { input: number; output: number } | undefined;

  if (provider === 'claude') {
    pricing = PRICING.claude[model as ClaudeModels];
  } else {
    pricing = PRICING.gpt[model as GPTModels];
  }

  if (!pricing) {
    return 0;
  }

  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;

  return inputCost + outputCost;
}
