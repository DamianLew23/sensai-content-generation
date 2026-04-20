# Plan 02 — Verification

**Date:** 2026-04-20
**Branch:** `feat/plan-02-tools-dataforseo`
**Plan:** `docs/superpowers/plans/2026-04-20-plan-02-tools-dataforseo.md`

## Smoke test results

End-to-end via curl against `http://localhost:8000` (API on port 8000, Postgres `sensai-postgres-dev`, Redis `sensai-redis-dev`).

### Run 1 — fresh keyword (`ai dla małych firm v2`)
- runId: `f8cb3e2e-7f0d-4748-8684-d153bde20f16`
- templateId: `0dfc1145-96db-46ac-b2b4-ddf5c30e5f7a` (Brief + research v1)
- Status after ~22s: **completed** (research=completed, brief=completed)
- `tool_calls`: 1 row, `from_cache=false`, `cost_usd=0.002`, `latency_ms=2059`
- `llm_calls`: 1 row, model `openai/gpt-5-mini`, prompt 1263 / completion 1485 tokens, `cost_usd=0.00328575`, `latency_ms=20271`
- `tool_cache`: 1 row, `ttl_days=7.00`, `items=8` (organic results)
- Brief output references PL-specific competition (RODO, no-code/low-code narzędzia, "polskie realia") — confirms SERP context reached the LLM and influenced angle.

### Run 2 — same keyword (cache HIT path)
- runId: `524bafdf-e313-4c7e-9797-77386755fa96`
- Status after ~17s: **completed** (5s faster — DataForSEO call skipped)
- `tool_calls`: 1 row, `from_cache=true`, `cost_usd=0`, `latency_ms=0`
- No new `tool_cache` row (re-used existing)
- Confirms `ToolCacheService.getOrSet` HIT path works end-to-end.

### Cost cap (not exercised in smoke test)
- `MAX_COST_PER_RUN_USD=5` set in `.env`. Total run cost ~$0.005 — far below cap.
- Cap-trip path verified by code review (`cc22996`); manual cap-trip test deferred (would require setting cap to e.g. `0.0001` and re-running).

### Unit tests
- `pnpm --filter @sensai/api test` → **13/13 PASS** in 1.73s.
  - 5 stable-stringify
  - 4 tool-cache.service
  - 4 dataforseo.client

## Issues observed (not blocking)

1. **First run failed with HTTP 401.** Initial DataForSEO password was wrong (operator used dashboard password instead of API access password from `https://app.dataforseo.com/api-access`). Resolved by updating `apps/api/.env` and restarting API. No code changes needed.
2. **BullMQ outer retry vs. p-retry's `AbortError`.** When DataForSEO returned 401, the `DataForSeoClient` correctly classified it as non-retryable via `AbortError(HttpError(401))`, but BullMQ's worker-level `attempts: 3` still retried the whole job 3 times — so 3 calls hit DataForSEO with 401. Cost impact zero (DataForSEO doesn't charge on 401), but wasted work. Plan 03 should consider catching `HttpError` with status 401/403 in worker and re-throwing as `UnrecoverableError`, analogous to `CostLimitExceededError` handling.
3. **Helper text "Wymagane dla szablonów z research SERP" in `apps/web/.../new/page.tsx`** is technically misleading — the form requires `mainKeyword` for ALL templates now (including "Brief only"). Code reviewer flagged this; cleanup deferred to Plan 04 with template-aware UI.

## Success criteria from plan

| # | Criterion | Result |
|---|-----------|--------|
| 1 | "Nowy run" → Brief + research → ~20-30s → brief in UI/API | ✅ ~22s first run, ~17s cached |
| 2 | tool_calls 1 row, from_cache=false, cost > 0 + tool_cache 1 row, expires_at = +7d | ✅ |
| 3 | Second run same keyword → tool_calls from_cache=true, cost=0; faster | ✅ 22s → 17s |
| 4 | `pnpm test` 13/13 PASS | ✅ |
| 5 | Cap test (manual MAX_COST_PER_RUN_USD=0.0001) | ⏭️ deferred (code path verified by review) |

## Acceptance

Plan 02 implementation **VERIFIED**. Branch `feat/plan-02-tools-dataforseo` ready for code review and merge.
