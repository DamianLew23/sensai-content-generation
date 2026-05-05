import * as cheerio from "cheerio";
import type { ExtractedClaim, ClaimTagName } from "@sensai/shared";
import type { CategoryPattern } from "./data-enricher.types";

// Mirror docs/edu/lekcja-3-3/T3F3-data_enrichment_educational.py regex.
// All patterns case-insensitive. Numbers tolerate en-dash (–) ranges.
//
// NOTE — pragmatic deviations from the verbatim Python source:
//   1. JS `\b` is ASCII-only: it does not assert a boundary before/after
//      non-ASCII letters (Ś, Ł, ż, ę, …). For any pattern whose alternatives
//      include Polish (or other non-ASCII) words at the edges, we replace
//      `\b…\b` with Unicode-aware lookarounds `(?<!\p{L})…(?!\p{L})` and
//      add the `u` flag so `\p{L}` resolves. This affects: NUMBER_RE
//      (right-edge), STAT_PHRASES, LEGISLATION_RE, ORG_CLAIM_RE,
//      MEDICAL_NORM_RE. NUMBER_RE additionally extends the `tys` unit to
//      `tys\p{L}*` so it absorbs "tysięcy"/"tysiące". Patterns whose
//      alternatives are entirely ASCII (YEAR_CLAIM_RE, DATE_EVENT_RE,
//      COMPARISON_RE) keep `\b` as-is.
//   2. The 30-char minimum is gated on tag != "td" — table cells are short
//      by design (e.g. "300-600 mg") and Python's gate would skip every td.
//      We still enforce a min length of 1 on td so empty cells are rejected
//      (claimText must be non-empty per the shared schema).

const NUMBER_RE =
  /\b\d[\d,.\s\-–]*(?:%|million|billion|mln|mld|tys\p{L}*|thousand|percent|deaths|cases|prescriptions|users|mg|g|kg|ml|l|μg|mcg|ng|IU|j\.m\.|kcal|bpm|mmHg|μg\/dl|ng\/ml|mmol\/l|mg\/dl)(?!\p{L})/iu;

const YEAR_CLAIM_RE =
  /\b(?:in|w|of|since|od|from|around|circa|by|after|before|until|roku)\s+\d{4}\b/i;

const DATE_EVENT_RE =
  /\b(?:on\s+\w+\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+\w+\s+\d{4}|(?:dnia|w dniu)\s+\d{1,2}\s+\w+\s+\d{4})\b/i;

const STAT_PHRASES =
  /(?<!\p{L})(?:surpass|exceed|increas|decreas|rose|fell|grew|dropped|estimated|approximately|roughly|about \d|more than \d|less than \d|up to \d|over \d|around \d|nearly \d|times stronger|times more|times higher|times lower|wzrosł|spadł|oszacowa|około \d|ponad \d|blisko \d|prawie \d|razy silniejsz|razy więcej|razy wyższ|zwiększ|obniż|podnos|podnoś|zmniejsz|reduku|podwyższ|normalizuj|obniżen|popraw|pogarszaj|nasil|ogranicza|wzmacnia)\w*(?!\p{L})/iu;

const LEGISLATION_RE =
  /(?<!\p{L})(?:act|law|regulation|directive|treaty|monograph|schedule|ustawa|rozporządzenie|dyrektywa|regulacja)(?!\p{L})/iu;

const ORG_CLAIM_RE =
  /(?<!\p{L})(?:World Health Organization|WHO|FDA|DEA|EPA|CDC|EMA|EFSA|European Medicines Agency|Światowa Organizacja Zdrowia|American Chemical Society|National Institute|United Nations|European Union|Unia Europejska)(?!\p{L})/iu;

const MEDICAL_NORM_RE =
  /(?<!\p{L})(?:norma|normy|zakres|stężenie|dawka|dawkowanie|poziom wynosi|wynoszą|wynosi|referencyj|wartości prawidłowe|zakres referencyjny|wartość prawidłowa|standaryzowany|standaryzowanego)(?!\p{L})/iu;

const COMPARISON_RE =
  /\bo\s+(?:około\s+)?\d[\d,.\-–]*\s*%|w porównaniu (?:do|z|ze)|(?:więcej|mniej|wyższy|niższy|szybciej|wolniej|lepiej|gorzej)\s+(?:niż|od)|w stosunku do/i;

const PATTERNS: CategoryPattern[] = [
  { type: "statystyka",         weight: 3, re: NUMBER_RE },
  { type: "konkretna_data",     weight: 2, re: DATE_EVENT_RE },
  { type: "trend",              weight: 2, re: STAT_PHRASES },
  { type: "norma_medyczna",     weight: 2, re: MEDICAL_NORM_RE },
  { type: "porownanie",         weight: 2, re: COMPARISON_RE },
  { type: "datowane_zdarzenie", weight: 1, re: YEAR_CLAIM_RE },
  { type: "legislacja",         weight: 1, re: LEGISLATION_RE },
  { type: "organizacja",        weight: 1, re: ORG_CLAIM_RE },
];

export interface ExtractOptions {
  maxClaims: number;
  minScore: number;
}

export function extractClaims(
  html: string,
  opts: ExtractOptions,
): ExtractedClaim[] {
  const $ = cheerio.load(html);

  const claims: ExtractedClaim[] = [];
  let claimId = 1;
  let currentH2 = "Wstęp";

  // Walk in document order. cheerio's element selector preserves DOM order.
  // toArray() returns domhandler Element[] (each has a lowercase `tagName`).
  const elements = $("h2, p, li, td").toArray();

  for (const el of elements) {
    const $el = $(el);

    if (el.tagName === "h2") {
      currentH2 = $el.text().trim() || currentH2;
      continue;
    }

    const text = $el.text().replace(/\s+/g, " ").trim();
    // Skip very short paragraphs/list-items, but relax to non-empty for td:
    // table cells are short by design (e.g. "300-600 mg") and the surrounding
    // row context is what makes them claim-worthy. Empty cells are still
    // rejected so claimText (shared schema: min(1)) is never empty downstream.
    const minLen = el.tagName === "td" ? 1 : 30;
    if (text.length < minLen) continue;

    // Score against patterns
    let score = 0;
    const types: ExtractedClaim["claimTypes"] = [];

    for (const p of PATTERNS) {
      if (p.re.test(text)) {
        score += p.weight;
        types.push(p.type);
      }
    }

    if (score < opts.minScore) continue;

    // Build context
    let context: string;
    if (el.tagName === "td") {
      const $row = $el.closest("tr");
      const $table = $el.closest("table");
      const headers = $table
        .find("th")
        .toArray()
        .map((th) => $(th).text().trim());
      const cells = $row
        .find("td")
        .toArray()
        .map((td) => $(td).text().trim());
      const parts: string[] = [];
      if (headers.length > 0) {
        parts.push(`Nagłówki tabeli: ${headers.join(" | ")}`);
      }
      parts.push(`Wiersz: ${cells.join(" | ")}`);
      context = parts.join("\n");
    } else {
      context = text;
    }

    claims.push({
      id: claimId++,
      paragraphHtml: $.html($el),
      claimText: text.slice(0, 500),
      context,
      claimTypes: types,
      score,
      h2Context: currentH2,
      tagName: el.tagName as ClaimTagName,
    });
  }

  // Sort by score desc, then take top N
  claims.sort((a, b) => b.score - a.score);
  return claims.slice(0, opts.maxClaims);
}
