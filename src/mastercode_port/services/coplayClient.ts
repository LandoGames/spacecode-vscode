/**
 * Coplay MCP Client for SpaceCode
 *
 * Uses MCPManager to connect to Coplay MCP server.
 * Connection: SpaceCode → MCPManager → Coplay MCP Server (stdio) → Unity Editor
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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
  getConnection(id: string): { client: any; tools: any[] } | undefined;
  callTool(serverId: string, toolName: string, args: Record<string, unknown>): Promise<any>;
  getServer(id: string): any;
};

// ============================================
// Coplay MCP Client
// ============================================

export class CoplayMCPClient {
  private context: vscode.ExtensionContext | null = null;
  private mcpManager: MCPManagerType | null = null;
  private activeProject: string | null = null;
  private readonly SERVER_ID = 'coplay-mcp';

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
   * Connect to Coplay MCP server via MCPManager
   */
  async connect(): Promise<boolean> {
    if (!this.mcpManager) {
      console.error('[CoplayMCP] MCPManager not set');
      return false;
    }

    try {
      console.log('[CoplayMCP] Starting connection via MCPManager...');

      // Check if server config exists
      const server = this.mcpManager.getServer(this.SERVER_ID);
      if (!server) {
        console.error('[CoplayMCP] Coplay MCP server not configured');
        return false;
      }

      // Start the server via MCPManager
      await this.mcpManager.startServer(this.SERVER_ID);

      // Verify connection
      const connection = this.mcpManager.getConnection(this.SERVER_ID);
      if (!connection) {
        console.error('[CoplayMCP] Failed to get connection after start');
        return false;
      }

      console.log('[CoplayMCP] Connected successfully via MCPManager');
      return true;
    } catch (error) {
      console.error('[CoplayMCP] Connection failed:', error);
      return false;
    }
  }

  /**
   * Disconnect from Coplay MCP server
   */
  async disconnect(): Promise<void> {
    if (this.mcpManager) {
      await this.mcpManager.stopServer(this.SERVER_ID);
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    if (!this.mcpManager) return false;
    return !!this.mcpManager.getConnection(this.SERVER_ID);
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
  // Internal: MCP Tool Calling
  // ============================================

  private async callTool(toolName: string, args: Record<string, unknown>): Promise<CoplayResult> {
    try {
      if (!this.mcpManager) {
        return {
          success: false,
          error: 'MCPManager not initialized'
        };
      }

      // Ensure connected
      if (!this.isConnected()) {
        const connected = await this.connect();
        if (!connected) {
          return {
            success: false,
            error: 'Failed to connect to Coplay MCP server. Click "Launch" in MCP settings first.'
          };
        }
      }

      console.log(`[CoplayMCP] Calling tool: ${toolName}`, args);

      // Call the tool via MCPManager
      const result = await this.mcpManager.callTool(this.SERVER_ID, toolName, args);

      console.log(`[CoplayMCP] Tool result:`, result);

      // Parse result
      if (result.isError) {
        return {
          success: false,
          error: typeof result.content === 'string' ? result.content : JSON.stringify(result.content)
        };
      }

      // Extract text content
      let data: any = result.content;
      if (Array.isArray(result.content)) {
        const textContent = result.content.find((c: any) => c.type === 'text');
        if (textContent) {
          try {
            data = JSON.parse(textContent.text);
          } catch {
            data = textContent.text;
          }
        }
      }

      return {
        success: true,
        data
      };
    } catch (error) {
      console.error(`[CoplayMCP] Tool call failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
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
