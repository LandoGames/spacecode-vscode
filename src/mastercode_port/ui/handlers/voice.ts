// @ts-nocheck

export async function handleVoiceMessage(panel: any, message: any): Promise<boolean> {
  switch (message.type) {
    case 'getVoiceSettings':
      panel._sendVoiceSettings();
      return true;

    case 'saveVoiceSettings':
      await panel._saveVoiceSettings(message.settings);
      return true;

    case 'downloadVoiceModel':
      await panel._downloadVoiceModel(message.engine, message.model);
      return true;

    case 'downloadWhisperBinary':
      await panel._downloadWhisperBinary();
      return true;

    case 'startMicTest':
      panel._startMicTest();
      return true;

    case 'stopMicTest':
      panel._stopMicTest();
      return true;

    case 'testSpeaker':
      panel._testSpeaker();
      return true;

    default:
      return false;
  }
}
