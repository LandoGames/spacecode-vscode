// @ts-nocheck

export async function handleSenseiMessage(panel: any, message: any): Promise<boolean> {
  switch (message.type) {
    case 'senseiExplain':
      if (typeof message.filePath === 'string') {
        await panel._senseiExplain(message.filePath, message.selection);
      }
      return true;

    case 'senseiContextBrief':
      if (typeof message.filePath === 'string') {
        await panel._senseiContextBrief(message.filePath);
      }
      return true;

    case 'senseiAssemblyGraph':
      await panel._senseiAssemblyGraph(message.assemblyName);
      return true;

    case 'senseiSyncDocs':
      await panel._senseiSyncDocs(message.filePath, message.sectorId);
      return true;

    case 'senseiAIReview':
      await panel._senseiAIReview(message.filePath, message.diff);
      return true;

    case 'checkUnityMCPAvailable':
      await panel._checkUnityMCPAvailable();
      return true;

    default:
      return false;
  }
}
