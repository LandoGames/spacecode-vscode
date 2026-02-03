/**
 * Ticket Storage
 *
 * Handles persistence of tickets using VSCode's ExtensionContext.
 */

import * as vscode from 'vscode';
import { Ticket, StoredTicket, TicketStatus } from './types';

const TICKETS_KEY = 'spacecode.tickets';
const MAX_TICKETS = 100;

/**
 * Generate a unique ticket ID
 */
function generateTicketId(): string {
  return 'tkt-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 7);
}

/**
 * Ticket Storage Manager
 */
export class TicketStorage {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * Create a new ticket
   */
  async createTicket(data: {
    title: string;
    description: string;
    sectorId: string;
    linkedPlanId?: string;
  }): Promise<Ticket> {
    const now = Date.now();
    const ticket: Ticket = {
      id: generateTicketId(),
      title: data.title,
      description: data.description,
      sectorId: data.sectorId,
      status: 'open',
      linkedPlanId: data.linkedPlanId,
      createdAt: now,
      updatedAt: now
    };

    await this.saveTicket(ticket);
    return ticket;
  }

  /**
   * Save a ticket
   */
  async saveTicket(ticket: Ticket): Promise<void> {
    const tickets = this.loadAllTickets();

    const existingIndex = tickets.findIndex(t => t.ticket.id === ticket.id);
    const stored: StoredTicket = {
      ticket: { ...ticket, updatedAt: Date.now() },
      version: 1
    };

    if (existingIndex >= 0) {
      tickets[existingIndex] = stored;
    } else {
      tickets.unshift(stored);
    }

    const trimmed = tickets.slice(0, MAX_TICKETS);
    await this.context.globalState.update(TICKETS_KEY, trimmed);
  }

  /**
   * Load a ticket by ID
   */
  loadTicket(ticketId: string): Ticket | undefined {
    const tickets = this.loadAllTickets();
    const stored = tickets.find(t => t.ticket.id === ticketId);
    return stored?.ticket;
  }

  /**
   * Load all tickets
   */
  loadAllTickets(): StoredTicket[] {
    return this.context.globalState.get<StoredTicket[]>(TICKETS_KEY, []);
  }

  /**
   * Get all tickets as plain array
   */
  getAllTickets(): Ticket[] {
    return this.loadAllTickets().map(s => s.ticket);
  }

  /**
   * Update ticket status
   */
  async updateStatus(ticketId: string, status: TicketStatus): Promise<boolean> {
    const ticket = this.loadTicket(ticketId);
    if (!ticket) {
      return false;
    }

    ticket.status = status;
    ticket.updatedAt = Date.now();
    await this.saveTicket(ticket);
    return true;
  }

  /**
   * Link a ticket to a plan
   */
  async linkToPlan(ticketId: string, planId: string): Promise<boolean> {
    const ticket = this.loadTicket(ticketId);
    if (!ticket) {
      return false;
    }

    ticket.linkedPlanId = planId;
    ticket.updatedAt = Date.now();
    await this.saveTicket(ticket);
    return true;
  }

  /**
   * Delete a ticket
   */
  async deleteTicket(ticketId: string): Promise<boolean> {
    const tickets = this.loadAllTickets();
    const filtered = tickets.filter(t => t.ticket.id !== ticketId);

    if (filtered.length === tickets.length) {
      return false;
    }

    await this.context.globalState.update(TICKETS_KEY, filtered);
    return true;
  }

  /**
   * Get tickets by status
   */
  getTicketsByStatus(status: TicketStatus): Ticket[] {
    return this.getAllTickets().filter(t => t.status === status);
  }

  /**
   * Get tickets by sector
   */
  getTicketsBySector(sectorId: string): Ticket[] {
    return this.getAllTickets().filter(t => t.sectorId === sectorId);
  }

  /**
   * Get tickets linked to a plan
   */
  getTicketsByPlan(planId: string): Ticket[] {
    return this.getAllTickets().filter(t => t.linkedPlanId === planId);
  }
}
