import { describe, it, expect } from "vitest";
import { postprocessOutline } from "../tools/outline-generator/outline-generator.postprocess";
import type { LLMOutlineCallResult } from "../tools/outline-generator/outline-generator.types";
import type { PreprocessedFanout, PreprocessedArea } from "../tools/outline-generator/outline-generator.types";

const mkArea = (id: string, intent: PreprocessedArea["intent"], paaCount = 0): PreprocessedArea => ({
  id,
  topic: `topic ${id}`,
  question: `question ${id}`,
  intent,
  paaQuestions: Array.from({ length: paaCount }, (_, i) => `paa ${id}.${i + 1}`),
});

const mkPreprocessed = (): PreprocessedFanout => ({
  primaryIntent: "Instrukcyjna",
  primaryIntentSource: "fanout",
  primaryAreas: [
    mkArea("A1", "Instrukcyjna", 2),
    mkArea("A2", "Instrukcyjna", 0),
  ],
  secondaryAreasByIntent: new Map([
    ["Definicyjna", [mkArea("A3", "Definicyjna", 1)]],
    ["Diagnostyczna", [mkArea("A4", "Diagnostyczna", 0), mkArea("A5", "Diagnostyczna", 0)]],
  ]),
  preprocessWarnings: [],
});

const mkLLMResult = (overrides: Partial<LLMOutlineCallResult> = {}): LLMOutlineCallResult => ({
  h1Title: "LLM-generated title",
  fullSections: [
    { sourceArea: "topic A1", header: "Higiena snu", h3s: [
      { header: "Ile godzin?", format: "question" as const, sourcePaa: "paa A1.1" },
      { header: "Rytuały wieczorne", format: "context" as const, sourcePaa: "paa A1.2" },
    ]},
    { sourceArea: "topic A2", header: "Aktywność fizyczna", h3s: [] },
  ],
  contextSections: [
    { sourceIntent: "Definicyjna" as const, header: "Czym jest kortyzol", groupedAreas: ["topic A3"], contextNote: "krótko" },
    { sourceIntent: "Diagnostyczna" as const, header: "Jak zbadać kortyzol", groupedAreas: ["topic A4", "topic A5"], contextNote: "krótko" },
  ],
  ...overrides,
});

describe("postprocessOutline", () => {
  it("builds outline with intro at order=0 and full sections at order=1..N", () => {
    const r = postprocessOutline({
      preprocessed: mkPreprocessed(),
      llmResult: mkLLMResult(),
      keyword: "kortyzol",
      language: "pl",
      userH1Title: undefined,
      model: "openai/gpt-5.4",
    });
    expect(r.outline[0].type).toBe("intro");
    expect(r.outline[0].order).toBe(0);
    const h2s = r.outline.filter(s => s.type === "h2");
    expect(h2s.map(s => s.order)).toEqual([1, 2, 3, 4]);
  });

  it("places primary full sections before context sections", () => {
    const r = postprocessOutline({
      preprocessed: mkPreprocessed(),
      llmResult: mkLLMResult(),
      keyword: "kortyzol",
      language: "pl",
      userH1Title: undefined,
      model: "openai/gpt-5.4",
    });
    const h2s = r.outline.filter(s => s.type === "h2") as Extract<typeof r.outline[number], { type: "h2" }>[];
    expect(h2s[0].sectionVariant).toBe("full");
    expect(h2s[1].sectionVariant).toBe("full");
    expect(h2s[2].sectionVariant).toBe("context");
    expect(h2s[3].sectionVariant).toBe("context");
  });

  it("emits outline_h3_count_mismatch when LLM h3 count != paaQuestions count", () => {
    const llm = mkLLMResult();
    llm.fullSections[0].h3s = [llm.fullSections[0].h3s[0]]; // remove one — was 2 PAAs, now 1 H3
    const r = postprocessOutline({
      preprocessed: mkPreprocessed(),
      llmResult: llm,
      keyword: "kortyzol",
      language: "pl",
      userH1Title: undefined,
      model: "openai/gpt-5.4",
    });
    expect(r.warnings.some(w => w.kind === "outline_h3_count_mismatch")).toBe(true);
  });

  it("emits outline_unused_area when LLM omits a primary area", () => {
    const llm = mkLLMResult();
    llm.fullSections = [llm.fullSections[0]]; // drop A2
    const r = postprocessOutline({
      preprocessed: mkPreprocessed(),
      llmResult: llm,
      keyword: "kortyzol",
      language: "pl",
      userH1Title: undefined,
      model: "openai/gpt-5.4",
    });
    expect(r.warnings.some(w => w.kind === "outline_unused_area")).toBe(true);
  });

  it("emits outline_unused_area when LLM omits a secondary intent group", () => {
    const llm = mkLLMResult();
    llm.contextSections = [llm.contextSections[0]]; // drop Diagnostyczna
    const r = postprocessOutline({
      preprocessed: mkPreprocessed(),
      llmResult: llm,
      keyword: "kortyzol",
      language: "pl",
      userH1Title: undefined,
      model: "openai/gpt-5.4",
    });
    expect(r.warnings.some(w => w.kind === "outline_unused_area")).toBe(true);
  });

  it("uses user h1Title and stamps h1Source=user when provided", () => {
    const r = postprocessOutline({
      preprocessed: mkPreprocessed(),
      llmResult: mkLLMResult(),
      keyword: "kortyzol",
      language: "pl",
      userH1Title: "User-provided title",
      model: "openai/gpt-5.4",
    });
    expect(r.meta.h1Title).toBe("User-provided title");
    expect(r.meta.h1Source).toBe("user");
  });

  it("uses LLM h1Title and stamps h1Source=llm when user did not provide", () => {
    const r = postprocessOutline({
      preprocessed: mkPreprocessed(),
      llmResult: mkLLMResult({ h1Title: "LLM title" }),
      keyword: "kortyzol",
      language: "pl",
      userH1Title: undefined,
      model: "openai/gpt-5.4",
    });
    expect(r.meta.h1Title).toBe("LLM title");
    expect(r.meta.h1Source).toBe("llm");
  });

  it("propagates preprocessWarnings into output.warnings", () => {
    const pp = mkPreprocessed();
    pp.preprocessWarnings = [
      { kind: "outline_intent_override_no_match", message: "test", context: {} },
    ];
    const r = postprocessOutline({
      preprocessed: pp,
      llmResult: mkLLMResult(),
      keyword: "kortyzol",
      language: "pl",
      userH1Title: undefined,
      model: "openai/gpt-5.4",
    });
    expect(r.warnings.some(w => w.kind === "outline_intent_override_no_match")).toBe(true);
  });

  it("stamps fullSectionsCount and contextSectionsCount in meta", () => {
    const r = postprocessOutline({
      preprocessed: mkPreprocessed(),
      llmResult: mkLLMResult(),
      keyword: "kortyzol",
      language: "pl",
      userH1Title: undefined,
      model: "openai/gpt-5.4",
    });
    expect(r.meta.fullSectionsCount).toBe(2);
    expect(r.meta.contextSectionsCount).toBe(2);
  });
});
