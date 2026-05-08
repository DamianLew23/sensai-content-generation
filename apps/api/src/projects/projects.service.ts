import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DB_TOKEN } from "../db/db.module";
import type { Db } from "../db/client";
import { projects } from "../db/schema";
import type { CreateProjectDto, UpdateProjectDto } from "@sensai/shared";

@Injectable()
export class ProjectsService {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async list() {
    return this.db.select().from(projects).orderBy(projects.name);
  }

  async findById(id: string) {
    const [row] = await this.db.select().from(projects).where(eq(projects.id, id));
    if (!row) throw new NotFoundException(`Project ${id} not found`);
    return row;
  }

  async create(dto: CreateProjectDto) {
    const [existing] = await this.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.slug, dto.slug));
    if (existing) {
      throw new ConflictException(`Project with slug "${dto.slug}" already exists`);
    }
    const [row] = await this.db
      .insert(projects)
      .values({ slug: dto.slug, name: dto.name, config: dto.config })
      .returning();
    return row;
  }

  async update(id: string, dto: UpdateProjectDto) {
    const patch: { name?: string; config?: unknown } = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.config !== undefined) patch.config = dto.config;
    const [row] = await this.db
      .update(projects)
      .set(patch)
      .where(eq(projects.id, id))
      .returning();
    if (!row) throw new NotFoundException(`Project ${id} not found`);
    return row;
  }
}
