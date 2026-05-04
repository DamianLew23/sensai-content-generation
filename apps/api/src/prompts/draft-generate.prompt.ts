import type { EnrichedSection, PassageFormat } from "../tools/draft-generator/draft-generator.types";

interface BuildArgs {
  blockNumber: number;          // 1-indexed
  currentSectionIndex: number;  // 0-indexed across all sections
  allSections: EnrichedSection[];
  block: EnrichedSection;
  keyword: string;
  h1Title: string;
  language: string;             // "pl" | "en" | ...
}

const LANG_NAMES: Record<string, string> = {
  pl: "Polish",
  en: "English",
  de: "German",
  fr: "French",
};

const PASSAGE_BLUEPRINT = `### PASSAGE BLUEPRINT (5 elements — apply to EVERY H2 and H3)
Each passage MUST contain these 5 elements IN THIS ORDER:

1. CONTEXT SENTENCE (1-2 sentences)
   → Name the MAIN ENTITY in the first sentence
   → Establish: who/what/for whom/when
   → This sentence should work as a standalone answer

2. CORE EXPLANATION (3-5 sentences)
   → The main content — explanation, steps, analysis
   → Short sentences, active voice, clear transitions
   → One topic per paragraph, zero digressions

3. SUPPORTING EVIDENCE (1 element)
   → A specific statistic with number OR
   → A concrete fact from the provided data OR
   → A comparison with a named alternative

4. IDEATION CONTENT (if provided)
   → Generate tables as HTML <table>
   → Generate checklists as HTML <ul>
   → Follow the format instruction from Ideations field

5. MICRO-SUMMARY (1 sentence)
   → Restate the key point in simple language
   → ONLY for FULL sections (skip for CONTEXT sections)`;

const QUALITY_RULES = `### BLUF — BOTTOM LINE UP FRONT
The CONTEXT SENTENCE IS the BLUF. It answers the heading's question IMMEDIATELY.
FORBIDDEN: Building up to a conclusion. State conclusion FIRST.

### NO FILLER
TEST: Delete the sentence. Did the text lose information? NO → it's filler.
EVERY sentence must contain: specific fact, number, comparison, example, or actionable step.
FORBIDDEN: "It's worth noting...", "Let's take a closer look...", "In this section we will discuss..."

### NO DUPLICATE
Each fact appears EXACTLY ONCE in the entire article.
CRITICAL: See the FULL ARTICLE OUTLINE below — it shows which facts belong to OTHER sections.
INSTEAD OF REPEATING: use back-reference ("the mechanism described above...") or skip entirely.

### H2/H3 HIERARCHY
H2 = comprehensive overview (FULL: 3-5 paragraphs, CONTEXT: 1-2 paragraphs)
H3 = direct answer + NEW angle (1-2 paragraphs). NEVER restates H2 content.`;

const ENTITY_RULES = `### ENTITY CLARITY RULES
1. Name the main entity in the FIRST sentence of each section.
2. When first defining an entity: [Entity name] + [what it is] + [one distinguishing attribute].
3. After first definition: use just the name, never re-explain.
4. NEVER replace entity names with pronouns in first 2 sentences.
5. Use at least 2 anchoring types per passage:
   - Feature anchor: [Entity] + [measurable attribute]
   - Comparative anchor: [Entity A] vs [Entity B]
   - Situational anchor: [Entity] + [target group]
   - Temporal anchor: [Entity] + [time/version/year]
   - Causal anchor: [Entity] + [cause] + [effect]`;

const FORMATTING_RULES = `### FORMATTING RULES
1) Output: <h2>, <h3>, <p>, <table>, <ul>/<li> only. NO <h1>.
2) Paragraphs: MAX 3-4 sentences per <p> tag.
3) Tables for comparisons; <ul>/<li> for 3+ items with attributes.
4) Active voice. Subject + Verb + Object + Context.
5) Professional voice, no marketing language.
6) NO abstract openings.`;

const ERROR_AVOIDANCE = `### ERROR AVOIDANCE
1) NO Wall of Words: Every section MUST have visual breaks (paragraphs, lists, tables).
2) NO Muddled Meaning: One topic per paragraph.
3) NO Vanilla Entity: NEVER say "this supplement" — always use the entity NAME.
4) NO Over-Stylized Writing: No metaphors without subject. No sentences >25 words.`;

export const draftGeneratePrompt = {
  system:
    "You are a senior SEO content writer. You produce HTML article drafts using the PASSAGE BLUEPRINT discipline. " +
    "You output HTML fragments only (no <html>, <body>, no <h1>). You never apologize, never preface. You write directly.",

  user(args: BuildArgs): string {
    const language = LANG_NAMES[args.language] ?? "English";
    const sectionsInfo = renderSection(args.block);
    const outline = renderOutline(args.allSections, args.currentSectionIndex);
    const bridge = args.blockNumber > 1 ? bridgeInstruction() : "";

    return [
      `Write block ${args.blockNumber} of article about: ${args.keyword}`,
      `Article title: ${args.h1Title}`,
      "",
      PASSAGE_BLUEPRINT,
      "",
      QUALITY_RULES,
      "",
      ENTITY_RULES,
      "",
      FORMATTING_RULES,
      bridge,
      ERROR_AVOIDANCE,
      "",
      "DATA USAGE:",
      "- FACTS: incorporate ALL provided facts. Each appears ONCE in the entire article.",
      "- ENTITIES: define ONCE at first mention. Later = name only.",
      "- RELATIONSHIPS: show as causal/comparative anchors in text.",
      "- IDEATIONS: generate as HTML (tables, checklists). Follow format instructions.",
      "- PASSAGE FORMAT: follow the format assigned to each section header.",
      "",
      outline,
      "",
      "SECTIONS TO WRITE NOW:",
      sectionsInfo,
      "",
      `Write in ${language}.`,
      "Apply PASSAGE BLUEPRINT to every section.",
      "Follow PASSAGE FORMAT instructions per section.",
      "Name entities in first sentence. Use ALL facts. NO FILLER. NO DUPLICATES.",
    ].join("\n");
  },
};

function bridgeInstruction(): string {
  return `\n### BRIDGE SENTENCES (optional, max 1 per block)
If an entity defined earlier in another section also fits this section, you MAY reference it with a 1-sentence bridge:
- "The previously mentioned [entity] also plays a role in..."
DO NOT redefine the entity. Skip the bridge if no earlier entity fits.\n`;
}

function describePassage(pf: PassageFormat | undefined): string {
  if (!pf) return "";
  return `\n   📋 PASSAGE FORMAT: ${pf.format}\n   📋 PASSAGE RULES: ${pf.rules}`;
}

function renderSection(s: EnrichedSection): string {
  if (s.type === "intro") {
    return `SECTION (intro): write a 1-2 paragraph introduction.${describePassage(s._passageFormat)}\n   Entities, facts, and ideations attached: see distribution payload.\n---`;
  }

  const tag = "h2";
  const header = s.header ?? "Section";
  const variantNote =
    s.sectionVariant === "context"
      ? `\n   ⚠️ CONTEXT SECTION (keep brief, 1-2 paragraphs)${
          (s as any).contextNote ? `: ${(s as any).contextNote}` : ""
        }`
      : "";

  const entities = s.entities.slice(0, 6).map((e: any) => {
    const desc = (e.evidence ?? "").slice(0, 60);
    return desc ? `${e.entity} (${desc})` : e.entity;
  });
  const entitiesStr = entities.join("; ") || "None";

  const facts = (s.facts ?? []).slice(0, 6).map((f: any) => f.text.slice(0, 100));
  const factsStr = facts.length ? `\n      • ${facts.join("\n      • ")}` : "None";

  const rels = (s.relationships ?? []).slice(0, 4).map((r: any) => `${r.sourceName} → ${r.targetName} (${r.type})`);
  const relsStr = rels.join("; ") || "None";

  const ideations = (s._inlineIdeations ?? []).slice(0, 3).map((i) => i.formatInstruction);
  const ideationsStr = ideations.length ? `\n      • ${ideations.join("\n      • ")}` : "None";

  const h3Block = (s._h3sEnriched ?? [])
    .map(
      (h) =>
        `\n   H3: <h3>${h.header}</h3> → FORMAT: ${h.passageFormat.format}`,
    )
    .join("");

  return [
    `SECTION: <${tag}>${header}</${tag}>${h3Block}${describePassage(s._passageFormat)}${variantNote}`,
    `   Entities: ${entitiesStr}`,
    `   Facts:${factsStr === "None" ? " None" : factsStr}`,
    `   Relationships: ${relsStr}`,
    `   Ideations (generate as HTML):${ideationsStr === "None" ? " None" : ideationsStr}`,
    "---",
  ].join("\n");
}

function renderOutline(all: EnrichedSection[], currentIndex: number): string {
  const lines = [
    "FULL ARTICLE OUTLINE (for context — do NOT duplicate info from other sections):",
  ];
  for (let i = 0; i < all.length; i++) {
    const s = all[i];
    const header = s.header ?? "Introduction";
    const marker = i === currentIndex ? "→ CURRENT SECTION (write this one)" : "(other section — do not repeat its content)";
    lines.push(`  [${s.type}] ${header} ${marker}`);
  }
  return lines.join("\n");
}
