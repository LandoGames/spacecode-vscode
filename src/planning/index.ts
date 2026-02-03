/**
 * Planning Module - Stub index
 * Re-exports types and provides stub implementations
 */

import * as vscode from 'vscode';
export { Plan, PlanGenerationResult, PlanTemplate } from './types';
import { Plan, PlanGenerationResult, PlanTemplate } from './types';
import { AIProvider } from '../mastercode_port/providers/base';

export const PLAN_TEMPLATES: PlanTemplate[] = [];

export class PlanGenerator {
  constructor(private provider: AIProvider) {}
  async generate(intent: string, options?: any): Promise<PlanGenerationResult> {
    return { success: false, error: 'PlanGenerator not yet implemented' };
  }
}

export class PlanStorage {
  constructor(private context: vscode.ExtensionContext) {}
  async save(plan: Plan): Promise<void> {}
  async load(planId: string): Promise<Plan | undefined> { return undefined; }
  async list(): Promise<Plan[]> { return []; }
  async delete(planId: string): Promise<void> {}
}
