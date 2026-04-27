import { Injectable } from "@nestjs/common";
import pLimit from "p-limit";
import type { StepContext, StepHandler, StepResult } from "../orchestrator/step-handler";
import { Crawl4aiClient, CRAWL4AI_COST_PER_SCRAPE } from "../tools/crawl4ai/crawl4ai.client";
import { FirecrawlClient, FIRECRAWL_COST_PER_SCRAPE } from "../tools/firecrawl/firecrawl.client";
import { ToolCacheService } from "../tools/tool-cache.service";
import { ToolCallRecorder } from "../tools/tool-call-recorder.service";
import { HttpError } from "../tools/http-error";
import { PAGE_MARKDOWN_CAP } from "../tools/firecrawl/scrape.types";
import { MIN_CONTENT_CHARS, isCloudflareChallenge } from "../tools/crawl4ai/scrape.types";
import { ScrapeAttemptsError } from "./scrape-attempts-error";
import type { ScrapePage, ScrapeAttempt, ScrapeFailure, ScrapeResult } from "@sensai/shared";
import { createHash } from "node:crypto";
import { stableStringify } from "../tools/stable-stringify";

interface StepInput {
  urls: string[];
}

const FALLBACK_STATUSES = new Set([403, 429, 503]);

@Injectable()
export class ScrapeFetchHandler implements StepHandler {
  readonly type = "tool.scrape";

  constructor(
    private readonly crawl4ai: Crawl4aiClient,
    private readonly firecrawl: FirecrawlClient,
    private readonly cache: ToolCacheService,
    private readonly recorder: ToolCallRecorder,
  ) {}

  async execute(ctx: StepContext): Promise<StepResult> {
    const input = ctx.step.input as StepInput | null;
    if (!input || !Array.isArray(input.urls) || input.urls.length === 0) {
      throw new Error("tool.scrape requires step.input.urls (set via resume endpoint)");
    }

    const pages: ScrapePage[] = [];
    const failures: ScrapeFailure[] = [];
    let shortCircuit: Error | null = null;
    let exhaustedCount = 0;

    const handleOne = async (url: string): Promise<void> => {
      if (shortCircuit) return;
      try {
        const page = await this.fetchSingle(url, ctx);
        pages.push(page);
      } catch (err: any) {
        if (err instanceof HttpError && (err.status === 401 || err.status === 402)) {
          shortCircuit = err;
          return;
        }
        if (err instanceof ScrapeAttemptsError) {
          const last = err.attempts[err.attempts.length - 1];
          failures.push({
            url,
            reason: last?.reason ?? "unknown",
            httpStatus: last?.httpStatus,
            attempts: err.attempts,
          });
          exhaustedCount++;
          return;
        }
        failures.push({ url, reason: classifyReason(err), httpStatus: err instanceof HttpError ? err.status : undefined });
      }
    };

    const [firstUrl, ...restUrls] = input.urls;
    await handleOne(firstUrl);

    if (!shortCircuit && restUrls.length > 0) {
      const limit = pLimit(3);
      await Promise.all(restUrls.map((url) => limit(() => handleOne(url))));
    }

    if (shortCircuit) throw shortCircuit;
    if (pages.length === 0 && exhaustedCount > 0) {
      throw new Error(`All scrape URLs failed (${failures.length} failures)`);
    }

    const result: ScrapeResult = { pages, failures };
    return { output: result };
  }

  private async fetchSingle(url: string, ctx: StepContext): Promise<ScrapePage> {
    return this.cache.getOrSet<ScrapePage>({
      tool: "scrape",
      method: "url",
      params: { url },
      ttlSeconds: 86_400,
      runId: ctx.run.id,
      stepId: ctx.step.id,
      forceRefresh: ctx.forceRefresh,
      fetcher: () => this.scrapeWithFallback(url, ctx),
    });
  }

  private async scrapeWithFallback(
    url: string,
    ctx: StepContext,
  ): Promise<{ result: ScrapePage; costUsd: string; latencyMs: number }> {
    const attempts: ScrapeAttempt[] = [];

    // crawl4ai
    const c4aHash = hashParams({ url, source: "crawl4ai" });
    const c4aStart = Date.now();
    try {
      const raw = await this.crawl4ai.scrape({ url });
      const trimmed = raw.markdown.trim();
      if (trimmed.length < MIN_CONTENT_CHARS) {
        await this.recordInner(ctx, "crawl4ai", c4aHash, Date.now() - c4aStart, { reason: "short_content" });
        attempts.push({ source: "crawl4ai", reason: "short_content" });
      } else if (isCloudflareChallenge(trimmed)) {
        await this.recordInner(ctx, "crawl4ai", c4aHash, Date.now() - c4aStart, { reason: "cf_challenge" });
        attempts.push({ source: "crawl4ai", reason: "cf_challenge" });
      } else {
        const c4aLatency = Date.now() - c4aStart;
        await this.recordInner(ctx, "crawl4ai", c4aHash, c4aLatency, null, CRAWL4AI_COST_PER_SCRAPE);
        return {
          result: toScrapePage(raw, "crawl4ai"),
          costUsd: CRAWL4AI_COST_PER_SCRAPE,
          latencyMs: c4aLatency,
        };
      }
    } catch (err) {
      if (err instanceof HttpError && (err.status === 401 || err.status === 402)) {
        await this.recordInner(ctx, "crawl4ai", c4aHash, Date.now() - c4aStart, { reason: err.code, httpStatus: err.status });
        throw err;
      }
      if (err instanceof HttpError && !FALLBACK_STATUSES.has(err.status)) {
        await this.recordInner(ctx, "crawl4ai", c4aHash, Date.now() - c4aStart, { reason: err.code, httpStatus: err.status });
        throw err;
      }
      const reason = classifyReason(err);
      const httpStatus = err instanceof HttpError ? err.status : undefined;
      await this.recordInner(ctx, "crawl4ai", c4aHash, Date.now() - c4aStart, { reason, httpStatus });
      attempts.push({ source: "crawl4ai", reason, httpStatus });
    }

    // firecrawl fallback
    const fcHash = hashParams({ url, source: "firecrawl" });
    const fcStart = Date.now();
    try {
      const raw = await this.firecrawl.scrape({ url });
      const fcLatency = Date.now() - fcStart;
      await this.recordInner(ctx, "firecrawl", fcHash, fcLatency, null, FIRECRAWL_COST_PER_SCRAPE);
      return {
        result: toScrapePage(raw, "firecrawl"),
        costUsd: FIRECRAWL_COST_PER_SCRAPE,
        latencyMs: fcLatency,
      };
    } catch (err) {
      if (err instanceof HttpError && (err.status === 401 || err.status === 402)) {
        await this.recordInner(ctx, "firecrawl", fcHash, Date.now() - fcStart, { reason: err.code, httpStatus: err.status });
        throw err;
      }
      const reason = classifyReason(err);
      const httpStatus = err instanceof HttpError ? err.status : undefined;
      await this.recordInner(ctx, "firecrawl", fcHash, Date.now() - fcStart, { reason, httpStatus });
      attempts.push({ source: "firecrawl", reason, httpStatus });
      throw new ScrapeAttemptsError(attempts, err);
    }
  }

  private async recordInner(
    ctx: StepContext,
    tool: "crawl4ai" | "firecrawl",
    paramsHash: string,
    latencyMs: number,
    error: { reason: string; httpStatus?: number } | null,
    costUsd = "0",
  ): Promise<void> {
    await this.recorder.record({
      runId: ctx.run.id,
      stepId: ctx.step.id,
      tool,
      method: "scrape",
      paramsHash,
      fromCache: false,
      costUsd,
      latencyMs,
      error: error ?? undefined,
    });
  }
}

function toScrapePage(
  raw: { url: string; markdown: string; title: string },
  source: "crawl4ai" | "firecrawl",
): ScrapePage {
  const rawLength = raw.markdown.length;
  const truncated = rawLength > PAGE_MARKDOWN_CAP;
  return {
    url: raw.url,
    title: raw.title,
    markdown: truncated ? raw.markdown.slice(0, PAGE_MARKDOWN_CAP) : raw.markdown,
    rawLength,
    truncated,
    source,
    fetchedAt: new Date().toISOString(),
  };
}

function hashParams(params: unknown): string {
  return createHash("sha256").update(stableStringify(params)).digest("hex");
}

function classifyReason(err: unknown): string {
  if (err instanceof HttpError) return `http_${err.status}`;
  const msg = String((err as any)?.message ?? err);
  if (/abort|timeout/i.test(msg)) return "timeout";
  if (/fetch failed|ENOTFOUND|ECONN/i.test(msg)) return "network";
  return "error";
}
