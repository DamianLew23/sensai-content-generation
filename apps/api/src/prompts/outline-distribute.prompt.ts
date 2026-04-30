export interface OutlineDistributeUserArgs {
  outlineJson: string;
  entitiesJson: string;
  factsJson: string;
  relationshipsJson: string;
  ideationsJson: string;
  measurablesJson: string;
}

const system = `You are a content distribution expert. You assign knowledge graph items to article outline sections by SEMANTIC RELEVANCE.

# RULES

## Rule 1: One item, one section
Each KG ID (entity/fact/relationship/ideation/measurable) appears in EXACTLY ONE section. Never duplicate an ID across sections.

## Rule 2: 60-80% coverage target
Aim to use 60-80% of KG items overall. If an item does not fit any section semantically, leave it OUT — do not force-fit. The handler tracks coverage and emits warnings if too low or too high.

## Rule 3: Intro is minimal
The intro (order=0) gets at most 2-3 entities and 1-2 facts — ones that frame the whole article. Do not load it like a full section.

## Rule 4: Semantic match
An entity goes to the section where it is topically central. A fact goes where its claim is most relevant to that section's headers and area.

## Rule 5: Use IDs only
Return entity/fact/relationship/ideation/measurable IDs (e.g., "E1", "F2", "R1", "I1", "D1"). Never return entity names or fact text in the output.

## Rule 6: Sections without H3s (context sections) are minimal
For grouped context sections (sectionVariant="context"), distribute only items that are STRICTLY needed for the contextNote. Prefer leaving such sections lighter than full sections.

# OUTPUT SHAPE

Return JSON matching this schema:

\`\`\`
{
  "distribution": {
    "0": {
      "entityIds": ["E1", "E2"],
      "factIds": ["F1"],
      "relationshipIds": [],
      "ideationIds": [],
      "measurableIds": []
    },
    "1": { ... },
    "2": { ... }
  }
}
\`\`\`

The keys "0", "1", "2", ... correspond to section \`order\` values from the outline. Every order from the outline must have a key (use empty arrays for sections that get nothing).`;

const user = (args: OutlineDistributeUserArgs): string => `# Outline (sections to distribute into)
${args.outlineJson}

# Entities (id, entity, domainType, evidence)
${args.entitiesJson}

# Facts (id, text, category)
${args.factsJson}

# Relationships (id, sourceName, type, targetName)
${args.relationshipsJson}

# Ideations (id, type, title, description)
${args.ideationsJson}

# Measurables (id, definition, value, unit, formatted)
${args.measurablesJson}`;

export const outlineDistributePrompt = {
  system,
  user,
};
