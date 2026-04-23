import { Inject, Injectable, Logger } from "@nestjs/common";
import { LlmClient } from "../../llm/llm.client";
import type { Env } from "../../config/env";
import { MAX_BATCH_SIZE, MAX_TEXT_CHARS } from "./cleaning.types";

type ClientEnv = Pick<Env, "CLEANING_EMBEDDING_MODEL" | "CLEANING_COST_PER_1M_TOKENS">;

@Injectable()
export class ContentCleanerClient {
  private readonly logger = new Logger(ContentCleanerClient.name);

  constructor(
    private readonly llm: LlmClient,
    @Inject("CLEANING_ENV") private readonly env: ClientEnv,
  ) {}

  async embedTexts(
    texts: string[],
    ctx: { runId: string; stepId: string },
  ): Promise<{ embeddings: number[][]; costUsd: string; tokensUsed: number }> {
    if (texts.length === 0) {
      return { embeddings: [], costUsd: "0", tokensUsed: 0 };
    }

    const prepared = texts.map((t, i) => {
      if (t.length > MAX_TEXT_CHARS) {
        this.logger.warn(
          { index: i, originalLength: t.length, truncatedTo: MAX_TEXT_CHARS },
          "text truncated before embedding",
        );
        return t.slice(0, MAX_TEXT_CHARS);
      }
      return t;
    });

    const allEmbeddings: number[][] = [];
    let totalTokens = 0;

    for (let offset = 0; offset < prepared.length; offset += MAX_BATCH_SIZE) {
      const batch = prepared.slice(offset, offset + MAX_BATCH_SIZE);
      const res = await this.llm.embedMany({
        ctx,
        model: this.env.CLEANING_EMBEDDING_MODEL,
        values: batch,
      });
      allEmbeddings.push(...res.embeddings);
      totalTokens += res.tokensUsed;
    }

    const costUsd = this.calculateCost(totalTokens);
    return { embeddings: allEmbeddings, costUsd, tokensUsed: totalTokens };
  }

  private calculateCost(tokens: number): string {
    if (tokens === 0) return "0";
    const cost = (tokens * this.env.CLEANING_COST_PER_1M_TOKENS) / 1_000_000;
    // Format to 6 decimals, trim trailing zeros
    const formatted = cost.toFixed(6).replace(/\.?0+$/, "");
    return formatted || "0";
  }
}
