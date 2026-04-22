import { describe, it, expect } from "vitest";
import { youcomResearchPrompt } from "../prompts/youcom-research.prompt";
import type { RunInput } from "@sensai/shared";

describe("youcomResearchPrompt", () => {
  it("default: uses all provided fields", () => {
    const input: RunInput = {
      topic: "Jak nauczyć się Rust",
      mainKeyword: "rust programming",
      intent: "informational",
      contentType: "blog-seo",
    };
    const out = youcomResearchPrompt.user(input);
    expect(out).toContain("Jak nauczyć się Rust");
    expect(out).toContain("rust programming");
    expect(out).toContain("informational");
    expect(out).toContain("blog-seo");
    expect(out).toContain("Cover: key facts");
  });

  it("default: skips optional fields when not present", () => {
    const input: RunInput = { topic: "Topic only" };
    const out = youcomResearchPrompt.user(input);
    expect(out).toContain("Topic only");
    expect(out).not.toMatch(/Target keyword/);
    expect(out).not.toMatch(/Search intent/);
    expect(out).not.toMatch(/Content type/);
  });

  it("override: interpolates {topic}, {mainKeyword}, {intent}, {contentType}", () => {
    const input: RunInput = {
      topic: "T",
      mainKeyword: "K",
      intent: "I",
      contentType: "C",
    };
    const override =
      "Research: {topic} | kw: {mainKeyword} | intent: {intent} | type: {contentType}";
    const out = youcomResearchPrompt.user(input, override);
    expect(out).toBe("Research: T | kw: K | intent: I | type: C");
  });

  it("override: leaves unknown placeholders untouched", () => {
    const input: RunInput = { topic: "X" };
    const out = youcomResearchPrompt.user(input, "Topic {topic}, other {foo}");
    expect(out).toBe("Topic X, other {foo}");
  });

  it("override: missing optional fields become empty string", () => {
    const input: RunInput = { topic: "X" };
    const out = youcomResearchPrompt.user(input, "{topic}|{mainKeyword}|{intent}");
    expect(out).toBe("X||");
  });
});
