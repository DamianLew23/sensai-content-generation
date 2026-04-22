import type { RunInput } from "@sensai/shared";

const PLACEHOLDERS = ["topic", "mainKeyword", "intent", "contentType"] as const;
type Placeholder = (typeof PLACEHOLDERS)[number];

function interpolate(template: string, values: Record<Placeholder, string>): string {
  return PLACEHOLDERS.reduce(
    (acc, key) => acc.replaceAll(`{${key}}`, values[key]),
    template,
  );
}

function defaultPrompt(input: RunInput): string {
  const lines: (string | false | undefined)[] = [
    `Provide a deep research briefing for an article on: ${input.topic}.`,
    input.mainKeyword && `Target keyword: ${input.mainKeyword}.`,
    input.intent && `Search intent: ${input.intent}.`,
    input.contentType && `Content type: ${input.contentType}.`,
    "",
    "Cover: key facts, recent developments (last 12 months), expert perspectives, common misconceptions, concrete data points with source URLs. Be thorough and cite every claim.",
  ];
  return lines.filter(Boolean).join("\n");
}

export const youcomResearchPrompt = {
  user(input: RunInput, override?: string): string {
    if (override) {
      return interpolate(override, {
        topic: input.topic,
        mainKeyword: input.mainKeyword ?? "",
        intent: input.intent ?? "",
        contentType: input.contentType ?? "",
      });
    }
    return defaultPrompt(input);
  },
};
