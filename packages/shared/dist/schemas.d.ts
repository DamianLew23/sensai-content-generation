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
}, "strip", z.ZodTypeAny, {
    type: string;
    key: string;
    auto: boolean;
    model?: string | undefined;
}, {
    type: string;
    key: string;
    auto: boolean;
    model?: string | undefined;
}>;
export type StepDef = z.infer<typeof StepDef>;
export declare const TemplateStepsDef: z.ZodObject<{
    steps: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        type: z.ZodString;
        auto: z.ZodBoolean;
        model: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: string;
        key: string;
        auto: boolean;
        model?: string | undefined;
    }, {
        type: string;
        key: string;
        auto: boolean;
        model?: string | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    steps: {
        type: string;
        key: string;
        auto: boolean;
        model?: string | undefined;
    }[];
}, {
    steps: {
        type: string;
        key: string;
        auto: boolean;
        model?: string | undefined;
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
}, "strip", z.ZodTypeAny, {
    topic: string;
    mainKeyword?: string | undefined;
    intent?: string | undefined;
    contentType?: string | undefined;
}, {
    topic: string;
    mainKeyword?: string | undefined;
    intent?: string | undefined;
    contentType?: string | undefined;
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
    }, "strip", z.ZodTypeAny, {
        topic: string;
        mainKeyword?: string | undefined;
        intent?: string | undefined;
        contentType?: string | undefined;
    }, {
        topic: string;
        mainKeyword?: string | undefined;
        intent?: string | undefined;
        contentType?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    projectId: string;
    templateId: string;
    input: {
        topic: string;
        mainKeyword?: string | undefined;
        intent?: string | undefined;
        contentType?: string | undefined;
    };
}, {
    projectId: string;
    templateId: string;
    input: {
        topic: string;
        mainKeyword?: string | undefined;
        intent?: string | undefined;
        contentType?: string | undefined;
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
