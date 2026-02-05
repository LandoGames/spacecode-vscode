import * as vscode from 'vscode';

/**
 * Live Markdown Editor Provider (Phase 9)
 *
 * Obsidian-style WYSIWYG markdown editing.
 * Registers as a CustomTextEditorProvider for .md files.
 */
export class MarkdownEditorProvider implements vscode.CustomTextEditorProvider {
  private static readonly viewType = 'spacecode.markdownEditor';

  constructor(private readonly context: vscode.ExtensionContext) {}

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new MarkdownEditorProvider(context);
    return vscode.window.registerCustomEditorProvider(
      MarkdownEditorProvider.viewType,
      provider,
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      }
    );
  }

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
    };

    // Set initial HTML
    webviewPanel.webview.html = this.getHtmlForWebview(
      webviewPanel.webview,
      document.getText()
    );

    // Track if we're currently applying an edit from the webview
    let isApplyingEdit = false;

    // Listen for changes from the webview
    const messageDisposable = webviewPanel.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case 'contentChanged': {
          if (typeof msg.content !== 'string') return;
          isApplyingEdit = true;
          const edit = new vscode.WorkspaceEdit();
          const fullRange = new vscode.Range(
            0,
            0,
            document.lineCount,
            document.lineAt(document.lineCount - 1).text.length
          );
          edit.replace(document.uri, fullRange, msg.content);
          await vscode.workspace.applyEdit(edit);
          isApplyingEdit = false;
          break;
        }
        case 'openLink': {
          if (msg.url) {
            vscode.env.openExternal(vscode.Uri.parse(msg.url));
          }
          break;
        }
      }
    });

    // Listen for external changes to the document
    const changeDisposable = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() === document.uri.toString() && !isApplyingEdit) {
        webviewPanel.webview.postMessage({
          type: 'documentChanged',
          content: document.getText(),
        });
      }
    });

    webviewPanel.onDidDispose(() => {
      messageDisposable.dispose();
      changeDisposable.dispose();
    });
  }

  private getHtmlForWebview(webview: vscode.Webview, content: string): string {
    const escapedContent = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Markdown Editor</title>
<style>
  :root {
    --editor-bg: var(--vscode-editor-background, #1e1e1e);
    --editor-fg: var(--vscode-editor-foreground, #d4d4d4);
    --editor-font: var(--vscode-editor-font-family, 'Consolas, monospace');
    --editor-font-size: var(--vscode-editor-font-size, 14px);
    --line-height: 1.6;
    --accent: var(--vscode-textLink-foreground, #4fc1ff);
    --border: var(--vscode-panel-border, #333);
    --selection: var(--vscode-editor-selectionBackground, rgba(38, 79, 120, 0.5));
    --heading-color: var(--vscode-editor-foreground, #e0e0e0);
    --code-bg: var(--vscode-textCodeBlock-background, rgba(255,255,255,0.06));
    --blockquote-border: var(--vscode-textBlockQuote-border, #444);
    --blockquote-bg: var(--vscode-textBlockQuote-background, rgba(255,255,255,0.03));
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: var(--editor-bg);
    color: var(--editor-fg);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: var(--editor-font-size);
    line-height: var(--line-height);
    padding: 0;
  }

  #editor-container {
    max-width: 820px;
    margin: 0 auto;
    padding: 24px 40px;
    min-height: 100vh;
  }

  /* Rendered view */
  #rendered {
    outline: none;
    cursor: text;
  }

  #rendered h1 { font-size: 2em; font-weight: 700; color: var(--heading-color); margin: 1em 0 0.5em; padding-bottom: 0.3em; border-bottom: 1px solid var(--border); }
  #rendered h2 { font-size: 1.5em; font-weight: 600; color: var(--heading-color); margin: 0.8em 0 0.4em; padding-bottom: 0.2em; border-bottom: 1px solid var(--border); }
  #rendered h3 { font-size: 1.25em; font-weight: 600; color: var(--heading-color); margin: 0.7em 0 0.3em; }
  #rendered h4 { font-size: 1.1em; font-weight: 600; margin: 0.6em 0 0.3em; }
  #rendered h5, #rendered h6 { font-size: 1em; font-weight: 600; margin: 0.5em 0 0.2em; }

  #rendered p { margin: 0.5em 0; }

  #rendered a { color: var(--accent); text-decoration: none; }
  #rendered a:hover { text-decoration: underline; }

  #rendered strong { font-weight: 700; }
  #rendered em { font-style: italic; }
  #rendered del { text-decoration: line-through; opacity: 0.7; }

  #rendered code {
    font-family: var(--editor-font);
    background: var(--code-bg);
    padding: 0.15em 0.4em;
    border-radius: 3px;
    font-size: 0.9em;
  }

  #rendered pre {
    background: var(--code-bg);
    padding: 12px 16px;
    border-radius: 6px;
    overflow-x: auto;
    margin: 0.8em 0;
    border: 1px solid var(--border);
  }
  #rendered pre code {
    background: none;
    padding: 0;
    font-size: 0.9em;
  }

  #rendered blockquote {
    border-left: 3px solid var(--blockquote-border);
    background: var(--blockquote-bg);
    padding: 8px 16px;
    margin: 0.5em 0;
    border-radius: 0 4px 4px 0;
  }

  #rendered ul, #rendered ol {
    margin: 0.5em 0;
    padding-left: 2em;
  }
  #rendered li { margin: 0.2em 0; }

  #rendered table {
    border-collapse: collapse;
    margin: 0.8em 0;
    width: 100%;
  }
  #rendered th, #rendered td {
    border: 1px solid var(--border);
    padding: 6px 12px;
    text-align: left;
  }
  #rendered th {
    background: var(--code-bg);
    font-weight: 600;
  }

  #rendered hr {
    border: none;
    border-top: 1px solid var(--border);
    margin: 1.5em 0;
  }

  #rendered img {
    max-width: 100%;
    border-radius: 4px;
  }

  /* Checkbox styling */
  #rendered input[type="checkbox"] {
    margin-right: 6px;
    cursor: pointer;
  }

  /* Source editor (shown on focus) */
  #source {
    display: none;
    width: 100%;
    min-height: 100vh;
    background: var(--editor-bg);
    color: var(--editor-fg);
    font-family: var(--editor-font);
    font-size: var(--editor-font-size);
    line-height: var(--line-height);
    border: none;
    outline: none;
    resize: none;
    padding: 0;
    tab-size: 4;
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  /* Floating toolbar */
  #toolbar {
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 100;
    background: var(--code-bg);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--border);
    padding: 4px 8px;
    gap: 2px;
    flex-wrap: wrap;
  }
  #toolbar.visible { display: flex; }
  .tb-btn {
    background: none;
    border: 1px solid transparent;
    color: var(--editor-fg);
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    font-family: var(--editor-font);
  }
  .tb-btn:hover { background: rgba(255,255,255,0.08); border-color: var(--border); }
  .tb-sep { width: 1px; background: var(--border); margin: 2px 4px; align-self: stretch; }

  /* Mode indicator */
  #mode-indicator {
    position: fixed;
    bottom: 8px;
    right: 12px;
    font-size: 10px;
    color: var(--editor-fg);
    opacity: 0.5;
    z-index: 50;
    user-select: none;
  }
</style>
</head>
<body>

<div id="toolbar">
  <button class="tb-btn" onclick="insertSyntax('**','**')" title="Bold (Cmd+B)"><strong>B</strong></button>
  <button class="tb-btn" onclick="insertSyntax('*','*')" title="Italic (Cmd+I)"><em>I</em></button>
  <button class="tb-btn" onclick="insertSyntax('~~','~~')" title="Strikethrough"><del>S</del></button>
  <button class="tb-btn" onclick="insertSyntax('\`','\`')" title="Inline Code">&lt;/&gt;</button>
  <div class="tb-sep"></div>
  <button class="tb-btn" onclick="insertLine('# ')" title="Heading 1">H1</button>
  <button class="tb-btn" onclick="insertLine('## ')" title="Heading 2">H2</button>
  <button class="tb-btn" onclick="insertLine('### ')" title="Heading 3">H3</button>
  <div class="tb-sep"></div>
  <button class="tb-btn" onclick="insertLine('- ')" title="Bullet List">•</button>
  <button class="tb-btn" onclick="insertLine('1. ')" title="Numbered List">1.</button>
  <button class="tb-btn" onclick="insertLine('- [ ] ')" title="Checkbox">☐</button>
  <div class="tb-sep"></div>
  <button class="tb-btn" onclick="insertLine('> ')" title="Blockquote">❝</button>
  <button class="tb-btn" onclick="insertSyntax('[', '](url)')" title="Link">🔗</button>
  <button class="tb-btn" onclick="insertLine('---')" title="Horizontal Rule">—</button>
  <div class="tb-sep"></div>
  <button class="tb-btn" onclick="toggleSource()" title="Toggle Source" id="toggleBtn">📝 Source</button>
</div>

<div id="editor-container">
  <div id="rendered" tabindex="0"></div>
  <textarea id="source" spellcheck="true"></textarea>
</div>

<div id="mode-indicator">Preview</div>

<script>
(function() {
  const vscode = acquireVsCodeApi();
  const rendered = document.getElementById('rendered');
  const source = document.getElementById('source');
  const toolbar = document.getElementById('toolbar');
  const modeIndicator = document.getElementById('mode-indicator');
  const toggleBtn = document.getElementById('toggleBtn');

  let currentContent = ${JSON.stringify(escapedContent)}
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");

  let isSourceMode = false;
  let debounceTimer = null;

  // Simple markdown to HTML renderer
  function renderMarkdown(md) {
    let html = md;

    // Fenced code blocks
    html = html.replace(/\`\`\`(\\w*)?\\n([\\s\\S]*?)\`\`\`/g, function(_, lang, code) {
      return '<pre><code class="language-' + (lang || '') + '">' + escapeHtml(code) + '</code></pre>';
    });

    // Tables
    html = html.replace(/^(\\|.+\\|)\\n(\\|[-: |]+\\|)\\n((?:\\|.+\\|\\n?)*)/gm, function(_, header, sep, body) {
      const headers = header.split('|').filter(c => c.trim());
      const rows = body.trim().split('\\n').filter(r => r.trim());
      let table = '<table><thead><tr>';
      headers.forEach(h => { table += '<th>' + renderInline(h.trim()) + '</th>'; });
      table += '</tr></thead><tbody>';
      rows.forEach(row => {
        const cells = row.split('|').filter(c => c.trim());
        table += '<tr>';
        cells.forEach(c => { table += '<td>' + renderInline(c.trim()) + '</td>'; });
        table += '</tr>';
      });
      table += '</tbody></table>';
      return table;
    });

    // Process line by line for block elements
    const lines = html.split('\\n');
    const result = [];
    let inList = false;
    let listType = '';
    let inBlockquote = false;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Skip if already processed (code blocks, tables)
      if (line.startsWith('<pre>') || line.startsWith('<table>')) {
        if (inList) { result.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
        if (inBlockquote) { result.push('</blockquote>'); inBlockquote = false; }
        result.push(line);
        continue;
      }

      // Horizontal rule
      if (/^(-{3,}|\\*{3,}|_{3,})$/.test(line.trim())) {
        if (inList) { result.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
        if (inBlockquote) { result.push('</blockquote>'); inBlockquote = false; }
        result.push('<hr>');
        continue;
      }

      // Headers
      const headerMatch = line.match(/^(#{1,6})\\s+(.+)$/);
      if (headerMatch) {
        if (inList) { result.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
        if (inBlockquote) { result.push('</blockquote>'); inBlockquote = false; }
        const level = headerMatch[1].length;
        result.push('<h' + level + '>' + renderInline(headerMatch[2]) + '</h' + level + '>');
        continue;
      }

      // Blockquote
      if (line.startsWith('> ')) {
        if (inList) { result.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
        if (!inBlockquote) { result.push('<blockquote>'); inBlockquote = true; }
        result.push('<p>' + renderInline(line.slice(2)) + '</p>');
        continue;
      } else if (inBlockquote) {
        result.push('</blockquote>');
        inBlockquote = false;
      }

      // Unordered list
      const ulMatch = line.match(/^(\\s*)[-*+]\\s+(.+)$/);
      if (ulMatch) {
        if (!inList || listType !== 'ul') {
          if (inList) result.push(listType === 'ul' ? '</ul>' : '</ol>');
          result.push('<ul>');
          inList = true;
          listType = 'ul';
        }
        // Checkbox
        const cbMatch = ulMatch[2].match(/^\\[([ xX])\\]\\s*(.*)$/);
        if (cbMatch) {
          const checked = cbMatch[1] !== ' ' ? ' checked' : '';
          result.push('<li><input type="checkbox"' + checked + ' disabled> ' + renderInline(cbMatch[2]) + '</li>');
        } else {
          result.push('<li>' + renderInline(ulMatch[2]) + '</li>');
        }
        continue;
      }

      // Ordered list
      const olMatch = line.match(/^(\\s*)\\d+\\.\\s+(.+)$/);
      if (olMatch) {
        if (!inList || listType !== 'ol') {
          if (inList) result.push(listType === 'ul' ? '</ul>' : '</ol>');
          result.push('<ol>');
          inList = true;
          listType = 'ol';
        }
        result.push('<li>' + renderInline(olMatch[2]) + '</li>');
        continue;
      }

      // Close list if non-list line
      if (inList && line.trim() === '') {
        result.push(listType === 'ul' ? '</ul>' : '</ol>');
        inList = false;
      }

      // Empty line
      if (line.trim() === '') {
        result.push('');
        continue;
      }

      // Paragraph
      result.push('<p>' + renderInline(line) + '</p>');
    }

    if (inList) result.push(listType === 'ul' ? '</ul>' : '</ol>');
    if (inBlockquote) result.push('</blockquote>');

    return result.join('\\n');
  }

  function renderInline(text) {
    // Inline code
    text = text.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
    // Images
    text = text.replace(/!\\[([^\\]]*)\\]\\(([^)]+)\\)/g, '<img src="$2" alt="$1">');
    // Links
    text = text.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2" onclick="event.preventDefault(); linkClick(\\'$2\\')">$1</a>');
    // Bold
    text = text.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>');
    text = text.replace(/__(.+?)__/g, '<strong>$1</strong>');
    // Italic
    text = text.replace(/\\*(.+?)\\*/g, '<em>$1</em>');
    text = text.replace(/_(.+?)_/g, '<em>$1</em>');
    // Strikethrough
    text = text.replace(/~~(.+?)~~/g, '<del>$1</del>');
    return text;
  }

  function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Render content
  function render() {
    rendered.innerHTML = renderMarkdown(currentContent);
  }

  // Toggle between rendered and source mode
  function toggleSource() {
    isSourceMode = !isSourceMode;
    if (isSourceMode) {
      source.value = currentContent;
      rendered.style.display = 'none';
      source.style.display = 'block';
      source.focus();
      modeIndicator.textContent = 'Source';
      toggleBtn.textContent = '👁 Preview';
    } else {
      currentContent = source.value;
      rendered.style.display = 'block';
      source.style.display = 'none';
      render();
      modeIndicator.textContent = 'Preview';
      toggleBtn.textContent = '📝 Source';
    }
  }
  window.toggleSource = toggleSource;

  // Source editing
  source.addEventListener('input', function() {
    currentContent = source.value;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      vscode.postMessage({ type: 'contentChanged', content: currentContent });
    }, 300);
  });

  // Click on rendered to switch to source at that line
  rendered.addEventListener('dblclick', function(e) {
    isSourceMode = true;
    source.value = currentContent;
    rendered.style.display = 'none';
    source.style.display = 'block';
    source.focus();
    modeIndicator.textContent = 'Source';
    toggleBtn.textContent = '👁 Preview';
  });

  // Link clicks
  window.linkClick = function(url) {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      vscode.postMessage({ type: 'openLink', url });
    }
  };

  // Toolbar insert helpers
  window.insertSyntax = function(before, after) {
    if (!isSourceMode) toggleSource();
    const start = source.selectionStart;
    const end = source.selectionEnd;
    const selected = source.value.substring(start, end) || 'text';
    source.value = source.value.substring(0, start) + before + selected + after + source.value.substring(end);
    source.selectionStart = start + before.length;
    source.selectionEnd = start + before.length + selected.length;
    source.focus();
    currentContent = source.value;
    vscode.postMessage({ type: 'contentChanged', content: currentContent });
  };

  window.insertLine = function(prefix) {
    if (!isSourceMode) toggleSource();
    const start = source.selectionStart;
    const lineStart = source.value.lastIndexOf('\\n', start - 1) + 1;
    source.value = source.value.substring(0, lineStart) + prefix + source.value.substring(lineStart);
    source.selectionStart = source.selectionEnd = lineStart + prefix.length;
    source.focus();
    currentContent = source.value;
    vscode.postMessage({ type: 'contentChanged', content: currentContent });
  };

  // Keyboard shortcuts
  document.addEventListener('keydown', function(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
      e.preventDefault();
      insertSyntax('**', '**');
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
      e.preventDefault();
      insertSyntax('*', '*');
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
      e.preventDefault();
      toggleSource();
    } else if (e.key === 'Escape' && isSourceMode) {
      isSourceMode = false;
      currentContent = source.value;
      rendered.style.display = 'block';
      source.style.display = 'none';
      render();
      modeIndicator.textContent = 'Preview';
      toggleBtn.textContent = '📝 Source';
    }
  });

  // Show toolbar always
  toolbar.classList.add('visible');

  // Listen for document changes from VS Code
  window.addEventListener('message', function(e) {
    const msg = e.data;
    if (msg.type === 'documentChanged') {
      currentContent = msg.content;
      if (isSourceMode) {
        const pos = source.selectionStart;
        source.value = currentContent;
        source.selectionStart = source.selectionEnd = pos;
      } else {
        render();
      }
    }
  });

  // Initial render
  render();
})();
</script>
</body>
</html>`;
  }
}
