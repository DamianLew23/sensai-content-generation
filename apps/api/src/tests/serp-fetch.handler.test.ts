import { describe, expect, it, vi } from "vitest";
import { SerpFetchHandler } from "../handlers/serp-fetch.handler";

function makeHandler() {
  const stubClient = {
    serpOrganicLive: vi.fn(async () => ({
      tasks: [{ result: [{ items: [] }], cost: "0" }],
    })),
  } as any;
  const stubCache = {
    getOrSet: async (opts: any) => (await opts.fetcher()).result,
  } as any;
  return { handler: new SerpFetchHandler(stubClient, stubCache), stubClient };
}

describe("SerpFetchHandler — Plan 17 disambiguator integration", () => {
  it("uses raw mainKeyword when no disambiguate output is present", async () => {
    const { handler, stubClient } = makeHandler();
    await handler.execute({
      run: { id: "r", input: { topic: "T", mainKeyword: "kw raw" } },
      step: { id: "s" },
      project: { id: "p", config: {} },
      previousOutputs: {},
      attempt: 1,
      forceRefresh: false,
    } as any);
    expect(stubClient.serpOrganicLive.mock.calls[0][0].keyword).toBe("kw raw");
  });

  it("prefers disambiguate.serpQueries[0] when present", async () => {
    const { handler, stubClient } = makeHandler();
    await handler.execute({
      run: { id: "r", input: { topic: "T", mainKeyword: "kw raw" } },
      step: { id: "s" },
      project: { id: "p", config: {} },
      previousOutputs: {
        disambiguate: {
          refinedTopic: "refined topic xyz",
          mainKeyword: "kw resolved",
          intent: "informational",
          contentType: "guide",
          researchQuestion: "what is the question",
          serpQueries: ["kw from disambig", "alt"],
          antiAngles: [],
          rationale: "rationale",
        },
      },
      attempt: 1,
      forceRefresh: false,
    } as any);
    expect(stubClient.serpOrganicLive.mock.calls[0][0].keyword).toBe("kw from disambig");
  });

  it("throws when neither disambiguate.serpQueries nor mainKeyword is present", async () => {
    const { handler } = makeHandler();
    await expect(
      handler.execute({
        run: { id: "r", input: { topic: "T" } },
        step: { id: "s" },
        project: { id: "p", config: {} },
        previousOutputs: {},
        attempt: 1,
        forceRefresh: false,
      } as any),
    ).rejects.toThrow(/mainKeyword/);
  });
});
