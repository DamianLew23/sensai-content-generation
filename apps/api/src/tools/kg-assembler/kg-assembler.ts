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

export function formatMeasurable(dp: DataPoint): string {
  return dp.unit ? `${dp.definition} - [${dp.value}][${dp.unit}]` : `${dp.definition} - [${dp.value}]`;
}

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
