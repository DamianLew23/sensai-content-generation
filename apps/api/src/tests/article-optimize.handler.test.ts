import { describe, expect, it, vi } from "vitest";
import { ArticleOptimizeHandler } from "../handlers/article-optimize.handler";
import { DataEnrichmentResult } from "@sensai/shared";

function fakeEnrichment(): DataEnrichmentResult {
  return DataEnrichmentResult.parse({
    meta: {
      keyword: "kortyzol",
      language: "pl",
      verifyModel: "gpt-5.2",
      questionModel: "gpt-4.1-mini",
      generatedAt: new Date().toISOString(),
    },
    htmlContent:
      "<h1>Kortyzol</h1><p>Spada o 20% (Źródło: WHO, 2024 — who.int/x).</p>",
    claims: [],
    verifications: [],
    stats: {
      totalClaimsFound: 0,
      claimsVerified: 0,
      sourcesAdded: 0,
      correctionsFlagged: 0,
      unverified: 0,
      totalCostUsd: "0",
      totalLatencyMs: 0,
    },
    warnings: [],
  });
}

describe("ArticleOptimizeHandler", () => {
  it("declares type tool.article.optimize", () => {
    const h = new ArticleOptimizeHandler({} as any, {} as any, {} as any);
    expect(h.type).toBe("tool.article.optimize");
  });

  it("throws when previousOutputs.enrich missing", async () => {
    const h = new ArticleOptimizeHandler({} as any, {} as any, {} as any);
    await expect(
      h.execute({
        run: { id: "r" } as any,
        step: { id: "s" } as any,
        project: { id: "p" } as any,
        previousOutputs: {},
        attempt: 1,
      }),
    ).rejects.toThrow(/requires previousOutputs.enrich/);
  });

  it("delegates to client and returns ArticleOptimizeResult", async () => {
    const enrichment = fakeEnrichment();
    const client = {
      optimize: vi.fn().mockResolvedValue({
        htmlContent: enrichment.htmlContent,
        warnings: [],
        protection: {
          srcPlaceholdersTotal: 1,
          srcPlaceholdersMissing: 0,
          spansTotal: 1,
          spansMissing: 0,
        },
        stats: {
          inputLength: 100,
          outputLength: 95,
          sourcesBefore: 1,
          sourcesAfter: 1,
          anchorsRemoved: 0,
        },
        cost: { costUsd: "0.0021", latencyMs: 1234 },
      }),
    } as any;
    const cache = {
      getOrSet: vi.fn(async (opts: any) => (await opts.fetcher()).result),
    } as any;
    const env = {
      ARTICLE_OPTIMIZE_MODEL: "gpt-5.2",
      ARTICLE_OPTIMIZE_TTL_DAYS: 7,
    } as any;

    const handler = new ArticleOptimizeHandler(client, cache, env);
    const res = await handler.execute({
      run: { id: "r" } as any,
      step: { id: "s" } as any,
      project: { id: "p" } as any,
      previousOutputs: { enrich: enrichment },
      attempt: 1,
    });
    expect(client.optimize).toHaveBeenCalledTimes(1);
    expect(res.output).toMatchObject({
      meta: { keyword: "kortyzol", language: "pl", model: "gpt-5.2" },
      htmlContent: enrichment.htmlContent,
      stats: { sourcesAfter: 1, anchorsRemoved: 0 },
    });
  });
});
