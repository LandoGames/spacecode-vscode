// @ts-nocheck

import * as vscode from 'vscode';
import { getPersonaPrompt } from '../../../personas/PromptLoader';
import { buildModelLabels } from '../../config/models';
import { SoundService } from '../../services/soundService';
import { messageStore } from '../../../memory/MessageStore';

export function createChatImpl(panel: any) {
  function buildModelIdentityPrompt(provider: 'claude' | 'gpt'): string {
    try {
      const config = vscode.workspace.getConfiguration('spacecode');
      const modelId = provider === 'claude'
        ? (config.get<string>('claudeModel') || panel._currentModel)
        : (config.get<string>('gptModel') || panel._currentModel);

      if (!modelId) return '';

      const labels = buildModelLabels();
      const modelLabel = labels[modelId] || modelId;

      return `If the user asks about your model identity or version, answer exactly: \"You are running on ${modelLabel} (${modelId}).\"`;
    } catch {
      return '';
    }
  }

  async function handleSideChatMessage(chatIndex: number, userMessage: string): Promise<void> {
    try {
      const identityPrompt = buildModelIdentityPrompt('claude');
      const result = await panel.orchestrator.askSingle('claude', userMessage, identityPrompt, [], undefined);

      await panel.costTracker.recordUsage(
        'claude',
        result.model,
        result.tokens,
        result.cost,
        'sidechat'
      );

      panel._postMessage({
        type: 'sideChatResponse',
        chatIndex,
        response: result.content || 'No response received.',
      });
    } catch (error) {
      panel._postMessage({
        type: 'sideChatResponse',
        chatIndex,
        response: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }

  async function startMastermindConversation(config: {
    mode: 'collaborate' | 'code-review' | 'debate';
    topic: string;
    maxTurns: number;
    responseStyle: 'concise' | 'detailed';
    autoSummarize: boolean;
    includeSelection?: boolean;
    initialContext?: string;
  }): Promise<void> {
    try {
      let initialContext = config.topic || '';

      if (config.includeSelection) {
        const editor = vscode.window.activeTextEditor;
        if (editor && !editor.selection.isEmpty) {
          const selectedText = editor.document.getText(editor.selection);
          initialContext = selectedText + (config.topic ? '\n\n' + config.topic : '');
        }
      }

      const orchestratorMode = config.mode === 'code-review' ? 'code-review' :
                               config.mode === 'debate' ? 'debate' : 'collaborate';

      await panel.orchestrator.startConversation({
        mode: orchestratorMode,
        maxTurns: config.maxTurns,
        initialContext,
        topic: config.topic,
        responseStyle: config.responseStyle,
        autoSummarize: config.autoSummarize,
      });
    } catch (error) {
      panel._postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to start MasterMind conversation',
      });
    }
  }

  async function handleSendMessage(message: any): Promise<void> {
    const { text, mode, chatMode, includeSelection, injectContext, docTarget, images, history, claudeSessionId, chatId, profile, sectorId, gptConsult, gptInterventionLevel, persona } = message;

    const provider = (mode === 'claude' || mode === 'gpt') ? mode : 'claude';

    // Load persona system prompt
    const personaId = persona || 'nova';
    let personaPrompt = getPersonaPrompt(personaId);
    const identityPrompt = buildModelIdentityPrompt(provider);
    if (identityPrompt) {
      personaPrompt = `${personaPrompt}\n\n${identityPrompt}`;
    }

    console.log(`[SpaceCode DEBUG] ========== MESSAGE RECEIVED ==========`);
    console.log(`[SpaceCode DEBUG] chatId: ${chatId}`);
    console.log(`[SpaceCode DEBUG] mode: ${mode}`);
    console.log(`[SpaceCode DEBUG] claudeSessionId: ${claudeSessionId}`);
    console.log(`[SpaceCode DEBUG] history length: ${history?.length || 0}`);
    if (history && history.length > 0) {
      console.log(`[SpaceCode DEBUG] history contents:`);
      history.forEach((h: { role: string; content: string }, i: number) => {
        console.log(`[SpaceCode DEBUG]   [${i}] ${h.role}: ${(h.content || '').substring(0, 100)}...`);
      });
    } else {
      console.log(`[SpaceCode DEBUG] history is EMPTY or undefined`);
    }
    console.log(`[SpaceCode DEBUG] =====================================`);

    panel._currentChatId = chatId;

    let context = text;
    if (typeof profile === 'string' && (profile === 'yard' || profile === 'scout' || profile === 'battleship')) {
      panel._shipProfile = profile;
    }
    if (typeof sectorId === 'string') {
      panel._shipSectorId = sectorId;
    }
    if (typeof docTarget === 'string') {
      panel._docTarget = docTarget;
    }
    if (!panel._requireDocTarget('Send message')) {
      panel._postMessage({
        type: 'error',
        message: 'Select a docs file before sending when not in Yard.',
        chatId,
      });
      return;
    }

    if (injectContext) {
      const injected = panel._buildContextPreviewText();
      context = `${injected}\n\n---\n\n${context}`;
    }

    if (includeSelection && !injectContext) {
      const editor = vscode.window.activeTextEditor;
      if (editor && !editor.selection.isEmpty) {
        const selectedText = editor.document.getText(editor.selection);
        const language = editor.document.languageId;
        context = `${text}\n\n\
\
\
\`\`\`${language}\n${selectedText}\n\`\`\``;
      }
    }

    try {
      panel._postMessage({
        type: 'aiFlowStart',
        query: text,
        queryTokens: Math.ceil(text.length / 4)
      });

      await new Promise(r => setTimeout(r, 100));

      const sectorConfig = panel._sectorRules?.get(panel._shipSectorId);
      const hasActualRules = sectorConfig?.rules && sectorConfig.rules.length > 0;
      if (panel._shipSectorId && hasActualRules) {
        const rules = sectorConfig?.rules || '';
        panel._postMessage({
          type: 'aiFlowChunk',
          chunk: rules,
          source: 'sectorRules',
          label: `${panel._shipSectorId.toUpperCase()} Sector Rules`,
          tokens: Math.ceil(rules.length / 4)
        });
      }

      await new Promise(r => setTimeout(r, 100));

      let contextSources = [] as any[];
      if (panel._gatheredContext?.contextItems?.length) {
        contextSources = panel._gatheredContext.contextItems;
      } else if (panel._gatheredContext?.previewItems?.length) {
        contextSources = panel._gatheredContext.previewItems;
      }

      const sourcesToShow = contextSources.slice(0, 6);
      if (sourcesToShow.length > 0) {
        for (const source of sourcesToShow) {
          panel._postMessage({
            type: 'aiFlowChunk',
            chunk: source.preview || source.content || '',
            source: 'context',
            label: source.label || source.path || 'Context',
            tokens: Math.ceil((source.preview || source.content || '').length / 4)
          });
          await new Promise(r => setTimeout(r, 50));
        }
      }

      // Check if history needs compaction before sending to AI
      let effectiveHistory = history || [];
      if (effectiveHistory.length > 0 && panel.orchestrator.needsCompaction(effectiveHistory)) {
        panel._postMessage({
          type: 'aiFlowThinking',
          stage: 'Compacting conversation history...',
          provider: 'system',
        });
        try {
          const compactionResult = await panel.orchestrator.compactHistory(effectiveHistory);
          effectiveHistory = compactionResult.compacted;
          // Notify frontend about compaction
          panel._postMessage({
            type: 'compacted',
            summary: compactionResult.summary,
            originalMessageCount: (history || []).length,
            keptMessageCount: effectiveHistory.length,
            chatId,
          });
        } catch (compErr) {
          console.error('[SpaceCode] Compaction failed, using full history:', compErr);
        }
      }

      // Context gathering phase done — start AI thinking animation
      // Get the actual model label for display
      const spacecodeConfig = vscode.workspace.getConfiguration('spacecode');
      const modelId = provider === 'claude'
        ? (spacecodeConfig.get<string>('claudeModel') || panel._currentModel)
        : (spacecodeConfig.get<string>('gptModel') || panel._currentModel);
      const labels = buildModelLabels();
      const modelLabel = labels[modelId] || (provider === 'claude' ? 'Claude' : 'GPT');

      panel._postMessage({
        type: 'aiFlowThinking',
        stage: `${modelLabel} generating response...`,
        provider,
        modelLabel,
      });

      const result = await panel.orchestrator.askSingle(
        provider,
        context,
        personaPrompt,    // persona system prompt
        effectiveHistory,
        claudeSessionId,
        chatId
      );

      // Persist messages to memory store
      try {
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        const sessionId = chatId || 'default';
        await messageStore.addMessage({
          sessionId, workspacePath, role: 'user', content: text,
          tags: [persona || 'nova'], metadata: { provider },
        });
        if (result?.content) {
          await messageStore.addMessage({
            sessionId, workspacePath, role: 'assistant', content: result.content,
            tags: [persona || 'nova'], metadata: { provider, model: result.model },
          });
        }
      } catch (memErr) {
        console.error('[SpaceCode] Message persistence error (non-fatal):', memErr);
      }

      // Turn is already posted to webview via orchestrator 'turn' event → mainPanel listener.
      const willConsultGpt = gptConsult && provider === 'claude' && result?.content;

      if (willConsultGpt) {
        // GPT consultation will handle its own aiFlowComplete
        panel._postMessage({ type: 'complete', stats: result || {}, chatId, gptConsultPending: true });
        panel._postMessage({ type: 'gptConsultStarted', chatId });
        await panel._autoConsultGpt(text, result.content, history || [], chatId, gptInterventionLevel || 'balanced');
        SoundService.getInstance().play('aiComplete');
      } else {
        // Normal completion — stop flow and generation state
        panel._postMessage({ type: 'aiFlowComplete' });
        panel._postMessage({ type: 'complete', stats: result || {}, chatId });
        SoundService.getInstance().play('aiComplete');
      }
    } catch (error: any) {
      panel._postMessage({ type: 'aiFlowComplete', error: true });
      panel._postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
        chatId,
      });
      SoundService.getInstance().play('aiError');
    }
  }

  return {
    handleSendMessage,
    handleSideChatMessage,
    startMastermindConversation,
  };
}
