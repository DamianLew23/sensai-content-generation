import { Inject, Injectable, Logger } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { StepContext, StepHandler, StepResult } from "../orchestrator/step-handler";
import {
  DistributionResult,
  KnowledgeGraph,
  OutlineGenerationResult,
} from "@sensai/shared";
import { ToolCacheService } from "../tools/tool-cache.service";
import { KGDistributorClient } from "../tools/kg-distributor/kg-distributor.client";
import { mergeDistribution } from "../tools/kg-distributor/kg-distributor.merge";
import { validateDistribution } from "../tools/kg-distributor/kg-distributor.validate";
import type { Env } from "../config/env";

type HandlerEnv = Pick<
  Env,
  | "OUTLINE_DISTRIBUTE_TTL_DAYS"
  | "OUTLINE_DISTRIBUTE_MODEL"
  | "OUTLINE_COVERAGE_MIN_WARNING"
  | "OUTLINE_COVERAGE_MAX_WARNING"
>;

const PROMPT_VERSION = "v1";

@Injectable()
export class OutlineDistributeHandler implements StepHandler {
  readonly type = "tool.outline.distribute";
  private readonly logger = new Logger(OutlineDistributeHandler.name);

  constructor(
    private readonly client: KGDistributorClient,
    private readonly cache: ToolCacheService,
    @Inject("OUTLINE_DISTRIBUTE_HANDLER_ENV") private readonly env: HandlerEnv,
  ) {}

  async execute(ctx: StepContext): Promise<StepResult> {
    const prevOutline = ctx.previousOutputs.outlineGen;
    if (prevOutline === undefined || prevOutline === null) {
      throw new Error("outline.distribute requires previousOutputs.outlineGen");
    }
    const prevKg = ctx.previousOutputs.kg;
    if (prevKg === undefined || prevKg === null) {
      throw new Error("outline.distribute requires previousOutputs.kg");
    }

    const outline = OutlineGenerationResult.parse(prevOutline);
    const kg = KnowledgeGraph.parse(prevKg);

    const outlineHash = sha256(JSON.stringify(outline));
    const kgHash = sha256(JSON.stringify(kg));

    const result = await this.cache.getOrSet<DistributionResult>({
      tool: "outline",
      method: "distribute",
      params: {
        outlineHash,
        kgHash,
        model: this.env.OUTLINE_DISTRIBUTE_MODEL,
        promptVersion: PROMPT_VERSION,
      },
      ttlSeconds: this.env.OUTLINE_DISTRIBUTE_TTL_DAYS * 24 * 3600,
      runId: ctx.run.id,
      stepId: ctx.step.id,
      forceRefresh: ctx.forceRefresh,
      fetcher: async () => {
        const callResult = await this.client.distribute({
          ctx: { runId: ctx.run.id, stepId: ctx.step.id, attempt: ctx.attempt },
          outline,
          kg,
        });

        const merge = mergeDistribution({ outline, kg, mapping: callResult.result });

        const validate = validateDistribution({
          sections: merge.sections,
          kg,
          minPercent: this.env.OUTLINE_COVERAGE_MIN_WARNING,
          maxPercent: this.env.OUTLINE_COVERAGE_MAX_WARNING,
        });

        const distResult: DistributionResult = {
          meta: {
            keyword: outline.meta.keyword,
            h1Title: outline.meta.h1Title,
            language: outline.meta.language,
            primaryIntent: outline.meta.primaryIntent,
            generatedAt: new Date().toISOString(),
            model: this.env.OUTLINE_DISTRIBUTE_MODEL,
          },
          sections: merge.sections,
          unused: merge.unused,
          stats: validate.stats,
          warnings: [...merge.warnings, ...validate.warnings],
        };

        DistributionResult.parse(distResult); // self-check before caching

        return {
          result: distResult,
          costUsd: String(callResult.costUsd ?? "0"),
          latencyMs: callResult.latencyMs ?? 0,
        };
      },
    });

    if (result.warnings.length > 0) {
      this.logger.warn(
        { runId: ctx.run.id, stepId: ctx.step.id, warnings: result.warnings },
        `outline.distribute: ${result.warnings.length} warnings`,
      );
    }

    this.logger.log(
      {
        runId: ctx.run.id,
        stepId: ctx.step.id,
        sections: result.sections.length,
        coverage: result.stats.coverage.overallPercent,
        unusedEntities: result.unused.entityIds.length,
        warnings: result.warnings.length,
      },
      "outline.distribute done",
    );

    return { output: result };
  }
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
