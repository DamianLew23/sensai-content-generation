export class CostLimitExceededError extends Error {
  readonly code = "cost_limit_exceeded";
  constructor(public readonly runId: string, public readonly capUsd: number, public readonly currentUsd: number) {
    super(`Run ${runId} exceeded cost cap $${capUsd.toFixed(4)} (current: $${currentUsd.toFixed(4)})`);
    this.name = "CostLimitExceededError";
  }
}
