import { randomBytes } from "node:crypto";
import {
  SOURCE_CITATION_RE,
  NUM_RE,
  DATE_RE,
  DOI_RE,
  BRACKET_REF_RE,
} from "./article-protect.regex";

export interface TokenizeResult {
  html: string;
  srcMap: Record<string, string>;
  spanMap: Record<string, string>;
}

export function tokenizeHybrid(html: string): TokenizeResult {
  const srcMap: Record<string, string> = {};
  const spanMap: Record<string, string> = {};

  // STEP 1 — SRC placeholders FIRST. Citations contain years/numbers that
  // must be hidden before the NUM/DATE wrap pass.
  let srcIdx = 0;
  let text = html.replace(SOURCE_CITATION_RE, (match) => {
    const marker = `[[SRC_${String(srcIdx).padStart(3, "0")}]]`;
    srcMap[marker] = match;
    srcIdx += 1;
    return marker;
  });

  // STEP 2 — Hide SRC placeholders behind sentinels so BRACKET_REF_RE doesn't
  // match the `[SRC_xxx]` substring inside `[[SRC_xxx]]`.
  const sentinelByMarker = new Map<string, string>();
  let sIdx = 0;
  for (const marker of Object.keys(srcMap)) {
    const sentinel = `__SRCHOLD_${sIdx}__`;
    sentinelByMarker.set(marker, sentinel);
    text = text.split(marker).join(sentinel);
    sIdx += 1;
  }

  // STEP 3 — Wrap DOI, REF, NUM, DATE in spans with unique IDs.
  const wrap = (re: RegExp, prefix: string) => {
    text = text.replace(re, (match) => {
      const tokenId = `${prefix}_${randomBytes(4).toString("hex")}`;
      spanMap[tokenId] = match;
      return `<span data-token-id="${tokenId}">${match}</span>`;
    });
  };
  wrap(DOI_RE, "DOI");
  wrap(BRACKET_REF_RE, "REF");
  wrap(NUM_RE, "NUM");
  wrap(DATE_RE, "DAT");

  // STEP 4 — Restore SRC placeholders.
  for (const [marker, sentinel] of sentinelByMarker.entries()) {
    text = text.split(sentinel).join(marker);
  }

  return { html: text, srcMap, spanMap };
}
