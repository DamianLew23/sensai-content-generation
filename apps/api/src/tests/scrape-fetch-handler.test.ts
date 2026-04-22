import { describe, it, expect, vi } from "vitest";
import { ScrapeFetchHandler } from "../handlers/scrape-fetch.handler";
import { HttpError } from "../tools/http-error";

function mkCtx(urls: string[]) {
  return {
    run: { id: "11111111-1111-1111-1111-111111111111" },
    step: { id: "22222222-2222-2222-2222-222222222222", input: { urls } },
    project: {},
    previousOutputs: {},
    attempt: 1,
  } as any;
}

function mkCache() {
  return {
    getOrSet: vi.fn().mockImplementation(async (opts: any) => {
      const { result } = await opts.fetcher();
      return result;
    }),
  };
}

function mkRecorder() {
  return { record: vi.fn().mockResolvedValue(undefined) };
}

function mkCrawl4ai(impl?: (url: string) => any) {
  return {
    scrape: vi.fn().mockImplementation(
      impl ?? (async ({ url }: { url: string }) => ({ url, markdown: "crawl4ai markdown content ".repeat(20), title: "C4A" })),
    ),
  };
}

function mkFirecrawl(impl?: (url: string) => any) {
  return {
    scrape: vi.fn().mockImplementation(
      impl ?? (async ({ url }: { url: string }) => ({ url, markdown: "firecrawl markdown content ".repeat(20), title: "FC" })),
    ),
  };
}

describe("ScrapeFetchHandler", () => {
  it("happy path: crawl4ai sukces na wszystkich urls; firecrawl nie wołany", async () => {
    const cache = mkCache();
    const recorder = mkRecorder();
    const crawl4ai = mkCrawl4ai();
    const firecrawl = mkFirecrawl();

    const handler = new ScrapeFetchHandler(crawl4ai as any, firecrawl as any, cache as any, recorder as any);
    const result = await handler.execute(
      mkCtx(["https://a.example.com", "https://b.example.com", "https://c.example.com"]),
    );

    const out = result.output as any;
    expect(out.pages).toHaveLength(3);
    expect(out.failures).toHaveLength(0);
    expect(out.pages[0].source).toBe("crawl4ai");
    expect(crawl4ai.scrape).toHaveBeenCalledTimes(3);
    expect(firecrawl.scrape).not.toHaveBeenCalled();
  });

  it("crawl4ai 403 → fallback do firecrawl, source=firecrawl", async () => {
    const cache = mkCache();
    const recorder = mkRecorder();
    const crawl4ai = {
      scrape: vi.fn().mockRejectedValue(new HttpError(403, "forbidden")),
    };
    const firecrawl = mkFirecrawl();

    const handler = new ScrapeFetchHandler(crawl4ai as any, firecrawl as any, cache as any, recorder as any);
    const result = await handler.execute(mkCtx(["https://a.example.com"]));

    const out = result.output as any;
    expect(out.pages).toHaveLength(1);
    expect(out.pages[0].source).toBe("firecrawl");
    expect(crawl4ai.scrape).toHaveBeenCalledTimes(1);
    expect(firecrawl.scrape).toHaveBeenCalledTimes(1);

    const recordedTools = recorder.record.mock.calls.map((c: any[]) => c[0].tool);
    expect(recordedTools).toEqual(expect.arrayContaining(["crawl4ai", "firecrawl"]));
  });

  it("crawl4ai <200 chars → fallback do firecrawl", async () => {
    const cache = mkCache();
    const recorder = mkRecorder();
    const crawl4ai = {
      scrape: vi.fn().mockResolvedValue({ url: "https://a.example.com", markdown: "too short", title: "T" }),
    };
    const firecrawl = mkFirecrawl();

    const handler = new ScrapeFetchHandler(crawl4ai as any, firecrawl as any, cache as any, recorder as any);
    const result = await handler.execute(mkCtx(["https://a.example.com"]));

    const out = result.output as any;
    expect(out.pages[0].source).toBe("firecrawl");
    expect(recorder.record).toHaveBeenCalledWith(expect.objectContaining({
      tool: "crawl4ai",
      error: { reason: "short_content" },
    }));
  });

  it("crawl4ai Cloudflare challenge → fallback do firecrawl", async () => {
    const cache = mkCache();
    const recorder = mkRecorder();
    const crawl4ai = {
      scrape: vi.fn().mockResolvedValue({
        url: "https://linkedin.example.com",
        markdown: ("Just a moment...\n<div class='cf-chl-body'></div>\n" + "x".repeat(260)).padEnd(320, "x"),
        title: "LI",
      }),
    };
    const firecrawl = mkFirecrawl();

    const handler = new ScrapeFetchHandler(crawl4ai as any, firecrawl as any, cache as any, recorder as any);
    const result = await handler.execute(mkCtx(["https://linkedin.example.com"]));

    const out = result.output as any;
    expect(out.pages[0].source).toBe("firecrawl");
    expect(recorder.record).toHaveBeenCalledWith(expect.objectContaining({
      tool: "crawl4ai",
      error: { reason: "cf_challenge" },
    }));
  });

  it("crawl4ai 401 na pierwszym URL → batch abort, firecrawl nie wołany", async () => {
    const cache = mkCache();
    const recorder = mkRecorder();
    const crawl4ai = {
      scrape: vi.fn().mockRejectedValue(new HttpError(401, "unauthorized")),
    };
    const firecrawl = mkFirecrawl();

    const handler = new ScrapeFetchHandler(crawl4ai as any, firecrawl as any, cache as any, recorder as any);
    await expect(
      handler.execute(mkCtx(["https://a.example.com", "https://b.example.com", "https://c.example.com"])),
    ).rejects.toMatchObject({ name: "HttpError", status: 401 });

    expect(crawl4ai.scrape).toHaveBeenCalledTimes(1);
    expect(firecrawl.scrape).not.toHaveBeenCalled();
  });
});
