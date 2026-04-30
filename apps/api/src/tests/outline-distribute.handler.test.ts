import { describe, it, expect, vi } from "vitest";
import { OutlineDistributeHandler } from "../handlers/outline-distribute.handler";
import type { OutlineGenerationResult, KnowledgeGraph, DistributionResult } from "@sensai/shared";

const mkOutline = (): OutlineGenerationResult => ({
  meta: { keyword: "x", h1Title: "X", h1Source: "llm", language: "pl", primaryIntent: "Instrukcyjna", primaryIntentSource: "fanout", fullSectionsCount: 1, contextSectionsCount: 0, generatedAt: "2026-04-29T10:00:00.000Z", model: "x" },
  outline: [
    { type: "intro", order: 0, header: null, sectionVariant: null, h3s: [] },
    { type: "h2", order: 1, sectionVariant: "full", header: "H2", sourceArea: "snu", sourceIntent: "Instrukcyjna", h3s: [] },
  ],
  warnings: [],
});

const mkKG = (): KnowledgeGraph => ({
  meta: { mainKeyword: "x", mainEntity: "x", category: "", language: "pl", generatedAt: "2026-04-29T10:00:00.000Z", counts: { entities: 1, relationships: 0, facts: 1, measurables: 0, ideations: 0 } },
  entities: [{ id: "E1", originalSurface: "x", entity: "x", domainType: "CONCEPT", evidence: "x" }],
  relationships: [],
  facts: [{ id: "F1", text: "f", category: "general", priority: "medium", confidence: 0.9, sourceUrls: [] }],
  measurables: [],
  ideations: [],
  warnings: [],
});

const mkCtx = (overrides: any = {}) => ({
  run: { id: "run-1", input: { topic: "x" } },
  step: { id: "step-1" },
  attempt: 1,
  project: {},
  previousOutputs: { outlineGen: mkOutline(), kg: mkKG(), ...overrides.previousOutputs },
  forceRefresh: false,
});

const mkClientResult = () => ({
  result: { distribution: { "0": { entityIds: [], factIds: [], relationshipIds: [], ideationIds: [], measurableIds: [] }, "1": { entityIds: ["E1"], factIds: ["F1"], relationshipIds: [], ideationIds: [], measurableIds: [] } } },
  model: "google/gemini-3-flash-preview",
  promptTokens: 100,
  completionTokens: 50,
  costUsd: "0.001",
  latencyMs: 1000,
});

const mkEnv = () => ({
  OUTLINE_DISTRIBUTE_TTL_DAYS: 7,
  OUTLINE_DISTRIBUTE_MODEL: "google/gemini-3-flash-preview",
  OUTLINE_COVERAGE_MIN_WARNING: 50,
  OUTLINE_COVERAGE_MAX_WARNING: 95,
});

const mkCache = () => ({
  getOrSet: vi.fn().mockImplementation(async (opts: any) => {
    const r = await opts.fetcher();
    return r.result;
  }),
});

describe("OutlineDistributeHandler", () => {
  it("happy path: parses inputs, calls LLM, runs merge+validate, returns DistributionResult", async () => {
    const client = { distribute: vi.fn().mockResolvedValue(mkClientResult()) };
    const cache = mkCache();
    const handler = new OutlineDistributeHandler(client as any, cache as any, mkEnv());
    const r = await handler.execute(mkCtx() as any);
    const output = r.output as DistributionResult;
    expect(output.sections).toHaveLength(2);
    expect(output.stats.coverage.entities.used).toBe(1);
    expect(client.distribute).toHaveBeenCalledTimes(1);
  });

  it("throws when previousOutputs.outlineGen is missing", async () => {
    const client = { distribute: vi.fn() };
    const cache = mkCache();
    const handler = new OutlineDistributeHandler(client as any, cache as any, mkEnv());
    await expect(handler.execute({ run: { id: "r", input: { topic: "x" } }, step: { id: "s" }, attempt: 1, project: {}, previousOutputs: { kg: mkKG() }, forceRefresh: false } as any))
      .rejects.toThrow(/previousOutputs.outlineGen/);
  });

  it("throws when previousOutputs.kg is missing", async () => {
    const client = { distribute: vi.fn() };
    const cache = mkCache();
    const handler = new OutlineDistributeHandler(client as any, cache as any, mkEnv());
    await expect(handler.execute({ run: { id: "r", input: { topic: "x" } }, step: { id: "s" }, attempt: 1, project: {}, previousOutputs: { outlineGen: mkOutline() }, forceRefresh: false } as any))
      .rejects.toThrow(/previousOutputs.kg/);
  });

  it("emits warning when LLM returns unknown entity ID, does not throw", async () => {
    const bad = { result: { distribution: { "1": { entityIds: ["E99"], factIds: [], relationshipIds: [], ideationIds: [], measurableIds: [] } } }, model: "x", promptTokens: 0, completionTokens: 0, costUsd: "0", latencyMs: 0 };
    const client = { distribute: vi.fn().mockResolvedValue(bad) };
    const cache = mkCache();
    const handler = new OutlineDistributeHandler(client as any, cache as any, mkEnv());
    const r = await handler.execute(mkCtx() as any);
    const output = r.output as DistributionResult;
    expect(output.warnings.some(w => w.kind === "distribution_unknown_entity_id")).toBe(true);
  });
});
