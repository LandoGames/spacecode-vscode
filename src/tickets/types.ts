/**
 * Ticket System Types
 *
 * Minimal ticket data model for tracking work items linked to plans.
 */

/**
 * Ticket status values
 */
export type TicketStatus = 'open' | 'in-progress' | 'done';

/**
 * A ticket for tracking work
 */
export interface Ticket {
  id: string;
  title: string;
  description: string;
  sectorId: string;
  status: TicketStatus;
  linkedPlanId?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Storage wrapper for tickets
 */
export interface StoredTicket {
  ticket: Ticket;
  version: number;
}
