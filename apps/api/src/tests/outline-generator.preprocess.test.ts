import { describe, it, expect } from "vitest";
import { preprocessFanout } from "../tools/outline-generator/outline-generator.preprocess";
import type { QueryFanOutResult, IntentName } from "@sensai/shared";

const baseFanout = (): QueryFanOutResult => ({
  metadata: {
    keyword: "jak obniżyć kortyzol po 40tce",
    language: "pl",
    createdAt: "2026-04-29T10:00:00.000Z",
  },
  normalization: {
    mainEntity: "kortyzol",
    category: "zdrowie / hormony",
    ymylRisk: true,
  },
  intents: [
    {
      name: "Instrukcyjna",
      areas: [
        { id: "A1", topic: "higiena snu", question: "Jak poprawić sen po 40?", ymyl: true, classification: "MICRO" as const, evergreenTopic: "", evergreenQuestion: "" },
        { id: "A2", topic: "aktywność fizyczna", question: "Jakie treningi po 40?", ymyl: true, classification: "MICRO" as const, evergreenTopic: "", evergreenQuestion: "" },
      ],
    },
    {
      name: "Diagnostyczna",
      areas: [
        { id: "A3", topic: "badanie kortyzolu", question: "Jak zbadać kortyzol?", ymyl: true, classification: "MICRO" as const, evergreenTopic: "", evergreenQuestion: "" },
        { id: "A4", topic: "interpretacja wyników", question: "Jak interpretować wynik?", ymyl: true, classification: "MICRO" as const, evergreenTopic: "", evergreenQuestion: "" },
      ],
    },
    {
      name: "Definicyjna",
      areas: [
        { id: "A5", topic: "rola kortyzolu", question: "Czym jest kortyzol?", ymyl: true, classification: "MICRO" as const, evergreenTopic: "", evergreenQuestion: "" },
      ],
    },
  ],
  dominantIntent: "Instrukcyjna",
  paaMapping: [
    { areaId: "A1", question: "Co pić na wysoki kortyzol?" },
  ],
  unmatchedPaa: [],
});

describe("preprocessFanout", () => {
  it("splits primary (Instrukcyjna) from secondary intents", () => {
    const r = preprocessFanout(baseFanout(), undefined);
    expect(r.primaryIntent).toBe("Instrukcyjna");
    expect(r.primaryIntentSource).toBe("fanout");
    expect(r.primaryAreas.map(a => a.id)).toEqual(["A1", "A2"]);
    expect(Array.from(r.secondaryAreasByIntent.keys())).toEqual(["Definicyjna", "Diagnostyczna"]);
  });

  it("sorts secondary intents alphabetically by name", () => {
    const r = preprocessFanout(baseFanout(), undefined);
    const keys = Array.from(r.secondaryAreasByIntent.keys());
    expect(keys).toEqual([...keys].sort());
  });

  it("attaches PAA questions per area from paaMapping", () => {
    const r = preprocessFanout(baseFanout(), undefined);
    const a1 = r.primaryAreas.find(a => a.id === "A1");
    expect(a1?.paaQuestions).toEqual(["Co pić na wysoki kortyzol?"]);
    const a2 = r.primaryAreas.find(a => a.id === "A2");
    expect(a2?.paaQuestions).toEqual([]);
  });

  it("uses RunInput.intent override when provided and matches an existing intent", () => {
    const r = preprocessFanout(baseFanout(), "Diagnostyczna" as IntentName);
    expect(r.primaryIntent).toBe("Diagnostyczna");
    expect(r.primaryIntentSource).toBe("user");
    expect(r.primaryAreas.map(a => a.id)).toEqual(["A3", "A4"]);
  });

  it("falls back to dominantIntent and emits warning when override does not match any area", () => {
    const r = preprocessFanout(baseFanout(), "Porównawcza" as IntentName);
    expect(r.primaryIntent).toBe("Instrukcyjna");
    expect(r.primaryIntentSource).toBe("fanout");
    expect(r.preprocessWarnings).toHaveLength(1);
    expect(r.preprocessWarnings[0].kind).toBe("outline_intent_override_no_match");
  });

  it("emits outline_missing_primary_intent_areas when dominantIntent has 0 areas", () => {
    const f = baseFanout();
    f.intents = f.intents.filter(i => i.name !== "Instrukcyjna");
    f.dominantIntent = "Instrukcyjna";
    const r = preprocessFanout(f, undefined);
    expect(r.primaryAreas).toEqual([]);
    expect(r.preprocessWarnings.some(w => w.kind === "outline_missing_primary_intent_areas")).toBe(true);
  });

  it("returns empty secondaryAreasByIntent when fanout has only one intent", () => {
    const f = baseFanout();
    f.intents = f.intents.filter(i => i.name === "Instrukcyjna");
    const r = preprocessFanout(f, undefined);
    expect(r.secondaryAreasByIntent.size).toBe(0);
  });
});
