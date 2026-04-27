# Plan 10 — Query Fan-Out Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `tool.query.fanout` step that converts a single keyword into a structured **query fan-out** — six possible user intents (Definicyjna / Problemowa / Instrukcyjna / Decyzyjna / Diagnostyczna / Porównawcza) × up to 5 thematic areas per intent, each with a YMYL flag, a MICRO/MACRO classification (article-section vs separate-article candidate), and an optional mapping of real People-Also-Ask (PAA) questions from Google (via DataForSEO). One dominant intent is selected to guide the BLUF article structure.

**Lesson source:** `docs/edu/lekcja-2-8/lekcja-2-8-query-fan-out.md` (Wariant 3 — pełny pipeline z PAA). Reference prompts:
- `docs/edu/lekcja-2-8/T2F8-query_fan_out_advanced-intent-themes.md` — intencje + obszary
- `docs/edu/lekcja-2-8/T2F8-query_fan_out_advanced-classification.md` — mikro/makro
- `docs/edu/lekcja-2-8/T2F8-query_fan_out_simple_paa.py` — pipeline + PAA assignment prompt

**Architecture:**

```
keyword (from RunInput)
   │
   ├──► [outer cache: tool=query, method=fanout, ttl=7d]
   │      │
   │      ├──► DataForSEO /serp/google/organic/live/advanced
   │      │     [inner cache: tool=dataforseo, method=paa, ttl=30d]
   │      │     → up to 20 PAA questions
   │      │
   │      ├──► LLM #1 (gpt-5, reasoning=medium)
   │      │     → normalization + intents[].areas[] + YMYL flag
   │      │
   │      ├──► LLM #2 (gpt-5, reasoning=high)
   │      │     → MICRO/MACRO classification + dominant intent
   │      │
   │      └──► LLM #3 (gpt-5, reasoning=medium)  [skipped if PAA empty]
   │            → PAA → area mapping + unmatchedPaa
   │
   └──► QueryFanOutResult (assembled, validated, cached)
```

The handler runs **early** in the DAG (`dependsOn: []`), parallel with `serp` and `deepResearch`. It depends on nothing but the keyword. Brief integration is **out of scope** (deferred — same approach as Plan 09 for `entities`).

**Tech Stack:** TypeScript / NestJS / AI SDK v5 / `@ai-sdk/openai-compatible` (OpenRouter) / `openai/gpt-5` / Zod / DataForSEO `/serp/google/organic/live/advanced` / Drizzle / BullMQ / Vitest.

---

**Critical gotcha 1 — `gpt-5.2` from the lesson does NOT exist in our pricing table.** The lesson Python script uses `model="gpt-5.2"` with `reasoning={"effort": "medium" | "high"}`. Our pricing table (`apps/api/src/llm/pricing.ts`) has `openai/gpt-5` (input $2.5 / output $10 per 1M). Use **`openai/gpt-5`** as the default for all three calls. Reasoning effort is forwarded via AI SDK provider options, not via the model name.

**Critical gotcha 2 — Reasoning effort propagation.** AI SDK v5 + `@ai-sdk/openai-compatible` forwards arbitrary provider options under `providerOptions.openai-compatible` (or whatever provider id is registered). The OpenRouter passthrough accepts `reasoning_effort: "low" | "medium" | "high"`. Pass it via `providerOptions: { openrouter: { reasoning_effort: "medium" } }` (verify the actual provider key during Task 5 by reading `apps/api/src/llm/llm.client.ts` — Plan 06/07/09 already wired the openai-compatible provider). If reasoning_effort is unsupported by the openai-compatible provider, fall back to plain calls and document it in the smoke test report.

**Critical gotcha 3 — Shared package build.** `packages/shared` must be **built to `dist/`** after every change to `schemas.ts` (`pnpm --filter @sensai/shared build`). The API imports compiled `dist`, not `src`. Every task that touches `packages/shared/src/schemas.ts` must end with a build step.

**Critical gotcha 4 — `previousOutputs` is empty for early steps.** Because `dependsOn: []`, the handler **must not** read from `ctx.previousOutputs`. The keyword comes from `ctx.run.input` (the `RunInput` schema's `topic` / `mainKeyword` / `intent` fields, composed via the same `composeKeyword` helper used by Plan 09's `EntityExtractHandler`).

**Critical gotcha 5 — DataForSEO PAA cost.** `/serp/google/organic/live/advanced` with `people_also_ask_click_depth: 2` is significantly more expensive than `/regular` (≈ $0.003 per call vs $0.0006). The 30-day inner cache is therefore **mandatory** — without it, every fanout cache miss + every smoke run burns a fresh DataForSEO request. Cache key = `{keyword, locationCode, languageCode, depth: 2}`.

**Critical gotcha 6 — Fail-closed via Zod superRefine.** AI SDK validates each `generateObject` result against the per-call Zod schema. The combined `QueryFanOutResult.superRefine` checks: unique area IDs (across ALL intents), classification matches a known area ID, dominant intent is one of the emitted intent names, every `paaMapping` key references a known area ID. On failure → orchestrator marks step failed → user re-runs via Plan 08 manual rerun (`forceRefresh`). No retries, no auto-repair, no partial outputs.

**Critical gotcha 7 — DI token isolation.** Plan 07 used `EXTRACT_ENV`, Plan 09 used `ENTITY_EXTRACT_ENV`. Plan 10 introduces **`QUERY_FANOUT_ENV`** — do NOT reuse either of the existing tokens.

**Critical gotcha 8 — Step ordering NOTE for orchestrator.** Per `orchestrator_scheduling.md`, the orchestrator walks `stepOrder + 1` and uses `dependsOn` only for cascade-rerun, not for parallel scheduling. So the new `fanout` step in the seed template MUST come before `serp`/`deepResearch` in the `steps` array (lower `stepOrder`), even though logically all three are siblings with `dependsOn: []`. Otherwise it will be scheduled after them.

---

## File Structure

```
apps/api/src/
├── tools/query-fanout/                            (NEW)
│   ├── query-fanout.client.ts                     Wraps LlmClient.generateObject ×3 + cost aggregation
│   ├── query-fanout.module.ts                     NestJS module exporting QueryFanOutClient
│   └── query-fanout.types.ts                      Internal helper types (raw LLM call shapes)
├── tools/dataforseo/
│   ├── dataforseo.client.ts                       (MODIFY) Add paaFetch() method
│   ├── dataforseo.module.ts                       (no change — client already exported)
│   └── paa.types.ts                               (NEW) PaaFetchParams + PaaRawItem types
├── prompts/
│   └── query-fanout.prompt.ts                     (NEW) 3 prompt builders (intents / classify / paa)
├── handlers/
│   └── query-fanout.handler.ts                    (NEW) StepHandler for "tool.query.fanout"
├── config/env.ts                                  (MODIFY) Add QUERY_FANOUT_* vars
├── tools/tools.module.ts                          (MODIFY) Import QueryFanOutModule
├── handlers/handlers.module.ts                    (MODIFY) Register QueryFanOutHandler + QUERY_FANOUT_ENV
├── seed/seed.ts                                   (MODIFY) Add new template
└── tests/
    ├── query-fanout.prompt.test.ts                pure fn — prompt composition
    ├── query-fanout.client.test.ts                mocked LlmClient + 3 calls
    ├── query-fanout.handler.test.ts               mocked client + cache + DataForSEO + RunInput
    └── dataforseo.paa.test.ts                     mocked fetch — paaFetch parsing

packages/shared/src/schemas.ts                     (MODIFY) Add IntentName, FanOutClassification,
                                                            FanOutArea, FanOutIntent, PaaMapping,
                                                            QueryFanOutMetadata, QueryFanOutResult
apps/web/src/components/step-output/
├── query-fanout.tsx                               (NEW) QueryFanOutOutput renderer (3 tabs)
└── index.tsx                                      (MODIFY) Route "tool.query.fanout" + hasRichRenderer
.env.example                                       (MODIFY) Add QUERY_FANOUT_*
scripts/smoke-plan-10.ts                           (NEW) Manual end-to-end smoke test
package.json (root)                                (MODIFY) Add "smoke:plan-10" script
```

---

## Task 1: Shared schemas for QueryFanOutResult

**Files:**
- Modify: `packages/shared/src/schemas.ts` (append at end, after existing `EntityExtractionResult` export at line 397)
- Build: `packages/shared` (must produce `dist/`)

No unit test for pure Zod schemas — runtime tests in later tasks exercise them.

- [ ] **Step 1.1: Append schemas to `packages/shared/src/schemas.ts`**

```ts
export const IntentName = z.enum([
  "Definicyjna",
  "Problemowa",
  "Instrukcyjna",
  "Decyzyjna",
  "Diagnostyczna",
  "Porównawcza",
]);
export type IntentName = z.infer<typeof IntentName>;

export const FanOutClassification = z.enum(["MICRO", "MACRO"]);
export type FanOutClassification = z.infer<typeof FanOutClassification>;

export const FanOutArea = z.object({
  id: z.string().regex(/^A\d+$/, "id must be A<number>"),
  topic: z.string().min(1).max(120),
  question: z.string().min(1).max(300),
  ymyl: z.boolean(),
  classification: FanOutClassification,
  /** For MACRO areas: stripped-of-context evergreen topic & question. Empty string for MICRO. */
  evergreenTopic: z.string().max(120).default(""),
  evergreenQuestion: z.string().max(300).default(""),
});
export type FanOutArea = z.infer<typeof FanOutArea>;

export const FanOutIntent = z.object({
  name: IntentName,
  areas: FanOutArea.array().min(1).max(5),
});
export type FanOutIntent = z.infer<typeof FanOutIntent>;

export const PaaMapping = z.object({
  /** Area ID (A1, A2, ...) the PAA question was assigned to. */
  areaId: z.string().regex(/^A\d+$/),
  /** Real PAA question text from Google (verbatim, original language). */
  question: z.string().min(1).max(500),
});
export type PaaMapping = z.infer<typeof PaaMapping>;

export const QueryFanOutMetadata = z.object({
  keyword: z.string().min(1),
  language: z.string().min(2).max(10),
  /** Number of PAA questions returned by DataForSEO before LLM mapping. 0 if PAA fetch was skipped/empty. */
  paaFetched: z.number().int().nonnegative(),
  /** Whether DataForSEO PAA was used at all in this run (false → skipped due to env or empty result). */
  paaUsed: z.boolean(),
  createdAt: z.string().datetime(),
});
export type QueryFanOutMetadata = z.infer<typeof QueryFanOutMetadata>;

export const QueryFanOutResult = z
  .object({
    metadata: QueryFanOutMetadata,
    /** Normalization step output. */
    normalization: z.object({
      mainEntity: z.string().min(1).max(200),
      category: z.string().min(1).max(120),
      ymylRisk: z.boolean(),
    }),
    /** All intents with their areas. Only intents the LLM judged applicable to the keyword. */
    intents: FanOutIntent.array().min(1),
    /** The single intent the LLM picked as dominant (drives BLUF article structure). */
    dominantIntent: IntentName,
    /** PAA → area mapping. Empty array if PAA fetch was skipped or all PAA were unmatched. */
    paaMapping: PaaMapping.array(),
    /** PAA questions that did not fit any area (returned for transparency / manual review). */
    unmatchedPaa: z.string().array(),
  })
  .superRefine((val, ctx) => {
    // collect all area IDs across all intents
    const areaIds: string[] = [];
    for (const intent of val.intents) {
      for (const area of intent.areas) areaIds.push(area.id);
    }
    const areaIdSet = new Set(areaIds);

    // unique area IDs across the whole result
    if (areaIdSet.size !== areaIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "duplicate area ids across intents",
        path: ["intents"],
      });
    }

    // dominantIntent must be one of the emitted intent names
    const intentNames = new Set(val.intents.map((i) => i.name));
    if (!intentNames.has(val.dominantIntent)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `dominantIntent "${val.dominantIntent}" is not in intents[]`,
        path: ["dominantIntent"],
      });
    }

    // every PAA mapping must reference a known area id
    val.paaMapping.forEach((m, i) => {
      if (!areaIdSet.has(m.areaId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `paaMapping[${i}].areaId "${m.areaId}" is unknown`,
          path: ["paaMapping", i, "areaId"],
        });
      }
    });

    // MICRO areas should have empty evergreenTopic/Question; MACRO should have non-empty
    for (const intent of val.intents) {
      intent.areas.forEach((area, i) => {
        if (area.classification === "MACRO" && area.evergreenTopic.trim() === "") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `area ${area.id} is MACRO but has empty evergreenTopic`,
            path: ["intents"],
          });
        }
      });
    }

    // metadata.paaUsed=false ⇒ paaMapping must be empty (and unmatchedPaa)
    if (!val.metadata.paaUsed) {
      if (val.paaMapping.length > 0 || val.unmatchedPaa.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "paaUsed=false but paaMapping or unmatchedPaa is non-empty",
          path: ["metadata", "paaUsed"],
        });
      }
    }
  });
export type QueryFanOutResult = z.infer<typeof QueryFanOutResult>;
```

Also export per-LLM-call schemas (used by the client to validate each individual `generateObject`):

```ts
/** Output of LLM call #1 (intents + areas, NO classification yet). */
export const FanOutIntentsCall = z.object({
  normalization: z.object({
    mainEntity: z.string().min(1).max(200),
    category: z.string().min(1).max(120),
    ymylRisk: z.boolean(),
  }),
  intents: z
    .object({
      name: IntentName,
      areas: z
        .object({
          id: z.string().regex(/^A\d+$/),
          topic: z.string().min(1).max(120),
          question: z.string().min(1).max(300),
          ymyl: z.boolean(),
        })
        .array()
        .min(1)
        .max(5),
    })
    .array()
    .min(1),
});
export type FanOutIntentsCall = z.infer<typeof FanOutIntentsCall>;

/** Output of LLM call #2 (classification + dominant intent). */
export const FanOutClassifyCall = z.object({
  classifications: z
    .object({
      areaId: z.string().regex(/^A\d+$/),
      classification: FanOutClassification,
      evergreenTopic: z.string().max(120).default(""),
      evergreenQuestion: z.string().max(300).default(""),
    })
    .array()
    .min(1),
  dominantIntent: IntentName,
});
export type FanOutClassifyCall = z.infer<typeof FanOutClassifyCall>;

/** Output of LLM call #3 (PAA assignment). */
export const FanOutPaaCall = z.object({
  assignments: z
    .object({
      areaId: z.string().regex(/^A\d+$/),
      question: z.string().min(1).max(500),
    })
    .array(),
  unmatched: z.string().array(),
});
export type FanOutPaaCall = z.infer<typeof FanOutPaaCall>;
```

- [ ] **Step 1.2: Build the shared package**

```bash
pnpm --filter @sensai/shared build
```

- [ ] **Step 1.3: Verify dist contains the new exports**

```bash
node -e "const m = require('./packages/shared/dist/schemas.js'); console.log(Object.keys(m).filter(k => k.includes('FanOut') || k === 'IntentName' || k === 'PaaMapping'))"
```

Expected: `IntentName`, `FanOutClassification`, `FanOutArea`, `FanOutIntent`, `PaaMapping`, `QueryFanOutMetadata`, `QueryFanOutResult`, `FanOutIntentsCall`, `FanOutClassifyCall`, `FanOutPaaCall`.

---

## Task 2: Environment variables

**Files:**
- Modify: `apps/api/src/config/env.ts`
- Modify: `.env.example`

- [ ] **Step 2.1: Add env keys to the Zod schema in `env.ts`**

Append to `EnvSchema` (after the `ENTITY_EXTRACT_*` block at line 45):

```ts
QUERY_FANOUT_MODEL: z.string().default("openai/gpt-5"),
QUERY_FANOUT_LANGUAGE: z.string().min(2).max(10).default("pl"),
/** Maximum areas the LLM may emit per intent. Capped at 5 by lesson 2.8 rules. */
QUERY_FANOUT_MAX_AREAS_PER_INTENT: z.coerce.number().int().min(1).max(5).default(5),
/** people_also_ask_click_depth — DataForSEO param. 2 = follow up to 2 levels of PAA expansions. */
QUERY_FANOUT_PAA_DEPTH: z.coerce.number().int().min(1).max(4).default(2),
/** Hard cap on PAA questions sent to LLM #3. Truncates DataForSEO output. */
QUERY_FANOUT_PAA_MAX_QUESTIONS: z.coerce.number().int().positive().default(20),
/** Master switch — set false to skip the DataForSEO call entirely (e.g. in CI without DFS quota). */
QUERY_FANOUT_PAA_ENABLED: z.coerce.boolean().default(true),
/** Reasoning effort for LLM #1 (intents+areas). */
QUERY_FANOUT_REASONING_INTENTS: z.enum(["low", "medium", "high"]).default("medium"),
/** Reasoning effort for LLM #2 (mikro/makro classification — hardest call). */
QUERY_FANOUT_REASONING_CLASSIFY: z.enum(["low", "medium", "high"]).default("high"),
/** Reasoning effort for LLM #3 (PAA assignment). */
QUERY_FANOUT_REASONING_PAA: z.enum(["low", "medium", "high"]).default("medium"),
```

- [ ] **Step 2.2: Mirror keys into `.env.example`** with the same defaults documented inline.

- [ ] **Step 2.3: Typecheck**

```bash
pnpm --filter @sensai/api typecheck
```

---

## Task 3: DataForSEO PAA extension

**Files:**
- New: `apps/api/src/tools/dataforseo/paa.types.ts`
- Modify: `apps/api/src/tools/dataforseo/dataforseo.client.ts`
- New: `apps/api/src/tests/dataforseo.paa.test.ts`

DataForSEO `/serp/google/organic/live/advanced` returns a denser SERP than `/regular`, including `people_also_ask` items. We extract just the PAA list.

- [ ] **Step 3.1: Create `paa.types.ts`**

```ts
export interface PaaFetchParams {
  keyword: string;
  /** ISO language code, e.g. "pl". */
  languageCode: string;
  /** DataForSEO numeric location code (Poland=2616, US=2840, DE=2276, FR=2250). */
  locationCode: number;
  /** people_also_ask_click_depth — 1..4. */
  depth: number;
}

export interface PaaQuestion {
  /** Verbatim PAA question text from Google. */
  title: string;
}

export interface PaaRawResponse {
  status_code: number;
  status_message?: string;
  tasks: Array<{
    cost?: number;
    result: Array<{
      items?: Array<{
        type?: string;
        items?: Array<{ title?: string; type?: string }>;
      }>;
    }> | null;
  }>;
}
```

- [ ] **Step 3.2: Add `paaFetch` method to `DataForSeoClient`**

After `serpOrganicLive`, add:

```ts
async paaFetch(params: PaaFetchParams): Promise<PaaQuestion[]> {
  const body = [{
    keyword: params.keyword,
    location_code: params.locationCode,
    language_code: params.languageCode,
    device: "desktop",
    people_also_ask_click_depth: params.depth,
  }];

  const raw = await pRetry(
    () => this.postRaw("/serp/google/organic/live/advanced", body),
    { retries: 2, factor: 2, minTimeout: 500 },
  );

  const out: PaaQuestion[] = [];
  for (const task of raw.tasks ?? []) {
    for (const result of task.result ?? []) {
      for (const item of result.items ?? []) {
        if (item.type === "people_also_ask") {
          for (const sub of item.items ?? []) {
            if (sub.title) out.push({ title: sub.title });
          }
        }
      }
    }
  }
  // dedupe preserving order
  const seen = new Set<string>();
  return out.filter((q) => {
    if (seen.has(q.title)) return false;
    seen.add(q.title);
    return true;
  });
}

/** Generic post that does NOT cast to SerpRawResponse — for endpoints with different shapes. */
private async postRaw<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(DataForSeoClient.BASE + path, {
    method: "POST",
    headers: {
      Authorization: this.authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new HttpError(res.status, text);
    if (res.status >= 400 && res.status < 500 && res.status !== 429) {
      throw new AbortError(err);
    }
    throw err;
  }
  const json = (await res.json()) as { status_code: number; status_message?: string };
  if (json.status_code !== 20000) {
    throw new AbortError(new DataForSeoApiError(json.status_code, json.status_message ?? ""));
  }
  return json as T;
}
```

Import the new types at the top of the file:

```ts
import type { PaaFetchParams, PaaQuestion, PaaRawResponse } from "./paa.types";
```

(Refactor the existing `post` to call `postRaw<SerpRawResponse>` if you want to deduplicate — optional, do not block on it.)

- [ ] **Step 3.3: Unit test `dataforseo.paa.test.ts`**

Mock `fetch` globally with two scenarios:
- happy path: response containing 2 `people_also_ask` blocks with 5 questions total → expect 5 deduped `PaaQuestion`s.
- empty result: `tasks: [{ result: null }]` → expect `[]`.
- duplicates: same PAA appears twice → expect single output preserving first occurrence.
- non-200 HTTP → expect `HttpError` rethrown for 5xx, `AbortError`-wrapped for 4xx.

```bash
pnpm --filter @sensai/api test dataforseo.paa
```

---

## Task 4: Fan-out prompts module

**Files:**
- New: `apps/api/src/prompts/query-fanout.prompt.ts`
- New: `apps/api/src/tests/query-fanout.prompt.test.ts`

Three prompt builders — `intents`, `classify`, `paa`. All in Polish (per lesson — "polski lepiej komunikuje się z modelem"), but the language can be parameterized later.

- [ ] **Step 4.1: Create `query-fanout.prompt.ts`**

```ts
export const queryFanoutPrompt = {
  /** LLM #1 — intents + areas. Translates lesson 2.8 advanced-intent-themes prompt. */
  intents: {
    system: `Jesteś ekspertem semantyki w języku polskim. Rozbij podane zapytanie na podtematy według zdefiniowanych intencji użytkownika.

# Algorytm
## Krok 1: Normalizacja
- Zapisz zapytanie
- Ustal główną encję (mainEntity)
- Ustal kategorię tematyczną (category)
- Oceń, czy temat należy do YMYL (Your Money, Your Life)

## Krok 2: Intencje
Rozważ KAŻDĄ z poniższych intencji — wybierz tylko te pasujące do głównego słowa kluczowego:
- Definicyjna - czym jest, co to znaczy
- Problemowa - objawy, przyczyny, skutki problemu
- Instrukcyjna - jak zrobić, jak osiągnąć
- Decyzyjna - który wybrać, porównanie opcji
- Diagnostyczna - jak sprawdzić, jak zmierzyć
- Porównawcza - różnice, porównania, plusy i minusy

## Krok 3: Obszary (areas)
Dla każdej wybranej intencji wypisz obszary tematyczne, które:
- mają własną logikę
- są SILNIE POWIĄZANE z głównym słowem kluczowym
- nie są wypełnieniem na siłę
- maks. {{MAX_AREAS}} obszarów na intencję

Każdy obszar ma:
- id w formacie A1, A2, ... (numeracja globalna, narastająca, unikalna)
- topic (2-4 słowa opisujące obszar)
- question (jedno konkretne pytanie pomocnicze)
- ymyl: true tylko gdy błędna informacja może zaszkodzić zdrowiu, finansom lub mieć konsekwencje prawne; false dla zwykłych porad domowych, hobby, rozrywki

# Zasady
- Zwróć poprawny JSON pasujący do dostarczonego schematu.
- Nie używaj na siłę wszystkich 6 intencji — tylko te, które realnie pasują.
- Numeracja id obszarów MUSI być globalnie unikalna (A1, A2, A3 ... niezależnie od intencji).`,

    user: (params: { keyword: string; language: string; maxAreas: number }) =>
      `Słowo kluczowe: "${params.keyword}"
Język outputu: ${params.language}
Maksymalna liczba obszarów na intencję: ${params.maxAreas}`,
  },

  /** LLM #2 — MICRO/MACRO classification + dominant intent. Translates advanced-classification prompt. */
  classify: {
    system: `Jesteś ekspertem semantyki w języku polskim. Sklasyfikuj każdy obszar/temat jako MICRO (sekcja w artykule głównym) lub MACRO (osobny artykuł).

# Test samodzielności
Dla każdego obszaru/tematu zadaj pytanie:
"Czy użytkownik mógłby wpisać to jako OSOBNE zapytanie i oczekiwać OSOBNEJ, pełnej odpowiedzi?"
- TAK → MACRO (osobny artykuł, evergreen)
- NIE → MICRO (sekcja w artykule głównym)

# Zasady
- MICRO: zachowaj topic i question 1:1 (puste evergreenTopic / evergreenQuestion).
- MACRO: usuń kontekst specyficzny z zapytania głównego (np. "po 40tce", "dla kobiet", "w ciąży"); wypełnij evergreenTopic i evergreenQuestion ogólnymi wersjami.
- Wybierz dokładnie JEDNĄ intencję jako dominantIntent — to ta, która najlepiej odpowiada na główne zapytanie i będzie strukturą artykułu (BLUF).
- Wynik to klasyfikacja obszarów według intencji, NIE struktura artykułu.`,

    user: (params: { keyword: string; intentsJson: string }) =>
      `Główne zapytanie: "${params.keyword}"

Intencje i obszary do sklasyfikowania:
${params.intentsJson}`,
  },

  /** LLM #3 — PAA assignment. Translates the simple_paa.py PROMPT_PART2. */
  paa: {
    system: `Jesteś ekspertem semantyki w języku polskim. Przypisz pytania PAA (People Also Ask) do odpowiednich obszarów tematycznych.

# Zasady
1. Dla każdego pytania PAA znajdź NAJBARDZIEJ pasujący obszar (po areaId).
2. Pytanie PAA przypisuj TYLKO jeśli jest SPECYFICZNE dla danego obszaru.
3. Ogólne pytania (pasujące do całego zapytania, ale nie do konkretnego obszaru) → unmatched.
4. Jedno pytanie PAA może trafić do TYLKO jednego areaId (lub do unmatched).
5. Używaj DOKŁADNYCH areaId z listy obszarów (np. A1, A2, ...). Nie wymyślaj nowych.
6. Nie modyfikuj treści pytań PAA — kopiuj 1:1.`,

    user: (params: {
      keyword: string;
      areasJson: string;
      paaQuestions: string[];
    }) =>
      `Główne zapytanie: "${params.keyword}"

Obszary (areaId + topic + question):
${params.areasJson}

Pytania PAA do przypisania:
${params.paaQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`,
  },
};
```

Note the `{{MAX_AREAS}}` placeholder in the `intents.system` prompt — replace it at composition time:

```ts
const systemWithCap = queryFanoutPrompt.intents.system.replace("{{MAX_AREAS}}", String(maxAreas));
```

(Or refactor `intents.system` into a function that takes `maxAreas`. Pick one — the test below assumes the function-style refactor for cleanliness.)

- [ ] **Step 4.2: Refactor `intents.system` to a function**

```ts
intents: {
  system: (maxAreas: number) => `Jesteś ekspertem ... maks. ${maxAreas} obszarów ...`,
  user: (...) => ...,
},
```

This eliminates the magic-string replacement and lets the test verify composition cleanly.

- [ ] **Step 4.3: Unit test `query-fanout.prompt.test.ts`**

Verify each builder is a pure function:
- `intents.system(5)` contains "maks. 5 obszarów"
- `intents.system(3)` contains "maks. 3 obszary" (or "obszarów" — Polish plural; check whichever you wrote)
- `intents.user({ keyword, language, maxAreas })` contains the keyword and language verbatim
- `classify.user` includes `intentsJson` verbatim
- `paa.user` numbers questions starting from 1
- All three system prompts are non-empty strings ≥ 100 chars

```bash
pnpm --filter @sensai/api test query-fanout.prompt
```

---

## Task 5: QueryFanOutClient (LLM wrapper)

**Files:**
- New: `apps/api/src/tools/query-fanout/query-fanout.client.ts`
- New: `apps/api/src/tools/query-fanout/query-fanout.module.ts`
- New: `apps/api/src/tools/query-fanout/query-fanout.types.ts`
- New: `apps/api/src/tests/query-fanout.client.test.ts`

The client wraps **three** structured `generateObject` calls and returns aggregated cost. The handler will compose the final `QueryFanOutResult` from these — keeping the client concerned only with single-call mechanics.

- [ ] **Step 5.1: Inspect the existing LlmClient**

Read `apps/api/src/llm/llm.client.ts` (introduced in Plan 06/07/09). Identify:
- The `generateObject<T>(opts)` signature.
- How `providerOptions` are forwarded (key for the OpenRouter passthrough — likely `openrouter` or `openai-compatible`).
- The cost-tracking shape returned alongside the validated result.

Write the actual call signature in `query-fanout.client.ts` to match.

- [ ] **Step 5.2: Define `QueryFanOutClient`**

Sketch:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { LlmClient } from "../../llm/llm.client";
import {
  FanOutClassifyCall,
  FanOutIntentsCall,
  FanOutPaaCall,
} from "@sensai/shared";
import type { Env } from "../../config/env";
import { queryFanoutPrompt } from "../../prompts/query-fanout.prompt";

type ClientEnv = Pick<
  Env,
  | "QUERY_FANOUT_MODEL"
  | "QUERY_FANOUT_LANGUAGE"
  | "QUERY_FANOUT_MAX_AREAS_PER_INTENT"
  | "QUERY_FANOUT_REASONING_INTENTS"
  | "QUERY_FANOUT_REASONING_CLASSIFY"
  | "QUERY_FANOUT_REASONING_PAA"
>;

interface CallCtx { runId: string; stepId: string; attempt: number }

@Injectable()
export class QueryFanOutClient {
  constructor(
    private readonly llm: LlmClient,
    @Inject("QUERY_FANOUT_ENV") private readonly env: ClientEnv,
  ) {}

  async generateIntents(opts: { ctx: CallCtx; keyword: string }) {
    const system = queryFanoutPrompt.intents.system(this.env.QUERY_FANOUT_MAX_AREAS_PER_INTENT);
    const user = queryFanoutPrompt.intents.user({
      keyword: opts.keyword,
      language: this.env.QUERY_FANOUT_LANGUAGE,
      maxAreas: this.env.QUERY_FANOUT_MAX_AREAS_PER_INTENT,
    });
    return this.llm.generateObject({
      model: this.env.QUERY_FANOUT_MODEL,
      schema: FanOutIntentsCall,
      system,
      prompt: user,
      providerOptions: this.reasoning(this.env.QUERY_FANOUT_REASONING_INTENTS),
      ctx: opts.ctx,
    });
  }

  async classify(opts: {
    ctx: CallCtx;
    keyword: string;
    intents: FanOutIntentsCall["intents"];
  }) {
    const system = queryFanoutPrompt.classify.system;
    const user = queryFanoutPrompt.classify.user({
      keyword: opts.keyword,
      intentsJson: JSON.stringify(opts.intents, null, 2),
    });
    return this.llm.generateObject({
      model: this.env.QUERY_FANOUT_MODEL,
      schema: FanOutClassifyCall,
      system,
      prompt: user,
      providerOptions: this.reasoning(this.env.QUERY_FANOUT_REASONING_CLASSIFY),
      ctx: opts.ctx,
    });
  }

  async assignPaa(opts: {
    ctx: CallCtx;
    keyword: string;
    areas: Array<{ id: string; topic: string; question: string }>;
    paaQuestions: string[];
  }) {
    const system = queryFanoutPrompt.paa.system;
    const user = queryFanoutPrompt.paa.user({
      keyword: opts.keyword,
      areasJson: JSON.stringify(opts.areas, null, 2),
      paaQuestions: opts.paaQuestions,
    });
    return this.llm.generateObject({
      model: this.env.QUERY_FANOUT_MODEL,
      schema: FanOutPaaCall,
      system,
      prompt: user,
      providerOptions: this.reasoning(this.env.QUERY_FANOUT_REASONING_PAA),
      ctx: opts.ctx,
    });
  }

  private reasoning(effort: "low" | "medium" | "high") {
    // VERIFY the actual provider key by reading llm.client.ts — likely `openrouter` or `openai-compatible`.
    return { providerOptions: { openrouter: { reasoning_effort: effort } } };
  }
}
```

> **VERIFY** during Task 5.1: if `LlmClient.generateObject` doesn't expose `providerOptions`, either extend it (smallest possible change — just pass-through) or skip reasoning_effort entirely and document in the smoke report. Plan 09's `EntityExtractorClient` doesn't pass reasoning, so this is genuinely new wiring. Prefer the smallest patch.

- [ ] **Step 5.3: Define `QueryFanOutModule`**

```ts
@Module({
  imports: [LlmModule],
  providers: [QueryFanOutClient],
  exports: [QueryFanOutClient],
})
export class QueryFanOutModule {}
```

Match the import path / module name conventions used by `EntityExtractorModule`.

- [ ] **Step 5.4: Unit test `query-fanout.client.test.ts`**

Mock `LlmClient` and verify:
- `generateIntents` calls `llm.generateObject` once with model = env.QUERY_FANOUT_MODEL, schema = `FanOutIntentsCall`, and reasoning effort = env.QUERY_FANOUT_REASONING_INTENTS.
- `classify` and `assignPaa` similarly route to the right schema and reasoning effort.
- The `system` and `prompt` strings match what `queryFanoutPrompt.{intents,classify,paa}` produce for the given inputs.
- Cost is propagated unchanged from the underlying call.

```bash
pnpm --filter @sensai/api test query-fanout.client
```

---

## Task 6: QueryFanOutHandler (orchestration)

**Files:**
- New: `apps/api/src/handlers/query-fanout.handler.ts`
- New: `apps/api/src/tests/query-fanout.handler.test.ts`

The handler is the brains — it (a) reads the keyword from `RunInput`, (b) outer-caches the whole result for 7 days, (c) inner-caches PAA for 30 days, (d) sequences the 3 LLM calls, (e) assembles `QueryFanOutResult` and runs final Zod superRefine.

- [ ] **Step 6.1: Create `query-fanout.handler.ts`**

```ts
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { StepContext, StepHandler, StepResult } from "../orchestrator/step-handler";
import { QueryFanOutClient } from "../tools/query-fanout/query-fanout.client";
import { DataForSeoClient } from "../tools/dataforseo/dataforseo.client";
import { ToolCacheService } from "../tools/tool-cache.service";
import {
  type QueryFanOutResult,
  type RunInput,
  type FanOutArea,
  type FanOutIntent,
  QueryFanOutResult as QueryFanOutResultSchema,
} from "@sensai/shared";
import type { Env } from "../config/env";

const FANOUT_TTL_DAYS = 7;
const PAA_TTL_DAYS = 30;

const LOCATION_CODES: Record<string, number> = {
  pl: 2616,
  en: 2840,
  de: 2276,
  fr: 2250,
};

type HandlerEnv = Pick<
  Env,
  | "QUERY_FANOUT_LANGUAGE"
  | "QUERY_FANOUT_MODEL"
  | "QUERY_FANOUT_PAA_DEPTH"
  | "QUERY_FANOUT_PAA_MAX_QUESTIONS"
  | "QUERY_FANOUT_PAA_ENABLED"
>;

@Injectable()
export class QueryFanOutHandler implements StepHandler {
  readonly type = "tool.query.fanout";
  private readonly logger = new Logger(QueryFanOutHandler.name);

  constructor(
    private readonly fanout: QueryFanOutClient,
    private readonly dfs: DataForSeoClient,
    private readonly cache: ToolCacheService,
    @Inject("QUERY_FANOUT_ENV") private readonly env: HandlerEnv,
  ) {}

  async execute(ctx: StepContext): Promise<StepResult> {
    const keyword = this.composeKeyword(ctx.run.input as RunInput);
    const language = this.env.QUERY_FANOUT_LANGUAGE;
    const model = this.env.QUERY_FANOUT_MODEL;

    const result = await this.cache.getOrSet<QueryFanOutResult>({
      tool: "query",
      method: "fanout",
      params: {
        keyword,
        language,
        model,
        paaEnabled: this.env.QUERY_FANOUT_PAA_ENABLED,
        paaDepth: this.env.QUERY_FANOUT_PAA_DEPTH,
        paaMax: this.env.QUERY_FANOUT_PAA_MAX_QUESTIONS,
      },
      ttlSeconds: FANOUT_TTL_DAYS * 24 * 3600,
      runId: ctx.run.id,
      stepId: ctx.step.id,
      forceRefresh: ctx.forceRefresh,
      fetcher: async () => {
        const t0 = Date.now();
        let totalCost = 0;

        // 1. PAA fetch (inner-cached 30d)
        let paaQuestions: string[] = [];
        if (this.env.QUERY_FANOUT_PAA_ENABLED) {
          paaQuestions = await this.fetchPaaCached(keyword, language, ctx);
        }

        // 2. LLM #1 — intents + areas
        const intentsCall = await this.fanout.generateIntents({
          ctx: { runId: ctx.run.id, stepId: ctx.step.id, attempt: ctx.attempt },
          keyword,
        });
        totalCost += parseFloat(intentsCall.costUsd ?? "0");

        // 3. LLM #2 — classify + dominant intent
        const classifyCall = await this.fanout.classify({
          ctx: { runId: ctx.run.id, stepId: ctx.step.id, attempt: ctx.attempt },
          keyword,
          intents: intentsCall.result.intents,
        });
        totalCost += parseFloat(classifyCall.costUsd ?? "0");

        // 4. LLM #3 — PAA assignment (only if we have PAA)
        let paaMapping: QueryFanOutResult["paaMapping"] = [];
        let unmatchedPaa: string[] = [];
        if (paaQuestions.length > 0) {
          const flatAreas = intentsCall.result.intents.flatMap((i) =>
            i.areas.map((a) => ({ id: a.id, topic: a.topic, question: a.question })),
          );
          const paaCall = await this.fanout.assignPaa({
            ctx: { runId: ctx.run.id, stepId: ctx.step.id, attempt: ctx.attempt },
            keyword,
            areas: flatAreas,
            paaQuestions,
          });
          totalCost += parseFloat(paaCall.costUsd ?? "0");
          paaMapping = paaCall.result.assignments;
          unmatchedPaa = paaCall.result.unmatched;
        }

        // 5. Assemble final result
        const classByAreaId = new Map(
          classifyCall.result.classifications.map((c) => [c.areaId, c]),
        );
        const intents: FanOutIntent[] = intentsCall.result.intents.map((i) => ({
          name: i.name,
          areas: i.areas.map((a): FanOutArea => {
            const cls = classByAreaId.get(a.id);
            if (!cls) {
              throw new Error(`classification missing for area ${a.id}`);
            }
            return {
              id: a.id,
              topic: a.topic,
              question: a.question,
              ymyl: a.ymyl,
              classification: cls.classification,
              evergreenTopic: cls.classification === "MACRO" ? cls.evergreenTopic : "",
              evergreenQuestion: cls.classification === "MACRO" ? cls.evergreenQuestion : "",
            };
          }),
        }));

        const assembled: QueryFanOutResult = {
          metadata: {
            keyword,
            language,
            paaFetched: paaQuestions.length,
            paaUsed: paaQuestions.length > 0,
            createdAt: new Date().toISOString(),
          },
          normalization: intentsCall.result.normalization,
          intents,
          dominantIntent: classifyCall.result.dominantIntent,
          paaMapping,
          unmatchedPaa,
        };

        // 6. Validate via the combined schema (superRefine catches cross-call inconsistencies)
        const validated = QueryFanOutResultSchema.parse(assembled);

        const latencyMs = Date.now() - t0;
        this.logger.log(
          {
            intents: validated.intents.length,
            areas: validated.intents.reduce((acc, i) => acc + i.areas.length, 0),
            paaFetched: validated.metadata.paaFetched,
            paaMapped: validated.paaMapping.length,
            paaUnmatched: validated.unmatchedPaa.length,
            dominantIntent: validated.dominantIntent,
            costUsd: totalCost.toFixed(6),
            latencyMs,
          },
          "query-fanout done",
        );

        return { result: validated, costUsd: totalCost.toFixed(6), latencyMs };
      },
    });

    return { output: result };
  }

  private async fetchPaaCached(
    keyword: string,
    language: string,
    ctx: StepContext,
  ): Promise<string[]> {
    const locationCode = LOCATION_CODES[language] ?? 2616;
    const cached = await this.cache.getOrSet<string[]>({
      tool: "dataforseo",
      method: "paa",
      params: {
        keyword,
        languageCode: language,
        locationCode,
        depth: this.env.QUERY_FANOUT_PAA_DEPTH,
      },
      ttlSeconds: PAA_TTL_DAYS * 24 * 3600,
      runId: ctx.run.id,
      stepId: ctx.step.id,
      forceRefresh: ctx.forceRefresh,
      fetcher: async () => {
        const t0 = Date.now();
        const raw = await this.dfs.paaFetch({
          keyword,
          languageCode: language,
          locationCode,
          depth: this.env.QUERY_FANOUT_PAA_DEPTH,
        });
        const titles = raw.map((q) => q.title).slice(0, this.env.QUERY_FANOUT_PAA_MAX_QUESTIONS);
        return {
          result: titles,
          costUsd: "0", // DataForSEO cost tracking is at the integration layer; OK to record 0 here
          latencyMs: Date.now() - t0,
        };
      },
    });
    return cached;
  }

  private composeKeyword(input: RunInput): string {
    let kw = input.topic;
    if (input.mainKeyword) kw += ` (${input.mainKeyword})`;
    if (input.intent) kw += ` — ${input.intent}`;
    return kw;
  }
}
```

> **VERIFY** the exact `ToolCacheService.getOrSet` signature (especially how it returns `result` vs the wrapper). Plan 06/07/09 use `getOrSet<T>(...)` returning `T`. The fetcher must return `{ result, costUsd, latencyMs }`. If the API evolved, adjust.

- [ ] **Step 6.2: Unit test `query-fanout.handler.test.ts`**

Mock `QueryFanOutClient`, `DataForSeoClient`, and `ToolCacheService` (pass-through `getOrSet`). Cover:

1. **Happy path with PAA**: 5 PAA returned, intents call returns 3 intents × 3 areas = 9 areas, classify maps all 9, paa maps 3/5 (2 unmatched). Verify final `QueryFanOutResult` has `paaUsed: true`, `paaFetched: 5`, `paaMapping.length === 3`, `unmatchedPaa.length === 2`.
2. **Happy path PAA disabled** (`QUERY_FANOUT_PAA_ENABLED=false`): no DataForSEO call, no LLM #3 call, `paaUsed: false`, `paaMapping: []`.
3. **Empty PAA result**: DataForSEO returns 0 PAA, LLM #3 is skipped, `paaUsed: false`, `paaFetched: 0`.
4. **Classification missing for an area** → throws `classification missing for area Ax`.
5. **superRefine violation** (e.g. duplicate area IDs from intents call) → ZodError thrown, step fails.
6. **Cache hit** on outer key: handler returns the cached `QueryFanOutResult` without invoking LLM/DataForSEO.
7. **forceRefresh**: outer + inner cache both bypassed.
8. **`composeKeyword`**: with `mainKeyword` and `intent` → produces `"<topic> (<mk>) — <intent>"`.

```bash
pnpm --filter @sensai/api test query-fanout.handler
```

---

## Task 7: Wire the module into the NestJS app

**Files:**
- Modify: `apps/api/src/tools/tools.module.ts`
- Modify: `apps/api/src/handlers/handlers.module.ts`

- [ ] **Step 7.1: Register `QueryFanOutModule` in `tools.module.ts`**

Mirror how `EntityExtractorModule` was added. Add to `imports`/`exports`.

- [ ] **Step 7.2: Register `QueryFanOutHandler` in `handlers.module.ts`**

```ts
import { QueryFanOutHandler } from "./query-fanout.handler";
// ...
providers: [
  // ...existing handlers...
  QueryFanOutHandler,
  {
    provide: "QUERY_FANOUT_ENV",
    useFactory: () => loadEnv(),
  },
  {
    provide: STEP_HANDLERS,
    useFactory: (
      brief, serp, scrape, youcom, clean, extract, entities,
      fanout: QueryFanOutHandler,
    ): StepHandler[] => [brief, serp, scrape, youcom, clean, extract, entities, fanout],
    inject: [
      // ...existing handlers...
      QueryFanOutHandler,
    ],
  },
],
```

- [ ] **Step 7.3: Build & typecheck**

```bash
pnpm --filter @sensai/api typecheck
pnpm --filter @sensai/api build
```

---

## Task 8: Seed template

**Files:**
- Modify: `apps/api/src/seed/seed.ts`

- [ ] **Step 8.1: Add new template `"Blog SEO — fanout + deep research + clean + extract + entities"`**

After the existing `blogSeoEntities` template:

```ts
const blogSeoFanout = await upsertTemplate(
  db,
  "Blog SEO — fanout + deep research + clean + extract + entities",
  1,
  {
    steps: [
      // fanout MUST come first (lowest stepOrder) — orchestrator schedules by stepOrder+1, not dependsOn
      { key: "fanout",       type: "tool.query.fanout",   auto: true,  dependsOn: [] },
      { key: "deepResearch", type: "tool.youcom.research", auto: true, dependsOn: [] },
      { key: "research",     type: "tool.serp.fetch",     auto: true,  dependsOn: [] },
      { key: "scrape",       type: "tool.scrape",         auto: false, dependsOn: ["research"] },
      { key: "clean",        type: "tool.content.clean",  auto: true,  dependsOn: ["scrape"] },
      { key: "extract",      type: "tool.content.extract", auto: true, dependsOn: ["clean", "deepResearch"] },
      { key: "entities",     type: "tool.entity.extract", auto: true,  dependsOn: ["clean", "deepResearch"] },
      { key: "brief",        type: "llm.brief",           auto: true,  dependsOn: ["extract"] },
    ],
  },
);
console.log(`    "${blogSeoFanout.name}" v${blogSeoFanout.version}: ${blogSeoFanout.id}`);
```

> Note: `fanout` does NOT block `brief` — the brief handler doesn't consume fan-out yet (deferred). It exists in the template purely so the user can see the fan-out output alongside the rest of the pipeline.

- [ ] **Step 8.2: Re-seed**

```bash
pnpm --filter @sensai/api seed
```

Verify the new template id is logged.

---

## Task 9: Web UI — QueryFanOutOutput component

**Files:**
- New: `apps/web/src/components/step-output/query-fanout.tsx`
- Modify: `apps/web/src/components/step-output/index.tsx`

Three tabs:
1. **Intencje + obszary** — accordion grouped by `intent.name`, dominant intent badged "GŁÓWNA". Each area row shows topic / question / YMYL badge / classification badge (MICRO/MACRO).
2. **Mikro vs Makro** — split: left column "Artykuł główny" (all MICRO areas, grouped by intent, with a heading "Intencja dominująca: X"); right column "Backlog ewergreen" (all MACRO areas using `evergreenTopic` / `evergreenQuestion`).
3. **PAA mapping** — left column: PAA grouped under their assigned area (`A1: <topic>` → list of PAA questions); right column: `unmatchedPaa` list. Empty state when `metadata.paaUsed === false`.

Header strip shows: `keyword`, `dominantIntent`, `paaFetched | paaMapped | unmatchedPaa.length`, `mainEntity` / `category` / `ymylRisk` (badge).

- [ ] **Step 9.1: Create `query-fanout.tsx`**

Use the same imports / helpers as `entities.tsx` — `Card`, `Badge`, `Tabs`, etc. (whatever shadcn-style primitives that file uses). Import the type:

```ts
import type { QueryFanOutResult } from "@sensai/shared";
```

Validate at the component boundary with `QueryFanOutResult.parse(value)` (or `safeParse` + JsonFallback on failure — match the convention in `entities.tsx`).

Use `relations.areaId` as a stable React `key`; never use index. Use Polish closing quote `”` not `"` in user-facing strings (per `0c85b82` from Plan 09).

- [ ] **Step 9.2: Route in `index.tsx`**

Add:

```ts
import { QueryFanOutOutput } from "./query-fanout";
// ...
case "tool.query.fanout":
  return <QueryFanOutOutput value={value} />;
```

And in `hasRichRenderer`:

```ts
type === "tool.query.fanout" ||
```

- [ ] **Step 9.3: Web typecheck + build**

```bash
pnpm --filter @sensai/web typecheck
pnpm --filter @sensai/web build
```

---

## Task 10: Smoke test + end-to-end verification

**Files:**
- New: `scripts/smoke-plan-10.ts`
- Modify: `package.json` (root) — add `"smoke:plan-10": "tsx scripts/smoke-plan-10.ts"`

The smoke test is a manual end-to-end sanity check — runs the handler against real OpenRouter + DataForSEO, prints the assembled `QueryFanOutResult`, and asserts shape invariants. Mirror `scripts/smoke-plan-09.ts`.

- [ ] **Step 10.1: Write `smoke-plan-10.ts`**

Contract:
- Loads env, builds a Nest standalone application context (or instantiates the handler manually with concrete deps).
- Hardcoded keyword: `"Jak obniżyć kortyzol po 40tce?"` (lesson example — produces a recognizable fan-out).
- Calls `handler.execute({ run: { id, input }, step: { id }, attempt: 1, forceRefresh: true, previousOutputs: {} })`.
- Asserts:
  - `result.intents.length >= 2`
  - all area IDs unique and matching `/^A\d+$/`
  - `dominantIntent` is one of `result.intents.map(i => i.name)`
  - if `metadata.paaUsed`: `paaMapping.length + unmatchedPaa.length === paaFetched`
  - every MACRO area has non-empty `evergreenTopic`
  - `costUsd > 0` and `< 0.5` (gpt-5 with reasoning is more expensive than gemini-flash; 0.5 is a generous ceiling)
- Prints a tabular summary of intents → areas → classification.

Exit code 0 on success, 1 on any assertion failure.

- [ ] **Step 10.2: Add the npm script to root `package.json`**

```json
"smoke:plan-10": "tsx scripts/smoke-plan-10.ts"
```

- [ ] **Step 10.3: Run the smoke (DataForSEO + OpenRouter must be configured)**

```bash
pnpm smoke:plan-10
```

Capture the printed `costUsd`, `latencyMs`, and area counts in the PR description.

- [ ] **Step 10.4: Re-run smoke with `QUERY_FANOUT_PAA_ENABLED=false`**

```bash
QUERY_FANOUT_PAA_ENABLED=false pnpm smoke:plan-10
```

Verify: no DataForSEO call (check logs), `metadata.paaUsed === false`, `paaMapping === []`, smoke still passes assertions.

- [ ] **Step 10.5: End-to-end via UI**

1. Start dev: `pnpm dev` (api + web + redis + postgres via docker-compose).
2. Open the UI, create a run from the new template `"Blog SEO — fanout + deep research + clean + extract + entities"` with input `{ topic: "Jak obniżyć kortyzol po 40tce?" }`.
3. Wait for `tool.query.fanout` to complete (should be the first step; runs parallel with `serp` and `deepResearch`).
4. Click into the step — verify all three tabs render correctly.
5. Test Plan 08 manual rerun on `tool.query.fanout` with `forceRefresh: true` — verify it bypasses both outer and inner caches (logs should show fresh DataForSEO + 3 LLM calls).

- [ ] **Step 10.6: Full automated verification**

```bash
pnpm --filter @sensai/shared build
pnpm --filter @sensai/api typecheck && pnpm --filter @sensai/api test
pnpm --filter @sensai/web typecheck && pnpm --filter @sensai/web build
```

All must pass. Note new test count delta (expect ~6-10 new tests across prompt / client / handler / dataforseo-paa).

---

## Self-Review Checklist

Before opening the PR, walk through:

- [ ] **Schema integrity** — `superRefine` covers: unique area IDs, dominantIntent ∈ intents, paaMapping references known IDs, MACRO ⇒ non-empty evergreen, paaUsed=false ⇒ empty PAA arrays. Each assertion has a unit test in `query-fanout.handler.test.ts`.
- [ ] **`previousOutputs` is NOT read by the handler** — fan-out is a leaf-input step, depends only on `RunInput`. Grep the handler for `previousOutputs` — should return zero matches.
- [ ] **DI token isolation** — `QUERY_FANOUT_ENV` is registered separately from `EXTRACT_ENV` and `ENTITY_EXTRACT_ENV`. `grep -r '"QUERY_FANOUT_ENV"' apps/api/src` should show 2 references (provide + inject).
- [ ] **Caching layers** — outer 7-day cache key includes `paaEnabled` so toggling the env var doesn't return stale results; inner 30-day PAA cache key includes `depth` so changing `QUERY_FANOUT_PAA_DEPTH` invalidates correctly.
- [ ] **Step ordering in seed** — `fanout` is FIRST in the new template's `steps` array (lowest stepOrder). Otherwise the orchestrator schedules it after siblings.
- [ ] **No reasoning-effort regression for other plans** — only `QueryFanOutClient` passes `providerOptions.reasoning_effort`. EntityExtractor and ContentExtract calls are unchanged.
- [ ] **Pricing entry exists** — `openai/gpt-5` is in `pricing.ts` (line 10). No new pricing rows added.
- [ ] **Polish closing quotes** in user-facing strings (per `0c85b82`): use `”` not `"`.
- [ ] **Stable React keys** — UI uses `area.id` and `mapping.areaId+question.slice(0,32)` etc., never `index`.
- [ ] **`smoke:plan-10` runs green** with PAA on AND with PAA disabled.
- [ ] **No half-finished code** — every new file is referenced by at least one import; every new env var is read by at least one handler.

---

## Out of Scope (deferred)

These are intentionally not part of Plan 10:

1. **Brief handler integration.** `llm.brief` continues to depend only on `extract`. Consuming `dominantIntent` to drive BLUF structure or `intents[]` to seed article sections is a follow-up plan (Plan 11+).
2. **Fan-out → scrape/research routing.** Mentor's vision in lesson 2.8 is that fan-out shapes downstream queries (e.g. one SERP per area). For Plan 10, scrape and deepResearch use the same single keyword they always did.
3. **Knowledge-graph layer (lesson 2.9).** Combining entity extraction (Plan 09) + fan-out (Plan 10) into a graph view is the natural Plan 11 scope.
4. **Multi-language fan-out.** Prompts are Polish-only. The `QUERY_FANOUT_LANGUAGE` env var is forwarded to LLM calls but the prompt instructions themselves stay in Polish (per lesson rationale).
5. **PAA freshness signal.** No re-fetch trigger on the 30-day cache; users wanting fresh PAA must use Plan 08 manual rerun with `forceRefresh`.

---

## Summary

Plan 10 adds a `tool.query.fanout` step that runs **early** in the pipeline and produces a structured semantic fan-out (intents × areas × YMYL × MICRO/MACRO × PAA mapping). It uses **3 LLM calls** to `openai/gpt-5` (with reasoning effort medium/high/medium) and **1 DataForSEO call** for People Also Ask. Outer cache 7 days, inner PAA cache 30 days. Fail-closed via Zod superRefine on cross-call integrity (unique IDs, dominant intent membership, PAA reference validity, MACRO ⇒ evergreen). Brief integration deferred. New template `"Blog SEO — fanout + deep research + clean + extract + entities"`. New UI component with 3 tabs.

10 tasks, ~5–6 new files, ~3 modified files (env + 2 modules + seed + step-output index). Estimated cost per smoke run: $0.10–$0.30 (gpt-5 with reasoning is meaningfully more expensive than gemini-flash). PAA disabled mode available for cost-constrained CI.
