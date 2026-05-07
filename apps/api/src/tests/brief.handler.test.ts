import { describe, expect, it, vi } from "vitest";
import { BriefHandler } from "../handlers/brief.handler";

const baseProject = {
  id: "p",
  name: "click2docs",
  config: {
    toneOfVoice: "",
    targetAudience: "",
    guidelines: "",
    defaultModels: {},
    promptOverrides: {},
    productPitch: "click2docs.pl SaaS",
    domain: "SaaS",
    keyTerms: ["instrukcja aplikacji"],
    antiTerms: ["urządzenia", "AGD"],
    competitors: [],
  },
};

const validDisambiguateOutput = {
  refinedTopic: "Jak napisać instrukcję obsługi aplikacji webowej",
  mainKeyword: "instrukcja aplikacji",
  intent: "informational" as const,
  contentType: "how-to guide",
  researchQuestion: "Jak skutecznie pisać instrukcje aplikacji webowej?",
  serpQueries: ["instrukcja aplikacji webowej", "user guide aplikacji"],
  antiAngles: ["urządzenia AGD", "instrukcja pralki"],
  rationale: "Skupiamy się na aplikacjach.",
};

function makeStubLlm() {
  return {
    generateObject: vi.fn(async () => ({
      object: {
        headline: "Test headline",
        angle: "Test angle",
        pillars: ["a", "b", "c"],
        audiencePainPoints: ["p1", "p2"],
        successCriteria: "OK",
      },
      model: "openai/gpt-5",
      promptTokens: 100,
      completionTokens: 50,
      costUsd: "0.001",
      latencyMs: 1000,
    })),
  } as any;
}

describe("BriefHandler — Plan 17 disambiguator integration", () => {
  it("uses raw RunInput when no disambiguate step output is present", async () => {
    const stubLlm = makeStubLlm();
    const handler = new BriefHandler(stubLlm);

    await handler.execute({
      run: { id: "r", input: { topic: "Jak napisać instrukcję" } },
      step: { id: "s" },
      project: baseProject,
      previousOutputs: {},
      attempt: 1,
      forceRefresh: false,
    } as any);

    expect(stubLlm.generateObject).toHaveBeenCalledOnce();
    const args = stubLlm.generateObject.mock.calls[0][0];
    expect(args.prompt).toContain("Jak napisać instrukcję");
    expect(args.system).not.toMatch(/UNIKAJ/);
  });

  it("uses refinedTopic and emits antiAngles guard when disambiguate output is present", async () => {
    const stubLlm = makeStubLlm();
    const handler = new BriefHandler(stubLlm);

    await handler.execute({
      run: { id: "r", input: { topic: "Jak napisać instrukcję" } },
      step: { id: "s" },
      project: baseProject,
      previousOutputs: { disambiguate: validDisambiguateOutput },
      attempt: 1,
      forceRefresh: false,
    } as any);

    expect(stubLlm.generateObject).toHaveBeenCalledOnce();
    const args = stubLlm.generateObject.mock.calls[0][0];
    expect(args.prompt).toContain("Jak napisać instrukcję obsługi aplikacji webowej");
    expect(args.system).toMatch(/UNIKAJ/);
    expect(args.system).toContain("urządzenia AGD");
    expect(args.system).toContain("instrukcja pralki");
  });
});
