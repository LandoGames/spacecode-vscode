export interface ProviderSendOptions {
  // Legacy interface placeholder; SpaceCode now uses MasterCode providers directly.
}

export interface ProviderSendResult {
  text: string;
}

export interface Provider {
  readonly id: 'claude' | 'gpt';
  send(opts: ProviderSendOptions): Promise<ProviderSendResult>;
}
