import type {
  IntroSection,
  FullSection,
  ContextSection,
  OutlineSection,
  OutlineGenerationResult,
  OutlineGenWarning,
} from "@sensai/shared";
import type {
  LLMOutlineCallResult,
  PreprocessedFanout,
} from "./outline-generator.types";

interface PostprocessInput {
  preprocessed: PreprocessedFanout;
  llmResult: LLMOutlineCallResult;
  keyword: string;
  language: string;
  userH1Title: string | undefined;
  model: string;
}

export function postprocessOutline(input: PostprocessInput): OutlineGenerationResult {
  const { preprocessed, llmResult, keyword, language, userH1Title, model } = input;
  const warnings: OutlineGenWarning[] = [...preprocessed.preprocessWarnings];

  // Validate full sections vs primaryAreas: every primaryArea should map to one fullSection.
  // Match by area "topic" — LLM is told to put area.topic into sourceArea.
  const primaryByTopic = new Map(preprocessed.primaryAreas.map(a => [a.topic, a]));
  const seenPrimaryTopics = new Set<string>();
  for (const ll of llmResult.fullSections) {
    if (!primaryByTopic.has(ll.sourceArea)) {
      warnings.push({
        kind: "outline_unused_area",
        message: `LLM emitted full section for unknown area "${ll.sourceArea}"`,
        context: { sourceArea: ll.sourceArea },
      });
      continue;
    }
    seenPrimaryTopics.add(ll.sourceArea);
  }
  for (const a of preprocessed.primaryAreas) {
    if (!seenPrimaryTopics.has(a.topic)) {
      warnings.push({
        kind: "outline_unused_area",
        message: `LLM did not emit a full section for primary area "${a.topic}"`,
        context: { areaId: a.id, topic: a.topic },
      });
    }
  }

  // Validate H3 count per emitted full section.
  for (const ll of llmResult.fullSections) {
    const area = primaryByTopic.get(ll.sourceArea);
    if (!area) continue;
    if (ll.h3s.length !== area.paaQuestions.length) {
      warnings.push({
        kind: "outline_h3_count_mismatch",
        message: `Full section "${ll.sourceArea}": LLM produced ${ll.h3s.length} H3s, area had ${area.paaQuestions.length} PAA`,
        context: {
          sourceArea: ll.sourceArea,
          llmCount: String(ll.h3s.length),
          paaCount: String(area.paaQuestions.length),
        },
      });
    }
  }

  // Validate context sections cover every secondary intent.
  const secondaryIntents = new Set<string>(
    Array.from(preprocessed.secondaryAreasByIntent.keys()),
  );
  const seenContextIntents = new Set<string>();
  for (const ll of llmResult.contextSections) {
    if (!secondaryIntents.has(ll.sourceIntent)) {
      warnings.push({
        kind: "outline_unused_area",
        message: `LLM emitted context section for intent "${ll.sourceIntent}" which has no secondary areas`,
        context: { sourceIntent: ll.sourceIntent },
      });
      continue;
    }
    seenContextIntents.add(ll.sourceIntent);
  }
  for (const intentName of secondaryIntents) {
    if (!seenContextIntents.has(intentName)) {
      warnings.push({
        kind: "outline_unused_area",
        message: `LLM did not emit a context section for secondary intent "${intentName}"`,
        context: { intent: intentName },
      });
    }
  }

  // Build outline deterministically: intro → primary fullSections (in primaryAreas order) → context (alphabetical intent).
  const outline: OutlineSection[] = [];
  let order = 0;

  const intro: IntroSection = {
    type: "intro",
    order: 0,
    header: null,
    sectionVariant: null,
    h3s: [] as [],
  };
  outline.push(intro);
  order++;

  // Full sections in primaryAreas iteration order; skip areas the LLM didn't emit.
  const llmFullByTopic = new Map(llmResult.fullSections.map(ll => [ll.sourceArea, ll]));
  for (const area of preprocessed.primaryAreas) {
    const ll = llmFullByTopic.get(area.topic);
    if (!ll) continue; // already warned above
    const full: FullSection = {
      type: "h2",
      order,
      sectionVariant: "full",
      header: ll.header,
      sourceArea: area.topic,
      sourceIntent: preprocessed.primaryIntent,
      h3s: ll.h3s,
    };
    outline.push(full);
    order++;
  }

  // Context sections in secondary alphabetical order; skip intents the LLM didn't emit.
  const llmContextByIntent = new Map(llmResult.contextSections.map(ll => [ll.sourceIntent, ll]));
  for (const intentName of preprocessed.secondaryAreasByIntent.keys()) {
    const ll = llmContextByIntent.get(intentName);
    if (!ll) continue; // already warned above
    const ctx: ContextSection = {
      type: "h2",
      order,
      sectionVariant: "context",
      header: ll.header,
      sourceIntent: intentName,
      groupedAreas: ll.groupedAreas,
      contextNote: ll.contextNote,
      h3s: [] as [],
    };
    outline.push(ctx);
    order++;
  }

  const fullSectionsCount = outline.filter(
    s => s.type === "h2" && s.sectionVariant === "full",
  ).length;
  const contextSectionsCount = outline.filter(
    s => s.type === "h2" && s.sectionVariant === "context",
  ).length;

  const h1Source: "user" | "llm" = userH1Title ? "user" : "llm";
  const h1Title = userH1Title ?? llmResult.h1Title;

  return {
    meta: {
      keyword,
      h1Title,
      h1Source,
      language,
      primaryIntent: preprocessed.primaryIntent,
      primaryIntentSource: preprocessed.primaryIntentSource,
      fullSectionsCount,
      contextSectionsCount,
      generatedAt: new Date().toISOString(),
      model,
    },
    outline,
    warnings,
  };
}
