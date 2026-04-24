import { describe, it, expect, vi, beforeEach } from "vitest";
import { ContentExtractHandler } from "../handlers/content-extract.handler";
import type { StepContext } from "../orchestrator/step-handler";

const env = {
  CONTENT_EXTRACT_MODEL: "google/gemini-3-flash-preview",
  CONTENT_EXTRACT_LANGUAGE: "pl",
  CONTENT_EXTRACT_MIN_FACTS: 5,
  CONTENT_EXTRACT_MIN_DATA: 3,
  CONTENT_EXTRACT_MIN_IDEATIONS: 3,
} as any;

function makeCleanedPage(url: string, markdown: string) {
  return {
    url,
    title: `Title ${url}`,
    fetchedAt: "2026-04-24T00:00:00.000Z",
    markdown,
    paragraphs: markdown.split(/\n\n+/),
    originalChars: markdown.length * 2,
    cleanedChars: markdown.length,
    removedParagraphs: 1,
  };
}

function makeCleanedResult(pages = [makeCleanedPage("https://a.example.com/a", "Para A about kortyzol.")]) {
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
  return {
    metadata: {
      keyword: "kortyzol",
      language: "pl",
      sourceUrlCount: 1,
      createdAt: "2026-04-24T00:00:00.000Z",
    },
    facts: Array.from({ length: 5 }, (_, i) => ({
      id: `F${i + 1}`,
      text: `F${i + 1}`,
      category: "definition" as const,
      priority: "high" as const,
      confidence: 0.8,
      sourceUrls: [],
    })),
    data: Array.from({ length: 3 }, (_, i) => ({
      id: `D${i + 1}`,
      definition: `def ${i + 1}`,
      value: `${i + 1}`,
      unit: "mg",
      sourceUrls: [],
    })),
    ideations: Array.from({ length: 3 }, (_, i) => ({
      id: `I${i + 1}`,
      type: "checklist" as const,
      title: `Idea ${i + 1}`,
      description: `Desc ${i + 1}`,
      audience: "",
      channels: [],
      keywords: [],
      priority: "medium" as const,
    })),
  };
}

function makeCtx(overrides: Partial<StepContext> = {}): StepContext {
  return {
    run: {
      id: "run-1",
      input: { topic: "kortyzol", mainKeyword: "obniżyć kortyzol", intent: "informational" },
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

describe("ContentExtractHandler", () => {
  let client: { extract: ReturnType<typeof vi.fn> };
  let cache: { getOrSet: ReturnType<typeof vi.fn> };
  let handler: ContentExtractHandler;

  beforeEach(() => {
    client = { extract: vi.fn() };
    cache = { getOrSet: vi.fn() };
    handler = new ContentExtractHandler(client as any, cache as any, env);
  });

  it("reports type 'tool.content.extract'", () => {
    expect(handler.type).toBe("tool.content.extract");
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
    const deepResearch = { content: "deep body", sources: [{ url: "https://d.example.com/d", snippets: [] }] };
    cache.getOrSet.mockImplementationOnce(async (opts: any) => (await opts.fetcher()).result);
    client.extract.mockResolvedValueOnce({
      result: makeExtraction(),
      model: env.CONTENT_EXTRACT_MODEL,
      promptTokens: 100,
      completionTokens: 100,
      costUsd: "0.000500",
      latencyMs: 1000,
    });

    const ctx = makeCtx({ previousOutputs: { clean, deepResearch } });
    const out = await handler.execute(ctx);
    expect((out.output as any).facts).toHaveLength(5);
    expect(client.extract).toHaveBeenCalledTimes(1);
  });

  it("happy path: cache miss → one extract call → ExtractionResult", async () => {
    const clean = makeCleanedResult();
    const deepResearch = { content: "deep body", sources: [] };

    cache.getOrSet.mockImplementationOnce(async (opts: any) => (await opts.fetcher()).result);
    client.extract.mockResolvedValueOnce({
      result: makeExtraction(),
      model: env.CONTENT_EXTRACT_MODEL,
      promptTokens: 500,
      completionTokens: 300,
      costUsd: "0.001200",
      latencyMs: 1500,
    });

    const ctx = makeCtx({ previousOutputs: { clean, deepResearch } });
    const out = await handler.execute(ctx);
    const result = out.output as any;

    expect(result.facts).toHaveLength(5);
    expect(result.data).toHaveLength(3);
    expect(result.ideations).toHaveLength(3);
    expect(result.metadata.keyword).toBe("kortyzol (obniżyć kortyzol) — informational");
    expect(result.metadata.language).toBe("pl");
    expect(result.metadata.sourceUrlCount).toBe(1);
    expect(client.extract).toHaveBeenCalledTimes(1);
  });

  it("composes keyword: topic only when mainKeyword/intent absent", async () => {
    const clean = makeCleanedResult();
    cache.getOrSet.mockImplementationOnce(async (opts: any) => {
      expect(opts.params.keyword).toBe("kortyzol");
      return makeExtraction();
    });

    const ctx = makeCtx({
      run: { id: "run-1", input: { topic: "kortyzol" } } as any,
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
    expect(call.tool).toBe("content");
    expect(call.method).toBe("extract");
    expect(call.ttlSeconds).toBe(7 * 24 * 3600);
    expect(call.runId).toBe("run-1");
    expect(call.stepId).toBe("step-1");
    expect(call.params.keyword).toContain("kortyzol");
    expect(call.params.language).toBe("pl");
    expect(call.params.model).toBe("google/gemini-3-flash-preview");
    expect(call.params.deepResearchPresent).toBe(true);
    expect(call.params.pages).toEqual([
      { url: "https://a.example.com/a", md: "Para A about kortyzol." },
    ]);
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
