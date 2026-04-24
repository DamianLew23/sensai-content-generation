import { describe, it, expect } from "vitest";
import { contentExtractPrompt } from "../prompts/content-extract.prompt";

describe("contentExtractPrompt.system", () => {
  it("names the role and forbids out-of-source content", () => {
    expect(contentExtractPrompt.system).toMatch(/data analyst/i);
    expect(contentExtractPrompt.system).toMatch(/content editor/i);
    expect(contentExtractPrompt.system).toMatch(/do not.*outside/i);
  });

  it("declares the Definicja – Wartość – Jednostka format for data points", () => {
    expect(contentExtractPrompt.system).toMatch(/Definition.*Value.*Unit/);
  });

  it("signals exhaustive extraction (floor not ceiling, process per source)", () => {
    expect(contentExtractPrompt.system).toMatch(/completeness/i);
    expect(contentExtractPrompt.system).toMatch(/floor/i);
    expect(contentExtractPrompt.system).toMatch(/each SOURCE block/);
  });

  it("requires sourceUrls for priority high/medium", () => {
    expect(contentExtractPrompt.system).toMatch(/priority.*high.*medium.*source\s*URL/i);
  });
});

describe("contentExtractPrompt.user", () => {
  const basePages = [
    { url: "https://a.example.com/a", markdown: "Para 1\n\nPara 2 about cortisol" },
    { url: "https://b.example.com/b", markdown: "Another source about cortisol" },
  ];

  it("includes keyword, language, minimums and separator markers", () => {
    const out = contentExtractPrompt.user({
      keyword: "kortyzol",
      language: "pl",
      cleanedPages: basePages,
      deepResearch: undefined,
      minFacts: 5,
      minData: 3,
      minIdeations: 3,
    });

    expect(out).toMatch(/Central keyword:\s*kortyzol/);
    expect(out).toMatch(/Output language:\s*pl/);
    expect(out).toMatch(/at least 5 facts/i);
    expect(out).toMatch(/at least 3 data points/i);
    expect(out).toMatch(/at least 3 ideations/i);
    expect(out).toMatch(/FLOORS/);
    expect(out).toContain("---");
    expect(out).toContain("https://a.example.com/a");
    expect(out).toContain("https://b.example.com/b");
    expect(out).toContain("Para 2 about cortisol");
  });

  it("includes deep research block when provided, before source pages", () => {
    const out = contentExtractPrompt.user({
      keyword: "kortyzol",
      language: "pl",
      cleanedPages: basePages,
      deepResearch: {
        content: "DEEP_RESEARCH_BODY",
        sources: [{ url: "https://research.example.com/x", title: "Src", snippets: [] }],
      },
      minFacts: 5,
      minData: 3,
      minIdeations: 3,
    });

    const drIdx = out.indexOf("DEEP_RESEARCH_BODY");
    const pageIdx = out.indexOf("https://a.example.com/a");
    expect(drIdx).toBeGreaterThan(-1);
    expect(pageIdx).toBeGreaterThan(-1);
    expect(drIdx).toBeLessThan(pageIdx);
    expect(out).toContain("https://research.example.com/x");
  });

  it("omits deep research block cleanly when not provided", () => {
    const out = contentExtractPrompt.user({
      keyword: "kortyzol",
      language: "pl",
      cleanedPages: basePages,
      deepResearch: undefined,
      minFacts: 5,
      minData: 3,
      minIdeations: 3,
    });
    expect(out).not.toMatch(/DEEP RESEARCH BRIEFING/i);
  });

  it("produces empty pages block when cleanedPages is empty but deep research is present", () => {
    const out = contentExtractPrompt.user({
      keyword: "kortyzol",
      language: "pl",
      cleanedPages: [],
      deepResearch: { content: "DR", sources: [] },
      minFacts: 5,
      minData: 3,
      minIdeations: 3,
    });
    expect(out).toContain("DR");
    expect(out).toMatch(/no source pages/i);
  });
});
