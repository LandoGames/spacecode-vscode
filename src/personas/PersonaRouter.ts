// @ts-nocheck

import { AgentId } from '../agents/types';

/**
 * Routing table: maps (tab, panel/chatMode) to the active persona.
 *
 * Tab          Panel/Mode          Persona
 * ─────────────────────────────────────────
 * chat         (any)               nova
 * station      (any)               gears
 * dashboard    docs                index
 * dashboard    tickets             triage
 * dashboard    db                  vault
 * dashboard    art / settings      palette
 * agents       (any)               nova (default)
 * skills       (any)               nova (default)
 */

type TabName = 'chat' | 'station' | 'dashboard' | 'agents' | 'skills';
type DashboardSubtab = 'docs' | 'tickets' | 'db' | 'mcp' | 'logs' | 'settings' | 'info';

const DASHBOARD_PERSONA_MAP: Record<string, AgentId> = {
  docs: 'index',
  tickets: 'triage',
  db: 'vault',
  settings: 'palette',
  art: 'palette',
  // mcp, logs, info don't have dedicated personas — fall back to nova
};

const TAB_PERSONA_MAP: Record<string, AgentId> = {
  chat: 'nova',
  station: 'gears',
  agents: 'nova',
  skills: 'nova',
};

/**
 * Determine the active persona for the given UI context.
 */
export function getPersonaForContext(
  tab: string,
  dashboardSubtab?: string,
): AgentId {
  if (tab === 'dashboard' && dashboardSubtab) {
    return DASHBOARD_PERSONA_MAP[dashboardSubtab] || 'nova';
  }
  return TAB_PERSONA_MAP[tab] || 'nova';
}
