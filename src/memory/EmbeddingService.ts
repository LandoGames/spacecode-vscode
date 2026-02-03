/**
 * Embedding Service
 *
 * Wrapper around the existing embedder service with additional functionality
 * for the memory module: batch embedding, token counting, and chunking.
 */

import * as vscode from 'vscode';
import {
  embedderService,
  EmbeddingChunk as LegacyChunk,
  EmbedderStatus,
  DownloadProgress,
  AVAILABLE_MODELS,
} from '../mastercode_port/services/embedder';
import {
  EmbeddedChunk,
  ChunkInput,
  ChunkSourceType,
  ChunkContentType,
  ChunkMetadata,
  EmbeddingModelConfig,
  EMBEDDING_MODELS,
} from './types';

/**
 * Chunking configuration
 */
export interface ChunkingConfig {
  maxTokens: number;
  overlapTokens: number;
  respectBoundaries: boolean;
}

const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
  maxTokens: 500,
  overlapTokens: 50,
  respectBoundaries: true,
};

/**
 * Embedding Service for the memory module
 */
export class EmbeddingService {
  private context: vscode.ExtensionContext | null = null;
  private initialized = false;
  private chunkingConfig: ChunkingConfig = DEFAULT_CHUNKING_CONFIG;

  /**
   * Initialize the embedding service
   */
  async initialize(context: vscode.ExtensionContext): Promise<void> {
    if (this.initialized) return;

    this.context = context;
    await embedderService.initialize(context);
    this.initialized = true;
  }

  /**
   * Check if the model is ready
   */
  isReady(): boolean {
    return embedderService.isModelDownloaded();
  }

  /**
   * Get current status
   */
  getStatus(): EmbedderStatus {
    return embedderService.getStatus();
  }

  /**
   * Download and load the embedding model
   */
  async downloadModel(
    modelId?: string,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<{ success: boolean; error?: string }> {
    return embedderService.downloadModel(modelId, onProgress);
  }

  /**
   * Set the current model
   */
  async setModel(modelId: string): Promise<void> {
    return embedderService.setCurrentModel(modelId);
  }

  /**
   * Get available models
   */
  getAvailableModels() {
    return AVAILABLE_MODELS;
  }

  /**
   * Embed a single text
   */
  async embed(text: string): Promise<Float32Array | null> {
    const result = await embedderService.embed(text);
    if (!result) return null;
    return new Float32Array(result);
  }

  /**
   * Embed multiple texts in batch
   */
  async embedBatch(
    texts: string[],
    onProgress?: (current: number, total: number) => void
  ): Promise<(Float32Array | null)[]> {
    const results: (Float32Array | null)[] = [];

    for (let i = 0; i < texts.length; i++) {
      onProgress?.(i + 1, texts.length);
      const embedding = await this.embed(texts[i]);
      results.push(embedding);
    }

    return results;
  }

  /**
   * Estimate token count for text (approximate)
   * Uses simple character-based estimation: ~4 chars per token
   */
  estimateTokens(text: string): number {
    if (!text || typeof text !== 'string') {
      return 0;
    }
    return Math.ceil(text.length / 4);
  }

  /**
   * Smart chunking that respects content boundaries
   */
  chunkText(
    text: string,
    sourceId: string,
    sourceType: ChunkSourceType,
    config: Partial<ChunkingConfig> = {}
  ): ChunkInput[] {
    const cfg = { ...this.chunkingConfig, ...config };
    const chunks: ChunkInput[] = [];

    // Convert token limits to character limits (approximate)
    const maxChars = cfg.maxTokens * 4;
    const overlapChars = cfg.overlapTokens * 4;

    if (cfg.respectBoundaries) {
      // Smart chunking that respects paragraph/code boundaries
      return this.smartChunk(text, sourceId, sourceType, maxChars, overlapChars);
    } else {
      // Simple fixed-size chunking
      return this.fixedChunk(text, sourceId, sourceType, maxChars, overlapChars);
    }
  }

  /**
   * Smart chunking that respects natural boundaries
   */
  private smartChunk(
    text: string,
    sourceId: string,
    sourceType: ChunkSourceType,
    maxChars: number,
    overlapChars: number
  ): ChunkInput[] {
    const chunks: ChunkInput[] = [];

    // Detect content type
    const contentType = this.detectContentType(text);

    // Split by natural boundaries based on content type
    let segments: string[];
    if (contentType === 'code') {
      // Split code by function/class boundaries or double newlines
      segments = text.split(/(?=\n(?:function|class|export|def |async function|public |private |protected ))/);
    } else {
      // Split prose by paragraphs
      segments = text.split(/\n\n+/);
    }

    let currentChunk = '';
    let chunkIndex = 0;

    for (const segment of segments) {
      const trimmedSegment = segment.trim();
      if (!trimmedSegment) continue;

      // If adding this segment would exceed max, save current chunk
      if (currentChunk.length + trimmedSegment.length > maxChars && currentChunk.length > 0) {
        chunks.push(this.createChunkInput(
          currentChunk.trim(),
          sourceId,
          sourceType,
          contentType,
          chunkIndex++
        ));

        // Start new chunk with overlap
        if (overlapChars > 0) {
          const overlapStart = Math.max(0, currentChunk.length - overlapChars);
          currentChunk = currentChunk.slice(overlapStart) + '\n\n' + trimmedSegment;
        } else {
          currentChunk = trimmedSegment;
        }
      } else {
        // Add to current chunk
        if (currentChunk.length > 0) {
          currentChunk += '\n\n';
        }
        currentChunk += trimmedSegment;
      }
    }

    // Don't forget the last chunk
    if (currentChunk.trim().length > 0) {
      chunks.push(this.createChunkInput(
        currentChunk.trim(),
        sourceId,
        sourceType,
        contentType,
        chunkIndex
      ));
    }

    return chunks;
  }

  /**
   * Fixed-size chunking
   */
  private fixedChunk(
    text: string,
    sourceId: string,
    sourceType: ChunkSourceType,
    maxChars: number,
    overlapChars: number
  ): ChunkInput[] {
    const chunks: ChunkInput[] = [];
    const contentType = this.detectContentType(text);

    let start = 0;
    let chunkIndex = 0;

    while (start < text.length) {
      const end = Math.min(start + maxChars, text.length);
      const content = text.slice(start, end).trim();

      if (content.length > 0) {
        chunks.push(this.createChunkInput(
          content,
          sourceId,
          sourceType,
          contentType,
          chunkIndex++
        ));
      }

      // Move start, accounting for overlap
      start = end - overlapChars;
      if (start >= text.length - overlapChars) break;
    }

    return chunks;
  }

  /**
   * Create a ChunkInput object
   */
  private createChunkInput(
    content: string,
    sourceId: string,
    sourceType: ChunkSourceType,
    contentType: ChunkContentType,
    chunkIndex: number
  ): ChunkInput {
    return {
      sourceId,
      sourceType,
      content,
      contentType,
      keywords: this.extractKeywords(content),
      chunkIndex,
      tokenCount: this.estimateTokens(content),
    };
  }

  /**
   * Detect content type from text
   */
  private detectContentType(text: string): ChunkContentType {
    // Check for code indicators
    const codeIndicators = [
      /^(import|export|const|let|var|function|class|interface|type|enum)\s/m,
      /[{};]\s*$/m,
      /^\s*(public|private|protected|static|async|await)\s/m,
      /=>/,
      /\(\s*\)\s*{/,
    ];

    const codeScore = codeIndicators.reduce(
      (score, pattern) => score + (pattern.test(text) ? 1 : 0),
      0
    );

    if (codeScore >= 2) return 'code';

    // Check for table
    if (/^\s*\|.*\|.*\|/m.test(text)) return 'table';

    // Check for list
    if (/^\s*[-*•]\s+/m.test(text) || /^\s*\d+\.\s+/m.test(text)) return 'list';

    // Check if it's a mix
    if (codeScore === 1) return 'mixed';

    return 'prose';
  }

  /**
   * Extract keywords from text for BM25 indexing
   */
  extractKeywords(text: string): string[] {
    // Simple keyword extraction
    // Remove common words and extract significant terms

    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
      'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their',
      'we', 'us', 'our', 'you', 'your', 'he', 'him', 'his', 'she', 'her',
      'if', 'then', 'else', 'when', 'where', 'why', 'how', 'all', 'each',
      'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
      'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
    ]);

    // Extract words (including camelCase and snake_case splits)
    const words = text
      .toLowerCase()
      // Split camelCase
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      // Split snake_case
      .replace(/_/g, ' ')
      // Remove special characters except alphanumeric and space
      .replace(/[^a-z0-9\s]/g, ' ')
      // Split by whitespace
      .split(/\s+/)
      // Filter
      .filter(word =>
        word.length >= 3 &&
        word.length <= 30 &&
        !stopWords.has(word) &&
        !/^\d+$/.test(word)
      );

    // Count frequency
    const freq = new Map<string, number>();
    for (const word of words) {
      freq.set(word, (freq.get(word) || 0) + 1);
    }

    // Sort by frequency and take top keywords
    const sorted = Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word]) => word);

    return sorted;
  }

  /**
   * Chunk and embed content
   */
  async chunkAndEmbed(
    text: string,
    sourceId: string,
    sourceType: ChunkSourceType,
    metadata?: ChunkMetadata,
    onProgress?: (current: number, total: number) => void
  ): Promise<EmbeddedChunk[]> {
    const chunkInputs = this.chunkText(text, sourceId, sourceType);
    const embeddedChunks: EmbeddedChunk[] = [];

    for (let i = 0; i < chunkInputs.length; i++) {
      onProgress?.(i + 1, chunkInputs.length);

      const input = chunkInputs[i];
      const embedding = await this.embed(input.content);

      if (embedding) {
        embeddedChunks.push({
          id: `${sourceId}_chunk_${input.chunkIndex}`,
          sourceId: input.sourceId,
          sourceType: input.sourceType,
          content: input.content,
          contentType: input.contentType,
          embedding,
          keywords: input.keywords || [],
          chunkIndex: input.chunkIndex,
          tokenCount: input.tokenCount,
          metadata,
          createdAt: new Date(),
        });
      }
    }

    return embeddedChunks;
  }

  /**
   * Compute cosine similarity between two embeddings
   */
  cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  /**
   * Get embedding dimensions for current model
   */
  getEmbeddingDimensions(): number {
    const model = embedderService.getCurrentModel();
    return model?.dimensions || 384;
  }

  /**
   * Set chunking configuration
   */
  setChunkingConfig(config: Partial<ChunkingConfig>): void {
    this.chunkingConfig = { ...this.chunkingConfig, ...config };
  }
}

/**
 * Singleton instance
 */
export const embeddingService = new EmbeddingService();
