import { Inject, Injectable, Logger } from "@nestjs/common";
import type { StepContext, StepHandler, StepResult } from "../orchestrator/step-handler";
import { QueryFanOutClient } from "../tools/query-fanout/query-fanout.client";
import { DataForSeoClient } from "../tools/dataforseo/dataforseo.client";
import { ToolCacheService } from "../tools/tool-cache.service";
import {
  type FanOutArea,
  type FanOutIntent,
  type QueryFanOutResult,
  QueryFanOutResult as QueryFanOutResultSchema,
  type RunInput,
} from "@sensai/shared";
import type { Env } from "../config/env";

const FANOUT_TTL_DAYS = 7;
const PAA_TTL_DAYS = 30;

const LOCATION_CODES: Record<string, number> = {
  pl: 2616,
  en: 2840,
  de: 2276,
  fr: 2250,
};

type HandlerEnv = Pick<
  Env,
  | "QUERY_FANOUT_LANGUAGE"
  | "QUERY_FANOUT_MODEL"
  | "QUERY_FANOUT_PAA_DEPTH"
  | "QUERY_FANOUT_PAA_MAX_QUESTIONS"
  | "QUERY_FANOUT_PAA_ENABLED"
>;

@Injectable()
export class QueryFanOutHandler implements StepHandler {
  readonly type = "tool.query.fanout";
  private readonly logger = new Logger(QueryFanOutHandler.name);

  constructor(
    private readonly fanout: QueryFanOutClient,
    private readonly dfs: DataForSeoClient,
    private readonly cache: ToolCacheService,
    @Inject("QUERY_FANOUT_ENV") private readonly env: HandlerEnv,
  ) {}

  async execute(ctx: StepContext): Promise<StepResult> {
    const keyword = this.composeKeyword(ctx.run.input as RunInput);
    const language = this.env.QUERY_FANOUT_LANGUAGE;
    const model = this.env.QUERY_FANOUT_MODEL;

    const result = await this.cache.getOrSet<QueryFanOutResult>({
      tool: "query",
      method: "fanout",
      params: {
        keyword,
        language,
        model,
        paaEnabled: this.env.QUERY_FANOUT_PAA_ENABLED,
        paaDepth: this.env.QUERY_FANOUT_PAA_DEPTH,
        paaMax: this.env.QUERY_FANOUT_PAA_MAX_QUESTIONS,
      },
      ttlSeconds: FANOUT_TTL_DAYS * 24 * 3600,
      runId: ctx.run.id,
      stepId: ctx.step.id,
      forceRefresh: ctx.forceRefresh,
      fetcher: async () => {
        const t0 = Date.now();
        let totalCost = 0;

        const paaQuestions = this.env.QUERY_FANOUT_PAA_ENABLED
          ? await this.fetchPaaCached(keyword, language, ctx)
          : [];

        const intentsCall = await this.fanout.generateIntents({
          ctx: { runId: ctx.run.id, stepId: ctx.step.id, attempt: ctx.attempt },
          keyword,
        });
        totalCost += parseFloat(intentsCall.costUsd ?? "0");

        const classifyCall = await this.fanout.classify({
          ctx: { runId: ctx.run.id, stepId: ctx.step.id, attempt: ctx.attempt },
          keyword,
          intents: intentsCall.result.intents,
        });
        totalCost += parseFloat(classifyCall.costUsd ?? "0");

        let paaMapping: QueryFanOutResult["paaMapping"] = [];
        let unmatchedPaa: string[] = [];
        if (paaQuestions.length > 0) {
          const flatAreas = intentsCall.result.intents.flatMap((i) =>
            i.areas.map((a) => ({ id: a.id, topic: a.topic, question: a.question })),
          );
          const paaCall = await this.fanout.assignPaa({
            ctx: { runId: ctx.run.id, stepId: ctx.step.id, attempt: ctx.attempt },
            keyword,
            areas: flatAreas,
            paaQuestions,
          });
          totalCost += parseFloat(paaCall.costUsd ?? "0");
          paaMapping = paaCall.result.assignments;
          unmatchedPaa = paaCall.result.unmatched;
        }

        const classByAreaId = new Map(
          classifyCall.result.classifications.map((c) => [c.areaId, c]),
        );
        const intents: FanOutIntent[] = intentsCall.result.intents.map((i) => ({
          name: i.name,
          areas: i.areas.map((a): FanOutArea => {
            const cls = classByAreaId.get(a.id);
            if (!cls) {
              throw new Error(`classification missing for area ${a.id}`);
            }
            return {
              id: a.id,
              topic: a.topic,
              question: a.question,
              ymyl: a.ymyl,
              classification: cls.classification,
              evergreenTopic:
                cls.classification === "MACRO" ? cls.evergreenTopic : "",
              evergreenQuestion:
                cls.classification === "MACRO" ? cls.evergreenQuestion : "",
            };
          }),
        }));

        const assembled: QueryFanOutResult = {
          metadata: {
            keyword,
            language,
            paaFetched: paaQuestions.length,
            paaUsed: paaQuestions.length > 0,
            createdAt: new Date().toISOString(),
          },
          normalization: intentsCall.result.normalization,
          intents,
          dominantIntent: classifyCall.result.dominantIntent,
          paaMapping,
          unmatchedPaa,
        };

        const validated = QueryFanOutResultSchema.parse(assembled);
        const latencyMs = Date.now() - t0;

        this.logger.log(
          {
            intents: validated.intents.length,
            areas: validated.intents.reduce((acc, i) => acc + i.areas.length, 0),
            paaFetched: validated.metadata.paaFetched,
            paaMapped: validated.paaMapping.length,
            paaUnmatched: validated.unmatchedPaa.length,
            dominantIntent: validated.dominantIntent,
            costUsd: totalCost.toFixed(6),
            latencyMs,
          },
          "query-fanout done",
        );

        return { result: validated, costUsd: totalCost.toFixed(6), latencyMs };
      },
    });

    return { output: result };
  }

  private async fetchPaaCached(
    keyword: string,
    language: string,
    ctx: StepContext,
  ): Promise<string[]> {
    const locationCode = LOCATION_CODES[language] ?? 2616;
    return this.cache.getOrSet<string[]>({
      tool: "dataforseo",
      method: "paa",
      params: {
        keyword,
        languageCode: language,
        locationCode,
        depth: this.env.QUERY_FANOUT_PAA_DEPTH,
      },
      ttlSeconds: PAA_TTL_DAYS * 24 * 3600,
      runId: ctx.run.id,
      stepId: ctx.step.id,
      forceRefresh: ctx.forceRefresh,
      fetcher: async () => {
        const t0 = Date.now();
        const raw = await this.dfs.paaFetch({
          keyword,
          languageCode: language,
          locationCode,
          depth: this.env.QUERY_FANOUT_PAA_DEPTH,
        });
        const titles = raw
          .map((q) => q.title)
          .slice(0, this.env.QUERY_FANOUT_PAA_MAX_QUESTIONS);
        return {
          result: titles,
          costUsd: "0",
          latencyMs: Date.now() - t0,
        };
      },
    });
  }

  private composeKeyword(input: RunInput): string {
    let kw = input.topic;
    if (input.mainKeyword) kw += ` (${input.mainKeyword})`;
    if (input.intent) kw += ` — ${input.intent}`;
    return kw;
  }
}
