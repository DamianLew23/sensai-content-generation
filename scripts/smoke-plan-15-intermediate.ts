#!/usr/bin/env tsx
/**
 * Plan 15 manual smoke test — tool.article.intermediate.
 *
 * Reads Plan 15 optimize smoke output (`scripts/smoke-output/plan-15-optimize.json`)
 * and runs ArticleIntermediateHandler in isolation.
 *
 * Pre-req: run `pnpm smoke:plan-15-optimize` first.
 *
 * Run: pnpm smoke:plan-15-intermediate
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
import { ArticleIntermediateClient } from "../apps/api/src/tools/article-intermediate/article-intermediate.client";
import { ArticleIntermediateHandler } from "../apps/api/src/handlers/article-intermediate.handler";
import { loadEnv } from "../apps/api/src/config/env";
import { ArticleOptimizeResult } from "@sensai/shared";

const OUTPUT_DIR = resolve(__dirname, "smoke-output");
const INPUT_FILE = join(OUTPUT_DIR, "plan-15-optimize.json");

async function main() {
  if (!existsSync(INPUT_FILE)) {
    console.error(
      `[smoke] FAIL — input fixture missing: ${INPUT_FILE}\n` +
        "Run `pnpm smoke:plan-15-optimize` first to produce it.",
    );
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(INPUT_FILE, "utf-8"));
  const optimize = ArticleOptimizeResult.parse(raw);
  console.log(
    `[smoke] optimize input: ${optimize.htmlContent.length} chars, ` +
      `language=${optimize.meta.language}`,
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
  const intermediateClient = new ArticleIntermediateClient(responsesClient, env);
  const handler = new ArticleIntermediateHandler(intermediateClient, stubCache, env);

  const ctx = {
    run: { id: randomUUID(), input: { topic: optimize.meta.keyword } },
    step: { id: "smoke-step-article-intermediate" },
    project: { id: "smoke-project", config: {} },
    previousOutputs: { optimize },
    attempt: 1,
    forceRefresh: false,
  } as any;

  console.log("[smoke] article.intermediate …");
  const t0 = Date.now();
  const res = await handler.execute(ctx);
  const ms = Date.now() - t0;
  const out = res.output as any;

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(join(OUTPUT_DIR, "plan-15-intermediate.json"), JSON.stringify(out, null, 2), "utf-8");
  writeFileSync(join(OUTPUT_DIR, "plan-15-intermediate.html"), out.htmlContent, "utf-8");

  console.log(
    `[smoke] article.intermediate done: ${ms}ms | ` +
      `chars ${out.stats.inputLength}→${out.stats.outputLength} (${(out.stats.growth * 100).toFixed(1)}%) ` +
      `sources ${out.stats.sourcesBefore}→${out.stats.sourcesAfter} ` +
      `formatting strong ${out.stats.formattingBefore.strong}→${out.stats.formattingAfter.strong} ` +
      `cost=$${out.stats.totalCostUsd} ` +
      `warnings=${out.warnings.length}`,
  );
  console.log(`[smoke] ASSERT growth<=10%: ${out.stats.growth <= 0.10 ? "PASS" : "FAIL"}`);
  console.log(`[smoke] ASSERT sourcesAfter>=sourcesBefore: ${out.stats.sourcesAfter >= out.stats.sourcesBefore ? "PASS" : "FAIL"}`);
  console.log(`[smoke] ASSERT formattingAfter.strong>0: ${out.stats.formattingAfter.strong > 0 ? "PASS" : `WARN (got ${out.stats.formattingAfter.strong})`}`);
  console.log("[smoke] PASS — Plan 15 article.intermediate smoke complete");
}

main().catch((e) => {
  console.error("[smoke] FAIL:", e);
  process.exit(1);
});
