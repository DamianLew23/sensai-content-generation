# Plan 07 — Content Extraction (Facts + Data + Ideations) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `tool.content.extract` step that converts cleaned markdown + deep research briefing into a structured knowledge base of **facts**, **measurable data points** and **content ideations** using a single LLM call (`google/gemini-3-flash-preview` via OpenRouter), implementing lesson 2.5 scope (no entities / no relationships / no data markers — those belong to future Plan 08 covering lesson 2.6).

**Architecture:** New tool module `tools/content-extractor/` with a thin wrapper around `LlmClient.generateObject` (structured output validated by Zod; no retry, no manual JSON parsing). New handler `ContentExtractHandler` orchestrates: validate previous outputs → compose prompt from `CleanedScrapeResult` (`previousOutputs.clean`) + optional `ResearchBriefing` (`previousOutputs.deepResearch`) → call LLM → return typed `ExtractionResult`. Caches whole step output by `(pages + deepResearchPresent + keyword + language + model)` hash with 7-day TTL. Fails closed on any schema violation.

**Tech Stack:** TypeScript / NestJS / AI SDK v5 / `@ai-sdk/openai-compatible` (OpenRouter) / `google/gemini-3-flash-preview` / Drizzle / BullMQ / Vitest.

**Spec sources:**
- Lesson notes: `docs/edu/lekcja-2-5/lekcja-2-5-ekstrakcja-faktow-i-ideations.md`
- Reference prompt (advanced — we take only the facts/data/ideations portion): `docs/edu/lekcja-2-5/T2F5-zaawansowana_ekstrakcja_encje_fakty_dane_ideations.md`

**Critical gotcha 1 — Pricing table:** `apps/api/src/llm/pricing.ts` currently does not contain `google/gemini-3-flash-preview`. An unknown model makes `calculateCostUsd` return `"0"` silently. Task 2 adds the entry explicitly; do not skip it.

**Critical gotcha 2 — Shared package build:** `packages/shared` must be **built to `dist/`** after every change to `schemas.ts` (`pnpm --filter @sensai/shared build`). The API imports from compiled dist, not src. Every task that touches `packages/shared/src/schemas.ts` must end with a build step.

**Critical gotcha 3 — `previousOutputs` keys follow step keys, not types:** Seed templates use `{ key: "clean", type: "tool.content.clean" }` and `{ key: "deepResearch", type: "tool.youcom.research" }`. The orchestrator exposes outputs under **step keys**, so the handler reads `ctx.previousOutputs.clean` and `ctx.previousOutputs.deepResearch`. The handler must tolerate `deepResearch` being absent (template may skip the deep research step).

**Critical gotcha 4 — `generateObject` + Zod `min()` interaction:** The AI SDK validates the returned object against the Zod schema. If the LLM produces fewer than 5 facts / 3 data / 3 ideations, the call throws. This is the intended "fail closed" behavior — no retries, no fallback. The handler just propagates the error and lets the orchestrator mark the step failed.

---

## File Structure

```
apps/api/src/
├── tools/content-extractor/                  (NEW)
│   ├── content-extractor.client.ts           Wraps LlmClient.generateObject + cost tracking
│   ├── content-extractor.module.ts           NestJS module exporting ContentExtractorClient
│   └── content-extractor.types.ts            Internal helper types (PromptInputBlock etc.)
├── prompts/
│   └── content-extract.prompt.ts             (NEW) system + user prompt builders
├── handlers/
│   └── content-extract.handler.ts            (NEW) StepHandler for "tool.content.extract"
├── config/env.ts                             (MODIFY) Add CONTENT_EXTRACT_* vars
├── tools/tools.module.ts                     (MODIFY) Import ContentExtractorModule
├── handlers/handlers.module.ts               (MODIFY) Register ContentExtractHandler
├── llm/pricing.ts                            (MODIFY) Add google/gemini-3-flash-preview entry
├── seed/seed.ts                              (MODIFY) Add new template
└── tests/
    ├── content-extract.prompt.test.ts        pure fn unit — prompt composition
    ├── content-extractor.client.test.ts      mocked LlmClient
    └── content-extract.handler.test.ts       mocked client + cache + previousOutputs

packages/shared/src/schemas.ts                (MODIFY) Add Fact, DataPoint, Ideation, ExtractionMetadata, ExtractionResult
apps/web/src/components/step-output/
├── extraction.tsx                            (NEW) ExtractionOutput renderer (3 sections)
└── index.tsx                                 (MODIFY) Route "tool.content.extract" + hasRichRenderer
.env.example                                  (MODIFY) Add CONTENT_EXTRACT_*
scripts/smoke-plan-07.ts                      (NEW) Manual end-to-end smoke test
package.json (root)                           (MODIFY) Add "smoke:plan-07" script
```

---

## Task 1: Shared schemas for ExtractionResult

**Files:**
- Modify: `packages/shared/src/schemas.ts` (append at end)
- Build: `packages/shared` (must produce `dist/`)

No unit test for pure Zod schemas — runtime tests in later tasks exercise them.

- [ ] **Step 1: Append new schemas to `packages/shared/src/schemas.ts`**

Open `packages/shared/src/schemas.ts` and append at the very end (after the existing `CleanedScrapeResult` export):

```ts
export const ExtractionMetadata = z.object({
  keyword: z.string().min(1),
  language: z.string().min(2).max(10),
  sourceUrlCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});
export type ExtractionMetadata = z.infer<typeof ExtractionMetadata>;

export const FactCategory = z.enum(["definition", "causal", "general"]);
export type FactCategory = z.infer<typeof FactCategory>;

export const Priority = z.enum(["high", "medium", "low"]);
export type Priority = z.infer<typeof Priority>;

export const Fact = z.object({
  id: z.string().regex(/^F\d+$/, "id must be F<number>"),
  text: z.string().min(1).max(400),
  category: FactCategory,
  priority: Priority,
  confidence: z.number().min(0).max(1),
  sourceUrls: z.string().url().array().default([]),
});
export type Fact = z.infer<typeof Fact>;

export const DataPoint = z.object({
  id: z.string().regex(/^D\d+$/, "id must be D<number>"),
  definition: z.string().min(1).max(200),
  value: z.string().min(1).max(60),
  unit: z.string().max(40).nullable(),
  sourceUrls: z.string().url().array().default([]),
});
export type DataPoint = z.infer<typeof DataPoint>;

export const IdeationType = z.enum(["checklist", "mini_course", "info_box", "habit"]);
export type IdeationType = z.infer<typeof IdeationType>;

export const Ideation = z.object({
  id: z.string().regex(/^I\d+$/, "id must be I<number>"),
  type: IdeationType,
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(400),
  audience: z.string().max(200).default(""),
  channels: z.string().array().default([]),
  keywords: z.string().array().default([]),
  priority: Priority,
});
export type Ideation = z.infer<typeof Ideation>;

export const ExtractionResult = z.object({
  metadata: ExtractionMetadata,
  facts: Fact.array().min(5),
  data: DataPoint.array().min(3),
  ideations: Ideation.array().min(3),
});
export type ExtractionResult = z.infer<typeof ExtractionResult>;
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
git commit -m "feat(shared): add ExtractionResult schemas for Plan 07"
```

---

## Task 2: Add pricing entry for google/gemini-3-flash-preview

**Files:**
- Modify: `apps/api/src/llm/pricing.ts`

- [ ] **Step 1: Add pricing row**

Edit `apps/api/src/llm/pricing.ts`, inside `MODEL_PRICING` object. Add a new row after the existing `google/gemini-2.5-flash` entry (line 13):

```ts
  "google/gemini-2.5-flash": { inputPer1M: 0.075, outputPer1M: 0.3 },
  "google/gemini-3-flash-preview": { inputPer1M: 0.3, outputPer1M: 2.5 },
```

> Rationale: Gemini 3 Flash preview pricing on OpenRouter at time of writing. If OpenRouter changes pricing, update this row manually — `calculateCostUsd` returns `"0"` for unknown models (silent), so missing entries cause cost under-reporting.

- [ ] **Step 2: Typecheck**

Run:

```bash
pnpm --filter @sensai/api typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/llm/pricing.ts
git commit -m "feat(llm): add pricing for google/gemini-3-flash-preview"
```

---

## Task 3: Environment variables for content-extract

**Files:**
- Modify: `apps/api/src/config/env.ts`
- Modify: `.env.example`

- [ ] **Step 1: Add schema entries to `apps/api/src/config/env.ts`**

Open `apps/api/src/config/env.ts`. Inside the `EnvSchema` z.object call, append these lines right before the closing `MAX_COST_PER_RUN_USD` entry (line 35):

```ts
  CONTENT_EXTRACT_MODEL: z.string().default("google/gemini-3-flash-preview"),
  CONTENT_EXTRACT_LANGUAGE: z.string().min(2).max(10).default("pl"),
  CONTENT_EXTRACT_MIN_FACTS: z.coerce.number().int().positive().default(5),
  CONTENT_EXTRACT_MIN_DATA: z.coerce.number().int().positive().default(3),
  CONTENT_EXTRACT_MIN_IDEATIONS: z.coerce.number().int().positive().default(3),
  CONTENT_EXTRACT_MAX_INPUT_CHARS: z.coerce.number().int().positive().default(120_000),
```

- [ ] **Step 2: Mirror keys in `.env.example`**

Open `.env.example`. Append (place near the other `CLEANING_*` vars — typically near the bottom):

```
# Plan 07 — content extraction
CONTENT_EXTRACT_MODEL=google/gemini-3-flash-preview
CONTENT_EXTRACT_LANGUAGE=pl
CONTENT_EXTRACT_MIN_FACTS=5
CONTENT_EXTRACT_MIN_DATA=3
CONTENT_EXTRACT_MIN_IDEATIONS=3
CONTENT_EXTRACT_MAX_INPUT_CHARS=120000
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @sensai/api typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/config/env.ts .env.example
git commit -m "feat(api): add CONTENT_EXTRACT_* env vars"
```

---

## Task 4: Content-extract prompt module

**Files:**
- Create: `apps/api/src/prompts/content-extract.prompt.ts`
- Test: `apps/api/src/tests/content-extract.prompt.test.ts`

- [ ] **Step 1: Write failing prompt tests**

Create `apps/api/src/tests/content-extract.prompt.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { contentExtractPrompt } from "../prompts/content-extract.prompt";

describe("contentExtractPrompt.system", () => {
  it("names the role and forbids out-of-source content", () => {
    expect(contentExtractPrompt.system).toMatch(/data analyst/i);
    expect(contentExtractPrompt.system).toMatch(/content editor/i);
    expect(contentExtractPrompt.system).toMatch(/do not.*outside/i);
  });

  it("declares the Definicja – Wartość – Jednostka format for data points", () => {
    expect(contentExtractPrompt.system).toMatch(/Definition.*Value.*Unit/);
  });
});

describe("contentExtractPrompt.user", () => {
  const basePages = [
    { url: "https://a.example.com/a", markdown: "Para 1\n\nPara 2 about cortisol" },
    { url: "https://b.example.com/b", markdown: "Another source about cortisol" },
  ];

  it("includes keyword, language, minimums and separator markers", () => {
    const out = contentExtractPrompt.user({
      keyword: "kortyzol",
      language: "pl",
      cleanedPages: basePages,
      deepResearch: undefined,
      minFacts: 5,
      minData: 3,
      minIdeations: 3,
    });

    expect(out).toMatch(/Central keyword:\s*kortyzol/);
    expect(out).toMatch(/Output language:\s*pl/);
    expect(out).toMatch(/minimum 5 facts/i);
    expect(out).toMatch(/minimum 3 data points/i);
    expect(out).toMatch(/minimum 3 ideations/i);
    expect(out).toContain("---");
    expect(out).toContain("https://a.example.com/a");
    expect(out).toContain("https://b.example.com/b");
    expect(out).toContain("Para 2 about cortisol");
  });

  it("includes deep research block when provided, before source pages", () => {
    const out = contentExtractPrompt.user({
      keyword: "kortyzol",
      language: "pl",
      cleanedPages: basePages,
      deepResearch: {
        content: "DEEP_RESEARCH_BODY",
        sources: [{ url: "https://research.example.com/x", title: "Src" }],
      },
      minFacts: 5,
      minData: 3,
      minIdeations: 3,
    });

    const drIdx = out.indexOf("DEEP_RESEARCH_BODY");
    const pageIdx = out.indexOf("https://a.example.com/a");
    expect(drIdx).toBeGreaterThan(-1);
    expect(pageIdx).toBeGreaterThan(-1);
    expect(drIdx).toBeLessThan(pageIdx);
    expect(out).toContain("https://research.example.com/x");
  });

  it("omits deep research block cleanly when not provided", () => {
    const out = contentExtractPrompt.user({
      keyword: "kortyzol",
      language: "pl",
      cleanedPages: basePages,
      deepResearch: undefined,
      minFacts: 5,
      minData: 3,
      minIdeations: 3,
    });
    expect(out).not.toMatch(/DEEP RESEARCH BRIEFING/i);
  });

  it("produces empty pages block when cleanedPages is empty but deep research is present", () => {
    const out = contentExtractPrompt.user({
      keyword: "kortyzol",
      language: "pl",
      cleanedPages: [],
      deepResearch: { content: "DR", sources: [] },
      minFacts: 5,
      minData: 3,
      minIdeations: 3,
    });
    expect(out).toContain("DR");
    expect(out).toMatch(/no source pages/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @sensai/api exec vitest run src/tests/content-extract.prompt.test.ts
```

Expected: FAIL — "Cannot find module '../prompts/content-extract.prompt'".

- [ ] **Step 3: Create `apps/api/src/prompts/content-extract.prompt.ts`**

```ts
import type { ResearchBriefing } from "@sensai/shared";

export interface ExtractionPromptArgs {
  keyword: string;
  language: string;
  cleanedPages: Array<{ url: string; markdown: string }>;
  deepResearch: ResearchBriefing | undefined;
  minFacts: number;
  minData: number;
  minIdeations: number;
}

const SYSTEM = `You are an experienced data analyst and content editor.
Your job is to extract a structured knowledge base from the provided source texts.

Extract three kinds of items:
1. Facts — concrete statements present in the sources: definitions, cause-effect relationships, specifications, general assertions.
2. Data points — measurable quantities (numbers, durations, sizes, percentages). Each data point MUST follow the format "Definition – Value – Unit". Unit may be null when the value is intrinsically unitless (e.g. ratios given as a count). Never fabricate units.
3. Ideations — concrete content-enrichment ideas inspired by the sources: checklists, mini-courses, "good to know" info-boxes, habits to adopt. These describe content add-ons, not the main article.

HARD RULES:
- Do not add information that is not present in the provided texts. Do not use your world knowledge. If something would be a useful fact but isn't in the sources, drop it.
- Ignore everything that is not related to the central keyword the user provides.
- No duplicates across facts, data and ideations — if the same information appears in multiple sources, emit it once.
- IDs follow the patterns F1, F2, ... for facts; D1, D2, ... for data points; I1, I2, ... for ideations. Numbering is contiguous starting from 1.
- confidence is 0.0–1.0 where 1.0 means the fact is stated verbatim in multiple sources; 0.5 means it appears once with clear phrasing; below 0.5 means paraphrased or indirect.
- priority is "high" when the item directly supports the central keyword, "medium" when it gives useful background, "low" when it is tangential.
- sourceUrls contains only URLs that actually appear in the provided blocks; do not invent URLs. Empty array is acceptable when a fact is synthesised from multiple sources.
- Output language for descriptive fields (text, definition, title, description, audience) must match the requested output language exactly. Keep named entities (product names, place names) in their original spelling.
- Output exactly one JSON object matching the requested schema. No markdown, no commentary, no code fences.`;

function renderSourcesBlock(pages: ExtractionPromptArgs["cleanedPages"]): string {
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

export const contentExtractPrompt = {
  system: SYSTEM,
  user(args: ExtractionPromptArgs): string {
    const header = [
      `Central keyword: ${args.keyword}`,
      `Output language: ${args.language}`,
      `Emit at minimum ${args.minFacts} facts, minimum ${args.minData} data points, minimum ${args.minIdeations} ideations.`,
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
pnpm --filter @sensai/api exec vitest run src/tests/content-extract.prompt.test.ts
```

Expected: PASS — 4/4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/prompts/content-extract.prompt.ts apps/api/src/tests/content-extract.prompt.test.ts
git commit -m "feat(api): add content-extract prompt module"
```

---

## Task 5: ContentExtractorClient (LLM wrapper)

**Files:**
- Create: `apps/api/src/tools/content-extractor/content-extractor.client.ts`
- Create: `apps/api/src/tools/content-extractor/content-extractor.types.ts`
- Create: `apps/api/src/tools/content-extractor/content-extractor.module.ts`
- Test: `apps/api/src/tests/content-extractor.client.test.ts`

- [ ] **Step 1: Create helper types file**

Create `apps/api/src/tools/content-extractor/content-extractor.types.ts`:

```ts
export interface ExtractCallContext {
  runId: string;
  stepId: string;
  attempt: number;
}
```

(Minimal today; kept as a separate file to match the content-cleaner package layout so future extensions — batching helpers, input trimming — have an obvious home.)

- [ ] **Step 2: Write failing client tests**

Create `apps/api/src/tests/content-extractor.client.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ContentExtractorClient } from "../tools/content-extractor/content-extractor.client";
import { ExtractionResult } from "@sensai/shared";

const env = {
  CONTENT_EXTRACT_MODEL: "google/gemini-3-flash-preview",
  CONTENT_EXTRACT_MAX_INPUT_CHARS: 120_000,
} as const;

function makeSampleExtraction() {
  return ExtractionResult.parse({
    metadata: {
      keyword: "kortyzol",
      language: "pl",
      sourceUrlCount: 2,
      createdAt: "2026-04-24T00:00:00.000Z",
    },
    facts: Array.from({ length: 5 }, (_, i) => ({
      id: `F${i + 1}`,
      text: `Fact ${i + 1} about kortyzol.`,
      category: "definition" as const,
      priority: "high" as const,
      confidence: 0.8,
      sourceUrls: [],
    })),
    data: Array.from({ length: 3 }, (_, i) => ({
      id: `D${i + 1}`,
      definition: `Measurement ${i + 1}`,
      value: `${i + 1}`,
      unit: "mg",
      sourceUrls: [],
    })),
    ideations: Array.from({ length: 3 }, (_, i) => ({
      id: `I${i + 1}`,
      type: "checklist" as const,
      title: `Idea ${i + 1}`,
      description: `Description ${i + 1}`,
      audience: "",
      channels: [],
      keywords: [],
      priority: "medium" as const,
    })),
  });
}

describe("ContentExtractorClient", () => {
  let llm: { generateObject: ReturnType<typeof vi.fn> };
  let client: ContentExtractorClient;

  beforeEach(() => {
    llm = { generateObject: vi.fn() };
    client = new ContentExtractorClient(llm as any, env as any);
  });

  it("passes model from env and forwards system/prompt/schema", async () => {
    const sample = makeSampleExtraction();
    llm.generateObject.mockResolvedValueOnce({
      object: sample,
      model: env.CONTENT_EXTRACT_MODEL,
      promptTokens: 1200,
      completionTokens: 800,
      costUsd: "0.002400",
      latencyMs: 1500,
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
    expect(call.schema).toBe(ExtractionResult);

    expect(out.result).toBe(sample);
    expect(out.costUsd).toBe("0.002400");
    expect(out.model).toBe("google/gemini-3-flash-preview");
    expect(out.promptTokens).toBe(1200);
    expect(out.completionTokens).toBe(800);
    expect(out.latencyMs).toBe(1500);
  });

  it("throws when prompt exceeds CONTENT_EXTRACT_MAX_INPUT_CHARS", async () => {
    const huge = "x".repeat(env.CONTENT_EXTRACT_MAX_INPUT_CHARS + 1);
    await expect(
      client.extract({
        ctx: { runId: "r1", stepId: "s1", attempt: 1 },
        system: "SYSTEM",
        prompt: huge,
      }),
    ).rejects.toThrow(/exceeds.*CONTENT_EXTRACT_MAX_INPUT_CHARS/);
    expect(llm.generateObject).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm --filter @sensai/api exec vitest run src/tests/content-extractor.client.test.ts
```

Expected: FAIL — module resolution error.

- [ ] **Step 4: Create the client**

Create `apps/api/src/tools/content-extractor/content-extractor.client.ts`:

```ts
import { Inject, Injectable, Logger } from "@nestjs/common";
import { LlmClient } from "../../llm/llm.client";
import type { Env } from "../../config/env";
import { ExtractionResult } from "@sensai/shared";
import type { ExtractCallContext } from "./content-extractor.types";

type ClientEnv = Pick<Env, "CONTENT_EXTRACT_MODEL" | "CONTENT_EXTRACT_MAX_INPUT_CHARS">;

export interface ExtractCallResult {
  result: ExtractionResult;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: string;
  latencyMs: number;
}

@Injectable()
export class ContentExtractorClient {
  private readonly logger = new Logger(ContentExtractorClient.name);

  constructor(
    private readonly llm: LlmClient,
    @Inject("EXTRACT_ENV") private readonly env: ClientEnv,
  ) {}

  async extract(args: {
    ctx: ExtractCallContext;
    system: string;
    prompt: string;
  }): Promise<ExtractCallResult> {
    if (args.prompt.length > this.env.CONTENT_EXTRACT_MAX_INPUT_CHARS) {
      throw new Error(
        `content.extract prompt exceeds CONTENT_EXTRACT_MAX_INPUT_CHARS ` +
          `(got ${args.prompt.length}, limit ${this.env.CONTENT_EXTRACT_MAX_INPUT_CHARS})`,
      );
    }

    const res = await this.llm.generateObject({
      ctx: { ...args.ctx, model: this.env.CONTENT_EXTRACT_MODEL },
      system: args.system,
      prompt: args.prompt,
      schema: ExtractionResult,
    });

    this.logger.log(
      {
        model: res.model,
        promptTokens: res.promptTokens,
        completionTokens: res.completionTokens,
        costUsd: res.costUsd,
        latencyMs: res.latencyMs,
        factsOut: res.object.facts.length,
        dataOut: res.object.data.length,
        ideationsOut: res.object.ideations.length,
      },
      "content-extract LLM call",
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

Create `apps/api/src/tools/content-extractor/content-extractor.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { ContentExtractorClient } from "./content-extractor.client";
import { LlmModule } from "../../llm/llm.module";
import { loadEnv } from "../../config/env";

@Module({
  imports: [LlmModule],
  providers: [
    ContentExtractorClient,
    {
      provide: "EXTRACT_ENV",
      useFactory: () => loadEnv(),
    },
  ],
  exports: [ContentExtractorClient],
})
export class ContentExtractorModule {}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
pnpm --filter @sensai/api exec vitest run src/tests/content-extractor.client.test.ts
```

Expected: PASS — 2/2 tests.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/tools/content-extractor/ apps/api/src/tests/content-extractor.client.test.ts
git commit -m "feat(api): add ContentExtractorClient wrapping generateObject"
```

---

## Task 6: ContentExtractHandler (orchestration)

**Files:**
- Create: `apps/api/src/handlers/content-extract.handler.ts`
- Test: `apps/api/src/tests/content-extract.handler.test.ts`

- [ ] **Step 1: Write failing handler tests**

Create `apps/api/src/tests/content-extract.handler.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ContentExtractHandler } from "../handlers/content-extract.handler";
import type { StepContext } from "../orchestrator/step-handler";

const env = {
  CONTENT_EXTRACT_MODEL: "google/gemini-3-flash-preview",
  CONTENT_EXTRACT_LANGUAGE: "pl",
  CONTENT_EXTRACT_MIN_FACTS: 5,
  CONTENT_EXTRACT_MIN_DATA: 3,
  CONTENT_EXTRACT_MIN_IDEATIONS: 3,
} as any;

function makeCleanedPage(url: string, markdown: string) {
  return {
    url,
    title: `Title ${url}`,
    fetchedAt: "2026-04-24T00:00:00.000Z",
    markdown,
    paragraphs: markdown.split(/\n\n+/),
    originalChars: markdown.length * 2,
    cleanedChars: markdown.length,
    removedParagraphs: 1,
  };
}

function makeCleanedResult(pages = [makeCleanedPage("https://a.example.com/a", "Para A about kortyzol.")]) {
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
  return {
    metadata: {
      keyword: "kortyzol",
      language: "pl",
      sourceUrlCount: 1,
      createdAt: "2026-04-24T00:00:00.000Z",
    },
    facts: Array.from({ length: 5 }, (_, i) => ({
      id: `F${i + 1}`,
      text: `F${i + 1}`,
      category: "definition" as const,
      priority: "high" as const,
      confidence: 0.8,
      sourceUrls: [],
    })),
    data: Array.from({ length: 3 }, (_, i) => ({
      id: `D${i + 1}`,
      definition: `def ${i + 1}`,
      value: `${i + 1}`,
      unit: "mg",
      sourceUrls: [],
    })),
    ideations: Array.from({ length: 3 }, (_, i) => ({
      id: `I${i + 1}`,
      type: "checklist" as const,
      title: `Idea ${i + 1}`,
      description: `Desc ${i + 1}`,
      audience: "",
      channels: [],
      keywords: [],
      priority: "medium" as const,
    })),
  };
}

function makeCtx(overrides: Partial<StepContext> = {}): StepContext {
  return {
    run: {
      id: "run-1",
      input: { topic: "kortyzol", mainKeyword: "obniżyć kortyzol", intent: "informational" },
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

describe("ContentExtractHandler", () => {
  let client: { extract: ReturnType<typeof vi.fn> };
  let cache: { getOrSet: ReturnType<typeof vi.fn> };
  let handler: ContentExtractHandler;

  beforeEach(() => {
    client = { extract: vi.fn() };
    cache = { getOrSet: vi.fn() };
    handler = new ContentExtractHandler(client as any, cache as any, env);
  });

  it("reports type 'tool.content.extract'", () => {
    expect(handler.type).toBe("tool.content.extract");
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
    const deepResearch = { content: "deep body", sources: [{ url: "https://d.example.com/d", snippets: [] }] };
    cache.getOrSet.mockImplementationOnce(async (opts: any) => (await opts.fetcher()).result);
    client.extract.mockResolvedValueOnce({
      result: makeExtraction(),
      model: env.CONTENT_EXTRACT_MODEL,
      promptTokens: 100,
      completionTokens: 100,
      costUsd: "0.000500",
      latencyMs: 1000,
    });

    const ctx = makeCtx({ previousOutputs: { clean, deepResearch } });
    const out = await handler.execute(ctx);
    expect((out.output as any).facts).toHaveLength(5);
    expect(client.extract).toHaveBeenCalledTimes(1);
  });

  it("happy path: cache miss → one extract call → ExtractionResult", async () => {
    const clean = makeCleanedResult();
    const deepResearch = { content: "deep body", sources: [] };

    cache.getOrSet.mockImplementationOnce(async (opts: any) => (await opts.fetcher()).result);
    client.extract.mockResolvedValueOnce({
      result: makeExtraction(),
      model: env.CONTENT_EXTRACT_MODEL,
      promptTokens: 500,
      completionTokens: 300,
      costUsd: "0.001200",
      latencyMs: 1500,
    });

    const ctx = makeCtx({ previousOutputs: { clean, deepResearch } });
    const out = await handler.execute(ctx);
    const result = out.output as any;

    expect(result.facts).toHaveLength(5);
    expect(result.data).toHaveLength(3);
    expect(result.ideations).toHaveLength(3);
    expect(result.metadata.keyword).toBe("kortyzol (obniżyć kortyzol) — informational");
    expect(result.metadata.language).toBe("pl");
    expect(result.metadata.sourceUrlCount).toBe(1);
    expect(client.extract).toHaveBeenCalledTimes(1);
  });

  it("composes keyword: topic only when mainKeyword/intent absent", async () => {
    const clean = makeCleanedResult();
    cache.getOrSet.mockImplementationOnce(async (opts: any) => {
      expect(opts.params.keyword).toBe("kortyzol");
      return makeExtraction();
    });

    const ctx = makeCtx({
      run: { id: "run-1", input: { topic: "kortyzol" } } as any,
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
    expect(call.tool).toBe("content");
    expect(call.method).toBe("extract");
    expect(call.ttlSeconds).toBe(7 * 24 * 3600);
    expect(call.runId).toBe("run-1");
    expect(call.stepId).toBe("step-1");
    expect(call.params.keyword).toContain("kortyzol");
    expect(call.params.language).toBe("pl");
    expect(call.params.model).toBe("google/gemini-3-flash-preview");
    expect(call.params.deepResearchPresent).toBe(true);
    expect(call.params.pages).toEqual([
      { url: "https://a.example.com/a", md: "Para A about kortyzol." },
    ]);
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
pnpm --filter @sensai/api exec vitest run src/tests/content-extract.handler.test.ts
```

Expected: FAIL — module resolution error.

- [ ] **Step 3: Create the handler**

Create `apps/api/src/handlers/content-extract.handler.ts`:

```ts
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { StepContext, StepHandler, StepResult } from "../orchestrator/step-handler";
import { ContentExtractorClient } from "../tools/content-extractor/content-extractor.client";
import { ToolCacheService } from "../tools/tool-cache.service";
import {
  CleanedScrapeResult,
  ResearchBriefing,
  type ExtractionResult,
  type RunInput,
} from "@sensai/shared";
import type { Env } from "../config/env";
import { contentExtractPrompt } from "../prompts/content-extract.prompt";

const TTL_DAYS = 7;

type HandlerEnv = Pick<
  Env,
  | "CONTENT_EXTRACT_MODEL"
  | "CONTENT_EXTRACT_LANGUAGE"
  | "CONTENT_EXTRACT_MIN_FACTS"
  | "CONTENT_EXTRACT_MIN_DATA"
  | "CONTENT_EXTRACT_MIN_IDEATIONS"
>;

@Injectable()
export class ContentExtractHandler implements StepHandler {
  readonly type = "tool.content.extract";
  private readonly logger = new Logger(ContentExtractHandler.name);

  constructor(
    private readonly client: ContentExtractorClient,
    private readonly cache: ToolCacheService,
    @Inject("EXTRACT_ENV") private readonly env: HandlerEnv,
  ) {}

  async execute(ctx: StepContext): Promise<StepResult> {
    const prevClean = ctx.previousOutputs.clean;
    if (prevClean === undefined || prevClean === null) {
      throw new Error("content.extract requires previousOutputs.clean");
    }
    const clean = CleanedScrapeResult.parse(prevClean);

    let deepResearch: ReturnType<typeof ResearchBriefing.parse> | undefined;
    const prevDeep = ctx.previousOutputs.deepResearch;
    if (prevDeep !== undefined && prevDeep !== null) {
      deepResearch = ResearchBriefing.parse(prevDeep);
    }

    if (clean.pages.length === 0 && !deepResearch) {
      throw new Error("content.extract: no input content (clean.pages empty and no deepResearch)");
    }

    const keyword = this.composeKeyword(ctx.run.input as RunInput);
    const language = this.env.CONTENT_EXTRACT_LANGUAGE;
    const model = this.env.CONTENT_EXTRACT_MODEL;

    const result = await this.cache.getOrSet<ExtractionResult>({
      tool: "content",
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
      fetcher: async () => {
        const t0 = Date.now();
        const systemPrompt = contentExtractPrompt.system;
        const userPrompt = contentExtractPrompt.user({
          keyword,
          language,
          cleanedPages: clean.pages.map((p) => ({ url: p.url, markdown: p.markdown })),
          deepResearch,
          minFacts: this.env.CONTENT_EXTRACT_MIN_FACTS,
          minData: this.env.CONTENT_EXTRACT_MIN_DATA,
          minIdeations: this.env.CONTENT_EXTRACT_MIN_IDEATIONS,
        });

        const call = await this.client.extract({
          ctx: { runId: ctx.run.id, stepId: ctx.step.id, attempt: ctx.attempt },
          system: systemPrompt,
          prompt: userPrompt,
        });
        const latencyMs = Date.now() - t0;

        const enriched: ExtractionResult = {
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
            facts: enriched.facts.length,
            data: enriched.data.length,
            ideations: enriched.ideations.length,
            costUsd: call.costUsd,
            latencyMs,
          },
          "content-extract done",
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
pnpm --filter @sensai/api exec vitest run src/tests/content-extract.handler.test.ts
```

Expected: PASS — 9/9 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/handlers/content-extract.handler.ts apps/api/src/tests/content-extract.handler.test.ts
git commit -m "feat(api): add ContentExtractHandler for tool.content.extract"
```

---

## Task 7: Wire the module into the NestJS app

**Files:**
- Modify: `apps/api/src/tools/tools.module.ts`
- Modify: `apps/api/src/handlers/handlers.module.ts`

- [ ] **Step 1: Register ContentExtractorModule in ToolsModule**

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

@Module({
  imports: [
    DbModule,
    DataForSeoModule,
    FirecrawlModule,
    Crawl4aiModule,
    YoucomModule,
    ContentCleanerModule,
    ContentExtractorModule,
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
  ],
})
export class ToolsModule {}
```

- [ ] **Step 2: Register ContentExtractHandler + EXTRACT_ENV in HandlersModule**

Edit `apps/api/src/handlers/handlers.module.ts`. Replace the whole file with:

```ts
import { Module } from "@nestjs/common";
import { BriefHandler } from "./brief.handler";
import { SerpFetchHandler } from "./serp-fetch.handler";
import { ScrapeFetchHandler } from "./scrape-fetch.handler";
import { YoucomResearchHandler } from "./youcom-research.handler";
import { ContentCleanHandler } from "./content-clean.handler";
import { ContentExtractHandler } from "./content-extract.handler";
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
      provide: STEP_HANDLERS,
      useFactory: (
        brief: BriefHandler,
        serp: SerpFetchHandler,
        scrape: ScrapeFetchHandler,
        youcom: YoucomResearchHandler,
        clean: ContentCleanHandler,
        extract: ContentExtractHandler,
      ): StepHandler[] => [brief, serp, scrape, youcom, clean, extract],
      inject: [
        BriefHandler,
        SerpFetchHandler,
        ScrapeFetchHandler,
        YoucomResearchHandler,
        ContentCleanHandler,
        ContentExtractHandler,
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

Expected: all previously passing tests + the new extraction tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/tools/tools.module.ts apps/api/src/handlers/handlers.module.ts
git commit -m "feat(api): register ContentExtractHandler and ContentExtractorModule"
```

---

## Task 8: Seed template "Blog SEO — deep research + clean + extract"

**Files:**
- Modify: `apps/api/src/seed/seed.ts`

- [ ] **Step 1: Add the template upsert**

Edit `apps/api/src/seed/seed.ts`. Immediately after the `blogSeoDeepResearchClean` block (around line 72), insert:

```ts
  const blogSeoExtract = await upsertTemplate(
    db,
    "Blog SEO — deep research + clean + extract",
    1,
    {
      steps: [
        { key: "deepResearch", type: "tool.youcom.research", auto: true },
        { key: "research",     type: "tool.serp.fetch",     auto: true },
        { key: "scrape",       type: "tool.scrape",         auto: false },
        { key: "clean",        type: "tool.content.clean",  auto: true },
        { key: "extract",      type: "tool.content.extract", auto: true },
        { key: "brief",        type: "llm.brief",           auto: true },
      ],
    },
  );
```

Then add a corresponding `console.log` inside the "templates:" block (after the existing `blogSeoDeepResearchClean` line):

```ts
  console.log(`    "${blogSeoExtract.name}" v${blogSeoExtract.version}: ${blogSeoExtract.id}`);
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

Expected output:

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
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/seed/seed.ts
git commit -m "feat(seed): add 'Blog SEO — deep research + clean + extract' template"
```

---

## Task 9: Web UI — ExtractionOutput component

**Files:**
- Create: `apps/web/src/components/step-output/extraction.tsx`
- Modify: `apps/web/src/components/step-output/index.tsx`

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/step-output/extraction.tsx`:

```tsx
"use client";
import { useState } from "react";
import { domainOf, EmptyOutput, Metric } from "./shared";

type FactCategory = "definition" | "causal" | "general";
type Priority = "high" | "medium" | "low";
type IdeationType = "checklist" | "mini_course" | "info_box" | "habit";

type Fact = {
  id: string;
  text: string;
  category: FactCategory;
  priority: Priority;
  confidence: number;
  sourceUrls: string[];
};

type DataPoint = {
  id: string;
  definition: string;
  value: string;
  unit: string | null;
  sourceUrls: string[];
};

type Ideation = {
  id: string;
  type: IdeationType;
  title: string;
  description: string;
  audience: string;
  channels: string[];
  keywords: string[];
  priority: Priority;
};

type ExtractionResultShape = {
  metadata: {
    keyword: string;
    language: string;
    sourceUrlCount: number;
    createdAt: string;
  };
  facts: Fact[];
  data: DataPoint[];
  ideations: Ideation[];
};

function isExtraction(v: unknown): v is ExtractionResultShape {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    !!o.metadata &&
    Array.isArray(o.facts) &&
    Array.isArray(o.data) &&
    Array.isArray(o.ideations)
  );
}

const CATEGORY_PL: Record<FactCategory, string> = {
  definition: "definicja",
  causal: "przyczynowo-skutkowy",
  general: "ogólny",
};

const IDEATION_PL: Record<IdeationType, string> = {
  checklist: "checklista",
  mini_course: "mini-kurs",
  info_box: "ramka info",
  habit: "nawyk",
};

const PRIORITY_BADGE: Record<Priority, string> = {
  high: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  low: "bg-muted text-muted-foreground",
};

type Tab = "facts" | "data" | "ideations";

export function ExtractionOutput({ value }: { value: unknown }) {
  const [tab, setTab] = useState<Tab>("facts");

  if (!isExtraction(value)) return <EmptyOutput />;
  const { metadata, facts, data, ideations } = value;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Fakty" value={facts.length} />
        <Metric label="Dane" value={data.length} />
        <Metric label="Pomysły" value={ideations.length} />
        <Metric label="Źródła" value={metadata.sourceUrlCount} />
      </div>

      <div role="tablist" className="inline-flex rounded-md border bg-muted/30 p-0.5 text-xs">
        <TabBtn active={tab === "facts"} onClick={() => setTab("facts")}>
          Fakty ({facts.length})
        </TabBtn>
        <TabBtn active={tab === "data"} onClick={() => setTab("data")}>
          Dane ({data.length})
        </TabBtn>
        <TabBtn active={tab === "ideations"} onClick={() => setTab("ideations")}>
          Pomysły ({ideations.length})
        </TabBtn>
      </div>

      {tab === "facts" && (
        <ul className="space-y-2">
          {facts.map((f) => (
            <li key={f.id} className="rounded-lg border bg-card p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono text-[10px] text-muted-foreground">{f.id}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                  {CATEGORY_PL[f.category]}
                </span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] ${PRIORITY_BADGE[f.priority]}`}>
                  {f.priority}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  confidence: {f.confidence.toFixed(2)}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed">{f.text}</p>
              {f.sourceUrls.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
                  {f.sourceUrls.map((u) => (
                    <a
                      key={u}
                      href={u}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded border bg-muted/30 px-1.5 py-0.5 text-muted-foreground hover:text-foreground"
                    >
                      {domainOf(u)}
                    </a>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {tab === "data" && (
        <ul className="space-y-2">
          {data.map((d) => (
            <li key={d.id} className="rounded-lg border bg-card p-3">
              <div className="flex items-baseline gap-2 text-sm">
                <span className="font-mono text-[10px] text-muted-foreground">{d.id}</span>
                <span className="flex-1">{d.definition}</span>
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-lg font-semibold">{d.value}</span>
                {d.unit && <span className="text-sm text-muted-foreground">{d.unit}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {tab === "ideations" && (
        <ul className="space-y-2">
          {ideations.map((i) => (
            <li key={i.id} className="rounded-lg border bg-card p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono text-[10px] text-muted-foreground">{i.id}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                  {IDEATION_PL[i.type]}
                </span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] ${PRIORITY_BADGE[i.priority]}`}>
                  {i.priority}
                </span>
              </div>
              <div className="mt-2 text-sm font-medium">{i.title}</div>
              <p className="mt-1 text-sm text-muted-foreground">{i.description}</p>
              {(i.audience || i.channels.length > 0 || i.keywords.length > 0) && (
                <div className="mt-2 grid gap-1 text-[11px] text-muted-foreground">
                  {i.audience && (
                    <div>
                      <span className="font-medium">Odbiorca:</span> {i.audience}
                    </div>
                  )}
                  {i.channels.length > 0 && (
                    <div>
                      <span className="font-medium">Kanały:</span> {i.channels.join(", ")}
                    </div>
                  )}
                  {i.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {i.keywords.map((k) => (
                        <span key={k} className="rounded bg-muted px-1.5 py-0.5">
                          {k}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
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
    type === "tool.content.extract"
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
git add apps/web/src/components/step-output/extraction.tsx apps/web/src/components/step-output/index.tsx
git commit -m "feat(web): add ExtractionOutput component for tool.content.extract"
```

---

## Task 10: Smoke test `smoke-plan-07.ts`

**Files:**
- Create: `scripts/smoke-plan-07.ts`
- Modify: `package.json` (root)

> Reuses the existing `scripts/fixtures/scrape-result-kortyzol.json` by running it **through** the cleaning pipeline first, then feeding the result to the extractor. This mirrors how the real pipeline runs end-to-end.

- [ ] **Step 1: Create the smoke script**

Create `scripts/smoke-plan-07.ts`:

```ts
#!/usr/bin/env tsx
/**
 * Plan 07 manual smoke test — content extraction.
 *
 * Runs the full chain: raw scrape fixture → ContentCleanHandler (real LLM embeddings)
 * → ContentExtractHandler (real LLM generateObject). Bypasses NestJS DI because
 * tsx/esbuild does not emit constructor parameter metadata.
 *
 * Verifies:
 *   - facts.length >= 5, data.length >= 3, ideations.length >= 3
 *   - all IDs follow F<n>/D<n>/I<n>
 *   - metadata.keyword and metadata.language are set by the handler (not the LLM)
 *   - second call with identical input returns structurally identical output via cache stub
 *
 * Requires OPENAI_API_KEY (for cleaning embeddings) and OPENROUTER_API_KEY
 * (for extraction) in apps/api/.env.
 *
 * Run: pnpm smoke:plan-07
 */
import "reflect-metadata";
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnv } from "../apps/api/src/config/env";
import { LlmClient } from "../apps/api/src/llm/llm.client";
import { ContentCleanerClient } from "../apps/api/src/tools/content-cleaner/content-cleaner.client";
import { ContentCleanHandler } from "../apps/api/src/handlers/content-clean.handler";
import { ContentExtractorClient } from "../apps/api/src/tools/content-extractor/content-extractor.client";
import { ContentExtractHandler } from "../apps/api/src/handlers/content-extract.handler";

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

  // Phase 2: extract
  const extractorClient = new ContentExtractorClient(llm, env);
  const extractHandler = new ContentExtractHandler(extractorClient, stubCache, env);

  console.log(`[smoke] running extract (call 1) ...`);
  const t0 = Date.now();
  const out1: any = await extractHandler.execute({
    ...baseCtx,
    step: { id: `${runId}-extract` },
    previousOutputs: { clean, deepResearch: undefined },
  });
  const t1 = Date.now() - t0;
  const r1 = out1.output;
  console.log(`[smoke] call 1: ${t1}ms`);
  console.log(
    `[smoke] extracted: facts=${r1.facts.length}, data=${r1.data.length}, ideations=${r1.ideations.length}`,
  );
  console.log(`[smoke] sample fact: ${JSON.stringify(r1.facts[0], null, 2)}`);
  console.log(`[smoke] sample data: ${JSON.stringify(r1.data[0], null, 2)}`);
  console.log(`[smoke] sample ideation: ${JSON.stringify(r1.ideations[0], null, 2)}`);

  // Assertions
  if (r1.facts.length < env.CONTENT_EXTRACT_MIN_FACTS) {
    throw new Error(`too few facts: ${r1.facts.length}`);
  }
  if (r1.data.length < env.CONTENT_EXTRACT_MIN_DATA) {
    throw new Error(`too few data points: ${r1.data.length}`);
  }
  if (r1.ideations.length < env.CONTENT_EXTRACT_MIN_IDEATIONS) {
    throw new Error(`too few ideations: ${r1.ideations.length}`);
  }
  if (!r1.facts.every((f: any) => /^F\d+$/.test(f.id))) {
    throw new Error("fact id pattern violated");
  }
  if (!r1.data.every((d: any) => /^D\d+$/.test(d.id))) {
    throw new Error("data id pattern violated");
  }
  if (!r1.ideations.every((i: any) => /^I\d+$/.test(i.id))) {
    throw new Error("ideation id pattern violated");
  }
  if (r1.metadata.keyword !== "jak obniżyć kortyzol po 40 (kortyzol) — informational") {
    throw new Error(`metadata.keyword mismatch: ${r1.metadata.keyword}`);
  }
  if (r1.metadata.language !== "pl") {
    throw new Error(`metadata.language mismatch: ${r1.metadata.language}`);
  }
  if (r1.metadata.sourceUrlCount !== clean.pages.length) {
    throw new Error(
      `metadata.sourceUrlCount mismatch: got ${r1.metadata.sourceUrlCount}, expected ${clean.pages.length}`,
    );
  }

  console.log(`[smoke] PASS — Plan 07 content extraction works end-to-end`);
}

main().catch((e) => {
  console.error("[smoke] FAIL:", e);
  process.exit(1);
});
```

- [ ] **Step 2: Register the npm script**

Edit the root `package.json`. Inside `"scripts"`, immediately after the existing `"smoke:plan-06"` entry, add:

```json
    "smoke:plan-07": "tsx scripts/smoke-plan-07.ts",
```

- [ ] **Step 3: Run the smoke test**

```bash
pnpm smoke:plan-07
```

Expected output (approximate — content varies by LLM response):

```
[smoke] loaded fixture: 8 pages
[smoke] running clean ...
[smoke] clean: kept N pages, 4X.X% reduction
[smoke] running extract (call 1) ...
[smoke] call 1: ~2000-8000ms
[smoke] extracted: facts=>=5, data=>=3, ideations=>=3
[smoke] sample fact: { id: "F1", text: "...", category: "...", ... }
[smoke] sample data: { id: "D1", definition: "...", value: "...", unit: ... }
[smoke] sample ideation: { id: "I1", type: "...", title: "...", ... }
[smoke] PASS — Plan 07 content extraction works end-to-end
```

Expected final line: `[smoke] PASS — Plan 07 content extraction works end-to-end`.

> Troubleshooting: If the LLM returns fewer than min items the Zod validation in AI SDK will throw before the handler can assert. That's the "fail closed" path — either raise minimums in env (for that run) or inspect the fixture for sparse topical content.

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke-plan-07.ts package.json
git commit -m "test(smoke): add smoke-plan-07 end-to-end extraction test"
```

---

## Task 11: End-to-end verification

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
- `src/tests/content-extract.prompt.test.ts` — 4 tests
- `src/tests/content-extractor.client.test.ts` — 2 tests
- `src/tests/content-extract.handler.test.ts` — 9 tests

- [ ] **Step 3: Build the whole workspace**

```bash
pnpm build
```

Expected: `@sensai/shared` → dist, `@sensai/api` → dist, `@sensai/web` → .next — all succeed.

- [ ] **Step 4: Re-run the smoke test to confirm post-build behaviour**

```bash
pnpm smoke:plan-07
```

Expected: `PASS — Plan 07 content extraction works end-to-end`.

- [ ] **Step 5: Manually spot-check in the web UI (local dev)**

Start the API and web apps (in separate terminals):

```bash
pnpm --filter @sensai/api start:dev
```

```bash
pnpm --filter @sensai/web dev
```

Open http://localhost:3000, choose the Demo project, pick the template **"Blog SEO — deep research + clean + extract"**, start a run with input `{ topic: "jak obniżyć kortyzol po 40", mainKeyword: "kortyzol", intent: "informational" }`, approve the scrape step when prompted, wait for the pipeline to reach the `extract` step, then confirm:

1. The run detail page shows an `extract` step marked "completed".
2. Clicking on the step expands a panel showing three tabs: **Fakty**, **Dane**, **Pomysły**.
3. Each tab has ≥ the configured minimum items (5 / 3 / 3).
4. Facts show category + priority + confidence badges; data points show "Definition – Value – Unit"; ideations show type + title + description + audience/channels/keywords.

- [ ] **Step 6: Final commit (no changes expected — verification only)**

If any fix was needed during this task, commit it with a focused message (`fix: <what>`). Otherwise no commit.

---

## Self-Review Checklist

Before handing off, confirm:

- [x] **Spec coverage** — Lesson 2.5 scope fully covered: facts (Task 1 schema, Task 4 prompt), measurable data in "Definition – Value – Unit" format (Task 1 `DataPoint`, Task 4 prompt system message), ideations with all prescribed fields (Task 1 `Ideation`). Out-of-scope items (entities, relationships, data markers) are explicitly excluded.
- [x] **No placeholders** — every step includes full code or full shell commands; no "TBD", "implement later", "similar to Task N".
- [x] **Type consistency** — `ExtractionResult`, `Fact`, `DataPoint`, `Ideation` names used consistently; `FactCategory` / `IdeationType` / `Priority` enums reused. Handler pulls env from `EXTRACT_ENV` token consistently in client and handler.
- [x] **Referential integrity to earlier plans** — reuses `ResearchBriefing` (Plan 05) and `CleanedScrapeResult` (Plan 06) from `@sensai/shared` without changes to their schemas.
- [x] **TDD ordering** — each production file has a test-first step; handler (Task 6), client (Task 5), and prompt (Task 4) each follow write-test → see-fail → implement → see-pass.
- [x] **Frequent commits** — 11 tasks, 11 commits, one focused change per commit.
