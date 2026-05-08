import { Module } from "@nestjs/common";
import { LlmModule } from "../../llm/llm.module";
import { TopicDisambiguatorClient } from "./topic-disambiguator.client";
import { loadEnv } from "../../config/env";

@Module({
  imports: [LlmModule],
  providers: [
    {
      provide: "DISAMBIGUATE_ENV",
      useFactory: () => {
        const env = loadEnv();
        return {
          DISAMBIGUATE_MODEL: env.DISAMBIGUATE_MODEL,
          DISAMBIGUATE_MAX_INPUT_CHARS: env.DISAMBIGUATE_MAX_INPUT_CHARS,
        };
      },
    },
    TopicDisambiguatorClient,
  ],
  exports: [TopicDisambiguatorClient],
})
export class TopicDisambiguatorModule {}
