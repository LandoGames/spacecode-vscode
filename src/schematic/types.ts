/**
 * Station Schematic Types
 *
 * Defines the architecture map with spaceship analogy.
 * Maps conceptual "sectors" to actual code modules.
 */

/**
 * Sector type represents different areas of the station/codebase
 */
export type SectorType =
  | 'bridge'       // Main control/entry point
  | 'engine'       // Core systems/business logic
  | 'cargo'        // Data management/storage
  | 'comms'        // External communications/API
  | 'science'      // Research/experimental features
  | 'quarters'     // User-facing/UI components
  | 'armory'       // Security systems
  | 'medbay'       // Error handling/recovery
  | 'yard'         // Development/testing
  | 'custom';      // User-defined sector

/**
 * Status of a sector's implementation
 */
export type SectorStatus =
  | 'planned'      // In SA but not implemented
  | 'partial'      // Partially implemented
  | 'complete'     // Fully implemented
  | 'divergent';   // Implementation differs from SA

/**
 * A sector definition in the schematic
 */
export interface SectorDefinition {
  id: string;
  type: SectorType;
  name: string;               // Station analogy name (e.g., "Engine Room")
  realName: string;           // Actual module/folder name (e.g., "core")
  description: string;
  path: string;               // Relative path in codebase
  dependencies: string[];     // IDs of sectors this depends on
  status: SectorStatus;
  files?: string[];           // Key files in this sector
  rules?: SectorRules;
  metrics?: SectorMetrics;
}

/**
 * Rules for a sector
 */
export interface SectorRules {
  /** Maximum file size in lines */
  maxFileSize?: number;
  /** Maximum cyclomatic complexity */
  maxComplexity?: number;
  /** Allowed imports (glob patterns) */
  allowedImports?: string[];
  /** Forbidden imports (glob patterns) */
  forbiddenImports?: string[];
  /** Required patterns (e.g., 'export interface') */
  requiredPatterns?: string[];
  /** Custom rules */
  custom?: Array<{
    name: string;
    pattern: string;
    message: string;
  }>;
}

/**
 * Metrics for a sector
 */
export interface SectorMetrics {
  fileCount: number;
  lineCount: number;
  complexity: number;
  coverage?: number;
  lastModified?: number;
}

/**
 * Connection between sectors
 */
export interface SectorConnection {
  from: string;     // Sector ID
  to: string;       // Sector ID
  type: 'depends' | 'imports' | 'calls' | 'references';
  strength: 'weak' | 'moderate' | 'strong';
}

/**
 * The complete station schematic
 */
export interface StationSchematic {
  id: string;
  name: string;
  version: string;
  createdAt: number;
  updatedAt: number;
  sectors: SectorDefinition[];
  connections: SectorConnection[];
  metadata: SchematicMetadata;
}

/**
 * Schematic metadata
 */
export interface SchematicMetadata {
  projectType: 'unity' | 'web' | 'api' | 'library' | 'custom';
  framework?: string;
  language: 'typescript' | 'csharp' | 'javascript' | 'mixed';
  saDocPath?: string;         // Path to Software Architecture doc
  gddDocPath?: string;        // Path to Game Design doc
  lastSyncedAt?: number;
}

/**
 * Preset sector templates for common architectures
 */
export interface ArchitecturePreset {
  id: string;
  name: string;
  description: string;
  projectType: SchematicMetadata['projectType'];
  sectors: Omit<SectorDefinition, 'id' | 'status' | 'metrics'>[];
}

/**
 * Wizard step for architecture setup
 */
export interface WizardStep {
  id: string;
  title: string;
  description: string;
  type: 'preset' | 'sector' | 'mapping' | 'review';
  isOptional: boolean;
  isComplete: boolean;
}

/**
 * Wizard state
 */
export interface WizardState {
  currentStep: number;
  steps: WizardStep[];
  selectedPreset?: string;
  schematic: Partial<StationSchematic>;
  mappings: Record<string, string>;  // Sector ID -> actual path
  isComplete: boolean;
}

/**
 * Divergence report when code differs from SA
 */
export interface DivergenceReport {
  sectorId: string;
  sectorName: string;
  issues: DivergenceIssue[];
  suggestedFixes: string[];
}

/**
 * A specific divergence issue
 */
export interface DivergenceIssue {
  type: 'missing' | 'extra' | 'misplaced' | 'violation';
  description: string;
  path?: string;
  line?: number;
  severity: 'info' | 'warning' | 'error';
}

/**
 * Schematic scan options
 */
export interface SchematicScanOptions {
  /** Scan for divergences from SA */
  checkDivergence?: boolean;
  /** Update metrics */
  updateMetrics?: boolean;
  /** Check sector rules */
  checkRules?: boolean;
}

/**
 * Schematic scan result
 */
export interface SchematicScanResult {
  completedAt: number;
  duration: number;
  schematic: StationSchematic;
  divergences: DivergenceReport[];
  healthScore: number;
}
