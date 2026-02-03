/**
 * Art Studio Manager
 *
 * Manages visual assets, style guides, and the Palette persona.
 */

import * as vscode from 'vscode';
import {
  ColorPalette,
  ColorEntry,
  Typography,
  FontEntry,
  SpacingScale,
  Theme,
  StyleGuide,
  GeneratedImage,
  ImageStyle,
  ImageGenerationRequest,
  Asset,
  AssetType,
  AssetLibrary,
  AssetFolder,
  DesignReview,
  DesignComment,
  ArtStudioState
} from './types';

let _instance: ArtStudioManager | undefined;

export function getArtStudioManager(): ArtStudioManager {
  if (!_instance) {
    _instance = new ArtStudioManager();
  }
  return _instance;
}

export class ArtStudioManager {
  private _state: ArtStudioState;
  private _storageKey = 'spacecode.artstudio';

  constructor() {
    this._state = {
      styleGuide: this._createDefaultStyleGuide(),
      library: { assets: [], folders: [], totalSize: 0, lastSynced: 0 },
      generatedImages: [],
      reviews: [],
      selectedPaletteId: null,
      selectedAssetId: null,
      isGenerating: false
    };
  }

  /**
   * Initialize with extension context
   */
  async initialize(context: vscode.ExtensionContext): Promise<void> {
    const saved = context.globalState.get<string>(this._storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.styleGuide) {
          this._state.styleGuide = parsed.styleGuide;
        }
        if (parsed.generatedImages) {
          this._state.generatedImages = parsed.generatedImages;
        }
      } catch {
        // Invalid saved state
      }
    }
  }

  /**
   * Save state to storage
   */
  async save(context: vscode.ExtensionContext): Promise<void> {
    const saveData = {
      styleGuide: this._state.styleGuide,
      generatedImages: this._state.generatedImages.slice(-20)
    };
    await context.globalState.update(this._storageKey, JSON.stringify(saveData));
  }

  /**
   * Get current state
   */
  getState(): ArtStudioState {
    return this._state;
  }

  /**
   * Get style guide
   */
  getStyleGuide(): StyleGuide {
    return this._state.styleGuide;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Palette Methods
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get all palettes
   */
  getPalettes(): ColorPalette[] {
    return this._state.styleGuide.palettes;
  }

  /**
   * Get palette by ID
   */
  getPalette(id: string): ColorPalette | undefined {
    return this._state.styleGuide.palettes.find(p => p.id === id);
  }

  /**
   * Create a new palette
   */
  createPalette(name: string, colors: ColorEntry[]): ColorPalette {
    const palette: ColorPalette = {
      id: `palette-${Date.now()}`,
      name,
      colors,
      isDefault: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    this._state.styleGuide.palettes.push(palette);
    return palette;
  }

  /**
   * Update a palette
   */
  updatePalette(id: string, updates: Partial<ColorPalette>): ColorPalette | undefined {
    const palette = this.getPalette(id);
    if (palette) {
      Object.assign(palette, updates, { updatedAt: Date.now() });
    }
    return palette;
  }

  /**
   * Delete a palette
   */
  deletePalette(id: string): boolean {
    const idx = this._state.styleGuide.palettes.findIndex(p => p.id === id);
    if (idx !== -1 && !this._state.styleGuide.palettes[idx].isDefault) {
      this._state.styleGuide.palettes.splice(idx, 1);
      return true;
    }
    return false;
  }

  /**
   * Add color to palette
   */
  addColor(paletteId: string, color: ColorEntry): ColorPalette | undefined {
    const palette = this.getPalette(paletteId);
    if (palette) {
      palette.colors.push(color);
      palette.updatedAt = Date.now();
    }
    return palette;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Typography Methods
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get all typography configs
   */
  getTypography(): Typography[] {
    return this._state.styleGuide.typography;
  }

  /**
   * Create typography config
   */
  createTypography(name: string, fonts: FontEntry[]): Typography {
    const typography: Typography = {
      id: `typo-${Date.now()}`,
      name,
      fonts,
      createdAt: Date.now()
    };
    this._state.styleGuide.typography.push(typography);
    return typography;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Theme Methods
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get all themes
   */
  getThemes(): Theme[] {
    return this._state.styleGuide.themes;
  }

  /**
   * Get active theme
   */
  getActiveTheme(): Theme | undefined {
    return this._state.styleGuide.themes.find(t => t.isActive);
  }

  /**
   * Set active theme
   */
  setActiveTheme(themeId: string): Theme | undefined {
    for (const theme of this._state.styleGuide.themes) {
      theme.isActive = theme.id === themeId;
    }
    this._state.styleGuide.activeTheme = themeId;
    return this.getActiveTheme();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Image Generation Methods
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Generate image (stub - would integrate with Gemini API)
   */
  async generateImage(request: ImageGenerationRequest): Promise<GeneratedImage> {
    const image: GeneratedImage = {
      id: `img-${Date.now()}`,
      prompt: request.prompt,
      negativePrompt: request.negativePrompt,
      style: request.style,
      width: request.width,
      height: request.height,
      status: 'pending',
      createdAt: Date.now()
    };

    this._state.generatedImages.unshift(image);
    this._state.isGenerating = true;

    try {
      // Update status
      image.status = 'generating';

      // Simulate generation delay
      await new Promise(resolve => setTimeout(resolve, 2000));

      // In real implementation, this would call Gemini API
      // For now, we'll simulate a successful generation
      image.status = 'complete';
      image.url = `https://placeholder.example.com/${image.id}.png`;

      return image;
    } catch (error) {
      image.status = 'failed';
      image.error = error instanceof Error ? error.message : 'Generation failed';
      throw error;
    } finally {
      this._state.isGenerating = false;
    }
  }

  /**
   * Get generation history
   */
  getGenerationHistory(): GeneratedImage[] {
    return this._state.generatedImages;
  }

  /**
   * Get recent generations
   */
  getRecentGenerations(limit: number = 10): GeneratedImage[] {
    return this._state.generatedImages.slice(0, limit);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Asset Library Methods
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get asset library
   */
  getAssetLibrary(): AssetLibrary {
    return this._state.library;
  }

  /**
   * Scan for assets in workspace
   */
  async scanAssets(): Promise<AssetLibrary> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return this._state.library;
    }

    // Common asset paths to scan
    const assetPaths = [
      'Assets/Sprites',
      'Assets/Textures',
      'Assets/UI',
      'Assets/Icons',
      'assets',
      'public/images',
      'src/assets'
    ];

    const assets: Asset[] = [];
    const folders: AssetFolder[] = [];

    for (const assetPath of assetPaths) {
      try {
        const uri = vscode.Uri.joinPath(workspaceFolders[0].uri, assetPath);
        const stat = await vscode.workspace.fs.stat(uri);

        if (stat.type === vscode.FileType.Directory) {
          const entries = await vscode.workspace.fs.readDirectory(uri);
          const assetCount = entries.filter(([name, type]) =>
            type === vscode.FileType.File && this._isAssetFile(name)
          ).length;

          if (assetCount > 0) {
            folders.push({
              id: `folder-${assetPath.replace(/\//g, '-')}`,
              name: assetPath.split('/').pop() || assetPath,
              path: assetPath,
              assetCount
            });

            // Add individual assets
            for (const [name, type] of entries) {
              if (type === vscode.FileType.File && this._isAssetFile(name)) {
                const filePath = `${assetPath}/${name}`;
                assets.push({
                  id: `asset-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  name,
                  type: this._getAssetType(name),
                  path: filePath,
                  metadata: {},
                  tags: [],
                  createdAt: Date.now(),
                  updatedAt: Date.now()
                });
              }
            }
          }
        }
      } catch {
        // Path doesn't exist, skip
      }
    }

    this._state.library = {
      assets,
      folders,
      totalSize: 0, // Would need to calculate actual sizes
      lastSynced: Date.now()
    };

    return this._state.library;
  }

  private _isAssetFile(name: string): boolean {
    const ext = name.toLowerCase().split('.').pop();
    return ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'psd', 'ai', 'tif', 'tiff'].includes(ext || '');
  }

  private _getAssetType(name: string): AssetType {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('icon')) return 'icon';
    if (lowerName.includes('sprite')) return 'sprite';
    if (lowerName.includes('ui') || lowerName.includes('button')) return 'ui';
    if (lowerName.includes('tex') || lowerName.includes('material')) return 'texture';
    return 'image';
  }

  /**
   * Get asset by ID
   */
  getAsset(id: string): Asset | undefined {
    return this._state.library.assets.find(a => a.id === id);
  }

  /**
   * Search assets by name or tags
   */
  searchAssets(query: string): Asset[] {
    const lowerQuery = query.toLowerCase();
    return this._state.library.assets.filter(a =>
      a.name.toLowerCase().includes(lowerQuery) ||
      a.tags.some(t => t.toLowerCase().includes(lowerQuery))
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Design Review Methods
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Create a design review
   */
  createReview(type: DesignReview['type'], assetId?: string): DesignReview {
    const review: DesignReview = {
      id: `review-${Date.now()}`,
      assetId,
      type,
      status: 'pending',
      comments: [],
      createdAt: Date.now()
    };
    this._state.reviews.push(review);
    return review;
  }

  /**
   * Add comment to review
   */
  addReviewComment(reviewId: string, text: string, severity: DesignComment['severity']): DesignComment | undefined {
    const review = this._state.reviews.find(r => r.id === reviewId);
    if (review) {
      const comment: DesignComment = {
        id: `comment-${Date.now()}`,
        text,
        severity,
        resolved: false,
        createdAt: Date.now()
      };
      review.comments.push(comment);
      return comment;
    }
    return undefined;
  }

  /**
   * Get pending reviews
   */
  getPendingReviews(): DesignReview[] {
    return this._state.reviews.filter(r => r.status === 'pending');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private Methods
  // ─────────────────────────────────────────────────────────────────────────────

  private _createDefaultStyleGuide(): StyleGuide {
    return {
      palettes: [
        {
          id: 'palette-default',
          name: 'Default Theme',
          colors: [
            { name: 'Primary', hex: '#3B82F6', role: 'primary' },
            { name: 'Secondary', hex: '#10B981', role: 'secondary' },
            { name: 'Accent', hex: '#A855F7', role: 'accent' },
            { name: 'Background', hex: '#1F2937', role: 'background' },
            { name: 'Text', hex: '#F9FAFB', role: 'text' },
            { name: 'Border', hex: '#374151', role: 'border' },
            { name: 'Success', hex: '#22C55E', role: 'success' },
            { name: 'Warning', hex: '#F59E0B', role: 'warning' },
            { name: 'Error', hex: '#EF4444', role: 'error' }
          ],
          isDefault: true,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ],
      typography: [
        {
          id: 'typo-default',
          name: 'Default Typography',
          fonts: [
            { role: 'heading', family: 'Inter', weight: 700, size: '24px', lineHeight: '1.2' },
            { role: 'subheading', family: 'Inter', weight: 600, size: '18px', lineHeight: '1.3' },
            { role: 'body', family: 'Inter', weight: 400, size: '14px', lineHeight: '1.5' },
            { role: 'caption', family: 'Inter', weight: 400, size: '12px', lineHeight: '1.4' },
            { role: 'code', family: 'JetBrains Mono', weight: 400, size: '13px', lineHeight: '1.5' }
          ],
          createdAt: Date.now()
        }
      ],
      spacing: [
        {
          id: 'spacing-default',
          name: 'Default Scale',
          baseUnit: 4,
          scale: [
            { name: 'xs', value: 4, usage: 'Tight padding, small gaps' },
            { name: 'sm', value: 8, usage: 'Default padding, list gaps' },
            { name: 'md', value: 16, usage: 'Section padding, card gaps' },
            { name: 'lg', value: 24, usage: 'Large sections' },
            { name: 'xl', value: 32, usage: 'Page margins' }
          ]
        }
      ],
      themes: [
        {
          id: 'theme-dark',
          name: 'Dark Theme',
          paletteId: 'palette-default',
          typographyId: 'typo-default',
          spacingId: 'spacing-default',
          isActive: true,
          isDark: true
        }
      ],
      activeTheme: 'theme-dark'
    };
  }
}
