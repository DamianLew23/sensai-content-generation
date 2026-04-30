import type { DistributionResult } from "@sensai/shared";
import type { DedupResult } from "./draft-generator.types";

const FACT_KEY_LEN = 80;

function factKey(text: string): string {
  return text.slice(0, FACT_KEY_LEN).toLowerCase().trim();
}

export function dedupeH3Facts(
  sections: DistributionResult["sections"],
): DedupResult {
  let factsRemoved = 0;

  const cloned = sections.map((s) => {
    if (s.type === "intro") return s;

    const parentFactKeys = new Set(s.facts.map((f) => factKey(f.text)));

    const h3s = s.h3s.map((h3) => {
      const filtered = h3.facts.filter((f) => {
        if (parentFactKeys.has(factKey(f.text))) {
          factsRemoved += 1;
          return false;
        }
        return true;
      });
      return { ...h3, facts: filtered };
    });

    return { ...s, h3s };
  });

  return { sections: cloned as DistributionResult["sections"], factsRemoved };
}
