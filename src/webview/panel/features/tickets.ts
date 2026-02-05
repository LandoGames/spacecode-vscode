// @ts-nocheck

export function createTicketPanelHandlers(deps) {
  const {
    vscode,
    getPlanList,
    shipSetStatus,
    escapeHtml,
    updateTicketStatus,
    deleteTicket,
  } = deps;

  let mainTicketList = [];
  let mainTicketFilter = 'all';

  // Ticket type keyword detection
  const TICKET_KEYWORDS = {
    bug: ['bug', 'fix', 'broken', 'crash', 'error', 'issue', 'defect', 'regression', 'null', 'exception', 'fail'],
    feature: ['feature', 'add', 'new', 'implement', 'create', 'enhance', 'ability', 'support', 'request'],
    doc_update: ['doc', 'document', 'readme', 'wiki', 'comment', 'explain', 'guide', 'tutorial'],
    refactor: ['refactor', 'clean', 'rename', 'restructure', 'optimize', 'simplify', 'extract', 'move', 'split'],
    question: ['question', 'how', 'why', 'what', 'help', 'unclear', 'understand'],
  };

  const PERSONA_LABELS = {
    gears: { name: 'Gears', color: '#f59e0b' },
    nova: { name: 'Nova', color: '#a855f7' },
    index: { name: 'Index', color: '#3b82f6' },
    triage: { name: 'Triage', color: '#10b981' },
    vault: { name: 'Vault', color: '#22c55e' },
    palette: { name: 'Palette', color: '#ec4899' },
  };

  function detectTicketType(title, description) {
    const text = (title + ' ' + description).toLowerCase();
    let bestType = 'question';
    let bestScore = 0;
    for (const [type, keywords] of Object.entries(TICKET_KEYWORDS)) {
      let score = 0;
      for (const kw of keywords) {
        if (text.includes(kw)) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        bestType = type;
      }
    }
    return bestType;
  }

  function getRoutedPersona(ticketType) {
    const routing = { bug: 'gears', feature: 'nova', doc_update: 'index', refactor: 'gears', question: 'nova' };
    return routing[ticketType] || 'nova';
  }

  function updateTicketTypePreview() {
    const titleEl = document.getElementById('ticketTitleMain');
    const descEl = document.getElementById('ticketDescriptionMain');
    const previewEl = document.getElementById('ticketRoutePreview');
    if (!titleEl || !previewEl) return;
    const title = titleEl.value || '';
    const desc = descEl ? descEl.value || '' : '';
    if (!title.trim()) {
      previewEl.style.display = 'none';
      return;
    }
    const type = detectTicketType(title, desc);
    const persona = getRoutedPersona(type);
    const info = PERSONA_LABELS[persona] || { name: persona, color: '#888' };
    previewEl.style.display = 'flex';
    previewEl.innerHTML =
      '<span style="font-size:10px;color:var(--text-secondary);">Auto-route:</span> ' +
      '<span style="font-size:10px;font-weight:600;color:' + info.color + ';">' + type.replace('_', ' ').toUpperCase() + ' → ' + info.name + '</span>';
  }

  function showTicketsPanel() {
    document.getElementById('chatSection').style.display = 'none';
    document.getElementById('agentsSection').style.display = 'none';
    document.getElementById('ticketsSection').style.display = 'flex';

    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    const ticketsBtn = document.querySelector('.mode-btn.tickets');
    if (ticketsBtn) ticketsBtn.classList.add('active');

    vscode.postMessage({ type: 'getTickets' });
  }

  function hideTicketsPanel() {
    document.getElementById('ticketsSection').style.display = 'none';
    document.getElementById('chatSection').style.display = 'flex';
  }

  function toggleTicketFormMain() {
    const formPanel = document.getElementById('ticketFormPanel');
    if (!formPanel) return;
    const isVisible = formPanel.style.display !== 'none';
    formPanel.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) {
      const planSelect = document.getElementById('ticketPlanLinkMain');
      const plans = getPlanList();
      if (planSelect && Array.isArray(plans)) {
        planSelect.innerHTML = '<option value="">(no plan)</option>' +
          plans.map(p => '<option value="' + p.id + '">' + escapeHtml(p.summary || p.intent || p.id) + '</option>').join('');
      }
    }
  }

  function createTicketMain() {
    const titleEl = document.getElementById('ticketTitleMain');
    const descEl = document.getElementById('ticketDescriptionMain');
    const sectorEl = document.getElementById('ticketSectorMain');
    const planEl = document.getElementById('ticketPlanLinkMain');

    const title = titleEl ? titleEl.value.trim() : '';
    if (!title) {
      shipSetStatus('Ticket title is required.');
      return;
    }

    const description = descEl ? descEl.value.trim() : '';
    const ticketType = detectTicketType(title, description);

    vscode.postMessage({
      type: 'createTicket',
      title: title,
      description: description,
      sectorId: sectorEl ? sectorEl.value : 'general',
      linkedPlanId: planEl && planEl.value ? planEl.value : undefined,
    });

    // Auto-route the ticket
    vscode.postMessage({
      type: 'routeTicket',
      ticketType: ticketType,
      ticketId: 'latest',
    });

    if (titleEl) titleEl.value = '';
    if (descEl) descEl.value = '';
    const previewEl = document.getElementById('ticketRoutePreview');
    if (previewEl) previewEl.style.display = 'none';
    toggleTicketFormMain();
    const persona = getRoutedPersona(ticketType);
    const info = PERSONA_LABELS[persona] || { name: persona };
    shipSetStatus('Ticket created → routed to ' + info.name);
  }

  function filterTickets(filter) {
    mainTicketFilter = filter;
    document.querySelectorAll('.ticket-filters .filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    renderTicketsListMain(mainTicketList);
  }

  function renderTicketsListMain(tickets) {
    mainTicketList = tickets || [];
    const listEl = document.getElementById('ticketsListMain');
    if (!listEl) return;

    let filtered = mainTicketList;
    if (mainTicketFilter !== 'all') {
      filtered = mainTicketList.filter(t => t.status === mainTicketFilter);
    }

    if (!Array.isArray(filtered) || filtered.length === 0) {
      listEl.innerHTML = '<div class="empty-tickets"><div class="empty-icon">T</div><p>No tickets ' + (mainTicketFilter !== 'all' ? 'with status "' + mainTicketFilter + '"' : 'yet') + '</p><p class="empty-hint">Click "+ New Ticket" to create one</p></div>';
      return;
    }

    const statusColors = { 'open': '#3b82f6', 'in-progress': '#f59e0b', 'done': '#22c55e' };
    const statusLabels = { 'open': 'Open', 'in-progress': 'In Progress', 'done': 'Done' };

    listEl.innerHTML = filtered.map(t => {
      const statusColor = statusColors[t.status] || '#6b7280';
      const statusLabel = statusLabels[t.status] || t.status;
      const nextStatus = t.status === 'open' ? 'in-progress' : (t.status === 'in-progress' ? 'done' : null);
      const nextLabel = nextStatus ? statusLabels[nextStatus] : '';
      const planInfo = t.linkedPlanId ? '<span class="ticket-plan-badge">Plan linked</span>' : '';
      const descSnippet = t.description ? escapeHtml(t.description).substring(0, 120) + (t.description.length > 120 ? '...' : '') : '';
      const sectorLabel = t.sectorId || 'general';

      let html = '<div class="ticket-card" data-status="' + t.status + '">';
      html += '<div class="ticket-card-header">';
      html += '<span class="ticket-title">' + escapeHtml(t.title) + '</span>';
      html += '<span class="ticket-status" style="background:' + statusColor + '22; color:' + statusColor + '; border-color:' + statusColor + '44;">' + statusLabel + '</span>';
      html += '</div>';
      if (descSnippet) {
        html += '<div class="ticket-description">' + descSnippet + '</div>';
      }
      html += '<div class="ticket-meta">';
      html += '<span class="ticket-sector">' + escapeHtml(sectorLabel) + '</span>';
      html += planInfo;
      html += '</div>';
      html += '<div class="ticket-actions">';
      if (nextStatus) {
        html += '<button data-ticket-id="' + t.id + '" data-next-status="' + nextStatus + '" class="ticket-action-btn primary">Move to ' + nextLabel + '</button>';
      }
      html += '<button data-ticket-delete="' + t.id + '" class="ticket-action-btn danger">Delete</button>';
      html += '</div></div>';
      return html;
    }).join('');

    listEl.querySelectorAll('.ticket-action-btn.primary').forEach(btn => {
      btn.onclick = function() {
        updateTicketStatus(this.dataset.ticketId, this.dataset.nextStatus);
      };
    });
    listEl.querySelectorAll('.ticket-action-btn.danger').forEach(btn => {
      btn.onclick = function() {
        deleteTicket(this.dataset.ticketDelete);
      };
    });
  }

  return {
    showTicketsPanel,
    hideTicketsPanel,
    toggleTicketFormMain,
    createTicketMain,
    filterTickets,
    renderTicketsListMain,
    updateTicketTypePreview,
  };
}
