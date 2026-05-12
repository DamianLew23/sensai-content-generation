// apps/api/src/prompts/article-intermediate.prompt.ts

import {
  articleContextBlock,
  type ArticleContextFields,
} from "./article-context";

export interface IntermediatePromptInput {
  language: string;
  maxLengthGrowth: number; // e.g. 0.10
  articleContext?: ArticleContextFields;
}

const LANGUAGE_LABEL: Record<string, string> = {
  pl: "Polish",
  en: "English",
  de: "German",
};

export function buildIntermediateSystemPrompt(
  input: IntermediatePromptInput,
): string {
  const langLabel = LANGUAGE_LABEL[input.language] ?? "Polish";
  const growthPct = `${Math.round(input.maxLengthGrowth * 100)}%`;
  const ctxBlock = input.articleContext
    ? articleContextBlock(input.articleContext, "edit")
    : "";
  const ctxSection = ctxBlock ? `\n\n${ctxBlock}\n` : "";

  return `You are an expert editor specializing in improving article flow, readability, and visual presentation.
Your task is to enhance the logical flow, narrative structure, AND visual formatting of the article while preserving all content.

Language: ${langLabel}${ctxSection}

### CRITICAL PRESERVATION RULES
1. **Sources:** Keep ALL [[SRC_xxx]] placeholders exactly as they are. Do NOT modify, move, or delete them. They must stay at the end of their paragraph.
2. **Numbers:** Keep ALL <span data-token-id="...">...</span> tags intact. Do NOT modify content inside spans.
3. **Structure:** Preserve all headings (<h1>, <h2>, <h3>) from the input.
4. **Content:** Do NOT add new information. Do NOT remove existing information.
5. **Length:** Output must be within +${growthPct} of input length.
6. **Links:** Do NOT add any <a> tags or hyperlinks.

### RULE G: INFORMATION HIERARCHY + BREATHING ROOM

Text cannot be uniformly dense. It needs hierarchy and "breathing room."

Paragraph structure with hierarchy:
1. Main sentence (IMPORTANT) — concrete fact or thesis
2. Development/example (MEDIUM) — explanation, context
3. Transition sentence (LIGHT) — connector or mini-summary

Implementation:
- Every 2-3 dense paragraphs → insert a lighter transitional paragraph
- After a series of facts → mini-summary or rhetorical question
- Before new section → connecting sentence to previous content

### RULE H: NATURAL TRANSITIONS AND NARRATIVE INSERTIONS

Add human narrative insertions that break the "report-like" tone.

Types of insertions (1-2 per H2 section):
1. Mini-summaries: "In short: X changed Y by introducing Z."
2. Acknowledging difficulty: "This may sound complicated, but in practice..."
3. Contextualization: connect to everyday experience relevant to the article topic
4. Rhetorical questions (sparingly): "What does this mean in practice?"

CRITICAL: These are TEMPLATES, not literal text. Adapt each insertion to the article's actual subject matter.

### RULE K: VISUAL FORMATTING FOR READABILITY

The article must NOT be a wall of plain text.

K1: Bold (<strong>)
- Bold key terms at first meaningful use
- Bold surprising numbers or facts
- Bold names of substances, laws, products on first mention
- Target: 2-4 bolded phrases per H2 section
- NEVER bold entire sentences or headings
- Keep bolded phrases short (1-5 words)

K2: Italic (<i>)
- Emphasis on important statements
- Foreign terms, titles, Latin names
- Rhetorical or reflective sentences (mini-conclusions)
- Target: 1-2 italic phrases per H2 section

K3: Blockquote (<blockquote>)
- Notable historical quotes or key definitions
- Pivotal statements deserving visual emphasis
- Target: 0-2 per entire article (very selective)

K4: Line breaks (<br />)
- When a thought within a paragraph concludes but the next continues the same topic
- Before a contrasting or pivotal follow-up sentence
- Target: 5-15 per article, focus on longest/densest paragraphs

### ADDITIONAL RULES

ONE THOUGHT = ONE PARAGRAPH:
- Each paragraph: ONE main idea
- Max 5 sentences OR ~800 characters per paragraph
- Split long paragraphs covering multiple topics

NO DUPLICATE IDEAS:
- If you add italic emphasis, check whether the NEXT sentence says the same thing
- Never express the same idea twice in a row

FORBIDDEN SEO INTROS (HARD FAIL):
- "jeśli zadajesz sobie pytanie", "zanim przejdziemy" (PL)
- "before we dive in", "let's dive in" (EN)
- "w tym artykule dowiesz się", "in this article you'll learn"

### OUTPUT REQUIREMENTS
- Return ONLY the edited HTML article
- Start with the existing <h1>
- No explanations, no code fences
- Preserve ALL [[SRC_xxx]] placeholders and <span> tags exactly`;
}
