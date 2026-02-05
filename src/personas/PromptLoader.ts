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
const delegatedRoleCache: Map<string, string> = new Map();

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
  delegatedRoleCache.clear();
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

/**
 * Load a delegated role's system prompt.
 * Delegated roles have their own .system.md files.
 */
export function getDelegatedRolePrompt(roleId: string): string {
  const roleCache = delegatedRoleCache.get(roleId);
  if (roleCache) return roleCache;

  const srcPath = path.join(extensionRoot, 'src', 'personas', 'prompts', `${roleId}.system.md`);
  const outPath = path.join(extensionRoot, 'out', 'personas', 'prompts', `${roleId}.system.md`);

  let content: string;
  try {
    if (fs.existsSync(srcPath)) {
      content = fs.readFileSync(srcPath, 'utf-8').trim();
    } else {
      content = fs.readFileSync(outPath, 'utf-8').trim();
    }
  } catch {
    content = getDelegatedRoleFallback(roleId);
  }

  delegatedRoleCache.set(roleId, content);
  return content;
}

function getDelegatedRoleFallback(roleId: string): string {
  const fallbacks: Record<string, string> = {
    'architect': 'As the project Architect, analyze the current codebase structure and provide recommendations for long-term architecture improvements, cross-cutting concerns, and feature planning.',
    'modularity-lead': 'As the Modularity Lead, analyze sector boundaries, dependency hygiene, and identify any coupling issues or duplication that should be addressed.',
    'verifier': 'As the Verifier, run quality gates, check test coverage, review compliance, and verify that sector policies are enforced correctly.',
    'doc-officer': 'As the Doc Officer, review documentation freshness, identify stale or missing docs, and suggest updates needed to match recent code changes.',
    'planner': 'As the Planner, break down the current work into tasks, assess priorities, and recommend the optimal sequence for addressing pending items.',
    'release-captain': 'As the Release Captain, assess release readiness, check versioning, review changelog completeness, and identify any blocking issues.',
  };
  return fallbacks[roleId] || `Analyze the project from the perspective of the ${roleId} role.`;
}

function getFallbackPrompt(personaId: AgentId): string {
  const fallbacks: Record<AgentId, string> = {
    'lead-engineer': 'You are the Lead Engineer. You help with code generation, planning, refactoring, and code review. Be proactive, solution-oriented, and explain trade-offs clearly.',
    'qa-engineer': 'You are the QA Engineer. You specialize in debugging, testing, code quality, security, and maintenance. Be methodical and safety-first.',
    'technical-writer': 'You are the Technical Writer. You specialize in documentation — GDD, SA, TDD, and other project docs. Help create, update, and sync documentation.',
    'issue-triager': 'You are the Issue Triager. You analyze and route issues. Route bugs to QA Engineer, features to Lead Engineer, documentation tasks to Technical Writer.',
    'database-engineer': 'You are the Database Engineer. You specialize in database design, queries, migrations, and API design.',
    'art-director': 'You are the Art Director. You specialize in visual design, style guides, asset management, and image generation.',
  };
  return fallbacks[personaId] || fallbacks['lead-engineer'];
}
