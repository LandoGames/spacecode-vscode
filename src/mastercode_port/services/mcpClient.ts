/**
 * MCP Client
 *
 * Direct client for calling MCP tools on HTTP-based servers.
 * Supports the MCP SSE streaming protocol used by Unity MCP.
 */

import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

export interface MCPToolResult {
  success: boolean;
  content?: any;
  error?: string;
}

export interface MCPResourceResult {
  success: boolean;
  contents?: Array<{
    uri: string;
    mimeType?: string;
    text?: string;
  }>;
  error?: string;
}

/**
 * Client for calling MCP tools via HTTP with SSE protocol support
 */
export class MCPClient {
  private serverUrl: string;
  private requestId: number = 0;
  private sessionId: string | null = null;
  private initialized: boolean = false;

  constructor(serverUrl: string = 'http://localhost:8080/mcp') {
    this.serverUrl = serverUrl;
  }

  /**
   * Set the server URL
   */
  setServerUrl(url: string): void {
    this.serverUrl = url;
    // Reset session when URL changes
    this.sessionId = null;
    this.initialized = false;
  }

  /**
   * Initialize the MCP session
   */
  async initialize(): Promise<boolean> {
    try {
      console.log('[MCPClient] Initializing session...');
      const response = await this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'spacecode-vscode',
          version: '1.0.0'
        }
      });

      console.log('[MCPClient] Initialize response:', JSON.stringify(response).substring(0, 500));

      if (response.result?.protocolVersion) {
        this.initialized = true;
        console.log('[MCPClient] Session initialized successfully');
        return true;
      }
      console.log('[MCPClient] Initialize failed - no protocolVersion in response');
      return false;
    } catch (error) {
      console.error('[MCPClient] Initialize error:', error);
      return false;
    }
  }

  /**
   * Ensure the session is initialized before making calls
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Call an MCP tool
   */
  async callTool(toolName: string, args: Record<string, unknown> = {}): Promise<MCPToolResult> {
    try {
      await this.ensureInitialized();

      const response = await this.sendRequest('tools/call', {
        name: toolName,
        arguments: args
      });

      if (response.error) {
        return {
          success: false,
          error: response.error.message || 'Tool call failed'
        };
      }

      return {
        success: true,
        content: response.result?.content || response.result
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Read an MCP resource
   */
  async readResource(uri: string): Promise<MCPResourceResult> {
    try {
      await this.ensureInitialized();

      const response = await this.sendRequest('resources/read', {
        uri
      });

      if (response.error) {
        return {
          success: false,
          error: response.error.message || 'Resource read failed'
        };
      }

      return {
        success: true,
        contents: response.result?.contents || []
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * List available tools
   */
  async listTools(): Promise<{ success: boolean; tools?: any[]; error?: string }> {
    try {
      await this.ensureInitialized();

      const response = await this.sendRequest('tools/list', {});

      if (response.error) {
        return {
          success: false,
          error: response.error.message || 'Failed to list tools'
        };
      }

      return {
        success: true,
        tools: response.result?.tools || []
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Check if the MCP server is reachable
   * If already initialized, tries listing tools to verify connection
   * If not initialized, tries to initialize
   */
  async ping(): Promise<boolean> {
    try {
      console.log('[MCPClient] Pinging server at:', this.serverUrl, 'initialized:', this.initialized);

      if (this.initialized) {
        // Already initialized - try a simple operation to verify connection still works
        const toolsResult = await this.listTools();
        console.log('[MCPClient] Ping via listTools result:', toolsResult.success);
        return toolsResult.success;
      }

      // Not initialized - try to initialize
      const success = await this.initialize();
      console.log('[MCPClient] Ping via initialize result:', success, 'sessionId:', this.sessionId);
      return success;
    } catch (error) {
      console.error('[MCPClient] Ping error:', error);
      return false;
    }
  }

  /**
   * Parse SSE response data
   */
  private parseSSEResponse(data: string): any {
    // SSE format: "event: message\ndata: {...}\n\n"
    const lines = data.split('\n');
    let jsonData = '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        jsonData = line.substring(6);
        break;
      }
    }

    if (jsonData) {
      try {
        return JSON.parse(jsonData);
      } catch {
        // Not SSE format, try parsing the whole thing
      }
    }

    // Try parsing as regular JSON
    try {
      return JSON.parse(data);
    } catch {
      return { error: { message: 'Invalid response format' } };
    }
  }

  /**
   * Send JSON-RPC request to MCP server with SSE support
   */
  private sendRequest(method: string, params: Record<string, unknown>): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = new URL(this.serverUrl);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;

      const requestBody = JSON.stringify({
        jsonrpc: '2.0',
        id: ++this.requestId,
        method,
        params
      });

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody).toString(),
        'Accept': 'application/json, text/event-stream'
      };

      // Include session ID if we have one
      if (this.sessionId) {
        headers['Mcp-Session-Id'] = this.sessionId;
      }

      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers,
        timeout: 30000
      };

      const req = client.request(options, (res) => {
        let data = '';

        // Capture session ID from response
        const newSessionId = res.headers['mcp-session-id'];
        if (newSessionId && typeof newSessionId === 'string') {
          this.sessionId = newSessionId;
        }

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          const parsed = this.parseSSEResponse(data);
          resolve(parsed);
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timed out'));
      });

      req.write(requestBody);
      req.end();
    });
  }
}

/**
 * Unity MCP client with typed methods for CodeSensei tools
 */
export class UnityMCPClient extends MCPClient {
  constructor(serverUrl: string = 'http://localhost:8080/mcp') {
    super(serverUrl);
  }

  /**
   * Get context brief for a file (assembly, namespace, etc.)
   */
  async getContextBrief(filePath: string): Promise<MCPToolResult> {
    return this.callTool('manage_script_capabilities', {
      action: 'context_brief',
      file_path: filePath
    });
  }

  /**
   * Get assembly dependency graph
   */
  async getAssemblyGraph(assemblyName?: string): Promise<MCPToolResult> {
    return this.callTool('manage_script_capabilities', {
      action: 'assembly_graph',
      assembly_name: assemblyName
    });
  }

  /**
   * Run AI code review
   */
  async runAIReview(filePath?: string, diff?: string): Promise<MCPToolResult> {
    return this.callTool('manage_script_capabilities', {
      action: 'run_ai_review',
      file_path: filePath,
      diff
    });
  }

  /**
   * Run code explainer (Sensei)
   */
  async runExplainer(filePath: string, selection?: string): Promise<MCPToolResult> {
    return this.callTool('manage_script_capabilities', {
      action: 'run_explainer',
      file_path: filePath,
      selection
    });
  }

  /**
   * Sync documentation
   */
  async syncDocs(filePath?: string, sectorId?: string): Promise<MCPToolResult> {
    return this.callTool('manage_script_capabilities', {
      action: 'sync_docs',
      file_path: filePath,
      sector_id: sectorId
    });
  }

  /**
   * Read editor state resource
   */
  async getEditorState(): Promise<MCPResourceResult> {
    return this.readResource('mcpforunity://editor_state');
  }

  /**
   * Read console logs
   */
  async readConsole(logType: 'All' | 'Error' | 'Warning' | 'Log' = 'All', count: number = 50): Promise<MCPToolResult> {
    return this.callTool('read_console', {
      action: 'get',
      types: [logType.toLowerCase()],
      count: count.toString()
    });
  }

  /**
   * Control Unity editor play mode
   */
  async controlPlayMode(action: 'play' | 'stop' | 'pause'): Promise<MCPToolResult> {
    return this.callTool('manage_editor', {
      action
    });
  }

  /**
   * Refresh Unity asset database and optionally compile scripts
   * This forces Unity to reload and apply code changes
   */
  async refreshUnity(
    mode: 'if_dirty' | 'force' = 'force',
    scope: 'assets' | 'scripts' | 'all' = 'all',
    compile: 'none' | 'request' = 'request'
  ): Promise<MCPToolResult> {
    return this.callTool('refresh_unity', {
      mode,
      scope,
      compile
    });
  }
}

// Singleton instance
let unityMcpClient: UnityMCPClient | null = null;

/**
 * Get the Unity MCP client instance
 */
export function getUnityMCPClient(serverUrl?: string): UnityMCPClient {
  if (!unityMcpClient) {
    unityMcpClient = new UnityMCPClient(serverUrl);
  } else if (serverUrl) {
    unityMcpClient.setServerUrl(serverUrl);
  }
  return unityMcpClient;
}
