export interface CleaningThresholds {
  blockSimilarityThreshold: number;
  paragraphKeywordThreshold: number;
  lengthDiffThreshold: number;
  charLimit: number;
  minParagraphLength: number;
}

export interface CleaningConfig extends CleaningThresholds {
  embeddingModel: string;
  costPer1MTokens: number;
}

export const MAX_BATCH_SIZE = 2048;
export const MAX_TEXT_CHARS = 8000;
