import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FirecrawlClient } from "../tools/firecrawl/firecrawl.client";
import { HttpError } from "../tools/http-error";

const fakeEnv = {
  FIRECRAWL_API_KEY: "fc-test",
  FIRECRAWL_BASE_URL: "https://api.firecrawl.dev",
} as any;

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("FirecrawlClient", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch") as any;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("scrapes a URL and returns markdown + metadata", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({
      success: true,
      data: {
        markdown: "# Hello\n\nbody.",
        metadata: { title: "Hello page", sourceURL: "https://example.com" },
      },
    }));

    const client = new FirecrawlClient(fakeEnv);
    const out = await client.scrape({ url: "https://example.com" });

    expect(out.markdown).toBe("# Hello\n\nbody.");
    expect(out.title).toBe("Hello page");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.firecrawl.dev/v2/scrape");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer fc-test",
      "Content-Type": "application/json",
    });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      url: "https://example.com",
      formats: ["markdown"],
      onlyMainContent: true,
    });
  });

  it("throws HttpError on 401 without retry", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("unauthorized", { status: 401 }));

    const client = new FirecrawlClient(fakeEnv);
    await expect(client.scrape({ url: "https://example.com" })).rejects.toMatchObject({
      name: "HttpError",
      status: 401,
      code: "http_401",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("throws HttpError on 402 without retry", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("payment required", { status: 402 }));

    const client = new FirecrawlClient(fakeEnv);
    await expect(client.scrape({ url: "https://example.com" })).rejects.toMatchObject({
      name: "HttpError",
      status: 402,
      code: "http_402",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("retries on 5xx and succeeds on third attempt", async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response("server error", { status: 500 }))
      .mockResolvedValueOnce(new Response("bad gateway", { status: 502 }))
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        data: {
          markdown: "ok",
          metadata: { title: "T", sourceURL: "https://example.com" },
        },
      }));

    const client = new FirecrawlClient(fakeEnv);
    const out = await client.scrape({ url: "https://example.com" });
    expect(out.markdown).toBe("ok");
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  }, 20_000);
});
