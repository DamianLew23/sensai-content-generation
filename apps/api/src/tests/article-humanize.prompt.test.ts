import { describe, expect, it } from "vitest";
import {
  buildHumanizeSystemPrompt,
  buildHumanizeRetryPrompt,
} from "../prompts/article-humanize.prompt";

describe("buildHumanizeSystemPrompt", () => {
  it("substitutes language label and readability params", () => {
    const p = buildHumanizeSystemPrompt({
      language: "pl",
      asl_min: 12,
      asl_max: 20,
      sentence_hard_cap: 24,
      min_strong_per_block: 1,
      max_strong_per_block: 4,
      strong_words_per_block: 500,
    });
    expect(p).toContain("Polish article");
    expect(p).toContain("Split any sentence over 24 words");
    expect(p).toContain("12-20 words per sentence");
    expect(p).toContain("1-4 per ~500 words");
  });

  it("uses span-based number safety wording (not [[NUM_X]])", () => {
    const p = buildHumanizeSystemPrompt({
      language: "pl",
      asl_min: 12,
      asl_max: 20,
      sentence_hard_cap: 24,
      min_strong_per_block: 1,
      max_strong_per_block: 4,
      strong_words_per_block: 500,
    });
    expect(p).toContain('<span data-token-id="...">');
    expect(p).not.toContain("[[NUM_X]]");
  });

  it("includes all four tier headers", () => {
    const p = buildHumanizeSystemPrompt({
      language: "pl",
      asl_min: 12,
      asl_max: 20,
      sentence_hard_cap: 24,
      min_strong_per_block: 1,
      max_strong_per_block: 4,
      strong_words_per_block: 500,
    });
    expect(p).toContain("TIER 1: CRITICAL SIGNALS");
    expect(p).toContain("TIER 2: STRUCTURAL PATTERNS");
    expect(p).toContain("TIER 3: VOICE & TONE");
    expect(p).toContain("TIER 4: AI DETECTOR SIGNALS");
  });

  it("preserves the SRC placeholder safety section", () => {
    const p = buildHumanizeSystemPrompt({
      language: "pl",
      asl_min: 12,
      asl_max: 20,
      sentence_hard_cap: 24,
      min_strong_per_block: 1,
      max_strong_per_block: 4,
      strong_words_per_block: 500,
    });
    expect(p).toContain("[[SRC_xxx]]");
  });

  it("uses English label when language=en", () => {
    const p = buildHumanizeSystemPrompt({
      language: "en",
      asl_min: 12,
      asl_max: 20,
      sentence_hard_cap: 24,
      min_strong_per_block: 1,
      max_strong_per_block: 4,
      strong_words_per_block: 500,
    });
    expect(p).toContain("English article");
  });
});

describe("buildHumanizeRetryPrompt", () => {
  it("contains hard-cap split instruction with cap value", () => {
    const p = buildHumanizeRetryPrompt({
      asl_min: 12,
      asl_max: 20,
      sentence_hard_cap: 24,
      min_strong_per_block: 1,
      max_strong_per_block: 4,
      strong_words_per_block: 500,
    });
    expect(p).toContain("Split any sentence longer than 24 words");
    expect(p).toContain("12-20 words");
    expect(p).toContain("1-4 per ~500 words");
  });

  it("instructs to keep span and SRC tokens intact", () => {
    const p = buildHumanizeRetryPrompt({
      asl_min: 12,
      asl_max: 20,
      sentence_hard_cap: 24,
      min_strong_per_block: 1,
      max_strong_per_block: 4,
      strong_words_per_block: 500,
    });
    expect(p).toContain('<span data-token-id="...">');
    expect(p).toContain("[[SRC_xxx]]");
  });
});
