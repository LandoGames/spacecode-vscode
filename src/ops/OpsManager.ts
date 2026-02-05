// @ts-nocheck

/**
 * Ops Array Manager (Phase 8)
 *
 * Manages server connections, deployment actions, and operations log.
 */

import * as fs from 'fs';
import * as pathMod from 'path';

import {
  OpsServer,
  OpsState,
  OpsLogEntry,
  ServerMetrics,
  HardeningStatus,
} from './OpsTypes';

let _instance: OpsManager | null = null;
let _workspaceDir: string | null = null;

export class OpsManager {
  private state: OpsState;

  constructor() {
    this.state = {
      servers: [],
      recentOps: [],
    };
    this._loadFromDisk();
  }

  private _loadFromDisk(): void {
    if (!_workspaceDir) return;
    try {
      const filePath = pathMod.join(_workspaceDir, '.spacecode', 'ops-servers.json');
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (Array.isArray(data.servers)) {
          this.state.servers = data.servers;
          this.state.activeServerId = data.activeServerId;
        }
      }
    } catch { /* ignore load errors */ }
  }

  private _saveToDisk(): void {
    if (!_workspaceDir) return;
    try {
      const dir = pathMod.join(_workspaceDir, '.spacecode');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        pathMod.join(dir, 'ops-servers.json'),
        JSON.stringify({ servers: this.state.servers, activeServerId: this.state.activeServerId }, null, 2),
        'utf8'
      );
    } catch { /* ignore save errors */ }
  }

  getState(): OpsState {
    return { ...this.state, servers: [...this.state.servers], recentOps: [...this.state.recentOps] };
  }

  /** Add a new server */
  addServer(server: Omit<OpsServer, 'id' | 'status'>): OpsServer {
    const newServer: OpsServer = {
      ...server,
      id: `srv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      status: 'unknown',
      port: server.port || 22,
    };
    this.state.servers.push(newServer);
    this._saveToDisk();
    return newServer;
  }

  /** Remove a server */
  removeServer(serverId: string): boolean {
    const idx = this.state.servers.findIndex(s => s.id === serverId);
    if (idx === -1) return false;
    this.state.servers.splice(idx, 1);
    if (this.state.activeServerId === serverId) {
      this.state.activeServerId = this.state.servers[0]?.id;
    }
    this._saveToDisk();
    return true;
  }

  /** Get server by ID */
  getServer(serverId: string): OpsServer | undefined {
    return this.state.servers.find(s => s.id === serverId);
  }

  /** Get all servers */
  getServers(): OpsServer[] {
    return [...this.state.servers];
  }

  /** Set active server */
  setActiveServer(serverId: string): void {
    this.state.activeServerId = serverId;
    this._saveToDisk();
  }

  /** Update server status */
  updateServerStatus(serverId: string, status: OpsServer['status'], metrics?: ServerMetrics): void {
    const server = this.state.servers.find(s => s.id === serverId);
    if (!server) return;
    server.status = status;
    server.lastSeen = Date.now();
    if (metrics) server.metrics = metrics;
    this._saveToDisk();
  }

  /** Update server hardening status */
  updateHardeningStatus(serverId: string, hardening: HardeningStatus): void {
    const server = this.state.servers.find(s => s.id === serverId);
    if (server) {
      server.hardening = hardening;
      this._saveToDisk();
    }
  }

  /** Log an operation */
  logOp(entry: Omit<OpsLogEntry, 'id' | 'timestamp'>): OpsLogEntry {
    const logEntry: OpsLogEntry = {
      ...entry,
      id: `op-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
    };
    this.state.recentOps.unshift(logEntry);
    // Keep only last 50 entries
    if (this.state.recentOps.length > 50) {
      this.state.recentOps = this.state.recentOps.slice(0, 50);
    }
    return logEntry;
  }

  /** Update an operation log entry */
  updateOp(opId: string, updates: Partial<OpsLogEntry>): void {
    const entry = this.state.recentOps.find(o => o.id === opId);
    if (entry) Object.assign(entry, updates);
  }

  /** Get recent operations */
  getRecentOps(limit = 20): OpsLogEntry[] {
    return this.state.recentOps.slice(0, limit);
  }

  /** Generate hardening commands for a server */
  getHardeningCommands(action: string): string[] {
    switch (action) {
      case 'full':
        return [
          'apt update && apt upgrade -y',
          'sed -i "s/PermitRootLogin yes/PermitRootLogin no/" /etc/ssh/sshd_config',
          'sed -i "s/#PasswordAuthentication yes/PasswordAuthentication no/" /etc/ssh/sshd_config',
          'systemctl restart sshd',
          'ufw default deny incoming && ufw default allow outgoing',
          'ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp',
          'ufw --force enable',
          'apt install fail2ban -y && systemctl enable fail2ban && systemctl start fail2ban',
          'apt install unattended-upgrades -y',
        ];
      case 'firewall':
        return [
          'ufw default deny incoming && ufw default allow outgoing',
          'ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp',
          'ufw --force enable',
          'ufw status verbose',
        ];
      case 'sshHarden':
        return [
          'sed -i "s/PermitRootLogin yes/PermitRootLogin no/" /etc/ssh/sshd_config',
          'sed -i "s/#PasswordAuthentication yes/PasswordAuthentication no/" /etc/ssh/sshd_config',
          'systemctl restart sshd',
        ];
      case 'fail2ban':
        return [
          'apt install fail2ban -y',
          'systemctl enable fail2ban',
          'systemctl start fail2ban',
          'fail2ban-client status',
        ];
      case 'autoUpdates':
        return [
          'apt install unattended-upgrades -y',
          'dpkg-reconfigure -plow unattended-upgrades',
        ];
      case 'updateOS':
        return ['apt update && apt upgrade -y'];
      default:
        return [];
    }
  }

  /** Generate deployment commands */
  getDeployCommands(service: string): string[] {
    switch (service) {
      case 'coturn':
        return [
          'apt install coturn -y',
          'systemctl enable coturn',
          'systemctl start coturn',
          'systemctl status coturn',
        ];
      case 'unity':
        return [
          'mkdir -p /opt/game-server',
          'chmod +x /opt/game-server/GameServer.x86_64 2>/dev/null || true',
          'systemctl daemon-reload',
          'systemctl enable game-server 2>/dev/null || true',
          'systemctl start game-server 2>/dev/null || true',
          'systemctl status game-server 2>/dev/null || echo "Service not configured yet"',
        ];
      default:
        return [];
    }
  }
}

/** Set workspace directory for persistence */
export function setOpsWorkspaceDir(dir: string): void {
  _workspaceDir = dir;
}

/** Get the singleton OpsManager */
export function getOpsManager(): OpsManager {
  if (!_instance) {
    _instance = new OpsManager();
  }
  return _instance;
}
