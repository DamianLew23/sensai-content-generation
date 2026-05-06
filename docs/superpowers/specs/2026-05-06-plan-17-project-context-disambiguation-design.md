# Plan 17 — Project Context + Topic Disambiguation

**Date:** 2026-05-06
**Status:** Design approved, awaiting implementation plan
**Predecessors:** Plan 16 (Article Humanize), Plan 8 (Manual Step Re-run), Plan 1 (Foundation — `ProjectConfig`)

## Problem

The pipeline lacks any anchor connecting a generated article to the project's product/business domain. `ProjectConfig` today carries brand voice (`toneOfVoice`, `targetAudience`, `guidelines`) but no information about what the project actually does or sells.

Concrete failure case: with the `demo` project and topic "Jak napisać instrukcję", the pipeline produced an article about physical-device manuals. The intended interpretation — "how to write a user guide for a web application" matching click2docs.pl's product (a SaaS that auto-generates app user guides from click recordings) — was unreachable because:

1. `tool.youcom.research` and `tool.serp.fetch` consume `RunInput.topic` directly with no project anchor, so research pulls the dominant Google interpretation (consumer device manuals).
2. By the time `llm.brief` runs, source material is already biased toward the wrong vertical; brand voice fields cannot recover the lost interpretation.

The fix must intervene **before** expensive research stages (you.com $0.15 / 76s, SERP/PAA, Firecrawl scrape).

## Solution overview

Add a new pipeline step `tool.topic.disambiguate` at the head of the DAG. It takes the raw `RunInput` and the project's domain context, and produces a refined topic plus stage-specific search queries plus an explicit list of `antiAngles` (interpretations to exclude). Subsequent research/brief/draft handlers consume the disambiguator's output instead of the raw `RunInput`.

The step runs `auto: false` — operator reviews and may edit fields before approving, blocking the expensive downstream calls until the interpretation is correct.

The project's domain context lives on `ProjectConfig` as five new optional fields (`productPitch`, `domain`, `keyTerms`, `antiTerms`, `competitors`), filled manually via the project edit form.

This is shipped as a **new opt-in template** ("Blog SEO — full + disambiguation") alongside existing templates, which remain unchanged. Backwards compatibility is preserved by making all new `ProjectConfig` fields optional with empty defaults, and by keeping the disambiguator step optional in the DAG.

## Key decisions (from brainstorming)

| # | Decision | Chosen | Rejected |
|---|---|---|---|
| 1 | Where in pipeline | Separate `disambiguate` step before research | Brief-only injection; research-side preprocessing |
| 2 | Project context shape | Structured fields | Single freeform paragraph; hybrid |
| 3 | How operator fills it | Manual form now; auto-draft from URL deferred to future plan | Manual-only forever; auto-draft now |
| 4 | Disambiguator output | Full structured (`refinedTopic`, `mainKeyword`, `intent`, `contentType`, `researchQuestion`, `serpQueries[]`, `antiAngles[]`, `rationale`) | Single string; minimal RunInput-shaped |
| 5 | Auto vs checkpoint | `auto: false` (manual approve before research) | `auto: true`; pause-between-steps |
| 6 | Backwards compat | New template only | Migrate all templates; opt-in flag on project |
| 7 | Per-run override | None — `ProjectConfig` is source of truth, edit disambiguator output for one-off tweaks | Allow `RunInput` to override `ProjectConfig` fields |

## Architecture

### 1. Schema extension — `ProjectConfig`

File: `packages/shared/src/schemas.ts`. Five new optional fields appended to existing `ProjectConfig`:

```ts
productPitch: z.string().default(""),       // 1-2 sentences describing the product
domain:       z.string().default(""),       // e.g. "SaaS / dokumentacja techniczna"
keyTerms:     z.array(z.string()).default([]),  // terms that MUST appear / be honored
antiTerms:    z.array(z.string()).default([]),  // interpretations to EXCLUDE (different niche)
competitors:  z.array(z.string()).default([]),  // optional competitor names
```

`ProjectConfig` already lives in JSONB on the `projects` table (Plan 1), so no DDL migration is required. Existing rows continue to work — the new fields default to empty values and contribute nothing.

The `packages/shared` package must be rebuilt to `dist/` after changes (Node 24 ESM build gotcha — see `shared_package_build_gotcha` memory).

### 2. New step type: `tool.topic.disambiguate`

Directory: `apps/api/src/tools/topic-disambiguator/`, following the convention of existing single-purpose handlers (`kg-assembler`, `data-enricher`, `query-fanout`, etc.).

**Output schema** (Zod, validated in handler like other tools):

```ts
{
  refinedTopic:     string,    // disambiguated topic statement
  mainKeyword:      string,    // primary keyword for SERP
  intent:           "informational" | "navigational" | "transactional" | "commercial",
  contentType:      string,    // e.g. "how-to guide", "listicle", "comparison"
  researchQuestion: string,    // full-sentence question for you.com deep research
  serpQueries:      string[],  // 2-4 keyword variants for SERP/PAA fan-out
  antiAngles:       string[],  // interpretations to exclude (seeded from antiTerms + LLM additions)
  rationale:        string,    // 1-2 sentences explaining choices (audit trail / human review)
}
```

**Model:** `openai/gpt-5-mini` (matches existing `defaultModels.brief`). One LLM call, ~1k input tokens / ~400 output tokens.

**Caching:** standard `tool-cache.service` keyed on hash of `(topic, RunInput hints, ProjectConfig domain fields, model)`. Editing `ProjectConfig` invalidates cache automatically.

**Audit trail:** standard `tool-call-recorder` (input snapshot + output snapshot in DB), consistent with all Plan 02+ handlers.

**Mode:** `auto: false`. Operator reviews the seven output fields in UI, edits any of them, clicks "Approve & continue" — only then do `dependsOn` steps (`deepResearch`, `research`) become eligible to run.

**Prompt skeleton:**

System message includes:
- Role: "Jesteś analitykiem contentu marki '{project.name}'. Doprecyzuj temat artykułu w kontekście tego projektu zanim odpalimy drogi research."
- Project context block: `productPitch`, `domain`, plus existing `targetAudience` and `guidelines`.
- Hard guards:
  - "MUSZĄ pojawić się / być uwzględnione: {keyTerms}"
  - "NIE WOLNO iść w tę interpretację — to inna nisza: {antiTerms}"
- Competitors block (if non-empty): "Konkurujemy z: {competitors}".
- Output instruction: "Zwróć wyłącznie JSON zgodny ze schematem."

User message: raw `topic` + any hints from `RunInput` (`mainKeyword`, `intent`, `contentType` if operator pre-filled them).

### 3. Orchestrator helpers

Two helpers in the orchestrator layer cover two distinct access patterns:

**3a. `getResolvedRunInput(run, runSteps): RunInput`** — merges only the four `RunInput`-shaped fields, returning a value with the same shape as today's `RunInput`. Handlers that currently read `run.input.{topic, mainKeyword, intent, contentType}` switch to this helper:

```ts
function getResolvedRunInput(run, runSteps): RunInput {
  const disambiguate = runSteps.find(s => s.type === "tool.topic.disambiguate" && s.status === "completed");
  if (!disambiguate) return run.input;
  return {
    ...run.input,
    topic:        disambiguate.output.refinedTopic,
    mainKeyword:  disambiguate.output.mainKeyword,
    intent:       disambiguate.output.intent,
    contentType:  disambiguate.output.contentType,
  };
}
```

**3b. `getDisambiguateOutput(runSteps): DisambiguateOutput | null`** — returns the full disambiguator output for the three fields that have no `RunInput` analogue (`researchQuestion`, `serpQueries`, `antiAngles`). Handlers that need these fields call this helper and fall back to `RunInput` defaults when it returns `null` (i.e. for templates without the disambiguate step).

Tests:

- No `disambiguate` step in DAG → `getResolvedRunInput` returns raw `run.input`; `getDisambiguateOutput` returns `null` (regression coverage for existing templates).
- `disambiguate` completed → `getResolvedRunInput` returns merged RunInput; `getDisambiguateOutput` returns the parsed output.

### 4. Downstream consumption

| Handler | Today reads | After Plan 17 | Helper used |
|---|---|---|---|
| `tool.youcom.research` | `input.topic` | `disambiguate.output.researchQuestion` if available, else resolved `topic` | `getDisambiguateOutput` + `getResolvedRunInput` fallback |
| `tool.serp.fetch` | `input.mainKeyword \|\| input.topic` | `disambiguate.output.serpQueries[0]` if available, else resolved `mainKeyword`/`topic` | same |
| `tool.query.fanout` (Plan 10) | `input.topic` + entities | resolved `refinedTopic` + entities; additionally consumes `disambiguate.output.serpQueries[1..]` as seed variants for fan-out if available | both helpers |
| `llm.brief` | RunInput fields | resolved RunInput fields PLUS new `antiAngles` block in system prompt | both helpers |
| `outline.generate`, `draft.*`, `tool.article.*` | brief + outline | unchanged — `antiAngles` propagates implicitly via the brief | none |

`tool.serp.fetch` operates on a single query today; only `serpQueries[0]` is consumed. The remaining variants (`serpQueries[1..]`) are seeded into `query-fanout` (which already issues multiple queries by design). Future plans may give SERP itself multi-query support; this spec does not extend SERP.

**`antiAngles` block in `briefPrompt.system()`:**

Appended after existing tone/audience/guidelines lines, formatted analogously to existing hard-guards in `article-protect`/`article-intermediate`:

```
KRYTYCZNE — UNIKAJ tych interpretacji tematu (są z innej niszy niż projekt):
- {antiAngles[0]}
- {antiAngles[1]}
...
```

Block is omitted entirely when `antiAngles` is empty (i.e. for runs without disambiguate or with no anti-terms configured).

### 5. UI

**Project edit form** (`apps/web/src/components/...`):

Adds a "Kontekst produktu" section to the existing project config form:

- `productPitch` — `<textarea>` (2-3 rows)
- `domain` — `<input type="text">`
- `keyTerms`, `antiTerms`, `competitors` — tag-input controls (type + Enter adds a tag, click X removes)

Validation is enforced server-side via the Zod schema from §1; the UI mirrors it for inline feedback.

**`DisambiguateOutput` renderer** (`apps/web/src/components/.../DisambiguateOutput.tsx`):

Follows the existing per-step renderer convention (`ArticleHumanizeOutput`, `ContentExtractOutput`, etc.). Shows:

- Seven editable inputs for output fields (`refinedTopic`, `mainKeyword`, `intent` as dropdown, `contentType`, `researchQuestion`, `serpQueries` as tag-input, `antiAngles` as tag-input).
- `rationale` as readonly subtitle text.
- "Approve & continue" button — persists (possibly edited) output and unblocks `dependsOn` steps.
- Standard "Re-run" affordance from Plan 8 (manual rerun cascades dependsOn reset).

Registered in the existing component registry (or equivalent) keyed on step type `tool.topic.disambiguate`.

### 6. Seed — new template

`apps/api/src/seed/seed.ts` — adds one new template, leaves all existing templates untouched:

```ts
const blogSeoFullDisambiguate = await upsertTemplate(
  db,
  "Blog SEO — full + disambiguation",
  1,
  {
    steps: [
      { key: "disambiguate", type: "tool.topic.disambiguate", auto: false, dependsOn: [] },
      { key: "deepResearch", type: "tool.youcom.research",    auto: true,  dependsOn: ["disambiguate"] },
      { key: "research",     type: "tool.serp.fetch",         auto: true,  dependsOn: ["disambiguate"] },
      { key: "scrape",       type: "tool.scrape",             auto: false, dependsOn: ["research"] },
      { key: "clean",        type: "tool.content.clean",      auto: true,  dependsOn: ["scrape"] },
      { key: "extract",      type: "tool.content.extract",    auto: true,  dependsOn: ["clean", "deepResearch"] },
      { key: "entities",     type: "tool.entity.extract",     auto: true,  dependsOn: ["extract"] },
      { key: "fanout",       type: "tool.query.fanout",       auto: true,  dependsOn: ["entities"] },
      { key: "kg",           type: "tool.kg.assemble",        auto: true,  dependsOn: ["fanout"] },
      { key: "outline",      type: "outline.generate",        auto: true,  dependsOn: ["kg"] },
      { key: "distribute",   type: "outline.distribute",      auto: true,  dependsOn: ["outline"] },
      { key: "draft",        type: "draft.generate",          auto: true,  dependsOn: ["distribute"] },
      { key: "enrich",       type: "tool.data.enrich",        auto: true,  dependsOn: ["draft"] },
      { key: "optimize",     type: "tool.article.optimize",   auto: true,  dependsOn: ["enrich"] },
      { key: "humanize",     type: "tool.article.humanize",   auto: true,  dependsOn: ["optimize"] },
    ],
  },
);
```

## Build sequence

Each step is its own commit, mirroring the project's per-plan commit style:

1. **Schema + shared rebuild** — extend `ProjectConfig` in `packages/shared/src/schemas.ts`, build `packages/shared` to `dist/`, verify import in `apps/api`. No DDL migration.
2. **Disambiguator handler** — `topic-disambiguator/disambiguate.handler.ts` + prompt + Zod output schema + cache + audit recorder + unit test (`tests/disambiguate.handler.test.ts`).
3. **Orchestrator helper** — `getResolvedRunInput` + unit tests for both branches.
4. **Downstream integration** — single-line source-of-RunInput swap in `youcom-research.handler.ts`, `serp-fetch.handler.ts`, `query-fanout.handler.ts`, plus `antiAngles` block in `brief.prompt.ts`. Each change paired with a regression test confirming pre-Plan-17 templates still work.
5. **Seed update** — `blogSeoFullDisambiguate` in `seed.ts`, re-run seed locally.
6. **UI — project config form** — "Kontekst produktu" section with five fields.
7. **UI — `DisambiguateOutput` renderer** — component + registry registration.
8. **Smoke A** — offline regression script (see §Smoke).
9. **Smoke B** — manual full-pipeline run by user before merge.

## Smoke

### Smoke A — disambiguator only (offline, no paid research)

File: `scripts/smoke-plan-17.ts`. Self-contained, callable as `pnpm smoke:plan-17` (matching existing convention).

1. Update the `demo` project (or an isolated `demo-click2docs` test project) with realistic `ProjectConfig` domain fields:
   - `productPitch`: "click2docs.pl to SaaS do generowania instrukcji obsługi aplikacji webowych na podstawie nagrań kliknięć użytkownika."
   - `domain`: "SaaS / dokumentacja techniczna"
   - `keyTerms`: `["instrukcja aplikacji", "user guide", "onboarding", "dokumentacja produktu"]`
   - `antiTerms`: `["urządzenia fizyczne", "AGD", "sprzęt", "instrukcja obsługi pralki"]`
   - `competitors`: `["Tango", "Scribe", "Guidde"]`
2. Run the disambiguator handler with topic **"Jak napisać instrukcję"** (the regression case).
3. Pass criteria (asserted in script):
   - `refinedTopic` matches `/aplikacj|SaaS|softw|web/i`.
   - `antiAngles` contains at least one term from `antiTerms` (case-insensitive).
   - `serpQueries` length ∈ [2, 4]; no entry matches `/urządzenia|AGD|pralk/i`.
4. Output saved to `scripts/smoke-output/plan-17-disambiguate.json` (consistent with prior plans).

### Smoke B — full pipeline with disambiguation (paid, manual)

User runs the new "Blog SEO — full + disambiguation" template end-to-end on the same topic. Verifies the final article discusses application/web-software user guides, not consumer-device manuals. Total cost ≈ existing Blog SEO ($0.40-ish) + ~$0.003 for disambiguator. This is a manual gate before merge, not an automated CI check.

## Cost & latency

| Component | Cost | Latency |
|---|---|---|
| Disambiguator LLM call (gpt-5-mini, ~1k in / ~400 out) | $0.001-0.003 | 2-4 s |
| ProjectConfig form (no LLM) | $0 | instant |
| Manual approve in UI | $0 | ~10-30 s of operator reading |

Negligible relative to existing pipeline costs (you.com $0.15, Optimize $0.22, Humanize $0.232). Net positive: prevents waste of $0.40+ runs that go down the wrong niche.

## Risks & mitigations

- **R1 — LLM ignores `antiTerms` guard.** gpt-5-mini might still drift toward the dominant interpretation. *Mitigation:* hard-fail validator after the LLM call (analogous to Plan 15 / Plan 16 guards) checking that no `antiTerm` appears in `refinedTopic` or any `serpQueries` entry. On fail: one retry with a strengthened prompt; second fail marks the step `failed` with message "antiterms detected in disambiguator output — edit ProjectConfig or topic".
- **R2 — Template proliferation in catalog.** Operator now has both "Blog SEO — full" and "Blog SEO — full + disambiguation" visible. *Mitigation:* clear naming + a one-line description in the UI selector explaining when to pick the new variant. If usage data later shows the old template is unused, retire it in a follow-up.
- **R3 — Cache invalidation across `ProjectConfig` edits.** Old runs replayed after a config edit must not see the new fields retroactively. *Mitigation:* `getResolvedRunInput` reads from the `disambiguate.output` snapshot stored on the run, not from the live `ProjectConfig`. Historical runs remain reproducible.
- **R4 — Projects without domain context fields.** `demo` and any project not yet updated will have empty new fields. *Mitigation:* all five fields default to empty; the disambiguator with empty context returns a lightly-paraphrased topic and an empty `antiAngles` list — functionally equivalent to today's behavior, just with one extra step in the DAG.

## Out of scope (deliberate YAGNI)

- **Auto-draft `ProjectConfig` from a project URL.** Deferred to a future Plan 18 if Plan 17 demonstrates the disambiguation actually solves the problem.
- **Per-run override of `ProjectConfig` fields.** Operator already has two escape hatches: edit `ProjectConfig` itself, or edit the disambiguator output in the UI before approval.
- **Migrating existing templates to include `disambiguate`.** Opt-in via the new template only; if disambiguation proves itself, a later plan can migrate.
- **LLM-judge for disambiguation quality.** Manual smoke + the regression assertions in Smoke A are sufficient for MVP.
- **Auto-mode for `disambiguate`.** The whole point of choosing a separate step (decision #1, option C) was to gate the expensive research stages on human review; auto-mode would defeat that.
