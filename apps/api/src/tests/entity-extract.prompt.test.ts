import { describe, it, expect } from "vitest";
import { entityExtractPrompt } from "../prompts/entity-extract.prompt";

describe("entityExtractPrompt.system", () => {
  it("names the role and forbids out-of-source content", () => {
    expect(entityExtractPrompt.system).toMatch(/semantic data analyst/i);
    expect(entityExtractPrompt.system).toMatch(/ONLY entities explicitly mentioned/i);
    expect(entityExtractPrompt.system).toMatch(/DO NOT invent/i);
  });

  it("declares allowed entity and relation types", () => {
    for (const t of ["PERSON", "ORGANIZATION", "LOCATION", "PRODUCT", "CONCEPT", "EVENT"]) {
      expect(entityExtractPrompt.system).toContain(t);
    }
    for (const r of ["PART_OF", "LOCATED_IN", "CREATED_BY", "WORKS_FOR", "RELATED_TO", "HAS_FEATURE", "SOLVES", "COMPETES_WITH", "CONNECTED_TO", "USED_BY", "REQUIRES"]) {
      expect(entityExtractPrompt.system).toContain(r);
    }
  });

  it("specifies the E<n> id format and graph-integrity rules", () => {
    expect(entityExtractPrompt.system).toMatch(/E1, E2/);
    expect(entityExtractPrompt.system).toMatch(/relationships.*entity ids/i);
    expect(entityExtractPrompt.system).toMatch(/relationToMain.*every entity/i);
  });
});

describe("entityExtractPrompt.user", () => {
  const basePages = [
    { url: "https://a.example.com/a", markdown: "Para 1\n\nPara 2 about CD Projekt" },
    { url: "https://b.example.com/b", markdown: "Another source about Wiedźmin" },
  ];

  it("includes keyword, language, minimums and separator markers", () => {
    const out = entityExtractPrompt.user({
      keyword: "CD Projekt",
      language: "pl",
      cleanedPages: basePages,
      deepResearch: undefined,
      minEntities: 10,
      minRelations: 5,
    });

    expect(out).toMatch(/Central keyword:\s*CD Projekt/);
    expect(out).toMatch(/Output language:\s*pl/);
    expect(out).toMatch(/at minimum 10 entities/i);
    expect(out).toMatch(/at minimum 5 relationships/i);
    expect(out).toContain("---");
    expect(out).toContain("https://a.example.com/a");
    expect(out).toContain("https://b.example.com/b");
    expect(out).toContain("Para 2 about CD Projekt");
  });

  it("includes deep research block when provided, before source pages", () => {
    const out = entityExtractPrompt.user({
      keyword: "CD Projekt",
      language: "pl",
      cleanedPages: basePages,
      deepResearch: {
        content: "DEEP_RESEARCH_BODY",
        sources: [{ url: "https://research.example.com/x", title: "Src", snippets: [] }],
      },
      minEntities: 10,
      minRelations: 5,
    });

    const drIdx = out.indexOf("DEEP_RESEARCH_BODY");
    const pageIdx = out.indexOf("https://a.example.com/a");
    expect(drIdx).toBeGreaterThan(-1);
    expect(pageIdx).toBeGreaterThan(-1);
    expect(drIdx).toBeLessThan(pageIdx);
    expect(out).toContain("https://research.example.com/x");
  });

  it("omits deep research block cleanly when not provided", () => {
    const out = entityExtractPrompt.user({
      keyword: "CD Projekt",
      language: "pl",
      cleanedPages: basePages,
      deepResearch: undefined,
      minEntities: 10,
      minRelations: 5,
    });
    expect(out).not.toMatch(/DEEP RESEARCH BRIEFING/i);
  });

  it("produces empty pages block when cleanedPages is empty but deep research is present", () => {
    const out = entityExtractPrompt.user({
      keyword: "CD Projekt",
      language: "pl",
      cleanedPages: [],
      deepResearch: { content: "DR", sources: [] },
      minEntities: 10,
      minRelations: 5,
    });
    expect(out).toContain("DR");
    expect(out).toMatch(/no source pages/i);
  });
});
