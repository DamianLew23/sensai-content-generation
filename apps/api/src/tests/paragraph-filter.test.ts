import { describe, it, expect } from "vitest";
import {
  cosineSimilarity,
  splitIntoParagraphs,
  filterParagraphsByKeyword,
} from "../tools/content-cleaner/paragraph-filter";

describe("cosineSimilarity", () => {
  it("returns 1 for identical unit vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 6);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 6);
  });

  it("handles non-normalized vectors by normalizing", () => {
    expect(cosineSimilarity([2, 0], [3, 0])).toBeCloseTo(1, 6);
    expect(cosineSimilarity([3, 4], [3, 4])).toBeCloseTo(1, 6);
  });

  it("returns 0 for zero vectors (avoids NaN)", () => {
    expect(cosineSimilarity([0, 0], [1, 0])).toBe(0);
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });
});

describe("splitIntoParagraphs", () => {
  it("splits on double newlines and filters below minLen", () => {
    const input = "short\n\nthis is a long paragraph that passes the minLen check\n\ntiny";
    expect(splitIntoParagraphs(input, 40)).toEqual([
      "this is a long paragraph that passes the minLen check",
    ]);
  });

  it("trims whitespace inside paragraphs", () => {
    const input = "   hello world this is a decent length paragraph   ";
    expect(splitIntoParagraphs(input, 20)).toEqual([
      "hello world this is a decent length paragraph",
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(splitIntoParagraphs("", 10)).toEqual([]);
  });

  it("handles single-paragraph input", () => {
    const single = "a reasonably long single paragraph without splits";
    expect(splitIntoParagraphs(single, 20)).toEqual([single]);
  });
});

describe("filterParagraphsByKeyword", () => {
  it("keeps paragraphs with similarity >= threshold, removes below", () => {
    const paragraphs = ["relevant", "irrelevant"];
    const paragraphEmbeddings = [[1, 0], [0, 1]];
    const keywordEmbedding = [1, 0];

    const result = filterParagraphsByKeyword(
      paragraphs,
      paragraphEmbeddings,
      keywordEmbedding,
      0.5,
    );

    expect(result.kept).toEqual(["relevant"]);
    expect(result.removed).toHaveLength(1);
    expect(result.removed[0].text).toBe("irrelevant");
    expect(result.removed[0].score).toBeCloseTo(0, 6);
  });

  it("keeps paragraph exactly at threshold", () => {
    const paragraphs = ["at-threshold"];
    const paragraphEmbeddings = [[0.5, Math.sqrt(0.75)]];
    const keywordEmbedding = [1, 0];
    // similarity == 0.5

    const result = filterParagraphsByKeyword(
      paragraphs,
      paragraphEmbeddings,
      keywordEmbedding,
      0.5,
    );

    expect(result.kept).toEqual(["at-threshold"]);
    expect(result.removed).toHaveLength(0);
  });

  it("keeps all when all above threshold", () => {
    const paragraphs = ["a", "b", "c"];
    const paragraphEmbeddings = [[1, 0], [1, 0], [1, 0]];
    const keywordEmbedding = [1, 0];

    const result = filterParagraphsByKeyword(paragraphs, paragraphEmbeddings, keywordEmbedding, 0.5);
    expect(result.kept).toEqual(["a", "b", "c"]);
    expect(result.removed).toHaveLength(0);
  });

  it("removes all when all below threshold", () => {
    const paragraphs = ["a", "b"];
    const paragraphEmbeddings = [[0, 1], [0, 1]];
    const keywordEmbedding = [1, 0];

    const result = filterParagraphsByKeyword(paragraphs, paragraphEmbeddings, keywordEmbedding, 0.5);
    expect(result.kept).toEqual([]);
    expect(result.removed).toHaveLength(2);
  });

  it("returns empty result for empty input", () => {
    const result = filterParagraphsByKeyword([], [], [1, 0], 0.5);
    expect(result.kept).toEqual([]);
    expect(result.removed).toEqual([]);
  });
});
