import { Inject, Injectable, Logger } from "@nestjs/common";
import { OpenAIResponsesClient } from "../../llm/openai-responses.client";
import { extractClaims } from "./data-enricher.extract";
import { generateQuestions } from "./data-enricher.questions";
import { verifyClaims } from "./data-enricher.verify";
import { insertSources } from "./data-enricher.insert";
import type {
  ExtractedClaim,
  ClaimVerification,
  EnrichmentWarning,
} from "@sensai/shared";
import type { Env } from "../../config/env";
import type { ExtractCallCtx } from "./data-enricher.types";

type ClientEnv = Pick<
  Env,
  | "DATA_ENRICH_VERIFY_MODEL"
  | "DATA_ENRICH_QUESTION_MODEL"
  | "DATA_ENRICH_MAX_CLAIMS"
  | "DATA_ENRICH_MIN_SCORE"
  | "DATA_ENRICH_LOW_CONFIRM_WARNING"
>;

export interface EnrichArgs {
  ctx: ExtractCallCtx;
  keyword: string;
  language: string;
  htmlContent: string;
}

export interface EnrichResult {
  htmlContent: string;
  claims: ExtractedClaim[];
  verifications: ClaimVerification[];
  warnings: EnrichmentWarning[];
  stats: {
    sourcesAdded: number;
    correctionsFlagged: number;
    unverified: number;
  };
  cost: { costUsd: string; latencyMs: number };
}

@Injectable()
export class DataEnrichmentClient {
  private readonly logger = new Logger(DataEnrichmentClient.name);

  constructor(
    private readonly llm: OpenAIResponsesClient,
    @Inject("DATA_ENRICHER_ENV") private readonly env: ClientEnv,
  ) {}

  async enrich(args: EnrichArgs): Promise<EnrichResult> {
    const warnings: EnrichmentWarning[] = [];

    const claims = extractClaims(args.htmlContent, {
      maxClaims: this.env.DATA_ENRICH_MAX_CLAIMS,
      minScore: this.env.DATA_ENRICH_MIN_SCORE,
    });

    if (claims.length === 0) {
      warnings.push({
        kind: "enrich_no_claims_found",
        message: "Regex extractor returned 0 claims at min_score threshold",
        context: { minScore: String(this.env.DATA_ENRICH_MIN_SCORE) },
      });
      return {
        htmlContent: args.htmlContent,
        claims: [],
        verifications: [],
        warnings,
        stats: { sourcesAdded: 0, correctionsFlagged: 0, unverified: 0 },
        cost: { costUsd: "0", latencyMs: 0 },
      };
    }

    const qres = await generateQuestions({
      llm: this.llm,
      ctx: args.ctx,
      model: this.env.DATA_ENRICH_QUESTION_MODEL,
      keyword: args.keyword,
      language: args.language,
      claims,
    });
    warnings.push(...qres.warnings);

    const vres = await verifyClaims({
      llm: this.llm,
      ctx: args.ctx,
      model: this.env.DATA_ENRICH_VERIFY_MODEL,
      keyword: args.keyword,
      language: args.language,
      claims: qres.claims,
    });
    warnings.push(...vres.warnings);

    const verificationsMap = new Map<number, ClaimVerification>();
    for (const v of vres.verifications) verificationsMap.set(v.claimId, v);

    const inserted = insertSources(args.htmlContent, qres.claims, verificationsMap);

    const verifiedCount =
      vres.verifications.filter((v) => v.status !== "unverified").length;
    const ratio =
      qres.claims.length > 0 ? verifiedCount / qres.claims.length : 0;

    if (
      qres.claims.length > 0 &&
      ratio < this.env.DATA_ENRICH_LOW_CONFIRM_WARNING
    ) {
      warnings.push({
        kind: "enrich_low_confirmation_rate",
        message: `Only ${verifiedCount}/${qres.claims.length} claims got a source (${(ratio * 100).toFixed(1)}%)`,
        context: { ratio: ratio.toFixed(3) },
      });
    }

    const totalCost = (
      Number(qres.cost.costUsd) + Number(vres.cost.costUsd)
    ).toFixed(8);
    const totalLatency = qres.cost.latencyMs + vres.cost.latencyMs;

    this.logger.log(
      {
        call: "data.enrich",
        claims: qres.claims.length,
        sourcesAdded: inserted.stats.sourcesAdded,
        correctionsFlagged: inserted.stats.correctionsFlagged,
        unverified: inserted.stats.unverified,
        totalCostUsd: totalCost,
        totalLatencyMs: totalLatency,
      },
      "data enrichment finished",
    );

    return {
      htmlContent: inserted.html,
      claims: qres.claims,
      verifications: vres.verifications,
      warnings,
      stats: inserted.stats,
      cost: { costUsd: totalCost, latencyMs: totalLatency },
    };
  }
}
