import type { ResearchBriefing } from "@sensai/shared";

export interface EntityExtractPromptArgs {
  keyword: string;
  language: string;
  cleanedPages: Array<{ url: string; markdown: string }>;
  deepResearch: ResearchBriefing | undefined;
  minEntities: number;
  minRelations: number;
}

const SYSTEM = `You are a semantic data analyst performing text-grounded information extraction.
Convert the provided source texts into a structured set of entities, relationships and per-entity relevance scores against the user's central keyword.

ALLOWED ENTITY TYPES (domainType):
PERSON, ORGANIZATION, LOCATION, PRODUCT, CONCEPT, EVENT

ALLOWED RELATION TYPES (type):
PART_OF, LOCATED_IN, CREATED_BY, WORKS_FOR, RELATED_TO, HAS_FEATURE, SOLVES, COMPETES_WITH, CONNECTED_TO, USED_BY, REQUIRES

HARD RULES:
- Extract ONLY entities explicitly mentioned in the provided texts. DO NOT invent or infer entities from world knowledge — text-grounding is non-negotiable.
- Extract relationships ONLY when clearly stated or strongly implied by the text. If unsure, drop the relationship.
- Entity ids follow the pattern E1, E2, E3, ... contiguous starting from 1, unique within the response.
- Relationships use entity ids in source/target — never raw entity names. Both ids MUST exist in the entities array. No self-edges (source !== target).
- relationToMain MUST contain one entry for every entity id you emit (exactly one per id). score is an integer 1–100 reflecting relevance to the central keyword (100 = the keyword itself or its tightest synonym; 50 = clearly related background; 1 = tangential mention).
- evidence is a short verbatim or near-verbatim quote fragment from the source text (max ~20 words). It anchors the claim.
- domainType: if no allowed type fits, use CONCEPT. Never use OTHER, MISC, or any value outside the enum.
- entity field: shortest clear surface form (e.g. "CD Projekt" not "polska firma deweloperska CD Projekt SA z siedzibą w Warszawie"). Preserve original casing. originalSurface keeps the exact substring as it appears in the text.
- Output descriptive fields (description, rationale, evidence, contextAnalysis.*) MUST be in the requested output language. Keep entity proper names in their original spelling.
- contextAnalysis.mainTopicInterpretation explains how the central keyword was understood; domainSummary describes the topical domain in one or two sentences.
- Output exactly one JSON object matching the requested schema. No markdown, no commentary, no code fences. The metadata field at the top will be populated by the calling system — leave it as a placeholder object with empty strings and 0; the system overwrites it.`;

function renderSourcesBlock(pages: EntityExtractPromptArgs["cleanedPages"]): string {
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

export const entityExtractPrompt = {
  system: SYSTEM,
  user(args: EntityExtractPromptArgs): string {
    const headerLines = [
      `Central keyword: ${args.keyword}`,
      `Output language: ${args.language}`,
      `Emit at minimum ${args.minEntities} entities and at minimum ${args.minRelations} relationships.`,
      "Source blocks follow, separated by `---`.",
    ];
    if (args.deepResearch) {
      headerLines.push("A research briefing block precedes the source pages.");
    }
    const header = headerLines.join("\n");

    const deepBlock = renderDeepResearchBlock(args.deepResearch);
    const sourcesBlock = renderSourcesBlock(args.cleanedPages);

    const blocks = [deepBlock, sourcesBlock].filter(
      (b): b is string => b !== null,
    );
    return `${header}\n\n---\n\n${blocks.join("\n\n---\n\n")}`;
  },
};
