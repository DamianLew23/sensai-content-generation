import { describe, it, expect, vi, beforeEach } from "vitest";
import { EntityExtractorClient } from "../tools/entity-extractor/entity-extractor.client";
import { EntityExtractionResult } from "@sensai/shared";

const env = {
  ENTITY_EXTRACT_MODEL: "google/gemini-3-flash-preview",
  ENTITY_EXTRACT_MAX_INPUT_CHARS: 120_000,
} as const;

function makeSampleExtraction() {
  const entities = Array.from({ length: 8 }, (_, i) => ({
    id: `E${i + 1}`,
    originalSurface: `Surface ${i + 1}`,
    entity: `Entity ${i + 1}`,
    domainType: "CONCEPT" as const,
    evidence: `evidence ${i + 1}`,
  }));
  const relationships = Array.from({ length: 3 }, (_, i) => ({
    source: `E${i + 1}`,
    target: `E${i + 2}`,
    type: "RELATED_TO" as const,
    description: `desc ${i + 1}`,
    evidence: `ev ${i + 1}`,
  }));
  const relationToMain = entities.map((e, i) => ({
    entityId: e.id,
    score: 50 + i,
    rationale: `rationale ${i + 1}`,
  }));

  return EntityExtractionResult.parse({
    metadata: {
      keyword: "CD Projekt",
      language: "pl",
      sourceUrlCount: 2,
      createdAt: "2026-04-27T00:00:00.000Z",
    },
    contextAnalysis: {
      mainTopicInterpretation: "main topic",
      domainSummary: "domain summary",
      notes: "",
    },
    entities,
    relationships,
    relationToMain,
  });
}

describe("EntityExtractorClient", () => {
  let llm: { generateObject: ReturnType<typeof vi.fn> };
  let client: EntityExtractorClient;

  beforeEach(() => {
    llm = { generateObject: vi.fn() };
    client = new EntityExtractorClient(llm as any, env as any);
  });

  it("passes model from env and forwards system/prompt/schema", async () => {
    const sample = makeSampleExtraction();
    llm.generateObject.mockResolvedValueOnce({
      object: sample,
      model: env.ENTITY_EXTRACT_MODEL,
      promptTokens: 1500,
      completionTokens: 1200,
      costUsd: "0.003500",
      latencyMs: 1800,
    });

    const out = await client.extract({
      ctx: { runId: "r1", stepId: "s1", attempt: 1 },
      system: "SYSTEM",
      prompt: "USER_PROMPT",
    });

    expect(llm.generateObject).toHaveBeenCalledTimes(1);
    const call = llm.generateObject.mock.calls[0][0];
    expect(call.ctx.model).toBe("google/gemini-3-flash-preview");
    expect(call.ctx.runId).toBe("r1");
    expect(call.ctx.stepId).toBe("s1");
    expect(call.ctx.attempt).toBe(1);
    expect(call.system).toBe("SYSTEM");
    expect(call.prompt).toBe("USER_PROMPT");
    expect(call.schema).toBe(EntityExtractionResult);

    expect(out.result).toBe(sample);
    expect(out.costUsd).toBe("0.003500");
    expect(out.model).toBe("google/gemini-3-flash-preview");
    expect(out.promptTokens).toBe(1500);
    expect(out.completionTokens).toBe(1200);
    expect(out.latencyMs).toBe(1800);
  });

  it("throws when prompt exceeds ENTITY_EXTRACT_MAX_INPUT_CHARS", async () => {
    const huge = "x".repeat(env.ENTITY_EXTRACT_MAX_INPUT_CHARS + 1);
    await expect(
      client.extract({
        ctx: { runId: "r1", stepId: "s1", attempt: 1 },
        system: "SYSTEM",
        prompt: huge,
      }),
    ).rejects.toThrow(/exceeds.*ENTITY_EXTRACT_MAX_INPUT_CHARS/);
    expect(llm.generateObject).not.toHaveBeenCalled();
  });
});
