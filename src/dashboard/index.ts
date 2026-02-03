/**
 * Dashboard Module
 *
 * System status, storage, MCP, and mission tracking.
 */

import * as vscode from 'vscode';

export interface StorageInfo {
  used: number;
  total: number;
  breakdown: Record<string, number>;
}

export interface MCPStatus {
  connected: boolean;
  servers: Array<{ name: string; status: string }>;
}

export interface LogEntry {
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp: number;
}

export interface Mission {
  name: string;
  progress: number;
  milestones: Array<{ name: string; complete: boolean }>;
}

export interface DashboardData {
  storage: StorageInfo;
  mcp: MCPStatus;
  logs: LogEntry[];
  mission: Mission;
}

let _logs: LogEntry[] = [];
let _mission: Mission = {
  name: 'Project Setup',
  progress: 0,
  milestones: [
    { name: 'Initialize project', complete: false },
    { name: 'Set up documentation', complete: false },
    { name: 'Configure architecture', complete: false },
    { name: 'First feature complete', complete: false }
  ]
};

export function getDashboardData(): DashboardData {
  return {
    storage: getStorageInfo(),
    mcp: getMCPStatus(),
    logs: _logs,
    mission: _mission
  };
}

export function getStorageInfo(): StorageInfo {
  // Estimate storage usage
  return {
    used: 25,
    total: 100,
    breakdown: {
      'Chat History': 10,
      'Embeddings': 8,
      'Cache': 5,
      'Settings': 2
    }
  };
}

export function getMCPStatus(): MCPStatus {
  return {
    connected: false,
    servers: []
  };
}

export function addLog(level: LogEntry['level'], message: string): void {
  _logs.push({ level, message, timestamp: Date.now() });
  if (_logs.length > 100) _logs.shift();
}

export function getLogs(): LogEntry[] {
  return _logs;
}

export function updateMission(updates: Partial<Mission>): Mission {
  _mission = { ..._mission, ...updates };
  // Recalculate progress
  const total = _mission.milestones.length;
  const complete = _mission.milestones.filter(m => m.complete).length;
  _mission.progress = total > 0 ? Math.round((complete / total) * 100) : 0;
  return _mission;
}

export function completeMilestone(index: number): Mission {
  if (index >= 0 && index < _mission.milestones.length) {
    _mission.milestones[index].complete = true;
    return updateMission({});
  }
  return _mission;
}
