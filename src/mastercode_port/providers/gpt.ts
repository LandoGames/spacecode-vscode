/**
 * OpenAI GPT Provider
 */

import OpenAI from 'openai';
import {
  AIProvider,
  AIProviderConfig,
  AIMessage,
  AIResponse,
  calculateCost
} from './base';

export class GPTProvider implements AIProvider {
  readonly name = 'gpt' as const;
  private client: OpenAI | null = null;
  private model: string = 'gpt-4o';
  private maxTokens: number = 4096;
  private temperature: number = 0.7;

  get isConfigured(): boolean {
    return this.client !== null;
  }

  configure(config: AIProviderConfig): void {
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    this.client = new OpenAI({
      apiKey: config.apiKey,
    });

    this.model = config.model || 'gpt-4o';
    this.maxTokens = config.maxTokens || 4096;
    this.temperature = config.temperature ?? 0.7;
  }

  async sendMessage(
    messages: AIMessage[],
    systemPrompt?: string
  ): Promise<AIResponse> {
    if (!this.client) {
      throw new Error('GPT provider not configured. Please set your API key.');
    }

    const startTime = Date.now();

    // Convert messages to OpenAI format
    const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    // Add system prompt first if provided
    if (systemPrompt) {
      openaiMessages.push({
        role: 'system',
        content: systemPrompt,
      });
    }

    // Add all messages
    for (const msg of messages) {
      openaiMessages.push({
        role: msg.role,
        content: msg.content,
      } as OpenAI.Chat.ChatCompletionMessageParam);
    }

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      messages: openaiMessages,
    });

    const latencyMs = Date.now() - startTime;

    const content = response.choices[0]?.message?.content || '';
    const inputTokens = response.usage?.prompt_tokens || 0;
    const outputTokens = response.usage?.completion_tokens || 0;
    const cost = calculateCost('gpt', this.model, inputTokens, outputTokens);

    return {
      content,
      provider: 'gpt',
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
      throw new Error('GPT provider not configured. Please set your API key.');
    }

    const startTime = Date.now();

    const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    if (systemPrompt) {
      openaiMessages.push({
        role: 'system',
        content: systemPrompt,
      });
    }

    for (const msg of messages) {
      openaiMessages.push({
        role: msg.role,
        content: msg.content,
      } as OpenAI.Chat.ChatCompletionMessageParam);
    }

    let fullContent = '';

    const stream = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      messages: openaiMessages,
      stream: true,
      stream_options: { include_usage: true },
    });

    let inputTokens = 0;
    let outputTokens = 0;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        fullContent += delta;
        onChunk(delta);
      }

      // Capture usage from the final chunk
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens;
        outputTokens = chunk.usage.completion_tokens;
      }
    }

    const latencyMs = Date.now() - startTime;
    const cost = calculateCost('gpt', this.model, inputTokens, outputTokens);

    return {
      content: fullContent,
      provider: 'gpt',
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
    return calculateCost('gpt', this.model, inputTokens, outputTokens);
  }
}
