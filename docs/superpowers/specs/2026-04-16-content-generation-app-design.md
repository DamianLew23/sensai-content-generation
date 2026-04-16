# Sens.ai Content Generation App — Design Document

**Data:** 2026-04-16
**Status:** Draft — do implementacji
**Autor:** Wspólny design (user + Claude)

## Cel

Wewnętrzna aplikacja do generowania treści na własne strony WWW. Bazuje na wieloetapowym procesie z kursu Sens.ai (Content Generation Expert). Automatyzuje pipeline generacji z miksem etapów auto i checkpointów wymagających akceptacji, z wieloma asynchronicznymi zapytaniami do LLM-ów i narzędzi zewnętrznych (DataForSEO, crawl4ai, Firecrawl).

## Wymagania funkcjonalne

- Wieloetapowy pipeline z wariantami (typ treści determinuje zestaw kroków)
- Mix etapów automatycznych i wymagających zatwierdzenia człowieka (checkpoints)
- Konfiguracja per projekt/strona (tone of voice, guideline'y, preferowane modele LLM)
- Input: pojedynczy temat (batch w późniejszej iteracji)
- Output: tekst przechowywany w aplikacji + eksport do MD/DOCX/HTML
- Tracking kosztów (LLM + narzędzia) per run, projekt, miesiąc
- Live podgląd postępu runu (streaming chunków LLM)
- Edycja pośrednich outputów przy checkpointach

## Wymagania niefunkcjonalne

- **Skala:** solo, ~50 artykułów/mies., ad-hoc batche później
- **Odporność:** podstawowa — restart backendu nie gubi runów (reconcile z DB)
- **Deployment:** frontend localhost, backend na VPS (Hetzner CPX21, 4GB RAM, 3 vCPU)
- **Bezpieczeństwo:** solo user, auth minimalna (bearer token), połączenie localhost↔VPS przez Tailscale

## Stack technologiczny

| Warstwa        | Wybór                                                                           |
| -------------- | ------------------------------------------------------------------------------- |
| Frontend       | Next.js (App Router), Tailwind, shadcn/ui, TanStack Query, Zod, react-hook-form |
| Backend        | NestJS, BullMQ, Drizzle ORM                                                     |
| Baza           | Postgres 16 (self-hosted)                                                       |
| Queue          | Redis (self-hosted, tylko kolejka)                                              |
| LLM Client     | Vercel AI SDK + `@ai-sdk/openai-compatible`                                     |
| LLM Router     | OpenRouter (multi-provider: OpenAI/Anthropic/Google)                            |
| Scraping       | crawl4ai (primary) + Firecrawl (fallback)                                       |
| SEO data       | DataForSEO                                                                      |
| Reverse proxy  | nginx (istniejący na VPS)                                                       |
| Tunneling      | Tailscale (localhost ↔ VPS)                                                     |
| Konteneryzacja | Docker Compose                                                                  |
| Testy          | Vitest, testcontainers, Playwright (1 smoke test)                               |
| Logging        | Pino                                                                            |
| Repo           | Monorepo (pnpm workspaces)                                                      |

## Topologia

```
Localhost (Next.js dev)
   │ HTTPS przez Tailscale
   ▼
VPS (Hetzner CPX21):
   nginx → NestJS (API + BullMQ workers w jednym procesie)
              │
              ├─▶ Postgres (state of truth)
              ├─▶ Redis (queue only)
              └─▶ crawl4ai (Docker, same network)

Outbound: OpenRouter, DataForSEO, Firecrawl
```

### Uzasadnienie topologii

- **Jeden proces NestJS (API + workers)** — upraszcza deploy i debugging na start; rozdzielenie dodamy gdy skala wymusi
- **Redis tylko pod kolejkę** — Postgres pozostaje źródłem prawdy; reconcile po restarcie odzyskuje stan
- **CPX21 4GB + swap 4GB** — wystarczy przy założeniach (crawl4ai to główny zjadacz RAM, pik ~3-3.5 GB)
- **Tailscale** — zero otwartych portów, auto-TLS, free tier pokrywa potrzeby

## Model danych

### Tabele

**`projects`**

- `id`, `slug`, `name`
- `config JSONB` — tone_of_voice, target_audience, guidelines, defaultModels{research,brief,draft,edit,seo}, promptOverrides
- `created_at`

**`pipeline_templates`**

- `id`, `name`, `version`
- `steps_def JSONB` — array `[{ key, type, auto, model? }]`

**`pipeline_runs`**

- `id`, `project_id`, `template_id`, `template_version`
- `input JSONB` — topic, keyword, intent, content type
- `status` — `pending` | `running` | `awaiting_approval` | `completed` | `failed` | `cancelled`
- `current_step_order`, `created_at`, `finished_at`

**`pipeline_steps`**

- `id`, `run_id`, `step_key`, `step_order`, `type`
- `status` — `pending` | `running` | `completed` | `failed` | `skipped`
- `requires_approval` (kopiowane z templatki przy starcie)
- `input JSONB`, `output JSONB`, `error JSONB`
- `retry_count`, `started_at`, `finished_at`

**`llm_calls`**

- `id`, `run_id`, `step_id`, `attempt`
- `provider`, `model`
- `prompt_tokens`, `completion_tokens`, `cost_usd`, `latency_ms`
- `created_at`

**`tool_calls`**

- Analogiczna struktura do `llm_calls`, dla DataForSEO/crawl4ai/Firecrawl
- `tool`, `method`, `params_hash`, `from_cache`, `cost_usd`

**`tool_cache`**

- `id`, `tool`, `method`, `params_hash` (unique), `result JSONB`
- `created_at`, `expires_at`
- TTL konfigurowalne per metoda (SERP: 7d, keyword data: 30d, scrape: 1d)

### Kluczowe decyzje

- **JSONB dla elastyczności** — `project.config`, `steps_def`, inputy/outputy kroków; walidacja Zod na boundary
- **Wersjonowanie templatek** — stare runy trzymają `template_version`; zmiana templatki nie wpływa na trwające runy
- **Brak osobnej tabeli `artifacts`** — finalny artykuł to output ostatniego kroku; eksport on-demand
- **Brak wersjonowania outputów kroków** na start (można retry'ować, co nadpisuje output; historia w `llm_calls`)

## Silnik pipeline'u

### Flow

1. `POST /runs` z `project_id`, `template_id`, `input` → utworzenie `pipeline_run` + N rekordów `pipeline_steps` (pending)
2. Enqueue pierwszego step'a do BullMQ queue `pipeline-steps`
3. Worker (concurrency=3) pobiera job, ładuje kontekst (run + project + previous outputs), dispatchuje do StepHandlera
4. Handler zwraca `StepResult` → update `step.output`, `step.status`, zapis `llm_calls` / `tool_calls`
5. Orchestrator decyduje o następnym kroku:
   - Koniec pipeline'u → `run.status='completed'`
   - Następny krok ma `requires_approval=true` → `run.status='awaiting_approval'`, **nie** enqueue'ujemy
   - W przeciwnym wypadku → enqueue następnego step'a
6. Akceptacja checkpointu: `POST /runs/:id/steps/:stepId/approve` z opcjonalnym edytowanym outputem → update + enqueue następny

### StepHandler — kontrakt

Plugin-like registry: `step.type` → handler.

```ts
interface StepHandler {
  type: string;
  execute(ctx: StepContext): Promise<StepResult>;
}

interface StepContext {
  run: PipelineRun;
  step: PipelineStep;
  project: Project;
  previousOutputs: Record<string, unknown>; // po step.key
  services: {
    llm: LLMClient;
    dataforseo: DataForSeoService;
    scraping: ScrapingService;
  };
}

interface StepResult {
  output: unknown;
  llmCalls?: LLMCallLog[];
  toolCalls?: ToolCallLog[];
}
```

Typy kroków na start: `tool.dataforseo.serp`, `tool.dataforseo.keywords`, `tool.scrape`, `llm.brief`, `llm.outline`, `llm.draft`, `llm.edit`, `llm.seo_check`.

### Retry

- BullMQ: `attempts: 3`, `backoff: { type: 'exponential', delay: 5000 }`
- Idempotencja wymaga się od handlerów
- Po 3 faili: `step.status='failed'`, `run.status='failed'`, `step.error` ze strukturą + stack
- Ręczny retry z UI: `POST /runs/:id/steps/:stepId/retry` → zeruje error, enqueue

### Live updates

- Worker publikuje do Redis pub/sub: `run:${id}:update` przy zmianie statusu kroku
- SSE endpoint `/api/runs/:id/events` subskrybuje i strumieniuje do klienta
- Dla streamingu LLM — chunki na `run:${id}:step:${stepId}:chunk`

### Reconcile przy starcie backendu

1. Load `pipeline_runs` w stanie `running` lub `awaiting_approval`
2. Dla `running`: sprawdź aktywne joby BullMQ; enqueue ponownie jeśli brak
3. Zaloguj co wznowiono

## Warstwa LLM

### Hierarchia wyboru modelu

```
step.model (pipeline_templates.steps_def.model)
   ↓ (jeśli brak)
project.config.defaultModels[taskClass]
   ↓ (jeśli brak)
env.DEFAULT_MODEL
```

Klasy zadań: `research`, `brief`, `draft`, `edit`, `seo`.

### LLMClient

Wrapper nad AI SDK. Każde wywołanie:

1. Rozwiązuje model (powyższa hierarchia)
2. Wywołuje AI SDK (`generateText` / `generateObject` / `streamText`)
3. Liczy koszt z lokalnej tabeli cenników (cache z OpenRouter `/models`)
4. Zapisuje wpis w `llm_calls` (z `run_id`, `step_id`, `attempt`)
5. Zwraca wynik handlerowi

### Prompty

- W TS plikach w repo (`apps/api/src/prompts/*.ts`) — kontrola wersji, testy
- Template jako obiekt: `{ system(project), user(input, previous), schema?: ZodSchema }`
- Per-project overrides w `project.config.promptOverrides[stepKey]`
- Structured output (`generateObject` + Zod) dla kroków ze strukturą (brief, outline, SEO analysis)
- Streaming dla długich outputów (draft, edit)

## Warstwa narzędzi zewnętrznych

### Struktura

```
apps/api/src/tools/
├── dataforseo/   (SERP, keyword ideas, keyword data)
├── crawl4ai/     (primary scrape)
├── firecrawl/    (fallback scrape)
└── scraping/     (unified orchestrator)
```

### ScrapingService — primary + fallback

1. Próba crawl4ai (timeout 30s, 1 retry)
2. Trigger fallbacku: HTTP 403/429/503, Cloudflare challenge, content <200 chars, timeout
3. Próba Firecrawl
4. Błąd `ScrapingError` ze strukturą obu prób

Result zawsze zawiera `source: 'crawl4ai' | 'firecrawl'` i `attempts[]`.

### tool_cache

- Identyczne zapytania → cached result (klucz: `(tool, method, params_hash)`)
- TTL per metoda (SERP: 7d, keyword: 30d, scrape: 1d)
- Override `freshOnly: true` wymusza nowe
- Chroni przed duplikatami kosztów przy iteracjach promptów

### Error handling

- Transient (5xx, 429, network) → `p-retry` w kliencie (3x expo)
- Empty result → handler decyduje (czasem valid, czasem fallback)
- Permanent (4xx non-429) → log + `step.error`

## Obsługa błędów i obserwowalność

### Bezpieczniki kosztów

- `MAX_COST_PER_RUN_USD=5` — orchestrator sumuje `llm_calls.cost_usd + tool_calls.cost_usd` przed każdym LLM/tool call; przekroczenie → `step.error='cost_limit_exceeded'`
- Twardy dzienny limit `MAX_COST_PER_DAY_USD=20` — agregacja za ostatnie 24h; przekroczenie → kolejka wstrzymana do ręcznej zgody
- Alert przy >70% limitu dziennego (log teraz, email/Telegram później)

### Logging

- Pino (JSON structured), NestJS adapter
- Context binding: każdy log ma `run_id` i `step_id`
- Levels: `info` milestones, `warn` retry/fallback, `error` fail
- Docker logs + grep na start; Sentry dodamy gdy potrzeba

### Health checks

- `GET /health` — Postgres, Redis, OpenRouter
- Cron co 1 min → curl; alert po 3 kolejnych failach
- Opcjonalnie Uptime Kuma (self-host)

### Backupy

- `pg_dumpall` codziennie → VPS + external (Hetzner Storage Box lub B2)
- Retencja: 7 dni + 4 tygodnie
- Redis nie backupujemy (ulotny stan kolejki)
- Konfiguracja w git

### Idempotencja (fundament)

- LLM calls logowane przed zapisem outputu → duplikat kosztuje 1 call, ale nie gubi danych
- Tool calls read-only → bezpieczne
- DB writes w transakcji „update step + enqueue next"

## Frontend

### Widoki

```
/                       Dashboard (ostatnie runy, koszty miesiąca)
/projects               Lista
/projects/new
/projects/:slug
/projects/:slug/config
/projects/:slug/runs
/templates              Lista szablonów
/templates/:id/edit
/runs/new               Nowy run (projekt + template + topic)
/runs/:id               Główny widok pracy
/costs                  Podgląd kosztów
/settings
```

### Widok runu (`/runs/:id`)

- Lewa kolumna: timeline kroków (status, czas, koszt, ikona)
- Prawa kolumna: switchable panels — Output / Prompt / LLM calls / Input
- Aktywny checkpoint: preview + edytor + buttons (Approve / Regenerate)
- Aktywny streaming krok (draft): tekst pojawia się live z chunków SSE

### Komunikacja z backendem

- Bezpośredni fetch do NestJS (bez BFF)
- `NEXT_PUBLIC_API_URL` wskazuje na Tailscale DNS backendu
- Bearer token w env (`NEXT_PUBLIC_API_TOKEN`)
- TanStack Query hooks per resource (`useRuns`, `useRun(id)`, `useStartRun`, ...)
- SSE hook `useRunEvents(runId)` → invalidate cache na event

## Struktura repo

```
sensai-content-generation/
├── apps/
│   ├── web/              Next.js (localhost)
│   └── api/              NestJS (VPS)
├── packages/
│   └── shared/           Zod schematy wspólne + typy
├── infra/
│   ├── docker-compose.yml
│   └── nginx/            Konfiguracja reverse proxy
├── docs/
│   └── superpowers/specs/
└── package.json          pnpm workspaces
```

## Strategia testów

### Poziomy

1. **Zod + TypeScript** — wszystkie boundary walidowane (darmowa warstwa ochronna)
2. **Unit testy StepHandlerów** (Vitest) — mockowane serwisy, najwięcej wartości
3. **Integration testy orchestratora** (Vitest + testcontainers) — prawdziwy Postgres/Redis, mockowane zewnętrzne; happy path + checkpoint + reconcile
4. **Snapshot testy outputów** — dla zmian, nie jakości
5. **E2E (Playwright)** — 1 smoke test (start → checkpoint → approve → completed → eksport)
6. **Kontraktowe testy narzędzi** — ręczny `scripts/smoke-tools.ts` (1 prawdziwe zapytanie do każdego API)

### Evaluacja promptów

- Na start: ręczna, rejestr w arkuszu (prompt → output → ocena 1-5)
- Langfuse/Promptfoo — dopiero gdy zaczniesz serio iterować w produkcji

### CI

- GitHub Actions na push: lint + unit + integration
- E2E i smoke-tools: ręcznie

## Plan wprowadzania odporności

W kolejności:

1. **Dzień 1:** Zod schematy, Vitest setup, reconcile przy starcie, health endpoint
2. **Przy pierwszym handlerze:** wzorzec testu, bezpieczniki kosztów per-run
3. **Przy MVP orchestratora:** integration testy (happy + checkpoint + reconcile)
4. **Przed prod-use:** backupy Postgres + dzienny limit kosztów
5. **Gdy UI stabilne:** smoke E2E
6. **Gdy iteracje promptów intensywne:** Langfuse/Promptfoo

## Rozszerzenia do rozważenia później (poza scopem v1)

- **Batch input** — wiele tematów naraz, kolejka artykułów
- **Research-first flow** — seed keyword → klastrowanie → lista tematów → wybór → generacja
- **RAG / vector store** — pgvector w Postgresie, baza wiedzy per projekt
- **Generowanie obrazków** — DALL-E/Flux przez OpenRouter lub osobny provider
- **Publikacja automatyczna** — integracje CMS (WordPress REST, headless)
- **Fallback modeli** — native OpenRouter `models: [primary, fallback]`
- **Prompt caching** (Anthropic/OpenAI) — redukcja kosztów przy powtarzalnych systemach
- **Evaluacja outputów (Langfuse)** — eksperymenty, A/B promptów
- **Osobny worker process** — gdy skala wymusi rozdzielenie
- **Sentry / APM** — gdy debugging stanie się bolesny

## Koszty (przy ~50 artykułów/mies., mix modeli)

| Składnik                                       | Koszt               |
| ---------------------------------------------- | ------------------- |
| VPS Hetzner CPX21                              | ~$7 (istniejący)    |
| Self-host Postgres, Redis, crawl4ai            | $0                  |
| Firecrawl (fallback only, low usage)           | ~$0-16              |
| LLM (mix: tanie na research, premium na draft) | ~$15                |
| DataForSEO                                     | ~$2.50              |
| Backup storage (Hetzner Box / B2)              | ~$1-2               |
| **Łącznie**                                    | **~$25-45 / mies.** |

## Otwarte pytania (do późniejszych iteracji)

- Dokładny flow pobierania danych z crawl4ai (strategie odnośnie SERP, głębokości scrapa) — wymaga opracowania
- Struktura `pipeline_templates` dla różnych typów contentu (blog, landing page, product description) — zaczynamy od jednego szablonu „Blog SEO", kolejne dodamy po pierwszym cyklu end-to-end
- Konkretne prompty per krok — to już kwestia implementacji i eksperymentu, nie architektury
