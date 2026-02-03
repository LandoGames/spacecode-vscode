/**
 * Plan Generator
 *
 * Generates execution plans from TicketContext.
 * Breaks down work into steps, estimates tokens, and identifies dependencies.
 */

import * as vscode from 'vscode';
import {
  TicketContext,
  TicketPlan,
  TicketPlanStep,
  TicketIntent,
} from './flowTypes';
import { Sector } from '../sectors/SectorConfig';

/**
 * Plan generation options
 */
export interface PlanGeneratorOptions {
  maxSteps: number;
  maxTokensPerStep: number;
  includeVerification: boolean;
  includeDocs: boolean;
}

const DEFAULT_OPTIONS: PlanGeneratorOptions = {
  maxSteps: 10,
  maxTokensPerStep: 4000,
  includeVerification: true,
  includeDocs: false,
};

/**
 * Plan Generator - creates execution plans from ticket context
 */
export class PlanGenerator {
  private options: PlanGeneratorOptions;

  constructor(options?: Partial<PlanGeneratorOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Generate a plan from ticket context
   */
  async generatePlan(context: TicketContext): Promise<TicketPlan> {
    const planId = this.generatePlanId();
    const steps: TicketPlanStep[] = [];

    // 1. Analysis step (always first)
    steps.push(this.createAnalysisStep(context));

    // 2. Implementation steps based on files and sectors
    const implSteps = this.createImplementationSteps(context);
    steps.push(...implSteps);

    // 3. Verification step (if enabled)
    if (this.options.includeVerification) {
      steps.push(this.createVerificationStep(context, implSteps));
    }

    // 4. Documentation step (if enabled and for features)
    if (this.options.includeDocs && context.ticket.intent === 'feature') {
      steps.push(this.createDocumentationStep(context));
    }

    // Calculate dependencies
    this.resolveDependencies(steps);

    // Calculate total tokens
    const totalEstimatedTokens = steps.reduce((sum, s) => sum + s.estimatedTokens, 0);

    // Determine if swarm is needed
    const requiresSwarm = context.detectedSectors.length > 1 || steps.length > 3;

    return {
      id: planId,
      ticketId: context.ticket.id,
      title: `Plan: ${context.ticket.title}`,
      steps,
      totalEstimatedTokens,
      requiresSwarm,
      createdAt: new Date(),
    };
  }

  /**
   * Generate unique plan ID
   */
  private generatePlanId(): string {
    return `plan-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
  }

  /**
   * Create analysis step
   */
  private createAnalysisStep(context: TicketContext): TicketPlanStep {
    const relevantFiles = context.relevantFiles
      .filter(f => f.reason === 'explicit-mention')
      .map(f => f.path);

    return {
      id: 'step-analysis',
      title: 'Analyze Requirements',
      description: this.buildAnalysisDescription(context),
      targetFiles: relevantFiles,
      sector: context.primarySector.id,
      estimatedTokens: 1500,
      dependencies: [],
      priority: 1,
    };
  }

  /**
   * Build analysis step description
   */
  private buildAnalysisDescription(context: TicketContext): string {
    const intent = context.ticket.intent || 'unknown';
    const parts = [
      `Analyze the ticket and understand the ${intent} requirements.`,
      '',
      '1. Review the ticket description and identify key requirements',
      '2. Examine mentioned files to understand current implementation',
      '3. Identify potential impact on other components',
      '4. Note any constraints or edge cases',
    ];

    if (context.kbScope && context.kbScope.length > 0) {
      parts.push(`5. Review ${context.kbScope.join(', ')} KB for relevant patterns`);
    }

    return parts.join('\n');
  }

  /**
   * Create implementation steps
   */
  private createImplementationSteps(context: TicketContext): TicketPlanStep[] {
    const steps: TicketPlanStep[] = [];
    const intent = context.ticket.intent || 'unknown';

    // Group files by sector
    const filesBySector = this.groupFilesBySector(context);

    // Create steps based on intent and sectors
    switch (intent) {
      case 'bugfix':
        steps.push(...this.createBugfixSteps(context, filesBySector));
        break;
      case 'feature':
        steps.push(...this.createFeatureSteps(context, filesBySector));
        break;
      case 'refactor':
        steps.push(...this.createRefactorSteps(context, filesBySector));
        break;
      case 'test':
        steps.push(...this.createTestSteps(context, filesBySector));
        break;
      default:
        steps.push(...this.createGenericSteps(context, filesBySector));
    }

    return steps;
  }

  /**
   * Group relevant files by sector
   */
  private groupFilesBySector(context: TicketContext): Map<string, string[]> {
    const groups = new Map<string, string[]>();

    // Start with primary sector
    groups.set(context.primarySector.id, []);

    // Add files to appropriate sectors
    for (const file of context.relevantFiles) {
      const sectorId = this.detectFileSector(file.path, context) || context.primarySector.id;
      const files = groups.get(sectorId) || [];
      files.push(file.path);
      groups.set(sectorId, files);
    }

    return groups;
  }

  /**
   * Detect sector for a file
   */
  private detectFileSector(path: string, context: TicketContext): string | undefined {
    for (const detection of context.detectedSectors) {
      const signal = detection.signals.find(s => s.type === 'path' && s.value === path);
      if (signal) {
        return detection.sector.id;
      }
    }
    return undefined;
  }

  /**
   * Create bugfix steps
   */
  private createBugfixSteps(
    context: TicketContext,
    filesBySector: Map<string, string[]>
  ): TicketPlanStep[] {
    const steps: TicketPlanStep[] = [];
    let stepIndex = 1;

    // Reproduce step
    steps.push({
      id: `step-impl-${stepIndex++}`,
      title: 'Reproduce Issue',
      description: 'Identify the exact conditions that cause the bug and understand the failure mode.',
      targetFiles: Array.from(filesBySector.values()).flat().slice(0, 3),
      sector: context.primarySector.id,
      estimatedTokens: 1000,
      dependencies: ['step-analysis'],
      priority: 2,
    });

    // Fix step for each sector
    for (const [sectorId, files] of filesBySector) {
      if (files.length > 0) {
        steps.push({
          id: `step-impl-${stepIndex++}`,
          title: `Fix in ${sectorId.toUpperCase()}`,
          description: `Apply fix to affected files in the ${sectorId} sector.`,
          targetFiles: files,
          sector: sectorId,
          estimatedTokens: 2000,
          dependencies: [`step-impl-${stepIndex - 2}`],
          priority: 3,
        });
      }
    }

    return steps;
  }

  /**
   * Create feature steps
   */
  private createFeatureSteps(
    context: TicketContext,
    filesBySector: Map<string, string[]>
  ): TicketPlanStep[] {
    const steps: TicketPlanStep[] = [];
    let stepIndex = 1;

    // Design step
    steps.push({
      id: `step-impl-${stepIndex++}`,
      title: 'Design Implementation',
      description: 'Plan the implementation approach, identify interfaces and data structures needed.',
      targetFiles: [],
      sector: context.primarySector.id,
      estimatedTokens: 1500,
      dependencies: ['step-analysis'],
      priority: 2,
    });

    // Implementation step for each sector
    for (const [sectorId, files] of filesBySector) {
      steps.push({
        id: `step-impl-${stepIndex++}`,
        title: `Implement in ${sectorId.toUpperCase()}`,
        description: `Implement the feature components in the ${sectorId} sector.`,
        targetFiles: files,
        sector: sectorId,
        estimatedTokens: 3000,
        dependencies: [`step-impl-1`], // Depends on design
        priority: 3,
      });
    }

    // Integration step if multiple sectors
    if (filesBySector.size > 1) {
      steps.push({
        id: `step-impl-${stepIndex++}`,
        title: 'Integrate Components',
        description: 'Connect the implemented components across sectors and ensure proper communication.',
        targetFiles: Array.from(filesBySector.values()).flat().slice(0, 5),
        sector: context.primarySector.id,
        estimatedTokens: 2000,
        dependencies: steps.slice(1).map(s => s.id), // Depends on all impl steps
        priority: 4,
      });
    }

    return steps;
  }

  /**
   * Create refactor steps
   */
  private createRefactorSteps(
    context: TicketContext,
    filesBySector: Map<string, string[]>
  ): TicketPlanStep[] {
    const steps: TicketPlanStep[] = [];
    let stepIndex = 1;

    // Assessment step
    steps.push({
      id: `step-impl-${stepIndex++}`,
      title: 'Assess Current State',
      description: 'Review current implementation and identify refactoring targets.',
      targetFiles: Array.from(filesBySector.values()).flat(),
      sector: context.primarySector.id,
      estimatedTokens: 2000,
      dependencies: ['step-analysis'],
      priority: 2,
    });

    // Refactor step for each sector
    for (const [sectorId, files] of filesBySector) {
      if (files.length > 0) {
        steps.push({
          id: `step-impl-${stepIndex++}`,
          title: `Refactor ${sectorId.toUpperCase()}`,
          description: `Apply refactoring changes to the ${sectorId} sector while maintaining behavior.`,
          targetFiles: files,
          sector: sectorId,
          estimatedTokens: 3000,
          dependencies: [`step-impl-1`], // Depends on assessment
          priority: 3,
        });
      }
    }

    return steps;
  }

  /**
   * Create test steps
   */
  private createTestSteps(
    context: TicketContext,
    filesBySector: Map<string, string[]>
  ): TicketPlanStep[] {
    const steps: TicketPlanStep[] = [];
    let stepIndex = 1;

    // Test design step
    steps.push({
      id: `step-impl-${stepIndex++}`,
      title: 'Design Test Cases',
      description: 'Identify test scenarios, edge cases, and expected behaviors.',
      targetFiles: [],
      sector: context.primarySector.id,
      estimatedTokens: 1500,
      dependencies: ['step-analysis'],
      priority: 2,
    });

    // Write tests for each sector
    for (const [sectorId, files] of filesBySector) {
      if (files.length > 0) {
        steps.push({
          id: `step-impl-${stepIndex++}`,
          title: `Write Tests for ${sectorId.toUpperCase()}`,
          description: `Write unit and integration tests for ${sectorId} sector components.`,
          targetFiles: files.map(f => f.replace(/\.cs$/, 'Tests.cs')),
          sector: sectorId,
          estimatedTokens: 2500,
          dependencies: [`step-impl-1`],
          priority: 3,
        });
      }
    }

    return steps;
  }

  /**
   * Create generic steps
   */
  private createGenericSteps(
    context: TicketContext,
    filesBySector: Map<string, string[]>
  ): TicketPlanStep[] {
    const steps: TicketPlanStep[] = [];
    let stepIndex = 1;

    // Single implementation step
    steps.push({
      id: `step-impl-${stepIndex++}`,
      title: 'Implement Changes',
      description: 'Apply the required changes to address the ticket.',
      targetFiles: Array.from(filesBySector.values()).flat(),
      sector: context.primarySector.id,
      estimatedTokens: 2500,
      dependencies: ['step-analysis'],
      priority: 2,
    });

    return steps;
  }

  /**
   * Create verification step
   */
  private createVerificationStep(
    context: TicketContext,
    implSteps: TicketPlanStep[]
  ): TicketPlanStep {
    const allTargetFiles = implSteps.flatMap(s => s.targetFiles);

    return {
      id: 'step-verify',
      title: 'Verify Changes',
      description: 'Run pre-flight checks, verify no regressions, and ensure acceptance criteria are met.',
      targetFiles: allTargetFiles,
      sector: context.primarySector.id,
      estimatedTokens: 1000,
      dependencies: implSteps.map(s => s.id),
      priority: 10, // Always last
    };
  }

  /**
   * Create documentation step
   */
  private createDocumentationStep(context: TicketContext): TicketPlanStep {
    return {
      id: 'step-docs',
      title: 'Update Documentation',
      description: 'Update relevant documentation to reflect the new feature.',
      targetFiles: [context.primarySector.docTarget || ''],
      sector: context.primarySector.id,
      estimatedTokens: 1000,
      dependencies: ['step-verify'],
      priority: 11,
    };
  }

  /**
   * Resolve dependencies between steps
   */
  private resolveDependencies(steps: TicketPlanStep[]): void {
    // Already handled during creation, but could add validation here
    for (const step of steps) {
      // Validate dependencies exist
      step.dependencies = step.dependencies.filter(depId =>
        steps.some(s => s.id === depId)
      );
    }
  }

  /**
   * Estimate tokens for a file
   */
  private estimateFileTokens(filePath: string): number {
    // Rough estimate: 4 chars per token, 50 lines average
    return 500;
  }

  /**
   * Update options
   */
  updateOptions(options: Partial<PlanGeneratorOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Get current options
   */
  getOptions(): PlanGeneratorOptions {
    return { ...this.options };
  }
}

/**
 * Singleton instance
 */
let planGeneratorInstance: PlanGenerator | null = null;

export function getPlanGenerator(): PlanGenerator {
  if (!planGeneratorInstance) {
    planGeneratorInstance = new PlanGenerator();
  }
  return planGeneratorInstance;
}

export function initPlanGenerator(options?: Partial<PlanGeneratorOptions>): PlanGenerator {
  planGeneratorInstance = new PlanGenerator(options);
  return planGeneratorInstance;
}
