// apps/api/src/tools/article-humanize/article-humanize.client.ts
import { Inject, Injectable, Logger } from "@nestjs/common";
import { OpenAIResponsesClient } from "../../llm/openai-responses.client";
import { tokenizeHybrid } from "../article-protect/article-protect.tokenize";
import { restoreHybrid } from "../article-protect/article-protect.restore";
import { SOURCE_CITATION_RE } from "../article-protect/article-protect.regex";
import {
  extractNumberSet,
  extractPlainText,
} from "../article-protect/article-protect.guards";
import {
  buildHumanizeSystemPrompt,
  buildHumanizeRetryPrompt,
} from "../../prompts/article-humanize.prompt";
import {
  computeReadability,
  computeSentenceStats,
  computeSentenceVarianceForText,
  englishProbeHits,
  shouldRetry,
  type Readability,
  type SentenceStats,
} from "./article-humanize.metrics";
import type {
  ArticleHumanizeWarning,
  ArticleHumanizeReadability,
  ArticleHumanizeSentenceStats,
} from "@sensai/shared";
import type { Env } from "../../config/env";

type ClientEnv = Pick<
  Env,
  | "ARTICLE_HUMANIZE_MODEL"
  | "ARTICLE_HUMANIZE_ASL_MIN"
  | "ARTICLE_HUMANIZE_ASL_MAX"
  | "ARTICLE_HUMANIZE_SENTENCE_HARD_CAP"
  | "ARTICLE_HUMANIZE_MIN_STRONG_PER_BLOCK"
  | "ARTICLE_HUMANIZE_MAX_STRONG_PER_BLOCK"
  | "ARTICLE_HUMANIZE_STRONG_WORDS_PER_BLOCK"
  | "ARTICLE_HUMANIZE_BOLD_SHARE_MAX"
  | "ARTICLE_HUMANIZE_MIN_LEN_RATIO"
  | "ARTICLE_HUMANIZE_MAX_LEN_RATIO"
  | "ARTICLE_HUMANIZE_RETRY_ENABLED"
  | "ARTICLE_HUMANIZE_LANG_PROBE_THRESHOLD"
>;

export interface HumanizeArgs {
  ctx: { runId: string; stepId: string; attempt: number };
  keyword: string;
  language: string;
  htmlContent: string;
}

export interface HumanizeResult {
  htmlContent: string;
  warnings: ArticleHumanizeWarning[];
  protection: {
    srcPlaceholdersTotal: number;
    srcPlaceholdersMissing: number;
    spansTotal: number;
    spansMissing: number;
  };
  stats: {
    inputLength: number;
    outputLength: number;
    ratio: number;
    sourcesBefore: number;
    sourcesAfter: number;
    emDashesReplaced: number;
    retryUsed: boolean;
    retryAccepted: boolean;
    totalCostUsd: string;
    totalLatencyMs: number;
    readability: ArticleHumanizeReadability;
    sentence: ArticleHumanizeSentenceStats;
  };
}

@Injectable()
export class ArticleHumanizeClient {
  private readonly logger = new Logger(ArticleHumanizeClient.name);

  constructor(
    private readonly llm: OpenAIResponsesClient,
    @Inject("ARTICLE_HUMANIZE_ENV") private readonly env: ClientEnv,
  ) {}

  async humanize(args: HumanizeArgs): Promise<HumanizeResult> {
    const inputText = extractPlainText(args.htmlContent);
    const inputLength = inputText.length;
    const inputVariance = computeSentenceVarianceForText(inputText);
    const sourcesBefore = countMatches(args.htmlContent, SOURCE_CITATION_RE);

    // PHASE 1 — humanization (20 rules).
    const phase1 = await this.runPhase({
      ctx: args.ctx,
      systemPrompt: buildHumanizeSystemPrompt({
        language: args.language,
        asl_min: this.env.ARTICLE_HUMANIZE_ASL_MIN,
        asl_max: this.env.ARTICLE_HUMANIZE_ASL_MAX,
        sentence_hard_cap: this.env.ARTICLE_HUMANIZE_SENTENCE_HARD_CAP,
        min_strong_per_block: this.env.ARTICLE_HUMANIZE_MIN_STRONG_PER_BLOCK,
        max_strong_per_block: this.env.ARTICLE_HUMANIZE_MAX_STRONG_PER_BLOCK,
        strong_words_per_block: this.env.ARTICLE_HUMANIZE_STRONG_WORDS_PER_BLOCK,
      }),
      htmlContent: args.htmlContent,
      phaseLabel: "humanize.phase1",
    });

    let humanizedHtml = phase1.html;
    const warnings: ArticleHumanizeWarning[] = [];
    if (phase1.missingSpans.length > 0) {
      warnings.push({
        kind: "humanize_spans_missing",
        message: `${phase1.missingSpans.length} number/date spans missing after restore`,
        context: { count: String(phase1.missingSpans.length), phase: "1" },
      });
    }

    let retryUsed = false;
    let retryAccepted = false;
    let totalCostUsd = phase1.costUsd;
    let totalLatencyMs = phase1.latencyMs;
    let totalSpansTotal = phase1.spansTotal;
    let totalSrcTotal = phase1.srcTotal;
    let cumulativeSrcMissing = phase1.missingSrc.length;
    let cumulativeSpansMissing = phase1.missingSpans.length;

    // Em-dash cleanup is the LAST mutation before guards/metrics. Apply
    // here on the Phase-1 output; if Phase 2 runs, we re-apply on the final.
    let emDashCount = countEmDashes(humanizedHtml);
    humanizedHtml = collapseEmDashes(humanizedHtml);

    // METRICS on humanized HTML — used to decide retry.
    const readability1 = computeReadability(
      humanizedHtml,
      this.env.ARTICLE_HUMANIZE_SENTENCE_HARD_CAP,
    );
    const decision = shouldRetry(readability1, {
      asl_max: this.env.ARTICLE_HUMANIZE_ASL_MAX,
      sentence_hard_cap: this.env.ARTICLE_HUMANIZE_SENTENCE_HARD_CAP,
      min_strong_per_block: this.env.ARTICLE_HUMANIZE_MIN_STRONG_PER_BLOCK,
      retry_enabled: this.env.ARTICLE_HUMANIZE_RETRY_ENABLED,
    });

    let finalHtml = humanizedHtml;
    let finalReadability: Readability = readability1;

    if (decision.retry) {
      retryUsed = true;
      const phase2 = await this.runPhase({
        ctx: args.ctx,
        systemPrompt: buildHumanizeRetryPrompt({
          asl_min: this.env.ARTICLE_HUMANIZE_ASL_MIN,
          asl_max: this.env.ARTICLE_HUMANIZE_ASL_MAX,
          sentence_hard_cap: this.env.ARTICLE_HUMANIZE_SENTENCE_HARD_CAP,
          min_strong_per_block: this.env.ARTICLE_HUMANIZE_MIN_STRONG_PER_BLOCK,
          max_strong_per_block: this.env.ARTICLE_HUMANIZE_MAX_STRONG_PER_BLOCK,
          strong_words_per_block: this.env.ARTICLE_HUMANIZE_STRONG_WORDS_PER_BLOCK,
        }),
        htmlContent: humanizedHtml,
        phaseLabel: "humanize.phase2",
      });
      totalCostUsd = sumDecimal(totalCostUsd, phase2.costUsd);
      totalLatencyMs += phase2.latencyMs;
      // NOTE: totalSpansTotal and totalSrcTotal are NOT accumulated from phase2.
      // They reflect the ORIGINAL document's tokenization counts (phase1).
      // Phase2 re-tokenizes already-restored HTML so its counts are redundant.
      cumulativeSrcMissing += phase2.missingSrc.length;
      cumulativeSpansMissing += phase2.missingSpans.length;

      // Reject retry if it added anchors (input was anchor-free per Plan 15).
      const retryAddsAnchor = /<a\b[^>]*>/i.test(phase2.html);
      // Reject retry if it lost a SRC placeholder (rare but possible).
      const retryLostSrc = phase2.missingSrc.length > 0;

      if (retryAddsAnchor) {
        warnings.push({
          kind: "humanize_retry_rejected_anchors",
          message: "Phase 2 retry added <a> tags — discarded",
          context: {},
        });
      } else if (retryLostSrc) {
        warnings.push({
          kind: "humanize_retry_rejected_anchors",
          message: `Phase 2 retry lost ${phase2.missingSrc.length} source placeholder(s) — discarded`,
          context: { count: String(phase2.missingSrc.length) },
        });
      } else {
        retryAccepted = true;
        const phase2Cleaned = collapseEmDashes(phase2.html);
        emDashCount += countEmDashes(phase2.html);
        finalHtml = phase2Cleaned;
        finalReadability = computeReadability(
          finalHtml,
          this.env.ARTICLE_HUMANIZE_SENTENCE_HARD_CAP,
        );
        if (phase2.missingSpans.length > 0) {
          warnings.push({
            kind: "humanize_spans_missing",
            message: `${phase2.missingSpans.length} number/date spans missing after retry restore`,
            context: { count: String(phase2.missingSpans.length), phase: "2" },
          });
        }
      }

      warnings.push({
        kind: "humanize_retry_used",
        message: `retry triggered: ${decision.reasons.join(",")}; accepted=${retryAccepted}`,
        context: {
          reasons: decision.reasons.join(","),
          accepted: String(retryAccepted),
        },
      });
    }

    // FINAL TEXT METRICS — for stats output.
    const finalText = extractPlainText(finalHtml);
    const outputLength = finalText.length;
    const sourcesAfter = countMatches(finalHtml, SOURCE_CITATION_RE);
    const ratio = inputLength > 0 ? outputLength / inputLength : 0;

    // ---------- HARD-FAIL GUARDS (5) ----------
    // GUARD 1: <h1> required.
    if (!/<h1\b[^>]*>/i.test(finalHtml)) {
      throw new Error("article.humanize: hard fail — missing <h1>");
    }

    // GUARD 2: no <a> tags.
    if (/<a\b[^>]*>/i.test(finalHtml)) {
      throw new Error("article.humanize: hard fail — <a> anchor added");
    }

    // GUARD 3: length ratio bounds (two-sided).
    if (
      ratio < this.env.ARTICLE_HUMANIZE_MIN_LEN_RATIO ||
      ratio > this.env.ARTICLE_HUMANIZE_MAX_LEN_RATIO
    ) {
      throw new Error(
        `article.humanize: hard fail — length ratio ${ratio.toFixed(3)} outside [${this.env.ARTICLE_HUMANIZE_MIN_LEN_RATIO}, ${this.env.ARTICLE_HUMANIZE_MAX_LEN_RATIO}]`,
      );
    }

    // GUARD 4: numbers preserved.
    const inputNumbers = extractNumberSet(inputText);
    const outputNumbers = extractNumberSet(finalText);
    const lostNumbers = [...inputNumbers].filter((v) => !outputNumbers.has(v));
    if (lostNumbers.length > 0) {
      throw new Error(
        `article.humanize: hard fail — lost numbers: ${lostNumbers.slice(0, 5).join(", ")}`,
      );
    }

    // GUARD 5: source citation count.
    if (sourcesAfter < sourcesBefore) {
      throw new Error(
        `article.humanize: hard fail — sources count dropped ${sourcesBefore} → ${sourcesAfter}`,
      );
    }
    // ---------- END GUARDS ----------

    const sentence = computeSentenceStats(finalText);
    sentence.varianceInput = inputVariance;

    // WARN-ONLY STYLE CHECKS.
    if (sentence.cvOutput <= 0.45) {
      warnings.push({
        kind: "humanize_low_burstiness",
        message: `coefficient of variation ${sentence.cvOutput.toFixed(3)} ≤ 0.45`,
        context: { cv: sentence.cvOutput.toFixed(4) },
      });
    }
    if (args.language.toLowerCase().startsWith("pl")) {
      const enHits = englishProbeHits(finalText);
      if (enHits > this.env.ARTICLE_HUMANIZE_LANG_PROBE_THRESHOLD) {
        warnings.push({
          kind: "humanize_language_probe",
          message: `English token probe hit ${enHits} (threshold ${this.env.ARTICLE_HUMANIZE_LANG_PROBE_THRESHOLD})`,
          context: { hits: String(enHits) },
        });
      }
    }

    return {
      htmlContent: finalHtml,
      warnings,
      protection: {
        srcPlaceholdersTotal: totalSrcTotal,
        srcPlaceholdersMissing: cumulativeSrcMissing,
        spansTotal: totalSpansTotal,
        spansMissing: cumulativeSpansMissing,
      },
      stats: {
        inputLength,
        outputLength,
        ratio: round(ratio, 4),
        sourcesBefore,
        sourcesAfter,
        emDashesReplaced: emDashCount,
        retryUsed,
        retryAccepted,
        totalCostUsd,
        totalLatencyMs,
        readability: finalReadability,
        sentence,
      },
    };
  }

  private async runPhase(args: {
    ctx: { runId: string; stepId: string; attempt: number };
    systemPrompt: string;
    htmlContent: string;
    phaseLabel: string;
  }): Promise<{
    html: string;
    missingSrc: string[];
    missingSpans: string[];
    srcTotal: number;
    spansTotal: number;
    costUsd: string;
    latencyMs: number;
  }> {
    const { html: protectedHtml, srcMap, spanMap } = tokenizeHybrid(
      args.htmlContent,
    );
    const resp = await this.llm.createBlock({
      ctx: args.ctx,
      model: this.env.ARTICLE_HUMANIZE_MODEL,
      system: args.systemPrompt,
      input: protectedHtml,
      reasoning: { effort: "medium" },
    });
    const restored = restoreHybrid(resp.outputText, srcMap, spanMap);
    return {
      html: restored.html,
      missingSrc: restored.missingSrc,
      missingSpans: restored.missingSpans,
      srcTotal: Object.keys(srcMap).length,
      spansTotal: Object.keys(spanMap).length,
      costUsd: resp.costUsd,
      latencyMs: resp.latencyMs,
    };
  }
}

function countMatches(text: string, re: RegExp): number {
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  const local = new RegExp(re.source, flags);
  return (text.match(local) ?? []).length;
}

function countEmDashes(s: string): number {
  return (s.match(/—/g) ?? []).length;
}

function collapseEmDashes(s: string): string {
  return s.replace(/\s*—\s*/g, " - ");
}

function sumDecimal(a: string, b: string): string {
  const out = (parseFloat(a) + parseFloat(b)).toFixed(6);
  // Trim trailing zero pad to a max of 6 decimals (we keep all 6 for stability).
  return out;
}

function round(value: number, places: number): number {
  const f = Math.pow(10, places);
  return Math.round(value * f) / f;
}
