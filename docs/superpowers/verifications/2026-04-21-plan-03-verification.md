# Plan 03 Verification — 2026-04-21

**Plan:** `docs/superpowers/plans/2026-04-21-plan-03-scraping.md`
**Spec:** `docs/superpowers/specs/2026-04-21-plan-03-scraping-design.md`
**Branch:** `feat/plan-03-scraping`

## Smoke: end-to-end with real Firecrawl

**Run ID:** `3b1b0fef-dcc4-48bf-b964-a837eabe24e7`
**Keyword:** `linkedin outreach`
**Template:** `Brief + research + scrape` v1 (`fe4bf737-e98b-4065-87a0-6d8266c49a44`)

### Timeline
- POST /runs → pending → running
- SERP step (tool.serp.fetch): 5 s, 10 items returned from DataForSEO
- Status flipped to `awaiting_approval`, `currentStepOrder=2`, scrape step `requiresApproval=true`
- POST /runs/:id/steps/:stepId/resume with top 3 URLs — returned `{status: "running"}`
- Scrape step (tool.scrape): ~9 s (1 success + 2 failures short-circuited? no — 3 URLs ran; LinkedIn blocked 2)
- Brief step (llm.brief): ~25 s (LLM latency)
- Status: `completed` after **39 s total** (5 s SERP + 34 s scrape+brief)

### Scrape step output verify
```json
{
  "pages": [
    {
      "url": "https://www.cyfrowyprzedsiebiorca.pl/poradnik/outreach-marketing-na-linkedin",
      "title": "Czym jest outreach marketing na LinkedIn …",
      "rawLength": 1447,
      "truncated": false,
      "source": "firecrawl",
      "fetchedAt": "2026-04-21T10:10:50.072Z"
    }
  ],
  "failures": [
    { "url": "https://www.linkedin.com/...", "reason": "http_403", "httpStatus": 403 },
    { "url": "https://pl.linkedin.com/...", "reason": "http_403", "httpStatus": 403 }
  ]
}
```
**LinkedIn aggressively blocks scraping (HTTP 403).** Partial success path kicked in correctly: 1 page OK → step `completed`, failures[] carries the 2 blocked URLs with reason `http_403` and httpStatus `403`. Scrape step did not short-circuit (403 is not 401/402), so all 3 URLs were attempted.

### Brief output verify (prompt-level integration)
Generated brief references concrete, Polish-language content from the successfully scraped `cyfrowyprzedsiebiorca.pl` article — pillars include "gotowe polskojęzyczne sekwencje wiadomości", "ICP", "RODO". The `angle` is concrete (not generic), directly informed by competition content passed via `formatScrapeContext`. LLM producer: `openrouter`, model `openai/gpt-5-mini`.

### Cost breakdown
| Tool / LLM | Method / Model | from_cache | Cost USD | Latency ms |
|---|---|---|---|---|
| dataforseo | serp.organic.live | false | 0.002 | 4212 |
| firecrawl | scrape | false | 0.0015 | 1415 |
| openrouter | openai/gpt-5-mini | — | 0.00385575 | 25148 |
| **Total** | | | **$0.00736** | ~35 s active |

Prompt tokens: 1607. Completion tokens: 1727.

**Note:** Firecrawl `tool_calls` has only 1 row despite 3 URL attempts. Reason: `ToolCacheService.getOrSet` records via `ToolCallRecorder.record` only after the fetcher succeeds (cache write path). When `client.scrape` throws (e.g., 403), `getOrSet` re-throws without recording. Consequence: Firecrawl failures are **not** visible in `tool_calls`, only in `step.output.failures[]`. Cost observability is correct (no free failures charged), but count observability loses failure attempts. Acceptable for MVP; consider in Plan 04 if needed.

## Cache verify — second run with same keyword

**Run ID:** `776c3ecc-c16b-47a1-a964-4b6297652c53`
**Keyword:** `linkedin outreach` (same)

| Tool | Method | from_cache | Cost | Latency |
|---|---|---|---|---|
| dataforseo | serp.organic.live | **true** | 0 | 0 ms |
| firecrawl | scrape | **true** | 0 | 0 ms |

- SERP completed in 0 s (cache hit, 7 d TTL).
- Scrape step completed in ~1 s (cache hit for the 1 succeeded URL from run 1, 1 d TTL).
- Failures (LinkedIn 403) NOT cached — re-fetched each run and failed again. Same behavior: 1 page + 2 failures → step completed.
- Total run time: 32 s (LLM still the bottleneck, as expected — brief cached nothing).
- Total tool cost second run: **$0**. LLM: $0.004. Savings vs fresh: $0.0035 (47% of tool cost eliminated, 53% of total).

## 4xx fold-in verify (Task 11)

**Run ID:** `1821e82b-a16e-4b8e-888a-7af3f6e5146d` (accidental — ran with placeholder `fc-placeholder-for-plan03` before real key was pasted).

Firecrawl returned HTTP 401 "Unauthorized: Invalid token". Step outcome:

```json
{
  "status": "failed",
  "retryCount": 1,
  "error": {
    "code": "http_401",
    "attempt": 1,
    "name": "HttpError",
    "message": "HTTP 401: {\"success\":false,\"error\":\"Unauthorized: Invalid token\"}"
  }
}
```

- `retryCount = 1` and `attempt: 1` in error ⇒ worker caught on first attempt, BullMQ **did not retry**.
- `error.code = "http_401"` correctly serialized from `HttpError.code` field (Task 1 refactor).
- Fold-in branch `isHttp4xx` evaluated true → `throw new UnrecoverableError` respected by BullMQ's job failure handler.

**Confirmed:** 4xx non-429 errors terminate immediately (saves retries + cost). Without fold-in (Plan 02 baseline), BullMQ would have retried 3×.

**Historical note:** An earlier run (`91b894b8-...`) showed `attempt: 3`. Root cause: a stale API process from Task 8 smoke was still bound to port 8000 with the pre-Task-11 build. Killed the stale PID, rebuilt, and second test confirmed fold-in works. No code issue.

## NaN guard verify (Task 11)

**Code-level verification only** (not exercised with real env var). The guard logs a warning and early-returns when `!Number.isFinite(cap) || cap <= 0`. Reviewed during Task 11 spec review. Smoke did not intentionally set `MAX_COST_PER_RUN_USD="abc"` — too invasive for this pass.

## Template third seed verify

```
projectId: ed6676c9-8847-4121-bb96-356101da3872 (slug demo, from Plan 01)
"Brief only (MVP)" v1:         0a046807-bd23-463d-8410-2278caa1e5e0 (Plan 01 — unchanged)
"Brief + research" v1:         0dfc1145-96db-46ac-b2b4-ddf5c30e5f7a (Plan 02 — unchanged)
"Brief + research + scrape" v1: fe4bf737-e98b-4065-87a0-6d8266c49a44 (Plan 03 — new)
```

Steps for the new template:
- `research` → `tool.serp.fetch` auto:true
- `scrape` → `tool.scrape` auto:false (checkpoint, `requiresApproval=true`)
- `brief` → `llm.brief` auto:true

Seed is idempotent via `onConflictDoNothing` on `(name, version)`.

## Resume endpoint verify

- `POST /runs/:id/steps/:stepId/resume` accepted top 3 URLs from SERP → wrote to `pipeline_steps.input` → updated `pipeline_runs.status='running'` → enqueued step.
- Full response was `{...run, steps}` (same shape as GET /runs/:id).
- Validation paths (`run_not_awaiting`, `step_not_awaiting`, `step_out_of_order`, `urls_not_in_serp`) covered by 5 unit tests in `apps/api/src/tests/resume-validation.test.ts`. Not exercised with curl in this smoke.

## Test suite state

`pnpm --filter @sensai/api test` — **27 passing** (6 test files):
- 4 firecrawl.client (Plan 03 Task 3)
- 5 scrape-fetch-handler (Plan 03 Task 5)
- 5 resume-validation (Plan 03 Task 7)
- 4 dataforseo.client (Plan 02)
- 5 stable-stringify (Plan 02)
- 4 tool-cache.service (Plan 02)

## UI smoke (checkbox form)

Not exercised in this verification (API + curl only). Form is wired — `apps/web/src/app/runs/[id]/page.tsx` renders `ApproveScrapeForm` when `run.status === "awaiting_approval" && currentStep.type === "tool.scrape"`. Typecheck green. User-level UI smoke is a follow-up.

## Known behaviors / gotchas

1. **LinkedIn (and similar anti-bot sites) block Firecrawl via 403.** No fallback in Plan 03 — Plan 04 adds crawl4ai as primary + Firecrawl fallback, which may improve success rate. For now, operator picks URLs that are likely scrapable.
2. **Firecrawl failures are not recorded in `tool_calls`.** They only appear in `step.output.failures[]`. If operator needs to audit how many Firecrawl calls were attempted (for rate limit debugging), `tool_calls` undercounts. Consider Plan 04 fix: record failures too, with `cost_usd=0`.
3. **Cached scrape pages persist 1 day even if the underlying URL changes.** Not exercised here but a design constraint. `tool_cache.expires_at` is honored.
4. **`pnpm seed` is actually `pnpm db:seed` in this project** — plan document uses `pnpm seed`, actual script in `apps/api/package.json` is `db:seed`. Non-blocking; update plan doc in memory if noted.
5. **Stale API processes on port 8000.** When the agent-orchestrated smoke runs `start:dev`, they can leak. If the smoke seems to behave with old code, check `lsof -i :8000` and kill leftover PIDs before rebuild.

## Conclusion

Plan 03 end-to-end verified. New template produces briefs enriched with scraped competition content. Cache saves ~50% of tool cost on repeat keyword. 4xx fold-in correctly terminates on auth failures. Ready to merge to main.
