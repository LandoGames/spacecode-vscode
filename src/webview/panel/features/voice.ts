// @ts-nocheck

export function createVoicePanelHandlers(deps) {
  const { vscode } = deps;

  function loadVoiceSettings(settings) {
    if (!settings) return;
    const modelSelect = document.getElementById('whisperModelSelect');
    if (modelSelect && settings.whisperModel) modelSelect.value = settings.whisperModel;

    if (settings.whisperInstalled) {
      const el = document.getElementById('whisperStatus');
      const ind = document.getElementById('whisperStatusIndicator');
      const btn = document.getElementById('whisperDownloadBtn');
      if (el) el.textContent = 'Installed';
      if (ind) ind.style.background = '#4ade80';
      if (btn) { btn.textContent = '✓ Installed'; btn.disabled = true; }
    }
    if (settings.whisperBinaryInstalled) {
      const el = document.getElementById('whisperBinaryStatus');
      const ind = document.getElementById('whisperBinaryStatusIndicator');
      const btn = document.getElementById('whisperBinaryDownloadBtn');
      if (el) el.textContent = 'Installed';
      if (ind) ind.style.background = '#4ade80';
      if (btn) { btn.textContent = '✓ Installed'; btn.disabled = true; }
    }
  }

  function downloadWhisperModel() {
    const modelSelect = document.getElementById('whisperModelSelect');
    vscode.postMessage({ type: 'downloadVoiceModel', engine: 'whisper', model: modelSelect ? modelSelect.value : 'small' });
    const btn = document.getElementById('whisperDownloadBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Downloading...'; }
  }

  function downloadWhisperBinary() {
    vscode.postMessage({ type: 'downloadWhisperBinary' });
    const btn = document.getElementById('whisperBinaryDownloadBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Downloading...'; }
  }

  function saveVoiceSettings() {
    const modelSelect = document.getElementById('whisperModelSelect');
    vscode.postMessage({ type: 'saveVoiceSettings', settings: { whisperModel: modelSelect ? modelSelect.value : 'small' } });
  }

  function testMicrophone() {
    vscode.postMessage({ type: 'startMicTest' });
    const result = document.getElementById('voiceTestResult');
    if (result) { result.style.display = 'block'; result.textContent = 'Testing microphone...'; }
  }

  function testSpeaker() {
    vscode.postMessage({ type: 'testSpeaker' });
    const result = document.getElementById('voiceTestResult');
    if (result) { result.style.display = 'block'; result.textContent = 'Playing test sound...'; }
  }

  function updateVoiceDownloadProgress(engine, progress, status) {
    const statusEl = document.querySelector('#' + engine + 'Option .voice-status-text');
    const indicator = document.querySelector('#' + engine + 'Option .voice-status-indicator');
    const btn = document.querySelector('#' + engine + 'DownloadBtn');

    if (statusEl) statusEl.textContent = status;

    if (indicator) {
      if (progress > 0 && progress < 100) {
        indicator.className = 'voice-status-indicator downloading';
      } else if (status === 'Installed' || progress === 100) {
        indicator.className = 'voice-status-indicator installed';
      } else {
        indicator.className = 'voice-status-indicator';
      }
    }

    if (btn) {
      if (progress > 0 && progress < 100) {
        btn.disabled = true;
        btn.textContent = progress + '%';
      } else if (status === 'Installed') {
        btn.disabled = true;
        btn.textContent = '✓ Installed';
      } else if (status.startsWith('Error')) {
        btn.disabled = false;
        btn.textContent = 'Retry Download';
      } else {
        btn.disabled = false;
        btn.textContent = 'Download ' + engine.charAt(0).toUpperCase() + engine.slice(1);
      }
    }
  }

  function handleMicTestStatus(status, message) {
    const btn = document.getElementById('micTestBtn');
    const resultEl = document.getElementById('voiceTestResult');

    if (btn) {
      if (status === 'recording') {
        btn.classList.add('recording');
        btn.innerHTML = '🔴 Recording...';
      } else {
        btn.classList.remove('recording');
        btn.innerHTML = '🎤 Test Microphone';
      }
    }

    if (resultEl && message) {
      resultEl.textContent = message;
      resultEl.style.display = 'block';
    }
  }

  function handleSpeakerTestStatus(status, message) {
    const resultEl = document.getElementById('voiceTestResult');
    if (resultEl && message) {
      resultEl.textContent = message;
      resultEl.style.display = 'block';
    }
  }

  return {
    loadVoiceSettings,
    downloadWhisperModel,
    downloadWhisperBinary,
    saveVoiceSettings,
    testMicrophone,
    testSpeaker,
    updateVoiceDownloadProgress,
    handleMicTestStatus,
    handleSpeakerTestStatus,
  };
}
