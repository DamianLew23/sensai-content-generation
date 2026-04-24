import { cosineSimilarity } from "./paragraph-filter";

export interface DedupBlock {
  idx: number;
  content: string;
  embedding: number[];
}

export interface DedupResult {
  idx: number;
  status: "kept" | "discarded";
  similarity: number;
  lengthDiff: number;
  similarToIdx?: number;
  reason: string;
}

export interface DedupConfig {
  similarityThreshold: number;
  lengthDiffThreshold: number;
  charLimit: number;
}

function lengthDiffRatio(a: number, b: number): number {
  const max = Math.max(a, b);
  if (max === 0) return 0;
  return (max - Math.min(a, b)) / max;
}

function shouldKeepDespiteSimilarity(
  currentLen: number,
  existingLen: number,
  similarity: number,
  lengthDiffThreshold: number,
): boolean {
  const ratio = lengthDiffRatio(currentLen, existingLen);
  if (ratio > lengthDiffThreshold && similarity < 0.95) return true;
  if (similarity >= 0.95 && ratio > 0.5) return true;
  return false;
}

export function findDiverseBlocks(
  blocks: DedupBlock[],
  config: DedupConfig,
): DedupResult[] {
  if (blocks.length === 0) return [];

  // Sort by length desc (preserving original idx)
  const sorted = [...blocks].sort((a, b) => b.content.length - a.content.length);

  const results: DedupResult[] = [];
  const kept: Array<{ idx: number; embedding: number[]; length: number }> = [];
  let totalChars = 0;

  for (const block of sorted) {
    const len = block.content.length;

    if (kept.length === 0) {
      kept.push({ idx: block.idx, embedding: block.embedding, length: len });
      totalChars += len;
      results.push({
        idx: block.idx,
        status: "kept",
        similarity: 0,
        lengthDiff: 0,
        reason: "First (longest) block",
      });
      continue;
    }

    // Find most similar kept block
    let maxSim = -Infinity;
    let maxIdx = -1;
    for (let i = 0; i < kept.length; i++) {
      const sim = cosineSimilarity(block.embedding, kept[i].embedding);
      if (sim > maxSim) {
        maxSim = sim;
        maxIdx = i;
      }
    }
    const mostSimilar = kept[maxIdx];
    const diff = lengthDiffRatio(len, mostSimilar.length);

    if (maxSim > config.similarityThreshold) {
      if (shouldKeepDespiteSimilarity(len, mostSimilar.length, maxSim, config.lengthDiffThreshold)) {
        if (totalChars + len <= config.charLimit) {
          kept.push({ idx: block.idx, embedding: block.embedding, length: len });
          totalChars += len;
          results.push({
            idx: block.idx,
            status: "kept",
            similarity: maxSim,
            lengthDiff: diff,
            similarToIdx: mostSimilar.idx,
            reason: `Length protection (diff=${(diff * 100).toFixed(1)}%)`,
          });
        } else {
          results.push({
            idx: block.idx,
            status: "discarded",
            similarity: maxSim,
            lengthDiff: diff,
            similarToIdx: mostSimilar.idx,
            reason: "Char limit (length-protected but over)",
          });
        }
      } else {
        results.push({
          idx: block.idx,
          status: "discarded",
          similarity: maxSim,
          lengthDiff: diff,
          similarToIdx: mostSimilar.idx,
          reason: `Too similar (sim=${maxSim.toFixed(3)})`,
        });
      }
    } else {
      if (totalChars + len <= config.charLimit) {
        kept.push({ idx: block.idx, embedding: block.embedding, length: len });
        totalChars += len;
        results.push({
          idx: block.idx,
          status: "kept",
          similarity: maxSim,
          lengthDiff: diff,
          reason: "Unique enough",
        });
      } else {
        results.push({
          idx: block.idx,
          status: "discarded",
          similarity: maxSim,
          lengthDiff: diff,
          reason: "Char limit reached",
        });
      }
    }
  }

  return results;
}
