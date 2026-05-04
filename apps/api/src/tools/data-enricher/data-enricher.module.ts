import { Module } from "@nestjs/common";
import OpenAI from "openai";
import { LlmModule } from "../../llm/llm.module";
import { OpenAIResponsesClient } from "../../llm/openai-responses.client";
import { DataEnrichmentClient } from "./data-enricher.client";
import { loadEnv } from "../../config/env";

@Module({
  imports: [LlmModule],
  providers: [
    {
      provide: "OPENAI_RESPONSES_SDK",
      useFactory: () => {
        const env = loadEnv();
        return new OpenAI({ apiKey: env.OPENAI_API_KEY });
      },
    },
    OpenAIResponsesClient,
    {
      provide: "DATA_ENRICHER_ENV",
      useFactory: () => loadEnv(),
    },
    DataEnrichmentClient,
  ],
  exports: [DataEnrichmentClient],
})
export class DataEnricherModule {}
