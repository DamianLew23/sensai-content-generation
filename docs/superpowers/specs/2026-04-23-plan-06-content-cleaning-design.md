# Plan 06 — Content Cleaning: Design Document

**Data:** 2026-04-23
**Status:** Draft — do implementacji
**Poprzednik:** Plan 05 (you.com deep research) — COMPLETED, merged 2026-04-22
**Autor:** Wspólny design (user + Claude)
**Inspiracja:** Kurs AI Content Expert — Blok 2, Lekcja 2.4 „Czyszczenie pobranej treści"

## Kontekst

Plany 01-05 dostarczyły fundament (NestJS + BullMQ + Drizzle + Next.js UI), narzędzia SEO (DataForSEO SERP + keyword data), scrape'owanie (crawl4ai primary + Firecrawl fallback), deep research (you.com) oraz pierwszy krok LLM (brief). Pipeline działa end-to-end na templatce "Blog SEO — deep research" (`deepResearch → research → scrape → brief`).

Scrape (crawl4ai/Firecrawl) zwraca markdown per URL w `ScrapePage[]`, ale pomimo filtrów crawlera treść wciąż zawiera szum: duplikaty semantyczne między stronami (ten sam fakt przepisany w 5 artykułach), boilerplate UI ("dodaj do koszyka", "Polityka cookies", „Czytaj także"), pozostałości menu, paragrafy merytorycznie niezwiązane z głównym tematem. Bez oczyszczenia taki input zaśmieca dalsze kroki (brief LLM, knowledge graph) i powoduje halucynacje oraz marnowanie tokenów.

Plan 06 dokłada **niezależny etap czyszczenia treści** bazujący na metodologii z lekcji 2.4: blacklista fraz UI + deduplikacja stron (length-protected cosine similarity) + filtrowanie paragrafów po similarity do keywordu + cross-page deduplikacja paragrafów. Wszystko oparte na embeddingach OpenAI `text-embedding-3-small` przez AI SDK.

Plan 06 jest kroku-infrastrukturalny: rejestruje nowy typ `tool.content.clean` w registry i dostarcza handler, ale **żadna templatka go na razie nie używa**. Integracja z briefem nastąpi w Plan 07 (knowledge graph), który zdefiniuje finalny konsument czystych paragrafów i zrefaktoruje brief-handler.

## Cel

- Dodać nowy typ kroku `tool.content.clean` między scrape a przyszłym knowledge graph
- Zredukować szum w scrape output o ≥ 20% (goal oparty na 43% z lekcji) zachowując merytoryczne paragrafy
- Dostarczyć czyste paragrafy w strukturze gotowej do chunk'owania przez KG (Plan 07)
- Zachować istniejący audit trail (`tool_calls`, `tool_cache`) i bezpieczniki kosztów bez zmian w infrastrukturze

## W zakresie

- Nowy tool module `apps/api/src/tools/content-cleaner/` (klient + pure fn modules + module)
- Nowy step handler `apps/api/src/handlers/content-clean.handler.ts`
- Schema `CleanedScrapeResult`, `CleanedPage`, `DroppedPage`, `CleaningStats` w `packages/shared/src/schemas.ts`
- Rozszerzenie `LlmClient` o `embedMany` (AI SDK `embedMany` z providerem OpenAI)
- ENV: `CLEANING_BLOCK_SIMILARITY_THRESHOLD`, `CLEANING_PARAGRAPH_KEYWORD_THRESHOLD`, `CLEANING_LENGTH_DIFF_THRESHOLD`, `CLEANING_TARGET_CHAR_LIMIT`, `CLEANING_MIN_PARAGRAPH_LENGTH`, `CLEANING_EMBEDDING_MODEL`, `CLEANING_COST_PER_1M_TOKENS`
- Cache: klucz `(content, clean, hash(inputPages + keyword + thresholds))`, TTL 7 dni
- Unit testy (handler, pure fn modules, klient) + smoke test na fixture `ScrapeResult`
- Rejestracja w step registry

## Poza zakresem (odłożone)

- Templatka używająca cleaning step — Plan 07 (knowledge graph) dostarczy finalną templatkę `deepResearch → research → scrape → contentCleaning → knowledgeGraph → brief`
- Integracja z `brief.handler` — Plan 07 przerobi brief żeby czytał z KG output, nie z cleaning
- Per-project override thresholdów (fold-in gdy różne tematyki będą wymagać różnych progów)
- Per-project `extraBlacklistPhrases` (fold-in gdy trafimy na projekt który tego wymaga)
- Per-paragraph similarity score w output (fold-in jeśli KG będzie chciał ważyć entities)
- UI dla konfiguracji cleaning params
- Streaming / async (cleaning robi się synchronicznie w workerze)
- Checkpoint/approval — cleaning jest auto; UI i tak wspiera `auto:false` jeśli kiedyś trzeba
- Cache embeddingów per-text (fold-in jeśli rachunki OpenAI będą bolały)

## Decyzje (stan po brainstormie)

| # | Decyzja | Wybór | Uzasadnienie |
|---|---|---|---|
| 1 | Zakres cleaning | Pełny: blacklista + embedding dedup + keyword filter | Najbliższy lekcji 2.4, trzy warstwy dają razem ~43% redukcji |
| 2 | Granularność | Dwa poziomy: dedup stron + filter/dedup paragrafów | Z lekcji wynika że paragrafy to główne źródło redukcji |
| 3 | Embedding provider | AI SDK `embedMany` z OpenAI (`text-embedding-3-small`) | Spójne z `LlmClient`, łatwy swap, tani (~$0.02/1M tokens) |
| 4 | Output shape | Bogaty `CleanedScrapeResult` z `paragraphs[]` per page + `droppedPages[]` + `stats{}` | Next konsument (KG) chunkuje paragrafami; audit dla debugu |
| 5 | Error behavior | Fail-closed | Konsystentne z Plan 04/05; śmieciowy input → halucynacje w KG |
| 6 | Cache | `ToolCacheService` całego step output, TTL 7d | Retry-safe, tani cache hit przy iteracji briefu |
| 7 | Keyword source | Compozycja `topic + mainKeyword + intent` | Bogatszy signal semantyczny, spójne z youcom prompt |
| 8 | Config | Env defaults, bez per-project override (v1) | YAGNI — override dopiero gdy realnie potrzebny |
| 9 | Blacklista | Hardcoded lista z lekcji (polskie frazy UI), bez extension v1 | Dobrze dobrana, YAGNI, łatwy fold-in |
| 10 | Templatka | Brak — cleaning w registry, smoke na fixture | Templatka + brief rewrite razem w Plan 07 (KG) |
| 11 | Naming | `tool.content.clean`, dir `content-cleaner/`, handler `content-clean.handler.ts`, step key `cleanScrape` | Spójne z `tool.serp.fetch`, `tool.youcom.research` |
| 12 | Organizacja kodu | Pełen pattern tooli (jak youcom, crawl4ai); pure fn modules rozbite osobno | Spójność, testowalność, każdy moduł ma jeden cel |

## Architektura

### Struktura plików

```
apps/api/src/
├── tools/content-cleaner/              (nowy)
│   ├── content-cleaner.client.ts       Wrapper nad LlmClient.embedMany + cost calc
│   ├── content-cleaner.module.ts       NestJS module: exports ContentCleanerClient
│   ├── cleaning.types.ts               CleaningConfig, internal types
│   ├── blacklist.ts                    BLACKLIST_PHRASES + containsBlacklistedPhrase + removeBlacklistedParagraphs
│   ├── html-cleaner.ts                 cleanHtml + removeDuplicateLines
│   ├── paragraph-filter.ts             splitIntoParagraphs + filterParagraphsByKeyword
│   ├── dedup.ts                        findDiverseBlocks (length-protected)
│   └── cross-block-dedup.ts            deduplicateParagraphsAcrossBlocks
├── handlers/
│   └── content-clean.handler.ts        StepHandler<"tool.content.clean">
└── tests/
    ├── content-cleaner.client.test.ts  unit (stub LlmClient.embedMany)
    ├── content-clean.handler.test.ts   unit (mocked client + cache + recorder)
    ├── html-cleaner.test.ts            pure unit
    ├── blacklist.test.ts               pure unit
    ├── paragraph-filter.test.ts        pure unit
    ├── dedup.test.ts                   pure unit
    └── cross-block-dedup.test.ts       pure unit
```

Rozbicie na małe pure-fn moduły zamiast jednego `content-cleaner.service.ts` — każdy kawałek testowalny w izolacji, ma jeden cel, czytelny bez znajomości reszty. Spójne z zasadą „design for isolation and clarity".

### Modyfikowane pliki

```
packages/shared/src/schemas.ts
  + CleanedPage, DroppedPage, CleaningStats, CleanedScrapeResult
  (nic nie usuwamy, nic nie modyfikujemy istniejącego)

apps/api/src/config/env.ts
  + CLEANING_BLOCK_SIMILARITY_THRESHOLD (default 0.85)
  + CLEANING_PARAGRAPH_KEYWORD_THRESHOLD (default 0.4)
  + CLEANING_LENGTH_DIFF_THRESHOLD (default 0.30)
  + CLEANING_TARGET_CHAR_LIMIT (default 50000)
  + CLEANING_MIN_PARAGRAPH_LENGTH (default 60)
  + CLEANING_EMBEDDING_MODEL (default "text-embedding-3-small")
  + CLEANING_COST_PER_1M_TOKENS (default 0.02)

apps/api/src/llm/llm.client.ts
  + embedMany({ texts, ctx }): Promise<{ embeddings: number[][]; tokensUsed: number; costUsd: string }>
  (używa AI SDK embedMany z openai.embedding(model))

apps/api/src/tools/tools.module.ts
  + import/export ContentCleanerModule

apps/api/src/handlers/handlers.module.ts
  + register ContentCleanHandler w registry

apps/api/src/orchestrator/step-registry.ts
  + "tool.content.clean" type

.env.example
  + CLEANING_* variables z komentarzami

scripts/smoke-plan-06.ts
  (nowy) — loaduje fixture ScrapeResult, odpala handler bezpośrednio, asercje
scripts/fixtures/scrape-result-kortyzol.json
  (nowy) — pre-scrape'owany output z 5 URL-ów dla smoke test
```

### Registry

Nowy step type `tool.content.clean` w rejestrze orchestratora, mapowany na `ContentCleanHandler` (identyczny mechanizm jak `tool.scrape` → `ScrapeFetchHandler`).

### Input/output contract

```
Handler czyta: ctx.previousOutputs.scrape (ScrapeResult)
step.output:   CleanedScrapeResult
Next step (Plan 07 KG) czyta: ctx.previousOutputs.cleanScrape
```

Step key w templatkach: `cleanScrape` (konwencja: `research`, `scrape`, `deepResearch`, `cleanScrape`, `knowledgeGraph`, `brief`).

## Komponenty

### ContentCleanerClient

Thin wrapper nad `LlmClient.embedMany` + metryki kosztu. Jedna publiczna metoda.

```ts
@Injectable()
export class ContentCleanerClient {
  constructor(private readonly llm: LlmClient, private readonly env: Env) {}

  async embedTexts(
    texts: string[],
    ctx: { runId: string; stepId: string },
  ): Promise<{ embeddings: number[][]; costUsd: string; tokensUsed: number }>
}
```

- Wewnątrz woła `llm.embedMany({ model: env.CLEANING_EMBEDDING_MODEL, values: texts, ctx })`
- Batchuje na partie `<= 2048 values` i `<= 8191 tokens per value` (limit OpenAI text-embedding-3-small)
- Long paragraph handling: truncate `> 8000 chars` przed wysłaniem (loguje `warn`)
- Empty input → return `{embeddings: [], costUsd: "0", tokensUsed: 0}` (no-op)
- Błędy AI SDK propagują się bez wrappingu (BullMQ retry 3×)
- Koszt: `tokensUsed * CLEANING_COST_PER_1M_TOKENS / 1_000_000`

### Pure function modules

Każdy moduł eksportuje czyste funkcje — bez NestJS, bez konfiguracji, dostaje wszystko przez parametry.

**`html-cleaner.ts`** — port z lekcji 2.4:

```ts
export function cleanHtml(text: string): string
export function removeDuplicateLines(text: string): string
```

Zachowuje strukturę newline, usuwa `<br>`, tagi HTML, surowe URL-e (`http://`, `www.`), nadmiarowe białe znaki, zbijanie wielu `\n\n\n` do `\n\n`.

**`blacklist.ts`**:

```ts
export const BLACKLIST_PHRASES: readonly string[]
// ~60 polskich fraz: "koszyk", "cookies", "zaloguj", "dodaj do koszyka",
// "polityka prywatności", "rodo", "newsletter", "facebook", itd.

export function containsBlacklistedPhrase(text: string): boolean
// case-insensitive substring match

export function removeBlacklistedParagraphs(
  text: string,
  minLen: number,
): { text: string; removed: number }
// split po '\n\n+', paragrafy krótsze niż minLen są przepuszczane bez check
```

**`paragraph-filter.ts`** — keyword filter:

```ts
export function splitIntoParagraphs(text: string, minLen: number): string[]

export function filterParagraphsByKeyword(
  paragraphs: string[],
  paragraphEmbeddings: number[][],
  keywordEmbedding: number[],
  threshold: number,
): { kept: string[]; removed: Array<{ text: string; score: number }> }
```

Cosine similarity liczona lokalnie (nie wymaga API call — mamy już embeddingi).

**`dedup.ts`** — dedup stron z length protection, port `find_diverse_blocks_with_stats`:

```ts
interface DedupBlock {
  idx: number;
  content: string;
  embedding: number[];
}

interface DedupResult {
  idx: number;
  status: "kept" | "discarded";
  similarity: number;
  lengthDiff: number;
  similarToIdx?: number;
  reason: string;
}

export function findDiverseBlocks(
  blocks: DedupBlock[],
  config: {
    similarityThreshold: number;
    lengthDiffThreshold: number;
    charLimit: number;
  },
): DedupResult[]
```

Algorytm (z lekcji):
1. Sort po długości desc
2. Pierwszy (najdłuższy) zawsze kept
3. Dla każdego kolejnego: max cosine sim do kept
4. Jeśli sim > threshold, sprawdź length protection (`lengthDiff > 0.30` AND `sim < 0.95` → kept)
5. Jeśli sim ≥ 0.95, wymagaj `lengthDiff > 0.50` do zachowania
6. Respektuj `charLimit` (kolejne discarded po przekroczeniu)

**`cross-block-dedup.ts`** — dedup paragrafów między stronami (normalized string match, nie embedding):

```ts
export function deduplicateParagraphsAcrossBlocks(
  blocks: string[][],
): { blocks: string[][]; removed: number }
```

Normalizacja: lowercase + `\s+` → ` `. Pierwsze wystąpienie zostaje, kolejne usuwane.

### ContentCleanHandler

Implementuje `StepHandler` dla typu `tool.content.clean`. Flow:

```
execute(ctx):
  1. Parse ctx.previousOutputs.scrape → ScrapeResult (throw jeśli brak/zły shape)
  2. keyword = composeKeyword(ctx.run.input)
       = `${topic}${mainKeyword ? ` (${mainKeyword})` : ""}${intent ? ` — ${intent}` : ""}`
  3. paramsHash = sha256(stableStringify({
       pages: scrape.pages.map(p => ({url: p.url, markdown: p.markdown})),
       keyword,
       thresholds: { blockSim, paraKeyword, lengthDiff, charLimit, minPara },
     }))
  4. ToolCacheService.getOrSet({
       tool: "content", method: "clean", paramsHash, ttlSeconds: 604800 (7d),
       fetcher: () => runCleaning(scrape, keyword, ctx),
     })
  5. Return { output: cached-or-fresh-result }

runCleaning(scrape, keyword, ctx):
  Phase 1 — non-LLM cleanup per page (regex, no API):
    for each page:
      md = cleanHtml(page.markdown)
      md = removeDuplicateLines(md)
      { md, removedBlacklist } = removeBlacklistedParagraphs(md, minPara)
    Skip pages where md.trim() === "" → droppedPages.push({reason: "empty_after_cleanup"})

  Phase 2 — embedding keyword + all paragraphs (1 batched API call):
    for each remaining page: paragraphs = splitIntoParagraphs(md, minPara)
    allTexts = [keyword, ...flatten(paragraphs per page)]
    { embeddings: allEmbs, costUsd: c1 } = client.embedTexts(allTexts, ctx)
    keywordEmb = allEmbs[0]
    paragraphEmbs = allEmbs.slice(1)
    (split paragraphEmbs back per page by offset)

  Phase 3 — per-page paragraph filter:
    for each page:
      { kept, removed } = filterParagraphsByKeyword(pageParas, pageEmbs, keywordEmb, paraKeywordThreshold)
      page.paragraphs = kept
      page.removedCount = removed.length
    Drop pages where kept.length === 0 → droppedPages.push({reason: "all_paragraphs_filtered"})

  Phase 4 — cross-page paragraph dedup:
    { blocks: dedupedParagraphs, removed: crossBlockRemoved } =
      deduplicateParagraphsAcrossBlocks(pages.paragraphs)
    Zip back into pages

  Phase 5 — page-level dedup with length protection (2nd API call):
    Concatenate paragraphs per page → blockText
    { embeddings: blockEmbs, costUsd: c2 } = client.embedTexts(blockTexts, ctx)
    results = findDiverseBlocks(blocks, config)
    For each discarded: droppedPages.push({reason: "similar_to_kept", similarToUrl, similarity})

  Phase 6 — assemble result:
    pages = kept.map(buildCleanedPage)
    stats = { inputPages, keptPages, inputChars, outputChars, reductionPct,
              blacklistedRemoved, keywordFilteredRemoved, crossPageDupesRemoved }
    recorder.record({ tool: "content", method: "clean", costUsd: c1+c2, latencyMs, fromCache: false })
    return { pages, droppedPages, stats }
```

### Schema (packages/shared/src/schemas.ts)

```ts
export const CleanedPage = z.object({
  url: z.string().url(),
  title: z.string(),
  fetchedAt: z.string().datetime(),
  markdown: z.string(),
  paragraphs: z.string().array(),
  originalChars: z.number().int().nonnegative(),
  cleanedChars: z.number().int().nonnegative(),
  removedParagraphs: z.number().int().nonnegative(),
});
export type CleanedPage = z.infer<typeof CleanedPage>;

export const DroppedPage = z.object({
  url: z.string().url(),
  reason: z.enum(["similar_to_kept", "all_paragraphs_filtered", "empty_after_cleanup"]),
  similarToUrl: z.string().url().optional(),
  similarity: z.number().optional(),
});
export type DroppedPage = z.infer<typeof DroppedPage>;

export const CleaningStats = z.object({
  inputPages: z.number().int().nonnegative(),
  keptPages: z.number().int().nonnegative(),
  inputChars: z.number().int().nonnegative(),
  outputChars: z.number().int().nonnegative(),
  reductionPct: z.number(),
  blacklistedRemoved: z.number().int().nonnegative(),
  keywordFilteredRemoved: z.number().int().nonnegative(),
  crossPageDupesRemoved: z.number().int().nonnegative(),
});
export type CleaningStats = z.infer<typeof CleaningStats>;

export const CleanedScrapeResult = z.object({
  pages: CleanedPage.array(),
  droppedPages: DroppedPage.array(),
  stats: CleaningStats,
});
export type CleanedScrapeResult = z.infer<typeof CleanedScrapeResult>;
```

## Data flow

```
ScrapeHandler (existing) → step.output = ScrapeResult { pages[], failures[] }
   │
   ▼
ContentCleanHandler:
  read ctx.previousOutputs.scrape
  compose keyword from run.input
  cache lookup (sha256(pages + keyword + thresholds))
    ├─ hit  → step.output = cached ──────────────────────────┐
    └─ miss →                                                │
        Phase 1: HTML cleanup + blacklist (regex, no API)    │
        Phase 2: embedMany([keyword, ...allParagraphs])      │
        Phase 3: paragraph filter per page (local cosine)    │
        Phase 4: cross-page paragraph dedup (normalized str) │
        Phase 5: embedMany(blockTexts) + length-protected dedup │
        Phase 6: assemble CleanedScrapeResult                │
        cache.store (TTL 7d)                                 │
        record tool_call { cost_usd, latency_ms }            │
   │
   ▼
step.output = CleanedScrapeResult { pages[], droppedPages[], stats{} }
(next step — Plan 07: KnowledgeGraphHandler — czyta ctx.previousOutputs.cleanScrape)
```

**Kolejność embedding calli (2 batched calls na run):**
1. Call A: `[keyword, ...allParagraphs]` — keyword razem z paragrafami dla oszczędności round-tripu
2. Call B: `[...blockTexts]` — dla dedup stron po odfiltrowaniu paragrafów

**Bezpieczniki kosztów:** `MAX_COST_PER_RUN_USD=5` — cleaning to ~$0.0004/run przy 5 stronach × 15k chars. Szum na tle briefu ($0.15 deep research + ~$0.05 brief LLM).

**Idempotencja przy retry:** cache lookup po `paramsHash` chroni przed podwójnym kosztem przy retry BullMQ **pod warunkiem**, że poprzednia próba zdążyła zapisać do cache. Cleaning jest szybki (~2-3s typowo) więc ryzyko timeoutu przed zapisem praktycznie zerowe.

## Error handling

| Typ | Objaw | Obsługa |
|---|---|---|
| Brak `previousOutputs.scrape` | step wywołany bez poprzednika | `throw Error("content.clean requires previousOutputs.scrape")` → `step.failed` (BullMQ retry no-op) |
| Zły shape scrape | `ScrapeResult.safeParse` fails | `throw ZodError` → `step.failed` (błąd w konfiguracji pipeline'u) |
| Empty scrape (0 pages) | `scrape.pages.length === 0` | `throw Error("no pages to clean")` → `step.failed` (scrape powinien był failować wcześniej) |
| OpenAI transient | 5xx, 429, timeout | AI SDK rzuca → `step.failed` → BullMQ retry (3× exp backoff) |
| OpenAI auth | 401 | AI SDK rzuca → `step.failed` (retry no-op, problem z `OPENAI_API_KEY`) |
| Paragraf > 8000 chars | Pojedynczy paragraf przekracza token limit | `truncate(8000)` w `ContentCleanerClient` przed wysłaniem (loguje `warn`) |
| Wszystkie strony wyrzucone | Po Phase 5 `pages.length === 0` | **Nie** fail. Zwróć `{pages: [], droppedPages: [...], stats: {reductionPct: 100}}`. Next step (KG) decyduje co z pustym inputem |
| Schema drift output | Nie dotyczy — sami budujemy output, Zod tylko walidacja contractu | N/A |
| `cost_limit_exceeded` | Bezpiecznik orchestratora | Istniejący mechanizm; `step.error="cost_limit_exceeded"`, `run.failed` |

### Recorder

Zachowujemy Plan 04/05 pattern (`tool_calls.error` JSONB):

```
Success  → tool_calls { tool:"content", method:"clean", from_cache:false, cost_usd:0.0012, latency_ms:2400, error:null }
Failure  → tool_calls { tool:"content", method:"clean", from_cache:false, cost_usd:0,      latency_ms:900, error:{type, message} }
Cached   → tool_calls { tool:"content", method:"clean", from_cache:true,  cost_usd:0,      latency_ms:~2, error:null }
```

`paramsHash` identyczny z kluczem cache.

### Logging

Pino context: `{ run_id, step_id, tool:"content", method:"clean" }`.

| Moment | Level | Pola |
|---|---|---|
| Cache hit | `info` | `paramsHash` (prefix) |
| Cache miss, start | `info` | `inputPages`, `totalChars` |
| Embedding batch done | `debug` | `batch`, `textsCount`, `tokensUsed` |
| Phase 1 done | `debug` | `blacklistRemoved`, `duplicateLines` |
| Phase 3 done | `debug` | `keywordFilteredRemoved` |
| Phase 4 done | `debug` | `crossPageDupesRemoved` |
| Phase 5 done | `debug` | `blocksDiscarded`, `lengthProtected` |
| Success | `info` | `reductionPct`, `costUsd`, `latencyMs`, `keptPages`, `droppedPages` |
| Long paragraph truncated | `warn` | `url`, `paragraphLength` |
| Schema mismatch (input) | `error` | `zodIssues` |

## Testy

### Unit — pure function tests (największe pokrycie, brak mocków)

- **`html-cleaner.test.ts`** — `cleanHtml`: usuwa `<br>`, tagi, surowe URL-e, zachowuje newline między paragrafami. `removeDuplicateLines`: zostawia pierwsze wystąpienie, zachowuje puste linie dla struktury.
- **`blacklist.test.ts`** — `containsBlacklistedPhrase`: case-insensitive, substring match. `removeBlacklistedParagraphs`: krótkie paragrafy (< minLen) przepuszczane bez sprawdzania, długie z frazą wycinane, zwraca licznik.
- **`paragraph-filter.test.ts`** — keyword sim ≥ threshold → kept; < threshold → removed. Stubowane wektory (3-dim dla czytelności asercji). Edge: pusty input, wszystkie poniżej progu, wszystkie powyżej.
- **`dedup.test.ts`** — scenariusze length protection:
  - Pierwszy (najdłuższy) zawsze kept
  - sim > threshold, lengthDiff ≤ 30% → discarded
  - sim > threshold, lengthDiff > 30%, sim < 0.95 → kept (length protection)
  - sim ≥ 0.95, lengthDiff ≤ 50% → discarded
  - charLimit osiągnięty → kolejne discarded
- **`cross-block-dedup.test.ts`** — normalizacja whitespace/case, ten sam paragraf w 2 blokach → zostawiony tylko w pierwszym, licznik usuniętych

### Unit — integration (z mockami)

- **`content-cleaner.client.test.ts`** — stubowany `LlmClient.embedMany`:
  - Batching: input 2500 texts → 2 calls (2048 + 452)
  - Truncation: text > 8000 chars → truncated na 8000 przed wysłaniem
  - Empty input → no-op, zero kosztu
  - Koszt: `tokensUsed * CLEANING_COST_PER_1M_TOKENS / 1_000_000` dokładnie
  - Error z AI SDK propaguje
- **`content-clean.handler.test.ts`** — mocki `ContentCleanerClient`, `ToolCacheService`, `ToolCallRecorder`:
  - Happy path: scrape z 5 stronami → 2 calls embedMany → CleanedScrapeResult z redukcją
  - Cache hit → zero calli klienta, `from_cache: true`
  - Brak `previousOutputs.scrape` → throw
  - Zły shape scrape → ZodError → step fails
  - Empty scrape (0 pages) → throw
  - Wszystkie strony wyrzucone → zwraca `pages: []` bez throw
  - Keyword composition: wszystkie 3 pola → `"topic (keyword) — intent"`; tylko topic → `"topic"`; pusty mainKeyword + intent → `"topic"`
  - Cost recording: sum z obu calli, `from_cache: false`, error null

### Smoke test (manualny)

`scripts/smoke-plan-06.ts`:

```
1. Load fixture: scripts/fixtures/scrape-result-kortyzol.json
   (5 stron pre-scrape'owanych — real-world markdown z szumem)
2. Odpal ContentCleanHandler bezpośrednio (bez orchestratora) z:
   - input: { topic: "jak obniżyć kortyzol po 40", mainKeyword: "kortyzol", intent: "informational" }
   - scrape fixture jako previousOutputs.scrape
3. Asercje:
   - result.stats.reductionPct > 20 (minimum rozsądny próg)
   - result.pages.length > 0
   - result.pages.every(p => p.paragraphs.length > 0)
   - result.stats.blacklistedRemoved > 0 (fixture zawiera frazy UI)
   - real OPENAI_API_KEY, prawdziwy call
4. Log: koszt, latency, stats, pierwsze 200 chars pierwszej czystej strony
5. Cache test: drugi run z tym samym inputem → latency < 100ms, from_cache: true
```

Nie idzie do CI. Ręczny: `pnpm smoke:plan-06`. Fixture commitowany z planem (generowany raz ręcznie z prawdziwego scrape'u, potem deterministyczny).

### Evaluacja jakości (nie test)

Po pierwszym real runie (Plan 07, end-to-end z KG): ręczna ocena 1-5 czy cleaning:
- Redukuje szum (boilerplate, menu, „Czytaj także")
- Zachowuje merytoryczne paragrafy
- Nie wyrzuca stron merytorycznie różnych ale leksykalnie podobnych

Jeśli `paragraphKeywordThreshold=0.4` zbyt agresywny → obniżamy do 0.3 w ENV bez redeploy kodu.

## Znane ograniczenia / follow-upy

1. **Per-paragraph similarity score** — na razie nie w output; fold-in jeśli KG będzie chciał ważyć extracted entities proporcjonalnie
2. **Per-project override thresholdów** — obecnie tylko ENV; fold-in gdy okaże się że różne tematyki wymagają różnych progów
3. **Per-project extraBlacklistPhrases** — fold-in gdy trafimy na projekt który tego wymaga
4. **Truncation paragrafu > 8000 chars** — obcina końcówkę; alternatywa: chunkowanie długich paragrafów, ale na razie YAGNI (paragrafy naturalnie < 2k chars)
5. **Brak checkpointu** — cleaning jest auto; jeśli user chce zweryfikować co zostało wyrzucone przed wejściem do KG, można ustawić `auto:false` w przyszłej templatce, UI to wspiera
6. **Cache embeddingów** — całość output w cache, nie per-text. Jeśli zobaczymy że ciężko nas to kosztuje przy iteracji, fold-in na per-text embedding cache
7. **Pojedynczy provider** — tylko OpenAI embeddings przez AI SDK. Swap na Voyage/Cohere/local triviał w `LlmClient.embedMany` jeśli zajdzie potrzeba
8. **Templatka i integracja z briefem** — cały brief rewrite + końcowa templatka `deepResearch → research → scrape → cleanScrape → knowledgeGraph → brief` przeniesione do Plan 07 (knowledge graph)

## Koszty (dodatek)

`text-embedding-3-small`: $0.02 / 1M tokens. 1 token ≈ 4 chars w PL.

Przy scrape z 5 stron × ~15k chars = 75k chars total:
- Phase 2 call: ~75k chars + keyword + delimiters ≈ 19k tokens
- Phase 5 call: ~50k chars (po filtrze paragrafów) ≈ 12.5k tokens
- Suma: ~31.5k tokens × $0.02/1M = **~$0.00063 per cleaning run**

Przy 50 runów/mies. = ~$0.03/mies. Szum na tle pozostałych kosztów pipeline'u.

| Składnik (Plan 06 delta) | Koszt/mies. (50 runów) |
|---|---|
| OpenAI embeddings | ~$0.03 |

**Uwaga:** koszty są stabilne (OpenAI publiczny pricing), bez provisional/weryfikacji jak w Plan 05. Finalny budżet `MAX_COST_PER_RUN_USD` (aktualnie $5) nadal z dużym zapasem.
