import { describe, expect, it } from "vitest";
import { fuseRankings, RRF_K_DEFAULT } from "../tools/dataforseo/rrf";

describe("fuseRankings (Reciprocal Rank Fusion)", () => {
  it("uses k=60 as the default smoothing constant", () => {
    expect(RRF_K_DEFAULT).toBe(60);
  });

  it("ranks a document that appears in every query above one that only appears in one (top)", () => {
    // url2 is rank 2/1/2 across three queries — strong consensus
    // url9 is rank 1 in only one query
    const fused = fuseRankings([
      { query: "a", urls: ["url1", "url2", "url3", "url4", "url5"] },
      { query: "b", urls: ["url2", "url6", "url1", "url7", "url8"] },
      { query: "c", urls: ["url9", "url2", "url3", "url1", "url10"] },
    ]);
    expect(fused[0].url).toBe("url2");
    // url9 should be ranked lower than url1 (which appears in all three)
    const url9Idx = fused.findIndex((f) => f.url === "url9");
    const url1Idx = fused.findIndex((f) => f.url === "url1");
    expect(url1Idx).toBeLessThan(url9Idx);
  });

  it("returns score, sourceQueries, and originalRanks per fused item", () => {
    const fused = fuseRankings([
      { query: "alpha", urls: ["x", "y"] },
      { query: "beta", urls: ["y", "x"] },
    ]);
    const x = fused.find((f) => f.url === "x")!;
    expect(x.sourceQueries.sort()).toEqual(["alpha", "beta"]);
    expect(x.originalRanks).toEqual(
      expect.arrayContaining([
        { query: "alpha", rank: 1 },
        { query: "beta", rank: 2 },
      ]),
    );
    // RRF score for x: 1/(60+1) + 1/(60+2) = 0.01639 + 0.01613 ≈ 0.03252
    expect(x.score).toBeCloseTo(1 / 61 + 1 / 62, 5);
  });

  it("treats absence as zero contribution (does not penalise)", () => {
    const fused = fuseRankings([
      { query: "a", urls: ["only-a"] },
      { query: "b", urls: ["only-b"] },
    ]);
    const onlyA = fused.find((f) => f.url === "only-a")!;
    expect(onlyA.score).toBeCloseTo(1 / 61, 5);
    expect(onlyA.sourceQueries).toEqual(["a"]);
  });

  it("returns an empty array when no queries have any results", () => {
    expect(fuseRankings([{ query: "a", urls: [] }])).toEqual([]);
    expect(fuseRankings([])).toEqual([]);
  });

  it("is deterministic for ties (stable order by URL string asc)", () => {
    // Both URLs at rank 1 in query a → identical scores → tiebreak by URL asc
    const fused = fuseRankings([{ query: "a", urls: ["b", "a"] }]);
    // a is at rank 2, b at rank 1 → b wins. Now force a true tie:
    const tied = fuseRankings([
      { query: "a", urls: ["zzz"] },
      { query: "b", urls: ["aaa"] },
    ]);
    // both score 1/61 — alphabetical: aaa first
    expect(tied[0].url).toBe("aaa");
    expect(tied[1].url).toBe("zzz");
  });

  it("accepts custom k", () => {
    const fused = fuseRankings([{ query: "a", urls: ["x"] }], { k: 0 });
    expect(fused[0].score).toBeCloseTo(1 / 1, 5);
  });
});
