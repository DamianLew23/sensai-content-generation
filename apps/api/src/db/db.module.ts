import { Global, Module } from "@nestjs/common";
import { createDb, type Db } from "./client";
import { loadEnv } from "../config/env";

export const DB_TOKEN = Symbol("DB");

@Global()
@Module({
  providers: [
    {
      provide: DB_TOKEN,
      useFactory: () => {
        const env = loadEnv();
        const { db } = createDb(env.DATABASE_URL);
        return db as Db;
      },
    },
  ],
  exports: [DB_TOKEN],
})
export class DbModule {}
