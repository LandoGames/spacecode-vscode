/**
 * LogService - Manages output channels for SpaceCode logging
 *
 * Provides structured logging to VSCode's Output panel with dedicated channels
 * for different log categories (general, MCP, API, tools).
 */

import * as vscode from 'vscode';

export type LogChannel = 'general' | 'mcp' | 'api' | 'tools';

export interface LogEntry {
  timestamp: Date;
  channel: LogChannel;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  data?: any;
}

export class LogService {
  private static instance: LogService;

  private channels: Map<LogChannel, vscode.OutputChannel> = new Map();
  private logHistory: LogEntry[] = [];
  private maxHistorySize = 1000;

  private constructor() {
    // Create output channels
    this.channels.set('general', vscode.window.createOutputChannel('SpaceCode'));
    this.channels.set('mcp', vscode.window.createOutputChannel('SpaceCode - MCP'));
    this.channels.set('api', vscode.window.createOutputChannel('SpaceCode - API'));
    this.channels.set('tools', vscode.window.createOutputChannel('SpaceCode - Tools'));
  }

  static getInstance(): LogService {
    if (!LogService.instance) {
      LogService.instance = new LogService();
    }
    return LogService.instance;
  }

  /**
   * Log a message to the specified channel
   */
  log(channel: LogChannel, message: string, data?: any): void {
    this.writeLog(channel, 'info', message, data);
  }

  /**
   * Log an info message
   */
  info(channel: LogChannel, message: string, data?: any): void {
    this.writeLog(channel, 'info', message, data);
  }

  /**
   * Log a warning message
   */
  warn(channel: LogChannel, message: string, data?: any): void {
    this.writeLog(channel, 'warn', message, data);
  }

  /**
   * Log an error message
   */
  error(channel: LogChannel, message: string, data?: any): void {
    this.writeLog(channel, 'error', message, data);
  }

  /**
   * Log a debug message (only shown in debug mode)
   */
  debug(channel: LogChannel, message: string, data?: any): void {
    this.writeLog(channel, 'debug', message, data);
  }

  private writeLog(channel: LogChannel, level: LogEntry['level'], message: string, data?: any): void {
    const timestamp = new Date();
    const timeStr = timestamp.toLocaleTimeString('en-US', { hour12: false });
    const levelPrefix = level === 'info' ? '' : `[${level.toUpperCase()}] `;

    // Format the log line
    let logLine = `[${timeStr}] ${levelPrefix}${message}`;
    if (data !== undefined) {
      if (typeof data === 'object') {
        try {
          const dataStr = JSON.stringify(data, null, 2);
          // Truncate very long data
          if (dataStr.length > 2000) {
            logLine += `\n${dataStr.substring(0, 2000)}...(truncated)`;
          } else {
            logLine += `\n${dataStr}`;
          }
        } catch {
          logLine += ` [data: ${String(data)}]`;
        }
      } else {
        logLine += ` ${data}`;
      }
    }

    // Write to output channel
    const outputChannel = this.channels.get(channel);
    if (outputChannel) {
      outputChannel.appendLine(logLine);
    }

    // Also log to console for debugging
    const consolePrefix = `[SpaceCode:${channel}]`;
    switch (level) {
      case 'error':
        data !== undefined ? console.error(consolePrefix, message, data) : console.error(consolePrefix, message);
        break;
      case 'warn':
        data !== undefined ? console.warn(consolePrefix, message, data) : console.warn(consolePrefix, message);
        break;
      default:
        data !== undefined ? console.log(consolePrefix, message, data) : console.log(consolePrefix, message);
    }

    // Store in history
    this.logHistory.push({ timestamp, channel, level, message, data });
    if (this.logHistory.length > this.maxHistorySize) {
      this.logHistory.shift();
    }
  }

  /**
   * Show the output panel with a specific channel selected
   */
  show(channel: LogChannel): void {
    const outputChannel = this.channels.get(channel);
    if (outputChannel) {
      outputChannel.show(true); // true = preserve focus
    }
  }

  /**
   * Show and focus a specific channel
   */
  focus(channel: LogChannel): void {
    const outputChannel = this.channels.get(channel);
    if (outputChannel) {
      outputChannel.show(false); // false = take focus
    }
  }

  /**
   * Clear a specific channel
   */
  clear(channel: LogChannel): void {
    const outputChannel = this.channels.get(channel);
    if (outputChannel) {
      outputChannel.clear();
    }
  }

  /**
   * Clear all channels
   */
  clearAll(): void {
    for (const channel of this.channels.values()) {
      channel.clear();
    }
    this.logHistory = [];
  }

  /**
   * Get recent log entries for a channel
   */
  getHistory(channel?: LogChannel, limit = 100): LogEntry[] {
    let entries = this.logHistory;
    if (channel) {
      entries = entries.filter(e => e.channel === channel);
    }
    return entries.slice(-limit);
  }

  /**
   * Dispose all output channels
   */
  dispose(): void {
    for (const channel of this.channels.values()) {
      channel.dispose();
    }
    this.channels.clear();
  }
}

// Export singleton getter for convenience
export const logger = LogService.getInstance();
