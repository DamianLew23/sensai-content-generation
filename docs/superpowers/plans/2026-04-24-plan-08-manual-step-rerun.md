# Manual Step Re-run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Ponów krok" button in the run detail view that lets the user manually re-run any completed or failed step, with automatic cascade-reset of downstream steps (computed from declared data dependencies) and a tool-cache bypass for the triggered step only.

**Architecture:** Extend `StepDef` in `@sensai/shared` with optional `dependsOn: string[]`. Add a pure `computeRerunCascade` function that returns the transitive closure of steps depending on the target (fallback: steps without `dependsOn` are treated as depending on all earlier steps). New `POST /runs/:id/steps/:stepId/rerun` endpoint resets the target step plus its downstream in a single transaction (status → pending, output/error → null, `retryCount++`, timestamps cleared), flips the run back to `running`, and enqueues the target with a new `forceRefresh` flag that `ToolCacheService` honors by skipping the cache read (still writes results). Frontend renders an inline confirm panel (same pattern as `ApproveScrapeForm`) that shows which downstream steps will also be re-run before confirming.

**Tech Stack:** NestJS + Drizzle + BullMQ + Zod (backend); Next.js 16 + React 19 + @tanstack/react-query (frontend); Vitest (tests).

---

## Constraints & Conventions

- **Re-run allowed only when** `step.status ∈ {failed, completed}` AND `run.status !== cancelled`.
- **Mutate existing step records** (no history rows). On re-run: `output=null, error=null, status=pending, retryCount++, startedAt=null, finishedAt=null`.
- **Cascade = transitive closure** over `dependsOn`. Steps with `dependsOn === undefined` (legacy) fall back to "depends on all earlier steps by stepOrder". Explicit `dependsOn: []` means "no upstream deps" and blocks cascade.
- **`forceRefresh` applies only to the manually triggered step** — downstream steps use normal cache lookup (their inputs change anyway, so they'll cache-miss naturally).
- **No input editing** — re-run uses the step's existing `input` field as-is.
- **Run status after re-run:** `running`, `finishedAt = null`, `currentStepOrder = target.stepOrder`.
- **Conventional commits**, scoped per area (`feat(api):`, `feat(web):`, `feat(shared):`, `test(api):`).
- **TDD where feasible** — write failing tests for pure functions before implementation.

---

## File Structure

**Create:**
- `apps/api/src/runs/rerun-cascade.ts` — pure function `computeRerunCascade`
- `apps/api/src/runs/rerun-validation.ts` — pure function `validateRerunRequest` + `RerunValidationError`
- `apps/api/src/tests/rerun-cascade.test.ts`
- `apps/api/src/tests/rerun-validation.test.ts`
- `apps/web/src/app/runs/[id]/rerun-step-panel.tsx` — inline confirm panel

**Modify:**
- `packages/shared/src/schemas.ts` — add `dependsOn` to `StepDef`, add `RerunPreview` type
- `apps/api/src/orchestrator/queue.constants.ts` — add `forceRefresh?: boolean` to `StepJobData`
- `apps/api/src/orchestrator/step-handler.ts` — add `forceRefresh?: boolean` to `StepContext`
- `apps/api/src/orchestrator/orchestrator.service.ts` — `enqueueStep` accepts `opts?: { forceRefresh?: boolean }`
- `apps/api/src/orchestrator/pipeline.worker.ts` — read `forceRefresh` from job data, pass into `StepContext`
- `apps/api/src/tools/tool-cache.service.ts` — add `forceRefresh?: boolean` to `GetOrSetOpts`, skip cache lookup when true
- `apps/api/src/tests/tool-cache.service.test.ts` — add forceRefresh bypass test
- `apps/api/src/handlers/youcom-research.handler.ts` — forward `forceRefresh: ctx.forceRefresh`
- `apps/api/src/handlers/serp-fetch.handler.ts` — forward `forceRefresh: ctx.forceRefresh`
- `apps/api/src/handlers/scrape-fetch.handler.ts` — forward `forceRefresh: ctx.forceRefresh`
- `apps/api/src/handlers/content-clean.handler.ts` — forward `forceRefresh: ctx.forceRefresh`
- `apps/api/src/handlers/content-extract.handler.ts` — forward `forceRefresh: ctx.forceRefresh`
- `apps/api/src/runs/runs.service.ts` — add `previewRerun` + `rerun` methods
- `apps/api/src/runs/runs.controller.ts` — add two new endpoints
- `apps/api/src/seed/seed.ts` — add `dependsOn` to each step in seed templates, switch to `onConflictDoUpdate`
- `apps/web/src/lib/api.ts` — add `rerunPreview` + `rerun` client methods; extend `Template.stepsDef.steps[]` type
- `apps/web/src/app/runs/[id]/page.tsx` — render `RerunStepPanel` below selected-step output

---

## Task 1: Add `dependsOn` to `StepDef` schema

**Files:**
- Modify: `packages/shared/src/schemas.ts:22-28` (StepDef) + `:30-33` (TemplateStepsDef) + end-of-file (new RerunPreview)

- [ ] **Step 1: Edit `StepDef` to include optional `dependsOn`**

Replace lines 22-28 of `packages/shared/src/schemas.ts` with:

```ts
export const StepDef = z.object({
  key: z.string().min(1),
  type: z.string().min(1),
  auto: z.boolean(),
  model: z.string().optional(),
  dependsOn: z.string().array().optional(),
});
export type StepDef = z.infer<typeof StepDef>;
```

Note: `.optional()` (not `.default([])`) — we MUST preserve the distinction between "undeclared" (legacy → fallback to all-earlier) and "explicitly empty" (no deps).

- [ ] **Step 2: Add cross-reference validation to `TemplateStepsDef`**

Replace lines 30-33 with:

```ts
export const TemplateStepsDef = z
  .object({
    steps: z.array(StepDef).min(1),
  })
  .superRefine((val, ctx) => {
    const keys = val.steps.map((s) => s.key);
    const indexByKey = new Map(keys.map((k, i) => [k, i]));
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    if (dupes.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate stepKey(s): ${dupes.join(", ")}`,
        path: ["steps"],
      });
    }
    val.steps.forEach((step, i) => {
      if (!step.dependsOn) return;
      for (const dep of step.dependsOn) {
        const depIdx = indexByKey.get(dep);
        if (depIdx === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Step "${step.key}" depends on unknown step "${dep}"`,
            path: ["steps", i, "dependsOn"],
          });
        } else if (depIdx >= i) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Step "${step.key}" depends on "${dep}" which is not an earlier step`,
            path: ["steps", i, "dependsOn"],
          });
        }
      }
    });
  });
export type TemplateStepsDef = z.infer<typeof TemplateStepsDef>;
```

- [ ] **Step 3: Add `RerunPreview` type at end of file**

Append to `packages/shared/src/schemas.ts`:

```ts
export const RerunPreview = z.object({
  target: z.string(),
  downstream: z.string().array(),
});
export type RerunPreview = z.infer<typeof RerunPreview>;
```

- [ ] **Step 4: Rebuild shared package**

Run from repo root: `pnpm --filter @sensai/shared build`
Expected: no errors; `packages/shared/dist/schemas.js` updated.

- [ ] **Step 5: Typecheck api**

Run: `pnpm --filter @sensai/api typecheck`
Expected: PASS (existing code treats `stepsDef.steps[i]` as `StepDef`; `dependsOn` is optional so no breakage).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/schemas.ts
git commit -m "feat(shared): add optional dependsOn to StepDef with cross-ref validation"
```

---

## Task 2: Pure function `computeRerunCascade` (TDD)

**Files:**
- Create: `apps/api/src/tests/rerun-cascade.test.ts`
- Create: `apps/api/src/runs/rerun-cascade.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/api/src/tests/rerun-cascade.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeRerunCascade } from "../runs/rerun-cascade";

type S = { key: string; dependsOn?: string[] };

describe("computeRerunCascade", () => {
  it("empty cascade when target is last and nothing depends on it", () => {
    const steps: S[] = [
      { key: "a", dependsOn: [] },
      { key: "b", dependsOn: ["a"] },
    ];
    expect(computeRerunCascade(steps, "b")).toEqual({ target: "b", downstream: [] });
  });

  it("linear chain cascades everything downstream", () => {
    const steps: S[] = [
      { key: "a", dependsOn: [] },
      { key: "b", dependsOn: ["a"] },
      { key: "c", dependsOn: ["b"] },
    ];
    expect(computeRerunCascade(steps, "a")).toEqual({ target: "a", downstream: ["b", "c"] });
  });

  it("branches do not affect unrelated siblings", () => {
    // serp -> scrape, serp -> deepResearch; scrape -> clean; deepResearch + clean -> extract
    const steps: S[] = [
      { key: "serp", dependsOn: [] },
      { key: "scrape", dependsOn: ["serp"] },
      { key: "deepResearch", dependsOn: ["serp"] },
      { key: "clean", dependsOn: ["scrape"] },
      { key: "extract", dependsOn: ["clean", "deepResearch"] },
    ];
    expect(computeRerunCascade(steps, "deepResearch")).toEqual({
      target: "deepResearch",
      downstream: ["extract"],
    });
    expect(computeRerunCascade(steps, "scrape")).toEqual({
      target: "scrape",
      downstream: ["clean", "extract"],
    });
  });

  it("downstream is returned in stepOrder (input array order)", () => {
    const steps: S[] = [
      { key: "a", dependsOn: [] },
      { key: "b", dependsOn: ["a"] },
      { key: "c", dependsOn: ["a"] },
      { key: "d", dependsOn: ["b", "c"] },
    ];
    expect(computeRerunCascade(steps, "a").downstream).toEqual(["b", "c", "d"]);
  });

  it("fallback: step with undefined dependsOn is treated as depending on ALL earlier steps", () => {
    const steps: S[] = [
      { key: "a" },
      { key: "b" },
      { key: "c" },
    ];
    expect(computeRerunCascade(steps, "a")).toEqual({ target: "a", downstream: ["b", "c"] });
    expect(computeRerunCascade(steps, "b")).toEqual({ target: "b", downstream: ["c"] });
  });

  it("mixed: undefined deps depend on all earlier; explicit [] means no deps", () => {
    const steps: S[] = [
      { key: "a", dependsOn: [] },
      { key: "b", dependsOn: [] },   // explicitly independent of a
      { key: "c" },                  // legacy → depends on a AND b
    ];
    expect(computeRerunCascade(steps, "a")).toEqual({ target: "a", downstream: ["c"] });
    expect(computeRerunCascade(steps, "b")).toEqual({ target: "b", downstream: ["c"] });
  });

  it("throws when target key not in steps", () => {
    const steps: S[] = [{ key: "a", dependsOn: [] }];
    expect(() => computeRerunCascade(steps, "zzz")).toThrow(/target step "zzz" not found/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @sensai/api test -- rerun-cascade`
Expected: FAIL with "Cannot find module '../runs/rerun-cascade'" or similar.

- [ ] **Step 3: Implement `computeRerunCascade`**

Create `apps/api/src/runs/rerun-cascade.ts`:

```ts
export interface CascadeStep {
  key: string;
  dependsOn?: string[];
}

export interface RerunCascade {
  target: string;
  downstream: string[];
}

export function computeRerunCascade(steps: CascadeStep[], targetKey: string): RerunCascade {
  const idx = steps.findIndex((s) => s.key === targetKey);
  if (idx < 0) throw new Error(`target step "${targetKey}" not found`);

  const earlierKeysBy = new Map<string, string[]>();
  steps.forEach((s, i) => {
    earlierKeysBy.set(s.key, steps.slice(0, i).map((x) => x.key));
  });

  const effectiveDeps = (s: CascadeStep): string[] =>
    s.dependsOn === undefined ? (earlierKeysBy.get(s.key) ?? []) : s.dependsOn;

  const affected = new Set<string>([targetKey]);
  // steps after target, in stepOrder; include if any dep is already in `affected`
  for (let i = idx + 1; i < steps.length; i++) {
    const s = steps[i];
    if (effectiveDeps(s).some((d) => affected.has(d))) {
      affected.add(s.key);
    }
  }

  const downstream = steps
    .slice(idx + 1)
    .filter((s) => affected.has(s.key))
    .map((s) => s.key);

  return { target: targetKey, downstream };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @sensai/api test -- rerun-cascade`
Expected: 7/7 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/runs/rerun-cascade.ts apps/api/src/tests/rerun-cascade.test.ts
git commit -m "feat(api): add computeRerunCascade pure function for downstream resolution"
```

---

## Task 3: Pure function `validateRerunRequest` (TDD)

**Files:**
- Create: `apps/api/src/tests/rerun-validation.test.ts`
- Create: `apps/api/src/runs/rerun-validation.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/api/src/tests/rerun-validation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validateRerunRequest, RerunValidationError } from "../runs/rerun-validation";

const baseRun = { id: "run-1", status: "completed" } as any;
const baseStep = { id: "step-1", runId: "run-1", status: "completed" } as any;

describe("validateRerunRequest", () => {
  it("ok when step is completed and run is not cancelled", () => {
    expect(validateRerunRequest({ run: baseRun, step: baseStep }).ok).toBe(true);
  });

  it("ok when step is failed", () => {
    expect(
      validateRerunRequest({
        run: { ...baseRun, status: "failed" },
        step: { ...baseStep, status: "failed" },
      }).ok,
    ).toBe(true);
  });

  it("ok when run is running but step is completed (mid-run retry)", () => {
    expect(
      validateRerunRequest({
        run: { ...baseRun, status: "running" },
        step: baseStep,
      }).ok,
    ).toBe(true);
  });

  it("step_not_rerunnable when step is pending", () => {
    expect(() =>
      validateRerunRequest({ run: baseRun, step: { ...baseStep, status: "pending" } }),
    ).toThrow(expect.objectContaining({ code: "step_not_rerunnable", httpStatus: 409 }));
  });

  it("step_not_rerunnable when step is running", () => {
    expect(() =>
      validateRerunRequest({ run: baseRun, step: { ...baseStep, status: "running" } }),
    ).toThrow(expect.objectContaining({ code: "step_not_rerunnable", httpStatus: 409 }));
  });

  it("step_not_rerunnable when step is skipped", () => {
    expect(() =>
      validateRerunRequest({ run: baseRun, step: { ...baseStep, status: "skipped" } }),
    ).toThrow(expect.objectContaining({ code: "step_not_rerunnable", httpStatus: 409 }));
  });

  it("run_cancelled when run.status is cancelled", () => {
    expect(() =>
      validateRerunRequest({ run: { ...baseRun, status: "cancelled" }, step: baseStep }),
    ).toThrow(expect.objectContaining({ code: "run_cancelled", httpStatus: 409 }));
  });

  it("step_not_in_run when step.runId does not match run.id", () => {
    expect(() =>
      validateRerunRequest({
        run: baseRun,
        step: { ...baseStep, runId: "other-run" },
      }),
    ).toThrow(expect.objectContaining({ code: "step_not_in_run", httpStatus: 404 }));
  });

  it("errors are instances of RerunValidationError", () => {
    try {
      validateRerunRequest({ run: baseRun, step: { ...baseStep, status: "pending" } });
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(RerunValidationError);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @sensai/api test -- rerun-validation`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the validator**

Create `apps/api/src/runs/rerun-validation.ts`:

```ts
import type { PipelineRunRow, PipelineStepRow } from "../orchestrator/step-handler";

export class RerunValidationError extends Error {
  constructor(
    public readonly code: "step_not_in_run" | "step_not_rerunnable" | "run_cancelled",
    public readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = "RerunValidationError";
  }
}

interface ValidateInput {
  run: PipelineRunRow;
  step: PipelineStepRow;
}

export function validateRerunRequest(args: ValidateInput): { ok: true } {
  const { run, step } = args;

  if (step.runId !== run.id) {
    throw new RerunValidationError(
      "step_not_in_run", 404,
      `Step ${step.id} does not belong to run ${run.id}`,
    );
  }

  if (run.status === "cancelled") {
    throw new RerunValidationError(
      "run_cancelled", 409,
      "Cannot re-run a step of a cancelled run",
    );
  }

  if (step.status !== "completed" && step.status !== "failed") {
    throw new RerunValidationError(
      "step_not_rerunnable", 409,
      `Step status must be "completed" or "failed" (got "${step.status}")`,
    );
  }

  return { ok: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @sensai/api test -- rerun-validation`
Expected: 9/9 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/runs/rerun-validation.ts apps/api/src/tests/rerun-validation.test.ts
git commit -m "feat(api): add validateRerunRequest with step + run state checks"
```

---

## Task 4: Thread `forceRefresh` through `ToolCacheService`

**Files:**
- Modify: `apps/api/src/tools/tool-cache.service.ts:11-19` (GetOrSetOpts) + `:28-49` (getOrSet body)
- Modify: `apps/api/src/tests/tool-cache.service.test.ts` (add test)

- [ ] **Step 1: Add failing test for `forceRefresh`**

Open `apps/api/src/tests/tool-cache.service.test.ts` and inspect the existing test harness (mock db + recorder). Append a new test inside the `describe("ToolCacheService", ...)` block that:
- Inserts a cache entry via one `getOrSet` call (fetcher A).
- Calls `getOrSet` again with the same params but `forceRefresh: true` + a different fetcher B.
- Asserts fetcher B was invoked (cache bypassed) and the returned value is fresh from B.
- Asserts the recorder was called with `fromCache: false` both times.

Concrete test body (insert at the end of the `describe` block):

```ts
it("skips cache read when forceRefresh=true and overwrites the cached value", async () => {
  const db = buildDb();
  const recorder = buildRecorder();
  const svc = new ToolCacheService(db, recorder as any);

  const first = await svc.getOrSet({
    tool: "t", method: "m", params: { k: 1 }, ttlSeconds: 60,
    runId: "run", stepId: "step",
    fetcher: async () => ({ result: { v: "cached" }, costUsd: "0.001", latencyMs: 10 }),
  });
  expect(first).toEqual({ v: "cached" });

  let freshCalled = false;
  const second = await svc.getOrSet({
    tool: "t", method: "m", params: { k: 1 }, ttlSeconds: 60,
    runId: "run", stepId: "step",
    forceRefresh: true,
    fetcher: async () => {
      freshCalled = true;
      return { result: { v: "fresh" }, costUsd: "0.002", latencyMs: 20 };
    },
  });
  expect(freshCalled).toBe(true);
  expect(second).toEqual({ v: "fresh" });

  const fromCacheFlags = recorder.calls.map((c: any) => c.fromCache);
  expect(fromCacheFlags).toEqual([false, false]);
});
```

Note: if the existing `buildDb()` / `buildRecorder()` helpers are named differently, adapt to match the file. Read the file first (`apps/api/src/tests/tool-cache.service.test.ts`) to confirm the names and add any imports required.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @sensai/api test -- tool-cache.service`
Expected: FAIL — `forceRefresh` either unknown prop (TS) or ignored at runtime (fresh value would be "cached" on second call).

- [ ] **Step 3: Add `forceRefresh` to `GetOrSetOpts` and skip cache read**

In `apps/api/src/tools/tool-cache.service.ts`, modify `GetOrSetOpts` interface (lines 11-19) to add `forceRefresh?: boolean;`:

```ts
export interface GetOrSetOpts<T> {
  tool: string;
  method: string;
  params: unknown;
  ttlSeconds: number;
  runId: string;
  stepId: string;
  forceRefresh?: boolean;
  fetcher: () => Promise<{ result: T; costUsd: string; latencyMs: number }>;
}
```

Modify `getOrSet` body so the cache lookup is skipped when `forceRefresh === true`. Replace lines 28-49 with:

```ts
  async getOrSet<T>(opts: GetOrSetOpts<T>): Promise<T> {
    const paramsHash = createHash("sha256").update(stableStringify(opts.params)).digest("hex");
    const now = new Date();

    if (!opts.forceRefresh) {
      const rows = await this.db.select().from(toolCache).where(
        and(
          eq(toolCache.tool, opts.tool),
          eq(toolCache.method, opts.method),
          eq(toolCache.paramsHash, paramsHash),
          gt(toolCache.expiresAt, now),
        ),
      );
      const hit = rows[0];
      if (hit) {
        await this.recorder.record({
          runId: opts.runId, stepId: opts.stepId,
          tool: opts.tool, method: opts.method, paramsHash,
          fromCache: true, costUsd: "0", latencyMs: 0,
        });
        return hit.result as T;
      }
    }
```

Leave the rest of the method (fetcher call, error recording, upsert, non-cache recorder call) unchanged — on `forceRefresh`, the fetcher runs, the recorder records `fromCache: false`, and the new result overwrites the cached row (existing `onConflictDoUpdate` handles that).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @sensai/api test -- tool-cache.service`
Expected: all existing tests PASS + the new test PASSES.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/tools/tool-cache.service.ts apps/api/src/tests/tool-cache.service.test.ts
git commit -m "feat(api): add forceRefresh option to ToolCacheService.getOrSet"
```

---

## Task 5: Thread `forceRefresh` through StepJobData → StepContext

**Files:**
- Modify: `apps/api/src/orchestrator/queue.constants.ts`
- Modify: `apps/api/src/orchestrator/step-handler.ts`
- Modify: `apps/api/src/orchestrator/orchestrator.service.ts`
- Modify: `apps/api/src/orchestrator/pipeline.worker.ts`

- [ ] **Step 1: Extend `StepJobData`**

Replace `apps/api/src/orchestrator/queue.constants.ts` contents with:

```ts
export const QUEUE_NAME = "pipeline-steps";

export interface StepJobData {
  runId: string;
  stepId: string;
  forceRefresh?: boolean;
}
```

- [ ] **Step 2: Extend `StepContext`**

In `apps/api/src/orchestrator/step-handler.ts` lines 8-14, add `forceRefresh?: boolean`:

```ts
export interface StepContext {
  run: PipelineRunRow;
  step: PipelineStepRow;
  project: ProjectRow;
  previousOutputs: Record<string, unknown>;
  attempt: number;
  forceRefresh?: boolean;
}
```

- [ ] **Step 3: Update `OrchestratorService.enqueueStep` signature**

Replace `enqueueStep` in `apps/api/src/orchestrator/orchestrator.service.ts:18-30` with:

```ts
  async enqueueStep(
    runId: string,
    stepId: string,
    opts?: { forceRefresh?: boolean },
  ): Promise<void> {
    await this.queue.add(
      "execute-step",
      { runId, stepId, forceRefresh: opts?.forceRefresh },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );
    this.logger.log({ runId, stepId, forceRefresh: opts?.forceRefresh }, "step enqueued");
  }
```

- [ ] **Step 4: Forward `forceRefresh` in the worker**

In `apps/api/src/orchestrator/pipeline.worker.ts:47-48`, destructure and forward. Replace:

```ts
    const { runId, stepId } = job.data;
```

with:

```ts
    const { runId, stepId, forceRefresh } = job.data;
```

Then in `pipeline.worker.ts:87-93` (the `handler.execute(...)` call), add `forceRefresh` to the context:

```ts
      const result = await handler.execute({
        run,
        step,
        project,
        previousOutputs,
        attempt,
        forceRefresh,
      });
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @sensai/api typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/orchestrator
git commit -m "feat(api): propagate forceRefresh flag from queue job into StepContext"
```

---

## Task 6: Forward `forceRefresh` in each handler that uses ToolCache

**Files:** (all in `apps/api/src/handlers/`)
- Modify: `youcom-research.handler.ts`
- Modify: `serp-fetch.handler.ts`
- Modify: `scrape-fetch.handler.ts`
- Modify: `content-clean.handler.ts`
- Modify: `content-extract.handler.ts`

For EACH of the five handlers, find the `this.cache.getOrSet({ ... })` call and add `forceRefresh: ctx.forceRefresh,` as a new property of the options object.

- [ ] **Step 1: `youcom-research.handler.ts`**

In `apps/api/src/handlers/youcom-research.handler.ts:46`, the options object begins with `tool: "youcom"`. Add `forceRefresh: ctx.forceRefresh,` as a new sibling property (order doesn't matter; place it right after `method`):

```ts
    const briefing = await this.cache.getOrSet({
      tool: "youcom",
      method: "research",
      forceRefresh: ctx.forceRefresh,
      params: { input: promptString, effort },
      ttlSeconds: TTL_DAYS * 24 * 3600,
      runId: ctx.run.id,
      stepId: ctx.step.id,
      fetcher: async () => { /* unchanged */ },
    });
```

- [ ] **Step 2: `serp-fetch.handler.ts`**

Open the file; find the `this.cache.getOrSet({ ... })` call; add `forceRefresh: ctx.forceRefresh,` as a sibling property.

- [ ] **Step 3: `scrape-fetch.handler.ts`**

Same — find every `this.cache.getOrSet(...)` in the file (scrape handler may have one per URL/source); add `forceRefresh: ctx.forceRefresh,` to each options object.

- [ ] **Step 4: `content-clean.handler.ts`**

Same.

- [ ] **Step 5: `content-extract.handler.ts`**

Same.

- [ ] **Step 6: Typecheck + run all unit tests**

Run: `pnpm --filter @sensai/api typecheck`
Run: `pnpm --filter @sensai/api test`
Expected: all green. Existing handler tests still pass because `ctx.forceRefresh` is optional and defaults to undefined in test mocks.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/handlers
git commit -m "feat(api): forward ctx.forceRefresh from handlers to ToolCacheService"
```

---

## Task 7: `RunsService.previewRerun(runId, stepId)`

**Files:**
- Modify: `apps/api/src/runs/runs.service.ts`

- [ ] **Step 1: Add imports and service method**

At the top of `apps/api/src/runs/runs.service.ts`, add imports:

```ts
import { pipelineRuns, pipelineSteps, pipelineTemplates } from "../db/schema";
import { TemplateStepsDef, type RerunPreview } from "@sensai/shared";
import { computeRerunCascade } from "./rerun-cascade";
import { validateRerunRequest, RerunValidationError } from "./rerun-validation";
```

(Merge with existing imports; `pipelineTemplates` and the new identifiers are additions.)

Add a new method below `resume()`:

```ts
  async previewRerun(runId: string, stepId: string): Promise<RerunPreview> {
    const { run, step } = await this.loadRunAndStep(runId, stepId);
    this.assertRerunnable(run, step);

    const [template] = await this.db
      .select()
      .from(pipelineTemplates)
      .where(eq(pipelineTemplates.id, run.templateId));
    if (!template) throw new NotFoundException(`Template for run ${runId} not found`);

    const stepsDef = TemplateStepsDef.parse(template.stepsDef);
    return computeRerunCascade(stepsDef.steps, step.stepKey);
  }

  private async loadRunAndStep(runId: string, stepId: string) {
    const [run] = await this.db.select().from(pipelineRuns).where(eq(pipelineRuns.id, runId));
    if (!run) throw new NotFoundException(`Run ${runId} not found`);
    const [step] = await this.db
      .select()
      .from(pipelineSteps)
      .where(and(eq(pipelineSteps.id, stepId), eq(pipelineSteps.runId, runId)));
    if (!step) throw new NotFoundException(`Step ${stepId} not found in run ${runId}`);
    return { run, step };
  }

  private assertRerunnable(run: any, step: any) {
    try {
      validateRerunRequest({ run, step });
    } catch (err) {
      if (err instanceof RerunValidationError) {
        if (err.httpStatus === 404) throw new NotFoundException({ code: err.code, message: err.message });
        throw new ConflictException({ code: err.code, message: err.message });
      }
      throw err;
    }
  }
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @sensai/api typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/runs/runs.service.ts
git commit -m "feat(api): add RunsService.previewRerun returning cascade preview"
```

---

## Task 8: `RunsService.rerun(runId, stepId)`

**Files:**
- Modify: `apps/api/src/runs/runs.service.ts`

- [ ] **Step 1: Add `rerun` method**

In `apps/api/src/runs/runs.service.ts`, add below `previewRerun()`:

```ts
  async rerun(runId: string, stepId: string) {
    const { run, step } = await this.loadRunAndStep(runId, stepId);
    this.assertRerunnable(run, step);

    const [template] = await this.db
      .select()
      .from(pipelineTemplates)
      .where(eq(pipelineTemplates.id, run.templateId));
    if (!template) throw new NotFoundException(`Template for run ${runId} not found`);
    const stepsDef = TemplateStepsDef.parse(template.stepsDef);

    const { downstream } = computeRerunCascade(stepsDef.steps, step.stepKey);
    const keysToReset = [step.stepKey, ...downstream];

    await this.db.transaction(async (tx) => {
      for (const key of keysToReset) {
        await tx
          .update(pipelineSteps)
          .set({
            status: "pending",
            output: null,
            error: null,
            startedAt: null,
            finishedAt: null,
            retryCount: sql`${pipelineSteps.retryCount} + 1`,
          })
          .where(and(eq(pipelineSteps.runId, runId), eq(pipelineSteps.stepKey, key)));
      }
      await tx
        .update(pipelineRuns)
        .set({
          status: "running",
          currentStepOrder: step.stepOrder,
          finishedAt: null,
        })
        .where(eq(pipelineRuns.id, runId));
    });

    await this.orchestrator.enqueueStep(runId, stepId, { forceRefresh: true });

    return this.get(runId);
  }
```

Add `sql` to the import from `drizzle-orm` at the top of the file:

```ts
import { and, desc, eq, sql } from "drizzle-orm";
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @sensai/api typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/runs/runs.service.ts
git commit -m "feat(api): add RunsService.rerun resetting target + downstream and enqueueing with forceRefresh"
```

---

## Task 9: Expose HTTP endpoints in `RunsController`

**Files:**
- Modify: `apps/api/src/runs/runs.controller.ts`

- [ ] **Step 1: Add two endpoints**

Replace `apps/api/src/runs/runs.controller.ts` contents with:

```ts
import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { RunsService } from "./runs.service";
import { StartRunDto } from "@sensai/shared";

@Controller("runs")
export class RunsController {
  constructor(private readonly svc: RunsService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  @Get(":id")
  get(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.svc.get(id);
  }

  @Post()
  start(@Body() body: unknown) {
    const dto = StartRunDto.parse(body);
    return this.svc.start(dto);
  }

  @Post(":id/steps/:stepId/resume")
  resume(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("stepId", new ParseUUIDPipe()) stepId: string,
    @Body() body: unknown,
  ) {
    return this.svc.resume(id, stepId, body);
  }

  @Get(":id/steps/:stepId/rerun-preview")
  rerunPreview(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("stepId", new ParseUUIDPipe()) stepId: string,
  ) {
    return this.svc.previewRerun(id, stepId);
  }

  @Post(":id/steps/:stepId/rerun")
  rerun(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("stepId", new ParseUUIDPipe()) stepId: string,
  ) {
    return this.svc.rerun(id, stepId);
  }
}
```

- [ ] **Step 2: Build + start API locally and hit endpoints**

Start the API (whatever the project's dev command is — likely `pnpm --filter @sensai/api start:dev`). Pick any completed run from `GET /runs` and try:

```bash
# Preview (replace IDs with real ones)
curl -s -H "Authorization: Bearer $NEXT_PUBLIC_API_TOKEN" \
  "http://localhost:3000/runs/<runId>/steps/<stepId>/rerun-preview" | jq

# Trigger rerun
curl -s -X POST -H "Authorization: Bearer $NEXT_PUBLIC_API_TOKEN" \
  "http://localhost:3000/runs/<runId>/steps/<stepId>/rerun" | jq
```

Expected: preview returns `{ target, downstream }`; rerun returns the run with reset steps.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/runs/runs.controller.ts
git commit -m "feat(api): expose GET rerun-preview and POST rerun endpoints"
```

---

## Task 10: Update seed templates with `dependsOn`

**Files:**
- Modify: `apps/api/src/seed/seed.ts`

- [ ] **Step 1: Switch upsert to `onConflictDoUpdate` so `stepsDef` gets updated on re-seed**

Replace the `upsertTemplate` function at `apps/api/src/seed/seed.ts:7-17` with:

```ts
async function upsertTemplate(db: ReturnType<typeof createDb>["db"], name: string, version: number, stepsDef: TemplateStepsDef) {
  await db
    .insert(pipelineTemplates)
    .values({ name, version, stepsDef })
    .onConflictDoUpdate({
      target: [pipelineTemplates.name, pipelineTemplates.version],
      set: { stepsDef },
    });
  const [row] = await db
    .select()
    .from(pipelineTemplates)
    .where(and(eq(pipelineTemplates.name, name), eq(pipelineTemplates.version, version)));
  return row;
}
```

- [ ] **Step 2: Add `dependsOn` to every step in every template**

Replace the six template definitions in `seed.ts` with:

```ts
  const briefOnly = await upsertTemplate(db, "Brief only (MVP)", 1, {
    steps: [{ key: "brief", type: "llm.brief", auto: true, dependsOn: [] }],
  });

  const briefResearch = await upsertTemplate(db, "Brief + research", 1, {
    steps: [
      { key: "research", type: "tool.serp.fetch", auto: true, dependsOn: [] },
      { key: "brief",    type: "llm.brief",       auto: true, dependsOn: ["research"] },
    ],
  });

  const briefResearchScrape = await upsertTemplate(db, "Brief + research + scrape", 1, {
    steps: [
      { key: "research", type: "tool.serp.fetch", auto: true,  dependsOn: [] },
      { key: "scrape",   type: "tool.scrape",     auto: false, dependsOn: ["research"] },
      { key: "brief",    type: "llm.brief",       auto: true,  dependsOn: ["scrape"] },
    ],
  });

  const blogSeoDeepResearch = await upsertTemplate(db, "Blog SEO — deep research", 1, {
    steps: [
      { key: "deepResearch", type: "tool.youcom.research", auto: true,  dependsOn: [] },
      { key: "research",     type: "tool.serp.fetch",     auto: true,  dependsOn: [] },
      { key: "scrape",       type: "tool.scrape",         auto: false, dependsOn: ["research"] },
      { key: "brief",        type: "llm.brief",           auto: true,  dependsOn: ["scrape", "deepResearch"] },
    ],
  });

  const blogSeoDeepResearchClean = await upsertTemplate(db, "Blog SEO — deep research + clean", 1, {
    steps: [
      { key: "deepResearch", type: "tool.youcom.research", auto: true,  dependsOn: [] },
      { key: "research",     type: "tool.serp.fetch",     auto: true,  dependsOn: [] },
      { key: "scrape",       type: "tool.scrape",         auto: false, dependsOn: ["research"] },
      { key: "clean",        type: "tool.content.clean",  auto: true,  dependsOn: ["scrape"] },
      { key: "brief",        type: "llm.brief",           auto: true,  dependsOn: ["clean", "deepResearch"] },
    ],
  });

  const blogSeoExtract = await upsertTemplate(
    db,
    "Blog SEO — deep research + clean + extract",
    1,
    {
      steps: [
        { key: "deepResearch", type: "tool.youcom.research", auto: true,  dependsOn: [] },
        { key: "research",     type: "tool.serp.fetch",     auto: true,  dependsOn: [] },
        { key: "scrape",       type: "tool.scrape",         auto: false, dependsOn: ["research"] },
        { key: "clean",        type: "tool.content.clean",  auto: true,  dependsOn: ["scrape"] },
        { key: "extract",      type: "tool.content.extract", auto: true, dependsOn: ["clean", "deepResearch"] },
        { key: "brief",        type: "llm.brief",           auto: true,  dependsOn: ["extract"] },
      ],
    },
  );
```

Rationale for each template's deps comes from the data each handler consumes — `scrape` reads SERP URLs, `clean` reads scraped pages, `extract` reads cleaned pages + deep-research briefing, `brief` reads all prior relevant outputs. If in doubt, verify by reading the handler file (e.g. `content-extract.handler.ts` shows it reads both `clean` and `deepResearch` from `previousOutputs`).

- [ ] **Step 3: Re-run seed**

Run: `pnpm --filter @sensai/api db:seed`
Expected: output lists the templates with their IDs; no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/seed/seed.ts
git commit -m "feat(seed): declare dependsOn for every step; upsert stepsDef on re-seed"
```

---

## Task 11: Add `rerunPreview` + `rerun` to web API client

**Files:**
- Modify: `apps/web/src/lib/api.ts`

- [ ] **Step 1: Extend `Template` type and add client methods**

In `apps/web/src/lib/api.ts`:

Replace the `Template` interface at lines 29-35 with:

```ts
export interface Template {
  id: string;
  name: string;
  version: number;
  stepsDef: {
    steps: Array<{ key: string; type: string; auto: boolean; dependsOn?: string[] }>;
  };
  createdAt: string;
}
```

Add to the `runs` object inside `export const api` (after `resume`):

```ts
    rerunPreview: (runId: string, stepId: string) =>
      apiFetch<{ target: string; downstream: string[] }>(
        `/runs/${runId}/steps/${stepId}/rerun-preview`,
      ),
    rerun: (runId: string, stepId: string) =>
      apiFetch<Run & { steps: Step[] }>(
        `/runs/${runId}/steps/${stepId}/rerun`,
        { method: "POST" },
      ),
```

- [ ] **Step 2: Typecheck web**

Run: `pnpm --filter @sensai/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat(web): add rerunPreview + rerun client methods"
```

---

## Task 12: Inline rerun panel component

**Files:**
- Create: `apps/web/src/app/runs/[id]/rerun-step-panel.tsx`

- [ ] **Step 1: Create the component**

Create `apps/web/src/app/runs/[id]/rerun-step-panel.tsx`:

```tsx
"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";

interface Props {
  runId: string;
  stepId: string;
  stepKey: string;
  stepStatus: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  step_not_rerunnable: "Ten krok nie może być ponowiony w obecnym stanie. Odśwież stronę.",
  run_cancelled: "Run został anulowany — nie można ponowić kroku.",
  step_not_in_run: "Krok nie należy do tego runa.",
};

export function RerunStepPanel({ runId, stepId, stepKey, stepStatus }: Props) {
  const qc = useQueryClient();
  const [phase, setPhase] = useState<"idle" | "loading" | "confirm" | "submitting">("idle");
  const [downstream, setDownstream] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (stepStatus !== "completed" && stepStatus !== "failed") return null;

  async function openConfirm() {
    setPhase("loading");
    setError(null);
    try {
      const preview = await api.runs.rerunPreview(runId, stepId);
      setDownstream(preview.downstream);
      setPhase("confirm");
    } catch (e: any) {
      setError(formatError(e));
      setPhase("idle");
    }
  }

  async function confirmRerun() {
    setPhase("submitting");
    setError(null);
    try {
      await api.runs.rerun(runId, stepId);
      await qc.invalidateQueries({ queryKey: ["run", runId] });
      setPhase("idle");
      setDownstream(null);
    } catch (e: any) {
      setError(formatError(e));
      setPhase("confirm");
    }
  }

  function cancel() {
    setPhase("idle");
    setDownstream(null);
    setError(null);
  }

  if (phase === "confirm" && downstream !== null) {
    return (
      <section className="space-y-3 rounded border border-amber-200 bg-amber-50 p-4">
        <h3 className="font-medium">Ponowić krok „{stepKey}"?</h3>
        {downstream.length === 0 ? (
          <p className="text-sm">Żadne inne kroki nie zostaną zmienione.</p>
        ) : (
          <div className="text-sm">
            <p>Następujące kroki zostaną również zresetowane i ponowione (zależą od „{stepKey}"):</p>
            <ul className="mt-1 list-disc pl-5">
              {downstream.map((k) => (
                <li key={k}><code className="font-mono text-xs">{k}</code></li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Krok „{stepKey}" zostanie wykonany z pominięciem cache (force refresh).
        </p>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={confirmRerun}
            disabled={phase === "submitting"}
            className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {phase === "submitting" ? "Uruchamiam…" : "Potwierdź ponowienie"}
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={phase === "submitting"}
            className="rounded border px-4 py-2 text-sm disabled:opacity-50"
          >
            Anuluj
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={openConfirm}
        disabled={phase === "loading"}
        className="rounded border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
      >
        {phase === "loading" ? "Ładuję…" : "Ponów krok"}
      </button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}

function formatError(e: any): string {
  const msg = String(e?.message ?? "");
  const match = msg.match(/API \d+: (.+)$/s);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      const code = parsed?.code ?? parsed?.message?.code;
      if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
    } catch {
      /* body wasn't JSON */
    }
  }
  return msg || "Network error";
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @sensai/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/runs/[id]/rerun-step-panel.tsx
git commit -m "feat(web): add inline RerunStepPanel with cascade preview confirm"
```

---

## Task 13: Wire `RerunStepPanel` into the run detail page

**Files:**
- Modify: `apps/web/src/app/runs/[id]/page.tsx`

- [ ] **Step 1: Import and render the panel next to the Output header**

In `apps/web/src/app/runs/[id]/page.tsx`, add the import near the top (alongside `ApproveScrapeForm`):

```tsx
import { RerunStepPanel } from "./rerun-step-panel";
```

Then, inside the `<section>` that renders the selected-step details (currently lines 159-210), render the panel below the `<StepOutput ... />` element but above the error block. Find the line:

```tsx
                    <StepOutput
                      type={selectedStep.type}
                      value={selectedStep.output}
                      raw={rawJson}
                    />
                  </div>
                  {!!selectedStep.error && (
```

and insert between the closing `</div>` of the output block and the error block:

```tsx
                  </div>
                  {run.data && (
                    <RerunStepPanel
                      runId={run.data.id}
                      stepId={selectedStep.id}
                      stepKey={selectedStep.stepKey}
                      stepStatus={selectedStep.status}
                    />
                  )}
                  {!!selectedStep.error && (
```

(The `RerunStepPanel` self-hides when `stepStatus` is anything other than `completed` or `failed`, so it's safe to always render.)

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @sensai/web typecheck`
Expected: PASS.

- [ ] **Step 3: Manual smoke — UI**

Start both apps (`pnpm --filter @sensai/api start:dev` + `pnpm --filter @sensai/web dev`). Open a completed run, select a step (e.g. `extract`), and verify:
1. "Ponów krok" button is visible for completed/failed steps and absent for pending/running/skipped.
2. Clicking it shows the confirm panel with cascade preview matching the template's `dependsOn` (e.g. re-running `deepResearch` should list `extract, brief`; re-running `scrape` should list `clean, extract, brief`; re-running `brief` should list nothing).
3. "Anuluj" resets the panel.
4. "Potwierdź ponowienie" kicks off the rerun: run status flips to `running`, target step + downstream reset to `pending`, and execution proceeds. The triggered step should show a fresh `toolCalls` record with `from_cache = false`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/runs/[id]/page.tsx
git commit -m "feat(web): render RerunStepPanel in step detail view"
```

---

## Task 14: Final verification

- [ ] **Step 1: Full typecheck**

Run from repo root:

```bash
pnpm --filter @sensai/shared build && \
  pnpm --filter @sensai/api typecheck && \
  pnpm --filter @sensai/web typecheck
```

Expected: all PASS.

- [ ] **Step 2: Full api unit test run**

Run: `pnpm --filter @sensai/api test`
Expected: all existing tests + new ones green.

- [ ] **Step 3: End-to-end check (DB-level)**

Pick a completed run in the "Blog SEO — deep research + clean + extract" template. Use the UI to re-run `deepResearch`. Then in a SQL console:

```sql
SELECT step_key, status, retry_count, output IS NOT NULL AS has_output
FROM pipeline_steps
WHERE run_id = '<runId>'
ORDER BY step_order;
```

Expected immediately after the rerun POST: `deepResearch` → `running`/`pending`, `extract` and `brief` → `pending` with `output = null`, `retry_count` incremented by 1 for the affected rows, `research/scrape/clean` untouched (`completed` with outputs intact).

A few seconds later (once execution catches up), all resetted steps should be `running` → `completed` again; `deepResearch`'s corresponding `tool_calls` row should show `from_cache = false` for the re-run attempt.

- [ ] **Step 4: Final commit if anything fixed during verification**

(No-op if everything passed cleanly.)

---

## Self-Review

**Spec coverage:**
- (1) Re-run for `failed` + `completed` → Task 3 validates this explicitly.
- (2) Mutate existing step (no history) → Task 8 updates the existing row in place.
- (3) Cascade by `dependsOn` with declared deps + fallback → Task 1 (schema), Task 2 (algorithm), Task 10 (seeded deps).
- (4) No input editing → the POST rerun endpoint (Task 9) takes no body; service reuses `step.input` implicitly (never reset).
- (5) `forceRefresh` bypasses cache, only on triggered step → Task 4 (service), Task 5 (job/context), Task 6 (handlers), Task 8 (`enqueueStep(..., { forceRefresh: true })` only for the target).
- (6) Run status → `running`, `finishedAt = null` → Task 8 `pipelineRuns` update.
- (7) UI trigger in step detail with confirm → Tasks 12–13.

**Placeholder scan:** No TBDs, no "implement later", no "similar to Task N". All steps include concrete code or concrete commands.

**Type consistency:** `RerunPreview = { target, downstream }` shape is consistent across shared schema (Task 1), api client method (Task 11), UI component props (Task 12). `forceRefresh?: boolean` consistent across `StepJobData`, `StepContext`, `GetOrSetOpts`, and `enqueueStep` opts.
