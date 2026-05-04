import { describe, it, expect } from "vitest";
import { assembleDraft } from "../tools/draft-generator/draft-generator.assemble";

describe("assembleDraft", () => {
  it("prepends <h1>, joins chunks, collapses empty paragraphs", () => {
    const html = assembleDraft({
      h1Title: "Tytuł artykułu",
      htmlChunks: ["<p>Intro</p>", "<h2>Sekcja</h2><p></p><p>Body</p>"],
    });
    expect(html.startsWith("<h1>Tytuł artykułu</h1>")).toBe(true);
    expect(html).toContain("<h2>Sekcja</h2>");
    expect(html).toContain("<p>Intro</p>");
    expect(html).toContain("<p>Body</p>");
    expect(html).not.toMatch(/<p>\s*<\/p>/);
  });

  it("escapes < and > in h1Title", () => {
    const html = assembleDraft({ h1Title: "5 < 6 i 7 > 6", htmlChunks: ["<p>x</p>"] });
    expect(html).toContain("<h1>5 &lt; 6 i 7 &gt; 6</h1>");
  });
});
