import { describe, expect, it, vi } from "vitest";
import {
  getResolvedRunInput,
  getDisambiguateOutput,
} from "../orchestrator/run-input-resolver";
import type { RunInput } from "@sensai/shared";

const rawInput: RunInput = {
  topic: "Jak napisać instrukcję",
  mainKeyword: "instrukcja",
  intent: "informational",
  contentType: "how-to",
};

const disambiguateOutput = {
  refinedTopic: "Jak napisać instrukcję obsługi aplikacji webowej",
  mainKeyword: "instrukcja aplikacji",
  intent: "informational" as const,
  contentType: "how-to guide",
  researchQuestion: "Jak skutecznie pisać instrukcje aplikacji webowej?",
  serpQueries: ["instrukcja aplikacji webowej", "user guide aplikacja"],
  antiAngles: ["urządzenia fizyczne"],
  rationale: "Skupiamy się na aplikacjach.",
};

describe("getResolvedRunInput", () => {
  it("returns the raw input when no disambiguate output is available", () => {
    expect(getResolvedRunInput(rawInput, {})).toEqual(rawInput);
    expect(getResolvedRunInput(rawInput, { somethingElse: { x: 1 } })).toEqual(rawInput);
  });

  it("returns the raw input when disambiguate output fails schema validation", () => {
    expect(
      getResolvedRunInput(rawInput, { disambiguate: { foo: "bar" } }),
    ).toEqual(rawInput);
  });

  it("merges the four RunInput-shaped fields when disambiguate is valid", () => {
    const merged = getResolvedRunInput(rawInput, { disambiguate: disambiguateOutput });
    expect(merged.topic).toBe(disambiguateOutput.refinedTopic);
    expect(merged.mainKeyword).toBe(disambiguateOutput.mainKeyword);
    expect(merged.intent).toBe(disambiguateOutput.intent);
    expect(merged.contentType).toBe(disambiguateOutput.contentType);
  });
});

describe("getDisambiguateOutput", () => {
  it("returns null when no disambiguate step output is present", () => {
    expect(getDisambiguateOutput({})).toBeNull();
  });

  it("returns null when output fails schema validation", () => {
    expect(getDisambiguateOutput({ disambiguate: { broken: true } })).toBeNull();
  });

  it("returns the parsed output when valid", () => {
    const parsed = getDisambiguateOutput({ disambiguate: disambiguateOutput });
    expect(parsed?.researchQuestion).toBe(disambiguateOutput.researchQuestion);
    expect(parsed?.serpQueries).toHaveLength(2);
    expect(parsed?.antiAngles).toContain("urządzenia fizyczne");
  });

  it("warns and returns null when DisambiguateOutput appears under a non-canonical step key", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = getDisambiguateOutput({ wrongKey: disambiguateOutput });
    expect(result).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toMatch(/expected/i);
    warn.mockRestore();
  });
});
