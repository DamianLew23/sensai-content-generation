import { describe, expect, it, vi } from "vitest";
import { ArticleHumanizeClient } from "../tools/article-humanize/article-humanize.client";

const stubEnv = {
  ARTICLE_HUMANIZE_MODEL: "gpt-5.2",
  ARTICLE_HUMANIZE_ASL_MIN: 12,
  ARTICLE_HUMANIZE_ASL_MAX: 20,
  ARTICLE_HUMANIZE_SENTENCE_HARD_CAP: 24,
  ARTICLE_HUMANIZE_MIN_STRONG_PER_BLOCK: 1,
  ARTICLE_HUMANIZE_MAX_STRONG_PER_BLOCK: 4,
  ARTICLE_HUMANIZE_STRONG_WORDS_PER_BLOCK: 500,
  ARTICLE_HUMANIZE_BOLD_SHARE_MAX: 0.08,
  ARTICLE_HUMANIZE_MIN_LEN_RATIO: 0.80,
  ARTICLE_HUMANIZE_MAX_LEN_RATIO: 1.20,
  ARTICLE_HUMANIZE_RETRY_ENABLED: true,
  ARTICLE_HUMANIZE_LANG_PROBE_THRESHOLD: 8,
} as const;

function llmEcho() {
  return {
    createBlock: vi.fn(async ({ input }: any) => ({
      id: "r",
      outputText: input,
      model: "gpt-5.2",
      promptTokens: 10,
      completionTokens: 10,
      costUsd: "0.000100",
      latencyMs: 100,
    })),
  } as any;
}

describe("ArticleHumanizeClient.humanize — phase 1", () => {
  it("returns echo'd HTML when LLM is identity (no retry triggers)", async () => {
    const inputHtml =
      "<h1>Tytuł</h1>" +
      "<p>Pierwsze <strong>kluczowe</strong> zdanie z 20% wartością.</p>" +
      "<p>Drugie zdanie z (Źródło: WHO, 2024 — who.int).</p>";
    const client = new ArticleHumanizeClient(llmEcho(), stubEnv as any);
    const out = await client.humanize({
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      keyword: "k",
      language: "pl",
      htmlContent: inputHtml,
    });
    expect(out.htmlContent).toContain("<h1>Tytuł</h1>");
    expect(out.stats.sourcesAfter).toBe(1);
    expect(out.stats.retryUsed).toBe(false);
    expect(out.stats.retryAccepted).toBe(false);
    expect(out.stats.totalCostUsd).toBe("0.000100");
    expect(out.stats.totalLatencyMs).toBe(100);
  });

  it("collapses em-dashes to space-dash-space", async () => {
    const inputHtml = "<h1>T</h1><p>Słowo — inne słowo.</p>";
    const client = new ArticleHumanizeClient(llmEcho(), stubEnv as any);
    const out = await client.humanize({
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      keyword: "k",
      language: "pl",
      htmlContent: inputHtml,
    });
    expect(out.htmlContent).not.toContain("—");
    expect(out.htmlContent).toContain("Słowo - inne");
    expect(out.stats.emDashesReplaced).toBe(1);
  });

  it("counts protection stats and reports zero missing on identity LLM", async () => {
    // 30% + 50% are wrapped as NUM spans. 2024 inside the source citation is
    // hidden by SRC protection so it does NOT become a span. Expected:
    // srcPlaceholdersTotal=1, spansTotal=2.
    const inputHtml =
      "<h1>T</h1><p>30% i 50% z (Źródło: WHO, 2024 — who.int).</p>";
    const client = new ArticleHumanizeClient(llmEcho(), stubEnv as any);
    const out = await client.humanize({
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      keyword: "k",
      language: "pl",
      htmlContent: inputHtml,
    });
    expect(out.protection.srcPlaceholdersTotal).toBe(1);
    expect(out.protection.srcPlaceholdersMissing).toBe(0);
    expect(out.protection.spansTotal).toBe(2); // 30% + 50%
    expect(out.protection.spansMissing).toBe(0);
  });
});
