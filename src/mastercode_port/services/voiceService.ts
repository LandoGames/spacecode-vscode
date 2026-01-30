/**
 * Voice Service
 *
 * Manages speech-to-text (STT) and text-to-speech (TTS) functionality
 * including model downloads, process management, and audio handling.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';
import { spawn, ChildProcess } from 'child_process';

export interface VoiceSettings {
  sttEngine: 'whisper' | 'vosk';
  whisperModel: 'tiny' | 'base' | 'small' | 'medium';
  ttsEnabled: boolean;
  piperVoice: string;
  whisperInstalled: boolean;
  voskInstalled: boolean;
  piperInstalled: boolean;
}

export interface ModelInfo {
  name: string;
  size: string;
  url: string;
  filename: string;
}

const WHISPER_MODELS: Record<string, ModelInfo> = {
  tiny: {
    name: 'Whisper Tiny',
    size: '75MB',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
    filename: 'ggml-tiny.bin'
  },
  base: {
    name: 'Whisper Base',
    size: '150MB',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
    filename: 'ggml-base.bin'
  },
  small: {
    name: 'Whisper Small',
    size: '500MB',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
    filename: 'ggml-small.bin'
  },
  medium: {
    name: 'Whisper Medium',
    size: '1.5GB',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin',
    filename: 'ggml-medium.bin'
  }
};

const VOSK_MODEL: ModelInfo = {
  name: 'Vosk Small English',
  size: '50MB',
  url: 'https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip',
  filename: 'vosk-model-small-en-us-0.15.zip'
};

const PIPER_VOICES: Record<string, ModelInfo> = {
  'en_US-lessac-medium': {
    name: 'English US - Lessac',
    size: '60MB',
    url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx',
    filename: 'en_US-lessac-medium.onnx'
  }
};

export class VoiceService {
  private context: vscode.ExtensionContext | null = null;
  private modelsPath: string = '';
  private settings: VoiceSettings = {
    sttEngine: 'whisper',
    whisperModel: 'small',
    ttsEnabled: true,
    piperVoice: 'en_US-lessac-medium',
    whisperInstalled: false,
    voskInstalled: false,
    piperInstalled: false
  };

  private downloadProgress: Map<string, number> = new Map();
  private activeDownloads: Map<string, boolean> = new Map();
  private onProgressCallback: ((engine: string, progress: number, status: string) => void) | null = null;

  async initialize(context: vscode.ExtensionContext): Promise<void> {
    this.context = context;

    // Set up models directory in global storage
    this.modelsPath = path.join(context.globalStorageUri.fsPath, 'voice-models');

    // Create directory if it doesn't exist
    if (!fs.existsSync(this.modelsPath)) {
      fs.mkdirSync(this.modelsPath, { recursive: true });
    }

    // Load saved settings
    await this.loadSettings();

    // Check which models are installed
    await this.checkInstalledModels();
  }

  setProgressCallback(callback: (engine: string, progress: number, status: string) => void): void {
    this.onProgressCallback = callback;
  }

  private async loadSettings(): Promise<void> {
    if (!this.context) return;

    const saved = this.context.globalState.get<VoiceSettings>('spacecode.voiceSettings');
    if (saved) {
      this.settings = { ...this.settings, ...saved };
    }
  }

  private async saveSettings(): Promise<void> {
    if (!this.context) return;
    await this.context.globalState.update('spacecode.voiceSettings', this.settings);
  }

  async checkInstalledModels(): Promise<void> {
    // Check Whisper
    const whisperModel = WHISPER_MODELS[this.settings.whisperModel];
    const whisperPath = path.join(this.modelsPath, 'whisper', whisperModel.filename);
    this.settings.whisperInstalled = fs.existsSync(whisperPath);

    // Check Vosk
    const voskPath = path.join(this.modelsPath, 'vosk', 'model');
    this.settings.voskInstalled = fs.existsSync(voskPath);

    // Check Piper
    const piperPath = path.join(this.modelsPath, 'piper', this.settings.piperVoice + '.onnx');
    this.settings.piperInstalled = fs.existsSync(piperPath);

    await this.saveSettings();
  }

  getSettings(): VoiceSettings {
    return { ...this.settings };
  }

  async updateSettings(newSettings: Partial<VoiceSettings>): Promise<VoiceSettings> {
    this.settings = { ...this.settings, ...newSettings };
    await this.saveSettings();
    await this.checkInstalledModels();
    return this.getSettings();
  }

  async downloadModel(engine: 'whisper' | 'vosk' | 'piper', modelSize?: string): Promise<boolean> {
    if (this.activeDownloads.get(engine)) {
      vscode.window.showWarningMessage(`${engine} is already downloading`);
      return false;
    }

    this.activeDownloads.set(engine, true);

    try {
      let modelInfo: ModelInfo;
      let destDir: string;

      switch (engine) {
        case 'whisper':
          const size = modelSize || this.settings.whisperModel;
          modelInfo = WHISPER_MODELS[size];
          destDir = path.join(this.modelsPath, 'whisper');
          break;
        case 'vosk':
          modelInfo = VOSK_MODEL;
          destDir = path.join(this.modelsPath, 'vosk');
          break;
        case 'piper':
          modelInfo = PIPER_VOICES[this.settings.piperVoice] || PIPER_VOICES['en_US-lessac-medium'];
          destDir = path.join(this.modelsPath, 'piper');
          break;
        default:
          throw new Error(`Unknown engine: ${engine}`);
      }

      // Create destination directory
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      const destPath = path.join(destDir, modelInfo.filename);

      this.reportProgress(engine, 0, 'Starting download...');

      await this.downloadFile(modelInfo.url, destPath, (progress) => {
        this.reportProgress(engine, progress, `Downloading ${modelInfo.name}... ${progress}%`);
      });

      // Handle zip extraction for Vosk
      if (engine === 'vosk' && modelInfo.filename.endsWith('.zip')) {
        this.reportProgress(engine, 100, 'Extracting...');
        await this.extractZip(destPath, destDir);
        // Rename extracted folder to 'model'
        const extractedDir = path.join(destDir, 'vosk-model-small-en-us-0.15');
        const modelDir = path.join(destDir, 'model');
        if (fs.existsSync(extractedDir) && !fs.existsSync(modelDir)) {
          fs.renameSync(extractedDir, modelDir);
        }
        // Clean up zip
        fs.unlinkSync(destPath);
      }

      // Download Piper config file if needed
      if (engine === 'piper') {
        const configUrl = modelInfo.url.replace('.onnx', '.onnx.json');
        const configPath = destPath + '.json';
        await this.downloadFile(configUrl, configPath);
      }

      this.reportProgress(engine, 100, 'Installed');

      // Update settings
      switch (engine) {
        case 'whisper':
          this.settings.whisperInstalled = true;
          break;
        case 'vosk':
          this.settings.voskInstalled = true;
          break;
        case 'piper':
          this.settings.piperInstalled = true;
          break;
      }

      await this.saveSettings();

      vscode.window.showInformationMessage(`${modelInfo.name} downloaded successfully!`);
      return true;

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.reportProgress(engine, 0, `Error: ${message}`);
      vscode.window.showErrorMessage(`Failed to download ${engine}: ${message}`);
      return false;
    } finally {
      this.activeDownloads.set(engine, false);
    }
  }

  private reportProgress(engine: string, progress: number, status: string): void {
    this.downloadProgress.set(engine, progress);
    if (this.onProgressCallback) {
      this.onProgressCallback(engine, progress, status);
    }
  }

  private downloadFile(url: string, destPath: string, onProgress?: (percent: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;

      const request = protocol.get(url, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            this.downloadFile(redirectUrl, destPath, onProgress)
              .then(resolve)
              .catch(reject);
            return;
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        const totalSize = parseInt(response.headers['content-length'] || '0', 10);
        let downloadedSize = 0;

        const file = fs.createWriteStream(destPath);

        response.on('data', (chunk) => {
          downloadedSize += chunk.length;
          if (totalSize > 0 && onProgress) {
            const percent = Math.round((downloadedSize / totalSize) * 100);
            onProgress(percent);
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          resolve();
        });

        file.on('error', (err) => {
          fs.unlink(destPath, () => {}); // Clean up partial file
          reject(err);
        });
      });

      request.on('error', reject);
      request.setTimeout(30000, () => {
        request.destroy();
        reject(new Error('Download timeout'));
      });
    });
  }

  private async extractZip(zipPath: string, destDir: string): Promise<void> {
    // Use built-in unzip on macOS/Linux or PowerShell on Windows
    return new Promise((resolve, reject) => {
      const isWindows = process.platform === 'win32';

      let cmd: string;
      let args: string[];

      if (isWindows) {
        cmd = 'powershell';
        args = ['-Command', `Expand-Archive -Path "${zipPath}" -DestinationPath "${destDir}" -Force`];
      } else {
        cmd = 'unzip';
        args = ['-o', zipPath, '-d', destDir];
      }

      const proc = spawn(cmd, args);

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Extraction failed with code ${code}`));
        }
      });

      proc.on('error', reject);
    });
  }

  getModelPath(engine: 'whisper' | 'vosk' | 'piper'): string | null {
    switch (engine) {
      case 'whisper':
        const whisperModel = WHISPER_MODELS[this.settings.whisperModel];
        const whisperPath = path.join(this.modelsPath, 'whisper', whisperModel.filename);
        return fs.existsSync(whisperPath) ? whisperPath : null;
      case 'vosk':
        const voskPath = path.join(this.modelsPath, 'vosk', 'model');
        return fs.existsSync(voskPath) ? voskPath : null;
      case 'piper':
        const piperPath = path.join(this.modelsPath, 'piper', this.settings.piperVoice + '.onnx');
        return fs.existsSync(piperPath) ? piperPath : null;
      default:
        return null;
    }
  }

  isModelInstalled(engine: 'whisper' | 'vosk' | 'piper'): boolean {
    return this.getModelPath(engine) !== null;
  }

  getModelsPath(): string {
    return this.modelsPath;
  }
}
