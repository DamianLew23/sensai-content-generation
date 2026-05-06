import { describe, expect, it } from "vitest";
import { ProjectConfig, DisambiguateOutput, ResumeStepDto } from "../schemas";

describe("ProjectConfig (Plan 17 fields)", () => {
  it("defaults the new domain fields to empty when not provided", () => {
    const cfg = ProjectConfig.parse({});
    expect(cfg.productPitch).toBe("");
    expect(cfg.domain).toBe("");
    expect(cfg.keyTerms).toEqual([]);
    expect(cfg.antiTerms).toEqual([]);
    expect(cfg.competitors).toEqual([]);
  });

  it("preserves provided domain fields", () => {
    const cfg = ProjectConfig.parse({
      productPitch: "click2docs.pl to SaaS do generowania instrukcji aplikacji.",
      domain: "SaaS / dokumentacja",
      keyTerms: ["instrukcja aplikacji", "user guide"],
      antiTerms: ["urządzenia fizyczne", "AGD"],
      competitors: ["Tango", "Scribe"],
    });
    expect(cfg.productPitch).toMatch(/click2docs/);
    expect(cfg.keyTerms).toHaveLength(2);
    expect(cfg.antiTerms).toContain("AGD");
    expect(cfg.competitors).toContain("Tango");
  });
});

describe("DisambiguateOutput", () => {
  it("validates a complete output", () => {
    const out = DisambiguateOutput.parse({
      refinedTopic: "Jak napisać instrukcję obsługi aplikacji webowej",
      mainKeyword: "instrukcja obsługi aplikacji",
      intent: "informational",
      contentType: "how-to guide",
      researchQuestion: "Jak skutecznie napisać instrukcję obsługi aplikacji webowej dla użytkowników końcowych?",
      serpQueries: ["instrukcja obsługi aplikacji", "user guide aplikacja webowa", "jak pisać dokumentację SaaS"],
      antiAngles: ["urządzenia fizyczne", "AGD"],
      rationale: "Topic odnosi się do dokumentacji aplikacji w kontekście click2docs.pl, nie urządzeń.",
    });
    expect(out.intent).toBe("informational");
    expect(out.serpQueries).toHaveLength(3);
  });

  it("rejects invalid intent values", () => {
    expect(() =>
      DisambiguateOutput.parse({
        refinedTopic: "x", mainKeyword: "x", intent: "bogus",
        contentType: "x", researchQuestion: "x",
        serpQueries: ["a"], antiAngles: [], rationale: "x",
      }),
    ).toThrow();
  });

  it("requires at least one serpQuery and at most four", () => {
    const base = {
      refinedTopic: "x", mainKeyword: "x", intent: "informational" as const,
      contentType: "x", researchQuestion: "x", antiAngles: [], rationale: "x",
    };
    expect(() => DisambiguateOutput.parse({ ...base, serpQueries: [] })).toThrow();
    expect(() => DisambiguateOutput.parse({ ...base, serpQueries: ["a","b","c","d","e"] })).toThrow();
  });
});

describe("ResumeStepDto (Plan 17 — input optional)", () => {
  it("accepts the legacy scrape-style payload with input.urls", () => {
    const dto = ResumeStepDto.parse({ input: { urls: ["https://example.com"] } });
    expect(dto.input?.urls).toHaveLength(1);
  });

  it("accepts an empty payload (used by disambiguate / youcom / serp resumes)", () => {
    const dto = ResumeStepDto.parse({});
    expect(dto.input).toBeUndefined();
  });
});
