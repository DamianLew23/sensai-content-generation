import { Module } from "@nestjs/common";
import { BriefHandler } from "./brief.handler";
import { STEP_HANDLERS, type StepHandler } from "../orchestrator/step-handler";

@Module({
  providers: [
    BriefHandler,
    {
      provide: STEP_HANDLERS,
      useFactory: (brief: BriefHandler): StepHandler[] => [brief],
      inject: [BriefHandler],
    },
  ],
  exports: [STEP_HANDLERS],
})
export class HandlersModule {}
