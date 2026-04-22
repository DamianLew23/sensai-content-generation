import { Injectable } from "@nestjs/common";
import type { Env } from "../../config/env";
import { HttpError } from "../http-error";
import { Crawl4aiApiError } from "./crawl4ai.errors";

export interface ScrapeRequestParams {
  url: string;
}

export interface Crawl4aiScrapeResult {
  url: string;
  markdown: string;
  title: string;
}

interface Crawl4aiRawResponse {
  success?: boolean;
  markdown?: string;
  title?: string;
  url?: string;
  error?: string;
}

@Injectable()
export class Crawl4aiClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(env: Pick<Env, "CRAWL4AI_BASE_URL" | "CRAWL4AI_TIMEOUT_MS">) {
    this.baseUrl = env.CRAWL4AI_BASE_URL;
    this.timeoutMs = env.CRAWL4AI_TIMEOUT_MS;
  }

  async scrape(params: ScrapeRequestParams): Promise<Crawl4aiScrapeResult> {
    const res = await fetch(`${this.baseUrl}/md`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: params.url }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new HttpError(res.status, text);
    }

    const json = (await res.json()) as Crawl4aiRawResponse;
    const markdown = json.markdown ?? "";
    if (!markdown) {
      throw new Crawl4aiApiError(json.error ?? "response missing markdown");
    }

    return {
      url: json.url ?? params.url,
      markdown,
      title: json.title ?? "",
    };
  }
}

export const CRAWL4AI_COST_PER_SCRAPE = "0";
