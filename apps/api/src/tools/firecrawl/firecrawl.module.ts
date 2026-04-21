import { Module } from "@nestjs/common";
import { FirecrawlClient } from "./firecrawl.client";
import { loadEnv } from "../../config/env";

@Module({
  providers: [
    {
      provide: FirecrawlClient,
      useFactory: () => new FirecrawlClient(loadEnv()),
    },
  ],
  exports: [FirecrawlClient],
})
export class FirecrawlModule {}
