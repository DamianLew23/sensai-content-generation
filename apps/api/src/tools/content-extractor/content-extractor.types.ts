import type { LlmCallContext } from "../../llm/llm.client";

export type ExtractCallContext = Omit<LlmCallContext, "model">;
