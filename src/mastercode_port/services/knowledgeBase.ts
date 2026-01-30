/**
 * Knowledge Base Service
 *
 * Manages a collection of URLs and their embedded content for use in AI prompts.
 * Supports fetching, storing, and retrieving knowledge entries.
 * Now with ONNX embedding support for semantic search.
 */

import * as vscode from 'vscode';
import { embedderService, EmbeddingChunk, SemanticSearchResult, DownloadProgress, AVAILABLE_MODELS, EmbeddingModel } from './embedder';

export type KBEntryType = 'url' | 'pdf' | 'text';

export interface KBEntry {
  id: string;
  url: string;
  title: string;
  content: string;           // Raw text content
  summary?: string;          // AI-generated summary
  tags: string[];
  addedAt: number;
  updatedAt: number;
  fetchedAt?: number;
  contentHash?: string;      // To detect changes
  type: KBEntryType;         // Entry type (url, pdf, text)
  embedded: boolean;         // Whether this entry has been embedded
  chunkCount?: number;       // Number of chunks for this entry
  metadata?: {
    author?: string;
    publishDate?: string;
    language?: string;
    wordCount?: number;
    pageCount?: number;      // For PDFs
    fileName?: string;       // Original file name for PDFs
  };
}

export interface KBSearchResult {
  entry: KBEntry;
  relevance: number;
  matchedTags: string[];
  matchedContent: string[];  // Snippets
}

export interface KBConfig {
  maxEntries: number;
  maxContentLength: number;  // Per entry
  autoRefreshDays: number;   // Re-fetch after N days
}

export interface CrawlOptions {
  maxPages: number;          // Maximum pages to crawl
  maxDepth: number;          // Maximum link depth from start URL
  sameDomainOnly: boolean;   // Only crawl same domain
  delayMs: number;           // Delay between requests (rate limiting)
  includePatterns?: RegExp[];  // URL patterns to include
  excludePatterns?: RegExp[];  // URL patterns to exclude
}

export interface CrawlProgress {
  crawled: number;
  total: number;
  currentUrl: string;
  status: 'crawling' | 'done' | 'error';
  error?: string;
}

const DEFAULT_CONFIG: KBConfig = {
  maxEntries: 500,
  maxContentLength: 50000,   // ~50KB per entry
  autoRefreshDays: 7,
};

const DEFAULT_CRAWL_OPTIONS: CrawlOptions = {
  maxPages: 500,
  maxDepth: 10,
  sameDomainOnly: true,
  delayMs: 100,  // Faster crawling (100ms between requests)
  excludePatterns: [
    /\.(jpg|jpeg|png|gif|svg|ico|css|js|woff|woff2|ttf|eot|pdf|zip|tar|gz|mp4|mp3|wav)$/i,
    /#.+$/,   // Fragment identifiers (but keep base URL)
    /\/tag\//i,
    /\/category\//i,
    /\/author\//i,
    /\/page\/\d+$/i,  // Pagination pages only at end
    /\/(login|logout|signin|signup|register|admin|cart|checkout)\//i,
    /\?(utm_|ref=|source=|fbclid|gclid)/i,  // Only exclude tracking params, not all query params
  ],
};

export class KnowledgeBaseService {
  private entries: Map<string, KBEntry> = new Map();
  private context: vscode.ExtensionContext | null = null;
  private config: KBConfig = DEFAULT_CONFIG;
  private readonly STORAGE_KEY = 'spacecode.knowledgeBase';
  private readonly CONFIG_KEY = 'spacecode.kbConfig';

  async initialize(context: vscode.ExtensionContext): Promise<void> {
    this.context = context;
    await this.loadEntries();
    await this.loadConfig();

    // Initialize embedder service
    await embedderService.initialize(context);
  }

  /**
   * Get embedder status
   */
  getEmbedderStatus() {
    return embedderService.getStatus();
  }

  /**
   * Get available embedding models
   */
  getAvailableModels(): EmbeddingModel[] {
    return AVAILABLE_MODELS;
  }

  /**
   * Set the embedding model to use
   */
  async setEmbeddingModel(modelId: string): Promise<void> {
    return embedderService.setCurrentModel(modelId);
  }

  /**
   * Download the ONNX embedding model
   */
  async downloadEmbeddingModel(
    modelId?: string,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<{ success: boolean; error?: string }> {
    return embedderService.downloadModel(modelId, onProgress);
  }

  /**
   * Check if embedding model is ready
   */
  isEmbeddingModelReady(): boolean {
    return embedderService.isModelDownloaded();
  }

  private async loadEntries(): Promise<void> {
    if (!this.context) return;

    const stored = this.context.globalState.get<KBEntry[]>(this.STORAGE_KEY);
    if (stored) {
      this.entries = new Map(stored.map(e => [e.id, e]));
    }
  }

  private async saveEntries(): Promise<void> {
    if (!this.context) return;

    const entries = Array.from(this.entries.values());

    // Enforce max entries limit
    if (entries.length > this.config.maxEntries) {
      entries.sort((a, b) => b.updatedAt - a.updatedAt);
      entries.length = this.config.maxEntries;
      this.entries = new Map(entries.map(e => [e.id, e]));
    }

    await this.context.globalState.update(this.STORAGE_KEY, entries);
  }

  private async loadConfig(): Promise<void> {
    if (!this.context) return;

    const stored = this.context.globalState.get<KBConfig>(this.CONFIG_KEY);
    if (stored) {
      this.config = { ...DEFAULT_CONFIG, ...stored };
    }
  }

  /**
   * Add a URL to the knowledge base (single page)
   */
  async addUrl(url: string, tags: string[] = []): Promise<KBEntry> {
    // Generate ID from URL
    const id = this.generateId(url);

    // Check if already exists
    if (this.entries.has(id)) {
      return this.refreshEntry(id);
    }

    // Fetch and parse content
    const { title, content, metadata } = await this.fetchUrl(url);

    const entry: KBEntry = {
      id,
      url,
      title,
      content: content.slice(0, this.config.maxContentLength),
      tags,
      addedAt: Date.now(),
      updatedAt: Date.now(),
      fetchedAt: Date.now(),
      contentHash: this.hashContent(content),
      type: 'url',
      embedded: false,
      metadata,
    };

    this.entries.set(id, entry);
    await this.saveEntries();

    return entry;
  }

  /**
   * Crawl an entire website and add all pages to the knowledge base
   */
  async crawlWebsite(
    startUrl: string,
    tags: string[] = [],
    options: Partial<CrawlOptions> = {},
    onProgress?: (progress: CrawlProgress) => void
  ): Promise<{ added: number; errors: string[] }> {
    const opts: CrawlOptions = { ...DEFAULT_CRAWL_OPTIONS, ...options };
    const baseUrl = new URL(startUrl);
    const baseDomain = baseUrl.hostname;

    const visited = new Set<string>();
    const toVisit: Array<{ url: string; depth: number }> = [{ url: startUrl, depth: 0 }];
    const errors: string[] = [];
    let added = 0;

    console.log(`[KB Crawler] Starting crawl of ${startUrl} with options:`, opts);

    while (toVisit.length > 0 && visited.size < opts.maxPages) {
      const { url, depth } = toVisit.shift()!;

      // Normalize URL (remove fragment, trailing slash)
      const normalizedUrl = this.normalizeUrl(url);

      // Skip if already visited
      if (visited.has(normalizedUrl)) {
        continue;
      }

      // Check depth limit
      if (depth > opts.maxDepth) {
        continue;
      }

      // Check domain restriction
      if (opts.sameDomainOnly) {
        try {
          const urlObj = new URL(normalizedUrl);
          if (urlObj.hostname !== baseDomain) {
            continue;
          }
        } catch {
          continue;
        }
      }

      // Check exclude patterns
      if (opts.excludePatterns?.some(pattern => pattern.test(normalizedUrl))) {
        continue;
      }

      // Check include patterns (if specified)
      if (opts.includePatterns && opts.includePatterns.length > 0) {
        if (!opts.includePatterns.some(pattern => pattern.test(normalizedUrl))) {
          continue;
        }
      }

      visited.add(normalizedUrl);

      // Report progress
      onProgress?.({
        crawled: visited.size,
        total: Math.min(visited.size + toVisit.length, opts.maxPages),
        currentUrl: normalizedUrl,
        status: 'crawling',
      });

      try {
        // Fetch page
        const { title, content, links, metadata } = await this.fetchUrlWithLinks(normalizedUrl);

        // Add entry if it has meaningful content
        if (content.length > 100) {
          const id = this.generateId(normalizedUrl);

          // Skip if already in KB
          if (!this.entries.has(id)) {
            const entry: KBEntry = {
              id,
              url: normalizedUrl,
              title,
              content: content.slice(0, this.config.maxContentLength),
              tags,
              addedAt: Date.now(),
              updatedAt: Date.now(),
              fetchedAt: Date.now(),
              contentHash: this.hashContent(content),
              type: 'url',
              embedded: false,
              metadata,
            };

            this.entries.set(id, entry);
            added++;
            console.log(`[KB Crawler] Added: ${title} (${normalizedUrl})`);
          }
        }

        // Add discovered links to queue
        for (const link of links) {
          const absoluteUrl = this.resolveUrl(normalizedUrl, link);
          if (absoluteUrl && !visited.has(absoluteUrl)) {
            toVisit.push({ url: absoluteUrl, depth: depth + 1 });
          }
        }

        // Rate limiting delay
        if (opts.delayMs > 0) {
          await this.delay(opts.delayMs);
        }
      } catch (error) {
        const errorMsg = `Failed to crawl ${normalizedUrl}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMsg);
        console.log(`[KB Crawler] Error: ${errorMsg}`);
      }
    }

    // Save all entries at once
    await this.saveEntries();

    onProgress?.({
      crawled: visited.size,
      total: visited.size,
      currentUrl: '',
      status: 'done',
    });

    console.log(`[KB Crawler] Finished: ${added} pages added, ${errors.length} errors`);
    return { added, errors };
  }

  /**
   * Fetch URL and extract links for crawling
   */
  private async fetchUrlWithLinks(url: string): Promise<{
    title: string;
    content: string;
    links: string[];
    metadata?: KBEntry['metadata'];
  }> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'SpaceCode-KB-Crawler/1.0',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      throw new Error('Not an HTML page');
    }

    const html = await response.text();

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? this.decodeHtmlEntities(titleMatch[1].trim()) : new URL(url).pathname;

    // Extract all links
    const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
    const links: string[] = [];
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      links.push(match[1]);
    }

    // Extract main content
    let content = html
      // Remove scripts, styles, nav, footer, header, aside
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
      // Remove HTML tags
      .replace(/<[^>]+>/g, ' ')
      // Decode entities
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
      // Clean whitespace
      .replace(/\s+/g, ' ')
      .trim();

    const metadata: KBEntry['metadata'] = {
      wordCount: content.split(/\s+/).length,
    };

    return { title, content, links, metadata };
  }

  /**
   * Normalize URL for deduplication
   */
  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      // Remove fragment
      urlObj.hash = '';
      // Remove trailing slash
      let normalized = urlObj.toString();
      if (normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
      }
      return normalized;
    } catch {
      return url;
    }
  }

  /**
   * Resolve relative URL to absolute
   */
  private resolveUrl(base: string, relative: string): string | null {
    try {
      // Skip non-http links
      if (relative.startsWith('mailto:') ||
          relative.startsWith('tel:') ||
          relative.startsWith('javascript:') ||
          relative.startsWith('data:')) {
        return null;
      }

      const resolved = new URL(relative, base);
      // Only allow http/https
      if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
        return null;
      }
      return this.normalizeUrl(resolved.toString());
    } catch {
      return null;
    }
  }

  /**
   * Decode HTML entities
   */
  private decodeHtmlEntities(text: string): string {
    return text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
  }

  /**
   * Delay helper for rate limiting
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Add a PDF file to the knowledge base
   */
  async addPdf(
    fileData: Buffer,
    fileName: string,
    tags: string[] = []
  ): Promise<KBEntry> {
    // Generate ID from filename
    const id = this.generateId(`pdf://${fileName}_${Date.now()}`);

    // Parse PDF content
    const { text, pageCount } = await this.parsePdf(fileData);

    const entry: KBEntry = {
      id,
      url: `pdf://${fileName}`,
      title: fileName.replace(/\.pdf$/i, ''),
      content: text.slice(0, this.config.maxContentLength),
      tags,
      addedAt: Date.now(),
      updatedAt: Date.now(),
      contentHash: this.hashContent(text),
      type: 'pdf',
      embedded: false,
      metadata: {
        wordCount: text.split(/\s+/).length,
        pageCount,
        fileName,
      },
    };

    this.entries.set(id, entry);
    await this.saveEntries();

    return entry;
  }

  /**
   * Parse PDF file and extract text
   */
  private async parsePdf(fileData: Buffer): Promise<{ text: string; pageCount: number }> {
    try {
      const pdfParse = await import('pdf-parse');
      const data = await pdfParse.default(fileData);

      return {
        text: data.text,
        pageCount: data.numpages,
      };
    } catch (error) {
      throw new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Embed an entry (chunk and generate embeddings)
   */
  async embedEntry(
    id: string,
    onProgress?: (current: number, total: number) => void
  ): Promise<{ success: boolean; chunkCount?: number; error?: string }> {
    const entry = this.entries.get(id);
    if (!entry) {
      return { success: false, error: 'Entry not found' };
    }

    if (!this.isEmbeddingModelReady()) {
      return { success: false, error: 'Embedding model not downloaded' };
    }

    try {
      const chunks = await embedderService.chunkAndEmbed(
        entry.content,
        entry.id,
        onProgress
      );

      entry.embedded = true;
      entry.chunkCount = chunks.length;
      entry.updatedAt = Date.now();

      await this.saveEntries();

      return { success: true, chunkCount: chunks.length };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Embedding failed',
      };
    }
  }

  /**
   * Embed all entries that haven't been embedded yet
   */
  async embedAllEntries(
    onProgress?: (entryIndex: number, totalEntries: number, chunkIndex: number, totalChunks: number) => void
  ): Promise<{ embedded: number; failed: number; errors: string[] }> {
    const unembedded = this.getAllEntries().filter(e => !e.embedded);
    let embedded = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < unembedded.length; i++) {
      const entry = unembedded[i];

      const result = await this.embedEntry(entry.id, (chunk, total) => {
        onProgress?.(i + 1, unembedded.length, chunk, total);
      });

      if (result.success) {
        embedded++;
      } else {
        failed++;
        errors.push(`${entry.title}: ${result.error}`);
      }
    }

    return { embedded, failed, errors };
  }

  /**
   * Semantic search using embeddings
   */
  async semanticSearch(
    query: string,
    maxResults: number = 5
  ): Promise<SemanticSearchResult[]> {
    if (!this.isEmbeddingModelReady()) {
      return [];
    }

    return embedderService.semanticSearch(query, maxResults);
  }

  /**
   * Build context using semantic search
   */
  async buildSemanticContext(
    query: string,
    maxLength: number = 10000
  ): Promise<string> {
    const results = await this.semanticSearch(query, 10);
    if (results.length === 0) {
      // Fall back to keyword search
      return this.buildSearchContext(query, maxLength);
    }

    const sections: string[] = [];
    let currentLength = 0;

    for (const result of results) {
      const entry = this.entries.get(result.chunk.sourceId);
      if (!entry) continue;

      const section = `## ${entry.title} (relevance: ${(result.similarity * 100).toFixed(1)}%)\nSource: ${entry.url}\n\n${result.chunk.text}`;

      if (currentLength + section.length > maxLength) {
        break;
      }

      sections.push(section);
      currentLength += section.length;
    }

    return sections.join('\n\n---\n\n');
  }

  /**
   * Get embedding statistics
   */
  getEmbeddingStats(): {
    totalEntries: number;
    embeddedEntries: number;
    totalChunks: number;
  } {
    const entries = this.getAllEntries();
    return {
      totalEntries: entries.length,
      embeddedEntries: entries.filter(e => e.embedded).length,
      totalChunks: embedderService.getTotalChunkCount(),
    };
  }

  /**
   * Add content directly (for non-URL sources)
   */
  async addContent(
    title: string,
    content: string,
    tags: string[] = [],
    sourceUrl?: string
  ): Promise<KBEntry> {
    const id = this.generateId(sourceUrl || title);

    const entry: KBEntry = {
      id,
      url: sourceUrl || `local://${id}`,
      title,
      content: content.slice(0, this.config.maxContentLength),
      tags,
      addedAt: Date.now(),
      updatedAt: Date.now(),
      contentHash: this.hashContent(content),
      type: 'text',
      embedded: false,
      metadata: {
        wordCount: content.split(/\s+/).length,
      },
    };

    this.entries.set(id, entry);
    await this.saveEntries();

    return entry;
  }

  /**
   * Refresh an existing entry by re-fetching its URL
   */
  async refreshEntry(id: string): Promise<KBEntry> {
    const entry = this.entries.get(id);
    if (!entry) {
      throw new Error(`Entry not found: ${id}`);
    }

    if (entry.url.startsWith('local://')) {
      // Can't refresh local content
      return entry;
    }

    const { title, content, metadata } = await this.fetchUrl(entry.url);
    const newHash = this.hashContent(content);

    // Update if content changed
    if (newHash !== entry.contentHash) {
      entry.title = title;
      entry.content = content.slice(0, this.config.maxContentLength);
      entry.contentHash = newHash;
      entry.metadata = metadata;
      entry.updatedAt = Date.now();
    }

    entry.fetchedAt = Date.now();
    await this.saveEntries();

    return entry;
  }

  /**
   * Remove an entry from the knowledge base
   */
  async removeEntry(id: string): Promise<boolean> {
    const entry = this.entries.get(id);
    const deleted = this.entries.delete(id);
    if (deleted) {
      // Also remove embeddings if they exist
      if (entry?.embedded) {
        await embedderService.removeChunks(id);
      }
      await this.saveEntries();
    }
    return deleted;
  }

  /**
   * Get all entries
   */
  getAllEntries(): KBEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * Get entry by ID
   */
  getEntry(id: string): KBEntry | undefined {
    return this.entries.get(id);
  }

  /**
   * Get entries by tag
   */
  getEntriesByTag(tag: string): KBEntry[] {
    return this.getAllEntries().filter(e =>
      e.tags.some(t => t.toLowerCase() === tag.toLowerCase())
    );
  }

  /**
   * Search entries by keyword
   */
  search(query: string, maxResults: number = 10): KBSearchResult[] {
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 2);

    const results: KBSearchResult[] = [];

    for (const entry of this.entries.values()) {
      let relevance = 0;
      const matchedTags: string[] = [];
      const matchedContent: string[] = [];

      // Check title
      if (entry.title.toLowerCase().includes(queryLower)) {
        relevance += 10;
      }

      // Check tags
      for (const tag of entry.tags) {
        if (tag.toLowerCase().includes(queryLower)) {
          relevance += 5;
          matchedTags.push(tag);
        }
      }

      // Check content
      const contentLower = entry.content.toLowerCase();
      for (const term of queryTerms) {
        const index = contentLower.indexOf(term);
        if (index !== -1) {
          relevance += 1;
          // Extract snippet around match
          const start = Math.max(0, index - 50);
          const end = Math.min(entry.content.length, index + term.length + 50);
          matchedContent.push('...' + entry.content.slice(start, end) + '...');
        }
      }

      if (relevance > 0) {
        results.push({ entry, relevance, matchedTags, matchedContent });
      }
    }

    // Sort by relevance
    results.sort((a, b) => b.relevance - a.relevance);

    return results.slice(0, maxResults);
  }

  /**
   * Build context string for AI prompts from selected entries
   */
  buildPromptContext(entryIds: string[], maxLength: number = 10000): string {
    const sections: string[] = [];
    let currentLength = 0;

    for (const id of entryIds) {
      const entry = this.entries.get(id);
      if (!entry) continue;

      const section = `## ${entry.title}\nSource: ${entry.url}\nTags: ${entry.tags.join(', ')}\n\n${entry.content}`;

      if (currentLength + section.length > maxLength) {
        // Truncate this entry
        const remaining = maxLength - currentLength - 100;
        if (remaining > 500) {
          sections.push(section.slice(0, remaining) + '\n\n[Content truncated...]');
        }
        break;
      }

      sections.push(section);
      currentLength += section.length;
    }

    return sections.join('\n\n---\n\n');
  }

  /**
   * Build context from search results
   */
  buildSearchContext(query: string, maxLength: number = 10000): string {
    const results = this.search(query, 5);
    const entryIds = results.map(r => r.entry.id);
    return this.buildPromptContext(entryIds, maxLength);
  }

  /**
   * Get entries that need refreshing
   */
  getStaleEntries(): KBEntry[] {
    const staleThreshold = Date.now() - (this.config.autoRefreshDays * 24 * 60 * 60 * 1000);

    return this.getAllEntries().filter(e =>
      !e.url.startsWith('local://') &&
      (!e.fetchedAt || e.fetchedAt < staleThreshold)
    );
  }

  /**
   * Update tags for an entry
   */
  async updateTags(id: string, tags: string[]): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry) {
      throw new Error(`Entry not found: ${id}`);
    }

    entry.tags = tags;
    entry.updatedAt = Date.now();
    await this.saveEntries();
  }

  /**
   * Set AI-generated summary for an entry
   */
  async setSummary(id: string, summary: string): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry) {
      throw new Error(`Entry not found: ${id}`);
    }

    entry.summary = summary;
    entry.updatedAt = Date.now();
    await this.saveEntries();
  }

  /**
   * Get all unique tags
   */
  getAllTags(): string[] {
    const tags = new Set<string>();
    for (const entry of this.entries.values()) {
      for (const tag of entry.tags) {
        tags.add(tag);
      }
    }
    return Array.from(tags).sort();
  }

  /**
   * Export knowledge base to JSON
   */
  exportToJson(): string {
    return JSON.stringify(this.getAllEntries(), null, 2);
  }

  /**
   * Import knowledge base from JSON
   */
  async importFromJson(json: string): Promise<number> {
    const entries: KBEntry[] = JSON.parse(json);
    let imported = 0;

    for (const entry of entries) {
      if (entry.id && entry.url && entry.content) {
        this.entries.set(entry.id, entry);
        imported++;
      }
    }

    await this.saveEntries();
    return imported;
  }

  /**
   * Clear all entries
   */
  async clear(): Promise<void> {
    this.entries.clear();
    await embedderService.clear();
    await this.saveEntries();
  }

  // === Private Helpers ===

  private generateId(input: string): string {
    // Simple hash for ID generation
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return 'kb_' + Math.abs(hash).toString(36);
  }

  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  private async fetchUrl(url: string): Promise<{
    title: string;
    content: string;
    metadata?: KBEntry['metadata'];
  }> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();

      // Extract title
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : new URL(url).hostname;

      // Extract main content (simplified - strips HTML)
      let content = html
        // Remove scripts and styles
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        // Remove HTML tags
        .replace(/<[^>]+>/g, ' ')
        // Decode entities
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        // Clean whitespace
        .replace(/\s+/g, ' ')
        .trim();

      const metadata: KBEntry['metadata'] = {
        wordCount: content.split(/\s+/).length,
      };

      return { title, content, metadata };
    } catch (error) {
      throw new Error(`Failed to fetch URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
