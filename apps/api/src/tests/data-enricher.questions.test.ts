import { describe, it, expect, vi } from "vitest";
import { generateQuestions } from "../tools/data-enricher/data-enricher.questions";
import type { OpenAIResponsesClient } from "../llm/openai-responses.client";
import type { ExtractedClaim } from "@sensai/shared";

function makeClaim(id: number, claimText: string, h2: string): ExtractedClaim {
  return {
    id,
    paragraphHtml: `<p>${claimText}</p>`,
    claimText,
    context: claimText,
    claimTypes: ["statystyka"],
    score: 3,
    h2Context: h2,
    tagName: "p",
  };
}

describe("generateQuestions", () => {
  it("calls the LLM once and assigns questions per claim id", async () => {
    const createBlock = vi.fn().mockResolvedValue({
      id: "r",
      outputText:
        '{"1":"Jaka jest dzienna dawka X?","2":"Ile godzin snu obniża kortyzol?"}',
      model: "gpt-4.1-mini",
      promptTokens: 100,
      completionTokens: 50,
      costUsd: "0.0001",
      latencyMs: 200,
    });
    const llm = { createBlock } as unknown as OpenAIResponsesClient;

    const claims = [
      makeClaim(1, "300-600 mg ekstraktu na dzień", "Adaptogeny"),
      makeClaim(2, "Sen 7-9 godzin obniża kortyzol o 20-30%", "Sen"),
    ];

    const out = await generateQuestions({
      llm,
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      model: "gpt-4.1-mini",
      keyword: "kortyzol",
      claims,
    });

    expect(createBlock).toHaveBeenCalledTimes(1);
    expect(out.claims[0].question).toBe("Jaka jest dzienna dawka X?");
    expect(out.claims[1].question).toBe(
      "Ile godzin snu obniża kortyzol?",
    );
    expect(out.cost.costUsd).toBe("0.0001");
    expect(out.cost.latencyMs).toBe(200);
  });

  it("falls back to claimText when LLM omits a claim id", async () => {
    const createBlock = vi.fn().mockResolvedValue({
      id: "r",
      outputText: '{"1":"Q1"}', // claim 2 missing
      model: "gpt-4.1-mini",
      promptTokens: 1,
      completionTokens: 1,
      costUsd: "0",
      latencyMs: 1,
    });
    const llm = { createBlock } as any;

    const claims = [
      makeClaim(1, "claim 1 text", "H"),
      makeClaim(2, "claim 2 text", "H"),
    ];

    const out = await generateQuestions({
      llm,
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      model: "gpt-4.1-mini",
      keyword: "k",
      claims,
    });

    expect(out.claims[1].question).toBe("claim 2 text");
  });

  it("strips markdown fences before parsing", async () => {
    const createBlock = vi.fn().mockResolvedValue({
      id: "r",
      outputText: "```json\n{\"1\":\"Q\"}\n```",
      model: "gpt-4.1-mini",
      promptTokens: 1,
      completionTokens: 1,
      costUsd: "0",
      latencyMs: 1,
    });
    const llm = { createBlock } as any;
    const claims = [makeClaim(1, "x", "H")];

    const out = await generateQuestions({
      llm,
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      model: "gpt-4.1-mini",
      keyword: "k",
      claims,
    });
    expect(out.claims[0].question).toBe("Q");
  });

  it("returns warning + claimText fallback when LLM throws", async () => {
    const createBlock = vi.fn().mockRejectedValue(new Error("boom"));
    const llm = { createBlock } as any;

    const claims = [makeClaim(1, "fallback text", "H")];

    const out = await generateQuestions({
      llm,
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      model: "gpt-4.1-mini",
      keyword: "k",
      claims,
    });
    expect(out.claims[0].question).toBe("fallback text");
    expect(out.warnings.some((w) => w.kind === "enrich_questions_failed")).toBe(true);
  });
});
