import { describe, expect, it, vi } from "vitest";
import { ArticleIntermediateClient } from "../tools/article-intermediate/article-intermediate.client";

const stubEnv = {
  ARTICLE_INTERMEDIATE_MODEL: "gpt-5.5",
  ARTICLE_INTERMEDIATE_MAX_GROWTH: 0.10,
} as const;

function llmEcho() {
  return {
    createBlock: vi.fn(async ({ input }: any) => ({
      id: "r",
      outputText: input,
      model: "gpt-5.5",
      promptTokens: 1,
      completionTokens: 1,
      costUsd: "0",
      latencyMs: 1,
    })),
  } as any;
}

describe("ArticleIntermediateClient.intermediate", () => {
  it("returns transformed HTML and counts formatting before/after", async () => {
    const inputHtml =
      "<h1>T</h1><p>Body 20% text.</p>";
    const llm = {
      createBlock: vi.fn(async ({ input }: any) => ({
        id: "r",
        // Simulate model adding <strong> around "20%" wrapping span.
        outputText: input.replace(
          /<span data-token-id="NUM_[a-f0-9]+">20%<\/span>/,
          (m: string) => `<strong>${m}</strong>`,
        ),
        model: "gpt-5.5",
        promptTokens: 100,
        completionTokens: 105,
        costUsd: "0.0019",
        latencyMs: 4567,
      })),
    } as any;
    const client = new ArticleIntermediateClient(llm, stubEnv as any);
    const out = await client.intermediate({
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      keyword: "k",
      language: "pl",
      htmlContent: inputHtml,
    });
    expect(out.stats.formattingAfter.strong).toBe(1);
    expect(out.stats.formattingBefore.strong).toBe(0);
  });

  it("throws when <h1> missing", async () => {
    const llm = {
      createBlock: vi.fn(async () => ({
        id: "r",
        outputText: "<p>no heading here</p>",
        model: "gpt-5.5",
        promptTokens: 1,
        completionTokens: 1,
        costUsd: "0",
        latencyMs: 1,
      })),
    } as any;
    const client = new ArticleIntermediateClient(llm, stubEnv as any);
    await expect(
      client.intermediate({
        ctx: { runId: "r", stepId: "s", attempt: 1 },
        keyword: "k",
        language: "pl",
        htmlContent: "<h1>T</h1><p>x.</p>",
      }),
    ).rejects.toThrow(/missing.*h1/i);
  });

  it("throws when growth exceeds limit", async () => {
    const inputHtml = "<h1>T</h1><p>" + "x".repeat(100) + "</p>";
    const llm = {
      createBlock: vi.fn(async () => ({
        id: "r",
        // 200 chars of x — well over +10%.
        outputText: "<h1>T</h1><p>" + "x".repeat(200) + "</p>",
        model: "gpt-5.5",
        promptTokens: 1,
        completionTokens: 1,
        costUsd: "0",
        latencyMs: 1,
      })),
    } as any;
    const client = new ArticleIntermediateClient(llm, stubEnv as any);
    await expect(
      client.intermediate({
        ctx: { runId: "r", stepId: "s", attempt: 1 },
        keyword: "k",
        language: "pl",
        htmlContent: inputHtml,
      }),
    ).rejects.toThrow(/length growth/i);
  });

  it("throws when numbers are lost", async () => {
    const inputHtml = "<h1>T</h1><p>Spada o 20% w 2024.</p>";
    const llm = {
      createBlock: vi.fn(async () => ({
        id: "r",
        // Model dropped the percent.
        outputText: "<h1>T</h1><p>Spada w 2024.</p>",
        model: "gpt-5.5",
        promptTokens: 1,
        completionTokens: 1,
        costUsd: "0",
        latencyMs: 1,
      })),
    } as any;
    const client = new ArticleIntermediateClient(llm, stubEnv as any);
    await expect(
      client.intermediate({
        ctx: { runId: "r", stepId: "s", attempt: 1 },
        keyword: "k",
        language: "pl",
        htmlContent: inputHtml,
      }),
    ).rejects.toThrow(/lost.*number/i);
  });

  it("throws when source citation count drops", async () => {
    const inputHtml =
      "<h1>T</h1><p>X (Źródło: WHO, 2024 — who.int).</p>";
    const llm = {
      createBlock: vi.fn(async () => ({
        id: "r",
        outputText: "<h1>T</h1><p>X.</p>", // citation gone
        model: "gpt-5.5",
        promptTokens: 1,
        completionTokens: 1,
        costUsd: "0",
        latencyMs: 1,
      })),
    } as any;
    const client = new ArticleIntermediateClient(llm, stubEnv as any);
    await expect(
      client.intermediate({
        ctx: { runId: "r", stepId: "s", attempt: 1 },
        keyword: "k",
        language: "pl",
        htmlContent: inputHtml,
      }),
    ).rejects.toThrow(/source.*lost|placeholder/i);
  });

  it("throws when <a> tags appear in output", async () => {
    const inputHtml = "<h1>T</h1><p>x.</p>";
    const llm = {
      createBlock: vi.fn(async () => ({
        id: "r",
        outputText: '<h1>T</h1><p><a href="x">x</a>.</p>',
        model: "gpt-5.5",
        promptTokens: 1,
        completionTokens: 1,
        costUsd: "0",
        latencyMs: 1,
      })),
    } as any;
    const client = new ArticleIntermediateClient(llm, stubEnv as any);
    await expect(
      client.intermediate({
        ctx: { runId: "r", stepId: "s", attempt: 1 },
        keyword: "k",
        language: "pl",
        htmlContent: inputHtml,
      }),
    ).rejects.toThrow(/anchor|<a>/i);
  });

  it("throws when SEO intro detected", async () => {
    // Input plain text length must be similar to output's so the +10% growth
    // guard does not fire first (guard order is growth → numbers → sources → seo).
    const inputHtml =
      "<h1>T</h1><p>Krótkie wprowadzenie do tematu artykułu, bez zbędnych słów.</p>";
    const llm = {
      createBlock: vi.fn(async () => ({
        id: "r",
        outputText:
          "<h1>T</h1><p>Zanim przejdziemy do meritum, warto zaznaczyć krótko x.</p>",
        model: "gpt-5.5",
        promptTokens: 1,
        completionTokens: 1,
        costUsd: "0",
        latencyMs: 1,
      })),
    } as any;
    const client = new ArticleIntermediateClient(llm, stubEnv as any);
    await expect(
      client.intermediate({
        ctx: { runId: "r", stepId: "s", attempt: 1 },
        keyword: "k",
        language: "pl",
        htmlContent: inputHtml,
      }),
    ).rejects.toThrow(/seo.*intro/i);
  });
});
