import type { Env } from "../../config/env";
import type { ResearchEffort } from "@sensai/shared";

export type { ResearchEffort };

export interface YoucomResearchRequest {
  input: string;
  research_effort: ResearchEffort;
}

export interface YoucomResearchSource {
  url: string;
  title?: string;
  snippets?: string[];
}

export interface YoucomResearchResponse {
  output: {
    content: string;
    content_type: "text";
    sources: YoucomResearchSource[];
  };
}

export type YoucomEnv = Pick<
  Env,
  | "YOUCOM_API_KEY"
  | "YOUCOM_BASE_URL"
  | "YOUCOM_TIMEOUT_MS"
  | "YOUCOM_COST_LITE"
  | "YOUCOM_COST_STANDARD"
  | "YOUCOM_COST_DEEP"
  | "YOUCOM_COST_EXHAUSTIVE"
>;

export function youcomCostUsd(env: YoucomEnv, effort: ResearchEffort): string {
  const lookup: Record<ResearchEffort, number> = {
    lite: env.YOUCOM_COST_LITE,
    standard: env.YOUCOM_COST_STANDARD,
    deep: env.YOUCOM_COST_DEEP,
    exhaustive: env.YOUCOM_COST_EXHAUSTIVE,
  };
  return lookup[effort].toString();
}
