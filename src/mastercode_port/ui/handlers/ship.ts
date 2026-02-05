// @ts-nocheck

export async function handleShipMessage(panel: any, message: any): Promise<boolean> {
  switch (message.type) {
    case 'shipSelectSector':
      if (typeof message.sectorId === 'string') {
        panel._shipSectorId = message.sectorId;
      }
      if (message.profile === 'yard' || message.profile === 'scout' || message.profile === 'battleship') {
        panel._shipProfile = message.profile;
      }
      panel._postMessage({ type: 'shipSelected', sectorId: panel._shipSectorId, profile: panel._shipProfile });
      panel._scheduleContextPreviewSend();
      return true;

    case 'shipSetProfile':
      if (message.profile === 'yard' || message.profile === 'scout' || message.profile === 'battleship') {
        panel._shipProfile = message.profile;
        panel._postMessage({ type: 'shipSelected', sectorId: panel._shipSectorId, profile: panel._shipProfile });
        panel._scheduleContextPreviewSend();
      }
      return true;

    case 'shipToggleAutoexecute':
      panel._shipAutoexecute = !panel._shipAutoexecute;
      panel._autoexecuteEnabled = panel._shipAutoexecute;
      panel._postMessage({ type: 'shipAutoexecute', enabled: panel._shipAutoexecute });
      return true;

    default:
      return false;
  }
}
