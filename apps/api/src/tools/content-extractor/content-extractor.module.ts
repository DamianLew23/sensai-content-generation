import { Module } from "@nestjs/common";
import { ContentExtractorClient } from "./content-extractor.client";
import { LlmModule } from "../../llm/llm.module";
import { loadEnv } from "../../config/env";

@Module({
  imports: [LlmModule],
  providers: [
    ContentExtractorClient,
    {
      provide: "EXTRACT_ENV",
      useFactory: () => loadEnv(),
    },
  ],
  exports: [ContentExtractorClient],
})
export class ContentExtractorModule {}
