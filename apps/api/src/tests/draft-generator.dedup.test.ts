import { describe, it, expect } from "vitest";
import { dedupeH3Facts } from "../tools/draft-generator/draft-generator.dedup";
import type { DistributionResult } from "@sensai/shared";

function makeFact(id: string, text: string) {
  return { id, text, category: "general" as const, priority: "medium" as const, confidence: 0.8, sourceUrls: [] };
}

describe("dedupeH3Facts", () => {
  it("removes H3 facts that duplicate parent H2 by first 80 chars (case-insensitive)", () => {
    const sections: DistributionResult["sections"] = [
      {
        type: "h2",
        order: 1,
        sectionVariant: "full",
        header: "Jak obniżyć kortyzol",
        sourceArea: "A1",
        sourceIntent: "Instrukcyjna",
        entities: [],
        facts: [makeFact("F1", "Ashwagandha obniża kortyzol o 11-32%.")],
        relationships: [],
        ideations: [],
        measurables: [],
        h3s: [
          {
            header: "Czy ashwagandha działa?",
            format: "question",
            sourcePaa: "...",
            entities: [],
            facts: [
              makeFact("F2", "ASHWAGANDHA OBNIŻA KORTYZOL O 11-32%."), // duplicate of F1
              makeFact("F3", "Magnez ma efekt komplementarny."),       // unique
            ],
            relationships: [],
            ideations: [],
            measurables: [],
          },
        ],
      } as any,
    ];

    const result = dedupeH3Facts(sections);

    expect(result.factsRemoved).toBe(1);
    expect(result.sections[0].h3s[0].facts).toHaveLength(1);
    expect(result.sections[0].h3s[0].facts[0].id).toBe("F3");
  });

  it("flags entities covered by parent H2 without removing them", () => {
    const sections: DistributionResult["sections"] = [
      {
        type: "h2",
        order: 1,
        sectionVariant: "full",
        header: "Adaptogeny",
        sourceArea: "A1",
        sourceIntent: "Definicyjna",
        entities: [{ id: "E1", entity: "Ashwagandha", domainType: "PRODUCT", evidence: "Adaptogen.", originalSurface: "Ashwagandha" }],
        facts: [],
        relationships: [],
        ideations: [],
        measurables: [],
        h3s: [
          {
            header: "Dawkowanie",
            format: "question",
            sourcePaa: "...",
            entities: [{ id: "E1", entity: "Ashwagandha", domainType: "PRODUCT", evidence: "Adaptogen.", originalSurface: "Ashwagandha" }],
            facts: [],
            relationships: [],
            ideations: [],
            measurables: [],
          },
        ],
      } as any,
    ];

    const result = dedupeH3Facts(sections);

    // entity stays in the array — module only marks coverage via returned set on the parent
    expect(result.sections[0].h3s[0].entities).toHaveLength(1);
    expect(result.factsRemoved).toBe(0);
  });

  it("returns intro sections unchanged", () => {
    const sections: DistributionResult["sections"] = [
      {
        type: "intro",
        order: 0,
        header: null,
        sectionVariant: null,
        h3s: [],
        entities: [],
        facts: [makeFact("F1", "Intro fact")],
        relationships: [],
        ideations: [],
        measurables: [],
      } as any,
    ];
    const result = dedupeH3Facts(sections);
    expect(result.factsRemoved).toBe(0);
    expect(result.sections[0].facts).toHaveLength(1);
  });
});
