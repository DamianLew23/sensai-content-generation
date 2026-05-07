import { SerpResult } from "../tools/dataforseo/serp.types";
import type { ResumeStepDto } from "@sensai/shared";
import type { PipelineRunRow, PipelineStepRow } from "../orchestrator/step-handler";

export class ResumeValidationError extends Error {
  constructor(
    public readonly code:
      | "run_not_awaiting"
      | "step_not_awaiting"
      | "step_out_of_order"
      | "urls_not_in_serp",
    public readonly httpStatus: number,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ResumeValidationError";
  }
}

interface ValidateInput {
  run: PipelineRunRow;
  step: PipelineStepRow;
  prevStepOutput: unknown;
  dto: ResumeStepDto;
}

const SCRAPE_TYPE = "tool.scrape";
const NO_INPUT_TYPES = new Set([
  "tool.topic.disambiguate",
  "tool.youcom.research",
  "tool.serp.fetch",
]);

export function validateResumeRequest(args: ValidateInput): { ok: true } {
  const { run, step, prevStepOutput, dto } = args;

  if (run.status !== "awaiting_approval") {
    throw new ResumeValidationError(
      "run_not_awaiting", 409,
      `Run status is "${run.status}", expected "awaiting_approval"`,
    );
  }

  if (step.status !== "pending" || step.requiresApproval !== true) {
    throw new ResumeValidationError(
      "step_not_awaiting", 409,
      `Step not in pending+requiresApproval state (status=${step.status}, requiresApproval=${step.requiresApproval})`,
    );
  }

  if (step.stepOrder !== run.currentStepOrder) {
    throw new ResumeValidationError(
      "step_out_of_order", 409,
      `Step order ${step.stepOrder} differs from run.currentStepOrder ${run.currentStepOrder}`,
    );
  }

  const stepType = (step as { type?: string }).type;

  if (stepType === SCRAPE_TYPE) {
    return validateScrapeResume(prevStepOutput, dto);
  }

  if (stepType && NO_INPUT_TYPES.has(stepType)) {
    return { ok: true };
  }

  throw new ResumeValidationError(
    "step_not_awaiting", 400,
    `Unsupported step type for resume: "${stepType ?? "<missing>"}"`,
  );
}

function validateScrapeResume(prevStepOutput: unknown, dto: ResumeStepDto): { ok: true } {
  const parsed = SerpResult.safeParse(prevStepOutput);
  if (!parsed.success) {
    throw new ResumeValidationError(
      "urls_not_in_serp", 400,
      "Previous step output is not a SerpResult — cannot validate URLs",
    );
  }
  if (!dto.input || !dto.input.urls) {
    throw new ResumeValidationError(
      "urls_not_in_serp", 400,
      "Scrape resume requires input.urls",
    );
  }
  const allowed = new Set(parsed.data.items.map((i) => i.url));
  const seen = new Set<string>();
  const invalid: string[] = [];
  for (const u of dto.input.urls) {
    if (seen.has(u)) {
      invalid.push(u);
      continue;
    }
    seen.add(u);
    if (!allowed.has(u)) invalid.push(u);
  }
  if (invalid.length > 0) {
    throw new ResumeValidationError(
      "urls_not_in_serp", 400,
      "One or more URLs are not in the previous SERP output (or are duplicates)",
      { invalid },
    );
  }
  return { ok: true };
}
