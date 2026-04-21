# Plan 04 — crawl4ai primary + Firecrawl fallback: Design Document

**Data:** 2026-04-21
**Status:** Draft — do implementacji
**Poprzednik:** Plan 03 (Firecrawl + checkpoint URL selection) — COMPLETED, merged 2026-04-21
**Autor:** Wspólny design (user + Claude)

## Kontekst

Plan 03 dostarczył kompletny end-to-end scrape flow: template #3 "Brief + research + scrape" → SERP → checkpoint wyboru URL-i → Firecrawl scrape → brief LLM. Jedyne ograniczenie: Firecrawl blokuje na Cloudflare-protected sajtach (LinkedIn zwrócił 403 w smoke teście dla 2/3 URL-i). Plan 04 dokłada crawl4ai jako primary scraper z fallbackiem na Firecrawl, zgodnie z topologią w głównym design docu (`docs/superpowers/specs/2026-04-16-content-generation-app-design.md`).

Przy okazji domykamy audit trail: Firecrawl failures dziś lecą tylko do `step.output.failures[]`, nie do `tool_calls`. Od Planu 04 każda próba scrapera (per-URL, per-scraper) ma własny wpis w `tool_calls` z `cost_usd` i `error`.

## Cel

- Odblokować Cloudflare-protected sajty (LinkedIn/Medium/wybrane newsy) przez crawl4ai z headless browsera
- Zachować Firecrawl jako fallback dla przypadków których crawl4ai self-hosted nie łapie
- Zapewnić per-scraper audit trail w `tool_calls` dla debugowania fallbacków
- Self-host (zgodnie z oryginalnym design docem) — $0/miesiąc operacyjnie

## W zakresie

- Nowy tool module `apps/api/src/tools/crawl4ai/` (klient + errors + module + types, wzorzec z `firecrawl/`)
- `ScrapeFetchHandler` jako orkiestrator primary→fallback per URL
- Triggery fallbacku: HTTP `{403, 429, 503}`, Cloudflare challenge (content sygnatury), markdown `<200` znaków po trim, timeout 20s
- Unified cache key: `("scrape", "url", hash(url))` — source-agnostic
- `ScrapePage.source` → `z.enum(["crawl4ai", "firecrawl"])` (shared package)
- `ScrapeFailure.attempts[]` — optional array z trailem per-scraper próby
- `tool_calls.error` kolumna JSONB — rejestracja failures (dual-layer: outer `scrape` + inner per-scraper)
- Service `crawl4ai` w `docker-compose.dev.yml` (unclecode/crawl4ai:0.7.0, port 11235)
- ENV `CRAWL4AI_BASE_URL` (required), `CRAWL4AI_TIMEOUT_MS` (default 20000)
- Unit testy (mocki HTTP) + ręczny smoke `scripts/smoke-plan-04.ts`

## Poza zakresem (odłożone)

- Globalny `ZodError → BadRequestException` filter (follow-up z Plan 03)
- Helper text cleanup w `runs/new/page.tsx` (follow-up z Plan 03)
- Free-text URL input (scrape spoza SERP) (follow-up z Plan 03)
- Negative cache dla systematycznie padających URL-i
- Kolejne kroki LLM (outline/draft/edit/seo_check) — Plan 05+
- Seed drugiej wersji template'u — Plan 03/A Q5
- Bearer token auth do crawl4ai (potrzebne gdy wystawimy crawl4ai poza Tailscale)

## Decyzje (stan po brainstormie)

| Decyzja | Wybór | Uzasadnienie |
|---|---|---|
| Hosting crawl4ai | Self-hosted Docker | Spójne z oryginalnym design docem; $0/mies.; VPS CPX21 ma zapas RAM |
| Zakres planu | Scraper + audit trail failures | Audit w tool_calls ma realną wartość dla debugowania fallbacków |
| Triggery fallbacku | 403/429/503 + Cloudflare sygnatury + <200 chars + timeout | Literalnie wg design doc; wystarczająco szerokie bez maskowania błędów crawl4ai |
| Strategia cache | Unified per URL, source-agnostic | Cache to o zasobie, nie implementacji; eliminuje podwójne próby tego samego URL-a |
| Template | Bez zmian (tylko handler) | `tool.scrape` to kontrakt, wybór scrapera to implementation detail |
| Rejestracja failures | ToolCacheService rozszerzony + inner per-scraper | Dual-layer: outer dla cost cap/consistency, inner dla granularnego audit |
| crawl4ai timeout | 20s | Szybszy fail-over do Firecrawl; crawl4ai Playwright zwykle <10s |
| crawl4ai retries | 0 | Retry tego samego Playwright pipeline na tej samej stronie zwykle zawodzi ponownie |
| crawl4ai cost | `"0"` stała | Self-host = brak kosztu API; compute time już widoczne w `latency_ms` |
| Dev kontener | `docker-compose.dev.yml` | Spójność dev/prod, zero-friction setup |
| Testy | Unit mocki + ręczny smoke | Zgodność z wzorcem firecrawl/dataforseo; testcontainers overkill |
| Wersja image | `unclecode/crawl4ai:0.7.0` (pin) | Przewidywalność; bumpy świadome w osobnych commitach |

## Architektura

### Struktura plików

```
apps/api/src/
├── tools/
│   ├── crawl4ai/                         ★ NEW
│   │   ├── crawl4ai.client.ts            ★ HTTP client (fetch + timeout 20s, 0 retries)
│   │   ├── crawl4ai.errors.ts            ★ Crawl4aiApiError (empty markdown, etc.)
│   │   ├── crawl4ai.module.ts            ★ NestJS module
│   │   └── scrape.types.ts               ★ CLOUDFLARE_SIGNATURES, MIN_CONTENT_CHARS, isCloudflareChallenge()
│   ├── firecrawl/                        (bez zmian)
│   ├── http-error.ts                     (reuse z Plan 03)
│   ├── tool-cache.service.ts             ▲ rozszerzony o failure recording
│   └── tool-call-recorder.service.ts     ▲ rozszerzony o opcjonalne pole error
├── handlers/
│   └── scrape-fetch.handler.ts           ▲ orkiestrator primary→fallback
├── config/
│   └── env.ts                            ▲ +CRAWL4AI_BASE_URL, +CRAWL4AI_TIMEOUT_MS
├── db/
│   ├── migrations/                       ▲ +migration: ALTER tool_calls ADD error JSONB
│   └── schema/tool-calls.table.ts        ▲ +error JSONB nullable
└── app.module.ts                         ▲ import Crawl4aiModule

packages/shared/src/
└── schemas.ts                            ▲ ScrapePage.source enum, ScrapeFailure.attempts optional

docker-compose.dev.yml                    ▲ +service crawl4ai (0.7.0, port 11235)
.env.example                              ▲ +CRAWL4AI_BASE_URL=http://localhost:11235
scripts/smoke-plan-04.ts                  ★ NEW manualny smoke test
```

### Odpowiedzialności komponentów

**`Crawl4aiClient`**
- Thin HTTP wrapper dla `POST {baseUrl}/md`
- Timeout 20s via `AbortSignal.timeout(CRAWL4AI_TIMEOUT_MS)`
- **Zero retries** — fail-fast do fallbacku
- Błędy:
  - Status ≠ 2xx → `HttpError(status, body)` (reuse z Plan 03)
  - Status 200 + pusty markdown → `Crawl4aiApiError("empty markdown")`
  - Timeout → natywny `AbortError` (propagowany, classifyReason mapuje na `"timeout"`)

**`ScrapeFetchHandler`** (orkiestrator)
- Zachowuje serial-probe + p-limit(3) z Plan 03
- `fetchSingle(url)` — unified cache lookup → fetcher orkiestruje crawl4ai → fallback → Firecrawl
- Short-circuit 401/402 działa niezależnie dla każdego scrapera (auth error to operator problem)
- Zapisuje **inner per-scraper tool_calls** bezpośrednio przez `ToolCallRecorder.record()`
- Zwraca `ScrapePage` z `source` wskazującym na scraper który odniósł sukces

**`ToolCacheService`** (rozszerzenie)
- `getOrSet` nadal zwraca z cache lub woła fetcher
- Nowość: gdy fetcher throwuje, rejestruje **outer** `tool_calls` z `error: { reason, httpStatus? }` i `cost_usd: "0"`, potem re-throw
- Side-effect — consumerzy dostają audit failures gratis (przyda się dla DataForSEO 5xx w przyszłości)

**`ToolCallRecorder`** (rozszerzenie)
- `RecordInput.error?: { reason: string; httpStatus?: number }` — opcjonalne
- Zapisuje do nowej kolumny `tool_calls.error JSONB`

### Flow `ScrapeFetchHandler.fetchSingle(url)`

```
1. cache.getOrSet(key=("scrape", "url", hash(url)), fetcher=scrapeWithFallback)
2. scrapeWithFallback():
   a. try crawl4ai.scrape(url):
      - HttpError 401/402        → throw (short-circuit batch)
      - HttpError {403,429,503}  → recordInner("crawl4ai", FAIL); goto (b)
      - AbortError (timeout 20s) → recordInner("crawl4ai", FAIL); goto (b)
      - empty markdown           → recordInner("crawl4ai", FAIL); goto (b)
      - markdown <200 chars      → recordInner("crawl4ai", FAIL); goto (b)
      - isCloudflareChallenge    → recordInner("crawl4ai", FAIL); goto (b)
      - inne (5xx non-503, network) → recordInner + throw (NO fallback, hard fail)
      - sukces                   → recordInner("crawl4ai", SUCCESS); return page z source="crawl4ai", costUsd="0"
   b. try firecrawl.scrape(url):
      - HttpError 401/402        → throw (short-circuit batch)
      - sukces                   → recordInner("firecrawl", SUCCESS); return page z source="firecrawl", costUsd="0.0015"
      - błąd                     → recordInner("firecrawl", FAIL); throw
```

Fetcher zwraca `{ result: ScrapePage, costUsd, latencyMs }` gdzie `ScrapePage` zawiera `source`, a `costUsd` jest kosztem zwycięskiego scrapera (0 gdy crawl4ai, 0.0015 gdy Firecrawl). To jest koszt scalony w outer tool_call — inner rows mają per-scraper koszt oddzielnie.

### Dual-layer audit trail

Przy fallbacku crawl4ai→firecrawl na jednym URL-u `tool_calls` dostaje 3 wpisy:

```
tool=crawl4ai,  method=scrape, params_hash=h1, cost_usd=0,      error={reason:"cf_challenge"},  from_cache=false
tool=firecrawl, method=scrape, params_hash=h1, cost_usd=0.0015, error=null,                     from_cache=false
tool=scrape,    method=url,    params_hash=h2, cost_usd=0.0015, error=null,                     from_cache=false
```

- **Outer row** (`tool=scrape`) — agreguje koszt dla `checkCostCap`, spójnie z DataForSEO (1 call = 1 row)
- **Inner rows** — answer "który scraper zawiódł i dlaczego"

`params_hash` różni się bo:
- Outer używa klucza unified cache: `hash({url})` dla `tool=scrape, method=url`
- Inner używa klucza per-scraper: np. `hash({url, formats:["markdown"], onlyMainContent:true})` dla firecrawl

To zamierzone — każda warstwa ma swój deterministyczny identyfikator.

### Zmiany w shared (`packages/shared/src/schemas.ts`)

```ts
export const ScrapePage = z.object({
  url: z.string().url(),
  title: z.string(),
  markdown: z.string(),
  rawLength: z.number().int().nonnegative(),
  truncated: z.boolean(),
  source: z.enum(["crawl4ai", "firecrawl"]),   // ← literal → enum
  fetchedAt: z.string().datetime(),
});

export const ScrapeFailure = z.object({
  url: z.string().url(),
  reason: z.string(),
  httpStatus: z.number().int().optional(),
  attempts: z.array(z.object({                  // ← NEW optional
    source: z.enum(["crawl4ai", "firecrawl"]),
    reason: z.string(),
    httpStatus: z.number().int().optional(),
  })).optional(),
});
```

Backward compat: istniejące runy Plan 03 mają `source: "firecrawl"` (podzbiór enum) i brak `attempts` (field optional).

### Cloudflare detection

```ts
// apps/api/src/tools/crawl4ai/scrape.types.ts
export const MIN_CONTENT_CHARS = 200;
export const CLOUDFLARE_SIGNATURES = [
  "Just a moment...",
  "cf-chl-",
  "Attention Required! | Cloudflare",
] as const;

export function isCloudflareChallenge(markdown: string): boolean {
  return CLOUDFLARE_SIGNATURES.some(s => markdown.includes(s));
}
```

Limitation: string match, nie challenge headers. Jeśli Cloudflare zmieni UI copy, detekcja pęknie — akceptowalne ryzyko, mitygacja przez monitoring `source` w produkcyjnych runach.

## Infra

### docker-compose.dev.yml — nowy service

```yaml
crawl4ai:
  image: unclecode/crawl4ai:0.7.0
  container_name: sensai-crawl4ai-dev
  restart: unless-stopped
  ports:
    - "${CRAWL4AI_PORT:-11235}:11235"
  shm_size: "1gb"
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:11235/health"]
    interval: 10s
    timeout: 5s
    retries: 5
    start_period: 30s
```

`shm_size: 1gb` — Chromium wymaga shared memory; default 64MB powoduje crash Playwrighta.

### ENV

```ts
// apps/api/src/config/env.ts
CRAWL4AI_BASE_URL: z.string().url(),
CRAWL4AI_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
```

```
# .env.example
CRAWL4AI_BASE_URL=http://localhost:11235
```

Brak klucza API — self-host, zero auth. Gdy kiedyś crawl4ai wyjdzie poza Tailscale network, dodamy bearer token (poza scope).

### Migracja DB

```sql
-- apps/api/src/db/migrations/00XX_tool_calls_error.sql
ALTER TABLE tool_calls ADD COLUMN error JSONB;
```

Drizzle: update w `apps/api/src/db/schema/tool-calls.table.ts` — nullable kolumna, istniejące wiersze `NULL` (success-path historyczny). Generacja: `pnpm --filter @sensai/api db:generate`.

## Testy

### Unit (Vitest)

**1. `crawl4ai-client.test.ts`** (~5 testów):
- Happy path: response 200 z markdown → `Crawl4aiScrapeResult` z url/markdown/title
- 5xx non-503: HttpError wrap, zero retries (spy na `fetch` = 1 call)
- 403: HttpError z `code: "http_403"`
- Timeout: AbortError propagowany
- Empty markdown: `Crawl4aiApiError`

**2. `scrape-fetch-handler.test.ts`** (rozszerzenie):
- crawl4ai sukces na wszystkich URL-ach → Firecrawl nie wywołany (spy)
- crawl4ai 403 → fallback do Firecrawl, `source: "firecrawl"`
- crawl4ai <200 chars → fallback, success
- crawl4ai Cloudflare challenge → fallback, success
- crawl4ai 401 na pierwszym URL → batch abort, Firecrawl nie wywołany
- Firecrawl 401 po fallbacku z crawl4ai → batch abort
- crawl4ai fail + Firecrawl fail → `failures[].attempts.length === 2`
- Mix: 3 URL-e, crawl4ai OK / crawl4ai→firecrawl / obie fail → `pages.length===2, failures.length===1`
- Inner tool_calls recording: verify `ToolCallRecorder.record` wywołany dla każdej próby z właściwym `tool`

**3. `tool-cache.service.test.ts`** (rozszerzenie):
- Fetcher throw → `record` wywołany z `error`, potem re-throw (side-effect verification)

### Smoke manualny

`scripts/smoke-plan-04.ts`:
- Uruchamia run na keyword `"linkedin outreach"` (ten sam co Plan 03)
- Sprawdza: ≥2 URL-e z LinkedIn mają `source: "crawl4ai"` i nie są w `failures[]`
- Wymaga: `docker compose -f docker-compose.dev.yml up -d`, API running, seed data

### CI

Bez zmian — unit tests nie wymagają crawl4ai kontenera (mocki HTTP).

## Seed i template'y

Bez zmian. Template #3 (`fe4bf737-e98b-4065-87a0-6d8266c49a44`) zostaje z identycznym `steps_def` — zmiana implementacji handlera jest przezroczysta dla templatki.

## Dokumentacja

Aktualizacja `README.md` sekcji "Development":
- "Uruchom crawl4ai: `docker compose -f docker-compose.dev.yml up -d crawl4ai`"
- "API wymaga `CRAWL4AI_BASE_URL` w env (dev: `http://localhost:11235`)"
- Uwaga o RAM: crawl4ai + Playwright = ~1-2GB w pik przy 3 równoległych scrapach

## Known limitations

1. **Timeouts globalne** — crawl4ai 20s dla wszystkich; hosty które zawsze >20s a są scrape-able → false negative fallback. Mitygacja: per-host timeouty (Plan 05+)
2. **Cloudflare detection via string match** — CF zmieni UI copy → detekcja pęknie. Mitygacja: monitoring `ScrapePage.source` distribution
3. **Docker healthcheck zwodny** — `/health` może zwrócić 200 gdy Playwright crashuje. Mitygacja: obserwacja `tool_calls` error distribution
4. **RAM pressure na prodzie** — 3 concurrent chromium na 4GB VPS może swapować. Mitygacja: zmniejszenie p-limit(3) → p-limit(2) jeśli problem
5. **`ScrapeFailure.attempts[]` optional** — runy Plan 03 nie mają pola, frontend musi robić `attempts ?? []`
6. **Brak bearer auth do crawl4ai** — OK w Tailscale network, niebezpieczne jeśli wystawimy publicznie
7. **Fallback jest sekwencyjny per URL** — brak parallelizacji *wewnątrz* jednego URL-a (crawl4ai + Firecrawl równolegle). Zamierzone: Firecrawl jest fallback tylko gdy crawl4ai zawiedzie, nie race

## Metryki sukcesu

1. Smoke test na keyword `"linkedin outreach"`: ≥2 URL-e z LinkedIn mają `source: "crawl4ai"`, `failures[]` pustsze niż w Plan 03
2. Po smoke: query `SELECT source, COUNT(*) FROM (...) GROUP BY source` pokazuje dystrybucję crawl4ai vs firecrawl
3. Koszt runa smoke ≤ koszt runa Plan 03 (jeśli crawl4ai pełni rolę primary, oszczędzamy $0.0015 per URL)
4. Wszystkie unit testy zielone; `pnpm --filter @sensai/api test` nie wymaga crawl4ai kontenera

## Rollback plan

Gdyby crawl4ai okazał się niestabilny w produkcji:
1. Set ENV `CRAWL4AI_BASE_URL` na niedostępny URL — wszystkie próby crawl4ai fail-fast (ECONNREFUSED) → Firecrawl fallback zawsze zadziała
2. Lub: feature flag `USE_CRAWL4AI=false` (nie w MVP scope — dodamy jak zajdzie potrzeba)
3. Lub: git revert → wracamy do Plan 03 handlera; migracja `tool_calls.error` zostaje (nullable, no-op dla starszych kodów)
