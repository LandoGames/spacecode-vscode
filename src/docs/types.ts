/**
 * Docs/Librarian Module Types
 *
 * Defines types for documentation management and the Index persona.
 */

/**
 * Documentation type
 */
export type DocType =
  | 'gdd'           // Game Design Document
  | 'sa'            // Software Architecture
  | 'tdd'           // Technical Design Document
  | 'art_bible'     // Art Bible
  | 'narrative'     // Narrative Bible
  | 'uiux'          // UI/UX Specification
  | 'economy'       // Economy Design
  | 'audio'         // Audio Design
  | 'test_plan'     // Test Plan
  | 'level_brief'   // Level Brief
  | 'readme'        // README
  | 'changelog'     // Changelog
  | 'api'           // API Documentation
  | 'custom';       // Custom document

/**
 * Documentation status
 */
export type DocStatus =
  | 'missing'       // Does not exist
  | 'outdated'      // Exists but needs update
  | 'current'       // Up to date
  | 'draft';        // In progress

/**
 * Documentation priority
 */
export type DocPriority = 'mandatory' | 'recommended' | 'optional';

/**
 * Document definition
 */
export interface DocDefinition {
  id: string;
  type: DocType;
  name: string;
  description: string;
  templateFile?: string;
  defaultPath: string;
  priority: DocPriority;
  status: DocStatus;
  lastModified?: number;
  wordCount?: number;
  sections?: string[];
}

/**
 * Document template
 */
export interface DocTemplate {
  id: string;
  type: DocType;
  name: string;
  description: string;
  sections: TemplateSection[];
  variables: TemplateVariable[];
}

/**
 * Template section
 */
export interface TemplateSection {
  id: string;
  title: string;
  required: boolean;
  description: string;
  defaultContent?: string;
  subsections?: TemplateSection[];
}

/**
 * Template variable
 */
export interface TemplateVariable {
  name: string;
  description: string;
  defaultValue?: string;
  required: boolean;
}

/**
 * Documentation setup wizard state
 */
export interface DocsWizardState {
  currentStep: number;
  totalSteps: number;
  steps: DocsWizardStep[];
  projectName: string;
  projectType: string;
  selectedDocs: DocType[];
  docConfigs: Record<DocType, DocConfig>;
  isComplete: boolean;
}

/**
 * Wizard step
 */
export interface DocsWizardStep {
  id: string;
  title: string;
  description: string;
  docType?: DocType;
  isOptional: boolean;
  isComplete: boolean;
  isSkipped: boolean;
}

/**
 * Document configuration
 */
export interface DocConfig {
  type: DocType;
  path: string;
  useTemplate: boolean;
  templateId?: string;
  variables: Record<string, string>;
}

/**
 * Documentation sync result
 */
export interface DocSyncResult {
  docType: DocType;
  path: string;
  status: 'created' | 'updated' | 'unchanged' | 'error';
  changes?: string[];
  error?: string;
}

/**
 * Documentation scan result
 */
export interface DocScanResult {
  completedAt: number;
  duration: number;
  documents: DocDefinition[];
  missingMandatory: DocType[];
  outdatedDocs: DocType[];
  healthScore: number;
}

/**
 * Index persona block state (blocks chat until docs are set up)
 */
export interface IndexBlockState {
  isBlocked: boolean;
  reason?: string;
  missingDocs: DocType[];
  setupRequired: boolean;
}
