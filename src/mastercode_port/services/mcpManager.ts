/**
 * MCP (Model Context Protocol) Manager
 *
 * Manages MCP server configurations across BOTH Claude CLI and Codex CLI.
 * SpaceCode provides a unified UI while syncing to both config files.
 *
 * Config locations:
 * - Claude: ~/.claude.json (mcpServers object)
 * - Codex: ~/.codex/config.toml ([mcp_servers.*] sections)
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn, ChildProcess } from 'child_process';

export type MCPTransport = 'stdio' | 'http' | 'websocket';
export type MCPServerStatus = 'stopped' | 'starting' | 'running' | 'error' | 'unknown';

export interface MCPServerConfig {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;

  // Connection settings
  transport: MCPTransport;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;

  // Runtime state (not persisted to CLI configs)
  status?: MCPServerStatus;
  lastError?: string;

  // Source tracking
  source?: 'claude' | 'codex' | 'both' | 'spacecode';
}

// Claude CLI config structure
interface ClaudeConfig {
  mcpServers?: Record<string, {
    command?: string;
    args?: string[];
    type?: string;
    url?: string;
    transport?: string;
    env?: Record<string, string>;
    disabled?: boolean;
  }>;
  [key: string]: any;
}

export class MCPManager {
  private servers: Map<string, MCPServerConfig> = new Map();
  private context: vscode.ExtensionContext | null = null;
  private _onStatusChange = new vscode.EventEmitter<MCPServerConfig>();
  readonly onStatusChange = this._onStatusChange.event;

  private readonly CLAUDE_CONFIG_PATH = path.join(os.homedir(), '.claude.json');
  private readonly CODEX_CONFIG_PATH = path.join(os.homedir(), '.codex', 'config.toml');

  async initialize(context: vscode.ExtensionContext): Promise<void> {
    this.context = context;
    await this.loadFromCLIConfigs();
  }

  /**
   * Load MCP servers from both Claude and Codex configs
   */
  async loadFromCLIConfigs(): Promise<void> {
    this.servers.clear();

    // Load from Claude config
    await this.loadClaudeConfig();

    // Load from Codex config
    await this.loadCodexConfig();

    // Enrich known servers with launch commands
    this.enrichKnownServers();
  }

  /**
   * Add launch commands for known MCP servers
   */
  private enrichKnownServers(): void {
    // Unity MCP
    const unityMcp = this.servers.get('unitymcp');
    if (unityMcp && !unityMcp.command) {
      unityMcp.command = '/Users/blade/.local/bin/uvx';
      unityMcp.args = [
        '--from', 'mcpforunityserver==9.2.0',
        'mcp-for-unity',
        '--transport', 'http',
        '--http-url', unityMcp.url || 'http://localhost:8080',
        '--project-scoped-tools'
      ];
    }

    // Blender MCP
    const blenderMcp = this.servers.get('blender');
    if (blenderMcp && !blenderMcp.command) {
      blenderMcp.command = 'uvx';
      blenderMcp.args = ['blender-mcp'];
    }
  }

  private async loadClaudeConfig(): Promise<void> {
    try {
      if (fs.existsSync(this.CLAUDE_CONFIG_PATH)) {
        const content = fs.readFileSync(this.CLAUDE_CONFIG_PATH, 'utf-8');
        const config: ClaudeConfig = JSON.parse(content);

        if (config.mcpServers) {
          for (const [name, server] of Object.entries(config.mcpServers)) {
            const id = this.normalizeId(name);
            const existing = this.servers.get(id);

            const mcpConfig: MCPServerConfig = {
              id,
              name,
              enabled: !server.disabled,
              transport: this.detectTransport(server),
              command: server.command,
              args: server.args,
              url: server.url,
              env: server.env,
              status: 'unknown',
              source: existing ? 'both' : 'claude',
            };

            this.servers.set(id, mcpConfig);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load Claude config:', error);
    }
  }

  private async loadCodexConfig(): Promise<void> {
    try {
      if (fs.existsSync(this.CODEX_CONFIG_PATH)) {
        const content = fs.readFileSync(this.CODEX_CONFIG_PATH, 'utf-8');

        // Parse TOML manually (simple parser for mcp_servers)
        const lines = content.split('\n');
        let currentServer: string | null = null;
        let serverConfig: any = {};

        for (const line of lines) {
          const trimmed = line.trim();

          // Match [mcp_servers.name]
          const serverMatch = trimmed.match(/^\[mcp_servers\.([^\]]+)\]$/);
          if (serverMatch) {
            // Save previous server
            if (currentServer) {
              this.mergeCodexServer(currentServer, serverConfig);
            }
            currentServer = serverMatch[1];
            serverConfig = {};
            continue;
          }

          // Parse key = value within a server section
          if (currentServer && trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('[')) {
            const kvMatch = trimmed.match(/^(\w+)\s*=\s*(.+)$/);
            if (kvMatch) {
              const key = kvMatch[1];
              const rawValue = kvMatch[2].trim();

              // Parse value
              let parsedValue: string | string[];
              if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
                parsedValue = rawValue.slice(1, -1);
              } else if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
                // Array
                try {
                  parsedValue = JSON.parse(rawValue.replace(/'/g, '"'));
                } catch {
                  parsedValue = rawValue.slice(1, -1).split(',').map(s => s.trim().replace(/['"]/g, ''));
                }
              } else {
                parsedValue = rawValue;
              }

              serverConfig[key] = parsedValue;
            }
          }
        }

        // Save last server
        if (currentServer) {
          this.mergeCodexServer(currentServer, serverConfig);
        }
      }
    } catch (error) {
      console.error('Failed to load Codex config:', error);
    }
  }

  private mergeCodexServer(name: string, config: any): void {
    const id = this.normalizeId(name);
    const existing = this.servers.get(id);

    if (existing) {
      existing.source = 'both';
    } else {
      const mcpConfig: MCPServerConfig = {
        id,
        name,
        enabled: true,
        transport: config.transport === 'http' ? 'http' : 'stdio',
        command: config.command,
        args: Array.isArray(config.args) ? config.args : undefined,
        url: config.url,
        status: 'unknown',
        source: 'codex',
      };
      this.servers.set(id, mcpConfig);
    }
  }

  private detectTransport(server: any): MCPTransport {
    if (server.type === 'http' || server.transport === 'http' || server.url) {
      return 'http';
    }
    return 'stdio';
  }

  private normalizeId(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '-');
  }

  /**
   * Save MCP server to BOTH Claude and Codex configs
   */
  async saveServer(config: MCPServerConfig): Promise<void> {
    // Save to Claude config
    await this.saveToClaudeConfig(config);

    // Save to Codex config
    await this.saveToCodexConfig(config);

    // Update local cache
    this.servers.set(config.id, { ...config, source: 'both' });
  }

  private async saveToClaudeConfig(config: MCPServerConfig): Promise<void> {
    try {
      let claudeConfig: ClaudeConfig = {};

      if (fs.existsSync(this.CLAUDE_CONFIG_PATH)) {
        const content = fs.readFileSync(this.CLAUDE_CONFIG_PATH, 'utf-8');
        claudeConfig = JSON.parse(content);
      }

      if (!claudeConfig.mcpServers) {
        claudeConfig.mcpServers = {};
      }

      const serverEntry: any = {};

      if (config.transport === 'http' && config.url) {
        serverEntry.type = 'http';
        serverEntry.url = config.url;
      } else if (config.command) {
        serverEntry.command = config.command;
        if (config.args && config.args.length > 0) {
          serverEntry.args = config.args;
        }
      }

      if (config.env && Object.keys(config.env).length > 0) {
        serverEntry.env = config.env;
      }

      if (!config.enabled) {
        serverEntry.disabled = true;
      }

      claudeConfig.mcpServers[config.name] = serverEntry;

      fs.writeFileSync(this.CLAUDE_CONFIG_PATH, JSON.stringify(claudeConfig, null, 2));
    } catch (error) {
      console.error('Failed to save to Claude config:', error);
      throw error;
    }
  }

  private async saveToCodexConfig(config: MCPServerConfig): Promise<void> {
    try {
      let content = '';

      if (fs.existsSync(this.CODEX_CONFIG_PATH)) {
        content = fs.readFileSync(this.CODEX_CONFIG_PATH, 'utf-8');
      }

      // Remove existing entry for this server
      const sectionRegex = new RegExp(`\\[mcp_servers\\.${config.name}\\][^\\[]*`, 'g');
      content = content.replace(sectionRegex, '');

      // Add new entry
      let newSection = `\n[mcp_servers.${config.name}]\n`;

      if (config.transport === 'http' && config.url) {
        newSection += `transport = "http"\n`;
        newSection += `url = "${config.url}"\n`;
      } else if (config.command) {
        newSection += `command = "${config.command}"\n`;
        if (config.args && config.args.length > 0) {
          const argsStr = config.args.map(a => `"${a}"`).join(', ');
          newSection += `args = [ ${argsStr} ]\n`;
        }
      }

      content = content.trim() + '\n' + newSection;

      // Ensure directory exists
      const codexDir = path.dirname(this.CODEX_CONFIG_PATH);
      if (!fs.existsSync(codexDir)) {
        fs.mkdirSync(codexDir, { recursive: true });
      }

      fs.writeFileSync(this.CODEX_CONFIG_PATH, content);
    } catch (error) {
      console.error('Failed to save to Codex config:', error);
      throw error;
    }
  }

  /**
   * Remove MCP server from BOTH configs
   */
  async removeServer(id: string): Promise<void> {
    const server = this.servers.get(id);
    if (!server) return;

    // Remove from Claude config
    await this.removeFromClaudeConfig(server.name);

    // Remove from Codex config
    await this.removeFromCodexConfig(server.name);

    // Remove from local cache
    this.servers.delete(id);
  }

  private async removeFromClaudeConfig(name: string): Promise<void> {
    try {
      if (fs.existsSync(this.CLAUDE_CONFIG_PATH)) {
        const content = fs.readFileSync(this.CLAUDE_CONFIG_PATH, 'utf-8');
        const config: ClaudeConfig = JSON.parse(content);

        if (config.mcpServers && config.mcpServers[name]) {
          delete config.mcpServers[name];
          fs.writeFileSync(this.CLAUDE_CONFIG_PATH, JSON.stringify(config, null, 2));
        }
      }
    } catch (error) {
      console.error('Failed to remove from Claude config:', error);
    }
  }

  private async removeFromCodexConfig(name: string): Promise<void> {
    try {
      if (fs.existsSync(this.CODEX_CONFIG_PATH)) {
        let content = fs.readFileSync(this.CODEX_CONFIG_PATH, 'utf-8');

        // Remove section
        const sectionRegex = new RegExp(`\\[mcp_servers\\.${name}\\][^\\[]*`, 'g');
        content = content.replace(sectionRegex, '');

        fs.writeFileSync(this.CODEX_CONFIG_PATH, content.trim() + '\n');
      }
    } catch (error) {
      console.error('Failed to remove from Codex config:', error);
    }
  }

  /**
   * Get all configured servers
   */
  getAllServers(): MCPServerConfig[] {
    return Array.from(this.servers.values());
  }

  /**
   * Get server by ID
   */
  getServer(id: string): MCPServerConfig | undefined {
    return this.servers.get(id);
  }

  /**
   * Add Unity MCP (pre-configured)
   */
  async addUnityMCP(url: string = 'http://localhost:8080'): Promise<MCPServerConfig> {
    const config: MCPServerConfig = {
      id: 'unitymcp',
      name: 'unityMCP',
      description: 'Connect to Unity Editor via MCP for Unity',
      enabled: true,
      transport: 'http',
      url,
      // Command to launch the MCP server
      command: '/Users/blade/.local/bin/uvx',
      args: [
        '--from', 'mcpforunityserver==9.2.0',
        'mcp-for-unity',
        '--transport', 'http',
        '--http-url', url,
        '--project-scoped-tools'
      ],
      status: 'stopped',
    };

    await this.saveServer(config);
    return config;
  }

  /**
   * Launch an MCP server in VS Code's integrated terminal (split view)
   */
  async launchInTerminal(id: string): Promise<vscode.Terminal | undefined> {
    const server = this.servers.get(id);
    if (!server || !server.command) {
      vscode.window.showErrorMessage(`Server ${id} has no command to launch`);
      return undefined;
    }

    // Build the full command
    const fullCommand = server.args
      ? `${server.command} ${server.args.join(' ')}`
      : server.command;

    // Create or reuse terminal
    const terminalName = `MCP: ${server.name}`;
    let terminal = vscode.window.terminals.find(t => t.name === terminalName);

    if (!terminal) {
      // Check if there's an active terminal to split from
      const activeTerminal = vscode.window.activeTerminal;

      if (activeTerminal) {
        // Show the active terminal first, then split
        activeTerminal.show();
        // Create new terminal that will split from the active one
        terminal = vscode.window.createTerminal({
          name: terminalName,
          env: server.env,
          location: { parentTerminal: activeTerminal },
        });
      } else {
        // No active terminal, just create a new one
        terminal = vscode.window.createTerminal({
          name: terminalName,
          env: server.env,
        });
      }
    }

    terminal.show();
    terminal.sendText(fullCommand);

    // Update status
    server.status = 'running';
    this._onStatusChange.fire(server);

    return terminal;
  }

  /**
   * Add Blender MCP (pre-configured)
   */
  async addBlenderMCP(): Promise<MCPServerConfig> {
    const config: MCPServerConfig = {
      id: 'blender',
      name: 'blender',
      description: 'Connect to Blender for 3D modeling',
      enabled: true,
      transport: 'stdio',
      command: 'uvx',
      args: ['blender-mcp'],
      status: 'unknown',
    };

    await this.saveServer(config);
    return config;
  }

  /**
   * Add custom MCP server
   */
  async addCustomServer(
    name: string,
    transport: MCPTransport,
    options: { command?: string; args?: string[]; url?: string; env?: Record<string, string> }
  ): Promise<MCPServerConfig> {
    const config: MCPServerConfig = {
      id: this.normalizeId(name),
      name,
      enabled: true,
      transport,
      command: options.command,
      args: options.args,
      url: options.url,
      env: options.env,
      status: 'unknown',
    };

    await this.saveServer(config);
    return config;
  }

  /**
   * Toggle server enabled/disabled
   */
  async toggleServer(id: string, enabled: boolean): Promise<void> {
    const server = this.servers.get(id);
    if (!server) return;

    server.enabled = enabled;
    await this.saveServer(server);
  }

  /**
   * Start an MCP server (mark as running in config)
   * Note: MCP servers are managed by the CLI tools, this just updates status
   */
  async startServer(id: string): Promise<void> {
    const server = this.servers.get(id);
    if (!server) return;

    server.status = 'running';
    server.enabled = true;
    await this.saveServer(server);
    this._onStatusChange.fire(server);
  }

  /**
   * Stop an MCP server (mark as stopped in config)
   * Note: MCP servers are managed by the CLI tools, this just updates status
   */
  async stopServer(id: string): Promise<void> {
    const server = this.servers.get(id);
    if (!server) return;

    server.status = 'stopped';
    this._onStatusChange.fire(server);
  }

  /**
   * Prompt to add a new MCP server
   */
  async promptAddServer(): Promise<MCPServerConfig | undefined> {
    const choice = await vscode.window.showQuickPick([
      { label: 'Unity MCP', description: 'Connect to Unity Editor', value: 'unity' },
      { label: 'Blender MCP', description: 'Connect to Blender', value: 'blender' },
      { label: 'Custom Server', description: 'Configure a custom MCP server', value: 'custom' },
    ], {
      title: 'Add MCP Server',
    });

    if (!choice) return;

    switch (choice.value) {
      case 'unity': {
        const url = await vscode.window.showInputBox({
          title: 'Unity MCP URL',
          value: 'http://localhost:8080/mcp',
          prompt: 'Enter the Unity MCP server URL',
        });
        if (url) {
          return this.addUnityMCP(url);
        }
        break;
      }
      case 'blender':
        return this.addBlenderMCP();
      case 'custom': {
        const name = await vscode.window.showInputBox({
          title: 'Server Name',
          prompt: 'Enter a name for this MCP server',
        });
        if (!name) return;

        const transport = await vscode.window.showQuickPick([
          { label: 'stdio', description: 'Command-based server' },
          { label: 'http', description: 'HTTP-based server' },
        ], { title: 'Transport Type' });
        if (!transport) return;

        if (transport.label === 'http') {
          const url = await vscode.window.showInputBox({
            title: 'Server URL',
            prompt: 'Enter the MCP server URL',
          });
          if (url) {
            return this.addCustomServer(name, 'http', { url });
          }
        } else {
          const command = await vscode.window.showInputBox({
            title: 'Command',
            prompt: 'Enter the command to run the server (e.g., npx, uvx)',
          });
          if (!command) return;

          const argsStr = await vscode.window.showInputBox({
            title: 'Arguments',
            prompt: 'Enter command arguments (comma-separated)',
          });
          const args = argsStr ? argsStr.split(',').map(s => s.trim()) : [];

          return this.addCustomServer(name, 'stdio', { command, args });
        }
        break;
      }
    }
  }

  /**
   * Cleanup
   */
  async dispose(): Promise<void> {
    // Nothing to cleanup for config-based manager
  }
}
