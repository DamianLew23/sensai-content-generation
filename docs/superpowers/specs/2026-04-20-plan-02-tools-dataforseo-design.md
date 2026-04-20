# Plan 02 — Warstwa narzędzi (DataForSEO SERP) — Design

**Data:** 2026-04-20
**Branch źródłowy:** `main` (po zmergowaniu `feat/plan-01-foundation`)
**Plan-rodzic w speku produktu:** `docs/superpowers/specs/2026-04-16-content-generation-app-design.md` sekcja "Warstwa narzędzi zewnętrznych"
**Decyzja zakresu:** Plan 02 = framework tools + DataForSEO SERP. Plan 03 = scraping (crawl4ai + Firecrawl). Plan 04 = pełna integracja w nowych szablonach.

## Cel

Wprowadzić warstwę narzędzi zewnętrznych do pipeline'u — zaczynając od DataForSEO SERP — w sposób, który:

1. Daje widoczny end-to-end efekt (nowy szablon "Brief + research" produkujący brief wzbogacony o top 10 wyników SERP dla głównego słowa kluczowego).
2. Ustawia powtarzalny wzorzec (cache key, `tool_calls`, retry, koszt) który Plan 03 będzie mógł skopiować dla scrapingu.
3. Dorzuca lekki bezpiecznik kosztów per-run (dług z Planu 01).

## Założenia wejściowe (potwierdzone z user-em)

- DataForSEO konto aktywne, kredyty są — credentials wkleimy do `.env.local`.
- SERP zapytanie: hardcoded `location_code=2616` (PL), `language_code="pl"`, `depth=10`, metoda `/serp/google/organic/live/regular`.
- Feed do brief promptu: `title + url + description (snippet)` z top 10 wyników.
- Powstaje **drugi** szablon "Brief + research" v1; istniejący "Brief only (MVP)" v1 zostaje bez zmian (coexistence).
- Cost cap "lite": hard limit per-run sprawdzany przed każdym handlerem, brak osobnego UI (błąd pokazuje się w standardowym widoku step.error).
- Testy minimalne: Vitest setup + unit testy dla `DataForSeoClient` i `ToolCacheService`. Handler i pipeline integration odraczamy.
- Architektura: cienka warstwa — każdy tool = własny moduł NestJS, bez generycznego `ToolClient` interface'u (YAGNI do n=2).

## Co świadomie NIE robimy w Planie 02

- Per-tool TTL configurable (hardcoded 7d w handlerze SERP).
- `freshOnly` override (brak usecase).
- Generic `ToolClient<TParams, TResult>` (czekamy na drugi tool).
- UI badge "served from cache" w widoku run-a.
- Cron czyszczący expired cache entries (przyrost ~KB/dzień, problem na za rok).
- Per-day cost cap `MAX_COST_PER_DAY_USD` (per-run wystarczy dla v1).
- Sandbox mode DataForSEO (konto ma kredyty).
- Template-aware UI w "Nowy run" (różne pola dla różnych szablonów) — odraczamy do Planu 04.
- Crawl4ai i Firecrawl — Plan 03.

## Architektura

### Drzewo plików (nowe / zmodyfikowane)

```
apps/api/src/
├── tools/                              [NEW]
│   ├── tools.module.ts                  (eksportuje ToolCacheService + DataForSeoModule)
│   ├── tool-cache.service.ts            (read-through cache nad tabelą tool_cache)
│   ├── tool-call-recorder.service.ts    (wstawia row do tool_calls po każdym callu)
│   ├── stable-stringify.ts              (deterministyczna serializacja paramsów)
│   └── dataforseo/
│       ├── dataforseo.module.ts
│       ├── dataforseo.client.ts         (basic auth + p-retry + cost extraction)
│       └── serp.types.ts                (zod: SerpFetchParams, SerpItem, SerpResult; SerpResultSchema reused by BriefHandler)
├── handlers/
│   ├── serp-fetch.handler.ts            [NEW] (type: "tool.serp.fetch")
│   ├── brief.handler.ts                 [MOD] (czyta previousOutputs.research jeśli jest)
│   └── handlers.module.ts               [MOD] (rejestruje SerpFetchHandler)
├── prompts/
│   └── brief.prompt.ts                  [MOD] (przyjmuje opcjonalny serpContext)
├── orchestrator/
│   ├── pipeline.worker.ts               [MOD] (cost-cap check przed handlerem)
│   └── cost-limit-exceeded.error.ts     [NEW]
├── config/
│   └── env.ts                           [MOD] (DATAFORSEO_LOGIN, _PASSWORD, MAX_COST_PER_RUN_USD)
├── seed/
│   └── seed.ts                          [MOD] (dorzuca template "Brief + research" v1)
└── tests/                               [NEW]
    ├── tool-cache.service.test.ts
    └── dataforseo.client.test.ts

apps/web/src/app/runs/new/page.tsx       [MOD] (mainKeyword required + komunikat walidacji)

apps/api/vitest.config.ts                [NEW]
apps/api/package.json                    [MOD] (skrypt "test", devDeps: vitest)
package.json (root)                      [MOD] (turbo task "test")

.env.example                             [MOD] (DATAFORSEO_LOGIN/PASSWORD, MAX_COST_PER_RUN_USD)
```

### Data flow runu z templatem "Brief + research"

```
UI "Nowy run" → POST /runs (templateId="brief+research", input={topic, mainKeyword})
RunsService.start():
  - tworzy run (status=pending)
  - tworzy 2 steps: (order 0) tool.serp.fetch key="research", (order 1) llm.brief key="brief"
  - enqueue step 0
↓
PipelineWorker.process(stepId)
  ├── load step, run, project, previousOutputs
  ├── CostCapGuard.check(runId)
  │     ↳ SUM(llm_calls.cost_usd::numeric) + SUM(tool_calls.cost_usd::numeric) WHERE run_id
  │     ↳ jeśli >= MAX_COST_PER_RUN_USD → throw CostLimitExceededError (no retry)
  ├── handler = registry.resolve("tool.serp.fetch") = SerpFetchHandler
  ├── handler.execute(ctx)
  │   └── ToolCacheService.getOrSet({ tool, method, params, ttl, fetcher, recorder })
  │       ├── HIT (expiresAt > now): return cached.result, recorder.write(fromCache=true, cost=0)
  │       └── MISS:
  │           ├── DataForSeoClient.serpOrganicLive(params)  ← p-retry 3x na 5xx/429
  │           ├── INSERT tool_cache ON CONFLICT DO UPDATE  ← ttl = 7d
  │           └── recorder.write(fromCache=false, cost=raw.tasks[0].cost, latencyMs)
  ├── UPDATE pipeline_steps SET output=..., status=completed
  └── orchestrator.advance() → enqueue step 1
↓
PipelineWorker.process(step 1)
  ├── CostCapGuard.check(runId)  ← teraz suma uwzględnia tool_calls
  ├── handler = BriefHandler
  ├── handler.execute(ctx)
  │   ├── ctx.previousOutputs.research = { items: [{title,url,description,position}, ...] }
  │   ├── llm.generateObject({ system, prompt: briefPrompt.user(input, serpContext), schema })
  │   └── return { output: BriefOutput }
  └── orchestrator.advance() → run.status = completed
↓
UI poll /runs/:id → render brief
```

## Komponenty — szczegóły

### `DataForSeoClient` (`tools/dataforseo/dataforseo.client.ts`)

```ts
@Injectable()
export class DataForSeoClient {
  private readonly base = "https://api.dataforseo.com/v3";
  private readonly auth: string;

  constructor(env: Env) {
    this.auth = Buffer.from(`${env.DATAFORSEO_LOGIN}:${env.DATAFORSEO_PASSWORD}`).toString("base64");
  }

  async serpOrganicLive(params: SerpFetchParams): Promise<SerpRawResponse> {
    const body = [{
      keyword: params.keyword,
      location_code: params.locationCode,
      language_code: params.languageCode,
      depth: params.depth,
    }];
    return pRetry(
      () => this.post("/serp/google/organic/live/regular", body),
      {
        retries: 3, factor: 2, minTimeout: 1000,
        shouldRetry: (e) => e instanceof HttpError && (e.status >= 500 || e.status === 429),
      },
    );
  }

  private async post(path: string, body: unknown): Promise<any> {
    const res = await fetch(this.base + path, {
      method: "POST",
      headers: { "Authorization": `Basic ${this.auth}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new HttpError(res.status, await res.text());
    const json = await res.json();
    if (json.status_code !== 20000) throw new DataForSeoApiError(json.status_code, json.status_message);
    return json;
  }
}
```

- Retry: tylko transient (5xx, 429, network). 4xx non-429 → throw natychmiast.
- Cost extraction: `raw.tasks[0].cost` (string z DataForSEO, np. `"0.0006"`) — używamy as-is do `tool_calls.cost_usd`.
- Surowy JSON nie wycieka poza moduł — handler dostaje już znormalizowane `SerpItem[]`.

### `ToolCacheService` (`tools/tool-cache.service.ts`)

```ts
@Injectable()
export class ToolCacheService {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly recorder: ToolCallRecorder,
  ) {}

  async getOrSet<T>(opts: {
    tool: string;
    method: string;
    params: unknown;
    ttlSeconds: number;
    runId: string;
    stepId: string;
    fetcher: () => Promise<{ result: T; costUsd: string; latencyMs: number }>;
  }): Promise<T> {
    const paramsHash = sha256(stableStringify(opts.params));
    const now = new Date();

    const [hit] = await this.db.select().from(toolCache).where(
      and(
        eq(toolCache.tool, opts.tool),
        eq(toolCache.method, opts.method),
        eq(toolCache.paramsHash, paramsHash),
        gt(toolCache.expiresAt, now),
      ),
    );
    if (hit) {
      await this.recorder.record({
        runId: opts.runId, stepId: opts.stepId, tool: opts.tool, method: opts.method,
        paramsHash, fromCache: true, costUsd: "0", latencyMs: 0,
      });
      return hit.result as T;
    }

    const t0 = Date.now();
    const fresh = await opts.fetcher();
    const expiresAt = new Date(now.getTime() + opts.ttlSeconds * 1000);

    await this.db.insert(toolCache).values({
      tool: opts.tool, method: opts.method, paramsHash,
      result: fresh.result as any, expiresAt,
    }).onConflictDoUpdate({
      target: [toolCache.tool, toolCache.method, toolCache.paramsHash],
      set: { result: fresh.result as any, createdAt: now, expiresAt },
    });

    await this.recorder.record({
      runId: opts.runId, stepId: opts.stepId, tool: opts.tool, method: opts.method,
      paramsHash, fromCache: false, costUsd: fresh.costUsd, latencyMs: fresh.latencyMs ?? Date.now() - t0,
    });
    return fresh.result;
  }
}
```

- Concurrent same-key requests: dwa równoległe miss-y → dwa fetche → drugi insert collide-uje na unique index `(tool, method, params_hash)` i robi update. Drugi fetch jest "marnotrawiony" ale nie crashuje. Akceptowalne dla v1 (serializacja przez pessimistic lock = przedwczesna optymalizacja).
- `stableStringify`: własna funkcja w `tools/stable-stringify.ts` (~10 linii, sortuje klucze rekursywnie, obsługuje primitives/array/object). Bez external deps.
- `sha256`: `node:crypto` `createHash("sha256")` → `digest("hex")`.

### `ToolCallRecorder` (`tools/tool-call-recorder.service.ts`)

Cienki wrapper na `INSERT INTO tool_calls`. Wydzielony żeby `ToolCacheService` nie dotykał innej tabeli niż własnej, i żeby unit test cache'u nie musiał mockować dwóch obiektów drizzle.

### `SerpFetchHandler` (`handlers/serp-fetch.handler.ts`)

```ts
@Injectable()
export class SerpFetchHandler implements StepHandler {
  readonly type = "tool.serp.fetch";

  constructor(
    private readonly client: DataForSeoClient,
    private readonly cache: ToolCacheService,
  ) {}

  async execute(ctx: StepContext): Promise<StepResult> {
    const input = ctx.run.input as RunInput;
    if (!input.mainKeyword) {
      throw new Error("mainKeyword is required for tool.serp.fetch");
    }

    const params: SerpFetchParams = {
      keyword: input.mainKeyword,
      locationCode: 2616,
      languageCode: "pl",
      depth: 10,
    };

    const result = await this.cache.getOrSet<SerpResult>({
      tool: "dataforseo",
      method: "serp.organic.live",
      params,
      ttlSeconds: 7 * 86400,
      runId: ctx.run.id,
      stepId: ctx.step.id,
      fetcher: async () => {
        const t0 = Date.now();
        const raw = await this.client.serpOrganicLive(params);
        const cost = raw.tasks?.[0]?.cost?.toString() ?? "0";
        const items: SerpItem[] = (raw.tasks?.[0]?.result?.[0]?.items ?? [])
          .filter((it: any) => it.type === "organic")
          .slice(0, params.depth)
          .map((it: any) => ({
            title: it.title,
            url: it.url,
            description: it.description ?? "",
            position: it.rank_absolute,
          }));
        return { result: { items }, costUsd: cost, latencyMs: Date.now() - t0 };
      },
    });

    return { output: result };  // SerpResult = { items: SerpItem[] }
  }
}
```

### `BriefHandler` modyfikacja + prompt

`brief.handler.ts`:

```ts
async execute(ctx: StepContext): Promise<StepResult> {
  const cfg = ctx.project.config as ProjectConfig;
  const input = ctx.run.input as RunInput;
  const research = SerpResultSchema.safeParse(ctx.previousOutputs.research);
  const serpContext = research.success ? research.data.items : undefined;

  const res = await this.llm.generateObject({
    ctx: { runId: ctx.run.id, stepId: ctx.step.id, attempt: ctx.attempt, model: cfg.defaultModels?.brief },
    system: briefPrompt.system(ctx.project),
    prompt: briefPrompt.user(input, serpContext),
    schema: briefPrompt.schema,
  });
  return { output: res.object };
}
```

`brief.prompt.ts` user-fn dostaje opcjonalny `serpContext?: SerpItem[]`. Jeśli niepusty, dokleja sekcję:

```
Konkurencja na to słowo kluczowe (top 10 wyników Google):
1. {title}
   {url}
   {description}
2. ...

Przygotowując brief, weź pod uwagę jakie kąty są już mocno pokryte
i zaproponuj angle który się wyróżnia.
```

Jeśli `serpContext` undefined → prompt jak dziś (kompatybilność z templatem "Brief only").

### Cost cap w workerze (`pipeline.worker.ts`)

Przed `handler.execute(...)` w worker.ts:84:

```ts
const env = loadEnv();
const cap = parseFloat(env.MAX_COST_PER_RUN_USD ?? "5");
const sumRow = await this.db.execute(sql`
  SELECT COALESCE(SUM(cost_usd::numeric), 0) AS sum_cost
  FROM (
    SELECT cost_usd FROM llm_calls WHERE run_id = ${runId}
    UNION ALL
    SELECT cost_usd FROM tool_calls WHERE run_id = ${runId}
  ) t
`);
const sumCost = Number(sumRow.rows[0]?.sum_cost ?? 0);
if (sumCost >= cap) {
  throw new CostLimitExceededError(`run ${runId} exceeded cost cap $${cap} (current: $${sumCost.toFixed(4)})`);
}
```

`CostLimitExceededError` → worker `catch` rozpoznaje typ, ustawia `step.error.code = "cost_limit_exceeded"`, `step.status = "failed"`, run → `failed` natychmiast (bez retry). BullMQ retries pomijane przez re-throw jako `UnrecoverableError` (built-in w BullMQ — gwarantuje że `attemptsMade >= attempts` po pierwszym failu).

### Nowy template seed (`seed/seed.ts`)

Dodajemy:

```ts
{
  name: "Brief + research",
  version: 1,
  stepsDef: {
    steps: [
      { key: "research", type: "tool.serp.fetch", auto: true },
      { key: "brief", type: "llm.brief", auto: true },
    ],
  },
}
```

Idempotentnie (upsert po unique `(name, version)`). Przy seedzie logujemy `templateId` do konsoli — przyda się do testów ad-hoc curl/Postman.

## Frontend (`apps/web/src/app/runs/new/page.tsx`)

Jedna zmiana: pole `mainKeyword` ma `required` + komunikat. Brak template-aware logiki — dla "Brief only" keyword też się nada (jest opcjonalny w istniejącym brief promptcie). Nie tworzymy widoku edycji projektu/templatu.

## Env vars

`.env.example` (i wymóg w `.env.local`):

```
DATAFORSEO_LOGIN=your-login@example.com
DATAFORSEO_PASSWORD=your-api-password
MAX_COST_PER_RUN_USD=5
```

`config/env.ts` schema `Env` rozszerzony o powyższe (login/password jako `z.string().min(1)`, MAX jako `z.string().default("5")`).

## Testy

**Vitest setup:**
- `pnpm add -D vitest @vitest/coverage-v8` w `apps/api`.
- `apps/api/vitest.config.ts` z `environment: "node"`, alias do `@sensai/shared`.
- Skrypt `"test": "vitest run"` w `apps/api/package.json`.
- Turbo task `test` w root `package.json` (caching enabled).

**`tests/dataforseo.client.test.ts`:**
- Mock `globalThis.fetch` przez `vi.spyOn(globalThis, "fetch")`.
- Test 1: udany `serpOrganicLive` → response parsowany, tylko `type=organic` items, mapowanie do normalized shape.
- Test 2: HTTP 500 trzy razy → finalnie `HttpError` (po wyczerpaniu p-retry).
- Test 3: status_code 40000 → `DataForSeoApiError` bez retry.
- Test 4: HTTP 401 → throw natychmiast (no retry na 4xx non-429).

**`tests/tool-cache.service.test.ts`:**
- In-memory mock `Db` (vi.fn-y zwracające przygotowane dane). Brak testcontainers w v1.
- Test 1: cache HIT → fetcher NIE jest wołany, recorder.record dostaje `fromCache: true, costUsd: "0"`.
- Test 2: cache MISS → fetcher wołany, insert do cache z poprawnym `expiresAt = now + ttlSeconds * 1000`, recorder dostaje `fromCache: false, costUsd: from-fetcher`.
- Test 3: paramsHash deterministyczny dla różnej kolejności kluczy: `sha256(stableStringify({a:1,b:2})) === sha256(stableStringify({b:2,a:1}))`.
- Test 4: expired entry (expiresAt < now) traktowany jako MISS → fetcher wołany.

**Smoke E2E (manualny, NIE w CI):**
1. `pnpm dev:api` + `pnpm dev:web` (porty 8000/7000).
2. Klik "Nowy run" → wybierz "Brief + research" → topic + mainKeyword → Start.
3. Spodziewany rezultat (~20-30s):
   - UI pokazuje brief z polami `headline/angle/pillars/painPoints/successCriteria`.
   - DB: 2 wiersze w `pipeline_steps` (research+brief, oba completed), 1 w `tool_calls` (`fromCache=false`), 1 w `llm_calls`, 1 w `tool_cache`.
4. Powtórz z tym samym keywordem → drugi run robi `tool_calls` z `fromCache=true, costUsd=0` (potwierdza cache).

## Plan kolejności implementacji (rough sketch)

Pełny task breakdown zrobi `writing-plans`. Tu high-level kolejność z zależnościami:

1. Env + Vitest setup (fundament infra).
2. `stableStringify` + `sha256` utils.
3. `ToolCallRecorder` service.
4. `ToolCacheService` + jego unit testy.
5. `DataForSeoClient` + jego unit testy.
6. `tools.module.ts`, `dataforseo.module.ts`, podpięcie w `app.module.ts`.
7. `serp.types.ts` (SerpFetchParams, SerpItem, SerpResult zod schemas).
8. `SerpFetchHandler` + rejestracja w `handlers.module.ts`.
9. `briefPrompt.user` przyjmuje `serpContext`, `BriefHandler` czyta `previousOutputs.research`.
10. `CostLimitExceededError` + cost cap check w `pipeline.worker.ts`.
11. Seed template "Brief + research" v1, sprawdzić log z `templateId`.
12. `NewRunPage` mainKeyword required.
13. Smoke test manualny (brak HIT) + drugi run (cache HIT).
14. Update `MEMORY.md` + nowy memory entry o Plan 02 status.

Szacunek: ~12-14 zadań, mniejsze niż Plan 01 (19).

## Migracje DB

**Brak.** `tool_calls` i `tool_cache` istnieją od Planu 01 (`apps/api/src/db/schema.ts:110-148`) jako stub-y. Schemat jest wystarczający — brak zmian kolumn/indeksów.

## Otwarte pytania (do późniejszych iteracji)

- Czy `mainKeyword` powinien być per-template-required (deklaratywnie w `pipelineTemplates.stepsDef`) czy hardcoded w handlerze? V1 → handler rzuca błąd. V2 → metadata w template + walidacja w `RunsService.start` przed enqueue.
- Per-day cost cap — kiedy potrzebny? Pewnie przy regularnym użyciu, po Planie 04.
- Template-aware UI w "Nowy run" — Plan 04, razem z resztą szablonów.

## Kryteria sukcesu

1. Klik "Nowy run" → wybierz "Brief + research" → wpisz topic + mainKeyword → po ~20-30s widoczny brief w UI.
2. W DB: 1 wiersz `tool_calls` z `fromCache=false, cost_usd > 0` po pierwszym runie; 1 wiersz `tool_cache` z poprawnym `expiresAt = +7d`.
3. Drugi run z tym samym keywordem → `tool_calls` ma `fromCache=true, cost_usd="0"`, brief pojawia się szybciej (~15s, bo nie ma calla DataForSEO).
4. `pnpm test` w `apps/api` przechodzi (8 testów: 4 client + 4 cache).
5. Run z manipulowanym `MAX_COST_PER_RUN_USD=0.0001` (poniżej kosztu pierwszego LLM/tool calla) kończy się jako `failed` z `step.error.code="cost_limit_exceeded"` po pierwszym handlerze.
