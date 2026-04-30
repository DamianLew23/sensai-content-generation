import { Module } from "@nestjs/common";
import { LlmModule } from "../../llm/llm.module";
import { loadEnv } from "../../config/env";
import { KGDistributorClient } from "./kg-distributor.client";

@Module({
  imports: [LlmModule],
  providers: [
    KGDistributorClient,
    {
      provide: "KG_DISTRIBUTOR_ENV",
      useFactory: () => loadEnv(),
    },
  ],
  exports: [KGDistributorClient],
})
export class KGDistributorModule {}
