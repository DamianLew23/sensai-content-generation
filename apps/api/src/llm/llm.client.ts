import { Injectable, Logger } from "@nestjs/common";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  generateObject as aiGenerateObject,
  generateText as aiGenerateText,
  type LanguageModel,
} from "ai";
import { ZodSchema } from "zod";
import { loadEnv } from "../config/env";
import { calculateCostUsd } from "./pricing";
import { CostTrackerService } from "./cost-tracker.service";

export interface LlmCallContext {
  runId: string;
  stepId: string;
  attempt: number;
  model?: string;
}

export interface LlmTextResult {
  text: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: string;
  latencyMs: number;
}

export interface LlmObjectResult<T> extends Omit<LlmTextResult, "text"> {
  object: T;
}

@Injectable()
export class LlmClient {
  private readonly logger = new Logger(LlmClient.name);
  private readonly provider;
  private readonly defaultModel: string;

  constructor(private readonly costTracker: CostTrackerService) {
    const env = loadEnv();
    this.provider = createOpenAICompatible({
      name: "openrouter",
      apiKey: env.OPENROUTER_API_KEY,
      baseURL: env.OPENROUTER_BASE_URL,
    });
    this.defaultModel = env.DEFAULT_MODEL;
  }

  // Bridge between @ai-sdk/openai-compatible@1.x (LanguageModelV2) and ai@4.x
  // (which types its `model` parameter as LanguageModelV1). The runtime protocol
  // is compatible; only the TS types disagree. Cast at the boundary.
  private modelFor(modelId: string): LanguageModel {
    return this.provider(modelId) as unknown as LanguageModel;
  }

  async generateText(args: {
    ctx: LlmCallContext;
    system: string;
    prompt: string;
  }): Promise<LlmTextResult> {
    const model = args.ctx.model ?? this.defaultModel;
    const started = Date.now();
    const res = await aiGenerateText({
      model: this.modelFor(model),
      system: args.system,
      prompt: args.prompt,
    });
    const latencyMs = Date.now() - started;
    const promptTokens = res.usage?.promptTokens ?? 0;
    const completionTokens = res.usage?.completionTokens ?? 0;
    const costUsd = calculateCostUsd(model, promptTokens, completionTokens);
    await this.costTracker.record({
      runId: args.ctx.runId,
      stepId: args.ctx.stepId,
      attempt: args.ctx.attempt,
      provider: "openrouter",
      model,
      promptTokens,
      completionTokens,
      costUsd,
      latencyMs,
    });
    return { text: res.text, model, promptTokens, completionTokens, costUsd, latencyMs };
  }

  async generateObject<T>(args: {
    ctx: LlmCallContext;
    system: string;
    prompt: string;
    schema: ZodSchema<T>;
  }): Promise<LlmObjectResult<T>> {
    const model = args.ctx.model ?? this.defaultModel;
    const started = Date.now();
    const res = await aiGenerateObject({
      model: this.modelFor(model),
      system: args.system,
      prompt: args.prompt,
      schema: args.schema,
    });
    const latencyMs = Date.now() - started;
    const promptTokens = res.usage?.promptTokens ?? 0;
    const completionTokens = res.usage?.completionTokens ?? 0;
    const costUsd = calculateCostUsd(model, promptTokens, completionTokens);
    await this.costTracker.record({
      runId: args.ctx.runId,
      stepId: args.ctx.stepId,
      attempt: args.ctx.attempt,
      provider: "openrouter",
      model,
      promptTokens,
      completionTokens,
      costUsd,
      latencyMs,
    });
    return {
      object: res.object as T,
      model,
      promptTokens,
      completionTokens,
      costUsd,
      latencyMs,
    };
  }
}
