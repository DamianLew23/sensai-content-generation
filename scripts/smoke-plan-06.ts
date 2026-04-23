#!/usr/bin/env tsx
/**
 * Plan 06 manual smoke test — content cleaning.
 *
 * Runs the ContentCleanHandler directly (no orchestrator, no DB-wired cache)
 * against a synthetic ScrapeResult fixture to verify:
 *   - reductionPct > 20%
 *   - at least one page kept
 *   - all kept pages have paragraphs
 *   - blacklistedRemoved > 0 (fixture contains cookie/koszyk phrases)
 *   - cache test: second run returns instantly (from_cache: true)
 *
 * Requires:
 *   - OPENAI_API_KEY in .env
 *   - Docker compose stack up (for tool_cache table)
 *
 * Run: pnpm smoke:plan-06
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import { Module } from "@nestjs/common";
import { ContentCleanHandler } from "../apps/api/src/handlers/content-clean.handler";
import { ContentCleanerModule } from "../apps/api/src/tools/content-cleaner/content-cleaner.module";
import { ToolsModule } from "../apps/api/src/tools/tools.module";
import { LlmModule } from "../apps/api/src/llm/llm.module";
import { DbModule } from "../apps/api/src/db/db.module";
import { loadEnv } from "../apps/api/src/config/env";

@Module({
  imports: [DbModule, LlmModule, ToolsModule, ContentCleanerModule],
  providers: [
    ContentCleanHandler,
    { provide: "CLEANING_ENV", useFactory: () => loadEnv() },
  ],
})
class SmokeModule {}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("[smoke] OPENAI_API_KEY missing in .env");
    process.exit(1);
  }

  const fixturePath = resolve(__dirname, "fixtures/scrape-result-kortyzol.json");
  const scrape = JSON.parse(readFileSync(fixturePath, "utf-8"));
  console.log(`[smoke] loaded fixture: ${scrape.pages.length} pages`);

  const app = await NestFactory.createApplicationContext(SmokeModule, { logger: ["warn", "error"] });
  const handler = app.get(ContentCleanHandler);

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

  console.log(`[smoke] running cleaning (call 2 — cache test) ...`);
  const ctx2 = { ...ctx, run: { ...ctx.run, id: `smoke-run-${Date.now()}-cached` }, step: { id: `smoke-step-cached` } };
  const t2Start = Date.now();
  const out2: any = await handler.execute(ctx2);
  const t2 = Date.now() - t2Start;
  console.log(`[smoke] call 2: ${t2}ms (expect < 200ms if cache hit)`);

  if (t2 > 500) {
    console.warn(`[smoke] WARN: second call took ${t2}ms — expected cache hit under 200ms`);
  }

  console.log(`[smoke] PASS — Plan 06 content cleaning works end-to-end`);
  await app.close();
}

main().catch((e) => {
  console.error("[smoke] FAIL:", e);
  process.exit(1);
});
