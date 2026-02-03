/**
 * Tickets Module
 *
 * Ticket management for the Triage persona.
 */

export type TicketType = 'bug' | 'feature' | 'doc_update' | 'refactor' | 'question';
export type TicketPriority = 'critical' | 'high' | 'medium' | 'low';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface Ticket {
  id: string;
  type: TicketType;
  title: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  assignedTo?: string;
  createdAt: number;
  updatedAt: number;
  context?: {
    files?: string[];
    selection?: string;
    chatHistory?: string;
  };
}

export interface TicketRoutingPolicy {
  bug: string;
  feature: string;
  doc_update: string;
  refactor: string;
  question: string;
}

export const DEFAULT_ROUTING: TicketRoutingPolicy = {
  bug: 'gears',
  feature: 'nova',
  doc_update: 'index',
  refactor: 'gears',
  question: 'nova'
};

let _tickets: Ticket[] = [];

export function getTickets(): Ticket[] {
  return _tickets;
}

export function createTicket(ticket: Omit<Ticket, 'id' | 'createdAt' | 'updatedAt'>): Ticket {
  const newTicket: Ticket = {
    ...ticket,
    id: `ticket-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  _tickets.unshift(newTicket);
  return newTicket;
}

export function updateTicket(id: string, updates: Partial<Ticket>): Ticket | undefined {
  const idx = _tickets.findIndex(t => t.id === id);
  if (idx === -1) return undefined;
  _tickets[idx] = { ..._tickets[idx], ...updates, updatedAt: Date.now() };
  return _tickets[idx];
}

export function routeTicket(ticketId: string, agentId: string): Ticket | undefined {
  return updateTicket(ticketId, { assignedTo: agentId, status: 'in_progress' });
}

export function getSuggestedAgent(ticketType: TicketType): string {
  return DEFAULT_ROUTING[ticketType];
}

export function getTicketsByStatus(status: TicketStatus): Ticket[] {
  return _tickets.filter(t => t.status === status);
}

export function getOpenTicketCount(): number {
  return _tickets.filter(t => t.status === 'open' || t.status === 'in_progress').length;
}

/**
 * TicketStorage class for mainPanel.ts compatibility
 */
export class TicketStorage {
  private _context: any;

  constructor(context: any) {
    this._context = context;
  }

  async getTickets(): Promise<Ticket[]> {
    return getTickets();
  }

  async createTicket(ticket: Omit<Ticket, 'id' | 'createdAt' | 'updatedAt'>): Promise<Ticket> {
    return createTicket(ticket);
  }

  async updateTicket(id: string, updates: Partial<Ticket>): Promise<Ticket | undefined> {
    return updateTicket(id, updates);
  }

  async deleteTicket(id: string): Promise<boolean> {
    const idx = _tickets.findIndex(t => t.id === id);
    if (idx === -1) return false;
    _tickets.splice(idx, 1);
    return true;
  }

  async getTicketsByStatus(status: TicketStatus): Promise<Ticket[]> {
    return getTicketsByStatus(status);
  }
}
