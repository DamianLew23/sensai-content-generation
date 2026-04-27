"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FanOutPaaCall = exports.FanOutClassifyCall = exports.FanOutIntentsCall = exports.QueryFanOutResult = exports.QueryFanOutMetadata = exports.PaaMapping = exports.FanOutIntent = exports.FanOutArea = exports.FanOutClassification = exports.IntentName = exports.EntityExtractionResult = exports.RelationToMain = exports.EntityRelation = exports.Entity = exports.EntityExtractionMetadata = exports.ContextAnalysis = exports.RelationType = exports.EntityType = exports.RerunPreview = exports.ExtractionResult = exports.Ideation = exports.IdeationType = exports.DataPoint = exports.Fact = exports.Priority = exports.FactCategory = exports.ExtractionMetadata = exports.CleanedScrapeResult = exports.CleaningStats = exports.DroppedPage = exports.DroppedPageReason = exports.CleanedPage = exports.ResumeStepDto = exports.ScrapeResult = exports.ScrapeFailure = exports.ScrapeAttempt = exports.ScrapePage = exports.StartRunDto = exports.RunInput = exports.ProjectConfig = exports.ResearchBriefing = exports.ResearchSource = exports.ResearchEffort = exports.TemplateStepsDef = exports.StepDef = exports.StepStatus = exports.RunStatus = void 0;
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
exports.EntityType = zod_1.z.enum([
    "PERSON",
    "ORGANIZATION",
    "LOCATION",
    "PRODUCT",
    "CONCEPT",
    "EVENT",
]);
exports.RelationType = zod_1.z.enum([
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
exports.ContextAnalysis = zod_1.z.object({
    mainTopicInterpretation: zod_1.z.string().min(1).max(500),
    domainSummary: zod_1.z.string().min(1).max(500),
    notes: zod_1.z.string().max(500).default(""),
});
exports.EntityExtractionMetadata = zod_1.z.object({
    keyword: zod_1.z.string().min(1),
    language: zod_1.z.string().min(2).max(10),
    sourceUrlCount: zod_1.z.number().int().nonnegative(),
    createdAt: zod_1.z.string().datetime(),
});
exports.Entity = zod_1.z.object({
    id: zod_1.z.string().regex(/^E\d+$/, "id must be E<number>"),
    originalSurface: zod_1.z.string().min(1).max(200),
    entity: zod_1.z.string().min(1).max(200),
    domainType: exports.EntityType,
    evidence: zod_1.z.string().min(1).max(300),
});
exports.EntityRelation = zod_1.z.object({
    source: zod_1.z.string().regex(/^E\d+$/, "source must be E<number>"),
    target: zod_1.z.string().regex(/^E\d+$/, "target must be E<number>"),
    type: exports.RelationType,
    description: zod_1.z.string().min(1).max(300),
    evidence: zod_1.z.string().min(1).max(300),
});
exports.RelationToMain = zod_1.z.object({
    entityId: zod_1.z.string().regex(/^E\d+$/, "entityId must be E<number>"),
    score: zod_1.z.number().int().min(1).max(100),
    rationale: zod_1.z.string().min(1).max(300),
});
exports.EntityExtractionResult = zod_1.z
    .object({
    metadata: exports.EntityExtractionMetadata,
    contextAnalysis: exports.ContextAnalysis,
    entities: exports.Entity.array().min(8),
    relationships: exports.EntityRelation.array().min(3),
    relationToMain: exports.RelationToMain.array().min(8),
})
    .superRefine((val, ctx) => {
    const entityIds = new Set(val.entities.map((e) => e.id));
    // unique entity ids
    if (entityIds.size !== val.entities.length) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: "duplicate entity ids",
            path: ["entities"],
        });
    }
    // every relationship must reference known entities, no self-edges
    val.relationships.forEach((rel, i) => {
        if (!entityIds.has(rel.source)) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                message: `relationships[${i}].source references unknown entity ${rel.source}`,
                path: ["relationships", i, "source"],
            });
        }
        if (!entityIds.has(rel.target)) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                message: `relationships[${i}].target references unknown entity ${rel.target}`,
                path: ["relationships", i, "target"],
            });
        }
        if (rel.source === rel.target) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
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
                code: zod_1.z.ZodIssueCode.custom,
                message: `entity ${id} has no relationToMain entry`,
                path: ["relationToMain"],
            });
        }
    }
    // every relationToMain entry must reference a known entity
    val.relationToMain.forEach((rm, i) => {
        if (!entityIds.has(rm.entityId)) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                message: `relationToMain[${i}] references unknown entity ${rm.entityId}`,
                path: ["relationToMain", i, "entityId"],
            });
        }
    });
});
exports.IntentName = zod_1.z.enum([
    "Definicyjna",
    "Problemowa",
    "Instrukcyjna",
    "Decyzyjna",
    "Diagnostyczna",
    "Porównawcza",
]);
exports.FanOutClassification = zod_1.z.enum(["MICRO", "MACRO"]);
exports.FanOutArea = zod_1.z.object({
    id: zod_1.z.string().regex(/^A\d+$/, "id must be A<number>"),
    topic: zod_1.z.string().min(1).max(120),
    question: zod_1.z.string().min(1).max(300),
    ymyl: zod_1.z.boolean(),
    classification: exports.FanOutClassification,
    evergreenTopic: zod_1.z.string().max(120).default(""),
    evergreenQuestion: zod_1.z.string().max(300).default(""),
});
exports.FanOutIntent = zod_1.z.object({
    name: exports.IntentName,
    areas: exports.FanOutArea.array().min(1).max(5),
});
exports.PaaMapping = zod_1.z.object({
    areaId: zod_1.z.string().regex(/^A\d+$/),
    question: zod_1.z.string().min(1).max(500),
});
exports.QueryFanOutMetadata = zod_1.z.object({
    keyword: zod_1.z.string().min(1),
    language: zod_1.z.string().min(2).max(10),
    paaFetched: zod_1.z.number().int().nonnegative(),
    paaUsed: zod_1.z.boolean(),
    createdAt: zod_1.z.string().datetime(),
});
exports.QueryFanOutResult = zod_1.z
    .object({
    metadata: exports.QueryFanOutMetadata,
    normalization: zod_1.z.object({
        mainEntity: zod_1.z.string().min(1).max(200),
        category: zod_1.z.string().min(1).max(120),
        ymylRisk: zod_1.z.boolean(),
    }),
    intents: exports.FanOutIntent.array().min(1),
    dominantIntent: exports.IntentName,
    paaMapping: exports.PaaMapping.array(),
    unmatchedPaa: zod_1.z.string().array(),
})
    .superRefine((val, ctx) => {
    const areaIds = [];
    for (const intent of val.intents) {
        for (const area of intent.areas)
            areaIds.push(area.id);
    }
    const areaIdSet = new Set(areaIds);
    if (areaIdSet.size !== areaIds.length) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: "duplicate area ids across intents",
            path: ["intents"],
        });
    }
    const intentNames = new Set(val.intents.map((i) => i.name));
    if (!intentNames.has(val.dominantIntent)) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: `dominantIntent "${val.dominantIntent}" is not in intents[]`,
            path: ["dominantIntent"],
        });
    }
    val.paaMapping.forEach((m, i) => {
        if (!areaIdSet.has(m.areaId)) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                message: `paaMapping[${i}].areaId "${m.areaId}" is unknown`,
                path: ["paaMapping", i, "areaId"],
            });
        }
    });
    for (const intent of val.intents) {
        intent.areas.forEach((area) => {
            if (area.classification === "MACRO" && area.evergreenTopic.trim() === "") {
                ctx.addIssue({
                    code: zod_1.z.ZodIssueCode.custom,
                    message: `area ${area.id} is MACRO but has empty evergreenTopic`,
                    path: ["intents"],
                });
            }
        });
    }
    if (!val.metadata.paaUsed) {
        if (val.paaMapping.length > 0 || val.unmatchedPaa.length > 0) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                message: "paaUsed=false but paaMapping or unmatchedPaa is non-empty",
                path: ["metadata", "paaUsed"],
            });
        }
    }
});
exports.FanOutIntentsCall = zod_1.z.object({
    normalization: zod_1.z.object({
        mainEntity: zod_1.z.string().min(1).max(200),
        category: zod_1.z.string().min(1).max(120),
        ymylRisk: zod_1.z.boolean(),
    }),
    intents: zod_1.z
        .object({
        name: exports.IntentName,
        areas: zod_1.z
            .object({
            id: zod_1.z.string().regex(/^A\d+$/),
            topic: zod_1.z.string().min(1).max(120),
            question: zod_1.z.string().min(1).max(300),
            ymyl: zod_1.z.boolean(),
        })
            .array()
            .min(1)
            .max(5),
    })
        .array()
        .min(1),
});
exports.FanOutClassifyCall = zod_1.z.object({
    classifications: zod_1.z
        .object({
        areaId: zod_1.z.string().regex(/^A\d+$/),
        classification: exports.FanOutClassification,
        evergreenTopic: zod_1.z.string().max(120).default(""),
        evergreenQuestion: zod_1.z.string().max(300).default(""),
    })
        .array()
        .min(1),
    dominantIntent: exports.IntentName,
});
exports.FanOutPaaCall = zod_1.z.object({
    assignments: zod_1.z
        .object({
        areaId: zod_1.z.string().regex(/^A\d+$/),
        question: zod_1.z.string().min(1).max(500),
    })
        .array(),
    unmatched: zod_1.z.string().array(),
});
