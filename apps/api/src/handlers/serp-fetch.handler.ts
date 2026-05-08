import { Injectable } from "@nestjs/common";
import type { StepContext, StepHandler, StepResult } from "../orchestrator/step-handler";
import type { RunInput } from "@sensai/shared";
import { DataForSeoClient } from "../tools/dataforseo/dataforseo.client";
import { ToolCacheService } from "../tools/tool-cache.service";
import { SerpFetchParams, type SerpItem, type SerpResult } from "../tools/dataforseo/serp.types";
import { getDisambiguateOutput, getResolvedRunInput } from "../orchestrator/run-input-resolver";
import { canonicalizeUrl } from "../tools/dataforseo/canonical-url";
import { fuseRankings, type RankedQuery } from "../tools/dataforseo/rrf";

const TOP_N_FUSED = 15;
const PER_QUERY_DEPTH = 10;
const LOCATION_CODE_POLAND = 2616;
const LANGUAGE_CODE = "pl";
const CACHE_TTL_SECONDS = 7 * 86400;

interface RawSerpRow {
  title: string;
  url: string;
  description: string;
  rank: number;
  canonicalUrl: string;
}

@Injectable()
export class SerpFetchHandler implements StepHandler {
  readonly type = "tool.serp.fetch";

  constructor(
    private readonly client: DataForSeoClient,
    private readonly cache: ToolCacheService,
  ) {}

  async execute(ctx: StepContext): Promise<StepResult> {
    const dis = getDisambiguateOutput(ctx.previousOutputs);
    const resolved = getResolvedRunInput(ctx.run.input as RunInput, ctx.previousOutputs);

    const queries = this.collectQueries(dis?.serpQueries, resolved.mainKeyword);
    if (queries.length === 0) {
      throw new Error(
        "mainKeyword (or disambiguate.serpQueries[0]) is required for tool.serp.fetch",
      );
    }

    // Fetch each query in parallel. Each call goes through the cache so reruns
    // are free. Cache key is sha256 over the params object (per-query).
    const perQueryRows = await Promise.all(
      queries.map((kw) => this.fetchOneQuery(ctx, kw)),
    );

    // Build a flat lookup table from canonical URL → richest available row,
    // and parallel rankings input for RRF.
    const rowByCanonical = new Map<string, RawSerpRow>();
    const rankings: RankedQuery[] = queries.map((query, qIdx) => {
      const rows = perQueryRows[qIdx];
      const canonicalOrder: string[] = [];
      for (const row of rows) {
        canonicalOrder.push(row.canonicalUrl);
        const existing = rowByCanonical.get(row.canonicalUrl);
        if (!existing) {
          rowByCanonical.set(row.canonicalUrl, row);
        } else if (row.title.length > existing.title.length) {
          // Prefer the row with the more descriptive title when the same
          // URL surfaces in multiple queries.
          rowByCanonical.set(row.canonicalUrl, { ...row, title: row.title });
        }
      }
      return { query, urls: canonicalOrder };
    });

    const fused = fuseRankings(rankings).slice(0, TOP_N_FUSED);

    const items: SerpItem[] = fused.map((f, i) => {
      const row = rowByCanonical.get(f.url)!;
      return {
        title: row.title,
        url: row.url, // original URL, not canonical, for downstream scrape
        description: row.description,
        position: i + 1,
        fusedScore: f.score,
        sourceQueries: Array.from(new Set(f.sourceQueries)),
      };
    });

    const result: SerpResult = { items, queries };
    return { output: result };
  }

  private collectQueries(serpQueries: string[] | undefined, mainKeyword: string | undefined): string[] {
    const candidates = serpQueries && serpQueries.length > 0
      ? serpQueries
      : (mainKeyword ? [mainKeyword] : []);
    const cleaned = candidates.map((q) => q.trim()).filter((q) => q.length > 0);
    // Dedup query strings (case-insensitive) preserving first-seen order.
    const seen = new Set<string>();
    const out: string[] = [];
    for (const q of cleaned) {
      const key = q.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(q);
      }
    }
    return out;
  }

  private async fetchOneQuery(ctx: StepContext, keyword: string): Promise<RawSerpRow[]> {
    const params = SerpFetchParams.parse({
      keyword,
      locationCode: LOCATION_CODE_POLAND,
      languageCode: LANGUAGE_CODE,
      depth: PER_QUERY_DEPTH,
    });

    return this.cache.getOrSet<RawSerpRow[]>({
      tool: "dataforseo",
      method: "serp.organic.live",
      params,
      ttlSeconds: CACHE_TTL_SECONDS,
      runId: ctx.run.id,
      stepId: ctx.step.id,
      forceRefresh: ctx.forceRefresh,
      fetcher: async () => {
        const t0 = Date.now();
        const raw = await this.client.serpOrganicLive(params);
        const cost = raw.tasks?.[0]?.cost?.toString() ?? "0";
        const rows: RawSerpRow[] = (raw.tasks?.[0]?.result?.[0]?.items ?? [])
          .filter((it) => it.type === "organic" && it.title && it.url)
          .slice(0, params.depth)
          .map((it, i) => {
            const url = String(it.url);
            return {
              title: String(it.title),
              url,
              description: String(it.description ?? ""),
              rank: Number(it.rank_absolute ?? i + 1),
              canonicalUrl: canonicalizeUrl(url),
            };
          });
        return { result: rows, costUsd: cost, latencyMs: Date.now() - t0 };
      },
    });
  }
}
