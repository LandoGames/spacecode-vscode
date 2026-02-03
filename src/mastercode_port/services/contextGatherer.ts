/**
 * Context Gatherer Service
 *
 * Automatically gathers relevant context about what the developer is working on
 * and prepares it for injection into AI prompts.
 *
 * Designed for Unity C# projects but works with any project type.
 */

import * as vscode from 'vscode';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface GatheredContext {
  /** Total size in bytes */
  totalSize: number;
  /** Timestamp when gathered */
  timestamp: number;
  /** Active file info */
  activeFile: FileContext | null;
  /** Recently edited files */
  recentFiles: FileContext[];
  /** Files in same assembly */
  assemblyFiles: FileContext[];
  /** Dependencies from using statements */
  dependencies: FileContext[];
  /** Assembly definition info */
  assemblyInfo: AssemblyInfo | null;
  /** Sector context (from SpaceCode) */
  sectorContext: SectorContext | null;
  /** Formatted preview text */
  previewText: string;
  /** Full injection text for AI prompts */
  injectionText: string;
}

export interface FileContext {
  /** Relative path from workspace */
  relativePath: string;
  /** Absolute path */
  absolutePath: string;
  /** File name */
  fileName: string;
  /** File extension */
  extension: string;
  /** Full content (may be truncated) */
  content: string;
  /** Line count */
  lineCount: number;
  /** Character count */
  charCount: number;
  /** Whether content was truncated */
  truncated: boolean;
  /** For C# files: namespace */
  namespace?: string;
  /** For C# files: class/struct name */
  className?: string;
  /** For C# files: base class */
  baseClass?: string;
  /** For C# files: using statements */
  usings?: string[];
  /** For C# files: is MonoBehaviour */
  isMonoBehaviour?: boolean;
  /** Priority score for inclusion */
  priority: number;
}

export interface AssemblyInfo {
  /** Name of the assembly */
  name: string;
  /** Path to .asmdef file */
  asmdefPath: string;
  /** Referenced assemblies */
  references: string[];
  /** Root folder of this assembly */
  rootFolder: string;
  /** All script files in this assembly */
  scriptCount: number;
}

export interface SectorContext {
  sectorId: string;
  sectorName: string;
  rules: string;
  dependencies: string[];
  docTarget: string;
}

export interface GatherOptions {
  /** Maximum total context size in bytes (default: 50KB) */
  maxSize?: number;
  /** Maximum number of recent files to include (default: 5) */
  maxRecentFiles?: number;
  /** Maximum number of assembly files to include summaries for (default: 10) */
  maxAssemblyFiles?: number;
  /** Maximum number of dependency files to include (default: 5) */
  maxDependencies?: number;
  /** Include full content of active file (default: true) */
  includeActiveContent?: boolean;
  /** Sector context to include */
  sectorContext?: SectorContext;
}

// ============================================================================
// Context Gatherer Class
// ============================================================================

export class ContextGatherer {
  private cache: Map<string, { context: GatheredContext; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 30000; // 30 seconds
  private readonly DEFAULT_MAX_SIZE = 50 * 1024; // 50KB

  /**
   * Gather context from the current workspace
   */
  async gather(options: GatherOptions = {}): Promise<GatheredContext> {
    const maxSize = options.maxSize ?? this.DEFAULT_MAX_SIZE;
    const maxRecentFiles = options.maxRecentFiles ?? 5;
    const maxAssemblyFiles = options.maxAssemblyFiles ?? 10;
    const maxDependencies = options.maxDependencies ?? 5;
    const includeActiveContent = options.includeActiveContent ?? true;

    // Get active editor, or fall back to first visible text editor
    // (handles case when webview panel has focus but code file is visible)
    let activeEditor = vscode.window.activeTextEditor;

    if (!activeEditor) {
      // No active text editor - try visible text editors
      const visibleEditors = vscode.window.visibleTextEditors.filter(
        e => e.document.uri.scheme === 'file'
      );
      if (visibleEditors.length > 0) {
        activeEditor = visibleEditors[0];
      }
    }

    const activeFile = activeEditor
      ? await this.analyzeFile(activeEditor.document.uri, includeActiveContent)
      : null;

    // Get recently edited files
    const recentFiles = await this.getRecentFiles(maxRecentFiles, activeFile?.absolutePath);

    // For C# files, get assembly info and related files
    let assemblyInfo: AssemblyInfo | null = null;
    let assemblyFiles: FileContext[] = [];
    let dependencies: FileContext[] = [];

    if (activeFile && activeFile.extension === '.cs') {
      // Find assembly definition
      assemblyInfo = await this.findAssemblyInfo(activeFile.absolutePath);

      if (assemblyInfo) {
        // Get other files in same assembly
        assemblyFiles = await this.getAssemblyFiles(
          assemblyInfo,
          maxAssemblyFiles,
          activeFile.absolutePath
        );
      }

      // Find dependencies from using statements
      if (activeFile.usings && activeFile.usings.length > 0) {
        dependencies = await this.findDependencyFiles(
          activeFile.usings,
          maxDependencies,
          activeFile.absolutePath
        );
      }
    }

    // Build the context with smart truncation
    const context = this.buildContext(
      activeFile,
      recentFiles,
      assemblyFiles,
      dependencies,
      assemblyInfo,
      options.sectorContext || null,
      maxSize
    );

    return context;
  }

  /**
   * Analyze a single file
   */
  private async analyzeFile(uri: vscode.Uri, includeFullContent: boolean): Promise<FileContext | null> {
    try {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
      const relativePath = workspaceFolder
        ? path.relative(workspaceFolder.uri.fsPath, uri.fsPath)
        : path.basename(uri.fsPath);

      // Read file content
      const document = await vscode.workspace.openTextDocument(uri);
      const content = document.getText();
      const lineCount = document.lineCount;

      const fileContext: FileContext = {
        relativePath,
        absolutePath: uri.fsPath,
        fileName: path.basename(uri.fsPath),
        extension: path.extname(uri.fsPath),
        content: includeFullContent ? content : this.extractSignature(content, path.extname(uri.fsPath)),
        lineCount,
        charCount: content.length,
        truncated: false,
        priority: 100 // Active file gets highest priority
      };

      // For C# files, extract additional metadata
      if (fileContext.extension === '.cs') {
        this.analyzeCSharpFile(fileContext, content);
      }

      return fileContext;
    } catch (error) {
      console.error(`Failed to analyze file ${uri.fsPath}:`, error);
      return null;
    }
  }

  /**
   * Analyze C# file for namespace, class, usings, etc.
   */
  private analyzeCSharpFile(fileContext: FileContext, content: string): void {
    // Extract namespace
    const namespaceMatch = content.match(/namespace\s+([\w.]+)/);
    if (namespaceMatch) {
      fileContext.namespace = namespaceMatch[1];
    }

    // Extract class/struct name and base class
    const classMatch = content.match(/(?:public|internal|private)?\s*(?:partial\s+)?(?:class|struct)\s+(\w+)(?:\s*:\s*(\w+))?/);
    if (classMatch) {
      fileContext.className = classMatch[1];
      fileContext.baseClass = classMatch[2];
      fileContext.isMonoBehaviour = classMatch[2] === 'MonoBehaviour' ||
        classMatch[2] === 'ScriptableObject' ||
        classMatch[2] === 'NetworkBehaviour';
    }

    // Extract using statements
    const usings: string[] = [];
    const usingRegex = /using\s+([\w.]+);/g;
    let match;
    while ((match = usingRegex.exec(content)) !== null) {
      usings.push(match[1]);
    }
    fileContext.usings = usings;
  }

  /**
   * Get recently edited files from visible editors and open documents
   */
  private async getRecentFiles(maxCount: number, excludePath?: string): Promise<FileContext[]> {
    const files: FileContext[] = [];
    const seen = new Set<string>();

    if (excludePath) {
      seen.add(excludePath);
    }

    // First, add visible editors (they're likely relevant)
    for (const editor of vscode.window.visibleTextEditors) {
      if (seen.has(editor.document.uri.fsPath)) continue;
      if (editor.document.uri.scheme !== 'file') continue;

      seen.add(editor.document.uri.fsPath);
      const fileContext = await this.analyzeFile(editor.document.uri, false);
      if (fileContext) {
        fileContext.priority = 80; // Visible editors get high priority
        files.push(fileContext);
      }
    }

    // Then add open documents
    for (const doc of vscode.workspace.textDocuments) {
      if (seen.has(doc.uri.fsPath)) continue;
      if (doc.uri.scheme !== 'file') continue;
      if (doc.isUntitled) continue;

      seen.add(doc.uri.fsPath);
      const fileContext = await this.analyzeFile(doc.uri, false);
      if (fileContext) {
        fileContext.priority = 60; // Open documents get medium priority
        files.push(fileContext);
      }
    }

    // Sort by priority and limit
    return files
      .sort((a, b) => b.priority - a.priority)
      .slice(0, maxCount);
  }

  /**
   * Find the assembly definition (.asmdef) for a given file
   */
  private async findAssemblyInfo(filePath: string): Promise<AssemblyInfo | null> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return null;

    // Walk up the directory tree looking for .asmdef
    let currentDir = path.dirname(filePath);
    const workspaceRoot = workspaceFolder.uri.fsPath;

    while (currentDir.startsWith(workspaceRoot)) {
      try {
        const asmdefFiles = await vscode.workspace.findFiles(
          new vscode.RelativePattern(currentDir, '*.asmdef'),
          null,
          1
        );

        if (asmdefFiles.length > 0) {
          const asmdefPath = asmdefFiles[0].fsPath;
          const asmdefContent = await vscode.workspace.fs.readFile(asmdefFiles[0]);
          const asmdef = JSON.parse(Buffer.from(asmdefContent).toString('utf8'));

          // Count scripts in this assembly folder
          const scripts = await vscode.workspace.findFiles(
            new vscode.RelativePattern(currentDir, '**/*.cs'),
            '**/Editor/**'
          );

          return {
            name: asmdef.name || path.basename(asmdefPath, '.asmdef'),
            asmdefPath,
            references: asmdef.references || [],
            rootFolder: currentDir,
            scriptCount: scripts.length
          };
        }
      } catch (error) {
        // Continue searching up
      }

      // Move up one directory
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) break; // Reached root
      currentDir = parentDir;
    }

    return null;
  }

  /**
   * Get other files in the same assembly
   */
  private async getAssemblyFiles(
    assemblyInfo: AssemblyInfo,
    maxCount: number,
    excludePath: string
  ): Promise<FileContext[]> {
    const files: FileContext[] = [];

    try {
      const scripts = await vscode.workspace.findFiles(
        new vscode.RelativePattern(assemblyInfo.rootFolder, '**/*.cs'),
        '**/Editor/**',
        maxCount + 10 // Get a few extra to filter
      );

      for (const script of scripts) {
        if (script.fsPath === excludePath) continue;
        if (files.length >= maxCount) break;

        const fileContext = await this.analyzeFile(script, false);
        if (fileContext) {
          fileContext.priority = 40; // Same assembly files get lower priority
          files.push(fileContext);
        }
      }
    } catch (error) {
      console.error('Failed to get assembly files:', error);
    }

    return files;
  }

  /**
   * Find files that match using statements
   */
  private async findDependencyFiles(
    usings: string[],
    maxCount: number,
    excludePath: string
  ): Promise<FileContext[]> {
    const files: FileContext[] = [];
    const seen = new Set<string>([excludePath]);

    // Filter to project-specific namespaces (not Unity/System)
    const projectUsings = usings.filter(u =>
      !u.startsWith('System') &&
      !u.startsWith('Unity') &&
      !u.startsWith('UnityEngine') &&
      !u.startsWith('UnityEditor') &&
      !u.startsWith('TMPro') &&
      !u.startsWith('Cinemachine')
    );

    for (const ns of projectUsings) {
      if (files.length >= maxCount) break;

      // Try to find files matching this namespace
      // Convert namespace to potential file patterns
      const parts = ns.split('.');
      const className = parts[parts.length - 1];

      try {
        // Search for files with matching class name
        const matches = await vscode.workspace.findFiles(
          `**/${className}.cs`,
          '**/Packages/**',
          3
        );

        for (const match of matches) {
          if (seen.has(match.fsPath)) continue;
          if (files.length >= maxCount) break;

          seen.add(match.fsPath);
          const fileContext = await this.analyzeFile(match, false);
          if (fileContext) {
            // Verify namespace matches
            if (fileContext.namespace === ns || ns.endsWith(fileContext.className || '')) {
              fileContext.priority = 50; // Dependencies get medium-low priority
              files.push(fileContext);
            }
          }
        }
      } catch (error) {
        // Continue with next using
      }
    }

    return files;
  }

  /**
   * Extract a signature/summary from file content
   */
  private extractSignature(content: string, extension: string): string {
    if (extension === '.cs') {
      return this.extractCSharpSignature(content);
    }

    // For other files, just take first 50 lines
    const lines = content.split('\n');
    const truncated = lines.slice(0, 50).join('\n');
    return truncated + (lines.length > 50 ? '\n// ... (truncated)' : '');
  }

  /**
   * Extract C# class signature (fields, properties, methods without bodies)
   */
  private extractCSharpSignature(content: string): string {
    const lines = content.split('\n');
    const signature: string[] = [];
    let inMethod = false;
    let braceDepth = 0;

    for (const line of lines) {
      const trimmed = line.trim();

      // Always include using statements, namespace, class declarations
      if (trimmed.startsWith('using ') ||
          trimmed.startsWith('namespace ') ||
          trimmed.match(/^(public|private|protected|internal)?\s*(partial\s+)?(class|struct|interface|enum)\s+/)) {
        signature.push(line);
        continue;
      }

      // Track brace depth
      const openBraces = (line.match(/{/g) || []).length;
      const closeBraces = (line.match(/}/g) || []).length;

      // Include field and property declarations
      if (braceDepth <= 2 && !inMethod) {
        if (trimmed.match(/^(public|private|protected|internal|static|readonly|const)\s+/) ||
            trimmed.match(/^\[.*\]/) || // Attributes
            trimmed === '{' || trimmed === '}') {
          signature.push(line);
        }
      }

      // Check for method start
      if (trimmed.match(/^(public|private|protected|internal|static|virtual|override|async)\s+.*\(.*\)\s*{?\s*$/)) {
        signature.push(line.replace(/\s*{?\s*$/, ';')); // Replace body with semicolon
        inMethod = true;
      }

      braceDepth += openBraces - closeBraces;

      if (inMethod && braceDepth <= 2) {
        inMethod = false;
      }
    }

    return signature.join('\n') + '\n// ... (implementation details omitted)';
  }

  /**
   * Build the final context with smart truncation
   */
  private buildContext(
    activeFile: FileContext | null,
    recentFiles: FileContext[],
    assemblyFiles: FileContext[],
    dependencies: FileContext[],
    assemblyInfo: AssemblyInfo | null,
    sectorContext: SectorContext | null,
    maxSize: number
  ): GatheredContext {
    let totalSize = 0;
    const sections: string[] = [];

    // Build preview text (human readable)
    const previewLines: string[] = ['Context Pack (auto-gathered):', ''];

    // Active file (always include full content if available)
    if (activeFile) {
      previewLines.push('=== ACTIVE FILE ===');
      previewLines.push(`${activeFile.fileName} (${path.dirname(activeFile.relativePath)})`);
      if (activeFile.namespace) {
        previewLines.push(`Namespace: ${activeFile.namespace}`);
      }
      if (activeFile.className) {
        previewLines.push(`Class: ${activeFile.className}${activeFile.baseClass ? ` : ${activeFile.baseClass}` : ''}`);
      }
      if (assemblyInfo) {
        previewLines.push(`Assembly: ${assemblyInfo.name}`);
      }
      previewLines.push(`Lines: ${activeFile.lineCount}`);
      previewLines.push('');

      sections.push(`=== ACTIVE FILE: ${activeFile.relativePath} ===`);
      sections.push(activeFile.content);
      sections.push('');
      totalSize += activeFile.content.length;
    }

    // Recent files
    if (recentFiles.length > 0) {
      previewLines.push('=== RECENT FILES ===');
      for (const file of recentFiles) {
        previewLines.push(`- ${file.fileName} (${file.lineCount} lines)`);
      }
      previewLines.push('');

      sections.push('=== RECENT FILES (signatures) ===');
      for (const file of recentFiles) {
        if (totalSize + file.content.length > maxSize * 0.7) {
          sections.push(`// ${file.relativePath} - ${file.lineCount} lines (omitted due to size)`);
        } else {
          sections.push(`// --- ${file.relativePath} ---`);
          sections.push(file.content);
          totalSize += file.content.length;
        }
      }
      sections.push('');
    }

    // Assembly files
    if (assemblyFiles.length > 0 && assemblyInfo) {
      previewLines.push(`=== RELATED FILES (${assemblyInfo.name}) ===`);
      for (const file of assemblyFiles) {
        const classInfo = file.className ? ` [${file.className}]` : '';
        previewLines.push(`- ${file.fileName}${classInfo} (${file.lineCount} lines)`);
      }
      previewLines.push('');

      sections.push(`=== ASSEMBLY FILES (${assemblyInfo.name}) ===`);
      for (const file of assemblyFiles) {
        if (totalSize + file.content.length > maxSize * 0.85) {
          sections.push(`// ${file.relativePath} - ${file.lineCount} lines (omitted due to size)`);
        } else {
          sections.push(`// --- ${file.relativePath} ---`);
          sections.push(file.content);
          totalSize += file.content.length;
        }
      }
      sections.push('');
    }

    // Dependencies
    if (dependencies.length > 0) {
      previewLines.push('=== DEPENDENCIES ===');
      for (const file of dependencies) {
        const nsInfo = file.namespace ? ` (${file.namespace})` : '';
        previewLines.push(`- ${file.fileName}${nsInfo}`);
      }
      previewLines.push('');

      sections.push('=== DEPENDENCIES ===');
      for (const file of dependencies) {
        if (totalSize + file.content.length > maxSize * 0.95) {
          sections.push(`// ${file.relativePath} (omitted due to size)`);
        } else {
          sections.push(`// --- ${file.relativePath} ---`);
          sections.push(file.content);
          totalSize += file.content.length;
        }
      }
      sections.push('');
    }

    // Assembly info
    if (assemblyInfo) {
      previewLines.push('=== ASSEMBLY INFO ===');
      previewLines.push(`${assemblyInfo.name}.asmdef`);
      if (assemblyInfo.references.length > 0) {
        previewLines.push(`References: ${assemblyInfo.references.slice(0, 5).join(', ')}${assemblyInfo.references.length > 5 ? '...' : ''}`);
      }
      previewLines.push(`Scripts: ${assemblyInfo.scriptCount} files`);
      previewLines.push('');

      sections.push('=== ASSEMBLY INFO ===');
      sections.push(`Assembly: ${assemblyInfo.name}`);
      sections.push(`Path: ${assemblyInfo.asmdefPath}`);
      sections.push(`Scripts: ${assemblyInfo.scriptCount}`);
      if (assemblyInfo.references.length > 0) {
        sections.push(`References: ${assemblyInfo.references.join(', ')}`);
      }
      sections.push('');
    }

    // Sector context
    if (sectorContext) {
      previewLines.push('=== SECTOR CONTEXT ===');
      previewLines.push(`Sector: ${sectorContext.sectorName}`);
      if (sectorContext.dependencies.length > 0) {
        previewLines.push(`Dependencies: ${sectorContext.dependencies.join(', ')}`);
      }
      previewLines.push('');

      sections.push('=== SECTOR RULES ===');
      sections.push(sectorContext.rules);
      sections.push('');
    }

    // Size summary
    const sizeKB = (totalSize / 1024).toFixed(1);
    previewLines.push(`Total context: ${sizeKB}KB (will be included in AI prompts)`);

    const previewText = previewLines.join('\n');
    const injectionText = sections.join('\n');

    return {
      totalSize,
      timestamp: Date.now(),
      activeFile,
      recentFiles,
      assemblyFiles,
      dependencies,
      assemblyInfo,
      sectorContext,
      previewText,
      injectionText
    };
  }

  /**
   * Get cached context if still valid
   */
  getCached(key: string): GatheredContext | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.context;
    }
    return null;
  }

  /**
   * Cache gathered context
   */
  setCache(key: string, context: GatheredContext): void {
    this.cache.set(key, { context, timestamp: Date.now() });
  }

  /**
   * Clear all cached context
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// Singleton instance
let contextGatherer: ContextGatherer | null = null;

export function getContextGatherer(): ContextGatherer {
  if (!contextGatherer) {
    contextGatherer = new ContextGatherer();
  }
  return contextGatherer;
}
