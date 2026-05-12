import { describe, expect, it } from "vitest";
import { canonicalizeUrl } from "../tools/dataforseo/canonical-url";

describe("canonicalizeUrl", () => {
  it("lowercases host and preserves path case", () => {
    expect(canonicalizeUrl("HTTPS://Example.COM/Path/To/Page")).toBe(
      "https://example.com/Path/To/Page",
    );
  });

  it("strips trailing slash from path (but keeps root '/')", () => {
    expect(canonicalizeUrl("https://example.com/foo/")).toBe("https://example.com/foo");
    expect(canonicalizeUrl("https://example.com/")).toBe("https://example.com/");
  });

  it("removes utm_* and fbclid/gclid query params, keeps others sorted", () => {
    expect(
      canonicalizeUrl("https://example.com/p?utm_source=x&id=42&utm_campaign=y&fbclid=z&q=hi"),
    ).toBe("https://example.com/p?id=42&q=hi");
  });

  it("drops the URL fragment", () => {
    expect(canonicalizeUrl("https://example.com/p#section")).toBe("https://example.com/p");
  });

  it("returns the input verbatim if URL parsing fails", () => {
    expect(canonicalizeUrl("not a url")).toBe("not a url");
  });

  it("treats http and https as distinct (do not normalise scheme)", () => {
    expect(canonicalizeUrl("http://example.com/")).not.toBe(canonicalizeUrl("https://example.com/"));
  });
});
