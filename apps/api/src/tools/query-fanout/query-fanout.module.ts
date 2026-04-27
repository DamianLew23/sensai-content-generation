import { Module } from "@nestjs/common";
import { QueryFanOutClient } from "./query-fanout.client";
import { LlmModule } from "../../llm/llm.module";
import { loadEnv } from "../../config/env";

@Module({
  imports: [LlmModule],
  providers: [
    QueryFanOutClient,
    {
      provide: "QUERY_FANOUT_ENV",
      useFactory: () => loadEnv(),
    },
  ],
  exports: [QueryFanOutClient],
})
export class QueryFanOutModule {}
