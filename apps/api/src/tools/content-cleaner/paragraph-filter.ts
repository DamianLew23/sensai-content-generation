export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`vector length mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function splitIntoParagraphs(text: string, minLen: number): string[] {
  if (!text) return [];
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length >= minLen);
}

export interface RemovedParagraph {
  text: string;
  score: number;
}

export function filterParagraphsByKeyword(
  paragraphs: string[],
  paragraphEmbeddings: number[][],
  keywordEmbedding: number[],
  threshold: number,
): { kept: string[]; removed: RemovedParagraph[] } {
  if (paragraphs.length !== paragraphEmbeddings.length) {
    throw new Error(
      `paragraphs/embeddings length mismatch: ${paragraphs.length} vs ${paragraphEmbeddings.length}`,
    );
  }

  const kept: string[] = [];
  const removed: RemovedParagraph[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const score = cosineSimilarity(paragraphEmbeddings[i], keywordEmbedding);
    if (score >= threshold) {
      kept.push(paragraphs[i]);
    } else {
      removed.push({ text: paragraphs[i], score });
    }
  }

  return { kept, removed };
}
