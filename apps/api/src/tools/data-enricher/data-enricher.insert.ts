import type {
  ExtractedClaim,
  ClaimVerification,
  ClaimTagName,
} from "@sensai/shared";

export function cleanSourceValue(value: string): string {
  if (!value) return value;

  // 1. Markdown links [text](url) → text
  value = value.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // 2. <a href=...>text</a> → text
  value = value.replace(/<a[^>]*href=[^>]*>([^<]*)<\/a>/gi, "$1");

  // 3. Bare URLs → strip protocol + www, keep host+path
  value = value.replace(
    /https?:\/\/[^\s<>"{}|\\^`[\]]+|www\.[^\s<>"{}|\\^`[\]]+/g,
    (url) => url.replace(/^https?:\/\//, "").replace(/^www\./, ""),
  );

  // 4. Strip leading protocol/www if any survived
  value = value.replace(/^https?:\/\//, "").replace(/^www\./, "");

  return value.trim();
}

export function buildCitation(source: string, sourceUrl: string): string {
  const cleanSource = source.trim().replace(/\.$/, "");

  if (!sourceUrl) return cleanSource;

  let displayUrl = sourceUrl
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");

  if (displayUrl.length > 120) {
    const parts = displayUrl.split("/");
    displayUrl = parts.slice(0, 4).join("/");
  }

  return `${cleanSource} — ${displayUrl}`;
}

const CITATION_MARKER_RE = /\((?:Source|Źródło):/i;

export function addSourceToElement(
  html: string,
  citationBody: string,
  tagName: ClaimTagName,
): string {
  const cleanBody = citationBody.trim().replace(/\.$/, "");
  const closeTag = `</${tagName}>`;
  const closePos = html.lastIndexOf(closeTag);
  if (closePos === -1) {
    return `${html} (${cleanBody})`;
  }

  const beforeClose = html.slice(0, closePos).replace(/\s+$/, "");
  const after = html.slice(closePos + closeTag.length);

  // Dedup detection — look at last 250 chars
  const tail = beforeClose.slice(-250);
  if (CITATION_MARKER_RE.test(tail)) return html;

  if (beforeClose.endsWith(".")) {
    const trimmed = beforeClose.slice(0, -1);
    return `${trimmed} (${cleanBody}).${closeTag}${after}`;
  }
  return `${beforeClose} (${cleanBody})${closeTag}${after}`;
}

export interface InsertStats {
  sourcesAdded: number;
  correctionsFlagged: number;
  unverified: number;
}

export interface InsertResult {
  html: string;
  stats: InsertStats;
}

export function insertSources(
  articleHtml: string,
  claims: ExtractedClaim[],
  verifications: Map<number, ClaimVerification>,
): InsertResult {
  const stats: InsertStats = {
    sourcesAdded: 0,
    correctionsFlagged: 0,
    unverified: 0,
  };

  // Sort claims by their position in the original document, descending.
  // Doing replacements end-to-start keeps earlier indexOf hits valid.
  const positioned = claims
    .map((c) => ({ claim: c, pos: articleHtml.indexOf(c.paragraphHtml) }))
    .filter((x) => x.pos !== -1)
    .sort((a, b) => b.pos - a.pos);

  let enriched = articleHtml;

  for (const { claim } of positioned) {
    const v = verifications.get(claim.id);
    if (!v) continue;

    if (v.status === "unverified" || !v.source) {
      stats.unverified += 1;
      continue;
    }

    const cleanSrc = cleanSourceValue(v.source);
    if (!cleanSrc) {
      stats.unverified += 1;
      continue;
    }

    const citation = buildCitation(cleanSrc, (v.sourceUrl ?? "").trim());
    const next = addSourceToElement(claim.paragraphHtml, citation, claim.tagName);
    if (next === claim.paragraphHtml) continue; // dedup or noop

    enriched = enriched.replace(claim.paragraphHtml, next);

    if (v.status === "confirmed") stats.sourcesAdded += 1;
    if (v.status === "corrected") stats.correctionsFlagged += 1;
  }

  return { html: enriched, stats };
}
