/**
 * Authentication & API Key Management
 */

import * as vscode from 'vscode';

export interface ApiKeys {
  claude?: string;
  openai?: string;
}

export class AuthService {
  private context: vscode.ExtensionContext | null = null;
  private readonly CLAUDE_KEY_ID = 'spacecode.claudeApiKey';
  private readonly OPENAI_KEY_ID = 'spacecode.openaiApiKey';

  async initialize(context: vscode.ExtensionContext): Promise<void> {
    this.context = context;
  }

  /**
   * Get stored API keys (from VS Code's secure secret storage)
   */
  async getApiKeys(): Promise<ApiKeys> {
    if (!this.context) {
      return {};
    }

    // First check settings (for users who prefer config file)
    const config = vscode.workspace.getConfiguration('spacecode');
    let claudeKey = config.get<string>('claudeApiKey');
    let openaiKey = config.get<string>('openaiApiKey');

    // If not in settings, check secure storage
    if (!claudeKey) {
      claudeKey = await this.context.secrets.get(this.CLAUDE_KEY_ID);
    }
    if (!openaiKey) {
      openaiKey = await this.context.secrets.get(this.OPENAI_KEY_ID);
    }

    return {
      claude: claudeKey || undefined,
      openai: openaiKey || undefined,
    };
  }

  /**
   * Store API key securely
   */
  async setApiKey(provider: 'claude' | 'openai', apiKey: string): Promise<void> {
    if (!this.context) {
      throw new Error('Auth service not initialized');
    }

    const keyId = provider === 'claude' ? this.CLAUDE_KEY_ID : this.OPENAI_KEY_ID;
    await this.context.secrets.store(keyId, apiKey);
  }

  /**
   * Remove stored API key
   */
  async removeApiKey(provider: 'claude' | 'openai'): Promise<void> {
    if (!this.context) {
      throw new Error('Auth service not initialized');
    }

    const keyId = provider === 'claude' ? this.CLAUDE_KEY_ID : this.OPENAI_KEY_ID;
    await this.context.secrets.delete(keyId);
  }

  /**
   * Prompt user to enter API keys
   */
  async promptForApiKeys(): Promise<ApiKeys> {
    const keys: ApiKeys = {};

    // Claude API Key
    const claudeKey = await vscode.window.showInputBox({
      title: 'SpaceCode - Claude API Key',
      prompt: 'Enter your Anthropic API key (starts with sk-ant-)',
      password: true,
      placeHolder: 'sk-ant-...',
      validateInput: (value) => {
        if (value && !value.startsWith('sk-ant-')) {
          return 'Claude API keys typically start with sk-ant-';
        }
        return null;
      }
    });

    if (claudeKey) {
      await this.setApiKey('claude', claudeKey);
      keys.claude = claudeKey;
    }

    // OpenAI API Key
    const openaiKey = await vscode.window.showInputBox({
      title: 'SpaceCode - OpenAI API Key',
      prompt: 'Enter your OpenAI API key (starts with sk-)',
      password: true,
      placeHolder: 'sk-...',
      validateInput: (value) => {
        if (value && !value.startsWith('sk-')) {
          return 'OpenAI API keys typically start with sk-';
        }
        return null;
      }
    });

    if (openaiKey) {
      await this.setApiKey('openai', openaiKey);
      keys.openai = openaiKey;
    }

    return keys;
  }

  /**
   * Validate that an API key works
   */
  async validateClaudeKey(apiKey: string): Promise<boolean> {
    try {
      // Light validation - actual API call would be in provider
      return apiKey.startsWith('sk-ant-') && apiKey.length > 20;
    } catch {
      return false;
    }
  }

  async validateOpenAIKey(apiKey: string): Promise<boolean> {
    try {
      return apiKey.startsWith('sk-') && apiKey.length > 20;
    } catch {
      return false;
    }
  }

  /**
   * Check if both providers are configured
   */
  async checkConfiguration(): Promise<{
    claude: boolean;
    openai: boolean;
    message?: string;
  }> {
    const keys = await this.getApiKeys();

    const result = {
      claude: !!keys.claude,
      openai: !!keys.openai,
      message: undefined as string | undefined,
    };

    if (!result.claude && !result.openai) {
      result.message = 'No API keys configured. Run "SpaceCode: Configure API Keys" to set up.';
    } else if (!result.claude) {
      result.message = 'Claude API key not configured. Some features will be limited.';
    } else if (!result.openai) {
      result.message = 'OpenAI API key not configured. Some features will be limited.';
    }

    return result;
  }
}
