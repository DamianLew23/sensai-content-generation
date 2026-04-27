#!/usr/bin/env tsx
/**
 * Plan 09 manual smoke test — entity & relation extraction.
 *
 * Runs: raw scrape fixture → ContentCleanHandler (real LLM embeddings)
 * → EntityExtractHandler (real LLM generateObject). Bypasses NestJS DI because
 * tsx/esbuild does not emit constructor parameter metadata.
 *
 * Verifies:
 *   - entities.length >= ENTITY_EXTRACT_MIN_ENTITIES
 *   - relationships.length >= ENTITY_EXTRACT_MIN_RELATIONS
 *   - relationToMain.length === entities.length
 *   - all entity ids follow E<n>; all relationships reference known ids
 *   - metadata.keyword and metadata.language are set by the handler (not the LLM)
 *   - score values are integers in [1, 100]
 *
 * Requires OPENAI_API_KEY (for cleaning embeddings) and OPENROUTER_API_KEY
 * (for extraction) in apps/api/.env.
 *
 * Run: pnpm smoke:plan-09
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
import { EntityExtractorClient } from "../apps/api/src/tools/entity-extractor/entity-extractor.client";
import { EntityExtractHandler } from "../apps/api/src/handlers/entity-extract.handler";

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

  // Phase 2: entity extract
  const extractorClient = new EntityExtractorClient(llm, env);
  const extractHandler = new EntityExtractHandler(extractorClient, stubCache, env);

  console.log(`[smoke] running entity.extract ...`);
  const t0 = Date.now();
  const out: any = await extractHandler.execute({
    ...baseCtx,
    step: { id: `${runId}-entities` },
    previousOutputs: { clean, deepResearch: undefined },
  });
  const t1 = Date.now() - t0;
  const r = out.output;
  console.log(`[smoke] call: ${t1}ms`);
  console.log(
    `[smoke] extracted: entities=${r.entities.length}, relationships=${r.relationships.length}, relationToMain=${r.relationToMain.length}`,
  );
  console.log(`[smoke] sample entity:        ${JSON.stringify(r.entities[0], null, 2)}`);
  console.log(`[smoke] sample relationship:  ${JSON.stringify(r.relationships[0], null, 2)}`);
  console.log(`[smoke] sample relevance:     ${JSON.stringify(r.relationToMain[0], null, 2)}`);

  // Assertions
  if (r.entities.length < env.ENTITY_EXTRACT_MIN_ENTITIES) {
    throw new Error(
      `too few entities: ${r.entities.length} < ${env.ENTITY_EXTRACT_MIN_ENTITIES}`,
    );
  }
  if (r.relationships.length < env.ENTITY_EXTRACT_MIN_RELATIONS) {
    throw new Error(
      `too few relationships: ${r.relationships.length} < ${env.ENTITY_EXTRACT_MIN_RELATIONS}`,
    );
  }
  if (r.relationToMain.length !== r.entities.length) {
    throw new Error(
      `relationToMain length mismatch: ${r.relationToMain.length} vs ${r.entities.length} entities`,
    );
  }
  if (!r.entities.every((e: any) => /^E\d+$/.test(e.id))) {
    throw new Error("entity id pattern violated");
  }
  const entityIds = new Set(r.entities.map((e: any) => e.id));
  const orphan = r.relationships.find(
    (rel: any) => !entityIds.has(rel.source) || !entityIds.has(rel.target),
  );
  if (orphan) {
    throw new Error(`relationship references unknown entity: ${JSON.stringify(orphan)}`);
  }
  const badScore = r.relationToMain.find(
    (rm: any) => !Number.isInteger(rm.score) || rm.score < 1 || rm.score > 100,
  );
  if (badScore) {
    throw new Error(`bad relationToMain.score: ${JSON.stringify(badScore)}`);
  }
  if (r.metadata.keyword !== "jak obniżyć kortyzol po 40 (kortyzol) — informational") {
    throw new Error(`metadata.keyword mismatch: ${r.metadata.keyword}`);
  }
  if (r.metadata.language !== "pl") {
    throw new Error(`metadata.language mismatch: ${r.metadata.language}`);
  }
  if (r.metadata.sourceUrlCount !== clean.pages.length) {
    throw new Error(
      `metadata.sourceUrlCount mismatch: got ${r.metadata.sourceUrlCount}, expected ${clean.pages.length}`,
    );
  }

  console.log(`[smoke] PASS — Plan 09 entity extraction works end-to-end`);
}

main().catch((e) => {
  console.error("[smoke] FAIL:", e);
  process.exit(1);
});
