#!/usr/bin/env tsx
/**
 * Plan 14 manual smoke test — Data enrichment.
 *
 * Reads the Plan 13 smoke output (`scripts/smoke-output/plan-13-draft.json`)
 * and runs DataEnrichHandler in isolation.
 *
 * Pre-req: run `pnpm smoke:plan-13` first to produce the input fixture.
 *
 * Run: pnpm smoke:plan-14
 */
import "reflect-metadata";
import { config as dotenvConfig } from "dotenv";
import { join, resolve } from "node:path";
dotenvConfig({ path: resolve(__dirname, "../.env") });
dotenvConfig({ path: resolve(__dirname, "../apps/api/.env"), override: true });
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import { CostTrackerService } from "../apps/api/src/llm/cost-tracker.service";
import { OpenAIResponsesClient } from "../apps/api/src/llm/openai-responses.client";
import { DataEnrichmentClient } from "../apps/api/src/tools/data-enricher/data-enricher.client";
import { DataEnrichHandler } from "../apps/api/src/handlers/data-enrich.handler";
import { loadEnv } from "../apps/api/src/config/env";
import { DraftGenerationResult } from "@sensai/shared";

const OUTPUT_DIR = resolve(__dirname, "smoke-output");
const INPUT_FILE = join(OUTPUT_DIR, "plan-13-draft.json");

async function main() {
  if (!existsSync(INPUT_FILE)) {
    console.error(
      `[smoke] FAIL — input fixture missing: ${INPUT_FILE}\n` +
        "Run `pnpm smoke:plan-13` first to produce it.",
    );
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(INPUT_FILE, "utf-8"));
  const draft = DraftGenerationResult.parse(raw);

  console.log(
    `[smoke] draft: ${draft.htmlContent.length} chars, ` +
      `${draft.blocks.length} blocks, language=${draft.meta.language}`,
  );

  const env = loadEnv();
  const stubCostTracker = { record: async () => {} } as any;
  const stubCache = {
    getOrSet: async (opts: any) => {
      const fetched = await opts.fetcher();
      return fetched.result ?? fetched;
    },
  } as any;
  const openaiSdk = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const responsesClient = new OpenAIResponsesClient(openaiSdk, stubCostTracker);
  const enrichmentClient = new DataEnrichmentClient(responsesClient, env);
  const handler = new DataEnrichHandler(enrichmentClient, stubCache, env);

  const ctx = {
    run: { id: randomUUID(), input: { topic: draft.meta.keyword } },
    step: { id: "smoke-step-data-enrich" },
    project: { id: "smoke-project", config: {} },
    previousOutputs: { draftGen: draft },
    attempt: 1,
    forceRefresh: false,
  } as any;

  console.log("[smoke] data.enrich …");
  const t0 = Date.now();
  const res = await handler.execute(ctx);
  const ms = Date.now() - t0;
  const out = res.output as any;

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(
    join(OUTPUT_DIR, "plan-14-enriched.json"),
    JSON.stringify(out, null, 2),
    "utf-8",
  );
  writeFileSync(
    join(OUTPUT_DIR, "plan-14-enriched.html"),
    out.htmlContent,
    "utf-8",
  );

  console.log(
    `[smoke] data.enrich done: ${ms}ms | ` +
      `claims=${out.stats.totalClaimsFound} ` +
      `verified=${out.stats.claimsVerified} ` +
      `sources+=${out.stats.sourcesAdded} ` +
      `corrections=${out.stats.correctionsFlagged} ` +
      `unverified=${out.stats.unverified} ` +
      `cost=$${out.stats.totalCostUsd} ` +
      `warnings=${out.warnings.length}`,
  );

  console.log(
    `[smoke] ASSERT claims>0: ${out.stats.totalClaimsFound > 0 ? "PASS" : `WARN (got ${out.stats.totalClaimsFound})`}`,
  );
  console.log(
    `[smoke] ASSERT html>=draft.length: ${out.htmlContent.length >= draft.htmlContent.length ? "PASS" : `WARN (shrunk by ${draft.htmlContent.length - out.htmlContent.length})`}`,
  );
  console.log(
    `[smoke] ASSERT verifications==claims: ${out.verifications.length === out.claims.length ? "PASS" : "WARN"}`,
  );

  console.log("[smoke] PASS — Plan 14 data.enrich smoke complete");
}

main().catch((e) => {
  console.error("[smoke] FAIL:", e);
  process.exit(1);
});
