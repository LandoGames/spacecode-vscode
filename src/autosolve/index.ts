// Autosolve: background task completion tracking and notifications
// Tasks that complete in the background get queued here for user action

export type AutosolveStatus = 'pending' | 'viewed' | 'accepted' | 'dismissed' | 'sent_to_index';

export interface AutosolveResult {
  id: string;
  ticketId?: string;
  planId?: string;
  persona: string;
  title: string;
  summary: string;
  changes: AutosolveChange[];
  createdAt: number;
  status: AutosolveStatus;
}

export interface AutosolveChange {
  file: string;
  action: 'created' | 'modified' | 'deleted';
  linesAdded?: number;
  linesRemoved?: number;
  preview?: string;
}

let autosolveResults: AutosolveResult[] = [];
const MAX_RESULTS = 100;

export function createAutosolveResult(input: {
  ticketId?: string;
  planId?: string;
  persona: string;
  title: string;
  summary: string;
  changes?: AutosolveChange[];
}): AutosolveResult {
  const result: AutosolveResult = {
    id: 'as_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    ticketId: input.ticketId,
    planId: input.planId,
    persona: input.persona,
    title: input.title,
    summary: input.summary,
    changes: input.changes || [],
    createdAt: Date.now(),
    status: 'pending',
  };
  autosolveResults.unshift(result);
  if (autosolveResults.length > MAX_RESULTS) {
    autosolveResults = autosolveResults.slice(0, MAX_RESULTS);
  }
  return result;
}

export function getAutosolveResults(): AutosolveResult[] {
  return autosolveResults;
}

export function getPendingAutosolve(): AutosolveResult[] {
  return autosolveResults.filter(r => r.status === 'pending');
}

export function updateAutosolveStatus(id: string, status: AutosolveStatus): AutosolveResult | undefined {
  const result = autosolveResults.find(r => r.id === id);
  if (result) {
    result.status = status;
  }
  return result;
}

export function getAutosolveById(id: string): AutosolveResult | undefined {
  return autosolveResults.find(r => r.id === id);
}

export function clearAutosolveResults(): void {
  autosolveResults = [];
}
