// @ts-nocheck

import { getSuggestedAgent, DEFAULT_ROUTING } from '../../../tickets';

export async function handleTicketMessage(panel: any, message: any): Promise<boolean> {
  switch (message.type) {
    case 'getTickets':
      await panel._sendTicketList();
      return true;

    case 'createTicket':
      await panel._createTicket(message.title, message.description, message.sectorId, message.linkedPlanId);
      return true;

    case 'routeTicket': {
      // Auto-route ticket to suggested persona based on type
      const ticketType = message.ticketType || 'question';
      const suggestedAgent = getSuggestedAgent(ticketType);
      panel._postMessage({
        type: 'ticketRouted',
        ticketId: message.ticketId,
        ticketType,
        assignedTo: suggestedAgent,
        routing: DEFAULT_ROUTING,
      });
      return true;
    }

    case 'getTicketRouting': {
      panel._postMessage({ type: 'ticketRouting', routing: DEFAULT_ROUTING });
      return true;
    }

    case 'updateTicketStatus':
      await panel._updateTicketStatus(message.ticketId, message.status);
      return true;

    case 'linkTicketToPlan':
      await panel._linkTicketToPlan(message.ticketId, message.planId);
      return true;

    case 'deleteTicket':
      await panel._deleteTicket(message.ticketId);
      return true;

    case 'createGitHubIssue':
      await panel._createGitHubIssue(message.title, message.body, message.labels);
      return true;

    case 'createGitHubPR':
      await panel._createGitHubPR(message.title, message.body, message.head, message.base);
      return true;

    case 'listGitHubIssues':
      await panel._listGitHubIssues(message.state, message.labels);
      return true;

    case 'listGitHubPRs':
      await panel._listGitHubPRs(message.state);
      return true;

    case 'checkGitHubAvailable':
      await panel._checkGitHubAvailable();
      return true;

    default:
      return false;
  }
}
