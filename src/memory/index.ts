/**
 * Memory Module
 *
 * Provides hybrid RAG (Retrieval-Augmented Generation) capabilities
 * combining dense (vector) and sparse (BM25) retrieval.
 *
 * Components:
 * - MessageStore: SQLite + FTS5 for chat history
 * - EmbeddingService: ONNX-based text embeddings
 * - VectorStore: SQLite-based vector storage with JS similarity
 * - HybridRetriever: RRF fusion of dense + sparse search
 * - ContextAssembler: Token budget management
 */

// Types
export * from './types';

// Message Store (SQLite + FTS5)
export { MessageStore, messageStore } from './MessageStore';

// Embedding Service (ONNX wrapper)
export { EmbeddingService, embeddingService, ChunkingConfig } from './EmbeddingService';

// Vector Store (SQLite + JS similarity)
export { VectorStore, vectorStore } from './VectorStore';

// Hybrid Retriever (RRF fusion)
export { HybridRetriever, hybridRetriever, RetrievalStats } from './HybridRetriever';

// Context Assembler (budget management)
export { ContextAssembler, contextAssembler, ContextAssemblyOptions } from './ContextAssembler';

import * as vscode from 'vscode';
import { messageStore } from './MessageStore';
import { embeddingService } from './EmbeddingService';
import { vectorStore } from './VectorStore';

/**
 * Initialize all memory services
 */
export async function initializeMemory(context: vscode.ExtensionContext): Promise<void> {
  await Promise.all([
    messageStore.initialize(context),
    embeddingService.initialize(context),
    vectorStore.initialize(context),
  ]);
}

/**
 * Close all memory services
 */
export function closeMemory(): void {
  messageStore.close();
  vectorStore.close();
}

/**
 * Get memory statistics
 */
export function getMemoryStats(): {
  messages: ReturnType<typeof messageStore.getStats>;
  vectors: ReturnType<typeof vectorStore.getStats>;
  embedding: ReturnType<typeof embeddingService.getStatus>;
} {
  return {
    messages: messageStore.getStats(),
    vectors: vectorStore.getStats(),
    embedding: embeddingService.getStatus(),
  };
}
