import { Injectable, Logger } from "@nestjs/common";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenAI } from "@ai-sdk/openai";
import {
  generateObject as aiGenerateObject,
  generateText as aiGenerateText,
  embedMany as aiEmbedMany,
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
  private readonly openai;
  private readonly defaultModel: string;

  constructor(private readonly costTracker: CostTrackerService) {
    const env = loadEnv();
    this.provider = createOpenAICompatible({
      name: "openrouter",
      apiKey: env.OPENROUTER_API_KEY,
      baseURL: env.OPENROUTER_BASE_URL,
      supportsStructuredOutputs: true,
    });
    this.openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
    this.defaultModel = env.DEFAULT_MODEL;
  }

  private modelFor(modelId: string) {
    return this.provider(modelId);
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
    const promptTokens = res.usage?.inputTokens ?? 0;
    const completionTokens = res.usage?.outputTokens ?? 0;
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schema = args.schema as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await aiGenerateObject<any>({
      model: this.modelFor(model),
      system: args.system,
      prompt: args.prompt,
      schema,
    });
    const latencyMs = Date.now() - started;
    const promptTokens = res.usage?.inputTokens ?? 0;
    const completionTokens = res.usage?.outputTokens ?? 0;
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

  async embedMany(args: {
    ctx: { runId: string; stepId: string };
    model: string;
    values: string[];
  }): Promise<{ embeddings: number[][]; tokensUsed: number; latencyMs: number }> {
    const started = Date.now();
    const res = await aiEmbedMany({
      model: this.openai.embedding(args.model),
      values: args.values,
    });
    const latencyMs = Date.now() - started;
    const tokensUsed = (res.usage as { tokens?: number } | undefined)?.tokens ?? 0;
    return {
      embeddings: res.embeddings as number[][],
      tokensUsed,
      latencyMs,
    };
  }
}
