import { Inject, Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import { Queue } from "bullmq";
import { DB_TOKEN } from "../db/db.module";
import type { Db } from "../db/client";
import { pipelineRuns, pipelineSteps } from "../db/schema";
import { OrchestratorService } from "./orchestrator.service";

@Injectable()
export class ReconcileService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ReconcileService.name);

  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    @Inject("PIPELINE_QUEUE") private readonly queue: Queue,
    private readonly orchestrator: OrchestratorService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const activeRuns = await this.db
      .select()
      .from(pipelineRuns)
      .where(inArray(pipelineRuns.status, ["running", "pending"]));

    if (activeRuns.length === 0) {
      this.logger.log("no active runs to reconcile");
      return;
    }

    for (const run of activeRuns) {
      const steps = await this.db
        .select()
        .from(pipelineSteps)
        .where(
          and(eq(pipelineSteps.runId, run.id), inArray(pipelineSteps.status, ["pending", "running"])),
        )
        .orderBy(pipelineSteps.stepOrder);

      const next = steps[0];
      if (!next) continue;

      // Reset stuck "running" back to "pending" so we retry cleanly
      if (next.status === "running") {
        await this.db
          .update(pipelineSteps)
          .set({ status: "pending", startedAt: null })
          .where(eq(pipelineSteps.id, next.id));
      }

      await this.orchestrator.enqueueStep(run.id, next.id);
      this.logger.log({ runId: run.id, stepId: next.id }, "reconciled: re-enqueued step");
    }
  }
}
