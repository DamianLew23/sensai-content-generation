import { describe, it, expect } from "vitest";
import { findDiverseBlocks } from "../tools/content-cleaner/dedup";

const config = {
  similarityThreshold: 0.85,
  lengthDiffThreshold: 0.3,
  charLimit: 50_000,
};

describe("findDiverseBlocks", () => {
  it("always keeps the first (longest) block with reason 'First (longest) block'", () => {
    const blocks = [
      { idx: 0, content: "x".repeat(500), embedding: [1, 0] },
      { idx: 1, content: "x".repeat(300), embedding: [0, 1] },
    ];
    const results = findDiverseBlocks(blocks, config);
    const first = results.find((r) => r.idx === 0)!;
    expect(first.status).toBe("kept");
    expect(first.reason).toMatch(/First/i);
  });

  it("discards block above similarity threshold when length-diff <= 30%", () => {
    const blocks = [
      { idx: 0, content: "x".repeat(500), embedding: [1, 0] },
      { idx: 1, content: "x".repeat(450), embedding: [0.99, 0.01] }, // very similar, similar length
    ];
    const results = findDiverseBlocks(blocks, config);
    const second = results.find((r) => r.idx === 1)!;
    expect(second.status).toBe("discarded");
    expect(second.reason).toMatch(/too similar/i);
  });

  it("keeps block with length protection: sim > threshold, lengthDiff > 30%, sim < 0.95", () => {
    const blocks = [
      { idx: 0, content: "x".repeat(1000), embedding: [1, 0] },
      { idx: 1, content: "x".repeat(500), embedding: [0.9, 0.436] },
      // sim ~= 0.9 (above threshold but below 0.95), lengthDiff = 50% (> 30%)
    ];
    const results = findDiverseBlocks(blocks, config);
    const second = results.find((r) => r.idx === 1)!;
    expect(second.status).toBe("kept");
    expect(second.reason).toMatch(/length protection/i);
  });

  it("discards block with very high similarity (>= 0.95) when lengthDiff <= 50%", () => {
    const blocks = [
      { idx: 0, content: "x".repeat(1000), embedding: [1, 0] },
      { idx: 1, content: "x".repeat(600), embedding: [0.98, 0.199] },
      // sim ~= 0.98 (>= 0.95), lengthDiff = 40% (<= 50%)
    ];
    const results = findDiverseBlocks(blocks, config);
    const second = results.find((r) => r.idx === 1)!;
    expect(second.status).toBe("discarded");
  });

  it("keeps unique block (similarity below threshold)", () => {
    const blocks = [
      { idx: 0, content: "x".repeat(500), embedding: [1, 0] },
      { idx: 1, content: "x".repeat(400), embedding: [0, 1] },
    ];
    const results = findDiverseBlocks(blocks, config);
    const second = results.find((r) => r.idx === 1)!;
    expect(second.status).toBe("kept");
    expect(second.reason).toMatch(/unique/i);
  });

  it("records similarToIdx on discarded blocks", () => {
    const blocks = [
      { idx: 5, content: "x".repeat(500), embedding: [1, 0] },
      { idx: 7, content: "x".repeat(450), embedding: [0.99, 0.01] },
    ];
    const results = findDiverseBlocks(blocks, config);
    const discarded = results.find((r) => r.idx === 7)!;
    expect(discarded.similarToIdx).toBe(5);
    expect(discarded.similarity).toBeGreaterThan(0.85);
  });

  it("respects charLimit: discards unique block when over limit", () => {
    const blocks = [
      { idx: 0, content: "x".repeat(40_000), embedding: [1, 0] },
      { idx: 1, content: "x".repeat(20_000), embedding: [0, 1] }, // unique BUT over 50k total
    ];
    const results = findDiverseBlocks(blocks, { ...config, charLimit: 50_000 });
    const second = results.find((r) => r.idx === 1)!;
    expect(second.status).toBe("discarded");
    expect(second.reason).toMatch(/char limit/i);
  });

  it("sorts blocks by length descending before processing", () => {
    const blocks = [
      { idx: 0, content: "x".repeat(300), embedding: [1, 0] }, // shorter
      { idx: 1, content: "x".repeat(800), embedding: [0.99, 0.01] }, // longer, should be "first"
    ];
    const results = findDiverseBlocks(blocks, config);
    const longest = results.find((r) => r.idx === 1)!;
    expect(longest.status).toBe("kept");
    expect(longest.reason).toMatch(/First/i);
  });

  it("returns empty array for empty input", () => {
    expect(findDiverseBlocks([], config)).toEqual([]);
  });
});
