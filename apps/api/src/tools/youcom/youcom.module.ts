import { Module } from "@nestjs/common";
import { YoucomClient } from "./youcom.client";
import { loadEnv } from "../../config/env";

@Module({
  providers: [
    {
      provide: YoucomClient,
      useFactory: () => new YoucomClient(loadEnv()),
    },
  ],
  exports: [YoucomClient],
})
export class YoucomModule {}
