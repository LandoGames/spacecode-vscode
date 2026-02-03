/**
 * Art Studio/Palette Types
 *
 * Types for the Palette persona and Art Studio asset management.
 */

export interface ColorPalette {
  id: string;
  name: string;
  colors: ColorEntry[];
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ColorEntry {
  name: string;
  hex: string;
  role: 'primary' | 'secondary' | 'accent' | 'background' | 'text' | 'border' | 'success' | 'warning' | 'error' | 'custom';
}

export interface Typography {
  id: string;
  name: string;
  fonts: FontEntry[];
  createdAt: number;
}

export interface FontEntry {
  role: 'heading' | 'subheading' | 'body' | 'caption' | 'code' | 'custom';
  family: string;
  weight: number;
  size: string;
  lineHeight?: string;
}

export interface SpacingScale {
  id: string;
  name: string;
  baseUnit: number;
  scale: SpacingEntry[];
}

export interface SpacingEntry {
  name: string;
  value: number;
  usage: string;
}

export interface Theme {
  id: string;
  name: string;
  paletteId: string;
  typographyId: string;
  spacingId: string;
  isActive: boolean;
  isDark: boolean;
}

export interface StyleGuide {
  palettes: ColorPalette[];
  typography: Typography[];
  spacing: SpacingScale[];
  themes: Theme[];
  activeTheme: string | null;
}

export interface GeneratedImage {
  id: string;
  prompt: string;
  negativePrompt?: string;
  style: ImageStyle;
  width: number;
  height: number;
  url?: string;
  base64?: string;
  status: 'pending' | 'generating' | 'complete' | 'failed';
  error?: string;
  createdAt: number;
}

export type ImageStyle =
  | 'icon'
  | 'sprite'
  | 'background'
  | 'ui-element'
  | 'character'
  | 'environment'
  | 'concept'
  | 'custom';

export interface ImageGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  style: ImageStyle;
  width: number;
  height: number;
  variations?: number;
}

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  path: string;
  thumbnailUrl?: string;
  metadata: AssetMetadata;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export type AssetType = 'image' | 'sprite' | 'icon' | 'texture' | 'ui' | 'audio' | 'other';

export interface AssetMetadata {
  width?: number;
  height?: number;
  format?: string;
  size?: number;
  colorProfile?: string;
}

export interface AssetLibrary {
  assets: Asset[];
  folders: AssetFolder[];
  totalSize: number;
  lastSynced: number;
}

export interface AssetFolder {
  id: string;
  name: string;
  path: string;
  assetCount: number;
}

export interface DesignReview {
  id: string;
  assetId?: string;
  type: 'color' | 'typography' | 'spacing' | 'layout' | 'general';
  status: 'pending' | 'approved' | 'needs-revision';
  comments: DesignComment[];
  comparedTo?: string; // Art Bible reference
  createdAt: number;
}

export interface DesignComment {
  id: string;
  text: string;
  severity: 'info' | 'warning' | 'error';
  resolved: boolean;
  createdAt: number;
}

export interface ArtStudioState {
  styleGuide: StyleGuide;
  library: AssetLibrary;
  generatedImages: GeneratedImage[];
  reviews: DesignReview[];
  selectedPaletteId: string | null;
  selectedAssetId: string | null;
  isGenerating: boolean;
}

export interface ArtStudioPanelState {
  activeTab: 'styles' | 'generate' | 'library' | 'review';
  selectedPalette: ColorPalette | null;
  selectedTypography: Typography | null;
  selectedAsset: Asset | null;
  generationPrompt: string;
  generationStyle: ImageStyle;
  recentGenerations: GeneratedImage[];
  showStyleEditor: boolean;
}
