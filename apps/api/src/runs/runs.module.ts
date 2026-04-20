import { Module } from "@nestjs/common";
import { RunsController } from "./runs.controller";
import { RunsService } from "./runs.service";
import { ProjectsModule } from "../projects/projects.module";
import { TemplatesModule } from "../templates/templates.module";
import { OrchestratorModule } from "../orchestrator/orchestrator.module";

@Module({
  imports: [ProjectsModule, TemplatesModule, OrchestratorModule],
  controllers: [RunsController],
  providers: [RunsService],
})
export class RunsModule {}
