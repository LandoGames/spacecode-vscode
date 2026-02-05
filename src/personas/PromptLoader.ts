// @ts-nocheck

import * as fs from 'fs';
import * as path from 'path';
import { AgentId } from '../agents/types';

/**
 * Loads and caches persona system prompts from .system.md files.
 * Prompt files live in src/personas/prompts/<id>.system.md
 * At runtime, they're resolved relative to the extension root.
 */

const cache: Map<AgentId, string> = new Map();

let extensionRoot: string = '';

/**
 * Set the extension root directory (call once at activation).
 */
export function initPromptLoader(extRoot: string): void {
  extensionRoot = extRoot;
  cache.clear();
}

/**
 * Load a persona's system prompt.
 * Returns the prompt text, or a fallback if the file is missing.
 */
export function getPersonaPrompt(personaId: AgentId): string {
  if (cache.has(personaId)) {
    return cache.get(personaId)!;
  }

  const promptPath = resolvePromptPath(personaId);
  let content: string;

  try {
    content = fs.readFileSync(promptPath, 'utf-8').trim();
  } catch {
    console.warn(`[PersonaPrompt] No prompt file for "${personaId}" at ${promptPath}, using fallback`);
    content = getFallbackPrompt(personaId);
  }

  cache.set(personaId, content);
  return content;
}

/**
 * Clear the prompt cache (e.g., after editing prompt files).
 */
export function clearPromptCache(): void {
  cache.clear();
}

function resolvePromptPath(personaId: AgentId): string {
  // In development: source files are in src/personas/prompts/
  // In production: they should be bundled or copied to out/personas/prompts/
  const srcPath = path.join(extensionRoot, 'src', 'personas', 'prompts', `${personaId}.system.md`);
  if (fs.existsSync(srcPath)) {
    return srcPath;
  }
  // Fallback to dist/out location
  return path.join(extensionRoot, 'out', 'personas', 'prompts', `${personaId}.system.md`);
}

function getFallbackPrompt(personaId: AgentId): string {
  const fallbacks: Record<AgentId, string> = {
    nova: 'You are Nova, the Lead Engineer. You help with code generation, planning, refactoring, and code review. Be proactive, solution-oriented, and explain trade-offs clearly.',
    gears: 'You are Gears, the Station Engineer. You specialize in debugging, testing, code quality, security, and maintenance. Be methodical and safety-first.',
    index: 'You are Index, the Librarian. You specialize in documentation — GDD, SA, TDD, and other project docs. Help create, update, and sync documentation.',
    triage: 'You are Triage, the Ticket Bot. You analyze and route issues. Route bugs to Gears, features to Nova, documentation tasks to Index.',
    vault: 'You are Vault, the Database Engineer. You specialize in database design, queries, migrations, and API design.',
    palette: 'You are Palette, the Art Director. You specialize in visual design, style guides, asset management, and image generation.',
  };
  return fallbacks[personaId] || fallbacks.nova;
}
