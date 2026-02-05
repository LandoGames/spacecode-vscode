// @ts-nocheck

import * as vscode from 'vscode';
import { getMemoryStats } from '../../../memory';
import { logger, LogChannel } from '../../services/logService';

export function createKbImpl(panel: any) {
  async function sendKbEntries(): Promise<void> {
    const entries = panel.knowledgeBase.getAllEntries();
    const tags = panel.knowledgeBase.getAllTags();
    const stats = panel.knowledgeBase.getEmbeddingStats();
    panel._postMessage({ type: 'kbEntries', entries, tags });
    panel._postMessage({ type: 'embedderStatus', status: panel.knowledgeBase.getEmbedderStatus(), stats });
  }

  async function sendDocsStats(): Promise<void> {
    try {
      const entries = panel.knowledgeBase.getAllEntries();
      const tags = panel.knowledgeBase.getAllTags();
      const stats = panel.knowledgeBase.getEmbeddingStats();

      panel._postMessage({
        type: 'docsStats',
        stats: {
          totalDocs: entries.length,
          embeddedDocs: stats.embeddedEntries,
          totalChunks: stats.totalChunks,
          tags: tags,
          sources: entries.map((e: any) => ({
            id: e.id,
            title: e.title,
            type: e.type,
            embedded: e.embedded,
            chunkCount: e.embedded ? 1 : 0,
          })),
        },
      });
    } catch (error) {
      panel._postMessage({
        type: 'docsStats',
        stats: { totalDocs: 0, embeddedDocs: 0, totalChunks: 0, tags: [], sources: [] },
        error: error instanceof Error ? error.message : 'Failed to load docs stats',
      });
    }
  }

  async function sendDbStats(): Promise<void> {
    try {
      const memStats = getMemoryStats();

      panel._postMessage({
        type: 'dbStats',
        stats: {
          messages: memStats.messages,
          vectors: memStats.vectors,
          embedding: memStats.embedding,
        },
      });
    } catch (error) {
      panel._postMessage({
        type: 'dbStats',
        stats: {
          messages: { count: 0, sessions: 0 },
          vectors: { count: 0, dimensions: 0 },
          embedding: { ready: false, model: null },
        },
        error: error instanceof Error ? error.message : 'Failed to load DB stats',
      });
    }
  }

  async function sendLogs(channel?: LogChannel, limit: number = 100): Promise<void> {
    try {
      const history = logger.getHistory(channel, limit);

      panel._postMessage({
        type: 'logs',
        logs: history.map(entry => ({
          timestamp: entry.timestamp.toISOString(),
          channel: entry.channel,
          level: entry.level,
          message: entry.message,
          data: entry.data,
        })),
        channel,
      });
    } catch (error) {
      panel._postMessage({
        type: 'logs',
        logs: [],
        error: error instanceof Error ? error.message : 'Failed to load logs',
      });
    }
  }

  async function addKbUrl(url: string, tags: string[]): Promise<void> {
    try {
      await panel.knowledgeBase.addUrl(url, tags);
      await sendKbEntries();
      panel._postMessage({ type: 'kbAdded' });
    } catch (error) {
      panel._postMessage({
        type: 'error',
        message: `Failed to add URL: ${error}`,
      });
    }
  }

  async function crawlWebsite(url: string, tags: string[], options: { maxPages?: number; maxDepth?: number }): Promise<void> {
    try {
      const result = await panel.knowledgeBase.crawlWebsite(
        url,
        tags,
        options,
        (progress: any) => {
          panel._postMessage({
            type: 'crawlProgress',
            progress,
          });
        }
      );

      await sendKbEntries();

      if (result.errors.length > 0) {
        vscode.window.showWarningMessage(
          `Crawled ${result.added} pages with ${result.errors.length} errors`
        );
      } else {
        vscode.window.showInformationMessage(
          `Successfully crawled ${result.added} pages from ${url}`
        );
      }
    } catch (error) {
      panel._postMessage({
        type: 'crawlProgress',
        progress: { status: 'error', error: error instanceof Error ? error.message : 'Unknown error', crawled: 0, total: 0, currentUrl: '' },
      });
      panel._postMessage({
        type: 'error',
        message: `Failed to crawl website: ${error}`,
      });
    }
  }

  async function addKbPdf(base64Data: string, fileName: string, tags: string[]): Promise<void> {
    try {
      const buffer = Buffer.from(base64Data, 'base64');
      await panel.knowledgeBase.addPdf(buffer, fileName, tags);
      await sendKbEntries();
      panel._postMessage({ type: 'kbAdded' });
      vscode.window.showInformationMessage(`PDF "${fileName}" added to Knowledge Base`);
    } catch (error) {
      panel._postMessage({
        type: 'error',
        message: `Failed to add PDF: ${error}`,
      });
    }
  }

  async function sendEmbedderStatus(): Promise<void> {
    const status = panel.knowledgeBase.getEmbedderStatus();
    const stats = panel.knowledgeBase.getEmbeddingStats();
    panel._postMessage({ type: 'embedderStatus', status, stats });
  }

  async function downloadEmbeddingModel(modelId?: string): Promise<void> {
    panel._postMessage({ type: 'modelDownloadStarted' });

    const result = await panel.knowledgeBase.downloadEmbeddingModel(modelId, (progress: any) => {
      panel._postMessage({ type: 'modelDownloadProgress', progress });
    });

    if (result.success) {
      vscode.window.showInformationMessage('Embedding model downloaded successfully!');
      await sendEmbedderStatus();
    } else {
      panel._postMessage({
        type: 'error',
        message: `Failed to download model: ${result.error}`,
      });
    }
  }

  async function setEmbeddingModel(modelId: string): Promise<void> {
    try {
      await panel.knowledgeBase.setEmbeddingModel(modelId);
      await sendEmbedderStatus();
    } catch (error) {
      panel._postMessage({
        type: 'error',
        message: `Failed to set model: ${error}`,
      });
    }
  }

  async function embedEntry(id: string): Promise<void> {
    panel._postMessage({ type: 'embeddingStarted', id });

    const result = await panel.knowledgeBase.embedEntry(id, (current: number, total: number) => {
      panel._postMessage({ type: 'embeddingProgress', id, current, total });
    });

    if (result.success) {
      await sendKbEntries();
      await sendEmbedderStatus();
    } else {
      panel._postMessage({
        type: 'error',
        message: `Failed to embed entry: ${result.error}`,
      });
    }
  }

  async function embedAllEntries(): Promise<void> {
    panel._postMessage({ type: 'embedAllStarted' });

    const result = await panel.knowledgeBase.embedAllEntries(
      (entryIndex: number, totalEntries: number, chunkIndex: number, totalChunks: number) => {
        panel._postMessage({
          type: 'embedAllProgress',
          entryIndex,
          totalEntries,
          chunkIndex,
          totalChunks,
        });
      }
    );

    if (result.embedded > 0 || result.failed === 0) {
      vscode.window.showInformationMessage(
        `Embedded ${result.embedded} entries${result.failed > 0 ? `, ${result.failed} failed` : ''}`
      );
    } else {
      vscode.window.showErrorMessage(`Embedding failed: ${result.errors.join(', ')}`);
    }

    await sendKbEntries();
    await sendEmbedderStatus();
  }

  return {
    sendKbEntries,
    sendDocsStats,
    sendDbStats,
    sendLogs,
    addKbUrl,
    crawlWebsite,
    addKbPdf,
    sendEmbedderStatus,
    downloadEmbeddingModel,
    setEmbeddingModel,
    embedEntry,
    embedAllEntries,
  };
}
