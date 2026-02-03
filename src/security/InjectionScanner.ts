/**
 * Injection Scanner
 *
 * Detects potential injection vulnerabilities:
 * - Path traversal
 * - Command injection
 * - SQL injection patterns (mechanical detection)
 */

import * as vscode from 'vscode';
import {
  SecurityFinding,
  SecuritySeverity,
  SUPPRESSION_PATTERNS
} from './types';

/**
 * Injection pattern definition
 */
interface InjectionPattern {
  name: string;
  category: 'injection' | 'input_validation';
  patterns: RegExp[];
  severity: SecuritySeverity;
  description: string;
  cweId: string;
  owaspCategory: string;
  suggestedFix: string;
}

/**
 * Path traversal patterns
 */
const PATH_TRAVERSAL_PATTERNS: InjectionPattern[] = [
  {
    name: 'Path Concatenation',
    category: 'injection',
    patterns: [
      /Path\.Combine\s*\([^)]*\+[^)]*\)/gi,
      /File\.(?:Read|Write|Open|Delete|Exists)[^(]*\([^)]*\+[^)]*\)/gi,
      /Directory\.(?:Create|Delete|Exists)[^(]*\([^)]*\+[^)]*\)/gi,
      /fs\.(?:readFile|writeFile|unlink|readdir)[^(]*\([^)]*\+[^)]*\)/gi,
      /open\s*\([^)]*\+[^)]*,/gi
    ],
    severity: 'high',
    description: 'User input concatenated with file path may allow directory traversal',
    cweId: 'CWE-22',
    owaspCategory: 'A01:2021-Broken Access Control',
    suggestedFix: 'Validate and sanitize file paths. Use Path.GetFullPath() and verify the result is within allowed directories.'
  },
  {
    name: 'Directory Traversal Sequence',
    category: 'injection',
    patterns: [
      /\.\.\/|\.\.\\|\.\.\%2[fF]/g,
      /\.\.[\/\\]/g
    ],
    severity: 'high',
    description: 'Hardcoded directory traversal sequence found',
    cweId: 'CWE-22',
    owaspCategory: 'A01:2021-Broken Access Control',
    suggestedFix: 'Remove directory traversal sequences and use absolute paths or validate paths are within allowed directories.'
  },
  {
    name: 'Unvalidated Path Parameter',
    category: 'input_validation',
    patterns: [
      /Request\.(?:Query|Form|Params)\[['"]\w*(?:path|file|dir|folder|name)\w*['"]\]/gi,
      /req\.(?:query|body|params)\.(?:\w*path\w*|\w*file\w*|\w*dir\w*)/gi
    ],
    severity: 'high',
    description: 'File path taken directly from user input without validation',
    cweId: 'CWE-22',
    owaspCategory: 'A01:2021-Broken Access Control',
    suggestedFix: 'Validate user-supplied paths against an allowlist or use indirect references (IDs) instead of direct paths.'
  }
];

/**
 * Command injection patterns
 */
const COMMAND_INJECTION_PATTERNS: InjectionPattern[] = [
  {
    name: 'Shell Command Execution',
    category: 'injection',
    patterns: [
      /Process\.Start\s*\([^)]*\+[^)]*\)/gi,
      /Runtime\.getRuntime\(\)\.exec\s*\([^)]*\+[^)]*\)/gi,
      /child_process\.(?:exec|execSync|spawn)\s*\([^)]*\+[^)]*\)/gi,
      /os\.system\s*\([^)]*\+[^)]*\)/gi,
      /subprocess\.(?:run|call|Popen)\s*\([^)]*\+[^)]*\)/gi,
      /eval\s*\([^)]*\+[^)]*\)/gi,
      /exec\s*\([^)]*\+[^)]*\)/gi
    ],
    severity: 'critical',
    description: 'User input concatenated with shell command may allow command injection',
    cweId: 'CWE-78',
    owaspCategory: 'A03:2021-Injection',
    suggestedFix: 'Never concatenate user input into shell commands. Use parameterized APIs or escape shell metacharacters.'
  },
  {
    name: 'Dangerous Shell Functions',
    category: 'injection',
    patterns: [
      /system\s*\(/gi,
      /popen\s*\(/gi,
      /shell_exec\s*\(/gi,
      /passthru\s*\(/gi
    ],
    severity: 'high',
    description: 'Usage of dangerous shell execution function',
    cweId: 'CWE-78',
    owaspCategory: 'A03:2021-Injection',
    suggestedFix: 'Avoid shell execution functions. Use language-native APIs when possible.'
  }
];

/**
 * SQL injection patterns (mechanical - basic detection)
 */
const SQL_INJECTION_PATTERNS: InjectionPattern[] = [
  {
    name: 'SQL String Concatenation',
    category: 'injection',
    patterns: [
      /(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)[^;]*\+[^;]*(?:Request|req\.|input|param)/gi,
      /['"](?:SELECT|INSERT|UPDATE|DELETE)\s[^'"]*['"]\s*\+/gi,
      /\.(?:Execute|Query|ExecuteReader|ExecuteNonQuery)\s*\([^)]*\+[^)]*\)/gi,
      /sql\s*[=+]\s*['"][^'"]*['"]\s*\+/gi
    ],
    severity: 'critical',
    description: 'SQL query built with string concatenation may be vulnerable to SQL injection',
    cweId: 'CWE-89',
    owaspCategory: 'A03:2021-Injection',
    suggestedFix: 'Use parameterized queries or prepared statements instead of string concatenation.'
  },
  {
    name: 'Dynamic SQL',
    category: 'injection',
    patterns: [
      /EXECUTE\s*\(\s*@/gi,
      /sp_executesql/gi,
      /exec\s*\(\s*@/gi
    ],
    severity: 'high',
    description: 'Dynamic SQL execution may be vulnerable if parameters are not properly validated',
    cweId: 'CWE-89',
    owaspCategory: 'A03:2021-Injection',
    suggestedFix: 'Ensure all parameters in dynamic SQL are properly parameterized.'
  }
];

/**
 * XSS patterns
 */
const XSS_PATTERNS: InjectionPattern[] = [
  {
    name: 'InnerHTML Assignment',
    category: 'injection',
    patterns: [
      /\.innerHTML\s*=/gi,
      /\.outerHTML\s*=/gi,
      /document\.write\s*\(/gi,
      /document\.writeln\s*\(/gi
    ],
    severity: 'high',
    description: 'Direct HTML injection may allow XSS attacks',
    cweId: 'CWE-79',
    owaspCategory: 'A03:2021-Injection',
    suggestedFix: 'Use textContent instead of innerHTML, or sanitize HTML with a library like DOMPurify.'
  },
  {
    name: 'Dangerous React Pattern',
    category: 'injection',
    patterns: [
      /dangerouslySetInnerHTML/gi
    ],
    severity: 'high',
    description: 'dangerouslySetInnerHTML bypasses React XSS protection',
    cweId: 'CWE-79',
    owaspCategory: 'A03:2021-Injection',
    suggestedFix: 'Avoid dangerouslySetInnerHTML. If necessary, sanitize content with DOMPurify first.'
  },
  {
    name: 'Eval Usage',
    category: 'injection',
    patterns: [
      /\beval\s*\(/gi,
      /new\s+Function\s*\(/gi,
      /setTimeout\s*\(\s*['"][^'"]+['"]/gi,
      /setInterval\s*\(\s*['"][^'"]+['"]/gi
    ],
    severity: 'high',
    description: 'eval() and similar functions can execute arbitrary code',
    cweId: 'CWE-95',
    owaspCategory: 'A03:2021-Injection',
    suggestedFix: 'Avoid eval() and dynamic code execution. Use JSON.parse() for JSON data.'
  }
];

/**
 * All injection patterns combined
 */
const ALL_INJECTION_PATTERNS: InjectionPattern[] = [
  ...PATH_TRAVERSAL_PATTERNS,
  ...COMMAND_INJECTION_PATTERNS,
  ...SQL_INJECTION_PATTERNS,
  ...XSS_PATTERNS
];

/**
 * Injection Scanner class
 */
export class InjectionScanner {
  private _patterns: InjectionPattern[];

  constructor() {
    this._patterns = ALL_INJECTION_PATTERNS;
  }

  /**
   * Scan a single file for injection vulnerabilities
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

      // Check each injection pattern
      for (const injectionPattern of this._patterns) {
        for (const pattern of injectionPattern.patterns) {
          // Reset regex lastIndex
          pattern.lastIndex = 0;

          let match;
          while ((match = pattern.exec(line)) !== null) {
            findings.push(this._createFinding(
              injectionPattern,
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
    const include = options.include || '**/*.{ts,js,jsx,tsx,cs,java,py,php,rb}';
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
        console.warn(`InjectionScanner: Could not read ${file.fsPath}:`, error);
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
    pattern: InjectionPattern,
    file: string,
    line: number,
    match: string,
    column: number
  ): SecurityFinding {
    return {
      id: `injection-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      category: pattern.category,
      severity: pattern.severity,
      scanType: 'mechanical',
      file,
      line,
      column: column + 1,
      endColumn: column + match.length + 1,
      title: pattern.name,
      description: pattern.description,
      evidence: match.length > 100 ? match.substring(0, 100) + '...' : match,
      cweId: pattern.cweId,
      owaspCategory: pattern.owaspCategory,
      suggestedFix: pattern.suggestedFix,
      fixDifficulty: 'moderate',
      falsePositiveRisk: 'medium',
      ruleId: `injection-scanner-${pattern.name.toLowerCase().replace(/\s+/g, '-')}`,
      ruleName: pattern.name,
      detectedAt: Date.now()
    };
  }
}

/**
 * Singleton instance
 */
let _injectionScanner: InjectionScanner | null = null;

export function getInjectionScanner(): InjectionScanner {
  if (!_injectionScanner) {
    _injectionScanner = new InjectionScanner();
  }
  return _injectionScanner;
}
