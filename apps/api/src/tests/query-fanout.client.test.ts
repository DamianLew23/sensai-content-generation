import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryFanOutClient } from "../tools/query-fanout/query-fanout.client";
import { FanOutClassifyCall, FanOutIntentsCall, FanOutPaaCall } from "@sensai/shared";

const env = {
  QUERY_FANOUT_MODEL: "openai/gpt-5",
  QUERY_FANOUT_LANGUAGE: "pl",
  QUERY_FANOUT_MAX_AREAS_PER_INTENT: 5,
  QUERY_FANOUT_REASONING_INTENTS: "medium",
  QUERY_FANOUT_REASONING_CLASSIFY: "high",
  QUERY_FANOUT_REASONING_PAA: "medium",
} as const;

const ctx = { runId: "run-1", stepId: "step-1", attempt: 1 };

const sampleIntents: FanOutIntentsCall = {
  normalization: { mainEntity: "kortyzol", category: "zdrowie", ymylRisk: true },
  intents: [
    {
      name: "Instrukcyjna",
      areas: [
        { id: "A1", topic: "Dieta", question: "Co jeść?", ymyl: true },
        { id: "A2", topic: "Sen", question: "Jak spać?", ymyl: true },
      ],
    },
  ],
};

const sampleClassify: FanOutClassifyCall = {
  classifications: [
    { areaId: "A1", classification: "MICRO", evergreenTopic: "", evergreenQuestion: "" },
    { areaId: "A2", classification: "MICRO", evergreenTopic: "", evergreenQuestion: "" },
  ],
  dominantIntent: "Instrukcyjna",
};

const samplePaa: FanOutPaaCall = {
  assignments: [{ areaId: "A1", question: "Co jeść żeby obniżyć kortyzol?" }],
  unmatched: ["Jak najszybciej zbić kortyzol?"],
};

function stats(extra: Record<string, unknown> = {}) {
  return {
    model: env.QUERY_FANOUT_MODEL,
    promptTokens: 100,
    completionTokens: 200,
    costUsd: "0.0025",
    latencyMs: 1500,
    ...extra,
  };
}

describe("QueryFanOutClient", () => {
  let llm: { generateObject: ReturnType<typeof vi.fn> };
  let client: QueryFanOutClient;

  beforeEach(() => {
    llm = { generateObject: vi.fn() };
    client = new QueryFanOutClient(llm as any, env as any);
  });

  describe("generateIntents", () => {
    it("forwards model, schema, language, maxAreas, and reasoning effort=medium", async () => {
      llm.generateObject.mockResolvedValueOnce({ object: sampleIntents, ...stats() });

      const out = await client.generateIntents({ ctx, keyword: "kortyzol" });

      expect(llm.generateObject).toHaveBeenCalledTimes(1);
      const call = llm.generateObject.mock.calls[0][0];
      expect(call.ctx.model).toBe("openai/gpt-5");
      expect(call.schema).toBe(FanOutIntentsCall);
      expect(call.system).toContain("maks. 5 obszarów");
      expect(call.prompt).toContain('"kortyzol"');
      expect(call.prompt).toContain("Język outputu: pl");
      expect(call.providerOptions).toEqual({
        openrouter: { reasoning: { effort: "medium" } },
      });
      expect(out.result).toEqual(sampleIntents);
      expect(out.costUsd).toBe("0.0025");
    });
  });

  describe("classify", () => {
    it("uses reasoning effort=high and embeds intentsJson in user prompt", async () => {
      llm.generateObject.mockResolvedValueOnce({ object: sampleClassify, ...stats() });

      const out = await client.classify({
        ctx,
        keyword: "Jak obniżyć kortyzol po 40tce?",
        intents: sampleIntents.intents,
      });

      expect(llm.generateObject).toHaveBeenCalledTimes(1);
      const call = llm.generateObject.mock.calls[0][0];
      expect(call.schema).toBe(FanOutClassifyCall);
      expect(call.providerOptions).toEqual({
        openrouter: { reasoning: { effort: "high" } },
      });
      expect(call.prompt).toContain('Główne zapytanie: "Jak obniżyć kortyzol po 40tce?"');
      expect(call.prompt).toContain('"id": "A1"');
      expect(call.prompt).toContain('"id": "A2"');
      expect(out.result).toEqual(sampleClassify);
    });
  });

  describe("assignPaa", () => {
    it("uses reasoning effort=medium, numbers PAA, and embeds areasJson", async () => {
      llm.generateObject.mockResolvedValueOnce({ object: samplePaa, ...stats() });

      const out = await client.assignPaa({
        ctx,
        keyword: "kortyzol",
        areas: [
          { id: "A1", topic: "Dieta", question: "Co jeść?" },
          { id: "A2", topic: "Sen", question: "Jak spać?" },
        ],
        paaQuestions: ["Co jeść żeby obniżyć kortyzol?", "Jak stres wpływa?"],
      });

      expect(llm.generateObject).toHaveBeenCalledTimes(1);
      const call = llm.generateObject.mock.calls[0][0];
      expect(call.schema).toBe(FanOutPaaCall);
      expect(call.providerOptions).toEqual({
        openrouter: { reasoning: { effort: "medium" } },
      });
      expect(call.prompt).toContain("1. Co jeść żeby obniżyć kortyzol?");
      expect(call.prompt).toContain("2. Jak stres wpływa?");
      expect(call.prompt).toContain('"id": "A1"');
      expect(out.result).toEqual(samplePaa);
    });
  });

  it("propagates ctx fields (runId, stepId, attempt) to LlmClient unchanged", async () => {
    llm.generateObject.mockResolvedValueOnce({ object: sampleIntents, ...stats() });

    await client.generateIntents({ ctx, keyword: "x" });

    const call = llm.generateObject.mock.calls[0][0];
    expect(call.ctx).toMatchObject({ runId: "run-1", stepId: "step-1", attempt: 1, model: "openai/gpt-5" });
  });
});
