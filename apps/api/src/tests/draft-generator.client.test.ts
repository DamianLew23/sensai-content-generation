import { describe, it, expect, vi } from "vitest";
import { DraftGeneratorClient } from "../tools/draft-generator/draft-generator.client";
import type { OpenAIResponsesClient } from "../llm/openai-responses.client";
import type { DistributionResult } from "@sensai/shared";

function fakeDistribution(): DistributionResult {
  return {
    meta: {
      keyword: "kortyzol",
      h1Title: "Jak obniżyć kortyzol po 40-tce",
      language: "pl",
      primaryIntent: "Instrukcyjna",
      generatedAt: new Date().toISOString(),
      model: "gemini",
    },
    sections: [
      { type: "intro", order: 0, header: null, sectionVariant: null, h3s: [], entities: [], facts: [], relationships: [], ideations: [], measurables: [] } as any,
      {
        type: "h2",
        order: 1,
        sectionVariant: "full",
        header: "Jak obniżyć kortyzol",
        sourceArea: "A1",
        sourceIntent: "Instrukcyjna",
        entities: [],
        facts: [],
        relationships: [],
        ideations: [],
        measurables: [],
        h3s: [],
      } as any,
    ],
    unused: { entityIds: [], factIds: [], relationshipIds: [], ideationIds: [], measurableIds: [] },
    stats: { coverage: { entities: { used: 0, total: 0, percent: 100 }, facts: { used: 0, total: 0, percent: 100 }, relationships: { used: 0, total: 0, percent: 100 }, ideations: { used: 0, total: 0, percent: 100 }, measurables: { used: 0, total: 0, percent: 100 }, overallPercent: 100 } },
    warnings: [],
  };
}

describe("DraftGeneratorClient.generate", () => {
  it("calls openai once per section and chains response IDs", async () => {
    const responses = ["<p>Intro</p>", "<h2>Jak obniżyć kortyzol</h2><p>Body</p>"];
    let callIdx = 0;
    const createBlock = vi.fn().mockImplementation(async (args) => ({
      id: `resp_${callIdx + 1}`,
      outputText: responses[callIdx++],
      model: args.model,
      promptTokens: 100,
      completionTokens: 200,
      costUsd: "0.01",
      latencyMs: 1000,
    }));
    const sdk = { createBlock } as unknown as OpenAIResponsesClient;

    const client = new DraftGeneratorClient(sdk, {
      DRAFT_GENERATE_MODEL: "gpt-5.2",
      DRAFT_GENERATE_USE_REASONING: true,
      DRAFT_GENERATE_REASONING_EFFORT: "medium",
      DRAFT_GENERATE_VERBOSITY: "medium",
      DRAFT_GENERATE_BLOCK_DELAY_MS: 0,
    } as any);

    const result = await client.generate({
      ctx: { runId: "r1", stepId: "s1", attempt: 1 },
      distribution: fakeDistribution(),
    });

    expect(createBlock).toHaveBeenCalledTimes(2);
    expect(createBlock.mock.calls[0][0].previousResponseId).toBeUndefined();
    expect(createBlock.mock.calls[1][0].previousResponseId).toBe("resp_1");
    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[1].responseId).toBe("resp_2");
    expect(result.htmlChunks).toEqual(responses);
  });

  it("disables chaining and reasoning when USE_REASONING=false and emits a warning", async () => {
    const createBlock = vi.fn().mockResolvedValue({
      id: "r",
      outputText: "<p>x</p>",
      model: "claude-3",
      promptTokens: 1,
      completionTokens: 1,
      costUsd: "0",
      latencyMs: 1,
    });
    const sdk = { createBlock } as any;

    const client = new DraftGeneratorClient(sdk, {
      DRAFT_GENERATE_MODEL: "claude-3-haiku",
      DRAFT_GENERATE_USE_REASONING: false,
      DRAFT_GENERATE_REASONING_EFFORT: "medium",
      DRAFT_GENERATE_VERBOSITY: "medium",
      DRAFT_GENERATE_BLOCK_DELAY_MS: 0,
    } as any);

    const result = await client.generate({
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      distribution: fakeDistribution(),
    });

    expect(createBlock.mock.calls[0][0].previousResponseId).toBeUndefined();
    expect(createBlock.mock.calls[1][0].previousResponseId).toBeUndefined();
    expect(createBlock.mock.calls[0][0].reasoning).toBeUndefined();
    expect(result.warnings.some((w) => w.kind === "draft_chaining_disabled")).toBe(true);
  });
});
