import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  CLAUDE_MODELS,
  GPT_MODELS,
  ALL_MODELS,
  CONSULTANT_MODELS,
  MODEL_DOCS,
  getDefaultClaudeModel,
  getDefaultGptModel,
  getDefaultConsultantModel,
} from '../config/models';

export function buildMainPanelHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri
): string {

    // Cache-bust: generate unique buildId for this render
    const buildId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);

    const iconUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'media', 'icon.svg')
    );
    const stationUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'media', 'imgs', 'Space Station.jpeg')
    );
    const shipUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'media', 'ship.png')
    );
    const shipFallbackUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'media', 'ship-placeholder.svg')
    );
    const panelCssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'media', 'panel.css')
    );
    const d3JsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'media', 'd3.v7.min.js')
    );
    const panelJsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'media', 'panel.js')
    );

    const cspSource = webview.cspSource;
    const mediaRootUri = vscode.Uri.joinPath(extensionUri, 'media');

    // Load station-map.json (if present) and pre-resolve image URLs for the webview.
    // This keeps the webview logic simple (no fetch/csp headaches) and makes it easy
    // for you to drop new images into media/ and just update the JSON.
    let stationMap: any = null;
    try {
      const mapPath = vscode.Uri.joinPath(mediaRootUri, 'station-map.json').fsPath;
      const raw = fs.readFileSync(mapPath, 'utf8');
      stationMap = JSON.parse(raw);
    } catch (e) {
      // Keep UI usable even without a map file.
      stationMap = { version: 1, startScene: 'station', scenes: { station: { title: 'Station', image: 'imgs/Space Station.jpeg', hotspots: [] } } };
    }

    try {
      const scenes = stationMap?.scenes || {};
      for (const sceneId of Object.keys(scenes)) {
        const scene = scenes[sceneId];
        const rel = String(scene?.image || '');
        if (!rel) continue;
        const parts = rel.split('/').filter(Boolean);
        const uri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRootUri, ...parts)).toString();
        scene.imageUrl = uri;
      }
      stationMap._resolvedAt = Date.now();
    } catch {
      // Ignore resolution failures; webview will fall back to placeholders.
    }

    const stationMapJson = JSON.stringify(stationMap);
    const stationMapBase64 = Buffer.from(stationMapJson, 'utf8').toString('base64');
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${cspSource}; script-src 'unsafe-inline' 'unsafe-eval' ${cspSource}; img-src ${cspSource} https: data:; font-src ${cspSource} data:;">
  <title>SpaceCode</title>
  <link rel="stylesheet" href="${panelCssUri}">
</head>
<body>
  <div id="sc-toast-container" class="sc-toast-container"></div>

  <!-- Settings Overlay (full-screen, independent of Dashboard) -->
  <div id="settingsOverlay" class="settings-overlay" style="display: none;">
    <div class="settings-overlay-header">
      <h2>Settings</h2>
      <button class="settings-close-btn" onclick="toggleSettingsOverlay()" title="Close Settings">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
    <div class="settings-overlay-content" id="settingsOverlayContent">
      <!-- Settings content will be moved here when overlay is shown -->
    </div>
  </div>

  <div class="header">
    <div class="header-left">
      <div class="logo">
        <img src="${iconUri}" alt="SpaceCode" style="width: 24px; height: 24px; vertical-align: middle; margin-right: 8px;"> SpaceCode
        <span style="font-size: 9px; color: var(--text-secondary); margin-left: 8px; opacity: 0.6;" title="Build ID: ${buildId}">v${buildId}</span>
        <span id="unity-status" class="unity-status" title="Unity: Click to check status or reload" onclick="unityHeaderClick()">
          <span class="status-dot checking"></span>
          <span class="status-label">Unity</span>
        </span>
      </div>
      <div class="mode-selector">
        <button class="mode-btn station active" data-tab="station" onclick="switchTab('station')">
          <svg viewBox="0 0 24 24" width="14" height="14" style="margin-right: 4px;"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>
          Station
        </button>
        <button class="mode-btn agents" data-tab="agents" onclick="switchTab('agents')">
          <svg viewBox="0 0 24 24" width="14" height="14" style="margin-right: 4px;"><circle cx="12" cy="8" r="5"></circle><path d="M3 21v-2a7 7 0 0 1 7-7h4a7 7 0 0 1 7 7v2"></path></svg>
          Agents
        </button>
        <button class="mode-btn skills" data-tab="skills" onclick="switchTab('skills')">
          <svg viewBox="0 0 24 24" width="14" height="14" style="margin-right: 4px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
          Skills
        </button>
        <button class="mode-btn dashboard" data-tab="dashboard" onclick="switchTab('dashboard')">
          <svg viewBox="0 0 24 24" width="14" height="14" style="margin-right: 4px;"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
          Dashboard
        </button>
      </div>
    </div>
    <div class="header-right">
      <button class="header-btn icon-only" id="settingsHeaderBtn" onclick="toggleSettingsOverlay()" title="Settings">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
      </button>
      <button class="header-btn icon-only" onclick="reloadPanel()" title="Reload Panel">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-2.64-6.36"></path>
          <polyline points="22 4 21 8 17 7"></polyline>
        </svg>
      </button>
    </div>
  </div>

  <div class="content">
    <div class="main-split">
      <!-- Persistent Chat Pane (always visible, left 33%) -->
      <div class="chat-pane" id="chatPane">
        <div class="chat-section" id="chatSection">
      <!-- Chat Context Bar (V3 simplified) — collapse + search only; persona/skills moved to status bar -->
      <div class="chat-context-bar" id="chatContextBar">
        <div class="context-bar-left">
          <!-- Persona menu (dropdown, anchored here but triggered from status bar tag) -->
          <div id="personaMenuAnchor" style="position:relative;">
            <div class="persona-menu" id="personaMenu" style="display:none;">
              <button class="persona-menu-item" data-persona="lead-engineer" onclick="setPersonaManual('lead-engineer')"><span class="persona-dot" style="background:#a855f7;"></span> Lead Engineer</button>
              <button class="persona-menu-item" data-persona="qa-engineer" onclick="setPersonaManual('qa-engineer')"><span class="persona-dot" style="background:#f59e0b;"></span> QA Engineer</button>
              <button class="persona-menu-item" data-persona="technical-writer" onclick="setPersonaManual('technical-writer')"><span class="persona-dot" style="background:#3b82f6;"></span> Technical Writer</button>
              <button class="persona-menu-item" data-persona="issue-triager" onclick="setPersonaManual('issue-triager')"><span class="persona-dot" style="background:#10b981;"></span> Issue Triager</button>
              <button class="persona-menu-item" data-persona="database-engineer" onclick="setPersonaManual('database-engineer')"><span class="persona-dot" style="background:#22c55e;"></span> Database Engineer</button>
              <button class="persona-menu-item" data-persona="art-director" onclick="setPersonaManual('art-director')"><span class="persona-dot" style="background:#ec4899;"></span> Art Director</button>
            </div>
          </div>
        </div>
        <div class="context-bar-right">
          <button class="toolbar-icon-btn" onclick="chatSearchToggle()" title="Search chat history" style="padding:2px 4px; font-size:12px; opacity:0.6;">&#128269;</button>
          <button class="chat-collapse-btn" id="chatCollapseBtn" onclick="toggleChatCollapse()" title="Collapse chat panel">&#x25C0;</button>
        </div>
      </div>

      <!-- Chat Search Bar (Phase 6.2) -->
      <div id="chatSearchBar" style="display:none; padding:4px 8px; background:var(--bg-secondary); border-bottom:1px solid var(--border-color);">
        <div style="display:flex; gap:4px; align-items:center;">
          <input id="chatSearchInput" type="text" placeholder="Search previous chats..."
            oninput="chatSearchInput(this.value)"
            onkeydown="if(event.key==='Escape') chatSearchClose();"
            style="flex:1; background:var(--bg-primary); border:1px solid var(--border-color); color:var(--text-primary); padding:3px 6px; font-size:11px; border-radius:4px; outline:none;" />
          <button class="btn-secondary" onclick="chatSearchClose()" style="padding:2px 6px; font-size:10px;">&#x2715;</button>
        </div>
        <div id="chatSearchResults" style="display:none; max-height:300px; overflow-y:auto; background:var(--bg-primary); border:1px solid var(--border-color); border-radius:4px; margin-top:4px;"></div>
      </div>

      <!-- Quick-access icon bar removed (V3 redesign) — navigation via header tabs -->

      <div class="chat-tabs" id="chatTabs"></div>

      <!-- Chat Container (horizontal split: chat left, flow right) -->
      <div class="chat-container" id="chatContainer">
        <!-- Left Column: Chat + Input/Status -->
        <div class="chat-column" id="chatColumn">
          <!-- Primary Chat Panel (left side) -->
          <div class="chat-panel primary" id="chatPanelPrimary">
            <div class="chat-messages" id="chatMessages">
              <div class="empty-state" id="emptyState">
                <h2>Welcome to SpaceCode</h2>
                <p>Your AI coding companion for large codebases</p>
                <div class="quick-actions">
                  <button class="quick-action" onclick="insertPrompt('Review my code')">Review Code</button>
                  <button class="quick-action" onclick="insertPrompt('Explain this function')">Explain Code</button>
                  <button class="quick-action" onclick="insertPrompt('Where should I add this feature?')">Where To Add</button>
                  <button class="quick-action" onclick="insertPrompt('Help me debug')">Debug</button>
                </div>
              </div>
            </div>
          </div>

          <div class="status-bar tag-strip" id="statusBar">
            <!-- Persona tag (clickable → opens persona menu) -->
            <span class="tag tag-persona" id="tagPersona" onclick="togglePersonaMenu()" title="Click to change persona">
              <span class="tag-dot" id="tagPersonaDot" style="background:#a855f7;"></span>
              <span id="tagPersonaLabel">Lead Engineer</span>
              <span class="tag-pin" id="tagPersonaPin" title="Manually pinned">&#128204;</span>
              <button class="tag-unpin" id="tagPersonaUnpin" onclick="event.stopPropagation(); clearPersonaOverride()" title="Clear override">&times;</button>
            </span>
            <!-- Skill tags (auto-populated per tab) -->
            <span class="tag-group" id="tagSkills"></span>
            <!-- Skin tags (context docs/templates loaded) -->
            <span class="tag-group" id="tagSkins"></span>
            <!-- Status tag -->
            <span class="tag tag-status" id="tagStatus">
              <span class="status-dot" id="statusDot"></span>
              <span id="statusText">Ready</span>
            </span>
          </div>

          <div class="token-bar-wrapper">
            <div class="token-bar-container" id="tokenBarContainer" title="Token usage: 0%">
              <div class="token-bar-fill" id="tokenBarFill" style="width: 2%;"></div>
            </div>
            <span class="token-bar-label" id="tokenBarLabel">0 / 200K tokens</span>
          </div>

          <!-- Model/Mode Selector Toolbar -->
          <div class="model-toolbar" id="modelToolbar">
            <div class="toolbar-item">
              <button class="toolbar-dropdown-btn" onclick="toggleToolbarDropdown('modeDropdown')">
                <span class="toolbar-icon" id="modeIcon">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 5h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"></path>
                  </svg>
                </span>
                <span id="selectedModeLabel">Chat</span>
                <span class="toolbar-arrow">▾</span>
              </button>
              <div class="toolbar-dropdown" id="modeDropdown">
                <div class="dropdown-header">Switch mode</div>
                <button class="dropdown-option" onclick="selectChatMode('chat')">
                  <span class="option-icon">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 5h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"></path>
                    </svg>
                  </span> Chat
                  <span class="option-check" id="modeCheck-chat">✓</span>
                </button>
                <button class="dropdown-option" onclick="selectChatMode('agent')">
                  <span class="option-icon">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="3" y="8" width="18" height="10" rx="2"></rect>
                      <circle cx="9" cy="13" r="1.5"></circle>
                      <circle cx="15" cy="13" r="1.5"></circle>
                      <path d="M12 8V5"></path>
                      <circle cx="12" cy="4" r="1"></circle>
                    </svg>
                  </span> Agent
                  <span class="option-check" id="modeCheck-agent"></span>
                </button>
                <button class="dropdown-option" onclick="selectChatMode('agent-full')">
                  <span class="option-icon">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M13 2L3 14h7l-1 8 10-12h-7z"></path>
                    </svg>
                  </span> Agent (full access)
                  <span class="option-check" id="modeCheck-agent-full"></span>
                </button>
              </div>
            </div>

            <div class="toolbar-item" id="modelSelectorContainer">
              <button class="toolbar-dropdown-btn" onclick="toggleToolbarDropdown('modelDropdown')">
                <span id="selectedModelLabel">${getDefaultClaudeModel().label}</span>
                <span class="toolbar-arrow">▾</span>
              </button>
              <div class="toolbar-dropdown model-grouped-dropdown" id="modelDropdown">
                <div class="dropdown-header">Select model</div>
                <div class="dropdown-group" id="claudeModelsSection">
                  <div class="dropdown-group-header">
                    <span class="provider-icon claude-icon">◆</span> CLAUDE
                  </div>
                  ${CLAUDE_MODELS.map(m => `
                  <button class="dropdown-option" onclick="selectModel('claude', '${m.id}')">
                    <span class="model-option-label">${m.shortLabel}</span>
                    <span class="model-tier-badge tier-${m.tier}">${m.tier}</span>
                    <span class="option-check" id="modelCheck-${m.id}">${m.isDefault ? '✓' : ''}</span>
                  </button>`).join('')}
                </div>
                <div class="dropdown-group" id="gptModelsSection">
                  <div class="dropdown-group-header">
                    <span class="provider-icon gpt-icon">●</span> GPT
                  </div>
                  ${GPT_MODELS.map(m => `
                  <button class="dropdown-option" onclick="selectModel('gpt', '${m.id}')">
                    <span class="model-option-label">${m.shortLabel}</span>
                    <span class="model-tier-badge tier-${m.tier}">${m.tier}</span>
                    <span class="option-check" id="modelCheck-${m.id}">${m.isDefault ? '✓' : ''}</span>
                  </button>`).join('')}
                </div>
              </div>
            </div>

            <div class="toolbar-item" id="reasoningContainer">
              <button class="toolbar-dropdown-btn" onclick="toggleToolbarDropdown('reasoningDropdown')">
                <span class="toolbar-icon" id="reasoningIcon">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9 6a3 3 0 0 0-3 3v1a2 2 0 0 0 0 4v1a3 3 0 0 0 3 3"></path>
                    <path d="M15 6a3 3 0 0 1 3 3v1a2 2 0 0 1 0 4v1a3 3 0 0 1-3 3"></path>
                    <path d="M9 6h6"></path>
                    <path d="M9 18h6"></path>
                    <path d="M12 6v12"></path>
                  </svg>
                </span>
                <span id="selectedReasoningLabel">Medium</span>
                <span class="toolbar-arrow">▾</span>
              </button>
              <div class="toolbar-dropdown" id="reasoningDropdown">
                <div class="dropdown-header">Select reasoning</div>
                <button class="dropdown-option" onclick="selectReasoning('medium')">
                  <span class="option-icon">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M9 6a3 3 0 0 0-3 3v1a2 2 0 0 0 0 4v1a3 3 0 0 0 3 3"></path>
                      <path d="M15 6a3 3 0 0 1 3 3v1a2 2 0 0 1 0 4v1a3 3 0 0 1-3 3"></path>
                      <path d="M9 6h6"></path>
                      <path d="M9 18h6"></path>
                      <path d="M12 6v12"></path>
                    </svg>
                  </span> Medium
                  <span class="option-check" id="reasoningCheck-medium">✓</span>
                </button>
                <button class="dropdown-option" onclick="selectReasoning('high')">
                  <span class="option-icon">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M9 6a3 3 0 0 0-3 3v1a2 2 0 0 0 0 4v1a3 3 0 0 0 3 3"></path>
                      <path d="M15 6a3 3 0 0 1 3 3v1a2 2 0 0 1 0 4v1a3 3 0 0 1-3 3"></path>
                      <path d="M9 6h6"></path>
                      <path d="M9 18h6"></path>
                      <path d="M12 6v12"></path>
                    </svg>
                  </span> High
                  <span class="option-check" id="reasoningCheck-high"></span>
                </button>
              </div>
            </div>

            <!-- Separator between Claude settings and GPT Consultant -->
            <div class="toolbar-divider" id="consultantDivider" style="display:none;">|</div>

            <!-- Consultant Model Selector (for 2nd Opinion) - hidden until consult toggle is active -->
            <div class="toolbar-item" id="consultantSelectorContainer" style="display:none;" title="Model used for '2nd Opinion'">
              <button class="toolbar-dropdown-btn consultant-btn" onclick="toggleToolbarDropdown('consultantDropdown')">
                <span class="toolbar-icon consultant-icon">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="9" cy="7" r="4"></circle>
                    <circle cx="17" cy="7" r="4"></circle>
                    <path d="M3 21v-2a4 4 0 0 1 4-4h4"></path>
                    <path d="M14 21v-2a4 4 0 0 1 4-4h3"></path>
                  </svg>
                </span>
                <span id="selectedConsultantLabel">${getDefaultConsultantModel().label}</span>
                <span class="toolbar-arrow">▾</span>
              </button>
              <div class="toolbar-dropdown" id="consultantDropdown">
                <div class="dropdown-header">Consultant Model</div>
                <div class="dropdown-hint">Used for "2nd Opinion"</div>
                ${CONSULTANT_MODELS.map(m => `
                <button class="dropdown-option" onclick="selectConsultant('${m.id}')">
                  ${m.label}
                  <span class="option-check" id="consultantCheck-${m.id}">${m.isDefault ? '✓' : ''}</span>
                </button>`).join('')}
              </div>
            </div>

            <!-- GPT Intervention Level Selector - hidden until consult toggle is active -->
            <div class="toolbar-item" id="interventionLevelContainer" style="display:none;" title="How often GPT intervenes">
              <button class="toolbar-dropdown-btn consultant-btn" onclick="toggleToolbarDropdown('interventionDropdown')">
                <span class="toolbar-icon consultant-icon">
                  <svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>
                  </svg>
                </span>
                <span id="selectedInterventionLabel">Balanced</span>
                <span class="toolbar-arrow">▾</span>
              </button>
              <div class="toolbar-dropdown" id="interventionDropdown">
                <div class="dropdown-header">Intervention Level</div>
                <div class="dropdown-hint">How often GPT chimes in</div>
                <button class="dropdown-option" onclick="selectInterventionLevel('silent')">
                  Silent — only on errors
                  <span class="option-check" id="interventionCheck-silent"></span>
                </button>
                <button class="dropdown-option" onclick="selectInterventionLevel('balanced')">
                  Balanced — adds value
                  <span class="option-check" id="interventionCheck-balanced">✓</span>
                </button>
                <button class="dropdown-option" onclick="selectInterventionLevel('active')">
                  Active — always weighs in
                  <span class="option-check" id="interventionCheck-active"></span>
                </button>
              </div>
            </div>
          </div>

          <div class="chat-input">
            <div class="input-container">
              <div class="input-wrapper">
                <div class="drop-zone" id="dropZone"
                     ondrop="handleDrop(event)"
                     ondragover="handleDragOver(event)"
                     ondragleave="handleDragLeave(event)">
                  <div class="drop-zone-icon">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="3" y="6" width="18" height="14" rx="2"></rect>
                      <circle cx="12" cy="13" r="4"></circle>
                      <path d="M9 6l1.5-2h3L15 6"></path>
                    </svg>
                  </div>
                  Drop images here
                </div>
                <div class="attached-images" id="attachedImages"></div>
                <!-- Input Toolbar - icon row above textarea -->
                <div class="input-toolbar" id="inputToolbar">
                  <button class="toolbar-icon-btn" onclick="toggleDropZone()" title="Attach image">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"></path>
                    </svg>
                  </button>
                  <button class="toolbar-icon-btn has-fill" onclick="handleGitAction()" title="Git operations">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M21.62 11.11l-8.73-8.73a1.29 1.29 0 00-1.83 0l-1.82 1.82 2.32 2.32A1.53 1.53 0 0113 8.55v6a1.52 1.52 0 01-.53 1.16 1.53 1.53 0 01-1 2.62 1.52 1.52 0 01-1.52-1.52 1.5 1.5 0 01.45-1.08l-.02-5.91a1.52 1.52 0 01-.83-2 1.5 1.5 0 01.33-.46l-2.3-2.3-6.07 6.09a1.29 1.29 0 000 1.83l8.73 8.73a1.29 1.29 0 001.83 0l8.55-8.55a1.29 1.29 0 000-1.83z"/>
                    </svg>
                  </button>
                  <!-- Solo/Swarm mode switcher -->
                  <div class="input-mode-switcher" id="inputModeSwitcher">
                    <button class="input-mode-btn active" data-chat-mode="solo" onclick="switchChatMode('solo')" title="Single AI conversation">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"></circle><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"></path></svg>
                    </button>
                    <button class="input-mode-btn" data-chat-mode="planning" onclick="switchChatMode('planning')" title="Planning mode — structured analysis before implementation">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"></path><rect x="9" y="3" width="6" height="4" rx="1"></rect><path d="M9 12h6"></path><path d="M9 16h6"></path></svg>
                    </button>
                  </div>
                  <!-- Context Handoff dropdown -->
                  <div class="toolbar-dropdown" id="handoffDropdown">
                    <button class="toolbar-icon-btn" onclick="toggleHandoffMenu()" title="Handoff context to another persona">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 1l4 4-4 4"></path><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><path d="M7 23l-4-4 4-4"></path><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>
                    </button>
                    <div class="toolbar-dropdown-menu" id="handoffMenu" style="display:none;">
                      <div class="dropdown-header">Send context to...</div>
                      <button class="dropdown-item" onclick="handoffToQaEngineer()"><span class="persona-dot" style="background:#f59e0b;"></span> QA Engineer — Stay here</button>
                      <button class="dropdown-item" onclick="handoffToLeadEngineer()"><span class="persona-dot" style="background:#a855f7;"></span> Lead Engineer — Stay here</button>
                      <button class="dropdown-item" onclick="handoffToTechnicalWriter()"><span class="persona-dot" style="background:#3b82f6;"></span> Technical Writer — Stay here</button>
                      <div class="dropdown-divider"></div>
                      <div class="dropdown-header">Go to persona tab</div>
                      <button class="dropdown-item" onclick="handoffGoToQaEngineer()"><span class="persona-dot" style="background:#f59e0b;"></span> QA Engineer — Go to Station</button>
                      <button class="dropdown-item" onclick="handoffGoToLeadEngineer()"><span class="persona-dot" style="background:#a855f7;"></span> Lead Engineer</button>
                    </div>
                  </div>
                  <!-- GPT Consult toggle -->
                  <button class="toolbar-icon-btn gpt-consult-toggle" id="gptConsultToggle" onclick="toggleGptConsult()" title="Auto GPT consultation (off)">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="7" r="4"></circle><circle cx="17" cy="7" r="4"></circle><path d="M3 21v-2a4 4 0 0 1 4-4h4"></path><path d="M14 21v-2a4 4 0 0 1 4-4h3"></path></svg>
                  </button>
                </div>
                <textarea
                  id="messageInput"
                  placeholder="Ask anything... (Paste images with Cmd+V)"
                  rows="1"
                  onkeydown="handleKeyDown(event)"
                  oninput="autoResize(this)"
                  onpaste="handlePaste(event)"
                ></textarea>
              </div>
              <button class="send-btn" onclick="sendMessage()" id="sendBtn">Send</button>
              <button class="stop-btn" onclick="stopConversation()" id="stopBtn" style="display: none;">Stop</button>
            </div>
          </div>
        </div><!-- End chat-column -->

        <!-- contextFlowPanel kept as hidden anchor for JS that references it -->
        <div id="contextFlowPanel" style="display: none;"></div>

        <!-- Swarm sidebar removed — replaced by Planning panel in right pane -->
      </div><!-- End chat-container -->


    </div><!-- End chat-section -->
      </div><!-- End chat-pane -->

	  <div class="splitter" id="chatSplitter" title="Drag to resize"></div>

      <!-- Content Pane (right 67%, tab-switchable) -->
      <div class="content-pane" id="contentPane" style="position:relative;">
        <!-- Expand button (visible when chat is collapsed) -->
        <button class="chat-expand-btn" id="chatExpandBtn" onclick="toggleChatCollapse()" title="Expand chat panel" style="display:none;">&#x25B6;</button>

    <!-- Agents Section -->
    <div class="agents-section" id="agentsSection" style="display: none;">
      <div class="agents-container">
        <!-- Left Sidebar: Node Palette & Workflows -->
        <div class="agents-sidebar">
          <!-- Agent Status List (10.1) -->
          <div class="sidebar-section">
            <h3>Agents <button class="btn-secondary btn-sm" onclick="refreshAgentList()" style="float:right;padding:2px 6px;font-size:10px;">Refresh</button></h3>
            <div id="agentStatusList" style="margin-bottom:8px;">
              <div style="color:var(--text-secondary);font-size:11px;">Loading agents...</div>
            </div>
            <div id="agentDetailsPanel" style="display:none; background:var(--bg-secondary); border-radius:6px; margin-bottom:8px;"></div>
          </div>
          <!-- Skill Catalog (10.3) -->
          <div class="sidebar-section">
            <h3>Skills <button class="btn-secondary btn-sm" onclick="refreshSkillCatalog()" style="float:right;padding:2px 6px;font-size:10px;">Refresh</button></h3>
            <div id="skillCatalog" style="max-height:200px; overflow-y:auto;">
              <div style="color:var(--text-secondary);font-size:11px;">Loading skills...</div>
            </div>
          </div>
          <div class="sidebar-section">
            <h3>Nodes</h3>
            <div class="node-palette">
              <div class="palette-node" draggable="true" data-node="input">
                <span class="node-icon">📥</span> Input
              </div>
              <div class="palette-node" draggable="true" data-node="agent">
                <span class="node-icon">🤖</span> Agent
              </div>
              <div class="palette-node" draggable="true" data-node="output">
                <span class="node-icon">📤</span> Output
              </div>
            </div>
          </div>
          <div class="sidebar-section">
            <h3>Workflows</h3>
            <div class="workflow-list" id="workflowList">
              <p class="empty-text">No workflows yet</p>
            </div>
            <button class="btn-secondary" onclick="newWorkflow()" style="width: 100%; margin-top: 8px;">+ New Workflow</button>
          </div>
        </div>

        <!-- Center: Drawflow Canvas -->
        <div class="agents-canvas-container">
          <div class="canvas-toolbar">
            <input type="text" id="workflowName" placeholder="Workflow Name" value="New Workflow">
            <button class="toolbar-btn" onclick="saveCurrentWorkflow()">💾 Save</button>
            <button class="toolbar-btn" onclick="importWorkflow()">📥 Import</button>
            <button class="toolbar-btn" onclick="exportCurrentWorkflow()">📤 Export</button>
            <button class="toolbar-btn danger" onclick="clearCanvas()">🗑️ Clear</button>
          </div>
          <div id="drawflowCanvas" class="drawflow-canvas"></div>
          <div class="canvas-footer">
            <div class="workflow-input-container">
              <input type="text" id="workflowInput" placeholder="Enter message to run through workflow...">
              <button class="run-btn" onclick="runWorkflow()">▶ Run Workflow</button>
            </div>
          </div>
        </div>

        <!-- Right Sidebar: Node Configuration -->
        <div class="agents-config" id="agentsConfig">
          <div class="config-empty">
            <p>Select a node to configure</p>
          </div>
          <div class="config-panel" id="nodeConfigPanel" style="display: none;">
            <h3 id="configNodeType">Node Configuration</h3>
            <div id="configContent"></div>
          </div>
        </div>
      </div>

      <!-- Workflow Output -->
      <div class="workflow-output" id="workflowOutput" style="display: none;">
        <div class="output-header">
          <h3>Workflow Output</h3>
          <button class="close-btn" onclick="closeWorkflowOutput()">×</button>
        </div>
        <div class="output-content" id="workflowOutputContent"></div>
	      </div>
	    </div><!-- End agents-section -->

    <!-- Tickets Section -->
    <div class="tickets-section" id="ticketsSection" style="display: none;">
      <div class="tickets-container">
        <div class="tickets-header">
          <h2>Tickets</h2>
          <div class="tickets-actions">
            <button class="btn-primary" onclick="toggleTicketFormMain()">+ New Ticket</button>
            <button class="btn-secondary" onclick="refreshTickets()">Refresh</button>
          </div>
        </div>

        <!-- Create Ticket Form -->
        <div id="ticketFormPanel" class="ticket-form-panel" style="display:none;">
          <h3>Create Ticket</h3>
          <div class="ticket-form">
            <input id="ticketTitleMain" type="text" placeholder="Ticket title..." class="ticket-input" oninput="updateTicketTypePreview()" />
            <textarea id="ticketDescriptionMain" placeholder="Description (optional)..." class="ticket-textarea" oninput="updateTicketTypePreview()"></textarea>
            <div id="ticketRoutePreview" style="display:none; align-items:center; gap:6px; padding:4px 8px; background:var(--bg-secondary); border-radius:4px; margin-bottom:6px;"></div>
            <div class="ticket-form-row">
              <select id="ticketSectorMain" class="ticket-select">
                <option value="general">General</option>
                <option value="gameplay">Gameplay</option>
                <option value="ui">UI</option>
                <option value="audio">Audio</option>
                <option value="networking">Networking</option>
              </select>
              <select id="ticketPlanLinkMain" class="ticket-select">
                <option value="">(no plan)</option>
              </select>
            </div>
            <div class="ticket-form-actions">
              <button class="btn-primary" onclick="createTicketMain()">Create</button>
              <button class="btn-secondary" onclick="toggleTicketFormMain()">Cancel</button>
            </div>
          </div>
        </div>

        <!-- Ticket Filters -->
        <div class="ticket-filters">
          <button class="filter-btn active" data-filter="all" onclick="filterTickets('all')">All</button>
          <button class="filter-btn" data-filter="open" onclick="filterTickets('open')">Open</button>
          <button class="filter-btn" data-filter="in-progress" onclick="filterTickets('in-progress')">In Progress</button>
          <button class="filter-btn" data-filter="done" onclick="filterTickets('done')">Done</button>
        </div>

        <!-- Tickets List -->
        <div class="tickets-list" id="ticketsListMain">
          <div class="empty-tickets">
            <div class="empty-icon">🎫</div>
            <p>No tickets yet</p>
            <p class="empty-hint">Click "+ New Ticket" to create your first ticket</p>
          </div>
        </div>
      </div>
    </div><!-- End tickets-section -->

    <!-- Skills Section -->
    <div class="skills-section" id="skillsSection" style="display: none;">
      <div class="skills-container">
        <div class="skills-header">
          <h2>Skills</h2>
          <div class="skills-actions">
            <button class="btn-primary" onclick="createSkill()">+ New Skill</button>
            <button class="btn-secondary" onclick="refreshSkills()">Refresh</button>
          </div>
        </div>

        <div class="skills-description">
          <p>Skills are reusable AI capabilities that can be triggered from chat or agents.</p>
        </div>

        <!-- Skills Categories -->
        <div class="skills-categories">
          <button class="category-btn active" data-category="all" onclick="filterSkills('all')">All</button>
          <button class="category-btn" data-category="code" onclick="filterSkills('code')">Code</button>
          <button class="category-btn" data-category="docs" onclick="filterSkills('docs')">Docs</button>
          <button class="category-btn" data-category="unity" onclick="filterSkills('unity')">Unity</button>
          <button class="category-btn" data-category="custom" onclick="filterSkills('custom')">Custom</button>
        </div>

        <!-- Skills List -->
        <div class="skills-list" id="skillsList">
          <div class="empty-skills">
            <div class="empty-icon">⚡</div>
            <p>No skills yet</p>
            <p class="empty-hint">Skills let you save and reuse common AI tasks</p>
          </div>
        </div>
      </div>
    </div><!-- End skills-section -->

    <!-- Dashboard Section -->
    <div class="dashboard-section" id="dashboardSection" style="display: none;">
      <div class="dashboard-container">
        <!-- Dashboard Sub-Tab Navigation -->
        <div class="dashboard-subtabs">
          <button class="dashboard-subtab active" data-subtab="docs" onclick="switchDashboardSubtab('docs')">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
            Docs
          </button>
          <button class="dashboard-subtab" data-subtab="tickets" onclick="switchDashboardSubtab('tickets')">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
            Tickets
          </button>
          <button class="dashboard-subtab" data-subtab="db" onclick="switchDashboardSubtab('db')">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>
            DB
          </button>
          <button class="dashboard-subtab" data-subtab="mcp" onclick="switchDashboardSubtab('mcp')">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
            MCP
          </button>
          <button class="dashboard-subtab" data-subtab="logs" onclick="switchDashboardSubtab('logs')">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"></rect><line x1="7" y1="8" x2="17" y2="8"></line><line x1="7" y1="12" x2="17" y2="12"></line><line x1="7" y1="16" x2="13" y2="16"></line></svg>
            Logs
          </button>
          <button class="dashboard-subtab" data-subtab="mission" onclick="switchDashboardSubtab('mission')">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            Mission
          </button>
          <button class="dashboard-subtab" data-subtab="storage" onclick="switchDashboardSubtab('storage')">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
            Storage
          </button>
          <button class="dashboard-subtab" data-subtab="art" onclick="switchDashboardSubtab('art')">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="13.5" cy="6.5" r="0.5" fill="currentColor"></circle><circle cx="17.5" cy="10.5" r="0.5" fill="currentColor"></circle><circle cx="8.5" cy="7.5" r="0.5" fill="currentColor"></circle><circle cx="6.5" cy="12" r="0.5" fill="currentColor"></circle><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"></path></svg>
            Art
          </button>
          <button class="dashboard-subtab" data-subtab="info" onclick="switchDashboardSubtab('info')">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
            Info
          </button>
        </div>

        <!-- Docs Panel -->
        <div class="dashboard-panel" id="dashboardDocsPanel">
          <!-- 5.1: Project Complexity Toggle -->
          <div id="docsComplexityToggle" class="complexity-toggle">
            <span class="complexity-toggle-label">Project:</span>
            <button id="complexityBtnSimple" class="complexity-btn" onclick="setProjectComplexity('simple')">Simple</button>
            <button id="complexityBtnComplex" class="complexity-btn" onclick="setProjectComplexity('complex')">Complex</button>
            <span id="complexityHint" class="complexity-hint">Choose project type</span>
          </div>

          <!-- 5.2: Docs Wizard -->
          <div id="docsWizardSection" style="display:none;">
            <div class="docs-section">
              <div class="section-header">
                <h4 id="docsWizardTitle">Documentation Setup Wizard</h4>
                <span class="badge" id="docsWizardStep">Step 1/6</span>
              </div>
              <p id="docsWizardDesc" style="color:var(--vscode-descriptionForeground); margin-bottom:8px;"></p>
              <div id="docsWizardContent"></div>
              <div class="wizard-nav" style="display:flex; gap:6px; margin-top:8px;">
                <button class="btn-secondary btn-sm" id="docsWizardPrevBtn" onclick="docsWizardPrev()">Back</button>
                <button class="btn-secondary btn-sm" id="docsWizardSkipBtn" onclick="docsWizardSkip()">Skip</button>
                <button class="btn-primary btn-sm" id="docsWizardNextBtn" onclick="docsWizardNext()">Next</button>
                <button class="btn-primary btn-sm" id="docsWizardCompleteBtn" onclick="docsWizardComplete()" style="display:none;">Generate Docs</button>
                <button class="btn-secondary btn-sm" onclick="docsWizardCancel()" style="margin-left:auto;">Cancel</button>
              </div>
            </div>
          </div>

          <!-- 5.4: Doc Drift Warning -->
          <div id="docsDriftBanner" style="display:none;" class="docs-drift-banner">
            <div class="section-header">
              <h4>Doc Drift Detected</h4>
              <button class="btn-secondary btn-sm" onclick="detectDocDrift()">Re-check</button>
            </div>
            <div id="docsDriftList"></div>
          </div>

          <!-- Doc Summary Bar -->
          <div id="docsSummaryBar" style="display:none; margin-bottom:8px;">
            <div class="docs-stats">
              <div class="stat-card">
                <div class="stat-value" id="docsSummaryTotal">0</div>
                <div class="stat-label">Total</div>
              </div>
              <div class="stat-card">
                <div class="stat-value" id="docsSummaryCurrent">0</div>
                <div class="stat-label">Current</div>
              </div>
              <div class="stat-card">
                <div class="stat-value" id="docsSummaryDraft">0</div>
                <div class="stat-label">Draft</div>
              </div>
              <div class="stat-card">
                <div class="stat-value" id="docsSummaryMissing">0</div>
                <div class="stat-label">Missing</div>
              </div>
              <div class="stat-card">
                <div class="stat-value" id="docsSummaryHealth">-</div>
                <div class="stat-label">Health</div>
              </div>
            </div>
          </div>

          <div class="panel-header">
            <h3>Documentation & Knowledge Base</h3>
            <div class="panel-actions">
              <button class="btn-secondary btn-sm" onclick="startDocsWizard()" title="Setup Wizard">Wizard</button>
              <button class="btn-secondary btn-sm" onclick="refreshDocs()">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                Refresh
              </button>
            </div>
          </div>

          <!-- KB Stats -->
          <div class="docs-stats">
            <div class="stat-card">
              <div class="stat-value" id="docsKbChunks">0</div>
              <div class="stat-label">KB Chunks</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" id="docsProjectDocs">0</div>
              <div class="stat-label">Project Docs</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" id="docsExternalKb">0</div>
              <div class="stat-label">External KB</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" id="docsFreshness">-</div>
              <div class="stat-label">Last Updated</div>
            </div>
          </div>

          <!-- Librarian Section -->
          <div class="docs-section">
            <div class="section-header">
              <h4>Librarian (External KB Ingestion)</h4>
              <span class="agent-status" id="librarianStatus">idle</span>
            </div>
            <div class="docs-ingest-form">
              <div class="form-row">
                <input type="text" id="kbIngestUrl" placeholder="URL or file path to ingest..." class="input-field" />
                <button class="btn-primary btn-sm" onclick="ingestKbSource()">Ingest</button>
              </div>
              <div class="form-hint">Supports: URLs, PDFs, Markdown, Unity docs</div>
            </div>
            <div class="kb-sources-list" id="kbSourcesList">
              <div class="empty-state">No external sources ingested yet</div>
            </div>
          </div>

          <!-- Knowledge Base Embeddings -->
          <div class="docs-section">
            <div class="section-header">
              <h4>Knowledge Base Embeddings</h4>
              <span class="agent-status" id="embedderStatus">idle</span>
            </div>
            <div class="docs-ingest-form">
              <div class="form-row">
                <label for="modelSelect" style="min-width: 140px;">Embedding Model</label>
                <select id="modelSelect" class="input-field select" onchange="onModelSelect()"></select>
              </div>
              <div class="form-hint" id="modelInfo"></div>
              <div id="downloadProgressContainer" style="display: none; margin-top: 8px;"></div>
              <div class="form-hint" id="kbStats"></div>
            </div>
          </div>

          <!-- Knowledge Base Entries -->
          <div class="docs-section">
            <div class="section-header">
              <h4>Knowledge Base Entries</h4>
            </div>
            <div class="docs-list" id="kbList">
              <div class="empty-state">No entries in knowledge base</div>
            </div>
          </div>

          <!-- Documentor Section -->
          <div class="docs-section">
            <div class="section-header">
              <h4>Documentor (Project Docs)</h4>
              <span class="agent-status" id="documentorStatus">idle</span>
            </div>
            <div class="docs-list" id="projectDocsList">
              <div class="empty-state">No project docs tracked</div>
            </div>
            <button class="btn-secondary btn-sm" onclick="scanProjectDocs()">Scan Project Docs</button>
          </div>
        </div>

        <!-- Tickets Panel -->
        <div class="dashboard-panel" id="dashboardTicketsPanel" style="display: none;">
          <div class="panel-header">
            <h3>Tickets</h3>
            <div class="panel-actions">
              <button class="btn-primary btn-sm" onclick="toggleTicketFormDashboard()">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                New Ticket
              </button>
              <button class="btn-secondary btn-sm" onclick="refreshTickets()">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                Refresh
              </button>
            </div>
          </div>

          <!-- Ticket Stats -->
          <div class="ticket-stats">
            <div class="stat-card">
              <div class="stat-value" id="ticketsOpen">0</div>
              <div class="stat-label">Open</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" id="ticketsInProgress">0</div>
              <div class="stat-label">In Progress</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" id="ticketsDone">0</div>
              <div class="stat-label">Done</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" id="ticketsTotal">0</div>
              <div class="stat-label">Total</div>
            </div>
          </div>

          <!-- New Ticket Form -->
          <div class="ticket-form-container" id="dashboardTicketForm" style="display: none;">
            <div class="ticket-form">
              <input type="text" id="dashboardTicketTitle" placeholder="Ticket title..." class="input-field" oninput="updateDashboardTicketPreview()" />
              <textarea id="dashboardTicketDescription" placeholder="Description..." class="input-field textarea" rows="3" oninput="updateDashboardTicketPreview()"></textarea>
              <div id="dashboardTicketRoutePreview" style="display:none; align-items:center; gap:6px; padding:4px 8px; background:var(--bg-tertiary); border-radius:4px; margin-bottom:6px;"></div>
              <div class="form-row">
                <select id="dashboardTicketPriority" class="input-field select">
                  <option value="low">Low Priority</option>
                  <option value="medium" selected>Medium Priority</option>
                  <option value="high">High Priority</option>
                  <option value="critical">Critical</option>
                </select>
                <select id="dashboardTicketSector" class="input-field select">
                  <option value="">Auto-detect Sector</option>
                </select>
              </div>
              <div class="form-actions">
                <button class="btn-secondary btn-sm" onclick="toggleTicketFormDashboard()">Cancel</button>
                <button class="btn-primary btn-sm" onclick="createTicketFromDashboard()">Create Ticket</button>
              </div>
            </div>
          </div>

          <!-- Tickets List -->
          <div class="tickets-list" id="dashboardTicketsList">
            <div class="empty-state">No tickets yet. Create one to get started.</div>
          </div>
        </div>

        <!-- DB Panel -->
        <div class="dashboard-panel" id="dashboardDbPanel" style="display: none;">
          <div class="panel-header">
            <h3>Database & Vector Store</h3>
            <div class="panel-actions">
              <button class="btn-secondary btn-sm" onclick="refreshDbStats()">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                Refresh
              </button>
            </div>
          </div>

          <!-- DB Stats -->
          <div class="db-stats">
            <div class="stat-card">
              <div class="stat-value" id="dbVectorCount">0</div>
              <div class="stat-label">Vectors</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" id="dbChunkCount">0</div>
              <div class="stat-label">Chunks</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" id="dbCacheHitRate">0%</div>
              <div class="stat-label">Cache Hit Rate</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" id="dbStorageSize">0 MB</div>
              <div class="stat-label">Storage Size</div>
            </div>
          </div>

          <!-- RAG Health -->
          <div class="db-section">
            <div class="section-header">
              <h4>RAG Health</h4>
            </div>
            <div class="rag-health">
              <div class="health-row">
                <span class="health-label">Retrieval Latency</span>
                <span class="health-value" id="ragLatency">- ms</span>
              </div>
              <div class="health-row">
                <span class="health-label">Embedding Status</span>
                <span class="health-value health-good" id="ragEmbeddingStatus">Ready</span>
              </div>
              <div class="health-row">
                <span class="health-label">Ingestion Success Rate</span>
                <span class="health-value" id="ragIngestionRate">- %</span>
              </div>
              <div class="health-row">
                <span class="health-label">Last Indexing</span>
                <span class="health-value" id="ragLastIndexing">Never</span>
              </div>
            </div>
          </div>

          <!-- Storage Breakdown -->
          <div class="db-section">
            <div class="section-header">
              <h4>Storage Breakdown</h4>
            </div>
            <div class="storage-breakdown">
              <div class="storage-row">
                <span class="storage-label">Chat Embeddings</span>
                <span class="storage-value" id="storageChatEmbeddings">0 MB</span>
              </div>
              <div class="storage-row">
                <span class="storage-label">Global KB</span>
                <span class="storage-value" id="storageGlobalKb">0 MB</span>
              </div>
              <div class="storage-row">
                <span class="storage-label">Project KB</span>
                <span class="storage-value" id="storageProjectKb">0 MB</span>
              </div>
              <div class="storage-row">
                <span class="storage-label">Code Index</span>
                <span class="storage-value" id="storageCodeIndex">0 MB</span>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="db-actions">
            <button class="btn-secondary" onclick="rebuildIndex()">Rebuild Index</button>
            <button class="btn-secondary" onclick="clearCache()">Clear Cache</button>
            <button class="btn-danger" onclick="confirmResetDb()">Reset Database</button>
          </div>

          <!-- External Database Connections (Phase 6.1) -->
          <div class="db-section" style="margin-top:12px;">
            <div class="section-header" style="display:flex; justify-content:space-between; align-items:center;">
              <h4>External Databases</h4>
              <button class="btn-secondary btn-sm" onclick="dbShowConnectionWizard()" style="padding:2px 8px; font-size:10px;">+ Connect</button>
            </div>
            <div id="dbConnectionList" style="margin-top:6px;"></div>
            <div id="dbConnectionWizard" style="display:none; margin-top:8px; padding:8px; background:var(--bg-primary); border:1px solid var(--border-color); border-radius:6px;">
              <div style="display:flex; flex-direction:column; gap:6px;">
                <div style="display:flex; gap:4px; align-items:center;">
                  <label style="font-size:10px; color:var(--text-secondary); width:60px;">Provider</label>
                  <select id="dbProviderSelect" style="flex:1; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); padding:2px 4px; font-size:10px; border-radius:3px;">
                    <option value="postgresql">PostgreSQL</option>
                    <option value="mysql">MySQL</option>
                    <option value="sqlite">SQLite</option>
                    <option value="mongodb">MongoDB</option>
                    <option value="supabase">Supabase</option>
                    <option value="firebase">Firebase</option>
                  </select>
                </div>
                <div style="display:flex; gap:4px; align-items:center;">
                  <label style="font-size:10px; color:var(--text-secondary); width:60px;">Name</label>
                  <input id="dbConnNameInput" type="text" placeholder="My Database" style="flex:1; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); padding:2px 4px; font-size:10px; border-radius:3px;">
                </div>
                <div style="display:flex; gap:4px; align-items:center;">
                  <label style="font-size:10px; color:var(--text-secondary); width:60px;">Host</label>
                  <input id="dbHostInput" type="text" placeholder="localhost" style="flex:1; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); padding:2px 4px; font-size:10px; border-radius:3px;">
                </div>
                <div style="display:flex; gap:4px; align-items:center;">
                  <label style="font-size:10px; color:var(--text-secondary); width:60px;">Database</label>
                  <input id="dbNameInput" type="text" placeholder="mydb" style="flex:1; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); padding:2px 4px; font-size:10px; border-radius:3px;">
                </div>
                <div style="display:flex; gap:4px;">
                  <button class="btn-primary" onclick="dbAddConnection()" style="padding:3px 8px; font-size:10px;">Add</button>
                  <button class="btn-secondary" onclick="document.getElementById('dbConnectionWizard').style.display='none';" style="padding:3px 8px; font-size:10px;">Cancel</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- MCP Panel -->
        <div class="dashboard-panel" id="dashboardMcpPanel" style="display: none;">
          <div class="panel-header">
            <h3>MCP Servers</h3>
            <div class="panel-actions">
              <button class="btn-primary btn-sm" onclick="addMcpServer()">+ Add Server</button>
            </div>
          </div>

          <!-- Unity MCP Connection Cards (8.5.1) -->
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px;">
            <div class="mcp-connection-card" id="mcpUnityCard">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <strong style="font-size:12px;">Unity MCP</strong>
                <span class="mcp-status-dot" id="mcpUnityStatus" style="width:8px;height:8px;border-radius:50%;background:#666;display:inline-block;" title="Disconnected"></span>
              </div>
              <div style="font-size:10px;color:var(--text-secondary);margin-bottom:4px;">
                URL: <code>localhost:8080</code> | HTTP
              </div>
              <button class="btn-secondary btn-sm" onclick="pingUnityMcp()">Ping</button>
            </div>
            <div class="mcp-connection-card" id="mcpCoplayCard">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <strong style="font-size:12px;">Coplay MCP</strong>
                <span class="mcp-status-dot" id="mcpCoplayStatus" style="width:8px;height:8px;border-radius:50%;background:#666;display:inline-block;" title="Disconnected"></span>
              </div>
              <div style="font-size:10px;color:var(--text-secondary);margin-bottom:4px;">
                Transport: stdio/uvx
              </div>
              <button class="btn-secondary btn-sm" onclick="pingCoplayMcp()">Launch</button>
            </div>
          </div>

          <!-- Tool Catalog (8.5.2) -->
          <div class="settings-section" style="margin-bottom:8px;">
            <div class="section-header"><h4>Tool Catalog</h4></div>
            <div id="mcpToolCatalog" style="padding:8px; max-height:200px; overflow-y:auto;">
              <div class="mcp-tool-category">
                <div class="mcp-cat-header"><span class="mcp-cat-dot" style="background:#3b82f6;"></span> Scene Operations <span class="mcp-cat-server">Unity MCP</span></div>
              </div>
              <div class="mcp-tool-category">
                <div class="mcp-cat-header"><span class="mcp-cat-dot" style="background:#3b82f6;"></span> Editor Control <span class="mcp-cat-server">Unity MCP</span></div>
              </div>
              <div class="mcp-tool-category">
                <div class="mcp-cat-header"><span class="mcp-cat-dot" style="background:#a855f7;"></span> UI Toolkit <span class="mcp-cat-server">Coplay MCP</span></div>
              </div>
              <div class="mcp-tool-category">
                <div class="mcp-cat-header"><span class="mcp-cat-dot" style="background:#a855f7;"></span> Input System <span class="mcp-cat-server">Coplay MCP</span></div>
              </div>
              <div class="mcp-tool-category">
                <div class="mcp-cat-header"><span class="mcp-cat-dot" style="background:#a855f7;"></span> Event Wiring <span class="mcp-cat-server">Coplay MCP</span></div>
              </div>
              <div class="mcp-tool-category">
                <div class="mcp-cat-header"><span class="mcp-cat-dot" style="background:#f59e0b;"></span> Performance Profiling <span class="mcp-cat-server">Coplay MCP</span></div>
              </div>
              <div class="mcp-tool-category">
                <div class="mcp-cat-header"><span class="mcp-cat-dot" style="background:#ec4899;"></span> AI Generation <span class="mcp-cat-server">Coplay MCP</span></div>
              </div>
              <div class="mcp-tool-category">
                <div class="mcp-cat-header"><span class="mcp-cat-dot" style="background:#10b981;"></span> Package Management <span class="mcp-cat-server">Coplay MCP</span></div>
              </div>
              <div class="mcp-tool-category">
                <div class="mcp-cat-header"><span class="mcp-cat-dot" style="background:#a855f7;"></span> Advanced Prefab/Asset <span class="mcp-cat-server">Coplay MCP</span></div>
              </div>
              <div class="mcp-tool-category excluded">
                <div class="mcp-cat-header"><span class="mcp-cat-dot" style="background:#666;"></span> <s>create_coplay_task</s> <span class="mcp-cat-server" style="color:var(--error-text);">Excluded</span></div>
                <div style="font-size:9px;color:var(--text-secondary);padding-left:16px;">Delegates to external AI — SpaceCode calls tools directly</div>
              </div>
            </div>
          </div>

          <div class="mcp-split-container">
            <!-- MCP Server List -->
            <div class="mcp-server-list" id="mcpServerList">
              <div class="empty-state">No MCP servers configured</div>
            </div>

            <!-- MCP Server Details -->
            <div class="mcp-details-panel" id="mcpDetailsSection">
              <div class="mcp-details-empty" id="mcpDetailsEmpty">
                <div class="icon">&#x1F50C;</div>
                <p>Select a server to view details</p>
              </div>
              <div class="mcp-details" id="mcpDetails" style="display: none;">
                <!-- Populated by JS when server selected -->
              </div>
            </div>
          </div>
        </div>

        <!-- Logs Panel -->
        <div class="dashboard-panel" id="dashboardLogsPanel" style="display: none;">
          <div class="panel-header">
            <h3>Logs</h3>
            <div class="panel-actions">
              <button class="btn-secondary btn-sm" onclick="clearAllLogs()">Clear All</button>
            </div>
          </div>

          <!-- Log Channels -->
          <div class="logs-section">
            <div class="section-header">
              <h4>Output Channels</h4>
            </div>
            <div class="logs-channels">
              <button class="log-channel-btn" onclick="showLogChannel('general')">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                General Logs
              </button>
              <button class="log-channel-btn" onclick="showLogChannel('mcp')">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
                MCP Logs
              </button>
              <button class="log-channel-btn" onclick="showLogChannel('api')">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>
                API Logs
              </button>
              <button class="log-channel-btn" onclick="showLogChannel('tools')">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>
                Tools Logs
              </button>
            </div>
          </div>

          <!-- Dev Tools -->
          <div class="logs-section">
            <div class="section-header">
              <h4>Developer Tools</h4>
            </div>
            <div class="logs-dev-tools">
              <button class="btn-secondary" onclick="openDevTools()">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
                Developer Console
              </button>
              <button class="btn-secondary" onclick="openTerminal()">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>
                Open Terminal
              </button>
            </div>
          </div>
        </div>

        <!-- Settings Panel -->
        <div class="dashboard-panel" id="dashboardSettingsPanel" style="display: none;">
          <div class="panel-header">
            <h3>Settings</h3>
            <div class="panel-actions">
              <button class="btn-primary btn-sm" onclick="saveSettings()">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                Save
              </button>
            </div>
          </div>

          <!-- Models Section -->
          <div class="settings-section models-section">
            <div class="section-header">
              <h4>Models</h4>
              <div class="section-actions">
                <button class="btn-small" onclick="verifyAllModels()" id="verifyModelsBtn">
                  <span class="btn-icon">🔍</span> Verify All
                </button>
                <button class="btn-small" onclick="refreshOpenaiModels()" id="listOpenaiModelsBtn">
                  <span class="btn-icon">📋</span> List OpenAI Models
                </button>
              </div>
            </div>

            <!-- Model Provider Tabs -->
            <div class="model-tabs">
              <button class="model-tab active" data-provider="claude" onclick="switchModelTab('claude')">
                <span class="tab-icon claude-icon">◆</span> Claude
              </button>
              <button class="model-tab" data-provider="gpt" onclick="switchModelTab('gpt')">
                <span class="tab-icon gpt-icon">●</span> GPT
              </button>
            </div>

            <!-- Claude Models Panel -->
            <div class="model-panel" id="claudeModelsPanel">
              <div class="model-list">
                ${CLAUDE_MODELS.map(m => `
                  <div class="model-card ${m.isDefault ? 'default' : ''}" data-model-id="${m.id}">
                    <div class="model-header">
                      <div class="model-name">
                        <span class="model-icon claude-icon">◆</span>
                        <span class="model-label">${m.label}</span>
                        ${m.isDefault ? '<span class="default-badge">Default</span>' : ''}
                      </div>
                      <div class="model-actions">
                        <span class="verify-status" id="verify-${m.id}">—</span>
                        <a href="#" onclick="openExternalUrl('${m.docsUrl}')" class="docs-link" title="View documentation">📖</a>
                        <button class="btn-tiny ${m.isDefault ? 'active' : ''}" onclick="selectDefaultModel('claude', '${m.id}')" title="Set as default">
                          ${m.isDefault ? '✓' : '○'}
                        </button>
                      </div>
                    </div>
                    <div class="model-tier tier-${m.tier}">${m.tier}</div>
                    <p class="model-description">${m.description}</p>
                    <div class="model-meta">
                      <div class="model-specs">
                        ${m.specializations.map(s => `<span class="spec-tag">${s}</span>`).join('')}
                      </div>
                      <div class="model-pricing">
                        ${m.pricing
                          ? `<span class="price">$${m.pricing.input}/$${m.pricing.output}</span><span class="price-unit">per MTok</span>`
                          : `<a href="#" onclick="openExternalUrl('${m.docsUrl}')" class="pricing-link">See pricing</a>`
                        }
                      </div>
                    </div>
                    <div class="model-context">
                      <div class="context-row">
                        <span class="label">Context</span>
                        <span class="value">${Math.round(m.contextWindow / 1000)}K</span>
                        <div class="context-bar"><div class="context-bar-fill context" style="width: ${Math.min(100, (m.contextWindow / 200000) * 100)}%"></div></div>
                      </div>
                      <div class="context-row">
                        <span class="label">Output</span>
                        <span class="value">${Math.round(m.maxOutput / 1000)}K</span>
                        <div class="context-bar"><div class="context-bar-fill output" style="width: ${Math.min(100, (m.maxOutput / 64000) * 100)}%"></div></div>
                      </div>
                    </div>
                    <div class="model-best-for">
                      <span class="best-for-label">Best for:</span>
                      ${m.bestFor.map(u => `<span class="use-tag">${u}</span>`).join('')}
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>

            <!-- GPT Models Panel -->
            <div class="model-panel hidden" id="gptModelsPanel">
              <div class="model-list">
                ${GPT_MODELS.map(m => `
                  <div class="model-card ${m.isDefault ? 'default' : ''}" data-model-id="${m.id}">
                    <div class="model-header">
                      <div class="model-name">
                        <span class="model-icon gpt-icon">●</span>
                        <span class="model-label">${m.label}</span>
                        ${m.isDefault ? '<span class="default-badge">Default</span>' : ''}
                      </div>
                      <div class="model-actions">
                        <span class="verify-status" id="verify-${m.id}">—</span>
                        <a href="#" onclick="openExternalUrl('${m.docsUrl}')" class="docs-link" title="View documentation">📖</a>
                        <button class="btn-tiny ${m.isDefault ? 'active' : ''}" onclick="selectDefaultModel('gpt', '${m.id}')" title="Set as default">
                          ${m.isDefault ? '✓' : '○'}
                        </button>
                      </div>
                    </div>
                    <div class="model-tier tier-${m.tier}">${m.tier}</div>
                    <p class="model-description">${m.description}</p>
                    <div class="model-meta">
                      <div class="model-specs">
                        ${m.specializations.map(s => `<span class="spec-tag">${s}</span>`).join('')}
                      </div>
                      <div class="model-pricing">
                        ${m.pricing
                          ? `<span class="price">$${m.pricing.input}/$${m.pricing.output}</span><span class="price-unit">per MTok</span>`
                          : `<a href="#" onclick="openExternalUrl('${m.docsUrl}')" class="pricing-link">See pricing</a>`
                        }
                      </div>
                    </div>
                    <div class="model-context">
                      <div class="context-row">
                        <span class="label">Context</span>
                        <span class="value">${Math.round(m.contextWindow / 1000)}K</span>
                        <div class="context-bar"><div class="context-bar-fill context" style="width: ${Math.min(100, (m.contextWindow / 200000) * 100)}%"></div></div>
                      </div>
                      <div class="context-row">
                        <span class="label">Output</span>
                        <span class="value">${Math.round(m.maxOutput / 1000)}K</span>
                        <div class="context-bar"><div class="context-bar-fill output" style="width: ${Math.min(100, (m.maxOutput / 64000) * 100)}%"></div></div>
                      </div>
                    </div>
                    <div class="model-best-for">
                      <span class="best-for-label">Best for:</span>
                      ${m.bestFor.map(u => `<span class="use-tag">${u}</span>`).join('')}
                    </div>
                  </div>
                `).join('')}
              </div>
              <div class="openai-models-list" id="openaiModelsList" style="display:none; margin-top: 12px;">
                <div class="model-list-header">OpenAI API model list</div>
                <pre id="openaiModelsText" class="model-list-text"></pre>
              </div>
            </div>

            <!-- Dev-only Pricing Update -->
            <div class="settings-section" id="devPricingSection" style="display:none;">
              <div class="section-header">
                <h4>Developer: Pricing Update</h4>
              </div>
              <div class="settings-form">
                <div class="form-group">
                  <label for="devPricingText">Paste model page content</label>
                  <textarea id="devPricingText" class="input-field" rows="6" placeholder="Paste the pricing section here..."></textarea>
                  <div class="form-hint" style="margin-top:6px;">
                    Paste the model page text or URL. The model will be auto-detected.
                  </div>
                </div>
                <div class="form-actions">
                  <button class="btn-primary btn-sm" onclick="applyPricingOverride()">Parse & Apply</button>
                  <button class="btn-secondary btn-sm" onclick="refreshPricingOverrides()">Refresh Overrides</button>
                </div>
                <div class="form-hint" id="devPricingStatus" style="margin-top:8px;"></div>
                <div class="form-group" style="margin-top:10px;">
                  <label>Current overrides</label>
                  <pre id="devPricingOverrides" class="model-list-text"></pre>
                </div>
              </div>
            </div>

            <!-- Dev-only Settings Export/Import -->
            <div class="settings-section" id="devExportSection" style="display:none;">
              <div class="section-header">
                <h4>Developer: Settings Backup</h4>
              </div>
              <div class="settings-form">
                <p class="form-hint" style="margin-bottom:12px;">
                  Export all settings including API keys to a JSON file. Use this to preserve your configuration when refactoring or reinstalling.
                </p>
                <div class="form-group checkbox-group">
                  <input type="checkbox" id="devExportIncludeKeys" checked />
                  <label for="devExportIncludeKeys">Include API keys (sensitive!)</label>
                </div>
                <div class="form-actions" style="gap:8px;">
                  <button class="btn-primary btn-sm" onclick="devExportSettings()">Export Settings</button>
                  <button class="btn-secondary btn-sm" onclick="devImportSettings()">Import Settings</button>
                </div>
                <div class="form-hint" id="devExportStatus" style="margin-top:8px;"></div>
              </div>
            </div>

            <!-- Verification Status -->
            <div class="verification-status" id="modelVerificationStatus">
              <span class="status-text">Models not yet verified</span>
            </div>
          </div>

          <!-- ═══════════════════════════════════════════════════════════════════ -->
          <!-- API KEYS & CONNECTION METHODS — DO NOT DELETE THIS SECTION        -->
          <!-- This section handles authentication for Claude and OpenAI APIs     -->
          <!-- ═══════════════════════════════════════════════════════════════════ -->

          <!-- API Keys Section -->
          <div class="settings-section" id="apiKeysSection">
            <div class="section-header">
              <h4>🔑 API Keys</h4>
            </div>
            <div class="settings-form">
              <div class="form-group">
                <label for="settingsClaudeKey">Claude API Key</label>
                <div class="input-with-status">
                  <div class="input-reveal-wrapper">
                    <input type="password" id="settingsClaudeKey" placeholder="sk-ant-..." class="input-field" />
                    <button type="button" class="btn-reveal" id="claudeKeyReveal" onclick="toggleApiKeyVisibility('claude')" title="Show/Hide key">Show</button>
                  </div>
                  <span class="key-status" id="claudeKeyStatus">Not set</span>
                </div>
                <div class="form-hint">Get your key from <a href="https://console.anthropic.com/settings/keys" onclick="openExternal('https://console.anthropic.com/settings/keys')">Anthropic Console</a></div>
              </div>
              <div class="form-group">
                <label for="settingsGptKey">OpenAI API Key</label>
                <div class="input-with-status">
                  <div class="input-reveal-wrapper">
                    <input type="password" id="settingsGptKey" placeholder="sk-..." class="input-field" />
                    <button type="button" class="btn-reveal" id="gptKeyReveal" onclick="toggleApiKeyVisibility('openai')" title="Show/Hide key">Show</button>
                  </div>
                  <span class="key-status" id="gptKeyStatus">Not set</span>
                </div>
                <div class="form-hint">Get your key from <a href="https://platform.openai.com/api-keys" onclick="openExternal('https://platform.openai.com/api-keys')">OpenAI Platform</a></div>
              </div>
              <div class="form-actions">
                <button class="btn-primary btn-sm" onclick="saveApiKeys()">Save API Keys</button>
              </div>
            </div>
          </div>

          <!-- Connection Methods Section -->
          <div class="settings-section" id="connectionMethodsSection">
            <div class="section-header">
              <h4>🔌 Connection Methods</h4>
            </div>
            <div class="settings-form">
              <p class="form-description" style="margin-bottom: 12px; color: var(--text-secondary); font-size: 12px;">
                CLI is recommended when available. API key is used as fallback for features like image uploads.
              </p>

              <div class="form-group">
                <label for="settingsClaudeConnection">Claude Connection</label>
                <select id="settingsClaudeConnection" class="select-field" onchange="onConnectionMethodChange('claude', this.value)">
                  <option value="cli">CLI (Recommended)</option>
                  <option value="api">API Key (Direct — Required for images)</option>
                </select>
                <div class="form-hint" id="claudeConnectionHint">Uses Claude CLI</div>
              </div>
              <div class="form-group">
                <label for="settingsGptConnection">OpenAI Connection</label>
                <select id="settingsGptConnection" class="select-field" onchange="onConnectionMethodChange('gpt', this.value)">
                  <option value="cli">CLI (Recommended)</option>
                  <option value="api">API Key (Direct — Required for images)</option>
                </select>
                <div class="form-hint" id="gptConnectionHint">Uses OpenAI CLI for API access</div>
              </div>

              <!-- CLI Status -->
              <div class="cli-status-panel" id="cliStatusPanel">
                <div class="cli-status-row">
                  <span class="cli-label">Claude CLI:</span>
                  <span class="cli-status" id="claudeCliStatus">Checking...</span>
                  <button class="btn-xs btn-secondary" id="claudeCliAction" onclick="handleCliAction('claude')" style="display:none;">Install</button>
                </div>
                <div class="cli-status-row">
                  <span class="cli-label">OpenAI CLI:</span>
                  <span class="cli-status" id="gptCliStatus">Checking...</span>
                  <button class="btn-xs btn-secondary" id="gptCliAction" onclick="handleCliAction('gpt')" style="display:none;">Install</button>
                </div>
              </div>

              <p class="form-description" style="margin-top: 12px; color: var(--text-tertiary); font-size: 11px;">
                💡 Auto-fallback: If CLI unavailable for a specific operation (e.g., images), you'll be prompted to use API key.
              </p>
            </div>
          </div>

          <!-- ═══════════════════════════════════════════════════════════════════ -->
          <!-- END API KEYS & CONNECTION METHODS SECTION                          -->
          <!-- ═══════════════════════════════════════════════════════════════════ -->

          <!-- Usage & Plan Section -->
          <div class="settings-section" id="usagePlanSection">
            <div class="section-header">
              <h4>📊 Usage & Plan</h4>
              <div class="section-actions">
                <button class="btn-small" onclick="refreshUsageStats()" id="refreshUsageBtn">
                  <span class="btn-icon">🔄</span> Refresh
                </button>
              </div>
            </div>
            <div class="settings-form">
              <!-- Plan Detection -->
              <div class="usage-plan-cards">
                <div class="plan-card claude-plan">
                  <div class="plan-header">
                    <span class="plan-icon">◆</span>
                    <span class="plan-name">Claude</span>
                  </div>
                  <div class="plan-type" id="claudePlanType">
                    <span class="plan-badge cli">CLI</span>
                    <span class="plan-desc">Subscription included</span>
                  </div>
                  <div class="plan-usage" id="claudeUsageStats">
                    <div class="usage-row">
                      <span class="usage-label">Today:</span>
                      <span class="usage-value" id="claudeUsageToday">$0.00</span>
                    </div>
                    <div class="usage-row">
                      <span class="usage-label">This Month:</span>
                      <span class="usage-value" id="claudeUsageMonth">$0.00</span>
                    </div>
                    <div class="usage-row">
                      <span class="usage-label">Calls:</span>
                      <span class="usage-value" id="claudeCallsTotal">0</span>
                    </div>
                  </div>
                  <div class="plan-actions">
                    <a href="#" onclick="openExternalUrl('https://console.anthropic.com/settings/plans')" class="plan-link">View Plan</a>
                    <a href="#" onclick="openExternalUrl('https://console.anthropic.com/settings/usage')" class="plan-link">Usage Dashboard</a>
                  </div>
                </div>

                <div class="plan-card gpt-plan">
                  <div class="plan-header">
                    <span class="plan-icon">●</span>
                    <span class="plan-name">OpenAI</span>
                  </div>
                  <div class="plan-type" id="gptPlanType">
                    <span class="plan-badge api">API</span>
                    <span class="plan-desc">Pay-as-you-go</span>
                  </div>
                  <div class="plan-usage" id="gptUsageStats">
                    <div class="usage-row">
                      <span class="usage-label">Today:</span>
                      <span class="usage-value" id="gptUsageToday">$0.00</span>
                    </div>
                    <div class="usage-row">
                      <span class="usage-label">This Month:</span>
                      <span class="usage-value" id="gptUsageMonth">$0.00</span>
                    </div>
                    <div class="usage-row">
                      <span class="usage-label">Calls:</span>
                      <span class="usage-value" id="gptCallsTotal">0</span>
                    </div>
                  </div>
                  <div class="plan-actions">
                    <a href="#" onclick="openExternalUrl('https://platform.openai.com/settings/organization/billing/overview')" class="plan-link">Billing</a>
                    <a href="#" onclick="openExternalUrl('https://platform.openai.com/usage')" class="plan-link">Usage Dashboard</a>
                  </div>
                </div>
              </div>

              <!-- Total Usage Summary -->
              <div class="usage-summary-bar" id="usageSummaryBar">
                <div class="summary-item">
                  <span class="summary-label">Total Today</span>
                  <span class="summary-value" id="totalUsageToday">$0.00</span>
                </div>
                <div class="summary-item">
                  <span class="summary-label">Total This Month</span>
                  <span class="summary-value" id="totalUsageMonth">$0.00</span>
                </div>
                <div class="summary-item">
                  <span class="summary-label">All Time</span>
                  <span class="summary-value" id="totalUsageAllTime">$0.00</span>
                </div>
              </div>

              <p class="form-hint" style="margin-top:12px;">
                Usage is tracked locally. Visit provider dashboards for official billing data.
              </p>
            </div>
          </div>

          <!-- Git Settings Section -->
          <div class="settings-section">
            <div class="section-header">
              <h4>Git Settings</h4>
            </div>
            <div class="settings-form">
              <div class="form-group">
                <label for="gitRepoUrl">Repository URL <span id="gitRepoUrlSource" style="margin-left: 6px; font-size: 11px; color: var(--text-secondary);"></span></label>
                <input type="text" id="gitRepoUrl" placeholder="https://github.com/org/repo.git" class="input-field" />
                <div class="form-hint" id="gitRepoUrlDetected"></div>
              </div>
              <div class="form-group">
                <label for="gitBranch">Default Branch <span id="gitBranchSource" style="margin-left: 6px; font-size: 11px; color: var(--text-secondary);"></span></label>
                <input type="text" id="gitBranch" placeholder="main" class="input-field" />
                <div class="form-hint" id="gitBranchDetected"></div>
              </div>
              <div class="form-group">
                <label for="gitCommitMessage">Default Commit Message</label>
                <input type="text" id="gitCommitMessage" placeholder="chore: update" class="input-field" />
              </div>
              <div class="form-group checkbox-group">
                <label>
                  <input type="checkbox" id="gitAutoPush" checked />
                  Auto-push after commit
                </label>
              </div>
              <div class="form-actions">
                <button class="btn-secondary btn-sm" onclick="clearGitOverrides()">Clear Overrides</button>
                <button class="btn-primary btn-sm" onclick="saveGitSettings()">Save Git Settings</button>
              </div>
            </div>
          </div>

          <!-- Token Budget Section -->
          <div class="settings-section">
            <div class="section-header">
              <h4>Token Budget</h4>
            </div>
            <div class="settings-form">
              <div class="form-group">
                <label for="settingsMaxTokens">Max Total Tokens</label>
                <input type="number" id="settingsMaxTokens" value="8000" min="1000" max="32000" class="input-field" />
                <div class="form-hint">Default: 8000. Maximum context window size.</div>
              </div>
              <div class="budget-sliders">
                <div class="budget-row">
                  <label>Recent Messages</label>
                  <input type="range" id="budgetMessages" min="10" max="50" value="30" class="slider" />
                  <span class="budget-value" id="budgetMessagesValue">30%</span>
                </div>
                <div class="budget-row">
                  <label>Retrieved Chunks</label>
                  <input type="range" id="budgetChunks" min="20" max="70" value="50" class="slider" />
                  <span class="budget-value" id="budgetChunksValue">50%</span>
                </div>
                <div class="budget-row">
                  <label>Specialist KB</label>
                  <input type="range" id="budgetKb" min="5" max="30" value="15" class="slider" />
                  <span class="budget-value" id="budgetKbValue">15%</span>
                </div>
                <div class="budget-row">
                  <label>System Prompt</label>
                  <input type="range" id="budgetSystem" min="2" max="15" value="5" class="slider" />
                  <span class="budget-value" id="budgetSystemValue">5%</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Priority Order Section -->
          <div class="settings-section">
            <div class="section-header">
              <h4>Context Priority Order</h4>
              <div class="form-hint">Drag to reorder. Higher = more important.</div>
            </div>
            <div class="priority-list" id="priorityList">
              <div class="priority-item" data-priority="policy" draggable="true">
                <span class="drag-handle">⋮⋮</span>
                <span class="priority-name">Project/Policy</span>
              </div>
              <div class="priority-item" data-priority="domain-kb" draggable="true">
                <span class="drag-handle">⋮⋮</span>
                <span class="priority-name">Domain KB</span>
              </div>
              <div class="priority-item" data-priority="code" draggable="true">
                <span class="drag-handle">⋮⋮</span>
                <span class="priority-name">Code</span>
              </div>
              <div class="priority-item" data-priority="tickets" draggable="true">
                <span class="drag-handle">⋮⋮</span>
                <span class="priority-name">Tickets</span>
              </div>
              <div class="priority-item" data-priority="chat" draggable="true">
                <span class="drag-handle">⋮⋮</span>
                <span class="priority-name">Chat History</span>
              </div>
            </div>
          </div>

          <!-- General Settings -->
          <div class="settings-section">
            <div class="section-header">
              <h4>General</h4>
            </div>
            <div class="settings-form">
              <div class="form-group checkbox-group">
                <label>
                  <input type="checkbox" id="settingsAutoExecute" />
                  Auto-execute approved plans
                </label>
              </div>
              <div class="form-group checkbox-group">
                <label>
                  <input type="checkbox" id="settingsAutoClose" checked />
                  Auto-close tickets on completion
                </label>
              </div>
              <div class="form-group checkbox-group">
                <label>
                  <input type="checkbox" id="settingsInjectRules" checked />
                  Auto-inject sector rules
                </label>
              </div>
              <div class="form-group">
                <label for="settingsDefaultModel">Default AI Model</label>
                <select id="settingsDefaultModel" class="input-field select">
                  <option value="claude" selected>Claude (Anthropic)</option>
                  <option value="gpt">GPT (OpenAI)</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Danger Zone -->
          <div class="settings-section danger-zone">
            <div class="section-header">
              <h4>Danger Zone</h4>
            </div>
            <div class="danger-actions">
              <button class="btn-danger" onclick="confirmResetSettings()">Reset All Settings</button>
              <button class="btn-danger" onclick="confirmClearAllData()">Clear All Data</button>
            </div>
          </div>

          <!-- Sound Settings -->
          <div class="settings-section">
            <div class="section-header"><h4>Sound Notifications</h4></div>
            <div class="settings-form" id="soundSettingsForm">
              <div class="form-group" style="display:flex; align-items:center; justify-content:space-between;">
                <label>Enable sounds</label>
                <input type="checkbox" id="settingsSoundEnabled" onchange="saveSoundSetting('enabled', this.checked)" />
              </div>
              <div class="form-group">
                <label>Volume <span id="soundVolumeLabel" style="color:var(--text-secondary);">(50%)</span></label>
                <input type="range" id="settingsSoundVolume" min="0" max="100" value="50" style="width:100%;" oninput="soundVolumePreview(this.value)" onchange="saveSoundSetting('volume', this.value / 100)" />
              </div>
              <div style="font-size:10px; color:var(--text-secondary); margin:4px 0 8px;">Per-event toggles:</div>
              <div class="form-group" style="display:flex; align-items:center; justify-content:space-between;">
                <label style="font-size:11px;">AI response complete</label>
                <input type="checkbox" id="soundEvt_aiComplete" checked onchange="saveSoundEventSetting('aiComplete', this.checked)" />
              </div>
              <div class="form-group" style="display:flex; align-items:center; justify-content:space-between;">
                <label style="font-size:11px;">AI error</label>
                <input type="checkbox" id="soundEvt_aiError" checked onchange="saveSoundEventSetting('aiError', this.checked)" />
              </div>
              <div class="form-group" style="display:flex; align-items:center; justify-content:space-between;">
                <label style="font-size:11px;">Build success</label>
                <input type="checkbox" id="soundEvt_buildSuccess" checked onchange="saveSoundEventSetting('buildSuccess', this.checked)" />
              </div>
              <div class="form-group" style="display:flex; align-items:center; justify-content:space-between;">
                <label style="font-size:11px;">Build fail</label>
                <input type="checkbox" id="soundEvt_buildFail" checked onchange="saveSoundEventSetting('buildFail', this.checked)" />
              </div>
              <div class="form-group" style="display:flex; align-items:center; justify-content:space-between;">
                <label style="font-size:11px;">Plan ready</label>
                <input type="checkbox" id="soundEvt_planReady" checked onchange="saveSoundEventSetting('planReady', this.checked)" />
              </div>
              <div class="form-group" style="display:flex; align-items:center; justify-content:space-between;">
                <label style="font-size:11px;">Workflow done</label>
                <input type="checkbox" id="soundEvt_workflowDone" checked onchange="saveSoundEventSetting('workflowDone', this.checked)" />
              </div>
              <div class="form-group" style="display:flex; align-items:center; justify-content:space-between;">
                <label style="font-size:11px;">Job queued</label>
                <input type="checkbox" id="soundEvt_jobQueued" checked onchange="saveSoundEventSetting('jobQueued', this.checked)" />
              </div>
              <div class="form-group" style="display:flex; align-items:center; justify-content:space-between;">
                <label style="font-size:11px;">Job approved</label>
                <input type="checkbox" id="soundEvt_jobApproved" checked onchange="saveSoundEventSetting('jobApproved', this.checked)" />
              </div>
              <div class="form-group" style="display:flex; align-items:center; justify-content:space-between;">
                <label style="font-size:11px;">Sector violation</label>
                <input type="checkbox" id="soundEvt_sectorViolation" checked onchange="saveSoundEventSetting('sectorViolation', this.checked)" />
              </div>
              <div class="form-group" style="display:flex; align-items:center; justify-content:space-between;">
                <label style="font-size:11px;">Notification</label>
                <input type="checkbox" id="soundEvt_notification" checked onchange="saveSoundEventSetting('notification', this.checked)" />
              </div>
              <p class="form-hint" style="margin-top:6px;">Sound files: media/sounds/*.mp3</p>
            </div>
          </div>

          <!-- Developer Settings (12.1) -->
          <div class="settings-section">
            <div class="section-header"><h4>Developer</h4></div>
            <div class="settings-form">
              <div class="form-group" style="display:flex; align-items:center; justify-content:space-between;">
                <label>Show panel borders</label>
                <input type="checkbox" id="settingsShowBorders" onchange="togglePanelBorders(this.checked)" />
              </div>
            </div>
          </div>
        </div>

        <!-- Info Panel -->
        <!-- Mission Panel (8.1) -->
        <div class="dashboard-panel" id="dashboardMissionPanel" style="display: none;">
          <div class="panel-header">
            <h3>Mission Control</h3>
            <div class="panel-actions">
              <button class="btn-secondary btn-sm" onclick="refreshMission()">Refresh</button>
            </div>
          </div>
          <!-- Approval Queue -->
          <div class="settings-section">
            <div class="section-header"><h4>Approval Queue</h4></div>
            <div id="missionApprovalQueue" style="padding:8px;">
              <div style="color:var(--text-secondary);font-size:11px;">No pending approvals.</div>
            </div>
          </div>
          <!-- Project Milestones -->
          <div class="settings-section">
            <div class="section-header"><h4>Milestones</h4></div>
            <div id="missionMilestones" style="padding:8px;">
              <div style="color:var(--text-secondary);font-size:11px;">No milestones defined. Create milestones to track project progress.</div>
            </div>
            <div style="padding:0 8px 8px;">
              <button class="btn-secondary btn-sm" onclick="createMilestone()">+ Add Milestone</button>
            </div>
          </div>
          <!-- Pending Tasks -->
          <div class="settings-section">
            <div class="section-header"><h4>Pending Tasks</h4></div>
            <div id="missionPendingTasks" style="padding:8px;">
              <div style="color:var(--text-secondary);font-size:11px;">No pending tasks.</div>
            </div>
          </div>
          <!-- Mission Summary Stats -->
          <div class="docs-stats" style="margin-top:8px;">
            <div class="stat-card">
              <div class="stat-value" id="missionOpenTickets">0</div>
              <div class="stat-label">Open Tickets</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" id="missionActivePlans">0</div>
              <div class="stat-label">Active Plans</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" id="missionPendingJobs">0</div>
              <div class="stat-label">Pending Jobs</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" id="missionCompletedToday">0</div>
              <div class="stat-label">Completed Today</div>
            </div>
          </div>
        </div>

        <!-- Storage Panel (8.2) -->
        <div class="dashboard-panel" id="dashboardStoragePanel" style="display: none;">
          <div class="panel-header">
            <h3>Storage</h3>
            <div class="panel-actions">
              <button class="btn-secondary btn-sm" onclick="refreshStorage()">Refresh</button>
            </div>
          </div>
          <div class="settings-section">
            <div class="section-header"><h4>Storage Location</h4></div>
            <div style="padding:8px;">
              <div class="info-row" style="display:flex; justify-content:space-between; padding:6px 10px; background:var(--bg-tertiary); border-radius:4px; margin-bottom:4px;">
                <span style="color:var(--text-secondary); font-size:11px;">Type</span>
                <span id="storageType" style="font-size:11px;">globalState</span>
              </div>
              <div class="info-row" style="display:flex; justify-content:space-between; padding:6px 10px; background:var(--bg-tertiary); border-radius:4px; margin-bottom:4px;">
                <span style="color:var(--text-secondary); font-size:11px;">Location</span>
                <span id="storageLocation" style="font-size:11px; max-width:200px; overflow:hidden; text-overflow:ellipsis;">.spacecode/</span>
              </div>
              <div class="info-row" style="display:flex; justify-content:space-between; padding:6px 10px; background:var(--bg-tertiary); border-radius:4px;">
                <span style="color:var(--text-secondary); font-size:11px;">DB Path</span>
                <span id="storageDbPath" style="font-size:10px; max-width:280px; overflow:hidden; text-overflow:ellipsis; color:var(--accent-color); font-family:monospace;" title="">—</span>
              </div>
            </div>
          </div>
          <!-- Usage Bars -->
          <div class="settings-section">
            <div class="section-header"><h4>Usage</h4></div>
            <div style="padding:8px;">
              <div class="storage-usage-item">
                <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:2px;">
                  <span>Chat History</span>
                  <span id="storageChatCount">0 messages</span>
                </div>
                <div class="storage-bar"><div class="storage-bar-fill" id="storageChatBar" style="width:0%;"></div></div>
              </div>
              <div class="storage-usage-item">
                <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:2px;">
                  <span>Embeddings</span>
                  <span id="storageEmbeddingCount">0 vectors</span>
                </div>
                <div class="storage-bar"><div class="storage-bar-fill" id="storageEmbeddingBar" style="width:0%;"></div></div>
              </div>
              <div class="storage-usage-item">
                <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:2px;">
                  <span>Plans</span>
                  <span id="storagePlanCount">0 plans</span>
                </div>
                <div class="storage-bar"><div class="storage-bar-fill" id="storagePlanBar" style="width:0%;"></div></div>
              </div>
              <div class="storage-usage-item">
                <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:2px;">
                  <span>Tickets</span>
                  <span id="storageTicketCount">0 tickets</span>
                </div>
                <div class="storage-bar"><div class="storage-bar-fill" id="storageTicketBar" style="width:0%;"></div></div>
              </div>
              <div class="storage-usage-item">
                <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:2px;">
                  <span>Handoffs</span>
                  <span id="storageHandoffCount">0 handoffs</span>
                </div>
                <div class="storage-bar"><div class="storage-bar-fill" id="storageHandoffBar" style="width:0%;"></div></div>
              </div>
            </div>
          </div>
          <!-- Chat Sessions / Recent Messages -->
          <div class="settings-section">
            <div class="section-header">
              <h4>Chat Sessions</h4>
              <button class="btn-secondary btn-sm" onclick="browseDbMessages()">Browse</button>
            </div>
            <div id="storageDbBrowser" style="padding:8px; max-height:300px; overflow-y:auto;">
              <div style="color:var(--text-secondary); font-size:11px;">Click "Browse" to load recent messages from the SQLite database.</div>
            </div>
          </div>
          <!-- Actions -->
          <div class="settings-section">
            <div class="section-header"><h4>Actions</h4></div>
            <div style="padding:8px; display:flex; gap:6px; flex-wrap:wrap;">
              <button class="btn-secondary btn-sm" onclick="exportStorageData()">Export All</button>
              <button class="btn-secondary btn-sm" onclick="clearChatHistory()">Clear Chat History</button>
              <button class="btn-secondary btn-sm" onclick="clearEmbeddings()">Clear Embeddings</button>
              <button class="btn-secondary btn-sm" style="color:var(--error-text);" onclick="clearAllStorage()">Clear All</button>
            </div>
          </div>
        </div>

        <!-- Art Studio Panel (8.4) -->
        <div class="dashboard-panel" id="dashboardArtPanel" style="display: none;">
          <div class="panel-header">
            <h3>Art Studio</h3>
            <div class="panel-actions">
              <button class="btn-secondary btn-sm" onclick="refreshArtStudio()">Refresh</button>
            </div>
          </div>
          <!-- Style Storage -->
          <div class="settings-section">
            <div class="section-header"><h4>Style Guide</h4></div>
            <div id="artStyleGuide" style="padding:8px;">
              <div style="color:var(--text-secondary);font-size:11px;">No style guide configured. Set up colors, fonts, and themes.</div>
            </div>
            <div style="padding:0 8px 8px;">
              <button class="btn-secondary btn-sm" onclick="setupStyleGuide()">Setup Style Guide</button>
            </div>
          </div>
          <!-- Color Palette -->
          <div class="settings-section">
            <div class="section-header"><h4>Color Palette</h4></div>
            <div id="artColorPalette" style="padding:8px; display:flex; gap:4px; flex-wrap:wrap;">
              <div style="color:var(--text-secondary);font-size:11px;">No colors defined.</div>
            </div>
          </div>
          <!-- Recent Assets -->
          <div class="settings-section">
            <div class="section-header"><h4>Recent Assets</h4></div>
            <div id="artRecentAssets" style="padding:8px;">
              <div style="color:var(--text-secondary);font-size:11px;">No recent assets.</div>
            </div>
          </div>
          <!-- Image Generation -->
          <div class="settings-section">
            <div class="section-header"><h4>Image Generation</h4></div>
            <div style="padding:8px;">
              <textarea id="artGenPrompt" placeholder="Describe the image to generate..." style="width:100%; min-height:60px; background:var(--input-bg); border:1px solid var(--border-color); border-radius:6px; padding:8px; color:var(--text-primary); font-size:12px; resize:vertical;"></textarea>
              <div style="display:flex; gap:6px; margin-top:6px;">
                <button class="btn-primary btn-sm" onclick="generateArtImage()">Generate</button>
                <select id="artGenPreset" class="ticket-select" style="font-size:11px;">
                  <option value="concept">Concept Art</option>
                  <option value="ui">UI Element</option>
                  <option value="icon">Icon</option>
                  <option value="sprite">Sprite</option>
                  <option value="texture">Texture</option>
                </select>
              </div>
            </div>
          </div>
          <!-- Asset Library -->
          <div class="settings-section">
            <div class="section-header"><h4>Asset Library</h4></div>
            <div id="artAssetLibrary" style="padding:8px; display:grid; grid-template-columns:repeat(auto-fill,minmax(80px,1fr)); gap:8px;">
              <div style="color:var(--text-secondary);font-size:11px; grid-column:1/-1;">No assets in library.</div>
            </div>
          </div>
        </div>

        <div class="dashboard-panel" id="dashboardInfoPanel" style="display: none;">
          <div class="panel-header">
            <h3>Build Info</h3>
          </div>
          <div class="settings-section">
            <div class="section-header"><h4>Settings File</h4></div>
            <div class="info-grid" style="display: grid; gap: 12px; padding: 12px;">
              <div class="info-row" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: var(--bg-tertiary); border-radius: 6px;">
                <span style="color: var(--text-secondary);">Configuration File</span>
                <code id="settingsFilePath" style="color: var(--accent-color); font-size: 12px; cursor: pointer; text-decoration: underline;" onclick="openSettingsFile()" title="Click to open in editor">.spacecode/settings.json</code>
              </div>
              <p style="color: var(--text-secondary); font-size: 11px; margin: 0 0 0 4px;">All toolbar, chat, and UI preferences are stored in this file. Click to view or edit.</p>
            </div>
          </div>
          <div class="settings-section">
            <div class="section-header"><h4>SpaceCode App</h4></div>
            <div class="info-grid" style="display: grid; gap: 12px; padding: 12px;">
              <div class="info-row" style="display: flex; justify-content: space-between; padding: 8px 12px; background: var(--bg-tertiary); border-radius: 6px;">
                <span style="color: var(--text-secondary);">Extension Source</span>
                <code style="color: var(--accent-color); font-size: 12px;">~/Projects/spacecode-extension/spacecode-vscode</code>
              </div>
              <div class="info-row" style="display: flex; justify-content: space-between; padding: 8px 12px; background: var(--bg-tertiary); border-radius: 6px;">
                <span style="color: var(--text-secondary);">App Build Repo</span>
                <code style="color: var(--accent-color); font-size: 12px;">~/Projects/vscodium</code>
              </div>
              <div class="info-row" style="display: flex; justify-content: space-between; padding: 8px 12px; background: var(--bg-tertiary); border-radius: 6px;">
                <span style="color: var(--text-secondary);">App Binary</span>
                <code style="color: var(--accent-color); font-size: 12px;">~/Projects/vscodium/VSCode-darwin-arm64/SpaceCode.app</code>
              </div>
              <div class="info-row" style="display: flex; justify-content: space-between; padding: 8px 12px; background: var(--bg-tertiary); border-radius: 6px;">
                <span style="color: var(--text-secondary);">App CLI</span>
                <code style="color: var(--accent-color); font-size: 12px;">~/Projects/vscodium/VSCode-darwin-arm64/SpaceCode.app/Contents/Resources/app/bin/spacecode</code>
              </div>
            </div>
          </div>
          <div class="settings-section">
            <div class="section-header"><h4>Rebuild Commands</h4></div>
            <div style="padding: 12px;">
              <p style="color: var(--text-secondary); margin-bottom: 8px; font-size: 12px;">To rebuild app with latest extension code:</p>
              <pre style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px; font-size: 11px; color: var(--text-primary); overflow-x: auto; white-space: pre-wrap;">cd ~/Projects/spacecode-extension/spacecode-vscode
npx vsce package --allow-missing-repository --allow-star-activation

~/Projects/vscodium/VSCode-darwin-arm64/SpaceCode.app/Contents/Resources/app/bin/spacecode --install-extension spacecode-0.0.1.vsix --force

osascript -e 'quit app "SpaceCode"'; sleep 2; open ~/Projects/vscodium/VSCode-darwin-arm64/SpaceCode.app</pre>

              <p style="color: var(--text-secondary); margin-bottom: 8px; margin-top: 16px; font-size: 12px;">To fully rebuild app shell (branding/icon changes):</p>
              <pre style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px; font-size: 11px; color: var(--text-primary); overflow-x: auto; white-space: pre-wrap;">cd ~/Projects/vscodium
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
source "$HOME/.cargo/env"
./dev/build.sh -s</pre>
            </div>
          </div>
        </div>

      </div>
    </div><!-- End dashboard-section -->

      <!-- Station Section (right-pane content embedded in content-pane) -->
	  <div class="station-section" id="stationSection">
	    <!-- Panel toggle bar: always visible regardless of panel mode -->
	    <div class="right-pane-toolbar">
	      <div class="panel-toggle">
	        <button id="panelModeStation" class="active" data-tab-scope="station" onclick="setRightPanelMode('station')" title="Station View">Station</button>
	        <button id="panelModeControl" data-tab-scope="station" onclick="setRightPanelMode('control')" title="Controls">Control</button>
	        <button id="panelModeFlow" data-tab-scope="station" onclick="setRightPanelMode('flow')" title="Context Flow">Flow</button>
	        <button id="panelModePlanning" data-tab-scope="station" onclick="setRightPanelMode('planning')" title="Planning Panel">Plan</button>
	        <button id="panelModeChat" data-tab-scope="station" onclick="toggleChatSplit()" title="Split chat view">+Chat</button>
	      </div>
	    </div>
	    <div class="ship-panel">
	      <div class="ship-title">
	        <span>Station View</span>
	        <div class="view-mode-toggle" style="display:flex; gap:4px; margin-left:12px;">
	          <button id="stationViewSchematic" class="active" onclick="stationToggleViewMode('schematic')" title="Schematic View (SVG)">Schematic</button>
	          <button id="stationViewPhoto" onclick="stationToggleViewMode('photo')" title="Photo View (Legacy)">Photo</button>
	        </div>
	      </div>
	      <div class="ship-canvas" id="shipCanvas">
	        <img class="ship-image" id="shipImage" src="${stationUri}" alt="Station"
	          onerror="if(!this.dataset.fallback){this.dataset.fallback='1'; this.src='${shipUri}';} else {this.onerror=null; this.src='${shipFallbackUri}';}" />
	        <!-- Hotspots injected by JS -->
	      </div>

        <!-- Explorer Context Bar (Phase 11) -->
        <div id="explorerContextBar" style="display:none; align-items:center; gap:6px; padding:4px 10px; background:var(--bg-secondary); border-bottom:1px solid var(--border-color); font-size:11px;"></div>

        <div class="station-info">
          <div class="station-subtitle" id="stationSceneName">Station Exterior</div>
          <div class="station-info-row">
            <button class="btn-secondary" onclick="stationGoBack()" id="stationBackBtn" style="padding: 6px 10px;">Back</button>
            <div class="breadcrumbs" id="stationBreadcrumbs" title="Station navigation"></div>
          </div>
          <div class="station-info-row">
            <span class="control-chip" id="shipSelectedSectorChip">Sector: (none)</span>
            <span class="control-chip">Profile:</span>
            <select id="shipProfileSelect" style="padding: 6px 10px; border-radius: 999px;">
              <option value="yard">Yard</option>
              <option value="scout">Scout</option>
              <option value="battleship">Battleship</option>
            </select>
          </div>
          <div class="code-breadcrumb" id="codeBreadcrumb" title="Active file breadcrumb">No active file</div>
        </div>

        <!-- Engineer Status Strip (Phase 1) -->
        <div id="engineerStatusStrip" class="engineer-status-strip" onclick="switchControlTab('engineer')" title="Open Station Engineer">
          <span id="engineerHealthIndicator" class="engineer-health-indicator ok"></span>
          <span id="engineerStatusText" style="font-size:10px; color:var(--text-secondary);">Healthy</span>
          <span style="color:var(--border-color);">|</span>
          <span id="engineerTopAction" style="font-size:10px; color:var(--text-primary); flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">No pending actions</span>
          <span id="engineerAlertBadge" style="display:none; background:#f59e0b; color:#000; font-size:9px; font-weight:700; padding:1px 6px; border-radius:8px; min-width:16px; text-align:center;">0</span>
          <span style="font-size:10px; color:var(--text-secondary); cursor:pointer;">Open Engineer &rarr;</span>
        </div>

        <!-- Engineer Inline Prompt (contextual notification bar) -->
        <div id="engineerPromptBar" class="engineer-prompt-bar" style="display:none;">
          <span id="engineerPromptIcon" style="font-size:12px;">&#9888;</span>
          <span id="engineerPromptText" style="flex:1; font-size:10px;"></span>
          <div id="engineerPromptActions" style="display:flex; gap:4px;"></div>
        </div>

        <div class="control-panel">
          <div class="control-tabs">
            <button class="control-tab-btn active" id="controlTabBtnInfo" onclick="switchControlTab('info')">Info</button>
            <button class="control-tab-btn" id="controlTabBtnSectors" onclick="switchControlTab('sectors')">Sectors</button>
            <button class="control-tab-btn" id="controlTabBtnOps" onclick="switchControlTab('ops')">Control</button>
            <button class="control-tab-btn" id="controlTabBtnSecurity" onclick="switchControlTab('security')">Security</button>
            <button class="control-tab-btn" id="controlTabBtnQuality" onclick="switchControlTab('quality')">Quality</button>
            <button class="control-tab-btn" id="controlTabBtnDiagnostics" onclick="switchControlTab('diagnostics')">Diag</button>
            <button class="control-tab-btn" id="controlTabBtnUnity" onclick="switchControlTab('unity')">Unity</button>
            <button class="control-tab-btn" id="controlTabBtnGameui" onclick="switchControlTab('gameui')">Game UI</button>
            <button class="control-tab-btn" id="controlTabBtnEngineer" onclick="switchControlTab('engineer')">Engineer</button>
            <button class="control-tab-btn" id="controlTabBtnComms" onclick="switchControlTab('comms')">Comms</button>
            <button class="control-tab-btn" id="controlTabBtnInfra" onclick="switchControlTab('infra')">Infra</button>
          </div>

          <div class="control-tab-body">
            <div class="control-tab-panel" id="controlTabInfo" style="display:flex;">
              <div class="status-card">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                  <strong style="font-size:12px;">Station Info</strong>
                </div>
                <div class="status-text" id="shipStatusText">Select a sector to focus context and gates.</div>
                <div class="info-row">
                  <span class="info-label">Sector</span><span id="stationSectorLabel" class="info-value">Command Bridge</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Profile</span><span id="stationProfileLabel" class="info-value">Yard</span>
                </div>
              </div>

              <div class="status-card">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                  <strong style="font-size:12px;">Coordinator</strong>
                  <button class="btn-secondary" onclick="coordinatorHealthCheck()" style="padding:4px 10px;">Check</button>
                </div>
                <div class="coord-meta">
                  <div class="coord-meta-row">
                    <span class="label">Status</span>
                    <span id="coordinatorStatusBadge" class="coord-status muted">Unknown</span>
                  </div>
                  <div class="coord-meta-row">
                    <span class="label">URL</span>
                    <span id="coordinatorUrlLabel" class="info-value">http://127.0.0.1:5510</span>
                  </div>
                  <div class="coord-meta-row">
                    <span class="label">Last Issue</span>
                    <span id="coordinatorLastIssue" class="info-value">none</span>
                  </div>
                </div>
                <div class="coord-grid">
                  <span class="label">Policy</span>
                  <span id="coordinatorPolicySync" class="info-value">never</span>
                  <span id="coordinatorPolicyStatus" class="coord-pill muted">unknown</span>
                  <span class="label">Inventory</span>
                  <span id="coordinatorInventorySync" class="info-value">never</span>
                  <span id="coordinatorInventoryStatus" class="coord-pill muted">unknown</span>
                  <span class="label">Graph</span>
                  <span id="coordinatorGraphSync" class="info-value">never</span>
                  <span id="coordinatorGraphStatus" class="coord-pill muted">unknown</span>
                </div>
                <div class="coord-summary" id="coordinatorSummary">Sync status will appear after first check.</div>
              </div>

              <div class="context-preview">
                <div class="context-preview-header">
                  <div style="display:flex; align-items:center; gap:10px;">
                    <strong style="font-size:12px;">Context Preview</strong>
                    <label style="margin:0;">
                      <input type="checkbox" id="injectContextToggle" checked />
                      Inject
                    </label>
                  </div>
                  <button class="btn-secondary" onclick="copyContextPreview()" style="padding: 6px 10px;">Copy</button>
                </div>
                <div class="context-preview-box" id="contextPreviewBox">(context will appear here)</div>
              </div>

              <div class="doc-gate">
                <label for="docTargetSelect">Documentation Target (required outside Yard)</label>
                <select id="docTargetSelect">
                  <option value="">Select a docs file...</option>
                </select>
                <div id="docInfo" style="font-size:10px; color:var(--text-secondary); margin:4px 0;"></div>
                <div style="display:flex; justify-content:flex-end; gap:6px;">
                  <button class="btn-secondary" id="openDocBtn" onclick="openDocTarget()" style="padding:4px 10px;" disabled>Open</button>
                  <button class="btn-secondary" onclick="refreshDocTargets()" style="padding:4px 10px;">Refresh</button>
                </div>
                <div id="docSuggestion" style="font-size:10px; color:#fbbf24; margin-top:6px; display:none;"></div>
              </div>
            </div>

            <div class="control-tab-panel" id="controlTabSectors" style="display:none;">
              <div class="sector-map-container" style="position:relative;">
                <div class="sector-map-toolbar" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                  <div style="display:flex; align-items:center; gap:8px;">
                    <strong style="font-size:12px;">Sector Map</strong>
                    <span id="sectorMapBadge" class="coord-status muted" style="font-size:10px;">12 sectors</span>
                  </div>
                  <div style="display:flex; gap:6px;">
                    <button class="btn-secondary" onclick="sectorMapScan()" style="padding:4px 10px;">Scan</button>
                    <button class="btn-secondary" onclick="sectorMapValidate()" style="padding:4px 10px;">Validate</button>
                    <button class="btn-secondary" onclick="sectorConfigOpen()" style="padding:4px 10px;">Configure</button>
                  </div>
                </div>
                <div id="sectorMapTierBanner" style="display:none; padding:6px 10px; margin-bottom:6px; border-radius:6px; font-size:11px; background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.3); color:#f59e0b;"></div>
                <div class="sector-map-canvas-wrap">
                  <canvas id="sectorMapCanvas" style="position:absolute; top:0; left:0; width:100%; height:100%; display:block; border-radius:8px; cursor:default;"></canvas>
                  <div id="sectorMapTooltip" style="position:absolute; pointer-events:none; background:rgba(10,14,23,0.95); border:1px solid rgba(100,200,255,0.3); border-radius:8px; padding:8px 12px; color:#c8d6e5; font-size:11px; display:none; z-index:10; backdrop-filter:blur(8px); max-width:200px;">
                    <div class="sm-tip-name" style="color:#fff; font-size:13px; font-weight:600; margin-bottom:2px;"></div>
                    <div class="sm-tip-tech" style="color:#5a7a9a; font-size:10px; margin-bottom:4px;"></div>
                    <div class="sm-tip-health" style="font-size:10px;"></div>
                    <div class="sm-tip-deps" style="font-size:9px; color:#5a7a9a; margin-top:3px;"></div>
                  </div>
                </div>
              </div>

              <div id="sectorDetailCard" style="display:none; margin-top:8px; padding:8px; background:var(--bg-secondary); border-radius:6px; border-left:3px solid #6366f1;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                  <strong style="font-size:12px;" id="sectorDetailName">-</strong>
                  <button class="btn-secondary" onclick="closeSectorDetail()" style="padding:2px 8px; font-size:10px;">\u2190 Back</button>
                </div>
                <div id="sectorDetailTech" style="font-size:10px; color:var(--text-secondary); margin-bottom:4px;"></div>
                <div id="sectorDetailHealth" style="font-size:11px; margin-bottom:4px;"></div>
                <div id="sectorDetailDeps" style="font-size:10px; color:var(--text-secondary); margin-bottom:4px;"></div>
                <div id="sectorDetailDesc" style="font-size:10px; color:var(--text-secondary);"></div>
                <div id="sectorDetailBoundaries" style="font-size:10px; color:var(--text-secondary); margin-top:6px; display:none;">
                  <strong style="font-size:10px; color:var(--text-primary);">Boundaries</strong>
                  <div id="sectorDetailBoundariesList" style="margin-top:2px; font-family:monospace;"></div>
                </div>
                <div id="sectorDetailViolations" style="font-size:10px; margin-top:6px; display:none;">
                  <strong style="font-size:10px; color:var(--text-primary);">Violations</strong>
                  <div id="sectorDetailViolationsList" style="margin-top:2px;"></div>
                </div>
                <div id="sectorDetailScripts" style="font-size:10px; color:var(--text-secondary); margin-top:4px; display:none;"></div>
                <div style="display:flex; gap:6px; margin-top:6px;">
                  <button class="btn-secondary" onclick="sectorOpenFolder()" style="padding:4px 10px; font-size:10px;">Open Folder</button>
                  <button class="btn-secondary" onclick="sectorOpenAsmdef()" style="padding:4px 10px; font-size:10px;">Open Asmdef</button>
                  <button class="btn-secondary" onclick="asmdefEditPolicy()" style="padding:4px 10px; font-size:10px;">Edit Policy</button>
                </div>
              </div>

              <div class="sector-map-summary" style="margin-top:8px; padding:6px 8px; background:var(--bg-primary); border-radius:4px; font-size:10px; color:var(--text-secondary);">
                <div style="display:flex; justify-content:space-between;">
                  <span id="sectorMapSummaryText">Click Scan to load sector data.</span>
                  <span id="sectorMapHealthBadge"></span>
                </div>
              </div>

              <!-- Sector Configuration Panel (CF-8) -->
              <div id="sectorConfigPanel" style="display:none; margin-top:8px; padding:8px; background:var(--bg-secondary); border-radius:6px; border:1px solid var(--border-color);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                  <strong style="font-size:12px;">Sector Configuration</strong>
                  <button class="btn-secondary" onclick="sectorConfigClose()" style="padding:2px 8px; font-size:10px;">\u2190 Back</button>
                </div>

                <div style="display:flex; gap:6px; align-items:center; margin-bottom:8px;">
                  <label style="font-size:10px; color:var(--text-secondary); white-space:nowrap;">Template:</label>
                  <select id="sectorTemplateSelect" onchange="sectorConfigApplyTemplate(this.value)" style="flex:1; background:var(--bg-primary); border:1px solid var(--border-color); color:var(--text-primary); padding:3px 6px; font-size:10px; border-radius:3px;">
                    <option value="">(custom)</option>
                  </select>
                  <button class="btn-secondary" onclick="sectorConfigAutoDetect()" style="padding:3px 8px; font-size:10px; white-space:nowrap;">Auto-Detect</button>
                </div>

                <div id="sectorConfigList" style="max-height:300px; overflow-y:auto;"></div>

                <button class="btn-secondary" onclick="sectorConfigAdd()" style="margin-top:6px; width:100%; padding:4px; font-size:10px;">+ Add Sector</button>

                <div style="display:flex; gap:6px; margin-top:8px;">
                  <button class="btn-primary" onclick="sectorConfigSave()" style="flex:1; padding:4px 10px; font-size:10px;">Save Configuration</button>
                  <button class="btn-secondary" onclick="sectorConfigExport()" style="padding:4px 10px; font-size:10px;">Export</button>
                  <button class="btn-secondary" onclick="sectorConfigImport()" style="padding:4px 10px; font-size:10px;">Import</button>
                </div>

                <div id="sectorConfigStatus" style="font-size:10px; color:var(--text-secondary); margin-top:4px;"></div>
              </div>
            </div>

            <div class="control-tab-panel" id="controlTabOps" style="display:none;">
              <div class="control-actions condensed">
                <button class="btn-secondary" onclick="shipRequestContextPack()">Context Pack</button>
                <button class="btn-secondary" onclick="shipRunGates()">Run Gates</button>
                <button class="btn-secondary" onclick="shipDocsStatus()">Docs</button>
                <button class="btn-secondary" onclick="shipToggleAutoexecute()" id="shipAutoBtn">Autoexecute: Off</button>
              </div>

              <!-- Autosolve notifications -->
              <div style="margin:8px 0;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                  <strong style="font-size:11px;">Autosolve</strong>
                  <span id="autosolveBadge" style="display:none; background:#f59e0b; color:#000; font-size:9px; font-weight:700; padding:1px 5px; border-radius:8px; min-width:16px; text-align:center;">0</span>
                </div>
                <div id="autosolveList" style="max-height:120px; overflow-y:auto;">
                  <div style="color:var(--text-secondary);font-size:11px;">No autosolve results.</div>
                </div>
              </div>

              <div id="controlGatesResult" style="display:none; margin:8px 0; padding:8px; background:var(--bg-secondary); border-radius:6px; border-left:3px solid #4caf50;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                  <strong style="font-size:11px;">Gates Result</strong>
                  <span id="controlGatesStatus" style="font-size:10px; font-weight:600;"></span>
                </div>
                <div id="controlGatesContent" style="font-size:10px; white-space:pre-wrap; max-height:150px; overflow-y:auto;"></div>
              </div>

              <div class="asmdef-panel">
                <div class="asmdef-header">
                  <div style="display:flex; align-items:center; gap:8px;">
                    <strong style="font-size:12px;">Sector Settings</strong><span style="font-size:10px; color:var(--text-secondary, #888); margin-left:6px; font-weight:normal;">Asmdef Manager</span>
                    <span id="asmdefPolicyModeBadge" class="coord-status muted">Sector Policy: (none)</span>
                  </div>
                  <div class="asmdef-actions">
                    <button class="btn-secondary" onclick="asmdefRefresh()" style="padding:4px 10px;">Scan Sectors</button>
                    <button class="btn-secondary" onclick="asmdefGeneratePolicy()" style="padding:4px 10px;">Generate Policy</button>
                    <button class="btn-secondary" onclick="asmdefEditPolicy()" style="padding:4px 10px;">Edit Policy</button>
                    <button class="btn-secondary" onclick="asmdefOpenPolicy()" style="padding:4px 10px;">Open Policy</button>
                    <button class="btn-secondary" onclick="asmdefSetStrict()" style="padding:4px 10px;">Set Strict</button>
                    <button class="btn-secondary" onclick="asmdefSetAdvisory()" style="padding:4px 10px;">Set Advisory</button>
                    <button class="btn-secondary" onclick="asmdefNormalizeGuids()" style="padding:4px 10px;">Normalize GUIDs</button>
                    <button class="btn-secondary" onclick="asmdefGraph()" style="padding:4px 10px;">Graph</button>
                    <button class="btn-secondary" onclick="asmdefValidate()" style="padding:4px 10px;">Validate</button>
                  </div>
                </div>
                <div id="asmdefSummary" class="asmdef-summary">No sector scan yet. Click "Scan Sectors" to load.</div>
                <div id="asmdefPolicyEditor" class="asmdef-policy-editor" style="display:none;">
                  <div class="asmdef-policy-header">
                    <div style="display:flex; align-items:center; gap:6px;">
                      <strong style="font-size:11px;">Sector Policy Editor</strong><span style="font-size:9px; color:var(--text-secondary, #888); margin-left:5px; font-weight:normal;">Asmdef Policy</span>
                      <span id="asmdefPolicyPath" class="asmdef-policy-path">(no policy)</span>
                    </div>
                    <div style="display:flex; gap:6px;">
                      <button class="btn-secondary" onclick="asmdefReloadPolicy()" style="padding:4px 10px;">Reload</button>
                      <button class="btn-secondary" onclick="asmdefSavePolicy()" style="padding:4px 10px;">Save</button>
                    </div>
                  </div>
                  <textarea id="asmdefPolicyText" class="asmdef-policy-text" spellcheck="false" placeholder="Policy JSON will appear here..."></textarea>
                  <div id="asmdefPolicyHint" class="asmdef-policy-hint">Edit JSON and click Save to update policy.</div>
                </div>
                <div id="asmdefList" class="asmdef-list"></div>
                <div id="asmdefGraphSummary" class="asmdef-summary" style="margin-top:6px; display:none;"></div>
                <div id="asmdefGraphCanvas" class="asmdef-graph-canvas" style="display:none;"></div>
                <div id="asmdefGraphList" class="asmdef-list" style="display:none;"></div>
                <div id="asmdefViolations" class="asmdef-list" style="display:none;"></div>
              </div>

              <div class="job-queue">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <strong style="font-size:12px;">Approval Queue</strong>
                  <button class="btn-secondary" onclick="clearAllJobs()" style="padding:4px 10px;">Clear</button>
                  <button class="btn-secondary" onclick="requestJobList()" style="padding:4px 10px;">Refresh</button>
                </div>
                <div id="jobList" class="job-list"></div>
              </div>

              <div class="verification-panel">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                  <strong style="font-size:12px;">Verification</strong>
                  <div style="display:flex; gap:4px;">
                    <button class="btn-secondary" onclick="scanDiff()" style="padding:4px 10px; font-size:10px;">Scan Diff</button>
                    <button class="btn-secondary" onclick="runTests()" style="padding:4px 10px; font-size:10px;" id="runTestsBtn">Run Tests</button>
                    <button class="btn-secondary" onclick="runAIReview()" style="padding:4px 10px; font-size:10px;" id="aiReviewBtn" disabled>AI Review</button>
                  </div>
                </div>

                <div class="plan-execution" id="planExecutionPanel" style="display:none;">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <span style="font-size:11px; font-weight:600;">Execution</span>
                    <span id="planExecutionStatus" style="font-size:10px; color:var(--text-secondary);"></span>
                  </div>
                  <div id="planExecutionProgress" style="font-size:10px; margin-bottom:6px; color:var(--text-secondary);"></div>
                  <div id="planExecutionLog" class="plan-execution-log"></div>
                  <div class="plan-step-gate" id="planStepGate" style="display:none;">
                    <div class="plan-step-gate-title">Step approval</div>
                    <div class="plan-step-gate-details" id="planStepGateDetails"></div>
                    <div class="plan-step-gate-actions">
                      <button class="btn-secondary" onclick="abortPlanStep()">Stop</button>
                      <button class="btn-secondary" onclick="approvePlanStep()">Run Step</button>
                    </div>
                  </div>
                </div>

                <!-- Autopilot Control Panel (Phase 3) -->
                <div id="autopilotPanel" style="margin-top:8px;">
                  <!-- Session recovery prompt -->
                  <div id="autopilotSessionPrompt" style="display:none; background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:6px; padding:8px; margin-bottom:6px;"></div>

                  <!-- Control bar -->
                  <div id="autopilotControlBar" style="display:none; flex-direction:column; gap:6px; background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:6px; padding:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                      <div style="display:flex; align-items:center; gap:6px;">
                        <span style="font-size:11px; font-weight:600;">Autopilot</span>
                        <span id="autopilotStatusText" class="autopilot-status-label idle" style="font-size:10px;"></span>
                      </div>
                      <div style="display:flex; align-items:center; gap:4px;">
                        <span id="autopilotStepCounter" style="font-size:9px; color:var(--text-secondary);"></span>
                        <span id="autopilotAgentLabel" style="font-size:9px; color:var(--text-secondary);"></span>
                      </div>
                    </div>

                    <!-- Progress bar -->
                    <div class="autopilot-progress-track">
                      <div id="autopilotProgressFill" class="autopilot-progress-fill" style="width:0%;"></div>
                    </div>

                    <!-- Buttons -->
                    <div style="display:flex; gap:4px;">
                      <button id="autopilotPauseBtn" class="btn-secondary" onclick="autopilotPause()" style="display:none; padding:3px 8px; font-size:10px;">Pause</button>
                      <button id="autopilotResumeBtn" class="btn-primary" onclick="autopilotResume()" style="display:none; padding:3px 8px; font-size:10px;">Resume</button>
                      <button id="autopilotAbortBtn" class="btn-secondary" onclick="autopilotAbort()" style="display:none; padding:3px 8px; font-size:10px; color:var(--error-text);">Abort</button>
                    </div>

                    <!-- Error text -->
                    <div id="autopilotErrorText" style="display:none; font-size:10px; color:var(--error-text); background:var(--error-bg); padding:4px 6px; border-radius:4px;"></div>

                    <!-- Step results list -->
                    <div id="autopilotStepList" class="autopilot-step-list"></div>
                  </div>

                  <!-- Config section (collapsed by default) -->
                  <details style="margin-top:6px;">
                    <summary style="font-size:10px; color:var(--text-secondary); cursor:pointer;">Autopilot Settings</summary>
                    <div style="padding:6px 0; display:flex; flex-direction:column; gap:6px;">
                      <div style="display:flex; align-items:center; gap:6px;">
                        <label style="font-size:10px; color:var(--text-secondary); width:80px;">Error Strategy</label>
                        <select id="autopilotStrategySelect" style="flex:1; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); padding:2px 4px; font-size:10px; border-radius:3px;">
                          <option value="retry">Retry</option>
                          <option value="skip">Skip</option>
                          <option value="abort">Abort</option>
                        </select>
                      </div>
                      <div style="display:flex; align-items:center; gap:6px;">
                        <label style="font-size:10px; color:var(--text-secondary); width:80px;">Max Retries</label>
                        <input id="autopilotRetryInput" type="number" min="0" max="10" value="3" style="flex:1; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); padding:2px 4px; font-size:10px; border-radius:3px;">
                      </div>
                      <div style="display:flex; align-items:center; gap:6px;">
                        <label style="font-size:10px; color:var(--text-secondary); width:80px;">Step Delay</label>
                        <input id="autopilotDelayInput" type="number" min="0" max="5000" step="100" value="500" style="flex:1; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); padding:2px 4px; font-size:10px; border-radius:3px;">
                        <span style="font-size:9px; color:var(--text-secondary);">ms</span>
                      </div>
                      <button class="btn-secondary" onclick="autopilotUpdateConfig()" style="padding:3px 8px; font-size:10px; align-self:flex-end;">Apply</button>
                    </div>
                  </details>
                </div>

                <div class="diff-summary" id="diffSummary" style="display:none;">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <span style="font-size:11px; font-weight:600;">Diff Summary</span>
                    <span id="diffStats" style="font-size:10px; color:var(--text-secondary);"></span>
                  </div>
                  <div id="diffFileList" style="max-height:100px; overflow-y:auto; font-size:10px; font-family:monospace; background:var(--bg-primary); border-radius:4px; padding:6px;"></div>
                </div>

                <div class="plan-comparison" id="planComparison" style="display:none; margin-top:8px;">
                  <div style="font-size:11px; font-weight:600; margin-bottom:4px;">Plan Comparison</div>
                  <div id="planComparisonResult" style="font-size:10px; background:var(--bg-primary); border-radius:4px; padding:6px;"></div>
                </div>

                <div class="ai-review-result" id="aiReviewResult" style="display:none; margin-top:8px;">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <span style="font-size:11px; font-weight:600;">AI Review</span>
                    <span id="aiReviewStatus" style="font-size:10px;"></span>
                  </div>
                  <div id="aiReviewContent" style="font-size:10px; background:var(--bg-primary); border-radius:4px; padding:6px; max-height:150px; overflow-y:auto;"></div>
                </div>

                <div id="verificationEmpty" style="font-size:10px; color:var(--text-secondary); text-align:center; padding:12px;">
                  Click "Scan Diff" to analyze changes since last commit.
                </div>

                <div class="gates-result" id="gatesResult" style="display:none; margin-top:8px;">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <span style="font-size:11px; font-weight:600;">Gates Check Result</span>
                    <span id="gatesResultStatus" style="font-size:10px;"></span>
                  </div>
                  <div id="gatesResultContent" style="font-size:10px; background:var(--bg-primary); border-radius:4px; padding:6px; max-height:200px; overflow-y:auto; white-space:pre-wrap;"></div>
                </div>

                <div class="test-result" id="testResult" style="display:none; margin-top:8px;">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <span style="font-size:11px; font-weight:600;">Regression Tests</span>
                    <span id="testResultStatus" style="font-size:10px;"></span>
                  </div>
                  <div id="testResultContent" style="font-size:10px; background:var(--bg-primary); border-radius:4px; padding:6px; max-height:200px; overflow-y:auto; white-space:pre-wrap; font-family:monospace;"></div>
                </div>
              </div>
            </div>

            <div class="control-tab-panel" id="controlTabSecurity" style="display:none;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <strong style="font-size:12px;">Security Scan</strong>
                <div style="display:flex; gap:4px;">
                  <button class="btn-secondary" onclick="runSecurityScan()" id="securityScanBtn" style="padding:4px 10px; font-size:10px;">Scan</button>
                  <button class="btn-secondary" onclick="exportSecurityReport()" id="securityExportBtn" style="padding:4px 10px; font-size:10px;" disabled>Export</button>
                </div>
              </div>

              <div id="securityScoreCard" class="status-card" style="display:none;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <div>
                    <span style="font-size:20px; font-weight:700;" id="securityScore">—</span>
                    <span style="font-size:11px; color:var(--text-secondary);">/100</span>
                  </div>
                  <span id="securityPassBadge" style="font-size:11px; padding:2px 8px; border-radius:4px;"></span>
                </div>
                <div style="font-size:10px; color:var(--text-secondary); margin-top:4px;" id="securitySummaryText"></div>
                <div style="display:flex; gap:8px; margin-top:6px; font-size:10px;">
                  <span style="color:#ef4444;" id="securityCritical"></span>
                  <span style="color:#f97316;" id="securityHigh"></span>
                  <span style="color:#eab308;" id="securityMedium"></span>
                  <span style="color:#6b7280;" id="securityLow"></span>
                </div>
              </div>

              <div id="securityFindingsList" style="margin-top:6px; font-size:11px;"></div>

              <div id="securityEmpty" style="font-size:11px; color:var(--text-secondary); padding:12px 0; text-align:center;">
                Click "Scan" to run security analysis on your workspace.
              </div>
            </div>

            <div class="control-tab-panel" id="controlTabQuality" style="display:none;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <strong style="font-size:12px;">Code Quality</strong>
                <div style="display:flex; gap:4px;">
                  <button class="btn-secondary" onclick="runQualityScan()" id="qualityScanBtn" style="padding:4px 10px; font-size:10px;">Scan</button>
                  <button class="btn-secondary" onclick="exportQualityReport()" id="qualityExportBtn" style="padding:4px 10px; font-size:10px;" disabled>Export</button>
                </div>
              </div>

              <div id="qualityScoreCard" class="status-card" style="display:none;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <div>
                    <span style="font-size:20px; font-weight:700;" id="qualityScore">—</span>
                    <span style="font-size:11px; color:var(--text-secondary);">/100</span>
                  </div>
                  <span id="qualityPassBadge" style="font-size:11px; padding:2px 8px; border-radius:4px;"></span>
                </div>
                <div style="font-size:10px; color:var(--text-secondary); margin-top:4px;" id="qualitySummaryText"></div>
                <div style="display:flex; gap:8px; margin-top:6px; font-size:10px;">
                  <span id="qualityMetricComplexity"></span>
                  <span id="qualityMetricDuplication"></span>
                  <span id="qualityMetricDeadCode"></span>
                </div>
              </div>

              <div id="qualityBreakdown" style="display:none; margin-top:6px;">
                <div style="font-size:10px; color:var(--text-secondary); margin-bottom:4px;">By Category</div>
                <div id="qualityCategoryList" style="display:flex; flex-wrap:wrap; gap:4px; font-size:10px;"></div>
              </div>

              <div id="qualityFindingsList" style="margin-top:6px; font-size:11px;"></div>

              <div id="qualityEmpty" style="font-size:11px; color:var(--text-secondary); padding:12px 0; text-align:center;">
                Click "Scan" to analyze code quality in your workspace.
              </div>
            </div>

            <div class="control-tab-panel" id="controlTabDiagnostics" style="display:none;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <div style="display:flex; align-items:center; gap:8px;">
                  <strong style="font-size:12px;">Diagnostics</strong>
                  <span id="diagStatusBadge" style="font-size:10px; color:var(--text-secondary);">No scan</span>
                </div>
                <div style="display:flex; gap:6px;">
                  <select id="diagModeSelect" style="font-size:10px; padding:3px 6px; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:4px;">
                    <option value="quick">Quick (TS + Lint)</option>
                    <option value="full">Full (+ Build)</option>
                  </select>
                  <button class="btn-secondary" id="diagScanBtn" onclick="runDiagnosticsScan(document.getElementById('diagModeSelect').value)" style="padding:4px 10px;">Scan</button>
                </div>
              </div>
              <div id="diagResultsContainer" style="font-size:11px;">
                <div style="color:var(--text-secondary); padding:8px; font-size:11px;">
                  Run diagnostics to check for TypeScript errors, lint issues, and build problems.
                </div>
              </div>
            </div>

            <div class="control-tab-panel" id="controlTabUnity" style="display:none;">
              <!-- Coplay MCP Integration - commands sent via chat to Claude -->
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <div style="display:flex; align-items:center; gap:8px;">
                  <strong style="font-size:12px;">🎮 Unity (Coplay)</strong>
                  <span id="unityStatus" class="unity-status disconnected">● Unknown</span>
                </div>
              </div>

              <!-- Quick Actions - send commands to Claude -->
              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px; margin-bottom:8px;">
                <button class="btn-secondary unity-cmd-btn" onclick="unitySendCommand('status')" style="padding:6px 8px; font-size:11px;" title="Check Unity connection">
                  🔍 Check Status
                </button>
                <button class="btn-secondary unity-cmd-btn" onclick="unitySendCommand('reload')" style="padding:6px 8px; font-size:11px;" title="Reload Unity assets">
                  ↻ Reload Assets
                </button>
                <button class="btn-secondary unity-cmd-btn" onclick="unitySendCommand('play')" style="padding:6px 8px; font-size:11px;" title="Play game in editor">
                  ▶ Play
                </button>
                <button class="btn-secondary unity-cmd-btn" onclick="unitySendCommand('stop')" style="padding:6px 8px; font-size:11px;" title="Stop game in editor">
                  ⏹ Stop
                </button>
                <button class="btn-secondary unity-cmd-btn" onclick="unitySendCommand('logs')" style="padding:6px 8px; font-size:11px;" title="Get Unity console logs">
                  📋 Get Logs
                </button>
                <button class="btn-secondary unity-cmd-btn" onclick="unitySendCommand('errors')" style="padding:6px 8px; font-size:11px;" title="Check compile errors">
                  ⚠️ Check Errors
                </button>
              </div>

              <!-- Build Pipeline (Phase 6.3) -->
              <div style="display:flex; align-items:center; gap:6px; margin-bottom:8px; padding:4px 8px; background:var(--bg-primary); border-radius:4px; border:1px solid var(--border-color);">
                <button class="btn-primary" onclick="unityBuildCheck()" style="padding:4px 10px; font-size:11px;">🔨 Build Check</button>
                <span id="buildStatusIndicator" style="font-size:11px; color:var(--text-secondary);">Not checked</span>
              </div>

              <!-- Last Status Info -->
              <div id="unityLastStatus" style="font-size:11px; color:var(--text-secondary); padding:6px 8px; background:var(--bg-primary); border-radius:4px; margin-bottom:8px;">
                <div style="margin-bottom:4px;"><strong>Project:</strong> <span id="unityProjectName">-</span></div>
                <div style="margin-bottom:4px;"><strong>Scene:</strong> <span id="unitySceneName">-</span></div>
                <div><strong>Last check:</strong> <span id="unityLastCheck">Never</span></div>
              </div>

              <!-- Console Output -->
              <div class="unity-console" style="background:var(--bg-primary); border-radius:6px; padding:6px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                  <span style="font-size:10px; color:var(--text-secondary);">Console Output</span>
                  <div style="display:flex; gap:4px; align-items:center;">
                    <button class="console-filter active" data-filter="error" onclick="toggleConsoleFilter('error')" style="font-size:10px; padding:2px 6px; border-radius:4px;" title="Errors">🔴</button>
                    <button class="console-filter active" data-filter="warn" onclick="toggleConsoleFilter('warn')" style="font-size:10px; padding:2px 6px; border-radius:4px;" title="Warnings">🟡</button>
                    <button class="console-filter active" data-filter="log" onclick="toggleConsoleFilter('log')" style="font-size:10px; padding:2px 6px; border-radius:4px;" title="Logs">⚪</button>
                    <button onclick="clearUnityConsole()" style="font-size:9px; padding:2px 6px; border-radius:4px; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-secondary); cursor:pointer;" title="Clear console display">Clear</button>
                  </div>
                </div>
                <div id="unityConsoleLog" style="font-size:10px; font-family:monospace; white-space:pre-wrap; max-height:150px; overflow-y:auto;">
                  Click "Get Logs" to fetch Unity console output
                </div>
              </div>

              <div style="font-size:9px; color:var(--text-secondary); margin-top:6px; opacity:0.7;">
                Commands are sent to Claude who executes them via Coplay MCP
              </div>
            </div>

            <!-- Game UI Pipeline Tab (Phase 4) -->
            <div class="control-tab-panel" id="controlTabGameui" style="display:none;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <div style="display:flex; align-items:center; gap:6px;">
                  <strong style="font-size:12px;">Game UI Pipeline</strong>
                  <span id="gameuiStatus" class="gameui-status idle" style="font-size:10px;">Idle</span>
                </div>
                <div style="display:flex; gap:4px;">
                  <button class="btn-secondary" onclick="gameuiRequestState()" style="padding:3px 8px; font-size:10px;">Refresh</button>
                  <button class="btn-secondary" onclick="gameuiLoadState()" style="padding:3px 8px; font-size:10px;">Load</button>
                </div>
              </div>

              <!-- Progress bar -->
              <div class="gameui-progress-track" style="margin-bottom:8px;">
                <div id="gameuiProgressFill" class="gameui-progress-fill" style="width:0%;"></div>
              </div>

              <!-- Stats row -->
              <div id="gameuiStats" style="display:flex; gap:8px; font-size:9px; color:var(--text-secondary); margin-bottom:8px;"></div>

              <!-- Phase selector -->
              <div style="margin-bottom:8px;">
                <label style="font-size:10px; color:var(--text-secondary);">Phase:</label>
                <span id="gameuiCurrentPhase" style="font-size:10px; font-weight:600; margin-left:4px;">Theme Setup</span>
                <div style="display:flex; gap:4px; margin-top:4px; flex-wrap:wrap;">
                  <button class="btn-secondary" onclick="gameuiRunPhase('theme')" style="padding:2px 6px; font-size:9px;">Theme</button>
                  <button class="btn-secondary" onclick="gameuiRunPhase('primitives')" style="padding:2px 6px; font-size:9px;">Primitives</button>
                  <button class="btn-secondary" onclick="gameuiRunPhase('system-screens')" style="padding:2px 6px; font-size:9px;">System</button>
                  <button class="btn-secondary" onclick="gameuiRunPhase('menu')" style="padding:2px 6px; font-size:9px;">Menu</button>
                  <button class="btn-secondary" onclick="gameuiRunPhase('hud')" style="padding:2px 6px; font-size:9px;">HUD</button>
                  <button class="btn-secondary" onclick="gameuiRunPhase('panels')" style="padding:2px 6px; font-size:9px;">Panels</button>
                  <button class="btn-secondary" onclick="gameuiRunPhase('dialogs-map')" style="padding:2px 6px; font-size:9px;">Dialogs</button>
                </div>
                <div style="display:flex; gap:4px; margin-top:4px;">
                  <button class="btn-primary" onclick="gameuiRunAll()" style="padding:3px 10px; font-size:10px;">Run All Phases</button>
                  <button class="btn-secondary" onclick="gameuiStop()" style="padding:3px 8px; font-size:10px; color:var(--error-text);">Stop</button>
                  <button class="btn-secondary" onclick="gameuiSaveState()" style="padding:3px 8px; font-size:10px;">Save</button>
                </div>
              </div>

              <!-- Category breakdown -->
              <div id="gameuiCategoryBreakdown" style="display:flex; gap:4px; flex-wrap:wrap; margin-bottom:8px;"></div>

              <!-- Theme section -->
              <details style="margin-bottom:8px;">
                <summary style="font-size:10px; color:var(--text-secondary); cursor:pointer;">Themes</summary>
                <div id="gameuiThemeList" style="margin-top:4px;"></div>
                <div style="margin-top:4px; display:flex; gap:4px;">
                  <button class="btn-secondary" onclick="gameuiRequestThemes()" style="padding:2px 6px; font-size:9px;">Refresh</button>
                  <button class="btn-secondary" onclick="gameuiGenerateThemeUSS()" style="padding:2px 6px; font-size:9px;">Generate USS</button>
                </div>
              </details>

              <!-- Component catalog -->
              <details open style="margin-bottom:8px;">
                <summary style="font-size:10px; color:var(--text-secondary); cursor:pointer;">Components (<span id="gameuiComponentCount">0</span>)</summary>
                <div style="margin-top:4px; display:flex; gap:4px; margin-bottom:4px;">
                  <button class="btn-secondary" onclick="gameuiRequestCatalog()" style="padding:2px 6px; font-size:9px;">All</button>
                  <button class="btn-secondary" onclick="gameuiFilterCategory('primitive')" style="padding:2px 6px; font-size:9px;">Primitives</button>
                  <button class="btn-secondary" onclick="gameuiFilterCategory('system')" style="padding:2px 6px; font-size:9px;">System</button>
                  <button class="btn-secondary" onclick="gameuiFilterCategory('hud')" style="padding:2px 6px; font-size:9px;">HUD</button>
                </div>
                <div id="gameuiComponentList" class="gameui-component-list"></div>
              </details>

              <!-- Event feed -->
              <details>
                <summary style="font-size:10px; color:var(--text-secondary); cursor:pointer;">Event Log</summary>
                <div id="gameuiEventFeed" class="gameui-event-feed" style="margin-top:4px; max-height:150px; overflow-y:auto;"></div>
              </details>
            </div>

            <!-- Engineer Tab (Phase 1: Station Engineer) -->
            <div class="control-tab-panel" id="controlTabEngineer" style="display:none;">

              <!-- Ship Status Section -->
              <div class="engineer-section">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                  <strong style="font-size:12px;">Ship Status</strong>
                  <button class="btn-secondary" onclick="engineerRefresh()" style="padding:4px 10px; font-size:10px;">Rescan</button>
                </div>
                <div id="engineerShipStatus" class="engineer-ship-status">
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span id="engineerHealthBig" class="engineer-health-big ok" style="font-size:14px; font-weight:700;"></span>
                    <span id="engineerWarningCount" style="font-size:11px; color:var(--text-secondary);"></span>
                  </div>
                  <div id="engineerWarningList" style="margin-top:6px; font-size:10px; color:var(--text-secondary);"></div>
                </div>
                <div id="engineerNoSectors" style="display:none; font-size:10px; color:#f59e0b; padding:6px; background:rgba(245,158,11,0.08); border-radius:4px; margin-top:4px;">
                  Configure sectors to enable full analysis.
                  <button class="btn-secondary" onclick="switchControlTab('sectors'); sectorConfigOpen();" style="margin-left:6px; padding:2px 6px; font-size:10px;">Configure Sectors</button>
                </div>
              </div>

              <!-- Suggestions Section -->
              <div class="engineer-section" style="margin-top:8px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                  <strong style="font-size:12px;">Top Suggestions</strong>
                  <label style="font-size:10px; color:var(--text-secondary); display:flex; align-items:center; gap:4px; cursor:pointer;">
                    <input type="checkbox" id="engineerShowAll" onchange="engineerToggleShowAll(this.checked)" />
                    Show all
                  </label>
                </div>
                <div id="engineerSuggestionsList" class="engineer-suggestions-list"></div>
                <div id="engineerSuggestionsEmpty" style="font-size:10px; color:var(--text-secondary); text-align:center; padding:12px;">
                  Click "Rescan" to analyze project health and generate suggestions.
                </div>
              </div>

              <!-- Delegations Section -->
              <div class="engineer-section" style="margin-top:8px;">
                <strong style="font-size:12px; display:block; margin-bottom:6px;">Delegate To</strong>
                <div class="engineer-delegate-grid">
                  <button class="btn-secondary engineer-delegate-btn" onclick="engineerDelegate('architect')" title="Architecture decisions, cross-cutting design">Architect</button>
                  <button class="btn-secondary engineer-delegate-btn" onclick="engineerDelegate('modularity-lead')" title="Decoupling, dependency hygiene, duplication">Modularity Lead</button>
                  <button class="btn-secondary engineer-delegate-btn" onclick="engineerDelegate('verifier')" title="Tests, gates, compliance checks">Verifier</button>
                  <button class="btn-secondary engineer-delegate-btn" onclick="engineerDelegate('doc-officer')" title="Docs freshness, template fill, sync">Doc Officer</button>
                  <button class="btn-secondary engineer-delegate-btn" onclick="engineerDelegate('planner')" title="Task breakdown, sequencing, priorities">Planner</button>
                  <button class="btn-secondary engineer-delegate-btn" onclick="engineerDelegate('release-captain')" title="Packaging, versioning, release readiness">Release Captain</button>
                </div>
              </div>

              <!-- History Section -->
              <div class="engineer-section" style="margin-top:8px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                  <strong style="font-size:12px;">History</strong>
                  <button class="btn-secondary" onclick="engineerRequestHistory()" style="padding:2px 8px; font-size:10px;">Refresh</button>
                </div>
                <div id="engineerHistoryList" class="engineer-history-list">
                  <div style="font-size:10px; color:var(--text-secondary); text-align:center; padding:8px;">No history yet.</div>
                </div>
              </div>
            </div>

            <!-- Comms Array (Phase 7) -->
            <div class="control-tab-panel" id="controlTabComms" style="display:none;">

              <!-- Tier Section -->
              <div class="comms-section">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                  <strong style="font-size:12px;">Comms Tier</strong>
                  <select id="commsTierSelect" onchange="commsSetTier(this.value)" style="padding:2px 6px; font-size:10px; background:var(--bg-secondary); color:var(--text-primary); border:1px solid var(--border-color); border-radius:3px;">
                    <option value="1">Tier 1 — API Testing</option>
                    <option value="2">Tier 2 — Vulnerability Scanning</option>
                    <option value="3">Tier 3 — Full Pentest</option>
                  </select>
                </div>
                <div style="background:var(--bg-secondary); border-radius:4px; height:6px; overflow:hidden;">
                  <div id="commsTierBar" style="height:100%; width:33%; background:#3b82f6; border-radius:4px; transition:width 0.3s, background 0.3s;"></div>
                </div>
                <div id="commsTierLabel" style="font-size:10px; color:#3b82f6; margin-top:4px;">Tier 1 — API Testing</div>
              </div>

              <!-- Services Section -->
              <div class="comms-section" style="margin-top:8px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                  <strong style="font-size:12px;">MCP Services</strong>
                  <button class="btn-secondary" onclick="commsCheckServices()" style="padding:2px 8px; font-size:10px;">Check</button>
                </div>
                <div id="commsServicesList" style="display:flex; flex-direction:column; gap:4px;">
                  <div class="comms-service-row"><span>📬 Postman</span><span style="font-size:10px; color:#6b7280;">🔴 Not checked</span></div>
                  <div class="comms-service-row"><span>⚡ ZAP</span><span style="font-size:10px; color:#6b7280;">🔴 Not checked</span></div>
                  <div class="comms-service-row"><span>🔓 Pentest</span><span style="font-size:10px; color:#6b7280;">🔴 Not checked</span></div>
                </div>
              </div>

              <!-- Quick Scan Section -->
              <div class="comms-section" style="margin-top:8px;">
                <strong style="font-size:12px; display:block; margin-bottom:6px;">Run Scan</strong>
                <div style="display:flex; flex-direction:column; gap:4px;">
                  <input type="text" id="commsScanTarget" placeholder="https://api.example.com" style="padding:4px 8px; font-size:10px; background:var(--bg-secondary); color:var(--text-primary); border:1px solid var(--border-color); border-radius:4px; width:100%; box-sizing:border-box;" />
                  <div style="display:flex; gap:4px;">
                    <select id="commsScanProfileSelect" style="flex:1; padding:4px 6px; font-size:10px; background:var(--bg-secondary); color:var(--text-primary); border:1px solid var(--border-color); border-radius:4px;">
                      <option value="apiTest">API Test</option>
                      <option value="gameBackend">Game Backend Scan (Tier 2+)</option>
                      <option value="owaspTop10">OWASP Top 10 (Tier 2+)</option>
                      <option value="antiCheat">Anti-Cheat Audit (Tier 2+)</option>
                      <option value="fullPentest">Full Pentest (Tier 3)</option>
                    </select>
                    <button class="btn-primary" onclick="commsStartScan()" style="padding:4px 12px; font-size:10px; white-space:nowrap;">Scan</button>
                  </div>
                  <div style="display:flex; gap:8px; align-items:center;">
                    <span id="commsScanStatus" style="font-size:10px; color:var(--text-secondary);"></span>
                    <span id="commsScanIndicator" style="font-size:10px; color:#f59e0b; display:none;"></span>
                  </div>
                </div>
              </div>

              <!-- Recent Scans Section -->
              <div class="comms-section" style="margin-top:8px;">
                <strong style="font-size:12px; display:block; margin-bottom:6px;">Recent Scans</strong>
                <div id="commsRecentScansList" style="max-height:250px; overflow-y:auto;">
                  <div style="font-size:10px; color:var(--text-secondary); text-align:center; padding:12px;">No scans yet. Enter a target URL and run a scan.</div>
                </div>
                <!-- Scan Detail View (hidden by default) -->
                <div id="commsScanDetail" style="display:none;"></div>
              </div>

            </div>

            <!-- Infra / Ops Array (Phase 8) -->
            <div class="control-tab-panel" id="controlTabInfra" style="display:none;">

              <!-- Server List -->
              <div class="ops-section">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                  <strong style="font-size:12px;">Servers</strong>
                  <button class="btn-secondary" onclick="opsRequestState()" style="padding:2px 8px; font-size:10px;">Refresh</button>
                </div>
                <div id="opsServerList" style="max-height:200px; overflow-y:auto;">
                  <div style="font-size:10px; color:var(--text-secondary); text-align:center; padding:12px;">No servers configured. Click "+ Add Server" to get started.</div>
                </div>
              </div>

              <!-- Add Server Form -->
              <div class="ops-section" style="margin-top:8px;">
                <strong style="font-size:12px; display:block; margin-bottom:6px;">+ Add Server</strong>
                <div style="display:flex; flex-direction:column; gap:4px;">
                  <input type="text" id="opsServerName" placeholder="Server name (e.g. game-server-1)" style="padding:4px 8px; font-size:10px; background:var(--bg-secondary); color:var(--text-primary); border:1px solid var(--border-color); border-radius:4px; width:100%; box-sizing:border-box;" />
                  <div style="display:flex; gap:4px;">
                    <input type="text" id="opsServerHost" placeholder="hostname or IP" style="flex:1; padding:4px 8px; font-size:10px; background:var(--bg-secondary); color:var(--text-primary); border:1px solid var(--border-color); border-radius:4px;" />
                    <input type="text" id="opsServerUser" placeholder="user" value="root" style="width:60px; padding:4px 8px; font-size:10px; background:var(--bg-secondary); color:var(--text-primary); border:1px solid var(--border-color); border-radius:4px;" />
                  </div>
                  <div style="display:flex; gap:4px; align-items:center;">
                    <button class="btn-primary" onclick="opsAddServer()" style="padding:4px 12px; font-size:10px;">Add</button>
                    <span id="opsAddStatus" style="font-size:10px; color:var(--text-secondary);"></span>
                  </div>
                </div>
              </div>

              <!-- Server Detail -->
              <div class="ops-section" style="margin-top:8px;">
                <div id="opsServerDetail">
                  <div style="font-size:10px; color:var(--text-secondary); text-align:center; padding:8px;">Select a server to view details.</div>
                </div>
              </div>

              <!-- Command Execution -->
              <div class="ops-section" style="margin-top:8px;">
                <strong style="font-size:12px; display:block; margin-bottom:6px;">Execute Command</strong>
                <div style="display:flex; gap:4px;">
                  <input type="text" id="opsCommandInput" placeholder="e.g. ufw status, systemctl status game-server" style="flex:1; padding:4px 8px; font-size:10px; background:var(--bg-secondary); color:var(--text-primary); border:1px solid var(--border-color); border-radius:4px;" onkeydown="if(event.key==='Enter'){opsExecuteActiveCommand();}" />
                  <label style="font-size:9px; display:flex; align-items:center; gap:2px; white-space:nowrap;"><input type="checkbox" id="opsCommandSudo" /> sudo</label>
                  <button class="btn-primary" onclick="opsExecuteActiveCommand()" style="padding:4px 10px; font-size:10px;">Run</button>
                </div>
                <div id="opsCommandOutput" style="display:none; margin-top:4px;"></div>
              </div>

              <!-- Recent Operations -->
              <div class="ops-section" style="margin-top:8px;">
                <strong style="font-size:12px; display:block; margin-bottom:6px;">Recent Operations</strong>
                <div id="opsRecentOpsList" style="max-height:180px; overflow-y:auto;">
                  <div style="font-size:10px; color:var(--text-secondary); text-align:center; padding:8px;">No operations yet.</div>
                </div>
              </div>

            </div>

          </div>

        <!-- Planning panel (hidden, rendered dynamically by planningPanel.ts) -->
        <div id="planningPanel" style="display:none;"></div>
        <div id="planSummary" style="display:none;"></div>
        <div id="planList" style="display:none;"></div>
        <div id="planIntent" style="display:none;"></div>
        <div id="planTemplateSelect" style="display:none;"></div>
        <!-- Ticket panel (accessible from Dashboard Tickets tab) -->
        <div id="ticketPanel" style="display:none;">
          <div id="ticketList"></div>
        </div>
	      </div>
	    </div>

        <!-- Flow Panel (Context Flow Visualization) -->
        <div class="right-panel-content" id="flowPanelContent">
          <div class="flow-panel-header">
            <span class="flow-panel-title">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"></path>
              </svg>
              <span id="flowPanelPhase">Synthesis</span>
            </span>
            <div class="flow-panel-stats">
              <span class="flow-stat" id="flowPanelTokens">0 tokens</span>
              <span class="flow-stat" id="flowPanelChunks">0 threads</span>
            </div>
          </div>
          <div class="flow-panel-canvas" id="contextFlowCanvas">
            <!-- D3 visualization renders here -->
          </div>
          <div class="flow-panel-legend">
            <div class="legend-item"><span class="legend-dot query"></span>Query</div>
            <div class="legend-item"><span class="legend-dot chat"></span>Chat</div>
            <div class="legend-item"><span class="legend-dot kb"></span>KB</div>
            <div class="legend-item"><span class="legend-dot memory"></span>Memory</div>
            <div class="legend-item"><span class="legend-dot sector"></span>Rules</div>
            <div class="legend-item"><span class="legend-dot response"></span>Answer</div>
          </div>
        </div>

        <!-- Planning Panel (4-phase structured planning) -->
        <div class="right-panel-content" id="planningPanelContent">
          <div class="panel-header">
            <span>Planning</span>
            <span class="planning-status-badge" id="planningStatusBadge">Inactive</span>
          </div>
          <div class="planning-panel-body">
            <!-- Rendered dynamically by planningPanel.ts -->
          </div>
        </div>


        <!-- Chat Split Panel (placeholder, content cloned from main chat by JS) -->
        <div class="right-panel-content" id="chatPanelContent" style="display:none;">
          <div class="panel-header">
            <span>Chat Split</span>
            <button class="btn-icon" onclick="toggleChatSplit()" title="Close split">×</button>
          </div>
          <div class="chat-split-mirror" id="chatSplitMirror">
            <div class="empty-state">Chat split active. Messages appear here too.</div>
          </div>
        </div>

	  </div><!-- End station-section -->

      </div><!-- End content-pane -->

      <!-- Single-panel mode toggle FAB (visible when viewport too narrow for side-by-side) -->
      <button class="panel-toggle-fab" id="panelToggleFab" onclick="toggleSinglePanelView()" title="Toggle Chat / Content">&#x21C4;</button>

	  <div class="splitter" id="mainSplitter" title="Drag to resize" style="display:none;"></div>
	</div><!-- End main-split -->

  </div><!-- End content -->

  <!-- Max tabs modal -->
  <div class="modal-overlay" id="maxTabsModal">
    <div class="modal-box">
      <div class="modal-icon">📑</div>
      <div class="modal-title">Tab Limit Reached</div>
      <div class="modal-message">You have 5 chat tabs open. Please close one to create a new chat.</div>
      <button class="modal-btn" onclick="closeMaxTabsModal()">Got it</button>
    </div>
  </div>

  <!-- Initialize globals for panel.js -->
  <script>
    window.__SC_STATION_MAP__ = JSON.parse(atob('${stationMapBase64}'));
    window.__SC_BUILD_ID__ = '${buildId}';
    window.__SC_VSCODE__ = acquireVsCodeApi();
  </script>
  <!-- D3.js for AI Flow visualization -->
  <script src="${d3JsUri}"></script>
  <script src="${panelJsUri}"></script>
</body>
</html>`;
    // Note: Base64 wrapping removed - main JS now loaded from external panel.js
    // Debug: dump HTML to temp file for inspection
    try {
      fs.writeFileSync(path.join(os.tmpdir(), 'spacecode-webview.html'), html, 'utf8');
    } catch {
      // Ignore dump failures.
    }
    return html;
  }
