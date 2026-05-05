#!/usr/bin/env tsx
/**
 * Plan 15 manual smoke test — tool.article.optimize.
 *
 * Reads Plan 14 smoke output (`scripts/smoke-output/plan-14-enriched.json`)
 * and runs ArticleOptimizeHandler in isolation.
 *
 * Pre-req: run `pnpm smoke:plan-14` first.
 *
 * Run: pnpm smoke:plan-15-optimize
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
import { ArticleOptimizeClient } from "../apps/api/src/tools/article-optimize/article-optimize.client";
import { ArticleOptimizeHandler } from "../apps/api/src/handlers/article-optimize.handler";
import { loadEnv } from "../apps/api/src/config/env";
import { DataEnrichmentResult } from "@sensai/shared";

const OUTPUT_DIR = resolve(__dirname, "smoke-output");
const INPUT_FILE = join(OUTPUT_DIR, "plan-14-enriched.json");

async function main() {
  if (!existsSync(INPUT_FILE)) {
    console.error(
      `[smoke] FAIL — input fixture missing: ${INPUT_FILE}\n` +
        "Run `pnpm smoke:plan-14` first to produce it.",
    );
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(INPUT_FILE, "utf-8"));
  const enrichment = DataEnrichmentResult.parse(raw);
  console.log(
    `[smoke] enriched input: ${enrichment.htmlContent.length} chars, ` +
      `language=${enrichment.meta.language}`,
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
  const optimizeClient = new ArticleOptimizeClient(responsesClient, env);
  const handler = new ArticleOptimizeHandler(optimizeClient, stubCache, env);

  const ctx = {
    run: { id: randomUUID(), input: { topic: enrichment.meta.keyword } },
    step: { id: "smoke-step-article-optimize" },
    project: { id: "smoke-project", config: {} },
    previousOutputs: { enrich: enrichment },
    attempt: 1,
    forceRefresh: false,
  } as any;

  console.log("[smoke] article.optimize …");
  const t0 = Date.now();
  const res = await handler.execute(ctx);
  const ms = Date.now() - t0;
  const out = res.output as any;

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(join(OUTPUT_DIR, "plan-15-optimize.json"), JSON.stringify(out, null, 2), "utf-8");
  writeFileSync(join(OUTPUT_DIR, "plan-15-optimize.html"), out.htmlContent, "utf-8");

  console.log(
    `[smoke] article.optimize done: ${ms}ms | ` +
      `chars ${out.stats.inputLength}→${out.stats.outputLength} ` +
      `sources ${out.stats.sourcesBefore}→${out.stats.sourcesAfter} ` +
      `anchors-: ${out.stats.anchorsRemoved} ` +
      `cost=$${out.stats.totalCostUsd} ` +
      `warnings=${out.warnings.length}`,
  );
  console.log(`[smoke] ASSERT sourcesAfter==sourcesBefore: ${out.stats.sourcesAfter === out.stats.sourcesBefore ? "PASS" : "FAIL"}`);
  console.log(`[smoke] ASSERT no <a> tags in output: ${!/<a\b/i.test(out.htmlContent) ? "PASS" : "FAIL"}`);
  console.log("[smoke] PASS — Plan 15 article.optimize smoke complete");
}

main().catch((e) => {
  console.error("[smoke] FAIL:", e);
  process.exit(1);
});
