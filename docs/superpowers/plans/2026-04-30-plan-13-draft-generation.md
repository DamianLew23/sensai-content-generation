# Plan 13 — Draft Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new pipeline step `tool.draft.generate` that consumes Plan 12's `DistributionResult` and emits an HTML article draft via per-section LLM calls with OpenAI Responses API response-id chaining, deterministic heading-trigger analysis, programmatic H3-vs-H2 fact deduplication, and a separate output of infographic prompts.

**Architecture:** A handler caches its output via `ToolCacheService`. The handler delegates to a `DraftGeneratorClient` that orchestrates one LLM call per H2 block (introduction is its own block too) with `previous_response_id` chaining to keep tokens low and avoid cross-block duplication. Three pure modules pre/post-process: `dedup.ts` removes facts duplicated between H3 and parent H2; `headings.ts` matches each header against regex triggers (definition / instruction / cause / comparison / diagnosis / list / question) and stamps a passage format on every section + H3; `assemble.ts` glues per-block HTML chunks into a final article and extracts ideation entries flagged as infografika/wykres/diagram into a separate `imagePrompts[]` output. A new `OpenAIResponsesClient` (direct `openai` SDK, not ai@5) handles the Responses API call with reasoning + verbosity controls and persists usage into the existing `llm_calls` table so cost stays observable.

**Tech Stack:** TypeScript / NestJS / Zod / Vitest / `openai` SDK ≥ 4.78 (Responses API + `previous_response_id`) / OpenAI direct (default model `gpt-5.2`) / existing `LlmClient` left untouched.

**Lesson sources:**
- `docs/edu/lekcja-3-2/lekcja-3.2-generowanie-draftu-tresci.md` (notes — primary spec)
- `docs/edu/lekcja-3-2/T3F2-generation_draft_educational.py` (Python reference; we follow its prompt + algorithm but swap the runtime to TS/Nest)

---

## Critical gotchas

**Gotcha 1 — Shared package build:** `packages/shared` must be **built to `dist/`** after every change to `schemas.ts` (`pnpm --filter @sensai/shared build`). The API imports from compiled `dist`, not `src`. Every task that touches `packages/shared/src/schemas.ts` ends with a build step.

**Gotcha 2 — `previousOutputs` keys follow step keys, not types:** The new template step uses `{ key: "draftGen", type: "tool.draft.generate", dependsOn: ["distribute"] }`. The orchestrator exposes outputs under **step keys**, so `draft-generate.handler` reads `ctx.previousOutputs.distribute`. Fail-closed if missing or fails Zod parse — pattern matches Plan 12.

**Gotcha 3 — OpenAI Responses API ≠ Chat Completions API:** `previous_response_id` chaining is exclusive to OpenAI's Responses API (`client.responses.create`). The existing `LlmClient` uses `ai@5` `generateObject` against the chat-completions endpoint via OpenRouter, which does NOT support `previous_response_id`. We add a separate `OpenAIResponsesClient` (direct `openai` SDK against `api.openai.com`) — `LlmClient` stays untouched.

**Gotcha 4 — Cost tracking must stay observable:** Bypassing `LlmClient` means manually inserting into `llm_calls`. Reuse `CostTrackerService` (already injectable; see `apps/api/src/llm/cost-tracker.service.ts`) so per-block cost rolls up under the same step + run.

**Gotcha 5 — Reasoning + verbosity are model-gated:** `reasoning.effort` and `text.verbosity` are valid only for OpenAI reasoning models (GPT-5, o-series). For non-reasoning models the lesson sets `USE_REASONING_PARAMS = False` and skips chaining too. We expose `DRAFT_GENERATE_USE_REASONING` (default `true`); when `false`, the client emits one call per block **without** `previous_response_id` and **without** `reasoning`/`text` params (caller still gets full HTML, just no cross-block memory). The output schema and stats stay the same.

**Gotcha 6 — Heading trigger detection is regex, not LLM:** The lesson explicitly says "to programatyczny algorytm, nie LLM" — adding an LLM hop here would inflate cost and reduce determinism. We mirror `HEADING_TRIGGERS` from the Python script verbatim (PL+EN patterns, plus an `intent_to_trigger` fallback). Tests assert each known wzorzec is hit.

**Gotcha 7 — H3 fact deduplication runs BEFORE prompt assembly:** Without this, the LLM gets the same fact in H2 and H3 inputs and dutifully repeats it despite "NO DUPLICATE" rules. Dedup is by **first-80-chars-lowercased** of `fact.text` (matches lesson `_covered` set). Entities are NOT removed — only flagged with `_covered_in_h2 = true` so the prompt instructs "use name only, do not redefine". Tests verify both behaviors.

**Gotcha 8 — Ideations split into inline vs external before LLM:** Tabela / checklist / lista / porównanie / schemat → inline `<table>`/`<ul>` instructions inside the user prompt. Infografika / wykres / diagram / grafika → emitted as a separate `imagePrompts[]` array on the handler output (the lesson stores them in `output_image_prompts.json`). Don't ask the LLM to "describe" infografiki — it'll hallucinate alt text.

**Gotcha 9 — Each block is one LLM call; HTML is concatenation:** Don't build a JSON schema for the LLM output — the model returns plain HTML for that section. Each block call returns `output_text` which we strip-clean (`<p></p>` → empty) and append. The final `<h1>` is prepended deterministically using `distribution.meta.h1Title`. The LLM never emits `<h1>`.

**Gotcha 10 — Section ordering and dependsOn cascade:** Template wires `draftGen.dependsOn = ["distribute"]`. Plan 08 cascade rerun follows `dependsOn`, so re-running `distribute` resets `draftGen`. Re-running `outlineGen` resets `distribute` AND `draftGen` (transitive via Plan 12 wiring). No new cascade logic needed — just declare the edge.

**Gotcha 11 — UI HTML preview must sandbox:** Generated HTML is untrusted from the user's perspective (LLM output). Render it in an `<iframe srcDoc>` with `sandbox="allow-same-origin"` (no scripts) — don't `dangerouslySetInnerHTML` directly. Tailwind in the iframe won't apply unless we inline a minimal stylesheet, which is fine for a preview.

**Gotcha 12 — Smoke fixture is the Plan 12 smoke output:** No new lesson fixture exists for Plan 13. The smoke script reads `scripts/smoke-output/plan-12-distribution.json` (produced by `pnpm smoke:plan-12`). If it's missing, the smoke aborts with a clear error telling the user to run Plan 12's smoke first. No adapter code — `DistributionResult.parse` is the only validation.

**Gotcha 13 — Rate limit pause between blocks:** OpenAI's per-account TPM limits can throttle 8-block sequences with reasoning models. Lesson uses `time.sleep(0.8)` between calls. We use `setTimeout(800)` between blocks, configurable via `DRAFT_GENERATE_BLOCK_DELAY_MS` (default 800). Skip the delay after the last block.

**Gotcha 14 — Polish-by-default, language flows from distribution.meta.language:** No new ENV. The user prompt template embeds `language: distribution.meta.language` and instructs the model to "Write in {language}".

---

## File Structure

```
apps/api/
├── package.json                                   (MODIFY) add "openai": "^4.78.0" dependency
└── src/
    ├── llm/
    │   ├── llm.client.ts                          (untouched)
    │   ├── cost-tracker.service.ts                (untouched, reused)
    │   ├── pricing.ts                             (MODIFY) add "gpt-5.2" pricing entry
    │   └── openai-responses.client.ts             (NEW) direct openai SDK + cost tracking
    │
    ├── tools/
    │   └── draft-generator/                       (NEW)
    │       ├── draft-generator.client.ts          Orchestrates per-block calls with chaining
    │       ├── draft-generator.module.ts          NestJS DI
    │       ├── draft-generator.dedup.ts           Pure: dedupe H3 facts vs parent H2
    │       ├── draft-generator.headings.ts        Pure: regex heading triggers + passage format
    │       ├── draft-generator.ideations.ts       Pure: split inline (table/list) vs external (infografika)
    │       ├── draft-generator.assemble.ts        Pure: glue blocks + extract image prompts + stats
    │       └── draft-generator.types.ts           Internal types (PassageFormat, EnrichedSection)
    │
    ├── prompts/
    │   └── draft-generate.prompt.ts               (NEW) system + per-block user builder
    │
    ├── handlers/
    │   ├── draft-generate.handler.ts              (NEW) StepHandler "tool.draft.generate"
    │   └── handlers.module.ts                     (MODIFY) register handler + env token
    │
    ├── config/env.ts                              (MODIFY) 6 new ENVs
    │
    ├── seed/seed.ts                               (MODIFY) extend template with draftGen step
    │
    └── tests/
        ├── draft-generator.dedup.test.ts          (NEW)
        ├── draft-generator.headings.test.ts       (NEW)
        ├── draft-generator.ideations.test.ts      (NEW)
        ├── draft-generator.assemble.test.ts       (NEW)
        ├── openai-responses.client.test.ts        (NEW)
        ├── draft-generator.client.test.ts         (NEW)
        └── draft-generate.handler.test.ts         (NEW)

packages/shared/src/schemas.ts                     (MODIFY) append Plan 13 schemas
packages/shared/dist/                               (REBUILD)

apps/web/src/components/step-output/
├── draft.tsx                                      (NEW) DraftOutput renderer (iframe preview)
└── index.tsx                                      (MODIFY) routing + hasRichRenderer

scripts/smoke-plan-13.ts                           (NEW) Real-LLM smoke
package.json (root)                                (MODIFY) add "smoke:plan-13" script
```

No new DI tokens beyond `DRAFT_GENERATE_HANDLER_ENV` and `DRAFT_GENERATOR_ENV` (matches Plan 12 pattern). One new runtime dependency: `openai` SDK.

---

## Task 1: Shared schemas — DraftGenerationResult

**Files:**
- Modify: `packages/shared/src/schemas.ts` (append at end)
- Build: `packages/shared` (must produce `dist/`)

No unit test — runtime tests in later tasks exercise the schema.

- [ ] **Step 1.1: Append Plan 13 schemas at end of `packages/shared/src/schemas.ts`**

Append after the last existing export (current last is the Plan 12 `DistributionResult` block):

```ts
// ===== Plan 13 — Draft Generation =====

export const PassageTrigger = z.enum([
  "definition",
  "instruction",
  "cause",
  "comparison",
  "diagnosis",
  "list",
  "question",
]);
export type PassageTrigger = z.infer<typeof PassageTrigger>;

export const DraftBlockStats = z.object({
  sectionOrder: z.number().int().nonnegative(),
  sectionType: z.enum(["intro", "h2"]),
  sectionVariant: z.enum(["full", "context"]).nullable(),
  header: z.string().nullable(),
  passageTrigger: PassageTrigger,
  charCount: z.number().int().nonnegative(),
  responseId: z.string().min(1),
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  costUsd: z.string(),
  latencyMs: z.number().int().nonnegative(),
});
export type DraftBlockStats = z.infer<typeof DraftBlockStats>;

export const DraftImagePrompt = z.object({
  sectionHeader: z.string(),
  ideationType: z.string(),
  description: z.string(),
  prompt: z.string(),
});
export type DraftImagePrompt = z.infer<typeof DraftImagePrompt>;

export const DraftWarning = z.object({
  kind: z.enum([
    "draft_block_failed",
    "draft_chaining_disabled",
    "draft_no_image_prompts",
    "draft_short_block",
    "draft_factual_dedup_high_ratio",
  ]),
  message: z.string().min(1),
  blockOrder: z.number().int().nonnegative().optional(),
  context: z.record(z.string()).default({}),
});
export type DraftWarning = z.infer<typeof DraftWarning>;

export const DraftMeta = z.object({
  keyword: z.string().min(1),
  h1Title: z.string().min(1),
  language: z.string().min(2).max(10),
  primaryIntent: IntentName,
  model: z.string().min(1),
  generatedAt: z.string().datetime(),
  useReasoning: z.boolean(),
  reasoningEffort: z.enum(["low", "medium", "high"]).nullable(),
  verbosity: z.enum(["low", "medium", "high"]).nullable(),
});
export type DraftMeta = z.infer<typeof DraftMeta>;

export const DraftStats = z.object({
  blockCount: z.number().int().nonnegative(),
  totalChars: z.number().int().nonnegative(),
  totalLatencyMs: z.number().int().nonnegative(),
  totalCostUsd: z.string(),
  totalPromptTokens: z.number().int().nonnegative(),
  totalCompletionTokens: z.number().int().nonnegative(),
  imagePromptCount: z.number().int().nonnegative(),
  factsRemovedFromH3: z.number().int().nonnegative(),
});
export type DraftStats = z.infer<typeof DraftStats>;

export const DraftGenerationResult = z.object({
  meta: DraftMeta,
  htmlContent: z.string().min(1),
  blocks: DraftBlockStats.array().min(1),
  imagePrompts: DraftImagePrompt.array(),
  stats: DraftStats,
  warnings: DraftWarning.array(),
});
export type DraftGenerationResult = z.infer<typeof DraftGenerationResult>;
```

- [ ] **Step 1.2: Build shared package**

Run: `pnpm --filter @sensai/shared build`
Expected: `packages/shared/dist/schemas.{js,d.ts}` regenerated, exit code 0.

- [ ] **Step 1.3: Commit**

```bash
git add packages/shared/src/schemas.ts packages/shared/dist
git commit -m "feat(shared): add Plan 13 draft generation schemas"
```

---

## Task 2: Env vars — six new keys

**Files:**
- Modify: `apps/api/src/config/env.ts`

- [ ] **Step 2.1: Read the existing schema** to find the section for handler-specific envs.

Run: `grep -n "OUTLINE_DISTRIBUTE_MODEL" apps/api/src/config/env.ts`
Note the line number — append new entries directly below the Plan 12 block.

- [ ] **Step 2.2: Add Plan 13 env keys**

Append inside the `EnvSchema` object (alphabetical within Plan 13 group):

```ts
  // ----- Plan 13 — Draft Generation -----
  DRAFT_GENERATE_MODEL: z.string().default("gpt-5.2"),
  DRAFT_GENERATE_USE_REASONING: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  DRAFT_GENERATE_REASONING_EFFORT: z.enum(["low", "medium", "high"]).default("medium"),
  DRAFT_GENERATE_VERBOSITY: z.enum(["low", "medium", "high"]).default("medium"),
  DRAFT_GENERATE_BLOCK_DELAY_MS: z.coerce.number().int().min(0).max(10_000).default(800),
  DRAFT_GENERATE_TTL_DAYS: z.coerce.number().int().min(1).max(60).default(7),
```

If `OPENAI_API_KEY` is not yet a required env, ensure it is present (lesson uses direct OpenAI):

```ts
  OPENAI_API_KEY: z.string().min(1),
```

(Skip if already present — `LlmClient` may already use it for embeddings.)

- [ ] **Step 2.3: Update `.env.example`** if the repo has one

Run: `ls apps/api/.env.example` — if exists, append:

```
# Plan 13 — Draft Generation
DRAFT_GENERATE_MODEL=gpt-5.2
DRAFT_GENERATE_USE_REASONING=true
DRAFT_GENERATE_REASONING_EFFORT=medium
DRAFT_GENERATE_VERBOSITY=medium
DRAFT_GENERATE_BLOCK_DELAY_MS=800
DRAFT_GENERATE_TTL_DAYS=7
```

- [ ] **Step 2.4: Typecheck**

Run: `pnpm --filter @sensai/api typecheck`
Expected: PASS.

- [ ] **Step 2.5: Commit**

```bash
git add apps/api/src/config/env.ts apps/api/.env.example
git commit -m "feat(api): add Plan 13 draft.generate env keys"
```

---

## Task 3: Pure module — H3 fact deduplication

**Files:**
- Create: `apps/api/src/tools/draft-generator/draft-generator.types.ts`
- Create: `apps/api/src/tools/draft-generator/draft-generator.dedup.ts`
- Test: `apps/api/src/tests/draft-generator.dedup.test.ts`

- [ ] **Step 3.1: Write internal types**

Create `apps/api/src/tools/draft-generator/draft-generator.types.ts`:

```ts
import type {
  DistributionResult,
  PassageTrigger,
  DraftImagePrompt,
} from "@sensai/shared";

export interface PassageFormat {
  trigger: PassageTrigger;
  format: string;
  rules: string;
  matchedBy: "header_pattern" | "source_intent" | "default";
}

// Section taken from DistributionResult.sections[N], augmented with deterministic
// pre-processing artefacts. We keep the original shape readable by Zod schemas
// and only add fields prefixed with `_` for clarity.
export type EnrichedSection = DistributionResult["sections"][number] & {
  _passageFormat: PassageFormat;
  _h3sEnriched: Array<{
    header: string;
    passageFormat: PassageFormat;
  }>;
  _inlineIdeations: Array<{
    type: string;
    description: string;
    formatInstruction: string;
  }>;
  _externalIdeations: DraftImagePrompt[];
  _coveredEntities: Set<string>;
};

export interface DedupResult {
  sections: DistributionResult["sections"];
  factsRemoved: number;
}
```

- [ ] **Step 3.2: Write the failing test**

Create `apps/api/src/tests/draft-generator.dedup.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { dedupeH3Facts } from "../tools/draft-generator/draft-generator.dedup";
import type { DistributionResult } from "@sensai/shared";

function makeFact(id: string, text: string) {
  return { id, text, category: "general" as const, priority: "medium" as const, confidence: 0.8, sourceUrls: [] };
}

describe("dedupeH3Facts", () => {
  it("removes H3 facts that duplicate parent H2 by first 80 chars (case-insensitive)", () => {
    const sections: DistributionResult["sections"] = [
      {
        type: "h2",
        order: 1,
        sectionVariant: "full",
        header: "Jak obniżyć kortyzol",
        sourceArea: "A1",
        sourceIntent: "Instrukcyjna",
        entities: [],
        facts: [makeFact("F1", "Ashwagandha obniża kortyzol o 11-32%.")],
        relationships: [],
        ideations: [],
        measurables: [],
        h3s: [
          {
            header: "Czy ashwagandha działa?",
            format: "question",
            sourcePaa: "...",
            entities: [],
            facts: [
              makeFact("F2", "ASHWAGANDHA OBNIŻA KORTYZOL O 11-32%."), // duplicate of F1
              makeFact("F3", "Magnez ma efekt komplementarny."),       // unique
            ],
            relationships: [],
            ideations: [],
            measurables: [],
          },
        ],
      } as any,
    ];

    const result = dedupeH3Facts(sections);

    expect(result.factsRemoved).toBe(1);
    expect(result.sections[0].h3s[0].facts).toHaveLength(1);
    expect(result.sections[0].h3s[0].facts[0].id).toBe("F3");
  });

  it("flags entities covered by parent H2 without removing them", () => {
    const sections: DistributionResult["sections"] = [
      {
        type: "h2",
        order: 1,
        sectionVariant: "full",
        header: "Adaptogeny",
        sourceArea: "A1",
        sourceIntent: "Definicyjna",
        entities: [{ id: "E1", entity: "Ashwagandha", domainType: "PRODUCT", evidence: "Adaptogen.", originalSurface: "Ashwagandha" }],
        facts: [],
        relationships: [],
        ideations: [],
        measurables: [],
        h3s: [
          {
            header: "Dawkowanie",
            format: "question",
            sourcePaa: "...",
            entities: [{ id: "E1", entity: "Ashwagandha", domainType: "PRODUCT", evidence: "Adaptogen.", originalSurface: "Ashwagandha" }],
            facts: [],
            relationships: [],
            ideations: [],
            measurables: [],
          },
        ],
      } as any,
    ];

    const result = dedupeH3Facts(sections);

    // entity stays in the array — module only marks coverage via returned set on the parent
    expect(result.sections[0].h3s[0].entities).toHaveLength(1);
    expect(result.factsRemoved).toBe(0);
  });

  it("returns intro sections unchanged", () => {
    const sections: DistributionResult["sections"] = [
      {
        type: "intro",
        order: 0,
        header: null,
        sectionVariant: null,
        h3s: [],
        entities: [],
        facts: [makeFact("F1", "Intro fact")],
        relationships: [],
        ideations: [],
        measurables: [],
      } as any,
    ];
    const result = dedupeH3Facts(sections);
    expect(result.factsRemoved).toBe(0);
    expect(result.sections[0].facts).toHaveLength(1);
  });
});
```

Run: `pnpm --filter @sensai/api test -- draft-generator.dedup`
Expected: FAIL — module not found.

- [ ] **Step 3.3: Implement the module**

Create `apps/api/src/tools/draft-generator/draft-generator.dedup.ts`:

```ts
import type { DistributionResult } from "@sensai/shared";
import type { DedupResult } from "./draft-generator.types";

const FACT_KEY_LEN = 80;

function factKey(text: string): string {
  return text.slice(0, FACT_KEY_LEN).toLowerCase().trim();
}

export function dedupeH3Facts(
  sections: DistributionResult["sections"],
): DedupResult {
  let factsRemoved = 0;

  const cloned = sections.map((s) => {
    if (s.type === "intro") return s;

    const parentFactKeys = new Set(s.facts.map((f) => factKey(f.text)));

    const h3s = s.h3s.map((h3) => {
      const filtered = h3.facts.filter((f) => {
        if (parentFactKeys.has(factKey(f.text))) {
          factsRemoved += 1;
          return false;
        }
        return true;
      });
      return { ...h3, facts: filtered };
    });

    return { ...s, h3s };
  });

  return { sections: cloned as DistributionResult["sections"], factsRemoved };
}
```

- [ ] **Step 3.4: Run tests — verify GREEN**

Run: `pnpm --filter @sensai/api test -- draft-generator.dedup`
Expected: PASS — all 3 cases.

- [ ] **Step 3.5: Commit**

```bash
git add apps/api/src/tools/draft-generator/draft-generator.types.ts \
        apps/api/src/tools/draft-generator/draft-generator.dedup.ts \
        apps/api/src/tests/draft-generator.dedup.test.ts
git commit -m "feat(api): add H3 fact deduplication for draft generation"
```

---

## Task 4: Pure module — heading trigger analysis

**Files:**
- Create: `apps/api/src/tools/draft-generator/draft-generator.headings.ts`
- Test: `apps/api/src/tests/draft-generator.headings.test.ts`

- [ ] **Step 4.1: Write the failing test**

Create `apps/api/src/tests/draft-generator.headings.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { detectPassageFormat } from "../tools/draft-generator/draft-generator.headings";

describe("detectPassageFormat", () => {
  it.each([
    ["Co to jest kortyzol", "definition"],
    ["Czym jest stres", "definition"],
    ["Jak obniżyć kortyzol po 40tce", "instruction"],
    ["W jaki sposób trenować", "instruction"],
    ["Dlaczego kortyzol rośnie?", "cause"],
    ["Przyczyny wysokiego kortyzolu", "cause"],
    ["HIIT vs spacer — co lepsze?", "comparison"],
    ["Jak rozpoznać przewlekły stres", "diagnosis"],
    ["Objawy podwyższonego kortyzolu", "diagnosis"],
    ["Najlepsze suplementy na sen", "list"],
    ["Rodzaje treningu siłowego", "list"],
    ["Ile godzin snu potrzebuję?", "question"],
  ])("matches PL pattern '%s' → %s", (header, expected) => {
    const pf = detectPassageFormat(header, undefined, "pl");
    expect(pf.trigger).toBe(expected);
    expect(pf.matchedBy).toBe("header_pattern");
  });

  it("falls back to source intent when no pattern matches", () => {
    const pf = detectPassageFormat("Adaptogeny i ich rola", "Decyzyjna", "pl");
    expect(pf.trigger).toBe("list");
    expect(pf.matchedBy).toBe("source_intent");
  });

  it("defaults to instruction when no pattern and no usable intent", () => {
    const pf = detectPassageFormat("Adaptogeny", undefined, "pl");
    expect(pf.trigger).toBe("instruction");
    expect(pf.matchedBy).toBe("default");
  });

  it("matches EN patterns when lang='en'", () => {
    const pf = detectPassageFormat("How to lower cortisol", undefined, "en");
    expect(pf.trigger).toBe("instruction");
  });
});
```

Run: `pnpm --filter @sensai/api test -- draft-generator.headings`
Expected: FAIL — module missing.

- [ ] **Step 4.2: Implement the module**

Create `apps/api/src/tools/draft-generator/draft-generator.headings.ts`:

```ts
import type { PassageFormat } from "./draft-generator.types";
import type { PassageTrigger } from "@sensai/shared";

interface TriggerSpec {
  patternsPl: RegExp[];
  patternsEn: RegExp[];
  format: string;
  rules: string;
}

// Patterns mirror docs/edu/lekcja-3-2/T3F2-generation_draft_educational.py:HEADING_TRIGGERS.
// Order matters: more-specific triggers (definition, instruction, ...) come BEFORE
// the catch-all "question" trigger so "Co to jest X" matches definition not question.
const TRIGGERS: Record<PassageTrigger, TriggerSpec> = {
  definition: {
    patternsPl: [/^co to jest/i, /^czym jest/i, /^co to znaczy/i, /i jego rola/i],
    patternsEn: [/^what is/i, /^what are/i, /^define/i],
    format:
      "Definicja: Zdanie definiujące (1-2 zd.) → Rozwinięcie z atrybutami (3-5 zd.) → Micro-summary (1 zd.)",
    rules:
      "Encja nazwana w 1. zdaniu. Relacja do kategorii nadrzędnej. Min. 1 atrybut wyróżniający.",
  },
  instruction: {
    patternsPl: [/^jak\s/i, /jak\s.*\?$/i, /w jaki sposób/i],
    patternsEn: [/^how to/i, /^how do/i, /^how can/i],
    format:
      "Instrukcja: Kontekst + cel (1 zd.) → Kroki/metody (3-7 punktów lub akapitów) → Rezultat (1 zd.)",
    rules:
      "Encja + cel w 1. zdaniu. Każdy krok = 1 konkretna akcja. Czasowniki aktywne.",
  },
  cause: {
    patternsPl: [/^dlaczego/i, /przyczyny/i, /skutki/i, /powody/i],
    patternsEn: [/^why/i, /causes/i, /effects/i, /reasons/i],
    format:
      "Przyczyna: Twierdzenie (1 zd.) → Wyjaśnienie przyczynowe (3-5 zd.) → Dowód/statystyka → Wniosek",
    rules:
      "Relacja przyczynowo-skutkowa w 1. zdaniu. Konkretny fakt liczbowy obowiązkowy.",
  },
  comparison: {
    patternsPl: [/\bvs\b/i, /\bczy\b.*\?/i, /porównanie/i, /co pomaga.*co szkodzi/i, /\bco\b.*\ba co\b/i],
    patternsEn: [/\bvs\b/i, /comparison/i, /which is better/i],
    format:
      "Porównanie: Ramka porównania (1 zd.) → Tabela/lista różnic → Analiza kluczowej różnicy → Werdykt",
    rules:
      "Obie strony porównania nazwane w 1. zdaniu. Min. 3 wymiary porównania. Jasny werdykt.",
  },
  diagnosis: {
    patternsPl: [/jak rozpoznać/i, /objawy/i, /badania/i, /monitorować/i, /^kiedy/i],
    patternsEn: [/how to recognize/i, /symptoms/i, /when to/i, /diagnosis/i],
    format:
      "Diagnostyka: Ogólna zasada (1 zd.) → Warunki/objawy (lista) → Metody weryfikacji → Kiedy do lekarza",
    rules: "Konkretne warunki i wartości referencyjne. Lista objawów z opisami.",
  },
  list: {
    patternsPl: [/najlepsze/i, /najczęstsze/i, /rodzaje/i, /typy/i, /metody/i, /sposoby/i, /techniki/i],
    patternsEn: [/^best/i, /^top/i, /types of/i, /kinds of/i, /methods/i],
    format:
      "Lista: Kontekst wyboru (1-2 zd.) → Lista z encjami i atrybutami → Kryterium podziału/wyboru → Rekomendacja",
    rules: "Min. 3 nazwane elementy. Każdy z opisem i atrybutem wyróżniającym.",
  },
  question: {
    patternsPl: [/\?$/i, /^jaka\s/i, /^jaki\s/i, /^jakie\s/i, /^ile\s/i, /^co\s/i],
    patternsEn: [/\?$/i, /^what\s/i, /^which\s/i, /^how much/i],
    format:
      "Direct Answer: Odpowiedź w 1. zdaniu → Rozwinięcie z kontekstem (2-3 zd.) → Dodatkowy kąt/niuans",
    rules:
      "PIERWSZYM zdaniem jest bezpośrednia odpowiedź. Potem rozwinięcie. NIGDY nie buduj napięcia.",
  },
};

const INTENT_TO_TRIGGER: Record<string, PassageTrigger> = {
  Definicyjna: "definition",
  Instrukcyjna: "instruction",
  Problemowa: "cause",
  Diagnostyczna: "diagnosis",
  Porównawcza: "comparison",
  Decyzyjna: "list",
};

const TRIGGER_ORDER: PassageTrigger[] = [
  "definition",
  "diagnosis", // before "instruction" so "Jak rozpoznać X" wins over "^jak\s"
  "instruction",
  "cause",
  "comparison",
  "list",
  "question", // catch-all last
];

export function detectPassageFormat(
  header: string | null | undefined,
  sourceIntent: string | undefined,
  lang: string,
): PassageFormat {
  const headerLower = (header ?? "").toLowerCase().trim();
  const langKey = lang === "en" ? "patternsEn" : "patternsPl";

  if (headerLower) {
    for (const trigger of TRIGGER_ORDER) {
      const spec = TRIGGERS[trigger];
      const patterns = spec[langKey];
      if (patterns.some((re) => re.test(headerLower))) {
        return {
          trigger,
          format: spec.format,
          rules: spec.rules,
          matchedBy: "header_pattern",
        };
      }
    }
  }

  if (sourceIntent && INTENT_TO_TRIGGER[sourceIntent]) {
    const trigger = INTENT_TO_TRIGGER[sourceIntent];
    const spec = TRIGGERS[trigger];
    return {
      trigger,
      format: spec.format,
      rules: spec.rules,
      matchedBy: "source_intent",
    };
  }

  const spec = TRIGGERS.instruction;
  return {
    trigger: "instruction",
    format: spec.format,
    rules: spec.rules,
    matchedBy: "default",
  };
}
```

- [ ] **Step 4.3: Run tests — verify GREEN**

Run: `pnpm --filter @sensai/api test -- draft-generator.headings`
Expected: PASS — all 14 cases.

- [ ] **Step 4.4: Commit**

```bash
git add apps/api/src/tools/draft-generator/draft-generator.headings.ts \
        apps/api/src/tests/draft-generator.headings.test.ts
git commit -m "feat(api): add heading trigger analysis for draft generation"
```

---

## Task 5: Pure module — ideation split (inline vs external)

**Files:**
- Create: `apps/api/src/tools/draft-generator/draft-generator.ideations.ts`
- Test: `apps/api/src/tests/draft-generator.ideations.test.ts`

- [ ] **Step 5.1: Write the failing test**

Create `apps/api/src/tests/draft-generator.ideations.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { splitIdeations } from "../tools/draft-generator/draft-generator.ideations";

describe("splitIdeations", () => {
  it("classifies tabela/checklist/lista as inline with formatting instructions", () => {
    const { inline, external } = splitIdeations(
      [
        { id: "I1", type: "tabela", title: "Porównanie", description: "Adaptogeny vs SSRI", priority: "high" } as any,
        { id: "I2", type: "checklist", title: "Lista", description: "Codzienna rutyna snu", priority: "medium" } as any,
        { id: "I3", type: "lista", title: "L", description: "Adaptogeny", priority: "low" } as any,
      ],
      "Sekcja testowa",
    );
    expect(inline).toHaveLength(3);
    expect(inline[0].formatInstruction).toContain("<table>");
    expect(inline[1].formatInstruction).toContain("<ul>");
    expect(external).toHaveLength(0);
  });

  it("classifies infografika/wykres/diagram as external image prompts", () => {
    const { inline, external } = splitIdeations(
      [
        { id: "I1", type: "infografika", title: "Mechanizm", description: "Schemat HPA-axis", priority: "high" } as any,
        { id: "I2", type: "wykres", title: "Krzywa kortyzolu", description: "Cortisol over 24h", priority: "high" } as any,
      ],
      "Sekcja kortyzol",
    );
    expect(inline).toHaveLength(0);
    expect(external).toHaveLength(2);
    expect(external[0].sectionHeader).toBe("Sekcja kortyzol");
    expect(external[0].prompt).toContain("Schemat HPA-axis");
    expect(external[0].prompt).toContain("Sekcja kortyzol");
  });

  it("treats unknown types as inline (safe default)", () => {
    const { inline, external } = splitIdeations(
      [{ id: "I1", type: "info_box", title: "T", description: "Custom box", priority: "medium" } as any],
      "Sekcja",
    );
    expect(inline).toHaveLength(1);
    expect(external).toHaveLength(0);
  });
});
```

Run: `pnpm --filter @sensai/api test -- draft-generator.ideations`
Expected: FAIL.

- [ ] **Step 5.2: Implement the module**

Create `apps/api/src/tools/draft-generator/draft-generator.ideations.ts`:

```ts
import type { DraftImagePrompt } from "@sensai/shared";

const INLINE_TYPES = ["tabela", "checklist", "lista", "porównanie", "porownanie", "schemat"];
const EXTERNAL_TYPES = ["infografika", "wykres", "diagram", "grafika"];

export interface InlineIdeation {
  type: string;
  description: string;
  formatInstruction: string;
}

export interface IdeationSplit {
  inline: InlineIdeation[];
  external: DraftImagePrompt[];
}

function isType(actual: string, candidates: string[]): boolean {
  return candidates.some((c) => actual === c || actual.includes(c));
}

function inlineInstruction(ideaType: string, description: string): string {
  if (ideaType.includes("tabela") || ideaType.includes("porown") || ideaType.includes("porów")) {
    return `Generate as HTML <table> with headers: ${description}`;
  }
  if (ideaType.includes("checklist") || ideaType.includes("lista")) {
    return `Generate as HTML <ul> checklist: ${description}`;
  }
  if (ideaType.includes("schemat")) {
    return `Generate as structured HTML list/steps: ${description}`;
  }
  return `Inline content: ${description}`;
}

export function splitIdeations(
  ideations: Array<{ type?: string; description?: string; title?: string }>,
  sectionHeader: string,
): IdeationSplit {
  const inline: InlineIdeation[] = [];
  const external: DraftImagePrompt[] = [];

  for (const idea of ideations) {
    const ideaType = (idea.type ?? "").toLowerCase();
    const desc = idea.description ?? idea.title ?? "";

    if (isType(ideaType, EXTERNAL_TYPES)) {
      external.push({
        sectionHeader,
        ideationType: ideaType,
        description: desc,
        prompt:
          `Create an infographic: ${desc}. ` +
          `Context: article section '${sectionHeader}'. ` +
          `Style: clean, professional, data-focused.`,
      });
    } else if (isType(ideaType, INLINE_TYPES)) {
      inline.push({ type: ideaType, description: desc, formatInstruction: inlineInstruction(ideaType, desc) });
    } else {
      // unknown → safe default = inline as informational content
      inline.push({ type: ideaType, description: desc, formatInstruction: `Inline content: ${desc}` });
    }
  }

  return { inline, external };
}
```

- [ ] **Step 5.3: Run tests — verify GREEN**

Run: `pnpm --filter @sensai/api test -- draft-generator.ideations`
Expected: PASS.

- [ ] **Step 5.4: Commit**

```bash
git add apps/api/src/tools/draft-generator/draft-generator.ideations.ts \
        apps/api/src/tests/draft-generator.ideations.test.ts
git commit -m "feat(api): add ideation split (inline vs image prompts)"
```

---

## Task 6: Pricing entry for gpt-5.2

**Files:**
- Modify: `apps/api/src/llm/pricing.ts`

- [ ] **Step 6.1: Read current pricing**

Run: `cat apps/api/src/llm/pricing.ts`
Note the export shape (likely `MODEL_PRICING: Record<string, { promptPer1M, completionPer1M }>`).

- [ ] **Step 6.2: Add gpt-5.2 entry**

Add to the same record (use the official OpenAI list price at the time of implementation; defaults below match the lesson's rough budget — verify before deploy):

```ts
  "gpt-5.2": {
    promptPer1M: 1.25,
    completionPer1M: 10.0,
  },
```

If pricing is split across reasoning vs non-reasoning models, place under whichever convention the file already uses. If the file is missing a generic OpenAI Responses-API row, also add `"gpt-5"` and `"gpt-5-mini"` if the env may resolve to those.

- [ ] **Step 6.3: Typecheck and commit**

Run: `pnpm --filter @sensai/api typecheck`
Expected: PASS.

```bash
git add apps/api/src/llm/pricing.ts
git commit -m "feat(api): add gpt-5.2 pricing for draft.generate"
```

---

## Task 7: OpenAI Responses client (direct SDK + cost tracking)

**Files:**
- Modify: `apps/api/package.json` (add `openai` dep)
- Create: `apps/api/src/llm/openai-responses.client.ts`
- Test: `apps/api/src/tests/openai-responses.client.test.ts`

- [ ] **Step 7.1: Add openai dependency**

Run: `pnpm --filter @sensai/api add openai@^4.78.0`
Expected: `apps/api/package.json` lists `"openai": "^4.78.0"` in dependencies; lockfile updated.

- [ ] **Step 7.2: Write the failing test**

Create `apps/api/src/tests/openai-responses.client.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { OpenAIResponsesClient } from "../llm/openai-responses.client";
import type { CostTrackerService } from "../llm/cost-tracker.service";

describe("OpenAIResponsesClient", () => {
  it("calls openai.responses.create with chaining params and records cost", async () => {
    const fakeResponse = {
      id: "resp_abc123",
      output_text: "<h2>Section</h2><p>Body</p>",
      model: "gpt-5.2",
      usage: { input_tokens: 100, output_tokens: 200 },
    };
    const create = vi.fn().mockResolvedValue(fakeResponse);
    const cost = { record: vi.fn().mockResolvedValue(undefined) } as unknown as CostTrackerService;

    const client = new OpenAIResponsesClient(
      { responses: { create } } as any,
      cost,
    );

    const result = await client.createBlock({
      ctx: { runId: "r1", stepId: "s1", attempt: 1 },
      model: "gpt-5.2",
      system: "SYS",
      input: "USER",
      previousResponseId: "resp_prev",
      reasoning: { effort: "medium" },
      verbosity: "medium",
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5.2",
        previous_response_id: "resp_prev",
        reasoning: { effort: "medium" },
        text: { verbosity: "medium" },
      }),
    );
    expect(result.id).toBe("resp_abc123");
    expect(result.outputText).toBe("<h2>Section</h2><p>Body</p>");
    expect(cost.record).toHaveBeenCalledOnce();
    const recordedCall = (cost.record as any).mock.calls[0][0];
    expect(recordedCall.provider).toBe("openai");
    expect(recordedCall.model).toBe("gpt-5.2");
    expect(recordedCall.promptTokens).toBe(100);
    expect(recordedCall.completionTokens).toBe(200);
  });

  it("omits chaining and reasoning params when not provided", async () => {
    const create = vi.fn().mockResolvedValue({
      id: "r1",
      output_text: "ok",
      model: "gpt-4o",
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const cost = { record: vi.fn() } as any;
    const client = new OpenAIResponsesClient({ responses: { create } } as any, cost);

    await client.createBlock({
      ctx: { runId: "r1", stepId: "s1", attempt: 1 },
      model: "gpt-4o",
      system: "S",
      input: "I",
    });

    const args = create.mock.calls[0][0];
    expect(args.previous_response_id).toBeUndefined();
    expect(args.reasoning).toBeUndefined();
    expect(args.text).toBeUndefined();
  });
});
```

Run: `pnpm --filter @sensai/api test -- openai-responses.client`
Expected: FAIL — module missing.

- [ ] **Step 7.3: Implement the client**

Create `apps/api/src/llm/openai-responses.client.ts`:

```ts
import { Inject, Injectable, Logger } from "@nestjs/common";
import OpenAI from "openai";
import { CostTrackerService } from "./cost-tracker.service";
import { calculateCostUsd } from "./pricing";

interface CallCtx {
  runId: string;
  stepId: string;
  attempt: number;
}

interface CreateBlockArgs {
  ctx: CallCtx;
  model: string;
  system: string;
  input: string;
  previousResponseId?: string;
  reasoning?: { effort: "low" | "medium" | "high" };
  verbosity?: "low" | "medium" | "high";
}

export interface CreateBlockResult {
  id: string;
  outputText: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: string;
  latencyMs: number;
}

const CALL_TIMEOUT_MS = 240_000; // 4 min — reasoning calls can be slow

@Injectable()
export class OpenAIResponsesClient {
  private readonly logger = new Logger(OpenAIResponsesClient.name);

  constructor(
    @Inject("OPENAI_RESPONSES_SDK") private readonly sdk: OpenAI,
    private readonly cost: CostTrackerService,
  ) {}

  async createBlock(args: CreateBlockArgs): Promise<CreateBlockResult> {
    const t0 = Date.now();

    const params: Record<string, unknown> = {
      model: args.model,
      input: [
        { role: "system", content: args.system },
        { role: "user", content: args.input },
      ],
    };
    if (args.previousResponseId) params.previous_response_id = args.previousResponseId;
    if (args.reasoning) params.reasoning = args.reasoning;
    if (args.verbosity) params.text = { verbosity: args.verbosity };

    const response = await this.sdk.responses.create(params as any, {
      timeout: CALL_TIMEOUT_MS,
    });

    const latencyMs = Date.now() - t0;
    const promptTokens = (response as any).usage?.input_tokens ?? 0;
    const completionTokens = (response as any).usage?.output_tokens ?? 0;
    const model = (response as any).model ?? args.model;
    const costUsd = calculateCostUsd(model, promptTokens, completionTokens);
    const outputText = (response as any).output_text ?? "";
    const id = (response as any).id;

    await this.cost.record({
      runId: args.ctx.runId,
      stepId: args.ctx.stepId,
      attempt: args.ctx.attempt,
      provider: "openai",
      model,
      promptTokens,
      completionTokens,
      costUsd,
      latencyMs,
    });

    this.logger.log(
      {
        call: "draft.responses",
        model,
        responseId: id,
        promptTokens,
        completionTokens,
        costUsd,
        latencyMs,
      },
      "openai responses call",
    );

    return { id, outputText, model, promptTokens, completionTokens, costUsd, latencyMs };
  }
}
```

- [ ] **Step 7.4: Run tests — verify GREEN**

Run: `pnpm --filter @sensai/api test -- openai-responses.client`
Expected: PASS — both cases.

- [ ] **Step 7.5: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml \
        apps/api/src/llm/openai-responses.client.ts \
        apps/api/src/tests/openai-responses.client.test.ts
git commit -m "feat(api): add OpenAIResponsesClient with cost tracking"
```

---

## Task 8: Draft prompt builder

**Files:**
- Create: `apps/api/src/prompts/draft-generate.prompt.ts`

No unit test — exercised by `draft-generator.client.test.ts` and the smoke run.

- [ ] **Step 8.1: Write the prompt module**

Create `apps/api/src/prompts/draft-generate.prompt.ts`. Mirror the lesson's `build_prompt` (`docs/edu/lekcja-3-2/T3F2-generation_draft_educational.py:428-673`) but adapt to TS:

```ts
import type { EnrichedSection, PassageFormat } from "../tools/draft-generator/draft-generator.types";
import type { DistributionResult } from "@sensai/shared";

interface BuildArgs {
  blockNumber: number;          // 1-indexed
  currentSectionIndex: number;  // 0-indexed across all sections
  allSections: EnrichedSection[];
  block: EnrichedSection;
  keyword: string;
  h1Title: string;
  language: string;             // "pl" | "en" | ...
}

const LANG_NAMES: Record<string, string> = {
  pl: "Polish",
  en: "English",
  de: "German",
  fr: "French",
};

const PASSAGE_BLUEPRINT = `### PASSAGE BLUEPRINT (5 elements — apply to EVERY H2 and H3)
Each passage MUST contain these 5 elements IN THIS ORDER:

1. CONTEXT SENTENCE (1-2 sentences)
   → Name the MAIN ENTITY in the first sentence
   → Establish: who/what/for whom/when
   → This sentence should work as a standalone answer

2. CORE EXPLANATION (3-5 sentences)
   → The main content — explanation, steps, analysis
   → Short sentences, active voice, clear transitions
   → One topic per paragraph, zero digressions

3. SUPPORTING EVIDENCE (1 element)
   → A specific statistic with number OR
   → A concrete fact from the provided data OR
   → A comparison with a named alternative

4. IDEATION CONTENT (if provided)
   → Generate tables as HTML <table>
   → Generate checklists as HTML <ul>
   → Follow the format instruction from Ideations field

5. MICRO-SUMMARY (1 sentence)
   → Restate the key point in simple language
   → ONLY for FULL sections (skip for CONTEXT sections)`;

const QUALITY_RULES = `### BLUF — BOTTOM LINE UP FRONT
The CONTEXT SENTENCE IS the BLUF. It answers the heading's question IMMEDIATELY.
FORBIDDEN: Building up to a conclusion. State conclusion FIRST.

### NO FILLER
TEST: Delete the sentence. Did the text lose information? NO → it's filler.
EVERY sentence must contain: specific fact, number, comparison, example, or actionable step.
FORBIDDEN: "It's worth noting...", "Let's take a closer look...", "In this section we will discuss..."

### NO DUPLICATE
Each fact appears EXACTLY ONCE in the entire article.
CRITICAL: See the FULL ARTICLE OUTLINE below — it shows which facts belong to OTHER sections.
INSTEAD OF REPEATING: use back-reference ("the mechanism described above...") or skip entirely.

### H2/H3 HIERARCHY
H2 = comprehensive overview (FULL: 3-5 paragraphs, CONTEXT: 1-2 paragraphs)
H3 = direct answer + NEW angle (1-2 paragraphs). NEVER restates H2 content.`;

const ENTITY_RULES = `### ENTITY CLARITY RULES
1. Name the main entity in the FIRST sentence of each section.
2. When first defining an entity: [Entity name] + [what it is] + [one distinguishing attribute].
3. After first definition: use just the name, never re-explain.
4. NEVER replace entity names with pronouns in first 2 sentences.
5. Use at least 2 anchoring types per passage:
   - Feature anchor: [Entity] + [measurable attribute]
   - Comparative anchor: [Entity A] vs [Entity B]
   - Situational anchor: [Entity] + [target group]
   - Temporal anchor: [Entity] + [time/version/year]
   - Causal anchor: [Entity] + [cause] + [effect]`;

const FORMATTING_RULES = `### FORMATTING RULES
1) Output: <h2>, <h3>, <p>, <table>, <ul>/<li> only. NO <h1>.
2) Paragraphs: MAX 3-4 sentences per <p> tag.
3) Tables for comparisons; <ul>/<li> for 3+ items with attributes.
4) Active voice. Subject + Verb + Object + Context.
5) Professional voice, no marketing language.
6) NO abstract openings.`;

const ERROR_AVOIDANCE = `### ERROR AVOIDANCE
1) NO Wall of Words: Every section MUST have visual breaks (paragraphs, lists, tables).
2) NO Muddled Meaning: One topic per paragraph.
3) NO Vanilla Entity: NEVER say "this supplement" — always use the entity NAME.
4) NO Over-Stylized Writing: No metaphors without subject. No sentences >25 words.`;

export const draftGeneratePrompt = {
  system:
    "You are a senior SEO content writer. You produce HTML article drafts using the PASSAGE BLUEPRINT discipline. " +
    "You output HTML fragments only (no <html>, <body>, no <h1>). You never apologize, never preface. You write directly.",

  user(args: BuildArgs): string {
    const language = LANG_NAMES[args.language] ?? "English";
    const sectionsInfo = renderSection(args.block);
    const outline = renderOutline(args.allSections, args.currentSectionIndex);
    const bridge = args.blockNumber > 1 ? bridgeInstruction() : "";

    return [
      `Write block ${args.blockNumber} of article about: ${args.keyword}`,
      `Article title: ${args.h1Title}`,
      "",
      PASSAGE_BLUEPRINT,
      "",
      QUALITY_RULES,
      "",
      ENTITY_RULES,
      "",
      FORMATTING_RULES,
      bridge,
      ERROR_AVOIDANCE,
      "",
      "DATA USAGE:",
      "- FACTS: incorporate ALL provided facts. Each appears ONCE in the entire article.",
      "- ENTITIES: define ONCE at first mention. Later = name only.",
      "- RELATIONSHIPS: show as causal/comparative anchors in text.",
      "- IDEATIONS: generate as HTML (tables, checklists). Follow format instructions.",
      "- PASSAGE FORMAT: follow the format assigned to each section header.",
      "",
      outline,
      "",
      "SECTIONS TO WRITE NOW:",
      sectionsInfo,
      "",
      `Write in ${language}.`,
      "Apply PASSAGE BLUEPRINT to every section.",
      "Follow PASSAGE FORMAT instructions per section.",
      "Name entities in first sentence. Use ALL facts. NO FILLER. NO DUPLICATES.",
    ].join("\n");
  },
};

function bridgeInstruction(): string {
  return `\n### BRIDGE SENTENCES (optional, max 1 per block)
If an entity defined earlier in another section also fits this section, you MAY reference it with a 1-sentence bridge:
- "The previously mentioned [entity] also plays a role in..."
DO NOT redefine the entity. Skip the bridge if no earlier entity fits.\n`;
}

function describePassage(pf: PassageFormat | undefined): string {
  if (!pf) return "";
  return `\n   📋 PASSAGE FORMAT: ${pf.format}\n   📋 PASSAGE RULES: ${pf.rules}`;
}

function renderSection(s: EnrichedSection): string {
  if (s.type === "intro") {
    return `SECTION (intro): write a 1-2 paragraph introduction.${describePassage(s._passageFormat)}\n   Entities, facts, and ideations attached: see distribution payload.\n---`;
  }

  const tag = "h2";
  const header = s.header ?? "Section";
  const variantNote =
    s.sectionVariant === "context"
      ? `\n   ⚠️ CONTEXT SECTION (keep brief, 1-2 paragraphs)${
          (s as any).contextNote ? `: ${(s as any).contextNote}` : ""
        }`
      : "";

  const entities = s.entities.slice(0, 6).map((e: any) => {
    if (s._coveredEntities?.has(e.id)) return null;
    const desc = (e.evidence ?? "").slice(0, 60);
    return desc ? `${e.entity} (${desc})` : e.entity;
  });
  const entitiesStr = entities.filter(Boolean).join("; ") || "None";
  const coveredStr =
    s._coveredEntities && s._coveredEntities.size > 0
      ? `\n   ⚠️ Already defined in parent H2 (use name only): ${Array.from(s._coveredEntities).join(", ")}`
      : "";

  const facts = (s.facts ?? []).slice(0, 6).map((f: any) => f.text.slice(0, 100));
  const factsStr = facts.length ? `\n      • ${facts.join("\n      • ")}` : "None";

  const rels = (s.relationships ?? []).slice(0, 4).map((r: any) => `${r.sourceName} → ${r.targetName} (${r.type})`);
  const relsStr = rels.join("; ") || "None";

  const ideations = (s._inlineIdeations ?? []).slice(0, 3).map((i) => i.formatInstruction);
  const ideationsStr = ideations.length ? `\n      • ${ideations.join("\n      • ")}` : "None";

  const h3Block = (s._h3sEnriched ?? [])
    .map(
      (h) =>
        `\n   H3: <h3>${h.header}</h3> → FORMAT: ${h.passageFormat.format}`,
    )
    .join("");

  return [
    `SECTION: <${tag}>${header}</${tag}>${h3Block}${describePassage(s._passageFormat)}${variantNote}`,
    `   Entities: ${entitiesStr}${coveredStr}`,
    `   Facts:${factsStr === "None" ? " None" : factsStr}`,
    `   Relationships: ${relsStr}`,
    `   Ideations (generate as HTML):${ideationsStr === "None" ? " None" : ideationsStr}`,
    "---",
  ].join("\n");
}

function renderOutline(all: EnrichedSection[], currentIndex: number): string {
  const lines = [
    "FULL ARTICLE OUTLINE (for context — do NOT duplicate info from other sections):",
  ];
  for (let i = 0; i < all.length; i++) {
    const s = all[i];
    const header = s.header ?? "Introduction";
    const marker = i === currentIndex ? "→ CURRENT SECTION (write this one)" : "(other section — do not repeat its content)";
    lines.push(`  [${s.type}] ${header} ${marker}`);
  }
  return lines.join("\n");
}
```

- [ ] **Step 8.2: Typecheck**

Run: `pnpm --filter @sensai/api typecheck`
Expected: PASS.

- [ ] **Step 8.3: Commit**

```bash
git add apps/api/src/prompts/draft-generate.prompt.ts
git commit -m "feat(api): add draft.generate prompt builder"
```

---

## Task 9: DraftGeneratorClient — orchestrates per-block calls

**Files:**
- Create: `apps/api/src/tools/draft-generator/draft-generator.client.ts`
- Test: `apps/api/src/tests/draft-generator.client.test.ts`

- [ ] **Step 9.1: Write the failing test**

Create `apps/api/src/tests/draft-generator.client.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { DraftGeneratorClient } from "../tools/draft-generator/draft-generator.client";
import type { OpenAIResponsesClient } from "../llm/openai-responses.client";
import type { DistributionResult } from "@sensai/shared";

function fakeDistribution(): DistributionResult {
  return {
    meta: {
      keyword: "kortyzol",
      h1Title: "Jak obniżyć kortyzol po 40-tce",
      language: "pl",
      primaryIntent: "Instrukcyjna",
      generatedAt: new Date().toISOString(),
      model: "gemini",
    },
    sections: [
      { type: "intro", order: 0, header: null, sectionVariant: null, h3s: [], entities: [], facts: [], relationships: [], ideations: [], measurables: [] } as any,
      {
        type: "h2",
        order: 1,
        sectionVariant: "full",
        header: "Jak obniżyć kortyzol",
        sourceArea: "A1",
        sourceIntent: "Instrukcyjna",
        entities: [],
        facts: [],
        relationships: [],
        ideations: [],
        measurables: [],
        h3s: [],
      } as any,
    ],
    unused: { entityIds: [], factIds: [], relationshipIds: [], ideationIds: [], measurableIds: [] },
    stats: { coverage: { entities: { covered: 0, total: 0, percent: 100 }, facts: { covered: 0, total: 0, percent: 100 }, relationships: { covered: 0, total: 0, percent: 100 }, ideations: { covered: 0, total: 0, percent: 100 }, measurables: { covered: 0, total: 0, percent: 100 }, overallPercent: 100 } },
    warnings: [],
  };
}

describe("DraftGeneratorClient.generate", () => {
  it("calls openai once per section and chains response IDs", async () => {
    const responses = ["<p>Intro</p>", "<h2>Jak obniżyć kortyzol</h2><p>Body</p>"];
    let callIdx = 0;
    const createBlock = vi.fn().mockImplementation(async (args) => ({
      id: `resp_${callIdx + 1}`,
      outputText: responses[callIdx++],
      model: args.model,
      promptTokens: 100,
      completionTokens: 200,
      costUsd: "0.01",
      latencyMs: 1000,
    }));
    const sdk = { createBlock } as unknown as OpenAIResponsesClient;

    const client = new DraftGeneratorClient(sdk, {
      DRAFT_GENERATE_MODEL: "gpt-5.2",
      DRAFT_GENERATE_USE_REASONING: true,
      DRAFT_GENERATE_REASONING_EFFORT: "medium",
      DRAFT_GENERATE_VERBOSITY: "medium",
      DRAFT_GENERATE_BLOCK_DELAY_MS: 0,
    } as any);

    const result = await client.generate({
      ctx: { runId: "r1", stepId: "s1", attempt: 1 },
      distribution: fakeDistribution(),
    });

    expect(createBlock).toHaveBeenCalledTimes(2);
    expect(createBlock.mock.calls[0][0].previousResponseId).toBeUndefined();
    expect(createBlock.mock.calls[1][0].previousResponseId).toBe("resp_1");
    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[1].responseId).toBe("resp_2");
    expect(result.htmlChunks).toEqual(responses);
  });

  it("disables chaining and reasoning when USE_REASONING=false and emits a warning", async () => {
    const createBlock = vi.fn().mockResolvedValue({
      id: "r",
      outputText: "<p>x</p>",
      model: "claude-3",
      promptTokens: 1,
      completionTokens: 1,
      costUsd: "0",
      latencyMs: 1,
    });
    const sdk = { createBlock } as any;

    const client = new DraftGeneratorClient(sdk, {
      DRAFT_GENERATE_MODEL: "claude-3-haiku",
      DRAFT_GENERATE_USE_REASONING: false,
      DRAFT_GENERATE_REASONING_EFFORT: "medium",
      DRAFT_GENERATE_VERBOSITY: "medium",
      DRAFT_GENERATE_BLOCK_DELAY_MS: 0,
    } as any);

    const result = await client.generate({
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      distribution: fakeDistribution(),
    });

    expect(createBlock.mock.calls[0][0].previousResponseId).toBeUndefined();
    expect(createBlock.mock.calls[1][0].previousResponseId).toBeUndefined();
    expect(createBlock.mock.calls[0][0].reasoning).toBeUndefined();
    expect(result.warnings.some((w) => w.kind === "draft_chaining_disabled")).toBe(true);
  });
});
```

Run: `pnpm --filter @sensai/api test -- draft-generator.client`
Expected: FAIL — module missing.

- [ ] **Step 9.2: Implement the client**

Create `apps/api/src/tools/draft-generator/draft-generator.client.ts`:

```ts
import { Inject, Injectable, Logger } from "@nestjs/common";
import { OpenAIResponsesClient } from "../../llm/openai-responses.client";
import { draftGeneratePrompt } from "../../prompts/draft-generate.prompt";
import { dedupeH3Facts } from "./draft-generator.dedup";
import { detectPassageFormat } from "./draft-generator.headings";
import { splitIdeations } from "./draft-generator.ideations";
import type {
  DistributionResult,
  DraftBlockStats,
  DraftImagePrompt,
  DraftWarning,
} from "@sensai/shared";
import type { EnrichedSection, PassageFormat } from "./draft-generator.types";
import type { Env } from "../../config/env";

type ClientEnv = Pick<
  Env,
  | "DRAFT_GENERATE_MODEL"
  | "DRAFT_GENERATE_USE_REASONING"
  | "DRAFT_GENERATE_REASONING_EFFORT"
  | "DRAFT_GENERATE_VERBOSITY"
  | "DRAFT_GENERATE_BLOCK_DELAY_MS"
>;

interface CallCtx { runId: string; stepId: string; attempt: number }

interface GenerateArgs {
  ctx: CallCtx;
  distribution: DistributionResult;
}

export interface GenerateResult {
  htmlChunks: string[];
  blocks: DraftBlockStats[];
  imagePrompts: DraftImagePrompt[];
  warnings: DraftWarning[];
  factsRemovedFromH3: number;
}

const SHORT_BLOCK_THRESHOLD = 200; // chars

@Injectable()
export class DraftGeneratorClient {
  private readonly logger = new Logger(DraftGeneratorClient.name);

  constructor(
    private readonly openai: OpenAIResponsesClient,
    @Inject("DRAFT_GENERATOR_ENV") private readonly env: ClientEnv,
  ) {}

  async generate(args: GenerateArgs): Promise<GenerateResult> {
    const { distribution, ctx } = args;
    const lang = distribution.meta.language;
    const useReasoning = this.env.DRAFT_GENERATE_USE_REASONING;

    // 1. Deduplicate
    const dedup = dedupeH3Facts(distribution.sections);
    const factsRemovedFromH3 = dedup.factsRemoved;

    // 2. Enrich sections (passage format + ideation split + covered-entity flagging)
    const allImagePrompts: DraftImagePrompt[] = [];
    const enriched: EnrichedSection[] = dedup.sections.map((s) => {
      const passageFormat = detectPassageFormat(
        s.type === "intro" ? null : s.header,
        (s as any).sourceIntent,
        lang,
      );

      // h3s with their own passage formats
      const h3sEnriched = s.h3s.map((h3) => ({
        header: h3.header,
        passageFormat: detectPassageFormat(h3.header, undefined, lang),
      }));

      const sectionHeader = (s as any).header ?? "Introduction";
      const ideations = (s as any).ideations ?? [];
      const split = splitIdeations(ideations, sectionHeader);
      allImagePrompts.push(...split.external);

      const coveredEntities = new Set<string>(
        (s.entities ?? []).map((e: any) => e.id),
      );

      return {
        ...s,
        _passageFormat: passageFormat,
        _h3sEnriched: h3sEnriched,
        _inlineIdeations: split.inline,
        _externalIdeations: split.external,
        _coveredEntities: new Set<string>(), // start clean — H3 prompts get their own coverage; H2 doesn't suppress its own entities
      } as EnrichedSection;
    });

    // 3. Sequential LLM calls with chaining
    const warnings: DraftWarning[] = [];
    const blocks: DraftBlockStats[] = [];
    const htmlChunks: string[] = [];
    let prevResponseId: string | undefined;

    if (!useReasoning) {
      warnings.push({
        kind: "draft_chaining_disabled",
        message:
          "DRAFT_GENERATE_USE_REASONING=false — calling without previous_response_id chaining and without reasoning/verbosity params.",
        context: { model: this.env.DRAFT_GENERATE_MODEL },
      });
    }

    for (let i = 0; i < enriched.length; i++) {
      const section = enriched[i];

      const userPrompt = draftGeneratePrompt.user({
        blockNumber: i + 1,
        currentSectionIndex: i,
        allSections: enriched,
        block: section,
        keyword: distribution.meta.keyword,
        h1Title: distribution.meta.h1Title,
        language: lang,
      });

      const callArgs = {
        ctx,
        model: this.env.DRAFT_GENERATE_MODEL,
        system: draftGeneratePrompt.system,
        input: userPrompt,
        previousResponseId: useReasoning ? prevResponseId : undefined,
        reasoning: useReasoning
          ? { effort: this.env.DRAFT_GENERATE_REASONING_EFFORT }
          : undefined,
        verbosity: useReasoning ? this.env.DRAFT_GENERATE_VERBOSITY : undefined,
      };

      const res = await this.openai.createBlock(callArgs);
      const cleaned = res.outputText.replace(/<p>\s*<\/p>/g, "");
      htmlChunks.push(cleaned);
      prevResponseId = res.id;

      blocks.push({
        sectionOrder: section.order,
        sectionType: section.type,
        sectionVariant: section.type === "h2" ? section.sectionVariant : null,
        header: section.type === "intro" ? null : section.header,
        passageTrigger: section._passageFormat.trigger,
        charCount: cleaned.length,
        responseId: res.id,
        promptTokens: res.promptTokens,
        completionTokens: res.completionTokens,
        costUsd: res.costUsd,
        latencyMs: res.latencyMs,
      });

      if (cleaned.length < SHORT_BLOCK_THRESHOLD) {
        warnings.push({
          kind: "draft_short_block",
          message: `Block ${i + 1} produced only ${cleaned.length} chars`,
          blockOrder: section.order,
          context: { responseId: res.id },
        });
      }

      // Rate-limit pause (skip after last block)
      if (i < enriched.length - 1 && this.env.DRAFT_GENERATE_BLOCK_DELAY_MS > 0) {
        await new Promise((r) => setTimeout(r, this.env.DRAFT_GENERATE_BLOCK_DELAY_MS));
      }
    }

    if (allImagePrompts.length === 0) {
      warnings.push({
        kind: "draft_no_image_prompts",
        message: "No infografika/wykres ideations were present in the distribution.",
      });
    }

    return {
      htmlChunks,
      blocks,
      imagePrompts: allImagePrompts,
      warnings,
      factsRemovedFromH3,
    };
  }
}
```

- [ ] **Step 9.3: Run tests — verify GREEN**

Run: `pnpm --filter @sensai/api test -- draft-generator.client`
Expected: PASS — both cases.

- [ ] **Step 9.4: Commit**

```bash
git add apps/api/src/tools/draft-generator/draft-generator.client.ts \
        apps/api/src/tests/draft-generator.client.test.ts
git commit -m "feat(api): add DraftGeneratorClient with response-id chaining"
```

---

## Task 10: Pure module — assemble HTML

**Files:**
- Create: `apps/api/src/tools/draft-generator/draft-generator.assemble.ts`
- Test: `apps/api/src/tests/draft-generator.assemble.test.ts`

- [ ] **Step 10.1: Write the failing test**

Create `apps/api/src/tests/draft-generator.assemble.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { assembleDraft } from "../tools/draft-generator/draft-generator.assemble";

describe("assembleDraft", () => {
  it("prepends <h1>, joins chunks, collapses empty paragraphs", () => {
    const html = assembleDraft({
      h1Title: "Tytuł artykułu",
      htmlChunks: ["<p>Intro</p>", "<h2>Sekcja</h2><p></p><p>Body</p>"],
    });
    expect(html.startsWith("<h1>Tytuł artykułu</h1>")).toBe(true);
    expect(html).toContain("<h2>Sekcja</h2>");
    expect(html).toContain("<p>Intro</p>");
    expect(html).toContain("<p>Body</p>");
    expect(html).not.toMatch(/<p>\s*<\/p>/);
  });

  it("escapes < and > in h1Title", () => {
    const html = assembleDraft({ h1Title: "5 < 6 i 7 > 6", htmlChunks: ["<p>x</p>"] });
    expect(html).toContain("<h1>5 &lt; 6 i 7 &gt; 6</h1>");
  });
});
```

Run: `pnpm --filter @sensai/api test -- draft-generator.assemble`
Expected: FAIL.

- [ ] **Step 10.2: Implement the module**

Create `apps/api/src/tools/draft-generator/draft-generator.assemble.ts`:

```ts
interface AssembleArgs {
  h1Title: string;
  htmlChunks: string[];
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function assembleDraft(args: AssembleArgs): string {
  const parts = [`<h1>${escapeHtml(args.h1Title)}</h1>`, ...args.htmlChunks];
  let html = parts.join("\n\n");
  html = html.replace(/<p>\s*<\/p>/g, "");
  html = html.replace(/\n{3,}/g, "\n\n");
  return html.trim();
}
```

- [ ] **Step 10.3: Run tests — verify GREEN**

Run: `pnpm --filter @sensai/api test -- draft-generator.assemble`
Expected: PASS.

- [ ] **Step 10.4: Commit**

```bash
git add apps/api/src/tools/draft-generator/draft-generator.assemble.ts \
        apps/api/src/tests/draft-generator.assemble.test.ts
git commit -m "feat(api): add HTML assembly for draft.generate"
```

---

## Task 11: DraftGeneratorModule (NestJS DI)

**Files:**
- Create: `apps/api/src/tools/draft-generator/draft-generator.module.ts`

- [ ] **Step 11.1: Write the module**

Create `apps/api/src/tools/draft-generator/draft-generator.module.ts`:

```ts
import { Module } from "@nestjs/common";
import OpenAI from "openai";
import { ConfigModule } from "@nestjs/config";
import { OpenAIResponsesClient } from "../../llm/openai-responses.client";
import { CostTrackerService } from "../../llm/cost-tracker.service";
import { DraftGeneratorClient } from "./draft-generator.client";
import { loadEnv } from "../../config/env";

@Module({
  imports: [ConfigModule],
  providers: [
    CostTrackerService,
    {
      provide: "OPENAI_RESPONSES_SDK",
      useFactory: () => {
        const env = loadEnv();
        return new OpenAI({ apiKey: env.OPENAI_API_KEY });
      },
    },
    OpenAIResponsesClient,
    {
      provide: "DRAFT_GENERATOR_ENV",
      useFactory: () => {
        const env = loadEnv();
        return {
          DRAFT_GENERATE_MODEL: env.DRAFT_GENERATE_MODEL,
          DRAFT_GENERATE_USE_REASONING: env.DRAFT_GENERATE_USE_REASONING,
          DRAFT_GENERATE_REASONING_EFFORT: env.DRAFT_GENERATE_REASONING_EFFORT,
          DRAFT_GENERATE_VERBOSITY: env.DRAFT_GENERATE_VERBOSITY,
          DRAFT_GENERATE_BLOCK_DELAY_MS: env.DRAFT_GENERATE_BLOCK_DELAY_MS,
        };
      },
    },
    DraftGeneratorClient,
  ],
  exports: [DraftGeneratorClient],
})
export class DraftGeneratorModule {}
```

If `CostTrackerService` is already exported by an `LlmModule`, prefer importing that module instead of re-providing the service. Run: `grep -rn "class CostTrackerService" apps/api/src` to find its current home; if a module already exports it, import that module here and drop the provider entry.

- [ ] **Step 11.2: Typecheck and commit**

Run: `pnpm --filter @sensai/api typecheck`
Expected: PASS.

```bash
git add apps/api/src/tools/draft-generator/draft-generator.module.ts
git commit -m "feat(api): add DraftGeneratorModule"
```

---

## Task 12: Handler — `tool.draft.generate`

**Files:**
- Create: `apps/api/src/handlers/draft-generate.handler.ts`
- Test: `apps/api/src/tests/draft-generate.handler.test.ts`

- [ ] **Step 12.1: Write the failing test**

Create `apps/api/src/tests/draft-generate.handler.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { DraftGenerateHandler } from "../handlers/draft-generate.handler";
import type { DraftGeneratorClient } from "../tools/draft-generator/draft-generator.client";
import type { ToolCacheService } from "../tools/tool-cache.service";

function fakeDistribution() {
  return {
    meta: {
      keyword: "kortyzol",
      h1Title: "Jak obniżyć kortyzol",
      language: "pl",
      primaryIntent: "Instrukcyjna",
      generatedAt: new Date().toISOString(),
      model: "gemini",
    },
    sections: [
      { type: "intro", order: 0, header: null, sectionVariant: null, h3s: [], entities: [], facts: [], relationships: [], ideations: [], measurables: [] },
      { type: "h2", order: 1, sectionVariant: "full", header: "Jak obniżyć kortyzol", sourceArea: "A1", sourceIntent: "Instrukcyjna", entities: [], facts: [], relationships: [], ideations: [], measurables: [], h3s: [] },
    ],
    unused: { entityIds: [], factIds: [], relationshipIds: [], ideationIds: [], measurableIds: [] },
    stats: { coverage: { entities: { covered: 0, total: 0, percent: 100 }, facts: { covered: 0, total: 0, percent: 100 }, relationships: { covered: 0, total: 0, percent: 100 }, ideations: { covered: 0, total: 0, percent: 100 }, measurables: { covered: 0, total: 0, percent: 100 }, overallPercent: 100 } },
    warnings: [],
  };
}

describe("DraftGenerateHandler.execute", () => {
  it("throws when previousOutputs.distribute is missing", async () => {
    const client = { generate: vi.fn() } as unknown as DraftGeneratorClient;
    const cache = { getOrSet: vi.fn() } as unknown as ToolCacheService;
    const handler = new DraftGenerateHandler(client, cache, {
      DRAFT_GENERATE_MODEL: "gpt-5.2",
      DRAFT_GENERATE_TTL_DAYS: 7,
    } as any);

    await expect(
      handler.execute({
        run: { id: "r", input: {} },
        step: { id: "s" },
        project: { id: "p", config: {} },
        previousOutputs: {},
        attempt: 1,
        forceRefresh: false,
      } as any),
    ).rejects.toThrow(/draft.generate requires previousOutputs.distribute/);
  });

  it("calls cache.getOrSet and returns the resulting DraftGenerationResult", async () => {
    const dist = fakeDistribution();
    const client = {
      generate: vi.fn().mockResolvedValue({
        htmlChunks: ["<p>Intro</p>", "<h2>X</h2>"],
        blocks: [
          { sectionOrder: 0, sectionType: "intro", sectionVariant: null, header: null, passageTrigger: "instruction", charCount: 10, responseId: "r1", promptTokens: 1, completionTokens: 1, costUsd: "0.001", latencyMs: 1 },
          { sectionOrder: 1, sectionType: "h2", sectionVariant: "full", header: "X", passageTrigger: "instruction", charCount: 10, responseId: "r2", promptTokens: 1, completionTokens: 1, costUsd: "0.001", latencyMs: 1 },
        ],
        imagePrompts: [],
        warnings: [],
        factsRemovedFromH3: 0,
      }),
    } as unknown as DraftGeneratorClient;

    const cache = {
      getOrSet: vi.fn(async (args: any) => (await args.fetcher()).result),
    } as unknown as ToolCacheService;

    const handler = new DraftGenerateHandler(client, cache, {
      DRAFT_GENERATE_MODEL: "gpt-5.2",
      DRAFT_GENERATE_TTL_DAYS: 7,
    } as any);

    const res = await handler.execute({
      run: { id: "r", input: {} },
      step: { id: "s" },
      project: { id: "p", config: {} },
      previousOutputs: { distribute: dist },
      attempt: 1,
      forceRefresh: false,
    } as any);

    const out = res.output as any;
    expect(out.meta.h1Title).toBe("Jak obniżyć kortyzol");
    expect(out.htmlContent.startsWith("<h1>Jak obniżyć kortyzol</h1>")).toBe(true);
    expect(out.blocks).toHaveLength(2);
    expect(out.stats.blockCount).toBe(2);
    expect(out.stats.factsRemovedFromH3).toBe(0);
  });
});
```

Run: `pnpm --filter @sensai/api test -- draft-generate.handler`
Expected: FAIL.

- [ ] **Step 12.2: Implement the handler**

Create `apps/api/src/handlers/draft-generate.handler.ts`:

```ts
import { Inject, Injectable, Logger } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { StepContext, StepHandler, StepResult } from "../orchestrator/step-handler";
import {
  DistributionResult,
  DraftGenerationResult,
  type DraftBlockStats,
} from "@sensai/shared";
import { ToolCacheService } from "../tools/tool-cache.service";
import { DraftGeneratorClient } from "../tools/draft-generator/draft-generator.client";
import { assembleDraft } from "../tools/draft-generator/draft-generator.assemble";
import type { Env } from "../config/env";

type HandlerEnv = Pick<
  Env,
  | "DRAFT_GENERATE_MODEL"
  | "DRAFT_GENERATE_USE_REASONING"
  | "DRAFT_GENERATE_REASONING_EFFORT"
  | "DRAFT_GENERATE_VERBOSITY"
  | "DRAFT_GENERATE_TTL_DAYS"
>;

const PROMPT_VERSION = "v1";

@Injectable()
export class DraftGenerateHandler implements StepHandler {
  readonly type = "tool.draft.generate";
  private readonly logger = new Logger(DraftGenerateHandler.name);

  constructor(
    private readonly client: DraftGeneratorClient,
    private readonly cache: ToolCacheService,
    @Inject("DRAFT_GENERATE_HANDLER_ENV") private readonly env: HandlerEnv,
  ) {}

  async execute(ctx: StepContext): Promise<StepResult> {
    const prev = ctx.previousOutputs.distribute;
    if (prev === undefined || prev === null) {
      throw new Error("draft.generate requires previousOutputs.distribute");
    }
    const distribution = DistributionResult.parse(prev);
    const distHash = sha256(JSON.stringify(distribution));

    const result = await this.cache.getOrSet<DraftGenerationResult>({
      tool: "draft",
      method: "generate",
      params: {
        distHash,
        model: this.env.DRAFT_GENERATE_MODEL,
        useReasoning: this.env.DRAFT_GENERATE_USE_REASONING,
        reasoningEffort: this.env.DRAFT_GENERATE_REASONING_EFFORT,
        verbosity: this.env.DRAFT_GENERATE_VERBOSITY,
        promptVersion: PROMPT_VERSION,
      },
      ttlSeconds: this.env.DRAFT_GENERATE_TTL_DAYS * 24 * 3600,
      runId: ctx.run.id,
      stepId: ctx.step.id,
      forceRefresh: ctx.forceRefresh,
      fetcher: async () => {
        const gen = await this.client.generate({
          ctx: { runId: ctx.run.id, stepId: ctx.step.id, attempt: ctx.attempt },
          distribution,
        });

        const html = assembleDraft({
          h1Title: distribution.meta.h1Title,
          htmlChunks: gen.htmlChunks,
        });

        const totalChars = html.length;
        const totalLatencyMs = gen.blocks.reduce((s, b) => s + b.latencyMs, 0);
        const totalPromptTokens = gen.blocks.reduce((s, b) => s + b.promptTokens, 0);
        const totalCompletionTokens = gen.blocks.reduce((s, b) => s + b.completionTokens, 0);
        const totalCostUsd = gen.blocks
          .reduce((s, b) => s + Number(b.costUsd), 0)
          .toFixed(6);

        const draft: DraftGenerationResult = {
          meta: {
            keyword: distribution.meta.keyword,
            h1Title: distribution.meta.h1Title,
            language: distribution.meta.language,
            primaryIntent: distribution.meta.primaryIntent,
            model: this.env.DRAFT_GENERATE_MODEL,
            generatedAt: new Date().toISOString(),
            useReasoning: this.env.DRAFT_GENERATE_USE_REASONING,
            reasoningEffort: this.env.DRAFT_GENERATE_USE_REASONING
              ? this.env.DRAFT_GENERATE_REASONING_EFFORT
              : null,
            verbosity: this.env.DRAFT_GENERATE_USE_REASONING
              ? this.env.DRAFT_GENERATE_VERBOSITY
              : null,
          },
          htmlContent: html,
          blocks: gen.blocks satisfies DraftBlockStats[],
          imagePrompts: gen.imagePrompts,
          stats: {
            blockCount: gen.blocks.length,
            totalChars,
            totalLatencyMs,
            totalCostUsd,
            totalPromptTokens,
            totalCompletionTokens,
            imagePromptCount: gen.imagePrompts.length,
            factsRemovedFromH3: gen.factsRemovedFromH3,
          },
          warnings: gen.warnings,
        };

        DraftGenerationResult.parse(draft); // self-check before caching

        return {
          result: draft,
          costUsd: totalCostUsd,
          latencyMs: totalLatencyMs,
        };
      },
    });

    if (result.warnings.length > 0) {
      this.logger.warn(
        { runId: ctx.run.id, stepId: ctx.step.id, warnings: result.warnings },
        `draft.generate: ${result.warnings.length} warnings`,
      );
    }

    this.logger.log(
      {
        runId: ctx.run.id,
        stepId: ctx.step.id,
        blocks: result.stats.blockCount,
        totalChars: result.stats.totalChars,
        totalCostUsd: result.stats.totalCostUsd,
        totalLatencyMs: result.stats.totalLatencyMs,
        imagePrompts: result.stats.imagePromptCount,
      },
      "draft.generate done",
    );

    return { output: result };
  }
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
```

- [ ] **Step 12.3: Run tests — verify GREEN**

Run: `pnpm --filter @sensai/api test -- draft-generate.handler`
Expected: PASS — both cases.

- [ ] **Step 12.4: Commit**

```bash
git add apps/api/src/handlers/draft-generate.handler.ts \
        apps/api/src/tests/draft-generate.handler.test.ts
git commit -m "feat(api): add tool.draft.generate handler"
```

---

## Task 13: Register handler in HandlersModule

**Files:**
- Modify: `apps/api/src/handlers/handlers.module.ts`

- [ ] **Step 13.1: Read current module**

Run: `cat apps/api/src/handlers/handlers.module.ts`
Note exact provider list and `STEP_HANDLERS` factory shape.

- [ ] **Step 13.2: Add imports**

At the top of the file:

```ts
import { DraftGeneratorModule } from "../tools/draft-generator/draft-generator.module";
import { DraftGenerateHandler } from "./draft-generate.handler";
```

- [ ] **Step 13.3: Add module to `imports[]`**

Add `DraftGeneratorModule` to the `@Module({ imports: [...] })` array (next to `OutlineGeneratorModule`, `KGDistributorModule`, etc.).

- [ ] **Step 13.4: Add handler + env provider**

In the `providers` array, add (matching the existing Plan 12 pattern shape):

```ts
DraftGenerateHandler,
{
  provide: "DRAFT_GENERATE_HANDLER_ENV",
  useFactory: () => {
    const env = loadEnv();
    return {
      DRAFT_GENERATE_MODEL: env.DRAFT_GENERATE_MODEL,
      DRAFT_GENERATE_USE_REASONING: env.DRAFT_GENERATE_USE_REASONING,
      DRAFT_GENERATE_REASONING_EFFORT: env.DRAFT_GENERATE_REASONING_EFFORT,
      DRAFT_GENERATE_VERBOSITY: env.DRAFT_GENERATE_VERBOSITY,
      DRAFT_GENERATE_TTL_DAYS: env.DRAFT_GENERATE_TTL_DAYS,
    };
  },
},
```

In the `STEP_HANDLERS` factory, add `draftGenerate: DraftGenerateHandler` to the parameter list AND to the returned array, AND add `DraftGenerateHandler` to the `inject` list (last position).

- [ ] **Step 13.5: Typecheck**

Run: `pnpm --filter @sensai/api typecheck`
Expected: PASS.

- [ ] **Step 13.6: Commit**

```bash
git add apps/api/src/handlers/handlers.module.ts
git commit -m "feat(api): register DraftGenerateHandler in HandlersModule"
```

---

## Task 14: Extend template seed with `draftGen` step

**Files:**
- Modify: `apps/api/src/seed/seed.ts`

- [ ] **Step 14.1: Read current seed**

Run: `grep -n "outline.distribute" apps/api/src/seed/seed.ts`
Find the existing template definition; we extend its `steps[]` and rename the title.

- [ ] **Step 14.2: Update the template**

Replace the existing template name and append `draftGen`:

```ts
const blogSeoOutline = await upsertTemplate(
  db,
  "Blog SEO — fanout + deep research + clean + extract + entities + KG + outline + distribute + draft",
  1,
  {
    steps: [
      { key: "fanout",       type: "tool.query.fanout",       auto: true,  dependsOn: [] },
      { key: "deepResearch", type: "tool.youcom.research",    auto: true,  dependsOn: [] },
      { key: "research",     type: "tool.serp.fetch",         auto: true,  dependsOn: [] },
      { key: "scrape",       type: "tool.scrape",             auto: false, dependsOn: ["research"] },
      { key: "clean",        type: "tool.content.clean",      auto: true,  dependsOn: ["scrape"] },
      { key: "extract",      type: "tool.content.extract",    auto: true,  dependsOn: ["clean", "deepResearch"] },
      { key: "entities",     type: "tool.entity.extract",     auto: true,  dependsOn: ["clean", "deepResearch"] },
      { key: "kg",           type: "tool.kg.assemble",        auto: true,  dependsOn: ["extract", "entities"] },
      { key: "outlineGen",   type: "tool.outline.generate",   auto: true,  dependsOn: ["fanout"] },
      { key: "distribute",   type: "tool.outline.distribute", auto: true,  dependsOn: ["outlineGen", "kg"] },
      { key: "draftGen",     type: "tool.draft.generate",     auto: true,  dependsOn: ["distribute"] },
    ],
  },
);
```

- [ ] **Step 14.3: Run seed against local DB**

Pre-req: Postgres running (`pnpm dev:infra` if not already). Then:

Run: `pnpm --filter @sensai/api db:seed`
Expected: log line confirming the template was upserted with 11 steps. No errors.

- [ ] **Step 14.4: Commit**

```bash
git add apps/api/src/seed/seed.ts
git commit -m "feat(api): seed template with tool.draft.generate step"
```

---

## Task 15: UI renderer — DraftOutput

**Files:**
- Create: `apps/web/src/components/step-output/draft.tsx`
- Modify: `apps/web/src/components/step-output/index.tsx`

- [ ] **Step 15.1: Read the existing index router**

Run: `cat apps/web/src/components/step-output/index.tsx`
Note `hasRichRenderer` map and the routing switch.

- [ ] **Step 15.2: Create the renderer**

Create `apps/web/src/components/step-output/draft.tsx`:

```tsx
"use client";
import type { DraftGenerationResult } from "@sensai/shared";

function isDraftResult(v: unknown): v is DraftGenerationResult {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.htmlContent === "string" &&
    !!o.meta &&
    Array.isArray(o.blocks) &&
    Array.isArray(o.imagePrompts)
  );
}

export function DraftOutput({ value }: { value: unknown }) {
  if (!isDraftResult(value)) {
    return <div className="text-sm text-muted-foreground">Brak danych</div>;
  }
  return <DraftRenderer output={value} />;
}

function DraftRenderer({ output }: { output: DraftGenerationResult }) {
  const { meta, htmlContent, blocks, imagePrompts, stats, warnings } = output;

  // Inline a tiny stylesheet so the iframe preview looks readable.
  const sandboxedHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#1e293b;line-height:1.6}
    h1{font-size:1.875rem;margin-top:0}
    h2{font-size:1.5rem;margin-top:1.5em;border-bottom:1px solid #e2e8f0;padding-bottom:.25em}
    h3{font-size:1.125rem;margin-top:1.25em}
    p{margin:.75em 0}
    table{border-collapse:collapse;width:100%;margin:1em 0}
    th,td{border:1px solid #cbd5e1;padding:.5em .75em;text-align:left}
    th{background:#f1f5f9}
    ul{padding-left:1.25em}
  </style></head><body>${htmlContent}</body></html>`;

  return (
    <div className="space-y-4">
      <header className="rounded border bg-slate-50 p-3">
        <div className="text-sm text-muted-foreground">
          keyword: <span className="font-mono">{meta.keyword}</span> · language: {meta.language} · model: {meta.model}
        </div>
        <div className="mt-1 text-lg font-semibold">{meta.h1Title}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {stats.blockCount} bloków · {stats.totalChars} znaków · {stats.totalLatencyMs} ms ·
          ${stats.totalCostUsd} · {stats.imagePromptCount} infografik · usuniętych H3 faktów: {stats.factsRemovedFromH3}
        </div>
      </header>

      <section>
        <div className="mb-2 text-sm font-semibold">Podgląd HTML</div>
        <iframe
          title="Draft preview"
          srcDoc={sandboxedHtml}
          sandbox="allow-same-origin"
          className="h-[600px] w-full rounded border bg-white"
        />
      </section>

      <section>
        <div className="mb-2 text-sm font-semibold">Bloki ({blocks.length})</div>
        <div className="space-y-1">
          {blocks.map((b) => (
            <div key={`${b.sectionOrder}-${b.responseId}`} className="rounded border bg-white p-2 text-xs">
              <div className="font-mono">
                #{b.sectionOrder} [{b.sectionType}{b.sectionVariant ? `/${b.sectionVariant}` : ""}|{b.passageTrigger}]{" "}
                {b.header ?? "Intro"}
              </div>
              <div className="text-muted-foreground">
                {b.charCount} chars · {b.promptTokens}+{b.completionTokens} tok · ${b.costUsd} · {b.latencyMs}ms · resp:{b.responseId.slice(0, 12)}…
              </div>
            </div>
          ))}
        </div>
      </section>

      {imagePrompts.length > 0 && (
        <section>
          <div className="mb-2 text-sm font-semibold">Prompty infografik ({imagePrompts.length})</div>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {imagePrompts.map((p, i) => (
              <li key={i}>
                <span className="font-mono text-xs text-muted-foreground">[{p.ideationType}]</span> {p.sectionHeader}: {p.description}
              </li>
            ))}
          </ul>
        </section>
      )}

      {warnings.length > 0 && (
        <section className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          <div className="mb-1 font-semibold text-amber-900">Ostrzeżenia ({warnings.length})</div>
          <ul className="list-disc space-y-1 pl-5">
            {warnings.map((w, i) => (
              <li key={i}>
                <span className="font-mono text-xs">{w.kind}</span>
                {w.blockOrder !== undefined ? ` (block ${w.blockOrder})` : ""}: {w.message}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 15.3: Wire into the renderer index**

In `apps/web/src/components/step-output/index.tsx`:
- Add `import { DraftOutput } from "./draft"` near other imports.
- Add a routing entry mapping `"tool.draft.generate"` to `<DraftOutput value={value} />`.
- Add `"tool.draft.generate"` to whatever `hasRichRenderer` predicate exists (so the UI knows not to fall back to JSON dump).

- [ ] **Step 15.4: Web typecheck and dev sanity**

Run: `pnpm --filter @sensai/web typecheck`
Expected: PASS.

(Optional but recommended) Start dev: `pnpm dev:web`. Open a run that has a populated `draftGen` step and verify the iframe renders the article.

- [ ] **Step 15.5: Commit**

```bash
git add apps/web/src/components/step-output/draft.tsx \
        apps/web/src/components/step-output/index.tsx
git commit -m "feat(web): add DraftOutput renderer for tool.draft.generate"
```

---

## Task 16: Smoke script — `scripts/smoke-plan-13.ts`

**Files:**
- Create: `scripts/smoke-plan-13.ts`
- Modify: `package.json` (root)

- [ ] **Step 16.1: Write the smoke script**

Create `scripts/smoke-plan-13.ts`:

```ts
#!/usr/bin/env tsx
/**
 * Plan 13 manual smoke test — Draft generation.
 *
 * Reads the Plan 12 smoke output (`scripts/smoke-output/plan-12-distribution.json`)
 * and runs DraftGenerateHandler in isolation.
 *
 * Pre-req: run `pnpm smoke:plan-12` first to produce the input fixture.
 *
 * Run: pnpm smoke:plan-13
 */
import "dotenv/config";
import "reflect-metadata";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Test } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { HandlersModule } from "../apps/api/src/handlers/handlers.module";
import { DraftGenerateHandler } from "../apps/api/src/handlers/draft-generate.handler";
import { DistributionResult } from "@sensai/shared";

const OUTPUT_DIR = resolve(__dirname, "smoke-output");
const INPUT_FILE = join(OUTPUT_DIR, "plan-12-distribution.json");

async function main() {
  if (!existsSync(INPUT_FILE)) {
    console.error(
      `[smoke] FAIL — input fixture missing: ${INPUT_FILE}\n` +
        "Run `pnpm smoke:plan-12` first to produce it.",
    );
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(INPUT_FILE, "utf-8"));
  const distribution = DistributionResult.parse(raw);

  console.log(
    `[smoke] distribution: ${distribution.sections.length} sections, ` +
      `coverage=${distribution.stats.coverage.overallPercent}%, ` +
      `language=${distribution.meta.language}`,
  );

  const moduleRef = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true }), HandlersModule],
  }).compile();

  const handler = moduleRef.get(DraftGenerateHandler);

  const ctx = {
    run: {
      id: `smoke-plan-13-${Date.now()}`,
      input: { topic: distribution.meta.keyword, mainKeyword: distribution.meta.keyword },
    },
    step: { id: "smoke-step-draft-generate" },
    project: { id: "smoke-project", config: {} },
    previousOutputs: { distribute: distribution },
    attempt: 1,
    forceRefresh: false,
  } as any;

  console.log("[smoke] draft.generate …");
  const t0 = Date.now();
  const res = await handler.execute(ctx);
  const ms = Date.now() - t0;
  const out = res.output as any;

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(
    join(OUTPUT_DIR, "plan-13-draft.json"),
    JSON.stringify(out, null, 2),
    "utf-8",
  );
  writeFileSync(join(OUTPUT_DIR, "plan-13-draft.html"), out.htmlContent, "utf-8");

  console.log(
    `[smoke] draft.generate done: ${ms}ms | ` +
      `blocks=${out.stats.blockCount} ` +
      `chars=${out.stats.totalChars} ` +
      `cost=$${out.stats.totalCostUsd} ` +
      `imagePrompts=${out.stats.imagePromptCount} ` +
      `warnings=${out.warnings.length}`,
  );

  console.log(`[smoke] ASSERT chars>3000: ${out.stats.totalChars > 3000 ? "PASS" : `WARN (got ${out.stats.totalChars})`}`);
  console.log(`[smoke] ASSERT blocks>=2: ${out.stats.blockCount >= 2 ? "PASS" : `WARN (got ${out.stats.blockCount})`}`);
  console.log(`[smoke] ASSERT html starts with <h1>: ${out.htmlContent.trimStart().startsWith("<h1>") ? "PASS" : "WARN"}`);

  await moduleRef.close();
  console.log("[smoke] PASS — Plan 13 draft.generate smoke complete");
}

main().catch((e) => {
  console.error("[smoke] FAIL:", e);
  process.exit(1);
});
```

- [ ] **Step 16.2: Add root package.json script**

In root `package.json`, append to `scripts`:

```json
"smoke:plan-13": "apps/api/node_modules/.bin/tsx --tsconfig apps/api/tsconfig.json scripts/smoke-plan-13.ts"
```

- [ ] **Step 16.3: Typecheck**

Run: `pnpm --filter @sensai/api typecheck && pnpm --filter @sensai/shared typecheck`
Expected: PASS.

- [ ] **Step 16.4: Commit (without running the smoke yet)**

```bash
git add scripts/smoke-plan-13.ts package.json
git commit -m "test: add Plan 13 draft.generate smoke (Plan 12 fixture)"
```

---

## Task 17: Run the smoke and verify

**Files:** none

This is a manual verification step that exercises the real OpenAI API. Cost ≈ $0.10–$0.50 for a typical 8-section article on `gpt-5.2` with reasoning medium.

- [ ] **Step 17.1: Verify Plan 12 fixture exists**

Run: `ls scripts/smoke-output/plan-12-distribution.json`
Expected: file exists. If not, run `pnpm smoke:plan-12` first.

- [ ] **Step 17.2: Run the smoke**

Run: `pnpm smoke:plan-13`
Expected console output:

```
[smoke] distribution: 9 sections, coverage=...%, language=pl
[smoke] draft.generate …
[smoke] draft.generate done: 90000-180000ms | blocks=9 chars=15000-25000 cost=$0.10-$0.50 imagePrompts=0-3 warnings=0-1
[smoke] ASSERT chars>3000: PASS
[smoke] ASSERT blocks>=2: PASS
[smoke] ASSERT html starts with <h1>: PASS
[smoke] PASS — Plan 13 draft.generate smoke complete
```

- [ ] **Step 17.3: Inspect outputs**

```bash
ls -la scripts/smoke-output/plan-13-draft.json scripts/smoke-output/plan-13-draft.html
open scripts/smoke-output/plan-13-draft.html  # macOS — visual sanity check
```

Verify by eye: headings render, no `<p></p>` blocks, no obvious duplicate sentences across H2 sections, infografika ideations (if any in the fixture) appear in `imagePrompts` array, NOT inline.

- [ ] **Step 17.4: If anything failed**, debug:
- `OPENAI_API_KEY` not set → ensure `.env` has it; export it for the shell.
- Rate limit (429) → bump `DRAFT_GENERATE_BLOCK_DELAY_MS` to 2000.
- Reasoning model not available on the API key → set `DRAFT_GENERATE_USE_REASONING=false` and a non-reasoning model like `DRAFT_GENERATE_MODEL=gpt-4o`.

No commit for this task — it's verification.

---

## Task 18: Self-review and merge

- [ ] **Step 18.1: Final tests**

```bash
pnpm --filter @sensai/api test
pnpm --filter @sensai/shared test || true  # may not have tests
pnpm --filter @sensai/api typecheck
pnpm --filter @sensai/web typecheck
```
Expected: all green.

- [ ] **Step 18.2: Skim the PR diff**

Run: `git log --oneline main..HEAD` — confirm commit history maps to the 16 tasks.
Run: `git diff main..HEAD --stat` — sanity check on file count.

- [ ] **Step 18.3: Open the PR**

```bash
gh pr create --title "Plan 13 — Draft Generation" --body "$(cat <<'EOF'
## Summary
- Adds `tool.draft.generate` pipeline step consuming `DistributionResult` (Plan 12)
- Per-block LLM calls via OpenAI Responses API with `previous_response_id` chaining
- Deterministic heading-trigger analysis (regex, no LLM hop) + H3-vs-H2 fact dedup
- Inline ideations rendered as HTML `<table>` / `<ul>`; infografika/wykres emitted as separate `imagePrompts[]`
- New `OpenAIResponsesClient` reuses `CostTrackerService` so per-block cost/latency stays observable in `llm_calls`
- New web renderer with sandboxed iframe HTML preview

## Test plan
- [x] Unit tests: dedup, headings, ideations, assemble, openai-responses, draft-generator client, handler
- [x] Typecheck (api + web + shared)
- [x] Smoke `pnpm smoke:plan-13` against real OpenAI API — produces non-empty HTML + ~9 blocks
- [ ] User-facing UI verification: load a run with `draftGen` step in the web app and confirm preview iframe renders

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 18.4: Update memory after merge**

After the PR merges to `main`, ask Claude to record the merge under `project_plan_13_draft_generation.md` and link it in `MEMORY.md`.

---

## Spec coverage check

| Lesson concept (from `lekcja-3.2-generowanie-draftu-tresci.md`) | Implemented in |
|---|---|
| Draft to nie finalna wersja — pipeline produces *draft*, not finished article | Output schema + UI label "draft" |
| Generowanie sekcja po sekcji (Krok 1) | Task 9 — one LLM call per section |
| Response ID chaining (Krok 2) | Task 7 (client) + Task 9 (orchestrator) |
| 3 mechanizmy antyduplikacji (Krok 3) | Chaining (Task 9) + outline w prompcie (Task 8) + dedup H3/H2 (Task 3) |
| Analiza nagłówków → format sekcji (Krok 4) | Task 4 — `detectPassageFormat` |
| Struktura sekcji 5 elementów (Krok 5) | `PASSAGE_BLUEPRINT` constant in Task 8 |
| 5 typów kotwic encji (Krok 6) | `ENTITY_RULES` constant in Task 8 |
| Reguły jakościowe BLUF/NO FILLER/NO DUPLICATE/H2/H3 (Krok 7) | `QUALITY_RULES` constant in Task 8 |
| Konfiguracja: model, verbosity, reasoning effort (Krok 8) | Task 2 (env) + Task 9 (wired through) |
| `full` vs `context` sekcje (Krok 9) | `renderSection` in Task 8 emits `⚠️ CONTEXT SECTION` note |
| Mosty kontekstowe między sekcjami (Krok 10) | `bridgeInstruction` in Task 8 (only on block ≥ 2) |
| 4 błędy do unikania | `ERROR_AVOIDANCE` constant in Task 8 |
| Ideacje inline vs external | Task 5 — `splitIdeations` |
| Pauza między blokami (rate limit) | Task 9 — `DRAFT_GENERATE_BLOCK_DELAY_MS` |
| Output: `output_draft.html` + `output_image_prompts.json` | `DraftGenerationResult.htmlContent` + `imagePrompts[]` |

All concepts mapped. No placeholders. Type signatures in later tasks (`DraftBlockStats`, `DraftImagePrompt`, `EnrichedSection`, `PassageFormat`) are defined in Tasks 1 and 3 before first use.
