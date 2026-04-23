import { Module } from "@nestjs/common";
import { ContentCleanerClient } from "./content-cleaner.client";
import { LlmModule } from "../../llm/llm.module";
import { loadEnv } from "../../config/env";

@Module({
  imports: [LlmModule],
  providers: [
    ContentCleanerClient,
    {
      provide: "CLEANING_ENV",
      useFactory: () => loadEnv(),
    },
  ],
  exports: [ContentCleanerClient],
})
export class ContentCleanerModule {}
