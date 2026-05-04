import type {
  DistributionResult,
  PassageTrigger,
  DraftImagePrompt,
} from "@sensai/shared";

export interface PassageFormat {
  trigger: PassageTrigger;
  format: string;
  rules: string;
  matchedBy: "header_pattern" | "source_intent" | "default";
}

// Section taken from DistributionResult.sections[N], augmented with deterministic
// pre-processing artefacts. We keep the original shape readable by Zod schemas
// and only add fields prefixed with `_` for clarity.
export type EnrichedSection = DistributionResult["sections"][number] & {
  _passageFormat: PassageFormat;
  _h3sEnriched: Array<{
    header: string;
    passageFormat: PassageFormat;
  }>;
  _inlineIdeations: Array<{
    type: string;
    description: string;
    formatInstruction: string;
  }>;
  _externalIdeations: DraftImagePrompt[];
};
