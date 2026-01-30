/**
 * Claude CLI Provider
 *
 * Uses the Claude Code CLI with NATIVE session management.
 * Sessions are stored in ~/.claude/ and persist automatically.
 *
 * IMPORTANT: Claude CLI uses different flags for new vs existing sessions:
 * - First message: --session-id <uuid>  (creates new session)
 * - Following messages: --resume <uuid>  (continues existing session)
 */

import { spawn } from 'child_process';
import * as vscode from 'vscode';
import { AIProvider, AIProviderConfig, AIMessage, AIResponse } from './base';
import { randomUUID } from 'crypto';

// Regex to strip ANSI escape codes from output
const ANSI_REGEX = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

export class ClaudeCliProvider implements AIProvider {
  readonly name = 'claude' as const;
  private cliPath: string = 'claude';
  private _isConfigured = false;
  private _workspaceDir: string = '';
  private _sessionId: string = '';
  // Track which sessions have been started (per session ID, not global)
  private _startedSessions: Set<string> = new Set();

  get isConfigured(): boolean {
    return this._isConfigured;
  }

  setWorkspaceDir(dir: string): void {
    this._workspaceDir = dir;
  }

  /**
   * Set session ID for conversation persistence
   */
  setSessionId(sessionId: string): void {
    console.log(`[SpaceCode DEBUG] ClaudeCli.setSessionId called with: ${sessionId}`);
    console.log(`[SpaceCode DEBUG]   Previous sessionId was: ${this._sessionId}`);
    this._sessionId = sessionId;
    // Don't reset started state - it's tracked per session in _startedSessions
  }

  /**
   * Get current session ID, generating one if needed
   */
  getSessionId(): string {
    if (!this._sessionId) {
      this._sessionId = randomUUID();
    }
    return this._sessionId;
  }

  /**
   * Create a new session (generates new UUID)
   */
  newSession(): string {
    this._sessionId = randomUUID();
    return this._sessionId;
  }

  /**
   * Check if a session has been started (first message sent)
   */
  isSessionStarted(sessionId: string): boolean {
    return this._startedSessions.has(sessionId);
  }

  /**
   * Mark a session as started
   */
  markSessionStarted(sessionId: string): void {
    this._startedSessions.add(sessionId);
  }

  private getWorkspaceDir(): string {
    if (this._workspaceDir) {
      return this._workspaceDir;
    }
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceFolder) {
      return workspaceFolder;
    }
    if (vscode.workspace.rootPath) {
      return vscode.workspace.rootPath;
    }
    return process.env.HOME || '/tmp';
  }

  /**
   * Strip ANSI escape codes from output
   */
  private stripAnsi(text: string): string {
    return text.replace(ANSI_REGEX, '');
  }

  /**
   * Clean up Claude CLI output - remove ANSI codes and extra whitespace
   */
  private cleanOutput(text: string): string {
    let cleaned = this.stripAnsi(text);
    cleaned = cleaned.replace(/^[\s\n]*/, '');
    cleaned = cleaned.replace(/[\s\n]*$/, '');
    return cleaned;
  }

  private getCliArgs(): string[] {
    const args: string[] = [];
    const workspaceDir = this.getWorkspaceDir();

    // Add workspace directory
    if (workspaceDir && workspaceDir !== process.env.HOME) {
      args.push('--add-dir', workspaceDir);
    }

    // Session handling:
    // - First message: --session-id <uuid> (creates new session)
    // - Following messages: --resume <uuid> (continues session)
    if (this._sessionId) {
      const isSessionStarted = this._startedSessions.has(this._sessionId);
      console.log(`[SpaceCode DEBUG] ClaudeCli.getCliArgs:`);
      console.log(`[SpaceCode DEBUG]   sessionId: ${this._sessionId}`);
      console.log(`[SpaceCode DEBUG]   isSessionStarted: ${isSessionStarted}`);
      console.log(`[SpaceCode DEBUG]   _startedSessions: [${Array.from(this._startedSessions).join(', ')}]`);

      if (isSessionStarted) {
        // Session already exists, use --resume to continue
        args.push('--resume', this._sessionId);
        console.log(`[SpaceCode DEBUG]   Using --resume ${this._sessionId}`);
      } else {
        // First message in session, use --session-id to create
        args.push('--session-id', this._sessionId);
        console.log(`[SpaceCode DEBUG]   Using --session-id ${this._sessionId} (new session)`);
      }
    } else {
      console.log(`[SpaceCode DEBUG] ClaudeCli.getCliArgs: NO SESSION ID SET!`);
    }

    return args;
  }

  async configure(config: AIProviderConfig): Promise<void> {
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

  /**
   * Send a message using Claude Code's native session management.
   * Only the current message is sent - Claude Code handles history internally.
   */
  async sendMessage(
    messages: AIMessage[],
    systemPrompt?: string
  ): Promise<AIResponse> {
    return this._sendMessageInternal(messages, systemPrompt, false);
  }

  /**
   * Internal send with retry logic for "session already in use" errors
   */
  private async _sendMessageInternal(
    messages: AIMessage[],
    systemPrompt?: string,
    isRetry: boolean = false
  ): Promise<AIResponse> {
    const startTime = Date.now();

    // Build the full prompt including conversation history
    // CLI --print mode doesn't reliably persist sessions, so we include history in the prompt
    let finalPrompt = '';

    // Add system prompt if provided
    if (systemPrompt) {
      finalPrompt += `[System Context: ${systemPrompt}]\n\n`;
    }

    // Add conversation history
    if (messages.length > 1) {
      finalPrompt += '=== Conversation History ===\n';
      for (let i = 0; i < messages.length - 1; i++) {
        const msg = messages[i];
        const roleLabel = msg.role === 'user' ? 'Human' : 'Assistant';
        finalPrompt += `${roleLabel}: ${msg.content}\n\n`;
      }
      finalPrompt += '=== Current Message ===\n';
    }

    // Add the current message
    const lastMessage = messages[messages.length - 1];
    finalPrompt += lastMessage?.content || '';

    console.log(`[SpaceCode DEBUG] ClaudeCli finalPrompt built with ${messages.length} messages`);
    console.log(`[SpaceCode DEBUG] Prompt preview: ${finalPrompt.substring(0, 200)}...`);

    return new Promise((resolve, reject) => {
      const args = this.getCliArgs();
      // Avoid interactive prompts inside VS Code extension host.
      args.push('--permission-mode', 'dontAsk');
      args.push('--print', '-'); // Use print mode with stdin

      const proc = spawn(this.cliPath, args, {
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

      proc.on('close', async (code) => {
        const latencyMs = Date.now() - startTime;

        console.log(`[SpaceCode DEBUG] ClaudeCli process closed with code: ${code}`);
        console.log(`[SpaceCode DEBUG]   output length: ${output.length}`);
        console.log(`[SpaceCode DEBUG]   errorOutput: ${errorOutput.substring(0, 200)}`);

        if (code === 0 && output) {
          // Mark session as started after successful first message
          if (this._sessionId) {
            this._startedSessions.add(this._sessionId);
            console.log(`[SpaceCode DEBUG]   Session ${this._sessionId} marked as started`);
          }

          resolve({
            content: this.cleanOutput(output),
            provider: 'claude',
            model: 'claude-cli',
            tokens: { input: 0, output: 0 },
            cost: 0,
            latencyMs,
          });
        } else if (!isRetry && errorOutput.includes('already in use')) {
          // Session exists from previous VS Code session - mark as started and retry
          console.log(`[SpaceCode DEBUG] Session already exists, retrying with --resume`);
          if (this._sessionId) {
            this._startedSessions.add(this._sessionId);
          }
          try {
            const retryResult = await this._sendMessageInternal(messages, systemPrompt, true);
            resolve(retryResult);
          } catch (retryError) {
            reject(retryError);
          }
        } else {
          console.log(`[SpaceCode DEBUG] ClaudeCli FAILED - code: ${code}, error: ${errorOutput}`);
          reject(new Error(errorOutput || `Claude CLI failed with code ${code}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Claude CLI error: ${err.message}`));
      });

      // Send only the current message
      proc.stdin?.write(finalPrompt);
      proc.stdin?.end();
    });
  }

  async sendMessageWithImages(
    messages: AIMessage[],
    images: string[],
    systemPrompt?: string
  ): Promise<AIResponse> {
    const lastMessage = messages[messages.length - 1];
    let prompt = lastMessage?.content || '';

    if (images.length > 0) {
      prompt = `[Note: ${images.length} image(s) attached - CLI doesn't support images]\n\n${prompt}`;
    }

    const modifiedMessages = [...messages.slice(0, -1), { role: 'user' as const, content: prompt }];
    return this.sendMessage(modifiedMessages, systemPrompt);
  }

  async streamMessage(
    messages: AIMessage[],
    systemPrompt: string | undefined,
    onChunk: (chunk: string) => void
  ): Promise<AIResponse> {
    const startTime = Date.now();

    // Build the full prompt including conversation history (same as sendMessage)
    let finalPrompt = '';

    // Add system prompt if provided
    if (systemPrompt) {
      finalPrompt += `[System Context: ${systemPrompt}]\n\n`;
    }

    // Add conversation history
    if (messages.length > 1) {
      finalPrompt += '=== Conversation History ===\n';
      for (let i = 0; i < messages.length - 1; i++) {
        const msg = messages[i];
        const roleLabel = msg.role === 'user' ? 'Human' : 'Assistant';
        finalPrompt += `${roleLabel}: ${msg.content}\n\n`;
      }
      finalPrompt += '=== Current Message ===\n';
    }

    // Add the current message
    const lastMessage = messages[messages.length - 1];
    finalPrompt += lastMessage?.content || '';

    console.log(`[SpaceCode DEBUG] ClaudeCli streamMessage built with ${messages.length} messages`);

    return new Promise((resolve, reject) => {
      const args = this.getCliArgs();
      // Use stream-json with partial messages for real-time streaming output
      args.push('--permission-mode', 'dontAsk');
      args.push('--print', '-', '--output-format', 'stream-json', '--verbose', '--include-partial-messages');

      const proc = spawn(this.cliPath, args, {
        shell: true,
        env: { ...process.env },
        cwd: this.getWorkspaceDir(),
      });

      let fullOutput = '';
      let errorOutput = '';
      let lineBuffer = '';

      proc.stdout?.on('data', (data) => {
        // Handle stream-json format: each line is a JSON object
        lineBuffer += data.toString();
        const lines = lineBuffer.split('\n');

        // Keep incomplete last line in buffer
        lineBuffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const json = JSON.parse(line);
            // Extract text content from various message types
            if (json.type === 'stream_event' && json.event?.type === 'content_block_delta') {
              // Real-time streaming delta from --include-partial-messages
              const text = json.event.delta?.text;
              if (text) {
                fullOutput += text;
                onChunk(text);
              }
            } else if (json.type === 'assistant' && json.message?.content) {
              // Full message content - SKIP if we already have streamed output (avoid duplication)
              if (!fullOutput) {
                for (const block of json.message.content) {
                  if (block.type === 'text' && block.text) {
                    fullOutput += block.text;
                    onChunk(block.text);
                  }
                }
              }
            } else if (json.type === 'content_block_delta' && json.delta?.text) {
              // Streaming delta (alternate format)
              fullOutput += json.delta.text;
              onChunk(json.delta.text);
            } else if (json.type === 'result' && json.result) {
              // Final result message - don't overwrite if we already have output
              if (!fullOutput && json.result) {
                fullOutput = json.result;
              }
            }
          } catch (e) {
            // Not JSON or parsing error - might be plain text fallback
            const cleaned = this.cleanOutput(line);
            if (cleaned) {
              fullOutput += cleaned;
              onChunk(cleaned);
            }
          }
        }
      });

      proc.stderr?.on('data', (data) => {
        errorOutput += data.toString();
      });

      proc.on('close', async (code) => {
        const latencyMs = Date.now() - startTime;

        // Process any remaining buffer
        if (lineBuffer.trim()) {
          try {
            const json = JSON.parse(lineBuffer);
            if (json.type === 'assistant' && json.message?.content) {
              for (const block of json.message.content) {
                if (block.type === 'text' && block.text) {
                  fullOutput += block.text;
                  onChunk(block.text);
                }
              }
            } else if (json.result && !fullOutput) {
              fullOutput = json.result;
            }
          } catch (e) {
            const cleaned = this.cleanOutput(lineBuffer);
            if (cleaned) {
              fullOutput += cleaned;
            }
          }
        }

        console.log(`[SpaceCode DEBUG] ClaudeCli stream closed with code: ${code}`);
        console.log(`[SpaceCode DEBUG]   output length: ${fullOutput.length}`);
        console.log(`[SpaceCode DEBUG]   errorOutput: ${errorOutput.substring(0, 200)}`);

        if (code === 0 && fullOutput) {
          // Mark session as started after successful first message
          if (this._sessionId) {
            this._startedSessions.add(this._sessionId);
            console.log(`[SpaceCode DEBUG]   Session ${this._sessionId} marked as started`);
          }

          resolve({
            content: this.cleanOutput(fullOutput),
            provider: 'claude',
            model: 'claude-cli',
            tokens: { input: 0, output: 0 },
            cost: 0,
            latencyMs,
          });
        } else if (errorOutput.includes('already in use')) {
          // Session exists from previous VS Code session - mark as started and retry
          console.log(`[SpaceCode DEBUG] Session already exists, retrying with --resume`);
          if (this._sessionId) {
            this._startedSessions.add(this._sessionId);
          }
          try {
            const retryResult = await this.streamMessage(messages, systemPrompt, onChunk);
            resolve(retryResult);
          } catch (retryError) {
            reject(retryError);
          }
        } else {
          console.log(`[SpaceCode DEBUG] ClaudeCli stream FAILED - code: ${code}, error: ${errorOutput}`);
          reject(new Error(errorOutput || `Claude CLI failed with code ${code}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Claude CLI error: ${err.message}`));
      });

      proc.stdin?.write(finalPrompt);
      proc.stdin?.end();
    });
  }

  estimateCost(inputTokens: number, outputTokens: number): number {
    return 0; // Using subscription, no per-token cost
  }
}
