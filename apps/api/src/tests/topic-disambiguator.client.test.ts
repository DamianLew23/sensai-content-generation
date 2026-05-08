import { describe, expect, it, vi } from "vitest";
import { TopicDisambiguatorClient } from "../tools/topic-disambiguator/topic-disambiguator.client";

const stubEnv = {
  DISAMBIGUATE_MODEL: "openai/gpt-5-mini",
  DISAMBIGUATE_MAX_INPUT_CHARS: 20_000,
} as const;

describe("TopicDisambiguatorClient", () => {
  it("delegates to LlmClient.generateObject and returns a disambiguator result", async () => {
    const stubObject = {
      refinedTopic: "Jak napisać instrukcję obsługi aplikacji",
      mainKeyword: "instrukcja aplikacji",
      intent: "informational",
      contentType: "how-to guide",
      researchQuestion: "Jak skutecznie napisać instrukcję obsługi aplikacji webowej?",
      serpQueries: ["instrukcja aplikacji webowej", "user guide aplikacja"],
      antiAngles: ["urządzenia fizyczne", "AGD"],
      rationale: "Odnosi się do dokumentacji aplikacji.",
    };
    const stubLlm = {
      generateObject: vi.fn(async () => ({
        object: stubObject,
        model: "openai/gpt-5-mini",
        promptTokens: 800,
        completionTokens: 300,
        costUsd: "0.0021",
        latencyMs: 2300,
      })),
    } as any;

    const client = new TopicDisambiguatorClient(stubLlm, stubEnv as any);
    const out = await client.disambiguate({
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      system: "system prompt",
      prompt: "user prompt",
    });

    expect(stubLlm.generateObject).toHaveBeenCalledOnce();
    const args = stubLlm.generateObject.mock.calls[0][0];
    expect(args.system).toBe("system prompt");
    expect(args.prompt).toBe("user prompt");
    expect(args.ctx.model).toBe("openai/gpt-5-mini");
    expect(out.result.refinedTopic).toMatch(/aplikacj/i);
    expect(out.costUsd).toBe("0.0021");
    expect(out.latencyMs).toBe(2300);
  });

  it("rejects when prompt exceeds DISAMBIGUATE_MAX_INPUT_CHARS", async () => {
    const stubLlm = { generateObject: vi.fn() } as any;
    const client = new TopicDisambiguatorClient(stubLlm, {
      DISAMBIGUATE_MODEL: "openai/gpt-5-mini",
      DISAMBIGUATE_MAX_INPUT_CHARS: 100,
    } as any);
    await expect(
      client.disambiguate({
        ctx: { runId: "r", stepId: "s", attempt: 1 },
        system: "x".repeat(80),
        prompt: "y".repeat(80),
      }),
    ).rejects.toThrow(/exceeds/i);
    expect(stubLlm.generateObject).not.toHaveBeenCalled();
  });
});
