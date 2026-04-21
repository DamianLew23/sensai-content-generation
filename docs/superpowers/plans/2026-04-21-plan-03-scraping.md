# Plan 03 — Scraping (Firecrawl) + pierwszy checkpoint — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dodać do pipeline'u krok `tool.scrape` (Firecrawl, bez fallbacku) z pierwszym checkpointem — user wybiera z UI URL-e do scrapowania spośród wyników poprzedniego kroku SERP. Wynik: trzeci szablon „Brief + research + scrape" v1, w którym LLM dostaje w prompcie pełny markdown 1–5 wybranych stron konkurencji.

**Architecture:** Kopiujemy pattern z Planu 02 (tool module + handler + per-URL cache przez `ToolCacheService`). Wykorzystujemy istniejące pole `pipelineSteps.requiresApproval` + pauzę w `OrchestratorService.advance()` → dodajemy endpoint `POST /runs/:id/steps/:stepId/resume` (wypełnia `step.input` i re-enqueuje) oraz UI z checkboxami. Plus dwa fold-iny z Planu 02: BullMQ 4xx → `UnrecoverableError`, NaN guard w cost cap.

**Tech Stack:** NestJS, Drizzle ORM, BullMQ, Vitest, Zod, Next.js App Router, `@ai-sdk/openai-compatible`, Firecrawl `/v2/scrape`, `p-retry`, `p-limit`.

**Spec:** `docs/superpowers/specs/2026-04-21-plan-03-scraping-design.md`

---

## Pre-flight

- [ ] **Verify branch and clean tree**

Run: `git status --short && git branch --show-current`
Expected: `feat/plan-03-scraping`, tylko docs spec files w commitach (spec + self-review). Brak uncommitted changes w `apps/` ani `packages/`.

- [ ] **Verify Plan 02 tests still pass**

Run: `pnpm --filter @sensai/api test`
Expected: 13 tests pass (`dataforseo.client.test.ts` 4 + `stable-stringify.test.ts` 5 + `tool-cache.service.test.ts` 4). Baseline.

---

## Task 1: Refactor — wyciągnij HttpError i dodaj p-limit

**Files:**
- Create: `apps/api/src/tools/http-error.ts`
- Modify: `apps/api/src/tools/dataforseo/dataforseo.errors.ts`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Zainstaluj p-limit**

Run:
```
pnpm --filter @sensai/api add p-limit@^6
```
Expected: `package.json` dostaje `"p-limit": "^6.x.x"` w `dependencies`, `pnpm-lock.yaml` zaktualizowane.

- [ ] **Step 2: Stwórz `apps/api/src/tools/http-error.ts`**

```ts
export class HttpError extends Error {
  public readonly code: string;
  constructor(public readonly status: number, public readonly body: string) {
    super(`HTTP ${status}: ${body.slice(0, 200)}`);
    this.name = "HttpError";
    this.code = `http_${status}`;
  }
}
```

- [ ] **Step 3: Zamień zawartość `apps/api/src/tools/dataforseo/dataforseo.errors.ts` na re-eksport**

```ts
export { HttpError } from "../http-error";

export class DataForSeoApiError extends Error {
  constructor(public readonly statusCode: number, public readonly statusMessage: string) {
    super(`DataForSEO ${statusCode}: ${statusMessage}`);
    this.name = "DataForSeoApiError";
  }
}
```

- [ ] **Step 4: Verify — Plan 02 tests still pass z nowym importem**

Run: `pnpm --filter @sensai/api test`
Expected: 13 tests pass (identycznie jak w pre-flight).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/tools/http-error.ts apps/api/src/tools/dataforseo/dataforseo.errors.ts apps/api/package.json pnpm-lock.yaml
git commit -m "refactor(api): extract HttpError to tools/http-error + add p-limit dep"
```

---

## Task 2: Firecrawl — env, domain errors, module scaffolding

**Files:**
- Modify: `apps/api/src/config/env.ts`
- Modify: `.env.example`
- Create: `apps/api/src/tools/firecrawl/firecrawl.errors.ts`
- Create: `apps/api/src/tools/firecrawl/firecrawl.module.ts`

- [ ] **Step 1: Dodaj env vars w `apps/api/src/config/env.ts`**

Znajdź sekcję Zod schema z `DATAFORSEO_LOGIN` i dodaj za nią:

```ts
  FIRECRAWL_API_KEY: z.string().min(1),
  FIRECRAWL_BASE_URL: z.string().url().default("https://api.firecrawl.dev"),
```

- [ ] **Step 2: Dodaj do `.env.example`**

Dopisz na końcu:

```
# Firecrawl (https://firecrawl.dev/app/api-keys)
FIRECRAWL_API_KEY=fc-your-api-key
FIRECRAWL_BASE_URL=https://api.firecrawl.dev
```

- [ ] **Step 3: Stwórz `apps/api/src/tools/firecrawl/firecrawl.errors.ts`**

```ts
export class FirecrawlApiError extends Error {
  public readonly code = "firecrawl_api_error";
  constructor(message: string) {
    super(`Firecrawl: ${message}`);
    this.name = "FirecrawlApiError";
  }
}
```

- [ ] **Step 4: Stwórz placeholder `apps/api/src/tools/firecrawl/firecrawl.module.ts`**

```ts
import { Module } from "@nestjs/common";
import { FirecrawlClient } from "./firecrawl.client";
import { loadEnv } from "../../config/env";

@Module({
  providers: [
    {
      provide: FirecrawlClient,
      useFactory: () => new FirecrawlClient(loadEnv()),
    },
  ],
  exports: [FirecrawlClient],
})
export class FirecrawlModule {}
```

Note: moduł importuje `FirecrawlClient` którego jeszcze nie ma — Task 3 go tworzy. TypeScript nie skompiluje do końca Taska 3, to OK (nie uruchamiamy API pomiędzy). Testy Vitest też będą szły per-test po Tasku 3.

- [ ] **Step 5: Ustaw tymczasowy env var by API nie padał na starcie między taskami (nie commitujemy .env)**

Run:
```
echo "FIRECRAWL_API_KEY=fc-placeholder-for-plan03" >> apps/api/.env
```
Expected: `.env` zawiera linię z placeholderem (real key wklejamy w Tasku 14 przed smoke).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/config/env.ts .env.example apps/api/src/tools/firecrawl/firecrawl.errors.ts apps/api/src/tools/firecrawl/firecrawl.module.ts
git commit -m "feat(api): add firecrawl env + errors + module scaffold"
```

---

## Task 3: Firecrawl client z testami (TDD)

**Files:**
- Create: `apps/api/src/tools/firecrawl/firecrawl.client.ts`
- Create: `apps/api/src/tests/firecrawl.client.test.ts`

- [ ] **Step 1: Napisz failing tests w `apps/api/src/tests/firecrawl.client.test.ts`**

```ts
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
```

- [ ] **Step 2: Uruchom testy — wszystkie muszą failować (no file)**

Run: `pnpm --filter @sensai/api test firecrawl.client`
Expected: FAIL — `Cannot find module '../tools/firecrawl/firecrawl.client'`.

- [ ] **Step 3: Napisz `apps/api/src/tools/firecrawl/firecrawl.client.ts`**

```ts
import { Injectable } from "@nestjs/common";
import pRetry, { AbortError } from "p-retry";
import type { Env } from "../../config/env";
import { HttpError } from "../http-error";
import { FirecrawlApiError } from "./firecrawl.errors";

export interface ScrapeRequestParams {
  url: string;
}

export interface FirecrawlScrapeResult {
  url: string;
  markdown: string;
  title: string;
}

interface FirecrawlRawResponse {
  success: boolean;
  data?: {
    markdown?: string;
    metadata?: {
      title?: string;
      sourceURL?: string;
    };
  };
  error?: string;
}

@Injectable()
export class FirecrawlClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(env: Pick<Env, "FIRECRAWL_API_KEY" | "FIRECRAWL_BASE_URL">) {
    this.apiKey = env.FIRECRAWL_API_KEY;
    this.baseUrl = env.FIRECRAWL_BASE_URL;
  }

  async scrape(params: ScrapeRequestParams): Promise<FirecrawlScrapeResult> {
    return pRetry(
      () => this.postScrape(params.url),
      { retries: 2, factor: 2, minTimeout: 500 },
    );
  }

  private async postScrape(url: string): Promise<FirecrawlScrapeResult> {
    const res = await fetch(`${this.baseUrl}/v2/scrape`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const err = new HttpError(res.status, text);
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        throw new AbortError(err);
      }
      throw err;
    }

    const json = (await res.json()) as FirecrawlRawResponse;
    if (!json.success || !json.data?.markdown) {
      throw new AbortError(new FirecrawlApiError(json.error ?? "response missing markdown"));
    }

    return {
      url: json.data.metadata?.sourceURL ?? url,
      markdown: json.data.markdown,
      title: json.data.metadata?.title ?? "",
    };
  }
}

export const FIRECRAWL_COST_PER_SCRAPE = "0.0015";
// Source: https://firecrawl.dev/pricing — pay-as-you-go /v2/scrape, as of 2026-04-21
```

- [ ] **Step 4: Uruchom testy — wszystkie pass**

Run: `pnpm --filter @sensai/api test firecrawl.client`
Expected: PASS — 4/4 tests green. Suite time ~5s (retry test ma 500/1000 ms backoff).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/tools/firecrawl/firecrawl.client.ts apps/api/src/tests/firecrawl.client.test.ts
git commit -m "feat(api): add Firecrawl client with retry + 4xx abort + unit tests"
```

---

## Task 4: Scrape types w shared + api

**Files:**
- Modify: `packages/shared/src/schemas.ts`
- Create: `apps/api/src/tools/firecrawl/scrape.types.ts`

- [ ] **Step 1: Dodaj typy Zod do `packages/shared/src/schemas.ts` na końcu**

```ts
export const ScrapePage = z.object({
  url: z.string().url(),
  title: z.string(),
  markdown: z.string(),
  rawLength: z.number().int().nonnegative(),
  truncated: z.boolean(),
  source: z.literal("firecrawl"),
  fetchedAt: z.string().datetime(),
});
export type ScrapePage = z.infer<typeof ScrapePage>;

export const ScrapeFailure = z.object({
  url: z.string().url(),
  reason: z.string(),
  httpStatus: z.number().int().optional(),
});
export type ScrapeFailure = z.infer<typeof ScrapeFailure>;

export const ScrapeResult = z.object({
  pages: ScrapePage.array(),
  failures: ScrapeFailure.array(),
});
export type ScrapeResult = z.infer<typeof ScrapeResult>;

export const ResumeStepDto = z.object({
  input: z.object({
    urls: z.string().url().array().min(1).max(5),
  }),
});
export type ResumeStepDto = z.infer<typeof ResumeStepDto>;
```

- [ ] **Step 2: Build shared (API importuje z `dist`, nie `src`)**

Run: `pnpm --filter @sensai/shared build`
Expected: `packages/shared/dist/` zawiera `index.js` + `.d.ts` z nowymi eksportami.

- [ ] **Step 3: Stwórz `apps/api/src/tools/firecrawl/scrape.types.ts` — parametry + cap**

```ts
import { z } from "zod";

export const ScrapeParams = z.object({
  url: z.string().url(),
});
export type ScrapeParams = z.infer<typeof ScrapeParams>;

export const PAGE_MARKDOWN_CAP = 15_000;
```

- [ ] **Step 4: Verify shared eksportuje nowe typy**

Run:
```
node -e 'const s = require("./packages/shared/dist/index.js"); console.log(Object.keys(s).filter(k => k.includes("Scrape") || k.includes("Resume")).join(","))'
```
Expected: `ScrapePage,ScrapeFailure,ScrapeResult,ResumeStepDto`

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas.ts packages/shared/dist apps/api/src/tools/firecrawl/scrape.types.ts
git commit -m "feat(shared): add ScrapePage/ScrapeResult/ResumeStepDto zod types"
```

---

## Task 5: ScrapeFetchHandler z testami (TDD)

**Files:**
- Create: `apps/api/src/handlers/scrape-fetch.handler.ts`
- Create: `apps/api/src/tests/scrape-fetch-handler.test.ts`

- [ ] **Step 1: Napisz failing tests w `apps/api/src/tests/scrape-fetch-handler.test.ts`**

```ts
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
```

- [ ] **Step 2: Run tests — fail (no handler file)**

Run: `pnpm --filter @sensai/api test scrape-fetch-handler`
Expected: FAIL — `Cannot find module '../handlers/scrape-fetch.handler'`.

- [ ] **Step 3: Napisz `apps/api/src/handlers/scrape-fetch.handler.ts`**

```ts
import { Injectable } from "@nestjs/common";
import pLimit from "p-limit";
import type { StepContext, StepHandler, StepResult } from "../orchestrator/step-handler";
import { FirecrawlClient, FIRECRAWL_COST_PER_SCRAPE } from "../tools/firecrawl/firecrawl.client";
import { ToolCacheService } from "../tools/tool-cache.service";
import { HttpError } from "../tools/http-error";
import { PAGE_MARKDOWN_CAP } from "../tools/firecrawl/scrape.types";
import type { ScrapePage, ScrapeFailure, ScrapeResult } from "@sensai/shared";

interface StepInput {
  urls: string[];
}

@Injectable()
export class ScrapeFetchHandler implements StepHandler {
  readonly type = "tool.scrape";

  constructor(
    private readonly client: FirecrawlClient,
    private readonly cache: ToolCacheService,
  ) {}

  async execute(ctx: StepContext): Promise<StepResult> {
    const input = ctx.step.input as StepInput | null;
    if (!input || !Array.isArray(input.urls) || input.urls.length === 0) {
      throw new Error("tool.scrape requires step.input.urls (set via resume endpoint)");
    }

    const pages: ScrapePage[] = [];
    const failures: ScrapeFailure[] = [];
    let shortCircuit: Error | null = null;

    const limit = pLimit(3);
    await Promise.all(
      input.urls.map((url) =>
        limit(async () => {
          if (shortCircuit) return;
          try {
            const page = await this.fetchSingle(url, ctx);
            pages.push(page);
          } catch (err: any) {
            if (err instanceof HttpError && (err.status === 401 || err.status === 402)) {
              shortCircuit = err;
              return;
            }
            failures.push({
              url,
              reason: classifyReason(err),
              httpStatus: err instanceof HttpError ? err.status : undefined,
            });
          }
        }),
      ),
    );

    if (shortCircuit) throw shortCircuit;
    if (pages.length === 0) {
      throw new Error(`All scrape URLs failed (${failures.length} failures)`);
    }

    const result: ScrapeResult = { pages, failures };
    return { output: result };
  }

  private async fetchSingle(url: string, ctx: StepContext): Promise<ScrapePage> {
    return this.cache.getOrSet<ScrapePage>({
      tool: "firecrawl",
      method: "scrape",
      params: { url, formats: ["markdown"], onlyMainContent: true },
      ttlSeconds: 86_400, // 1d per design doc
      runId: ctx.run.id,
      stepId: ctx.step.id,
      fetcher: async () => {
        const t0 = Date.now();
        const raw = await this.client.scrape({ url });
        const rawLength = raw.markdown.length;
        const truncated = rawLength > PAGE_MARKDOWN_CAP;
        const markdown = truncated ? raw.markdown.slice(0, PAGE_MARKDOWN_CAP) : raw.markdown;
        const page: ScrapePage = {
          url: raw.url,
          title: raw.title,
          markdown,
          rawLength,
          truncated,
          source: "firecrawl",
          fetchedAt: new Date().toISOString(),
        };
        return { result: page, costUsd: FIRECRAWL_COST_PER_SCRAPE, latencyMs: Date.now() - t0 };
      },
    });
  }
}

function classifyReason(err: unknown): string {
  if (err instanceof HttpError) return `http_${err.status}`;
  const msg = String((err as any)?.message ?? err);
  if (/abort/i.test(msg)) return "timeout";
  if (/fetch failed|ENOTFOUND|ECONN/i.test(msg)) return "network";
  return "error";
}
```

- [ ] **Step 4: Run tests — all pass**

Run: `pnpm --filter @sensai/api test scrape-fetch-handler`
Expected: PASS — 5/5 tests green.

- [ ] **Step 5: Run full test suite — nic nie popsute**

Run: `pnpm --filter @sensai/api test`
Expected: 22 tests pass (13 z Planu 02 + 4 firecrawl-client + 5 scrape-fetch-handler).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/handlers/scrape-fetch.handler.ts apps/api/src/tests/scrape-fetch-handler.test.ts
git commit -m "feat(api): add ScrapeFetchHandler with p-limit + per-URL cache + tests"
```

---

## Task 6: Zarejestruj ScrapeFetchHandler w module

**Files:**
- Modify: `apps/api/src/handlers/handlers.module.ts`
- Modify: `apps/api/src/tools/tools.module.ts` (jeśli trzeba eksponować `FirecrawlClient`)

- [ ] **Step 1: Sprawdź obecny `tools.module.ts`**

Run: `cat apps/api/src/tools/tools.module.ts`
Oczekiwany kształt (analogiczny do `DataForSeoModule` z Planu 02): moduł importuje/re-eksportuje `DataForSeoModule`. Potrzebujemy żeby też re-eksportował `FirecrawlModule`.

- [ ] **Step 2: Zaktualizuj `apps/api/src/tools/tools.module.ts`**

Dodaj import i imports/exports:

```ts
import { Module } from "@nestjs/common";
import { DataForSeoModule } from "./dataforseo/dataforseo.module";
import { FirecrawlModule } from "./firecrawl/firecrawl.module";
import { ToolCacheService } from "./tool-cache.service";
import { ToolCallRecorder } from "./tool-call-recorder.service";

@Module({
  imports: [DataForSeoModule, FirecrawlModule],
  providers: [ToolCacheService, ToolCallRecorder],
  exports: [DataForSeoModule, FirecrawlModule, ToolCacheService, ToolCallRecorder],
})
export class ToolsModule {}
```

(Jeśli oryginał używa nieco innej struktury providers/exports — zachowaj istniejące wpisy i dołóż `FirecrawlModule` symetrycznie do `DataForSeoModule`.)

- [ ] **Step 3: Zaktualizuj `apps/api/src/handlers/handlers.module.ts`**

Zamień zawartość na:

```ts
import { Module } from "@nestjs/common";
import { BriefHandler } from "./brief.handler";
import { SerpFetchHandler } from "./serp-fetch.handler";
import { ScrapeFetchHandler } from "./scrape-fetch.handler";
import { ToolsModule } from "../tools/tools.module";
import { STEP_HANDLERS, type StepHandler } from "../orchestrator/step-handler";

@Module({
  imports: [ToolsModule],
  providers: [
    BriefHandler,
    SerpFetchHandler,
    ScrapeFetchHandler,
    {
      provide: STEP_HANDLERS,
      useFactory: (
        brief: BriefHandler,
        serp: SerpFetchHandler,
        scrape: ScrapeFetchHandler,
      ): StepHandler[] => [brief, serp, scrape],
      inject: [BriefHandler, SerpFetchHandler, ScrapeFetchHandler],
    },
  ],
  exports: [STEP_HANDLERS],
})
export class HandlersModule {}
```

- [ ] **Step 4: Verify — kompilacja API przechodzi**

Run: `pnpm --filter @sensai/api build`
Expected: exit 0, `apps/api/dist/` zaktualizowany.

- [ ] **Step 5: Verify — wszystkie testy przechodzą**

Run: `pnpm --filter @sensai/api test`
Expected: 22 pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/handlers/handlers.module.ts apps/api/src/tools/tools.module.ts
git commit -m "feat(api): register ScrapeFetchHandler + FirecrawlModule"
```

---

## Task 7: Resume validation — pure logic + testy

**Files:**
- Create: `apps/api/src/runs/resume-validation.ts`
- Create: `apps/api/src/tests/resume-validation.test.ts`

Rationale: trzymamy walidację jako czystą funkcję (łatwa do unit-testu bez DB) — service Task 8 będzie cienką warstwą DB + wywoła tę funkcję.

- [ ] **Step 1: Testy `apps/api/src/tests/resume-validation.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { validateResumeRequest, ResumeValidationError } from "../runs/resume-validation";

const run = {
  id: "run-1",
  status: "awaiting_approval",
  currentStepOrder: 2,
} as any;

const step = {
  id: "step-2",
  runId: "run-1",
  stepOrder: 2,
  status: "pending",
  requiresApproval: true,
} as any;

const prevStepOutput = {
  items: [
    { title: "T1", url: "https://a.example.com", description: "D1", position: 1 },
    { title: "T2", url: "https://b.example.com", description: "D2", position: 2 },
  ],
};

describe("validateResumeRequest", () => {
  it("returns ok on happy path", () => {
    const res = validateResumeRequest({
      run, step, prevStepOutput,
      dto: { input: { urls: ["https://a.example.com"] } },
    });
    expect(res.ok).toBe(true);
  });

  it("run_not_awaiting when run.status is running", () => {
    expect(() =>
      validateResumeRequest({
        run: { ...run, status: "running" }, step, prevStepOutput,
        dto: { input: { urls: ["https://a.example.com"] } },
      }),
    ).toThrow(expect.objectContaining({
      code: "run_not_awaiting",
      httpStatus: 409,
    } as ResumeValidationError));
  });

  it("step_not_awaiting when step.status is completed", () => {
    expect(() =>
      validateResumeRequest({
        run, step: { ...step, status: "completed" }, prevStepOutput,
        dto: { input: { urls: ["https://a.example.com"] } },
      }),
    ).toThrow(expect.objectContaining({ code: "step_not_awaiting", httpStatus: 409 }));
  });

  it("step_out_of_order when step.stepOrder != run.currentStepOrder", () => {
    expect(() =>
      validateResumeRequest({
        run: { ...run, currentStepOrder: 3 }, step, prevStepOutput,
        dto: { input: { urls: ["https://a.example.com"] } },
      }),
    ).toThrow(expect.objectContaining({ code: "step_out_of_order", httpStatus: 409 }));
  });

  it("urls_not_in_serp when URL not in prev output items", () => {
    expect(() =>
      validateResumeRequest({
        run, step, prevStepOutput,
        dto: { input: { urls: ["https://evil.example.com"] } },
      }),
    ).toThrow(expect.objectContaining({
      code: "urls_not_in_serp",
      httpStatus: 400,
    }));
  });
});
```

- [ ] **Step 2: Run tests — fail (no file)**

Run: `pnpm --filter @sensai/api test resume-validation`
Expected: FAIL — `Cannot find module '../runs/resume-validation'`.

- [ ] **Step 3: Napisz `apps/api/src/runs/resume-validation.ts`**

```ts
import { SerpResult } from "../tools/dataforseo/serp.types";
import type { ResumeStepDto } from "@sensai/shared";
import type { PipelineRunRow, PipelineStepRow } from "../orchestrator/step-handler";

export class ResumeValidationError extends Error {
  constructor(
    public readonly code:
      | "run_not_awaiting"
      | "step_not_awaiting"
      | "step_out_of_order"
      | "urls_not_in_serp",
    public readonly httpStatus: number,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ResumeValidationError";
  }
}

interface ValidateInput {
  run: PipelineRunRow;
  step: PipelineStepRow;
  prevStepOutput: unknown;
  dto: ResumeStepDto;
}

export function validateResumeRequest(args: ValidateInput): { ok: true } {
  const { run, step, prevStepOutput, dto } = args;

  if (run.status !== "awaiting_approval") {
    throw new ResumeValidationError(
      "run_not_awaiting", 409,
      `Run status is "${run.status}", expected "awaiting_approval"`,
    );
  }

  if (step.status !== "pending" || step.requiresApproval !== true) {
    throw new ResumeValidationError(
      "step_not_awaiting", 409,
      `Step not in pending+requiresApproval state (status=${step.status}, requiresApproval=${step.requiresApproval})`,
    );
  }

  if (step.stepOrder !== run.currentStepOrder) {
    throw new ResumeValidationError(
      "step_out_of_order", 409,
      `Step order ${step.stepOrder} differs from run.currentStepOrder ${run.currentStepOrder}`,
    );
  }

  const parsed = SerpResult.safeParse(prevStepOutput);
  if (!parsed.success) {
    throw new ResumeValidationError(
      "urls_not_in_serp", 400,
      "Previous step output is not a SerpResult — cannot validate URLs",
    );
  }
  const allowed = new Set(parsed.data.items.map((i) => i.url));
  const seen = new Set<string>();
  const invalid: string[] = [];
  for (const u of dto.input.urls) {
    if (seen.has(u)) {
      invalid.push(u);
      continue;
    }
    seen.add(u);
    if (!allowed.has(u)) invalid.push(u);
  }
  if (invalid.length > 0) {
    throw new ResumeValidationError(
      "urls_not_in_serp", 400,
      "One or more URLs are not in the previous SERP output (or are duplicates)",
      { invalid },
    );
  }

  return { ok: true };
}
```

- [ ] **Step 4: Run tests — pass**

Run: `pnpm --filter @sensai/api test resume-validation`
Expected: PASS — 5/5 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/runs/resume-validation.ts apps/api/src/tests/resume-validation.test.ts
git commit -m "feat(api): add resume validation pure function + unit tests"
```

---

## Task 8: Resume endpoint — service + controller wiring

**Files:**
- Modify: `apps/api/src/runs/runs.service.ts`
- Modify: `apps/api/src/runs/runs.controller.ts`

- [ ] **Step 1: Dodaj metodę `resume()` do `RunsService`**

W pliku `apps/api/src/runs/runs.service.ts` dodaj importy:

```ts
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { ResumeStepDto } from "@sensai/shared";
import { validateResumeRequest, ResumeValidationError } from "./resume-validation";
```

Następnie na końcu klasy dołóż metodę:

```ts
  async resume(runId: string, stepId: string, dto: unknown) {
    const parsed = ResumeStepDto.parse(dto);

    const [run] = await this.db.select().from(pipelineRuns).where(eq(pipelineRuns.id, runId));
    if (!run) throw new NotFoundException(`Run ${runId} not found`);

    const [step] = await this.db
      .select()
      .from(pipelineSteps)
      .where(and(eq(pipelineSteps.id, stepId), eq(pipelineSteps.runId, runId)));
    if (!step) throw new NotFoundException(`Step ${stepId} not found in run ${runId}`);

    const [prevStep] = await this.db
      .select()
      .from(pipelineSteps)
      .where(and(eq(pipelineSteps.runId, runId), eq(pipelineSteps.stepOrder, step.stepOrder - 1)));
    const prevStepOutput = prevStep?.output ?? null;

    try {
      validateResumeRequest({ run, step, prevStepOutput, dto: parsed });
    } catch (err) {
      if (err instanceof ResumeValidationError) {
        if (err.httpStatus === 409) throw new ConflictException({ code: err.code, message: err.message });
        if (err.httpStatus === 400) throw new BadRequestException({ code: err.code, message: err.message, ...(err.details ?? {}) });
      }
      throw err;
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(pipelineSteps)
        .set({ input: parsed.input })
        .where(eq(pipelineSteps.id, stepId));
      await tx
        .update(pipelineRuns)
        .set({ status: "running" })
        .where(eq(pipelineRuns.id, runId));
    });

    await this.orchestrator.enqueueStep(runId, stepId);

    return this.get(runId);
  }
```

- [ ] **Step 2: Dodaj endpoint do `RunsController`**

W `apps/api/src/runs/runs.controller.ts`:

```ts
  @Post(":id/steps/:stepId/resume")
  resume(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("stepId", new ParseUUIDPipe()) stepId: string,
    @Body() body: unknown,
  ) {
    return this.svc.resume(id, stepId, body);
  }
```

- [ ] **Step 3: Build API — kompilacja**

Run: `pnpm --filter @sensai/api build`
Expected: exit 0.

- [ ] **Step 4: Smoke — API startuje**

Run (w osobnym terminalu): `pnpm --filter @sensai/api start:dev`
Expected: NestJS loguje `Application is running on port 8000`. Brak błędów o brakującym `FIRECRAWL_API_KEY` (placeholder z Task 2).
Zatrzymaj proces.

- [ ] **Step 5: Full test suite — nic nie popsute**

Run: `pnpm --filter @sensai/api test`
Expected: 27 pass (22 + 5 resume-validation).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/runs/runs.service.ts apps/api/src/runs/runs.controller.ts
git commit -m "feat(api): add POST /runs/:id/steps/:stepId/resume endpoint"
```

---

## Task 9: Web — `api.runs.resume` + ApproveScrapeForm (client component)

**Files:**
- Modify: `apps/web/src/lib/api.ts`
- Create: `apps/web/src/app/runs/[id]/approve-scrape-form.tsx`

Web ma już `apiFetch` z bearer tokenem w `apps/web/src/lib/api.ts` — dokładamy tam metodę `api.runs.resume()` i używamy w komponencie.

- [ ] **Step 1: Dodaj `api.runs.resume` w `apps/web/src/lib/api.ts`**

W istniejącym obiekcie `api.runs`, po `start`, dopisz:

```ts
    resume: (runId: string, stepId: string, dto: { input: { urls: string[] } }) =>
      apiFetch<Run & { steps: Step[] }>(`/runs/${runId}/steps/${stepId}/resume`, {
        method: "POST",
        body: JSON.stringify(dto),
      }),
```

- [ ] **Step 2: Stwórz `apps/web/src/app/runs/[id]/approve-scrape-form.tsx`**

```tsx
"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";

interface SerpItem {
  title: string;
  url: string;
  description: string;
  position: number;
}

interface Props {
  runId: string;
  stepId: string;
  serpItems: SerpItem[];
}

const MAX_URLS = 5;
const DEFAULT_CHECKED = 3;

const ERROR_MESSAGES: Record<string, string> = {
  urls_not_in_serp: "Wybrane URL-e muszą być z listy wyników SERP.",
  run_not_awaiting: "Ten krok został już wykonany — odśwież stronę.",
  step_not_awaiting: "Ten krok został już wykonany — odśwież stronę.",
  step_out_of_order: "Nieaktualny krok — odśwież stronę.",
};

export function ApproveScrapeForm({ runId, stepId, serpItems }: Props) {
  const qc = useQueryClient();
  const initial = useMemo(
    () => new Set(serpItems.slice(0, DEFAULT_CHECKED).map((i) => i.url)),
    [serpItems],
  );
  const [selected, setSelected] = useState<Set<string>>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(url: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else if (next.size < MAX_URLS) next.add(url);
      return next;
    });
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await api.runs.resume(runId, stepId, { input: { urls: Array.from(selected) } });
      await qc.invalidateQueries({ queryKey: ["run", runId] });
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      const match = msg.match(/API \d+: (.+)$/s);
      let code: string | undefined;
      if (match) {
        try {
          const parsed = JSON.parse(match[1]);
          code = parsed?.code ?? parsed?.message?.code;
        } catch { /* body wasn't JSON */ }
      }
      setError(ERROR_MESSAGES[code ?? ""] ?? msg || "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="space-y-4 rounded border border-amber-200 bg-amber-50 p-4">
      <div>
        <h2 className="text-lg font-medium">Wybierz strony do scrapowania</h2>
        <p className="text-sm text-muted-foreground">
          Wybrano <strong>{selected.size}</strong> z {MAX_URLS}. Zaznacz strony konkurencji których
          treść trafi do promptu briefu.
        </p>
      </div>
      <ul className="space-y-2">
        {serpItems.map((item) => {
          const checked = selected.has(item.url);
          const disabled = !checked && selected.size >= MAX_URLS;
          return (
            <li key={item.url} className={disabled ? "opacity-50" : ""}>
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggle(item.url)}
                  className="mt-1"
                />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">#{item.position} {item.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{item.url}</span>
                  <span className="block text-xs text-muted-foreground">{item.description.slice(0, 200)}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={submitting || selected.size === 0}
        className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {submitting ? "Wysyłam…" : `Scrapuj wybrane (${selected.size})`}
      </button>
    </section>
  );
}
```

Uwaga: `useQueryClient` + `invalidateQueries` zamiast `router.refresh()` pasuje do pattern-u React Query z istniejącego `useRun` hooka (`apps/web/src/lib/hooks.ts`) — invalidate wymusi re-fetch via hook bez reloadu strony. Klasy tailwindowe (`text-muted-foreground`, `bg-primary`, etc.) używają design-tokenów z shadcn/ui które w projekcie już są (widoczne w `page.tsx`).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/src/app/runs/[id]/approve-scrape-form.tsx
git commit -m "feat(web): add api.runs.resume + ApproveScrapeForm client component"
```

---

## Task 10: Web — gałąź `awaiting_approval` w runs/[id]/page.tsx

**Files:**
- Modify: `apps/web/src/app/runs/[id]/page.tsx`

- [ ] **Step 1: Dodaj import i branch w `apps/web/src/app/runs/[id]/page.tsx`**

Dopisz import na górze pliku (po istniejących):

```tsx
import { ApproveScrapeForm } from "./approve-scrape-form";
```

Wewnątrz komponentu, po `const selectedStep = ...` dodaj wyliczenie checkpointu:

```tsx
  const currentStep = run.data?.steps.find((s) => s.stepOrder === run.data?.currentStepOrder);
  const isAwaitingScrape =
    run.data?.status === "awaiting_approval" && currentStep?.type === "tool.scrape";

  const prevOutput = isAwaitingScrape
    ? run.data?.steps.find((s) => s.stepOrder === currentStep!.stepOrder - 1)?.output
    : null;

  const serpItems: Array<{ title: string; url: string; description: string; position: number }> =
    prevOutput && typeof prevOutput === "object" && Array.isArray((prevOutput as any).items)
      ? (prevOutput as any).items
      : [];
```

W JSX, wewnątrz bloku `{run.data && ( <> ... </> )}`, **po `<header>…</header>` i przed `<div className="grid grid-cols-1 gap-6 md:grid-cols-[280px_1fr]">`**, wstaw:

```tsx
          {isAwaitingScrape && currentStep && serpItems.length > 0 && (
            <ApproveScrapeForm
              runId={run.data.id}
              stepId={currentStep.id}
              serpItems={serpItems}
            />
          )}
```

Note: `api.runs.resume` wykorzystuje istniejące `NEXT_PUBLIC_API_URL` i `NEXT_PUBLIC_API_TOKEN` (tak jak `api.runs.start`) — żadnych nowych env var-ów nie trzeba. Token w browser jest zaakceptowanym trade-offem projektu (dev-token, brak modelu auth usera).

- [ ] **Step 3: Uruchom dev w dwóch terminalach**

Terminal A: `pnpm --filter @sensai/api start:dev`
Terminal B: `pnpm --filter @sensai/web dev`
Expected: oba startują, brak błędów kompilacji.

- [ ] **Step 4: Manual smoke — wejdź na `/runs/<any-completed-run-id>`**

Otwórz `http://localhost:7000/runs/<id>` dla runu z Planu 02 (status `completed`). Formularz NIE powinien się pokazać (run nie jest `awaiting_approval`). Weryfikuje że branch nie psuje normalnej strony.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/runs/[id]/page.tsx
# plus ewentualny route handler proxy jeśli go dodałeś
git commit -m "feat(web): show ApproveScrapeForm when run.status=awaiting_approval + tool.scrape"
```

---

## Task 11: Fold-iny z Planu 02 — BullMQ 4xx + NaN guard

**Files:**
- Modify: `apps/api/src/orchestrator/pipeline.worker.ts`

- [ ] **Step 1: Przeczytaj obecny `pipeline.worker.ts`**

Run: `cat apps/api/src/orchestrator/pipeline.worker.ts`
Zwróć uwagę na blok catch i `checkCostCap`.

- [ ] **Step 2: Dodaj `isHttp4xx` gałąź w catch**

W bloku `catch (err: any)` wewnątrz `process()`, PRZED linią `const isCostCap = err instanceof CostLimitExceededError;`, dodaj:

```ts
      const isHttp4xx =
        err?.name === "HttpError" &&
        typeof err?.status === "number" &&
        err.status >= 400 && err.status < 500 &&
        err.status !== 429;
```

Zmodyfikuj obliczanie `isFinal`:

```ts
      const isFinal = isCostCap || isHttp4xx || attempt >= maxAttempts;
```

Zmodyfikuj rzucanie `UnrecoverableError`:

```ts
      if (isCostCap || isHttp4xx) {
        throw new UnrecoverableError(err.message);
      }
      throw err;
```

- [ ] **Step 3: Dodaj NaN guard w `checkCostCap`**

Zamień ciało metody `checkCostCap`:

```ts
  private async checkCostCap(runId: string): Promise<void> {
    const env = loadEnv();
    const cap = parseFloat(env.MAX_COST_PER_RUN_USD);
    if (!Number.isFinite(cap) || cap <= 0) {
      this.logger.warn(
        { raw: env.MAX_COST_PER_RUN_USD },
        "MAX_COST_PER_RUN_USD invalid, cost cap disabled",
      );
      return;
    }
    const result = await this.db.execute(sql`
      SELECT COALESCE(SUM(cost_usd::numeric), 0)::float8 AS sum_cost
      FROM (
        SELECT cost_usd FROM llm_calls WHERE run_id = ${runId}::uuid
        UNION ALL
        SELECT cost_usd FROM tool_calls WHERE run_id = ${runId}::uuid
      ) t
    `);
    const row = (result as unknown as { rows: { sum_cost: number }[] }).rows[0];
    const sumCost = Number(row?.sum_cost ?? 0);
    if (sumCost >= cap) {
      throw new CostLimitExceededError(runId, cap, sumCost);
    }
  }
```

- [ ] **Step 4: Build + tests**

Run: `pnpm --filter @sensai/api build && pnpm --filter @sensai/api test`
Expected: build exit 0, 27 testów pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/orchestrator/pipeline.worker.ts
git commit -m "fix(api): treat HTTP 4xx (non-429) as UnrecoverableError + NaN guard for cost cap"
```

---

## Task 12: Brief handler + prompt wariant z kontekstem scrape

**Files:**
- Modify: `apps/api/src/handlers/brief.handler.ts`
- Modify: `apps/api/src/prompts/brief.prompt.ts`

- [ ] **Step 1: Zaktualizuj `apps/api/src/prompts/brief.prompt.ts` — dodaj builder dla scrape pages**

Dodaj import po istniejących:

```ts
import type { ScrapePage } from "@sensai/shared";
```

Dodaj funkcję obok `formatSerpContext`:

```ts
function formatScrapeContext(pages: ScrapePage[]): string {
  const sections = pages.map((p) => [
    `### ${p.title || p.url}`,
    `URL: ${p.url}${p.truncated ? ` (skrócone do ${p.markdown.length} znaków z ${p.rawLength})` : ""}`,
    "",
    p.markdown,
  ].join("\n"));
  return [
    "## Treść stron konkurencji (wybranych przez operatora):",
    "",
    ...sections,
    "",
    "Wykorzystaj tę treść — znajdź luki jakościowe, wspólne tezy do powtórzenia, pomysły na unikalny angle.",
  ].join("\n");
}
```

Rozszerz `briefPrompt.user` o drugi opcjonalny argument `scrapePages`:

```ts
  user(input: RunInput, serpContext?: SerpItem[], scrapePages?: ScrapePage[]) {
    const lines = [
      `Temat artykułu: ${input.topic}`,
      input.mainKeyword && `Główne słowo kluczowe: ${input.mainKeyword}`,
      input.intent && `Intent użytkownika: ${input.intent}`,
      input.contentType && `Typ treści: ${input.contentType}`,
    ].filter(Boolean);
    if (serpContext && serpContext.length > 0) {
      lines.push("", formatSerpContext(serpContext));
    }
    if (scrapePages && scrapePages.length > 0) {
      lines.push("", formatScrapeContext(scrapePages));
    }
    lines.push("", "Przygotuj brief.");
    return lines.join("\n");
  },
```

- [ ] **Step 2: Zaktualizuj `apps/api/src/handlers/brief.handler.ts` — czytaj `previousOutputs.scrape`**

Dodaj import:

```ts
import { ScrapeResult } from "@sensai/shared";
```

W `execute`, po wyliczeniu `serpContext`, dodaj:

```ts
    const scrapeParsed = ScrapeResult.safeParse(ctx.previousOutputs.scrape);
    const scrapePages = scrapeParsed.success ? scrapeParsed.data.pages : undefined;
```

Zmień wywołanie `briefPrompt.user`:

```ts
      prompt: briefPrompt.user(input, serpContext, scrapePages),
```

- [ ] **Step 3: Tests — Plan 02 brief tests (jeśli są) oraz build**

Run: `pnpm --filter @sensai/api test && pnpm --filter @sensai/api build`
Expected: 27 tests pass (dla „Brief + research" handler bez scrape się nie zmienia — backward compat). Build zielony.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/prompts/brief.prompt.ts apps/api/src/handlers/brief.handler.ts
git commit -m "feat(api): brief prompt reads optional scrape pages (backward compat)"
```

---

## Task 13: Seed trzeci szablon + uruchom seed

**Files:**
- Modify: `apps/api/src/seed/seed.ts`

- [ ] **Step 1: Dodaj trzeci `upsertTemplate` w `apps/api/src/seed/seed.ts`**

Po istniejącym `briefResearch = await upsertTemplate(...)`, dodaj:

```ts
  const briefResearchScrape = await upsertTemplate(db, "Brief + research + scrape", 1, {
    steps: [
      { key: "research", type: "tool.serp.fetch", auto: true },
      { key: "scrape",   type: "tool.scrape",     auto: false },
      { key: "brief",    type: "llm.brief",       auto: true },
    ],
  });
```

I dopisz do console.log:

```ts
  console.log(`    "${briefResearchScrape.name}" v${briefResearchScrape.version}: ${briefResearchScrape.id}`);
```

- [ ] **Step 2: Uruchom seed**

Run: `pnpm --filter @sensai/api seed`
Expected: logi pokazują 3 szablony z ID-kami. Nowy templateId „Brief + research + scrape" v1 zapamiętaj do smoke testu.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/seed/seed.ts
git commit -m "feat(api): seed third template 'Brief + research + scrape' v1"
```

---

## Task 14: Verification — smoke run end-to-end

**Files:**
- Create: `docs/superpowers/verifications/2026-04-21-plan-03-verification.md`

- [ ] **Step 1: Wklej prawdziwy FIRECRAWL_API_KEY**

Edytuj `apps/api/.env` — zamień `fc-placeholder-for-plan03` na realny klucz z https://firecrawl.dev/app/api-keys.

- [ ] **Step 2: Uruchom stack**

Terminal A: `pnpm --filter @sensai/api start:dev`
Terminal B: `pnpm --filter @sensai/web dev`

- [ ] **Step 3: Wystartuj run z nowym szablonem**

```bash
curl -X POST http://localhost:8000/runs \
  -H "Authorization: Bearer $API_BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "ed6676c9-8847-4121-bb96-356101da3872",
    "templateId": "<TEMPLATE_ID_Z_TASK_13>",
    "input": { "topic": "Audyt SEO dla małej firmy", "mainKeyword": "audyt seo" }
  }'
```

Zapamiętaj `run.id`.

- [ ] **Step 4: Poczekaj na SERP + approval (polling)**

```bash
curl -s http://localhost:8000/runs/<runId> \
  -H "Authorization: Bearer $API_BEARER_TOKEN" | jq '.status, .steps[] | {stepOrder, type, status}'
```

Expected: po ~20s `status: "awaiting_approval"`, step 1 `completed`, step 2 `pending` (wymaga zatwierdzenia), step 3 `pending`.

- [ ] **Step 5: Otwórz `/runs/<runId>` w przeglądarce**

Zweryfikuj: checkboxy z SERP są widoczne, top 3 pre-checked, licznik działa, disabled przy 5/5. Zostaw top 3 zaznaczone.

- [ ] **Step 6: Kliknij „Scrapuj wybrane"**

Expected: form się wysyła, po refresh strony status = `running`. Po kolejnych ~30s status = `completed`.

- [ ] **Step 7: Zweryfikuj scrape output**

```bash
curl -s http://localhost:8000/runs/<runId> \
  -H "Authorization: Bearer $API_BEARER_TOKEN" \
  | jq '.steps[1].output | {pageCount: (.pages|length), failures: (.failures|length), firstPage: .pages[0] | {url, title, rawLength, truncated}}'
```

Expected: `pageCount: 3`, `failures: 0` (lub mało), każda strona z sensownym title + rawLength. Markdown ≤ 15 000.

- [ ] **Step 8: Zweryfikuj brief zawiera kontekst scrapa**

```bash
curl -s http://localhost:8000/runs/<runId> \
  -H "Authorization: Bearer $API_BEARER_TOKEN" \
  | jq '.steps[2].output'
```

Expected: `{headline, angle, pillars, audiencePainPoints, successCriteria}` — brief w którym `angle` nawiązuje do rzeczywistej treści konkurencji (subiektywne, ale odczuwalnie bogatszy niż dla „Brief + research" bez scrapa).

- [ ] **Step 9: Zweryfikuj koszt + cache**

```bash
psql "$DATABASE_URL" -c "
  SELECT tool, method, from_cache, cost_usd, latency_ms FROM tool_calls
  WHERE run_id = '<runId>'::uuid ORDER BY created_at;
"
```

Expected: 1 wpis dla `dataforseo/serp.organic.live` + 3 wpisy dla `firecrawl/scrape` (każdy `from_cache=false`, `cost_usd=0.0015`).

Second run z tym samym keywordem:
- Repeat Step 3 z tym samym `mainKeyword`
- Expected: SERP from_cache=true, scrape from_cache=true dla 3 URL-i → total cost scrape część = $0, LLM koszt jak zwykle.

- [ ] **Step 10: Zweryfikuj 4xx fold-in — zepsuj klucz**

Edytuj `apps/api/.env`: `FIRECRAWL_API_KEY=fc-wrong`. Restart API.

Wystartuj nowy run, zatwierdź URL-e. Sprawdź status runu:

```bash
curl -s http://localhost:8000/runs/<runId> \
  -H "Authorization: Bearer $API_BEARER_TOKEN" \
  | jq '.status, .steps[1] | {status, error: .error | {code, message}}'
```

Expected: `run.status: failed`, `step.status: failed`, `step.error.code: "http_401"`. `retry_count = 1` (NIE 3 — UnrecoverableError zadziałał).

Przywróć prawidłowy klucz w `.env`, restart API.

- [ ] **Step 11: Napisz verification doc**

Create `docs/superpowers/verifications/2026-04-21-plan-03-verification.md`:

```markdown
# Plan 03 Verification — 2026-04-21

**Plan:** docs/superpowers/plans/2026-04-21-plan-03-scraping.md
**Spec:** docs/superpowers/specs/2026-04-21-plan-03-scraping-design.md
**Branch:** feat/plan-03-scraping

## Smoke: end-to-end

- Run ID: <wklej>
- Keyword: „audyt seo"
- SERP: 10 items (8 organic po filtrze handlera)
- User selection: top 3 URL-i via ApproveScrapeForm
- Scrape: 3 pages OK, 0 failures
- Markdown: największy rawLength = <X>, truncated = <true/false>
- Brief: angle referuje do konkretnych tez z treści stron (tak/nie + krótki cytat)
- Run time: <XXs>
- Koszt: SERP <$>, scrape <$0.0045>, LLM <$>, suma <$>

## Cache verify

Drugi run z tym samym keywordem:
- SERP from_cache = true (koszt $0)
- Scrape from_cache = true dla wszystkich URL-i (koszt $0)
- Run time skrócony do <Xs>

## 4xx fold-in verify

Z zepsutym FIRECRAWL_API_KEY:
- run.status = failed po 1 próbie (nie 3 retry)
- step.error.code = "http_401"
- retry_count = 1

## Cost cap NaN guard

Z MAX_COST_PER_RUN_USD="abc":
- API loguje warn „MAX_COST_PER_RUN_USD invalid, cost cap disabled"
- Run leci normalnie (nie jest blokowany — zachowanie zamierzone przy niewalidnym cap)

## Znane gotchas

- <wklej jeśli coś wyskoczyło>
```

- [ ] **Step 12: Commit verification doc**

```bash
git add docs/superpowers/verifications/2026-04-21-plan-03-verification.md
git commit -m "docs: verify Plan 03 end-to-end flow"
```

---

## Task 15: Update auto-memory (no code)

Memory sits outside git, update directly.

- [ ] **Step 1: Replace `~/.claude/projects/-Users-datezone-Projekty-sensai-content-generation/memory/project_plan_02_tools_dataforseo.md` status pointer**

(Opcjonalnie) — jeśli chcesz zmienić tytuł z „Plan 02 Tools DataForSEO" na „Plan 02 Tools DataForSEO — SUPERSEDED BY PLAN 03 FOLD-INS" albo po prostu zaznaczyć że limits A+B zostały rozwiązane. Zachowaj pozostałą treść.

Dopisz na końcu pliku sekcję:

```markdown
## Update 2026-04-21 (po Planie 03)

- BullMQ 4xx fold-in: ZROBIONE w Planie 03 (`pipeline.worker.ts`, warunek `isHttp4xx`).
- NaN guard w MAX_COST_PER_RUN_USD: ZROBIONE w Planie 03.
- Helper text w `runs/new/page.tsx`: nadal pending, Plan 04 (template-aware UI).
```

- [ ] **Step 2: Stwórz `~/.claude/projects/-Users-datezone-Projekty-sensai-content-generation/memory/project_plan_03_scraping.md`**

```markdown
---
name: Plan 03 Scraping — COMPLETED
description: Firecrawl scrape + pierwszy checkpoint (user URL selection) + Plan 02 fold-ins, skończone 2026-04-21 na branch feat/plan-03-scraping
type: project
---

**Status:** COMPLETE (2026-04-21). Branch `feat/plan-03-scraping`. Merge status: <uzupełnij po mergu do main>.

**Co działa end-to-end:** trzeci szablon „Brief + research + scrape" v1 → step 1 `tool.serp.fetch` (bez zmian z Planu 02) → step 2 `tool.scrape` (checkpoint, `requiresApproval=true`) pauzuje run, UI na `/runs/[id]` renderuje `ApproveScrapeForm` z checkboxami (top 3 pre-checked, hard cap 5). User klika „Scrapuj wybrane" → POST /runs/:id/steps/:stepId/resume z `{ input: { urls } }` → API waliduje (URL musi być w SERP items), wypełnia `step.input`, flip run.status=running, re-enqueue → worker czyta `ctx.step.input.urls` → `p-limit(3)` × Firecrawl `/v2/scrape` per URL, per-URL cache TTL 1d, truncate markdown do 15k, output `{ pages, failures }` → step 3 `llm.brief` czyta `previousOutputs.scrape` i podaje markdown w prompcie w sekcji „Treść stron konkurencji".

**Fold-iny z Planu 02:**
- BullMQ 4xx (≠429) → `UnrecoverableError` w `pipeline.worker.ts`. 401/402 z Firecrawla i DataForSEO już nie retryują 3× — fail instant.
- NaN guard w `checkCostCap` — jeśli `MAX_COST_PER_RUN_USD` nie parsuje się do finite > 0, logujemy warn i wyłączamy cap (zamiast cichego `>= NaN = false`).

**Refactor Planu 02:** `HttpError` wyciągnięty z `tools/dataforseo/dataforseo.errors.ts` do `tools/http-error.ts`. Teraz ma pole `code = "http_${status}"`. `dataforseo.errors.ts` re-eksportuje. Zero-cost dla istniejących importów.

**Seed IDs (dev DB, persist):**
- projectId `ed6676c9-8847-4121-bb96-356101da3872` (slug demo) — bez zmian z Planu 01
- templateId Brief only (MVP) v1 `0a046807-bd23-463d-8410-2278caa1e5e0` — bez zmian
- templateId Brief + research v1 `0dfc1145-96db-46ac-b2b4-ddf5c30e5f7a` — bez zmian
- templateId Brief + research + scrape v1 `<uzupełnij po seed>`

**Env additions:** `FIRECRAWL_API_KEY` (wymagane, API nie startuje bez), `FIRECRAWL_BASE_URL` (default `https://api.firecrawl.dev`).

**Cost:** Firecrawl nie zwraca costu w response. Stała `FIRECRAWL_COST_PER_SCRAPE="0.0015"` w `firecrawl.client.ts`. Dla max 5 URL = $0.0075 per run scrape część. LLM dalej dominuje.

**Tests:** 27 unit tests (22 z Planu 02 + 5 nowych). `pnpm --filter @sensai/api test` ~3s.

**Known limitations (Plan 04 candidates):**
- Brak crawl4ai + fallback strategii (wszystko idzie przez Firecrawl). Przy stronach chronionych przez Cloudflare Firecrawl może failować — wtedy strona leci do `failures[]` i brief jest uboższy.
- Brak live-update statusu runa w UI — user robi `router.refresh()` ręcznie po „Scrapuj wybrane".
- Brak custom URL input (scrape URL-i spoza SERP). User może wybrać tylko z top 10 SERP.
- Helper text w `runs/new/page.tsx` dalej mówi „Wymagane dla szablonów z research SERP" — nieaktualne dla szablonu #3 gdzie mainKeyword jest równie wymagane. Do Planu 04 z template-aware UI.
- p-retry AbortError zakłada że wrapper jest rozwijany do originalError — zweryfikowane testem `throws HttpError on 401` (asercja `name: "HttpError"`, nie `AbortError`).

**How to apply in future sessions:**
- Plan 04 dodaje crawl4ai jako primary. Wzorzec: `apps/api/src/tools/crawl4ai/` z tym samym kształtem co firecrawl (client + errors + module + types). `ScrapeFetchHandler` staje się orchestratorem: próba crawl4ai z timeout 30s → fallback Firecrawl na 403/429/503/Cloudflare/<200 chars/timeout. `source` w `ScrapePage` staje się `"crawl4ai" | "firecrawl"`.
- NIE rób duplikatu `HttpError`, `ToolCacheService`, `ToolCallRecorder`, `p-limit` patternu — wszystko gotowe.
- Resume endpoint jest generyczny — każdy kolejny `requiresApproval=true` krok może go używać, tylko walidacja `prevStepOutput` idzie inaczej per typ kroku. Warto wydzielić strategię walidacji gdy pojawi się drugi checkpoint.
```

- [ ] **Step 3: Update `~/.claude/projects/-Users-datezone-Projekty-sensai-content-generation/memory/MEMORY.md`**

Dodaj linię pod `Plan 02 Tools DataForSEO`:

```
- [Plan 03 Scraping](project_plan_03_scraping.md) — COMPLETED 2026-04-21, Firecrawl + first checkpoint + fold-ins from Plan 02
```

- [ ] **Step 4: Done** — no commit (memory outside git).

---

## Recap

**15 substantive tasks + 1 pre-flight.** Total ~20 commits na branchu `feat/plan-03-scraping`.

**Test count after plan:** 27 unit tests (22 z Planu 02 + 4 firecrawl-client + 5 scrape-fetch-handler + 5 resume-validation).

**New env vars:** `FIRECRAWL_API_KEY`, `FIRECRAWL_BASE_URL`.

**New step types:** `tool.scrape` (ScrapeFetchHandler).

**New template:** „Brief + research + scrape" v1.

**New API endpoints:** `POST /runs/:id/steps/:stepId/resume`.

**New DB behaviors (schema bez zmian):** `pipeline_steps.input` zapisywany z UI via resume; `tool_calls` rejestruje wpisy `(tool: "firecrawl", method: "scrape")`.

**Files created:** 8 source + 3 test + 1 verification + 1 memory = 13.

**Files modified:** ~9.

**Merge strategy:** jak w Planie 02 — po zielonym verification `git checkout main && git merge --no-ff feat/plan-03-scraping` (gh CLI dalej niezainstalowane, merge lokalny).
