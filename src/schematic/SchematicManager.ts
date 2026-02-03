/**
 * Schematic Manager
 *
 * Manages the station schematic, including creation, persistence,
 * and analysis of the codebase against the architectural map.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  StationSchematic,
  SectorDefinition,
  SectorConnection,
  SectorStatus,
  WizardState,
  WizardStep,
  SchematicScanOptions,
  SchematicScanResult,
  DivergenceReport,
  DivergenceIssue,
  SectorMetrics,
} from './types';
import { ARCHITECTURE_PRESETS, getPreset } from './presets';

let _instance: SchematicManager | undefined;

export function getSchematicManager(): SchematicManager {
  if (!_instance) {
    _instance = new SchematicManager();
  }
  return _instance;
}

export class SchematicManager {
  private _schematic: StationSchematic | undefined;
  private _wizardState: WizardState | undefined;
  private _storageKey = 'spacecode.schematic';

  /**
   * Initialize with extension context
   */
  async initialize(context: vscode.ExtensionContext): Promise<void> {
    // Try to load existing schematic
    const saved = context.globalState.get<string>(this._storageKey);
    if (saved) {
      try {
        this._schematic = JSON.parse(saved);
      } catch {
        // Invalid saved state
      }
    }
  }

  /**
   * Save schematic to storage
   */
  async save(context: vscode.ExtensionContext): Promise<void> {
    if (this._schematic) {
      await context.globalState.update(this._storageKey, JSON.stringify(this._schematic));
    }
  }

  /**
   * Get current schematic
   */
  getSchematic(): StationSchematic | undefined {
    return this._schematic;
  }

  /**
   * Check if schematic exists
   */
  hasSchematic(): boolean {
    return !!this._schematic;
  }

  /**
   * Get available presets
   */
  getPresets() {
    return ARCHITECTURE_PRESETS;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Wizard Methods
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Start the architecture setup wizard
   */
  startWizard(): WizardState {
    this._wizardState = {
      currentStep: 0,
      steps: [
        {
          id: 'preset',
          title: 'Choose Architecture',
          description: 'Select a preset architecture or start from scratch',
          type: 'preset',
          isOptional: false,
          isComplete: false,
        },
        {
          id: 'sectors',
          title: 'Configure Sectors',
          description: 'Customize sectors for your project',
          type: 'sector',
          isOptional: false,
          isComplete: false,
        },
        {
          id: 'mapping',
          title: 'Map to Codebase',
          description: 'Map sectors to actual folders in your project',
          type: 'mapping',
          isOptional: false,
          isComplete: false,
        },
        {
          id: 'review',
          title: 'Review & Save',
          description: 'Review your architecture and save',
          type: 'review',
          isOptional: false,
          isComplete: false,
        },
      ],
      schematic: {
        id: crypto.randomUUID(),
        name: 'My Project',
        version: '1.0.0',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        sectors: [],
        connections: [],
        metadata: {
          projectType: 'custom',
          language: 'typescript',
        },
      },
      mappings: {},
      isComplete: false,
    };

    return this._wizardState;
  }

  /**
   * Get current wizard state
   */
  getWizardState(): WizardState | undefined {
    return this._wizardState;
  }

  /**
   * Select a preset in the wizard
   */
  selectPreset(presetId: string): WizardState | undefined {
    if (!this._wizardState) return undefined;

    const preset = getPreset(presetId);
    if (!preset) return undefined;

    // Apply preset to schematic
    this._wizardState.selectedPreset = presetId;
    this._wizardState.schematic.metadata = {
      ...this._wizardState.schematic.metadata,
      projectType: preset.projectType,
    };

    // Create sector definitions from preset
    this._wizardState.schematic.sectors = preset.sectors.map((s, i) => ({
      ...s,
      id: `sector-${i}-${Date.now()}`,
      status: 'planned' as SectorStatus,
    }));

    // Auto-create connections from dependencies
    this._wizardState.schematic.connections = [];
    for (const sector of this._wizardState.schematic.sectors!) {
      for (const depRealName of sector.dependencies) {
        const depSector = this._wizardState.schematic.sectors!.find(
          s => s.realName === depRealName || s.id === depRealName
        );
        if (depSector) {
          this._wizardState.schematic.connections!.push({
            from: sector.id,
            to: depSector.id,
            type: 'depends',
            strength: 'moderate',
          });
        }
      }
    }

    // Mark step complete
    this._wizardState.steps[0].isComplete = true;

    return this._wizardState;
  }

  /**
   * Update a sector in the wizard
   */
  updateSector(sectorId: string, updates: Partial<SectorDefinition>): WizardState | undefined {
    if (!this._wizardState?.schematic.sectors) return undefined;

    const index = this._wizardState.schematic.sectors.findIndex(s => s.id === sectorId);
    if (index === -1) return undefined;

    this._wizardState.schematic.sectors[index] = {
      ...this._wizardState.schematic.sectors[index],
      ...updates,
    };

    return this._wizardState;
  }

  /**
   * Add a custom sector
   */
  addSector(sector: Omit<SectorDefinition, 'id' | 'status'>): WizardState | undefined {
    if (!this._wizardState?.schematic.sectors) return undefined;

    const newSector: SectorDefinition = {
      ...sector,
      id: `sector-custom-${Date.now()}`,
      status: 'planned',
    };

    this._wizardState.schematic.sectors.push(newSector);

    return this._wizardState;
  }

  /**
   * Remove a sector
   */
  removeSector(sectorId: string): WizardState | undefined {
    if (!this._wizardState?.schematic.sectors) return undefined;

    this._wizardState.schematic.sectors = this._wizardState.schematic.sectors.filter(
      s => s.id !== sectorId
    );

    // Remove connections involving this sector
    if (this._wizardState.schematic.connections) {
      this._wizardState.schematic.connections = this._wizardState.schematic.connections.filter(
        c => c.from !== sectorId && c.to !== sectorId
      );
    }

    return this._wizardState;
  }

  /**
   * Update path mappings
   */
  updateMapping(sectorId: string, path: string): WizardState | undefined {
    if (!this._wizardState) return undefined;

    this._wizardState.mappings[sectorId] = path;

    // Also update the sector path
    if (this._wizardState.schematic.sectors) {
      const sector = this._wizardState.schematic.sectors.find(s => s.id === sectorId);
      if (sector) {
        sector.path = path;
      }
    }

    return this._wizardState;
  }

  /**
   * Advance to next wizard step
   */
  nextStep(): WizardState | undefined {
    if (!this._wizardState) return undefined;

    // Mark current step complete
    this._wizardState.steps[this._wizardState.currentStep].isComplete = true;

    // Advance
    if (this._wizardState.currentStep < this._wizardState.steps.length - 1) {
      this._wizardState.currentStep++;
    }

    return this._wizardState;
  }

  /**
   * Go back to previous step
   */
  previousStep(): WizardState | undefined {
    if (!this._wizardState) return undefined;

    if (this._wizardState.currentStep > 0) {
      this._wizardState.currentStep--;
    }

    return this._wizardState;
  }

  /**
   * Complete the wizard and create the schematic
   */
  completeWizard(): StationSchematic | undefined {
    if (!this._wizardState?.schematic) return undefined;

    // Finalize schematic
    this._schematic = {
      ...this._wizardState.schematic,
      updatedAt: Date.now(),
    } as StationSchematic;

    // Clear wizard state
    this._wizardState.isComplete = true;

    return this._schematic;
  }

  /**
   * Cancel the wizard
   */
  cancelWizard(): void {
    this._wizardState = undefined;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Analysis Methods
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Scan the codebase and update schematic
   */
  async scan(options?: SchematicScanOptions): Promise<SchematicScanResult> {
    const startTime = Date.now();
    const divergences: DivergenceReport[] = [];

    if (!this._schematic) {
      return {
        completedAt: Date.now(),
        duration: Date.now() - startTime,
        schematic: this._schematic!,
        divergences: [],
        healthScore: 0,
      };
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return {
        completedAt: Date.now(),
        duration: Date.now() - startTime,
        schematic: this._schematic,
        divergences: [],
        healthScore: 100,
      };
    }

    const root = workspaceFolders[0].uri;

    // Update metrics and check divergence for each sector
    for (const sector of this._schematic.sectors) {
      if (options?.updateMetrics) {
        sector.metrics = await this._calculateSectorMetrics(root, sector);
      }

      if (options?.checkDivergence) {
        const report = await this._checkSectorDivergence(root, sector);
        if (report.issues.length > 0) {
          divergences.push(report);
          sector.status = 'divergent';
        } else if (sector.metrics && sector.metrics.fileCount > 0) {
          sector.status = 'complete';
        } else {
          sector.status = 'planned';
        }
      }
    }

    // Calculate health score
    const totalSectors = this._schematic.sectors.length;
    const completeSectors = this._schematic.sectors.filter(s => s.status === 'complete').length;
    const divergentSectors = this._schematic.sectors.filter(s => s.status === 'divergent').length;
    const healthScore = Math.round(
      ((completeSectors - divergentSectors * 0.5) / totalSectors) * 100
    );

    this._schematic.updatedAt = Date.now();

    return {
      completedAt: Date.now(),
      duration: Date.now() - startTime,
      schematic: this._schematic,
      divergences,
      healthScore: Math.max(0, healthScore),
    };
  }

  /**
   * Calculate metrics for a sector
   */
  private async _calculateSectorMetrics(root: vscode.Uri, sector: SectorDefinition): Promise<SectorMetrics> {
    const sectorPath = path.join(root.fsPath, sector.path);
    const pattern = new vscode.RelativePattern(sectorPath, '**/*.{ts,tsx,js,jsx,cs}');

    try {
      const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 500);

      let lineCount = 0;
      let complexity = 0;
      let latestMod = 0;

      for (const file of files) {
        try {
          const doc = await vscode.workspace.openTextDocument(file);
          const content = doc.getText();
          lineCount += content.split('\n').length;

          // Simple complexity: count control structures
          const controlMatches = content.match(/\b(if|else|for|while|switch|case|catch|&&|\|\|)\b/g);
          complexity += controlMatches?.length || 0;

          const stat = await vscode.workspace.fs.stat(file);
          if (stat.mtime > latestMod) {
            latestMod = stat.mtime;
          }
        } catch {
          // Skip files that can't be read
        }
      }

      return {
        fileCount: files.length,
        lineCount,
        complexity: files.length > 0 ? Math.round(complexity / files.length) : 0,
        lastModified: latestMod > 0 ? latestMod : undefined,
      };
    } catch {
      return {
        fileCount: 0,
        lineCount: 0,
        complexity: 0,
      };
    }
  }

  /**
   * Check for divergence in a sector
   */
  private async _checkSectorDivergence(
    root: vscode.Uri,
    sector: SectorDefinition
  ): Promise<DivergenceReport> {
    const issues: DivergenceIssue[] = [];
    const sectorPath = path.join(root.fsPath, sector.path);

    try {
      // Check if sector path exists
      await vscode.workspace.fs.stat(vscode.Uri.file(sectorPath));
    } catch {
      issues.push({
        type: 'missing',
        description: `Sector path does not exist: ${sector.path}`,
        severity: 'error',
      });

      return {
        sectorId: sector.id,
        sectorName: sector.name,
        issues,
        suggestedFixes: [`Create directory: ${sector.path}`],
      };
    }

    // Check forbidden imports
    if (sector.rules?.forbiddenImports?.length) {
      const pattern = new vscode.RelativePattern(sectorPath, '**/*.{ts,tsx,js,jsx,cs}');
      const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 100);

      for (const file of files) {
        const doc = await vscode.workspace.openTextDocument(file);
        const content = doc.getText();

        for (const forbidden of sector.rules.forbiddenImports) {
          const regex = new RegExp(`import.*['"]${forbidden}`, 'g');
          const match = regex.exec(content);
          if (match) {
            const line = content.substring(0, match.index).split('\n').length;
            issues.push({
              type: 'violation',
              description: `Forbidden import: ${forbidden}`,
              path: vscode.workspace.asRelativePath(file),
              line,
              severity: 'warning',
            });
          }
        }
      }
    }

    // Check file size rule
    if (sector.rules?.maxFileSize) {
      const pattern = new vscode.RelativePattern(sectorPath, '**/*.{ts,tsx,js,jsx,cs}');
      const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 100);

      for (const file of files) {
        const doc = await vscode.workspace.openTextDocument(file);
        const lineCount = doc.lineCount;

        if (lineCount > sector.rules.maxFileSize) {
          issues.push({
            type: 'violation',
            description: `File exceeds max size (${lineCount} > ${sector.rules.maxFileSize} lines)`,
            path: vscode.workspace.asRelativePath(file),
            severity: 'warning',
          });
        }
      }
    }

    const suggestedFixes: string[] = [];
    for (const issue of issues) {
      if (issue.type === 'violation' && issue.description.includes('Forbidden import')) {
        suggestedFixes.push(`Move ${issue.path} to appropriate sector`);
      }
      if (issue.type === 'violation' && issue.description.includes('exceeds max size')) {
        suggestedFixes.push(`Split ${issue.path} into smaller files`);
      }
    }

    return {
      sectorId: sector.id,
      sectorName: sector.name,
      issues,
      suggestedFixes,
    };
  }

  /**
   * Get sector by ID
   */
  getSector(sectorId: string): SectorDefinition | undefined {
    return this._schematic?.sectors.find(s => s.id === sectorId);
  }

  /**
   * Get connections for a sector
   */
  getSectorConnections(sectorId: string): SectorConnection[] {
    return this._schematic?.connections.filter(
      c => c.from === sectorId || c.to === sectorId
    ) || [];
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    totalSectors: number;
    completeSectors: number;
    plannedSectors: number;
    divergentSectors: number;
    totalConnections: number;
  } {
    if (!this._schematic) {
      return {
        totalSectors: 0,
        completeSectors: 0,
        plannedSectors: 0,
        divergentSectors: 0,
        totalConnections: 0,
      };
    }

    return {
      totalSectors: this._schematic.sectors.length,
      completeSectors: this._schematic.sectors.filter(s => s.status === 'complete').length,
      plannedSectors: this._schematic.sectors.filter(s => s.status === 'planned').length,
      divergentSectors: this._schematic.sectors.filter(s => s.status === 'divergent').length,
      totalConnections: this._schematic.connections.length,
    };
  }
}
