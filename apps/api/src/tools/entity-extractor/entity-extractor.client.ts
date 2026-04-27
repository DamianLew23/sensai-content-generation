import { Inject, Injectable, Logger } from "@nestjs/common";
import { LlmClient } from "../../llm/llm.client";
import type { Env } from "../../config/env";
import { EntityExtractionResult } from "@sensai/shared";
import type { EntityExtractCallContext } from "./entity-extractor.types";

type ClientEnv = Pick<Env, "ENTITY_EXTRACT_MODEL" | "ENTITY_EXTRACT_MAX_INPUT_CHARS">;

export interface EntityExtractCallResult {
  result: EntityExtractionResult;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: string;
  latencyMs: number;
}

@Injectable()
export class EntityExtractorClient {
  private readonly logger = new Logger(EntityExtractorClient.name);

  constructor(
    private readonly llm: LlmClient,
    @Inject("ENTITY_EXTRACT_ENV") private readonly env: ClientEnv,
  ) {}

  async extract(args: {
    ctx: EntityExtractCallContext;
    system: string;
    prompt: string;
  }): Promise<EntityExtractCallResult> {
    if (args.prompt.length > this.env.ENTITY_EXTRACT_MAX_INPUT_CHARS) {
      throw new Error(
        `entity.extract prompt exceeds ENTITY_EXTRACT_MAX_INPUT_CHARS ` +
          `(got ${args.prompt.length}, limit ${this.env.ENTITY_EXTRACT_MAX_INPUT_CHARS})`,
      );
    }

    const res = await this.llm.generateObject({
      ctx: { ...args.ctx, model: this.env.ENTITY_EXTRACT_MODEL },
      system: args.system,
      prompt: args.prompt,
      schema: EntityExtractionResult,
    });

    this.logger.log(
      {
        model: res.model,
        promptTokens: res.promptTokens,
        completionTokens: res.completionTokens,
        costUsd: res.costUsd,
        latencyMs: res.latencyMs,
        entitiesOut: res.object.entities.length,
        relationshipsOut: res.object.relationships.length,
        relationToMainOut: res.object.relationToMain.length,
      },
      "entity-extract LLM call",
    );

    return {
      result: res.object as EntityExtractionResult,
      model: res.model,
      promptTokens: res.promptTokens,
      completionTokens: res.completionTokens,
      costUsd: res.costUsd,
      latencyMs: res.latencyMs,
    };
  }
}
