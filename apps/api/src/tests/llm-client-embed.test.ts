import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted so variables are available when vi.mock factories are hoisted to top
const { mockEmbedMany, mockOpenAIEmbedding } = vi.hoisted(() => ({
  mockEmbedMany: vi.fn(),
  mockOpenAIEmbedding: vi.fn(),
}));

// Mock the AI SDK functions BEFORE importing LlmClient
vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return { ...actual, embedMany: mockEmbedMany };
});

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: () => ({
    embedding: (modelId: string) => {
      mockOpenAIEmbedding(modelId);
      return { modelId };
    },
  }),
}));

vi.mock("../config/env", () => ({
  loadEnv: () => ({
    OPENROUTER_API_KEY: "or-key",
    OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
    DEFAULT_MODEL: "openai/gpt-5-mini",
    OPENAI_API_KEY: "sk-test",
  }),
}));

import { LlmClient } from "../llm/llm.client";

describe("LlmClient.embedMany", () => {
  let costTracker: { record: ReturnType<typeof vi.fn> };
  let client: LlmClient;

  beforeEach(() => {
    vi.clearAllMocks();
    costTracker = { record: vi.fn() };
    client = new LlmClient(costTracker as any);
  });

  it("returns embeddings and tokensUsed from AI SDK", async () => {
    mockEmbedMany.mockResolvedValueOnce({
      embeddings: [[0.1, 0.2], [0.3, 0.4]],
      usage: { tokens: 42 },
    });

    const res = await client.embedMany({
      ctx: { runId: "r1", stepId: "s1" },
      model: "text-embedding-3-small",
      values: ["hello", "world"],
    });

    expect(res.embeddings).toEqual([[0.1, 0.2], [0.3, 0.4]]);
    expect(res.tokensUsed).toBe(42);
    expect(res.latencyMs).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(res.latencyMs)).toBe(true);
    expect(mockOpenAIEmbedding).toHaveBeenCalledWith("text-embedding-3-small");
  });

  it("handles missing usage.tokens gracefully", async () => {
    mockEmbedMany.mockResolvedValueOnce({
      embeddings: [[0.1]],
      usage: undefined,
    });

    const res = await client.embedMany({
      ctx: { runId: "r1", stepId: "s1" },
      model: "text-embedding-3-small",
      values: ["hi"],
    });

    expect(res.tokensUsed).toBe(0);
  });

  it("does NOT call cost-tracker (caller records via ToolCallRecorder)", async () => {
    mockEmbedMany.mockResolvedValueOnce({
      embeddings: [[0.1]],
      usage: { tokens: 10 },
    });

    await client.embedMany({
      ctx: { runId: "r1", stepId: "s1" },
      model: "text-embedding-3-small",
      values: ["hi"],
    });

    expect(costTracker.record).not.toHaveBeenCalled();
  });

  it("propagates errors from embedMany", async () => {
    mockEmbedMany.mockRejectedValueOnce(new Error("rate limit"));

    await expect(
      client.embedMany({
        ctx: { runId: "r1", stepId: "s1" },
        model: "text-embedding-3-small",
        values: ["hi"],
      }),
    ).rejects.toThrow("rate limit");
  });
});
