import * as vscode from 'vscode';

export interface PricingEntry {
  input: number;
  output: number;
}

export class PricingService {
  private context: vscode.ExtensionContext | null = null;
  private pricing: Record<string, PricingEntry> = this.defaultPricing();
  private emitter = new vscode.EventEmitter<Record<string, PricingEntry>>();

  public initialize(context: vscode.ExtensionContext): void {
    this.context = context;
    const stored = context.globalState.get<Record<string, PricingEntry>>('spacecode.pricing', this.pricing);
    if (stored) {
      this.pricing = stored;
    }
    this.refreshPricing().catch(() => undefined);
  }

  public getPricing(): Record<string, PricingEntry> {
    return this.pricing;
  }

  public get onDidUpdatePricing() {
    return this.emitter.event;
  }

  private async refreshPricing(): Promise<void> {
    try {
      const response = await fetch('https://platform.openai.com/pricing');
      if (!response.ok) {
        throw new Error('Failed to fetch pricing');
      }
      const html = await response.text();
      const updated = this.parsePricing(html);
      this.pricing = { ...this.pricing, ...updated };
      if (this.context) {
        await this.context.globalState.update('spacecode.pricing', this.pricing);
      }
      this.emitter.fire(this.pricing);
    } catch (error) {
      console.warn('[SpaceCode] Pricing refresh failed', error);
    }
  }

  private parsePricing(html: string): Record<string, PricingEntry> {
    const patterns: Record<string, { input: RegExp; output: RegExp }> = {
      'gpt-4o': {
        input: /GPT-4o[\s\S]*?\$\s*(\d+(?:\.\d+)?)\s*\/\s*1M\s*input/iu,
        output: /GPT-4o[\s\S]*?\$\s*(\d+(?:\.\d+)?)\s*\/\s*1M\s*output/iu
      },
      'gpt-4-turbo': {
        input: /GPT-4\s*-\s*Turbo[\s\S]*?\$\s*(\d+(?:\.\d+)?)\s*\/\s*1M\s*input/iu,
        output: /GPT-4\s*-\s*Turbo[\s\S]*?\$\s*(\d+(?:\.\d+)?)\s*\/\s*1M\s*output/iu
      },
      'gpt-4': {
        input: /GPT-4\s*\(\s*input tokens\s*\$\s*(\d+(?:\.\d+)?)\s*\/\s*1M/iu,
        output: /GPT-4\s*\(\s*output tokens\s*\$\s*(\d+(?:\.\d+)?)\s*\/\s*1M/iu
      },
      'gpt-5.2': {
        input: /GPT-5\.2[\s\S]*?\$\s*(\d+(?:\.\d+)?)\s*\/\s*1M\s*input/iu,
        output: /GPT-5\.2[\s\S]*?\$\s*(\d+(?:\.\d+)?)\s*\/\s*1M\s*output/iu
      },
      'gpt-5.2-codex': {
        input: /GPT-5\.2\s*Codex[\s\S]*?\$\s*(\d+(?:\.\d+)?)\s*\/\s*1M\s*input/iu,
        output: /GPT-5\.2\s*Codex[\s\S]*?\$\s*(\d+(?:\.\d+)?)\s*\/\s*1M\s*output/iu
      }
    };

    const result: Record<string, PricingEntry> = {};

    for (const [model, { input, output }] of Object.entries(patterns)) {
      const inputMatch = html.match(input);
      const outputMatch = html.match(output);
      if (inputMatch && outputMatch) {
        result[model] = {
          input: parseFloat(inputMatch[1]),
          output: parseFloat(outputMatch[1])
        };
      }
    }

    return result;
  }

  private defaultPricing(): Record<string, PricingEntry> {
    return {
      'gpt-4o': { input: 2.5, output: 10 },
      'gpt-4-turbo': { input: 10, output: 30 },
      'gpt-4': { input: 30, output: 60 },
      'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
      'o1-preview': { input: 15, output: 60 },
      'o1-mini': { input: 3, output: 12 },
      'gpt-5.2': { input: 1, output: 5 },
      'gpt-5.2-codex': { input: 1.5, output: 6 }
    };
  }
}
