import { describe, it, expect, vi } from "vitest";
import { DataEnrichHandler } from "../handlers/data-enrich.handler";
import type { DataEnrichmentClient } from "../tools/data-enricher/data-enricher.client";
import type { ToolCacheService } from "../tools/tool-cache.service";

function fakeDraft() {
  return {
    meta: {
      keyword: "kortyzol",
      h1Title: "Jak obniżyć kortyzol",
      language: "pl",
      primaryIntent: "Instrukcyjna",
      model: "gpt-5.2",
      generatedAt: new Date().toISOString(),
      useReasoning: true,
      reasoningEffort: "medium",
      verbosity: "medium",
    },
    htmlContent:
      "<h1>Jak obniżyć kortyzol</h1><h2>X</h2><p>Sen 7-9 godzin obniża kortyzol o 20-30%.</p>",
    blocks: [
      {
        sectionOrder: 0,
        sectionType: "intro",
        sectionVariant: null,
        header: "Intro",
        passageTrigger: "instruction",
        charCount: 10,
        responseId: "r1",
        promptTokens: 1, completionTokens: 1, costUsd: "0", latencyMs: 1,
      },
    ],
    imagePrompts: [],
    stats: {
      blockCount: 1, totalChars: 10, totalLatencyMs: 1,
      totalCostUsd: "0", totalPromptTokens: 1, totalCompletionTokens: 1,
      imagePromptCount: 0,
    },
    warnings: [],
  };
}

describe("DataEnrichHandler.execute", () => {
  it("throws when previousOutputs.draftGen is missing", async () => {
    const client = { enrich: vi.fn() } as unknown as DataEnrichmentClient;
    const cache = { getOrSet: vi.fn() } as unknown as ToolCacheService;
    const handler = new DataEnrichHandler(client, cache, {
      DATA_ENRICH_VERIFY_MODEL: "gpt-5.2",
      DATA_ENRICH_QUESTION_MODEL: "gpt-4.1-mini",
      DATA_ENRICH_MAX_CLAIMS: 15,
      DATA_ENRICH_MIN_SCORE: 2,
      DATA_ENRICH_LOW_CONFIRM_WARNING: 0.2,
      DATA_ENRICH_TTL_DAYS: 7,
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
    ).rejects.toThrow(/data\.enrich requires previousOutputs\.draftGen/);
  });

  it("calls cache.getOrSet and returns DataEnrichmentResult", async () => {
    const draft = fakeDraft();
    const client = {
      enrich: vi.fn().mockResolvedValue({
        htmlContent: "<h1>Ok</h1><p>Sen (Źródło: x).</p>",
        claims: [
          {
            id: 1,
            paragraphHtml: "<p>...</p>",
            claimText: "Sen 7-9 godzin obniża",
            context: "Sen 7-9 godzin obniża",
            claimTypes: ["statystyka"],
            score: 5,
            h2Context: "X",
            tagName: "p",
            question: "Q",
          },
        ],
        verifications: [
          {
            claimId: 1, status: "confirmed",
            source: "Źródło: x", sourceUrl: "https://x.pl",
            note: "",
          },
        ],
        warnings: [],
        stats: { sourcesAdded: 1, correctionsFlagged: 0, unverified: 0 },
        cost: { costUsd: "0.005", latencyMs: 4000 },
      }),
    } as unknown as DataEnrichmentClient;

    const cache = {
      getOrSet: vi.fn(async (args: any) => (await args.fetcher()).result),
    } as unknown as ToolCacheService;

    const handler = new DataEnrichHandler(client, cache, {
      DATA_ENRICH_VERIFY_MODEL: "gpt-5.2",
      DATA_ENRICH_QUESTION_MODEL: "gpt-4.1-mini",
      DATA_ENRICH_MAX_CLAIMS: 15,
      DATA_ENRICH_MIN_SCORE: 2,
      DATA_ENRICH_LOW_CONFIRM_WARNING: 0.2,
      DATA_ENRICH_TTL_DAYS: 7,
    } as any);

    const res = await handler.execute({
      run: { id: "r", input: {} },
      step: { id: "s" },
      project: { id: "p", config: {} },
      previousOutputs: { draftGen: draft },
      attempt: 1,
      forceRefresh: false,
    } as any);

    expect(cache.getOrSet).toHaveBeenCalledTimes(1);
    const out = res.output as any;
    expect(out.meta.keyword).toBe("kortyzol");
    expect(out.htmlContent).toContain("Źródło: x");
    expect(out.claims).toHaveLength(1);
    expect(out.verifications).toHaveLength(1);
    expect(out.stats.totalCostUsd).toBe("0.005");
    expect(out.stats.sourcesAdded).toBe(1);
    expect(out.stats.totalClaimsFound).toBe(1);
  });
});
