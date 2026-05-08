import { Inject, Injectable, Logger } from "@nestjs/common";
import { LlmClient } from "../../llm/llm.client";
import type { Env } from "../../config/env";
import { DisambiguateOutput } from "@sensai/shared";
import type { TopicDisambiguateCallContext } from "./topic-disambiguator.types";

type ClientEnv = Pick<Env, "DISAMBIGUATE_MODEL" | "DISAMBIGUATE_MAX_INPUT_CHARS">;

export interface TopicDisambiguateCallResult {
  result: DisambiguateOutput;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: string;
  latencyMs: number;
}

@Injectable()
export class TopicDisambiguatorClient {
  private readonly logger = new Logger(TopicDisambiguatorClient.name);

  constructor(
    private readonly llm: LlmClient,
    @Inject("DISAMBIGUATE_ENV") private readonly env: ClientEnv,
  ) {}

  async disambiguate(args: {
    ctx: TopicDisambiguateCallContext;
    system: string;
    prompt: string;
  }): Promise<TopicDisambiguateCallResult> {
    const totalChars = args.system.length + args.prompt.length;
    if (totalChars > this.env.DISAMBIGUATE_MAX_INPUT_CHARS) {
      throw new Error(
        `topic.disambiguate input exceeds DISAMBIGUATE_MAX_INPUT_CHARS ` +
          `(got ${totalChars}, limit ${this.env.DISAMBIGUATE_MAX_INPUT_CHARS})`,
      );
    }

    const res = await this.llm.generateObject({
      ctx: { ...args.ctx, model: this.env.DISAMBIGUATE_MODEL },
      system: args.system,
      prompt: args.prompt,
      schema: DisambiguateOutput,
    });

    this.logger.log(
      {
        model: res.model,
        promptTokens: res.promptTokens,
        completionTokens: res.completionTokens,
        costUsd: res.costUsd,
        latencyMs: res.latencyMs,
        antiAnglesCount: res.object.antiAngles.length,
        serpQueriesCount: res.object.serpQueries.length,
      },
      "topic-disambiguate LLM call",
    );

    return {
      result: res.object as DisambiguateOutput,
      model: res.model,
      promptTokens: res.promptTokens,
      completionTokens: res.completionTokens,
      costUsd: res.costUsd,
      latencyMs: res.latencyMs,
    };
  }
}
