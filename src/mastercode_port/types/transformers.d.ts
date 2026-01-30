declare module '@xenova/transformers' {
  export interface PipelineOptions {
    progress_callback?: (data: {
      status: string;
      progress?: number;
      loaded?: number;
      total?: number;
    }) => void;
  }

  export interface FeatureExtractionOutput {
    data: Float32Array;
    dims: number[];
  }

  export interface FeatureExtractionPipeline {
    (
      text: string | string[],
      options?: { pooling?: 'mean' | 'cls'; normalize?: boolean }
    ): Promise<FeatureExtractionOutput>;
  }

  export function pipeline(
    task: 'feature-extraction',
    model: string,
    options?: PipelineOptions
  ): Promise<FeatureExtractionPipeline>;

  export const env: {
    cacheDir: string;
    allowLocalModels: boolean;
    useBrowserCache: boolean;
  };
}
