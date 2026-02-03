/**
 * Crypto Scanner
 *
 * Detects usage of weak or insecure cryptographic algorithms.
 * Flags MD5, SHA1, DES, and other deprecated crypto functions.
 */

import * as vscode from 'vscode';
import {
  SecurityFinding,
  SecuritySeverity,
  SecurityRule,
  SUPPRESSION_PATTERNS
} from './types';

/**
 * Weak crypto patterns and their secure alternatives
 */
interface CryptoPattern {
  name: string;
  patterns: RegExp[];
  severity: SecuritySeverity;
  description: string;
  secureAlternative: string;
  cweId: string;
}

const WEAK_CRYPTO_PATTERNS: CryptoPattern[] = [
  // Hash functions
  {
    name: 'MD5 Hash',
    patterns: [
      /MD5\.Create\(\)/gi,
      /\.ComputeHash.*MD5/gi,
      /CreateHash\s*\(\s*['"]md5['"]\s*\)/gi,
      /hashlib\.md5\(/gi,
      /crypto\.createHash\s*\(\s*['"]md5['"]\s*\)/gi,
      /DigestUtils\.md5/gi,
      /Md5\s*\.\s*hashString/gi,
      /using\s+MD5\s*=/gi
    ],
    severity: 'medium',
    description: 'MD5 is cryptographically broken and should not be used for security purposes',
    secureAlternative: 'Use SHA-256 or SHA-3 for hashing',
    cweId: 'CWE-328'
  },
  {
    name: 'SHA1 Hash',
    patterns: [
      /SHA1\.Create\(\)/gi,
      /\.ComputeHash.*SHA1/gi,
      /CreateHash\s*\(\s*['"]sha1['"]\s*\)/gi,
      /hashlib\.sha1\(/gi,
      /crypto\.createHash\s*\(\s*['"]sha1['"]\s*\)/gi,
      /DigestUtils\.sha1/gi,
      /Sha1\s*\.\s*hashString/gi,
      /using\s+SHA1\s*=/gi
    ],
    severity: 'medium',
    description: 'SHA1 is deprecated for security use due to collision attacks',
    secureAlternative: 'Use SHA-256 or SHA-3 for hashing',
    cweId: 'CWE-328'
  },

  // Symmetric encryption
  {
    name: 'DES Encryption',
    patterns: [
      /DES\.Create\(\)/gi,
      /DESCryptoServiceProvider/gi,
      /Cipher\.getInstance\s*\(\s*['"]DES['"]/gi,
      /crypto\.createCipheriv\s*\(\s*['"]des['"]/gi,
      /TripleDES\.Create\(\)/gi
    ],
    severity: 'high',
    description: 'DES has a key length of only 56 bits and is considered insecure',
    secureAlternative: 'Use AES-256 for symmetric encryption',
    cweId: 'CWE-327'
  },
  {
    name: 'RC4 Encryption',
    patterns: [
      /RC4/gi,
      /ARC4/gi,
      /Cipher\.getInstance\s*\(\s*['"]RC4['"]/gi
    ],
    severity: 'high',
    description: 'RC4 has known vulnerabilities and should not be used',
    secureAlternative: 'Use AES-256-GCM for encryption',
    cweId: 'CWE-327'
  },
  {
    name: 'Blowfish Encryption',
    patterns: [
      /Blowfish/gi,
      /Cipher\.getInstance\s*\(\s*['"]Blowfish['"]/gi
    ],
    severity: 'medium',
    description: 'Blowfish has a 64-bit block size which is vulnerable to birthday attacks',
    secureAlternative: 'Use AES-256 for symmetric encryption',
    cweId: 'CWE-327'
  },

  // ECB mode
  {
    name: 'ECB Mode',
    patterns: [
      /CipherMode\.ECB/gi,
      /\/ECB\//gi,
      /['"]ECB['"]/gi,
      /AES\/ECB/gi
    ],
    severity: 'high',
    description: 'ECB mode does not provide semantic security and leaks patterns',
    secureAlternative: 'Use CBC, CTR, or GCM mode with proper IV',
    cweId: 'CWE-327'
  },

  // Random number generation
  {
    name: 'Insecure Random',
    patterns: [
      /new\s+Random\s*\(\)/gi,
      /Math\.random\s*\(\)/gi,
      /random\.random\s*\(\)/gi,
      /System\.Random/gi
    ],
    severity: 'medium',
    description: 'Non-cryptographic random number generator used for security purposes',
    secureAlternative: 'Use crypto.randomBytes() or RNGCryptoServiceProvider',
    cweId: 'CWE-330'
  },

  // Weak key sizes
  {
    name: 'Small RSA Key',
    patterns: [
      /RSA[^\n]{0,50}1024/gi,
      /keysize\s*[=:]\s*1024/gi,
      /KeySize\s*=\s*1024/gi
    ],
    severity: 'high',
    description: 'RSA key size of 1024 bits is considered insufficient',
    secureAlternative: 'Use at least 2048-bit RSA keys, preferably 4096-bit',
    cweId: 'CWE-326'
  },

  // Hardcoded IVs
  {
    name: 'Hardcoded IV',
    patterns: [
      /\.IV\s*=\s*new\s+byte\s*\[\s*\]\s*\{[^}]+\}/gi,
      /iv\s*[=:]\s*['"][a-fA-F0-9]{16,}['"]/gi
    ],
    severity: 'high',
    description: 'Initialization vectors should be random, not hardcoded',
    secureAlternative: 'Generate a random IV for each encryption operation',
    cweId: 'CWE-329'
  },

  // Password hashing
  {
    name: 'Unsalted Password Hash',
    patterns: [
      /password.*SHA256\.Create/gi,
      /hash\s*\(\s*password\s*\)/gi,
      /\.ComputeHash.*password/gi
    ],
    severity: 'high',
    description: 'Password hashing without salt is vulnerable to rainbow table attacks',
    secureAlternative: 'Use bcrypt, scrypt, or Argon2 for password hashing',
    cweId: 'CWE-916'
  }
];

/**
 * Crypto Scanner class
 */
export class CryptoScanner {
  private _patterns: CryptoPattern[];

  constructor() {
    this._patterns = WEAK_CRYPTO_PATTERNS;
  }

  /**
   * Scan a single file for weak crypto
   */
  async scanFile(filePath: string, content: string): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];
    const lines = content.split('\n');

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const lineNumber = lineIndex + 1;

      // Check for suppression comments
      if (this._isSuppressed(line)) {
        continue;
      }

      // Check each crypto pattern
      for (const cryptoPattern of this._patterns) {
        for (const pattern of cryptoPattern.patterns) {
          // Reset regex lastIndex
          pattern.lastIndex = 0;

          let match;
          while ((match = pattern.exec(line)) !== null) {
            findings.push(this._createFinding(
              cryptoPattern,
              filePath,
              lineNumber,
              match[0],
              match.index
            ));
          }
        }
      }
    }

    return findings;
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
    const include = options.include || '**/*.{ts,js,cs,java,py,go,rb}';
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
        console.warn(`CryptoScanner: Could not read ${file.fsPath}:`, error);
      }
    }

    return findings;
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
    pattern: CryptoPattern,
    file: string,
    line: number,
    match: string,
    column: number
  ): SecurityFinding {
    return {
      id: `crypto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      category: 'crypto',
      severity: pattern.severity,
      scanType: 'mechanical',
      file,
      line,
      column: column + 1,
      endColumn: column + match.length + 1,
      title: pattern.name,
      description: pattern.description,
      evidence: match,
      cweId: pattern.cweId,
      suggestedFix: pattern.secureAlternative,
      fixDifficulty: 'moderate',
      falsePositiveRisk: 'low',
      ruleId: `crypto-scanner-${pattern.name.toLowerCase().replace(/\s+/g, '-')}`,
      ruleName: pattern.name,
      detectedAt: Date.now()
    };
  }
}

/**
 * Singleton instance
 */
let _cryptoScanner: CryptoScanner | null = null;

export function getCryptoScanner(): CryptoScanner {
  if (!_cryptoScanner) {
    _cryptoScanner = new CryptoScanner();
  }
  return _cryptoScanner;
}
