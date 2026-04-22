import { Module } from "@nestjs/common";
import { Crawl4aiClient } from "./crawl4ai.client";
import { loadEnv } from "../../config/env";

@Module({
  providers: [
    {
      provide: Crawl4aiClient,
      useFactory: () => new Crawl4aiClient(loadEnv()),
    },
  ],
  exports: [Crawl4aiClient],
})
export class Crawl4aiModule {}
