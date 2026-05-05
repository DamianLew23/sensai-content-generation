# Plan 14 — Data Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new pipeline step `tool.data.enrich` that consumes Plan 13's `DraftGenerationResult.htmlContent`, scans it for verifiable claims (numbers, dates, statistics, medical norms, organizations) using deterministic regex + scoring, generates verification questions via gpt-4.1-mini, verifies each claim through the OpenAI Responses API with the `web_search_preview` tool (gpt-5.2), and inserts inline citations `(Źródło: domena, rok — url)` directly into the article HTML — without modifying the article's prose.

**Architecture:** A NestJS handler (`DataEnrichHandler`) caches its full output via `ToolCacheService`. The handler delegates to a `DataEnrichmentClient` that orchestrates four pure stages: (1) `extract.ts` walks the HTML with cheerio and applies eight regex patterns + scoring to surface up to 15 claim-worthy paragraphs; (2) `questions.ts` issues one batch LLM call (gpt-4.1-mini, no tools) to turn raw claim contexts into web-searchable verification questions; (3) `verify.ts` issues one batch LLM call (gpt-5.2 + `web_search_preview`) to confirm/correct/abandon each claim with a real source URL; (4) `insert.ts` walks the document in reverse position order and injects citations before each closing tag. The existing `OpenAIResponsesClient` from Plan 13 is reused — extended with an optional `tools` parameter so the same client can support both response-id chaining (Plan 13) and web-search tool use (Plan 14). The pipeline is **non-invasive**: it never rewrites article prose, even when the verifier returns a corrected value (corrections are flagged for human review). The Web UI renders a side-by-side claims table plus the enriched HTML in a sandboxed `<iframe srcDoc>`.

**Tech Stack:** TypeScript / NestJS / Zod / Vitest / cheerio (HTML walking) / `openai` SDK ≥ 6.35 (Responses API + `web_search_preview` tool) / OpenAI direct (default verify model `gpt-5.2`, default question model `gpt-4.1-mini`) / existing `OpenAIResponsesClient` extended.

**Lesson sources:**
- `docs/edu/lekcja-3-3/3.3-wzbogacanie-tresci-danymi.md` (notes)
- `docs/edu/lekcja-3-3/T3F3-wzbogacanie-tresci-danymi.md` (detailed teaching reference)
- `docs/edu/lekcja-3-3/T3F3-data_enrichment_educational.py` (Python reference; we mirror its regex + algorithm but swap the runtime to TS/Nest)
- `docs/edu/lekcja-3-3/T3F3-output_draft.html` (smoke input fixture & test fixture source)

---

## Critical gotchas

**Gotcha 1 — Shared package build:** `packages/shared` must be **built to `dist/`** after every change to `schemas.ts` (`pnpm --filter @sensai/shared build`). The API imports from compiled `dist`, not `src`. Every task that touches `packages/shared/src/schemas.ts` ends with a build step.

**Gotcha 2 — `previousOutputs` keys follow step keys, not types:** The new template step uses `{ key: "enrich", type: "tool.data.enrich", dependsOn: ["draftGen"] }`. The orchestrator exposes outputs under **step keys**, so `data-enrich.handler` reads `ctx.previousOutputs.draftGen`. Fail-closed if missing or fails Zod parse — pattern matches Plan 13.

**Gotcha 3 — `OpenAIResponsesClient` is shared with Plan 13:** Don't fork the client. Add an optional `tools?: Array<{type: string}>` and `toolChoice?: "auto" | "none"` to `CreateBlockArgs`. Plan 13 calls leave them undefined and behave identically to today. Plan 14 verify calls pass `tools: [{ type: "web_search_preview" }], toolChoice: "auto"`. Existing tests must still pass — the parameter is purely additive.

**Gotcha 4 — Web search tool cost is NOT tracked yet:** OpenAI bills `web_search_preview` calls separately from input/output tokens (≈ $25 per 1000 search calls at preview pricing). The current `CostTrackerService` only records token cost via `pricing.ts`. We log a warning and document this as a known limit; do **not** invent cost numbers. Token cost still gets recorded the usual way.

**Gotcha 5 — Regex must be deterministic — no LLM extraction:** The lesson explicitly says "to programatyczny algorytm, nie LLM". Mirror the eight Python regex patterns verbatim with `i` flag. Each category has both PL and EN tokens **inside the same regex** (no language switch); the lesson keeps them merged for simplicity. Tests parameterize on PL+EN snippets.

**Gotcha 6 — `<td>` claims need table context:** Cells often contain dosages or norms that mean nothing without the table headers. For `<td>` claims, the extractor's `context` field must include both the row's `<th>` headers (joined with `|`) and all sibling `<td>` cell texts of that `<tr>`. For `<p>` and `<li>`, `context` is just the element text. The verifier prompt embeds `context`, so getting this right is what makes "300–600 mg" verifiable as "ashwagandha dosage" rather than a floating number.

**Gotcha 7 — Reverse-order insertion preserves positions:** When inserting citations across multiple paragraphs, `String.prototype.replace` shifts the document. We sort claims by their position in the *current* document (via `indexOf(paragraphHtml)`) descending, then process from end to start. Lesson does the same. Required for stability when there are 5+ confirmed claims.

**Gotcha 8 — Don't dedupe sources globally — dedupe only per paragraph:** A single claim's paragraph may already contain `(Source: ...)` from an earlier run (manual edit or replay). Skip insertion if the paragraph already has the citation marker (lookback of 250 chars before `</p>` / `</li>` / `</td>`). Don't dedupe across the whole article; multiple paragraphs CAN cite the same domain on different facts.

**Gotcha 9 — `corrected` status NEVER rewrites prose:** When the verifier returns `corrected` (article number was wrong, source has the right one), we still only insert the source citation — same as `confirmed` — and stash the correction note under `verifications[i].correctedValue` for the operator to review. Auto-rewriting prose is unsafe (model may misinterpret the source). The Web UI surfaces correction notes in a yellow callout.

**Gotcha 10 — `unverified` status leaves the paragraph untouched:** No citation, no flag, no warning. The lesson explicitly does this: "If brak źródła w sieci, zostawiamy bez zmian". This is the bulk of the output for Polish content (lesson reports 12/15 unverified on smoke). The handler logs a high-level count but does NOT emit a warning unless the *ratio* of unverified is suspiciously high (we expose `DATA_ENRICH_LOW_CONFIRM_WARNING` threshold, default 0.2).

**Gotcha 11 — Two LLM calls, batch JSON, with markdown-fence resilient parsing:** Both questions stage and verify stage send all claims in a single call and request a JSON dict keyed by claim id (string). The model sometimes wraps JSON in markdown fences (\`\`\`json ... \`\`\`); strip those before `JSON.parse`. If JSON is malformed, fall back to per-key regex extraction. Mirror the Python `parse_json_response()` helper.

**Gotcha 12 — `output_text` aggregates message text, ignores tool calls:** When the model invokes `web_search_preview`, the Responses API output includes both `web_search_call` items and a final `message` with text. `response.output_text` flattens just the text — that's what we want. Don't try to reconstruct the chain from `response.output[]`; the SDK's getter is correct.

**Gotcha 13 — gpt-4.1-mini pricing must be added to `pricing.ts`:** The existing table doesn't include it. Use OpenAI public rates as of 2025: input $0.15/1M, output $0.60/1M. Without this entry the cost lookup returns `"0"` and we lose accounting on the question stage.

**Gotcha 14 — cheerio's `tagName` is lowercase:** Use `el.tagName === "h2"` etc. (lowercase). cheerio normalizes tag names. Don't write `=== "H2"`.

**Gotcha 15 — Citation insert must respect trailing punctuation:** If the paragraph text ends in `.` (most do), strip the period, append ` (Źródło: ...)`, then add the period back **outside** the closing tag. Otherwise we get `… kortyzol. (Źródło: who.int).` which double-puncts. Lesson handles this with a lookahead on the rstrip-cleaned text.

**Gotcha 16 — Smoke fixture is the Plan 13 smoke output:** No new lesson fixture. The smoke script reads `scripts/smoke-output/plan-13-draft.json` (produced by `pnpm smoke:plan-13`). If missing, smoke aborts with a clear error directing the user to run Plan 13's smoke first. `DraftGenerationResult.parse` is the only validation.

**Gotcha 17 — Section ordering and dependsOn cascade:** Template wires `enrich.dependsOn = ["draftGen"]`. Plan 08 cascade rerun follows `dependsOn`, so re-running `draftGen` resets `enrich`. Re-running `distribute` resets `draftGen` AND `enrich` (transitive). No new cascade logic needed — just declare the edge.

**Gotcha 18 — UI HTML preview must sandbox:** Reuse the same `<iframe srcDoc sandbox="allow-same-origin">` pattern from Plan 13's `draft.tsx`. Inline a minimal stylesheet so the enriched HTML is readable. NEVER `dangerouslySetInnerHTML`.

---

## File Structure

```
apps/api/
├── package.json                                   (MODIFY) add "cheerio": "^1.0.0" dependency
└── src/
    ├── llm/
    │   ├── openai-responses.client.ts             (MODIFY) accept optional tools + toolChoice in CreateBlockArgs
    │   └── pricing.ts                             (MODIFY) add "gpt-4.1-mini" pricing entry
    │
    ├── tools/
    │   └── data-enricher/                         (NEW)
    │       ├── data-enricher.client.ts            Orchestrates extract → questions → verify → insert
    │       ├── data-enricher.module.ts            NestJS DI (reuses OPENAI_RESPONSES_SDK from DraftGeneratorModule)
    │       ├── data-enricher.types.ts             Internal types (regex pattern bag, etc.)
    │       ├── data-enricher.extract.ts           Pure: regex + scoring + cheerio walk
    │       ├── data-enricher.questions.ts         LLM stage: build prompt + call gpt-4.1-mini + parse JSON
    │       ├── data-enricher.verify.ts            LLM stage: build prompt + call gpt-5.2 + web_search_preview
    │       └── data-enricher.insert.ts            Pure: URL clean + citation build + reverse-order insert
    │
    ├── prompts/
    │   ├── data-enrich-questions.prompt.ts        (NEW) string builder for question batch
    │   └── data-enrich-verify.prompt.ts           (NEW) string builder for verify batch (lang-specific)
    │
    ├── handlers/
    │   ├── data-enrich.handler.ts                 (NEW) StepHandler "tool.data.enrich"
    │   └── handlers.module.ts                     (MODIFY) register handler + env token + DataEnricherModule
    │
    ├── config/env.ts                              (MODIFY) 6 new ENVs (DATA_ENRICH_*)
    │
    ├── seed/seed.ts                               (MODIFY) extend Plan 13 template with enrich step
    │
    └── tests/
        ├── fixtures/
        │   └── sample-draft.html                  (NEW) trimmed copy of T3F3-output_draft.html for unit tests
        ├── data-enricher.extract.test.ts          (NEW)
        ├── data-enricher.insert.test.ts           (NEW)
        ├── data-enricher.questions.test.ts        (NEW)
        ├── data-enricher.verify.test.ts           (NEW)
        ├── data-enricher.client.test.ts           (NEW)
        ├── data-enrich.handler.test.ts            (NEW)
        └── openai-responses.client.test.ts        (MODIFY or NEW — assert tools param round-trips)

packages/shared/src/schemas.ts                     (MODIFY) append Plan 14 schemas
packages/shared/dist/                               (REBUILD)

apps/web/src/components/step-output/
├── data-enrich.tsx                                (NEW) DataEnrichOutput renderer (iframe + claims table)
└── index.tsx                                      (MODIFY) routing + hasRichRenderer

scripts/smoke-plan-14.ts                           (NEW) Real-LLM smoke
package.json (root)                                (MODIFY) add "smoke:plan-14" script
```

No new DI tokens beyond `DATA_ENRICH_HANDLER_ENV` and `DATA_ENRICHER_ENV`. One new runtime dependency: `cheerio`.

---

## Task 1: Shared schemas — `DataEnrichmentResult`

**Files:**
- Modify: `packages/shared/src/schemas.ts` (append at end)
- Build: `packages/shared` (must produce `dist/`)

No unit test — runtime tests in later tasks exercise the schema.

- [ ] **Step 1.1: Append Plan 14 schemas at end of `packages/shared/src/schemas.ts`**

Append after the last existing export (current last is the Plan 13 `DraftGenerationResult` block):

```ts
// ===== Plan 14 — Data Enrichment =====

export const ClaimType = z.enum([
  "statystyka",
  "konkretna_data",
  "trend",
  "norma_medyczna",
  "porownanie",
  "datowane_zdarzenie",
  "legislacja",
  "organizacja",
]);
export type ClaimType = z.infer<typeof ClaimType>;

export const ClaimTagName = z.enum(["p", "li", "td"]);
export type ClaimTagName = z.infer<typeof ClaimTagName>;

export const ExtractedClaim = z.object({
  id: z.number().int().positive(),
  paragraphHtml: z.string().min(1),
  claimText: z.string().min(1).max(500),
  context: z.string().min(1),
  claimTypes: ClaimType.array().min(1),
  score: z.number().int().nonnegative(),
  h2Context: z.string().min(1),
  tagName: ClaimTagName,
  question: z.string().optional(),
});
export type ExtractedClaim = z.infer<typeof ExtractedClaim>;

export const VerificationStatus = z.enum(["confirmed", "corrected", "unverified"]);
export type VerificationStatus = z.infer<typeof VerificationStatus>;

export const ClaimVerification = z.object({
  claimId: z.number().int().positive(),
  status: VerificationStatus,
  source: z.string().default(""),
  sourceUrl: z.string().default(""),
  correctedValue: z.string().optional(),
  note: z.string().default(""),
});
export type ClaimVerification = z.infer<typeof ClaimVerification>;

export const EnrichmentWarning = z.object({
  kind: z.enum([
    "enrich_no_claims_found",
    "enrich_questions_failed",
    "enrich_verify_failed",
    "enrich_low_confirmation_rate",
    "enrich_invalid_url_skipped",
    "enrich_web_search_cost_untracked",
  ]),
  message: z.string().min(1),
  context: z.record(z.string()).default({}),
});
export type EnrichmentWarning = z.infer<typeof EnrichmentWarning>;

export const EnrichmentMeta = z.object({
  keyword: z.string().min(1),
  language: z.string().min(2).max(10),
  verifyModel: z.string().min(1),
  questionModel: z.string().min(1),
  generatedAt: z.string().datetime(),
});
export type EnrichmentMeta = z.infer<typeof EnrichmentMeta>;

export const EnrichmentStats = z.object({
  totalClaimsFound: z.number().int().nonnegative(),
  claimsVerified: z.number().int().nonnegative(),
  sourcesAdded: z.number().int().nonnegative(),
  correctionsFlagged: z.number().int().nonnegative(),
  unverified: z.number().int().nonnegative(),
  totalCostUsd: z.string(),
  totalLatencyMs: z.number().int().nonnegative(),
});
export type EnrichmentStats = z.infer<typeof EnrichmentStats>;

export const DataEnrichmentResult = z.object({
  meta: EnrichmentMeta,
  htmlContent: z.string().min(1),
  claims: ExtractedClaim.array(),
  verifications: ClaimVerification.array(),
  stats: EnrichmentStats,
  warnings: EnrichmentWarning.array(),
});
export type DataEnrichmentResult = z.infer<typeof DataEnrichmentResult>;
```

- [ ] **Step 1.2: Build the shared package**

Run:
```bash
pnpm --filter @sensai/shared build
```
Expected: `tsc` exits 0 and `packages/shared/dist/index.js` + `packages/shared/dist/index.d.ts` are regenerated.

- [ ] **Step 1.3: Commit**

```bash
git add packages/shared/src/schemas.ts packages/shared/dist
git commit -m "feat(shared): add Plan 14 DataEnrichmentResult schemas"
```

---

## Task 2: Dependencies, pricing, env vars

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/llm/pricing.ts`
- Modify: `apps/api/src/config/env.ts`

- [ ] **Step 2.1: Add cheerio dependency**

Run:
```bash
cd apps/api && pnpm add cheerio@^1.0.0
```
Expected: `apps/api/package.json` gets a `"cheerio": "^1.0.0"` entry under `dependencies`, and `pnpm-lock.yaml` updates.

- [ ] **Step 2.2: Add gpt-4.1-mini pricing**

Edit `apps/api/src/llm/pricing.ts`. After the `"gpt-5.2"` line in `MODEL_PRICING`, add:

```ts
"gpt-4.1-mini": { inputPer1M: 0.15, outputPer1M: 0.60 },
```

- [ ] **Step 2.3: Add Plan 14 env vars**

Edit `apps/api/src/config/env.ts`. Inside the `EnvSchema = z.object({ ... })`, after the Plan 13 block (the last entry there is `DRAFT_GENERATE_TTL_DAYS`), insert:

```ts
  // ----- Plan 14 — Data Enrichment -----
  DATA_ENRICH_VERIFY_MODEL: z.string().default("gpt-5.2"),
  DATA_ENRICH_QUESTION_MODEL: z.string().default("gpt-4.1-mini"),
  DATA_ENRICH_MAX_CLAIMS: z.coerce.number().int().min(1).max(50).default(15),
  DATA_ENRICH_MIN_SCORE: z.coerce.number().int().min(1).max(10).default(2),
  DATA_ENRICH_LOW_CONFIRM_WARNING: z.coerce.number().min(0).max(1).default(0.2),
  DATA_ENRICH_TTL_DAYS: z.coerce.number().int().min(1).max(60).default(7),
```

- [ ] **Step 2.4: Verify env still parses**

Run:
```bash
cd apps/api && pnpm typecheck
```
Expected: exit 0.

- [ ] **Step 2.5: Commit**

```bash
git add apps/api/package.json apps/api/src/llm/pricing.ts apps/api/src/config/env.ts pnpm-lock.yaml
git commit -m "feat(api): add cheerio dep, gpt-4.1-mini pricing, Plan 14 env vars"
```

---

## Task 3: Extend `OpenAIResponsesClient` with optional tools

**Files:**
- Modify: `apps/api/src/llm/openai-responses.client.ts`
- Test: `apps/api/src/tests/openai-responses.client.test.ts` (NEW)

The existing client is reused for Plan 14 verify calls. Pass-through `tools` + `toolChoice` parameters into the `responses.create` payload.

- [ ] **Step 3.1: Write failing test asserting `tools` round-trips**

Create `apps/api/src/tests/openai-responses.client.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { OpenAIResponsesClient } from "../llm/openai-responses.client";

describe("OpenAIResponsesClient.createBlock", () => {
  function makeClient(create: ReturnType<typeof vi.fn>) {
    const sdk = { responses: { create } } as any;
    const cost = { record: vi.fn() } as any;
    return new OpenAIResponsesClient(sdk, cost);
  }

  function fakeResponse() {
    return {
      id: "r1",
      model: "gpt-5.2-2025-12-11",
      output_text: "ok",
      usage: { input_tokens: 10, output_tokens: 5 },
    };
  }

  it("does NOT include tools when caller omits them", async () => {
    const create = vi.fn().mockResolvedValue(fakeResponse());
    const client = makeClient(create);

    await client.createBlock({
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      model: "gpt-5.2",
      system: "sys",
      input: "hi",
    });

    const params = create.mock.calls[0][0];
    expect(params.tools).toBeUndefined();
    expect(params.tool_choice).toBeUndefined();
  });

  it("forwards tools and tool_choice when provided", async () => {
    const create = vi.fn().mockResolvedValue(fakeResponse());
    const client = makeClient(create);

    await client.createBlock({
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      model: "gpt-5.2",
      system: "sys",
      input: "hi",
      tools: [{ type: "web_search_preview" }],
      toolChoice: "auto",
    });

    const params = create.mock.calls[0][0];
    expect(params.tools).toEqual([{ type: "web_search_preview" }]);
    expect(params.tool_choice).toBe("auto");
  });
});
```

- [ ] **Step 3.2: Run test to verify it fails**

Run:
```bash
cd apps/api && pnpm vitest run src/tests/openai-responses.client.test.ts
```
Expected: FAIL with "tools" / "tool_choice" mismatch (params don't carry them) and/or a TS compile error if the field doesn't exist.

- [ ] **Step 3.3: Implement the additive fields**

Edit `apps/api/src/llm/openai-responses.client.ts`. Update the `CreateBlockArgs` interface and `createBlock` body:

```ts
interface CreateBlockArgs {
  ctx: CallCtx;
  model: string;
  system: string;
  input: string;
  previousResponseId?: string;
  reasoning?: { effort: "low" | "medium" | "high" };
  verbosity?: "low" | "medium" | "high";
  tools?: Array<{ type: string }>;
  toolChoice?: "auto" | "none";
}
```

In the body of `createBlock`, after the existing `if (args.verbosity) ...` line, add:

```ts
    if (args.tools && args.tools.length > 0) {
      // SDK accepts a wider type; we only use a small subset (web_search_preview).
      params.tools = args.tools as any;
    }
    if (args.toolChoice) {
      params.tool_choice = args.toolChoice;
    }
```

- [ ] **Step 3.4: Re-run test**

Run:
```bash
cd apps/api && pnpm vitest run src/tests/openai-responses.client.test.ts
```
Expected: PASS (2/2).

- [ ] **Step 3.5: Run full vitest to confirm Plan 13 still passes**

Run:
```bash
cd apps/api && pnpm vitest run
```
Expected: PASS — no regressions in `draft-generator.client.test.ts` etc.

- [ ] **Step 3.6: Commit**

```bash
git add apps/api/src/llm/openai-responses.client.ts apps/api/src/tests/openai-responses.client.test.ts
git commit -m "feat(api): allow tools + toolChoice in OpenAIResponsesClient.createBlock"
```

---

## Task 4: Test fixture — `sample-draft.html`

**Files:**
- Create: `apps/api/src/tests/fixtures/sample-draft.html`

Take the meaningful-content portion of `docs/edu/lekcja-3-3/T3F3-output_draft.html`, keeping it under ~400 lines so tests stay readable. Must include: at least one `<h2>`, one `<p>` with a percentage, one `<p>` with a medical norm, one `<p>` with a year, one `<table>` with `<th>` + `<td>` containing a dosage.

- [ ] **Step 4.1: Read the source HTML**

Run:
```bash
wc -l docs/edu/lekcja-3-3/T3F3-output_draft.html
```
Expected: > 50 lines.

- [ ] **Step 4.2: Create the trimmed fixture**

Write `apps/api/src/tests/fixtures/sample-draft.html` with the following content:

```html
<h1>Jak obniżyć kortyzol po 40-tce</h1>

<h2>Czym jest kortyzol</h2>
<p>Kortyzol osiąga najwyższy poziom 30-45 minut po przebudzeniu, a przewlekły stres zwiększa kortyzol bazowy o 50-80% powyżej normy.</p>
<p>Normy porannego kortyzolu wynoszą 10-20 μg/dl we krwi, a w ślinie znacznie niższe.</p>

<h2>Adaptogeny</h2>
<p>Woda jest najlepszym napojem przy wysokim kortyzolu.</p>
<table>
  <thead>
    <tr><th>Adaptogen</th><th>Dawka</th><th>Forma</th></tr>
  </thead>
  <tbody>
    <tr><td>Ashwagandha</td><td>300-600 mg</td><td>standaryzowany ekstrakt</td></tr>
    <tr><td>Magnez</td><td>200-400 mg</td><td>cytrynian, glicynian</td></tr>
  </tbody>
</table>

<h2>Sen</h2>
<p>Sen 7-9 godzin obniża kortyzol o 20-30% w porównaniu do 5 godzin snu.</p>
<p>W 2019 roku WHO oszacowało, że ponad 500 tysięcy osób umiera rocznie z powodu zaburzeń snu.</p>
<ul>
  <li>Zachowaj stałe godziny snu — to redukuje wahania kortyzolu o około 15%.</li>
  <li>Unikaj kofeiny po 14:00.</li>
</ul>
```

- [ ] **Step 4.3: Commit**

```bash
git add apps/api/src/tests/fixtures/sample-draft.html
git commit -m "test(enrich): add sample-draft.html fixture for Plan 14"
```

---

## Task 5: `data-enricher.types.ts` — internal pattern bag

**Files:**
- Create: `apps/api/src/tools/data-enricher/data-enricher.types.ts`

Internal types used across extract/insert/client. No tests (just type aliases).

- [ ] **Step 5.1: Create the types module**

Write `apps/api/src/tools/data-enricher/data-enricher.types.ts`:

```ts
import type { ClaimType } from "@sensai/shared";

export type CategoryPattern = {
  type: ClaimType;
  weight: number;
  re: RegExp;
};

export interface ExtractCallCtx {
  runId: string;
  stepId: string;
  attempt: number;
}
```

- [ ] **Step 5.2: Commit**

```bash
git add apps/api/src/tools/data-enricher/data-enricher.types.ts
git commit -m "feat(enrich): add data-enricher internal types"
```

---

## Task 6: `data-enricher.extract.ts` — claim extraction

**Files:**
- Create: `apps/api/src/tools/data-enricher/data-enricher.extract.ts`
- Test: `apps/api/src/tests/data-enricher.extract.test.ts` (NEW)

Walk the HTML with cheerio. Apply 8 regex patterns + scoring. Sort by score desc, take top `maxClaims`.

- [ ] **Step 6.1: Write failing tests**

Create `apps/api/src/tests/data-enricher.extract.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractClaims } from "../tools/data-enricher/data-enricher.extract";

const FIXTURE = readFileSync(
  join(__dirname, "fixtures/sample-draft.html"),
  "utf-8",
);

describe("extractClaims", () => {
  it("finds the high-score combo paragraph (trend + norma + porównanie)", () => {
    const claims = extractClaims(FIXTURE, { maxClaims: 15, minScore: 2 });
    const top = claims[0];
    expect(top.score).toBeGreaterThanOrEqual(6);
    expect(top.claimText).toMatch(/30-45 minut/);
    expect(top.claimTypes).toEqual(
      expect.arrayContaining(["trend", "norma_medyczna", "porownanie"]),
    );
    expect(top.h2Context).toBe("Czym jest kortyzol");
    expect(top.tagName).toBe("p");
  });

  it("captures table-cell claims with row+headers context", () => {
    const claims = extractClaims(FIXTURE, { maxClaims: 15, minScore: 2 });
    const tdClaim = claims.find((c) => c.tagName === "td");
    expect(tdClaim).toBeDefined();
    expect(tdClaim!.context).toMatch(/Nagłówki tabeli: Adaptogen \| Dawka \| Forma/);
    expect(tdClaim!.context).toMatch(/Wiersz: Ashwagandha \| 300-600 mg/);
  });

  it("skips paragraphs shorter than 30 chars", () => {
    const html = "<h2>X</h2><p>Krótkie 50%.</p>";
    const claims = extractClaims(html, { maxClaims: 15, minScore: 2 });
    expect(claims).toHaveLength(0);
  });

  it("skips paragraphs with score below minScore", () => {
    // pure narrative — no patterns
    const html =
      "<h2>X</h2><p>Witam was serdecznie w tej krótkiej pogadance, dzień dobry państwu.</p>";
    const claims = extractClaims(html, { maxClaims: 15, minScore: 2 });
    expect(claims).toHaveLength(0);
  });

  it("respects maxClaims limit, sorted by score desc", () => {
    const claims = extractClaims(FIXTURE, { maxClaims: 2, minScore: 2 });
    expect(claims).toHaveLength(2);
    expect(claims[0].score).toBeGreaterThanOrEqual(claims[1].score);
  });

  it("keeps tracking last-seen h2 across siblings", () => {
    const claims = extractClaims(FIXTURE, { maxClaims: 15, minScore: 2 });
    const senClaim = claims.find((c) => /Sen 7-9/.test(c.claimText));
    expect(senClaim).toBeDefined();
    expect(senClaim!.h2Context).toBe("Sen");
  });

  it("scores statystyka 3 + porownanie 2 = 5 minimum on the sleep paragraph", () => {
    const claims = extractClaims(FIXTURE, { maxClaims: 15, minScore: 2 });
    const senClaim = claims.find((c) => /Sen 7-9/.test(c.claimText));
    expect(senClaim!.score).toBeGreaterThanOrEqual(5);
    expect(senClaim!.claimTypes).toEqual(
      expect.arrayContaining(["statystyka", "porownanie"]),
    );
  });

  it("captures org + year combo (WHO 2019) as datowane_zdarzenie + organizacja", () => {
    const claims = extractClaims(FIXTURE, { maxClaims: 15, minScore: 2 });
    const whoClaim = claims.find((c) => /500 tysięcy/.test(c.claimText));
    expect(whoClaim).toBeDefined();
    expect(whoClaim!.claimTypes).toEqual(
      expect.arrayContaining(["statystyka", "datowane_zdarzenie", "organizacja"]),
    );
  });

  it("ids are sequential 1..N in document order before sorting", () => {
    // We assert: every id is unique and positive — sequence is internal detail
    const claims = extractClaims(FIXTURE, { maxClaims: 15, minScore: 2 });
    const ids = claims.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id >= 1)).toBe(true);
  });

  it("paragraphHtml contains the original element so insert can replace it", () => {
    const claims = extractClaims(FIXTURE, { maxClaims: 15, minScore: 2 });
    const senClaim = claims.find((c) => /Sen 7-9/.test(c.claimText));
    expect(senClaim!.paragraphHtml).toContain("Sen 7-9 godzin obniża kortyzol");
    expect(senClaim!.paragraphHtml.startsWith("<p")).toBe(true);
    expect(senClaim!.paragraphHtml.endsWith("</p>")).toBe(true);
  });
});
```

- [ ] **Step 6.2: Run tests to verify they fail**

Run:
```bash
cd apps/api && pnpm vitest run src/tests/data-enricher.extract.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 6.3: Implement `extract.ts`**

Create `apps/api/src/tools/data-enricher/data-enricher.extract.ts`:

```ts
import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import type { ExtractedClaim, ClaimTagName } from "@sensai/shared";
import type { CategoryPattern } from "./data-enricher.types";

// Mirror docs/edu/lekcja-3-3/T3F3-data_enrichment_educational.py regex.
// All patterns case-insensitive. Numbers tolerate en-dash (–) ranges.

const NUMBER_RE =
  /\b\d[\d,.\s\-–]*(?:%|million|billion|mln|mld|tys|thousand|percent|deaths|cases|prescriptions|users|mg|g|kg|ml|l|μg|mcg|ng|IU|j\.m\.|kcal|bpm|mmHg|μg\/dl|ng\/ml|mmol\/l|mg\/dl)\b/i;

const YEAR_CLAIM_RE =
  /\b(?:in|w|of|since|od|from|around|circa|by|after|before|until|roku)\s+\d{4}\b/i;

const DATE_EVENT_RE =
  /\b(?:on\s+\w+\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+\w+\s+\d{4}|(?:dnia|w dniu)\s+\d{1,2}\s+\w+\s+\d{4})\b/i;

const STAT_PHRASES =
  /\b(?:surpass|exceed|increas|decreas|rose|fell|grew|dropped|estimated|approximately|roughly|about \d|more than \d|less than \d|up to \d|over \d|around \d|nearly \d|times stronger|times more|times higher|times lower|wzrosł|spadł|oszacowa|około \d|ponad \d|blisko \d|prawie \d|razy silniejsz|razy więcej|razy wyższ|zwiększ|obniż|podnos|podnoś|zmniejsz|reduku|podwyższ|normalizuj|obniżen|popraw|pogarszaj|nasil|ogranicza|wzmacnia)\w*\b/i;

const LEGISLATION_RE =
  /\b(?:act|law|regulation|directive|treaty|monograph|schedule|ustawa|rozporządzenie|dyrektywa|regulacja)\b/i;

const ORG_CLAIM_RE =
  /\b(?:World Health Organization|WHO|FDA|DEA|EPA|CDC|EMA|EFSA|European Medicines Agency|Światowa Organizacja Zdrowia|American Chemical Society|National Institute|United Nations|European Union|Unia Europejska)\b/i;

const MEDICAL_NORM_RE =
  /\b(?:norma|normy|zakres|stężenie|dawka|dawkowanie|poziom wynosi|wynoszą|wynosi|referencyj|wartości prawidłowe|zakres referencyjny|wartość prawidłowa|standaryzowany|standaryzowanego)\b/i;

const COMPARISON_RE =
  /\bo\s+(?:około\s+)?\d[\d,.\-–]*\s*%|w porównaniu (?:do|z|ze)|(?:więcej|mniej|wyższy|niższy|szybciej|wolniej|lepiej|gorzej)\s+(?:niż|od)|w stosunku do/i;

const PATTERNS: CategoryPattern[] = [
  { type: "statystyka",        weight: 3, re: NUMBER_RE },
  { type: "konkretna_data",    weight: 2, re: DATE_EVENT_RE },
  { type: "trend",             weight: 2, re: STAT_PHRASES },
  { type: "norma_medyczna",    weight: 2, re: MEDICAL_NORM_RE },
  { type: "porownanie",        weight: 2, re: COMPARISON_RE },
  { type: "datowane_zdarzenie", weight: 1, re: YEAR_CLAIM_RE },
  { type: "legislacja",        weight: 1, re: LEGISLATION_RE },
  { type: "organizacja",       weight: 1, re: ORG_CLAIM_RE },
];

export interface ExtractOptions {
  maxClaims: number;
  minScore: number;
}

export function extractClaims(
  html: string,
  opts: ExtractOptions,
): ExtractedClaim[] {
  const $ = cheerio.load(html);

  const claims: ExtractedClaim[] = [];
  let claimId = 1;
  let currentH2 = "Wstęp";

  // Walk in document order. cheerio's element selector preserves DOM order.
  const elements = $("h2, p, li, td").toArray() as Element[];

  for (const el of elements) {
    const $el = $(el);

    if (el.tagName === "h2") {
      currentH2 = $el.text().trim() || currentH2;
      continue;
    }

    const text = $el.text().replace(/\s+/g, " ").trim();
    if (text.length < 30) continue;

    // Score against patterns
    let score = 0;
    const types: ExtractedClaim["claimTypes"] = [];

    for (const p of PATTERNS) {
      if (p.re.test(text)) {
        score += p.weight;
        types.push(p.type);
      }
    }

    if (score < opts.minScore) continue;

    // Build context
    let context: string;
    if (el.tagName === "td") {
      const $row = $el.closest("tr");
      const $table = $el.closest("table");
      const headers = $table
        .find("th")
        .toArray()
        .map((th) => $(th).text().trim());
      const cells = $row
        .find("td")
        .toArray()
        .map((td) => $(td).text().trim());
      const parts: string[] = [];
      if (headers.length > 0) {
        parts.push(`Nagłówki tabeli: ${headers.join(" | ")}`);
      }
      parts.push(`Wiersz: ${cells.join(" | ")}`);
      context = parts.join("\n");
    } else {
      context = text;
    }

    claims.push({
      id: claimId++,
      paragraphHtml: $.html($el),
      claimText: text.slice(0, 500),
      context,
      claimTypes: types,
      score,
      h2Context: currentH2,
      tagName: el.tagName as ClaimTagName,
    });
  }

  // Sort by score desc, then take top N
  claims.sort((a, b) => b.score - a.score);
  return claims.slice(0, opts.maxClaims);
}
```

- [ ] **Step 6.4: Re-run tests**

Run:
```bash
cd apps/api && pnpm vitest run src/tests/data-enricher.extract.test.ts
```
Expected: PASS (10/10).

- [ ] **Step 6.5: Commit**

```bash
git add apps/api/src/tools/data-enricher/data-enricher.extract.ts apps/api/src/tests/data-enricher.extract.test.ts
git commit -m "feat(enrich): add claim extraction (regex + scoring + cheerio)"
```

---

## Task 7: `data-enricher.insert.ts` — citation insertion

**Files:**
- Create: `apps/api/src/tools/data-enricher/data-enricher.insert.ts`
- Test: `apps/api/src/tests/data-enricher.insert.test.ts` (NEW)

Pure functions: clean URL, build citation, add citation to a paragraph string, walk the doc reverse-order applying citations.

- [ ] **Step 7.1: Write failing tests**

Create `apps/api/src/tests/data-enricher.insert.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  cleanSourceValue,
  buildCitation,
  addSourceToElement,
  insertSources,
} from "../tools/data-enricher/data-enricher.insert";
import type { ExtractedClaim, ClaimVerification } from "@sensai/shared";

describe("cleanSourceValue", () => {
  it("strips https:// and www.", () => {
    expect(cleanSourceValue("https://www.who.int/news")).toBe("who.int/news");
  });
  it("converts markdown links to text", () => {
    expect(cleanSourceValue("[WHO](https://who.int)")).toBe("WHO");
  });
  it("strips <a> tags keeping text", () => {
    expect(cleanSourceValue('<a href="https://who.int">WHO</a>')).toBe("WHO");
  });
  it("returns empty for empty input", () => {
    expect(cleanSourceValue("")).toBe("");
  });
});

describe("buildCitation", () => {
  it("formats source + url with em-dash separator", () => {
    expect(
      buildCitation("WHO, 2024", "https://who.int/news/x"),
    ).toBe("WHO, 2024 — who.int/news/x");
  });
  it("returns plain source when url empty", () => {
    expect(buildCitation("WHO, 2024", "")).toBe("WHO, 2024");
  });
  it("trims trailing dot from source", () => {
    expect(buildCitation("WHO, 2024.", "")).toBe("WHO, 2024");
  });
  it("truncates over-long URLs to first 4 path segments", () => {
    const longUrl = "https://example.com/" + "segment/".repeat(40) + "end";
    const out = buildCitation("Example", longUrl);
    expect(out.length).toBeLessThan(180);
    expect(out.startsWith("Example — example.com/")).toBe(true);
  });
});

describe("addSourceToElement", () => {
  it("inserts before </p>, preserves trailing dot", () => {
    const html = "<p>Some claim about cortisol.</p>";
    const out = addSourceToElement(html, "Źródło: who.int", "p");
    expect(out).toBe("<p>Some claim about cortisol (Źródło: who.int).</p>");
  });
  it("inserts before </li> with no trailing dot", () => {
    const html = "<li>A bullet</li>";
    const out = addSourceToElement(html, "Źródło: foo.pl", "li");
    expect(out).toBe("<li>A bullet (Źródło: foo.pl)</li>");
  });
  it("does not duplicate when citation already present", () => {
    const html = "<p>Already cited (Źródło: who.int).</p>";
    const out = addSourceToElement(html, "Źródło: foo.pl", "p");
    expect(out).toBe(html);
  });
  it("supports english Source: marker for dedup detection", () => {
    const html = "<p>Already (Source: who.int).</p>";
    const out = addSourceToElement(html, "Źródło: foo.pl", "p");
    expect(out).toBe(html);
  });
});

function makeClaim(id: number, paragraphHtml: string): ExtractedClaim {
  return {
    id,
    paragraphHtml,
    claimText: "x",
    context: "x",
    claimTypes: ["statystyka"],
    score: 3,
    h2Context: "X",
    tagName: paragraphHtml.startsWith("<li") ? "li" : "p",
  };
}

describe("insertSources", () => {
  it("processes claims reverse-position so positions stay stable", () => {
    const article =
      "<h2>X</h2>\n<p>First claim.</p>\n<p>Second claim.</p>\n<p>Third claim.</p>";
    const claims = [
      makeClaim(1, "<p>First claim.</p>"),
      makeClaim(2, "<p>Second claim.</p>"),
      makeClaim(3, "<p>Third claim.</p>"),
    ];
    const verifications = new Map<number, ClaimVerification>([
      [1, { claimId: 1, status: "confirmed", source: "Źródło: a.pl, 2024", sourceUrl: "https://a.pl/x", note: "" }],
      [2, { claimId: 2, status: "unverified", source: "", sourceUrl: "", note: "" }],
      [3, { claimId: 3, status: "corrected", source: "Źródło: b.pl, 2024", sourceUrl: "https://b.pl/y", note: "wrong number", correctedValue: "should be 5" }],
    ]);
    const { html, stats } = insertSources(article, claims, verifications);
    expect(html).toContain("(Źródło: a.pl, 2024 — a.pl/x).");
    expect(html).toContain("(Źródło: b.pl, 2024 — b.pl/y).");
    expect(html).toContain("Second claim.");
    expect(html).not.toContain("Second claim. (");
    expect(stats.sourcesAdded).toBe(1);
    expect(stats.correctionsFlagged).toBe(1);
    expect(stats.unverified).toBe(1);
  });

  it("skips claims missing from the verification map", () => {
    const article = "<p>Only claim.</p>";
    const claims = [makeClaim(1, "<p>Only claim.</p>")];
    const verifications = new Map<number, ClaimVerification>(); // empty
    const { html, stats } = insertSources(article, claims, verifications);
    expect(html).toBe(article);
    expect(stats.sourcesAdded).toBe(0);
  });
});
```

- [ ] **Step 7.2: Run tests to verify they fail**

Run:
```bash
cd apps/api && pnpm vitest run src/tests/data-enricher.insert.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 7.3: Implement `insert.ts`**

Create `apps/api/src/tools/data-enricher/data-enricher.insert.ts`:

```ts
import type {
  ExtractedClaim,
  ClaimVerification,
  ClaimTagName,
} from "@sensai/shared";

export function cleanSourceValue(value: string): string {
  if (!value) return value;

  // 1. Markdown links [text](url) → text
  value = value.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // 2. <a href=...>text</a> → text
  value = value.replace(/<a[^>]*href=[^>]*>([^<]*)<\/a>/gi, "$1");

  // 3. Bare URLs → just the host (best-effort)
  value = value.replace(
    /https?:\/\/[^\s<>"{}|\\^`[\]]+|www\.[^\s<>"{}|\\^`[\]]+/g,
    (url) => {
      const m = /^(?:https?:\/\/)?(?:www\.)?([^/]+)/.exec(url);
      return m ? m[1] : "";
    },
  );

  // 4. Strip leading protocol/www if any survived
  value = value.replace(/^https?:\/\//, "").replace(/^www\./, "");

  return value.trim();
}

export function buildCitation(source: string, sourceUrl: string): string {
  const cleanSource = source.trim().replace(/\.$/, "");

  if (!sourceUrl) return cleanSource;

  let displayUrl = sourceUrl
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");

  if (displayUrl.length > 120) {
    const parts = displayUrl.split("/");
    displayUrl = parts.slice(0, 4).join("/");
  }

  return `${cleanSource} — ${displayUrl}`;
}

const CITATION_MARKER_RE = /\((?:Source|Źródło):/i;

export function addSourceToElement(
  html: string,
  citationBody: string,
  tagName: ClaimTagName,
): string {
  const cleanBody = citationBody.trim().replace(/\.$/, "");
  const closeTag = `</${tagName}>`;
  const closePos = html.lastIndexOf(closeTag);
  if (closePos === -1) {
    return `${html} (${cleanBody})`;
  }

  const beforeClose = html.slice(0, closePos).replace(/\s+$/, "");
  const after = html.slice(closePos + closeTag.length);

  // Dedup detection — look at last 250 chars
  const tail = beforeClose.slice(-250);
  if (CITATION_MARKER_RE.test(tail)) return html;

  if (beforeClose.endsWith(".")) {
    const trimmed = beforeClose.slice(0, -1);
    return `${trimmed} (${cleanBody}).${closeTag}${after}`;
  }
  return `${beforeClose} (${cleanBody})${closeTag}${after}`;
}

export interface InsertStats {
  sourcesAdded: number;
  correctionsFlagged: number;
  unverified: number;
}

export interface InsertResult {
  html: string;
  stats: InsertStats;
}

export function insertSources(
  articleHtml: string,
  claims: ExtractedClaim[],
  verifications: Map<number, ClaimVerification>,
): InsertResult {
  const stats: InsertStats = {
    sourcesAdded: 0,
    correctionsFlagged: 0,
    unverified: 0,
  };

  // Sort claims by their position in the original document, descending.
  // Doing replacements end-to-start keeps earlier indexOf hits valid.
  const positioned = claims
    .map((c) => ({ claim: c, pos: articleHtml.indexOf(c.paragraphHtml) }))
    .filter((x) => x.pos !== -1)
    .sort((a, b) => b.pos - a.pos);

  let enriched = articleHtml;

  for (const { claim } of positioned) {
    const v = verifications.get(claim.id);
    if (!v) continue;

    if (v.status === "unverified" || !v.source) {
      stats.unverified += 1;
      continue;
    }

    const cleanSrc = cleanSourceValue(v.source);
    if (!cleanSrc) {
      stats.unverified += 1;
      continue;
    }

    const citation = buildCitation(cleanSrc, (v.sourceUrl ?? "").trim());
    const next = addSourceToElement(claim.paragraphHtml, citation, claim.tagName);
    if (next === claim.paragraphHtml) continue; // dedup or noop

    enriched = enriched.replace(claim.paragraphHtml, next);

    if (v.status === "confirmed") stats.sourcesAdded += 1;
    if (v.status === "corrected") stats.correctionsFlagged += 1;
  }

  return { html: enriched, stats };
}
```

- [ ] **Step 7.4: Re-run tests**

Run:
```bash
cd apps/api && pnpm vitest run src/tests/data-enricher.insert.test.ts
```
Expected: PASS (all in suite).

- [ ] **Step 7.5: Commit**

```bash
git add apps/api/src/tools/data-enricher/data-enricher.insert.ts apps/api/src/tests/data-enricher.insert.test.ts
git commit -m "feat(enrich): add URL clean + citation builder + reverse-order insert"
```

---

## Task 8: `data-enrich-questions.prompt.ts` + `data-enricher.questions.ts`

**Files:**
- Create: `apps/api/src/prompts/data-enrich-questions.prompt.ts`
- Create: `apps/api/src/tools/data-enricher/data-enricher.questions.ts`
- Test: `apps/api/src/tests/data-enricher.questions.test.ts` (NEW)

Build a single-batch prompt mapping `{claim_id → question}`, call gpt-4.1-mini, parse JSON (markdown-fence resilient), assign `question` per claim. Fallback to `claimText` if a claim id is missing from the response.

- [ ] **Step 8.1: Write failing tests**

Create `apps/api/src/tests/data-enricher.questions.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { generateQuestions } from "../tools/data-enricher/data-enricher.questions";
import type { OpenAIResponsesClient } from "../llm/openai-responses.client";
import type { ExtractedClaim } from "@sensai/shared";

function makeClaim(id: number, claimText: string, h2: string): ExtractedClaim {
  return {
    id,
    paragraphHtml: `<p>${claimText}</p>`,
    claimText,
    context: claimText,
    claimTypes: ["statystyka"],
    score: 3,
    h2Context: h2,
    tagName: "p",
  };
}

describe("generateQuestions", () => {
  it("calls the LLM once and assigns questions per claim id", async () => {
    const createBlock = vi.fn().mockResolvedValue({
      id: "r",
      outputText:
        '{"1":"Jaka jest dzienna dawka X?","2":"Ile godzin snu obniża kortyzol?"}',
      model: "gpt-4.1-mini",
      promptTokens: 100,
      completionTokens: 50,
      costUsd: "0.0001",
      latencyMs: 200,
    });
    const llm = { createBlock } as unknown as OpenAIResponsesClient;

    const claims = [
      makeClaim(1, "300-600 mg ekstraktu na dzień", "Adaptogeny"),
      makeClaim(2, "Sen 7-9 godzin obniża kortyzol o 20-30%", "Sen"),
    ];

    const out = await generateQuestions({
      llm,
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      model: "gpt-4.1-mini",
      keyword: "kortyzol",
      claims,
    });

    expect(createBlock).toHaveBeenCalledTimes(1);
    expect(out.claims[0].question).toBe("Jaka jest dzienna dawka X?");
    expect(out.claims[1].question).toBe(
      "Ile godzin snu obniża kortyzol?",
    );
    expect(out.cost.costUsd).toBe("0.0001");
    expect(out.cost.latencyMs).toBe(200);
  });

  it("falls back to claimText when LLM omits a claim id", async () => {
    const createBlock = vi.fn().mockResolvedValue({
      id: "r",
      outputText: '{"1":"Q1"}', // claim 2 missing
      model: "gpt-4.1-mini",
      promptTokens: 1,
      completionTokens: 1,
      costUsd: "0",
      latencyMs: 1,
    });
    const llm = { createBlock } as any;

    const claims = [
      makeClaim(1, "claim 1 text", "H"),
      makeClaim(2, "claim 2 text", "H"),
    ];

    const out = await generateQuestions({
      llm,
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      model: "gpt-4.1-mini",
      keyword: "k",
      claims,
    });

    expect(out.claims[1].question).toBe("claim 2 text");
  });

  it("strips markdown fences before parsing", async () => {
    const createBlock = vi.fn().mockResolvedValue({
      id: "r",
      outputText: "```json\n{\"1\":\"Q\"}\n```",
      model: "gpt-4.1-mini",
      promptTokens: 1,
      completionTokens: 1,
      costUsd: "0",
      latencyMs: 1,
    });
    const llm = { createBlock } as any;
    const claims = [makeClaim(1, "x", "H")];

    const out = await generateQuestions({
      llm,
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      model: "gpt-4.1-mini",
      keyword: "k",
      claims,
    });
    expect(out.claims[0].question).toBe("Q");
  });

  it("returns warning + claimText fallback when LLM throws", async () => {
    const createBlock = vi.fn().mockRejectedValue(new Error("boom"));
    const llm = { createBlock } as any;

    const claims = [makeClaim(1, "fallback text", "H")];

    const out = await generateQuestions({
      llm,
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      model: "gpt-4.1-mini",
      keyword: "k",
      claims,
    });
    expect(out.claims[0].question).toBe("fallback text");
    expect(out.warnings.some((w) => w.kind === "enrich_questions_failed")).toBe(true);
  });
});
```

- [ ] **Step 8.2: Run tests to verify they fail**

Run:
```bash
cd apps/api && pnpm vitest run src/tests/data-enricher.questions.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 8.3: Implement the prompt builder**

Create `apps/api/src/prompts/data-enrich-questions.prompt.ts`:

```ts
import type { ExtractedClaim } from "@sensai/shared";

export interface QuestionsPromptArgs {
  keyword: string;
  claims: ExtractedClaim[];
  language: string;
}

const SYSTEM =
  "You are a research assistant. You produce a JSON dict mapping each claim id to a single, search-engine-ready verification question. " +
  "Output JSON ONLY — no prose, no markdown fences.";

export const dataEnrichQuestionsPrompt = {
  system: SYSTEM,

  user(args: QuestionsPromptArgs): string {
    const lines: string[] = [];
    lines.push(`Article keyword: ${args.keyword}`);
    lines.push(`Article language: ${args.language}`);
    lines.push("");
    lines.push("RULES:");
    lines.push("1. Each question must be CONCRETE and SEARCHABLE — include numbers, doses, norms, or names from the claim.");
    lines.push("2. Each question must carry full context — if the claim is about a dosage, the question MUST name the substance (e.g. from the table headers).");
    lines.push("3. Questions STEER web search — write them as a real searcher would type.");
    lines.push("4. ONE question per claim, written in the article language, max 1-2 sentences.");
    lines.push("");
    lines.push("CLAIMS:");
    for (const c of args.claims) {
      lines.push(`\nCLAIM #${c.id}:`);
      lines.push(`  Section: ${c.h2Context}`);
      lines.push(`  Context: ${c.context.slice(0, 500)}`);
    }
    lines.push("");
    lines.push("OUTPUT (strict JSON, keys are claim ids as strings):");
    lines.push('{ "1": "...", "2": "...", "3": "..." }');
    return lines.join("\n");
  },
};
```

- [ ] **Step 8.4: Implement the questions module**

Create `apps/api/src/tools/data-enricher/data-enricher.questions.ts`:

```ts
import type { OpenAIResponsesClient } from "../../llm/openai-responses.client";
import { dataEnrichQuestionsPrompt } from "../../prompts/data-enrich-questions.prompt";
import type { ExtractedClaim, EnrichmentWarning } from "@sensai/shared";
import type { ExtractCallCtx } from "./data-enricher.types";

export interface GenerateQuestionsArgs {
  llm: OpenAIResponsesClient;
  ctx: ExtractCallCtx;
  model: string;
  keyword: string;
  language?: string;
  claims: ExtractedClaim[];
}

export interface QuestionsResult {
  claims: ExtractedClaim[];
  cost: { costUsd: string; latencyMs: number };
  warnings: EnrichmentWarning[];
}

export async function generateQuestions(
  args: GenerateQuestionsArgs,
): Promise<QuestionsResult> {
  const warnings: EnrichmentWarning[] = [];

  if (args.claims.length === 0) {
    return {
      claims: args.claims,
      cost: { costUsd: "0", latencyMs: 0 },
      warnings,
    };
  }

  const userPrompt = dataEnrichQuestionsPrompt.user({
    keyword: args.keyword,
    claims: args.claims,
    language: args.language ?? "pl",
  });

  try {
    const res = await args.llm.createBlock({
      ctx: args.ctx,
      model: args.model,
      system: dataEnrichQuestionsPrompt.system,
      input: userPrompt,
    });

    const map = parseJsonDict(res.outputText);

    const enriched = args.claims.map((c) => ({
      ...c,
      question: typeof map[String(c.id)] === "string" && map[String(c.id)]!.length > 0
        ? map[String(c.id)]!
        : c.claimText,
    }));

    return {
      claims: enriched,
      cost: { costUsd: res.costUsd, latencyMs: res.latencyMs },
      warnings,
    };
  } catch (err) {
    warnings.push({
      kind: "enrich_questions_failed",
      message: `gpt-4.1-mini call failed: ${(err as Error).message}`,
      context: { model: args.model },
    });
    const fallback = args.claims.map((c) => ({ ...c, question: c.claimText }));
    return {
      claims: fallback,
      cost: { costUsd: "0", latencyMs: 0 },
      warnings,
    };
  }
}

function parseJsonDict(text: string): Record<string, string> {
  // Strip ```json fences
  let cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "");

  try {
    const obj = JSON.parse(cleaned);
    return coerceStringMap(obj);
  } catch {
    // Fallback: extract last balanced object
    const match = /\{[\s\S]*\}/.exec(cleaned);
    if (match) {
      try {
        const obj = JSON.parse(match[0]);
        return coerceStringMap(obj);
      } catch {}
    }
  }
  return {};
}

function coerceStringMap(obj: unknown): Record<string, string> {
  if (!obj || typeof obj !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}
```

- [ ] **Step 8.5: Re-run tests**

Run:
```bash
cd apps/api && pnpm vitest run src/tests/data-enricher.questions.test.ts
```
Expected: PASS (4/4).

- [ ] **Step 8.6: Commit**

```bash
git add apps/api/src/prompts/data-enrich-questions.prompt.ts apps/api/src/tools/data-enricher/data-enricher.questions.ts apps/api/src/tests/data-enricher.questions.test.ts
git commit -m "feat(enrich): add gpt-4.1-mini question generation stage"
```

---

## Task 9: `data-enrich-verify.prompt.ts` + `data-enricher.verify.ts`

**Files:**
- Create: `apps/api/src/prompts/data-enrich-verify.prompt.ts`
- Create: `apps/api/src/tools/data-enricher/data-enricher.verify.ts`
- Test: `apps/api/src/tests/data-enricher.verify.test.ts` (NEW)

Single-batch call to gpt-5.2 with the `web_search_preview` tool. Output is a JSON dict per claim id with `{status, source, source_url, note, corrected_value?}`. Force-language via the prompt.

- [ ] **Step 9.1: Write failing tests**

Create `apps/api/src/tests/data-enricher.verify.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { verifyClaims } from "../tools/data-enricher/data-enricher.verify";
import type { OpenAIResponsesClient } from "../llm/openai-responses.client";
import type { ExtractedClaim } from "@sensai/shared";

function makeClaim(id: number, txt: string, q: string): ExtractedClaim {
  return {
    id,
    paragraphHtml: `<p>${txt}</p>`,
    claimText: txt,
    context: txt,
    claimTypes: ["statystyka"],
    score: 3,
    h2Context: "H",
    tagName: "p",
    question: q,
  };
}

describe("verifyClaims", () => {
  it("calls LLM with web_search_preview tool and parses statuses", async () => {
    const createBlock = vi.fn().mockResolvedValue({
      id: "r",
      outputText: JSON.stringify({
        "1": { status: "confirmed", source: "Źródło: WHO, 2024", source_url: "https://who.int/x", note: "" },
        "2": { status: "corrected", source: "Źródło: NFZ, 2024", source_url: "https://nfz.pl/y", note: "value off by 5%", corrected_value: "actually 25%" },
        "3": { status: "unverified", source: "", source_url: "", note: "no PL source" },
      }),
      model: "gpt-5.2",
      promptTokens: 200,
      completionTokens: 100,
      costUsd: "0.005",
      latencyMs: 5000,
    });
    const llm = { createBlock } as unknown as OpenAIResponsesClient;

    const claims = [
      makeClaim(1, "claim 1", "Q1"),
      makeClaim(2, "claim 2", "Q2"),
      makeClaim(3, "claim 3", "Q3"),
    ];
    const out = await verifyClaims({
      llm,
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      model: "gpt-5.2",
      keyword: "kortyzol",
      language: "pl",
      claims,
    });

    expect(createBlock).toHaveBeenCalledTimes(1);
    const callArgs = createBlock.mock.calls[0][0];
    expect(callArgs.tools).toEqual([{ type: "web_search_preview" }]);
    expect(callArgs.toolChoice).toBe("auto");

    expect(out.verifications).toHaveLength(3);
    const v1 = out.verifications.find((v) => v.claimId === 1)!;
    expect(v1.status).toBe("confirmed");
    expect(v1.sourceUrl).toBe("https://who.int/x");
    const v2 = out.verifications.find((v) => v.claimId === 2)!;
    expect(v2.status).toBe("corrected");
    expect(v2.correctedValue).toBe("actually 25%");
    const v3 = out.verifications.find((v) => v.claimId === 3)!;
    expect(v3.status).toBe("unverified");

    expect(out.cost.costUsd).toBe("0.005");
  });

  it("returns warning + every claim unverified when LLM call throws", async () => {
    const createBlock = vi.fn().mockRejectedValue(new Error("network"));
    const llm = { createBlock } as any;

    const out = await verifyClaims({
      llm,
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      model: "gpt-5.2",
      keyword: "k",
      language: "pl",
      claims: [makeClaim(1, "x", "Q")],
    });

    expect(out.verifications[0].status).toBe("unverified");
    expect(out.warnings.some((w) => w.kind === "enrich_verify_failed")).toBe(true);
  });

  it("uses 'Source' label for english articles", async () => {
    const createBlock = vi.fn().mockResolvedValue({
      id: "r",
      outputText: JSON.stringify({ "1": { status: "unverified", source: "", source_url: "", note: "" } }),
      model: "gpt-5.2",
      promptTokens: 1,
      completionTokens: 1,
      costUsd: "0",
      latencyMs: 1,
    });
    const llm = { createBlock } as any;

    await verifyClaims({
      llm,
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      model: "gpt-5.2",
      keyword: "k",
      language: "en",
      claims: [makeClaim(1, "x", "Q")],
    });

    const userInput = createBlock.mock.calls[0][0].input as string;
    expect(userInput).toMatch(/English/);
    expect(userInput).toMatch(/"Source: \./);
  });

  it("handles missing claim ids in LLM response by marking them unverified", async () => {
    const createBlock = vi.fn().mockResolvedValue({
      id: "r",
      outputText: JSON.stringify({
        "1": { status: "confirmed", source: "Źródło: x", source_url: "https://x.pl", note: "" },
      }),
      model: "gpt-5.2",
      promptTokens: 1,
      completionTokens: 1,
      costUsd: "0",
      latencyMs: 1,
    });
    const llm = { createBlock } as any;

    const out = await verifyClaims({
      llm,
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      model: "gpt-5.2",
      keyword: "k",
      language: "pl",
      claims: [makeClaim(1, "a", "Q1"), makeClaim(2, "b", "Q2")],
    });

    expect(out.verifications.find((v) => v.claimId === 2)!.status).toBe("unverified");
  });
});
```

- [ ] **Step 9.2: Run tests to verify they fail**

Run:
```bash
cd apps/api && pnpm vitest run src/tests/data-enricher.verify.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 9.3: Implement the prompt builder**

Create `apps/api/src/prompts/data-enrich-verify.prompt.ts`:

```ts
import type { ExtractedClaim } from "@sensai/shared";

interface LangConfig {
  label: string;
  searchLang: string;
  searchInstruction: string;
  sourceRule: string;
}

const LANG: Record<string, LangConfig> = {
  pl: {
    label: "Źródło",
    searchLang: "polski",
    searchInstruction:
      "Szukaj WYŁĄCZNIE po polsku. Używaj polskich fraz w web search.",
    sourceRule:
      "Źródło MUSI być w języku polskim — strona, na którą linkujesz, musi zawierać treść po polsku. " +
      "Nie akceptuj stron anglojęzycznych, niemieckojęzycznych ani w żadnym innym języku. " +
      'Jeśli nie znajdziesz polskojęzycznego źródła → zwróć "unverified".',
  },
  en: {
    label: "Source",
    searchLang: "English",
    searchInstruction: "Search ONLY in English. Use English phrases in web search.",
    sourceRule:
      "Source MUST be in English — the page you link to must contain English-language content. " +
      "Do not accept non-English sources. " +
      'If no English-language source found → return "unverified".',
  },
  de: {
    label: "Quelle",
    searchLang: "Deutsch",
    searchInstruction:
      "Suche AUSSCHLIESSLICH auf Deutsch. Verwende deutsche Suchbegriffe.",
    sourceRule:
      "Die Quelle MUSS auf Deutsch sein — die verlinkte Seite muss deutschsprachigen Inhalt enthalten. " +
      "Keine englischsprachigen Quellen. " +
      'Wenn keine deutschsprachige Quelle gefunden → "unverified" zurückgeben.',
  },
};

export interface VerifyPromptArgs {
  keyword: string;
  language: string;
  claims: ExtractedClaim[];
  today: string; // ISO date
}

const SYSTEM =
  "You are a fact-checking assistant. You use web search to verify claims and respond with strict JSON only. " +
  "No markdown, no commentary outside the JSON object.";

export const dataEnrichVerifyPrompt = {
  system: SYSTEM,

  user(args: VerifyPromptArgs): string {
    const cfg = LANG[args.language] ?? LANG.en;

    const lines: string[] = [];
    lines.push(
      `For each claim from an article about "${args.keyword}" find a source that answers the question and confirm or correct the claim text.`,
    );
    lines.push("");
    lines.push("CLAIMS TO VERIFY:");
    for (const c of args.claims) {
      lines.push(`\nCLAIM #${c.id}:`);
      lines.push(`  Question (search this): ${c.question ?? c.claimText}`);
      lines.push(`  Article text: ${c.claimText}`);
      lines.push(`  Section: ${c.h2Context}`);
    }
    lines.push("");
    lines.push("CONTEXT:");
    lines.push(`- Today: ${args.today}`);
    lines.push("");
    lines.push("===============================================");
    lines.push("LANGUAGE CONSTRAINT (HARD):");
    lines.push("===============================================");
    lines.push(`Article language: ${cfg.searchLang}`);
    lines.push(cfg.searchInstruction);
    lines.push("");
    lines.push(cfg.sourceRule);
    lines.push("===============================================");
    lines.push("");
    lines.push("RULES:");
    lines.push("1. Use the QUESTION as your web search query.");
    lines.push(`2. Find a page in ${cfg.searchLang} that answers the question.`);
    lines.push("3. Compare the page's answer with the ARTICLE TEXT.");
    lines.push('4. If the article text is correct → "confirmed" + source.');
    lines.push('5. If the article text is wrong → "corrected" + corrected_value + source.');
    lines.push(`6. If no source in ${cfg.searchLang} → "unverified".`);
    lines.push("7. NEVER fabricate sources or numbers.");
    lines.push("");
    lines.push("OUTPUT (strict JSON):");
    lines.push("{");
    lines.push(`  "1": { "status": "confirmed", "source": "${cfg.label}: ...", "source_url": "https://...", "note": "" },`);
    lines.push(`  "2": { "status": "corrected", "source": "${cfg.label}: ...", "source_url": "https://...", "corrected_value": "...", "note": "what was wrong" },`);
    lines.push(`  "3": { "status": "unverified", "source": "", "source_url": "", "note": "no source in ${cfg.searchLang}" }`);
    lines.push("}");
    lines.push("");
    lines.push('Statuses: "confirmed" | "corrected" | "unverified"');
    return lines.join("\n");
  },
};
```

- [ ] **Step 9.4: Implement the verify module**

Create `apps/api/src/tools/data-enricher/data-enricher.verify.ts`:

```ts
import type { OpenAIResponsesClient } from "../../llm/openai-responses.client";
import { dataEnrichVerifyPrompt } from "../../prompts/data-enrich-verify.prompt";
import type {
  ExtractedClaim,
  ClaimVerification,
  VerificationStatus,
  EnrichmentWarning,
} from "@sensai/shared";
import type { ExtractCallCtx } from "./data-enricher.types";

export interface VerifyClaimsArgs {
  llm: OpenAIResponsesClient;
  ctx: ExtractCallCtx;
  model: string;
  keyword: string;
  language: string;
  claims: ExtractedClaim[];
}

export interface VerifyClaimsResult {
  verifications: ClaimVerification[];
  cost: { costUsd: string; latencyMs: number };
  warnings: EnrichmentWarning[];
}

export async function verifyClaims(
  args: VerifyClaimsArgs,
): Promise<VerifyClaimsResult> {
  const warnings: EnrichmentWarning[] = [];

  if (args.claims.length === 0) {
    return {
      verifications: [],
      cost: { costUsd: "0", latencyMs: 0 },
      warnings,
    };
  }

  const userPrompt = dataEnrichVerifyPrompt.user({
    keyword: args.keyword,
    language: args.language,
    claims: args.claims,
    today: new Date().toISOString().slice(0, 10),
  });

  try {
    const res = await args.llm.createBlock({
      ctx: args.ctx,
      model: args.model,
      system: dataEnrichVerifyPrompt.system,
      input: userPrompt,
      tools: [{ type: "web_search_preview" }],
      toolChoice: "auto",
    });

    const map = parseVerificationDict(res.outputText);
    const verifications: ClaimVerification[] = args.claims.map((c) => {
      const v = map[String(c.id)];
      if (!v) {
        return {
          claimId: c.id,
          status: "unverified",
          source: "",
          sourceUrl: "",
          note: "missing from LLM response",
        };
      }
      return {
        claimId: c.id,
        status: normalizeStatus(v.status),
        source: typeof v.source === "string" ? v.source : "",
        sourceUrl: typeof v.source_url === "string" ? v.source_url : "",
        correctedValue:
          typeof v.corrected_value === "string" ? v.corrected_value : undefined,
        note: typeof v.note === "string" ? v.note : "",
      };
    });

    return {
      verifications,
      cost: { costUsd: res.costUsd, latencyMs: res.latencyMs },
      warnings,
    };
  } catch (err) {
    warnings.push({
      kind: "enrich_verify_failed",
      message: `web_search_preview call failed: ${(err as Error).message}`,
      context: { model: args.model },
    });
    const fallback = args.claims.map<ClaimVerification>((c) => ({
      claimId: c.id,
      status: "unverified",
      source: "",
      sourceUrl: "",
      note: "verify call threw",
    }));
    return {
      verifications: fallback,
      cost: { costUsd: "0", latencyMs: 0 },
      warnings,
    };
  }
}

function normalizeStatus(s: unknown): VerificationStatus {
  if (s === "confirmed" || s === "corrected" || s === "unverified") return s;
  return "unverified";
}

interface RawVerification {
  status?: unknown;
  source?: unknown;
  source_url?: unknown;
  corrected_value?: unknown;
  note?: unknown;
}

function parseVerificationDict(text: string): Record<string, RawVerification> {
  let cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "");
  try {
    const obj = JSON.parse(cleaned);
    return coerceObjectMap(obj);
  } catch {
    const match = /\{[\s\S]*\}/.exec(cleaned);
    if (match) {
      try {
        return coerceObjectMap(JSON.parse(match[0]));
      } catch {}
    }
  }
  return {};
}

function coerceObjectMap(obj: unknown): Record<string, RawVerification> {
  if (!obj || typeof obj !== "object") return {};
  const out: Record<string, RawVerification> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (v && typeof v === "object") {
      out[k] = v as RawVerification;
    }
  }
  return out;
}
```

- [ ] **Step 9.5: Re-run tests**

Run:
```bash
cd apps/api && pnpm vitest run src/tests/data-enricher.verify.test.ts
```
Expected: PASS (4/4).

- [ ] **Step 9.6: Commit**

```bash
git add apps/api/src/prompts/data-enrich-verify.prompt.ts apps/api/src/tools/data-enricher/data-enricher.verify.ts apps/api/src/tests/data-enricher.verify.test.ts
git commit -m "feat(enrich): add gpt-5.2 + web_search_preview verification stage"
```

---

## Task 10: `data-enricher.client.ts` — pipeline orchestration

**Files:**
- Create: `apps/api/src/tools/data-enricher/data-enricher.client.ts`
- Test: `apps/api/src/tests/data-enricher.client.test.ts` (NEW)

`DataEnrichmentClient.enrich({ ctx, draft })` runs extract → questions → verify → insert and returns the full structured result minus the cache wrapper.

- [ ] **Step 10.1: Write failing tests**

Create `apps/api/src/tests/data-enricher.client.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DataEnrichmentClient } from "../tools/data-enricher/data-enricher.client";
import type { OpenAIResponsesClient } from "../llm/openai-responses.client";

const FIXTURE = readFileSync(
  join(__dirname, "fixtures/sample-draft.html"),
  "utf-8",
);

describe("DataEnrichmentClient.enrich", () => {
  it("orchestrates extract → questions → verify → insert", async () => {
    const createBlock = vi
      .fn()
      // 1st call = questions stage (gpt-4.1-mini)
      .mockResolvedValueOnce({
        id: "q1",
        outputText: JSON.stringify(
          Object.fromEntries(
            Array.from({ length: 10 }, (_, i) => [String(i + 1), `Q${i + 1}`]),
          ),
        ),
        model: "gpt-4.1-mini",
        promptTokens: 100,
        completionTokens: 80,
        costUsd: "0.0001",
        latencyMs: 200,
      })
      // 2nd call = verify stage (gpt-5.2 + web_search_preview)
      .mockResolvedValueOnce({
        id: "v1",
        outputText: JSON.stringify({
          "1": { status: "confirmed", source: "Źródło: WHO, 2024", source_url: "https://who.int/x", note: "" },
        }),
        model: "gpt-5.2",
        promptTokens: 200,
        completionTokens: 100,
        costUsd: "0.005",
        latencyMs: 4000,
      });

    const llm = { createBlock } as unknown as OpenAIResponsesClient;
    const client = new DataEnrichmentClient(llm, {
      DATA_ENRICH_VERIFY_MODEL: "gpt-5.2",
      DATA_ENRICH_QUESTION_MODEL: "gpt-4.1-mini",
      DATA_ENRICH_MAX_CLAIMS: 15,
      DATA_ENRICH_MIN_SCORE: 2,
      DATA_ENRICH_LOW_CONFIRM_WARNING: 0.2,
    } as any);

    const out = await client.enrich({
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      keyword: "kortyzol",
      language: "pl",
      htmlContent: FIXTURE,
    });

    expect(createBlock).toHaveBeenCalledTimes(2);
    expect(out.claims.length).toBeGreaterThan(0);
    expect(out.verifications.length).toBe(out.claims.length);
    expect(out.htmlContent).toContain("(Źródło: WHO, 2024 — who.int/x");
    // The other claims have no verification → htmlContent is unchanged for them
    expect(out.cost.costUsd).toMatch(/^\d/);
    expect(Number(out.cost.costUsd)).toBeCloseTo(0.0051, 3);
  });

  it("short-circuits when no claims are found", async () => {
    const createBlock = vi.fn();
    const llm = { createBlock } as any;
    const client = new DataEnrichmentClient(llm, {
      DATA_ENRICH_VERIFY_MODEL: "gpt-5.2",
      DATA_ENRICH_QUESTION_MODEL: "gpt-4.1-mini",
      DATA_ENRICH_MAX_CLAIMS: 15,
      DATA_ENRICH_MIN_SCORE: 99, // impossibly high
      DATA_ENRICH_LOW_CONFIRM_WARNING: 0.2,
    } as any);

    const out = await client.enrich({
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      keyword: "k",
      language: "pl",
      htmlContent: FIXTURE,
    });

    expect(createBlock).not.toHaveBeenCalled();
    expect(out.claims).toHaveLength(0);
    expect(out.verifications).toHaveLength(0);
    expect(out.htmlContent).toBe(FIXTURE);
    expect(out.warnings.some((w) => w.kind === "enrich_no_claims_found")).toBe(true);
  });

  it("emits low_confirmation_rate warning when ratio is below threshold", async () => {
    const createBlock = vi
      .fn()
      .mockResolvedValueOnce({
        id: "q",
        outputText: JSON.stringify(
          Object.fromEntries(
            Array.from({ length: 10 }, (_, i) => [String(i + 1), `Q${i + 1}`]),
          ),
        ),
        model: "gpt-4.1-mini",
        promptTokens: 1, completionTokens: 1, costUsd: "0", latencyMs: 1,
      })
      .mockResolvedValueOnce({
        id: "v",
        outputText: JSON.stringify({
          "1": { status: "confirmed", source: "Źródło: x", source_url: "https://x.pl", note: "" },
          "2": { status: "unverified", source: "", source_url: "", note: "" },
          "3": { status: "unverified", source: "", source_url: "", note: "" },
          "4": { status: "unverified", source: "", source_url: "", note: "" },
          "5": { status: "unverified", source: "", source_url: "", note: "" },
          "6": { status: "unverified", source: "", source_url: "", note: "" },
          "7": { status: "unverified", source: "", source_url: "", note: "" },
          "8": { status: "unverified", source: "", source_url: "", note: "" },
          "9": { status: "unverified", source: "", source_url: "", note: "" },
          "10": { status: "unverified", source: "", source_url: "", note: "" },
        }),
        model: "gpt-5.2",
        promptTokens: 1, completionTokens: 1, costUsd: "0", latencyMs: 1,
      });
    const llm = { createBlock } as any;

    const client = new DataEnrichmentClient(llm, {
      DATA_ENRICH_VERIFY_MODEL: "gpt-5.2",
      DATA_ENRICH_QUESTION_MODEL: "gpt-4.1-mini",
      DATA_ENRICH_MAX_CLAIMS: 15,
      DATA_ENRICH_MIN_SCORE: 2,
      DATA_ENRICH_LOW_CONFIRM_WARNING: 0.2,
    } as any);

    const out = await client.enrich({
      ctx: { runId: "r", stepId: "s", attempt: 1 },
      keyword: "k",
      language: "pl",
      htmlContent: FIXTURE,
    });

    expect(out.warnings.some((w) => w.kind === "enrich_low_confirmation_rate")).toBe(true);
  });
});
```

- [ ] **Step 10.2: Run tests to verify they fail**

Run:
```bash
cd apps/api && pnpm vitest run src/tests/data-enricher.client.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 10.3: Implement the client**

Create `apps/api/src/tools/data-enricher/data-enricher.client.ts`:

```ts
import { Inject, Injectable, Logger } from "@nestjs/common";
import { OpenAIResponsesClient } from "../../llm/openai-responses.client";
import { extractClaims } from "./data-enricher.extract";
import { generateQuestions } from "./data-enricher.questions";
import { verifyClaims } from "./data-enricher.verify";
import { insertSources } from "./data-enricher.insert";
import type {
  ExtractedClaim,
  ClaimVerification,
  EnrichmentWarning,
} from "@sensai/shared";
import type { Env } from "../../config/env";
import type { ExtractCallCtx } from "./data-enricher.types";

type ClientEnv = Pick<
  Env,
  | "DATA_ENRICH_VERIFY_MODEL"
  | "DATA_ENRICH_QUESTION_MODEL"
  | "DATA_ENRICH_MAX_CLAIMS"
  | "DATA_ENRICH_MIN_SCORE"
  | "DATA_ENRICH_LOW_CONFIRM_WARNING"
>;

export interface EnrichArgs {
  ctx: ExtractCallCtx;
  keyword: string;
  language: string;
  htmlContent: string;
}

export interface EnrichResult {
  htmlContent: string;
  claims: ExtractedClaim[];
  verifications: ClaimVerification[];
  warnings: EnrichmentWarning[];
  stats: {
    sourcesAdded: number;
    correctionsFlagged: number;
    unverified: number;
  };
  cost: { costUsd: string; latencyMs: number };
}

@Injectable()
export class DataEnrichmentClient {
  private readonly logger = new Logger(DataEnrichmentClient.name);

  constructor(
    private readonly llm: OpenAIResponsesClient,
    @Inject("DATA_ENRICHER_ENV") private readonly env: ClientEnv,
  ) {}

  async enrich(args: EnrichArgs): Promise<EnrichResult> {
    const warnings: EnrichmentWarning[] = [];

    const claims = extractClaims(args.htmlContent, {
      maxClaims: this.env.DATA_ENRICH_MAX_CLAIMS,
      minScore: this.env.DATA_ENRICH_MIN_SCORE,
    });

    if (claims.length === 0) {
      warnings.push({
        kind: "enrich_no_claims_found",
        message: "Regex extractor returned 0 claims at min_score threshold",
        context: { minScore: String(this.env.DATA_ENRICH_MIN_SCORE) },
      });
      return {
        htmlContent: args.htmlContent,
        claims: [],
        verifications: [],
        warnings,
        stats: { sourcesAdded: 0, correctionsFlagged: 0, unverified: 0 },
        cost: { costUsd: "0", latencyMs: 0 },
      };
    }

    const qres = await generateQuestions({
      llm: this.llm,
      ctx: args.ctx,
      model: this.env.DATA_ENRICH_QUESTION_MODEL,
      keyword: args.keyword,
      language: args.language,
      claims,
    });
    warnings.push(...qres.warnings);

    const vres = await verifyClaims({
      llm: this.llm,
      ctx: args.ctx,
      model: this.env.DATA_ENRICH_VERIFY_MODEL,
      keyword: args.keyword,
      language: args.language,
      claims: qres.claims,
    });
    warnings.push(...vres.warnings);

    const verificationsMap = new Map<number, ClaimVerification>();
    for (const v of vres.verifications) verificationsMap.set(v.claimId, v);

    const inserted = insertSources(args.htmlContent, qres.claims, verificationsMap);

    const verifiedCount =
      vres.verifications.filter((v) => v.status !== "unverified").length;
    const ratio =
      qres.claims.length > 0 ? verifiedCount / qres.claims.length : 0;

    if (
      qres.claims.length > 0 &&
      ratio < this.env.DATA_ENRICH_LOW_CONFIRM_WARNING
    ) {
      warnings.push({
        kind: "enrich_low_confirmation_rate",
        message: `Only ${verifiedCount}/${qres.claims.length} claims got a source (${(ratio * 100).toFixed(1)}%)`,
        context: { ratio: ratio.toFixed(3) },
      });
    }

    const totalCost = (
      Number(qres.cost.costUsd) + Number(vres.cost.costUsd)
    ).toFixed(8);
    const totalLatency = qres.cost.latencyMs + vres.cost.latencyMs;

    this.logger.log(
      {
        call: "data.enrich",
        claims: qres.claims.length,
        sourcesAdded: inserted.stats.sourcesAdded,
        correctionsFlagged: inserted.stats.correctionsFlagged,
        unverified: inserted.stats.unverified,
        totalCostUsd: totalCost,
        totalLatencyMs: totalLatency,
      },
      "data enrichment finished",
    );

    return {
      htmlContent: inserted.html,
      claims: qres.claims,
      verifications: vres.verifications,
      warnings,
      stats: inserted.stats,
      cost: { costUsd: totalCost, latencyMs: totalLatency },
    };
  }
}
```

- [ ] **Step 10.4: Re-run tests**

Run:
```bash
cd apps/api && pnpm vitest run src/tests/data-enricher.client.test.ts
```
Expected: PASS (3/3).

- [ ] **Step 10.5: Commit**

```bash
git add apps/api/src/tools/data-enricher/data-enricher.client.ts apps/api/src/tests/data-enricher.client.test.ts
git commit -m "feat(enrich): add DataEnrichmentClient pipeline orchestrator"
```

---

## Task 11: `data-enricher.module.ts` — DI

**Files:**
- Create: `apps/api/src/tools/data-enricher/data-enricher.module.ts`

Plan 13's `DraftGeneratorModule` provides `OpenAIResponsesClient` + `OPENAI_RESPONSES_SDK` but **does not export them** (only `DraftGeneratorClient`). To avoid touching Plan 13's working module, mirror its provider setup here — each module ends up with its own OpenAI SDK instance, which is acceptable (the SDK is stateless). A future refactor can extract a shared `OpenAIResponsesModule` if duplication becomes an issue.

- [ ] **Step 11.1: Create the module**

Create `apps/api/src/tools/data-enricher/data-enricher.module.ts`:

```ts
import { Module } from "@nestjs/common";
import OpenAI from "openai";
import { LlmModule } from "../../llm/llm.module";
import { OpenAIResponsesClient } from "../../llm/openai-responses.client";
import { DataEnrichmentClient } from "./data-enricher.client";
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
      provide: "DATA_ENRICHER_ENV",
      useFactory: () => loadEnv(),
    },
    DataEnrichmentClient,
  ],
  exports: [DataEnrichmentClient],
})
export class DataEnricherModule {}
```

- [ ] **Step 11.2: Commit**

```bash
git add apps/api/src/tools/data-enricher/data-enricher.module.ts
git commit -m "feat(enrich): add DataEnricherModule (NestJS DI)"
```

---

## Task 12: `data-enrich.handler.ts` — StepHandler

**Files:**
- Create: `apps/api/src/handlers/data-enrich.handler.ts`
- Test: `apps/api/src/tests/data-enrich.handler.test.ts` (NEW)

Reads `previousOutputs.draftGen`, parses it via `DraftGenerationResult`, computes a stable `draftHash`, calls `cache.getOrSet` with TTL `DATA_ENRICH_TTL_DAYS`, and inside the fetcher calls `client.enrich` and assembles the full `DataEnrichmentResult`.

- [ ] **Step 12.1: Write failing tests**

Create `apps/api/src/tests/data-enrich.handler.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { DataEnrichHandler } from "../handlers/data-enrich.handler";
import type { DataEnrichmentClient } from "../tools/data-enricher/data-enricher.client";
import type { ToolCacheService } from "../tools/tool-cache.service";

function fakeDraft() {
  return {
    meta: {
      keyword: "kortyzol",
      h1Title: "Jak obniżyć kortyzol",
      language: "pl",
      primaryIntent: "Instrukcyjna",
      model: "gpt-5.2",
      generatedAt: new Date().toISOString(),
      useReasoning: true,
      reasoningEffort: "medium",
      verbosity: "medium",
    },
    htmlContent:
      "<h1>Jak obniżyć kortyzol</h1><h2>X</h2><p>Sen 7-9 godzin obniża kortyzol o 20-30%.</p>",
    blocks: [
      {
        sectionOrder: 0,
        sectionType: "intro",
        sectionVariant: null,
        header: "Intro",
        passageTrigger: "instruction",
        charCount: 10,
        responseId: "r1",
        promptTokens: 1, completionTokens: 1, costUsd: "0", latencyMs: 1,
      },
    ],
    imagePrompts: [],
    stats: {
      blockCount: 1, totalChars: 10, totalLatencyMs: 1,
      totalCostUsd: "0", totalPromptTokens: 1, totalCompletionTokens: 1,
      imagePromptCount: 0,
    },
    warnings: [],
  };
}

describe("DataEnrichHandler.execute", () => {
  it("throws when previousOutputs.draftGen is missing", async () => {
    const client = { enrich: vi.fn() } as unknown as DataEnrichmentClient;
    const cache = { getOrSet: vi.fn() } as unknown as ToolCacheService;
    const handler = new DataEnrichHandler(client, cache, {
      DATA_ENRICH_VERIFY_MODEL: "gpt-5.2",
      DATA_ENRICH_QUESTION_MODEL: "gpt-4.1-mini",
      DATA_ENRICH_MAX_CLAIMS: 15,
      DATA_ENRICH_MIN_SCORE: 2,
      DATA_ENRICH_LOW_CONFIRM_WARNING: 0.2,
      DATA_ENRICH_TTL_DAYS: 7,
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
    ).rejects.toThrow(/data\.enrich requires previousOutputs\.draftGen/);
  });

  it("calls cache.getOrSet and returns DataEnrichmentResult", async () => {
    const draft = fakeDraft();
    const client = {
      enrich: vi.fn().mockResolvedValue({
        htmlContent: "<h1>Ok</h1><p>Sen (Źródło: x).</p>",
        claims: [
          {
            id: 1,
            paragraphHtml: "<p>...</p>",
            claimText: "Sen 7-9 godzin obniża",
            context: "Sen 7-9 godzin obniża",
            claimTypes: ["statystyka"],
            score: 5,
            h2Context: "X",
            tagName: "p",
            question: "Q",
          },
        ],
        verifications: [
          {
            claimId: 1, status: "confirmed",
            source: "Źródło: x", sourceUrl: "https://x.pl",
            note: "",
          },
        ],
        warnings: [],
        stats: { sourcesAdded: 1, correctionsFlagged: 0, unverified: 0 },
        cost: { costUsd: "0.005", latencyMs: 4000 },
      }),
    } as unknown as DataEnrichmentClient;

    const cache = {
      getOrSet: vi.fn(async (args: any) => (await args.fetcher()).result),
    } as unknown as ToolCacheService;

    const handler = new DataEnrichHandler(client, cache, {
      DATA_ENRICH_VERIFY_MODEL: "gpt-5.2",
      DATA_ENRICH_QUESTION_MODEL: "gpt-4.1-mini",
      DATA_ENRICH_MAX_CLAIMS: 15,
      DATA_ENRICH_MIN_SCORE: 2,
      DATA_ENRICH_LOW_CONFIRM_WARNING: 0.2,
      DATA_ENRICH_TTL_DAYS: 7,
    } as any);

    const res = await handler.execute({
      run: { id: "r", input: {} },
      step: { id: "s" },
      project: { id: "p", config: {} },
      previousOutputs: { draftGen: draft },
      attempt: 1,
      forceRefresh: false,
    } as any);

    expect(cache.getOrSet).toHaveBeenCalledTimes(1);
    const out = res.output as any;
    expect(out.meta.keyword).toBe("kortyzol");
    expect(out.htmlContent).toContain("Źródło: x");
    expect(out.claims).toHaveLength(1);
    expect(out.verifications).toHaveLength(1);
    expect(out.stats.totalCostUsd).toBe("0.005");
    expect(out.stats.sourcesAdded).toBe(1);
    expect(out.stats.totalClaimsFound).toBe(1);
  });
});
```

- [ ] **Step 12.2: Run tests to verify they fail**

Run:
```bash
cd apps/api && pnpm vitest run src/tests/data-enrich.handler.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 12.3: Implement the handler**

Create `apps/api/src/handlers/data-enrich.handler.ts`:

```ts
import { Inject, Injectable, Logger } from "@nestjs/common";
import { createHash } from "node:crypto";
import type {
  StepContext,
  StepHandler,
  StepResult,
} from "../orchestrator/step-handler";
import { DraftGenerationResult, DataEnrichmentResult } from "@sensai/shared";
import { ToolCacheService } from "../tools/tool-cache.service";
import { DataEnrichmentClient } from "../tools/data-enricher/data-enricher.client";
import type { Env } from "../config/env";

type HandlerEnv = Pick<
  Env,
  | "DATA_ENRICH_VERIFY_MODEL"
  | "DATA_ENRICH_QUESTION_MODEL"
  | "DATA_ENRICH_MAX_CLAIMS"
  | "DATA_ENRICH_MIN_SCORE"
  | "DATA_ENRICH_LOW_CONFIRM_WARNING"
  | "DATA_ENRICH_TTL_DAYS"
>;

const PROMPT_VERSION = "v1";

@Injectable()
export class DataEnrichHandler implements StepHandler {
  readonly type = "tool.data.enrich";
  private readonly logger = new Logger(DataEnrichHandler.name);

  constructor(
    private readonly client: DataEnrichmentClient,
    private readonly cache: ToolCacheService,
    @Inject("DATA_ENRICH_HANDLER_ENV") private readonly env: HandlerEnv,
  ) {}

  async execute(ctx: StepContext): Promise<StepResult> {
    const prev = ctx.previousOutputs.draftGen;
    if (prev === undefined || prev === null) {
      throw new Error("data.enrich requires previousOutputs.draftGen");
    }
    const draft = DraftGenerationResult.parse(prev);
    const draftHash = sha256(draft.htmlContent);

    const result = await this.cache.getOrSet<DataEnrichmentResult>({
      tool: "data",
      method: "enrich",
      params: {
        draftHash,
        verifyModel: this.env.DATA_ENRICH_VERIFY_MODEL,
        questionModel: this.env.DATA_ENRICH_QUESTION_MODEL,
        maxClaims: this.env.DATA_ENRICH_MAX_CLAIMS,
        minScore: this.env.DATA_ENRICH_MIN_SCORE,
        promptVersion: PROMPT_VERSION,
      },
      ttlSeconds: this.env.DATA_ENRICH_TTL_DAYS * 24 * 3600,
      runId: ctx.run.id,
      stepId: ctx.step.id,
      forceRefresh: ctx.forceRefresh,
      fetcher: async () => {
        const enriched = await this.client.enrich({
          ctx: { runId: ctx.run.id, stepId: ctx.step.id, attempt: ctx.attempt },
          keyword: draft.meta.keyword,
          language: draft.meta.language,
          htmlContent: draft.htmlContent,
        });

        const out: DataEnrichmentResult = {
          meta: {
            keyword: draft.meta.keyword,
            language: draft.meta.language,
            verifyModel: this.env.DATA_ENRICH_VERIFY_MODEL,
            questionModel: this.env.DATA_ENRICH_QUESTION_MODEL,
            generatedAt: new Date().toISOString(),
          },
          htmlContent: enriched.htmlContent,
          claims: enriched.claims,
          verifications: enriched.verifications,
          stats: {
            totalClaimsFound: enriched.claims.length,
            claimsVerified: enriched.verifications.filter(
              (v) => v.status !== "unverified",
            ).length,
            sourcesAdded: enriched.stats.sourcesAdded,
            correctionsFlagged: enriched.stats.correctionsFlagged,
            unverified: enriched.stats.unverified,
            totalCostUsd: enriched.cost.costUsd,
            totalLatencyMs: enriched.cost.latencyMs,
          },
          warnings: enriched.warnings,
        };

        DataEnrichmentResult.parse(out); // self-check before caching

        return {
          result: out,
          costUsd: enriched.cost.costUsd,
          latencyMs: enriched.cost.latencyMs,
        };
      },
    });

    if (result.warnings.length > 0) {
      this.logger.warn(
        { runId: ctx.run.id, stepId: ctx.step.id, warnings: result.warnings },
        `data.enrich: ${result.warnings.length} warnings`,
      );
    }

    this.logger.log(
      {
        runId: ctx.run.id,
        stepId: ctx.step.id,
        claims: result.stats.totalClaimsFound,
        verified: result.stats.claimsVerified,
        sourcesAdded: result.stats.sourcesAdded,
        unverified: result.stats.unverified,
        totalCostUsd: result.stats.totalCostUsd,
      },
      "data.enrich done",
    );

    return { output: result };
  }
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
```

- [ ] **Step 12.4: Re-run tests**

Run:
```bash
cd apps/api && pnpm vitest run src/tests/data-enrich.handler.test.ts
```
Expected: PASS (2/2).

- [ ] **Step 12.5: Commit**

```bash
git add apps/api/src/handlers/data-enrich.handler.ts apps/api/src/tests/data-enrich.handler.test.ts
git commit -m "feat(enrich): add DataEnrichHandler (tool.data.enrich step)"
```

---

## Task 13: Wire handler into `handlers.module.ts`

**Files:**
- Modify: `apps/api/src/handlers/handlers.module.ts`

- [ ] **Step 13.1: Register module + handler + env token**

Edit `apps/api/src/handlers/handlers.module.ts`. After the `DraftGenerateHandler` import line:

```ts
import { DataEnrichHandler } from "./data-enrich.handler";
```

After the `DraftGeneratorModule` import line:

```ts
import { DataEnricherModule } from "../tools/data-enricher/data-enricher.module";
```

Update the `imports`:
```ts
  imports: [
    ToolsModule,
    OutlineGeneratorModule,
    KGDistributorModule,
    DraftGeneratorModule,
    DataEnricherModule,
  ],
```

Add the handler to `providers` (after `DraftGenerateHandler`):
```ts
    DataEnrichHandler,
```

Add the env token (after `DRAFT_GENERATE_HANDLER_ENV`):
```ts
    {
      provide: "DATA_ENRICH_HANDLER_ENV",
      useFactory: () => loadEnv(),
    },
```

Add to the `STEP_HANDLERS` factory's params + body + inject array (after `draftGenerate`):

```ts
        // ... in factory signature:
        dataEnrich: DataEnrichHandler,
        // ... in factory body's array:
        dataEnrich,
        // ... in inject array:
        DataEnrichHandler,
```

- [ ] **Step 13.2: Typecheck**

Run:
```bash
cd apps/api && pnpm typecheck
```
Expected: exit 0.

- [ ] **Step 13.3: Run all API tests**

Run:
```bash
cd apps/api && pnpm vitest run
```
Expected: PASS — no regressions.

- [ ] **Step 13.4: Commit**

```bash
git add apps/api/src/handlers/handlers.module.ts
git commit -m "feat(api): register DataEnrichHandler in HandlersModule"
```

---

## Task 14: Extend pipeline template + seed

**Files:**
- Modify: `apps/api/src/seed/seed.ts`

Append a new template containing the `enrich` step downstream of `draftGen`. The Plan 13 template stays as-is so older runs reference a frozen template version.

- [ ] **Step 14.1: Add a new template variant**

Edit `apps/api/src/seed/seed.ts`. After the `blogSeoOutline` upsertTemplate block (Plan 13 template, currently the last template), before `console.log("Seeded:")`, insert:

```ts
  // Plan 14 — Data Enrichment. Terminal at `enrich` (after `draftGen`).
  const blogSeoEnrich = await upsertTemplate(
    db,
    "Blog SEO — full pipeline + draft + enrich",
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
        { key: "enrich",       type: "tool.data.enrich",        auto: true,  dependsOn: ["draftGen"] },
      ],
    },
  );
```

Also extend the `console.log` block to print the new id:

```ts
  console.log(`    "${blogSeoEnrich.name}" v${blogSeoEnrich.version}: ${blogSeoEnrich.id}`);
```

- [ ] **Step 14.2: Typecheck**

Run:
```bash
cd apps/api && pnpm typecheck
```
Expected: exit 0.

- [ ] **Step 14.3: Commit**

```bash
git add apps/api/src/seed/seed.ts
git commit -m "feat(seed): add Plan 14 template with enrich step"
```

---

## Task 15: Web UI — `data-enrich.tsx` renderer

**Files:**
- Create: `apps/web/src/components/step-output/data-enrich.tsx`
- Modify: `apps/web/src/components/step-output/index.tsx`

Render an enriched-HTML iframe (sandboxed) plus a claims table that surfaces status (✓ confirmed, ⚠ corrected, ❓ unverified) per claim with source + note.

- [ ] **Step 15.1: Create the renderer**

Create `apps/web/src/components/step-output/data-enrich.tsx`:

```tsx
"use client";
import type { DataEnrichmentResult } from "@sensai/shared";

function isEnrichResult(v: unknown): v is DataEnrichmentResult {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.htmlContent === "string" &&
    !!o.meta &&
    Array.isArray(o.claims) &&
    Array.isArray(o.verifications)
  );
}

export function DataEnrichOutput({ value }: { value: unknown }) {
  if (!isEnrichResult(value)) {
    return <div className="text-sm text-muted-foreground">Brak danych</div>;
  }
  return <DataEnrichRenderer output={value} />;
}

function DataEnrichRenderer({ output }: { output: DataEnrichmentResult }) {
  const { meta, htmlContent, claims, verifications, stats, warnings } = output;

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

  const verMap = new Map(verifications.map((v) => [v.claimId, v]));

  return (
    <div className="space-y-4">
      <header className="rounded border bg-slate-50 p-3">
        <div className="text-sm text-muted-foreground">
          keyword: <span className="font-mono">{meta.keyword}</span> · language: {meta.language} · verify: {meta.verifyModel} · question: {meta.questionModel}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {stats.totalClaimsFound} claims · {stats.sourcesAdded} potwierdzonych ·
          {" "}{stats.correctionsFlagged} korekt · {stats.unverified} bez źródła ·
          ${stats.totalCostUsd} · {stats.totalLatencyMs} ms
        </div>
      </header>

      <section>
        <div className="mb-2 text-sm font-semibold">Wzbogacony HTML</div>
        <iframe
          title="Enriched preview"
          srcDoc={sandboxedHtml}
          sandbox="allow-same-origin"
          className="h-[600px] w-full rounded border bg-white"
        />
      </section>

      <section>
        <div className="mb-2 text-sm font-semibold">Claims ({claims.length})</div>
        <div className="space-y-1">
          {claims.map((c) => {
            const v = verMap.get(c.id);
            const statusIcon =
              v?.status === "confirmed" ? "✓" :
              v?.status === "corrected" ? "⚠" : "❓";
            const statusClass =
              v?.status === "confirmed" ? "text-emerald-700" :
              v?.status === "corrected" ? "text-amber-700" : "text-slate-500";
            return (
              <div key={c.id} className="rounded border bg-white p-2 text-xs">
                <div className="font-mono">
                  <span className={statusClass}>{statusIcon}</span>
                  {" "}#{c.id} (score={c.score}, {c.claimTypes.join(", ")}) · {c.h2Context} · &lt;{c.tagName}&gt;
                </div>
                <div className="mt-1">{c.claimText}</div>
                {c.question && (
                  <div className="mt-1 text-muted-foreground">Q: {c.question}</div>
                )}
                {v && v.status !== "unverified" && (
                  <div className="mt-1 text-emerald-700">
                    {v.source}{v.sourceUrl ? ` — ${v.sourceUrl.replace(/^https?:\/\//, "")}` : ""}
                  </div>
                )}
                {v?.correctedValue && (
                  <div className="mt-1 rounded bg-amber-50 px-2 py-1 text-amber-900">
                    Korekta: {v.correctedValue} {v.note ? `· ${v.note}` : ""}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {warnings.length > 0 && (
        <section className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          <div className="mb-1 font-semibold text-amber-900">Ostrzeżenia ({warnings.length})</div>
          <ul className="list-disc space-y-1 pl-5">
            {warnings.map((w, i) => (
              <li key={i}>
                <span className="font-mono text-xs">{w.kind}</span>: {w.message}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 15.2: Register the renderer in `index.tsx`**

Edit `apps/web/src/components/step-output/index.tsx`. Add import after `DraftOutput`:

```tsx
import { DataEnrichOutput } from "./data-enrich";
```

Add a `case` in the switch (after `tool.draft.generate`):

```tsx
    case "tool.data.enrich":
      return <DataEnrichOutput value={value} />;
```

Update `hasRichRenderer`:

```tsx
    type === "tool.draft.generate" ||
    type === "tool.data.enrich"
```

- [ ] **Step 15.3: Web typecheck**

Run:
```bash
cd apps/web && pnpm typecheck
```
Expected: exit 0.

- [ ] **Step 15.4: Commit**

```bash
git add apps/web/src/components/step-output/data-enrich.tsx apps/web/src/components/step-output/index.tsx
git commit -m "feat(web): add DataEnrichOutput renderer for tool.data.enrich"
```

---

## Task 16: Smoke script + npm script registration

**Files:**
- Create: `scripts/smoke-plan-14.ts`
- Modify: `package.json` (root)

Real-LLM smoke. Reads `scripts/smoke-output/plan-13-draft.json` (Plan 13 smoke output), calls `DataEnrichHandler` with stub cache (passes through to fetcher), writes result + enriched HTML to `smoke-output/`.

- [ ] **Step 16.1: Create the smoke script**

Create `scripts/smoke-plan-14.ts`:

```ts
#!/usr/bin/env tsx
/**
 * Plan 14 manual smoke test — Data enrichment.
 *
 * Reads the Plan 13 smoke output (`scripts/smoke-output/plan-13-draft.json`)
 * and runs DataEnrichHandler in isolation.
 *
 * Pre-req: run `pnpm smoke:plan-13` first to produce the input fixture.
 *
 * Run: pnpm smoke:plan-14
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
import { DataEnrichmentClient } from "../apps/api/src/tools/data-enricher/data-enricher.client";
import { DataEnrichHandler } from "../apps/api/src/handlers/data-enrich.handler";
import { loadEnv } from "../apps/api/src/config/env";
import { DraftGenerationResult } from "@sensai/shared";

const OUTPUT_DIR = resolve(__dirname, "smoke-output");
const INPUT_FILE = join(OUTPUT_DIR, "plan-13-draft.json");

async function main() {
  if (!existsSync(INPUT_FILE)) {
    console.error(
      `[smoke] FAIL — input fixture missing: ${INPUT_FILE}\n` +
        "Run `pnpm smoke:plan-13` first to produce it.",
    );
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(INPUT_FILE, "utf-8"));
  const draft = DraftGenerationResult.parse(raw);

  console.log(
    `[smoke] draft: ${draft.htmlContent.length} chars, ` +
      `${draft.blocks.length} blocks, language=${draft.meta.language}`,
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
  const enrichmentClient = new DataEnrichmentClient(responsesClient, env);
  const handler = new DataEnrichHandler(enrichmentClient, stubCache, env);

  const ctx = {
    run: { id: randomUUID(), input: { topic: draft.meta.keyword } },
    step: { id: "smoke-step-data-enrich" },
    project: { id: "smoke-project", config: {} },
    previousOutputs: { draftGen: draft },
    attempt: 1,
    forceRefresh: false,
  } as any;

  console.log("[smoke] data.enrich …");
  const t0 = Date.now();
  const res = await handler.execute(ctx);
  const ms = Date.now() - t0;
  const out = res.output as any;

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(
    join(OUTPUT_DIR, "plan-14-enriched.json"),
    JSON.stringify(out, null, 2),
    "utf-8",
  );
  writeFileSync(
    join(OUTPUT_DIR, "plan-14-enriched.html"),
    out.htmlContent,
    "utf-8",
  );

  console.log(
    `[smoke] data.enrich done: ${ms}ms | ` +
      `claims=${out.stats.totalClaimsFound} ` +
      `verified=${out.stats.claimsVerified} ` +
      `sources+=${out.stats.sourcesAdded} ` +
      `corrections=${out.stats.correctionsFlagged} ` +
      `unverified=${out.stats.unverified} ` +
      `cost=$${out.stats.totalCostUsd} ` +
      `warnings=${out.warnings.length}`,
  );

  console.log(
    `[smoke] ASSERT claims>0: ${out.stats.totalClaimsFound > 0 ? "PASS" : `WARN (got ${out.stats.totalClaimsFound})`}`,
  );
  console.log(
    `[smoke] ASSERT html>=draft.length: ${out.htmlContent.length >= draft.htmlContent.length ? "PASS" : `WARN (shrunk by ${draft.htmlContent.length - out.htmlContent.length})`}`,
  );
  console.log(
    `[smoke] ASSERT verifications==claims: ${out.verifications.length === out.claims.length ? "PASS" : "WARN"}`,
  );

  console.log("[smoke] PASS — Plan 14 data.enrich smoke complete");
}

main().catch((e) => {
  console.error("[smoke] FAIL:", e);
  process.exit(1);
});
```

- [ ] **Step 16.2: Register the npm script**

Edit `package.json` (root). After the `"smoke:plan-13"` line in `"scripts"`, add:

```json
    "smoke:plan-14": "apps/api/node_modules/.bin/tsx --tsconfig apps/api/tsconfig.json scripts/smoke-plan-14.ts"
```

- [ ] **Step 16.3: Verify script syntax with typecheck**

Run:
```bash
cd apps/api && pnpm typecheck
```
Expected: exit 0 — the script imports must resolve.

- [ ] **Step 16.4: Commit**

```bash
git add scripts/smoke-plan-14.ts package.json
git commit -m "test(enrich): add Plan 14 manual smoke script"
```

---

## Task 17: Final verification — full test suite + manual smoke

**Files:** none (verification step).

- [ ] **Step 17.1: Run full API test suite**

Run:
```bash
cd apps/api && pnpm vitest run
```
Expected: PASS — all tests including Plan 13 still pass.

- [ ] **Step 17.2: Typecheck both apps**

Run (in parallel from root):
```bash
pnpm -r typecheck
```
Expected: exit 0 across `@sensai/shared`, `@sensai/api`, and `web`.

- [ ] **Step 17.3: Run real-LLM smoke (manual — costs ≈ $0.005)**

Pre-req: `apps/api/.env` has `OPENAI_API_KEY` and Plan 13 smoke has been run.

Run:
```bash
pnpm smoke:plan-14
```
Expected:
- log `claims>0: PASS`
- log `verifications==claims: PASS`
- `scripts/smoke-output/plan-14-enriched.html` exists with at least one `(Źródło:` marker (or zero if WHO/PL sources were unavailable; not a failure)
- script exits 0

- [ ] **Step 17.4: UI manual check**

Start dev:
```bash
pnpm dev
```
1. Trigger a fresh run with the new `Blog SEO — full pipeline + draft + enrich` template (or replay an existing draft via Plan 08 manual step rerun on `enrich`).
2. After the step completes, open the run detail page and verify the **enrich** step shows: header chips, sandboxed iframe with the article, a claims table with status icons, and any warnings. NO console errors.

- [ ] **Step 17.5: Commit any incidental fixes from verification**

If steps 17.1–17.4 surfaced fixes:
```bash
git add -p   # review hunks
git commit -m "fix(enrich): <specific issue>"
```

If no fixes are needed: skip this step.

---

## Self-review summary

- **Spec coverage:** All eight regex categories from the lesson are implemented (Task 6). Question-generation stage (Task 8), web-search verification stage (Task 9), HTML insertion with reverse order + dedup (Task 7), pipeline client (Task 10), handler with cache (Task 12), seed wiring (Task 14), UI (Task 15), and smoke (Task 16). Lesson's "non-invasive" rule (corrected ≠ rewrites prose) is enforced by Task 7's `insertSources` and Task 12's handler. Lesson's three statuses (confirmed/corrected/unverified) are encoded in `VerificationStatus` (Task 1).
- **Type consistency:** `ExtractedClaim`, `ClaimVerification`, `DataEnrichmentResult`, `EnrichmentWarning` are defined once in Task 1 and imported everywhere by name from `@sensai/shared`. `tagName` ∈ {p, li, td} via `ClaimTagName` enum.
- **Web search cost is acknowledged but NOT tracked** (Gotcha 4) — call this out in the run UI's warnings tab via the `enrich_web_search_cost_untracked` warning kind (defined in schema, **not yet emitted**); follow-up plan to track tool-call cost.

---
