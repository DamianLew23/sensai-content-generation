import { describe, it, expect, vi } from "vitest";
import { DraftGenerateHandler } from "../handlers/draft-generate.handler";
import type { DraftGeneratorClient } from "../tools/draft-generator/draft-generator.client";
import type { ToolCacheService } from "../tools/tool-cache.service";

function fakeDistribution() {
  return {
    meta: {
      keyword: "kortyzol",
      h1Title: "Jak obniżyć kortyzol",
      language: "pl",
      primaryIntent: "Instrukcyjna",
      generatedAt: new Date().toISOString(),
      model: "gemini",
    },
    sections: [
      { type: "intro", order: 0, header: null, sectionVariant: null, h3s: [], entities: [], facts: [], relationships: [], ideations: [], measurables: [] },
      { type: "h2", order: 1, sectionVariant: "full", header: "Jak obniżyć kortyzol", sourceArea: "A1", sourceIntent: "Instrukcyjna", entities: [], facts: [], relationships: [], ideations: [], measurables: [], h3s: [] },
    ],
    unused: { entityIds: [], factIds: [], relationshipIds: [], ideationIds: [], measurableIds: [] },
    stats: { coverage: { entities: { used: 0, total: 0, percent: 100 }, facts: { used: 0, total: 0, percent: 100 }, relationships: { used: 0, total: 0, percent: 100 }, ideations: { used: 0, total: 0, percent: 100 }, measurables: { used: 0, total: 0, percent: 100 }, overallPercent: 100 } },
    warnings: [],
  };
}

describe("DraftGenerateHandler.execute", () => {
  it("throws when previousOutputs.distribute is missing", async () => {
    const client = { generate: vi.fn() } as unknown as DraftGeneratorClient;
    const cache = { getOrSet: vi.fn() } as unknown as ToolCacheService;
    const handler = new DraftGenerateHandler(client, cache, {
      DRAFT_GENERATE_MODEL: "gpt-5.2",
      DRAFT_GENERATE_USE_REASONING: true,
      DRAFT_GENERATE_REASONING_EFFORT: "medium",
      DRAFT_GENERATE_VERBOSITY: "medium",
      DRAFT_GENERATE_TTL_DAYS: 7,
    } as any);

    await expect(
      handler.execute({
        run: { id: "r", input: {} },
        step: { id: "s" },
        project: { id: "p", config: {} },
        previousOutputs: {},
        attempt: 1,
        forceRefresh: false,
      } as any),
    ).rejects.toThrow(/draft\.generate requires previousOutputs\.distribute/);
  });

  it("calls cache.getOrSet and returns the resulting DraftGenerationResult", async () => {
    const dist = fakeDistribution();
    const client = {
      generate: vi.fn().mockResolvedValue({
        htmlChunks: ["<p>Intro</p>", "<h2>X</h2>"],
        blocks: [
          { sectionOrder: 0, sectionType: "intro", sectionVariant: null, header: null, passageTrigger: "instruction", charCount: 10, responseId: "r1", promptTokens: 1, completionTokens: 1, costUsd: "0.001", latencyMs: 1 },
          { sectionOrder: 1, sectionType: "h2", sectionVariant: "full", header: "X", passageTrigger: "instruction", charCount: 10, responseId: "r2", promptTokens: 1, completionTokens: 1, costUsd: "0.001", latencyMs: 1 },
        ],
        imagePrompts: [],
        warnings: [],
      }),
    } as unknown as DraftGeneratorClient;

    const cache = {
      getOrSet: vi.fn(async (args: any) => (await args.fetcher()).result),
    } as unknown as ToolCacheService;

    const handler = new DraftGenerateHandler(client, cache, {
      DRAFT_GENERATE_MODEL: "gpt-5.2",
      DRAFT_GENERATE_USE_REASONING: true,
      DRAFT_GENERATE_REASONING_EFFORT: "medium",
      DRAFT_GENERATE_VERBOSITY: "medium",
      DRAFT_GENERATE_TTL_DAYS: 7,
    } as any);

    const res = await handler.execute({
      run: { id: "r", input: {} },
      step: { id: "s" },
      project: { id: "p", config: {} },
      previousOutputs: { distribute: dist },
      attempt: 1,
      forceRefresh: false,
    } as any);

    const out = res.output as any;
    expect(out.meta.h1Title).toBe("Jak obniżyć kortyzol");
    expect(out.htmlContent.startsWith("<h1>Jak obniżyć kortyzol</h1>")).toBe(true);
    expect(out.blocks).toHaveLength(2);
    expect(out.stats.blockCount).toBe(2);
  });
});
