import type { LlmCallContext } from "../../llm/llm.client";

export type EntityExtractCallContext = Omit<LlmCallContext, "model">;
