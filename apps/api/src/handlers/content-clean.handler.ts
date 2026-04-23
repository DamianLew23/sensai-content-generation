import { Inject, Injectable, Logger } from "@nestjs/common";
import type { StepContext, StepHandler, StepResult } from "../orchestrator/step-handler";
import { ContentCleanerClient } from "../tools/content-cleaner/content-cleaner.client";
import { ToolCacheService } from "../tools/tool-cache.service";
import {
  ScrapeResult,
  type CleanedPage,
  type DroppedPage,
  type CleaningStats,
  type CleanedScrapeResult,
  type RunInput,
} from "@sensai/shared";
import { cleanHtml, removeDuplicateLines } from "../tools/content-cleaner/html-cleaner";
import { removeBlacklistedParagraphs } from "../tools/content-cleaner/blacklist";
import {
  splitIntoParagraphs,
  filterParagraphsByKeyword,
} from "../tools/content-cleaner/paragraph-filter";
import { findDiverseBlocks } from "../tools/content-cleaner/dedup";
import { deduplicateParagraphsAcrossBlocks } from "../tools/content-cleaner/cross-block-dedup";
import type { Env } from "../config/env";
import type { CleaningThresholds } from "../tools/content-cleaner/cleaning.types";

const TTL_DAYS = 7;

type HandlerEnv = Pick<
  Env,
  | "CLEANING_BLOCK_SIMILARITY_THRESHOLD"
  | "CLEANING_PARAGRAPH_KEYWORD_THRESHOLD"
  | "CLEANING_LENGTH_DIFF_THRESHOLD"
  | "CLEANING_TARGET_CHAR_LIMIT"
  | "CLEANING_MIN_PARAGRAPH_LENGTH"
>;

interface StagedPage {
  url: string;
  title: string;
  fetchedAt: string;
  originalChars: number;
  cleanedMarkdown: string;
  paragraphs: string[];
  removedParagraphs: number;
}

@Injectable()
export class ContentCleanHandler implements StepHandler {
  readonly type = "tool.content.clean";
  private readonly logger = new Logger(ContentCleanHandler.name);

  constructor(
    private readonly client: ContentCleanerClient,
    private readonly cache: ToolCacheService,
    @Inject("CLEANING_ENV") private readonly env: HandlerEnv,
  ) {}

  async execute(ctx: StepContext): Promise<StepResult> {
    const prev = ctx.previousOutputs.scrape;
    if (prev === undefined || prev === null) {
      throw new Error("content.clean requires previousOutputs.scrape");
    }
    const scrape = ScrapeResult.parse(prev);
    if (scrape.pages.length === 0) {
      throw new Error("content.clean: no pages to clean");
    }

    const keyword = this.composeKeyword(ctx.run.input as RunInput);
    const thresholds: CleaningThresholds = {
      blockSimilarityThreshold: this.env.CLEANING_BLOCK_SIMILARITY_THRESHOLD,
      paragraphKeywordThreshold: this.env.CLEANING_PARAGRAPH_KEYWORD_THRESHOLD,
      lengthDiffThreshold: this.env.CLEANING_LENGTH_DIFF_THRESHOLD,
      charLimit: this.env.CLEANING_TARGET_CHAR_LIMIT,
      minParagraphLength: this.env.CLEANING_MIN_PARAGRAPH_LENGTH,
    };

    const result = await this.cache.getOrSet<CleanedScrapeResult>({
      tool: "content",
      method: "clean",
      params: {
        pages: scrape.pages.map((p) => ({ url: p.url, markdown: p.markdown })),
        keyword,
        thresholds,
      },
      ttlSeconds: TTL_DAYS * 24 * 3600,
      runId: ctx.run.id,
      stepId: ctx.step.id,
      fetcher: async () => {
        const t0 = Date.now();
        const run = await this.runCleaning(scrape.pages, keyword, thresholds, ctx);
        const latencyMs = Date.now() - t0;
        return { result: run.output, costUsd: run.costUsd, latencyMs };
      },
    });

    return { output: result };
  }

  private composeKeyword(input: RunInput): string {
    let kw = input.topic;
    if (input.mainKeyword) kw += ` (${input.mainKeyword})`;
    if (input.intent) kw += ` — ${input.intent}`;
    return kw;
  }

  private async runCleaning(
    pages: Array<{ url: string; title: string; markdown: string; fetchedAt: string }>,
    keyword: string,
    thresholds: CleaningThresholds,
    ctx: StepContext,
  ): Promise<{ output: CleanedScrapeResult; costUsd: string }> {
    const inputPages = pages.length;
    const inputChars = pages.reduce((sum, p) => sum + p.markdown.length, 0);
    const droppedPages: DroppedPage[] = [];
    let blacklistedRemoved = 0;
    let totalCost = 0;

    // Phase 1 — per-page non-LLM cleanup
    const staged: StagedPage[] = [];
    for (const page of pages) {
      let md = cleanHtml(page.markdown);
      md = removeDuplicateLines(md);
      const { text: afterBl, removed } = removeBlacklistedParagraphs(md, thresholds.minParagraphLength);
      blacklistedRemoved += removed;

      if (!afterBl.trim()) {
        droppedPages.push({ url: page.url, reason: "empty_after_cleanup" });
        continue;
      }

      staged.push({
        url: page.url,
        title: page.title,
        fetchedAt: page.fetchedAt,
        originalChars: page.markdown.length,
        cleanedMarkdown: afterBl,
        paragraphs: [],
        removedParagraphs: 0,
      });
    }

    if (staged.length === 0) {
      return this.buildEmpty(inputPages, inputChars, droppedPages, blacklistedRemoved, 0, 0);
    }

    // Phase 2 — split paragraphs; call embedMany once for [keyword, ...allParagraphs]
    for (const s of staged) {
      s.paragraphs = splitIntoParagraphs(s.cleanedMarkdown, thresholds.minParagraphLength);
    }
    const flatParagraphs: string[] = [];
    const paraOffsets: number[] = [];
    for (const s of staged) {
      paraOffsets.push(flatParagraphs.length);
      flatParagraphs.push(...s.paragraphs);
    }

    if (flatParagraphs.length === 0) {
      // All pages had content but no paragraph passed minLen
      for (const s of staged) {
        droppedPages.push({ url: s.url, reason: "all_paragraphs_filtered" });
      }
      return this.buildEmpty(inputPages, inputChars, droppedPages, blacklistedRemoved, 0, 0);
    }

    const embedInput = [keyword, ...flatParagraphs];
    const emb1 = await this.client.embedTexts(embedInput, { runId: ctx.run.id, stepId: ctx.step.id });
    totalCost += parseFloat(emb1.costUsd);
    const keywordEmb = emb1.embeddings[0];
    const paraEmbs = emb1.embeddings.slice(1);

    // Phase 3 — per-page paragraph filter
    let keywordFilteredRemoved = 0;
    for (let i = 0; i < staged.length; i++) {
      const s = staged[i];
      const from = paraOffsets[i];
      const to = i + 1 < staged.length ? paraOffsets[i + 1] : flatParagraphs.length;
      const pageEmbs = paraEmbs.slice(from, to);

      const { kept, removed } = filterParagraphsByKeyword(
        s.paragraphs,
        pageEmbs,
        keywordEmb,
        thresholds.paragraphKeywordThreshold,
      );
      s.paragraphs = kept;
      s.removedParagraphs = removed.length;
      keywordFilteredRemoved += removed.length;
    }

    // Drop pages where all paragraphs were filtered
    const survivingIdx: number[] = [];
    for (let i = 0; i < staged.length; i++) {
      if (staged[i].paragraphs.length === 0) {
        droppedPages.push({ url: staged[i].url, reason: "all_paragraphs_filtered" });
      } else {
        survivingIdx.push(i);
      }
    }
    const surviving = survivingIdx.map((i) => staged[i]);

    if (surviving.length === 0) {
      return this.buildEmpty(
        inputPages,
        inputChars,
        droppedPages,
        blacklistedRemoved,
        keywordFilteredRemoved,
        0,
      );
    }

    // Phase 4 — cross-page paragraph dedup
    const dedupInput = surviving.map((s) => s.paragraphs);
    const { blocks: dedupBlocks, removed: crossPageDupesRemoved } =
      deduplicateParagraphsAcrossBlocks(dedupInput);
    for (let i = 0; i < surviving.length; i++) {
      surviving[i].paragraphs = dedupBlocks[i];
    }
    // After cross-page dedup, a block may be empty
    const survivingAfterX = surviving.filter((s) => {
      if (s.paragraphs.length === 0) {
        droppedPages.push({ url: s.url, reason: "all_paragraphs_filtered" });
        return false;
      }
      return true;
    });

    if (survivingAfterX.length === 0) {
      return this.buildEmpty(
        inputPages,
        inputChars,
        droppedPages,
        blacklistedRemoved,
        keywordFilteredRemoved,
        crossPageDupesRemoved,
      );
    }

    // Phase 5 — block-level dedup with length protection
    const blockTexts = survivingAfterX.map((s) => s.paragraphs.join("\n\n"));
    const emb2 = await this.client.embedTexts(blockTexts, { runId: ctx.run.id, stepId: ctx.step.id });
    totalCost += parseFloat(emb2.costUsd);

    const dedupResults = findDiverseBlocks(
      survivingAfterX.map((s, i) => ({ idx: i, content: blockTexts[i], embedding: emb2.embeddings[i] })),
      {
        similarityThreshold: thresholds.blockSimilarityThreshold,
        lengthDiffThreshold: thresholds.lengthDiffThreshold,
        charLimit: thresholds.charLimit,
      },
    );

    const keptIdx = new Set<number>();
    for (const r of dedupResults) {
      if (r.status === "kept") {
        keptIdx.add(r.idx);
      } else {
        const page = survivingAfterX[r.idx];
        const similarToUrl = r.similarToIdx !== undefined
          ? survivingAfterX[r.similarToIdx]?.url
          : undefined;
        droppedPages.push({
          url: page.url,
          reason: "similar_to_kept",
          similarToUrl,
          similarity: r.similarity,
        });
      }
    }

    // Phase 6 — assemble
    const finalPages: CleanedPage[] = survivingAfterX
      .map((s, i): CleanedPage | null => {
        if (!keptIdx.has(i)) return null;
        const markdown = s.paragraphs.join("\n\n");
        return {
          url: s.url,
          title: s.title,
          fetchedAt: s.fetchedAt,
          markdown,
          paragraphs: s.paragraphs,
          originalChars: s.originalChars,
          cleanedChars: markdown.length,
          removedParagraphs: s.removedParagraphs,
        };
      })
      .filter((p): p is CleanedPage => p !== null);

    const outputChars = finalPages.reduce((sum, p) => sum + p.cleanedChars, 0);
    const stats: CleaningStats = {
      inputPages,
      keptPages: finalPages.length,
      inputChars,
      outputChars,
      reductionPct: inputChars > 0 ? ((inputChars - outputChars) / inputChars) * 100 : 0,
      blacklistedRemoved,
      keywordFilteredRemoved,
      crossPageDupesRemoved,
    };

    this.logger.log(
      { reductionPct: stats.reductionPct, keptPages: stats.keptPages, droppedPages: droppedPages.length, costUsd: totalCost.toFixed(6) },
      "content-clean done",
    );

    return {
      output: { pages: finalPages, droppedPages, stats },
      costUsd: totalCost.toFixed(6),
    };
  }

  private buildEmpty(
    inputPages: number,
    inputChars: number,
    droppedPages: DroppedPage[],
    blacklistedRemoved: number,
    keywordFilteredRemoved: number,
    crossPageDupesRemoved: number,
  ): { output: CleanedScrapeResult; costUsd: string } {
    return {
      output: {
        pages: [],
        droppedPages,
        stats: {
          inputPages,
          keptPages: 0,
          inputChars,
          outputChars: 0,
          reductionPct: inputChars > 0 ? 100 : 0,
          blacklistedRemoved,
          keywordFilteredRemoved,
          crossPageDupesRemoved,
        },
      },
      costUsd: "0",
    };
  }
}
