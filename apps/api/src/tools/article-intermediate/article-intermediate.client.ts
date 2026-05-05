// apps/api/src/tools/article-intermediate/article-intermediate.client.ts
import { Inject, Injectable, Logger } from "@nestjs/common";
import { OpenAIResponsesClient } from "../../llm/openai-responses.client";
import { tokenizeHybrid } from "../article-protect/article-protect.tokenize";
import { restoreHybrid } from "../article-protect/article-protect.restore";
import {
  countFormatting,
  detectSeoIntro,
  extractNumberSet,
  extractPlainText,
  hasAnchorTags,
  hasH1Tag,
} from "../article-protect/article-protect.guards";
import { SOURCE_CITATION_RE } from "../article-protect/article-protect.regex";
import { buildIntermediateSystemPrompt } from "../../prompts/article-intermediate.prompt";
import type {
  ArticleIntermediateWarning,
  FormattingCounts,
} from "@sensai/shared";
import type { Env } from "../../config/env";

type ClientEnv = Pick<
  Env,
  "ARTICLE_INTERMEDIATE_MODEL" | "ARTICLE_INTERMEDIATE_MAX_GROWTH"
>;

export interface IntermediateArgs {
  ctx: { runId: string; stepId: string; attempt: number };
  keyword: string;
  language: string;
  htmlContent: string;
}

export interface IntermediateResult {
  htmlContent: string;
  warnings: ArticleIntermediateWarning[];
  protection: {
    srcPlaceholdersTotal: number;
    srcPlaceholdersMissing: number;
    spansTotal: number;
    spansMissing: number;
  };
  stats: {
    inputLength: number;
    outputLength: number;
    growth: number;
    sourcesBefore: number;
    sourcesAfter: number;
    formattingBefore: FormattingCounts;
    formattingAfter: FormattingCounts;
  };
  cost: { costUsd: string; latencyMs: number };
}

@Injectable()
export class ArticleIntermediateClient {
  private readonly logger = new Logger(ArticleIntermediateClient.name);

  constructor(
    private readonly llm: OpenAIResponsesClient,
    @Inject("ARTICLE_INTERMEDIATE_ENV") private readonly env: ClientEnv,
  ) {}

  async intermediate(args: IntermediateArgs): Promise<IntermediateResult> {
    const inputText = extractPlainText(args.htmlContent);
    const inputLength = inputText.length;
    const inputNumbers = extractNumberSet(inputText);
    const sourcesBefore = countMatches(args.htmlContent, SOURCE_CITATION_RE);
    const formattingBefore = countFormatting(args.htmlContent);

    const { html: protectedHtml, srcMap, spanMap } = tokenizeHybrid(
      args.htmlContent,
    );
    const system = buildIntermediateSystemPrompt({
      language: args.language,
      maxLengthGrowth: this.env.ARTICLE_INTERMEDIATE_MAX_GROWTH,
    });

    const resp = await this.llm.createBlock({
      ctx: args.ctx,
      model: this.env.ARTICLE_INTERMEDIATE_MODEL,
      system,
      input: protectedHtml,
      reasoning: { effort: "medium" },
    });

    const restored = restoreHybrid(resp.outputText, srcMap, spanMap);
    if (restored.missingSrc.length > 0) {
      throw new Error(
        `article.intermediate: source placeholder lost: ${restored.missingSrc.join(", ")}`,
      );
    }

    const warnings: ArticleIntermediateWarning[] = [];
    if (restored.missingSpans.length > 0) {
      warnings.push({
        kind: "intermediate_spans_missing",
        message: `${restored.missingSpans.length} number/date spans missing after restore`,
        context: { count: String(restored.missingSpans.length) },
      });
    }

    const outHtml = restored.html;

    // GUARD 1: <h1> required.
    if (!hasH1Tag(outHtml)) {
      throw new Error("article.intermediate: hard fail — missing <h1>");
    }

    // GUARD 2: no <a> tags.
    if (hasAnchorTags(outHtml)) {
      throw new Error("article.intermediate: hard fail — <a> anchor added");
    }

    // GUARD 3: length growth bound.
    const outputText = extractPlainText(outHtml);
    const outputLength = outputText.length;
    const growth =
      inputLength > 0 ? (outputLength - inputLength) / inputLength : 0;
    if (growth > this.env.ARTICLE_INTERMEDIATE_MAX_GROWTH) {
      throw new Error(
        `article.intermediate: hard fail — length growth ${(growth * 100).toFixed(1)}% > ${(this.env.ARTICLE_INTERMEDIATE_MAX_GROWTH * 100).toFixed(0)}%`,
      );
    }

    // GUARD 4: numbers preserved.
    const outputNumbers = extractNumberSet(outputText);
    const lostNumbers = [...inputNumbers].filter((v) => !outputNumbers.has(v));
    if (lostNumbers.length > 0) {
      throw new Error(
        `article.intermediate: hard fail — lost numbers: ${lostNumbers.slice(0, 5).join(", ")}`,
      );
    }

    // GUARD 5: source citation count.
    const sourcesAfter = countMatches(outHtml, SOURCE_CITATION_RE);
    if (sourcesAfter < sourcesBefore) {
      throw new Error(
        `article.intermediate: hard fail — sources count dropped ${sourcesBefore} → ${sourcesAfter}`,
      );
    }

    // GUARD 6: SEO intro.
    if (detectSeoIntro(outHtml, args.language)) {
      throw new Error("article.intermediate: hard fail — SEO intro pattern detected");
    }

    const formattingAfter = countFormatting(outHtml);

    return {
      htmlContent: outHtml,
      warnings,
      protection: {
        srcPlaceholdersTotal: Object.keys(srcMap).length,
        srcPlaceholdersMissing: restored.missingSrc.length,
        spansTotal: Object.keys(spanMap).length,
        spansMissing: restored.missingSpans.length,
      },
      stats: {
        inputLength,
        outputLength,
        growth,
        sourcesBefore,
        sourcesAfter,
        formattingBefore,
        formattingAfter,
      },
      cost: { costUsd: resp.costUsd, latencyMs: resp.latencyMs },
    };
  }
}

function countMatches(text: string, re: RegExp): number {
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  const local = new RegExp(re.source, flags);
  return (text.match(local) ?? []).length;
}
