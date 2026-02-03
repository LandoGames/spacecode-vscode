/**
 * Vector Store
 *
 * SQLite-based vector storage with JavaScript-computed similarity.
 * Stores embeddings as binary blobs and computes cosine similarity in JS.
 * Uses sql.js (WebAssembly SQLite) for VSCode extension compatibility.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import {
  EmbeddedChunk,
  ChunkInput,
  ChunkSourceType,
  ChunkContentType,
  ChunkMetadata,
  VectorSearchResult,
  RetrievalFilters,
} from './types';
import { embeddingService } from './EmbeddingService';

/**
 * Vector Store using SQLite with JS-computed similarity
 */
export class VectorStore {
  private db: SqlJsDatabase | null = null;
  private context: vscode.ExtensionContext | null = null;
  private dbPath: string = '';
  private initialized = false;

  // In-memory cache for hot vectors (for fast search)
  private vectorCache: Map<string, { embedding: Float32Array; chunk: EmbeddedChunk }> = new Map();
  private cacheLimit = 10000; // Max vectors to keep in memory

  /**
   * Initialize the vector store
   */
  async initialize(context: vscode.ExtensionContext): Promise<void> {
    if (this.initialized) return;

    this.context = context;
    this.dbPath = path.join(context.globalStorageUri.fsPath, 'vectors.db');

    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Initialize sql.js
    const SQL = await initSqlJs();

    // Load existing database or create new one
    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
    }

    // Create schema
    await this.createSchema();

    // Warm up cache with recent vectors
    await this.warmCache();

    this.initialized = true;
  }

  /**
   * Create database schema
   */
  private async createSchema(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Chunks table with vector storage
    this.db.run(`
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        source_type TEXT NOT NULL,
        content TEXT NOT NULL,
        content_type TEXT NOT NULL,
        embedding BLOB NOT NULL,
        keywords TEXT,
        chunk_index INTEGER NOT NULL,
        token_count INTEGER NOT NULL,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Indexes for filtering
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_chunks_source
      ON chunks(source_id)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_chunks_source_type
      ON chunks(source_type)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_chunks_created
      ON chunks(created_at DESC)
    `);

    // FTS5 for keyword search on chunk content
    this.db.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
        content,
        keywords,
        content='chunks',
        content_rowid='rowid'
      )
    `);

    // Triggers to keep FTS in sync
    this.db.run(`
      CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
        INSERT INTO chunks_fts(rowid, content, keywords)
        VALUES (new.rowid, new.content, new.keywords);
      END
    `);

    this.db.run(`
      CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
        INSERT INTO chunks_fts(chunks_fts, rowid, content, keywords)
        VALUES('delete', old.rowid, old.content, old.keywords);
      END
    `);

    // Save database
    await this.save();
  }

  /**
   * Save database to disk
   */
  private async save(): Promise<void> {
    if (!this.db || !this.dbPath) return;

    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  /**
   * Warm the in-memory cache with recent vectors
   */
  private async warmCache(): Promise<void> {
    if (!this.db) return;

    const result = this.db.exec(`
      SELECT id, source_id, source_type, content, content_type,
             embedding, keywords, chunk_index, token_count, metadata, created_at
      FROM chunks
      ORDER BY created_at DESC
      LIMIT ?
    `, [this.cacheLimit]);

    if (result.length === 0) return;

    for (const row of result[0].values) {
      const chunk = this.rowToChunk(row);
      this.vectorCache.set(chunk.id, { embedding: chunk.embedding, chunk });
    }
  }

  /**
   * Add a chunk with its embedding
   */
  async addChunk(chunk: EmbeddedChunk): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Convert Float32Array to Buffer for storage
    const embeddingBuffer = Buffer.from(chunk.embedding.buffer);
    const keywordsJson = JSON.stringify(chunk.keywords);
    const metadataJson = chunk.metadata ? JSON.stringify(chunk.metadata) : null;

    this.db.run(`
      INSERT OR REPLACE INTO chunks
      (id, source_id, source_type, content, content_type, embedding, keywords,
       chunk_index, token_count, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      chunk.id,
      chunk.sourceId,
      chunk.sourceType,
      chunk.content,
      chunk.contentType,
      embeddingBuffer,
      keywordsJson,
      chunk.chunkIndex,
      chunk.tokenCount,
      metadataJson,
      chunk.createdAt.toISOString(),
    ]);

    // Update cache
    if (this.vectorCache.size >= this.cacheLimit) {
      // Remove oldest entry
      const firstKey = this.vectorCache.keys().next().value;
      if (firstKey) this.vectorCache.delete(firstKey);
    }
    this.vectorCache.set(chunk.id, { embedding: chunk.embedding, chunk });

    await this.save();
  }

  /**
   * Add multiple chunks
   */
  async addChunks(chunks: EmbeddedChunk[]): Promise<void> {
    for (const chunk of chunks) {
      await this.addChunk(chunk);
    }
  }

  /**
   * Get a chunk by ID
   */
  getChunk(id: string): EmbeddedChunk | null {
    // Check cache first
    const cached = this.vectorCache.get(id);
    if (cached) return cached.chunk;

    if (!this.db) return null;

    const result = this.db.exec(`
      SELECT id, source_id, source_type, content, content_type,
             embedding, keywords, chunk_index, token_count, metadata, created_at
      FROM chunks WHERE id = ?
    `, [id]);

    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }

    return this.rowToChunk(result[0].values[0]);
  }

  /**
   * Get all chunks for a source
   */
  getChunksForSource(sourceId: string): EmbeddedChunk[] {
    if (!this.db) return [];

    const result = this.db.exec(`
      SELECT id, source_id, source_type, content, content_type,
             embedding, keywords, chunk_index, token_count, metadata, created_at
      FROM chunks
      WHERE source_id = ?
      ORDER BY chunk_index
    `, [sourceId]);

    if (result.length === 0) return [];

    return result[0].values.map(row => this.rowToChunk(row));
  }

  /**
   * Vector similarity search
   */
  async search(
    queryEmbedding: Float32Array,
    limit: number = 10,
    filters?: RetrievalFilters
  ): Promise<VectorSearchResult[]> {
    // Get candidates (either from cache or database)
    const candidates = await this.getCandidates(filters);

    // Compute similarity for all candidates
    const results: VectorSearchResult[] = [];

    for (const { embedding, chunk } of candidates) {
      const similarity = this.cosineSimilarity(queryEmbedding, embedding);
      results.push({ chunk, similarity });
    }

    // Sort by similarity (descending) and take top results
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, limit);
  }

  /**
   * Get candidate chunks for similarity search
   */
  private async getCandidates(
    filters?: RetrievalFilters
  ): Promise<{ embedding: Float32Array; chunk: EmbeddedChunk }[]> {
    // If no filters and cache is warm, use cache
    if (!filters && this.vectorCache.size > 0) {
      return Array.from(this.vectorCache.values());
    }

    if (!this.db) return [];

    // Build query with filters
    let sql = `
      SELECT id, source_id, source_type, content, content_type,
             embedding, keywords, chunk_index, token_count, metadata, created_at
      FROM chunks
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filters?.sourceTypes?.length) {
      sql += ` AND source_type IN (${filters.sourceTypes.map(() => '?').join(',')})`;
      params.push(...filters.sourceTypes);
    }

    if (filters?.minDate) {
      sql += ` AND created_at >= ?`;
      params.push(filters.minDate.toISOString());
    }

    if (filters?.maxDate) {
      sql += ` AND created_at <= ?`;
      params.push(filters.maxDate.toISOString());
    }

    if (filters?.excludeIds?.length) {
      sql += ` AND id NOT IN (${filters.excludeIds.map(() => '?').join(',')})`;
      params.push(...filters.excludeIds);
    }

    // Apply sector/domain filters via metadata JSON
    if (filters?.sectorIds?.length || filters?.domainTags?.length) {
      // This is less efficient but necessary for JSON filtering
      sql += ` AND metadata IS NOT NULL`;
    }

    sql += ` ORDER BY created_at DESC LIMIT 5000`; // Cap for performance

    const result = this.db.exec(sql, params);

    if (result.length === 0) return [];

    const candidates: { embedding: Float32Array; chunk: EmbeddedChunk }[] = [];

    for (const row of result[0].values) {
      const chunk = this.rowToChunk(row);

      // Apply JSON-based filters
      if (filters?.sectorIds?.length && chunk.metadata?.sectorId) {
        if (!filters.sectorIds.includes(chunk.metadata.sectorId)) continue;
      }

      if (filters?.domainTags?.length && chunk.metadata?.domainTags) {
        const hasTag = filters.domainTags.some(tag =>
          chunk.metadata?.domainTags?.includes(tag)
        );
        if (!hasTag) continue;
      }

      candidates.push({ embedding: chunk.embedding, chunk });
    }

    return candidates;
  }

  /**
   * Keyword search using FTS5
   */
  keywordSearch(
    query: string,
    limit: number = 20,
    filters?: RetrievalFilters
  ): { chunk: EmbeddedChunk; score: number }[] {
    if (!this.db) return [];

    // Escape FTS5 query
    const escapedQuery = this.escapeFtsQuery(query);

    let sql = `
      SELECT
        c.id, c.source_id, c.source_type, c.content, c.content_type,
        c.embedding, c.keywords, c.chunk_index, c.token_count, c.metadata, c.created_at,
        bm25(chunks_fts) as score
      FROM chunks_fts fts
      JOIN chunks c ON fts.rowid = c.rowid
      WHERE chunks_fts MATCH ?
    `;
    const params: any[] = [escapedQuery];

    if (filters?.sourceTypes?.length) {
      sql += ` AND c.source_type IN (${filters.sourceTypes.map(() => '?').join(',')})`;
      params.push(...filters.sourceTypes);
    }

    sql += ` ORDER BY score LIMIT ?`;
    params.push(limit);

    try {
      const result = this.db.exec(sql, params);

      if (result.length === 0) return [];

      return result[0].values.map(row => ({
        chunk: this.rowToChunk(row.slice(0, 11)),
        score: Math.abs(row[11] as number),
      }));
    } catch (error) {
      console.warn('FTS search failed:', error);
      return [];
    }
  }

  /**
   * Escape FTS5 query special characters
   */
  private escapeFtsQuery(query: string): string {
    const escaped = query
      .replace(/"/g, '""')
      .split(/\s+/)
      .filter(term => term.length > 0)
      .map(term => `"${term}"`)
      .join(' OR ');

    return escaped || `"${query}"`;
  }

  /**
   * Compute cosine similarity between two embeddings
   */
  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
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
   * Delete a chunk
   */
  async deleteChunk(id: string): Promise<boolean> {
    if (!this.db) return false;

    this.db.run(`DELETE FROM chunks WHERE id = ?`, [id]);
    this.vectorCache.delete(id);
    await this.save();

    return true;
  }

  /**
   * Delete all chunks for a source
   */
  async deleteSource(sourceId: string): Promise<number> {
    if (!this.db) return 0;

    // Get IDs to remove from cache
    const result = this.db.exec(`SELECT id FROM chunks WHERE source_id = ?`, [sourceId]);
    const ids = result[0]?.values.map(row => row[0] as string) || [];

    // Delete from database
    this.db.run(`DELETE FROM chunks WHERE source_id = ?`, [sourceId]);

    // Remove from cache
    for (const id of ids) {
      this.vectorCache.delete(id);
    }

    await this.save();
    return ids.length;
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalChunks: number;
    totalSources: number;
    cacheSize: number;
    estimatedStorageBytes: number;
  } {
    if (!this.db) {
      return {
        totalChunks: 0,
        totalSources: 0,
        cacheSize: 0,
        estimatedStorageBytes: 0,
      };
    }

    const totalResult = this.db.exec(`SELECT COUNT(*) FROM chunks`);
    const totalChunks = totalResult[0]?.values[0]?.[0] as number || 0;

    const sourcesResult = this.db.exec(`SELECT COUNT(DISTINCT source_id) FROM chunks`);
    const totalSources = sourcesResult[0]?.values[0]?.[0] as number || 0;

    // Estimate storage (384 dimensions * 4 bytes * chunks + content)
    const avgEmbeddingSize = 384 * 4;
    const estimatedStorageBytes = totalChunks * (avgEmbeddingSize + 500); // +500 for content/metadata

    return {
      totalChunks,
      totalSources,
      cacheSize: this.vectorCache.size,
      estimatedStorageBytes,
    };
  }

  /**
   * Convert database row to EmbeddedChunk
   */
  private rowToChunk(row: any[]): EmbeddedChunk {
    const embeddingBuffer = row[5] as Uint8Array;
    const embedding = new Float32Array(embeddingBuffer.buffer, embeddingBuffer.byteOffset, embeddingBuffer.length / 4);

    return {
      id: row[0] as string,
      sourceId: row[1] as string,
      sourceType: row[2] as ChunkSourceType,
      content: row[3] as string,
      contentType: row[4] as ChunkContentType,
      embedding,
      keywords: JSON.parse(row[6] as string || '[]'),
      chunkIndex: row[7] as number,
      tokenCount: row[8] as number,
      metadata: row[9] ? JSON.parse(row[9] as string) : undefined,
      createdAt: new Date(row[10] as string),
    };
  }

  /**
   * Close the database
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
      this.vectorCache.clear();
    }
  }

  /**
   * Clear all chunks
   */
  async clear(): Promise<void> {
    if (!this.db) return;

    this.db.run(`DELETE FROM chunks`);
    this.vectorCache.clear();
    await this.save();
  }

  /**
   * Vacuum the database
   */
  async vacuum(): Promise<void> {
    if (!this.db) return;

    this.db.run(`VACUUM`);
    await this.save();
  }
}

/**
 * Singleton instance
 */
export const vectorStore = new VectorStore();
