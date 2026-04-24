function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function deduplicateParagraphsAcrossBlocks(
  blocks: string[][],
): { blocks: string[][]; removed: number } {
  const seen = new Set<string>();
  const resultBlocks: string[][] = [];
  let removed = 0;

  for (const block of blocks) {
    const kept: string[] = [];
    for (const para of block) {
      const key = normalize(para);
      if (key === "") {
        kept.push(para);
        continue;
      }
      if (seen.has(key)) {
        removed += 1;
      } else {
        seen.add(key);
        kept.push(para);
      }
    }
    resultBlocks.push(kept);
  }

  return { blocks: resultBlocks, removed };
}
