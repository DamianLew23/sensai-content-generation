import { Injectable, Logger } from "@nestjs/common";
import { YoucomApiError, YoucomTimeoutError } from "./youcom.errors";
import type { YoucomClientEnv, YoucomResearchRequest, YoucomResearchResponse } from "./youcom.types";

const HARD_TIMEOUT_GRACE_MS = 5_000;

@Injectable()
export class YoucomClient {
  private readonly logger = new Logger(YoucomClient.name);
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
    const url = `${this.baseUrl}${endpoint}`;
    const serialized = JSON.stringify(body);
    this.logger.log(
      {
        url,
        effort: body.research_effort,
        bodyBytes: serialized.length,
        timeoutMs: this.timeoutMs,
        hardTimeoutMs: this.timeoutMs + HARD_TIMEOUT_GRACE_MS,
      },
      "youcom POST start",
    );
    const t0 = Date.now();
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "X-API-Key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: serialized,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err: any) {
      const latencyMs = Date.now() - t0;
      this.logger.error(
        {
          endpoint,
          latencyMs,
          name: err?.name,
          message: err?.message,
          code: err?.code,
        },
        "youcom POST fetch failed",
      );
      throw err;
    }
    const latencyMs = Date.now() - t0;
    this.logger.log(
      {
        endpoint,
        status: res.status,
        ok: res.ok,
        latencyMs,
      },
      "youcom POST response received",
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      this.logger.warn(
        { endpoint, status: res.status, bodyPreview: text.slice(0, 200) },
        "youcom POST non-2xx response",
      );
      throw new YoucomApiError(res.status, text, endpoint);
    }
    const parseStart = Date.now();
    const json = (await res.json()) as YoucomResearchResponse;
    this.logger.log(
      {
        endpoint,
        parseMs: Date.now() - parseStart,
        contentLength: json.output?.content?.length ?? 0,
        sourcesCount: json.output?.sources?.length ?? 0,
      },
      "youcom POST body parsed",
    );
    return json;
  }

  private withHardTimeout<T>(
    work: Promise<T>,
    ms: number,
    endpoint: string,
  ): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const guard = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        this.logger.error(
          { endpoint, hardTimeoutMs: ms },
          "youcom hard timeout fired",
        );
        reject(new YoucomTimeoutError(endpoint, ms));
      }, ms);
    });
    return Promise.race([work, guard]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }
}
