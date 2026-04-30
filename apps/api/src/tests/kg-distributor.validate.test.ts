import { describe, it, expect } from "vitest";
import { validateDistribution } from "../tools/kg-distributor/kg-distributor.validate";
import type { SectionWithKG, KnowledgeGraph } from "@sensai/shared";

const mkSection = (overrides: Record<string, any> = {}): any => ({
  type: "h2",
  order: 1,
  sectionVariant: "full",
  header: "H2",
  sourceArea: "x",
  sourceIntent: "Instrukcyjna",
  h3s: [],
  entities: [],
  facts: [],
  relationships: [],
  ideations: [],
  measurables: [],
  ...overrides,
});

const mkKG = (counts = { e: 10, f: 10, r: 5, i: 5, m: 5 }): KnowledgeGraph => ({
  meta: {
    mainKeyword: "x", mainEntity: "x", category: "", language: "pl",
    generatedAt: "2026-04-29T10:00:00.000Z",
    counts: { entities: counts.e, relationships: counts.r, facts: counts.f, measurables: counts.m, ideations: counts.i },
  },
  entities: Array.from({ length: counts.e }, (_, i) => ({ id: `E${i+1}`, originalSurface: `e${i}`, entity: `e${i}`, domainType: "CONCEPT", evidence: "x" })),
  relationships: Array.from({ length: counts.r }, (_, i) => ({ id: `R${i+1}`, source: "E1", target: "E2", type: "RELATED_TO", description: "x", evidence: "x", sourceName: "e1", targetName: "e2" })),
  facts: Array.from({ length: counts.f }, (_, i) => ({ id: `F${i+1}`, text: `f${i}`, category: "general", priority: "medium", confidence: 0.9, sourceUrls: [] })),
  measurables: Array.from({ length: counts.m }, (_, i) => ({ id: `D${i+1}`, definition: "d", value: "v", unit: "u", sourceUrls: [], formatted: "x" })),
  ideations: Array.from({ length: counts.i }, (_, i) => ({ id: `I${i+1}`, type: "checklist", title: "t", description: "d", audience: "", channels: [], keywords: [], priority: "medium" })),
  warnings: [],
});

describe("validateDistribution", () => {
  it("computes per-category coverage and weighted overallPercent", () => {
    const sections: any[] = [
      mkSection({ type: "intro", order: 0, sectionVariant: null, header: null, sourceArea: undefined, entities: [{ id: "E1" } as any], facts: [{ id: "F1" } as any] }),
      mkSection({ entities: [{ id: "E2" } as any, { id: "E3" } as any], facts: [{ id: "F2" } as any], relationships: [{ id: "R1" } as any], ideations: [{ id: "I1" } as any], measurables: [{ id: "D1" } as any] }),
    ];
    const kg = mkKG({ e: 10, f: 10, r: 5, i: 5, m: 5 });
    const r = validateDistribution({ sections: sections as any, kg, minPercent: 50, maxPercent: 95 });
    expect(r.stats.coverage.entities.used).toBe(3);
    expect(r.stats.coverage.entities.total).toBe(10);
    expect(r.stats.coverage.facts.used).toBe(2);
    expect(r.stats.coverage.relationships.used).toBe(1);
    expect(r.stats.coverage.ideations.used).toBe(1);
    expect(r.stats.coverage.measurables.used).toBe(1);
  });

  it("emits distribution_low_coverage when below minPercent", () => {
    const sections: any[] = [mkSection({ type: "intro", order: 0, sectionVariant: null, header: null, sourceArea: undefined })];
    const kg = mkKG({ e: 10, f: 10, r: 5, i: 5, m: 5 });
    const r = validateDistribution({ sections: sections as any, kg, minPercent: 50, maxPercent: 95 });
    expect(r.warnings.some(w => w.kind === "distribution_low_coverage")).toBe(true);
  });

  it("emits distribution_high_coverage when above maxPercent", () => {
    const sections: any[] = [
      mkSection({
        entities: Array.from({ length: 10 }, (_, i) => ({ id: `E${i+1}` })) as any,
        facts: Array.from({ length: 10 }, (_, i) => ({ id: `F${i+1}` })) as any,
        relationships: Array.from({ length: 5 }, (_, i) => ({ id: `R${i+1}` })) as any,
        ideations: Array.from({ length: 5 }, (_, i) => ({ id: `I${i+1}` })) as any,
        measurables: Array.from({ length: 5 }, (_, i) => ({ id: `D${i+1}` })) as any,
      }),
    ];
    const kg = mkKG({ e: 10, f: 10, r: 5, i: 5, m: 5 });
    const r = validateDistribution({ sections: sections as any, kg, minPercent: 50, maxPercent: 95 });
    expect(r.warnings.some(w => w.kind === "distribution_high_coverage")).toBe(true);
  });

  it("emits distribution_intro_overload when intro has > 3 entities", () => {
    const sections: any[] = [
      mkSection({ type: "intro", order: 0, sectionVariant: null, header: null, sourceArea: undefined, entities: [{}, {}, {}, {}] }),
    ];
    const kg = mkKG();
    const r = validateDistribution({ sections: sections as any, kg, minPercent: 50, maxPercent: 95 });
    expect(r.warnings.some(w => w.kind === "distribution_intro_overload")).toBe(true);
  });

  it("emits distribution_intro_overload when intro has > 2 facts", () => {
    const sections: any[] = [
      mkSection({ type: "intro", order: 0, sectionVariant: null, header: null, sourceArea: undefined, facts: [{}, {}, {}] }),
    ];
    const kg = mkKG();
    const r = validateDistribution({ sections: sections as any, kg, minPercent: 50, maxPercent: 95 });
    expect(r.warnings.some(w => w.kind === "distribution_intro_overload")).toBe(true);
  });

  it("emits distribution_empty_full_section for full H2 with zero KG items", () => {
    const sections: any[] = [
      mkSection({ type: "intro", order: 0, sectionVariant: null, header: null, sourceArea: undefined }),
      mkSection({ order: 1, sectionVariant: "full" }), // empty
    ];
    const kg = mkKG();
    const r = validateDistribution({ sections: sections as any, kg, minPercent: 50, maxPercent: 95 });
    expect(r.warnings.some(w => w.kind === "distribution_empty_full_section")).toBe(true);
  });

  it("does NOT warn on empty context section (legal — context sections are minimal)", () => {
    const sections: any[] = [
      mkSection({ type: "intro", order: 0, sectionVariant: null, header: null, sourceArea: undefined, entities: [{}, {}], facts: [{}, {}] }),
      mkSection({ order: 2, sectionVariant: "context", sourceArea: undefined, groupedAreas: ["x"], contextNote: "n" }),
    ];
    const kg = mkKG({ e: 2, f: 2, r: 0, i: 0, m: 0 });
    const r = validateDistribution({ sections: sections as any, kg, minPercent: 50, maxPercent: 95 });
    expect(r.warnings.find(w => w.kind === "distribution_empty_full_section")).toBeUndefined();
  });
});
