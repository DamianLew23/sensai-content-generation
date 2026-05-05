import { describe, expect, it } from "vitest";
import { tokenizeHybrid } from "../tools/article-protect/article-protect.tokenize";

describe("tokenizeHybrid", () => {
  it("replaces source citations with [[SRC_xxx]] placeholders before number wrap", () => {
    const html =
      "<p>Kortyzol spada o 20% (Źródło: WHO, 2024 — who.int/x).</p>";
    const { html: out, srcMap, spanMap } = tokenizeHybrid(html);
    expect(srcMap).toEqual({
      "[[SRC_000]]": "(Źródło: WHO, 2024 — who.int/x)",
    });
    expect(out).toMatch(/\[\[SRC_000\]\]/);
    // The "20%" must be wrapped, but the "2024" inside the citation must NOT
    // get wrapped (it is hidden behind the SRC placeholder).
    expect(out).toMatch(/<span data-token-id="NUM_[a-f0-9]+">20%<\/span>/);
    expect(JSON.stringify(spanMap)).not.toMatch(/"2024"/);
  });

  it("supports multiple source citations with sequential indices", () => {
    const html =
      "<p>A (Źródło: a.com, 2023 — a.com).</p><p>B (Źródło: b.com, 2024 — b.com).</p>";
    const { srcMap } = tokenizeHybrid(html);
    expect(Object.keys(srcMap).sort()).toEqual(["[[SRC_000]]", "[[SRC_001]]"]);
  });

  it("does not double-tokenize a SRC placeholder via BRACKET_REF_RE", () => {
    const html = "<p>X (Źródło: WHO, 2024 — who.int).</p>";
    const { html: out, spanMap } = tokenizeHybrid(html);
    // No span with content like "[SRC_000]" should be produced.
    for (const v of Object.values(spanMap)) {
      expect(v).not.toMatch(/SRC_/);
    }
    expect(out).not.toMatch(/<span[^>]*>\[SRC_/);
  });

  it("wraps DOIs, bracket refs, numbers and dates in distinct span prefixes", () => {
    const html =
      "<p>See 10.1234/abc.de [3] for 50 mg dose on 2024-01-15.</p>";
    const { html: out, spanMap } = tokenizeHybrid(html);
    const prefixes = new Set(
      Object.keys(spanMap).map((id) => id.split("_")[0]),
    );
    expect(prefixes.has("DOI")).toBe(true);
    expect(prefixes.has("REF")).toBe(true);
    expect(prefixes.has("NUM")).toBe(true);
    expect(prefixes.has("DAT")).toBe(true);
    expect(out).toMatch(/data-token-id="DOI_/);
  });

  it("returns input unchanged when no protectable data exists", () => {
    const html = "<h1>Title</h1><p>Hello world.</p>";
    const { html: out, srcMap, spanMap } = tokenizeHybrid(html);
    expect(out).toBe(html);
    expect(srcMap).toEqual({});
    expect(spanMap).toEqual({});
  });
});
