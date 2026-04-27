"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RerunPreview = exports.ExtractionResult = exports.Ideation = exports.IdeationType = exports.DataPoint = exports.Fact = exports.Priority = exports.FactCategory = exports.ExtractionMetadata = exports.CleanedScrapeResult = exports.CleaningStats = exports.DroppedPage = exports.DroppedPageReason = exports.CleanedPage = exports.ResumeStepDto = exports.ScrapeResult = exports.ScrapeFailure = exports.ScrapeAttempt = exports.ScrapePage = exports.StartRunDto = exports.RunInput = exports.ProjectConfig = exports.ResearchBriefing = exports.ResearchSource = exports.ResearchEffort = exports.TemplateStepsDef = exports.StepDef = exports.StepStatus = exports.RunStatus = void 0;
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
    dependsOn: zod_1.z.string().array().optional(),
});
exports.TemplateStepsDef = zod_1.z
    .object({
    steps: zod_1.z.array(exports.StepDef).min(1),
})
    .superRefine((val, ctx) => {
    const keys = val.steps.map((s) => s.key);
    const indexByKey = new Map(keys.map((k, i) => [k, i]));
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    if (dupes.length > 0) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: `Duplicate stepKey(s): ${dupes.join(", ")}`,
            path: ["steps"],
        });
    }
    val.steps.forEach((step, i) => {
        if (!step.dependsOn)
            return;
        for (const dep of step.dependsOn) {
            const depIdx = indexByKey.get(dep);
            if (depIdx === undefined) {
                ctx.addIssue({
                    code: zod_1.z.ZodIssueCode.custom,
                    message: `Step "${step.key}" depends on unknown step "${dep}"`,
                    path: ["steps", i, "dependsOn"],
                });
            }
            else if (depIdx >= i) {
                ctx.addIssue({
                    code: zod_1.z.ZodIssueCode.custom,
                    message: `Step "${step.key}" depends on "${dep}" which is not an earlier step`,
                    path: ["steps", i, "dependsOn"],
                });
            }
        }
    });
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
        urls: zod_1.z.string().url().array().min(1).max(10),
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
    "char_limit_reached",
    "all_paragraphs_filtered",
    "empty_after_cleanup",
]);
exports.DroppedPage = zod_1.z.object({
    url: zod_1.z.string().url(),
    reason: exports.DroppedPageReason,
    similarToUrl: zod_1.z.string().url().optional(),
    similarity: zod_1.z.number().min(-1).max(1).optional(),
});
exports.CleaningStats = zod_1.z.object({
    inputPages: zod_1.z.number().int().nonnegative(),
    keptPages: zod_1.z.number().int().nonnegative(),
    inputChars: zod_1.z.number().int().nonnegative(),
    outputChars: zod_1.z.number().int().nonnegative(),
    reductionPct: zod_1.z.number().min(0).max(100),
    blacklistedRemoved: zod_1.z.number().int().nonnegative(),
    keywordFilteredRemoved: zod_1.z.number().int().nonnegative(),
    crossPageDupesRemoved: zod_1.z.number().int().nonnegative(),
});
exports.CleanedScrapeResult = zod_1.z.object({
    pages: exports.CleanedPage.array(),
    droppedPages: exports.DroppedPage.array(),
    stats: exports.CleaningStats,
});
exports.ExtractionMetadata = zod_1.z.object({
    keyword: zod_1.z.string().min(1),
    language: zod_1.z.string().min(2).max(10),
    sourceUrlCount: zod_1.z.number().int().nonnegative(),
    createdAt: zod_1.z.string().datetime(),
});
exports.FactCategory = zod_1.z.enum(["definition", "causal", "general"]);
exports.Priority = zod_1.z.enum(["high", "medium", "low"]);
exports.Fact = zod_1.z.object({
    id: zod_1.z.string().regex(/^F\d+$/, "id must be F<number>"),
    text: zod_1.z.string().min(1).max(400),
    category: exports.FactCategory,
    priority: exports.Priority,
    confidence: zod_1.z.number().min(0).max(1),
    sourceUrls: zod_1.z.string().url().array().default([]),
});
exports.DataPoint = zod_1.z.object({
    id: zod_1.z.string().regex(/^D\d+$/, "id must be D<number>"),
    definition: zod_1.z.string().min(1).max(200),
    value: zod_1.z.string().min(1).max(60),
    unit: zod_1.z.string().max(40).nullable(),
    sourceUrls: zod_1.z.string().url().array().default([]),
});
exports.IdeationType = zod_1.z.enum(["checklist", "mini_course", "info_box", "habit"]);
exports.Ideation = zod_1.z.object({
    id: zod_1.z.string().regex(/^I\d+$/, "id must be I<number>"),
    type: exports.IdeationType,
    title: zod_1.z.string().min(1).max(120),
    description: zod_1.z.string().min(1).max(400),
    audience: zod_1.z.string().max(200).default(""),
    channels: zod_1.z.string().array().default([]),
    keywords: zod_1.z.string().array().default([]),
    priority: exports.Priority,
});
exports.ExtractionResult = zod_1.z.object({
    metadata: exports.ExtractionMetadata,
    facts: exports.Fact.array().min(5),
    data: exports.DataPoint.array().min(3),
    ideations: exports.Ideation.array().min(3),
});
exports.RerunPreview = zod_1.z.object({
    target: zod_1.z.string(),
    downstream: zod_1.z.string().array(),
});
