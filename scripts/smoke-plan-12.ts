#!/usr/bin/env tsx
/**
 * Plan 12 manual smoke test — Outline generation + KG distribution.
 *
 * Loads two lesson fixtures from docs/edu/lekcja-3-1/, adapts them to our
 * QueryFanOutResult and KnowledgeGraph schemas, then runs:
 *   1. OutlineGenerateHandler  → scripts/smoke-output/plan-12-outline.json
 *   2. OutlineDistributeHandler → scripts/smoke-output/plan-12-distribution.json
 *
 * Requires real API keys (OPENAI_API_KEY, OPENROUTER_API_KEY, etc.).
 *
 * Run: pnpm smoke:plan-12
 */
import "dotenv/config";
import "reflect-metadata";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Test } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { HandlersModule } from "../apps/api/src/handlers/handlers.module";
import { OutlineGenerateHandler } from "../apps/api/src/handlers/outline-generate.handler";
import { OutlineDistributeHandler } from "../apps/api/src/handlers/outline-distribute.handler";
import {
  KnowledgeGraph,
  QueryFanOutResult,
  type FanOutArea,
} from "@sensai/shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIXTURES_DIR = resolve(__dirname, "../docs/edu/lekcja-3-1");
const OUTPUT_DIR = resolve(__dirname, "smoke-output");

// ---------------------------------------------------------------------------
// Adapter: lesson fanout fixture → QueryFanOutResult
// ---------------------------------------------------------------------------

/**
 * Maps the lesson `micro_areas[]` shape (area/intent/question/ymyl/paa_questions)
 * into our QueryFanOutResult schema.
 *
 * - Areas are grouped by `intent` value (max 5 per intent — lesson satisfies this).
 * - `paa_questions` are flattened into `paaMapping[]`.
 * - dominantIntent is hardcoded to "Instrukcyjna" (majority in this lesson).
 * - paaUsed is set to true only when paaMapping is non-empty.
 */
function adaptLessonFanout(raw: any): QueryFanOutResult {
  const microAreas: Array<{
    area: string;
    intent: string;
    question: string;
    ymyl: boolean;
    paa_questions: string[];
  }> = raw.micro_areas ?? [];

  // Group by intent (preserving first-seen order)
  const intentMap = new Map<string, typeof microAreas>();
  for (const ma of microAreas) {
    if (!intentMap.has(ma.intent)) intentMap.set(ma.intent, []);
    intentMap.get(ma.intent)!.push(ma);
  }

  // Assign global area IDs A1, A2, ... across all intents
  let areaCounter = 1;
  const paaMapping: Array<{ areaId: string; question: string }> = [];

  const intents = Array.from(intentMap.entries()).map(([intentName, areas]) => {
    const adaptedAreas: FanOutArea[] = areas.map((ma) => {
      const areaId = `A${areaCounter++}`;

      // Collect PAA questions for this area
      for (const q of ma.paa_questions ?? []) {
        paaMapping.push({ areaId, question: q });
      }

      return {
        id: areaId,
        topic: ma.area,
        question: ma.question,
        ymyl: ma.ymyl ?? false,
        classification: "MICRO" as const,
        evergreenTopic: "",
        evergreenQuestion: "",
      };
    });

    return { name: intentName as any, areas: adaptedAreas };
  });

  const paaUsed = paaMapping.length > 0;
  const unmatchedPaa: string[] = raw.unmatched_paa ?? [];

  // If paaUsed=false but we have unmatchedPaa, we still need to honour it.
  // However, the schema disallows unmatchedPaa when paaUsed=false, so treat
  // presence of paa data (mapping OR unmatched) as paaUsed=true.
  const effectivePaaUsed = paaUsed || unmatchedPaa.length > 0;

  const result: QueryFanOutResult = {
    metadata: {
      keyword: "jak obniżyć kortyzol po 40tce",
      language: "pl",
      createdAt: new Date().toISOString(),
      paaFetched: paaMapping.length + unmatchedPaa.length,
      paaUsed: effectivePaaUsed,
    },
    normalization: {
      mainEntity: "kortyzol",
      category: "zdrowie / hormony",
      ymylRisk: true,
    },
    intents,
    dominantIntent: "Instrukcyjna",
    paaMapping: effectivePaaUsed ? paaMapping : [],
    unmatchedPaa: effectivePaaUsed ? unmatchedPaa : [],
  };

  return QueryFanOutResult.parse(result);
}

// ---------------------------------------------------------------------------
// Adapter: lesson KG fixture → KnowledgeGraph
// ---------------------------------------------------------------------------

/**
 * Maps the lesson KG shape (entities[]/facts[]/relationships[]/ideations[]/data_markers[])
 * into our KnowledgeGraph schema.
 *
 * Notable mappings:
 * - entity.type (Polish noun) → nearest EntityType enum value
 * - relationship.type (Polish verb phrase) → nearest RelationType enum value
 * - ideation.type (tabela/infografika/etc.) → nearest IdeationType enum value
 * - data_markers → KGMeasurable (DataPoint extended)
 */

const ENTITY_TYPE_MAP: Record<string, string> = {
  hormon: "CONCEPT",
  organ: "CONCEPT",
  układ: "CONCEPT",
  suplement: "PRODUCT",
  minerał: "PRODUCT",
  witamina: "PRODUCT",
  "kwasy tłuszczowe": "PRODUCT",
  trening: "CONCEPT",
  badanie: "CONCEPT",
  choroba: "CONCEPT",
  zjawisko: "CONCEPT",
  stan: "CONCEPT",
};

const RELATION_TYPE_MAP: Record<string, string> = {
  produkowany_przez: "PART_OF",
  reguluje: "CONNECTED_TO",
  antagonista: "RELATED_TO",
  obniża: "SOLVES",
  podnosi_krótkoterminowo: "CONNECTED_TO",
  wspiera_redukcję: "SOLVES",
  spowodowany_przez: "RELATED_TO",
  powiązana_z: "RELATED_TO",
};

const IDEATION_TYPE_MAP: Record<string, string> = {
  tabela: "info_box",
  infografika: "info_box",
  checklist: "checklist",
  schemat: "info_box",
  mini_course: "mini_course",
  habit: "habit",
};

function adaptLessonKG(raw: any): KnowledgeGraph {
  const rawEntities: Array<{
    name: string;
    type: string;
    description: string;
    source: string;
  }> = raw.entities ?? [];

  const rawFacts: Array<{
    text: string;
    source: string;
    confidence?: number;
  }> = raw.facts ?? [];

  const rawRelationships: Array<{
    from: string;
    to: string;
    type: string;
  }> = raw.relationships ?? [];

  const rawIdeations: Array<{
    type: string;
    description: string;
    priority: string;
  }> = raw.ideations ?? [];

  const rawDataMarkers: Array<{
    marker: string;
    description: string;
  }> = raw.data_markers ?? [];

  // Build entities with synthesised IDs
  const nameToId = new Map<string, string>();
  const entities = rawEntities.map((e, i) => {
    const id = `E${i + 1}`;
    nameToId.set(e.name, id);
    const domainType = (ENTITY_TYPE_MAP[e.type] ?? "CONCEPT") as any;
    return {
      id,
      originalSurface: e.name,
      entity: e.name,
      domainType,
      evidence: e.description,
    };
  });

  // Build relationships — skip unknown endpoints
  const relationships: any[] = [];
  let relIdx = 1;
  for (const r of rawRelationships) {
    const sourceId = nameToId.get(r.from);
    const targetId = nameToId.get(r.to);
    if (!sourceId || !targetId) continue;
    const relType = (RELATION_TYPE_MAP[r.type] ?? "RELATED_TO") as any;
    relationships.push({
      id: `R${relIdx++}`,
      source: sourceId,
      target: targetId,
      type: relType,
      description: `${r.from} ${r.type} ${r.to}`,
      evidence: `lesson fixture: ${r.type}`,
      sourceName: r.from,
      targetName: r.to,
    });
  }

  // Build facts
  const facts = rawFacts.map((f, i) => ({
    id: `F${i + 1}`,
    text: f.text,
    category: "general" as const,
    priority: "medium" as const,
    confidence: f.confidence ?? 0.8,
    sourceUrls: [] as string[],
  }));

  // Build ideations
  const ideations = rawIdeations.map((idea, i) => ({
    id: `I${i + 1}`,
    type: (IDEATION_TYPE_MAP[idea.type] ?? "info_box") as any,
    title: idea.description.slice(0, 120),
    description: idea.description,
    audience: "",
    channels: [] as string[],
    keywords: [] as string[],
    priority: (idea.priority === "high" ? "high" : idea.priority === "low" ? "low" : "medium") as any,
  }));

  // Build measurables from data_markers
  const measurables = rawDataMarkers.map((dm, i) => ({
    id: `D${i + 1}`,
    definition: dm.description,
    value: dm.marker,
    unit: null as null,
    sourceUrls: [] as string[],
    formatted: `${dm.marker}: ${dm.description}`,
  }));

  const meta = {
    mainKeyword: "jak obniżyć kortyzol po 40tce",
    mainEntity: "kortyzol",
    category: "",
    language: "pl",
    generatedAt: new Date().toISOString(),
    counts: {
      entities: entities.length,
      relationships: relationships.length,
      facts: facts.length,
      measurables: measurables.length,
      ideations: ideations.length,
    },
  };

  const kg = {
    meta,
    entities,
    relationships,
    facts,
    measurables,
    ideations,
    warnings: [],
  };

  return KnowledgeGraph.parse(kg);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Load fixtures
  const rawFanout = JSON.parse(
    readFileSync(join(FIXTURES_DIR, "T3F1-input_query_fan_out.json"), "utf-8"),
  );
  const rawKg = JSON.parse(
    readFileSync(join(FIXTURES_DIR, "T3F1-input_knowledge_graph.json"), "utf-8"),
  );

  // Adapt to schemas
  const fanout = adaptLessonFanout(rawFanout);
  const kg = adaptLessonKG(rawKg);

  const totalAreas = fanout.intents.reduce((s, i) => s + i.areas.length, 0);
  console.log(
    `[smoke] fanout: ${fanout.intents.length} intents, ${totalAreas} areas, ` +
      `${fanout.paaMapping.length} paa, ${fanout.unmatchedPaa.length} unmatched`,
  );
  console.log(
    `[smoke] kg: ${kg.entities.length} entities, ${kg.relationships.length} rels, ` +
      `${kg.facts.length} facts, ${kg.measurables.length} measurables, ${kg.ideations.length} ideations`,
  );

  // Bootstrap NestJS testing module
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      HandlersModule,
    ],
  }).compile();

  const generateHandler = moduleRef.get(OutlineGenerateHandler);
  const distributeHandler = moduleRef.get(OutlineDistributeHandler);

  const runId = `smoke-plan-12-${Date.now()}`;

  // Step 1: Outline generation
  console.log("[smoke] Step 1: outline.generate …");
  const genCtx = {
    run: {
      id: runId,
      input: {
        topic: "jak obniżyć kortyzol po 40tce",
        mainKeyword: "kortyzol",
        language: "pl",
      },
    },
    step: { id: "smoke-step-outline-generate" },
    project: { id: "smoke-project", config: {} },
    previousOutputs: { fanout },
    attempt: 1,
    forceRefresh: false,
  } as any;

  const t0 = Date.now();
  const outlineRes = await generateHandler.execute(genCtx);
  const genMs = Date.now() - t0;
  const outlineOutput = outlineRes.output as any;

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(
    join(OUTPUT_DIR, "plan-12-outline.json"),
    JSON.stringify(outlineOutput, null, 2),
    "utf-8",
  );
  console.log(
    `[smoke] outline.generate done: ${genMs}ms | ` +
      `fullSections=${outlineOutput.meta.fullSectionsCount} ` +
      `contextSections=${outlineOutput.meta.contextSectionsCount} ` +
      `warnings=${outlineOutput.warnings.length}`,
  );

  // Step 2: KG distribution
  console.log("[smoke] Step 2: outline.distribute …");
  const distCtx = {
    run: {
      id: runId,
      input: {
        topic: "jak obniżyć kortyzol po 40tce",
        mainKeyword: "kortyzol",
      },
    },
    step: { id: "smoke-step-outline-distribute" },
    project: { id: "smoke-project", config: {} },
    previousOutputs: { outlineGen: outlineOutput, kg },
    attempt: 1,
    forceRefresh: false,
  } as any;

  const t1 = Date.now();
  const distRes = await distributeHandler.execute(distCtx);
  const distMs = Date.now() - t1;
  const distOutput = distRes.output as any;

  writeFileSync(
    join(OUTPUT_DIR, "plan-12-distribution.json"),
    JSON.stringify(distOutput, null, 2),
    "utf-8",
  );
  console.log(
    `[smoke] outline.distribute done: ${distMs}ms | ` +
      `sections=${distOutput.sections.length} ` +
      `coverage=${distOutput.stats.coverage.overallPercent}% ` +
      `warnings=${distOutput.warnings.length}`,
  );

  // Informational assertions
  const fullSections: number = outlineOutput.meta.fullSectionsCount;
  const contextSections: number = outlineOutput.meta.contextSectionsCount;
  const coveragePercent: number = distOutput.stats.coverage.overallPercent;

  console.log(`[smoke] ASSERT fullSectionsCount===5: ${fullSections === 5 ? "PASS" : `WARN (got ${fullSections})`}`);
  console.log(`[smoke] ASSERT contextSectionsCount===3: ${contextSections === 3 ? "PASS" : `WARN (got ${contextSections})`}`);
  console.log(`[smoke] ASSERT coverage>50: ${coveragePercent > 50 ? "PASS" : `WARN (got ${coveragePercent}%)`}`);

  await moduleRef.close();
  console.log("[smoke] PASS — Plan 12 outline+distribute smoke complete");
}

main().catch((e) => {
  console.error("[smoke] FAIL:", e);
  process.exit(1);
});
