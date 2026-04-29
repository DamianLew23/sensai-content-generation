import { describe, it, expect } from "vitest";
import { KGAssemblyHandler } from "../handlers/kg-assembly.handler";
import type {
  EntityExtractionResult,
  ExtractionResult,
  RunInput,
} from "@sensai/shared";

const buildExtract = (): ExtractionResult => ({
  metadata: {
    keyword: "kortyzol",
    language: "pl",
    sourceUrlCount: 2,
    createdAt: "2026-04-28T10:00:00.000Z",
  },
  facts: Array.from({ length: 5 }, (_, i) => ({
    id: `F${i + 1}`,
    text: `Fact ${i + 1}`,
    category: "general" as const,
    priority: "medium" as const,
    confidence: 0.8,
    sourceUrls: [],
  })),
  data: [
    { id: "D1", definition: "Norma", value: "7-9", unit: "h", sourceUrls: [] },
    { id: "D2", definition: "Wskaźnik", value: "42", unit: null, sourceUrls: [] },
    { id: "D3", definition: "Próg", value: "100", unit: "mg", sourceUrls: [] },
  ],
  ideations: Array.from({ length: 3 }, (_, i) => ({
    id: `I${i + 1}`,
    type: "checklist" as const,
    title: `Idea ${i + 1}`,
    description: "desc",
    audience: "",
    channels: [],
    keywords: [],
    priority: "medium" as const,
  })),
});

const buildEntities = (): EntityExtractionResult => ({
  metadata: {
    keyword: "kortyzol",
    language: "pl",
    sourceUrlCount: 2,
    createdAt: "2026-04-28T10:00:00.000Z",
  },
  contextAnalysis: {
    mainTopicInterpretation: "x",
    domainSummary: "y",
    notes: "",
  },
  entities: Array.from({ length: 8 }, (_, i) => ({
    id: `E${i + 1}`,
    originalSurface: `e${i + 1}`,
    entity: `e${i + 1}`,
    domainType: "CONCEPT" as const,
    evidence: "evidence",
  })),
  relationships: [
    { source: "E1", target: "E2", type: "RELATED_TO" as const, description: "d", evidence: "e" },
    { source: "E2", target: "E3", type: "RELATED_TO" as const, description: "d", evidence: "e" },
    { source: "E1", target: "E3", type: "RELATED_TO" as const, description: "d", evidence: "e" },
  ],
  relationToMain: Array.from({ length: 8 }, (_, i) => ({
    entityId: `E${i + 1}`,
    score: 50,
    rationale: "r",
  })),
});

const baseCtx = (entities: unknown, extract: unknown) =>
  ({
    run: {
      id: "run-1",
      input: {
        topic: "jak obniżyć kortyzol po 40",
        mainKeyword: "kortyzol",
        intent: "informational",
      } satisfies RunInput,
    },
    step: { id: "step-kg" },
    project: { id: "p", config: {} },
    previousOutputs: { entities, extract },
    attempt: 1,
  }) as any;

describe("KGAssemblyHandler", () => {
  it("declares the correct step type", () => {
    const h = new KGAssemblyHandler();
    expect(h.type).toBe("tool.kg.assemble");
  });

  it("assembles a KnowledgeGraph from entities + extract", async () => {
    const h = new KGAssemblyHandler();
    const result = await h.execute(baseCtx(buildEntities(), buildExtract()));
    const kg = result.output as any;
    expect(kg.meta.counts.entities).toBe(8);
    expect(kg.meta.counts.relationships).toBe(3);
    expect(kg.meta.counts.facts).toBe(5);
    expect(kg.meta.counts.measurables).toBe(3);
    expect(kg.meta.counts.ideations).toBe(3);
    expect(kg.meta.mainKeyword).toMatch(/jak obniżyć kortyzol po 40/);
    expect(kg.meta.language).toBe("pl");
    expect(kg.meta.category).toBe("");
    expect(kg.warnings).toEqual([]);
  });

  it("throws when previousOutputs.entities is missing", async () => {
    const h = new KGAssemblyHandler();
    await expect(h.execute(baseCtx(undefined, buildExtract()))).rejects.toThrow(
      /requires previousOutputs\.entities/,
    );
  });

  it("throws when previousOutputs.extract is missing", async () => {
    const h = new KGAssemblyHandler();
    await expect(h.execute(baseCtx(buildEntities(), undefined))).rejects.toThrow(
      /requires previousOutputs\.extract/,
    );
  });

  it("throws when entities fails Zod parse", async () => {
    const h = new KGAssemblyHandler();
    await expect(
      h.execute(baseCtx({ entities: "not-an-object" }, buildExtract())),
    ).rejects.toThrow();
  });

  it("composes meta.language from entities metadata", async () => {
    const h = new KGAssemblyHandler();
    const e = buildEntities();
    e.metadata.language = "en";
    const result = await h.execute(baseCtx(e, buildExtract()));
    expect((result.output as any).meta.language).toBe("en");
  });
});
