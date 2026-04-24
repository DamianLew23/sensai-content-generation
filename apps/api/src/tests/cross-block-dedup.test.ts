import { describe, it, expect } from "vitest";
import { deduplicateParagraphsAcrossBlocks } from "../tools/content-cleaner/cross-block-dedup";

describe("deduplicateParagraphsAcrossBlocks", () => {
  it("keeps first occurrence, removes duplicates in later blocks", () => {
    const input = [
      ["Paragraf o kortyzolu i jego wpływie na organizm człowieka długi tekst."],
      [
        "Paragraf o kortyzolu i jego wpływie na organizm człowieka długi tekst.",
        "Inny paragraf merytoryczny o stresie oksydacyjnym i walkach z wolnymi rodnikami.",
      ],
    ];

    const { blocks, removed } = deduplicateParagraphsAcrossBlocks(input);
    expect(removed).toBe(1);
    expect(blocks[0]).toHaveLength(1);
    expect(blocks[1]).toHaveLength(1);
    expect(blocks[1][0]).toContain("Inny paragraf");
  });

  it("normalizes whitespace and case for matching", () => {
    const input = [
      ["Hello World paragraph with some meaningful content here to pass minLen check."],
      ["hello  world  paragraph   with some meaningful content here to pass minLen check."],
    ];

    const { blocks, removed } = deduplicateParagraphsAcrossBlocks(input);
    expect(removed).toBe(1);
    expect(blocks[1]).toHaveLength(0);
  });

  it("returns zero removed when all paragraphs unique", () => {
    const input = [
      ["Unique paragraph one with long content that passes the typical check easily."],
      ["Unique paragraph two with different content that also passes the typical check."],
    ];

    const { blocks, removed } = deduplicateParagraphsAcrossBlocks(input);
    expect(removed).toBe(0);
    expect(blocks).toEqual(input);
  });

  it("handles empty blocks array", () => {
    const { blocks, removed } = deduplicateParagraphsAcrossBlocks([]);
    expect(blocks).toEqual([]);
    expect(removed).toBe(0);
  });

  it("preserves block structure (keeps empty blocks as empty arrays)", () => {
    const input = [["a long paragraph here."], [], ["b long paragraph here."]];
    const { blocks } = deduplicateParagraphsAcrossBlocks(input);
    expect(blocks).toHaveLength(3);
    expect(blocks[1]).toEqual([]);
  });
});
