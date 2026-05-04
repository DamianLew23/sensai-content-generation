import type { ExtractedClaim } from "@sensai/shared";

export interface QuestionsPromptArgs {
  keyword: string;
  claims: ExtractedClaim[];
  language: string;
}

const SYSTEM =
  "You are a research assistant. You produce a JSON dict mapping each claim id to a single, search-engine-ready verification question. " +
  "Output JSON ONLY — no prose, no markdown fences.";

export const dataEnrichQuestionsPrompt = {
  system: SYSTEM,

  user(args: QuestionsPromptArgs): string {
    const lines: string[] = [];
    lines.push(`Article keyword: ${args.keyword}`);
    lines.push(`Article language: ${args.language}`);
    lines.push("");
    lines.push("RULES:");
    lines.push("1. Each question must be CONCRETE and SEARCHABLE — include numbers, doses, norms, or names from the claim.");
    lines.push("2. Each question must carry full context — if the claim is about a dosage, the question MUST name the substance (e.g. from the table headers).");
    lines.push("3. Questions STEER web search — write them as a real searcher would type.");
    lines.push("4. ONE question per claim, written in the article language, max 1-2 sentences.");
    lines.push("");
    lines.push("CLAIMS:");
    for (const c of args.claims) {
      lines.push(`\nCLAIM #${c.id}:`);
      lines.push(`  Section: ${c.h2Context}`);
      lines.push(`  Context: ${c.context.slice(0, 500)}`);
    }
    lines.push("");
    lines.push("OUTPUT (strict JSON, keys are claim ids as strings):");
    lines.push('{ "1": "...", "2": "...", "3": "..." }');
    return lines.join("\n");
  },
};
