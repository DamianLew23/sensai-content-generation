import { Inject, Injectable, Logger } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { StepContext, StepHandler, StepResult } from "../orchestrator/step-handler";
import {
  DistributionResult,
  DraftGenerationResult,
  type DraftBlockStats,
  type RunInput,
} from "@sensai/shared";
import { ToolCacheService } from "../tools/tool-cache.service";
import { DraftGeneratorClient } from "../tools/draft-generator/draft-generator.client";
import { assembleDraft } from "../tools/draft-generator/draft-generator.assemble";
import {
  articleContextHash,
  pickArticleContext,
} from "../prompts/article-context";
import type { Env } from "../config/env";

type HandlerEnv = Pick<
  Env,
  | "DRAFT_GENERATE_MODEL"
  | "DRAFT_GENERATE_USE_REASONING"
  | "DRAFT_GENERATE_REASONING_EFFORT"
  | "DRAFT_GENERATE_VERBOSITY"
  | "DRAFT_GENERATE_TTL_DAYS"
>;

const PROMPT_VERSION = "v2";

@Injectable()
export class DraftGenerateHandler implements StepHandler {
  readonly type = "tool.draft.generate";
  private readonly logger = new Logger(DraftGenerateHandler.name);

  constructor(
    private readonly client: DraftGeneratorClient,
    private readonly cache: ToolCacheService,
    @Inject("DRAFT_GENERATE_HANDLER_ENV") private readonly env: HandlerEnv,
  ) {}

  async execute(ctx: StepContext): Promise<StepResult> {
    const prev = ctx.previousOutputs.distribute;
    if (prev === undefined || prev === null) {
      throw new Error("draft.generate requires previousOutputs.distribute");
    }
    const distribution = DistributionResult.parse(prev);
    const distHash = sha256(JSON.stringify(distribution));
    const articleContext = pickArticleContext(ctx.run.input as RunInput);

    const result = await this.cache.getOrSet<DraftGenerationResult>({
      tool: "draft",
      method: "generate",
      params: {
        distHash,
        articleContextHash: articleContextHash(articleContext),
        model: this.env.DRAFT_GENERATE_MODEL,
        useReasoning: this.env.DRAFT_GENERATE_USE_REASONING,
        reasoningEffort: this.env.DRAFT_GENERATE_REASONING_EFFORT,
        verbosity: this.env.DRAFT_GENERATE_VERBOSITY,
        promptVersion: PROMPT_VERSION,
      },
      ttlSeconds: this.env.DRAFT_GENERATE_TTL_DAYS * 24 * 3600,
      runId: ctx.run.id,
      stepId: ctx.step.id,
      forceRefresh: ctx.forceRefresh,
      fetcher: async () => {
        const gen = await this.client.generate({
          ctx: { runId: ctx.run.id, stepId: ctx.step.id, attempt: ctx.attempt },
          distribution,
          articleContext,
        });

        const html = assembleDraft({
          h1Title: distribution.meta.h1Title,
          htmlChunks: gen.htmlChunks,
        });

        const totalChars = html.length;
        const totalLatencyMs = gen.blocks.reduce((s, b) => s + b.latencyMs, 0);
        const totalPromptTokens = gen.blocks.reduce((s, b) => s + b.promptTokens, 0);
        const totalCompletionTokens = gen.blocks.reduce((s, b) => s + b.completionTokens, 0);
        const totalCostUsd = gen.blocks
          .reduce((s, b) => s + Number(b.costUsd), 0)
          .toFixed(6);

        const draft: DraftGenerationResult = {
          meta: {
            keyword: distribution.meta.keyword,
            h1Title: distribution.meta.h1Title,
            language: distribution.meta.language,
            primaryIntent: distribution.meta.primaryIntent,
            model: this.env.DRAFT_GENERATE_MODEL,
            generatedAt: new Date().toISOString(),
            useReasoning: this.env.DRAFT_GENERATE_USE_REASONING,
            reasoningEffort: this.env.DRAFT_GENERATE_USE_REASONING
              ? this.env.DRAFT_GENERATE_REASONING_EFFORT
              : null,
            verbosity: this.env.DRAFT_GENERATE_USE_REASONING
              ? this.env.DRAFT_GENERATE_VERBOSITY
              : null,
          },
          htmlContent: html,
          blocks: gen.blocks satisfies DraftBlockStats[],
          imagePrompts: gen.imagePrompts,
          stats: {
            blockCount: gen.blocks.length,
            totalChars,
            totalLatencyMs,
            totalCostUsd,
            totalPromptTokens,
            totalCompletionTokens,
            imagePromptCount: gen.imagePrompts.length,
          },
          warnings: gen.warnings,
        };

        DraftGenerationResult.parse(draft); // self-check before caching

        return {
          result: draft,
          costUsd: totalCostUsd,
          latencyMs: totalLatencyMs,
        };
      },
    });

    if (result.warnings.length > 0) {
      this.logger.warn(
        { runId: ctx.run.id, stepId: ctx.step.id, warnings: result.warnings },
        `draft.generate: ${result.warnings.length} warnings`,
      );
    }

    this.logger.log(
      {
        runId: ctx.run.id,
        stepId: ctx.step.id,
        blocks: result.stats.blockCount,
        totalChars: result.stats.totalChars,
        totalCostUsd: result.stats.totalCostUsd,
        totalLatencyMs: result.stats.totalLatencyMs,
        imagePrompts: result.stats.imagePromptCount,
      },
      "draft.generate done",
    );

    const preview = this.client.buildBlockPrompts({
      distribution,
      articleContext,
    });

    return {
      output: result,
      input: {
        kind: "llm.prompt",
        promptVersion: PROMPT_VERSION,
        system: preview.system,
        userBlocks: preview.userBlocks,
      },
    };
  }
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
