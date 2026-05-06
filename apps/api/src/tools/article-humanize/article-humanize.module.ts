import { Module } from "@nestjs/common";
import OpenAI from "openai";
import { LlmModule } from "../../llm/llm.module";
import { OpenAIResponsesClient } from "../../llm/openai-responses.client";
import { ArticleHumanizeClient } from "./article-humanize.client";
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
      provide: "ARTICLE_HUMANIZE_ENV",
      useFactory: () => {
        const env = loadEnv();
        return {
          ARTICLE_HUMANIZE_MODEL: env.ARTICLE_HUMANIZE_MODEL,
          ARTICLE_HUMANIZE_ASL_MIN: env.ARTICLE_HUMANIZE_ASL_MIN,
          ARTICLE_HUMANIZE_ASL_MAX: env.ARTICLE_HUMANIZE_ASL_MAX,
          ARTICLE_HUMANIZE_SENTENCE_HARD_CAP: env.ARTICLE_HUMANIZE_SENTENCE_HARD_CAP,
          ARTICLE_HUMANIZE_MIN_STRONG_PER_BLOCK: env.ARTICLE_HUMANIZE_MIN_STRONG_PER_BLOCK,
          ARTICLE_HUMANIZE_MAX_STRONG_PER_BLOCK: env.ARTICLE_HUMANIZE_MAX_STRONG_PER_BLOCK,
          ARTICLE_HUMANIZE_STRONG_WORDS_PER_BLOCK: env.ARTICLE_HUMANIZE_STRONG_WORDS_PER_BLOCK,
          ARTICLE_HUMANIZE_BOLD_SHARE_MAX: env.ARTICLE_HUMANIZE_BOLD_SHARE_MAX,
          ARTICLE_HUMANIZE_MIN_LEN_RATIO: env.ARTICLE_HUMANIZE_MIN_LEN_RATIO,
          ARTICLE_HUMANIZE_MAX_LEN_RATIO: env.ARTICLE_HUMANIZE_MAX_LEN_RATIO,
          ARTICLE_HUMANIZE_RETRY_ENABLED: env.ARTICLE_HUMANIZE_RETRY_ENABLED,
          ARTICLE_HUMANIZE_LANG_PROBE_THRESHOLD: env.ARTICLE_HUMANIZE_LANG_PROBE_THRESHOLD,
        };
      },
    },
    ArticleHumanizeClient,
  ],
  exports: [ArticleHumanizeClient],
})
export class ArticleHumanizeModule {}
