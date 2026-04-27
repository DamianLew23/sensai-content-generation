export interface QueryFanOutCallContext {
  runId: string;
  stepId: string;
  attempt: number;
}

export interface QueryFanOutCallStats {
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: string;
  latencyMs: number;
}
