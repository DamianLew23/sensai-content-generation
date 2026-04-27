// Simple static pricing table — per 1M tokens (USD). Update manually.
// Source of truth is OpenRouter /models endpoint; we'll sync this later.
export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  "openai/gpt-5-mini": { inputPer1M: 0.25, outputPer1M: 2.0 },
  "openai/gpt-5.4": { inputPer1M: 2.5, outputPer1M: 10.0 },
  "anthropic/claude-sonnet-4.6": { inputPer1M: 3.0, outputPer1M: 15.0 },
  "anthropic/claude-haiku-4.5": { inputPer1M: 0.25, outputPer1M: 1.25 },
  "google/gemini-2.5-flash": { inputPer1M: 0.075, outputPer1M: 0.3 },
  "google/gemini-3-flash-preview": { inputPer1M: 0.3, outputPer1M: 2.5 },
};

export function calculateCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): string {
  const p = MODEL_PRICING[model];
  if (!p) return "0"; // unknown model — cost unknown, don't block
  const cost =
    (promptTokens / 1_000_000) * p.inputPer1M +
    (completionTokens / 1_000_000) * p.outputPer1M;
  return cost.toFixed(8);
}
