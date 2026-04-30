import type { IntentName } from "@sensai/shared";

export interface OutlineGenerateUserArgs {
  keyword: string;
  userH1Title: string | undefined;
  language: string;
  primaryIntent: IntentName;
  primaryAreasJson: string;       // JSON-serialized PreprocessedArea[]
  secondaryAreasByIntentJson: string;  // JSON-serialized { [intent]: PreprocessedArea[] }
}

const system = `You are an expert in semantic article architecture. You build BLUF-sorted article outlines from query fan-out data.

# CORE PRINCIPLE: PRIMARY INTENT vs CONTEXT

The article must answer the user's PRIMARY INTENT. Other intents are supporting context only.

## Primary intent areas → FULL sections
- Each area = one full H2
- Each PAA question for that area = one H3 (decide format below)
- Engaging header (not a literal copy of the area name)

## Other intent areas → grouped CONTEXT sections
- Group ALL areas of the same secondary intent into ONE H2
- The H2 header summarizes the group in the context of the main topic
- NO H3s — only contextNote describing what to mention briefly
- Goal: provide context, not exhaust the topic

# RULES

## Rule 1: Primary intent areas → full sections
Each primary area gets its own full H2 + all PAA as H3s.

## Rule 2: Each non-primary intent → ONE grouped context section
Combine all areas of that intent into a single H2 with no H3s.
Fill groupedAreas[] with the original area topics.
Fill contextNote with a brief description of what to cover.

## Rule 3: H3 format decision (full sections only)
For each PAA, decide:
- USE AS-IS (format: "question") — when the PAA is a clear, specific question that works as a header.
- CONVERT TO CONTEXT (format: "context") — when the PAA is awkward, too long, or better as a contextual statement. Rewrite the header in declarative form.

## Rule 4: SENTENCE CASE for all headers
Only the first word capitalized (plus proper nouns, names, acronyms).
**Do NOT use Title Case** — this is a Polish/multilingual writing convention concern.

## Rule 5: Always emit h1Title
- If a user-provided H1 is given in the user prompt, use it verbatim.
- Otherwise, generate an engaging H1 based on the keyword and primary intent.
- The handler will pick which to use; just emit a sane value.

## Rule 6: Emit headers in the requested language
Use the "Language:" value from the user prompt. Default behavior is Polish if unclear.

# OUTPUT SHAPE

Return JSON matching this schema:

\`\`\`
{
  "h1Title": "Engaging H1 in sentence case",
  "fullSections": [
    {
      "sourceArea": "<exact area topic from input>",
      "header": "Engaging H2 in sentence case",
      "h3s": [
        { "header": "...", "format": "question" | "context", "sourcePaa": "<exact PAA from input>" }
      ]
    }
  ],
  "contextSections": [
    {
      "sourceIntent": "Definicyjna" | "Problemowa" | ...,
      "header": "Engaging H2 summarizing the group",
      "groupedAreas": ["<area topic 1>", "<area topic 2>", ...],
      "contextNote": "Brief description of what the section should mention"
    }
  ]
}
\`\`\`

# IMPORTANT NOTES

- \`sourceArea\` and PAA values must match the inputs verbatim — the handler validates this.
- For full sections without PAA, return \`h3s: []\`.
- Even if the user provides an H1, still emit one in your response.
- \`groupedAreas\` must list every area topic from the corresponding secondary intent.`;

const user = (args: OutlineGenerateUserArgs): string => `Main keyword: "${args.keyword}"
${args.userH1Title ? `User-provided H1: "${args.userH1Title}"` : "User did not provide an H1 — generate one."}
Language: ${args.language}
Primary intent: ${args.primaryIntent}

# Primary intent areas (each = one full H2)
${args.primaryAreasJson}

# Other intents and their areas (group each intent into one context H2)
${args.secondaryAreasByIntentJson}`;

export const outlineGeneratePrompt = {
  system,
  user,
};
