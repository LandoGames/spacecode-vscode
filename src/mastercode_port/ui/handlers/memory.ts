// @ts-nocheck

import { messageStore } from '../../../memory/MessageStore';
import { vectorStore } from '../../../memory/VectorStore';
import { embeddingService } from '../../../memory/EmbeddingService';

export async function handleMemoryMessage(panel: any, message: any): Promise<boolean> {
  switch (message.type) {
    // Chat history persistence
    case 'memorySaveMessage': {
      try {
        const workspacePath = panel._getWorkspacePath?.() || '';
        await messageStore.addMessage({
          sessionId: message.sessionId || 'default',
          workspacePath,
          role: message.role || 'user',
          content: message.content || '',
          tags: message.tags || [],
          metadata: message.metadata || {},
        });
      } catch (e) {
        console.error('[SpaceCode] Memory save error:', e);
      }
      return true;
    }

    case 'memoryGetSession': {
      try {
        const messages = await messageStore.getSessionMessages(
          message.sessionId || 'default',
          message.limit || 100,
        );
        panel._postMessage({ type: 'memorySessionMessages', sessionId: message.sessionId, messages });
      } catch (e) {
        panel._postMessage({ type: 'memorySessionMessages', sessionId: message.sessionId, messages: [], error: e?.message });
      }
      return true;
    }

    case 'memorySearch': {
      try {
        const workspacePath = panel._getWorkspacePath?.() || '';
        const results = await messageStore.searchMessages(
          message.query || '',
          message.limit || 20,
          workspacePath,
        );
        panel._postMessage({ type: 'memorySearchResults', results, query: message.query });
      } catch (e) {
        panel._postMessage({ type: 'memorySearchResults', results: [], error: e?.message });
      }
      return true;
    }

    case 'memoryGetRecent': {
      try {
        const workspacePath = panel._getWorkspacePath?.() || '';
        const messages = await messageStore.getRecentMessages(
          message.limit || 50,
          workspacePath,
        );
        panel._postMessage({ type: 'memoryRecentMessages', messages });
      } catch (e) {
        panel._postMessage({ type: 'memoryRecentMessages', messages: [], error: e?.message });
      }
      return true;
    }

    case 'memoryDeleteSession': {
      try {
        await messageStore.deleteSession(message.sessionId);
        panel._postMessage({ type: 'memorySessionDeleted', sessionId: message.sessionId });
      } catch (e) {
        console.error('[SpaceCode] Memory delete session error:', e);
      }
      return true;
    }

    // Embedding operations
    case 'memoryEmbed': {
      try {
        const chunks = await embeddingService.chunkAndEmbed(
          message.text || '',
          message.sourceId || 'manual',
          message.sourceType || 'note',
        );
        for (const chunk of chunks) {
          await vectorStore.addChunk(chunk);
        }
        panel._postMessage({
          type: 'memoryEmbedResult',
          chunksCreated: chunks.length,
          sourceId: message.sourceId,
        });
      } catch (e) {
        panel._postMessage({ type: 'memoryEmbedError', error: e?.message || 'Embed failed' });
      }
      return true;
    }

    case 'memoryVectorSearch': {
      try {
        const queryEmbedding = await embeddingService.embed(message.query || '');
        const results = await vectorStore.search(
          queryEmbedding,
          message.limit || 10,
          message.filters || {},
        );
        panel._postMessage({ type: 'memoryVectorResults', results, query: message.query });
      } catch (e) {
        panel._postMessage({ type: 'memoryVectorResults', results: [], error: e?.message });
      }
      return true;
    }

    // Stats
    case 'memoryGetStats': {
      try {
        const msgStats = messageStore.getStats();
        const vecStats = vectorStore.getStats();
        const embStatus = embeddingService.getStatus();
        panel._postMessage({
          type: 'memoryStats',
          stats: {
            messages: msgStats,
            vectors: vecStats,
            embedding: embStatus,
          },
        });
      } catch (e) {
        panel._postMessage({ type: 'memoryStats', stats: {}, error: e?.message });
      }
      return true;
    }

    // Vacuum / cleanup
    case 'memoryVacuum': {
      try {
        messageStore.vacuum();
        panel._postMessage({ type: 'memoryVacuumDone' });
      } catch (e) {
        console.error('[SpaceCode] Memory vacuum error:', e);
      }
      return true;
    }

    default:
      return false;
  }
}
