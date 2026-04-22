import { Injectable } from "@nestjs/common";
import { YoucomApiError } from "./youcom.errors";
import type { YoucomEnv, YoucomResearchRequest, YoucomResearchResponse } from "./youcom.types";

@Injectable()
export class YoucomClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(env: YoucomEnv) {
    if (!env.YOUCOM_API_KEY) {
      throw new Error("YOUCOM_API_KEY is required to use YoucomClient");
    }
    this.apiKey = env.YOUCOM_API_KEY;
    this.baseUrl = env.YOUCOM_BASE_URL;
    this.timeoutMs = env.YOUCOM_TIMEOUT_MS;
  }

  async research(body: YoucomResearchRequest): Promise<YoucomResearchResponse> {
    const endpoint = "/v1/research";
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      method: "POST",
      headers: {
        "X-API-Key": this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new YoucomApiError(res.status, text, endpoint);
    }
    return (await res.json()) as YoucomResearchResponse;
  }
}
