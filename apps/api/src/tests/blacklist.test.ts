import { describe, it, expect } from "vitest";
import {
  BLACKLIST_PHRASES,
  containsBlacklistedPhrase,
  removeBlacklistedParagraphs,
} from "../tools/content-cleaner/blacklist";

describe("BLACKLIST_PHRASES", () => {
  it("contains Polish UI-boilerplate phrases", () => {
    expect(BLACKLIST_PHRASES).toContain("cookies");
    expect(BLACKLIST_PHRASES).toContain("dodaj do koszyka");
    expect(BLACKLIST_PHRASES).toContain("newsletter");
    expect(BLACKLIST_PHRASES).toContain("polityka prywatności");
  });

  it("has more than 30 phrases (covers main categories)", () => {
    expect(BLACKLIST_PHRASES.length).toBeGreaterThan(30);
  });
});

describe("containsBlacklistedPhrase", () => {
  it("matches case-insensitively", () => {
    expect(containsBlacklistedPhrase("Akceptuję Cookies")).toBe(true);
    expect(containsBlacklistedPhrase("COOKIES")).toBe(true);
  });

  it("matches substring", () => {
    expect(containsBlacklistedPhrase("Kliknij aby dodać do koszyka swój produkt")).toBe(true);
  });

  it("returns false when no phrase matches", () => {
    expect(containsBlacklistedPhrase("Ten artykuł opisuje wpływ kortyzolu.")).toBe(false);
  });

  it("handles empty string", () => {
    expect(containsBlacklistedPhrase("")).toBe(false);
  });
});

describe("removeBlacklistedParagraphs", () => {
  it("removes long paragraphs containing blacklisted phrases, keeps clean ones", () => {
    const input = [
      "Merytoryczny paragraf o kortyzolu. Długi tekst z sensowną informacją o hormonach.",
      "Zaakceptuj nasze cookies, aby kontynuować przeglądanie naszej strony internetowej.",
      "Kolejny merytoryczny paragraf o stresie i jego wpływie na organizm człowieka.",
    ].join("\n\n");

    const { text, removed } = removeBlacklistedParagraphs(input, 60);
    expect(removed).toBe(1);
    expect(text).toContain("Merytoryczny paragraf o kortyzolu");
    expect(text).toContain("Kolejny merytoryczny paragraf");
    expect(text).not.toContain("cookies");
  });

  it("passes through short paragraphs (below minLen) without checking blacklist", () => {
    const shortCookie = "cookies"; // below minLen=60
    const { text, removed } = removeBlacklistedParagraphs(shortCookie, 60);
    expect(removed).toBe(0);
    expect(text).toBe(shortCookie);
  });

  it("returns correct count when multiple paragraphs are blacklisted", () => {
    const input = [
      "Zaloguj się, aby zobaczyć pełną treść artykułu. To jest bardzo długi paragraf.",
      "Dodaj do koszyka swój ulubiony produkt i kontynuuj zakupy w naszym sklepie online.",
      "Sensowny paragraf merytoryczny o którym powinniśmy pamiętać przy rozważaniu tematu.",
    ].join("\n\n");

    const { text, removed } = removeBlacklistedParagraphs(input, 60);
    expect(removed).toBe(2);
    expect(text).toContain("Sensowny paragraf");
  });

  it("returns zero when no paragraphs are blacklisted", () => {
    const input = "Merytoryczny długi paragraf bez problematycznych fraz UI, tylko treść.";
    const { text, removed } = removeBlacklistedParagraphs(input, 60);
    expect(removed).toBe(0);
    expect(text).toBe(input);
  });
});
