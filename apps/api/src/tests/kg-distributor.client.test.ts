import { describe, it, expect, vi } from "vitest";
import { KGDistributorClient } from "../tools/kg-distributor/kg-distributor.client";
import { LLMDistributionMapping } from "../tools/kg-distributor/kg-distributor.types";

const mkOutline = () => ({
  meta: { keyword: "x", h1Title: "X", h1Source: "llm", language: "pl", primaryIntent: "Instrukcyjna", primaryIntentSource: "fanout", fullSectionsCount: 1, contextSectionsCount: 0, generatedAt: "2026-04-29T10:00:00.000Z", model: "x" },
  outline: [
    { type: "intro", order: 0, header: null, sectionVariant: null, h3s: [] },
    { type: "h2", order: 1, sectionVariant: "full", header: "H2", sourceArea: "snu", sourceIntent: "Instrukcyjna", h3s: [] },
  ],
  warnings: [],
} as any);

const mkKG = () => ({
  meta: { mainKeyword: "x", mainEntity: "x", category: "", language: "pl", generatedAt: "2026-04-29T10:00:00.000Z", counts: { entities: 1, relationships: 0, facts: 0, measurables: 0, ideations: 0 } },
  entities: [{ id: "E1", originalSurface: "x", entity: "x", domainType: "CONCEPT", evidence: "x" }],
  relationships: [],
  facts: [],
  measurables: [],
  ideations: [],
  warnings: [],
} as any);

describe("KGDistributorClient", () => {
  it("calls LlmClient.generateObject with correct model and schema", async () => {
    const mockLlm = { generateObject: vi.fn().mockResolvedValue({ object: { distribution: {} }, model: "google/gemini-3-flash-preview", promptTokens: 100, completionTokens: 50, costUsd: "0.001", latencyMs: 1000 }) };
    const env = { OUTLINE_DISTRIBUTE_MODEL: "google/gemini-3-flash-preview" };
    const client = new KGDistributorClient(mockLlm as any, env);

    await client.distribute({
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      outline: mkOutline(),
      kg: mkKG(),
    });

    expect(mockLlm.generateObject).toHaveBeenCalledTimes(1);
    const call = mockLlm.generateObject.mock.calls[0][0];
    expect(call.ctx.model).toBe("google/gemini-3-flash-preview");
    expect(call.schema).toBe(LLMDistributionMapping);
    expect(call.system).toContain("distribution expert");
    expect(call.prompt).toContain("E1");
  });

  it("does NOT pass providerOptions (gemini doesn't use reasoning_effort)", async () => {
    const mockLlm = { generateObject: vi.fn().mockResolvedValue({ object: { distribution: {} }, model: "google/gemini-3-flash-preview", promptTokens: 0, completionTokens: 0, costUsd: "0", latencyMs: 0 }) };
    const env = { OUTLINE_DISTRIBUTE_MODEL: "google/gemini-3-flash-preview" };
    const client = new KGDistributorClient(mockLlm as any, env);
    await client.distribute({
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      outline: mkOutline(),
      kg: mkKG(),
    });
    const call = mockLlm.generateObject.mock.calls[0][0];
    expect(call.providerOptions).toBeUndefined();
  });
});
