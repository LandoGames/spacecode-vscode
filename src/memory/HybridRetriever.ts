/**
 * Hybrid Retriever
 *
 * Combines dense (vector) and sparse (BM25) retrieval using
 * Reciprocal Rank Fusion (RRF) for optimal results.
 */

import {
  EmbeddedChunk,
  HybridSearchResult,
  VectorSearchResult,
  RetrievalQuery,
  RetrievalFilters,
  RRFConfig,
  DEFAULT_RRF_CONFIG,
  QueryComplexity,
  DYNAMIC_BUDGET_ADJUSTMENTS,
} from './types';
import { embeddingService } from './EmbeddingService';
import { vectorStore } from './VectorStore';

/**
 * Retrieval statistics for monitoring
 */
export interface RetrievalStats {
  queryText: string;
  vectorResults: number;
  keywordResults: number;
  hybridResults: number;
  vectorTimeMs: number;
  keywordTimeMs: number;
  fusionTimeMs: number;
  totalTimeMs: number;
}

/**
 * Hybrid Retriever combining dense and sparse search
 */
export class HybridRetriever {
  private config: RRFConfig = DEFAULT_RRF_CONFIG;
  private lastStats: RetrievalStats | null = null;

  /**
   * Set RRF configuration
   */
  setConfig(config: Partial<RRFConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get RRF configuration
   */
  getConfig(): RRFConfig {
    return { ...this.config };
  }

  /**
   * Hybrid search combining vector and keyword retrieval
   */
  async search(query: RetrievalQuery): Promise<HybridSearchResult[]> {
    const startTime = Date.now();
    const limit = query.limit || 10;

    // Get query embedding if not provided
    let queryEmbedding = query.embedding;
    if (!queryEmbedding) {
      queryEmbedding = await embeddingService.embed(query.text) || undefined;
    }

    // Parallel vector and keyword search
    const vectorStart = Date.now();
    let vectorResults: VectorSearchResult[] = [];
    if (queryEmbedding) {
      vectorResults = await vectorStore.search(
        queryEmbedding,
        limit * 2, // Fetch more for fusion
        query.filters
      );
    }
    const vectorTime = Date.now() - vectorStart;

    const keywordStart = Date.now();
    const keywordResults = vectorStore.keywordSearch(
      query.text,
      limit * 2,
      query.filters
    );
    const keywordTime = Date.now() - keywordStart;

    // Fuse results using RRF
    const fusionStart = Date.now();
    const hybridResults = this.reciprocalRankFusion(
      vectorResults,
      keywordResults,
      limit
    );
    const fusionTime = Date.now() - fusionStart;

    // Record stats
    this.lastStats = {
      queryText: query.text.slice(0, 100),
      vectorResults: vectorResults.length,
      keywordResults: keywordResults.length,
      hybridResults: hybridResults.length,
      vectorTimeMs: vectorTime,
      keywordTimeMs: keywordTime,
      fusionTimeMs: fusionTime,
      totalTimeMs: Date.now() - startTime,
    };

    return hybridResults;
  }

  /**
   * Reciprocal Rank Fusion algorithm
   *
   * Combines ranked lists from multiple sources.
   * Formula: score = Σ (weight / (k + rank))
   */
  private reciprocalRankFusion(
    vectorResults: VectorSearchResult[],
    keywordResults: { chunk: EmbeddedChunk; score: number }[],
    limit: number
  ): HybridSearchResult[] {
    const { k, vectorWeight, keywordWeight } = this.config;

    // Map to track combined scores
    const scoreMap = new Map<string, {
      chunk: EmbeddedChunk;
      score: number;
      vectorRank: number;
      keywordRank: number;
      source: 'vector' | 'keyword' | 'both';
    }>();

    // Process vector results
    vectorResults.forEach((result, index) => {
      const rank = index + 1;
      const rrfScore = vectorWeight / (k + rank);

      const existing = scoreMap.get(result.chunk.id);
      if (existing) {
        existing.score += rrfScore;
        existing.vectorRank = rank;
        existing.source = 'both';
      } else {
        scoreMap.set(result.chunk.id, {
          chunk: result.chunk,
          score: rrfScore,
          vectorRank: rank,
          keywordRank: 0,
          source: 'vector',
        });
      }
    });

    // Process keyword results
    keywordResults.forEach((result, index) => {
      const rank = index + 1;
      const rrfScore = keywordWeight / (k + rank);

      const existing = scoreMap.get(result.chunk.id);
      if (existing) {
        existing.score += rrfScore;
        existing.keywordRank = rank;
        if (existing.source === 'vector') {
          existing.source = 'both';
        }
      } else {
        scoreMap.set(result.chunk.id, {
          chunk: result.chunk,
          score: rrfScore,
          vectorRank: 0,
          keywordRank: rank,
          source: 'keyword',
        });
      }
    });

    // Sort by combined score
    const results = Array.from(scoreMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => ({
        chunk: item.chunk,
        score: item.score,
        vectorRank: item.vectorRank,
        keywordRank: item.keywordRank,
        source: item.source,
      }));

    return results;
  }

  /**
   * Classify query complexity for dynamic budget adjustment
   */
  classifyQuery(query: string): QueryComplexity {
    const lowercased = query.toLowerCase();

    // Architecture/design queries
    const architecturePatterns = [
      /how (should|do) (i|we) (design|architect|structure|organize)/,
      /best (practice|approach|pattern|way) (for|to)/,
      /trade.?offs?/,
      /comparison|compare|versus|vs\.?/,
      /refactor|redesign|restructure/,
    ];

    if (architecturePatterns.some(p => p.test(lowercased))) {
      return 'architecture';
    }

    // Code reference queries
    const codePatterns = [
      /where (is|are|does|do)/,
      /find (the|all|every)/,
      /show (me|the)/,
      /how (does|do|is)/,
      /what (is|are|does|do)/,
      /\.(cs|ts|js|py|java)\b/,
      /function|class|method|interface|type|variable/,
    ];

    if (codePatterns.some(p => p.test(lowercased))) {
      return 'code_reference';
    }

    // Complex queries (multiple questions, long)
    const hasMultipleQuestions = (query.match(/\?/g) || []).length > 1;
    const isLong = query.split(/\s+/).length > 20;

    if (hasMultipleQuestions || isLong) {
      return 'complex';
    }

    // Default to simple
    return 'simple';
  }

  /**
   * Get recommended retrieval limits based on query complexity
   */
  getRetrievalLimits(complexity: QueryComplexity): {
    ragChunks: number;
    kbChunks: number;
    recentMessages: number;
  } {
    const adjustment = DYNAMIC_BUDGET_ADJUSTMENTS[complexity];
    return {
      ragChunks: adjustment.ragChunks.max,
      kbChunks: adjustment.kbChunks.max,
      recentMessages: adjustment.recentMessages,
    };
  }

  /**
   * Semantic search only (no keyword)
   */
  async semanticSearch(
    query: string,
    limit: number = 10,
    filters?: RetrievalFilters
  ): Promise<VectorSearchResult[]> {
    const embedding = await embeddingService.embed(query);
    if (!embedding) return [];

    return vectorStore.search(embedding, limit, filters);
  }

  /**
   * Keyword search only (no semantic)
   */
  keywordSearch(
    query: string,
    limit: number = 10,
    filters?: RetrievalFilters
  ): { chunk: EmbeddedChunk; score: number }[] {
    return vectorStore.keywordSearch(query, limit, filters);
  }

  /**
   * Get last retrieval statistics
   */
  getLastStats(): RetrievalStats | null {
    return this.lastStats ? { ...this.lastStats } : null;
  }

  /**
   * Apply recency boost to results
   *
   * Boosts recent chunks using exponential decay.
   * Formula: boost = e^(-days/30)
   */
  applyRecencyBoost(
    results: HybridSearchResult[],
    decayDays: number = 30
  ): HybridSearchResult[] {
    const now = Date.now();
    const msPerDay = 24 * 60 * 60 * 1000;

    return results.map(result => {
      const ageMs = now - result.chunk.createdAt.getTime();
      const ageDays = ageMs / msPerDay;
      const boost = Math.exp(-ageDays / decayDays);

      return {
        ...result,
        score: result.score * (1 + boost * 0.2), // Max 20% boost for recent content
      };
    }).sort((a, b) => b.score - a.score);
  }

  /**
   * Apply sector relevance boost
   *
   * Boosts chunks matching the current sector.
   */
  applySectorBoost(
    results: HybridSearchResult[],
    currentSectorId: string,
    boostFactor: number = 1.2
  ): HybridSearchResult[] {
    return results.map(result => {
      if (result.chunk.metadata?.sectorId === currentSectorId) {
        return {
          ...result,
          score: result.score * boostFactor,
        };
      }
      return result;
    }).sort((a, b) => b.score - a.score);
  }

  /**
   * Apply code boost (prefer code over prose)
   */
  applyCodeBoost(
    results: HybridSearchResult[],
    boostFactor: number = 1.5
  ): HybridSearchResult[] {
    return results.map(result => {
      if (result.chunk.contentType === 'code') {
        return {
          ...result,
          score: result.score * boostFactor,
        };
      }
      return result;
    }).sort((a, b) => b.score - a.score);
  }

  /**
   * Deduplicate results based on content similarity
   */
  deduplicateResults(
    results: HybridSearchResult[],
    similarityThreshold: number = 0.9
  ): HybridSearchResult[] {
    const deduplicated: HybridSearchResult[] = [];

    for (const result of results) {
      // Check if this chunk is too similar to any already included
      let isDuplicate = false;

      for (const existing of deduplicated) {
        const similarity = embeddingService.cosineSimilarity(
          result.chunk.embedding,
          existing.chunk.embedding
        );

        if (similarity >= similarityThreshold) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        deduplicated.push(result);
      }
    }

    return deduplicated;
  }

  /**
   * Cap results per source to prevent single-source dominance
   */
  capResultsPerSource(
    results: HybridSearchResult[],
    maxPerSource: number = 3
  ): HybridSearchResult[] {
    const sourceCount = new Map<string, number>();
    const capped: HybridSearchResult[] = [];

    for (const result of results) {
      const count = sourceCount.get(result.chunk.sourceId) || 0;

      if (count < maxPerSource) {
        capped.push(result);
        sourceCount.set(result.chunk.sourceId, count + 1);
      }
    }

    return capped;
  }
}

/**
 * Singleton instance
 */
export const hybridRetriever = new HybridRetriever();
