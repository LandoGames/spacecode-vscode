/**
 * Secret Scanner
 *
 * Detects secrets, API keys, tokens, and credentials in source code
 * using regex pattern matching.
 */

import * as vscode from 'vscode';
import {
  SecurityFinding,
  SecuritySeverity,
  SecretPattern,
  SUPPRESSION_PATTERNS
} from './types';

/**
 * Secret patterns for detection
 * Based on common secret formats and known provider patterns
 */
export const SECRET_PATTERNS: SecretPattern[] = [
  // AWS
  {
    name: 'AWS Access Key ID',
    pattern: /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g,
    severity: 'critical',
    description: 'AWS Access Key ID found in code'
  },
  {
    name: 'AWS Secret Access Key',
    pattern: /(?:aws|AWS).{0,20}['\"][0-9a-zA-Z\/+]{40}['\"]/g,
    severity: 'critical',
    description: 'Potential AWS Secret Access Key'
  },

  // Google
  {
    name: 'Google API Key',
    pattern: /AIza[0-9A-Za-z\-_]{35}/g,
    severity: 'high',
    description: 'Google API Key found in code'
  },
  {
    name: 'Google OAuth Token',
    pattern: /ya29\.[0-9A-Za-z\-_]+/g,
    severity: 'high',
    description: 'Google OAuth Token found in code'
  },

  // GitHub
  {
    name: 'GitHub Personal Access Token',
    pattern: /ghp_[0-9a-zA-Z]{36}/g,
    severity: 'critical',
    description: 'GitHub Personal Access Token found in code'
  },
  {
    name: 'GitHub OAuth Token',
    pattern: /gho_[0-9a-zA-Z]{36}/g,
    severity: 'critical',
    description: 'GitHub OAuth Token found in code'
  },
  {
    name: 'GitHub App Token',
    pattern: /(?:ghu|ghs)_[0-9a-zA-Z]{36}/g,
    severity: 'critical',
    description: 'GitHub App Token found in code'
  },

  // Slack
  {
    name: 'Slack Token',
    pattern: /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*/g,
    severity: 'high',
    description: 'Slack Token found in code'
  },
  {
    name: 'Slack Webhook',
    pattern: /https:\/\/hooks\.slack\.com\/services\/T[a-zA-Z0-9_]{8,}\/B[a-zA-Z0-9_]{8,}\/[a-zA-Z0-9_]{24}/g,
    severity: 'high',
    description: 'Slack Webhook URL found in code'
  },

  // Stripe
  {
    name: 'Stripe API Key',
    pattern: /sk_live_[0-9a-zA-Z]{24}/g,
    severity: 'critical',
    description: 'Stripe Live API Key found in code'
  },
  {
    name: 'Stripe Test Key',
    pattern: /sk_test_[0-9a-zA-Z]{24}/g,
    severity: 'medium',
    description: 'Stripe Test API Key found in code',
    falsePositiveHints: ['Test keys are less critical but should still be secured']
  },

  // Firebase
  {
    name: 'Firebase API Key',
    pattern: /AAAA[A-Za-z0-9_-]{7}:[A-Za-z0-9_-]{140}/g,
    severity: 'high',
    description: 'Firebase Cloud Messaging key found'
  },

  // SendGrid
  {
    name: 'SendGrid API Key',
    pattern: /SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}/g,
    severity: 'high',
    description: 'SendGrid API Key found in code'
  },

  // Twilio
  {
    name: 'Twilio API Key',
    pattern: /SK[a-f0-9]{32}/g,
    severity: 'high',
    description: 'Twilio API Key found in code'
  },

  // Generic Patterns
  {
    name: 'Generic API Key',
    pattern: /(?:api[_-]?key|apikey|api_secret)['":\s=]+['"][a-zA-Z0-9_\-]{20,}['"]/gi,
    severity: 'high',
    description: 'Generic API key pattern detected'
  },
  {
    name: 'Generic Secret',
    pattern: /(?:secret|password|passwd|pwd)['":\s=]+['"][^'"]{8,}['"]/gi,
    severity: 'high',
    description: 'Generic secret pattern detected',
    falsePositiveHints: ['May match variable names or comments']
  },
  {
    name: 'Bearer Token',
    pattern: /bearer\s+[a-zA-Z0-9_\-\.]+/gi,
    severity: 'high',
    description: 'Bearer token found in code'
  },
  {
    name: 'Basic Auth',
    pattern: /basic\s+[a-zA-Z0-9+\/=]{20,}/gi,
    severity: 'high',
    description: 'Basic authentication credentials found'
  },

  // Private Keys
  {
    name: 'RSA Private Key',
    pattern: /-----BEGIN RSA PRIVATE KEY-----/g,
    severity: 'critical',
    description: 'RSA Private Key found in code'
  },
  {
    name: 'SSH Private Key',
    pattern: /-----BEGIN (?:OPENSSH|EC|DSA) PRIVATE KEY-----/g,
    severity: 'critical',
    description: 'SSH Private Key found in code'
  },
  {
    name: 'PGP Private Key',
    pattern: /-----BEGIN PGP PRIVATE KEY BLOCK-----/g,
    severity: 'critical',
    description: 'PGP Private Key found in code'
  },

  // Database Connection Strings
  {
    name: 'MongoDB Connection String',
    pattern: /mongodb(?:\+srv)?:\/\/[^\s'"]+:[^\s'"]+@[^\s'"]+/gi,
    severity: 'critical',
    description: 'MongoDB connection string with credentials'
  },
  {
    name: 'PostgreSQL Connection String',
    pattern: /postgres(?:ql)?:\/\/[^\s'"]+:[^\s'"]+@[^\s'"]+/gi,
    severity: 'critical',
    description: 'PostgreSQL connection string with credentials'
  },
  {
    name: 'MySQL Connection String',
    pattern: /mysql:\/\/[^\s'"]+:[^\s'"]+@[^\s'"]+/gi,
    severity: 'critical',
    description: 'MySQL connection string with credentials'
  },

  // JWT
  {
    name: 'JWT Token',
    pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
    severity: 'medium',
    description: 'JWT Token found in code',
    falsePositiveHints: ['May be example tokens in documentation']
  },

  // Unity/Game Dev specific
  {
    name: 'Unity Services API Key',
    pattern: /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi,
    severity: 'medium',
    description: 'UUID pattern (may be Unity Project ID or API key)',
    falsePositiveHints: ['UUIDs are common in Unity, verify if it is a secret']
  }
];

/**
 * Secret Scanner class
 */
export class SecretScanner {
  private _patterns: SecretPattern[];
  private _excludePatterns: RegExp[];

  constructor(customPatterns?: SecretPattern[]) {
    this._patterns = customPatterns || SECRET_PATTERNS;
    this._excludePatterns = [
      /\.min\.js$/,
      /\.bundle\.js$/,
      /package-lock\.json$/,
      /yarn\.lock$/,
      /\.git\//,
      /node_modules\//,
      /\.meta$/
    ];
  }

  /**
   * Scan a single file for secrets
   */
  async scanFile(filePath: string, content: string): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];

    // Skip excluded files
    if (this._shouldExclude(filePath)) {
      return findings;
    }

    const lines = content.split('\n');

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const lineNumber = lineIndex + 1;

      // Check for suppression comments
      if (this._isSuppressed(line)) {
        continue;
      }

      // Check each pattern
      for (const pattern of this._patterns) {
        // Reset regex lastIndex
        pattern.pattern.lastIndex = 0;

        let match;
        while ((match = pattern.pattern.exec(line)) !== null) {
          const finding = this._createFinding(
            pattern,
            filePath,
            lineNumber,
            match[0],
            match.index
          );
          findings.push(finding);
        }
      }
    }

    return findings;
  }

  /**
   * Scan multiple files
   */
  async scanFiles(
    files: Array<{ path: string; content: string }>
  ): Promise<SecurityFinding[]> {
    const allFindings: SecurityFinding[] = [];

    for (const file of files) {
      const findings = await this.scanFile(file.path, file.content);
      allFindings.push(...findings);
    }

    return allFindings;
  }

  /**
   * Scan workspace folder
   */
  async scanWorkspace(
    workspaceFolder: vscode.Uri,
    options: {
      include?: string;
      exclude?: string;
      maxFiles?: number;
    } = {}
  ): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];
    const include = options.include || '**/*.{ts,js,cs,json,yaml,yml,env,config}';
    const exclude = options.exclude || '**/node_modules/**';
    const maxFiles = options.maxFiles || 500;

    const files = await vscode.workspace.findFiles(
      new vscode.RelativePattern(workspaceFolder, include),
      new vscode.RelativePattern(workspaceFolder, exclude),
      maxFiles
    );

    for (const file of files) {
      try {
        const document = await vscode.workspace.openTextDocument(file);
        const content = document.getText();
        const relativePath = vscode.workspace.asRelativePath(file);

        const fileFindings = await this.scanFile(relativePath, content);
        findings.push(...fileFindings);
      } catch (error) {
        // Skip files that can't be read
        console.warn(`SecretScanner: Could not read ${file.fsPath}:`, error);
      }
    }

    return findings;
  }

  /**
   * Check if a file should be excluded
   */
  private _shouldExclude(filePath: string): boolean {
    return this._excludePatterns.some(pattern => pattern.test(filePath));
  }

  /**
   * Check if a line has a suppression comment
   */
  private _isSuppressed(line: string): boolean {
    return SUPPRESSION_PATTERNS.some(pattern => pattern.test(line));
  }

  /**
   * Create a security finding
   */
  private _createFinding(
    pattern: SecretPattern,
    file: string,
    line: number,
    match: string,
    column: number
  ): SecurityFinding {
    // Mask the secret for display
    const maskedEvidence = this._maskSecret(match);

    return {
      id: `secret-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      category: 'secrets',
      severity: pattern.severity,
      scanType: 'mechanical',
      file,
      line,
      column: column + 1,
      endColumn: column + match.length + 1,
      title: pattern.name,
      description: pattern.description,
      evidence: maskedEvidence,
      suggestedFix: `Remove the secret from code and use environment variables or a secrets manager instead.`,
      fixDifficulty: 'easy',
      falsePositiveRisk: pattern.falsePositiveHints ? 'medium' : 'low',
      ruleId: `secret-scanner-${pattern.name.toLowerCase().replace(/\s+/g, '-')}`,
      ruleName: pattern.name,
      detectedAt: Date.now()
    };
  }

  /**
   * Mask a secret for safe display
   */
  private _maskSecret(secret: string): string {
    if (secret.length <= 8) {
      return '*'.repeat(secret.length);
    }
    const visibleStart = secret.slice(0, 4);
    const visibleEnd = secret.slice(-4);
    const masked = '*'.repeat(Math.min(secret.length - 8, 20));
    return `${visibleStart}${masked}${visibleEnd}`;
  }

  /**
   * Add custom patterns
   */
  addPatterns(patterns: SecretPattern[]): void {
    this._patterns.push(...patterns);
  }

  /**
   * Get all patterns
   */
  getPatterns(): SecretPattern[] {
    return [...this._patterns];
  }
}

/**
 * Singleton instance
 */
let _secretScanner: SecretScanner | null = null;

export function getSecretScanner(): SecretScanner {
  if (!_secretScanner) {
    _secretScanner = new SecretScanner();
  }
  return _secretScanner;
}
