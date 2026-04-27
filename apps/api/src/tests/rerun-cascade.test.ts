import { describe, it, expect } from "vitest";
import { computeRerunCascade } from "../runs/rerun-cascade";

type S = { key: string; dependsOn?: string[] };

describe("computeRerunCascade", () => {
  it("empty cascade when target is last and nothing depends on it", () => {
    const steps: S[] = [
      { key: "a", dependsOn: [] },
      { key: "b", dependsOn: ["a"] },
    ];
    expect(computeRerunCascade(steps, "b")).toEqual({ target: "b", downstream: [] });
  });

  it("linear chain cascades everything downstream", () => {
    const steps: S[] = [
      { key: "a", dependsOn: [] },
      { key: "b", dependsOn: ["a"] },
      { key: "c", dependsOn: ["b"] },
    ];
    expect(computeRerunCascade(steps, "a")).toEqual({ target: "a", downstream: ["b", "c"] });
  });

  it("branches do not affect unrelated siblings", () => {
    const steps: S[] = [
      { key: "serp", dependsOn: [] },
      { key: "scrape", dependsOn: ["serp"] },
      { key: "deepResearch", dependsOn: ["serp"] },
      { key: "clean", dependsOn: ["scrape"] },
      { key: "extract", dependsOn: ["clean", "deepResearch"] },
    ];
    expect(computeRerunCascade(steps, "deepResearch")).toEqual({
      target: "deepResearch",
      downstream: ["extract"],
    });
    expect(computeRerunCascade(steps, "scrape")).toEqual({
      target: "scrape",
      downstream: ["clean", "extract"],
    });
  });

  it("downstream is returned in stepOrder (input array order)", () => {
    const steps: S[] = [
      { key: "a", dependsOn: [] },
      { key: "b", dependsOn: ["a"] },
      { key: "c", dependsOn: ["a"] },
      { key: "d", dependsOn: ["b", "c"] },
    ];
    expect(computeRerunCascade(steps, "a").downstream).toEqual(["b", "c", "d"]);
  });

  it("fallback: step with undefined dependsOn is treated as depending on ALL earlier steps", () => {
    const steps: S[] = [
      { key: "a" },
      { key: "b" },
      { key: "c" },
    ];
    expect(computeRerunCascade(steps, "a")).toEqual({ target: "a", downstream: ["b", "c"] });
    expect(computeRerunCascade(steps, "b")).toEqual({ target: "b", downstream: ["c"] });
  });

  it("mixed: undefined deps depend on all earlier; explicit [] means no deps", () => {
    const steps: S[] = [
      { key: "a", dependsOn: [] },
      { key: "b", dependsOn: [] },
      { key: "c" },
    ];
    expect(computeRerunCascade(steps, "a")).toEqual({ target: "a", downstream: ["c"] });
    expect(computeRerunCascade(steps, "b")).toEqual({ target: "b", downstream: ["c"] });
  });

  it("throws when target key not in steps", () => {
    const steps: S[] = [{ key: "a", dependsOn: [] }];
    expect(() => computeRerunCascade(steps, "zzz")).toThrow(/target step "zzz" not found/);
  });
});
