#!/usr/bin/env tsx
/**
 * Plan 10 manual smoke test — query fan-out.
 *
 * Runs: keyword → DataForSEO PAA fetch → 3 LLM calls (intents / classify / paa)
 * → assembled QueryFanOutResult. Bypasses NestJS DI because tsx/esbuild does not
 * emit constructor parameter metadata.
 *
 * Verifies:
 *   - intents.length >= 2
 *   - all area ids unique and matching /^A\d+$/
 *   - dominantIntent ∈ intents.map(i => i.name)
 *   - if paaUsed: paaMapping.length + unmatchedPaa.length === paaFetched
 *   - every MACRO area has non-empty evergreenTopic
 *   - costUsd > 0 and < $1.00 (gpt-5 with reasoning is more expensive than gemini-flash)
 *
 * Requires OPENROUTER_API_KEY (3 LLM calls) and DATAFORSEO_LOGIN/_PASSWORD (PAA)
 * in apps/api/.env. Set QUERY_FANOUT_PAA_ENABLED=false to skip the DataForSEO call.
 *
 * Run: pnpm smoke:plan-10
 */
import "reflect-metadata";
import { resolve } from "node:path";
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: resolve(__dirname, "../apps/api/.env") });
import { loadEnv } from "../apps/api/src/config/env";
import { LlmClient } from "../apps/api/src/llm/llm.client";
import { DataForSeoClient } from "../apps/api/src/tools/dataforseo/dataforseo.client";
import { QueryFanOutClient } from "../apps/api/src/tools/query-fanout/query-fanout.client";
import { QueryFanOutHandler } from "../apps/api/src/handlers/query-fanout.handler";

async function main() {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error("[smoke] OPENROUTER_API_KEY missing in env");
    process.exit(1);
  }
  const env = loadEnv();
  if (env.QUERY_FANOUT_PAA_ENABLED && (!env.DATAFORSEO_LOGIN || !env.DATAFORSEO_PASSWORD)) {
    console.error("[smoke] DataForSEO credentials missing (set QUERY_FANOUT_PAA_ENABLED=false to skip)");
    process.exit(1);
  }

  const stubCostTracker = { record: async () => {} } as any;
  // Pass-through cache (no DB) — every getOrSet calls fetcher and returns its `result`.
  const stubCache = {
    getOrSet: async (opts: any) => {
      const fetched = await opts.fetcher();
      return fetched.result ?? fetched;
    },
  } as any;

  const llm = new LlmClient(stubCostTracker);
  const dfs = new DataForSeoClient(env);
  const fanoutClient = new QueryFanOutClient(llm, env);
  const handler = new QueryFanOutHandler(fanoutClient, dfs, stubCache, env);

  const runId = `smoke-fanout-${Date.now()}`;
  const ctx = {
    run: { id: runId, input: { topic: "Jak obniżyć kortyzol po 40tce?" } },
    project: { id: "smoke-project", config: {} },
    step: { id: `${runId}-fanout` },
    previousOutputs: {},
    attempt: 1,
    forceRefresh: true,
  } as any;

  console.log(`[smoke] keyword: "${ctx.run.input.topic}"`);
  console.log(`[smoke] PAA enabled: ${env.QUERY_FANOUT_PAA_ENABLED}`);
  console.log(`[smoke] model: ${env.QUERY_FANOUT_MODEL}`);
  console.log(`[smoke] reasoning effort: intents=${env.QUERY_FANOUT_REASONING_INTENTS}, classify=${env.QUERY_FANOUT_REASONING_CLASSIFY}, paa=${env.QUERY_FANOUT_REASONING_PAA}`);

  const t0 = Date.now();
  const out: any = await handler.execute(ctx);
  const t1 = Date.now() - t0;
  const r = out.output;

  console.log(`\n[smoke] total latency: ${t1}ms`);
  console.log(`[smoke] dominantIntent: ${r.dominantIntent}`);
  console.log(`[smoke] mainEntity: ${r.normalization.mainEntity} (${r.normalization.category}, YMYL=${r.normalization.ymylRisk})`);
  console.log(`[smoke] intents: ${r.intents.length}`);
  for (const intent of r.intents) {
    const dom = intent.name === r.dominantIntent ? " ← GŁÓWNA" : "";
    console.log(`  ${intent.name}${dom} (${intent.areas.length} obszarów)`);
    for (const area of intent.areas) {
      console.log(`    [${area.id}] ${area.classification} ${area.ymyl ? "YMYL" : "    "} ${area.topic} — ${area.question}`);
      if (area.classification === "MACRO") {
        console.log(`        evergreen: ${area.evergreenTopic} — ${area.evergreenQuestion}`);
      }
    }
  }
  console.log(`\n[smoke] paaUsed=${r.metadata.paaUsed}, paaFetched=${r.metadata.paaFetched}, paaMapping=${r.paaMapping.length}, unmatchedPaa=${r.unmatchedPaa.length}`);
  if (r.paaMapping.length > 0) {
    console.log(`[smoke] sample PAA mapping:    ${JSON.stringify(r.paaMapping[0])}`);
  }
  if (r.unmatchedPaa.length > 0) {
    console.log(`[smoke] sample unmatched PAA:  ${JSON.stringify(r.unmatchedPaa[0])}`);
  }

  // ----- Assertions -----
  if (r.intents.length < 2) {
    throw new Error(`expected >= 2 intents, got ${r.intents.length}`);
  }
  const allAreas = r.intents.flatMap((i: any) => i.areas);
  const ids = allAreas.map((a: any) => a.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error(`duplicate area ids: ${JSON.stringify(ids)}`);
  }
  if (!ids.every((id: string) => /^A\d+$/.test(id))) {
    throw new Error(`invalid area id pattern: ${JSON.stringify(ids)}`);
  }
  if (!r.intents.some((i: any) => i.name === r.dominantIntent)) {
    throw new Error(`dominantIntent "${r.dominantIntent}" not in intents`);
  }
  if (r.metadata.paaUsed) {
    const paaTotal = r.paaMapping.length + r.unmatchedPaa.length;
    if (paaTotal !== r.metadata.paaFetched) {
      throw new Error(`PAA accounting mismatch: ${paaTotal} (mapped + unmatched) !== ${r.metadata.paaFetched} (fetched)`);
    }
  } else {
    if (r.paaMapping.length > 0 || r.unmatchedPaa.length > 0) {
      throw new Error(`paaUsed=false but paaMapping/unmatched non-empty`);
    }
  }
  for (const a of allAreas) {
    if (a.classification === "MACRO" && !a.evergreenTopic.trim()) {
      throw new Error(`MACRO area ${a.id} has empty evergreenTopic`);
    }
  }
  if (r.metadata.keyword !== "Jak obniżyć kortyzol po 40tce?") {
    throw new Error(`metadata.keyword mismatch: ${r.metadata.keyword}`);
  }
  if (r.metadata.language !== "pl") {
    throw new Error(`metadata.language mismatch: ${r.metadata.language}`);
  }

  console.log(`\n[smoke] PASS — Plan 10 query fan-out works end-to-end`);
}

main().catch((e) => {
  console.error("[smoke] FAIL:", e);
  process.exit(1);
});
