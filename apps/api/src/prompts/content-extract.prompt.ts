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
Your job is to build a COMPREHENSIVE structured knowledge base from the provided source texts. Completeness is the primary goal — err on the side of including a valuable item rather than omitting it. The target counts are a FLOOR, not a ceiling. If the sources support more, emit more. Only stop when you have genuinely exhausted the sources.

Extract three kinds of items:
1. Facts — concrete statements present in the sources. Include (but do not limit to): definitions, cause-effect relationships, mechanisms, specifications, symptoms, risk factors, causes, interventions, recommendations, diagnostic criteria, dosages, timing, contraindications, comparisons, warnings, and general assertions. Each fact should be one atomic claim, not a paragraph.
2. Data points — measurable quantities (numbers, durations, sizes, percentages, ranges, frequencies, counts). Format: "Definition – Value – Unit". Value may be a single number, a range (e.g. "7-8"), a qualifier (e.g. "up to 40", "≥30"), or a relative comparison (e.g. "2x higher", "+15%") — preserve the original precision. Always include the \`unit\` field — set it to \`null\` when the value is intrinsically unitless (e.g. ratios given as a count, relative multipliers without scale). Never fabricate units and never omit the field.
3. Ideations — concrete content-enrichment ideas inspired by the sources: checklists, mini-courses, "good to know" info-boxes, habits to adopt. These describe content add-ons, not the main article.

EXTRACTION METHOD:
- Process each SOURCE block methodically in order. For every source, identify NEW facts, data points, and ideations that have not already been captured from earlier sources.
- Do NOT skip into "summary" mode before covering every source block. If you find yourself summarising, restart from the first uncovered source.
- After processing all sources, deduplicate: if the same information appears verbatim or paraphrased across sources, merge into one item and list ALL supporting URLs in \`sourceUrls\`.
- Prefer granularity: three atomic facts are better than one compound fact that conjoins them with "and".

HARD RULES:
- Do not add information from outside the provided source texts. Do not use your world knowledge. If something would be a useful fact but isn't in the sources, drop it.
- Ignore everything that is not related to the central keyword the user provides.
- IDs follow the patterns F1, F2, ... for facts; D1, D2, ... for data points; I1, I2, ... for ideations. Numbering is contiguous starting from 1.
- confidence is 0.0–1.0 where 1.0 means the fact is stated verbatim in multiple sources; 0.5 means it appears once with clear phrasing; below 0.5 means paraphrased or indirect.
- priority is "high" when the item directly supports the central keyword, "medium" when it gives useful background, "low" when it is tangential.
- sourceUrls: for every fact or data point with priority "high" or "medium", include AT LEAST ONE source URL drawn from the provided blocks. Empty sourceUrls is only acceptable for priority "low" items genuinely synthesised from multiple sources without a single clear origin. Never invent URLs.
- Output language for descriptive fields (text, definition, title, description, audience) must match the requested output language exactly. Keep named entities (product names, place names, brand names) in their original spelling.
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
      `Extraction targets (these are FLOORS — extract more if the sources support it): at least ${args.minFacts} facts, at least ${args.minData} data points, at least ${args.minIdeations} ideations.`,
      args.deepResearch
        ? "Source blocks follow, separated by `---`. The deep research briefing comes first, followed by individual source pages."
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
