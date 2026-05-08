import { Inject, Injectable, Logger } from "@nestjs/common";
import { createHash } from "node:crypto";
import type {
  StepContext,
  StepHandler,
  StepResult,
} from "../orchestrator/step-handler";
import {
  DisambiguateOutput,
  type ProjectConfig,
  type RunInput,
} from "@sensai/shared";
import { TopicDisambiguatorClient } from "../tools/topic-disambiguator/topic-disambiguator.client";
import { ToolCacheService } from "../tools/tool-cache.service";
import { topicDisambiguatePrompt } from "../prompts/topic-disambiguate.prompt";
import type { Env } from "../config/env";

type HandlerEnv = Pick<Env, "DISAMBIGUATE_TTL_DAYS">;

const PROMPT_VERSION = "v1";

@Injectable()
export class DisambiguateTopicHandler implements StepHandler {
  readonly type = "tool.topic.disambiguate";
  private readonly logger = new Logger(DisambiguateTopicHandler.name);

  constructor(
    private readonly client: TopicDisambiguatorClient,
    private readonly cache: ToolCacheService,
    @Inject("DISAMBIGUATE_HANDLER_ENV") private readonly env: HandlerEnv,
  ) {}

  async execute(ctx: StepContext): Promise<StepResult> {
    const cfg = ctx.project.config as ProjectConfig;
    const input = ctx.run.input as RunInput;

    const system = topicDisambiguatePrompt.system(ctx.project.name, cfg);
    const userPrompt = topicDisambiguatePrompt.user(input);

    const inputHash = sha256(JSON.stringify({
      system,
      userPrompt,
      antiTerms: cfg.antiTerms,
    }));

    const result = await this.cache.getOrSet<DisambiguateOutput>({
      tool: "topic",
      method: "disambiguate",
      params: {
        inputHash,
        promptVersion: PROMPT_VERSION,
      },
      ttlSeconds: this.env.DISAMBIGUATE_TTL_DAYS * 24 * 3600,
      runId: ctx.run.id,
      stepId: ctx.step.id,
      forceRefresh: ctx.forceRefresh,
      fetcher: async () => {
        const first = await this.client.disambiguate({
          ctx: { runId: ctx.run.id, stepId: ctx.step.id, attempt: ctx.attempt },
          system,
          prompt: userPrompt,
        });

        const violation = findAntiTermViolation(first.result, cfg.antiTerms);
        if (!violation) {
          return {
            result: first.result,
            costUsd: first.costUsd,
            latencyMs: first.latencyMs,
          };
        }

        this.logger.warn(
          { runId: ctx.run.id, stepId: ctx.step.id, violation },
          "topic.disambiguate antiTerms violation on first attempt — retrying",
        );

        const retrySystem =
          system +
          `\n\n## RETRY — PIERWSZA PRÓBA NARUSZYŁA GUARD\n` +
          `Poprzednia odpowiedź zawierała zabroniony termin "${violation.term}" w polu "${violation.field}". ` +
          `Wygeneruj nową odpowiedź, która ABSOLUTNIE nie zawiera żadnego z antiTerms w refinedTopic ani w serpQueries.`;

        const second = await this.client.disambiguate({
          ctx: { runId: ctx.run.id, stepId: ctx.step.id, attempt: ctx.attempt + 1 },
          system: retrySystem,
          prompt: userPrompt,
        });

        const stillViolates = findAntiTermViolation(second.result, cfg.antiTerms);
        if (stillViolates) {
          throw new Error(
            `antiterms violation persists after retry: term="${stillViolates.term}" field=${stillViolates.field}. ` +
              `Edit ProjectConfig.antiTerms or refine the topic.`,
          );
        }

        const totalCost = (
          parseFloat(first.costUsd) + parseFloat(second.costUsd)
        ).toFixed(6);

        return {
          result: second.result,
          costUsd: totalCost,
          latencyMs: first.latencyMs + second.latencyMs,
        };
      },
    });

    this.logger.log(
      {
        runId: ctx.run.id,
        stepId: ctx.step.id,
        refinedTopic: result.refinedTopic,
        antiAnglesCount: result.antiAngles.length,
        serpQueriesCount: result.serpQueries.length,
      },
      "topic.disambiguate done",
    );

    return { output: result };
  }
}

interface Violation {
  term: string;
  field: "refinedTopic" | "serpQueries";
}

function findAntiTermViolation(
  out: DisambiguateOutput,
  antiTerms: string[],
): Violation | null {
  if (antiTerms.length === 0) return null;
  const lower = (s: string) => s.toLowerCase();
  const refLower = lower(out.refinedTopic);
  for (const t of antiTerms) {
    const tl = lower(t);
    if (refLower.includes(tl)) return { term: t, field: "refinedTopic" };
    for (const q of out.serpQueries) {
      if (lower(q).includes(tl)) return { term: t, field: "serpQueries" };
    }
  }
  return null;
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
