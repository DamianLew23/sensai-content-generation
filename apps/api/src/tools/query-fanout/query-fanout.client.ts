import { Inject, Injectable, Logger } from "@nestjs/common";
import { LlmClient } from "../../llm/llm.client";
import type { Env } from "../../config/env";
import {
  FanOutClassifyCall,
  FanOutIntentsCall,
  FanOutPaaCall,
} from "@sensai/shared";
import type { QueryFanOutCallContext, QueryFanOutCallStats } from "./query-fanout.types";
import { queryFanoutPrompt } from "../../prompts/query-fanout.prompt";

type ClientEnv = Pick<
  Env,
  | "QUERY_FANOUT_MODEL"
  | "QUERY_FANOUT_LANGUAGE"
  | "QUERY_FANOUT_MAX_AREAS_PER_INTENT"
  | "QUERY_FANOUT_REASONING_INTENTS"
  | "QUERY_FANOUT_REASONING_CLASSIFY"
  | "QUERY_FANOUT_REASONING_PAA"
>;

type ReasoningEffort = "low" | "medium" | "high";

export interface IntentsCallResult extends QueryFanOutCallStats {
  result: FanOutIntentsCall;
}
export interface ClassifyCallResult extends QueryFanOutCallStats {
  result: FanOutClassifyCall;
}
export interface PaaCallResult extends QueryFanOutCallStats {
  result: FanOutPaaCall;
}

@Injectable()
export class QueryFanOutClient {
  private readonly logger = new Logger(QueryFanOutClient.name);

  constructor(
    private readonly llm: LlmClient,
    @Inject("QUERY_FANOUT_ENV") private readonly env: ClientEnv,
  ) {}

  async generateIntents(args: {
    ctx: QueryFanOutCallContext;
    keyword: string;
  }): Promise<IntentsCallResult> {
    const system = queryFanoutPrompt.intents.system(this.env.QUERY_FANOUT_MAX_AREAS_PER_INTENT);
    const user = queryFanoutPrompt.intents.user({
      keyword: args.keyword,
      language: this.env.QUERY_FANOUT_LANGUAGE,
      maxAreas: this.env.QUERY_FANOUT_MAX_AREAS_PER_INTENT,
    });

    const res = await this.llm.generateObject({
      ctx: { ...args.ctx, model: this.env.QUERY_FANOUT_MODEL },
      system,
      prompt: user,
      schema: FanOutIntentsCall,
      providerOptions: this.reasoning(this.env.QUERY_FANOUT_REASONING_INTENTS),
    });

    this.logger.log(
      {
        call: "intents",
        model: res.model,
        promptTokens: res.promptTokens,
        completionTokens: res.completionTokens,
        costUsd: res.costUsd,
        latencyMs: res.latencyMs,
        intentsOut: res.object.intents.length,
        areasOut: res.object.intents.reduce((acc, i) => acc + i.areas.length, 0),
      },
      "query-fanout LLM call",
    );

    return {
      result: res.object as FanOutIntentsCall,
      model: res.model,
      promptTokens: res.promptTokens,
      completionTokens: res.completionTokens,
      costUsd: res.costUsd,
      latencyMs: res.latencyMs,
    };
  }

  async classify(args: {
    ctx: QueryFanOutCallContext;
    keyword: string;
    intents: FanOutIntentsCall["intents"];
  }): Promise<ClassifyCallResult> {
    const system = queryFanoutPrompt.classify.system;
    const user = queryFanoutPrompt.classify.user({
      keyword: args.keyword,
      intentsJson: JSON.stringify(args.intents, null, 2),
    });

    const res = await this.llm.generateObject({
      ctx: { ...args.ctx, model: this.env.QUERY_FANOUT_MODEL },
      system,
      prompt: user,
      schema: FanOutClassifyCall,
      providerOptions: this.reasoning(this.env.QUERY_FANOUT_REASONING_CLASSIFY),
    });

    this.logger.log(
      {
        call: "classify",
        model: res.model,
        promptTokens: res.promptTokens,
        completionTokens: res.completionTokens,
        costUsd: res.costUsd,
        latencyMs: res.latencyMs,
        classificationsOut: res.object.classifications.length,
        dominantIntent: res.object.dominantIntent,
      },
      "query-fanout LLM call",
    );

    return {
      result: res.object as FanOutClassifyCall,
      model: res.model,
      promptTokens: res.promptTokens,
      completionTokens: res.completionTokens,
      costUsd: res.costUsd,
      latencyMs: res.latencyMs,
    };
  }

  async assignPaa(args: {
    ctx: QueryFanOutCallContext;
    keyword: string;
    areas: Array<{ id: string; topic: string; question: string }>;
    paaQuestions: string[];
  }): Promise<PaaCallResult> {
    const system = queryFanoutPrompt.paa.system;
    const user = queryFanoutPrompt.paa.user({
      keyword: args.keyword,
      areasJson: JSON.stringify(args.areas, null, 2),
      paaQuestions: args.paaQuestions,
    });

    const res = await this.llm.generateObject({
      ctx: { ...args.ctx, model: this.env.QUERY_FANOUT_MODEL },
      system,
      prompt: user,
      schema: FanOutPaaCall,
      providerOptions: this.reasoning(this.env.QUERY_FANOUT_REASONING_PAA),
    });

    this.logger.log(
      {
        call: "paa",
        model: res.model,
        promptTokens: res.promptTokens,
        completionTokens: res.completionTokens,
        costUsd: res.costUsd,
        latencyMs: res.latencyMs,
        assignmentsOut: res.object.assignments.length,
        unmatchedOut: res.object.unmatched.length,
      },
      "query-fanout LLM call",
    );

    return {
      result: res.object as FanOutPaaCall,
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
