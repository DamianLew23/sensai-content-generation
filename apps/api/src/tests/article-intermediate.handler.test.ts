import { describe, expect, it, vi } from "vitest";
import { ArticleIntermediateHandler } from "../handlers/article-intermediate.handler";
import { ArticleOptimizeResult } from "@sensai/shared";

function fakeOptimize(): ArticleOptimizeResult {
  return ArticleOptimizeResult.parse({
    meta: {
      keyword: "kortyzol",
      language: "pl",
      model: "gpt-5.2",
      promptVersion: "v1",
      generatedAt: new Date().toISOString(),
    },
    htmlContent:
      "<h1>Kortyzol</h1><p>Spada o 20% (Źródło: WHO, 2024 — who.int/x).</p>",
    stats: {
      inputLength: 100,
      outputLength: 95,
      sourcesBefore: 1,
      sourcesAfter: 1,
      anchorsRemoved: 0,
      totalCostUsd: "0.001",
      totalLatencyMs: 1000,
    },
    protection: {
      srcPlaceholdersTotal: 1,
      srcPlaceholdersMissing: 0,
      spansTotal: 1,
      spansMissing: 0,
    },
    warnings: [],
  });
}

describe("ArticleIntermediateHandler", () => {
  it("declares type tool.article.intermediate", () => {
    const h = new ArticleIntermediateHandler({} as any, {} as any, {} as any);
    expect(h.type).toBe("tool.article.intermediate");
  });

  it("throws when previousOutputs.optimize missing", async () => {
    const h = new ArticleIntermediateHandler({} as any, {} as any, {} as any);
    await expect(
      h.execute({
        run: { id: "r" } as any,
        step: { id: "s" } as any,
        project: { id: "p" } as any,
        previousOutputs: {},
        attempt: 1,
      }),
    ).rejects.toThrow(/requires previousOutputs.optimize/);
  });

  it("delegates to client and returns ArticleIntermediateResult", async () => {
    const optimize = fakeOptimize();
    const client = {
      intermediate: vi.fn().mockResolvedValue({
        htmlContent: optimize.htmlContent,
        warnings: [],
        protection: {
          srcPlaceholdersTotal: 1,
          srcPlaceholdersMissing: 0,
          spansTotal: 1,
          spansMissing: 0,
        },
        stats: {
          inputLength: 100,
          outputLength: 105,
          growth: 0.05,
          sourcesBefore: 1,
          sourcesAfter: 1,
          formattingBefore: { strong: 0, italic: 0, blockquote: 0, br: 0 },
          formattingAfter: { strong: 2, italic: 1, blockquote: 0, br: 1 },
        },
        cost: { costUsd: "0.0019", latencyMs: 4567 },
      }),
    } as any;
    const cache = {
      getOrSet: vi.fn(async (opts: any) => (await opts.fetcher()).result),
    } as any;
    const env = {
      ARTICLE_INTERMEDIATE_MODEL: "gpt-5.2",
      ARTICLE_INTERMEDIATE_TTL_DAYS: 7,
    } as any;

    const handler = new ArticleIntermediateHandler(client, cache, env);
    const res = await handler.execute({
      run: { id: "r" } as any,
      step: { id: "s" } as any,
      project: { id: "p" } as any,
      previousOutputs: { optimize },
      attempt: 1,
    });
    expect(client.intermediate).toHaveBeenCalledTimes(1);
    expect(res.output).toMatchObject({
      meta: { keyword: "kortyzol", language: "pl", model: "gpt-5.2" },
      htmlContent: optimize.htmlContent,
      stats: { growth: 0.05, formattingAfter: { strong: 2 } },
    });
  });
});
