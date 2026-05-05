import { describe, expect, it } from "vitest";
import {
  countFormatting,
  detectSeoIntro,
  extractNumberSet,
  extractPlainText,
  hasAnchorTags,
  hasH1Tag,
  stripEmptyParagraphs,
  unwrapAnchors,
} from "../tools/article-protect/article-protect.guards";

describe("guards.extractPlainText", () => {
  it("strips tags and collapses whitespace", () => {
    const html = "<h1>T</h1>\n<p>A   <strong>B</strong> C.</p>";
    expect(extractPlainText(html)).toBe("T A B C.");
  });
});

describe("guards.extractNumberSet", () => {
  it("captures percentages, integers, years, currency, and decimals", () => {
    const text = "20% in 2024, 1,500 PLN and $42.50 dose 50 mg";
    const s = extractNumberSet(text);
    expect(s.has("20%")).toBe(true);
    expect(s.has("2024")).toBe(true);
    expect(s.has("$42.50")).toBe(true);
  });

  it("differs allow guard to compute set difference", () => {
    const a = extractNumberSet("20% and 2024");
    const b = extractNumberSet("20% only");
    const diff = [...a].filter((v) => !b.has(v));
    expect(diff).toContain("2024");
  });
});

describe("guards.countFormatting", () => {
  it("counts strong, italic (i+em), blockquote, br", () => {
    const html =
      "<p><strong>a</strong><i>b</i><em>c</em><br /><blockquote>q</blockquote></p>";
    expect(countFormatting(html)).toEqual({
      strong: 1,
      italic: 2,
      blockquote: 1,
      br: 1,
    });
  });
});

describe("guards.detectSeoIntro", () => {
  it("matches Polish patterns", () => {
    expect(detectSeoIntro("<p>Zanim przejdziemy do meritum…</p>", "pl")).toBe(true);
  });
  it("matches English patterns", () => {
    expect(detectSeoIntro("<p>Before we dive in, let us…</p>", "en")).toBe(true);
  });
  it("does not match a normal Polish opener", () => {
    expect(detectSeoIntro("<p>Kortyzol to hormon stresu.</p>", "pl")).toBe(false);
  });
});

describe("guards.hasH1Tag / hasAnchorTags", () => {
  it("hasH1Tag true when <h1> present, false otherwise", () => {
    expect(hasH1Tag("<h1>T</h1><p>x</p>")).toBe(true);
    expect(hasH1Tag("<p>x</p>")).toBe(false);
  });
  it("hasAnchorTags true when <a present, false otherwise", () => {
    expect(hasAnchorTags('<p><a href="x">y</a></p>')).toBe(true);
    expect(hasAnchorTags("<p>y</p>")).toBe(false);
  });
});

describe("guards.unwrapAnchors", () => {
  it("removes <a> tags but keeps inner text", () => {
    expect(unwrapAnchors('<p><a href="x">label</a> tail</p>')).toContain(
      "label tail",
    );
    expect(unwrapAnchors('<p><a href="x">label</a></p>')).not.toMatch(/<a/);
  });
});

describe("guards.stripEmptyParagraphs", () => {
  it("removes empty and whitespace-only <p> elements", () => {
    const html = "<p>kept</p><p></p><p>   </p><p>also kept</p>";
    const out = stripEmptyParagraphs(html);
    expect(out).toContain("kept");
    expect(out).toContain("also kept");
    expect(out.match(/<p>/g)?.length).toBe(2);
  });
});
