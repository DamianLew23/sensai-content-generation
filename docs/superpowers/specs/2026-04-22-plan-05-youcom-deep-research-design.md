# Plan 05 — you.com Deep Research: Design Document

**Data:** 2026-04-22
**Status:** Draft — do implementacji
**Poprzednik:** Plan 04 (crawl4ai primary + Firecrawl fallback) — COMPLETED, merged 2026-04-22
**Autor:** Wspólny design (user + Claude)

## Kontekst

Plany 01-04 dostarczyły fundament (NestJS + BullMQ + Drizzle + Next.js UI), narzędzia SEO (DataForSEO SERP + keyword data), scrape'owanie (crawl4ai primary + Firecrawl fallback) i pierwsze kroki LLM (brief). Pipeline działa end-to-end na templatce "Brief + research + scrape" z checkpointem wyboru URL-i.

Plan 05 dokłada **niezależny etap deep-research** bazujący na [you.com Research API](https://you.com/docs/api-reference/research/v1-research). Cel: dostarczyć brief-LLM-owi wiedzę o temacie ortogonalną do competitive intel z SERP + scrape. you.com sam wyszukuje, czyta i syntezuje źródła, zwracając Markdown z cytatami inline i listą źródeł.

Ten plan poprzedza kolejne etapy LLM (outline/draft/edit/seo_check) — wcześniej niż oryginalna numeracja "Plan 05 = kolejne kroki LLM" zakładała.

## Cel

- Dodać nowy typ kroku `tool.youcom.research` jako pierwszy krok w pipeline (przed SERP + scrape + brief)
- Zasilić brief-LLM-a Markdownem z cytatami jako dodatkowym (nie zastępującym) źródłem kontekstu
- Zachować istniejący audit trail i bezpieczniki kosztów bez zmian w infrastrukturze

## W zakresie

- Nowy tool module `apps/api/src/tools/youcom/` (klient + errors + module + types)
- Nowy step handler `apps/api/src/handlers/youcom-research.handler.ts`
- Nowy prompt file `apps/api/src/prompts/youcom-research.prompt.ts` z per-project override
- Nowa schema `ResearchBriefing` w `packages/shared/src/schemas.ts`
- Rozszerzenie `ProjectConfig` o `researchEffort` (opcjonalne pole)
- Rozszerzenie `BriefHandler` i `briefPrompt.user` o 4. opcjonalny argument (`deepResearch`)
- Nowa templatka w seed'ie: "Blog SEO — deep research" v1 (4 kroki: `deepResearch` → `research` → `scrape` → `brief`)
- ENV: `YOUCOM_API_KEY`, `YOUCOM_BASE_URL`, `YOUCOM_TIMEOUT_MS`, `YOUCOM_DEFAULT_EFFORT`, `YOUCOM_COST_*` (per effort)
- Cache: klucz `("youcom", "research", hash(input + effort))`, TTL 14 dni
- Unit testy (klient, handler, prompt, brief regresja) + manualny smoke `scripts/smoke-plan-05.ts`

## Poza zakresem (odłożone)

- Checkpoint/approval na kroku `deepResearch` (templatka ustawia `auto:true`)
- Fallback na inny research provider (Perplexity, Tavily, self-built)
- Async/polling (you.com Research API jest sync-only)
- UI do konfigurowania `researchEffort` per projekt (na razie przez ręczną edycję `project.config` w DB)
- Kolejne kroki LLM (outline/draft/edit/seo_check) — kolejne plany
- Czytanie kosztu z response headers (`X-Cost-*`) — fold-in jeśli smoke test potwierdzi że headery istnieją
- Pre-insert tool_call row z `status="pending"` dla lepszej idempotencji pod timeouty — fold-in jeśli problem się zmaterializuje
- Integration test orchestratora z testcontainers — w repo nie istnieje jeszcze żaden test tego typu; zakładamy osobny plan gdy pokryjemy więcej typów kroków

## Decyzje (stan po brainstormie)

| # | Decyzja | Wybór | Uzasadnienie |
|---|---|---|---|
| 1 | Rola etapu | Osobny krok przed brief, obok SERP/scrape | Deep research = merytoryka; SERP+scrape = competitive intel. Ortogonalne inputy dla briefu |
| 2 | Budowanie `input` dla you.com | Template `topic + keyword + intent + contentType` w pliku promptu | Spójne z istniejącą konwencją promptów (`brief.prompt.ts`); daje wystarczający kontekst bez "brudzenia" tonem projektu |
| 3 | `research_effort` | Templatka + per-project override, default `deep` | Analogia do `defaultModels` per-project; per-run override to YAGNI na v1 |
| 4 | Checkpoint | Auto (`requires_approval=false`) | User świadomie wybiera "jeden strzał" mimo ryzyka utopionych kosztów przy złym researchu |
| 5 | Output shape | Pass-through `{content: string, sources: Source[]}`, Zod w shared | Brief jest LLM-em → sam wyciągnie fakty z Markdowna; unikamy dodatkowego LLM calla |
| 6 | Fallback | Brak, fail-fast | BullMQ i tak retryuje 3×; drugie research-as-a-service = nowe konto + nowy kontrakt danych; self-built łańcuch = de facto drugi silnik syntezy |
| 7 | Cache | Klucz `(youcom, research, hash(input+effort))`, TTL 14d | Effort w kluczu zachowuje możliwość upgrade'u; 14d to kompromis między evergreen a news topics |
| 8 | Timeout / retry | 300s timeout, 0 retries w kliencie, BullMQ 3× na step | Hojny timeout dla `deep`/`exhaustive`; retry logic scentralizowana w BullMQ; cost_limit_exceeded i tak ratuje budżet |
| 9 | Tracking kosztów | Tabela env per effort (provisional liczby) | Pricing niejawny w dokumentacji; verify w smoke test i update `.env.example` przed prod-use |
| 10 | Pozycja w templatce | Nowa templatka, kolejność `deepResearch → research → scrape → brief` | Nie rusza istniejących templatek (wersjonowanie); youcom pierwszy bo topic-driven (nie potrzebuje keyword) |
| 11 | Organizacja kodu | Pełen równoległy pattern (analogicznie do `crawl4ai/`) | Spójność z istniejącą strukturą; testowalne osobno; per-project `promptOverrides` wymagają osobnego pliku promptu |

## Architektura

### Struktura plików

```
apps/api/src/
├── tools/youcom/                        (nowy)
│   ├── youcom.client.ts                 HTTP klient, AbortSignal.timeout, X-API-Key
│   ├── youcom.errors.ts                 YoucomApiError(status, body, endpoint)
│   ├── youcom.module.ts                 NestJS module: exports YoucomClient
│   └── youcom.types.ts                  Request/response types, YOUCOM_COST_USD map, ResearchEffort
├── handlers/
│   └── youcom-research.handler.ts       StepHandler<"tool.youcom.research">
├── prompts/
│   └── youcom-research.prompt.ts        { user(input: RunInput): string }
└── tests/
    ├── youcom.client.test.ts            unit (stub fetch)
    ├── youcom-research.handler.test.ts  unit (mocked client + cache + recorder)
    └── youcom-research.prompt.test.ts   unit (template interpolation)
```

### Modyfikowane pliki

```
packages/shared/src/schemas.ts
  + ResearchEffort = z.enum(["lite","standard","deep","exhaustive"])
  + ResearchSource = z.object({ url: z.string().url(), title: z.string().optional(), snippets: z.string().array() })
  + ResearchBriefing = z.object({ content: z.string(), sources: ResearchSource.array() })
  + ProjectConfig — pole researchEffort: ResearchEffort.optional()

apps/api/src/config/env.ts
  + YOUCOM_API_KEY (optional at boot, required at step execution)
  + YOUCOM_BASE_URL (default https://api.you.com)
  + YOUCOM_TIMEOUT_MS (default 300000)
  + YOUCOM_DEFAULT_EFFORT (default "deep")
  + YOUCOM_COST_{LITE,STANDARD,DEEP,EXHAUSTIVE} (provisional defaults)

apps/api/src/tools/tools.module.ts
  + import/export YoucomModule

apps/api/src/handlers/handlers.module.ts
  + register YoucomResearchHandler in registry

apps/api/src/handlers/brief.handler.ts
  + czyta ctx.previousOutputs.deepResearch (ResearchBriefing.safeParse)
  + przekazuje 4. argument do briefPrompt.user

apps/api/src/prompts/brief.prompt.ts
  + user(input, serpContext?, scrapePages?, deepResearch?)
  + if deepResearch: dokleja "## Deep research briefing\n{content}\n\n## Sources\n{url/title list}"

apps/api/src/seed/seed.ts
  + 4. templatka "Blog SEO — deep research" v1
  + steps: [{deepResearch, tool.youcom.research, auto}, {research, tool.serp.fetch, auto},
            {scrape, tool.scrape, auto}, {brief, llm.brief, auto}]

.env.example
  + YOUCOM_* variables z komentarzem "provisional — verify in you.com portal"

scripts/smoke-plan-05.ts
  (nowy) — 1 prawdziwy call, asercje + log headers dla pricing verification
```

### Registry

Nowy step type `tool.youcom.research` w rejestrze orchestratora, mapowany na `YoucomResearchHandler` (identyczny mechanizm jak `tool.scrape` → `ScrapeFetchHandler`).

### Template step-key konwencja

W nowej templatce step.key dla youcom = `deepResearch` (żeby nie kolidować z istniejącym `research` = SERP). Brief handler czyta oba niezależnie — oba są opcjonalne, stare templatki bez deepResearch działają bez zmian.

## Komponenty

### YoucomClient

Cienki wrapper HTTP. Jedna metoda: `research(body: YoucomResearchInput): Promise<YoucomResearchResponse>`.

```ts
interface YoucomResearchInput {
  input: string;
  research_effort: "lite" | "standard" | "deep" | "exhaustive";
}

interface YoucomResearchResponse {
  output: {
    content: string;                    // Markdown z [1][2]
    content_type: "text";
    sources: Array<{ url: string; title?: string; snippets: string[] }>;
  };
}
```

- `POST ${baseUrl}/v1/research`
- Headers: `X-API-Key`, `Content-Type: application/json`
- `AbortSignal.timeout(timeoutMs)` — default 300s
- Brak retry wewnątrz klienta; propaguje `YoucomApiError` (dla non-2xx) lub `AbortError` (dla timeout)
- Konstruktor rzuca jeśli `apiKey === ""` — fail-fast w momencie pierwszego użycia

### YoucomResearchHandler

Implementuje `StepHandler` dla typu `tool.youcom.research`. Flow:

1. Resolve `effort`: `step.model` (niewykorzystane dla tego type) → `project.config.researchEffort` → `env.YOUCOM_DEFAULT_EFFORT`
2. Build prompt string przez `youcomResearchPrompt.user(ctx.run.input)`; jeśli `project.config.promptOverrides["tool.youcom.research"]` istnieje — interpolacja `{topic}`, `{mainKeyword}`, `{intent}`, `{contentType}`
3. Guard: `promptString.length <= 40_000` (hard throw jeśli przekroczone)
4. `paramsHash = sha256(stableStringify({ input: promptString, effort }))`
5. `ToolCacheService.lookup({ tool: "youcom", method: "research", paramsHash })`
   - Hit: record `tool_call {from_cache:true, cost_usd:0}`; return cached
   - Miss: go to 6
6. `ToolCallRecorder.record` opakowuje wywołanie: insert pre-row → `client.research` → update row z `cost_usd = YOUCOM_COST_USD[effort]` przy sukcesie, lub z `error` przy failure (recorder zachowuje istniejący Plan 04 pattern z `tool_calls.error` JSONB)
7. `ResearchBriefing.parse(response.output)` — przy drift schema rzuca ZodError (step fails bez cache'owania)
8. `cache.store({ paramsHash, result: parsed, ttlDays: 14 })`
9. Return `{ output: parsed }`

### youcomResearchPrompt

```ts
export const youcomResearchPrompt = {
  user(input: RunInput): string {
    const lines = [
      `Provide a deep research briefing for an article on: ${input.topic}.`,
      input.mainKeyword && `Target keyword: ${input.mainKeyword}.`,
      input.intent      && `Search intent: ${input.intent}.`,
      input.contentType && `Content type: ${input.contentType}.`,
      ``,
      `Cover: key facts, recent developments (last 12 months), expert perspectives, common misconceptions, concrete data points with source URLs. Be thorough and cite every claim.`,
    ].filter(Boolean);
    return lines.join("\n");
  },
};
```

Override: `project.config.promptOverrides["tool.youcom.research"]` (string z placeholderami `{topic}`, `{mainKeyword}`, `{intent}`, `{contentType}`). Nieobecne placeholdery są no-op (best-effort interpolacja).

### BriefHandler (diff)

```ts
+    const researchParsed = ResearchBriefing.safeParse(ctx.previousOutputs.deepResearch);
+    const deepResearch = researchParsed.success ? researchParsed.data : undefined;
     const res = await this.llm.generateObject({
       ...
-      prompt: briefPrompt.user(input, serpContext, scrapePages),
+      prompt: briefPrompt.user(input, serpContext, scrapePages, deepResearch),
     });
```

## Data flow

```
POST /runs {projectId, templateId=blogSeoDeepResearch, input}
   │
   ▼
[1] YoucomResearchHandler:
     resolve effort → build prompt → cache lookup
     ├─ hit  → step.output = cached ─────────────────┐
     └─ miss → client.research (≤300s)               │
               ├─ success → parse → cache.store → step.output = parsed
               └─ error/timeout → step fails → BullMQ retry (3×)
   │
   ▼ (auto)
[2] SERP fetch (existing)
   │
   ▼ (auto)
[3] Scrape (existing)
   │
   ▼ (auto)
[4] BriefHandler:
     previousOutputs.deepResearch → ResearchBriefing
     previousOutputs.research     → SerpResult
     previousOutputs.scrape       → ScrapeResult
     briefPrompt.user(input, serp, scrape, deepResearch)
     → llm.generateObject → step.output = briefStructured
   │
   ▼
run.status = "completed"
SSE update na każdy step change
```

**Bezpieczniki koszów:** `MAX_COST_PER_RUN_USD=5` — jeden `deep` ($0.15 provisional) = 3% budżetu. `MAX_COST_PER_DAY_USD=20` — 50 runów × $0.15 = $7.50.

**Idempotencja przy retry:** cache lookup po `paramsHash` chroni przed podwójnym kosztem przy retry BullMQ **pod warunkiem**, że poprzednia próba zdążyła zapisać do cache. Ryzyko podwójnego kosztu gdy request trwa > 300s i BullMQ wywala step przed zapisaniem — znany kompromis (decyzja 8A), akceptowalny na v1.

## Error handling

| Typ | Objaw | Obsługa |
|---|---|---|
| Transient HTTP | 5xx, 429, network, timeout (`AbortError`) | `YoucomApiError` / `AbortError` → BullMQ retry (3× exp backoff 5s/10s/20s); po 3 faili `step.failed` |
| Auth | 401/403 | Jak transient (BullMQ retry no-op); dodatkowo pre-check obecności `YOUCOM_API_KEY` w konstruktorze klienta rzuca fail-fast przy pierwszym użyciu |
| Walidacja 422 | Malformed input | `YoucomApiError` → BullMQ retry no-op → `step.failed`. Rzadkie (sami budujemy input) |
| Input > 40k | Guard przed call | `throw Error` → `step.failed` natychmiast |
| Response schema drift | ZodError w `ResearchBriefing.parse` | `step.error = {type:"schema", zodIssues}` → `step.failed` natychmiast (bez cache'owania złego wyniku) |
| Empty response | `content===""` lub `sources===[]` | **Nie** error. Zapisujemy do cache, logujemy `warn`. `briefPrompt.user` dokleja sekcję "Deep research briefing" tylko gdy `deepResearch.content.length > 0` — przy pustej odpowiedzi brief zachowuje się jak dla templatki bez deepResearch |
| `cost_limit_exceeded` | Bezpiecznik orchestratora | Istniejący mechanizm; `step.error="cost_limit_exceeded"`, `run.failed` |

### Recorder + failure recording

Zachowujemy Plan 04 pattern (`tool_calls.error` JSONB):

```
Success  → tool_calls { from_cache:false, cost_usd:0.15, latency_ms, error:null }
Failure  → tool_calls { from_cache:false, cost_usd:0,    latency_ms, error:{status, body, endpoint} }
Cached   → tool_calls { from_cache:true,  cost_usd:0,    latency_ms:~2, error:null }
```

### Logging

Pino context: `{ run_id, step_id, tool:"youcom", effort }`.

| Moment | Level |
|---|---|
| Cache hit | `info` |
| Cache miss, live call start | `info` |
| Success | `info` (latency, sourcesCount, contentLength) |
| Transient failure | `warn` |
| Schema mismatch | `error` |
| Timeout | `warn` |

## Testy

### Unit

- **`youcom.client.test.ts`** — stubowany globalny `fetch`: happy path, 401/403/422/500, timeout, headers, body serializacja
- **`youcom-research.handler.test.ts`** — mocki `YoucomClient`, `ToolCacheService`, `ToolCallRecorder`, `Env`: happy path, cache hit, effort resolution (3 warstwy), prompt override z placeholderami, input > 40k guard, schema drift, empty response, client throws
- **`youcom-research.prompt.test.ts`** — wszystkie pola obecne, opcjonalne pola null, override z niepodstawionym placeholderem
- **`brief.handler.test.ts`** (modyfikacja) — `deepResearch` obecny → prompt dostaje 4. argument; nieobecny → zachowanie bez zmian (regresja)

### Smoke (manualny)

`scripts/smoke-plan-05.ts` — jeden prawdziwy call z prawdziwym API key:

- `response.status === 200`
- `content.length > 100`, `sources.length > 0`, każdy source ma `url`
- `tool_calls.cost_usd > 0` (zapisany provisional cost)
- Log response headers → weryfikacja obecności `X-Cost-*` (punkt do fold-inu)
- Log latency dla effortu `deep` → kalibracja timeoutu
- **Verify pricing in you.com portal** i update `.env.example` z realnymi liczbami

Nie idzie do CI. Ręczny: `pnpm smoke:plan-05`.

### Evaluacja jakości (nie test)

Pierwszy run produkcyjny z nową templatką: ręczna ocena 1-5 czy deep research dostarcza wiedzy, której SERP+scrape same nie dają. Arkusz ocen promptów. Jeśli wartość dodana niska → rozważyć default `standard` (taniej) albo ograniczyć użycie do wybranych typów treści.

## Znane ograniczenia / follow-upy

1. **Pricing weryfikacja** — smoke test loguje response headers; po weryfikacji w portalu update defaults w `.env.example`
2. **`X-Cost-*` header** — jeśli obecny, fold-in na czytanie kosztu z response (zamiast tabeli env)
3. **Duplikat kosztu przy timeout** — gdy request trwa > timeoutMs i recordera nie zdąży zaktualizować row; fold-in na pre-insert pattern jeśli problem się ujawni
4. **Brak UI dla `researchEffort`** — na razie ręczna edycja `project.config`; UI dokładamy gdy okaże się że istotnie iterujemy tym parametrem
5. **Brak checkpointu** — jeśli okaże się że deep research zjeżdża w bok i marnuje brief/draft → zmiana `auto:false` w templatce, UI i tak to wspiera

## Koszty (dodatek)

Przy 50 artykułów/mies., domyślnym efforcie `deep` ($0.15 provisional):

| Składnik (Plan 05 delta) | Koszt |
|---|---|
| you.com deep research (50 × $0.15) | ~$7.50 |

**Uwaga:** liczba provisional. Po smoke test weryfikacji może być 2-3× wyższa albo niższa. Finalny budżet `MAX_COST_PER_RUN_USD` (aktualnie $5) nadal mieści się nawet przy $0.50/deep research.
