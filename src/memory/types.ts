/**
 * Memory Module Types
 *
 * Type definitions for the SpaceCode memory system.
 * Implements hybrid RAG with dense (embeddings) + sparse (BM25) retrieval.
 */

/**
 * Message role in conversation
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * Stored message in chat history
 */
export interface StoredMessage {
  id: number;
  sessionId: string;
  workspacePath?: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  tags?: string[];
  metadata?: MessageMetadata;
}

/**
 * Metadata attached to messages
 */
export interface MessageMetadata {
  filesMentioned?: string[];
  codeBlocks?: CodeBlockInfo[];
  sectorId?: string;
  ticketId?: string;
  agentId?: string;
  tokensUsed?: number;
}

/**
 * Code block extracted from message
 */
export interface CodeBlockInfo {
  language: string;
  content: string;
  startLine?: number;
  filePath?: string;
}

/**
 * Input for creating a new message
 */
export interface MessageInput {
  sessionId: string;
  workspacePath?: string;
  role: MessageRole;
  content: string;
  tags?: string[];
  metadata?: MessageMetadata;
}

/**
 * Chunk of content with embedding
 */
export interface EmbeddedChunk {
  id: string;
  sourceId: string;
  sourceType: ChunkSourceType;
  content: string;
  contentType: ChunkContentType;
  embedding: Float32Array;
  keywords: string[];
  chunkIndex: number;
  tokenCount: number;
  metadata?: ChunkMetadata;
  createdAt: Date;
}

/**
 * Source type for chunks
 */
export type ChunkSourceType = 'message' | 'document' | 'code' | 'kb_entry';

/**
 * Content type for chunks
 */
export type ChunkContentType = 'prose' | 'code' | 'table' | 'list' | 'mixed';

/**
 * Chunk metadata
 */
export interface ChunkMetadata {
  title?: string;
  url?: string;
  filePath?: string;
  language?: string;
  sectorId?: string;
  domainTags?: string[];
  version?: string;
}

/**
 * Input for creating a chunk
 */
export interface ChunkInput {
  sourceId: string;
  sourceType: ChunkSourceType;
  content: string;
  contentType: ChunkContentType;
  keywords?: string[];
  chunkIndex: number;
  tokenCount: number;
  metadata?: ChunkMetadata;
}

/**
 * Result from vector similarity search
 */
export interface VectorSearchResult {
  chunk: EmbeddedChunk;
  similarity: number;
}

/**
 * Result from keyword (FTS5) search
 */
export interface KeywordSearchResult {
  chunk: EmbeddedChunk;
  score: number;
  highlights?: string[];
}

/**
 * Result from hybrid search (combined dense + sparse)
 */
export interface HybridSearchResult {
  chunk: EmbeddedChunk;
  score: number;
  vectorRank: number;
  keywordRank: number;
  source: 'vector' | 'keyword' | 'both';
}

/**
 * Query for retrieval
 */
export interface RetrievalQuery {
  text: string;
  embedding?: Float32Array;
  filters?: RetrievalFilters;
  limit?: number;
}

/**
 * Filters for retrieval
 */
export interface RetrievalFilters {
  sourceTypes?: ChunkSourceType[];
  sectorIds?: string[];
  domainTags?: string[];
  minDate?: Date;
  maxDate?: Date;
  excludeIds?: string[];
}

/**
 * Context budget configuration
 */
export interface ContextBudgetConfig {
  maxTotalTokens: number;
  recentMessagesRatio: number;      // 0.30 = 30%
  retrievedChunksRatio: number;     // 0.50 = 50%
  specialistKbRatio: number;        // 0.15 = 15%
  systemPromptRatio: number;        // 0.05 = 5%
  minChunkRelevanceScore: number;   // 0.7
  maxChunksPerSource: number;       // 3
  deduplicationThreshold: number;   // 0.9
}

/**
 * Default context budget
 */
export const DEFAULT_CONTEXT_BUDGET: ContextBudgetConfig = {
  maxTotalTokens: 8000,
  recentMessagesRatio: 0.30,
  retrievedChunksRatio: 0.50,
  specialistKbRatio: 0.15,
  systemPromptRatio: 0.05,
  minChunkRelevanceScore: 0.7,
  maxChunksPerSource: 3,
  deduplicationThreshold: 0.9,
};

/**
 * Assembled context for AI prompt
 */
export interface AssembledContext {
  recentMessages: StoredMessage[];
  retrievedChunks: HybridSearchResult[];
  specialistContext?: string;
  systemPrompt?: string;
  totalTokens: number;
  tokenBreakdown: {
    recentMessages: number;
    retrievedChunks: number;
    specialistContext: number;
    systemPrompt: number;
  };
}

/**
 * Query complexity levels
 */
export type QueryComplexity = 'simple' | 'code_reference' | 'complex' | 'architecture';

/**
 * Dynamic budget adjustment based on query complexity
 */
export interface DynamicBudgetAdjustment {
  complexity: QueryComplexity;
  ragChunks: { min: number; max: number };
  kbChunks: { min: number; max: number };
  recentMessages: number;
}

/**
 * Dynamic budget adjustments by complexity
 */
export const DYNAMIC_BUDGET_ADJUSTMENTS: Record<QueryComplexity, DynamicBudgetAdjustment> = {
  simple: {
    complexity: 'simple',
    ragChunks: { min: 1, max: 2 },
    kbChunks: { min: 0, max: 1 },
    recentMessages: 3,
  },
  code_reference: {
    complexity: 'code_reference',
    ragChunks: { min: 3, max: 5 },
    kbChunks: { min: 1, max: 2 },
    recentMessages: 5,
  },
  complex: {
    complexity: 'complex',
    ragChunks: { min: 5, max: 8 },
    kbChunks: { min: 2, max: 3 },
    recentMessages: 8,
  },
  architecture: {
    complexity: 'architecture',
    ragChunks: { min: 8, max: 10 },
    kbChunks: { min: 3, max: 5 },
    recentMessages: 10,
  },
};

/**
 * Memory statistics
 */
export interface MemoryStats {
  totalMessages: number;
  totalChunks: number;
  totalEmbeddings: number;
  storageSize: {
    messages: number;
    vectors: number;
    fts: number;
  };
  lastUpdated: Date;
}

/**
 * Embedding model configuration
 */
export interface EmbeddingModelConfig {
  modelId: string;
  dimensions: number;
  maxTokens: number;
}

/**
 * Supported embedding models
 */
export const EMBEDDING_MODELS: Record<string, EmbeddingModelConfig> = {
  'all-MiniLM-L6-v2': {
    modelId: 'Xenova/all-MiniLM-L6-v2',
    dimensions: 384,
    maxTokens: 256,
  },
  'all-MiniLM-L12-v2': {
    modelId: 'Xenova/all-MiniLM-L12-v2',
    dimensions: 384,
    maxTokens: 256,
  },
  'bge-small-en-v1.5': {
    modelId: 'Xenova/bge-small-en-v1.5',
    dimensions: 384,
    maxTokens: 512,
  },
  'bge-base-en-v1.5': {
    modelId: 'Xenova/bge-base-en-v1.5',
    dimensions: 768,
    maxTokens: 512,
  },
};

/**
 * Reciprocal Rank Fusion parameters
 */
export interface RRFConfig {
  k: number;              // Constant to prevent division by zero, typically 60
  vectorWeight: number;   // Weight for vector search results (0-1)
  keywordWeight: number;  // Weight for keyword search results (0-1)
}

/**
 * Default RRF configuration
 */
export const DEFAULT_RRF_CONFIG: RRFConfig = {
  k: 60,
  vectorWeight: 0.6,
  keywordWeight: 0.4,
};
