// @ts-nocheck

import { messageStore } from '../../../memory/MessageStore';

export async function handleDashboardMessage(panel: any, message: any): Promise<boolean> {
  switch (message.type) {
    case 'getDashboardMetrics': {
      const metrics = {
        openTickets: 0,
        activePlans: 0,
        runningAgents: 0,
        tokensToday: 0,
      };

      try {
        if (panel.ticketStore) {
          const tickets = await panel.ticketStore.getAll?.() || [];
          metrics.openTickets = tickets.filter((t: any) => t.status === 'open' || t.status === 'in-progress').length;
        }
        if (panel.costTracker) {
          metrics.tokensToday = panel.costTracker.getTodayTokens?.() || 0;
        }
      } catch (e) {
        console.error('[SpaceCode] Dashboard metrics error:', e);
      }

      panel._postMessage({ type: 'dashboardMetrics', metrics });
      return true;
    }

    case 'getRecentActivity': {
      const activities: any[] = [];

      try {
        if (panel.costTracker?.getRecentActivity) {
          const recent = panel.costTracker.getRecentActivity() || [];
          activities.push(...recent);
        }
      } catch (e) {
        console.error('[SpaceCode] Recent activity error:', e);
      }

      panel._postMessage({ type: 'recentActivity', activities });
      return true;
    }

    case 'getDbStats': {
      const stats = {
        vectorCount: 0,
        storageUsed: 0,
        collections: [],
      };

      try {
        if (panel.knowledgeBase?.getStats) {
          const kbStats = await panel.knowledgeBase.getStats();
          Object.assign(stats, kbStats);
        }
      } catch (e) {
        console.error('[SpaceCode] DB stats error:', e);
      }

      panel._postMessage({ type: 'dbStats', stats });
      return true;
    }

    case 'getLogs': {
      const logs: any[] = [];
      panel._postMessage({ type: 'logs', logs, channel: 'system' });
      return true;
    }

    // Mission Panel (8.1)
    case 'getMissionData': {
      const mission = {
        openTickets: 0,
        activePlans: 0,
        pendingJobs: 0,
        completedToday: 0,
        approvalQueue: [] as any[],
        milestones: [] as any[],
        pendingTasks: [] as any[],
      };
      try {
        if (panel.ticketStore) {
          const tickets = await panel.ticketStore.getAll?.() || [];
          mission.openTickets = tickets.filter((t: any) => t.status === 'open' || t.status === 'in-progress').length;
        }
        // Pending jobs from autoexecute
        const jobs = panel._context?.globalState?.get('spacecode.autoexecuteJobs', []) || [];
        mission.pendingJobs = jobs.filter((j: any) => j.status === 'pending').length;
        mission.approvalQueue = jobs.filter((j: any) => j.status === 'pending').slice(0, 20);
        // Milestones from globalState
        mission.milestones = panel._context?.globalState?.get('spacecode.milestones', []) || [];
      } catch (e) {
        console.error('[SpaceCode] Mission data error:', e);
      }
      panel._postMessage({ type: 'missionData', mission });
      return true;
    }

    case 'createMilestone': {
      try {
        const milestones = panel._context?.globalState?.get('spacecode.milestones', []) || [];
        const milestone = {
          id: 'ms_' + Date.now(),
          title: message.title || 'New Milestone',
          description: message.description || '',
          targetDate: message.targetDate || null,
          status: 'active',
          createdAt: Date.now(),
        };
        milestones.push(milestone);
        await panel._context?.globalState?.update('spacecode.milestones', milestones);
        panel._postMessage({ type: 'milestoneCreated', milestone, milestones });
      } catch (e) {
        console.error('[SpaceCode] Create milestone error:', e);
      }
      return true;
    }

    case 'updateMilestone': {
      try {
        const milestones = panel._context?.globalState?.get('spacecode.milestones', []) || [];
        const idx = milestones.findIndex((m: any) => m.id === message.milestoneId);
        if (idx >= 0) {
          Object.assign(milestones[idx], message.updates || {});
          await panel._context?.globalState?.update('spacecode.milestones', milestones);
          panel._postMessage({ type: 'milestoneUpdated', milestones });
        }
      } catch (e) {
        console.error('[SpaceCode] Update milestone error:', e);
      }
      return true;
    }

    // Storage Panel (8.2)
    case 'getStorageStats': {
      const storage = {
        type: 'globalState + SQLite',
        location: '.spacecode/',
        chatCount: 0,
        chatMax: 10000,
        embeddingCount: 0,
        embeddingMax: 50000,
        planCount: 0,
        planMax: 1000,
        ticketCount: 0,
        ticketMax: 5000,
        handoffCount: 0,
        handoffMax: 100,
        dbPath: '',
      };
      try {
        // Read real chat count from MessageStore SQLite
        const msgStats = messageStore.getStats();
        storage.chatCount = msgStats.totalMessages || 0;
        storage.dbPath = (messageStore as any).dbPath || '';
        if (panel.ticketStore) {
          const tickets = await panel.ticketStore.getAll?.() || [];
          storage.ticketCount = tickets.length;
        }
        if (panel.knowledgeBase?.getStats) {
          const kbStats = await panel.knowledgeBase.getStats();
          storage.embeddingCount = kbStats.vectorCount || 0;
        }
        // Count plans from globalState
        const plans = panel._context?.globalState?.get('spacecode.plans', []) || [];
        storage.planCount = Array.isArray(plans) ? plans.length : 0;
      } catch (e) {
        console.error('[SpaceCode] Storage stats error:', e);
      }
      panel._postMessage({ type: 'storageStats', storage });
      return true;
    }

    case 'getRecentDbMessages': {
      try {
        const recent = messageStore.getRecentMessages(message.limit || 50);
        panel._postMessage({ type: 'recentDbMessages', messages: recent });
      } catch (e) {
        console.error('[SpaceCode] getRecentDbMessages error:', e);
        panel._postMessage({ type: 'recentDbMessages', messages: [], error: e?.message });
      }
      return true;
    }

    case 'clearChatHistory': {
      try {
        await panel._context?.globalState?.update('spacecode.chatHistory', []);
        panel._postMessage({ type: 'storageClearResult', target: 'chat', success: true });
      } catch (e) {
        panel._postMessage({ type: 'storageClearResult', target: 'chat', success: false, error: e?.message });
      }
      return true;
    }

    case 'clearEmbeddings': {
      try {
        if (panel.knowledgeBase?.clear) {
          await panel.knowledgeBase.clear();
        }
        panel._postMessage({ type: 'storageClearResult', target: 'embeddings', success: true });
      } catch (e) {
        panel._postMessage({ type: 'storageClearResult', target: 'embeddings', success: false, error: e?.message });
      }
      return true;
    }

    case 'clearAllStorage': {
      try {
        await panel._context?.globalState?.update('spacecode.chatHistory', []);
        await panel._context?.globalState?.update('spacecode.plans', []);
        await panel._context?.globalState?.update('spacecode.milestones', []);
        if (panel.knowledgeBase?.clear) await panel.knowledgeBase.clear();
        panel._postMessage({ type: 'storageClearResult', target: 'all', success: true });
      } catch (e) {
        panel._postMessage({ type: 'storageClearResult', target: 'all', success: false, error: e?.message });
      }
      return true;
    }

    case 'exportStorageData': {
      try {
        const data = {
          chatHistory: panel._context?.globalState?.get('spacecode.chatHistory', []),
          plans: panel._context?.globalState?.get('spacecode.plans', []),
          milestones: panel._context?.globalState?.get('spacecode.milestones', []),
          settings: panel._context?.globalState?.get('spacecode.settings', {}),
          exportedAt: new Date().toISOString(),
        };
        panel._postMessage({ type: 'storageExportResult', data });
      } catch (e) {
        panel._postMessage({ type: 'storageExportError', error: e?.message || 'Export failed' });
      }
      return true;
    }

    // Art Studio Panel (8.4)
    case 'getArtStudioData': {
      const artData = {
        styleGuide: null as any,
        colors: [] as string[],
        recentAssets: [] as any[],
      };
      try {
        if (panel.artStudioManager) {
          artData.styleGuide = panel.artStudioManager.getStyleGuide?.() || null;
          artData.colors = panel.artStudioManager.getColorPalette?.() || [];
          artData.recentAssets = panel.artStudioManager.getRecentAssets?.() || [];
        }
      } catch (e) {
        console.error('[SpaceCode] Art studio error:', e);
      }
      panel._postMessage({ type: 'artStudioData', artData });
      return true;
    }

    case 'generateArtImage': {
      panel._postMessage({ type: 'artGenerationStarted' });
      try {
        // This will be wired to Gemini API integration in future
        panel._postMessage({
          type: 'artGenerationResult',
          status: 'not_configured',
          message: 'Image generation requires Gemini API key. Configure in Settings > API Keys.',
        });
      } catch (e) {
        panel._postMessage({ type: 'artGenerationError', error: e?.message || 'Generation failed' });
      }
      return true;
    }

    default:
      return false;
  }
}
