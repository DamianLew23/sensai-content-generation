import { describe, expect, it } from "vitest";
import { topicDisambiguatePrompt } from "../prompts/topic-disambiguate.prompt";
import type { ProjectConfig, RunInput } from "@sensai/shared";

const projectName = "click2docs";
const cfg: ProjectConfig = {
  toneOfVoice: "konkretny, profesjonalny",
  targetAudience: "firmy SaaS",
  guidelines: "",
  defaultModels: {},
  promptOverrides: {},
  productPitch: "click2docs.pl to SaaS do generowania instrukcji obsługi aplikacji webowych z nagrań kliknięć.",
  domain: "SaaS / dokumentacja techniczna",
  keyTerms: ["instrukcja aplikacji", "user guide", "onboarding"],
  antiTerms: ["urządzenia fizyczne", "AGD", "sprzęt"],
  competitors: ["Tango", "Scribe", "Guidde"],
};

describe("topicDisambiguatePrompt.system", () => {
  const sys = topicDisambiguatePrompt.system(projectName, cfg);

  it("includes the project name", () => {
    expect(sys).toContain("click2docs");
  });

  it("includes the productPitch", () => {
    expect(sys).toContain("click2docs.pl to SaaS");
  });

  it("includes domain and target audience", () => {
    expect(sys).toContain("SaaS / dokumentacja techniczna");
    expect(sys).toContain("firmy SaaS");
  });

  it("emits keyTerms as a MUST-honor list", () => {
    expect(sys).toMatch(/MUSZ.*instrukcja aplikacji/i);
  });

  it("emits antiTerms as a MUST-NOT list", () => {
    expect(sys).toMatch(/NIE WOLNO.*urządzenia fizyczne/i);
    expect(sys).toContain("AGD");
  });

  it("includes competitors when provided", () => {
    expect(sys).toContain("Tango");
  });

  it("omits empty fields cleanly when ProjectConfig has no domain context", () => {
    const empty: ProjectConfig = {
      toneOfVoice: "", targetAudience: "", guidelines: "",
      defaultModels: {}, promptOverrides: {},
      productPitch: "", domain: "", keyTerms: [], antiTerms: [], competitors: [],
    };
    const sysEmpty = topicDisambiguatePrompt.system("demo", empty);
    expect(sysEmpty).not.toMatch(/undefined/i);
    expect(sysEmpty).not.toMatch(/MUSZ/i); // no keyTerms guard line if list is empty
    expect(sysEmpty).not.toMatch(/NIE WOLNO/i);
  });
});

describe("topicDisambiguatePrompt.user", () => {
  it("renders the topic and any RunInput hints", () => {
    const input: RunInput = {
      topic: "Jak napisać instrukcję",
      mainKeyword: "instrukcja",
      intent: "informational",
      contentType: "how-to",
    };
    const u = topicDisambiguatePrompt.user(input);
    expect(u).toContain("Jak napisać instrukcję");
    expect(u).toContain("instrukcja");
    expect(u).toContain("informational");
    expect(u).toContain("how-to");
  });

  it("renders only topic when no hints provided", () => {
    const u = topicDisambiguatePrompt.user({ topic: "Jak napisać instrukcję" });
    expect(u).toContain("Jak napisać instrukcję");
    expect(u).not.toMatch(/intent/i);
    expect(u).not.toMatch(/contentType|Typ treści/i);
  });
});
