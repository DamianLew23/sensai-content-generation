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
});
export type StepDef = z.infer<typeof StepDef>;

export const TemplateStepsDef = z.object({
  steps: z.array(StepDef).min(1),
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
    urls: z.string().url().array().min(1).max(5),
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
