import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export interface ModelOverrideEntry {
  input?: number;
  output?: number;
  contextWindow?: number;
  maxOutput?: number;
  sourceUrl?: string;
  updatedAt?: number;
}

export interface ModelOverridesFile {
  pricing: Record<string, ModelOverrideEntry>;
  updatedAt?: number;
}

function getWorkspaceRoot(): string | null {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  return folder || null;
}

function getOverridesPath(): string | null {
  const root = getWorkspaceRoot();
  if (!root) return null;
  return path.join(root, '.spacecode', 'model-overrides.json');
}

export function loadModelOverrides(): ModelOverridesFile {
  const filePath = getOverridesPath();
  if (!filePath) return { pricing: {} };
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return { pricing: {} };
    return { pricing: data.pricing || {}, updatedAt: data.updatedAt };
  } catch {
    return { pricing: {} };
  }
}

export function saveModelOverrides(overrides: ModelOverridesFile): void {
  const filePath = getOverridesPath();
  if (!filePath) return;
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const payload: ModelOverridesFile = {
    pricing: overrides.pricing || {},
    updatedAt: Date.now(),
  };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

export function updateModelOverride(modelId: string, entry: ModelOverrideEntry): ModelOverridesFile {
  const current = loadModelOverrides();
  current.pricing = current.pricing || {};
  current.pricing[modelId] = {
    ...(current.pricing[modelId] || {}),
    ...entry,
    updatedAt: Date.now(),
  };
  saveModelOverrides(current);
  return current;
}

export function parsePricingFromText(text: string): Pick<ModelOverrideEntry, 'input' | 'output' | 'contextWindow' | 'maxOutput'> {
  const inputMatch = text.match(/Input\s*\$\s*([0-9]+(?:\.[0-9]+)?)/i);
  const outputMatch = text.match(/Output\s*\$\s*([0-9]+(?:\.[0-9]+)?)/i);
  const contextMatch = text.match(/([0-9][0-9,]+)\s*context window/i);
  const maxOutMatch = text.match(/([0-9][0-9,]+)\s*max output/i);

  const input = inputMatch ? Number(inputMatch[1]) : undefined;
  const output = outputMatch ? Number(outputMatch[1]) : undefined;
  const contextWindow = contextMatch ? Number(contextMatch[1].replace(/,/g, '')) : undefined;
  const maxOutput = maxOutMatch ? Number(maxOutMatch[1].replace(/,/g, '')) : undefined;

  return { input, output, contextWindow, maxOutput };
}
