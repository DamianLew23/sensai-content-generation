import { describe, it, expect } from "vitest";
import {
  cleanSourceValue,
  buildCitation,
  addSourceToElement,
  insertSources,
} from "../tools/data-enricher/data-enricher.insert";
import type { ExtractedClaim, ClaimVerification } from "@sensai/shared";

describe("cleanSourceValue", () => {
  it("strips https:// and www.", () => {
    expect(cleanSourceValue("https://www.who.int/news")).toBe("who.int/news");
  });
  it("converts markdown links to text", () => {
    expect(cleanSourceValue("[WHO](https://who.int)")).toBe("WHO");
  });
  it("strips <a> tags keeping text", () => {
    expect(cleanSourceValue('<a href="https://who.int">WHO</a>')).toBe("WHO");
  });
  it("returns empty for empty input", () => {
    expect(cleanSourceValue("")).toBe("");
  });
});

describe("buildCitation", () => {
  it("formats source + url with em-dash separator", () => {
    expect(
      buildCitation("WHO, 2024", "https://who.int/news/x"),
    ).toBe("Źródło: WHO, 2024 — who.int/news/x");
  });
  it("returns plain source when url empty", () => {
    expect(buildCitation("WHO, 2024", "")).toBe("Źródło: WHO, 2024");
  });
  it("trims trailing dot from source", () => {
    expect(buildCitation("WHO, 2024.", "")).toBe("Źródło: WHO, 2024");
  });
  it("truncates over-long URLs to first 4 path segments", () => {
    const longUrl = "https://example.com/" + "segment/".repeat(40) + "end";
    const out = buildCitation("Example", longUrl);
    expect(out.length).toBeLessThan(180);
    expect(out.startsWith("Źródło: Example — example.com/")).toBe(true);
  });
});

describe("buildCitation label fallback", () => {
  it("prepends default 'Źródło: ' when source lacks a label", () => {
    expect(buildCitation("WHO, 2024", "https://who.int/x")).toBe(
      "Źródło: WHO, 2024 — who.int/x",
    );
  });
  it("does not double-prepend when label is already present", () => {
    expect(buildCitation("Źródło: WHO, 2024", "https://who.int/x")).toBe(
      "Źródło: WHO, 2024 — who.int/x",
    );
  });
  it("accepts an explicit English label", () => {
    expect(
      buildCitation("WHO, 2024", "https://who.int/x", "Source"),
    ).toBe("Source: WHO, 2024 — who.int/x");
  });
});

describe("cleanSourceValue HTML escape", () => {
  it("escapes <, >, & in source strings", () => {
    expect(cleanSourceValue("Foo & Bar <script>alert(1)</script>")).toBe(
      "Foo &amp; Bar &lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });
});

describe("addSourceToElement", () => {
  it("inserts before </p>, preserves trailing dot", () => {
    const html = "<p>Some claim about cortisol.</p>";
    const out = addSourceToElement(html, "Źródło: who.int", "p");
    expect(out).toBe("<p>Some claim about cortisol (Źródło: who.int).</p>");
  });
  it("inserts before </li> with no trailing dot", () => {
    const html = "<li>A bullet</li>";
    const out = addSourceToElement(html, "Źródło: foo.pl", "li");
    expect(out).toBe("<li>A bullet (Źródło: foo.pl)</li>");
  });
  it("does not duplicate when citation already present", () => {
    const html = "<p>Already cited (Źródło: who.int).</p>";
    const out = addSourceToElement(html, "Źródło: foo.pl", "p");
    expect(out).toBe(html);
  });
  it("supports english Source: marker for dedup detection", () => {
    const html = "<p>Already (Source: who.int).</p>";
    const out = addSourceToElement(html, "Źródło: foo.pl", "p");
    expect(out).toBe(html);
  });
});

describe("Quelle dedup (German)", () => {
  it("does not duplicate when German citation already present", () => {
    const html = "<p>Tekst mit Zitat (Quelle: who.int).</p>";
    const out = addSourceToElement(html, "Źródło: foo.pl", "p");
    expect(out).toBe(html);
  });
});

function makeClaim(id: number, paragraphHtml: string): ExtractedClaim {
  return {
    id,
    paragraphHtml,
    claimText: "x",
    context: "x",
    claimTypes: ["statystyka"],
    score: 3,
    h2Context: "X",
    tagName: paragraphHtml.startsWith("<li") ? "li" : "p",
  };
}

describe("insertSources", () => {
  it("processes claims reverse-position so positions stay stable", () => {
    const article =
      "<h2>X</h2>\n<p>First claim.</p>\n<p>Second claim.</p>\n<p>Third claim.</p>";
    const claims = [
      makeClaim(1, "<p>First claim.</p>"),
      makeClaim(2, "<p>Second claim.</p>"),
      makeClaim(3, "<p>Third claim.</p>"),
    ];
    const verifications = new Map<number, ClaimVerification>([
      [1, { claimId: 1, status: "confirmed", source: "Źródło: a.pl, 2024", sourceUrl: "https://a.pl/x", note: "" }],
      [2, { claimId: 2, status: "unverified", source: "", sourceUrl: "", note: "" }],
      [3, { claimId: 3, status: "corrected", source: "Źródło: b.pl, 2024", sourceUrl: "https://b.pl/y", note: "wrong number", correctedValue: "should be 5" }],
    ]);
    const { html, stats } = insertSources(article, claims, verifications);
    expect(html).toContain("(Źródło: a.pl, 2024 — a.pl/x).");
    expect(html).toContain("(Źródło: b.pl, 2024 — b.pl/y).");
    expect(html).toContain("Second claim.");
    expect(html).not.toContain("Second claim. (");
    expect(stats.sourcesAdded).toBe(1);
    expect(stats.correctionsFlagged).toBe(1);
    expect(stats.unverified).toBe(1);
  });

  it("skips claims missing from the verification map", () => {
    const article = "<p>Only claim.</p>";
    const claims = [makeClaim(1, "<p>Only claim.</p>")];
    const verifications = new Map<number, ClaimVerification>(); // empty
    const { html, stats } = insertSources(article, claims, verifications);
    expect(html).toBe(article);
    expect(stats.sourcesAdded).toBe(0);
  });
});
