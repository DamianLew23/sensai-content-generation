import { Injectable } from "@nestjs/common";
import type { StepContext, StepHandler, StepResult } from "../orchestrator/step-handler";
import type { RunInput } from "@sensai/shared";
import { DataForSeoClient } from "../tools/dataforseo/dataforseo.client";
import { ToolCacheService } from "../tools/tool-cache.service";
import { SerpFetchParams, type SerpItem, type SerpResult } from "../tools/dataforseo/serp.types";

@Injectable()
export class SerpFetchHandler implements StepHandler {
  readonly type = "tool.serp.fetch";

  constructor(
    private readonly client: DataForSeoClient,
    private readonly cache: ToolCacheService,
  ) {}

  async execute(ctx: StepContext): Promise<StepResult> {
    const input = ctx.run.input as RunInput;
    if (!input.mainKeyword || input.mainKeyword.trim().length === 0) {
      throw new Error("mainKeyword is required for tool.serp.fetch");
    }

    const params = SerpFetchParams.parse({
      keyword: input.mainKeyword.trim(),
      locationCode: 2616, // Poland
      languageCode: "pl",
      depth: 10,
    });

    const result = await this.cache.getOrSet<SerpResult>({
      tool: "dataforseo",
      method: "serp.organic.live",
      params,
      ttlSeconds: 7 * 86400,
      runId: ctx.run.id,
      stepId: ctx.step.id,
      fetcher: async () => {
        const t0 = Date.now();
        const raw = await this.client.serpOrganicLive(params);
        const cost = raw.tasks?.[0]?.cost?.toString() ?? "0";
        const items: SerpItem[] = (raw.tasks?.[0]?.result?.[0]?.items ?? [])
          .filter((it) => it.type === "organic" && it.title && it.url)
          .slice(0, params.depth)
          .map((it) => ({
            title: String(it.title),
            url: String(it.url),
            description: String(it.description ?? ""),
            position: Number(it.rank_absolute ?? 0),
          }));
        return { result: { items }, costUsd: cost, latencyMs: Date.now() - t0 };
      },
    });

    return { output: result };
  }
}
