import { z } from "zod";

export const RunStatus = z.enum([
  "pending",
  "running",
  "awaiting_approval",
  "completed",
  "failed",
  "cancelled",
]);
export type RunStatus = z.infer<typeof RunStatus>;

export const StepStatus = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "skipped",
]);
export type StepStatus = z.infer<typeof StepStatus>;

export const StepDef = z.object({
  key: z.string().min(1),
  type: z.string().min(1),
  auto: z.boolean(),
  model: z.string().optional(),
  dependsOn: z.string().array().optional(),
});
export type StepDef = z.infer<typeof StepDef>;

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

export const ResearchEffort = z.enum(["lite", "standard", "deep", "exhaustive"]);
export type ResearchEffort = z.infer<typeof ResearchEffort>;

export const ResearchSource = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  snippets: z.string().array().default([]),
});
export type ResearchSource = z.infer<typeof ResearchSource>;

export const ResearchBriefing = z.object({
  content: z.string(),
  sources: ResearchSource.array(),
});
export type ResearchBriefing = z.infer<typeof ResearchBriefing>;

export const ProjectConfig = z.object({
  toneOfVoice: z.string().default(""),
  targetAudience: z.string().default(""),
  guidelines: z.string().default(""),
  defaultModels: z
    .object({
      research: z.string().optional(),
      brief: z.string().optional(),
      draft: z.string().optional(),
      edit: z.string().optional(),
      seo: z.string().optional(),
    })
    .default({}),
  researchEffort: ResearchEffort.optional(),
  promptOverrides: z.record(z.string()).default({}),
});
export type ProjectConfig = z.infer<typeof ProjectConfig>;

export const RunInput = z.object({
  topic: z.string().min(3),
  mainKeyword: z.string().optional(),
  intent: z.string().optional(),
  contentType: z.string().optional(),
  h1Title: z.string().min(3).max(300).optional(),
});
export type RunInput = z.infer<typeof RunInput>;

export const StartRunDto = z.object({
  projectId: z.string().uuid(),
  templateId: z.string().uuid(),
  input: RunInput,
});
export type StartRunDto = z.infer<typeof StartRunDto>;

export const ProjectSlug = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be kebab-case (a-z, 0-9, '-')");

export const CreateProjectDto = z.object({
  slug: ProjectSlug,
  name: z.string().min(2).max(120),
  config: ProjectConfig,
});
export type CreateProjectDto = z.infer<typeof CreateProjectDto>;

export const ScrapePage = z.object({
  url: z.string().url(),
  title: z.string(),
  markdown: z.string(),
  rawLength: z.number().int().nonnegative(),
  truncated: z.boolean(),
  source: z.enum(["crawl4ai", "firecrawl"]),
  fetchedAt: z.string().datetime(),
});
export type ScrapePage = z.infer<typeof ScrapePage>;

export const ScrapeAttempt = z.object({
  source: z.enum(["crawl4ai", "firecrawl"]),
  reason: z.string(),
  httpStatus: z.number().int().optional(),
});
export type ScrapeAttempt = z.infer<typeof ScrapeAttempt>;

export const ScrapeFailure = z.object({
  url: z.string().url(),
  reason: z.string(),
  httpStatus: z.number().int().optional(),
  attempts: ScrapeAttempt.array().optional(),
});
export type ScrapeFailure = z.infer<typeof ScrapeFailure>;

export const ScrapeResult = z.object({
  pages: ScrapePage.array(),
  failures: ScrapeFailure.array(),
});
export type ScrapeResult = z.infer<typeof ScrapeResult>;

export const ResumeStepDto = z.object({
  input: z.object({
    urls: z.string().url().array().min(1).max(10),
  }),
});
export type ResumeStepDto = z.infer<typeof ResumeStepDto>;

export const CleanedPage = z.object({
  url: z.string().url(),
  title: z.string(),
  fetchedAt: z.string().datetime(),
  markdown: z.string(),
  paragraphs: z.string().array(),
  originalChars: z.number().int().nonnegative(),
  cleanedChars: z.number().int().nonnegative(),
  removedParagraphs: z.number().int().nonnegative(),
});
export type CleanedPage = z.infer<typeof CleanedPage>;

export const DroppedPageReason = z.enum([
  "similar_to_kept",
  "char_limit_reached",
  "all_paragraphs_filtered",
  "empty_after_cleanup",
]);
export type DroppedPageReason = z.infer<typeof DroppedPageReason>;

export const DroppedPage = z.object({
  url: z.string().url(),
  reason: DroppedPageReason,
  similarToUrl: z.string().url().optional(),
  similarity: z.number().min(-1).max(1).optional(),
});
export type DroppedPage = z.infer<typeof DroppedPage>;

export const CleaningStats = z.object({
  inputPages: z.number().int().nonnegative(),
  keptPages: z.number().int().nonnegative(),
  inputChars: z.number().int().nonnegative(),
  outputChars: z.number().int().nonnegative(),
  reductionPct: z.number().min(0).max(100),
  blacklistedRemoved: z.number().int().nonnegative(),
  keywordFilteredRemoved: z.number().int().nonnegative(),
  crossPageDupesRemoved: z.number().int().nonnegative(),
});
export type CleaningStats = z.infer<typeof CleaningStats>;

export const CleanedScrapeResult = z.object({
  pages: CleanedPage.array(),
  droppedPages: DroppedPage.array(),
  stats: CleaningStats,
});
export type CleanedScrapeResult = z.infer<typeof CleanedScrapeResult>;

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

export const RerunPreview = z.object({
  target: z.string(),
  downstream: z.string().array(),
});
export type RerunPreview = z.infer<typeof RerunPreview>;

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

export const IntentName = z.enum([
  "Definicyjna",
  "Problemowa",
  "Instrukcyjna",
  "Decyzyjna",
  "Diagnostyczna",
  "Porównawcza",
]);
export type IntentName = z.infer<typeof IntentName>;

export const FanOutClassification = z.enum(["MICRO", "MACRO"]);
export type FanOutClassification = z.infer<typeof FanOutClassification>;

export const FanOutArea = z.object({
  id: z.string().regex(/^A\d+$/, "id must be A<number>"),
  topic: z.string().min(1).max(120),
  question: z.string().min(1).max(300),
  ymyl: z.boolean(),
  classification: FanOutClassification,
  evergreenTopic: z.string().max(120).default(""),
  evergreenQuestion: z.string().max(300).default(""),
});
export type FanOutArea = z.infer<typeof FanOutArea>;

export const FanOutIntent = z.object({
  name: IntentName,
  areas: FanOutArea.array().min(1).max(5),
});
export type FanOutIntent = z.infer<typeof FanOutIntent>;

export const PaaMapping = z.object({
  areaId: z.string().regex(/^A\d+$/),
  question: z.string().min(1).max(500),
});
export type PaaMapping = z.infer<typeof PaaMapping>;

export const QueryFanOutMetadata = z.object({
  keyword: z.string().min(1),
  language: z.string().min(2).max(10),
  paaFetched: z.number().int().nonnegative(),
  paaUsed: z.boolean(),
  createdAt: z.string().datetime(),
});
export type QueryFanOutMetadata = z.infer<typeof QueryFanOutMetadata>;

export const QueryFanOutResult = z
  .object({
    metadata: QueryFanOutMetadata,
    normalization: z.object({
      mainEntity: z.string().min(1).max(200),
      category: z.string().min(1).max(120),
      ymylRisk: z.boolean(),
    }),
    intents: FanOutIntent.array().min(1),
    dominantIntent: IntentName,
    paaMapping: PaaMapping.array(),
    unmatchedPaa: z.string().array(),
  })
  .superRefine((val, ctx) => {
    const areaIds: string[] = [];
    for (const intent of val.intents) {
      for (const area of intent.areas) areaIds.push(area.id);
    }
    const areaIdSet = new Set(areaIds);

    if (areaIdSet.size !== areaIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "duplicate area ids across intents",
        path: ["intents"],
      });
    }

    const intentNames = new Set(val.intents.map((i) => i.name));
    if (!intentNames.has(val.dominantIntent)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `dominantIntent "${val.dominantIntent}" is not in intents[]`,
        path: ["dominantIntent"],
      });
    }

    val.paaMapping.forEach((m, i) => {
      if (!areaIdSet.has(m.areaId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `paaMapping[${i}].areaId "${m.areaId}" is unknown`,
          path: ["paaMapping", i, "areaId"],
        });
      }
    });

    for (const intent of val.intents) {
      intent.areas.forEach((area) => {
        if (area.classification === "MACRO" && area.evergreenTopic.trim() === "") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `area ${area.id} is MACRO but has empty evergreenTopic`,
            path: ["intents"],
          });
        }
      });
    }

    if (!val.metadata.paaUsed) {
      if (val.paaMapping.length > 0 || val.unmatchedPaa.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "paaUsed=false but paaMapping or unmatchedPaa is non-empty",
          path: ["metadata", "paaUsed"],
        });
      }
    }
  });
export type QueryFanOutResult = z.infer<typeof QueryFanOutResult>;

export const FanOutIntentsCall = z.object({
  normalization: z.object({
    mainEntity: z.string().min(1).max(200),
    category: z.string().min(1).max(120),
    ymylRisk: z.boolean(),
  }),
  intents: z
    .object({
      name: IntentName,
      areas: z
        .object({
          id: z.string().regex(/^A\d+$/),
          topic: z.string().min(1).max(120),
          question: z.string().min(1).max(300),
          ymyl: z.boolean(),
        })
        .array()
        .min(1)
        .max(5),
    })
    .array()
    .min(1),
});
export type FanOutIntentsCall = z.infer<typeof FanOutIntentsCall>;

export const FanOutClassifyCall = z.object({
  classifications: z
    .object({
      areaId: z.string().regex(/^A\d+$/),
      classification: FanOutClassification,
      evergreenTopic: z.string().max(120),
      evergreenQuestion: z.string().max(300),
    })
    .array()
    .min(1),
  dominantIntent: IntentName,
});
export type FanOutClassifyCall = z.infer<typeof FanOutClassifyCall>;

export const FanOutPaaCall = z.object({
  assignments: z
    .object({
      areaId: z.string().regex(/^A\d+$/),
      question: z.string().min(1).max(500),
    })
    .array(),
  unmatched: z.string().array(),
});
export type FanOutPaaCall = z.infer<typeof FanOutPaaCall>;

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
  id: z.string().min(1),
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

// ===== Plan 12 — Outline & Distribution =====

// --- Outline shared primitives ---

export const SectionType = z.enum(["intro", "h2"]);
export type SectionType = z.infer<typeof SectionType>;

export const SectionVariant = z.enum(["full", "context"]);
export type SectionVariant = z.infer<typeof SectionVariant>;

export const H3Format = z.enum(["question", "context"]);
export type H3Format = z.infer<typeof H3Format>;

export const OutlineH3 = z.object({
  header: z.string().min(1).max(200),
  format: H3Format,
  sourcePaa: z.string().min(1),
});
export type OutlineH3 = z.infer<typeof OutlineH3>;

// --- Section variants ---

export const IntroSection = z.object({
  type: z.literal("intro"),
  order: z.literal(0),
  header: z.null(),
  sectionVariant: z.null(),
  h3s: z.tuple([]),
});
export type IntroSection = z.infer<typeof IntroSection>;

export const FullSection = z.object({
  type: z.literal("h2"),
  order: z.number().int().positive(),
  sectionVariant: z.literal("full"),
  header: z.string().min(1).max(200),
  sourceArea: z.string().min(1),
  sourceIntent: IntentName,
  h3s: OutlineH3.array(),
});
export type FullSection = z.infer<typeof FullSection>;

export const ContextSection = z.object({
  type: z.literal("h2"),
  order: z.number().int().positive(),
  sectionVariant: z.literal("context"),
  header: z.string().min(1).max(200),
  sourceIntent: IntentName,
  groupedAreas: z.string().array().min(1),
  contextNote: z.string().min(1).max(500),
  h3s: z.tuple([]),
});
export type ContextSection = z.infer<typeof ContextSection>;

// z.union (NOT discriminatedUnion) — Zod requires the discriminator literal at the
// top level of every branch, but Full/Context share `type: "h2"` and only differ on
// `sectionVariant`. Plain z.union parses correctly.
export const OutlineSection = z.union([
  IntroSection,
  FullSection,
  ContextSection,
]);
export type OutlineSection = z.infer<typeof OutlineSection>;

// --- outline.generate output ---

export const OutlineGenWarningKind = z.enum([
  "outline_missing_primary_intent_areas",
  "outline_h3_count_mismatch",
  "outline_unused_area",
  "outline_intent_override_no_match",
]);
export type OutlineGenWarningKind = z.infer<typeof OutlineGenWarningKind>;

export const OutlineGenWarning = z.object({
  kind: OutlineGenWarningKind,
  message: z.string().min(1),
  context: z.record(z.string()).default({}),
});
export type OutlineGenWarning = z.infer<typeof OutlineGenWarning>;

export const OutlineGenerationResult = z.object({
  meta: z.object({
    keyword: z.string().min(1),
    h1Title: z.string().min(1).max(300),
    h1Source: z.enum(["user", "llm"]),
    language: z.string().min(2).max(10),
    primaryIntent: IntentName,
    primaryIntentSource: z.enum(["user", "fanout"]),
    fullSectionsCount: z.number().int().nonnegative(),
    contextSectionsCount: z.number().int().nonnegative(),
    generatedAt: z.string().datetime(),
    model: z.string().min(1),
  }),
  outline: OutlineSection.array().min(1),
  warnings: OutlineGenWarning.array(),
});
export type OutlineGenerationResult = z.infer<typeof OutlineGenerationResult>;

// --- distribute output ---

const KGFieldsBlock = z.object({
  entities: Entity.array(),
  facts: Fact.array(),
  relationships: KGRelationship.array(),
  ideations: Ideation.array(),
  measurables: KGMeasurable.array(),
});

export const IntroSectionWithKG = IntroSection.merge(KGFieldsBlock);
export type IntroSectionWithKG = z.infer<typeof IntroSectionWithKG>;

export const FullSectionWithKG = FullSection.merge(KGFieldsBlock);
export type FullSectionWithKG = z.infer<typeof FullSectionWithKG>;

export const ContextSectionWithKG = ContextSection.merge(KGFieldsBlock);
export type ContextSectionWithKG = z.infer<typeof ContextSectionWithKG>;

export const SectionWithKG = z.union([
  IntroSectionWithKG,
  FullSectionWithKG,
  ContextSectionWithKG,
]);
export type SectionWithKG = z.infer<typeof SectionWithKG>;

export const DistributionWarningKind = z.enum([
  "distribution_duplicate_entity",
  "distribution_duplicate_fact",
  "distribution_duplicate_ideation",
  "distribution_duplicate_relationship",
  "distribution_duplicate_measurable",
  "distribution_intro_overload",
  "distribution_low_coverage",
  "distribution_high_coverage",
  "distribution_unknown_entity_id",
  "distribution_unknown_fact_id",
  "distribution_unknown_ideation_id",
  "distribution_unknown_relationship_id",
  "distribution_unknown_measurable_id",
  "distribution_empty_full_section",
]);
export type DistributionWarningKind = z.infer<typeof DistributionWarningKind>;

export const DistributionWarning = z.object({
  kind: DistributionWarningKind,
  message: z.string().min(1),
  context: z.record(z.string()).default({}),
});
export type DistributionWarning = z.infer<typeof DistributionWarning>;

export const CoverageBlock = z.object({
  used: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  percent: z.number().min(0).max(100),
});
export type CoverageBlock = z.infer<typeof CoverageBlock>;

export const DistributionStats = z.object({
  coverage: z.object({
    entities: CoverageBlock,
    facts: CoverageBlock,
    relationships: CoverageBlock,
    ideations: CoverageBlock,
    measurables: CoverageBlock,
    overallPercent: z.number().min(0).max(100),
  }),
});
export type DistributionStats = z.infer<typeof DistributionStats>;

export const UnusedKGItems = z.object({
  entityIds: z.string().array(),
  factIds: z.string().array(),
  relationshipIds: z.string().array(),
  ideationIds: z.string().array(),
  measurableIds: z.string().array(),
});
export type UnusedKGItems = z.infer<typeof UnusedKGItems>;

export const DistributionResult = z.object({
  meta: z.object({
    keyword: z.string().min(1),
    h1Title: z.string().min(1).max(300),
    language: z.string().min(2).max(10),
    primaryIntent: IntentName,
    generatedAt: z.string().datetime(),
    model: z.string().min(1),
  }),
  sections: SectionWithKG.array().min(1),
  unused: UnusedKGItems,
  stats: DistributionStats,
  warnings: DistributionWarning.array(),
});
export type DistributionResult = z.infer<typeof DistributionResult>;

// ===== Plan 13 — Draft Generation =====

export const PassageTrigger = z.enum([
  "definition",
  "instruction",
  "cause",
  "comparison",
  "diagnosis",
  "list",
  "question",
]);
export type PassageTrigger = z.infer<typeof PassageTrigger>;

export const DraftBlockStats = z.object({
  sectionOrder: z.number().int().nonnegative(),
  sectionType: z.enum(["intro", "h2"]),
  sectionVariant: z.enum(["full", "context"]).nullable(),
  header: z.string().min(1).nullable(),
  passageTrigger: PassageTrigger,
  charCount: z.number().int().nonnegative(),
  responseId: z.string().min(1),
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  costUsd: z.string(),
  latencyMs: z.number().int().nonnegative(),
});
export type DraftBlockStats = z.infer<typeof DraftBlockStats>;

export const DraftImagePrompt = z.object({
  sectionHeader: z.string().min(1),
  ideationType: z.string().min(1),
  description: z.string().min(1),
  prompt: z.string().min(1),
});
export type DraftImagePrompt = z.infer<typeof DraftImagePrompt>;

export const DraftWarning = z.object({
  kind: z.enum([
    "draft_block_failed",
    "draft_chaining_disabled",
    "draft_no_image_prompts",
    "draft_short_block",
    "draft_factual_dedup_high_ratio",
  ]),
  message: z.string().min(1),
  blockOrder: z.number().int().nonnegative().optional(),
  context: z.record(z.string()).default({}),
});
export type DraftWarning = z.infer<typeof DraftWarning>;

export const DraftMeta = z.object({
  keyword: z.string().min(1),
  h1Title: z.string().min(1).max(300),
  language: z.string().min(2).max(10),
  primaryIntent: IntentName,
  model: z.string().min(1),
  generatedAt: z.string().datetime(),
  useReasoning: z.boolean(),
  reasoningEffort: z.enum(["low", "medium", "high"]).nullable(),
  verbosity: z.enum(["low", "medium", "high"]).nullable(),
});
export type DraftMeta = z.infer<typeof DraftMeta>;

export const DraftStats = z.object({
  blockCount: z.number().int().nonnegative(),
  totalChars: z.number().int().nonnegative(),
  totalLatencyMs: z.number().int().nonnegative(),
  totalCostUsd: z.string(),
  totalPromptTokens: z.number().int().nonnegative(),
  totalCompletionTokens: z.number().int().nonnegative(),
  imagePromptCount: z.number().int().nonnegative(),
});
export type DraftStats = z.infer<typeof DraftStats>;

export const DraftGenerationResult = z.object({
  meta: DraftMeta,
  htmlContent: z.string().min(1),
  blocks: DraftBlockStats.array().min(1),
  imagePrompts: DraftImagePrompt.array(),
  stats: DraftStats,
  warnings: DraftWarning.array(),
});
export type DraftGenerationResult = z.infer<typeof DraftGenerationResult>;

// ===== Plan 14 — Data Enrichment =====

export const ClaimType = z.enum([
  "statystyka",
  "konkretna_data",
  "trend",
  "norma_medyczna",
  "porownanie",
  "datowane_zdarzenie",
  "legislacja",
  "organizacja",
]);
export type ClaimType = z.infer<typeof ClaimType>;

export const ClaimTagName = z.enum(["p", "li", "td"]);
export type ClaimTagName = z.infer<typeof ClaimTagName>;

export const ExtractedClaim = z.object({
  id: z.number().int().positive(),
  paragraphHtml: z.string().min(1),
  claimText: z.string().min(1).max(500),
  context: z.string().min(1),
  claimTypes: ClaimType.array().min(1),
  score: z.number().int().nonnegative(),
  h2Context: z.string().min(1),
  tagName: ClaimTagName,
  question: z.string().optional(),
});
export type ExtractedClaim = z.infer<typeof ExtractedClaim>;

export const VerificationStatus = z.enum(["confirmed", "corrected", "unverified"]);
export type VerificationStatus = z.infer<typeof VerificationStatus>;

export const ClaimVerification = z.object({
  claimId: z.number().int().positive(),
  status: VerificationStatus,
  source: z.string().default(""),
  sourceUrl: z.string().default(""),
  correctedValue: z.string().optional(),
  note: z.string().default(""),
});
export type ClaimVerification = z.infer<typeof ClaimVerification>;

export const EnrichmentWarning = z.object({
  kind: z.enum([
    "enrich_no_claims_found",
    "enrich_questions_failed",
    "enrich_verify_failed",
    "enrich_low_confirmation_rate",
    "enrich_invalid_url_skipped",
    "enrich_web_search_cost_untracked",
  ]),
  message: z.string().min(1),
  context: z.record(z.string()).default({}),
});
export type EnrichmentWarning = z.infer<typeof EnrichmentWarning>;

export const EnrichmentMeta = z.object({
  keyword: z.string().min(1),
  language: z.string().min(2).max(10),
  verifyModel: z.string().min(1),
  questionModel: z.string().min(1),
  generatedAt: z.string().datetime(),
});
export type EnrichmentMeta = z.infer<typeof EnrichmentMeta>;

export const EnrichmentStats = z.object({
  totalClaimsFound: z.number().int().nonnegative(),
  claimsVerified: z.number().int().nonnegative(),
  sourcesAdded: z.number().int().nonnegative(),
  correctionsFlagged: z.number().int().nonnegative(),
  unverified: z.number().int().nonnegative(),
  totalCostUsd: z.string(),
  totalLatencyMs: z.number().int().nonnegative(),
});
export type EnrichmentStats = z.infer<typeof EnrichmentStats>;

export const DataEnrichmentResult = z.object({
  meta: EnrichmentMeta,
  htmlContent: z.string().min(1),
  claims: ExtractedClaim.array(),
  verifications: ClaimVerification.array(),
  stats: EnrichmentStats,
  warnings: EnrichmentWarning.array(),
});
export type DataEnrichmentResult = z.infer<typeof DataEnrichmentResult>;

// ===== Plan 15 — Article Optimize + Intermediate =====

export const ArticlePostProductionMeta = z.object({
  keyword: z.string().min(1),
  language: z.string().min(2).max(10),
  model: z.string().min(1),
  promptVersion: z.string().min(1),
  generatedAt: z.string().datetime(),
});
export type ArticlePostProductionMeta = z.infer<typeof ArticlePostProductionMeta>;

export const ProtectionStats = z.object({
  srcPlaceholdersTotal: z.number().int().nonnegative(),
  srcPlaceholdersMissing: z.number().int().nonnegative(),
  spansTotal: z.number().int().nonnegative(),
  spansMissing: z.number().int().nonnegative(),
});
export type ProtectionStats = z.infer<typeof ProtectionStats>;

export const ArticleOptimizeWarning = z.object({
  kind: z.enum([
    "optimize_spans_missing",
    "optimize_anchors_unwrapped",
  ]),
  message: z.string().min(1),
  context: z.record(z.string()).default({}),
});
export type ArticleOptimizeWarning = z.infer<typeof ArticleOptimizeWarning>;

export const ArticleOptimizeStats = z.object({
  inputLength: z.number().int().nonnegative(),
  outputLength: z.number().int().nonnegative(),
  sourcesBefore: z.number().int().nonnegative(),
  sourcesAfter: z.number().int().nonnegative(),
  anchorsRemoved: z.number().int().nonnegative(),
  totalCostUsd: z.string(),
  totalLatencyMs: z.number().int().nonnegative(),
});
export type ArticleOptimizeStats = z.infer<typeof ArticleOptimizeStats>;

export const ArticleOptimizeResult = z.object({
  meta: ArticlePostProductionMeta,
  htmlContent: z.string().min(1),
  stats: ArticleOptimizeStats,
  protection: ProtectionStats,
  warnings: ArticleOptimizeWarning.array(),
});
export type ArticleOptimizeResult = z.infer<typeof ArticleOptimizeResult>;

export const FormattingCounts = z.object({
  strong: z.number().int().nonnegative(),
  italic: z.number().int().nonnegative(),
  blockquote: z.number().int().nonnegative(),
  br: z.number().int().nonnegative(),
});
export type FormattingCounts = z.infer<typeof FormattingCounts>;

export const ArticleIntermediateWarning = z.object({
  kind: z.enum([
    "intermediate_spans_missing",
  ]),
  message: z.string().min(1),
  context: z.record(z.string()).default({}),
});
export type ArticleIntermediateWarning = z.infer<typeof ArticleIntermediateWarning>;

export const ArticleIntermediateStats = z.object({
  inputLength: z.number().int().nonnegative(),
  outputLength: z.number().int().nonnegative(),
  growth: z.number(),
  sourcesBefore: z.number().int().nonnegative(),
  sourcesAfter: z.number().int().nonnegative(),
  formattingBefore: FormattingCounts,
  formattingAfter: FormattingCounts,
  totalCostUsd: z.string(),
  totalLatencyMs: z.number().int().nonnegative(),
});
export type ArticleIntermediateStats = z.infer<typeof ArticleIntermediateStats>;

export const ArticleIntermediateResult = z.object({
  meta: ArticlePostProductionMeta,
  htmlContent: z.string().min(1),
  stats: ArticleIntermediateStats,
  protection: ProtectionStats,
  warnings: ArticleIntermediateWarning.array(),
});
export type ArticleIntermediateResult = z.infer<typeof ArticleIntermediateResult>;

// ===== Plan 16 — Article Humanize =====

export const ArticleHumanizeWarning = z.object({
  kind: z.enum([
    "humanize_spans_missing",
    "humanize_language_probe",
    "humanize_low_burstiness",
    "humanize_retry_used",
    "humanize_retry_rejected_anchors",
  ]),
  message: z.string().min(1),
  context: z.record(z.string()).default({}),
});
export type ArticleHumanizeWarning = z.infer<typeof ArticleHumanizeWarning>;

export const ArticleHumanizeReadability = z.object({
  wordsTotal: z.number().int().nonnegative(),
  sentencesTotal: z.number().int().nonnegative(),
  avgSentenceLength: z.number().nonnegative(),
  longSentencesGtCap: z.number().int().nonnegative(),
  strongSpans: z.number().int().nonnegative(),
  boldTokenCount: z.number().int().nonnegative(),
  boldShare: z.number().nonnegative(),
});
export type ArticleHumanizeReadability = z.infer<typeof ArticleHumanizeReadability>;

export const ArticleHumanizeSentenceStats = z.object({
  varianceInput: z.number().nonnegative(),
  varianceOutput: z.number().nonnegative(),
  cvOutput: z.number().nonnegative(),
  minLength: z.number().int().nonnegative(),
  maxLength: z.number().int().nonnegative(),
  avgLength: z.number().nonnegative(),
});
export type ArticleHumanizeSentenceStats = z.infer<typeof ArticleHumanizeSentenceStats>;

export const ArticleHumanizeStats = z.object({
  inputLength: z.number().int().nonnegative(),
  outputLength: z.number().int().nonnegative(),
  ratio: z.number().nonnegative(),
  sourcesBefore: z.number().int().nonnegative(),
  sourcesAfter: z.number().int().nonnegative(),
  emDashesReplaced: z.number().int().nonnegative(),
  retryUsed: z.boolean(),
  retryAccepted: z.boolean(),
  readability: ArticleHumanizeReadability,
  sentence: ArticleHumanizeSentenceStats,
  totalCostUsd: z.string(),
  totalLatencyMs: z.number().int().nonnegative(),
});
export type ArticleHumanizeStats = z.infer<typeof ArticleHumanizeStats>;

export const ArticleHumanizeResult = z.object({
  meta: ArticlePostProductionMeta,
  htmlContent: z.string().min(1),
  stats: ArticleHumanizeStats,
  protection: ProtectionStats,
  warnings: ArticleHumanizeWarning.array(),
});
export type ArticleHumanizeResult = z.infer<typeof ArticleHumanizeResult>;
