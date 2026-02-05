/**
 * Ops Array Types (Phase 8)
 *
 * Types for server management, deployment, monitoring, and hardening.
 */

/** Server connection info */
export interface OpsServer {
  id: string;
  name: string;
  host: string;
  user: string;
  keyPath?: string;
  port?: number;
  status: 'online' | 'offline' | 'degraded' | 'unknown';
  lastSeen?: number;
  metrics?: ServerMetrics;
  hardening?: HardeningStatus;
}

/** Server resource metrics */
export interface ServerMetrics {
  cpu: number;
  ram: number;
  disk: number;
  uptime: number;
  services: ServiceStatus[];
}

/** Individual service status */
export interface ServiceStatus {
  name: string;
  status: 'running' | 'stopped' | 'failed';
  pid?: number;
}

/** Server hardening checklist */
export interface HardeningStatus {
  rootLoginDisabled: boolean;
  passwordAuthDisabled: boolean;
  firewallActive: boolean;
  fail2banRunning: boolean;
  autoUpdatesEnabled: boolean;
  lastPatchDate?: number;
  pendingUpdates: number;
}

/** Operation log entry */
export interface OpsLogEntry {
  id: string;
  serverId: string;
  serverName: string;
  action: string;
  status: 'success' | 'failed' | 'running';
  output?: string;
  timestamp: number;
}

/** Deployment config */
export interface DeployConfig {
  service: 'coturn' | 'unity' | 'custom';
  serverId: string;
  options?: Record<string, string>;
}

/** Full Ops state */
export interface OpsState {
  servers: OpsServer[];
  recentOps: OpsLogEntry[];
  activeServerId?: string;
}

/** Hardening script names */
export type HardenAction = 'full' | 'firewall' | 'sshHarden' | 'fail2ban' | 'autoUpdates' | 'updateOS';

/** Deploy service names */
export type DeployService = 'coturn' | 'unity' | 'custom';

/** Quick action identifiers */
export const OPS_QUICK_ACTIONS = [
  { id: 'healthCheck', name: 'Health Check', icon: '💊', description: 'Check CPU, RAM, disk usage' },
  { id: 'viewLogs', name: 'View Logs', icon: '📜', description: 'Tail server logs' },
  { id: 'hardenServer', name: 'Harden Server', icon: '🔒', description: 'Run security hardening script' },
  { id: 'updateOS', name: 'Update OS', icon: '🔄', description: 'apt update && apt upgrade' },
  { id: 'firewallStatus', name: 'Firewall', icon: '🛡️', description: 'Check firewall rules' },
  { id: 'dockerPs', name: 'Docker PS', icon: '🐳', description: 'List running containers' },
] as const;
