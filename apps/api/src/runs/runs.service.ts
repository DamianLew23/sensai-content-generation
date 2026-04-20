import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { desc, eq } from "drizzle-orm";
import { DB_TOKEN } from "../db/db.module";
import type { Db } from "../db/client";
import { pipelineRuns, pipelineSteps } from "../db/schema";
import { ProjectsService } from "../projects/projects.service";
import { TemplatesService } from "../templates/templates.service";
import { OrchestratorService } from "../orchestrator/orchestrator.service";
import { StartRunDto } from "@sensai/shared";

@Injectable()
export class RunsService {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly projects: ProjectsService,
    private readonly templates: TemplatesService,
    private readonly orchestrator: OrchestratorService,
  ) {}

  async list() {
    return this.db.select().from(pipelineRuns).orderBy(desc(pipelineRuns.createdAt)).limit(50);
  }

  async get(id: string) {
    const [run] = await this.db.select().from(pipelineRuns).where(eq(pipelineRuns.id, id));
    if (!run) throw new NotFoundException(`Run ${id} not found`);
    const steps = await this.db
      .select()
      .from(pipelineSteps)
      .where(eq(pipelineSteps.runId, id))
      .orderBy(pipelineSteps.stepOrder);
    return { ...run, steps };
  }

  async start(dto: StartRunDto) {
    const parsed = StartRunDto.parse(dto);
    const project = await this.projects.findById(parsed.projectId);
    const template = await this.templates.findById(parsed.templateId);
    const stepsDef = this.templates.parseSteps(template.stepsDef);

    const [run] = await this.db
      .insert(pipelineRuns)
      .values({
        projectId: project.id,
        templateId: template.id,
        templateVersion: template.version,
        input: parsed.input,
        status: "pending",
        currentStepOrder: 1,
      })
      .returning();

    const stepRows = stepsDef.steps.map((s, idx) => ({
      runId: run.id,
      stepKey: s.key,
      stepOrder: idx + 1,
      type: s.type,
      requiresApproval: !s.auto,
      status: "pending" as const,
    }));
    const insertedSteps = await this.db.insert(pipelineSteps).values(stepRows).returning();

    const firstStep = insertedSteps.find((s) => s.stepOrder === 1);
    if (!firstStep) throw new Error("no first step created");
    await this.orchestrator.enqueueStep(run.id, firstStep.id);

    return { ...run, steps: insertedSteps };
  }
}
