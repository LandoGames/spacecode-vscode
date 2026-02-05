// @ts-nocheck

import * as vscode from 'vscode';

export function createVoiceImpl(panel: any) {
  function sendVoiceSettings(): void {
    const settings = panel.voiceService.getSettings();
    panel._postMessage({ type: 'voiceSettings', settings });
  }

  async function saveVoiceSettings(settings: any): Promise<void> {
    try {
      const updatedSettings = await panel.voiceService.updateSettings(settings);
      panel._postMessage({ type: 'voiceSettings', settings: updatedSettings });
    } catch (error) {
      panel._postMessage({
        type: 'error',
        message: `Failed to save voice settings: ${error}`
      });
    }
  }

  async function downloadVoiceModel(engine: 'whisper' | 'vosk' | 'piper', model?: string): Promise<void> {
    try {
      panel._postMessage({
        type: 'voiceDownloadProgress',
        engine,
        progress: 0,
        status: 'Starting download...'
      });

      const success = await panel.voiceService.downloadModel(engine, model);

      if (success) {
        sendVoiceSettings();
      }
    } catch (error) {
      panel._postMessage({
        type: 'voiceDownloadProgress',
        engine,
        progress: 0,
        status: `Error: ${error}`
      });
    }
  }

  function startMicTest(): void {
    panel._postMessage({
      type: 'micTestStatus',
      status: 'recording',
      message: 'Microphone test started. Audio capture will be implemented in Phase 3.'
    });
  }

  function stopMicTest(): void {
    panel._postMessage({
      type: 'micTestStatus',
      status: 'stopped',
      message: 'Microphone test stopped.'
    });
  }

  function testSpeaker(): void {
    panel._postMessage({
      type: 'speakerTestStatus',
      status: 'playing',
      message: 'Speaker test. TTS will be implemented in Phase 4.'
    });
    vscode.window.showInformationMessage('Speaker test: TTS functionality will play audio here once implemented.');
  }

  return {
    sendVoiceSettings,
    saveVoiceSettings,
    downloadVoiceModel,
    startMicTest,
    stopMicTest,
    testSpeaker,
  };
}
