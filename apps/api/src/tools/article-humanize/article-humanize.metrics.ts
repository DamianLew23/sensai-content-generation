// apps/api/src/tools/article-humanize/article-humanize.metrics.ts
//
// Humanize-specific metrics: sentence stats, readability, English-probe,
// retry decision. Pure functions — no side effects, no DI.
//
// Sentence splitting is regex-based: `[.!?]+` followed by whitespace. Fine for
// PL/EN; undercounts where ellipses or abbreviations appear. Metrics are
// advisory.

import { extractPlainText } from "../article-protect/article-protect.guards";

const ENGLISH_PROBE_TOKENS = [
  " the ",
  " and ",
  " this ",
  " that ",
  " however ",
] as const;

function splitSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by:
  //   - whitespace (normal case), OR
  //   - end of string, OR
  //   - an uppercase letter with no space (happens when extractPlainText
  //     concatenates adjacent block elements without inserting spaces)
  return text
    .split(/[.!?]+(?:\s+|\s*(?=\p{Lu}))/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

function tokenize(text: string): string[] {
  // Unicode-aware tokenizer — JS `\w` is ASCII-only even with the `u` flag, so
  // Polish characters (ą, ć, ę, ł, ń, ó, ś, ź, ż) would fragment word tokens.
  // Use Unicode property escapes to match letters, marks, digits, underscores
  // and hyphens; matches the Python reference's `re.UNICODE` semantics.
  return text.match(/[\p{L}\p{M}\p{N}_-]+/gu) ?? [];
}

export interface SentenceStats {
  varianceInput: number; // populated only when caller passes input — see computeSentenceVarianceForText
  varianceOutput: number;
  cvOutput: number;
  minLength: number;
  maxLength: number;
  avgLength: number;
}

export function computeSentenceStats(text: string): SentenceStats {
  const sents = splitSentences(text);
  if (sents.length === 0) {
    return {
      varianceInput: 0,
      varianceOutput: 0,
      cvOutput: 0,
      minLength: 0,
      maxLength: 0,
      avgLength: 0,
    };
  }
  const lens = sents.map((s) => tokenize(s).length);
  const min = Math.min(...lens);
  const max = Math.max(...lens);
  const avg = lens.reduce((a, b) => a + b, 0) / lens.length;
  let variance = 0;
  if (lens.length > 1) {
    const mean = avg;
    variance =
      lens.reduce((acc, n) => acc + (n - mean) * (n - mean), 0) /
      (lens.length - 1);
  }
  const stddev = Math.sqrt(variance);
  const cv = avg > 0 ? stddev / avg : 0;
  return {
    varianceInput: 0,
    varianceOutput: round(variance, 4),
    cvOutput: round(cv, 4),
    minLength: min,
    maxLength: max,
    avgLength: round(avg, 2),
  };
}

export function computeSentenceVarianceForText(text: string): number {
  const sents = splitSentences(text);
  if (sents.length < 2) return 0;
  const lens = sents.map((s) => tokenize(s).length);
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
  return round(
    lens.reduce((acc, n) => acc + (n - mean) * (n - mean), 0) /
      (lens.length - 1),
    4,
  );
}

export interface Readability {
  wordsTotal: number;
  sentencesTotal: number;
  avgSentenceLength: number;
  longSentencesGtCap: number;
  strongSpans: number;
  boldTokenCount: number;
  boldShare: number;
}

export function computeReadability(html: string, sentenceHardCap: number): Readability {
  const visible = extractPlainText(html);
  const sents = splitSentences(visible);
  const words = tokenize(visible);
  const W = words.length;
  const S = Math.max(1, sents.length);
  const longCount = sents.filter((s) => tokenize(s).length > sentenceHardCap)
    .length;

  const strongSpans: string[] = [];
  const re = /<strong\b[^>]*>([\s\S]*?)<\/strong>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    strongSpans.push(m[1]);
  }
  const boldTokenCount = strongSpans.reduce(
    (acc, span) => acc + tokenize(span.replace(/<[^>]+>/g, " ")).length,
    0,
  );
  const boldShare = W > 0 ? boldTokenCount / W : 0;

  return {
    wordsTotal: W,
    sentencesTotal: S,
    avgSentenceLength: round(W / S, 2),
    longSentencesGtCap: longCount,
    strongSpans: strongSpans.length,
    boldTokenCount,
    boldShare: round(boldShare, 4),
  };
}

export function englishProbeHits(text: string): number {
  const probe = text.slice(0, 1000).toLowerCase();
  return ENGLISH_PROBE_TOKENS.reduce(
    (acc, tok) => acc + countOccurrences(probe, tok),
    0,
  );
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count += 1;
    pos += needle.length;
  }
  return count;
}

export interface RetryDecisionInput {
  avgSentenceLength: number;
  longSentencesGtCap: number;
  strongSpans: number;
  wordsTotal: number;
  sentencesTotal: number;
  boldTokenCount: number;
  boldShare: number;
}

export interface RetryConfig {
  asl_max: number;
  sentence_hard_cap: number;
  min_strong_per_block: number;
  retry_enabled: boolean;
}

export interface RetryDecision {
  retry: boolean;
  reasons: Array<"asl" | "long" | "strong">;
}

export function shouldRetry(
  metrics: RetryDecisionInput,
  cfg: RetryConfig,
): RetryDecision {
  if (!cfg.retry_enabled) return { retry: false, reasons: [] };
  const reasons: Array<"asl" | "long" | "strong"> = [];
  if (metrics.avgSentenceLength > cfg.asl_max) reasons.push("asl");
  if (metrics.longSentencesGtCap > 0) reasons.push("long");
  if (metrics.strongSpans < cfg.min_strong_per_block) reasons.push("strong");
  return { retry: reasons.length > 0, reasons };
}

export function formatBoldShare(value: number): string {
  return value.toFixed(4);
}

function round(value: number, places: number): number {
  const f = Math.pow(10, places);
  return Math.round(value * f) / f;
}
