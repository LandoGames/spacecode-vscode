// @ts-nocheck

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function createAutoexecuteImpl(panel: any) {
  function loadJobs() {
    return panel._context.globalState.get('spacecode.autoexecuteJobs', []);
  }

  function saveJobs(jobs: any[]): void {
    panel._context.globalState.update('spacecode.autoexecuteJobs', jobs);
  }

  function enqueueJob(job: any, status: string = 'pending') {
    const jobs = loadJobs();
    const newJob = {
      ...job,
      status,
      created: Date.now()
    };
    jobs.unshift(newJob);
    saveJobs(jobs.slice(0, 50));
    panel._postMessage({ type: 'autoexecuteJobs', jobs });
    return newJob;
  }

  function updateJobStatus(jobId: string, status: string): void {
    const jobs = loadJobs().map(job => job.id === jobId ? { ...job, status } : job);
    saveJobs(jobs);
    panel._postMessage({ type: 'autoexecuteJobs', jobs });
  }

  function postJobList(): void {
    panel._postMessage({ type: 'autoexecuteJobs', jobs: loadJobs() });
  }

  function removeJob(jobId: string): void {
    const jobs = loadJobs().filter(job => job.id !== jobId);
    saveJobs(jobs);
    panel._postMessage({ type: 'autoexecuteJobs', jobs });
  }

  async function runApprovedJob(jobId: string): Promise<void> {
    const jobs = loadJobs();
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;
    try {
      switch (job.actionKey) {
        case 'shipRunGates':
          await runGatesCheck();
          break;
        case 'shipDocsStatus':
          await panel._checkDocsStatus();
          break;
        case 'mcpAction':
          await panel._handleMcpAction(job.payload?.action, job.payload?.serverId);
          break;
        case 'executeWorkflow':
          await panel._executeWorkflow(job.payload?.workflowId, job.payload?.input, job.payload?.drawflowData);
          break;
        case 'executePlan':
          await panel._executePlanFromJob(job.payload?.planId);
          break;
        default:
          throw new Error('Unknown actionKey ' + String(job.actionKey));
      }
      removeJob(jobId);
    } catch (err: any) {
      updateJobStatus(jobId, 'failed');
      panel._postMessage({
        type: 'autoexecuteBlocked',
        message: `Approved job failed: ${err?.message || err}`
      });
    }
  }

  async function runGatesCheck(): Promise<void> {
    try {
      let diffResult = await panel.diffScanner.scanAll();
      const excludePatterns = [/node_modules/, /\.git\//, /Library\//, /Temp\//, /obj\//, /bin\//, /\.meta$/];
      const MAX_FILES = 500;
      diffResult = {
        ...diffResult,
        files: diffResult.files
          .filter(f => !excludePatterns.some(p => p.test(f.path)))
          .slice(0, MAX_FILES)
      };
      diffResult.totalFiles = diffResult.files.length;
      if (diffResult.files.length === 0) {
        panel._postMessage({ type: 'shipGateResult', ok: true, summary: 'No changes detected (or all filtered).' });
        return;
      }
      const ruleResult = await panel.sectorRuleChecker.check(diffResult);
      const asmdefResult = await panel.asmdefGate.check();
      const violations = ruleResult.violations || [];
      const warnings = ruleResult.warnings || [];
      const errorCount = violations.filter(v => v.severity === 'error').length;
      const warningCount = violations.filter(v => v.severity === 'warning').length + warnings.length;
      let summary = `Checked ${diffResult.files.length} files in ${ruleResult.sectorsChecked.length} sector(s).\n`;
      if (errorCount > 0) {
        summary += `\n❌ ${errorCount} error(s):\n`;
        violations.filter(v => v.severity === 'error').forEach(v => { summary += `  • ${v.file}: ${v.message}\n`; });
      }
      if (warningCount > 0) {
        summary += `\n⚠️ ${warningCount} warning(s):\n`;
        violations.filter(v => v.severity === 'warning').forEach(v => { summary += `  • ${v.file}: ${v.message}\n`; });
        warnings.forEach(w => { summary += `  • ${w.sectorName}: ${w.message}\n`; });
      }
      if (errorCount === 0 && warningCount === 0) summary += '\n✅ All sector rules passed.';

      if (asmdefResult) {
        summary += `\n\n=== Asmdef Gate ===\n${asmdefResult.summary}`;
      }

      const ok = ruleResult.passed && (asmdefResult?.passed ?? true);
      panel._postMessage({
        type: 'shipGateResult',
        ok,
        summary,
        violations,
        warnings,
        sectorsChecked: ruleResult.sectorsChecked,
        asmdefResult
      });
    } catch (err: any) {
      panel._postMessage({ type: 'shipGateResult', ok: false, summary: `Gates check failed: ${err?.message || err}` });
    }
  }

  async function checkDocsStatus(): Promise<void> {
    try {
      let diffResult = await panel.diffScanner.scanAll();
      const excludePatterns = [/node_modules/, /\.git\//, /Library\//, /Temp\//, /obj\//, /bin\//, /\.meta$/];
      diffResult = {
        ...diffResult,
        files: diffResult.files.filter(f => !excludePatterns.some(p => p.test(f.path)))
      };
      const affectedSectors = panel.sectorRuleChecker.getAffectedSectors(diffResult);
      const docsNeeded = [] as Array<{ sector: string; docTarget: string }>;
      const docsOk: string[] = [];
      const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
      for (const sector of affectedSectors) {
        if (sector.docTarget) {
          const docPath = path.join(workspaceDir, 'Docs', sector.docTarget);
          if (fs.existsSync(docPath)) docsOk.push(sector.name);
          else docsNeeded.push({ sector: sector.name, docTarget: sector.docTarget });
        }
      }
      let summary = `Checked docs for ${affectedSectors.length} affected sector(s).\n`;
      if (docsNeeded.length > 0) {
        summary += `\n📝 Docs needed:\n`;
        docsNeeded.forEach(d => { summary += `  • ${d.sector}: ${d.docTarget}\n`; });
      }
      if (docsOk.length > 0) summary += `\n✅ Docs exist for: ${docsOk.join(', ')}`;
      if (affectedSectors.length === 0) summary = 'No sectors affected by current changes.';
      panel._postMessage({ type: 'shipDocsStatus', summary, docsNeeded, docsOk, affectedSectors: affectedSectors.map(s => s.name) });
    } catch (err: any) {
      panel._postMessage({ type: 'shipDocsStatus', summary: `Docs check failed: ${err?.message || err}` });
    }
  }

  return {
    loadJobs,
    saveJobs,
    enqueueJob,
    updateJobStatus,
    postJobList,
    removeJob,
    runApprovedJob,
    runGatesCheck,
    checkDocsStatus,
  };
}
