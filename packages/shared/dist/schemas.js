"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CleanedScrapeResult = exports.CleaningStats = exports.DroppedPage = exports.DroppedPageReason = exports.CleanedPage = exports.ResumeStepDto = exports.ScrapeResult = exports.ScrapeFailure = exports.ScrapeAttempt = exports.ScrapePage = exports.StartRunDto = exports.RunInput = exports.ProjectConfig = exports.ResearchBriefing = exports.ResearchSource = exports.ResearchEffort = exports.TemplateStepsDef = exports.StepDef = exports.StepStatus = exports.RunStatus = void 0;
const zod_1 = require("zod");
exports.RunStatus = zod_1.z.enum([
    "pending",
    "running",
    "awaiting_approval",
    "completed",
    "failed",
    "cancelled",
]);
exports.StepStatus = zod_1.z.enum([
    "pending",
    "running",
    "completed",
    "failed",
    "skipped",
]);
exports.StepDef = zod_1.z.object({
    key: zod_1.z.string().min(1),
    type: zod_1.z.string().min(1),
    auto: zod_1.z.boolean(),
    model: zod_1.z.string().optional(),
});
exports.TemplateStepsDef = zod_1.z.object({
    steps: zod_1.z.array(exports.StepDef).min(1),
});
exports.ResearchEffort = zod_1.z.enum(["lite", "standard", "deep", "exhaustive"]);
exports.ResearchSource = zod_1.z.object({
    url: zod_1.z.string().url(),
    title: zod_1.z.string().optional(),
    snippets: zod_1.z.string().array().default([]),
});
exports.ResearchBriefing = zod_1.z.object({
    content: zod_1.z.string(),
    sources: exports.ResearchSource.array(),
});
exports.ProjectConfig = zod_1.z.object({
    toneOfVoice: zod_1.z.string().default(""),
    targetAudience: zod_1.z.string().default(""),
    guidelines: zod_1.z.string().default(""),
    defaultModels: zod_1.z
        .object({
        research: zod_1.z.string().optional(),
        brief: zod_1.z.string().optional(),
        draft: zod_1.z.string().optional(),
        edit: zod_1.z.string().optional(),
        seo: zod_1.z.string().optional(),
    })
        .default({}),
    researchEffort: exports.ResearchEffort.optional(),
    promptOverrides: zod_1.z.record(zod_1.z.string()).default({}),
});
exports.RunInput = zod_1.z.object({
    topic: zod_1.z.string().min(3),
    mainKeyword: zod_1.z.string().optional(),
    intent: zod_1.z.string().optional(),
    contentType: zod_1.z.string().optional(),
});
exports.StartRunDto = zod_1.z.object({
    projectId: zod_1.z.string().uuid(),
    templateId: zod_1.z.string().uuid(),
    input: exports.RunInput,
});
exports.ScrapePage = zod_1.z.object({
    url: zod_1.z.string().url(),
    title: zod_1.z.string(),
    markdown: zod_1.z.string(),
    rawLength: zod_1.z.number().int().nonnegative(),
    truncated: zod_1.z.boolean(),
    source: zod_1.z.enum(["crawl4ai", "firecrawl"]),
    fetchedAt: zod_1.z.string().datetime(),
});
exports.ScrapeAttempt = zod_1.z.object({
    source: zod_1.z.enum(["crawl4ai", "firecrawl"]),
    reason: zod_1.z.string(),
    httpStatus: zod_1.z.number().int().optional(),
});
exports.ScrapeFailure = zod_1.z.object({
    url: zod_1.z.string().url(),
    reason: zod_1.z.string(),
    httpStatus: zod_1.z.number().int().optional(),
    attempts: exports.ScrapeAttempt.array().optional(),
});
exports.ScrapeResult = zod_1.z.object({
    pages: exports.ScrapePage.array(),
    failures: exports.ScrapeFailure.array(),
});
exports.ResumeStepDto = zod_1.z.object({
    input: zod_1.z.object({
        urls: zod_1.z.string().url().array().min(1).max(5),
    }),
});
exports.CleanedPage = zod_1.z.object({
    url: zod_1.z.string().url(),
    title: zod_1.z.string(),
    fetchedAt: zod_1.z.string().datetime(),
    markdown: zod_1.z.string(),
    paragraphs: zod_1.z.string().array(),
    originalChars: zod_1.z.number().int().nonnegative(),
    cleanedChars: zod_1.z.number().int().nonnegative(),
    removedParagraphs: zod_1.z.number().int().nonnegative(),
});
exports.DroppedPageReason = zod_1.z.enum([
    "similar_to_kept",
    "all_paragraphs_filtered",
    "empty_after_cleanup",
]);
exports.DroppedPage = zod_1.z.object({
    url: zod_1.z.string().url(),
    reason: exports.DroppedPageReason,
    similarToUrl: zod_1.z.string().url().optional(),
    similarity: zod_1.z.number().optional(),
});
exports.CleaningStats = zod_1.z.object({
    inputPages: zod_1.z.number().int().nonnegative(),
    keptPages: zod_1.z.number().int().nonnegative(),
    inputChars: zod_1.z.number().int().nonnegative(),
    outputChars: zod_1.z.number().int().nonnegative(),
    reductionPct: zod_1.z.number(),
    blacklistedRemoved: zod_1.z.number().int().nonnegative(),
    keywordFilteredRemoved: zod_1.z.number().int().nonnegative(),
    crossPageDupesRemoved: zod_1.z.number().int().nonnegative(),
});
exports.CleanedScrapeResult = zod_1.z.object({
    pages: exports.CleanedPage.array(),
    droppedPages: exports.DroppedPage.array(),
    stats: exports.CleaningStats,
});
