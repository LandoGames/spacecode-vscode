import * as vscode from 'vscode';
import * as http from 'http';
import * as https from 'https';
import { logger } from './logService';

export interface CoordinatorHealth {
  ok: boolean;
  status?: string;
  error?: string;
}

export class CoordinatorClient {
  private readonly _config: vscode.WorkspaceConfiguration;

  constructor() {
    this._config = vscode.workspace.getConfiguration('spacecode');
  }

  private isEnabled(): boolean {
    return this._config.get<boolean>('coordinatorEnabled', true) === true;
  }

  private getBaseUrl(): string {
    return this._config.get<string>('coordinatorUrl', 'http://127.0.0.1:5510');
  }

  async health(): Promise<CoordinatorHealth> {
    if (!this.isEnabled()) {
      return { ok: false, status: 'disabled' };
    }
    try {
      const res = await this.requestJson(`${this.getBaseUrl()}/health`, 'GET');
      if (!res.ok) {
        return { ok: false, status: `http-${res.status}` };
      }
      const json = (res.json ?? {}) as { status?: string };
      return { ok: true, status: json.status ?? 'ok' };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  }

  async setAsmdefPolicy(payload: unknown): Promise<void> {
    await this.post('/asmdef/policy', payload, 'asmdef policy');
  }

  async setAsmdefInventory(payload: unknown): Promise<void> {
    await this.post('/asmdef/inventory', payload, 'asmdef inventory');
  }

  async setAsmdefGraph(payload: unknown): Promise<void> {
    await this.post('/asmdef/graph', payload, 'asmdef graph');
  }

  async setAsmdefPolicyWithStatus(payload: unknown): Promise<{ ok: boolean; status: number; error?: string }> {
    return this.post('/asmdef/policy', payload, 'asmdef policy');
  }

  async setAsmdefInventoryWithStatus(payload: unknown): Promise<{ ok: boolean; status: number; error?: string }> {
    return this.post('/asmdef/inventory', payload, 'asmdef inventory');
  }

  async setAsmdefGraphWithStatus(payload: unknown): Promise<{ ok: boolean; status: number; error?: string }> {
    return this.post('/asmdef/graph', payload, 'asmdef graph');
  }

  private async post(path: string, payload: unknown, label: string): Promise<{ ok: boolean; status: number; error?: string }> {
    if (!this.isEnabled()) {
      return { ok: false, status: 0, error: 'disabled' };
    }
    const url = `${this.getBaseUrl()}${path}`;
    try {
      const res = await this.requestJson(url, 'POST', payload);
      if (!res.ok) {
        logger.warn('general', `Coordinator ${label} POST failed: ${res.status}`);
        return { ok: false, status: res.status, error: `http-${res.status}` };
      }
      return { ok: true, status: res.status };
    } catch (error) {
      logger.warn('general', `Coordinator ${label} POST error: ${String(error)}`);
      return { ok: false, status: 0, error: String(error) };
    }
  }

  private async requestJson(
    url: string,
    method: 'GET' | 'POST',
    body?: unknown
  ): Promise<{ ok: boolean; status: number; json?: unknown }> {
    if (typeof fetch === 'function') {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      });
      let json: unknown = undefined;
      try {
        json = await res.json();
      } catch {
        // ignore parse errors
      }
      return { ok: res.ok, status: res.status, json };
    }

    return await new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const lib = parsed.protocol === 'https:' ? https : http;
      const data = body ? JSON.stringify(body) : undefined;
      const req = lib.request(
        {
          method,
          hostname: parsed.hostname,
          port: parsed.port,
          path: parsed.pathname + parsed.search,
          headers: {
            'Content-Type': 'application/json',
            ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
          }
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            let json: unknown = undefined;
            try {
              json = text ? JSON.parse(text) : undefined;
            } catch {
              // ignore parse errors
            }
            resolve({
              ok: res.statusCode ? res.statusCode >= 200 && res.statusCode < 300 : false,
              status: res.statusCode ?? 0,
              json
            });
          });
        }
      );
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
  }
}
