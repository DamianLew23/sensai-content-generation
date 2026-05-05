import { Module } from "@nestjs/common";
import OpenAI from "openai";
import { LlmModule } from "../../llm/llm.module";
import { OpenAIResponsesClient } from "../../llm/openai-responses.client";
import { ArticleIntermediateClient } from "./article-intermediate.client";
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
      provide: "ARTICLE_INTERMEDIATE_ENV",
      useFactory: () => {
        const env = loadEnv();
        return {
          ARTICLE_INTERMEDIATE_MODEL: env.ARTICLE_INTERMEDIATE_MODEL,
          ARTICLE_INTERMEDIATE_MAX_GROWTH: env.ARTICLE_INTERMEDIATE_MAX_GROWTH,
        };
      },
    },
    ArticleIntermediateClient,
  ],
  exports: [ArticleIntermediateClient],
})
export class ArticleIntermediateModule {}
