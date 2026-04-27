import { describe, it, expect, vi, beforeEach } from "vitest";
import { ContentExtractorClient } from "../tools/content-extractor/content-extractor.client";
import { ExtractionResult } from "@sensai/shared";

const env = {
  CONTENT_EXTRACT_MODEL: "google/gemini-3-flash-preview",
  CONTENT_EXTRACT_MAX_INPUT_CHARS: 120_000,
} as const;

function makeSampleExtraction() {
  return ExtractionResult.parse({
    metadata: {
      keyword: "kortyzol",
      language: "pl",
      sourceUrlCount: 2,
      createdAt: "2026-04-24T00:00:00.000Z",
    },
    facts: Array.from({ length: 5 }, (_, i) => ({
      id: `F${i + 1}`,
      text: `Fact ${i + 1} about kortyzol.`,
      category: "definition" as const,
      priority: "high" as const,
      confidence: 0.8,
      sourceUrls: [],
    })),
    data: Array.from({ length: 3 }, (_, i) => ({
      id: `D${i + 1}`,
      definition: `Measurement ${i + 1}`,
      value: `${i + 1}`,
      unit: "mg",
      sourceUrls: [],
    })),
    ideations: Array.from({ length: 3 }, (_, i) => ({
      id: `I${i + 1}`,
      type: "checklist" as const,
      title: `Idea ${i + 1}`,
      description: `Description ${i + 1}`,
      audience: "",
      channels: [],
      keywords: [],
      priority: "medium" as const,
    })),
  });
}

describe("ContentExtractorClient", () => {
  let llm: { generateObject: ReturnType<typeof vi.fn> };
  let client: ContentExtractorClient;

  beforeEach(() => {
    llm = { generateObject: vi.fn() };
    client = new ContentExtractorClient(llm as any, env as any);
  });

  it("passes model from env and forwards system/prompt/schema", async () => {
    const sample = makeSampleExtraction();
    llm.generateObject.mockResolvedValueOnce({
      object: sample,
      model: env.CONTENT_EXTRACT_MODEL,
      promptTokens: 1200,
      completionTokens: 800,
      costUsd: "0.002400",
      latencyMs: 1500,
    });

    const out = await client.extract({
      ctx: { runId: "r1", stepId: "s1", attempt: 1 },
      system: "SYSTEM",
      prompt: "USER_PROMPT",
    });

    expect(llm.generateObject).toHaveBeenCalledTimes(1);
    const call = llm.generateObject.mock.calls[0][0];
    expect(call.ctx.model).toBe("google/gemini-3-flash-preview");
    expect(call.ctx.runId).toBe("r1");
    expect(call.ctx.stepId).toBe("s1");
    expect(call.ctx.attempt).toBe(1);
    expect(call.system).toBe("SYSTEM");
    expect(call.prompt).toBe("USER_PROMPT");
    expect(call.schema).toBe(ExtractionResult);

    expect(out.result).toBe(sample);
    expect(out.costUsd).toBe("0.002400");
    expect(out.model).toBe("google/gemini-3-flash-preview");
    expect(out.promptTokens).toBe(1200);
    expect(out.completionTokens).toBe(800);
    expect(out.latencyMs).toBe(1500);
  });

  it("throws when prompt exceeds CONTENT_EXTRACT_MAX_INPUT_CHARS", async () => {
    const huge = "x".repeat(env.CONTENT_EXTRACT_MAX_INPUT_CHARS + 1);
    await expect(
      client.extract({
        ctx: { runId: "r1", stepId: "s1", attempt: 1 },
        system: "SYSTEM",
        prompt: huge,
      }),
    ).rejects.toThrow(/exceeds.*CONTENT_EXTRACT_MAX_INPUT_CHARS/);
    expect(llm.generateObject).not.toHaveBeenCalled();
  });
});
