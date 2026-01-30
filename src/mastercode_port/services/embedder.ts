/**
 * ONNX Embedder Service
 *
 * Provides text embedding functionality using ONNX models.
 * Supports model downloading, text chunking, and semantic search.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// Chunking configuration
const CHUNK_SIZE = 512; // tokens (approx 4 chars per token)
const CHUNK_OVERLAP = 50;

// Available embedding models with their HuggingFace URLs
export interface EmbeddingModel {
  id: string;
  name: string;
  description: string;
  size: string;
  dimensions: number;
  url: string;
}

export const AVAILABLE_MODELS: EmbeddingModel[] = [
  {
    id: 'Xenova/all-MiniLM-L6-v2',
    name: 'MiniLM-L6-v2',
    description: 'Fast, lightweight model with good quality. Best for general use.',
    size: '~23MB',
    dimensions: 384,
    url: 'https://huggingface.co/Xenova/all-MiniLM-L6-v2',
  },
  {
    id: 'Xenova/all-MiniLM-L12-v2',
    name: 'MiniLM-L12-v2',
    description: 'Larger MiniLM variant with better accuracy.',
    size: '~33MB',
    dimensions: 384,
    url: 'https://huggingface.co/Xenova/all-MiniLM-L12-v2',
  },
  {
    id: 'Xenova/bge-small-en-v1.5',
    name: 'BGE Small EN',
    description: 'High quality embeddings from BAAI. Great for retrieval.',
    size: '~33MB',
    dimensions: 384,
    url: 'https://huggingface.co/Xenova/bge-small-en-v1.5',
  },
  {
    id: 'Xenova/bge-base-en-v1.5',
    name: 'BGE Base EN',
    description: 'Larger BGE model with better accuracy.',
    size: '~109MB',
    dimensions: 768,
    url: 'https://huggingface.co/Xenova/bge-base-en-v1.5',
  },
  {
    id: 'Xenova/gte-small',
    name: 'GTE Small',
    description: 'General Text Embeddings model from Alibaba.',
    size: '~33MB',
    dimensions: 384,
    url: 'https://huggingface.co/Xenova/gte-small',
  },
];

const DEFAULT_MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

export interface EmbeddingChunk {
  id: string;
  text: string;
  embedding: number[];
  sourceId: string;
  startIndex: number;
  endIndex: number;
}

export interface DownloadProgress {
  status: 'idle' | 'downloading' | 'loading' | 'ready' | 'error';
  progress: number; // 0-100
  message: string;
  bytesLoaded?: number;
  bytesTotal?: number;
  currentFile?: string;
}

export interface EmbedderStatus {
  modelDownloaded: boolean;
  modelId: string;
  modelName: string;
  modelUrl: string;
  modelPath: string;
  isLoading: boolean;
  downloadProgress: DownloadProgress;
  availableModels: EmbeddingModel[];
  error?: string;
}

export interface SemanticSearchResult {
  chunk: EmbeddingChunk;
  similarity: number;
}

export class EmbedderService {
  private context: vscode.ExtensionContext | null = null;
  private pipeline: any = null;
  private isLoading = false;
  private currentModelId: string = DEFAULT_MODEL_ID;
  private chunks: Map<string, EmbeddingChunk[]> = new Map();
  private downloadProgress: DownloadProgress = {
    status: 'idle',
    progress: 0,
    message: '',
  };

  private readonly STORAGE_KEY = 'spacecode.embeddings';
  private readonly MODEL_STATUS_KEY = 'spacecode.embedderModelStatus';

  async initialize(context: vscode.ExtensionContext): Promise<void> {
    this.context = context;
    await this.loadChunks();
    await this.loadModelConfig();
  }

  /**
   * Load saved model configuration
   */
  private async loadModelConfig(): Promise<void> {
    if (!this.context) return;
    const saved = this.context.globalState.get<{ modelId: string }>(this.MODEL_STATUS_KEY);
    if (saved?.modelId) {
      this.currentModelId = saved.modelId;
    }
  }

  /**
   * Get the model storage path
   */
  private getModelPath(): string {
    if (!this.context) {
      return '';
    }
    return path.join(this.context.globalStorageUri.fsPath, 'models');
  }

  /**
   * Get current model info
   */
  getCurrentModel(): EmbeddingModel | undefined {
    return AVAILABLE_MODELS.find(m => m.id === this.currentModelId);
  }

  /**
   * Set current model (for selection)
   */
  async setCurrentModel(modelId: string): Promise<void> {
    const model = AVAILABLE_MODELS.find(m => m.id === modelId);
    if (!model) {
      throw new Error(`Unknown model: ${modelId}`);
    }

    // If changing models, reset pipeline
    if (modelId !== this.currentModelId) {
      this.pipeline = null;
    }

    this.currentModelId = modelId;

    if (this.context) {
      await this.context.globalState.update(this.MODEL_STATUS_KEY, {
        modelId: this.currentModelId,
      });
    }
  }

  /**
   * Check if a specific model is downloaded
   */
  isModelDownloaded(modelId?: string): boolean {
    const checkModelId = modelId || this.currentModelId;
    const modelPath = this.getModelPath();
    if (!modelPath) return false;

    // Model ID format is "Xenova/model-name", we need to check the path
    const modelDir = path.join(modelPath, ...checkModelId.split('/'));
    try {
      return fs.existsSync(modelDir) && fs.readdirSync(modelDir).length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get current status
   */
  getStatus(): EmbedderStatus {
    const currentModel = this.getCurrentModel();
    return {
      modelDownloaded: this.isModelDownloaded(),
      modelId: this.currentModelId,
      modelName: currentModel?.name || this.currentModelId,
      modelUrl: currentModel?.url || '',
      modelPath: this.getModelPath(),
      isLoading: this.isLoading,
      downloadProgress: { ...this.downloadProgress },
      availableModels: AVAILABLE_MODELS,
    };
  }

  /**
   * Download and initialize the ONNX model
   */
  async downloadModel(
    modelId?: string,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<{ success: boolean; error?: string }> {
    if (this.isLoading) {
      return { success: false, error: 'Model is already being downloaded' };
    }

    // Set model if specified
    if (modelId) {
      await this.setCurrentModel(modelId);
    }

    const model = this.getCurrentModel();
    if (!model) {
      return { success: false, error: 'No model selected' };
    }

    this.isLoading = true;
    this.downloadProgress = {
      status: 'downloading',
      progress: 0,
      message: `Initializing download for ${model.name}...`,
    };
    onProgress?.(this.downloadProgress);

    try {
      this.downloadProgress.message = 'Loading Transformers.js library...';
      onProgress?.(this.downloadProgress);

      // Dynamically import transformers.js
      const { pipeline, env } = await import('@xenova/transformers');

      // Configure cache directory
      const modelPath = this.getModelPath();
      if (modelPath) {
        fs.mkdirSync(modelPath, { recursive: true });
        env.cacheDir = modelPath;
        env.allowLocalModels = true;
      }

      this.downloadProgress = {
        status: 'downloading',
        progress: 5,
        message: `Downloading ${model.name} (${model.size})...`,
      };
      onProgress?.(this.downloadProgress);

      // Create the feature extraction pipeline with detailed progress
      this.pipeline = await pipeline('feature-extraction', this.currentModelId, {
        progress_callback: (data: any) => {
          if (data.status === 'progress') {
            const percent = Math.round(5 + (data.progress * 0.9));
            this.downloadProgress = {
              status: 'downloading',
              progress: percent,
              message: `Downloading: ${Math.round(data.progress)}%`,
              bytesLoaded: data.loaded,
              bytesTotal: data.total,
              currentFile: data.file,
            };
            onProgress?.(this.downloadProgress);
          } else if (data.status === 'done') {
            this.downloadProgress = {
              status: 'loading',
              progress: 95,
              message: 'Finalizing model...',
            };
            onProgress?.(this.downloadProgress);
          } else if (data.status === 'initiate') {
            this.downloadProgress = {
              status: 'downloading',
              progress: this.downloadProgress.progress,
              message: `Downloading: ${data.file || 'model files'}...`,
              currentFile: data.file,
            };
            onProgress?.(this.downloadProgress);
          }
        },
      });

      this.isLoading = false;
      this.downloadProgress = {
        status: 'ready',
        progress: 100,
        message: `${model.name} ready!`,
      };
      onProgress?.(this.downloadProgress);

      // Save status
      if (this.context) {
        await this.context.globalState.update(this.MODEL_STATUS_KEY, {
          modelId: this.currentModelId,
          downloadedAt: Date.now(),
        });
      }

      return { success: true };
    } catch (error) {
      this.isLoading = false;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.downloadProgress = {
        status: 'error',
        progress: 0,
        message: `Error: ${errorMsg}`,
      };
      onProgress?.(this.downloadProgress);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Load the model (if already downloaded)
   */
  async loadModel(): Promise<boolean> {
    if (this.pipeline) return true;
    if (!this.isModelDownloaded()) return false;
    if (this.isLoading) return false;

    this.isLoading = true;

    try {
      const { pipeline, env } = await import('@xenova/transformers');

      const modelPath = this.getModelPath();
      if (modelPath) {
        env.cacheDir = modelPath;
        env.allowLocalModels = true;
      }

      this.pipeline = await pipeline('feature-extraction', this.currentModelId);
      this.isLoading = false;
      return true;
    } catch (error) {
      this.isLoading = false;
      console.error('Failed to load model:', error);
      return false;
    }
  }

  /**
   * Generate embedding for a single text
   */
  async embed(text: string): Promise<number[] | null> {
    if (!this.pipeline) {
      const loaded = await this.loadModel();
      if (!loaded) return null;
    }

    try {
      // Generate embedding
      const output = await this.pipeline(text, { pooling: 'mean', normalize: true });
      return Array.from(output.data);
    } catch (error) {
      console.error('Embedding error:', error);
      return null;
    }
  }

  /**
   * Chunk text into smaller pieces
   */
  chunkText(text: string, sourceId: string): Omit<EmbeddingChunk, 'embedding'>[] {
    const chunks: Omit<EmbeddingChunk, 'embedding'>[] = [];

    // Approximate character count (4 chars per token)
    const chunkChars = CHUNK_SIZE * 4;
    const overlapChars = CHUNK_OVERLAP * 4;

    // Split by paragraphs first to respect natural boundaries
    const paragraphs = text.split(/\n\n+/);
    let currentChunk = '';
    let chunkStart = 0;
    let position = 0;

    for (const para of paragraphs) {
      // If adding this paragraph would exceed chunk size, save current chunk
      if (currentChunk.length + para.length > chunkChars && currentChunk.length > 0) {
        chunks.push({
          id: `${sourceId}_chunk_${chunks.length}`,
          text: currentChunk.trim(),
          sourceId,
          startIndex: chunkStart,
          endIndex: position,
        });

        // Start new chunk with overlap
        const overlapStart = Math.max(0, currentChunk.length - overlapChars);
        currentChunk = currentChunk.slice(overlapStart) + '\n\n' + para;
        chunkStart = position - (currentChunk.length - para.length - 2);
      } else {
        if (currentChunk.length > 0) {
          currentChunk += '\n\n';
        }
        currentChunk += para;
      }
      position += para.length + 2; // +2 for \n\n
    }

    // Don't forget the last chunk
    if (currentChunk.trim().length > 0) {
      chunks.push({
        id: `${sourceId}_chunk_${chunks.length}`,
        text: currentChunk.trim(),
        sourceId,
        startIndex: chunkStart,
        endIndex: position,
      });
    }

    return chunks;
  }

  /**
   * Chunk and embed text, storing the results
   */
  async chunkAndEmbed(
    text: string,
    sourceId: string,
    onProgress?: (current: number, total: number) => void
  ): Promise<EmbeddingChunk[]> {
    // Chunk the text
    const rawChunks = this.chunkText(text, sourceId);
    const embeddedChunks: EmbeddingChunk[] = [];

    // Embed each chunk
    for (let i = 0; i < rawChunks.length; i++) {
      onProgress?.(i + 1, rawChunks.length);

      const embedding = await this.embed(rawChunks[i].text);
      if (embedding) {
        embeddedChunks.push({
          ...rawChunks[i],
          embedding,
        });
      }
    }

    // Store chunks
    this.chunks.set(sourceId, embeddedChunks);
    await this.saveChunks();

    return embeddedChunks;
  }

  /**
   * Remove chunks for a source
   */
  async removeChunks(sourceId: string): Promise<void> {
    this.chunks.delete(sourceId);
    await this.saveChunks();
  }

  /**
   * Get chunks for a source
   */
  getChunks(sourceId: string): EmbeddingChunk[] {
    return this.chunks.get(sourceId) || [];
  }

  /**
   * Get total chunk count
   */
  getTotalChunkCount(): number {
    let total = 0;
    for (const chunks of this.chunks.values()) {
      total += chunks.length;
    }
    return total;
  }

  /**
   * Compute cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
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
   * Semantic search across all chunks
   */
  async semanticSearch(
    query: string,
    maxResults: number = 5,
    sourceIds?: string[]
  ): Promise<SemanticSearchResult[]> {
    const queryEmbedding = await this.embed(query);
    if (!queryEmbedding) return [];

    const results: SemanticSearchResult[] = [];

    // Search through all chunks
    for (const [sourceId, chunks] of this.chunks.entries()) {
      // Filter by sourceIds if provided
      if (sourceIds && !sourceIds.includes(sourceId)) continue;

      for (const chunk of chunks) {
        const similarity = this.cosineSimilarity(queryEmbedding, chunk.embedding);
        results.push({ chunk, similarity });
      }
    }

    // Sort by similarity (descending) and take top results
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, maxResults);
  }

  /**
   * Load chunks from storage
   */
  private async loadChunks(): Promise<void> {
    if (!this.context) return;

    const stored = this.context.globalState.get<Record<string, EmbeddingChunk[]>>(this.STORAGE_KEY);
    if (stored) {
      this.chunks = new Map(Object.entries(stored));
    }
  }

  /**
   * Save chunks to storage
   */
  private async saveChunks(): Promise<void> {
    if (!this.context) return;

    const obj: Record<string, EmbeddingChunk[]> = {};
    for (const [key, value] of this.chunks.entries()) {
      obj[key] = value;
    }

    await this.context.globalState.update(this.STORAGE_KEY, obj);
  }

  /**
   * Clear all embeddings
   */
  async clear(): Promise<void> {
    this.chunks.clear();
    await this.saveChunks();
  }
}

// Singleton instance
export const embedderService = new EmbedderService();
