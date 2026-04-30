import { Module } from "@nestjs/common";
import { LlmModule } from "../../llm/llm.module";
import { loadEnv } from "../../config/env";
import { OutlineGeneratorClient } from "./outline-generator.client";

@Module({
  imports: [LlmModule],
  providers: [
    OutlineGeneratorClient,
    {
      provide: "OUTLINE_GENERATOR_ENV",
      useFactory: () => loadEnv(),
    },
  ],
  exports: [OutlineGeneratorClient],
})
export class OutlineGeneratorModule {}
