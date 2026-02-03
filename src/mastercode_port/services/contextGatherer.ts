/**
 * Context Gatherer - Stub
 * TODO: Implement context gathering for prompts
 */

export interface GatheredContext {
  files: string[];
  symbols: string[];
  injectionText: string;
  sector?: string;
}

export class ContextGatherer {
  async gather(options?: { sector?: string; files?: string[] }): Promise<GatheredContext> {
    return { files: [], symbols: [], injectionText: '' };
  }
}

let instance: ContextGatherer | null = null;

export function getContextGatherer(): ContextGatherer {
  if (!instance) { instance = new ContextGatherer(); }
  return instance;
}
