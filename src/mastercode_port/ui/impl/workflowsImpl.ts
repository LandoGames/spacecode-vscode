// @ts-nocheck

import * as vscode from 'vscode';
import { workflowStorage } from '../../agents/workflowStorage';
import { AgentWorkflow, DrawflowExport, AgentNodeConfig, WorkflowEvent } from '../../agents/types';

export function createWorkflowsImpl(panel: any) {
  function initializeStorage(context: vscode.ExtensionContext): void {
    workflowStorage.initialize(context);
  }

  function sendWorkflows(): void {
    const workflows = workflowStorage.getWorkflows();
    panel._postMessage({ type: 'workflows', workflows });
  }

  async function saveWorkflow(workflowData: Partial<AgentWorkflow>, drawflowData?: DrawflowExport): Promise<void> {
    try {
      let workflow: AgentWorkflow;

      if (drawflowData && workflowData.id && workflowData.name) {
        workflow = await workflowStorage.saveFromDrawflow(drawflowData, workflowData.id, workflowData.name);
      } else if (workflowData.id) {
        const existing = workflowStorage.getWorkflow(workflowData.id);
        if (existing) {
          workflow = { ...existing, ...workflowData, updatedAt: Date.now() } as AgentWorkflow;
          await workflowStorage.saveWorkflow(workflow);
        } else {
          throw new Error('Workflow not found');
        }
      } else {
        throw new Error('Invalid workflow data');
      }

      sendWorkflows();
      vscode.window.showInformationMessage(`Workflow "${workflow.name}" saved`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Failed to save workflow: ${msg}`);
    }
  }

  async function deleteWorkflow(workflowId: string): Promise<void> {
    try {
      await workflowStorage.deleteWorkflow(workflowId);
      sendWorkflows();
      vscode.window.showInformationMessage('Workflow deleted');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Failed to delete workflow: ${msg}`);
    }
  }

  async function executeWorkflow(workflowId: string, input: string, drawflowData?: DrawflowExport): Promise<void> {
    try {
      let workflow: AgentWorkflow | undefined;

      if (drawflowData) {
        workflow = panel.workflowEngine.parseDrawflowExport(drawflowData, workflowId || 'temp', 'Temporary Workflow');
      } else {
        workflow = workflowStorage.getWorkflow(workflowId);
      }

      if (!workflow) {
        throw new Error('Workflow not found');
      }

      panel._currentWorkflow = workflow;

      panel._postMessage({ type: 'aiFlowStart' });
      panel._postMessage({
        type: 'aiFlowChunk',
        chunk: {
          id: 'workflow-start',
          source: 'agent',
          label: `🔄 ${workflow.name}`,
          tokens: 0,
          similarity: 1.0,
          content: `Starting workflow: ${workflow.name}`
        }
      });

      const claudeProvider = panel.orchestrator.getClaudeProvider();
      const gptProvider = panel.orchestrator.getGptProvider();
      panel.workflowEngine.setProviders(claudeProvider, gptProvider);

      const result = await panel.workflowEngine.execute(workflow, input);

      panel._postMessage({
        type: 'workflowResult',
        workflowId,
        result
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      panel._postMessage({
        type: 'workflowError',
        workflowId,
        error: msg
      });
      vscode.window.showErrorMessage(`Workflow execution failed: ${msg}`);
    } finally {
      panel._currentWorkflow = null;
    }
  }

  function handleWorkflowFlowVisualization(event: WorkflowEvent): void {
    if (!panel._currentWorkflow) return;

    const workflow = panel._currentWorkflow;

    switch (event.type) {
      case 'nodeStart': {
        if (!event.nodeId) break;
        const node = workflow.nodes.find(n => n.id === event.nodeId);
        if (!node || node.type === 'input') break;

        if (node.type === 'agent') {
          const config = node.config as AgentNodeConfig;
          const provider = config.provider || 'claude';
          const providerLabel = provider === 'claude' ? 'Claude' : 'GPT';

          panel._postMessage({
            type: 'aiFlowChunk',
            chunk: {
              id: `agent-${event.nodeId}`,
              source: 'agent',
              label: `🤖 ${node.name || providerLabel}`,
              tokens: 0,
              similarity: 0.9,
              content: `Processing with ${providerLabel}...`
            }
          });

          panel._postMessage({
            type: 'aiFlowThinking',
            stage: `${node.name || providerLabel} processing...`,
            provider: provider
          });
        }
        break;
      }

      case 'nodeComplete': {
        if (!event.nodeId) break;
        const node = workflow.nodes.find(n => n.id === event.nodeId);
        if (!node || node.type === 'input') break;

        if (node.type === 'agent' && event.result) {
          panel._postMessage({
            type: 'aiFlowChunk',
            chunk: {
              id: `agent-${event.nodeId}-result`,
              source: 'response',
              label: `✓ ${node.name || 'Agent'}`,
              tokens: Math.ceil((event.result?.length || 0) / 4),
              similarity: 1.0,
              content: event.result.substring(0, 200) + (event.result.length > 200 ? '...' : '')
            }
          });
        }
        break;
      }

      case 'workflowComplete': {
        panel._postMessage({
          type: 'aiFlowComplete',
          tokens: { input: 0, output: Math.ceil((event.result?.length || 0) / 4) }
        });
        break;
      }

      case 'workflowError': {
        panel._postMessage({
          type: 'aiFlowComplete',
          error: true
        });
        break;
      }
    }
  }

  async function importWorkflow(): Promise<void> {
    const workflow = await workflowStorage.importWorkflowFromFile();
    if (workflow) {
      sendWorkflows();
    }
  }

  async function exportWorkflow(workflowId: string): Promise<void> {
    const workflow = workflowStorage.getWorkflow(workflowId);
    if (workflow) {
      await workflowStorage.exportWorkflowToFile(workflow);
    } else {
      vscode.window.showErrorMessage('Workflow not found');
    }
  }

  return {
    initializeStorage,
    sendWorkflows,
    saveWorkflow,
    deleteWorkflow,
    executeWorkflow,
    handleWorkflowFlowVisualization,
    importWorkflow,
    exportWorkflow,
  };
}
