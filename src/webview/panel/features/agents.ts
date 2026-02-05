// @ts-nocheck

export function createAgentsPanelHandlers(deps) {
  const {
    vscode,
    escapeHtml,
  } = deps;

  let editor = null;
  let currentWorkflowId = null;
  let selectedNodeId = null;
  let workflows = [];
  let canvasNodes = [];
  let nodeIdCounter = 1;

  function ensureInitialized() {
    if (!editor) {
      initDrawflow();
      editor = { initialized: true };
    }
  }

  function requestWorkflows() {
    vscode.postMessage({ type: 'getWorkflows' });
  }

  function setWorkflows(next) {
    workflows = next || [];
    updateWorkflowList();
  }

  function handleWorkflowEvent(event) {
    const outputEl = document.getElementById('workflowOutputContent');
    if (!outputEl) return;

    switch (event.type) {
      case 'nodeStart':
        outputEl.innerHTML += '<p style="color: var(--text-secondary);">▶ Running node: ' + event.nodeId + '</p>';
        // Highlight the running node
        const runningNode = document.getElementById(event.nodeId);
        if (runningNode) {
          runningNode.style.boxShadow = '0 0 0 3px #10b981';
        }
        break;
      case 'nodeComplete':
        outputEl.innerHTML += '<p style="color: #10b981;">✓ Node complete: ' + event.nodeId + '</p>';
        // Remove highlight
        const completedNode = document.getElementById(event.nodeId);
        if (completedNode) {
          completedNode.style.boxShadow = 'none';
        }
        break;
      case 'nodeError':
        outputEl.innerHTML += '<p style="color: var(--error-text);">✗ Node error: ' + event.error + '</p>';
        break;
      case 'workflowComplete':
        outputEl.innerHTML += '<hr style="border-color: var(--border-color); margin: 12px 0;"><h4>Result:</h4><pre style="white-space: pre-wrap;">' + escapeHtml(event.result || '') + '</pre>';
        break;
      case 'workflowError':
        outputEl.innerHTML += '<p style="color: var(--error-text);">Workflow error: ' + event.error + '</p>';
        break;
    }
  }

  function initDrawflow() {
    const container = document.getElementById('drawflowCanvas');
    if (!container) return;

    container.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; height: 100%; flex-direction: column; color: var(--text-secondary);">
        <div style="font-size: 48px; margin-bottom: 16px;">🔧</div>
        <p>Drag nodes from the left panel to create your workflow</p>
        <p style="font-size: 12px; margin-top: 8px;">Connect nodes by dragging from outputs to inputs</p>
      </div>
    `;

    setupNodePalette();
  }

  function setupNodePalette() {
    const paletteNodes = document.querySelectorAll('.palette-node');
    const canvas = document.getElementById('drawflowCanvas');

    paletteNodes.forEach(node => {
      node.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('nodeType', node.dataset.node);
      });
    });

    canvas.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    canvas.addEventListener('drop', (e) => {
      e.preventDefault();
      const nodeType = e.dataTransfer.getData('nodeType');
      if (nodeType) {
        addNodeToCanvas(nodeType, e.offsetX, e.offsetY);
      }
    });
  }

  function addNodeToCanvas(type, x, y) {
    const canvas = document.getElementById('drawflowCanvas');

    if (canvasNodes.length === 0) {
      canvas.innerHTML = '';
      canvas.style.position = 'relative';
    }

    const nodeId = 'node-' + nodeIdCounter++;
    const colors = {
      input: '#10b981',
      agent: '#8b5cf6',
      output: '#f59e0b'
    };
    const icons = {
      input: '📥',
      agent: '🤖',
      output: '📤'
    };
    const labels = {
      input: 'Input',
      agent: 'Agent',
      output: 'Output'
    };

    const nodeEl = document.createElement('div');
    nodeEl.id = nodeId;
    nodeEl.className = 'canvas-node ' + type + '-node';
    nodeEl.style.cssText = `
      position: absolute;
      left: ${x - 80}px;
      top: ${y - 30}px;
      min-width: 160px;
      background: var(--bg-secondary);
      border: 2px solid ${colors[type]};
      border-radius: 8px;
      cursor: move;
      user-select: none;
    `;
    nodeEl.innerHTML = `
      <div style="padding: 12px 16px; display: flex; align-items: center; gap: 8px;">
        <span>${icons[type]}</span>
        <span>${labels[type]}</span>
      </div>
      ${type !== 'input' ? '<div class="node-input" style="position: absolute; left: -8px; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; background: var(--accent-color); border-radius: 50%; cursor: crosshair;"></div>' : ''}
      ${type !== 'output' ? '<div class="node-output" style="position: absolute; right: -8px; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; background: var(--accent-color); border-radius: 50%; cursor: crosshair;"></div>' : ''}
    `;

    makeNodeDraggable(nodeEl);

    nodeEl.addEventListener('click', (e) => {
      e.stopPropagation();
      selectNode(nodeId, type);
    });

    canvas.appendChild(nodeEl);

    const nodeData = {
      id: nodeId,
      type: type,
      x: x - 80,
      y: y - 30,
      config: type === 'agent' ? { provider: 'claude', systemPrompt: 'You are a helpful assistant.' } : { label: labels[type] }
    };
    canvasNodes.push(nodeData);

    selectNode(nodeId, type);
  }

  function makeNodeDraggable(nodeEl) {
    let isDragging = false;
    let startX, startY, startLeft, startTop;

    nodeEl.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('node-input') || e.target.classList.contains('node-output')) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = parseInt(nodeEl.style.left) || 0;
      startTop = parseInt(nodeEl.style.top) || 0;
      nodeEl.style.zIndex = 100;
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      nodeEl.style.left = (startLeft + dx) + 'px';
      nodeEl.style.top = (startTop + dy) + 'px';

      const nodeData = canvasNodes.find(n => n.id === nodeEl.id);
      if (nodeData) {
        nodeData.x = startLeft + dx;
        nodeData.y = startTop + dy;
      }
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
      nodeEl.style.zIndex = 1;
    });
  }

  function selectNode(nodeId, type) {
    document.querySelectorAll('.canvas-node').forEach(n => n.style.boxShadow = 'none');

    const nodeEl = document.getElementById(nodeId);
    if (nodeEl) {
      nodeEl.style.boxShadow = '0 0 0 2px var(--accent-color)';
    }

    selectedNodeId = nodeId;
    showNodeConfig(nodeId, type);
  }

  function showNodeConfig(nodeId, type) {
    const nodeData = canvasNodes.find(n => n.id === nodeId);
    if (!nodeData) return;

    document.querySelector('.config-empty').style.display = 'none';
    const configPanel = document.getElementById('nodeConfigPanel');
    configPanel.style.display = 'block';
    document.getElementById('configNodeType').textContent = type.charAt(0).toUpperCase() + type.slice(1) + ' Node';

    let configHtml = '';
    if (type === 'agent') {
      const config = nodeData.config || {};
      configHtml = `
        <div class="config-field">
          <label>Provider</label>
          <select id="nodeProvider" onchange="updateNodeConfig()">
            <option value="claude" ${config.provider === 'claude' ? 'selected' : ''}>Claude</option>
            <option value="gpt" ${config.provider === 'gpt' ? 'selected' : ''}>GPT</option>
          </select>
        </div>
        <div class="config-field">
          <label>System Prompt</label>
          <textarea id="nodeSystemPrompt" onchange="updateNodeConfig()" placeholder="Enter system prompt...">${config.systemPrompt || ''}</textarea>
        </div>
      `;
    } else {
      const config = nodeData.config || {};
      configHtml = `
        <div class="config-field">
          <label>Label</label>
          <input type="text" id="nodeLabel" value="${config.label || ''}" onchange="updateNodeConfig()">
        </div>
      `;
    }

    configHtml += `
      <div style="margin-top: 20px;">
        <button class="btn-secondary" onclick="deleteSelectedNode()" style="width: 100%; color: var(--error-text);">Delete Node</button>
      </div>
    `;

    document.getElementById('configContent').innerHTML = configHtml;
  }

  function updateNodeConfig() {
    if (!selectedNodeId) return;
    const nodeData = canvasNodes.find(n => n.id === selectedNodeId);
    if (!nodeData) return;

    if (nodeData.type === 'agent') {
      nodeData.config = {
        provider: document.getElementById('nodeProvider')?.value || 'claude',
        systemPrompt: document.getElementById('nodeSystemPrompt')?.value || ''
      };
    } else {
      nodeData.config = {
        label: document.getElementById('nodeLabel')?.value || ''
      };
    }
  }

  function deleteSelectedNode() {
    if (!selectedNodeId) return;
    const nodeEl = document.getElementById(selectedNodeId);
    if (nodeEl) {
      nodeEl.remove();
    }
    canvasNodes = canvasNodes.filter(n => n.id !== selectedNodeId);
    selectedNodeId = null;
    document.querySelector('.config-empty').style.display = 'block';
    document.getElementById('nodeConfigPanel').style.display = 'none';
  }

  function newWorkflow() {
    currentWorkflowId = 'workflow-' + Date.now();
    document.getElementById('workflowName').value = 'New Workflow';
    clearCanvas();
  }

  function clearCanvas() {
    const canvas = document.getElementById('drawflowCanvas');
    canvas.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; height: 100%; flex-direction: column; color: var(--text-secondary);">
        <div style="font-size: 48px; margin-bottom: 16px;">🔧</div>
        <p>Drag nodes from the left panel to create your workflow</p>
        <p style="font-size: 12px; margin-top: 8px;">Connect nodes by dragging from outputs to inputs</p>
      </div>
    `;
    canvasNodes = [];
    nodeIdCounter = 1;
    selectedNodeId = null;
    document.querySelector('.config-empty').style.display = 'block';
    document.getElementById('nodeConfigPanel').style.display = 'none';
  }

  function saveCurrentWorkflow() {
    const name = document.getElementById('workflowName').value || 'Untitled Workflow';
    if (!currentWorkflowId) {
      currentWorkflowId = 'workflow-' + Date.now();
    }

    const workflowData = {
      id: currentWorkflowId,
      name: name,
      nodes: canvasNodes,
      connections: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    vscode.postMessage({
      type: 'saveWorkflow',
      workflow: workflowData
    });
  }

  function loadWorkflow(workflowId) {
    const workflow = workflows.find(w => w.id === workflowId);
    if (!workflow) return;

    currentWorkflowId = workflow.id;
    document.getElementById('workflowName').value = workflow.name;

    const canvas = document.getElementById('drawflowCanvas');
    canvas.innerHTML = '';
    canvas.style.position = 'relative';
    canvasNodes = [];
    nodeIdCounter = 1;

    if (workflow.nodes) {
      workflow.nodes.forEach(node => {
        const colors = { input: '#10b981', agent: '#8b5cf6', output: '#f59e0b' };
        const icons = { input: '📥', agent: '🤖', output: '📤' };
        const labels = { input: 'Input', agent: 'Agent', output: 'Output' };

        const nodeEl = document.createElement('div');
        nodeEl.id = node.id;
        nodeEl.className = 'canvas-node ' + node.type + '-node';
        nodeEl.style.cssText = `
          position: absolute;
          left: ${node.x || node.posX || 100}px;
          top: ${node.y || node.posY || 100}px;
          min-width: 160px;
          background: var(--bg-secondary);
          border: 2px solid ${colors[node.type]};
          border-radius: 8px;
          cursor: move;
          user-select: none;
        `;
        nodeEl.innerHTML = `
          <div style="padding: 12px 16px; display: flex; align-items: center; gap: 8px;">
            <span>${icons[node.type]}</span>
            <span>${labels[node.type]}</span>
          </div>
          ${node.type !== 'input' ? '<div class="node-input" style="position: absolute; left: -8px; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; background: var(--accent-color); border-radius: 50%;"></div>' : ''}
          ${node.type !== 'output' ? '<div class="node-output" style="position: absolute; right: -8px; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; background: var(--accent-color); border-radius: 50%;"></div>' : ''}
        `;

        makeNodeDraggable(nodeEl);
        nodeEl.addEventListener('click', (e) => {
          e.stopPropagation();
          selectNode(node.id, node.type);
        });

        canvas.appendChild(nodeEl);
        canvasNodes.push({
          id: node.id,
          type: node.type,
          x: node.x || node.posX || 100,
          y: node.y || node.posY || 100,
          config: node.config || {}
        });
      });

      const maxId = Math.max(...canvasNodes.map(n => parseInt(n.id.replace('node-', '')) || 0));
      nodeIdCounter = maxId + 1;
    }

    document.querySelectorAll('.workflow-item').forEach(item => {
      item.classList.toggle('active', item.dataset.id === workflowId);
    });
  }

  function deleteWorkflow(workflowId) {
    if (confirm('Delete this workflow?')) {
      vscode.postMessage({ type: 'deleteWorkflow', workflowId });
    }
  }

  function importWorkflow() {
    vscode.postMessage({ type: 'importWorkflow' });
  }

  function exportCurrentWorkflow() {
    if (currentWorkflowId) {
      vscode.postMessage({ type: 'exportWorkflow', workflowId: currentWorkflowId });
    } else {
      alert('Please save the workflow first');
    }
  }

  function runWorkflow() {
    const input = document.getElementById('workflowInput').value.trim();
    if (!input) {
      alert('Please enter a message to run through the workflow');
      return;
    }

    if (canvasNodes.length === 0) {
      alert('Please create a workflow first');
      return;
    }

    const workflowData = {
      id: currentWorkflowId || 'temp-' + Date.now(),
      name: document.getElementById('workflowName').value || 'Temp Workflow',
      nodes: canvasNodes.map(n => ({
        id: n.id,
        type: n.type,
        name: n.type,
        posX: n.x,
        posY: n.y,
        config: n.config
      })),
      connections: buildConnections(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    vscode.postMessage({
      type: 'executeWorkflow',
      workflowId: currentWorkflowId,
      input: input,
      drawflowData: {
        drawflow: {
          Home: {
            data: canvasNodes.reduce((acc, node) => {
              acc[node.id] = {
                id: parseInt(node.id.replace('node-', '')) || 1,
                name: node.type,
                data: node.config,
                class: node.type + '-node',
                html: '',
                typenode: false,
                inputs: node.type !== 'input' ? { input_1: { connections: [] } } : {},
                outputs: node.type !== 'output' ? { output_1: { connections: [] } } : {},
                pos_x: node.x,
                pos_y: node.y
              };
              return acc;
            }, {})
          }
        }
      }
    });

    document.getElementById('workflowOutput').style.display = 'flex';
    document.getElementById('workflowOutputContent').innerHTML = '<p style="color: var(--text-secondary);">Running workflow...</p>';
  }

  function buildConnections() {
    const sorted = [...canvasNodes].sort((a, b) => a.x - b.x);
    const connections = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      connections.push({
        id: `conn-${i}`,
        fromNodeId: sorted[i].id,
        fromOutput: 'output_1',
        toNodeId: sorted[i + 1].id,
        toInput: 'input_1'
      });
    }
    return connections;
  }

  function closeWorkflowOutput() {
    document.getElementById('workflowOutput').style.display = 'none';
  }

  function updateWorkflowList() {
    const listEl = document.getElementById('workflowList');
    if (workflows.length === 0) {
      listEl.innerHTML = '<p class="empty-text">No workflows yet</p>';
      return;
    }

    listEl.innerHTML = workflows.map(w => `
      <div class="workflow-item ${w.id === currentWorkflowId ? 'active' : ''}" data-id="${w.id}" onclick="loadWorkflow('${w.id}')">
        <span class="workflow-item-name">${escapeHtml(w.name)}</span>
        <span class="workflow-item-delete" onclick="event.stopPropagation(); deleteWorkflow('${w.id}')">🗑️</span>
      </div>
    `).join('');
  }

  return {
    ensureInitialized,
    requestWorkflows,
    setWorkflows,
    updateWorkflowList,
    newWorkflow,
    clearCanvas,
    saveCurrentWorkflow,
    loadWorkflow,
    deleteWorkflow,
    importWorkflow,
    exportCurrentWorkflow,
    runWorkflow,
    closeWorkflowOutput,
    updateNodeConfig,
    deleteSelectedNode,
    handleWorkflowEvent,
  };
}
