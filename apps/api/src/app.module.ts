import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { DbModule } from "./db/db.module";
import { ProjectsModule } from "./projects/projects.module";
import { TemplatesModule } from "./templates/templates.module";
import { LlmModule } from "./llm/llm.module";
import { ToolsModule } from "./tools/tools.module";
import { OrchestratorModule } from "./orchestrator/orchestrator.module";
import { RunsModule } from "./runs/runs.module";

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
        autoLogging: {
          ignore: (req) => {
            const url = req.url ?? "";
            return req.method === "GET" && /^\/runs\/[^/]+$/.test(url.split("?")[0]);
          },
        },
      },
    }),
    DbModule,
    ProjectsModule,
    TemplatesModule,
    LlmModule,
    ToolsModule,
    OrchestratorModule,
    RunsModule,
  ],
})
export class AppModule {}
