/**
 * GPT/Codex CLI Provider
 *
 * Uses the Codex CLI (which authenticates via ChatGPT web account)
 * This uses your ChatGPT Plus/Pro subscription instead of API tokens
 */

import { spawn } from 'child_process';
import * as vscode from 'vscode';
import { AIProvider, AIProviderConfig, AIMessage, AIResponse } from './base';

export class GptCliProvider implements AIProvider {
  readonly name = 'gpt' as const;
  private cliPath: string = 'codex';
  private _isConfigured = false;
  private _workspaceDir: string = '';
  private _model: string = 'gpt-4o'; // Default model

  get isConfigured(): boolean {
    return this._isConfigured;
  }

  /**
   * Set the model to use for API calls
   */
  setModel(model: string): void {
    console.log(`[SpaceCode DEBUG] GptCli.setModel: ${model}`);
    this._model = model;
  }

  /**
   * Get the current model
   */
  getModel(): string {
    return this._model;
  }

  setWorkspaceDir(dir: string): void {
    this._workspaceDir = dir;
  }

  private getWorkspaceDir(): string {
    // Use explicitly set dir first
    if (this._workspaceDir) {
      return this._workspaceDir;
    }
    // Try VS Code API
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceFolder) {
      return workspaceFolder;
    }
    // Fallback to rootPath (deprecated but still works)
    if (vscode.workspace.rootPath) {
      return vscode.workspace.rootPath;
    }
    // Last resort fallback
    return process.env.HOME || '/tmp';
  }

  private getCommand(): string {
    const workspaceDir = this.getWorkspaceDir();
    // Use -c to override working directory config
    // Removed -o /dev/stdout as it was causing duplicate output
    return `${this.cliPath} exec --full-auto --skip-git-repo-check -c writable_roots='["${workspaceDir}"]' -`;
  }

  async configure(config: AIProviderConfig): Promise<void> {
    // CLI doesn't need API key, just check if codex CLI exists
    await this.checkCliAvailable();
  }

  private async checkCliAvailable(): Promise<void> {
    return new Promise((resolve) => {
      const proc = spawn(this.cliPath, ['--version'], { shell: true });

      proc.on('close', (code) => {
        this._isConfigured = code === 0;
        resolve();
      });

      proc.on('error', () => {
        this._isConfigured = false;
        resolve();
      });
    });
  }

  async sendMessage(
    messages: AIMessage[],
    systemPrompt?: string
  ): Promise<AIResponse> {
    const startTime = Date.now();

    // Build the prompt from messages
    const prompt = this.buildPrompt(messages, systemPrompt);

    return new Promise((resolve, reject) => {
      // Use codex exec with stdin input, --full-auto for non-interactive
      // --skip-git-repo-check allows running outside of trusted git directories
      const command = this.getCommand();

      const proc = spawn(command, [], {
        shell: true,
        env: { ...process.env },
        cwd: this.getWorkspaceDir(),
      });

      let output = '';
      let errorOutput = '';

      proc.stdout?.on('data', (data) => {
        output += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        errorOutput += data.toString();
      });

      proc.on('close', (code) => {
        const latencyMs = Date.now() - startTime;

        if (output) {
          resolve({
            content: output.trim(),
            provider: 'gpt',
            model: 'gpt-web',
            tokens: { input: 0, output: 0 }, // CLI doesn't report tokens
            cost: 0, // Using subscription
            latencyMs,
          });
        } else {
          reject(new Error(errorOutput || `Codex CLI failed with code ${code}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Codex CLI error: ${err.message}`));
      });

      // Write prompt to stdin and close it
      proc.stdin?.write(prompt);
      proc.stdin?.end();
    });
  }

  async sendMessageWithImages(
    messages: AIMessage[],
    images: string[], // Base64 encoded images
    systemPrompt?: string
  ): Promise<AIResponse> {
    const startTime = Date.now();
    const prompt = this.buildPrompt(messages, systemPrompt);

    return new Promise((resolve, reject) => {
      const command = this.getCommand();

      // Add image context to prompt (codex doesn't directly support base64 images in CLI)
      let fullPrompt = prompt;
      if (images.length > 0) {
        fullPrompt = `[Note: ${images.length} image(s) were attached but CLI doesn't support inline images]\n\n${prompt}`;
      }

      const proc = spawn(command, [], {
        shell: true,
        env: { ...process.env },
        cwd: this.getWorkspaceDir(),
      });

      let output = '';
      let errorOutput = '';

      proc.stdout?.on('data', (data) => {
        output += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        errorOutput += data.toString();
      });

      proc.on('close', (code) => {
        const latencyMs = Date.now() - startTime;

        if (output) {
          resolve({
            content: output.trim(),
            provider: 'gpt',
            model: 'gpt-web',
            tokens: { input: 0, output: 0 },
            cost: 0,
            latencyMs,
          });
        } else {
          reject(new Error(errorOutput || `Codex CLI failed with code ${code}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Codex CLI error: ${err.message}`));
      });

      // Write prompt to stdin and close it
      proc.stdin?.write(fullPrompt);
      proc.stdin?.end();
    });
  }

  async streamMessage(
    messages: AIMessage[],
    systemPrompt: string | undefined,
    onChunk: (chunk: string) => void
  ): Promise<AIResponse> {
    const startTime = Date.now();
    const prompt = this.buildPrompt(messages, systemPrompt);

    return new Promise((resolve, reject) => {
      const command = this.getCommand();

      const proc = spawn(command, [], {
        shell: true,
        env: { ...process.env },
        cwd: this.getWorkspaceDir(),
      });

      let fullOutput = '';

      proc.stdout?.on('data', (data) => {
        const chunk = data.toString();
        fullOutput += chunk;
        onChunk(chunk);
      });

      proc.stderr?.on('data', (data) => {
        // Ignore stderr for streaming
      });

      proc.on('close', (code) => {
        const latencyMs = Date.now() - startTime;

        resolve({
          content: fullOutput.trim(),
          provider: 'gpt',
          model: 'gpt-web',
          tokens: { input: 0, output: 0 },
          cost: 0,
          latencyMs,
        });
      });

      proc.on('error', (err) => {
        reject(new Error(`Codex CLI error: ${err.message}`));
      });

      // Write prompt to stdin and close it
      proc.stdin?.write(prompt);
      proc.stdin?.end();
    });
  }

  estimateCost(inputTokens: number, outputTokens: number): number {
    return 0; // Using subscription, no per-token cost
  }

  private buildPrompt(messages: AIMessage[], systemPrompt?: string): string {
    const parts: string[] = [];

    if (systemPrompt) {
      parts.push(`System: ${systemPrompt}\n`);
    }

    for (const msg of messages) {
      if (msg.role === 'system') {
        parts.push(`System: ${msg.content}`);
      } else if (msg.role === 'user') {
        parts.push(`User: ${msg.content}`);
      } else if (msg.role === 'assistant') {
        parts.push(`Assistant: ${msg.content}`);
      }
    }

    return parts.join('\n\n');
  }
}
