// @ts-nocheck

import * as vscode from 'vscode';
import * as path from 'path';
import { AIProvider } from '../../providers/base';
import { PlanGenerator, PLAN_TEMPLATES, Plan, PlanGenerationResult } from '../../../planning';

export function createPlansImpl(panel: any) {
  function getWorkspaceRelativePath(filePath: string): string {
    const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceDir) return filePath;
    return path.relative(workspaceDir, filePath).replace(/\\/g, '/');
  }

  function getPlanProvider(providerId: 'claude' | 'gpt'): AIProvider | null {
    const preferred = providerId === 'gpt'
      ? panel.orchestrator.getGptProvider()
      : panel.orchestrator.getClaudeProvider();
    if (preferred?.isConfigured) return preferred;
    const fallback = providerId === 'gpt'
      ? panel.orchestrator.getClaudeProvider()
      : panel.orchestrator.getGptProvider();
    if (fallback?.isConfigured) return fallback;
    return null;
  }

  function extractExpectedFiles(plan: Plan): string[] {
    const files = new Set<string>();
    for (const phase of plan.phases) {
      for (const step of phase.steps) {
        for (const file of step.files || []) {
          files.add(file.replace(/\\/g, '/'));
        }
      }
    }
    return Array.from(files);
  }

  async function sendPlanTemplates(): Promise<void> {
    panel._postMessage({ type: 'planTemplates', templates: PLAN_TEMPLATES });
  }

  async function sendPlanList(): Promise<void> {
    const plans = panel.planStorage.getRecentPlans(20);
    panel._postMessage({ type: 'planList', plans });
  }

  async function sendPlanById(planId: string): Promise<void> {
    const plan = panel.planStorage.loadPlan(planId);
    panel._postMessage({ type: 'planLoaded', plan: plan || null });
  }

  async function deletePlan(planId: string): Promise<void> {
    await panel.planStorage.deletePlan(planId);
    await sendPlanList();
  }

  async function savePlan(plan: Plan, action: 'created' | 'approved' | 'executed' | 'verified' | 'failed' | 'cancelled' = 'created'): Promise<void> {
    await panel.planStorage.savePlan(plan);
    await panel.planStorage.addHistoryEntry({
      planId: plan.id,
      action,
      timestamp: Date.now(),
    });
    await sendPlanList();
  }

  async function usePlanForComparison(planId: string): Promise<void> {
    const plan = panel.planStorage.loadPlan(planId);
    if (!plan) {
      panel._postMessage({ type: 'planError', error: 'Plan not found' });
      return;
    }
    const expectedFiles = extractExpectedFiles(plan);
    panel.setCurrentPlan({ expectedFiles });
    panel._postMessage({
      type: 'status',
      status: { message: `Plan set for comparison (${expectedFiles.length} files)` }
    });
  }

  async function generatePlanFromIntent(
    intent: string,
    providerId: 'claude' | 'gpt',
    templateId?: string,
    templateVariables?: Record<string, string>
  ): Promise<void> {
    const provider = getPlanProvider(providerId);
    if (!provider) {
      panel._postMessage({ type: 'planError', error: 'No configured AI provider available for plan generation.' });
      return;
    }

    const generator = new PlanGenerator(provider);
    const editor = vscode.window.activeTextEditor;
    const currentFile = editor ? getWorkspaceRelativePath(editor.document.fileName) : undefined;

    const request = {
      intent,
      currentSector: panel._shipSectorId,
      currentFile,
      contextPack: panel._contextPreviewText || undefined
    };

    let result: PlanGenerationResult;
    if (templateId) {
      result = await generator.generateFromTemplate(templateId, templateVariables || {}, { provider: providerId });
    } else {
      result = await generator.generatePlan(request, { provider: providerId, includeDocumentation: panel._shipProfile !== 'yard' });
    }

    if (!result.success || !result.plan) {
      panel._postMessage({ type: 'planError', error: result.error || 'Plan generation failed' });
      return;
    }

    await savePlan(result.plan, 'created');
    panel._postMessage({ type: 'planGenerated', plan: result.plan });
  }

  async function runAIReview(diff: string): Promise<void> {
    if (!diff || diff.length === 0) {
      panel._postMessage({
        type: 'aiReviewResult',
        result: { error: 'No diff content to review' }
      });
      return;
    }

    try {
      const maxDiffSize = 15000;
      const truncatedDiff = diff.length > maxDiffSize
        ? diff.substring(0, maxDiffSize) + '\n\n... (diff truncated for review) ...'
        : diff;

      const reviewPrompt = `You are a code reviewer. Analyze this git diff and identify any issues.\n\nReturn your analysis as JSON with this structure:\n{\n  \"issues\": [\n    {\n      \"severity\": \"error\" | \"warning\" | \"info\",\n      \"title\": \"Short title\",\n      \"description\": \"Detailed description\",\n      \"file\": \"filename (optional)\",\n      \"line\": 123 (optional)\n    }\n  ],\n  \"summary\": \"One sentence summary of the overall quality\"\n}\n\nFocus on:\n- Bugs and logic errors\n- Security vulnerabilities\n- Style inconsistencies\n- Missing error handling\n- Performance issues\n\nGit Diff:\n\n\`\`\`diff\n${truncatedDiff}\n\`\`\`\n\nReturn ONLY the JSON, no markdown or explanation.`;

      const aiResponse = await panel.orchestrator.askSingle(
        'claude',
        reviewPrompt,
        'You are a code review assistant. Respond only with valid JSON.'
      );
      const response = aiResponse.content;

      let result;
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
        } else {
          result = { issues: [], summary: response.substring(0, 200) };
        }
      } catch (parseErr) {
        result = {
          issues: [],
          summary: 'AI review completed but response could not be parsed.',
          rawResponse: response.substring(0, 500)
        };
      }

      panel._postMessage({
        type: 'aiReviewResult',
        result
      });
    } catch (err) {
      console.error('AI review error:', err);
      panel._postMessage({
        type: 'aiReviewResult',
        result: { error: err instanceof Error ? err.message : 'AI review failed' }
      });
    }
  }

  return {
    getWorkspaceRelativePath,
    getPlanProvider,
    extractExpectedFiles,
    sendPlanTemplates,
    sendPlanList,
    sendPlanById,
    deletePlan,
    savePlan,
    usePlanForComparison,
    generatePlanFromIntent,
    runAIReview,
  };
}
