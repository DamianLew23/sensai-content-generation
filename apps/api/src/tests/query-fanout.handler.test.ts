import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryFanOutHandler } from "../handlers/query-fanout.handler";
import type { StepContext } from "../orchestrator/step-handler";
import type { FanOutClassifyCall, FanOutIntentsCall, FanOutPaaCall } from "@sensai/shared";

const env = {
  QUERY_FANOUT_LANGUAGE: "pl",
  QUERY_FANOUT_MODEL: "openai/gpt-5",
  QUERY_FANOUT_PAA_DEPTH: 2,
  QUERY_FANOUT_PAA_MAX_QUESTIONS: 20,
  QUERY_FANOUT_PAA_ENABLED: true,
} as any;

function makeCtx(overrides: Partial<StepContext> = {}): StepContext {
  return {
    run: {
      id: "run-1",
      input: { topic: "Jak obniżyć kortyzol po 40tce?" },
    } as any,
    step: { id: "step-1" } as any,
    project: {
      id: "proj-1",
      name: "Demo",
      config: { toneOfVoice: "", targetAudience: "", guidelines: "", defaultModels: {}, promptOverrides: {} },
    } as any,
    previousOutputs: {},
    attempt: 1,
    ...overrides,
  };
}

const intentsResult: FanOutIntentsCall = {
  normalization: { mainEntity: "kortyzol", category: "zdrowie", ymylRisk: true },
  intents: [
    {
      name: "Instrukcyjna",
      areas: [
        { id: "A1", topic: "Dieta", question: "Co jeść?", ymyl: true },
        { id: "A2", topic: "Sen", question: "Jak spać?", ymyl: true },
        { id: "A3", topic: "Stres", question: "Jak redukować stres?", ymyl: true },
      ],
    },
    {
      name: "Diagnostyczna",
      areas: [
        { id: "A4", topic: "Badania", question: "Jak zbadać kortyzol?", ymyl: true },
      ],
    },
  ],
};

const classifyResult: FanOutClassifyCall = {
  classifications: [
    { areaId: "A1", classification: "MICRO", evergreenTopic: "", evergreenQuestion: "" },
    { areaId: "A2", classification: "MICRO", evergreenTopic: "", evergreenQuestion: "" },
    { areaId: "A3", classification: "MICRO", evergreenTopic: "", evergreenQuestion: "" },
    {
      areaId: "A4",
      classification: "MACRO",
      evergreenTopic: "Badania kortyzolu",
      evergreenQuestion: "Jak zbadać poziom kortyzolu?",
    },
  ],
  dominantIntent: "Instrukcyjna",
};

const paaResult: FanOutPaaCall = {
  assignments: [
    { areaId: "A1", question: "Co jeść żeby obniżyć kortyzol?" },
    { areaId: "A2", question: "Jak sen reguluje kortyzol?" },
    { areaId: "A3", question: "Jak natychmiast obniżyć kortyzol?" },
  ],
  unmatched: ["Czy kawa podnosi kortyzol?", "Jak najszybciej zbić kortyzol?"],
};

const stats = {
  model: env.QUERY_FANOUT_MODEL,
  promptTokens: 100,
  completionTokens: 200,
  costUsd: "0.0025",
  latencyMs: 1500,
};

describe("QueryFanOutHandler", () => {
  let fanout: {
    generateIntents: ReturnType<typeof vi.fn>;
    classify: ReturnType<typeof vi.fn>;
    assignPaa: ReturnType<typeof vi.fn>;
  };
  let dfs: { paaFetch: ReturnType<typeof vi.fn> };
  let cache: { getOrSet: ReturnType<typeof vi.fn> };
  let handler: QueryFanOutHandler;

  beforeEach(() => {
    fanout = {
      generateIntents: vi.fn(),
      classify: vi.fn(),
      assignPaa: vi.fn(),
    };
    dfs = { paaFetch: vi.fn() };
    cache = { getOrSet: vi.fn() };
    handler = new QueryFanOutHandler(fanout as any, dfs as any, cache as any, env);
  });

  function passThroughCache() {
    // outer cache for fanout
    cache.getOrSet.mockImplementationOnce(async (opts: any) => (await opts.fetcher()).result);
    // inner cache for PAA
    cache.getOrSet.mockImplementationOnce(async (opts: any) => (await opts.fetcher()).result);
  }

  it("reports type 'tool.query.fanout'", () => {
    expect(handler.type).toBe("tool.query.fanout");
  });

  it("happy path with PAA: outer cache miss → DFS + 3 LLM calls → assembled QueryFanOutResult", async () => {
    passThroughCache();
    dfs.paaFetch.mockResolvedValueOnce([
      { title: "Co jeść żeby obniżyć kortyzol?" },
      { title: "Jak sen reguluje kortyzol?" },
      { title: "Jak natychmiast obniżyć kortyzol?" },
      { title: "Czy kawa podnosi kortyzol?" },
      { title: "Jak najszybciej zbić kortyzol?" },
    ]);
    fanout.generateIntents.mockResolvedValueOnce({ result: intentsResult, ...stats });
    fanout.classify.mockResolvedValueOnce({ result: classifyResult, ...stats });
    fanout.assignPaa.mockResolvedValueOnce({ result: paaResult, ...stats });

    const out = await handler.execute(makeCtx());
    const result = out.output as any;

    expect(result.metadata.keyword).toBe("Jak obniżyć kortyzol po 40tce?");
    expect(result.metadata.paaUsed).toBe(true);
    expect(result.metadata.paaFetched).toBe(5);
    expect(result.intents).toHaveLength(2);
    expect(result.intents[0].areas).toHaveLength(3);
    expect(result.intents[1].areas[0].classification).toBe("MACRO");
    expect(result.intents[1].areas[0].evergreenTopic).toBe("Badania kortyzolu");
    expect(result.intents[0].areas[0].evergreenTopic).toBe(""); // MICRO has empty
    expect(result.dominantIntent).toBe("Instrukcyjna");
    expect(result.paaMapping).toHaveLength(3);
    expect(result.unmatchedPaa).toHaveLength(2);

    expect(dfs.paaFetch).toHaveBeenCalledTimes(1);
    expect(fanout.generateIntents).toHaveBeenCalledTimes(1);
    expect(fanout.classify).toHaveBeenCalledTimes(1);
    expect(fanout.assignPaa).toHaveBeenCalledTimes(1);
  });

  it("PAA disabled: skips DataForSEO and skips LLM #3 entirely", async () => {
    handler = new QueryFanOutHandler(
      fanout as any,
      dfs as any,
      cache as any,
      { ...env, QUERY_FANOUT_PAA_ENABLED: false },
    );
    cache.getOrSet.mockImplementationOnce(async (opts: any) => (await opts.fetcher()).result);
    fanout.generateIntents.mockResolvedValueOnce({ result: intentsResult, ...stats });
    fanout.classify.mockResolvedValueOnce({ result: classifyResult, ...stats });

    const out = await handler.execute(makeCtx());
    const result = out.output as any;

    expect(result.metadata.paaUsed).toBe(false);
    expect(result.metadata.paaFetched).toBe(0);
    expect(result.paaMapping).toEqual([]);
    expect(result.unmatchedPaa).toEqual([]);
    expect(dfs.paaFetch).not.toHaveBeenCalled();
    expect(fanout.assignPaa).not.toHaveBeenCalled();
  });

  it("empty PAA result: skips LLM #3 even when PAA enabled", async () => {
    passThroughCache();
    dfs.paaFetch.mockResolvedValueOnce([]);
    fanout.generateIntents.mockResolvedValueOnce({ result: intentsResult, ...stats });
    fanout.classify.mockResolvedValueOnce({ result: classifyResult, ...stats });

    const out = await handler.execute(makeCtx());
    const result = out.output as any;

    expect(result.metadata.paaUsed).toBe(false);
    expect(result.metadata.paaFetched).toBe(0);
    expect(fanout.assignPaa).not.toHaveBeenCalled();
  });

  it("throws when classify result lacks an area's id", async () => {
    passThroughCache();
    dfs.paaFetch.mockResolvedValueOnce([]);
    fanout.generateIntents.mockResolvedValueOnce({ result: intentsResult, ...stats });
    fanout.classify.mockResolvedValueOnce({
      result: {
        ...classifyResult,
        classifications: classifyResult.classifications.filter((c) => c.areaId !== "A2"),
      },
      ...stats,
    });

    await expect(handler.execute(makeCtx())).rejects.toThrow(/classification missing for area A2/);
  });

  it("superRefine: rejects when LLM emits dominantIntent not in intents[]", async () => {
    passThroughCache();
    dfs.paaFetch.mockResolvedValueOnce([]);
    fanout.generateIntents.mockResolvedValueOnce({ result: intentsResult, ...stats });
    fanout.classify.mockResolvedValueOnce({
      result: { ...classifyResult, dominantIntent: "Porównawcza" },
      ...stats,
    });

    await expect(handler.execute(makeCtx())).rejects.toThrow();
  });

  it("outer cache hit: returns cached result without invoking LLM/DataForSEO", async () => {
    const cachedResult = {
      metadata: {
        keyword: "Jak obniżyć kortyzol po 40tce?",
        language: "pl",
        paaFetched: 0,
        paaUsed: false,
        createdAt: "2026-04-27T00:00:00.000Z",
      },
      normalization: { mainEntity: "kortyzol", category: "zdrowie", ymylRisk: true },
      intents: intentsResult.intents.map((i) => ({
        name: i.name,
        areas: i.areas.map((a) => ({
          ...a,
          classification: "MICRO" as const,
          evergreenTopic: "",
          evergreenQuestion: "",
        })),
      })),
      dominantIntent: "Instrukcyjna",
      paaMapping: [],
      unmatchedPaa: [],
    };
    cache.getOrSet.mockResolvedValueOnce(cachedResult);

    const out = await handler.execute(makeCtx());
    expect(out.output).toBe(cachedResult);
    expect(fanout.generateIntents).not.toHaveBeenCalled();
    expect(dfs.paaFetch).not.toHaveBeenCalled();
  });

  it("forceRefresh: passed through to outer and inner cache calls", async () => {
    passThroughCache();
    dfs.paaFetch.mockResolvedValueOnce([]);
    fanout.generateIntents.mockResolvedValueOnce({ result: intentsResult, ...stats });
    fanout.classify.mockResolvedValueOnce({ result: classifyResult, ...stats });

    await handler.execute(makeCtx({ forceRefresh: true }));

    expect(cache.getOrSet.mock.calls[0][0].forceRefresh).toBe(true);
    expect(cache.getOrSet.mock.calls[1][0].forceRefresh).toBe(true);
  });

  it("composeKeyword: topic only", async () => {
    passThroughCache();
    dfs.paaFetch.mockResolvedValueOnce([]);
    fanout.generateIntents.mockResolvedValueOnce({ result: intentsResult, ...stats });
    fanout.classify.mockResolvedValueOnce({ result: classifyResult, ...stats });

    const ctx = makeCtx({ run: { id: "run-1", input: { topic: "kortyzol" } } as any });
    const out = await handler.execute(ctx);
    expect((out.output as any).metadata.keyword).toBe("kortyzol");
    expect(fanout.generateIntents.mock.calls[0][0].keyword).toBe("kortyzol");
  });

  it("composeKeyword: topic + mainKeyword + intent", async () => {
    passThroughCache();
    dfs.paaFetch.mockResolvedValueOnce([]);
    fanout.generateIntents.mockResolvedValueOnce({ result: intentsResult, ...stats });
    fanout.classify.mockResolvedValueOnce({ result: classifyResult, ...stats });

    const ctx = makeCtx({
      run: {
        id: "run-1",
        input: { topic: "kortyzol", mainKeyword: "kortyzol po 40", intent: "instructional" },
      } as any,
    });
    const out = await handler.execute(ctx);
    expect((out.output as any).metadata.keyword).toBe("kortyzol (kortyzol po 40) — instructional");
  });

  it("PAA fetched questions are sliced to QUERY_FANOUT_PAA_MAX_QUESTIONS", async () => {
    handler = new QueryFanOutHandler(
      fanout as any,
      dfs as any,
      cache as any,
      { ...env, QUERY_FANOUT_PAA_MAX_QUESTIONS: 2 },
    );
    passThroughCache();
    dfs.paaFetch.mockResolvedValueOnce([
      { title: "q1" },
      { title: "q2" },
      { title: "q3" },
      { title: "q4" },
    ]);
    fanout.generateIntents.mockResolvedValueOnce({ result: intentsResult, ...stats });
    fanout.classify.mockResolvedValueOnce({ result: classifyResult, ...stats });
    fanout.assignPaa.mockResolvedValueOnce({
      result: { assignments: [{ areaId: "A1", question: "q1" }], unmatched: ["q2"] },
      ...stats,
    });

    const out = await handler.execute(makeCtx());
    const result = out.output as any;
    expect(result.metadata.paaFetched).toBe(2);
    expect(fanout.assignPaa.mock.calls[0][0].paaQuestions).toEqual(["q1", "q2"]);
  });

  it("totalCost is sum of 3 LLM calls (no PAA fetch cost contribution)", async () => {
    passThroughCache();
    dfs.paaFetch.mockResolvedValueOnce([{ title: "q1" }]);
    fanout.generateIntents.mockResolvedValueOnce({ result: intentsResult, ...stats, costUsd: "0.01" });
    fanout.classify.mockResolvedValueOnce({ result: classifyResult, ...stats, costUsd: "0.02" });
    fanout.assignPaa.mockResolvedValueOnce({
      result: { assignments: [{ areaId: "A1", question: "q1" }], unmatched: [] },
      ...stats,
      costUsd: "0.005",
    });

    // capture costUsd reported by the fetcher
    let capturedCost: string | undefined;
    cache.getOrSet.mockReset();
    cache.getOrSet.mockImplementationOnce(async (opts: any) => {
      const fetched = await opts.fetcher();
      capturedCost = fetched.costUsd;
      return fetched.result;
    });
    cache.getOrSet.mockImplementationOnce(async (opts: any) => (await opts.fetcher()).result);

    await handler.execute(makeCtx());
    expect(parseFloat(capturedCost!)).toBeCloseTo(0.035, 3);
  });
});
