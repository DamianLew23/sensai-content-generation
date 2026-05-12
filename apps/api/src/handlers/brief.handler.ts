import { Injectable } from "@nestjs/common";
import { LlmClient } from "../llm/llm.client";
import { briefPrompt } from "../prompts/brief.prompt";
import type { StepContext, StepHandler, StepResult } from "../orchestrator/step-handler";
import type { ProjectConfig, RunInput } from "@sensai/shared";
import { ScrapeResult, ResearchBriefing } from "@sensai/shared";
import { SerpResult } from "../tools/dataforseo/serp.types";
import {
  getResolvedRunInput,
  getDisambiguateOutput,
} from "../orchestrator/run-input-resolver";

@Injectable()
export class BriefHandler implements StepHandler {
  readonly type = "llm.brief";

  constructor(private readonly llm: LlmClient) {}

  async execute(ctx: StepContext): Promise<StepResult> {
    const cfg = ctx.project.config as ProjectConfig;
    const resolved = getResolvedRunInput(ctx.run.input as RunInput, ctx.previousOutputs);
    const dis = getDisambiguateOutput(ctx.previousOutputs);
    const antiAngles = dis?.antiAngles ?? [];
    const model = cfg.defaultModels?.brief;

    const research = SerpResult.safeParse(ctx.previousOutputs.research);
    const serpContext = research.success ? research.data.items : undefined;

    const scrapeParsed = ScrapeResult.safeParse(ctx.previousOutputs.scrape);
    const scrapePages = scrapeParsed.success ? scrapeParsed.data.pages : undefined;

    const deepResearchParsed = ResearchBriefing.safeParse(ctx.previousOutputs.deepResearch);
    const deepResearch = deepResearchParsed.success ? deepResearchParsed.data : undefined;

    const system = briefPrompt.system(ctx.project, antiAngles);
    const userPrompt = briefPrompt.user(resolved, serpContext, scrapePages, deepResearch);

    const res = await this.llm.generateObject({
      ctx: {
        runId: ctx.run.id,
        stepId: ctx.step.id,
        attempt: ctx.attempt,
        model,
      },
      system,
      prompt: userPrompt,
      schema: briefPrompt.schema,
    });
    return {
      output: res.object,
      input: {
        kind: "llm.prompt",
        system,
        user: userPrompt,
      },
    };
  }
}
