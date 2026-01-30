/**
 * Agent Workflow Types
 *
 * Defines the data structures for the visual node-based agent workflow editor.
 */

export type NodeType = 'input' | 'agent' | 'output';
export type AgentProvider = 'claude' | 'gpt';

/**
 * Configuration for an Agent node
 */
export interface AgentNodeConfig {
  provider: AgentProvider;
  systemPrompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Configuration for an Input node
 */
export interface InputNodeConfig {
  label: string;
}

/**
 * Configuration for an Output node
 */
export interface OutputNodeConfig {
  label: string;
}

/**
 * Union type for all node configurations
 */
export type NodeConfig = AgentNodeConfig | InputNodeConfig | OutputNodeConfig;

/**
 * A node in the workflow
 */
export interface WorkflowNode {
  id: string;
  type: NodeType;
  name: string;
  posX: number;
  posY: number;
  config: NodeConfig;
}

/**
 * A connection between two nodes
 */
export interface NodeConnection {
  id: string;
  fromNodeId: string;
  fromOutput: string;
  toNodeId: string;
  toInput: string;
}

/**
 * A complete workflow definition
 */
export interface AgentWorkflow {
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  connections: NodeConnection[];
  createdAt: number;
  updatedAt: number;
}

/**
 * Drawflow export format (for serialization)
 */
export interface DrawflowExport {
  drawflow: {
    Home: {
      data: Record<string, DrawflowNodeData>;
    };
  };
}

/**
 * Drawflow node data structure
 */
export interface DrawflowNodeData {
  id: number;
  name: string;
  data: NodeConfig;
  class: string;
  html: string;
  typenode: boolean;
  inputs: Record<string, { connections: Array<{ node: string; input: string }> }>;
  outputs: Record<string, { connections: Array<{ node: string; input: string }> }>;
  pos_x: number;
  pos_y: number;
}

/**
 * Workflow execution state
 */
export interface WorkflowExecutionState {
  workflowId: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  currentNodeId?: string;
  nodeResults: Map<string, string>;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

/**
 * Event emitted during workflow execution
 */
export interface WorkflowEvent {
  type: 'nodeStart' | 'nodeComplete' | 'nodeError' | 'workflowComplete' | 'workflowError';
  workflowId: string;
  nodeId?: string;
  result?: string;
  error?: string;
}

/**
 * Default configurations for new nodes
 */
export const DEFAULT_NODE_CONFIGS: Record<NodeType, NodeConfig> = {
  input: {
    label: 'User Input'
  } as InputNodeConfig,
  agent: {
    provider: 'claude',
    systemPrompt: 'You are a helpful assistant.',
    temperature: 0.7
  } as AgentNodeConfig,
  output: {
    label: 'Response'
  } as OutputNodeConfig
};
