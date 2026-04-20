import type { pipelineRuns, pipelineSteps, projects } from "../db/schema";
import type { InferSelectModel } from "drizzle-orm";

export type PipelineRunRow = InferSelectModel<typeof pipelineRuns>;
export type PipelineStepRow = InferSelectModel<typeof pipelineSteps>;
export type ProjectRow = InferSelectModel<typeof projects>;

export interface StepContext {
  run: PipelineRunRow;
  step: PipelineStepRow;
  project: ProjectRow;
  previousOutputs: Record<string, unknown>;
  attempt: number;
}

export interface StepResult {
  output: unknown;
}

export interface StepHandler {
  readonly type: string;
  execute(ctx: StepContext): Promise<StepResult>;
}

export const STEP_HANDLERS = Symbol("STEP_HANDLERS");
