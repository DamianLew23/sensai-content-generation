import type { OpenAIResponsesClient } from "../../llm/openai-responses.client";
import { dataEnrichVerifyPrompt } from "../../prompts/data-enrich-verify.prompt";
import type {
  ExtractedClaim,
  ClaimVerification,
  VerificationStatus,
  EnrichmentWarning,
} from "@sensai/shared";
import type { ExtractCallCtx } from "./data-enricher.types";

export interface VerifyClaimsArgs {
  llm: OpenAIResponsesClient;
  ctx: ExtractCallCtx;
  model: string;
  keyword: string;
  language: string;
  claims: ExtractedClaim[];
}

export interface VerifyClaimsResult {
  verifications: ClaimVerification[];
  cost: { costUsd: string; latencyMs: number };
  warnings: EnrichmentWarning[];
}

export async function verifyClaims(
  args: VerifyClaimsArgs,
): Promise<VerifyClaimsResult> {
  const warnings: EnrichmentWarning[] = [];

  if (args.claims.length === 0) {
    return {
      verifications: [],
      cost: { costUsd: "0", latencyMs: 0 },
      warnings,
    };
  }

  const userPrompt = dataEnrichVerifyPrompt.user({
    keyword: args.keyword,
    language: args.language,
    claims: args.claims,
    today: new Date().toISOString().slice(0, 10),
  });

  try {
    const res = await args.llm.createBlock({
      ctx: args.ctx,
      model: args.model,
      system: dataEnrichVerifyPrompt.system,
      input: userPrompt,
      tools: [{ type: "web_search_preview" }],
      toolChoice: "auto",
    });

    const map = parseVerificationDict(res.outputText);
    const verifications: ClaimVerification[] = args.claims.map((c) => {
      const v = map[String(c.id)];
      if (!v) {
        return {
          claimId: c.id,
          status: "unverified",
          source: "",
          sourceUrl: "",
          note: "missing from LLM response",
        };
      }
      return {
        claimId: c.id,
        status: normalizeStatus(v.status),
        source: typeof v.source === "string" ? v.source : "",
        sourceUrl: typeof v.source_url === "string" ? v.source_url : "",
        correctedValue:
          typeof v.corrected_value === "string" ? v.corrected_value : undefined,
        note: typeof v.note === "string" ? v.note : "",
      };
    });

    return {
      verifications,
      cost: { costUsd: res.costUsd, latencyMs: res.latencyMs },
      warnings,
    };
  } catch (err) {
    warnings.push({
      kind: "enrich_verify_failed",
      message: `web_search_preview call failed: ${(err as Error).message}`,
      context: { model: args.model },
    });
    const fallback = args.claims.map<ClaimVerification>((c) => ({
      claimId: c.id,
      status: "unverified",
      source: "",
      sourceUrl: "",
      note: "verify call threw",
    }));
    return {
      verifications: fallback,
      cost: { costUsd: "0", latencyMs: 0 },
      warnings,
    };
  }
}

function normalizeStatus(s: unknown): VerificationStatus {
  if (s === "confirmed" || s === "corrected" || s === "unverified") return s;
  return "unverified";
}

interface RawVerification {
  status?: unknown;
  source?: unknown;
  source_url?: unknown;
  corrected_value?: unknown;
  note?: unknown;
}

function parseVerificationDict(text: string): Record<string, RawVerification> {
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "");
  try {
    const obj = JSON.parse(cleaned);
    return coerceObjectMap(obj);
  } catch {
    const match = /\{[\s\S]*\}/.exec(cleaned);
    if (match) {
      try {
        return coerceObjectMap(JSON.parse(match[0]));
      } catch {}
    }
  }
  return {};
}

function coerceObjectMap(obj: unknown): Record<string, RawVerification> {
  if (!obj || typeof obj !== "object") return {};
  const out: Record<string, RawVerification> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (v && typeof v === "object") {
      out[k] = v as RawVerification;
    }
  }
  return out;
}
