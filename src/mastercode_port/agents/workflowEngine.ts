/**
 * Workflow Engine
 *
 * Executes agent workflows by traversing nodes from Input to Output.
 * Uses the existing AIProvider interface for agent node execution.
 */

import { EventEmitter } from 'events';
import {
  AgentWorkflow,
  WorkflowNode,
  NodeConnection,
  AgentNodeConfig,
  WorkflowExecutionState,
  WorkflowEvent,
  DrawflowExport
} from './types';
import { AIProvider, AIMessage } from '../providers/base';
import { logger } from '../services/logService';

export class WorkflowEngine extends EventEmitter {
  private claudeProvider: AIProvider | null = null;
  private gptProvider: AIProvider | null = null;
  private executionState: WorkflowExecutionState | null = null;

  constructor() {
    super();
  }

  /**
   * Set the AI providers for workflow execution
   */
  setProviders(claude: AIProvider | null, gpt: AIProvider | null): void {
    this.claudeProvider = claude;
    this.gptProvider = gpt;
  }

  /**
   * Convert Drawflow export to AgentWorkflow format
   */
  parseDrawflowExport(drawflowData: DrawflowExport, workflowId: string, name: string): AgentWorkflow {
    const nodes: WorkflowNode[] = [];
    const connections: NodeConnection[] = [];
    const data = drawflowData.drawflow.Home.data;

    // Parse nodes
    for (const [nodeId, nodeData] of Object.entries(data)) {
      const node: WorkflowNode = {
        id: nodeId,
        type: nodeData.name as 'input' | 'agent' | 'output',
        name: nodeData.class || nodeData.name,
        posX: nodeData.pos_x,
        posY: nodeData.pos_y,
        config: nodeData.data || {}
      };
      nodes.push(node);

      // Parse connections from outputs
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

  /**
   * Execute a workflow with the given input message
   */
  async execute(workflow: AgentWorkflow, inputMessage: string): Promise<string> {
    logger.info('tools', `Starting workflow execution: ${workflow.name}`);

    // Initialize execution state
    this.executionState = {
      workflowId: workflow.id,
      status: 'running',
      nodeResults: new Map(),
      startedAt: Date.now()
    };

    try {
      // Find the input node
      const inputNode = workflow.nodes.find(n => n.type === 'input');
      if (!inputNode) {
        throw new Error('Workflow must have an Input node');
      }

      // Find the output node
      const outputNode = workflow.nodes.find(n => n.type === 'output');
      if (!outputNode) {
        throw new Error('Workflow must have an Output node');
      }

      // Set the input message as the result of the input node
      this.executionState.nodeResults.set(inputNode.id, inputMessage);
      this.emitEvent({
        type: 'nodeComplete',
        workflowId: workflow.id,
        nodeId: inputNode.id,
        result: inputMessage
      });

      // Execute nodes in topological order
      const executionOrder = this.getExecutionOrder(workflow, inputNode.id);

      for (const nodeId of executionOrder) {
        if (nodeId === inputNode.id) continue; // Skip input node, already processed

        const node = workflow.nodes.find(n => n.id === nodeId);
        if (!node) continue;

        this.executionState.currentNodeId = nodeId;
        this.emitEvent({
          type: 'nodeStart',
          workflowId: workflow.id,
          nodeId
        });

        // Get inputs for this node
        const nodeInput = this.getNodeInput(workflow, nodeId);

        // Execute the node
        let result: string;
        if (node.type === 'agent') {
          result = await this.executeAgentNode(node, nodeInput);
        } else if (node.type === 'output') {
          result = nodeInput; // Output node just passes through
        } else {
          result = nodeInput;
        }

        this.executionState.nodeResults.set(nodeId, result);
        this.emitEvent({
          type: 'nodeComplete',
          workflowId: workflow.id,
          nodeId,
          result
        });
      }

      // Get the final output
      const finalResult = this.executionState.nodeResults.get(outputNode.id) || '';

      this.executionState.status = 'completed';
      this.executionState.completedAt = Date.now();
      this.emitEvent({
        type: 'workflowComplete',
        workflowId: workflow.id,
        result: finalResult
      });

      logger.info('tools', `Workflow completed: ${workflow.name}`);
      return finalResult;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.executionState.status = 'error';
      this.executionState.error = errorMessage;
      this.emitEvent({
        type: 'workflowError',
        workflowId: workflow.id,
        error: errorMessage
      });
      logger.error('tools', `Workflow error: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Execute an agent node
   */
  private async executeAgentNode(node: WorkflowNode, input: string): Promise<string> {
    const config = node.config as AgentNodeConfig;
    const provider = config.provider === 'claude' ? this.claudeProvider : this.gptProvider;

    if (!provider) {
      throw new Error(`Provider ${config.provider} is not configured`);
    }

    if (!provider.isConfigured) {
      throw new Error(`Provider ${config.provider} is not properly configured`);
    }

    const messages: AIMessage[] = [
      { role: 'user', content: input }
    ];

    logger.info('api', `Executing agent node: ${node.name} with ${config.provider}`);

    const response = await provider.sendMessage(messages, config.systemPrompt);
    return response.content;
  }

  /**
   * Get the combined input for a node from its connected inputs
   */
  private getNodeInput(workflow: AgentWorkflow, nodeId: string): string {
    const incomingConnections = workflow.connections.filter(c => c.toNodeId === nodeId);

    if (incomingConnections.length === 0) {
      return '';
    }

    // Combine inputs from all connected nodes
    const inputs: string[] = [];
    for (const conn of incomingConnections) {
      const result = this.executionState?.nodeResults.get(conn.fromNodeId);
      if (result) {
        inputs.push(result);
      }
    }

    return inputs.join('\n\n');
  }

  /**
   * Get execution order using topological sort (BFS from input node)
   */
  private getExecutionOrder(workflow: AgentWorkflow, startNodeId: string): string[] {
    const order: string[] = [];
    const visited = new Set<string>();
    const queue: string[] = [startNodeId];

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (visited.has(nodeId)) continue;

      visited.add(nodeId);
      order.push(nodeId);

      // Find nodes connected to this node's outputs
      const outgoingConnections = workflow.connections.filter(c => c.fromNodeId === nodeId);
      for (const conn of outgoingConnections) {
        if (!visited.has(conn.toNodeId)) {
          queue.push(conn.toNodeId);
        }
      }
    }

    return order;
  }

  /**
   * Emit a workflow event
   */
  private emitEvent(event: WorkflowEvent): void {
    this.emit('workflowEvent', event);
  }

  /**
   * Get current execution state
   */
  getExecutionState(): WorkflowExecutionState | null {
    return this.executionState;
  }

  /**
   * Stop the current execution (if running)
   */
  stop(): void {
    if (this.executionState && this.executionState.status === 'running') {
      this.executionState.status = 'error';
      this.executionState.error = 'Execution stopped by user';
      this.emitEvent({
        type: 'workflowError',
        workflowId: this.executionState.workflowId,
        error: 'Execution stopped by user'
      });
    }
  }
}
