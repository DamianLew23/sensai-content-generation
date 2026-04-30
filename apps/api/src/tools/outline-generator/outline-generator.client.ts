import { Inject, Injectable, Logger } from "@nestjs/common";
import { LlmClient } from "../../llm/llm.client";
import type { Env } from "../../config/env";
import { outlineGeneratePrompt } from "../../prompts/outline-generate.prompt";
import { LLMOutlineCallResult } from "./outline-generator.types";
import type { PreprocessedFanout } from "./outline-generator.types";

type ClientEnv = Pick<Env, "OUTLINE_GENERATE_MODEL" | "OUTLINE_GENERATE_REASONING">;

interface CallCtx { runId: string; stepId: string; attempt: number }

export interface GenerateOutlineArgs {
  ctx: CallCtx;
  keyword: string;
  userH1Title: string | undefined;
  language: string;
  preprocessed: PreprocessedFanout;
}

type ReasoningEffort = "low" | "medium" | "high";

@Injectable()
export class OutlineGeneratorClient {
  private readonly logger = new Logger(OutlineGeneratorClient.name);

  constructor(
    private readonly llm: LlmClient,
    @Inject("OUTLINE_GENERATOR_ENV") private readonly env: ClientEnv,
  ) {}

  async generate(args: GenerateOutlineArgs) {
    const primaryAreasForPrompt = args.preprocessed.primaryAreas.map((a) => ({
      id: a.id,
      topic: a.topic,
      question: a.question,
      paaQuestions: a.paaQuestions,
    }));

    const secondaryForPrompt: Record<string, Array<{ id: string; topic: string; question: string }>> = {};
    for (const [intent, areas] of args.preprocessed.secondaryAreasByIntent) {
      secondaryForPrompt[intent] = areas.map((a) => ({ id: a.id, topic: a.topic, question: a.question }));
    }

    const userPrompt = outlineGeneratePrompt.user({
      keyword: args.keyword,
      userH1Title: args.userH1Title,
      language: args.language,
      primaryIntent: args.preprocessed.primaryIntent,
      primaryAreasJson: JSON.stringify(primaryAreasForPrompt, null, 2),
      secondaryAreasByIntentJson: JSON.stringify(secondaryForPrompt, null, 2),
    });

    const res = await this.llm.generateObject({
      ctx: { ...args.ctx, model: this.env.OUTLINE_GENERATE_MODEL },
      system: outlineGeneratePrompt.system,
      prompt: userPrompt,
      schema: LLMOutlineCallResult,
      providerOptions: this.reasoning(this.env.OUTLINE_GENERATE_REASONING),
    });

    this.logger.log(
      {
        call: "outline-generate",
        model: res.model,
        promptTokens: res.promptTokens,
        completionTokens: res.completionTokens,
        costUsd: res.costUsd,
        latencyMs: res.latencyMs,
        fullSectionsOut: res.object.fullSections.length,
        contextSectionsOut: res.object.contextSections.length,
      },
      "outline-generator LLM call",
    );

    return {
      result: res.object as LLMOutlineCallResult,
      model: res.model,
      promptTokens: res.promptTokens,
      completionTokens: res.completionTokens,
      costUsd: res.costUsd,
      latencyMs: res.latencyMs,
    };
  }

  private reasoning(effort: ReasoningEffort): Record<string, Record<string, unknown>> {
    return { openrouter: { reasoning: { effort } } };
  }
}
