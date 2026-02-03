/**
 * Context Assembler
 *
 * Manages token budget and assembles context for AI prompts.
 * Combines recent messages, retrieved chunks, specialist KB, and system prompt.
 */

import {
  StoredMessage,
  HybridSearchResult,
  AssembledContext,
  ContextBudgetConfig,
  DEFAULT_CONTEXT_BUDGET,
  QueryComplexity,
  DYNAMIC_BUDGET_ADJUSTMENTS,
} from './types';
import { messageStore } from './MessageStore';
import { hybridRetriever } from './HybridRetriever';
import { embeddingService } from './EmbeddingService';

/**
 * Context assembly options
 */
export interface ContextAssemblyOptions {
  query: string;
  sessionId: string;
  workspacePath?: string;
  sectorId?: string;
  specialistContext?: string;
  systemPrompt?: string;
  budgetOverrides?: Partial<ContextBudgetConfig>;
}

/**
 * Context Assembler for managing token budgets
 */
export class ContextAssembler {
  private config: ContextBudgetConfig = DEFAULT_CONTEXT_BUDGET;

  /**
   * Set budget configuration
   */
  setConfig(config: Partial<ContextBudgetConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get budget configuration
   */
  getConfig(): ContextBudgetConfig {
    return { ...this.config };
  }

  /**
   * Assemble context for an AI prompt
   */
  async assembleContext(options: ContextAssemblyOptions): Promise<AssembledContext> {
    const config = { ...this.config, ...options.budgetOverrides };

    // Calculate token budgets with NaN protection
    const maxTokens = config.maxTotalTokens || DEFAULT_CONTEXT_BUDGET.maxTotalTokens;
    const systemPromptBudget = Math.floor(maxTokens * (config.systemPromptRatio || 0.05)) || 0;
    const specialistBudget = Math.floor(maxTokens * (config.specialistKbRatio || 0.15)) || 0;
    const recentMessagesBudget = Math.floor(maxTokens * (config.recentMessagesRatio || 0.30)) || 0;
    const retrievedChunksBudget = Math.floor(maxTokens * (config.retrievedChunksRatio || 0.50)) || 0;

    // Classify query complexity for dynamic adjustment
    const complexity = hybridRetriever.classifyQuery(options.query);
    const limits = hybridRetriever.getRetrievalLimits(complexity);

    // 1. Assemble system prompt (highest priority, fixed allocation)
    let systemPromptTokens = 0;
    if (options.systemPrompt) {
      systemPromptTokens = this.estimateTokens(options.systemPrompt);
      // Truncate if necessary
      if (systemPromptTokens > systemPromptBudget) {
        options.systemPrompt = this.truncateToTokens(options.systemPrompt, systemPromptBudget);
        systemPromptTokens = systemPromptBudget;
      }
    }

    // 2. Assemble specialist context
    let specialistContextTokens = 0;
    if (options.specialistContext) {
      specialistContextTokens = this.estimateTokens(options.specialistContext);
      if (specialistContextTokens > specialistBudget) {
        options.specialistContext = this.truncateToTokens(options.specialistContext, specialistBudget);
        specialistContextTokens = specialistBudget;
      }
    }

    // 3. Get recent messages
    const recentMessages = this.selectRecentMessages(
      options.sessionId,
      options.workspacePath,
      recentMessagesBudget,
      limits.recentMessages
    );
    const recentMessagesTokens = recentMessages.reduce(
      (sum, msg) => sum + this.estimateTokens(msg.content),
      0
    );

    // 4. Retrieve relevant chunks
    let retrievedChunks = await this.retrieveChunks(
      options.query,
      options.sectorId,
      retrievedChunksBudget,
      limits.ragChunks,
      config
    );
    const retrievedChunksTokens = retrievedChunks.reduce(
      (sum, result) => sum + result.chunk.tokenCount,
      0
    );

    return {
      recentMessages,
      retrievedChunks,
      specialistContext: options.specialistContext,
      systemPrompt: options.systemPrompt,
      totalTokens: systemPromptTokens + specialistContextTokens + recentMessagesTokens + retrievedChunksTokens,
      tokenBreakdown: {
        recentMessages: recentMessagesTokens,
        retrievedChunks: retrievedChunksTokens,
        specialistContext: specialistContextTokens,
        systemPrompt: systemPromptTokens,
      },
    };
  }

  /**
   * Select recent messages within token budget
   */
  private selectRecentMessages(
    sessionId: string,
    workspacePath: string | undefined,
    budgetTokens: number,
    maxMessages: number
  ): StoredMessage[] {
    // Get messages from current session first
    const sessionMessages = messageStore.getSessionMessages(sessionId, maxMessages * 2);

    // Also get workspace-wide recent messages for context
    const workspaceMessages = workspacePath
      ? messageStore.getRecentMessages(maxMessages, workspacePath)
      : [];

    // Combine and deduplicate
    const allMessages = [...sessionMessages];
    const seenIds = new Set(sessionMessages.map(m => m.id));

    for (const msg of workspaceMessages) {
      if (!seenIds.has(msg.id)) {
        allMessages.push(msg);
        seenIds.add(msg.id);
      }
    }

    // Sort by timestamp (most recent last)
    allMessages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Select messages within budget (prioritize most recent)
    const selected: StoredMessage[] = [];
    let usedTokens = 0;

    // Start from the end (most recent)
    for (let i = allMessages.length - 1; i >= 0 && selected.length < maxMessages; i--) {
      const msg = allMessages[i];
      const msgTokens = this.estimateTokens(msg.content);

      if (usedTokens + msgTokens <= budgetTokens) {
        selected.unshift(msg); // Add to front to maintain order
        usedTokens += msgTokens;
      }
    }

    return selected;
  }

  /**
   * Retrieve relevant chunks using hybrid search
   */
  private async retrieveChunks(
    query: string,
    sectorId: string | undefined,
    budgetTokens: number,
    maxChunks: number,
    config: ContextBudgetConfig
  ): Promise<HybridSearchResult[]> {
    // Perform hybrid search
    let results = await hybridRetriever.search({
      text: query,
      limit: maxChunks * 2, // Fetch more for filtering
      filters: sectorId ? { sectorIds: [sectorId] } : undefined,
    });

    // Apply quality filters
    results = results.filter(r => r.score >= config.minChunkRelevanceScore);

    // Apply deduplication
    results = hybridRetriever.deduplicateResults(results, config.deduplicationThreshold);

    // Cap results per source
    results = hybridRetriever.capResultsPerSource(results, config.maxChunksPerSource);

    // Apply sector boost if applicable
    if (sectorId) {
      results = hybridRetriever.applySectorBoost(results, sectorId);
    }

    // Select within token budget
    const selected: HybridSearchResult[] = [];
    let usedTokens = 0;

    for (const result of results) {
      if (usedTokens + result.chunk.tokenCount <= budgetTokens && selected.length < maxChunks) {
        selected.push(result);
        usedTokens += result.chunk.tokenCount;
      }
    }

    return selected;
  }

  /**
   * Estimate token count for text
   */
  estimateTokens(text: string): number {
    return embeddingService.estimateTokens(text);
  }

  /**
   * Truncate text to approximate token count
   */
  truncateToTokens(text: string, maxTokens: number): string {
    const targetChars = maxTokens * 4; // ~4 chars per token
    if (text.length <= targetChars) return text;

    // Try to truncate at a sentence boundary
    const truncated = text.slice(0, targetChars);
    const lastPeriod = truncated.lastIndexOf('.');
    const lastNewline = truncated.lastIndexOf('\n');
    const cutPoint = Math.max(lastPeriod, lastNewline);

    if (cutPoint > targetChars * 0.7) {
      return text.slice(0, cutPoint + 1);
    }

    return truncated + '...';
  }

  /**
   * Format context as a prompt string
   */
  formatAsPrompt(context: AssembledContext): string {
    const sections: string[] = [];

    // System prompt
    if (context.systemPrompt) {
      sections.push(context.systemPrompt);
    }

    // Specialist context
    if (context.specialistContext) {
      sections.push('## Specialist Knowledge\n\n' + context.specialistContext);
    }

    // Retrieved chunks
    if (context.retrievedChunks.length > 0) {
      const chunksText = context.retrievedChunks
        .map((result, i) => {
          const meta = result.chunk.metadata;
          const header = meta?.title || result.chunk.sourceId;
          return `### ${i + 1}. ${header}\n\n${result.chunk.content}`;
        })
        .join('\n\n---\n\n');

      sections.push('## Relevant Context\n\n' + chunksText);
    }

    // Recent conversation
    if (context.recentMessages.length > 0) {
      const messagesText = context.recentMessages
        .map(msg => `**${msg.role}:** ${msg.content}`)
        .join('\n\n');

      sections.push('## Recent Conversation\n\n' + messagesText);
    }

    return sections.join('\n\n---\n\n');
  }

  /**
   * Get budget summary for debugging
   */
  getBudgetSummary(context: AssembledContext): string {
    const { tokenBreakdown, totalTokens } = context;
    const config = this.config;
    const totalForPercent = totalTokens > 0 ? totalTokens : 1;

    return `
Token Budget Summary:
- Max Budget: ${config.maxTotalTokens}
- Used: ${totalTokens} (${((totalTokens / config.maxTotalTokens) * 100).toFixed(1)}%)

Breakdown:
- System Prompt: ${tokenBreakdown.systemPrompt} (${((tokenBreakdown.systemPrompt / totalForPercent) * 100).toFixed(1)}%)
- Specialist KB: ${tokenBreakdown.specialistContext} (${((tokenBreakdown.specialistContext / totalForPercent) * 100).toFixed(1)}%)
- Recent Messages: ${tokenBreakdown.recentMessages} (${((tokenBreakdown.recentMessages / totalForPercent) * 100).toFixed(1)}%)
- Retrieved Chunks: ${tokenBreakdown.retrievedChunks} (${((tokenBreakdown.retrievedChunks / totalForPercent) * 100).toFixed(1)}%)

Items:
- Messages: ${context.recentMessages.length}
- Chunks: ${context.retrievedChunks.length}
`.trim();
  }

  /**
   * Optimize context when approaching budget limit
   */
  optimizeContext(
    context: AssembledContext,
    targetTokens: number
  ): AssembledContext {
    let current = { ...context };
    let currentTokens = current.totalTokens;

    while (currentTokens > targetTokens) {
      // Strategy 1: Remove lowest-scoring chunks
      if (current.retrievedChunks.length > 1) {
        const removed = current.retrievedChunks.pop()!;
        currentTokens -= removed.chunk.tokenCount;
        current.tokenBreakdown.retrievedChunks -= removed.chunk.tokenCount;
        continue;
      }

      // Strategy 2: Truncate specialist context
      if (current.specialistContext && current.tokenBreakdown.specialistContext > 100) {
        const newBudget = Math.floor(current.tokenBreakdown.specialistContext * 0.7);
        current.specialistContext = this.truncateToTokens(current.specialistContext, newBudget);
        const newTokens = this.estimateTokens(current.specialistContext);
        currentTokens -= (current.tokenBreakdown.specialistContext - newTokens);
        current.tokenBreakdown.specialistContext = newTokens;
        continue;
      }

      // Strategy 3: Remove oldest messages
      if (current.recentMessages.length > 2) {
        const removed = current.recentMessages.shift()!;
        const removedTokens = this.estimateTokens(removed.content);
        currentTokens -= removedTokens;
        current.tokenBreakdown.recentMessages -= removedTokens;
        continue;
      }

      // Can't optimize further
      break;
    }

    current.totalTokens = currentTokens;
    return current;
  }
}

/**
 * Singleton instance
 */
export const contextAssembler = new ContextAssembler();
