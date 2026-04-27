import { describe, it, expect } from "vitest";
import { queryFanoutPrompt } from "../prompts/query-fanout.prompt";

describe("queryFanoutPrompt", () => {
  describe("intents", () => {
    it("system prompt embeds the maxAreas value", () => {
      const sys5 = queryFanoutPrompt.intents.system(5);
      const sys3 = queryFanoutPrompt.intents.system(3);
      expect(sys5).toContain("maks. 5 obszarów");
      expect(sys3).toContain("maks. 3 obszarów");
      expect(sys5.length).toBeGreaterThan(500);
    });

    it("system prompt lists all 6 intent names", () => {
      const sys = queryFanoutPrompt.intents.system(5);
      for (const name of [
        "Definicyjna",
        "Problemowa",
        "Instrukcyjna",
        "Decyzyjna",
        "Diagnostyczna",
        "Porównawcza",
      ]) {
        expect(sys).toContain(name);
      }
    });

    it("system prompt requires globally unique area ids", () => {
      const sys = queryFanoutPrompt.intents.system(5);
      expect(sys).toMatch(/A1.*A2.*A3/);
      expect(sys.toLowerCase()).toContain("globalnie unikalna");
    });

    it("user prompt embeds keyword, language, and maxAreas verbatim", () => {
      const user = queryFanoutPrompt.intents.user({
        keyword: "Jak obniżyć kortyzol po 40tce?",
        language: "pl",
        maxAreas: 5,
      });
      expect(user).toContain('Słowo kluczowe: "Jak obniżyć kortyzol po 40tce?"');
      expect(user).toContain("Język outputu: pl");
      expect(user).toContain("Maksymalna liczba obszarów na intencję: 5");
    });
  });

  describe("classify", () => {
    it("system prompt covers MICRO/MACRO test and evergreen rules", () => {
      const sys = queryFanoutPrompt.classify.system;
      expect(sys).toContain("MICRO");
      expect(sys).toContain("MACRO");
      expect(sys.toLowerCase()).toContain("test samodzielności");
      expect(sys).toContain("evergreenTopic");
      expect(sys).toContain("dominantIntent");
    });

    it("user prompt embeds the keyword and intentsJson verbatim", () => {
      const intentsJson = JSON.stringify(
        [{ name: "Instrukcyjna", areas: [{ id: "A1", topic: "Dieta", question: "Co jeść?", ymyl: true }] }],
        null,
        2,
      );
      const user = queryFanoutPrompt.classify.user({
        keyword: "Jak obniżyć kortyzol po 40tce?",
        intentsJson,
      });
      expect(user).toContain('Główne zapytanie: "Jak obniżyć kortyzol po 40tce?"');
      expect(user).toContain(intentsJson);
    });
  });

  describe("paa", () => {
    it("system prompt enforces 1-to-1 PAA→areaId assignment with unmatched bucket", () => {
      const sys = queryFanoutPrompt.paa.system;
      expect(sys).toContain("areaId");
      expect(sys).toContain("unmatched");
      expect(sys.toLowerCase()).toContain("kopiuj");
    });

    it("user prompt numbers PAA questions starting from 1", () => {
      const user = queryFanoutPrompt.paa.user({
        keyword: "kortyzol",
        areasJson: '[{"id":"A1","topic":"Dieta","question":"Co jeść?"}]',
        paaQuestions: ["Czy kawa podnosi kortyzol?", "Jak stres wpływa na kortyzol?"],
      });
      expect(user).toContain("1. Czy kawa podnosi kortyzol?");
      expect(user).toContain("2. Jak stres wpływa na kortyzol?");
    });

    it("user prompt embeds areasJson verbatim", () => {
      const areasJson = '[{"id":"A1","topic":"Dieta","question":"Co jeść?"}]';
      const user = queryFanoutPrompt.paa.user({
        keyword: "kortyzol",
        areasJson,
        paaQuestions: [],
      });
      expect(user).toContain(areasJson);
    });
  });

  it("all three system prompts are non-empty Polish strings", () => {
    expect(queryFanoutPrompt.intents.system(5).length).toBeGreaterThan(200);
    expect(queryFanoutPrompt.classify.system.length).toBeGreaterThan(200);
    expect(queryFanoutPrompt.paa.system.length).toBeGreaterThan(200);
  });
});
