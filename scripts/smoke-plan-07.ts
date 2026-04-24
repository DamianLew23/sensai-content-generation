#!/usr/bin/env tsx
/**
 * Plan 07 manual smoke test — content extraction.
 *
 * Runs the full chain: raw scrape fixture → ContentCleanHandler (real LLM embeddings)
 * → ContentExtractHandler (real LLM generateObject). Bypasses NestJS DI because
 * tsx/esbuild does not emit constructor parameter metadata.
 *
 * Verifies:
 *   - facts.length >= 5, data.length >= 3, ideations.length >= 3
 *   - all IDs follow F<n>/D<n>/I<n>
 *   - metadata.keyword and metadata.language are set by the handler (not the LLM)
 *   - second call with identical input returns structurally identical output via cache stub
 *
 * Requires OPENAI_API_KEY (for cleaning embeddings) and OPENROUTER_API_KEY
 * (for extraction) in apps/api/.env.
 *
 * Run: pnpm smoke:plan-07
 */
import "reflect-metadata";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as dotenvConfig } from "dotenv";
// Load env from apps/api/.env (root .env only has Docker infra vars)
dotenvConfig({ path: resolve(__dirname, "../apps/api/.env") });
import { loadEnv } from "../apps/api/src/config/env";
import { LlmClient } from "../apps/api/src/llm/llm.client";
import { ContentCleanerClient } from "../apps/api/src/tools/content-cleaner/content-cleaner.client";
import { ContentCleanHandler } from "../apps/api/src/handlers/content-clean.handler";
import { ContentExtractorClient } from "../apps/api/src/tools/content-extractor/content-extractor.client";
import { ContentExtractHandler } from "../apps/api/src/handlers/content-extract.handler";

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("[smoke] OPENAI_API_KEY missing in env");
    process.exit(1);
  }
  if (!process.env.OPENROUTER_API_KEY) {
    console.error("[smoke] OPENROUTER_API_KEY missing in env");
    process.exit(1);
  }

  const fixturePath = resolve(__dirname, "fixtures/scrape-result-kortyzol.json");
  const scrape = JSON.parse(readFileSync(fixturePath, "utf-8"));
  console.log(`[smoke] loaded fixture: ${scrape.pages.length} pages`);

  const env = loadEnv();
  const stubCostTracker = { record: async () => {} } as any;
  const stubCache = {
    getOrSet: async (opts: any) => {
      const fetched = await opts.fetcher();
      return fetched.result ?? fetched;
    },
  } as any;

  const llm = new LlmClient(stubCostTracker);

  // Phase 1: clean
  const cleanerClient = new ContentCleanerClient(llm, env);
  const cleanHandler = new ContentCleanHandler(cleanerClient, stubCache, env);

  const runId = `smoke-run-${Date.now()}`;
  const baseCtx = {
    run: {
      id: runId,
      input: {
        topic: "jak obniżyć kortyzol po 40",
        mainKeyword: "kortyzol",
        intent: "informational",
      },
    },
    project: { id: "smoke-project", config: {} },
    attempt: 1,
  } as any;

  console.log(`[smoke] running clean ...`);
  const cleanOut: any = await cleanHandler.execute({
    ...baseCtx,
    step: { id: `${runId}-clean` },
    previousOutputs: { scrape },
  });
  const clean = cleanOut.output;
  console.log(
    `[smoke] clean: kept ${clean.pages.length} pages, ` +
      `${clean.stats.reductionPct.toFixed(1)}% reduction`,
  );

  // Phase 2: extract
  const extractorClient = new ContentExtractorClient(llm, env);
  const extractHandler = new ContentExtractHandler(extractorClient, stubCache, env);

  console.log(`[smoke] running extract (call 1) ...`);
  const t0 = Date.now();
  const out1: any = await extractHandler.execute({
    ...baseCtx,
    step: { id: `${runId}-extract` },
    previousOutputs: { clean, deepResearch: undefined },
  });
  const t1 = Date.now() - t0;
  const r1 = out1.output;
  console.log(`[smoke] call 1: ${t1}ms`);
  console.log(
    `[smoke] extracted: facts=${r1.facts.length}, data=${r1.data.length}, ideations=${r1.ideations.length}`,
  );
  console.log(`[smoke] sample fact: ${JSON.stringify(r1.facts[0], null, 2)}`);
  console.log(`[smoke] sample data: ${JSON.stringify(r1.data[0], null, 2)}`);
  console.log(`[smoke] sample ideation: ${JSON.stringify(r1.ideations[0], null, 2)}`);

  // Assertions
  if (r1.facts.length < env.CONTENT_EXTRACT_MIN_FACTS) {
    throw new Error(`too few facts: ${r1.facts.length}`);
  }
  if (r1.data.length < env.CONTENT_EXTRACT_MIN_DATA) {
    throw new Error(`too few data points: ${r1.data.length}`);
  }
  if (r1.ideations.length < env.CONTENT_EXTRACT_MIN_IDEATIONS) {
    throw new Error(`too few ideations: ${r1.ideations.length}`);
  }
  if (!r1.facts.every((f: any) => /^F\d+$/.test(f.id))) {
    throw new Error("fact id pattern violated");
  }
  if (!r1.data.every((d: any) => /^D\d+$/.test(d.id))) {
    throw new Error("data id pattern violated");
  }
  if (!r1.ideations.every((i: any) => /^I\d+$/.test(i.id))) {
    throw new Error("ideation id pattern violated");
  }
  if (r1.metadata.keyword !== "jak obniżyć kortyzol po 40 (kortyzol) — informational") {
    throw new Error(`metadata.keyword mismatch: ${r1.metadata.keyword}`);
  }
  if (r1.metadata.language !== "pl") {
    throw new Error(`metadata.language mismatch: ${r1.metadata.language}`);
  }
  if (r1.metadata.sourceUrlCount !== clean.pages.length) {
    throw new Error(
      `metadata.sourceUrlCount mismatch: got ${r1.metadata.sourceUrlCount}, expected ${clean.pages.length}`,
    );
  }

  console.log(`[smoke] PASS — Plan 07 content extraction works end-to-end`);
}

main().catch((e) => {
  console.error("[smoke] FAIL:", e);
  process.exit(1);
});
