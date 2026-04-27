import { Module } from "@nestjs/common";
import { EntityExtractorClient } from "./entity-extractor.client";
import { LlmModule } from "../../llm/llm.module";
import { loadEnv } from "../../config/env";

@Module({
  imports: [LlmModule],
  providers: [
    EntityExtractorClient,
    {
      provide: "ENTITY_EXTRACT_ENV",
      useFactory: () => loadEnv(),
    },
  ],
  exports: [EntityExtractorClient],
})
export class EntityExtractorModule {}
