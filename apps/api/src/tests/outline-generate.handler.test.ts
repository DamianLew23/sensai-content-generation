import { describe, it, expect, vi } from "vitest";
import { OutlineGenerateHandler } from "../handlers/outline-generate.handler";
import type { OutlineGenerationResult, QueryFanOutResult } from "@sensai/shared";

const mkFanout = (): QueryFanOutResult => ({
  metadata: {
    keyword: "kortyzol",
    language: "pl",
    createdAt: "2026-04-29T10:00:00.000Z",
    paaFetched: 0,
    paaUsed: false,
  },
  normalization: { mainEntity: "kortyzol", category: "zdrowie", ymylRisk: true },
  intents: [
    {
      name: "Instrukcyjna",
      areas: [
        {
          id: "A1",
          topic: "snu",
          question: "Jak sen wpływa na kortyzol?",
          ymyl: true,
          classification: "MICRO" as const,
          evergreenTopic: "",
          evergreenQuestion: "",
        },
      ],
    },
  ],
  dominantIntent: "Instrukcyjna",
  paaMapping: [],
  unmatchedPaa: [],
});

const mkCtx = (overrides: { input?: Record<string, unknown>; previousOutputs?: Record<string, unknown> } = {}) => ({
  run: { id: "run-1", input: { topic: "kortyzol", ...overrides.input } },
  step: { id: "step-1" },
  project: { id: "proj-1" },
  previousOutputs: { fanout: mkFanout(), ...overrides.previousOutputs },
  attempt: 1,
});

const mkLLMResult = () => ({
  result: {
    h1Title: "Generated H1",
    fullSections: [{ sourceArea: "snu", header: "Higiena snu", h3s: [] }],
    contextSections: [],
  },
  model: "openai/gpt-5.4",
  promptTokens: 100,
  completionTokens: 50,
  costUsd: 0.001,
  latencyMs: 1000,
});

describe("OutlineGenerateHandler", () => {
  it("happy path: parses fanout, calls preprocess+LLM+postprocess, returns OutlineGenerationResult", async () => {
    const client = { generate: vi.fn().mockResolvedValue(mkLLMResult()) };
    const cache = {
      getOrSet: vi.fn().mockImplementation((opts: { fetcher: () => Promise<{ result: unknown }> }) =>
        opts.fetcher().then((r: { result: unknown }) => r.result),
      ),
    };
    const env = {
      OUTLINE_GENERATE_TTL_DAYS: 7,
      OUTLINE_GENERATE_MODEL: "openai/gpt-5.4",
      OUTLINE_GENERATE_REASONING: "medium" as const,
    };

    const handler = new OutlineGenerateHandler(client as any, cache as any, env);
    const r = await handler.execute(mkCtx() as any);
    const output = r.output as OutlineGenerationResult;

    expect(output.outline[0].type).toBe("intro");
    expect(output.meta.h1Source).toBe("llm");
    expect(client.generate).toHaveBeenCalledTimes(1);
  });

  it("throws when previousOutputs.fanout is missing", async () => {
    const client = { generate: vi.fn() };
    const cache = { getOrSet: vi.fn() };
    const env = {
      OUTLINE_GENERATE_TTL_DAYS: 7,
      OUTLINE_GENERATE_MODEL: "x",
      OUTLINE_GENERATE_REASONING: "medium" as const,
    };
    const handler = new OutlineGenerateHandler(client as any, cache as any, env);
    await expect(
      handler.execute({
        run: { id: "r", input: { topic: "x" } },
        step: { id: "s" },
        project: { id: "p" },
        previousOutputs: {},
        attempt: 1,
      } as any),
    ).rejects.toThrow(/previousOutputs.fanout/);
  });

  it("stamps h1Source=user when RunInput.h1Title is set", async () => {
    const client = { generate: vi.fn().mockResolvedValue(mkLLMResult()) };
    const cache = {
      getOrSet: vi.fn().mockImplementation((opts: { fetcher: () => Promise<{ result: unknown }> }) =>
        opts.fetcher().then((r: { result: unknown }) => r.result),
      ),
    };
    const env = {
      OUTLINE_GENERATE_TTL_DAYS: 7,
      OUTLINE_GENERATE_MODEL: "x",
      OUTLINE_GENERATE_REASONING: "medium" as const,
    };
    const handler = new OutlineGenerateHandler(client as any, cache as any, env);
    const r = await handler.execute(mkCtx({ input: { h1Title: "User H1" } }) as any);
    const output = r.output as OutlineGenerationResult;
    expect(output.meta.h1Title).toBe("User H1");
    expect(output.meta.h1Source).toBe("user");
  });

  it("stamps primaryIntentSource=user when RunInput.intent matches an existing intent", async () => {
    const client = { generate: vi.fn().mockResolvedValue(mkLLMResult()) };
    const cache = {
      getOrSet: vi.fn().mockImplementation((opts: { fetcher: () => Promise<{ result: unknown }> }) =>
        opts.fetcher().then((r: { result: unknown }) => r.result),
      ),
    };
    const env = {
      OUTLINE_GENERATE_TTL_DAYS: 7,
      OUTLINE_GENERATE_MODEL: "x",
      OUTLINE_GENERATE_REASONING: "medium" as const,
    };
    const handler = new OutlineGenerateHandler(client as any, cache as any, env);
    const r = await handler.execute(mkCtx({ input: { intent: "Instrukcyjna" } }) as any);
    const output = r.output as OutlineGenerationResult;
    expect(output.meta.primaryIntent).toBe("Instrukcyjna");
    expect(output.meta.primaryIntentSource).toBe("user");
  });

  it("returns cached result without calling client on cache hit", async () => {
    const cachedValue = {
      meta: {
        keyword: "kortyzol",
        h1Title: "Cached H1",
        h1Source: "llm" as const,
        language: "pl",
        primaryIntent: "Instrukcyjna" as const,
        primaryIntentSource: "fanout" as const,
        fullSectionsCount: 0,
        contextSectionsCount: 0,
        generatedAt: "2026-04-29T10:00:00.000Z",
        model: "x",
      },
      outline: [
        {
          type: "intro" as const,
          order: 0 as const,
          header: null,
          sectionVariant: null,
          h3s: [] as [],
        },
      ],
      warnings: [],
    };
    const client = { generate: vi.fn() };
    const cache = { getOrSet: vi.fn().mockResolvedValue(cachedValue) };
    const env = {
      OUTLINE_GENERATE_TTL_DAYS: 7,
      OUTLINE_GENERATE_MODEL: "x",
      OUTLINE_GENERATE_REASONING: "medium" as const,
    };
    const handler = new OutlineGenerateHandler(client as any, cache as any, env);
    const r = await handler.execute(mkCtx() as any);
    expect(client.generate).not.toHaveBeenCalled();
    expect(r.output).toEqual(cachedValue);
  });
});
