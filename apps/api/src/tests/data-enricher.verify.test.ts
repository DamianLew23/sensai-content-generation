import { describe, it, expect, vi } from "vitest";
import { verifyClaims } from "../tools/data-enricher/data-enricher.verify";
import type { OpenAIResponsesClient } from "../llm/openai-responses.client";
import type { ExtractedClaim } from "@sensai/shared";

function makeClaim(id: number, txt: string, q: string): ExtractedClaim {
  return {
    id,
    paragraphHtml: `<p>${txt}</p>`,
    claimText: txt,
    context: txt,
    claimTypes: ["statystyka"],
    score: 3,
    h2Context: "H",
    tagName: "p",
    question: q,
  };
}

describe("verifyClaims", () => {
  it("calls LLM with web_search_preview tool and parses statuses", async () => {
    const createBlock = vi.fn().mockResolvedValue({
      id: "r",
      outputText: JSON.stringify({
        "1": { status: "confirmed", source: "Źródło: WHO, 2024", source_url: "https://who.int/x", note: "" },
        "2": { status: "corrected", source: "Źródło: NFZ, 2024", source_url: "https://nfz.pl/y", note: "value off by 5%", corrected_value: "actually 25%" },
        "3": { status: "unverified", source: "", source_url: "", note: "no PL source" },
      }),
      model: "gpt-5.5",
      promptTokens: 200,
      completionTokens: 100,
      costUsd: "0.005",
      latencyMs: 5000,
    });
    const llm = { createBlock } as unknown as OpenAIResponsesClient;

    const claims = [
      makeClaim(1, "claim 1", "Q1"),
      makeClaim(2, "claim 2", "Q2"),
      makeClaim(3, "claim 3", "Q3"),
    ];
    const out = await verifyClaims({
      llm,
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      model: "gpt-5.5",
      keyword: "kortyzol",
      language: "pl",
      claims,
    });

    expect(createBlock).toHaveBeenCalledTimes(1);
    const callArgs = createBlock.mock.calls[0][0];
    expect(callArgs.tools).toEqual([{ type: "web_search_preview" }]);
    expect(callArgs.toolChoice).toBe("auto");

    expect(out.verifications).toHaveLength(3);
    const v1 = out.verifications.find((v) => v.claimId === 1)!;
    expect(v1.status).toBe("confirmed");
    expect(v1.sourceUrl).toBe("https://who.int/x");
    const v2 = out.verifications.find((v) => v.claimId === 2)!;
    expect(v2.status).toBe("corrected");
    expect(v2.correctedValue).toBe("actually 25%");
    const v3 = out.verifications.find((v) => v.claimId === 3)!;
    expect(v3.status).toBe("unverified");

    expect(out.cost.costUsd).toBe("0.005");
  });

  it("returns warning + every claim unverified when LLM call throws", async () => {
    const createBlock = vi.fn().mockRejectedValue(new Error("network"));
    const llm = { createBlock } as any;

    const out = await verifyClaims({
      llm,
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      model: "gpt-5.5",
      keyword: "k",
      language: "pl",
      claims: [makeClaim(1, "x", "Q")],
    });

    expect(out.verifications[0].status).toBe("unverified");
    expect(out.warnings.some((w) => w.kind === "enrich_verify_failed")).toBe(true);
  });

  it("uses 'Source' label for english articles", async () => {
    const createBlock = vi.fn().mockResolvedValue({
      id: "r",
      outputText: JSON.stringify({ "1": { status: "unverified", source: "", source_url: "", note: "" } }),
      model: "gpt-5.5",
      promptTokens: 1,
      completionTokens: 1,
      costUsd: "0",
      latencyMs: 1,
    });
    const llm = { createBlock } as any;

    await verifyClaims({
      llm,
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      model: "gpt-5.5",
      keyword: "k",
      language: "en",
      claims: [makeClaim(1, "x", "Q")],
    });

    const userInput = createBlock.mock.calls[0][0].input as string;
    expect(userInput).toMatch(/English/);
    expect(userInput).toMatch(/"Source: \./);
  });

  it("handles missing claim ids in LLM response by marking them unverified", async () => {
    const createBlock = vi.fn().mockResolvedValue({
      id: "r",
      outputText: JSON.stringify({
        "1": { status: "confirmed", source: "Źródło: x", source_url: "https://x.pl", note: "" },
      }),
      model: "gpt-5.5",
      promptTokens: 1,
      completionTokens: 1,
      costUsd: "0",
      latencyMs: 1,
    });
    const llm = { createBlock } as any;

    const out = await verifyClaims({
      llm,
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      model: "gpt-5.5",
      keyword: "k",
      language: "pl",
      claims: [makeClaim(1, "a", "Q1"), makeClaim(2, "b", "Q2")],
    });

    expect(out.verifications.find((v) => v.claimId === 2)!.status).toBe("unverified");
  });
});
