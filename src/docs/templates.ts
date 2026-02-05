/**
 * Document Templates
 *
 * Pre-defined templates for common documentation types.
 */

import { DocTemplate, DocType, DocDefinition, DocPriority } from './types';

/**
 * GDD (Game Design Document) Template
 */
export const GDD_TEMPLATE: DocTemplate = {
  id: 'gdd-standard',
  type: 'gdd',
  name: 'Game Design Document',
  description: 'Comprehensive game design specification',
  sections: [
    {
      id: 'overview',
      title: 'Game Overview',
      required: true,
      description: 'High-level game concept and vision',
      subsections: [
        { id: 'concept', title: 'Concept', required: true, description: 'Core game concept' },
        { id: 'genre', title: 'Genre', required: true, description: 'Game genre and influences' },
        { id: 'target-audience', title: 'Target Audience', required: true, description: 'Primary player demographics' },
        { id: 'unique-selling-points', title: 'Unique Selling Points', required: true, description: 'What makes this game special' }
      ]
    },
    {
      id: 'gameplay',
      title: 'Gameplay',
      required: true,
      description: 'Core gameplay mechanics and systems',
      subsections: [
        { id: 'core-loop', title: 'Core Loop', required: true, description: 'Primary gameplay loop' },
        { id: 'mechanics', title: 'Mechanics', required: true, description: 'Game mechanics breakdown' },
        { id: 'controls', title: 'Controls', required: true, description: 'Control scheme' }
      ]
    },
    {
      id: 'story',
      title: 'Story & Setting',
      required: false,
      description: 'Narrative elements and world building'
    },
    {
      id: 'art-style',
      title: 'Art Style',
      required: false,
      description: 'Visual direction and style guide'
    },
    {
      id: 'audio',
      title: 'Audio',
      required: false,
      description: 'Sound design and music direction'
    },
    {
      id: 'technical',
      title: 'Technical Requirements',
      required: false,
      description: 'Platform and technical specifications'
    }
  ],
  variables: [
    { name: 'GAME_NAME', description: 'Name of the game', required: true },
    { name: 'VERSION', description: 'Document version', defaultValue: '1.0', required: false },
    { name: 'AUTHOR', description: 'Document author', required: false }
  ]
};

/**
 * SA (Software Architecture) Template
 */
export const SA_TEMPLATE: DocTemplate = {
  id: 'sa-standard',
  type: 'sa',
  name: 'Software Architecture',
  description: 'Technical architecture and system design',
  sections: [
    {
      id: 'overview',
      title: 'Architecture Overview',
      required: true,
      description: 'High-level system architecture',
      subsections: [
        { id: 'goals', title: 'Architecture Goals', required: true, description: 'What the architecture aims to achieve' },
        { id: 'constraints', title: 'Constraints', required: true, description: 'Technical and business constraints' },
        { id: 'principles', title: 'Design Principles', required: true, description: 'Guiding principles' }
      ]
    },
    {
      id: 'modules',
      title: 'Module Structure',
      required: true,
      description: 'Code organization and modules',
      subsections: [
        { id: 'core', title: 'Core Systems', required: true, description: 'Core module definitions' },
        { id: 'dependencies', title: 'Dependencies', required: true, description: 'Module dependencies' }
      ]
    },
    {
      id: 'patterns',
      title: 'Design Patterns',
      required: false,
      description: 'Patterns and conventions used'
    },
    {
      id: 'data-flow',
      title: 'Data Flow',
      required: false,
      description: 'How data moves through the system'
    },
    {
      id: 'security',
      title: 'Security Considerations',
      required: false,
      description: 'Security architecture'
    }
  ],
  variables: [
    { name: 'PROJECT_NAME', description: 'Name of the project', required: true },
    { name: 'VERSION', description: 'Document version', defaultValue: '1.0', required: false }
  ]
};

/**
 * TDD (Technical Design Document) Template
 */
export const TDD_TEMPLATE: DocTemplate = {
  id: 'tdd-standard',
  type: 'tdd',
  name: 'Technical Design Document',
  description: 'Detailed technical specification for a feature',
  sections: [
    {
      id: 'overview',
      title: 'Feature Overview',
      required: true,
      description: 'What the feature does'
    },
    {
      id: 'requirements',
      title: 'Requirements',
      required: true,
      description: 'Functional and non-functional requirements'
    },
    {
      id: 'design',
      title: 'Technical Design',
      required: true,
      description: 'How the feature will be implemented',
      subsections: [
        { id: 'components', title: 'Components', required: true, description: 'Component breakdown' },
        { id: 'interfaces', title: 'Interfaces', required: true, description: 'API and interface definitions' },
        { id: 'data-model', title: 'Data Model', required: false, description: 'Data structures' }
      ]
    },
    {
      id: 'testing',
      title: 'Testing Strategy',
      required: false,
      description: 'How the feature will be tested'
    },
    {
      id: 'risks',
      title: 'Risks & Mitigations',
      required: false,
      description: 'Technical risks and how to address them'
    }
  ],
  variables: [
    { name: 'FEATURE_NAME', description: 'Name of the feature', required: true },
    { name: 'AUTHOR', description: 'Document author', required: false },
    { name: 'DATE', description: 'Creation date', required: false }
  ]
};

/**
 * README Template
 */
export const README_TEMPLATE: DocTemplate = {
  id: 'readme-standard',
  type: 'readme',
  name: 'README',
  description: 'Project README file',
  sections: [
    { id: 'title', title: 'Project Title', required: true, description: 'Project name and tagline' },
    { id: 'description', title: 'Description', required: true, description: 'What the project does' },
    { id: 'installation', title: 'Installation', required: true, description: 'How to install' },
    { id: 'usage', title: 'Usage', required: true, description: 'How to use' },
    { id: 'contributing', title: 'Contributing', required: false, description: 'How to contribute' },
    { id: 'license', title: 'License', required: false, description: 'License information' }
  ],
  variables: [
    { name: 'PROJECT_NAME', description: 'Name of the project', required: true },
    { name: 'DESCRIPTION', description: 'Short description', required: true }
  ]
};

/**
 * Art Bible Template
 */
export const ART_BIBLE_TEMPLATE: DocTemplate = {
  id: 'art-bible-standard',
  type: 'art_bible',
  name: 'Art Bible',
  description: 'Visual style guide and art direction reference',
  sections: [
    {
      id: 'vision',
      title: 'Art Vision',
      required: true,
      description: 'Overall visual direction and style goals',
      subsections: [
        { id: 'style', title: 'Art Style', required: true, description: 'Core art style (e.g., stylized, realistic, pixel art)' },
        { id: 'mood', title: 'Mood & Atmosphere', required: true, description: 'Emotional tone conveyed through visuals' },
        { id: 'references', title: 'Reference Board', required: false, description: 'Visual references and inspirations' }
      ]
    },
    {
      id: 'characters',
      title: 'Character Art',
      required: false,
      description: 'Character design guidelines and proportions'
    },
    {
      id: 'environments',
      title: 'Environment Art',
      required: false,
      description: 'Level and world art direction'
    },
    {
      id: 'ui-art',
      title: 'UI Art Style',
      required: false,
      description: 'Interface visual language'
    },
    {
      id: 'vfx',
      title: 'VFX & Particles',
      required: false,
      description: 'Visual effects style guide'
    },
    {
      id: 'technical-art',
      title: 'Technical Art Specs',
      required: false,
      description: 'Poly budgets, texture sizes, shader guidelines'
    }
  ],
  variables: [
    { name: 'GAME_NAME', description: 'Name of the game', required: true },
    { name: 'VERSION', description: 'Document version', defaultValue: '1.0', required: false }
  ]
};

/**
 * Narrative Bible Template
 */
export const NARRATIVE_TEMPLATE: DocTemplate = {
  id: 'narrative-standard',
  type: 'narrative',
  name: 'Narrative Bible',
  description: 'Story, characters, and world lore reference',
  sections: [
    {
      id: 'world',
      title: 'World & Setting',
      required: true,
      description: 'World building and setting details',
      subsections: [
        { id: 'history', title: 'World History', required: true, description: 'Timeline and key events' },
        { id: 'geography', title: 'Geography & Locations', required: false, description: 'Key locations and their significance' },
        { id: 'factions', title: 'Factions & Organizations', required: false, description: 'Groups and power structures' }
      ]
    },
    {
      id: 'characters',
      title: 'Characters',
      required: true,
      description: 'Main and supporting character profiles',
      subsections: [
        { id: 'protagonist', title: 'Protagonist', required: true, description: 'Player character details' },
        { id: 'supporting', title: 'Supporting Cast', required: false, description: 'Key NPCs and allies' },
        { id: 'antagonists', title: 'Antagonists', required: false, description: 'Villains and opposing forces' }
      ]
    },
    {
      id: 'story',
      title: 'Story Outline',
      required: true,
      description: 'Main narrative arc and plot beats'
    },
    {
      id: 'dialogue',
      title: 'Dialogue Guidelines',
      required: false,
      description: 'Tone, voice, and dialogue conventions'
    },
    {
      id: 'lore',
      title: 'Lore & Mythology',
      required: false,
      description: 'Background lore and mythos'
    }
  ],
  variables: [
    { name: 'GAME_NAME', description: 'Name of the game', required: true },
    { name: 'VERSION', description: 'Document version', defaultValue: '1.0', required: false }
  ]
};

/**
 * UI/UX Specification Template
 */
export const UIUX_TEMPLATE: DocTemplate = {
  id: 'uiux-standard',
  type: 'uiux',
  name: 'UI/UX Specification',
  description: 'User interface and experience design document',
  sections: [
    {
      id: 'principles',
      title: 'UX Principles',
      required: true,
      description: 'Core UX design principles and goals',
      subsections: [
        { id: 'accessibility', title: 'Accessibility', required: true, description: 'Accessibility requirements and standards' },
        { id: 'platforms', title: 'Platform Guidelines', required: true, description: 'Platform-specific UI conventions' }
      ]
    },
    {
      id: 'flows',
      title: 'User Flows',
      required: true,
      description: 'Key user journeys and screen flows'
    },
    {
      id: 'screens',
      title: 'Screen Inventory',
      required: true,
      description: 'All screens/menus with descriptions',
      subsections: [
        { id: 'main-menu', title: 'Main Menu', required: true, description: 'Main menu layout and navigation' },
        { id: 'hud', title: 'HUD / In-Game UI', required: true, description: 'Heads-up display elements' },
        { id: 'settings', title: 'Settings', required: false, description: 'Options and settings screens' }
      ]
    },
    {
      id: 'components',
      title: 'UI Components',
      required: false,
      description: 'Reusable UI component library'
    },
    {
      id: 'animations',
      title: 'UI Animations',
      required: false,
      description: 'Transition and animation specifications'
    }
  ],
  variables: [
    { name: 'GAME_NAME', description: 'Name of the game', required: true },
    { name: 'VERSION', description: 'Document version', defaultValue: '1.0', required: false }
  ]
};

/**
 * Economy Design Template
 */
export const ECONOMY_TEMPLATE: DocTemplate = {
  id: 'economy-standard',
  type: 'economy',
  name: 'Economy Design',
  description: 'Game economy, currencies, and balance document',
  sections: [
    {
      id: 'overview',
      title: 'Economy Overview',
      required: true,
      description: 'High-level economy goals and philosophy',
      subsections: [
        { id: 'currencies', title: 'Currencies', required: true, description: 'All currency types and their purposes' },
        { id: 'sources-sinks', title: 'Sources & Sinks', required: true, description: 'Where currency enters and exits the economy' }
      ]
    },
    {
      id: 'progression',
      title: 'Progression Economy',
      required: true,
      description: 'XP, leveling, and unlock curves'
    },
    {
      id: 'items',
      title: 'Item Economy',
      required: false,
      description: 'Item rarities, crafting costs, and pricing'
    },
    {
      id: 'monetization',
      title: 'Monetization',
      required: false,
      description: 'IAP pricing, premium currency, and value propositions'
    },
    {
      id: 'balance',
      title: 'Balance Targets',
      required: false,
      description: 'Target session earnings, time-to-unlock, and KPIs'
    }
  ],
  variables: [
    { name: 'GAME_NAME', description: 'Name of the game', required: true },
    { name: 'VERSION', description: 'Document version', defaultValue: '1.0', required: false }
  ]
};

/**
 * Audio Design Template
 */
export const AUDIO_TEMPLATE: DocTemplate = {
  id: 'audio-standard',
  type: 'audio',
  name: 'Audio Design',
  description: 'Sound design and music direction document',
  sections: [
    {
      id: 'vision',
      title: 'Audio Vision',
      required: true,
      description: 'Overall audio direction and sonic identity',
      subsections: [
        { id: 'style', title: 'Music Style', required: true, description: 'Genre, instruments, and mood of the soundtrack' },
        { id: 'sfx-style', title: 'SFX Style', required: true, description: 'Sound effect tone and fidelity targets' }
      ]
    },
    {
      id: 'music',
      title: 'Music Design',
      required: true,
      description: 'Soundtrack structure and adaptive music system',
      subsections: [
        { id: 'tracks', title: 'Track List', required: true, description: 'Required music tracks by context' },
        { id: 'adaptive', title: 'Adaptive System', required: false, description: 'Dynamic music layering and transitions' }
      ]
    },
    {
      id: 'sfx',
      title: 'Sound Effects',
      required: true,
      description: 'SFX categories and required sounds'
    },
    {
      id: 'voice',
      title: 'Voice & Dialogue',
      required: false,
      description: 'Voice acting direction and implementation'
    },
    {
      id: 'technical',
      title: 'Technical Audio',
      required: false,
      description: 'Audio middleware, format specs, and performance budgets'
    }
  ],
  variables: [
    { name: 'GAME_NAME', description: 'Name of the game', required: true },
    { name: 'VERSION', description: 'Document version', defaultValue: '1.0', required: false }
  ]
};

/**
 * Test Plan Template
 */
export const TEST_PLAN_TEMPLATE: DocTemplate = {
  id: 'test-plan-standard',
  type: 'test_plan',
  name: 'Test Plan',
  description: 'Testing strategy, test cases, and quality assurance plan',
  sections: [
    {
      id: 'strategy',
      title: 'Test Strategy',
      required: true,
      description: 'Overall testing approach and goals',
      subsections: [
        { id: 'scope', title: 'Scope', required: true, description: 'What will and will not be tested' },
        { id: 'types', title: 'Test Types', required: true, description: 'Unit, integration, E2E, performance, etc.' },
        { id: 'tools', title: 'Tools & Frameworks', required: true, description: 'Testing tools and infrastructure' }
      ]
    },
    {
      id: 'cases',
      title: 'Test Cases',
      required: true,
      description: 'Critical test scenarios and acceptance criteria',
      subsections: [
        { id: 'gameplay', title: 'Gameplay Tests', required: true, description: 'Core loop and mechanics tests' },
        { id: 'performance', title: 'Performance Tests', required: false, description: 'FPS, memory, load time targets' },
        { id: 'regression', title: 'Regression Suite', required: false, description: 'Automated regression test cases' }
      ]
    },
    {
      id: 'automation',
      title: 'Test Automation',
      required: false,
      description: 'CI/CD integration and automated test pipelines'
    },
    {
      id: 'platforms',
      title: 'Platform Testing',
      required: false,
      description: 'Platform-specific testing requirements'
    },
    {
      id: 'release',
      title: 'Release Criteria',
      required: false,
      description: 'Go/no-go criteria for release'
    }
  ],
  variables: [
    { name: 'PROJECT_NAME', description: 'Name of the project', required: true },
    { name: 'VERSION', description: 'Document version', defaultValue: '1.0', required: false }
  ]
};

/**
 * Level Brief Template
 */
export const LEVEL_BRIEF_TEMPLATE: DocTemplate = {
  id: 'level-brief-standard',
  type: 'level_brief',
  name: 'Level Brief',
  description: 'Level design specification and layout document',
  sections: [
    {
      id: 'overview',
      title: 'Level Overview',
      required: true,
      description: 'Level concept, theme, and narrative context',
      subsections: [
        { id: 'objectives', title: 'Objectives', required: true, description: 'Player goals and win/lose conditions' },
        { id: 'flow', title: 'Level Flow', required: true, description: 'Pacing and progression through the level' }
      ]
    },
    {
      id: 'layout',
      title: 'Layout & Geometry',
      required: true,
      description: 'Map layout, key areas, and spatial design'
    },
    {
      id: 'encounters',
      title: 'Encounters & Gameplay',
      required: false,
      description: 'Enemy placement, puzzles, and interactive elements'
    },
    {
      id: 'art-direction',
      title: 'Art Direction',
      required: false,
      description: 'Visual theme, lighting, and atmosphere for this level'
    },
    {
      id: 'metrics',
      title: 'Design Metrics',
      required: false,
      description: 'Target completion time, difficulty, and replay value'
    }
  ],
  variables: [
    { name: 'LEVEL_NAME', description: 'Name of the level', required: true },
    { name: 'GAME_NAME', description: 'Name of the game', required: false },
    { name: 'VERSION', description: 'Document version', defaultValue: '1.0', required: false }
  ]
};

/**
 * All templates
 */
export const DOC_TEMPLATES: DocTemplate[] = [
  GDD_TEMPLATE,
  SA_TEMPLATE,
  TDD_TEMPLATE,
  README_TEMPLATE,
  ART_BIBLE_TEMPLATE,
  NARRATIVE_TEMPLATE,
  UIUX_TEMPLATE,
  ECONOMY_TEMPLATE,
  AUDIO_TEMPLATE,
  TEST_PLAN_TEMPLATE,
  LEVEL_BRIEF_TEMPLATE
];

/**
 * Default document definitions
 */
export const DEFAULT_DOCS: Omit<DocDefinition, 'id' | 'status'>[] = [
  {
    type: 'gdd',
    name: 'Game Design Document',
    description: 'Core game design specification',
    templateFile: 'GDD_TEMPLATE.md',
    defaultPath: 'docs/GDD.md',
    priority: 'mandatory'
  },
  {
    type: 'sa',
    name: 'Software Architecture',
    description: 'Technical architecture document',
    templateFile: 'SA_TEMPLATE.md',
    defaultPath: 'docs/SA.md',
    priority: 'mandatory'
  },
  {
    type: 'tdd',
    name: 'Technical Design Document',
    description: 'Feature technical specifications',
    templateFile: 'TDD_TEMPLATE.md',
    defaultPath: 'docs/TDD.md',
    priority: 'optional'
  },
  {
    type: 'art_bible',
    name: 'Art Bible',
    description: 'Visual style and art direction',
    templateFile: 'ART_BIBLE_TEMPLATE.md',
    defaultPath: 'docs/ART_BIBLE.md',
    priority: 'optional'
  },
  {
    type: 'narrative',
    name: 'Narrative Bible',
    description: 'Story, characters, and world lore',
    templateFile: 'NARRATIVE_BIBLE_TEMPLATE.md',
    defaultPath: 'docs/NARRATIVE_BIBLE.md',
    priority: 'optional'
  },
  {
    type: 'uiux',
    name: 'UI/UX Specification',
    description: 'User interface and experience design',
    templateFile: 'UIUX_SPEC_TEMPLATE.md',
    defaultPath: 'docs/UIUX_SPEC.md',
    priority: 'optional'
  },
  {
    type: 'economy',
    name: 'Economy Design',
    description: 'Game economy and balance',
    templateFile: 'ECONOMY_TEMPLATE.md',
    defaultPath: 'docs/ECONOMY.md',
    priority: 'optional'
  },
  {
    type: 'audio',
    name: 'Audio Design',
    description: 'Sound design and music direction',
    templateFile: 'AUDIO_DESIGN_TEMPLATE.md',
    defaultPath: 'docs/AUDIO_DESIGN.md',
    priority: 'optional'
  },
  {
    type: 'test_plan',
    name: 'Test Plan',
    description: 'Testing strategy and test cases',
    templateFile: 'TEST_PLAN_TEMPLATE.md',
    defaultPath: 'docs/TEST_PLAN.md',
    priority: 'recommended'
  },
  {
    type: 'level_brief',
    name: 'Level Brief',
    description: 'Level design specification',
    templateFile: 'LEVEL_BRIEF_TEMPLATE.md',
    defaultPath: 'docs/LEVEL_BRIEF.md',
    priority: 'optional'
  },
  {
    type: 'readme',
    name: 'README',
    description: 'Project overview and setup',
    templateFile: 'README_TEMPLATE.md',
    defaultPath: 'README.md',
    priority: 'mandatory'
  }
];

/**
 * Get template by type
 */
export function getTemplate(type: DocType): DocTemplate | undefined {
  return DOC_TEMPLATES.find(t => t.type === type);
}

/**
 * Get template by ID
 */
export function getTemplateById(id: string): DocTemplate | undefined {
  return DOC_TEMPLATES.find(t => t.id === id);
}

/**
 * Get default doc definition
 */
export function getDefaultDoc(type: DocType): Omit<DocDefinition, 'id' | 'status'> | undefined {
  return DEFAULT_DOCS.find(d => d.type === type);
}

/**
 * Generate template content
 */
export function generateTemplateContent(template: DocTemplate, variables: Record<string, string>): string {
  let content = `# ${variables['PROJECT_NAME'] || variables['GAME_NAME'] || variables['FEATURE_NAME'] || 'Untitled'}\n\n`;

  // Add metadata
  content += `> Generated from ${template.name} template\n`;
  content += `> Version: ${variables['VERSION'] || '1.0'}\n\n`;

  // Add sections
  for (const section of template.sections) {
    content += `## ${section.title}\n\n`;
    content += `${section.description}\n\n`;

    if (section.defaultContent) {
      content += `${section.defaultContent}\n\n`;
    } else {
      content += `<!-- TODO: Add ${section.title.toLowerCase()} content -->\n\n`;
    }

    if (section.subsections) {
      for (const sub of section.subsections) {
        content += `### ${sub.title}\n\n`;
        content += `${sub.description}\n\n`;
        content += `<!-- TODO: Add ${sub.title.toLowerCase()} content -->\n\n`;
      }
    }
  }

  return content;
}
