import { Inject, Injectable, Logger } from "@nestjs/common";
import { createHash } from "node:crypto";
import type {
  StepContext,
  StepHandler,
  StepResult,
} from "../orchestrator/step-handler";
import {
  ArticleIntermediateResult,
  ArticleOptimizeResult,
} from "@sensai/shared";
import { ToolCacheService } from "../tools/tool-cache.service";
import { ArticleIntermediateClient } from "../tools/article-intermediate/article-intermediate.client";
import type { Env } from "../config/env";

type HandlerEnv = Pick<
  Env,
  "ARTICLE_INTERMEDIATE_MODEL" | "ARTICLE_INTERMEDIATE_TTL_DAYS"
>;

const PROMPT_VERSION = "v1";

@Injectable()
export class ArticleIntermediateHandler implements StepHandler {
  readonly type = "tool.article.intermediate";
  private readonly logger = new Logger(ArticleIntermediateHandler.name);

  constructor(
    private readonly client: ArticleIntermediateClient,
    private readonly cache: ToolCacheService,
    @Inject("ARTICLE_INTERMEDIATE_HANDLER_ENV") private readonly env: HandlerEnv,
  ) {}

  async execute(ctx: StepContext): Promise<StepResult> {
    const prev = ctx.previousOutputs.optimize;
    if (prev === undefined || prev === null) {
      throw new Error("article.intermediate requires previousOutputs.optimize");
    }
    const optimize = ArticleOptimizeResult.parse(prev);
    const inputHash = sha256(optimize.htmlContent);

    const result = await this.cache.getOrSet<ArticleIntermediateResult>({
      tool: "article",
      method: "intermediate",
      params: {
        inputHash,
        model: this.env.ARTICLE_INTERMEDIATE_MODEL,
        promptVersion: PROMPT_VERSION,
      },
      ttlSeconds: this.env.ARTICLE_INTERMEDIATE_TTL_DAYS * 24 * 3600,
      runId: ctx.run.id,
      stepId: ctx.step.id,
      forceRefresh: ctx.forceRefresh,
      fetcher: async () => {
        const out = await this.client.intermediate({
          ctx: { runId: ctx.run.id, stepId: ctx.step.id, attempt: ctx.attempt },
          keyword: optimize.meta.keyword,
          language: optimize.meta.language,
          htmlContent: optimize.htmlContent,
        });

        const result: ArticleIntermediateResult = {
          meta: {
            keyword: optimize.meta.keyword,
            language: optimize.meta.language,
            model: this.env.ARTICLE_INTERMEDIATE_MODEL,
            promptVersion: PROMPT_VERSION,
            generatedAt: new Date().toISOString(),
          },
          htmlContent: out.htmlContent,
          stats: {
            inputLength: out.stats.inputLength,
            outputLength: out.stats.outputLength,
            growth: out.stats.growth,
            sourcesBefore: out.stats.sourcesBefore,
            sourcesAfter: out.stats.sourcesAfter,
            formattingBefore: out.stats.formattingBefore,
            formattingAfter: out.stats.formattingAfter,
            totalCostUsd: out.cost.costUsd,
            totalLatencyMs: out.cost.latencyMs,
          },
          protection: out.protection,
          warnings: out.warnings,
        };

        ArticleIntermediateResult.parse(result); // self-check before caching

        return {
          result,
          costUsd: out.cost.costUsd,
          latencyMs: out.cost.latencyMs,
        };
      },
    });

    if (result.warnings.length > 0) {
      this.logger.warn(
        { runId: ctx.run.id, stepId: ctx.step.id, warnings: result.warnings },
        `article.intermediate: ${result.warnings.length} warnings`,
      );
    }

    this.logger.log(
      {
        runId: ctx.run.id,
        stepId: ctx.step.id,
        growth: result.stats.growth,
        formattingAfter: result.stats.formattingAfter,
        costUsd: result.stats.totalCostUsd,
      },
      "article.intermediate done",
    );

    return { output: result };
  }
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
