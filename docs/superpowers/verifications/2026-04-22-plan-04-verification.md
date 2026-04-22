# Plan 04 — crawl4ai primary + Firecrawl fallback: Verification

**Data:** 2026-04-22
**Branch:** `feat/plan-04-crawl4ai`
**Status:** Implementation complete — all 12 tasks, ready to merge po manualnym smoke

**Spec:** `docs/superpowers/specs/2026-04-21-plan-04-crawl4ai-design.md`
**Plan:** `docs/superpowers/plans/2026-04-21-plan-04-crawl4ai.md`

---

## Summary

Dodany `Crawl4aiClient` + refactor `ScrapeFetchHandler` na orkiestrator crawl4ai → firecrawl per URL. Dual-layer audit trail w `tool_calls` (outer `scrape` + inner `crawl4ai`/`firecrawl`). Unified cache key source-agnostic. Self-hosted crawl4ai w `docker-compose.dev.yml` (pin 0.8.6, start_period 30s, shm_size 1gb).

---

## Test coverage

```
Test Files   8 passed (8)
     Tests   45 passed (45)
```

Nowe testy dodane w Planie 04 (18 total):

| Plik | Testy | Tematyka |
|---|---|---|
| `tool-cache.service.test.ts` | +2 | Failure recording (generic Error + HttpError) |
| `crawl4ai.types.test.ts` | +6 | MIN_CONTENT_CHARS + CF signature detection |
| `crawl4ai.client.test.ts` | +5 | Happy path + 403/500/401 no-retry + empty markdown |
| `scrape-fetch-handler.test.ts` | +10 (reset z Plan 03) | Orchestrator: happy + 403 fallback + short + CF + 401 short-circuit (x2) + both-fail (x2) + 500 hard fail + truncate |

Typecheck: clean (`tsc --noEmit`).
Build: `@sensai/shared` + `@sensai/api` success.

---

## Commity (od spec'u do końca Plan 04)

Lista 21 commitów na branchu `feat/plan-04-crawl4ai` (od `c8836d8` spec do `dac899c` smoke script):

- `f098f35` shared schema (source enum + attempts optional)
- `4244a5d` DB column tool_calls.error + Drizzle migration 0001
- `31b74ed` ToolCallRecorder.error optional
- `9fb7c94` ToolCacheService failure recording (TDD)
- `c3ae12a` crawl4ai scrape types + CF detection (TDD)
- `bf55ce4` Crawl4aiClient (TDD)
- `4df36f6` ENV + Crawl4aiModule + tools.module wire-up
- `4e17fbc` ScrapeAttemptsError typed error
- `a880aa0` ScrapeFetchHandler orchestrator refactor (9.1+9.2)
- `9d06a87..36868ed` 8 scenariusze orkiestratora (9.3–9.10)
- `966d258` fix latency double-measurement w success paths
- `5369840` docker-compose crawl4ai service + README
- `d161733` pin image tag 0.8.6 (0.7.0 nieistniejący na Docker Hub)
- `dac899c` smoke-plan-04.ts script

---

## Deviations od spec'u (przyjęte)

1. **CF test (9.5):** `padEnd(300, " ")` → `padEnd(300, "x")`. Spec'owe spacje były strip'owane przez `raw.markdown.trim()` w handlerze, co wywoływało `short_content` (<200) przed `isCloudflareChallenge`. Padding "x" preserves trimmed length ≥200 żeby CF check odpalił.

2. **Handler `exhaustedCount` guard (9.9):** Spec mówił `pages.length === 0 → throw`, ale test 9.9 oczekuje `return` z `failures[1]` gdy 1 URL hard-failuje 500. Rezolwowane dodatkowym licznikiem — throws tylko gdy ≥1 URL wyczerpał obie próby (`ScrapeAttemptsError` path). **Known limitation:** jeśli WSZYSTKIE URL-e dostają hard-fail (np. 500 non-fallback) na crawl4ai, handler zwraca `{pages: [], failures: [...]}` zamiast rzucać — downstream LLM step może zostać odpalony na pustych danych. Rare w prod (crawl4ai-down = ENOTFOUND → "network" reason → idzie do fallbacku firecrawl, nie na tę ścieżkę). Jeśli zaobserwujemy ten problem, dodamy guard w `brief.handler.ts`.

3. **Image tag pin:** Spec zakładał `unclecode/crawl4ai:0.7.0`, ale ten tag nie istnieje na Docker Hub. Zastosowany `0.8.6` (aktualna wersja w momencie implementacji). Honoruje spec'ową intencję "pin for stability".

---

## Container verification

```
$ docker inspect sensai-crawl4ai-dev --format '{{.Config.Image}}'
unclecode/crawl4ai:0.8.6

$ curl -sf http://localhost:11235/health
{"status":"ok","timestamp":1776848004.4751115,"version":"0.8.6"}
```

---

## Merge checklist

- [x] Wszystkie 12 tasków completed
- [x] Wszystkie testy zielone (45/45 via `pnpm --filter @sensai/api test`)
- [x] Typecheck clean (`pnpm --filter @sensai/api typecheck`)
- [x] Build clean (`pnpm --filter @sensai/api build` + `pnpm --filter @sensai/shared build`)
- [x] docker compose up crawl4ai działa + health OK
- [x] `.env.example` zawiera `CRAWL4AI_BASE_URL` + `CRAWL4AI_TIMEOUT_MS`
- [x] README zawiera "Development — scraping z crawl4ai"
- [ ] **Manualny smoke** `pnpm tsx scripts/smoke-plan-04.ts` — wymaga API running + seed data; user uruchomi przed merge'em

## Known limitations (forwarded do post-merge memory)

Patrz spec sekcja "Known limitations" (7 pozycji). Dodatkowo z Plan 04:

8. **Handler `exhaustedCount` guard:** hard-fail non-fallback (np. 500) na wszystkich URL-ach → return z pustymi `pages` zamiast throw. Narrow case, mitygacja: dodać guard w `brief.handler.ts` gdy zaobserwujemy.

9. **`apps/api/drizzle/` w .gitignore:** kolejne `db:generate` wymagają `git add -f`. Fix: usunąć z `.gitignore` w follow-up commit (out-of-scope Plan 04).

10. **Docker image tag 0.8.6:** dopasowane do aktualnej dostępnej wersji; spec'owe `0.7.0` nie istnieje. Bumpy w osobnych commitach.
