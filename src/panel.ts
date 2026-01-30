import * as vscode from 'vscode';
import { ChatController } from './chat/chatController';

// Minimal panel: chat + spaceship UI lives in media/main.js.
export class SpaceCodePanel {
  public static currentPanel: SpaceCodePanel | undefined;
  public static readonly viewType = 'spacecode.panel';
  private static _output = vscode.window.createOutputChannel('SpaceCode', { log: true });

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _context: vscode.ExtensionContext;
  private readonly _chat: ChatController;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
    const column = vscode.window.activeTextEditor?.viewColumn;

    if (SpaceCodePanel.currentPanel) {
      SpaceCodePanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      SpaceCodePanel.viewType,
      'SpaceCode',
      column ?? vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
      }
    );

    SpaceCodePanel.currentPanel = new SpaceCodePanel(panel, extensionUri, context);
  }

  public static reload() {
    SpaceCodePanel.currentPanel?._reloadWebview();
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._context = context;
    this._chat = new ChatController();
    SpaceCodePanel._output.info('SpaceCode panel created');

    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);

    this._panel.webview.onDidReceiveMessage(
      async (message: any) => {
        await this._handleMessage(message);
      },
      undefined,
      this._disposables
    );

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  public dispose() {
    SpaceCodePanel.currentPanel = undefined;
    this._chat.stop();
    SpaceCodePanel._output.info('SpaceCode panel disposed');

    this._panel.dispose();

    while (this._disposables.length) {
      const d = this._disposables.pop();
      try {
        d?.dispose();
      } catch {
        // ignore
      }
    }
  }

  private _reloadWebview() {
    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
    // The webview is recreated when we set html; delay so the frontend can receive the message.
    setTimeout(() => {
      try {
        this._panel.webview.postMessage({ type: 'reloaded', at: Date.now() });
      } catch {
        // ignore
      }
    }, 250);
  }

  private async _handleMessage(message: any) {
    switch (message?.type) {
      case 'ping':
        this._panel.webview.postMessage({ type: 'pong', now: Date.now() });
        return;
      case 'getContextPack':
        // TODO: call Coordinator. For now, return a tiny, explicit injection stub.
        this._panel.webview.postMessage({
          type: 'contextPack',
          pack: {
            id: 'ctx-' + Date.now(),
            profile: message.profile ?? 'yard',
            sector: { id: 'yard', name: 'Yard/Lab', pathHints: ['Packages/Experimental', 'Assets/Experimental'] },
            pinnedFacts: {
              unityVersion: 'unknown (wire from Unity Bridge)',
              renderPipeline: 'URP (configure)',
              inputSystem: 'Input System (configure)'
            },
            rulesSummary: 'Yard mode: relaxed rules; still respect compileability and avoid touching protected paths.',
            evidence: { files: [], notes: ['This is a stub pack; Coordinator integration will make it real.'] },
            injectionText:
              '[SpaceCode Context Pack]\n' +
              'Profile: yard\n' +
              'Sector: Yard/Lab\n' +
              'Pinned facts: Unity=unknown, RP=URP, Input=Input System\n' +
              'Rules: relaxed; do not touch protected paths; keep changes small.\n'
          }
        });
        return;
      case 'stop':
        this._chat.stop();
        SpaceCodePanel._output.warn('Stop requested');
        this._panel.webview.postMessage({ type: 'stopped' });
        return;
      case 'chatSend': {
        const text = String(message.text || '').trim();
        if (!text) return;

        // TODO: inject Coordinator-built context pack. For now use stub.
        const prompt = text;
        SpaceCodePanel._output.info(`Claude send: ${prompt.slice(0, 120)}`);
        await this._chat.send('claude', prompt, this._chatCallbacks());
        return;
      }
      case 'askGpt': {
        const text = String(message.text || '').trim();
        if (!text) return;
        const prompt = text;
        SpaceCodePanel._output.info(`GPT send: ${prompt.slice(0, 120)}`);
        await this._chat.send('gpt', prompt, this._chatCallbacks());
        return;
      }
      case 'mastermind': {
        const text = String(message.text || '').trim();
        if (!text) return;
        SpaceCodePanel._output.info(`Mastermind start: ${text.slice(0, 120)}`);
        await this._chat.mastermind(text, this._chatCallbacks());
        return;
      }
    }
  }

  private _chatCallbacks() {
    return {
      onAssistantStart: (provider: any, messageId: string) => {
        SpaceCodePanel._output.info(`${provider} start (${messageId})`);
        this._panel.webview.postMessage({ type: 'assistantStart', provider, id: messageId });
      },
      onAssistantChunk: (provider: any, messageId: string, delta: string) => {
        // Avoid logging chunks; too noisy.
        this._panel.webview.postMessage({ type: 'assistantChunk', provider, id: messageId, delta });
      },
      onAssistantEnd: (provider: any, messageId: string) => {
        SpaceCodePanel._output.info(`${provider} end (${messageId})`);
        this._panel.webview.postMessage({ type: 'assistantEnd', provider, id: messageId });
      },
      onError: (msg: string) => {
        SpaceCodePanel._output.error(msg);
        this._panel.webview.postMessage({ type: 'error', message: msg });
      }
    };
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    // Cache-bust webview resources so `Reload Panel` reliably picks up rebuilt bundles.
    const buildId = Date.now().toString();
    const scriptUri = webview
      .asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'))
      .with({ query: `v=${buildId}` });
    const styleUri = webview
      .asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css'))
      .with({ query: `v=${buildId}` });
    const shipUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'ship.png'));

    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src ${webview.cspSource} 'unsafe-inline'`
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SpaceCode</title>
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <div id="root"></div>
  <script>
    window.__SPACECODE__ = { shipUrl: ${JSON.stringify(String(shipUri))}, buildId: ${JSON.stringify(buildId)} };
  </script>
  <script src="${scriptUri}"></script>
</body>
</html>`;
  }
}
