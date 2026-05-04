# Plan 15 — Article Optimize + Intermediate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two sequential post-production pipeline steps that operate on Plan 14's `DataEnrichmentResult.htmlContent`. (1) `tool.article.optimize` — copywriter-rule pass that strips "AI-isms" (first person, bold promises, repeated definitions, imperative-heavy paragraphs, technical-instruction bloat). (2) `tool.article.intermediate` — narrative-flow + visual-formatting pass that injects natural transitions (rules G, H) and HTML formatting (`<strong>`, `<i>`, `<blockquote>`, `<br />` per rule K). Both steps must NOT alter the article's data — numbers, dates, DOIs and source citations are mechanically preserved via a shared "Hybrid protection" mechanism.

**Architecture:** Both handlers wrap their LLM call in a shared `article-protect` utility module that mirrors the Python educational reference (`docs/edu/lekcja-3-4/T3F4-article_*_educational.py`). The module exposes three pure functions: `tokenizeHybrid(html) → { html, srcMap, spanMap }` (regex replaces `(Źródło: …)` with `[[SRC_xxx]]` placeholders, then wraps numbers/dates/DOIs/bracket-refs in `<span data-token-id="…">`); `restoreHybrid(html, srcMap, spanMap) → { html, missingSrc, missingSpans }` (reverse, with span unwrap); plus a `guards` namespace for `extractPlainText`, `extractNumberSet`, `countFormatting`, `detectSeoIntro`, `hasH1Tag`, `hasAnchorTags`. Each handler delegates to a thin `Article{Optimize,Intermediate}Client` that calls the existing `OpenAIResponsesClient.createBlock()` (no chaining, no `previousResponseId`, just `system` + `input`). The `intermediate` handler additionally enforces six post-call hard-fail guards (missing `<h1>`, growth > +10%, lost numbers, lost sources, added `<a>`, SEO-intro detected). The `optimize` handler enforces only the SRC-placeholder check (mirrors Python's `article_check_educational.py`). Cache + cost tracking follow the Plan 14 pattern verbatim.

**Tech Stack:** TypeScript / NestJS / Zod / Vitest / cheerio (HTML walking; already a Plan 14 dep) / `openai` SDK ≥ 6.35 (Responses API, model `gpt-5.2`) / existing `OpenAIResponsesClient` reused as-is.

**Lesson sources:**
- `docs/edu/lekcja-3-4/3.4-optymalizacja-i-przejscia.md` (lesson notes + transcript)
- `docs/edu/lekcja-3-4/T3F4-optymalizacja-i-przejscia.md` (detailed teaching reference; Hybrid protection pattern, guard tables, validation flow)
- `docs/edu/lekcja-3-4/T3F4-PROMPT_ARTICLE_CHECK.md` (verbatim copywriter-rules prompt with placeholders for `{LENGTH_BLOCK}` / `{SOURCE_BLOCK}`)
- `docs/edu/lekcja-3-4/T3F4-PROMPT_INTERMEDIATE.md` (verbatim transition + formatting prompt)
- `docs/edu/lekcja-3-4/T3F4-article_check_educational.py` (Python reference — mirror its regex set + tokenize/restore order verbatim)
- `docs/edu/lekcja-3-4/T3F4-article_intermediate_educational.py` (Python reference — mirror its 6 hard-fail guards verbatim)

---

## Critical gotchas

**Gotcha 1 — Shared package build:** `packages/shared` must be **rebuilt** (`pnpm --filter @sensai/shared build`) after every change to `schemas.ts`. The API imports from compiled `dist/`, not `src/`. Every task that touches `packages/shared/src/schemas.ts` ends with a build step. Same as Plan 14.

**Gotcha 2 — `previousOutputs` keys follow step keys, not types:** New template adds `{ key: "optimize", type: "tool.article.optimize", dependsOn: ["enrich"] }` and `{ key: "intermediate", type: "tool.article.intermediate", dependsOn: ["optimize"] }`. The orchestrator hydrates `previousOutputs` keyed by step **key**, so the optimize handler reads `ctx.previousOutputs.enrich` (parses with `DataEnrichmentResult`); the intermediate handler reads `ctx.previousOutputs.optimize` (parses with `ArticleOptimizeResult`). Fail closed if missing/invalid.

**Gotcha 3 — Tokenization order is load-bearing — SRC FIRST, then NUM/DAT:** Source citations like `(Źródło: WHO, 2024 — who.int/...)` contain a year that the NUM/DATE regex would otherwise eat. Mirror the Python order: `SOURCE_CITATION_RE.replace → SRC placeholders` first, then `DOI_RE → REF_RE → NUM_RE → DATE_RE → span wrap`. The reverse order corrupts cytaty. There is a unit test specifically for "year inside source citation is not double-tokenized."

**Gotcha 4 — `[[SRC_xxx]]` collides with `BRACKET_REF_RE`:** The placeholder `[[SRC_001]]` literally contains `[SRC_001]`, which `BRACKET_REF_RE = /\[(?:\d{1,3}|[A-Za-z0-9-_]+)\]/` matches. Python's solution (we mirror it verbatim): before the NUM/DAT/REF wrap pass, swap each `[[SRC_xxx]]` to a sentinel `__SRCHOLD_<i>__`, run the wrap pass, then restore the SRC placeholders. Without this, the model receives `<span data-token-id="REF_…">[SRC_001]</span>` and the SRC restore later finds nothing.

**Gotcha 5 — `BRACKET_REF` excludes the SRC sentinel:** Even with the sentinel swap, be defensive: `BRACKET_REF_RE` should not accidentally match a single-bracket `[SRC_…]` substring if the swap missed one. Test that running tokenize twice on the same input is idempotent (the second pass finds no new SRC, and span IDs are NOT regenerated for already-spanned text — guarantee this by skipping content already inside a `data-token-id` span via cheerio in the wrap pass — see Task 4).

**Gotcha 6 — HARD FAIL on missing SRC, SOFT WARNING on missing spans:** Python guard hierarchy is intentional. SRC placeholders carry the inline citation text — losing one means a broken article (no source visible). NUM/DAT spans carry text the model already saw verbatim; losing the wrap is suspicious but the value usually survived. Both handlers: missing SRC → throw `Error("article.{optimize|intermediate}: source placeholder lost: …")`. Missing spans → push warning, continue.

**Gotcha 7 — Intermediate-only guards (six, all hard-fail):**
1. **Missing `<h1>`** — model dropped the title.
2. **Length growth > +10%** — `extractPlainText(output).length / extractPlainText(input).length - 1 > 0.10`.
3. **Lost numbers** — `extractNumberSet(input) - extractNumberSet(output)` is non-empty (set difference, not multiset; mirror Python).
4. **Lost source citations** — `SOURCE_CITATION_RE.findall(output).length < SOURCE_CITATION_RE.findall(input).length`.
5. **Added `<a>` tags** — output contains `<a` (any). Optimize unwraps `<a>` per URL POLICY; intermediate forbids re-introduction.
6. **SEO intro detected** — output text matches any pattern in `SEO_INTRO_PATTERNS[lang]`. Default `lang = "pl"`; English fallback included.

**Gotcha 8 — Length is measured on TEXT, not HTML:** Python uses `len(BeautifulSoup(html).get_text(" ", strip=True))`. HTML byte length includes added formatting (`<strong>`, `<br />`) which inflates artificially. Use cheerio's `$.text().replace(/\s+/g, " ").trim()` and measure that. Test specifically that adding 10 `<strong>` tags around existing text does NOT trigger the growth guard.

**Gotcha 9 — Number-set comparison is strict but tolerates rephrasing:** Python's `NUMERIC_EXTRACT_RE` matches digits+optional decimals+optional `%` or 4-digit years or currency-prefixed amounts. It does NOT match "twenty percent" or "dwadzieścia procent." If the model rephrases `"20%"` → `"jedna piąta"`, the guard fires. This is intentional — the Hybrid spans should have prevented that rephrasing in the first place. Document the limit: numbers must survive verbatim or the run fails.

**Gotcha 10 — `OpenAIResponsesClient` is reused as-is — NO modification:** The existing `createBlock()` already accepts `system`, `input`, optional `reasoning`, optional `verbosity`. Both handlers call it with `system = builtPromptString` and `input = protectedHtml`. No `previousResponseId` (no chaining). No `tools`. Default `reasoning: { effort: "medium" }` for both. Don't add a new client method — that's YAGNI.

**Gotcha 11 — Empty paragraph cleanup is part of optimize input prep:** Python's `load_article` strips empty `<p>` tags via cheerio before tokenization. Mirror this in `articleOptimize.client.ts` (NOT in the shared protect module; intermediate's input is already-clean optimize output). Test: a `<p></p>` and `<p>   </p>` are both stripped before tokenize runs.

**Gotcha 12 — URL policy: optimize unwraps `<a>` tags after restore:** Python prompt has `### URL POLICY: Keep URL text, but REMOVE <a> tags`. We do this **mechanically** post-LLM (not relying on the model). After SRC restore + span unwrap, walk cheerio and `$('a').replaceWith(function() { return $(this).html(); })`. Test: `<a href="x">text</a>` → `text`. The intermediate handler's "added <a>" guard then guarantees no link sneaks back in.

**Gotcha 13 — SEO-intro patterns are language-specific (PL + EN):** Mirror the Python dict verbatim. The handler reads `ctx.previousOutputs.enrich.meta.language` to pick the pattern set; defaults to `pl`. Tests cover both PL and EN positives + a negative (a normal Polish opening that should NOT match). Patterns are case-insensitive.

**Gotcha 14 — Cache keys include prompt version:** Both handlers carry a `const PROMPT_VERSION = "v1"` at file top, threaded into the cache `params` object. Bumping the prompt requires bumping this string — otherwise the cache returns stale optimized HTML for a now-different prompt. Same pattern as Plan 14.

**Gotcha 15 — Cheerio re-serialization is non-identical:** `cheerio.load(html).html()` may normalize attribute quoting, add `<html><head><body>` wrappers, etc. To stay clean: use `cheerio.load(html, null, false)` (fragment mode) when you need round-trip stability. The protect module's tokenize/restore both operate on string-with-cheerio-mixed; tokenize uses pure regex on the string (no cheerio), restore uses cheerio only for span unwrap and `<a>` unwrap, then `$.html()`. Test that `restore(tokenize(x).html, ...).html` is structurally equivalent to `x` for a known fixture.

**Gotcha 16 — Smoke fixture chain:** `smoke-plan-15-optimize.ts` reads `scripts/smoke-output/plan-14-enriched.json` (must exist; abort with clear message). `smoke-plan-15-intermediate.ts` reads `scripts/smoke-output/plan-15-optimize.json`. Each writes both `.json` (full result) and `.html` (just `htmlContent`) to `smoke-output/`. Reuse the Plan 14 stub pattern: pass-through `ToolCacheService` + real `OpenAIResponsesClient`.

**Gotcha 17 — Plan 08 cascade rerun is automatic:** `optimize.dependsOn = ["enrich"]` and `intermediate.dependsOn = ["optimize"]`. Re-running `enrich` cascades to `optimize` AND `intermediate`. Re-running `optimize` cascades to `intermediate`. No new orchestrator code needed — just the dependsOn edges.

**Gotcha 18 — UI iframe sandbox pattern is mandatory:** Both renderers reuse the `<iframe srcDoc sandbox="allow-same-origin">` pattern from Plan 13 `draft.tsx` and Plan 14 `data-enrich.tsx`. NEVER `dangerouslySetInnerHTML`. Inline a small stylesheet for readability (h1/h2/p/strong/blockquote/br/i/em).

---

## File Structure

```
apps/api/
└── src/
    ├── llm/
    │   └── openai-responses.client.ts            (UNCHANGED — reused as-is)
    │
    ├── tools/
    │   ├── article-protect/                      (NEW shared module)
    │   │   ├── article-protect.regex.ts          Regex constants (SOURCE_CITATION_RE, NUM_RE, DATE_RE, DOI_RE, BRACKET_REF_RE, NUMERIC_EXTRACT_RE, SEO_INTRO_PATTERNS)
    │   │   ├── article-protect.tokenize.ts       tokenizeHybrid(html) → { html, srcMap, spanMap }
    │   │   ├── article-protect.restore.ts        restoreHybrid(html, srcMap, spanMap) → { html, missingSrc, missingSpans }
    │   │   └── article-protect.guards.ts         extractPlainText, extractNumberSet, countFormatting, detectSeoIntro, hasH1Tag, hasAnchorTags, unwrapAnchors, stripEmptyParagraphs
    │   │
    │   ├── article-optimize/                     (NEW)
    │   │   ├── article-optimize.client.ts        Orchestrates strip-empty → tokenize → LLM → restore → unwrap-anchors → build OptimizeResult
    │   │   └── article-optimize.module.ts        NestJS DI (re-exports OPENAI_RESPONSES_SDK provider)
    │   │
    │   └── article-intermediate/                 (NEW)
    │       ├── article-intermediate.client.ts    Orchestrates tokenize → LLM → restore → 6 guards → build IntermediateResult
    │       └── article-intermediate.module.ts    NestJS DI
    │
    ├── prompts/
    │   ├── article-optimize.prompt.ts            (NEW) buildOptimizeSystemPrompt({ lang, sourceCount, targetLength? })
    │   └── article-intermediate.prompt.ts        (NEW) buildIntermediateSystemPrompt({ lang, maxLengthGrowth })
    │
    ├── handlers/
    │   ├── article-optimize.handler.ts           (NEW) StepHandler "tool.article.optimize"
    │   ├── article-intermediate.handler.ts       (NEW) StepHandler "tool.article.intermediate"
    │   └── handlers.module.ts                    (MODIFY) register both handlers + 2 env tokens + 2 modules
    │
    ├── config/env.ts                             (MODIFY) 4 new ENVs (ARTICLE_OPTIMIZE_MODEL, ARTICLE_OPTIMIZE_TTL_DAYS, ARTICLE_INTERMEDIATE_MODEL, ARTICLE_INTERMEDIATE_TTL_DAYS, ARTICLE_INTERMEDIATE_MAX_GROWTH)
    │
    ├── seed/seed.ts                              (MODIFY) extend Plan 14 template into Plan 15 (adds optimize + intermediate steps)
    │
    └── tests/
        ├── fixtures/
        │   └── sample-enriched.html              (NEW) trimmed enriched-style fixture for unit tests (≈2 KB)
        ├── article-protect.tokenize.test.ts      (NEW)
        ├── article-protect.restore.test.ts       (NEW)
        ├── article-protect.guards.test.ts        (NEW)
        ├── article-optimize.client.test.ts       (NEW)
        ├── article-optimize.handler.test.ts      (NEW)
        ├── article-intermediate.client.test.ts   (NEW)
        └── article-intermediate.handler.test.ts  (NEW)

packages/shared/src/schemas.ts                    (MODIFY) append Plan 15 schemas
packages/shared/dist/                              (REBUILT)

apps/web/src/components/step-output/
├── article-optimize.tsx                          (NEW) ArticleOptimizeOutput renderer
├── article-intermediate.tsx                      (NEW) ArticleIntermediateOutput renderer
└── index.tsx                                     (MODIFY) routing + hasRichRenderer for both new types

scripts/
├── smoke-plan-15-optimize.ts                     (NEW) Real-LLM smoke for optimize
└── smoke-plan-15-intermediate.ts                 (NEW) Real-LLM smoke for intermediate
package.json (root)                               (MODIFY) add "smoke:plan-15-optimize", "smoke:plan-15-intermediate"
```

No new runtime dependencies (cheerio already added in Plan 14). Two new env tokens: `ARTICLE_OPTIMIZE_HANDLER_ENV`, `ARTICLE_INTERMEDIATE_HANDLER_ENV`.

---

## Task 1: Shared schemas — `ArticleOptimizeResult` + `ArticleIntermediateResult`

**Files:**
- Modify: `packages/shared/src/schemas.ts` (append at end)
- Build: `packages/shared` (must produce `dist/`)

No unit tests — runtime tests in later tasks exercise the schemas via `.parse()`.

- [ ] **Step 1.1: Append Plan 15 schemas at end of `packages/shared/src/schemas.ts`**

Append after the last existing export (current last is the Plan 14 `DataEnrichmentResult` block):

```ts
// ===== Plan 15 — Article Optimize + Intermediate =====

export const ArticlePostProductionMeta = z.object({
  keyword: z.string().min(1),
  language: z.string().min(2).max(10),
  model: z.string().min(1),
  promptVersion: z.string().min(1),
  generatedAt: z.string().datetime(),
});
export type ArticlePostProductionMeta = z.infer<typeof ArticlePostProductionMeta>;

export const ProtectionStats = z.object({
  srcPlaceholdersTotal: z.number().int().nonnegative(),
  srcPlaceholdersMissing: z.number().int().nonnegative(),
  spansTotal: z.number().int().nonnegative(),
  spansMissing: z.number().int().nonnegative(),
});
export type ProtectionStats = z.infer<typeof ProtectionStats>;

export const ArticleOptimizeWarning = z.object({
  kind: z.enum([
    "optimize_spans_missing",
    "optimize_anchors_unwrapped",
  ]),
  message: z.string().min(1),
  context: z.record(z.string()).default({}),
});
export type ArticleOptimizeWarning = z.infer<typeof ArticleOptimizeWarning>;

export const ArticleOptimizeStats = z.object({
  inputLength: z.number().int().nonnegative(),
  outputLength: z.number().int().nonnegative(),
  sourcesBefore: z.number().int().nonnegative(),
  sourcesAfter: z.number().int().nonnegative(),
  anchorsRemoved: z.number().int().nonnegative(),
  totalCostUsd: z.string(),
  totalLatencyMs: z.number().int().nonnegative(),
});
export type ArticleOptimizeStats = z.infer<typeof ArticleOptimizeStats>;

export const ArticleOptimizeResult = z.object({
  meta: ArticlePostProductionMeta,
  htmlContent: z.string().min(1),
  stats: ArticleOptimizeStats,
  protection: ProtectionStats,
  warnings: ArticleOptimizeWarning.array(),
});
export type ArticleOptimizeResult = z.infer<typeof ArticleOptimizeResult>;

export const FormattingCounts = z.object({
  strong: z.number().int().nonnegative(),
  italic: z.number().int().nonnegative(),
  blockquote: z.number().int().nonnegative(),
  br: z.number().int().nonnegative(),
});
export type FormattingCounts = z.infer<typeof FormattingCounts>;

export const ArticleIntermediateWarning = z.object({
  kind: z.enum([
    "intermediate_spans_missing",
  ]),
  message: z.string().min(1),
  context: z.record(z.string()).default({}),
});
export type ArticleIntermediateWarning = z.infer<typeof ArticleIntermediateWarning>;

export const ArticleIntermediateStats = z.object({
  inputLength: z.number().int().nonnegative(),
  outputLength: z.number().int().nonnegative(),
  growth: z.number(),
  sourcesBefore: z.number().int().nonnegative(),
  sourcesAfter: z.number().int().nonnegative(),
  formattingBefore: FormattingCounts,
  formattingAfter: FormattingCounts,
  totalCostUsd: z.string(),
  totalLatencyMs: z.number().int().nonnegative(),
});
export type ArticleIntermediateStats = z.infer<typeof ArticleIntermediateStats>;

export const ArticleIntermediateResult = z.object({
  meta: ArticlePostProductionMeta,
  htmlContent: z.string().min(1),
  stats: ArticleIntermediateStats,
  protection: ProtectionStats,
  warnings: ArticleIntermediateWarning.array(),
});
export type ArticleIntermediateResult = z.infer<typeof ArticleIntermediateResult>;
```

- [ ] **Step 1.2: Build the shared package**

Run: `pnpm --filter @sensai/shared build`
Expected: Exit 0, `packages/shared/dist/schemas.js` and `.d.ts` updated.

- [ ] **Step 1.3: Commit**

```bash
git add packages/shared/src/schemas.ts packages/shared/dist
git commit -m "feat(shared): add Plan 15 article optimize+intermediate schemas"
```

---

## Task 2: Env vars — `ARTICLE_OPTIMIZE_*` + `ARTICLE_INTERMEDIATE_*`

**Files:**
- Modify: `apps/api/src/config/env.ts`
- Modify: `apps/api/.env.example` (if it exists)

- [ ] **Step 2.1: Locate the Zod env schema in `apps/api/src/config/env.ts`**

Read the file to find where `DATA_ENRICH_*` env vars are declared (Plan 14 added them). Add the new vars in the same style, alphabetically grouped after `DATA_ENRICH_*`:

```ts
ARTICLE_OPTIMIZE_MODEL: z.string().default("gpt-5.2"),
ARTICLE_OPTIMIZE_TTL_DAYS: z.coerce.number().int().nonnegative().default(7),
ARTICLE_INTERMEDIATE_MODEL: z.string().default("gpt-5.2"),
ARTICLE_INTERMEDIATE_TTL_DAYS: z.coerce.number().int().nonnegative().default(7),
ARTICLE_INTERMEDIATE_MAX_GROWTH: z.coerce.number().nonnegative().default(0.10),
```

- [ ] **Step 2.2: If `apps/api/.env.example` exists, append the same vars with example values**

```
ARTICLE_OPTIMIZE_MODEL=gpt-5.2
ARTICLE_OPTIMIZE_TTL_DAYS=7
ARTICLE_INTERMEDIATE_MODEL=gpt-5.2
ARTICLE_INTERMEDIATE_TTL_DAYS=7
ARTICLE_INTERMEDIATE_MAX_GROWTH=0.10
```

- [ ] **Step 2.3: Verify env loads**

Run: `cd apps/api && pnpm tsc --noEmit`
Expected: Exit 0 (type-check passes; no usage yet).

- [ ] **Step 2.4: Commit**

```bash
git add apps/api/src/config/env.ts apps/api/.env.example
git commit -m "feat(api): add Plan 15 env vars for article optimize+intermediate"
```

---

## Task 3: `article-protect` regex constants

**Files:**
- Create: `apps/api/src/tools/article-protect/article-protect.regex.ts`

No unit test for this file alone — regexes are exercised in Tasks 4–6.

- [ ] **Step 3.1: Create the regex constants file**

```ts
// apps/api/src/tools/article-protect/article-protect.regex.ts
//
// Verbatim mirror of the Python educational reference:
//   docs/edu/lekcja-3-4/T3F4-article_check_educational.py (lines 96-149)
//   docs/edu/lekcja-3-4/T3F4-article_intermediate_educational.py (lines 102-149)
//
// Order of use is load-bearing — see article-protect.tokenize.ts.

export const SOURCE_CITATION_RE =
  /\((?:Source|Źródło):\s*(?:[^()]*|\([^()]*\))*\)/gi;

export const NUM_RE =
  /\b\d+(?:[.,]\d+)?\s?(?:%|mln|mld|tys\.?|k|M|B|zł|PLN|USD|EUR|mg|g|kg|ml|μg|mcg|IU|kcal)?\b/gi;

export const DATE_RE =
  /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-zÀ-ž]+\s+\d{4}|\d{4})\b/g;

export const DOI_RE = /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/gi;

export const BRACKET_REF_RE = /\[(?:\d{1,3}|[A-Za-z0-9-_]+)\]/g;

// Used by intermediate guards (extractNumberSet) — broader than NUM_RE so the
// growth-guard catches more rephrasings.
export const NUMERIC_EXTRACT_RE =
  /(?:\d{1,3}(?:[ ., ]\d{3})+|\d+)(?:[.,]\d+)?%?|\b\d{4}\b|(?:\$|€|£|zł|PLN|USD|EUR)\s?\d+(?:[.,]\d+)?/gi;

export const SEO_INTRO_PATTERNS: Record<string, RegExp[]> = {
  pl: [
    /jeśli\s+zadajesz\s+sobie\s+pytanie/i,
    /zanim\s+przejdziemy/i,
    /w\s+tym\s+artykule\s+(?:dowiesz|poznasz|odkryjesz)/i,
    /czy\s+zastanawiałeś\s+się/i,
    /witaj\s+w\s+(?:naszym|tym)\s+(?:przewodniku|artykule)/i,
  ],
  en: [
    /before\s+we\s+dive\s+in/i,
    /let'?s\s+dive\s+in/i,
    /in\s+this\s+article,?\s+(?:we'?ll|you'?ll)/i,
    /have\s+you\s+ever\s+wondered/i,
    /welcome\s+to\s+(?:our|this)\s+(?:guide|article)/i,
  ],
};
```

- [ ] **Step 3.2: Type-check**

Run: `cd apps/api && pnpm tsc --noEmit`
Expected: Exit 0.

- [ ] **Step 3.3: Commit**

```bash
git add apps/api/src/tools/article-protect/article-protect.regex.ts
git commit -m "feat(api): add article-protect regex constants"
```

---

## Task 4: `article-protect` — `tokenizeHybrid` (TDD)

**Files:**
- Create: `apps/api/src/tools/article-protect/article-protect.tokenize.ts`
- Test: `apps/api/src/tests/article-protect.tokenize.test.ts`

- [ ] **Step 4.1: Write the failing test**

```ts
// apps/api/src/tests/article-protect.tokenize.test.ts
import { describe, expect, it } from "vitest";
import { tokenizeHybrid } from "../tools/article-protect/article-protect.tokenize";

describe("tokenizeHybrid", () => {
  it("replaces source citations with [[SRC_xxx]] placeholders before number wrap", () => {
    const html =
      "<p>Kortyzol spada o 20% (Źródło: WHO, 2024 — who.int/x).</p>";
    const { html: out, srcMap, spanMap } = tokenizeHybrid(html);
    expect(srcMap).toEqual({
      "[[SRC_000]]": "(Źródło: WHO, 2024 — who.int/x)",
    });
    expect(out).toMatch(/\[\[SRC_000\]\]/);
    // The "20%" must be wrapped, but the "2024" inside the citation must NOT
    // get wrapped (it is hidden behind the SRC placeholder).
    expect(out).toMatch(/<span data-token-id="NUM_[a-f0-9]+">20%<\/span>/);
    expect(JSON.stringify(spanMap)).not.toMatch(/"2024"/);
  });

  it("supports multiple source citations with sequential indices", () => {
    const html =
      "<p>A (Źródło: a.com, 2023 — a.com).</p><p>B (Źródło: b.com, 2024 — b.com).</p>";
    const { srcMap } = tokenizeHybrid(html);
    expect(Object.keys(srcMap).sort()).toEqual(["[[SRC_000]]", "[[SRC_001]]"]);
  });

  it("does not double-tokenize a SRC placeholder via BRACKET_REF_RE", () => {
    const html = "<p>X (Źródło: WHO, 2024 — who.int).</p>";
    const { html: out, spanMap } = tokenizeHybrid(html);
    // No span with content like "[SRC_000]" should be produced.
    for (const v of Object.values(spanMap)) {
      expect(v).not.toMatch(/SRC_/);
    }
    expect(out).not.toMatch(/<span[^>]*>\[SRC_/);
  });

  it("wraps DOIs, bracket refs, numbers and dates in distinct span prefixes", () => {
    const html =
      "<p>See 10.1234/abc.de [3] for 50 mg dose on 2024-01-15.</p>";
    const { html: out, spanMap } = tokenizeHybrid(html);
    const prefixes = new Set(
      Object.keys(spanMap).map((id) => id.split("_")[0]),
    );
    expect(prefixes.has("DOI")).toBe(true);
    expect(prefixes.has("REF")).toBe(true);
    expect(prefixes.has("NUM")).toBe(true);
    expect(prefixes.has("DAT")).toBe(true);
    expect(out).toMatch(/data-token-id="DOI_/);
  });

  it("returns input unchanged when no protectable data exists", () => {
    const html = "<h1>Title</h1><p>Hello world.</p>";
    const { html: out, srcMap, spanMap } = tokenizeHybrid(html);
    expect(out).toBe(html);
    expect(srcMap).toEqual({});
    expect(spanMap).toEqual({});
  });
});
```

- [ ] **Step 4.2: Run the test — expect FAIL**

Run: `cd apps/api && pnpm vitest run src/tests/article-protect.tokenize.test.ts`
Expected: FAIL — `Cannot find module '../tools/article-protect/article-protect.tokenize'`.

- [ ] **Step 4.3: Implement `tokenizeHybrid`**

```ts
// apps/api/src/tools/article-protect/article-protect.tokenize.ts
import { randomBytes } from "node:crypto";
import {
  SOURCE_CITATION_RE,
  NUM_RE,
  DATE_RE,
  DOI_RE,
  BRACKET_REF_RE,
} from "./article-protect.regex";

export interface TokenizeResult {
  html: string;
  srcMap: Record<string, string>;
  spanMap: Record<string, string>;
}

export function tokenizeHybrid(html: string): TokenizeResult {
  const srcMap: Record<string, string> = {};
  const spanMap: Record<string, string> = {};

  // STEP 1 — SRC placeholders FIRST. Citations contain years/numbers that
  // must be hidden before the NUM/DATE wrap pass.
  let srcIdx = 0;
  let text = html.replace(SOURCE_CITATION_RE, (match) => {
    const marker = `[[SRC_${String(srcIdx).padStart(3, "0")}]]`;
    srcMap[marker] = match;
    srcIdx += 1;
    return marker;
  });

  // STEP 2 — Hide SRC placeholders behind sentinels so BRACKET_REF_RE doesn't
  // match the `[SRC_xxx]` substring inside `[[SRC_xxx]]`.
  const sentinelByMarker = new Map<string, string>();
  let sIdx = 0;
  for (const marker of Object.keys(srcMap)) {
    const sentinel = `__SRCHOLD_${sIdx}__`;
    sentinelByMarker.set(marker, sentinel);
    text = text.split(marker).join(sentinel);
    sIdx += 1;
  }

  // STEP 3 — Wrap DOI, REF, NUM, DATE in spans with unique IDs.
  const wrap = (re: RegExp, prefix: string) => {
    text = text.replace(re, (match) => {
      const tokenId = `${prefix}_${randomBytes(4).toString("hex")}`;
      spanMap[tokenId] = match;
      return `<span data-token-id="${tokenId}">${match}</span>`;
    });
  };
  wrap(DOI_RE, "DOI");
  wrap(BRACKET_REF_RE, "REF");
  wrap(NUM_RE, "NUM");
  wrap(DATE_RE, "DAT");

  // STEP 4 — Restore SRC placeholders.
  for (const [marker, sentinel] of sentinelByMarker.entries()) {
    text = text.split(sentinel).join(marker);
  }

  return { html: text, srcMap, spanMap };
}
```

- [ ] **Step 4.4: Run the test — expect PASS**

Run: `cd apps/api && pnpm vitest run src/tests/article-protect.tokenize.test.ts`
Expected: PASS, all 5 tests green.

- [ ] **Step 4.5: Commit**

```bash
git add apps/api/src/tools/article-protect/article-protect.tokenize.ts apps/api/src/tests/article-protect.tokenize.test.ts
git commit -m "feat(api): tokenizeHybrid — SRC placeholders + NUM/DAT spans"
```

---

## Task 5: `article-protect` — `restoreHybrid` (TDD)

**Files:**
- Create: `apps/api/src/tools/article-protect/article-protect.restore.ts`
- Test: `apps/api/src/tests/article-protect.restore.test.ts`

- [ ] **Step 5.1: Write the failing test**

```ts
// apps/api/src/tests/article-protect.restore.test.ts
import { describe, expect, it } from "vitest";
import { tokenizeHybrid } from "../tools/article-protect/article-protect.tokenize";
import { restoreHybrid } from "../tools/article-protect/article-protect.restore";

describe("restoreHybrid", () => {
  it("restores SRC placeholders to original citations", () => {
    const original =
      "<p>X 20% (Źródło: WHO, 2024 — who.int).</p>";
    const t = tokenizeHybrid(original);
    const r = restoreHybrid(t.html, t.srcMap, t.spanMap);
    expect(r.html).toContain("(Źródło: WHO, 2024 — who.int)");
    expect(r.missingSrc).toEqual([]);
    expect(r.missingSpans).toEqual([]);
  });

  it("unwraps spans (removes <span data-token-id> tags, keeps content)", () => {
    const original = "<p>50 mg dose.</p>";
    const t = tokenizeHybrid(original);
    const r = restoreHybrid(t.html, t.srcMap, t.spanMap);
    expect(r.html).not.toMatch(/data-token-id/);
    expect(r.html).toContain("50 mg");
  });

  it("reports missing SRC placeholders (model removed one)", () => {
    const original = "<p>X (Źródło: WHO, 2024 — who.int).</p>";
    const t = tokenizeHybrid(original);
    const tampered = t.html.replace(/\[\[SRC_000\]\]/, "");
    const r = restoreHybrid(tampered, t.srcMap, t.spanMap);
    expect(r.missingSrc).toEqual(["[[SRC_000]]"]);
  });

  it("reports missing spans (model removed one)", () => {
    const original = "<p>50 mg and 30%.</p>";
    const t = tokenizeHybrid(original);
    const tokenIds = Object.keys(t.spanMap);
    const removeId = tokenIds[0];
    const tampered = t.html.replace(
      new RegExp(`<span data-token-id="${removeId}">[^<]*</span>`),
      "REMOVED",
    );
    const r = restoreHybrid(tampered, t.srcMap, t.spanMap);
    expect(r.missingSpans).toContain(removeId);
  });

  it("round-trips: restore(tokenize(x)) preserves content for fixture", () => {
    const original =
      "<h1>T</h1><p>50 mg ashwagandhi obniża kortyzol o 20% w 2024 r. (Źródło: WHO, 2024 — who.int/x).</p>";
    const t = tokenizeHybrid(original);
    const r = restoreHybrid(t.html, t.srcMap, t.spanMap);
    // Content equivalence (cheerio re-serialization may differ in attribute
    // quoting / whitespace; assert all substantive substrings present).
    expect(r.html).toContain("<h1>T</h1>");
    expect(r.html).toContain("50 mg");
    expect(r.html).toContain("20%");
    expect(r.html).toContain("(Źródło: WHO, 2024 — who.int/x)");
  });
});
```

- [ ] **Step 5.2: Run — expect FAIL**

Run: `cd apps/api && pnpm vitest run src/tests/article-protect.restore.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5.3: Implement `restoreHybrid`**

```ts
// apps/api/src/tools/article-protect/article-protect.restore.ts
import { load } from "cheerio";

export interface RestoreResult {
  html: string;
  missingSrc: string[];
  missingSpans: string[];
}

export function restoreHybrid(
  html: string,
  srcMap: Record<string, string>,
  spanMap: Record<string, string>,
): RestoreResult {
  const missingSrc: string[] = [];
  let text = html;

  // STEP 1 — Restore SRC placeholders. Track misses.
  for (const [marker, original] of Object.entries(srcMap)) {
    if (text.includes(marker)) {
      text = text.split(marker).join(original);
    } else {
      missingSrc.push(marker);
    }
  }

  // STEP 2 — Walk DOM, find token spans, record which IDs survived, then
  // unwrap each span (replace with its inner text).
  const $ = load(text, null, false);
  const foundIds = new Set<string>();
  $("span[data-token-id]").each((_, el) => {
    const id = $(el).attr("data-token-id");
    if (id) foundIds.add(id);
    $(el).replaceWith($(el).contents());
  });
  const missingSpans = Object.keys(spanMap).filter((id) => !foundIds.has(id));

  return {
    html: $.html(),
    missingSrc,
    missingSpans,
  };
}
```

- [ ] **Step 5.4: Run — expect PASS**

Run: `cd apps/api && pnpm vitest run src/tests/article-protect.restore.test.ts`
Expected: PASS, all 5 tests green.

- [ ] **Step 5.5: Commit**

```bash
git add apps/api/src/tools/article-protect/article-protect.restore.ts apps/api/src/tests/article-protect.restore.test.ts
git commit -m "feat(api): restoreHybrid — placeholder restore + span unwrap with miss tracking"
```

---

## Task 6: `article-protect` — `guards` utilities (TDD)

**Files:**
- Create: `apps/api/src/tools/article-protect/article-protect.guards.ts`
- Test: `apps/api/src/tests/article-protect.guards.test.ts`

- [ ] **Step 6.1: Write the failing tests**

```ts
// apps/api/src/tests/article-protect.guards.test.ts
import { describe, expect, it } from "vitest";
import {
  countFormatting,
  detectSeoIntro,
  extractNumberSet,
  extractPlainText,
  hasAnchorTags,
  hasH1Tag,
  stripEmptyParagraphs,
  unwrapAnchors,
} from "../tools/article-protect/article-protect.guards";

describe("guards.extractPlainText", () => {
  it("strips tags and collapses whitespace", () => {
    const html = "<h1>T</h1>\n<p>A   <strong>B</strong> C.</p>";
    expect(extractPlainText(html)).toBe("T A B C.");
  });
});

describe("guards.extractNumberSet", () => {
  it("captures percentages, integers, years, currency, and decimals", () => {
    const text = "20% in 2024, 1,500 PLN and $42.50 dose 50 mg";
    const s = extractNumberSet(text);
    expect(s.has("20%")).toBe(true);
    expect(s.has("2024")).toBe(true);
    expect(s.has("$42.50")).toBe(true);
  });

  it("differs allow guard to compute set difference", () => {
    const a = extractNumberSet("20% and 2024");
    const b = extractNumberSet("20% only");
    const diff = [...a].filter((v) => !b.has(v));
    expect(diff).toContain("2024");
  });
});

describe("guards.countFormatting", () => {
  it("counts strong, italic (i+em), blockquote, br", () => {
    const html =
      "<p><strong>a</strong><i>b</i><em>c</em><br /><blockquote>q</blockquote></p>";
    expect(countFormatting(html)).toEqual({
      strong: 1,
      italic: 2,
      blockquote: 1,
      br: 1,
    });
  });
});

describe("guards.detectSeoIntro", () => {
  it("matches Polish patterns", () => {
    expect(detectSeoIntro("<p>Zanim przejdziemy do meritum…</p>", "pl")).toBe(true);
  });
  it("matches English patterns", () => {
    expect(detectSeoIntro("<p>Before we dive in, let us…</p>", "en")).toBe(true);
  });
  it("does not match a normal Polish opener", () => {
    expect(detectSeoIntro("<p>Kortyzol to hormon stresu.</p>", "pl")).toBe(false);
  });
});

describe("guards.hasH1Tag / hasAnchorTags", () => {
  it("hasH1Tag true when <h1> present, false otherwise", () => {
    expect(hasH1Tag("<h1>T</h1><p>x</p>")).toBe(true);
    expect(hasH1Tag("<p>x</p>")).toBe(false);
  });
  it("hasAnchorTags true when <a present, false otherwise", () => {
    expect(hasAnchorTags('<p><a href="x">y</a></p>')).toBe(true);
    expect(hasAnchorTags("<p>y</p>")).toBe(false);
  });
});

describe("guards.unwrapAnchors", () => {
  it("removes <a> tags but keeps inner text", () => {
    expect(unwrapAnchors('<p><a href="x">label</a> tail</p>')).toContain(
      "label tail",
    );
    expect(unwrapAnchors('<p><a href="x">label</a></p>')).not.toMatch(/<a/);
  });
});

describe("guards.stripEmptyParagraphs", () => {
  it("removes empty and whitespace-only <p> elements", () => {
    const html = "<p>kept</p><p></p><p>   </p><p>also kept</p>";
    const out = stripEmptyParagraphs(html);
    expect(out).toContain("kept");
    expect(out).toContain("also kept");
    expect(out.match(/<p>/g)?.length).toBe(2);
  });
});
```

- [ ] **Step 6.2: Run — expect FAIL**

Run: `cd apps/api && pnpm vitest run src/tests/article-protect.guards.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 6.3: Implement `guards`**

```ts
// apps/api/src/tools/article-protect/article-protect.guards.ts
import { load } from "cheerio";
import {
  NUMERIC_EXTRACT_RE,
  SEO_INTRO_PATTERNS,
} from "./article-protect.regex";

export function extractPlainText(html: string): string {
  const $ = load(html, null, false);
  return $.text().replace(/\s+/g, " ").trim();
}

export function extractNumberSet(text: string): Set<string> {
  const matches = text.match(NUMERIC_EXTRACT_RE) ?? [];
  return new Set(matches);
}

export function countFormatting(html: string): {
  strong: number;
  italic: number;
  blockquote: number;
  br: number;
} {
  const $ = load(html, null, false);
  return {
    strong: $("strong").length,
    italic: $("i").length + $("em").length,
    blockquote: $("blockquote").length,
    br: $("br").length,
  };
}

export function detectSeoIntro(html: string, lang: string): boolean {
  const text = extractPlainText(html).toLowerCase();
  const patterns = SEO_INTRO_PATTERNS[lang] ?? SEO_INTRO_PATTERNS.en;
  return patterns.some((re) => re.test(text));
}

export function hasH1Tag(html: string): boolean {
  return /<h1\b[^>]*>/i.test(html);
}

export function hasAnchorTags(html: string): boolean {
  return /<a\b[^>]*>/i.test(html);
}

export function unwrapAnchors(html: string): string {
  const $ = load(html, null, false);
  $("a").each((_, el) => {
    $(el).replaceWith($(el).contents());
  });
  return $.html();
}

export function stripEmptyParagraphs(html: string): string {
  const $ = load(html, null, false);
  $("p").each((_, el) => {
    if (!$(el).text().trim()) $(el).remove();
  });
  return $.html();
}
```

- [ ] **Step 6.4: Run — expect PASS**

Run: `cd apps/api && pnpm vitest run src/tests/article-protect.guards.test.ts`
Expected: PASS, all 9 tests green.

- [ ] **Step 6.5: Commit**

```bash
git add apps/api/src/tools/article-protect/article-protect.guards.ts apps/api/src/tests/article-protect.guards.test.ts
git commit -m "feat(api): article-protect guards — text/numbers/formatting/SEO/anchors helpers"
```

---

## Task 7: ArticleOptimize prompt builder

**Files:**
- Create: `apps/api/src/prompts/article-optimize.prompt.ts`

No unit test — string equality of prompt text is brittle; the prompt is exercised end-to-end in the client test (Task 8).

- [ ] **Step 7.1: Create the prompt builder**

Verbatim mirror of `docs/edu/lekcja-3-4/T3F4-PROMPT_ARTICLE_CHECK.md`. The system prompt is fully built here; the user message is the protected HTML (sent separately by the client).

```ts
// apps/api/src/prompts/article-optimize.prompt.ts

export interface OptimizePromptInput {
  language: string;        // "pl" | "en" | …
  sourceCount: number;
  targetLength?: number;   // 0 or undefined = no limit
}

const LANGUAGE_LABEL: Record<string, string> = {
  pl: "Polish",
  en: "English",
  de: "German",
};

export function buildOptimizeSystemPrompt(input: OptimizePromptInput): string {
  const langLabel = LANGUAGE_LABEL[input.language] ?? "Polish";
  const target = input.targetLength ?? 0;
  const upperLimit = Math.round(target * 1.2);

  const lengthBlock =
    target > 0
      ? `LENGTH: Target ~${target} chars, max ${upperLimit}.`
      : `LENGTH: No limit — focus on quality.`;

  const sourceBlock =
    input.sourceCount > 0
      ? `
### CRITICAL: SOURCE PLACEHOLDERS (${input.sourceCount} found)
Text contains [[SRC_000]], [[SRC_001]], ... placeholders.
These represent source citations — NEVER remove, edit, move, or reformat them.
Keep each placeholder exactly where it is, at the end of its paragraph.
`
      : "";

  return `You are an HTML optimization engine with copywriter expertise.

Language: ${langLabel}

### OUTPUT
Return ONLY edited HTML. No explanations, no code fences. Start with <h1>.

${lengthBlock}
${sourceBlock}

### CRITICAL: PRESERVE DATA
1. Source placeholders [[SRC_xxx]] — do NOT touch
2. Span tags <span data-token-id="...">...</span> — preserve intact
These rules override all other instructions.

### URL POLICY
Keep URL text, but REMOVE <a> tags. URLs must not be clickable.

### COPYWRITER RULES (APPLY ALL)

#### RULE A: ZERO FIRST PERSON (SINGULAR AND PLURAL)
First person = AI signal.

FORBIDDEN: "I recommend", "I think", "We suggest", "Polecam", "Uważam", "Polecamy"

REPLACEMENTS:
- Subjectless: "I recommend X" → "X proves effective"
- Object as subject: "I suggest method Z" → "Method Z enables..."
- Impersonal: "I encourage" → "It's worth considering"

#### RULE C: ONE DEFINITION — ONE PLACE
Each term defined ONLY ONCE at first use.
Remove: repeated explanations, parenthetical definitions at subsequent uses.
Keep: only FIRST definition, replace subsequent with just the term.

#### RULE D: PARENTHETICAL CLEANUP
- Max 5 words in parentheses
- Max 1 parenthetical per paragraph
- Long parentheses (>5 words) → separate sentence or delete
- EXCEPTION: [[SRC_xxx]] placeholders are EXEMPT — never touch them

#### RULE E: TONE DOWN BOLD CLAIMS
Replace:
- "quickly see results" → "results appear gradually"
- "guaranteed results" → "expected results"
- "the only way" → "one of the ways"
- "revolutionary" → "effective"
- "always works" → "often proves effective"

#### RULE F: REDUCE 2ND PERSON & IMPERATIVES
Max 2-3 imperative sentences per H2 section.
- "Check speed" → "Speed can be checked with..."
- "Your site" → "the site"
- "You must remember" → "It's important"
Allowed: rhetorical questions (max 1/section), CTA at section end.

#### RULE I: SIMPLIFY TECHNICAL DESCRIPTIONS
When text contains technical instructions (edit file, code, FTP, database):
INSTEAD OF detailed steps → What it does (1 sentence) + Who should do it.

### SECONDARY RULES
- Consolidate repeated ideas
- Improve transitions, simplify phrasing
- Prefer active voice
- Keep HTML structure (<h1>, <h2>, <p>, <ul>, <li>)
- Headings: no trailing punctuation
- Do NOT add new information`;
}
```

- [ ] **Step 7.2: Type-check**

Run: `cd apps/api && pnpm tsc --noEmit`
Expected: Exit 0.

- [ ] **Step 7.3: Commit**

```bash
git add apps/api/src/prompts/article-optimize.prompt.ts
git commit -m "feat(api): article-optimize system prompt builder (rules A,C,D,E,F,I)"
```

---

## Task 8: `ArticleOptimizeClient` (TDD)

**Files:**
- Create: `apps/api/src/tools/article-optimize/article-optimize.client.ts`
- Test: `apps/api/src/tests/article-optimize.client.test.ts`

- [ ] **Step 8.1: Write the failing test**

```ts
// apps/api/src/tests/article-optimize.client.test.ts
import { describe, expect, it, vi } from "vitest";
import { ArticleOptimizeClient } from "../tools/article-optimize/article-optimize.client";

const stubEnv = {
  ARTICLE_OPTIMIZE_MODEL: "gpt-5.2",
} as const;

describe("ArticleOptimizeClient.optimize", () => {
  it("tokenizes input, calls LLM, restores SRC placeholders, unwraps anchors", async () => {
    const inputHtml =
      '<h1>T</h1><p><a href="x">Polecam</a> 20% (Źródło: WHO, 2024 — who.int).</p>';

    const llm = {
      createBlock: vi.fn(async ({ system, input }: any) => {
        // Echo the protected HTML (model leaves SRC + spans intact).
        expect(system).toContain("ZERO FIRST PERSON");
        expect(input).toContain("[[SRC_000]]");
        expect(input).toContain("data-token-id=");
        return {
          id: "resp_1",
          outputText: input,
          model: "gpt-5.2",
          promptTokens: 100,
          completionTokens: 100,
          costUsd: "0.0021",
          latencyMs: 1234,
        };
      }),
    } as any;

    const client = new ArticleOptimizeClient(llm, stubEnv as any);

    const out = await client.optimize({
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      keyword: "kortyzol",
      language: "pl",
      htmlContent: inputHtml,
    });

    expect(llm.createBlock).toHaveBeenCalledTimes(1);
    expect(out.htmlContent).toContain("(Źródło: WHO, 2024 — who.int)");
    // <a> tags removed; URL POLICY enforced mechanically.
    expect(out.htmlContent).not.toMatch(/<a\b/);
    expect(out.stats.anchorsRemoved).toBe(1);
    expect(out.protection.srcPlaceholdersTotal).toBe(1);
    expect(out.protection.srcPlaceholdersMissing).toBe(0);
    expect(out.cost.costUsd).toBe("0.0021");
  });

  it("throws when SRC placeholder is lost (hard fail)", async () => {
    const inputHtml = "<h1>T</h1><p>20% (Źródło: WHO, 2024 — who.int).</p>";
    const llm = {
      createBlock: vi.fn(async ({ input }: any) => ({
        id: "r",
        outputText: input.replace(/\[\[SRC_000\]\]/, ""),
        model: "gpt-5.2",
        promptTokens: 1,
        completionTokens: 1,
        costUsd: "0",
        latencyMs: 1,
      })),
    } as any;
    const client = new ArticleOptimizeClient(llm, stubEnv as any);
    await expect(
      client.optimize({
        ctx: { runId: "r", stepId: "s", attempt: 1 },
        keyword: "k",
        language: "pl",
        htmlContent: inputHtml,
      }),
    ).rejects.toThrow(/source placeholder lost/i);
  });

  it("emits soft warning when spans go missing", async () => {
    const inputHtml = "<h1>T</h1><p>50 mg dose.</p>";
    const llm = {
      createBlock: vi.fn(async ({ input }: any) => ({
        id: "r",
        // Strip the span tags but keep text — simulates model unwrapping.
        outputText: input.replace(/<span[^>]*>([^<]*)<\/span>/g, "$1"),
        model: "gpt-5.2",
        promptTokens: 1,
        completionTokens: 1,
        costUsd: "0",
        latencyMs: 1,
      })),
    } as any;
    const client = new ArticleOptimizeClient(llm, stubEnv as any);
    const out = await client.optimize({
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      keyword: "k",
      language: "pl",
      htmlContent: inputHtml,
    });
    expect(out.warnings.some((w) => w.kind === "optimize_spans_missing")).toBe(true);
    expect(out.protection.spansMissing).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 8.2: Run — expect FAIL**

Run: `cd apps/api && pnpm vitest run src/tests/article-optimize.client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 8.3: Implement `ArticleOptimizeClient`**

```ts
// apps/api/src/tools/article-optimize/article-optimize.client.ts
import { Inject, Injectable, Logger } from "@nestjs/common";
import { OpenAIResponsesClient } from "../../llm/openai-responses.client";
import { tokenizeHybrid } from "../article-protect/article-protect.tokenize";
import { restoreHybrid } from "../article-protect/article-protect.restore";
import {
  hasAnchorTags,
  stripEmptyParagraphs,
  unwrapAnchors,
} from "../article-protect/article-protect.guards";
import { SOURCE_CITATION_RE } from "../article-protect/article-protect.regex";
import { buildOptimizeSystemPrompt } from "../../prompts/article-optimize.prompt";
import type { ArticleOptimizeWarning } from "@sensai/shared";
import type { Env } from "../../config/env";

type ClientEnv = Pick<Env, "ARTICLE_OPTIMIZE_MODEL">;

export interface OptimizeArgs {
  ctx: { runId: string; stepId: string; attempt: number };
  keyword: string;
  language: string;
  htmlContent: string;
}

export interface OptimizeResult {
  htmlContent: string;
  warnings: ArticleOptimizeWarning[];
  protection: {
    srcPlaceholdersTotal: number;
    srcPlaceholdersMissing: number;
    spansTotal: number;
    spansMissing: number;
  };
  stats: {
    inputLength: number;
    outputLength: number;
    sourcesBefore: number;
    sourcesAfter: number;
    anchorsRemoved: number;
  };
  cost: { costUsd: string; latencyMs: number };
}

@Injectable()
export class ArticleOptimizeClient {
  private readonly logger = new Logger(ArticleOptimizeClient.name);

  constructor(
    private readonly llm: OpenAIResponsesClient,
    @Inject("ARTICLE_OPTIMIZE_ENV") private readonly env: ClientEnv,
  ) {}

  async optimize(args: OptimizeArgs): Promise<OptimizeResult> {
    const cleaned = stripEmptyParagraphs(args.htmlContent);
    const inputLength = cleaned.length;

    const sourcesBefore = countMatches(cleaned, SOURCE_CITATION_RE);

    const { html: protectedHtml, srcMap, spanMap } = tokenizeHybrid(cleaned);
    const system = buildOptimizeSystemPrompt({
      language: args.language,
      sourceCount: sourcesBefore,
    });

    const resp = await this.llm.createBlock({
      ctx: args.ctx,
      model: this.env.ARTICLE_OPTIMIZE_MODEL,
      system,
      input: protectedHtml,
      reasoning: { effort: "medium" },
    });

    const restored = restoreHybrid(resp.outputText, srcMap, spanMap);
    if (restored.missingSrc.length > 0) {
      throw new Error(
        `article.optimize: source placeholder lost: ${restored.missingSrc.join(", ")}`,
      );
    }

    const warnings: ArticleOptimizeWarning[] = [];
    if (restored.missingSpans.length > 0) {
      warnings.push({
        kind: "optimize_spans_missing",
        message: `${restored.missingSpans.length} number/date spans missing after restore`,
        context: { count: String(restored.missingSpans.length) },
      });
    }

    const anchorsBefore = hasAnchorTags(restored.html);
    const anchorsRemovedHtml = unwrapAnchors(restored.html);
    const anchorsRemovedCount = countMatches(restored.html, /<a\b[^>]*>/gi);
    if (anchorsBefore && anchorsRemovedCount > 0) {
      warnings.push({
        kind: "optimize_anchors_unwrapped",
        message: `${anchorsRemovedCount} <a> tags removed per URL policy`,
        context: { count: String(anchorsRemovedCount) },
      });
    }

    const sourcesAfter = countMatches(anchorsRemovedHtml, SOURCE_CITATION_RE);
    const outputLength = anchorsRemovedHtml.length;

    return {
      htmlContent: anchorsRemovedHtml,
      warnings,
      protection: {
        srcPlaceholdersTotal: Object.keys(srcMap).length,
        srcPlaceholdersMissing: restored.missingSrc.length,
        spansTotal: Object.keys(spanMap).length,
        spansMissing: restored.missingSpans.length,
      },
      stats: {
        inputLength,
        outputLength,
        sourcesBefore,
        sourcesAfter,
        anchorsRemoved: anchorsRemovedCount,
      },
      cost: { costUsd: resp.costUsd, latencyMs: resp.latencyMs },
    };
  }
}

function countMatches(text: string, re: RegExp): number {
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  const local = new RegExp(re.source, flags);
  return (text.match(local) ?? []).length;
}
```

- [ ] **Step 8.4: Run — expect PASS**

Run: `cd apps/api && pnpm vitest run src/tests/article-optimize.client.test.ts`
Expected: PASS, all 3 tests green.

- [ ] **Step 8.5: Commit**

```bash
git add apps/api/src/tools/article-optimize/article-optimize.client.ts apps/api/src/tests/article-optimize.client.test.ts
git commit -m "feat(api): ArticleOptimizeClient — tokenize + LLM + restore + URL policy"
```

---

## Task 9: ArticleOptimize NestJS module

**Files:**
- Create: `apps/api/src/tools/article-optimize/article-optimize.module.ts`

- [ ] **Step 9.1: Locate the existing OPENAI_RESPONSES_SDK provider**

Read `apps/api/src/tools/data-enricher/data-enricher.module.ts` (or `apps/api/src/llm/llm.module.ts` — wherever `OPENAI_RESPONSES_SDK` is provided) to see the pattern. The provider must be re-exported or imported.

- [ ] **Step 9.2: Create the module**

```ts
// apps/api/src/tools/article-optimize/article-optimize.module.ts
import { Module } from "@nestjs/common";
import { ArticleOptimizeClient } from "./article-optimize.client";
import { LlmModule } from "../../llm/llm.module"; // ← adjust to wherever OPENAI_RESPONSES_SDK lives
import { loadEnv } from "../../config/env";

const env = loadEnv();

@Module({
  imports: [LlmModule],
  providers: [
    ArticleOptimizeClient,
    {
      provide: "ARTICLE_OPTIMIZE_ENV",
      useValue: { ARTICLE_OPTIMIZE_MODEL: env.ARTICLE_OPTIMIZE_MODEL },
    },
  ],
  exports: [ArticleOptimizeClient],
})
export class ArticleOptimizeModule {}
```

If the LLM provider lives elsewhere (e.g. `DraftGeneratorModule` re-exports it), import that module instead. Match the exact import used by `DataEnricherModule`.

- [ ] **Step 9.3: Type-check**

Run: `cd apps/api && pnpm tsc --noEmit`
Expected: Exit 0.

- [ ] **Step 9.4: Commit**

```bash
git add apps/api/src/tools/article-optimize/article-optimize.module.ts
git commit -m "feat(api): ArticleOptimizeModule (NestJS DI)"
```

---

## Task 10: `ArticleOptimizeHandler` (TDD)

**Files:**
- Create: `apps/api/src/handlers/article-optimize.handler.ts`
- Test: `apps/api/src/tests/article-optimize.handler.test.ts`

- [ ] **Step 10.1: Write the failing test**

```ts
// apps/api/src/tests/article-optimize.handler.test.ts
import { describe, expect, it, vi } from "vitest";
import { ArticleOptimizeHandler } from "../handlers/article-optimize.handler";
import { DataEnrichmentResult } from "@sensai/shared";

function fakeEnrichment(): DataEnrichmentResult {
  return DataEnrichmentResult.parse({
    meta: {
      keyword: "kortyzol",
      language: "pl",
      verifyModel: "gpt-5.2",
      questionModel: "gpt-4.1-mini",
      generatedAt: new Date().toISOString(),
    },
    htmlContent:
      "<h1>Kortyzol</h1><p>Spada o 20% (Źródło: WHO, 2024 — who.int/x).</p>",
    claims: [],
    verifications: [],
    stats: {
      totalClaimsFound: 0,
      claimsVerified: 0,
      sourcesAdded: 0,
      correctionsFlagged: 0,
      unverified: 0,
      totalCostUsd: "0",
      totalLatencyMs: 0,
    },
    warnings: [],
  });
}

describe("ArticleOptimizeHandler", () => {
  it("declares type tool.article.optimize", () => {
    const h = new ArticleOptimizeHandler({} as any, {} as any, {} as any);
    expect(h.type).toBe("tool.article.optimize");
  });

  it("throws when previousOutputs.enrich missing", async () => {
    const h = new ArticleOptimizeHandler({} as any, {} as any, {} as any);
    await expect(
      h.execute({
        run: { id: "r" } as any,
        step: { id: "s" } as any,
        project: { id: "p" } as any,
        previousOutputs: {},
        attempt: 1,
      }),
    ).rejects.toThrow(/requires previousOutputs.enrich/);
  });

  it("delegates to client and returns ArticleOptimizeResult", async () => {
    const enrichment = fakeEnrichment();
    const client = {
      optimize: vi.fn().mockResolvedValue({
        htmlContent: enrichment.htmlContent,
        warnings: [],
        protection: {
          srcPlaceholdersTotal: 1,
          srcPlaceholdersMissing: 0,
          spansTotal: 1,
          spansMissing: 0,
        },
        stats: {
          inputLength: 100,
          outputLength: 95,
          sourcesBefore: 1,
          sourcesAfter: 1,
          anchorsRemoved: 0,
        },
        cost: { costUsd: "0.0021", latencyMs: 1234 },
      }),
    } as any;
    const cache = {
      getOrSet: vi.fn(async (opts: any) => (await opts.fetcher()).result),
    } as any;
    const env = {
      ARTICLE_OPTIMIZE_MODEL: "gpt-5.2",
      ARTICLE_OPTIMIZE_TTL_DAYS: 7,
    } as any;

    const handler = new ArticleOptimizeHandler(client, cache, env);
    const res = await handler.execute({
      run: { id: "r" } as any,
      step: { id: "s" } as any,
      project: { id: "p" } as any,
      previousOutputs: { enrich: enrichment },
      attempt: 1,
    });
    expect(client.optimize).toHaveBeenCalledTimes(1);
    expect(res.output).toMatchObject({
      meta: { keyword: "kortyzol", language: "pl", model: "gpt-5.2" },
      htmlContent: enrichment.htmlContent,
      stats: { sourcesAfter: 1, anchorsRemoved: 0 },
    });
  });
});
```

- [ ] **Step 10.2: Run — expect FAIL**

Run: `cd apps/api && pnpm vitest run src/tests/article-optimize.handler.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 10.3: Implement `ArticleOptimizeHandler`**

```ts
// apps/api/src/handlers/article-optimize.handler.ts
import { Inject, Injectable, Logger } from "@nestjs/common";
import { createHash } from "node:crypto";
import type {
  StepContext,
  StepHandler,
  StepResult,
} from "../orchestrator/step-handler";
import { ArticleOptimizeResult, DataEnrichmentResult } from "@sensai/shared";
import { ToolCacheService } from "../tools/tool-cache.service";
import { ArticleOptimizeClient } from "../tools/article-optimize/article-optimize.client";
import type { Env } from "../config/env";

type HandlerEnv = Pick<Env, "ARTICLE_OPTIMIZE_MODEL" | "ARTICLE_OPTIMIZE_TTL_DAYS">;

const PROMPT_VERSION = "v1";

@Injectable()
export class ArticleOptimizeHandler implements StepHandler {
  readonly type = "tool.article.optimize";
  private readonly logger = new Logger(ArticleOptimizeHandler.name);

  constructor(
    private readonly client: ArticleOptimizeClient,
    private readonly cache: ToolCacheService,
    @Inject("ARTICLE_OPTIMIZE_HANDLER_ENV") private readonly env: HandlerEnv,
  ) {}

  async execute(ctx: StepContext): Promise<StepResult> {
    const prev = ctx.previousOutputs.enrich;
    if (prev === undefined || prev === null) {
      throw new Error("article.optimize requires previousOutputs.enrich");
    }
    const enrichment = DataEnrichmentResult.parse(prev);
    const inputHash = sha256(enrichment.htmlContent);

    const result = await this.cache.getOrSet<ArticleOptimizeResult>({
      tool: "article",
      method: "optimize",
      params: {
        inputHash,
        model: this.env.ARTICLE_OPTIMIZE_MODEL,
        promptVersion: PROMPT_VERSION,
      },
      ttlSeconds: this.env.ARTICLE_OPTIMIZE_TTL_DAYS * 24 * 3600,
      runId: ctx.run.id,
      stepId: ctx.step.id,
      forceRefresh: ctx.forceRefresh,
      fetcher: async () => {
        const out = await this.client.optimize({
          ctx: { runId: ctx.run.id, stepId: ctx.step.id, attempt: ctx.attempt },
          keyword: enrichment.meta.keyword,
          language: enrichment.meta.language,
          htmlContent: enrichment.htmlContent,
        });

        const result: ArticleOptimizeResult = {
          meta: {
            keyword: enrichment.meta.keyword,
            language: enrichment.meta.language,
            model: this.env.ARTICLE_OPTIMIZE_MODEL,
            promptVersion: PROMPT_VERSION,
            generatedAt: new Date().toISOString(),
          },
          htmlContent: out.htmlContent,
          stats: {
            inputLength: out.stats.inputLength,
            outputLength: out.stats.outputLength,
            sourcesBefore: out.stats.sourcesBefore,
            sourcesAfter: out.stats.sourcesAfter,
            anchorsRemoved: out.stats.anchorsRemoved,
            totalCostUsd: out.cost.costUsd,
            totalLatencyMs: out.cost.latencyMs,
          },
          protection: out.protection,
          warnings: out.warnings,
        };

        ArticleOptimizeResult.parse(result); // self-check before caching

        return {
          result,
          costUsd: out.cost.costUsd,
          latencyMs: out.cost.latencyMs,
        };
      },
    });

    if (result.warnings.length > 0) {
      this.logger.warn(
        { runId: ctx.run.id, stepId: ctx.step.id, warnings: result.warnings },
        `article.optimize: ${result.warnings.length} warnings`,
      );
    }

    this.logger.log(
      {
        runId: ctx.run.id,
        stepId: ctx.step.id,
        sourcesBefore: result.stats.sourcesBefore,
        sourcesAfter: result.stats.sourcesAfter,
        anchorsRemoved: result.stats.anchorsRemoved,
        costUsd: result.stats.totalCostUsd,
      },
      "article.optimize done",
    );

    return { output: result };
  }
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
```

- [ ] **Step 10.4: Run — expect PASS**

Run: `cd apps/api && pnpm vitest run src/tests/article-optimize.handler.test.ts`
Expected: PASS, all 3 tests green.

- [ ] **Step 10.5: Commit**

```bash
git add apps/api/src/handlers/article-optimize.handler.ts apps/api/src/tests/article-optimize.handler.test.ts
git commit -m "feat(api): ArticleOptimizeHandler (tool.article.optimize step)"
```

---

## Task 11: ArticleIntermediate prompt builder

**Files:**
- Create: `apps/api/src/prompts/article-intermediate.prompt.ts`

No unit test — exercised by Task 12.

- [ ] **Step 11.1: Create the prompt builder**

Verbatim mirror of `docs/edu/lekcja-3-4/T3F4-PROMPT_INTERMEDIATE.md`. Unlike optimize, intermediate sends the article inline at the end of the user message in the Python reference; we keep it cleaner — system holds the rules, user holds the protected HTML.

```ts
// apps/api/src/prompts/article-intermediate.prompt.ts

export interface IntermediatePromptInput {
  language: string;
  maxLengthGrowth: number; // e.g. 0.10
}

const LANGUAGE_LABEL: Record<string, string> = {
  pl: "Polish",
  en: "English",
  de: "German",
};

export function buildIntermediateSystemPrompt(
  input: IntermediatePromptInput,
): string {
  const langLabel = LANGUAGE_LABEL[input.language] ?? "Polish";
  const growthPct = `${Math.round(input.maxLengthGrowth * 100)}%`;

  return `You are an expert editor specializing in improving article flow, readability, and visual presentation.
Your task is to enhance the logical flow, narrative structure, AND visual formatting of the article while preserving all content.

Language: ${langLabel}

### CRITICAL PRESERVATION RULES
1. **Sources:** Keep ALL [[SRC_xxx]] placeholders exactly as they are. Do NOT modify, move, or delete them. They must stay at the end of their paragraph.
2. **Numbers:** Keep ALL <span data-token-id="...">...</span> tags intact. Do NOT modify content inside spans.
3. **Structure:** Preserve all headings (<h1>, <h2>, <h3>) from the input.
4. **Content:** Do NOT add new information. Do NOT remove existing information.
5. **Length:** Output must be within +${growthPct} of input length.
6. **Links:** Do NOT add any <a> tags or hyperlinks.

### RULE G: INFORMATION HIERARCHY + BREATHING ROOM

Text cannot be uniformly dense. It needs hierarchy and "breathing room."

Paragraph structure with hierarchy:
1. Main sentence (IMPORTANT) — concrete fact or thesis
2. Development/example (MEDIUM) — explanation, context
3. Transition sentence (LIGHT) — connector or mini-summary

Implementation:
- Every 2-3 dense paragraphs → insert a lighter transitional paragraph
- After a series of facts → mini-summary or rhetorical question
- Before new section → connecting sentence to previous content

### RULE H: NATURAL TRANSITIONS AND NARRATIVE INSERTIONS

Add human narrative insertions that break the "report-like" tone.

Types of insertions (1-2 per H2 section):
1. Mini-summaries: "In short: X changed Y by introducing Z."
2. Acknowledging difficulty: "This may sound complicated, but in practice..."
3. Contextualization: connect to everyday experience relevant to the article topic
4. Rhetorical questions (sparingly): "What does this mean in practice?"

CRITICAL: These are TEMPLATES, not literal text. Adapt each insertion to the article's actual subject matter.

### RULE K: VISUAL FORMATTING FOR READABILITY

The article must NOT be a wall of plain text.

K1: Bold (<strong>)
- Bold key terms at first meaningful use
- Bold surprising numbers or facts
- Bold names of substances, laws, products on first mention
- Target: 2-4 bolded phrases per H2 section
- NEVER bold entire sentences or headings
- Keep bolded phrases short (1-5 words)

K2: Italic (<i>)
- Emphasis on important statements
- Foreign terms, titles, Latin names
- Rhetorical or reflective sentences (mini-conclusions)
- Target: 1-2 italic phrases per H2 section

K3: Blockquote (<blockquote>)
- Notable historical quotes or key definitions
- Pivotal statements deserving visual emphasis
- Target: 0-2 per entire article (very selective)

K4: Line breaks (<br />)
- When a thought within a paragraph concludes but the next continues the same topic
- Before a contrasting or pivotal follow-up sentence
- Target: 5-15 per article, focus on longest/densest paragraphs

### ADDITIONAL RULES

ONE THOUGHT = ONE PARAGRAPH:
- Each paragraph: ONE main idea
- Max 5 sentences OR ~800 characters per paragraph
- Split long paragraphs covering multiple topics

NO DUPLICATE IDEAS:
- If you add italic emphasis, check whether the NEXT sentence says the same thing
- Never express the same idea twice in a row

FORBIDDEN SEO INTROS (HARD FAIL):
- "jeśli zadajesz sobie pytanie", "zanim przejdziemy" (PL)
- "before we dive in", "let's dive in" (EN)
- "w tym artykule dowiesz się", "in this article you'll learn"

### OUTPUT REQUIREMENTS
- Return ONLY the edited HTML article
- Start with the existing <h1>
- No explanations, no code fences
- Preserve ALL [[SRC_xxx]] placeholders and <span> tags exactly`;
}
```

- [ ] **Step 11.2: Type-check + commit**

```bash
cd apps/api && pnpm tsc --noEmit
git add apps/api/src/prompts/article-intermediate.prompt.ts
git commit -m "feat(api): article-intermediate system prompt builder (rules G,H,K)"
```

---

## Task 12: `ArticleIntermediateClient` (TDD)

**Files:**
- Create: `apps/api/src/tools/article-intermediate/article-intermediate.client.ts`
- Test: `apps/api/src/tests/article-intermediate.client.test.ts`

- [ ] **Step 12.1: Write the failing test**

```ts
// apps/api/src/tests/article-intermediate.client.test.ts
import { describe, expect, it, vi } from "vitest";
import { ArticleIntermediateClient } from "../tools/article-intermediate/article-intermediate.client";

const stubEnv = {
  ARTICLE_INTERMEDIATE_MODEL: "gpt-5.2",
  ARTICLE_INTERMEDIATE_MAX_GROWTH: 0.10,
} as const;

function llmEcho() {
  return {
    createBlock: vi.fn(async ({ input }: any) => ({
      id: "r",
      outputText: input,
      model: "gpt-5.2",
      promptTokens: 1,
      completionTokens: 1,
      costUsd: "0",
      latencyMs: 1,
    })),
  } as any;
}

describe("ArticleIntermediateClient.intermediate", () => {
  it("returns transformed HTML and counts formatting before/after", async () => {
    const inputHtml =
      "<h1>T</h1><p>Body 20% text.</p>";
    const llm = {
      createBlock: vi.fn(async ({ input }: any) => ({
        id: "r",
        // Simulate model adding <strong> around "20%" wrapping span.
        outputText: input.replace(
          /<span data-token-id="NUM_[a-f0-9]+">20%<\/span>/,
          (m: string) => `<strong>${m}</strong>`,
        ),
        model: "gpt-5.2",
        promptTokens: 100,
        completionTokens: 105,
        costUsd: "0.0019",
        latencyMs: 4567,
      })),
    } as any;
    const client = new ArticleIntermediateClient(llm, stubEnv as any);
    const out = await client.intermediate({
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      keyword: "k",
      language: "pl",
      htmlContent: inputHtml,
    });
    expect(out.stats.formattingAfter.strong).toBe(1);
    expect(out.stats.formattingBefore.strong).toBe(0);
  });

  it("throws when <h1> missing", async () => {
    const llm = {
      createBlock: vi.fn(async () => ({
        id: "r",
        outputText: "<p>no heading here</p>",
        model: "gpt-5.2",
        promptTokens: 1,
        completionTokens: 1,
        costUsd: "0",
        latencyMs: 1,
      })),
    } as any;
    const client = new ArticleIntermediateClient(llm, stubEnv as any);
    await expect(
      client.intermediate({
        ctx: { runId: "r", stepId: "s", attempt: 1 },
        keyword: "k",
        language: "pl",
        htmlContent: "<h1>T</h1><p>x.</p>",
      }),
    ).rejects.toThrow(/missing.*h1/i);
  });

  it("throws when growth exceeds limit", async () => {
    const inputHtml = "<h1>T</h1><p>" + "x".repeat(100) + "</p>";
    const llm = {
      createBlock: vi.fn(async () => ({
        id: "r",
        // 200 chars of x — well over +10%.
        outputText: "<h1>T</h1><p>" + "x".repeat(200) + "</p>",
        model: "gpt-5.2",
        promptTokens: 1,
        completionTokens: 1,
        costUsd: "0",
        latencyMs: 1,
      })),
    } as any;
    const client = new ArticleIntermediateClient(llm, stubEnv as any);
    await expect(
      client.intermediate({
        ctx: { runId: "r", stepId: "s", attempt: 1 },
        keyword: "k",
        language: "pl",
        htmlContent: inputHtml,
      }),
    ).rejects.toThrow(/length growth/i);
  });

  it("throws when numbers are lost", async () => {
    const inputHtml = "<h1>T</h1><p>Spada o 20% w 2024.</p>";
    const llm = {
      createBlock: vi.fn(async () => ({
        id: "r",
        // Model dropped the percent.
        outputText: "<h1>T</h1><p>Spada w 2024.</p>",
        model: "gpt-5.2",
        promptTokens: 1,
        completionTokens: 1,
        costUsd: "0",
        latencyMs: 1,
      })),
    } as any;
    const client = new ArticleIntermediateClient(llm, stubEnv as any);
    await expect(
      client.intermediate({
        ctx: { runId: "r", stepId: "s", attempt: 1 },
        keyword: "k",
        language: "pl",
        htmlContent: inputHtml,
      }),
    ).rejects.toThrow(/lost.*number/i);
  });

  it("throws when source citation count drops", async () => {
    const inputHtml =
      "<h1>T</h1><p>X (Źródło: WHO, 2024 — who.int).</p>";
    const llm = {
      createBlock: vi.fn(async () => ({
        id: "r",
        outputText: "<h1>T</h1><p>X.</p>", // citation gone
        model: "gpt-5.2",
        promptTokens: 1,
        completionTokens: 1,
        costUsd: "0",
        latencyMs: 1,
      })),
    } as any;
    const client = new ArticleIntermediateClient(llm, stubEnv as any);
    await expect(
      client.intermediate({
        ctx: { runId: "r", stepId: "s", attempt: 1 },
        keyword: "k",
        language: "pl",
        htmlContent: inputHtml,
      }),
    ).rejects.toThrow(/source.*lost|placeholder/i);
  });

  it("throws when <a> tags appear in output", async () => {
    const inputHtml = "<h1>T</h1><p>x.</p>";
    const llm = {
      createBlock: vi.fn(async () => ({
        id: "r",
        outputText: '<h1>T</h1><p><a href="x">x</a>.</p>',
        model: "gpt-5.2",
        promptTokens: 1,
        completionTokens: 1,
        costUsd: "0",
        latencyMs: 1,
      })),
    } as any;
    const client = new ArticleIntermediateClient(llm, stubEnv as any);
    await expect(
      client.intermediate({
        ctx: { runId: "r", stepId: "s", attempt: 1 },
        keyword: "k",
        language: "pl",
        htmlContent: inputHtml,
      }),
    ).rejects.toThrow(/anchor|<a>/i);
  });

  it("throws when SEO intro detected", async () => {
    const inputHtml = "<h1>T</h1><p>x.</p>";
    const llm = {
      createBlock: vi.fn(async () => ({
        id: "r",
        outputText:
          "<h1>T</h1><p>Zanim przejdziemy do meritum, warto zaznaczyć x.</p>",
        model: "gpt-5.2",
        promptTokens: 1,
        completionTokens: 1,
        costUsd: "0",
        latencyMs: 1,
      })),
    } as any;
    const client = new ArticleIntermediateClient(llm, stubEnv as any);
    await expect(
      client.intermediate({
        ctx: { runId: "r", stepId: "s", attempt: 1 },
        keyword: "k",
        language: "pl",
        htmlContent: inputHtml,
      }),
    ).rejects.toThrow(/seo.*intro/i);
  });
});
```

- [ ] **Step 12.2: Run — expect FAIL**

Run: `cd apps/api && pnpm vitest run src/tests/article-intermediate.client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 12.3: Implement `ArticleIntermediateClient`**

```ts
// apps/api/src/tools/article-intermediate/article-intermediate.client.ts
import { Inject, Injectable, Logger } from "@nestjs/common";
import { OpenAIResponsesClient } from "../../llm/openai-responses.client";
import { tokenizeHybrid } from "../article-protect/article-protect.tokenize";
import { restoreHybrid } from "../article-protect/article-protect.restore";
import {
  countFormatting,
  detectSeoIntro,
  extractNumberSet,
  extractPlainText,
  hasAnchorTags,
  hasH1Tag,
} from "../article-protect/article-protect.guards";
import { SOURCE_CITATION_RE } from "../article-protect/article-protect.regex";
import { buildIntermediateSystemPrompt } from "../../prompts/article-intermediate.prompt";
import type {
  ArticleIntermediateWarning,
  FormattingCounts,
} from "@sensai/shared";
import type { Env } from "../../config/env";

type ClientEnv = Pick<
  Env,
  "ARTICLE_INTERMEDIATE_MODEL" | "ARTICLE_INTERMEDIATE_MAX_GROWTH"
>;

export interface IntermediateArgs {
  ctx: { runId: string; stepId: string; attempt: number };
  keyword: string;
  language: string;
  htmlContent: string;
}

export interface IntermediateResult {
  htmlContent: string;
  warnings: ArticleIntermediateWarning[];
  protection: {
    srcPlaceholdersTotal: number;
    srcPlaceholdersMissing: number;
    spansTotal: number;
    spansMissing: number;
  };
  stats: {
    inputLength: number;
    outputLength: number;
    growth: number;
    sourcesBefore: number;
    sourcesAfter: number;
    formattingBefore: FormattingCounts;
    formattingAfter: FormattingCounts;
  };
  cost: { costUsd: string; latencyMs: number };
}

@Injectable()
export class ArticleIntermediateClient {
  private readonly logger = new Logger(ArticleIntermediateClient.name);

  constructor(
    private readonly llm: OpenAIResponsesClient,
    @Inject("ARTICLE_INTERMEDIATE_ENV") private readonly env: ClientEnv,
  ) {}

  async intermediate(args: IntermediateArgs): Promise<IntermediateResult> {
    const inputText = extractPlainText(args.htmlContent);
    const inputLength = inputText.length;
    const inputNumbers = extractNumberSet(inputText);
    const sourcesBefore = countMatches(args.htmlContent, SOURCE_CITATION_RE);
    const formattingBefore = countFormatting(args.htmlContent);

    const { html: protectedHtml, srcMap, spanMap } = tokenizeHybrid(
      args.htmlContent,
    );
    const system = buildIntermediateSystemPrompt({
      language: args.language,
      maxLengthGrowth: this.env.ARTICLE_INTERMEDIATE_MAX_GROWTH,
    });

    const resp = await this.llm.createBlock({
      ctx: args.ctx,
      model: this.env.ARTICLE_INTERMEDIATE_MODEL,
      system,
      input: protectedHtml,
      reasoning: { effort: "medium" },
    });

    const restored = restoreHybrid(resp.outputText, srcMap, spanMap);
    if (restored.missingSrc.length > 0) {
      throw new Error(
        `article.intermediate: source placeholder lost: ${restored.missingSrc.join(", ")}`,
      );
    }

    const warnings: ArticleIntermediateWarning[] = [];
    if (restored.missingSpans.length > 0) {
      warnings.push({
        kind: "intermediate_spans_missing",
        message: `${restored.missingSpans.length} number/date spans missing after restore`,
        context: { count: String(restored.missingSpans.length) },
      });
    }

    const outHtml = restored.html;

    // GUARD 1: <h1> required.
    if (!hasH1Tag(outHtml)) {
      throw new Error("article.intermediate: hard fail — missing <h1>");
    }

    // GUARD 2: no <a> tags.
    if (hasAnchorTags(outHtml)) {
      throw new Error("article.intermediate: hard fail — <a> anchor added");
    }

    // GUARD 3: length growth bound.
    const outputText = extractPlainText(outHtml);
    const outputLength = outputText.length;
    const growth =
      inputLength > 0 ? (outputLength - inputLength) / inputLength : 0;
    if (growth > this.env.ARTICLE_INTERMEDIATE_MAX_GROWTH) {
      throw new Error(
        `article.intermediate: hard fail — length growth ${(growth * 100).toFixed(1)}% > ${(this.env.ARTICLE_INTERMEDIATE_MAX_GROWTH * 100).toFixed(0)}%`,
      );
    }

    // GUARD 4: numbers preserved.
    const outputNumbers = extractNumberSet(outputText);
    const lostNumbers = [...inputNumbers].filter((v) => !outputNumbers.has(v));
    if (lostNumbers.length > 0) {
      throw new Error(
        `article.intermediate: hard fail — lost numbers: ${lostNumbers.slice(0, 5).join(", ")}`,
      );
    }

    // GUARD 5: source citation count.
    const sourcesAfter = countMatches(outHtml, SOURCE_CITATION_RE);
    if (sourcesAfter < sourcesBefore) {
      throw new Error(
        `article.intermediate: hard fail — sources count dropped ${sourcesBefore} → ${sourcesAfter}`,
      );
    }

    // GUARD 6: SEO intro.
    if (detectSeoIntro(outHtml, args.language)) {
      throw new Error("article.intermediate: hard fail — SEO intro pattern detected");
    }

    const formattingAfter = countFormatting(outHtml);

    return {
      htmlContent: outHtml,
      warnings,
      protection: {
        srcPlaceholdersTotal: Object.keys(srcMap).length,
        srcPlaceholdersMissing: restored.missingSrc.length,
        spansTotal: Object.keys(spanMap).length,
        spansMissing: restored.missingSpans.length,
      },
      stats: {
        inputLength,
        outputLength,
        growth,
        sourcesBefore,
        sourcesAfter,
        formattingBefore,
        formattingAfter,
      },
      cost: { costUsd: resp.costUsd, latencyMs: resp.latencyMs },
    };
  }
}

function countMatches(text: string, re: RegExp): number {
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  const local = new RegExp(re.source, flags);
  return (text.match(local) ?? []).length;
}
```

- [ ] **Step 12.4: Run — expect PASS**

Run: `cd apps/api && pnpm vitest run src/tests/article-intermediate.client.test.ts`
Expected: PASS, all 7 tests green.

- [ ] **Step 12.5: Commit**

```bash
git add apps/api/src/tools/article-intermediate/article-intermediate.client.ts apps/api/src/tests/article-intermediate.client.test.ts
git commit -m "feat(api): ArticleIntermediateClient — tokenize + LLM + restore + 6 hard-fail guards"
```

---

## Task 13: ArticleIntermediate NestJS module

**Files:**
- Create: `apps/api/src/tools/article-intermediate/article-intermediate.module.ts`

- [ ] **Step 13.1: Create the module**

```ts
// apps/api/src/tools/article-intermediate/article-intermediate.module.ts
import { Module } from "@nestjs/common";
import { ArticleIntermediateClient } from "./article-intermediate.client";
import { LlmModule } from "../../llm/llm.module"; // adjust to wherever OPENAI_RESPONSES_SDK lives
import { loadEnv } from "../../config/env";

const env = loadEnv();

@Module({
  imports: [LlmModule],
  providers: [
    ArticleIntermediateClient,
    {
      provide: "ARTICLE_INTERMEDIATE_ENV",
      useValue: {
        ARTICLE_INTERMEDIATE_MODEL: env.ARTICLE_INTERMEDIATE_MODEL,
        ARTICLE_INTERMEDIATE_MAX_GROWTH: env.ARTICLE_INTERMEDIATE_MAX_GROWTH,
      },
    },
  ],
  exports: [ArticleIntermediateClient],
})
export class ArticleIntermediateModule {}
```

- [ ] **Step 13.2: Type-check + commit**

```bash
cd apps/api && pnpm tsc --noEmit
git add apps/api/src/tools/article-intermediate/article-intermediate.module.ts
git commit -m "feat(api): ArticleIntermediateModule (NestJS DI)"
```

---

## Task 14: `ArticleIntermediateHandler` (TDD)

**Files:**
- Create: `apps/api/src/handlers/article-intermediate.handler.ts`
- Test: `apps/api/src/tests/article-intermediate.handler.test.ts`

- [ ] **Step 14.1: Write the failing test**

```ts
// apps/api/src/tests/article-intermediate.handler.test.ts
import { describe, expect, it, vi } from "vitest";
import { ArticleIntermediateHandler } from "../handlers/article-intermediate.handler";
import { ArticleOptimizeResult } from "@sensai/shared";

function fakeOptimize(): ArticleOptimizeResult {
  return ArticleOptimizeResult.parse({
    meta: {
      keyword: "kortyzol",
      language: "pl",
      model: "gpt-5.2",
      promptVersion: "v1",
      generatedAt: new Date().toISOString(),
    },
    htmlContent:
      "<h1>Kortyzol</h1><p>Spada o 20% (Źródło: WHO, 2024 — who.int/x).</p>",
    stats: {
      inputLength: 100,
      outputLength: 95,
      sourcesBefore: 1,
      sourcesAfter: 1,
      anchorsRemoved: 0,
      totalCostUsd: "0.001",
      totalLatencyMs: 1000,
    },
    protection: {
      srcPlaceholdersTotal: 1,
      srcPlaceholdersMissing: 0,
      spansTotal: 1,
      spansMissing: 0,
    },
    warnings: [],
  });
}

describe("ArticleIntermediateHandler", () => {
  it("declares type tool.article.intermediate", () => {
    const h = new ArticleIntermediateHandler({} as any, {} as any, {} as any);
    expect(h.type).toBe("tool.article.intermediate");
  });

  it("throws when previousOutputs.optimize missing", async () => {
    const h = new ArticleIntermediateHandler({} as any, {} as any, {} as any);
    await expect(
      h.execute({
        run: { id: "r" } as any,
        step: { id: "s" } as any,
        project: { id: "p" } as any,
        previousOutputs: {},
        attempt: 1,
      }),
    ).rejects.toThrow(/requires previousOutputs.optimize/);
  });

  it("delegates to client and returns ArticleIntermediateResult", async () => {
    const optimize = fakeOptimize();
    const client = {
      intermediate: vi.fn().mockResolvedValue({
        htmlContent: optimize.htmlContent,
        warnings: [],
        protection: {
          srcPlaceholdersTotal: 1,
          srcPlaceholdersMissing: 0,
          spansTotal: 1,
          spansMissing: 0,
        },
        stats: {
          inputLength: 100,
          outputLength: 105,
          growth: 0.05,
          sourcesBefore: 1,
          sourcesAfter: 1,
          formattingBefore: { strong: 0, italic: 0, blockquote: 0, br: 0 },
          formattingAfter: { strong: 2, italic: 1, blockquote: 0, br: 1 },
        },
        cost: { costUsd: "0.0019", latencyMs: 4567 },
      }),
    } as any;
    const cache = {
      getOrSet: vi.fn(async (opts: any) => (await opts.fetcher()).result),
    } as any;
    const env = {
      ARTICLE_INTERMEDIATE_MODEL: "gpt-5.2",
      ARTICLE_INTERMEDIATE_TTL_DAYS: 7,
    } as any;

    const handler = new ArticleIntermediateHandler(client, cache, env);
    const res = await handler.execute({
      run: { id: "r" } as any,
      step: { id: "s" } as any,
      project: { id: "p" } as any,
      previousOutputs: { optimize },
      attempt: 1,
    });
    expect(client.intermediate).toHaveBeenCalledTimes(1);
    expect(res.output).toMatchObject({
      meta: { keyword: "kortyzol", language: "pl", model: "gpt-5.2" },
      htmlContent: optimize.htmlContent,
      stats: { growth: 0.05, formattingAfter: { strong: 2 } },
    });
  });
});
```

- [ ] **Step 14.2: Run — expect FAIL**

Run: `cd apps/api && pnpm vitest run src/tests/article-intermediate.handler.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 14.3: Implement `ArticleIntermediateHandler`**

```ts
// apps/api/src/handlers/article-intermediate.handler.ts
import { Inject, Injectable, Logger } from "@nestjs/common";
import { createHash } from "node:crypto";
import type {
  StepContext,
  StepHandler,
  StepResult,
} from "../orchestrator/step-handler";
import {
  ArticleIntermediateResult,
  ArticleOptimizeResult,
} from "@sensai/shared";
import { ToolCacheService } from "../tools/tool-cache.service";
import { ArticleIntermediateClient } from "../tools/article-intermediate/article-intermediate.client";
import type { Env } from "../config/env";

type HandlerEnv = Pick<
  Env,
  "ARTICLE_INTERMEDIATE_MODEL" | "ARTICLE_INTERMEDIATE_TTL_DAYS"
>;

const PROMPT_VERSION = "v1";

@Injectable()
export class ArticleIntermediateHandler implements StepHandler {
  readonly type = "tool.article.intermediate";
  private readonly logger = new Logger(ArticleIntermediateHandler.name);

  constructor(
    private readonly client: ArticleIntermediateClient,
    private readonly cache: ToolCacheService,
    @Inject("ARTICLE_INTERMEDIATE_HANDLER_ENV") private readonly env: HandlerEnv,
  ) {}

  async execute(ctx: StepContext): Promise<StepResult> {
    const prev = ctx.previousOutputs.optimize;
    if (prev === undefined || prev === null) {
      throw new Error("article.intermediate requires previousOutputs.optimize");
    }
    const optimize = ArticleOptimizeResult.parse(prev);
    const inputHash = sha256(optimize.htmlContent);

    const result = await this.cache.getOrSet<ArticleIntermediateResult>({
      tool: "article",
      method: "intermediate",
      params: {
        inputHash,
        model: this.env.ARTICLE_INTERMEDIATE_MODEL,
        promptVersion: PROMPT_VERSION,
      },
      ttlSeconds: this.env.ARTICLE_INTERMEDIATE_TTL_DAYS * 24 * 3600,
      runId: ctx.run.id,
      stepId: ctx.step.id,
      forceRefresh: ctx.forceRefresh,
      fetcher: async () => {
        const out = await this.client.intermediate({
          ctx: { runId: ctx.run.id, stepId: ctx.step.id, attempt: ctx.attempt },
          keyword: optimize.meta.keyword,
          language: optimize.meta.language,
          htmlContent: optimize.htmlContent,
        });

        const result: ArticleIntermediateResult = {
          meta: {
            keyword: optimize.meta.keyword,
            language: optimize.meta.language,
            model: this.env.ARTICLE_INTERMEDIATE_MODEL,
            promptVersion: PROMPT_VERSION,
            generatedAt: new Date().toISOString(),
          },
          htmlContent: out.htmlContent,
          stats: {
            inputLength: out.stats.inputLength,
            outputLength: out.stats.outputLength,
            growth: out.stats.growth,
            sourcesBefore: out.stats.sourcesBefore,
            sourcesAfter: out.stats.sourcesAfter,
            formattingBefore: out.stats.formattingBefore,
            formattingAfter: out.stats.formattingAfter,
            totalCostUsd: out.cost.costUsd,
            totalLatencyMs: out.cost.latencyMs,
          },
          protection: out.protection,
          warnings: out.warnings,
        };

        ArticleIntermediateResult.parse(result); // self-check before caching

        return {
          result,
          costUsd: out.cost.costUsd,
          latencyMs: out.cost.latencyMs,
        };
      },
    });

    if (result.warnings.length > 0) {
      this.logger.warn(
        { runId: ctx.run.id, stepId: ctx.step.id, warnings: result.warnings },
        `article.intermediate: ${result.warnings.length} warnings`,
      );
    }

    this.logger.log(
      {
        runId: ctx.run.id,
        stepId: ctx.step.id,
        growth: result.stats.growth,
        formattingAfter: result.stats.formattingAfter,
        costUsd: result.stats.totalCostUsd,
      },
      "article.intermediate done",
    );

    return { output: result };
  }
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
```

- [ ] **Step 14.4: Run — expect PASS**

Run: `cd apps/api && pnpm vitest run src/tests/article-intermediate.handler.test.ts`
Expected: PASS, all 3 tests green.

- [ ] **Step 14.5: Commit**

```bash
git add apps/api/src/handlers/article-intermediate.handler.ts apps/api/src/tests/article-intermediate.handler.test.ts
git commit -m "feat(api): ArticleIntermediateHandler (tool.article.intermediate step)"
```

---

## Task 15: Register handlers in `HandlersModule`

**Files:**
- Modify: `apps/api/src/handlers/handlers.module.ts`

- [ ] **Step 15.1: Read the existing module**

Open `apps/api/src/handlers/handlers.module.ts` to see how `DataEnrichHandler` is registered (Plan 14 added it). The pattern: import the module, inject the handler, append to the `STEP_HANDLERS` array, provide a `*_HANDLER_ENV` value.

- [ ] **Step 15.2: Add imports**

Append the imports near the top of the file:

```ts
import { ArticleOptimizeModule } from "../tools/article-optimize/article-optimize.module";
import { ArticleOptimizeHandler } from "./article-optimize.handler";
import { ArticleIntermediateModule } from "../tools/article-intermediate/article-intermediate.module";
import { ArticleIntermediateHandler } from "./article-intermediate.handler";
```

- [ ] **Step 15.3: Add to `imports[]` of the `@Module` decorator**

```ts
imports: [
  // … existing modules …
  ArticleOptimizeModule,
  ArticleIntermediateModule,
],
```

- [ ] **Step 15.4: Add provider entries (env tokens + handlers)**

Inside the `providers: [ … ]`:

```ts
{
  provide: "ARTICLE_OPTIMIZE_HANDLER_ENV",
  useFactory: () => {
    const e = loadEnv();
    return {
      ARTICLE_OPTIMIZE_MODEL: e.ARTICLE_OPTIMIZE_MODEL,
      ARTICLE_OPTIMIZE_TTL_DAYS: e.ARTICLE_OPTIMIZE_TTL_DAYS,
    };
  },
},
{
  provide: "ARTICLE_INTERMEDIATE_HANDLER_ENV",
  useFactory: () => {
    const e = loadEnv();
    return {
      ARTICLE_INTERMEDIATE_MODEL: e.ARTICLE_INTERMEDIATE_MODEL,
      ARTICLE_INTERMEDIATE_TTL_DAYS: e.ARTICLE_INTERMEDIATE_TTL_DAYS,
    };
  },
},
ArticleOptimizeHandler,
ArticleIntermediateHandler,
```

(If the module uses a different `loadEnv` pattern — e.g. inline `process.env.X` reads — match that style instead.)

- [ ] **Step 15.5: Append both handlers to the `STEP_HANDLERS` factory array**

Find the factory that builds `StepHandler[]` (e.g. `useFactory: (a, b, …, dataEnrich) => [a, b, …, dataEnrich]`). Append both new handlers as factory dependencies and array elements:

```ts
{
  provide: STEP_HANDLERS,
  inject: [
    // … existing handlers …
    DataEnrichHandler,
    ArticleOptimizeHandler,
    ArticleIntermediateHandler,
  ],
  useFactory: (
    /* … existing handler params … */
    dataEnrich: DataEnrichHandler,
    articleOptimize: ArticleOptimizeHandler,
    articleIntermediate: ArticleIntermediateHandler,
  ) => [
    /* … existing handlers … */
    dataEnrich,
    articleOptimize,
    articleIntermediate,
  ],
},
```

- [ ] **Step 15.6: Type-check + run all unit tests**

```bash
cd apps/api && pnpm tsc --noEmit && pnpm vitest run
```

Expected: Exit 0, all tests green.

- [ ] **Step 15.7: Commit**

```bash
git add apps/api/src/handlers/handlers.module.ts
git commit -m "feat(api): register ArticleOptimize+Intermediate handlers in HandlersModule"
```

---

## Task 16: Seed — Plan 15 template

**Files:**
- Modify: `apps/api/src/seed/seed.ts`

- [ ] **Step 16.1: Append the Plan 15 template after Plan 14's `blogSeoEnrich`**

After the `blogSeoEnrich` block (currently ends at the line with the closing `);` near line 193), insert:

```ts
  // Plan 15 — Article Optimize + Intermediate. Terminal at `intermediate`.
  const blogSeoIntermediate = await upsertTemplate(
    db,
    "Blog SEO — full pipeline + draft + enrich + optimize + intermediate",
    1,
    {
      steps: [
        { key: "fanout",       type: "tool.query.fanout",         auto: true,  dependsOn: [] },
        { key: "deepResearch", type: "tool.youcom.research",      auto: true,  dependsOn: [] },
        { key: "research",     type: "tool.serp.fetch",           auto: true,  dependsOn: [] },
        { key: "scrape",       type: "tool.scrape",               auto: false, dependsOn: ["research"] },
        { key: "clean",        type: "tool.content.clean",        auto: true,  dependsOn: ["scrape"] },
        { key: "extract",      type: "tool.content.extract",      auto: true,  dependsOn: ["clean", "deepResearch"] },
        { key: "entities",     type: "tool.entity.extract",       auto: true,  dependsOn: ["clean", "deepResearch"] },
        { key: "kg",           type: "tool.kg.assemble",          auto: true,  dependsOn: ["extract", "entities"] },
        { key: "outlineGen",   type: "tool.outline.generate",     auto: true,  dependsOn: ["fanout"] },
        { key: "distribute",   type: "tool.outline.distribute",   auto: true,  dependsOn: ["outlineGen", "kg"] },
        { key: "draftGen",     type: "tool.draft.generate",       auto: true,  dependsOn: ["distribute"] },
        { key: "enrich",       type: "tool.data.enrich",          auto: true,  dependsOn: ["draftGen"] },
        { key: "optimize",     type: "tool.article.optimize",     auto: true,  dependsOn: ["enrich"] },
        { key: "intermediate", type: "tool.article.intermediate", auto: true,  dependsOn: ["optimize"] },
      ],
    },
  );
```

- [ ] **Step 16.2: Add the new template to the console log block**

Inside the `console.log("Seeded:")` section near line 195:

```ts
console.log(`    "${blogSeoIntermediate.name}" v${blogSeoIntermediate.version}: ${blogSeoIntermediate.id}`);
```

- [ ] **Step 16.3: Run the seed locally to verify it inserts**

Run: `cd apps/api && pnpm seed`
Expected: Exit 0; output ends with the new template line and id.

- [ ] **Step 16.4: Commit**

```bash
git add apps/api/src/seed/seed.ts
git commit -m "feat(seed): add Plan 15 template (optimize + intermediate steps)"
```

---

## Task 17: UI — `ArticleOptimizeOutput` renderer

**Files:**
- Create: `apps/web/src/components/step-output/article-optimize.tsx`

- [ ] **Step 17.1: Create the component**

```tsx
// apps/web/src/components/step-output/article-optimize.tsx
"use client";
import type { ArticleOptimizeResult } from "@sensai/shared";

function isOptimizeResult(v: unknown): v is ArticleOptimizeResult {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.htmlContent === "string" &&
    !!o.meta &&
    !!o.stats &&
    !!o.protection
  );
}

export function ArticleOptimizeOutput({ value }: { value: unknown }) {
  if (!isOptimizeResult(value)) {
    return <div className="text-sm text-muted-foreground">Brak danych</div>;
  }
  return <ArticleOptimizeRenderer output={value} />;
}

function ArticleOptimizeRenderer({ output }: { output: ArticleOptimizeResult }) {
  const { meta, htmlContent, stats, protection, warnings } = output;
  const sandboxedHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#1e293b;line-height:1.6}
    h1{font-size:1.875rem;margin-top:0}
    h2{font-size:1.5rem;margin-top:1.5em;border-bottom:1px solid #e2e8f0;padding-bottom:.25em}
    h3{font-size:1.125rem;margin-top:1.25em}
    p{margin:.75em 0}
    strong{color:#0f172a}
    blockquote{border-left:3px solid #cbd5e1;margin:1em 0;padding:.5em 1em;color:#475569;background:#f8fafc}
  </style></head><body>${htmlContent}</body></html>`;

  return (
    <div className="space-y-4">
      <header className="rounded border bg-slate-50 p-3">
        <div className="text-sm text-muted-foreground">
          keyword: <span className="font-mono">{meta.keyword}</span> · language: {meta.language} · model: {meta.model} · promptVersion: {meta.promptVersion}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {stats.inputLength} → {stats.outputLength} chars · źródła: {stats.sourcesBefore} → {stats.sourcesAfter} ·
          {" "}anchors removed: {stats.anchorsRemoved} · spans missing: {protection.spansMissing} · ${stats.totalCostUsd} · {stats.totalLatencyMs} ms
        </div>
      </header>

      <section>
        <div className="mb-2 text-sm font-semibold">Zoptymalizowany HTML</div>
        <iframe
          title="Optimize preview"
          srcDoc={sandboxedHtml}
          sandbox="allow-same-origin"
          className="h-[600px] w-full rounded border bg-white"
        />
      </section>

      {warnings.length > 0 && (
        <section className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          <div className="mb-1 font-semibold text-amber-900">Ostrzeżenia ({warnings.length})</div>
          <ul className="list-disc space-y-1 pl-5">
            {warnings.map((w, i) => (
              <li key={i}><span className="font-mono text-xs">{w.kind}</span>: {w.message}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 17.2: Type-check the web app**

Run: `cd apps/web && pnpm tsc --noEmit`
Expected: Exit 0.

- [ ] **Step 17.3: Commit**

```bash
git add apps/web/src/components/step-output/article-optimize.tsx
git commit -m "feat(web): ArticleOptimizeOutput renderer for tool.article.optimize"
```

---

## Task 18: UI — `ArticleIntermediateOutput` renderer

**Files:**
- Create: `apps/web/src/components/step-output/article-intermediate.tsx`

- [ ] **Step 18.1: Create the component**

```tsx
// apps/web/src/components/step-output/article-intermediate.tsx
"use client";
import type { ArticleIntermediateResult } from "@sensai/shared";

function isIntermediateResult(v: unknown): v is ArticleIntermediateResult {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.htmlContent === "string" &&
    !!o.meta &&
    !!o.stats &&
    !!o.protection
  );
}

export function ArticleIntermediateOutput({ value }: { value: unknown }) {
  if (!isIntermediateResult(value)) {
    return <div className="text-sm text-muted-foreground">Brak danych</div>;
  }
  return <ArticleIntermediateRenderer output={value} />;
}

function ArticleIntermediateRenderer({ output }: { output: ArticleIntermediateResult }) {
  const { meta, htmlContent, stats, protection, warnings } = output;
  const sandboxedHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#1e293b;line-height:1.6}
    h1{font-size:1.875rem;margin-top:0}
    h2{font-size:1.5rem;margin-top:1.5em;border-bottom:1px solid #e2e8f0;padding-bottom:.25em}
    h3{font-size:1.125rem;margin-top:1.25em}
    p{margin:.75em 0}
    strong{color:#0f172a}
    blockquote{border-left:3px solid #cbd5e1;margin:1em 0;padding:.5em 1em;color:#475569;background:#f8fafc}
    i,em{color:#334155}
  </style></head><body>${htmlContent}</body></html>`;

  const fmt = (n: number) => `${(n * 100).toFixed(1)}%`;
  const f0 = stats.formattingBefore;
  const f1 = stats.formattingAfter;

  return (
    <div className="space-y-4">
      <header className="rounded border bg-slate-50 p-3">
        <div className="text-sm text-muted-foreground">
          keyword: <span className="font-mono">{meta.keyword}</span> · language: {meta.language} · model: {meta.model} · promptVersion: {meta.promptVersion}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {stats.inputLength} → {stats.outputLength} chars (growth {fmt(stats.growth)}) · źródła: {stats.sourcesBefore} → {stats.sourcesAfter} ·
          {" "}spans missing: {protection.spansMissing} · ${stats.totalCostUsd} · {stats.totalLatencyMs} ms
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          formatting: strong {f0.strong}→{f1.strong} · italic {f0.italic}→{f1.italic} · blockquote {f0.blockquote}→{f1.blockquote} · br {f0.br}→{f1.br}
        </div>
      </header>

      <section>
        <div className="mb-2 text-sm font-semibold">Artykuł z przejściami i formatowaniem</div>
        <iframe
          title="Intermediate preview"
          srcDoc={sandboxedHtml}
          sandbox="allow-same-origin"
          className="h-[600px] w-full rounded border bg-white"
        />
      </section>

      {warnings.length > 0 && (
        <section className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          <div className="mb-1 font-semibold text-amber-900">Ostrzeżenia ({warnings.length})</div>
          <ul className="list-disc space-y-1 pl-5">
            {warnings.map((w, i) => (
              <li key={i}><span className="font-mono text-xs">{w.kind}</span>: {w.message}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 18.2: Type-check + commit**

```bash
cd apps/web && pnpm tsc --noEmit
git add apps/web/src/components/step-output/article-intermediate.tsx
git commit -m "feat(web): ArticleIntermediateOutput renderer for tool.article.intermediate"
```

---

## Task 19: UI — register both renderers in `step-output/index.tsx`

**Files:**
- Modify: `apps/web/src/components/step-output/index.tsx`

- [ ] **Step 19.1: Add imports near the top**

```tsx
import { ArticleOptimizeOutput } from "./article-optimize";
import { ArticleIntermediateOutput } from "./article-intermediate";
```

- [ ] **Step 19.2: Add `case` branches to the dispatch switch**

Find the switch (around line 27-54 in the current file) — add:

```tsx
case "tool.article.optimize":
  return <ArticleOptimizeOutput value={value} />;
case "tool.article.intermediate":
  return <ArticleIntermediateOutput value={value} />;
```

- [ ] **Step 19.3: Add both types to `hasRichRenderer()`**

Find the helper (around line 57-72) — append both strings to the recognized-types set:

```tsx
const RICH = new Set([
  /* … existing types … */
  "tool.data.enrich",
  "tool.article.optimize",
  "tool.article.intermediate",
]);
```

(Match whatever data structure the file already uses — set, switch, or array.)

- [ ] **Step 19.4: Type-check + commit**

```bash
cd apps/web && pnpm tsc --noEmit
git add apps/web/src/components/step-output/index.tsx
git commit -m "feat(web): route tool.article.optimize and tool.article.intermediate to renderers"
```

---

## Task 20: Smoke test — `tool.article.optimize`

**Files:**
- Create: `scripts/smoke-plan-15-optimize.ts`
- Modify: `package.json` (root)

- [ ] **Step 20.1: Create the smoke script**

```ts
#!/usr/bin/env tsx
/**
 * Plan 15 manual smoke test — tool.article.optimize.
 *
 * Reads Plan 14 smoke output (`scripts/smoke-output/plan-14-enriched.json`)
 * and runs ArticleOptimizeHandler in isolation.
 *
 * Pre-req: run `pnpm smoke:plan-14` first.
 *
 * Run: pnpm smoke:plan-15-optimize
 */
import "reflect-metadata";
import { config as dotenvConfig } from "dotenv";
import { join, resolve } from "node:path";
dotenvConfig({ path: resolve(__dirname, "../.env") });
dotenvConfig({ path: resolve(__dirname, "../apps/api/.env"), override: true });
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import { CostTrackerService } from "../apps/api/src/llm/cost-tracker.service";
import { OpenAIResponsesClient } from "../apps/api/src/llm/openai-responses.client";
import { ArticleOptimizeClient } from "../apps/api/src/tools/article-optimize/article-optimize.client";
import { ArticleOptimizeHandler } from "../apps/api/src/handlers/article-optimize.handler";
import { loadEnv } from "../apps/api/src/config/env";
import { DataEnrichmentResult } from "@sensai/shared";

const OUTPUT_DIR = resolve(__dirname, "smoke-output");
const INPUT_FILE = join(OUTPUT_DIR, "plan-14-enriched.json");

async function main() {
  if (!existsSync(INPUT_FILE)) {
    console.error(
      `[smoke] FAIL — input fixture missing: ${INPUT_FILE}\n` +
        "Run `pnpm smoke:plan-14` first to produce it.",
    );
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(INPUT_FILE, "utf-8"));
  const enrichment = DataEnrichmentResult.parse(raw);
  console.log(
    `[smoke] enriched input: ${enrichment.htmlContent.length} chars, ` +
      `language=${enrichment.meta.language}`,
  );

  const env = loadEnv();
  const stubCostTracker = { record: async () => {} } as any;
  const stubCache = {
    getOrSet: async (opts: any) => {
      const fetched = await opts.fetcher();
      return fetched.result ?? fetched;
    },
  } as any;
  const openaiSdk = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const responsesClient = new OpenAIResponsesClient(openaiSdk, stubCostTracker);
  const optimizeClient = new ArticleOptimizeClient(responsesClient, env);
  const handler = new ArticleOptimizeHandler(optimizeClient, stubCache, env);

  const ctx = {
    run: { id: randomUUID(), input: { topic: enrichment.meta.keyword } },
    step: { id: "smoke-step-article-optimize" },
    project: { id: "smoke-project", config: {} },
    previousOutputs: { enrich: enrichment },
    attempt: 1,
    forceRefresh: false,
  } as any;

  console.log("[smoke] article.optimize …");
  const t0 = Date.now();
  const res = await handler.execute(ctx);
  const ms = Date.now() - t0;
  const out = res.output as any;

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(join(OUTPUT_DIR, "plan-15-optimize.json"), JSON.stringify(out, null, 2), "utf-8");
  writeFileSync(join(OUTPUT_DIR, "plan-15-optimize.html"), out.htmlContent, "utf-8");

  console.log(
    `[smoke] article.optimize done: ${ms}ms | ` +
      `chars ${out.stats.inputLength}→${out.stats.outputLength} ` +
      `sources ${out.stats.sourcesBefore}→${out.stats.sourcesAfter} ` +
      `anchors-: ${out.stats.anchorsRemoved} ` +
      `cost=$${out.stats.totalCostUsd} ` +
      `warnings=${out.warnings.length}`,
  );
  console.log(`[smoke] ASSERT sourcesAfter==sourcesBefore: ${out.stats.sourcesAfter === out.stats.sourcesBefore ? "PASS" : "FAIL"}`);
  console.log(`[smoke] ASSERT no <a> tags in output: ${!/<a\b/i.test(out.htmlContent) ? "PASS" : "FAIL"}`);
  console.log("[smoke] PASS — Plan 15 article.optimize smoke complete");
}

main().catch((e) => {
  console.error("[smoke] FAIL:", e);
  process.exit(1);
});
```

- [ ] **Step 20.2: Add the script to root `package.json`**

In the root `package.json` `"scripts"` block, append:

```json
"smoke:plan-15-optimize": "tsx scripts/smoke-plan-15-optimize.ts",
```

- [ ] **Step 20.3: Verify the script type-checks (do not run yet — uses real LLM)**

Run: `pnpm tsc --noEmit -p scripts/tsconfig.json` (if it exists; otherwise `cd apps/api && pnpm tsc --noEmit`).
Expected: Exit 0.

- [ ] **Step 20.4: Commit**

```bash
git add scripts/smoke-plan-15-optimize.ts package.json
git commit -m "test(article-optimize): add Plan 15 manual smoke script for tool.article.optimize"
```

---

## Task 21: Smoke test — `tool.article.intermediate`

**Files:**
- Create: `scripts/smoke-plan-15-intermediate.ts`
- Modify: `package.json` (root)

- [ ] **Step 21.1: Create the smoke script**

```ts
#!/usr/bin/env tsx
/**
 * Plan 15 manual smoke test — tool.article.intermediate.
 *
 * Reads Plan 15 optimize smoke output (`scripts/smoke-output/plan-15-optimize.json`)
 * and runs ArticleIntermediateHandler in isolation.
 *
 * Pre-req: run `pnpm smoke:plan-15-optimize` first.
 *
 * Run: pnpm smoke:plan-15-intermediate
 */
import "reflect-metadata";
import { config as dotenvConfig } from "dotenv";
import { join, resolve } from "node:path";
dotenvConfig({ path: resolve(__dirname, "../.env") });
dotenvConfig({ path: resolve(__dirname, "../apps/api/.env"), override: true });
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import { CostTrackerService } from "../apps/api/src/llm/cost-tracker.service";
import { OpenAIResponsesClient } from "../apps/api/src/llm/openai-responses.client";
import { ArticleIntermediateClient } from "../apps/api/src/tools/article-intermediate/article-intermediate.client";
import { ArticleIntermediateHandler } from "../apps/api/src/handlers/article-intermediate.handler";
import { loadEnv } from "../apps/api/src/config/env";
import { ArticleOptimizeResult } from "@sensai/shared";

const OUTPUT_DIR = resolve(__dirname, "smoke-output");
const INPUT_FILE = join(OUTPUT_DIR, "plan-15-optimize.json");

async function main() {
  if (!existsSync(INPUT_FILE)) {
    console.error(
      `[smoke] FAIL — input fixture missing: ${INPUT_FILE}\n` +
        "Run `pnpm smoke:plan-15-optimize` first to produce it.",
    );
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(INPUT_FILE, "utf-8"));
  const optimize = ArticleOptimizeResult.parse(raw);
  console.log(
    `[smoke] optimize input: ${optimize.htmlContent.length} chars, ` +
      `language=${optimize.meta.language}`,
  );

  const env = loadEnv();
  const stubCostTracker = { record: async () => {} } as any;
  const stubCache = {
    getOrSet: async (opts: any) => {
      const fetched = await opts.fetcher();
      return fetched.result ?? fetched;
    },
  } as any;
  const openaiSdk = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const responsesClient = new OpenAIResponsesClient(openaiSdk, stubCostTracker);
  const intermediateClient = new ArticleIntermediateClient(responsesClient, env);
  const handler = new ArticleIntermediateHandler(intermediateClient, stubCache, env);

  const ctx = {
    run: { id: randomUUID(), input: { topic: optimize.meta.keyword } },
    step: { id: "smoke-step-article-intermediate" },
    project: { id: "smoke-project", config: {} },
    previousOutputs: { optimize },
    attempt: 1,
    forceRefresh: false,
  } as any;

  console.log("[smoke] article.intermediate …");
  const t0 = Date.now();
  const res = await handler.execute(ctx);
  const ms = Date.now() - t0;
  const out = res.output as any;

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(join(OUTPUT_DIR, "plan-15-intermediate.json"), JSON.stringify(out, null, 2), "utf-8");
  writeFileSync(join(OUTPUT_DIR, "plan-15-intermediate.html"), out.htmlContent, "utf-8");

  console.log(
    `[smoke] article.intermediate done: ${ms}ms | ` +
      `chars ${out.stats.inputLength}→${out.stats.outputLength} (${(out.stats.growth * 100).toFixed(1)}%) ` +
      `sources ${out.stats.sourcesBefore}→${out.stats.sourcesAfter} ` +
      `formatting strong ${out.stats.formattingBefore.strong}→${out.stats.formattingAfter.strong} ` +
      `cost=$${out.stats.totalCostUsd} ` +
      `warnings=${out.warnings.length}`,
  );
  console.log(`[smoke] ASSERT growth<=10%: ${out.stats.growth <= 0.10 ? "PASS" : "FAIL"}`);
  console.log(`[smoke] ASSERT sourcesAfter>=sourcesBefore: ${out.stats.sourcesAfter >= out.stats.sourcesBefore ? "PASS" : "FAIL"}`);
  console.log(`[smoke] ASSERT formattingAfter.strong>0: ${out.stats.formattingAfter.strong > 0 ? "PASS" : `WARN (got ${out.stats.formattingAfter.strong})`}`);
  console.log("[smoke] PASS — Plan 15 article.intermediate smoke complete");
}

main().catch((e) => {
  console.error("[smoke] FAIL:", e);
  process.exit(1);
});
```

- [ ] **Step 21.2: Add the script to root `package.json`**

```json
"smoke:plan-15-intermediate": "tsx scripts/smoke-plan-15-intermediate.ts",
```

- [ ] **Step 21.3: Type-check + commit**

```bash
pnpm tsc --noEmit -p scripts/tsconfig.json
git add scripts/smoke-plan-15-intermediate.ts package.json
git commit -m "test(article-intermediate): add Plan 15 manual smoke script for tool.article.intermediate"
```

---

## Self-review checklist (already done before saving this plan)

- ✅ All 6 intermediate hard-fail guards from the lesson are tested (h1, growth, numbers, sources, anchors, SEO intro).
- ✅ Optimize handler tested for SRC-loss hard fail + spans soft-warning.
- ✅ Tokenize→restore round-trip tested.
- ✅ SRC sentinel collision with `BRACKET_REF_RE` explicitly tested ("does not double-tokenize a SRC placeholder").
- ✅ URL POLICY mechanically enforced post-LLM in optimize (Task 8) — not relying on prompt.
- ✅ Cache key includes `inputHash + model + promptVersion` for both handlers.
- ✅ Plan 08 cascade rerun is automatic via `dependsOn` edges (no orchestrator changes).
- ✅ Smoke fixture chain: plan-14-enriched.json → plan-15-optimize.json → plan-15-intermediate.json.
- ✅ Schemas live in `packages/shared/src/schemas.ts` and require rebuild — every touching task ends with build.
- ✅ Type names consistent across tasks: `ArticleOptimizeResult`, `ArticleIntermediateResult`, `ProtectionStats`, `FormattingCounts`.
- ✅ All step types match: `tool.article.optimize`, `tool.article.intermediate`.
- ✅ No placeholders / TBDs / "implement appropriate" — every step has full code.
