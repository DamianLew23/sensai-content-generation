import { describe, it, expect } from "vitest";
import { cleanHtml, removeDuplicateLines } from "../tools/content-cleaner/html-cleaner";

describe("cleanHtml", () => {
  it("removes <br> tags converting them to newlines", () => {
    expect(cleanHtml("line1<br>line2")).toBe("line1\nline2");
    expect(cleanHtml("a<br />b<BR/>c")).toBe("a\nb\nc");
  });

  it("unwraps <a> tags keeping text content", () => {
    expect(cleanHtml('See <a href="x">this page</a> now.')).toBe("See this page now.");
  });

  it("strips remaining HTML tags", () => {
    expect(cleanHtml("<p>hello <strong>world</strong></p>")).toBe("hello world");
  });

  it("removes bare http/https/www URLs", () => {
    expect(cleanHtml("See https://example.com here.")).toBe("See  here.");
    expect(cleanHtml("Go to www.example.com for more.")).toBe("Go to  for more.");
  });

  it("preserves paragraph structure (double newlines)", () => {
    expect(cleanHtml("para1\n\npara2")).toBe("para1\n\npara2");
  });

  it("collapses 3+ consecutive newlines to 2", () => {
    expect(cleanHtml("a\n\n\n\nb")).toBe("a\n\nb");
  });

  it("trims leading/trailing whitespace", () => {
    expect(cleanHtml("  \n  hello  \n  ")).toBe("hello");
  });

  it("returns empty string for empty input", () => {
    expect(cleanHtml("")).toBe("");
    expect(cleanHtml("   \n  \n  ")).toBe("");
  });
});

describe("removeDuplicateLines", () => {
  it("keeps first occurrence of a line and drops later duplicates", () => {
    expect(removeDuplicateLines("a\nb\na\nc\nb")).toBe("a\nb\nc");
  });

  it("treats lines differing only in surrounding whitespace as duplicates", () => {
    expect(removeDuplicateLines("hello\n  hello  \nworld")).toBe("hello\nworld");
  });

  it("preserves empty lines for paragraph structure", () => {
    expect(removeDuplicateLines("a\n\nb\n\nc")).toBe("a\n\nb\n\nc");
  });

  it("returns empty string for empty input", () => {
    expect(removeDuplicateLines("")).toBe("");
  });
});
