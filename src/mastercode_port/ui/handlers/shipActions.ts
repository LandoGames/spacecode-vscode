// @ts-nocheck

import * as vscode from 'vscode';
import { HotspotToolPanel } from '../hotspotToolPanel';

export async function handleShipActionsMessage(panel: any, message: any): Promise<boolean> {
  switch (message.type) {
    case 'shipGetContextPack': {
      const profile = (message.profile === 'yard' || message.profile === 'scout' || message.profile === 'battleship')
        ? message.profile
        : panel._shipProfile;

      let detectedSector = null;
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor && activeEditor.document.uri.scheme === 'file') {
        const filePath = activeEditor.document.uri.fsPath;
        detectedSector = panel.sectorManager.detectSector(filePath);
      }

      const sector = detectedSector || panel.sectorManager.getSector(panel._shipSectorId);
      const sectorId = sector?.id || panel._shipSectorId;
      const sectorName = sector?.name || sectorId.toUpperCase();
      const sectorRules = sector?.rules || 'No specific rules - experimental zone.';
      const dependencies = sector?.dependencies || [];
      const docTarget = sector?.docTarget || 'None';

      const sectorContext = {
        sectorId,
        sectorName,
        rules: sectorRules,
        dependencies,
        docTarget
      };

      try {
        panel._gatheredContext = await panel.contextGatherer.gather({
          sectorContext,
          maxSize: 50 * 1024,
          maxRecentFiles: 5,
          maxAssemblyFiles: 10,
          maxDependencies: 5,
          includeActiveContent: true
        });

        panel._contextPreviewText = panel._gatheredContext.injectionText;

        panel._postMessage({
          type: 'shipContextPack',
          sectorId,
          profile,
          injectionText: panel._gatheredContext.previewText,
          contextDetails: {
            totalSize: panel._gatheredContext.totalSize,
            activeFile: panel._gatheredContext.activeFile ? {
              fileName: panel._gatheredContext.activeFile.fileName,
              relativePath: panel._gatheredContext.activeFile.relativePath,
              lineCount: panel._gatheredContext.activeFile.lineCount,
              className: panel._gatheredContext.activeFile.className,
              namespace: panel._gatheredContext.activeFile.namespace
            } : null,
            recentFilesCount: panel._gatheredContext.recentFiles.length,
            assemblyFilesCount: panel._gatheredContext.assemblyFiles.length,
            dependenciesCount: panel._gatheredContext.dependencies.length,
            assemblyName: panel._gatheredContext.assemblyInfo?.name
          }
        });
      } catch (error) {
        panel._postMessage({ type: 'error', message: 'Failed to gather context pack.' });
      }
      return true;
    }

    case 'shipRunGates':
      await panel._runGatesCheck();
      return true;

    case 'shipDocsStatus':
      await panel._checkDocsStatus();
      return true;

    case 'openHotspotTool': {
      if (!HotspotToolPanel.currentPanel) {
        await HotspotToolPanel.createOrShow(panel._extensionUri, message.sceneId);
      } else {
        HotspotToolPanel.currentPanel._setScene(message.sceneId);
      }
      return true;
    }

    case 'stationAction':
      await panel._handleStationAction(message.action, message.sceneId);
      return true;

    default:
      return false;
  }
}
