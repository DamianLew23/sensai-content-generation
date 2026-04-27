export const QUEUE_NAME = "pipeline-steps";

export interface StepJobData {
  runId: string;
  stepId: string;
  forceRefresh?: boolean;
}
