/**
 * Agents Module Types
 *
 * Defines agent personas and skills for the SpaceCode system.
 */

/**
 * Agent ID type
 */
export type AgentId = 'nova' | 'gears' | 'index' | 'triage' | 'vault' | 'palette';

/**
 * Agent status
 */
export type AgentStatus = 'available' | 'busy' | 'offline';

/**
 * Skill category
 */
export type SkillCategory =
  | 'code'
  | 'analysis'
  | 'documentation'
  | 'testing'
  | 'security'
  | 'database'
  | 'design'
  | 'utility';

/**
 * Agent definition
 */
export interface AgentDefinition {
  id: AgentId;
  name: string;
  title: string;
  icon: string;
  color: string;
  description: string;
  specialties: string[];
  skills: string[];
  inputs: AgentInput[];
  outputs: AgentOutput[];
}

/**
 * Agent input specification
 */
export interface AgentInput {
  name: string;
  type: 'text' | 'file' | 'selection' | 'context' | 'ticket';
  required: boolean;
  description: string;
}

/**
 * Agent output specification
 */
export interface AgentOutput {
  name: string;
  type: 'code' | 'text' | 'file' | 'plan' | 'report' | 'ticket';
  description: string;
}

/**
 * Skill definition
 */
export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  icon: string;
  agents: AgentId[];  // Which agents can use this skill
  command?: string;    // Slash command trigger
  inputs: SkillInput[];
  outputs: SkillOutput[];
}

/**
 * Skill input
 */
export interface SkillInput {
  name: string;
  type: 'text' | 'file' | 'selection' | 'options';
  required: boolean;
  description: string;
  options?: string[];
}

/**
 * Skill output
 */
export interface SkillOutput {
  name: string;
  type: 'code' | 'text' | 'file' | 'action';
  description: string;
}

/**
 * Agent runtime state
 */
export interface AgentState {
  id: AgentId;
  status: AgentStatus;
  currentTask?: string;
  lastActiveAt?: number;
  taskCount: number;
}

/**
 * Active skill execution
 */
export interface SkillExecution {
  skillId: string;
  agentId: AgentId;
  startedAt: number;
  inputs: Record<string, any>;
  status: 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
}
