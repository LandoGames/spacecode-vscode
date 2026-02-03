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

let _instance: DocsManager | undefined;

export function getDocsManager(): DocsManager {
  if (!_instance) {
    _instance = new DocsManager();
  }
  return _instance;
}

export class DocsManager {
  private _documents: DocDefinition[] = [];
  private _wizardState: DocsWizardState | undefined;
  private _storageKey = 'spacecode.docs';

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

  /**
   * Check if Index persona should block
   */
  getBlockState(): IndexBlockState {
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

      // Generate content
      let content: string;
      if (template) {
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
}
