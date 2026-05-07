import { DisambiguateOutput, type RunInput } from "@sensai/shared";

const DISAMBIGUATE_STEP_KEY = "disambiguate";

export function getDisambiguateOutput(
  previousOutputs: Record<string, unknown>,
): DisambiguateOutput | null {
  const candidate = previousOutputs[DISAMBIGUATE_STEP_KEY];
  if (candidate === undefined || candidate === null) return null;
  const parsed = DisambiguateOutput.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export function getResolvedRunInput(
  input: RunInput,
  previousOutputs: Record<string, unknown>,
): RunInput {
  const dis = getDisambiguateOutput(previousOutputs);
  if (!dis) return input;
  return {
    ...input,
    topic: dis.refinedTopic,
    mainKeyword: dis.mainKeyword,
    intent: dis.intent,
    contentType: dis.contentType,
  };
}
