# Plan 11 — Knowledge Graph Assembly Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `tool.kg.assemble` step that **deterministically** merges the outputs of `tool.entity.extract` (Plan 09) and `tool.content.extract` (Plan 07) into a single `KnowledgeGraph` JSON object — entities, relationships (with resolved entity names), facts, data points, ideations, and an aggregated `meta` block. **No LLM calls. No semantic deduplication. No external tools.** Pure in-memory transformation. Lesson 2.9 scope, "wariant A" from the brainstorm.

**Architecture:** Pure-function module `tools/kg-assembler/kg-assembler.ts` exposing a single `assemble(input)` function plus typed helpers (`resolveRelationships`, `computeMainEntity`, `formatMeasurables`). The handler `KGAssemblyHandler` reads `previousOutputs.entities` (required, `EntityExtractionResult` from Plan 09) and `previousOutputs.extract` (required, `ExtractionResult` from Plan 07), calls `assemble()`, and returns the typed `KnowledgeGraph`. No DB cache (output is deterministic and re-derivable in milliseconds), no env vars, no DI tokens beyond the handler itself. Invalid relationships (referencing entity IDs not present in `entities[]`) are dropped and surfaced as `warnings[]` in the output (audit trail, lesson §"Weryfikacja i sanity check").

**Tech Stack:** TypeScript / NestJS / Zod / Vitest. No new runtime dependencies.

**Spec sources:**
- Lesson notes: `docs/edu/lekcja-2-9/lekcja-2.9-budowanie-grafu-wiedzy.md`
- Reference Python pipeline: `docs/edu/lekcja-2-9/T2F9_graf_wiedzy.py` (lines 219–308 — main assembly, 263–279 — main_entity heuristic)
- JSON schema target: `docs/edu/lekcja-2-9/T2F9_przyklad_JSON_grafu_wiedzy.json`

---

**Critical gotcha 1 — Shared package build:** `packages/shared` must be **built to `dist/`** after every change to `schemas.ts` (`pnpm --filter @sensai/shared build`). The API imports from compiled `dist`, not `src`. Every task that touches `packages/shared/src/schemas.ts` must end with a build step.

**Critical gotcha 2 — `previousOutputs` keys follow step keys, not types:** Templates use `{ key: "entities", type: "tool.entity.extract" }` and `{ key: "extract", type: "tool.content.extract" }`. The orchestrator exposes outputs under **step keys**, so the handler reads `ctx.previousOutputs.entities` and `ctx.previousOutputs.extract`. **Both are required** — fail closed if either is missing or fails Zod parse.

**Critical gotcha 3 — Field-name mismatch lesson vs. our schema:** The lesson uses `entities_relationships` / `entity_id2text` / `measurables`. Our upstream Plan 09 emits `relationships` with `source`/`target` (entity IDs). We **preserve our names** in the KG output (downstream LLM consumers can re-shape if needed). We **enrich** each relationship with `sourceName`/`targetName` resolved from entities, which is the lesson's `entity_id2text` equivalent. We rename Plan 07's `data` → `measurables` in the KG output to align with the lesson terminology, since the field is end-user facing.

**Critical gotcha 4 — Pure handler, no `ToolCacheService`:** Other handlers (`content-extract`, `entity-extract`, `query-fanout`) wrap their work in `ToolCacheService.getOrSet` because each call costs money/latency. KG assembly is deterministic and milliseconds — caching it would add DB round-trips for no benefit. Follow the `BriefHandler` pattern (no cache, no env token), but without LLM.

**Critical gotcha 5 — Audit trail format:** Dropped relationships (e.g. `{ source: "E99", target: "E1" }` where `E99` was never emitted) must be logged via `Logger.warn` AND surfaced in the output's `warnings[]` array. Do not throw — the rest of the graph is still valid. The Plan 09 `superRefine` already enforces graph integrity at extraction time, so in practice `warnings[]` should be empty; treat any non-empty warnings as a signal that upstream changed.

**Critical gotcha 6 — `main_entity` heuristic:** Lesson Python script (lines 263–279) picks the entity with the **most relationship edges** (counting both source and target). On a tie, picks deterministically (lowest entity ID, e.g. `E1` < `E2`). If `entities[]` is non-empty but `relationships[]` is empty, fall back to the first entity by ID. **Never** hard-code a domain term like `"Kortyzol"` — the lesson script does this as a last-resort fallback for keyword-specific demos and we don't want it.

**Critical gotcha 7 — `category` is `""`:** Per user direction during brainstorming. Do not generate, do not infer. Empty string. Future plans may add this if needed.

---

## File Structure

```
apps/api/src/
├── tools/kg-assembler/                     (NEW)
│   └── kg-assembler.ts                     Pure assembly functions (no DI, no NestJS)
├── handlers/
│   └── kg-assembly.handler.ts              (NEW) StepHandler for "tool.kg.assemble"
├── handlers/handlers.module.ts             (MODIFY) Register KGAssemblyHandler
├── seed/seed.ts                            (MODIFY) Add new template "Blog SEO — fanout + ... + KG"
└── tests/
    ├── kg-assembler.test.ts                Pure-function unit tests
    └── kg-assembly.handler.test.ts         Handler test (mocked previousOutputs)

packages/shared/src/schemas.ts              (MODIFY) Append KGMeta, KGRelationship, KGMeasurable,
                                                     KGAssemblyWarning, KnowledgeGraph

apps/web/src/components/step-output/
├── kg.tsx                                  (NEW) KGOutput renderer (counts + collapsible JSON tabs)
└── index.tsx                               (MODIFY) Route "tool.kg.assemble" + hasRichRenderer

scripts/smoke-plan-11.ts                    (NEW) Fixture-based end-to-end smoke
package.json (root)                         (MODIFY) Add "smoke:plan-11" script
```

No new env vars. No new DI tokens. No new dependencies in any `package.json`.

---

## Task 1: Shared schemas for KnowledgeGraph

**Files:**
- Modify: `packages/shared/src/schemas.ts` (append at end)
- Build: `packages/shared` (must produce `dist/`)

No unit test for pure Zod schemas — runtime tests in later tasks exercise them.

- [ ] **Step 1: Append new schemas to `packages/shared/src/schemas.ts`**

Open `packages/shared/src/schemas.ts` and append at the very end (after the last existing export, currently `FanOutPaaCall`):

```ts
// ===== Plan 11 — Knowledge Graph Assembly =====

export const KGCounts = z.object({
  entities: z.number().int().nonnegative(),
  relationships: z.number().int().nonnegative(),
  facts: z.number().int().nonnegative(),
  measurables: z.number().int().nonnegative(),
  ideations: z.number().int().nonnegative(),
});
export type KGCounts = z.infer<typeof KGCounts>;

export const KGMeta = z.object({
  mainKeyword: z.string().min(1),
  mainEntity: z.string(),
  category: z.string(),
  language: z.string().min(2).max(10),
  generatedAt: z.string().datetime(),
  counts: KGCounts,
});
export type KGMeta = z.infer<typeof KGMeta>;

export const KGRelationship = EntityRelation.extend({
  sourceName: z.string().min(1),
  targetName: z.string().min(1),
});
export type KGRelationship = z.infer<typeof KGRelationship>;

export const KGMeasurable = DataPoint.extend({
  formatted: z.string().min(1),
});
export type KGMeasurable = z.infer<typeof KGMeasurable>;

export const KGAssemblyWarning = z.object({
  kind: z.enum([
    "relationship_unknown_source",
    "relationship_unknown_target",
    "relationship_self_edge",
    "duplicate_entity_id",
  ]),
  message: z.string().min(1),
  context: z.record(z.string()).default({}),
});
export type KGAssemblyWarning = z.infer<typeof KGAssemblyWarning>;

export const KnowledgeGraph = z.object({
  meta: KGMeta,
  entities: Entity.array(),
  relationships: KGRelationship.array(),
  facts: Fact.array(),
  measurables: KGMeasurable.array(),
  ideations: Ideation.array(),
  warnings: KGAssemblyWarning.array(),
});
export type KnowledgeGraph = z.infer<typeof KnowledgeGraph>;
```

- [ ] **Step 2: Build the shared package**

Run: `pnpm --filter @sensai/shared build`
Expected: tsc emits `packages/shared/dist/schemas.js` and `packages/shared/dist/schemas.d.ts` with no errors.

- [ ] **Step 3: Verify exports are reachable**

Run: `node --eval "console.log(Object.keys(require('./packages/shared/dist/index.js')).filter(k => k.startsWith('KG') || k === 'KnowledgeGraph'))"`
Expected: prints `[ 'KGCounts', 'KGMeta', 'KGRelationship', 'KGMeasurable', 'KGAssemblyWarning', 'KnowledgeGraph' ]` (or the same names in any order).

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/schemas.ts packages/shared/dist
git commit -m "feat(shared): add KnowledgeGraph schemas for Plan 11"
```

---

## Task 2: Pure assembler — `kg-assembler.ts` (TDD)

**Files:**
- Create: `apps/api/src/tools/kg-assembler/kg-assembler.ts`
- Test: `apps/api/src/tests/kg-assembler.test.ts`

The assembler is a single exported `assemble()` function plus internal helpers. No NestJS, no Logger, no I/O. All inputs are passed in; all outputs are returned. Pure transformation = trivially testable.

- [ ] **Step 1: Create the test file with the first failing test**

Create `apps/api/src/tests/kg-assembler.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { assemble, computeMainEntity, formatMeasurable } from "../tools/kg-assembler/kg-assembler";
import type {
  EntityExtractionResult,
  ExtractionResult,
} from "@sensai/shared";

const baseExtraction = (): ExtractionResult => ({
  metadata: {
    keyword: "kortyzol",
    language: "pl",
    sourceUrlCount: 2,
    createdAt: "2026-04-28T10:00:00.000Z",
  },
  facts: [
    { id: "F1", text: "Kortyzol jest wytwarzany przez nadnercza.", category: "definition", priority: "high", confidence: 0.95, sourceUrls: [] },
    { id: "F2", text: "Stres podnosi poziom kortyzolu.", category: "causal", priority: "medium", confidence: 0.9, sourceUrls: [] },
    { id: "F3", text: "Sen reguluje kortyzol.", category: "general", priority: "medium", confidence: 0.85, sourceUrls: [] },
    { id: "F4", text: "Magnez wspiera obniżenie kortyzolu.", category: "general", priority: "low", confidence: 0.7, sourceUrls: [] },
    { id: "F5", text: "Kortyzol jest najwyższy rano.", category: "general", priority: "medium", confidence: 0.8, sourceUrls: [] },
  ],
  data: [
    { id: "D1", definition: "Norma kortyzolu rano", value: "10-20", unit: "µg/dL", sourceUrls: [] },
    { id: "D2", definition: "Zalecany sen", value: "7-9", unit: "h", sourceUrls: [] },
    { id: "D3", definition: "Aktywność fizyczna", value: "150", unit: "min/tydz", sourceUrls: [] },
  ],
  ideations: [
    { id: "I1", type: "checklist", title: "Jak obniżyć kortyzol", description: "Plan tygodniowy", audience: "", channels: [], keywords: [], priority: "high" },
    { id: "I2", type: "info_box", title: "Sen a kortyzol", description: "Krótki opis", audience: "", channels: [], keywords: [], priority: "medium" },
    { id: "I3", type: "habit", title: "Poranna rutyna", description: "Rytuały na rano", audience: "", channels: [], keywords: [], priority: "low" },
  ],
});

const baseEntities = (): EntityExtractionResult => ({
  metadata: {
    keyword: "kortyzol",
    language: "pl",
    sourceUrlCount: 2,
    createdAt: "2026-04-28T10:00:00.000Z",
  },
  contextAnalysis: {
    mainTopicInterpretation: "Obniżanie kortyzolu po 40",
    domainSummary: "Endokrynologia, lifestyle",
    notes: "",
  },
  entities: [
    { id: "E1", originalSurface: "kortyzol", entity: "kortyzol", domainType: "CONCEPT", evidence: "Hormon stresu" },
    { id: "E2", originalSurface: "nadnercza", entity: "nadnercza", domainType: "CONCEPT", evidence: "Gruczoły wydzielania wewnętrznego" },
    { id: "E3", originalSurface: "stres", entity: "stres", domainType: "CONCEPT", evidence: "Stan napięcia" },
  ],
  relationships: [
    { source: "E2", target: "E1", type: "CREATED_BY", description: "nadnercza produkują kortyzol", evidence: "..." },
    { source: "E3", target: "E1", type: "REQUIRES", description: "stres podnosi kortyzol", evidence: "..." },
    { source: "E1", target: "E2", type: "CONNECTED_TO", description: "kortyzol jest powiązany z nadnerczami", evidence: "..." },
  ],
  relationToMain: [
    { entityId: "E1", score: 100, rationale: "główny temat" },
    { entityId: "E2", score: 80, rationale: "produkuje kortyzol" },
    { entityId: "E3", score: 70, rationale: "wpływa na poziom" },
  ],
});

describe("computeMainEntity", () => {
  it("returns the entity name with the most edges (source+target degree)", () => {
    const e = baseEntities();
    expect(computeMainEntity(e.entities, e.relationships)).toBe("kortyzol");
  });

  it("breaks ties by lowest entity id", () => {
    const entities = [
      { id: "E1", originalSurface: "a", entity: "a", domainType: "CONCEPT" as const, evidence: "x" },
      { id: "E2", originalSurface: "b", entity: "b", domainType: "CONCEPT" as const, evidence: "x" },
    ];
    const relationships = [
      { source: "E1", target: "E2", type: "RELATED_TO" as const, description: "d", evidence: "e" },
    ];
    expect(computeMainEntity(entities, relationships)).toBe("a");
  });

  it("falls back to first entity by id when relationships are empty", () => {
    const entities = [
      { id: "E2", originalSurface: "b", entity: "b", domainType: "CONCEPT" as const, evidence: "x" },
      { id: "E1", originalSurface: "a", entity: "a", domainType: "CONCEPT" as const, evidence: "x" },
    ];
    expect(computeMainEntity(entities, [])).toBe("a");
  });

  it("returns empty string when entities are empty", () => {
    expect(computeMainEntity([], [])).toBe("");
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `pnpm --filter @sensai/api vitest run src/tests/kg-assembler.test.ts`
Expected: FAIL with "Cannot find module '../tools/kg-assembler/kg-assembler'".

- [ ] **Step 3: Create the module skeleton**

Create `apps/api/src/tools/kg-assembler/kg-assembler.ts`:

```ts
import type {
  Entity,
  EntityRelation,
  EntityExtractionResult,
  ExtractionResult,
  KnowledgeGraph,
  KGAssemblyWarning,
  KGMeasurable,
  KGRelationship,
  DataPoint,
} from "@sensai/shared";

export interface AssembleInput {
  keyword: string;
  language: string;
  entities: EntityExtractionResult;
  extract: ExtractionResult;
}

export function computeMainEntity(
  entities: Entity[],
  relationships: EntityRelation[],
): string {
  if (entities.length === 0) return "";
  const sorted = [...entities].sort((a, b) => idNum(a.id) - idNum(b.id));
  if (relationships.length === 0) return sorted[0].entity;
  const degree = new Map<string, number>();
  for (const e of entities) degree.set(e.id, 0);
  for (const r of relationships) {
    degree.set(r.source, (degree.get(r.source) ?? 0) + 1);
    degree.set(r.target, (degree.get(r.target) ?? 0) + 1);
  }
  let best = sorted[0];
  for (const e of sorted) {
    if ((degree.get(e.id) ?? 0) > (degree.get(best.id) ?? 0)) best = e;
  }
  return best.entity;
}

function idNum(id: string): number {
  const m = id.match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}
```

- [ ] **Step 4: Run test — should pass for `computeMainEntity` block, fail on missing `assemble`/`formatMeasurable` imports**

Run: `pnpm --filter @sensai/api vitest run src/tests/kg-assembler.test.ts`
Expected: 4 `computeMainEntity` tests PASS. The file still imports `assemble` and `formatMeasurable` so TS compile fails with "has no exported member" — that's expected; we'll add them in Step 5.

- [ ] **Step 5: Add `formatMeasurable` and a test, then re-run**

Append to the test file (after the `computeMainEntity` describe block):

```ts
describe("formatMeasurable", () => {
  it("formats with unit", () => {
    const dp: DataPoint = { id: "D1", definition: "Norma snu", value: "7-9", unit: "h", sourceUrls: [] };
    expect(formatMeasurable(dp)).toBe("Norma snu - [7-9][h]");
  });

  it("omits unit bracket when unit is null", () => {
    const dp: DataPoint = { id: "D2", definition: "Wskaźnik", value: "42", unit: null, sourceUrls: [] };
    expect(formatMeasurable(dp)).toBe("Wskaźnik - [42]");
  });
});
```

Append to `kg-assembler.ts`:

```ts
export function formatMeasurable(dp: DataPoint): string {
  return dp.unit ? `${dp.definition} - [${dp.value}][${dp.unit}]` : `${dp.definition} - [${dp.value}]`;
}
```

Add the `DataPoint` import line at the top of the test file:

```ts
import type { DataPoint } from "@sensai/shared";
```

Run: `pnpm --filter @sensai/api vitest run src/tests/kg-assembler.test.ts`
Expected: all 6 tests pass; `assemble` import still unresolved.

- [ ] **Step 6: Add `resolveRelationships` test**

Append to the test file:

```ts
describe("assemble — relationships resolution", () => {
  it("enriches each relationship with sourceName and targetName", () => {
    const e = baseEntities();
    const x = baseExtraction();
    const kg = assemble({ keyword: "kortyzol", language: "pl", entities: e, extract: x });
    expect(kg.relationships).toHaveLength(3);
    const r0 = kg.relationships[0];
    expect(r0.source).toBe("E2");
    expect(r0.sourceName).toBe("nadnercza");
    expect(r0.target).toBe("E1");
    expect(r0.targetName).toBe("kortyzol");
  });

  it("drops relationships with unknown source/target and emits a warning", () => {
    const e = baseEntities();
    e.relationships.push({
      source: "E99",
      target: "E1",
      type: "RELATED_TO",
      description: "ghost",
      evidence: "—",
    });
    const x = baseExtraction();
    const kg = assemble({ keyword: "kortyzol", language: "pl", entities: e, extract: x });
    expect(kg.relationships).toHaveLength(3);
    expect(kg.warnings).toHaveLength(1);
    expect(kg.warnings[0].kind).toBe("relationship_unknown_source");
    expect(kg.warnings[0].context.source).toBe("E99");
  });

  it("drops self-edges and emits a warning", () => {
    const e = baseEntities();
    e.relationships.push({
      source: "E1",
      target: "E1",
      type: "RELATED_TO",
      description: "loop",
      evidence: "—",
    });
    const x = baseExtraction();
    const kg = assemble({ keyword: "kortyzol", language: "pl", entities: e, extract: x });
    expect(kg.warnings.find((w) => w.kind === "relationship_self_edge")).toBeDefined();
    expect(kg.relationships).toHaveLength(3);
  });
});
```

- [ ] **Step 7: Implement `assemble` and `resolveRelationships`**

Append to `kg-assembler.ts`:

```ts
export interface ResolveResult {
  relationships: KGRelationship[];
  warnings: KGAssemblyWarning[];
}

export function resolveRelationships(
  entities: Entity[],
  relationships: EntityRelation[],
): ResolveResult {
  const byId = new Map(entities.map((e) => [e.id, e.entity]));
  const out: KGRelationship[] = [];
  const warnings: KGAssemblyWarning[] = [];
  for (const r of relationships) {
    if (r.source === r.target) {
      warnings.push({
        kind: "relationship_self_edge",
        message: `relationship is a self-edge on ${r.source}`,
        context: { source: r.source, target: r.target, type: r.type },
      });
      continue;
    }
    const sourceName = byId.get(r.source);
    const targetName = byId.get(r.target);
    if (!sourceName) {
      warnings.push({
        kind: "relationship_unknown_source",
        message: `relationship source ${r.source} not in entities[]`,
        context: { source: r.source, target: r.target, type: r.type },
      });
      continue;
    }
    if (!targetName) {
      warnings.push({
        kind: "relationship_unknown_target",
        message: `relationship target ${r.target} not in entities[]`,
        context: { source: r.source, target: r.target, type: r.type },
      });
      continue;
    }
    out.push({ ...r, sourceName, targetName });
  }
  return { relationships: out, warnings };
}

export function assemble(input: AssembleInput): KnowledgeGraph {
  const { keyword, language, entities, extract } = input;
  const ent = entities.entities;
  const { relationships: rels, warnings: relWarn } = resolveRelationships(
    ent,
    entities.relationships,
  );

  const dupWarn: KGAssemblyWarning[] = [];
  const seenIds = new Set<string>();
  for (const e of ent) {
    if (seenIds.has(e.id)) {
      dupWarn.push({
        kind: "duplicate_entity_id",
        message: `duplicate entity id ${e.id}`,
        context: { id: e.id, entity: e.entity },
      });
    }
    seenIds.add(e.id);
  }

  const measurables: KGMeasurable[] = extract.data.map((dp) => ({
    ...dp,
    formatted: formatMeasurable(dp),
  }));

  const facts = extract.facts;
  const ideations = extract.ideations;

  const mainEntity = computeMainEntity(ent, entities.relationships);

  return {
    meta: {
      mainKeyword: keyword,
      mainEntity,
      category: "",
      language,
      generatedAt: new Date().toISOString(),
      counts: {
        entities: ent.length,
        relationships: rels.length,
        facts: facts.length,
        measurables: measurables.length,
        ideations: ideations.length,
      },
    },
    entities: ent,
    relationships: rels,
    facts,
    measurables,
    ideations,
    warnings: [...relWarn, ...dupWarn],
  };
}
```

- [ ] **Step 8: Run all tests — they should pass**

Run: `pnpm --filter @sensai/api vitest run src/tests/kg-assembler.test.ts`
Expected: 9 tests pass.

- [ ] **Step 9: Add a counts/meta integration test**

Append:

```ts
describe("assemble — meta and counts", () => {
  it("populates counts from inputs", () => {
    const e = baseEntities();
    const x = baseExtraction();
    const kg = assemble({ keyword: "kortyzol", language: "pl", entities: e, extract: x });
    expect(kg.meta.counts).toEqual({
      entities: 3,
      relationships: 3,
      facts: 5,
      measurables: 3,
      ideations: 3,
    });
    expect(kg.meta.mainKeyword).toBe("kortyzol");
    expect(kg.meta.language).toBe("pl");
    expect(kg.meta.category).toBe("");
    expect(kg.meta.mainEntity).toBe("kortyzol");
    expect(() => new Date(kg.meta.generatedAt).toISOString()).not.toThrow();
  });

  it("validates against the KnowledgeGraph zod schema", async () => {
    const { KnowledgeGraph } = await import("@sensai/shared");
    const e = baseEntities();
    const x = baseExtraction();
    const kg = assemble({ keyword: "kortyzol", language: "pl", entities: e, extract: x });
    const parsed = KnowledgeGraph.safeParse(kg);
    expect(parsed.success).toBe(true);
  });
});
```

- [ ] **Step 10: Run tests — verify**

Run: `pnpm --filter @sensai/api vitest run src/tests/kg-assembler.test.ts`
Expected: 11 tests pass.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/tools/kg-assembler/kg-assembler.ts apps/api/src/tests/kg-assembler.test.ts
git commit -m "feat(api): add KG assembler pure functions"
```

---

## Task 3: KGAssemblyHandler

**Files:**
- Create: `apps/api/src/handlers/kg-assembly.handler.ts`
- Test: `apps/api/src/tests/kg-assembly.handler.test.ts`

- [ ] **Step 1: Write the failing handler test**

Create `apps/api/src/tests/kg-assembly.handler.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { KGAssemblyHandler } from "../handlers/kg-assembly.handler";
import type {
  EntityExtractionResult,
  ExtractionResult,
  RunInput,
} from "@sensai/shared";

const buildExtract = (): ExtractionResult => ({
  metadata: {
    keyword: "kortyzol",
    language: "pl",
    sourceUrlCount: 2,
    createdAt: "2026-04-28T10:00:00.000Z",
  },
  facts: Array.from({ length: 5 }, (_, i) => ({
    id: `F${i + 1}`,
    text: `Fact ${i + 1}`,
    category: "general" as const,
    priority: "medium" as const,
    confidence: 0.8,
    sourceUrls: [],
  })),
  data: [
    { id: "D1", definition: "Norma", value: "7-9", unit: "h", sourceUrls: [] },
    { id: "D2", definition: "Wskaźnik", value: "42", unit: null, sourceUrls: [] },
    { id: "D3", definition: "Próg", value: "100", unit: "mg", sourceUrls: [] },
  ],
  ideations: Array.from({ length: 3 }, (_, i) => ({
    id: `I${i + 1}`,
    type: "checklist" as const,
    title: `Idea ${i + 1}`,
    description: "desc",
    audience: "",
    channels: [],
    keywords: [],
    priority: "medium" as const,
  })),
});

const buildEntities = (): EntityExtractionResult => ({
  metadata: {
    keyword: "kortyzol",
    language: "pl",
    sourceUrlCount: 2,
    createdAt: "2026-04-28T10:00:00.000Z",
  },
  contextAnalysis: {
    mainTopicInterpretation: "x",
    domainSummary: "y",
    notes: "",
  },
  entities: Array.from({ length: 8 }, (_, i) => ({
    id: `E${i + 1}`,
    originalSurface: `e${i + 1}`,
    entity: `e${i + 1}`,
    domainType: "CONCEPT" as const,
    evidence: "evidence",
  })),
  relationships: [
    { source: "E1", target: "E2", type: "RELATED_TO" as const, description: "d", evidence: "e" },
    { source: "E2", target: "E3", type: "RELATED_TO" as const, description: "d", evidence: "e" },
    { source: "E1", target: "E3", type: "RELATED_TO" as const, description: "d", evidence: "e" },
  ],
  relationToMain: Array.from({ length: 8 }, (_, i) => ({
    entityId: `E${i + 1}`,
    score: 50,
    rationale: "r",
  })),
});

const baseCtx = (entities: unknown, extract: unknown) =>
  ({
    run: {
      id: "run-1",
      input: {
        topic: "jak obniżyć kortyzol po 40",
        mainKeyword: "kortyzol",
        intent: "informational",
      } satisfies RunInput,
    },
    step: { id: "step-kg" },
    project: { id: "p", config: {} },
    previousOutputs: { entities, extract },
    attempt: 1,
  }) as any;

describe("KGAssemblyHandler", () => {
  it("declares the correct step type", () => {
    const h = new KGAssemblyHandler();
    expect(h.type).toBe("tool.kg.assemble");
  });

  it("assembles a KnowledgeGraph from entities + extract", async () => {
    const h = new KGAssemblyHandler();
    const result = await h.execute(baseCtx(buildEntities(), buildExtract()));
    const kg = result.output as any;
    expect(kg.meta.counts.entities).toBe(8);
    expect(kg.meta.counts.relationships).toBe(3);
    expect(kg.meta.counts.facts).toBe(5);
    expect(kg.meta.counts.measurables).toBe(3);
    expect(kg.meta.counts.ideations).toBe(3);
    expect(kg.meta.mainKeyword).toMatch(/jak obniżyć kortyzol po 40/);
    expect(kg.meta.language).toBe("pl");
    expect(kg.meta.category).toBe("");
    expect(kg.warnings).toEqual([]);
  });

  it("throws when previousOutputs.entities is missing", async () => {
    const h = new KGAssemblyHandler();
    await expect(h.execute(baseCtx(undefined, buildExtract()))).rejects.toThrow(
      /requires previousOutputs\.entities/,
    );
  });

  it("throws when previousOutputs.extract is missing", async () => {
    const h = new KGAssemblyHandler();
    await expect(h.execute(baseCtx(buildEntities(), undefined))).rejects.toThrow(
      /requires previousOutputs\.extract/,
    );
  });

  it("throws when entities fails Zod parse", async () => {
    const h = new KGAssemblyHandler();
    await expect(
      h.execute(baseCtx({ entities: "not-an-object" }, buildExtract())),
    ).rejects.toThrow();
  });

  it("composes meta.language from entities metadata", async () => {
    const h = new KGAssemblyHandler();
    const e = buildEntities();
    e.metadata.language = "en";
    const result = await h.execute(baseCtx(e, buildExtract()));
    expect((result.output as any).meta.language).toBe("en");
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `pnpm --filter @sensai/api vitest run src/tests/kg-assembly.handler.test.ts`
Expected: FAIL with "Cannot find module '../handlers/kg-assembly.handler'".

- [ ] **Step 3: Create the handler**

Create `apps/api/src/handlers/kg-assembly.handler.ts`:

```ts
import { Injectable, Logger } from "@nestjs/common";
import type { StepContext, StepHandler, StepResult } from "../orchestrator/step-handler";
import {
  EntityExtractionResult,
  ExtractionResult,
  type RunInput,
} from "@sensai/shared";
import { assemble } from "../tools/kg-assembler/kg-assembler";

@Injectable()
export class KGAssemblyHandler implements StepHandler {
  readonly type = "tool.kg.assemble";
  private readonly logger = new Logger(KGAssemblyHandler.name);

  async execute(ctx: StepContext): Promise<StepResult> {
    const prevEntities = ctx.previousOutputs.entities;
    if (prevEntities === undefined || prevEntities === null) {
      throw new Error("kg.assemble requires previousOutputs.entities");
    }
    const prevExtract = ctx.previousOutputs.extract;
    if (prevExtract === undefined || prevExtract === null) {
      throw new Error("kg.assemble requires previousOutputs.extract");
    }

    const entities = EntityExtractionResult.parse(prevEntities);
    const extract = ExtractionResult.parse(prevExtract);

    const keyword = this.composeKeyword(ctx.run.input as RunInput);
    const language = entities.metadata.language;

    const kg = assemble({ keyword, language, entities, extract });

    if (kg.warnings.length > 0) {
      this.logger.warn(
        { runId: ctx.run.id, stepId: ctx.step.id, warnings: kg.warnings },
        `kg.assemble: ${kg.warnings.length} warnings during assembly`,
      );
    }

    this.logger.log(
      {
        entities: kg.meta.counts.entities,
        relationships: kg.meta.counts.relationships,
        facts: kg.meta.counts.facts,
        measurables: kg.meta.counts.measurables,
        ideations: kg.meta.counts.ideations,
        warnings: kg.warnings.length,
      },
      "kg-assemble done",
    );

    return { output: kg };
  }

  private composeKeyword(input: RunInput): string {
    let kw = input.topic;
    if (input.mainKeyword) kw += ` (${input.mainKeyword})`;
    if (input.intent) kw += ` — ${input.intent}`;
    return kw;
  }
}
```

- [ ] **Step 4: Run tests — should pass**

Run: `pnpm --filter @sensai/api vitest run src/tests/kg-assembly.handler.test.ts`
Expected: 6 tests pass.

- [ ] **Step 5: Run the full API test suite to confirm nothing else broke**

Run: `pnpm --filter @sensai/api vitest run`
Expected: all tests pass (full suite green).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/handlers/kg-assembly.handler.ts apps/api/src/tests/kg-assembly.handler.test.ts
git commit -m "feat(api): add KGAssemblyHandler for tool.kg.assemble"
```

---

## Task 4: Wire `KGAssemblyHandler` into `HandlersModule`

**Files:**
- Modify: `apps/api/src/handlers/handlers.module.ts`

- [ ] **Step 1: Register the new handler**

Open `apps/api/src/handlers/handlers.module.ts` and apply three changes.

Change A — add the import (after the existing `QueryFanOutHandler` import):

```ts
import { QueryFanOutHandler } from "./query-fanout.handler";
import { KGAssemblyHandler } from "./kg-assembly.handler";
```

Change B — add to the `providers` array (after `QueryFanOutHandler`):

```ts
    QueryFanOutHandler,
    KGAssemblyHandler,
```

Change C — extend the `STEP_HANDLERS` factory and `inject` arrays:

```ts
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
        fanout: QueryFanOutHandler,
        kg: KGAssemblyHandler,
      ): StepHandler[] => [brief, serp, scrape, youcom, clean, extract, entities, fanout, kg],
      inject: [
        BriefHandler,
        SerpFetchHandler,
        ScrapeFetchHandler,
        YoucomResearchHandler,
        ContentCleanHandler,
        ContentExtractHandler,
        EntityExtractHandler,
        QueryFanOutHandler,
        KGAssemblyHandler,
      ],
    },
```

- [ ] **Step 2: Build the API to verify wiring compiles**

Run: `pnpm --filter @sensai/api build`
Expected: tsc emits with no errors.

- [ ] **Step 3: Boot the API in dev to verify NestJS DI succeeds**

Run (background terminal): `pnpm --filter @sensai/api dev`
Expected: log line `pipeline worker initialized` appears, no DI errors. Stop the process.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/handlers/handlers.module.ts
git commit -m "feat(api): register KGAssemblyHandler in HandlersModule"
```

---

## Task 5: Seed template — KG-enabled pipeline

**Files:**
- Modify: `apps/api/src/seed/seed.ts`

The new template adds `kg` as the LAST step before `brief`, depending on `extract` and `entities`. Lower-priority steps in the existing fanout template stay; we add a sibling template so existing runs are not affected.

- [ ] **Step 1: Add the new template after `blogSeoFanout`**

Open `apps/api/src/seed/seed.ts`. After the `blogSeoFanout` block (currently ending around line 128), add:

```ts
  // Plan 11 — KG assembly. Depends on entities + extract; brief now consumes kg instead of extract directly.
  const blogSeoKg = await upsertTemplate(
    db,
    "Blog SEO — fanout + deep research + clean + extract + entities + KG",
    1,
    {
      steps: [
        { key: "fanout",       type: "tool.query.fanout",   auto: true,  dependsOn: [] },
        { key: "deepResearch", type: "tool.youcom.research", auto: true, dependsOn: [] },
        { key: "research",     type: "tool.serp.fetch",     auto: true,  dependsOn: [] },
        { key: "scrape",       type: "tool.scrape",         auto: false, dependsOn: ["research"] },
        { key: "clean",        type: "tool.content.clean",  auto: true,  dependsOn: ["scrape"] },
        { key: "extract",      type: "tool.content.extract", auto: true, dependsOn: ["clean", "deepResearch"] },
        { key: "entities",     type: "tool.entity.extract", auto: true,  dependsOn: ["clean", "deepResearch"] },
        { key: "kg",           type: "tool.kg.assemble",    auto: true,  dependsOn: ["extract", "entities"] },
        { key: "brief",        type: "llm.brief",           auto: true,  dependsOn: ["kg"] },
      ],
    },
  );
```

- [ ] **Step 2: Add the log line at the bottom**

After the existing `console.log` for `blogSeoFanout` (currently around line 140), add:

```ts
  console.log(`    "${blogSeoKg.name}" v${blogSeoKg.version}: ${blogSeoKg.id}`);
```

- [ ] **Step 3: Run seed against local DB**

Run: `pnpm --filter @sensai/api seed`
Expected: prints all template IDs, including the new `Blog SEO — ... + KG` v1, with no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/seed/seed.ts
git commit -m "feat(api): seed template with kg.assemble step"
```

---

## Task 6: Web UI — `KGOutput` component

**Files:**
- Create: `apps/web/src/components/step-output/kg.tsx`
- Modify: `apps/web/src/components/step-output/index.tsx`

The component shows a counts strip (Metric tiles) and three tabs: **Encje**, **Relacje**, **Pozostałe** (facts + measurables + ideations as subsections). Warnings, if any, render as a yellow callout above the tabs.

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/step-output/kg.tsx`:

```tsx
"use client";
import { useState } from "react";
import { EmptyOutput, Metric } from "./shared";

type KGShape = {
  meta: {
    mainKeyword: string;
    mainEntity: string;
    category: string;
    language: string;
    generatedAt: string;
    counts: {
      entities: number;
      relationships: number;
      facts: number;
      measurables: number;
      ideations: number;
    };
  };
  entities: Array<{ id: string; entity: string; domainType: string; evidence: string }>;
  relationships: Array<{
    source: string;
    target: string;
    sourceName: string;
    targetName: string;
    type: string;
    description: string;
  }>;
  facts: Array<{ id: string; text: string }>;
  measurables: Array<{ id: string; formatted: string }>;
  ideations: Array<{ id: string; title: string; description: string }>;
  warnings: Array<{ kind: string; message: string }>;
};

function isKG(v: unknown): v is KGShape {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    !!o.meta &&
    Array.isArray(o.entities) &&
    Array.isArray(o.relationships) &&
    Array.isArray(o.facts) &&
    Array.isArray(o.measurables) &&
    Array.isArray(o.ideations) &&
    Array.isArray(o.warnings)
  );
}

type Tab = "entities" | "relations" | "rest";

export function KGOutput({ value }: { value: unknown }) {
  const [tab, setTab] = useState<Tab>("entities");
  if (!isKG(value)) return <EmptyOutput label="KG: nieprawidłowa struktura" />;
  const kg = value;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Metric label="Encje" value={kg.meta.counts.entities} />
        <Metric label="Relacje" value={kg.meta.counts.relationships} />
        <Metric label="Fakty" value={kg.meta.counts.facts} />
        <Metric label="Dane" value={kg.meta.counts.measurables} />
        <Metric label="Pomysły" value={kg.meta.counts.ideations} />
      </div>

      <div className="text-sm text-muted-foreground">
        <div>
          <span className="font-medium">Główna encja:</span> {kg.meta.mainEntity || "—"}
        </div>
        <div>
          <span className="font-medium">Język:</span> {kg.meta.language}
        </div>
      </div>

      {kg.warnings.length > 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          <div className="font-medium">Ostrzeżenia ({kg.warnings.length}):</div>
          <ul className="ml-4 list-disc">
            {kg.warnings.map((w, i) => (
              <li key={i}>
                <span className="font-mono">{w.kind}</span>: {w.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-2 border-b">
        {(["entities", "relations", "rest"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-1 text-sm ${tab === t ? "border-b-2 border-primary font-medium" : "text-muted-foreground"}`}
          >
            {t === "entities" ? "Encje" : t === "relations" ? "Relacje" : "Pozostałe"}
          </button>
        ))}
      </div>

      {tab === "entities" && (
        <ul className="space-y-1 text-sm">
          {kg.entities.map((e) => (
            <li key={e.id} className="rounded border p-2">
              <div className="flex gap-2">
                <span className="font-mono text-xs text-muted-foreground">{e.id}</span>
                <span className="font-medium">{e.entity}</span>
                <span className="rounded bg-muted px-1 text-xs">{e.domainType}</span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{e.evidence}</div>
            </li>
          ))}
        </ul>
      )}

      {tab === "relations" && (
        <ul className="space-y-1 text-sm">
          {kg.relationships.map((r, i) => (
            <li key={i} className="rounded border p-2">
              <div className="font-mono text-xs">
                {r.sourceName} —[{r.type}]→ {r.targetName}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{r.description}</div>
            </li>
          ))}
        </ul>
      )}

      {tab === "rest" && (
        <div className="space-y-3 text-sm">
          <section>
            <h4 className="mb-1 font-medium">Fakty ({kg.facts.length})</h4>
            <ul className="ml-4 list-disc space-y-0.5">
              {kg.facts.map((f) => (
                <li key={f.id}>
                  <span className="font-mono text-xs text-muted-foreground">{f.id}</span> {f.text}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h4 className="mb-1 font-medium">Dane mierzalne ({kg.measurables.length})</h4>
            <ul className="ml-4 list-disc space-y-0.5">
              {kg.measurables.map((m) => (
                <li key={m.id}>
                  <span className="font-mono text-xs text-muted-foreground">{m.id}</span> {m.formatted}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h4 className="mb-1 font-medium">Pomysły ({kg.ideations.length})</h4>
            <ul className="ml-4 list-disc space-y-0.5">
              {kg.ideations.map((i) => (
                <li key={i.id}>
                  <span className="font-mono text-xs text-muted-foreground">{i.id}</span>{" "}
                  <span className="font-medium">{i.title}</span> — {i.description}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Register in `index.tsx`**

Open `apps/web/src/components/step-output/index.tsx`. Apply three changes.

Change A — add the import:

```tsx
import { ScrapeOutput } from "./scrape";
import { KGOutput } from "./kg";
```

Change B — add a case to the switch:

```tsx
    case "tool.query.fanout":
      return <QueryFanOutOutput value={value} />;
    case "tool.kg.assemble":
      return <KGOutput value={value} />;
```

Change C — add to `hasRichRenderer`:

```tsx
    type === "tool.query.fanout" ||
    type === "tool.kg.assemble"
  );
```

- [ ] **Step 3: Build the web app to verify TS**

Run: `pnpm --filter @sensai/web build`
Expected: Next.js build succeeds; no TS errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/step-output/kg.tsx apps/web/src/components/step-output/index.tsx
git commit -m "feat(web): add KGOutput renderer for tool.kg.assemble"
```

---

## Task 7: Smoke test — `smoke-plan-11.ts`

**Files:**
- Create: `scripts/smoke-plan-11.ts`
- Modify: `package.json` (root)

Smoke test follows the Plan 09 pattern (bypass NestJS DI, instantiate handler directly), but feeds it **fixture inputs** instead of running the full pipeline — KG assembly is deterministic and we don't need to spend money on a real LLM run to verify it.

- [ ] **Step 1: Create the smoke script**

Create `scripts/smoke-plan-11.ts`:

```ts
#!/usr/bin/env tsx
/**
 * Plan 11 manual smoke test — KG assembly.
 *
 * Loads two fixtures (Plan 07 ExtractionResult + Plan 09 EntityExtractionResult),
 * runs the handler, validates the resulting KnowledgeGraph against the Zod schema
 * and asserts the lesson-required fields are present.
 *
 * No API keys required — fully offline.
 *
 * Run: pnpm smoke:plan-11
 */
import "reflect-metadata";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { KGAssemblyHandler } from "../apps/api/src/handlers/kg-assembly.handler";
import { KnowledgeGraph } from "@sensai/shared";

async function main() {
  const fixturesDir = resolve(__dirname, "fixtures");
  const entities = JSON.parse(
    readFileSync(resolve(fixturesDir, "entity-extract-kortyzol.json"), "utf-8"),
  );
  const extract = JSON.parse(
    readFileSync(resolve(fixturesDir, "content-extract-kortyzol.json"), "utf-8"),
  );

  const handler = new KGAssemblyHandler();
  const ctx = {
    run: {
      id: `smoke-run-${Date.now()}`,
      input: {
        topic: "jak obniżyć kortyzol po 40",
        mainKeyword: "kortyzol",
        intent: "informational",
      },
    },
    project: { id: "smoke-project", config: {} },
    step: { id: "smoke-step-kg" },
    previousOutputs: { entities, extract },
    attempt: 1,
  } as any;

  const t0 = Date.now();
  const out: any = await handler.execute(ctx);
  const t1 = Date.now() - t0;
  const kg = out.output;

  console.log(`[smoke] kg.assemble: ${t1}ms`);
  console.log(`[smoke] mainEntity: ${kg.meta.mainEntity}`);
  console.log(
    `[smoke] counts: ${JSON.stringify(kg.meta.counts)}, warnings: ${kg.warnings.length}`,
  );

  const parsed = KnowledgeGraph.safeParse(kg);
  if (!parsed.success) {
    console.error("[smoke] FAIL: KnowledgeGraph schema violation");
    console.error(parsed.error.flatten());
    process.exit(1);
  }
  if (kg.meta.counts.entities !== entities.entities.length) {
    throw new Error(
      `entities count mismatch: ${kg.meta.counts.entities} vs ${entities.entities.length}`,
    );
  }
  if (kg.meta.counts.facts !== extract.facts.length) {
    throw new Error(
      `facts count mismatch: ${kg.meta.counts.facts} vs ${extract.facts.length}`,
    );
  }
  if (kg.meta.category !== "") {
    throw new Error(`category should be empty string, got: ${kg.meta.category}`);
  }
  if (!kg.meta.mainEntity) {
    throw new Error("mainEntity is empty");
  }
  for (const r of kg.relationships) {
    if (!r.sourceName || !r.targetName) {
      throw new Error(`relationship missing sourceName/targetName: ${JSON.stringify(r)}`);
    }
  }

  console.log(`[smoke] PASS — Plan 11 KG assembly works on fixtures`);
}

main().catch((e) => {
  console.error("[smoke] FAIL:", e);
  process.exit(1);
});
```

- [ ] **Step 2: Generate fixtures from real Plan 07/09 outputs**

Fixtures need to be REAL outputs from a previous run, frozen for offline use. Two options:

**Option A (preferred)** — re-use the smoke run from Plan 09. Run `pnpm smoke:plan-09` (requires API keys), then capture the printed result:

```bash
# Run Plan 09 smoke and tee output to a file
pnpm smoke:plan-09 2>&1 | tee /tmp/plan09-out.txt
```

Then manually craft the fixture by copying the printed `entities`, `relationships`, `relationToMain`, `metadata`, and `contextAnalysis` from the smoke output into JSON. Save as `scripts/fixtures/entity-extract-kortyzol.json`.

**Option B (faster)** — write a minimal valid fixture by hand. Both fixtures must satisfy Zod (≥5 facts, ≥3 data, ≥3 ideations for extract; ≥8 entities, ≥3 relationships, ≥8 relationToMain entries with score 1–100 for entities). Use the `buildExtract()` and `buildEntities()` helpers from Task 3's test file as a starting template — copy them into JSON, expanding to ≥8 entities and ≥5 relationships. Save under `scripts/fixtures/`.

For Plan 11 MVP, **use Option B** — the smoke is a sanity check, not a quality check. Keep fixtures hand-crafted and small (~50 lines each).

Concretely, create `scripts/fixtures/entity-extract-kortyzol.json`:

```json
{
  "metadata": {
    "keyword": "jak obniżyć kortyzol po 40 (kortyzol) — informational",
    "language": "pl",
    "sourceUrlCount": 3,
    "createdAt": "2026-04-28T10:00:00.000Z"
  },
  "contextAnalysis": {
    "mainTopicInterpretation": "Strategie obniżania kortyzolu u osób po 40 roku życia",
    "domainSummary": "Endokrynologia, lifestyle, sen, stres",
    "notes": ""
  },
  "entities": [
    { "id": "E1", "originalSurface": "kortyzol", "entity": "kortyzol", "domainType": "CONCEPT", "evidence": "Hormon stresu wytwarzany przez nadnercza" },
    { "id": "E2", "originalSurface": "nadnercza", "entity": "nadnercza", "domainType": "CONCEPT", "evidence": "Gruczoły wydzielania wewnętrznego" },
    { "id": "E3", "originalSurface": "stres", "entity": "stres", "domainType": "CONCEPT", "evidence": "Stan napięcia psychofizycznego" },
    { "id": "E4", "originalSurface": "sen", "entity": "sen", "domainType": "CONCEPT", "evidence": "Stan regeneracji organizmu" },
    { "id": "E5", "originalSurface": "magnez", "entity": "magnez", "domainType": "CONCEPT", "evidence": "Pierwiastek wspomagający układ nerwowy" },
    { "id": "E6", "originalSurface": "ashwagandha", "entity": "ashwagandha", "domainType": "PRODUCT", "evidence": "Adaptogen ziołowy" },
    { "id": "E7", "originalSurface": "aktywność fizyczna", "entity": "aktywność fizyczna", "domainType": "CONCEPT", "evidence": "Ruch i ćwiczenia" },
    { "id": "E8", "originalSurface": "medytacja", "entity": "medytacja", "domainType": "CONCEPT", "evidence": "Praktyka mentalna obniżająca napięcie" }
  ],
  "relationships": [
    { "source": "E2", "target": "E1", "type": "CREATED_BY", "description": "nadnercza produkują kortyzol", "evidence": "kora nadnerczy wytwarza kortyzol" },
    { "source": "E3", "target": "E1", "type": "REQUIRES", "description": "stres podnosi poziom kortyzolu", "evidence": "reakcja stresowa zwiększa kortyzol" },
    { "source": "E4", "target": "E1", "type": "RELATED_TO", "description": "sen reguluje poziom kortyzolu", "evidence": "niedobór snu zaburza rytm dobowy kortyzolu" },
    { "source": "E5", "target": "E1", "type": "SOLVES", "description": "magnez wspiera obniżenie kortyzolu", "evidence": "suplementacja magnezu" },
    { "source": "E6", "target": "E1", "type": "SOLVES", "description": "ashwagandha obniża kortyzol", "evidence": "badania kliniczne nad adaptogenami" }
  ],
  "relationToMain": [
    { "entityId": "E1", "score": 100, "rationale": "główny temat artykułu" },
    { "entityId": "E2", "score": 85, "rationale": "źródło hormonu" },
    { "entityId": "E3", "score": 90, "rationale": "główna przyczyna podwyższenia" },
    { "entityId": "E4", "score": 80, "rationale": "kluczowy modulator" },
    { "entityId": "E5", "score": 60, "rationale": "wspierająca suplementacja" },
    { "entityId": "E6", "score": 65, "rationale": "popularny adaptogen" },
    { "entityId": "E7", "score": 70, "rationale": "regulator stresu" },
    { "entityId": "E8", "score": 75, "rationale": "praktyka redukcji stresu" }
  ]
}
```

Create `scripts/fixtures/content-extract-kortyzol.json`:

```json
{
  "metadata": {
    "keyword": "jak obniżyć kortyzol po 40 (kortyzol) — informational",
    "language": "pl",
    "sourceUrlCount": 3,
    "createdAt": "2026-04-28T10:00:00.000Z"
  },
  "facts": [
    { "id": "F1", "text": "Kortyzol jest produkowany przez korę nadnerczy.", "category": "definition", "priority": "high", "confidence": 0.95, "sourceUrls": [] },
    { "id": "F2", "text": "Stres podnosi poziom kortyzolu.", "category": "causal", "priority": "high", "confidence": 0.92, "sourceUrls": [] },
    { "id": "F3", "text": "Sen reguluje rytm dobowy kortyzolu.", "category": "general", "priority": "high", "confidence": 0.9, "sourceUrls": [] },
    { "id": "F4", "text": "Magnez wspiera obniżanie kortyzolu.", "category": "general", "priority": "medium", "confidence": 0.8, "sourceUrls": [] },
    { "id": "F5", "text": "Aktywność fizyczna poprawia regulację kortyzolu.", "category": "causal", "priority": "medium", "confidence": 0.85, "sourceUrls": [] }
  ],
  "data": [
    { "id": "D1", "definition": "Norma kortyzolu rano", "value": "10-20", "unit": "µg/dL", "sourceUrls": [] },
    { "id": "D2", "definition": "Zalecana ilość snu", "value": "7-9", "unit": "h", "sourceUrls": [] },
    { "id": "D3", "definition": "Zalecana aktywność fizyczna", "value": "150", "unit": "min/tydz", "sourceUrls": [] }
  ],
  "ideations": [
    { "id": "I1", "type": "checklist", "title": "Tygodniowy plan obniżania kortyzolu", "description": "Lista rytuałów na każdy dzień", "audience": "", "channels": [], "keywords": [], "priority": "high" },
    { "id": "I2", "type": "info_box", "title": "Sen a kortyzol", "description": "Krótki info-box o roli snu", "audience": "", "channels": [], "keywords": [], "priority": "medium" },
    { "id": "I3", "type": "habit", "title": "Poranna rutyna", "description": "5 minut oddechu przed śniadaniem", "audience": "", "channels": [], "keywords": [], "priority": "medium" }
  ]
}
```

- [ ] **Step 3: Add npm script**

Open root `package.json`. After `"smoke:plan-10": ...` line, add:

```json
    "smoke:plan-11": "apps/api/node_modules/.bin/tsx --tsconfig apps/api/tsconfig.json scripts/smoke-plan-11.ts"
```

(Mind the trailing comma on the `smoke:plan-10` line.)

- [ ] **Step 4: Run the smoke**

Run: `pnpm smoke:plan-11`
Expected output (within ~50ms total):
```
[smoke] kg.assemble: <N>ms
[smoke] mainEntity: kortyzol
[smoke] counts: {"entities":8,"relationships":5,"facts":5,"measurables":3,"ideations":3}, warnings: 0
[smoke] PASS — Plan 11 KG assembly works on fixtures
```

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-plan-11.ts scripts/fixtures/entity-extract-kortyzol.json scripts/fixtures/content-extract-kortyzol.json package.json
git commit -m "test(api): add Plan 11 KG assembly smoke + fixtures"
```

---

## Task 8: End-to-end verification

Run the full pipeline against a live keyword to confirm KG assembly slots into the live orchestrator. **Requires API keys** in `apps/api/.env`.

- [ ] **Step 1: Boot the stack**

Open three terminals:

```bash
# Terminal A: API + worker
pnpm --filter @sensai/api dev

# Terminal B: web UI
pnpm --filter @sensai/web dev

# Terminal C: queue inspector (optional, for debugging)
pnpm tsx scripts/queue-inspect.ts
```

Wait for `pipeline worker initialized` in Terminal A.

- [ ] **Step 2: Trigger a run with the new template**

Open `http://localhost:3000` → create a project → select template `Blog SEO — fanout + deep research + clean + extract + entities + KG` v1 → run with input:

```json
{
  "topic": "jak obniżyć kortyzol po 40",
  "mainKeyword": "kortyzol",
  "intent": "informational"
}
```

- [ ] **Step 3: Verify the KG step completes**

In the run timeline:
- All upstream steps (fanout, deepResearch, research, scrape, clean, extract, entities) reach `completed`.
- `kg` reaches `completed` within ~1 second after both `extract` and `entities` finish.
- Click the `kg` step → confirm the `KGOutput` renderer shows: counts strip, main entity name, three tabs, no `warnings` block (or, if present, the warnings refer to genuinely problematic upstream data).
- `brief` then runs against `kg` and completes.

- [ ] **Step 4: Verify the KG content via the API directly**

```bash
# Replace <RUN_ID> and <KG_STEP_ID> with values from the UI URL
curl -s -H "Authorization: Bearer $API_BEARER_TOKEN" \
  "http://localhost:4000/runs/<RUN_ID>/steps/<KG_STEP_ID>" | jq '.output.meta'
```

Expected: `mainKeyword`, `mainEntity`, `category: ""`, `language`, `generatedAt`, populated `counts`.

- [ ] **Step 5: Manual re-run via Plan 08 cascade**

Click `kg` step → "Force re-run". Confirm: `kg` reruns, `brief` cascades and reruns. Upstream steps stay completed. KG output is identical (deterministic) modulo `meta.generatedAt`.

- [ ] **Step 6: Final commit (none expected)**

If the run surfaces a real bug or rough edge, fix it as a separate small commit. Otherwise skip — verification is done.

- [ ] **Step 7: Open PR**

```bash
git push -u origin <branch-name>
gh pr create --title "feat(api): Plan 11 — knowledge graph assembly" --body "$(cat <<'EOF'
## Summary
- Adds deterministic `tool.kg.assemble` step that merges Plan 07 (`extract`) + Plan 09 (`entities`) into a single `KnowledgeGraph` JSON.
- No LLM, no cache, sub-millisecond. Audit-trail warnings for orphan/self-edge relationships.
- New seed template `Blog SEO — ... + KG` slots `kg` between `entities`+`extract` and `brief`.
- New web renderer `KGOutput` with counts strip, encje/relacje/pozostałe tabs, warnings callout.

## Test plan
- [x] Unit tests for `kg-assembler` pure functions
- [x] Handler test (mocked previousOutputs)
- [x] Smoke `pnpm smoke:plan-11` against fixtures
- [ ] Manual e2e via web UI with the new template
- [ ] Manual re-run via Plan 08 cascade

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checklist (run after writing each task; do not skip)

- [x] Spec coverage — every section of the lesson 2.9 doc (`docs/edu/lekcja-2-9/lekcja-2.9-budowanie-grafu-wiedzy.md` §"Pipeline skryptu", §"Output", §"Dobre praktyki" → walidacja) is implemented in some task.
- [x] No "TBD"/"TODO"/"similar to Task N"/"add appropriate error handling" — every step has concrete code or a concrete command.
- [x] Type names referenced in later tasks (`KnowledgeGraph`, `KGRelationship`, `KGAssemblyWarning`, `assemble`, `formatMeasurable`, `computeMainEntity`) match the names defined in earlier tasks.
- [x] Step keys (`kg`) and types (`tool.kg.assemble`) are consistent across handler / module / template / web router / smoke.
- [x] Every shared-schema task ends with a `pnpm --filter @sensai/shared build` step.
- [x] Re-run via Plan 08's `forceRefresh` is preserved — handler reads `ctx.previousOutputs.entities/extract` and emits a fresh `meta.generatedAt`.
