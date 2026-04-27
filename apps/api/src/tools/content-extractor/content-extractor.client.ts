import { Inject, Injectable, Logger } from "@nestjs/common";
import { LlmClient } from "../../llm/llm.client";
import type { Env } from "../../config/env";
import { ExtractionResult } from "@sensai/shared";
import type { ExtractCallContext } from "./content-extractor.types";

type ClientEnv = Pick<Env, "CONTENT_EXTRACT_MODEL" | "CONTENT_EXTRACT_MAX_INPUT_CHARS">;

export interface ExtractCallResult {
  result: ExtractionResult;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: string;
  latencyMs: number;
}

@Injectable()
export class ContentExtractorClient {
  private readonly logger = new Logger(ContentExtractorClient.name);

  constructor(
    private readonly llm: LlmClient,
    @Inject("EXTRACT_ENV") private readonly env: ClientEnv,
  ) {}

  async extract(args: {
    ctx: ExtractCallContext;
    system: string;
    prompt: string;
  }): Promise<ExtractCallResult> {
    if (args.prompt.length > this.env.CONTENT_EXTRACT_MAX_INPUT_CHARS) {
      throw new Error(
        `content.extract prompt exceeds CONTENT_EXTRACT_MAX_INPUT_CHARS ` +
          `(got ${args.prompt.length}, limit ${this.env.CONTENT_EXTRACT_MAX_INPUT_CHARS})`,
      );
    }

    const res = await this.llm.generateObject({
      ctx: { ...args.ctx, model: this.env.CONTENT_EXTRACT_MODEL },
      system: args.system,
      prompt: args.prompt,
      schema: ExtractionResult,
    });

    this.logger.log(
      {
        model: res.model,
        promptTokens: res.promptTokens,
        completionTokens: res.completionTokens,
        costUsd: res.costUsd,
        latencyMs: res.latencyMs,
        factsOut: res.object.facts.length,
        dataOut: res.object.data.length,
        ideationsOut: res.object.ideations.length,
      },
      "content-extract LLM call",
    );

    return {
      result: res.object as ExtractionResult,
      model: res.model,
      promptTokens: res.promptTokens,
      completionTokens: res.completionTokens,
      costUsd: res.costUsd,
      latencyMs: res.latencyMs,
    };
  }
}
