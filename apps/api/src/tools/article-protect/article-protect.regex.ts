// apps/api/src/tools/article-protect/article-protect.regex.ts
//
// Verbatim mirror of the Python educational reference:
//   docs/edu/lekcja-3-4/T3F4-article_check_educational.py (lines 96-149)
//   docs/edu/lekcja-3-4/T3F4-article_intermediate_educational.py (lines 102-149)
//
// Order of use is load-bearing — see article-protect.tokenize.ts.

export const SOURCE_CITATION_RE =
  /\((?:Source|Źródło):\s*(?:[^()]*|\([^()]*\))*\)/gi;

// Trailing `(?!\w)` (instead of `\b`) so that values like `20%` match — `\b`
// fails between `%` (non-word) and a following non-word character.
export const NUM_RE =
  /\b\d+(?:[.,]\d+)?\s?(?:%|mln|mld|tys\.?|k|M|B|zł|PLN|USD|EUR|mg|g|kg|ml|μg|mcg|IU|kcal)?(?!\w)/gi;

export const DATE_RE =
  /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-zÀ-ž]+\s+\d{4}|\d{4})\b/g;

export const DOI_RE = /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/gi;

export const BRACKET_REF_RE = /\[(?:\d{1,3}|[A-Za-z0-9-_]+)\]/g;

// Used by intermediate guards (extractNumberSet) — broader than NUM_RE so the
// growth-guard catches more rephrasings.
export const NUMERIC_EXTRACT_RE =
  /(?:\d{1,3}(?:[ ., ]\d{3})+|\d+)(?:[.,]\d+)?%?|\b\d{4}\b|(?:\$|€|£|zł|PLN|USD|EUR)\s?\d+(?:[.,]\d+)?/gi;

export const SEO_INTRO_PATTERNS: Record<string, RegExp[]> = {
  pl: [
    /jeśli\s+zadajesz\s+sobie\s+pytanie/i,
    /zanim\s+przejdziemy/i,
    /w\s+tym\s+artykule\s+(?:dowiesz|poznasz|odkryjesz)/i,
    /czy\s+zastanawiałeś\s+się/i,
    /witaj\s+w\s+(?:naszym|tym)\s+(?:przewodniku|artykule)/i,
  ],
  en: [
    /before\s+we\s+dive\s+in/i,
    /let'?s\s+dive\s+in/i,
    /in\s+this\s+article,?\s+(?:we'?ll|you'?ll)/i,
    /have\s+you\s+ever\s+wondered/i,
    /welcome\s+to\s+(?:our|this)\s+(?:guide|article)/i,
  ],
};
