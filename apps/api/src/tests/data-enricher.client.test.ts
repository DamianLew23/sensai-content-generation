import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DataEnrichmentClient } from "../tools/data-enricher/data-enricher.client";
import type { OpenAIResponsesClient } from "../llm/openai-responses.client";

const FIXTURE = readFileSync(
  join(__dirname, "fixtures/sample-draft.html"),
  "utf-8",
);

describe("DataEnrichmentClient.enrich", () => {
  it("orchestrates extract → questions → verify → insert", async () => {
    const createBlock = vi
      .fn()
      // 1st call = questions stage (gpt-4.1-mini)
      .mockResolvedValueOnce({
        id: "q1",
        outputText: JSON.stringify(
          Object.fromEntries(
            Array.from({ length: 10 }, (_, i) => [String(i + 1), `Q${i + 1}`]),
          ),
        ),
        model: "gpt-4.1-mini",
        promptTokens: 100,
        completionTokens: 80,
        costUsd: "0.0001",
        latencyMs: 200,
      })
      // 2nd call = verify stage (gpt-5.2 + web_search_preview)
      .mockResolvedValueOnce({
        id: "v1",
        outputText: JSON.stringify({
          "1": { status: "confirmed", source: "Źródło: WHO, 2024", source_url: "https://who.int/x", note: "" },
        }),
        model: "gpt-5.2",
        promptTokens: 200,
        completionTokens: 100,
        costUsd: "0.005",
        latencyMs: 4000,
      });

    const llm = { createBlock } as unknown as OpenAIResponsesClient;
    const client = new DataEnrichmentClient(llm, {
      DATA_ENRICH_VERIFY_MODEL: "gpt-5.2",
      DATA_ENRICH_QUESTION_MODEL: "gpt-4.1-mini",
      DATA_ENRICH_MAX_CLAIMS: 15,
      DATA_ENRICH_MIN_SCORE: 2,
      DATA_ENRICH_LOW_CONFIRM_WARNING: 0.2,
    } as any);

    const out = await client.enrich({
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      keyword: "kortyzol",
      language: "pl",
      htmlContent: FIXTURE,
    });

    expect(createBlock).toHaveBeenCalledTimes(2);
    expect(out.claims.length).toBeGreaterThan(0);
    expect(out.verifications.length).toBe(out.claims.length);
    expect(out.htmlContent).toContain("(Źródło: WHO, 2024 — who.int/x");
    // The other claims have no verification → htmlContent is unchanged for them
    expect(out.cost.costUsd).toMatch(/^\d/);
    expect(Number(out.cost.costUsd)).toBeCloseTo(0.0051, 3);
  });

  it("short-circuits when no claims are found", async () => {
    const createBlock = vi.fn();
    const llm = { createBlock } as any;
    const client = new DataEnrichmentClient(llm, {
      DATA_ENRICH_VERIFY_MODEL: "gpt-5.2",
      DATA_ENRICH_QUESTION_MODEL: "gpt-4.1-mini",
      DATA_ENRICH_MAX_CLAIMS: 15,
      DATA_ENRICH_MIN_SCORE: 99, // impossibly high
      DATA_ENRICH_LOW_CONFIRM_WARNING: 0.2,
    } as any);

    const out = await client.enrich({
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      keyword: "k",
      language: "pl",
      htmlContent: FIXTURE,
    });

    expect(createBlock).not.toHaveBeenCalled();
    expect(out.claims).toHaveLength(0);
    expect(out.verifications).toHaveLength(0);
    expect(out.htmlContent).toBe(FIXTURE);
    expect(out.warnings.some((w) => w.kind === "enrich_no_claims_found")).toBe(true);
  });

  it("emits low_confirmation_rate warning when ratio is below threshold", async () => {
    const createBlock = vi
      .fn()
      .mockResolvedValueOnce({
        id: "q",
        outputText: JSON.stringify(
          Object.fromEntries(
            Array.from({ length: 10 }, (_, i) => [String(i + 1), `Q${i + 1}`]),
          ),
        ),
        model: "gpt-4.1-mini",
        promptTokens: 1, completionTokens: 1, costUsd: "0", latencyMs: 1,
      })
      .mockResolvedValueOnce({
        id: "v",
        outputText: JSON.stringify({
          "1": { status: "confirmed", source: "Źródło: x", source_url: "https://x.pl", note: "" },
          "2": { status: "unverified", source: "", source_url: "", note: "" },
          "3": { status: "unverified", source: "", source_url: "", note: "" },
          "4": { status: "unverified", source: "", source_url: "", note: "" },
          "5": { status: "unverified", source: "", source_url: "", note: "" },
          "6": { status: "unverified", source: "", source_url: "", note: "" },
          "7": { status: "unverified", source: "", source_url: "", note: "" },
          "8": { status: "unverified", source: "", source_url: "", note: "" },
          "9": { status: "unverified", source: "", source_url: "", note: "" },
          "10": { status: "unverified", source: "", source_url: "", note: "" },
        }),
        model: "gpt-5.2",
        promptTokens: 1, completionTokens: 1, costUsd: "0", latencyMs: 1,
      });
    const llm = { createBlock } as any;

    const client = new DataEnrichmentClient(llm, {
      DATA_ENRICH_VERIFY_MODEL: "gpt-5.2",
      DATA_ENRICH_QUESTION_MODEL: "gpt-4.1-mini",
      DATA_ENRICH_MAX_CLAIMS: 15,
      DATA_ENRICH_MIN_SCORE: 2,
      DATA_ENRICH_LOW_CONFIRM_WARNING: 0.2,
    } as any);

    const out = await client.enrich({
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      keyword: "k",
      language: "pl",
      htmlContent: FIXTURE,
    });

    expect(out.warnings.some((w) => w.kind === "enrich_low_confirmation_rate")).toBe(true);
  });
});
