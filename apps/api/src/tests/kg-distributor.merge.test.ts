import { describe, it, expect } from "vitest";
import { mergeDistribution } from "../tools/kg-distributor/kg-distributor.merge";
import type { OutlineGenerationResult, KnowledgeGraph } from "@sensai/shared";
import type { LLMDistributionMapping } from "../tools/kg-distributor/kg-distributor.types";

const mkOutline = (): OutlineGenerationResult => ({
  meta: {
    keyword: "kortyzol", h1Title: "X", h1Source: "llm", language: "pl",
    primaryIntent: "Instrukcyjna", primaryIntentSource: "fanout",
    fullSectionsCount: 1, contextSectionsCount: 1,
    generatedAt: "2026-04-29T10:00:00.000Z", model: "openai/gpt-5.4",
  },
  outline: [
    { type: "intro", order: 0, header: null, sectionVariant: null, h3s: [] },
    { type: "h2", order: 1, sectionVariant: "full", header: "H2 jeden", sourceArea: "snu", sourceIntent: "Instrukcyjna", h3s: [] },
    { type: "h2", order: 2, sectionVariant: "context", header: "H2 dwa", sourceIntent: "Diagnostyczna", groupedAreas: ["badanie"], contextNote: "krótko", h3s: [] },
  ],
  warnings: [],
});

const mkKG = (): KnowledgeGraph => ({
  meta: {
    mainKeyword: "kortyzol", mainEntity: "kortyzol", category: "", language: "pl",
    generatedAt: "2026-04-29T10:00:00.000Z",
    counts: { entities: 3, relationships: 1, facts: 2, measurables: 1, ideations: 1 },
  },
  entities: [
    { id: "E1", originalSurface: "kortyzol", entity: "kortyzol", domainType: "CONCEPT", evidence: "x" },
    { id: "E2", originalSurface: "sen", entity: "sen", domainType: "CONCEPT", evidence: "x" },
    { id: "E3", originalSurface: "ashwagandha", entity: "ashwagandha", domainType: "CONCEPT", evidence: "x" },
  ],
  relationships: [
    { id: "R1", source: "E1", target: "E2", type: "RELATED_TO", description: "x", evidence: "x", sourceName: "kortyzol", targetName: "sen" },
  ],
  facts: [
    { id: "F1", text: "fakt 1", category: "general", priority: "medium", confidence: 0.9, sourceUrls: [] },
    { id: "F2", text: "fakt 2", category: "general", priority: "medium", confidence: 0.9, sourceUrls: [] },
  ],
  measurables: [
    { id: "D1", definition: "norma", value: "1", unit: "j", sourceUrls: [], formatted: "norma - [1][j]" },
  ],
  ideations: [
    { id: "I1", type: "checklist", title: "T", description: "D", audience: "", channels: [], keywords: [], priority: "medium" },
  ],
  warnings: [],
});

const mkMapping = (overrides?: Partial<LLMDistributionMapping["distribution"]>): LLMDistributionMapping => ({
  distribution: {
    "0": { entityIds: ["E1"], factIds: ["F1"], relationshipIds: [], ideationIds: [], measurableIds: [] },
    "1": { entityIds: ["E2"], factIds: ["F2"], relationshipIds: ["R1"], ideationIds: ["I1"], measurableIds: ["D1"] },
    "2": { entityIds: [], factIds: [], relationshipIds: [], ideationIds: [], measurableIds: [] },
    ...overrides,
  },
});

describe("mergeDistribution", () => {
  it("resolves IDs to full objects and inlines them per section", () => {
    const r = mergeDistribution({ outline: mkOutline(), kg: mkKG(), mapping: mkMapping() });
    expect(r.sections).toHaveLength(3);
    expect(r.sections[0].entities[0].id).toBe("E1");
    expect(r.sections[0].entities[0].entity).toBe("kortyzol");
    expect(r.sections[1].entities[0].id).toBe("E2");
    expect(r.sections[1].relationships[0].id).toBe("R1");
    expect(r.sections[1].ideations[0].id).toBe("I1");
    expect(r.sections[1].measurables[0].id).toBe("D1");
  });

  it("emits distribution_unknown_*_id warning when LLM returns unknown ID", () => {
    const m = mkMapping({ "1": { entityIds: ["E99"], factIds: [], relationshipIds: [], ideationIds: [], measurableIds: [] } });
    const r = mergeDistribution({ outline: mkOutline(), kg: mkKG(), mapping: m });
    expect(r.sections[1].entities).toHaveLength(0);
    expect(r.warnings.some(w => w.kind === "distribution_unknown_entity_id" && w.context.id === "E99")).toBe(true);
  });

  it("dedups: same ID in two sections — keeps in lower order, drops from higher, emits warning", () => {
    const m = mkMapping({
      "0": { entityIds: ["E1"], factIds: [], relationshipIds: [], ideationIds: [], measurableIds: [] },
      "1": { entityIds: ["E1"], factIds: [], relationshipIds: [], ideationIds: [], measurableIds: [] },
    });
    const r = mergeDistribution({ outline: mkOutline(), kg: mkKG(), mapping: m });
    expect(r.sections[0].entities).toHaveLength(1);
    expect(r.sections[1].entities).toHaveLength(0);
    expect(r.warnings.some(w => w.kind === "distribution_duplicate_entity")).toBe(true);
  });

  it("computes unused: IDs not referenced anywhere", () => {
    const m = mkMapping({
      "0": { entityIds: [], factIds: [], relationshipIds: [], ideationIds: [], measurableIds: [] },
      "1": { entityIds: ["E1"], factIds: [], relationshipIds: [], ideationIds: [], measurableIds: [] },
      "2": { entityIds: [], factIds: [], relationshipIds: [], ideationIds: [], measurableIds: [] },
    });
    const r = mergeDistribution({ outline: mkOutline(), kg: mkKG(), mapping: m });
    expect(r.unused.entityIds.sort()).toEqual(["E2", "E3"].sort());
    expect(r.unused.factIds.sort()).toEqual(["F1", "F2"].sort());
    expect(r.unused.relationshipIds).toEqual(["R1"]);
    expect(r.unused.ideationIds).toEqual(["I1"]);
    expect(r.unused.measurableIds).toEqual(["D1"]);
  });

  it("creates empty SectionWithKG for sections with no mapping entry", () => {
    const m: LLMDistributionMapping = { distribution: {} };
    const r = mergeDistribution({ outline: mkOutline(), kg: mkKG(), mapping: m });
    expect(r.sections).toHaveLength(3);
    for (const s of r.sections) {
      expect(s.entities).toEqual([]);
      expect(s.facts).toEqual([]);
    }
  });

  it("preserves section order from outline", () => {
    const r = mergeDistribution({ outline: mkOutline(), kg: mkKG(), mapping: mkMapping() });
    expect(r.sections.map(s => s.order)).toEqual([0, 1, 2]);
  });

  it("preserves section discriminator fields (type, sectionVariant, header)", () => {
    const r = mergeDistribution({ outline: mkOutline(), kg: mkKG(), mapping: mkMapping() });
    expect(r.sections[0].type).toBe("intro");
    expect(r.sections[1].type).toBe("h2");
    expect((r.sections[1] as Extract<typeof r.sections[number], { type: "h2" }>).sectionVariant).toBe("full");
    expect((r.sections[2] as Extract<typeof r.sections[number], { type: "h2" }>).sectionVariant).toBe("context");
  });
});
