import { Module } from "@nestjs/common";
import { BriefHandler } from "./brief.handler";
import { SerpFetchHandler } from "./serp-fetch.handler";
import { ToolsModule } from "../tools/tools.module";
import { STEP_HANDLERS, type StepHandler } from "../orchestrator/step-handler";

@Module({
  imports: [ToolsModule],
  providers: [
    BriefHandler,
    SerpFetchHandler,
    {
      provide: STEP_HANDLERS,
      useFactory: (brief: BriefHandler, serp: SerpFetchHandler): StepHandler[] => [brief, serp],
      inject: [BriefHandler, SerpFetchHandler],
    },
  ],
  exports: [STEP_HANDLERS],
})
export class HandlersModule {}
