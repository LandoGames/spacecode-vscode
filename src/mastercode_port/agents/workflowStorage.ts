/**
 * Workflow Storage Service
 *
 * Handles saving, loading, importing, and exporting agent workflows.
 */

import * as vscode from 'vscode';
import { AgentWorkflow, DrawflowExport } from './types';
import { logger } from '../services/logService';

const WORKFLOWS_KEY = 'spacecode.agentWorkflows';

export class WorkflowStorage {
  private context: vscode.ExtensionContext | null = null;

  /**
   * Initialize the storage service with extension context
   */
  initialize(context: vscode.ExtensionContext): void {
    this.context = context;
    logger.info('general', 'WorkflowStorage initialized');
  }

  /**
   * Get all saved workflows
   */
  getWorkflows(): AgentWorkflow[] {
    if (!this.context) {
      logger.warn('tools', 'WorkflowStorage not initialized');
      return [];
    }
    return this.context.workspaceState.get<AgentWorkflow[]>(WORKFLOWS_KEY, []);
  }

  /**
   * Get a specific workflow by ID
   */
  getWorkflow(id: string): AgentWorkflow | undefined {
    const workflows = this.getWorkflows();
    return workflows.find(w => w.id === id);
  }

  /**
   * Save a workflow (create or update)
   */
  async saveWorkflow(workflow: AgentWorkflow): Promise<void> {
    if (!this.context) {
      throw new Error('WorkflowStorage not initialized');
    }

    const workflows = this.getWorkflows();
    const existingIndex = workflows.findIndex(w => w.id === workflow.id);

    workflow.updatedAt = Date.now();

    if (existingIndex >= 0) {
      workflows[existingIndex] = workflow;
      logger.info('tools', `Updated workflow: ${workflow.name}`);
    } else {
      workflow.createdAt = Date.now();
      workflows.push(workflow);
      logger.info('tools', `Created workflow: ${workflow.name}`);
    }

    await this.context.workspaceState.update(WORKFLOWS_KEY, workflows);
  }

  /**
   * Delete a workflow by ID
   */
  async deleteWorkflow(id: string): Promise<void> {
    if (!this.context) {
      throw new Error('WorkflowStorage not initialized');
    }

    const workflows = this.getWorkflows();
    const filteredWorkflows = workflows.filter(w => w.id !== id);

    if (filteredWorkflows.length < workflows.length) {
      await this.context.workspaceState.update(WORKFLOWS_KEY, filteredWorkflows);
      logger.info('tools', `Deleted workflow: ${id}`);
    }
  }

  /**
   * Export a workflow to JSON string
   */
  exportWorkflow(workflow: AgentWorkflow): string {
    return JSON.stringify(workflow, null, 2);
  }

  /**
   * Export a workflow to a file
   */
  async exportWorkflowToFile(workflow: AgentWorkflow): Promise<void> {
    const json = this.exportWorkflow(workflow);
    const defaultUri = vscode.Uri.file(`${workflow.name.replace(/\s+/g, '_')}.json`);

    const uri = await vscode.window.showSaveDialog({
      defaultUri,
      filters: {
        'JSON Files': ['json'],
        'All Files': ['*']
      },
      title: 'Export Workflow'
    });

    if (uri) {
      const encoder = new TextEncoder();
      await vscode.workspace.fs.writeFile(uri, encoder.encode(json));
      vscode.window.showInformationMessage(`Workflow exported to ${uri.fsPath}`);
      logger.info('tools', `Exported workflow to: ${uri.fsPath}`);
    }
  }

  /**
   * Import a workflow from JSON string
   */
  importWorkflow(json: string): AgentWorkflow {
    const workflow = JSON.parse(json) as AgentWorkflow;

    // Validate required fields
    if (!workflow.id || !workflow.name || !workflow.nodes) {
      throw new Error('Invalid workflow format: missing required fields');
    }

    // Generate new ID to avoid conflicts
    workflow.id = this.generateId();
    workflow.createdAt = Date.now();
    workflow.updatedAt = Date.now();

    return workflow;
  }

  /**
   * Import a workflow from a file
   */
  async importWorkflowFromFile(): Promise<AgentWorkflow | null> {
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: {
        'JSON Files': ['json'],
        'All Files': ['*']
      },
      title: 'Import Workflow'
    });

    if (uris && uris.length > 0) {
      const content = await vscode.workspace.fs.readFile(uris[0]);
      const decoder = new TextDecoder();
      const json = decoder.decode(content);

      const workflow = this.importWorkflow(json);
      await this.saveWorkflow(workflow);

      vscode.window.showInformationMessage(`Workflow "${workflow.name}" imported successfully`);
      logger.info('tools', `Imported workflow: ${workflow.name}`);

      return workflow;
    }

    return null;
  }

  /**
   * Create a new empty workflow
   */
  createNewWorkflow(name: string): AgentWorkflow {
    return {
      id: this.generateId(),
      name,
      nodes: [],
      connections: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  /**
   * Generate a unique ID
   */
  private generateId(): string {
    return `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Convert Drawflow data to workflow format and save
   */
  async saveFromDrawflow(
    drawflowData: DrawflowExport,
    workflowId: string,
    name: string
  ): Promise<AgentWorkflow> {
    const workflow = this.drawflowToWorkflow(drawflowData, workflowId, name);
    await this.saveWorkflow(workflow);
    return workflow;
  }

  /**
   * Convert Drawflow export format to AgentWorkflow
   */
  private drawflowToWorkflow(
    drawflowData: DrawflowExport,
    workflowId: string,
    name: string
  ): AgentWorkflow {
    const nodes: AgentWorkflow['nodes'] = [];
    const connections: AgentWorkflow['connections'] = [];
    const data = drawflowData.drawflow?.Home?.data || {};

    for (const [nodeId, nodeData] of Object.entries(data)) {
      nodes.push({
        id: nodeId,
        type: nodeData.name as 'input' | 'agent' | 'output',
        name: nodeData.class || nodeData.name,
        posX: nodeData.pos_x,
        posY: nodeData.pos_y,
        config: nodeData.data || {}
      });

      // Extract connections
      for (const [outputName, output] of Object.entries(nodeData.outputs || {})) {
        for (const conn of output.connections) {
          connections.push({
            id: `${nodeId}-${conn.node}`,
            fromNodeId: nodeId,
            fromOutput: outputName,
            toNodeId: conn.node,
            toInput: conn.input
          });
        }
      }
    }

    return {
      id: workflowId,
      name,
      nodes,
      connections,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }
}

// Singleton instance
export const workflowStorage = new WorkflowStorage();
