import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DataForSeoClient } from "../tools/dataforseo/dataforseo.client";
import { HttpError, DataForSeoApiError } from "../tools/dataforseo/dataforseo.errors";

const fakeEnv = {
  DATAFORSEO_LOGIN: "user@example.com",
  DATAFORSEO_PASSWORD: "secret",
} as any;

const params = { keyword: "kortyzol", languageCode: "pl", locationCode: 2616, depth: 2 };

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("DataForSeoClient.paaFetch", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch") as any;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("happy path: extracts PAA titles from advanced SERP response", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({
      status_code: 20000,
      tasks: [{
        cost: 0.003,
        result: [{
          items: [
            { type: "organic", title: "irrelevant organic" },
            {
              type: "people_also_ask",
              items: [
                { type: "people_also_ask_element", title: "Czym jest kortyzol?" },
                { type: "people_also_ask_element", title: "Jak obniżyć kortyzol naturalnie?" },
                { type: "people_also_ask_element", title: "Jakie są objawy wysokiego kortyzolu?" },
              ],
            },
            {
              type: "people_also_ask",
              items: [
                { type: "people_also_ask_element", title: "Czy kawa podnosi kortyzol?" },
                { type: "people_also_ask_element", title: "Jak stres wpływa na kortyzol?" },
              ],
            },
          ],
        }],
      }],
    }));

    const client = new DataForSeoClient(fakeEnv);
    const out = await client.paaFetch(params);

    expect(out).toHaveLength(5);
    expect(out.map((q) => q.title)).toEqual([
      "Czym jest kortyzol?",
      "Jak obniżyć kortyzol naturalnie?",
      "Jakie są objawy wysokiego kortyzolu?",
      "Czy kawa podnosi kortyzol?",
      "Jak stres wpływa na kortyzol?",
    ]);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.dataforseo.com/v3/serp/google/organic/live/advanced");
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody[0]).toMatchObject({
      keyword: "kortyzol",
      location_code: 2616,
      language_code: "pl",
      device: "desktop",
      people_also_ask_click_depth: 2,
    });
  });

  it("empty result (tasks[].result null) returns empty array", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({
      status_code: 20000,
      tasks: [{ result: null }],
    }));

    const client = new DataForSeoClient(fakeEnv);
    const out = await client.paaFetch(params);

    expect(out).toEqual([]);
  });

  it("no people_also_ask items returns empty array", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({
      status_code: 20000,
      tasks: [{
        result: [{
          items: [
            { type: "organic", title: "no PAA here" },
            { type: "ads", title: "ad" },
          ],
        }],
      }],
    }));

    const client = new DataForSeoClient(fakeEnv);
    const out = await client.paaFetch(params);

    expect(out).toEqual([]);
  });

  it("dedupes duplicate PAA questions, preserving first occurrence", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({
      status_code: 20000,
      tasks: [{
        result: [{
          items: [
            {
              type: "people_also_ask",
              items: [
                { title: "Czym jest kortyzol?" },
                { title: "Jak obniżyć kortyzol?" },
                { title: "Czym jest kortyzol?" },
              ],
            },
            {
              type: "people_also_ask",
              items: [
                { title: "Jak obniżyć kortyzol?" },
                { title: "Co podnosi kortyzol?" },
              ],
            },
          ],
        }],
      }],
    }));

    const client = new DataForSeoClient(fakeEnv);
    const out = await client.paaFetch(params);

    expect(out.map((q) => q.title)).toEqual([
      "Czym jest kortyzol?",
      "Jak obniżyć kortyzol?",
      "Co podnosi kortyzol?",
    ]);
  });

  it("HTTP 500 retries up to 3 times then throws HttpError", async () => {
    fetchSpy.mockResolvedValue(new Response("server error", { status: 500 }));

    const client = new DataForSeoClient(fakeEnv);
    await expect(client.paaFetch(params)).rejects.toBeInstanceOf(HttpError);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("HTTP 401 throws immediately (no retries)", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("unauthorized", { status: 401 }));

    const client = new DataForSeoClient(fakeEnv);
    await expect(client.paaFetch(params)).rejects.toBeInstanceOf(HttpError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("DataForSEO status_code != 20000 throws DataForSeoApiError without retry", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({
      status_code: 40400,
      status_message: "Bad keyword",
      tasks: [],
    }));

    const client = new DataForSeoClient(fakeEnv);
    await expect(client.paaFetch(params)).rejects.toBeInstanceOf(DataForSeoApiError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
