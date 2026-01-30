export type ProviderId = 'claude' | 'gpt';

export type SpaceCodeProfile = 'yard' | 'scout' | 'battleship';

export interface ContextPack {
  id: string;
  profile: SpaceCodeProfile;
  sector: {
    id: string;
    name: string;
    pathHints: string[];
  };
  pinnedFacts: Record<string, string>;
  rulesSummary: string;
  evidence: {
    files: string[];
    notes: string[];
  };
  // The exact string appended to model prompts (shown in UI for transparency).
  injectionText: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  provider?: ProviderId;
  createdAtMs: number;
  content: string;
}

export interface Job {
  id: string;
  title: string;
  profile: SpaceCodeProfile;
  status: 'draft' | 'running' | 'blocked' | 'needs_approval' | 'done' | 'failed';
  createdAtMs: number;
  updatedAtMs: number;
}

export interface GateResult {
  gateId: string;
  ok: boolean;
  summary: string;
  details?: string;
}
