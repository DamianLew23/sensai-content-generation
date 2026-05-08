import { describe, expect, it, vi } from "vitest";
import { SerpFetchHandler } from "../handlers/serp-fetch.handler";

type Row = { title: string; url: string; description: string; rank_absolute: number; type: string };

function organic(rows: Array<{ title: string; url: string; description?: string }>): Row[] {
  return rows.map((r, i) => ({
    title: r.title,
    url: r.url,
    description: r.description ?? "",
    rank_absolute: i + 1,
    type: "organic",
  }));
}

function makeHandler(perKeywordItems: Record<string, Row[]>) {
  const stubClient = {
    serpOrganicLive: vi.fn(async (p: any) => ({
      tasks: [{ result: [{ items: perKeywordItems[p.keyword] ?? [] }], cost: "0.0001" }],
    })),
  } as any;
  // Cache stub: pass-through to fetcher and unwrap .result
  const stubCache = {
    getOrSet: async (opts: any) => (await opts.fetcher()).result,
  } as any;
  return { handler: new SerpFetchHandler(stubClient, stubCache), stubClient };
}

const ctxBase = {
  run: { id: "r", input: { topic: "T", mainKeyword: "kw raw" } },
  step: { id: "s" },
  project: { id: "p", config: {} },
  attempt: 1,
  forceRefresh: false,
};

describe("SerpFetchHandler (Plan 18 — multi-query + RRF)", () => {
  it("falls back to mainKeyword when no disambiguate output is present", async () => {
    const { handler, stubClient } = makeHandler({
      "kw raw": organic([{ title: "T1", url: "https://a.example/1" }]),
    });
    const out = await handler.execute({ ...ctxBase, previousOutputs: {} } as any);
    expect(stubClient.serpOrganicLive).toHaveBeenCalledTimes(1);
    expect(stubClient.serpOrganicLive.mock.calls[0][0].keyword).toBe("kw raw");
    expect((out.output as any).queries).toEqual(["kw raw"]);
    expect((out.output as any).items).toHaveLength(1);
  });

  it("fetches every disambiguate.serpQueries entry in parallel", async () => {
    const { handler, stubClient } = makeHandler({
      "q one": organic([{ title: "A1", url: "https://a.example/1" }]),
      "q two": organic([{ title: "B1", url: "https://b.example/1" }]),
      "q three": organic([{ title: "C1", url: "https://c.example/1" }]),
    });
    const out = await handler.execute({
      ...ctxBase,
      previousOutputs: {
        disambiguate: {
          refinedTopic: "refined topic", mainKeyword: "kw", intent: "informational",
          contentType: "guide", researchQuestion: "what is the topic",
          serpQueries: ["q one", "q two", "q three"],
          antiAngles: [], rationale: "rationale text",
        },
      },
    } as any);
    expect(stubClient.serpOrganicLive).toHaveBeenCalledTimes(3);
    expect((out.output as any).queries).toEqual(["q one", "q two", "q three"]);
    expect((out.output as any).items).toHaveLength(3);
  });

  it("deduplicates by canonical URL and merges sourceQueries", async () => {
    // Same URL in two queries (one with utm tracking) — should dedupe to 1 item
    const { handler } = makeHandler({
      "q one": organic([
        { title: "Shared", url: "https://shared.example/page?utm_source=A" },
        { title: "OnlyA", url: "https://onlya.example/" },
      ]),
      "q two": organic([
        { title: "Shared (longer descriptive title)", url: "https://shared.example/page" },
        { title: "OnlyB", url: "https://onlyb.example/" },
      ]),
    });
    const out = await handler.execute({
      ...ctxBase,
      previousOutputs: {
        disambiguate: {
          refinedTopic: "refined topic", mainKeyword: "kw", intent: "informational",
          contentType: "guide", researchQuestion: "what is the topic",
          serpQueries: ["q one", "q two"],
          antiAngles: [], rationale: "rationale text",
        },
      },
    } as any);
    const items = (out.output as any).items as Array<any>;
    const shared = items.find((it) => it.url.includes("shared.example"));
    expect(shared).toBeDefined();
    expect(shared.sourceQueries.sort()).toEqual(["q one", "q two"]);
    // The shared URL appears in both queries → highest fused score → position 1
    expect(shared.position).toBe(1);
    // OnlyA + OnlyB also surface
    expect(items.map((it) => it.url).sort()).toEqual([
      expect.stringContaining("onlya.example"),
      expect.stringContaining("onlyb.example"),
      expect.stringContaining("shared.example"),
    ].sort());
  });

  it("caps the fused output at 15 items even if total candidates exceed 15", async () => {
    const queryItems: Record<string, Row[]> = {};
    for (const q of ["q1", "q2"]) {
      queryItems[q] = organic(
        Array.from({ length: 10 }, (_, i) => ({
          title: `${q}-${i}`,
          url: `https://${q}.example/${i}`,
        })),
      );
    }
    const { handler } = makeHandler(queryItems);
    const out = await handler.execute({
      ...ctxBase,
      previousOutputs: {
        disambiguate: {
          refinedTopic: "refined topic", mainKeyword: "kw", intent: "informational",
          contentType: "guide", researchQuestion: "what is the topic",
          serpQueries: ["q1", "q2"],
          antiAngles: [], rationale: "rationale text",
        },
      },
    } as any);
    expect((out.output as any).items.length).toBe(15);
  });

  it("assigns sequential 1..N positions to fused items", async () => {
    const { handler } = makeHandler({
      "q1": organic([{ title: "a", url: "https://a.example/" }, { title: "b", url: "https://b.example/" }]),
      "q2": organic([{ title: "b", url: "https://b.example/" }, { title: "c", url: "https://c.example/" }]),
    });
    const out = await handler.execute({
      ...ctxBase,
      previousOutputs: {
        disambiguate: {
          refinedTopic: "refined topic", mainKeyword: "kw", intent: "informational",
          contentType: "guide", researchQuestion: "what is the topic",
          serpQueries: ["q1", "q2"],
          antiAngles: [], rationale: "rationale text",
        },
      },
    } as any);
    const items = (out.output as any).items as Array<{ position: number; fusedScore: number }>;
    // b appears in both → highest score → position 1
    expect(items[0].position).toBe(1);
    expect(items[items.length - 1].position).toBe(items.length);
    // fusedScore is monotonically non-increasing
    for (let i = 1; i < items.length; i++) {
      expect(items[i].fusedScore!).toBeLessThanOrEqual(items[i - 1].fusedScore!);
    }
  });

  it("dedupes case-equivalent disambiguator queries before fetching", async () => {
    const { handler, stubClient } = makeHandler({
      "kw": organic([{ title: "x", url: "https://x.example/" }]),
    });
    await handler.execute({
      ...ctxBase,
      previousOutputs: {
        disambiguate: {
          refinedTopic: "refined topic", mainKeyword: "kw", intent: "informational",
          contentType: "guide", researchQuestion: "what is the topic",
          serpQueries: ["kw", "KW", " kw "],
          antiAngles: [], rationale: "rationale text",
        },
      },
    } as any);
    expect(stubClient.serpOrganicLive).toHaveBeenCalledTimes(1);
  });

  it("throws when neither disambiguate.serpQueries nor mainKeyword is present", async () => {
    const { handler } = makeHandler({});
    await expect(
      handler.execute({
        ...ctxBase,
        run: { id: "r", input: { topic: "T" } },
        previousOutputs: {},
      } as any),
    ).rejects.toThrow(/mainKeyword/);
  });
});
