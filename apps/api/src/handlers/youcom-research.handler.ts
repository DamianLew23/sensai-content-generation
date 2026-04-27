import { Inject, Injectable } from "@nestjs/common";
import type { StepContext, StepHandler, StepResult } from "../orchestrator/step-handler";
import { YoucomClient } from "../tools/youcom/youcom.client";
import { ToolCacheService } from "../tools/tool-cache.service";
import { youcomCostUsd } from "../tools/youcom/youcom.types";
import { youcomResearchPrompt } from "../prompts/youcom-research.prompt";
import { ResearchBriefing, type ProjectConfig, type ResearchEffort, type RunInput } from "@sensai/shared";
import type { Env } from "../config/env";

const MAX_INPUT_CHARS = 40_000;
const TTL_DAYS = 14;

type YoucomHandlerEnv = Pick<
  Env,
  | "YOUCOM_DEFAULT_EFFORT"
  | "YOUCOM_COST_LITE"
  | "YOUCOM_COST_STANDARD"
  | "YOUCOM_COST_DEEP"
  | "YOUCOM_COST_EXHAUSTIVE"
>;

@Injectable()
export class YoucomResearchHandler implements StepHandler {
  readonly type = "tool.youcom.research";

  constructor(
    private readonly client: YoucomClient,
    private readonly cache: ToolCacheService,
    @Inject("YOUCOM_ENV") private readonly env: YoucomHandlerEnv,
  ) {}

  async execute(ctx: StepContext): Promise<StepResult> {
    const cfg = ctx.project.config as ProjectConfig;
    const runInput = ctx.run.input as RunInput;

    const effort: ResearchEffort = cfg.researchEffort ?? this.env.YOUCOM_DEFAULT_EFFORT;
    const override = cfg.promptOverrides?.[this.type];
    const promptString = youcomResearchPrompt.user(runInput, override);

    if (promptString.length > MAX_INPUT_CHARS) {
      throw new Error(
        `youcom input exceeds ${MAX_INPUT_CHARS} chars (got ${promptString.length})`,
      );
    }

    const briefing = await this.cache.getOrSet({
      tool: "youcom",
      method: "research",
      params: { input: promptString, effort },
      ttlSeconds: TTL_DAYS * 24 * 3600,
      runId: ctx.run.id,
      stepId: ctx.step.id,
      forceRefresh: ctx.forceRefresh,
      fetcher: async () => {
        const t0 = Date.now();
        const raw = await this.client.research({
          input: promptString,
          research_effort: effort,
        });
        const latencyMs = Date.now() - t0;
        const result = ResearchBriefing.parse({
          content: raw.output.content,
          sources: raw.output.sources,
        });
        return {
          result,
          costUsd: youcomCostUsd(this.env, effort),
          latencyMs,
        };
      },
    });

    return { output: briefing };
  }
}
