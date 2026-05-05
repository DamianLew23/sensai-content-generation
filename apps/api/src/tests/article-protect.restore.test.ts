import { describe, expect, it } from "vitest";
import { tokenizeHybrid } from "../tools/article-protect/article-protect.tokenize";
import { restoreHybrid } from "../tools/article-protect/article-protect.restore";

describe("restoreHybrid", () => {
  it("restores SRC placeholders to original citations", () => {
    const original =
      "<p>X 20% (Źródło: WHO, 2024 — who.int).</p>";
    const t = tokenizeHybrid(original);
    const r = restoreHybrid(t.html, t.srcMap, t.spanMap);
    expect(r.html).toContain("(Źródło: WHO, 2024 — who.int)");
    expect(r.missingSrc).toEqual([]);
    expect(r.missingSpans).toEqual([]);
  });

  it("unwraps spans (removes <span data-token-id> tags, keeps content)", () => {
    const original = "<p>50 mg dose.</p>";
    const t = tokenizeHybrid(original);
    const r = restoreHybrid(t.html, t.srcMap, t.spanMap);
    expect(r.html).not.toMatch(/data-token-id/);
    expect(r.html).toContain("50 mg");
  });

  it("reports missing SRC placeholders (model removed one)", () => {
    const original = "<p>X (Źródło: WHO, 2024 — who.int).</p>";
    const t = tokenizeHybrid(original);
    const tampered = t.html.replace(/\[\[SRC_000\]\]/, "");
    const r = restoreHybrid(tampered, t.srcMap, t.spanMap);
    expect(r.missingSrc).toEqual(["[[SRC_000]]"]);
  });

  it("reports missing spans (model removed one)", () => {
    const original = "<p>50 mg and 30%.</p>";
    const t = tokenizeHybrid(original);
    const tokenIds = Object.keys(t.spanMap);
    const removeId = tokenIds[0];
    const tampered = t.html.replace(
      new RegExp(`<span data-token-id="${removeId}">[^<]*</span>`),
      "REMOVED",
    );
    const r = restoreHybrid(tampered, t.srcMap, t.spanMap);
    expect(r.missingSpans).toContain(removeId);
  });

  it("round-trips: restore(tokenize(x)) preserves content for fixture", () => {
    const original =
      "<h1>T</h1><p>50 mg ashwagandhi obniża kortyzol o 20% w 2024 r. (Źródło: WHO, 2024 — who.int/x).</p>";
    const t = tokenizeHybrid(original);
    const r = restoreHybrid(t.html, t.srcMap, t.spanMap);
    expect(r.html).toContain("<h1>T</h1>");
    expect(r.html).toContain("50 mg");
    expect(r.html).toContain("20%");
    expect(r.html).toContain("(Źródło: WHO, 2024 — who.int/x)");
  });
});
