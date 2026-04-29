import { z } from "zod";
export declare const RunStatus: z.ZodEnum<["pending", "running", "awaiting_approval", "completed", "failed", "cancelled"]>;
export type RunStatus = z.infer<typeof RunStatus>;
export declare const StepStatus: z.ZodEnum<["pending", "running", "completed", "failed", "skipped"]>;
export type StepStatus = z.infer<typeof StepStatus>;
export declare const StepDef: z.ZodObject<{
    key: z.ZodString;
    type: z.ZodString;
    auto: z.ZodBoolean;
    model: z.ZodOptional<z.ZodString>;
    dependsOn: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    type: string;
    key: string;
    auto: boolean;
    model?: string | undefined;
    dependsOn?: string[] | undefined;
}, {
    type: string;
    key: string;
    auto: boolean;
    model?: string | undefined;
    dependsOn?: string[] | undefined;
}>;
export type StepDef = z.infer<typeof StepDef>;
export declare const TemplateStepsDef: z.ZodEffects<z.ZodObject<{
    steps: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        type: z.ZodString;
        auto: z.ZodBoolean;
        model: z.ZodOptional<z.ZodString>;
        dependsOn: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        type: string;
        key: string;
        auto: boolean;
        model?: string | undefined;
        dependsOn?: string[] | undefined;
    }, {
        type: string;
        key: string;
        auto: boolean;
        model?: string | undefined;
        dependsOn?: string[] | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    steps: {
        type: string;
        key: string;
        auto: boolean;
        model?: string | undefined;
        dependsOn?: string[] | undefined;
    }[];
}, {
    steps: {
        type: string;
        key: string;
        auto: boolean;
        model?: string | undefined;
        dependsOn?: string[] | undefined;
    }[];
}>, {
    steps: {
        type: string;
        key: string;
        auto: boolean;
        model?: string | undefined;
        dependsOn?: string[] | undefined;
    }[];
}, {
    steps: {
        type: string;
        key: string;
        auto: boolean;
        model?: string | undefined;
        dependsOn?: string[] | undefined;
    }[];
}>;
export type TemplateStepsDef = z.infer<typeof TemplateStepsDef>;
export declare const ResearchEffort: z.ZodEnum<["lite", "standard", "deep", "exhaustive"]>;
export type ResearchEffort = z.infer<typeof ResearchEffort>;
export declare const ResearchSource: z.ZodObject<{
    url: z.ZodString;
    title: z.ZodOptional<z.ZodString>;
    snippets: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    url: string;
    snippets: string[];
    title?: string | undefined;
}, {
    url: string;
    title?: string | undefined;
    snippets?: string[] | undefined;
}>;
export type ResearchSource = z.infer<typeof ResearchSource>;
export declare const ResearchBriefing: z.ZodObject<{
    content: z.ZodString;
    sources: z.ZodArray<z.ZodObject<{
        url: z.ZodString;
        title: z.ZodOptional<z.ZodString>;
        snippets: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        url: string;
        snippets: string[];
        title?: string | undefined;
    }, {
        url: string;
        title?: string | undefined;
        snippets?: string[] | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    content: string;
    sources: {
        url: string;
        snippets: string[];
        title?: string | undefined;
    }[];
}, {
    content: string;
    sources: {
        url: string;
        title?: string | undefined;
        snippets?: string[] | undefined;
    }[];
}>;
export type ResearchBriefing = z.infer<typeof ResearchBriefing>;
export declare const ProjectConfig: z.ZodObject<{
    toneOfVoice: z.ZodDefault<z.ZodString>;
    targetAudience: z.ZodDefault<z.ZodString>;
    guidelines: z.ZodDefault<z.ZodString>;
    defaultModels: z.ZodDefault<z.ZodObject<{
        research: z.ZodOptional<z.ZodString>;
        brief: z.ZodOptional<z.ZodString>;
        draft: z.ZodOptional<z.ZodString>;
        edit: z.ZodOptional<z.ZodString>;
        seo: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        research?: string | undefined;
        brief?: string | undefined;
        draft?: string | undefined;
        edit?: string | undefined;
        seo?: string | undefined;
    }, {
        research?: string | undefined;
        brief?: string | undefined;
        draft?: string | undefined;
        edit?: string | undefined;
        seo?: string | undefined;
    }>>;
    researchEffort: z.ZodOptional<z.ZodEnum<["lite", "standard", "deep", "exhaustive"]>>;
    promptOverrides: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    toneOfVoice: string;
    targetAudience: string;
    guidelines: string;
    defaultModels: {
        research?: string | undefined;
        brief?: string | undefined;
        draft?: string | undefined;
        edit?: string | undefined;
        seo?: string | undefined;
    };
    promptOverrides: Record<string, string>;
    researchEffort?: "lite" | "standard" | "deep" | "exhaustive" | undefined;
}, {
    toneOfVoice?: string | undefined;
    targetAudience?: string | undefined;
    guidelines?: string | undefined;
    defaultModels?: {
        research?: string | undefined;
        brief?: string | undefined;
        draft?: string | undefined;
        edit?: string | undefined;
        seo?: string | undefined;
    } | undefined;
    researchEffort?: "lite" | "standard" | "deep" | "exhaustive" | undefined;
    promptOverrides?: Record<string, string> | undefined;
}>;
export type ProjectConfig = z.infer<typeof ProjectConfig>;
export declare const RunInput: z.ZodObject<{
    topic: z.ZodString;
    mainKeyword: z.ZodOptional<z.ZodString>;
    intent: z.ZodOptional<z.ZodString>;
    contentType: z.ZodOptional<z.ZodString>;
    h1Title: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    topic: string;
    mainKeyword?: string | undefined;
    intent?: string | undefined;
    contentType?: string | undefined;
    h1Title?: string | undefined;
}, {
    topic: string;
    mainKeyword?: string | undefined;
    intent?: string | undefined;
    contentType?: string | undefined;
    h1Title?: string | undefined;
}>;
export type RunInput = z.infer<typeof RunInput>;
export declare const StartRunDto: z.ZodObject<{
    projectId: z.ZodString;
    templateId: z.ZodString;
    input: z.ZodObject<{
        topic: z.ZodString;
        mainKeyword: z.ZodOptional<z.ZodString>;
        intent: z.ZodOptional<z.ZodString>;
        contentType: z.ZodOptional<z.ZodString>;
        h1Title: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        topic: string;
        mainKeyword?: string | undefined;
        intent?: string | undefined;
        contentType?: string | undefined;
        h1Title?: string | undefined;
    }, {
        topic: string;
        mainKeyword?: string | undefined;
        intent?: string | undefined;
        contentType?: string | undefined;
        h1Title?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    projectId: string;
    templateId: string;
    input: {
        topic: string;
        mainKeyword?: string | undefined;
        intent?: string | undefined;
        contentType?: string | undefined;
        h1Title?: string | undefined;
    };
}, {
    projectId: string;
    templateId: string;
    input: {
        topic: string;
        mainKeyword?: string | undefined;
        intent?: string | undefined;
        contentType?: string | undefined;
        h1Title?: string | undefined;
    };
}>;
export type StartRunDto = z.infer<typeof StartRunDto>;
export declare const ScrapePage: z.ZodObject<{
    url: z.ZodString;
    title: z.ZodString;
    markdown: z.ZodString;
    rawLength: z.ZodNumber;
    truncated: z.ZodBoolean;
    source: z.ZodEnum<["crawl4ai", "firecrawl"]>;
    fetchedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    url: string;
    title: string;
    markdown: string;
    rawLength: number;
    truncated: boolean;
    source: "crawl4ai" | "firecrawl";
    fetchedAt: string;
}, {
    url: string;
    title: string;
    markdown: string;
    rawLength: number;
    truncated: boolean;
    source: "crawl4ai" | "firecrawl";
    fetchedAt: string;
}>;
export type ScrapePage = z.infer<typeof ScrapePage>;
export declare const ScrapeAttempt: z.ZodObject<{
    source: z.ZodEnum<["crawl4ai", "firecrawl"]>;
    reason: z.ZodString;
    httpStatus: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    source: "crawl4ai" | "firecrawl";
    reason: string;
    httpStatus?: number | undefined;
}, {
    source: "crawl4ai" | "firecrawl";
    reason: string;
    httpStatus?: number | undefined;
}>;
export type ScrapeAttempt = z.infer<typeof ScrapeAttempt>;
export declare const ScrapeFailure: z.ZodObject<{
    url: z.ZodString;
    reason: z.ZodString;
    httpStatus: z.ZodOptional<z.ZodNumber>;
    attempts: z.ZodOptional<z.ZodArray<z.ZodObject<{
        source: z.ZodEnum<["crawl4ai", "firecrawl"]>;
        reason: z.ZodString;
        httpStatus: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        source: "crawl4ai" | "firecrawl";
        reason: string;
        httpStatus?: number | undefined;
    }, {
        source: "crawl4ai" | "firecrawl";
        reason: string;
        httpStatus?: number | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    url: string;
    reason: string;
    httpStatus?: number | undefined;
    attempts?: {
        source: "crawl4ai" | "firecrawl";
        reason: string;
        httpStatus?: number | undefined;
    }[] | undefined;
}, {
    url: string;
    reason: string;
    httpStatus?: number | undefined;
    attempts?: {
        source: "crawl4ai" | "firecrawl";
        reason: string;
        httpStatus?: number | undefined;
    }[] | undefined;
}>;
export type ScrapeFailure = z.infer<typeof ScrapeFailure>;
export declare const ScrapeResult: z.ZodObject<{
    pages: z.ZodArray<z.ZodObject<{
        url: z.ZodString;
        title: z.ZodString;
        markdown: z.ZodString;
        rawLength: z.ZodNumber;
        truncated: z.ZodBoolean;
        source: z.ZodEnum<["crawl4ai", "firecrawl"]>;
        fetchedAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        url: string;
        title: string;
        markdown: string;
        rawLength: number;
        truncated: boolean;
        source: "crawl4ai" | "firecrawl";
        fetchedAt: string;
    }, {
        url: string;
        title: string;
        markdown: string;
        rawLength: number;
        truncated: boolean;
        source: "crawl4ai" | "firecrawl";
        fetchedAt: string;
    }>, "many">;
    failures: z.ZodArray<z.ZodObject<{
        url: z.ZodString;
        reason: z.ZodString;
        httpStatus: z.ZodOptional<z.ZodNumber>;
        attempts: z.ZodOptional<z.ZodArray<z.ZodObject<{
            source: z.ZodEnum<["crawl4ai", "firecrawl"]>;
            reason: z.ZodString;
            httpStatus: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            source: "crawl4ai" | "firecrawl";
            reason: string;
            httpStatus?: number | undefined;
        }, {
            source: "crawl4ai" | "firecrawl";
            reason: string;
            httpStatus?: number | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        url: string;
        reason: string;
        httpStatus?: number | undefined;
        attempts?: {
            source: "crawl4ai" | "firecrawl";
            reason: string;
            httpStatus?: number | undefined;
        }[] | undefined;
    }, {
        url: string;
        reason: string;
        httpStatus?: number | undefined;
        attempts?: {
            source: "crawl4ai" | "firecrawl";
            reason: string;
            httpStatus?: number | undefined;
        }[] | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    pages: {
        url: string;
        title: string;
        markdown: string;
        rawLength: number;
        truncated: boolean;
        source: "crawl4ai" | "firecrawl";
        fetchedAt: string;
    }[];
    failures: {
        url: string;
        reason: string;
        httpStatus?: number | undefined;
        attempts?: {
            source: "crawl4ai" | "firecrawl";
            reason: string;
            httpStatus?: number | undefined;
        }[] | undefined;
    }[];
}, {
    pages: {
        url: string;
        title: string;
        markdown: string;
        rawLength: number;
        truncated: boolean;
        source: "crawl4ai" | "firecrawl";
        fetchedAt: string;
    }[];
    failures: {
        url: string;
        reason: string;
        httpStatus?: number | undefined;
        attempts?: {
            source: "crawl4ai" | "firecrawl";
            reason: string;
            httpStatus?: number | undefined;
        }[] | undefined;
    }[];
}>;
export type ScrapeResult = z.infer<typeof ScrapeResult>;
export declare const ResumeStepDto: z.ZodObject<{
    input: z.ZodObject<{
        urls: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        urls: string[];
    }, {
        urls: string[];
    }>;
}, "strip", z.ZodTypeAny, {
    input: {
        urls: string[];
    };
}, {
    input: {
        urls: string[];
    };
}>;
export type ResumeStepDto = z.infer<typeof ResumeStepDto>;
export declare const CleanedPage: z.ZodObject<{
    url: z.ZodString;
    title: z.ZodString;
    fetchedAt: z.ZodString;
    markdown: z.ZodString;
    paragraphs: z.ZodArray<z.ZodString, "many">;
    originalChars: z.ZodNumber;
    cleanedChars: z.ZodNumber;
    removedParagraphs: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    url: string;
    title: string;
    markdown: string;
    fetchedAt: string;
    paragraphs: string[];
    originalChars: number;
    cleanedChars: number;
    removedParagraphs: number;
}, {
    url: string;
    title: string;
    markdown: string;
    fetchedAt: string;
    paragraphs: string[];
    originalChars: number;
    cleanedChars: number;
    removedParagraphs: number;
}>;
export type CleanedPage = z.infer<typeof CleanedPage>;
export declare const DroppedPageReason: z.ZodEnum<["similar_to_kept", "char_limit_reached", "all_paragraphs_filtered", "empty_after_cleanup"]>;
export type DroppedPageReason = z.infer<typeof DroppedPageReason>;
export declare const DroppedPage: z.ZodObject<{
    url: z.ZodString;
    reason: z.ZodEnum<["similar_to_kept", "char_limit_reached", "all_paragraphs_filtered", "empty_after_cleanup"]>;
    similarToUrl: z.ZodOptional<z.ZodString>;
    similarity: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    url: string;
    reason: "similar_to_kept" | "char_limit_reached" | "all_paragraphs_filtered" | "empty_after_cleanup";
    similarToUrl?: string | undefined;
    similarity?: number | undefined;
}, {
    url: string;
    reason: "similar_to_kept" | "char_limit_reached" | "all_paragraphs_filtered" | "empty_after_cleanup";
    similarToUrl?: string | undefined;
    similarity?: number | undefined;
}>;
export type DroppedPage = z.infer<typeof DroppedPage>;
export declare const CleaningStats: z.ZodObject<{
    inputPages: z.ZodNumber;
    keptPages: z.ZodNumber;
    inputChars: z.ZodNumber;
    outputChars: z.ZodNumber;
    reductionPct: z.ZodNumber;
    blacklistedRemoved: z.ZodNumber;
    keywordFilteredRemoved: z.ZodNumber;
    crossPageDupesRemoved: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    inputPages: number;
    keptPages: number;
    inputChars: number;
    outputChars: number;
    reductionPct: number;
    blacklistedRemoved: number;
    keywordFilteredRemoved: number;
    crossPageDupesRemoved: number;
}, {
    inputPages: number;
    keptPages: number;
    inputChars: number;
    outputChars: number;
    reductionPct: number;
    blacklistedRemoved: number;
    keywordFilteredRemoved: number;
    crossPageDupesRemoved: number;
}>;
export type CleaningStats = z.infer<typeof CleaningStats>;
export declare const CleanedScrapeResult: z.ZodObject<{
    pages: z.ZodArray<z.ZodObject<{
        url: z.ZodString;
        title: z.ZodString;
        fetchedAt: z.ZodString;
        markdown: z.ZodString;
        paragraphs: z.ZodArray<z.ZodString, "many">;
        originalChars: z.ZodNumber;
        cleanedChars: z.ZodNumber;
        removedParagraphs: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        url: string;
        title: string;
        markdown: string;
        fetchedAt: string;
        paragraphs: string[];
        originalChars: number;
        cleanedChars: number;
        removedParagraphs: number;
    }, {
        url: string;
        title: string;
        markdown: string;
        fetchedAt: string;
        paragraphs: string[];
        originalChars: number;
        cleanedChars: number;
        removedParagraphs: number;
    }>, "many">;
    droppedPages: z.ZodArray<z.ZodObject<{
        url: z.ZodString;
        reason: z.ZodEnum<["similar_to_kept", "char_limit_reached", "all_paragraphs_filtered", "empty_after_cleanup"]>;
        similarToUrl: z.ZodOptional<z.ZodString>;
        similarity: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        url: string;
        reason: "similar_to_kept" | "char_limit_reached" | "all_paragraphs_filtered" | "empty_after_cleanup";
        similarToUrl?: string | undefined;
        similarity?: number | undefined;
    }, {
        url: string;
        reason: "similar_to_kept" | "char_limit_reached" | "all_paragraphs_filtered" | "empty_after_cleanup";
        similarToUrl?: string | undefined;
        similarity?: number | undefined;
    }>, "many">;
    stats: z.ZodObject<{
        inputPages: z.ZodNumber;
        keptPages: z.ZodNumber;
        inputChars: z.ZodNumber;
        outputChars: z.ZodNumber;
        reductionPct: z.ZodNumber;
        blacklistedRemoved: z.ZodNumber;
        keywordFilteredRemoved: z.ZodNumber;
        crossPageDupesRemoved: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        inputPages: number;
        keptPages: number;
        inputChars: number;
        outputChars: number;
        reductionPct: number;
        blacklistedRemoved: number;
        keywordFilteredRemoved: number;
        crossPageDupesRemoved: number;
    }, {
        inputPages: number;
        keptPages: number;
        inputChars: number;
        outputChars: number;
        reductionPct: number;
        blacklistedRemoved: number;
        keywordFilteredRemoved: number;
        crossPageDupesRemoved: number;
    }>;
}, "strip", z.ZodTypeAny, {
    pages: {
        url: string;
        title: string;
        markdown: string;
        fetchedAt: string;
        paragraphs: string[];
        originalChars: number;
        cleanedChars: number;
        removedParagraphs: number;
    }[];
    droppedPages: {
        url: string;
        reason: "similar_to_kept" | "char_limit_reached" | "all_paragraphs_filtered" | "empty_after_cleanup";
        similarToUrl?: string | undefined;
        similarity?: number | undefined;
    }[];
    stats: {
        inputPages: number;
        keptPages: number;
        inputChars: number;
        outputChars: number;
        reductionPct: number;
        blacklistedRemoved: number;
        keywordFilteredRemoved: number;
        crossPageDupesRemoved: number;
    };
}, {
    pages: {
        url: string;
        title: string;
        markdown: string;
        fetchedAt: string;
        paragraphs: string[];
        originalChars: number;
        cleanedChars: number;
        removedParagraphs: number;
    }[];
    droppedPages: {
        url: string;
        reason: "similar_to_kept" | "char_limit_reached" | "all_paragraphs_filtered" | "empty_after_cleanup";
        similarToUrl?: string | undefined;
        similarity?: number | undefined;
    }[];
    stats: {
        inputPages: number;
        keptPages: number;
        inputChars: number;
        outputChars: number;
        reductionPct: number;
        blacklistedRemoved: number;
        keywordFilteredRemoved: number;
        crossPageDupesRemoved: number;
    };
}>;
export type CleanedScrapeResult = z.infer<typeof CleanedScrapeResult>;
export declare const ExtractionMetadata: z.ZodObject<{
    keyword: z.ZodString;
    language: z.ZodString;
    sourceUrlCount: z.ZodNumber;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    keyword: string;
    language: string;
    sourceUrlCount: number;
    createdAt: string;
}, {
    keyword: string;
    language: string;
    sourceUrlCount: number;
    createdAt: string;
}>;
export type ExtractionMetadata = z.infer<typeof ExtractionMetadata>;
export declare const FactCategory: z.ZodEnum<["definition", "causal", "general"]>;
export type FactCategory = z.infer<typeof FactCategory>;
export declare const Priority: z.ZodEnum<["high", "medium", "low"]>;
export type Priority = z.infer<typeof Priority>;
export declare const Fact: z.ZodObject<{
    id: z.ZodString;
    text: z.ZodString;
    category: z.ZodEnum<["definition", "causal", "general"]>;
    priority: z.ZodEnum<["high", "medium", "low"]>;
    confidence: z.ZodNumber;
    sourceUrls: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    id: string;
    text: string;
    category: "definition" | "causal" | "general";
    priority: "high" | "medium" | "low";
    confidence: number;
    sourceUrls: string[];
}, {
    id: string;
    text: string;
    category: "definition" | "causal" | "general";
    priority: "high" | "medium" | "low";
    confidence: number;
    sourceUrls?: string[] | undefined;
}>;
export type Fact = z.infer<typeof Fact>;
export declare const DataPoint: z.ZodObject<{
    id: z.ZodString;
    definition: z.ZodString;
    value: z.ZodString;
    unit: z.ZodNullable<z.ZodString>;
    sourceUrls: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    value: string;
    definition: string;
    id: string;
    sourceUrls: string[];
    unit: string | null;
}, {
    value: string;
    definition: string;
    id: string;
    unit: string | null;
    sourceUrls?: string[] | undefined;
}>;
export type DataPoint = z.infer<typeof DataPoint>;
export declare const IdeationType: z.ZodEnum<["checklist", "mini_course", "info_box", "habit"]>;
export type IdeationType = z.infer<typeof IdeationType>;
export declare const Ideation: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<["checklist", "mini_course", "info_box", "habit"]>;
    title: z.ZodString;
    description: z.ZodString;
    audience: z.ZodDefault<z.ZodString>;
    channels: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    keywords: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    priority: z.ZodEnum<["high", "medium", "low"]>;
}, "strip", z.ZodTypeAny, {
    type: "checklist" | "mini_course" | "info_box" | "habit";
    title: string;
    id: string;
    priority: "high" | "medium" | "low";
    description: string;
    audience: string;
    channels: string[];
    keywords: string[];
}, {
    type: "checklist" | "mini_course" | "info_box" | "habit";
    title: string;
    id: string;
    priority: "high" | "medium" | "low";
    description: string;
    audience?: string | undefined;
    channels?: string[] | undefined;
    keywords?: string[] | undefined;
}>;
export type Ideation = z.infer<typeof Ideation>;
export declare const ExtractionResult: z.ZodObject<{
    metadata: z.ZodObject<{
        keyword: z.ZodString;
        language: z.ZodString;
        sourceUrlCount: z.ZodNumber;
        createdAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        keyword: string;
        language: string;
        sourceUrlCount: number;
        createdAt: string;
    }, {
        keyword: string;
        language: string;
        sourceUrlCount: number;
        createdAt: string;
    }>;
    facts: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        text: z.ZodString;
        category: z.ZodEnum<["definition", "causal", "general"]>;
        priority: z.ZodEnum<["high", "medium", "low"]>;
        confidence: z.ZodNumber;
        sourceUrls: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        text: string;
        category: "definition" | "causal" | "general";
        priority: "high" | "medium" | "low";
        confidence: number;
        sourceUrls: string[];
    }, {
        id: string;
        text: string;
        category: "definition" | "causal" | "general";
        priority: "high" | "medium" | "low";
        confidence: number;
        sourceUrls?: string[] | undefined;
    }>, "many">;
    data: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        definition: z.ZodString;
        value: z.ZodString;
        unit: z.ZodNullable<z.ZodString>;
        sourceUrls: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        value: string;
        definition: string;
        id: string;
        sourceUrls: string[];
        unit: string | null;
    }, {
        value: string;
        definition: string;
        id: string;
        unit: string | null;
        sourceUrls?: string[] | undefined;
    }>, "many">;
    ideations: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodEnum<["checklist", "mini_course", "info_box", "habit"]>;
        title: z.ZodString;
        description: z.ZodString;
        audience: z.ZodDefault<z.ZodString>;
        channels: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        keywords: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        priority: z.ZodEnum<["high", "medium", "low"]>;
    }, "strip", z.ZodTypeAny, {
        type: "checklist" | "mini_course" | "info_box" | "habit";
        title: string;
        id: string;
        priority: "high" | "medium" | "low";
        description: string;
        audience: string;
        channels: string[];
        keywords: string[];
    }, {
        type: "checklist" | "mini_course" | "info_box" | "habit";
        title: string;
        id: string;
        priority: "high" | "medium" | "low";
        description: string;
        audience?: string | undefined;
        channels?: string[] | undefined;
        keywords?: string[] | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    metadata: {
        keyword: string;
        language: string;
        sourceUrlCount: number;
        createdAt: string;
    };
    facts: {
        id: string;
        text: string;
        category: "definition" | "causal" | "general";
        priority: "high" | "medium" | "low";
        confidence: number;
        sourceUrls: string[];
    }[];
    data: {
        value: string;
        definition: string;
        id: string;
        sourceUrls: string[];
        unit: string | null;
    }[];
    ideations: {
        type: "checklist" | "mini_course" | "info_box" | "habit";
        title: string;
        id: string;
        priority: "high" | "medium" | "low";
        description: string;
        audience: string;
        channels: string[];
        keywords: string[];
    }[];
}, {
    metadata: {
        keyword: string;
        language: string;
        sourceUrlCount: number;
        createdAt: string;
    };
    facts: {
        id: string;
        text: string;
        category: "definition" | "causal" | "general";
        priority: "high" | "medium" | "low";
        confidence: number;
        sourceUrls?: string[] | undefined;
    }[];
    data: {
        value: string;
        definition: string;
        id: string;
        unit: string | null;
        sourceUrls?: string[] | undefined;
    }[];
    ideations: {
        type: "checklist" | "mini_course" | "info_box" | "habit";
        title: string;
        id: string;
        priority: "high" | "medium" | "low";
        description: string;
        audience?: string | undefined;
        channels?: string[] | undefined;
        keywords?: string[] | undefined;
    }[];
}>;
export type ExtractionResult = z.infer<typeof ExtractionResult>;
export declare const RerunPreview: z.ZodObject<{
    target: z.ZodString;
    downstream: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    target: string;
    downstream: string[];
}, {
    target: string;
    downstream: string[];
}>;
export type RerunPreview = z.infer<typeof RerunPreview>;
export declare const EntityType: z.ZodEnum<["PERSON", "ORGANIZATION", "LOCATION", "PRODUCT", "CONCEPT", "EVENT"]>;
export type EntityType = z.infer<typeof EntityType>;
export declare const RelationType: z.ZodEnum<["PART_OF", "LOCATED_IN", "CREATED_BY", "WORKS_FOR", "RELATED_TO", "HAS_FEATURE", "SOLVES", "COMPETES_WITH", "CONNECTED_TO", "USED_BY", "REQUIRES"]>;
export type RelationType = z.infer<typeof RelationType>;
export declare const ContextAnalysis: z.ZodObject<{
    mainTopicInterpretation: z.ZodString;
    domainSummary: z.ZodString;
    notes: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    mainTopicInterpretation: string;
    domainSummary: string;
    notes: string;
}, {
    mainTopicInterpretation: string;
    domainSummary: string;
    notes?: string | undefined;
}>;
export type ContextAnalysis = z.infer<typeof ContextAnalysis>;
export declare const EntityExtractionMetadata: z.ZodObject<{
    keyword: z.ZodString;
    language: z.ZodString;
    sourceUrlCount: z.ZodNumber;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    keyword: string;
    language: string;
    sourceUrlCount: number;
    createdAt: string;
}, {
    keyword: string;
    language: string;
    sourceUrlCount: number;
    createdAt: string;
}>;
export type EntityExtractionMetadata = z.infer<typeof EntityExtractionMetadata>;
export declare const Entity: z.ZodObject<{
    id: z.ZodString;
    originalSurface: z.ZodString;
    entity: z.ZodString;
    domainType: z.ZodEnum<["PERSON", "ORGANIZATION", "LOCATION", "PRODUCT", "CONCEPT", "EVENT"]>;
    evidence: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    originalSurface: string;
    entity: string;
    domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
    evidence: string;
}, {
    id: string;
    originalSurface: string;
    entity: string;
    domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
    evidence: string;
}>;
export type Entity = z.infer<typeof Entity>;
export declare const EntityRelation: z.ZodObject<{
    source: z.ZodString;
    target: z.ZodString;
    type: z.ZodEnum<["PART_OF", "LOCATED_IN", "CREATED_BY", "WORKS_FOR", "RELATED_TO", "HAS_FEATURE", "SOLVES", "COMPETES_WITH", "CONNECTED_TO", "USED_BY", "REQUIRES"]>;
    description: z.ZodString;
    evidence: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
    source: string;
    description: string;
    target: string;
    evidence: string;
}, {
    type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
    source: string;
    description: string;
    target: string;
    evidence: string;
}>;
export type EntityRelation = z.infer<typeof EntityRelation>;
export declare const RelationToMain: z.ZodObject<{
    entityId: z.ZodString;
    score: z.ZodNumber;
    rationale: z.ZodString;
}, "strip", z.ZodTypeAny, {
    entityId: string;
    score: number;
    rationale: string;
}, {
    entityId: string;
    score: number;
    rationale: string;
}>;
export type RelationToMain = z.infer<typeof RelationToMain>;
export declare const EntityExtractionResult: z.ZodEffects<z.ZodObject<{
    metadata: z.ZodObject<{
        keyword: z.ZodString;
        language: z.ZodString;
        sourceUrlCount: z.ZodNumber;
        createdAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        keyword: string;
        language: string;
        sourceUrlCount: number;
        createdAt: string;
    }, {
        keyword: string;
        language: string;
        sourceUrlCount: number;
        createdAt: string;
    }>;
    contextAnalysis: z.ZodObject<{
        mainTopicInterpretation: z.ZodString;
        domainSummary: z.ZodString;
        notes: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        mainTopicInterpretation: string;
        domainSummary: string;
        notes: string;
    }, {
        mainTopicInterpretation: string;
        domainSummary: string;
        notes?: string | undefined;
    }>;
    entities: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        originalSurface: z.ZodString;
        entity: z.ZodString;
        domainType: z.ZodEnum<["PERSON", "ORGANIZATION", "LOCATION", "PRODUCT", "CONCEPT", "EVENT"]>;
        evidence: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        originalSurface: string;
        entity: string;
        domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
        evidence: string;
    }, {
        id: string;
        originalSurface: string;
        entity: string;
        domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
        evidence: string;
    }>, "many">;
    relationships: z.ZodArray<z.ZodObject<{
        source: z.ZodString;
        target: z.ZodString;
        type: z.ZodEnum<["PART_OF", "LOCATED_IN", "CREATED_BY", "WORKS_FOR", "RELATED_TO", "HAS_FEATURE", "SOLVES", "COMPETES_WITH", "CONNECTED_TO", "USED_BY", "REQUIRES"]>;
        description: z.ZodString;
        evidence: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
        source: string;
        description: string;
        target: string;
        evidence: string;
    }, {
        type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
        source: string;
        description: string;
        target: string;
        evidence: string;
    }>, "many">;
    relationToMain: z.ZodArray<z.ZodObject<{
        entityId: z.ZodString;
        score: z.ZodNumber;
        rationale: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        entityId: string;
        score: number;
        rationale: string;
    }, {
        entityId: string;
        score: number;
        rationale: string;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    metadata: {
        keyword: string;
        language: string;
        sourceUrlCount: number;
        createdAt: string;
    };
    contextAnalysis: {
        mainTopicInterpretation: string;
        domainSummary: string;
        notes: string;
    };
    entities: {
        id: string;
        originalSurface: string;
        entity: string;
        domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
        evidence: string;
    }[];
    relationships: {
        type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
        source: string;
        description: string;
        target: string;
        evidence: string;
    }[];
    relationToMain: {
        entityId: string;
        score: number;
        rationale: string;
    }[];
}, {
    metadata: {
        keyword: string;
        language: string;
        sourceUrlCount: number;
        createdAt: string;
    };
    contextAnalysis: {
        mainTopicInterpretation: string;
        domainSummary: string;
        notes?: string | undefined;
    };
    entities: {
        id: string;
        originalSurface: string;
        entity: string;
        domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
        evidence: string;
    }[];
    relationships: {
        type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
        source: string;
        description: string;
        target: string;
        evidence: string;
    }[];
    relationToMain: {
        entityId: string;
        score: number;
        rationale: string;
    }[];
}>, {
    metadata: {
        keyword: string;
        language: string;
        sourceUrlCount: number;
        createdAt: string;
    };
    contextAnalysis: {
        mainTopicInterpretation: string;
        domainSummary: string;
        notes: string;
    };
    entities: {
        id: string;
        originalSurface: string;
        entity: string;
        domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
        evidence: string;
    }[];
    relationships: {
        type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
        source: string;
        description: string;
        target: string;
        evidence: string;
    }[];
    relationToMain: {
        entityId: string;
        score: number;
        rationale: string;
    }[];
}, {
    metadata: {
        keyword: string;
        language: string;
        sourceUrlCount: number;
        createdAt: string;
    };
    contextAnalysis: {
        mainTopicInterpretation: string;
        domainSummary: string;
        notes?: string | undefined;
    };
    entities: {
        id: string;
        originalSurface: string;
        entity: string;
        domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
        evidence: string;
    }[];
    relationships: {
        type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
        source: string;
        description: string;
        target: string;
        evidence: string;
    }[];
    relationToMain: {
        entityId: string;
        score: number;
        rationale: string;
    }[];
}>;
export type EntityExtractionResult = z.infer<typeof EntityExtractionResult>;
export declare const IntentName: z.ZodEnum<["Definicyjna", "Problemowa", "Instrukcyjna", "Decyzyjna", "Diagnostyczna", "Porównawcza"]>;
export type IntentName = z.infer<typeof IntentName>;
export declare const FanOutClassification: z.ZodEnum<["MICRO", "MACRO"]>;
export type FanOutClassification = z.infer<typeof FanOutClassification>;
export declare const FanOutArea: z.ZodObject<{
    id: z.ZodString;
    topic: z.ZodString;
    question: z.ZodString;
    ymyl: z.ZodBoolean;
    classification: z.ZodEnum<["MICRO", "MACRO"]>;
    evergreenTopic: z.ZodDefault<z.ZodString>;
    evergreenQuestion: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    topic: string;
    id: string;
    question: string;
    ymyl: boolean;
    classification: "MICRO" | "MACRO";
    evergreenTopic: string;
    evergreenQuestion: string;
}, {
    topic: string;
    id: string;
    question: string;
    ymyl: boolean;
    classification: "MICRO" | "MACRO";
    evergreenTopic?: string | undefined;
    evergreenQuestion?: string | undefined;
}>;
export type FanOutArea = z.infer<typeof FanOutArea>;
export declare const FanOutIntent: z.ZodObject<{
    name: z.ZodEnum<["Definicyjna", "Problemowa", "Instrukcyjna", "Decyzyjna", "Diagnostyczna", "Porównawcza"]>;
    areas: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        topic: z.ZodString;
        question: z.ZodString;
        ymyl: z.ZodBoolean;
        classification: z.ZodEnum<["MICRO", "MACRO"]>;
        evergreenTopic: z.ZodDefault<z.ZodString>;
        evergreenQuestion: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        topic: string;
        id: string;
        question: string;
        ymyl: boolean;
        classification: "MICRO" | "MACRO";
        evergreenTopic: string;
        evergreenQuestion: string;
    }, {
        topic: string;
        id: string;
        question: string;
        ymyl: boolean;
        classification: "MICRO" | "MACRO";
        evergreenTopic?: string | undefined;
        evergreenQuestion?: string | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    name: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
    areas: {
        topic: string;
        id: string;
        question: string;
        ymyl: boolean;
        classification: "MICRO" | "MACRO";
        evergreenTopic: string;
        evergreenQuestion: string;
    }[];
}, {
    name: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
    areas: {
        topic: string;
        id: string;
        question: string;
        ymyl: boolean;
        classification: "MICRO" | "MACRO";
        evergreenTopic?: string | undefined;
        evergreenQuestion?: string | undefined;
    }[];
}>;
export type FanOutIntent = z.infer<typeof FanOutIntent>;
export declare const PaaMapping: z.ZodObject<{
    areaId: z.ZodString;
    question: z.ZodString;
}, "strip", z.ZodTypeAny, {
    question: string;
    areaId: string;
}, {
    question: string;
    areaId: string;
}>;
export type PaaMapping = z.infer<typeof PaaMapping>;
export declare const QueryFanOutMetadata: z.ZodObject<{
    keyword: z.ZodString;
    language: z.ZodString;
    paaFetched: z.ZodNumber;
    paaUsed: z.ZodBoolean;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    keyword: string;
    language: string;
    createdAt: string;
    paaFetched: number;
    paaUsed: boolean;
}, {
    keyword: string;
    language: string;
    createdAt: string;
    paaFetched: number;
    paaUsed: boolean;
}>;
export type QueryFanOutMetadata = z.infer<typeof QueryFanOutMetadata>;
export declare const QueryFanOutResult: z.ZodEffects<z.ZodObject<{
    metadata: z.ZodObject<{
        keyword: z.ZodString;
        language: z.ZodString;
        paaFetched: z.ZodNumber;
        paaUsed: z.ZodBoolean;
        createdAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        keyword: string;
        language: string;
        createdAt: string;
        paaFetched: number;
        paaUsed: boolean;
    }, {
        keyword: string;
        language: string;
        createdAt: string;
        paaFetched: number;
        paaUsed: boolean;
    }>;
    normalization: z.ZodObject<{
        mainEntity: z.ZodString;
        category: z.ZodString;
        ymylRisk: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        category: string;
        mainEntity: string;
        ymylRisk: boolean;
    }, {
        category: string;
        mainEntity: string;
        ymylRisk: boolean;
    }>;
    intents: z.ZodArray<z.ZodObject<{
        name: z.ZodEnum<["Definicyjna", "Problemowa", "Instrukcyjna", "Decyzyjna", "Diagnostyczna", "Porównawcza"]>;
        areas: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            topic: z.ZodString;
            question: z.ZodString;
            ymyl: z.ZodBoolean;
            classification: z.ZodEnum<["MICRO", "MACRO"]>;
            evergreenTopic: z.ZodDefault<z.ZodString>;
            evergreenQuestion: z.ZodDefault<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            topic: string;
            id: string;
            question: string;
            ymyl: boolean;
            classification: "MICRO" | "MACRO";
            evergreenTopic: string;
            evergreenQuestion: string;
        }, {
            topic: string;
            id: string;
            question: string;
            ymyl: boolean;
            classification: "MICRO" | "MACRO";
            evergreenTopic?: string | undefined;
            evergreenQuestion?: string | undefined;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        name: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
        areas: {
            topic: string;
            id: string;
            question: string;
            ymyl: boolean;
            classification: "MICRO" | "MACRO";
            evergreenTopic: string;
            evergreenQuestion: string;
        }[];
    }, {
        name: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
        areas: {
            topic: string;
            id: string;
            question: string;
            ymyl: boolean;
            classification: "MICRO" | "MACRO";
            evergreenTopic?: string | undefined;
            evergreenQuestion?: string | undefined;
        }[];
    }>, "many">;
    dominantIntent: z.ZodEnum<["Definicyjna", "Problemowa", "Instrukcyjna", "Decyzyjna", "Diagnostyczna", "Porównawcza"]>;
    paaMapping: z.ZodArray<z.ZodObject<{
        areaId: z.ZodString;
        question: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        question: string;
        areaId: string;
    }, {
        question: string;
        areaId: string;
    }>, "many">;
    unmatchedPaa: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    metadata: {
        keyword: string;
        language: string;
        createdAt: string;
        paaFetched: number;
        paaUsed: boolean;
    };
    normalization: {
        category: string;
        mainEntity: string;
        ymylRisk: boolean;
    };
    intents: {
        name: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
        areas: {
            topic: string;
            id: string;
            question: string;
            ymyl: boolean;
            classification: "MICRO" | "MACRO";
            evergreenTopic: string;
            evergreenQuestion: string;
        }[];
    }[];
    dominantIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
    paaMapping: {
        question: string;
        areaId: string;
    }[];
    unmatchedPaa: string[];
}, {
    metadata: {
        keyword: string;
        language: string;
        createdAt: string;
        paaFetched: number;
        paaUsed: boolean;
    };
    normalization: {
        category: string;
        mainEntity: string;
        ymylRisk: boolean;
    };
    intents: {
        name: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
        areas: {
            topic: string;
            id: string;
            question: string;
            ymyl: boolean;
            classification: "MICRO" | "MACRO";
            evergreenTopic?: string | undefined;
            evergreenQuestion?: string | undefined;
        }[];
    }[];
    dominantIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
    paaMapping: {
        question: string;
        areaId: string;
    }[];
    unmatchedPaa: string[];
}>, {
    metadata: {
        keyword: string;
        language: string;
        createdAt: string;
        paaFetched: number;
        paaUsed: boolean;
    };
    normalization: {
        category: string;
        mainEntity: string;
        ymylRisk: boolean;
    };
    intents: {
        name: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
        areas: {
            topic: string;
            id: string;
            question: string;
            ymyl: boolean;
            classification: "MICRO" | "MACRO";
            evergreenTopic: string;
            evergreenQuestion: string;
        }[];
    }[];
    dominantIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
    paaMapping: {
        question: string;
        areaId: string;
    }[];
    unmatchedPaa: string[];
}, {
    metadata: {
        keyword: string;
        language: string;
        createdAt: string;
        paaFetched: number;
        paaUsed: boolean;
    };
    normalization: {
        category: string;
        mainEntity: string;
        ymylRisk: boolean;
    };
    intents: {
        name: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
        areas: {
            topic: string;
            id: string;
            question: string;
            ymyl: boolean;
            classification: "MICRO" | "MACRO";
            evergreenTopic?: string | undefined;
            evergreenQuestion?: string | undefined;
        }[];
    }[];
    dominantIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
    paaMapping: {
        question: string;
        areaId: string;
    }[];
    unmatchedPaa: string[];
}>;
export type QueryFanOutResult = z.infer<typeof QueryFanOutResult>;
export declare const FanOutIntentsCall: z.ZodObject<{
    normalization: z.ZodObject<{
        mainEntity: z.ZodString;
        category: z.ZodString;
        ymylRisk: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        category: string;
        mainEntity: string;
        ymylRisk: boolean;
    }, {
        category: string;
        mainEntity: string;
        ymylRisk: boolean;
    }>;
    intents: z.ZodArray<z.ZodObject<{
        name: z.ZodEnum<["Definicyjna", "Problemowa", "Instrukcyjna", "Decyzyjna", "Diagnostyczna", "Porównawcza"]>;
        areas: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            topic: z.ZodString;
            question: z.ZodString;
            ymyl: z.ZodBoolean;
        }, "strip", z.ZodTypeAny, {
            topic: string;
            id: string;
            question: string;
            ymyl: boolean;
        }, {
            topic: string;
            id: string;
            question: string;
            ymyl: boolean;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        name: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
        areas: {
            topic: string;
            id: string;
            question: string;
            ymyl: boolean;
        }[];
    }, {
        name: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
        areas: {
            topic: string;
            id: string;
            question: string;
            ymyl: boolean;
        }[];
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    normalization: {
        category: string;
        mainEntity: string;
        ymylRisk: boolean;
    };
    intents: {
        name: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
        areas: {
            topic: string;
            id: string;
            question: string;
            ymyl: boolean;
        }[];
    }[];
}, {
    normalization: {
        category: string;
        mainEntity: string;
        ymylRisk: boolean;
    };
    intents: {
        name: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
        areas: {
            topic: string;
            id: string;
            question: string;
            ymyl: boolean;
        }[];
    }[];
}>;
export type FanOutIntentsCall = z.infer<typeof FanOutIntentsCall>;
export declare const FanOutClassifyCall: z.ZodObject<{
    classifications: z.ZodArray<z.ZodObject<{
        areaId: z.ZodString;
        classification: z.ZodEnum<["MICRO", "MACRO"]>;
        evergreenTopic: z.ZodString;
        evergreenQuestion: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        classification: "MICRO" | "MACRO";
        evergreenTopic: string;
        evergreenQuestion: string;
        areaId: string;
    }, {
        classification: "MICRO" | "MACRO";
        evergreenTopic: string;
        evergreenQuestion: string;
        areaId: string;
    }>, "many">;
    dominantIntent: z.ZodEnum<["Definicyjna", "Problemowa", "Instrukcyjna", "Decyzyjna", "Diagnostyczna", "Porównawcza"]>;
}, "strip", z.ZodTypeAny, {
    dominantIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
    classifications: {
        classification: "MICRO" | "MACRO";
        evergreenTopic: string;
        evergreenQuestion: string;
        areaId: string;
    }[];
}, {
    dominantIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
    classifications: {
        classification: "MICRO" | "MACRO";
        evergreenTopic: string;
        evergreenQuestion: string;
        areaId: string;
    }[];
}>;
export type FanOutClassifyCall = z.infer<typeof FanOutClassifyCall>;
export declare const FanOutPaaCall: z.ZodObject<{
    assignments: z.ZodArray<z.ZodObject<{
        areaId: z.ZodString;
        question: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        question: string;
        areaId: string;
    }, {
        question: string;
        areaId: string;
    }>, "many">;
    unmatched: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    assignments: {
        question: string;
        areaId: string;
    }[];
    unmatched: string[];
}, {
    assignments: {
        question: string;
        areaId: string;
    }[];
    unmatched: string[];
}>;
export type FanOutPaaCall = z.infer<typeof FanOutPaaCall>;
export declare const KGCounts: z.ZodObject<{
    entities: z.ZodNumber;
    relationships: z.ZodNumber;
    facts: z.ZodNumber;
    measurables: z.ZodNumber;
    ideations: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    facts: number;
    ideations: number;
    entities: number;
    relationships: number;
    measurables: number;
}, {
    facts: number;
    ideations: number;
    entities: number;
    relationships: number;
    measurables: number;
}>;
export type KGCounts = z.infer<typeof KGCounts>;
export declare const KGMeta: z.ZodObject<{
    mainKeyword: z.ZodString;
    mainEntity: z.ZodString;
    category: z.ZodString;
    language: z.ZodString;
    generatedAt: z.ZodString;
    counts: z.ZodObject<{
        entities: z.ZodNumber;
        relationships: z.ZodNumber;
        facts: z.ZodNumber;
        measurables: z.ZodNumber;
        ideations: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        facts: number;
        ideations: number;
        entities: number;
        relationships: number;
        measurables: number;
    }, {
        facts: number;
        ideations: number;
        entities: number;
        relationships: number;
        measurables: number;
    }>;
}, "strip", z.ZodTypeAny, {
    mainKeyword: string;
    language: string;
    category: string;
    mainEntity: string;
    generatedAt: string;
    counts: {
        facts: number;
        ideations: number;
        entities: number;
        relationships: number;
        measurables: number;
    };
}, {
    mainKeyword: string;
    language: string;
    category: string;
    mainEntity: string;
    generatedAt: string;
    counts: {
        facts: number;
        ideations: number;
        entities: number;
        relationships: number;
        measurables: number;
    };
}>;
export type KGMeta = z.infer<typeof KGMeta>;
export declare const KGRelationship: z.ZodObject<{
    source: z.ZodString;
    target: z.ZodString;
    type: z.ZodEnum<["PART_OF", "LOCATED_IN", "CREATED_BY", "WORKS_FOR", "RELATED_TO", "HAS_FEATURE", "SOLVES", "COMPETES_WITH", "CONNECTED_TO", "USED_BY", "REQUIRES"]>;
    description: z.ZodString;
    evidence: z.ZodString;
} & {
    sourceName: z.ZodString;
    targetName: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
    source: string;
    description: string;
    target: string;
    evidence: string;
    sourceName: string;
    targetName: string;
}, {
    type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
    source: string;
    description: string;
    target: string;
    evidence: string;
    sourceName: string;
    targetName: string;
}>;
export type KGRelationship = z.infer<typeof KGRelationship>;
export declare const KGMeasurable: z.ZodObject<{
    id: z.ZodString;
    definition: z.ZodString;
    value: z.ZodString;
    unit: z.ZodNullable<z.ZodString>;
    sourceUrls: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
} & {
    formatted: z.ZodString;
}, "strip", z.ZodTypeAny, {
    value: string;
    definition: string;
    id: string;
    sourceUrls: string[];
    unit: string | null;
    formatted: string;
}, {
    value: string;
    definition: string;
    id: string;
    unit: string | null;
    formatted: string;
    sourceUrls?: string[] | undefined;
}>;
export type KGMeasurable = z.infer<typeof KGMeasurable>;
export declare const KGAssemblyWarning: z.ZodObject<{
    kind: z.ZodEnum<["relationship_unknown_source", "relationship_unknown_target", "relationship_self_edge", "duplicate_entity_id"]>;
    message: z.ZodString;
    context: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    message: string;
    kind: "relationship_unknown_source" | "relationship_unknown_target" | "relationship_self_edge" | "duplicate_entity_id";
    context: Record<string, string>;
}, {
    message: string;
    kind: "relationship_unknown_source" | "relationship_unknown_target" | "relationship_self_edge" | "duplicate_entity_id";
    context?: Record<string, string> | undefined;
}>;
export type KGAssemblyWarning = z.infer<typeof KGAssemblyWarning>;
export declare const KnowledgeGraph: z.ZodObject<{
    meta: z.ZodObject<{
        mainKeyword: z.ZodString;
        mainEntity: z.ZodString;
        category: z.ZodString;
        language: z.ZodString;
        generatedAt: z.ZodString;
        counts: z.ZodObject<{
            entities: z.ZodNumber;
            relationships: z.ZodNumber;
            facts: z.ZodNumber;
            measurables: z.ZodNumber;
            ideations: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            facts: number;
            ideations: number;
            entities: number;
            relationships: number;
            measurables: number;
        }, {
            facts: number;
            ideations: number;
            entities: number;
            relationships: number;
            measurables: number;
        }>;
    }, "strip", z.ZodTypeAny, {
        mainKeyword: string;
        language: string;
        category: string;
        mainEntity: string;
        generatedAt: string;
        counts: {
            facts: number;
            ideations: number;
            entities: number;
            relationships: number;
            measurables: number;
        };
    }, {
        mainKeyword: string;
        language: string;
        category: string;
        mainEntity: string;
        generatedAt: string;
        counts: {
            facts: number;
            ideations: number;
            entities: number;
            relationships: number;
            measurables: number;
        };
    }>;
    entities: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        originalSurface: z.ZodString;
        entity: z.ZodString;
        domainType: z.ZodEnum<["PERSON", "ORGANIZATION", "LOCATION", "PRODUCT", "CONCEPT", "EVENT"]>;
        evidence: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        originalSurface: string;
        entity: string;
        domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
        evidence: string;
    }, {
        id: string;
        originalSurface: string;
        entity: string;
        domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
        evidence: string;
    }>, "many">;
    relationships: z.ZodArray<z.ZodObject<{
        source: z.ZodString;
        target: z.ZodString;
        type: z.ZodEnum<["PART_OF", "LOCATED_IN", "CREATED_BY", "WORKS_FOR", "RELATED_TO", "HAS_FEATURE", "SOLVES", "COMPETES_WITH", "CONNECTED_TO", "USED_BY", "REQUIRES"]>;
        description: z.ZodString;
        evidence: z.ZodString;
    } & {
        sourceName: z.ZodString;
        targetName: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
        source: string;
        description: string;
        target: string;
        evidence: string;
        sourceName: string;
        targetName: string;
    }, {
        type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
        source: string;
        description: string;
        target: string;
        evidence: string;
        sourceName: string;
        targetName: string;
    }>, "many">;
    facts: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        text: z.ZodString;
        category: z.ZodEnum<["definition", "causal", "general"]>;
        priority: z.ZodEnum<["high", "medium", "low"]>;
        confidence: z.ZodNumber;
        sourceUrls: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        text: string;
        category: "definition" | "causal" | "general";
        priority: "high" | "medium" | "low";
        confidence: number;
        sourceUrls: string[];
    }, {
        id: string;
        text: string;
        category: "definition" | "causal" | "general";
        priority: "high" | "medium" | "low";
        confidence: number;
        sourceUrls?: string[] | undefined;
    }>, "many">;
    measurables: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        definition: z.ZodString;
        value: z.ZodString;
        unit: z.ZodNullable<z.ZodString>;
        sourceUrls: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    } & {
        formatted: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        value: string;
        definition: string;
        id: string;
        sourceUrls: string[];
        unit: string | null;
        formatted: string;
    }, {
        value: string;
        definition: string;
        id: string;
        unit: string | null;
        formatted: string;
        sourceUrls?: string[] | undefined;
    }>, "many">;
    ideations: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodEnum<["checklist", "mini_course", "info_box", "habit"]>;
        title: z.ZodString;
        description: z.ZodString;
        audience: z.ZodDefault<z.ZodString>;
        channels: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        keywords: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        priority: z.ZodEnum<["high", "medium", "low"]>;
    }, "strip", z.ZodTypeAny, {
        type: "checklist" | "mini_course" | "info_box" | "habit";
        title: string;
        id: string;
        priority: "high" | "medium" | "low";
        description: string;
        audience: string;
        channels: string[];
        keywords: string[];
    }, {
        type: "checklist" | "mini_course" | "info_box" | "habit";
        title: string;
        id: string;
        priority: "high" | "medium" | "low";
        description: string;
        audience?: string | undefined;
        channels?: string[] | undefined;
        keywords?: string[] | undefined;
    }>, "many">;
    warnings: z.ZodArray<z.ZodObject<{
        kind: z.ZodEnum<["relationship_unknown_source", "relationship_unknown_target", "relationship_self_edge", "duplicate_entity_id"]>;
        message: z.ZodString;
        context: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        message: string;
        kind: "relationship_unknown_source" | "relationship_unknown_target" | "relationship_self_edge" | "duplicate_entity_id";
        context: Record<string, string>;
    }, {
        message: string;
        kind: "relationship_unknown_source" | "relationship_unknown_target" | "relationship_self_edge" | "duplicate_entity_id";
        context?: Record<string, string> | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    facts: {
        id: string;
        text: string;
        category: "definition" | "causal" | "general";
        priority: "high" | "medium" | "low";
        confidence: number;
        sourceUrls: string[];
    }[];
    ideations: {
        type: "checklist" | "mini_course" | "info_box" | "habit";
        title: string;
        id: string;
        priority: "high" | "medium" | "low";
        description: string;
        audience: string;
        channels: string[];
        keywords: string[];
    }[];
    entities: {
        id: string;
        originalSurface: string;
        entity: string;
        domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
        evidence: string;
    }[];
    relationships: {
        type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
        source: string;
        description: string;
        target: string;
        evidence: string;
        sourceName: string;
        targetName: string;
    }[];
    measurables: {
        value: string;
        definition: string;
        id: string;
        sourceUrls: string[];
        unit: string | null;
        formatted: string;
    }[];
    meta: {
        mainKeyword: string;
        language: string;
        category: string;
        mainEntity: string;
        generatedAt: string;
        counts: {
            facts: number;
            ideations: number;
            entities: number;
            relationships: number;
            measurables: number;
        };
    };
    warnings: {
        message: string;
        kind: "relationship_unknown_source" | "relationship_unknown_target" | "relationship_self_edge" | "duplicate_entity_id";
        context: Record<string, string>;
    }[];
}, {
    facts: {
        id: string;
        text: string;
        category: "definition" | "causal" | "general";
        priority: "high" | "medium" | "low";
        confidence: number;
        sourceUrls?: string[] | undefined;
    }[];
    ideations: {
        type: "checklist" | "mini_course" | "info_box" | "habit";
        title: string;
        id: string;
        priority: "high" | "medium" | "low";
        description: string;
        audience?: string | undefined;
        channels?: string[] | undefined;
        keywords?: string[] | undefined;
    }[];
    entities: {
        id: string;
        originalSurface: string;
        entity: string;
        domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
        evidence: string;
    }[];
    relationships: {
        type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
        source: string;
        description: string;
        target: string;
        evidence: string;
        sourceName: string;
        targetName: string;
    }[];
    measurables: {
        value: string;
        definition: string;
        id: string;
        unit: string | null;
        formatted: string;
        sourceUrls?: string[] | undefined;
    }[];
    meta: {
        mainKeyword: string;
        language: string;
        category: string;
        mainEntity: string;
        generatedAt: string;
        counts: {
            facts: number;
            ideations: number;
            entities: number;
            relationships: number;
            measurables: number;
        };
    };
    warnings: {
        message: string;
        kind: "relationship_unknown_source" | "relationship_unknown_target" | "relationship_self_edge" | "duplicate_entity_id";
        context?: Record<string, string> | undefined;
    }[];
}>;
export type KnowledgeGraph = z.infer<typeof KnowledgeGraph>;
export declare const SectionType: z.ZodEnum<["intro", "h2"]>;
export type SectionType = z.infer<typeof SectionType>;
export declare const SectionVariant: z.ZodEnum<["full", "context"]>;
export type SectionVariant = z.infer<typeof SectionVariant>;
export declare const H3Format: z.ZodEnum<["question", "context"]>;
export type H3Format = z.infer<typeof H3Format>;
export declare const OutlineH3: z.ZodObject<{
    header: z.ZodString;
    format: z.ZodEnum<["question", "context"]>;
    sourcePaa: z.ZodString;
}, "strip", z.ZodTypeAny, {
    header: string;
    format: "question" | "context";
    sourcePaa: string;
}, {
    header: string;
    format: "question" | "context";
    sourcePaa: string;
}>;
export type OutlineH3 = z.infer<typeof OutlineH3>;
export declare const IntroSection: z.ZodObject<{
    type: z.ZodLiteral<"intro">;
    order: z.ZodLiteral<0>;
    header: z.ZodNull;
    sectionVariant: z.ZodNull;
    h3s: z.ZodTuple<[], null>;
}, "strip", z.ZodTypeAny, {
    type: "intro";
    header: null;
    order: 0;
    sectionVariant: null;
    h3s: [];
}, {
    type: "intro";
    header: null;
    order: 0;
    sectionVariant: null;
    h3s: [];
}>;
export type IntroSection = z.infer<typeof IntroSection>;
export declare const FullSection: z.ZodObject<{
    type: z.ZodLiteral<"h2">;
    order: z.ZodNumber;
    sectionVariant: z.ZodLiteral<"full">;
    header: z.ZodString;
    sourceArea: z.ZodString;
    sourceIntent: z.ZodEnum<["Definicyjna", "Problemowa", "Instrukcyjna", "Decyzyjna", "Diagnostyczna", "Porównawcza"]>;
    h3s: z.ZodArray<z.ZodObject<{
        header: z.ZodString;
        format: z.ZodEnum<["question", "context"]>;
        sourcePaa: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        header: string;
        format: "question" | "context";
        sourcePaa: string;
    }, {
        header: string;
        format: "question" | "context";
        sourcePaa: string;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    type: "h2";
    header: string;
    order: number;
    sectionVariant: "full";
    h3s: {
        header: string;
        format: "question" | "context";
        sourcePaa: string;
    }[];
    sourceArea: string;
    sourceIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
}, {
    type: "h2";
    header: string;
    order: number;
    sectionVariant: "full";
    h3s: {
        header: string;
        format: "question" | "context";
        sourcePaa: string;
    }[];
    sourceArea: string;
    sourceIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
}>;
export type FullSection = z.infer<typeof FullSection>;
export declare const ContextSection: z.ZodObject<{
    type: z.ZodLiteral<"h2">;
    order: z.ZodNumber;
    sectionVariant: z.ZodLiteral<"context">;
    header: z.ZodString;
    sourceIntent: z.ZodEnum<["Definicyjna", "Problemowa", "Instrukcyjna", "Decyzyjna", "Diagnostyczna", "Porównawcza"]>;
    groupedAreas: z.ZodArray<z.ZodString, "many">;
    contextNote: z.ZodString;
    h3s: z.ZodTuple<[], null>;
}, "strip", z.ZodTypeAny, {
    type: "h2";
    header: string;
    order: number;
    sectionVariant: "context";
    h3s: [];
    sourceIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
    groupedAreas: string[];
    contextNote: string;
}, {
    type: "h2";
    header: string;
    order: number;
    sectionVariant: "context";
    h3s: [];
    sourceIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
    groupedAreas: string[];
    contextNote: string;
}>;
export type ContextSection = z.infer<typeof ContextSection>;
export declare const OutlineSection: z.ZodUnion<[z.ZodObject<{
    type: z.ZodLiteral<"intro">;
    order: z.ZodLiteral<0>;
    header: z.ZodNull;
    sectionVariant: z.ZodNull;
    h3s: z.ZodTuple<[], null>;
}, "strip", z.ZodTypeAny, {
    type: "intro";
    header: null;
    order: 0;
    sectionVariant: null;
    h3s: [];
}, {
    type: "intro";
    header: null;
    order: 0;
    sectionVariant: null;
    h3s: [];
}>, z.ZodObject<{
    type: z.ZodLiteral<"h2">;
    order: z.ZodNumber;
    sectionVariant: z.ZodLiteral<"full">;
    header: z.ZodString;
    sourceArea: z.ZodString;
    sourceIntent: z.ZodEnum<["Definicyjna", "Problemowa", "Instrukcyjna", "Decyzyjna", "Diagnostyczna", "Porównawcza"]>;
    h3s: z.ZodArray<z.ZodObject<{
        header: z.ZodString;
        format: z.ZodEnum<["question", "context"]>;
        sourcePaa: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        header: string;
        format: "question" | "context";
        sourcePaa: string;
    }, {
        header: string;
        format: "question" | "context";
        sourcePaa: string;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    type: "h2";
    header: string;
    order: number;
    sectionVariant: "full";
    h3s: {
        header: string;
        format: "question" | "context";
        sourcePaa: string;
    }[];
    sourceArea: string;
    sourceIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
}, {
    type: "h2";
    header: string;
    order: number;
    sectionVariant: "full";
    h3s: {
        header: string;
        format: "question" | "context";
        sourcePaa: string;
    }[];
    sourceArea: string;
    sourceIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
}>, z.ZodObject<{
    type: z.ZodLiteral<"h2">;
    order: z.ZodNumber;
    sectionVariant: z.ZodLiteral<"context">;
    header: z.ZodString;
    sourceIntent: z.ZodEnum<["Definicyjna", "Problemowa", "Instrukcyjna", "Decyzyjna", "Diagnostyczna", "Porównawcza"]>;
    groupedAreas: z.ZodArray<z.ZodString, "many">;
    contextNote: z.ZodString;
    h3s: z.ZodTuple<[], null>;
}, "strip", z.ZodTypeAny, {
    type: "h2";
    header: string;
    order: number;
    sectionVariant: "context";
    h3s: [];
    sourceIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
    groupedAreas: string[];
    contextNote: string;
}, {
    type: "h2";
    header: string;
    order: number;
    sectionVariant: "context";
    h3s: [];
    sourceIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
    groupedAreas: string[];
    contextNote: string;
}>]>;
export type OutlineSection = z.infer<typeof OutlineSection>;
export declare const OutlineGenWarningKind: z.ZodEnum<["outline_missing_primary_intent_areas", "outline_h3_count_mismatch", "outline_unused_area", "outline_intent_override_no_match"]>;
export type OutlineGenWarningKind = z.infer<typeof OutlineGenWarningKind>;
export declare const OutlineGenWarning: z.ZodObject<{
    kind: z.ZodEnum<["outline_missing_primary_intent_areas", "outline_h3_count_mismatch", "outline_unused_area", "outline_intent_override_no_match"]>;
    message: z.ZodString;
    context: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    message: string;
    kind: "outline_missing_primary_intent_areas" | "outline_h3_count_mismatch" | "outline_unused_area" | "outline_intent_override_no_match";
    context: Record<string, string>;
}, {
    message: string;
    kind: "outline_missing_primary_intent_areas" | "outline_h3_count_mismatch" | "outline_unused_area" | "outline_intent_override_no_match";
    context?: Record<string, string> | undefined;
}>;
export type OutlineGenWarning = z.infer<typeof OutlineGenWarning>;
export declare const OutlineGenerationResult: z.ZodObject<{
    meta: z.ZodObject<{
        keyword: z.ZodString;
        h1Title: z.ZodString;
        h1Source: z.ZodEnum<["user", "llm"]>;
        language: z.ZodString;
        primaryIntent: z.ZodEnum<["Definicyjna", "Problemowa", "Instrukcyjna", "Decyzyjna", "Diagnostyczna", "Porównawcza"]>;
        primaryIntentSource: z.ZodEnum<["user", "fanout"]>;
        fullSectionsCount: z.ZodNumber;
        contextSectionsCount: z.ZodNumber;
        generatedAt: z.ZodString;
        model: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        model: string;
        h1Title: string;
        keyword: string;
        language: string;
        generatedAt: string;
        h1Source: "user" | "llm";
        primaryIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
        primaryIntentSource: "user" | "fanout";
        fullSectionsCount: number;
        contextSectionsCount: number;
    }, {
        model: string;
        h1Title: string;
        keyword: string;
        language: string;
        generatedAt: string;
        h1Source: "user" | "llm";
        primaryIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
        primaryIntentSource: "user" | "fanout";
        fullSectionsCount: number;
        contextSectionsCount: number;
    }>;
    outline: z.ZodArray<z.ZodUnion<[z.ZodObject<{
        type: z.ZodLiteral<"intro">;
        order: z.ZodLiteral<0>;
        header: z.ZodNull;
        sectionVariant: z.ZodNull;
        h3s: z.ZodTuple<[], null>;
    }, "strip", z.ZodTypeAny, {
        type: "intro";
        header: null;
        order: 0;
        sectionVariant: null;
        h3s: [];
    }, {
        type: "intro";
        header: null;
        order: 0;
        sectionVariant: null;
        h3s: [];
    }>, z.ZodObject<{
        type: z.ZodLiteral<"h2">;
        order: z.ZodNumber;
        sectionVariant: z.ZodLiteral<"full">;
        header: z.ZodString;
        sourceArea: z.ZodString;
        sourceIntent: z.ZodEnum<["Definicyjna", "Problemowa", "Instrukcyjna", "Decyzyjna", "Diagnostyczna", "Porównawcza"]>;
        h3s: z.ZodArray<z.ZodObject<{
            header: z.ZodString;
            format: z.ZodEnum<["question", "context"]>;
            sourcePaa: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            header: string;
            format: "question" | "context";
            sourcePaa: string;
        }, {
            header: string;
            format: "question" | "context";
            sourcePaa: string;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        type: "h2";
        header: string;
        order: number;
        sectionVariant: "full";
        h3s: {
            header: string;
            format: "question" | "context";
            sourcePaa: string;
        }[];
        sourceArea: string;
        sourceIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
    }, {
        type: "h2";
        header: string;
        order: number;
        sectionVariant: "full";
        h3s: {
            header: string;
            format: "question" | "context";
            sourcePaa: string;
        }[];
        sourceArea: string;
        sourceIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
    }>, z.ZodObject<{
        type: z.ZodLiteral<"h2">;
        order: z.ZodNumber;
        sectionVariant: z.ZodLiteral<"context">;
        header: z.ZodString;
        sourceIntent: z.ZodEnum<["Definicyjna", "Problemowa", "Instrukcyjna", "Decyzyjna", "Diagnostyczna", "Porównawcza"]>;
        groupedAreas: z.ZodArray<z.ZodString, "many">;
        contextNote: z.ZodString;
        h3s: z.ZodTuple<[], null>;
    }, "strip", z.ZodTypeAny, {
        type: "h2";
        header: string;
        order: number;
        sectionVariant: "context";
        h3s: [];
        sourceIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
        groupedAreas: string[];
        contextNote: string;
    }, {
        type: "h2";
        header: string;
        order: number;
        sectionVariant: "context";
        h3s: [];
        sourceIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
        groupedAreas: string[];
        contextNote: string;
    }>]>, "many">;
    warnings: z.ZodArray<z.ZodObject<{
        kind: z.ZodEnum<["outline_missing_primary_intent_areas", "outline_h3_count_mismatch", "outline_unused_area", "outline_intent_override_no_match"]>;
        message: z.ZodString;
        context: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        message: string;
        kind: "outline_missing_primary_intent_areas" | "outline_h3_count_mismatch" | "outline_unused_area" | "outline_intent_override_no_match";
        context: Record<string, string>;
    }, {
        message: string;
        kind: "outline_missing_primary_intent_areas" | "outline_h3_count_mismatch" | "outline_unused_area" | "outline_intent_override_no_match";
        context?: Record<string, string> | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    meta: {
        model: string;
        h1Title: string;
        keyword: string;
        language: string;
        generatedAt: string;
        h1Source: "user" | "llm";
        primaryIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
        primaryIntentSource: "user" | "fanout";
        fullSectionsCount: number;
        contextSectionsCount: number;
    };
    warnings: {
        message: string;
        kind: "outline_missing_primary_intent_areas" | "outline_h3_count_mismatch" | "outline_unused_area" | "outline_intent_override_no_match";
        context: Record<string, string>;
    }[];
    outline: ({
        type: "intro";
        header: null;
        order: 0;
        sectionVariant: null;
        h3s: [];
    } | {
        type: "h2";
        header: string;
        order: number;
        sectionVariant: "full";
        h3s: {
            header: string;
            format: "question" | "context";
            sourcePaa: string;
        }[];
        sourceArea: string;
        sourceIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
    } | {
        type: "h2";
        header: string;
        order: number;
        sectionVariant: "context";
        h3s: [];
        sourceIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
        groupedAreas: string[];
        contextNote: string;
    })[];
}, {
    meta: {
        model: string;
        h1Title: string;
        keyword: string;
        language: string;
        generatedAt: string;
        h1Source: "user" | "llm";
        primaryIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
        primaryIntentSource: "user" | "fanout";
        fullSectionsCount: number;
        contextSectionsCount: number;
    };
    warnings: {
        message: string;
        kind: "outline_missing_primary_intent_areas" | "outline_h3_count_mismatch" | "outline_unused_area" | "outline_intent_override_no_match";
        context?: Record<string, string> | undefined;
    }[];
    outline: ({
        type: "intro";
        header: null;
        order: 0;
        sectionVariant: null;
        h3s: [];
    } | {
        type: "h2";
        header: string;
        order: number;
        sectionVariant: "full";
        h3s: {
            header: string;
            format: "question" | "context";
            sourcePaa: string;
        }[];
        sourceArea: string;
        sourceIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
    } | {
        type: "h2";
        header: string;
        order: number;
        sectionVariant: "context";
        h3s: [];
        sourceIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
        groupedAreas: string[];
        contextNote: string;
    })[];
}>;
export type OutlineGenerationResult = z.infer<typeof OutlineGenerationResult>;
export declare const IntroSectionWithKG: z.ZodObject<{
    type: z.ZodLiteral<"intro">;
    order: z.ZodLiteral<0>;
    header: z.ZodNull;
    sectionVariant: z.ZodNull;
    h3s: z.ZodTuple<[], null>;
} & {
    entities: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        originalSurface: z.ZodString;
        entity: z.ZodString;
        domainType: z.ZodEnum<["PERSON", "ORGANIZATION", "LOCATION", "PRODUCT", "CONCEPT", "EVENT"]>;
        evidence: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        originalSurface: string;
        entity: string;
        domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
        evidence: string;
    }, {
        id: string;
        originalSurface: string;
        entity: string;
        domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
        evidence: string;
    }>, "many">;
    facts: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        text: z.ZodString;
        category: z.ZodEnum<["definition", "causal", "general"]>;
        priority: z.ZodEnum<["high", "medium", "low"]>;
        confidence: z.ZodNumber;
        sourceUrls: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        text: string;
        category: "definition" | "causal" | "general";
        priority: "high" | "medium" | "low";
        confidence: number;
        sourceUrls: string[];
    }, {
        id: string;
        text: string;
        category: "definition" | "causal" | "general";
        priority: "high" | "medium" | "low";
        confidence: number;
        sourceUrls?: string[] | undefined;
    }>, "many">;
    relationships: z.ZodArray<z.ZodObject<{
        source: z.ZodString;
        target: z.ZodString;
        type: z.ZodEnum<["PART_OF", "LOCATED_IN", "CREATED_BY", "WORKS_FOR", "RELATED_TO", "HAS_FEATURE", "SOLVES", "COMPETES_WITH", "CONNECTED_TO", "USED_BY", "REQUIRES"]>;
        description: z.ZodString;
        evidence: z.ZodString;
    } & {
        sourceName: z.ZodString;
        targetName: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
        source: string;
        description: string;
        target: string;
        evidence: string;
        sourceName: string;
        targetName: string;
    }, {
        type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
        source: string;
        description: string;
        target: string;
        evidence: string;
        sourceName: string;
        targetName: string;
    }>, "many">;
    ideations: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodEnum<["checklist", "mini_course", "info_box", "habit"]>;
        title: z.ZodString;
        description: z.ZodString;
        audience: z.ZodDefault<z.ZodString>;
        channels: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        keywords: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        priority: z.ZodEnum<["high", "medium", "low"]>;
    }, "strip", z.ZodTypeAny, {
        type: "checklist" | "mini_course" | "info_box" | "habit";
        title: string;
        id: string;
        priority: "high" | "medium" | "low";
        description: string;
        audience: string;
        channels: string[];
        keywords: string[];
    }, {
        type: "checklist" | "mini_course" | "info_box" | "habit";
        title: string;
        id: string;
        priority: "high" | "medium" | "low";
        description: string;
        audience?: string | undefined;
        channels?: string[] | undefined;
        keywords?: string[] | undefined;
    }>, "many">;
    measurables: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        definition: z.ZodString;
        value: z.ZodString;
        unit: z.ZodNullable<z.ZodString>;
        sourceUrls: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    } & {
        formatted: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        value: string;
        definition: string;
        id: string;
        sourceUrls: string[];
        unit: string | null;
        formatted: string;
    }, {
        value: string;
        definition: string;
        id: string;
        unit: string | null;
        formatted: string;
        sourceUrls?: string[] | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    type: "intro";
    facts: {
        id: string;
        text: string;
        category: "definition" | "causal" | "general";
        priority: "high" | "medium" | "low";
        confidence: number;
        sourceUrls: string[];
    }[];
    ideations: {
        type: "checklist" | "mini_course" | "info_box" | "habit";
        title: string;
        id: string;
        priority: "high" | "medium" | "low";
        description: string;
        audience: string;
        channels: string[];
        keywords: string[];
    }[];
    entities: {
        id: string;
        originalSurface: string;
        entity: string;
        domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
        evidence: string;
    }[];
    relationships: {
        type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
        source: string;
        description: string;
        target: string;
        evidence: string;
        sourceName: string;
        targetName: string;
    }[];
    measurables: {
        value: string;
        definition: string;
        id: string;
        sourceUrls: string[];
        unit: string | null;
        formatted: string;
    }[];
    header: null;
    order: 0;
    sectionVariant: null;
    h3s: [];
}, {
    type: "intro";
    facts: {
        id: string;
        text: string;
        category: "definition" | "causal" | "general";
        priority: "high" | "medium" | "low";
        confidence: number;
        sourceUrls?: string[] | undefined;
    }[];
    ideations: {
        type: "checklist" | "mini_course" | "info_box" | "habit";
        title: string;
        id: string;
        priority: "high" | "medium" | "low";
        description: string;
        audience?: string | undefined;
        channels?: string[] | undefined;
        keywords?: string[] | undefined;
    }[];
    entities: {
        id: string;
        originalSurface: string;
        entity: string;
        domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
        evidence: string;
    }[];
    relationships: {
        type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
        source: string;
        description: string;
        target: string;
        evidence: string;
        sourceName: string;
        targetName: string;
    }[];
    measurables: {
        value: string;
        definition: string;
        id: string;
        unit: string | null;
        formatted: string;
        sourceUrls?: string[] | undefined;
    }[];
    header: null;
    order: 0;
    sectionVariant: null;
    h3s: [];
}>;
export type IntroSectionWithKG = z.infer<typeof IntroSectionWithKG>;
export declare const FullSectionWithKG: z.ZodObject<{
    type: z.ZodLiteral<"h2">;
    order: z.ZodNumber;
    sectionVariant: z.ZodLiteral<"full">;
    header: z.ZodString;
    sourceArea: z.ZodString;
    sourceIntent: z.ZodEnum<["Definicyjna", "Problemowa", "Instrukcyjna", "Decyzyjna", "Diagnostyczna", "Porównawcza"]>;
    h3s: z.ZodArray<z.ZodObject<{
        header: z.ZodString;
        format: z.ZodEnum<["question", "context"]>;
        sourcePaa: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        header: string;
        format: "question" | "context";
        sourcePaa: string;
    }, {
        header: string;
        format: "question" | "context";
        sourcePaa: string;
    }>, "many">;
} & {
    entities: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        originalSurface: z.ZodString;
        entity: z.ZodString;
        domainType: z.ZodEnum<["PERSON", "ORGANIZATION", "LOCATION", "PRODUCT", "CONCEPT", "EVENT"]>;
        evidence: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        originalSurface: string;
        entity: string;
        domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
        evidence: string;
    }, {
        id: string;
        originalSurface: string;
        entity: string;
        domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
        evidence: string;
    }>, "many">;
    facts: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        text: z.ZodString;
        category: z.ZodEnum<["definition", "causal", "general"]>;
        priority: z.ZodEnum<["high", "medium", "low"]>;
        confidence: z.ZodNumber;
        sourceUrls: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        text: string;
        category: "definition" | "causal" | "general";
        priority: "high" | "medium" | "low";
        confidence: number;
        sourceUrls: string[];
    }, {
        id: string;
        text: string;
        category: "definition" | "causal" | "general";
        priority: "high" | "medium" | "low";
        confidence: number;
        sourceUrls?: string[] | undefined;
    }>, "many">;
    relationships: z.ZodArray<z.ZodObject<{
        source: z.ZodString;
        target: z.ZodString;
        type: z.ZodEnum<["PART_OF", "LOCATED_IN", "CREATED_BY", "WORKS_FOR", "RELATED_TO", "HAS_FEATURE", "SOLVES", "COMPETES_WITH", "CONNECTED_TO", "USED_BY", "REQUIRES"]>;
        description: z.ZodString;
        evidence: z.ZodString;
    } & {
        sourceName: z.ZodString;
        targetName: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
        source: string;
        description: string;
        target: string;
        evidence: string;
        sourceName: string;
        targetName: string;
    }, {
        type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
        source: string;
        description: string;
        target: string;
        evidence: string;
        sourceName: string;
        targetName: string;
    }>, "many">;
    ideations: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodEnum<["checklist", "mini_course", "info_box", "habit"]>;
        title: z.ZodString;
        description: z.ZodString;
        audience: z.ZodDefault<z.ZodString>;
        channels: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        keywords: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        priority: z.ZodEnum<["high", "medium", "low"]>;
    }, "strip", z.ZodTypeAny, {
        type: "checklist" | "mini_course" | "info_box" | "habit";
        title: string;
        id: string;
        priority: "high" | "medium" | "low";
        description: string;
        audience: string;
        channels: string[];
        keywords: string[];
    }, {
        type: "checklist" | "mini_course" | "info_box" | "habit";
        title: string;
        id: string;
        priority: "high" | "medium" | "low";
        description: string;
        audience?: string | undefined;
        channels?: string[] | undefined;
        keywords?: string[] | undefined;
    }>, "many">;
    measurables: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        definition: z.ZodString;
        value: z.ZodString;
        unit: z.ZodNullable<z.ZodString>;
        sourceUrls: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    } & {
        formatted: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        value: string;
        definition: string;
        id: string;
        sourceUrls: string[];
        unit: string | null;
        formatted: string;
    }, {
        value: string;
        definition: string;
        id: string;
        unit: string | null;
        formatted: string;
        sourceUrls?: string[] | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    type: "h2";
    facts: {
        id: string;
        text: string;
        category: "definition" | "causal" | "general";
        priority: "high" | "medium" | "low";
        confidence: number;
        sourceUrls: string[];
    }[];
    ideations: {
        type: "checklist" | "mini_course" | "info_box" | "habit";
        title: string;
        id: string;
        priority: "high" | "medium" | "low";
        description: string;
        audience: string;
        channels: string[];
        keywords: string[];
    }[];
    entities: {
        id: string;
        originalSurface: string;
        entity: string;
        domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
        evidence: string;
    }[];
    relationships: {
        type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
        source: string;
        description: string;
        target: string;
        evidence: string;
        sourceName: string;
        targetName: string;
    }[];
    measurables: {
        value: string;
        definition: string;
        id: string;
        sourceUrls: string[];
        unit: string | null;
        formatted: string;
    }[];
    header: string;
    order: number;
    sectionVariant: "full";
    h3s: {
        header: string;
        format: "question" | "context";
        sourcePaa: string;
    }[];
    sourceArea: string;
    sourceIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
}, {
    type: "h2";
    facts: {
        id: string;
        text: string;
        category: "definition" | "causal" | "general";
        priority: "high" | "medium" | "low";
        confidence: number;
        sourceUrls?: string[] | undefined;
    }[];
    ideations: {
        type: "checklist" | "mini_course" | "info_box" | "habit";
        title: string;
        id: string;
        priority: "high" | "medium" | "low";
        description: string;
        audience?: string | undefined;
        channels?: string[] | undefined;
        keywords?: string[] | undefined;
    }[];
    entities: {
        id: string;
        originalSurface: string;
        entity: string;
        domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
        evidence: string;
    }[];
    relationships: {
        type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
        source: string;
        description: string;
        target: string;
        evidence: string;
        sourceName: string;
        targetName: string;
    }[];
    measurables: {
        value: string;
        definition: string;
        id: string;
        unit: string | null;
        formatted: string;
        sourceUrls?: string[] | undefined;
    }[];
    header: string;
    order: number;
    sectionVariant: "full";
    h3s: {
        header: string;
        format: "question" | "context";
        sourcePaa: string;
    }[];
    sourceArea: string;
    sourceIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
}>;
export type FullSectionWithKG = z.infer<typeof FullSectionWithKG>;
export declare const ContextSectionWithKG: z.ZodObject<{
    type: z.ZodLiteral<"h2">;
    order: z.ZodNumber;
    sectionVariant: z.ZodLiteral<"context">;
    header: z.ZodString;
    sourceIntent: z.ZodEnum<["Definicyjna", "Problemowa", "Instrukcyjna", "Decyzyjna", "Diagnostyczna", "Porównawcza"]>;
    groupedAreas: z.ZodArray<z.ZodString, "many">;
    contextNote: z.ZodString;
    h3s: z.ZodTuple<[], null>;
} & {
    entities: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        originalSurface: z.ZodString;
        entity: z.ZodString;
        domainType: z.ZodEnum<["PERSON", "ORGANIZATION", "LOCATION", "PRODUCT", "CONCEPT", "EVENT"]>;
        evidence: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        originalSurface: string;
        entity: string;
        domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
        evidence: string;
    }, {
        id: string;
        originalSurface: string;
        entity: string;
        domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
        evidence: string;
    }>, "many">;
    facts: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        text: z.ZodString;
        category: z.ZodEnum<["definition", "causal", "general"]>;
        priority: z.ZodEnum<["high", "medium", "low"]>;
        confidence: z.ZodNumber;
        sourceUrls: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        text: string;
        category: "definition" | "causal" | "general";
        priority: "high" | "medium" | "low";
        confidence: number;
        sourceUrls: string[];
    }, {
        id: string;
        text: string;
        category: "definition" | "causal" | "general";
        priority: "high" | "medium" | "low";
        confidence: number;
        sourceUrls?: string[] | undefined;
    }>, "many">;
    relationships: z.ZodArray<z.ZodObject<{
        source: z.ZodString;
        target: z.ZodString;
        type: z.ZodEnum<["PART_OF", "LOCATED_IN", "CREATED_BY", "WORKS_FOR", "RELATED_TO", "HAS_FEATURE", "SOLVES", "COMPETES_WITH", "CONNECTED_TO", "USED_BY", "REQUIRES"]>;
        description: z.ZodString;
        evidence: z.ZodString;
    } & {
        sourceName: z.ZodString;
        targetName: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
        source: string;
        description: string;
        target: string;
        evidence: string;
        sourceName: string;
        targetName: string;
    }, {
        type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
        source: string;
        description: string;
        target: string;
        evidence: string;
        sourceName: string;
        targetName: string;
    }>, "many">;
    ideations: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodEnum<["checklist", "mini_course", "info_box", "habit"]>;
        title: z.ZodString;
        description: z.ZodString;
        audience: z.ZodDefault<z.ZodString>;
        channels: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        keywords: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        priority: z.ZodEnum<["high", "medium", "low"]>;
    }, "strip", z.ZodTypeAny, {
        type: "checklist" | "mini_course" | "info_box" | "habit";
        title: string;
        id: string;
        priority: "high" | "medium" | "low";
        description: string;
        audience: string;
        channels: string[];
        keywords: string[];
    }, {
        type: "checklist" | "mini_course" | "info_box" | "habit";
        title: string;
        id: string;
        priority: "high" | "medium" | "low";
        description: string;
        audience?: string | undefined;
        channels?: string[] | undefined;
        keywords?: string[] | undefined;
    }>, "many">;
    measurables: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        definition: z.ZodString;
        value: z.ZodString;
        unit: z.ZodNullable<z.ZodString>;
        sourceUrls: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    } & {
        formatted: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        value: string;
        definition: string;
        id: string;
        sourceUrls: string[];
        unit: string | null;
        formatted: string;
    }, {
        value: string;
        definition: string;
        id: string;
        unit: string | null;
        formatted: string;
        sourceUrls?: string[] | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    type: "h2";
    facts: {
        id: string;
        text: string;
        category: "definition" | "causal" | "general";
        priority: "high" | "medium" | "low";
        confidence: number;
        sourceUrls: string[];
    }[];
    ideations: {
        type: "checklist" | "mini_course" | "info_box" | "habit";
        title: string;
        id: string;
        priority: "high" | "medium" | "low";
        description: string;
        audience: string;
        channels: string[];
        keywords: string[];
    }[];
    entities: {
        id: string;
        originalSurface: string;
        entity: string;
        domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
        evidence: string;
    }[];
    relationships: {
        type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
        source: string;
        description: string;
        target: string;
        evidence: string;
        sourceName: string;
        targetName: string;
    }[];
    measurables: {
        value: string;
        definition: string;
        id: string;
        sourceUrls: string[];
        unit: string | null;
        formatted: string;
    }[];
    header: string;
    order: number;
    sectionVariant: "context";
    h3s: [];
    sourceIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
    groupedAreas: string[];
    contextNote: string;
}, {
    type: "h2";
    facts: {
        id: string;
        text: string;
        category: "definition" | "causal" | "general";
        priority: "high" | "medium" | "low";
        confidence: number;
        sourceUrls?: string[] | undefined;
    }[];
    ideations: {
        type: "checklist" | "mini_course" | "info_box" | "habit";
        title: string;
        id: string;
        priority: "high" | "medium" | "low";
        description: string;
        audience?: string | undefined;
        channels?: string[] | undefined;
        keywords?: string[] | undefined;
    }[];
    entities: {
        id: string;
        originalSurface: string;
        entity: string;
        domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
        evidence: string;
    }[];
    relationships: {
        type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
        source: string;
        description: string;
        target: string;
        evidence: string;
        sourceName: string;
        targetName: string;
    }[];
    measurables: {
        value: string;
        definition: string;
        id: string;
        unit: string | null;
        formatted: string;
        sourceUrls?: string[] | undefined;
    }[];
    header: string;
    order: number;
    sectionVariant: "context";
    h3s: [];
    sourceIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
    groupedAreas: string[];
    contextNote: string;
}>;
export type ContextSectionWithKG = z.infer<typeof ContextSectionWithKG>;
export declare const SectionWithKG: z.ZodUnion<[z.ZodObject<{
    type: z.ZodLiteral<"intro">;
    order: z.ZodLiteral<0>;
    header: z.ZodNull;
    sectionVariant: z.ZodNull;
    h3s: z.ZodTuple<[], null>;
} & {
    entities: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        originalSurface: z.ZodString;
        entity: z.ZodString;
        domainType: z.ZodEnum<["PERSON", "ORGANIZATION", "LOCATION", "PRODUCT", "CONCEPT", "EVENT"]>;
        evidence: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        originalSurface: string;
        entity: string;
        domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
        evidence: string;
    }, {
        id: string;
        originalSurface: string;
        entity: string;
        domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
        evidence: string;
    }>, "many">;
    facts: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        text: z.ZodString;
        category: z.ZodEnum<["definition", "causal", "general"]>;
        priority: z.ZodEnum<["high", "medium", "low"]>;
        confidence: z.ZodNumber;
        sourceUrls: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        text: string;
        category: "definition" | "causal" | "general";
        priority: "high" | "medium" | "low";
        confidence: number;
        sourceUrls: string[];
    }, {
        id: string;
        text: string;
        category: "definition" | "causal" | "general";
        priority: "high" | "medium" | "low";
        confidence: number;
        sourceUrls?: string[] | undefined;
    }>, "many">;
    relationships: z.ZodArray<z.ZodObject<{
        source: z.ZodString;
        target: z.ZodString;
        type: z.ZodEnum<["PART_OF", "LOCATED_IN", "CREATED_BY", "WORKS_FOR", "RELATED_TO", "HAS_FEATURE", "SOLVES", "COMPETES_WITH", "CONNECTED_TO", "USED_BY", "REQUIRES"]>;
        description: z.ZodString;
        evidence: z.ZodString;
    } & {
        sourceName: z.ZodString;
        targetName: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
        source: string;
        description: string;
        target: string;
        evidence: string;
        sourceName: string;
        targetName: string;
    }, {
        type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
        source: string;
        description: string;
        target: string;
        evidence: string;
        sourceName: string;
        targetName: string;
    }>, "many">;
    ideations: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodEnum<["checklist", "mini_course", "info_box", "habit"]>;
        title: z.ZodString;
        description: z.ZodString;
        audience: z.ZodDefault<z.ZodString>;
        channels: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        keywords: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        priority: z.ZodEnum<["high", "medium", "low"]>;
    }, "strip", z.ZodTypeAny, {
        type: "checklist" | "mini_course" | "info_box" | "habit";
        title: string;
        id: string;
        priority: "high" | "medium" | "low";
        description: string;
        audience: string;
        channels: string[];
        keywords: string[];
    }, {
        type: "checklist" | "mini_course" | "info_box" | "habit";
        title: string;
        id: string;
        priority: "high" | "medium" | "low";
        description: string;
        audience?: string | undefined;
        channels?: string[] | undefined;
        keywords?: string[] | undefined;
    }>, "many">;
    measurables: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        definition: z.ZodString;
        value: z.ZodString;
        unit: z.ZodNullable<z.ZodString>;
        sourceUrls: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    } & {
        formatted: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        value: string;
        definition: string;
        id: string;
        sourceUrls: string[];
        unit: string | null;
        formatted: string;
    }, {
        value: string;
        definition: string;
        id: string;
        unit: string | null;
        formatted: string;
        sourceUrls?: string[] | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    type: "intro";
    facts: {
        id: string;
        text: string;
        category: "definition" | "causal" | "general";
        priority: "high" | "medium" | "low";
        confidence: number;
        sourceUrls: string[];
    }[];
    ideations: {
        type: "checklist" | "mini_course" | "info_box" | "habit";
        title: string;
        id: string;
        priority: "high" | "medium" | "low";
        description: string;
        audience: string;
        channels: string[];
        keywords: string[];
    }[];
    entities: {
        id: string;
        originalSurface: string;
        entity: string;
        domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
        evidence: string;
    }[];
    relationships: {
        type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
        source: string;
        description: string;
        target: string;
        evidence: string;
        sourceName: string;
        targetName: string;
    }[];
    measurables: {
        value: string;
        definition: string;
        id: string;
        sourceUrls: string[];
        unit: string | null;
        formatted: string;
    }[];
    header: null;
    order: 0;
    sectionVariant: null;
    h3s: [];
}, {
    type: "intro";
    facts: {
        id: string;
        text: string;
        category: "definition" | "causal" | "general";
        priority: "high" | "medium" | "low";
        confidence: number;
        sourceUrls?: string[] | undefined;
    }[];
    ideations: {
        type: "checklist" | "mini_course" | "info_box" | "habit";
        title: string;
        id: string;
        priority: "high" | "medium" | "low";
        description: string;
        audience?: string | undefined;
        channels?: string[] | undefined;
        keywords?: string[] | undefined;
    }[];
    entities: {
        id: string;
        originalSurface: string;
        entity: string;
        domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
        evidence: string;
    }[];
    relationships: {
        type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
        source: string;
        description: string;
        target: string;
        evidence: string;
        sourceName: string;
        targetName: string;
    }[];
    measurables: {
        value: string;
        definition: string;
        id: string;
        unit: string | null;
        formatted: string;
        sourceUrls?: string[] | undefined;
    }[];
    header: null;
    order: 0;
    sectionVariant: null;
    h3s: [];
}>, z.ZodObject<{
    type: z.ZodLiteral<"h2">;
    order: z.ZodNumber;
    sectionVariant: z.ZodLiteral<"full">;
    header: z.ZodString;
    sourceArea: z.ZodString;
    sourceIntent: z.ZodEnum<["Definicyjna", "Problemowa", "Instrukcyjna", "Decyzyjna", "Diagnostyczna", "Porównawcza"]>;
    h3s: z.ZodArray<z.ZodObject<{
        header: z.ZodString;
        format: z.ZodEnum<["question", "context"]>;
        sourcePaa: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        header: string;
        format: "question" | "context";
        sourcePaa: string;
    }, {
        header: string;
        format: "question" | "context";
        sourcePaa: string;
    }>, "many">;
} & {
    entities: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        originalSurface: z.ZodString;
        entity: z.ZodString;
        domainType: z.ZodEnum<["PERSON", "ORGANIZATION", "LOCATION", "PRODUCT", "CONCEPT", "EVENT"]>;
        evidence: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        originalSurface: string;
        entity: string;
        domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
        evidence: string;
    }, {
        id: string;
        originalSurface: string;
        entity: string;
        domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
        evidence: string;
    }>, "many">;
    facts: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        text: z.ZodString;
        category: z.ZodEnum<["definition", "causal", "general"]>;
        priority: z.ZodEnum<["high", "medium", "low"]>;
        confidence: z.ZodNumber;
        sourceUrls: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        text: string;
        category: "definition" | "causal" | "general";
        priority: "high" | "medium" | "low";
        confidence: number;
        sourceUrls: string[];
    }, {
        id: string;
        text: string;
        category: "definition" | "causal" | "general";
        priority: "high" | "medium" | "low";
        confidence: number;
        sourceUrls?: string[] | undefined;
    }>, "many">;
    relationships: z.ZodArray<z.ZodObject<{
        source: z.ZodString;
        target: z.ZodString;
        type: z.ZodEnum<["PART_OF", "LOCATED_IN", "CREATED_BY", "WORKS_FOR", "RELATED_TO", "HAS_FEATURE", "SOLVES", "COMPETES_WITH", "CONNECTED_TO", "USED_BY", "REQUIRES"]>;
        description: z.ZodString;
        evidence: z.ZodString;
    } & {
        sourceName: z.ZodString;
        targetName: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
        source: string;
        description: string;
        target: string;
        evidence: string;
        sourceName: string;
        targetName: string;
    }, {
        type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
        source: string;
        description: string;
        target: string;
        evidence: string;
        sourceName: string;
        targetName: string;
    }>, "many">;
    ideations: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodEnum<["checklist", "mini_course", "info_box", "habit"]>;
        title: z.ZodString;
        description: z.ZodString;
        audience: z.ZodDefault<z.ZodString>;
        channels: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        keywords: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        priority: z.ZodEnum<["high", "medium", "low"]>;
    }, "strip", z.ZodTypeAny, {
        type: "checklist" | "mini_course" | "info_box" | "habit";
        title: string;
        id: string;
        priority: "high" | "medium" | "low";
        description: string;
        audience: string;
        channels: string[];
        keywords: string[];
    }, {
        type: "checklist" | "mini_course" | "info_box" | "habit";
        title: string;
        id: string;
        priority: "high" | "medium" | "low";
        description: string;
        audience?: string | undefined;
        channels?: string[] | undefined;
        keywords?: string[] | undefined;
    }>, "many">;
    measurables: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        definition: z.ZodString;
        value: z.ZodString;
        unit: z.ZodNullable<z.ZodString>;
        sourceUrls: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    } & {
        formatted: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        value: string;
        definition: string;
        id: string;
        sourceUrls: string[];
        unit: string | null;
        formatted: string;
    }, {
        value: string;
        definition: string;
        id: string;
        unit: string | null;
        formatted: string;
        sourceUrls?: string[] | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    type: "h2";
    facts: {
        id: string;
        text: string;
        category: "definition" | "causal" | "general";
        priority: "high" | "medium" | "low";
        confidence: number;
        sourceUrls: string[];
    }[];
    ideations: {
        type: "checklist" | "mini_course" | "info_box" | "habit";
        title: string;
        id: string;
        priority: "high" | "medium" | "low";
        description: string;
        audience: string;
        channels: string[];
        keywords: string[];
    }[];
    entities: {
        id: string;
        originalSurface: string;
        entity: string;
        domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
        evidence: string;
    }[];
    relationships: {
        type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
        source: string;
        description: string;
        target: string;
        evidence: string;
        sourceName: string;
        targetName: string;
    }[];
    measurables: {
        value: string;
        definition: string;
        id: string;
        sourceUrls: string[];
        unit: string | null;
        formatted: string;
    }[];
    header: string;
    order: number;
    sectionVariant: "full";
    h3s: {
        header: string;
        format: "question" | "context";
        sourcePaa: string;
    }[];
    sourceArea: string;
    sourceIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
}, {
    type: "h2";
    facts: {
        id: string;
        text: string;
        category: "definition" | "causal" | "general";
        priority: "high" | "medium" | "low";
        confidence: number;
        sourceUrls?: string[] | undefined;
    }[];
    ideations: {
        type: "checklist" | "mini_course" | "info_box" | "habit";
        title: string;
        id: string;
        priority: "high" | "medium" | "low";
        description: string;
        audience?: string | undefined;
        channels?: string[] | undefined;
        keywords?: string[] | undefined;
    }[];
    entities: {
        id: string;
        originalSurface: string;
        entity: string;
        domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
        evidence: string;
    }[];
    relationships: {
        type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
        source: string;
        description: string;
        target: string;
        evidence: string;
        sourceName: string;
        targetName: string;
    }[];
    measurables: {
        value: string;
        definition: string;
        id: string;
        unit: string | null;
        formatted: string;
        sourceUrls?: string[] | undefined;
    }[];
    header: string;
    order: number;
    sectionVariant: "full";
    h3s: {
        header: string;
        format: "question" | "context";
        sourcePaa: string;
    }[];
    sourceArea: string;
    sourceIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
}>, z.ZodObject<{
    type: z.ZodLiteral<"h2">;
    order: z.ZodNumber;
    sectionVariant: z.ZodLiteral<"context">;
    header: z.ZodString;
    sourceIntent: z.ZodEnum<["Definicyjna", "Problemowa", "Instrukcyjna", "Decyzyjna", "Diagnostyczna", "Porównawcza"]>;
    groupedAreas: z.ZodArray<z.ZodString, "many">;
    contextNote: z.ZodString;
    h3s: z.ZodTuple<[], null>;
} & {
    entities: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        originalSurface: z.ZodString;
        entity: z.ZodString;
        domainType: z.ZodEnum<["PERSON", "ORGANIZATION", "LOCATION", "PRODUCT", "CONCEPT", "EVENT"]>;
        evidence: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        originalSurface: string;
        entity: string;
        domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
        evidence: string;
    }, {
        id: string;
        originalSurface: string;
        entity: string;
        domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
        evidence: string;
    }>, "many">;
    facts: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        text: z.ZodString;
        category: z.ZodEnum<["definition", "causal", "general"]>;
        priority: z.ZodEnum<["high", "medium", "low"]>;
        confidence: z.ZodNumber;
        sourceUrls: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        text: string;
        category: "definition" | "causal" | "general";
        priority: "high" | "medium" | "low";
        confidence: number;
        sourceUrls: string[];
    }, {
        id: string;
        text: string;
        category: "definition" | "causal" | "general";
        priority: "high" | "medium" | "low";
        confidence: number;
        sourceUrls?: string[] | undefined;
    }>, "many">;
    relationships: z.ZodArray<z.ZodObject<{
        source: z.ZodString;
        target: z.ZodString;
        type: z.ZodEnum<["PART_OF", "LOCATED_IN", "CREATED_BY", "WORKS_FOR", "RELATED_TO", "HAS_FEATURE", "SOLVES", "COMPETES_WITH", "CONNECTED_TO", "USED_BY", "REQUIRES"]>;
        description: z.ZodString;
        evidence: z.ZodString;
    } & {
        sourceName: z.ZodString;
        targetName: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
        source: string;
        description: string;
        target: string;
        evidence: string;
        sourceName: string;
        targetName: string;
    }, {
        type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
        source: string;
        description: string;
        target: string;
        evidence: string;
        sourceName: string;
        targetName: string;
    }>, "many">;
    ideations: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodEnum<["checklist", "mini_course", "info_box", "habit"]>;
        title: z.ZodString;
        description: z.ZodString;
        audience: z.ZodDefault<z.ZodString>;
        channels: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        keywords: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        priority: z.ZodEnum<["high", "medium", "low"]>;
    }, "strip", z.ZodTypeAny, {
        type: "checklist" | "mini_course" | "info_box" | "habit";
        title: string;
        id: string;
        priority: "high" | "medium" | "low";
        description: string;
        audience: string;
        channels: string[];
        keywords: string[];
    }, {
        type: "checklist" | "mini_course" | "info_box" | "habit";
        title: string;
        id: string;
        priority: "high" | "medium" | "low";
        description: string;
        audience?: string | undefined;
        channels?: string[] | undefined;
        keywords?: string[] | undefined;
    }>, "many">;
    measurables: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        definition: z.ZodString;
        value: z.ZodString;
        unit: z.ZodNullable<z.ZodString>;
        sourceUrls: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    } & {
        formatted: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        value: string;
        definition: string;
        id: string;
        sourceUrls: string[];
        unit: string | null;
        formatted: string;
    }, {
        value: string;
        definition: string;
        id: string;
        unit: string | null;
        formatted: string;
        sourceUrls?: string[] | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    type: "h2";
    facts: {
        id: string;
        text: string;
        category: "definition" | "causal" | "general";
        priority: "high" | "medium" | "low";
        confidence: number;
        sourceUrls: string[];
    }[];
    ideations: {
        type: "checklist" | "mini_course" | "info_box" | "habit";
        title: string;
        id: string;
        priority: "high" | "medium" | "low";
        description: string;
        audience: string;
        channels: string[];
        keywords: string[];
    }[];
    entities: {
        id: string;
        originalSurface: string;
        entity: string;
        domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
        evidence: string;
    }[];
    relationships: {
        type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
        source: string;
        description: string;
        target: string;
        evidence: string;
        sourceName: string;
        targetName: string;
    }[];
    measurables: {
        value: string;
        definition: string;
        id: string;
        sourceUrls: string[];
        unit: string | null;
        formatted: string;
    }[];
    header: string;
    order: number;
    sectionVariant: "context";
    h3s: [];
    sourceIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
    groupedAreas: string[];
    contextNote: string;
}, {
    type: "h2";
    facts: {
        id: string;
        text: string;
        category: "definition" | "causal" | "general";
        priority: "high" | "medium" | "low";
        confidence: number;
        sourceUrls?: string[] | undefined;
    }[];
    ideations: {
        type: "checklist" | "mini_course" | "info_box" | "habit";
        title: string;
        id: string;
        priority: "high" | "medium" | "low";
        description: string;
        audience?: string | undefined;
        channels?: string[] | undefined;
        keywords?: string[] | undefined;
    }[];
    entities: {
        id: string;
        originalSurface: string;
        entity: string;
        domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
        evidence: string;
    }[];
    relationships: {
        type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
        source: string;
        description: string;
        target: string;
        evidence: string;
        sourceName: string;
        targetName: string;
    }[];
    measurables: {
        value: string;
        definition: string;
        id: string;
        unit: string | null;
        formatted: string;
        sourceUrls?: string[] | undefined;
    }[];
    header: string;
    order: number;
    sectionVariant: "context";
    h3s: [];
    sourceIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
    groupedAreas: string[];
    contextNote: string;
}>]>;
export type SectionWithKG = z.infer<typeof SectionWithKG>;
export declare const DistributionWarningKind: z.ZodEnum<["distribution_duplicate_entity", "distribution_duplicate_fact", "distribution_duplicate_ideation", "distribution_duplicate_relationship", "distribution_duplicate_measurable", "distribution_intro_overload", "distribution_low_coverage", "distribution_high_coverage", "distribution_unknown_entity_id", "distribution_unknown_fact_id", "distribution_unknown_ideation_id", "distribution_unknown_relationship_id", "distribution_unknown_measurable_id", "distribution_empty_full_section"]>;
export type DistributionWarningKind = z.infer<typeof DistributionWarningKind>;
export declare const DistributionWarning: z.ZodObject<{
    kind: z.ZodEnum<["distribution_duplicate_entity", "distribution_duplicate_fact", "distribution_duplicate_ideation", "distribution_duplicate_relationship", "distribution_duplicate_measurable", "distribution_intro_overload", "distribution_low_coverage", "distribution_high_coverage", "distribution_unknown_entity_id", "distribution_unknown_fact_id", "distribution_unknown_ideation_id", "distribution_unknown_relationship_id", "distribution_unknown_measurable_id", "distribution_empty_full_section"]>;
    message: z.ZodString;
    context: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    message: string;
    kind: "distribution_duplicate_entity" | "distribution_duplicate_fact" | "distribution_duplicate_ideation" | "distribution_duplicate_relationship" | "distribution_duplicate_measurable" | "distribution_intro_overload" | "distribution_low_coverage" | "distribution_high_coverage" | "distribution_unknown_entity_id" | "distribution_unknown_fact_id" | "distribution_unknown_ideation_id" | "distribution_unknown_relationship_id" | "distribution_unknown_measurable_id" | "distribution_empty_full_section";
    context: Record<string, string>;
}, {
    message: string;
    kind: "distribution_duplicate_entity" | "distribution_duplicate_fact" | "distribution_duplicate_ideation" | "distribution_duplicate_relationship" | "distribution_duplicate_measurable" | "distribution_intro_overload" | "distribution_low_coverage" | "distribution_high_coverage" | "distribution_unknown_entity_id" | "distribution_unknown_fact_id" | "distribution_unknown_ideation_id" | "distribution_unknown_relationship_id" | "distribution_unknown_measurable_id" | "distribution_empty_full_section";
    context?: Record<string, string> | undefined;
}>;
export type DistributionWarning = z.infer<typeof DistributionWarning>;
export declare const CoverageBlock: z.ZodObject<{
    used: z.ZodNumber;
    total: z.ZodNumber;
    percent: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    used: number;
    total: number;
    percent: number;
}, {
    used: number;
    total: number;
    percent: number;
}>;
export type CoverageBlock = z.infer<typeof CoverageBlock>;
export declare const DistributionStats: z.ZodObject<{
    coverage: z.ZodObject<{
        entities: z.ZodObject<{
            used: z.ZodNumber;
            total: z.ZodNumber;
            percent: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            used: number;
            total: number;
            percent: number;
        }, {
            used: number;
            total: number;
            percent: number;
        }>;
        facts: z.ZodObject<{
            used: z.ZodNumber;
            total: z.ZodNumber;
            percent: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            used: number;
            total: number;
            percent: number;
        }, {
            used: number;
            total: number;
            percent: number;
        }>;
        relationships: z.ZodObject<{
            used: z.ZodNumber;
            total: z.ZodNumber;
            percent: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            used: number;
            total: number;
            percent: number;
        }, {
            used: number;
            total: number;
            percent: number;
        }>;
        ideations: z.ZodObject<{
            used: z.ZodNumber;
            total: z.ZodNumber;
            percent: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            used: number;
            total: number;
            percent: number;
        }, {
            used: number;
            total: number;
            percent: number;
        }>;
        measurables: z.ZodObject<{
            used: z.ZodNumber;
            total: z.ZodNumber;
            percent: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            used: number;
            total: number;
            percent: number;
        }, {
            used: number;
            total: number;
            percent: number;
        }>;
        overallPercent: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        facts: {
            used: number;
            total: number;
            percent: number;
        };
        ideations: {
            used: number;
            total: number;
            percent: number;
        };
        entities: {
            used: number;
            total: number;
            percent: number;
        };
        relationships: {
            used: number;
            total: number;
            percent: number;
        };
        measurables: {
            used: number;
            total: number;
            percent: number;
        };
        overallPercent: number;
    }, {
        facts: {
            used: number;
            total: number;
            percent: number;
        };
        ideations: {
            used: number;
            total: number;
            percent: number;
        };
        entities: {
            used: number;
            total: number;
            percent: number;
        };
        relationships: {
            used: number;
            total: number;
            percent: number;
        };
        measurables: {
            used: number;
            total: number;
            percent: number;
        };
        overallPercent: number;
    }>;
}, "strip", z.ZodTypeAny, {
    coverage: {
        facts: {
            used: number;
            total: number;
            percent: number;
        };
        ideations: {
            used: number;
            total: number;
            percent: number;
        };
        entities: {
            used: number;
            total: number;
            percent: number;
        };
        relationships: {
            used: number;
            total: number;
            percent: number;
        };
        measurables: {
            used: number;
            total: number;
            percent: number;
        };
        overallPercent: number;
    };
}, {
    coverage: {
        facts: {
            used: number;
            total: number;
            percent: number;
        };
        ideations: {
            used: number;
            total: number;
            percent: number;
        };
        entities: {
            used: number;
            total: number;
            percent: number;
        };
        relationships: {
            used: number;
            total: number;
            percent: number;
        };
        measurables: {
            used: number;
            total: number;
            percent: number;
        };
        overallPercent: number;
    };
}>;
export type DistributionStats = z.infer<typeof DistributionStats>;
export declare const UnusedKGItems: z.ZodObject<{
    entityIds: z.ZodArray<z.ZodString, "many">;
    factIds: z.ZodArray<z.ZodString, "many">;
    relationshipIds: z.ZodArray<z.ZodString, "many">;
    ideationIds: z.ZodArray<z.ZodString, "many">;
    measurableIds: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    entityIds: string[];
    factIds: string[];
    relationshipIds: string[];
    ideationIds: string[];
    measurableIds: string[];
}, {
    entityIds: string[];
    factIds: string[];
    relationshipIds: string[];
    ideationIds: string[];
    measurableIds: string[];
}>;
export type UnusedKGItems = z.infer<typeof UnusedKGItems>;
export declare const DistributionResult: z.ZodObject<{
    meta: z.ZodObject<{
        keyword: z.ZodString;
        h1Title: z.ZodString;
        language: z.ZodString;
        primaryIntent: z.ZodEnum<["Definicyjna", "Problemowa", "Instrukcyjna", "Decyzyjna", "Diagnostyczna", "Porównawcza"]>;
        generatedAt: z.ZodString;
        model: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        model: string;
        h1Title: string;
        keyword: string;
        language: string;
        generatedAt: string;
        primaryIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
    }, {
        model: string;
        h1Title: string;
        keyword: string;
        language: string;
        generatedAt: string;
        primaryIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
    }>;
    sections: z.ZodArray<z.ZodUnion<[z.ZodObject<{
        type: z.ZodLiteral<"intro">;
        order: z.ZodLiteral<0>;
        header: z.ZodNull;
        sectionVariant: z.ZodNull;
        h3s: z.ZodTuple<[], null>;
    } & {
        entities: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            originalSurface: z.ZodString;
            entity: z.ZodString;
            domainType: z.ZodEnum<["PERSON", "ORGANIZATION", "LOCATION", "PRODUCT", "CONCEPT", "EVENT"]>;
            evidence: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            id: string;
            originalSurface: string;
            entity: string;
            domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
            evidence: string;
        }, {
            id: string;
            originalSurface: string;
            entity: string;
            domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
            evidence: string;
        }>, "many">;
        facts: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            text: z.ZodString;
            category: z.ZodEnum<["definition", "causal", "general"]>;
            priority: z.ZodEnum<["high", "medium", "low"]>;
            confidence: z.ZodNumber;
            sourceUrls: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            id: string;
            text: string;
            category: "definition" | "causal" | "general";
            priority: "high" | "medium" | "low";
            confidence: number;
            sourceUrls: string[];
        }, {
            id: string;
            text: string;
            category: "definition" | "causal" | "general";
            priority: "high" | "medium" | "low";
            confidence: number;
            sourceUrls?: string[] | undefined;
        }>, "many">;
        relationships: z.ZodArray<z.ZodObject<{
            source: z.ZodString;
            target: z.ZodString;
            type: z.ZodEnum<["PART_OF", "LOCATED_IN", "CREATED_BY", "WORKS_FOR", "RELATED_TO", "HAS_FEATURE", "SOLVES", "COMPETES_WITH", "CONNECTED_TO", "USED_BY", "REQUIRES"]>;
            description: z.ZodString;
            evidence: z.ZodString;
        } & {
            sourceName: z.ZodString;
            targetName: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
            source: string;
            description: string;
            target: string;
            evidence: string;
            sourceName: string;
            targetName: string;
        }, {
            type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
            source: string;
            description: string;
            target: string;
            evidence: string;
            sourceName: string;
            targetName: string;
        }>, "many">;
        ideations: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            type: z.ZodEnum<["checklist", "mini_course", "info_box", "habit"]>;
            title: z.ZodString;
            description: z.ZodString;
            audience: z.ZodDefault<z.ZodString>;
            channels: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            keywords: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            priority: z.ZodEnum<["high", "medium", "low"]>;
        }, "strip", z.ZodTypeAny, {
            type: "checklist" | "mini_course" | "info_box" | "habit";
            title: string;
            id: string;
            priority: "high" | "medium" | "low";
            description: string;
            audience: string;
            channels: string[];
            keywords: string[];
        }, {
            type: "checklist" | "mini_course" | "info_box" | "habit";
            title: string;
            id: string;
            priority: "high" | "medium" | "low";
            description: string;
            audience?: string | undefined;
            channels?: string[] | undefined;
            keywords?: string[] | undefined;
        }>, "many">;
        measurables: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            definition: z.ZodString;
            value: z.ZodString;
            unit: z.ZodNullable<z.ZodString>;
            sourceUrls: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        } & {
            formatted: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            value: string;
            definition: string;
            id: string;
            sourceUrls: string[];
            unit: string | null;
            formatted: string;
        }, {
            value: string;
            definition: string;
            id: string;
            unit: string | null;
            formatted: string;
            sourceUrls?: string[] | undefined;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        type: "intro";
        facts: {
            id: string;
            text: string;
            category: "definition" | "causal" | "general";
            priority: "high" | "medium" | "low";
            confidence: number;
            sourceUrls: string[];
        }[];
        ideations: {
            type: "checklist" | "mini_course" | "info_box" | "habit";
            title: string;
            id: string;
            priority: "high" | "medium" | "low";
            description: string;
            audience: string;
            channels: string[];
            keywords: string[];
        }[];
        entities: {
            id: string;
            originalSurface: string;
            entity: string;
            domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
            evidence: string;
        }[];
        relationships: {
            type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
            source: string;
            description: string;
            target: string;
            evidence: string;
            sourceName: string;
            targetName: string;
        }[];
        measurables: {
            value: string;
            definition: string;
            id: string;
            sourceUrls: string[];
            unit: string | null;
            formatted: string;
        }[];
        header: null;
        order: 0;
        sectionVariant: null;
        h3s: [];
    }, {
        type: "intro";
        facts: {
            id: string;
            text: string;
            category: "definition" | "causal" | "general";
            priority: "high" | "medium" | "low";
            confidence: number;
            sourceUrls?: string[] | undefined;
        }[];
        ideations: {
            type: "checklist" | "mini_course" | "info_box" | "habit";
            title: string;
            id: string;
            priority: "high" | "medium" | "low";
            description: string;
            audience?: string | undefined;
            channels?: string[] | undefined;
            keywords?: string[] | undefined;
        }[];
        entities: {
            id: string;
            originalSurface: string;
            entity: string;
            domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
            evidence: string;
        }[];
        relationships: {
            type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
            source: string;
            description: string;
            target: string;
            evidence: string;
            sourceName: string;
            targetName: string;
        }[];
        measurables: {
            value: string;
            definition: string;
            id: string;
            unit: string | null;
            formatted: string;
            sourceUrls?: string[] | undefined;
        }[];
        header: null;
        order: 0;
        sectionVariant: null;
        h3s: [];
    }>, z.ZodObject<{
        type: z.ZodLiteral<"h2">;
        order: z.ZodNumber;
        sectionVariant: z.ZodLiteral<"full">;
        header: z.ZodString;
        sourceArea: z.ZodString;
        sourceIntent: z.ZodEnum<["Definicyjna", "Problemowa", "Instrukcyjna", "Decyzyjna", "Diagnostyczna", "Porównawcza"]>;
        h3s: z.ZodArray<z.ZodObject<{
            header: z.ZodString;
            format: z.ZodEnum<["question", "context"]>;
            sourcePaa: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            header: string;
            format: "question" | "context";
            sourcePaa: string;
        }, {
            header: string;
            format: "question" | "context";
            sourcePaa: string;
        }>, "many">;
    } & {
        entities: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            originalSurface: z.ZodString;
            entity: z.ZodString;
            domainType: z.ZodEnum<["PERSON", "ORGANIZATION", "LOCATION", "PRODUCT", "CONCEPT", "EVENT"]>;
            evidence: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            id: string;
            originalSurface: string;
            entity: string;
            domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
            evidence: string;
        }, {
            id: string;
            originalSurface: string;
            entity: string;
            domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
            evidence: string;
        }>, "many">;
        facts: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            text: z.ZodString;
            category: z.ZodEnum<["definition", "causal", "general"]>;
            priority: z.ZodEnum<["high", "medium", "low"]>;
            confidence: z.ZodNumber;
            sourceUrls: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            id: string;
            text: string;
            category: "definition" | "causal" | "general";
            priority: "high" | "medium" | "low";
            confidence: number;
            sourceUrls: string[];
        }, {
            id: string;
            text: string;
            category: "definition" | "causal" | "general";
            priority: "high" | "medium" | "low";
            confidence: number;
            sourceUrls?: string[] | undefined;
        }>, "many">;
        relationships: z.ZodArray<z.ZodObject<{
            source: z.ZodString;
            target: z.ZodString;
            type: z.ZodEnum<["PART_OF", "LOCATED_IN", "CREATED_BY", "WORKS_FOR", "RELATED_TO", "HAS_FEATURE", "SOLVES", "COMPETES_WITH", "CONNECTED_TO", "USED_BY", "REQUIRES"]>;
            description: z.ZodString;
            evidence: z.ZodString;
        } & {
            sourceName: z.ZodString;
            targetName: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
            source: string;
            description: string;
            target: string;
            evidence: string;
            sourceName: string;
            targetName: string;
        }, {
            type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
            source: string;
            description: string;
            target: string;
            evidence: string;
            sourceName: string;
            targetName: string;
        }>, "many">;
        ideations: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            type: z.ZodEnum<["checklist", "mini_course", "info_box", "habit"]>;
            title: z.ZodString;
            description: z.ZodString;
            audience: z.ZodDefault<z.ZodString>;
            channels: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            keywords: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            priority: z.ZodEnum<["high", "medium", "low"]>;
        }, "strip", z.ZodTypeAny, {
            type: "checklist" | "mini_course" | "info_box" | "habit";
            title: string;
            id: string;
            priority: "high" | "medium" | "low";
            description: string;
            audience: string;
            channels: string[];
            keywords: string[];
        }, {
            type: "checklist" | "mini_course" | "info_box" | "habit";
            title: string;
            id: string;
            priority: "high" | "medium" | "low";
            description: string;
            audience?: string | undefined;
            channels?: string[] | undefined;
            keywords?: string[] | undefined;
        }>, "many">;
        measurables: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            definition: z.ZodString;
            value: z.ZodString;
            unit: z.ZodNullable<z.ZodString>;
            sourceUrls: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        } & {
            formatted: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            value: string;
            definition: string;
            id: string;
            sourceUrls: string[];
            unit: string | null;
            formatted: string;
        }, {
            value: string;
            definition: string;
            id: string;
            unit: string | null;
            formatted: string;
            sourceUrls?: string[] | undefined;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        type: "h2";
        facts: {
            id: string;
            text: string;
            category: "definition" | "causal" | "general";
            priority: "high" | "medium" | "low";
            confidence: number;
            sourceUrls: string[];
        }[];
        ideations: {
            type: "checklist" | "mini_course" | "info_box" | "habit";
            title: string;
            id: string;
            priority: "high" | "medium" | "low";
            description: string;
            audience: string;
            channels: string[];
            keywords: string[];
        }[];
        entities: {
            id: string;
            originalSurface: string;
            entity: string;
            domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
            evidence: string;
        }[];
        relationships: {
            type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
            source: string;
            description: string;
            target: string;
            evidence: string;
            sourceName: string;
            targetName: string;
        }[];
        measurables: {
            value: string;
            definition: string;
            id: string;
            sourceUrls: string[];
            unit: string | null;
            formatted: string;
        }[];
        header: string;
        order: number;
        sectionVariant: "full";
        h3s: {
            header: string;
            format: "question" | "context";
            sourcePaa: string;
        }[];
        sourceArea: string;
        sourceIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
    }, {
        type: "h2";
        facts: {
            id: string;
            text: string;
            category: "definition" | "causal" | "general";
            priority: "high" | "medium" | "low";
            confidence: number;
            sourceUrls?: string[] | undefined;
        }[];
        ideations: {
            type: "checklist" | "mini_course" | "info_box" | "habit";
            title: string;
            id: string;
            priority: "high" | "medium" | "low";
            description: string;
            audience?: string | undefined;
            channels?: string[] | undefined;
            keywords?: string[] | undefined;
        }[];
        entities: {
            id: string;
            originalSurface: string;
            entity: string;
            domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
            evidence: string;
        }[];
        relationships: {
            type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
            source: string;
            description: string;
            target: string;
            evidence: string;
            sourceName: string;
            targetName: string;
        }[];
        measurables: {
            value: string;
            definition: string;
            id: string;
            unit: string | null;
            formatted: string;
            sourceUrls?: string[] | undefined;
        }[];
        header: string;
        order: number;
        sectionVariant: "full";
        h3s: {
            header: string;
            format: "question" | "context";
            sourcePaa: string;
        }[];
        sourceArea: string;
        sourceIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
    }>, z.ZodObject<{
        type: z.ZodLiteral<"h2">;
        order: z.ZodNumber;
        sectionVariant: z.ZodLiteral<"context">;
        header: z.ZodString;
        sourceIntent: z.ZodEnum<["Definicyjna", "Problemowa", "Instrukcyjna", "Decyzyjna", "Diagnostyczna", "Porównawcza"]>;
        groupedAreas: z.ZodArray<z.ZodString, "many">;
        contextNote: z.ZodString;
        h3s: z.ZodTuple<[], null>;
    } & {
        entities: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            originalSurface: z.ZodString;
            entity: z.ZodString;
            domainType: z.ZodEnum<["PERSON", "ORGANIZATION", "LOCATION", "PRODUCT", "CONCEPT", "EVENT"]>;
            evidence: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            id: string;
            originalSurface: string;
            entity: string;
            domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
            evidence: string;
        }, {
            id: string;
            originalSurface: string;
            entity: string;
            domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
            evidence: string;
        }>, "many">;
        facts: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            text: z.ZodString;
            category: z.ZodEnum<["definition", "causal", "general"]>;
            priority: z.ZodEnum<["high", "medium", "low"]>;
            confidence: z.ZodNumber;
            sourceUrls: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            id: string;
            text: string;
            category: "definition" | "causal" | "general";
            priority: "high" | "medium" | "low";
            confidence: number;
            sourceUrls: string[];
        }, {
            id: string;
            text: string;
            category: "definition" | "causal" | "general";
            priority: "high" | "medium" | "low";
            confidence: number;
            sourceUrls?: string[] | undefined;
        }>, "many">;
        relationships: z.ZodArray<z.ZodObject<{
            source: z.ZodString;
            target: z.ZodString;
            type: z.ZodEnum<["PART_OF", "LOCATED_IN", "CREATED_BY", "WORKS_FOR", "RELATED_TO", "HAS_FEATURE", "SOLVES", "COMPETES_WITH", "CONNECTED_TO", "USED_BY", "REQUIRES"]>;
            description: z.ZodString;
            evidence: z.ZodString;
        } & {
            sourceName: z.ZodString;
            targetName: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
            source: string;
            description: string;
            target: string;
            evidence: string;
            sourceName: string;
            targetName: string;
        }, {
            type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
            source: string;
            description: string;
            target: string;
            evidence: string;
            sourceName: string;
            targetName: string;
        }>, "many">;
        ideations: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            type: z.ZodEnum<["checklist", "mini_course", "info_box", "habit"]>;
            title: z.ZodString;
            description: z.ZodString;
            audience: z.ZodDefault<z.ZodString>;
            channels: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            keywords: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            priority: z.ZodEnum<["high", "medium", "low"]>;
        }, "strip", z.ZodTypeAny, {
            type: "checklist" | "mini_course" | "info_box" | "habit";
            title: string;
            id: string;
            priority: "high" | "medium" | "low";
            description: string;
            audience: string;
            channels: string[];
            keywords: string[];
        }, {
            type: "checklist" | "mini_course" | "info_box" | "habit";
            title: string;
            id: string;
            priority: "high" | "medium" | "low";
            description: string;
            audience?: string | undefined;
            channels?: string[] | undefined;
            keywords?: string[] | undefined;
        }>, "many">;
        measurables: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            definition: z.ZodString;
            value: z.ZodString;
            unit: z.ZodNullable<z.ZodString>;
            sourceUrls: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        } & {
            formatted: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            value: string;
            definition: string;
            id: string;
            sourceUrls: string[];
            unit: string | null;
            formatted: string;
        }, {
            value: string;
            definition: string;
            id: string;
            unit: string | null;
            formatted: string;
            sourceUrls?: string[] | undefined;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        type: "h2";
        facts: {
            id: string;
            text: string;
            category: "definition" | "causal" | "general";
            priority: "high" | "medium" | "low";
            confidence: number;
            sourceUrls: string[];
        }[];
        ideations: {
            type: "checklist" | "mini_course" | "info_box" | "habit";
            title: string;
            id: string;
            priority: "high" | "medium" | "low";
            description: string;
            audience: string;
            channels: string[];
            keywords: string[];
        }[];
        entities: {
            id: string;
            originalSurface: string;
            entity: string;
            domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
            evidence: string;
        }[];
        relationships: {
            type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
            source: string;
            description: string;
            target: string;
            evidence: string;
            sourceName: string;
            targetName: string;
        }[];
        measurables: {
            value: string;
            definition: string;
            id: string;
            sourceUrls: string[];
            unit: string | null;
            formatted: string;
        }[];
        header: string;
        order: number;
        sectionVariant: "context";
        h3s: [];
        sourceIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
        groupedAreas: string[];
        contextNote: string;
    }, {
        type: "h2";
        facts: {
            id: string;
            text: string;
            category: "definition" | "causal" | "general";
            priority: "high" | "medium" | "low";
            confidence: number;
            sourceUrls?: string[] | undefined;
        }[];
        ideations: {
            type: "checklist" | "mini_course" | "info_box" | "habit";
            title: string;
            id: string;
            priority: "high" | "medium" | "low";
            description: string;
            audience?: string | undefined;
            channels?: string[] | undefined;
            keywords?: string[] | undefined;
        }[];
        entities: {
            id: string;
            originalSurface: string;
            entity: string;
            domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
            evidence: string;
        }[];
        relationships: {
            type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
            source: string;
            description: string;
            target: string;
            evidence: string;
            sourceName: string;
            targetName: string;
        }[];
        measurables: {
            value: string;
            definition: string;
            id: string;
            unit: string | null;
            formatted: string;
            sourceUrls?: string[] | undefined;
        }[];
        header: string;
        order: number;
        sectionVariant: "context";
        h3s: [];
        sourceIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
        groupedAreas: string[];
        contextNote: string;
    }>]>, "many">;
    unused: z.ZodObject<{
        entityIds: z.ZodArray<z.ZodString, "many">;
        factIds: z.ZodArray<z.ZodString, "many">;
        relationshipIds: z.ZodArray<z.ZodString, "many">;
        ideationIds: z.ZodArray<z.ZodString, "many">;
        measurableIds: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        entityIds: string[];
        factIds: string[];
        relationshipIds: string[];
        ideationIds: string[];
        measurableIds: string[];
    }, {
        entityIds: string[];
        factIds: string[];
        relationshipIds: string[];
        ideationIds: string[];
        measurableIds: string[];
    }>;
    stats: z.ZodObject<{
        coverage: z.ZodObject<{
            entities: z.ZodObject<{
                used: z.ZodNumber;
                total: z.ZodNumber;
                percent: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                used: number;
                total: number;
                percent: number;
            }, {
                used: number;
                total: number;
                percent: number;
            }>;
            facts: z.ZodObject<{
                used: z.ZodNumber;
                total: z.ZodNumber;
                percent: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                used: number;
                total: number;
                percent: number;
            }, {
                used: number;
                total: number;
                percent: number;
            }>;
            relationships: z.ZodObject<{
                used: z.ZodNumber;
                total: z.ZodNumber;
                percent: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                used: number;
                total: number;
                percent: number;
            }, {
                used: number;
                total: number;
                percent: number;
            }>;
            ideations: z.ZodObject<{
                used: z.ZodNumber;
                total: z.ZodNumber;
                percent: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                used: number;
                total: number;
                percent: number;
            }, {
                used: number;
                total: number;
                percent: number;
            }>;
            measurables: z.ZodObject<{
                used: z.ZodNumber;
                total: z.ZodNumber;
                percent: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                used: number;
                total: number;
                percent: number;
            }, {
                used: number;
                total: number;
                percent: number;
            }>;
            overallPercent: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            facts: {
                used: number;
                total: number;
                percent: number;
            };
            ideations: {
                used: number;
                total: number;
                percent: number;
            };
            entities: {
                used: number;
                total: number;
                percent: number;
            };
            relationships: {
                used: number;
                total: number;
                percent: number;
            };
            measurables: {
                used: number;
                total: number;
                percent: number;
            };
            overallPercent: number;
        }, {
            facts: {
                used: number;
                total: number;
                percent: number;
            };
            ideations: {
                used: number;
                total: number;
                percent: number;
            };
            entities: {
                used: number;
                total: number;
                percent: number;
            };
            relationships: {
                used: number;
                total: number;
                percent: number;
            };
            measurables: {
                used: number;
                total: number;
                percent: number;
            };
            overallPercent: number;
        }>;
    }, "strip", z.ZodTypeAny, {
        coverage: {
            facts: {
                used: number;
                total: number;
                percent: number;
            };
            ideations: {
                used: number;
                total: number;
                percent: number;
            };
            entities: {
                used: number;
                total: number;
                percent: number;
            };
            relationships: {
                used: number;
                total: number;
                percent: number;
            };
            measurables: {
                used: number;
                total: number;
                percent: number;
            };
            overallPercent: number;
        };
    }, {
        coverage: {
            facts: {
                used: number;
                total: number;
                percent: number;
            };
            ideations: {
                used: number;
                total: number;
                percent: number;
            };
            entities: {
                used: number;
                total: number;
                percent: number;
            };
            relationships: {
                used: number;
                total: number;
                percent: number;
            };
            measurables: {
                used: number;
                total: number;
                percent: number;
            };
            overallPercent: number;
        };
    }>;
    warnings: z.ZodArray<z.ZodObject<{
        kind: z.ZodEnum<["distribution_duplicate_entity", "distribution_duplicate_fact", "distribution_duplicate_ideation", "distribution_duplicate_relationship", "distribution_duplicate_measurable", "distribution_intro_overload", "distribution_low_coverage", "distribution_high_coverage", "distribution_unknown_entity_id", "distribution_unknown_fact_id", "distribution_unknown_ideation_id", "distribution_unknown_relationship_id", "distribution_unknown_measurable_id", "distribution_empty_full_section"]>;
        message: z.ZodString;
        context: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        message: string;
        kind: "distribution_duplicate_entity" | "distribution_duplicate_fact" | "distribution_duplicate_ideation" | "distribution_duplicate_relationship" | "distribution_duplicate_measurable" | "distribution_intro_overload" | "distribution_low_coverage" | "distribution_high_coverage" | "distribution_unknown_entity_id" | "distribution_unknown_fact_id" | "distribution_unknown_ideation_id" | "distribution_unknown_relationship_id" | "distribution_unknown_measurable_id" | "distribution_empty_full_section";
        context: Record<string, string>;
    }, {
        message: string;
        kind: "distribution_duplicate_entity" | "distribution_duplicate_fact" | "distribution_duplicate_ideation" | "distribution_duplicate_relationship" | "distribution_duplicate_measurable" | "distribution_intro_overload" | "distribution_low_coverage" | "distribution_high_coverage" | "distribution_unknown_entity_id" | "distribution_unknown_fact_id" | "distribution_unknown_ideation_id" | "distribution_unknown_relationship_id" | "distribution_unknown_measurable_id" | "distribution_empty_full_section";
        context?: Record<string, string> | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    stats: {
        coverage: {
            facts: {
                used: number;
                total: number;
                percent: number;
            };
            ideations: {
                used: number;
                total: number;
                percent: number;
            };
            entities: {
                used: number;
                total: number;
                percent: number;
            };
            relationships: {
                used: number;
                total: number;
                percent: number;
            };
            measurables: {
                used: number;
                total: number;
                percent: number;
            };
            overallPercent: number;
        };
    };
    meta: {
        model: string;
        h1Title: string;
        keyword: string;
        language: string;
        generatedAt: string;
        primaryIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
    };
    warnings: {
        message: string;
        kind: "distribution_duplicate_entity" | "distribution_duplicate_fact" | "distribution_duplicate_ideation" | "distribution_duplicate_relationship" | "distribution_duplicate_measurable" | "distribution_intro_overload" | "distribution_low_coverage" | "distribution_high_coverage" | "distribution_unknown_entity_id" | "distribution_unknown_fact_id" | "distribution_unknown_ideation_id" | "distribution_unknown_relationship_id" | "distribution_unknown_measurable_id" | "distribution_empty_full_section";
        context: Record<string, string>;
    }[];
    sections: ({
        type: "intro";
        facts: {
            id: string;
            text: string;
            category: "definition" | "causal" | "general";
            priority: "high" | "medium" | "low";
            confidence: number;
            sourceUrls: string[];
        }[];
        ideations: {
            type: "checklist" | "mini_course" | "info_box" | "habit";
            title: string;
            id: string;
            priority: "high" | "medium" | "low";
            description: string;
            audience: string;
            channels: string[];
            keywords: string[];
        }[];
        entities: {
            id: string;
            originalSurface: string;
            entity: string;
            domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
            evidence: string;
        }[];
        relationships: {
            type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
            source: string;
            description: string;
            target: string;
            evidence: string;
            sourceName: string;
            targetName: string;
        }[];
        measurables: {
            value: string;
            definition: string;
            id: string;
            sourceUrls: string[];
            unit: string | null;
            formatted: string;
        }[];
        header: null;
        order: 0;
        sectionVariant: null;
        h3s: [];
    } | {
        type: "h2";
        facts: {
            id: string;
            text: string;
            category: "definition" | "causal" | "general";
            priority: "high" | "medium" | "low";
            confidence: number;
            sourceUrls: string[];
        }[];
        ideations: {
            type: "checklist" | "mini_course" | "info_box" | "habit";
            title: string;
            id: string;
            priority: "high" | "medium" | "low";
            description: string;
            audience: string;
            channels: string[];
            keywords: string[];
        }[];
        entities: {
            id: string;
            originalSurface: string;
            entity: string;
            domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
            evidence: string;
        }[];
        relationships: {
            type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
            source: string;
            description: string;
            target: string;
            evidence: string;
            sourceName: string;
            targetName: string;
        }[];
        measurables: {
            value: string;
            definition: string;
            id: string;
            sourceUrls: string[];
            unit: string | null;
            formatted: string;
        }[];
        header: string;
        order: number;
        sectionVariant: "full";
        h3s: {
            header: string;
            format: "question" | "context";
            sourcePaa: string;
        }[];
        sourceArea: string;
        sourceIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
    } | {
        type: "h2";
        facts: {
            id: string;
            text: string;
            category: "definition" | "causal" | "general";
            priority: "high" | "medium" | "low";
            confidence: number;
            sourceUrls: string[];
        }[];
        ideations: {
            type: "checklist" | "mini_course" | "info_box" | "habit";
            title: string;
            id: string;
            priority: "high" | "medium" | "low";
            description: string;
            audience: string;
            channels: string[];
            keywords: string[];
        }[];
        entities: {
            id: string;
            originalSurface: string;
            entity: string;
            domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
            evidence: string;
        }[];
        relationships: {
            type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
            source: string;
            description: string;
            target: string;
            evidence: string;
            sourceName: string;
            targetName: string;
        }[];
        measurables: {
            value: string;
            definition: string;
            id: string;
            sourceUrls: string[];
            unit: string | null;
            formatted: string;
        }[];
        header: string;
        order: number;
        sectionVariant: "context";
        h3s: [];
        sourceIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
        groupedAreas: string[];
        contextNote: string;
    })[];
    unused: {
        entityIds: string[];
        factIds: string[];
        relationshipIds: string[];
        ideationIds: string[];
        measurableIds: string[];
    };
}, {
    stats: {
        coverage: {
            facts: {
                used: number;
                total: number;
                percent: number;
            };
            ideations: {
                used: number;
                total: number;
                percent: number;
            };
            entities: {
                used: number;
                total: number;
                percent: number;
            };
            relationships: {
                used: number;
                total: number;
                percent: number;
            };
            measurables: {
                used: number;
                total: number;
                percent: number;
            };
            overallPercent: number;
        };
    };
    meta: {
        model: string;
        h1Title: string;
        keyword: string;
        language: string;
        generatedAt: string;
        primaryIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
    };
    warnings: {
        message: string;
        kind: "distribution_duplicate_entity" | "distribution_duplicate_fact" | "distribution_duplicate_ideation" | "distribution_duplicate_relationship" | "distribution_duplicate_measurable" | "distribution_intro_overload" | "distribution_low_coverage" | "distribution_high_coverage" | "distribution_unknown_entity_id" | "distribution_unknown_fact_id" | "distribution_unknown_ideation_id" | "distribution_unknown_relationship_id" | "distribution_unknown_measurable_id" | "distribution_empty_full_section";
        context?: Record<string, string> | undefined;
    }[];
    sections: ({
        type: "intro";
        facts: {
            id: string;
            text: string;
            category: "definition" | "causal" | "general";
            priority: "high" | "medium" | "low";
            confidence: number;
            sourceUrls?: string[] | undefined;
        }[];
        ideations: {
            type: "checklist" | "mini_course" | "info_box" | "habit";
            title: string;
            id: string;
            priority: "high" | "medium" | "low";
            description: string;
            audience?: string | undefined;
            channels?: string[] | undefined;
            keywords?: string[] | undefined;
        }[];
        entities: {
            id: string;
            originalSurface: string;
            entity: string;
            domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
            evidence: string;
        }[];
        relationships: {
            type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
            source: string;
            description: string;
            target: string;
            evidence: string;
            sourceName: string;
            targetName: string;
        }[];
        measurables: {
            value: string;
            definition: string;
            id: string;
            unit: string | null;
            formatted: string;
            sourceUrls?: string[] | undefined;
        }[];
        header: null;
        order: 0;
        sectionVariant: null;
        h3s: [];
    } | {
        type: "h2";
        facts: {
            id: string;
            text: string;
            category: "definition" | "causal" | "general";
            priority: "high" | "medium" | "low";
            confidence: number;
            sourceUrls?: string[] | undefined;
        }[];
        ideations: {
            type: "checklist" | "mini_course" | "info_box" | "habit";
            title: string;
            id: string;
            priority: "high" | "medium" | "low";
            description: string;
            audience?: string | undefined;
            channels?: string[] | undefined;
            keywords?: string[] | undefined;
        }[];
        entities: {
            id: string;
            originalSurface: string;
            entity: string;
            domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
            evidence: string;
        }[];
        relationships: {
            type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
            source: string;
            description: string;
            target: string;
            evidence: string;
            sourceName: string;
            targetName: string;
        }[];
        measurables: {
            value: string;
            definition: string;
            id: string;
            unit: string | null;
            formatted: string;
            sourceUrls?: string[] | undefined;
        }[];
        header: string;
        order: number;
        sectionVariant: "full";
        h3s: {
            header: string;
            format: "question" | "context";
            sourcePaa: string;
        }[];
        sourceArea: string;
        sourceIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
    } | {
        type: "h2";
        facts: {
            id: string;
            text: string;
            category: "definition" | "causal" | "general";
            priority: "high" | "medium" | "low";
            confidence: number;
            sourceUrls?: string[] | undefined;
        }[];
        ideations: {
            type: "checklist" | "mini_course" | "info_box" | "habit";
            title: string;
            id: string;
            priority: "high" | "medium" | "low";
            description: string;
            audience?: string | undefined;
            channels?: string[] | undefined;
            keywords?: string[] | undefined;
        }[];
        entities: {
            id: string;
            originalSurface: string;
            entity: string;
            domainType: "PERSON" | "ORGANIZATION" | "LOCATION" | "PRODUCT" | "CONCEPT" | "EVENT";
            evidence: string;
        }[];
        relationships: {
            type: "PART_OF" | "LOCATED_IN" | "CREATED_BY" | "WORKS_FOR" | "RELATED_TO" | "HAS_FEATURE" | "SOLVES" | "COMPETES_WITH" | "CONNECTED_TO" | "USED_BY" | "REQUIRES";
            source: string;
            description: string;
            target: string;
            evidence: string;
            sourceName: string;
            targetName: string;
        }[];
        measurables: {
            value: string;
            definition: string;
            id: string;
            unit: string | null;
            formatted: string;
            sourceUrls?: string[] | undefined;
        }[];
        header: string;
        order: number;
        sectionVariant: "context";
        h3s: [];
        sourceIntent: "Definicyjna" | "Problemowa" | "Instrukcyjna" | "Decyzyjna" | "Diagnostyczna" | "Porównawcza";
        groupedAreas: string[];
        contextNote: string;
    })[];
    unused: {
        entityIds: string[];
        factIds: string[];
        relationshipIds: string[];
        ideationIds: string[];
        measurableIds: string[];
    };
}>;
export type DistributionResult = z.infer<typeof DistributionResult>;
