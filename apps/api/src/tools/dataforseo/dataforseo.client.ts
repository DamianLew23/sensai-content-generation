import { Injectable } from "@nestjs/common";
import pRetry, { AbortError } from "p-retry";
import type { Env } from "../../config/env";
import type { SerpFetchParams } from "./serp.types";
import type { PaaFetchParams, PaaQuestion, PaaRawResponse } from "./paa.types";
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
      () => this.postRaw<SerpRawResponse>("/serp/google/organic/live/regular", body),
      { retries: 2, factor: 2, minTimeout: 500 },
    );
  }

  async paaFetch(params: PaaFetchParams): Promise<PaaQuestion[]> {
    const body = [{
      keyword: params.keyword,
      location_code: params.locationCode,
      language_code: params.languageCode,
      device: "desktop",
      people_also_ask_click_depth: params.depth,
    }];

    const raw = await pRetry(
      () => this.postRaw<PaaRawResponse>("/serp/google/organic/live/advanced", body),
      { retries: 2, factor: 2, minTimeout: 500 },
    );

    const out: PaaQuestion[] = [];
    for (const task of raw.tasks ?? []) {
      for (const result of task.result ?? []) {
        for (const item of result.items ?? []) {
          if (item.type === "people_also_ask") {
            for (const sub of item.items ?? []) {
              if (sub.title) out.push({ title: sub.title });
            }
          }
        }
      }
    }
    const seen = new Set<string>();
    return out.filter((q) => {
      if (seen.has(q.title)) return false;
      seen.add(q.title);
      return true;
    });
  }

  private async postRaw<T extends { status_code: number; status_message?: string }>(
    path: string,
    body: unknown,
  ): Promise<T> {
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
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        throw new AbortError(err);
      }
      throw err;
    }

    const json = (await res.json()) as T;
    if (json.status_code !== 20000) {
      throw new AbortError(new DataForSeoApiError(json.status_code, json.status_message ?? ""));
    }
    return json;
  }
}
