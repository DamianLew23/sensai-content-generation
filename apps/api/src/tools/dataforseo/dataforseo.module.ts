import { Module } from "@nestjs/common";
import { DataForSeoClient } from "./dataforseo.client";
import { loadEnv } from "../../config/env";

@Module({
  providers: [
    {
      provide: DataForSeoClient,
      useFactory: () => new DataForSeoClient(loadEnv()),
    },
  ],
  exports: [DataForSeoClient],
})
export class DataForSeoModule {}
