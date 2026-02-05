/**
 * Message Store
 *
 * SQLite-based storage for chat messages with FTS5 full-text search.
 * Uses sql.js (WebAssembly SQLite) for VSCode extension compatibility.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import {
  StoredMessage,
  MessageInput,
  MessageRole,
  MessageMetadata,
  KeywordSearchResult,
  EmbeddedChunk,
  ChunkSourceType,
  ChunkContentType,
} from './types';

/**
 * Message Store using SQLite + FTS5
 */
export class MessageStore {
  private db: SqlJsDatabase | null = null;
  private context: vscode.ExtensionContext | null = null;
  private dbPath: string = '';
  private initialized = false;
  private ftsEnabled = false;

  /**
   * Initialize the message store
   */
  async initialize(context: vscode.ExtensionContext): Promise<void> {
    if (this.initialized) return;

    this.context = context;
    this.dbPath = path.join(context.globalStorageUri.fsPath, 'messages.db');

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
    this.initialized = true;
  }

  /**
   * Create database schema
   */
  private async createSchema(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Messages table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        workspace_path TEXT,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        tags TEXT,
        metadata TEXT
      )
    `);

    // Create index on session_id for fast session retrieval
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_messages_session
      ON messages(session_id, timestamp DESC)
    `);

    // Create index on workspace for workspace-scoped queries
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_messages_workspace
      ON messages(workspace_path, timestamp DESC)
    `);

    // FTS5 virtual table for full-text search (optional — sql.js may not include FTS5)
    try {
      this.db.run(`
        CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
          content,
          content='messages',
          content_rowid='id'
        )
      `);

      // Triggers to keep FTS in sync
      this.db.run(`
        CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
          INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
        END
      `);

      this.db.run(`
        CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
          INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.id, old.content);
        END
      `);

      this.db.run(`
        CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
          INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.id, old.content);
          INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
        END
      `);
      this.ftsEnabled = true;
    } catch {
      // FTS5 not available in this sql.js build — search falls back to LIKE
      console.warn('[MessageStore] FTS5 not available, full-text search will use LIKE fallback');
      this.ftsEnabled = false;
    }

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
   * Add a message
   */
  async addMessage(input: MessageInput): Promise<StoredMessage> {
    if (!this.db) throw new Error('Database not initialized');

    const tagsJson = input.tags ? JSON.stringify(input.tags) : null;
    const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

    this.db.run(`
      INSERT INTO messages (session_id, workspace_path, role, content, tags, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      input.sessionId,
      input.workspacePath || null,
      input.role,
      input.content,
      tagsJson,
      metadataJson,
    ]);

    // Get the inserted row
    const result = this.db.exec(`SELECT last_insert_rowid() as id`);
    const id = result[0].values[0][0] as number;

    await this.save();

    return this.getMessage(id)!;
  }

  /**
   * Get a message by ID
   */
  getMessage(id: number): StoredMessage | null {
    if (!this.db) return null;

    const result = this.db.exec(`
      SELECT id, session_id, workspace_path, role, content, timestamp, tags, metadata
      FROM messages WHERE id = ?
    `, [id]);

    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }

    return this.rowToMessage(result[0].values[0]);
  }

  /**
   * Get messages for a session
   */
  getSessionMessages(sessionId: string, limit: number = 100): StoredMessage[] {
    if (!this.db) return [];

    const result = this.db.exec(`
      SELECT id, session_id, workspace_path, role, content, timestamp, tags, metadata
      FROM messages
      WHERE session_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `, [sessionId, limit]);

    if (result.length === 0) return [];

    return result[0].values.map(row => this.rowToMessage(row)).reverse();
  }

  /**
   * Get recent messages across all sessions
   */
  getRecentMessages(limit: number = 50, workspacePath?: string): StoredMessage[] {
    if (!this.db) return [];

    let query = `
      SELECT id, session_id, workspace_path, role, content, timestamp, tags, metadata
      FROM messages
    `;
    const params: any[] = [];

    if (workspacePath) {
      query += ` WHERE workspace_path = ?`;
      params.push(workspacePath);
    }

    query += ` ORDER BY timestamp DESC LIMIT ?`;
    params.push(limit);

    const result = this.db.exec(query, params);

    if (result.length === 0) return [];

    return result[0].values.map(row => this.rowToMessage(row)).reverse();
  }

  /**
   * Full-text search using FTS5 with BM25 ranking
   */
  searchMessages(
    query: string,
    limit: number = 20,
    workspacePath?: string
  ): { message: StoredMessage; score: number }[] {
    if (!this.db) return [];

    // If FTS5 is not available, go straight to LIKE fallback
    if (!this.ftsEnabled) {
      return this.fallbackSearch(query, limit, workspacePath);
    }

    // Escape FTS5 special characters
    const escapedQuery = this.escapeFtsQuery(query);

    let sql = `
      SELECT
        m.id, m.session_id, m.workspace_path, m.role, m.content,
        m.timestamp, m.tags, m.metadata,
        bm25(messages_fts) as score
      FROM messages_fts fts
      JOIN messages m ON fts.rowid = m.id
      WHERE messages_fts MATCH ?
    `;
    const params: any[] = [escapedQuery];

    if (workspacePath) {
      sql += ` AND m.workspace_path = ?`;
      params.push(workspacePath);
    }

    sql += ` ORDER BY score LIMIT ?`;
    params.push(limit);

    try {
      const result = this.db.exec(sql, params);

      if (result.length === 0) return [];

      return result[0].values.map(row => ({
        message: this.rowToMessage(row.slice(0, 8)),
        score: Math.abs(row[8] as number), // BM25 returns negative scores
      }));
    } catch (error) {
      // If FTS query fails, fall back to LIKE search
      console.warn('FTS search failed, falling back to LIKE:', error);
      return this.fallbackSearch(query, limit, workspacePath);
    }
  }

  /**
   * Fallback LIKE-based search when FTS fails
   */
  private fallbackSearch(
    query: string,
    limit: number,
    workspacePath?: string
  ): { message: StoredMessage; score: number }[] {
    if (!this.db) return [];

    let sql = `
      SELECT id, session_id, workspace_path, role, content, timestamp, tags, metadata
      FROM messages
      WHERE content LIKE ?
    `;
    const params: any[] = [`%${query}%`];

    if (workspacePath) {
      sql += ` AND workspace_path = ?`;
      params.push(workspacePath);
    }

    sql += ` ORDER BY timestamp DESC LIMIT ?`;
    params.push(limit);

    const result = this.db.exec(sql, params);

    if (result.length === 0) return [];

    return result[0].values.map(row => ({
      message: this.rowToMessage(row),
      score: 1.0, // Uniform score for LIKE results
    }));
  }

  /**
   * Escape FTS5 query special characters
   */
  private escapeFtsQuery(query: string): string {
    // FTS5 uses " for phrases, - for NOT, * for prefix
    // We escape quotes and convert spaces to AND semantics
    const escaped = query
      .replace(/"/g, '""')
      .split(/\s+/)
      .filter(term => term.length > 0)
      .map(term => `"${term}"`)
      .join(' OR ');

    return escaped || `"${query}"`;
  }

  /**
   * Delete a message
   */
  async deleteMessage(id: number): Promise<boolean> {
    if (!this.db) return false;

    this.db.run(`DELETE FROM messages WHERE id = ?`, [id]);
    await this.save();

    return true;
  }

  /**
   * Delete all messages for a session
   */
  async deleteSession(sessionId: string): Promise<number> {
    if (!this.db) return 0;

    const countResult = this.db.exec(
      `SELECT COUNT(*) FROM messages WHERE session_id = ?`,
      [sessionId]
    );
    const count = countResult[0]?.values[0]?.[0] as number || 0;

    this.db.run(`DELETE FROM messages WHERE session_id = ?`, [sessionId]);
    await this.save();

    return count;
  }

  /**
   * Delete old messages (for cleanup)
   */
  async deleteOldMessages(olderThanDays: number): Promise<number> {
    if (!this.db) return 0;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);
    const cutoffStr = cutoff.toISOString();

    const countResult = this.db.exec(
      `SELECT COUNT(*) FROM messages WHERE timestamp < ?`,
      [cutoffStr]
    );
    const count = countResult[0]?.values[0]?.[0] as number || 0;

    this.db.run(`DELETE FROM messages WHERE timestamp < ?`, [cutoffStr]);
    await this.save();

    return count;
  }

  /**
   * Get message statistics
   */
  getStats(): {
    totalMessages: number;
    sessionsCount: number;
    oldestMessage: Date | null;
    newestMessage: Date | null;
  } {
    if (!this.db) {
      return {
        totalMessages: 0,
        sessionsCount: 0,
        oldestMessage: null,
        newestMessage: null,
      };
    }

    const totalResult = this.db.exec(`SELECT COUNT(*) FROM messages`);
    const totalMessages = totalResult[0]?.values[0]?.[0] as number || 0;

    const sessionsResult = this.db.exec(`SELECT COUNT(DISTINCT session_id) FROM messages`);
    const sessionsCount = sessionsResult[0]?.values[0]?.[0] as number || 0;

    const oldestResult = this.db.exec(`SELECT MIN(timestamp) FROM messages`);
    const oldestStr = oldestResult[0]?.values[0]?.[0] as string | null;
    const oldestMessage = oldestStr ? new Date(oldestStr) : null;

    const newestResult = this.db.exec(`SELECT MAX(timestamp) FROM messages`);
    const newestStr = newestResult[0]?.values[0]?.[0] as string | null;
    const newestMessage = newestStr ? new Date(newestStr) : null;

    return { totalMessages, sessionsCount, oldestMessage, newestMessage };
  }

  /**
   * Convert database row to StoredMessage
   */
  private rowToMessage(row: any[]): StoredMessage {
    return {
      id: row[0] as number,
      sessionId: row[1] as string,
      workspacePath: row[2] as string | undefined,
      role: row[3] as MessageRole,
      content: row[4] as string,
      timestamp: new Date(row[5] as string),
      tags: row[6] ? JSON.parse(row[6] as string) : undefined,
      metadata: row[7] ? JSON.parse(row[7] as string) : undefined,
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
    }
  }

  /**
   * Clear all messages
   */
  async clear(): Promise<void> {
    if (!this.db) return;

    this.db.run(`DELETE FROM messages`);
    await this.save();
  }

  /**
   * Vacuum the database to reclaim space
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
export const messageStore = new MessageStore();
