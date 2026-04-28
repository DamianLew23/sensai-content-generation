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
