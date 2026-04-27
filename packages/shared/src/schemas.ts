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
