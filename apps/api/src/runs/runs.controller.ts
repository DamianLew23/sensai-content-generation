import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { RunsService } from "./runs.service";
import { StartRunDto } from "@sensai/shared";

@Controller("runs")
export class RunsController {
  constructor(private readonly svc: RunsService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  @Get(":id")
  get(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.svc.get(id);
  }

  @Post()
  start(@Body() body: unknown) {
    const dto = StartRunDto.parse(body);
    return this.svc.start(dto);
  }

  @Post(":id/cancel")
  cancel(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.svc.cancel(id);
  }

  @Post(":id/steps/:stepId/resume")
  resume(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("stepId", new ParseUUIDPipe()) stepId: string,
    @Body() body: unknown,
  ) {
    return this.svc.resume(id, stepId, body);
  }

  @Get(":id/steps/:stepId/rerun-preview")
  rerunPreview(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("stepId", new ParseUUIDPipe()) stepId: string,
  ) {
    return this.svc.previewRerun(id, stepId);
  }

  @Post(":id/steps/:stepId/rerun")
  rerun(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("stepId", new ParseUUIDPipe()) stepId: string,
  ) {
    return this.svc.rerun(id, stepId);
  }
}
