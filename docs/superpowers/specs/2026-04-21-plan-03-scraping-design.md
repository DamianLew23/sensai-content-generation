# Plan 03 — Scraping (Firecrawl) + pierwszy checkpoint

**Data:** 2026-04-21
**Status:** design
**Branch docelowy:** `feat/plan-03-scraping`

## Cel

Wprowadzić do pipeline'u warstwę scrapingu (wyłącznie Firecrawl w tej iteracji) oraz pierwszy checkpoint — krok w którym user ręcznie wybiera URL-e do scrapowania spośród wyników SERP z poprzedniego kroku. Efektem jest nowy szablon „Brief + research + scrape" v1, w którym LLM dostaje w prompcie nie tylko tytuły/opisy z SERP, ale też pełną treść (markdown) 1–5 wybranych stron konkurencji.

## Kontekst

- Plan 02 dostarczył warstwę toolingu (`apps/api/src/tools/<tool>/`, `ToolCacheService`, `ToolCallRecorder`, `stableStringify`) i szablon „Brief + research" (SERP → LLM brief).
- Schema (`pipelineSteps.requiresApproval`) i orchestrator (`OrchestratorService.advance` — pauza na `awaiting_approval`) już obsługują checkpointy od Planu 01. Brakuje jedynie endpointu resume i UI.
- Główny design doc przewiduje docelowo crawl4ai (primary) + Firecrawl (fallback) z unified `ScrapingService`. **W tym planie robimy tylko Firecrawl.** Crawl4ai + strategia fallback → Plan 04.

## Decyzje (stan po brainstormie)

| Temat | Decyzja |
|---|---|
| Dostawca scrapingu | Firecrawl `/v2/scrape` (primary, bez fallbacku) |
| Integracja w szablon | Nowy szablon „Brief + research + scrape" v1 (seed #3); stare szablony bez zmian |
| Granulacja cache | Per-URL: `method="scrape"`, `params={url, formats, onlyMainContent}` |
| Liczba URL-i | Hard cap 5 (walidacja w DTO + UI); default 3 pre-checked w UI |
| Selekcja URL-i | Tylko z SERP items z poprzedniego kroku (brak free-text) |
| Format treści | Markdown (Firecrawl default) |
| Per-page cap | 15 000 znaków (truncate + `truncated: true` w output) |
| Współbieżność scrapa | `p-limit(3)` w handlerze |
| Częściowy sukces | Dopuszczony — `{ pages, failures }`. Wszystkie fail → krok `failed`. 401/402 → short-circuit (nie skrobujemy reszty) |
| Koszt Firecrawla | Hardcoded `FIRECRAWL_COST_PER_SCRAPE = "0.0015"` (źródło: firecrawl.dev/pricing, 2026-04-21) |
| Endpoint resume | `POST /runs/:id/steps/:stepId/resume` body `{ input: { urls: string[] } }` |
| Fold-iny z Planu 02 | A) BullMQ 4xx → `UnrecoverableError`; B) NaN guard w `checkCostCap` |
| Odroczone | crawl4ai + fallback, template-aware UI, helper text cleanup, custom URL spoza SERP, summaryzacja scrapów, live-update run status |

## Architektura

### Nowe pliki (API)

```
apps/api/src/
├── tools/
│   ├── http-error.ts              # WYCIĄGAMY z dataforseo/dataforseo.errors.ts
│   │                              #   + dodajemy pole `code = "http_${status}"`
│   └── firecrawl/
│       ├── firecrawl.client.ts
│       ├── firecrawl.errors.ts    # FirecrawlApiError (domain-level, nie HTTP)
│       ├── firecrawl.module.ts
│       └── scrape.types.ts
├── handlers/
│   └── scrape-fetch.handler.ts
└── seed/
    └── seed.ts                    # modyfikacja: trzeci upsertTemplate
```

### Refactor z Planu 02

`HttpError` jest obecnie w `tools/dataforseo/dataforseo.errors.ts`. Wyciągamy do `tools/http-error.ts` i rozszerzamy o pole `code`:

```ts
// apps/api/src/tools/http-error.ts
export class HttpError extends Error {
  public readonly code: string;
  constructor(public readonly status: number, public readonly body: string) {
    super(`HTTP ${status}: ${body.slice(0, 200)}`);
    this.name = "HttpError";
    this.code = `http_${status}`;     // NOWE — worker serializuje do error.code
  }
}
```

`dataforseo.errors.ts` re-eksportuje z nowej lokalizacji (zero-cost dla istniejących importów w DataForSeoClient):

```ts
export { HttpError } from "../http-error";
export class DataForSeoApiError extends Error { ... }   // bez zmian
```

### Nowe pliki (shared + web)

```
packages/shared/src/
└── schemas.ts                     # + ResumeStepDto, ScrapePage, ScrapeResult

apps/web/src/app/runs/[id]/
├── page.tsx                       # modyfikacja: branch awaiting_approval
└── approve-scrape-form.tsx        # nowy client component
```

### Modyfikowane pliki

| Plik | Zmiana |
|---|---|
| `apps/api/src/handlers/handlers.module.ts` | rejestracja `ScrapeFetchHandler` w `STEP_HANDLERS` |
| `apps/api/src/tools/dataforseo/dataforseo.errors.ts` | re-export `HttpError` z nowej lokalizacji `tools/http-error.ts` |
| `apps/api/src/handlers/brief.handler.ts` | opcjonalny odczyt `previousOutputs.scrape` |
| `apps/api/src/prompts/brief.prompts.ts` | nowa sekcja „Content from top pages" (aktywna gdy scrape obecny) |
| `apps/api/src/runs/runs.controller.ts` | nowy endpoint `POST :id/steps/:stepId/resume` |
| `apps/api/src/runs/runs.service.ts` | metoda `resume(runId, stepId, dto)` z walidacją |
| `apps/api/src/orchestrator/pipeline.worker.ts` | gałąź 4xx (≠429) → `UnrecoverableError` + NaN guard w `checkCostCap` |
| `apps/api/src/config/env.ts` | `FIRECRAWL_API_KEY`, `FIRECRAWL_BASE_URL` |
| `.env.example` | dopiski |
| `apps/api/src/seed/seed.ts` | trzeci `upsertTemplate` |

### Nowy krok: `tool.scrape`

**Typ:** `tool.scrape` (registered w `StepRegistry`).

**Input (z `step.input`, wypełniany przez resume endpoint):**

```ts
{ urls: string[] }   // 1..5 URL-i; walidacja na resume endpoint
```

**Output:**

```ts
{
  pages: Array<{
    url: string;
    title: string;
    markdown: string;      // ≤ 15 000 znaków
    rawLength: number;     // długość przed truncate
    truncated: boolean;
    source: "firecrawl";
    fetchedAt: string;     // ISO
  }>;
  failures: Array<{
    url: string;
    reason: string;        // "timeout" | "http_4xx" | "http_5xx" | "network"
    httpStatus?: number;
  }>;
}
```

**Typy Zod** w `packages/shared/src/schemas.ts`:

```ts
export const ScrapePage = z.object({
  url: z.string().url(),
  title: z.string(),
  markdown: z.string(),
  rawLength: z.number().int().nonnegative(),
  truncated: z.boolean(),
  source: z.literal("firecrawl"),
  fetchedAt: z.string().datetime(),
});
export type ScrapePage = z.infer<typeof ScrapePage>;

export const ScrapeFailure = z.object({
  url: z.string().url(),
  reason: z.string(),
  httpStatus: z.number().int().optional(),
});
export type ScrapeFailure = z.infer<typeof ScrapeFailure>;

export const ScrapeResult = z.object({
  pages: ScrapePage.array(),
  failures: ScrapeFailure.array(),
});
export type ScrapeResult = z.infer<typeof ScrapeResult>;
```

## Data flow end-to-end

```
1. POST /runs body { templateId: <brief+research+scrape>, input: { mainKeyword } }
2. RunsService.start: tworzy 3 kroki (stepOrder 1,2,3).
   Step 2 (tool.scrape) ma requiresApproval=true (z template, "auto": false).
   Enqueue step 1.
3. Worker: step 1 "tool.serp.fetch" → output.items[] (SERP top 10).
4. advance(): widzi step 2 requiresApproval → run.status=awaiting_approval, currentStepOrder=2.
   NIE enqueue.
5. Web GET /runs/:id zwraca run + steps (z outputem kroku 1).
6. UI, widząc awaiting_approval, renderuje ApproveScrapeForm:
   - checkboxy per item SERP
   - top 3 pre-checked
   - licznik X/5, disabled gdy X=5
7. User submit: POST /runs/:id/steps/:stepId/resume
   body { input: { urls: ["...", "...", "..."] } }
8. API: walidacja → step.input=body.input → run.status=running → enqueueStep(runId, stepId).
9. Worker: step 2 "tool.scrape" czyta ctx.step.input.urls
   → p-limit(3) × Firecrawl /v2/scrape per URL, przez ToolCacheService.getOrSet
   → { pages: [...], failures: [...] }
10. advance(): step 3 nie requiresApproval → enqueue.
11. Worker: step 3 "llm.brief" czyta previousOutputs.research + previousOutputs.scrape.
    Prompt zawiera sekcję „Content from top pages" z markdownem per URL.
12. advance(): koniec → run.status=completed.
```

## Resume endpoint

**Ścieżka:** `POST /runs/:id/steps/:stepId/resume`
**Auth:** Bearer (jak reszta `/runs/*`).
**Body (Zod `ResumeStepDto`):**

```ts
export const ResumeStepDto = z.object({
  input: z.object({
    urls: z.string().url().array().min(1).max(5),
  }),
});
export type ResumeStepDto = z.infer<typeof ResumeStepDto>;
```

### Walidacja (w kolejności)

| # | Warunek | Niespełnienie |
|---|---|---|
| 1 | `step.id = :stepId` i `step.runId = :id` | 404 |
| 2 | `run.status = "awaiting_approval"` | 409 `{ code: "run_not_awaiting" }` |
| 3 | `step.status = "pending"` oraz `step.requiresApproval = true` | 409 `{ code: "step_not_awaiting" }` |
| 4 | `step.stepOrder = run.currentStepOrder` | 409 `{ code: "step_out_of_order" }` |
| 5 | Odczytaj output kroku `stepOrder - 1`, parsuj jako `SerpResult`. Każdy URL z body musi być w `items[].url`. Brak duplikatów. | 400 `{ code: "urls_not_in_serp", invalid: [...] }` |

### Akcja

Jedna transakcja:

```sql
UPDATE pipeline_steps SET input = $1 WHERE id = :stepId;
UPDATE pipeline_runs SET status = 'running' WHERE id = :id;
```

Następnie (poza transakcją — BullMQ) `orchestrator.enqueueStep(runId, stepId)`.

### Response

200 OK — `{ run, steps }` (ten sam shape co `GET /runs/:id`).

## UI

### `apps/web/src/app/runs/[id]/page.tsx`

Branch:

```
if (run.status === "awaiting_approval" && currentStep?.type === "tool.scrape") {
  const serpItems = priorSteps.find(s => s.stepOrder === currentStep.stepOrder - 1)?.output.items ?? [];
  render <ApproveScrapeForm run={run} step={currentStep} serpItems={serpItems} />;
}
```

### `ApproveScrapeForm` (client component)

- Checkbox per SERP item — label: `#{position} {title} — {url}` + truncated description (2 linie).
- Stan: `Set<string>` (URL). Na mount pre-check: `items.slice(0, 3).map(i => i.url)`.
- Licznik: „Wybrano X z 5". Gdy `size === 5`, pozostałe checkboxy `disabled`.
- Submit → `fetch('/api/runs/:id/steps/:stepId/resume', { method: 'POST', body: JSON.stringify({ input: { urls: [...selected] } }) })` przez proxy web→api z bearer tokenem (jak istniejące `POST /runs`).
- Na sukces: `router.refresh()` (App Router).
- Błędy walidacji z API → `<p role="alert">` z user-friendly komunikatem per kod:
  - `urls_not_in_serp` → „Wybrane URL-e muszą być z listy wyników SERP"
  - `run_not_awaiting` / `step_not_awaiting` → „Ten krok został już wykonany — odśwież stronę"

**Brak:** live-update statusu (polling/SSE). User odświeża ręcznie — Plan 04+.

## Error handling

### Firecrawl client

- `p-retry({ retries: 3 })` z eksponencjalnym backoffem 500/1000/2000 ms.
- Retry na: HTTP 5xx, HTTP 429, network errors (ECONNRESET/ETIMEDOUT), timeout abort.
- AbortError (zatrzymuje p-retry) na: HTTP 4xx ≠ 429.
- Timeout per request: `AbortSignal.timeout(30_000)` (30 s, zgodnie z design doc).
- Mapowanie:
  - 401 → `HttpError(401, "Firecrawl unauthorized — check FIRECRAWL_API_KEY")` → AbortError
  - 402 → `HttpError(402, "Firecrawl payment required — top up credits")` → AbortError
  - 429 → retry
  - ≥500 → retry
  - Inne 4xx → `HttpError(status, ...)` → AbortError

Struktura `HttpError` (po refactorze wyżej): `{ name: "HttpError", status: number, code: "http_${status}", message }`.

**Założenie o p-retry:** `AbortError(originalError)` jest przez `p-retry` rozwijany do `originalError` przy rethrow (zgodnie z docs `p-retry`). Worker łapie więc bezpośrednio `HttpError`, nie wrapper `AbortError`. Weryfikujemy w teście `firecrawl-client.test.ts` („throws AbortError on 401") — asercja: `expect(promise).rejects.toMatchObject({ name: "HttpError", status: 401 })`.

### Scrape handler

Per-URL try/catch; pętla z `p-limit(3)`:

```
for (url of input.urls) {
  try {
    const page = await cache.getOrSet({ url, ...fetcher });
    pages.push(page);
  } catch (err) {
    if (err instanceof HttpError && (err.status === 401 || err.status === 402)) throw err;
    failures.push({ url, reason: classify(err), httpStatus: err?.status });
  }
}
if (pages.length === 0) throw new Error("All scrape URLs failed");
return { output: { pages, failures } };
```

Zachowania:
- Całkowity fail → krok `failed` (standardowa ścieżka worker).
- 401/402 na jakimkolwiek URL-u → natychmiastowy throw (nie marnujemy kredytów / nie uderzamy 5× z tym samym błędem).
- Częściowy sukces → krok `completed` z `output.failures[]` do logów/DB.

### BullMQ 4xx fold-in (`pipeline.worker.ts`)

W catch:

```ts
const isHttp4xx =
  err?.name === "HttpError" &&
  typeof err.status === "number" &&
  err.status >= 400 && err.status < 500 &&
  err.status !== 429;

const isFinal = isCostCap || isHttp4xx || attempt >= maxAttempts;

// ... zapis step.status/error jak dotychczas ...

if (isCostCap || isHttp4xx) throw new UnrecoverableError(err.message);
```

`error.code` zachowuje się jak dziś: jeśli klient ustawi `err.code = "http_401"`, taki trafia do `pipeline_steps.error.code`.

### NaN guard (`checkCostCap`)

```ts
const cap = parseFloat(env.MAX_COST_PER_RUN_USD);
if (!Number.isFinite(cap) || cap <= 0) {
  this.logger.warn({ raw: env.MAX_COST_PER_RUN_USD }, "MAX_COST_PER_RUN_USD invalid, cost cap disabled");
  return;
}
```

Warn logowany przy każdym wywołaniu (tj. przed każdym krokiem), bo `checkCostCap` jest idempotentny i nie ma w nim stanu per-process.

## Cost

- Firecrawl `/v2/scrape` nie zwraca kosztu w response. Stała w kliencie:
  ```ts
  export const FIRECRAWL_COST_PER_SCRAPE = "0.0015";
  // Source: https://firecrawl.dev/pricing — pay-as-you-go /v2/scrape, as of 2026-04-21
  ```
- `ToolCallRecorder.record` odbiera `costUsd: "0"` dla cache-hit i `costUsd: "0.0015"` dla cache-miss per URL.
- Przy `MAX_COST_PER_RUN_USD=5` i per-run max scrape = 5 URL × 0.0015 = $0.0075 — pomijalne w limicie; LLM jest dominujący.

## Nowe zależności

`apps/api/package.json` → `dependencies`:
- `p-limit` — concurrency control w scrape handlerze (p-limit(3)). Node-native alternatywy (`Promise.all` na chunkach) są mniej elastyczne przy short-circuit z 401/402.
- `p-retry` — już jest (`^8.0.0`, z Planu 02).

## Env

```ts
// apps/api/src/config/env.ts
FIRECRAWL_API_KEY: z.string().min(1),                              // required
FIRECRAWL_BASE_URL: z.string().url().default("https://api.firecrawl.dev"),
```

```
# .env.example
# Firecrawl (https://firecrawl.dev/app/api-keys)
FIRECRAWL_API_KEY=fc-...
FIRECRAWL_BASE_URL=https://api.firecrawl.dev
```

API nie startuje bez `FIRECRAWL_API_KEY` (analogicznie do `DATAFORSEO_PASSWORD`).

## Seed (trzeci szablon)

```ts
// apps/api/src/seed/seed.ts
const briefResearchScrape = await upsertTemplate(db, "Brief + research + scrape", 1, {
  steps: [
    { key: "research", type: "tool.serp.fetch", auto: true },
    { key: "scrape",   type: "tool.scrape",     auto: false },  // checkpoint
    { key: "brief",    type: "llm.brief",       auto: true },
  ],
});
console.log(`    "${briefResearchScrape.name}" v${briefResearchScrape.version}: ${briefResearchScrape.id}`);
```

Idempotentne (`onConflictDoNothing` na `(name, version)`); `pnpm seed` 2× z rzędu nie duplikuje.

## LLM brief — wariant z kontekstem scrape

- `brief.handler.ts` czyta `previousOutputs.scrape` jako opcjonalne. Gdy obecne — parsuje przez `ScrapeResult.safeParse()` i przekazuje `pages[]` do prompt buildera.
- `brief.prompts.ts` w builderze doda sekcję (tylko gdy `pages` niepusty):
  ```
  ## Treść stron konkurencji (top wybrane przez operatora)

  ### {page.title}
  URL: {page.url}

  {page.markdown}
  ```
  Sekcja separowana od SERP items (która zostaje bez zmian). Brak `pages` = zachowanie identyczne jak w „Brief + research" v1 (backward compat).

## Testy

**Vitest, `apps/api/src/tests/`** — plan ~14 testów.

### `firecrawl-client.test.ts` (4)
- scrapes a URL and returns markdown (mock fetch)
- throws AbortError on 401 (nie retryuje)
- throws AbortError on 402 (nie retryuje)
- retries on 5xx and succeeds on third attempt

### `scrape-fetch-handler.test.ts` (5)
- scrapes all urls and returns pages[] (mock cache + client)
- partial failure: 2 ok + 1 timeout → pages[2], failures[1]
- all fail → throws
- 401 on first url → short-circuits without scraping others
- truncates markdown over 15k chars and sets truncated=true, rawLength correct

### `resume-endpoint.test.ts` (5)
- 200 happy path, updates step.input and enqueues
- 409 run_not_awaiting (run.status=running)
- 409 step_not_awaiting (step.status=completed)
- 400 urls_not_in_serp (random URL)
- 400 validation (urls.length=0 / >5)

**Integracja:** bez testu automatycznego z realnym Firecrawlem. Smoke weryfikacyjny na dev DB z 1 keywordem — opis w `docs/superpowers/verifications/2026-04-21-plan-03-verification.md`.

## Rollout order

1. Env + Firecrawl client + `firecrawl-client.test.ts`
2. Zod types w shared + `ScrapeFetchHandler` + `scrape-fetch-handler.test.ts`
3. Resume endpoint (controller + service + DTO) + `resume-endpoint.test.ts`
4. Web: `ApproveScrapeForm` + branch w `runs/[id]/page.tsx`
5. Fold-iny: BullMQ 4xx + NaN guard (`pipeline.worker.ts`)
6. `brief.handler.ts` + `brief.prompts.ts` — wariant z kontekstem scrape
7. Seed trzeci szablon
8. Verification doc + smoke run

Każdy krok → osobny commit, push na branch, testy zielone przed kolejnym.

## Ograniczenia odłożone do Plan 04

- crawl4ai (primary) + Firecrawl (fallback) w `ScrapingService`
- Triggery fallbacku: 403/429/503, Cloudflare challenge, content < 200 chars, timeout
- Live-update runa (polling / SSE) — dziś user `router.refresh()` ręcznie
- Free-text URL input (scrape URL-i spoza SERP)
- Template-aware UI w `/runs/new`
- Per-project override: locationCode, languageCode, depth SERP, cap scrape
- Summaryzacja scrapów przed `llm.brief` (jeśli jakość / rozmiar kontekstu wymusi)
