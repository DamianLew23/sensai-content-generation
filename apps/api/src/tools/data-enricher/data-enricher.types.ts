import type { ClaimType } from "@sensai/shared";

export type CategoryPattern = {
  type: ClaimType;
  weight: number;
  re: RegExp;
};

export interface ExtractCallCtx {
  runId: string;
  stepId: string;
  attempt: number;
}
