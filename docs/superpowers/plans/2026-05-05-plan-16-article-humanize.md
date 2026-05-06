# Plan 16 — Article Humanize Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third sequential post-production pipeline step `tool.article.humanize` that operates on Plan 15's `ArticleIntermediateResult.htmlContent`. The step rewrites the article using the v3.3 anti-AI ruleset (20 rules across 4 tiers — banned vocabulary, signpost transitions, sentence-rhythm CV, opener/closer rules, parenthetical asides, active voice, filler elimination, sentence-starter diversity, natural punctuation, density variation, no chatbot artefacts, consistent register, personal pronouns, tense mixing, proper-noun density, passive-voice limit, rhetorical questions). Two-pass execution: a humanization pass against the verbatim 20-rule prompt, plus a conditional readability retry when ASL or sentence-cap thresholds are missed. Hard-fail guards protect data integrity (numbers, sources, anchors, length); style metrics (CV, English-probe, span drift) are warn-only.

**Architecture:** A new handler `ArticleHumanizeHandler` reads `previousOutputs.intermediate`, parses it as `ArticleIntermediateResult`, and delegates to `ArticleHumanizeClient`. The client reuses the existing `article-protect` package verbatim (`tokenizeHybrid`, `restoreHybrid`, `extractPlainText`, `extractNumberSet`, `hasH1Tag`, `hasAnchorTags`, `SOURCE_CITATION_RE`) — no new tokenize logic. New humanize-specific concerns live in a small co-located metrics module `article-humanize.metrics.ts` (sentence variance, length range, ASL, long-sentence count, bold share, English-probe, retry decision). The client orchestrates: tokenize → LLM-1 (20 rules) → restore → em-dash cleanup → metrics → conditional LLM-2 (retry) on a freshly tokenized humanized HTML → restore → reject retry if it adds anchors → final guards. Hard-fail guards mirror Plan 15 intermediate (h1 missing, lost numbers, sources count drop, added anchor) plus a length-ratio bound on both sides (`[MIN_LEN_RATIO, MAX_LEN_RATIO]`, default `[0.80, 1.20]`). Cache + cost tracking follow the Plan 14/15 pattern verbatim. UI renderer mirrors Plan 15 (`<iframe srcDoc sandbox="allow-same-origin">`).

**Tech Stack:** TypeScript / NestJS / Zod / Vitest / cheerio / `openai` SDK ≥ 6.35 (Responses API, model `gpt-5.2`) / existing `OpenAIResponsesClient` and `article-protect` package reused as-is.

**Lesson sources:**
- `docs/edu/lekcja-3-5/3.5-humanizacja-tresci.md` (lesson notes — perplexity, burstiness, the 4 tiers)
- `docs/edu/lekcja-3-5/T3F5-prompt_humanizacja.md` (verbatim 20-rule prompt with `{{LANGUAGE}}`, `{{NUMBER_SAFETY_NOTE}}`, `{{SOURCE_CITATION_NOTE}}`, `{{ASL_*}}`, `{{*_STRONG_PER_BLOCK}}`, `{{STRONG_WORDS_PER_BLOCK}}`, `{{SENTENCE_HARD_CAP}}` placeholders)
- `docs/edu/lekcja-3-5/T3F5-article_humanization_file.py` (Python reference — mirror its retry trigger, retry-prompt body, em-dash cleanup, warn-only language probe)
- `docs/edu/lekcja-3-5/T3F5-output_intermediate.html` (sample input — used as fixture for Task 13 smoke; equivalent to a Plan 15 intermediate output)
- `docs/edu/lekcja-3-5/T3F5-article_humanized.html` + `T3F5-article_humanized_metrics.json` (reference output benchmark — ASL ≈ 11.6, bold_share ≈ 7%, ratio ≈ 1.067, 0 warnings, 6/6 sources preserved)

---

## Critical gotchas

**Gotcha 1 — Shared package build:** `packages/shared` must be **rebuilt** (`pnpm --filter @sensai/shared build`) after every change to `schemas.ts`. The API imports from compiled `dist/`, not `src/`. Every task that touches `packages/shared/src/schemas.ts` ends with a build step. Same as Plan 14/15.

**Gotcha 2 — `previousOutputs.intermediate` is the source of truth:** New template adds `{ key: "humanize", type: "tool.article.humanize", dependsOn: ["intermediate"] }`. The orchestrator hydrates `previousOutputs` keyed by step **key**, so the humanize handler reads `ctx.previousOutputs.intermediate` (parses with `ArticleIntermediateResult`). Fail closed if missing/invalid — throw `Error("article.humanize requires previousOutputs.intermediate")`, mirroring Plan 15.

**Gotcha 3 — REUSE article-protect, do NOT reimplement:** Plan 15 already wrote a battle-tested `tokenizeHybrid` / `restoreHybrid` / `extractPlainText` / `extractNumberSet` / `hasH1Tag` / `hasAnchorTags` / `SOURCE_CITATION_RE`. The Python reference uses simpler regex-only `[[NUM_X]]` markers — but our project has graduated to span-based protection. Use the existing module verbatim. Do not introduce a second protection scheme.

**Gotcha 4 — The 20-rule prompt's `[[NUM_X]]` language must be translated to span-based language:** The Python prompt's `### NUMBER SAFETY` says "Keep all `[[NUM_X]]` markers exactly as-is and in-place." But our protection wraps numbers in `<span data-token-id="...">N</span>`. The TS `buildHumanizeSystemPrompt` MUST emit span-based wording instead, identical to the Plan 15 intermediate prompt: "Keep ALL `<span data-token-id="...">...</span>` tags intact. Do NOT modify content inside spans." Same for sources: `[[SRC_xxx]]` placeholders stay verbatim.

**Gotcha 5 — Two-pass retry MUST re-tokenize the humanized HTML:** After Phase 1 LLM returns, we restore tokens (so we can measure metrics on the real text) and check whether retry is needed. If yes, we re-tokenize the humanized HTML BEFORE calling the retry LLM (new `srcMap`/`spanMap` per call). Skipping the re-tokenize step would expose raw numbers/sources to the second LLM, defeating the protection. Mirror the Python script's `protect_sources(humanized) → protect_numbers(...)` order.

**Gotcha 6 — Retry rejection on anchor regression:** The Python script accepts a retry only if it does NOT add `<a>` tags. We mirror this: after retry restore, check `hasAnchorTags(retried) || (anchorsBefore === 0 && hasAnchorTags(retried))`. The simpler invariant we enforce: input had zero anchors (it came from Plan 15 optimize/intermediate which strip anchors), so any anchor in the retry output is a regression — discard the retry and keep the Phase-1 output.

**Gotcha 7 — Em-dash cleanup is the LAST mutation before guards:** The Python script collapses `—` (`—`) to ` - ` after restore. Apply this transform on the FINAL humanized HTML (after Phase 1, after optional retry, before guards run). Doing it before metrics/retry would change ASL (subtly — em-dash becomes a separate word once split) and double-spacing rules. Only the final HTML gets cleaned.

**Gotcha 8 — HARD FAIL on missing SRC, SOFT WARNING on missing spans:** Inherit Plan 15's guard hierarchy. Missing SRC → throw `Error("article.humanize: source placeholder lost: …")`. Missing spans → push warning, continue. The retry path: missing SRC after retry → discard retry (do not throw — Phase-1 output is still valid).

**Gotcha 9 — Hard-fail guards (five, all blocking):**
1. **Missing `<h1>`** — model dropped the title.
2. **Length ratio out-of-range** — `output.length / input.length` (plain text) outside `[ARTICLE_HUMANIZE_MIN_LEN_RATIO, ARTICLE_HUMANIZE_MAX_LEN_RATIO]`. Default `[0.80, 1.20]`. Note: this is BOTH-SIDED (humanization can shrink or grow) — unlike Plan 15 intermediate which only bounds growth.
3. **Lost numbers** — `extractNumberSet(input) - extractNumberSet(output)` is non-empty (set difference, mirror Plan 15).
4. **Lost source citations** — `SOURCE_CITATION_RE.findall(output).length < SOURCE_CITATION_RE.findall(input).length`.
5. **Added `<a>` tags** — output contains `<a` (any). Input is anchor-free per Plan 15 optimize, so any anchor is a regression.

**Gotcha 10 — Warn-only style checks (four, never blocking):**
1. **`humanize_spans_missing`** — number/date spans lost during restore.
2. **`humanize_language_probe`** — for `lang === "pl"`, count occurrences of common English connectors (` the `, ` and `, ` this `, ` that `, ` however `) in first 1000 chars of plain text. If sum > 8, warn. Mirror Python.
3. **`humanize_low_burstiness`** — coefficient of variation (CV) of sentence lengths in humanized output is ≤ 0.45. The lesson's strongest signal — but warn-only because the model is asked to vary; we don't fail on it.
4. **`humanize_retry_used`** — Phase 2 retry was triggered (informational only).

**Gotcha 11 — Retry trigger condition is OR-based, mirroring Python:** Trigger Phase 2 if ANY of these are true on the humanized HTML:
- `metrics.avgSentenceLength > ARTICLE_HUMANIZE_ASL_MAX` (default `20`), OR
- `metrics.longSentencesGtCap > 0` (sentences with word count > `SENTENCE_HARD_CAP`, default `24`), OR
- `metrics.strongSpans < ARTICLE_HUMANIZE_MIN_STRONG_PER_BLOCK` (default `1`).

Retry is gated by `ARTICLE_HUMANIZE_RETRY_ENABLED` (default `true`). If disabled OR no trigger, skip Phase 2.

**Gotcha 12 — Sentence splitting is regex-based, not NLP:** Both Python and our TS port split on `[.!?]+` followed by whitespace. This is fine for Polish/English but undercounts where ellipses or abbreviations appear. The metrics are advisory. We document this in the metrics module's header.

**Gotcha 13 — Bold share calculation uses tokens not characters:** `bold_share = bold_token_count / words_total`. Python uses `_tokens` (word regex `\b[\w\-]+\b`). Mirror the calculation: count words inside `<strong>...</strong>` spans, divide by total words in plain text. Test specifically with a fixture that has `<strong>two words</strong>` in a 50-word article — bold share should be `2 / 50 = 0.04`.

**Gotcha 14 — `OpenAIResponsesClient.createBlock` is reused as-is — NO modification:** The existing client takes `system` + `input`. Phase 1 calls it with `system = build20RulePrompt(...)` and `input = protectedHtml`. Phase 2 calls it with `system = buildRetryPrompt(...)` and `input = retokenizedHumanizedHtml`. No new client method. No `previousResponseId` (no chaining). Default `reasoning: { effort: "medium" }` for both phases.

**Gotcha 15 — Phase 2 cost tracks separately but folds into total:** Both phases call `cost.record(...)` (the `OpenAIResponsesClient` does this internally). The handler exposes `stats.totalCostUsd` as a string-decimal sum of phase-1 + phase-2 costs (use `Big.js`-style addition? — no, simpler: parse to number, add, format with 6 decimals). Same for `totalLatencyMs` (integer sum). Test with two cost values like `"0.001234"` + `"0.000567"` → `"0.001801"`.

**Gotcha 16 — Cache key includes prompt version:** Carry `const PROMPT_VERSION = "v1"` at the top of `article-humanize.handler.ts`, threaded into the cache `params` object. The cache key only sees `inputHash` (sha256 of input HTML) + `model` + `promptVersion`. Bumping the prompt requires bumping this string — otherwise the cache returns stale humanized HTML for a now-different prompt. Same pattern as Plan 14/15.

**Gotcha 17 — Plan 08 cascade rerun is automatic:** `humanize.dependsOn = ["intermediate"]`. Re-running `intermediate` cascades to `humanize`. Re-running `optimize` cascades to `intermediate` AND `humanize` (transitively). No new orchestrator code needed — just the dependsOn edge.

**Gotcha 18 — UI iframe sandbox pattern is mandatory:** The renderer reuses the `<iframe srcDoc sandbox="allow-same-origin">` pattern from Plan 13/14/15. NEVER `dangerouslySetInnerHTML`. Inline a small stylesheet for readability (h1/h2/h3/p/strong/blockquote/br/i/em). The header chip shows: keyword, language, model, promptVersion, char count, ratio, ASL, CV, bold_share, retry-used flag, source preservation, cost, latency.

**Gotcha 19 — Smoke fixture chain:** `smoke-plan-16.ts` reads `scripts/smoke-output/plan-15-intermediate.json` (must exist; abort with clear message). It writes `plan-16-humanize.json` (full result) and `plan-16-humanize.html` (just `htmlContent`) to `smoke-output/`. Reuse the Plan 15 stub pattern: pass-through `ToolCacheService` + real `OpenAIResponsesClient`. Compare metrics against the lesson benchmarks (`T3F5-article_humanized_metrics.json`) — soft assertion (PASS/WARN), do not gate on numbers.

**Gotcha 20 — Polish-language probe is intentionally crude:** The Python probe matches occurrences of literal English words inside the first 1000 plain-text chars. Five tokens (` the `, ` and `, ` this `, ` that `, ` however `), threshold 8 total occurrences. False positives on Polish text containing legitimate English (e.g. brand names) are tolerated; this is a sanity check for the model accidentally switching to English, not a hard guarantee. Document the limit.

---

## File Structure

```
apps/api/
└── src/
    ├── llm/
    │   └── openai-responses.client.ts            (UNCHANGED — reused as-is)
    │
    ├── tools/
    │   ├── article-protect/                      (UNCHANGED — reused as-is)
    │   │
    │   └── article-humanize/                     (NEW)
    │       ├── article-humanize.client.ts        Orchestrates tokenize → LLM-1 → restore → metrics → optional re-tokenize+LLM-2 → em-dash cleanup → guards → build HumanizeResult
    │       ├── article-humanize.metrics.ts       Sentence stats, ASL, long-sentence count, bold share, CV, English-probe, retry decision (pure functions)
    │       └── article-humanize.module.ts        NestJS DI (re-exports OPENAI_RESPONSES_SDK provider + ARTICLE_HUMANIZE_ENV)
    │
    ├── prompts/
    │   ├── article-humanize.prompt.ts            (NEW) buildHumanizeSystemPrompt({ language, asl_min, asl_max, sentence_hard_cap, min_strong_per_block, max_strong_per_block, strong_words_per_block }) and buildHumanizeRetryPrompt({ asl_min, asl_max, sentence_hard_cap, min_strong_per_block, max_strong_per_block, strong_words_per_block })
    │
    ├── handlers/
    │   ├── article-humanize.handler.ts           (NEW) StepHandler "tool.article.humanize"
    │   └── handlers.module.ts                    (MODIFY) register handler + ENV token + module
    │
    ├── config/env.ts                             (MODIFY) 9 new ENVs (see Task 2)
    │
    ├── seed/seed.ts                              (MODIFY) add Plan 16 template variant (extends Plan 15 intermediate template with humanize step)
    │
    └── tests/
        ├── article-humanize.metrics.test.ts      (NEW)
        ├── article-humanize.client.test.ts       (NEW)
        ├── article-humanize.prompt.test.ts       (NEW)
        └── article-humanize.handler.test.ts      (NEW)

packages/shared/src/schemas.ts                    (MODIFY) append Plan 16 schemas
packages/shared/dist/                              (REBUILT)

apps/web/src/components/step-output/
├── article-humanize.tsx                          (NEW) ArticleHumanizeOutput renderer
└── index.tsx                                     (MODIFY) add tool.article.humanize routing + hasRichRenderer

scripts/
└── smoke-plan-16.ts                              (NEW) Real-LLM smoke for humanize
package.json (root)                               (MODIFY) add "smoke:plan-16"
```

No new runtime dependencies. One new env DI token: `ARTICLE_HUMANIZE_HANDLER_ENV` (used by handler) and `ARTICLE_HUMANIZE_ENV` (used by client, narrower slice). Same dual-token split that Plan 15 uses.

---

## Task 1: Shared schemas — `ArticleHumanizeResult`

**Files:**
- Modify: `packages/shared/src/schemas.ts` (append at end)
- Build: `packages/shared` (must produce `dist/`)

No unit tests in this task — runtime tests in later tasks exercise the schemas via `.parse()`.

- [ ] **Step 1.1: Append Plan 16 schemas at end of `packages/shared/src/schemas.ts`**

Append after the last existing export (current last is the Plan 15 `ArticleIntermediateResult` block). Reuse `ArticlePostProductionMeta` and `ProtectionStats` from Plan 15 — do NOT redeclare.

```ts
// ===== Plan 16 — Article Humanize =====

export const ArticleHumanizeWarning = z.object({
  kind: z.enum([
    "humanize_spans_missing",
    "humanize_language_probe",
    "humanize_low_burstiness",
    "humanize_retry_used",
    "humanize_retry_rejected_anchors",
  ]),
  message: z.string().min(1),
  context: z.record(z.string()).default({}),
});
export type ArticleHumanizeWarning = z.infer<typeof ArticleHumanizeWarning>;

export const ArticleHumanizeReadability = z.object({
  wordsTotal: z.number().int().nonnegative(),
  sentencesTotal: z.number().int().nonnegative(),
  avgSentenceLength: z.number().nonnegative(),
  longSentencesGtCap: z.number().int().nonnegative(),
  strongSpans: z.number().int().nonnegative(),
  boldTokenCount: z.number().int().nonnegative(),
  boldShare: z.number().nonnegative(),
});
export type ArticleHumanizeReadability = z.infer<typeof ArticleHumanizeReadability>;

export const ArticleHumanizeSentenceStats = z.object({
  varianceInput: z.number().nonnegative(),
  varianceOutput: z.number().nonnegative(),
  cvOutput: z.number().nonnegative(),
  minLength: z.number().int().nonnegative(),
  maxLength: z.number().int().nonnegative(),
  avgLength: z.number().nonnegative(),
});
export type ArticleHumanizeSentenceStats = z.infer<typeof ArticleHumanizeSentenceStats>;

export const ArticleHumanizeStats = z.object({
  inputLength: z.number().int().nonnegative(),
  outputLength: z.number().int().nonnegative(),
  ratio: z.number().nonnegative(),
  sourcesBefore: z.number().int().nonnegative(),
  sourcesAfter: z.number().int().nonnegative(),
  emDashesReplaced: z.number().int().nonnegative(),
  retryUsed: z.boolean(),
  retryAccepted: z.boolean(),
  readability: ArticleHumanizeReadability,
  sentence: ArticleHumanizeSentenceStats,
  totalCostUsd: z.string(),
  totalLatencyMs: z.number().int().nonnegative(),
});
export type ArticleHumanizeStats = z.infer<typeof ArticleHumanizeStats>;

export const ArticleHumanizeResult = z.object({
  meta: ArticlePostProductionMeta,
  htmlContent: z.string().min(1),
  stats: ArticleHumanizeStats,
  protection: ProtectionStats,
  warnings: ArticleHumanizeWarning.array(),
});
export type ArticleHumanizeResult = z.infer<typeof ArticleHumanizeResult>;
```

- [ ] **Step 1.2: Build the shared package**

Run: `pnpm --filter @sensai/shared build`
Expected: Exit 0, `packages/shared/dist/schemas.js` and `.d.ts` updated. Confirm `ArticleHumanizeResult` is exported from `packages/shared/dist/schemas.d.ts`.

- [ ] **Step 1.3: Commit**

```bash
git add packages/shared/src/schemas.ts packages/shared/dist
git commit -m "feat(shared): add Plan 16 article humanize schemas"
```

---

## Task 2: Env vars — `ARTICLE_HUMANIZE_*`

**Files:**
- Modify: `apps/api/src/config/env.ts`
- Modify: `apps/api/.env.example` (if it exists)

- [ ] **Step 2.1: Locate the Plan 15 env var block**

Read `apps/api/src/config/env.ts`. The Plan 15 block ends with `ARTICLE_INTERMEDIATE_MAX_GROWTH` around line 124. Insert the Plan 16 block AFTER that line, BEFORE `OUTLINE_COVERAGE_MIN_WARNING`.

Add exactly:

```ts
  // ----- Plan 16 — Article Humanize -----
  ARTICLE_HUMANIZE_MODEL: z.string().default("gpt-5.2"),
  ARTICLE_HUMANIZE_TTL_DAYS: z.coerce.number().int().nonnegative().default(7),
  ARTICLE_HUMANIZE_ASL_MIN: z.coerce.number().int().positive().default(12),
  ARTICLE_HUMANIZE_ASL_MAX: z.coerce.number().int().positive().default(20),
  ARTICLE_HUMANIZE_SENTENCE_HARD_CAP: z.coerce.number().int().positive().default(24),
  ARTICLE_HUMANIZE_MIN_STRONG_PER_BLOCK: z.coerce.number().int().nonnegative().default(1),
  ARTICLE_HUMANIZE_MAX_STRONG_PER_BLOCK: z.coerce.number().int().positive().default(4),
  ARTICLE_HUMANIZE_STRONG_WORDS_PER_BLOCK: z.coerce.number().int().positive().default(500),
  ARTICLE_HUMANIZE_BOLD_SHARE_MAX: z.coerce.number().nonnegative().default(0.08),
  ARTICLE_HUMANIZE_MIN_LEN_RATIO: z.coerce.number().nonnegative().default(0.80),
  ARTICLE_HUMANIZE_MAX_LEN_RATIO: z.coerce.number().nonnegative().default(1.20),
  ARTICLE_HUMANIZE_RETRY_ENABLED: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === "boolean" ? v : v.toLowerCase() === "true"))
    .default(true),
  ARTICLE_HUMANIZE_LANG_PROBE_THRESHOLD: z.coerce.number().int().nonnegative().default(8),
```

- [ ] **Step 2.2: If `apps/api/.env.example` exists, append the same vars with example values**

```
ARTICLE_HUMANIZE_MODEL=gpt-5.2
ARTICLE_HUMANIZE_TTL_DAYS=7
ARTICLE_HUMANIZE_ASL_MIN=12
ARTICLE_HUMANIZE_ASL_MAX=20
ARTICLE_HUMANIZE_SENTENCE_HARD_CAP=24
ARTICLE_HUMANIZE_MIN_STRONG_PER_BLOCK=1
ARTICLE_HUMANIZE_MAX_STRONG_PER_BLOCK=4
ARTICLE_HUMANIZE_STRONG_WORDS_PER_BLOCK=500
ARTICLE_HUMANIZE_BOLD_SHARE_MAX=0.08
ARTICLE_HUMANIZE_MIN_LEN_RATIO=0.80
ARTICLE_HUMANIZE_MAX_LEN_RATIO=1.20
ARTICLE_HUMANIZE_RETRY_ENABLED=true
ARTICLE_HUMANIZE_LANG_PROBE_THRESHOLD=8
```

- [ ] **Step 2.3: Verify env loads**

Run: `cd apps/api && pnpm tsc --noEmit`
Expected: Exit 0 (type-check passes; no usage yet).

- [ ] **Step 2.4: Commit**

```bash
git add apps/api/src/config/env.ts apps/api/.env.example
git commit -m "feat(api): add Plan 16 env vars for article humanize"
```

---

## Task 3: Humanize metrics module — sentence stats + readability + warn-checks

**Files:**
- Create: `apps/api/src/tools/article-humanize/article-humanize.metrics.ts`
- Test: `apps/api/src/tests/article-humanize.metrics.test.ts`

- [ ] **Step 3.1: Write the failing test**

Create `apps/api/src/tests/article-humanize.metrics.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  computeSentenceStats,
  computeReadability,
  englishProbeHits,
  shouldRetry,
  formatBoldShare,
} from "../tools/article-humanize/article-humanize.metrics";

describe("computeSentenceStats", () => {
  it("returns zeros on empty text", () => {
    const s = computeSentenceStats("");
    expect(s.varianceOutput).toBe(0);
    expect(s.cvOutput).toBe(0);
    expect(s.minLength).toBe(0);
    expect(s.maxLength).toBe(0);
    expect(s.avgLength).toBe(0);
  });

  it("computes variance and CV for varied sentences", () => {
    // 3 sentences with 4 / 8 / 14 word counts → mean 8.667, sample variance ≈ 25.33,
    // stddev ≈ 5.033, cv ≈ 0.581.
    const text =
      "Krótko bardzo szybkie zdanie. " +
      "Średniej długości zdanie z paroma słowami w rzędzie. " +
      "Długie zdanie wielowątkowe które ma wiele słów subordynowanych w sobie i ciągnie się dalej.";
    const s = computeSentenceStats(text);
    expect(s.minLength).toBe(4);
    expect(s.maxLength).toBe(14);
    expect(s.avgLength).toBeCloseTo(8.67, 1);
    expect(s.cvOutput).toBeGreaterThan(0.4);
  });

  it("handles single sentence (variance = 0, cv = 0)", () => {
    const s = computeSentenceStats("Jedno krótkie zdanie tylko.");
    expect(s.varianceOutput).toBe(0);
    expect(s.cvOutput).toBe(0);
    expect(s.avgLength).toBe(4);
  });
});

describe("computeReadability", () => {
  it("counts words, sentences, ASL, strong spans, bold share", () => {
    const html =
      "<h1>T</h1>" +
      "<p>Pierwsze zdanie z czterema słowami.</p>" +
      "<p>Drugie <strong>kluczowe pojęcie</strong> w tekście.</p>";
    const r = computeReadability(html, /* sentenceHardCap */ 24);
    expect(r.wordsTotal).toBeGreaterThan(8);
    expect(r.sentencesTotal).toBe(2);
    expect(r.strongSpans).toBe(1);
    expect(r.boldTokenCount).toBe(2); // "kluczowe pojęcie"
    expect(r.boldShare).toBeCloseTo(2 / r.wordsTotal, 3);
    expect(r.longSentencesGtCap).toBe(0);
  });

  it("counts long sentences over hard cap", () => {
    const html = "<p>" + Array.from({ length: 30 }, (_, i) => `słowo${i}`).join(" ") + ".</p>";
    const r = computeReadability(html, 24);
    expect(r.longSentencesGtCap).toBe(1);
  });
});

describe("englishProbeHits", () => {
  it("returns 0 for clean Polish text", () => {
    const text = "Kortyzol to hormon stresu produkowany przez nadnercza w odpowiedzi na napięcie nerwowe.";
    expect(englishProbeHits(text)).toBe(0);
  });

  it("counts English connector tokens", () => {
    // Non-overlapping occurrences (countOccurrences advances by needle length, so
    // adjacent " the the " would only count once). " the " ×2 + " and " ×2 +
    // " this " ×2 + " that " ×2 + " however " ×1 = 9.
    const text = " the x and x this x that x however x the x and x this x that ";
    expect(englishProbeHits(text)).toBeGreaterThanOrEqual(8);
  });
});

describe("shouldRetry", () => {
  const baseConfig = {
    asl_max: 20,
    sentence_hard_cap: 24,
    min_strong_per_block: 1,
    retry_enabled: true,
  };

  it("returns false when all metrics are within bounds", () => {
    const ok = shouldRetry(
      {
        avgSentenceLength: 14,
        longSentencesGtCap: 0,
        strongSpans: 5,
        wordsTotal: 500,
        sentencesTotal: 30,
        boldTokenCount: 10,
        boldShare: 0.02,
      },
      baseConfig,
    );
    expect(ok.retry).toBe(false);
  });

  it("returns true when ASL too high", () => {
    const ok = shouldRetry(
      {
        avgSentenceLength: 22,
        longSentencesGtCap: 0,
        strongSpans: 5,
        wordsTotal: 500,
        sentencesTotal: 20,
        boldTokenCount: 10,
        boldShare: 0.02,
      },
      baseConfig,
    );
    expect(ok.retry).toBe(true);
    expect(ok.reasons).toContain("asl");
  });

  it("returns true when long sentences exceed cap", () => {
    const ok = shouldRetry(
      {
        avgSentenceLength: 14,
        longSentencesGtCap: 2,
        strongSpans: 5,
        wordsTotal: 500,
        sentencesTotal: 30,
        boldTokenCount: 10,
        boldShare: 0.02,
      },
      baseConfig,
    );
    expect(ok.retry).toBe(true);
    expect(ok.reasons).toContain("long");
  });

  it("returns true when strong spans below min", () => {
    const ok = shouldRetry(
      {
        avgSentenceLength: 14,
        longSentencesGtCap: 0,
        strongSpans: 0,
        wordsTotal: 500,
        sentencesTotal: 30,
        boldTokenCount: 0,
        boldShare: 0,
      },
      baseConfig,
    );
    expect(ok.retry).toBe(true);
    expect(ok.reasons).toContain("strong");
  });

  it("returns false when retry is disabled even if triggers fire", () => {
    const ok = shouldRetry(
      {
        avgSentenceLength: 25,
        longSentencesGtCap: 5,
        strongSpans: 0,
        wordsTotal: 500,
        sentencesTotal: 20,
        boldTokenCount: 0,
        boldShare: 0,
      },
      { ...baseConfig, retry_enabled: false },
    );
    expect(ok.retry).toBe(false);
  });
});

describe("formatBoldShare", () => {
  it("formats to 4 decimal places", () => {
    expect(formatBoldShare(0.0706123)).toBe("0.0706");
  });
});
```

- [ ] **Step 3.2: Run test to verify it fails**

Run: `pnpm --filter @sensai/api vitest run src/tests/article-humanize.metrics.test.ts`
Expected: FAIL — module `article-humanize.metrics` not found.

- [ ] **Step 3.3: Write minimal implementation**

Create `apps/api/src/tools/article-humanize/article-humanize.metrics.ts`:

```ts
// apps/api/src/tools/article-humanize/article-humanize.metrics.ts
//
// Humanize-specific metrics: sentence stats, readability, English-probe,
// retry decision. Pure functions — no side effects, no DI.
//
// Sentence splitting is regex-based: `[.!?]+` followed by whitespace. Fine for
// PL/EN; undercounts where ellipses or abbreviations appear. Metrics are
// advisory.

import { extractPlainText } from "../article-protect/article-protect.guards";

const ENGLISH_PROBE_TOKENS = [
  " the ",
  " and ",
  " this ",
  " that ",
  " however ",
] as const;

function splitSentences(text: string): string[] {
  return text
    .split(/[.!?]+\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function tokenize(text: string): string[] {
  // Unicode-aware tokenizer — JS `\w` is ASCII-only even with the `u` flag, so
  // Polish characters (ą, ć, ę, ł, ń, ó, ś, ź, ż) would fragment word tokens.
  // Use Unicode property escapes to match letters, marks, digits, underscores
  // and hyphens; matches the Python reference's `re.UNICODE` semantics.
  return text.match(/[\p{L}\p{M}\p{N}_-]+/gu) ?? [];
}

export interface SentenceStats {
  varianceInput: number; // populated only when caller passes input — see computeSentenceVarianceInput
  varianceOutput: number;
  cvOutput: number;
  minLength: number;
  maxLength: number;
  avgLength: number;
}

export function computeSentenceStats(text: string): SentenceStats {
  const sents = splitSentences(text);
  if (sents.length === 0) {
    return {
      varianceInput: 0,
      varianceOutput: 0,
      cvOutput: 0,
      minLength: 0,
      maxLength: 0,
      avgLength: 0,
    };
  }
  const lens = sents.map((s) => tokenize(s).length);
  const min = Math.min(...lens);
  const max = Math.max(...lens);
  const avg = lens.reduce((a, b) => a + b, 0) / lens.length;
  let variance = 0;
  if (lens.length > 1) {
    const mean = avg;
    variance =
      lens.reduce((acc, n) => acc + (n - mean) * (n - mean), 0) /
      (lens.length - 1);
  }
  const stddev = Math.sqrt(variance);
  const cv = avg > 0 ? stddev / avg : 0;
  return {
    varianceInput: 0,
    varianceOutput: round(variance, 4),
    cvOutput: round(cv, 4),
    minLength: min,
    maxLength: max,
    avgLength: round(avg, 2),
  };
}

export function computeSentenceVarianceForText(text: string): number {
  const sents = splitSentences(text);
  if (sents.length < 2) return 0;
  const lens = sents.map((s) => tokenize(s).length);
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
  return round(
    lens.reduce((acc, n) => acc + (n - mean) * (n - mean), 0) /
      (lens.length - 1),
    4,
  );
}

export interface Readability {
  wordsTotal: number;
  sentencesTotal: number;
  avgSentenceLength: number;
  longSentencesGtCap: number;
  strongSpans: number;
  boldTokenCount: number;
  boldShare: number;
}

export function computeReadability(html: string, sentenceHardCap: number): Readability {
  const visible = extractPlainText(html);
  const sents = splitSentences(visible);
  const words = tokenize(visible);
  const W = words.length;
  const S = Math.max(1, sents.length);
  const longCount = sents.filter((s) => tokenize(s).length > sentenceHardCap)
    .length;

  const strongSpans: string[] = [];
  const re = /<strong\b[^>]*>([\s\S]*?)<\/strong>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    strongSpans.push(m[1]);
  }
  const boldTokenCount = strongSpans.reduce(
    (acc, span) => acc + tokenize(span.replace(/<[^>]+>/g, " ")).length,
    0,
  );
  const boldShare = W > 0 ? boldTokenCount / W : 0;

  return {
    wordsTotal: W,
    sentencesTotal: S,
    avgSentenceLength: round(W / S, 2),
    longSentencesGtCap: longCount,
    strongSpans: strongSpans.length,
    boldTokenCount,
    boldShare: round(boldShare, 4),
  };
}

export function englishProbeHits(text: string): number {
  const probe = text.slice(0, 1000).toLowerCase();
  return ENGLISH_PROBE_TOKENS.reduce(
    (acc, tok) => acc + countOccurrences(probe, tok),
    0,
  );
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count += 1;
    pos += needle.length;
  }
  return count;
}

export interface RetryDecisionInput {
  avgSentenceLength: number;
  longSentencesGtCap: number;
  strongSpans: number;
  wordsTotal: number;
  sentencesTotal: number;
  boldTokenCount: number;
  boldShare: number;
}

export interface RetryConfig {
  asl_max: number;
  sentence_hard_cap: number;
  min_strong_per_block: number;
  retry_enabled: boolean;
}

export interface RetryDecision {
  retry: boolean;
  reasons: Array<"asl" | "long" | "strong">;
}

export function shouldRetry(
  metrics: RetryDecisionInput,
  cfg: RetryConfig,
): RetryDecision {
  if (!cfg.retry_enabled) return { retry: false, reasons: [] };
  const reasons: Array<"asl" | "long" | "strong"> = [];
  if (metrics.avgSentenceLength > cfg.asl_max) reasons.push("asl");
  if (metrics.longSentencesGtCap > 0) reasons.push("long");
  if (metrics.strongSpans < cfg.min_strong_per_block) reasons.push("strong");
  return { retry: reasons.length > 0, reasons };
}

export function formatBoldShare(value: number): string {
  return value.toFixed(4);
}

function round(value: number, places: number): number {
  const f = Math.pow(10, places);
  return Math.round(value * f) / f;
}
```

- [ ] **Step 3.4: Run test to verify it passes**

Run: `pnpm --filter @sensai/api vitest run src/tests/article-humanize.metrics.test.ts`
Expected: PASS, all suites green.

- [ ] **Step 3.5: Commit**

```bash
git add apps/api/src/tools/article-humanize/article-humanize.metrics.ts apps/api/src/tests/article-humanize.metrics.test.ts
git commit -m "feat(api): add Plan 16 humanize metrics module"
```

---

## Task 4: Humanize prompt builder — main + retry

**Files:**
- Create: `apps/api/src/prompts/article-humanize.prompt.ts`
- Test: `apps/api/src/tests/article-humanize.prompt.test.ts`

The main prompt is a TypeScript port of `docs/edu/lekcja-3-5/T3F5-prompt_humanizacja.md` (all 20 rules + LANGUAGE QUALITY + READABILITY sections). Two changes from the Python verbatim text:
1. Replace the `[[NUM_X]]` wording in NUMBER SAFETY with span-based wording (`<span data-token-id="...">...</span>`).
2. Drop the `### ARTICLE METADATA` block — H1 is already in the article HTML; redundancy adds noise.

The retry prompt mirrors `T3F5-article_humanization_file.py` lines 621–632, adapted to spans.

- [ ] **Step 4.1: Write the failing test**

Create `apps/api/src/tests/article-humanize.prompt.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildHumanizeSystemPrompt,
  buildHumanizeRetryPrompt,
} from "../prompts/article-humanize.prompt";

describe("buildHumanizeSystemPrompt", () => {
  it("substitutes language label and readability params", () => {
    const p = buildHumanizeSystemPrompt({
      language: "pl",
      asl_min: 12,
      asl_max: 20,
      sentence_hard_cap: 24,
      min_strong_per_block: 1,
      max_strong_per_block: 4,
      strong_words_per_block: 500,
    });
    expect(p).toContain("Polish article");
    expect(p).toContain("Split any sentence over 24 words");
    expect(p).toContain("12-20 words per sentence");
    expect(p).toContain("1-4 per ~500 words");
  });

  it("uses span-based number safety wording (not [[NUM_X]])", () => {
    const p = buildHumanizeSystemPrompt({
      language: "pl",
      asl_min: 12,
      asl_max: 20,
      sentence_hard_cap: 24,
      min_strong_per_block: 1,
      max_strong_per_block: 4,
      strong_words_per_block: 500,
    });
    expect(p).toContain('<span data-token-id="...">');
    expect(p).not.toContain("[[NUM_X]]");
  });

  it("includes all four tier headers", () => {
    const p = buildHumanizeSystemPrompt({
      language: "pl",
      asl_min: 12,
      asl_max: 20,
      sentence_hard_cap: 24,
      min_strong_per_block: 1,
      max_strong_per_block: 4,
      strong_words_per_block: 500,
    });
    expect(p).toContain("TIER 1: CRITICAL SIGNALS");
    expect(p).toContain("TIER 2: STRUCTURAL PATTERNS");
    expect(p).toContain("TIER 3: VOICE & TONE");
    expect(p).toContain("TIER 4: AI DETECTOR SIGNALS");
  });

  it("preserves the SRC placeholder safety section", () => {
    const p = buildHumanizeSystemPrompt({
      language: "pl",
      asl_min: 12,
      asl_max: 20,
      sentence_hard_cap: 24,
      min_strong_per_block: 1,
      max_strong_per_block: 4,
      strong_words_per_block: 500,
    });
    expect(p).toContain("[[SRC_xxx]]");
  });

  it("uses English label when language=en", () => {
    const p = buildHumanizeSystemPrompt({
      language: "en",
      asl_min: 12,
      asl_max: 20,
      sentence_hard_cap: 24,
      min_strong_per_block: 1,
      max_strong_per_block: 4,
      strong_words_per_block: 500,
    });
    expect(p).toContain("English article");
  });
});

describe("buildHumanizeRetryPrompt", () => {
  it("contains hard-cap split instruction with cap value", () => {
    const p = buildHumanizeRetryPrompt({
      asl_min: 12,
      asl_max: 20,
      sentence_hard_cap: 24,
      min_strong_per_block: 1,
      max_strong_per_block: 4,
      strong_words_per_block: 500,
    });
    expect(p).toContain("Split any sentence longer than 24 words");
    expect(p).toContain("12-20 words");
    expect(p).toContain("1-4 per ~500 words");
  });

  it("instructs to keep span and SRC tokens intact", () => {
    const p = buildHumanizeRetryPrompt({
      asl_min: 12,
      asl_max: 20,
      sentence_hard_cap: 24,
      min_strong_per_block: 1,
      max_strong_per_block: 4,
      strong_words_per_block: 500,
    });
    expect(p).toContain('<span data-token-id="...">');
    expect(p).toContain("[[SRC_xxx]]");
  });
});
```

- [ ] **Step 4.2: Run test to verify it fails**

Run: `pnpm --filter @sensai/api vitest run src/tests/article-humanize.prompt.test.ts`
Expected: FAIL — module `article-humanize.prompt` not found.

- [ ] **Step 4.3: Write minimal implementation**

Create `apps/api/src/prompts/article-humanize.prompt.ts`:

```ts
// apps/api/src/prompts/article-humanize.prompt.ts
//
// Verbatim port of the v3.3 anti-AI prompt from
//   docs/edu/lekcja-3-5/T3F5-prompt_humanizacja.md
//
// Two adaptations from the Python source:
//  1. NUMBER SAFETY uses <span data-token-id="...">…</span> wording (project's
//     hybrid protection scheme), not the Python script's [[NUM_X]] markers.
//  2. The trailing "### ARTICLE METADATA" + "### SOURCE ARTICLE (HTML)" block
//     is dropped — the H1 is already in the article HTML, and the article HTML
//     is delivered via the `input` channel of OpenAIResponsesClient.createBlock.

export interface HumanizePromptInput {
  language: string;
  asl_min: number;
  asl_max: number;
  sentence_hard_cap: number;
  min_strong_per_block: number;
  max_strong_per_block: number;
  strong_words_per_block: number;
}

const LANGUAGE_LABEL: Record<string, string> = {
  pl: "Polish",
  en: "English",
  de: "German",
};

export function buildHumanizeSystemPrompt(input: HumanizePromptInput): string {
  const langLabel = LANGUAGE_LABEL[input.language] ?? "Polish";

  return `You are an expert copy editor. Rewrite this ${langLabel} article so it reads like an experienced human author wrote it.
Return ONLY the final HTML (no code fences, no explanations), in ${langLabel}.

### OBJECTIVE
Rewrite the text with authentic human voice — varied rhythm, natural word choices, concrete details. Apply ALL rules below SIMULTANEOUSLY in one holistic pass. Write like a skilled human author, not like a machine applying filters.

### PROTECTION RULES
- Preserve HTML tag types (<h1>-<h4>, <p>, <ul>/<ol>, <li>, <strong>, <i>, <table>).
- **HEADING LEVELS ARE LOCKED.** Every <h2> in input MUST remain <h2> in output. Every <h3> in input MUST remain <h3>. NEVER change <h3> to <h2> or any other level. Copy the exact heading tag from the source.
- You MAY merge multiple short <p> blocks into fewer, longer <p> blocks for better readability. Aim for 3-6 sentences per paragraph.
- Output MUST start with the existing <h1>.
- Keep numbers, dates, percentages exactly as input.
### NUMBER SAFETY
Keep ALL <span data-token-id="...">...</span> tags intact. Do NOT modify content inside spans. Do NOT remove or move them.
### SOURCE CITATION SAFETY
Keep ALL [[SRC_xxx]] placeholders exactly as they are. Do NOT modify, move, or delete them. They must stay at the end of their paragraph.
- Keep sources as plain text in parentheses. Do NOT add links (<a>) or URLs.
- Same overall length (+/-10%).
- Do NOT invent examples, names, places, or details that are not in the source text. Rewrite what exists — do not add new content.

---

## TIER 1: CRITICAL SIGNALS (statistical analysis of 100 HUMAN vs AI text pairs)

### 1. BANNED AI VOCABULARY (AI texts use these 2.7x more)
NEVER use these words — replace with plain alternatives or remove entirely:
additionally, furthermore, moreover, hence, thus, delve, testament, landscape,
tapestry, vibrant, showcasing, underscores, fostering, garner, intricate,
enduring, enhance, interplay, utilize, commence, facilitate, paradigm,
transformative, groundbreaking, unprecedented, pivotal, multifaceted,
nuanced, comprehensive, robust, leverage, synergy, holistic, streamline,
spearhead, notably, crucially, importantly, significantly, remarkably,
interestingly, essentially, fundamentally, highlights, illustrates,
exemplifies, demonstrates, showcases, revolutionized, trajectory.
**Max 0 of these words in entire output.**

### 2. BANNED SIGNPOST TRANSITIONS (AI uses 1.6x more)
NEVER start sentences with: However, Moreover, Furthermore, Additionally,
Consequently, Nevertheless, Therefore, Thus.
USE instead: But, And, So, Still, Yet. Or just start the sentence directly.
**Max 1 signpost per 500 words. Prefer zero.**

### 3. SENTENCE RHYTHM (human texts have 40%+ higher length variance)
This is the strongest human signal. Mix sentence lengths aggressively:
- Short punches: 4-8 words. Use these often. They break AI monotony.
- Medium flow: 12-18 words for standard information.
- Long complex: 22-30 words with subclauses, dashes, or parentheticals.
- NEVER write 3+ consecutive sentences of similar length.
- Aim for coefficient of variation > 0.45 in sentence lengths.

### 4. OPENER RULE (AI starts abstract, humans start concrete)
- NEVER open a paragraph with "The evolution/development/transformation/role/impact of..."
- START paragraphs with: a specific date, a name, a number, a short blunt statement, or a question.
- First sentence of the article must hook with a concrete detail, not a general framing.

### 5. CLOSER RULE (AI wraps up with summary patterns)
- NEVER end with "This combination of...", "This evolution...", "This approach..."
- End with a concrete fact, a forward-looking specific detail, or a short punchy statement.
- The last paragraph should NOT summarize what was already said.

---

## TIER 2: STRUCTURAL PATTERNS

### 6. PARENTHETICAL ASIDES (humans use 2x more)
- Insert 3-6 short asides per 500 words using dashes or parentheses.
- Examples: "Aspirin - still the most common painkiller worldwide - was first..." or "The team (led by a 26-year-old chemist) filed..."
- Asides must add a CONCRETE fact, not a vague observation.
- Keep asides 5-15 words. They break predictable sentence flow.

### 7. CONCRETE OVER ABSTRACT
- Replace abstract nouns with specific examples: "various factors" -> name the actual factors.
- Replace "It is widely accepted" -> state the fact directly or cite a specific source.
- Use physical, tangible words when possible: "bottle", "lab", "dose" not "paradigm", "framework", "approach".

### 8. ACTIVE VOICE, SIMPLE VERBS
- "serves as", "acts as", "functions as" -> "is"
- "features", "boasts", "encompasses" -> "has", "includes"
- "utilize" -> "use", "commence" -> "start", "facilitate" -> "help"
- "It was determined that" -> "We found" or state directly.

### 9. ELIMINATE FILLER PHRASES
- "In order to" -> "To"
- "Due to the fact that" -> "Because"
- "It is important to note that" -> just state the fact
- "At this point in time" -> "Now"
- "With regard to" -> "About" or "On"

### 10. SENTENCE STARTER DIVERSITY
- NEVER start 2+ consecutive sentences with the same word or the same verb form (e.g. "Ustal... Ustal...", "Check... Check...", "Try... Try...").
- This includes imperative verbs: if one sentence starts with a command, the next must start differently.
- Vary: start with a verb, a date, a name, a short clause, "But", a prepositional phrase.
- Avoid starting more than 2 sentences per paragraph with "The" / "To" / "Ten".

---

## TIER 3: VOICE & TONE

### 11. NATURAL PUNCTUATION
- Use dashes (not em-dashes) for interjections and asides: "word - aside - word"
- Use colons to introduce specifics: "One thing stood out: the dosage was wrong."
- Use semicolons to connect related thoughts; they signal a human writer.
- Limit to 2-3 dashes, 1-2 colons, 1 semicolon per 500 words.

### 12. INFORMATION DENSITY VARIATION
- Not every sentence must carry maximum information.
- Allow bridge sentences and short reactions: "That changed everything." or "It worked."
- Mix dense factual sentences with sparse transitional ones.

### 13. REMOVE PROMOTIONAL INFLATION
- "Revolutionary", "groundbreaking", "game-changer" -> factual descriptions.
- "Cutting-edge", "world-class", "stunning" -> neutral specifics.
- State what happened without dramatization. Let facts carry weight.

### 14. NO CHATBOT ARTIFACTS
- Never: "I hope this helps", "Let me know", "Feel free to", "Don't hesitate"
- Never: "In this article, we will explore", "Let's dive into"
- Never address the reader about article structure.

### 15. CONSISTENT REGISTER
- Pick formal OR approachable at the start and maintain it throughout.
- Never mix "one should consider" with "yeah, that's cool" in the same text.
- Register shifts are a strong AI detection signal.

---

## TIER 4: AI DETECTOR SIGNALS (analysis of 20 AI-detection classifiers)

### 16. PERSONAL PRONOUNS (detector signal: pronominal_frequency)
- AI writes impersonally: "the system enables", "supplementation is recommended".
- Humans use pronouns: we, you, your, our. Low pronoun frequency = AI signal.
- Weave in personal perspective where context allows: "your doctor", "we know", "you can expect".
- Not in every sentence — but not zero in the whole text either.

### 17. TENSE MIXING (detector signal: verb_tense_consistency)
- AI is hyper-consistent in tense — entire text in one tense. Humans naturally jump.
- Mix tenses within paragraphs: historical fact (past) -> current state (present) -> forecast (future).
- Tense shifts add grammatical variety on top of length variety.

### 18. PROPER NOUN DENSITY (detector signal: proper_noun_density)
- AI generalizes: "experts say", "researchers found", "studies show". Humans name specifics.
- Preserve ALL proper nouns from the source. Where possible, add concrete names: institutions, cities, researchers, journals.
- "Researchers found" -> "A team at Johns Hopkins found"; "studies show" -> "a 2023 JAMA meta-analysis showed".

### 19. PASSIVE VOICE LIMIT (detector signal: passive_voice_saturation)
- AI saturates text with passive constructions ("was implemented", "has been demonstrated").
- Use active voice by default. **Max 1 passive sentence per 3 sentences.**
- "was approved by FDA" -> "FDA approved"; "was conducted" -> "researchers tested".

### 20. RHETORICAL QUESTIONS (detector signal: rhetorical_question_ratio)
- AI almost never asks questions — it is wired to deliver answers. Humans naturally ask.
- Insert 1-2 rhetorical questions per 500 words. Use them to open paragraphs, provoke thought, or pivot the narrative.
- Do NOT answer them immediately — let the question hang for a sentence or two.

---

## LANGUAGE QUALITY (critical — rewriting must not introduce errors)

### Meaning Preservation
- After rewriting a sentence, verify the subject-verb-object order is correct. Do NOT invert who does what to whom.
- BAD: "Chronic stressors help defuse short work blocks" (inverted — blocks defuse stressors, not the other way around).
- If the original says "A causes B", the rewrite MUST say "A causes B", not "B causes A".

### Complete Thoughts
- Every sentence must be a complete, self-contained thought. Do NOT create fragments that need the previous sentence to make sense.
- BAD: "Sleep of 7-9 hours lowers cortisol by 20-30%. That's compared to 5 hours." (fragment — "That's compared to 5 hours" is incomplete).
- GOOD: "Sleep of 7-9 hours lowers cortisol by 20-30% compared to just 5 hours of sleep."

### Natural Language
- Do NOT invent metaphors or colloquialisms that don't exist in the target language. If a phrase sounds odd, use a plain description instead.
- Do NOT add filler sentences that restate the obvious or add no information ("This happens even when long sessions sound ambitious").
- Every sentence must earn its place — if removing it changes nothing, remove it.

### Grammar and Inflection
- Verify noun-number agreement, case endings, and verb conjugation in the target language.
- Pay special attention to numbers + nouns: "1 minuta" not "1 minut", "2 lata" not "2 lat" in Polish.

### Important: No Repetition in Adjacent Sentences
- Do NOT repeat the same word, phrase, verb, or predicate in consecutive sentences. Scan every pair of adjacent sentences before outputting.
- This includes predicates split across sentences: "X jest ważna. Jest też ważna Y" — the predicate "jest ważna" repeats. Merge or rephrase.
- BAD: "Consultation is important for X. It is also important for Y." → GOOD: "Consultation is important for X. For Y, seek medical advice as well."
- BAD: "Unikaj badań w trakcie infekcji. Unikaj ich też po treningu." → GOOD: "Unikaj badań w trakcie infekcji. Po ciężkim treningu również lepiej poczekać."

### Paragraph Structure (critical — avoid "list of facts" feel)
- A paragraph (<p>) should contain 3-6 sentences that develop ONE coherent thought. Do NOT put every sentence in its own <p> tag.
- Merge related short sentences into flowing paragraphs. Sentences that share a topic belong together.
- BAD (choppy, each sentence isolated):
  <p>Stałe godziny snu pomagają stabilizować rytm dobowy.</p>
  <p>Wspiera to też wieczorna rutyna bez bodźców.</p>
  <p>Chodzi m.in. o telefon i ciężkie rozmowy.</p>
- GOOD (one flowing paragraph):
  <p>Stałe godziny snu pomagają stabilizować rytm dobowy. Wspiera to też wieczorna rutyna bez bodźców — chodzi m.in. o telefon i ciężkie rozmowy tuż przed snem. Organizm potrzebuje wyraźnego sygnału, że dzień się skończył.</p>
- The article should read like a magazine feature, not like a bulleted briefing. Sentences connect, build on each other, and flow into the next.
- Use transition words WITHIN paragraphs (natural ones: "dlatego", "z kolei", "ale", "bo") to connect sentences instead of putting each thought in a separate <p>.

---

## READABILITY

### Sentence Dynamics:
- **Hard cap:** Split any sentence over ${input.sentence_hard_cap} words.
- **Average:** ${input.asl_min}-${input.asl_max} words per sentence.
- **Rhythm:** Alternate long and short. Never 3 same-length sentences in a row.

### Visual Emphasis:
- Bold key terms with <strong>: ${input.min_strong_per_block}-${input.max_strong_per_block} per ~${input.strong_words_per_block} words.
- Never bold entire sentences or headings. Keep bolded phrases to 2-5 words.

---

## OUTPUT
Return ONLY the complete HTML article starting with <h1>.
`;
}

export function buildHumanizeRetryPrompt(input: Omit<HumanizePromptInput, "language">): string {
  return `Re-edit the HTML below to improve readability while preserving all facts.
Rules:
- Split any sentence longer than ${input.sentence_hard_cap} words into 2-3 shorter ones.
- Keep average sentence length around ${input.asl_min}-${input.asl_max} words; prefer active voice.
- Add subtle emphasis using <strong> to key phrases: ${input.min_strong_per_block}-${input.max_strong_per_block} per ~${input.strong_words_per_block} words.
- Keep lists/table rows intact. Do not add links.
- Keep ALL <span data-token-id="...">...</span> tags intact. Do not modify content inside spans.
- Keep ALL [[SRC_xxx]] placeholders exactly as they are. Do not move, edit, or delete them.
Return ONLY corrected HTML.
`;
}
```

- [ ] **Step 4.4: Run test to verify it passes**

Run: `pnpm --filter @sensai/api vitest run src/tests/article-humanize.prompt.test.ts`
Expected: PASS, all suites green.

- [ ] **Step 4.5: Commit**

```bash
git add apps/api/src/prompts/article-humanize.prompt.ts apps/api/src/tests/article-humanize.prompt.test.ts
git commit -m "feat(api): add Plan 16 humanize prompt builder (20 anti-AI rules)"
```

---

## Task 5: Humanize client — Phase 1 happy path (no retry)

**Files:**
- Create: `apps/api/src/tools/article-humanize/article-humanize.client.ts`
- Test: `apps/api/src/tests/article-humanize.client.test.ts`

This task lands the Phase-1 LLM call wrapped in tokenize/restore + em-dash cleanup + protection stats. Retry logic is layered in Task 6. Hard-fail guards are layered in Task 7.

- [ ] **Step 5.1: Write the failing test (Phase 1 happy path)**

Create `apps/api/src/tests/article-humanize.client.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { ArticleHumanizeClient } from "../tools/article-humanize/article-humanize.client";

const stubEnv = {
  ARTICLE_HUMANIZE_MODEL: "gpt-5.2",
  ARTICLE_HUMANIZE_ASL_MIN: 12,
  ARTICLE_HUMANIZE_ASL_MAX: 20,
  ARTICLE_HUMANIZE_SENTENCE_HARD_CAP: 24,
  ARTICLE_HUMANIZE_MIN_STRONG_PER_BLOCK: 1,
  ARTICLE_HUMANIZE_MAX_STRONG_PER_BLOCK: 4,
  ARTICLE_HUMANIZE_STRONG_WORDS_PER_BLOCK: 500,
  ARTICLE_HUMANIZE_BOLD_SHARE_MAX: 0.08,
  ARTICLE_HUMANIZE_MIN_LEN_RATIO: 0.80,
  ARTICLE_HUMANIZE_MAX_LEN_RATIO: 1.20,
  ARTICLE_HUMANIZE_RETRY_ENABLED: true,
  ARTICLE_HUMANIZE_LANG_PROBE_THRESHOLD: 8,
} as const;

function llmEcho() {
  return {
    createBlock: vi.fn(async ({ input }: any) => ({
      id: "r",
      outputText: input,
      model: "gpt-5.2",
      promptTokens: 10,
      completionTokens: 10,
      costUsd: "0.000100",
      latencyMs: 100,
    })),
  } as any;
}

describe("ArticleHumanizeClient.humanize — phase 1", () => {
  it("returns echo'd HTML when LLM is identity (no retry triggers)", async () => {
    const inputHtml =
      "<h1>Tytuł</h1>" +
      "<p>Pierwsze <strong>kluczowe</strong> zdanie z 20% wartością.</p>" +
      "<p>Drugie zdanie z (Źródło: WHO, 2024 — who.int).</p>";
    const client = new ArticleHumanizeClient(llmEcho(), stubEnv as any);
    const out = await client.humanize({
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      keyword: "k",
      language: "pl",
      htmlContent: inputHtml,
    });
    expect(out.htmlContent).toContain("<h1>Tytuł</h1>");
    expect(out.stats.sourcesAfter).toBe(1);
    expect(out.stats.retryUsed).toBe(false);
    expect(out.stats.retryAccepted).toBe(false);
    expect(out.stats.totalCostUsd).toBe("0.000100");
    expect(out.stats.totalLatencyMs).toBe(100);
  });

  it("collapses em-dashes to space-dash-space", async () => {
    const inputHtml = "<h1>T</h1><p>Słowo — inne słowo.</p>";
    const client = new ArticleHumanizeClient(llmEcho(), stubEnv as any);
    const out = await client.humanize({
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      keyword: "k",
      language: "pl",
      htmlContent: inputHtml,
    });
    expect(out.htmlContent).not.toContain("—");
    expect(out.htmlContent).toContain("Słowo - inne");
    expect(out.stats.emDashesReplaced).toBe(1);
  });

  it("counts protection stats and reports zero missing on identity LLM", async () => {
    // 30% + 50% are wrapped as NUM spans. 2024 inside the source citation is
    // hidden by SRC protection so it does NOT become a span. Expected:
    // srcPlaceholdersTotal=1, spansTotal=2.
    const inputHtml =
      "<h1>T</h1><p>30% i 50% z (Źródło: WHO, 2024 — who.int).</p>";
    const client = new ArticleHumanizeClient(llmEcho(), stubEnv as any);
    const out = await client.humanize({
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      keyword: "k",
      language: "pl",
      htmlContent: inputHtml,
    });
    expect(out.protection.srcPlaceholdersTotal).toBe(1);
    expect(out.protection.srcPlaceholdersMissing).toBe(0);
    expect(out.protection.spansTotal).toBe(2); // 30% + 50%
    expect(out.protection.spansMissing).toBe(0);
  });
});
```

- [ ] **Step 5.2: Run test to verify it fails**

Run: `pnpm --filter @sensai/api vitest run src/tests/article-humanize.client.test.ts`
Expected: FAIL — module `article-humanize.client` not found.

- [ ] **Step 5.3: Write minimal implementation (Phase 1 only)**

Create `apps/api/src/tools/article-humanize/article-humanize.client.ts`:

```ts
// apps/api/src/tools/article-humanize/article-humanize.client.ts
import { Inject, Injectable, Logger } from "@nestjs/common";
import { OpenAIResponsesClient } from "../../llm/openai-responses.client";
import { tokenizeHybrid } from "../article-protect/article-protect.tokenize";
import { restoreHybrid } from "../article-protect/article-protect.restore";
import { SOURCE_CITATION_RE } from "../article-protect/article-protect.regex";
import { extractPlainText } from "../article-protect/article-protect.guards";
import {
  buildHumanizeSystemPrompt,
  buildHumanizeRetryPrompt,
} from "../../prompts/article-humanize.prompt";
import {
  computeReadability,
  computeSentenceStats,
  computeSentenceVarianceForText,
  englishProbeHits,
  shouldRetry,
  type Readability,
  type SentenceStats,
} from "./article-humanize.metrics";
import type {
  ArticleHumanizeWarning,
  ArticleHumanizeReadability,
  ArticleHumanizeSentenceStats,
} from "@sensai/shared";
import type { Env } from "../../config/env";

type ClientEnv = Pick<
  Env,
  | "ARTICLE_HUMANIZE_MODEL"
  | "ARTICLE_HUMANIZE_ASL_MIN"
  | "ARTICLE_HUMANIZE_ASL_MAX"
  | "ARTICLE_HUMANIZE_SENTENCE_HARD_CAP"
  | "ARTICLE_HUMANIZE_MIN_STRONG_PER_BLOCK"
  | "ARTICLE_HUMANIZE_MAX_STRONG_PER_BLOCK"
  | "ARTICLE_HUMANIZE_STRONG_WORDS_PER_BLOCK"
  | "ARTICLE_HUMANIZE_BOLD_SHARE_MAX"
  | "ARTICLE_HUMANIZE_MIN_LEN_RATIO"
  | "ARTICLE_HUMANIZE_MAX_LEN_RATIO"
  | "ARTICLE_HUMANIZE_RETRY_ENABLED"
  | "ARTICLE_HUMANIZE_LANG_PROBE_THRESHOLD"
>;

export interface HumanizeArgs {
  ctx: { runId: string; stepId: string; attempt: number };
  keyword: string;
  language: string;
  htmlContent: string;
}

export interface HumanizeResult {
  htmlContent: string;
  warnings: ArticleHumanizeWarning[];
  protection: {
    srcPlaceholdersTotal: number;
    srcPlaceholdersMissing: number;
    spansTotal: number;
    spansMissing: number;
  };
  stats: {
    inputLength: number;
    outputLength: number;
    ratio: number;
    sourcesBefore: number;
    sourcesAfter: number;
    emDashesReplaced: number;
    retryUsed: boolean;
    retryAccepted: boolean;
    readability: ArticleHumanizeReadability;
    sentence: ArticleHumanizeSentenceStats;
  };
  cost: { costUsd: string; latencyMs: number };
}

@Injectable()
export class ArticleHumanizeClient {
  private readonly logger = new Logger(ArticleHumanizeClient.name);

  constructor(
    private readonly llm: OpenAIResponsesClient,
    @Inject("ARTICLE_HUMANIZE_ENV") private readonly env: ClientEnv,
  ) {}

  async humanize(args: HumanizeArgs): Promise<HumanizeResult> {
    const inputText = extractPlainText(args.htmlContent);
    const inputLength = inputText.length;
    const inputVariance = computeSentenceVarianceForText(inputText);
    const sourcesBefore = countMatches(args.htmlContent, SOURCE_CITATION_RE);

    // PHASE 1 — humanization (20 rules).
    const phase1 = await this.runPhase({
      ctx: args.ctx,
      systemPrompt: buildHumanizeSystemPrompt({
        language: args.language,
        asl_min: this.env.ARTICLE_HUMANIZE_ASL_MIN,
        asl_max: this.env.ARTICLE_HUMANIZE_ASL_MAX,
        sentence_hard_cap: this.env.ARTICLE_HUMANIZE_SENTENCE_HARD_CAP,
        min_strong_per_block: this.env.ARTICLE_HUMANIZE_MIN_STRONG_PER_BLOCK,
        max_strong_per_block: this.env.ARTICLE_HUMANIZE_MAX_STRONG_PER_BLOCK,
        strong_words_per_block: this.env.ARTICLE_HUMANIZE_STRONG_WORDS_PER_BLOCK,
      }),
      htmlContent: args.htmlContent,
      phaseLabel: "humanize.phase1",
    });

    let humanizedHtml = phase1.html;
    const warnings: ArticleHumanizeWarning[] = [];
    if (phase1.missingSpans.length > 0) {
      warnings.push({
        kind: "humanize_spans_missing",
        message: `${phase1.missingSpans.length} number/date spans missing after restore`,
        context: { count: String(phase1.missingSpans.length), phase: "1" },
      });
    }

    let retryUsed = false;
    let retryAccepted = false;
    let totalCostUsd = phase1.costUsd;
    let totalLatencyMs = phase1.latencyMs;
    let totalSpansTotal = phase1.spansTotal;
    let totalSrcTotal = phase1.srcTotal;
    let cumulativeSrcMissing = phase1.missingSrc.length;
    let cumulativeSpansMissing = phase1.missingSpans.length;

    // Em-dash cleanup is the LAST mutation before guards/metrics. Apply
    // here on the Phase-1 output; if Phase 2 runs, we re-apply on the final.
    let emDashCount = countEmDashes(humanizedHtml);
    humanizedHtml = collapseEmDashes(humanizedHtml);

    // METRICS on humanized HTML — used to decide retry.
    const readability1 = computeReadability(
      humanizedHtml,
      this.env.ARTICLE_HUMANIZE_SENTENCE_HARD_CAP,
    );
    const decision = shouldRetry(readability1, {
      asl_max: this.env.ARTICLE_HUMANIZE_ASL_MAX,
      sentence_hard_cap: this.env.ARTICLE_HUMANIZE_SENTENCE_HARD_CAP,
      min_strong_per_block: this.env.ARTICLE_HUMANIZE_MIN_STRONG_PER_BLOCK,
      retry_enabled: this.env.ARTICLE_HUMANIZE_RETRY_ENABLED,
    });

    let finalHtml = humanizedHtml;
    let finalReadability: Readability = readability1;

    if (decision.retry) {
      retryUsed = true;
      const phase2 = await this.runPhase({
        ctx: args.ctx,
        systemPrompt: buildHumanizeRetryPrompt({
          asl_min: this.env.ARTICLE_HUMANIZE_ASL_MIN,
          asl_max: this.env.ARTICLE_HUMANIZE_ASL_MAX,
          sentence_hard_cap: this.env.ARTICLE_HUMANIZE_SENTENCE_HARD_CAP,
          min_strong_per_block: this.env.ARTICLE_HUMANIZE_MIN_STRONG_PER_BLOCK,
          max_strong_per_block: this.env.ARTICLE_HUMANIZE_MAX_STRONG_PER_BLOCK,
          strong_words_per_block: this.env.ARTICLE_HUMANIZE_STRONG_WORDS_PER_BLOCK,
        }),
        htmlContent: humanizedHtml,
        phaseLabel: "humanize.phase2",
      });
      totalCostUsd = sumDecimal(totalCostUsd, phase2.costUsd);
      totalLatencyMs += phase2.latencyMs;
      totalSpansTotal += phase2.spansTotal;
      totalSrcTotal += phase2.srcTotal;
      cumulativeSrcMissing += phase2.missingSrc.length;
      cumulativeSpansMissing += phase2.missingSpans.length;

      // Reject retry if it added anchors (input was anchor-free per Plan 15).
      const retryAddsAnchor = /<a\b[^>]*>/i.test(phase2.html);
      // Reject retry if it lost a SRC placeholder (rare but possible).
      const retryLostSrc = phase2.missingSrc.length > 0;

      if (retryAddsAnchor) {
        warnings.push({
          kind: "humanize_retry_rejected_anchors",
          message: "Phase 2 retry added <a> tags — discarded",
          context: {},
        });
      } else if (retryLostSrc) {
        warnings.push({
          kind: "humanize_retry_rejected_anchors",
          message: `Phase 2 retry lost ${phase2.missingSrc.length} source placeholder(s) — discarded`,
          context: { count: String(phase2.missingSrc.length) },
        });
      } else {
        retryAccepted = true;
        const phase2Cleaned = collapseEmDashes(phase2.html);
        emDashCount += countEmDashes(phase2.html);
        finalHtml = phase2Cleaned;
        finalReadability = computeReadability(
          finalHtml,
          this.env.ARTICLE_HUMANIZE_SENTENCE_HARD_CAP,
        );
        if (phase2.missingSpans.length > 0) {
          warnings.push({
            kind: "humanize_spans_missing",
            message: `${phase2.missingSpans.length} number/date spans missing after retry restore`,
            context: { count: String(phase2.missingSpans.length), phase: "2" },
          });
        }
      }

      warnings.push({
        kind: "humanize_retry_used",
        message: `retry triggered: ${decision.reasons.join(",")}; accepted=${retryAccepted}`,
        context: {
          reasons: decision.reasons.join(","),
          accepted: String(retryAccepted),
        },
      });
    }

    // FINAL TEXT METRICS — for stats output.
    const finalText = extractPlainText(finalHtml);
    const outputLength = finalText.length;
    const sourcesAfter = countMatches(finalHtml, SOURCE_CITATION_RE);
    const ratio = inputLength > 0 ? outputLength / inputLength : 0;

    const sentence = computeSentenceStats(finalText);
    sentence.varianceInput = inputVariance;

    // WARN-ONLY STYLE CHECKS.
    if (sentence.cvOutput <= 0.45) {
      warnings.push({
        kind: "humanize_low_burstiness",
        message: `coefficient of variation ${sentence.cvOutput.toFixed(3)} ≤ 0.45`,
        context: { cv: sentence.cvOutput.toFixed(4) },
      });
    }
    if (args.language.toLowerCase().startsWith("pl")) {
      const enHits = englishProbeHits(finalText);
      if (enHits > this.env.ARTICLE_HUMANIZE_LANG_PROBE_THRESHOLD) {
        warnings.push({
          kind: "humanize_language_probe",
          message: `English token probe hit ${enHits} (threshold ${this.env.ARTICLE_HUMANIZE_LANG_PROBE_THRESHOLD})`,
          context: { hits: String(enHits) },
        });
      }
    }

    return {
      htmlContent: finalHtml,
      warnings,
      protection: {
        srcPlaceholdersTotal: totalSrcTotal,
        srcPlaceholdersMissing: cumulativeSrcMissing,
        spansTotal: totalSpansTotal,
        spansMissing: cumulativeSpansMissing,
      },
      stats: {
        inputLength,
        outputLength,
        ratio: round(ratio, 4),
        sourcesBefore,
        sourcesAfter,
        emDashesReplaced: emDashCount,
        retryUsed,
        retryAccepted,
        readability: finalReadability,
        sentence,
      },
      cost: { costUsd: totalCostUsd, latencyMs: totalLatencyMs },
    };
  }

  private async runPhase(args: {
    ctx: { runId: string; stepId: string; attempt: number };
    systemPrompt: string;
    htmlContent: string;
    phaseLabel: string;
  }): Promise<{
    html: string;
    missingSrc: string[];
    missingSpans: string[];
    srcTotal: number;
    spansTotal: number;
    costUsd: string;
    latencyMs: number;
  }> {
    const { html: protectedHtml, srcMap, spanMap } = tokenizeHybrid(
      args.htmlContent,
    );
    const resp = await this.llm.createBlock({
      ctx: args.ctx,
      model: this.env.ARTICLE_HUMANIZE_MODEL,
      system: args.systemPrompt,
      input: protectedHtml,
      reasoning: { effort: "medium" },
    });
    const restored = restoreHybrid(resp.outputText, srcMap, spanMap);
    return {
      html: restored.html,
      missingSrc: restored.missingSrc,
      missingSpans: restored.missingSpans,
      srcTotal: Object.keys(srcMap).length,
      spansTotal: Object.keys(spanMap).length,
      costUsd: resp.costUsd,
      latencyMs: resp.latencyMs,
    };
  }
}

function countMatches(text: string, re: RegExp): number {
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  const local = new RegExp(re.source, flags);
  return (text.match(local) ?? []).length;
}

function countEmDashes(s: string): number {
  return (s.match(/—/g) ?? []).length;
}

function collapseEmDashes(s: string): string {
  return s.replace(/\s*—\s*/g, " - ");
}

function sumDecimal(a: string, b: string): string {
  const out = (parseFloat(a) + parseFloat(b)).toFixed(6);
  // Trim trailing zero pad to a max of 6 decimals (we keep all 6 for stability).
  return out;
}

function round(value: number, places: number): number {
  const f = Math.pow(10, places);
  return Math.round(value * f) / f;
}
```

Note: this implementation already includes the retry path (Task 6 logic) and the warning emissions, but Task 5's tests only exercise the happy path. Task 6 adds the retry-specific tests and Task 7 adds the hard-fail-guard tests. We commit it whole here because the body would be nearly impossible to grow incrementally without massive rewrites — the retry path is woven into the same sequencing that the happy path needs.

- [ ] **Step 5.4: Run test to verify it passes**

Run: `pnpm --filter @sensai/api vitest run src/tests/article-humanize.client.test.ts`
Expected: PASS — all three tests green.

- [ ] **Step 5.5: Commit**

```bash
git add apps/api/src/tools/article-humanize/article-humanize.client.ts apps/api/src/tests/article-humanize.client.test.ts
git commit -m "feat(api): Plan 16 humanize client phase 1 + retry scaffold"
```

---

## Task 6: Humanize client — retry triggers + retry rejection

**Files:**
- Modify: `apps/api/src/tests/article-humanize.client.test.ts` (append more tests)

The retry logic is already implemented in Task 5. This task adds explicit tests covering: (a) retry runs when ASL is too high, (b) retry runs when long-sentences > 0, (c) retry runs when strong-spans is below min, (d) retry is REJECTED if it adds anchors, (e) retry is REJECTED if it loses SRC, (f) retry cost folds into total.

- [ ] **Step 6.1: Write the failing tests**

Append to `apps/api/src/tests/article-humanize.client.test.ts` after the existing `describe`:

```ts
describe("ArticleHumanizeClient.humanize — retry trigger", () => {
  function llmCustom(handler: (callIndex: number, args: any) => string) {
    let i = 0;
    return {
      createBlock: vi.fn(async (args: any) => {
        const out = handler(i, args);
        i += 1;
        return {
          id: `r${i}`,
          outputText: out,
          model: "gpt-5.2",
          promptTokens: 5,
          completionTokens: 5,
          costUsd: "0.000050",
          latencyMs: 50,
        };
      }),
    } as any;
  }

  it("triggers retry when phase 1 has a sentence over hard cap", async () => {
    // Phase-1 output: one long sentence (>24 words) — triggers `long`.
    // Phase-2 output: same shape but shorter, similar plain-text length to
    // input so the length-ratio guard does not fire after retry.
    const phase1Long = Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ");
    const phase2Short = Array.from({ length: 14 }, (_, i) => `w${i}xy`).join(" ");
    const phase1Out = `<h1>T</h1><p><strong>k</strong> ${phase1Long}.</p>`;
    const phase2Out = `<h1>T</h1><p><strong>k</strong> ${phase2Short}.</p>`;
    const llm = llmCustom((i, _args) => (i === 0 ? phase1Out : phase2Out));

    // Input has 14 word tokens; plain text length similar to phase-2 output.
    const inputHtml = `<h1>T</h1><p>${Array.from({ length: 14 }, (_, i) => `w${i}xy`).join(" ")}.</p>`;
    const client = new ArticleHumanizeClient(llm, stubEnv as any);
    const out = await client.humanize({
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      keyword: "k",
      language: "pl",
      htmlContent: inputHtml,
    });
    expect(out.stats.retryUsed).toBe(true);
    expect(out.stats.retryAccepted).toBe(true);
    expect(out.stats.totalCostUsd).toBe("0.000100"); // 0.000050 + 0.000050
    expect(out.stats.totalLatencyMs).toBe(100);
    expect(llm.createBlock).toHaveBeenCalledTimes(2);
  });

  it("rejects retry when it adds <a> tags", async () => {
    // Phase-1 output: long sentence triggers retry. Phase-2 output: introduces <a>.
    const phase1Long = Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ");
    const phase1Out = `<h1>T</h1><p><strong>k</strong> ${phase1Long}.</p>`;
    const phase2Out = `<h1>T</h1><p><strong>k</strong> short stuff. <a href="x">link</a>.</p>`;
    const llm = llmCustom((i, _args) => (i === 0 ? phase1Out : phase2Out));

    // Input plain-text length must be close to phase-1 length so the ratio
    // guard does not fire on the rejected-retry fallback path.
    const phase1Long30Words = Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ");
    const inputHtml = `<h1>T</h1><p>${phase1Long30Words}.</p>`;
    const client = new ArticleHumanizeClient(llm, stubEnv as any);
    const out = await client.humanize({
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      keyword: "k",
      language: "pl",
      htmlContent: inputHtml,
    });
    expect(out.stats.retryUsed).toBe(true);
    expect(out.stats.retryAccepted).toBe(false);
    // Final HTML is the phase-1 output, not phase-2.
    expect(out.htmlContent).not.toContain("<a href");
    expect(
      out.warnings.some((w) => w.kind === "humanize_retry_rejected_anchors"),
    ).toBe(true);
  });

  it("does not retry when retry is disabled even if triggers fire", async () => {
    const phase1Long = Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ");
    const phase1Out = `<h1>T</h1><p><strong>k</strong> ${phase1Long}.</p>`;
    const llm = llmCustom((_i, _args) => phase1Out);

    // Match phase-1 length to keep ratio guard happy on the disabled-retry path.
    const phase1Long30Words = Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ");
    const inputHtml = `<h1>T</h1><p>${phase1Long30Words}.</p>`;
    const client = new ArticleHumanizeClient(llm, {
      ...(stubEnv as any),
      ARTICLE_HUMANIZE_RETRY_ENABLED: false,
    });
    const out = await client.humanize({
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      keyword: "k",
      language: "pl",
      htmlContent: inputHtml,
    });
    expect(out.stats.retryUsed).toBe(false);
    expect(llm.createBlock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 6.2: Run tests to verify they pass (retry logic was already implemented in Task 5)**

Run: `pnpm --filter @sensai/api vitest run src/tests/article-humanize.client.test.ts`
Expected: PASS — both the original 3 tests and the new 3 retry tests, total 6.

- [ ] **Step 6.3: Commit**

```bash
git add apps/api/src/tests/article-humanize.client.test.ts
git commit -m "test(api): Plan 16 retry trigger + rejection scenarios"
```

---

## Task 7: Humanize client — hard-fail guards

**Files:**
- Modify: `apps/api/src/tools/article-humanize/article-humanize.client.ts` (insert guard block before `return`)
- Modify: `apps/api/src/tests/article-humanize.client.test.ts` (append guard tests)

- [ ] **Step 7.1: Write the failing tests**

Append to `apps/api/src/tests/article-humanize.client.test.ts`:

```ts
describe("ArticleHumanizeClient.humanize — hard-fail guards", () => {
  function llmReturning(html: string) {
    return {
      createBlock: vi.fn(async () => ({
        id: "r",
        outputText: html,
        model: "gpt-5.2",
        promptTokens: 1,
        completionTokens: 1,
        costUsd: "0",
        latencyMs: 1,
      })),
    } as any;
  }

  it("throws when <h1> missing", async () => {
    const inputHtml = "<h1>T</h1><p>x.</p>";
    const llm = llmReturning("<p>no heading</p>");
    const client = new ArticleHumanizeClient(llm, stubEnv as any);
    await expect(
      client.humanize({
        ctx: { runId: "r", stepId: "s", attempt: 1 },
        keyword: "k",
        language: "pl",
        htmlContent: inputHtml,
      }),
    ).rejects.toThrow(/missing.*h1/i);
  });

  it("throws when <a> tags appear in output", async () => {
    const inputHtml = "<h1>T</h1><p>x.</p>";
    const llm = llmReturning('<h1>T</h1><p><a href="x">x</a>.</p>');
    const client = new ArticleHumanizeClient(llm, stubEnv as any);
    await expect(
      client.humanize({
        ctx: { runId: "r", stepId: "s", attempt: 1 },
        keyword: "k",
        language: "pl",
        htmlContent: inputHtml,
      }),
    ).rejects.toThrow(/anchor|<a>/i);
  });

  it("throws when length ratio exceeds upper bound", async () => {
    const inputHtml = "<h1>T</h1><p>" + "x".repeat(100) + "</p>";
    // 250 chars of x — ratio 2.5x, way over 1.20.
    const out = "<h1>T</h1><p>" + "x".repeat(250) + "</p>";
    const llm = llmReturning(out);
    const client = new ArticleHumanizeClient(llm, stubEnv as any);
    await expect(
      client.humanize({
        ctx: { runId: "r", stepId: "s", attempt: 1 },
        keyword: "k",
        language: "pl",
        htmlContent: inputHtml,
      }),
    ).rejects.toThrow(/length ratio/i);
  });

  it("throws when length ratio drops below lower bound", async () => {
    const inputHtml = "<h1>T</h1><p>" + "x".repeat(200) + "</p>";
    // 50 chars — ratio ≈ 0.25, way below 0.80.
    const out = "<h1>T</h1><p>" + "x".repeat(50) + "</p>";
    const llm = llmReturning(out);
    const client = new ArticleHumanizeClient(llm, stubEnv as any);
    await expect(
      client.humanize({
        ctx: { runId: "r", stepId: "s", attempt: 1 },
        keyword: "k",
        language: "pl",
        htmlContent: inputHtml,
      }),
    ).rejects.toThrow(/length ratio/i);
  });

  it("throws when numbers are lost", async () => {
    // Input/output lengths must be similar so the length-ratio guard does not
    // fire first (guard order is h1 → anchor → ratio → numbers → sources).
    const inputHtml =
      "<h1>Tytuł testowy artykułu</h1><p>Spada o 20% w 2024.</p>";
    const llm = llmReturning(
      "<h1>Tytuł testowy artykułu</h1><p>Spada wyraźnie w 2024.</p>",
    );
    const client = new ArticleHumanizeClient(llm, stubEnv as any);
    await expect(
      client.humanize({
        ctx: { runId: "r", stepId: "s", attempt: 1 },
        keyword: "k",
        language: "pl",
        htmlContent: inputHtml,
      }),
    ).rejects.toThrow(/lost.*number/i);
  });

  it("throws when source citation count drops", async () => {
    // Source has no numbers (no year) so the number guard does not fire first.
    const inputHtml =
      "<h1>Tytuł</h1><p>Tekst dłuższy o pewnym temacie (Źródło: WHO — who.int).</p>";
    const llm = llmReturning(
      "<h1>Tytuł</h1><p>Tekst dłuższy o pewnym temacie i jeszcze trochę więcej.</p>",
    );
    const client = new ArticleHumanizeClient(llm, stubEnv as any);
    await expect(
      client.humanize({
        ctx: { runId: "r", stepId: "s", attempt: 1 },
        keyword: "k",
        language: "pl",
        htmlContent: inputHtml,
      }),
    ).rejects.toThrow(/source.*lost|placeholder|sources count/i);
  });
});
```

- [ ] **Step 7.2: Run tests to verify they fail**

Run: `pnpm --filter @sensai/api vitest run src/tests/article-humanize.client.test.ts`
Expected: FAIL — guards not yet implemented; the client returns instead of throwing.

- [ ] **Step 7.3: Insert guard block in the client**

Open `apps/api/src/tools/article-humanize/article-humanize.client.ts`. Find the comment `// FINAL TEXT METRICS — for stats output.` and INSERT the guard block IMMEDIATELY AFTER `const outputLength = finalText.length;` and `const sourcesAfter = countMatches(finalHtml, SOURCE_CITATION_RE);` and `const ratio = inputLength > 0 ? outputLength / inputLength : 0;`. The guards must run BEFORE warn-only style checks and BEFORE the return statement.

Add this block:

```ts
    // ---------- HARD-FAIL GUARDS (5) ----------
    // GUARD 1: <h1> required.
    if (!/<h1\b[^>]*>/i.test(finalHtml)) {
      throw new Error("article.humanize: hard fail — missing <h1>");
    }

    // GUARD 2: no <a> tags.
    if (/<a\b[^>]*>/i.test(finalHtml)) {
      throw new Error("article.humanize: hard fail — <a> anchor added");
    }

    // GUARD 3: length ratio bounds (two-sided).
    if (
      ratio < this.env.ARTICLE_HUMANIZE_MIN_LEN_RATIO ||
      ratio > this.env.ARTICLE_HUMANIZE_MAX_LEN_RATIO
    ) {
      throw new Error(
        `article.humanize: hard fail — length ratio ${ratio.toFixed(3)} outside [${this.env.ARTICLE_HUMANIZE_MIN_LEN_RATIO}, ${this.env.ARTICLE_HUMANIZE_MAX_LEN_RATIO}]`,
      );
    }

    // GUARD 4: numbers preserved.
    const inputNumbers = extractNumberSet(inputText);
    const outputNumbers = extractNumberSet(finalText);
    const lostNumbers = [...inputNumbers].filter((v) => !outputNumbers.has(v));
    if (lostNumbers.length > 0) {
      throw new Error(
        `article.humanize: hard fail — lost numbers: ${lostNumbers.slice(0, 5).join(", ")}`,
      );
    }

    // GUARD 5: source citation count.
    if (sourcesAfter < sourcesBefore) {
      throw new Error(
        `article.humanize: hard fail — sources count dropped ${sourcesBefore} → ${sourcesAfter}`,
      );
    }
    // ---------- END GUARDS ----------
```

Update the existing import line at the top of the file to include `extractNumberSet`:

```ts
import {
  extractNumberSet,
  extractPlainText,
} from "../article-protect/article-protect.guards";
```

(Task 5 only imported `extractPlainText`. Replace that single-import line with the multi-import form above.)

- [ ] **Step 7.4: Run tests to verify they pass**

Run: `pnpm --filter @sensai/api vitest run src/tests/article-humanize.client.test.ts`
Expected: PASS — all 12 tests green (3 phase-1 + 3 retry + 6 guard).

- [ ] **Step 7.5: Commit**

```bash
git add apps/api/src/tools/article-humanize/article-humanize.client.ts apps/api/src/tests/article-humanize.client.test.ts
git commit -m "feat(api): Plan 16 humanize client hard-fail guards"
```

---

## Task 8: NestJS module wiring for humanize tool

**Files:**
- Create: `apps/api/src/tools/article-humanize/article-humanize.module.ts`

No test in this task — wiring is exercised by the handler test in Task 10.

- [ ] **Step 8.1: Create the module**

```ts
// apps/api/src/tools/article-humanize/article-humanize.module.ts
import { Module } from "@nestjs/common";
import OpenAI from "openai";
import { LlmModule } from "../../llm/llm.module";
import { OpenAIResponsesClient } from "../../llm/openai-responses.client";
import { ArticleHumanizeClient } from "./article-humanize.client";
import { loadEnv } from "../../config/env";

@Module({
  imports: [LlmModule],
  providers: [
    {
      provide: "OPENAI_RESPONSES_SDK",
      useFactory: () => {
        const env = loadEnv();
        return new OpenAI({ apiKey: env.OPENAI_API_KEY });
      },
    },
    OpenAIResponsesClient,
    {
      provide: "ARTICLE_HUMANIZE_ENV",
      useFactory: () => {
        const env = loadEnv();
        return {
          ARTICLE_HUMANIZE_MODEL: env.ARTICLE_HUMANIZE_MODEL,
          ARTICLE_HUMANIZE_ASL_MIN: env.ARTICLE_HUMANIZE_ASL_MIN,
          ARTICLE_HUMANIZE_ASL_MAX: env.ARTICLE_HUMANIZE_ASL_MAX,
          ARTICLE_HUMANIZE_SENTENCE_HARD_CAP: env.ARTICLE_HUMANIZE_SENTENCE_HARD_CAP,
          ARTICLE_HUMANIZE_MIN_STRONG_PER_BLOCK: env.ARTICLE_HUMANIZE_MIN_STRONG_PER_BLOCK,
          ARTICLE_HUMANIZE_MAX_STRONG_PER_BLOCK: env.ARTICLE_HUMANIZE_MAX_STRONG_PER_BLOCK,
          ARTICLE_HUMANIZE_STRONG_WORDS_PER_BLOCK: env.ARTICLE_HUMANIZE_STRONG_WORDS_PER_BLOCK,
          ARTICLE_HUMANIZE_BOLD_SHARE_MAX: env.ARTICLE_HUMANIZE_BOLD_SHARE_MAX,
          ARTICLE_HUMANIZE_MIN_LEN_RATIO: env.ARTICLE_HUMANIZE_MIN_LEN_RATIO,
          ARTICLE_HUMANIZE_MAX_LEN_RATIO: env.ARTICLE_HUMANIZE_MAX_LEN_RATIO,
          ARTICLE_HUMANIZE_RETRY_ENABLED: env.ARTICLE_HUMANIZE_RETRY_ENABLED,
          ARTICLE_HUMANIZE_LANG_PROBE_THRESHOLD: env.ARTICLE_HUMANIZE_LANG_PROBE_THRESHOLD,
        };
      },
    },
    ArticleHumanizeClient,
  ],
  exports: [ArticleHumanizeClient],
})
export class ArticleHumanizeModule {}
```

- [ ] **Step 8.2: Type-check**

Run: `cd apps/api && pnpm tsc --noEmit`
Expected: Exit 0.

- [ ] **Step 8.3: Commit**

```bash
git add apps/api/src/tools/article-humanize/article-humanize.module.ts
git commit -m "feat(api): wire ArticleHumanizeModule"
```

---

## Task 9: Humanize handler

**Files:**
- Create: `apps/api/src/handlers/article-humanize.handler.ts`
- Test: `apps/api/src/tests/article-humanize.handler.test.ts`

- [ ] **Step 9.1: Write the failing test**

Create `apps/api/src/tests/article-humanize.handler.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { ArticleHumanizeHandler } from "../handlers/article-humanize.handler";

const stubEnv = {
  ARTICLE_HUMANIZE_MODEL: "gpt-5.2",
  ARTICLE_HUMANIZE_TTL_DAYS: 7,
} as const;

const sampleIntermediate = {
  meta: {
    keyword: "kortyzol",
    language: "pl",
    model: "gpt-5.2",
    promptVersion: "v1",
    generatedAt: "2026-05-04T12:00:00.000Z",
  },
  htmlContent:
    "<h1>Tytuł testowy</h1><p>Akapit testowy z liczbą 20%.</p>",
  stats: {
    inputLength: 100,
    outputLength: 100,
    growth: 0,
    sourcesBefore: 0,
    sourcesAfter: 0,
    formattingBefore: { strong: 0, italic: 0, blockquote: 0, br: 0 },
    formattingAfter: { strong: 0, italic: 0, blockquote: 0, br: 0 },
    totalCostUsd: "0",
    totalLatencyMs: 0,
  },
  protection: {
    srcPlaceholdersTotal: 0,
    srcPlaceholdersMissing: 0,
    spansTotal: 0,
    spansMissing: 0,
  },
  warnings: [],
};

describe("ArticleHumanizeHandler", () => {
  it("throws when previousOutputs.intermediate missing", async () => {
    const stubClient = { humanize: vi.fn() } as any;
    const stubCache = {
      getOrSet: async (opts: any) => (await opts.fetcher()).result,
    } as any;
    const handler = new ArticleHumanizeHandler(stubClient, stubCache, stubEnv as any);
    await expect(
      handler.execute({
        run: { id: "r", input: {} },
        step: { id: "s" },
        project: { id: "p", config: {} },
        previousOutputs: {},
        attempt: 1,
        forceRefresh: false,
      } as any),
    ).rejects.toThrow(/intermediate/i);
  });

  it("delegates to client and returns ArticleHumanizeResult shape", async () => {
    const stubClient = {
      humanize: vi.fn(async () => ({
        htmlContent: "<h1>T</h1><p>Zhumanizowane.</p>",
        warnings: [],
        protection: {
          srcPlaceholdersTotal: 0,
          srcPlaceholdersMissing: 0,
          spansTotal: 1,
          spansMissing: 0,
        },
        stats: {
          inputLength: 100,
          outputLength: 95,
          ratio: 0.95,
          sourcesBefore: 0,
          sourcesAfter: 0,
          emDashesReplaced: 0,
          retryUsed: false,
          retryAccepted: false,
          readability: {
            wordsTotal: 10,
            sentencesTotal: 1,
            avgSentenceLength: 10,
            longSentencesGtCap: 0,
            strongSpans: 0,
            boldTokenCount: 0,
            boldShare: 0,
          },
          sentence: {
            varianceInput: 5,
            varianceOutput: 8,
            cvOutput: 0.5,
            minLength: 4,
            maxLength: 14,
            avgLength: 10,
          },
        },
        cost: { costUsd: "0.0001", latencyMs: 100 },
      })),
    } as any;
    const stubCache = {
      getOrSet: async (opts: any) => (await opts.fetcher()).result,
    } as any;
    const handler = new ArticleHumanizeHandler(stubClient, stubCache, stubEnv as any);

    const res = await handler.execute({
      run: { id: "r", input: {} },
      step: { id: "s" },
      project: { id: "p", config: {} },
      previousOutputs: { intermediate: sampleIntermediate },
      attempt: 1,
      forceRefresh: false,
    } as any);

    const out = res.output as any;
    expect(out.meta.keyword).toBe("kortyzol");
    expect(out.meta.language).toBe("pl");
    expect(out.meta.model).toBe("gpt-5.2");
    expect(out.meta.promptVersion).toBe("v1");
    expect(out.htmlContent).toContain("<h1>T</h1>");
    expect(out.stats.inputLength).toBe(100);
    expect(out.stats.outputLength).toBe(95);
    expect(out.stats.totalCostUsd).toBe("0.0001");
    expect(out.stats.totalLatencyMs).toBe(100);
    expect(stubClient.humanize).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 9.2: Run test to verify it fails**

Run: `pnpm --filter @sensai/api vitest run src/tests/article-humanize.handler.test.ts`
Expected: FAIL — handler module not found.

- [ ] **Step 9.3: Create the handler**

```ts
// apps/api/src/handlers/article-humanize.handler.ts
import { Inject, Injectable, Logger } from "@nestjs/common";
import { createHash } from "node:crypto";
import type {
  StepContext,
  StepHandler,
  StepResult,
} from "../orchestrator/step-handler";
import {
  ArticleHumanizeResult,
  ArticleIntermediateResult,
} from "@sensai/shared";
import { ToolCacheService } from "../tools/tool-cache.service";
import { ArticleHumanizeClient } from "../tools/article-humanize/article-humanize.client";
import type { Env } from "../config/env";

type HandlerEnv = Pick<Env, "ARTICLE_HUMANIZE_MODEL" | "ARTICLE_HUMANIZE_TTL_DAYS">;

const PROMPT_VERSION = "v1";

@Injectable()
export class ArticleHumanizeHandler implements StepHandler {
  readonly type = "tool.article.humanize";
  private readonly logger = new Logger(ArticleHumanizeHandler.name);

  constructor(
    private readonly client: ArticleHumanizeClient,
    private readonly cache: ToolCacheService,
    @Inject("ARTICLE_HUMANIZE_HANDLER_ENV") private readonly env: HandlerEnv,
  ) {}

  async execute(ctx: StepContext): Promise<StepResult> {
    const prev = ctx.previousOutputs.intermediate;
    if (prev === undefined || prev === null) {
      throw new Error("article.humanize requires previousOutputs.intermediate");
    }
    const intermediate = ArticleIntermediateResult.parse(prev);
    const inputHash = sha256(intermediate.htmlContent);

    const result = await this.cache.getOrSet<ArticleHumanizeResult>({
      tool: "article",
      method: "humanize",
      params: {
        inputHash,
        model: this.env.ARTICLE_HUMANIZE_MODEL,
        promptVersion: PROMPT_VERSION,
      },
      ttlSeconds: this.env.ARTICLE_HUMANIZE_TTL_DAYS * 24 * 3600,
      runId: ctx.run.id,
      stepId: ctx.step.id,
      forceRefresh: ctx.forceRefresh,
      fetcher: async () => {
        const out = await this.client.humanize({
          ctx: { runId: ctx.run.id, stepId: ctx.step.id, attempt: ctx.attempt },
          keyword: intermediate.meta.keyword,
          language: intermediate.meta.language,
          htmlContent: intermediate.htmlContent,
        });

        const result: ArticleHumanizeResult = {
          meta: {
            keyword: intermediate.meta.keyword,
            language: intermediate.meta.language,
            model: this.env.ARTICLE_HUMANIZE_MODEL,
            promptVersion: PROMPT_VERSION,
            generatedAt: new Date().toISOString(),
          },
          htmlContent: out.htmlContent,
          stats: {
            inputLength: out.stats.inputLength,
            outputLength: out.stats.outputLength,
            ratio: out.stats.ratio,
            sourcesBefore: out.stats.sourcesBefore,
            sourcesAfter: out.stats.sourcesAfter,
            emDashesReplaced: out.stats.emDashesReplaced,
            retryUsed: out.stats.retryUsed,
            retryAccepted: out.stats.retryAccepted,
            readability: out.stats.readability,
            sentence: out.stats.sentence,
            totalCostUsd: out.cost.costUsd,
            totalLatencyMs: out.cost.latencyMs,
          },
          protection: out.protection,
          warnings: out.warnings,
        };

        ArticleHumanizeResult.parse(result); // self-check before caching

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
        `article.humanize: ${result.warnings.length} warnings`,
      );
    }

    this.logger.log(
      {
        runId: ctx.run.id,
        stepId: ctx.step.id,
        ratio: result.stats.ratio,
        retryUsed: result.stats.retryUsed,
        retryAccepted: result.stats.retryAccepted,
        cv: result.stats.sentence.cvOutput,
        asl: result.stats.readability.avgSentenceLength,
        boldShare: result.stats.readability.boldShare,
        costUsd: result.stats.totalCostUsd,
      },
      "article.humanize done",
    );

    return { output: result };
  }
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
```

- [ ] **Step 9.4: Run tests to verify they pass**

Run: `pnpm --filter @sensai/api vitest run src/tests/article-humanize.handler.test.ts`
Expected: PASS, both tests green.

- [ ] **Step 9.5: Commit**

```bash
git add apps/api/src/handlers/article-humanize.handler.ts apps/api/src/tests/article-humanize.handler.test.ts
git commit -m "feat(api): add Plan 16 article.humanize handler"
```

---

## Task 10: Register handler in `handlers.module.ts`

**Files:**
- Modify: `apps/api/src/handlers/handlers.module.ts`

No new test — Task 9's handler test exercises the handler in isolation; integration is verified by Task 13 smoke.

- [ ] **Step 10.1: Add the import lines**

At the top of `apps/api/src/handlers/handlers.module.ts`, after the `ArticleIntermediateHandler` import:

```ts
import { ArticleHumanizeHandler } from "./article-humanize.handler";
```

After the `ArticleIntermediateModule` import:

```ts
import { ArticleHumanizeModule } from "../tools/article-humanize/article-humanize.module";
```

- [ ] **Step 10.2: Register module in `imports` array**

Add `ArticleHumanizeModule` to the `imports: []` array, after `ArticleIntermediateModule`.

- [ ] **Step 10.3: Add ENV provider**

In the `providers: []` array, after the `ARTICLE_INTERMEDIATE_HANDLER_ENV` provider, add:

```ts
    {
      provide: "ARTICLE_HUMANIZE_HANDLER_ENV",
      useFactory: () => loadEnv(),
    },
```

- [ ] **Step 10.4: Add handler to `providers` and to `STEP_HANDLERS` factory**

Add `ArticleHumanizeHandler` to the `providers: []` list (after `ArticleIntermediateHandler`).

In the `STEP_HANDLERS` factory function:
1. Add `articleHumanize: ArticleHumanizeHandler,` parameter (after `articleIntermediate`).
2. Add `articleHumanize,` to the returned array (after `articleIntermediate`).
3. Add `ArticleHumanizeHandler,` to the `inject: []` array (after `ArticleIntermediateHandler`).

- [ ] **Step 10.5: Type-check**

Run: `cd apps/api && pnpm tsc --noEmit`
Expected: Exit 0.

- [ ] **Step 10.6: Commit**

```bash
git add apps/api/src/handlers/handlers.module.ts
git commit -m "feat(api): register ArticleHumanizeHandler in HandlersModule"
```

---

## Task 11: Seed template — add Plan 16 variant with `humanize` step

**Files:**
- Modify: `apps/api/src/seed/seed.ts`

- [ ] **Step 11.1: Append a new template AFTER the Plan 15 template**

In `apps/api/src/seed/seed.ts`, find the `blogSeoIntermediate` upsert (around line 196). Add a new template AFTER it, before the `console.log("Seeded:")` block:

```ts
  // Plan 16 — Full Pipeline + Humanize. Terminal at `humanize`.
  const blogSeoHumanize = await upsertTemplate(
    db,
    "Blog SEO — full pipeline + draft + enrich + optimize + intermediate + humanize",
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
        { key: "humanize",     type: "tool.article.humanize",     auto: true,  dependsOn: ["intermediate"] },
      ],
    },
  );
```

- [ ] **Step 11.2: Add the new template to the `console.log` summary at the bottom**

After the existing `blogSeoIntermediate` log line (~line 234), add:

```ts
  console.log(`    "${blogSeoHumanize.name}" v${blogSeoHumanize.version}: ${blogSeoHumanize.id}`);
```

- [ ] **Step 11.3: Type-check**

Run: `cd apps/api && pnpm tsc --noEmit`
Expected: Exit 0.

- [ ] **Step 11.4: Run the seed**

Pre-req: local database must be running (`pnpm dev:infra`). Then:

Run: `pnpm db:seed`
Expected: Successful seed — output includes `"Blog SEO — full pipeline + draft + enrich + optimize + intermediate + humanize" v1: <uuid>`.

- [ ] **Step 11.5: Commit**

```bash
git add apps/api/src/seed/seed.ts
git commit -m "feat(api): seed Plan 16 humanize template variant"
```

---

## Task 12: UI renderer for `tool.article.humanize`

**Files:**
- Create: `apps/web/src/components/step-output/article-humanize.tsx`
- Modify: `apps/web/src/components/step-output/index.tsx`

- [ ] **Step 12.1: Create the renderer**

```tsx
"use client";
import type { ArticleHumanizeResult } from "@sensai/shared";

function isHumanizeResult(v: unknown): v is ArticleHumanizeResult {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.htmlContent === "string" &&
    !!o.meta &&
    !!o.stats &&
    !!o.protection
  );
}

export function ArticleHumanizeOutput({ value }: { value: unknown }) {
  if (!isHumanizeResult(value)) {
    return <div className="text-sm text-muted-foreground">Brak danych</div>;
  }
  return <ArticleHumanizeRenderer output={value} />;
}

function ArticleHumanizeRenderer({ output }: { output: ArticleHumanizeResult }) {
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

  const ratioPct = `${((stats.ratio - 1) * 100).toFixed(1)}%`;
  const r = stats.readability;
  const s = stats.sentence;

  return (
    <div className="space-y-4">
      <header className="rounded border bg-slate-50 p-3">
        <div className="text-sm text-muted-foreground">
          keyword: <span className="font-mono">{meta.keyword}</span> · language: {meta.language} · model: {meta.model} · promptVersion: {meta.promptVersion}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {stats.inputLength} → {stats.outputLength} chars (ratio {stats.ratio.toFixed(3)} · Δ{ratioPct}) · źródła: {stats.sourcesBefore} → {stats.sourcesAfter} ·
          {" "}spans missing: {protection.spansMissing} · ${stats.totalCostUsd} · {stats.totalLatencyMs} ms
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          ASL: {r.avgSentenceLength} · long&gt;cap: {r.longSentencesGtCap} · strong: {r.strongSpans} · bold share: {r.boldShare.toFixed(4)}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          rytm: CV {s.cvOutput.toFixed(3)} · zakres {s.minLength}–{s.maxLength} · avg {s.avgLength} · variance {s.varianceInput.toFixed(2)} → {s.varianceOutput.toFixed(2)}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          retry: used={String(stats.retryUsed)} · accepted={String(stats.retryAccepted)} · em-dashes replaced: {stats.emDashesReplaced}
        </div>
      </header>

      <section>
        <div className="mb-2 text-sm font-semibold">Artykuł zhumanizowany (20 reguł anty-AI)</div>
        <iframe
          title="Humanize preview"
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

- [ ] **Step 12.2: Register in `index.tsx`**

In `apps/web/src/components/step-output/index.tsx`:

1. Add import after the `ArticleIntermediateOutput` import:

```ts
import { ArticleHumanizeOutput } from "./article-humanize";
```

2. Add a `case` in the `switch (type)` block after `case "tool.article.intermediate":`:

```tsx
    case "tool.article.humanize":
      return <ArticleHumanizeOutput value={value} />;
```

3. Add to `hasRichRenderer`:

```ts
    type === "tool.article.humanize"
```

(append with `||` after the existing `tool.article.intermediate` term).

- [ ] **Step 12.3: Type-check the web app**

Run: `pnpm --filter @sensai/web tsc --noEmit`
Expected: Exit 0.

- [ ] **Step 12.4: Commit**

```bash
git add apps/web/src/components/step-output/article-humanize.tsx apps/web/src/components/step-output/index.tsx
git commit -m "feat(web): add ArticleHumanizeOutput renderer + index registration"
```

---

## Task 13: Smoke test — `smoke:plan-16`

**Files:**
- Create: `scripts/smoke-plan-16.ts`
- Modify: root `package.json`

- [ ] **Step 13.1: Create the smoke script**

```ts
#!/usr/bin/env tsx
/**
 * Plan 16 manual smoke test — tool.article.humanize.
 *
 * Reads Plan 15 intermediate smoke output (`scripts/smoke-output/plan-15-intermediate.json`)
 * and runs ArticleHumanizeHandler in isolation.
 *
 * Pre-req: run `pnpm smoke:plan-15-intermediate` first.
 *
 * Run: pnpm smoke:plan-16
 */
import "reflect-metadata";
import { config as dotenvConfig } from "dotenv";
import { join, resolve } from "node:path";
dotenvConfig({ path: resolve(__dirname, "../.env") });
dotenvConfig({ path: resolve(__dirname, "../apps/api/.env"), override: true });
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import { OpenAIResponsesClient } from "../apps/api/src/llm/openai-responses.client";
import { ArticleHumanizeClient } from "../apps/api/src/tools/article-humanize/article-humanize.client";
import { ArticleHumanizeHandler } from "../apps/api/src/handlers/article-humanize.handler";
import { loadEnv } from "../apps/api/src/config/env";
import { ArticleIntermediateResult } from "@sensai/shared";

const OUTPUT_DIR = resolve(__dirname, "smoke-output");
const INPUT_FILE = join(OUTPUT_DIR, "plan-15-intermediate.json");

async function main() {
  if (!existsSync(INPUT_FILE)) {
    console.error(
      `[smoke] FAIL — input fixture missing: ${INPUT_FILE}\n` +
        "Run `pnpm smoke:plan-15-intermediate` first to produce it.",
    );
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(INPUT_FILE, "utf-8"));
  const intermediate = ArticleIntermediateResult.parse(raw);
  console.log(
    `[smoke] intermediate input: ${intermediate.htmlContent.length} chars, ` +
      `language=${intermediate.meta.language}`,
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
  const humanizeClient = new ArticleHumanizeClient(responsesClient, env);
  const handler = new ArticleHumanizeHandler(humanizeClient, stubCache, env);

  const ctx = {
    run: { id: randomUUID(), input: { topic: intermediate.meta.keyword } },
    step: { id: "smoke-step-article-humanize" },
    project: { id: "smoke-project", config: {} },
    previousOutputs: { intermediate },
    attempt: 1,
    forceRefresh: false,
  } as any;

  console.log("[smoke] article.humanize …");
  const t0 = Date.now();
  const res = await handler.execute(ctx);
  const ms = Date.now() - t0;
  const out = res.output as any;

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(join(OUTPUT_DIR, "plan-16-humanize.json"), JSON.stringify(out, null, 2), "utf-8");
  writeFileSync(join(OUTPUT_DIR, "plan-16-humanize.html"), out.htmlContent, "utf-8");

  const r = out.stats.readability;
  const s = out.stats.sentence;
  console.log(
    `[smoke] article.humanize done: ${ms}ms | ` +
      `chars ${out.stats.inputLength}→${out.stats.outputLength} (ratio ${out.stats.ratio.toFixed(3)}) ` +
      `sources ${out.stats.sourcesBefore}→${out.stats.sourcesAfter} ` +
      `ASL ${r.avgSentenceLength} long>cap ${r.longSentencesGtCap} bold ${r.boldShare} ` +
      `cv ${s.cvOutput} ` +
      `retry ${out.stats.retryUsed}/${out.stats.retryAccepted} ` +
      `cost=$${out.stats.totalCostUsd} ` +
      `warnings=${out.warnings.length}`,
  );
  // Soft assertions, non-blocking for benchmark deviations.
  console.log(`[smoke] ASSERT ratio in [0.80, 1.20]: ${out.stats.ratio >= 0.80 && out.stats.ratio <= 1.20 ? "PASS" : "FAIL"}`);
  console.log(`[smoke] ASSERT sourcesAfter>=sourcesBefore: ${out.stats.sourcesAfter >= out.stats.sourcesBefore ? "PASS" : "FAIL"}`);
  console.log(`[smoke] ASSERT no <a> tags: ${!/<a\b/i.test(out.htmlContent) ? "PASS" : "FAIL"}`);
  console.log(`[smoke] ASSERT cv > 0.45 (lesson target): ${s.cvOutput > 0.45 ? "PASS" : `WARN (got ${s.cvOutput})`}`);
  console.log(`[smoke] ASSERT bold_share <= 0.08: ${r.boldShare <= 0.08 ? "PASS" : `WARN (got ${r.boldShare})`}`);
  console.log("[smoke] PASS — Plan 16 article.humanize smoke complete");
}

main().catch((e) => {
  console.error("[smoke] FAIL:", e);
  process.exit(1);
});
```

- [ ] **Step 13.2: Add npm script in root `package.json`**

In `package.json` (project root), in the `scripts: { ... }` block, add a new entry after `smoke:plan-15-intermediate`:

```json
"smoke:plan-16": "apps/api/node_modules/.bin/tsx --tsconfig apps/api/tsconfig.json scripts/smoke-plan-16.ts",
```

- [ ] **Step 13.3: Type-check (no run yet — requires real API key)**

Run: `cd apps/api && pnpm tsc --noEmit`
Expected: Exit 0.

- [ ] **Step 13.4: Commit**

```bash
git add scripts/smoke-plan-16.ts package.json
git commit -m "test(article-humanize): add Plan 16 manual smoke script"
```

- [ ] **Step 13.5: (Optional, manual) Execute the smoke against real LLM**

Pre-req: `pnpm smoke:plan-15-intermediate` has produced `scripts/smoke-output/plan-15-intermediate.json`.

Run: `pnpm smoke:plan-16`

Expected:
- Console reports `[smoke] PASS — Plan 16 article.humanize smoke complete` on exit.
- Files `scripts/smoke-output/plan-16-humanize.json` and `plan-16-humanize.html` are written.
- Soft-assertion checks: ratio within [0.80, 1.20]; sourcesAfter ≥ sourcesBefore; no `<a>` tags.

Reference benchmark from the lesson (`docs/edu/lekcja-3-5/T3F5-article_humanized_metrics.json`) for sanity:
- ASL ≈ 11.6 (target 12–20; the reference output came in below — acceptable)
- bold_share ≈ 0.07
- ratio ≈ 1.07
- 6/6 sources preserved
- 0 warnings

The smoke does NOT gate on these numbers — they are guidelines.

- [ ] **Step 13.6: (Conditional) Commit smoke output if user requests durable artefact**

If the user wants the smoke output checked in (matches the Plan 15 commit pattern `39bba43 test(article): commit Plan 15 smoke outputs`):

```bash
git add scripts/smoke-output/plan-16-humanize.json scripts/smoke-output/plan-16-humanize.html
git commit -m "test(article-humanize): commit Plan 16 smoke outputs"
```

Otherwise skip — the smoke output is gitignored-style ephemeral. Defer to user preference at execution time.

---

## Task 14: Web routing — `tool.article.humanize` in step-output index

This task is structurally a sub-task of Task 12 (we did it inline there). It exists here as a verification check before declaring the plan done.

- [ ] **Step 14.1: Verify `index.tsx` renders the humanize step**

Open `apps/web/src/components/step-output/index.tsx`. Verify three things are present:
1. `import { ArticleHumanizeOutput } from "./article-humanize";` near the other imports.
2. A `case "tool.article.humanize":` clause in the switch.
3. `type === "tool.article.humanize"` in the `hasRichRenderer` boolean.

If any are missing, return to Task 12.2 and add them.

- [ ] **Step 14.2: Run the dev server (manual UI check, optional)**

Pre-req: `pnpm dev:infra && pnpm dev:api && pnpm dev:web` running, a Plan 16 template seeded, a run with the humanize step completed.

Open the run detail page and click on the `humanize` step. Verify:
- The header chip shows keyword, language, model, promptVersion, char counts, ratio, ASL, CV, bold_share, retry-used/accepted, em-dashes-replaced, source preservation, cost, latency.
- The iframe renders the humanized HTML with proper styling.
- Warnings (if any) appear in the amber section.

- [ ] **Step 14.3: No commit needed (Task 12 already committed all relevant changes).**

---

## Task 15: Update auto-memory with Plan 16 status

**Files:**
- Modify: `/Users/datezone/.claude/projects/-Users-datezone-Projekty-sensai-content-generation/memory/MEMORY.md`
- Create: `/Users/datezone/.claude/projects/-Users-datezone-Projekty-sensai-content-generation/memory/project_plan_16_article_humanize.md`

This task is for the executing agent (Claude Code) to record completion in auto-memory, mirroring the entries for Plans 01–15. It is NOT a code change.

- [ ] **Step 15.1: Create the memory file**

Create `project_plan_16_article_humanize.md` with frontmatter and a one-paragraph summary:

```markdown
---
name: Plan 16 Article Humanize
description: COMPLETED + MERGED to main on YYYY-MM-DD; tool.article.humanize step (20 anti-AI rules across 4 tiers) + 2-pass retry + UI renderer + smoke
type: project
---

Plan 16 — Article Humanize: COMPLETED + MERGED to main on YYYY-MM-DD (merge commit XXXXXXX). Adds `tool.article.humanize` step after `tool.article.intermediate`. Implements the v3.3 anti-AI prompt (20 rules: banned vocabulary/transitions, sentence-rhythm CV>0.45, opener/closer rules, parenthetical asides, active voice, filler elimination, sentence-starter diversity, natural punctuation, density variation, no chatbot artefacts, consistent register, personal pronouns, tense mixing, proper-noun density, passive limit, rhetorical questions). Two-pass: humanize → conditional readability retry (ASL>20 or long_sentences>0 or strong_spans<min). Hard-fail guards: missing h1, lost numbers, sources count drop, added anchors, length ratio outside [0.80, 1.20]. Warn-only: low CV, English-probe, span drift, retry-used flag. Em-dash cleanup (`—` → ` - `) post-LLM. Reuses Plan 15 `article-protect` package (tokenize/restore/guards). Smoke: `pnpm smoke:plan-16` reads `plan-15-intermediate.json` fixture.

**Why:** Lesson 3.5 (`docs/edu/lekcja-3-5/`) provides the anti-AI ruleset and reference Python implementation. Goal is making the article statistically distinguishable from raw LLM output (perplexity + burstiness signals).

**How to apply:** Plan 16 sits at the end of the Plan 15 pipeline. Re-running `intermediate` cascades to `humanize`. Cache key includes `PROMPT_VERSION`; bump to `v2` if rules change.
```

- [ ] **Step 15.2: Add a line to `MEMORY.md`**

In the index file `MEMORY.md`, append (in the project-plans section, after the Plan 15 line):

```
- [Plan 16 Article Humanize](project_plan_16_article_humanize.md) — COMPLETED + MERGED to main on YYYY-MM-DD (merge commit XXXXXXX); tool.article.humanize + 20 anti-AI rules + 2-pass retry + UI; smoke runs against Plan 15 output
```

Replace `YYYY-MM-DD` and `XXXXXXX` with the actual merge date and short SHA at execution time.

---

## Self-Review (post-write check, executed by plan author)

**1. Spec coverage** — every requirement in the writing-plans-skill brief mapped to a task:
- ✅ New step `tool.article.humanize` after intermediate → Task 9 (handler) + Task 11 (seed)
- ✅ Reuse `article-protect` (tokenize/restore/guards) → Task 5 imports it; no duplicate logic
- ✅ Port v3.3 prompt verbatim with span-based number safety → Task 4
- ✅ Dynamic substitution of `{{LANGUAGE}}`, `{{ASL_*}}`, `{{*_STRONG_PER_BLOCK}}`, `{{STRONG_WORDS_PER_BLOCK}}`, `{{SENTENCE_HARD_CAP}}` → Task 4 prompt builder
- ✅ Em-dash cleanup post-LLM → Task 5 `collapseEmDashes` applied to Phase-1 + Phase-2 finals
- ✅ Sentence variance + length range + readability + length ratio metrics → Task 3 metrics module + Task 5 wiring
- ✅ Hard-fail guards (missing `<h1>`, lost numbers, sources count, added anchors, length ratio bounds) → Task 7
- ✅ Warn-only checks (language probe, CV, retry flag, span drift) → Task 5/6/7 collectively
- ✅ Two-pass with conditional retry (ASL > MAX OR long > 0 OR strong < MIN) → Task 5 + Task 6 tests
- ✅ Handler + UI in same plan → Task 12
- ✅ Model `gpt-5.2` default → Task 2 env default
- ✅ Smoke against `T3F5-output_intermediate.html` (or its Plan 15 equivalent) → Task 13 reads `plan-15-intermediate.json`

**2. Placeholder scan** — searched the plan for "TBD", "TODO", "implement later", "fill in details", "appropriate error handling", "similar to". None found. All steps include actual code or actual command output.

**3. Type/name consistency** — cross-checked:
- Schema names: `ArticleHumanizeResult`, `ArticleHumanizeStats`, `ArticleHumanizeReadability`, `ArticleHumanizeSentenceStats`, `ArticleHumanizeWarning` — used consistently across Tasks 1, 5, 9, 12.
- Function names: `buildHumanizeSystemPrompt`, `buildHumanizeRetryPrompt`, `computeReadability`, `computeSentenceStats`, `computeSentenceVarianceForText`, `englishProbeHits`, `shouldRetry`, `formatBoldShare` — match across Tasks 3, 4, 5.
- DI tokens: `ARTICLE_HUMANIZE_ENV` (client) vs `ARTICLE_HUMANIZE_HANDLER_ENV` (handler) — consistent with Plan 15's split. Tasks 8, 9, 10.
- Step type string: `tool.article.humanize` — Tasks 9, 10, 11, 12.
- Warning kinds: `humanize_spans_missing`, `humanize_language_probe`, `humanize_low_burstiness`, `humanize_retry_used`, `humanize_retry_rejected_anchors` — match between schema (Task 1) and emitting code (Task 5).

**4. Edge case noted but not fully testable in unit tests** — Task 13 smoke is the integration test against a real LLM. Soft-assertions cover the lesson benchmarks; hard test coverage is at the unit level.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-05-plan-16-article-humanize.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
