// Webview UI: chat on the left, PNG spaceship on the right, metadata strip.
// Keep it framework-free to reduce complexity and avoid React overhead.

declare function acquireVsCodeApi(): { postMessage: (msg: any) => void };

const vscode = acquireVsCodeApi();

type TabId = 'context' | 'gates' | 'system';

let activeTab: TabId = 'context';
let lastContextPackText = '';
let lastUserText = '';
const messageEls = new Map<string, HTMLElement>();
const buildId = String((window as any).__SPACECODE__?.buildId || '');

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function setActiveTab(tab: TabId) {
  activeTab = tab;
  for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-tab]')) {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  }
  for (const panel of document.querySelectorAll<HTMLElement>('[data-panel]')) {
    panel.style.display = panel.dataset.panel === tab ? 'block' : 'none';
  }
}

function render() {
  const root = document.getElementById('root');
  if (!root) return;

  root.innerHTML = '';

  const layout = el('div', 'layout');

  // Left: chat
  const left = el('div', 'left');
  const header = el('div', 'header');
  header.innerHTML = `
    <div class="brand">SpaceCode</div>
    <div class="headerBtns">
      <button id="btnContext">Context Pack</button>
      <button id="btnAskGpt">Ask GPT</button>
      <button id="btnMastermind">Mastermind</button>
      <button id="btnRunGates">Run Gates</button>
      <button id="btnStop">Stop</button>
    </div>
  `;

  const messages = el('div', 'messages');
  messages.id = 'messages';
  messages.innerHTML = `
    <div class="msg system">Welcome. This is the new SpaceCode UI scaffold (no Coordinator yet).</div>
  `;
  if (buildId) {
    // Visible signal that the webview bundle actually refreshed.
    setTimeout(() => appendSystem(`UI buildId: ${buildId}`), 0);
  }

  const composer = el('div', 'composer');
  composer.innerHTML = `
    <textarea id="input" rows="3" placeholder="Describe the task... (prototype in Yard, or dock into ship)" ></textarea>
    <div class="composerRow">
      <select id="profile">
        <option value="yard">Yard (prototype)</option>
        <option value="scout">Scout</option>
        <option value="battleship">Battleship</option>
      </select>
      <button id="send">Send</button>
    </div>
  `;

  left.appendChild(header);
  left.appendChild(messages);
  left.appendChild(composer);

  // Right: ship image + hotspots + metadata
  const right = el('div', 'right');

  const shipWrap = el('div', 'shipWrap');
  shipWrap.innerHTML = `
    <div class="shipTitle">Ship View</div>
    <div class="shipCanvas">
      <img id="shipImg" class="shipImg" alt="Ship" />
      <div class="hotspot" data-sector="yard" style="left: 8%; top: 70%; width: 28%; height: 22%;"></div>
      <div class="hotspot" data-sector="core" style="left: 52%; top: 22%; width: 40%; height: 26%;"></div>
      <div class="hotspot" data-sector="features" style="left: 40%; top: 54%; width: 48%; height: 30%;"></div>
    </div>
    <div class="shipHint">Replace ship image at media/ship.png (hotspots are placeholders).</div>
  `;

  const meta = el('div', 'meta');
  meta.innerHTML = `
    <div class="tabs">
      <button data-tab="context" class="active">Context</button>
      <button data-tab="gates">Gates</button>
      <button data-tab="system">System</button>
    </div>

    <div class="panel" data-panel="context" style="display:block">
      <div class="panelTitle">Prompt Injection Preview</div>
      <pre id="contextText" class="mono">(Click Context Pack to fetch)</pre>
    </div>

    <div class="panel" data-panel="gates" style="display:none">
      <div class="panelTitle">Gates</div>
      <div class="panelBody">(stub) Compile/tests/duplication/deps results will appear here.</div>
    </div>

    <div class="panel" data-panel="system" style="display:none">
      <div class="panelTitle">System Status</div>
      <div class="panelBody">
        <div>Coordinator: disconnected (stub)</div>
        <div>Unity Bridge: disconnected (stub)</div>
      </div>
    </div>
  `;

  right.appendChild(shipWrap);
  right.appendChild(meta);

  layout.appendChild(left);
  layout.appendChild(right);

  root.appendChild(layout);

  // Wire events
  document.getElementById('btnContext')?.addEventListener('click', () => {
    const profile = (document.getElementById('profile') as HTMLSelectElement | null)?.value || 'yard';
    vscode.postMessage({ type: 'getContextPack', profile });
    appendSystem(`Requested Context Pack (profile=${profile})`);
  });

  document.getElementById('btnAskGpt')?.addEventListener('click', () => {
    const text = lastUserText;
    if (!text) {
      appendSystem('Ask GPT: no user message yet.');
      return;
    }
    appendSystem('Ask GPT: sending last user message...');
    vscode.postMessage({ type: 'askGpt', text });
  });

  document.getElementById('btnMastermind')?.addEventListener('click', () => {
    const text = lastUserText;
    if (!text) {
      appendSystem('Mastermind: no user message yet.');
      return;
    }
    appendSystem('Mastermind: starting (Claude -> GPT -> Claude)...');
    vscode.postMessage({ type: 'mastermind', text });
  });

  document.getElementById('btnRunGates')?.addEventListener('click', () => {
    appendSystem('Run Gates: (stub) will trigger Coordinator gates + Unity compile/tests.');
    setActiveTab('gates');
  });

  document.getElementById('btnStop')?.addEventListener('click', () => {
    appendSystem('Stop requested.');
    vscode.postMessage({ type: 'stop' });
  });

  document.getElementById('send')?.addEventListener('click', () => {
    const input = document.getElementById('input') as HTMLTextAreaElement | null;
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    lastUserText = text;
    appendUser(text);
    input.value = '';

    // The extension will handle calling Claude/GPT. We only show the injected context preview.
    const ctx = lastContextPackText ? `\n\n---\n${lastContextPackText}` : '';
    appendSystem(`Sending to Claude...${ctx ? ' (with injected context)' : ''}`);
    vscode.postMessage({ type: 'chatSend', text });
  });

  for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-tab]')) {
    btn.addEventListener('click', () => setActiveTab(btn.dataset.tab as TabId));
  }

  for (const hs of document.querySelectorAll<HTMLElement>('.hotspot')) {
    hs.addEventListener('click', () => {
      const sector = hs.dataset.sector || 'unknown';
      appendSystem(`Sector selected: ${sector} (stub: will affect Context Pack focus + rules)`);
    });
  }

  // Load placeholder ship image (user can replace with AI-generated PNG).
  const shipImg = document.getElementById('shipImg') as HTMLImageElement | null;
  if (shipImg) {
    const shipUrl = (window as any).__SPACECODE__?.shipUrl as string | undefined;
    if (shipUrl) shipImg.src = shipUrl;
    shipImg.onerror = () => {
      shipImg.style.display = 'none';
    };
  }
}

function appendMsg(kind: 'user' | 'assistant' | 'system', text: string, id?: string) {
  const container = document.getElementById('messages');
  if (!container) return;
  const msg = el('div', `msg ${kind}`);
  msg.textContent = text;
  if (id) messageEls.set(id, msg);
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

function appendUser(text: string) {
  appendMsg('user', text);
}

function appendAssistant(text: string) {
  appendMsg('assistant', text);
}

function appendSystem(text: string) {
  appendMsg('system', text);
}

window.addEventListener('message', (event) => {
  const message = event.data;
  switch (message?.type) {
    case 'reloaded': {
      appendSystem(`Panel reloaded.`);
      break;
    }
    case 'contextPack': {
      const pack = message.pack;
      lastContextPackText = pack?.injectionText || '';
      const pre = document.getElementById('contextText');
      if (pre) {
        pre.textContent = lastContextPackText || '(empty)';
      }
      setActiveTab('context');
      appendSystem('Context Pack updated.');
      break;
    }
    case 'assistantStart': {
      const id = String(message.id || '');
      const provider = String(message.provider || 'assistant');
      appendMsg('assistant', `${provider}: `, id);
      break;
    }
    case 'assistantChunk': {
      const id = String(message.id || '');
      const delta = String(message.delta || '');
      const el = messageEls.get(id);
      if (el) el.textContent = (el.textContent || '') + delta;
      break;
    }
    case 'assistantEnd': {
      // no-op for now
      break;
    }
    case 'error': {
      appendSystem(`Error: ${String(message.message || '')}`);
      break;
    }
    case 'stopped': {
      appendSystem('Stopped.');
      break;
    }
    case 'pong':
      appendSystem(`pong: ${message.now}`);
      break;
  }
});

render();
