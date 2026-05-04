import type { OpenAIResponsesClient } from "../../llm/openai-responses.client";
import { dataEnrichQuestionsPrompt } from "../../prompts/data-enrich-questions.prompt";
import type { ExtractedClaim, EnrichmentWarning } from "@sensai/shared";
import type { ExtractCallCtx } from "./data-enricher.types";

export interface GenerateQuestionsArgs {
  llm: OpenAIResponsesClient;
  ctx: ExtractCallCtx;
  model: string;
  keyword: string;
  language?: string;
  claims: ExtractedClaim[];
}

export interface QuestionsResult {
  claims: ExtractedClaim[];
  cost: { costUsd: string; latencyMs: number };
  warnings: EnrichmentWarning[];
}

export async function generateQuestions(
  args: GenerateQuestionsArgs,
): Promise<QuestionsResult> {
  const warnings: EnrichmentWarning[] = [];

  if (args.claims.length === 0) {
    return {
      claims: args.claims,
      cost: { costUsd: "0", latencyMs: 0 },
      warnings,
    };
  }

  const userPrompt = dataEnrichQuestionsPrompt.user({
    keyword: args.keyword,
    claims: args.claims,
    language: args.language ?? "pl",
  });

  try {
    const res = await args.llm.createBlock({
      ctx: args.ctx,
      model: args.model,
      system: dataEnrichQuestionsPrompt.system,
      input: userPrompt,
    });

    const map = parseJsonDict(res.outputText);

    const enriched = args.claims.map((c) => ({
      ...c,
      question: typeof map[String(c.id)] === "string" && map[String(c.id)]!.length > 0
        ? map[String(c.id)]!
        : c.claimText,
    }));

    return {
      claims: enriched,
      cost: { costUsd: res.costUsd, latencyMs: res.latencyMs },
      warnings,
    };
  } catch (err) {
    warnings.push({
      kind: "enrich_questions_failed",
      message: `gpt-4.1-mini call failed: ${(err as Error).message}`,
      context: { model: args.model },
    });
    const fallback = args.claims.map((c) => ({ ...c, question: c.claimText }));
    return {
      claims: fallback,
      cost: { costUsd: "0", latencyMs: 0 },
      warnings,
    };
  }
}

function parseJsonDict(text: string): Record<string, string> {
  // Strip ```json fences
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "");

  try {
    const obj = JSON.parse(cleaned);
    return coerceStringMap(obj);
  } catch {
    // Fallback: extract last balanced object
    const match = /\{[\s\S]*\}/.exec(cleaned);
    if (match) {
      try {
        const obj = JSON.parse(match[0]);
        return coerceStringMap(obj);
      } catch {}
    }
  }
  return {};
}

function coerceStringMap(obj: unknown): Record<string, string> {
  if (!obj || typeof obj !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}
