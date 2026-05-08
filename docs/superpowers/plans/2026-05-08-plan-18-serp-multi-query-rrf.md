# Plan 18 — SERP Multi-Query Fetch + RRF Fusion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current single-query `tool.serp.fetch` with a multi-query fetch that calls DataForSEO once per `disambiguate.serpQueries[]` entry in parallel, deduplicates by canonical URL, and fuses the rankings using Reciprocal Rank Fusion (k=60) into a single top-15 list.

**Architecture:** The existing handler already has the right shape (caching, ToolCallRecorder, types). We extend it: (a) iterate `disambiguate.serpQueries[]` (1..4 queries) via `Promise.all`, (b) each call still goes through `ToolCacheService.getOrSet` per-query so reruns are free, (c) merge results in a pure RRF utility, (d) dedupe by canonical URL (lowercased host + pathname, ignoring `?utm_*` params), (e) cap at top 15. We extend `SerpResult` with optional debug fields (`fusedScore`, `sourceQueries`) plus a top-level `queries: string[]` so the UI can display provenance — these fields are additive so downstream consumers (`brief.handler.ts`, `resume-validation.ts`) keep working unchanged.

**Tech Stack:** TypeScript, NestJS, Drizzle ORM, Zod, Vitest, DataForSEO `serp/google/organic/live/advanced`, Next.js (web).

**Conventions referenced:**
- Handlers live in `apps/api/src/handlers/<name>.handler.ts`. Type prefix is `tool.<name>` (e.g. `tool.serp.fetch`).
- Pure utilities for tools live in `apps/api/src/tools/<name>/<utility>.ts` with a co-located `__tests__/<utility>.test.ts` OR centrally in `apps/api/src/tests/<name>.test.ts` (vitest). Plan 17 used the central `apps/api/src/tests/` location — follow that.
- Web step renderers live in `apps/web/src/components/step-output/<name>.tsx`.
- Smoke scripts live in `scripts/smoke-plan-XX.ts` and are exposed via `pnpm smoke:plan-XX`. For smoke that needs handler classes directly (bypassing NestJS DI), follow the `scripts/smoke-plan-07.ts` pattern (manual instantiation, stub cache).
- `packages/shared` does not need rebuilding for this plan (no schema changes there — `SerpResult` lives in `apps/api/src/tools/dataforseo/serp.types.ts`).
- Per-query cache key is unchanged (sha256 over `{keyword, locationCode, languageCode, depth}`). Each of the 1..4 calls gets its own cache row with 7-day TTL.

**Out of scope for this plan (documented as future work):**
- Weighted RRF (e.g. boost `serpQueries[0]`). Default to equal weights.
- Cross-encoder semantic rerank (Cohere/Voyage). May follow as Plan 19 if RRF top-15 quality is insufficient — to be measured after smoke.
- Domain-aware deduplication (collapsing multiple sub-pages from the same domain). Default to URL-level dedup only.
- Configurable `topN` parameter. Hardcoded constant `15` in the handler.

---

## Task 1: Add the RRF fusion utility

**Files:**
- Create: `apps/api/src/tools/dataforseo/rrf.ts`
- Test: `apps/api/src/tests/rrf.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/tests/rrf.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fuseRankings, RRF_K_DEFAULT } from "../tools/dataforseo/rrf";

describe("fuseRankings (Reciprocal Rank Fusion)", () => {
  it("uses k=60 as the default smoothing constant", () => {
    expect(RRF_K_DEFAULT).toBe(60);
  });

  it("ranks a document that appears in every query above one that only appears in one (top)", () => {
    // url2 is rank 2/1/2 across three queries — strong consensus
    // url9 is rank 1 in only one query
    const fused = fuseRankings([
      { query: "a", urls: ["url1", "url2", "url3", "url4", "url5"] },
      { query: "b", urls: ["url2", "url6", "url1", "url7", "url8"] },
      { query: "c", urls: ["url9", "url2", "url3", "url1", "url10"] },
    ]);
    expect(fused[0].url).toBe("url2");
    // url9 should be ranked lower than url1 (which appears in all three)
    const url9Idx = fused.findIndex((f) => f.url === "url9");
    const url1Idx = fused.findIndex((f) => f.url === "url1");
    expect(url1Idx).toBeLessThan(url9Idx);
  });

  it("returns score, sourceQueries, and originalRanks per fused item", () => {
    const fused = fuseRankings([
      { query: "alpha", urls: ["x", "y"] },
      { query: "beta", urls: ["y", "x"] },
    ]);
    const x = fused.find((f) => f.url === "x")!;
    expect(x.sourceQueries.sort()).toEqual(["alpha", "beta"]);
    expect(x.originalRanks).toEqual(
      expect.arrayContaining([
        { query: "alpha", rank: 1 },
        { query: "beta", rank: 2 },
      ]),
    );
    // RRF score for x: 1/(60+1) + 1/(60+2) = 0.01639 + 0.01613 ≈ 0.03252
    expect(x.score).toBeCloseTo(1 / 61 + 1 / 62, 5);
  });

  it("treats absence as zero contribution (does not penalise)", () => {
    const fused = fuseRankings([
      { query: "a", urls: ["only-a"] },
      { query: "b", urls: ["only-b"] },
    ]);
    const onlyA = fused.find((f) => f.url === "only-a")!;
    expect(onlyA.score).toBeCloseTo(1 / 61, 5);
    expect(onlyA.sourceQueries).toEqual(["a"]);
  });

  it("returns an empty array when no queries have any results", () => {
    expect(fuseRankings([{ query: "a", urls: [] }])).toEqual([]);
    expect(fuseRankings([])).toEqual([]);
  });

  it("is deterministic for ties (stable order by URL string asc)", () => {
    // Both URLs at rank 1 in query a → identical scores → tiebreak by URL asc
    const fused = fuseRankings([{ query: "a", urls: ["b", "a"] }]);
    // a is at rank 2, b at rank 1 → b wins. Now force a true tie:
    const tied = fuseRankings([
      { query: "a", urls: ["zzz"] },
      { query: "b", urls: ["aaa"] },
    ]);
    // both score 1/61 — alphabetical: aaa first
    expect(tied[0].url).toBe("aaa");
    expect(tied[1].url).toBe("zzz");
  });

  it("accepts custom k", () => {
    const fused = fuseRankings([{ query: "a", urls: ["x"] }], { k: 0 });
    expect(fused[0].score).toBeCloseTo(1 / 1, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @sensai/api test -- rrf`
Expected: FAIL with "Cannot find module '../tools/dataforseo/rrf'".

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/src/tools/dataforseo/rrf.ts`:

```ts
export const RRF_K_DEFAULT = 60;

export interface RankedQuery {
  query: string;
  /** URLs in ranked order (rank 1 = first). Use the canonical URL form so dedup works. */
  urls: string[];
}

export interface FusedItem {
  url: string;
  score: number;
  sourceQueries: string[];
  originalRanks: { query: string; rank: number }[];
}

/**
 * Reciprocal Rank Fusion. For each url, score = Σ 1/(k + rank_i)
 * across all queries where it appears. Documents not present in a
 * query contribute 0 to that sum (no penalty for absence).
 *
 * Output is sorted by score desc, with stable URL-asc tiebreak.
 *
 * Reference: Cormack, Clarke, Büttcher (SIGIR 2009).
 */
export function fuseRankings(
  rankings: RankedQuery[],
  opts: { k?: number } = {},
): FusedItem[] {
  const k = opts.k ?? RRF_K_DEFAULT;
  const acc = new Map<string, FusedItem>();

  for (const r of rankings) {
    for (let i = 0; i < r.urls.length; i++) {
      const url = r.urls[i];
      const rank = i + 1;
      const contribution = 1 / (k + rank);
      const existing = acc.get(url);
      if (existing) {
        existing.score += contribution;
        existing.sourceQueries.push(r.query);
        existing.originalRanks.push({ query: r.query, rank });
      } else {
        acc.set(url, {
          url,
          score: contribution,
          sourceQueries: [r.query],
          originalRanks: [{ query: r.query, rank }],
        });
      }
    }
  }

  return Array.from(acc.values()).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.url < b.url ? -1 : a.url > b.url ? 1 : 0;
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @sensai/api test -- rrf`
Expected: PASS, all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/tools/dataforseo/rrf.ts apps/api/src/tests/rrf.test.ts
git commit -m "feat(api): add RRF fusion utility for SERP merging (Plan 18)"
```

---

## Task 2: Add the canonical-URL utility for dedup

**Files:**
- Create: `apps/api/src/tools/dataforseo/canonical-url.ts`
- Test: `apps/api/src/tests/canonical-url.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/tests/canonical-url.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canonicalizeUrl } from "../tools/dataforseo/canonical-url";

describe("canonicalizeUrl", () => {
  it("lowercases host and preserves path case", () => {
    expect(canonicalizeUrl("HTTPS://Example.COM/Path/To/Page")).toBe(
      "https://example.com/Path/To/Page",
    );
  });

  it("strips trailing slash from path (but keeps root '/')", () => {
    expect(canonicalizeUrl("https://example.com/foo/")).toBe("https://example.com/foo");
    expect(canonicalizeUrl("https://example.com/")).toBe("https://example.com/");
  });

  it("removes utm_* and fbclid/gclid query params, keeps others sorted", () => {
    expect(
      canonicalizeUrl("https://example.com/p?utm_source=x&id=42&utm_campaign=y&fbclid=z&q=hi"),
    ).toBe("https://example.com/p?id=42&q=hi");
  });

  it("drops the URL fragment", () => {
    expect(canonicalizeUrl("https://example.com/p#section")).toBe("https://example.com/p");
  });

  it("returns the input verbatim if URL parsing fails", () => {
    expect(canonicalizeUrl("not a url")).toBe("not a url");
  });

  it("treats http and https as distinct (do not normalise scheme)", () => {
    expect(canonicalizeUrl("http://example.com/")).not.toBe(canonicalizeUrl("https://example.com/"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @sensai/api test -- canonical-url`
Expected: FAIL with module not found.

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/src/tools/dataforseo/canonical-url.ts`:

```ts
const TRACKING_PARAM_PREFIXES = ["utm_"];
const TRACKING_PARAM_EXACT = new Set(["fbclid", "gclid", "mc_cid", "mc_eid", "yclid"]);

/**
 * Canonicalises a URL for dedup purposes. Lowercases host, drops fragment,
 * removes common tracking params, sorts remaining params, and strips a
 * trailing slash from non-root paths. Scheme is preserved (http != https).
 *
 * If parsing fails, returns the input unchanged so we never throw inside
 * the SERP merge.
 */
export function canonicalizeUrl(input: string): string {
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    return input;
  }

  u.hash = "";
  u.host = u.host.toLowerCase();

  const keep: [string, string][] = [];
  for (const [key, value] of u.searchParams.entries()) {
    if (TRACKING_PARAM_EXACT.has(key)) continue;
    if (TRACKING_PARAM_PREFIXES.some((p) => key.startsWith(p))) continue;
    keep.push([key, value]);
  }
  keep.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  u.search = "";
  for (const [k, v] of keep) u.searchParams.append(k, v);

  let path = u.pathname;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  u.pathname = path;

  return u.toString();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @sensai/api test -- canonical-url`
Expected: PASS, all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/tools/dataforseo/canonical-url.ts apps/api/src/tests/canonical-url.test.ts
git commit -m "feat(api): add canonical URL utility for SERP dedup (Plan 18)"
```

---

## Task 3: Extend `SerpResult` types with provenance fields

**Files:**
- Modify: `apps/api/src/tools/dataforseo/serp.types.ts`

- [ ] **Step 1: Update the schema**

Replace the contents of `apps/api/src/tools/dataforseo/serp.types.ts`:

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
  /** Position in the FUSED result list (1..N), not the original Google rank. */
  position: z.number().int().nonnegative(),
  /** RRF score. Optional for backwards compat with cached single-query results. */
  fusedScore: z.number().nonnegative().optional(),
  /** Disambiguator queries that surfaced this URL. Optional for backwards compat. */
  sourceQueries: z.array(z.string()).optional(),
});
export type SerpItem = z.infer<typeof SerpItem>;

export const SerpResult = z.object({
  items: SerpItem.array(),
  /** All disambiguator queries actually fetched. Optional for backwards compat. */
  queries: z.array(z.string()).optional(),
});
export type SerpResult = z.infer<typeof SerpResult>;
```

- [ ] **Step 2: Verify existing consumers still type-check**

Run: `pnpm --filter @sensai/api build`
Expected: PASS. The optional fields are additive — `brief.handler.ts` and `runs/resume-validation.ts` only read `items[].url/title/description` and call `SerpResult.safeParse({ items })`, both of which still succeed.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/tools/dataforseo/serp.types.ts
git commit -m "feat(api): extend SerpResult with fusedScore + sourceQueries (Plan 18)"
```

---

## Task 4: Refactor `SerpFetchHandler` to multi-query + RRF + dedup + top-15

**Files:**
- Modify: `apps/api/src/handlers/serp-fetch.handler.ts`

- [ ] **Step 1: Rewrite the handler**

Replace `apps/api/src/handlers/serp-fetch.handler.ts` with:

```ts
import { Injectable } from "@nestjs/common";
import type { StepContext, StepHandler, StepResult } from "../orchestrator/step-handler";
import type { RunInput } from "@sensai/shared";
import { DataForSeoClient } from "../tools/dataforseo/dataforseo.client";
import { ToolCacheService } from "../tools/tool-cache.service";
import { SerpFetchParams, type SerpItem, type SerpResult } from "../tools/dataforseo/serp.types";
import { getDisambiguateOutput, getResolvedRunInput } from "../orchestrator/run-input-resolver";
import { canonicalizeUrl } from "../tools/dataforseo/canonical-url";
import { fuseRankings, type RankedQuery } from "../tools/dataforseo/rrf";

const TOP_N_FUSED = 15;
const PER_QUERY_DEPTH = 10;
const LOCATION_CODE_POLAND = 2616;
const LANGUAGE_CODE = "pl";
const CACHE_TTL_SECONDS = 7 * 86400;

interface RawSerpRow {
  title: string;
  url: string;
  description: string;
  rank: number;
  canonicalUrl: string;
}

@Injectable()
export class SerpFetchHandler implements StepHandler {
  readonly type = "tool.serp.fetch";

  constructor(
    private readonly client: DataForSeoClient,
    private readonly cache: ToolCacheService,
  ) {}

  async execute(ctx: StepContext): Promise<StepResult> {
    const dis = getDisambiguateOutput(ctx.previousOutputs);
    const resolved = getResolvedRunInput(ctx.run.input as RunInput, ctx.previousOutputs);

    const queries = this.collectQueries(dis?.serpQueries, resolved.mainKeyword);
    if (queries.length === 0) {
      throw new Error(
        "mainKeyword (or disambiguate.serpQueries[0]) is required for tool.serp.fetch",
      );
    }

    // Fetch each query in parallel. Each call goes through the cache so reruns
    // are free. Cache key is sha256 over the params object (per-query).
    const perQueryRows = await Promise.all(
      queries.map((kw) => this.fetchOneQuery(ctx, kw)),
    );

    // Build a flat lookup table from canonical URL → richest available row,
    // and parallel rankings input for RRF.
    const rowByCanonical = new Map<string, RawSerpRow>();
    const rankings: RankedQuery[] = queries.map((query, qIdx) => {
      const rows = perQueryRows[qIdx];
      const canonicalOrder: string[] = [];
      for (const row of rows) {
        canonicalOrder.push(row.canonicalUrl);
        const existing = rowByCanonical.get(row.canonicalUrl);
        if (!existing) {
          rowByCanonical.set(row.canonicalUrl, row);
        } else if (row.title.length > existing.title.length) {
          // Prefer the row with the more descriptive title when the same
          // URL surfaces in multiple queries.
          rowByCanonical.set(row.canonicalUrl, { ...row, title: row.title });
        }
      }
      return { query, urls: canonicalOrder };
    });

    const fused = fuseRankings(rankings).slice(0, TOP_N_FUSED);

    const items: SerpItem[] = fused.map((f, i) => {
      const row = rowByCanonical.get(f.url)!;
      return {
        title: row.title,
        url: row.url, // original URL, not canonical, for downstream scrape
        description: row.description,
        position: i + 1,
        fusedScore: f.score,
        sourceQueries: Array.from(new Set(f.sourceQueries)),
      };
    });

    const result: SerpResult = { items, queries };
    return { output: result };
  }

  private collectQueries(serpQueries: string[] | undefined, mainKeyword: string | undefined): string[] {
    const candidates = serpQueries && serpQueries.length > 0
      ? serpQueries
      : (mainKeyword ? [mainKeyword] : []);
    const cleaned = candidates.map((q) => q.trim()).filter((q) => q.length > 0);
    // Dedup query strings (case-insensitive) preserving first-seen order.
    const seen = new Set<string>();
    const out: string[] = [];
    for (const q of cleaned) {
      const key = q.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(q);
      }
    }
    return out;
  }

  private async fetchOneQuery(ctx: StepContext, keyword: string): Promise<RawSerpRow[]> {
    const params = SerpFetchParams.parse({
      keyword,
      locationCode: LOCATION_CODE_POLAND,
      languageCode: LANGUAGE_CODE,
      depth: PER_QUERY_DEPTH,
    });

    return this.cache.getOrSet<RawSerpRow[]>({
      tool: "dataforseo",
      method: "serp.organic.live",
      params,
      ttlSeconds: CACHE_TTL_SECONDS,
      runId: ctx.run.id,
      stepId: ctx.step.id,
      forceRefresh: ctx.forceRefresh,
      fetcher: async () => {
        const t0 = Date.now();
        const raw = await this.client.serpOrganicLive(params);
        const cost = raw.tasks?.[0]?.cost?.toString() ?? "0";
        const rows: RawSerpRow[] = (raw.tasks?.[0]?.result?.[0]?.items ?? [])
          .filter((it) => it.type === "organic" && it.title && it.url)
          .slice(0, params.depth)
          .map((it, i) => {
            const url = String(it.url);
            return {
              title: String(it.title),
              url,
              description: String(it.description ?? ""),
              rank: Number(it.rank_absolute ?? i + 1),
              canonicalUrl: canonicalizeUrl(url),
            };
          });
        return { result: rows, costUsd: cost, latencyMs: Date.now() - t0 };
      },
    });
  }
}
```

- [ ] **Step 2: Verify the build**

Run: `pnpm --filter @sensai/api build`
Expected: PASS, no TS errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/handlers/serp-fetch.handler.ts
git commit -m "feat(api): SerpFetchHandler now fetches all serpQueries in parallel and fuses with RRF (Plan 18)"
```

---

## Task 5: Update existing handler tests for multi-query behavior

**Files:**
- Modify: `apps/api/src/tests/serp-fetch.handler.test.ts`

- [ ] **Step 1: Replace the test file**

Replace `apps/api/src/tests/serp-fetch.handler.test.ts` with:

```ts
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
          refinedTopic: "x", mainKeyword: "x", intent: "informational",
          contentType: "x", researchQuestion: "x",
          serpQueries: ["q one", "q two", "q three"],
          antiAngles: [], rationale: "x",
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
          refinedTopic: "x", mainKeyword: "x", intent: "informational",
          contentType: "x", researchQuestion: "x",
          serpQueries: ["q one", "q two"],
          antiAngles: [], rationale: "x",
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
          refinedTopic: "x", mainKeyword: "x", intent: "informational",
          contentType: "x", researchQuestion: "x",
          serpQueries: ["q1", "q2"],
          antiAngles: [], rationale: "x",
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
          refinedTopic: "x", mainKeyword: "x", intent: "informational",
          contentType: "x", researchQuestion: "x",
          serpQueries: ["q1", "q2"],
          antiAngles: [], rationale: "x",
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
          refinedTopic: "x", mainKeyword: "x", intent: "informational",
          contentType: "x", researchQuestion: "x",
          serpQueries: ["kw", "KW", " kw "],
          antiAngles: [], rationale: "x",
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
```

- [ ] **Step 2: Run the suite**

Run: `pnpm --filter @sensai/api test -- serp-fetch`
Expected: PASS, all 7 tests green.

- [ ] **Step 3: Run the full API test suite to catch downstream regressions**

Run: `pnpm --filter @sensai/api test`
Expected: PASS. Pay attention to `brief.handler.test.ts` and `resume-validation.test.ts` — they consume `SerpResult` and must keep working with the new optional fields.

If any of those fail: the most likely cause is a test that constructs a hand-rolled `SerpResult` and now relies on schema strictness. Add the missing optional fields to the fixture rather than relaxing the production schema.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/tests/serp-fetch.handler.test.ts
git commit -m "test(api): cover multi-query, dedup, RRF cap, and fallback for SerpFetchHandler (Plan 18)"
```

---

## Task 6: Show RRF provenance in the web SERP renderer

**Files:**
- Modify: `apps/web/src/components/step-output/serp.tsx`

- [ ] **Step 1: Replace the renderer**

Replace `apps/web/src/components/step-output/serp.tsx` with:

```tsx
import { domainOf, EmptyOutput, Metric } from "./shared";

type SerpItem = {
  title: string;
  url: string;
  description: string;
  position: number;
  fusedScore?: number;
  sourceQueries?: string[];
};

type SerpValue = { items: SerpItem[]; queries?: string[] };

function isSerp(v: unknown): v is SerpValue {
  if (!v || typeof v !== "object") return false;
  return Array.isArray((v as { items?: unknown }).items);
}

export function SerpOutput({ value }: { value: unknown }) {
  if (!isSerp(value)) return <EmptyOutput />;
  const { items, queries } = value;
  if (items.length === 0)
    return <p className="text-sm text-muted-foreground">Brak wyników SERP.</p>;

  const fusedAvg =
    items.reduce((acc, it) => acc + (it.fusedScore ?? 0), 0) / items.length;
  const isMultiQuery = (queries?.length ?? 0) > 1;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Wyników" value={items.length} />
        {queries && <Metric label="Zapytań" value={queries.length} />}
        {isMultiQuery && (
          <Metric label="Śr. RRF score" value={fusedAvg.toFixed(4)} />
        )}
      </div>

      {queries && queries.length > 0 && (
        <div className="rounded-lg border bg-muted/40 p-3">
          <div className="mb-1 text-xs font-medium text-muted-foreground">
            Pobrane zapytania
          </div>
          <ul className="flex flex-wrap gap-1">
            {queries.map((q) => (
              <li
                key={q}
                className="rounded bg-background px-2 py-0.5 font-mono text-xs"
              >
                {q}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ol className="space-y-2">
        {items.map((item) => (
          <li key={`${item.position}-${item.url}`} className="rounded-lg border bg-card p-3">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 w-6 shrink-0 text-right font-mono text-xs text-muted-foreground">
                #{item.position}
              </span>
              <div className="min-w-0 flex-1">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-sm font-medium hover:underline"
                  title={item.url}
                >
                  {item.title || item.url}
                </a>
                <div className="text-xs text-muted-foreground">{domainOf(item.url)}</div>
                {item.description && (
                  <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                    {item.description}
                  </p>
                )}
                {item.sourceQueries && item.sourceQueries.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Z zapytań:
                    </span>
                    {item.sourceQueries.map((q) => (
                      <span
                        key={q}
                        className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]"
                      >
                        {q}
                      </span>
                    ))}
                    {typeof item.fusedScore === "number" && (
                      <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                        score {item.fusedScore.toFixed(4)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
```

- [ ] **Step 2: Build the web app**

Run: `pnpm --filter @sensai/web build`
Expected: PASS, no TS errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/step-output/serp.tsx
git commit -m "feat(web): show fused queries + per-item provenance in SERP step output (Plan 18)"
```

---

## Task 7: Smoke test — real DataForSEO call against fixed disambiguator output

**Files:**
- Create: `scripts/smoke-plan-18.ts`
- Modify: `package.json` (add `smoke:plan-18` script)
- Output: `scripts/smoke-output/plan-18-serp-rrf.json` (created at runtime)

The smoke bypasses NestJS DI and the orchestrator. It instantiates `SerpFetchHandler` directly with a real `DataForSeoClient` and a no-op cache (so we hit the live API every time and never persist), feeds it a hardcoded disambiguator output, and asserts on the fused result. Pattern matches `scripts/smoke-plan-07.ts`.

- [ ] **Step 1: Write the smoke script**

Create `scripts/smoke-plan-18.ts`:

```ts
#!/usr/bin/env tsx
/**
 * Plan 18 manual smoke — multi-query SERP fetch + RRF.
 *
 * Bypasses NestJS DI and the orchestrator. Instantiates SerpFetchHandler
 * directly with real DataForSeoClient and a no-op cache. Feeds a fixed
 * disambiguator output (3 related queries about app documentation),
 * asserts: ≥1 URL appears in ≥2 sourceQueries, items.length ≤ 15,
 * positions are 1..N strictly ascending, fusedScore non-increasing,
 * all canonical URLs unique.
 *
 * Requires DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD in apps/api/.env.
 *
 * Run: pnpm smoke:plan-18
 */
import "reflect-metadata";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: resolve(__dirname, "../apps/api/.env") });

import { loadEnv } from "../apps/api/src/config/env";
import { DataForSeoClient } from "../apps/api/src/tools/dataforseo/dataforseo.client";
import { SerpFetchHandler } from "../apps/api/src/handlers/serp-fetch.handler";

const OUTPUT_DIR = resolve(__dirname, "smoke-output");
const OUTPUT_FILE = resolve(OUTPUT_DIR, "plan-18-serp-rrf.json");

async function main() {
  const env = loadEnv();
  if (!env.DATAFORSEO_LOGIN || !env.DATAFORSEO_PASSWORD) {
    console.error("[smoke] DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD required in apps/api/.env");
    process.exit(1);
  }

  const client = new DataForSeoClient(env);
  // No-op cache: always call the fetcher, never persist.
  const noopCache = {
    getOrSet: async <T,>(opts: { fetcher: () => Promise<{ result: T }> }) =>
      (await opts.fetcher()).result,
  } as any;
  const handler = new SerpFetchHandler(client, noopCache);

  const disambiguate = {
    refinedTopic: "Jak napisać instrukcję obsługi aplikacji webowej",
    mainKeyword: "instrukcja obsługi aplikacji",
    intent: "informational" as const,
    contentType: "how-to guide",
    researchQuestion: "Jak skutecznie napisać instrukcję obsługi aplikacji webowej?",
    serpQueries: [
      "instrukcja obsługi aplikacji webowej",
      "jak napisać user guide aplikacji",
      "dokumentacja użytkownika SaaS",
    ],
    antiAngles: ["urządzenia AGD", "instrukcja sprzętu"],
    rationale: "smoke test fixture",
  };

  const t0 = Date.now();
  const res = await handler.execute({
    run: { id: "smoke-run", input: { topic: disambiguate.refinedTopic, mainKeyword: disambiguate.mainKeyword } },
    step: { id: "smoke-step" },
    project: { id: "smoke-project", config: {} },
    previousOutputs: { disambiguate },
    attempt: 1,
    forceRefresh: false,
  } as any);
  const totalMs = Date.now() - t0;

  const out = res.output as { items: Array<any>; queries?: string[] };

  // Assertions
  const passes = {
    queriesEcho: Array.isArray(out.queries) && out.queries.length === disambiguate.serpQueries.length,
    itemsAtMost15: out.items.length <= 15,
    itemsAtLeast5: out.items.length >= 5,
    positionsAreSequential: out.items.every((it, i) => it.position === i + 1),
    scoresMonotonicNonIncreasing: out.items.every(
      (it, i) => i === 0 || (it.fusedScore ?? 0) <= (out.items[i - 1].fusedScore ?? 0),
    ),
    canonicalUrlsUnique:
      new Set(out.items.map((it: any) => it.url.toLowerCase())).size === out.items.length,
    atLeastOneCrossQueryHit: out.items.some(
      (it) => Array.isArray(it.sourceQueries) && it.sourceQueries.length >= 2,
    ),
  };

  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(
    OUTPUT_FILE,
    JSON.stringify({ totalMs, queries: out.queries, itemCount: out.items.length, passes, items: out.items }, null, 2),
    "utf-8",
  );

  console.log(`[smoke] queries fetched: ${out.queries?.length ?? 0}`);
  console.log(`[smoke] fused items: ${out.items.length}`);
  console.log(`[smoke] cross-query hits: ${out.items.filter((it) => (it.sourceQueries?.length ?? 0) >= 2).length}`);
  console.log(`[smoke] passes: ${JSON.stringify(passes)}`);
  console.log(`[smoke] total: ${totalMs} ms`);

  const allPass = Object.values(passes).every(Boolean);
  if (!allPass) {
    console.error("[smoke] FAIL — at least one criterion not met. See", OUTPUT_FILE);
    process.exit(2);
  }
  console.log(`[smoke] PASS — written to ${OUTPUT_FILE}`);
}

main().catch((e) => {
  console.error("[smoke] FAIL —", e);
  process.exit(1);
});
```

- [ ] **Step 2: Wire the npm script**

Edit root `package.json`. Find the `smoke:plan-XX` block and add:

```json
"smoke:plan-18": "apps/api/node_modules/.bin/tsx --tsconfig apps/api/tsconfig.json scripts/smoke-plan-18.ts"
```

- [ ] **Step 3: Run the smoke**

Run: `pnpm smoke:plan-18`
Expected: stdout includes `[smoke] PASS — written to scripts/smoke-output/plan-18-serp-rrf.json`. The fixture file shows `passes` all true.

If `atLeastOneCrossQueryHit` fails: the three queries are too semantically distinct — pick three closer paraphrases. If `itemsAtLeast5` fails: at least one query returned <5 organic results — likely a niche keyword or a DataForSEO outage. Re-check by running a single query manually.

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke-plan-18.ts package.json scripts/smoke-output/plan-18-serp-rrf.json
git commit -m "test(api): Plan 18 — smoke verifies multi-query RRF on real DataForSEO"
```

---

## Task 8: Final integration check + memory + PR

**Files:** none for code (verification + memory only)

- [ ] **Step 1: Build everything**

Run, in order:
```bash
pnpm --filter @sensai/shared build
pnpm --filter @sensai/api build
pnpm --filter @sensai/web build
```

Expected: all three succeed, no TS errors.

- [ ] **Step 2: Run the full unit-test suite**

Run: `pnpm --filter @sensai/api test`
Expected: all tests pass — including the pre-existing brief, youcom, query-fanout, resume-validation, disambiguate-topic, and topic-disambiguator tests. Plan 18 changes must not regress any of them.

- [ ] **Step 3: End-to-end manual sanity (release gate)**

Start the API + worker (`pnpm --filter @sensai/api start:dev`) and the web app (`pnpm --filter @sensai/web dev`). Create a run against a project that uses the disambiguation template (`Blog SEO — full + disambiguation`) with a topic that should produce multi-query disambiguation, e.g. "Jak napisać instrukcję obsługi aplikacji".

1. Verify the run pauses at `disambiguate` (status `awaiting_approval`) and produces ≥2 `serpQueries`.
2. Approve disambiguate. Wait for `research` step to finish (it will fetch all queries in parallel — should be fast).
3. Open the run detail page → research step → verify the renderer shows: a "Pobrane zapytania" chip list, an "Śr. RRF score" metric, and per-item `Z zapytań:` badges with score on items that surfaced from multiple queries.
4. At least one item should have ≥2 sourceQueries badges.

This is the manual release gate. It is not a CI check.

- [ ] **Step 4: Update auto-memory**

Append to `MEMORY.md`:

```
- [Plan 18 SERP Multi-Query + RRF](project_plan_18_serp_rrf.md) — COMPLETED, merged to main on YYYY-MM-DD; smoke passes; manual e2e verified
```

Create `memory/project_plan_18_serp_rrf.md`:

```markdown
---
name: Plan 18 SERP multi-query + RRF
description: tool.serp.fetch now fetches all disambiguate.serpQueries in parallel and fuses with RRF (k=60), top-15 cap
type: project
---

Plan 18 — COMPLETED + MERGED to main on YYYY-MM-DD (merge commit <sha>).

**What changed:**
- `tool.serp.fetch` previously used only `serpQueries[0]`; now fetches all 1..4 queries in parallel.
- Per-query DataForSEO call goes through existing `ToolCacheService` (per-keyword 7-day cache), so reruns and cascading retries are free.
- Results merged via Reciprocal Rank Fusion (k=60) in `apps/api/src/tools/dataforseo/rrf.ts`.
- URL dedup via canonical form (lowercased host, sorted params, no `utm_*`/`fbclid`/etc., no fragment) in `apps/api/src/tools/dataforseo/canonical-url.ts`.
- Output capped at top 15. Each item carries optional `fusedScore` + `sourceQueries[]`.
- Web `SerpOutput` shows fetched queries + per-item provenance badges.

**Why:**
Disambiguator (Plan 17) produces 1-4 SERP queries representing different facets of the topic. The old handler discarded 75% of that signal. Multi-query + RRF gives broader coverage with negligible extra cost (~$0.0024 vs $0.0006 per fetch) and equal latency (parallel).

**How to apply:**
- Downstream (`brief.handler.ts`, scrape, etc.) consume `SerpResult.items[].url/title/description` unchanged. New `fusedScore` and `sourceQueries` are debug-only and optional.
- If RRF top-15 quality proves insufficient in production (measurable via brief/article quality regression), Plan 19 candidate: cross-encoder semantic rerank ON TOP of RRF candidates, against `disambiguate.refinedTopic`. Don't rerank earlier — see plan rationale.
- `topN` is hardcoded at 15 (constant `TOP_N_FUSED` in handler). Make it configurable only when there's a downstream reason.
```

- [ ] **Step 5: Push branch + open PR**

```bash
git push -u origin <branch-name>
gh pr create --title "Plan 18 — SERP multi-query fetch + RRF fusion" --body "$(cat <<'EOF'
## Summary
- `tool.serp.fetch` now fetches every `disambiguate.serpQueries[]` in parallel (was: only `[0]`).
- Results merged via Reciprocal Rank Fusion (k=60), URL-deduped (canonical form, drops `utm_*`/`fbclid`/etc.), capped at top 15.
- Each `SerpItem` carries optional `fusedScore` and `sourceQueries` for debuggability; web renderer shows query chips + per-item provenance badges.
- Per-query cache key unchanged (7-day TTL per keyword); reruns and cascade retries remain free.

## Test plan
- [x] `pnpm --filter @sensai/api test` — all green (rrf, canonical-url, serp-fetch.handler + downstream brief/youcom/resume-validation regressions covered)
- [x] `pnpm --filter @sensai/api build` + `pnpm --filter @sensai/web build` — no TS errors
- [x] `pnpm smoke:plan-18` — real DataForSEO multi-query → RRF → top-15, all `passes` true
- [ ] Manual e2e: run with disambiguation template; verify multi-query badges in web SERP renderer; ≥1 item with ≥2 sourceQueries

EOF
)"
```

---

## Spec self-review

After writing this plan, I checked it against the design intent in conversation:

**Coverage of design intent:**
- "Pobrać wyniki dla wszystkich serpQueries" → Task 4 (Promise.all over `collectQueries`).
- "Połączyć wyniki / usunąć duplikaty" → Tasks 2 (canonicalize) + 4 (rowByCanonical map).
- "Reranking" via RRF → Tasks 1 (utility) + 4 (handler integration).
- "Top 15" cap (user choice from question) → Task 4 (`TOP_N_FUSED = 15`).
- "Plan 18 najpierw" (user choice from question) → this document.
- Backwards compatibility for `brief.handler.ts` and `resume-validation.ts` → Task 3 makes new schema fields optional + Task 5 Step 3 explicitly runs the full suite to catch regressions.

**Placeholder scan:** None. Every step has either exact code, exact commands with expected output, or a verification criterion. Task 8 step 4 has `YYYY-MM-DD` and `<sha>` placeholders — these are intentional fields the executor fills in *at merge time* (matches Plan 17 convention).

**Type consistency:**
- `SerpItem.fusedScore` and `SerpItem.sourceQueries` are defined as `optional` in Task 3 and consumed as optional in Task 4 (`items[i].fusedScore = f.score`, `sourceQueries = Array.from(...)`), Task 5 (assertion accesses `it.fusedScore!` after asserting it exists), Task 6 (renderer guards `typeof item.fusedScore === "number"`). Consistent throughout.
- `RankedQuery` from `rrf.ts` (Task 1) is imported by name in the handler (Task 4) — same shape.
- `canonicalizeUrl` from Task 2 used by name in Task 4. Same signature.

**Gaps:** None. The plan is complete and self-contained.
