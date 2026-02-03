/**
 * Sector Rule Checker
 *
 * Verifies that changes follow sector-specific rules.
 */

import { getSectorManager, Sector } from '../sectors/SectorConfig';
import { DiffScanResult, ScannedFile } from './types';
import {
  SectorRuleCheckResult,
  RuleViolation,
  RuleWarning
} from './types';

/**
 * Rule definition for automated checking
 */
interface AutomatedRule {
  id: string;
  name: string;
  description: string;
  check: (file: ScannedFile, sector: Sector, content?: string) => RuleViolation | null;
}

/**
 * Built-in automated rules
 */
const AUTOMATED_RULES: AutomatedRule[] = [
  {
    id: 'no-editor-in-runtime',
    name: 'No Editor Code in Runtime',
    description: 'Editor code should not be in runtime assemblies',
    check: (file, sector) => {
      // If file is in Editor folder but sector is not ENGINEERING
      if (file.path.includes('/Editor/') && sector.id !== 'editor') {
        return null; // This is actually correct - editor code in Editor folder
      }

      // Check for editor-only using statements in non-editor sectors
      if (sector.id !== 'editor' && sector.id !== 'yard') {
        // This would need content analysis - return null for now
        // Full implementation would check for UnityEditor namespace usage
      }

      return null;
    }
  },
  {
    id: 'core-no-monobehaviour',
    name: 'Core No MonoBehaviour',
    description: 'Core sector should not have MonoBehaviour classes',
    check: (file, sector, content) => {
      if (sector.id !== 'core') return null;
      if (!content) return null;

      if (content.includes(': MonoBehaviour') || content.includes(':MonoBehaviour')) {
        return {
          sectorId: sector.id,
          sectorName: sector.name,
          rule: 'Core sector should not contain MonoBehaviour classes',
          file: file.path,
          message: 'MonoBehaviour found in CORE sector. Move to appropriate runtime sector.',
          severity: 'error'
        };
      }

      return null;
    }
  },
  {
    id: 'persistence-no-field-rename',
    name: 'Persistence No Field Rename',
    description: 'Persistence sector should not rename serialized fields',
    check: (file, sector, content) => {
      if (sector.id !== 'persistence') return null;

      // This would need diff analysis to detect renames
      // Simplified: warn about any deletions in persistence
      if (file.status === 'deleted') {
        return {
          sectorId: sector.id,
          sectorName: sector.name,
          rule: 'Deleting files in persistence sector may break save compatibility',
          file: file.path,
          message: 'File deletion in QUARTERS sector. Ensure save migration is handled.',
          severity: 'warning'
        };
      }

      return null;
    }
  },
  {
    id: 'dialogue-localization-keys',
    name: 'Dialogue Localization Keys',
    description: 'Dialogue should use localization keys, not hardcoded strings',
    check: (file, sector, content) => {
      if (sector.id !== 'dialogue') return null;
      if (!content) return null;
      if (!file.path.endsWith('.cs')) return null;

      // Simple heuristic: check for hardcoded strings in dialogue-like patterns
      const hardcodedDialogue = /["'](?:Hello|Welcome|Thank you|Sorry|Yes|No)[^"']*["']/i;
      if (hardcodedDialogue.test(content)) {
        return {
          sectorId: sector.id,
          sectorName: sector.name,
          rule: 'Dialogue text should use localization keys',
          file: file.path,
          message: 'Possible hardcoded dialogue string found. Use localization keys instead.',
          severity: 'warning'
        };
      }

      return null;
    }
  },
  {
    id: 'combat-no-hardcoded-damage',
    name: 'Combat No Hardcoded Damage',
    description: 'Combat should not have hardcoded damage values',
    check: (file, sector, content) => {
      if (sector.id !== 'combat') return null;
      if (!content) return null;
      if (!file.path.endsWith('.cs')) return null;

      // Check for hardcoded damage patterns
      const hardcodedDamage = /(?:damage|health|mana)\s*[+-]?=\s*\d+(?!\s*[;,\)])/i;
      if (hardcodedDamage.test(content)) {
        return {
          sectorId: sector.id,
          sectorName: sector.name,
          rule: 'Use DamageCalculator instead of hardcoded damage values',
          file: file.path,
          message: 'Possible hardcoded damage/health value. Use DamageCalculator for damage formulas.',
          severity: 'warning'
        };
      }

      return null;
    }
  }
];

/**
 * Sector Rule Checker class
 */
export class SectorRuleChecker {
  private sectorManager = getSectorManager();
  private getFileContent?: (path: string) => Promise<string | null>;

  constructor(options?: {
    getFileContent?: (path: string) => Promise<string | null>;
  }) {
    this.getFileContent = options?.getFileContent;
  }

  /**
   * Check all sector rules against diff
   */
  async check(diff: DiffScanResult): Promise<SectorRuleCheckResult> {
    const violations: RuleViolation[] = [];
    const warnings: RuleWarning[] = [];
    const sectorsChecked = new Set<string>();

    for (const file of diff.files) {
      // Detect sector for this file
      const sector = this.sectorManager.detectSector(file.path);
      if (!sector) continue;

      sectorsChecked.add(sector.id);

      // Get file content if possible (for content-based rules)
      let content: string | undefined;
      if (this.getFileContent && file.status !== 'deleted') {
        content = await this.getFileContent(file.path) || undefined;
      }

      // Run automated rules
      for (const rule of AUTOMATED_RULES) {
        const violation = rule.check(file, sector, content);
        if (violation) {
          violations.push(violation);
        }
      }

      // Check sector-specific rules
      const sectorViolations = this.checkSectorRules(file, sector, content);
      violations.push(...sectorViolations);

      // Check for cross-sector issues
      const crossSectorWarnings = this.checkCrossSectorIssues(file, sector, diff);
      warnings.push(...crossSectorWarnings);
    }

    // Check for approval requirements
    const approvalWarnings = this.checkApprovalRequirements(diff);
    warnings.push(...approvalWarnings);

    const passed = violations.filter(v => v.severity === 'error').length === 0;

    return {
      passed,
      sectorsChecked: Array.from(sectorsChecked),
      violations,
      warnings,
      summary: this.buildSummary(violations, warnings, sectorsChecked.size)
    };
  }

  /**
   * Check sector-specific rules based on sector configuration
   */
  private checkSectorRules(file: ScannedFile, sector: Sector, content?: string): RuleViolation[] {
    const violations: RuleViolation[] = [];

    // CORE sector rules
    if (sector.id === 'core') {
      if (file.path.includes('MonoBehaviour') || (content && content.includes('using UnityEngine;'))) {
        // Already handled by automated rule, but add more specific checks here
      }
    }

    // PERSISTENCE sector rules
    if (sector.id === 'persistence') {
      // Check for save format changes (would need more sophisticated analysis)
      if (file.status === 'modified' && file.path.includes('SaveData')) {
        violations.push({
          sectorId: sector.id,
          sectorName: sector.name,
          rule: 'Save format changes require migration code',
          file: file.path,
          message: 'SaveData modified. Ensure version bump and migration code exists.',
          severity: 'warning'
        });
      }
    }

    // UI sector rules
    if (sector.id === 'ui') {
      if (content && content.includes('new GameObject') && !content.includes('// UI Factory')) {
        violations.push({
          sectorId: sector.id,
          sectorName: sector.name,
          rule: 'Use MVP pattern for UI components',
          file: file.path,
          message: 'Direct GameObject creation in UI. Consider using factory pattern or prefabs.',
          severity: 'warning'
        });
      }
    }

    return violations;
  }

  /**
   * Check for cross-sector issues
   */
  private checkCrossSectorIssues(file: ScannedFile, sector: Sector, diff: DiffScanResult): RuleWarning[] {
    const warnings: RuleWarning[] = [];

    // Check if modifying a sector that others depend on
    const dependents = this.sectorManager.getDependentSectors(sector.id);
    if (dependents.length > 0 && file.status === 'modified') {
      // Check if any dependent sectors are also being modified
      const dependentPaths = dependents.flatMap(d => d.paths);
      const modifyingDependents = diff.files.some(f =>
        dependentPaths.some(p => f.path.includes(p.replace(/\*/g, '')))
      );

      if (!modifyingDependents) {
        warnings.push({
          sectorId: sector.id,
          sectorName: sector.name,
          message: `Changes to ${sector.name} may affect dependent sectors: ${dependents.map(d => d.name).join(', ')}`,
          suggestion: 'Consider testing dependent sectors after this change.'
        });
      }
    }

    return warnings;
  }

  /**
   * Check if any sectors require approval
   */
  private checkApprovalRequirements(diff: DiffScanResult): RuleWarning[] {
    const warnings: RuleWarning[] = [];
    const sectorsRequiringApproval = new Set<string>();

    for (const file of diff.files) {
      const sector = this.sectorManager.detectSector(file.path);
      if (sector?.approvalRequired) {
        sectorsRequiringApproval.add(sector.id);
      }
    }

    for (const sectorId of sectorsRequiringApproval) {
      const sector = this.sectorManager.getSector(sectorId);
      if (sector) {
        warnings.push({
          sectorId: sector.id,
          sectorName: sector.name,
          message: `Changes to ${sector.name} sector require approval before merge.`,
          suggestion: 'Request review from sector owner or tech lead.'
        });
      }
    }

    return warnings;
  }

  /**
   * Build summary message
   */
  private buildSummary(violations: RuleViolation[], warnings: RuleWarning[], sectorCount: number): string {
    const errorCount = violations.filter(v => v.severity === 'error').length;
    const warningCount = violations.filter(v => v.severity === 'warning').length + warnings.length;

    if (errorCount === 0 && warningCount === 0) {
      return `All sector rules passed. Checked ${sectorCount} sector(s).`;
    }

    const parts: string[] = [];
    if (errorCount > 0) {
      parts.push(`${errorCount} error(s)`);
    }
    if (warningCount > 0) {
      parts.push(`${warningCount} warning(s)`);
    }

    return `Sector rule check: ${parts.join(', ')} in ${sectorCount} sector(s).`;
  }

  /**
   * Get all sectors affected by a diff
   */
  getAffectedSectors(diff: DiffScanResult): Sector[] {
    const files = diff.files.map(f => f.path);
    return this.sectorManager.getAffectedSectors(files);
  }

  /**
   * Check if diff requires approval
   */
  requiresApproval(diff: DiffScanResult): boolean {
    const files = diff.files.map(f => f.path);
    return this.sectorManager.requiresApproval(files);
  }
}
