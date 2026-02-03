/**
 * AI Reviewer
 *
 * Uses AI to review code changes for issues.
 */

import { AIProvider, AIMessage } from '../mastercode_port/providers/base';
import { DiffScanResult, ScannedFile } from './types';
import { AIReviewResult, ReviewIssue, ReviewCategory } from './types';

/**
 * System prompt for code review
 */
const CODE_REVIEW_SYSTEM_PROMPT = `You are an expert code reviewer analyzing Unity/C# game development code.

Your task is to review the provided code changes and identify potential issues.

REVIEW CATEGORIES:
- bug: Logic errors, null references, potential crashes
- security: Security vulnerabilities, exposed secrets, injection risks
- performance: Performance issues, memory leaks, unnecessary allocations
- style: Code style violations, naming conventions
- logic: Business logic problems, incorrect algorithms
- naming: Poor variable/method/class naming
- documentation: Missing or incorrect documentation
- testing: Testability issues, missing test coverage
- architecture: Architectural concerns, coupling issues

SEVERITY LEVELS:
- error: Must fix before merge
- warning: Should fix, but not blocking
- suggestion: Nice to have improvement
- info: FYI, no action required

OUTPUT FORMAT:
You must respond with valid JSON:
{
  "passed": boolean,
  "issues": [
    {
      "file": "path/to/file.cs",
      "line": 42,
      "severity": "error|warning|suggestion|info",
      "category": "bug|security|performance|style|logic|naming|documentation|testing|architecture",
      "message": "Description of the issue",
      "suggestion": "How to fix it (optional)"
    }
  ],
  "summary": "Brief overall assessment",
  "confidence": 0-100
}

RULES:
- Be specific about file and line numbers when possible
- Focus on actual issues, not style preferences unless severe
- Consider Unity/game development best practices
- Don't flag issues in deleted code
- Be concise but actionable`;

/**
 * Review depth options
 */
export type ReviewDepth = 'quick' | 'standard' | 'thorough';

/**
 * AI Reviewer class
 */
export class AIReviewer {
  private provider: AIProvider;

  constructor(provider: AIProvider) {
    this.provider = provider;
  }

  /**
   * Review code changes
   */
  async review(
    diff: DiffScanResult,
    options: {
      depth?: ReviewDepth;
      focusAreas?: ReviewCategory[];
      maxFiles?: number;
    } = {}
  ): Promise<AIReviewResult> {
    const startTime = Date.now();
    const { depth = 'standard', focusAreas, maxFiles = 20 } = options;

    // Filter and prepare files for review
    const filesToReview = this.selectFilesForReview(diff, maxFiles);

    if (filesToReview.length === 0) {
      return {
        passed: true,
        issues: [],
        summary: 'No code changes to review.',
        confidence: 100,
        tokensUsed: { input: 0, output: 0 },
        cost: 0,
        reviewTime: Date.now() - startTime
      };
    }

    // Build the review prompt
    const prompt = this.buildReviewPrompt(filesToReview, depth, focusAreas);

    // Call AI
    const messages: AIMessage[] = [
      { role: 'user', content: prompt }
    ];

    try {
      const response = await this.provider.sendMessage(messages, CODE_REVIEW_SYSTEM_PROMPT);

      // Parse response
      const result = this.parseResponse(response.content);

      return {
        ...result,
        tokensUsed: response.tokens,
        cost: response.cost,
        reviewTime: Date.now() - startTime
      };

    } catch (error) {
      return {
        passed: false,
        issues: [{
          id: 'review-error',
          file: '',
          severity: 'error',
          category: 'other',
          message: `AI review failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        summary: 'AI review encountered an error.',
        confidence: 0,
        tokensUsed: { input: 0, output: 0 },
        cost: 0,
        reviewTime: Date.now() - startTime
      };
    }
  }

  /**
   * Select files to review (prioritize important files)
   */
  private selectFilesForReview(diff: DiffScanResult, maxFiles: number): ScannedFile[] {
    // Filter out binary files
    let files = diff.files.filter(f => !f.isBinary);

    // Prioritize:
    // 1. Deleted files (need careful review)
    // 2. Large changes
    // 3. Core code files (.cs, .ts)
    files.sort((a, b) => {
      // Deleted files first
      if (a.status === 'deleted' && b.status !== 'deleted') return -1;
      if (b.status === 'deleted' && a.status !== 'deleted') return 1;

      // Then by change size
      const aSize = a.additions + a.deletions;
      const bSize = b.additions + b.deletions;
      return bSize - aSize;
    });

    return files.slice(0, maxFiles);
  }

  /**
   * Build review prompt
   */
  private buildReviewPrompt(
    files: ScannedFile[],
    depth: ReviewDepth,
    focusAreas?: ReviewCategory[]
  ): string {
    let prompt = `Please review the following code changes:\n\n`;

    // Add depth instructions
    switch (depth) {
      case 'quick':
        prompt += `This is a QUICK review. Focus only on critical issues (bugs, security).\n\n`;
        break;
      case 'thorough':
        prompt += `This is a THOROUGH review. Check all aspects including style, documentation, and architecture.\n\n`;
        break;
      default:
        prompt += `This is a STANDARD review. Focus on bugs, logic, and significant issues.\n\n`;
    }

    // Add focus areas if specified
    if (focusAreas && focusAreas.length > 0) {
      prompt += `Focus especially on: ${focusAreas.join(', ')}\n\n`;
    }

    // Add file diffs
    prompt += `FILES CHANGED:\n`;
    prompt += `${'='.repeat(50)}\n\n`;

    for (const file of files) {
      prompt += `FILE: ${file.path}\n`;
      prompt += `STATUS: ${file.status}\n`;
      prompt += `CHANGES: +${file.additions} -${file.deletions}\n`;

      if (file.hunks.length > 0) {
        prompt += `\nDIFF:\n`;
        for (const hunk of file.hunks) {
          prompt += `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\n`;
          prompt += `${hunk.content}\n`;
        }
      }

      prompt += `\n${'-'.repeat(50)}\n\n`;
    }

    prompt += `\nProvide your review in the JSON format specified.`;

    return prompt;
  }

  /**
   * Parse AI response into review result
   */
  private parseResponse(content: string): Omit<AIReviewResult, 'tokensUsed' | 'cost' | 'reviewTime'> {
    try {
      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const data = JSON.parse(jsonMatch[0]);

      // Validate and normalize issues
      const issues: ReviewIssue[] = (data.issues || []).map((issue: any, index: number) => ({
        id: `issue-${index}`,
        file: issue.file || '',
        line: issue.line,
        endLine: issue.endLine,
        column: issue.column,
        severity: this.validateSeverity(issue.severity),
        category: this.validateCategory(issue.category),
        message: issue.message || 'No description',
        suggestion: issue.suggestion,
        codeSnippet: issue.codeSnippet
      }));

      // Determine if passed
      const hasErrors = issues.some(i => i.severity === 'error');
      const passed = data.passed !== undefined ? data.passed : !hasErrors;

      return {
        passed,
        issues,
        summary: data.summary || 'Review completed.',
        confidence: typeof data.confidence === 'number' ? data.confidence : 80
      };

    } catch (error) {
      return {
        passed: false,
        issues: [{
          id: 'parse-error',
          file: '',
          severity: 'error',
          category: 'other',
          message: `Failed to parse review response: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        summary: 'Failed to parse AI review response.',
        confidence: 0
      };
    }
  }

  /**
   * Validate severity value
   */
  private validateSeverity(severity: string): 'error' | 'warning' | 'suggestion' | 'info' {
    const valid = ['error', 'warning', 'suggestion', 'info'];
    return valid.includes(severity) ? (severity as any) : 'warning';
  }

  /**
   * Validate category value
   */
  private validateCategory(category: string): ReviewCategory {
    const valid: ReviewCategory[] = [
      'bug', 'security', 'performance', 'style', 'logic',
      'naming', 'documentation', 'testing', 'architecture', 'other'
    ];
    return valid.includes(category as ReviewCategory) ? (category as ReviewCategory) : 'other';
  }

  /**
   * Update the AI provider
   */
  setProvider(provider: AIProvider): void {
    this.provider = provider;
  }

  /**
   * Quick review (only critical issues)
   */
  async quickReview(diff: DiffScanResult): Promise<AIReviewResult> {
    return this.review(diff, {
      depth: 'quick',
      focusAreas: ['bug', 'security'],
      maxFiles: 10
    });
  }

  /**
   * Security-focused review
   */
  async securityReview(diff: DiffScanResult): Promise<AIReviewResult> {
    return this.review(diff, {
      depth: 'thorough',
      focusAreas: ['security'],
      maxFiles: 50
    });
  }
}
