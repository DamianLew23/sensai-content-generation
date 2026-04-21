import { Injectable } from "@nestjs/common";
import pRetry, { AbortError } from "p-retry";
import type { Env } from "../../config/env";
import { HttpError } from "../http-error";
import { FirecrawlApiError } from "./firecrawl.errors";

export interface ScrapeRequestParams {
  url: string;
}

export interface FirecrawlScrapeResult {
  url: string;
  markdown: string;
  title: string;
}

interface FirecrawlRawResponse {
  success: boolean;
  data?: {
    markdown?: string;
    metadata?: {
      title?: string;
      sourceURL?: string;
    };
  };
  error?: string;
}

@Injectable()
export class FirecrawlClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(env: Pick<Env, "FIRECRAWL_API_KEY" | "FIRECRAWL_BASE_URL">) {
    this.apiKey = env.FIRECRAWL_API_KEY;
    this.baseUrl = env.FIRECRAWL_BASE_URL;
  }

  async scrape(params: ScrapeRequestParams): Promise<FirecrawlScrapeResult> {
    return pRetry(
      () => this.postScrape(params.url),
      { retries: 2, factor: 2, minTimeout: 500 },
    );
  }

  private async postScrape(url: string): Promise<FirecrawlScrapeResult> {
    const res = await fetch(`${this.baseUrl}/v2/scrape`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const err = new HttpError(res.status, text);
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        throw new AbortError(err);
      }
      throw err;
    }

    const json = (await res.json()) as FirecrawlRawResponse;
    if (!json.success || !json.data?.markdown) {
      throw new AbortError(new FirecrawlApiError(json.error ?? "response missing markdown"));
    }

    return {
      url: json.data.metadata?.sourceURL ?? url,
      markdown: json.data.markdown,
      title: json.data.metadata?.title ?? "",
    };
  }
}

export const FIRECRAWL_COST_PER_SCRAPE = "0.0015";
// Source: https://firecrawl.dev/pricing — pay-as-you-go /v2/scrape, as of 2026-04-21
