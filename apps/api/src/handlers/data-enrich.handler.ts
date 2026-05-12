import { Inject, Injectable, Logger } from "@nestjs/common";
import { createHash } from "node:crypto";
import type {
  StepContext,
  StepHandler,
  StepResult,
} from "../orchestrator/step-handler";
import { DraftGenerationResult, DataEnrichmentResult } from "@sensai/shared";
import { ToolCacheService } from "../tools/tool-cache.service";
import { DataEnrichmentClient } from "../tools/data-enricher/data-enricher.client";
import { dataEnrichQuestionsPrompt } from "../prompts/data-enrich-questions.prompt";
import { dataEnrichVerifyPrompt } from "../prompts/data-enrich-verify.prompt";
import type { Env } from "../config/env";

type HandlerEnv = Pick<
  Env,
  | "DATA_ENRICH_VERIFY_MODEL"
  | "DATA_ENRICH_QUESTION_MODEL"
  | "DATA_ENRICH_MAX_CLAIMS"
  | "DATA_ENRICH_MIN_SCORE"
  | "DATA_ENRICH_LOW_CONFIRM_WARNING"
  | "DATA_ENRICH_TTL_DAYS"
>;

const PROMPT_VERSION = "v1";

@Injectable()
export class DataEnrichHandler implements StepHandler {
  readonly type = "tool.data.enrich";
  private readonly logger = new Logger(DataEnrichHandler.name);

  constructor(
    private readonly client: DataEnrichmentClient,
    private readonly cache: ToolCacheService,
    @Inject("DATA_ENRICH_HANDLER_ENV") private readonly env: HandlerEnv,
  ) {}

  async execute(ctx: StepContext): Promise<StepResult> {
    const prev = ctx.previousOutputs.draftGen;
    if (prev === undefined || prev === null) {
      throw new Error("data.enrich requires previousOutputs.draftGen");
    }
    const draft = DraftGenerationResult.parse(prev);
    const draftHash = sha256(draft.htmlContent);

    const result = await this.cache.getOrSet<DataEnrichmentResult>({
      tool: "data",
      method: "enrich",
      params: {
        draftHash,
        verifyModel: this.env.DATA_ENRICH_VERIFY_MODEL,
        questionModel: this.env.DATA_ENRICH_QUESTION_MODEL,
        maxClaims: this.env.DATA_ENRICH_MAX_CLAIMS,
        minScore: this.env.DATA_ENRICH_MIN_SCORE,
        promptVersion: PROMPT_VERSION,
      },
      ttlSeconds: this.env.DATA_ENRICH_TTL_DAYS * 24 * 3600,
      runId: ctx.run.id,
      stepId: ctx.step.id,
      forceRefresh: ctx.forceRefresh,
      fetcher: async () => {
        const enriched = await this.client.enrich({
          ctx: { runId: ctx.run.id, stepId: ctx.step.id, attempt: ctx.attempt },
          keyword: draft.meta.keyword,
          language: draft.meta.language,
          htmlContent: draft.htmlContent,
        });

        const out: DataEnrichmentResult = {
          meta: {
            keyword: draft.meta.keyword,
            language: draft.meta.language,
            verifyModel: this.env.DATA_ENRICH_VERIFY_MODEL,
            questionModel: this.env.DATA_ENRICH_QUESTION_MODEL,
            generatedAt: new Date().toISOString(),
          },
          htmlContent: enriched.htmlContent,
          claims: enriched.claims,
          verifications: enriched.verifications,
          stats: {
            totalClaimsFound: enriched.claims.length,
            claimsVerified: enriched.verifications.filter(
              (v) => v.status !== "unverified",
            ).length,
            sourcesAdded: enriched.stats.sourcesAdded,
            correctionsFlagged: enriched.stats.correctionsFlagged,
            unverified: enriched.stats.unverified,
            totalCostUsd: enriched.cost.costUsd,
            totalLatencyMs: enriched.cost.latencyMs,
          },
          warnings: enriched.warnings,
        };

        DataEnrichmentResult.parse(out); // self-check before caching

        return {
          result: out,
          costUsd: enriched.cost.costUsd,
          latencyMs: enriched.cost.latencyMs,
        };
      },
    });

    if (result.warnings.length > 0) {
      this.logger.warn(
        { runId: ctx.run.id, stepId: ctx.step.id, warnings: result.warnings },
        `data.enrich: ${result.warnings.length} warnings`,
      );
    }

    this.logger.log(
      {
        runId: ctx.run.id,
        stepId: ctx.step.id,
        claims: result.stats.totalClaimsFound,
        verified: result.stats.claimsVerified,
        sourcesAdded: result.stats.sourcesAdded,
        unverified: result.stats.unverified,
        totalCostUsd: result.stats.totalCostUsd,
      },
      "data.enrich done",
    );

    // Rebuild prompts for the 2 LLM stages (questions + verify).
    const claims = result.claims;
    const stage1User = dataEnrichQuestionsPrompt.user({
      keyword: draft.meta.keyword,
      claims,
      language: draft.meta.language,
    });
    const stage2User = dataEnrichVerifyPrompt.user({
      keyword: draft.meta.keyword,
      language: draft.meta.language,
      claims,
      today: new Date().toISOString().slice(0, 10),
    });

    return {
      output: result,
      input: {
        kind: "llm.prompt",
        promptVersion: PROMPT_VERSION,
        system: dataEnrichQuestionsPrompt.system,
        userBlocks: [
          { label: "Stage 1: questions — user", body: stage1User },
          {
            label: "Stage 2: verify — user (system + web_search tool)",
            body: stage2User,
          },
        ],
        userNote: `2-etapowy pipeline: (1) ${this.env.DATA_ENRICH_QUESTION_MODEL} generuje pytania verifikacyjne; (2) ${this.env.DATA_ENRICH_VERIFY_MODEL} z web_search weryfikuje. System prompt powyżej to stage 1; stage 2 ma osobny system prompt (sprawdź data-enrich-verify.prompt.ts).`,
      },
    };
  }
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
