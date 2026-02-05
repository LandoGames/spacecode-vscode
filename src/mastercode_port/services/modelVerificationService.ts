/**
 * Model Verification Service
 *
 * Verifies that configured models exist and are accessible via API.
 * - OpenAI: Uses GET /v1/models to list available models
 * - Claude: Uses minimal message request to verify model exists
 */

import * as vscode from 'vscode';
import { ALL_MODELS, ModelDefinition } from '../config/models';
import { AuthService } from './auth';

export interface ModelVerificationResult {
  modelId: string;
  provider: 'claude' | 'gpt';
  status: 'valid' | 'invalid' | 'error' | 'no-key';
  message: string;
  responseTime?: number;
}

export interface VerificationSummary {
  timestamp: number;
  results: ModelVerificationResult[];
  claudeModelsValid: number;
  claudeModelsTotal: number;
  gptModelsValid: number;
  gptModelsTotal: number;
}

export class ModelVerificationService {
  private static instance: ModelVerificationService;
  private context: vscode.ExtensionContext | null = null;
  private lastVerification: VerificationSummary | null = null;
  private authService: AuthService;

  private constructor() {
    this.authService = new AuthService();
  }

  static getInstance(): ModelVerificationService {
    if (!ModelVerificationService.instance) {
      ModelVerificationService.instance = new ModelVerificationService();
    }
    return ModelVerificationService.instance;
  }

  async initialize(context: vscode.ExtensionContext): Promise<void> {
    this.context = context;
    await this.authService.initialize(context);
    // Load cached verification results
    this.lastVerification = context.globalState.get<VerificationSummary>('spacecode.modelVerification') || null;
  }

  getLastVerification(): VerificationSummary | null {
    return this.lastVerification;
  }

  /**
   * Verify all configured models.
   */
  async verifyAllModels(
    claudeApiKey?: string,
    openaiApiKey?: string
  ): Promise<VerificationSummary> {
    const results: ModelVerificationResult[] = [];

    // Get API keys from AuthService (checks both config and secrets)
    if (!claudeApiKey || !openaiApiKey) {
      const keys = await this.authService.getApiKeys();
      if (!claudeApiKey) claudeApiKey = keys.claude;
      if (!openaiApiKey) openaiApiKey = keys.openai;
    }

    // Verify Claude models
    const claudeModels = ALL_MODELS.filter(m => m.provider === 'claude');
    for (const model of claudeModels) {
      const result = await this.verifyClaudeModel(model, claudeApiKey);
      results.push(result);
    }

    // Verify GPT models
    const gptModels = ALL_MODELS.filter(m => m.provider === 'gpt');
    const gptAvailableModels = openaiApiKey
      ? await this.fetchOpenAIModels(openaiApiKey)
      : null;

    for (const model of gptModels) {
      const result = this.verifyGptModel(model, openaiApiKey, gptAvailableModels);
      results.push(result);
    }

    // Build summary
    const summary: VerificationSummary = {
      timestamp: Date.now(),
      results,
      claudeModelsValid: results.filter(r => r.provider === 'claude' && r.status === 'valid').length,
      claudeModelsTotal: claudeModels.length,
      gptModelsValid: results.filter(r => r.provider === 'gpt' && r.status === 'valid').length,
      gptModelsTotal: gptModels.length,
    };

    // Cache results
    this.lastVerification = summary;
    if (this.context) {
      await this.context.globalState.update('spacecode.modelVerification', summary);
    }

    return summary;
  }

  /**
   * Verify a single Claude model by making a minimal API request.
   */
  private async verifyClaudeModel(
    model: ModelDefinition,
    apiKey?: string
  ): Promise<ModelVerificationResult> {
    if (!apiKey) {
      return {
        modelId: model.id,
        provider: 'claude',
        status: 'no-key',
        message: 'No Claude API key configured',
      };
    }

    const startTime = Date.now();

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: model.id,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      });

      const responseTime = Date.now() - startTime;

      if (response.ok) {
        return {
          modelId: model.id,
          provider: 'claude',
          status: 'valid',
          message: 'Model verified',
          responseTime,
        };
      }

      const error = await response.json().catch(() => ({}));

      if (response.status === 404 || (error.error?.type === 'invalid_request_error' && error.error?.message?.includes('model'))) {
        return {
          modelId: model.id,
          provider: 'claude',
          status: 'invalid',
          message: `Model not found: ${error.error?.message || 'Unknown error'}`,
          responseTime,
        };
      }

      // Other errors (rate limit, auth, etc.) - model likely exists
      if (response.status === 401) {
        return {
          modelId: model.id,
          provider: 'claude',
          status: 'error',
          message: 'Invalid API key',
          responseTime,
        };
      }

      return {
        modelId: model.id,
        provider: 'claude',
        status: 'valid',
        message: `Verified (status ${response.status})`,
        responseTime,
      };
    } catch (err) {
      return {
        modelId: model.id,
        provider: 'claude',
        status: 'error',
        message: `Network error: ${err instanceof Error ? err.message : 'Unknown'}`,
      };
    }
  }

  /**
   * Fetch list of available OpenAI models.
   */
  private async fetchOpenAIModels(apiKey: string): Promise<Set<string> | null> {
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      const modelIds = new Set<string>();

      for (const model of data.data || []) {
        modelIds.add(model.id);
      }

      return modelIds;
    } catch {
      return null;
    }
  }

  /**
   * Public: list available OpenAI models for the configured API key.
   */
  async listOpenAIModels(apiKey?: string): Promise<string[] | null> {
    if (!apiKey) {
      const keys = await this.authService.getApiKeys();
      apiKey = keys.openai;
    }
    if (!apiKey) return null;
    const available = await this.fetchOpenAIModels(apiKey);
    if (!available) return null;
    return Array.from(available).sort();
  }

  /**
   * Verify a GPT model against the fetched model list.
   */
  private verifyGptModel(
    model: ModelDefinition,
    apiKey?: string,
    availableModels?: Set<string> | null
  ): ModelVerificationResult {
    if (!apiKey) {
      return {
        modelId: model.id,
        provider: 'gpt',
        status: 'no-key',
        message: 'No OpenAI API key configured',
      };
    }

    if (!availableModels) {
      return {
        modelId: model.id,
        provider: 'gpt',
        status: 'error',
        message: 'Could not fetch model list from OpenAI',
      };
    }

    if (availableModels.has(model.id)) {
      return {
        modelId: model.id,
        provider: 'gpt',
        status: 'valid',
        message: 'Model found in OpenAI API',
      };
    }

    // Check for partial matches (sometimes API returns versioned IDs)
    const partialMatch = Array.from(availableModels).find(id =>
      id.startsWith(model.id) || model.id.startsWith(id)
    );

    if (partialMatch) {
      return {
        modelId: model.id,
        provider: 'gpt',
        status: 'valid',
        message: `Model matched as ${partialMatch}`,
      };
    }

    return {
      modelId: model.id,
      provider: 'gpt',
      status: 'invalid',
      message: 'Model not found in OpenAI API',
    };
  }

  /**
   * Verify a single model by ID.
   */
  async verifySingleModel(
    modelId: string,
    apiKey?: string
  ): Promise<ModelVerificationResult> {
    const model = ALL_MODELS.find(m => m.id === modelId);

    if (!model) {
      return {
        modelId,
        provider: 'claude',
        status: 'invalid',
        message: 'Model not found in configuration',
      };
    }

    // Get API key from AuthService if not provided
    if (!apiKey) {
      const keys = await this.authService.getApiKeys();
      apiKey = model.provider === 'claude' ? keys.claude : keys.openai;
    }

    if (model.provider === 'claude') {
      return this.verifyClaudeModel(model, apiKey);
    } else {
      const available = apiKey ? await this.fetchOpenAIModels(apiKey) : null;
      return this.verifyGptModel(model, apiKey, available);
    }
  }
}
