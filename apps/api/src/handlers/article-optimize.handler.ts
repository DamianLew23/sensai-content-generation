import { Inject, Injectable, Logger } from "@nestjs/common";
import { createHash } from "node:crypto";
import type {
  StepContext,
  StepHandler,
  StepResult,
} from "../orchestrator/step-handler";
import { ArticleOptimizeResult, DataEnrichmentResult } from "@sensai/shared";
import { ToolCacheService } from "../tools/tool-cache.service";
import { ArticleOptimizeClient } from "../tools/article-optimize/article-optimize.client";
import type { Env } from "../config/env";

type HandlerEnv = Pick<Env, "ARTICLE_OPTIMIZE_MODEL" | "ARTICLE_OPTIMIZE_TTL_DAYS">;

const PROMPT_VERSION = "v1";

@Injectable()
export class ArticleOptimizeHandler implements StepHandler {
  readonly type = "tool.article.optimize";
  private readonly logger = new Logger(ArticleOptimizeHandler.name);

  constructor(
    private readonly client: ArticleOptimizeClient,
    private readonly cache: ToolCacheService,
    @Inject("ARTICLE_OPTIMIZE_HANDLER_ENV") private readonly env: HandlerEnv,
  ) {}

  async execute(ctx: StepContext): Promise<StepResult> {
    const prev = ctx.previousOutputs.enrich;
    if (prev === undefined || prev === null) {
      throw new Error("article.optimize requires previousOutputs.enrich");
    }
    const enrichment = DataEnrichmentResult.parse(prev);
    const inputHash = sha256(enrichment.htmlContent);

    const result = await this.cache.getOrSet<ArticleOptimizeResult>({
      tool: "article",
      method: "optimize",
      params: {
        inputHash,
        model: this.env.ARTICLE_OPTIMIZE_MODEL,
        promptVersion: PROMPT_VERSION,
      },
      ttlSeconds: this.env.ARTICLE_OPTIMIZE_TTL_DAYS * 24 * 3600,
      runId: ctx.run.id,
      stepId: ctx.step.id,
      forceRefresh: ctx.forceRefresh,
      fetcher: async () => {
        const out = await this.client.optimize({
          ctx: { runId: ctx.run.id, stepId: ctx.step.id, attempt: ctx.attempt },
          keyword: enrichment.meta.keyword,
          language: enrichment.meta.language,
          htmlContent: enrichment.htmlContent,
        });

        const result: ArticleOptimizeResult = {
          meta: {
            keyword: enrichment.meta.keyword,
            language: enrichment.meta.language,
            model: this.env.ARTICLE_OPTIMIZE_MODEL,
            promptVersion: PROMPT_VERSION,
            generatedAt: new Date().toISOString(),
          },
          htmlContent: out.htmlContent,
          stats: {
            inputLength: out.stats.inputLength,
            outputLength: out.stats.outputLength,
            sourcesBefore: out.stats.sourcesBefore,
            sourcesAfter: out.stats.sourcesAfter,
            anchorsRemoved: out.stats.anchorsRemoved,
            totalCostUsd: out.cost.costUsd,
            totalLatencyMs: out.cost.latencyMs,
          },
          protection: out.protection,
          warnings: out.warnings,
        };

        ArticleOptimizeResult.parse(result); // self-check before caching

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
        `article.optimize: ${result.warnings.length} warnings`,
      );
    }

    this.logger.log(
      {
        runId: ctx.run.id,
        stepId: ctx.step.id,
        sourcesBefore: result.stats.sourcesBefore,
        sourcesAfter: result.stats.sourcesAfter,
        anchorsRemoved: result.stats.anchorsRemoved,
        costUsd: result.stats.totalCostUsd,
      },
      "article.optimize done",
    );

    return { output: result };
  }
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
