import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { DbModule } from "./db/db.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV === "development"
            ? { target: "pino-pretty", options: { colorize: true, singleLine: true } }
            : undefined,
        level: process.env.LOG_LEVEL ?? "info",
      },
    }),
    DbModule,
  ],
})
export class AppModule {}
