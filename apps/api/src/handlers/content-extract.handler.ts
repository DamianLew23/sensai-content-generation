import { Inject, Injectable, Logger } from "@nestjs/common";
import type { StepContext, StepHandler, StepResult } from "../orchestrator/step-handler";
import { ContentExtractorClient } from "../tools/content-extractor/content-extractor.client";
import { ToolCacheService } from "../tools/tool-cache.service";
import {
  CleanedScrapeResult,
  ResearchBriefing,
  type ExtractionResult,
  type RunInput,
} from "@sensai/shared";
import type { Env } from "../config/env";
import { contentExtractPrompt } from "../prompts/content-extract.prompt";

const TTL_DAYS = 7;

type HandlerEnv = Pick<
  Env,
  | "CONTENT_EXTRACT_MODEL"
  | "CONTENT_EXTRACT_LANGUAGE"
  | "CONTENT_EXTRACT_MIN_FACTS"
  | "CONTENT_EXTRACT_MIN_DATA"
  | "CONTENT_EXTRACT_MIN_IDEATIONS"
>;

@Injectable()
export class ContentExtractHandler implements StepHandler {
  readonly type = "tool.content.extract";
  private readonly logger = new Logger(ContentExtractHandler.name);

  constructor(
    private readonly client: ContentExtractorClient,
    private readonly cache: ToolCacheService,
    @Inject("EXTRACT_ENV") private readonly env: HandlerEnv,
  ) {}

  async execute(ctx: StepContext): Promise<StepResult> {
    const prevClean = ctx.previousOutputs.clean;
    if (prevClean === undefined || prevClean === null) {
      throw new Error("content.extract requires previousOutputs.clean");
    }
    const clean = CleanedScrapeResult.parse(prevClean);

    let deepResearch: ReturnType<typeof ResearchBriefing.parse> | undefined;
    const prevDeep = ctx.previousOutputs.deepResearch;
    if (prevDeep !== undefined && prevDeep !== null) {
      deepResearch = ResearchBriefing.parse(prevDeep);
    }

    if (clean.pages.length === 0 && !deepResearch) {
      throw new Error("content.extract: no input content (clean.pages empty and no deepResearch)");
    }

    const keyword = this.composeKeyword(ctx.run.input as RunInput);
    const language = this.env.CONTENT_EXTRACT_LANGUAGE;
    const model = this.env.CONTENT_EXTRACT_MODEL;

    const result = await this.cache.getOrSet<ExtractionResult>({
      tool: "content",
      method: "extract",
      params: {
        pages: clean.pages.map((p) => ({ url: p.url, md: p.markdown })),
        deepResearchPresent: deepResearch !== undefined,
        keyword,
        language,
        model,
      },
      ttlSeconds: TTL_DAYS * 24 * 3600,
      runId: ctx.run.id,
      stepId: ctx.step.id,
      forceRefresh: ctx.forceRefresh,
      fetcher: async () => {
        const t0 = Date.now();
        const systemPrompt = contentExtractPrompt.system;
        const userPrompt = contentExtractPrompt.user({
          keyword,
          language,
          cleanedPages: clean.pages.map((p) => ({ url: p.url, markdown: p.markdown })),
          deepResearch,
          minFacts: this.env.CONTENT_EXTRACT_MIN_FACTS,
          minData: this.env.CONTENT_EXTRACT_MIN_DATA,
          minIdeations: this.env.CONTENT_EXTRACT_MIN_IDEATIONS,
        });

        const call = await this.client.extract({
          ctx: { runId: ctx.run.id, stepId: ctx.step.id, attempt: ctx.attempt },
          system: systemPrompt,
          prompt: userPrompt,
        });
        const latencyMs = Date.now() - t0;

        const enriched = {
          ...call.result,
          metadata: {
            ...call.result.metadata,
            keyword,
            language,
            sourceUrlCount: clean.pages.length,
            createdAt: new Date().toISOString(),
          },
        } as ExtractionResult;

        this.logger.log(
          {
            facts: enriched.facts.length,
            data: enriched.data.length,
            ideations: enriched.ideations.length,
            costUsd: call.costUsd,
            latencyMs,
          },
          "content-extract done",
        );

        return { result: enriched, costUsd: call.costUsd, latencyMs };
      },
    });

    return { output: result };
  }

  private composeKeyword(input: RunInput): string {
    let kw = input.topic;
    if (input.mainKeyword) kw += ` (${input.mainKeyword})`;
    if (input.intent) kw += ` — ${input.intent}`;
    return kw;
  }
}
