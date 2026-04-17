import { Inject, Injectable, Logger } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { Queue } from "bullmq";
import { DB_TOKEN } from "../db/db.module";
import type { Db } from "../db/client";
import { pipelineRuns, pipelineSteps } from "../db/schema";
import { QUEUE_NAME, type StepJobData } from "./queue.constants";

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);

  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    @Inject("PIPELINE_QUEUE") private readonly queue: Queue<StepJobData>,
  ) {}

  async enqueueStep(runId: string, stepId: string): Promise<void> {
    await this.queue.add(
      "execute-step",
      { runId, stepId },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );
    this.logger.log({ runId, stepId }, "step enqueued");
  }

  /**
   * After a step completes successfully, decide what's next:
   * - if no next step → mark run completed
   * - if next step requires approval → mark run awaiting_approval
   * - otherwise enqueue next step
   */
  async advance(runId: string, completedStepOrder: number): Promise<void> {
    const steps = await this.db
      .select()
      .from(pipelineSteps)
      .where(eq(pipelineSteps.runId, runId))
      .orderBy(pipelineSteps.stepOrder);

    const nextStep = steps.find((s) => s.stepOrder === completedStepOrder + 1);

    if (!nextStep) {
      await this.db
        .update(pipelineRuns)
        .set({ status: "completed", finishedAt: new Date(), currentStepOrder: completedStepOrder })
        .where(eq(pipelineRuns.id, runId));
      this.logger.log({ runId }, "run completed");
      return;
    }

    if (nextStep.requiresApproval) {
      await this.db
        .update(pipelineRuns)
        .set({ status: "awaiting_approval", currentStepOrder: nextStep.stepOrder })
        .where(eq(pipelineRuns.id, runId));
      this.logger.log({ runId, nextStepId: nextStep.id }, "awaiting approval");
      return;
    }

    await this.db
      .update(pipelineRuns)
      .set({ currentStepOrder: nextStep.stepOrder })
      .where(eq(pipelineRuns.id, runId));

    await this.enqueueStep(runId, nextStep.id);
  }
}
