// @ts-nocheck

export function createTicketsImpl(panel: any) {
  async function sendTicketList(): Promise<void> {
    const tickets = await panel.ticketStorage.getTickets();
    panel._postMessage({ type: 'ticketList', tickets });
  }

  async function createTicket(title: string, description: string, sectorId: string, linkedPlanId?: string): Promise<void> {
    const ticket = await panel.ticketStorage.createTicket({
      title,
      description,
      sectorId,
      linkedPlanId
    });
    panel._postMessage({ type: 'ticketCreated', ticket });
    await sendTicketList();
  }

  async function updateTicketStatus(ticketId: string, status: any): Promise<void> {
    const success = await panel.ticketStorage.updateStatus(ticketId, status);
    if (success) {
      const ticket = panel.ticketStorage.loadTicket(ticketId);
      panel._postMessage({ type: 'ticketUpdated', ticket });
      await sendTicketList();
    } else {
      panel._postMessage({ type: 'ticketError', error: 'Ticket not found' });
    }
  }

  async function linkTicketToPlan(ticketId: string, planId: string): Promise<void> {
    const success = await panel.ticketStorage.linkToPlan(ticketId, planId);
    if (success) {
      const ticket = panel.ticketStorage.loadTicket(ticketId);
      panel._postMessage({ type: 'ticketUpdated', ticket });
      await sendTicketList();
    } else {
      panel._postMessage({ type: 'ticketError', error: 'Ticket not found' });
    }
  }

  async function deleteTicket(ticketId: string): Promise<void> {
    await panel.ticketStorage.deleteTicket(ticketId);
    await sendTicketList();
  }

  return {
    sendTicketList,
    createTicket,
    updateTicketStatus,
    linkTicketToPlan,
    deleteTicket,
  };
}
