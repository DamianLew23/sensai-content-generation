import { z } from "zod";
import { IntentName, H3Format } from "@sensai/shared";

// Internal — what the LLM returns. Simpler than the public OutlineSection.
// Postprocessing adds order/type/sectionVariant deterministically.

export const LLMFullSection = z.object({
  sourceArea: z.string().min(1),
  header: z.string().min(1).max(200),
  h3s: z.array(z.object({
    header: z.string().min(1).max(200),
    format: H3Format,
    sourcePaa: z.string().min(1),
  })),
});

export const LLMContextSection = z.object({
  sourceIntent: IntentName,
  header: z.string().min(1).max(200),
  groupedAreas: z.string().array().min(1),
  contextNote: z.string().min(1).max(500),
});

export const LLMOutlineCallResult = z.object({
  h1Title: z.string().min(1).max(300),
  fullSections: LLMFullSection.array(),
  contextSections: LLMContextSection.array(),
});

export type LLMFullSection = z.infer<typeof LLMFullSection>;
export type LLMContextSection = z.infer<typeof LLMContextSection>;
export type LLMOutlineCallResult = z.infer<typeof LLMOutlineCallResult>;

// Preprocess output — what the handler passes to the LLM client.
export interface PreprocessedFanout {
  primaryIntent: import("@sensai/shared").IntentName;
  primaryIntentSource: "user" | "fanout";
  primaryAreas: PreprocessedArea[];
  secondaryAreasByIntent: Map<import("@sensai/shared").IntentName, PreprocessedArea[]>;
  preprocessWarnings: import("@sensai/shared").OutlineGenWarning[];
}

export interface PreprocessedArea {
  id: string;          // A1, A2, ... from fanout
  topic: string;
  question: string;
  intent: import("@sensai/shared").IntentName;
  paaQuestions: string[];
}
