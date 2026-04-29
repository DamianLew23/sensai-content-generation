import { describe, it, expect } from "vitest";
import { assemble, computeMainEntity, formatMeasurable } from "../tools/kg-assembler/kg-assembler";
import type {
  EntityExtractionResult,
  ExtractionResult,
  DataPoint,
} from "@sensai/shared";

const baseExtraction = (): ExtractionResult => ({
  metadata: {
    keyword: "kortyzol",
    language: "pl",
    sourceUrlCount: 2,
    createdAt: "2026-04-28T10:00:00.000Z",
  },
  facts: [
    { id: "F1", text: "Kortyzol jest wytwarzany przez nadnercza.", category: "definition", priority: "high", confidence: 0.95, sourceUrls: [] },
    { id: "F2", text: "Stres podnosi poziom kortyzolu.", category: "causal", priority: "medium", confidence: 0.9, sourceUrls: [] },
    { id: "F3", text: "Sen reguluje kortyzol.", category: "general", priority: "medium", confidence: 0.85, sourceUrls: [] },
    { id: "F4", text: "Magnez wspiera obniżenie kortyzolu.", category: "general", priority: "low", confidence: 0.7, sourceUrls: [] },
    { id: "F5", text: "Kortyzol jest najwyższy rano.", category: "general", priority: "medium", confidence: 0.8, sourceUrls: [] },
  ],
  data: [
    { id: "D1", definition: "Norma kortyzolu rano", value: "10-20", unit: "µg/dL", sourceUrls: [] },
    { id: "D2", definition: "Zalecany sen", value: "7-9", unit: "h", sourceUrls: [] },
    { id: "D3", definition: "Aktywność fizyczna", value: "150", unit: "min/tydz", sourceUrls: [] },
  ],
  ideations: [
    { id: "I1", type: "checklist", title: "Jak obniżyć kortyzol", description: "Plan tygodniowy", audience: "", channels: [], keywords: [], priority: "high" },
    { id: "I2", type: "info_box", title: "Sen a kortyzol", description: "Krótki opis", audience: "", channels: [], keywords: [], priority: "medium" },
    { id: "I3", type: "habit", title: "Poranna rutyna", description: "Rytuały na rano", audience: "", channels: [], keywords: [], priority: "low" },
  ],
});

const baseEntities = (): EntityExtractionResult => ({
  metadata: {
    keyword: "kortyzol",
    language: "pl",
    sourceUrlCount: 2,
    createdAt: "2026-04-28T10:00:00.000Z",
  },
  contextAnalysis: {
    mainTopicInterpretation: "Obniżanie kortyzolu po 40",
    domainSummary: "Endokrynologia, lifestyle",
    notes: "",
  },
  entities: [
    { id: "E1", originalSurface: "kortyzol", entity: "kortyzol", domainType: "CONCEPT", evidence: "Hormon stresu" },
    { id: "E2", originalSurface: "nadnercza", entity: "nadnercza", domainType: "CONCEPT", evidence: "Gruczoły wydzielania wewnętrznego" },
    { id: "E3", originalSurface: "stres", entity: "stres", domainType: "CONCEPT", evidence: "Stan napięcia" },
  ],
  relationships: [
    { source: "E2", target: "E1", type: "CREATED_BY", description: "nadnercza produkują kortyzol", evidence: "..." },
    { source: "E3", target: "E1", type: "REQUIRES", description: "stres podnosi kortyzol", evidence: "..." },
    { source: "E1", target: "E2", type: "CONNECTED_TO", description: "kortyzol jest powiązany z nadnerczami", evidence: "..." },
  ],
  relationToMain: [
    { entityId: "E1", score: 100, rationale: "główny temat" },
    { entityId: "E2", score: 80, rationale: "produkuje kortyzol" },
    { entityId: "E3", score: 70, rationale: "wpływa na poziom" },
  ],
});

describe("computeMainEntity", () => {
  it("returns the entity name with the most edges (source+target degree)", () => {
    const e = baseEntities();
    expect(computeMainEntity(e.entities, e.relationships)).toBe("kortyzol");
  });

  it("breaks ties by lowest entity id", () => {
    const entities = [
      { id: "E1", originalSurface: "a", entity: "a", domainType: "CONCEPT" as const, evidence: "x" },
      { id: "E2", originalSurface: "b", entity: "b", domainType: "CONCEPT" as const, evidence: "x" },
    ];
    const relationships = [
      { source: "E1", target: "E2", type: "RELATED_TO" as const, description: "d", evidence: "e" },
    ];
    expect(computeMainEntity(entities, relationships)).toBe("a");
  });

  it("falls back to first entity by id when relationships are empty", () => {
    const entities = [
      { id: "E2", originalSurface: "b", entity: "b", domainType: "CONCEPT" as const, evidence: "x" },
      { id: "E1", originalSurface: "a", entity: "a", domainType: "CONCEPT" as const, evidence: "x" },
    ];
    expect(computeMainEntity(entities, [])).toBe("a");
  });

  it("returns empty string when entities are empty", () => {
    expect(computeMainEntity([], [])).toBe("");
  });
});

describe("formatMeasurable", () => {
  it("formats with unit", () => {
    const dp: DataPoint = { id: "D1", definition: "Norma snu", value: "7-9", unit: "h", sourceUrls: [] };
    expect(formatMeasurable(dp)).toBe("Norma snu - [7-9][h]");
  });

  it("omits unit bracket when unit is null", () => {
    const dp: DataPoint = { id: "D2", definition: "Wskaźnik", value: "42", unit: null, sourceUrls: [] };
    expect(formatMeasurable(dp)).toBe("Wskaźnik - [42]");
  });
});

describe("assemble — relationships resolution", () => {
  it("enriches each relationship with sourceName and targetName", () => {
    const e = baseEntities();
    const x = baseExtraction();
    const kg = assemble({ keyword: "kortyzol", language: "pl", entities: e, extract: x });
    expect(kg.relationships).toHaveLength(3);
    const r0 = kg.relationships[0];
    expect(r0.source).toBe("E2");
    expect(r0.sourceName).toBe("nadnercza");
    expect(r0.target).toBe("E1");
    expect(r0.targetName).toBe("kortyzol");
  });

  it("drops relationships with unknown source/target and emits a warning", () => {
    const e = baseEntities();
    e.relationships.push({
      source: "E99",
      target: "E1",
      type: "RELATED_TO",
      description: "ghost",
      evidence: "—",
    });
    const x = baseExtraction();
    const kg = assemble({ keyword: "kortyzol", language: "pl", entities: e, extract: x });
    expect(kg.relationships).toHaveLength(3);
    expect(kg.warnings).toHaveLength(1);
    expect(kg.warnings[0].kind).toBe("relationship_unknown_source");
    expect(kg.warnings[0].context.source).toBe("E99");
  });

  it("drops self-edges and emits a warning", () => {
    const e = baseEntities();
    e.relationships.push({
      source: "E1",
      target: "E1",
      type: "RELATED_TO",
      description: "loop",
      evidence: "—",
    });
    const x = baseExtraction();
    const kg = assemble({ keyword: "kortyzol", language: "pl", entities: e, extract: x });
    expect(kg.warnings.find((w) => w.kind === "relationship_self_edge")).toBeDefined();
    expect(kg.relationships).toHaveLength(3);
  });
});

describe("assemble — meta and counts", () => {
  it("populates counts from inputs", () => {
    const e = baseEntities();
    const x = baseExtraction();
    const kg = assemble({ keyword: "kortyzol", language: "pl", entities: e, extract: x });
    expect(kg.meta.counts).toEqual({
      entities: 3,
      relationships: 3,
      facts: 5,
      measurables: 3,
      ideations: 3,
    });
    expect(kg.meta.mainKeyword).toBe("kortyzol");
    expect(kg.meta.language).toBe("pl");
    expect(kg.meta.category).toBe("");
    expect(kg.meta.mainEntity).toBe("kortyzol");
    expect(() => new Date(kg.meta.generatedAt).toISOString()).not.toThrow();
  });

  it("validates against the KnowledgeGraph zod schema", async () => {
    const { KnowledgeGraph } = await import("@sensai/shared");
    const e = baseEntities();
    const x = baseExtraction();
    const kg = assemble({ keyword: "kortyzol", language: "pl", entities: e, extract: x });
    const parsed = KnowledgeGraph.safeParse(kg);
    expect(parsed.success).toBe(true);
  });
});
