import { Injectable } from "@nestjs/common";
import { YoucomApiError, YoucomTimeoutError } from "./youcom.errors";
import type { YoucomClientEnv, YoucomResearchRequest, YoucomResearchResponse } from "./youcom.types";

const HARD_TIMEOUT_GRACE_MS = 5_000;

@Injectable()
export class YoucomClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(env: YoucomClientEnv) {
    if (!env.YOUCOM_API_KEY) {
      throw new Error("YOUCOM_API_KEY is required to use YoucomClient");
    }
    this.apiKey = env.YOUCOM_API_KEY;
    this.baseUrl = env.YOUCOM_BASE_URL;
    this.timeoutMs = env.YOUCOM_TIMEOUT_MS;
  }

  async research(body: YoucomResearchRequest): Promise<YoucomResearchResponse> {
    const endpoint = "/v1/research";
    const hardTimeoutMs = this.timeoutMs + HARD_TIMEOUT_GRACE_MS;
    return this.withHardTimeout(this.doResearch(endpoint, body), hardTimeoutMs, endpoint);
  }

  private async doResearch(
    endpoint: string,
    body: YoucomResearchRequest,
  ): Promise<YoucomResearchResponse> {
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

  private withHardTimeout<T>(
    work: Promise<T>,
    ms: number,
    endpoint: string,
  ): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const guard = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new YoucomTimeoutError(endpoint, ms)),
        ms,
      );
    });
    return Promise.race([work, guard]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }
}
