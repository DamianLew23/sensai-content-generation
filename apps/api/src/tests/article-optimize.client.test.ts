import { describe, expect, it, vi } from "vitest";
import { ArticleOptimizeClient } from "../tools/article-optimize/article-optimize.client";

const stubEnv = {
  ARTICLE_OPTIMIZE_MODEL: "gpt-5.5",
} as const;

describe("ArticleOptimizeClient.optimize", () => {
  it("tokenizes input, calls LLM, restores SRC placeholders, unwraps anchors", async () => {
    const inputHtml =
      '<h1>T</h1><p><a href="x">Polecam</a> 20% (Źródło: WHO, 2024 — who.int).</p>';

    const llm = {
      createBlock: vi.fn(async ({ system, input }: any) => {
        // Echo the protected HTML (model leaves SRC + spans intact).
        expect(system).toContain("ZERO FIRST PERSON");
        expect(input).toContain("[[SRC_000]]");
        expect(input).toContain("data-token-id=");
        return {
          id: "resp_1",
          outputText: input,
          model: "gpt-5.5",
          promptTokens: 100,
          completionTokens: 100,
          costUsd: "0.0021",
          latencyMs: 1234,
        };
      }),
    } as any;

    const client = new ArticleOptimizeClient(llm, stubEnv as any);

    const out = await client.optimize({
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      keyword: "kortyzol",
      language: "pl",
      htmlContent: inputHtml,
    });

    expect(llm.createBlock).toHaveBeenCalledTimes(1);
    expect(out.htmlContent).toContain("(Źródło: WHO, 2024 — who.int)");
    // <a> tags removed; URL POLICY enforced mechanically.
    expect(out.htmlContent).not.toMatch(/<a\b/);
    expect(out.stats.anchorsRemoved).toBe(1);
    expect(out.protection.srcPlaceholdersTotal).toBe(1);
    expect(out.protection.srcPlaceholdersMissing).toBe(0);
    expect(out.cost.costUsd).toBe("0.0021");
  });

  it("throws when SRC placeholder is lost (hard fail)", async () => {
    const inputHtml = "<h1>T</h1><p>20% (Źródło: WHO, 2024 — who.int).</p>";
    const llm = {
      createBlock: vi.fn(async ({ input }: any) => ({
        id: "r",
        outputText: input.replace(/\[\[SRC_000\]\]/, ""),
        model: "gpt-5.5",
        promptTokens: 1,
        completionTokens: 1,
        costUsd: "0",
        latencyMs: 1,
      })),
    } as any;
    const client = new ArticleOptimizeClient(llm, stubEnv as any);
    await expect(
      client.optimize({
        ctx: { runId: "r", stepId: "s", attempt: 1 },
        keyword: "k",
        language: "pl",
        htmlContent: inputHtml,
      }),
    ).rejects.toThrow(/source placeholder lost/i);
  });

  it("emits soft warning when spans go missing", async () => {
    const inputHtml = "<h1>T</h1><p>50 mg dose.</p>";
    const llm = {
      createBlock: vi.fn(async ({ input }: any) => ({
        id: "r",
        // Strip the span tags but keep text — simulates model unwrapping.
        outputText: input.replace(/<span[^>]*>([^<]*)<\/span>/g, "$1"),
        model: "gpt-5.5",
        promptTokens: 1,
        completionTokens: 1,
        costUsd: "0",
        latencyMs: 1,
      })),
    } as any;
    const client = new ArticleOptimizeClient(llm, stubEnv as any);
    const out = await client.optimize({
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      keyword: "k",
      language: "pl",
      htmlContent: inputHtml,
    });
    expect(out.warnings.some((w) => w.kind === "optimize_spans_missing")).toBe(true);
    expect(out.protection.spansMissing).toBeGreaterThan(0);
  });
});
