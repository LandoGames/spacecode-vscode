/**
 * Agent and Skill Definitions
 *
 * Defines all agents and their capabilities.
 */

import { AgentDefinition, SkillDefinition } from './types';

/**
 * Claude - The Creator / Lead Engineer
 */
export const NOVA: AgentDefinition = {
  id: 'nova',
  name: 'Claude',
  title: 'Lead Engineer',
  icon: 'fa-rocket',
  color: '#a855f7',
  description: 'The primary coding agent. Plans features, writes code, and coordinates complex implementations.',
  specialties: [
    'Feature development',
    'Code architecture',
    'Complex problem solving',
    'Multi-file changes',
    'Refactoring'
  ],
  skills: ['code-generation', 'planning', 'refactoring', 'code-review', 'mastermind'],
  inputs: [
    { name: 'prompt', type: 'text', required: true, description: 'User request or feature description' },
    { name: 'context', type: 'context', required: false, description: 'Related files and code' },
    { name: 'selection', type: 'selection', required: false, description: 'Selected code in editor' }
  ],
  outputs: [
    { name: 'code', type: 'code', description: 'Generated or modified code' },
    { name: 'plan', type: 'plan', description: 'Implementation plan with phases' },
    { name: 'explanation', type: 'text', description: 'Technical explanation' }
  ]
};

/**
 * Gears - The Station Engineer
 */
export const GEARS: AgentDefinition = {
  id: 'gears',
  name: 'Gears',
  title: 'Station Engineer',
  icon: 'fa-gear',
  color: '#f59e0b',
  description: 'Maintenance and debugging specialist. Handles code quality, testing, and fixes.',
  specialties: [
    'Bug fixing',
    'Code maintenance',
    'Test writing',
    'Performance optimization',
    'Code cleanup'
  ],
  skills: ['debugging', 'testing', 'maintenance-scan', 'security-audit', 'quality-check'],
  inputs: [
    { name: 'issue', type: 'text', required: true, description: 'Bug report or maintenance task' },
    { name: 'file', type: 'file', required: false, description: 'File with the issue' },
    { name: 'ticket', type: 'ticket', required: false, description: 'Related ticket' }
  ],
  outputs: [
    { name: 'fix', type: 'code', description: 'Bug fix or improvement' },
    { name: 'tests', type: 'code', description: 'Test cases' },
    { name: 'report', type: 'report', description: 'Analysis report' }
  ]
};

/**
 * Index - The Librarian
 */
export const INDEX: AgentDefinition = {
  id: 'index',
  name: 'Index',
  title: 'Librarian',
  icon: 'fa-book',
  color: '#3b82f6',
  description: 'Documentation specialist. Manages project docs, generates documentation, and maintains knowledge.',
  specialties: [
    'Documentation writing',
    'README generation',
    'API documentation',
    'Knowledge management',
    'Doc templates'
  ],
  skills: ['doc-generation', 'doc-sync', 'api-docs', 'readme-update', 'template-fill'],
  inputs: [
    { name: 'topic', type: 'text', required: true, description: 'Documentation topic or request' },
    { name: 'source', type: 'file', required: false, description: 'Source code to document' },
    { name: 'template', type: 'selection', required: false, description: 'Documentation template' }
  ],
  outputs: [
    { name: 'documentation', type: 'file', description: 'Generated documentation' },
    { name: 'summary', type: 'text', description: 'Documentation summary' }
  ]
};

/**
 * Triage - The Ticket Bot
 */
export const TRIAGE: AgentDefinition = {
  id: 'triage',
  name: 'Triage',
  title: 'Ticket Bot',
  icon: 'fa-ticket',
  color: '#10b981',
  description: 'Ticket management and routing. Analyzes issues, creates tickets, and routes to appropriate agents.',
  specialties: [
    'Issue analysis',
    'Ticket creation',
    'Priority assessment',
    'Agent routing',
    'Status tracking'
  ],
  skills: ['ticket-create', 'ticket-route', 'issue-analyze', 'status-update'],
  inputs: [
    { name: 'issue', type: 'text', required: true, description: 'Issue description' },
    { name: 'context', type: 'context', required: false, description: 'Related context' }
  ],
  outputs: [
    { name: 'ticket', type: 'ticket', description: 'Created or updated ticket' },
    { name: 'routing', type: 'text', description: 'Recommended agent routing' }
  ]
};

/**
 * Vault - Database Engineer
 */
export const VAULT: AgentDefinition = {
  id: 'vault',
  name: 'Vault',
  title: 'Database Engineer',
  icon: 'fa-database',
  color: '#22c55e',
  description: 'Database and backend specialist. Manages schemas, queries, and data operations.',
  specialties: [
    'Database design',
    'Query optimization',
    'Schema migrations',
    'Data modeling',
    'Backend APIs'
  ],
  skills: ['schema-design', 'query-builder', 'migration-gen', 'api-design'],
  inputs: [
    { name: 'requirement', type: 'text', required: true, description: 'Database requirement' },
    { name: 'schema', type: 'file', required: false, description: 'Existing schema' }
  ],
  outputs: [
    { name: 'schema', type: 'code', description: 'Database schema' },
    { name: 'migration', type: 'file', description: 'Migration script' },
    { name: 'query', type: 'code', description: 'Database query' }
  ]
};

/**
 * Palette - Art Director
 */
export const PALETTE: AgentDefinition = {
  id: 'palette',
  name: 'Palette',
  title: 'Art Director',
  icon: 'fa-palette',
  color: '#ec4899',
  description: 'Visual design and asset management. Handles UI/UX, art direction, and visual assets.',
  specialties: [
    'UI/UX design',
    'Asset organization',
    'Style guidelines',
    'Visual consistency',
    'Art direction'
  ],
  skills: ['ui-design', 'asset-organize', 'style-guide', 'color-palette'],
  inputs: [
    { name: 'design', type: 'text', required: true, description: 'Design request' },
    { name: 'reference', type: 'file', required: false, description: 'Reference image or style' }
  ],
  outputs: [
    { name: 'design', type: 'file', description: 'Design output' },
    { name: 'guidelines', type: 'text', description: 'Style guidelines' }
  ]
};

/**
 * All agent definitions
 */
export const AGENTS: Record<string, AgentDefinition> = {
  nova: NOVA,
  gears: GEARS,
  index: INDEX,
  triage: TRIAGE,
  vault: VAULT,
  palette: PALETTE
};

/**
 * Skill definitions
 */
export const SKILLS: SkillDefinition[] = [
  // Code skills
  {
    id: 'code-generation',
    name: 'Code Generation',
    description: 'Generate code from natural language descriptions',
    category: 'code',
    icon: 'fa-code',
    agents: ['nova'],
    command: '/generate',
    inputs: [
      { name: 'description', type: 'text', required: true, description: 'What to generate' }
    ],
    outputs: [
      { name: 'code', type: 'code', description: 'Generated code' }
    ]
  },
  {
    id: 'refactoring',
    name: 'Refactoring',
    description: 'Refactor code for better quality and maintainability',
    category: 'code',
    icon: 'fa-recycle',
    agents: ['nova', 'gears'],
    command: '/refactor',
    inputs: [
      { name: 'code', type: 'selection', required: true, description: 'Code to refactor' },
      { name: 'goal', type: 'text', required: false, description: 'Refactoring goal' }
    ],
    outputs: [
      { name: 'refactored', type: 'code', description: 'Refactored code' }
    ]
  },
  {
    id: 'code-review',
    name: 'Code Review',
    description: 'Review code for issues and improvements',
    category: 'analysis',
    icon: 'fa-search',
    agents: ['nova', 'gears'],
    command: '/review',
    inputs: [
      { name: 'code', type: 'selection', required: true, description: 'Code to review' }
    ],
    outputs: [
      { name: 'feedback', type: 'text', description: 'Review feedback' }
    ]
  },
  {
    id: 'planning',
    name: 'Planning Mode',
    description: 'Create structured implementation plans',
    category: 'code',
    icon: 'fa-lightbulb-o',
    agents: ['nova'],
    command: '/plan',
    inputs: [
      { name: 'feature', type: 'text', required: true, description: 'Feature to plan' }
    ],
    outputs: [
      { name: 'plan', type: 'plan', description: 'Implementation plan' }
    ]
  },
  {
    id: 'mastermind',
    name: 'Mastermind Mode',
    description: 'Autonomous execution with tool use',
    category: 'code',
    icon: 'fa-bolt',
    agents: ['nova'],
    inputs: [
      { name: 'task', type: 'text', required: true, description: 'Task to execute' }
    ],
    outputs: [
      { name: 'result', type: 'code', description: 'Execution result' }
    ]
  },
  // Testing skills
  {
    id: 'testing',
    name: 'Test Generation',
    description: 'Generate unit and integration tests',
    category: 'testing',
    icon: 'fa-flask',
    agents: ['gears'],
    command: '/test',
    inputs: [
      { name: 'code', type: 'selection', required: true, description: 'Code to test' },
      { name: 'framework', type: 'options', required: false, description: 'Test framework', options: ['jest', 'vitest', 'mocha'] }
    ],
    outputs: [
      { name: 'tests', type: 'code', description: 'Generated tests' }
    ]
  },
  {
    id: 'debugging',
    name: 'Debug Assistant',
    description: 'Help identify and fix bugs',
    category: 'analysis',
    icon: 'fa-bug',
    agents: ['gears'],
    command: '/debug',
    inputs: [
      { name: 'issue', type: 'text', required: true, description: 'Bug description' },
      { name: 'code', type: 'selection', required: false, description: 'Relevant code' }
    ],
    outputs: [
      { name: 'analysis', type: 'text', description: 'Bug analysis' },
      { name: 'fix', type: 'code', description: 'Suggested fix' }
    ]
  },
  // Security skills
  {
    id: 'security-audit',
    name: 'Security Audit',
    description: 'Scan code for security vulnerabilities',
    category: 'security',
    icon: 'fa-shield',
    agents: ['gears'],
    command: '/security',
    inputs: [
      { name: 'scope', type: 'options', required: false, description: 'Scan scope', options: ['file', 'folder', 'project'] }
    ],
    outputs: [
      { name: 'report', type: 'report', description: 'Security report' }
    ]
  },
  {
    id: 'quality-check',
    name: 'Quality Check',
    description: 'Analyze code quality and maintainability',
    category: 'analysis',
    icon: 'fa-star',
    agents: ['gears'],
    command: '/quality',
    inputs: [],
    outputs: [
      { name: 'report', type: 'report', description: 'Quality report' }
    ]
  },
  {
    id: 'maintenance-scan',
    name: 'Maintenance Scan',
    description: 'Find maintenance opportunities',
    category: 'analysis',
    icon: 'fa-wrench',
    agents: ['gears'],
    command: '/maintenance',
    inputs: [],
    outputs: [
      { name: 'suggestions', type: 'report', description: 'Maintenance suggestions' }
    ]
  },
  // Documentation skills
  {
    id: 'doc-generation',
    name: 'Doc Generation',
    description: 'Generate documentation from code',
    category: 'documentation',
    icon: 'fa-file-text',
    agents: ['index'],
    command: '/doc',
    inputs: [
      { name: 'code', type: 'selection', required: true, description: 'Code to document' },
      { name: 'style', type: 'options', required: false, description: 'Doc style', options: ['jsdoc', 'markdown', 'readme'] }
    ],
    outputs: [
      { name: 'documentation', type: 'text', description: 'Generated documentation' }
    ]
  },
  {
    id: 'readme-update',
    name: 'README Update',
    description: 'Update project README',
    category: 'documentation',
    icon: 'fa-book',
    agents: ['index'],
    command: '/readme',
    inputs: [
      { name: 'changes', type: 'text', required: false, description: 'Recent changes to include' }
    ],
    outputs: [
      { name: 'readme', type: 'file', description: 'Updated README' }
    ]
  },
  // Database skills
  {
    id: 'schema-design',
    name: 'Schema Design',
    description: 'Design database schemas',
    category: 'database',
    icon: 'fa-table',
    agents: ['vault'],
    command: '/schema',
    inputs: [
      { name: 'requirements', type: 'text', required: true, description: 'Data requirements' }
    ],
    outputs: [
      { name: 'schema', type: 'code', description: 'Schema definition' }
    ]
  },
  {
    id: 'query-builder',
    name: 'Query Builder',
    description: 'Build database queries',
    category: 'database',
    icon: 'fa-search-plus',
    agents: ['vault'],
    command: '/query',
    inputs: [
      { name: 'description', type: 'text', required: true, description: 'Query description' }
    ],
    outputs: [
      { name: 'query', type: 'code', description: 'SQL query' }
    ]
  },
  // Design skills
  {
    id: 'ui-design',
    name: 'UI Design',
    description: 'Design user interfaces',
    category: 'design',
    icon: 'fa-paint-brush',
    agents: ['palette'],
    command: '/ui',
    inputs: [
      { name: 'description', type: 'text', required: true, description: 'UI requirements' }
    ],
    outputs: [
      { name: 'design', type: 'text', description: 'UI design suggestions' }
    ]
  },
  {
    id: 'color-palette',
    name: 'Color Palette',
    description: 'Generate color palettes',
    category: 'design',
    icon: 'fa-tint',
    agents: ['palette'],
    command: '/colors',
    inputs: [
      { name: 'mood', type: 'text', required: true, description: 'Desired mood/theme' }
    ],
    outputs: [
      { name: 'palette', type: 'text', description: 'Color palette' }
    ]
  },
  // Ticket skills
  {
    id: 'ticket-create',
    name: 'Create Ticket',
    description: 'Create a new ticket/issue',
    category: 'utility',
    icon: 'fa-plus-circle',
    agents: ['triage'],
    command: '/ticket',
    inputs: [
      { name: 'title', type: 'text', required: true, description: 'Ticket title' },
      { name: 'description', type: 'text', required: true, description: 'Ticket description' }
    ],
    outputs: [
      { name: 'ticket', type: 'ticket', description: 'Created ticket' }
    ]
  },
  {
    id: 'ticket-route',
    name: 'Route Ticket',
    description: 'Route ticket to appropriate agent',
    category: 'utility',
    icon: 'fa-share',
    agents: ['triage'],
    inputs: [
      { name: 'ticket', type: 'ticket', required: true, description: 'Ticket to route' }
    ],
    outputs: [
      { name: 'assignment', type: 'text', description: 'Agent assignment' }
    ]
  }
];

/**
 * Get agent by ID
 */
export function getAgent(id: string): AgentDefinition | undefined {
  return AGENTS[id];
}

/**
 * Get skill by ID
 */
export function getSkill(id: string): SkillDefinition | undefined {
  return SKILLS.find(s => s.id === id);
}

/**
 * Get skills for an agent
 */
export function getAgentSkills(agentId: string): SkillDefinition[] {
  return SKILLS.filter(s => s.agents.includes(agentId as any));
}

/**
 * Get skill by command
 */
export function getSkillByCommand(command: string): SkillDefinition | undefined {
  const cmd = command.startsWith('/') ? command : `/${command}`;
  return SKILLS.find(s => s.command === cmd);
}
