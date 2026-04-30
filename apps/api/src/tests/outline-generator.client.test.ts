import { describe, it, expect, vi } from "vitest";
import { OutlineGeneratorClient } from "../tools/outline-generator/outline-generator.client";
import { LLMOutlineCallResult } from "../tools/outline-generator/outline-generator.types";
import type { PreprocessedFanout } from "../tools/outline-generator/outline-generator.types";

const mkPreprocessed = (): PreprocessedFanout => ({
  primaryIntent: "Instrukcyjna",
  primaryIntentSource: "fanout",
  primaryAreas: [
    { id: "A1", topic: "snu", question: "?", intent: "Instrukcyjna", paaQuestions: ["paa1"] },
  ],
  secondaryAreasByIntent: new Map([
    ["Definicyjna", [{ id: "A2", topic: "rola", question: "?", intent: "Definicyjna", paaQuestions: [] }]],
  ]),
  preprocessWarnings: [],
});

describe("OutlineGeneratorClient", () => {
  it("calls LlmClient.generateObject with model+schema+reasoning_effort from env", async () => {
    const mockLlm = {
      generateObject: vi.fn().mockResolvedValue({
        object: { h1Title: "X", fullSections: [], contextSections: [] },
        model: "openai/gpt-5.4",
        promptTokens: 100,
        completionTokens: 50,
        costUsd: "0.01",
        latencyMs: 1000,
      }),
    };
    const env = { OUTLINE_GENERATE_MODEL: "openai/gpt-5.4", OUTLINE_GENERATE_REASONING: "medium" as const };
    const client = new OutlineGeneratorClient(mockLlm as any, env);

    await client.generate({
      ctx: { runId: "r1", stepId: "s1", attempt: 1 },
      keyword: "kortyzol",
      userH1Title: undefined,
      language: "pl",
      preprocessed: mkPreprocessed(),
    });

    expect(mockLlm.generateObject).toHaveBeenCalledTimes(1);
    const call = mockLlm.generateObject.mock.calls[0][0];
    expect(call.ctx.model).toBe("openai/gpt-5.4");
    expect(call.schema).toBe(LLMOutlineCallResult);
    expect(call.providerOptions.openrouter.reasoning.effort).toBe("medium");
    expect(call.system).toContain("BLUF");
    expect(call.prompt).toContain("kortyzol");
    expect(call.prompt).toContain("Primary intent: Instrukcyjna");
  });

  it("includes user-provided H1 in the prompt when set", async () => {
    const mockLlm = {
      generateObject: vi.fn().mockResolvedValue({
        object: { h1Title: "X", fullSections: [], contextSections: [] },
        model: "openai/gpt-5.4",
        promptTokens: 100,
        completionTokens: 50,
        costUsd: "0.00",
        latencyMs: 500,
      }),
    };
    const env = { OUTLINE_GENERATE_MODEL: "openai/gpt-5.4", OUTLINE_GENERATE_REASONING: "medium" as const };
    const client = new OutlineGeneratorClient(mockLlm as any, env);

    await client.generate({
      ctx: { runId: "r1", stepId: "s1", attempt: 1 },
      keyword: "kortyzol",
      userH1Title: "My custom H1",
      language: "pl",
      preprocessed: mkPreprocessed(),
    });

    const call = mockLlm.generateObject.mock.calls[0][0];
    expect(call.prompt).toContain("User-provided H1: \"My custom H1\"");
  });
});
