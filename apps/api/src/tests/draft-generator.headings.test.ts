import { describe, it, expect } from "vitest";
import { detectPassageFormat } from "../tools/draft-generator/draft-generator.headings";

describe("detectPassageFormat", () => {
  it.each([
    ["Co to jest kortyzol", "definition"],
    ["Czym jest stres", "definition"],
    ["Jak obniżyć kortyzol po 40tce", "instruction"],
    ["W jaki sposób trenować", "instruction"],
    ["Dlaczego kortyzol rośnie?", "cause"],
    ["Przyczyny wysokiego kortyzolu", "cause"],
    ["HIIT vs spacer — co lepsze?", "comparison"],
    ["Jak rozpoznać przewlekły stres", "diagnosis"],
    ["Objawy podwyższonego kortyzolu", "diagnosis"],
    ["Najlepsze suplementy na sen", "list"],
    ["Rodzaje treningu siłowego", "list"],
    ["Ile godzin snu potrzebuję?", "question"],
  ])("matches PL pattern '%s' → %s", (header, expected) => {
    const pf = detectPassageFormat(header, undefined, "pl");
    expect(pf.trigger).toBe(expected);
    expect(pf.matchedBy).toBe("header_pattern");
  });

  it("falls back to source intent when no pattern matches", () => {
    const pf = detectPassageFormat("Adaptogeny i ich rola", "Decyzyjna", "pl");
    expect(pf.trigger).toBe("list");
    expect(pf.matchedBy).toBe("source_intent");
  });

  it("defaults to instruction when no pattern and no usable intent", () => {
    const pf = detectPassageFormat("Adaptogeny", undefined, "pl");
    expect(pf.trigger).toBe("instruction");
    expect(pf.matchedBy).toBe("default");
  });

  it("matches EN patterns when lang='en'", () => {
    const pf = detectPassageFormat("How to lower cortisol", undefined, "en");
    expect(pf.trigger).toBe("instruction");
  });
});
