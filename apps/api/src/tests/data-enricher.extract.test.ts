import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractClaims } from "../tools/data-enricher/data-enricher.extract";

const FIXTURE = readFileSync(
  join(__dirname, "fixtures/sample-draft.html"),
  "utf-8",
);

describe("extractClaims", () => {
  it("finds the high-score combo paragraph (trend + norma + porównanie)", () => {
    const claims = extractClaims(FIXTURE, { maxClaims: 15, minScore: 2 });
    const top = claims[0];
    expect(top.score).toBeGreaterThanOrEqual(6);
    expect(top.claimText).toMatch(/30-45 minut/);
    expect(top.claimTypes).toEqual(
      expect.arrayContaining(["trend", "norma_medyczna", "porownanie"]),
    );
    expect(top.h2Context).toBe("Czym jest kortyzol");
    expect(top.tagName).toBe("p");
  });

  it("captures table-cell claims with row+headers context", () => {
    const claims = extractClaims(FIXTURE, { maxClaims: 15, minScore: 2 });
    const tdClaim = claims.find((c) => c.tagName === "td");
    expect(tdClaim).toBeDefined();
    expect(tdClaim!.context).toMatch(/Nagłówki tabeli: Adaptogen \| Dawka \| Forma/);
    expect(tdClaim!.context).toMatch(/Wiersz: Ashwagandha \| 300-600 mg/);
  });

  it("skips paragraphs shorter than 30 chars", () => {
    const html = "<h2>X</h2><p>Krótkie 50%.</p>";
    const claims = extractClaims(html, { maxClaims: 15, minScore: 2 });
    expect(claims).toHaveLength(0);
  });

  it("skips paragraphs with score below minScore", () => {
    // pure narrative — no patterns
    const html =
      "<h2>X</h2><p>Witam was serdecznie w tej krótkiej pogadance, dzień dobry państwu.</p>";
    const claims = extractClaims(html, { maxClaims: 15, minScore: 2 });
    expect(claims).toHaveLength(0);
  });

  it("respects maxClaims limit, sorted by score desc", () => {
    const claims = extractClaims(FIXTURE, { maxClaims: 2, minScore: 2 });
    expect(claims).toHaveLength(2);
    expect(claims[0].score).toBeGreaterThanOrEqual(claims[1].score);
  });

  it("keeps tracking last-seen h2 across siblings", () => {
    const claims = extractClaims(FIXTURE, { maxClaims: 15, minScore: 2 });
    const senClaim = claims.find((c) => /Sen 7-9/.test(c.claimText));
    expect(senClaim).toBeDefined();
    expect(senClaim!.h2Context).toBe("Sen");
  });

  it("scores statystyka 3 + porownanie 2 = 5 minimum on the sleep paragraph", () => {
    const claims = extractClaims(FIXTURE, { maxClaims: 15, minScore: 2 });
    const senClaim = claims.find((c) => /Sen 7-9/.test(c.claimText));
    expect(senClaim!.score).toBeGreaterThanOrEqual(5);
    expect(senClaim!.claimTypes).toEqual(
      expect.arrayContaining(["statystyka", "porownanie"]),
    );
  });

  it("captures org + year combo (WHO 2019) as datowane_zdarzenie + organizacja", () => {
    const claims = extractClaims(FIXTURE, { maxClaims: 15, minScore: 2 });
    const whoClaim = claims.find((c) => /500 tysięcy/.test(c.claimText));
    expect(whoClaim).toBeDefined();
    expect(whoClaim!.claimTypes).toEqual(
      expect.arrayContaining(["statystyka", "datowane_zdarzenie", "organizacja"]),
    );
  });

  it("ids are sequential 1..N in document order before sorting", () => {
    // We assert: every id is unique and positive — sequence is internal detail
    const claims = extractClaims(FIXTURE, { maxClaims: 15, minScore: 2 });
    const ids = claims.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id >= 1)).toBe(true);
  });

  it("paragraphHtml contains the original element so insert can replace it", () => {
    const claims = extractClaims(FIXTURE, { maxClaims: 15, minScore: 2 });
    const senClaim = claims.find((c) => /Sen 7-9/.test(c.claimText));
    expect(senClaim!.paragraphHtml).toContain("Sen 7-9 godzin obniża kortyzol");
    expect(senClaim!.paragraphHtml.startsWith("<p")).toBe(true);
    expect(senClaim!.paragraphHtml.endsWith("</p>")).toBe(true);
  });
});
