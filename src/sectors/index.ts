/**
 * Sectors Module - Stub
 * TODO: Implement sector management for ship metaphor
 */

export interface SectorConfig {
  id: string;
  name: string;
  paths: string[];
  rules?: string;
}

export class SectorManager {
  private sectors: SectorConfig[] = [];

  getSectors(): SectorConfig[] { return this.sectors; }
  getSector(id: string): SectorConfig | undefined {
    return this.sectors.find(s => s.id === id);
  }
  setSectors(configs: SectorConfig[]): void { this.sectors = configs; }
}

let instance: SectorManager | null = null;

export function initSectorManager(config?: SectorConfig | SectorConfig[]): void {
  instance = new SectorManager();
  if (config) {
    const configs = Array.isArray(config) ? config : [config];
    instance.setSectors(configs);
  }
}

export function getSectorManager(): SectorManager {
  if (!instance) { instance = new SectorManager(); }
  return instance;
}
