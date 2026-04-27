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
});
export type RunInput = z.infer<typeof RunInput>;

export const StartRunDto = z.object({
  projectId: z.string().uuid(),
  templateId: z.string().uuid(),
  input: RunInput,
});
export type StartRunDto = z.infer<typeof StartRunDto>;

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
      evergreenTopic: z.string().max(120).default(""),
      evergreenQuestion: z.string().max(300).default(""),
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
