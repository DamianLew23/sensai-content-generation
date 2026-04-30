import { Module } from "@nestjs/common";
import OpenAI from "openai";
import { OpenAIResponsesClient } from "../../llm/openai-responses.client";
import { DraftGeneratorClient } from "./draft-generator.client";
import { loadEnv } from "../../config/env";

@Module({
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
      provide: "DRAFT_GENERATOR_ENV",
      useFactory: () => loadEnv(),
    },
    DraftGeneratorClient,
  ],
  exports: [DraftGeneratorClient],
})
export class DraftGeneratorModule {}
