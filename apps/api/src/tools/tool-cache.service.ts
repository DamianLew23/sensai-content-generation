import { Inject, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { DB_TOKEN } from "../db/db.module";
import type { Db } from "../db/client";
import { toolCache } from "../db/schema";
import { stableStringify } from "./stable-stringify";
import { ToolCallRecorder } from "./tool-call-recorder.service";

export interface GetOrSetOpts<T> {
  tool: string;
  method: string;
  params: unknown;
  ttlSeconds: number;
  runId: string;
  stepId: string;
  fetcher: () => Promise<{ result: T; costUsd: string; latencyMs: number }>;
}

@Injectable()
export class ToolCacheService {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly recorder: ToolCallRecorder,
  ) {}

  async getOrSet<T>(opts: GetOrSetOpts<T>): Promise<T> {
    const paramsHash = createHash("sha256").update(stableStringify(opts.params)).digest("hex");
    const now = new Date();

    const rows = await this.db.select().from(toolCache).where(
      and(
        eq(toolCache.tool, opts.tool),
        eq(toolCache.method, opts.method),
        eq(toolCache.paramsHash, paramsHash),
        gt(toolCache.expiresAt, now),
      ),
    );
    const hit = rows[0];

    if (hit) {
      await this.recorder.record({
        runId: opts.runId, stepId: opts.stepId,
        tool: opts.tool, method: opts.method, paramsHash,
        fromCache: true, costUsd: "0", latencyMs: 0,
      });
      return hit.result as T;
    }

    const fresh = await opts.fetcher();
    const expiresAt = new Date(now.getTime() + opts.ttlSeconds * 1000);

    await this.db.insert(toolCache).values({
      tool: opts.tool,
      method: opts.method,
      paramsHash,
      result: fresh.result as any,
      expiresAt,
    }).onConflictDoUpdate({
      target: [toolCache.tool, toolCache.method, toolCache.paramsHash],
      set: { result: fresh.result as any, createdAt: now, expiresAt },
    });

    await this.recorder.record({
      runId: opts.runId, stepId: opts.stepId,
      tool: opts.tool, method: opts.method, paramsHash,
      fromCache: false, costUsd: fresh.costUsd, latencyMs: fresh.latencyMs,
    });

    return fresh.result;
  }
}
