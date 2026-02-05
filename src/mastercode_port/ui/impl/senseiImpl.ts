// @ts-nocheck

export function createSenseiImpl(panel: any) {
  async function senseiExplain(filePath: string, selection?: string): Promise<void> {
    try {
      panel._postMessage({ type: 'senseiLoading', action: 'explain' });

      const result = await panel.unityMcpClient.runExplainer(filePath, selection);

      if (result.success) {
        panel._postMessage({
          type: 'senseiExplainResult',
          filePath,
          explanation: result.content
        });
      } else {
        panel._postMessage({
          type: 'senseiError',
          action: 'explain',
          error: result.error || 'Failed to explain code'
        });
      }
    } catch (error) {
      panel._postMessage({
        type: 'senseiError',
        action: 'explain',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async function senseiContextBrief(filePath: string): Promise<void> {
    try {
      const result = await panel.unityMcpClient.getContextBrief(filePath);

      if (result.success) {
        panel._postMessage({
          type: 'senseiContextBriefResult',
          filePath,
          context: result.content
        });
      } else {
        panel._postMessage({
          type: 'senseiError',
          action: 'contextBrief',
          error: result.error || 'Failed to get context brief'
        });
      }
    } catch (error) {
      panel._postMessage({
        type: 'senseiError',
        action: 'contextBrief',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async function senseiAssemblyGraph(assemblyName?: string): Promise<void> {
    try {
      const result = await panel.unityMcpClient.getAssemblyGraph(assemblyName);

      if (result.success) {
        panel._postMessage({
          type: 'senseiAssemblyGraphResult',
          assemblyName,
          graph: result.content
        });
      } else {
        panel._postMessage({
          type: 'senseiError',
          action: 'assemblyGraph',
          error: result.error || 'Failed to get assembly graph'
        });
      }
    } catch (error) {
      panel._postMessage({
        type: 'senseiError',
        action: 'assemblyGraph',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async function senseiSyncDocs(filePath?: string, sectorId?: string): Promise<void> {
    try {
      panel._postMessage({ type: 'senseiLoading', action: 'syncDocs' });

      const result = await panel.unityMcpClient.syncDocs(filePath, sectorId);

      if (result.success) {
        panel._postMessage({
          type: 'senseiSyncDocsResult',
          filePath,
          sectorId,
          result: result.content
        });
      } else {
        panel._postMessage({
          type: 'senseiError',
          action: 'syncDocs',
          error: result.error || 'Failed to sync docs'
        });
      }
    } catch (error) {
      panel._postMessage({
        type: 'senseiError',
        action: 'syncDocs',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async function senseiAIReview(filePath?: string, diff?: string): Promise<void> {
    try {
      panel._postMessage({ type: 'senseiLoading', action: 'aiReview' });

      const result = await panel.unityMcpClient.runAIReview(filePath, diff);

      if (result.success) {
        panel._postMessage({
          type: 'senseiAIReviewResult',
          filePath,
          review: result.content
        });
      } else {
        panel._postMessage({
          type: 'senseiError',
          action: 'aiReview',
          error: result.error || 'Failed to run AI review'
        });
      }
    } catch (error) {
      panel._postMessage({
        type: 'senseiError',
        action: 'aiReview',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  return {
    senseiExplain,
    senseiContextBrief,
    senseiAssemblyGraph,
    senseiSyncDocs,
    senseiAIReview,
  };
}
