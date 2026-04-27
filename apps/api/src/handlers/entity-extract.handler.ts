import { Inject, Injectable, Logger } from "@nestjs/common";
import type { StepContext, StepHandler, StepResult } from "../orchestrator/step-handler";
import { EntityExtractorClient } from "../tools/entity-extractor/entity-extractor.client";
import { ToolCacheService } from "../tools/tool-cache.service";
import {
  CleanedScrapeResult,
  ResearchBriefing,
  type EntityExtractionResult,
  type RunInput,
} from "@sensai/shared";
import type { Env } from "../config/env";
import { entityExtractPrompt } from "../prompts/entity-extract.prompt";

const TTL_DAYS = 7;

type HandlerEnv = Pick<
  Env,
  | "ENTITY_EXTRACT_MODEL"
  | "ENTITY_EXTRACT_LANGUAGE"
  | "ENTITY_EXTRACT_MIN_ENTITIES"
  | "ENTITY_EXTRACT_MIN_RELATIONS"
>;

@Injectable()
export class EntityExtractHandler implements StepHandler {
  readonly type = "tool.entity.extract";
  private readonly logger = new Logger(EntityExtractHandler.name);

  constructor(
    private readonly client: EntityExtractorClient,
    private readonly cache: ToolCacheService,
    @Inject("ENTITY_EXTRACT_ENV") private readonly env: HandlerEnv,
  ) {}

  async execute(ctx: StepContext): Promise<StepResult> {
    const prevClean = ctx.previousOutputs.clean;
    if (prevClean === undefined || prevClean === null) {
      throw new Error("entity.extract requires previousOutputs.clean");
    }
    const clean = CleanedScrapeResult.parse(prevClean);

    let deepResearch: ReturnType<typeof ResearchBriefing.parse> | undefined;
    const prevDeep = ctx.previousOutputs.deepResearch;
    if (prevDeep !== undefined && prevDeep !== null) {
      deepResearch = ResearchBriefing.parse(prevDeep);
    }

    if (clean.pages.length === 0 && !deepResearch) {
      throw new Error(
        "entity.extract: no input content (clean.pages empty and no deepResearch)",
      );
    }

    const keyword = this.composeKeyword(ctx.run.input as RunInput);
    const language = this.env.ENTITY_EXTRACT_LANGUAGE;
    const model = this.env.ENTITY_EXTRACT_MODEL;

    const result = await this.cache.getOrSet<EntityExtractionResult>({
      tool: "entity",
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
        const systemPrompt = entityExtractPrompt.system;
        const userPrompt = entityExtractPrompt.user({
          keyword,
          language,
          cleanedPages: clean.pages.map((p) => ({ url: p.url, markdown: p.markdown })),
          deepResearch,
          minEntities: this.env.ENTITY_EXTRACT_MIN_ENTITIES,
          minRelations: this.env.ENTITY_EXTRACT_MIN_RELATIONS,
        });

        const call = await this.client.extract({
          ctx: { runId: ctx.run.id, stepId: ctx.step.id, attempt: ctx.attempt },
          system: systemPrompt,
          prompt: userPrompt,
        });
        const latencyMs = Date.now() - t0;

        const enriched: EntityExtractionResult = {
          ...call.result,
          metadata: {
            ...call.result.metadata,
            keyword,
            language,
            sourceUrlCount: clean.pages.length,
            createdAt: new Date().toISOString(),
          },
        };

        this.logger.log(
          {
            entities: enriched.entities.length,
            relationships: enriched.relationships.length,
            relationToMain: enriched.relationToMain.length,
            costUsd: call.costUsd,
            latencyMs,
          },
          "entity-extract done",
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
