// @ts-nocheck

export function createTicketsSidebarHandlers(deps) {
  const {
    vscode,
    escapeHtml,
    shipSetStatus,
    getPlanList,
  } = deps;

  let ticketFormVisible = false;

  function toggleTicketForm() {
    ticketFormVisible = !ticketFormVisible;
    const form = document.getElementById('ticketForm');
    if (form) {
      form.style.display = ticketFormVisible ? 'block' : 'none';
      if (ticketFormVisible) {
        const planSelect = document.getElementById('ticketPlanLink');
        const planList = getPlanList();
        if (planSelect && Array.isArray(planList)) {
          planSelect.innerHTML = '<option value="">(no plan)</option>' +
            planList.map(p => '<option value="' + p.id + '">' + escapeHtml(p.summary || p.intent || p.id) + '</option>').join('');
        }
      }
    }
  }

  function createTicket() {
    const titleEl = document.getElementById('ticketTitle');
    const descEl = document.getElementById('ticketDescription');
    const sectorEl = document.getElementById('ticketSector');
    const planEl = document.getElementById('ticketPlanLink');

    const title = titleEl ? titleEl.value.trim() : '';
    if (!title) {
      shipSetStatus('Ticket title is required.');
      return;
    }

    vscode.postMessage({
      type: 'createTicket',
      title: title,
      description: descEl ? descEl.value.trim() : '',
      sectorId: sectorEl ? sectorEl.value : 'general',
      linkedPlanId: planEl && planEl.value ? planEl.value : undefined
    });

    if (titleEl) titleEl.value = '';
    if (descEl) descEl.value = '';
    toggleTicketForm();
    shipSetStatus('Ticket created.');
  }

  function refreshTickets() {
    vscode.postMessage({ type: 'getTickets' });
  }

  function updateTicketStatus(ticketId, newStatus) {
    vscode.postMessage({ type: 'updateTicketStatus', ticketId, status: newStatus });
  }

  function deleteTicket(ticketId) {
    if (confirm('Delete this ticket?')) {
      vscode.postMessage({ type: 'deleteTicket', ticketId });
    }
  }

  function renderTicketList(tickets) {
    const listEl = document.getElementById('ticketList');
    if (!listEl) return;
    if (!Array.isArray(tickets) || tickets.length === 0) {
      listEl.innerHTML = '<span style="color:var(--text-secondary);">No tickets yet. Click "+ New" to create one.</span>';
      return;
    }

    const statusColors = { 'open': '#3b82f6', 'in-progress': '#f59e0b', 'done': '#22c55e' };
    const statusLabels = { 'open': 'Open', 'in-progress': 'In Progress', 'done': 'Done' };

    listEl.innerHTML = tickets.map(t => {
      const statusColor = statusColors[t.status] || '#6b7280';
      const statusLabel = statusLabels[t.status] || t.status;
      const nextStatus = t.status === 'open' ? 'in-progress' : (t.status === 'in-progress' ? 'done' : null);
      const planInfo = t.linkedPlanId ? ' [plan]' : '';
      const descSnippet = t.description ? escapeHtml(t.description).substring(0, 80) + (t.description.length > 80 ? '...' : '') : '';
      const nextLabel = nextStatus ? statusLabels[nextStatus] : '';

      let html = '<div style="display:flex; flex-direction:column; gap:4px; padding:6px; margin-bottom:4px; border:1px solid var(--border-color); border-radius:4px; background:var(--bg-secondary);">';
      html += '<div style="display:flex; justify-content:space-between; align-items:center;">';
      html += '<span style="font-weight:500;">' + escapeHtml(t.title) + planInfo + '</span>';
      html += '<span style="padding:2px 6px; border-radius:4px; font-size:9px; background:' + statusColor + '22; color:' + statusColor + '; border:1px solid ' + statusColor + '44;">' + statusLabel + '</span>';
      html += '</div>';
      if (descSnippet) {
        html += '<div style="font-size:9px; color:var(--text-secondary);">' + descSnippet + '</div>';
      }
      html += '<div style="display:flex; gap:4px; justify-content:flex-end;">';
      if (nextStatus) {
        html += '<button data-ticket-id="' + t.id + '" data-next-status="' + nextStatus + '" class="ticket-status-btn" style="font-size:9px; padding:2px 6px; border-radius:4px; background:var(--bg-tertiary); border:1px solid var(--border-color); color:var(--text-secondary); cursor:pointer;">&gt; ' + nextLabel + '</button>';
      }
      html += '<button data-ticket-delete="' + t.id + '" class="ticket-delete-btn" style="font-size:9px; padding:2px 6px; border-radius:4px; background:var(--bg-tertiary); border:1px solid var(--border-color); color:var(--error-text); cursor:pointer;">x</button>';
      html += '</div></div>';
      return html;
    }).join('');

    listEl.querySelectorAll('.ticket-status-btn').forEach(btn => {
      btn.onclick = function() {
        updateTicketStatus(this.dataset.ticketId, this.dataset.nextStatus);
      };
    });
    listEl.querySelectorAll('.ticket-delete-btn').forEach(btn => {
      btn.onclick = function() {
        deleteTicket(this.dataset.ticketDelete);
      };
    });
  }

  return {
    toggleTicketForm,
    createTicket,
    refreshTickets,
    updateTicketStatus,
    deleteTicket,
    renderTicketList,
  };
}
