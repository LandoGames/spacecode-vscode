/**
 * Prompt Templates Service
 *
 * Manages reusable prompt templates for common tasks
 */

import * as vscode from 'vscode';

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  category: 'code-review' | 'debugging' | 'refactoring' | 'documentation' | 'general' | 'custom';
  prompt: string;
  variables?: string[]; // e.g., ['code', 'language', 'context']
  provider?: 'claude' | 'gpt' | 'both';
  isBuiltIn: boolean;
}

const BUILT_IN_TEMPLATES: PromptTemplate[] = [
  {
    id: 'code-review-thorough',
    name: 'Thorough Code Review',
    description: 'Comprehensive code review covering all aspects',
    category: 'code-review',
    prompt: `Please perform a thorough code review of the following {{language}} code:

\`\`\`{{language}}
{{code}}
\`\`\`

Review the following aspects:
1. **Correctness**: Are there any bugs or logical errors?
2. **Performance**: Any performance concerns or optimization opportunities?
3. **Security**: Any security vulnerabilities (injection, XSS, etc.)?
4. **Readability**: Is the code easy to understand? Naming conventions?
5. **Maintainability**: Is it modular? Easy to extend?
6. **Best Practices**: Does it follow language idioms and conventions?
7. **Edge Cases**: Are edge cases handled properly?

Provide specific, actionable feedback with code examples where helpful.`,
    variables: ['code', 'language'],
    provider: 'both',
    isBuiltIn: true,
  },
  {
    id: 'code-review-quick',
    name: 'Quick Code Review',
    description: 'Fast review focusing on critical issues',
    category: 'code-review',
    prompt: `Quick review of this {{language}} code. Focus only on critical issues:

\`\`\`{{language}}
{{code}}
\`\`\`

List only:
- Bugs that would cause failures
- Security vulnerabilities
- Major performance issues

Be concise. Skip style suggestions.`,
    variables: ['code', 'language'],
    provider: 'both',
    isBuiltIn: true,
  },
  {
    id: 'debug-error',
    name: 'Debug Error',
    description: 'Help debug an error message',
    category: 'debugging',
    prompt: `I'm getting this error:

\`\`\`
{{error}}
\`\`\`

In this {{language}} code:

\`\`\`{{language}}
{{code}}
\`\`\`

{{context}}

Please:
1. Explain what's causing the error
2. Provide the fix
3. Explain why the fix works`,
    variables: ['error', 'code', 'language', 'context'],
    provider: 'both',
    isBuiltIn: true,
  },
  {
    id: 'refactor-clean',
    name: 'Clean Code Refactor',
    description: 'Refactor for better readability and maintainability',
    category: 'refactoring',
    prompt: `Please refactor this {{language}} code for better readability and maintainability:

\`\`\`{{language}}
{{code}}
\`\`\`

Goals:
- Improve naming (variables, functions)
- Extract functions where appropriate
- Reduce complexity
- Follow {{language}} best practices
- Keep the same functionality

Show the refactored code and explain the key changes.`,
    variables: ['code', 'language'],
    provider: 'both',
    isBuiltIn: true,
  },
  {
    id: 'refactor-performance',
    name: 'Performance Refactor',
    description: 'Optimize code for better performance',
    category: 'refactoring',
    prompt: `Please optimize this {{language}} code for performance:

\`\`\`{{language}}
{{code}}
\`\`\`

Context: {{context}}

Focus on:
- Algorithm efficiency (time complexity)
- Memory usage (space complexity)
- Caching opportunities
- Language-specific optimizations

Explain the performance impact of each change.`,
    variables: ['code', 'language', 'context'],
    provider: 'both',
    isBuiltIn: true,
  },
  {
    id: 'add-documentation',
    name: 'Add Documentation',
    description: 'Generate documentation for code',
    category: 'documentation',
    prompt: `Add comprehensive documentation to this {{language}} code:

\`\`\`{{language}}
{{code}}
\`\`\`

Include:
- File/module header comment
- Function/method docstrings with parameters, returns, and examples
- Inline comments for complex logic
- Type hints/annotations if applicable

Use the standard documentation format for {{language}}.`,
    variables: ['code', 'language'],
    provider: 'both',
    isBuiltIn: true,
  },
  {
    id: 'explain-code',
    name: 'Explain Code',
    description: 'Get a detailed explanation of how code works',
    category: 'general',
    prompt: `Please explain this {{language}} code in detail:

\`\`\`{{language}}
{{code}}
\`\`\`

Cover:
1. What the code does (high-level purpose)
2. How it works (step by step)
3. Key concepts or patterns used
4. Any non-obvious behavior

Assume I'm familiar with {{language}} basics but new to this codebase.`,
    variables: ['code', 'language'],
    provider: 'both',
    isBuiltIn: true,
  },
  {
    id: 'write-tests',
    name: 'Write Unit Tests',
    description: 'Generate unit tests for code',
    category: 'general',
    prompt: `Write unit tests for this {{language}} code:

\`\`\`{{language}}
{{code}}
\`\`\`

Requirements:
- Use {{testFramework}} testing framework
- Cover happy path and edge cases
- Include both positive and negative test cases
- Mock external dependencies
- Follow AAA pattern (Arrange, Act, Assert)

Generate the complete test file.`,
    variables: ['code', 'language', 'testFramework'],
    provider: 'both',
    isBuiltIn: true,
  },
  {
    id: 'unity-review',
    name: 'Unity Code Review',
    description: 'Review Unity/C# code for game-specific issues',
    category: 'code-review',
    prompt: `Review this Unity C# code for game development best practices:

\`\`\`csharp
{{code}}
\`\`\`

Check for:
1. **Performance**: Update vs FixedUpdate usage, GetComponent calls, memory allocations
2. **Unity Patterns**: Proper MonoBehaviour lifecycle, serialization, coroutines
3. **Game Logic**: State management, timing issues, race conditions
4. **Physics**: Proper physics handling, collision detection
5. **Memory**: Object pooling needs, garbage collection concerns
6. **Editor**: SerializeField usage, proper inspector exposure

Provide Unity-specific recommendations.`,
    variables: ['code'],
    provider: 'both',
    isBuiltIn: true,
  },
  {
    id: 'ai-debate-setup',
    name: 'AI Debate Topic',
    description: 'Set up a debate between Claude and GPT',
    category: 'general',
    prompt: `Topic for AI debate: {{topic}}

This is a technical debate about software development practices.
One AI will argue in favor, one against.
Keep arguments focused, evidence-based, and constructive.`,
    variables: ['topic'],
    provider: 'both',
    isBuiltIn: true,
  },
];

export class TemplateService {
  private customTemplates: PromptTemplate[] = [];
  private context: vscode.ExtensionContext | null = null;
  private readonly STORAGE_KEY = 'spacecode.customTemplates';

  async initialize(context: vscode.ExtensionContext): Promise<void> {
    this.context = context;
    await this.loadCustomTemplates();
  }

  private async loadCustomTemplates(): Promise<void> {
    if (!this.context) { return; }

    const stored = this.context.globalState.get<PromptTemplate[]>(this.STORAGE_KEY);
    if (stored) {
      this.customTemplates = stored;
    }
  }

  private async saveCustomTemplates(): Promise<void> {
    if (!this.context) { return; }
    await this.context.globalState.update(this.STORAGE_KEY, this.customTemplates);
  }

  getAllTemplates(): PromptTemplate[] {
    return [...BUILT_IN_TEMPLATES, ...this.customTemplates];
  }

  getBuiltInTemplates(): PromptTemplate[] {
    return [...BUILT_IN_TEMPLATES];
  }

  getCustomTemplates(): PromptTemplate[] {
    return [...this.customTemplates];
  }

  getTemplatesByCategory(category: PromptTemplate['category']): PromptTemplate[] {
    return this.getAllTemplates().filter(t => t.category === category);
  }

  getTemplateById(id: string): PromptTemplate | undefined {
    return this.getAllTemplates().find(t => t.id === id);
  }

  async addCustomTemplate(template: Omit<PromptTemplate, 'id' | 'isBuiltIn'>): Promise<PromptTemplate> {
    const newTemplate: PromptTemplate = {
      ...template,
      id: `custom-${Date.now()}`,
      isBuiltIn: false,
    };

    this.customTemplates.push(newTemplate);
    await this.saveCustomTemplates();

    return newTemplate;
  }

  async updateCustomTemplate(id: string, updates: Partial<PromptTemplate>): Promise<void> {
    const index = this.customTemplates.findIndex(t => t.id === id);
    if (index === -1) {
      throw new Error('Template not found');
    }

    this.customTemplates[index] = {
      ...this.customTemplates[index],
      ...updates,
      id, // Prevent ID change
      isBuiltIn: false, // Prevent becoming built-in
    };

    await this.saveCustomTemplates();
  }

  async deleteCustomTemplate(id: string): Promise<void> {
    const index = this.customTemplates.findIndex(t => t.id === id);
    if (index === -1) {
      throw new Error('Template not found');
    }

    this.customTemplates.splice(index, 1);
    await this.saveCustomTemplates();
  }

  /**
   * Fill in template variables
   */
  applyTemplate(template: PromptTemplate, variables: Record<string, string>): string {
    let prompt = template.prompt;

    for (const [key, value] of Object.entries(variables)) {
      const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      prompt = prompt.replace(pattern, value);
    }

    // Remove any unfilled variables
    prompt = prompt.replace(/\{\{[^}]+\}\}/g, '');

    return prompt;
  }

  /**
   * Show quick pick to select a template
   */
  async selectTemplate(): Promise<PromptTemplate | undefined> {
    const templates = this.getAllTemplates();

    const items = templates.map(t => ({
      label: t.name,
      description: t.category,
      detail: t.description,
      template: t,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      title: 'Select a Prompt Template',
      placeHolder: 'Search templates...',
    });

    return selected?.template;
  }

  /**
   * Prompt user to fill in template variables
   */
  async fillTemplateVariables(
    template: PromptTemplate,
    prefilledCode?: string
  ): Promise<Record<string, string> | undefined> {
    const variables: Record<string, string> = {};

    if (!template.variables || template.variables.length === 0) {
      return variables;
    }

    for (const varName of template.variables) {
      // Skip 'code' if prefilled
      if (varName === 'code' && prefilledCode) {
        variables.code = prefilledCode;
        continue;
      }

      // Detect language from active editor if not provided
      if (varName === 'language' && !variables.language) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          variables.language = editor.document.languageId;
          continue;
        }
      }

      const value = await vscode.window.showInputBox({
        title: `Enter value for: ${varName}`,
        prompt: `Template variable: {{${varName}}}`,
        placeHolder: varName === 'testFramework' ? 'jest, pytest, nunit, etc.' : undefined,
      });

      if (value === undefined) {
        return undefined; // User cancelled
      }

      variables[varName] = value;
    }

    return variables;
  }
}
