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
 * All templates
 */
export const DOC_TEMPLATES: DocTemplate[] = [
  GDD_TEMPLATE,
  SA_TEMPLATE,
  TDD_TEMPLATE,
  README_TEMPLATE
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
