// @ts-nocheck

/**
 * Semgrep Rules Manager
 *
 * Manages built-in rulesets, custom rule paths, and rule configuration.
 * Provides preset scan profiles for security, quality, and game dev.
 */

import * as path from 'path';
import * as fs from 'fs';
import { SemgrepScanConfig, DEFAULT_SEMGREP_CONFIG, QUALITY_SEMGREP_CONFIG } from './SemgrepTypes';

/** A named scan profile combining rulesets */
export interface ScanProfile {
  id: string;
  name: string;
  description: string;
  config: SemgrepScanConfig;
}

/** Custom rule file info */
export interface CustomRuleInfo {
  path: string;
  name: string;
  ruleCount: number;
  category: 'security' | 'quality' | 'performance' | 'custom';
}

/** Built-in scan profiles */
export const SCAN_PROFILES: ScanProfile[] = [
  {
    id: 'security-full',
    name: 'Full Security Audit',
    description: 'OWASP Top 10, secrets, injection, crypto — all security rulesets',
    config: {
      ...DEFAULT_SEMGREP_CONFIG,
      rulesets: ['p/security-audit', 'p/secrets', 'p/owasp-top-ten'],
    },
  },
  {
    id: 'security-quick',
    name: 'Quick Security Scan',
    description: 'High-confidence security rules only — fast, fewer false positives',
    config: {
      ...DEFAULT_SEMGREP_CONFIG,
      rulesets: ['p/secrets', 'p/owasp-top-ten'],
      timeoutSecs: 60,
    },
  },
  {
    id: 'quality',
    name: 'Code Quality',
    description: 'TypeScript and C# best practices, code smells, anti-patterns',
    config: QUALITY_SEMGREP_CONFIG,
  },
  {
    id: 'supply-chain',
    name: 'Supply Chain / Dependencies',
    description: 'Vulnerable dependencies and supply chain risks',
    config: {
      ...DEFAULT_SEMGREP_CONFIG,
      rulesets: ['p/supply-chain'],
      supplyChain: true,
    },
  },
  {
    id: 'unity',
    name: 'Unity Game Dev',
    description: 'Unity-specific patterns: performance, null safety, threading',
    config: {
      ...DEFAULT_SEMGREP_CONFIG,
      rulesets: ['p/csharp'],
      customRulePaths: [], // Populated at runtime with workspace-relative paths
      excludePatterns: ['Library', 'Temp', 'obj', '.git', 'Logs', 'Packages'],
    },
  },
  {
    id: 'pentest',
    name: 'Penetration Testing',
    description: 'Aggressive ruleset for pre-deployment pentesting',
    config: {
      ...DEFAULT_SEMGREP_CONFIG,
      rulesets: ['p/security-audit', 'p/secrets', 'p/owasp-top-ten', 'p/jwt', 'p/command-injection'],
      timeoutSecs: 300,
    },
  },
];

/**
 * Semgrep Rules Manager
 */
export class SemgrepRulesManager {
  private _workspaceDir: string;
  private _customRulesDir: string;

  constructor(workspaceDir: string) {
    this._workspaceDir = workspaceDir;
    this._customRulesDir = path.join(workspaceDir, '.spacecode', 'semgrep-rules');
  }

  /** Get a scan profile by ID */
  getProfile(profileId: string): ScanProfile | undefined {
    return SCAN_PROFILES.find(p => p.id === profileId);
  }

  /** Get all scan profiles */
  getAllProfiles(): ScanProfile[] {
    return SCAN_PROFILES;
  }

  /** Build scan config from profile, merging custom rules */
  buildConfig(profileId: string): SemgrepScanConfig {
    const profile = this.getProfile(profileId) || SCAN_PROFILES[0];
    const customPaths = this.getCustomRulePaths();

    return {
      ...profile.config,
      customRulePaths: [...profile.config.customRulePaths, ...customPaths],
    };
  }

  /** Build config for specific files only */
  buildFileConfig(profileId: string, files: string[]): SemgrepScanConfig {
    const config = this.buildConfig(profileId);
    return {
      ...config,
      targetPaths: files,
    };
  }

  /** Get paths to all custom rule YAML files */
  getCustomRulePaths(): string[] {
    const paths: string[] = [];

    // Check workspace .spacecode/semgrep-rules/ directory
    if (fs.existsSync(this._customRulesDir)) {
      try {
        const files = fs.readdirSync(this._customRulesDir);
        for (const file of files) {
          if (file.endsWith('.yaml') || file.endsWith('.yml')) {
            paths.push(path.join(this._customRulesDir, file));
          }
        }
      } catch { /* ignore */ }
    }

    // Check extension's bundled rules
    const extensionRulesDir = path.join(__dirname, '..', '..', 'media', 'semgrep-rules');
    if (fs.existsSync(extensionRulesDir)) {
      try {
        const files = fs.readdirSync(extensionRulesDir);
        for (const file of files) {
          if (file.endsWith('.yaml') || file.endsWith('.yml')) {
            paths.push(path.join(extensionRulesDir, file));
          }
        }
      } catch { /* ignore */ }
    }

    return paths;
  }

  /** List custom rules with metadata */
  listCustomRules(): CustomRuleInfo[] {
    const rules: CustomRuleInfo[] = [];
    const paths = this.getCustomRulePaths();

    for (const rulePath of paths) {
      try {
        const content = fs.readFileSync(rulePath, 'utf-8');
        const ruleCount = (content.match(/- id:/g) || []).length;
        const name = path.basename(rulePath, path.extname(rulePath));

        let category: CustomRuleInfo['category'] = 'custom';
        if (name.includes('security')) category = 'security';
        else if (name.includes('quality')) category = 'quality';
        else if (name.includes('performance') || name.includes('perf')) category = 'performance';

        rules.push({ path: rulePath, name, ruleCount, category });
      } catch { /* skip unreadable files */ }
    }

    return rules;
  }

  /** Ensure custom rules directory exists */
  ensureCustomRulesDir(): string {
    const spacecodDir = path.join(this._workspaceDir, '.spacecode');
    if (!fs.existsSync(spacecodDir)) {
      fs.mkdirSync(spacecodDir, { recursive: true });
    }
    if (!fs.existsSync(this._customRulesDir)) {
      fs.mkdirSync(this._customRulesDir, { recursive: true });
    }
    return this._customRulesDir;
  }

  /** Write a custom rule file */
  writeCustomRule(filename: string, content: string): string {
    this.ensureCustomRulesDir();
    const filePath = path.join(this._customRulesDir, filename);
    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
  }

  /** Delete a custom rule file */
  deleteCustomRule(filename: string): boolean {
    const filePath = path.join(this._customRulesDir, filename);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
    } catch { /* ignore */ }
    return false;
  }

  /** Detect which profiles are relevant for this workspace */
  detectRelevantProfiles(): string[] {
    const profiles: string[] = ['security-full']; // Always relevant

    // Check for Unity project
    const hasUnity = fs.existsSync(path.join(this._workspaceDir, 'Assets')) &&
                     fs.existsSync(path.join(this._workspaceDir, 'ProjectSettings'));
    if (hasUnity) profiles.push('unity');

    // Check for package.json (Node/TS project)
    if (fs.existsSync(path.join(this._workspaceDir, 'package.json'))) {
      profiles.push('quality');
      profiles.push('supply-chain');
    }

    // Check for .csproj files (C# project)
    try {
      const files = fs.readdirSync(this._workspaceDir);
      if (files.some(f => f.endsWith('.csproj') || f.endsWith('.sln'))) {
        profiles.push('quality');
      }
    } catch { /* ignore */ }

    return [...new Set(profiles)];
  }
}

/** Singleton */
let _rulesManager: SemgrepRulesManager | null = null;

export function getSemgrepRulesManager(workspaceDir?: string): SemgrepRulesManager {
  if (!_rulesManager && workspaceDir) {
    _rulesManager = new SemgrepRulesManager(workspaceDir);
  }
  return _rulesManager!;
}

export function initSemgrepRulesManager(workspaceDir: string): SemgrepRulesManager {
  _rulesManager = new SemgrepRulesManager(workspaceDir);
  return _rulesManager;
}
