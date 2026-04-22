import { describe, it, expect, vi, beforeEach } from "vitest";
import { YoucomResearchHandler } from "../handlers/youcom-research.handler";
import type { YoucomClient } from "../tools/youcom/youcom.client";
import type { ToolCacheService } from "../tools/tool-cache.service";
import type { StepContext } from "../orchestrator/step-handler";

function makeCtx(overrides: Partial<StepContext> = {}): StepContext {
  return {
    run: { id: "run-1", input: { topic: "Rust basics" } } as any,
    step: { id: "step-1" } as any,
    project: {
      id: "proj-1",
      name: "Demo",
      config: {
        toneOfVoice: "", targetAudience: "", guidelines: "",
        defaultModels: {}, promptOverrides: {},
      },
    } as any,
    previousOutputs: {},
    attempt: 1,
    ...overrides,
  };
}

const env = {
  YOUCOM_DEFAULT_EFFORT: "deep",
  YOUCOM_COST_LITE: 0.02,
  YOUCOM_COST_STANDARD: 0.05,
  YOUCOM_COST_DEEP: 0.15,
  YOUCOM_COST_EXHAUSTIVE: 0.40,
} as any;

describe("YoucomResearchHandler", () => {
  let client: { research: ReturnType<typeof vi.fn> };
  let cache: { getOrSet: ReturnType<typeof vi.fn> };
  let handler: YoucomResearchHandler;

  beforeEach(() => {
    client = { research: vi.fn() };
    cache = { getOrSet: vi.fn() };
    handler = new YoucomResearchHandler(client as any, cache as unknown as ToolCacheService, env);
  });

  it("reports type 'tool.youcom.research'", () => {
    expect(handler.type).toBe("tool.youcom.research");
  });

  it("happy path: calls cache.getOrSet with resolved effort and builds prompt from RunInput", async () => {
    cache.getOrSet.mockImplementationOnce(async (opts: any) => {
      const fetched = await opts.fetcher();
      return fetched.result;
    });
    client.research.mockResolvedValueOnce({
      output: {
        content: "Summary [1].",
        content_type: "text",
        sources: [{ url: "https://example.com", title: "A", snippets: ["s"] }],
      },
    });

    const ctx = makeCtx();
    const out = await handler.execute(ctx);

    expect(out.output).toEqual({
      content: "Summary [1].",
      sources: [{ url: "https://example.com", title: "A", snippets: ["s"] }],
    });

    const getOrSetCall = cache.getOrSet.mock.calls[0][0];
    expect(getOrSetCall.tool).toBe("youcom");
    expect(getOrSetCall.method).toBe("research");
    expect(getOrSetCall.params).toMatchObject({ effort: "deep" });
    expect(getOrSetCall.params.input).toContain("Rust basics");
    expect(getOrSetCall.ttlSeconds).toBe(14 * 24 * 3600);
    expect(getOrSetCall.runId).toBe("run-1");
    expect(getOrSetCall.stepId).toBe("step-1");

    const clientCall = client.research.mock.calls[0][0];
    expect(clientCall.research_effort).toBe("deep");
    expect(clientCall.input).toContain("Rust basics");
  });

  it("effort resolution: uses project.config.researchEffort when present", async () => {
    cache.getOrSet.mockImplementationOnce(async (opts: any) => (await opts.fetcher()).result);
    client.research.mockResolvedValueOnce({
      output: { content: "x", content_type: "text", sources: [] },
    });

    const ctx = makeCtx({
      project: {
        id: "p", name: "P",
        config: {
          toneOfVoice: "", targetAudience: "", guidelines: "",
          defaultModels: {}, promptOverrides: {},
          researchEffort: "exhaustive",
        },
      } as any,
    });
    await handler.execute(ctx);

    expect(client.research.mock.calls[0][0].research_effort).toBe("exhaustive");
    expect(cache.getOrSet.mock.calls[0][0].params.effort).toBe("exhaustive");
  });

  it("promptOverride: uses project.config.promptOverrides['tool.youcom.research'] with interpolation", async () => {
    cache.getOrSet.mockImplementationOnce(async (opts: any) => (await opts.fetcher()).result);
    client.research.mockResolvedValueOnce({
      output: { content: "x", content_type: "text", sources: [] },
    });

    const ctx = makeCtx({
      run: { id: "r", input: { topic: "T", mainKeyword: "K" } } as any,
      project: {
        id: "p", name: "P",
        config: {
          toneOfVoice: "", targetAudience: "", guidelines: "",
          defaultModels: {},
          promptOverrides: { "tool.youcom.research": "Research: {topic} | {mainKeyword}" },
        },
      } as any,
    });
    await handler.execute(ctx);

    expect(client.research.mock.calls[0][0].input).toBe("Research: T | K");
  });

  it("input > 40k chars: throws BEFORE calling cache/client", async () => {
    const bigTopic = "a".repeat(41_000);
    const ctx = makeCtx({
      run: { id: "r", input: { topic: bigTopic } } as any,
    });

    await expect(handler.execute(ctx)).rejects.toThrow(/40000|40k/);
    expect(cache.getOrSet).not.toHaveBeenCalled();
    expect(client.research).not.toHaveBeenCalled();
  });

  it("schema drift: Zod parse error propagates from fetcher", async () => {
    cache.getOrSet.mockImplementationOnce(async (opts: any) => (await opts.fetcher()).result);
    client.research.mockResolvedValueOnce({
      output: { content: 123 as any, content_type: "text", sources: [] },
    });

    const ctx = makeCtx();
    await expect(handler.execute(ctx)).rejects.toThrow();
  });

  it("cost: fetcher returns YOUCOM_COST_DEEP for deep effort", async () => {
    let capturedCost: string | undefined;
    cache.getOrSet.mockImplementationOnce(async (opts: any) => {
      const fetched = await opts.fetcher();
      capturedCost = fetched.costUsd;
      return fetched.result;
    });
    client.research.mockResolvedValueOnce({
      output: { content: "x", content_type: "text", sources: [] },
    });

    await handler.execute(makeCtx());
    expect(capturedCost).toBe("0.15");
  });

  it("latency: fetcher reports non-negative integer latencyMs", async () => {
    let capturedLatency = -1;
    cache.getOrSet.mockImplementationOnce(async (opts: any) => {
      const fetched = await opts.fetcher();
      capturedLatency = fetched.latencyMs;
      return fetched.result;
    });
    client.research.mockResolvedValueOnce({
      output: { content: "x", content_type: "text", sources: [] },
    });

    await handler.execute(makeCtx());
    expect(capturedLatency).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(capturedLatency)).toBe(true);
  });
});
