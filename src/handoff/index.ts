/**
 * Context Handoff Module
 *
 * Passes context between personas with structured packages.
 */

import type { AgentId } from '../agents/types';

export interface ContextPackage {
  id: string;
  fromPersona: AgentId;
  toPersona: AgentId;
  createdAt: number;
  summary: string;
  context: {
    chatHistory?: string[];
    files?: string[];
    selection?: string;
    sectorId?: string;
    ticketId?: string;
    planId?: string;
    metadata?: Record<string, unknown>;
  };
  action: 'send_and_stay' | 'go_to_tab';
  status: 'pending' | 'received' | 'dismissed';
}

let _handoffs: ContextPackage[] = [];

export function getHandoffs(): ContextPackage[] {
  return _handoffs;
}

export function getHandoffById(id: string): ContextPackage | undefined {
  return _handoffs.find(h => h.id === id);
}

export function getPendingHandoffs(persona?: AgentId): ContextPackage[] {
  if (persona) {
    return _handoffs.filter(h => h.toPersona === persona && h.status === 'pending');
  }
  return _handoffs.filter(h => h.status === 'pending');
}

export function createHandoff(
  fromPersona: AgentId,
  toPersona: AgentId,
  summary: string,
  context: ContextPackage['context'],
  action: ContextPackage['action'] = 'send_and_stay'
): ContextPackage {
  const handoff: ContextPackage = {
    id: `handoff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fromPersona,
    toPersona,
    createdAt: Date.now(),
    summary,
    context,
    action,
    status: 'pending',
  };
  _handoffs.unshift(handoff);
  // Keep max 50 handoffs
  if (_handoffs.length > 50) _handoffs = _handoffs.slice(0, 50);
  return handoff;
}

export function receiveHandoff(id: string): ContextPackage | undefined {
  const handoff = _handoffs.find(h => h.id === id);
  if (handoff) {
    handoff.status = 'received';
  }
  return handoff;
}

export function dismissHandoff(id: string): boolean {
  const handoff = _handoffs.find(h => h.id === id);
  if (handoff) {
    handoff.status = 'dismissed';
    return true;
  }
  return false;
}

/**
 * Map persona to their primary tab
 */
export function getPersonaTab(persona: AgentId): string {
  switch (persona) {
    case 'lead-engineer': return 'chat';
    case 'qa-engineer': return 'station';
    case 'technical-writer': return 'dashboard';
    case 'issue-triager': return 'dashboard';
    case 'database-engineer': return 'dashboard';
    case 'art-director': return 'dashboard';
    default: return 'chat';
  }
}

/**
 * Get persona display name
 */
export function getPersonaName(persona: AgentId): string {
  const names: Record<AgentId, string> = {
    'lead-engineer': 'Lead Engineer',
    'qa-engineer': 'QA Engineer',
    'technical-writer': 'Technical Writer',
    'issue-triager': 'Issue Triager',
    'database-engineer': 'Database Engineer',
    'art-director': 'Art Director',
  };
  return names[persona] || persona;
}
