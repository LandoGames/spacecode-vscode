/**
 * Rule Triggers
 *
 * Six deterministic, rule-based triggers that generate suggestions:
 * 1. Docs stale — git diff touches sector + docs unchanged
 * 2. Tests failing — build/test output contains failures
 * 3. Policy changed — ASMDEF policy file modified
 * 4. Undocumented files — files added without matching docs
 * 5. Sector violation — cross-sector import detected
 * 6. Orphan files — files outside any sector
 */

import { TriggerResult, TriggerContext, ScoringFactors } from './EngineerTypes';

export type TriggerFn = (ctx: TriggerContext) => TriggerResult[];

/** 1. Docs Stale — sector changed but docs not updated */
function docsStale(ctx: TriggerContext): TriggerResult[] {
  const results: TriggerResult[] = [];
  if (!ctx.changedFiles || ctx.changedFiles.length === 0) return results;

  // Group changed files by sector
  const changedSectors = new Set<string>();
  if (ctx.sectorIds) {
    for (const file of ctx.changedFiles) {
      const lower = file.toLowerCase();
      for (const sid of ctx.sectorIds) {
        if (lower.includes(sid.toLowerCase()) || lower.includes(`/${sid}/`)) {
          changedSectors.add(sid);
        }
      }
    }
  }

  // Check if any docs files were changed
  const docsChanged = ctx.changedFiles.some(f => {
    const l = f.toLowerCase();
    return l.includes('/docs/') || l.includes('.md') || l.includes('/documentation/');
  });

  if (changedSectors.size > 0 && !docsChanged) {
    const sectorNames = Array.from(changedSectors).slice(0, 3);
    const factors: ScoringFactors = {
      risk: 1,
      impact: Math.min(sectorNames.length, 3) + 1,
      urgency: 3,
      effort: 1,
    };
    results.push({
      triggerId: 'docs-stale',
      title: `Update docs for sector${sectorNames.length > 1 ? 's' : ''}: ${sectorNames.join(', ')}`,
      why: `Code changed in ${sectorNames.length} sector(s) but no documentation was updated.`,
      risk: 'low',
      confidence: 'high',
      factors,
      sectorId: sectorNames[0],
      actionType: 'document',
      delegateTo: 'doc-officer',
    });
  }

  return results;
}

/** 2. Tests Failing — test/build output contains failures */
function testsFailing(ctx: TriggerContext): TriggerResult[] {
  if (!ctx.testsFailing && !ctx.testOutput) return [];

  const isFailing = ctx.testsFailing || (ctx.testOutput && /fail|error|FAIL|ERROR/i.test(ctx.testOutput));
  if (!isFailing) return [];

  const factors: ScoringFactors = {
    risk: 3,
    impact: 4,
    urgency: 4,
    effort: 1,
  };

  return [{
    triggerId: 'tests-failing',
    title: 'Check test output — failures detected',
    why: 'Build or test output indicates failures that should be resolved.',
    risk: 'med',
    confidence: 'high',
    factors,
    actionType: 'validate',
    delegateTo: 'verifier',
  }];
}

/** 3. Policy Changed — ASMDEF policy file was modified */
function policyChanged(ctx: TriggerContext): TriggerResult[] {
  if (!ctx.policyChanged) return [];

  const factors: ScoringFactors = {
    risk: 3,
    impact: 4,
    urgency: 4,
    effort: 1,
  };

  return [{
    triggerId: 'policy-changed',
    title: 'Validate sector boundaries — policy changed',
    why: 'ASMDEF policy was recently modified. Run validation to ensure boundaries are enforced.',
    risk: 'med',
    confidence: 'high',
    factors,
    actionType: 'validate',
    delegateTo: 'verifier',
  }];
}

/** 4. Undocumented Files — new files without matching docs */
function undocumentedFiles(ctx: TriggerContext): TriggerResult[] {
  if (!ctx.undocumentedFiles || ctx.undocumentedFiles.length === 0) return [];

  const count = ctx.undocumentedFiles.length;
  const factors: ScoringFactors = {
    risk: 1,
    impact: Math.min(count, 3) + 1,
    urgency: 2,
    effort: Math.min(count, 3),
  };

  return [{
    triggerId: 'undocumented-files',
    title: `Document ${count} new file${count > 1 ? 's' : ''}`,
    why: `${count} file(s) were added without corresponding documentation.`,
    risk: 'low',
    confidence: 'med',
    factors,
    actionType: 'document',
    delegateTo: 'doc-officer',
  }];
}

/** 5. Sector Violation — cross-sector imports detected */
function sectorViolation(ctx: TriggerContext): TriggerResult[] {
  if (!ctx.sectorsAvailable) return [];
  if (!ctx.violations || ctx.violations.length === 0) return [];

  const count = ctx.violations.length;
  const affectedSectors = new Set(ctx.violations.map(v => v.sectorId));
  const factors: ScoringFactors = {
    risk: count >= 5 ? 5 : count >= 2 ? 3 : 2,
    impact: affectedSectors.size >= 3 ? 5 : affectedSectors.size >= 2 ? 3 : 2,
    urgency: 4,
    effort: Math.min(count, 4),
  };

  return [{
    triggerId: 'sector-violation',
    title: `Fix ${count} sector boundary violation${count > 1 ? 's' : ''}`,
    why: `${count} cross-sector import violation(s) detected across ${affectedSectors.size} sector(s).`,
    risk: count >= 5 ? 'high' : 'med',
    confidence: 'high',
    factors,
    sectorId: ctx.violations[0].sectorId,
    actionType: 'refactor',
    delegateTo: 'modularity-lead',
  }];
}

/** 6. Orphan Files — files outside any sector */
function orphanFiles(ctx: TriggerContext): TriggerResult[] {
  if (!ctx.sectorsAvailable) return [];
  if (!ctx.orphanFileCount || ctx.orphanFileCount === 0) return [];

  const count = ctx.orphanFileCount;
  const factors: ScoringFactors = {
    risk: 1,
    impact: count >= 20 ? 3 : count >= 5 ? 2 : 1,
    urgency: 2,
    effort: 2,
  };

  return [{
    triggerId: 'orphan-files',
    title: `Assign ${count} orphan file${count > 1 ? 's' : ''} to sectors`,
    why: `${count} file(s) are not covered by any sector configuration.`,
    risk: 'low',
    confidence: 'med',
    factors,
    actionType: 'inspect',
    delegateTo: 'modularity-lead',
  }];
}

/** All rule triggers in evaluation order */
export const RULE_TRIGGERS: TriggerFn[] = [
  testsFailing,
  sectorViolation,
  policyChanged,
  docsStale,
  undocumentedFiles,
  orphanFiles,
];

/**
 * Run all rule triggers against the given context.
 * Returns flat array of TriggerResults (unscored — caller applies scoring).
 */
export function runAllTriggers(ctx: TriggerContext): TriggerResult[] {
  const results: TriggerResult[] = [];
  for (const trigger of RULE_TRIGGERS) {
    try {
      results.push(...trigger(ctx));
    } catch {
      // Individual trigger failure should not block others
    }
  }
  return results;
}
