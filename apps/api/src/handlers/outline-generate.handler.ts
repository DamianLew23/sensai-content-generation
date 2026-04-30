import { Inject, Injectable, Logger } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { StepContext, StepHandler, StepResult } from "../orchestrator/step-handler";
import {
  OutlineGenerationResult,
  QueryFanOutResult,
  type RunInput,
} from "@sensai/shared";
import { ToolCacheService } from "../tools/tool-cache.service";
import { OutlineGeneratorClient } from "../tools/outline-generator/outline-generator.client";
import { preprocessFanout } from "../tools/outline-generator/outline-generator.preprocess";
import { postprocessOutline } from "../tools/outline-generator/outline-generator.postprocess";
import type { Env } from "../config/env";

type HandlerEnv = Pick<
  Env,
  | "OUTLINE_GENERATE_TTL_DAYS"
  | "OUTLINE_GENERATE_MODEL"
  | "OUTLINE_GENERATE_REASONING"
>;

const PROMPT_VERSION = "v1";

@Injectable()
export class OutlineGenerateHandler implements StepHandler {
  readonly type = "tool.outline.generate";
  private readonly logger = new Logger(OutlineGenerateHandler.name);

  constructor(
    private readonly client: OutlineGeneratorClient,
    private readonly cache: ToolCacheService,
    @Inject("OUTLINE_GENERATE_HANDLER_ENV") private readonly env: HandlerEnv,
  ) {}

  async execute(ctx: StepContext): Promise<StepResult> {
    const prevFanout = ctx.previousOutputs.fanout;
    if (prevFanout === undefined || prevFanout === null) {
      throw new Error("outline.generate requires previousOutputs.fanout");
    }
    const fanout = QueryFanOutResult.parse(prevFanout);
    const input = ctx.run.input as RunInput;

    const keyword = this.composeKeyword(input);
    const language = fanout.metadata.language;
    const userH1Title = input.h1Title;
    const userIntent = input.intent;

    const fanoutHash = sha256(JSON.stringify(fanout));

    const result = await this.cache.getOrSet<OutlineGenerationResult>({
      tool: "outline",
      method: "generate",
      params: {
        keyword,
        language,
        h1TitleProvided: !!userH1Title,
        userIntent: userIntent ?? null,
        fanoutHash,
        model: this.env.OUTLINE_GENERATE_MODEL,
        reasoning: this.env.OUTLINE_GENERATE_REASONING,
        promptVersion: PROMPT_VERSION,
      },
      ttlSeconds: this.env.OUTLINE_GENERATE_TTL_DAYS * 24 * 3600,
      runId: ctx.run.id,
      stepId: ctx.step.id,
      forceRefresh: ctx.forceRefresh,
      fetcher: async () => {
        const t0 = Date.now();

        const preprocessed = preprocessFanout(fanout, userIntent);

        const callResult = await this.client.generate({
          ctx: { runId: ctx.run.id, stepId: ctx.step.id, attempt: ctx.attempt },
          keyword,
          userH1Title,
          language,
          preprocessed,
        });

        const outlineResult = postprocessOutline({
          preprocessed,
          llmResult: callResult.result,
          keyword,
          language,
          userH1Title,
          model: this.env.OUTLINE_GENERATE_MODEL,
        });

        OutlineGenerationResult.parse(outlineResult); // self-check before caching

        return {
          result: outlineResult,
          costUsd: String(callResult.costUsd ?? "0"),
          latencyMs: Date.now() - t0,
        };
      },
    });

    if (result.warnings.length > 0) {
      this.logger.warn(
        { runId: ctx.run.id, stepId: ctx.step.id, warnings: result.warnings },
        `outline.generate: ${result.warnings.length} warnings`,
      );
    }

    this.logger.log(
      {
        runId: ctx.run.id,
        stepId: ctx.step.id,
        fullSections: result.meta.fullSectionsCount,
        contextSections: result.meta.contextSectionsCount,
        warnings: result.warnings.length,
        h1Source: result.meta.h1Source,
      },
      "outline.generate done",
    );

    return { output: result };
  }

  private composeKeyword(input: RunInput): string {
    return input.mainKeyword ?? input.topic;
  }
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
