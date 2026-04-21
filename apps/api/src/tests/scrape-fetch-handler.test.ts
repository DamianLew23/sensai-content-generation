import { describe, it, expect, vi } from "vitest";
import { ScrapeFetchHandler } from "../handlers/scrape-fetch.handler";
import { HttpError } from "../tools/http-error";

function mkCtx(urls: string[]) {
  return {
    run: { id: "run-1" },
    step: { id: "step-1", input: { urls } },
    project: {},
    previousOutputs: {},
    attempt: 1,
  } as any;
}

function mkPage(url: string, markdown = "ok") {
  return {
    url,
    title: "T",
    markdown,
    rawLength: markdown.length,
    truncated: false,
    source: "firecrawl" as const,
    fetchedAt: new Date().toISOString(),
  };
}

describe("ScrapeFetchHandler", () => {
  it("scrapes all urls and returns pages[]", async () => {
    const cache = {
      getOrSet: vi.fn().mockImplementation(async (opts: any) => {
        const { result } = await opts.fetcher();
        return result;
      }),
    } as any;
    const client = {
      scrape: vi.fn().mockImplementation(async ({ url }: { url: string }) => ({
        url, markdown: "body", title: "T",
      })),
    } as any;

    const handler = new ScrapeFetchHandler(client, cache);
    const result = await handler.execute(
      mkCtx(["https://a.example.com", "https://b.example.com", "https://c.example.com"]),
    );

    const out = result.output as any;
    expect(out.pages).toHaveLength(3);
    expect(out.failures).toHaveLength(0);
    expect(out.pages[0].source).toBe("firecrawl");
    expect(client.scrape).toHaveBeenCalledTimes(3);
  });

  it("partial failure: 2 ok + 1 timeout → pages[2], failures[1]", async () => {
    const cache = {
      getOrSet: vi.fn().mockImplementation(async (opts: any) => {
        if (opts.params.url === "https://b.example.com") {
          throw new Error("The operation was aborted");
        }
        const { result } = await opts.fetcher();
        return result;
      }),
    } as any;
    const client = {
      scrape: vi.fn().mockImplementation(async ({ url }: { url: string }) => ({
        url, markdown: "body", title: "T",
      })),
    } as any;

    const handler = new ScrapeFetchHandler(client, cache);
    const result = await handler.execute(
      mkCtx(["https://a.example.com", "https://b.example.com", "https://c.example.com"]),
    );
    const out = result.output as any;
    expect(out.pages).toHaveLength(2);
    expect(out.failures).toHaveLength(1);
    expect(out.failures[0].url).toBe("https://b.example.com");
  });

  it("all fail → throws", async () => {
    const cache = {
      getOrSet: vi.fn().mockRejectedValue(new Error("boom")),
    } as any;
    const client = { scrape: vi.fn() } as any;

    const handler = new ScrapeFetchHandler(client, cache);
    await expect(
      handler.execute(mkCtx(["https://a.example.com", "https://b.example.com"])),
    ).rejects.toThrow(/all scrape urls failed/i);
  });

  it("401 on first url → short-circuits without scraping others", async () => {
    const cache = {
      getOrSet: vi.fn().mockImplementation(async () => {
        throw new HttpError(401, "unauthorized");
      }),
    } as any;
    const client = { scrape: vi.fn() } as any;

    const handler = new ScrapeFetchHandler(client, cache);
    await expect(
      handler.execute(mkCtx([
        "https://a.example.com",
        "https://b.example.com",
        "https://c.example.com",
      ])),
    ).rejects.toMatchObject({ name: "HttpError", status: 401 });
    // Only the first URL should have triggered getOrSet
    expect(cache.getOrSet).toHaveBeenCalledTimes(1);
  });

  it("truncates markdown over 15k chars and sets truncated=true, rawLength correct", async () => {
    const big = "x".repeat(20_000);
    const cache = {
      getOrSet: vi.fn().mockImplementation(async (opts: any) => {
        const { result } = await opts.fetcher();
        return result;
      }),
    } as any;
    const client = {
      scrape: vi.fn().mockResolvedValue({
        url: "https://a.example.com", markdown: big, title: "T",
      }),
    } as any;

    const handler = new ScrapeFetchHandler(client, cache);
    const result = await handler.execute(mkCtx(["https://a.example.com"]));
    const out = result.output as any;
    expect(out.pages[0].markdown.length).toBe(15_000);
    expect(out.pages[0].rawLength).toBe(20_000);
    expect(out.pages[0].truncated).toBe(true);
  });
});
