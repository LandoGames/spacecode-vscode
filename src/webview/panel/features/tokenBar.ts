// @ts-nocheck

export function createTokenBarHandlers(deps) {
  const {
    vscode,
    currentSettings,
    getContextLimit,
    getChatSessions,
    getCurrentChatId,
  } = deps;

  const CHARS_PER_TOKEN = 4; // Rough estimate for context sizing

  // Pricing is populated from backend via mergePricing()
  // Source of truth: src/mastercode_port/config/models.ts
  // DO NOT hardcode pricing here - it comes from the centralized config
  let pricingMap: Record<string, { input: number; output: number }> = {};

  function estimateTokens(text) {
    return Math.ceil((text || '').length / CHARS_PER_TOKEN);
  }

  function estimateHistoryTokens(history) {
    let total = 0;
    for (const msg of history || []) {
      total += estimateTokens(msg.content || '');
    }
    return total;
  }

  function estimateHistoryTokenBreakdown(history) {
    let input = 0;
    let output = 0;
    for (const msg of history || []) {
      const tokens = estimateTokens(msg.content || '');
      if (msg.role === 'assistant') {
        output += tokens;
      } else {
        input += tokens;
      }
    }
    return { input, output };
  }

  function mergePricing(newPricing) {
    if (!newPricing) return;
    pricingMap = { ...pricingMap, ...newPricing };
  }

  function getCostDisplay(session) {
    const provider = session.mode === 'gpt' ? 'gpt' : 'claude';
    const model = provider === 'gpt' ? currentSettings.gptModel : currentSettings.claudeModel;
    const method = provider === 'gpt' ? currentSettings.gptConnectionMethod : currentSettings.claudeConnectionMethod;
    const tokens = estimateHistoryTokenBreakdown(session.messageHistory);
    const pricing = pricingMap[model];
    if (!pricing) {
      return { text: 'cost N/A', className: 'token-bar-cost', provider };
    }
    const inputCost = (tokens.input / 1_000_000) * pricing.input;
    const outputCost = (tokens.output / 1_000_000) * pricing.output;
    const cost = inputCost + outputCost;
    const formatted = '$' + cost.toFixed(4);
    if (method === 'cli') {
      return { text: 'saved ' + formatted, className: 'token-bar-cost saved', provider };
    }
    return { text: formatted, className: 'token-bar-cost', provider };
  }

  function openPricing(provider) {
    vscode.postMessage({ type: 'openPricing', provider });
  }

  // Update the token bar to reflect current chat context size (not spend)
  function updateTokenBar(chatId = getCurrentChatId()) {
    const chatSessions = getChatSessions();
    const session = chatSessions[chatId];
    if (!session) return;

    const tokensUsed = estimateHistoryTokens(session.messageHistory);
    session.tokensUsed = tokensUsed;
    const contextLimit = getContextLimit(session.mode);
    const percentage = Math.min((tokensUsed / contextLimit) * 100, 100);

    const container = document.getElementById('tokenBarContainer');
    const fill = document.getElementById('tokenBarFill');
    const label = document.getElementById('tokenBarLabel');

    if (chatId !== getCurrentChatId()) {
      return;
    }

    if (fill) {
      fill.style.width = Math.max(percentage, 2) + '%';
    }

    if (container) {
      container.title = 'Context usage: ' + Math.round(percentage) + '% (' + tokensUsed.toLocaleString() + ' / ' + contextLimit.toLocaleString() + ')';
      container.dataset.warning = percentage >= 70 ? 'true' : 'false';
      container.dataset.critical = percentage >= 90 ? 'true' : 'false';
    }

    if (label) {
      const limitK = Math.round(contextLimit / 1000);
      const usedK = tokensUsed >= 1000 ? Math.round(tokensUsed / 1000) + 'K' : tokensUsed;
      const costDisplay = getCostDisplay(session);
      const pricingLink = costDisplay && costDisplay.provider
        ? ' <a href="#" class="token-bar-link" onclick="openPricing(\'' + costDisplay.provider + '\')">pricing</a>'
        : '';
      label.innerHTML = usedK + ' / ' + limitK + 'K tokens' +
        (costDisplay ? ' <span class="' + costDisplay.className + '">' + costDisplay.text + '</span>' : '') +
        pricingLink;
    }
  }

  return {
    mergePricing,
    openPricing,
    updateTokenBar,
  };
}
