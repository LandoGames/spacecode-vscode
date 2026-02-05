// @ts-nocheck

export function createKbPanelHandlers(deps) {
  const { vscode } = deps;

  let currentEmbedderStatus = null;

  function renderKbEntries(entries) {
    const container = document.getElementById('kbList');
    if (!container) {
      return;
    }
    if (entries.length === 0) {
      container.innerHTML = '<p style="color: var(--text-secondary)">No entries in knowledge base</p>';
      return;
    }

    container.innerHTML = entries.slice(0, 30).map(e => {
      const typeIcon = e.type === 'pdf' ? '📄' : (e.type === 'url' ? '🔗' : '📝');
      const embeddedBadge = e.embedded
        ? `<span class="embedding-badge embedded">✓ ${e.chunkCount || 0}</span>`
        : `<span class="embedding-badge not-embedded">−</span>`;
      const tagsDisplay = e.tags.length > 0
        ? `<span style="color: var(--text-secondary); font-size: 11px; margin-left: 8px;">${e.tags.join(', ')}</span>`
        : '';

      return `
          <div class="list-item" id="kb-entry-${e.id}" style="padding: 8px 12px;">
            <div class="list-item-info" style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;">
              ${embeddedBadge}
              <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"><strong>${typeIcon} ${e.title}</strong>${tagsDisplay}</span>
            </div>
            <div class="list-item-actions" style="flex-direction: row; gap: 6px; flex-shrink: 0;">
              ${!e.embedded ? `<button class="btn-connect" onclick="embedEntry('${e.id}')" id="embed-btn-${e.id}">Embed</button>` : ''}
              <button class="btn-remove" onclick="vscode.postMessage({type:'kbRemove',id:'${e.id}'})">Remove</button>
            </div>
          </div>
        `;
    }).join('');
  }

  function renderEmbedderStatus(status, stats) {
    currentEmbedderStatus = status;
    const container = document.getElementById('embedderStatus');
    if (!container) {
      return;
    }
    const modelSelect = document.getElementById('modelSelect');
    const modelInfo = document.getElementById('modelInfo');

    // Populate model selector
    if (modelSelect && status.availableModels) {
      modelSelect.innerHTML = status.availableModels.map(m => `
          <option value="${m.id}" ${m.id === status.modelId ? 'selected' : ''}>
            ${m.name} (${m.size})
          </option>
        `).join('');
    }

    // Show selected model info
    if (modelInfo && status.availableModels) {
      const selectedModel = status.availableModels.find(m => m.id === status.modelId);
      if (selectedModel) {
        modelInfo.innerHTML = `
            <p>${selectedModel.description}</p>
            <p style="margin-top: 4px;">
              <a href="${selectedModel.url}" style="color: var(--accent-mastermind);" onclick="event.preventDefault(); vscode.postMessage({type:'openExternal', url:'${selectedModel.url}'});">
                View on HuggingFace
              </a>
            </p>
          `;
      }
    }

    if (status.isLoading) {
      container.innerHTML = `
          <div style="display: flex; align-items: center; gap: 8px;">
            <div class="status-dot thinking"></div>
            <span>${status.downloadProgress?.message || 'Loading model...'}</span>
          </div>
        `;
      // Show progress container
      const progressContainer = document.getElementById('downloadProgressContainer');
      if (progressContainer) {
        progressContainer.style.display = 'block';
      }
      return;
    }

    // Hide progress container when not loading
    const progressContainer = document.getElementById('downloadProgressContainer');
    if (progressContainer) {
      progressContainer.style.display = 'none';
    }

    if (status.modelDownloaded) {
      container.innerHTML = `
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <div style="width: 10px; height: 10px; background: #22c55e; border-radius: 50%;"></div>
            <span style="color: #22c55e; font-weight: 500;">Model Ready</span>
          </div>
          <p style="font-size: 12px; color: var(--text-secondary);">
            Embedded: ${stats.embeddedEntries}/${stats.totalEntries} entries (${stats.totalChunks} chunks)
          </p>
        `;
    } else {
      const selectedModel = status.availableModels?.find(m => m.id === status.modelId);
      const modelSize = selectedModel?.size || '~30MB';
      container.innerHTML = `
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <div style="width: 10px; height: 10px; background: #eab308; border-radius: 50%;"></div>
            <span style="color: #eab308;">Model Not Downloaded</span>
          </div>
          <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 12px;">
            Download the embedding model to enable semantic search and chunking.
          </p>
          <button class="btn-primary" onclick="downloadModel()" id="downloadModelBtn">
            Download Model (${modelSize})
          </button>
        `;
    }

    // Update stats
    const statsContainer = document.getElementById('kbStats');
    if (statsContainer) {
      statsContainer.innerHTML = `
          <p style="color: var(--text-secondary); font-size: 12px;">
            <strong>${stats.totalEntries}</strong> entries |
            <strong>${stats.embeddedEntries}</strong> embedded |
            <strong>${stats.totalChunks}</strong> total chunks
          </p>
        `;
    }
  }

  function onModelSelect() {
    const modelSelect = document.getElementById('modelSelect');
    if (modelSelect && modelSelect.value) {
      vscode.postMessage({ type: 'kbSetModel', modelId: modelSelect.value });
    }
  }

  function downloadModel() {
    const btn = document.getElementById('downloadModelBtn');
    const modelSelect = document.getElementById('modelSelect');
    if (btn) btn.disabled = true;

    const modelId = modelSelect?.value || null;
    vscode.postMessage({ type: 'kbDownloadModel', modelId });

    // Show progress container
    const progressContainer = document.getElementById('downloadProgressContainer');
    if (progressContainer) {
      progressContainer.style.display = 'block';
    }
  }

  function setModelDownloading(isDownloading) {
    const btn = document.getElementById('downloadModelBtn');
    const progressContainer = document.getElementById('downloadProgressContainer');

    if (btn) {
      btn.disabled = isDownloading;
      if (!isDownloading) {
        const selectedModel = currentEmbedderStatus?.availableModels?.find(m => m.id === currentEmbedderStatus?.modelId);
        btn.textContent = `Download Model (${selectedModel?.size || '~30MB'})`;
      }
    }

    if (progressContainer) {
      progressContainer.style.display = isDownloading ? 'block' : 'none';
    }
  }

  function updateModelDownloadProgress(progress) {
    const fill = document.getElementById('downloadProgressFill');
    const text = document.getElementById('downloadProgressText');
    const bytes = document.getElementById('downloadProgressBytes');

    if (fill) fill.style.width = progress.progress + '%';
    if (text) text.textContent = progress.message;

    if (bytes && progress.bytesLoaded && progress.bytesTotal) {
      const loaded = (progress.bytesLoaded / 1024 / 1024).toFixed(1);
      const total = (progress.bytesTotal / 1024 / 1024).toFixed(1);
      bytes.textContent = `${loaded} MB / ${total} MB${progress.currentFile ? ' - ' + progress.currentFile : ''}`;
    } else if (bytes) {
      bytes.textContent = progress.currentFile || '';
    }
  }

  function embedEntry(id) {
    const btn = document.getElementById('embed-btn-' + id);
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Embedding...';
    }
    vscode.postMessage({ type: 'kbEmbedEntry', id });
  }

  function embedAllEntries() {
    const btn = document.getElementById('embedAllBtn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Embedding...';
    }
    vscode.postMessage({ type: 'kbEmbedAll' });
  }

  function setEmbeddingAll(isEmbedding) {
    const btn = document.getElementById('embedAllBtn');
    if (btn) {
      btn.disabled = isEmbedding;
      btn.textContent = isEmbedding ? 'Embedding...' : 'Embed All Entries';
    }
  }

  function updateEmbeddingProgress(id, current, total) {
    const btn = document.getElementById('embed-btn-' + id);
    if (btn) {
      btn.textContent = `${current}/${total}`;
    }
  }

  function updateEmbedAllProgress(entryIndex, totalEntries, chunkIndex, totalChunks) {
    const btn = document.getElementById('embedAllBtn');
    if (btn) {
      btn.textContent = `Entry ${entryIndex}/${totalEntries} (chunk ${chunkIndex}/${totalChunks})`;
    }
  }

  // PDF Drop Zone handlers
  function handlePdfDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.add('drag-over');
  }

  function handlePdfDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.remove('drag-over');
  }

  function handlePdfDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.remove('drag-over');

    const files = event.dataTransfer.files;
    processPdfFiles(files);
  }

  function handlePdfSelect(event) {
    const files = event.target.files;
    processPdfFiles(files);
    event.target.value = ''; // Reset input
  }

  function processPdfFiles(files) {
    for (const file of files) {
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const reader = new FileReader();
        reader.onload = function(e) {
          // Convert ArrayBuffer to base64
          const base64 = btoa(
            new Uint8Array(e.target.result)
              .reduce((data, byte) => data + String.fromCharCode(byte), '')
          );
          vscode.postMessage({
            type: 'kbAddPdf',
            data: base64,
            fileName: file.name,
            tags: []
          });
        };
        reader.readAsArrayBuffer(file);
      } else {
        alert('Please select PDF files only');
      }
    }
  }

  function initKbDropZone() {
    const dropZone = document.getElementById('pdfDropZone');
    const fileInput = document.getElementById('pdfFileInput');
    if (dropZone && fileInput) {
      dropZone.addEventListener('click', () => fileInput.click());
    }
  }

  function toggleCrawlOptions() {
    const crawlCheckbox = document.getElementById('kbCrawlWebsite');
    const crawlOptions = document.getElementById('crawlOptions');
    const addBtn = document.getElementById('addUrlBtn');

    if (crawlCheckbox.checked) {
      crawlOptions.style.display = 'block';
      addBtn.textContent = 'Crawl Website';
    } else {
      crawlOptions.style.display = 'none';
      addBtn.textContent = 'Add URL';
    }
  }

  function addKbUrl() {
    const url = document.getElementById('kbUrlInput').value.trim();
    if (!url) return;

    const crawlWebsite = document.getElementById('kbCrawlWebsite').checked;

    if (crawlWebsite) {
      const maxPages = parseInt(document.getElementById('kbMaxPages').value) || 10000;
      const maxDepth = parseInt(document.getElementById('kbMaxDepth').value) || 10;

      // Show progress UI
      document.getElementById('crawlProgress').style.display = 'block';
      document.getElementById('addUrlBtn').disabled = true;
      document.getElementById('kbUrlInput').disabled = true;
      document.getElementById('crawlStatus').textContent = 'Starting crawl...';
      document.getElementById('crawlCount').textContent = '0/0 pages';
      document.getElementById('crawlProgressBar').style.width = '0%';

      vscode.postMessage({
        type: 'kbCrawlWebsite',
        url,
        tags: [],
        options: { maxPages, maxDepth }
      });
    } else {
      vscode.postMessage({ type: 'kbAddUrl', url, tags: [] });
      document.getElementById('kbUrlInput').value = '';
    }
  }

  function handleCrawlProgress(progress) {
    const progressBar = document.getElementById('crawlProgressBar');
    const statusEl = document.getElementById('crawlStatus');
    const countEl = document.getElementById('crawlCount');
    const urlEl = document.getElementById('crawlCurrentUrl');

    if (progress.status === 'crawling') {
      const percent = progress.total > 0 ? (progress.crawled / progress.total * 100) : 0;
      progressBar.style.width = percent + '%';
      statusEl.textContent = 'Crawling...';
      countEl.textContent = progress.crawled + '/' + progress.total + ' pages';
      urlEl.textContent = progress.currentUrl;
    } else if (progress.status === 'done') {
      progressBar.style.width = '100%';
      statusEl.textContent = 'Done!';
      countEl.textContent = progress.crawled + ' pages crawled';
      urlEl.textContent = '';

      // Reset UI after delay
      setTimeout(() => {
        document.getElementById('crawlProgress').style.display = 'none';
        document.getElementById('addUrlBtn').disabled = false;
        document.getElementById('kbUrlInput').disabled = false;
        document.getElementById('kbUrlInput').value = '';
        document.getElementById('kbCrawlWebsite').checked = false;
        toggleCrawlOptions();
      }, 2000);
    } else if (progress.status === 'error') {
      statusEl.textContent = 'Error: ' + (progress.error || 'Unknown');
      setTimeout(() => {
        document.getElementById('crawlProgress').style.display = 'none';
        document.getElementById('addUrlBtn').disabled = false;
        document.getElementById('kbUrlInput').disabled = false;
      }, 3000);
    }
  }

  return {
    renderKbEntries,
    renderEmbedderStatus,
    onModelSelect,
    downloadModel,
    setModelDownloading,
    updateModelDownloadProgress,
    embedEntry,
    embedAllEntries,
    setEmbeddingAll,
    updateEmbeddingProgress,
    updateEmbedAllProgress,
    handlePdfDragOver,
    handlePdfDragLeave,
    handlePdfDrop,
    handlePdfSelect,
    initKbDropZone,
    toggleCrawlOptions,
    addKbUrl,
    handleCrawlProgress,
  };
}
