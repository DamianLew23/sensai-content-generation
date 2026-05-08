import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { ProjectsService } from "./projects.service";
import { CreateProjectDto, UpdateProjectDto } from "@sensai/shared";

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

  @Patch(":id")
  update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    const dto = UpdateProjectDto.parse(body);
    return this.svc.update(id, dto);
  }
}
