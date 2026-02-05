/**
 * Coplay MCP Client for SpaceCode
 *
 * Spawns coplay-mcp-server as a child process and communicates via
 * stdio JSON-RPC 2.0 (MCP protocol).
 *
 * Connection: SpaceCode → spawn(uvx coplay-mcp-server) → stdio → Unity Editor
 */

// @ts-nocheck

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn, ChildProcess } from 'child_process';

// ============================================
// Types
// ============================================

export interface CoplayResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface UnityProject {
  projectRoot: string;
  projectName: string;
}

export interface GameObjectOptions {
  name: string;
  position: string;
  primitiveType?: 'Cube' | 'Sphere' | 'Capsule' | 'Cylinder' | 'Plane';
  size?: string;
  prefabPath?: string;
  useWorldCoordinates?: boolean;
}

export interface TransformOptions {
  gameobjectPath: string;
  position?: string;
  rotation?: string;
  scale?: string;
  prefabPath?: string;
  useWorldCoordinates?: boolean;
}

export interface ComponentOptions {
  gameobjectPath: string;
  componentType: string;
  prefabPath?: string;
}

export interface PropertyOptions {
  gameobjectPath: string;
  componentType: string;
  propertyName: string;
  value: string;
  prefabPath?: string;
  assetPath?: string;
}

export interface LogOptions {
  showLogs?: boolean;
  showWarnings?: boolean;
  showErrors?: boolean;
  showStackTraces?: boolean;
  searchTerm?: string;
  limit?: number;
  skipNewestNLogs?: number;
}

// Import MCPManager type (avoid circular dependency)
type MCPManagerType = {
  startServer(id: string): Promise<void>;
  stopServer(id: string): Promise<void>;
  getServer(id: string): { id: string; status?: string; enabled?: boolean; command?: string; args?: string[]; env?: Record<string, string>; [key: string]: any } | undefined;
  launchInTerminal?(id: string): Promise<any>;
};

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ============================================
// Coplay MCP Client
// ============================================

export class CoplayMCPClient {
  private context: vscode.ExtensionContext | null = null;
  private mcpManager: MCPManagerType | null = null;
  private activeProject: string | null = null;
  private readonly SERVER_ID = 'coplay-mcp';

  // Stdio transport state
  private process: ChildProcess | null = null;
  private requestId: number = 0;
  private pendingRequests: Map<number, PendingRequest> = new Map();
  private initialized: boolean = false;
  private stdoutBuffer: string = '';
  private connecting: boolean = false;
  private readonly DEFAULT_TIMEOUT_MS = 30000;

  /**
   * Initialize with VSCode extension context and MCPManager
   */
  async initialize(context: vscode.ExtensionContext, mcpManager?: MCPManagerType): Promise<void> {
    this.context = context;
    this.mcpManager = mcpManager || null;
  }

  /**
   * Set the MCP manager reference
   */
  setMCPManager(mcpManager: MCPManagerType): void {
    this.mcpManager = mcpManager;
  }

  /**
   * Connect to Coplay MCP server by spawning the process and initializing the MCP session
   */
  async connect(): Promise<boolean> {
    if (!this.mcpManager) {
      console.error('[CoplayMCP] MCPManager not set');
      return false;
    }

    // Already connected
    if (this.process && !this.process.killed && this.initialized) {
      return true;
    }

    // Prevent concurrent connection attempts
    if (this.connecting) {
      return false;
    }
    this.connecting = true;

    try {
      // Get server config from MCPManager
      const server = this.mcpManager.getServer(this.SERVER_ID);
      if (!server) {
        console.error('[CoplayMCP] Coplay MCP server not configured in ~/.claude.json');
        return false;
      }

      if (!server.command) {
        console.error('[CoplayMCP] No command configured for coplay-mcp server');
        return false;
      }

      // Kill any existing process
      this.killProcess();

      console.log(`[CoplayMCP] Spawning: ${server.command} ${(server.args || []).join(' ')}`);

      // Spawn the coplay-mcp-server process
      this.process = spawn(server.command, server.args || [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...(server.env || {}) },
      });

      if (!this.process.pid) {
        console.error('[CoplayMCP] Failed to spawn process');
        this.process = null;
        return false;
      }

      console.log(`[CoplayMCP] Process spawned with PID: ${this.process.pid}`);

      // Handle stdout — JSON-RPC responses come here
      this.process.stdout!.on('data', (data: Buffer) => {
        this.stdoutBuffer += data.toString();
        this.processStdoutBuffer();
      });

      // Handle stderr — debug/log output
      this.process.stderr!.on('data', (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) {
          console.log('[CoplayMCP] stderr:', msg);
        }
      });

      // Handle process exit
      this.process.on('exit', (code, signal) => {
        console.log(`[CoplayMCP] Process exited: code=${code}, signal=${signal}`);
        this.initialized = false;
        this.process = null;

        // Reject all pending requests
        for (const [, pending] of this.pendingRequests) {
          clearTimeout(pending.timer);
          pending.reject(new Error(`Coplay MCP process exited (code=${code})`));
        }
        this.pendingRequests.clear();

        // Update MCPManager status
        if (this.mcpManager) {
          this.mcpManager.stopServer(this.SERVER_ID).catch(() => {});
        }
      });

      this.process.on('error', (err) => {
        console.error('[CoplayMCP] Process error:', err.message);
        this.killProcess();
      });

      // Initialize MCP session
      const initResponse = await this.sendJsonRpc('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'spacecode-vscode',
          version: '1.0.0'
        }
      }, 15000);

      if (!initResponse.result?.protocolVersion) {
        console.error('[CoplayMCP] MCP initialize failed — no protocolVersion in response:', initResponse);
        this.killProcess();
        return false;
      }

      // Send initialized notification (no response expected)
      this.sendNotification('notifications/initialized', {});

      this.initialized = true;
      console.log(`[CoplayMCP] MCP session initialized (protocol: ${initResponse.result.protocolVersion})`);

      // Update MCPManager status to running
      await this.mcpManager.startServer(this.SERVER_ID);

      return true;
    } catch (error) {
      console.error('[CoplayMCP] Connection failed:', error);
      this.killProcess();
      return false;
    } finally {
      this.connecting = false;
    }
  }

  /**
   * Disconnect: kill the child process
   */
  async disconnect(): Promise<void> {
    this.killProcess();
    if (this.mcpManager) {
      await this.mcpManager.stopServer(this.SERVER_ID);
    }
  }

  /**
   * Check if connected (process alive AND MCP session initialized)
   */
  isConnected(): boolean {
    return !!(this.process && !this.process.killed && this.initialized);
  }

  /**
   * List available tools on the server
   */
  async listTools(): Promise<CoplayResult<any[]>> {
    try {
      await this.ensureConnected();
      const response = await this.sendJsonRpc('tools/list', {});
      if (response.error) {
        return { success: false, error: response.error.message || 'Failed to list tools' };
      }
      return { success: true, data: response.result?.tools || [] };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // ============================================
  // Project Management
  // ============================================

  async listProjects(): Promise<CoplayResult<UnityProject[]>> {
    return this.callTool('list_unity_project_roots', {});
  }

  async setProject(projectRoot: string): Promise<CoplayResult> {
    this.activeProject = projectRoot;
    return this.callTool('set_unity_project_root', {
      unity_project_root: projectRoot
    });
  }

  getActiveProject(): string | null {
    return this.activeProject;
  }

  // ============================================
  // Editor Control
  // ============================================

  async play(): Promise<CoplayResult> {
    return this.callTool('play_game', {});
  }

  async stop(): Promise<CoplayResult> {
    return this.callTool('stop_game', {});
  }

  async checkCompileErrors(): Promise<CoplayResult> {
    return this.callTool('check_compile_errors', {});
  }

  async getEditorState(): Promise<CoplayResult> {
    return this.callTool('get_unity_editor_state', {});
  }

  async getLogs(options?: LogOptions): Promise<CoplayResult> {
    return this.callTool('get_unity_logs', {
      show_logs: options?.showLogs ?? true,
      show_warnings: options?.showWarnings ?? true,
      show_errors: options?.showErrors ?? true,
      show_stack_traces: options?.showStackTraces ?? true,
      search_term: options?.searchTerm || null,
      limit: options?.limit || 100,
      skip_newest_n_logs: options?.skipNewestNLogs || 0
    });
  }

  // ============================================
  // Asset Refresh
  // ============================================

  async refreshAssets(): Promise<CoplayResult> {
    // Use a persistent script file for refresh to avoid timing issues
    const scriptDir = path.join(os.homedir(), '.spacecode', 'scripts');
    if (!fs.existsSync(scriptDir)) {
      fs.mkdirSync(scriptDir, { recursive: true });
    }

    const scriptPath = path.join(scriptDir, 'RefreshUnity.cs');

    // Only create the script if it doesn't exist - allow user modifications to persist
    if (!fs.existsSync(scriptPath)) {
      const scriptContent = `using UnityEditor;
using UnityEngine;

public static class RefreshUnity
{
    public static string Execute()
    {
        Debug.Log("[SpaceCode] Refreshing Unity assets...");
        AssetDatabase.Refresh(ImportAssetOptions.ForceUpdate);
        Debug.Log("[SpaceCode] Asset refresh complete!");
        return "Unity asset database refreshed successfully";
    }
}
`;
      fs.writeFileSync(scriptPath, scriptContent);
    }

    console.log(`[CoplayMCP] refreshAssets() called - executing script at: ${scriptPath}`);

    // Add timeout wrapper to prevent hanging
    const timeoutMs = 15000; // 15 second timeout
    const timeoutPromise = new Promise<CoplayResult>((_, reject) =>
      setTimeout(() => reject(new Error('execute_script timed out after 15s')), timeoutMs)
    );

    try {
      const result = await Promise.race([
        this.callTool('execute_script', {
          filePath: scriptPath,
          methodName: 'Execute'
        }),
        timeoutPromise
      ]);
      console.log(`[CoplayMCP] refreshAssets() completed:`, result);
      return result;
    } catch (error) {
      console.error(`[CoplayMCP] refreshAssets() failed:`, error);
      // If execute_script fails/times out, at least verify connection with simpler call
      const stateResult = await this.getEditorState();
      if (stateResult.success) {
        return {
          success: false,
          error: `Script execution timed out, but Unity is connected. Try pressing Ctrl+R in Unity to refresh manually.`
        };
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during refresh'
      };
    }
  }

  async executeScript(code: string, methodName: string = 'Execute'): Promise<CoplayResult> {
    // Write script to persistent location (not deleted immediately)
    const scriptDir = path.join(os.homedir(), '.spacecode', 'scripts');
    if (!fs.existsSync(scriptDir)) {
      fs.mkdirSync(scriptDir, { recursive: true });
    }

    const scriptPath = path.join(scriptDir, `TempScript_${Date.now()}.cs`);
    fs.writeFileSync(scriptPath, code);

    console.log(`[CoplayMCP] Executing script at: ${scriptPath}`);

    try {
      const result = await this.callTool('execute_script', {
        filePath: scriptPath,
        methodName: methodName
      });

      // Don't delete immediately - let it persist for debugging
      // Clean up old scripts periodically instead
      return result;
    } catch (error) {
      throw error;
    }
  }

  // ============================================
  // GameObject Operations
  // ============================================

  async createGameObject(options: GameObjectOptions): Promise<CoplayResult> {
    return this.callTool('create_game_object', {
      name: options.name,
      position: options.position,
      primitive_type: options.primitiveType || null,
      size: options.size || null,
      prefab_path: options.prefabPath || null,
      use_world_coordinates: options.useWorldCoordinates || null
    });
  }

  async deleteGameObject(gameobjectPath: string, prefabPath?: string): Promise<CoplayResult> {
    return this.callTool('delete_game_object', {
      gameobject_path: gameobjectPath,
      prefab_path: prefabPath || null
    });
  }

  async setTransform(options: TransformOptions): Promise<CoplayResult> {
    return this.callTool('set_transform', {
      gameobject_path: options.gameobjectPath,
      position: options.position || null,
      rotation: options.rotation || null,
      scale: options.scale || null,
      prefab_path: options.prefabPath || null,
      use_world_coordinates: options.useWorldCoordinates || null
    });
  }

  // ============================================
  // Component Operations
  // ============================================

  async addComponent(options: ComponentOptions): Promise<CoplayResult> {
    return this.callTool('add_component', {
      gameobject_path: options.gameobjectPath,
      component_type: options.componentType,
      prefab_path: options.prefabPath || null
    });
  }

  async removeComponent(options: ComponentOptions): Promise<CoplayResult> {
    return this.callTool('remove_component', {
      gameobject_path: options.gameobjectPath,
      component_type: options.componentType,
      prefab_path: options.prefabPath || null
    });
  }

  async setProperty(options: PropertyOptions): Promise<CoplayResult> {
    return this.callTool('set_property', {
      gameobject_path: options.gameobjectPath,
      component_type: options.componentType,
      property_name: options.propertyName,
      value: options.value,
      prefab_path: options.prefabPath || null,
      asset_path: options.assetPath || null
    });
  }

  // ============================================
  // Scene Operations
  // ============================================

  async createScene(sceneName: string, scenePath?: string): Promise<CoplayResult> {
    return this.callTool('create_scene', {
      scene_name: sceneName,
      scene_path: scenePath || null,
      add_to_editor: true
    });
  }

  async openScene(scenePath: string): Promise<CoplayResult> {
    return this.callTool('open_scene', {
      scene_path: scenePath
    });
  }

  async saveScene(sceneName: string): Promise<CoplayResult> {
    return this.callTool('save_scene', {
      scene_name: sceneName
    });
  }

  // ============================================
  // Connection Status
  // ============================================

  async ping(): Promise<boolean> {
    try {
      if (!this.isConnected()) {
        const connected = await this.connect();
        if (!connected) return false;
      }
      const result = await this.listProjects();
      return result.success;
    } catch {
      return false;
    }
  }

  // ============================================
  // Internal: Stdio JSON-RPC Transport
  // ============================================

  /**
   * Ensure the process is spawned and the MCP session is initialized
   */
  private async ensureConnected(): Promise<void> {
    if (!this.isConnected()) {
      const connected = await this.connect();
      if (!connected) {
        throw new Error('Failed to connect to Coplay MCP server');
      }
    }
  }

  /**
   * Call an MCP tool via the stdio transport
   */
  private async callTool(toolName: string, args: Record<string, unknown>): Promise<CoplayResult> {
    try {
      if (!this.mcpManager) {
        return { success: false, error: 'MCPManager not initialized' };
      }

      await this.ensureConnected();

      console.log(`[CoplayMCP] Calling tool: ${toolName}`, args);

      const response = await this.sendJsonRpc('tools/call', {
        name: toolName,
        arguments: args
      });

      if (response.error) {
        return {
          success: false,
          error: response.error.message || response.error.data || 'Tool call failed'
        };
      }

      return {
        success: true,
        data: response.result?.content || response.result
      };
    } catch (error) {
      console.error(`[CoplayMCP] Tool call failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Send a JSON-RPC request and wait for the response
   */
  private sendJsonRpc(method: string, params: Record<string, unknown>, timeoutMs?: number): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.process || !this.process.stdin || this.process.killed) {
        reject(new Error('Coplay MCP process not running'));
        return;
      }

      const id = ++this.requestId;
      const message = JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params
      }) + '\n';

      const timeout = timeoutMs || this.DEFAULT_TIMEOUT_MS;
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Coplay MCP request '${method}' timed out after ${timeout}ms`));
      }, timeout);

      this.pendingRequests.set(id, { resolve, reject, timer });

      this.process.stdin.write(message, (err) => {
        if (err) {
          clearTimeout(timer);
          this.pendingRequests.delete(id);
          reject(new Error(`Failed to write to Coplay MCP stdin: ${err.message}`));
        }
      });
    });
  }

  /**
   * Send a JSON-RPC notification (no response expected)
   */
  private sendNotification(method: string, params: Record<string, unknown>): void {
    if (!this.process || !this.process.stdin || this.process.killed) return;

    const message = JSON.stringify({
      jsonrpc: '2.0',
      method,
      params
    }) + '\n';

    this.process.stdin.write(message);
  }

  /**
   * Process buffered stdout data, extracting complete JSON-RPC messages
   */
  private processStdoutBuffer(): void {
    const lines = this.stdoutBuffer.split('\n');
    // Keep the last (possibly incomplete) line in the buffer
    this.stdoutBuffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const message = JSON.parse(trimmed);

        // JSON-RPC response (has id)
        if (message.id !== undefined && this.pendingRequests.has(message.id)) {
          const pending = this.pendingRequests.get(message.id)!;
          clearTimeout(pending.timer);
          this.pendingRequests.delete(message.id);
          pending.resolve(message);
        }
        // JSON-RPC notification (no id) — log for debugging
        else if (message.method) {
          console.log(`[CoplayMCP] Notification: ${message.method}`);
        }
      } catch {
        // Non-JSON output from the process (startup logs, etc.)
        console.log('[CoplayMCP] stdout:', trimmed);
      }
    }
  }

  /**
   * Kill the child process and clean up
   */
  private killProcess(): void {
    if (this.process) {
      try {
        this.process.kill('SIGTERM');
      } catch {
        // Process may already be dead
      }
      this.process = null;
    }

    this.initialized = false;
    this.stdoutBuffer = '';

    // Reject all pending requests
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Coplay MCP process killed'));
    }
    this.pendingRequests.clear();
  }
}

// ============================================
// Singleton Instance
// ============================================

let coplayClient: CoplayMCPClient | null = null;

export function getCoplayClient(): CoplayMCPClient {
  if (!coplayClient) {
    coplayClient = new CoplayMCPClient();
  }
  return coplayClient;
}

export async function initializeCoplayClient(context: vscode.ExtensionContext, mcpManager?: any): Promise<CoplayMCPClient> {
  const client = getCoplayClient();
  await client.initialize(context, mcpManager);
  return client;
}

export function disposeCoplayClient(): void {
  if (coplayClient) {
    coplayClient.disconnect();
  }
  coplayClient = null;
}
