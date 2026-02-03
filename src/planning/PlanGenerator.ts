/**
 * Plan Generator
 *
 * Generates structured plans from user intent using AI.
 * Plans are sector-aware and include impact analysis.
 */

import { AIProvider, AIMessage } from '../mastercode_port/providers/base';
import { getSectorManager, Sector } from '../sectors/SectorConfig';
import {
  Plan,
  PlanPhase,
  PlanStep,
  PlanSector,
  PlanImpact,
  PlanGenerationRequest,
  PlanGenerationOptions,
  PlanGenerationResult,
  PlanTemplate,
  PlanStatus,
  ChangeType,
  StepPriority
} from './types';

/**
 * System prompt for plan generation
 */
const PLAN_GENERATION_SYSTEM_PROMPT = `You are a senior software architect creating implementation plans for a Unity game project.

Your task is to analyze the user's intent and create a detailed, actionable plan.

IMPORTANT RULES:
1. Break work into phases (each phase should be a single PR worth of work)
2. Each phase has steps (atomic changes to specific files)
3. Be specific about which files will be created/modified
4. Include rationale for each step (explain WHY)
5. Consider dependencies between steps
6. Identify risks and warnings
7. Respect sector boundaries and rules

OUTPUT FORMAT:
You must respond with valid JSON matching this structure:
{
  "summary": "Brief description of what the plan accomplishes",
  "phases": [
    {
      "title": "Phase title",
      "description": "What this phase accomplishes",
      "steps": [
        {
          "description": "What this step does",
          "rationale": "Why this step is needed",
          "files": ["path/to/file1.cs", "path/to/file2.cs"],
          "changeType": "create|modify|delete|refactor|test|config",
          "priority": "critical|high|medium|low",
          "complexity": "trivial|simple|moderate|complex"
        }
      ]
    }
  ],
  "impact": {
    "sectorsAffected": ["sector1", "sector2"],
    "filesAffected": ["file1.cs", "file2.cs"],
    "dependenciesAffected": ["dependency1"],
    "riskLevel": "low|medium|high|critical",
    "warnings": ["Warning message 1", "Warning message 2"]
  }
}

Do not include any text outside the JSON object.`;

/**
 * Built-in plan templates
 */
export const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    id: 'new-system',
    name: 'Add New System',
    description: 'Create a new game system (e.g., crafting, achievements)',
    category: 'feature',
    promptTemplate: `Create a plan to implement a new {systemName} system.
Requirements:
{requirements}

The system should follow existing patterns in the codebase.`,
    defaultPhases: [
      {
        title: 'Core Data Structures',
        description: 'Create ScriptableObjects and data models',
        steps: []
      },
      {
        title: 'Manager Implementation',
        description: 'Implement the main manager class',
        steps: []
      },
      {
        title: 'UI Integration',
        description: 'Create UI components for the system',
        steps: []
      },
      {
        title: 'Testing & Polish',
        description: 'Add tests and polish the implementation',
        steps: []
      }
    ]
  },
  {
    id: 'bugfix',
    name: 'Fix Bug',
    description: 'Create a plan to fix a specific bug',
    category: 'bugfix',
    promptTemplate: `Create a plan to fix the following bug:
{bugDescription}

Expected behavior: {expectedBehavior}
Actual behavior: {actualBehavior}

Consider edge cases and potential regressions.`,
    defaultPhases: [
      {
        title: 'Investigation',
        description: 'Identify root cause',
        steps: []
      },
      {
        title: 'Fix Implementation',
        description: 'Apply the fix',
        steps: []
      },
      {
        title: 'Verification',
        description: 'Test the fix and check for regressions',
        steps: []
      }
    ]
  },
  {
    id: 'refactor',
    name: 'Refactor Code',
    description: 'Refactor existing code for better structure',
    category: 'refactor',
    promptTemplate: `Create a plan to refactor:
{targetCode}

Goals:
{goals}

Constraints:
- Must maintain backward compatibility
- No behavior changes unless specified`,
    defaultPhases: [
      {
        title: 'Preparation',
        description: 'Add tests for existing behavior',
        steps: []
      },
      {
        title: 'Refactoring',
        description: 'Apply refactoring changes',
        steps: []
      },
      {
        title: 'Cleanup',
        description: 'Remove dead code and update documentation',
        steps: []
      }
    ]
  },
  {
    id: 'add-feature',
    name: 'Add Feature',
    description: 'Add a new feature to existing system',
    category: 'feature',
    promptTemplate: `Create a plan to add this feature:
{featureDescription}

Target system: {targetSystem}

Requirements:
{requirements}`,
    defaultPhases: [
      {
        title: 'Data Changes',
        description: 'Update data structures as needed',
        steps: []
      },
      {
        title: 'Logic Implementation',
        description: 'Implement the feature logic',
        steps: []
      },
      {
        title: 'UI Updates',
        description: 'Update UI to expose the feature',
        steps: []
      },
      {
        title: 'Testing',
        description: 'Add tests for the new feature',
        steps: []
      }
    ]
  },
  {
    id: 'add-tests',
    name: 'Add Tests',
    description: 'Add tests for existing code',
    category: 'test',
    promptTemplate: `Create a plan to add tests for:
{targetCode}

Test types needed: {testTypes}

Focus areas:
{focusAreas}`,
    defaultPhases: [
      {
        title: 'Unit Tests',
        description: 'Add unit tests for individual components',
        steps: []
      },
      {
        title: 'Integration Tests',
        description: 'Add integration tests',
        steps: []
      }
    ]
  }
];

/**
 * Plan Generator class
 */
export class PlanGenerator {
  private provider: AIProvider;
  private sectorManager = getSectorManager();

  constructor(provider: AIProvider) {
    this.provider = provider;
  }

  /**
   * Generate a plan from user intent
   */
  async generatePlan(
    request: PlanGenerationRequest,
    options: PlanGenerationOptions = { provider: 'claude' }
  ): Promise<PlanGenerationResult> {
    try {
      // Detect current sector if not provided
      let currentSector: Sector | undefined;
      if (request.currentSector) {
        currentSector = this.sectorManager.getSector(request.currentSector);
      } else if (request.currentFile) {
        currentSector = this.sectorManager.detectSector(request.currentFile);
      }

      // Build the prompt
      const userPrompt = this.buildUserPrompt(request, currentSector);

      // Build sector context
      const sectorContext = this.buildSectorContext(currentSector);

      // Combine system prompt with sector context
      const fullSystemPrompt = `${PLAN_GENERATION_SYSTEM_PROMPT}

${sectorContext}`;

      // Prepare messages
      const messages: AIMessage[] = [
        { role: 'user', content: userPrompt }
      ];

      // Call AI provider
      const response = await this.provider.sendMessage(messages, fullSystemPrompt);

      // Parse the response
      const planData = this.parseResponse(response.content);

      if (!planData) {
        return {
          success: false,
          error: 'Failed to parse plan from AI response',
          tokensUsed: response.tokens,
          cost: response.cost
        };
      }

      // Build the full plan object
      const plan = this.buildPlan(request, planData, currentSector);

      return {
        success: true,
        plan,
        tokensUsed: response.tokens,
        cost: response.cost
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during plan generation'
      };
    }
  }

  /**
   * Generate a plan from a template
   */
  async generateFromTemplate(
    templateId: string,
    variables: Record<string, string>,
    options: PlanGenerationOptions = { provider: 'claude' }
  ): Promise<PlanGenerationResult> {
    const template = PLAN_TEMPLATES.find(t => t.id === templateId);
    if (!template) {
      return {
        success: false,
        error: `Template not found: ${templateId}`
      };
    }

    // Fill in template variables
    let prompt = template.promptTemplate;
    for (const [key, value] of Object.entries(variables)) {
      prompt = prompt.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }

    return this.generatePlan({ intent: prompt }, options);
  }

  /**
   * Build the user prompt
   */
  private buildUserPrompt(request: PlanGenerationRequest, currentSector?: Sector): string {
    let prompt = `Create a detailed implementation plan for the following task:

USER INTENT:
${request.intent}`;

    if (currentSector) {
      prompt += `

CURRENT SECTOR: ${currentSector.name} (${currentSector.id})
${currentSector.description}`;
    }

    if (request.currentFile) {
      prompt += `

CURRENT FILE: ${request.currentFile}`;
    }

    if (request.contextPack) {
      prompt += `

ADDITIONAL CONTEXT:
${request.contextPack}`;
    }

    if (request.constraints && request.constraints.length > 0) {
      prompt += `

CONSTRAINTS:
${request.constraints.map(c => `- ${c}`).join('\n')}`;
    }

    return prompt;
  }

  /**
   * Build sector context for the system prompt
   */
  private buildSectorContext(currentSector?: Sector): string {
    if (!currentSector) {
      return '';
    }

    let context = `SECTOR CONTEXT:
You are working in the ${currentSector.name} sector.

SECTOR RULES:
${currentSector.rules}`;

    // Add dependency info
    if (currentSector.dependencies.length > 0) {
      const deps = currentSector.dependencies
        .map(id => this.sectorManager.getSector(id))
        .filter((s): s is Sector => s !== undefined);

      if (deps.length > 0) {
        context += `

SECTOR DEPENDENCIES:
This sector depends on: ${deps.map(d => d.name).join(', ')}
Changes may need to consider these dependencies.`;
      }
    }

    // Check for dependents
    const dependents = this.sectorManager.getDependentSectors(currentSector.id);
    if (dependents.length > 0) {
      context += `

DEPENDENT SECTORS:
These sectors depend on ${currentSector.name}: ${dependents.map(d => d.name).join(', ')}
Changes here may affect these sectors.`;
    }

    if (currentSector.approvalRequired) {
      context += `

WARNING: This sector requires approval for changes.`;
    }

    return context;
  }

  /**
   * Parse the AI response into plan data
   */
  private parseResponse(content: string): ParsedPlanData | null {
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('No JSON found in response');
        return null;
      }

      const data = JSON.parse(jsonMatch[0]);

      // Validate required fields
      if (!data.summary || !data.phases || !Array.isArray(data.phases)) {
        console.error('Missing required fields in plan data');
        return null;
      }

      return data as ParsedPlanData;

    } catch (error) {
      console.error('Failed to parse plan response:', error);
      return null;
    }
  }

  /**
   * Build the full Plan object from parsed data
   */
  private buildPlan(
    request: PlanGenerationRequest,
    data: ParsedPlanData,
    currentSector?: Sector
  ): Plan {
    const now = Date.now();
    const planId = this.generateId();

    // Build phases
    const phases: PlanPhase[] = data.phases.map((phaseData, phaseIndex) => {
      const phaseId = `${planId}-phase-${phaseIndex}`;

      const steps: PlanStep[] = (phaseData.steps || []).map((stepData, stepIndex) => ({
        id: `${phaseId}-step-${stepIndex}`,
        description: stepData.description || 'No description',
        rationale: stepData.rationale || 'No rationale provided',
        files: stepData.files || [],
        changeType: this.validateChangeType(stepData.changeType),
        priority: this.validatePriority(stepData.priority),
        agent: 'claude',
        status: 'draft' as PlanStatus,
        estimatedComplexity: this.validateComplexity(stepData.complexity)
      }));

      return {
        id: phaseId,
        title: phaseData.title || `Phase ${phaseIndex + 1}`,
        description: phaseData.description || '',
        steps,
        status: 'draft' as PlanStatus
      };
    });

    // Build primary sector
    const primarySector: PlanSector = currentSector
      ? {
          id: currentSector.id,
          name: currentSector.name,
          rules: currentSector.rules,
          docTarget: currentSector.docTarget
        }
      : {
          id: 'yard',
          name: 'YARD',
          rules: 'No rules enforced - experimental zone'
        };

    // Build secondary sectors from impact
    const secondarySectors: PlanSector[] = (data.impact?.sectorsAffected || [])
      .filter(id => id !== primarySector.id)
      .map(id => {
        const sector = this.sectorManager.getSector(id);
        return sector
          ? {
              id: sector.id,
              name: sector.name,
              rules: sector.rules,
              docTarget: sector.docTarget
            }
          : {
              id,
              name: id.toUpperCase(),
              rules: ''
            };
      });

    // Build impact
    const impact: PlanImpact = {
      sectorsAffected: data.impact?.sectorsAffected || [primarySector.id],
      filesAffected: data.impact?.filesAffected || this.extractFilesFromPhases(phases),
      dependenciesAffected: data.impact?.dependenciesAffected || [],
      riskLevel: this.validateRiskLevel(data.impact?.riskLevel),
      warnings: data.impact?.warnings || []
    };

    // Count steps
    const totalSteps = phases.reduce((sum, phase) => sum + phase.steps.length, 0);

    return {
      id: planId,
      intent: request.intent,
      summary: data.summary,
      primarySector,
      secondarySectors,
      phases,
      impact,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      totalSteps,
      completedSteps: 0
    };
  }

  /**
   * Extract all files from phases
   */
  private extractFilesFromPhases(phases: PlanPhase[]): string[] {
    const files = new Set<string>();
    for (const phase of phases) {
      for (const step of phase.steps) {
        for (const file of step.files) {
          files.add(file);
        }
      }
    }
    return Array.from(files);
  }

  /**
   * Validate and normalize change type
   */
  private validateChangeType(type?: string): ChangeType {
    const valid: ChangeType[] = ['create', 'modify', 'delete', 'refactor', 'test', 'config'];
    return valid.includes(type as ChangeType) ? (type as ChangeType) : 'modify';
  }

  /**
   * Validate and normalize priority
   */
  private validatePriority(priority?: string): StepPriority {
    const valid: StepPriority[] = ['critical', 'high', 'medium', 'low'];
    return valid.includes(priority as StepPriority) ? (priority as StepPriority) : 'medium';
  }

  /**
   * Validate and normalize complexity
   */
  private validateComplexity(complexity?: string): 'trivial' | 'simple' | 'moderate' | 'complex' {
    const valid = ['trivial', 'simple', 'moderate', 'complex'];
    return valid.includes(complexity || '') ? (complexity as any) : 'moderate';
  }

  /**
   * Validate and normalize risk level
   */
  private validateRiskLevel(level?: string): 'low' | 'medium' | 'high' | 'critical' {
    const valid = ['low', 'medium', 'high', 'critical'];
    return valid.includes(level || '') ? (level as any) : 'medium';
  }

  /**
   * Generate a unique ID
   */
  private generateId(): string {
    return `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Get available templates
   */
  getTemplates(): PlanTemplate[] {
    return PLAN_TEMPLATES;
  }

  /**
   * Update the AI provider
   */
  setProvider(provider: AIProvider): void {
    this.provider = provider;
  }
}

/**
 * Parsed plan data from AI response
 */
interface ParsedPlanData {
  summary: string;
  phases: Array<{
    title?: string;
    description?: string;
    steps?: Array<{
      description?: string;
      rationale?: string;
      files?: string[];
      changeType?: string;
      priority?: string;
      complexity?: string;
    }>;
  }>;
  impact?: {
    sectorsAffected?: string[];
    filesAffected?: string[];
    dependenciesAffected?: string[];
    riskLevel?: string;
    warnings?: string[];
  };
}
