import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DB_TOKEN } from "../db/db.module";
import type { Db } from "../db/client";
import { pipelineTemplates } from "../db/schema";
import { TemplateStepsDef } from "@sensai/shared";

@Injectable()
export class TemplatesService {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async list() {
    return this.db
      .select()
      .from(pipelineTemplates)
      .orderBy(pipelineTemplates.name, pipelineTemplates.version);
  }

  async findById(id: string) {
    const [row] = await this.db
      .select()
      .from(pipelineTemplates)
      .where(eq(pipelineTemplates.id, id));
    if (!row) throw new NotFoundException(`Template ${id} not found`);
    return row;
  }

  parseSteps(stepsDef: unknown) {
    return TemplateStepsDef.parse(stepsDef);
  }
}
