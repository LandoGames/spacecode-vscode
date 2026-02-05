// @ts-nocheck

export async function handleKbMessage(panel: any, message: any): Promise<boolean> {
  switch (message.type) {
    case 'getKbEntries':
      await panel._sendKbEntries();
      return true;

    case 'kbAddUrl':
      await panel._addKbUrl(message.url, message.tags || []);
      return true;

    case 'kbCrawlWebsite':
      await panel._crawlWebsite(message.url, message.options || {});
      return true;

    case 'kbRemove':
      try {
        await panel.knowledgeBase.removeEntry(message.id);
        await panel._sendKbEntries();
      } catch (e) {
        console.error('[SpaceCode] KB remove error:', e);
      }
      return true;

    case 'kbAddPdf':
      await panel._addKbPdf(message.base64Data || message.filePath, message.fileName || '', message.tags || []);
      return true;

    case 'kbGetEmbedderStatus':
      await panel._sendEmbedderStatus();
      return true;

    case 'kbDownloadModel':
      await panel._downloadEmbeddingModel();
      return true;

    case 'kbSetModel':
      await panel._setEmbeddingModel(message.modelId);
      return true;

    case 'kbEmbedEntry':
      await panel._embedEntry(message.id);
      return true;

    case 'kbEmbedAll':
      await panel._embedAllEntries();
      return true;

    default:
      return false;
  }
}
