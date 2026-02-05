// @ts-nocheck

/**
 * Chat Search Frontend (Phase 6.2)
 *
 * Search previous chat messages with relevance display.
 * Uses existing memorySearch backend handler.
 */

export function createChatSearchHandlers(deps: { vscode: any; escapeHtml: (s: string) => string }) {
  const { vscode, escapeHtml } = deps;

  let searchTimeout: any = null;
  let lastQuery = '';

  function chatSearchToggle() {
    const bar = document.getElementById('chatSearchBar');
    const input = document.getElementById('chatSearchInput') as HTMLInputElement;
    if (!bar) return;

    const visible = bar.style.display !== 'none';
    bar.style.display = visible ? 'none' : 'block';

    if (!visible && input) {
      input.focus();
      input.value = '';
    } else {
      // Close results when hiding
      const results = document.getElementById('chatSearchResults');
      if (results) results.style.display = 'none';
    }
  }

  function chatSearchInput(value: string) {
    if (searchTimeout) clearTimeout(searchTimeout);

    const query = (value || '').trim();
    if (query.length < 2) {
      const results = document.getElementById('chatSearchResults');
      if (results) results.style.display = 'none';
      return;
    }

    // Debounce 300ms
    searchTimeout = setTimeout(() => {
      lastQuery = query;
      vscode.postMessage({ type: 'memorySearch', query, limit: 20 });
    }, 300);
  }

  function chatSearchRenderResults(msg: any) {
    const resultsEl = document.getElementById('chatSearchResults');
    if (!resultsEl) return;

    const results = msg.results || [];
    const query = msg.query || lastQuery;

    if (results.length === 0) {
      resultsEl.style.display = 'block';
      resultsEl.innerHTML = '<div style="padding:8px; color:var(--text-secondary); font-size:11px; text-align:center;">No results for "' + escapeHtml(query) + '"</div>';
      return;
    }

    resultsEl.style.display = 'block';
    resultsEl.innerHTML = `
      <div style="padding:4px 8px; font-size:10px; color:var(--text-secondary); border-bottom:1px solid var(--border-color);">
        ${results.length} result${results.length !== 1 ? 's' : ''} for "${escapeHtml(query)}"
      </div>
      ${results.map((r: any, i: number) => {
        const isUser = r.role === 'user';
        const roleColor = isUser ? 'var(--accent-color)' : '#10b981';
        const roleLabel = isUser ? 'You' : 'AI';
        const snippet = (r.content || '').slice(0, 150);
        const time = r.timestamp ? new Date(r.timestamp).toLocaleString() : '';
        const sessionId = r.session_id || r.sessionId || '';
        // Highlight query terms
        const highlighted = highlightTerms(escapeHtml(snippet), query);

        return `<div class="chat-search-result" onclick="chatSearchLoadResult('${escapeHtml(sessionId)}', ${r.id || 0})" style="padding:6px 8px; cursor:pointer; border-bottom:1px solid var(--bg-tertiary);">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:10px; font-weight:600; color:${roleColor};">${roleLabel}</span>
            <span style="font-size:9px; color:var(--text-secondary);">${time}</span>
          </div>
          <div style="font-size:11px; color:var(--text-primary); margin-top:2px; line-height:1.3;">
            ${highlighted}${(r.content || '').length > 150 ? '...' : ''}
          </div>
          ${r.tags && r.tags.length ? `<div style="margin-top:2px;">${r.tags.map((t: string) => '<span style="font-size:9px; padding:1px 4px; background:var(--bg-tertiary); border-radius:4px; margin-right:2px;">' + escapeHtml(t) + '</span>').join('')}</div>` : ''}
        </div>`;
      }).join('')}
    `;
  }

  function highlightTerms(text: string, query: string): string {
    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);
    let result = text;
    for (const term of terms) {
      const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      result = result.replace(regex, '<mark style="background:rgba(99,102,241,0.3);border-radius:2px;padding:0 1px;">$1</mark>');
    }
    return result;
  }

  function chatSearchLoadResult(sessionId: string, messageId: number) {
    // Request the full session to display context
    if (sessionId) {
      vscode.postMessage({ type: 'memoryGetSession', sessionId, limit: 50 });
    }
    // Close search
    const bar = document.getElementById('chatSearchBar');
    const results = document.getElementById('chatSearchResults');
    if (bar) bar.style.display = 'none';
    if (results) results.style.display = 'none';
  }

  function chatSearchClose() {
    const bar = document.getElementById('chatSearchBar');
    const results = document.getElementById('chatSearchResults');
    if (bar) bar.style.display = 'none';
    if (results) results.style.display = 'none';
  }

  return {
    chatSearchToggle,
    chatSearchInput,
    chatSearchRenderResults,
    chatSearchLoadResult,
    chatSearchClose,
  };
}
