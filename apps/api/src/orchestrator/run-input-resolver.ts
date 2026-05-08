import { DisambiguateOutput, type RunInput } from "@sensai/shared";

/**
 * Canonical step key under which the disambiguator stores its output.
 *
 * NOTE: this is a project-wide convention. Templates that wire in the
 * `tool.topic.disambiguate` step MUST use this exact stepKey, otherwise the
 * resolver below will not pick up the refined topic and the entire downstream
 * chain regresses to the raw user input. See defensive scan in
 * `getDisambiguateOutput` which warns when a misnamed step is detected at
 * runtime.
 */
const EXPECTED_STEP_KEY = "disambiguate";

export function getDisambiguateOutput(
  previousOutputs: Record<string, unknown>,
): DisambiguateOutput | null {
  const direct = previousOutputs[EXPECTED_STEP_KEY];
  if (direct !== undefined && direct !== null) {
    const parsed = DisambiguateOutput.safeParse(direct);
    if (parsed.success) return parsed.data;
  }
  // Defensive: warn if a step under a different key produced a valid
  // DisambiguateOutput. This makes a misnamed step visible during development
  // without changing functional behavior.
  for (const [key, value] of Object.entries(previousOutputs)) {
    if (key === EXPECTED_STEP_KEY) continue;
    if (value === undefined || value === null) continue;
    const parsed = DisambiguateOutput.safeParse(value);
    if (parsed.success) {
      // eslint-disable-next-line no-console
      console.warn(
        `[run-input-resolver] DisambiguateOutput found under step key "${key}", expected "${EXPECTED_STEP_KEY}". ` +
          `Resolver will not consume it. Use stepKey "${EXPECTED_STEP_KEY}" in your template.`,
      );
      return null;
    }
  }
  return null;
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
