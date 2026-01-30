/**
 * Claude API Provider
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  AIProvider,
  AIProviderConfig,
  AIMessage,
  AIResponse,
  calculateCost
} from './base';

export class ClaudeProvider implements AIProvider {
  readonly name = 'claude' as const;
  private client: Anthropic | null = null;
  private model: string = 'claude-sonnet-4-20250514';
  private maxTokens: number = 4096;

  get isConfigured(): boolean {
    return this.client !== null;
  }

  configure(config: AIProviderConfig): void {
    if (!config.apiKey) {
      throw new Error('Claude API key is required');
    }

    this.client = new Anthropic({
      apiKey: config.apiKey,
    });

    this.model = config.model || 'claude-sonnet-4-20250514';
    this.maxTokens = config.maxTokens || 4096;
  }

  async sendMessage(
    messages: AIMessage[],
    systemPrompt?: string
  ): Promise<AIResponse> {
    if (!this.client) {
      throw new Error('Claude provider not configured. Please set your API key.');
    }

    const startTime = Date.now();

    // Convert messages to Anthropic format
    const anthropicMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    // Build system prompt from system messages + provided systemPrompt
    const systemMessages = messages
      .filter(m => m.role === 'system')
      .map(m => m.content);

    const fullSystemPrompt = [
      ...(systemPrompt ? [systemPrompt] : []),
      ...systemMessages,
    ].join('\n\n');

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: fullSystemPrompt || undefined,
      messages: anthropicMessages,
    });

    const latencyMs = Date.now() - startTime;

    const content = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as { type: 'text'; text: string }).text)
      .join('');

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const cost = calculateCost('claude', this.model, inputTokens, outputTokens);

    return {
      content,
      provider: 'claude',
      model: this.model,
      tokens: {
        input: inputTokens,
        output: outputTokens,
      },
      cost,
      latencyMs,
    };
  }

  async streamMessage(
    messages: AIMessage[],
    systemPrompt?: string,
    onChunk: (chunk: string) => void = () => {}
  ): Promise<AIResponse> {
    if (!this.client) {
      throw new Error('Claude provider not configured. Please set your API key.');
    }

    const startTime = Date.now();

    const anthropicMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    const systemMessages = messages
      .filter(m => m.role === 'system')
      .map(m => m.content);

    const fullSystemPrompt = [
      ...(systemPrompt ? [systemPrompt] : []),
      ...systemMessages,
    ].join('\n\n');

    let fullContent = '';
    let inputTokens = 0;
    let outputTokens = 0;

    const stream = await this.client.messages.stream({
      model: this.model,
      max_tokens: this.maxTokens,
      system: fullSystemPrompt || undefined,
      messages: anthropicMessages,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        const delta = event.delta as { type: string; text?: string };
        if (delta.type === 'text_delta' && delta.text) {
          fullContent += delta.text;
          onChunk(delta.text);
        }
      } else if (event.type === 'message_delta') {
        const usage = (event as { usage?: { output_tokens: number } }).usage;
        if (usage) {
          outputTokens = usage.output_tokens;
        }
      } else if (event.type === 'message_start') {
        const message = (event as { message?: { usage?: { input_tokens: number } } }).message;
        if (message?.usage) {
          inputTokens = message.usage.input_tokens;
        }
      }
    }

    const latencyMs = Date.now() - startTime;
    const cost = calculateCost('claude', this.model, inputTokens, outputTokens);

    return {
      content: fullContent,
      provider: 'claude',
      model: this.model,
      tokens: {
        input: inputTokens,
        output: outputTokens,
      },
      cost,
      latencyMs,
    };
  }

  estimateCost(inputTokens: number, outputTokens: number): number {
    return calculateCost('claude', this.model, inputTokens, outputTokens);
  }
}
