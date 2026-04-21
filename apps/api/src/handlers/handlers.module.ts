import { Module } from "@nestjs/common";
import { BriefHandler } from "./brief.handler";
import { SerpFetchHandler } from "./serp-fetch.handler";
import { ScrapeFetchHandler } from "./scrape-fetch.handler";
import { ToolsModule } from "../tools/tools.module";
import { STEP_HANDLERS, type StepHandler } from "../orchestrator/step-handler";

@Module({
  imports: [ToolsModule],
  providers: [
    BriefHandler,
    SerpFetchHandler,
    ScrapeFetchHandler,
    {
      provide: STEP_HANDLERS,
      useFactory: (
        brief: BriefHandler,
        serp: SerpFetchHandler,
        scrape: ScrapeFetchHandler,
      ): StepHandler[] => [brief, serp, scrape],
      inject: [BriefHandler, SerpFetchHandler, ScrapeFetchHandler],
    },
  ],
  exports: [STEP_HANDLERS],
})
export class HandlersModule {}
