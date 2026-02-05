/**
 * SoundService — Notification sounds for SpaceCode
 *
 * Plays short audio cues when key events happen (AI response complete,
 * build finished, errors, etc.). Uses the system `afplay` command on
 * macOS; stubs exist for Windows/Linux but are not yet wired.
 *
 * ─── HOW IT WORKS ───
 *
 *   1. Sound files live in  media/sounds/*.mp3
 *   2. Each SoundEvent maps to a filename (see SOUND_MAP below).
 *   3. Callers do:  SoundService.getInstance().play('aiComplete');
 *   4. The service spawns a detached process to play the file —
 *      it never blocks the extension host thread.
 *   5. Users can enable/disable sounds globally or per-event
 *      via SpaceCode settings (spacecode.sounds.enabled, etc.)
 *
 * ─── ADDING A NEW SOUND EVENT ───
 *
 *   1. Add the event name to the SoundEvent type below.
 *   2. Add the mapping in SOUND_MAP  →  { event: 'filename.mp3' }
 *   3. Drop the .mp3 file into  media/sounds/
 *   4. Call  SoundService.getInstance().play('yourEvent')  from
 *      wherever the event is emitted.
 *
 * ─── WHERE TO HOOK EACH EVENT ───
 *
 *   See the INTEGRATION POINTS section at the bottom of this file
 *   for exact file paths and line references.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

/**
 * All events that can trigger a notification sound.
 *
 * Add new entries here as SpaceCode grows.
 */
export type SoundEvent =
  | 'aiComplete'         // AI chat response finished
  | 'aiError'            // AI chat response errored
  | 'buildSuccess'       // Extension / project build succeeded
  | 'buildFail'          // Extension / project build failed
  | 'planReady'          // A plan has been generated and is ready for review
  | 'workflowDone'       // A workflow execution completed
  | 'jobQueued'          // A new autoexecute job entered the queue
  | 'jobApproved'        // An autoexecute job was approved
  | 'sectorViolation'    // A sector boundary violation was detected
  | 'notification';      // Generic notification (fallback)

export interface SoundSettings {
  /** Master switch — if false, nothing plays. */
  enabled: boolean;
  /** Volume 0.0 – 1.0 (macOS afplay supports this). */
  volume: number;
  /** Per-event overrides: set to false to mute a specific event. */
  events: Partial<Record<SoundEvent, boolean>>;
}

// ──────────────────────────────────────────────
// Sound file map
// ──────────────────────────────────────────────

/**
 * Maps each SoundEvent to a filename inside media/sounds/.
 *
 * TODO: Replace placeholder filenames with real .mp3 files.
 *       Keep files short (< 1 s, < 50 KB) for instant playback.
 *       Suggested: use free notification sounds from notificationsounds.com
 *       or generate with a synth (8-bit chirps fit the SpaceCode theme).
 */
const SOUND_MAP: Record<SoundEvent, string> = {
  aiComplete:       'ai-complete.mp3',
  aiError:          'ai-error.mp3',
  buildSuccess:     'build-success.mp3',
  buildFail:        'build-fail.mp3',
  planReady:        'plan-ready.mp3',
  workflowDone:     'workflow-done.mp3',
  jobQueued:        'job-queued.mp3',
  jobApproved:      'job-approved.mp3',
  sectorViolation:  'sector-violation.mp3',
  notification:     'notification.mp3',
};

// ──────────────────────────────────────────────
// Service
// ──────────────────────────────────────────────

export class SoundService {
  private static instance: SoundService;

  private extensionPath: string = '';
  private settings: SoundSettings = {
    enabled: true,
    volume: 0.5,
    events: {},
  };

  private constructor() {}

  static getInstance(): SoundService {
    if (!SoundService.instance) {
      SoundService.instance = new SoundService();
    }
    return SoundService.instance;
  }

  /**
   * Call once from extension.ts activate().
   * Reads persisted settings and resolves the media/sounds path.
   */
  async initialize(context: vscode.ExtensionContext): Promise<void> {
    this.extensionPath = context.extensionPath;

    // Load persisted settings (or use defaults)
    const stored = context.globalState.get<SoundSettings>('spacecode.soundSettings');
    if (stored) {
      this.settings = { ...this.settings, ...stored };
    }
  }

  // ── Playback ────────────────────────────────

  /**
   * Play the sound associated with the given event.
   *
   * No-ops silently if:
   *   - Sounds are globally disabled
   *   - The specific event is disabled
   *   - The .mp3 file doesn't exist yet (stub)
   *   - The platform player isn't available
   */
  play(event: SoundEvent, volumeOverride?: number): void {
    console.log(`[SoundService] play('${event}') called — enabled=${this.settings.enabled}, extensionPath=${this.extensionPath}`);

    if (!this.settings.enabled) { console.log('[SoundService] SKIP: sounds disabled'); return; }
    if (this.settings.events[event] === false) { console.log(`[SoundService] SKIP: event '${event}' disabled`); return; }

    const filename = SOUND_MAP[event];
    if (!filename) { console.log(`[SoundService] SKIP: no mapping for '${event}'`); return; }

    const soundPath = path.join(this.extensionPath, 'media', 'sounds', filename);
    console.log(`[SoundService] soundPath=${soundPath}, exists=${fs.existsSync(soundPath)}`);

    if (!fs.existsSync(soundPath)) { console.log('[SoundService] SKIP: file not found'); return; }

    this.playFile(soundPath, volumeOverride);
  }

  /**
   * Platform-specific audio playback.
   *
   * Spawns a detached child process — never blocks the extension host.
   * Errors are swallowed (sound is non-critical UX polish).
   */
  private playFile(filePath: string, volumeOverride?: number): void {
    const vol = typeof volumeOverride === 'number' ? volumeOverride : this.settings.volume;

    switch (process.platform) {
      case 'darwin':
        // afplay is built into macOS, supports volume flag
        console.log(`[SoundService] exec: afplay "${filePath}" -v ${vol}`);
        exec(`afplay "${filePath}" -v ${vol}`, { timeout: 5000 }, (err) => {
          if (err) console.error('[SoundService] afplay error:', err.message);
          else console.log('[SoundService] afplay finished OK');
        });
        break;

      case 'win32':
        // PowerShell SoundPlayer for .wav, or Start-Process for .mp3 via wmplayer
        console.log(`[SoundService] exec: PowerShell SoundPlayer "${filePath}"`);
        exec(
          `powershell -NoProfile -Command "Add-Type -AssemblyName PresentationCore; $p = New-Object System.Windows.Media.MediaPlayer; $p.Volume = ${vol}; $p.Open([uri]'${filePath.replace(/'/g, "''")}'); $p.Play(); Start-Sleep -Milliseconds 2000"`,
          { timeout: 5000 },
          (err) => {
            if (err) console.error('[SoundService] PowerShell error:', err.message);
          }
        );
        break;

      case 'linux':
        // Try paplay (PulseAudio) first, fall back to aplay (ALSA)
        console.log(`[SoundService] exec: paplay/aplay "${filePath}"`);
        exec(`which paplay`, (paErr) => {
          if (!paErr) {
            exec(`paplay "${filePath}" --volume=${Math.round(vol * 65536)}`, { timeout: 5000 }, (err) => {
              if (err) console.error('[SoundService] paplay error:', err.message);
            });
          } else {
            exec(`aplay "${filePath}"`, { timeout: 5000 }, (err) => {
              if (err) console.error('[SoundService] aplay error:', err.message);
            });
          }
        });
        break;
    }
  }

  // ── Settings ────────────────────────────────

  getSettings(): SoundSettings {
    return { ...this.settings };
  }

  async updateSettings(
    context: vscode.ExtensionContext,
    patch: Partial<SoundSettings>
  ): Promise<void> {
    this.settings = { ...this.settings, ...patch };
    await context.globalState.update('spacecode.soundSettings', this.settings);
  }

  /** Toggle the master switch. */
  async setEnabled(context: vscode.ExtensionContext, enabled: boolean): Promise<void> {
    await this.updateSettings(context, { enabled });
  }

  /** Enable/disable a specific event. */
  async setEventEnabled(
    context: vscode.ExtensionContext,
    event: SoundEvent,
    enabled: boolean
  ): Promise<void> {
    const events = { ...this.settings.events, [event]: enabled };
    await this.updateSettings(context, { events });
  }
}

// ──────────────────────────────────────────────
// INTEGRATION POINTS
// ──────────────────────────────────────────────
//
// Below is the exact code to add at each hook site.
// Each snippet is self-contained — just paste it in.
//
// ┌─────────────────────────────────────────────────────────────────┐
// │ EVENT: aiComplete / aiError                                     │
// │ FILE:  src/mastercode_port/ui/mainPanel.ts                      │
// │ WHERE: Inside _subscribeToOrchestrator(), after the existing    │
// │        orchestrator.on('complete') and on('error') handlers.    │
// │                                                                  │
// │   // --- existing code (≈ line 369): ---                        │
// │   this.orchestrator.on('complete', (stats: any) => {            │
// │     this._postMessage({ type: 'complete', stats, chatId });     │
// │     SoundService.getInstance().play('aiComplete');  // ← ADD    │
// │   });                                                            │
// │                                                                  │
// │   this.orchestrator.on('error', (error: any) => {               │
// │     ...                                                          │
// │     SoundService.getInstance().play('aiError');     // ← ADD    │
// │   });                                                            │
// ├─────────────────────────────────────────────────────────────────┤
// │ EVENT: planReady                                                 │
// │ FILE:  src/mastercode_port/ui/handlers/plans.ts                 │
// │ WHERE: After plan generation completes (generatePlan handler)   │
// │                                                                  │
// │   // After sending { type: 'plan', plan } to webview:           │
// │   SoundService.getInstance().play('planReady');      // ← ADD   │
// ├─────────────────────────────────────────────────────────────────┤
// │ EVENT: workflowDone                                              │
// │ FILE:  src/mastercode_port/ui/handlers/workflows.ts             │
// │ WHERE: After workflow execution finishes                         │
// │                                                                  │
// │   // After the final workflowEvent with status 'completed':     │
// │   SoundService.getInstance().play('workflowDone');   // ← ADD   │
// ├─────────────────────────────────────────────────────────────────┤
// │ EVENT: jobQueued                                                 │
// │ FILE:  src/mastercode_port/ui/handlers/autoexecute.ts           │
// │ WHERE: When a new job enters the coordinator queue               │
// │                                                                  │
// │   SoundService.getInstance().play('jobQueued');       // ← ADD  │
// ├─────────────────────────────────────────────────────────────────┤
// │ EVENT: jobApproved                                               │
// │ FILE:  src/mastercode_port/ui/handlers/autoexecute.ts           │
// │ WHERE: After autoexecuteApprove succeeds                         │
// │                                                                  │
// │   SoundService.getInstance().play('jobApproved');     // ← ADD  │
// ├─────────────────────────────────────────────────────────────────┤
// │ EVENT: sectorViolation                                           │
// │ FILE:  src/sectors/SectorConfig.ts  (SectorManager)             │
// │ WHERE: When validateDependencies() finds violations              │
// │                                                                  │
// │   SoundService.getInstance().play('sectorViolation'); // ← ADD  │
// ├─────────────────────────────────────────────────────────────────┤
// │ EVENT: buildSuccess / buildFail                                  │
// │ FILE:  (future) wherever build/test commands are wired           │
// │ NOTE:  Not yet implemented — add when build pipeline exists.     │
// └─────────────────────────────────────────────────────────────────┘
