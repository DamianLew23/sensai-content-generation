import { describe, it, expect, vi } from "vitest";
import { OpenAIResponsesClient } from "../llm/openai-responses.client";
import type { CostTrackerService } from "../llm/cost-tracker.service";

describe("OpenAIResponsesClient", () => {
  it("calls openai.responses.create with chaining params and records cost", async () => {
    const fakeResponse = {
      id: "resp_abc123",
      output_text: "<h2>Section</h2><p>Body</p>",
      model: "gpt-5.2",
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
      model: "gpt-5.2",
      system: "SYS",
      input: "USER",
      previousResponseId: "resp_prev",
      reasoning: { effort: "medium" },
      verbosity: "medium",
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5.2",
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
    expect(recordedCall.model).toBe("gpt-5.2");
    expect(recordedCall.promptTokens).toBe(100);
    expect(recordedCall.completionTokens).toBe(200);
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
