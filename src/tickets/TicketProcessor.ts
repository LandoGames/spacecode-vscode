/**
 * Ticket Processor
 *
 * Parses tickets and builds TicketContext with sector detection,
 * file mapping, and KB scope identification.
 */

import * as vscode from 'vscode';
import { Ticket } from './types';
import {
  TicketPayload,
  TicketContext,
  TicketIntent,
  SectorDetection,
  SectorSignal,
  RelevantFile,
  PriorTicketHistory,
  TicketFlowConfig,
  DEFAULT_TICKET_FLOW_CONFIG,
  TicketSource,
} from './flowTypes';
import { getSectorManager, Sector } from '../sectors/SectorConfig';

/**
 * Ticket Processor - transforms raw tickets into actionable context
 */
export class TicketProcessor {
  private config: TicketFlowConfig;

  constructor(config?: Partial<TicketFlowConfig>) {
    this.config = { ...DEFAULT_TICKET_FLOW_CONFIG, ...config };
  }

  /**
   * Process a ticket and build full context
   */
  async processTicket(ticket: Ticket, source: TicketSource = 'local'): Promise<TicketContext> {
    // Enhance ticket to payload
    const payload = this.enhanceTicket(ticket, source);

    // Detect sectors
    const detectedSectors = this.detectSectors(payload);

    // Determine primary sector
    const primarySector = this.determinePrimarySector(detectedSectors);

    // Find KB scope
    const kbScope = this.findKbScope(payload);

    // Collect relevant files
    const relevantFiles = await this.collectRelevantFiles(payload, primarySector);

    // Load prior history (if available)
    const priorHistory = this.loadPriorHistory(primarySector.id);

    // Calculate token budget
    const tokenBudget = this.calculateTokenBudget(payload, relevantFiles);

    return {
      ticket: payload,
      detectedSectors,
      primarySector,
      kbScope,
      relevantFiles,
      priorHistory,
      tokenBudget,
    };
  }

  /**
   * Enhance a basic ticket to full payload
   */
  private enhanceTicket(ticket: Ticket, source: TicketSource): TicketPayload {
    const body = ticket.description;

    // Extract file paths mentioned in description
    const mentionedPaths = this.extractFilePaths(body);

    // Extract domain keywords
    const domainKeywords = this.extractDomainKeywords(body);

    // Detect intent
    const intent = this.detectIntent(ticket.title, body);

    return {
      ...ticket,
      source,
      body,
      labels: [], // Would be populated from external source
      linkedFiles: [],
      mentionedPaths,
      referencedIssues: this.extractIssueReferences(body),
      domainKeywords,
      intent,
    };
  }

  /**
   * Extract file paths from text
   */
  private extractFilePaths(text: string): string[] {
    const paths: string[] = [];

    // Match common file path patterns
    const patterns = [
      // Absolute or relative paths with extensions
      /(?:^|[\s`"'])([A-Za-z]?:?[\/\\]?(?:[\w.-]+[\/\\])*[\w.-]+\.\w{1,10})(?:[\s`"']|$)/gm,
      // Unity-style Assets/ paths
      /Assets\/[\w\-\/]+\.(?:cs|unity|prefab|asset|mat|shader)/gi,
      // Path in backticks
      /`([^`]+\.\w{1,10})`/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const path = match[1] || match[0];
        if (path && !paths.includes(path)) {
          paths.push(path.trim());
        }
      }
    }

    return paths;
  }

  /**
   * Extract domain keywords from text
   */
  private extractDomainKeywords(text: string): string[] {
    const keywords: string[] = [];
    const lowerText = text.toLowerCase();

    for (const mapping of this.config.domainMappings) {
      for (const keyword of mapping.keywords) {
        if (lowerText.includes(keyword.toLowerCase())) {
          keywords.push(keyword);
        }
      }
    }

    return keywords;
  }

  /**
   * Extract issue references (e.g., #123, GH-456)
   */
  private extractIssueReferences(text: string): string[] {
    const refs: string[] = [];
    const patterns = [
      /#(\d+)/g, // #123
      /GH-(\d+)/gi, // GH-123
      /(?:closes?|fixes?|resolves?)\s+#(\d+)/gi, // Closes #123
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const ref = `#${match[1]}`;
        if (!refs.includes(ref)) {
          refs.push(ref);
        }
      }
    }

    return refs;
  }

  /**
   * Detect intent from ticket content
   */
  private detectIntent(title: string, body: string): TicketIntent {
    const text = `${title} ${body}`.toLowerCase();

    // Check patterns in order of specificity
    if (/\b(bug|fix|broken|crash|error|issue)\b/i.test(text)) {
      return 'bugfix';
    }
    if (/\b(refactor|cleanup|reorganize|restructure)\b/i.test(text)) {
      return 'refactor';
    }
    if (/\b(test|spec|coverage)\b/i.test(text)) {
      return 'test';
    }
    if (/\b(doc|readme|comment|documentation)\b/i.test(text)) {
      return 'docs';
    }
    if (/\b(add|implement|create|new|feature)\b/i.test(text)) {
      return 'feature';
    }
    if (/\b(chore|update|upgrade|bump|dependency)\b/i.test(text)) {
      return 'chore';
    }

    return 'unknown';
  }

  /**
   * Detect sectors from ticket payload
   */
  private detectSectors(payload: TicketPayload): SectorDetection[] {
    const signals: SectorSignal[] = [];
    const sectorScores = new Map<string, number>();
    const sectorManager = getSectorManager();

    // Signal from file paths mentioned
    for (const path of payload.mentionedPaths) {
      const sector = sectorManager.detectSector(path);
      if (sector) {
        signals.push({ type: 'path', value: path, sectorId: sector.id });
        sectorScores.set(sector.id, (sectorScores.get(sector.id) || 0) + 3);
      }
    }

    // Signal from labels
    for (const label of payload.labels) {
      const mapping = this.config.labelMappings.find(
        m => m.label.toLowerCase() === label.name.toLowerCase()
      );
      if (mapping) {
        signals.push({ type: 'label', value: label.name, sectorId: mapping.sectorId });
        sectorScores.set(mapping.sectorId, (sectorScores.get(mapping.sectorId) || 0) + mapping.priority);
      }
    }

    // Signal from domain keywords
    for (const keyword of payload.domainKeywords) {
      // Try to map keyword to sector
      const mapping = this.config.domainMappings.find(
        m => m.keywords.some(k => k.toLowerCase() === keyword.toLowerCase())
      );
      if (mapping) {
        // Domain keywords often map to specific sectors
        const sectorId = this.domainToSector(mapping.kbScope);
        if (sectorId) {
          signals.push({ type: 'keyword', value: keyword, sectorId });
          sectorScores.set(sectorId, (sectorScores.get(sectorId) || 0) + 2);
        }
      }
    }

    // Signal from sector mentioned explicitly in description
    for (const sector of sectorManager.getAllSectors()) {
      const lowerBody = payload.body.toLowerCase();
      if (
        lowerBody.includes(sector.id.toLowerCase()) ||
        lowerBody.includes(sector.name.toLowerCase())
      ) {
        signals.push({ type: 'keyword', value: sector.name, sectorId: sector.id });
        sectorScores.set(sector.id, (sectorScores.get(sector.id) || 0) + 1);
      }
    }

    // Build detections sorted by score
    const detections: SectorDetection[] = [];
    const maxScore = Math.max(...sectorScores.values(), 1);

    for (const [sectorId, score] of sectorScores) {
      const sector = sectorManager.getSector(sectorId);
      if (sector) {
        detections.push({
          sector,
          confidence: score / maxScore,
          signals: signals.filter(s => s.sectorId === sectorId),
        });
      }
    }

    // Sort by confidence
    detections.sort((a, b) => b.confidence - a.confidence);

    return detections;
  }

  /**
   * Map domain KB scope to sector
   */
  private domainToSector(kbScope: string): string | undefined {
    const mapping: Record<string, string> = {
      'spine': 'character',
      'shaders': 'world',
      'database': 'persistence',
      'ui-toolkit': 'ui',
    };
    return mapping[kbScope];
  }

  /**
   * Determine primary sector from detections
   */
  private determinePrimarySector(detections: SectorDetection[]): Sector {
    if (detections.length > 0 && detections[0].confidence > 0.5) {
      return detections[0].sector;
    }

    // Fallback to configured fallback sector
    const sectorManager = getSectorManager();
    const fallback = sectorManager.getSector(this.config.fallbackSector);
    if (fallback) {
      return fallback;
    }

    const allSectors = sectorManager.getAllSectors();
    if (allSectors.length === 0) {
      throw new Error('No sectors configured. Configure sectors before processing tickets.');
    }

    return allSectors[0];
  }

  /**
   * Find KB scope from ticket
   */
  private findKbScope(payload: TicketPayload): string[] | undefined {
    const scopes: string[] = [];

    for (const keyword of payload.domainKeywords) {
      const mapping = this.config.domainMappings.find(
        m => m.keywords.some(k => k.toLowerCase() === keyword.toLowerCase())
      );
      if (mapping && !scopes.includes(mapping.kbScope)) {
        scopes.push(mapping.kbScope);
      }
    }

    return scopes.length > 0 ? scopes : undefined;
  }

  /**
   * Collect relevant files for context
   */
  private async collectRelevantFiles(
    payload: TicketPayload,
    primarySector: Sector
  ): Promise<RelevantFile[]> {
    const files: RelevantFile[] = [];

    // 1. Explicitly mentioned files (highest priority)
    for (const path of payload.mentionedPaths) {
      files.push({ path, reason: 'explicit-mention', score: 1.0 });
    }

    // 2. Linked files
    for (const path of payload.linkedFiles) {
      if (!files.some(f => f.path === path)) {
        files.push({ path, reason: 'explicit-mention', score: 0.9 });
      }
    }

    // 3. Find similar files in the sector (would integrate with vector search)
    // For now, just find files matching sector patterns
    const sectorFiles = await this.findSectorFiles(primarySector, 10);
    for (const path of sectorFiles) {
      if (!files.some(f => f.path === path)) {
        files.push({ path, reason: 'similarity', score: 0.5 });
      }
    }

    // Sort by score and limit
    files.sort((a, b) => b.score - a.score);
    return files.slice(0, 20); // Top 20 relevant files
  }

  /**
   * Find files in a sector
   */
  private async findSectorFiles(sector: Sector, limit: number): Promise<string[]> {
    const files: string[] = [];

    try {
      // Use glob to find files matching sector patterns
      for (const pattern of sector.paths) {
        const globPattern = new vscode.RelativePattern(
          vscode.workspace.workspaceFolders?.[0] || '',
          pattern
        );
        const found = await vscode.workspace.findFiles(globPattern, '**/node_modules/**', limit);
        for (const uri of found) {
          if (!files.includes(uri.fsPath)) {
            files.push(uri.fsPath);
          }
          if (files.length >= limit) break;
        }
        if (files.length >= limit) break;
      }
    } catch {
      // Ignore errors
    }

    return files;
  }

  /**
   * Load prior ticket history for an area
   */
  private loadPriorHistory(sectorId: string): PriorTicketHistory[] {
    // Would load from ticket storage - return empty for now
    return [];
  }

  /**
   * Calculate token budget for context
   */
  private calculateTokenBudget(payload: TicketPayload, files: RelevantFile[]): number {
    // Base budget
    let budget = 8000;

    // Adjust based on intent
    switch (payload.intent) {
      case 'bugfix':
        budget = 6000; // Focused context
        break;
      case 'feature':
        budget = 10000; // More context needed
        break;
      case 'refactor':
        budget = 12000; // Need to see more code
        break;
    }

    // Adjust based on file count
    if (files.length > 10) {
      budget = Math.min(budget + 2000, 16000);
    }

    return budget;
  }

  /**
   * Check if ticket should use swarm mode
   */
  shouldUseSwarm(context: TicketContext): boolean {
    return context.detectedSectors.length >= this.config.swarmThreshold;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<TicketFlowConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): TicketFlowConfig {
    return { ...this.config };
  }
}

/**
 * Singleton instance
 */
let ticketProcessorInstance: TicketProcessor | null = null;

export function getTicketProcessor(): TicketProcessor {
  if (!ticketProcessorInstance) {
    ticketProcessorInstance = new TicketProcessor();
  }
  return ticketProcessorInstance;
}

export function initTicketProcessor(config?: Partial<TicketFlowConfig>): TicketProcessor {
  ticketProcessorInstance = new TicketProcessor(config);
  return ticketProcessorInstance;
}
