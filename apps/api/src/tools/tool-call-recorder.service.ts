import { Inject, Injectable } from "@nestjs/common";
import { DB_TOKEN } from "../db/db.module";
import type { Db } from "../db/client";
import { toolCalls } from "../db/schema";

export interface ToolCallRecord {
  runId: string;
  stepId: string;
  tool: string;
  method: string;
  paramsHash: string;
  fromCache: boolean;
  costUsd: string;
  latencyMs: number;
}

@Injectable()
export class ToolCallRecorder {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async record(call: ToolCallRecord): Promise<void> {
    await this.db.insert(toolCalls).values(call);
  }
}
