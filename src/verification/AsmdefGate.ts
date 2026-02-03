/**
 * Asmdef Gate
 *
 * Scans asmdef files and validates assembly dependencies against sector rules.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { getSectorManager, Sector } from '../sectors/SectorConfig';

export interface AsmdefInfo {
  name: string;
  path: string;
  references: string[];
  sector?: Sector;
}

export interface AsmdefPolicyEntry {
  allow: string[];
  sector?: string;
  notes?: string;
}

export interface AsmdefPolicy {
  version: number;
  mode?: 'advisory' | 'strict';
  entries: Record<string, AsmdefPolicyEntry>;
}

export interface AsmdefInventoryResult {
  asmdefs: AsmdefInfo[];
  policyPath?: string;
  policy?: AsmdefPolicy | null;
  warnings: string[];
}

export interface AsmdefNormalizeResult {
  updated: boolean;
  replacements: number;
  warnings: string[];
}

export interface AsmdefGraphResult {
  nodes: Array<{ id: string; sector?: string; path?: string }>;
  edges: Array<{ from: string; to: string }>;
  unresolved: string[];
}

export interface AsmdefViolation {
  asmdefName: string;
  asmdefPath: string;
  sectorId?: string;
  sectorName?: string;
  reference: string;
  refSectorId?: string;
  refSectorName?: string;
  message: string;
  suggestion?: string;
  severity: 'error' | 'warning';
}

export interface AsmdefCheckResult {
  passed: boolean;
  asmdefsScanned: number;
  sectorsScanned: string[];
  violations: AsmdefViolation[];
  warnings: string[];
  summary: string;
}

export class AsmdefGate {
  private sectorManager = getSectorManager();

  async check(): Promise<AsmdefCheckResult> {
    const asmdefs = await this.loadAsmdefs();
    const policyInfo = await this.readPolicy();
    const policy = policyInfo.policy || null;
    const policyMode = policy?.mode || 'advisory';
    const policyEntries = policy?.entries || {};
    const nameToAsmdef = new Map<string, AsmdefInfo>();
    const sectorsScanned = new Set<string>();
    const violations: AsmdefViolation[] = [];
    const warnings: string[] = [];

    for (const a of asmdefs) {
      if (a.name) nameToAsmdef.set(a.name, a);
      if (a.sector) sectorsScanned.add(a.sector.id);
    }

    for (const asmdef of asmdefs) {
      const sector = asmdef.sector;
      if (!sector) {
        warnings.push(`Asmdef ${asmdef.name} has no sector mapping (path: ${asmdef.path})`);
        continue;
      }

      const policyEntry = policyEntries[asmdef.name];
      const allowed = policyEntry
        ? new Set<string>([asmdef.name, ...policyEntry.allow])
        : new Set<string>([sector.id, ...(sector.dependencies || [])]);

      if (policy && !policyEntry) {
        const msg = `Asmdef ${asmdef.name} is missing a policy entry`;
        if (policyMode === 'strict') {
          violations.push({
            asmdefName: asmdef.name,
            asmdefPath: asmdef.path,
            sectorId: sector.id,
            sectorName: sector.name,
            reference: '(none)',
            message: msg,
            severity: 'error'
          });
        } else {
          warnings.push(msg);
        }
      }

      for (const ref of asmdef.references) {
        if (ref.startsWith('GUID:')) {
          warnings.push(`Asmdef ${asmdef.name} uses GUID reference (${ref}); cannot validate sector dependency`);
          continue;
        }

        const refAsmdef = nameToAsmdef.get(ref);
        if (!refAsmdef) {
          warnings.push(`Asmdef ${asmdef.name} references unknown assembly "${ref}"`);
          continue;
        }

        const refSector = refAsmdef.sector;
        if (!refSector) {
          warnings.push(`Referenced asmdef "${ref}" has no sector mapping`);
          continue;
        }

        if (sector.id === 'yard' || refSector.id === 'yard') {
          continue; // yard is permissive
        }

        const allowedByPolicy = policyEntry ? allowed.has(ref) : allowed.has(refSector.id);
        if (!allowedByPolicy) {
          violations.push({
            asmdefName: asmdef.name,
            asmdefPath: asmdef.path,
            sectorId: sector.id,
            sectorName: sector.name,
            reference: ref,
            refSectorId: refSector.id,
            refSectorName: refSector.name,
            message: policyEntry
              ? `Asmdef "${asmdef.name}" references "${ref}" which is not allowed by policy.`
              : `Asmdef "${asmdef.name}" (sector ${sector.name}) references "${ref}" (sector ${refSector.name}) which is not allowed.`,
            suggestion: policyEntry
              ? `Add "${ref}" to policy entry allow list for "${asmdef.name}".`
              : `Create policy entry for "${asmdef.name}" or add dependency from sector "${sector.id}" to "${refSector.id}".`,
            severity: 'error'
          });
        }
      }
    }

    const passed = violations.length === 0;
    const summaryLines: string[] = [];
    summaryLines.push(`Asmdef scan: ${asmdefs.length} assemblies, ${sectorsScanned.size} sector(s).`);
    if (policy) {
      summaryLines.push(`Policy: ${policyMode} (${Object.keys(policyEntries).length} entries).`);
    } else {
      summaryLines.push('Policy: (none) – using sector rules only.');
    }
    if (violations.length > 0) {
      summaryLines.push(`❌ ${violations.length} asmdef violation(s) found.`);
      violations.forEach(v => {
        summaryLines.push(`  • ${path.basename(v.asmdefPath)} → ${v.reference}: ${v.message}`);
      });
    } else {
      summaryLines.push('✅ Asmdef dependencies comply with sector rules.');
    }
    if (warnings.length > 0) {
      summaryLines.push(`⚠️ ${warnings.length} warning(s).`);
    }

    return {
      passed,
      asmdefsScanned: asmdefs.length,
      sectorsScanned: Array.from(sectorsScanned),
      violations,
      warnings,
      summary: summaryLines.join('\n')
    };
  }

  async getInventory(): Promise<AsmdefInventoryResult> {
    const asmdefs = await this.loadAsmdefs();
    const policyInfo = await this.readPolicy();
    return {
      asmdefs,
      policyPath: policyInfo.policyPath,
      policy: policyInfo.policy || null,
      warnings: policyInfo.warnings
    };
  }

  async getGraph(): Promise<AsmdefGraphResult> {
    const asmdefs = await this.loadAsmdefs();
    const names = new Set(asmdefs.map(a => a.name));
    const edges: Array<{ from: string; to: string }> = [];
    const unresolved: string[] = [];

    for (const asmdef of asmdefs) {
      const refs = Array.isArray(asmdef.references) ? asmdef.references : [];
      for (const ref of refs) {
        if (names.has(ref)) {
          edges.push({ from: asmdef.name, to: ref });
        } else if (ref.startsWith('GUID:')) {
          unresolved.push(`${asmdef.name} -> ${ref}`);
        } else {
          unresolved.push(`${asmdef.name} -> ${ref}`);
        }
      }
    }

    return {
      nodes: asmdefs.map(a => ({ id: a.name, sector: a.sector?.name || a.sector?.id, path: a.path })),
      edges,
      unresolved
    };
  }

  async generatePolicyDraft(overwrite = false): Promise<{ policyPath: string; policy: AsmdefPolicy }> {
    const asmdefs = await this.loadAsmdefs();
    const policyPath = await this.getPolicyPath(true);
    if (!policyPath) {
      throw new Error('No workspace folder open');
    }
    const existing = await this.readPolicy();
    if (existing.policy && !overwrite) {
      return { policyPath: policyPath.fsPath, policy: existing.policy };
    }

    const entries: Record<string, AsmdefPolicyEntry> = {};
    for (const asmdef of asmdefs) {
      entries[asmdef.name] = {
        allow: [...asmdef.references],
        sector: asmdef.sector?.id
      };
    }

    const policy: AsmdefPolicy = {
      version: 1,
      mode: 'advisory',
      entries
    };

    await vscode.workspace.fs.writeFile(policyPath, Buffer.from(JSON.stringify(policy, null, 2), 'utf8'));
    return { policyPath: policyPath.fsPath, policy };
  }

  async setPolicyMode(mode: 'advisory' | 'strict'): Promise<{ policyPath: string; policy: AsmdefPolicy } | null> {
    const policyInfo = await this.readPolicy();
    if (!policyInfo.policy || !policyInfo.policyPath) return null;
    const policy = { ...policyInfo.policy, mode };
    await vscode.workspace.fs.writeFile(vscode.Uri.file(policyInfo.policyPath), Buffer.from(JSON.stringify(policy, null, 2), 'utf8'));
    return { policyPath: policyInfo.policyPath, policy };
  }

  async normalizePolicyGuids(): Promise<AsmdefNormalizeResult> {
    const policyInfo = await this.readPolicy();
    const warnings: string[] = [];
    if (!policyInfo.policy || !policyInfo.policyPath) {
      warnings.push('No asmdef policy found.');
      return { updated: false, replacements: 0, warnings };
    }

    const asmdefs = await this.loadAsmdefsWithGuids();
    const guidToName = new Map<string, string>();
    for (const a of asmdefs) {
      if (a.guid) guidToName.set(a.guid, a.name);
    }

    let replacements = 0;
    const entries = { ...policyInfo.policy.entries };
    for (const [name, entry] of Object.entries(entries)) {
      const allow = Array.isArray(entry.allow) ? [...entry.allow] : [];
      for (let i = 0; i < allow.length; i++) {
        const ref = allow[i];
        if (ref.startsWith('GUID:')) {
          const guid = ref.replace('GUID:', '');
          const resolved = guidToName.get(guid);
          if (resolved) {
            allow[i] = resolved;
            replacements += 1;
          } else {
            warnings.push(`No asmdef found for GUID ${guid} (in ${name})`);
          }
        }
      }
      entries[name] = { ...entry, allow };
    }

    if (replacements > 0) {
      const policy: AsmdefPolicy = { ...policyInfo.policy, entries };
      await vscode.workspace.fs.writeFile(vscode.Uri.file(policyInfo.policyPath), Buffer.from(JSON.stringify(policy, null, 2), 'utf8'));
      return { updated: true, replacements, warnings };
    }

    return { updated: false, replacements: 0, warnings };
  }

  private async loadAsmdefs(): Promise<AsmdefInfo[]> {
    const results: AsmdefInfo[] = [];
    const exclude = '{**/Library/**,**/Temp/**,**/obj/**,**/bin/**,**/node_modules/**}';
    const files = await vscode.workspace.findFiles('**/*.asmdef', exclude);

    for (const file of files) {
      try {
        const buf = await vscode.workspace.fs.readFile(file);
        const json = JSON.parse(Buffer.from(buf).toString('utf8'));
        const name = json.name || path.basename(file.fsPath, '.asmdef');
        const refs = Array.isArray(json.references) ? json.references : [];
        const sector = this.sectorManager.detectSector(file.fsPath);
        results.push({
          name,
          path: file.fsPath,
          references: refs,
          sector
        });
      } catch {
        results.push({
          name: path.basename(file.fsPath, '.asmdef'),
          path: file.fsPath,
          references: [],
          sector: this.sectorManager.detectSector(file.fsPath)
        });
      }
    }

    return results;
  }

  private async loadAsmdefsWithGuids(): Promise<Array<AsmdefInfo & { guid?: string }>> {
    const results: Array<AsmdefInfo & { guid?: string }> = [];
    const exclude = '{**/Library/**,**/Temp/**,**/obj/**,**/bin/**,**/node_modules/**}';
    const files = await vscode.workspace.findFiles('**/*.asmdef', exclude);

    for (const file of files) {
      let name = path.basename(file.fsPath, '.asmdef');
      let refs: string[] = [];
      try {
        const buf = await vscode.workspace.fs.readFile(file);
        const json = JSON.parse(Buffer.from(buf).toString('utf8'));
        name = json.name || name;
        refs = Array.isArray(json.references) ? json.references : [];
      } catch {
        // ignore parse errors
      }

      let guid: string | undefined;
      const metaPath = file.fsPath + '.meta';
      try {
        const metaBuf = await vscode.workspace.fs.readFile(vscode.Uri.file(metaPath));
        const metaText = Buffer.from(metaBuf).toString('utf8');
        const match = metaText.match(/guid:\s*([a-f0-9]+)/i);
        if (match) guid = match[1];
      } catch {
        // ignore
      }

      results.push({
        name,
        path: file.fsPath,
        references: refs,
        sector: this.sectorManager.detectSector(file.fsPath),
        guid
      });
    }

    return results;
  }

  private async readPolicy(): Promise<{ policy: AsmdefPolicy | null; policyPath?: string; warnings: string[] }> {
    const warnings: string[] = [];
    const policyPath = await this.getPolicyPath(false);
    if (!policyPath) {
      return { policy: null, warnings };
    }

    try {
      const buf = await vscode.workspace.fs.readFile(policyPath);
      const json = JSON.parse(Buffer.from(buf).toString('utf8'));
      if (!json || typeof json !== 'object' || !json.entries) {
        warnings.push('Asmdef policy file is invalid (missing entries).');
        return { policy: null, policyPath: policyPath.fsPath, warnings };
      }
      return { policy: json as AsmdefPolicy, policyPath: policyPath.fsPath, warnings };
    } catch {
      return { policy: null, policyPath: policyPath.fsPath, warnings };
    }
  }

  private async getPolicyPath(ensureDir: boolean): Promise<vscode.Uri | null> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!root) return null;
    const dir = vscode.Uri.joinPath(root, '.spacecode');
    if (ensureDir) {
      try {
        await vscode.workspace.fs.createDirectory(dir);
      } catch {
        // ignore
      }
    }
    return vscode.Uri.joinPath(dir, 'asmdef-policy.json');
  }
}
