import { describe, it, expect, vi, beforeEach } from "vitest";
import { EntityExtractHandler } from "../handlers/entity-extract.handler";
import type { StepContext } from "../orchestrator/step-handler";

const env = {
  ENTITY_EXTRACT_MODEL: "google/gemini-3-flash-preview",
  ENTITY_EXTRACT_LANGUAGE: "pl",
  ENTITY_EXTRACT_MIN_ENTITIES: 10,
  ENTITY_EXTRACT_MIN_RELATIONS: 5,
} as any;

function makeCleanedPage(url: string, markdown: string) {
  return {
    url,
    title: `Title ${url}`,
    fetchedAt: "2026-04-27T00:00:00.000Z",
    markdown,
    paragraphs: markdown.split(/\n\n+/),
    originalChars: markdown.length * 2,
    cleanedChars: markdown.length,
    removedParagraphs: 1,
  };
}

function makeCleanedResult(
  pages = [makeCleanedPage("https://a.example.com/a", "Para A about CD Projekt.")],
) {
  return {
    pages,
    droppedPages: [],
    stats: {
      inputPages: pages.length + 1,
      keptPages: pages.length,
      inputChars: 2000,
      outputChars: 1000,
      reductionPct: 50,
      blacklistedRemoved: 2,
      keywordFilteredRemoved: 1,
      crossPageDupesRemoved: 0,
    },
  };
}

function makeExtraction() {
  const entities = Array.from({ length: 8 }, (_, i) => ({
    id: `E${i + 1}`,
    originalSurface: `Surface ${i + 1}`,
    entity: `Entity ${i + 1}`,
    domainType: "CONCEPT" as const,
    evidence: `ev ${i + 1}`,
  }));
  return {
    metadata: {
      keyword: "CD Projekt",
      language: "pl",
      sourceUrlCount: 1,
      createdAt: "2026-04-27T00:00:00.000Z",
    },
    contextAnalysis: {
      mainTopicInterpretation: "interpretation",
      domainSummary: "summary",
      notes: "",
    },
    entities,
    relationships: Array.from({ length: 3 }, (_, i) => ({
      source: `E${i + 1}`,
      target: `E${i + 2}`,
      type: "RELATED_TO" as const,
      description: `desc ${i + 1}`,
      evidence: `ev ${i + 1}`,
    })),
    relationToMain: entities.map((e) => ({
      entityId: e.id,
      score: 50,
      rationale: "r",
    })),
  };
}

function makeCtx(overrides: Partial<StepContext> = {}): StepContext {
  return {
    run: {
      id: "run-1",
      input: { topic: "CD Projekt", mainKeyword: "CD Projekt SA", intent: "informational" },
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

describe("EntityExtractHandler", () => {
  let client: { extract: ReturnType<typeof vi.fn> };
  let cache: { getOrSet: ReturnType<typeof vi.fn> };
  let handler: EntityExtractHandler;

  beforeEach(() => {
    client = { extract: vi.fn() };
    cache = { getOrSet: vi.fn() };
    handler = new EntityExtractHandler(client as any, cache as any, env);
  });

  it("reports type 'tool.entity.extract'", () => {
    expect(handler.type).toBe("tool.entity.extract");
  });

  it("throws when previousOutputs.clean is missing", async () => {
    await expect(handler.execute(makeCtx())).rejects.toThrow(/requires previousOutputs\.clean/);
    expect(cache.getOrSet).not.toHaveBeenCalled();
  });

  it("throws when clean shape is invalid", async () => {
    const ctx = makeCtx({ previousOutputs: { clean: { pages: "nope" } } });
    await expect(handler.execute(ctx)).rejects.toThrow();
  });

  it("throws when clean has 0 pages AND deepResearch is absent", async () => {
    const clean = { ...makeCleanedResult(), pages: [] };
    const ctx = makeCtx({ previousOutputs: { clean } });
    await expect(handler.execute(ctx)).rejects.toThrow(/no input content/i);
  });

  it("proceeds when clean has 0 pages BUT deepResearch is present", async () => {
    const clean = { ...makeCleanedResult(), pages: [] };
    const deepResearch = {
      content: "deep body",
      sources: [{ url: "https://d.example.com/d", snippets: [] }],
    };
    cache.getOrSet.mockImplementationOnce(async (opts: any) => (await opts.fetcher()).result);
    client.extract.mockResolvedValueOnce({
      result: makeExtraction(),
      model: env.ENTITY_EXTRACT_MODEL,
      promptTokens: 100,
      completionTokens: 100,
      costUsd: "0.000500",
      latencyMs: 1000,
    });

    const ctx = makeCtx({ previousOutputs: { clean, deepResearch } });
    const out = await handler.execute(ctx);
    expect((out.output as any).entities).toHaveLength(8);
    expect(client.extract).toHaveBeenCalledTimes(1);
  });

  it("happy path: cache miss → one extract call → EntityExtractionResult", async () => {
    const clean = makeCleanedResult();
    const deepResearch = { content: "deep body", sources: [] };

    cache.getOrSet.mockImplementationOnce(async (opts: any) => (await opts.fetcher()).result);
    client.extract.mockResolvedValueOnce({
      result: makeExtraction(),
      model: env.ENTITY_EXTRACT_MODEL,
      promptTokens: 800,
      completionTokens: 600,
      costUsd: "0.002000",
      latencyMs: 2000,
    });

    const ctx = makeCtx({ previousOutputs: { clean, deepResearch } });
    const out = await handler.execute(ctx);
    const result = out.output as any;

    expect(result.entities).toHaveLength(8);
    expect(result.relationships).toHaveLength(3);
    expect(result.relationToMain).toHaveLength(8);
    expect(result.metadata.keyword).toBe("CD Projekt (CD Projekt SA) — informational");
    expect(result.metadata.language).toBe("pl");
    expect(result.metadata.sourceUrlCount).toBe(1);
    expect(client.extract).toHaveBeenCalledTimes(1);
  });

  it("composes keyword: topic only when mainKeyword/intent absent", async () => {
    const clean = makeCleanedResult();
    cache.getOrSet.mockImplementationOnce(async (opts: any) => {
      expect(opts.params.keyword).toBe("CD Projekt");
      return makeExtraction();
    });

    const ctx = makeCtx({
      run: { id: "run-1", input: { topic: "CD Projekt" } } as any,
      previousOutputs: { clean },
    });
    await handler.execute(ctx);
  });

  it("builds cache params deterministically (pages + deepResearchPresent + keyword + language + model)", async () => {
    const clean = makeCleanedResult();
    const deepResearch = { content: "deep body", sources: [] };
    cache.getOrSet.mockResolvedValueOnce(makeExtraction());

    await handler.execute(makeCtx({ previousOutputs: { clean, deepResearch } }));

    const call = cache.getOrSet.mock.calls[0][0];
    expect(call.tool).toBe("entity");
    expect(call.method).toBe("extract");
    expect(call.ttlSeconds).toBe(7 * 24 * 3600);
    expect(call.runId).toBe("run-1");
    expect(call.stepId).toBe("step-1");
    expect(call.params.keyword).toContain("CD Projekt");
    expect(call.params.language).toBe("pl");
    expect(call.params.model).toBe("google/gemini-3-flash-preview");
    expect(call.params.deepResearchPresent).toBe(true);
    expect(call.params.pages).toEqual([
      { url: "https://a.example.com/a", md: "Para A about CD Projekt." },
    ]);
  });

  it("forwards forceRefresh to cache when ctx.forceRefresh is set", async () => {
    const clean = makeCleanedResult();
    cache.getOrSet.mockResolvedValueOnce(makeExtraction());

    await handler.execute(
      makeCtx({ previousOutputs: { clean }, forceRefresh: true }),
    );

    const call = cache.getOrSet.mock.calls[0][0];
    expect(call.forceRefresh).toBe(true);
  });

  it("cache hit: skips extract call and returns cached value", async () => {
    const cached = makeExtraction();
    cache.getOrSet.mockResolvedValueOnce(cached);

    const clean = makeCleanedResult();
    const out = await handler.execute(makeCtx({ previousOutputs: { clean } }));

    expect(out.output).toBe(cached);
    expect(client.extract).not.toHaveBeenCalled();
  });
});
