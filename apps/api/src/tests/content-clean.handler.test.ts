import { describe, it, expect, vi, beforeEach } from "vitest";
import { ContentCleanHandler } from "../handlers/content-clean.handler";
import type { StepContext } from "../orchestrator/step-handler";

const env = {
  CLEANING_BLOCK_SIMILARITY_THRESHOLD: 0.85,
  CLEANING_PARAGRAPH_KEYWORD_THRESHOLD: 0.4,
  CLEANING_LENGTH_DIFF_THRESHOLD: 0.3,
  CLEANING_TARGET_CHAR_LIMIT: 50_000,
  CLEANING_MIN_PARAGRAPH_LENGTH: 60,
} as any;

function makeScrapePage(url: string, markdown: string) {
  return {
    url,
    title: `Title for ${url}`,
    markdown,
    rawLength: markdown.length,
    truncated: false,
    source: "crawl4ai",
    fetchedAt: "2026-04-23T00:00:00.000Z",
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

// A paragraph roughly 100 chars, strongly aligned with "kortyzol" topic embeddings:
const P_KORTYZOL = "Kortyzol to hormon stresu produkowany przez nadnercza wpływający na organizm w sposób istotny.";
const P_KORTYZOL_2 = "Podwyższony poziom kortyzolu wpływa negatywnie na zdrowie metaboliczne oraz jakość snu.";
const P_OFFTOPIC = "Przepisy kulinarne i porady kuchenne bez związku z tematem hormonalnym medycznym absolutnie.";

describe("ContentCleanHandler", () => {
  let client: { embedTexts: ReturnType<typeof vi.fn> };
  let cache: { getOrSet: ReturnType<typeof vi.fn> };
  let handler: ContentCleanHandler;

  beforeEach(() => {
    client = { embedTexts: vi.fn() };
    cache = { getOrSet: vi.fn() };
    handler = new ContentCleanHandler(client as any, cache as any, env);
  });

  it("reports type 'tool.content.clean'", () => {
    expect(handler.type).toBe("tool.content.clean");
  });

  it("throws when previousOutputs.scrape is missing", async () => {
    await expect(handler.execute(makeCtx())).rejects.toThrow(/requires previousOutputs\.scrape/);
    expect(cache.getOrSet).not.toHaveBeenCalled();
  });

  it("throws when scrape shape is invalid", async () => {
    const ctx = makeCtx({ previousOutputs: { scrape: { pages: "not-array" } } });
    await expect(handler.execute(ctx)).rejects.toThrow();
    expect(cache.getOrSet).not.toHaveBeenCalled();
  });

  it("throws when scrape has 0 pages", async () => {
    const ctx = makeCtx({ previousOutputs: { scrape: { pages: [], failures: [] } } });
    await expect(handler.execute(ctx)).rejects.toThrow(/no pages/i);
  });

  it("happy path: cache miss → phase-1 cleanup → 2 embedMany calls → CleanedScrapeResult", async () => {
    const pageA = makeScrapePage(
      "https://a.example.com/a",
      `${P_KORTYZOL}\n\n${P_KORTYZOL_2}\n\n${P_OFFTOPIC}`,
    );
    const pageB = makeScrapePage(
      "https://b.example.com/b",
      `${P_KORTYZOL}\n\nAkceptuję cookies, aby kontynuować przeglądanie naszej strony internetowej sklepu.`,
    );

    // Cache miss: invoke fetcher
    cache.getOrSet.mockImplementationOnce(async (opts: any) => (await opts.fetcher()).result);

    // embedTexts is called per phase. Dispatch by input shape so repeat calls
    // (the test also re-invokes fetcher below to assert cost) stay deterministic.
    client.embedTexts.mockImplementation(async (texts: string[]) => {
      // Phase 2: [keyword, ...paragraphs]. At least one page’s paragraph count > 1.
      // Detect by seeing P_KORTYZOL appearing among texts.
      if (texts.some((t) => t === P_KORTYZOL)) {
        return {
          embeddings: [
            [1, 0],       // keyword
            [1, 0],       // A1 (on-topic)
            [0.9, 0.436], // A2 (on-topic, sim ≈ 0.9)
            [0, 1],       // A3 (off-topic)
            [0.95, 0.31], // B1 (on-topic)
          ],
          costUsd: "0.001",
          tokensUsed: 50,
        };
      }
      // Phase 5: block texts (joined paragraphs). Return 1 or 2 embeddings matching length.
      return {
        embeddings: texts.map((_, i) => (i === 0 ? [1, 0] : [0, 1])),
        costUsd: "0.0005",
        tokensUsed: 25,
      };
    });

    const ctx = makeCtx({ previousOutputs: { scrape: { pages: [pageA, pageB], failures: [] } } });
    const out = await handler.execute(ctx);
    const result = out.output as any;

    expect(result.pages.length).toBeGreaterThanOrEqual(1);
    expect(result.stats.inputPages).toBe(2);
    expect(result.stats.keywordFilteredRemoved).toBeGreaterThanOrEqual(1); // A3 filtered
    expect(result.stats.blacklistedRemoved).toBe(1); // cookie paragraph in B
    expect(result.stats.reductionPct).toBeGreaterThan(0);

    // Two embedMany calls — one for keyword+paragraphs, one for block-level dedup
    expect(client.embedTexts).toHaveBeenCalledTimes(2);

    // Fetcher returned combined cost
    const fetcherResult = await cache.getOrSet.mock.calls[0][0].fetcher();
    expect(parseFloat(fetcherResult.costUsd)).toBeCloseTo(0.0015, 6);
  });

  it("builds cache params with sorted thresholds for determinism", async () => {
    const page = makeScrapePage("https://x.example.com/x", P_KORTYZOL);
    cache.getOrSet.mockResolvedValueOnce({
      pages: [], droppedPages: [], stats: {
        inputPages: 0, keptPages: 0, inputChars: 0, outputChars: 0,
        reductionPct: 0, blacklistedRemoved: 0, keywordFilteredRemoved: 0, crossPageDupesRemoved: 0,
      },
    });

    await handler.execute(makeCtx({ previousOutputs: { scrape: { pages: [page], failures: [] } } }));

    const call = cache.getOrSet.mock.calls[0][0];
    expect(call.tool).toBe("content");
    expect(call.method).toBe("clean");
    expect(call.ttlSeconds).toBe(7 * 24 * 3600);
    expect(call.runId).toBe("run-1");
    expect(call.stepId).toBe("step-1");
    expect(call.params.keyword).toContain("kortyzol");
    expect(call.params.thresholds).toEqual({
      blockSimilarityThreshold: 0.85,
      paragraphKeywordThreshold: 0.4,
      lengthDiffThreshold: 0.3,
      charLimit: 50_000,
      minParagraphLength: 60,
    });
    expect(call.params.pages).toEqual([
      { url: "https://x.example.com/x", markdown: P_KORTYZOL },
    ]);
  });

  it("keyword composition: topic + mainKeyword + intent", async () => {
    const page = makeScrapePage("https://x.example.com/x", P_KORTYZOL);
    cache.getOrSet.mockImplementationOnce(async (opts: any) => {
      expect(opts.params.keyword).toBe("kortyzol (obniżyć kortyzol) — informational");
      return {
        pages: [], droppedPages: [], stats: {
          inputPages: 0, keptPages: 0, inputChars: 0, outputChars: 0,
          reductionPct: 0, blacklistedRemoved: 0, keywordFilteredRemoved: 0, crossPageDupesRemoved: 0,
        },
      };
    });

    await handler.execute(makeCtx({ previousOutputs: { scrape: { pages: [page], failures: [] } } }));
  });

  it("keyword composition: only topic when mainKeyword and intent missing", async () => {
    const page = makeScrapePage("https://x.example.com/x", P_KORTYZOL);
    cache.getOrSet.mockImplementationOnce(async (opts: any) => {
      expect(opts.params.keyword).toBe("kortyzol");
      return {
        pages: [], droppedPages: [], stats: {
          inputPages: 0, keptPages: 0, inputChars: 0, outputChars: 0,
          reductionPct: 0, blacklistedRemoved: 0, keywordFilteredRemoved: 0, crossPageDupesRemoved: 0,
        },
      };
    });

    const ctx = makeCtx({
      run: { id: "run-1", input: { topic: "kortyzol" } } as any,
      previousOutputs: { scrape: { pages: [page], failures: [] } },
    });
    await handler.execute(ctx);
  });

  it("all pages dropped: returns empty pages[] without throwing", async () => {
    const page = makeScrapePage(
      "https://x.example.com/x",
      "Akceptuję cookies aby kontynuować przeglądanie naszej strony internetowej sklepu online.",
    );

    cache.getOrSet.mockImplementationOnce(async (opts: any) => (await opts.fetcher()).result);

    const ctx = makeCtx({ previousOutputs: { scrape: { pages: [page], failures: [] } } });
    const out = await handler.execute(ctx);
    const result = out.output as any;

    expect(result.pages).toEqual([]);
    expect(result.droppedPages.length).toBeGreaterThan(0);
    expect(result.droppedPages[0].reason).toBe("empty_after_cleanup");
    // No API calls needed because phase 1 already emptied everything
    expect(client.embedTexts).not.toHaveBeenCalled();
  });

  it("cache hit: skips all processing and returns cached value", async () => {
    const cached = {
      pages: [], droppedPages: [], stats: {
        inputPages: 2, keptPages: 0, inputChars: 0, outputChars: 0,
        reductionPct: 100, blacklistedRemoved: 0, keywordFilteredRemoved: 0, crossPageDupesRemoved: 0,
      },
    };
    cache.getOrSet.mockResolvedValueOnce(cached);

    const page = makeScrapePage("https://x.example.com/x", P_KORTYZOL);
    const out = await handler.execute(
      makeCtx({ previousOutputs: { scrape: { pages: [page], failures: [] } } }),
    );

    expect(out.output).toBe(cached);
    expect(client.embedTexts).not.toHaveBeenCalled();
  });
});
