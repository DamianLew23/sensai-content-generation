import type {
  QueryFanOutResult,
  IntentName,
  OutlineGenWarning,
} from "@sensai/shared";
import type { PreprocessedFanout, PreprocessedArea } from "./outline-generator.types";

const KNOWN_INTENTS: ReadonlyArray<IntentName> = [
  "Definicyjna",
  "Problemowa",
  "Instrukcyjna",
  "Decyzyjna",
  "Diagnostyczna",
  "Porównawcza",
];

function isIntentName(value: string | undefined): value is IntentName {
  return !!value && (KNOWN_INTENTS as readonly string[]).includes(value);
}

export function preprocessFanout(
  fanout: QueryFanOutResult,
  userIntent: string | undefined,
): PreprocessedFanout {
  const warnings: OutlineGenWarning[] = [];

  // Index PAA mappings: areaId → questions[]
  const paaByArea = new Map<string, string[]>();
  for (const m of fanout.paaMapping) {
    const arr = paaByArea.get(m.areaId) ?? [];
    arr.push(m.question);
    paaByArea.set(m.areaId, arr);
  }

  // Flatten all areas with their parent intent.
  const allAreas: PreprocessedArea[] = [];
  for (const intent of fanout.intents) {
    for (const a of intent.areas) {
      allAreas.push({
        id: a.id,
        topic: a.topic,
        question: a.question,
        intent: intent.name,
        paaQuestions: paaByArea.get(a.id) ?? [],
      });
    }
  }

  // Resolve primaryIntent.
  let primaryIntent: IntentName;
  let primaryIntentSource: "user" | "fanout";

  if (userIntent !== undefined) {
    if (isIntentName(userIntent) && allAreas.some(a => a.intent === userIntent)) {
      primaryIntent = userIntent;
      primaryIntentSource = "user";
    } else {
      warnings.push({
        kind: "outline_intent_override_no_match",
        message: `RunInput.intent="${userIntent}" did not match any IntentName or any area; falling back to fanout.dominantIntent`,
        context: { providedIntent: userIntent, fallback: fanout.dominantIntent },
      });
      primaryIntent = fanout.dominantIntent;
      primaryIntentSource = "fanout";
    }
  } else {
    primaryIntent = fanout.dominantIntent;
    primaryIntentSource = "fanout";
  }

  const primaryAreas = allAreas.filter(a => a.intent === primaryIntent);
  if (primaryAreas.length === 0) {
    warnings.push({
      kind: "outline_missing_primary_intent_areas",
      message: `primaryIntent=${primaryIntent} has no matching areas in fanout`,
      context: { primaryIntent },
    });
  }

  // Group secondary areas by intent name (alphabetical key order).
  const secondaryRaw = new Map<IntentName, PreprocessedArea[]>();
  for (const a of allAreas) {
    if (a.intent === primaryIntent) continue;
    const arr = secondaryRaw.get(a.intent) ?? [];
    arr.push(a);
    secondaryRaw.set(a.intent, arr);
  }

  const secondaryAreasByIntent = new Map<IntentName, PreprocessedArea[]>();
  const sortedKeys = [...secondaryRaw.keys()].sort();
  for (const k of sortedKeys) {
    secondaryAreasByIntent.set(k, secondaryRaw.get(k)!);
  }

  return {
    primaryIntent,
    primaryIntentSource,
    primaryAreas,
    secondaryAreasByIntent,
    preprocessWarnings: warnings,
  };
}
