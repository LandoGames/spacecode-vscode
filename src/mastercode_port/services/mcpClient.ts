/**
 * Unity MCP Client - Stub
 * TODO: Implement actual Unity MCP communication
 */

export class UnityMCPClient {
  constructor(private url: string) {}
  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async sendCommand(command: string, args?: any): Promise<any> { return null; }
  get connected(): boolean { return false; }
}

let instance: UnityMCPClient | null = null;

export function getUnityMCPClient(url: string): UnityMCPClient {
  if (!instance) { instance = new UnityMCPClient(url); }
  return instance;
}
