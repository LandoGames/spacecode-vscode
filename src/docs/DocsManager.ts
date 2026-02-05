/**
 * Docs Manager
 *
 * Manages project documentation, templates, and the Index persona's
 * documentation setup wizard.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import {
  DocDefinition,
  DocType,
  DocStatus,
  DocsWizardState,
  DocsWizardStep,
  DocScanResult,
  DocSyncResult,
  IndexBlockState
} from './types';
import { DEFAULT_DOCS, getTemplate, generateTemplateContent } from './templates';
import { getSetting, updateSettings } from '../settings';

let _instance: DocsManager | undefined;

export function getDocsManager(): DocsManager {
  if (!_instance) {
    _instance = new DocsManager();
  }
  return _instance;
}

export type ProjectComplexity = 'simple' | 'complex' | undefined;

export class DocsManager {
  private _documents: DocDefinition[] = [];
  private _wizardState: DocsWizardState | undefined;
  private _storageKey = 'spacecode.docs';
  private _complexity: ProjectComplexity;

  /**
   * Initialize with extension context
   */
  async initialize(context: vscode.ExtensionContext): Promise<void> {
    // Try to load saved docs state
    const saved = context.globalState.get<string>(this._storageKey);
    if (saved) {
      try {
        this._documents = JSON.parse(saved);
      } catch {
        // Invalid saved state
      }
    }

    // Run initial scan
    await this.scan();
  }

  /**
   * Save docs state to storage
   */
  async save(context: vscode.ExtensionContext): Promise<void> {
    await context.globalState.update(this._storageKey, JSON.stringify(this._documents));
  }

  /**
   * Get all documents
   */
  getDocuments(): DocDefinition[] {
    return this._documents;
  }

  /**
   * Get document by type
   */
  getDocument(type: DocType): DocDefinition | undefined {
    return this._documents.find(d => d.type === type);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Wizard Methods
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Start the docs setup wizard
   */
  startWizard(): DocsWizardState {
    const steps: DocsWizardStep[] = [
      {
        id: 'intro',
        title: 'Documentation Setup',
        description: 'Set up project documentation',
        isOptional: false,
        isComplete: false,
        isSkipped: false
      },
      {
        id: 'gdd',
        title: 'Game Design Document',
        description: 'Core game design specification (mandatory for complex projects)',
        docType: 'gdd',
        isOptional: false,
        isComplete: false,
        isSkipped: false
      },
      {
        id: 'sa',
        title: 'Software Architecture',
        description: 'Technical architecture document (mandatory for complex projects)',
        docType: 'sa',
        isOptional: false,
        isComplete: false,
        isSkipped: false
      },
      {
        id: 'tdd',
        title: 'Technical Design Document',
        description: 'Feature-level technical specs (optional)',
        docType: 'tdd',
        isOptional: true,
        isComplete: false,
        isSkipped: false
      },
      {
        id: 'optional',
        title: 'Additional Documents',
        description: 'Select any additional documentation',
        isOptional: true,
        isComplete: false,
        isSkipped: false
      },
      {
        id: 'review',
        title: 'Review & Generate',
        description: 'Review selections and generate documents',
        isOptional: false,
        isComplete: false,
        isSkipped: false
      }
    ];

    this._wizardState = {
      currentStep: 0,
      totalSteps: steps.length,
      steps,
      projectName: '',
      projectType: 'unity',
      selectedDocs: ['gdd', 'sa', 'readme'],
      docConfigs: {},
      isComplete: false
    };

    return this._wizardState;
  }

  /**
   * Get wizard state
   */
  getWizardState(): DocsWizardState | undefined {
    return this._wizardState;
  }

  /**
   * Update wizard step
   */
  nextStep(): DocsWizardState | undefined {
    if (!this._wizardState) return undefined;

    // Mark current step complete
    this._wizardState.steps[this._wizardState.currentStep].isComplete = true;

    if (this._wizardState.currentStep < this._wizardState.totalSteps - 1) {
      this._wizardState.currentStep++;
    }

    return this._wizardState;
  }

  /**
   * Go back
   */
  previousStep(): DocsWizardState | undefined {
    if (!this._wizardState) return undefined;

    if (this._wizardState.currentStep > 0) {
      this._wizardState.currentStep--;
    }

    return this._wizardState;
  }

  /**
   * Skip current step
   */
  skipStep(): DocsWizardState | undefined {
    if (!this._wizardState) return undefined;

    const step = this._wizardState.steps[this._wizardState.currentStep];
    if (step.isOptional) {
      step.isSkipped = true;
      step.isComplete = true;

      // Remove from selected docs if it was a doc step
      if (step.docType) {
        this._wizardState.selectedDocs = this._wizardState.selectedDocs.filter(
          d => d !== step.docType
        );
      }

      return this.nextStep();
    }

    return this._wizardState;
  }

  /**
   * Toggle a doc type selection
   */
  toggleDoc(docType: DocType): DocsWizardState | undefined {
    if (!this._wizardState) return undefined;

    if (this._wizardState.selectedDocs.includes(docType)) {
      this._wizardState.selectedDocs = this._wizardState.selectedDocs.filter(d => d !== docType);
    } else {
      this._wizardState.selectedDocs.push(docType);
    }

    return this._wizardState;
  }

  /**
   * Set project info
   */
  setProjectInfo(name: string, type: string): DocsWizardState | undefined {
    if (!this._wizardState) return undefined;

    this._wizardState.projectName = name;
    this._wizardState.projectType = type;

    return this._wizardState;
  }

  /**
   * Complete wizard and generate docs
   */
  async completeWizard(): Promise<DocSyncResult[]> {
    if (!this._wizardState) return [];

    const results: DocSyncResult[] = [];
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders) {
      return [{
        docType: 'readme',
        path: '',
        status: 'error',
        error: 'No workspace folder open'
      }];
    }

    const root = workspaceFolders[0].uri.fsPath;

    // Generate each selected doc
    for (const docType of this._wizardState.selectedDocs) {
      const result = await this._generateDoc(docType, root);
      results.push(result);
    }

    // Mark wizard complete
    this._wizardState.isComplete = true;

    // Re-scan to update statuses
    await this.scan();

    return results;
  }

  /**
   * Cancel wizard
   */
  cancelWizard(): void {
    this._wizardState = undefined;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Scan & Sync Methods
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Scan for existing documentation
   */
  async scan(): Promise<DocScanResult> {
    const startTime = Date.now();
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders) {
      return {
        completedAt: Date.now(),
        duration: Date.now() - startTime,
        documents: [],
        missingMandatory: [],
        outdatedDocs: [],
        healthScore: 0
      };
    }

    const root = workspaceFolders[0].uri.fsPath;

    // Initialize documents from defaults
    this._documents = DEFAULT_DOCS.map((def, i) => ({
      ...def,
      id: `doc-${def.type}-${i}`,
      status: 'missing' as DocStatus
    }));

    // Check each document
    for (const doc of this._documents) {
      const fullPath = path.join(root, doc.defaultPath);
      try {
        const uri = vscode.Uri.file(fullPath);
        const stat = await vscode.workspace.fs.stat(uri);
        const content = await vscode.workspace.fs.readFile(uri);
        const text = new TextDecoder().decode(content);

        doc.status = 'current';
        doc.lastModified = stat.mtime;
        doc.wordCount = text.split(/\s+/).length;

        // Check if content is just template (outdated)
        if (text.includes('<!-- TODO:') || text.length < 200) {
          doc.status = 'draft';
        }
      } catch {
        doc.status = 'missing';
      }
    }

    const missingMandatory = this._documents
      .filter(d => d.priority === 'mandatory' && d.status === 'missing')
      .map(d => d.type);

    const outdatedDocs = this._documents
      .filter(d => d.status === 'outdated' || d.status === 'draft')
      .map(d => d.type);

    // Calculate health score
    const totalMandatory = this._documents.filter(d => d.priority === 'mandatory').length;
    const completeMandatory = this._documents.filter(
      d => d.priority === 'mandatory' && (d.status === 'current' || d.status === 'draft')
    ).length;

    const healthScore = totalMandatory > 0
      ? Math.round((completeMandatory / totalMandatory) * 100)
      : 100;

    return {
      completedAt: Date.now(),
      duration: Date.now() - startTime,
      documents: this._documents,
      missingMandatory,
      outdatedDocs,
      healthScore
    };
  }

  /**
   * Generate a single document
   */
  private async _generateDoc(docType: DocType, rootPath: string): Promise<DocSyncResult> {
    const docDef = DEFAULT_DOCS.find(d => d.type === docType);
    if (!docDef) {
      return {
        docType,
        path: '',
        status: 'error',
        error: `Unknown document type: ${docType}`
      };
    }

    const fullPath = path.join(rootPath, docDef.defaultPath);
    const template = getTemplate(docType);

    try {
      // Ensure directory exists
      const dirPath = path.dirname(fullPath);
      try {
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(dirPath));
      } catch {
        // Directory may already exist
      }

      // Check if file exists
      let exists = false;
      try {
        await vscode.workspace.fs.stat(vscode.Uri.file(fullPath));
        exists = true;
      } catch {
        exists = false;
      }

      // Generate content — use questionnaire answers if available
      let content: string;
      const answers = this._wizardState?.docConfigs[docType]?.variables;
      if (answers && Object.keys(answers).length > 0) {
        content = this.generateFromAnswers(docType, answers);
      } else if (template) {
        content = generateTemplateContent(template, {
          PROJECT_NAME: this._wizardState?.projectName || 'My Project',
          GAME_NAME: this._wizardState?.projectName || 'My Game',
          VERSION: '1.0'
        });
      } else {
        content = `# ${docDef.name}\n\n> ${docDef.description}\n\n<!-- Add content here -->\n`;
      }

      // Write file
      await vscode.workspace.fs.writeFile(
        vscode.Uri.file(fullPath),
        new TextEncoder().encode(content)
      );

      return {
        docType,
        path: docDef.defaultPath,
        status: exists ? 'updated' : 'created',
        changes: [exists ? 'Updated existing file' : 'Created new file']
      };
    } catch (error) {
      return {
        docType,
        path: docDef.defaultPath,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Open a document
   */
  async openDocument(docType: DocType): Promise<void> {
    const doc = this._documents.find(d => d.type === docType);
    if (!doc) return;

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;

    const fullPath = path.join(workspaceFolders[0].uri.fsPath, doc.defaultPath);
    const uri = vscode.Uri.file(fullPath);

    try {
      await vscode.window.showTextDocument(uri);
    } catch {
      vscode.window.showErrorMessage(`Could not open ${doc.name}`);
    }
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    total: number;
    current: number;
    draft: number;
    missing: number;
    healthScore: number;
  } {
    const total = this._documents.length;
    const current = this._documents.filter(d => d.status === 'current').length;
    const draft = this._documents.filter(d => d.status === 'draft').length;
    const missing = this._documents.filter(d => d.status === 'missing').length;

    const mandatory = this._documents.filter(d => d.priority === 'mandatory');
    const mandatoryComplete = mandatory.filter(d => d.status === 'current' || d.status === 'draft').length;
    const healthScore = mandatory.length > 0
      ? Math.round((mandatoryComplete / mandatory.length) * 100)
      : 100;

    return { total, current, draft, missing, healthScore };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Project Complexity
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get project complexity setting (reads from central SpaceCodeSettings)
   */
  getComplexity(): ProjectComplexity {
    if (this._complexity) return this._complexity;
    // Primary: central settings store (globalState-backed)
    const central = getSetting('projectComplexity');
    if (central === 'simple' || central === 'complex') {
      this._complexity = central;
      return central;
    }
    // Fallback: workspace config (migration from older storage)
    const config = vscode.workspace.getConfiguration('spacecode');
    const stored = config.get<string>('projectComplexity');
    if (stored === 'simple' || stored === 'complex') {
      this._complexity = stored;
      // Migrate to central store
      updateSettings({ projectComplexity: stored });
      return stored;
    }
    return undefined;
  }

  /**
   * Set project complexity ('simple' | 'complex')
   */
  async setComplexity(complexity: 'simple' | 'complex'): Promise<void> {
    this._complexity = complexity;
    // Write to central settings store
    updateSettings({ projectComplexity: complexity });
  }

  /**
   * Override block state to respect complexity — simple projects are never blocked
   */
  getBlockState(): IndexBlockState {
    if (this.getComplexity() === 'simple') {
      return { isBlocked: false, missingDocs: [], setupRequired: false };
    }

    const mandatoryMissing = this._documents
      .filter(d => d.priority === 'mandatory' && d.status === 'missing')
      .map(d => d.type);

    return {
      isBlocked: mandatoryMissing.length > 0,
      reason: mandatoryMissing.length > 0
        ? `Missing mandatory documentation: ${mandatoryMissing.join(', ')}`
        : undefined,
      missingDocs: mandatoryMissing,
      setupRequired: mandatoryMissing.length > 0
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Wizard Questionnaires
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get questionnaire for a doc type.
   * GDD: 10 questions (6 required), SA: 7 questions (5 required), TDD: 5 questions (3 required)
   */
  getQuestionnaire(docType: DocType): Array<{
    id: string; question: string; required: boolean; placeholder: string; multiline?: boolean;
  }> {
    switch (docType) {
      case 'gdd':
        return [
          { id: 'concept', question: 'What is the core concept of your game?', required: true, placeholder: 'A roguelite deckbuilder set in...' },
          { id: 'genre', question: 'What genre(s) does the game fall into?', required: true, placeholder: 'Action RPG, Roguelite, etc.' },
          { id: 'platform', question: 'What platforms are you targeting?', required: true, placeholder: 'PC, Mobile, Console...' },
          { id: 'audience', question: 'Who is the target audience?', required: true, placeholder: 'Core gamers, casual players, ages...' },
          { id: 'core_loop', question: 'Describe the core gameplay loop.', required: true, placeholder: 'Explore → Fight → Loot → Upgrade → Repeat', multiline: true },
          { id: 'usp', question: 'What makes this game unique? (Unique Selling Points)', required: true, placeholder: 'Novel mechanic, unique art style, etc.', multiline: true },
          { id: 'story', question: 'Brief story/setting description (if applicable).', required: false, placeholder: 'In a world where...', multiline: true },
          { id: 'art_style', question: 'What is the intended art style?', required: false, placeholder: 'Stylized 3D, pixel art, hand-drawn...' },
          { id: 'monetization', question: 'What is the monetization model?', required: false, placeholder: 'Premium, F2P with IAP, subscription...' },
          { id: 'scope', question: 'What is the estimated project scope?', required: false, placeholder: 'Team size, timeline, content targets...' }
        ];
      case 'sa':
        return [
          { id: 'project_type', question: 'What type of project is this?', required: true, placeholder: 'Unity game, web app, mobile app...' },
          { id: 'architecture', question: 'Describe the high-level architecture.', required: true, placeholder: 'Client-server, ECS, MVC...', multiline: true },
          { id: 'modules', question: 'What are the main code modules/systems?', required: true, placeholder: 'Core, Combat, UI, Networking, Persistence...', multiline: true },
          { id: 'patterns', question: 'What design patterns do you use?', required: true, placeholder: 'Singleton, Observer, Command, State Machine...' },
          { id: 'dependencies', question: 'What are the key external dependencies?', required: true, placeholder: 'Unity 2022, DOTween, Photon, etc.' },
          { id: 'data_flow', question: 'How does data flow through the system?', required: false, placeholder: 'Events, message bus, direct calls...', multiline: true },
          { id: 'constraints', question: 'What are the technical constraints?', required: false, placeholder: 'Memory limits, target FPS, platform restrictions...' }
        ];
      case 'tdd':
        return [
          { id: 'feature', question: 'What feature does this TDD cover?', required: true, placeholder: 'Inventory system, matchmaking, etc.' },
          { id: 'requirements', question: 'What are the functional requirements?', required: true, placeholder: 'Must support N items, real-time sync...', multiline: true },
          { id: 'components', question: 'What components/classes will be involved?', required: true, placeholder: 'InventoryManager, ItemSlot, ItemDatabase...' },
          { id: 'interfaces', question: 'What interfaces/APIs will be exposed?', required: false, placeholder: 'IInventory.AddItem(), IInventory.RemoveItem()...' },
          { id: 'risks', question: 'What are the technical risks?', required: false, placeholder: 'Performance at scale, edge cases...', multiline: true }
        ];
      default:
        return [];
    }
  }

  /**
   * Store questionnaire answers in wizard state
   */
  setQuestionnaireAnswers(docType: DocType, answers: Record<string, string>): void {
    if (!this._wizardState) return;
    if (!this._wizardState.docConfigs[docType]) {
      this._wizardState.docConfigs[docType] = {
        type: docType,
        path: '',
        useTemplate: true,
        variables: {}
      };
    }
    this._wizardState.docConfigs[docType].variables = answers;
  }

  /**
   * Generate doc content from questionnaire answers
   */
  generateFromAnswers(docType: DocType, answers: Record<string, string>): string {
    const template = getTemplate(docType);
    if (!template) return '';

    const projectName = this._wizardState?.projectName || answers['concept'] || 'My Project';

    // Start with template-based content
    let content = generateTemplateContent(template, {
      PROJECT_NAME: projectName,
      GAME_NAME: projectName,
      FEATURE_NAME: answers['feature'] || projectName,
      VERSION: '1.0'
    });

    // Append questionnaire answers as filled content
    const questions = this.getQuestionnaire(docType);
    if (questions.length > 0) {
      content += '\n---\n\n## Questionnaire Responses\n\n';
      for (const q of questions) {
        const answer = answers[q.id];
        if (answer) {
          content += `### ${q.question}\n\n${answer}\n\n`;
        }
      }
    }

    return content;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Doc Drift Detection
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Detect docs that may be out of date relative to code changes.
   * Compares doc lastModified timestamps against recent file changes.
   */
  async detectDrift(): Promise<{
    driftDocs: Array<{ type: DocType; name: string; daysSinceUpdate: number; path: string }>;
    recentCodeChanges: number;
  }> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return { driftDocs: [], recentCodeChanges: 0 };

    const root = workspaceFolders[0].uri.fsPath;
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    // Count recently changed code files (last 7 days)
    let recentCodeChanges = 0;
    try {
      const codeFiles = await vscode.workspace.findFiles(
        '**/*.{cs,ts,js,py,cpp,h}',
        '{**/Library/**,**/Temp/**,**/node_modules/**,**/obj/**}',
        200
      );
      for (const f of codeFiles) {
        try {
          const stat = await vscode.workspace.fs.stat(f);
          if (now - stat.mtime < sevenDays) recentCodeChanges++;
        } catch { /* skip */ }
      }
    } catch { /* ignore */ }

    // Find docs older than 7 days when code has been changing
    const driftDocs: Array<{ type: DocType; name: string; daysSinceUpdate: number; path: string }> = [];
    if (recentCodeChanges > 0) {
      for (const doc of this._documents) {
        if (doc.status === 'missing') continue;
        const fullPath = path.join(root, doc.defaultPath);
        try {
          const stat = await vscode.workspace.fs.stat(vscode.Uri.file(fullPath));
          const daysSince = Math.floor((now - stat.mtime) / (24 * 60 * 60 * 1000));
          if (daysSince > 7) {
            driftDocs.push({
              type: doc.type,
              name: doc.name,
              daysSinceUpdate: daysSince,
              path: doc.defaultPath
            });
          }
        } catch { /* file gone */ }
      }
    }

    return { driftDocs, recentCodeChanges };
  }
}
