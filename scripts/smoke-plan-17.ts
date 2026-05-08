#!/usr/bin/env tsx
/**
 * Plan 17 manual smoke — Topic disambiguator (offline, single LLM call).
 *
 * Runs DisambiguateTopicHandler in isolation against the click2docs project
 * config and the regression topic "Jak napisać instrukcję". Asserts that the
 * disambiguator anchors to the SaaS-app-documentation interpretation rather
 * than physical-device manuals.
 *
 * Run: pnpm smoke:plan-17
 */
import "reflect-metadata";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "node:path";
// Load env from both root .env and apps/api/.env (api overrides for shared keys)
dotenvConfig({ path: resolve(__dirname, "../.env") });
dotenvConfig({ path: resolve(__dirname, "../apps/api/.env"), override: true });

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { LlmClient } from "../apps/api/src/llm/llm.client";
import { TopicDisambiguatorClient } from "../apps/api/src/tools/topic-disambiguator/topic-disambiguator.client";
import { DisambiguateTopicHandler } from "../apps/api/src/handlers/disambiguate-topic.handler";
import { loadEnv } from "../apps/api/src/config/env";
import { DisambiguateOutput, type ProjectConfig } from "@sensai/shared";

const OUTPUT_DIR = resolve(__dirname, "smoke-output");
const OUTPUT_FILE = resolve(OUTPUT_DIR, "plan-17-disambiguate.json");

const click2docsConfig: ProjectConfig = {
  toneOfVoice: "konkretny, profesjonalny",
  targetAudience: "firmy SaaS, product managerowie",
  guidelines: "",
  defaultModels: { disambiguate: "openai/gpt-5-mini" },
  promptOverrides: {},
  productPitch:
    "click2docs.pl to SaaS generujący instrukcje obsługi aplikacji webowych na podstawie nagrań kliknięć użytkownika.",
  domain: "SaaS / dokumentacja techniczna aplikacji webowych",
  keyTerms: [
    "instrukcja aplikacji",
    "user guide",
    "onboarding",
    "dokumentacja produktu",
  ],
  antiTerms: [
    "urządzenia fizyczne",
    "AGD",
    "sprzęt",
    "instrukcja obsługi pralki",
    "DTR",
  ],
  competitors: ["Tango", "Scribe", "Guidde"],
};

async function main() {
  const env = loadEnv();
  if (!env.OPENROUTER_API_KEY) {
    console.error("[smoke] FAIL — OPENROUTER_API_KEY not set");
    process.exit(1);
  }

  // Bypass NestJS DI — direct instantiation (tsx/esbuild does not emit constructor metadata)
  const stubCostTracker = { record: async () => {} } as any;
  const llm = new LlmClient(stubCostTracker);

  const tdClient = new TopicDisambiguatorClient(llm, {
    DISAMBIGUATE_MODEL: env.DISAMBIGUATE_MODEL,
    DISAMBIGUATE_MAX_INPUT_CHARS: env.DISAMBIGUATE_MAX_INPUT_CHARS,
  });

  // Pass-through stub cache (no DB) — every getOrSet calls fetcher and unwraps result
  const stubCache = {
    getOrSet: async (opts: any) => {
      const fetched = await opts.fetcher();
      return fetched.result ?? fetched;
    },
  } as any;

  const handler = new DisambiguateTopicHandler(tdClient, stubCache, {
    DISAMBIGUATE_TTL_DAYS: env.DISAMBIGUATE_TTL_DAYS,
  });

  console.log(
    `[smoke] topic.disambiguate model=${env.DISAMBIGUATE_MODEL} project=click2docs ` +
      `topic="Jak napisać instrukcję"`,
  );

  const t0 = Date.now();
  const stepResult = await handler.execute({
    run: { id: randomUUID(), input: { topic: "Jak napisać instrukcję" } },
    step: { id: randomUUID() },
    project: { id: randomUUID(), name: "click2docs", config: click2docsConfig },
    previousOutputs: {},
    attempt: 1,
    forceRefresh: false,
  } as any);
  const totalMs = Date.now() - t0;

  const out = DisambiguateOutput.parse(stepResult.output);

  // -------- pass criteria --------
  const refinedHitsAppDomain = /aplikacj|saas|softw|web/i.test(out.refinedTopic);
  const antiAnglesIncludeAtLeastOneAntiTerm = click2docsConfig.antiTerms.some(
    (t) =>
      out.antiAngles.some((a) => a.toLowerCase().includes(t.toLowerCase())),
  );
  const serpQueriesAvoidAntiTerms = out.serpQueries.every(
    (q) =>
      !click2docsConfig.antiTerms.some((t) =>
        q.toLowerCase().includes(t.toLowerCase()),
      ),
  );
  const refinedTopicAvoidsAntiTerms = !click2docsConfig.antiTerms.some((t) =>
    out.refinedTopic.toLowerCase().includes(t.toLowerCase()),
  );

  const passes = {
    refinedHitsAppDomain,
    antiAnglesIncludeAtLeastOneAntiTerm,
    serpQueriesAvoidAntiTerms,
    refinedTopicAvoidsAntiTerms,
  };

  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(
    OUTPUT_FILE,
    JSON.stringify({ totalMs, output: out, passes }, null, 2),
    "utf-8",
  );

  const allPass = Object.values(passes).every(Boolean);
  console.log("[smoke] disambiguator output:", JSON.stringify(out, null, 2));
  console.log("[smoke] passes:", passes);
  console.log(`[smoke] total: ${totalMs} ms`);
  if (!allPass) {
    console.error("[smoke] FAIL — at least one pass criterion not met");
    process.exit(2);
  }
  console.log(`[smoke] PASS — written to ${OUTPUT_FILE}`);
}

main().catch((e) => {
  console.error("[smoke] FAIL —", e);
  process.exit(1);
});
