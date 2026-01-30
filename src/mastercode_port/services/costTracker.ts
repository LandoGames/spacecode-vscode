/**
 * Cost Tracking Service
 *
 * Tracks API usage and costs across sessions
 */

import * as vscode from 'vscode';

export interface UsageRecord {
  timestamp: number;
  provider: 'claude' | 'gpt';
  model: string;
  tokens: {
    input: number;
    output: number;
  };
  cost: number;
  operation: string; // e.g., 'code-review', 'chat', 'debate'
}

export interface UsageSummary {
  totalCost: number;
  totalTokens: {
    input: number;
    output: number;
  };
  byProvider: {
    claude: { cost: number; tokens: { input: number; output: number }; calls: number };
    gpt: { cost: number; tokens: { input: number; output: number }; calls: number };
  };
  byOperation: Map<string, { cost: number; calls: number }>;
  recordCount: number;
}

export class CostTracker {
  private records: UsageRecord[] = [];
  private context: vscode.ExtensionContext | null = null;
  private readonly STORAGE_KEY = 'spacecode.usageRecords';
  private readonly MAX_RECORDS = 10000; // Keep last 10k records

  async initialize(context: vscode.ExtensionContext): Promise<void> {
    this.context = context;
    await this.loadRecords();
  }

  private async loadRecords(): Promise<void> {
    if (!this.context) { return; }

    const stored = this.context.globalState.get<UsageRecord[]>(this.STORAGE_KEY);
    if (stored) {
      this.records = stored;
    }
  }

  private async saveRecords(): Promise<void> {
    if (!this.context) { return; }

    // Trim old records if needed
    if (this.records.length > this.MAX_RECORDS) {
      this.records = this.records.slice(-this.MAX_RECORDS);
    }

    await this.context.globalState.update(this.STORAGE_KEY, this.records);
  }

  async recordUsage(
    provider: 'claude' | 'gpt',
    model: string,
    tokens: { input: number; output: number },
    cost: number,
    operation: string
  ): Promise<void> {
    const record: UsageRecord = {
      timestamp: Date.now(),
      provider,
      model,
      tokens,
      cost,
      operation,
    };

    this.records.push(record);
    await this.saveRecords();

    // Show cost notification if enabled
    const config = vscode.workspace.getConfiguration('spacecode');
    if (config.get<boolean>('showCostNotifications', true)) {
      const costStr = cost.toFixed(4);
      vscode.window.setStatusBarMessage(
        `SpaceCode: ${provider} call cost $${costStr}`,
        5000
      );
    }
  }

  getSummary(since?: Date): UsageSummary {
    const sinceTimestamp = since?.getTime() || 0;
    const relevantRecords = this.records.filter(r => r.timestamp >= sinceTimestamp);

    const summary: UsageSummary = {
      totalCost: 0,
      totalTokens: { input: 0, output: 0 },
      byProvider: {
        claude: { cost: 0, tokens: { input: 0, output: 0 }, calls: 0 },
        gpt: { cost: 0, tokens: { input: 0, output: 0 }, calls: 0 },
      },
      byOperation: new Map(),
      recordCount: relevantRecords.length,
    };

    for (const record of relevantRecords) {
      summary.totalCost += record.cost;
      summary.totalTokens.input += record.tokens.input;
      summary.totalTokens.output += record.tokens.output;

      const providerStats = summary.byProvider[record.provider];
      providerStats.cost += record.cost;
      providerStats.tokens.input += record.tokens.input;
      providerStats.tokens.output += record.tokens.output;
      providerStats.calls++;

      const opStats = summary.byOperation.get(record.operation) || { cost: 0, calls: 0 };
      opStats.cost += record.cost;
      opStats.calls++;
      summary.byOperation.set(record.operation, opStats);
    }

    return summary;
  }

  getTodaySummary(): UsageSummary {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return this.getSummary(today);
  }

  getThisMonthSummary(): UsageSummary {
    const firstOfMonth = new Date();
    firstOfMonth.setDate(1);
    firstOfMonth.setHours(0, 0, 0, 0);
    return this.getSummary(firstOfMonth);
  }

  getRecentRecords(count: number = 50): UsageRecord[] {
    return this.records.slice(-count).reverse();
  }

  async clearRecords(): Promise<void> {
    this.records = [];
    await this.saveRecords();
  }

  formatSummary(summary: UsageSummary): string {
    const lines: string[] = [
      `=== Usage Summary (${summary.recordCount} calls) ===`,
      '',
      `Total Cost: $${summary.totalCost.toFixed(4)}`,
      `Total Tokens: ${(summary.totalTokens.input + summary.totalTokens.output).toLocaleString()}`,
      `  - Input:  ${summary.totalTokens.input.toLocaleString()}`,
      `  - Output: ${summary.totalTokens.output.toLocaleString()}`,
      '',
      '--- By Provider ---',
      '',
      `Claude:`,
      `  Calls: ${summary.byProvider.claude.calls}`,
      `  Cost:  $${summary.byProvider.claude.cost.toFixed(4)}`,
      `  Tokens: ${(summary.byProvider.claude.tokens.input + summary.byProvider.claude.tokens.output).toLocaleString()}`,
      '',
      `GPT:`,
      `  Calls: ${summary.byProvider.gpt.calls}`,
      `  Cost:  $${summary.byProvider.gpt.cost.toFixed(4)}`,
      `  Tokens: ${(summary.byProvider.gpt.tokens.input + summary.byProvider.gpt.tokens.output).toLocaleString()}`,
    ];

    if (summary.byOperation.size > 0) {
      lines.push('', '--- By Operation ---', '');
      for (const [op, stats] of summary.byOperation) {
        lines.push(`${op}: ${stats.calls} calls, $${stats.cost.toFixed(4)}`);
      }
    }

    return lines.join('\n');
  }
}
