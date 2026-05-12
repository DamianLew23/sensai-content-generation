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
// Load env from both root .env and apps/api/.env (api overrides for shared keys).
// In a git worktree the files live in the main repo root, not the worktree.
// Detect worktree by checking if .env exists next to the script; if not fall back
// two levels up (worktrees/plan-18 → main repo).
function resolveRepoRoot(): string {
  // Worktree: __dirname = <main>/.worktrees/<branch>/scripts
  // Main repo: __dirname = <main>/scripts
  const candidate = resolve(__dirname, "..");
  // If apps/api/.env is missing in the candidate, walk up to find the main repo root
  const { existsSync: _exists } = require("node:fs");
  if (_exists(resolve(candidate, "apps/api/.env"))) return candidate;
  // two levels up (from .worktrees/<branch>)
  return resolve(candidate, "../..");
}
const REPO_ROOT = resolveRepoRoot();
dotenvConfig({ path: resolve(REPO_ROOT, ".env") });
dotenvConfig({ path: resolve(REPO_ROOT, "apps/api/.env"), override: true });

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
      "jak napisać instrukcję obsługi aplikacji webowej",
      "jak stworzyć instrukcję obsługi aplikacji webowej",
      "instrukcja obsługi aplikacji webowej krok po kroku",
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
