import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { ProjectsService } from "./projects.service";
import { CreateProjectDto } from "@sensai/shared";

@Controller("projects")
export class ProjectsController {
  constructor(private readonly svc: ProjectsService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  @Get(":id")
  get(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.svc.findById(id);
  }

  @Post()
  create(@Body() body: unknown) {
    const dto = CreateProjectDto.parse(body);
    return this.svc.create(dto);
  }
}
