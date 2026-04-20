import { Injectable } from "@nestjs/common";
import pRetry, { AbortError } from "p-retry";
import type { Env } from "../../config/env";
import type { SerpFetchParams } from "./serp.types";
import { HttpError, DataForSeoApiError } from "./dataforseo.errors";

export interface SerpRawItem {
  type: string;
  title?: string;
  url?: string;
  description?: string;
  rank_absolute?: number;
  [k: string]: unknown;
}

export interface SerpRawTask {
  cost?: number;
  status_code?: number;
  result: Array<{ items: SerpRawItem[] }>;
}

export interface SerpRawResponse {
  status_code: number;
  status_message?: string;
  tasks: SerpRawTask[];
}

@Injectable()
export class DataForSeoClient {
  private static readonly BASE = "https://api.dataforseo.com/v3";
  private readonly authHeader: string;

  constructor(env: Pick<Env, "DATAFORSEO_LOGIN" | "DATAFORSEO_PASSWORD">) {
    const token = Buffer.from(`${env.DATAFORSEO_LOGIN}:${env.DATAFORSEO_PASSWORD}`).toString("base64");
    this.authHeader = `Basic ${token}`;
  }

  async serpOrganicLive(params: SerpFetchParams): Promise<SerpRawResponse> {
    const body = [{
      keyword: params.keyword,
      location_code: params.locationCode,
      language_code: params.languageCode,
      depth: params.depth,
    }];

    return pRetry(
      () => this.post("/serp/google/organic/live/regular", body),
      { retries: 2, factor: 2, minTimeout: 500 },
    );
  }

  private async post(path: string, body: unknown): Promise<SerpRawResponse> {
    const res = await fetch(DataForSeoClient.BASE + path, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const err = new HttpError(res.status, text);
      // 4xx non-429 → don't retry
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        throw new AbortError(err);
      }
      throw err;
    }

    const json = (await res.json()) as SerpRawResponse;
    if (json.status_code !== 20000) {
      // API-level error → don't retry
      throw new AbortError(new DataForSeoApiError(json.status_code, json.status_message ?? ""));
    }
    return json;
  }
}
