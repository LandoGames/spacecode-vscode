// @ts-nocheck

import { AgentId } from '../agents/types';

/**
 * Routing table: maps (tab, panel/chatMode) to the active persona.
 *
 * Tab          Panel/Mode          Persona
 * ─────────────────────────────────────────
 * chat         (any)               lead-engineer
 * station      (any)               qa-engineer
 * dashboard    docs                technical-writer
 * dashboard    tickets             issue-triager
 * dashboard    db                  database-engineer
 * dashboard    art / settings      art-director
 * agents       (any)               lead-engineer (default)
 * skills       (any)               lead-engineer (default)
 */

type TabName = 'chat' | 'station' | 'dashboard' | 'agents' | 'skills';
type DashboardSubtab = 'docs' | 'tickets' | 'db' | 'mcp' | 'logs' | 'settings' | 'info';

const DASHBOARD_PERSONA_MAP: Record<string, AgentId> = {
  docs: 'technical-writer',
  tickets: 'issue-triager',
  db: 'database-engineer',
  settings: 'art-director',
  art: 'art-director',
  // mcp, logs, info don't have dedicated personas — fall back to lead-engineer
};

const TAB_PERSONA_MAP: Record<string, AgentId> = {
  chat: 'lead-engineer',
  station: 'qa-engineer',
  agents: 'lead-engineer',
  skills: 'lead-engineer',
};

/**
 * Determine the active persona for the given UI context.
 */
export function getPersonaForContext(
  tab: string,
  dashboardSubtab?: string,
): AgentId {
  if (tab === 'dashboard' && dashboardSubtab) {
    return DASHBOARD_PERSONA_MAP[dashboardSubtab] || 'lead-engineer';
  }
  return TAB_PERSONA_MAP[tab] || 'lead-engineer';
}
