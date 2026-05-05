import { describe, expect, it } from "vitest";
import {
  computeSentenceStats,
  computeReadability,
  englishProbeHits,
  shouldRetry,
  formatBoldShare,
} from "../tools/article-humanize/article-humanize.metrics";

describe("computeSentenceStats", () => {
  it("returns zeros on empty text", () => {
    const s = computeSentenceStats("");
    expect(s.varianceOutput).toBe(0);
    expect(s.cvOutput).toBe(0);
    expect(s.minLength).toBe(0);
    expect(s.maxLength).toBe(0);
    expect(s.avgLength).toBe(0);
  });

  it("computes variance and CV for varied sentences", () => {
    // 3 sentences with 4 / 8 / 14 word counts → mean 8.667, sample variance ≈ 25.33,
    // stddev ≈ 5.033, cv ≈ 0.581.
    const text =
      "Krótko bardzo szybkie zdanie. " +
      "Średniej długości zdanie z paroma słowami w rzędzie. " +
      "Długie zdanie wielowątkowe które ma wiele słów subordynowanych w sobie i ciągnie się dalej.";
    const s = computeSentenceStats(text);
    expect(s.minLength).toBe(4);
    expect(s.maxLength).toBe(14);
    expect(s.avgLength).toBeCloseTo(8.67, 1);
    expect(s.cvOutput).toBeGreaterThan(0.4);
  });

  it("handles single sentence (variance = 0, cv = 0)", () => {
    const s = computeSentenceStats("Jedno krótkie zdanie tylko.");
    expect(s.varianceOutput).toBe(0);
    expect(s.cvOutput).toBe(0);
    expect(s.avgLength).toBe(4);
  });
});

describe("computeReadability", () => {
  it("counts words, sentences, ASL, strong spans, bold share", () => {
    const html =
      "<h1>T</h1>" +
      "<p>Pierwsze zdanie z czterema słowami.</p>" +
      "<p>Drugie <strong>kluczowe pojęcie</strong> w tekście.</p>";
    const r = computeReadability(html, /* sentenceHardCap */ 24);
    expect(r.wordsTotal).toBeGreaterThan(8);
    expect(r.sentencesTotal).toBe(2);
    expect(r.strongSpans).toBe(1);
    expect(r.boldTokenCount).toBe(2); // "kluczowe pojęcie"
    expect(r.boldShare).toBeCloseTo(2 / r.wordsTotal, 3);
    expect(r.longSentencesGtCap).toBe(0);
  });

  it("counts long sentences over hard cap", () => {
    const html = "<p>" + Array.from({ length: 30 }, (_, i) => `słowo${i}`).join(" ") + ".</p>";
    const r = computeReadability(html, 24);
    expect(r.longSentencesGtCap).toBe(1);
  });
});

describe("englishProbeHits", () => {
  it("returns 0 for clean Polish text", () => {
    const text = "Kortyzol to hormon stresu produkowany przez nadnercza w odpowiedzi na napięcie nerwowe.";
    expect(englishProbeHits(text)).toBe(0);
  });

  it("counts English connector tokens", () => {
    // Non-overlapping occurrences (countOccurrences advances by needle length, so
    // adjacent " the the " would only count once). " the " ×2 + " and " ×2 +
    // " this " ×2 + " that " ×2 + " however " ×1 = 9.
    const text = " the x and x this x that x however x the x and x this x that ";
    expect(englishProbeHits(text)).toBeGreaterThanOrEqual(8);
  });
});

describe("shouldRetry", () => {
  const baseConfig = {
    asl_max: 20,
    sentence_hard_cap: 24,
    min_strong_per_block: 1,
    retry_enabled: true,
  };

  it("returns false when all metrics are within bounds", () => {
    const ok = shouldRetry(
      {
        avgSentenceLength: 14,
        longSentencesGtCap: 0,
        strongSpans: 5,
        wordsTotal: 500,
        sentencesTotal: 30,
        boldTokenCount: 10,
        boldShare: 0.02,
      },
      baseConfig,
    );
    expect(ok.retry).toBe(false);
  });

  it("returns true when ASL too high", () => {
    const ok = shouldRetry(
      {
        avgSentenceLength: 22,
        longSentencesGtCap: 0,
        strongSpans: 5,
        wordsTotal: 500,
        sentencesTotal: 20,
        boldTokenCount: 10,
        boldShare: 0.02,
      },
      baseConfig,
    );
    expect(ok.retry).toBe(true);
    expect(ok.reasons).toContain("asl");
  });

  it("returns true when long sentences exceed cap", () => {
    const ok = shouldRetry(
      {
        avgSentenceLength: 14,
        longSentencesGtCap: 2,
        strongSpans: 5,
        wordsTotal: 500,
        sentencesTotal: 30,
        boldTokenCount: 10,
        boldShare: 0.02,
      },
      baseConfig,
    );
    expect(ok.retry).toBe(true);
    expect(ok.reasons).toContain("long");
  });

  it("returns true when strong spans below min", () => {
    const ok = shouldRetry(
      {
        avgSentenceLength: 14,
        longSentencesGtCap: 0,
        strongSpans: 0,
        wordsTotal: 500,
        sentencesTotal: 30,
        boldTokenCount: 0,
        boldShare: 0,
      },
      baseConfig,
    );
    expect(ok.retry).toBe(true);
    expect(ok.reasons).toContain("strong");
  });

  it("returns false when retry is disabled even if triggers fire", () => {
    const ok = shouldRetry(
      {
        avgSentenceLength: 25,
        longSentencesGtCap: 5,
        strongSpans: 0,
        wordsTotal: 500,
        sentencesTotal: 20,
        boldTokenCount: 0,
        boldShare: 0,
      },
      { ...baseConfig, retry_enabled: false },
    );
    expect(ok.retry).toBe(false);
  });
});

describe("formatBoldShare", () => {
  it("formats to 4 decimal places", () => {
    expect(formatBoldShare(0.0706123)).toBe("0.0706");
  });
});
