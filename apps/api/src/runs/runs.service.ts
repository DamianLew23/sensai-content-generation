import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { DB_TOKEN } from "../db/db.module";
import type { Db } from "../db/client";
import { pipelineRuns, pipelineSteps, pipelineTemplates } from "../db/schema";
import { ProjectsService } from "../projects/projects.service";
import { TemplatesService } from "../templates/templates.service";
import { OrchestratorService } from "../orchestrator/orchestrator.service";
import { ResumeStepDto, StartRunDto, TemplateStepsDef, type RerunPreview } from "@sensai/shared";
import { validateResumeRequest, ResumeValidationError } from "./resume-validation";
import { computeRerunCascade } from "./rerun-cascade";
import { validateRerunRequest, RerunValidationError } from "./rerun-validation";

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

  async resume(runId: string, stepId: string, dto: unknown) {
    const parsed = ResumeStepDto.parse(dto);

    const [run] = await this.db.select().from(pipelineRuns).where(eq(pipelineRuns.id, runId));
    if (!run) throw new NotFoundException(`Run ${runId} not found`);

    const [step] = await this.db
      .select()
      .from(pipelineSteps)
      .where(and(eq(pipelineSteps.id, stepId), eq(pipelineSteps.runId, runId)));
    if (!step) throw new NotFoundException(`Step ${stepId} not found in run ${runId}`);

    const [prevStep] = await this.db
      .select()
      .from(pipelineSteps)
      .where(and(eq(pipelineSteps.runId, runId), eq(pipelineSteps.stepOrder, step.stepOrder - 1)));
    const prevStepOutput = prevStep?.output ?? null;

    try {
      validateResumeRequest({ run, step, prevStepOutput, dto: parsed });
    } catch (err) {
      if (err instanceof ResumeValidationError) {
        if (err.httpStatus === 409) throw new ConflictException({ code: err.code, message: err.message });
        if (err.httpStatus === 400) throw new BadRequestException({ code: err.code, message: err.message, ...(err.details ?? {}) });
      }
      throw err;
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(pipelineSteps)
        .set({ input: parsed.input })
        .where(eq(pipelineSteps.id, stepId));
      await tx
        .update(pipelineRuns)
        .set({ status: "running" })
        .where(eq(pipelineRuns.id, runId));
    });

    await this.orchestrator.enqueueStep(runId, stepId);

    return this.get(runId);
  }

  async previewRerun(runId: string, stepId: string): Promise<RerunPreview> {
    const { run, step } = await this.loadRunAndStep(runId, stepId);
    this.assertRerunnable(run, step);

    const [template] = await this.db
      .select()
      .from(pipelineTemplates)
      .where(eq(pipelineTemplates.id, run.templateId));
    if (!template) throw new NotFoundException(`Template for run ${runId} not found`);

    const stepsDef = TemplateStepsDef.parse(template.stepsDef);
    return computeRerunCascade(stepsDef.steps, step.stepKey);
  }

  private async loadRunAndStep(runId: string, stepId: string) {
    const [run] = await this.db.select().from(pipelineRuns).where(eq(pipelineRuns.id, runId));
    if (!run) throw new NotFoundException(`Run ${runId} not found`);
    const [step] = await this.db
      .select()
      .from(pipelineSteps)
      .where(and(eq(pipelineSteps.id, stepId), eq(pipelineSteps.runId, runId)));
    if (!step) throw new NotFoundException(`Step ${stepId} not found in run ${runId}`);
    return { run, step };
  }

  private assertRerunnable(run: any, step: any) {
    try {
      validateRerunRequest({ run, step });
    } catch (err) {
      if (err instanceof RerunValidationError) {
        if (err.httpStatus === 404) throw new NotFoundException({ code: err.code, message: err.message });
        throw new ConflictException({ code: err.code, message: err.message });
      }
      throw err;
    }
  }
}
