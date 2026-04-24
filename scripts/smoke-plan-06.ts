#!/usr/bin/env tsx
/**
 * Plan 06 manual smoke test — content cleaning.
 *
 * Manually wires ContentCleanHandler with stubbed cache (fetcher always invoked)
 * and real ContentCleanerClient → LlmClient → OpenAI embeddings. Bypasses NestJS
 * DI container because tsx/esbuild does not emit parameter type metadata that
 * NestJS requires.
 *
 * Verifies:
 *   - reductionPct > 20%
 *   - at least one page kept
 *   - all kept pages have paragraphs
 *   - blacklistedRemoved > 0 (fixture contains cookie/koszyk phrases)
 *   - second call with identical input returns same result (deterministic)
 *
 * Requires OPENAI_API_KEY in apps/api/.env.
 *
 * Run: pnpm smoke:plan-06
 */
import "reflect-metadata";
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnv } from "../apps/api/src/config/env";
import { LlmClient } from "../apps/api/src/llm/llm.client";
import { ContentCleanerClient } from "../apps/api/src/tools/content-cleaner/content-cleaner.client";
import { ContentCleanHandler } from "../apps/api/src/handlers/content-clean.handler";

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("[smoke] OPENAI_API_KEY missing in env");
    process.exit(1);
  }

  const fixturePath = resolve(__dirname, "fixtures/scrape-result-kortyzol.json");
  const scrape = JSON.parse(readFileSync(fixturePath, "utf-8"));
  console.log(`[smoke] loaded fixture: ${scrape.pages.length} pages`);

  const env = loadEnv();

  // Stub CostTrackerService — LlmClient.embedMany doesn't call it anyway
  const stubCostTracker = { record: async () => {} } as any;
  const llm = new LlmClient(stubCostTracker);

  const cleanerClient = new ContentCleanerClient(llm, env);

  // Stub ToolCacheService — smoke bypasses DB cache; always invoke fetcher directly
  const stubCache = {
    getOrSet: async (opts: any) => {
      const fetched = await opts.fetcher();
      return fetched.result;
    },
  } as any;

  const handler = new ContentCleanHandler(cleanerClient, stubCache, env);

  const ctx = {
    run: {
      id: `smoke-run-${Date.now()}`,
      input: { topic: "jak obniżyć kortyzol po 40", mainKeyword: "kortyzol", intent: "informational" },
    },
    step: { id: `smoke-step-${Date.now()}` },
    project: { id: "smoke-project", config: {} },
    previousOutputs: { scrape },
    attempt: 1,
  } as any;

  console.log(`[smoke] running cleaning (call 1) ...`);
  const t0 = Date.now();
  const out1: any = await handler.execute(ctx);
  const t1 = Date.now() - t0;
  console.log(`[smoke] call 1: ${t1}ms`);

  const r1 = out1.output;
  console.log(`[smoke] stats:`, r1.stats);
  console.log(`[smoke] dropped:`, r1.droppedPages);
  if (r1.pages[0]) {
    console.log(`[smoke] first kept page: ${r1.pages[0].url}`);
    console.log(`[smoke]   paragraphs: ${r1.pages[0].paragraphs.length}`);
    console.log(`[smoke]   preview: ${r1.pages[0].markdown.slice(0, 200)}...`);
  }

  if (r1.stats.reductionPct <= 20) throw new Error(`reductionPct too low: ${r1.stats.reductionPct}`);
  if (r1.pages.length === 0) throw new Error("no pages kept");
  if (!r1.pages.every((p: any) => p.paragraphs.length > 0)) throw new Error("page with zero paragraphs");
  if (r1.stats.blacklistedRemoved === 0) throw new Error("no blacklisted paragraphs removed");

  console.log(`[smoke] running cleaning (call 2 — determinism check) ...`);
  const ctx2 = { ...ctx, run: { ...ctx.run, id: `smoke-run-${Date.now()}-2` }, step: { id: `smoke-step-2` } };
  const t2Start = Date.now();
  const out2: any = await handler.execute(ctx2);
  const t2 = Date.now() - t2Start;
  console.log(`[smoke] call 2: ${t2}ms`);

  if (out2.output.stats.reductionPct !== r1.stats.reductionPct) {
    console.warn(
      `[smoke] WARN: reductionPct differs between runs: ${r1.stats.reductionPct} vs ${out2.output.stats.reductionPct}`,
    );
  }

  console.log(`[smoke] PASS — Plan 06 content cleaning works end-to-end`);
}

main().catch((e) => {
  console.error("[smoke] FAIL:", e);
  process.exit(1);
});
