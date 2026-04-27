# Plan 09 — Entity & Relation Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `tool.entity.extract` step that converts cleaned markdown + optional deep research briefing into a structured set of **entities** (PERSON / ORGANIZATION / LOCATION / PRODUCT / CONCEPT / EVENT), **relationships** between them, and **relevance scores to the central keyword** — using one LLM call (`google/gemini-3-flash-preview` via OpenRouter). Lesson 2.6 / 2.7 scope, LLM-only path (Option C from brainstorm: Python/spaCy + Transformers layer is deferred to a future plan).

**Architecture:** New tool module `tools/entity-extractor/` with a thin wrapper around `LlmClient.generateObject` (structured output validated by Zod, including a `superRefine` that enforces graph integrity — every relationship and `relationToMain` entry must reference an entity ID emitted in the same call; every entity must have a `relationToMain` entry). New handler `EntityExtractHandler` reads `previousOutputs.clean` (required) and `previousOutputs.deepResearch` (optional) — same shape as Plan 07 — and emits a typed `EntityExtractionResult`. Cached for 7 days under `tool: "entity"` / `method: "extract"`. Fails closed on schema violation. Runs **in parallel with** `tool.content.extract` (both depend on `clean + deepResearch`); brief integration is out of scope.

**Tech Stack:** TypeScript / NestJS / AI SDK v5 / `@ai-sdk/openai-compatible` (OpenRouter) / `google/gemini-3-flash-preview` / Zod / Drizzle / BullMQ / Vitest.

**Spec sources:**
- Lesson notes: `docs/edu/lekcja-2-6/lekcja-2-6-ekstrakcja-encji-i-relacji.md`
- Reference prompt: `docs/edu/lekcja-2-6/ekstrakcja_encji_prompt_llm.md` (English instructions, Polish output)
- Lesson 2.7 (`docs/edu/lekcja-2-7/lekcja-2-7-alternatywna-ekstrakcja-ner.md`) — Python NER alternative; out of scope for this plan.

**Critical gotcha 1 — Pricing already covered:** `google/gemini-3-flash-preview` is already in `apps/api/src/llm/pricing.ts` from Plan 07 (line 14). Do not add a duplicate row.

**Critical gotcha 2 — Shared package build:** `packages/shared` must be **built to `dist/`** after every change to `schemas.ts` (`pnpm --filter @sensai/shared build`). The API imports from compiled `dist`, not `src`. Every task that touches `packages/shared/src/schemas.ts` must end with a build step.

**Critical gotcha 3 — `previousOutputs` keys follow step keys, not types:** Templates use `{ key: "clean", type: "tool.content.clean" }` and `{ key: "deepResearch", type: "tool.youcom.research" }`. The orchestrator exposes outputs under **step keys**, so the handler reads `ctx.previousOutputs.clean` and `ctx.previousOutputs.deepResearch`. The handler tolerates `deepResearch` being absent.

**Critical gotcha 4 — `generateObject` + Zod superRefine fail-closed:** AI SDK validates the returned object against the Zod schema. The graph-integrity `superRefine` will reject outputs where:
- a relationship references an entity ID not in the `entities` array,
- a `relationToMain` entry references an unknown entity ID,
- an entity has no corresponding `relationToMain` entry.

This is intentional — the orchestrator marks the step failed and the user can re-run via Plan 08's manual re-run with `forceRefresh`. No retries, no auto-repair, no partial outputs.

**Critical gotcha 5 — Token reuse:** Plan 07 introduced the `EXTRACT_ENV` DI token. Do NOT reuse it. This plan creates a separate `ENTITY_EXTRACT_ENV` token so future env keys don't bleed across handlers.

**Critical gotcha 6 — DAG parallelism:** The new template puts `entities` and `extract` at the same dependency level (`["clean", "deepResearch"]`). The orchestrator runs them in parallel. Both call OpenRouter with structured output — there's no shared mutable state, so no extra coordination is required.

---

## File Structure

```
apps/api/src/
├── tools/entity-extractor/                    (NEW)
│   ├── entity-extractor.client.ts             Wraps LlmClient.generateObject + cost tracking
│   ├── entity-extractor.module.ts             NestJS module exporting EntityExtractorClient
│   └── entity-extractor.types.ts              Internal helper types
├── prompts/
│   └── entity-extract.prompt.ts               (NEW) system + user prompt builders
├── handlers/
│   └── entity-extract.handler.ts              (NEW) StepHandler for "tool.entity.extract"
├── config/env.ts                              (MODIFY) Add ENTITY_EXTRACT_* vars
├── tools/tools.module.ts                      (MODIFY) Import EntityExtractorModule
├── handlers/handlers.module.ts                (MODIFY) Register EntityExtractHandler + ENTITY_EXTRACT_ENV
├── seed/seed.ts                               (MODIFY) Add new template
└── tests/
    ├── entity-extract.prompt.test.ts          pure fn unit — prompt composition
    ├── entity-extractor.client.test.ts        mocked LlmClient
    └── entity-extract.handler.test.ts         mocked client + cache + previousOutputs

packages/shared/src/schemas.ts                 (MODIFY) Add EntityType, RelationType, ContextAnalysis,
                                                        EntityExtractionMetadata, Entity, EntityRelation,
                                                        RelationToMain, EntityExtractionResult
apps/web/src/components/step-output/
├── entities.tsx                               (NEW) EntitiesOutput renderer (3 tabs: encje / relacje / istotność)
└── index.tsx                                  (MODIFY) Route "tool.entity.extract" + hasRichRenderer
.env.example                                   (MODIFY) Add ENTITY_EXTRACT_*
scripts/smoke-plan-09.ts                       (NEW) Manual end-to-end smoke test
package.json (root)                            (MODIFY) Add "smoke:plan-09" script
```

---

## Task 1: Shared schemas for EntityExtractionResult

**Files:**
- Modify: `packages/shared/src/schemas.ts` (append at end)
- Build: `packages/shared` (must produce `dist/`)

No unit test for pure Zod schemas — runtime tests in later tasks exercise them.

- [ ] **Step 1: Append new schemas to `packages/shared/src/schemas.ts`**

Open `packages/shared/src/schemas.ts` and append at the very end (after the existing `RerunPreview` export):

```ts
export const EntityType = z.enum([
  "PERSON",
  "ORGANIZATION",
  "LOCATION",
  "PRODUCT",
  "CONCEPT",
  "EVENT",
]);
export type EntityType = z.infer<typeof EntityType>;

export const RelationType = z.enum([
  "PART_OF",
  "LOCATED_IN",
  "CREATED_BY",
  "WORKS_FOR",
  "RELATED_TO",
  "HAS_FEATURE",
  "SOLVES",
  "COMPETES_WITH",
  "CONNECTED_TO",
  "USED_BY",
  "REQUIRES",
]);
export type RelationType = z.infer<typeof RelationType>;

export const ContextAnalysis = z.object({
  mainTopicInterpretation: z.string().min(1).max(500),
  domainSummary: z.string().min(1).max(500),
  notes: z.string().max(500).default(""),
});
export type ContextAnalysis = z.infer<typeof ContextAnalysis>;

export const EntityExtractionMetadata = z.object({
  keyword: z.string().min(1),
  language: z.string().min(2).max(10),
  sourceUrlCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});
export type EntityExtractionMetadata = z.infer<typeof EntityExtractionMetadata>;

export const Entity = z.object({
  id: z.string().regex(/^E\d+$/, "id must be E<number>"),
  originalSurface: z.string().min(1).max(200),
  entity: z.string().min(1).max(200),
  domainType: EntityType,
  evidence: z.string().min(1).max(300),
});
export type Entity = z.infer<typeof Entity>;

export const EntityRelation = z.object({
  source: z.string().regex(/^E\d+$/, "source must be E<number>"),
  target: z.string().regex(/^E\d+$/, "target must be E<number>"),
  type: RelationType,
  description: z.string().min(1).max(300),
  evidence: z.string().min(1).max(300),
});
export type EntityRelation = z.infer<typeof EntityRelation>;

export const RelationToMain = z.object({
  entityId: z.string().regex(/^E\d+$/, "entityId must be E<number>"),
  score: z.number().int().min(1).max(100),
  rationale: z.string().min(1).max(300),
});
export type RelationToMain = z.infer<typeof RelationToMain>;

export const EntityExtractionResult = z
  .object({
    metadata: EntityExtractionMetadata,
    contextAnalysis: ContextAnalysis,
    entities: Entity.array().min(8),
    relationships: EntityRelation.array().min(3),
    relationToMain: RelationToMain.array().min(8),
  })
  .superRefine((val, ctx) => {
    const entityIds = new Set(val.entities.map((e) => e.id));

    // unique entity ids
    if (entityIds.size !== val.entities.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "duplicate entity ids",
        path: ["entities"],
      });
    }

    // every relationship must reference known entities, no self-edges
    val.relationships.forEach((rel, i) => {
      if (!entityIds.has(rel.source)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `relationships[${i}].source references unknown entity ${rel.source}`,
          path: ["relationships", i, "source"],
        });
      }
      if (!entityIds.has(rel.target)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `relationships[${i}].target references unknown entity ${rel.target}`,
          path: ["relationships", i, "target"],
        });
      }
      if (rel.source === rel.target) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `relationships[${i}] is a self-edge`,
          path: ["relationships", i],
        });
      }
    });

    // every entity must have a relationToMain entry
    const relMainIds = new Set(val.relationToMain.map((r) => r.entityId));
    for (const id of entityIds) {
      if (!relMainIds.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `entity ${id} has no relationToMain entry`,
          path: ["relationToMain"],
        });
      }
    }
    // every relationToMain entry must reference a known entity
    val.relationToMain.forEach((rm, i) => {
      if (!entityIds.has(rm.entityId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `relationToMain[${i}] references unknown entity ${rm.entityId}`,
          path: ["relationToMain", i, "entityId"],
        });
      }
    });
  });
export type EntityExtractionResult = z.infer<typeof EntityExtractionResult>;
```

- [ ] **Step 2: Build the shared package**

Run:

```bash
pnpm --filter @sensai/shared build
```

Expected: no TypeScript errors; `packages/shared/dist/schemas.js` and `packages/shared/dist/schemas.d.ts` updated with the new exports.

- [ ] **Step 3: Typecheck API to confirm imports resolve**

Run:

```bash
pnpm --filter @sensai/api typecheck
```

Expected: no errors (the new exports aren't imported yet, but existing code still compiles).

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/schemas.ts packages/shared/dist
git commit -m "feat(shared): add EntityExtractionResult schemas for Plan 09"
```

---

## Task 2: Environment variables for entity-extract

**Files:**
- Modify: `apps/api/src/config/env.ts`
- Modify: `.env.example`

- [ ] **Step 1: Add schema entries to `apps/api/src/config/env.ts`**

Open `apps/api/src/config/env.ts`. Inside the `EnvSchema` z.object call, append these lines right after the existing `CONTENT_EXTRACT_MAX_INPUT_CHARS` entry (line 40), before `MAX_COST_PER_RUN_USD` (line 41):

```ts
  ENTITY_EXTRACT_MODEL: z.string().default("google/gemini-3-flash-preview"),
  ENTITY_EXTRACT_LANGUAGE: z.string().min(2).max(10).default("pl"),
  ENTITY_EXTRACT_MIN_ENTITIES: z.coerce.number().int().positive().default(10),
  ENTITY_EXTRACT_MIN_RELATIONS: z.coerce.number().int().positive().default(5),
  ENTITY_EXTRACT_MAX_INPUT_CHARS: z.coerce.number().int().positive().default(120_000),
```

> Rationale: schema floor in `EntityExtractionResult` is `min(8)` for entities and `min(3)` for relationships — env minimums are slightly higher so the prompt instructs the LLM to aim above the floor, leaving headroom before fail-closed Zod rejection.

- [ ] **Step 2: Mirror keys in `.env.example`**

Open `.env.example`. Append after the existing `CONTENT_EXTRACT_MAX_INPUT_CHARS=120000` line:

```
# Plan 09 — entity & relation extraction
ENTITY_EXTRACT_MODEL=google/gemini-3-flash-preview
ENTITY_EXTRACT_LANGUAGE=pl
ENTITY_EXTRACT_MIN_ENTITIES=10
ENTITY_EXTRACT_MIN_RELATIONS=5
ENTITY_EXTRACT_MAX_INPUT_CHARS=120000
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @sensai/api typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/config/env.ts .env.example
git commit -m "feat(api): add ENTITY_EXTRACT_* env vars"
```

---

## Task 3: Entity-extract prompt module

**Files:**
- Create: `apps/api/src/prompts/entity-extract.prompt.ts`
- Test: `apps/api/src/tests/entity-extract.prompt.test.ts`

- [ ] **Step 1: Write failing prompt tests**

Create `apps/api/src/tests/entity-extract.prompt.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { entityExtractPrompt } from "../prompts/entity-extract.prompt";

describe("entityExtractPrompt.system", () => {
  it("names the role and forbids out-of-source content", () => {
    expect(entityExtractPrompt.system).toMatch(/semantic data analyst/i);
    expect(entityExtractPrompt.system).toMatch(/ONLY entities explicitly mentioned/i);
    expect(entityExtractPrompt.system).toMatch(/DO NOT invent/i);
  });

  it("declares allowed entity and relation types", () => {
    for (const t of ["PERSON", "ORGANIZATION", "LOCATION", "PRODUCT", "CONCEPT", "EVENT"]) {
      expect(entityExtractPrompt.system).toContain(t);
    }
    for (const r of ["PART_OF", "LOCATED_IN", "CREATED_BY", "WORKS_FOR", "RELATED_TO", "HAS_FEATURE", "SOLVES", "COMPETES_WITH", "CONNECTED_TO", "USED_BY", "REQUIRES"]) {
      expect(entityExtractPrompt.system).toContain(r);
    }
  });

  it("specifies the E<n> id format and graph-integrity rules", () => {
    expect(entityExtractPrompt.system).toMatch(/E1, E2/);
    expect(entityExtractPrompt.system).toMatch(/relationships.*entity ids/i);
    expect(entityExtractPrompt.system).toMatch(/relationToMain.*every entity/i);
  });
});

describe("entityExtractPrompt.user", () => {
  const basePages = [
    { url: "https://a.example.com/a", markdown: "Para 1\n\nPara 2 about CD Projekt" },
    { url: "https://b.example.com/b", markdown: "Another source about Wiedźmin" },
  ];

  it("includes keyword, language, minimums and separator markers", () => {
    const out = entityExtractPrompt.user({
      keyword: "CD Projekt",
      language: "pl",
      cleanedPages: basePages,
      deepResearch: undefined,
      minEntities: 10,
      minRelations: 5,
    });

    expect(out).toMatch(/Central keyword:\s*CD Projekt/);
    expect(out).toMatch(/Output language:\s*pl/);
    expect(out).toMatch(/at minimum 10 entities/i);
    expect(out).toMatch(/at minimum 5 relationships/i);
    expect(out).toContain("---");
    expect(out).toContain("https://a.example.com/a");
    expect(out).toContain("https://b.example.com/b");
    expect(out).toContain("Para 2 about CD Projekt");
  });

  it("includes deep research block when provided, before source pages", () => {
    const out = entityExtractPrompt.user({
      keyword: "CD Projekt",
      language: "pl",
      cleanedPages: basePages,
      deepResearch: {
        content: "DEEP_RESEARCH_BODY",
        sources: [{ url: "https://research.example.com/x", title: "Src", snippets: [] }],
      },
      minEntities: 10,
      minRelations: 5,
    });

    const drIdx = out.indexOf("DEEP_RESEARCH_BODY");
    const pageIdx = out.indexOf("https://a.example.com/a");
    expect(drIdx).toBeGreaterThan(-1);
    expect(pageIdx).toBeGreaterThan(-1);
    expect(drIdx).toBeLessThan(pageIdx);
    expect(out).toContain("https://research.example.com/x");
  });

  it("omits deep research block cleanly when not provided", () => {
    const out = entityExtractPrompt.user({
      keyword: "CD Projekt",
      language: "pl",
      cleanedPages: basePages,
      deepResearch: undefined,
      minEntities: 10,
      minRelations: 5,
    });
    expect(out).not.toMatch(/DEEP RESEARCH BRIEFING/i);
  });

  it("produces empty pages block when cleanedPages is empty but deep research is present", () => {
    const out = entityExtractPrompt.user({
      keyword: "CD Projekt",
      language: "pl",
      cleanedPages: [],
      deepResearch: { content: "DR", sources: [] },
      minEntities: 10,
      minRelations: 5,
    });
    expect(out).toContain("DR");
    expect(out).toMatch(/no source pages/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @sensai/api exec vitest run src/tests/entity-extract.prompt.test.ts
```

Expected: FAIL — "Cannot find module '../prompts/entity-extract.prompt'".

- [ ] **Step 3: Create `apps/api/src/prompts/entity-extract.prompt.ts`**

```ts
import type { ResearchBriefing } from "@sensai/shared";

export interface EntityExtractPromptArgs {
  keyword: string;
  language: string;
  cleanedPages: Array<{ url: string; markdown: string }>;
  deepResearch: ResearchBriefing | undefined;
  minEntities: number;
  minRelations: number;
}

const SYSTEM = `You are a semantic data analyst performing text-grounded information extraction.
Convert the provided source texts into a structured set of entities, relationships and per-entity relevance scores against the user's central keyword.

ALLOWED ENTITY TYPES (domainType):
PERSON, ORGANIZATION, LOCATION, PRODUCT, CONCEPT, EVENT

ALLOWED RELATION TYPES (type):
PART_OF, LOCATED_IN, CREATED_BY, WORKS_FOR, RELATED_TO, HAS_FEATURE, SOLVES, COMPETES_WITH, CONNECTED_TO, USED_BY, REQUIRES

HARD RULES:
- Extract ONLY entities explicitly mentioned in the provided texts. DO NOT invent or infer entities from world knowledge — text-grounding is non-negotiable.
- Extract relationships ONLY when clearly stated or strongly implied by the text. If unsure, drop the relationship.
- Entity ids follow the pattern E1, E2, E3, ... contiguous starting from 1, unique within the response.
- Relationships use entity ids in source/target — never raw entity names. Both ids MUST exist in the entities array. No self-edges (source !== target).
- relationToMain MUST contain exactly one entry per emitted entity id. score is an integer 1–100 reflecting relevance to the central keyword (100 = the keyword itself or its tightest synonym; 50 = clearly related background; 1 = tangential mention).
- evidence is a short verbatim or near-verbatim quote fragment from the source text (max ~20 words). It anchors the claim.
- domainType: if no allowed type fits, use CONCEPT. Never use OTHER, MISC, or any value outside the enum.
- entity field: shortest clear surface form (e.g. "CD Projekt" not "polska firma deweloperska CD Projekt SA z siedzibą w Warszawie"). Preserve original casing. originalSurface keeps the exact substring as it appears in the text.
- Output descriptive fields (description, rationale, evidence, contextAnalysis.*) MUST be in the requested output language. Keep entity proper names in their original spelling.
- contextAnalysis.mainTopicInterpretation explains how the central keyword was understood; domainSummary describes the topical domain in one or two sentences.
- Output exactly one JSON object matching the requested schema. No markdown, no commentary, no code fences. The metadata field at the top will be populated by the calling system — leave it as a placeholder object with empty strings and 0; the system overwrites it.`;

function renderSourcesBlock(pages: EntityExtractPromptArgs["cleanedPages"]): string {
  if (pages.length === 0) return "(no source pages provided)";
  return pages
    .map((p, i) => `### SOURCE ${i + 1} — ${p.url}\n${p.markdown}`)
    .join("\n\n---\n\n");
}

function renderDeepResearchBlock(dr: ResearchBriefing | undefined): string | null {
  if (!dr) return null;
  const sourceList = dr.sources
    .map((s) => `- ${s.url}${s.title ? ` — ${s.title}` : ""}`)
    .join("\n");
  const body = [
    "### DEEP RESEARCH BRIEFING",
    dr.content,
    sourceList ? `\nSources cited:\n${sourceList}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return body;
}

export const entityExtractPrompt = {
  system: SYSTEM,
  user(args: EntityExtractPromptArgs): string {
    const header = [
      `Central keyword: ${args.keyword}`,
      `Output language: ${args.language}`,
      `Emit at minimum ${args.minEntities} entities and at minimum ${args.minRelations} relationships.`,
      "Source blocks follow, separated by `---`. Deep research briefing (if present) comes first.",
    ].join("\n");

    const deepBlock = renderDeepResearchBlock(args.deepResearch);
    const sourcesBlock = renderSourcesBlock(args.cleanedPages);

    const blocks = [deepBlock, sourcesBlock].filter(
      (b): b is string => b !== null,
    );
    return `${header}\n\n---\n\n${blocks.join("\n\n---\n\n")}`;
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @sensai/api exec vitest run src/tests/entity-extract.prompt.test.ts
```

Expected: PASS — 7/7 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/prompts/entity-extract.prompt.ts apps/api/src/tests/entity-extract.prompt.test.ts
git commit -m "feat(api): add entity-extract prompt module"
```

---

## Task 4: EntityExtractorClient (LLM wrapper)

**Files:**
- Create: `apps/api/src/tools/entity-extractor/entity-extractor.client.ts`
- Create: `apps/api/src/tools/entity-extractor/entity-extractor.types.ts`
- Create: `apps/api/src/tools/entity-extractor/entity-extractor.module.ts`
- Test: `apps/api/src/tests/entity-extractor.client.test.ts`

- [ ] **Step 1: Create helper types file**

Create `apps/api/src/tools/entity-extractor/entity-extractor.types.ts`:

```ts
import type { LlmCallContext } from "../../llm/llm.client";

export type EntityExtractCallContext = Omit<LlmCallContext, "model">;
```

- [ ] **Step 2: Write failing client tests**

Create `apps/api/src/tests/entity-extractor.client.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EntityExtractorClient } from "../tools/entity-extractor/entity-extractor.client";
import { EntityExtractionResult } from "@sensai/shared";

const env = {
  ENTITY_EXTRACT_MODEL: "google/gemini-3-flash-preview",
  ENTITY_EXTRACT_MAX_INPUT_CHARS: 120_000,
} as const;

function makeSampleExtraction() {
  const entities = Array.from({ length: 8 }, (_, i) => ({
    id: `E${i + 1}`,
    originalSurface: `Surface ${i + 1}`,
    entity: `Entity ${i + 1}`,
    domainType: "CONCEPT" as const,
    evidence: `evidence ${i + 1}`,
  }));
  const relationships = Array.from({ length: 3 }, (_, i) => ({
    source: `E${i + 1}`,
    target: `E${i + 2}`,
    type: "RELATED_TO" as const,
    description: `desc ${i + 1}`,
    evidence: `ev ${i + 1}`,
  }));
  const relationToMain = entities.map((e, i) => ({
    entityId: e.id,
    score: 50 + i,
    rationale: `rationale ${i + 1}`,
  }));

  return EntityExtractionResult.parse({
    metadata: {
      keyword: "CD Projekt",
      language: "pl",
      sourceUrlCount: 2,
      createdAt: "2026-04-27T00:00:00.000Z",
    },
    contextAnalysis: {
      mainTopicInterpretation: "main topic",
      domainSummary: "domain summary",
      notes: "",
    },
    entities,
    relationships,
    relationToMain,
  });
}

describe("EntityExtractorClient", () => {
  let llm: { generateObject: ReturnType<typeof vi.fn> };
  let client: EntityExtractorClient;

  beforeEach(() => {
    llm = { generateObject: vi.fn() };
    client = new EntityExtractorClient(llm as any, env as any);
  });

  it("passes model from env and forwards system/prompt/schema", async () => {
    const sample = makeSampleExtraction();
    llm.generateObject.mockResolvedValueOnce({
      object: sample,
      model: env.ENTITY_EXTRACT_MODEL,
      promptTokens: 1500,
      completionTokens: 1200,
      costUsd: "0.003500",
      latencyMs: 1800,
    });

    const out = await client.extract({
      ctx: { runId: "r1", stepId: "s1", attempt: 1 },
      system: "SYSTEM",
      prompt: "USER_PROMPT",
    });

    expect(llm.generateObject).toHaveBeenCalledTimes(1);
    const call = llm.generateObject.mock.calls[0][0];
    expect(call.ctx.model).toBe("google/gemini-3-flash-preview");
    expect(call.ctx.runId).toBe("r1");
    expect(call.ctx.stepId).toBe("s1");
    expect(call.ctx.attempt).toBe(1);
    expect(call.system).toBe("SYSTEM");
    expect(call.prompt).toBe("USER_PROMPT");
    expect(call.schema).toBe(EntityExtractionResult);

    expect(out.result).toBe(sample);
    expect(out.costUsd).toBe("0.003500");
    expect(out.model).toBe("google/gemini-3-flash-preview");
    expect(out.promptTokens).toBe(1500);
    expect(out.completionTokens).toBe(1200);
    expect(out.latencyMs).toBe(1800);
  });

  it("throws when prompt exceeds ENTITY_EXTRACT_MAX_INPUT_CHARS", async () => {
    const huge = "x".repeat(env.ENTITY_EXTRACT_MAX_INPUT_CHARS + 1);
    await expect(
      client.extract({
        ctx: { runId: "r1", stepId: "s1", attempt: 1 },
        system: "SYSTEM",
        prompt: huge,
      }),
    ).rejects.toThrow(/exceeds.*ENTITY_EXTRACT_MAX_INPUT_CHARS/);
    expect(llm.generateObject).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm --filter @sensai/api exec vitest run src/tests/entity-extractor.client.test.ts
```

Expected: FAIL — module resolution error.

- [ ] **Step 4: Create the client**

Create `apps/api/src/tools/entity-extractor/entity-extractor.client.ts`:

```ts
import { Inject, Injectable, Logger } from "@nestjs/common";
import { LlmClient } from "../../llm/llm.client";
import type { Env } from "../../config/env";
import { EntityExtractionResult } from "@sensai/shared";
import type { EntityExtractCallContext } from "./entity-extractor.types";

type ClientEnv = Pick<Env, "ENTITY_EXTRACT_MODEL" | "ENTITY_EXTRACT_MAX_INPUT_CHARS">;

export interface EntityExtractCallResult {
  result: EntityExtractionResult;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: string;
  latencyMs: number;
}

@Injectable()
export class EntityExtractorClient {
  private readonly logger = new Logger(EntityExtractorClient.name);

  constructor(
    private readonly llm: LlmClient,
    @Inject("ENTITY_EXTRACT_ENV") private readonly env: ClientEnv,
  ) {}

  async extract(args: {
    ctx: EntityExtractCallContext;
    system: string;
    prompt: string;
  }): Promise<EntityExtractCallResult> {
    if (args.prompt.length > this.env.ENTITY_EXTRACT_MAX_INPUT_CHARS) {
      throw new Error(
        `entity.extract prompt exceeds ENTITY_EXTRACT_MAX_INPUT_CHARS ` +
          `(got ${args.prompt.length}, limit ${this.env.ENTITY_EXTRACT_MAX_INPUT_CHARS})`,
      );
    }

    const res = await this.llm.generateObject({
      ctx: { ...args.ctx, model: this.env.ENTITY_EXTRACT_MODEL },
      system: args.system,
      prompt: args.prompt,
      schema: EntityExtractionResult,
    });

    this.logger.log(
      {
        model: res.model,
        promptTokens: res.promptTokens,
        completionTokens: res.completionTokens,
        costUsd: res.costUsd,
        latencyMs: res.latencyMs,
        entitiesOut: res.object.entities.length,
        relationshipsOut: res.object.relationships.length,
        relationToMainOut: res.object.relationToMain.length,
      },
      "entity-extract LLM call",
    );

    return {
      result: res.object,
      model: res.model,
      promptTokens: res.promptTokens,
      completionTokens: res.completionTokens,
      costUsd: res.costUsd,
      latencyMs: res.latencyMs,
    };
  }
}
```

- [ ] **Step 5: Create the module**

Create `apps/api/src/tools/entity-extractor/entity-extractor.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { EntityExtractorClient } from "./entity-extractor.client";
import { LlmModule } from "../../llm/llm.module";
import { loadEnv } from "../../config/env";

@Module({
  imports: [LlmModule],
  providers: [
    EntityExtractorClient,
    {
      provide: "ENTITY_EXTRACT_ENV",
      useFactory: () => loadEnv(),
    },
  ],
  exports: [EntityExtractorClient],
})
export class EntityExtractorModule {}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
pnpm --filter @sensai/api exec vitest run src/tests/entity-extractor.client.test.ts
```

Expected: PASS — 2/2 tests.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/tools/entity-extractor/ apps/api/src/tests/entity-extractor.client.test.ts
git commit -m "feat(api): add EntityExtractorClient wrapping generateObject"
```

---

## Task 5: EntityExtractHandler (orchestration)

**Files:**
- Create: `apps/api/src/handlers/entity-extract.handler.ts`
- Test: `apps/api/src/tests/entity-extract.handler.test.ts`

- [ ] **Step 1: Write failing handler tests**

Create `apps/api/src/tests/entity-extract.handler.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EntityExtractHandler } from "../handlers/entity-extract.handler";
import type { StepContext } from "../orchestrator/step-handler";

const env = {
  ENTITY_EXTRACT_MODEL: "google/gemini-3-flash-preview",
  ENTITY_EXTRACT_LANGUAGE: "pl",
  ENTITY_EXTRACT_MIN_ENTITIES: 10,
  ENTITY_EXTRACT_MIN_RELATIONS: 5,
} as any;

function makeCleanedPage(url: string, markdown: string) {
  return {
    url,
    title: `Title ${url}`,
    fetchedAt: "2026-04-27T00:00:00.000Z",
    markdown,
    paragraphs: markdown.split(/\n\n+/),
    originalChars: markdown.length * 2,
    cleanedChars: markdown.length,
    removedParagraphs: 1,
  };
}

function makeCleanedResult(
  pages = [makeCleanedPage("https://a.example.com/a", "Para A about CD Projekt.")],
) {
  return {
    pages,
    droppedPages: [],
    stats: {
      inputPages: pages.length + 1,
      keptPages: pages.length,
      inputChars: 2000,
      outputChars: 1000,
      reductionPct: 50,
      blacklistedRemoved: 2,
      keywordFilteredRemoved: 1,
      crossPageDupesRemoved: 0,
    },
  };
}

function makeExtraction() {
  const entities = Array.from({ length: 8 }, (_, i) => ({
    id: `E${i + 1}`,
    originalSurface: `Surface ${i + 1}`,
    entity: `Entity ${i + 1}`,
    domainType: "CONCEPT" as const,
    evidence: `ev ${i + 1}`,
  }));
  return {
    metadata: {
      keyword: "CD Projekt",
      language: "pl",
      sourceUrlCount: 1,
      createdAt: "2026-04-27T00:00:00.000Z",
    },
    contextAnalysis: {
      mainTopicInterpretation: "interpretation",
      domainSummary: "summary",
      notes: "",
    },
    entities,
    relationships: Array.from({ length: 3 }, (_, i) => ({
      source: `E${i + 1}`,
      target: `E${i + 2}`,
      type: "RELATED_TO" as const,
      description: `desc ${i + 1}`,
      evidence: `ev ${i + 1}`,
    })),
    relationToMain: entities.map((e) => ({
      entityId: e.id,
      score: 50,
      rationale: "r",
    })),
  };
}

function makeCtx(overrides: Partial<StepContext> = {}): StepContext {
  return {
    run: {
      id: "run-1",
      input: { topic: "CD Projekt", mainKeyword: "CD Projekt SA", intent: "informational" },
    } as any,
    step: { id: "step-1" } as any,
    project: {
      id: "proj-1",
      name: "Demo",
      config: { toneOfVoice: "", targetAudience: "", guidelines: "", defaultModels: {}, promptOverrides: {} },
    } as any,
    previousOutputs: {},
    attempt: 1,
    ...overrides,
  };
}

describe("EntityExtractHandler", () => {
  let client: { extract: ReturnType<typeof vi.fn> };
  let cache: { getOrSet: ReturnType<typeof vi.fn> };
  let handler: EntityExtractHandler;

  beforeEach(() => {
    client = { extract: vi.fn() };
    cache = { getOrSet: vi.fn() };
    handler = new EntityExtractHandler(client as any, cache as any, env);
  });

  it("reports type 'tool.entity.extract'", () => {
    expect(handler.type).toBe("tool.entity.extract");
  });

  it("throws when previousOutputs.clean is missing", async () => {
    await expect(handler.execute(makeCtx())).rejects.toThrow(/requires previousOutputs\.clean/);
    expect(cache.getOrSet).not.toHaveBeenCalled();
  });

  it("throws when clean shape is invalid", async () => {
    const ctx = makeCtx({ previousOutputs: { clean: { pages: "nope" } } });
    await expect(handler.execute(ctx)).rejects.toThrow();
  });

  it("throws when clean has 0 pages AND deepResearch is absent", async () => {
    const clean = { ...makeCleanedResult(), pages: [] };
    const ctx = makeCtx({ previousOutputs: { clean } });
    await expect(handler.execute(ctx)).rejects.toThrow(/no input content/i);
  });

  it("proceeds when clean has 0 pages BUT deepResearch is present", async () => {
    const clean = { ...makeCleanedResult(), pages: [] };
    const deepResearch = {
      content: "deep body",
      sources: [{ url: "https://d.example.com/d", snippets: [] }],
    };
    cache.getOrSet.mockImplementationOnce(async (opts: any) => (await opts.fetcher()).result);
    client.extract.mockResolvedValueOnce({
      result: makeExtraction(),
      model: env.ENTITY_EXTRACT_MODEL,
      promptTokens: 100,
      completionTokens: 100,
      costUsd: "0.000500",
      latencyMs: 1000,
    });

    const ctx = makeCtx({ previousOutputs: { clean, deepResearch } });
    const out = await handler.execute(ctx);
    expect((out.output as any).entities).toHaveLength(8);
    expect(client.extract).toHaveBeenCalledTimes(1);
  });

  it("happy path: cache miss → one extract call → EntityExtractionResult", async () => {
    const clean = makeCleanedResult();
    const deepResearch = { content: "deep body", sources: [] };

    cache.getOrSet.mockImplementationOnce(async (opts: any) => (await opts.fetcher()).result);
    client.extract.mockResolvedValueOnce({
      result: makeExtraction(),
      model: env.ENTITY_EXTRACT_MODEL,
      promptTokens: 800,
      completionTokens: 600,
      costUsd: "0.002000",
      latencyMs: 2000,
    });

    const ctx = makeCtx({ previousOutputs: { clean, deepResearch } });
    const out = await handler.execute(ctx);
    const result = out.output as any;

    expect(result.entities).toHaveLength(8);
    expect(result.relationships).toHaveLength(3);
    expect(result.relationToMain).toHaveLength(8);
    expect(result.metadata.keyword).toBe("CD Projekt (CD Projekt SA) — informational");
    expect(result.metadata.language).toBe("pl");
    expect(result.metadata.sourceUrlCount).toBe(1);
    expect(client.extract).toHaveBeenCalledTimes(1);
  });

  it("composes keyword: topic only when mainKeyword/intent absent", async () => {
    const clean = makeCleanedResult();
    cache.getOrSet.mockImplementationOnce(async (opts: any) => {
      expect(opts.params.keyword).toBe("CD Projekt");
      return makeExtraction();
    });

    const ctx = makeCtx({
      run: { id: "run-1", input: { topic: "CD Projekt" } } as any,
      previousOutputs: { clean },
    });
    await handler.execute(ctx);
  });

  it("builds cache params deterministically (pages + deepResearchPresent + keyword + language + model)", async () => {
    const clean = makeCleanedResult();
    const deepResearch = { content: "deep body", sources: [] };
    cache.getOrSet.mockResolvedValueOnce(makeExtraction());

    await handler.execute(makeCtx({ previousOutputs: { clean, deepResearch } }));

    const call = cache.getOrSet.mock.calls[0][0];
    expect(call.tool).toBe("entity");
    expect(call.method).toBe("extract");
    expect(call.ttlSeconds).toBe(7 * 24 * 3600);
    expect(call.runId).toBe("run-1");
    expect(call.stepId).toBe("step-1");
    expect(call.params.keyword).toContain("CD Projekt");
    expect(call.params.language).toBe("pl");
    expect(call.params.model).toBe("google/gemini-3-flash-preview");
    expect(call.params.deepResearchPresent).toBe(true);
    expect(call.params.pages).toEqual([
      { url: "https://a.example.com/a", md: "Para A about CD Projekt." },
    ]);
  });

  it("forwards forceRefresh to cache when ctx.forceRefresh is set", async () => {
    const clean = makeCleanedResult();
    cache.getOrSet.mockResolvedValueOnce(makeExtraction());

    await handler.execute(
      makeCtx({ previousOutputs: { clean }, forceRefresh: true }),
    );

    const call = cache.getOrSet.mock.calls[0][0];
    expect(call.forceRefresh).toBe(true);
  });

  it("cache hit: skips extract call and returns cached value", async () => {
    const cached = makeExtraction();
    cache.getOrSet.mockResolvedValueOnce(cached);

    const clean = makeCleanedResult();
    const out = await handler.execute(makeCtx({ previousOutputs: { clean } }));

    expect(out.output).toBe(cached);
    expect(client.extract).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @sensai/api exec vitest run src/tests/entity-extract.handler.test.ts
```

Expected: FAIL — module resolution error.

- [ ] **Step 3: Create the handler**

Create `apps/api/src/handlers/entity-extract.handler.ts`:

```ts
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { StepContext, StepHandler, StepResult } from "../orchestrator/step-handler";
import { EntityExtractorClient } from "../tools/entity-extractor/entity-extractor.client";
import { ToolCacheService } from "../tools/tool-cache.service";
import {
  CleanedScrapeResult,
  ResearchBriefing,
  type EntityExtractionResult,
  type RunInput,
} from "@sensai/shared";
import type { Env } from "../config/env";
import { entityExtractPrompt } from "../prompts/entity-extract.prompt";

const TTL_DAYS = 7;

type HandlerEnv = Pick<
  Env,
  | "ENTITY_EXTRACT_MODEL"
  | "ENTITY_EXTRACT_LANGUAGE"
  | "ENTITY_EXTRACT_MIN_ENTITIES"
  | "ENTITY_EXTRACT_MIN_RELATIONS"
>;

@Injectable()
export class EntityExtractHandler implements StepHandler {
  readonly type = "tool.entity.extract";
  private readonly logger = new Logger(EntityExtractHandler.name);

  constructor(
    private readonly client: EntityExtractorClient,
    private readonly cache: ToolCacheService,
    @Inject("ENTITY_EXTRACT_ENV") private readonly env: HandlerEnv,
  ) {}

  async execute(ctx: StepContext): Promise<StepResult> {
    const prevClean = ctx.previousOutputs.clean;
    if (prevClean === undefined || prevClean === null) {
      throw new Error("entity.extract requires previousOutputs.clean");
    }
    const clean = CleanedScrapeResult.parse(prevClean);

    let deepResearch: ReturnType<typeof ResearchBriefing.parse> | undefined;
    const prevDeep = ctx.previousOutputs.deepResearch;
    if (prevDeep !== undefined && prevDeep !== null) {
      deepResearch = ResearchBriefing.parse(prevDeep);
    }

    if (clean.pages.length === 0 && !deepResearch) {
      throw new Error(
        "entity.extract: no input content (clean.pages empty and no deepResearch)",
      );
    }

    const keyword = this.composeKeyword(ctx.run.input as RunInput);
    const language = this.env.ENTITY_EXTRACT_LANGUAGE;
    const model = this.env.ENTITY_EXTRACT_MODEL;

    const result = await this.cache.getOrSet<EntityExtractionResult>({
      tool: "entity",
      method: "extract",
      params: {
        pages: clean.pages.map((p) => ({ url: p.url, md: p.markdown })),
        deepResearchPresent: deepResearch !== undefined,
        keyword,
        language,
        model,
      },
      ttlSeconds: TTL_DAYS * 24 * 3600,
      runId: ctx.run.id,
      stepId: ctx.step.id,
      forceRefresh: ctx.forceRefresh,
      fetcher: async () => {
        const t0 = Date.now();
        const systemPrompt = entityExtractPrompt.system;
        const userPrompt = entityExtractPrompt.user({
          keyword,
          language,
          cleanedPages: clean.pages.map((p) => ({ url: p.url, markdown: p.markdown })),
          deepResearch,
          minEntities: this.env.ENTITY_EXTRACT_MIN_ENTITIES,
          minRelations: this.env.ENTITY_EXTRACT_MIN_RELATIONS,
        });

        const call = await this.client.extract({
          ctx: { runId: ctx.run.id, stepId: ctx.step.id, attempt: ctx.attempt },
          system: systemPrompt,
          prompt: userPrompt,
        });
        const latencyMs = Date.now() - t0;

        const enriched: EntityExtractionResult = {
          ...call.result,
          metadata: {
            ...call.result.metadata,
            keyword,
            language,
            sourceUrlCount: clean.pages.length,
            createdAt: new Date().toISOString(),
          },
        };

        this.logger.log(
          {
            entities: enriched.entities.length,
            relationships: enriched.relationships.length,
            relationToMain: enriched.relationToMain.length,
            costUsd: call.costUsd,
            latencyMs,
          },
          "entity-extract done",
        );

        return { result: enriched, costUsd: call.costUsd, latencyMs };
      },
    });

    return { output: result };
  }

  private composeKeyword(input: RunInput): string {
    let kw = input.topic;
    if (input.mainKeyword) kw += ` (${input.mainKeyword})`;
    if (input.intent) kw += ` — ${input.intent}`;
    return kw;
  }
}
```

> Note: metadata fields emitted by the LLM (`keyword`, `language`, `sourceUrlCount`, `createdAt`) are authoritatively **overwritten** by the handler — the LLM's copy is ignored. This keeps metadata trustworthy regardless of what the model returns.

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @sensai/api exec vitest run src/tests/entity-extract.handler.test.ts
```

Expected: PASS — 10/10 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/handlers/entity-extract.handler.ts apps/api/src/tests/entity-extract.handler.test.ts
git commit -m "feat(api): add EntityExtractHandler for tool.entity.extract"
```

---

## Task 6: Wire the module into the NestJS app

**Files:**
- Modify: `apps/api/src/tools/tools.module.ts`
- Modify: `apps/api/src/handlers/handlers.module.ts`

- [ ] **Step 1: Register EntityExtractorModule in ToolsModule**

Edit `apps/api/src/tools/tools.module.ts`. Replace the whole file with:

```ts
import { Module } from "@nestjs/common";
import { DbModule } from "../db/db.module";
import { ToolCallRecorder } from "./tool-call-recorder.service";
import { ToolCacheService } from "./tool-cache.service";
import { DataForSeoModule } from "./dataforseo/dataforseo.module";
import { FirecrawlModule } from "./firecrawl/firecrawl.module";
import { Crawl4aiModule } from "./crawl4ai/crawl4ai.module";
import { YoucomModule } from "./youcom/youcom.module";
import { ContentCleanerModule } from "./content-cleaner/content-cleaner.module";
import { ContentExtractorModule } from "./content-extractor/content-extractor.module";
import { EntityExtractorModule } from "./entity-extractor/entity-extractor.module";

@Module({
  imports: [
    DbModule,
    DataForSeoModule,
    FirecrawlModule,
    Crawl4aiModule,
    YoucomModule,
    ContentCleanerModule,
    ContentExtractorModule,
    EntityExtractorModule,
  ],
  providers: [ToolCallRecorder, ToolCacheService],
  exports: [
    ToolCacheService,
    ToolCallRecorder,
    DataForSeoModule,
    FirecrawlModule,
    Crawl4aiModule,
    YoucomModule,
    ContentCleanerModule,
    ContentExtractorModule,
    EntityExtractorModule,
  ],
})
export class ToolsModule {}
```

- [ ] **Step 2: Register EntityExtractHandler + ENTITY_EXTRACT_ENV in HandlersModule**

Edit `apps/api/src/handlers/handlers.module.ts`. Replace the whole file with:

```ts
import { Module } from "@nestjs/common";
import { BriefHandler } from "./brief.handler";
import { SerpFetchHandler } from "./serp-fetch.handler";
import { ScrapeFetchHandler } from "./scrape-fetch.handler";
import { YoucomResearchHandler } from "./youcom-research.handler";
import { ContentCleanHandler } from "./content-clean.handler";
import { ContentExtractHandler } from "./content-extract.handler";
import { EntityExtractHandler } from "./entity-extract.handler";
import { ToolsModule } from "../tools/tools.module";
import { STEP_HANDLERS, type StepHandler } from "../orchestrator/step-handler";
import { loadEnv } from "../config/env";

@Module({
  imports: [ToolsModule],
  providers: [
    BriefHandler,
    SerpFetchHandler,
    ScrapeFetchHandler,
    YoucomResearchHandler,
    ContentCleanHandler,
    ContentExtractHandler,
    EntityExtractHandler,
    {
      provide: "YOUCOM_ENV",
      useFactory: () => loadEnv(),
    },
    {
      provide: "CLEANING_ENV",
      useFactory: () => loadEnv(),
    },
    {
      provide: "EXTRACT_ENV",
      useFactory: () => loadEnv(),
    },
    {
      provide: "ENTITY_EXTRACT_ENV",
      useFactory: () => loadEnv(),
    },
    {
      provide: STEP_HANDLERS,
      useFactory: (
        brief: BriefHandler,
        serp: SerpFetchHandler,
        scrape: ScrapeFetchHandler,
        youcom: YoucomResearchHandler,
        clean: ContentCleanHandler,
        extract: ContentExtractHandler,
        entities: EntityExtractHandler,
      ): StepHandler[] => [brief, serp, scrape, youcom, clean, extract, entities],
      inject: [
        BriefHandler,
        SerpFetchHandler,
        ScrapeFetchHandler,
        YoucomResearchHandler,
        ContentCleanHandler,
        ContentExtractHandler,
        EntityExtractHandler,
      ],
    },
  ],
  exports: [STEP_HANDLERS],
})
export class HandlersModule {}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @sensai/api typecheck
```

Expected: no errors.

- [ ] **Step 4: Run full test suite to confirm nothing regressed**

```bash
pnpm --filter @sensai/api test
```

Expected: all previously passing tests + the three new entity suites pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/tools/tools.module.ts apps/api/src/handlers/handlers.module.ts
git commit -m "feat(api): register EntityExtractHandler and EntityExtractorModule"
```

---

## Task 7: Seed template "Blog SEO — deep research + clean + extract + entities"

**Files:**
- Modify: `apps/api/src/seed/seed.ts`

- [ ] **Step 1: Add the template upsert**

Edit `apps/api/src/seed/seed.ts`. Immediately after the `blogSeoExtract` block (around line 91, before the `console.log("Seeded:")` block), insert:

```ts
  const blogSeoEntities = await upsertTemplate(
    db,
    "Blog SEO — deep research + clean + extract + entities",
    1,
    {
      steps: [
        { key: "deepResearch", type: "tool.youcom.research", auto: true,  dependsOn: [] },
        { key: "research",     type: "tool.serp.fetch",     auto: true,  dependsOn: [] },
        { key: "scrape",       type: "tool.scrape",         auto: false, dependsOn: ["research"] },
        { key: "clean",        type: "tool.content.clean",  auto: true,  dependsOn: ["scrape"] },
        { key: "extract",      type: "tool.content.extract", auto: true, dependsOn: ["clean", "deepResearch"] },
        { key: "entities",     type: "tool.entity.extract", auto: true,  dependsOn: ["clean", "deepResearch"] },
        { key: "brief",        type: "llm.brief",           auto: true,  dependsOn: ["extract"] },
      ],
    },
  );
```

> Rationale: `entities` and `extract` both depend on `["clean", "deepResearch"]` so they run in parallel. `brief` keeps depending only on `extract` — entity-aware brief generation is out of scope for this plan.

Then add a corresponding `console.log` inside the templates block, after the existing `blogSeoExtract` line:

```ts
  console.log(`    "${blogSeoEntities.name}" v${blogSeoEntities.version}: ${blogSeoEntities.id}`);
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @sensai/api typecheck
```

Expected: no errors.

- [ ] **Step 3: Run seed against local DB to verify it upserts cleanly**

> Requires `DATABASE_URL` in `apps/api/.env` (existing — same one that runs migrations).

Run from repo root:

```bash
pnpm --filter @sensai/api exec tsx src/seed/seed.ts
```

Expected output (last block):

```
Seeded:
  projectId: <uuid>
  templates:
    "Brief only (MVP)" v1: <uuid>
    "Brief + research" v1: <uuid>
    "Brief + research + scrape" v1: <uuid>
    "Blog SEO — deep research" v1: <uuid>
    "Blog SEO — deep research + clean" v1: <uuid>
    "Blog SEO — deep research + clean + extract" v1: <uuid>
    "Blog SEO — deep research + clean + extract + entities" v1: <uuid>
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/seed/seed.ts
git commit -m "feat(seed): add 'Blog SEO — deep research + clean + extract + entities' template"
```

---

## Task 8: Web UI — EntitiesOutput component

**Files:**
- Create: `apps/web/src/components/step-output/entities.tsx`
- Modify: `apps/web/src/components/step-output/index.tsx`

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/step-output/entities.tsx`:

```tsx
"use client";
import { useState } from "react";
import { EmptyOutput, Metric } from "./shared";

type EntityType = "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
type RelationType =
  | "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO"
  | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";

type Entity = {
  id: string;
  originalSurface: string;
  entity: string;
  domainType: EntityType;
  evidence: string;
};

type EntityRelation = {
  source: string;
  target: string;
  type: RelationType;
  description: string;
  evidence: string;
};

type RelationToMain = {
  entityId: string;
  score: number;
  rationale: string;
};

type ExtractionShape = {
  metadata: {
    keyword: string;
    language: string;
    sourceUrlCount: number;
    createdAt: string;
  };
  contextAnalysis: {
    mainTopicInterpretation: string;
    domainSummary: string;
    notes: string;
  };
  entities: Entity[];
  relationships: EntityRelation[];
  relationToMain: RelationToMain[];
};

function isExtraction(v: unknown): v is ExtractionShape {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    !!o.metadata &&
    !!o.contextAnalysis &&
    Array.isArray(o.entities) &&
    Array.isArray(o.relationships) &&
    Array.isArray(o.relationToMain)
  );
}

const ENTITY_TYPE_PL: Record<EntityType, string> = {
  PERSON: "osoba",
  ORGANIZATION: "organizacja",
  LOCATION: "lokalizacja",
  PRODUCT: "produkt",
  CONCEPT: "koncept",
  EVENT: "wydarzenie",
};

const ENTITY_TYPE_BADGE: Record<EntityType, string> = {
  PERSON: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  ORGANIZATION: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  LOCATION: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  PRODUCT: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  CONCEPT: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  EVENT: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
};

type Tab = "entities" | "relations" | "relevance";

export function EntitiesOutput({ value }: { value: unknown }) {
  const [tab, setTab] = useState<Tab>("entities");

  if (!isExtraction(value)) return <EmptyOutput />;
  const { metadata, contextAnalysis, entities, relationships, relationToMain } = value;

  const entityById = new Map(entities.map((e) => [e.id, e]));
  const orphanRelations = relationships.filter(
    (r) => !entityById.has(r.source) || !entityById.has(r.target),
  );
  const sortedRelevance = [...relationToMain].sort((a, b) => b.score - a.score);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Encje" value={entities.length} />
        <Metric label="Relacje" value={relationships.length} />
        <Metric label="Istotność" value={relationToMain.length} />
        <Metric label="Źródła" value={metadata.sourceUrlCount} />
      </div>

      <div className="rounded-lg border bg-muted/20 p-3 text-xs">
        <div className="font-medium">Kontekst</div>
        <p className="mt-1 text-muted-foreground">{contextAnalysis.mainTopicInterpretation}</p>
        <p className="mt-1 text-muted-foreground">{contextAnalysis.domainSummary}</p>
        {contextAnalysis.notes && (
          <p className="mt-1 italic text-muted-foreground">{contextAnalysis.notes}</p>
        )}
      </div>

      <div role="tablist" className="inline-flex rounded-md border bg-muted/30 p-0.5 text-xs">
        <TabBtn active={tab === "entities"} onClick={() => setTab("entities")}>
          Encje ({entities.length})
        </TabBtn>
        <TabBtn active={tab === "relations"} onClick={() => setTab("relations")}>
          Relacje ({relationships.length})
        </TabBtn>
        <TabBtn active={tab === "relevance"} onClick={() => setTab("relevance")}>
          Istotność ({relationToMain.length})
        </TabBtn>
      </div>

      {tab === "entities" && (
        <ul className="space-y-2">
          {entities.map((e) => (
            <li key={e.id} className="rounded-lg border bg-card p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono text-[10px] text-muted-foreground">{e.id}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] ${ENTITY_TYPE_BADGE[e.domainType]}`}>
                  {ENTITY_TYPE_PL[e.domainType]}
                </span>
                {e.originalSurface !== e.entity && (
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    surface: {e.originalSurface}
                  </span>
                )}
              </div>
              <div className="mt-2 text-sm font-medium">{e.entity}</div>
              <p className="mt-1 text-xs italic text-muted-foreground">„{e.evidence}"</p>
            </li>
          ))}
        </ul>
      )}

      {tab === "relations" && (
        <>
          {orphanRelations.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
              Uwaga: {orphanRelations.length} relacji odwołuje się do nieistniejących encji.
            </div>
          )}
          <ul className="space-y-2">
            {relationships.map((r, idx) => {
              const src = entityById.get(r.source);
              const tgt = entityById.get(r.target);
              return (
                <li key={idx} className="rounded-lg border bg-card p-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{src?.entity ?? r.source}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                      {r.type}
                    </span>
                    <span className="font-medium">{tgt?.entity ?? r.target}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>
                  <p className="mt-1 text-xs italic text-muted-foreground">„{r.evidence}"</p>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {tab === "relevance" && (
        <ul className="space-y-2">
          {sortedRelevance.map((r) => {
            const ent = entityById.get(r.entityId);
            return (
              <li key={r.entityId} className="rounded-lg border bg-card p-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-mono text-[10px] text-muted-foreground">{r.entityId}</span>
                  <span className="font-medium">{ent?.entity ?? r.entityId}</span>
                  <span className="ml-auto rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                    {r.score}/100
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{r.rationale}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        active
          ? "rounded-sm bg-background px-2.5 py-1 font-medium shadow-sm"
          : "rounded-sm px-2.5 py-1 text-muted-foreground hover:text-foreground"
      }
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Wire the component in the step-output dispatcher**

Edit `apps/web/src/components/step-output/index.tsx`. Replace the whole file with:

```tsx
import { CleanedOutput } from "./cleaned";
import { DeepResearchOutput } from "./deep-research";
import { EntitiesOutput } from "./entities";
import { ExtractionOutput } from "./extraction";
import { JsonFallback } from "./json-fallback";
import { ScrapeOutput } from "./scrape";
import { SerpOutput } from "./serp";

export function StepOutput({
  type,
  value,
  raw,
}: {
  type: string;
  value: unknown;
  raw: boolean;
}) {
  if (raw) return <JsonFallback value={value} />;
  if (value === null || value === undefined) return <JsonFallback value={value} />;

  switch (type) {
    case "tool.youcom.research":
      return <DeepResearchOutput value={value} />;
    case "tool.serp.fetch":
      return <SerpOutput value={value} />;
    case "tool.scrape":
      return <ScrapeOutput value={value} />;
    case "tool.content.clean":
      return <CleanedOutput value={value} />;
    case "tool.content.extract":
      return <ExtractionOutput value={value} />;
    case "tool.entity.extract":
      return <EntitiesOutput value={value} />;
    default:
      return <JsonFallback value={value} />;
  }
}

export function hasRichRenderer(type: string): boolean {
  return (
    type === "tool.youcom.research" ||
    type === "tool.serp.fetch" ||
    type === "tool.scrape" ||
    type === "tool.content.clean" ||
    type === "tool.content.extract" ||
    type === "tool.entity.extract"
  );
}
```

- [ ] **Step 3: Typecheck web**

```bash
pnpm --filter @sensai/web typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/step-output/entities.tsx apps/web/src/components/step-output/index.tsx
git commit -m "feat(web): add EntitiesOutput component for tool.entity.extract"
```

---

## Task 9: Smoke test `smoke-plan-09.ts`

**Files:**
- Create: `scripts/smoke-plan-09.ts`
- Modify: `package.json` (root)

> Reuses the existing `scripts/fixtures/scrape-result-kortyzol.json` by running it **through** the cleaning pipeline first, then feeding the result to the entity extractor. Mirrors the smoke-plan-07 pattern.

- [ ] **Step 1: Create the smoke script**

Create `scripts/smoke-plan-09.ts`:

```ts
#!/usr/bin/env tsx
/**
 * Plan 09 manual smoke test — entity & relation extraction.
 *
 * Runs: raw scrape fixture → ContentCleanHandler (real LLM embeddings)
 * → EntityExtractHandler (real LLM generateObject). Bypasses NestJS DI because
 * tsx/esbuild does not emit constructor parameter metadata.
 *
 * Verifies:
 *   - entities.length >= ENTITY_EXTRACT_MIN_ENTITIES
 *   - relationships.length >= ENTITY_EXTRACT_MIN_RELATIONS
 *   - relationToMain.length === entities.length
 *   - all entity ids follow E<n>; all relationships reference known ids
 *   - metadata.keyword and metadata.language are set by the handler (not the LLM)
 *   - score values are integers in [1, 100]
 *
 * Requires OPENAI_API_KEY (for cleaning embeddings) and OPENROUTER_API_KEY
 * (for extraction) in apps/api/.env.
 *
 * Run: pnpm smoke:plan-09
 */
import "reflect-metadata";
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnv } from "../apps/api/src/config/env";
import { LlmClient } from "../apps/api/src/llm/llm.client";
import { ContentCleanerClient } from "../apps/api/src/tools/content-cleaner/content-cleaner.client";
import { ContentCleanHandler } from "../apps/api/src/handlers/content-clean.handler";
import { EntityExtractorClient } from "../apps/api/src/tools/entity-extractor/entity-extractor.client";
import { EntityExtractHandler } from "../apps/api/src/handlers/entity-extract.handler";

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("[smoke] OPENAI_API_KEY missing in env");
    process.exit(1);
  }
  if (!process.env.OPENROUTER_API_KEY) {
    console.error("[smoke] OPENROUTER_API_KEY missing in env");
    process.exit(1);
  }

  const fixturePath = resolve(__dirname, "fixtures/scrape-result-kortyzol.json");
  const scrape = JSON.parse(readFileSync(fixturePath, "utf-8"));
  console.log(`[smoke] loaded fixture: ${scrape.pages.length} pages`);

  const env = loadEnv();
  const stubCostTracker = { record: async () => {} } as any;
  const stubCache = {
    getOrSet: async (opts: any) => {
      const fetched = await opts.fetcher();
      return fetched.result ?? fetched;
    },
  } as any;

  const llm = new LlmClient(stubCostTracker);

  // Phase 1: clean
  const cleanerClient = new ContentCleanerClient(llm, env);
  const cleanHandler = new ContentCleanHandler(cleanerClient, stubCache, env);

  const runId = `smoke-run-${Date.now()}`;
  const baseCtx = {
    run: {
      id: runId,
      input: {
        topic: "jak obniżyć kortyzol po 40",
        mainKeyword: "kortyzol",
        intent: "informational",
      },
    },
    project: { id: "smoke-project", config: {} },
    attempt: 1,
  } as any;

  console.log(`[smoke] running clean ...`);
  const cleanOut: any = await cleanHandler.execute({
    ...baseCtx,
    step: { id: `${runId}-clean` },
    previousOutputs: { scrape },
  });
  const clean = cleanOut.output;
  console.log(
    `[smoke] clean: kept ${clean.pages.length} pages, ` +
      `${clean.stats.reductionPct.toFixed(1)}% reduction`,
  );

  // Phase 2: entity extract
  const extractorClient = new EntityExtractorClient(llm, env);
  const extractHandler = new EntityExtractHandler(extractorClient, stubCache, env);

  console.log(`[smoke] running entity.extract ...`);
  const t0 = Date.now();
  const out: any = await extractHandler.execute({
    ...baseCtx,
    step: { id: `${runId}-entities` },
    previousOutputs: { clean, deepResearch: undefined },
  });
  const t1 = Date.now() - t0;
  const r = out.output;
  console.log(`[smoke] call: ${t1}ms`);
  console.log(
    `[smoke] extracted: entities=${r.entities.length}, relationships=${r.relationships.length}, relationToMain=${r.relationToMain.length}`,
  );
  console.log(`[smoke] sample entity:        ${JSON.stringify(r.entities[0], null, 2)}`);
  console.log(`[smoke] sample relationship:  ${JSON.stringify(r.relationships[0], null, 2)}`);
  console.log(`[smoke] sample relevance:     ${JSON.stringify(r.relationToMain[0], null, 2)}`);

  // Assertions
  if (r.entities.length < env.ENTITY_EXTRACT_MIN_ENTITIES) {
    throw new Error(
      `too few entities: ${r.entities.length} < ${env.ENTITY_EXTRACT_MIN_ENTITIES}`,
    );
  }
  if (r.relationships.length < env.ENTITY_EXTRACT_MIN_RELATIONS) {
    throw new Error(
      `too few relationships: ${r.relationships.length} < ${env.ENTITY_EXTRACT_MIN_RELATIONS}`,
    );
  }
  if (r.relationToMain.length !== r.entities.length) {
    throw new Error(
      `relationToMain length mismatch: ${r.relationToMain.length} vs ${r.entities.length} entities`,
    );
  }
  if (!r.entities.every((e: any) => /^E\d+$/.test(e.id))) {
    throw new Error("entity id pattern violated");
  }
  const entityIds = new Set(r.entities.map((e: any) => e.id));
  const orphan = r.relationships.find(
    (rel: any) => !entityIds.has(rel.source) || !entityIds.has(rel.target),
  );
  if (orphan) {
    throw new Error(`relationship references unknown entity: ${JSON.stringify(orphan)}`);
  }
  const badScore = r.relationToMain.find(
    (rm: any) => !Number.isInteger(rm.score) || rm.score < 1 || rm.score > 100,
  );
  if (badScore) {
    throw new Error(`bad relationToMain.score: ${JSON.stringify(badScore)}`);
  }
  if (r.metadata.keyword !== "jak obniżyć kortyzol po 40 (kortyzol) — informational") {
    throw new Error(`metadata.keyword mismatch: ${r.metadata.keyword}`);
  }
  if (r.metadata.language !== "pl") {
    throw new Error(`metadata.language mismatch: ${r.metadata.language}`);
  }
  if (r.metadata.sourceUrlCount !== clean.pages.length) {
    throw new Error(
      `metadata.sourceUrlCount mismatch: got ${r.metadata.sourceUrlCount}, expected ${clean.pages.length}`,
    );
  }

  console.log(`[smoke] PASS — Plan 09 entity extraction works end-to-end`);
}

main().catch((e) => {
  console.error("[smoke] FAIL:", e);
  process.exit(1);
});
```

- [ ] **Step 2: Register the npm script**

Edit the root `package.json`. Inside `"scripts"`, immediately after the existing `"smoke:plan-07"` entry, add:

```json
    "smoke:plan-09": "apps/api/node_modules/.bin/tsx --tsconfig apps/api/tsconfig.json scripts/smoke-plan-09.ts"
```

> Pattern matches `smoke:plan-06` and `smoke:plan-07` exactly: uses the API workspace's `tsx` so NestJS-style decorators and path resolution work. Plan number is 09 (Plan 08 was Manual Step Re-run, no smoke entry).

- [ ] **Step 3: Run the smoke test**

```bash
pnpm smoke:plan-09
```

Expected output (approximate — content varies by LLM response):

```
[smoke] loaded fixture: 8 pages
[smoke] running clean ...
[smoke] clean: kept N pages, 4X.X% reduction
[smoke] running entity.extract ...
[smoke] call: ~3000-10000ms
[smoke] extracted: entities>=10, relationships>=5, relationToMain==entities
[smoke] sample entity:        { id: "E1", originalSurface: "...", entity: "...", domainType: "...", evidence: "..." }
[smoke] sample relationship:  { source: "E1", target: "E2", type: "...", description: "...", evidence: "..." }
[smoke] sample relevance:     { entityId: "E1", score: NN, rationale: "..." }
[smoke] PASS — Plan 09 entity extraction works end-to-end
```

Expected final line: `[smoke] PASS — Plan 09 entity extraction works end-to-end`.

> Troubleshooting: if Zod's `superRefine` rejects (e.g. an orphan relationship or a missing relationToMain entry), the AI SDK throws before the handler asserts. That's the "fail closed" path. Investigate by running the smoke test again — Gemini sometimes produces inconsistent IDs on retry. If it persists, lower `ENTITY_EXTRACT_MIN_ENTITIES` for that run, or inspect the fixture for sparse content. Do NOT loosen the schema.

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke-plan-09.ts package.json
git commit -m "test(smoke): add smoke-plan-09 end-to-end entity extraction test"
```

---

## Task 10: End-to-end verification

**Files:** (no new files — verification only)

- [ ] **Step 1: Run full typecheck across all packages**

```bash
pnpm typecheck
```

Expected: no errors in `@sensai/shared`, `@sensai/api`, or `@sensai/web`.

- [ ] **Step 2: Run full test suite**

```bash
pnpm --filter @sensai/api test
```

Expected: all tests pass, including the three new suites:
- `src/tests/entity-extract.prompt.test.ts` — 7 tests
- `src/tests/entity-extractor.client.test.ts` — 2 tests
- `src/tests/entity-extract.handler.test.ts` — 10 tests

- [ ] **Step 3: Build the whole workspace**

```bash
pnpm build
```

Expected: `@sensai/shared` → dist, `@sensai/api` → dist, `@sensai/web` → .next — all succeed.

- [ ] **Step 4: Re-run the smoke test to confirm post-build behaviour**

```bash
pnpm smoke:plan-09
```

Expected: `PASS — Plan 09 entity extraction works end-to-end`.

- [ ] **Step 5: Manually spot-check in the web UI (local dev)**

Start the API and web apps (in separate terminals):

```bash
pnpm --filter @sensai/api start:dev
```

```bash
pnpm --filter @sensai/web dev
```

Open http://localhost:3000, choose the Demo project, pick the template **"Blog SEO — deep research + clean + extract + entities"**, start a run with input `{ topic: "jak obniżyć kortyzol po 40", mainKeyword: "kortyzol", intent: "informational" }`, approve the scrape step when prompted, wait for the pipeline to reach the `entities` step, then confirm:

1. The run detail page shows `extract` and `entities` running in parallel after `clean`+`deepResearch` complete.
2. `entities` step ends "completed" (green) — not failed.
3. Clicking on `entities` expands a panel showing four metrics (Encje / Relacje / Istotność / Źródła) and a context box with main-topic interpretation.
4. Three tabs visible: **Encje**, **Relacje**, **Istotność**.
   - Encje tab: each row shows id, type-coloured badge in Polish (osoba/organizacja/…), entity name, and italic evidence quote.
   - Relacje tab: each row shows source-entity → relation-type → target-entity, plus description and evidence. No orphan-warning banner appears (graph is consistent).
   - Istotność tab: rows sorted by score descending, each showing entity name, score N/100, and rationale.
5. Cache: re-running the same run with the same `clean` output (or via Plan 08's manual re-run **without** `forceRefresh`) returns instantly via cache; with `forceRefresh: true` triggers a fresh LLM call.

- [ ] **Step 6: Final commit (no changes expected — verification only)**

If any fix was needed during this task, commit it with a focused message (`fix: <what>`). Otherwise no commit.

---

## Self-Review Checklist

- [x] **Spec coverage** — Lesson 2.6 LLM scope fully covered: entities (Task 1 schema, Task 3 prompt), relationships with explicit-only rule (Task 1 schema graph integrity, Task 3 prompt rules), `relation_to_main` (Task 1 `RelationToMain` + 1:1 superRefine), `context_analysis` (Task 1 `ContextAnalysis`). Lesson 2.7 (Python NER) is explicitly deferred to a future plan, per Option C from brainstorming.
- [x] **No placeholders** — every step contains the exact code or command.
- [x] **Type consistency** — `EntityExtractionResult`, `Entity`, `EntityRelation`, `RelationToMain`, `ContextAnalysis` names used consistently across schemas, client, handler, smoke test, and UI. `EntityType` and `RelationType` enums reused throughout. Handler injection token `ENTITY_EXTRACT_ENV` consistent in client and handler.
- [x] **Referential integrity to earlier plans** — reuses `ResearchBriefing` (Plan 05), `CleanedScrapeResult` (Plan 06), `RunInput` and DI pattern (Plan 07), `forceRefresh` field on `StepContext` (Plan 08) without changes to upstream schemas.
- [x] **TDD ordering** — every production file has a test-first step; handler (Task 5), client (Task 4), and prompt (Task 3) each follow write-test → see-fail → implement → see-pass.
- [x] **Pricing** — `google/gemini-3-flash-preview` already present from Plan 07, so no pricing task is needed; this is called out in the gotchas to prevent duplicate rows.
- [x] **DAG correctness** — `entities` and `extract` share `dependsOn: ["clean", "deepResearch"]` so they run in parallel without conflicts; `brief` continues to depend only on `extract` to keep this plan scoped to the entity step alone.
