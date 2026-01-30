import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class HotspotToolPanel {
  public static currentPanel: HotspotToolPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _currentSceneId: string = 'station';

  public static createOrShow(extensionUri: vscode.Uri, sceneId?: string) {
    // Open in main editor area (full screen modal-like)
    const column = vscode.ViewColumn.One;

    if (HotspotToolPanel.currentPanel) {
      HotspotToolPanel.currentPanel._panel.reveal(column);
      if (sceneId) {
        HotspotToolPanel.currentPanel.setScene(sceneId);
      }
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'spacecodeHotspotTool',
      '🛸 Hotspot Editor',
      column,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
        retainContextWhenHidden: true,
      }
    );

    HotspotToolPanel.currentPanel = new HotspotToolPanel(panel, extensionUri, sceneId);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, sceneId?: string) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._currentSceneId = sceneId || 'station';

    this._update();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case 'saveHotspots':
            await this._saveHotspots(message.sceneId, message.hotspots);
            break;
          case 'loadScene':
            this.setScene(message.sceneId);
            break;
          case 'ready':
            this._sendInitialData();
            break;
        }
      },
      null,
      this._disposables
    );
  }

  public setScene(sceneId: string) {
    this._currentSceneId = sceneId;
    this._sendInitialData();
  }

  private _sendInitialData() {
    const stationMap = this._loadStationMap();
    const mediaUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media')
    );

    // Resolve image URLs for each scene
    if (stationMap?.scenes) {
      for (const sceneId of Object.keys(stationMap.scenes)) {
        const scene = stationMap.scenes[sceneId];
        if (scene?.image) {
          const parts = scene.image.split('/');
          scene.imageUrl = this._panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', ...parts)
          ).toString();
        }
      }
    }

    this._panel.webview.postMessage({
      type: 'init',
      stationMap,
      currentSceneId: this._currentSceneId,
      mediaUri: mediaUri.toString(),
    });
  }

  private _loadStationMap(): any {
    try {
      const mapPath = path.join(this._extensionUri.fsPath, 'media', 'station-map.json');
      const raw = fs.readFileSync(mapPath, 'utf8');
      return JSON.parse(raw);
    } catch (e) {
      return {
        version: 1,
        startScene: 'station',
        imageWidth: 2752,
        imageHeight: 1536,
        scenes: {}
      };
    }
  }

  private async _saveHotspots(sceneId: string, hotspots: any[]) {
    try {
      const mapPath = path.join(this._extensionUri.fsPath, 'media', 'station-map.json');
      const stationMap = this._loadStationMap();

      if (!stationMap.scenes) stationMap.scenes = {};
      if (!stationMap.scenes[sceneId]) {
        stationMap.scenes[sceneId] = { title: sceneId, image: '', hotspots: [] };
      }

      stationMap.scenes[sceneId].hotspots = hotspots;

      fs.writeFileSync(mapPath, JSON.stringify(stationMap, null, 2), 'utf8');

      this._panel.webview.postMessage({
        type: 'saveSuccess',
        sceneId,
        message: `Saved ${hotspots.length} hotspot(s) to station-map.json`
      });

      vscode.window.showInformationMessage(`Hotspots saved for "${sceneId}"`);
    } catch (e: any) {
      this._panel.webview.postMessage({
        type: 'saveError',
        message: e.message
      });
      vscode.window.showErrorMessage(`Failed to save hotspots: ${e.message}`);
    }
  }

  public dispose() {
    HotspotToolPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) x.dispose();
    }
  }

  private _update() {
    this._panel.title = 'Hotspot Editor';
    this._panel.webview.html = this._getHtmlContent();
  }

  private _getHtmlContent(): string {
    const cspSource = this._panel.webview.cspSource;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https:; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
  <title>Hotspot Editor</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: var(--vscode-font-family, system-ui, sans-serif);
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      background: var(--vscode-editor-background, #0b0f1a);
      color: var(--vscode-editor-foreground, #f5f5f5);
    }
    header {
      padding: 0.75rem 1rem;
      background: var(--vscode-sideBar-background, #111827);
      border-bottom: 1px solid var(--vscode-panel-border, #1f2937);
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    header h1 { margin: 0; font-size: 1rem; }
    header select {
      padding: 0.4rem 0.6rem;
      border-radius: 4px;
      border: 1px solid var(--vscode-input-border, #374151);
      background: var(--vscode-input-background, #0b0f1a);
      color: var(--vscode-input-foreground, #f5f5f5);
      font-size: 13px;
    }
    #workspace {
      flex: 1;
      display: grid;
      grid-template-columns: 1.2fr 0.8fr;
      gap: 0.75rem;
      padding: 0.75rem;
      min-height: 0;
    }
    #image-wrapper {
      position: relative;
      background: #05080f;
      border: 1px solid var(--vscode-panel-border, #1f2937);
      border-radius: 6px;
      overflow: hidden;
    }
    #station-image {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
    }
    #svg-overlay {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }
    #click-overlay {
      position: absolute;
      inset: 0;
      cursor: crosshair;
    }
    #controls {
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
      overflow-y: auto;
      font-size: 13px;
    }
    button {
      padding: 0.5rem 0.75rem;
      border-radius: 4px;
      border: none;
      background: var(--vscode-button-background, #2563eb);
      color: var(--vscode-button-foreground, white);
      font-weight: 600;
      cursor: pointer;
      font-size: 12px;
    }
    button:hover { filter: brightness(1.1); }
    button:disabled { opacity: 0.4; cursor: not-allowed; }
    .secondary {
      background: var(--vscode-button-secondaryBackground, #111827);
      color: var(--vscode-button-secondaryForeground, #f5f5f5);
      border: 1px solid var(--vscode-input-border, #374151);
    }
    .success { background: #059669; }
    .danger { background: #dc2626; }
    label { font-size: 0.85rem; display: block; margin-bottom: 0.2rem; opacity: 0.7; }
    textarea {
      width: 100%;
      padding: 0.5rem;
      border-radius: 4px;
      border: 1px solid var(--vscode-input-border, #374151);
      background: var(--vscode-input-background, #0b0f1a);
      color: var(--vscode-input-foreground, #f5f5f5);
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11px;
      resize: vertical;
      min-height: 100px;
    }
    #status {
      font-size: 0.8rem;
      padding: 0.4rem 0.6rem;
      background: rgba(0,212,255,0.1);
      border-radius: 4px;
      border: 1px solid rgba(0,212,255,0.3);
      color: #00d4ff;
    }
    .description {
      font-size: 0.75rem;
      color: #fbbf24;
      padding: 0.4rem;
      background: rgba(251,191,36,0.1);
      border-radius: 4px;
      border: 1px solid rgba(251,191,36,0.3);
    }
    #coords-list {
      margin: 0;
      padding: 0.4rem;
      list-style: none;
      font-size: 0.75rem;
      line-height: 1.4;
      max-height: 80px;
      overflow-y: auto;
      background: var(--vscode-input-background, #111827);
      border-radius: 4px;
      font-family: monospace;
    }
    .btn-row { display: flex; gap: 0.4rem; }
    .btn-row button { flex: 1; }
    h3 { margin: 0.4rem 0; font-size: 0.8rem; opacity: 0.7; }
    #cursor-pos {
      position: fixed;
      bottom: 0.5rem;
      left: 0.5rem;
      background: rgba(0,0,0,0.85);
      padding: 0.3rem 0.6rem;
      border-radius: 4px;
      font-family: monospace;
      font-size: 12px;
      color: #00d4ff;
      pointer-events: none;
    }
    .sector-status {
      display: flex;
      flex-wrap: wrap;
      gap: 0.3rem;
    }
    .sector-badge {
      padding: 0.2rem 0.4rem;
      border-radius: 3px;
      font-size: 0.7rem;
      font-weight: 600;
    }
    .sector-badge.done { background: #059669; color: white; }
    .sector-badge.pending { background: #374151; color: #9ca3af; }
    .sector-badge.current { background: #2563eb; color: white; }
    .scene-info {
      padding: 0.4rem;
      background: var(--vscode-input-background);
      border-radius: 4px;
      font-size: 0.8rem;
    }
    .scene-info strong { color: #00d4ff; }
  </style>
</head>
<body>

<header>
  <h1>Hotspot Editor</h1>
  <select id="scene-select">
    <option value="">Loading scenes...</option>
  </select>
  <button id="save-btn" class="success" disabled>💾 Save to JSON</button>
</header>

<section id="workspace">
  <div id="image-wrapper">
    <img id="station-image" src="" alt="Scene">
    <svg id="svg-overlay" viewBox="0 0 2752 1536" preserveAspectRatio="xMidYMid meet">
      <g id="existing-hotspots"></g>
      <g id="completed-polygons"></g>
      <polyline id="current-polyline" points="" fill="none" stroke="#00d4ff" stroke-width="4" stroke-linejoin="round"/>
      <polygon id="finished-polygon" points="" fill="rgba(0,212,255,0.2)" stroke="#00d4ff" stroke-width="4" style="display:none"/>
      <g id="points-group"></g>
    </svg>
    <div id="click-overlay"></div>
  </div>

  <div id="controls">
    <div class="scene-info" id="scene-info">Select a scene to edit hotspots</div>

    <div id="status">Click on the image to trace a hotspot polygon.</div>

    <div>
      <label>Hotspot ID</label>
      <input type="text" id="hotspot-id" placeholder="e.g., bridge, back, sector1" style="width:100%; padding:0.4rem; border-radius:4px; border:1px solid var(--vscode-input-border); background:var(--vscode-input-background); color:var(--vscode-input-foreground);">
    </div>
    <div>
      <label>Label</label>
      <input type="text" id="hotspot-label" placeholder="e.g., Command Bridge" style="width:100%; padding:0.4rem; border-radius:4px; border:1px solid var(--vscode-input-border); background:var(--vscode-input-background); color:var(--vscode-input-foreground);">
    </div>
    <div>
      <label>Target Scene (leave empty for no navigation)</label>
      <input type="text" id="hotspot-target" placeholder="e.g., bridge, station" style="width:100%; padding:0.4rem; border-radius:4px; border:1px solid var(--vscode-input-border); background:var(--vscode-input-background); color:var(--vscode-input-foreground);">
    </div>

    <div class="btn-row">
      <button id="undo-point" class="secondary" disabled>Undo Point</button>
      <button id="close-polygon" disabled>Close Polygon</button>
    </div>

    <div class="btn-row">
      <button id="add-hotspot" class="success" disabled>Add Hotspot</button>
      <button id="clear-current" class="secondary">Clear Drawing</button>
    </div>

    <div>
      <h3>Points (<span id="point-count">0</span>)</h3>
      <ul id="coords-list"><li>(click image to add points)</li></ul>
    </div>

    <div>
      <h3>Hotspots in this scene (<span id="hotspot-count">0</span>)</h3>
      <div id="hotspot-list"></div>
    </div>

    <div class="btn-row">
      <button id="delete-selected" class="danger secondary" disabled>Delete Selected</button>
    </div>

    <div>
      <label>JSON Preview</label>
      <textarea id="json-output" readonly></textarea>
    </div>
  </div>
</section>

<div id="cursor-pos">x: 0, y: 0</div>

<script>
const vscode = acquireVsCodeApi();

let stationMap = null;
let currentSceneId = 'station';
let points = [];
let isClosed = false;
let sceneHotspots = [];
let selectedHotspotIndex = -1;

const overlay = document.getElementById('click-overlay');
const statusEl = document.getElementById('status');
const coordsList = document.getElementById('coords-list');
const pointCount = document.getElementById('point-count');
const hotspotCount = document.getElementById('hotspot-count');
const polyline = document.getElementById('current-polyline');
const polygon = document.getElementById('finished-polygon');
const pointsGroup = document.getElementById('points-group');
const existingHotspotsGroup = document.getElementById('existing-hotspots');
const completedPolygons = document.getElementById('completed-polygons');
const jsonOutput = document.getElementById('json-output');
const closeBtn = document.getElementById('close-polygon');
const undoBtn = document.getElementById('undo-point');
const clearCurrentBtn = document.getElementById('clear-current');
const addHotspotBtn = document.getElementById('add-hotspot');
const saveBtn = document.getElementById('save-btn');
const deleteBtn = document.getElementById('delete-selected');
const img = document.getElementById('station-image');
const cursorPos = document.getElementById('cursor-pos');
const sceneSelect = document.getElementById('scene-select');
const sceneInfo = document.getElementById('scene-info');
const hotspotIdInput = document.getElementById('hotspot-id');
const hotspotLabelInput = document.getElementById('hotspot-label');
const hotspotTargetInput = document.getElementById('hotspot-target');
const hotspotListEl = document.getElementById('hotspot-list');

function getImageCoords(event) {
  const imgRect = img.getBoundingClientRect();
  const imgAspect = img.naturalWidth / img.naturalHeight;
  const containerAspect = imgRect.width / imgRect.height;

  let displayedWidth, displayedHeight, offsetX, offsetY;

  if (imgAspect > containerAspect) {
    displayedWidth = imgRect.width;
    displayedHeight = imgRect.width / imgAspect;
    offsetX = 0;
    offsetY = (imgRect.height - displayedHeight) / 2;
  } else {
    displayedHeight = imgRect.height;
    displayedWidth = imgRect.height * imgAspect;
    offsetX = (imgRect.width - displayedWidth) / 2;
    offsetY = 0;
  }

  const clickX = event.clientX - imgRect.left - offsetX;
  const clickY = event.clientY - imgRect.top - offsetY;
  const scaleX = img.naturalWidth / displayedWidth;
  const scaleY = img.naturalHeight / displayedHeight;

  return {
    x: Math.max(0, Math.min(img.naturalWidth, Math.round(clickX * scaleX))),
    y: Math.max(0, Math.min(img.naturalHeight, Math.round(clickY * scaleY)))
  };
}

function renderPolyline() {
  const coords = points.map(p => \`\${p.x},\${p.y}\`).join(' ');
  polyline.setAttribute('points', coords);
  polyline.style.display = isClosed ? 'none' : 'block';
}

function renderPolygon() {
  if (!isClosed || points.length < 3) {
    polygon.style.display = 'none';
    return;
  }
  const coords = points.map(p => \`\${p.x},\${p.y}\`).join(' ');
  polygon.setAttribute('points', coords);
  polygon.style.display = 'block';
}

function renderExistingHotspots() {
  existingHotspotsGroup.innerHTML = '';
  sceneHotspots.forEach((h, idx) => {
    if (!h.points || h.points.length < 3) return;
    const coords = h.points.map(p => \`\${p.x},\${p.y}\`).join(' ');
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', coords);
    const isSelected = idx === selectedHotspotIndex;
    poly.setAttribute('fill', isSelected ? 'rgba(251,191,36,0.3)' : 'rgba(5,150,105,0.2)');
    poly.setAttribute('stroke', isSelected ? '#fbbf24' : '#059669');
    poly.setAttribute('stroke-width', isSelected ? '5' : '3');
    poly.style.cursor = 'pointer';
    poly.style.pointerEvents = 'all';
    poly.onclick = (e) => {
      e.stopPropagation();
      selectHotspot(idx);
    };
    existingHotspotsGroup.appendChild(poly);

    // Label
    const cx = h.points.reduce((s,p) => s + p.x, 0) / h.points.length;
    const cy = h.points.reduce((s,p) => s + p.y, 0) / h.points.length;
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', cx);
    text.setAttribute('y', cy);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', isSelected ? '#fbbf24' : '#10b981');
    text.setAttribute('font-size', '28');
    text.setAttribute('font-weight', 'bold');
    text.style.pointerEvents = 'none';
    text.textContent = h.label || h.id || (idx + 1);
    existingHotspotsGroup.appendChild(text);
  });
}

function renderPoints() {
  pointsGroup.innerHTML = '';
  points.forEach((p, i) => {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', p.x);
    circle.setAttribute('cy', p.y);
    circle.setAttribute('r', '10');
    circle.setAttribute('fill', i === 0 ? '#00ff88' : '#00d4ff');
    circle.setAttribute('stroke', '#fff');
    circle.setAttribute('stroke-width', '2');
    pointsGroup.appendChild(circle);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', p.x);
    text.setAttribute('y', p.y + 4);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', '#000');
    text.setAttribute('font-size', '12');
    text.setAttribute('font-weight', 'bold');
    text.textContent = i + 1;
    pointsGroup.appendChild(text);
  });
}

function updateList() {
  pointCount.textContent = points.length;
  if (!points.length) {
    coordsList.innerHTML = '<li>(click image to add points)</li>';
    return;
  }
  coordsList.innerHTML = '';
  points.forEach((p, i) => {
    const li = document.createElement('li');
    li.textContent = \`\${i + 1}. (\${p.x}, \${p.y})\`;
    coordsList.appendChild(li);
  });
}

function updateHotspotList() {
  hotspotCount.textContent = sceneHotspots.length;
  hotspotListEl.innerHTML = '';
  if (!sceneHotspots.length) {
    hotspotListEl.innerHTML = '<div style="opacity:0.5;font-size:0.75rem;">No hotspots yet</div>';
    return;
  }
  sceneHotspots.forEach((h, idx) => {
    const div = document.createElement('div');
    div.style.cssText = 'padding:0.3rem 0.5rem; margin:0.2rem 0; border-radius:4px; cursor:pointer; font-size:0.75rem;';
    div.style.background = idx === selectedHotspotIndex ? 'rgba(251,191,36,0.2)' : 'var(--vscode-input-background)';
    div.style.border = idx === selectedHotspotIndex ? '1px solid #fbbf24' : '1px solid transparent';
    div.textContent = \`\${h.id || '(no id)'} - \${h.label || '(no label)'}\${h.targetScene ? ' → ' + h.targetScene : ''}\`;
    div.onclick = () => selectHotspot(idx);
    hotspotListEl.appendChild(div);
  });
}

function selectHotspot(idx) {
  selectedHotspotIndex = idx === selectedHotspotIndex ? -1 : idx;
  deleteBtn.disabled = selectedHotspotIndex < 0;
  renderExistingHotspots();
  updateHotspotList();
}

function updateJsonOutput() {
  jsonOutput.value = JSON.stringify(sceneHotspots, null, 2);
}

function updateButtons() {
  closeBtn.disabled = points.length < 3 || isClosed;
  undoBtn.disabled = points.length === 0 || isClosed;
  addHotspotBtn.disabled = !isClosed || points.length < 3;
  saveBtn.disabled = false; // Always allow save
}

function updateStatus(msg) {
  statusEl.textContent = msg || (isClosed ? 'Polygon closed. Fill in details and click "Add Hotspot".' : 'Click to add points (min 3), then close polygon.');
}

function clearDrawing() {
  points = [];
  isClosed = false;
  polyline.setAttribute('points', '');
  polygon.setAttribute('points', '');
  polygon.style.display = 'none';
  pointsGroup.innerHTML = '';
  updateList();
  updateButtons();
  updateStatus();
}

function loadScene(sceneId) {
  currentSceneId = sceneId;
  const scene = stationMap?.scenes?.[sceneId];
  if (!scene) {
    sceneInfo.innerHTML = '<strong>Scene not found</strong>';
    return;
  }

  sceneInfo.innerHTML = \`<strong>\${scene.title || sceneId}</strong><br>Image: \${scene.image || '(none)'}\`;

  if (scene.imageUrl) {
    img.src = scene.imageUrl;
  }

  sceneHotspots = scene.hotspots ? JSON.parse(JSON.stringify(scene.hotspots)) : [];
  selectedHotspotIndex = -1;
  deleteBtn.disabled = true;

  clearDrawing();
  renderExistingHotspots();
  updateHotspotList();
  updateJsonOutput();
}

// Event listeners
overlay.addEventListener('click', (e) => {
  if (isClosed) return;
  const coords = getImageCoords(e);
  points.push(coords);
  renderPolyline();
  renderPoints();
  updateList();
  updateButtons();
  updateStatus();
});

overlay.addEventListener('mousemove', (e) => {
  const coords = getImageCoords(e);
  cursorPos.textContent = \`x: \${coords.x}, y: \${coords.y}\`;
});

sceneSelect.addEventListener('change', () => {
  loadScene(sceneSelect.value);
});

closeBtn.addEventListener('click', () => {
  if (points.length < 3) return;
  isClosed = true;
  renderPolyline();
  renderPolygon();
  updateButtons();
  updateStatus();
});

undoBtn.addEventListener('click', () => {
  if (points.length === 0 || isClosed) return;
  points.pop();
  renderPolyline();
  renderPoints();
  updateList();
  updateButtons();
  updateStatus();
});

clearCurrentBtn.addEventListener('click', clearDrawing);

addHotspotBtn.addEventListener('click', () => {
  if (points.length < 3 || !isClosed) return;

  const hotspot = {
    id: hotspotIdInput.value.trim() || \`hotspot_\${sceneHotspots.length + 1}\`,
    label: hotspotLabelInput.value.trim() || hotspotIdInput.value.trim(),
    points: points.map(({x, y}) => ({x, y})),
  };

  const target = hotspotTargetInput.value.trim();
  if (target) {
    hotspot.targetScene = target;
  }

  sceneHotspots.push(hotspot);

  // Clear inputs
  hotspotIdInput.value = '';
  hotspotLabelInput.value = '';
  hotspotTargetInput.value = '';

  clearDrawing();
  renderExistingHotspots();
  updateHotspotList();
  updateJsonOutput();
  updateStatus(\`Added hotspot "\${hotspot.id}". Don't forget to Save!\`);
});

deleteBtn.addEventListener('click', () => {
  if (selectedHotspotIndex < 0) return;
  const removed = sceneHotspots.splice(selectedHotspotIndex, 1)[0];
  selectedHotspotIndex = -1;
  deleteBtn.disabled = true;
  renderExistingHotspots();
  updateHotspotList();
  updateJsonOutput();
  updateStatus(\`Deleted "\${removed.id || 'hotspot'}". Don't forget to Save!\`);
});

saveBtn.addEventListener('click', () => {
  vscode.postMessage({
    type: 'saveHotspots',
    sceneId: currentSceneId,
    hotspots: sceneHotspots
  });
  updateStatus('Saving...');
});

// Handle messages from extension
window.addEventListener('message', (event) => {
  const message = event.data;
  switch (message.type) {
    case 'init':
      stationMap = message.stationMap;
      currentSceneId = message.currentSceneId || 'station';

      // Populate scene select
      sceneSelect.innerHTML = '';
      if (stationMap?.scenes) {
        Object.keys(stationMap.scenes).forEach(id => {
          const opt = document.createElement('option');
          opt.value = id;
          opt.textContent = \`\${stationMap.scenes[id].title || id}\`;
          if (id === currentSceneId) opt.selected = true;
          sceneSelect.appendChild(opt);
        });
      }

      loadScene(currentSceneId);
      break;

    case 'saveSuccess':
      updateStatus(message.message);
      break;

    case 'saveError':
      updateStatus('Error: ' + message.message);
      break;
  }
});

// Tell extension we're ready
vscode.postMessage({ type: 'ready' });
</script>

</body>
</html>`;
  }
}
