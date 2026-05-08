import { describe, expect, it, vi } from "vitest";
import { DisambiguateTopicHandler } from "../handlers/disambiguate-topic.handler";

const stubEnv = { DISAMBIGUATE_TTL_DAYS: 14 } as const;

const baseProject = {
  id: "p",
  name: "click2docs",
  config: {
    toneOfVoice: "", targetAudience: "", guidelines: "",
    defaultModels: {}, promptOverrides: {},
    productPitch: "click2docs.pl SaaS",
    domain: "SaaS",
    keyTerms: ["instrukcja aplikacji"],
    antiTerms: ["urządzenia", "AGD"],
    competitors: [],
  },
};

const validOutput = {
  refinedTopic: "Jak napisać instrukcję obsługi aplikacji webowej",
  mainKeyword: "instrukcja aplikacji",
  intent: "informational" as const,
  contentType: "how-to guide",
  researchQuestion: "Jak skutecznie pisać instrukcje aplikacji webowej?",
  serpQueries: ["instrukcja aplikacji webowej", "user guide aplikacji"],
  antiAngles: ["urządzenia", "AGD"],
  rationale: "Skupiamy się na aplikacjach.",
};

const violatingOutput = {
  ...validOutput,
  refinedTopic: "Jak napisać instrukcję obsługi urządzenia AGD",
  serpQueries: ["instrukcja AGD", "instrukcja aplikacji webowej"],
};

function makeStubs(disambiguateImpl: any) {
  const stubClient = { disambiguate: vi.fn(disambiguateImpl) } as any;
  const stubCache = {
    getOrSet: async (opts: any) => (await opts.fetcher()).result,
  } as any;
  return { stubClient, stubCache };
}

describe("DisambiguateTopicHandler", () => {
  it("returns the LLM output when no antiTerms violation occurs", async () => {
    const { stubClient, stubCache } = makeStubs(async () => ({
      result: validOutput,
      model: "openai/gpt-5-mini",
      promptTokens: 100, completionTokens: 50,
      costUsd: "0.001", latencyMs: 1000,
    }));
    const handler = new DisambiguateTopicHandler(stubClient, stubCache, stubEnv as any);

    const out = await handler.execute({
      run: { id: "r", input: { topic: "Jak napisać instrukcję" } },
      step: { id: "s" },
      project: baseProject,
      previousOutputs: {},
      attempt: 1,
      forceRefresh: false,
    } as any);

    expect(stubClient.disambiguate).toHaveBeenCalledOnce();
    expect((out.output as any).refinedTopic).toMatch(/aplikacj/i);
  });

  it("retries with a stronger prompt when refinedTopic contains an antiTerm", async () => {
    let call = 0;
    const { stubClient, stubCache } = makeStubs(async () => {
      call += 1;
      return {
        result: call === 1 ? violatingOutput : validOutput,
        model: "openai/gpt-5-mini",
        promptTokens: 100, completionTokens: 50,
        costUsd: "0.001", latencyMs: 1000,
      };
    });
    const handler = new DisambiguateTopicHandler(stubClient, stubCache, stubEnv as any);

    const out = await handler.execute({
      run: { id: "r", input: { topic: "Jak napisać instrukcję" } },
      step: { id: "s" },
      project: baseProject,
      previousOutputs: {},
      attempt: 1,
      forceRefresh: false,
    } as any);

    expect(stubClient.disambiguate).toHaveBeenCalledTimes(2);
    expect((out.output as any).refinedTopic).not.toMatch(/AGD|urządze/i);

    // Second call should have a stronger system prompt
    const secondCallArgs = stubClient.disambiguate.mock.calls[1][0];
    expect(secondCallArgs.system).toMatch(/PIERWSZA PRÓBA|RETRY/i);
  });

  it("throws after the retry also violates the antiTerms guard", async () => {
    const { stubClient, stubCache } = makeStubs(async () => ({
      result: violatingOutput,
      model: "openai/gpt-5-mini",
      promptTokens: 100, completionTokens: 50,
      costUsd: "0.001", latencyMs: 1000,
    }));
    const handler = new DisambiguateTopicHandler(stubClient, stubCache, stubEnv as any);

    await expect(
      handler.execute({
        run: { id: "r", input: { topic: "Jak napisać instrukcję" } },
        step: { id: "s" },
        project: baseProject,
        previousOutputs: {},
        attempt: 1,
        forceRefresh: false,
      } as any),
    ).rejects.toThrow(/antiterms/i);
    expect(stubClient.disambiguate).toHaveBeenCalledTimes(2);
  });

  it("treats antiTerms violation in serpQueries as a violation too", async () => {
    const { stubClient, stubCache } = makeStubs(async () => ({
      result: { ...validOutput, serpQueries: ["instrukcja AGD"] }, // violation
      model: "openai/gpt-5-mini",
      promptTokens: 100, completionTokens: 50,
      costUsd: "0.001", latencyMs: 1000,
    }));
    const handler = new DisambiguateTopicHandler(stubClient, stubCache, stubEnv as any);

    await expect(
      handler.execute({
        run: { id: "r", input: { topic: "Jak napisać instrukcję" } },
        step: { id: "s" },
        project: baseProject,
        previousOutputs: {},
        attempt: 1,
        forceRefresh: false,
      } as any),
    ).rejects.toThrow(/antiterms/i);
    expect(stubClient.disambiguate).toHaveBeenCalledTimes(2);
  });

  it("does not run the antiTerms guard when antiTerms is empty (no-op for vanilla projects)", async () => {
    const projectWithoutAntiTerms = {
      ...baseProject,
      config: { ...baseProject.config, antiTerms: [] },
    };
    const { stubClient, stubCache } = makeStubs(async () => ({
      result: violatingOutput, // would violate if guard ran
      model: "openai/gpt-5-mini",
      promptTokens: 100, completionTokens: 50,
      costUsd: "0.001", latencyMs: 1000,
    }));
    const handler = new DisambiguateTopicHandler(stubClient, stubCache, stubEnv as any);

    const out = await handler.execute({
      run: { id: "r", input: { topic: "Jak napisać instrukcję" } },
      step: { id: "s" },
      project: projectWithoutAntiTerms,
      previousOutputs: {},
      attempt: 1,
      forceRefresh: false,
    } as any);

    expect(stubClient.disambiguate).toHaveBeenCalledOnce();
    expect((out.output as any).refinedTopic).toMatch(/AGD/);
  });
});
