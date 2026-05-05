import { load } from "cheerio";
import {
  NUMERIC_EXTRACT_RE,
  SEO_INTRO_PATTERNS,
} from "./article-protect.regex";

export function extractPlainText(html: string): string {
  const $ = load(html, null, false);
  return $.text().replace(/\s+/g, " ").trim();
}

export function extractNumberSet(text: string): Set<string> {
  const matches = text.match(NUMERIC_EXTRACT_RE) ?? [];
  return new Set(matches);
}

export function countFormatting(html: string): {
  strong: number;
  italic: number;
  blockquote: number;
  br: number;
} {
  const $ = load(html, null, false);
  return {
    strong: $("strong").length,
    italic: $("i").length + $("em").length,
    blockquote: $("blockquote").length,
    br: $("br").length,
  };
}

export function detectSeoIntro(html: string, lang: string): boolean {
  const text = extractPlainText(html).toLowerCase();
  const patterns = SEO_INTRO_PATTERNS[lang] ?? SEO_INTRO_PATTERNS.en;
  return patterns.some((re) => re.test(text));
}

export function hasH1Tag(html: string): boolean {
  return /<h1\b[^>]*>/i.test(html);
}

export function hasAnchorTags(html: string): boolean {
  return /<a\b[^>]*>/i.test(html);
}

export function unwrapAnchors(html: string): string {
  const $ = load(html, null, false);
  $("a").each((_, el) => {
    $(el).replaceWith($(el).contents());
  });
  return $.html();
}

export function stripEmptyParagraphs(html: string): string {
  const $ = load(html, null, false);
  $("p").each((_, el) => {
    if (!$(el).text().trim()) $(el).remove();
  });
  return $.html();
}
