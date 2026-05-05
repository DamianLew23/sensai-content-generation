import { Module } from "@nestjs/common";
import OpenAI from "openai";
import { LlmModule } from "../../llm/llm.module";
import { OpenAIResponsesClient } from "../../llm/openai-responses.client";
import { ArticleOptimizeClient } from "./article-optimize.client";
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
      provide: "ARTICLE_OPTIMIZE_ENV",
      useFactory: () => {
        const env = loadEnv();
        return { ARTICLE_OPTIMIZE_MODEL: env.ARTICLE_OPTIMIZE_MODEL };
      },
    },
    ArticleOptimizeClient,
  ],
  exports: [ArticleOptimizeClient],
})
export class ArticleOptimizeModule {}
