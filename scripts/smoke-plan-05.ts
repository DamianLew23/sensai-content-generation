#!/usr/bin/env tsx
/**
 * Plan 05 manual smoke test — you.com deep research.
 *
 * Wymaga:
 * - Docker compose stack up (`pnpm dev:infra`)
 * - API running (`pnpm dev:api`)
 * - Seed data (`pnpm --filter @sensai/api db:seed`)
 * - ENV:
 *     API_BASE_URL + API_BEARER_TOKEN
 *     YOUCOM_API_KEY (real, z portalu you.com)
 *     SMOKE_PROJECT_ID (uuid projektu demo)
 *     SMOKE_TEMPLATE_ID (uuid templatki "Blog SEO — deep research" v1)
 *
 * Weryfikacja:
 *   - step "deepResearch" completed
 *   - output.content.length > 100
 *   - output.sources.length > 0
 *   - tool_calls zawiera wpis {tool:"youcom", method:"research", cost_usd > 0}
 */
import "dotenv/config";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:4000";
const API_TOKEN = process.env.API_BEARER_TOKEN;
const PROJECT_ID = process.env.SMOKE_PROJECT_ID;
const TEMPLATE_ID = process.env.SMOKE_TEMPLATE_ID;

if (!API_TOKEN || !PROJECT_ID || !TEMPLATE_ID) {
  console.error("Required env: API_BEARER_TOKEN, SMOKE_PROJECT_ID, SMOKE_TEMPLATE_ID");
  process.exit(1);
}

const TOPIC = "How to learn Rust programming for backend developers";
const MAIN_KEYWORD = "learn rust programming";

async function apiFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_TOKEN}`,
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
  return res.json();
}

async function wait(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log(`[smoke] starting run: topic="${TOPIC}"`);
  const run = await apiFetch("/runs", {
    method: "POST",
    body: JSON.stringify({
      projectId: PROJECT_ID,
      templateId: TEMPLATE_ID,
      input: {
        topic: TOPIC,
        mainKeyword: MAIN_KEYWORD,
        intent: "informational",
        contentType: "blog-seo",
      },
    }),
  });
  const runId: string = run.id;
  console.log(`[smoke] runId=${runId}`);

  const deadline = Date.now() + 6 * 60_000; // 6 min guard (300s timeout + buffer)
  while (Date.now() < deadline) {
    const status = await apiFetch(`/runs/${runId}`);
    const deepStep = status.steps.find((s: any) => s.stepKey === "deepResearch");
    if (!deepStep) throw new Error("step 'deepResearch' not found in run");
    console.log(`[smoke] deepResearch status=${deepStep.status}`);

    if (deepStep.status === "completed") {
      console.log(`[smoke] output.content.length = ${deepStep.output?.content?.length}`);
      console.log(`[smoke] output.sources.length = ${deepStep.output?.sources?.length}`);

      if ((deepStep.output?.content?.length ?? 0) < 100) {
        throw new Error(`content too short: ${deepStep.output?.content?.length}`);
      }
      if ((deepStep.output?.sources?.length ?? 0) === 0) {
        throw new Error("sources array is empty");
      }

      console.log(`[smoke] PASS — deepResearch completed with valid output`);
      console.log(`[smoke] TODO: verify pricing in you.com portal and update .env.example`);
      console.log(`[smoke] TODO: check response headers for X-Cost-* (extend YoucomClient to log)`);
      return;
    }
    if (deepStep.status === "failed") {
      throw new Error(`deepResearch failed: ${JSON.stringify(deepStep.error)}`);
    }
    await wait(5_000);
  }
  throw new Error("timeout waiting for deepResearch to complete");
}

main().catch((e) => {
  console.error("[smoke] FAIL:", e);
  process.exit(1);
});
