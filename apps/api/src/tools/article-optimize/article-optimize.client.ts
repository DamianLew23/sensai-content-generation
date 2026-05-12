// apps/api/src/tools/article-optimize/article-optimize.client.ts
import { Inject, Injectable, Logger } from "@nestjs/common";
import { OpenAIResponsesClient } from "../../llm/openai-responses.client";
import { tokenizeHybrid } from "../article-protect/article-protect.tokenize";
import { restoreHybrid } from "../article-protect/article-protect.restore";
import {
  hasAnchorTags,
  stripEmptyParagraphs,
  unwrapAnchors,
} from "../article-protect/article-protect.guards";
import { SOURCE_CITATION_RE } from "../article-protect/article-protect.regex";
import { buildOptimizeSystemPrompt } from "../../prompts/article-optimize.prompt";
import type { ArticleContextFields } from "../../prompts/article-context";
import type { ArticleOptimizeWarning } from "@sensai/shared";
import type { Env } from "../../config/env";

type ClientEnv = Pick<Env, "ARTICLE_OPTIMIZE_MODEL">;

export interface OptimizeArgs {
  ctx: { runId: string; stepId: string; attempt: number };
  keyword: string;
  language: string;
  htmlContent: string;
  articleContext?: ArticleContextFields;
}

export interface OptimizeResult {
  htmlContent: string;
  warnings: ArticleOptimizeWarning[];
  protection: {
    srcPlaceholdersTotal: number;
    srcPlaceholdersMissing: number;
    spansTotal: number;
    spansMissing: number;
  };
  stats: {
    inputLength: number;
    outputLength: number;
    sourcesBefore: number;
    sourcesAfter: number;
    anchorsRemoved: number;
  };
  cost: { costUsd: string; latencyMs: number };
}

@Injectable()
export class ArticleOptimizeClient {
  private readonly logger = new Logger(ArticleOptimizeClient.name);

  constructor(
    private readonly llm: OpenAIResponsesClient,
    @Inject("ARTICLE_OPTIMIZE_ENV") private readonly env: ClientEnv,
  ) {}

  async optimize(args: OptimizeArgs): Promise<OptimizeResult> {
    const cleaned = stripEmptyParagraphs(args.htmlContent);
    const inputLength = cleaned.length;

    const sourcesBefore = countMatches(cleaned, SOURCE_CITATION_RE);

    const { html: protectedHtml, srcMap, spanMap } = tokenizeHybrid(cleaned);
    const system = buildOptimizeSystemPrompt({
      language: args.language,
      sourceCount: sourcesBefore,
      articleContext: args.articleContext,
    });

    const resp = await this.llm.createBlock({
      ctx: args.ctx,
      model: this.env.ARTICLE_OPTIMIZE_MODEL,
      system,
      input: protectedHtml,
      reasoning: { effort: "medium" },
    });

    const restored = restoreHybrid(resp.outputText, srcMap, spanMap);
    if (restored.missingSrc.length > 0) {
      throw new Error(
        `article.optimize: source placeholder lost: ${restored.missingSrc.join(", ")}`,
      );
    }

    const warnings: ArticleOptimizeWarning[] = [];
    if (restored.missingSpans.length > 0) {
      warnings.push({
        kind: "optimize_spans_missing",
        message: `${restored.missingSpans.length} number/date spans missing after restore`,
        context: { count: String(restored.missingSpans.length) },
      });
    }

    const anchorsBefore = hasAnchorTags(restored.html);
    const anchorsRemovedHtml = unwrapAnchors(restored.html);
    const anchorsRemovedCount = countMatches(restored.html, /<a\b[^>]*>/gi);
    if (anchorsBefore && anchorsRemovedCount > 0) {
      warnings.push({
        kind: "optimize_anchors_unwrapped",
        message: `${anchorsRemovedCount} <a> tags removed per URL policy`,
        context: { count: String(anchorsRemovedCount) },
      });
    }

    const sourcesAfter = countMatches(anchorsRemovedHtml, SOURCE_CITATION_RE);
    const outputLength = anchorsRemovedHtml.length;

    return {
      htmlContent: anchorsRemovedHtml,
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
        sourcesBefore,
        sourcesAfter,
        anchorsRemoved: anchorsRemovedCount,
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
