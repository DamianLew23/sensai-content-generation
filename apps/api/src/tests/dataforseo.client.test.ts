import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DataForSeoClient } from "../tools/dataforseo/dataforseo.client";
import { HttpError, DataForSeoApiError } from "../tools/dataforseo/dataforseo.errors";

const fakeEnv = {
  DATAFORSEO_LOGIN: "user@example.com",
  DATAFORSEO_PASSWORD: "secret",
} as any;

const params = { keyword: "test", locationCode: 2616, languageCode: "pl", depth: 10 };

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("DataForSeoClient", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch") as any;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("successful response returns parsed JSON with cost", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({
      status_code: 20000,
      tasks: [{
        cost: 0.0006,
        result: [{
          items: [
            { type: "organic", title: "T1", url: "https://a.example.com", description: "D1", rank_absolute: 1 },
            { type: "ads",     title: "Ad", url: "https://ad.example.com", description: "x", rank_absolute: 0 },
            { type: "organic", title: "T2", url: "https://b.example.com", description: "D2", rank_absolute: 2 },
          ],
        }],
      }],
    }));

    const client = new DataForSeoClient(fakeEnv);
    const out = await client.serpOrganicLive(params);

    expect(out.tasks[0].cost).toBe(0.0006);
    expect(out.tasks[0].result[0].items.length).toBe(3); // raw includes ads; filtering happens in handler
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.dataforseo.com/v3/serp/google/organic/live/regular");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: expect.stringMatching(/^Basic /),
      "Content-Type": "application/json",
    });
  });

  it("HTTP 500 retries up to 3 times then throws HttpError", async () => {
    fetchSpy.mockResolvedValue(new Response("server error", { status: 500 }));

    const client = new DataForSeoClient(fakeEnv);
    await expect(client.serpOrganicLive(params)).rejects.toBeInstanceOf(HttpError);
    expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(3);
  }, 20_000);

  it("DataForSEO status_code != 20000 throws DataForSeoApiError without retry", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({
      status_code: 40000,
      status_message: "Bad Request",
      tasks: [],
    }));

    const client = new DataForSeoClient(fakeEnv);
    await expect(client.serpOrganicLive(params)).rejects.toBeInstanceOf(DataForSeoApiError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("HTTP 401 throws immediately (no retry on 4xx non-429)", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("unauthorized", { status: 401 }));

    const client = new DataForSeoClient(fakeEnv);
    await expect(client.serpOrganicLive(params)).rejects.toBeInstanceOf(HttpError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
