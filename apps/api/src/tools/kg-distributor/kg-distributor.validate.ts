import type {
  SectionWithKG,
  KnowledgeGraph,
  DistributionWarning,
  DistributionStats,
  CoverageBlock,
} from "@sensai/shared";

export interface ValidateInput {
  sections: SectionWithKG[];
  kg: KnowledgeGraph;
  minPercent: number;
  maxPercent: number;
}

export interface ValidateOutput {
  stats: DistributionStats;
  warnings: DistributionWarning[];
}

const WEIGHTS = { entities: 2, facts: 2, ideations: 1, relationships: 1, measurables: 1 } as const;

export function validateDistribution(input: ValidateInput): ValidateOutput {
  const { sections, kg, minPercent, maxPercent } = input;
  const warnings: DistributionWarning[] = [];

  // Count usage across all sections.
  let usedE = 0, usedF = 0, usedR = 0, usedI = 0, usedM = 0;
  for (const s of sections) {
    usedE += s.entities.length;
    usedF += s.facts.length;
    usedR += s.relationships.length;
    usedI += s.ideations.length;
    usedM += s.measurables.length;
  }

  const block = (used: number, total: number): CoverageBlock => ({
    used,
    total,
    percent: total === 0 ? 0 : Math.round((used / total) * 100 * 100) / 100,
  });

  const coverage = {
    entities: block(usedE, kg.entities.length),
    facts: block(usedF, kg.facts.length),
    relationships: block(usedR, kg.relationships.length),
    ideations: block(usedI, kg.ideations.length),
    measurables: block(usedM, kg.measurables.length),
    overallPercent: 0,
  };

  // Weighted overall: sum(used * weight) / sum(total * weight)
  const weightedUsed =
    usedE * WEIGHTS.entities +
    usedF * WEIGHTS.facts +
    usedR * WEIGHTS.relationships +
    usedI * WEIGHTS.ideations +
    usedM * WEIGHTS.measurables;
  const weightedTotal =
    kg.entities.length * WEIGHTS.entities +
    kg.facts.length * WEIGHTS.facts +
    kg.relationships.length * WEIGHTS.relationships +
    kg.ideations.length * WEIGHTS.ideations +
    kg.measurables.length * WEIGHTS.measurables;
  coverage.overallPercent =
    weightedTotal === 0 ? 0 : Math.round((weightedUsed / weightedTotal) * 100 * 100) / 100;

  if (coverage.overallPercent < minPercent) {
    warnings.push({
      kind: "distribution_low_coverage",
      message: `Overall coverage ${coverage.overallPercent}% is below minimum ${minPercent}%`,
      context: { overallPercent: String(coverage.overallPercent), threshold: String(minPercent) },
    });
  }
  if (coverage.overallPercent > maxPercent) {
    warnings.push({
      kind: "distribution_high_coverage",
      message: `Overall coverage ${coverage.overallPercent}% exceeds maximum ${maxPercent}%`,
      context: { overallPercent: String(coverage.overallPercent), threshold: String(maxPercent) },
    });
  }

  // Intro overload check.
  for (const s of sections) {
    if (s.type !== "intro") continue;
    if (s.entities.length > 3 || s.facts.length > 2) {
      warnings.push({
        kind: "distribution_intro_overload",
        message: `Intro has ${s.entities.length} entities and ${s.facts.length} facts (target ≤3 entities and ≤2 facts)`,
        context: { entities: String(s.entities.length), facts: String(s.facts.length) },
      });
    }
  }

  // Empty full section check.
  for (const s of sections) {
    if (s.type !== "h2") continue;
    if (s.sectionVariant !== "full") continue;
    const total =
      s.entities.length +
      s.facts.length +
      s.relationships.length +
      s.ideations.length +
      s.measurables.length;
    if (total === 0) {
      warnings.push({
        kind: "distribution_empty_full_section",
        message: `Full section "${s.header}" (order=${s.order}) has zero KG items`,
        context: { order: String(s.order), header: s.header },
      });
    }
  }

  return { stats: { coverage }, warnings };
}
