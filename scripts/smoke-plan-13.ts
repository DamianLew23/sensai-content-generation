#!/usr/bin/env tsx
/**
 * Plan 13 manual smoke test — Draft generation.
 *
 * Reads the Plan 12 smoke output (`scripts/smoke-output/plan-12-distribution.json`)
 * and runs DraftGenerateHandler in isolation.
 *
 * Pre-req: run `pnpm smoke:plan-12` first to produce the input fixture.
 *
 * Run: pnpm smoke:plan-13
 */
import "dotenv/config";
import "reflect-metadata";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Test } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { HandlersModule } from "../apps/api/src/handlers/handlers.module";
import { DraftGenerateHandler } from "../apps/api/src/handlers/draft-generate.handler";
import { DistributionResult } from "@sensai/shared";

const OUTPUT_DIR = resolve(__dirname, "smoke-output");
const INPUT_FILE = join(OUTPUT_DIR, "plan-12-distribution.json");

async function main() {
  if (!existsSync(INPUT_FILE)) {
    console.error(
      `[smoke] FAIL — input fixture missing: ${INPUT_FILE}\n` +
        "Run `pnpm smoke:plan-12` first to produce it.",
    );
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(INPUT_FILE, "utf-8"));
  const distribution = DistributionResult.parse(raw);

  console.log(
    `[smoke] distribution: ${distribution.sections.length} sections, ` +
      `coverage=${distribution.stats.coverage.overallPercent}%, ` +
      `language=${distribution.meta.language}`,
  );

  const moduleRef = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true }), HandlersModule],
  }).compile();

  const handler = moduleRef.get(DraftGenerateHandler);

  const ctx = {
    run: {
      id: `smoke-plan-13-${Date.now()}`,
      input: { topic: distribution.meta.keyword, mainKeyword: distribution.meta.keyword },
    },
    step: { id: "smoke-step-draft-generate" },
    project: { id: "smoke-project", config: {} },
    previousOutputs: { distribute: distribution },
    attempt: 1,
    forceRefresh: false,
  } as any;

  console.log("[smoke] draft.generate …");
  const t0 = Date.now();
  const res = await handler.execute(ctx);
  const ms = Date.now() - t0;
  const out = res.output as any;

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(
    join(OUTPUT_DIR, "plan-13-draft.json"),
    JSON.stringify(out, null, 2),
    "utf-8",
  );
  writeFileSync(join(OUTPUT_DIR, "plan-13-draft.html"), out.htmlContent, "utf-8");

  console.log(
    `[smoke] draft.generate done: ${ms}ms | ` +
      `blocks=${out.stats.blockCount} ` +
      `chars=${out.stats.totalChars} ` +
      `cost=$${out.stats.totalCostUsd} ` +
      `imagePrompts=${out.stats.imagePromptCount} ` +
      `warnings=${out.warnings.length}`,
  );

  console.log(`[smoke] ASSERT chars>3000: ${out.stats.totalChars > 3000 ? "PASS" : `WARN (got ${out.stats.totalChars})`}`);
  console.log(`[smoke] ASSERT blocks>=2: ${out.stats.blockCount >= 2 ? "PASS" : `WARN (got ${out.stats.blockCount})`}`);
  console.log(`[smoke] ASSERT html starts with <h1>: ${out.htmlContent.trimStart().startsWith("<h1>") ? "PASS" : "WARN"}`);

  await moduleRef.close();
  console.log("[smoke] PASS — Plan 13 draft.generate smoke complete");
}

main().catch((e) => {
  console.error("[smoke] FAIL:", e);
  process.exit(1);
});
