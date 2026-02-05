// @ts-nocheck

import * as vscode from 'vscode';

export async function handleAsmdefMessage(panel: any, message: any): Promise<boolean> {
  switch (message.type) {
    case 'asmdefInventory': {
      const inventory = await panel.asmdefGate.getInventory();
      const graph = await panel.asmdefGate.getGraph();
      const invRes = await panel.coordinatorClient.setAsmdefInventoryWithStatus(inventory);
      panel._coordinatorSyncStatus.inventory = invRes.ok ? 'ok' : (invRes.error || `http-${invRes.status}`);
      if (invRes.ok) panel._coordinatorSync.inventory = Date.now();

      if (inventory.policy) {
        const polRes = await panel.coordinatorClient.setAsmdefPolicyWithStatus(inventory.policy);
        panel._coordinatorSyncStatus.policy = polRes.ok ? 'ok' : (polRes.error || `http-${polRes.status}`);
        if (polRes.ok) panel._coordinatorSync.policy = Date.now();
      }

      const graphRes = await panel.coordinatorClient.setAsmdefGraphWithStatus(graph);
      panel._coordinatorSyncStatus.graph = graphRes.ok ? 'ok' : (graphRes.error || `http-${graphRes.status}`);
      if (graphRes.ok) panel._coordinatorSync.graph = Date.now();
      panel._postCoordinatorSync();
      panel._postMessage({ type: 'asmdefInventory', inventory });
      panel._postMessage({ type: 'asmdefGraph', graph });
      return true;
    }

    case 'asmdefGeneratePolicy': {
      const result = await panel.asmdefGate.generatePolicyDraft(false);
      const polRes = await panel.coordinatorClient.setAsmdefPolicyWithStatus(result.policy);
      panel._coordinatorSyncStatus.policy = polRes.ok ? 'ok' : (polRes.error || `http-${polRes.status}`);
      if (polRes.ok) panel._coordinatorSync.policy = Date.now();
      panel._postCoordinatorSync();
      panel._postMessage({ type: 'asmdefPolicyGenerated', policyPath: result.policyPath, policy: result.policy });
      return true;
    }

    case 'asmdefOpenPolicy': {
      const inv = await panel.asmdefGate.getInventory();
      if (inv.policyPath) {
        await panel._openFile(inv.policyPath);
      } else {
        const draft = await panel.asmdefGate.generatePolicyDraft(false);
        await panel._openFile(draft.policyPath);
      }
      return true;
    }

    case 'asmdefGetPolicy': {
      let inv = await panel.asmdefGate.getInventory();
      let policy = inv.policy || null;
      let policyPath = inv.policyPath;
      if (!policy) {
        const draft = await panel.asmdefGate.generatePolicyDraft(false);
        policy = draft.policy;
        policyPath = draft.policyPath;
        inv = await panel.asmdefGate.getInventory();
      }
      if (policy) {
        const policyText = JSON.stringify(policy, null, 2);
        panel._postMessage({ type: 'asmdefPolicy', policyText, policyPath });
      } else {
        panel._postMessage({ type: 'error', message: 'Asmdef policy not found.' });
      }
      return true;
    }

    case 'asmdefSavePolicy': {
      if (typeof message.text !== 'string') {
        panel._postMessage({ type: 'error', message: 'Policy text is missing.' });
        return true;
      }
      let policy: any = null;
      try {
        policy = JSON.parse(message.text);
      } catch (err: any) {
        panel._postMessage({ type: 'error', message: 'Policy JSON is invalid: ' + (err?.message || err) });
        return true;
      }
      if (!policy || typeof policy !== 'object' || typeof policy.entries !== 'object') {
        panel._postMessage({ type: 'error', message: 'Policy JSON must include an "entries" object.' });
        return true;
      }
      let inv = await panel.asmdefGate.getInventory();
      let policyPath = inv.policyPath;
      if (!policyPath) {
        const draft = await panel.asmdefGate.generatePolicyDraft(false);
        policyPath = draft.policyPath;
      }
      await vscode.workspace.fs.writeFile(vscode.Uri.file(policyPath), Buffer.from(JSON.stringify(policy, null, 2), 'utf8'));
      const polRes = await panel.coordinatorClient.setAsmdefPolicyWithStatus(policy);
      panel._coordinatorSyncStatus.policy = polRes.ok ? 'ok' : (polRes.error || `http-${polRes.status}`);
      if (polRes.ok) panel._coordinatorSync.policy = Date.now();
      panel._postCoordinatorSync();
      panel._postMessage({ type: 'asmdefPolicySaved', policyPath, policy });
      inv = await panel.asmdefGate.getInventory();
      panel._postMessage({ type: 'asmdefInventory', inventory: inv });
      return true;
    }

    case 'asmdefSetStrict': {
      const result = await panel.asmdefGate.setPolicyMode('strict');
      if (result?.policy) {
        const polRes = await panel.coordinatorClient.setAsmdefPolicyWithStatus(result.policy);
        panel._coordinatorSyncStatus.policy = polRes.ok ? 'ok' : (polRes.error || `http-${polRes.status}`);
        if (polRes.ok) panel._coordinatorSync.policy = Date.now();
        panel._postCoordinatorSync();
      }
      panel._postMessage({ type: 'asmdefPolicyMode', mode: 'strict', policyPath: result?.policyPath });
      return true;
    }

    case 'asmdefSetAdvisory': {
      const result = await panel.asmdefGate.setPolicyMode('advisory');
      if (result?.policy) {
        const polRes = await panel.coordinatorClient.setAsmdefPolicyWithStatus(result.policy);
        panel._coordinatorSyncStatus.policy = polRes.ok ? 'ok' : (polRes.error || `http-${polRes.status}`);
        if (polRes.ok) panel._coordinatorSync.policy = Date.now();
        panel._postCoordinatorSync();
      }
      panel._postMessage({ type: 'asmdefPolicyMode', mode: 'advisory', policyPath: result?.policyPath });
      return true;
    }

    case 'asmdefNormalizeGuids': {
      const result = await panel.asmdefGate.normalizePolicyGuids();
      const inventory = await panel.asmdefGate.getInventory();
      const graph = await panel.asmdefGate.getGraph();
      const invRes = await panel.coordinatorClient.setAsmdefInventoryWithStatus(inventory);
      panel._coordinatorSyncStatus.inventory = invRes.ok ? 'ok' : (invRes.error || `http-${invRes.status}`);
      if (invRes.ok) panel._coordinatorSync.inventory = Date.now();

      if (inventory.policy) {
        const polRes = await panel.coordinatorClient.setAsmdefPolicyWithStatus(inventory.policy);
        panel._coordinatorSyncStatus.policy = polRes.ok ? 'ok' : (polRes.error || `http-${polRes.status}`);
        if (polRes.ok) panel._coordinatorSync.policy = Date.now();
      }

      const graphRes = await panel.coordinatorClient.setAsmdefGraphWithStatus(graph);
      panel._coordinatorSyncStatus.graph = graphRes.ok ? 'ok' : (graphRes.error || `http-${graphRes.status}`);
      if (graphRes.ok) panel._coordinatorSync.graph = Date.now();
      panel._postCoordinatorSync();
      panel._postMessage({ type: 'asmdefGuidsNormalized', result });
      panel._postMessage({ type: 'asmdefGraph', graph });
      return true;
    }

    case 'asmdefGraph': {
      const graph = await panel.asmdefGate.getGraph();
      const graphRes = await panel.coordinatorClient.setAsmdefGraphWithStatus(graph);
      panel._coordinatorSyncStatus.graph = graphRes.ok ? 'ok' : (graphRes.error || `http-${graphRes.status}`);
      if (graphRes.ok) panel._coordinatorSync.graph = Date.now();
      panel._postCoordinatorSync();
      panel._postMessage({ type: 'asmdefGraph', graph });
      return true;
    }

    case 'sectorMapData': {
      // Build sector map data from SectorConfig + AsmdefGate
      const { getSectorManager } = await import('../../../sectors/SectorConfig');
      const sectorManager = getSectorManager();
      const allSectors = sectorManager.getAllSectors();

      // Try to get asmdef health data
      let checkResult = null;
      let inventory = null;
      try {
        checkResult = await panel.asmdefGate.check();
        inventory = await panel.asmdefGate.getInventory();
      } catch (_e) { /* no asmdef data available */ }

      // Build violation counts per sector
      const violationsBySector = new Map();
      if (checkResult && Array.isArray(checkResult.violations)) {
        for (const v of checkResult.violations) {
          const sectorId = v.sector || 'unknown';
          violationsBySector.set(sectorId, (violationsBySector.get(sectorId) || 0) + 1);
        }
      }

      // Build script counts per sector from inventory
      const scriptsBySector = new Map();
      if (inventory && Array.isArray(inventory.asmdefs)) {
        for (const a of inventory.asmdefs) {
          const sectorId = a.sector?.id || 'unknown';
          scriptsBySector.set(sectorId, (scriptsBySector.get(sectorId) || 0) + 1);
        }
      }

      // Compute health per sector
      const sectors = allSectors.map(s => {
        const violations = violationsBySector.get(s.id) || 0;
        const warnings = 0; // Could be computed from checkResult.warnings
        let health = 1.0;
        if (violations > 0) health = Math.max(0.1, 1.0 - violations * 0.15);
        else if (warnings > 0) health = Math.max(0.5, 1.0 - warnings * 0.05);

        return {
          id: s.id,
          name: s.name,
          tech: 'asmdef: ' + (s.name || s.id),
          color: s.color,
          health,
          deps: s.dependencies,
          icon: s.icon,
          scripts: scriptsBySector.get(s.id) || 0,
          violations,
          description: s.description,
        };
      });

      // Tier detection
      const hasSectorConfig = allSectors.length > 0;
      const hasAsmdef = !!(inventory && Array.isArray(inventory.asmdefs) && inventory.asmdefs.length > 0);
      let tier = 'empty';
      if (hasAsmdef && hasSectorConfig) tier = 'full';
      else if (hasSectorConfig) tier = 'mapped';

      // Overall project health (average)
      const avgHealth = sectors.length > 0
        ? sectors.reduce((sum, s) => sum + s.health, 0) / sectors.length
        : 1.0;

      // Circular dependency detection (DFS)
      const cycles: string[][] = [];
      const depsMap = new Map();
      for (const s of sectors) depsMap.set(s.id, s.deps || []);
      const visited = new Set();
      const stack = new Set();
      function dfs(nodeId: string, path: string[]) {
        if (stack.has(nodeId)) {
          const cycleStart = path.indexOf(nodeId);
          if (cycleStart >= 0) cycles.push(path.slice(cycleStart).concat(nodeId));
          return;
        }
        if (visited.has(nodeId)) return;
        visited.add(nodeId);
        stack.add(nodeId);
        for (const dep of (depsMap.get(nodeId) || [])) {
          dfs(dep, [...path, nodeId]);
        }
        stack.delete(nodeId);
      }
      for (const s of sectors) dfs(s.id, []);

      // Orphan file detection (files not in any sector)
      let orphanFileCount = 0;
      try {
        const csFiles = await vscode.workspace.findFiles('**/*.cs', '{**/Library/**,**/Temp/**,**/obj/**}', 500);
        for (const f of csFiles) {
          const detected = sectorManager.detectSector(f.fsPath);
          if (!detected || detected.id === 'yard') orphanFileCount++;
        }
      } catch (_e) { /* ignore */ }

      panel._postMessage({
        type: 'sectorMapData',
        sectors,
        hasAsmdef,
        tier,
        avgHealth,
        totalViolations: (checkResult ? (checkResult.violations || []).length : 0) + cycles.length,
        passed: checkResult ? checkResult.passed : null,
        cycles,
        orphanFileCount,
      });
      return true;
    }

    case 'asmdefOpen': {
      if (typeof message.path === 'string') {
        await panel._openFile(message.path);
      }
      return true;
    }

    case 'sectorOpenFolder': {
      const { getSectorManager: getSMgr } = await import('../../../sectors/SectorConfig');
      const smgr = getSMgr();
      const sec = smgr.getSector(message.sectorId);
      if (sec && sec.paths.length > 0) {
        // Extract directory name from first glob pattern (e.g. '**/Character/**' → 'Character')
        const pattern = sec.paths[0];
        const dirName = pattern.replace(/\*\*/g, '').replace(/\*/g, '').replace(/\//g, '').trim();
        if (dirName) {
          const found = await vscode.workspace.findFiles(`**/${dirName}/**/*.cs`, '{**/Library/**,**/Temp/**}', 1);
          if (found.length > 0) {
            const path = require('path');
            const folderUri = vscode.Uri.file(path.dirname(found[0].fsPath));
            await vscode.commands.executeCommand('revealInExplorer', folderUri);
          } else {
            vscode.window.showInformationMessage(`No files found in sector "${sec.name}" paths.`);
          }
        }
      }
      return true;
    }

    case 'sectorOpenAsmdef': {
      const inv = await panel.asmdefGate.getInventory();
      if (inv && Array.isArray(inv.asmdefs)) {
        const match = inv.asmdefs.find((a: any) => a.sector?.id === message.sectorId);
        if (match && match.path) {
          await panel._openFile(match.path);
        } else {
          vscode.window.showInformationMessage(`No asmdef found for sector "${message.sectorId}".`);
        }
      }
      return true;
    }

    case 'sectorMapClick': {
      // Drill-down: send sector detail back to webview (enriched with violations + scripts)
      const { getSectorManager: getSM } = await import('../../../sectors/SectorConfig');
      const sm = getSM();
      const sector = sm.getSector(message.sectorId);
      if (sector) {
        let sectorViolations: any[] = [];
        let scriptsCount = 0;
        let asmdefPath: string | null = null;
        try {
          const cr = await panel.asmdefGate.check();
          if (cr && Array.isArray(cr.violations)) {
            sectorViolations = cr.violations.filter(
              (v: any) => v.sectorId === message.sectorId || v.sector === message.sectorId
            );
          }
          const inv = await panel.asmdefGate.getInventory();
          if (inv && Array.isArray(inv.asmdefs)) {
            const sectorAsmdefs = inv.asmdefs.filter(
              (a: any) => a.sector?.id === message.sectorId
            );
            scriptsCount = sectorAsmdefs.length;
            if (sectorAsmdefs.length > 0) asmdefPath = sectorAsmdefs[0].path || null;
          }
        } catch (_e) { /* no asmdef data */ }

        panel._postMessage({
          type: 'sectorMapDetail',
          sector: {
            id: sector.id,
            name: sector.name,
            description: sector.description,
            icon: sector.icon,
            color: sector.color,
            dependencies: sector.dependencies,
            paths: sector.paths,
            approvalRequired: sector.approvalRequired,
            docTarget: sector.docTarget,
            violations: sectorViolations,
            scripts: scriptsCount,
            asmdefPath,
          },
        });
      }
      return true;
    }

    case 'asmdefValidate': {
      const result = await panel.asmdefGate.check();
      panel._postMessage({ type: 'asmdefCheckResult', result });
      return true;
    }

    case 'coordinatorHealth': {
      const health = await panel.coordinatorClient.health();
      const url =
        vscode.workspace.getConfiguration('spacecode').get<string>('coordinatorUrl', 'http://127.0.0.1:5510');
      panel._postMessage({ type: 'coordinatorHealth', ...health, url });
      return true;
    }

    default:
      return false;
  }
}
