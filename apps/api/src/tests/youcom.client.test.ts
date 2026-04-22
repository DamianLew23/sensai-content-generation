import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { YoucomClient } from "../tools/youcom/youcom.client";
import { YoucomApiError } from "../tools/youcom/youcom.errors";

const fakeEnv = {
  YOUCOM_API_KEY: "test-key-123",
  YOUCOM_BASE_URL: "https://api.you.com",
  YOUCOM_TIMEOUT_MS: 300_000,
  YOUCOM_COST_LITE: 0.02,
  YOUCOM_COST_STANDARD: 0.05,
  YOUCOM_COST_DEEP: 0.15,
  YOUCOM_COST_EXHAUSTIVE: 0.40,
} as any;

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("YoucomClient", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch") as any;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("POSTs to /v1/research with X-API-Key and JSON body", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({
      output: {
        content: "Research briefing with [1] citations.",
        content_type: "text",
        sources: [{ url: "https://example.com/a", title: "A", snippets: ["snippet"] }],
      },
    }));

    const client = new YoucomClient(fakeEnv);
    const out = await client.research({ input: "Topic", research_effort: "deep" });

    expect(out.output.content).toContain("Research briefing");
    expect(out.output.sources).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.you.com/v1/research");
    expect(init?.method).toBe("POST");
    expect((init?.headers as any)?.["X-API-Key"]).toBe("test-key-123");
    expect((init?.headers as any)?.["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init?.body as string)).toEqual({
      input: "Topic",
      research_effort: "deep",
    });
  });

  it("throws YoucomApiError on 401", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("unauthorized", { status: 401 }));
    const client = new YoucomClient(fakeEnv);
    await expect(client.research({ input: "x", research_effort: "lite" }))
      .rejects.toMatchObject({ name: "YoucomApiError", status: 401, endpoint: "/v1/research" });
  });

  it("throws YoucomApiError on 422", async () => {
    fetchSpy.mockResolvedValueOnce(new Response(`{"detail":"input too long"}`, { status: 422 }));
    const client = new YoucomClient(fakeEnv);
    await expect(client.research({ input: "x", research_effort: "lite" }))
      .rejects.toMatchObject({ name: "YoucomApiError", status: 422 });
  });

  it("throws YoucomApiError on 500 WITHOUT retry", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("boom", { status: 500 }));
    const client = new YoucomClient(fakeEnv);
    await expect(client.research({ input: "x", research_effort: "lite" }))
      .rejects.toMatchObject({ name: "YoucomApiError", status: 500 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("throws when YOUCOM_API_KEY is empty (fail-fast at construction)", () => {
    const envNoKey = { ...fakeEnv, YOUCOM_API_KEY: "" };
    expect(() => new YoucomClient(envNoKey))
      .toThrow(/YOUCOM_API_KEY/);
  });

  it("throws when YOUCOM_API_KEY is undefined", () => {
    const envNoKey = { ...fakeEnv, YOUCOM_API_KEY: undefined };
    expect(() => new YoucomClient(envNoKey))
      .toThrow(/YOUCOM_API_KEY/);
  });
});
