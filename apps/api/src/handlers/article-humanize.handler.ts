// apps/api/src/handlers/article-humanize.handler.ts
import { Inject, Injectable, Logger } from "@nestjs/common";
import { createHash } from "node:crypto";
import type {
  StepContext,
  StepHandler,
  StepResult,
} from "../orchestrator/step-handler";
import {
  ArticleHumanizeResult,
  ArticleIntermediateResult,
  type RunInput,
} from "@sensai/shared";
import { ToolCacheService } from "../tools/tool-cache.service";
import { ArticleHumanizeClient } from "../tools/article-humanize/article-humanize.client";
import {
  articleContextHash,
  pickArticleContext,
} from "../prompts/article-context";
import type { Env } from "../config/env";

type HandlerEnv = Pick<Env, "ARTICLE_HUMANIZE_MODEL" | "ARTICLE_HUMANIZE_TTL_DAYS">;

const PROMPT_VERSION = "v2";

@Injectable()
export class ArticleHumanizeHandler implements StepHandler {
  readonly type = "tool.article.humanize";
  private readonly logger = new Logger(ArticleHumanizeHandler.name);

  constructor(
    private readonly client: ArticleHumanizeClient,
    private readonly cache: ToolCacheService,
    @Inject("ARTICLE_HUMANIZE_HANDLER_ENV") private readonly env: HandlerEnv,
  ) {}

  async execute(ctx: StepContext): Promise<StepResult> {
    const prev = ctx.previousOutputs.intermediate;
    if (prev === undefined || prev === null) {
      throw new Error("article.humanize requires previousOutputs.intermediate");
    }
    const intermediate = ArticleIntermediateResult.parse(prev);
    const inputHash = sha256(intermediate.htmlContent);
    const articleContext = pickArticleContext(ctx.run.input as RunInput);

    const result = await this.cache.getOrSet<ArticleHumanizeResult>({
      tool: "article",
      method: "humanize",
      params: {
        inputHash,
        articleContextHash: articleContextHash(articleContext),
        model: this.env.ARTICLE_HUMANIZE_MODEL,
        promptVersion: PROMPT_VERSION,
      },
      ttlSeconds: this.env.ARTICLE_HUMANIZE_TTL_DAYS * 24 * 3600,
      runId: ctx.run.id,
      stepId: ctx.step.id,
      forceRefresh: ctx.forceRefresh,
      fetcher: async () => {
        const out = await this.client.humanize({
          ctx: { runId: ctx.run.id, stepId: ctx.step.id, attempt: ctx.attempt },
          keyword: intermediate.meta.keyword,
          language: intermediate.meta.language,
          htmlContent: intermediate.htmlContent,
          articleContext,
        });

        const result: ArticleHumanizeResult = {
          meta: {
            keyword: intermediate.meta.keyword,
            language: intermediate.meta.language,
            model: this.env.ARTICLE_HUMANIZE_MODEL,
            promptVersion: PROMPT_VERSION,
            generatedAt: new Date().toISOString(),
          },
          htmlContent: out.htmlContent,
          stats: {
            inputLength: out.stats.inputLength,
            outputLength: out.stats.outputLength,
            ratio: out.stats.ratio,
            sourcesBefore: out.stats.sourcesBefore,
            sourcesAfter: out.stats.sourcesAfter,
            emDashesReplaced: out.stats.emDashesReplaced,
            retryUsed: out.stats.retryUsed,
            retryAccepted: out.stats.retryAccepted,
            readability: out.stats.readability,
            sentence: out.stats.sentence,
            totalCostUsd: out.stats.totalCostUsd,
            totalLatencyMs: out.stats.totalLatencyMs,
          },
          protection: out.protection,
          warnings: out.warnings,
        };

        ArticleHumanizeResult.parse(result); // self-check before caching

        return {
          result,
          costUsd: out.stats.totalCostUsd,
          latencyMs: out.stats.totalLatencyMs,
        };
      },
    });

    if (result.warnings.length > 0) {
      this.logger.warn(
        { runId: ctx.run.id, stepId: ctx.step.id, warnings: result.warnings },
        `article.humanize: ${result.warnings.length} warnings`,
      );
    }

    this.logger.log(
      {
        runId: ctx.run.id,
        stepId: ctx.step.id,
        ratio: result.stats.ratio,
        retryUsed: result.stats.retryUsed,
        retryAccepted: result.stats.retryAccepted,
        cv: result.stats.sentence.cvOutput,
        asl: result.stats.readability.avgSentenceLength,
        boldShare: result.stats.readability.boldShare,
        costUsd: result.stats.totalCostUsd,
      },
      "article.humanize done",
    );

    const previewSystem = this.client.previewSystem({
      language: intermediate.meta.language,
      articleContext,
    });

    return {
      output: result,
      input: {
        kind: "llm.prompt",
        promptVersion: PROMPT_VERSION,
        system: previewSystem,
        userNote: `User input = HTML z poprzedniego kroku (${intermediate.htmlContent.length} zn., po tokenizacji [[SRC_xxx]] / spanów).`,
      },
    };
  }
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
