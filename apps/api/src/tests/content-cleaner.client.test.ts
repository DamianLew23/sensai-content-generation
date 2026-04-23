import { describe, it, expect, vi, beforeEach } from "vitest";
import { ContentCleanerClient } from "../tools/content-cleaner/content-cleaner.client";

describe("ContentCleanerClient", () => {
  let llm: { embedMany: ReturnType<typeof vi.fn> };
  let client: ContentCleanerClient;
  const env = {
    CLEANING_EMBEDDING_MODEL: "text-embedding-3-small",
    CLEANING_COST_PER_1M_TOKENS: 0.02,
  } as any;

  beforeEach(() => {
    llm = { embedMany: vi.fn() };
    client = new ContentCleanerClient(llm as any, env);
  });

  it("calls llm.embedMany with model from env and returns embeddings + cost", async () => {
    llm.embedMany.mockResolvedValueOnce({
      embeddings: [[0.1, 0.2], [0.3, 0.4]],
      tokensUsed: 1_000_000,
      latencyMs: 100,
    });

    const res = await client.embedTexts(["hello", "world"], { runId: "r", stepId: "s" });

    expect(llm.embedMany).toHaveBeenCalledTimes(1);
    expect(llm.embedMany).toHaveBeenCalledWith({
      ctx: { runId: "r", stepId: "s" },
      model: "text-embedding-3-small",
      values: ["hello", "world"],
    });
    expect(res.embeddings).toEqual([[0.1, 0.2], [0.3, 0.4]]);
    expect(res.tokensUsed).toBe(1_000_000);
    expect(res.costUsd).toBe("0.02"); // 1M tokens * $0.02 / 1M = $0.02
  });

  it("returns no-op result for empty input", async () => {
    const res = await client.embedTexts([], { runId: "r", stepId: "s" });
    expect(res.embeddings).toEqual([]);
    expect(res.tokensUsed).toBe(0);
    expect(res.costUsd).toBe("0");
    expect(llm.embedMany).not.toHaveBeenCalled();
  });

  it("batches when input exceeds MAX_BATCH_SIZE (2048)", async () => {
    const inputs = Array.from({ length: 2500 }, (_, i) => `text ${i}`);
    llm.embedMany
      .mockResolvedValueOnce({
        embeddings: Array(2048).fill([0.1]),
        tokensUsed: 2048,
        latencyMs: 50,
      })
      .mockResolvedValueOnce({
        embeddings: Array(452).fill([0.2]),
        tokensUsed: 452,
        latencyMs: 30,
      });

    const res = await client.embedTexts(inputs, { runId: "r", stepId: "s" });

    expect(llm.embedMany).toHaveBeenCalledTimes(2);
    expect(llm.embedMany.mock.calls[0][0].values).toHaveLength(2048);
    expect(llm.embedMany.mock.calls[1][0].values).toHaveLength(452);
    expect(res.embeddings).toHaveLength(2500);
    expect(res.tokensUsed).toBe(2048 + 452);
  });

  it("truncates long texts (> MAX_TEXT_CHARS = 8000) before sending", async () => {
    const long = "a".repeat(10_000);
    const short = "hi";
    llm.embedMany.mockResolvedValueOnce({
      embeddings: [[0.1], [0.2]],
      tokensUsed: 100,
      latencyMs: 10,
    });

    await client.embedTexts([long, short], { runId: "r", stepId: "s" });

    const sentValues = llm.embedMany.mock.calls[0][0].values;
    expect(sentValues[0]).toHaveLength(8000);
    expect(sentValues[1]).toBe("hi");
  });

  it("calculates cost with precise arithmetic", async () => {
    llm.embedMany.mockResolvedValueOnce({
      embeddings: [[0.1]],
      tokensUsed: 50_000,
      latencyMs: 10,
    });

    const res = await client.embedTexts(["x"], { runId: "r", stepId: "s" });
    // 50_000 tokens * $0.02 / 1_000_000 = $0.001
    expect(res.costUsd).toBe("0.001");
  });

  it("propagates errors from llm.embedMany", async () => {
    llm.embedMany.mockRejectedValueOnce(new Error("rate limit"));
    await expect(
      client.embedTexts(["x"], { runId: "r", stepId: "s" }),
    ).rejects.toThrow("rate limit");
  });
});
