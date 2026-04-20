import { Injectable } from "@nestjs/common";
import { LlmClient } from "../llm/llm.client";
import { briefPrompt } from "../prompts/brief.prompt";
import type { StepContext, StepHandler, StepResult } from "../orchestrator/step-handler";
import type { ProjectConfig, RunInput } from "@sensai/shared";
import { SerpResult } from "../tools/dataforseo/serp.types";

@Injectable()
export class BriefHandler implements StepHandler {
  readonly type = "llm.brief";

  constructor(private readonly llm: LlmClient) {}

  async execute(ctx: StepContext): Promise<StepResult> {
    const cfg = ctx.project.config as ProjectConfig;
    const input = ctx.run.input as RunInput;
    const model = cfg.defaultModels?.brief;

    const research = SerpResult.safeParse(ctx.previousOutputs.research);
    const serpContext = research.success ? research.data.items : undefined;

    const res = await this.llm.generateObject({
      ctx: {
        runId: ctx.run.id,
        stepId: ctx.step.id,
        attempt: ctx.attempt,
        model,
      },
      system: briefPrompt.system(ctx.project),
      prompt: briefPrompt.user(input, serpContext),
      schema: briefPrompt.schema,
    });
    return { output: res.object };
  }
}
