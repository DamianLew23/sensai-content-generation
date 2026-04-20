import { Inject, Injectable } from "@nestjs/common";
import { DB_TOKEN } from "../db/db.module";
import type { Db } from "../db/client";
import { llmCalls } from "../db/schema";

export interface LlmCallRecord {
  runId: string;
  stepId: string;
  attempt: number;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: string;
  latencyMs: number;
}

@Injectable()
export class CostTrackerService {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async record(call: LlmCallRecord): Promise<void> {
    await this.db.insert(llmCalls).values(call);
  }
}
