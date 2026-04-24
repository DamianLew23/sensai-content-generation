import type { ResearchBriefing } from "@sensai/shared";

export interface ExtractionPromptArgs {
  keyword: string;
  language: string;
  cleanedPages: Array<{ url: string; markdown: string }>;
  deepResearch: ResearchBriefing | undefined;
  minFacts: number;
  minData: number;
  minIdeations: number;
}

const SYSTEM = `You are an experienced data analyst and content editor.
Your job is to extract a structured knowledge base from the provided source texts.

Extract three kinds of items:
1. Facts — concrete statements present in the sources: definitions, cause-effect relationships, specifications, general assertions.
2. Data points — measurable quantities (numbers, durations, sizes, percentages). Each data point MUST follow the format "Definition – Value – Unit". Always include the \`unit\` field — set it to \`null\` when the value is intrinsically unitless (e.g. ratios given as a count). Never fabricate units and never omit the field.
3. Ideations — concrete content-enrichment ideas inspired by the sources: checklists, mini-courses, "good to know" info-boxes, habits to adopt. These describe content add-ons, not the main article.

HARD RULES:
- Do not add information from outside the provided source texts. Do not use your world knowledge. If something would be a useful fact but isn't in the sources, drop it.
- Ignore everything that is not related to the central keyword the user provides.
- No duplicates across facts, data and ideations — if the same information appears in multiple sources, emit it once.
- IDs follow the patterns F1, F2, ... for facts; D1, D2, ... for data points; I1, I2, ... for ideations. Numbering is contiguous starting from 1.
- confidence is 0.0–1.0 where 1.0 means the fact is stated verbatim in multiple sources; 0.5 means it appears once with clear phrasing; below 0.5 means paraphrased or indirect.
- priority is "high" when the item directly supports the central keyword, "medium" when it gives useful background, "low" when it is tangential.
- sourceUrls contains only URLs that actually appear in the provided blocks; do not invent URLs. Empty array is acceptable when a fact is synthesised from multiple sources.
- Output language for descriptive fields (text, definition, title, description, audience) must match the requested output language exactly. Keep named entities (product names, place names) in their original spelling.
- Output exactly one JSON object matching the requested schema. No markdown, no commentary, no code fences.`;

function renderSourcesBlock(pages: ExtractionPromptArgs["cleanedPages"]): string {
  if (pages.length === 0) return "(no source pages provided)";
  return pages
    .map((p, i) => `### SOURCE ${i + 1} — ${p.url}\n${p.markdown}`)
    .join("\n\n---\n\n");
}

function renderDeepResearchBlock(dr: ResearchBriefing | undefined): string | null {
  if (!dr) return null;
  const sourceList = dr.sources
    .map((s) => `- ${s.url}${s.title ? ` — ${s.title}` : ""}`)
    .join("\n");
  const body = [
    "### DEEP RESEARCH BRIEFING",
    dr.content,
    sourceList ? `\nSources cited:\n${sourceList}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return body;
}

export const contentExtractPrompt = {
  system: SYSTEM,
  user(args: ExtractionPromptArgs): string {
    const header = [
      `Central keyword: ${args.keyword}`,
      `Output language: ${args.language}`,
      `Emit at minimum ${args.minFacts} facts, minimum ${args.minData} data points, minimum ${args.minIdeations} ideations.`,
      args.deepResearch
        ? "Source blocks follow, separated by `---`. The briefing block comes first, followed by individual source pages."
        : "Source blocks follow, separated by `---`.",
    ].join("\n");

    const deepBlock = renderDeepResearchBlock(args.deepResearch);
    const sourcesBlock = renderSourcesBlock(args.cleanedPages);

    const blocks = [deepBlock, sourcesBlock].filter(
      (b): b is string => b !== null,
    );
    return `${header}\n\n---\n\n${blocks.join("\n\n---\n\n")}`;
  },
};
