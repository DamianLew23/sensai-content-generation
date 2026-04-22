import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Crawl4aiClient } from "../tools/crawl4ai/crawl4ai.client";
import { HttpError } from "../tools/http-error";
import { Crawl4aiApiError } from "../tools/crawl4ai/crawl4ai.errors";

const fakeEnv = {
  CRAWL4AI_BASE_URL: "http://crawl4ai.local:11235",
  CRAWL4AI_TIMEOUT_MS: 20_000,
} as any;

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Crawl4aiClient", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch") as any;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("scrapes a URL and returns markdown + title", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({
      success: true,
      markdown: "# Hello\n\nbody.",
      title: "Hello page",
      url: "https://example.com",
    }));

    const client = new Crawl4aiClient(fakeEnv);
    const out = await client.scrape({ url: "https://example.com" });

    expect(out.markdown).toBe("# Hello\n\nbody.");
    expect(out.title).toBe("Hello page");
    expect(out.url).toBe("https://example.com");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe("http://crawl4ai.local:11235/md");
  });

  it("throws HttpError on 403 without retry", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("forbidden", { status: 403 }));

    const client = new Crawl4aiClient(fakeEnv);
    await expect(client.scrape({ url: "https://example.com" })).rejects.toMatchObject({
      name: "HttpError",
      status: 403,
      code: "http_403",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("throws HttpError on 500 WITHOUT retry (zero retries)", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("server error", { status: 500 }));

    const client = new Crawl4aiClient(fakeEnv);
    await expect(client.scrape({ url: "https://example.com" })).rejects.toMatchObject({
      name: "HttpError",
      status: 500,
      code: "http_500",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("throws Crawl4aiApiError on 200 with empty markdown", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({
      success: true,
      markdown: "",
      title: "",
      url: "https://example.com",
    }));

    const client = new Crawl4aiClient(fakeEnv);
    await expect(client.scrape({ url: "https://example.com" })).rejects.toBeInstanceOf(Crawl4aiApiError);
  });

  it("throws HttpError on 401 (to enable short-circuit in handler)", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("unauthorized", { status: 401 }));

    const client = new Crawl4aiClient(fakeEnv);
    await expect(client.scrape({ url: "https://example.com" })).rejects.toMatchObject({
      name: "HttpError",
      status: 401,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
