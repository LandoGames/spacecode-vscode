/**
 * Coplay MCP Client - Stub
 * TODO: Implement actual Coplay MCP communication
 */

export class CoplayMCPClient {
  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async sendCommand(command: string, args?: any): Promise<any> { return null; }
  get connected(): boolean { return false; }
}

let instance: CoplayMCPClient | null = null;

export function getCoplayClient(): CoplayMCPClient {
  if (!instance) { instance = new CoplayMCPClient(); }
  return instance;
}
