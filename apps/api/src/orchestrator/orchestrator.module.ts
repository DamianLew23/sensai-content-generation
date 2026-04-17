import { Module } from "@nestjs/common";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { loadEnv } from "../config/env";
import { OrchestratorService } from "./orchestrator.service";
import { PipelineWorker } from "./pipeline.worker";
import { ReconcileService } from "./reconcile.service";
import { StepRegistry } from "./step-registry";
import { HandlersModule } from "../handlers/handlers.module";
import { QUEUE_NAME } from "./queue.constants";

@Module({
  imports: [HandlersModule],
  providers: [
    {
      provide: "PIPELINE_REDIS",
      useFactory: () => {
        const env = loadEnv();
        return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
      },
    },
    {
      provide: "PIPELINE_QUEUE",
      useFactory: (connection: Redis) => new Queue(QUEUE_NAME, { connection }),
      inject: ["PIPELINE_REDIS"],
    },
    StepRegistry,
    OrchestratorService,
    PipelineWorker,
    ReconcileService,
  ],
  exports: [OrchestratorService],
})
export class OrchestratorModule {}
