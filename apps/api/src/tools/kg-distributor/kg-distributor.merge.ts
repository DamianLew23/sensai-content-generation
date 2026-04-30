import type {
  OutlineGenerationResult,
  KnowledgeGraph,
  SectionWithKG,
  IntroSectionWithKG,
  FullSectionWithKG,
  ContextSectionWithKG,
  Entity,
  Fact,
  KGRelationship,
  Ideation,
  KGMeasurable,
  DistributionWarning,
  UnusedKGItems,
  DistributionWarningKind,
} from "@sensai/shared";
import type { LLMDistributionMapping } from "./kg-distributor.types";

export interface MergeInput {
  outline: OutlineGenerationResult;
  kg: KnowledgeGraph;
  mapping: LLMDistributionMapping;
}

export interface MergeOutput {
  sections: SectionWithKG[];
  unused: UnusedKGItems;
  warnings: DistributionWarning[];
}

export function mergeDistribution(input: MergeInput): MergeOutput {
  const { outline, kg, mapping } = input;
  const warnings: DistributionWarning[] = [];

  // Build lookups.
  const entityById = new Map(kg.entities.map(e => [e.id, e] as const));
  const factById = new Map(kg.facts.map(f => [f.id, f] as const));
  const relById = new Map(kg.relationships.map(r => [r.id, r] as const));
  const ideationById = new Map(kg.ideations.map(i => [i.id, i] as const));
  const measurableById = new Map(kg.measurables.map(m => [m.id, m] as const));

  // Track used IDs for dedup + unused computation.
  const usedEntities = new Set<string>();
  const usedFacts = new Set<string>();
  const usedRels = new Set<string>();
  const usedIdeations = new Set<string>();
  const usedMeasurables = new Set<string>();

  // Sort outline sections by order to ensure deterministic dedup precedence.
  const sortedOutline = [...outline.outline].sort((a, b) => a.order - b.order);

  const sections: SectionWithKG[] = [];

  for (const section of sortedOutline) {
    const orderKey = String(section.order);
    const m = mapping.distribution[orderKey];

    const ents: Entity[] = [];
    const facts: Fact[] = [];
    const rels: KGRelationship[] = [];
    const ideations: Ideation[] = [];
    const measurables: KGMeasurable[] = [];

    if (m) {
      for (const id of m.entityIds) {
        const e = entityById.get(id);
        if (!e) {
          warnings.push(unknownIdWarning("distribution_unknown_entity_id", id, section.order));
          continue;
        }
        if (usedEntities.has(id)) {
          warnings.push(duplicateWarning("distribution_duplicate_entity", id, section.order));
          continue;
        }
        usedEntities.add(id);
        ents.push(e);
      }
      for (const id of m.factIds) {
        const f = factById.get(id);
        if (!f) {
          warnings.push(unknownIdWarning("distribution_unknown_fact_id", id, section.order));
          continue;
        }
        if (usedFacts.has(id)) {
          warnings.push(duplicateWarning("distribution_duplicate_fact", id, section.order));
          continue;
        }
        usedFacts.add(id);
        facts.push(f);
      }
      for (const id of m.relationshipIds) {
        const r = relById.get(id);
        if (!r) {
          warnings.push(unknownIdWarning("distribution_unknown_relationship_id", id, section.order));
          continue;
        }
        if (usedRels.has(id)) {
          warnings.push(duplicateWarning("distribution_duplicate_relationship", id, section.order));
          continue;
        }
        usedRels.add(id);
        rels.push(r);
      }
      for (const id of m.ideationIds) {
        const i = ideationById.get(id);
        if (!i) {
          warnings.push(unknownIdWarning("distribution_unknown_ideation_id", id, section.order));
          continue;
        }
        if (usedIdeations.has(id)) {
          warnings.push(duplicateWarning("distribution_duplicate_ideation", id, section.order));
          continue;
        }
        usedIdeations.add(id);
        ideations.push(i);
      }
      for (const id of m.measurableIds) {
        const me = measurableById.get(id);
        if (!me) {
          warnings.push(unknownIdWarning("distribution_unknown_measurable_id", id, section.order));
          continue;
        }
        if (usedMeasurables.has(id)) {
          warnings.push(duplicateWarning("distribution_duplicate_measurable", id, section.order));
          continue;
        }
        usedMeasurables.add(id);
        measurables.push(me);
      }
    }

    if (section.type === "intro") {
      const s: IntroSectionWithKG = { ...section, entities: ents, facts, relationships: rels, ideations, measurables };
      sections.push(s);
    } else if (section.sectionVariant === "full") {
      const s: FullSectionWithKG = { ...section, entities: ents, facts, relationships: rels, ideations, measurables };
      sections.push(s);
    } else {
      const s: ContextSectionWithKG = { ...section, entities: ents, facts, relationships: rels, ideations, measurables };
      sections.push(s);
    }
  }

  const unused: UnusedKGItems = {
    entityIds: kg.entities.map(e => e.id).filter(id => !usedEntities.has(id)),
    factIds: kg.facts.map(f => f.id).filter(id => !usedFacts.has(id)),
    relationshipIds: kg.relationships.map(r => r.id).filter(id => !usedRels.has(id)),
    ideationIds: kg.ideations.map(i => i.id).filter(id => !usedIdeations.has(id)),
    measurableIds: kg.measurables.map(m => m.id).filter(id => !usedMeasurables.has(id)),
  };

  return { sections, unused, warnings };
}

function unknownIdWarning(kind: DistributionWarningKind, id: string, order: number): DistributionWarning {
  return {
    kind,
    message: `Unknown ID "${id}" referenced by section order=${order}`,
    context: { id, order: String(order) },
  };
}

function duplicateWarning(kind: DistributionWarningKind, id: string, order: number): DistributionWarning {
  return {
    kind,
    message: `Duplicate ID "${id}" — already used in lower-order section; dropping from order=${order}`,
    context: { id, order: String(order) },
  };
}
