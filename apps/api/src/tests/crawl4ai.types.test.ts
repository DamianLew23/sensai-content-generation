import { describe, it, expect } from "vitest";
import {
  isCloudflareChallenge,
  CLOUDFLARE_SIGNATURES,
  MIN_CONTENT_CHARS,
} from "../tools/crawl4ai/scrape.types";

describe("crawl4ai scrape.types", () => {
  it("exposes MIN_CONTENT_CHARS = 200", () => {
    expect(MIN_CONTENT_CHARS).toBe(200);
  });

  it("isCloudflareChallenge returns true for 'Just a moment...' marker", () => {
    expect(isCloudflareChallenge("Just a moment...")).toBe(true);
  });

  it("isCloudflareChallenge returns true for CF challenge script class", () => {
    expect(isCloudflareChallenge("<div class='cf-chl-body'></div>")).toBe(true);
  });

  it("isCloudflareChallenge returns true for 'Attention Required!' title", () => {
    expect(isCloudflareChallenge("# Attention Required! | Cloudflare")).toBe(true);
  });

  it("isCloudflareChallenge returns false for normal content", () => {
    expect(isCloudflareChallenge("# About us\nWe are a company.")).toBe(false);
  });

  it("CLOUDFLARE_SIGNATURES is non-empty readonly array", () => {
    expect(CLOUDFLARE_SIGNATURES.length).toBeGreaterThan(0);
  });
});
