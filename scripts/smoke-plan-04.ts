#!/usr/bin/env tsx
/**
 * Plan 04 manual smoke test.
 *
 * Wymaga:
 * - Docker compose stack up (`docker compose -f docker-compose.dev.yml up -d`)
 * - API running (`pnpm --filter @sensai/api start:dev`)
 * - Seed data (`pnpm --filter @sensai/api db:seed`)
 * - ENV API_BASE_URL + API_BEARER_TOKEN
 *
 * Weryfikacja: keyword "linkedin outreach" powinien dać ≥2 URL-e z source="crawl4ai"
 * (vs Plan 03, gdzie LinkedIn URL-e lądowały w failures[] z http_403).
 */
import "dotenv/config";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:4000";
const API_TOKEN = process.env.API_BEARER_TOKEN;
if (!API_TOKEN) {
  console.error("API_BEARER_TOKEN required in env");
  process.exit(1);
}

const PROJECT_ID = "ed6676c9-8847-4121-bb96-356101da3872"; // demo (Plan 01 seed)
const TEMPLATE_ID = "fe4bf737-e98b-4065-87a0-6d8266c49a44"; // Brief+research+scrape v1 (Plan 03 seed)
const KEYWORD = "linkedin outreach";

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
  console.log("Starting run for keyword:", KEYWORD);
  const startRes = await apiFetch("/runs", {
    method: "POST",
    body: JSON.stringify({
      projectId: PROJECT_ID,
      templateId: TEMPLATE_ID,
      input: { topic: KEYWORD, mainKeyword: KEYWORD },
    }),
  });
  const runId = startRes.id;
  console.log("Run ID:", runId);

  // Wait for awaiting_approval
  let run: any;
  for (let i = 0; i < 60; i++) {
    run = await apiFetch(`/runs/${runId}`);
    if (run.status === "awaiting_approval") break;
    if (run.status === "failed") { console.error("Run failed:", run); process.exit(1); }
    await wait(1000);
  }
  if (run.status !== "awaiting_approval") { console.error("Timeout waiting for awaiting_approval"); process.exit(1); }

  // Pick top 3 SERP urls (including LinkedIn ones)
  const serpStep = run.steps.find((s: any) => s.type === "tool.serp.fetch");
  const serpItems = serpStep.output.items ?? [];
  const urls = serpItems.slice(0, 3).map((item: any) => item.url);
  console.log("Selected URLs:", urls);

  const scrapeStep = run.steps.find((s: any) => s.status === "pending" && s.requiresApproval);
  if (!scrapeStep) { console.error("No pending scrape step"); process.exit(1); }

  await apiFetch(`/runs/${runId}/steps/${scrapeStep.id}/resume`, {
    method: "POST",
    body: JSON.stringify({ input: { urls } }),
  });

  // Wait for completion
  for (let i = 0; i < 180; i++) {
    run = await apiFetch(`/runs/${runId}`);
    if (run.status === "completed" || run.status === "failed") break;
    await wait(1000);
  }
  if (run.status !== "completed") { console.error("Run not completed:", run.status); process.exit(1); }

  const scrapeOutput = run.steps.find((s: any) => s.type === "tool.scrape").output;
  const pages = scrapeOutput.pages;
  const failures = scrapeOutput.failures;

  console.log("\n=== SMOKE RESULT ===");
  console.log("Pages:", pages.map((p: any) => ({ url: p.url, source: p.source })));
  console.log("Failures:", failures.map((f: any) => ({ url: f.url, reason: f.reason, attempts: f.attempts?.length ?? 0 })));

  const crawl4aiPages = pages.filter((p: any) => p.source === "crawl4ai");
  console.log(`\ncrawl4ai success: ${crawl4aiPages.length}/${pages.length}`);
  if (crawl4aiPages.length === 0) {
    console.warn("⚠ Zero pages scraped via crawl4ai — sprawdź czy kontener crawl4ai jest up i działa.");
  } else {
    console.log("✓ crawl4ai faktycznie był używany");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
