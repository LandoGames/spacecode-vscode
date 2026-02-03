/**
 * Tickets Module - Stub
 * TODO: Implement ticket storage and management
 */

import * as vscode from 'vscode';

export type TicketStatus = 'open' | 'in-progress' | 'review' | 'done' | 'closed';

export interface Ticket {
  id: string;
  title: string;
  description: string;
  status: TicketStatus;
  createdAt: number;
  updatedAt: number;
}

export class TicketStorage {
  constructor(private context: vscode.ExtensionContext) {}
  async save(ticket: Ticket): Promise<void> {}
  async load(ticketId: string): Promise<Ticket | undefined> { return undefined; }
  async list(): Promise<Ticket[]> { return []; }
  async delete(ticketId: string): Promise<void> {}
  async updateStatus(ticketId: string, status: TicketStatus): Promise<void> {}
}
