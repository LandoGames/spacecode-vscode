/**
 * Architecture Presets
 *
 * Pre-defined sector configurations for common project types.
 */

import { ArchitecturePreset, SectorType } from './types';

/**
 * Unity Game Project preset
 */
export const UNITY_PRESET: ArchitecturePreset = {
  id: 'unity-game',
  name: 'Unity Game Project',
  description: 'Standard Unity game architecture with gameplay, UI, data, and services layers',
  projectType: 'unity',
  sectors: [
    {
      type: 'bridge',
      name: 'Command Bridge',
      realName: 'GameManager',
      description: 'Main game entry point and scene management',
      path: 'Assets/Scripts/Core',
      dependencies: [],
      rules: {
        maxFileSize: 500,
        maxComplexity: 15,
      },
    },
    {
      type: 'engine',
      name: 'Engine Room',
      realName: 'Gameplay',
      description: 'Core gameplay mechanics and systems',
      path: 'Assets/Scripts/Gameplay',
      dependencies: ['bridge'],
      rules: {
        maxComplexity: 20,
      },
    },
    {
      type: 'quarters',
      name: 'Crew Quarters',
      realName: 'UI',
      description: 'User interface components and screens',
      path: 'Assets/Scripts/UI',
      dependencies: ['bridge', 'engine'],
      rules: {
        allowedImports: ['UnityEngine.UI', 'TMPro'],
      },
    },
    {
      type: 'cargo',
      name: 'Cargo Bay',
      realName: 'Data',
      description: 'Data models, save system, and persistence',
      path: 'Assets/Scripts/Data',
      dependencies: [],
      rules: {
        forbiddenImports: ['UnityEngine.UI'],
      },
    },
    {
      type: 'comms',
      name: 'Communications Array',
      realName: 'Network',
      description: 'Multiplayer, API calls, and external services',
      path: 'Assets/Scripts/Network',
      dependencies: ['cargo'],
    },
    {
      type: 'science',
      name: 'Science Lab',
      realName: 'Systems',
      description: 'Game systems like inventory, crafting, quests',
      path: 'Assets/Scripts/Systems',
      dependencies: ['engine', 'cargo'],
    },
    {
      type: 'armory',
      name: 'Armory',
      realName: 'Security',
      description: 'Anti-cheat, validation, and security systems',
      path: 'Assets/Scripts/Security',
      dependencies: ['cargo'],
    },
    {
      type: 'yard',
      name: 'Yard/Lab',
      realName: 'Experimental',
      description: 'Experimental features and prototypes',
      path: 'Assets/Scripts/Experimental',
      dependencies: [],
      rules: {
        maxComplexity: 30, // Relaxed for experiments
      },
    },
  ],
};

/**
 * VSCode Extension preset
 */
export const VSCODE_EXTENSION_PRESET: ArchitecturePreset = {
  id: 'vscode-extension',
  name: 'VSCode Extension',
  description: 'VSCode extension with commands, providers, and webview',
  projectType: 'custom',
  sectors: [
    {
      type: 'bridge',
      name: 'Command Bridge',
      realName: 'extension',
      description: 'Extension activation and command registration',
      path: 'src',
      dependencies: [],
      files: ['extension.ts'],
    },
    {
      type: 'engine',
      name: 'Engine Room',
      realName: 'core',
      description: 'Core extension logic and services',
      path: 'src/core',
      dependencies: ['bridge'],
    },
    {
      type: 'quarters',
      name: 'Crew Quarters',
      realName: 'webview',
      description: 'Webview panels and UI components',
      path: 'src/webview',
      dependencies: ['bridge'],
    },
    {
      type: 'comms',
      name: 'Communications Array',
      realName: 'providers',
      description: 'VSCode API providers (tree, completion, etc.)',
      path: 'src/providers',
      dependencies: ['engine'],
    },
    {
      type: 'cargo',
      name: 'Cargo Bay',
      realName: 'storage',
      description: 'Configuration and state storage',
      path: 'src/storage',
      dependencies: [],
    },
  ],
};

/**
 * Web API preset
 */
export const WEB_API_PRESET: ArchitecturePreset = {
  id: 'web-api',
  name: 'Web API (Express/Fastify)',
  description: 'RESTful API with routes, controllers, and services',
  projectType: 'api',
  sectors: [
    {
      type: 'bridge',
      name: 'Command Bridge',
      realName: 'server',
      description: 'Server entry point and middleware setup',
      path: 'src',
      dependencies: [],
      files: ['index.ts', 'app.ts'],
    },
    {
      type: 'comms',
      name: 'Communications Array',
      realName: 'routes',
      description: 'API routes and request handlers',
      path: 'src/routes',
      dependencies: ['bridge'],
    },
    {
      type: 'engine',
      name: 'Engine Room',
      realName: 'services',
      description: 'Business logic and service layer',
      path: 'src/services',
      dependencies: [],
    },
    {
      type: 'cargo',
      name: 'Cargo Bay',
      realName: 'models',
      description: 'Data models and database schemas',
      path: 'src/models',
      dependencies: [],
    },
    {
      type: 'medbay',
      name: 'Med Bay',
      realName: 'middleware',
      description: 'Error handling and request processing',
      path: 'src/middleware',
      dependencies: ['bridge'],
    },
    {
      type: 'armory',
      name: 'Armory',
      realName: 'auth',
      description: 'Authentication and authorization',
      path: 'src/auth',
      dependencies: ['engine', 'cargo'],
    },
  ],
};

/**
 * React/Next.js Web App preset
 */
export const REACT_WEB_PRESET: ArchitecturePreset = {
  id: 'react-web',
  name: 'React/Next.js Web App',
  description: 'Modern web app with components, hooks, and state',
  projectType: 'web',
  sectors: [
    {
      type: 'bridge',
      name: 'Command Bridge',
      realName: 'app',
      description: 'App entry and routing',
      path: 'src/app',
      dependencies: [],
    },
    {
      type: 'quarters',
      name: 'Crew Quarters',
      realName: 'components',
      description: 'React UI components',
      path: 'src/components',
      dependencies: ['bridge'],
    },
    {
      type: 'engine',
      name: 'Engine Room',
      realName: 'hooks',
      description: 'Custom React hooks and logic',
      path: 'src/hooks',
      dependencies: [],
    },
    {
      type: 'cargo',
      name: 'Cargo Bay',
      realName: 'store',
      description: 'State management (Redux/Zustand)',
      path: 'src/store',
      dependencies: [],
    },
    {
      type: 'comms',
      name: 'Communications Array',
      realName: 'api',
      description: 'API client and data fetching',
      path: 'src/api',
      dependencies: ['cargo'],
    },
    {
      type: 'science',
      name: 'Science Lab',
      realName: 'utils',
      description: 'Utility functions and helpers',
      path: 'src/utils',
      dependencies: [],
    },
  ],
};

/**
 * All available presets
 */
export const ARCHITECTURE_PRESETS: ArchitecturePreset[] = [
  UNITY_PRESET,
  VSCODE_EXTENSION_PRESET,
  WEB_API_PRESET,
  REACT_WEB_PRESET,
];

/**
 * Get preset by ID
 */
export function getPreset(id: string): ArchitecturePreset | undefined {
  return ARCHITECTURE_PRESETS.find(p => p.id === id);
}

/**
 * Default sector icons for visualization
 */
export const SECTOR_ICONS: Record<SectorType, string> = {
  bridge: 'fa-ship',
  engine: 'fa-cogs',
  cargo: 'fa-archive',
  comms: 'fa-satellite-dish',
  science: 'fa-flask',
  quarters: 'fa-users',
  armory: 'fa-shield',
  medbay: 'fa-medkit',
  yard: 'fa-wrench',
  custom: 'fa-cube',
};

/**
 * Default sector colors for visualization
 */
export const SECTOR_COLORS: Record<SectorType, string> = {
  bridge: '#a855f7',   // purple
  engine: '#f59e0b',   // amber
  cargo: '#22c55e',    // green
  comms: '#3b82f6',    // blue
  science: '#06b6d4',  // cyan
  quarters: '#ec4899', // pink
  armory: '#ef4444',   // red
  medbay: '#10b981',   // emerald
  yard: '#6b7280',     // gray
  custom: '#8b5cf6',   // violet
};
