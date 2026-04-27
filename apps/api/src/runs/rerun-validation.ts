import type { PipelineRunRow, PipelineStepRow } from "../orchestrator/step-handler";

export class RerunValidationError extends Error {
  constructor(
    public readonly code: "step_not_in_run" | "step_not_rerunnable" | "run_cancelled",
    public readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = "RerunValidationError";
  }
}

interface ValidateInput {
  run: PipelineRunRow;
  step: PipelineStepRow;
}

export function validateRerunRequest(args: ValidateInput): { ok: true } {
  const { run, step } = args;

  if (step.runId !== run.id) {
    throw new RerunValidationError(
      "step_not_in_run", 404,
      `Step ${step.id} does not belong to run ${run.id}`,
    );
  }

  if (run.status === "cancelled") {
    throw new RerunValidationError(
      "run_cancelled", 409,
      "Cannot re-run a step of a cancelled run",
    );
  }

  if (step.status !== "completed" && step.status !== "failed") {
    throw new RerunValidationError(
      "step_not_rerunnable", 409,
      `Step status must be "completed" or "failed" (got "${step.status}")`,
    );
  }

  return { ok: true };
}
