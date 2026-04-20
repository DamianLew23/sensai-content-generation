# Plan 2 — Warstwa narzędzi (DataForSEO SERP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wprowadzić warstwę narzędzi zewnętrznych do pipeline'u zaczynając od DataForSEO SERP, z cienką abstrakcją (każdy tool = własny moduł NestJS), cache'owaniem (`tool_cache` 7d), book-keepingiem kosztów (`tool_calls`), oraz nowy szablon "Brief + research" produkujący brief wzbogacony o top 10 wyników Google. Plus lite cost cap per-run i Vitest setup z 8 testami.

**Architecture:** Każdy tool to osobny NestJS service (`DataForSeoClient`) opakowany w handler (`SerpFetchHandler`) który używa wspólnego `ToolCacheService` (read-through, deterministic params hash) i `ToolCallRecorder`. Brief handler czyta `previousOutputs.research` i wzbogaca prompt. BullMQ worker przed każdym handlerem sprawdza sumę kosztów (LLM + tool) i rzuca `UnrecoverableError` jeśli przekroczy cap. Brak generycznego `ToolClient` interface'u — YAGNI do n=2.

**Tech Stack:** Istniejący stack z Planu 01 + p-retry, Vitest, @vitest/coverage-v8.

**Spec:** `docs/superpowers/specs/2026-04-20-plan-02-tools-dataforseo-design.md`

---

## File Structure Overview

```
sensai-content-generation/
├── .env.example                                       [MOD]
├── package.json                                        [MOD] (turbo task "test")
├── apps/
│   ├── api/
│   │   ├── package.json                                [MOD] (vitest, p-retry)
│   │   ├── vitest.config.ts                            [NEW]
│   │   ├── .env.example                                [MOD]
│   │   └── src/
│   │       ├── config/
│   │       │   └── env.ts                              [MOD]
│   │       ├── tools/                                  [NEW]
│   │       │   ├── tools.module.ts
│   │       │   ├── stable-stringify.ts
│   │       │   ├── tool-call-recorder.service.ts
│   │       │   ├── tool-cache.service.ts
│   │       │   └── dataforseo/
│   │       │       ├── dataforseo.module.ts
│   │       │       ├── dataforseo.client.ts
│   │       │       ├── dataforseo.errors.ts
│   │       │       └── serp.types.ts
│   │       ├── handlers/
│   │       │   ├── handlers.module.ts                  [MOD]
│   │       │   ├── serp-fetch.handler.ts               [NEW]
│   │       │   └── brief.handler.ts                    [MOD]
│   │       ├── prompts/
│   │       │   └── brief.prompt.ts                     [MOD]
│   │       ├── orchestrator/
│   │       │   ├── pipeline.worker.ts                  [MOD]
│   │       │   └── cost-limit-exceeded.error.ts        [NEW]
│   │       ├── app.module.ts                           [MOD]
│   │       ├── seed/
│   │       │   └── seed.ts                             [MOD]
│   │       └── tests/                                  [NEW]
│   │           ├── stable-stringify.test.ts
│   │           ├── tool-cache.service.test.ts
│   │           └── dataforseo.client.test.ts
│   └── web/
│       └── src/app/runs/new/page.tsx                   [MOD]
```

---

## Task 1: Add env vars + update .env.example

**Files:**
- Modify: `apps/api/src/config/env.ts`
- Modify: `apps/api/.env.example`
- Modify: `.env.example` (root)

- [ ] **Step 1: Extend env schema in `apps/api/src/config/env.ts`**

Add 3 fields to `EnvSchema`:

```ts
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  OPENROUTER_API_KEY: z.string().min(1),
  OPENROUTER_BASE_URL: z.string().url().default("https://openrouter.ai/api/v1"),
  DEFAULT_MODEL: z.string().default("openai/gpt-5-mini"),
  API_BEARER_TOKEN: z.string().min(1),
  DATAFORSEO_LOGIN: z.string().min(1),
  DATAFORSEO_PASSWORD: z.string().min(1),
  MAX_COST_PER_RUN_USD: z.string().default("5"),
});

export type Env = z.infer<typeof EnvSchema>;
// ... rest unchanged
```

- [ ] **Step 2: Update `apps/api/.env.example`**

Append to existing file:

```
# DataForSEO API (https://app.dataforseo.com/api-access)
DATAFORSEO_LOGIN=your-login@example.com
DATAFORSEO_PASSWORD=your-api-password

# Cost guardrail (USD per single run; sum of llm_calls + tool_calls)
MAX_COST_PER_RUN_USD=5
```

- [ ] **Step 3: Update root `.env.example`**

Same append to `.env.example` at repo root.

- [ ] **Step 4: Set values in local `.env`**

Manually edit `.env.local` (gitignored) with real DataForSEO credentials. Do NOT commit them.

- [ ] **Step 5: Run typecheck**

```bash
pnpm --filter @sensai/api typecheck
```

Expected: PASS (env.ts compiles).

- [ ] **Step 6: Run API to verify env loads**

```bash
pnpm --filter @sensai/api start:dev
```

Expected: API starts on PORT, no "Invalid environment" error. Stop with Ctrl+C.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/config/env.ts apps/api/.env.example .env.example
git commit -m "feat(api): add DATAFORSEO_LOGIN/PASSWORD and MAX_COST_PER_RUN_USD env vars"
```

---

## Task 2: Vitest setup + npm scripts

**Files:**
- Create: `apps/api/vitest.config.ts`
- Modify: `apps/api/package.json`
- Modify: `package.json` (root, turbo)
- Modify: `turbo.json` (if exists)

- [ ] **Step 1: Install Vitest + p-retry**

```bash
pnpm --filter @sensai/api add -D vitest @vitest/coverage-v8
pnpm --filter @sensai/api add p-retry
```

Expected: lockfile updated.

- [ ] **Step 2: Create `apps/api/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/tests/**/*.test.ts"],
    globals: false,
  },
  resolve: {
    alias: {
      "@sensai/shared": resolve(__dirname, "../../packages/shared/dist/index.js"),
    },
  },
});
```

- [ ] **Step 3: Add `test` script to `apps/api/package.json`**

In the `scripts` block, add `"test": "vitest run"` and `"test:watch": "vitest"`.

- [ ] **Step 4: Add `test` to root `turbo.json` (if exists)**

If `turbo.json` exists at root, add:

```json
"test": {
  "dependsOn": ["^build"],
  "outputs": []
}
```

If no `turbo.json`, skip and add `"test": "pnpm -r --if-present test"` script to root `package.json`.

- [ ] **Step 5: Smoke-create a dummy test**

Create `apps/api/src/tests/_smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("vitest smoke", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Run vitest**

```bash
pnpm --filter @sensai/api test
```

Expected: 1 test PASS.

- [ ] **Step 7: Delete smoke test**

```bash
rm apps/api/src/tests/_smoke.test.ts
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/package.json apps/api/vitest.config.ts package.json pnpm-lock.yaml
# include turbo.json if modified
git commit -m "chore(api): add Vitest setup and p-retry dep"
```

---

## Task 3: stableStringify util + test (TDD)

**Files:**
- Create: `apps/api/src/tests/stable-stringify.test.ts`
- Create: `apps/api/src/tools/stable-stringify.ts`

- [ ] **Step 1: Write failing test**

Create `apps/api/src/tests/stable-stringify.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { stableStringify } from "../tools/stable-stringify";

describe("stableStringify", () => {
  it("orders object keys alphabetically", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(stableStringify({ z: 1, a: 1 })).toBe('{"a":1,"z":1}');
  });

  it("produces equal output for equivalent objects with different key order", () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
  });

  it("recurses into nested objects", () => {
    const a = stableStringify({ outer: { b: 2, a: 1 } });
    const b = stableStringify({ outer: { a: 1, b: 2 } });
    expect(a).toBe(b);
    expect(a).toBe('{"outer":{"a":1,"b":2}}');
  });

  it("preserves array order", () => {
    expect(stableStringify([3, 1, 2])).toBe("[3,1,2]");
  });

  it("handles primitives", () => {
    expect(stableStringify("hello")).toBe('"hello"');
    expect(stableStringify(42)).toBe("42");
    expect(stableStringify(null)).toBe("null");
    expect(stableStringify(true)).toBe("true");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @sensai/api test stable-stringify
```

Expected: FAIL with "Cannot find module '../tools/stable-stringify'".

- [ ] **Step 3: Implement `stableStringify`**

Create `apps/api/src/tools/stable-stringify.ts`:

```ts
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const pairs = keys.map((k) => JSON.stringify(k) + ":" + stableStringify((value as Record<string, unknown>)[k]));
  return "{" + pairs.join(",") + "}";
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @sensai/api test stable-stringify
```

Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/tools/stable-stringify.ts apps/api/src/tests/stable-stringify.test.ts
git commit -m "feat(api): add stableStringify util for cache key hashing"
```

---

## Task 4: ToolCallRecorder service

**Files:**
- Create: `apps/api/src/tools/tool-call-recorder.service.ts`

No standalone test — covered by `ToolCacheService` tests via mock.

- [ ] **Step 1: Implement `ToolCallRecorder`**

Create `apps/api/src/tools/tool-call-recorder.service.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { DB_TOKEN } from "../db/db.module";
import type { Db } from "../db/client";
import { toolCalls } from "../db/schema";

export interface ToolCallRecord {
  runId: string;
  stepId: string;
  tool: string;
  method: string;
  paramsHash: string;
  fromCache: boolean;
  costUsd: string;
  latencyMs: number;
}

@Injectable()
export class ToolCallRecorder {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async record(call: ToolCallRecord): Promise<void> {
    await this.db.insert(toolCalls).values(call);
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @sensai/api typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/tools/tool-call-recorder.service.ts
git commit -m "feat(api): add ToolCallRecorder for tool_calls inserts"
```

---

## Task 5: ToolCacheService + 4 unit tests (TDD)

**Files:**
- Create: `apps/api/src/tests/tool-cache.service.test.ts`
- Create: `apps/api/src/tools/tool-cache.service.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/api/src/tests/tool-cache.service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ToolCacheService } from "../tools/tool-cache.service";
import type { ToolCallRecorder } from "../tools/tool-call-recorder.service";

function buildDb(opts: { hit?: { result: unknown; expiresAt: Date } | null } = {}) {
  const insert = vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    }),
  });
  const select = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(opts.hit ? [opts.hit] : []),
    }),
  });
  return { db: { select, insert } as any, insert, select };
}

function buildRecorder() {
  return { record: vi.fn().mockResolvedValue(undefined) } as unknown as ToolCallRecorder & { record: ReturnType<typeof vi.fn> };
}

const baseOpts = {
  tool: "dataforseo",
  method: "serp.organic.live",
  params: { keyword: "test", locationCode: 2616, languageCode: "pl", depth: 10 },
  ttlSeconds: 7 * 86400,
  runId: "11111111-1111-1111-1111-111111111111",
  stepId: "22222222-2222-2222-2222-222222222222",
};

describe("ToolCacheService", () => {
  let recorder: ReturnType<typeof buildRecorder>;

  beforeEach(() => {
    recorder = buildRecorder();
  });

  it("HIT: skips fetcher and records fromCache=true with cost=0", async () => {
    const future = new Date(Date.now() + 60_000);
    const { db } = buildDb({ hit: { result: { items: [{ title: "cached" }] }, expiresAt: future } });
    const svc = new ToolCacheService(db, recorder as any);

    const fetcher = vi.fn();
    const out = await svc.getOrSet({ ...baseOpts, fetcher });

    expect(out).toEqual({ items: [{ title: "cached" }] });
    expect(fetcher).not.toHaveBeenCalled();
    expect(recorder.record).toHaveBeenCalledWith(expect.objectContaining({
      fromCache: true,
      costUsd: "0",
      latencyMs: 0,
      tool: "dataforseo",
      method: "serp.organic.live",
    }));
  });

  it("MISS: invokes fetcher, inserts to cache with expiresAt = now + ttl, records fromCache=false", async () => {
    const { db, insert } = buildDb({ hit: null });
    const svc = new ToolCacheService(db, recorder as any);

    const before = Date.now();
    const fetcher = vi.fn().mockResolvedValue({
      result: { items: [{ title: "fresh" }] }, costUsd: "0.0006", latencyMs: 234,
    });
    const out = await svc.getOrSet({ ...baseOpts, fetcher });
    const after = Date.now();

    expect(out).toEqual({ items: [{ title: "fresh" }] });
    expect(fetcher).toHaveBeenCalledTimes(1);

    const insertCall = insert.mock.results[0].value.values.mock.calls[0][0];
    const ttlMs = baseOpts.ttlSeconds * 1000;
    expect(insertCall.expiresAt.getTime()).toBeGreaterThanOrEqual(before + ttlMs - 100);
    expect(insertCall.expiresAt.getTime()).toBeLessThanOrEqual(after + ttlMs + 100);

    expect(recorder.record).toHaveBeenCalledWith(expect.objectContaining({
      fromCache: false, costUsd: "0.0006", latencyMs: 234,
    }));
  });

  it("paramsHash is deterministic regardless of key order", async () => {
    const { db: db1, insert: insert1 } = buildDb({ hit: null });
    const { db: db2, insert: insert2 } = buildDb({ hit: null });

    const svc1 = new ToolCacheService(db1, recorder as any);
    const svc2 = new ToolCacheService(db2, buildRecorder() as any);

    const fetcher = vi.fn().mockResolvedValue({ result: {}, costUsd: "0", latencyMs: 0 });

    await svc1.getOrSet({ ...baseOpts, params: { a: 1, b: 2 }, fetcher });
    await svc2.getOrSet({ ...baseOpts, params: { b: 2, a: 1 }, fetcher });

    const hash1 = insert1.mock.results[0].value.values.mock.calls[0][0].paramsHash;
    const hash2 = insert2.mock.results[0].value.values.mock.calls[0][0].paramsHash;
    expect(hash1).toBe(hash2);
  });

  it("expired entry is treated as MISS (where clause filters expiresAt > now)", async () => {
    const { db, select } = buildDb({ hit: null });
    const svc = new ToolCacheService(db, recorder as any);

    const fetcher = vi.fn().mockResolvedValue({ result: { items: [] }, costUsd: "0", latencyMs: 0 });
    await svc.getOrSet({ ...baseOpts, fetcher });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @sensai/api test tool-cache.service
```

Expected: FAIL with "Cannot find module '../tools/tool-cache.service'".

- [ ] **Step 3: Implement `ToolCacheService`**

Create `apps/api/src/tools/tool-cache.service.ts`:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { DB_TOKEN } from "../db/db.module";
import type { Db } from "../db/client";
import { toolCache } from "../db/schema";
import { stableStringify } from "./stable-stringify";
import { ToolCallRecorder } from "./tool-call-recorder.service";

export interface GetOrSetOpts<T> {
  tool: string;
  method: string;
  params: unknown;
  ttlSeconds: number;
  runId: string;
  stepId: string;
  fetcher: () => Promise<{ result: T; costUsd: string; latencyMs: number }>;
}

@Injectable()
export class ToolCacheService {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly recorder: ToolCallRecorder,
  ) {}

  async getOrSet<T>(opts: GetOrSetOpts<T>): Promise<T> {
    const paramsHash = createHash("sha256").update(stableStringify(opts.params)).digest("hex");
    const now = new Date();

    const rows = await this.db.select().from(toolCache).where(
      and(
        eq(toolCache.tool, opts.tool),
        eq(toolCache.method, opts.method),
        eq(toolCache.paramsHash, paramsHash),
        gt(toolCache.expiresAt, now),
      ),
    );
    const hit = rows[0];

    if (hit) {
      await this.recorder.record({
        runId: opts.runId, stepId: opts.stepId,
        tool: opts.tool, method: opts.method, paramsHash,
        fromCache: true, costUsd: "0", latencyMs: 0,
      });
      return hit.result as T;
    }

    const fresh = await opts.fetcher();
    const expiresAt = new Date(now.getTime() + opts.ttlSeconds * 1000);

    await this.db.insert(toolCache).values({
      tool: opts.tool,
      method: opts.method,
      paramsHash,
      result: fresh.result as any,
      expiresAt,
    }).onConflictDoUpdate({
      target: [toolCache.tool, toolCache.method, toolCache.paramsHash],
      set: { result: fresh.result as any, createdAt: now, expiresAt },
    });

    await this.recorder.record({
      runId: opts.runId, stepId: opts.stepId,
      tool: opts.tool, method: opts.method, paramsHash,
      fromCache: false, costUsd: fresh.costUsd, latencyMs: fresh.latencyMs,
    });

    return fresh.result;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @sensai/api test tool-cache.service
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/tools/tool-cache.service.ts apps/api/src/tests/tool-cache.service.test.ts
git commit -m "feat(api): add ToolCacheService with read-through cache and unit tests"
```

---

## Task 6: SerpFetchParams + SerpItem + SerpResult zod schemas

**Files:**
- Create: `apps/api/src/tools/dataforseo/serp.types.ts`

- [ ] **Step 1: Implement zod schemas**

Create `apps/api/src/tools/dataforseo/serp.types.ts`:

```ts
import { z } from "zod";

export const SerpFetchParams = z.object({
  keyword: z.string().min(1),
  locationCode: z.number().int().positive(),
  languageCode: z.string().min(2),
  depth: z.number().int().positive().max(100),
});
export type SerpFetchParams = z.infer<typeof SerpFetchParams>;

export const SerpItem = z.object({
  title: z.string(),
  url: z.string().url(),
  description: z.string(),
  position: z.number().int().nonnegative(),
});
export type SerpItem = z.infer<typeof SerpItem>;

export const SerpResult = z.object({
  items: SerpItem.array(),
});
export type SerpResult = z.infer<typeof SerpResult>;
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @sensai/api typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/tools/dataforseo/serp.types.ts
git commit -m "feat(api): add SerpFetchParams/SerpItem/SerpResult zod schemas"
```

---

## Task 7: DataForSeoClient errors + client + 4 unit tests (TDD)

**Files:**
- Create: `apps/api/src/tools/dataforseo/dataforseo.errors.ts`
- Create: `apps/api/src/tests/dataforseo.client.test.ts`
- Create: `apps/api/src/tools/dataforseo/dataforseo.client.ts`

- [ ] **Step 1: Implement error classes**

Create `apps/api/src/tools/dataforseo/dataforseo.errors.ts`:

```ts
export class HttpError extends Error {
  constructor(public readonly status: number, public readonly body: string) {
    super(`HTTP ${status}: ${body.slice(0, 200)}`);
    this.name = "HttpError";
  }
}

export class DataForSeoApiError extends Error {
  constructor(public readonly statusCode: number, public readonly statusMessage: string) {
    super(`DataForSEO ${statusCode}: ${statusMessage}`);
    this.name = "DataForSeoApiError";
  }
}
```

- [ ] **Step 2: Write failing tests**

Create `apps/api/src/tests/dataforseo.client.test.ts`:

```ts
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
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
pnpm --filter @sensai/api test dataforseo.client
```

Expected: FAIL with "Cannot find module '../tools/dataforseo/dataforseo.client'".

- [ ] **Step 4: Implement `DataForSeoClient`**

Create `apps/api/src/tools/dataforseo/dataforseo.client.ts`:

```ts
import { Injectable } from "@nestjs/common";
import pRetry, { AbortError } from "p-retry";
import type { Env } from "../../config/env";
import type { SerpFetchParams } from "./serp.types";
import { HttpError, DataForSeoApiError } from "./dataforseo.errors";

export interface SerpRawItem {
  type: string;
  title?: string;
  url?: string;
  description?: string;
  rank_absolute?: number;
  [k: string]: unknown;
}

export interface SerpRawTask {
  cost?: number;
  status_code?: number;
  result?: Array<{ items: SerpRawItem[] }>;
}

export interface SerpRawResponse {
  status_code: number;
  status_message?: string;
  tasks: SerpRawTask[];
}

@Injectable()
export class DataForSeoClient {
  private static readonly BASE = "https://api.dataforseo.com/v3";
  private readonly authHeader: string;

  constructor(env: Pick<Env, "DATAFORSEO_LOGIN" | "DATAFORSEO_PASSWORD">) {
    const token = Buffer.from(`${env.DATAFORSEO_LOGIN}:${env.DATAFORSEO_PASSWORD}`).toString("base64");
    this.authHeader = `Basic ${token}`;
  }

  async serpOrganicLive(params: SerpFetchParams): Promise<SerpRawResponse> {
    const body = [{
      keyword: params.keyword,
      location_code: params.locationCode,
      language_code: params.languageCode,
      depth: params.depth,
    }];

    return pRetry(
      () => this.post("/serp/google/organic/live/regular", body),
      { retries: 2, factor: 2, minTimeout: 500 },
    );
  }

  private async post(path: string, body: unknown): Promise<SerpRawResponse> {
    const res = await fetch(DataForSeoClient.BASE + path, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      const err = new HttpError(res.status, text);
      // 4xx non-429 → don't retry
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        throw new AbortError(err);
      }
      throw err;
    }

    const json = (await res.json()) as SerpRawResponse;
    if (json.status_code !== 20000) {
      // API-level error → don't retry
      throw new AbortError(new DataForSeoApiError(json.status_code, json.status_message ?? ""));
    }
    return json;
  }
}
```

Note: `pRetry` with `retries: 2` = 1 initial + 2 retries = 3 attempts total. `AbortError` short-circuits retry loop.

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm --filter @sensai/api test dataforseo.client
```

Expected: 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/tools/dataforseo/dataforseo.errors.ts apps/api/src/tools/dataforseo/dataforseo.client.ts apps/api/src/tests/dataforseo.client.test.ts
git commit -m "feat(api): add DataForSeoClient with retry, basic auth, and unit tests"
```

---

## Task 8: tools.module.ts + dataforseo.module.ts + wire into app.module.ts

**Files:**
- Create: `apps/api/src/tools/dataforseo/dataforseo.module.ts`
- Create: `apps/api/src/tools/tools.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Create `DataForSeoModule`**

Create `apps/api/src/tools/dataforseo/dataforseo.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { DataForSeoClient } from "./dataforseo.client";
import { loadEnv } from "../../config/env";

@Module({
  providers: [
    {
      provide: DataForSeoClient,
      useFactory: () => new DataForSeoClient(loadEnv()),
    },
  ],
  exports: [DataForSeoClient],
})
export class DataForSeoModule {}
```

- [ ] **Step 2: Create `ToolsModule`**

Create `apps/api/src/tools/tools.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { DbModule } from "../db/db.module";
import { ToolCallRecorder } from "./tool-call-recorder.service";
import { ToolCacheService } from "./tool-cache.service";
import { DataForSeoModule } from "./dataforseo/dataforseo.module";

@Module({
  imports: [DbModule, DataForSeoModule],
  providers: [ToolCallRecorder, ToolCacheService],
  exports: [ToolCacheService, DataForSeoModule],
})
export class ToolsModule {}
```

- [ ] **Step 3: Import `ToolsModule` in `app.module.ts`**

Modify `apps/api/src/app.module.ts` — add import and add to `imports` array:

```ts
import { ToolsModule } from "./tools/tools.module";
// ...
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({ /* unchanged */ }),
    DbModule,
    ProjectsModule,
    TemplatesModule,
    LlmModule,
    ToolsModule,
    OrchestratorModule,
    RunsModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 4: Typecheck + start API**

```bash
pnpm --filter @sensai/api typecheck
pnpm --filter @sensai/api start:dev
```

Expected: typecheck PASS, API starts without DI errors. Stop with Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/tools/tools.module.ts apps/api/src/tools/dataforseo/dataforseo.module.ts apps/api/src/app.module.ts
git commit -m "feat(api): wire ToolsModule + DataForSeoModule into AppModule"
```

---

## Task 9: SerpFetchHandler + register in HandlersModule

**Files:**
- Create: `apps/api/src/handlers/serp-fetch.handler.ts`
- Modify: `apps/api/src/handlers/handlers.module.ts`

- [ ] **Step 1: Implement `SerpFetchHandler`**

Create `apps/api/src/handlers/serp-fetch.handler.ts`:

```ts
import { Injectable } from "@nestjs/common";
import type { StepContext, StepHandler, StepResult } from "../orchestrator/step-handler";
import type { RunInput } from "@sensai/shared";
import { DataForSeoClient } from "../tools/dataforseo/dataforseo.client";
import { ToolCacheService } from "../tools/tool-cache.service";
import { SerpFetchParams, type SerpItem, type SerpResult } from "../tools/dataforseo/serp.types";

@Injectable()
export class SerpFetchHandler implements StepHandler {
  readonly type = "tool.serp.fetch";

  constructor(
    private readonly client: DataForSeoClient,
    private readonly cache: ToolCacheService,
  ) {}

  async execute(ctx: StepContext): Promise<StepResult> {
    const input = ctx.run.input as RunInput;
    if (!input.mainKeyword || input.mainKeyword.trim().length === 0) {
      throw new Error("mainKeyword is required for tool.serp.fetch");
    }

    const params = SerpFetchParams.parse({
      keyword: input.mainKeyword.trim(),
      locationCode: 2616, // Poland
      languageCode: "pl",
      depth: 10,
    });

    const result = await this.cache.getOrSet<SerpResult>({
      tool: "dataforseo",
      method: "serp.organic.live",
      params,
      ttlSeconds: 7 * 86400,
      runId: ctx.run.id,
      stepId: ctx.step.id,
      fetcher: async () => {
        const t0 = Date.now();
        const raw = await this.client.serpOrganicLive(params);
        const cost = raw.tasks?.[0]?.cost?.toString() ?? "0";
        const items: SerpItem[] = (raw.tasks?.[0]?.result?.[0]?.items ?? [])
          .filter((it) => it.type === "organic" && it.title && it.url)
          .slice(0, params.depth)
          .map((it) => ({
            title: String(it.title),
            url: String(it.url),
            description: String(it.description ?? ""),
            position: Number(it.rank_absolute ?? 0),
          }));
        return { result: { items }, costUsd: cost, latencyMs: Date.now() - t0 };
      },
    });

    return { output: result };
  }
}
```

- [ ] **Step 2: Register in `HandlersModule`**

Modify `apps/api/src/handlers/handlers.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { BriefHandler } from "./brief.handler";
import { SerpFetchHandler } from "./serp-fetch.handler";
import { ToolsModule } from "../tools/tools.module";
import { STEP_HANDLERS, type StepHandler } from "../orchestrator/step-handler";

@Module({
  imports: [ToolsModule],
  providers: [
    BriefHandler,
    SerpFetchHandler,
    {
      provide: STEP_HANDLERS,
      useFactory: (brief: BriefHandler, serp: SerpFetchHandler): StepHandler[] => [brief, serp],
      inject: [BriefHandler, SerpFetchHandler],
    },
  ],
  exports: [STEP_HANDLERS],
})
export class HandlersModule {}
```

- [ ] **Step 3: Typecheck + start API**

```bash
pnpm --filter @sensai/api typecheck
pnpm --filter @sensai/api start:dev
```

Expected: typecheck PASS, API starts. Stop with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/handlers/serp-fetch.handler.ts apps/api/src/handlers/handlers.module.ts
git commit -m "feat(api): add SerpFetchHandler (type=tool.serp.fetch) and register in HandlersModule"
```

---

## Task 10: BriefHandler reads previousOutputs.research + brief.prompt accepts serpContext

**Files:**
- Modify: `apps/api/src/prompts/brief.prompt.ts`
- Modify: `apps/api/src/handlers/brief.handler.ts`

- [ ] **Step 1: Update `brief.prompt.ts` to accept serpContext**

Modify `apps/api/src/prompts/brief.prompt.ts`:

```ts
import { z } from "zod";
import type { ProjectRow } from "../orchestrator/step-handler";
import type { ProjectConfig, RunInput } from "@sensai/shared";
import type { SerpItem } from "../tools/dataforseo/serp.types";

export const BriefOutputSchema = z.object({
  headline: z.string(),
  angle: z.string().describe("Unikalny kąt ujęcia tematu"),
  pillars: z.array(z.string()).min(3).max(6).describe("Główne filary treści (3-6 punktów)"),
  audiencePainPoints: z.array(z.string()).min(2).max(5),
  successCriteria: z.string().describe("Jak wyglądałby idealny artykuł?"),
});
export type BriefOutput = z.infer<typeof BriefOutputSchema>;

function formatSerpContext(items: SerpItem[]): string {
  const lines = items.map((it, idx) =>
    `${idx + 1}. ${it.title}\n   ${it.url}\n   ${it.description}`,
  );
  return [
    "Konkurencja na to słowo kluczowe (top 10 wyników Google):",
    ...lines,
    "",
    "Przygotowując brief, weź pod uwagę jakie kąty są już mocno pokryte i zaproponuj angle który się wyróżnia.",
  ].join("\n");
}

export const briefPrompt = {
  system(project: ProjectRow) {
    const cfg = project.config as ProjectConfig;
    return [
      `Jesteś starszym redaktorem i strategiem contentu marki "${project.name}".`,
      cfg.toneOfVoice && `Tone of voice: ${cfg.toneOfVoice}`,
      cfg.targetAudience && `Grupa docelowa: ${cfg.targetAudience}`,
      cfg.guidelines && `Wytyczne brandowe: ${cfg.guidelines}`,
      `Twoim zadaniem jest przygotowanie krótkiego briefu artykułu na podstawie tematu od użytkownika.`,
      `Zwróć odpowiedź wyłącznie jako obiekt JSON zgodny ze schematem.`,
    ].filter(Boolean).join("\n\n");
  },
  user(input: RunInput, serpContext?: SerpItem[]) {
    const lines = [
      `Temat artykułu: ${input.topic}`,
      input.mainKeyword && `Główne słowo kluczowe: ${input.mainKeyword}`,
      input.intent && `Intent użytkownika: ${input.intent}`,
      input.contentType && `Typ treści: ${input.contentType}`,
    ].filter(Boolean);
    if (serpContext && serpContext.length > 0) {
      lines.push("", formatSerpContext(serpContext));
    }
    lines.push("", "Przygotuj brief.");
    return lines.join("\n");
  },
  schema: BriefOutputSchema,
};
```

- [ ] **Step 2: Update `brief.handler.ts` to consume previousOutputs.research**

Modify `apps/api/src/handlers/brief.handler.ts`:

```ts
import { Injectable } from "@nestjs/common";
import { LlmClient } from "../llm/llm.client";
import { briefPrompt } from "../prompts/brief.prompt";
import type { StepContext, StepHandler, StepResult } from "../orchestrator/step-handler";
import type { ProjectConfig, RunInput } from "@sensai/shared";
import { SerpResult } from "../tools/dataforseo/serp.types";

@Injectable()
export class BriefHandler implements StepHandler {
  readonly type = "llm.brief";

  constructor(private readonly llm: LlmClient) {}

  async execute(ctx: StepContext): Promise<StepResult> {
    const cfg = ctx.project.config as ProjectConfig;
    const input = ctx.run.input as RunInput;
    const model = cfg.defaultModels?.brief;

    const research = SerpResult.safeParse(ctx.previousOutputs.research);
    const serpContext = research.success ? research.data.items : undefined;

    const res = await this.llm.generateObject({
      ctx: {
        runId: ctx.run.id,
        stepId: ctx.step.id,
        attempt: ctx.attempt,
        model,
      },
      system: briefPrompt.system(ctx.project),
      prompt: briefPrompt.user(input, serpContext),
      schema: briefPrompt.schema,
    });
    return { output: res.object };
  }
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @sensai/api typecheck
```

Expected: PASS.

- [ ] **Step 4: Run all tests**

```bash
pnpm --filter @sensai/api test
```

Expected: 13 tests PASS (5 stable-stringify + 4 cache + 4 client).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/prompts/brief.prompt.ts apps/api/src/handlers/brief.handler.ts
git commit -m "feat(api): brief prompt + handler consume optional SERP research context"
```

---

## Task 11: CostLimitExceededError + cost cap in pipeline.worker.ts

**Files:**
- Create: `apps/api/src/orchestrator/cost-limit-exceeded.error.ts`
- Modify: `apps/api/src/orchestrator/pipeline.worker.ts`

- [ ] **Step 1: Implement `CostLimitExceededError`**

Create `apps/api/src/orchestrator/cost-limit-exceeded.error.ts`:

```ts
export class CostLimitExceededError extends Error {
  readonly code = "cost_limit_exceeded";
  constructor(public readonly runId: string, public readonly capUsd: number, public readonly currentUsd: number) {
    super(`Run ${runId} exceeded cost cap $${capUsd.toFixed(4)} (current: $${currentUsd.toFixed(4)})`);
    this.name = "CostLimitExceededError";
  }
}
```

- [ ] **Step 2: Modify `pipeline.worker.ts` to check cap before handler**

In `apps/api/src/orchestrator/pipeline.worker.ts`, add imports at top:

```ts
import { sql } from "drizzle-orm";
import { UnrecoverableError } from "bullmq";
import { CostLimitExceededError } from "./cost-limit-exceeded.error";
```

Add a helper method inside the class:

```ts
private async checkCostCap(runId: string): Promise<void> {
  const env = loadEnv();
  const cap = parseFloat(env.MAX_COST_PER_RUN_USD);
  const result = await this.db.execute(sql`
    SELECT COALESCE(SUM(cost_usd::numeric), 0)::float8 AS sum_cost
    FROM (
      SELECT cost_usd FROM llm_calls WHERE run_id = ${runId}::uuid
      UNION ALL
      SELECT cost_usd FROM tool_calls WHERE run_id = ${runId}::uuid
    ) t
  `);
  const row = (result as { rows: { sum_cost: number }[] }).rows[0];
  const sumCost = Number(row?.sum_cost ?? 0);
  if (sumCost >= cap) {
    throw new CostLimitExceededError(runId, cap, sumCost);
  }
}
```

In `process()` between "Load previous outputs" and `const handler = ...`, add:

```ts
await this.checkCostCap(runId);
```

In the existing `catch (err: any)` block, before `throw err;`, add cost-limit handling:

```ts
if (err instanceof CostLimitExceededError) {
  // Make BullMQ stop retrying immediately
  throw new UnrecoverableError(err.message);
}
```

The serialized error already captures `message`/`name`/`stack`, so `step.error` will reflect the cost limit. The `failed` status is already set by the existing `isFinal` branch — but with `UnrecoverableError` BullMQ treats `attemptsMade >= attempts`, so `isFinal=true` after first throw. That marks the run failed.

Final shape of `process()` (relevant section):

```ts
// Load previous outputs (existing)
const priorSteps = await this.db.select().from(pipelineSteps).where(eq(pipelineSteps.runId, runId));
const previousOutputs: Record<string, unknown> = {};
for (const s of priorSteps) {
  if (s.stepOrder < step.stepOrder && s.output) {
    previousOutputs[s.stepKey] = s.output;
  }
}

// NEW: cost cap check
await this.checkCostCap(runId);

const handler = this.registry.resolve(step.type);

try {
  const result = await handler.execute({ /* ... */ });
  // ... existing success path
} catch (err: any) {
  const serialized = { /* ... existing ... */ };
  // ... existing isFinal/update logic
  if (err instanceof CostLimitExceededError) {
    throw new UnrecoverableError(err.message);
  }
  throw err;
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @sensai/api typecheck
```

Expected: PASS.

- [ ] **Step 4: Manual smoke test for cost cap**

In `.env.local` set `MAX_COST_PER_RUN_USD=0.0001` temporarily.

```bash
docker compose -f docker-compose.dev.yml up -d
pnpm --filter @sensai/api start:dev
```

In another terminal, start a run via UI (`pnpm --filter @sensai/web dev`, click "Nowy run").

After 1st handler completes (LLM call writes cost > 0.0001 to llm_calls), check DB:

```bash
psql $DATABASE_URL -c "SELECT id, status, error->>'message' AS err FROM pipeline_runs ORDER BY created_at DESC LIMIT 1;"
```

Expected: latest run `status=failed`, error message contains "exceeded cost cap".

Restore `MAX_COST_PER_RUN_USD=5` in `.env.local` after test. Stop API and dev DB if you wish.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/orchestrator/cost-limit-exceeded.error.ts apps/api/src/orchestrator/pipeline.worker.ts
git commit -m "feat(api): enforce MAX_COST_PER_RUN_USD via UnrecoverableError in worker"
```

---

## Task 12: Seed template "Brief + research" v1

**Files:**
- Modify: `apps/api/src/seed/seed.ts`

- [ ] **Step 1: Add second template upsert**

Modify `apps/api/src/seed/seed.ts`. Replace the template insert block with a function that upserts both templates and returns IDs by querying after insert (handles `onConflictDoNothing` returning empty):

```ts
import "dotenv/config";
import { eq, and } from "drizzle-orm";
import { createDb } from "../db/client";
import { projects, pipelineTemplates } from "../db/schema";
import type { ProjectConfig, TemplateStepsDef } from "@sensai/shared";

async function upsertTemplate(db: ReturnType<typeof createDb>["db"], name: string, version: number, stepsDef: TemplateStepsDef) {
  await db
    .insert(pipelineTemplates)
    .values({ name, version, stepsDef })
    .onConflictDoNothing({ target: [pipelineTemplates.name, pipelineTemplates.version] });
  const [row] = await db
    .select()
    .from(pipelineTemplates)
    .where(and(eq(pipelineTemplates.name, name), eq(pipelineTemplates.version, version)));
  return row;
}

async function main() {
  const { db, pool } = createDb(process.env.DATABASE_URL!);

  const config: ProjectConfig = {
    toneOfVoice: "profesjonalny, konkretny, bez żargonu",
    targetAudience: "małe i średnie polskie firmy prowadzące działalność online",
    guidelines: "Cytuj konkretne liczby tylko gdy masz pewność. Unikaj clickbaitowych nagłówków.",
    defaultModels: { brief: "openai/gpt-5-mini" },
    promptOverrides: {},
  };

  await db
    .insert(projects)
    .values({ slug: "demo", name: "Demo Project", config })
    .onConflictDoNothing({ target: projects.slug });
  const [project] = await db.select().from(projects).where(eq(projects.slug, "demo"));

  const briefOnly = await upsertTemplate(db, "Brief only (MVP)", 1, {
    steps: [{ key: "brief", type: "llm.brief", auto: true }],
  });

  const briefResearch = await upsertTemplate(db, "Brief + research", 1, {
    steps: [
      { key: "research", type: "tool.serp.fetch", auto: true },
      { key: "brief", type: "llm.brief", auto: true },
    ],
  });

  console.log("Seeded:");
  console.log(`  projectId: ${project.id}`);
  console.log(`  templates:`);
  console.log(`    "${briefOnly.name}" v${briefOnly.version}: ${briefOnly.id}`);
  console.log(`    "${briefResearch.name}" v${briefResearch.version}: ${briefResearch.id}`);

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Run seed**

```bash
pnpm --filter @sensai/api db:seed
```

Expected: console prints both `templateId`s, including new `Brief + research v1`.

- [ ] **Step 3: Verify in DB**

```bash
psql $DATABASE_URL -c "SELECT id, name, version, steps_def FROM pipeline_templates ORDER BY name;"
```

Expected: 2 rows, second one has `steps_def` with `research` + `brief` steps.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/seed/seed.ts
git commit -m "feat(api): seed second template 'Brief + research' v1"
```

---

## Task 13: Frontend — make mainKeyword required

**Files:**
- Modify: `apps/web/src/app/runs/new/page.tsx`

- [ ] **Step 1: Make `mainKeyword` required + change submit guard**

In `apps/web/src/app/runs/new/page.tsx`, change the `mainKeyword` field block and the submit button `disabled` prop:

Replace this section:

```tsx
<div className="space-y-1">
  <label className="text-sm font-medium">Główne słowo kluczowe (opcjonalnie)</label>
  <input
    value={mainKeyword}
    onChange={(e) => setMainKeyword(e.target.value)}
    className="w-full rounded border px-3 py-2"
  />
</div>
```

With:

```tsx
<div className="space-y-1">
  <label className="text-sm font-medium">Główne słowo kluczowe</label>
  <input
    required
    minLength={2}
    value={mainKeyword}
    onChange={(e) => setMainKeyword(e.target.value)}
    placeholder="np. ai dla małych firm"
    className="w-full rounded border px-3 py-2"
  />
  <p className="text-xs text-muted-foreground">Wymagane dla szablonów z research SERP.</p>
</div>
```

And change the submit guard:

```tsx
<button
  type="submit"
  disabled={!projectId || !templateId || topic.length < 3 || mainKeyword.trim().length < 2 || start.isPending}
  className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
>
  {start.isPending ? "Startuję…" : "Start"}
</button>
```

Also change the request body so empty keyword isn't sent (we pass it always now):

```tsx
const run = await start.mutateAsync({
  projectId,
  templateId,
  input: {
    topic,
    mainKeyword: mainKeyword.trim(),
  },
});
```

- [ ] **Step 2: Typecheck web**

```bash
pnpm --filter @sensai/web typecheck
```

Expected: PASS.

- [ ] **Step 3: Visual check**

```bash
pnpm --filter @sensai/web dev
```

Open `http://localhost:7000/runs/new` — confirm field has `required` (browser blocks submit when empty), label changed, helper text visible. Stop with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/runs/new/page.tsx
git commit -m "feat(web): make mainKeyword required in new run form"
```

---

## Task 14: End-to-end smoke test (manual)

No file changes. Verifies the full pipeline.

- [ ] **Step 1: Start infra + apps**

```bash
docker compose -f docker-compose.dev.yml up -d
pnpm --filter @sensai/api start:dev
```

In another terminal:

```bash
pnpm --filter @sensai/web dev
```

- [ ] **Step 2: Verify env vars set**

Confirm `.env.local` has real `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`, and `MAX_COST_PER_RUN_USD=5` (NOT the test value `0.0001`).

- [ ] **Step 3: Create first run with new template**

Open `http://localhost:7000/runs/new`. Fill:
- Projekt: `Demo Project (demo)`
- Szablon: `Brief + research v1`
- Temat: `Jak małe firmy mogą wykorzystać AI`
- Główne słowo kluczowe: `ai dla małych firm`

Click Start. Watch the run page poll until `completed` (~20-30s).

- [ ] **Step 4: Verify DB state**

```bash
psql $DATABASE_URL <<'EOF'
SELECT id, status, current_step_order FROM pipeline_runs ORDER BY created_at DESC LIMIT 1 \gset
SELECT step_key, type, status FROM pipeline_steps WHERE run_id = :'id' ORDER BY step_order;
SELECT tool, method, from_cache, cost_usd FROM tool_calls WHERE run_id = :'id';
SELECT model, prompt_tokens, completion_tokens, cost_usd FROM llm_calls WHERE run_id = :'id';
SELECT tool, method, expires_at - created_at AS ttl FROM tool_cache WHERE tool = 'dataforseo' ORDER BY created_at DESC LIMIT 1;
EOF
```

Expected:
- `pipeline_runs`: latest `status=completed`, `current_step_order=1`.
- `pipeline_steps`: 2 rows — `research` (tool.serp.fetch, completed) and `brief` (llm.brief, completed).
- `tool_calls`: 1 row, `from_cache=false`, `cost_usd > 0` (typically `0.0006`).
- `llm_calls`: 1 row, `cost_usd > 0`.
- `tool_cache`: 1 row, `ttl ≈ 7 days`.

- [ ] **Step 5: Verify SERP context reached the brief**

Inspect the brief step output:

```bash
psql $DATABASE_URL -c "SELECT output->>'angle' AS angle FROM pipeline_steps WHERE step_key='brief' ORDER BY started_at DESC LIMIT 1;"
```

Expected: `angle` text references competition / unique positioning (LLM should have used SERP context). Read the full output in the UI to confirm it's not generic.

- [ ] **Step 6: Second run with same keyword → cache HIT**

Create another run, identical inputs. Watch for completion (~10-15s, faster).

```bash
psql $DATABASE_URL -c "SELECT from_cache, cost_usd FROM tool_calls ORDER BY created_at DESC LIMIT 2;"
```

Expected: latest 2 rows — first (newer) `from_cache=true, cost_usd=0`; older `from_cache=false`.

- [ ] **Step 7: Run all unit tests**

```bash
pnpm --filter @sensai/api test
```

Expected: 13 tests PASS.

- [ ] **Step 8: Stop dev services**

`Ctrl+C` on API and web. Optionally `docker compose -f docker-compose.dev.yml down`.

- [ ] **Step 9: Document smoke result + commit**

If any step diverged, fix the underlying code first (not the plan). When all green, write the smoke result to a verification doc — replace the `<...>` placeholders with actual measured values:

```bash
TODAY=$(date -u +%Y-%m-%d)
mkdir -p docs/superpowers/verifications
cat > docs/superpowers/verifications/${TODAY}-plan-02-verification.md <<EOF
# Plan 02 — Verification

Date: ${TODAY}

- ✅ Run with template "Brief + research" completes in <Xs> seconds
- ✅ tool_calls: 1 row, from_cache=false, cost_usd=\$<X.XXXX>
- ✅ llm_calls: 1 row, cost_usd=\$<X.XXXX>
- ✅ tool_cache: 1 row, expires_at = created_at + 7d
- ✅ Brief output references competition (uses SERP context)
- ✅ Second run with same keyword: from_cache=true, cost_usd=0
- ✅ Cost cap test (MAX_COST_PER_RUN_USD=0.0001) → run failed with cost_limit_exceeded
- ✅ pnpm test: 13 passing
EOF
git add docs/superpowers/verifications/
git commit -m "docs: verify Plan 02 end-to-end flow"
```

---

## Task 15: Update auto-memory

No code changes. Updates persistent memory so future sessions know Plan 02 is done.

- [ ] **Step 1: Mark Plan 02 complete**

Create new memory file at `~/.claude/projects/-Users-datezone-Projekty-sensai-content-generation/memory/project_plan_02_tools_dataforseo.md`. Replace `<TODAY>` with `date -u +%Y-%m-%d` and `<BRANCH>` with the actual branch name (likely `feat/plan-02-tools-dataforseo`):

```markdown
---
name: Plan 02 Tools DataForSEO — COMPLETED
description: Tools layer + DataForSEO SERP + new template "Brief + research" finished <TODAY>
type: project
---
**Status:** COMPLETE (<TODAY>). Branch `<BRANCH>`.

**What works end-to-end:** new template "Brief + research" → step 1 (tool.serp.fetch) hits DataForSEO `/serp/google/organic/live/regular` for top 10 PL results → cached in tool_cache (7d TTL) → step 2 (llm.brief) gets SERP titles+urls+descriptions in prompt and produces brief that references competition.

**Cost cap:** MAX_COST_PER_RUN_USD=5 enforced before each handler in pipeline.worker.ts. Throws CostLimitExceededError → UnrecoverableError → run.status=failed with step.error.code=cost_limit_exceeded.

**SERP config (hardcoded in SerpFetchHandler):** locationCode=2616 (Poland), languageCode="pl", depth=10, method="serp/google/organic/live/regular".

**Tests:** 13 unit tests in apps/api/src/tests/ (5 stable-stringify + 4 tool-cache + 4 dataforseo client). pnpm --filter @sensai/api test.

**How to apply in future sessions:**
- Plan 03 (scraping with crawl4ai + Firecrawl) copies the pattern: new module under tools/, ToolCacheService.getOrSet, ToolCallRecorder. Different TTL per method.
- Don't re-add ToolCallRecorder or ToolCacheService — they're generic.
- DataForSEO returns cost as number in tasks[0].cost; we string-coerce for tool_calls.cost_usd consistency.
```

Update `MEMORY.md` index — add line:

```
- [Plan 02 Tools DataForSEO](project_plan_02_tools_dataforseo.md) — COMPLETED, DataForSEO SERP + cost cap + Vitest setup
```

- [ ] **Step 2: Done**

No commit (memory is outside git).

---

## Recap

**14 substantive tasks + 1 memory task. Total ~13 commits.**

**Test count after plan:** 13 unit tests (5 stable-stringify + 4 tool-cache + 4 dataforseo client).

**New env vars:** `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`, `MAX_COST_PER_RUN_USD`.

**New step type:** `tool.serp.fetch` (SerpFetchHandler).

**New template:** "Brief + research" v1.

**New tables touched:** `tool_calls` (writes), `tool_cache` (reads + upserts). No DDL — tables exist from Plan 01.

**Files created (count):** 11 source files + 3 test files = 14.

**Files modified (count):** 8.

**Compatibility:** old template "Brief only (MVP)" v1 still works (BriefHandler has `if (research.success)` branch).
