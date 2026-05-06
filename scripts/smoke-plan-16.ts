#!/usr/bin/env tsx
/**
 * Plan 16 manual smoke test — tool.article.humanize.
 *
 * Reads Plan 15 intermediate smoke output (`scripts/smoke-output/plan-15-intermediate.json`)
 * and runs ArticleHumanizeHandler in isolation.
 *
 * Pre-req: run `pnpm smoke:plan-15-intermediate` first.
 *
 * Run: pnpm smoke:plan-16
 */
import "reflect-metadata";
import { config as dotenvConfig } from "dotenv";
import { join, resolve } from "node:path";
dotenvConfig({ path: resolve(__dirname, "../.env") });
dotenvConfig({ path: resolve(__dirname, "../apps/api/.env"), override: true });
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import { OpenAIResponsesClient } from "../apps/api/src/llm/openai-responses.client";
import { ArticleHumanizeClient } from "../apps/api/src/tools/article-humanize/article-humanize.client";
import { ArticleHumanizeHandler } from "../apps/api/src/handlers/article-humanize.handler";
import { loadEnv } from "../apps/api/src/config/env";
import { ArticleIntermediateResult } from "@sensai/shared";

const OUTPUT_DIR = resolve(__dirname, "smoke-output");
const INPUT_FILE = join(OUTPUT_DIR, "plan-15-intermediate.json");

async function main() {
  if (!existsSync(INPUT_FILE)) {
    console.error(
      `[smoke] FAIL — input fixture missing: ${INPUT_FILE}\n` +
        "Run `pnpm smoke:plan-15-intermediate` first to produce it.",
    );
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(INPUT_FILE, "utf-8"));
  const intermediate = ArticleIntermediateResult.parse(raw);
  console.log(
    `[smoke] intermediate input: ${intermediate.htmlContent.length} chars, ` +
      `language=${intermediate.meta.language}`,
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
  const humanizeClient = new ArticleHumanizeClient(responsesClient, env);
  const handler = new ArticleHumanizeHandler(humanizeClient, stubCache, env);

  const ctx = {
    run: { id: randomUUID(), input: { topic: intermediate.meta.keyword } },
    step: { id: "smoke-step-article-humanize" },
    project: { id: "smoke-project", config: {} },
    previousOutputs: { intermediate },
    attempt: 1,
    forceRefresh: false,
  } as any;

  console.log("[smoke] article.humanize …");
  const t0 = Date.now();
  const res = await handler.execute(ctx);
  const ms = Date.now() - t0;
  const out = res.output as any;

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(join(OUTPUT_DIR, "plan-16-humanize.json"), JSON.stringify(out, null, 2), "utf-8");
  writeFileSync(join(OUTPUT_DIR, "plan-16-humanize.html"), out.htmlContent, "utf-8");

  const r = out.stats.readability;
  const s = out.stats.sentence;
  console.log(
    `[smoke] article.humanize done: ${ms}ms | ` +
      `chars ${out.stats.inputLength}→${out.stats.outputLength} (ratio ${out.stats.ratio.toFixed(3)}) ` +
      `sources ${out.stats.sourcesBefore}→${out.stats.sourcesAfter} ` +
      `ASL ${r.avgSentenceLength} long>cap ${r.longSentencesGtCap} bold ${r.boldShare} ` +
      `cv ${s.cvOutput} ` +
      `retry ${out.stats.retryUsed}/${out.stats.retryAccepted} ` +
      `cost=$${out.stats.totalCostUsd} ` +
      `warnings=${out.warnings.length}`,
  );
  // Soft assertions, non-blocking for benchmark deviations.
  console.log(`[smoke] ASSERT ratio in [0.80, 1.20]: ${out.stats.ratio >= 0.80 && out.stats.ratio <= 1.20 ? "PASS" : "FAIL"}`);
  console.log(`[smoke] ASSERT sourcesAfter>=sourcesBefore: ${out.stats.sourcesAfter >= out.stats.sourcesBefore ? "PASS" : "FAIL"}`);
  console.log(`[smoke] ASSERT no <a> tags: ${!/<a\b/i.test(out.htmlContent) ? "PASS" : "FAIL"}`);
  console.log(`[smoke] ASSERT cv > 0.45 (lesson target): ${s.cvOutput > 0.45 ? "PASS" : `WARN (got ${s.cvOutput})`}`);
  console.log(`[smoke] ASSERT bold_share <= 0.08: ${r.boldShare <= 0.08 ? "PASS" : `WARN (got ${r.boldShare})`}`);
  console.log("[smoke] PASS — Plan 16 article.humanize smoke complete");
}

main().catch((e) => {
  console.error("[smoke] FAIL:", e);
  process.exit(1);
});
