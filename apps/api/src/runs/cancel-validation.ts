import type { PipelineRunRow } from "../orchestrator/step-handler";

export class CancelValidationError extends Error {
  constructor(
    public readonly code: "already_cancelled" | "already_finished",
    public readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = "CancelValidationError";
  }
}

export function validateCancelRequest(run: PipelineRunRow): { ok: true } {
  if (run.status === "cancelled") {
    throw new CancelValidationError(
      "already_cancelled",
      409,
      `Run ${run.id} is already cancelled`,
    );
  }
  if (run.status === "completed" || run.status === "failed") {
    throw new CancelValidationError(
      "already_finished",
      409,
      `Cannot cancel run with status "${run.status}"`,
    );
  }
  return { ok: true };
}
