import { Global, Module } from "@nestjs/common";
import { LlmClient } from "./llm.client";
import { CostTrackerService } from "./cost-tracker.service";

@Global()
@Module({
  providers: [LlmClient, CostTrackerService],
  exports: [LlmClient, CostTrackerService],
})
export class LlmModule {}
