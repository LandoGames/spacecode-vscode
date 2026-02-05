/**
 * AI-to-AI Conversation Orchestrator
 *
 * Manages multi-turn conversations between Claude and GPT
 */

import * as vscode from 'vscode';
import { AIProvider, AIMessage, AIResponse } from '../providers/base';
import { EventEmitter } from 'events';
import { getModelLabel } from '../config/models';

export type ConversationMode = 'code-review' | 'debate' | 'collaborate' | 'single';
export type ResponseStyle = 'concise' | 'detailed';

export interface ConversationConfig {
  mode: ConversationMode;
  maxTurns: number;
  claudeSystemPrompt?: string;
  gptSystemPrompt?: string;
  initialContext?: string; // e.g., selected code
  topic?: string;
  responseStyle?: ResponseStyle;
  autoSummarize?: boolean;
}

export interface ConversationTurn {
  turnNumber: number;
  provider: 'claude' | 'gpt' | 'user';
  message: string;
  response?: AIResponse;
  timestamp: number;
  chatId?: string; // For multi-chat support
}

export interface ConversationStats {
  totalTurns: number;
  claudeTurns: number;
  gptTurns: number;
  totalTokens: {
    input: number;
    output: number;
  };
  totalCost: number;
  totalLatencyMs: number;
}

// Context compaction settings
const MAX_CONTEXT_TOKENS = 100000; // Approximate max tokens before compaction
const COMPACTION_THRESHOLD = 0.75; // Trigger compaction at 75% of max
const CHARS_PER_TOKEN = 4; // Rough estimate: 4 characters per token

export class ConversationOrchestrator extends EventEmitter {
  private claudeProvider: AIProvider | null = null;
  private gptProvider: AIProvider | null = null;
  private turns: ConversationTurn[] = [];
  private isRunning = false;
  private shouldStop = false;
  private _workspaceDir: string = '';
  private _claudeSessionId: string = '';
  private _gptSessionId: string = '';
  private _contextSummary: string = ''; // Summary of compacted context
  private _isCompacted: boolean = false; // Whether context has been compacted

  /**
   * Set session ID for Claude provider (for conversation persistence)
   */
  setClaudeSessionId(sessionId: string): void {
    this._claudeSessionId = sessionId;
    if (this.claudeProvider && 'setSessionId' in this.claudeProvider) {
      (this.claudeProvider as any).setSessionId(sessionId);
    }
  }

  /**
   * Get current Claude session ID
   */
  getClaudeSessionId(): string {
    return this._claudeSessionId;
  }

  /**
   * Create a new Claude session
   */
  newClaudeSession(): string {
    if (this.claudeProvider && 'newSession' in this.claudeProvider) {
      this._claudeSessionId = (this.claudeProvider as any).newSession();
    } else {
      this._claudeSessionId = require('crypto').randomUUID();
    }
    return this._claudeSessionId;
  }

  setWorkspaceDir(dir: string): void {
    this._workspaceDir = dir;
    // Also update providers if they support it
    if (this.claudeProvider && 'setWorkspaceDir' in this.claudeProvider) {
      (this.claudeProvider as any).setWorkspaceDir(dir);
    }
    if (this.gptProvider && 'setWorkspaceDir' in this.gptProvider) {
      (this.gptProvider as any).setWorkspaceDir(dir);
    }
  }

  /**
   * Get the Claude provider (for workflow engine)
   */
  getClaudeProvider(): AIProvider | null {
    return this.claudeProvider;
  }

  /**
   * Get the GPT provider (for workflow engine)
   */
  getGptProvider(): AIProvider | null {
    return this.gptProvider;
  }

  /**
   * Get the display label for a provider's current model
   */
  private getProviderModelLabel(provider: 'claude' | 'gpt'): string {
    const prov = provider === 'claude' ? this.claudeProvider : this.gptProvider;
    if (prov && 'getModel' in prov) {
      const modelId = (prov as any).getModel();
      if (modelId) {
        return getModelLabel(modelId);
      }
    }
    return provider === 'claude' ? 'Claude' : 'GPT';
  }

  /**
   * Estimate token count for a string (rough approximation)
   */
  private estimateTokens(text: string): number {
    return Math.ceil((text || '').length / CHARS_PER_TOKEN);
  }

  /**
   * Estimate total tokens in message history
   */
  estimateHistoryTokens(history: Array<{ role: string; content: string }>): number {
    let total = 0;
    for (const msg of (history || [])) {
      total += this.estimateTokens(msg?.content || '');
    }
    if (this._contextSummary) {
      total += this.estimateTokens(this._contextSummary);
    }
    return total;
  }

  /**
   * Check if context needs compaction
   */
  needsCompaction(history: Array<{ role: string; content: string }>): boolean {
    const tokens = this.estimateHistoryTokens(history);
    return tokens > MAX_CONTEXT_TOKENS * COMPACTION_THRESHOLD;
  }

  /**
   * Get whether context has been compacted
   */
  get isCompacted(): boolean {
    return this._isCompacted;
  }

  /**
   * Get context summary if available
   */
  get contextSummary(): string {
    return this._contextSummary;
  }

  /**
   * Compact conversation history by summarizing older messages
   * Returns the compacted history with summary prepended
   */
  async compactHistory(
    history: Array<{ role: string; content: string }>,
    keepRecentCount: number = 4
  ): Promise<{ compacted: Array<{ role: string; content: string }>; summary: string }> {
    if (history.length <= keepRecentCount) {
      return { compacted: history, summary: '' };
    }

    // Split into older messages (to summarize) and recent messages (to keep)
    const olderMessages = history.slice(0, -keepRecentCount);
    const recentMessages = history.slice(-keepRecentCount);

    // Build conversation text to summarize
    const conversationText = olderMessages.map(m =>
      `${m.role === 'user' ? 'Human' : 'Assistant'}: ${m.content}`
    ).join('\n\n');

    // Create summary using available provider
    const summaryPrompt = `Please provide a concise summary of the following conversation. Focus on:
- Key topics discussed
- Important decisions or conclusions
- Any context needed to understand the recent messages

Conversation to summarize:
${conversationText}

Provide a summary in 2-4 paragraphs:`;

    this.emit('status', {
      provider: 'system',
      status: 'compacting',
      message: 'Compacting conversation history...'
    });

    try {
      const provider = this.claudeProvider?.isConfigured ? this.claudeProvider : this.gptProvider;
      if (!provider?.isConfigured) {
        throw new Error('No provider available for summarization');
      }

      const response = await provider.sendMessage(
        [{ role: 'user', content: summaryPrompt }],
        'You are a helpful assistant that creates concise summaries of conversations.'
      );

      this._contextSummary = response.content;
      this._isCompacted = true;

      // Emit event for UI to show compaction notice
      this.emit('compacted', {
        summary: response.content,
        originalMessageCount: olderMessages.length,
        keptMessageCount: recentMessages.length
      });

      // Return compacted history with summary as system context
      return {
        compacted: recentMessages,
        summary: response.content
      };
    } catch (error) {
      console.error('Failed to compact history:', error);
      // If summarization fails, just truncate older messages
      return {
        compacted: recentMessages,
        summary: '[Previous conversation context was truncated due to length]'
      };
    }
  }

  /**
   * Reset compaction state (call when starting new conversation)
   */
  resetCompaction(): void {
    this._contextSummary = '';
    this._isCompacted = false;
  }

  getWorkspaceDir(): string {
    if (this._workspaceDir) {
      return this._workspaceDir;
    }
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      || vscode.workspace.rootPath
      || process.env.HOME
      || '';
  }

  private getWorkspaceContext(): string {
    const workspaceFolder = this.getWorkspaceDir();
    if (workspaceFolder) {
      return `You are working in the project directory: ${workspaceFolder}. `;
    }
    return '';
  }

  // Events: 'turn', 'chunk', 'complete', 'error', 'status'

  setProviders(claude: AIProvider, gpt: AIProvider): void {
    this.claudeProvider = claude;
    this.gptProvider = gpt;
  }

  get conversationHistory(): ConversationTurn[] {
    return [...this.turns];
  }

  get stats(): ConversationStats {
    const stats: ConversationStats = {
      totalTurns: this.turns.length,
      claudeTurns: this.turns.filter(t => t.provider === 'claude').length,
      gptTurns: this.turns.filter(t => t.provider === 'gpt').length,
      totalTokens: { input: 0, output: 0 },
      totalCost: 0,
      totalLatencyMs: 0,
    };

    for (const turn of this.turns) {
      if (turn.response) {
        stats.totalTokens.input += turn.response.tokens.input;
        stats.totalTokens.output += turn.response.tokens.output;
        stats.totalCost += turn.response.cost;
        stats.totalLatencyMs += turn.response.latencyMs;
      }
    }

    return stats;
  }

  /**
   * Start an AI-to-AI conversation
   */
  async startConversation(config: ConversationConfig): Promise<void> {
    if (this.isRunning) {
      throw new Error('Conversation already in progress');
    }

    if (!this.claudeProvider?.isConfigured && config.mode !== 'single') {
      throw new Error('Claude provider not configured');
    }
    if (!this.gptProvider?.isConfigured && config.mode !== 'single') {
      throw new Error('GPT provider not configured');
    }

    this.isRunning = true;
    this.shouldStop = false;
    this.turns = [];

    try {
      switch (config.mode) {
        case 'code-review':
          await this.runCodeReview(config);
          break;
        case 'debate':
          await this.runDebate(config);
          break;
        case 'collaborate':
          await this.runCollaboration(config);
          break;
        case 'single':
          // Single AI interaction handled separately
          break;
      }

      this.emit('complete', this.stats);
    } catch (error) {
      this.emit('error', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Stop the current conversation
   */
  stop(): void {
    this.shouldStop = true;
  }

  /**
   * Code Review Mode: Both AIs review code, then discuss each other's feedback
   */
  private async runCodeReview(config: ConversationConfig): Promise<void> {
    const code = config.initialContext || '';

    // Step 1: Claude reviews the code
    this.emit('status', { provider: 'claude', status: 'thinking', message: 'Claude is reviewing the code...' });

    const claudeReviewPrompt = `You are an expert code reviewer. Review the following code and provide:
1. A summary of what the code does
2. Potential bugs or issues
3. Performance concerns
4. Code style and best practices suggestions
5. Security considerations if applicable

Be specific and constructive. Here's the code:

\`\`\`
${code}
\`\`\``;

    const claudeReview = await this.sendToProvider('claude', [
      { role: 'user', content: claudeReviewPrompt }
    ], config.claudeSystemPrompt);

    this.addTurn('claude', claudeReview.content, claudeReview);

    if (this.shouldStop) { return; }

    // Step 2: GPT reviews the code independently
    this.emit('status', { provider: 'gpt', status: 'thinking', message: 'GPT is reviewing the code...' });

    const gptReviewPrompt = `You are an expert code reviewer. Review the following code and provide:
1. A summary of what the code does
2. Potential bugs or issues
3. Performance concerns
4. Code style and best practices suggestions
5. Security considerations if applicable

Be specific and constructive. Here's the code:

\`\`\`
${code}
\`\`\``;

    const gptReview = await this.sendToProvider('gpt', [
      { role: 'user', content: gptReviewPrompt }
    ], config.gptSystemPrompt);

    this.addTurn('gpt', gptReview.content, gptReview);

    if (this.shouldStop) { return; }

    // Step 3: Have them discuss each other's reviews
    let turnCount = 2;

    while (turnCount < config.maxTurns && !this.shouldStop) {
      const currentProvider = turnCount % 2 === 0 ? 'claude' : 'gpt';
      const otherProvider = currentProvider === 'claude' ? 'gpt' : 'claude';

      this.emit('status', {
        provider: currentProvider,
        status: 'thinking',
        message: `${this.getProviderModelLabel(currentProvider)} is responding...`
      });

      const discussPrompt = `The other AI (${otherProvider === 'claude' ? 'Claude' : 'GPT'}) provided this code review:

${this.turns[turnCount - 1].message}

Please respond to their review:
- Do you agree or disagree with their points?
- What did they miss that you caught?
- What did they catch that you might have missed?
- Are there any points you'd like to clarify or expand on?

Keep your response focused and constructive.`;

      const messages = this.buildMessages(currentProvider);
      messages.push({ role: 'user', content: discussPrompt });

      const response = await this.sendToProvider(
        currentProvider,
        messages,
        currentProvider === 'claude' ? config.claudeSystemPrompt : config.gptSystemPrompt
      );

      this.addTurn(currentProvider, response.content, response);
      turnCount++;

      // Check if conversation is reaching natural conclusion
      if (this.isConversationConcluding(response.content)) {
        break;
      }
    }
  }

  /**
   * Debate Mode: AIs take opposing positions and debate
   */
  private async runDebate(config: ConversationConfig): Promise<void> {
    const topic = config.topic || config.initialContext || '';

    // Claude argues FOR, GPT argues AGAINST (or vice versa)
    const claudeDebatePrompt = `You are participating in a technical debate. Your position is to argue IN FAVOR of the following:

${topic}

Present your strongest arguments. Be logical, cite evidence where possible, and anticipate counterarguments.`;

    const gptDebatePrompt = `You are participating in a technical debate. Your position is to argue AGAINST the following:

${topic}

Present your strongest arguments. Be logical, cite evidence where possible, and anticipate counterarguments.`;

    // Opening statements
    this.emit('status', { provider: 'claude', status: 'thinking', message: 'Claude is preparing opening statement...' });

    const claudeOpening = await this.sendToProvider('claude', [
      { role: 'user', content: claudeDebatePrompt }
    ], 'You are a skilled debater who argues your position clearly and persuasively.');

    this.addTurn('claude', claudeOpening.content, claudeOpening);

    if (this.shouldStop) { return; }

    this.emit('status', { provider: 'gpt', status: 'thinking', message: 'GPT is preparing opening statement...' });

    const gptOpening = await this.sendToProvider('gpt', [
      { role: 'user', content: gptDebatePrompt }
    ], 'You are a skilled debater who argues your position clearly and persuasively.');

    this.addTurn('gpt', gptOpening.content, gptOpening);

    // Continue debate rounds
    let turnCount = 2;

    while (turnCount < config.maxTurns && !this.shouldStop) {
      const currentProvider = turnCount % 2 === 0 ? 'claude' : 'gpt';

      this.emit('status', {
        provider: currentProvider,
        status: 'thinking',
        message: `${currentProvider === 'claude' ? 'Claude' : 'GPT'} is formulating rebuttal...`
      });

      const rebuttalPrompt = `Your opponent argued:

${this.turns[turnCount - 1].message}

Respond to their arguments and strengthen your position. Address their specific points and provide counterarguments.`;

      const messages = this.buildMessages(currentProvider);
      messages.push({ role: 'user', content: rebuttalPrompt });

      const response = await this.sendToProvider(currentProvider, messages);
      this.addTurn(currentProvider, response.content, response);
      turnCount++;
    }
  }

  /**
   * Collaboration Mode: AIs work together to solve a problem
   */
  private async runCollaboration(config: ConversationConfig): Promise<void> {
    const problem = config.initialContext || config.topic || '';
    const isConcise = config.responseStyle !== 'detailed';

    // Build response length instruction
    const lengthInstruction = isConcise
      ? 'Keep your response focused and concise (2-4 paragraphs max). Get straight to the point.'
      : '';

    const systemPrompt = `${this.getWorkspaceContext()}You are a collaborative problem solver. Build on ideas constructively. ${lengthInstruction}`.trim();

    const collaborationPrompt = `We're working together on this:

${problem}

Share your thoughts on this. ${isConcise ? 'Be concise and focused.' : ''}`;

    // Claude starts
    this.emit('status', { provider: 'claude', status: 'thinking', message: `${this.getProviderModelLabel('claude')} is thinking about the problem...` });

    const claudeStart = await this.sendToProvider('claude', [
      { role: 'user', content: collaborationPrompt }
    ], systemPrompt);

    this.addTurn('claude', claudeStart.content, claudeStart);

    if (this.shouldStop) { return; }

    // Continue collaboration
    let turnCount = 1;

    while (turnCount < config.maxTurns && !this.shouldStop) {
      const currentProvider = turnCount % 2 === 0 ? 'claude' : 'gpt';
      const isLastTurn = turnCount === config.maxTurns - 1;

      this.emit('status', {
        provider: currentProvider,
        status: 'thinking',
        message: `${this.getProviderModelLabel(currentProvider)} is responding... (${turnCount + 1}/${config.maxTurns})`
      });

      let continuePrompt: string;
      if (isLastTurn) {
        continuePrompt = `Your collaborator said:

${this.turns[turnCount - 1].message}

This is the final turn. Please provide your concluding thoughts and any final recommendations.${isConcise ? ' Keep it brief.' : ''}`;
      } else {
        continuePrompt = `Your collaborator said:

${this.turns[turnCount - 1].message}

Build on their ideas or offer a different perspective.${isConcise ? ' Be concise.' : ''}`;
      }

      const messages = this.buildMessages(currentProvider);
      messages.push({ role: 'user', content: continuePrompt });

      const response = await this.sendToProvider(currentProvider, messages, systemPrompt);

      this.addTurn(currentProvider, response.content, response);
      turnCount++;

      // Check for convergence
      if (this.isConversationConcluding(response.content)) {
        break;
      }
    }

    // Auto-summarize if enabled
    if (config.autoSummarize && !this.shouldStop) {
      await this.generateSummary(config);
    }
  }

  /**
   * Generate a summary of the conversation
   */
  private async generateSummary(config: ConversationConfig): Promise<void> {
    this.emit('status', { provider: 'claude', status: 'thinking', message: 'Generating summary...' });

    const conversationText = this.turns.map(t =>
      `${t.provider === 'claude' ? 'Claude' : 'GPT'}: ${t.message}`
    ).join('\n\n---\n\n');

    const summaryPrompt = `Here's a conversation between two AIs about: "${config.topic || config.initialContext || 'a problem'}"

${conversationText}

---

Provide a brief summary (3-5 bullet points) of the key takeaways and conclusions from this discussion.`;

    const summary = await this.sendToProvider('claude', [
      { role: 'user', content: summaryPrompt }
    ], 'You are a helpful assistant that summarizes discussions concisely.');

    // Emit summary as a special turn
    this.emit('summary', { content: summary.content, response: summary });
  }

  /**
   * Send a single message to a provider (for single-AI mode)
   *
   * For Claude: Uses native session management via --session-id
   *             Claude Code handles history/compaction internally
   * For GPT: We pass full history manually
   *
   * @param sessionId - Session ID for Claude's native session persistence
   */
  async askSingle(
    provider: 'claude' | 'gpt',
    message: string,
    systemPrompt?: string,
    history: Array<{ role: string; content: string }> = [],
    sessionId?: string,
    chatId?: string
  ): Promise<AIResponse> {
    const p = provider === 'claude' ? this.claudeProvider : this.gptProvider;
    if (!p?.isConfigured) {
      throw new Error(`${provider} provider not configured`);
    }

    this.emit('status', { provider, status: 'thinking', message: `${this.getProviderModelLabel(provider)} is thinking...` });

    // Get workspace context for system prompt
    let fullSystemPrompt: string | undefined = this.getWorkspaceContext();
    if (systemPrompt) {
      fullSystemPrompt += systemPrompt;
    }
    fullSystemPrompt = fullSystemPrompt.trim() || undefined;

    let response: AIResponse;

    // Check if using Claude CLI with session support
    const hasSetSessionId = 'setSessionId' in p;
    const useClaudeSession = provider === 'claude' && sessionId && hasSetSessionId;

    console.log(`[SpaceCode DEBUG] ========== askSingle ==========`);
    console.log(`[SpaceCode DEBUG] provider: ${provider}`);
    console.log(`[SpaceCode DEBUG] sessionId: ${sessionId}`);
    console.log(`[SpaceCode DEBUG] hasSetSessionId method: ${hasSetSessionId}`);
    console.log(`[SpaceCode DEBUG] useClaudeSession: ${useClaudeSession}`);
    console.log(`[SpaceCode DEBUG] history length: ${history.length}`);
    if (history.length > 0) {
      history.forEach((h, i) => {
        console.log(`[SpaceCode DEBUG]   [${i}] ${h.role}: ${(h.content || '').substring(0, 80)}...`);
      });
    }
    console.log(`[SpaceCode DEBUG] ===============================`);

    if (useClaudeSession) {
      // CLAUDE CLI: Pass full history - CLI provider builds prompt from messages
      // (CLI --print mode doesn't reliably persist sessions)
      (p as any).setSessionId(sessionId);
      this._claudeSessionId = sessionId;

      // Build messages array with full history + current message
      const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];

      // Add history
      for (const msg of history) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
        }
      }

      // Add current message
      messages.push({ role: 'user', content: message });

      console.log(`[SpaceCode DEBUG] CLAUDE CLI MODE - sending ${messages.length} messages (with history)`);
      messages.forEach((m, i) => {
        console.log(`[SpaceCode DEBUG]   [${i}] ${m.role}: ${(m.content || '').substring(0, 80)}...`);
      });
      // Use streaming for real-time response display
      response = await p.streamMessage(messages, fullSystemPrompt, (chunk: string) => {
        this.emit('chunk', { provider, chunk, chatId });
      });
    } else {
      // CLAUDE API or GPT: Pass full history manually
      const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];

      // Add history
      for (const msg of history) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
        }
      }

      // Add current message
      messages.push({ role: 'user', content: message });

      console.log(`[SpaceCode DEBUG] API MODE (${provider}) - sending ${messages.length} total messages`);
      messages.forEach((m, i) => {
        console.log(`[SpaceCode DEBUG]   [${i}] ${m.role}: ${(m.content || '').substring(0, 80)}...`);
      });
      // Use streaming for real-time response display
      response = await p.streamMessage(messages, fullSystemPrompt, (chunk: string) => {
        this.emit('chunk', { provider, chunk, chatId });
      });
    }

    this.addTurn(provider, response.content, response, chatId);
    return response;
  }

  private async sendToProvider(
    provider: 'claude' | 'gpt',
    messages: AIMessage[],
    systemPrompt?: string
  ): Promise<AIResponse> {
    const p = provider === 'claude' ? this.claudeProvider : this.gptProvider;
    if (!p) {
      throw new Error(`${provider} provider not set`);
    }

    // Add workspace context to system prompt
    const fullSystemPrompt = systemPrompt
      ? `${this.getWorkspaceContext()}${systemPrompt}`
      : this.getWorkspaceContext().trim() || undefined;

    return p.sendMessage(messages, fullSystemPrompt);
  }

  private addTurn(
    provider: 'claude' | 'gpt' | 'user',
    message: string,
    response?: AIResponse,
    chatId?: string
  ): void {
    const turn: ConversationTurn = {
      turnNumber: this.turns.length + 1,
      provider,
      message,
      response,
      timestamp: Date.now(),
      chatId,
    };

    this.turns.push(turn);
    this.emit('turn', turn);
  }

  private buildMessages(forProvider: 'claude' | 'gpt'): AIMessage[] {
    const messages: AIMessage[] = [];

    for (const turn of this.turns) {
      if (turn.provider === forProvider) {
        messages.push({ role: 'assistant', content: turn.message });
      } else if (turn.provider !== 'user') {
        // Other AI's message becomes a user message for context
        messages.push({ role: 'user', content: turn.message });
      } else {
        messages.push({ role: 'user', content: turn.message });
      }
    }

    return messages;
  }

  private isConversationConcluding(content: string): boolean {
    const conclusionIndicators = [
      'i agree with all',
      'we seem to be in agreement',
      'i think we\'ve covered',
      'to summarize our discussion',
      'in conclusion',
      'we\'ve reached a consensus',
      'nothing more to add',
    ];

    const lowerContent = content.toLowerCase();
    return conclusionIndicators.some(indicator => lowerContent.includes(indicator));
  }

  /**
   * Clear conversation history
   */
  clear(): void {
    this.turns = [];
    this.shouldStop = false;
  }
}
