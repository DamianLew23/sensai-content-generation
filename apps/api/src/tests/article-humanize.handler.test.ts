import { describe, expect, it, vi } from "vitest";
import { ArticleHumanizeHandler } from "../handlers/article-humanize.handler";

const stubEnv = {
  ARTICLE_HUMANIZE_MODEL: "gpt-5.2",
  ARTICLE_HUMANIZE_TTL_DAYS: 7,
} as const;

const sampleIntermediate = {
  meta: {
    keyword: "kortyzol",
    language: "pl",
    model: "gpt-5.2",
    promptVersion: "v1",
    generatedAt: "2026-05-04T12:00:00.000Z",
  },
  htmlContent:
    "<h1>Tytuł testowy</h1><p>Akapit testowy z liczbą 20%.</p>",
  stats: {
    inputLength: 100,
    outputLength: 100,
    growth: 0,
    sourcesBefore: 0,
    sourcesAfter: 0,
    formattingBefore: { strong: 0, italic: 0, blockquote: 0, br: 0 },
    formattingAfter: { strong: 0, italic: 0, blockquote: 0, br: 0 },
    totalCostUsd: "0",
    totalLatencyMs: 0,
  },
  protection: {
    srcPlaceholdersTotal: 0,
    srcPlaceholdersMissing: 0,
    spansTotal: 0,
    spansMissing: 0,
  },
  warnings: [],
};

describe("ArticleHumanizeHandler", () => {
  it("throws when previousOutputs.intermediate missing", async () => {
    const stubClient = { humanize: vi.fn() } as any;
    const stubCache = {
      getOrSet: async (opts: any) => (await opts.fetcher()).result,
    } as any;
    const handler = new ArticleHumanizeHandler(stubClient, stubCache, stubEnv as any);
    await expect(
      handler.execute({
        run: { id: "r", input: {} },
        step: { id: "s" },
        project: { id: "p", config: {} },
        previousOutputs: {},
        attempt: 1,
        forceRefresh: false,
      } as any),
    ).rejects.toThrow(/intermediate/i);
  });

  it("delegates to client and returns ArticleHumanizeResult shape", async () => {
    const stubClient = {
      humanize: vi.fn(async () => ({
        htmlContent: "<h1>T</h1><p>Zhumanizowane.</p>",
        warnings: [],
        protection: {
          srcPlaceholdersTotal: 0,
          srcPlaceholdersMissing: 0,
          spansTotal: 1,
          spansMissing: 0,
        },
        stats: {
          inputLength: 100,
          outputLength: 95,
          ratio: 0.95,
          sourcesBefore: 0,
          sourcesAfter: 0,
          emDashesReplaced: 0,
          retryUsed: false,
          retryAccepted: false,
          readability: {
            wordsTotal: 10,
            sentencesTotal: 1,
            avgSentenceLength: 10,
            longSentencesGtCap: 0,
            strongSpans: 0,
            boldTokenCount: 0,
            boldShare: 0,
          },
          sentence: {
            varianceInput: 5,
            varianceOutput: 8,
            cvOutput: 0.5,
            minLength: 4,
            maxLength: 14,
            avgLength: 10,
          },
          totalCostUsd: "0.0001",
          totalLatencyMs: 100,
        },
      })),
    } as any;
    const stubCache = {
      getOrSet: async (opts: any) => (await opts.fetcher()).result,
    } as any;
    const handler = new ArticleHumanizeHandler(stubClient, stubCache, stubEnv as any);

    const res = await handler.execute({
      run: { id: "r", input: {} },
      step: { id: "s" },
      project: { id: "p", config: {} },
      previousOutputs: { intermediate: sampleIntermediate },
      attempt: 1,
      forceRefresh: false,
    } as any);

    const out = res.output as any;
    expect(out.meta.keyword).toBe("kortyzol");
    expect(out.meta.language).toBe("pl");
    expect(out.meta.model).toBe("gpt-5.2");
    expect(out.meta.promptVersion).toBe("v1");
    expect(out.htmlContent).toContain("<h1>T</h1>");
    expect(out.stats.inputLength).toBe(100);
    expect(out.stats.outputLength).toBe(95);
    expect(out.stats.totalCostUsd).toBe("0.0001");
    expect(out.stats.totalLatencyMs).toBe(100);
    expect(stubClient.humanize).toHaveBeenCalledOnce();
  });
});
