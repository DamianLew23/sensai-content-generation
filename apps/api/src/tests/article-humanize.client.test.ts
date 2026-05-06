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

describe("ArticleHumanizeClient.humanize — retry trigger", () => {
  function llmCustom(handler: (callIndex: number, args: any) => string) {
    let i = 0;
    return {
      createBlock: vi.fn(async (args: any) => {
        const out = handler(i, args);
        i += 1;
        return {
          id: `r${i}`,
          outputText: out,
          model: "gpt-5.2",
          promptTokens: 5,
          completionTokens: 5,
          costUsd: "0.000050",
          latencyMs: 50,
        };
      }),
    } as any;
  }

  it("triggers retry when phase 1 has a sentence over hard cap", async () => {
    // Phase-1 output: one long sentence (>24 words) — triggers `long`.
    // Phase-2 output: same shape but shorter, similar plain-text length to
    // input so the length-ratio guard does not fire after retry.
    const phase1Long = Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ");
    const phase2Short = Array.from({ length: 14 }, (_, i) => `w${i}xy`).join(" ");
    const phase1Out = `<h1>T</h1><p><strong>k</strong> ${phase1Long}.</p>`;
    const phase2Out = `<h1>T</h1><p><strong>k</strong> ${phase2Short}.</p>`;
    const llm = llmCustom((i, _args) => (i === 0 ? phase1Out : phase2Out));

    // Input has 14 word tokens; plain text length similar to phase-2 output.
    const inputHtml = `<h1>T</h1><p>${Array.from({ length: 14 }, (_, i) => `w${i}xy`).join(" ")}.</p>`;
    const client = new ArticleHumanizeClient(llm, stubEnv as any);
    const out = await client.humanize({
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      keyword: "k",
      language: "pl",
      htmlContent: inputHtml,
    });
    expect(out.stats.retryUsed).toBe(true);
    expect(out.stats.retryAccepted).toBe(true);
    expect(out.stats.totalCostUsd).toBe("0.000100"); // 0.000050 + 0.000050
    expect(out.stats.totalLatencyMs).toBe(100);
    expect(llm.createBlock).toHaveBeenCalledTimes(2);
  });

  it("rejects retry when it adds <a> tags", async () => {
    // Phase-1 output: long sentence triggers retry. Phase-2 output: introduces <a>.
    const phase1Long = Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ");
    const phase1Out = `<h1>T</h1><p><strong>k</strong> ${phase1Long}.</p>`;
    const phase2Out = `<h1>T</h1><p><strong>k</strong> short stuff. <a href="x">link</a>.</p>`;
    const llm = llmCustom((i, _args) => (i === 0 ? phase1Out : phase2Out));

    // Input plain-text length must be close to phase-1 length so the ratio
    // guard does not fire on the rejected-retry fallback path.
    const phase1Long30Words = Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ");
    const inputHtml = `<h1>T</h1><p>${phase1Long30Words}.</p>`;
    const client = new ArticleHumanizeClient(llm, stubEnv as any);
    const out = await client.humanize({
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      keyword: "k",
      language: "pl",
      htmlContent: inputHtml,
    });
    expect(out.stats.retryUsed).toBe(true);
    expect(out.stats.retryAccepted).toBe(false);
    // Final HTML is the phase-1 output, not phase-2.
    expect(out.htmlContent).not.toContain("<a href");
    expect(
      out.warnings.some((w) => w.kind === "humanize_retry_rejected_anchors"),
    ).toBe(true);
  });

  it("does not retry when retry is disabled even if triggers fire", async () => {
    const phase1Long = Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ");
    const phase1Out = `<h1>T</h1><p><strong>k</strong> ${phase1Long}.</p>`;
    const llm = llmCustom((_i, _args) => phase1Out);

    // Match phase-1 length to keep ratio guard happy on the disabled-retry path.
    const phase1Long30Words = Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ");
    const inputHtml = `<h1>T</h1><p>${phase1Long30Words}.</p>`;
    const client = new ArticleHumanizeClient(llm, {
      ...(stubEnv as any),
      ARTICLE_HUMANIZE_RETRY_ENABLED: false,
    });
    const out = await client.humanize({
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      keyword: "k",
      language: "pl",
      htmlContent: inputHtml,
    });
    expect(out.stats.retryUsed).toBe(false);
    expect(llm.createBlock).toHaveBeenCalledTimes(1);
  });
});
