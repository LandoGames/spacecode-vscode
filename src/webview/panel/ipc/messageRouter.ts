// @ts-nocheck

export function createMessageRouter(deps) {
  const {
    escapeHtml,
    shipSetStatus,
    setUnityButtonsLoading,
    updateUnityMCPStatus,
    updateUnityStatus,
    updateUnityConsole,
    updateUnityPanelInfo,
    renderCliStatus,
    renderMcpServers,
    renderKbEntries,
    handleCrawlProgress,
    renderEmbedderStatus,
    updateModelDownloadProgress,
    setModelDownloading,
    updateEmbeddingProgress,
    updateEmbedAllProgress,
    setEmbeddingAll,
    renderCosts,
    loadVoiceSettings,
    updateVoiceDownloadProgress,
    handleMicTestStatus,
    handleSpeakerTestStatus,
    finalizeStreamingMessage,
    addMessage,
    createMessageHtml,
    addToMessageHistory,
    appendToStreamingMessage,
    updateResponseNode,
    updateLiveResponseText,
    getFlowResponseTokens,
    setGenerating,
    updateTokenBar,
    stopThreadAnimation,
    stopParticleSpawning,
    stopParticleFlow,
    getChatSplitActive,
    syncChatSplitMirror,
    setFlowThinking,
    setAiStage,
    clearContextSources,
    hideLiveResponse,
    showLiveResponse,
    startAiFlow,
    spawnFlowChunk,
    addContextSourceCard,
    renderAiFlow,
    clearAiFlow,
    populateDocTargets,
    updateDocInfo,
    setShipSelectedSectorId,
    setShipSelectedSubId,
    setShipProfile,
    getShipSelectedSectorId,
    setShipAutoexecute,
    shipRender,
    shipUpdateChips,
    updateStationLabels,
    renderAsmdefInventory,
    renderAsmdefPolicyEditor,
    renderAsmdefGraph,
    renderAsmdefCheckResult,
    renderSectorMap,
    asmdefRefresh,
    setCoordinatorPill,
    updateCoordinatorSummary,
    updateCoordinatorLastIssue,
    getLastCoordinatorToast,
    setLastCoordinatorToast,
    showToast,
    renderJobList,
    renderPlanningPanel,
    setContextPreview,
    renderPlanList,
    renderPlanSummary,
    setPlanExecutionButtonsEnabled,
    updateDiffSummary,
    updatePlanComparison,
    updateTestResult,
    renderTicketList,
    renderTicketsListMain,
    renderSkillsList,
    updateDashboardMetrics,
    renderActivityList,
    updateDocsPanel,
    updateDbPanel,
    updateLogsPanel,
    updateAIReview,
    setWorkflows,
    handleWorkflowEvent,
    autoResize,
    sendMessage,
    loadGitSettings,
    loadConnectionMethods,
    showCompactionNotice,
    showPlanExecutionPanel,
    hidePlanStepGate,
    clearPlanExecutionLog,
    setPlanExecutionStatus,
    setPlanExecutionProgress,
    appendPlanExecutionLog,
    getChatSessions,
    getCurrentChatId,
    getUnityConnected,
    setUnityConnected,
    getGptFlowPending,
    setGptFlowPending,
    getPlanTemplates,
    setPlanTemplates,
    getPlanList,
    setPlanList,
    getCurrentPlanData,
    setCurrentPlanData,
    getTicketList,
    setTicketList,
    getPlanExecutionState,
    setPlanExecutionState,
    restoreChatState,
    handleToolbarSettings,
    mergePricing,
    updateSettings,
    handleApiKeyValue,
    handleDevExportSuccess,
    handleDevImportSuccess,
    handleDevExportError,
    handleDevImportError,
    renderUsageStats,
    engineerRenderStatus,
    engineerRenderSuggestions,
    engineerRenderHistory,
    engineerRenderPrompt,
    engineerHandleDelegated,
    engineerCheckSectors,
    autopilotRenderStatus,
    autopilotRenderStepResult,
    autopilotRenderSessionPrompt,
    autopilotRenderConfig,
    gameuiRenderState,
    gameuiRenderCatalog,
    gameuiRenderEvent,
    gameuiRenderThemes,
    dbRenderConnectionList,
    dbRenderSchema,
    dbRenderQueryResult,
    dbRenderTestResult,
    chatSearchRenderResults,
    commsRenderState,
    commsRenderScanDetail,
    commsRenderScanStarted,
    commsRenderScanCompleted,
    commsRenderPrompt,
    opsRenderState,
    opsRenderCommandOutput,
    opsRenderRecentOps,
    renderDiagnosticsResult,
    renderDiagnosticsProgress,
    vscode,
  } = deps;

  function formatRelativeTime(ts) {
    if (!ts) return 'never';
    const delta = Math.max(0, Date.now() - ts);
    const sec = Math.floor(delta / 1000);
    if (sec < 60) return sec + 's ago';
    const min = Math.floor(sec / 60);
    if (min < 60) return min + 'm ago';
    const hr = Math.floor(min / 60);
    if (hr < 24) return hr + 'h ago';
    const days = Math.floor(hr / 24);
    return days + 'd ago';
  }

  function handleMessage(msg) {
    const chatSessions = getChatSessions();
    const currentChatId = getCurrentChatId();
    let unityConnected = getUnityConnected();
    let _gptFlowPending = getGptFlowPending();
    let planTemplates = getPlanTemplates();
    let planList = getPlanList();
    let currentPlanData = getCurrentPlanData();
    let ticketList = getTicketList();
    let planExecutionState = getPlanExecutionState();
    let lastCoordinatorToast = getLastCoordinatorToast();
    const chatSplitActive = getChatSplitActive();


      switch (msg.type) {
        case 'info':
          // Display info messages in status bar
          if (msg.message) {
            shipSetStatus(msg.message);
            console.log('[SpaceCode UI] Info:', msg.message);
            // Re-enable buttons and reset Unity status if this is a Unity-related message
            if (msg.message.toLowerCase().includes('unity')) {
              setUnityButtonsLoading(false);
              const statusEl = document.getElementById('unityStatus');
              if (statusEl && (statusEl.textContent === '● Loading...' || statusEl.textContent === '● Running...')) {
                statusEl.className = 'unity-status connected';
                statusEl.textContent = '● Connected';
                unityConnected = true;
                setUnityConnected(unityConnected);
                updateUnityMCPStatus(true);
              }
            }
          }
          break;

        case 'error':
          // Stop generation state for chat errors
          setGenerating(false, msg.chatId);
          // Display error in status bar
          if (msg.message) {
            shipSetStatus('Error: ' + msg.message);
            console.error('[SpaceCode UI] Error:', msg.message);
            // Show error in chat if it matches current chat
            if (!msg.chatId || msg.chatId === currentChatId) {
              addMessage('system', 'Error: ' + msg.message);
            }
            // Re-enable buttons on Unity-related errors
            const msgLower = msg.message.toLowerCase();
            if (msgLower.includes('unity') || msgLower.includes('coplay') || msgLower.includes('mcp') || msgLower.includes('reload')) {
              setUnityButtonsLoading(false);
              const isConnectionError = msgLower.includes('not connected') ||
                                        msgLower.includes('connection failed') ||
                                        msgLower.includes('failed to connect') ||
                                        (msgLower.includes('timed out') && !msgLower.includes('script'));
              if (isConnectionError) {
                const statusEl = document.getElementById('unityStatus');
                if (statusEl) {
                  statusEl.className = 'unity-status disconnected';
                  statusEl.textContent = '● Disconnected';
                  unityConnected = false;
                  setUnityConnected(unityConnected);
                  updateUnityMCPStatus(false);
                }
              }
            }
          }
          break;

        case 'turn':
          // Only add to visible UI if this is the current chat
          if (!msg.chatId || msg.chatId === currentChatId) {
            // Finalize any streaming message before adding the complete turn
            finalizeStreamingMessage(msg.chatId || currentChatId);
            addMessage(msg.turn.provider, msg.turn.message, msg.turn.response);
          } else {
            // Store message HTML in the background chat's session
            const session = chatSessions[msg.chatId];
            if (session) {
              // Append message HTML to session's stored messages
              const msgHtml = createMessageHtml(msg.turn.provider, msg.turn.message, msg.turn.response);
              session.messagesHtml = (session.messagesHtml || '') + msgHtml;
            }
          }
          // Add AI response to the correct chat's message history
          if (msg.turn.provider === 'claude' || msg.turn.provider === 'gpt') {
            addToMessageHistory('assistant', msg.turn.message, msg.chatId || currentChatId);
          }
          break;

        case 'chunk':
          // Stream chunk for real-time display
          if (!msg.chatId || msg.chatId === currentChatId) {
            appendToStreamingMessage(msg.provider, msg.chunk, msg.chatId || currentChatId);
            // Update AI Flow response node (estimate ~4 chars per token)
            if (typeof updateResponseNode === 'function' && msg.chunk) {
              const estimatedTokens = Math.ceil(msg.chunk.length / 4);
              updateResponseNode(estimatedTokens);
              // Also update live response text in the new UI
              if (typeof updateLiveResponseText === 'function') {
                const responseTokens = getFlowResponseTokens();
                updateLiveResponseText(msg.chunk, responseTokens || estimatedTokens);
              }
            }
          }
          break;

        case 'status':
          document.getElementById('statusText').textContent = msg.status.message;
          break;

        case 'complete':
          setGenerating(false, msg.chatId);
          // Update token bar for the chat that completed
          updateTokenBar(msg.chatId || currentChatId);
          // If GPT consultation is about to start, set flag to keep flow alive
          if (msg.gptConsultPending) {
            _gptFlowPending = true;
            setGptFlowPending(_gptFlowPending);
          } else {
            // Safety: stop flow animations if aiFlowComplete didn't fire
            stopThreadAnimation();
            stopParticleSpawning();
            stopParticleFlow();
          }
          // Sync chat split mirror if active
          if (chatSplitActive) syncChatSplitMirror();
          break;

        case 'gptConsultStarted':
          // Show that GPT consultation is in progress
          {
            const chatContainer = document.getElementById('chatMessages');
            if (chatContainer) {
              // Remove any previous "consulting" indicator
              const prev = chatContainer.querySelector('.gpt-consult-pending');
              if (prev) prev.remove();
              const div = document.createElement('div');
              div.className = 'message gpt-consult-pending';
              div.innerHTML = '<span class="consult-check" style="opacity:0.7;">⟳ Consulting GPT...</span>';
              chatContainer.appendChild(div);
              chatContainer.scrollTop = chatContainer.scrollHeight;
            }
          }
          break;

        case 'gptOpinionResponse':
          // Legacy: direct GPT opinion (kept for manual 2nd opinion button)
          {
            const chatContainer = document.getElementById('chatMessages');
            if (chatContainer) {
              const pending = chatContainer.querySelector('.gpt-consult-pending');
              if (pending) pending.remove();
              const div = document.createElement('div');
              div.className = 'message gpt';
              div.innerHTML = '<div class="message-avatar">GPT</div><div class="message-content">' + (typeof marked !== 'undefined' ? marked.parse(msg.response) : escapeHtml(msg.response)) + '</div>';
              chatContainer.appendChild(div);
              chatContainer.scrollTop = chatContainer.scrollHeight;
              if (chatSplitActive) syncChatSplitMirror();
            }
          }
          break;

        case 'gptConsultRefined':
          // Claude's refined answer after GPT peer review
          {
            // Clear GPT flow pending flag and finalize flow
            _gptFlowPending = false;
            setGptFlowPending(_gptFlowPending);
            setFlowThinking(false);
            stopThreadAnimation();
            stopParticleSpawning();
            stopParticleFlow();
            const refinedPhaseEl = document.getElementById('flowPanelPhase');
            if (refinedPhaseEl) refinedPhaseEl.textContent = 'Complete';

            const chatContainer = document.getElementById('chatMessages');
            if (chatContainer) {
              // Remove pending indicator
              const pending = chatContainer.querySelector('.gpt-consult-pending');
              if (pending) pending.remove();
              const div = document.createElement('div');
              div.className = 'message claude refined-message';
              const renderedContent = typeof marked !== 'undefined' ? marked.parse(msg.response) : escapeHtml(msg.response);
              const gptFeedbackHtml = msg.gptFeedback
                ? (typeof marked !== 'undefined' ? marked.parse(msg.gptFeedback) : escapeHtml(msg.gptFeedback))
                : '';
              div.innerHTML =
                '<div class="message-avatar refined-avatar">C</div>' +
                '<div class="message-content">' +
                  '<div class="refined-badge">Refined with 2nd opinion</div>' +
                  renderedContent +
                  '<div class="refined-intro">The original answer was refined based on GPT\'s analysis.</div>' +
                  (gptFeedbackHtml ? (
                    '<details class="gpt-feedback-details">' +
                      '<summary class="gpt-feedback-summary">GPT feedback</summary>' +
                      '<div class="gpt-feedback-content">' + gptFeedbackHtml + '</div>' +
                    '</details>'
                  ) : '') +
                '</div>';
              chatContainer.appendChild(div);
              chatContainer.scrollTop = chatContainer.scrollHeight;
              if (chatSplitActive) syncChatSplitMirror();
            }
          }
          break;

        case 'gptConsultComplete':
          // Subtle indicator that GPT was consulted
          {
            // Clear GPT flow pending flag and finalize flow
            _gptFlowPending = false;
            setGptFlowPending(_gptFlowPending);
            setFlowThinking(false);
            stopThreadAnimation();
            stopParticleSpawning();
            stopParticleFlow();
            const completePhaseEl = document.getElementById('flowPanelPhase');
            if (completePhaseEl) completePhaseEl.textContent = 'Complete';

            const chatContainer = document.getElementById('chatMessages');
            if (chatContainer) {
              // Remove pending indicator
              const pending = chatContainer.querySelector('.gpt-consult-pending');
              if (pending) pending.remove();
              const div = document.createElement('div');
              div.className = 'message gpt-consult-silent';
              if (msg.error) {
                div.innerHTML = '<span class="consult-check consult-error">GPT consult: ' + msg.error + '</span>';
              } else if (msg.hadInput) {
                div.innerHTML = '<span class="consult-check">GPT reviewed — original answer stands</span>';
              } else {
                div.innerHTML = '<span class="consult-check">GPT reviewed — no additional input</span>';
              }
              chatContainer.appendChild(div);
              chatContainer.scrollTop = chatContainer.scrollHeight;
            }
          }
          break;

        case 'sideChatResponse':
          // Legacy side chat - no longer used
          break;

        case 'summary':
          // Show summary in a special styled message
          addMessage('summary', msg.content);
          break;

        case 'compacted':
          // Show context compaction notice
          showCompactionNotice(msg.summary, msg.originalMessageCount, msg.keptMessageCount);
          break;


        case 'restoreChatState':
          // Restore chat tabs and messages from saved state
          if (msg.state) {
            restoreChatState(msg.state);
          }
          break;

        case 'settings':
          // Update settings UI with connection methods and API key status
          loadConnectionMethods(msg.settings);
          if (updateSettings) {
            updateSettings(msg.settings);
          }
          break;

        case 'keysSaved':
          // Refresh settings to update API key status display
          if (vscode) {
            vscode.postMessage({ type: 'getSettings' });
          }
          break;

        case 'apiKeyValue':
          // Received actual API key value from backend for reveal feature
          if (handleApiKeyValue) {
            handleApiKeyValue(msg.provider, msg.value);
          }
          break;

        case 'devExportSuccess':
          if (handleDevExportSuccess) handleDevExportSuccess(msg.path);
          break;

        case 'devImportSuccess':
          if (handleDevImportSuccess) handleDevImportSuccess();
          break;

        case 'devExportError':
          if (handleDevExportError) handleDevExportError(msg.error);
          break;

        case 'devImportError':
          if (handleDevImportError) handleDevImportError(msg.error);
          break;

        case 'connectionMethodsSaved':
          // Confirmation handled by VS Code notification
          break;

        case 'soundSettings':
          // Load sound settings into the UI
          if (typeof window.loadSoundSettingsUI === 'function') {
            window.loadSoundSettingsUI(msg);
          }
          break;

        case 'cliStatus':
          renderCliStatus(msg.status);
          break;

        case 'mcpServers':
          renderMcpServers(msg.servers);
          break;

        case 'unityMCPAvailable':
          updateUnityMCPStatus(msg.available);
          break;

        case 'insertChatMessage':
          // Insert a message into the chat input and optionally send it
          const chatInputEl = document.getElementById('messageInput');
          if (chatInputEl) {
            chatInputEl.value = msg.message;
            if (msg.autoSend) {
              sendMessage();
            }
          } else {
            console.error('[SpaceCode] messageInput element not found');
          }
          break;

        case 'unityPanelUpdate':
          // Update Unity panel with info from Claude's response
          if (typeof updateUnityPanelInfo === 'function') {
            updateUnityPanelInfo(msg.info);
          }
          break;

        case 'kbEntries':
          renderKbEntries(msg.entries);
          break;

        case 'crawlProgress':
          handleCrawlProgress(msg.progress);
          break;

        case 'embedderStatus':
          renderEmbedderStatus(msg.status, msg.stats);
          break;

        case 'modelDownloadProgress':
          updateModelDownloadProgress(msg.progress);
          break;

        case 'modelDownloadStarted':
          setModelDownloading(true);
          break;

        case 'embeddingProgress':
          updateEmbeddingProgress(msg.id, msg.current, msg.total);
          break;

        case 'embedAllProgress':
          updateEmbedAllProgress(msg.entryIndex, msg.totalEntries, msg.chunkIndex, msg.totalChunks);
          break;

        case 'embedAllStarted':
          setEmbeddingAll(true);
          break;

        case 'costs':
          renderCosts(msg);
          break;

        case 'usageStats':
          if (renderUsageStats) {
            renderUsageStats(msg);
          }
          break;

        // Voice-related messages
        case 'voiceSettings':
          loadVoiceSettings(msg.settings);
          break;

        case 'voiceDownloadProgress':
          updateVoiceDownloadProgress(msg.engine, msg.progress, msg.status);
          break;

        case 'micTestStatus':
          handleMicTestStatus(msg.status, msg.message);
          break;

        case 'speakerTestStatus':
          handleSpeakerTestStatus(msg.status, msg.message);
          break;

        case 'whisperDownloadStarted': {
          const btn = document.getElementById('whisperBinaryDownloadBtn');
          if (btn) { btn.disabled = true; btn.textContent = 'Downloading...'; }
          break;
        }

        case 'whisperDownloadComplete': {
          const btn = document.getElementById('whisperBinaryDownloadBtn');
          if (btn) {
            btn.disabled = false;
            if (msg.success) {
              btn.textContent = '✓ Installed';
              btn.classList.add('success');
            } else {
              btn.textContent = 'Download Binary';
              // Show error in status area if exists
              const statusEl = document.getElementById('whisperStatus');
              if (statusEl && msg.error) {
                statusEl.textContent = 'Error: ' + msg.error;
                statusEl.style.color = 'var(--error-color)';
              }
            }
          }
          break;
        }

        case 'activeBreadcrumb': {
          const el = document.getElementById('codeBreadcrumb');
          if (el) {
            el.textContent = msg.breadcrumb || 'No active file';
            if (msg.filePath) el.title = msg.filePath;
          }
          break;
        }

        // Ship UI messages
        case 'shipSelected':
          if (msg.sectorId) {
            setShipSelectedSectorId(msg.sectorId);
            shipRender();
            updateStationLabels();
          }
          if (msg.profile) {
            setShipProfile(msg.profile);
            const sel = document.getElementById('shipProfileSelect');
            if (sel) sel.value = msg.profile;
            updateStationLabels();
          }
          break;

        case 'shipSectorDetected':
          // Auto-detected sector from active file path
          if (msg.sectorId && msg.sectorId !== getShipSelectedSectorId()) {
            setShipSelectedSectorId(msg.sectorId);
            setShipSelectedSubId(null);
            shipRender();
            updateStationLabels();
            // Show detection status
            const fileName = msg.filePath ? msg.filePath.split('/').pop() : '';
            shipSetStatus('Auto-detected: ' + (msg.sectorName || msg.sectorId) + (fileName ? ' (from ' + fileName + ')' : ''));
          }
          break;

	        case 'shipAutoexecute':
	          setShipAutoexecute(!!msg.enabled);
	          shipUpdateChips();
	          break;

	        case 'shipContextPack':
	          if (msg.injectionText) {
	            // Keep it lightweight: show a short notice and allow user to inspect via the Settings/Context Pack UI later.
	            shipSetStatus('Context Pack ready for ' + (msg.sectorId || getShipSelectedSectorId()) + '.');
	            addMessage('system', 'Context Pack (preview):\\n' + msg.injectionText);
	          }
	          break;

        case 'shipGateResult':
          shipSetStatus((msg.ok ? 'Gates passed' : 'Gates failed'));
          // Update Verification section box
          const gatesBox = document.getElementById('gatesResult');
          const gatesStatus = document.getElementById('gatesResultStatus');
          const gatesContent = document.getElementById('gatesResultContent');
	          if (gatesBox && gatesStatus && gatesContent) {
	            gatesBox.style.display = 'block';
	            gatesStatus.textContent = msg.ok ? '✅ PASSED' : '❌ FAILED';
	            gatesStatus.style.color = msg.ok ? '#4caf50' : '#f44336';
	            gatesContent.textContent = msg.summary || 'No details';
	          }
	          // Update Control tab box (more visible!)
	          const ctrlBox = document.getElementById('controlGatesResult');
	          const ctrlStatus = document.getElementById('controlGatesStatus');
	          const ctrlContent = document.getElementById('controlGatesContent');
	          if (ctrlBox && ctrlStatus && ctrlContent) {
	            ctrlBox.style.display = 'block';
	            ctrlBox.style.borderLeftColor = msg.ok ? '#4caf50' : '#f44336';
	            ctrlStatus.textContent = msg.ok ? '✅ PASSED' : '❌ FAILED';
	            ctrlStatus.style.color = msg.ok ? '#4caf50' : '#f44336';
	            ctrlContent.textContent = msg.summary || 'No details';
          }
          break;

        case 'shipDocsStatus':
          shipSetStatus(msg.summary || 'Docs status updated.');
          break;

        case 'asmdefInventory':
          renderAsmdefInventory(msg.inventory || null);
          shipSetStatus('Asmdef inventory loaded.');
          break;

        case 'asmdefPolicyGenerated':
          shipSetStatus('Asmdef policy generated.');
          if (msg.policyPath) {
            addMessage('system', 'Asmdef policy generated at:\\n' + msg.policyPath);
          }
          // Refresh inventory to show policy info
          asmdefRefresh();
          break;

        case 'asmdefPolicyMode':
          shipSetStatus('Asmdef policy set to ' + (msg.mode || 'strict') + '.');
          if (msg.policyPath) {
            addMessage('system', 'Asmdef policy updated:\\n' + msg.policyPath);
          }
          asmdefRefresh();
          break;

        case 'asmdefPolicy':
          renderAsmdefPolicyEditor(msg);
          shipSetStatus('Asmdef policy loaded.');
          break;

        case 'asmdefPolicySaved':
          shipSetStatus('Asmdef policy saved.');
          if (msg.policyPath) {
            addMessage('system', 'Asmdef policy saved to:\\n' + msg.policyPath);
          }
          asmdefRefresh();
          break;

        case 'asmdefGuidsNormalized':
          if (msg.result) {
            const count = msg.result.replacements || 0;
            shipSetStatus(count ? ('Normalized ' + count + ' GUID refs.') : 'No GUID refs to normalize.');
            if (Array.isArray(msg.result.warnings) && msg.result.warnings.length) {
              addMessage('system', 'GUID normalize warnings:\\n' + msg.result.warnings.join('\\n'));
            }
          }
          asmdefRefresh();
          break;

        case 'asmdefGraph':
          renderAsmdefGraph(msg.graph || null);
          shipSetStatus('Asmdef graph loaded.');
          break;

        case 'asmdefCheckResult':
          renderAsmdefCheckResult(msg.result || null);
          shipSetStatus('Asmdef validation complete.');
          break;

        case 'sectorMapData':
          if (typeof renderSectorMap === 'function') {
            renderSectorMap(msg);
            // Update summary text
            const smSummary = document.getElementById('sectorMapSummaryText');
            const smBadge = document.getElementById('sectorMapBadge');
            const smHealthBadge = document.getElementById('sectorMapHealthBadge');
            if (smSummary) {
              const sCount = (msg.sectors || []).length;
              const vCount = msg.totalViolations || 0;
              smSummary.textContent = sCount + ' sectors' + (vCount ? ' \u00B7 ' + vCount + ' violations' : ' \u00B7 All clear');
            }
            if (smBadge) {
              smBadge.textContent = (msg.sectors || []).length + ' sectors';
            }
            // Overall project health from avgHealth + trend indicator
            if (smHealthBadge && typeof msg.avgHealth === 'number') {
              const pct = Math.round(msg.avgHealth * 100);
              const hColor = pct >= 90 ? '#22c55e' : pct >= 70 ? '#f59e0b' : '#ef4444';
              const hLabel = pct >= 90 ? 'Healthy' : pct >= 70 ? 'Warning' : 'Critical';
              // Health trend: store history and show arrow
              let trendArrow = '';
              try {
                const TREND_KEY = 'spacecode.healthTrend';
                const raw = localStorage.getItem(TREND_KEY);
                const history = raw ? JSON.parse(raw) : [];
                history.push({ t: Date.now(), h: msg.avgHealth });
                // Keep last 10 entries
                while (history.length > 10) history.shift();
                localStorage.setItem(TREND_KEY, JSON.stringify(history));
                if (history.length >= 2) {
                  const prev = history[history.length - 2].h;
                  const diff = msg.avgHealth - prev;
                  if (diff > 0.02) trendArrow = ' \u2191';
                  else if (diff < -0.02) trendArrow = ' \u2193';
                  else trendArrow = ' \u2192';
                }
              } catch (_e) { /* ignore localStorage errors */ }
              smHealthBadge.textContent = '\u25CF ' + hLabel + ' (' + pct + '%)' + trendArrow;
              smHealthBadge.style.color = hColor;
            } else if (smHealthBadge) {
              if (msg.passed === true) {
                smHealthBadge.textContent = '\u25CF Healthy';
                smHealthBadge.style.color = '#22c55e';
              } else if (msg.passed === false) {
                smHealthBadge.textContent = '\u25CF Violations';
                smHealthBadge.style.color = '#ef4444';
              } else {
                smHealthBadge.textContent = '';
              }
            }

            // Append cycles and orphan info to summary
            if (smSummary) {
              if (msg.cycles && msg.cycles.length > 0) {
                smSummary.textContent += ' \u00B7 ' + msg.cycles.length + ' cycle(s)';
              }
              if (msg.orphanFileCount > 0) {
                smSummary.textContent += ' \u00B7 ' + msg.orphanFileCount + ' unmapped files';
              }
            }

            // Tier banner
            const tierBanner = document.getElementById('sectorMapTierBanner');
            if (tierBanner) {
              if (msg.tier === 'mapped') {
                tierBanner.style.display = 'block';
                tierBanner.textContent = '\u2139 Sector config found but no .asmdef files detected. Dependency validation is limited to sector rules only.';
                tierBanner.style.borderColor = 'rgba(245,158,11,0.3)';
                tierBanner.style.color = '#f59e0b';
              } else if (msg.tier === 'empty') {
                tierBanner.style.display = 'block';
                tierBanner.textContent = '\u2139 No sector config or .asmdef files found. Add a .spacecode/sectors.json to define project sectors.';
                tierBanner.style.borderColor = 'rgba(100,130,170,0.3)';
                tierBanner.style.color = 'var(--text-secondary)';
              } else {
                tierBanner.style.display = 'none';
              }
            }

            shipSetStatus('Sector map loaded.');
          }
          break;

        case 'sectorMapDetail': {
          const card = document.getElementById('sectorDetailCard');
          const nameEl = document.getElementById('sectorDetailName');
          const techEl = document.getElementById('sectorDetailTech');
          const healthEl = document.getElementById('sectorDetailHealth');
          const depsEl = document.getElementById('sectorDetailDeps');
          const descEl = document.getElementById('sectorDetailDesc');
          const boundariesEl = document.getElementById('sectorDetailBoundaries');
          const boundariesListEl = document.getElementById('sectorDetailBoundariesList');
          const violationsEl = document.getElementById('sectorDetailViolations');
          const violationsListEl = document.getElementById('sectorDetailViolationsList');
          const scriptsEl = document.getElementById('sectorDetailScripts');
          if (card && msg.sector) {
            card.style.display = 'block';
            card.style.borderLeftColor = msg.sector.color || '#6366f1';
            if (nameEl) {
              nameEl.textContent = msg.sector.name;
              nameEl.dataset.sectorId = msg.sector.id;
            }
            if (techEl) techEl.textContent = msg.sector.id + ' \u00B7 ' + (msg.sector.paths || []).join(', ');
            if (healthEl) healthEl.textContent = msg.sector.approvalRequired ? '\u26A0 Approval required for changes' : '';
            if (depsEl) depsEl.textContent = (msg.sector.dependencies || []).length > 0
              ? 'Dependencies: ' + msg.sector.dependencies.join(', ')
              : 'No dependencies';
            if (descEl) descEl.textContent = msg.sector.description || '';

            // Boundaries (paths)
            if (boundariesEl && boundariesListEl) {
              const paths = msg.sector.paths || [];
              if (paths.length > 0) {
                boundariesEl.style.display = 'block';
                boundariesListEl.innerHTML = paths.map(function(p) {
                  return '<div style="padding:1px 0;">\u2713 ' + escapeHtml(p) + '</div>';
                }).join('');
              } else {
                boundariesEl.style.display = 'none';
              }
            }

            // Violations
            if (violationsEl && violationsListEl) {
              const violations = msg.sector.violations || [];
              if (violations.length > 0) {
                violationsEl.style.display = 'block';
                violationsListEl.innerHTML = violations.map(function(v) {
                  return '<div style="padding:1px 0; color:#f87171;">\u2717 ' +
                    escapeHtml((v.asmdefName || v.asmdef || '?') + ' \u2192 ' + (v.reference || v.ref || '?')) +
                    (v.suggestion ? '<div style="color:var(--text-secondary); margin-left:14px;">' + escapeHtml(v.suggestion) + '</div>' : '') +
                    '</div>';
                }).join('');
              } else {
                violationsEl.style.display = 'none';
              }
            }

            // Scripts count
            if (scriptsEl) {
              const scripts = msg.sector.scripts || 0;
              if (scripts > 0) {
                scriptsEl.style.display = 'block';
                scriptsEl.textContent = 'Assemblies: ' + scripts;
              } else {
                scriptsEl.style.display = 'none';
              }
            }
          }
          break;
        }

        // --- Sector Configuration UI (CF-8) ---

        case 'sectorConfigData': {
          const list = document.getElementById('sectorConfigList');
          const templateSelect = document.getElementById('sectorTemplateSelect');
          const statusEl = document.getElementById('sectorConfigStatus');
          if (list) {
            list.innerHTML = '';
            const sectors = msg.sectors || [];
            sectors.forEach(function(s: any, idx: number) {
              const row = document.createElement('div');
              row.className = 'sector-config-row';
              row.dataset.index = String(idx);
              row.dataset.description = s.description || '';
              row.dataset.rules = s.rules || '';
              row.dataset.icon = s.icon || 'cpu';
              row.innerHTML =
                '<div style="display:flex; gap:4px; align-items:center;">' +
                  '<input type="color" value="' + (s.color || '#6366f1') + '" class="sector-color-input" />' +
                  '<input type="text" value="' + escapeHtml(s.id || '') + '" class="sector-id-input" style="width:80px;" />' +
                  '<input type="text" value="' + escapeHtml(s.name || '') + '" class="sector-name-input" style="flex:1;" />' +
                  '<button class="btn-secondary" onclick="sectorConfigRemoveRow(this)" style="padding:2px 6px; font-size:10px;">&#x2715;</button>' +
                '</div>' +
                '<div style="display:flex; gap:4px; margin-top:3px;">' +
                  '<input type="text" value="' + escapeHtml((s.paths || []).join(', ')) + '" class="sector-paths-input" style="flex:1;" placeholder="Paths: **/Folder/**" />' +
                '</div>' +
                '<div style="display:flex; gap:4px; margin-top:3px;">' +
                  '<input type="text" value="' + escapeHtml((s.dependencies || []).join(', ')) + '" class="sector-deps-input" style="flex:1;" placeholder="Dependencies: core, inventory" />' +
                  '<label style="font-size:9px; display:flex; align-items:center; gap:2px; white-space:nowrap;"><input type="checkbox" class="sector-approval-input" ' + (s.approvalRequired ? 'checked' : '') + ' /> Approval</label>' +
                '</div>';
              list.appendChild(row);
            });
          }
          // Populate template select
          if (templateSelect && msg.templates) {
            templateSelect.innerHTML = '<option value="">(custom)</option>';
            msg.templates.forEach(function(t: any) {
              const opt = document.createElement('option');
              opt.value = t.id;
              opt.textContent = t.label + ' (' + t.sectorCount + ' sectors)';
              templateSelect.appendChild(opt);
            });
            if (msg.appliedTemplate) {
              (templateSelect as HTMLSelectElement).value = msg.appliedTemplate;
            }
          }
          if (statusEl) {
            if (msg.imported) {
              statusEl.textContent = 'Imported ' + (msg.sectors || []).length + ' sectors. Click Save to apply.';
            } else if (msg.appliedTemplate) {
              statusEl.textContent = 'Template applied. Click Save to persist.';
            } else {
              statusEl.textContent = (msg.sectors || []).length + ' sectors loaded.';
            }
          }
          break;
        }

        case 'sectorConfigSaved': {
          const statusEl2 = document.getElementById('sectorConfigStatus');
          if (statusEl2) statusEl2.textContent = 'Configuration saved to ' + (msg.configPath || 'disk') + '.';
          shipSetStatus('Sector configuration saved. Map refreshed.');
          break;
        }

        case 'sectorConfigSuggested': {
          const list2 = document.getElementById('sectorConfigList');
          const statusEl3 = document.getElementById('sectorConfigStatus');
          const detected = msg.sectors || [];
          if (detected.length === 0) {
            if (statusEl3) statusEl3.textContent = 'No sectors detected. Add manually or choose a template.';
            break;
          }
          // Populate the config list with suggestions
          if (list2) {
            list2.innerHTML = '';
            detected.forEach(function(s: any, idx: number) {
              const row = document.createElement('div');
              row.className = 'sector-config-row';
              row.dataset.index = String(idx);
              row.dataset.description = s.description || '';
              row.dataset.rules = s.rules || '';
              row.dataset.icon = s.icon || 'cpu';
              row.innerHTML =
                '<div style="display:flex; gap:4px; align-items:center;">' +
                  '<input type="color" value="' + (s.color || '#6366f1') + '" class="sector-color-input" />' +
                  '<input type="text" value="' + escapeHtml(s.id || '') + '" class="sector-id-input" style="width:80px;" />' +
                  '<input type="text" value="' + escapeHtml(s.name || '') + '" class="sector-name-input" style="flex:1;" />' +
                  '<span style="font-size:9px; color:var(--text-secondary); padding:0 4px;">' + escapeHtml(s.source || '') + '</span>' +
                  '<button class="btn-secondary" onclick="sectorConfigRemoveRow(this)" style="padding:2px 6px; font-size:10px;">&#x2715;</button>' +
                '</div>' +
                '<div style="display:flex; gap:4px; margin-top:3px;">' +
                  '<input type="text" value="' + escapeHtml((s.paths || []).join(', ')) + '" class="sector-paths-input" style="flex:1;" />' +
                '</div>' +
                '<div style="display:flex; gap:4px; margin-top:3px;">' +
                  '<input type="text" value="' + escapeHtml((s.dependencies || []).join(', ')) + '" class="sector-deps-input" style="flex:1;" />' +
                  '<label style="font-size:9px; display:flex; align-items:center; gap:2px; white-space:nowrap;"><input type="checkbox" class="sector-approval-input" /> Approval</label>' +
                '</div>';
              list2.appendChild(row);
            });
          }
          if (statusEl3) statusEl3.textContent = 'Detected ' + detected.length + ' sectors. Review and Save.';
          break;
        }

        case 'sectorConfigExported': {
          const statusEl4 = document.getElementById('sectorConfigStatus');
          if (statusEl4) statusEl4.textContent = 'Exported to ' + (msg.path || 'file') + '.';
          shipSetStatus('Sector config exported.');
          break;
        }

        // --- Station Engineer (Phase 1) ---

        case 'engineerStatus': {
          if (typeof engineerRenderStatus === 'function') {
            engineerRenderStatus(msg);
          }
          break;
        }

        case 'engineerSuggestions': {
          if (typeof engineerRenderSuggestions === 'function') {
            engineerRenderSuggestions(msg.suggestions || []);
            engineerCheckSectors(msg.suggestions || []);
          }
          break;
        }

        case 'engineerHistory': {
          if (typeof engineerRenderHistory === 'function') {
            engineerRenderHistory(msg.history || []);
          }
          break;
        }

        case 'engineerPrompt': {
          if (typeof engineerRenderPrompt === 'function') {
            engineerRenderPrompt(msg);
          }
          break;
        }

        case 'engineerDelegated': {
          if (typeof engineerHandleDelegated === 'function') {
            engineerHandleDelegated(msg);
          }
          break;
        }

        case 'coordinatorHealth': {
          if (msg.url) {
            const urlEl = document.getElementById('coordinatorUrlLabel');
            if (urlEl) urlEl.textContent = msg.url;
            const urlPanelEl = document.getElementById('coordinatorUrlLabelPanel');
            if (urlPanelEl) urlPanelEl.textContent = msg.url;
          }
          let healthIssue = 'none';
          if (!msg.ok) {
            healthIssue = msg.status === 'disabled' ? 'disabled' : 'disconnected';
          }
          const badge = document.getElementById('coordinatorStatusBadge');
          const badgePanel = document.getElementById('coordinatorStatusBadgePanel');
          if (badge) {
            badge.classList.remove('ok', 'bad', 'muted');
            if (msg.ok) {
              badge.textContent = 'Connected';
              badge.classList.add('ok');
              shipSetStatus('Coordinator connected.');
            } else if (msg.status === 'disabled') {
              badge.textContent = 'Disabled';
              badge.classList.add('muted');
              shipSetStatus('Coordinator disabled.');
            } else {
              badge.textContent = 'Disconnected';
              badge.classList.add('bad');
              shipSetStatus('Coordinator disconnected.');
              const key = 'coordinator-health:disconnected';
              if (lastCoordinatorToast !== key) {
                showToast('Coordinator disconnected.', 'error');
                lastCoordinatorToast = key;
                setLastCoordinatorToast(lastCoordinatorToast);
              }
            }
          }
          if (badgePanel) {
            badgePanel.classList.remove('ok', 'bad', 'muted');
            if (msg.ok) {
              badgePanel.textContent = 'Connected';
              badgePanel.classList.add('ok');
            } else if (msg.status === 'disabled') {
              badgePanel.textContent = 'Disabled';
              badgePanel.classList.add('muted');
            } else {
              badgePanel.textContent = 'Disconnected';
              badgePanel.classList.add('bad');
            }
          }
          updateCoordinatorLastIssue('coordinatorLastIssue', healthIssue);
          updateCoordinatorLastIssue('coordinatorLastIssuePanel', healthIssue);
          break;
        }

        case 'coordinatorSync': {
          const sync = msg.sync || {};
          const status = msg.status || {};
          const policyEl = document.getElementById('coordinatorPolicySync');
          const invEl = document.getElementById('coordinatorInventorySync');
          const graphEl = document.getElementById('coordinatorGraphSync');
          if (policyEl) policyEl.textContent = formatRelativeTime(sync.policy);
          if (invEl) invEl.textContent = formatRelativeTime(sync.inventory);
          if (graphEl) graphEl.textContent = formatRelativeTime(sync.graph);
          const policyStatusEl = document.getElementById('coordinatorPolicyStatus');
          const invStatusEl = document.getElementById('coordinatorInventoryStatus');
          const graphStatusEl = document.getElementById('coordinatorGraphStatus');
          setCoordinatorPill(policyStatusEl, status.policy || 'unknown');
          setCoordinatorPill(invStatusEl, status.inventory || 'unknown');
          setCoordinatorPill(graphStatusEl, status.graph || 'unknown');
          const policyPanelEl = document.getElementById('coordinatorPolicySyncPanel');
          const invPanelEl = document.getElementById('coordinatorInventorySyncPanel');
          const graphPanelEl = document.getElementById('coordinatorGraphSyncPanel');
          if (policyPanelEl) policyPanelEl.textContent = formatRelativeTime(sync.policy);
          if (invPanelEl) invPanelEl.textContent = formatRelativeTime(sync.inventory);
          if (graphPanelEl) graphPanelEl.textContent = formatRelativeTime(sync.graph);
          const policyStatusPanelEl = document.getElementById('coordinatorPolicyStatusPanel');
          const invStatusPanelEl = document.getElementById('coordinatorInventoryStatusPanel');
          const graphStatusPanelEl = document.getElementById('coordinatorGraphStatusPanel');
          setCoordinatorPill(policyStatusPanelEl, status.policy || 'unknown');
          setCoordinatorPill(invStatusPanelEl, status.inventory || 'unknown');
          setCoordinatorPill(graphStatusPanelEl, status.graph || 'unknown');
          updateCoordinatorSummary('coordinatorSummary', status);
          updateCoordinatorSummary('coordinatorSummaryPanel', status);
          const issues = ['policy', 'inventory', 'graph']
            .filter(k => status[k] && status[k] !== 'ok' && status[k] !== 'unknown');
          updateCoordinatorLastIssue('coordinatorLastIssue', issues.length ? issues.map(k => k + ':' + status[k]).join(', ') : 'none');
          updateCoordinatorLastIssue('coordinatorLastIssuePanel', issues.length ? issues.map(k => k + ':' + status[k]).join(', ') : 'none');
          if (issues.length) {
            const key = 'coordinator-sync:' + issues.map(k => k + '=' + status[k]).join(',');
            if (lastCoordinatorToast !== key) {
              showToast('Coordinator sync issues: ' + issues.map(k => k + ':' + status[k]).join(', '), 'warn');
              lastCoordinatorToast = key;
              setLastCoordinatorToast(lastCoordinatorToast);
            }
          }
          break;
        }

        case 'autoexecuteJobs':
          renderJobList(msg.jobs || []);
          break;

        case 'autoexecuteBlocked':
          shipSetStatus(msg.message || 'Action blocked; enable Autoexecute.');
          break;

        case 'planningStateUpdate':
          if (typeof renderPlanningPanel === 'function') {
            renderPlanningPanel(msg.state);
          }
          break;

        case 'planningError':
          shipSetStatus(msg.error || 'Planning error.');
          break;

        case 'contextPreview':
          if (typeof msg.text === 'string') {
            setContextPreview(msg.text);
          }
          break;

        // AI Flow visualization messages (event-driven)
        case 'aiFlowStart':
          // New query - clear and show query node
          console.log('[SpaceCode] aiFlowStart:', msg.query);
          startAiFlow(msg.query, msg.queryTokens);
          // Update new UI: Set stage to "retrieving"
          setAiStage('retrieving', 'Retrieving context...');
          clearContextSources();
          hideLiveResponse();
          break;

        case 'aiFlowChunk':
          // Chunk found - animate fly-in
          console.log('[SpaceCode] aiFlowChunk:', msg.chunk);
          if (msg.chunk) {
            spawnFlowChunk(msg.chunk);
            // Add to context sources list with actual content
            addContextSourceCard(msg.chunk);
          }
          break;

        case 'aiFlowThinking':
          // AI is processing - show thinking pulse (supports multiple concurrent AI nodes)
          console.log('[SpaceCode] aiFlowThinking:', msg.stage, 'provider:', msg.provider, 'nodeId:', msg.nodeId, 'modelLabel:', msg.modelLabel);
          setFlowThinking(true, msg.stage, msg.provider, msg.nodeId || 'main', msg.modelLabel);  // Pass provider + nodeId + modelLabel
          // Update new UI: Set stage to "generating"
          setAiStage('generating', msg.stage || 'Generating response...');
          showLiveResponse();
          break;

        case 'aiFlowComplete':
          // AI done - stop all Fate Web animations
          console.log('[SpaceCode] aiFlowComplete, tokens:', msg.tokens, 'gptFlowPending:', _gptFlowPending);
          // If GPT consultation is in progress, ignore early aiFlowComplete
          if (_gptFlowPending) {
            console.log('[SpaceCode] aiFlowComplete ignored — GPT consultation still pending');
            break;
          }
          setFlowThinking(false);
          stopThreadAnimation();  // Stop thread dash animation
          stopParticleSpawning();
          stopParticleFlow();
          // Update header
          const phaseEl = document.getElementById('flowPanelPhase');
          if (phaseEl) phaseEl.textContent = msg.error ? 'Error' : 'Complete';
          break;

        case 'aiFlowUpdate':
          // Legacy: Full context snapshot (fallback)
          console.log('[SpaceCode] aiFlowUpdate (legacy):', msg.data);
          if (msg.data) {
            renderAiFlow(msg.data);
          }
          break;

        case 'aiFlowClear':
          // Clear the flow visualization (new conversation)
          clearAiFlow();
          break;

        case 'docTargets':
          populateDocTargets(Array.isArray(msg.targets) ? msg.targets : []);
          break;

        case 'docInfo':
          updateDocInfo(msg.info || null);
          break;

        case 'unityStatus':
          setUnityButtonsLoading(false);
          updateUnityStatus(msg.status || { connected: false }, msg.token);
          break;

        case 'unityConsole':
          updateUnityConsole(msg.messages || []);
          break;

        case 'unityLogs':
          // Display Unity logs in the console area
          console.log('[SpaceCode UI] Received unityLogs:', msg.logs);
          // Re-enable buttons and reset status indicator - we got a response
          setUnityButtonsLoading(false);
          {
            const statusEl = document.getElementById('unityStatus');
            if (statusEl && (statusEl.textContent === '● Loading...' || statusEl.textContent === '● Running...')) {
              statusEl.className = 'unity-status connected';
              statusEl.textContent = '● Connected';
              unityConnected = true;
              setUnityConnected(unityConnected);
              updateUnityMCPStatus(true);
            }
          }
          if (msg.logs) {
            let logs = [];
            // Handle different formats from Coplay MCP
            if (typeof msg.logs === 'string') {
              // String format - split by newlines
              logs = msg.logs.split('\\n').filter(l => l.trim()).map(l => {
                const isError = l.includes('Error') || l.includes('Exception');
                const isWarning = l.includes('Warning');
                return { type: isError ? 'Error' : isWarning ? 'Warning' : 'Log', message: l };
              });
            } else if (Array.isArray(msg.logs)) {
              // Array format - normalize each entry
              logs = msg.logs.map(l => {
                if (typeof l === 'string') {
                  const isError = l.includes('Error') || l.includes('Exception');
                  const isWarning = l.includes('Warning');
                  return { type: isError ? 'Error' : isWarning ? 'Warning' : 'Log', message: l };
                }
                return {
                  type: l.type === 'error' ? 'Error' : l.type === 'warning' ? 'Warning' : l.type === 'log' ? 'Log' : (l.type || 'Log'),
                  message: l.message || l.text || String(l)
                };
              });
            } else if (msg.logs.logs) {
              // Nested logs object
              logs = msg.logs.logs.map(l => ({
                type: l.logType === 'Error' ? 'Error' : l.logType === 'Warning' ? 'Warning' : 'Log',
                message: l.message || l.text || String(l)
              }));
            }
            console.log('[SpaceCode UI] Normalized logs:', logs);
            if (logs.length > 0) {
              updateUnityConsole(logs);
              shipSetStatus('Showing ' + logs.length + ' log entries');
            } else {
              shipSetStatus('No logs to display');
            }
          }
          break;

        case 'unityErrors':
          // Display Unity compile errors
          console.log('[SpaceCode UI] Received unityErrors:', msg);
          // Re-enable buttons and reset status indicator - we got a response
          setUnityButtonsLoading(false);
          {
            const statusEl = document.getElementById('unityStatus');
            if (statusEl && (statusEl.textContent === '● Loading...' || statusEl.textContent === '● Running...')) {
              statusEl.className = 'unity-status connected';
              statusEl.textContent = '● Connected';
              unityConnected = true;
              setUnityConnected(unityConnected);
              updateUnityMCPStatus(true);
            }
          }
          if (msg.hasErrors && msg.errors) {
            let errorMsgs = [];
            if (typeof msg.errors === 'string') {
              errorMsgs = [{ type: 'Error', message: msg.errors }];
            } else if (Array.isArray(msg.errors)) {
              errorMsgs = msg.errors.map(e => ({ type: 'Error', message: typeof e === 'string' ? e : (e.message || String(e)) }));
            }
            console.log('[SpaceCode UI] Showing', errorMsgs.length, 'compile errors');
            updateUnityConsole(errorMsgs);
            shipSetStatus('Found ' + errorMsgs.length + ' compile error(s)');
          } else {
            // Show success message in console too
            updateUnityConsole([{ type: 'Log', message: 'No compile errors - all clear!' }]);
            shipSetStatus('No compile errors in Unity');
          }
          break;

        // Verification messages
        case 'diffResult':
          updateDiffSummary(msg.diff || null);
          break;

        case 'planComparisonResult':
          updatePlanComparison(msg.result || null);
          break;

        case 'testResult':
          updateTestResult(msg);
          break;

        case 'planTemplates':
          planTemplates = Array.isArray(msg.templates) ? msg.templates : [];
          setPlanTemplates(planTemplates);
          const templateSelect = document.getElementById('planTemplateSelect');
          if (templateSelect) {
            templateSelect.innerHTML = '<option value="">(no template)</option>';
            planTemplates.forEach(t => {
              const opt = document.createElement('option');
              opt.value = t.id;
              opt.textContent = t.name + ' (' + t.category + ')';
              templateSelect.appendChild(opt);
            });
          }
          shipSetStatus('Plan templates loaded.');
          break;

        case 'planList':
          planList = Array.isArray(msg.plans) ? msg.plans : [];
          setPlanList(planList);
          renderPlanList(planList);
          break;

        case 'planGenerated':
          currentPlanData = msg.plan || null;
          setCurrentPlanData(currentPlanData);
          renderPlanSummary(currentPlanData);
          const saveBtn = document.getElementById('savePlanBtn');
          const useBtn = document.getElementById('usePlanBtn');
          if (saveBtn) saveBtn.disabled = !currentPlanData;
          if (useBtn) useBtn.disabled = !currentPlanData;
          setPlanExecutionButtonsEnabled(!!currentPlanData);
          shipSetStatus('Plan generated.');
          break;

        case 'planLoaded':
          currentPlanData = msg.plan || null;
          setCurrentPlanData(currentPlanData);
          renderPlanSummary(currentPlanData);
          const saveBtn2 = document.getElementById('savePlanBtn');
          const useBtn2 = document.getElementById('usePlanBtn');
          if (saveBtn2) saveBtn2.disabled = !currentPlanData;
          if (useBtn2) useBtn2.disabled = !currentPlanData;
          setPlanExecutionButtonsEnabled(!!currentPlanData);
          shipSetStatus(currentPlanData ? 'Plan loaded.' : 'Plan not found.');
          break;

        case 'planSaved':
          currentPlanData = msg.plan || currentPlanData;
          setCurrentPlanData(currentPlanData);
          renderPlanSummary(currentPlanData);
          shipSetStatus('Plan saved.');
          break;

        case 'planError':
          shipSetStatus(msg.error || 'Plan error.');
          break;

        // Ticket messages
        case 'ticketList':
          ticketList = Array.isArray(msg.tickets) ? msg.tickets : [];
          setTicketList(ticketList);
          renderTicketList(ticketList);
          renderTicketsListMain(ticketList);
          break;

        case 'ticketCreated':
        case 'ticketUpdated':
          // Refresh list is already sent from backend
          break;

        case 'ticketError':
          shipSetStatus(msg.error || 'Ticket error.');
          break;

        case 'ticketRouted': {
          const agentNames = { nova: 'Nova', gears: 'Gears', index: 'Index', triage: 'Triage', vault: 'Vault', palette: 'Palette' };
          const name = agentNames[msg.assignedTo] || msg.assignedTo;
          showToast('Ticket routed to ' + name + ' (' + msg.ticketType + ')', 'success');
          shipSetStatus('Ticket assigned to ' + name);
          break;
        }

        case 'ticketRouting': {
          // Routing policy received - available for UI display
          console.log('[SpaceCode] Ticket routing policy:', msg.routing);
          break;
        }

        // ── Phase 7: Context Handoff ──────────────────────────────────────

        case 'handoffCreated': {
          if (msg.handoff) {
            showToast('Handoff sent to ' + (msg.handoff.toPersona || '?'), 'success');
            shipSetStatus('Context sent to ' + (msg.handoff.toPersona || '?'));
          }
          break;
        }

        case 'handoffNotification': {
          if (msg.handoff && msg.personaName) {
            showToast('Incoming context from ' + (msg.handoff.fromPersona || '?') + ' for ' + msg.personaName, 'info');
          }
          break;
        }

        case 'handoffList': {
          console.log('[SpaceCode] Handoffs:', msg.handoffs);
          break;
        }

        case 'handoffReceived': {
          if (msg.handoff) {
            addMessage('system', 'Context received from ' + (msg.handoff.fromPersona || '?') + ': ' + (msg.handoff.summary || ''));
          }
          break;
        }

        case 'handoffDismissed': {
          shipSetStatus('Handoff dismissed.');
          break;
        }

        // Autosolve messages
        case 'autosolveNotification': {
          if (msg.result) {
            showToast('Autosolve completed: ' + (msg.result.title || 'task'), 'success');
            shipSetStatus('Autosolve: ' + (msg.result.title || 'task completed'));
            const badge = document.getElementById('autosolveBadge');
            if (badge) {
              badge.textContent = String(msg.pendingCount || 0);
              badge.style.display = (msg.pendingCount > 0) ? 'inline-flex' : 'none';
            }
          }
          break;
        }
        case 'autosolveCreated': {
          if (msg.result) {
            showToast('Autosolve result queued: ' + (msg.result.title || ''), 'info');
          }
          break;
        }
        case 'autosolveList': {
          const listEl = document.getElementById('autosolveList');
          if (listEl && Array.isArray(msg.results)) {
            listEl.innerHTML = '';
            if (msg.results.length === 0) {
              listEl.innerHTML = '<div style="color:var(--text-secondary);font-size:11px;">No autosolve results.</div>';
            } else {
              msg.results.forEach(r => {
                const item = document.createElement('div');
                item.className = 'autosolve-item' + (r.status === 'pending' ? ' pending' : '');
                const statusColor = r.status === 'pending' ? '#f59e0b' : r.status === 'accepted' ? '#10b981' : '#9aa3b2';
                item.innerHTML =
                  '<div class="autosolve-item-header">' +
                    '<strong>' + (r.title || 'Task') + '</strong>' +
                    '<span style="color:' + statusColor + ';font-size:10px;">' + (r.status || '').toUpperCase() + '</span>' +
                  '</div>' +
                  '<div style="font-size:11px;color:var(--text-secondary);">' + (r.summary || '').slice(0, 120) + '</div>' +
                  (r.changes && r.changes.length > 0 ? '<div style="font-size:10px;color:var(--text-secondary);">' + r.changes.length + ' file(s) changed</div>' : '');
                if (r.status === 'pending') {
                  const actions = document.createElement('div');
                  actions.className = 'autosolve-actions';
                  actions.innerHTML =
                    '<button class="btn-secondary" onclick="autosolveAccept(\'' + r.id + '\')">Accept</button>' +
                    '<button class="btn-secondary" onclick="autosolveSendToIndex(\'' + r.id + '\')">Send to Index</button>' +
                    '<button class="btn-secondary" onclick="autosolveDismiss(\'' + r.id + '\')">Dismiss</button>';
                  item.appendChild(actions);
                }
                listEl.appendChild(item);
              });
            }
          }
          const asolveBadge = document.getElementById('autosolveBadge');
          if (asolveBadge) {
            asolveBadge.textContent = String(msg.pendingCount || 0);
            asolveBadge.style.display = (msg.pendingCount > 0) ? 'inline-flex' : 'none';
          }
          break;
        }
        case 'autosolveViewed':
        case 'autosolveAccepted':
        case 'autosolveDismissed':
        case 'autosolveSentToIndex': {
          vscode.postMessage({ type: 'autosolveList' });
          if (msg.type === 'autosolveSentToIndex') {
            showToast('Changes sent to Index for documentation', 'success');
          }
          break;
        }

        // Skills messages
        case 'skillsList':
          renderSkillsList(Array.isArray(msg.skills) ? msg.skills : []);
          break;

        case 'skillCreated':
        case 'skillUpdated':
          // Refresh list is sent from backend
          break;

        case 'skillError':
          shipSetStatus(msg.error || 'Skill error.');
          break;

        // Agent & Skill system messages
        case 'agentList': {
          const agentListEl = document.getElementById('agentStatusList');
          if (agentListEl && Array.isArray(msg.agents)) {
            agentListEl.innerHTML = msg.agents.map(a => {
              const statusColors = { active: '#10b981', working: '#f59e0b', idle: '#666' };
              const sc = statusColors[a.status] || '#666';
              return '<div class="agent-status-card" onclick="viewAgentDetails(\'' + a.id + '\')" style="cursor:pointer;">' +
                '<div style="display:flex;align-items:center;gap:8px;">' +
                '<span class="persona-dot" style="background:' + (a.color || '#888') + ';width:10px;height:10px;"></span>' +
                '<strong style="font-size:12px;">' + (a.name || a.id) + '</strong>' +
                '<span style="font-size:10px;color:var(--text-secondary);">' + (a.title || '') + '</span>' +
                '</div>' +
                '<div style="display:flex;align-items:center;gap:6px;">' +
                '<span style="font-size:10px;color:' + sc + ';">' + (a.status || 'idle').toUpperCase() + '</span>' +
                '</div>' +
                '</div>';
            }).join('');
          }
          break;
        }
        case 'agentDetails': {
          const detailEl = document.getElementById('agentDetailsPanel');
          if (detailEl && msg.agent) {
            const a = msg.agent;
            const skillsHtml = Array.isArray(msg.skills) ? msg.skills.map(s =>
              '<span style="display:inline-block;padding:2px 8px;background:var(--bg-hover);border-radius:12px;font-size:10px;margin:2px;">' +
              (s.command ? s.command + ' ' : '') + s.name + '</span>'
            ).join('') : '';
            detailEl.innerHTML =
              '<div style="padding:10px;">' +
              '<h4 style="color:' + (a.color || '#888') + ';margin-bottom:4px;">' + a.name + ' — ' + a.title + '</h4>' +
              '<p style="font-size:11px;color:var(--text-secondary);margin-bottom:8px;">' + (a.description || '') + '</p>' +
              '<div style="margin-bottom:6px;"><strong style="font-size:11px;">Specialties:</strong></div>' +
              (Array.isArray(a.specialties) ? '<div style="margin-bottom:8px;">' + a.specialties.map(s =>
                '<span style="display:inline-block;padding:2px 8px;background:var(--bg-tertiary);border-radius:12px;font-size:10px;margin:2px;">' + s + '</span>'
              ).join('') + '</div>' : '') +
              '<div style="margin-bottom:4px;"><strong style="font-size:11px;">Skills:</strong></div>' +
              '<div>' + skillsHtml + '</div>' +
              '</div>';
            detailEl.style.display = 'block';
          }
          break;
        }
        case 'skillList': {
          // Render into Skills tab list
          renderSkillsList(Array.isArray(msg.skills) ? msg.skills : []);
          // Also render into Agents section skill catalog
          const skillCatalogEl = document.getElementById('skillCatalog');
          if (skillCatalogEl && Array.isArray(msg.skills)) {
            const categories = {};
            msg.skills.forEach(s => {
              const cat = s.category || 'other';
              if (!categories[cat]) categories[cat] = [];
              categories[cat].push(s);
            });
            let html = '';
            for (const [cat, skills] of Object.entries(categories)) {
              html += '<div style="margin-bottom:8px;"><strong style="font-size:11px;text-transform:capitalize;">' + cat + '</strong></div>';
              html += skills.map(s =>
                '<div style="padding:4px 8px;background:var(--bg-tertiary);border-radius:4px;margin-bottom:3px;font-size:11px;display:flex;justify-content:space-between;">' +
                '<span>' + (s.command ? '<code style="color:var(--accent-color);">' + s.command + '</code> ' : '') + s.name + '</span>' +
                '<span style="color:var(--text-secondary);font-size:10px;">' + (s.agents || []).join(', ') + '</span>' +
                '</div>'
              ).join('');
            }
            skillCatalogEl.innerHTML = html || '<div style="color:var(--text-secondary);font-size:11px;">No skills available.</div>';
          }
          break;
        }
        case 'skillTriggered': {
          if (msg.skill) {
            showToast('Skill triggered: ' + msg.skill.name, 'info');
          }
          break;
        }

        // Dashboard messages
        case 'dashboardMetrics':
          updateDashboardMetrics(msg.metrics || {});
          break;

        case 'recentActivity':
          renderActivityList(Array.isArray(msg.activities) ? msg.activities : []);
          break;

        case 'docsStats':
          updateDocsPanel(msg.stats);
          break;

        // ── Phase 6: Security & Code Quality ──────────────────────────────

        case 'securityScanStarted': {
          const scanBtn = document.getElementById('securityScanBtn');
          if (scanBtn) { scanBtn.disabled = true; scanBtn.textContent = 'Scanning...'; }
          const emptyEl = document.getElementById('securityEmpty');
          if (emptyEl) emptyEl.style.display = 'none';
          shipSetStatus('Security scan started...');
          break;
        }

        case 'securityScanResult': {
          const scanBtn = document.getElementById('securityScanBtn');
          if (scanBtn) { scanBtn.disabled = false; scanBtn.textContent = 'Scan'; }
          const exportBtn = document.getElementById('securityExportBtn');
          if (exportBtn) exportBtn.disabled = false;
          const r = msg.result;
          if (!r) break;

          // Score card
          const scoreCard = document.getElementById('securityScoreCard');
          if (scoreCard) scoreCard.style.display = 'block';
          const scoreEl = document.getElementById('securityScore');
          if (scoreEl) scoreEl.textContent = String(r.score);
          const passBadge = document.getElementById('securityPassBadge');
          if (passBadge) {
            passBadge.textContent = r.passed ? 'PASSED' : 'FAILED';
            passBadge.style.background = r.passed ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)';
            passBadge.style.color = r.passed ? '#22c55e' : '#ef4444';
          }
          const summaryEl = document.getElementById('securitySummaryText');
          if (summaryEl) summaryEl.textContent = r.summary || '';
          const sev = r.findingsBySeverity || {};
          const critEl = document.getElementById('securityCritical');
          if (critEl) critEl.textContent = sev.critical ? sev.critical + ' critical' : '';
          const highEl = document.getElementById('securityHigh');
          if (highEl) highEl.textContent = sev.high ? sev.high + ' high' : '';
          const medEl = document.getElementById('securityMedium');
          if (medEl) medEl.textContent = sev.medium ? sev.medium + ' medium' : '';
          const lowEl = document.getElementById('securityLow');
          if (lowEl) lowEl.textContent = sev.low ? sev.low + ' low' : '';

          // Findings list
          const listEl = document.getElementById('securityFindingsList');
          if (listEl && Array.isArray(r.findings)) {
            if (r.findings.length === 0) {
              listEl.innerHTML = '<div style="color:var(--text-secondary); text-align:center; padding:8px;">No issues found</div>';
            } else {
              listEl.innerHTML = r.findings.slice(0, 50).map(function(f) {
                const sevColor = f.severity === 'critical' ? '#ef4444' : f.severity === 'high' ? '#f97316' : f.severity === 'medium' ? '#eab308' : '#6b7280';
                const relPath = f.file ? f.file.split('/').slice(-2).join('/') : '?';
                return '<div style="padding:4px 6px; border-left:2px solid ' + sevColor + '; margin-bottom:3px; background:var(--bg-primary); border-radius:0 4px 4px 0;">' +
                  '<div style="display:flex; justify-content:space-between;">' +
                    '<span style="color:' + sevColor + '; font-weight:600;">' + escapeHtml(f.severity.toUpperCase()) + '</span>' +
                    '<span style="color:var(--text-secondary); font-size:9px;">' + escapeHtml(f.category || '') + '</span>' +
                  '</div>' +
                  '<div>' + escapeHtml(f.title || f.message || '') + '</div>' +
                  '<div style="color:var(--text-secondary); font-size:9px;">' + escapeHtml(relPath) + ':' + (f.line || '?') + '</div>' +
                '</div>';
              }).join('');
            }
          }

          const emptyEl = document.getElementById('securityEmpty');
          if (emptyEl) emptyEl.style.display = 'none';

          shipSetStatus('Security scan: ' + (r.passed ? 'Passed' : 'Issues found') + ' (' + r.score + '/100)');
          break;
        }

        case 'securityScanError': {
          const scanBtn = document.getElementById('securityScanBtn');
          if (scanBtn) { scanBtn.disabled = false; scanBtn.textContent = 'Scan'; }
          shipSetStatus('Security scan error: ' + (msg.error || 'Unknown'));
          break;
        }

        case 'securityExportResult': {
          if (msg.markdown) {
            addMessage('system', 'Security Report:\\n' + msg.markdown);
          }
          shipSetStatus('Security report exported.');
          break;
        }

        case 'securityFixHandoff': {
          if (msg.handoff) {
            addMessage('system', 'Fix handoff created for: ' + (msg.handoff.finding?.title || 'security issue'));
          }
          break;
        }

        case 'qualityScanStarted': {
          const scanBtn = document.getElementById('qualityScanBtn');
          if (scanBtn) { scanBtn.disabled = true; scanBtn.textContent = 'Scanning...'; }
          const emptyEl = document.getElementById('qualityEmpty');
          if (emptyEl) emptyEl.style.display = 'none';
          shipSetStatus('Quality scan started...');
          break;
        }

        case 'qualityScanResult': {
          const scanBtn = document.getElementById('qualityScanBtn');
          if (scanBtn) { scanBtn.disabled = false; scanBtn.textContent = 'Scan'; }
          const exportBtn = document.getElementById('qualityExportBtn');
          if (exportBtn) exportBtn.disabled = false;
          const q = msg.result;
          if (!q) break;

          // Score card
          const scoreCard = document.getElementById('qualityScoreCard');
          if (scoreCard) scoreCard.style.display = 'block';
          const scoreEl = document.getElementById('qualityScore');
          if (scoreEl) scoreEl.textContent = String(q.score);
          const passBadge = document.getElementById('qualityPassBadge');
          if (passBadge) {
            passBadge.textContent = q.passed ? 'PASSED' : 'NEEDS WORK';
            passBadge.style.background = q.passed ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)';
            passBadge.style.color = q.passed ? '#22c55e' : '#f59e0b';
          }
          const summaryEl = document.getElementById('qualitySummaryText');
          if (summaryEl) summaryEl.textContent = q.filesScanned + ' files scanned in ' + q.duration + 'ms';

          // Metrics
          const m = q.metrics || {};
          const cxEl = document.getElementById('qualityMetricComplexity');
          if (cxEl) cxEl.textContent = 'Complexity: ' + (m.averageComplexity != null ? m.averageComplexity.toFixed(1) : '—');
          const dupEl = document.getElementById('qualityMetricDuplication');
          if (dupEl) dupEl.textContent = 'Duplication: ' + (m.duplicateLinePercentage != null ? m.duplicateLinePercentage.toFixed(1) + '%' : '—');
          const dcEl = document.getElementById('qualityMetricDeadCode');
          if (dcEl) dcEl.textContent = 'Dead code: ' + (m.deadCodePercentage != null ? m.deadCodePercentage.toFixed(1) + '%' : '—');

          // Category breakdown
          const breakdownEl = document.getElementById('qualityBreakdown');
          const catListEl = document.getElementById('qualityCategoryList');
          if (breakdownEl && catListEl && q.summary && q.summary.byCategory) {
            const cats = q.summary.byCategory;
            const catEntries = Object.entries(cats).filter(function(e) { return e[1] > 0; });
            if (catEntries.length > 0) {
              breakdownEl.style.display = 'block';
              catListEl.innerHTML = catEntries.map(function(e) {
                return '<span style="padding:2px 6px; background:var(--bg-primary); border-radius:4px; border:1px solid var(--border-color);">' +
                  escapeHtml(e[0]) + ': ' + e[1] + '</span>';
              }).join('');
            } else {
              breakdownEl.style.display = 'none';
            }
          }

          // Findings list
          const listEl = document.getElementById('qualityFindingsList');
          if (listEl && Array.isArray(q.findings)) {
            if (q.findings.length === 0) {
              listEl.innerHTML = '<div style="color:var(--text-secondary); text-align:center; padding:8px;">No issues found</div>';
            } else {
              listEl.innerHTML = q.findings.slice(0, 50).map(function(f) {
                const sevColor = f.severity === 'critical' ? '#ef4444' : f.severity === 'error' ? '#f97316' : f.severity === 'warning' ? '#eab308' : '#6b7280';
                const relPath = f.file ? f.file.split('/').slice(-2).join('/') : '?';
                return '<div style="padding:4px 6px; border-left:2px solid ' + sevColor + '; margin-bottom:3px; background:var(--bg-primary); border-radius:0 4px 4px 0;">' +
                  '<div style="display:flex; justify-content:space-between;">' +
                    '<span style="color:' + sevColor + '; font-weight:600;">' + escapeHtml(f.severity.toUpperCase()) + '</span>' +
                    '<span style="color:var(--text-secondary); font-size:9px;">' + escapeHtml(f.category || '') + '</span>' +
                  '</div>' +
                  '<div>' + escapeHtml(f.message || '') + '</div>' +
                  '<div style="color:var(--text-secondary); font-size:9px;">' + escapeHtml(relPath) + ':' + (f.line || '?') +
                    (f.suggestion ? ' — ' + escapeHtml(f.suggestion) : '') +
                  '</div>' +
                '</div>';
              }).join('');
            }
          }

          const emptyEl = document.getElementById('qualityEmpty');
          if (emptyEl) emptyEl.style.display = 'none';

          shipSetStatus('Quality scan: ' + (q.passed ? 'Passed' : 'Needs work') + ' (' + q.score + '/100)');
          break;
        }

        case 'qualityScanError': {
          const scanBtn = document.getElementById('qualityScanBtn');
          if (scanBtn) { scanBtn.disabled = false; scanBtn.textContent = 'Scan'; }
          shipSetStatus('Quality scan error: ' + (msg.error || 'Unknown'));
          break;
        }

        case 'qualityExportResult': {
          if (msg.markdown) {
            addMessage('system', 'Code Quality Report:\\n' + msg.markdown);
          }
          shipSetStatus('Quality report exported.');
          break;
        }

        // ── Phase 5: Documentation System ──────────────────────────────────

        case 'docsComplexity': {
          const btnSimple = document.getElementById('complexityBtnSimple');
          const btnComplex = document.getElementById('complexityBtnComplex');
          const hint = document.getElementById('complexityHint');
          if (btnSimple) btnSimple.classList.toggle('active', msg.complexity === 'simple');
          if (btnComplex) btnComplex.classList.toggle('active', msg.complexity === 'complex');
          if (hint) {
            if (msg.complexity === 'simple') {
              hint.textContent = 'No required docs';
            } else if (msg.complexity === 'complex') {
              hint.textContent = 'Requires GDD + SA';
            } else {
              hint.textContent = 'Choose project type';
            }
          }
          break;
        }

        case 'docsBlockState': {
          if (msg.isBlocked) {
            shipSetStatus('Docs required: ' + (msg.missingDocs || []).join(', '));
          }
          break;
        }

        case 'docsWizardState': {
          const wizSec = document.getElementById('docsWizardSection');
          if (!msg.state) {
            if (wizSec) wizSec.style.display = 'none';
            break;
          }
          if (wizSec) wizSec.style.display = 'block';
          const s = msg.state;
          const step = s.steps[s.currentStep];
          const titleEl = document.getElementById('docsWizardTitle');
          const descEl = document.getElementById('docsWizardDesc');
          const stepEl = document.getElementById('docsWizardStep');
          const contentEl = document.getElementById('docsWizardContent');
          const prevBtn = document.getElementById('docsWizardPrevBtn');
          const skipBtn = document.getElementById('docsWizardSkipBtn');
          const nextBtn = document.getElementById('docsWizardNextBtn');
          const completeBtn = document.getElementById('docsWizardCompleteBtn');

          if (titleEl) titleEl.textContent = step.title;
          if (descEl) descEl.textContent = step.description;
          if (stepEl) stepEl.textContent = `Step ${s.currentStep + 1}/${s.totalSteps}`;

          // Navigation visibility
          if (prevBtn) prevBtn.style.display = s.currentStep > 0 ? '' : 'none';
          if (skipBtn) skipBtn.style.display = step.isOptional ? '' : 'none';
          const isLast = s.currentStep === s.totalSteps - 1;
          if (nextBtn) nextBtn.style.display = isLast ? 'none' : '';
          if (completeBtn) completeBtn.style.display = isLast ? '' : 'none';

          // Render step content
          if (contentEl) {
            if (step.id === 'intro') {
              contentEl.innerHTML = `
                <div class="wizard-question">
                  <label>Project Name <span class="required">*</span></label>
                  <input type="text" id="wizProjectName" value="${escapeHtml(s.projectName || '')}" placeholder="My Game" onchange="window._wizSetProjectInfo()" />
                </div>
                <div class="wizard-question">
                  <label>Project Type</label>
                  <input type="text" id="wizProjectType" value="${escapeHtml(s.projectType || 'unity')}" placeholder="unity" onchange="window._wizSetProjectInfo()" />
                </div>`;
            } else if (step.id === 'optional') {
              const docTypes = ['art_bible','narrative','uiux','economy','audio','test_plan','level_brief'];
              const docNames = { art_bible:'Art Bible', narrative:'Narrative Bible', uiux:'UI/UX Spec', economy:'Economy Design', audio:'Audio Design', test_plan:'Test Plan', level_brief:'Level Brief' };
              contentEl.innerHTML = docTypes.map(dt => {
                const checked = s.selectedDocs.includes(dt) ? 'checked' : '';
                return `<div class="wizard-doc-toggle" onclick="window._wizToggleDoc('${dt}')">
                  <input type="checkbox" ${checked} tabindex="-1" />
                  <span>${docNames[dt] || dt}</span>
                  <span class="doc-priority optional">optional</span>
                </div>`;
              }).join('');
            } else if (step.id === 'review') {
              contentEl.innerHTML = `
                <p style="font-size:12px; color:var(--text-secondary);">The following documents will be generated:</p>
                <ul style="font-size:12px; margin:6px 0; padding-left:20px;">
                  ${s.selectedDocs.map(d => `<li>${d}</li>`).join('')}
                </ul>`;
            } else if (step.docType) {
              // Questionnaire step — request questions from backend
              contentEl.innerHTML = '<div style="color:var(--text-secondary); font-size:12px;">Loading questionnaire...</div>';
              deps.vscode.postMessage({ type: 'docsWizardGetQuestionnaire', docType: step.docType });
            }
          }
          break;
        }

        case 'docsQuestionnaire': {
          const contentEl = document.getElementById('docsWizardContent');
          if (!contentEl || !Array.isArray(msg.questions)) break;
          contentEl.innerHTML = msg.questions.map(q => {
            const tag = q.multiline ? 'textarea' : 'input';
            const reqMark = q.required ? '<span class="required">*</span>' : '';
            return `<div class="wizard-question">
              <label>${escapeHtml(q.question)} ${reqMark}</label>
              <${tag} data-qid="${q.id}" placeholder="${escapeHtml(q.placeholder || '')}" class="wiz-answer" ${tag === 'input' ? 'type="text"' : ''}></${tag}>
            </div>`;
          }).join('');
          // Store docType for answer collection
          contentEl.dataset.docType = msg.docType;
          break;
        }

        case 'docsWizardComplete': {
          const wizSec = document.getElementById('docsWizardSection');
          if (wizSec) wizSec.style.display = 'none';
          if (Array.isArray(msg.results)) {
            const created = msg.results.filter(r => r.status === 'created').length;
            const updated = msg.results.filter(r => r.status === 'updated').length;
            const errors = msg.results.filter(r => r.status === 'error').length;
            showToast(`Docs generated: ${created} created, ${updated} updated${errors ? ', ' + errors + ' errors' : ''}`, errors ? 'warning' : 'success');
          }
          // Refresh summary
          deps.vscode.postMessage({ type: 'docsGetSummary' });
          break;
        }

        case 'docsSummary': {
          const bar = document.getElementById('docsSummaryBar');
          if (bar) bar.style.display = 'block';
          const ids = { docsSummaryTotal: msg.total, docsSummaryCurrent: msg.current, docsSummaryDraft: msg.draft, docsSummaryMissing: msg.missing };
          Object.entries(ids).forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = String(val || 0);
          });
          const healthEl = document.getElementById('docsSummaryHealth');
          if (healthEl) {
            healthEl.textContent = (msg.healthScore || 0) + '%';
            healthEl.style.color = msg.healthScore >= 80 ? 'var(--success-color)' : msg.healthScore >= 50 ? 'var(--warning-color)' : 'var(--error-color)';
          }
          break;
        }

        case 'docsScanResult': {
          showToast(`Scan complete: ${(msg.documents || []).length} docs, health ${msg.healthScore || 0}%`, 'success');
          // Also update summary
          deps.vscode.postMessage({ type: 'docsGetSummary' });
          break;
        }

        case 'docsDrift': {
          const banner = document.getElementById('docsDriftBanner');
          const list = document.getElementById('docsDriftList');
          if (!banner || !list) break;
          if (!msg.driftDocs || msg.driftDocs.length === 0) {
            banner.style.display = 'none';
            break;
          }
          banner.style.display = 'block';
          list.innerHTML = msg.driftDocs.map(d =>
            `<div onclick="window._openDriftDoc('${d.type}')">
              ⚠ ${escapeHtml(d.name)} — ${d.daysSinceUpdate} days since update (${escapeHtml(d.path)})
            </div>`
          ).join('');
          break;
        }

        case 'dbStats':
          updateDbPanel(msg.stats);
          break;

        // Mission Panel
        case 'missionData': {
          if (msg.mission) {
            const m = msg.mission;
            const gEl = (id) => document.getElementById(id);
            if (gEl('missionOpenTickets')) gEl('missionOpenTickets').textContent = String(m.openTickets || 0);
            if (gEl('missionActivePlans')) gEl('missionActivePlans').textContent = String(m.activePlans || 0);
            if (gEl('missionPendingJobs')) gEl('missionPendingJobs').textContent = String(m.pendingJobs || 0);
            if (gEl('missionCompletedToday')) gEl('missionCompletedToday').textContent = String(m.completedToday || 0);
            const aq = gEl('missionApprovalQueue');
            if (aq && Array.isArray(m.approvalQueue)) {
              if (m.approvalQueue.length === 0) {
                aq.innerHTML = '<div style="color:var(--text-secondary);font-size:11px;">No pending approvals.</div>';
              } else {
                aq.innerHTML = m.approvalQueue.map(j =>
                  '<div style="padding:4px 8px;background:var(--bg-tertiary);border-radius:4px;margin-bottom:4px;font-size:11px;">' +
                  '<strong>' + (j.action || j.actionKey || 'Job') + '</strong>' +
                  '<span style="float:right;color:#f59e0b;font-size:10px;">PENDING</span></div>'
                ).join('');
              }
            }
            const ml = gEl('missionMilestones');
            if (ml && Array.isArray(m.milestones)) {
              if (m.milestones.length === 0) {
                ml.innerHTML = '<div style="color:var(--text-secondary);font-size:11px;">No milestones defined.</div>';
              } else {
                ml.innerHTML = m.milestones.map(ms =>
                  '<div style="padding:6px 8px;background:var(--bg-tertiary);border-radius:4px;margin-bottom:4px;border-left:3px solid ' +
                  (ms.status === 'completed' ? '#10b981' : '#3b82f6') + ';">' +
                  '<strong style="font-size:12px;">' + (ms.title || 'Milestone') + '</strong>' +
                  (ms.targetDate ? '<span style="float:right;font-size:10px;color:var(--text-secondary);">' + new Date(ms.targetDate).toLocaleDateString() + '</span>' : '') +
                  (ms.description ? '<div style="font-size:10px;color:var(--text-secondary);">' + ms.description + '</div>' : '') +
                  '</div>'
                ).join('');
              }
            }
          }
          break;
        }
        case 'milestoneCreated': {
          showToast('Milestone created: ' + (msg.milestone?.title || ''), 'success');
          vscode.postMessage({ type: 'getMissionData' });
          break;
        }
        case 'milestoneUpdated': {
          vscode.postMessage({ type: 'getMissionData' });
          break;
        }

        // Storage Panel
        case 'storageStats': {
          if (msg.storage) {
            const s = msg.storage;
            const sEl = (id) => document.getElementById(id);
            if (sEl('storageType')) sEl('storageType').textContent = s.type || 'globalState';
            if (sEl('storageLocation')) sEl('storageLocation').textContent = s.location || '.spacecode/';
            if (sEl('storageDbPath')) {
              const dbPath = s.dbPath || '';
              sEl('storageDbPath').textContent = dbPath || '—';
              sEl('storageDbPath').title = dbPath;
            }
            if (sEl('storageChatCount')) sEl('storageChatCount').textContent = (s.chatCount || 0) + ' / ' + (s.chatMax || 10000);
            if (sEl('storageEmbeddingCount')) sEl('storageEmbeddingCount').textContent = (s.embeddingCount || 0) + ' / ' + (s.embeddingMax || 50000);
            if (sEl('storagePlanCount')) sEl('storagePlanCount').textContent = (s.planCount || 0) + ' plans';
            if (sEl('storageTicketCount')) sEl('storageTicketCount').textContent = (s.ticketCount || 0) + ' tickets';
            if (sEl('storageHandoffCount')) sEl('storageHandoffCount').textContent = (s.handoffCount || 0) + ' handoffs';
            const setBar = (id, count, max) => {
              const bar = sEl(id);
              if (bar) bar.style.width = Math.min(100, (count / max) * 100) + '%';
            };
            setBar('storageChatBar', s.chatCount || 0, s.chatMax || 10000);
            setBar('storageEmbeddingBar', s.embeddingCount || 0, s.embeddingMax || 50000);
            setBar('storagePlanBar', s.planCount || 0, s.planMax || 1000);
            setBar('storageTicketBar', s.ticketCount || 0, s.ticketMax || 5000);
            setBar('storageHandoffBar', s.handoffCount || 0, s.handoffMax || 100);
          }
          break;
        }
        case 'recentDbMessages': {
          const browser = document.getElementById('storageDbBrowser');
          if (!browser) break;
          const messages = msg.messages || [];
          if (messages.length === 0) {
            browser.innerHTML = '<div style="color:var(--text-secondary); font-size:11px; padding:8px;">No messages in database. Send a chat message first.</div>';
            break;
          }
          // Group by session
          const sessions: Record<string, any[]> = {};
          for (const m of messages) {
            const sid = m.sessionId || m.session_id || 'default';
            if (!sessions[sid]) sessions[sid] = [];
            sessions[sid].push(m);
          }
          let dbHtml = '';
          for (const [sid, msgs] of Object.entries(sessions)) {
            const userMsgs = (msgs as any[]).filter((m: any) => m.role === 'user');
            const title = userMsgs.length > 0 ? userMsgs[userMsgs.length - 1].content.slice(0, 60) : sid;
            const lastMsg = (msgs as any[])[0];
            const time = lastMsg.timestamp ? new Date(lastMsg.timestamp).toLocaleString() : '';
            const tags = (lastMsg.tags || []).join(', ');
            dbHtml += '<div style="background:var(--bg-tertiary); border-radius:6px; padding:8px 10px; margin-bottom:6px; cursor:pointer;" onclick="this.querySelector(\'.db-session-detail\').style.display = this.querySelector(\'.db-session-detail\').style.display === \'none\' ? \'block\' : \'none\'">';
            dbHtml += '<div style="display:flex; justify-content:space-between; align-items:center;">';
            dbHtml += '<span style="font-size:12px; font-weight:500; color:var(--text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:200px;">' + escapeHtml(title) + '</span>';
            dbHtml += '<span style="font-size:10px; color:var(--text-secondary);">' + (msgs as any[]).length + ' msgs</span>';
            dbHtml += '</div>';
            dbHtml += '<div style="font-size:10px; color:var(--text-secondary); margin-top:2px;">' + escapeHtml(time) + (tags ? ' &middot; ' + escapeHtml(tags) : '') + '</div>';
            dbHtml += '<div class="db-session-detail" style="display:none; margin-top:6px; border-top:1px solid var(--border-color); padding-top:6px;">';
            for (const m of (msgs as any[]).slice(0, 20)) {
              const roleColor = m.role === 'user' ? 'var(--accent-color)' : '#10b981';
              const roleLabel = m.role === 'user' ? 'You' : 'AI';
              const snippet = (m.content || '').slice(0, 120);
              dbHtml += '<div style="margin-bottom:4px;">';
              dbHtml += '<span style="font-size:10px; font-weight:600; color:' + roleColor + ';">' + roleLabel + ':</span> ';
              dbHtml += '<span style="font-size:10px; color:var(--text-primary);">' + escapeHtml(snippet) + (m.content.length > 120 ? '...' : '') + '</span>';
              dbHtml += '</div>';
            }
            if ((msgs as any[]).length > 20) {
              dbHtml += '<div style="font-size:10px; color:var(--text-secondary);">... and ' + ((msgs as any[]).length - 20) + ' more</div>';
            }
            dbHtml += '</div></div>';
          }
          browser.innerHTML = dbHtml;
          break;
        }
        case 'storageClearResult': {
          if (msg.success) {
            showToast('Cleared: ' + (msg.target || 'storage'), 'success');
            vscode.postMessage({ type: 'getStorageStats' });
          } else {
            showToast('Clear failed: ' + (msg.error || 'unknown'), 'error');
          }
          break;
        }
        case 'storageExportResult': {
          if (msg.data) {
            showToast('Storage data exported to console', 'success');
            console.log('[SpaceCode] Export:', msg.data);
          }
          break;
        }

        // Art Studio Panel
        case 'artStudioData': {
          if (msg.artData) {
            const ad = msg.artData;
            const palette = document.getElementById('artColorPalette');
            if (palette && Array.isArray(ad.colors) && ad.colors.length > 0) {
              palette.innerHTML = ad.colors.map(c =>
                '<div style="width:32px;height:32px;border-radius:6px;background:' + c + ';border:1px solid var(--border-color);cursor:pointer;" title="' + c + '"></div>'
              ).join('');
            }
            const assets = document.getElementById('artRecentAssets');
            if (assets && Array.isArray(ad.recentAssets) && ad.recentAssets.length > 0) {
              assets.innerHTML = ad.recentAssets.map(a =>
                '<div style="padding:4px 8px;background:var(--bg-tertiary);border-radius:4px;margin-bottom:4px;font-size:11px;">' +
                (a.name || a.path || 'Asset') + '</div>'
              ).join('');
            }
          }
          break;
        }
        case 'artGenerationStarted': {
          showToast('Generating image...', 'info');
          break;
        }
        case 'artGenerationResult': {
          if (msg.status === 'not_configured') {
            showToast(msg.message || 'API not configured', 'info');
          } else {
            showToast('Image generated', 'success');
          }
          break;
        }
        case 'artGenerationError': {
          showToast('Generation failed: ' + (msg.error || ''), 'error');
          break;
        }

        // Explorer Integration
        case 'explorerContext': {
          const ctxEl = document.getElementById('explorerContextBar');
          if (ctxEl && msg.context) {
            const c = msg.context;
            ctxEl.style.display = 'flex';
            ctxEl.innerHTML =
              '<span style="font-size:10px;color:var(--text-secondary);">File:</span> ' +
              '<strong style="font-size:11px;">' + (c.fileName || '') + '</strong>' +
              '<span style="font-size:10px;color:var(--text-secondary);margin-left:6px;">' + (c.language || '') + '</span>' +
              '<span style="font-size:10px;color:var(--text-secondary);margin-left:6px;">L' + (c.lineNumber || 0) + '</span>' +
              (c.sector !== 'general' ? '<span style="font-size:9px;background:var(--accent-bg);color:var(--accent-color);padding:1px 6px;border-radius:8px;margin-left:6px;">' + c.sector + '</span>' : '') +
              (c.selection ? '<span style="font-size:10px;color:var(--accent-color);margin-left:6px;">[selection]</span>' : '');
          } else if (ctxEl) {
            ctxEl.style.display = 'none';
          }
          break;
        }
        case 'explorerContextPinned': {
          showToast('Context pinned', 'success');
          break;
        }

        case 'logs':
          updateLogsPanel(msg.logs, msg.channel);
          break;

        case 'settingsSaved':
          if (msg.success) {
            showToast('Settings saved successfully', 'success');
          } else {
            showToast('Failed to save settings: ' + (msg.error || 'Unknown error'), 'error');
          }
          break;

        case 'settingsFilePath': {
          const pathEl = document.getElementById('settingsFilePath');
          if (pathEl && msg.relativePath) {
            pathEl.textContent = msg.relativePath;
            pathEl.title = msg.path || 'Click to open in editor';
          }
          break;
        }

        case 'toolbarSettings':
          // Restore toolbar UI from unified settings file
          if (handleToolbarSettings) {
            handleToolbarSettings(msg.settings);
          }
          // Also merge pricing from centralized config
          if (mergePricing && msg.settings?.pricing) {
            mergePricing(msg.settings.pricing);
          }
          break;

        // ─────────────────────────────────────────────────────────────
        // Model Verification
        // ─────────────────────────────────────────────────────────────

        case 'modelVerificationStarted':
          // UI already updated by verifyAllModels()
          break;

        case 'modelVerificationResults':
          if ((window as any).handleModelVerificationResults) {
            (window as any).handleModelVerificationResults(msg.results);
          }
          break;

        case 'modelVerificationError': {
          const btn = document.getElementById('verifyModelsBtn');
          const status = document.getElementById('modelVerificationStatus');
          if (btn) btn.innerHTML = '<span class="btn-icon">🔍</span> Verify All';
          if (status) {
            status.className = 'verification-status error';
            status.innerHTML = `<span class="status-text">Verification failed: ${msg.error}</span>`;
          }
          break;
        }

        case 'singleModelVerificationResult': {
          const el = document.getElementById(`verify-${msg.result?.modelId}`);
          if (el && msg.result) {
            if (msg.result.status === 'valid') {
              el.textContent = '✓';
              el.className = 'verify-status valid';
            } else if (msg.result.status === 'invalid') {
              el.textContent = '✗';
              el.className = 'verify-status invalid';
            } else {
              el.textContent = '?';
              el.className = 'verify-status';
            }
            el.title = msg.result.message;
          }
          break;
        }

        case 'lastModelVerification':
          if (msg.results && (window as any).handleModelVerificationResults) {
            (window as any).handleModelVerificationResults(msg.results);
          }
          break;

        case 'openaiModelsList': {
          const list = document.getElementById('openaiModelsList');
          const text = document.getElementById('openaiModelsText');
          if (list && text) {
            list.style.display = 'block';
            const models = Array.isArray(msg.models) ? msg.models : [];
            text.textContent = models.length ? models.join('\n') : 'No models returned.';
          }
          break;
        }

        case 'openaiModelsError': {
          const list = document.getElementById('openaiModelsList');
          const text = document.getElementById('openaiModelsText');
          if (list && text) {
            list.style.display = 'block';
            text.textContent = `Error fetching models: ${msg.error || 'Unknown error'}`;
          }
          break;
        }

        case 'modelOverrides': {
          const out = document.getElementById('devPricingOverrides');
          if (out) {
            out.textContent = JSON.stringify(msg.overrides || {}, null, 2);
          }
          break;
        }

        case 'modelOverrideApplied': {
          const status = document.getElementById('devPricingStatus');
          if (status) {
            status.textContent = `Applied override for ${msg.modelId}`;
          }
          break;
        }

        case 'modelOverrideError': {
          const status = document.getElementById('devPricingStatus');
          if (status) {
            status.textContent = `Override error: ${msg.error || 'Unknown error'}`;
          }
          break;
        }

        case 'planExecutionStarted':
          planExecutionState = {
            planId: msg.planId || null,
            totalSteps: msg.totalSteps || 0,
            completedSteps: 0,
            failedSteps: 0,
          };
          setPlanExecutionState(planExecutionState);
          showPlanExecutionPanel(true);
          hidePlanStepGate();
          clearPlanExecutionLog();
          setPlanExecutionStatus('Executing: ' + (msg.planTitle || 'Plan'));
          setPlanExecutionProgress('0 / ' + planExecutionState.totalSteps + ' steps');
          appendPlanExecutionLog('Started plan: ' + (msg.planTitle || msg.planId || 'unknown'));
          setPlanExecutionButtonsEnabled(false);
          break;

        case 'planStepStarted':
          if (msg.stepDescription) {
            setPlanExecutionStatus('Running: ' + msg.stepDescription);
            appendPlanExecutionLog('▶ ' + msg.stepDescription);
          }
          break;

        case 'planStepPending':
          showPlanExecutionPanel(true);
          showPlanStepGate(msg);
          setPlanExecutionStatus('Awaiting approval');
          setPlanExecutionProgress(
            planExecutionState.completedSteps + ' / ' + planExecutionState.totalSteps +
            ' steps (failed: ' + planExecutionState.failedSteps + ')'
          );
          if (msg.stepDescription) {
            appendPlanExecutionLog('⏸ Waiting: ' + msg.stepDescription);
          }
          break;

        case 'planStepCompleted':
          if (msg.success) {
            planExecutionState.completedSteps += 1;
            appendPlanExecutionLog('✅ Step completed');
          } else {
            planExecutionState.failedSteps += 1;
            appendPlanExecutionLog('❌ Step failed: ' + (msg.error || 'Unknown error'));
          }
          setPlanExecutionState(planExecutionState);
          setPlanExecutionProgress(
            planExecutionState.completedSteps + ' / ' + planExecutionState.totalSteps +
            ' steps (failed: ' + planExecutionState.failedSteps + ')'
          );
          break;

        case 'planPhaseCompleted':
          if (msg.summary) {
            appendPlanExecutionLog('• Phase summary: ' + msg.summary);
          } else if (msg.phaseId) {
            appendPlanExecutionLog('• Phase completed: ' + msg.phaseId);
          }
          break;

        case 'executionOutput':
          if (msg.chunk) {
            appendPlanExecutionLog(msg.chunk);
          }
          break;

        case 'planExecutionCompleted':
          setPlanExecutionStatus(msg.success ? 'Execution complete' : 'Execution completed with errors', !msg.success);
          if (msg.summary) {
            appendPlanExecutionLog('Summary: ' + msg.summary);
          }
          setPlanExecutionProgress(
            (msg.completedSteps ?? planExecutionState.completedSteps) + ' / ' +
            (planExecutionState.totalSteps || msg.completedSteps || 0) +
            ' steps (failed: ' + (msg.failedSteps ?? planExecutionState.failedSteps) + ')'
          );
          hidePlanStepGate();
          setPlanExecutionButtonsEnabled(!!currentPlanData);
          break;

        case 'planExecutionError':
          setPlanExecutionStatus('Execution error', true);
          appendPlanExecutionLog('Error: ' + (msg.error || 'Unknown error'));
          hidePlanStepGate();
          setPlanExecutionButtonsEnabled(!!currentPlanData);
          break;

        case 'aiReviewResult':
          updateAIReview(msg.result || null);
          break;

	        // Workflow/Agents messages
	        case 'workflows':
	          setWorkflows(msg.workflows || []);
	          break;

        case 'workflowResult':
          document.getElementById('workflowOutputContent').innerHTML =
            '<pre style="white-space: pre-wrap;">' + escapeHtml(msg.result) + '</pre>';
          break;

        case 'workflowError':
          document.getElementById('workflowOutputContent').innerHTML =
            '<p style="color: var(--error-text);">Error: ' + escapeHtml(msg.error) + '</p>';
          break;

        case 'workflowEvent':
          handleWorkflowEvent(msg.event);
          break;

        case 'insertPrompt':
          // Insert a prompt into the chat input
          if (msg.prompt) {
            const input = document.getElementById('messageInput');
            if (input) {
              input.value = msg.prompt;
              input.focus();
              autoResize(input);
            }
          }
          break;

        case 'sendGitPrompt':
          // Insert prompt AND send it immediately
          if (msg.prompt) {
            const input = document.getElementById('messageInput');
            if (input) {
              input.value = msg.prompt;
              autoResize(input);
              // Trigger send after a small delay to ensure UI updates
              setTimeout(() => sendMessage(), 50);
            }
          }
          break;

        case 'gitSettingsSaved':
          // Git settings saved confirmation (optional visual feedback)
          break;

        case 'gitSettings':
          // Load saved git settings into form
          loadGitSettings(msg.settings);
          break;

        // --- Autopilot Engine (Phase 3) ---

        case 'autopilotStatus': {
          if (typeof autopilotRenderStatus === 'function') {
            autopilotRenderStatus(msg);
          }
          break;
        }

        case 'autopilotStepResult': {
          if (typeof autopilotRenderStepResult === 'function') {
            autopilotRenderStepResult(msg.result || msg);
          }
          break;
        }

        case 'autopilotInterruptedSession': {
          if (typeof autopilotRenderSessionPrompt === 'function') {
            autopilotRenderSessionPrompt(msg);
          }
          break;
        }

        case 'autopilotConfig': {
          if (typeof autopilotRenderConfig === 'function') {
            autopilotRenderConfig(msg.config || msg);
          }
          break;
        }

        case 'autopilotError': {
          if (typeof autopilotRenderStatus === 'function') {
            autopilotRenderStatus({ status: 'failed', error: msg.error || msg.message });
          }
          break;
        }

        // --- Game UI Pipeline (Phase 4) ---

        case 'gameuiState':
        case 'gameuiStateLoaded': {
          if (typeof gameuiRenderState === 'function') {
            gameuiRenderState(msg);
          }
          break;
        }

        case 'gameuiCatalog': {
          if (typeof gameuiRenderCatalog === 'function') {
            gameuiRenderCatalog(msg);
          }
          break;
        }

        case 'gameuiPipelineEvent': {
          if (typeof gameuiRenderEvent === 'function') {
            gameuiRenderEvent(msg.event || msg);
          }
          break;
        }

        case 'gameuiThemes': {
          if (typeof gameuiRenderThemes === 'function') {
            gameuiRenderThemes(msg);
          }
          break;
        }

        case 'gameuiComponentResult':
        case 'gameuiComponentUpdated': {
          // Refresh state after component change
          if (typeof gameuiRenderState === 'function' && msg.summary) {
            gameuiRenderState(msg);
          }
          break;
        }

        case 'gameuiPhaseResult':
        case 'gameuiPipelineComplete': {
          if (typeof gameuiRenderState === 'function' && msg.summary) {
            gameuiRenderState({ state: null, summary: msg.summary });
          }
          break;
        }

        // --- Database Panel (Phase 6.1) ---

        case 'dbState':
        case 'dbActiveChanged': {
          if (typeof dbRenderConnectionList === 'function') {
            dbRenderConnectionList(msg);
          }
          break;
        }

        case 'dbConnectionAdded':
        case 'dbConnectionRemoved': {
          if (typeof dbRenderConnectionList === 'function') {
            dbRenderConnectionList(msg);
          }
          break;
        }

        case 'dbConnectionTested': {
          if (typeof dbRenderTestResult === 'function') {
            dbRenderTestResult(msg);
          }
          break;
        }

        case 'dbSchema': {
          if (typeof dbRenderSchema === 'function') {
            dbRenderSchema(msg);
          }
          break;
        }

        case 'dbQueryResult': {
          if (typeof dbRenderQueryResult === 'function') {
            dbRenderQueryResult(msg);
          }
          break;
        }

        // --- Chat Search (Phase 6.2) ---

        case 'memorySearchResults': {
          if (typeof chatSearchRenderResults === 'function') {
            chatSearchRenderResults(msg);
          }
          break;
        }

        // --- Build Pipeline (Phase 6.3) ---

        case 'buildResult': {
          const buildEl = document.getElementById('buildStatusIndicator');
          if (buildEl) {
            if (msg.success) {
              buildEl.textContent = '✓ Build OK';
              buildEl.style.color = '#10b981';
            } else {
              buildEl.textContent = '✗ ' + (msg.errorCount || 0) + ' error(s)';
              buildEl.style.color = '#ef4444';
            }
          }
          if (msg.success) {
            shipSetStatus('Unity build: No compile errors');
          } else {
            shipSetStatus('Unity build failed: ' + (msg.errorCount || 0) + ' compile error(s)');
            showToast('Build failed: ' + (msg.errorCount || 0) + ' error(s)', 'error');
          }
          break;
        }

        // --- Comms Array (Phase 7) ---
        case 'commsState':
          if (typeof commsRenderState === 'function') commsRenderState(msg);
          break;
        case 'commsServicesChecked':
          if (typeof commsRenderState === 'function') {
            // Re-request full state to render updated services
            vscode.postMessage({ type: 'commsGetState' });
          }
          break;
        case 'commsScanStarted':
          if (typeof commsRenderScanStarted === 'function') commsRenderScanStarted(msg);
          break;
        case 'commsScanCompleted':
          if (typeof commsRenderScanCompleted === 'function') commsRenderScanCompleted(msg);
          break;
        case 'commsScanDetail':
          if (typeof commsRenderScanDetail === 'function') commsRenderScanDetail(msg);
          break;
        case 'commsRecentScans':
          // Handled via commsState
          break;
        case 'commsPrompt':
          if (typeof commsRenderPrompt === 'function') commsRenderPrompt(msg);
          break;
        case 'commsError':
          if (msg.error) {
            const commsStatusEl = document.getElementById('commsScanStatus');
            if (commsStatusEl) { commsStatusEl.textContent = msg.error; commsStatusEl.style.color = '#ef4444'; }
            showToast(msg.error, 'error');
          }
          break;

        // --- Ops Array (Phase 8) ---
        case 'opsState':
          if (typeof opsRenderState === 'function') {
            opsRenderState(msg);
            // Track active server for command execution
            if (msg.activeServerId) window._opsActiveServerId = msg.activeServerId;
          }
          break;
        case 'opsServerAdded':
        case 'opsServerRemoved':
          if (typeof opsRenderState === 'function') {
            vscode.postMessage({ type: 'opsGetState' });
          }
          break;
        case 'opsCommandOutput':
          if (typeof opsRenderCommandOutput === 'function') opsRenderCommandOutput(msg);
          break;
        case 'opsRecentOps':
          if (typeof opsRenderRecentOps === 'function') opsRenderRecentOps(msg.ops || []);
          break;
        case 'opsError':
          if (msg.error) showToast(msg.error, 'error');
          break;

        // --- Diagnostics (CF-3) ---
        case 'diagnosticsResult':
          if (typeof renderDiagnosticsResult === 'function') {
            renderDiagnosticsResult(msg.result, msg.error);
          }
          break;
        case 'diagnosticsProgress':
          if (typeof renderDiagnosticsProgress === 'function') {
            renderDiagnosticsProgress(msg.stage, msg.progress);
          }
          break;

        case 'showError':
          // Show error message from extension
          if (msg.message) {
            addMessage('system', 'Error: ' + msg.message);
          }
          break;
      }
  }

  return { handleMessage };
}
