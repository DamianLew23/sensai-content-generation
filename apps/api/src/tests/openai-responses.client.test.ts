import { describe, it, expect, vi } from "vitest";
import { OpenAIResponsesClient } from "../llm/openai-responses.client";
import type { CostTrackerService } from "../llm/cost-tracker.service";

describe("OpenAIResponsesClient", () => {
  it("calls openai.responses.create with chaining params and records cost", async () => {
    const fakeResponse = {
      id: "resp_abc123",
      output_text: "<h2>Section</h2><p>Body</p>",
      model: "gpt-5.5",
      usage: { input_tokens: 100, output_tokens: 200 },
    };
    const create = vi.fn().mockResolvedValue(fakeResponse);
    const cost = { record: vi.fn().mockResolvedValue(undefined) } as unknown as CostTrackerService;

    const client = new OpenAIResponsesClient(
      { responses: { create } } as any,
      cost,
    );

    const result = await client.createBlock({
      ctx: { runId: "r1", stepId: "s1", attempt: 1 },
      model: "gpt-5.5",
      system: "SYS",
      input: "USER",
      previousResponseId: "resp_prev",
      reasoning: { effort: "medium" },
      verbosity: "medium",
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5.5",
        previous_response_id: "resp_prev",
        reasoning: { effort: "medium" },
        text: { verbosity: "medium" },
      }),
      expect.anything(), // request options
    );
    expect(result.id).toBe("resp_abc123");
    expect(result.outputText).toBe("<h2>Section</h2><p>Body</p>");
    expect(cost.record).toHaveBeenCalledOnce();
    const recordedCall = (cost.record as any).mock.calls[0][0];
    expect(recordedCall.provider).toBe("openai");
    expect(recordedCall.model).toBe("gpt-5.5");
    expect(recordedCall.promptTokens).toBe(100);
    expect(recordedCall.completionTokens).toBe(200);
  });

  it("uses requested model name (not date-versioned response.model) for cost lookup", async () => {
    const create = vi.fn().mockResolvedValue({
      id: "resp_x",
      output_text: "ok",
      model: "gpt-5.5-2025-12-11", // OpenAI returns date-versioned name
      usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 },
    });
    const recordedCalls: any[] = [];
    const cost = { record: vi.fn(async (c: any) => { recordedCalls.push(c); }) } as any;
    const client = new OpenAIResponsesClient({ responses: { create } } as any, cost);

    const res = await client.createBlock({
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      model: "gpt-5.5", // requested
      system: "S",
      input: "I",
    });

    // Cost is computed against args.model ("gpt-5.5" → priced) not response.model
    // (date-versioned, missing from price table → would yield "0").
    expect(res.costUsd).not.toBe("0");
    expect(Number(res.costUsd)).toBeGreaterThan(0);
    expect(recordedCalls[0].costUsd).toBe(res.costUsd);
    // The audit-trail `model` field still carries the versioned name from the response
    expect(res.model).toBe("gpt-5.5-2025-12-11");
  });

  it("omits chaining and reasoning params when not provided", async () => {
    const create = vi.fn().mockResolvedValue({
      id: "r1",
      output_text: "ok",
      model: "gpt-4o",
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const cost = { record: vi.fn() } as any;
    const client = new OpenAIResponsesClient({ responses: { create } } as any, cost);

    await client.createBlock({
      ctx: { runId: "r1", stepId: "s1", attempt: 1 },
      model: "gpt-4o",
      system: "S",
      input: "I",
    });

    const args = create.mock.calls[0][0];
    expect(args.previous_response_id).toBeUndefined();
    expect(args.reasoning).toBeUndefined();
    expect(args.text).toBeUndefined();
  });
});

describe("OpenAIResponsesClient.createBlock", () => {
  function makeClient(create: ReturnType<typeof vi.fn>) {
    const sdk = { responses: { create } } as any;
    const cost = { record: vi.fn() } as any;
    return new OpenAIResponsesClient(sdk, cost);
  }

  function fakeResponse() {
    return {
      id: "r1",
      model: "gpt-5.5-2025-12-11",
      output_text: "ok",
      usage: { input_tokens: 10, output_tokens: 5 },
    };
  }

  it("does NOT include tools when caller omits them", async () => {
    const create = vi.fn().mockResolvedValue(fakeResponse());
    const client = makeClient(create);

    await client.createBlock({
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      model: "gpt-5.5",
      system: "sys",
      input: "hi",
    });

    const params = create.mock.calls[0][0];
    expect(params.tools).toBeUndefined();
    expect(params.tool_choice).toBeUndefined();
  });

  it("forwards tools and tool_choice when provided", async () => {
    const create = vi.fn().mockResolvedValue(fakeResponse());
    const client = makeClient(create);

    await client.createBlock({
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      model: "gpt-5.5",
      system: "sys",
      input: "hi",
      tools: [{ type: "web_search_preview" }],
      toolChoice: "auto",
    });

    const params = create.mock.calls[0][0];
    expect(params.tools).toEqual([{ type: "web_search_preview" }]);
    expect(params.tool_choice).toBe("auto");
  });
});
