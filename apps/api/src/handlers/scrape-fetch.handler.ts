import { Injectable } from "@nestjs/common";
import pLimit from "p-limit";
import type { StepContext, StepHandler, StepResult } from "../orchestrator/step-handler";
import { FirecrawlClient, FIRECRAWL_COST_PER_SCRAPE } from "../tools/firecrawl/firecrawl.client";
import { ToolCacheService } from "../tools/tool-cache.service";
import { HttpError } from "../tools/http-error";
import { PAGE_MARKDOWN_CAP } from "../tools/firecrawl/scrape.types";
import type { ScrapePage, ScrapeFailure, ScrapeResult } from "@sensai/shared";

interface StepInput {
  urls: string[];
}

@Injectable()
export class ScrapeFetchHandler implements StepHandler {
  readonly type = "tool.scrape";

  constructor(
    private readonly client: FirecrawlClient,
    private readonly cache: ToolCacheService,
  ) {}

  async execute(ctx: StepContext): Promise<StepResult> {
    const input = ctx.step.input as StepInput | null;
    if (!input || !Array.isArray(input.urls) || input.urls.length === 0) {
      throw new Error("tool.scrape requires step.input.urls (set via resume endpoint)");
    }

    const pages: ScrapePage[] = [];
    const failures: ScrapeFailure[] = [];
    let shortCircuit: Error | null = null;

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
        failures.push({
          url,
          reason: classifyReason(err),
          httpStatus: err instanceof HttpError ? err.status : undefined,
        });
      }
    };

    // Probe the first URL serially so an auth/quota 4xx short-circuits the
    // batch before we spend retries/cost on the remaining URLs.
    const [firstUrl, ...restUrls] = input.urls;
    await handleOne(firstUrl);

    if (!shortCircuit && restUrls.length > 0) {
      const limit = pLimit(3);
      await Promise.all(restUrls.map((url) => limit(() => handleOne(url))));
    }

    if (shortCircuit) throw shortCircuit;
    if (pages.length === 0) {
      throw new Error(`All scrape URLs failed (${failures.length} failures)`);
    }

    const result: ScrapeResult = { pages, failures };
    return { output: result };
  }

  private async fetchSingle(url: string, ctx: StepContext): Promise<ScrapePage> {
    return this.cache.getOrSet<ScrapePage>({
      tool: "firecrawl",
      method: "scrape",
      params: { url, formats: ["markdown"], onlyMainContent: true },
      ttlSeconds: 86_400, // 1d per design doc
      runId: ctx.run.id,
      stepId: ctx.step.id,
      fetcher: async () => {
        const t0 = Date.now();
        const raw = await this.client.scrape({ url });
        const rawLength = raw.markdown.length;
        const truncated = rawLength > PAGE_MARKDOWN_CAP;
        const markdown = truncated ? raw.markdown.slice(0, PAGE_MARKDOWN_CAP) : raw.markdown;
        const page: ScrapePage = {
          url: raw.url,
          title: raw.title,
          markdown,
          rawLength,
          truncated,
          source: "firecrawl",
          fetchedAt: new Date().toISOString(),
        };
        return { result: page, costUsd: FIRECRAWL_COST_PER_SCRAPE, latencyMs: Date.now() - t0 };
      },
    });
  }
}

function classifyReason(err: unknown): string {
  if (err instanceof HttpError) return `http_${err.status}`;
  const msg = String((err as any)?.message ?? err);
  if (/abort/i.test(msg)) return "timeout";
  if (/fetch failed|ENOTFOUND|ECONN/i.test(msg)) return "network";
  return "error";
}
