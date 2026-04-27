import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Job, Worker, UnrecoverableError } from "bullmq";
import { Redis } from "ioredis";
import { eq, sql } from "drizzle-orm";
import { DB_TOKEN } from "../db/db.module";
import type { Db } from "../db/client";
import { pipelineRuns, pipelineSteps, projects } from "../db/schema";
import { loadEnv } from "../config/env";
import { StepRegistry } from "./step-registry";
import { OrchestratorService } from "./orchestrator.service";
import { QUEUE_NAME, type StepJobData } from "./queue.constants";
import { CostLimitExceededError } from "./cost-limit-exceeded.error";

@Injectable()
export class PipelineWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PipelineWorker.name);
  private worker?: Worker<StepJobData>;
  private connection?: Redis;

  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly registry: StepRegistry,
    private readonly orchestrator: OrchestratorService,
  ) {}

  onModuleInit(): void {
    const env = loadEnv();
    this.connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    this.worker = new Worker<StepJobData>(
      QUEUE_NAME,
      async (job) => this.process(job),
      { connection: this.connection, concurrency: 3 },
    );
    this.worker.on("failed", (job, err) => {
      this.logger.error({ jobId: job?.id, err: err.message }, "job failed");
    });
    this.worker.on("completed", (job) => {
      this.logger.debug({ jobId: job.id }, "job completed");
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.connection?.quit();
  }

  private async process(job: Job<StepJobData>): Promise<void> {
    const { runId, stepId, forceRefresh } = job.data;
    const attempt = (job.attemptsMade ?? 0) + 1;

    const [step] = await this.db.select().from(pipelineSteps).where(eq(pipelineSteps.id, stepId));
    if (!step) throw new Error(`step ${stepId} not found`);
    const [run] = await this.db.select().from(pipelineRuns).where(eq(pipelineRuns.id, runId));
    if (!run) throw new Error(`run ${runId} not found`);
    const [project] = await this.db.select().from(projects).where(eq(projects.id, run.projectId));
    if (!project) throw new Error(`project ${run.projectId} not found`);

    // Mark step running (first attempt only)
    if (step.status === "pending") {
      await this.db
        .update(pipelineSteps)
        .set({ status: "running", startedAt: new Date() })
        .where(eq(pipelineSteps.id, stepId));
      await this.db
        .update(pipelineRuns)
        .set({ status: "running" })
        .where(eq(pipelineRuns.id, runId));
    }

    // Load previous outputs
    const priorSteps = await this.db
      .select()
      .from(pipelineSteps)
      .where(eq(pipelineSteps.runId, runId));
    const previousOutputs: Record<string, unknown> = {};
    for (const s of priorSteps) {
      if (s.stepOrder < step.stepOrder && s.output) {
        previousOutputs[s.stepKey] = s.output;
      }
    }

    const handler = this.registry.resolve(step.type);

    try {
      await this.checkCostCap(runId);

      const result = await handler.execute({
        run,
        step,
        project,
        previousOutputs,
        attempt,
        forceRefresh,
      });
      await this.db
        .update(pipelineSteps)
        .set({
          output: result.output as any,
          status: "completed",
          finishedAt: new Date(),
          error: null,
        })
        .where(eq(pipelineSteps.id, stepId));

      await this.orchestrator.advance(runId, step.stepOrder);
    } catch (err: any) {
      const isHttp4xx =
        err?.name === "HttpError" &&
        typeof err?.status === "number" &&
        err.status >= 400 && err.status < 500 &&
        err.status !== 429;
      const isCostCap = err instanceof CostLimitExceededError;
      const serialized = {
        message: err?.message ?? String(err),
        name: err?.name,
        code: typeof err?.code === "string" ? err.code : undefined,
        stack: err?.stack,
        attempt,
        timestamp: new Date().toISOString(),
      };
      const maxAttempts = job.opts.attempts ?? 1;
      const isFinal = isCostCap || isHttp4xx || attempt >= maxAttempts;
      await this.db
        .update(pipelineSteps)
        .set({
          retryCount: attempt,
          error: serialized as any,
          status: isFinal ? "failed" : "running",
          finishedAt: isFinal ? new Date() : null,
        })
        .where(eq(pipelineSteps.id, stepId));
      if (isFinal) {
        await this.db
          .update(pipelineRuns)
          .set({ status: "failed", finishedAt: new Date() })
          .where(eq(pipelineRuns.id, runId));
      }
      if (isCostCap || isHttp4xx) {
        throw new UnrecoverableError(err.message);
      }
      throw err;
    }
  }

  private async checkCostCap(runId: string): Promise<void> {
    const env = loadEnv();
    const cap = parseFloat(env.MAX_COST_PER_RUN_USD);
    if (!Number.isFinite(cap) || cap <= 0) {
      this.logger.warn(
        { raw: env.MAX_COST_PER_RUN_USD },
        "MAX_COST_PER_RUN_USD invalid, cost cap disabled",
      );
      return;
    }
    const result = await this.db.execute(sql`
      SELECT COALESCE(SUM(cost_usd::numeric), 0)::float8 AS sum_cost
      FROM (
        SELECT cost_usd FROM llm_calls WHERE run_id = ${runId}::uuid
        UNION ALL
        SELECT cost_usd FROM tool_calls WHERE run_id = ${runId}::uuid
      ) t
    `);
    const row = (result as unknown as { rows: { sum_cost: number }[] }).rows[0];
    const sumCost = Number(row?.sum_cost ?? 0);
    if (sumCost >= cap) {
      throw new CostLimitExceededError(runId, cap, sumCost);
    }
  }
}
